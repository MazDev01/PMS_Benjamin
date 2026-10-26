// ── ส่งออก "ข้อมูลตั้งต้นของฐานทดสอบ" เป็นไฟล์ในโค้ด (ก่อนขึ้นระบบจริง ข้อ 5 · 15 ต.ค. 69) ─────────────────────────
//
// ทำไม: ฐานทดสอบหลัก (pms-dbcheck) ได้ข้อมูลตั้งต้นมาจากการกู้ชุดสำรองของฐานทดสอบเดิม — สร้างซ้ำจากศูนย์ไม่ได้
//   ตัวนี้ดึงเฉพาะข้อมูลตั้งต้น (ไม่ใช่ของที่ข้อทดสอบสร้างเอง: ZZ…/Z…) ออกเป็น tests/fixtures/test-baseline.sql
//   แล้ว scripts/reset-test-db.mjs ใส่กลับหลังลงใบทั้งหมด → reset → seed → ผลชุดทดสอบเท่าเดิม
//
// ⚠️ ไม่คัดลอกข้อความระบุตัวตนจากฐาน — ฐานทดสอบเคยรับข้อมูลจากไฟล์สำรองของ "ฐานเดิม" (ก่อนแยกฐาน 11 ส.ค. 69 = ฐานที่เป็นระบบจริง)
//   บอสสั่ง 15 ต.ค. 69: ชื่อดีลเลอร์/ลูกค้า/ที่อยู่/ผู้ติดต่อ/บันทึก สร้างใหม่ด้วยสูตรทั้งหมด · อีเมลทุกช่อง @example.test
//   · เบอร์ทุกช่อง 000-000-NNNN — scripts/check-test-baseline.mjs ตรวจซ้ำใน pnpm checks + CI
//   เก็บจากฐานเฉพาะโครง (สถานะ · จำนวนเงิน · วันที่ · จังหวัด/ภาค · ความสัมพันธ์ระหว่างแถว) และแค็ตตาล็อกสินค้าของบริษัท
// ไม่ส่งออก: บัญชีเข้าระบบ/โปรไฟล์ (reset-test-db สร้างจาก tests/.env.test) · สำเนารหัสผ่าน · บันทึกการใช้งาน · ตัวนับคำขอ ·
//   กล่องอีเมล · ไฟล์แนบ
//
// ใช้ (ฐานในเครื่องเท่านั้น): node scripts/export-test-baseline.mjs [ชื่อคอนเทนเนอร์ · ค่าตั้งต้น supabase_db_pms-dbcheck]
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { อาร์กิวเมนต์psql } from "./lib/testDbGuard.mjs";

