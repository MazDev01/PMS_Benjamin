// ── ข้อมูลตัวอย่างบนฐาน dev (npm run dev) ครบทุกขั้นใน FLOW (บอสสั่ง 28 ต.ค. 69) ───────────────────────────────────────
//
// เหตุ: ฐาน dev มีแค่ข้อมูลตั้งต้นของฐานทดสอบ — เปิดดู D3x–D8 · H2–H9 · กราฟ/การ์ด/เป้า บนเครื่องไม่ได้ (ตารางเทียบ FLOW รอบ 5)
// ตัวรัน: เรียกทีละส่วนในโฟลเดอร์ scripts/dev-sample/ ตามลำดับ (ส่วนหลังพึ่งของส่วนก่อนได้ เช่น ดีลเลอร์/บัญชี)
//   แต่ละส่วน export { ชื่อ, มีแล้ว(ctx), ลบ(ctx), สร้าง(ctx) } · ลบ/สร้างเฉพาะของตัวเอง (ช่วงเลข/ชื่อของตัวเอง)
//   กติกาทุกส่วน: scripts/dev-sample/ตัวช่วย.mjs (ทางเดียวกับหน้าเว็บ · flow ใหม่เท่านั้น · ข้อมูลสมมติ · ฐาน dev เท่านั้น)
// ฐาน dev เท่านั้น (พอร์ต ฐาน.dev ใน scripts/lib/ports.json) — ฐานทดสอบ/ฐานจริงห้ามรัน · ไม่แตะ tests/fixtures/test-baseline.sql
// ใช้: node scripts/dev-sample-data.mjs                 (ส่วนที่มีแล้ว = ข้าม)
//      node scripts/dev-sample-data.mjs --reset         (ลบทุกส่วนแล้วสร้างใหม่ · npm run dev:sample)
//      node scripts/dev-sample-data.mjs --only=ชื่อ,ชื่อ  (เฉพาะบางส่วน · ใช้กับ --reset ได้)
//      scripts/dev-db.mjs เรียกให้เองหลังใส่ข้อมูลตั้งต้นของฐาน dev
// รหัสผ่านบัญชีที่ข้อมูลตัวอย่างสร้าง: C:/.claude/pms-dev/บัญชีตัวอย่าง.json (นอก repo)
import { เตรียม } from "./dev-sample/ตัวช่วย.mjs";

// ลำดับส่วน — ไฟล์ที่ยังไม่มี (ยังไม่ได้รวมงาน) ข้ามพร้อมบอก
const ลำดับ = ["สาขา", "ขั้นทั้งหมด", "ใบเสนอราคา", "นัดหมาย", "ย้อนหลัง", "ลูกค้า", "ผู้ใช้และบันทึก"];
const reset = process.argv.includes("--reset");
const เฉพาะ = (process.argv.find(a => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);

const ctx = await เตรียม();
const ส่วน = [];
for (const ชื่อ of ลำดับ.filter(n => !เฉพาะ.length || เฉพาะ.includes(n))) {
  try { ส่วน.push(await import(`./dev-sample/${ชื่อ}.mjs`)); }
  catch (e) { if (e?.code === "ERR_MODULE_NOT_FOUND" && String(e.message).includes(ชื่อ)) console.log(`· ข้ามส่วน "${ชื่อ}" (ยังไม่มีไฟล์)`); else throw e; }
}
// ลบย้อนลำดับ (ส่วนหลังอาจอ้างของส่วนก่อน) แล้วสร้างตามลำดับ
// จบเองตามธรรมชาติ — process.exit ขณะการเชื่อมต่อฐานยังปิดไม่เสร็จ ทำ Node บน Windows ล้ม (UV_HANDLE_CLOSING) แล้วคืนรหัสผิดพลาด
if (reset) for (const m of [...ส่วน].reverse()) { console.log(`▶ ลบส่วน "${m.ชื่อ}" …`); await m.ลบ(ctx); }
let สร้าง = 0;
for (const m of ส่วน) {
  if (!reset && await m.มีแล้ว(ctx)) { console.log(`· ส่วน "${m.ชื่อ}" มีอยู่แล้ว — ข้าม`); continue; }
  console.log(`▶ สร้างส่วน "${m.ชื่อ}" …`);
  await m.สร้าง(ctx);
  สร้าง++;
}
console.log(สร้าง ? `✓ ข้อมูลตัวอย่างพร้อม (${สร้าง} ส่วน) · บัญชีเข้าระบบ: ${ctx.ไฟล์บัญชี} · ลบ/สร้างใหม่: npm run dev:sample`
  : "▶ ข้อมูลตัวอย่างมีครบแล้ว (สร้างใหม่: npm run dev:sample)");
