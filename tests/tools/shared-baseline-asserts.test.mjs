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

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
