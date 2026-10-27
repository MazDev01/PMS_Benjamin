// ── ข้อทดสอบ: ตัวตรวจ check-lead-stage-map ข้อ 4 — หน้าจอแสดงชื่อ/สีสถานะภายในแทนชื่อขั้น ต้องตก (บอสสั่ง 27 ต.ค. 69) ──
//   รันตัวตรวจจริงกับโฟลเดอร์จำลอง (PMS_STAGE_CHECK_ROOT) — ไม่แตะโค้ดจริง
// รัน: node tests/tools/lead-stage-map.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };
const ตรวจ = (ไฟล์) => {
  const ที่ = mkdtempSync(join(tmpdir(), "stage-map-"));
  for (const [f, s] of Object.entries(ไฟล์)) { mkdirSync(dirname(join(ที่, f)), { recursive: true }); writeFileSync(join(ที่, f), s); }
  const r = spawnSync(process.execPath, ["scripts/check-lead-stage-map.mjs"], { encoding: "utf8", env: { ...process.env, PMS_STAGE_CHECK_ROOT: ที่ } });
  rmSync(ที่, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
};

let r = ตรวจ({ "apps/dealer/table.tsx": 'export const C = ({ l }: any) => <span>{leadStatusLabel[l.status]}</span>;\n' });
ผล(!r.ผ่าน && /leadStatusLabel/.test(r.ข้อความ), "ตารางแสดง leadStatusLabel[…] (เช่น \"รอราคา HQ\") → ตก", r.ข้อความ);
r = ตรวจ({ "packages/shared/components/x.tsx": 'export const s = (l: any) => leadStatusColor[l.status].bg;\n' });
ผล(!r.ผ่าน && /leadStatusColor/.test(r.ข้อความ), "ป้ายใช้สีสถานะภายใน leadStatusColor[…] → ตก", r.ข้อความ);
r = ตรวจ({ "apps/dealer/form.tsx": 'export const o = (["WAITING","BULLET"] as any[]).map(s => <option key={s}>{leadStatusLabel[s]}</option>);\n' });
ผล(r.ผ่าน, "ตัวเลือกฟอร์มเพิ่มลีดตาม FLOW D2 (\"WAITING\",\"BULLET\") → ผ่าน", r.ข้อความ);
r = ตรวจ({ "apps/dealer/ok.tsx": 'export const C = ({ n }: any) => <span>{ชื่อขั้น(n)}</span>;\n' });
ผล(r.ผ่าน, "ใช้ ชื่อขั้น() จากตัวกลาง → ผ่าน", r.ข้อความ);
r = ตรวจ({ "packages/shared/lib/leadIntent.ts": 'export const t = (s: any) => `เปลี่ยนขั้นเป็น "${leadStatusLabel[s]}"`;\n' });
ผล(r.ผ่าน, "ข้อความไทม์ไลน์ในตัวบันทึกลีด (ไม่ใช่หน้าจอ · ตรงกับฐาน) → ผ่าน", r.ข้อความ);

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
