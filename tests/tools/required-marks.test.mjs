// ── ข้อทดสอบ: ตัวตรวจ check-required-marks — ช่องบังคับในรายการต้องมี * แดงจากตัวกลาง (บอสสั่ง 4 พ.ย. 69) ──
//   รันตัวตรวจจริงกับโฟลเดอร์จำลอง (PMS_REQ_CHECK_ROOT) — ไม่แตะโค้ดจริง
// รัน: node tests/tools/required-marks.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };
const รายการ = (ช่อง) => JSON.stringify({ ช่อง });
const ตรวจ = (ไฟล์) => {
  const ที่ = mkdtempSync(join(tmpdir(), "required-marks-"));
  for (const [f, s] of Object.entries(ไฟล์)) { mkdirSync(dirname(join(ที่, f)), { recursive: true }); writeFileSync(join(ที่, f), s); }
  const r = spawnSync(process.execPath, ["scripts/check-required-marks.mjs"], { encoding: "utf8", env: { ...process.env, PMS_REQ_CHECK_ROOT: ที่ } });
  rmSync(ที่, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
};
const ฟอร์ม = "apps/hq/Form.tsx";
const ช่อง = [{ file: ฟอร์ม, id: "f-amount", ชื่อ: "ค่าแรกเข้า", ที่มา: "บอส" }];

let r = ตรวจ({ "scripts/required-fields.json": รายการ(ช่อง),
  [ฟอร์ม]: 'export const C = () => (<>\n  <FieldLabel htmlFor="f-amount" required>ค่าแรกเข้า</FieldLabel>\n  <input id="f-amount" />\n</>);\n' });
ผล(r.ผ่าน, "ช่องในรายการมี <FieldLabel required> → ผ่าน", r.ข้อความ);
r = ตรวจ({ "scripts/required-fields.json": รายการ(ช่อง),
  [ฟอร์ม]: 'export const C = () => (<>\n  <label className="form-label" htmlFor="f-amount">ค่าแรกเข้า *</label>\n  <input id="f-amount" />\n</>);\n' });
ผล(!r.ผ่าน && /f-amount/.test(r.ข้อความ), "ป้ายเขียนเอง (ไม่ใช้ตัวกลาง) → ตก", r.ข้อความ);
r = ตรวจ({ "scripts/required-fields.json": รายการ(ช่อง),
  [ฟอร์ม]: 'export const C = () => (<>\n  <FieldLabel htmlFor="f-amount">ค่าแรกเข้า</FieldLabel>\n  <input id="f-amount" />\n</>);\n' });
ผล(!r.ผ่าน, "ใช้ตัวกลางแต่ลืม required → ตก", r.ข้อความ);
r = ตรวจ({ "scripts/required-fields.json": รายการ(ช่อง),
  [ฟอร์ม]: 'export const C = () => (<>\n  <FieldLabel\n    htmlFor="f-amount" required>ค่าแรกเข้า</FieldLabel>\n  <input id="f-amount"\n    placeholder="เว้นว่างได้" />\n</>);\n' });
ผล(!r.ผ่าน && /เว้นว่าง/.test(r.ข้อความ), "ช่องบังคับยังบอกว่าเว้นว่างได้ (แท็กหลายบรรทัด) → ตก", r.ข้อความ);
r = ตรวจ({ "scripts/required-fields.json": รายการ([{ ...ช่อง[0], file: "apps/hq/หายไป.tsx" }]) });
ผล(!r.ผ่าน && /ไม่มีไฟล์นี้แล้ว/.test(r.ข้อความ), "รายการชี้ไฟล์ที่ไม่มี → ตก", r.ข้อความ);
r = ตรวจ({ "scripts/required-fields.json": รายการ([]),
  [ฟอร์ม]: 'export const C = () => (<>\n  <FieldLabel htmlFor="f-note">หมายเหตุ</FieldLabel>\n  <input id="f-note" placeholder="เว้นว่างได้" />\n</>);\n' });
ผล(r.ผ่าน, "ช่องไม่บังคับบอกว่าเว้นว่างได้ → ผ่าน", r.ข้อความ);

console.log(ตก ? `FAIL ${ตก}` : "ALL PASS");
process.exit(ตก ? 1 : 0);
