// ── ตรวจว่ามี "คำสั่งเปลี่ยนข้อมูล" จุดไหนที่ไม่ได้ตรวจผลลัพธ์ ────────────────────
//
// ทำไมต้องมี (บทเรียนจริง 7 ส.ค. 69):
//   ระหว่างตรวจสอบระบบ ผมยกระดับสิทธิ์บัญชีดีลเลอร์เพื่อพิสูจน์ช่องโหว่ แล้วสั่งคืนค่ากลับ
//   คำสั่งคืนค่า "ล้มเหลว" แต่ไม่มีใครรู้ เพราะโค้ดไม่ได้ตรวจผล — บัญชีนั้นจึงค้างเป็น
//   ผู้ดูแลสูงสุดและมองเห็นข้อมูลลูกค้าของสาขาอื่นได้จริงอยู่พักหนึ่ง
//   จับได้เพราะบังเอิญเห็นตัวเลขผิดปกติในการตรวจถัดไป ไม่ใช่เพราะระบบฟ้อง
//
// รากของปัญหา: ไลบรารีฐานข้อมูลที่ใช้ **คืน error เป็นค่า** ไม่ได้โยน exception
//   เขียน `await sb.from("x").update(...)` เฉย ๆ = ต่อให้ถูกปฏิเสธด้วยกฎความปลอดภัย
//   โปรแกรมก็เดินต่อเหมือนสำเร็จ · try/catch ก็ดักไม่ติด (ไม่มีอะไรถูกโยน)
//   นี่คือกับดักเดียวกับที่เคยทำให้เหลือ "บัญชีกำพร้า" มาแล้ว (ดู deleteAuthUserLoud)
//
// กติกา: ทุกคำสั่ง insert/update/upsert/delete ต้องทำอย่างใดอย่างหนึ่ง
//   • รับผลไปตรวจ            — const { error } = await ... / const { data, error } = await ...
//   • ส่งต่อให้ตัวช่วยที่ตรวจให้ — must(...) / withNetworkRetry(...) / return ออกไปให้ผู้เรียกตรวจ
//   • ต่อ .select() แล้วเอาผลไปเช็ก
//   ถ้าตั้งใจไม่ตรวจจริง ๆ (เก็บกวาดแบบ best-effort) ให้เขียน `void` นำหน้าเพื่อประกาศเจตนา
//
// รัน: node scripts/check-unchecked-mutations.mjs
import { readFileSync } from "node:fs";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ROOTS = ["apps", "packages"];          // โค้ดจริงเท่านั้น — สคริปต์ทดสอบมีกติกาของตัวเอง
const MUTATIONS = /\.(insert|update|upsert|delete)\s*\(/;

// อ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs) — ไม่อ่านผล build ทุกชื่อโฟลเดอร์ (.next-r4 ฯลฯ · 22 ต.ค. 69)

const bad = [];
for (const file of ไฟล์ที่gitเก็บ(ROOTS, { ext: /\.tsx?$/ })) {
  const src = readFileSync(file, "utf8");
  if (!MUTATIONS.test(src)) continue;
  const lines = src.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!MUTATIONS.test(line)) continue;
    if (!/\bfrom\s*\(|\brpc\s*\(|auth\.admin\./.test(line)) continue;  // เฉพาะคำสั่งที่คุยกับฐานข้อมูลจริง
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) continue;

    // คำสั่งอาจเขียนคร่อมหลายบรรทัด — ดูตั้งแต่ต้นประโยคจนจบ
    const start = /=|return|await|void|must\(|withNetworkRetry\(/.test(line) ? i : Math.max(0, i - 3);
    const stmt = lines.slice(start, i + 1).join(" ");

    const checked =
      /(const|let)\s*\{[^}]*\berror\b/.test(stmt) ||   // รับ error ไปตรวจเอง
      /\bmust\s*\(/.test(stmt) ||                       // ตัวช่วยที่โยน error ให้
      /withNetworkRetry\s*\(/.test(stmt) ||
      /\breturn\b/.test(stmt) ||                        // ส่งต่อให้ผู้เรียกตรวจ
      /^\s*void\s/.test(lines[start] ?? "") ||          // ประกาศเจตนาว่าไม่ตรวจ
      /\bdeleteAuthUserLoud\s*\(/.test(stmt);

    if (!checked) bad.push({ file: file.replace(/\\/g, "/"), line: i + 1, code: t.slice(0, 110) });
  }
}

for (const b of bad) console.log(`${b.file}:${b.line}\n    ${b.code}`);
console.log(`\nคำสั่งเปลี่ยนข้อมูลที่ไม่ได้ตรวจผล: ${bad.length}`);
process.exit(bad.length ? 1 : 0);
