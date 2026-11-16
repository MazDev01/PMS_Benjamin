// ── ตัวตรวจก่อน commit: เพิ่มเพดานของตัวตรวจโดยไม่มีบอสรับทราบที่ตรงค่า = ตก (บอสสั่ง 13 พ.ย. 69 · scripts/lib/ceilingGuard.mjs) ──
//   ลดเพดาน = ผ่าน · เพิ่ม = ต้องมีบรรทัดใน scripts/ceiling-ack.txt จาก npm run ceiling:ack (บอสรันเอง)
// ข้อทดสอบ: tests/tools/ceiling-guard.test.mjs
import { ตรวจโฟลเดอร์, ไฟล์รับทราบ } from "./lib/ceilingGuard.mjs";

const ผล = ตรวจโฟลเดอร์(process.cwd());
if (ผล.ผ่าน) {
  console.log(`✓ check-ceiling-raise: ไม่มีการเพิ่มเพดานที่ไม่ได้รับทราบ (เพิ่ม ${ผล.เพิ่ม.length} · เทียบ ${ผล.ฐาน.slice(0, 8)})`);
  process.exit(0);
}
console.error(`⛔ เพิ่มเพดานของตัวตรวจโดยไม่มีบอสรับทราบที่ตรงค่า ${ผล.ขาด.length} รายการ (เทียบกับ ${ผล.ฐาน.slice(0, 8)}):`);
for (const x of ผล.ขาด) console.error(`   ${x.ไฟล์} · ${x.คีย์}: ${x.เดิม} → ${x.ใหม่}`);
console.error(`   แก้ให้ไม่เกินเพดานเดิม (ห้ามปิดกฎ/ใส่ตัวปิด) · หรือให้บอสรับทราบ: npm run ceiling:ack -- --ไฟล์ <ไฟล์> --คีย์ <คีย์> --ค่า <ค่าใหม่> (บอสรันเองในหน้าต่างคำสั่ง → ${ไฟล์รับทราบ})`);
process.exit(1);
