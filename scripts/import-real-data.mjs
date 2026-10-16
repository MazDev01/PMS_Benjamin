// ── นำเข้าข้อมูลจริงจากไฟล์ CSV (สาขา · เป้าบริษัท) ────────────────
//
// ใช้:  node scripts/import-real-data.mjs <โฟลเดอร์ csv>            → ตรวจอย่างเดียว ไม่เขียนอะไร
//       node scripts/import-real-data.mjs <โฟลเดอร์ csv> --เขียนจริง → เขียนลงฐานข้อมูล
//
// ⚠️ กติกาที่ห้ามแก้:
//   1) ค่าเริ่มต้นคือ "ตรวจอย่างเดียว" เสมอ — ต้องพิมพ์ --เขียนจริง ถึงจะเขียน
//      (นำเข้าข้อมูลจริงผิดแล้วย้อนยาก ต้องให้คนเห็นผลตรวจก่อนตัดสินใจ)
//   2) ตรวจ "ทุกแถวให้จบก่อน" แล้วค่อยเขียน — ไม่ใช่เขียนไปตรวจไป
//      ไม่งั้นพังกลางทางจะได้ข้อมูลครึ่ง ๆ กลาง ๆ ที่ไม่มีใครรู้ว่าถึงแถวไหน
//   3) พิมพ์ให้เห็นทุกครั้งว่ากำลังจะเขียนลงฐานข้อมูลชุดไหน
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const โฟลเดอร์ = process.argv[2];
const เขียนจริง = process.argv.includes("--เขียนจริง") || process.argv.includes("--write");
if (!โฟลเดอร์) { console.error("ต้องระบุโฟลเดอร์ที่เก็บไฟล์ CSV"); process.exit(1); }

