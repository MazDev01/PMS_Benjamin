// ── ข้อทดสอบ: ตัวตรวจ check-reason-dialogs — ช่องเหตุผลที่เขียนเองในหน้าต้องตก (บอสสั่ง 28 ต.ค. 69) ──
//   รันตัวตรวจจริงกับโฟลเดอร์จำลอง (PMS_REASON_CHECK_ROOT) — ไม่แตะโค้ดจริง
// รัน: node tests/tools/reason-dialogs.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };
const ตรวจ = (ไฟล์) => {
  const ที่ = mkdtempSync(join(tmpdir(), "reason-dialogs-"));
  for (const [f, s] of Object.entries(ไฟล์)) { mkdirSync(dirname(join(ที่, f)), { recursive: true }); writeFileSync(join(ที่, f), s); }
  const r = spawnSync(process.execPath, ["scripts/check-reason-dialogs.mjs"], { encoding: "utf8", env: { ...process.env, PMS_REASON_CHECK_ROOT: ที่ } });
  rmSync(ที่, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
};

let r = ตรวจ({ "packages/shared/components/ui/Panel.tsx": 'export const C = () => (\n  <textarea id="qr-cancel-reason" aria-label="เหตุผลที่ยกเลิก" rows={2} />\n);\n' });
ผล(!r.ผ่าน && /Panel\.tsx:2/.test(r.ข้อความ), "แผงเขียนช่อง \"เหตุผลที่ยกเลิก\" เอง → ตก", r.ข้อความ);
r = ตรวจ({ "apps/hq/x.tsx": 'export const C = ({ v, set }: any) => (\n  <input value={v}\n    onChange={e => set("lostReason", e.target.value)} />\n);\n' });
ผล(!r.ผ่าน, "ช่องผูกค่า lostReason (แท็กหลายบรรทัด · ไม่มีคำว่าเหตุผล) → ตก", r.ข้อความ);
r = ตรวจ({ "apps/dealer/y.tsx": 'import { LostReasonPicker } from "./LostReasonPicker";\nexport const C = () => null;\n' });
ผล(!r.ผ่าน && /LostReasonPicker/.test(r.ข้อความ), "เรียกตัวเลือกเหตุผลแบบเดิม (LostReasonPicker) → ตก", r.ข้อความ);
r = ตรวจ({ "packages/shared/components/ui/ConfirmToast.tsx": 'export const C = () => <textarea aria-label="เหตุผล" />;\n' });
ผล(r.ผ่าน, "ช่องเหตุผลในกล่องกลาง (ConfirmToast.tsx) → ผ่าน", r.ข้อความ);
r = ตรวจ({ "apps/hq/settings.tsx": 'export const C = () => (<>\n  {/* ช่องตั้งรายการเหตุผลของ HQ — ไม่ใช่กล่องเหตุผล */}\n  <input placeholder="เพิ่มเหตุผล…" />\n</>);\n' });
ผล(r.ผ่าน, "ช่องที่กำกับ \"ไม่ใช่กล่องเหตุผล\" (ตั้งรายการเหตุผล) → ผ่าน", r.ข้อความ);
r = ตรวจ({ "apps/hq/z.tsx": '// ใช้ <select> แทนปุ่มเหตุผล\nexport const C = () => <input aria-label="ชื่อบริษัท" />;\n' });
ผล(r.ผ่าน, "คอมเมนต์ที่พูดถึง <select> · ช่องอื่นที่ไม่ใช่เหตุผล → ผ่าน", r.ข้อความ);

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
