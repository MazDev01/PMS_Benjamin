// ── ตัวดัก: ห้ามเติมรหัสสาขาที่ขาดไปด้วยค่าว่างในจุดที่กรอง/จัดกลุ่ม/รวมยอด ──
//
// ที่มา (24 ส.ค. 69): ผลตรวจภายนอกพบยอดฝั่งดีลเลอร์กับฝั่งสำนักงานใหญ่ไม่ตรงกัน
//   ต้นเหตุคือ `dealerCode ?? ""` (ตกหาย) กับ `dealerCode ?? DEFAULT_DEALER_CODE` (นับเป็นสาขาตั้งต้น)
//   ถูกใช้ปนกันในระบบเดียว → ต้องผ่าน dealerCodeOf() ที่เดียวเท่านั้น
import fs from "fs";
import path from "path";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ROOTS = ["apps", "packages"];
// จุดที่ยอมได้: ใช้เป็นข้อความให้คนอ่าน (ป้าย/ค้นหา/คีย์ React) ไม่ได้เอาไปนับ
// จุดที่ยอมได้: ใช้เป็นข้อความให้คนอ่าน (ป้าย/ค้นหา/คีย์ React) · หรืออ่านค่าที่ "ส่งเข้ามา"
// (ใบผ่าน/คำขอ/ค่าที่เก็บไว้) ซึ่งค่าว่างแปลว่า "ไม่ได้ระบุ" จริง ๆ ไม่ใช่เรคคอร์ดที่ขาดรหัส
const ยอมได้ = /title=|key=|label|DEALER_NAME|includes\(|localeCompare|toLowerCase|`\$\{|JSON\.parse|body\?\.|p\.dealerCode|session\.dealerCode/;   // session = ใบผ่าน: ค่าว่าง = ผู้ใช้ HQ (ห้ามเติมเป็นสาขาตั้งต้น)
const ไฟล์ที่ยกเว้น = /cookieAuth\.ts|server[\/]v1[\/]/;
const เจอ = [];

// อ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs) — ไม่อ่านผล build ทุกชื่อโฟลเดอร์ (.next-r4 ฯลฯ · 22 ต.ค. 69)
for (const p of ไฟล์ที่gitเก็บ(ROOTS, { ext: /\.(ts|tsx)$/ })) {
  if (/dealerCode\.ts$/.test(p)) continue;               // ไฟล์กติกาเอง
  if (ไฟล์ที่ยกเว้น.test(p)) continue;                      // อ่านค่าจากใบผ่าน/คำขอ ไม่ใช่เรคคอร์ดที่ขาดรหัส
  fs.readFileSync(p, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (!/dealerCode \?\? ""/.test(line)) return;
    if (ยอมได้.test(line)) return;
    เจอ.push(`${p}:${i + 1}  ${line.trim().slice(0, 100)}`);
  });
}


console.log(`\nจุดที่เติมรหัสสาขาด้วยค่าว่างแล้วเอาไปนับ: ${เจอ.length}`);
if (เจอ.length) {
  เจอ.forEach(x => console.log("  " + x));
  console.log('\n  → ใช้ dealerCodeOf(record) จาก @pms/shared/lib/dealerCode แทน');
  process.exit(1);
}