// ── อ่านค่าตั้งค่าเซิร์ฟเวอร์ ──────────────────────────────────────────────────
const envFile = fs.readFileSync("apps/hq/.env.local", "utf8");
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(l => l.includes("=") && !l.startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน apps/hq/.env.local"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// ── ตัวอ่าน CSV แบบง่าย (รองรับค่าที่มีลูกน้ำในเครื่องหมายคำพูด) ─────────────────
function อ่านCsv(ไฟล์) {
  if (!fs.existsSync(ไฟล์)) return null;
  const บรรทัด = fs.readFileSync(ไฟล์, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  const แยก = (l) => {
    const out = []; let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out.map(s => s.trim());
  };
  const หัว = แยก(บรรทัด[0]);
  return บรรทัด.slice(1).map((l, i) => {
    const c = แยก(l); const row = { __แถว: i + 2 };
    หัว.forEach((h, j) => row[h] = c[j] ?? "");
    return row;
  });
}

const ปัญหา = [];
const เตือน = [];
const ตัวเลข = (v) => Number(String(v ?? "").replace(/[, ฿]/g, ""));

// ── 1) สาขา ─────────────────────────────────────────────────────────────────
const สาขา = อ่านCsv(path.join(โฟลเดอร์, "สาขา.csv")) ?? [];
const รหัสที่เจอ = new Set();
for (const r of สาขา) {
  const code = String(r["รหัสสาขา"] || "").toUpperCase();
  const ที่ = `สาขา.csv แถว ${r.__แถว}`;
  if (!/^[A-Z]{3}$/.test(code)) ปัญหา.push(`${ที่}: รหัสสาขาต้องเป็นตัวอักษรอังกฤษ 3 ตัว (ได้ "${r["รหัสสาขา"]}")`);
  if (รหัสที่เจอ.has(code)) ปัญหา.push(`${ที่}: รหัสสาขา ${code} ซ้ำกับแถวก่อนหน้า`);
  รหัสที่เจอ.add(code);
  if (!r["ชื่อสาขา"]) ปัญหา.push(`${ที่}: ยังไม่ได้กรอกชื่อสาขา`);
  if (!r["จังหวัด"]) ปัญหา.push(`${ที่}: ยังไม่ได้กรอกจังหวัด`);
  const เป้า = ตัวเลข(r["เป้ายอดขายทั้งปี"]);
  if (!Number.isFinite(เป้า) || เป้า < 0) ปัญหา.push(`${ที่}: เป้ายอดขายต้องเป็นตัวเลขไม่ติดลบ (ได้ "${r["เป้ายอดขายทั้งปี"]}")`);
  const อีเมล = String(r["อีเมลเข้าระบบ"] || "").trim();
  if (อีเมล && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(อีเมล)) ปัญหา.push(`${ที่}: อีเมลไม่ถูกรูปแบบ ("${อีเมล}")`);
  if (!อีเมล) เตือน.push(`${ที่}: ไม่ได้กรอกอีเมล ระบบจะตั้งให้เป็น ${code.toLowerCase()}@partner-agent.co.th`);
  if (!String(r["รหัสผ่านเริ่มต้น"] || "").trim()) เตือน.push(`${ที่}: ไม่ได้กรอกรหัสผ่าน ระบบจะสุ่มให้แล้วแสดงตอนนำเข้า`);
}

// ── 2) ราคากลาง — ลบแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) ───────────────────────
//   ถ้าในโฟลเดอร์ยังมี ราคากลาง.csv จะเตือนว่าข้าม ไม่นำเข้า
if (fs.existsSync(path.join(โฟลเดอร์, "ราคากลาง.csv"))) เตือน.push("ราคากลาง.csv: แม่แบบเอาออกจากระบบแล้ว — ข้ามไฟล์นี้ ไม่นำเข้า");

// ── 3) เป้าบริษัท ────────────────────────────────────────────────────────────
const เป้าบริษัท = อ่านCsv(path.join(โฟลเดอร์, "เป้าบริษัท.csv")) ?? [];
if (เป้าบริษัท.length > 1) ปัญหา.push("เป้าบริษัท.csv: ต้องมีแถวข้อมูลแถวเดียว");
for (const r of เป้าบริษัท) {
  const ที่ = `เป้าบริษัท.csv แถว ${r.__แถว}`;
  for (const [ชื่อ, มากสุด] of [["เป้ายอดขายทั้งปีของบริษัท", Infinity], ["เป้าอัตราปิดการขาย(%)", 100], ["เป้าติดตามตรงเวลา(%)", 100]]) {
    const v = ตัวเลข(r[ชื่อ]);
    if (!Number.isFinite(v) || v < 0 || v > มากสุด) ปัญหา.push(`${ที่}: ${ชื่อ} ไม่ถูกต้อง (ได้ "${r[ชื่อ]}")`);
  }
}

// ── รายงานผลตรวจ ────────────────────────────────────────────────────────────
console.log(`ฐานข้อมูลปลายทาง : ${url}`);
console.log(`โหมด             : ${เขียนจริง ? "เขียนจริง" : "ตรวจอย่างเดียว (ยังไม่เขียนอะไร)"}`);
console.log(`อ่านได้           : สาขา ${สาขา.length} · เป้าบริษัท ${เป้าบริษัท.length}`);
if (เตือน.length) { console.log("\nข้อสังเกต:"); เตือน.forEach(w => console.log("  - " + w)); }
if (ปัญหา.length) {
  console.log(`\nพบปัญหา ${ปัญหา.length} จุด — ยังนำเข้าไม่ได้:`);
  ปัญหา.forEach(p => console.log("  ! " + p));
  process.exit(1);
}
console.log("\nข้อมูลผ่านการตรวจทั้งหมด");
if (!เขียนจริง) { console.log("ถ้าถูกต้องแล้ว สั่งซ้ำอีกครั้งพร้อม --เขียนจริง"); process.exit(0); }

// ── เขียนลงฐานข้อมูล ────────────────────────────────────────────────────────
// สาขา: เขียนแถวใน dealers ตรง ๆ ที่นี่ แต่ "บัญชีเข้าระบบ" ต้องสร้างผ่านหน้าจอ HQ
// หรือ /api/admin/dealers เพราะขั้นตอนนั้นต้องผูก auth + เก็บสำเนารหัสให้ครบวง
for (const r of สาขา) {
  const code = String(r["รหัสสาขา"]).toUpperCase();
  const { error } = await sb.from("dealers").upsert({
    code, name: r["ชื่อสาขา"], province: r["จังหวัด"], region: r["ภาค"] || "",
    revenue_target: ตัวเลข(r["เป้ายอดขายทั้งปี"]), status: "active",
  });
  console.log(error ? `  ! สาขา ${code}: ${error.message}` : `  สาขา ${code} เรียบร้อย (ยังต้องสร้างบัญชีเข้าระบบที่หน้า ดีลเลอร์)`);
}
for (const r of เป้าบริษัท) {
  const { error } = await sb.from("hq_targets").upsert({
    id: 1,
    annual_target: ตัวเลข(r["เป้ายอดขายทั้งปีของบริษัท"]),
    win_rate_target: ตัวเลข(r["เป้าอัตราปิดการขาย(%)"]),
    on_time_target: ตัวเลข(r["เป้าติดตามตรงเวลา(%)"]),
  });
  console.log(error ? `  ! เป้าบริษัท: ${error.message}` : "  เป้าบริษัท เรียบร้อย");
}
console.log("\nนำเข้าเสร็จแล้ว — ขั้นต่อไป: สร้างบัญชีเข้าระบบให้แต่ละสาขาที่หน้า สำนักงานใหญ่ › ดีลเลอร์");
