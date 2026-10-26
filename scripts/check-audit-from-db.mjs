// ── ตัวตรวจ: บันทึกการใช้งานต้องให้ฐานบันทึกเท่านั้น — โค้ดหน้าเว็บห้ามเขียนเอง (บอสสั่ง 22 ต.ค. 69 · ใบ 0240) ──────────
//
// ทำไม: เดิมหน้าเว็บเปลี่ยนข้อมูลก่อน แล้วยิงคำขอ "บันทึกการใช้งาน" แยกอีกคำขอ (useAuditLogger → POST /audit)
//   ผู้ใช้กดไปหน้าอื่นก่อนคำขอนั้นตอบ → เบราว์เซอร์ตัดทิ้ง = ข้อมูลเปลี่ยนจริงแต่ไม่มีบันทึกว่าใครเปลี่ยน
//   (พบในรอบตรวจเต็มใบ 0239 · hq-proposals.spec.ts) และหน้าเว็บเป็นคนกำหนดชื่อผู้ทำ/ข้อความเอง
//   ทางที่ถูก: ตัวดักของฐานลงบันทึกในคำสั่งเดียวกับการเปลี่ยน (0240) · เรื่องที่ไม่มีการเปลี่ยนข้อมูลให้ผูก
//   (เข้า/ออกระบบ · ส่งออกการตั้งค่า) เรียก audit.authEvent / audit.settingsExported → คำสั่งฐานที่บันทึกเอง
// ตก เมื่อเจอในโค้ดแอป (apps/ · packages/ — ไม่นับข้อทดสอบ):
//   • useAuditLogger                                   — hook บันทึกจากหน้าเว็บ (เอาออกแล้ว)
//   • appendAudit(                                     — เขียนบันทึกลงเครื่อง (เอาออกแล้ว · โหมดตัวอย่างอ่านอย่างเดียว)
//   • audit.append( / auditRepo.append(                — ทางเขียนทั้งแถวของชั้นข้อมูล (เอาออกแล้ว)
//   • .from("audit_log").insert/upsert/update(          — เขียนตาราง audit_log ตรง (ข้ามบรรทัดได้)
//   • ยิง /audit?at= หรือ POST "/audit" ที่ไม่มี op=     — ทางเว็บเดิม (ปิดแล้ว ตอบ 410)
// ยกเว้น: packages/shared/lib/adminRoute.ts (auditLog) — โค้ดฝั่งเซิร์ฟเวอร์ของเส้นทางผู้ดูแล (service_role · สร้าง/ลบบัญชี
//   · ผูกผู้สนใจ) ซึ่งงานหลักทำผ่าน API ระบบยืนยันตัวตน ไม่ใช่ตารางที่มีตัวดัก · ไม่ใช่หน้าเว็บ ไม่โดนตัดตอนเปลี่ยนหน้า
//
// ใช้: node scripts/check-audit-from-db.mjs   (อยู่ใน npm run checks — ขั้นแรกของรอบตรวจเต็ม)
import { readFileSync } from "node:fs";
import path from "node:path";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ราก = ["apps", "packages"];
const ข้าม = /node_modules|[\\/]\.next[\\/]|[\\/]dist[\\/]|[\\/]\.turbo[\\/]/;
const ยกเว้น = new Set(["packages/shared/lib/adminRoute.ts"]);
const กฎ = [
  [/\buseAuditLogger\b/g, "useAuditLogger — หน้าเว็บบันทึกเอง (ฐานบันทึกในคำสั่งเดียวกับการเปลี่ยนแล้ว · ใบ 0240)"],
  [/\bappendAudit\s*\(/g, "appendAudit — เขียนบันทึกจากหน้าเว็บ"],
  [/\b(audit|auditRepo)\s*\.\s*append\s*\(/g, "audit.append — เขียนบันทึกทั้งแถวจากหน้าเว็บ"],
  [/\.from\(\s*["'`]audit_log["'`]\s*\)\s*\.\s*(insert|upsert|update)\s*\(/g, "เขียนตาราง audit_log ตรง — ให้ตัวดักของฐานลงเอง"],
  [/["'`]\/audit\?at=/g, "ยิง /audit?at= แบบเดิม (ตอบ 410)"],
  [/["'`]\/audit["'`]\s*,\s*\{[^}]*method\s*:\s*["'`]POST/g, "POST /audit ไม่มี op= (ตอบ 410)"],
];

// ตัดคำอธิบายออกก่อนตรวจ (คงจำนวนบรรทัดไว้ เพื่อชี้เลขบรรทัดได้ถูก) — คำอธิบายเล่าประวัติชื่อเก่าได้
function ตัดคำอธิบาย(ข้อความ) {
  return ข้อความ
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .split("\n").map(บ => บ.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");
}

const เจอ = [];
{
  for (const p of ไฟล์ที่gitเก็บ(ราก)) {
    const ทาง = p.replace(/\\/g, "/");
    if (ข้าม.test(p + path.sep) || ยกเว้น.has(ทาง)) continue;
    const เดิม = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const โค้ด = ตัดคำอธิบาย(เดิม);
    const บรรทัด = เดิม.split("\n");
    for (const [re, เหตุ] of กฎ) {
      for (const m of โค้ด.matchAll(re)) {
        const ที่ = โค้ด.slice(0, m.index).split("\n").length;
        เจอ.push(`${ทาง}:${ที่}  ${เหตุ}\n      ${(บรรทัด[ที่ - 1] ?? "").trim().slice(0, 110)}`);
      }
    }
  }
}


if (เจอ.length) {
  console.error(`❌ check-audit-from-db: โค้ดหน้าเว็บเขียนบันทึกการใช้งานเอง ${เจอ.length} จุด (ต้องให้ฐานบันทึกเท่านั้น · ใบ 0240)`);
  for (const x of เจอ) console.error(`  ${x}`);
  process.exit(1);
}
console.log("check-audit-from-db: ผ่าน — บันทึกการใช้งานเกิดจากฐานเท่านั้น หน้าเว็บไม่เขียนเอง");
