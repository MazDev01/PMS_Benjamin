// ── ตัวตรวจ: ใบปรับฐานใหม่ที่แปลงข้อมูล ต้องมีข้อทดสอบซ้อมลงใบแบบ db push (ซ้อมใบ) ─────────────────────────────────
//   คนรวมงานเลือกทาง ข (10 พ.ย. 69): ใบใหม่ตั้งแต่ 0286 ที่มีคำสั่งแปลงข้อมูลระดับบนสุด (update · delete · insert … select)
//     ต้องมีไฟล์ข้อทดสอบใต้ tests/ ที่เรียก ซ้อมใบ( และอ้างชื่อไฟล์ใบนั้น — ซ้อมบนฐานแยกที่มีข้อมูล ไม่ห่อ begin…rollback
//   ใบเก่า (≤ 0285) ไม่ย้อนบังคับ · คำสั่งในตัวฟังก์ชัน/DO ไม่นับ (ฟังก์ชันที่ใบสร้าง ไม่ได้รันตอนลงใบ)
//     ⚠️ DO $$ … update … $$ ระดับบนสุด = รันตอนลงใบ → นับเป็นแปลงข้อมูล
//   PMS_MIGRATIONS_DIR / PMS_TESTS_DIR = โฟลเดอร์จำลอง (ข้อทดสอบ tests/unit/migrationRehearsalCheck.test.ts)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { โครงระดับบน } from "./lib/sqlSetLocal.mjs";

export const เริ่มบังคับ = 286;
const โฟลเดอร์ใบ = process.env.PMS_MIGRATIONS_DIR ?? "supabase/migrations";
const โฟลเดอร์ทดสอบ = process.env.PMS_TESTS_DIR ?? "tests";

/** ใบนี้แปลงข้อมูลตอนลงไหม: คำสั่งระดับบนสุด update/delete/insert…select · หรือ DO block ที่มี update/delete/insert */
export function แปลงข้อมูล(sql) {
  const บน = โครงระดับบน(sql);
  // update มีชื่อย่อได้ (update leads l set …) · คำสั่งเริ่มต้นไฟล์หรือหลัง ;
  if (/(^|;)\s*(update\s+(only\s+)?[\w."]+(\s+(as\s+)?(?!set\b)[\w฀-๿]+)?\s+set\b|delete\s+from\b|insert\s+into\s+[^;]*?\bselect\b)/is.test(บน)) return true;
  // เรียกฟังก์ชันที่สร้างในใบเดียวกันระดับบนสุด (select ชื่อ(…) / perform) — ใบแปลงข้อมูลผ่านฟังก์ชัน (เช่น 0261)
  const ฟังก์ชันในใบ = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:[\w"]+\.)?"?([\w฀-๿]+)"?\s*\(/gi)].map(m => m[1].toLowerCase());
  for (const m of บน.matchAll(/(^|;)\s*select\b([^;]*)/gis))
    if (ฟังก์ชันในใบ.some(f => new RegExp(`(^|[^\\w฀-๿])${f}\\s*\\(`, "i").test(m[2]))) return true;
  // with … update/delete/insert (คำสั่งเริ่มด้วย CTE)
  if (/(^|;)\s*with\b[^;]*?\)\s*(update|delete\s+from|insert\s+into)\b/is.test(บน)) return true;
  // DO $…$ ระดับบนสุด: ตัวบล็อกถูกแทนด้วยช่องว่างใน โครงระดับบน — ดูเนื้อจริงของ DO
  const s = sql.replace(/\r\n/g, "\n");
  for (const m of บน.matchAll(/(^|;)\s*do\b/gi)) {
    const ตัว = s.slice(m.index).match(/do\s+(\$[\w฀-๿]*\$)([\s\S]*?)\1/i);
    if (ตัว && /\b(update\s+(only\s+)?[\w."]+(\s+(as\s+)?(?!set\b)[\w฀-๿]+)?\s+set|delete\s+from|insert\s+into)\b/i.test(ตัว[2])) return true;
    if (ตัว && ฟังก์ชันในใบ.some(f => new RegExp(`(^|[^\\w฀-๿])${f}\\s*\\(`, "i").test(ตัว[2]))) return true;   // DO เรียกฟังก์ชันของใบ (0261)
  }
  return false;
}
function เดิน(d, ออก = []) {
  if (!existsSync(d)) return ออก;
  for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) { if (n !== "node_modules") เดิน(p, ออก); } else if (/\.(ts|mjs|js)$/.test(n)) ออก.push(p); }
  return ออก;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
const ไฟล์ทดสอบ = เดิน(โฟลเดอร์ทดสอบ).map(p => ({ p, t: readFileSync(p, "utf8") })).filter(x => x.t.includes("ซ้อมใบ("));
const ขาด = [];
for (const f of readdirSync(โฟลเดอร์ใบ).filter(n => /^\d{4}_.*\.sql$/.test(n)).sort()) {
  if (Number(f.slice(0, 4)) < เริ่มบังคับ) continue;
  if (!แปลงข้อมูล(readFileSync(path.join(โฟลเดอร์ใบ, f), "utf8"))) continue;
  if (!ไฟล์ทดสอบ.some(x => x.t.includes(f))) ขาด.push(f);
}
if (ขาด.length) {
  console.error(`✗ check-migration-rehearsal: ใบปรับฐานที่แปลงข้อมูล ${ขาด.length} ใบ ยังไม่มีข้อทดสอบซ้อมลงใบแบบ db push:`);
  for (const f of ขาด) console.error(`   ${f}`);
  console.error("   เขียนข้อทดสอบที่เรียก ซ้อมใบ({ ใบ: \"<ชื่อไฟล์ใบ>\", ก่อนลงใบ: <ข้อมูล>, หลังลงใบ: <SQL ตรวจ> }) (scripts/lib/migrationRehearsal.mjs)");
  console.error("   ตัวอย่าง: tests/tools/migration-rehearsal.test.mjs · ใส่ไฟล์ใน tool-suites-tool.spec.ts ให้อยู่ในรอบตรวจเต็ม");
  process.exit(1);
}
console.log(`✓ check-migration-rehearsal: ใบปรับฐานที่แปลงข้อมูลตั้งแต่ ${String(เริ่มบังคับ).padStart(4, "0")} มีข้อทดสอบซ้อมลงใบครบ`);
}