const c = process.argv[2] ?? "supabase_db_pms-dbcheck";
const psql = sql => execFileSync("docker", [...อาร์กิวเมนต์psql(c, { เขียน: false }), "-X", "-q", "-A", "-t"],
  { input: sql, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const คอลัมน์ = t => psql(`select string_agg(quote_ident(column_name), ',' order by ordinal_position) from information_schema.columns
  where table_schema = 'public' and table_name = '${t}' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS';`).trim();
const อ่าน = (t, where, order) => JSON.parse(psql(`select coalesce(jsonb_agg(to_jsonb(x) order by ${order}), '[]') from public.${t} x where ${where};`) || "[]");

// ── สูตร ────────────────────────────────────────────────────────────────────────────────────────────
const n3 = n => String(n).padStart(3, "0");
let เบอร์ถัดไป = 0;
const เบอร์ = () => `000-000-${String(++เบอร์ถัดไป).padStart(4, "0")}`;
const มีค่า = v => v !== null && v !== undefined && v !== "";
const แทนถ้ามี = (v, ใหม่) => (มีค่า(v) ? ใหม่ : v);
// ชื่อพนักงานขาย/ผู้ทำงาน: ชื่อเดิมต่างกัน → ชื่อใหม่ต่างกัน (ตัวกรอง "ผู้รับผิดชอบ" ยังแยกได้) แต่ไม่เหลือชื่อเดิม
const คนทดสอบ = new Map();
const พนักงาน = (v, code) => {
  if (!มีค่า(v)) return v;
  const k = `${code}|${v}`;
  if (!คนทดสอบ.has(k)) คนทดสอบ.set(k, `พนักงานขายทดสอบ ${code}-${[...คนทดสอบ.keys()].filter(x => x.startsWith(code + "|")).length + 1}`);
  return คนทดสอบ.get(k);
};
const ผู้ออกเอกสาร = code => ({ company: `บริษัท ดีลเลอร์ทดสอบ ${code} จำกัด`, address: `ที่อยู่ทดสอบ ดีลเลอร์ ${code}`,
  email: `${code.toLowerCase()}@example.test`, phone: `000-000-${code.split("").map(ch => ch.charCodeAt(0) % 10).join("").padEnd(4, "0")}`,
  taxId: "0000000000000", website: "" });

// ── อ่าน + แทนค่า ─────────────────────────────────────────────────────────────────────────────────────
const NZ = "dealer_code not like 'Z%'";
const dealers = อ่าน("dealers", "code not like 'Z%'", "code").map(d => ({ ...d, name: `ดีลเลอร์ทดสอบ ${d.code}` }));
const dealer_settings = อ่าน("dealer_settings", NZ, "dealer_code").map(s => ({
  ...s, issuer: ผู้ออกเอกสาร(s.dealer_code), logo: แทนถ้ามี(s.logo, ""), wordmark: แทนถ้ามี(s.wordmark, `ดีลเลอร์ทดสอบ ${s.dealer_code}`),
  document: s.document && Object.fromEntries(Object.entries(s.document).map(([k, v]) =>
    ["header", "footer", "terms", "termsAndConditions"].includes(k) ? [k, แทนถ้ามี(v, `ข้อความเอกสารทดสอบ ${s.dealer_code}`)]
      : ["signature", "stamp"].includes(k) ? [k, แทนถ้ามี(v, "")] : [k, v])),
}));

const customers = อ่าน("customers", `${NZ} and company not like 'ZZ%'`, "id");
const ชื่อลูกค้า = new Map();
customers.forEach((r, i) => {
  const n = n3(i + 1);
  ชื่อลูกค้า.set(`${r.dealer_code}|${r.id}`, `ลูกค้าทดสอบ ${n}`);
  Object.assign(r, {
    name: `ผู้ติดต่อทดสอบ C${n}`, company: `ลูกค้าทดสอบ ${n}`, email: `cust-${n}@example.test`, phone: เบอร์(),
    address: แทนถ้ามี(r.address, `ที่อยู่ทดสอบ C${n}`), owner: พนักงาน(r.owner, r.dealer_code), initials: "ทส", logo: แทนถ้ามี(r.logo, ""),
    contacts: Array.isArray(r.contacts) ? r.contacts.map((x, j) => ({ ...x, name: `ผู้ติดต่อทดสอบ C${n}-${j + 1}`,
      email: `cust-${n}-${j + 1}@example.test`, phone: เบอร์(), role: x.role })) : r.contacts,
  });
});

const leads = อ่าน("leads", `${NZ} and company not like 'ZZ%'`, "dealer_code, num_id");
const ลีด = new Map();
leads.forEach((r, i) => {
  const n = n3(i + 1);
  const company = (r.customer_id && ชื่อลูกค้า.get(`${r.dealer_code}|${r.customer_id}`)) || `ลูกค้าเป้าหมายทดสอบ ${n}`;
  Object.assign(r, {
    name: `ผู้ติดต่อทดสอบ L${n}`, contact: แทนถ้ามี(r.contact, `ผู้ติดต่อทดสอบ L${n}`), company, phone: เบอร์(),
    email: แทนถ้ามี(r.email, `lead-${n}@example.test`), address: แทนถ้ามี(r.address, `ที่อยู่ทดสอบ L${n}`),
    project: แทนถ้ามี(r.project, `โครงการทดสอบ L${n}`), note: แทนถ้ามี(r.note, `บันทึกทดสอบ L${n}`), report: แทนถ้ามี(r.report, `รายงานทดสอบ L${n}`),
    assigned: พนักงาน(r.assigned, r.dealer_code), logo: แทนถ้ามี(r.logo, ""),
    activities: Array.isArray(r.activities) ? r.activities.map((a, j) => ({ ...a, text: แทนถ้ามี(a.text, `บันทึกการติดต่อทดสอบ ${j + 1}`) })) : r.activities,
    tasks: Array.isArray(r.tasks) ? r.tasks.map(t => ({ ...t, doneBy: แทนถ้ามี(t.doneBy, "ผู้ใช้ทดสอบ") })) : r.tasks,
  });
  ลีด.set(`${r.dealer_code}|${r.num_id}`, r);
});

const quotations = อ่าน("quotations", `${NZ} and customer not like 'ZZ%'`, "dealer_code, id").map((q, i) => {
  const n = n3(i + 1), l = q.deal_id ? ลีด.get(`${q.dealer_code}|${q.deal_id}`) : null;
  return { ...q, customer: (q.customer_id && ชื่อลูกค้า.get(`${q.dealer_code}|${q.customer_id}`)) || l?.company || `ลูกค้าทดสอบ Q${n}`,
    project: แทนถ้ามี(q.project, l?.project || `โครงการทดสอบ Q${n}`), note: แทนถ้ามี(q.note, `หมายเหตุทดสอบ Q${n}`),
    issuer: q.issuer && typeof q.issuer === "object" ? ผู้ออกเอกสาร(q.dealer_code) : q.issuer };
});

const appointments = อ่าน("appointments", NZ, "id").map((a, i) => {
  const n = n3(i + 1), l = a.lead_id ? ลีด.get(`${a.dealer_code}|${a.lead_id}`) : null;
  return { ...a, company: l?.company ?? `ลูกค้าทดสอบ A${n}`, contact: แทนถ้ามี(a.contact, l?.name ?? `ผู้ติดต่อทดสอบ A${n}`), phone: แทนถ้ามี(a.phone, เบอร์()),
    project: แทนถ้ามี(a.project, l?.project || `โครงการทดสอบ A${n}`), note: แทนถ้ามี(a.note, `บันทึกนัดหมายทดสอบ A${n}`), assigned: พนักงาน(a.assigned, a.dealer_code) };
});

const hq_company = อ่าน("hq_company", "true", "1").map(h => ({ ...h, name: "สำนักงานใหญ่ทดสอบ จำกัด", address: "ที่อยู่ทดสอบ สำนักงานใหญ่",
  tax_id: "0000000000000", phone: "000-000-0000", email: "hq@example.test", website: "https://example.test" }));
const hq_notif_rules = อ่าน("hq_notif_rules", "true", "1").map(h => ({ ...h,
  email_recipients: Array.isArray(h.email_recipients) ? h.email_recipients.map((_, i) => `hq-${i + 1}@example.test`) : h.email_recipients }));

// ── จำนวนเงิน: สูตรตามเลขลำดับแถว (บอสสั่ง 15 ต.ค. 69 · ห้ามเก็บยอดจริง) — กติกาเดียวกับ scripts/check-test-baseline.mjs ──
//   ใบเสนอราคาแถวที่ n: ยอด 100,000×n · ต้นทุน 60,000×n · รายการย่อย qty 1 ทุกรายการ: รายการแรก = ยอด − 1,000×(จำนวนรายการ−1)
//     ที่เหลือรายการละ 1,000 (ผลรวม = ยอดพอดี) · ภาษี/หัก ณ ที่จ่าย คิดจากยอดตามอัตราเดิม · ประวัติราคา = ยอด + 10,000×ลำดับ
//   ลีด 100,000×n · ลูกค้า 100,000×n · เป้าดีลเลอร์ 10,000,000×n · เป้า HQ 100,000,000 · แค็ตตาล็อก 1,000×n (ประวัติ: −100×ลำดับ)
const สูตรเงิน = {
  ใบ: n => 100_000 * n, ต้นทุน: n => 60_000 * n, ลีด: n => 100_000 * n, ลูกค้า: n => 100_000 * n,
  เป้าดีลเลอร์: n => 10_000_000 * n, เป้าHQ: 100_000_000, ราคาแม่แบบ: n => 1_000 * n,
};
const บาท = v => `฿${Number(v).toLocaleString("en-US")}`;
quotations.forEach((q, i) => {
  const n = i + 1, ยอด = สูตรเงิน.ใบ(n);
  q.total_value = ยอด; q.material_cost = แทนถ้ามี(q.material_cost, สูตรเงิน.ต้นทุน(n)); q.total = บาท(ยอด);
  if (Array.isArray(q.line_items) && q.line_items.length) {
    const k = q.line_items.length;
    q.line_items = q.line_items.map((it, j) => ({ ...it, qty: 1, unitPrice: j === 0 ? ยอด - 1_000 * (k - 1) : 1_000 }));
  }
  if (q.vat_amount != null) {
    q.vat_amount = Math.round(ยอด * Number(q.vat_percent ?? 0)) / 100;
    q.total_amount = ยอด + q.vat_amount;
    q.wht_amount = Math.round(ยอด * Number(q.wht_rate ?? 0)) / 100;
    q.net_payable = q.total_amount - q.wht_amount;
  }
  if (Array.isArray(q.price_history)) q.price_history = q.price_history.map((h, j) => ({ ...h, price: ยอด + 10_000 * (j + 1) }));
});
leads.forEach((r, i) => { r.value = String(สูตรเงิน.ลีด(i + 1)); });
customers.forEach((r, i) => { r.total_value = สูตรเงิน.ลูกค้า(i + 1); });
dealers.forEach((d, i) => { d.revenue_target = สูตรเงิน.เป้าดีลเลอร์(i + 1); });
const hq_targets = อ่าน("hq_targets", "true", "1").map(t => ({ ...t, annual_target: สูตรเงิน.เป้าHQ }));
const master_catalog = อ่าน("master_catalog", "true", "id").map((m, i) => ({ ...m,
  image: String(m.image ?? "").startsWith("data:") ? "/templates/factory.svg" : m.image,
  price: สูตรเงิน.ราคาแม่แบบ(i + 1),
  price_history: Array.isArray(m.price_history) ? m.price_history.map((h, j) => ({ ...h, price: สูตรเงิน.ราคาแม่แบบ(i + 1) - 100 * (j + 1) })) : m.price_history,
}));

// ── วันที่: เลื่อนทุกช่องด้วยค่าคงที่เดียวทั้งไฟล์ (ลำดับ/ระยะห่างเหมือนเดิม · ครบสัปดาห์ = วันในสัปดาห์ไม่เปลี่ยน) ─────────
//   รวมวันที่ใน JSON และข้อความวันที่ไทย ("23 ก.ค. 2569")
const เลื่อนวัน = -35;
const เดือนไทย = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const วันไทย = new RegExp(`^(\\d{1,2}) (${เดือนไทย.map(m => m.replace(/\./g, "\\.")).join("|")}) (\\d{4})$`);
const เลื่อน = v => {
  if (Array.isArray(v)) return v.map(เลื่อน);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, เลื่อน(x)]));
  if (typeof v !== "string") return v;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + เลื่อนวัน)).toISOString().slice(0, 10);
  m = v.match(/^(\d{4}-\d{2}-\d{2})([T ])(.*)$/);
  if (m) { const d = new Date(Date.UTC(...m[1].split("-").map((x, i) => i === 1 ? +x - 1 : +x))); d.setUTCDate(d.getUTCDate() + เลื่อนวัน); return d.toISOString().slice(0, 10) + m[2] + m[3]; }
  m = v.match(วันไทย);
  if (m) { const d = new Date(Date.UTC(+m[3] - 543, เดือนไทย.indexOf(m[2]), +m[1] + เลื่อนวัน)); return `${d.getUTCDate()} ${เดือนไทย[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`; }
  return v;
};

