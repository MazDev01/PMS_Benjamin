// ── ข้อทดสอบ: ตัวตรวจข้อทดสอบข้ามตัวเอง (scripts/check-test-self-skip.mjs · บอสสั่ง 11 พ.ย. 69) ─────────────────────────
//   ไฟล์ทดสอบจำลองในโฟลเดอร์ชั่วคราว:
//   ตก: ข้ามเพราะไม่มีข้อมูล (test.skip(!rows.length)) · test.skip() เปล่า · คืนค่าเงียบ if (!(await x.count())) return; ·
//       if (await x.count()) { ตรวจ } · if (!rows.length) continue;
//   ผ่าน: ข้ามเพราะสภาพแวดล้อม (skipReason · process.env) · มีเครื่องหมาย // ข้ามตั้งใจ: / // ไม่ใช่การข้าม: · expect("ขาดข้อมูล")
//   รายงาน (check-e2e-ran.mjs): ข้อที่ถูกข้ามแยกจำนวนตามเหตุผล
//   ตกบนโค้ดเดิม: ไม่มีตัวตรวจ · รายงานไม่แยกจำนวนตามเหตุผล
// รัน: node tests/tools/test-self-skip.test.mjs (ไม่แตะฐาน)
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-900)}`}`); };
const ตัวตรวจ = join(ราก, "scripts/check-test-self-skip.mjs");
ผล(existsSync(ตัวตรวจ), "มีตัวตรวจ scripts/check-test-self-skip.mjs");

const ที่ = mkdtempSync(join(tmpdir(), "self-skip-"));
const ตรวจไฟล์ = (ชื่อ, เนื้อ) => {
  const d = join(ที่, ชื่อ.replace(/\W/g, "_")); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "x.spec.ts"), `import { test, expect } from "@playwright/test";\n${เนื้อ}\n`);
  const r = spawnSync(process.execPath, [ตัวตรวจ, d], { encoding: "utf8" });
  return { ผ่าน: r.status === 0, ออก: `${r.stdout}${r.stderr}` };
};
try {
  const ต้องตก = [
    ["ข้ามเพราะไม่มีข้อมูล", `test("a", async () => { const rows = []; test.skip(!rows.length, "ยังไม่มีข้อมูล"); });`],
    ["ข้ามเปล่าไม่มีเหตุผล", `test("a", async () => { test.skip(); });`],
    ["คืนค่าเงียบเมื่อไม่มีแถว", `test("a", async ({ page }) => { const แถว = page.locator("tr");\n  if (!(await แถว.count())) return;\n  expect(1).toBe(1); });`],
    ["ตรวจเฉพาะเมื่อมีของ (if count { expect })", `test("a", async ({ page }) => { const c = page.locator(".card");\n  if (await c.count()) {\n    expect(1).toBe(1);\n  } });`],
    ["ข้ามวนเงียบเมื่อว่าง", `test("a", async () => { for (const rows of [[]]) {\n    if (!rows.length) continue;\n    expect(rows).toEqual([]); } });`],
  ];
  for (const [ชื่อ, เนื้อ] of ต้องตก) { const r = ตรวจไฟล์(ชื่อ, เนื้อ); ผล(!r.ผ่าน && /check-test-self-skip/.test(r.ออก), `ตก: ${ชื่อ}`, r.ออก); }
  const ต้องผ่าน = [
    ["ข้ามเพราะสภาพแวดล้อม (skipReason)", `test.skip(() => skipReason() !== "", "ยังไม่ได้ตั้งค่า");`],
    ["ข้ามเพราะตัวแปรแวดล้อม", `test.skip(!process.env.PMS_SHOTS, "รันเองเมื่อสั่ง");`],
    ["ข้ามตั้งใจพร้อมเครื่องหมาย", `test("a", async () => { const ok = false; test.skip(!ok, "ข้อก่อนหน้าไม่ผ่าน");   // ข้ามตั้งใจ: ข้อก่อนหน้าในไฟล์ตก\n});`],
    ["คืนค่าในตัวล้างพร้อมเครื่องหมาย", `let ส: string | null = null;\ntest.afterAll(async () => {\n  if (!ส) return;   // ไม่ใช่การข้าม: ตัวล้าง\n});`],
    ["ไม่มีข้อมูล = expect ตก", `test("a", async () => { const rows = [1]; expect(rows.length, "ขาดข้อมูล: ไม่มีแถว").toBeGreaterThan(0); });`],
  ];
  for (const [ชื่อ, เนื้อ] of ต้องผ่าน) { const r = ตรวจไฟล์(ชื่อ, เนื้อ); ผล(r.ผ่าน, `ผ่าน: ${ชื่อ}`, r.ออก); }

  // รายงานรอบตรวจ: ข้อที่ถูกข้ามแยกจำนวนตามเหตุผล
  const รายงาน = join(ที่, "report.json");
  const ข้อ = (title, line, เหตุ) => ({ title, line, tests: [{ projectName: "chromium", status: "skipped", results: [{ status: "skipped" }], annotations: [{ type: "skip", description: เหตุ }] }] });
  writeFileSync(รายงาน, JSON.stringify({ suites: [{ title: "x", file: "a.spec.ts", specs: [ข้อ("ก", 1, "รันเองเมื่อสั่ง PMS_SHOTS"), ข้อ("ข", 2, "รันเองเมื่อสั่ง PMS_SHOTS"), ข้อ("ค", 3, "โหมดในเครื่องเท่านั้น")] }] }));
  const r = spawnSync(process.execPath, [join(ราก, "scripts/check-e2e-ran.mjs"), รายงาน], { encoding: "utf8" });
  const ออก = `${r.stdout}${r.stderr}`;
  ผล(/แยกตามเหตุผล 2 เหตุผล/.test(ออก) && /รันเองเมื่อสั่ง PMS_SHOTS — 2 ข้อ/.test(ออก) && /โหมดในเครื่องเท่านั้น — 1 ข้อ/.test(ออก),
    "รายงานรอบตรวจแยกจำนวนข้อที่ข้ามตามเหตุผล", ออก);

  // ไฟล์ทดสอบจริงของโปรเจกต์ผ่านตัวตรวจ
  const จริง = spawnSync(process.execPath, [ตัวตรวจ], { cwd: ราก, encoding: "utf8" });
  ผล(จริง.status === 0, "ไฟล์ทดสอบจริง (tests/scenario) ไม่มีการข้ามตัวเองแบบไม่มีเหตุผล", `${จริง.stdout}${จริง.stderr}`);
} finally { rmSync(ที่, { recursive: true, force: true }); }

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
