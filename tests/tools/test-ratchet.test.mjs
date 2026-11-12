// ── ข้อทดสอบ: ตัวตรวจ check-test-ratchet — รอตายตัว + หยิบแถวแรกของรายการ "ห้ามเพิ่ม ลดได้" (บอสสั่ง 12 พ.ย. 69) ─────────────
//   รันตัวตรวจจริงกับโฟลเดอร์จำลอง + ไฟล์เพดานจำลอง (PMS_TEST_RATCHET_FILE) — ไม่แตะไฟล์ทดสอบจริง
//   ตกบนโค้ดเดิม: ไม่มีตัวตรวจ · ชุด checks ไม่ครอบ
// รัน: node tests/tools/test-ratchet.test.mjs
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(0, 900)}`}`); };
if (!existsSync("scripts/check-test-ratchet.mjs")) { ผล(false, "มีตัวตรวจ scripts/check-test-ratchet.mjs"); console.log("\n✗ ตก 1 ข้อ"); process.exit(1); }

const ที่ = mkdtempSync(join(tmpdir(), "ratchet-"));
const เพดาน = join(ที่, "เพดาน.json");
const ตรวจ = (...อ) => { const r = spawnSync(process.execPath, ["scripts/check-test-ratchet.mjs", ที่, ...อ], { encoding: "utf8", env: { ...process.env, PMS_TEST_RATCHET_FILE: เพดาน } }); return { ผ่าน: r.status === 0, ข้อความ: (r.stdout ?? "") + (r.stderr ?? "") }; };
const ไฟล์ = (ชื่อ, เนื้อ) => writeFileSync(join(ที่, ชื่อ), เนื้อ);
try {
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n  await page.locator("tbody tr").first().click();\n});\n`);
  let r = ตรวจ("--update");
  ผล(r.ผ่าน && existsSync(เพดาน), "ตั้งเพดานครั้งแรกจากของที่มี", r.ข้อความ);
  const จ = JSON.parse(readFileSync(เพดาน, "utf8"));
  ผล(จ.รอตายตัว["a.spec.ts"] === 1 && จ.แถวแรก["a.spec.ts"] === 1, "เพดานรายไฟล์: รอตายตัว 1 · แถวแรก 1", JSON.stringify(จ));

  // (ก) รอตายตัวเพิ่ม 1 จุด → ตก
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n  await page.waitForTimeout(900);\n  await page.locator("tbody tr").first().click();\n});\n`);
  r = ตรวจ();
  ผล(!r.ผ่าน && /รอตายตัว.*a\.spec\.ts: 2 จุด เกินเพดาน 1/.test(r.ข้อความ), "(ก) เพิ่ม waitForTimeout 1 จุด → ตก", r.ข้อความ);
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n  await new Promise(r => setTimeout(r, 900));\n  await page.locator("tbody tr").first().click();\n});\n`);
  ผล(!ตรวจ().ผ่าน, "(ก) รอตายตัวแบบ new Promise(setTimeout) ก็นับ → ตก");

  // (ข) หยิบแถวแรกเพิ่ม (แบบ appointment-auto-tick เดิม: ปุ่มดูรายละเอียด .first()) → ตก
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n  await page.locator("tbody tr").first().click();\n  await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();\n});\n`);
  r = ตรวจ();
  ผล(!r.ผ่าน && /หยิบแถวแรก.*a\.spec\.ts: 2 จุด เกินเพดาน 1/.test(r.ข้อความ), "(ข) เพิ่มกดปุ่มดูรายละเอียดแถวแรก → ตก", r.ข้อความ);
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n  await page.locator("tbody tr").first().click();\n  await page.getByRole("row", { name: /^เปิดรายละเอียด/ }).first().click();\n});\n`);
  ผล(!ตรวจ().ผ่าน, "(ข) role row ไม่ระบุชื่อตรงตัว + .first() → ตก");
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n  await page.locator("tbody tr").first().click();\n  const แถว = page.locator("tbody tr");\n  for (let i = 0; i < 5; i++) await แถว.nth(i).locator("td").first().click();\n});\n`);
  ผล(!ตรวจ().ผ่าน, "(ข) เก็บรายการแถวในตัวแปรแล้วไล่ แถว.nth(i) (แบบ lost-reason-other เดิม) → ตก");

  // ไฟล์ใหม่ (ไม่มีในเพดาน) มีรอตายตัว → ตก · ตั้งชื่อ zz- ก็ไม่รอด
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n  await page.locator("tbody tr").first().click();\n});\n`);
  ไฟล์("zz-new.spec.ts", `test("y", async ({ page }) => { await page.waitForTimeout(100); });\n`);
  r = ตรวจ();
  ผล(!r.ผ่าน && /zz-new\.spec\.ts: 1 จุด เกินเพดาน 0/.test(r.ข้อความ), "ไฟล์ใหม่ (รวมชื่อ zz-) เพดาน 0 → ตก", r.ข้อความ);
  r = ตรวจ("--update");
  ผล(!r.ผ่าน, "--update ไม่ขึ้นเพดานให้ไฟล์ใหม่ (ขึ้นได้ทางเดียวคือแก้ไฟล์เพดานเอง)", r.ข้อความ);
  rmSync(join(ที่, "zz-new.spec.ts"));

  // ไม่นับ: แถวที่กรองชื่อ/ชื่อตรงตัว · แถวการ์ด [data-kpi-row] · หมายเหตุ
  ไฟล์("b.spec.ts", [
    `test("z", async ({ page }) => {`,
    `  await page.locator("tbody tr").filter({ hasText: "ZZTEST ของข้อ" }).first().click();`,
    "  await page.getByRole(\"row\", { name: `เปิดรายละเอียดลูกค้า ${ชื่อ}`, exact: true }).click();",
    `  await page.locator("[data-kpi-row] [data-kpi]").first().click();`,
    `  // await page.waitForTimeout(900); await page.locator("tbody tr").first().click();`,
    `});`].join("\n"));
  r = ตรวจ();
  ผล(r.ผ่าน, "ไม่นับ: กรองด้วยชื่อ · ชื่อตรงตัว · แถวการ์ด · หมายเหตุ", r.ข้อความ);

  // ลดได้: เอาออกแล้วผ่าน + บอกให้ลด · --update ลดเพดาน
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await expect(page.getByRole("row", { name: "เปิด ก", exact: true })).toBeVisible();\n});\n`);
  r = ตรวจ();
  ผล(r.ผ่าน && /ลดเพดานได้/.test(r.ข้อความ), "เอาออก = ผ่าน + บอกให้ลดเพดาน", r.ข้อความ);
  ตรวจ("--update");
  const ลด = JSON.parse(readFileSync(เพดาน, "utf8"));
  ผล(ลด.รอตายตัว["a.spec.ts"] === undefined && ลด.แถวแรก["a.spec.ts"] === undefined, "--update ลดเพดานลงตามจริง (0 = เอาออกจากไฟล์เพดาน)", JSON.stringify(ลด));
  ไฟล์("a.spec.ts", `test("x", async ({ page }) => {\n  await page.waitForTimeout(500);\n});\n`);
  ผล(!ตรวจ().ผ่าน, "ลดแล้วเพิ่มกลับ = ตก (เพดานไม่เด้งกลับ)");
} finally { rmSync(ที่, { recursive: true, force: true }); }

// ของจริง
const จริง = spawnSync(process.execPath, ["scripts/check-test-ratchet.mjs"], { encoding: "utf8" });
ผล(จริง.status === 0, "ข้อทดสอบจริง (tests/scenario) ไม่เกินเพดาน", (จริง.stdout ?? "") + (จริง.stderr ?? ""));
const ชุด = JSON.parse(readFileSync("package.json", "utf8")).scripts.checks ?? "";
ผล(ชุด.includes("check-test-ratchet.mjs"), "ชุดตัวตรวจ (npm run checks) ครอบ check-test-ratchet", ชุด.slice(0, 200));

console.log(ตก ? `\n✗ ตก ${ตก} ข้อ` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
