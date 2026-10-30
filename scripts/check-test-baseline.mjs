// ── ตัวตรวจข้อมูลตั้งต้นของฐานทดสอบ: ห้ามมีอีเมล/เบอร์ที่อาจเป็นของจริง (บอสสั่ง 15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 5) ─────────
//
// tests/fixtures/test-baseline.sql อยู่ในโค้ด = ทุกคนที่เข้าถึง repo อ่านได้ และฐานทดสอบเคยรับข้อมูลจากไฟล์สำรองของฐานที่เป็นระบบจริง
//   กติกา: อีเมลทุกตัว @example.test · เบอร์โทรทุกตัวตามสูตร 000-000-NNNN (เลขหมายที่ไม่มีอยู่จริง)
//   ไฟล์สร้างด้วย scripts/export-test-baseline.mjs ซึ่งแทนค่าด้วยสูตรอยู่แล้ว — ตัวนี้กันคนแก้มือ/สคริปต์ส่งออกพลาด
//
// ใช้: node scripts/check-test-baseline.mjs [ไฟล์ · ค่าตั้งต้น tests/fixtures/test-baseline.sql]   (อยู่ใน pnpm checks)
import { readFileSync, existsSync } from "node:fs";

const ไฟล์ = process.argv[2] ?? "tests/fixtures/test-baseline.sql";
if (!existsSync(ไฟล์)) { console.log(`check-test-baseline: ไม่มี ${ไฟล์} — ข้าม`); process.exit(0); }
const บรรทัด = readFileSync(ไฟล์, "utf8").split(/\r?\n/);

const อีเมล = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
// เบอร์ไทย: 0X-XXX-XXXX / 0XX-XXX-XXXX / ติดกัน 9–10 หลัก / +66 — ไม่จับเลขที่ยาวกว่านั้น (เลขผู้เสียภาษี 13 หลัก · จำนวนเงิน)
const เบอร์ = /(?<![\d.])(?:\+66[- ]?\d{1,2}|0\d{1,2})[- ]?\d{3}[- ]?\d{3,4}(?![\d.])/g;
const เบอร์ตามสูตร = /^000-000-\d{4}$/;

const ผิด = [];
บรรทัด.forEach((l, i) => {
  for (const m of l.matchAll(อีเมล)) if (!/@example\.test$/i.test(m[0])) ผิด.push(`${i + 1}: อีเมลไม่ใช่ @example.test (${m[0].replace(/^[^@]+/, "…")})`);
  for (const m of l.matchAll(เบอร์)) if (!เบอร์ตามสูตร.test(m[0])) ผิด.push(`${i + 1}: เบอร์ไม่ตรงสูตร 000-000-NNNN (${m[0].slice(0, 3)}…)`);
});
// ── จำนวนเงินต้องตรงสูตร (บอสสั่ง 15 ต.ค. 69 · ห้ามเก็บยอดจริง) — สูตรเดียวกับ scripts/export-test-baseline.mjs ──────────
//   n = ลำดับแถวในไฟล์ (เริ่ม 1) · ใบ 100,000×n (ต้นทุน 60,000×n · รายการย่อย qty 1 ผลรวม = ยอด · ภาษีคิดจากยอด · ประวัติ ยอด+10,000×ลำดับ)
//   ลีด/ลูกค้า 100,000×n · เป้าดีลเลอร์ 10,000,000×n · เป้า HQ 100,000,000 · แค็ตตาล็อก 1,000×n (ประวัติ −100×ลำดับ)
const ข้อความ = บรรทัด.join("\n");
const แถวของ = t => {
  const a = ข้อความ.indexOf(`null::public.${t}, $fx$`);
  if (a < 0) return [];
  return JSON.parse(ข้อความ.slice(ข้อความ.indexOf("$fx$", a) + 4, ข้อความ.indexOf("$fx$::jsonb", a)));
};
const เงิน = (t, n, ช่อง, ได้, ควร) => { if (Number(ได้) !== ควร) ผิด.push(`${t} แถว ${n}: ${ช่อง} ไม่ตรงสูตร (ควรเป็น ${ควร.toLocaleString("en-US")})`); };
แถวของ("quotations").forEach((q, i) => {
  const n = i + 1, ยอด = 100_000 * n;
  เงิน("quotations", n, "total_value", q.total_value, ยอด);
  if (q.total !== `฿${ยอด.toLocaleString("en-US")}`) ผิด.push(`quotations แถว ${n}: total ไม่ตรงสูตร`);
  if (q.material_cost != null) เงิน("quotations", n, "material_cost", q.material_cost, 60_000 * n);
  if (Array.isArray(q.line_items) && q.line_items.length) {
    if (q.line_items.some(x => Number(x.qty) !== 1)) ผิด.push(`quotations แถว ${n}: รายการย่อยต้อง qty 1`);
    q.line_items.forEach((x, j) => เงิน("quotations", n, `line_items[${j}].unitPrice`, x.unitPrice, j === 0 ? ยอด - 1_000 * (q.line_items.length - 1) : 1_000));
  }
  if (q.vat_amount != null) {
    const vat = Math.round(ยอด * Number(q.vat_percent ?? 0)) / 100, wht = Math.round(ยอด * Number(q.wht_rate ?? 0)) / 100;
    เงิน("quotations", n, "vat_amount", q.vat_amount, vat); เงิน("quotations", n, "total_amount", q.total_amount, ยอด + vat);
    เงิน("quotations", n, "wht_amount", q.wht_amount, wht); เงิน("quotations", n, "net_payable", q.net_payable, ยอด + vat - wht);
  }
  (Array.isArray(q.price_history) ? q.price_history : []).forEach((h, j) => เงิน("quotations", n, `price_history[${j}]`, h.price, ยอด + 10_000 * (j + 1)));
});
แถวของ("leads").forEach((r, i) => เงิน("leads", i + 1, "value", r.value, 100_000 * (i + 1)));
แถวของ("customers").forEach((r, i) => เงิน("customers", i + 1, "total_value", r.total_value, 100_000 * (i + 1)));
แถวของ("dealers").forEach((r, i) => เงิน("dealers", i + 1, "revenue_target", r.revenue_target, 10_000_000 * (i + 1)));
แถวของ("hq_targets").forEach((r, i) => เงิน("hq_targets", i + 1, "annual_target", r.annual_target, 100_000_000));
แถวของ("master_catalog").forEach((m, i) => {
  const ราคา = 1_000 * (i + 1);
  เงิน("master_catalog", i + 1, "price", m.price, ราคา);
  (Array.isArray(m.price_history) ? m.price_history : []).forEach((h, j) => เงิน("master_catalog", i + 1, `price_history[${j}]`, h.price, ราคา - 100 * (j + 1)));
  if (m.subtype_prices && Object.keys(m.subtype_prices).length) ผิด.push(`master_catalog แถว ${i + 1}: subtype_prices ต้องว่าง (ยังไม่มีสูตร)`);
});

