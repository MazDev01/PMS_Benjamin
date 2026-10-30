// ── ข้อทดสอบ: ตัวตรวจข้อมูลตั้งต้นฐานทดสอบ — จังหวัดตรง 77 จังหวัด + ดีลเลอร์ 1 จังหวัดพอดี (ใบ 0259 · 30 ต.ค. 69) ───────────
// เหตุ (คนรวมงานเจอ 30 ต.ค. 69): tests/fixtures/test-baseline.sql มี BKK "กรุงเทพฯ" (ฐานปฏิเสธแล้ว) และไม่มีแถวพื้นที่
//   ไฟล์ใส่แบบปิดตัวดัก จึงโหลดได้ทั้งที่ระบบจริงสร้างข้อมูลแบบนี้ไม่ได้
// ก. ไฟล์ในโฟลเดอร์นี้ผ่าน · ข. จังหวัดชื่อย่อ = ตก · ค. ดีลเลอร์ไม่มีแถวพื้นที่ = ตก · ง. พื้นที่ไม่ตรงจังหวัดที่ตั้ง = ตก
// อ่านไฟล์อย่างเดียว ไม่แตะฐาน · รัน: node tests/tools/test-baseline-check.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ที่ = path.join("test-results", `test-baseline-check-${process.pid}`);
mkdirSync(ที่, { recursive: true });
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-600)}`}`); };
const ตรวจ = (ไฟล์) => { const r = spawnSync(process.execPath, ["scripts/check-test-baseline.mjs", ไฟล์], { encoding: "utf8" }); return { ...r, ออก: (r.stdout ?? "") + (r.stderr ?? "") }; };
const เดิม = readFileSync("tests/fixtures/test-baseline.sql", "utf8");
const ลอง = (ชื่อ, เนื้อ) => { const f = path.join(ที่, `${ชื่อ}.sql`); writeFileSync(f, เนื้อ); return ตรวจ(f); };

{ const r = ตรวจ("tests/fixtures/test-baseline.sql"); ผล(r.status === 0, "ก. ข้อมูลตั้งต้นในโฟลเดอร์นี้ผ่าน", r.ออก); }
{
  const r = ลอง("ชื่อย่อ", เดิม.replace('"province":"กรุงเทพมหานคร","region"', '"province":"กรุงเทพฯ","region"'));
  ผล(r.status === 1 && /จังหวัด "กรุงเทพฯ" ไม่อยู่ในรายชื่อ 77 จังหวัด/.test(r.ออก), "ข. ดีลเลอร์จังหวัด \"กรุงเทพฯ\" (ชื่อย่อ) = ตก", r.ออก);
}
{
  const r = ลอง("ไม่มีพื้นที่", เดิม.replace(/\{"province":"กรุงเทพมหานคร","dealer_code":"BKK"[^\n]*\n/, ""));
  ผล(r.status === 1 && /ดีลเลอร์ BKK .*\[ไม่มี\]/.test(r.ออก), "ค. ดีลเลอร์ไม่มีแถวพื้นที่ = ตก", r.ออก);
}
{
  const r = ลอง("พื้นที่ไม่ตรง", เดิม.replace('{"province":"ระยอง","dealer_code":"RYG"', '{"province":"จันทบุรี","dealer_code":"RYG"'));
  ผล(r.status === 1 && /ดีลเลอร์ RYG .*\[จันทบุรี\]/.test(r.ออก), "ง. พื้นที่ไม่ตรงจังหวัดที่ตั้ง (RYG ระยอง → พื้นที่จันทบุรี) = ตก", r.ออก);
}
rmSync(ที่, { recursive: true, force: true });
if (ตก) { console.log(`\nFAIL ${ตก} ข้อ`); process.exit(1); }
console.log("\nALL PASS");
