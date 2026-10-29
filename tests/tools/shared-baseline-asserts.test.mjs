// ── ข้อทดสอบของ scripts/check-shared-baseline-asserts.mjs (บอสสั่ง 29 ต.ค. 69 · คิวรอบหน้าข้อ 3) ─────────────────────
// โฟลเดอร์จำลอง: tests/scenario/*.spec.ts ตัวอย่าง + รายการยกเว้น → ตัวตรวจต้อง
//   ① ตก: ข้อใหม่นับลีด RYG ที่ฐานแล้วเทียบตรงเป๊ะกับการ์ด (ไม่สร้างข้อมูลเอง)
//   ② ตก: ข้อใหม่อ่านยอดทั้งเครือจากฐาน (count exact) เทียบกับหน้าจอ
//   ③ ผ่าน: ข้อแบบเดียวกันแต่สร้างสาขาของข้อเอง (สร้างสาขาของข้อ)
//   ④ ผ่าน: ข้อนับแถวที่กรองด้วยป้ายของข้อ (ZZTEST-…${Date.now()})
//   ⑤ ผ่าน: ข้อเก่าที่อยู่ในรายการยกเว้น
//   ⑥ ตก: ข้อในรายการยกเว้นที่แก้แล้ว ยังค้างในรายการ (รายการต้องหด)
//   ⑦ ตก: เพิ่มชื่อใหม่ในรายการยกเว้น (ไม่มีในรายการฐาน)
// รัน: node tests/tools/shared-baseline-asserts.test.mjs   (PMS_SBA_SCRIPT = ตัวตรวจอื่น ใช้พิสูจน์ว่าโค้ดเดิมตก)
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const สคริปต์ = process.env.PMS_SBA_SCRIPT || path.resolve("scripts/check-shared-baseline-asserts.mjs");
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1200)}`}`); };

const ข้อนับRYG = `test("[kpi] การ์ดลีด RYG ตรงฐาน", async ({ page }) => {
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", "RYG");
  await expect(page.locator('[data-kpi="leads"] [data-value]')).toHaveAttribute("data-value", String(count));
});
`;
const ข้อทั้งเครือ = `test("[hq] ยอดลูกค้าทั้งเครือตรงฐาน", async ({ page }) => {
  const { count } = await admin.from("customers").select("id", { count: "exact", head: true });
  expect(Number((await page.locator(".kpi").first().innerText()).replace(/[^\\d]/g, ""))).toBe(count);
});
`;
const ข้อสาขาเอง = `test("[kpi] การ์ดลีดของสาขาตัวเอง", async ({ page }) => {
  const สาขา = await สร้างสาขาของข้อ();
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", สาขา.รหัส);
  await expect(page.locator('[data-kpi="leads"] [data-value]')).toHaveAttribute("data-value", String(count));
});
`;
const ข้อป้าย = `test("[dealer] ตัวกรองเหลือเฉพาะชุดของข้อ", async ({ page }) => {
  const ป้าย = \`ZZTEST-ตัวกรอง-\${Date.now() % 100000}\`;
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).like("company", \`\${ป้าย}%\`);
  await page.getByPlaceholder("ค้นหา").fill(ป้าย);
  await expect(page.locator("tbody tr")).toHaveCount(count ?? 0);
});
`;

function ลอง(ไฟล์, รายการ, ฐาน) {
  const ราก = mkdtempSync(path.join(tmpdir(), "pms-sba-"));
  try {
    mkdirSync(path.join(ราก, "tests/scenario"), { recursive: true });
    mkdirSync(path.join(ราก, "scripts"), { recursive: true });
    for (const [ชื่อ, เนื้อ] of Object.entries(ไฟล์)) writeFileSync(path.join(ราก, "tests/scenario", ชื่อ), `import { test, expect } from "@playwright/test";\n${เนื้อ}`);
    if (รายการ) writeFileSync(path.join(ราก, "scripts/shared-baseline-allowlist.json"), JSON.stringify({ ข้อ: รายการ }));
    const ที่ฐาน = path.join(ราก, "base-list.json");
    writeFileSync(ที่ฐาน, JSON.stringify({ ข้อ: ฐาน ?? รายการ ?? [] }));
    if (!existsSync(สคริปต์)) return { status: "ไม่มีตัวตรวจ", ออก: `ไม่มีไฟล์ ${สคริปต์}` };
    const r = spawnSync(process.execPath, [สคริปต์], { encoding: "utf8", env: { ...process.env, PMS_SBA_ROOT: ราก, PMS_SBA_BASE_LIST: ที่ฐาน } });
    return { status: r.status, ออก: (r.stdout ?? "") + (r.stderr ?? "") };
  } finally { rmSync(ราก, { recursive: true, force: true }); }
}