const ตาราง = [
  // [ตาราง, เงื่อนไขลบก่อนใส่, แถว] — ลำดับ = แม่ก่อนลูก
  ["dealers", "code not like 'Z%'", dealers],
  ["dealer_territories", NZ, อ่าน("dealer_territories", NZ, "dealer_code, province")],
  ["dealer_settings", NZ, dealer_settings],
  ["dealer_lead_rules", NZ, อ่าน("dealer_lead_rules", NZ, "dealer_code")],
  ["entity_counters", "true", อ่าน("entity_counters", "true", "dealer_code, entity")],
  ["quote_counters", "true", อ่าน("quote_counters", "true", "dealer_code")],
  ["customers", `${NZ} and company not like 'ZZ%'`, customers],
  ["leads", `${NZ} and company not like 'ZZ%'`, leads],
  ["quotations", `${NZ} and customer not like 'ZZ%'`, quotations],
  ["appointments", NZ, appointments],
  // แค็ตตาล็อกสินค้าของบริษัท (ชุดเดียวกับ packages/shared/lib/mock.ts) — รูปอัปโหลด data: → ภาพลายเส้นตั้งต้นของระบบ
  ["master_catalog", "true", master_catalog],
  ["hq_company", "true", hq_company], ["hq_policy", "true", อ่าน("hq_policy", "true", "1")], ["hq_notif_rules", "true", hq_notif_rules],
  ["hq_recruit_settings", "true", อ่าน("hq_recruit_settings", "true", "1")],
  ["hq_sales_journey", "true", อ่าน("hq_sales_journey", "true", "1")], ["hq_targets", "true", hq_targets],
];

