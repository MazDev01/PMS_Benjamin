// ── ข้อทดสอบตัวกันหลุด flow (บอสสั่ง 28 ต.ค. 69): check-old-flow-words · check-flow-step-tests ─────────────────────────────
// โฟลเดอร์จำลอง (PMS_OLD_WORDS_ROOT · PMS_FLOW_STEP_ROOT) — ตัวตรวจจริงกับไฟล์ปลอม ไม่แตะโค้ดจริง
// รัน: node tests/tools/flow-guards.test.mjs
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1200)}`}`); };
const เขียน = (root, rel, s) => { mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); writeFileSync(path.join(root, rel), s); };

// ── คำของ flow เก่า ──
const คำ = (ไฟล์, ยกเว้น = []) => {
  const root = mkdtempSync(path.join(tmpdir(), "old-words-"));
  เขียน(root, "scripts/old-flow-words.json", JSON.stringify({
    คำ: [{ คำ: "ติดตามผล", เหตุ: "เลิกใช้" }, { คำ: "ประเมินราคา", เหตุ: "เลิกใช้" }],
    แบบ: [{ แบบ: "^[1-5]\\s*[·.]?\\s*(ข้อมูลลูกค้า|ขอราคา HQ)$", เหตุ: "ไม่มีเลข" }], ยกเว้น }));
  for (const [rel, s] of Object.entries(ไฟล์)) เขียน(root, rel, s);
  const r = spawnSync(process.execPath, [path.join(ราก, "scripts/check-old-flow-words.mjs")], { encoding: "utf8", env: { ...process.env, PMS_OLD_WORDS_ROOT: root } });
  rmSync(root, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ออก: r.stdout + r.stderr };
};
const หน้า = "apps/dealer/app/(app)/x/page.tsx";
ผล(!คำ({ [หน้า]: `export default () => <div>สถานะ ติดตามผล</div>;` }).ผ่าน, "คำเก่าในข้อความ JSX → ตก");
ผล(!คำ({ [หน้า]: `export const ป้าย = "ประเมินราคา";` }).ผ่าน, "คำเก่าในสตริง → ตก");
ผล(!คำ({ [หน้า]: "export const f = (n: number) => `ขั้น ${n} ติดตามผล`;" }).ผ่าน, "คำเก่าในเทมเพลต → ตก");
ผล(!คำ({ [หน้า]: `export default () => <span>2 · ขอราคา HQ</span>;` }).ผ่าน, "ชื่อขั้นมีเลขลำดับนำหน้า → ตก");
ผล(คำ({ [หน้า]: `// เดิมมีขั้นติดตามผล\nexport default () => <div>นัดหมาย</div>;` }).ผ่าน, "คำเก่าในคอมเมนต์ → ผ่าน (ไม่ขึ้นจอ)");
ผล(คำ({ [หน้า]: `export default () => <div>ราคาประเมินจากวัสดุ</div>;` }).ผ่าน, "คำที่คล้ายแต่เป็นของ flow ใหม่ (ราคาประเมินจากวัสดุ) → ผ่าน");
ผล(คำ({ "packages/shared/lib/mock.ts": `export const l = { FOLLOWUP: "ติดตามผล" };` }).ผ่าน, "ตารางสถานะภายใน (ไม่ขึ้นจอ) → ผ่าน");
ผล(คำ({ [หน้า]: `export default () => <div>ติดตามผลประกอบการ</div>;` }, [{ ไฟล์: หน้า, คำ: "ติดตามผล", เหตุ: "ผลประกอบการ" }]).ผ่าน, "ยกเว้นพร้อมเหตุผล → ผ่าน");
ผล(!คำ({ [หน้า]: `export default () => <div>ติดตามผลประกอบการ</div>;` }, [{ ไฟล์: หน้า, คำ: "ติดตามผล", เหตุ: "" }]).ผ่าน, "ยกเว้นไม่มีเหตุผล → ตก");
ผล(คำ({ [หน้า]: `export default () => <div>ข้อมูลลูกค้า</div>;` }).ผ่าน, "ชื่อขั้นไม่มีเลข → ผ่าน");

// ── ข้อทดสอบรายขั้น ──
const ขั้น = (สเปก, แถวเพิ่ม = "") => {
  const root = mkdtempSync(path.join(tmpdir(), "flow-steps-"));
  เขียน(root, "docs/FLOW.html", `<table><tr><td>D1</td><td>เข้าระบบ</td></tr><tr><td>D3x</td><td>ยกเลิกคำขอ</td></tr><tr><td>H9</td><td>ส่งใบ HQ</td></tr>${แถวเพิ่ม}
    <tr data-notif-row="D5"><td>D5</td><td>แจ้งเตือน (ไม่ใช่ขั้น)</td></tr></table>`);
  for (const [f, s] of Object.entries(สเปก)) เขียน(root, `tests/scenario/${f}`, s);
  const r = spawnSync(process.execPath, [path.join(ราก, "scripts/check-flow-step-tests.mjs")], { encoding: "utf8", env: { ...process.env, PMS_FLOW_STEP_ROOT: root } });
  rmSync(root, { recursive: true, force: true });
  return { ผ่าน: r.status === 0, ออก: r.stdout + r.stderr };
};
const ครบ = { "a.spec.ts": `test("[D1] เข้าระบบ", () => {});\ntest.describe("[D3x] [H9] ยกเลิกแล้ว HQ", () => {});` };
ผล(ขั้น(ครบ).ผ่าน, "ทุกขั้นมีข้อติดรหัส (หลายรหัสในชื่อเดียวได้ · แถวแจ้งเตือนไม่นับเป็นขั้น) → ผ่าน", ขั้น(ครบ).ออก);
const ขาด = ขั้น({ "a.spec.ts": `test("[D1] เข้าระบบ", () => {});` });
ผล(!ขาด.ผ่าน && /D3x/.test(ขาด.ออก) && /H9/.test(ขาด.ออก), "ขั้นไม่มีข้อ → ตก บอกรหัสที่ขาด", ขาด.ออก);
ผล(!ขั้น({ ...ครบ, "zz-shots-x.spec.ts": `test("[D7] รูป", () => {});` }, "<tr><td>D7</td><td>นัด</td></tr>").ผ่าน, "รหัสในไฟล์ถ่ายรูป zz-shots ไม่นับ → ขั้นนั้นยังขาด → ตก");
ผล(!ขั้น({ ...ครบ, "x-tool.spec.ts": `test("[D7] เครื่องมือ", () => {});` }, "<tr><td>D7</td><td>นัด</td></tr>").ผ่าน, "รหัสในข้อทดสอบเครื่องมือ *-tool ไม่นับ → ตก");
ผล(!ขั้น({ ...ครบ, "b.spec.ts": `test("[D99] พิมพ์ผิด", () => {});` }).ผ่าน, "รหัสที่ FLOW ไม่มี → ตก");
ผล(!ขั้น(ครบ, "<tr><td>H13</td><td>ขั้นใหม่ใน FLOW</td></tr>").ผ่าน, "FLOW เพิ่มขั้นใหม่ → ตกจนกว่าจะมีข้อทดสอบ (อ่านขั้นจาก FLOW ไม่ใช่รายการตายตัว)");

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
