// ── ข้อทดสอบ: ตัวตรวจ check-english-ui — คำอังกฤษบนหน้าเว็บที่ไม่อยู่ในรายการยกเว้น = ตก (บอสสั่ง 28 ต.ค. 69) ──
//   รันตัวตรวจจริงกับโฟลเดอร์จำลอง (PMS_EN_CHECK_ROOT) — ไม่แตะโค้ดจริง · รายการยกเว้นใช้ไฟล์จริง scripts/english-ui-allow.json
// รัน: node tests/tools/english-ui.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 800)}`}`); };
const ตรวจ = (ไฟล์) => {
  const ที่ = mkdtempSync(join(tmpdir(), "english-ui-"));
  for (const [f, s] of Object.entries(ไฟล์)) { mkdirSync(dirname(join(ที่, f)), { recursive: true }); writeFileSync(join(ที่, f), s); }
  const r = spawnSync(process.execPath, ["scripts/check-english-ui.mjs"], { encoding: "utf8", env: { ...process.env, PMS_EN_CHECK_ROOT: ที่ } });
  rmSync(ที่, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") };
};

// ตก
let r = ตรวจ({ "apps/hq/app/(app)/hq/pipeline/page.tsx": 'export const C = () => <KpiCard kpi="margin" label="margin เฉลี่ย" />;\n' });
ผล(!r.ผ่าน && /page\.tsx:1 — margin/.test(r.ข้อความ), "การ์ด \"margin เฉลี่ย\" (ใส่ margin กลับ) → ตก", r.ข้อความ);
r = ตรวจ({ "apps/dealer/x.tsx": 'export const C = () => (\n  <p>ผู้รับผิดชอบ · Login ไม่ได้</p>\n);\n' });
ผล(!r.ผ่าน && /x\.tsx:2 — login/.test(r.ข้อความ), "ข้อความในแท็กมีคำอังกฤษ → ตก", r.ข้อความ);
r = ตรวจ({ "packages/shared/components/ui/Y.tsx": 'export const C = ({ ok }: any) => <span>{ok ? "Approved" : "รอ"}</span>;\n' });
ผล(!r.ผ่าน && /approved/.test(r.ข้อความ), "สตริงอังกฤษล้วนในแท็ก (ผ่านเงื่อนไข) → ตก", r.ข้อความ);
r = ตรวจ({ "packages/shared/lib/labels.ts": 'export const ป้าย = { draft: "ร่าง (Draft)" };\n' });
ผล(!r.ผ่าน && /draft/.test(r.ข้อความ), "ป้ายในไฟล์ .ts ที่มีไทยปนอังกฤษ → ตก", r.ข้อความ);

// ผ่าน
r = ตรวจ({ "apps/hq/a.tsx": 'export const C = () => <div title="พิมพ์ PDF · ราคารวม VAT · Excel · Line OA">ใบ HQ · BOQ · KPI · Benjamin · Standard</div>;\n' });
ผล(r.ผ่าน, "คำในรายการยกเว้น (คำทั่วไป · ชื่อเฉพาะ · วลี) → ผ่าน", r.ข้อความ);
r = ตรวจ({ "apps/hq/b.tsx": '// margin ของดีลเลอร์\nexport const C = ({ x }: any) => { console.log("โหลด margin แล้ว"); document.querySelector("[aria-label=\'ชื่อ\']"); return <div className="card" data-kpi={x ? "margin" : "sales"} style={{ marginTop: 4 }} />; };\n' });
ผล(r.ผ่าน, "คอมเมนต์ · ชื่อคลาส/คีย์ · ข้อความลงบันทึกนักพัฒนา · ตัวเลือกหาชิ้น → ผ่าน", r.ข้อความ);
r = ตรวจ({ "packages/shared/lib/x.ts": 'export const ผิด = "lead_status_one_path: เปลี่ยนสถานะเองไม่ได้ · ตั้ง SUPABASE_SERVICE_ROLE_KEY ที่ https://example.com";\n' });
ผล(r.ผ่าน, "ชื่อรหัสมีขีดล่าง · ที่อยู่เว็บ → ผ่าน", r.ข้อความ);
r = ตรวจ({ "packages/shared/lib/mock.ts": 'export const ลูกค้า = "โกดัง VCS Asia ระยอง";\n', "packages/shared/server/v1/x.ts": 'export const ผิด = "ระบุ dealer และ lead";\n' });
ผล(r.ผ่าน, "ข้อมูลตัวอย่าง (mock.ts) · ข้อความฝั่งเซิร์ฟเวอร์ → ไม่อยู่ในขอบเขต", r.ข้อความ);

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