// ── จังหวัดตรงรายชื่อ 77 จังหวัด + ดีลเลอร์ 1 จังหวัดพอดี (ใบ 0259 · คนรวมงานเจอ 30 ต.ค. 69) ───────────────────────────────
//   ไฟล์ใส่แบบปิดตัวดัก → ตัวกันของฐานไม่ทำงานตอนโหลด: BKK เคยเป็น "กรุงเทพฯ" (ชื่อย่อ · ฐานปฏิเสธ) และไม่มีแถวพื้นที่
//   ข้อทดสอบที่รันบนข้อมูลตั้งต้นจึงเห็นข้อมูลที่ระบบจริงสร้างไม่ได้ — ตัวนี้กันไม่ให้กลับมา
//   รายชื่อมาตรฐานอ่านจากใบ 0195 (ตาราง th_provinces) · ว่าง = ได้ · "ทุกจังหวัด" = ได้ (ผู้สนใจทั่วประเทศ · แถว HQ — ใบ 0259)
const ใบจังหวัด = "supabase/migrations/0195_dealer_territories.sql";
if (existsSync(ใบจังหวัด)) {
  const ใบ = readFileSync(ใบจังหวัด, "utf8");
  const เริ่ม = ใบ.indexOf("insert into public.th_provinces");
  const จังหวัด = new Set([...ใบ.slice(เริ่ม, ใบ.indexOf(";", เริ่ม)).matchAll(/\(\s*'([^']+)'\s*,\s*'[^']*'\s*\)/g)].map(m => m[1]));
  if (จังหวัด.size !== 77) ผิด.push(`อ่านรายชื่อจังหวัดจาก ${ใบจังหวัด} ได้ ${จังหวัด.size} จังหวัด (ควร 77) — ตัวตรวจอ่านใบผิด`);
  const ผิดจังหวัด = new Map();
  for (const m of ข้อความ.matchAll(/"province":"([^"]*)"/g)) {
    const p = m[1];
    if (p && p !== "ทุกจังหวัด" && !จังหวัด.has(p)) ผิดจังหวัด.set(p, (ผิดจังหวัด.get(p) ?? 0) + 1);
  }
  for (const [p, n] of ผิดจังหวัด) ผิด.push(`จังหวัด "${p}" ไม่อยู่ในรายชื่อ 77 จังหวัด (${n} แถว) — ฐานไม่รับชื่อนี้แล้ว (ใบ 0259)`);
  const พื้นที่ = แถวของ("dealer_territories");
  for (const d of แถวของ("dealers")) {
    if (d.code === "HQ") continue;
    const ของ = พื้นที่.filter(t => t.dealer_code === d.code).map(t => t.province);
    if (ของ.length !== 1 || ของ[0] !== d.province)
      ผิด.push(`ดีลเลอร์ ${d.code} (จังหวัด ${d.province ?? "ว่าง"}): พื้นที่ต้องมี 1 แถว = จังหวัดที่ตั้ง แต่มี [${ของ.join(", ") || "ไม่มี"}] (ใบ 0259)`);
  }
}

if (ผิด.length) {
  console.error(`❌ check-test-baseline: ${ไฟล์} ไม่ตรงกติกา ${ผิด.length} จุด — ส่งออกใหม่ด้วย scripts/export-test-baseline.mjs (ข้อมูลที่อาจเป็นของจริง · จังหวัด/พื้นที่ไม่ตรงกติกาฐาน)`);
  for (const x of ผิด.slice(0, 20)) console.error(`   ${x}`);
  process.exit(1);
}
console.log(`check-test-baseline: ผ่าน (${ไฟล์} · อีเมล @example.test · เบอร์ 000-000-NNNN · จำนวนเงินตรงสูตร · จังหวัดตรง 77 จังหวัด · ดีลเลอร์ 1 จังหวัดพอดี)`);