let r = ลอง({ "kpi.spec.ts": ข้อนับRYG });
ผล(r.status === 1 && r.ออก.includes("kpi.spec.ts › [kpi] การ์ดลีด RYG ตรงฐาน"), "① ข้อใหม่นับลีด RYG แล้วเทียบการ์ดตรงเป๊ะ → ตก พร้อมชื่อข้อ", r.ออก);
r = ลอง({ "hq.spec.ts": ข้อทั้งเครือ });
ผล(r.status === 1 && r.ออก.includes("hq.spec.ts › [hq] ยอดลูกค้าทั้งเครือตรงฐาน"), "② ข้อใหม่นับลูกค้าทั้งเครือแล้วเทียบหน้าจอ → ตก", r.ออก);
r = ลอง({ "own.spec.ts": ข้อสาขาเอง });
ผล(r.status === 0, "③ ข้อที่สร้างสาขาของข้อเอง → ผ่าน", r.ออก);
r = ลอง({ "label.spec.ts": ข้อป้าย });
ผล(r.status === 0, "④ ข้อที่นับเฉพาะแถวที่มีป้ายของข้อ → ผ่าน", r.ออก);
r = ลอง({ "kpi.spec.ts": ข้อนับRYG }, ["kpi.spec.ts › [kpi] การ์ดลีด RYG ตรงฐาน"]);
ผล(r.status === 0, "⑤ ข้อเก่าในรายการยกเว้น → ผ่าน (ยังไม่ได้แก้)", r.ออก);
r = ลอง({ "kpi.spec.ts": ข้อสาขาเอง }, ["kpi.spec.ts › [kpi] การ์ดลีดของสาขาตัวเอง"]);
ผล(r.status === 1 && /แก้แล้ว/.test(r.ออก), "⑥ ข้อในรายการที่แก้แล้วยังค้างในรายการ → ตก (รายการต้องหด)", r.ออก);
r = ลอง({ "kpi.spec.ts": ข้อนับRYG, "hq.spec.ts": ข้อทั้งเครือ }, ["kpi.spec.ts › [kpi] การ์ดลีด RYG ตรงฐาน", "hq.spec.ts › [hq] ยอดลูกค้าทั้งเครือตรงฐาน"], ["kpi.spec.ts › [kpi] การ์ดลีด RYG ตรงฐาน"]);
ผล(r.status === 1 && /เพิ่มรายการยกเว้นไม่ได้/.test(r.ออก) && r.ออก.includes("hq.spec.ts › [hq] ยอดลูกค้าทั้งเครือตรงฐาน"), "⑦ เพิ่มชื่อใหม่เข้ารายการยกเว้น → ตก", r.ออก);

// ⑧ ช่องโหว่ที่ ef พบ (29 ต.ค. 69): beforeAll สร้างสาขาของข้อ แต่ข้อในไฟล์ยังนับยอดทั้งเครือโดยไม่ใช้สาขานั้น → ต้องตก
const ไฟล์สาขาในฮุก = `let สาขา; let CODE = "";
test.beforeAll(async () => { สาขา = await สร้างสาขาของข้อ(); CODE = สาขา.รหัส; });
test("[hq] ใช้สาขาของไฟล์", async ({ page }) => {
  const { count } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", CODE);
  await expect(page.locator('[data-kpi="leads"] [data-value]')).toHaveAttribute("data-value", String(count));
});
` + ข้อทั้งเครือ;
r = ลอง({ "mixed.spec.ts": ไฟล์สาขาในฮุก });
ผล(r.status === 1 && r.ออก.includes("mixed.spec.ts › [hq] ยอดลูกค้าทั้งเครือตรงฐาน") && !r.ออก.includes("mixed.spec.ts › [hq] ใช้สาขาของไฟล์"),
  "⑧ beforeAll สร้างสาขาของข้อ: ข้อที่ใช้สาขานั้นผ่าน · ข้อที่ยังนับทั้งเครือในไฟล์เดียวกันต้องตก", r.ออก);

// ⑨ บอสตัดสิน 29 ต.ค. 69: ข้อที่ยังนับทั้งเครือ ต้องไม่ขึ้นว่า "แก้แล้ว" เพราะคำในคอมเมนต์ (ตัวกรองสาขา:) หรือตัวแปรชื่อสั้นจากสาขาของไฟล์ (c = สาขา.รหัส)
const ไฟล์คอมเมนต์ = `let สาขา;
test.beforeAll(async () => { สาขา = await สร้างสาขาของข้อ(); const c = สาขา.รหัส; void c; });
async function ตรวจเลข(page, sb) {
  const { data } = await sb.rpc("kpi_cards", { p_page: "hq.prospects" });
  const จอ = await page.locator('[data-kpi="talking"] [data-value]').getAttribute("data-value");
  expect([จอ].map(c => c)).toEqual([String(data.talking)]);
}
// หน้า HQ ไม่มีตัวกรองสาขา: ผู้สนใจ — ไม่ได้ใช้สาขาของข้อ
test("[kpi·hq] ทุกหน้า HQ", async ({ page }) => { await ตรวจเลข(page, sb); });
`;
r = ลอง({ "kpi.spec.ts": ไฟล์คอมเมนต์ });
ผล(r.status === 1 && r.ออก.includes("kpi.spec.ts › [kpi·hq] ทุกหน้า HQ"), "⑨ คอมเมนต์มีคำว่าสาขา / ตัวแปรชื่อสั้น ไม่นับเป็นข้อมูลของข้อ → ยังตก", r.ออก);

// ⑩ บอสตัดสิน 29 ต.ค. 69: ตรวจแค่ "มีการ์ด 4 ใบ + ป้าย" ไม่ได้อ่านตัวเลข → ต้องไม่ถูกจับ
const ข้อโครงการ์ด = `test("[ux·hq] KPI 4 ตัว", async ({ page }) => {
  const tiles = page.locator("[data-kpi-row] [data-kpi]");
  await expect(tiles).toHaveCount(4);
  await expect(page.locator("[data-kpi='acceptRate']")).toContainText("ตอบรับ ÷ ใบที่ส่งในช่วงนี้");
});
`;
r = ลอง({ "tiles.spec.ts": ข้อโครงการ์ด });
ผล(r.status === 0, "⑩ ข้อที่ตรวจแค่จำนวนการ์ดกับป้าย (ไม่อ่านตัวเลข) → ผ่าน ไม่ถูกจับ", r.ออก);

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
