// ── ข้อทดสอบ: ล้างฐานซ้อมกู้ลองใหม่เฉพาะอาการคอนเทนเนอร์เตรียมโครงฐานล้ม (scripts/lib/restoreReset.mjs · 2 พ.ย. 69) ──
//   ไม่ใช้ Docker: ส่งตัวล้างปลอม
// mutation proof: PMS_RESET_MUTATE=always (ลองใหม่ทุกอาการ) · never (ไม่ลองใหม่เลย) → ต้องตก
import * as จริง from "../../scripts/lib/restoreReset.mjs";
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${เพิ่ม}`}`); };
const พัง = process.env.PMS_RESET_MUTATE ?? "";
const ล้างฐานซ้อมกู้ = พัง === "always" ? (f) => { let r = f(); if (r.status !== 0) r = f(); return r; }
  : พัง === "never" ? (f) => f() : (f) => จริง.ล้างฐานซ้อมกู้(f, () => {});
const ชุด = (...ผลแต่ละครั้ง) => { let i = 0; const เรียก = []; return { f: () => { เรียก.push(i); return ผลแต่ละครั้ง[Math.min(i++, ผลแต่ละครั้ง.length - 1)]; }, เรียก }; };
const ล้มเตรียม = { status: 1, stdout: "Initialising schema...", stderr: "error running container: exit 1\nTry rerunning the command with --debug" };
const ล้มอื่น = { status: 1, stdout: "", stderr: "failed to connect to postgres: connection refused" };
const ผ่าน = { status: 0, stdout: "Finished supabase db reset on branch main.", stderr: "" };

let s = ชุด(ล้มเตรียม, ผ่าน);
let r = ล้างฐานซ้อมกู้(s.f);
ผล(r.status === 0 && s.เรียก.length === 2, "คอนเทนเนอร์เตรียมโครงฐานล้ม → ลองใหม่ 1 ครั้ง แล้วผ่าน", `เรียก ${s.เรียก.length} · ${r.status}`);
s = ชุด(ล้มเตรียม, ล้มเตรียม, ผ่าน);
r = ล้างฐานซ้อมกู้(s.f);
ผล(r.status !== 0 && s.เรียก.length === 2, "ล้มอาการเดิมซ้ำ → ลองแค่ครั้งเดียว แล้วรายงานล้ม (ไม่วนไม่จบ)", `เรียก ${s.เรียก.length} · ${r.status}`);
s = ชุด(ล้มอื่น, ผ่าน);
r = ล้างฐานซ้อมกู้(s.f);
ผล(r.status !== 0 && s.เรียก.length === 1, "ล้มด้วยอาการอื่น → ล้มทันที ไม่ลองใหม่", `เรียก ${s.เรียก.length} · ${r.status}`);
s = ชุด(ผ่าน);
r = ล้างฐานซ้อมกู้(s.f);
ผล(r.status === 0 && s.เรียก.length === 1, "ผ่านครั้งแรก → ไม่ลองซ้ำ", `เรียก ${s.เรียก.length}`);
console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
