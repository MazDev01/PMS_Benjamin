// ── ช่องเหตุผลต้องผ่านกล่องเหตุผลกลางเท่านั้น (บอสสั่ง 28 ต.ค. 69 · กด "ยกเลิกคำขอ" แล้วดูเหมือนไม่เกิดอะไร) ──
//
// กล่องกลาง = ถามเหตุผล() ใน packages/shared/components/ui/ConfirmToast.tsx
//   เหตุผลว่าง = ปุ่มยืนยันกดไม่ได้ + บอกที่ช่อง · กดแล้ว "กำลัง…" กดซ้ำไม่ได้จนฐานตอบ · ฐานผิดพลาด = ข้อความในกล่อง ไม่ปิดเอง
// เดิมแต่ละหน้าเขียนฟอร์มเหตุผลเอง (แผงคำขอราคา · ตัวเลือกเหตุผลปิดการขาย · ฟอร์มผู้สนใจไม่สำเร็จ) แล้วกติกาไม่ตรงกัน:
//   ปุ่มไม่บอกว่ากำลังทำ · เหตุผลว่างกดได้แล้วขึ้นตัวแดงเล็ก · ปิดฟอร์มก่อนฐานตอบ
//
// ตก เมื่อ:
//   1) ไฟล์อื่นนอกกล่องกลางมี <input>/<textarea>/<select> ที่เป็นช่องเหตุผล
//      (ชื่อช่อง/ตัวอย่าง/id มีคำว่า "เหตุผล" หรือผูกค่า lostReason/cancelReason/closeReason/reason)
//   2) มีการเรียกตัวเลือกเหตุผลแบบเดิม (LostReasonPicker) — ลบแล้ว ห้ามเติมกลับ
//
// ยกเว้นได้ — เขียนคำกำกับในคอมเมนต์เหนือช่อง (ไม่เกิน 12 บรรทัด): "ไม่ใช่กล่องเหตุผล"
//   ใช้กับช่องที่ "แก้ข้อมูลที่บันทึกแล้ว" หรือ "ตั้งรายการเหตุผล" ซึ่งไม่ใช่การยืนยันงานที่ต้องรอฐาน
// PMS_REASON_CHECK_ROOT = โฟลเดอร์จำลอง (ข้อทดสอบของตัวตรวจ tests/tools/reason-dialogs.test.mjs)
import { readFileSync, globSync } from "node:fs";
import { join, relative } from "node:path";

const ราก = process.env.PMS_REASON_CHECK_ROOT ?? process.cwd();
const กล่องกลาง = "packages/shared/components/ui/ConfirmToast.tsx";
const files = globSync("{apps,packages}/**/*.tsx", { cwd: ราก, exclude: p => p.includes("node_modules") || p.includes(".next") })
  .map(f => f.replace(/\\/g, "/"));
const ช่องเหตุผล = /เหตุผล|lostReason|cancelReason|closeReason|\breason\b/;
const ข้อยกเว้น = /ไม่ใช่กล่องเหตุผล/;
const พบ = [];

for (const f of files) {
  if (f === กล่องกลาง) continue;
  const src = readFileSync(join(ราก, f), "utf8");
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/\bLostReasonPicker\b/.test(line)) { พบ.push(`${f}:${i + 1} — ใช้ตัวเลือกเหตุผลแบบเดิม (LostReasonPicker) — ใช้ ถามเหตุผล({ ตัวเลือก, ทำ }) แทน`); return; }
    if (/^\s*(\/\/|\*|\{\/\*)/.test(line)) return;   // บรรทัดคอมเมนต์ (พูดถึง <select> เฉย ๆ) ไม่ใช่ช่องจริง
    const m = /<(input|textarea|select)\b/.exec(line);
    if (!m) return;
    // ตัวแท็กถึงจุดปิดแรก (/> · </select> · </textarea>) ไม่เกิน 6 บรรทัด — ดูเฉพาะคุณสมบัติของช่องนี้
    const ก้อน = lines.slice(i, i + 6).join("\n").slice(m.index);
    const ปิด = [ก้อน.indexOf("/>"), ก้อน.indexOf("</select>"), ก้อน.indexOf("</textarea>")].filter(x => x >= 0);
    const แท็ก = ก้อน.slice(0, ปิด.length ? Math.min(...ปิด) : 600);
    if (!ช่องเหตุผล.test(แท็ก)) return;
    if (ข้อยกเว้น.test(lines.slice(Math.max(0, i - 12), i).join("\n"))) return;
    พบ.push(`${f}:${i + 1} — ช่องเหตุผลเขียนเองในหน้า — ใช้ ถามเหตุผล() จาก ${กล่องกลาง} (กล่องรอฐาน · เหตุผลว่างกดไม่ได้ · ผิดพลาดแสดงในกล่อง)`);
  });
}
for (const x of พบ) console.log(`  ${x}`);
console.log(`ช่องเหตุผลที่ไม่ผ่านกล่องเหตุผลกลาง: ${พบ.length}${ราก === process.cwd() ? "" : ` (ราก ${relative(process.cwd(), ราก) || "."})`}`);
if (พบ.length > 0) process.exit(1);
