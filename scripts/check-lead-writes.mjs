// ── ตัวตรวจ: แอปแก้ลูกค้าเป้าหมายได้ทางเดียว — ตัวกลางที่ส่งเฉพาะส่วนต่าง (บอสสั่ง 15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 14) ──────
//
// ทำไม: หน้าที่เปิดค้างถือสำเนาเก่า ถ้าเขียน leads ทั้งแถว จะทับงาน/ขั้น/ไทม์ไลน์ที่ฐานหรือแท็บอื่นเพิ่งเขียน (เงียบ ๆ)
//   ทางที่ถูก: SalesContext.บันทึกลีด(id, เจตนา) → leads.apply → ฐาน lead_apply (ใบ 0211) · ดู packages/shared/lib/leadIntent.ts
// ตก เมื่อเจอในโค้ดแอป (apps/ · packages/ — ไม่นับข้อทดสอบ):
//   • .from("leads").update( / .upsert(                — เขียน leads ตรงที่ตาราง (ทั้งแถวหรือบางช่อง ก็ข้ามตัวกลาง)
//   • leadToUpdateRow                                  — ตัวแปลงทั้งแถวเดิม (เอาออกแล้ว)
//   • leadsRepo.update( / leads.update( / persistLead.update(  — ทางเขียนทั้งแถวของชั้นข้อมูล/SalesContext (เอาออกแล้ว)
//   • updateLead(                                      — ฟังก์ชันบันทึกทั้งก้อนเดิมของ SalesContext (เอาออกแล้ว)
//   • PUT /leads (ไม่ใช่ op=apply)                     — ทางเว็บเดิม (ปิดแล้ว ตอบ 410)
//
// ใช้: node scripts/check-lead-writes.mjs   (อยู่ใน pnpm checks)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ราก = ["apps", "packages"];
const ข้าม = /node_modules|[\\/]\.next[\\/]|[\\/]dist[\\/]|[\\/]\.turbo[\\/]/;
const กฎ = [
  [/\.from\(\s*["'`]leads["'`]\s*\)\s*\.\s*(update|upsert)\s*\(/, "เขียน leads ตรงที่ตาราง — ใช้ lead_apply ผ่านตัวกลาง"],
  [/\bleadToUpdateRow\b/, "ตัวแปลงทั้งแถว leadToUpdateRow — เอาออกแล้ว"],
  [/\b(leadsRepo|leads)\s*\.\s*update\s*\(/, "leads.update ทั้งแถว — ใช้ leads.apply(id, เจตนา)"],
  [/\bpersistLead\s*\.\s*update\s*\(/, "persistLead.update ทั้งแถว — ใช้ บันทึกลีด(id, เจตนา)"],
  [/\bupdateLead\s*\(/, "updateLead ทั้งก้อน — ใช้ บันทึกลีด(id, เจตนา)"],
  [/\bput\s*(<[^>]*>)?\s*\(\s*["'`]\/leads(?!\?op=apply)/, "PUT /leads — ปิดแล้ว ใช้ POST /leads?op=apply"],
];

const เจอ = [];
const เดิน = (d) => {
  for (const n of readdirSync(d)) {
    const p = path.join(d, n);
    if (ข้าม.test(p + path.sep)) continue;
    if (statSync(p).isDirectory()) { เดิน(p); continue; }
    if (!/\.(ts|tsx|mjs|js)$/.test(n)) continue;
    readFileSync(p, "utf8").split(/\r?\n/).forEach((บรรทัด, i) => {
      const ตัด = บรรทัด.replace(/\/\/.*$/, "");   // ไม่นับคำอธิบายในบรรทัด
      for (const [re, เหตุ] of กฎ) if (re.test(ตัด)) เจอ.push(`${p.replace(/\\/g, "/")}:${i + 1}  ${เหตุ}\n      ${บรรทัด.trim().slice(0, 110)}`);
    });
  }
};
for (const r of ราก) เดิน(r);
if (เจอ.length) {
  console.error(`❌ check-lead-writes: เขียนลูกค้าเป้าหมายนอกตัวกลาง ${เจอ.length} จุด (ต้องส่งเฉพาะส่วนต่างผ่าน บันทึกลีด/lead_apply)`);
  for (const x of เจอ) console.error(`  ${x}`);
  process.exit(1);
}
console.log("check-lead-writes: ผ่าน — แอปแก้ลูกค้าเป้าหมายผ่านตัวกลางทางเดียว");
