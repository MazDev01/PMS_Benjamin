// ── ตรวจว่าตารางที่แบ่งหน้า "กลับไปหน้า 1" เมื่อเปลี่ยนตัวกรองหรือเปล่า ────────────────
//
// ที่มา (เอเจนต์สวมบทผู้บริหารเจอเอง 10 ส.ค. 69 · เป็นบั๊กที่ผมเพิ่มเข้าไปเองเมื่อ 7 ส.ค.):
//   กดไปหน้า 9 ของบันทึกการใช้งาน แล้วเปลี่ยนตัวกรองหมวดงาน
//   → ผลลัพธ์เหลือ 128 รายการ (13 หน้า) แต่ยังค้างอยู่ "หน้า 9/13" กลางลิสต์
//   ผู้ใช้กรองเพื่อ "หาของ" แต่ระบบพาไปโผล่กลางกองผลลัพธ์ที่ไม่ได้ขอ
//   กรณีแย่กว่านั้น: ถ้าผลลัพธ์ใหม่มีหน้าเดียว จะเห็นหน้าว่างเปล่าทั้งที่มีข้อมูล
//
// ⚠️ สิ่งที่น่าอายกว่าตัวบั๊ก: ตารางเดิมของระบบ (ผู้ใช้ · ไฟล์) ทำถูกอยู่ก่อนแล้วทั้งคู่
//   ตัวหนึ่งรีเซ็ตในตัวจัดการเหตุการณ์ อีกตัวใช้ useEffect เฝ้าตัวกรอง
//   แต่ตอนเพิ่มตัวแบ่งหน้าให้ 2 ตารางใหม่ กลับไม่ได้ดูของเดิมก่อน
//   → ตัวตรวจนี้มีไว้ให้เครื่องจำแทน ไม่ต้องหวังว่าคนจะจำได้ทุกครั้ง
//
// กติกา: ไฟล์ที่มี state หน้า (setPage/setPageX) และมีตัวกรอง (ช่องค้นหา/ช่องเลือก)
//   ต้องมีการรีเซ็ตหน้าอย่างใดอย่างหนึ่ง — เรียก setPage(0)/setPage(1) ตอนเปลี่ยนตัวกรอง
//   หรือมี useEffect ที่รีเซ็ตหน้าเมื่อตัวกรองเปลี่ยน
//
// รัน: node scripts/check-filter-resets-page.mjs
import { readFileSync } from "node:fs";
import { ไฟล์ที่gitเก็บ } from "./lib/gitFiles.mjs";

const ROOTS = ["apps", "packages"];

// อ่านเฉพาะไฟล์ที่ git เก็บ (scripts/lib/gitFiles.mjs) — ไม่อ่านผล build ทุกชื่อโฟลเดอร์ (.next-r4 ฯลฯ · 22 ต.ค. 69)

const bad = [];
for (const file of ไฟล์ที่gitเก็บ(ROOTS, { ext: /\.tsx$/ })) {
  const src = readFileSync(file, "utf8");

  // มีการแบ่งหน้าจริงไหม (ประกาศ state ของหน้า)
  const pageSetter = /const\s+\[\s*\w*[Pp]age\w*\s*,\s*(set\w*[Pp]age\w*)\s*\]\s*=\s*useState/.exec(src);
  if (!pageSetter) continue;
  const setter = pageSetter[1];

  // มีตัวกรองที่ทำให้ผลลัพธ์เปลี่ยนจำนวนไหม (ช่องค้นหา หรือ ช่องเลือกที่ผูกกับ state)
  const hasFilter = /placeholder="ค้นหา/.test(src) || /aria-label="กรองตาม/.test(src);
  if (!hasFilter) continue;

  // รีเซ็ตหน้าด้วยวิธีใดวิธีหนึ่ง
  const resetsInline = new RegExp(`${setter}\\(\\s*[01]\\s*\\)`).test(src);
  const resetsInEffect = new RegExp(`useEffect\\([^;]*${setter}\\(\\s*[01]\\s*\\)`, "s").test(src);
  if (resetsInline || resetsInEffect) continue;

  bad.push({ file: file.replace(/\\/g, "/"), setter });
}

for (const b of bad) console.log(`${b.file}\n    มีการแบ่งหน้า (${b.setter}) และมีตัวกรอง แต่ไม่พบการกลับไปหน้า 1`);
console.log(`\nตารางแบ่งหน้าที่เปลี่ยนตัวกรองแล้วไม่กลับหน้า 1: ${bad.length}`);
process.exit(bad.length ? 1 : 0);
