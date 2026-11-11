// ── ตัวตรวจ: ชื่อภาคในข้อมูลตั้งต้น (ฐานทดสอบ/ฐาน dev/seed) ต้องอยู่ในรายการภาคของ th_provinces เท่านั้น ─────────────
//   เจอ 10 พ.ย. 69: ข้อมูลตั้งต้นเก็บ "ตะวันออกเฉียงเหนือ" ส่วนดีลเลอร์ที่แอปสร้าง/ฐานจริงเก็บ "อีสาน"
//     → การ์ดสัดส่วนดีลเลอร์ตามภาค (แดชบอร์ด HQ) ขึ้นภาคเดียวกัน 2 แถว · ข้อมูลทดสอบไม่เหมือนฐานจริง
//   รายการที่ยอม = ภาคใน insert ของ th_provinces (supabase/migrations/0195_dealer_territories.sql) + "ทุกภาค" (ดีลเลอร์ทุกภาค)
//   ไฟล์ที่ตรวจ: tests/fixtures/*.sql · supabase/seed.sql — ค่า "region":"…" (JSON) และ region = '…' / 'region', '…'
//   PMS_FXR_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบ tests/tools/check-fixture-regions.test.mjs)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ราก = process.env.PMS_FXR_ROOT ? path.resolve(process.env.PMS_FXR_ROOT) : process.cwd();
const ใบจังหวัด = path.join(ราก, "supabase/migrations/0195_dealer_territories.sql");
if (!existsSync(ใบจังหวัด)) { console.error("✗ check-fixture-regions: ไม่พบใบ 0195 (รายการภาคของ th_provinces)"); process.exit(1); }
const ส่วนinsert = readFileSync(ใบจังหวัด, "utf8").split(/insert into public\.th_provinces[^\n]*values/i)[1]?.split(";")[0] ?? "";
const ภาคที่ยอม = new Set([...ส่วนinsert.matchAll(/\('[^']*',\s*'([^']*)'\)/g)].map(m => m[1]));
if (ภาคที่ยอม.size < 6) { console.error(`✗ check-fixture-regions: อ่านรายการภาคจากใบ 0195 ได้ ${ภาคที่ยอม.size} ภาค (คาด ≥ 6)`); process.exit(1); }
ภาคที่ยอม.add("ทุกภาค");

const ไฟล์ = [];
const โฟลเดอร์ข้อมูล = path.join(ราก, "tests/fixtures");
if (existsSync(โฟลเดอร์ข้อมูล)) for (const n of readdirSync(โฟลเดอร์ข้อมูล)) if (n.endsWith(".sql")) ไฟล์.push(`tests/fixtures/${n}`);
if (existsSync(path.join(ราก, "supabase/seed.sql"))) ไฟล์.push("supabase/seed.sql");

const ผิด = [];
for (const f of ไฟล์) {
  readFileSync(path.join(ราก, f), "utf8").split(/\r?\n/).forEach((บรรทัด, i) => {
    for (const m of บรรทัด.matchAll(/"region"\s*:\s*"([^"]*)"|\bregion\s*=\s*'([^']*)'|'region'\s*,\s*'([^']*)'/g)) {
      const ค่า = m[1] ?? m[2] ?? m[3];
      if (!ภาคที่ยอม.has(ค่า)) ผิด.push(`${f}:${i + 1} ภาค "${ค่า}"`);
    }
  });
}
if (ผิด.length) {
  console.error(`✗ check-fixture-regions: ชื่อภาคในข้อมูลตั้งต้นไม่อยู่ในรายการ th_provinces (${[...ภาคที่ยอม].join(" / ")}) ${ผิด.length} จุด:`);
  for (const x of ผิด) console.error(`   ${x}`);
  process.exit(1);
}
console.log(`✓ check-fixture-regions: ชื่อภาคในข้อมูลตั้งต้น ${ไฟล์.length} ไฟล์ อยู่ในรายการ th_provinces ทั้งหมด`);
