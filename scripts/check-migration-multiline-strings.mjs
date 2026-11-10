// ── ตัวตรวจ: ใบปรับฐานห้ามมีข้อความในเครื่องหมายคำพูดที่ขึ้นบรรทัดด้วยการกด Enter (คนรวมงานขอ 9 พ.ย. 69) ─────────────────────────
//   เหตุ: ใบ 0281 เขียนขึ้นบรรทัดในอีเมลถึง HQ ด้วย Enter ใน E'…' · เครื่อง Windows (core.autocrlf=true) checkout ไฟล์เป็น CRLF
//     → ฐานที่ลงใบจากโฟลเดอร์นั้นได้ \r\n · ฐานที่ลงจากไฟล์ LF ได้ \n (ผลไม่ตรงกันตามเครื่อง · ข้อทดสอบ dealer_display_name ตกในโฟลเดอร์ใหม่)
//   ใช้ E'\n' หรือ chr(10) แทน · JSON หลายบรรทัดไม่นับ (CR/LF เป็นช่องว่างของ JSON)
//   ไม่ใช้ .gitattributes eol=lf กับไฟล์ใบ: โฟลเดอร์ที่ checkout ไว้แล้ว (CRLF) จะขึ้นว่าไฟล์ถูกแก้ทั้งโฟลเดอร์ → ด่าน "ไม่มีไฟล์ค้าง"
//     ของรอบตรวจ/รวมงานตก · ลายนิ้วมือใบ (migrationGate.mjs) แปลง CRLF เป็น LF ก่อนคิดอยู่แล้ว ตัวตรวจนี้จึงไม่กระทบลายนิ้วมือใบเดิม
//   ข้อทดสอบ: tests/unit/sqlMultilineStrings.test.ts
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ข้อความหลายบรรทัด } from "./lib/sqlMultilineStrings.mjs";

const โฟลเดอร์ = process.env.PMS_MIGRATIONS_DIR ?? "supabase/migrations";
/** ใบเดิมที่มีอยู่แล้ว — ห้ามแก้ไฟล์ใบที่ลงแล้ว (ลายนิ้วมือ) · ใบถัดมาแก้ทับแล้ว */
export const ยกเว้น = { "0281_dealer_display_name.sql": "อีเมลถึง HQ — ใบ 0285 สร้างฟังก์ชัน _quote_request_mail_lines ใหม่ด้วย E'\n' แล้ว" };
const เจอ = [];
for (const f of readdirSync(โฟลเดอร์).filter(n => n.endsWith(".sql")).sort()) {
  if (ยกเว้น[f]) continue;
  for (const r of ข้อความหลายบรรทัด(readFileSync(path.join(โฟลเดอร์, f), "utf8"))) เจอ.push(`${f}:${r.line} — '${r.text}…'`);
}
if (เจอ.length) {
  console.error(`✗ check-migration-multiline-strings: ข้อความในใบปรับฐานขึ้นบรรทัดด้วย Enter ${เจอ.length} จุด — ใช้ E'\\n' หรือ chr(10) (เครื่องที่ git แปลงเป็น CRLF จะได้ CR LF)`);
  for (const x of เจอ) console.error(`  ${x}`);
  process.exit(1);
}
console.log("✓ check-migration-multiline-strings: ข้อความในใบปรับฐานไม่ขึ้นบรรทัดด้วย Enter (ยกเว้นใบที่ถูกแก้ทับแล้ว " + Object.keys(ยกเว้น).length + " ใบ)");