let out = `-- ข้อมูลตั้งต้นของฐานทดสอบ — สร้างโดย scripts/export-test-baseline.mjs (อย่าแก้มือ · ส่งออกใหม่แทน)
-- ข้อความระบุตัวตนทั้งหมดสร้างด้วยสูตร (ไม่ได้คัดจากฐาน) · อีเมล @example.test · เบอร์ 000-000-NNNN — ตรวจโดย scripts/check-test-baseline.mjs
-- ใส่หลังลงใบทั้งหมด ด้วย scripts/reset-test-db.mjs (ปิดตัวดัก/กุญแจนอกระหว่างใส่ · ตารางค่าตั้งเดี่ยวลบค่าตั้งต้นก่อน)
set session_replication_role = replica;
`;
let รวม = 0;
for (const [t, where, ดิบ] of ตาราง) {
  const rows = ดิบ.map(เลื่อน);
  const cols = คอลัมน์(t);
  const keep = cols.split(",").map(s => s.replace(/"/g, ""));
  const json = "[\n" + rows.map(r => JSON.stringify(Object.fromEntries(keep.filter(k => k in r).map(k => [k, r[k]])))).join(",\n") + "\n]";
  if (json.includes("$fx$")) throw new Error(`${t}: ข้อมูลมีตัวคั่น $fx$`);
  รวม += rows.length;
  out += `\n-- ${t}: ${rows.length} แถว\ndelete from public.${t} where ${where};\n`;
  if (rows.length) out += `insert into public.${t} (${cols}) select ${cols} from jsonb_populate_recordset(null::public.${t}, $fx$${json}$fx$::jsonb);\n`;
  console.log(`  ${t.padEnd(22)} ${rows.length}`);
}
out += "\nset session_replication_role = origin;\n";
mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("tests/fixtures/test-baseline.sql", out);
console.log(`ส่งออกแล้ว ${รวม} แถว → tests/fixtures/test-baseline.sql`);
