// ── ตัวตรวจ: เครื่องหมายฐานทดสอบ public._pms_test_database (ใบ 0280 · คนรวมงานสั่ง 9 พ.ย. 69) ─────────────────────────────
//
// เครื่องหมายนี้ = "ฐานทดสอบ/ฐาน dev ในเครื่อง" — ตัวกันลบคำขอราคา (quote_requests_no_delete) ยอมให้ชุดล้างข้อมูลทดสอบลบคำขอของสาขาตั้งต้น
//   เฉพาะฐานที่มีตารางนี้ · ฐานจริงต้องไม่มีเด็ดขาด (ถ้ามี = ทางลบคำขอจริงเปิด)
// กติกา (ตก = exit 1):
//   ก. สร้างตาราง (create table … _pms_test_database) ได้ที่ scripts/reset-test-db.mjs ที่เดียว · ไฟล์นั้นต้องสร้างจริง
//   ข. ใบปรับฐาน (supabase/migrations) อ้างชื่อได้เฉพาะ to_regclass('public._pms_test_database') หรือบรรทัดหมายเหตุ (--) · ใบ 0280 ต้องใช้ to_regclass
//   ค. ชุดล้างเว็บจริง (tests/prod-live/**) · สคริปต์ที่ชี้ฐานจริง (scripts/db-push-prod.mjs · scripts/prod-*.mjs · scripts/lib/prod*.mjs) ห้ามมีชื่อนี้เลย
//   ง. ข้อทดสอบ SQL (supabase/tests) ห้ามสร้าง/ลบตาราง (เปลี่ยนชื่อชั่วคราวในทรานแซกชันที่ย้อนกลับได้)
// PMS_TDM_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบ tests/tools/test-db-marker.test.mjs)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ชื่อ = "_pms_test_database";
const ราก = process.env.PMS_TDM_ROOT ? path.resolve(process.env.PMS_TDM_ROOT) : process.cwd();
const ที่ตรวจ = ["scripts", "supabase", "tests", "apps", "packages"];
function เดิน(d, ออก = []) {
  if (!existsSync(d)) return ออก;
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules" && !n.startsWith(".next") && n !== "test-results") เดิน(p, ออก); }
    else if (/\.(sql|mjs|js|ts|tsx|cjs)$/.test(n)) ออก.push(path.relative(ราก, p).split(path.sep).join("/"));
  }
  return ออก;
}
const ไฟล์ = process.env.PMS_TDM_ROOT ? ที่ตรวจ.flatMap(d => เดิน(path.join(ราก, d)))
  : ไฟล์ที่gitเก็บ(ที่ตรวจ, { ext: /\.(sql|mjs|js|ts|tsx|cjs)$/ }).map(f => f.replace(/\\/g, "/"));

const ตัวสร้าง = "scripts/reset-test-db.mjs";
const ตัวเอง = new Set(["scripts/check-test-db-marker.mjs", "tests/tools/test-db-marker.test.mjs"]);
const ฐานจริง = f => f.startsWith("tests/prod-live/") || f === "scripts/db-push-prod.mjs" || /^scripts\/prod-[^/]+\.mjs$/.test(f) || /^scripts\/lib\/prod[^/]*\.mjs$/.test(f);
const สร้าง = /create\s+table\s+(if\s+not\s+exists\s+)?(public\.)?_pms_test_database\b/i;
const ผิด = [];
let ตัวสร้างสร้างจริง = false, ใบ0280ใช้ = false;
for (const f of ไฟล์) {
  if (ตัวเอง.has(f)) continue;
  const เนื้อ = readFileSync(path.join(ราก, f), "utf8");
  if (!เนื้อ.includes(ชื่อ)) continue;
  const บรรทัด = เนื้อ.split(/\r?\n/);
  if (f === ตัวสร้าง) { ตัวสร้างสร้างจริง = สร้าง.test(เนื้อ); continue; }
  if (ฐานจริง(f)) { ผิด.push(`${f}: ชุดล้างเว็บจริง/สคริปต์ฐานจริง ห้ามอ้างเครื่องหมายฐานทดสอบ`); continue; }
  บรรทัด.forEach((l, i) => {
    if (!l.includes(ชื่อ)) return;
    const ที่ = `${f}:${i + 1}`;
    if (สร้าง.test(l)) { ผิด.push(`${ที่}: สร้างเครื่องหมายฐานทดสอบได้ที่ ${ตัวสร้าง} ที่เดียว`); return; }
    if (f.startsWith("supabase/migrations/")) {
      if (/^\s*--/.test(l)) return;
      const เหลือ = l.replaceAll("to_regclass('public._pms_test_database')", "");
      if (เหลือ.includes(ชื่อ)) ผิด.push(`${ที่}: ใบปรับฐานอ้างเครื่องหมายได้เฉพาะ to_regclass('public._pms_test_database')`);
      else if (f.includes("0280_")) ใบ0280ใช้ = true;
      return;
    }
    if (f.startsWith("supabase/tests/") && /\b(drop|create)\s+table\b[^;]*_pms_test_database/i.test(l)) ผิด.push(`${ที่}: ข้อทดสอบ SQL ห้ามสร้าง/ลบเครื่องหมาย (เปลี่ยนชื่อชั่วคราวแทน)`);
  });
}
if (!ตัวสร้างสร้างจริง) ผิด.push(`${ตัวสร้าง}: ต้องสร้างเครื่องหมายฐานทดสอบ (create table if not exists public._pms_test_database)`);
if (!ใบ0280ใช้ && existsSync(path.join(ราก, "supabase/migrations"))
  && readdirSync(path.join(ราก, "supabase/migrations")).some(n => n.startsWith("0280_"))) ผิด.push("ใบ 0280: ตัวกันลบคำขอต้องเช็กเครื่องหมายด้วย to_regclass('public._pms_test_database')");

if (ผิด.length) {
  console.error(`❌ check-test-db-marker: ${ผิด.length} จุด`);
  for (const x of ผิด) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log("✓ check-test-db-marker: เครื่องหมายฐานทดสอบสร้างที่ reset-test-db ที่เดียว · ใบปรับฐานอ้างผ่าน to_regclass · ชุดล้าง/สคริปต์ฐานจริงไม่มี");
