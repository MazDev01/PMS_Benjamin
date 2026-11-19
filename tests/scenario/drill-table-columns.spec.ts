import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, ช่องตัวกรอง, เลือกตัวกรอง, ตัวเลือกของตัวกรอง } from "./helpers";

// ── ตารางในหน้าเจาะลึก 4 หน้า (บอสสั่ง 9 พ.ย. 69 · ตัวกลาง lib/drillColumns.ts) ──────────────────────────────────────────
//   1) เจาะถึงดีลเลอร์รายเดียว → ไม่มีคอลัมน์ "ดีลเลอร์" (หัวตารางบอกชื่อแล้ว) · ทั้งเครือ = มี
//   2) บรรทัดภูมิภาคใต้ชื่อ (ไม่ใช่คอลัมน์): ทุกแถวเป็นค่าเดียวกับระดับ = ซ่อน
//      คอลัมน์ภูมิภาค/จังหวัด: แสดงเสมอ — ตรวจกลับด้าน (บอสตอบ 10 พ.ย. 69 · ล็อกความกว้างคอลัมน์ ทับ 9 พ.ย. "ภูมิภาค/จังหวัดซ้ำระดับซ่อน")
//      เจาะภาค/จังหวัด หัวคอลัมน์ชุดเดิมทุกคอลัมน์ (ตำแหน่งเดิม) · ซ่อนเฉพาะดีลเลอร์ตอนเจาะถึงดีลเลอร์รายเดียว
//   3) จอ 1366 ไม่มีแถบเลื่อนแนวนอน ทุกระดับ (ทั้งตารางสรุปและตารางรายชื่อ)
//   ตกบนโค้ดเดิม: ตารางรายชื่อลูกค้าเป้าหมายกว้าง 1,284px · ใบเสนอราคา 1,678px (กรอบ 1,042px) · ระดับดีลเลอร์ยังมีคอลัมน์ดีลเลอร์
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const DEALER = "RYG";
/** ทุก .table-wrap บนหน้า ไม่มีแถบเลื่อนแนวนอน (scrollWidth ≤ clientWidth) — คืนรายชื่อตารางที่ล้น */
const ล้น = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".table-wrap")]
  .filter(w => w.offsetParent !== null && w.scrollWidth > w.clientWidth + 1)
  .map(w => `${w.querySelector("table")?.getAttribute("aria-label")} (${w.scrollWidth} > ${w.clientWidth})`));
async function เปิด(page: Page, path: string) {
  await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
  await settle(page);
}
// ช่องตัวกรองเป็นตัวกลางทำเอง (FilterSelect · บอสสั่ง 11 พ.ย. 69 แทน <select>) — เลือกตามค่า รอจนตัวเลือกโหลด (คลิกรอตัวเลือกขึ้นเอง)
async function เลือก(page: Page, ป้าย: string, ค่า: string) {
  await เลือกตัวกรอง(page, ป้าย, { ค่า });
  await expect(ช่องตัวกรอง(page, ป้าย)).toHaveAttribute("data-filter-value", ค่า);
  await settle(page);
}
/** ตัวเลือกที่ 2 (ถัดจาก "ทั้งหมด") ของช่องตัวกรอง — รอจนรายการโหลด */
async function ตัวเลือกที่สอง(page: Page, ป้าย: string) {
  let ได้: { ค่า: string; ข้อความ: string }[] = [];
  await expect.poll(async () => (ได้ = await ตัวเลือกของตัวกรอง(page, ป้าย)).length, { timeout: 25_000, message: `ตัวเลือกของ ${ป้าย} โหลดแล้ว` }).toBeGreaterThan(1);
  return ได้[1];
}
const หัว = (page: Page, ตาราง: string) => page.getByRole("table", { name: ตาราง }).locator("thead th");

for (const { path, ตาราง, ช่องดีลเลอร์, หัวดีลเลอร์ } of [
  { path: "/hq/leads", ตาราง: "ตารางลูกค้าเป้าหมายทั้งเครือ", ช่องดีลเลอร์: '[data-cell="dealer"]', หัวดีลเลอร์: /^ดีลเลอร์$/ },
  { path: "/hq/quotations", ตาราง: "รายการใบเสนอราคา", ช่องดีลเลอร์: '[data-col="dealer"]', หัวดีลเลอร์: /ดีลเลอร์/ },
  { path: "/hq/customers", ตาราง: "รายชื่อลูกค้า", ช่องดีลเลอร์: '[data-col="dealer"]', หัวดีลเลอร์: /^ดีลเลอร์$/ },
]) {
  test(`[ui·hq] ${path}: ทั้งเครือมีคอลัมน์ดีลเลอร์ · เจาะถึงดีลเลอร์ไม่มี · จอ 1366 ไม่ล้นทุกระดับ`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: 1366, height: 820 });
    await loginUI(page, HQ_ORIGIN, path, ADMIN);
    await settle(page);
    const รายชื่อ = page.getByRole("table", { name: ตาราง });
    await expect(รายชื่อ.locator(ช่องดีลเลอร์).first(), "ทั้งเครือ: มีดีลเลอร์ในตารางรายชื่อ").toBeVisible({ timeout: 30_000 });
    await expect(หัว(page, ตาราง).filter({ hasText: หัวดีลเลอร์ }), "ทั้งเครือ: หัวคอลัมน์ดีลเลอร์").toHaveCount(1);
    await expect.poll(() => ล้น(page), { message: "ทั้งเครือ: จอ 1366 ไม่มีแถบเลื่อนแนวนอน" }).toEqual([]);
    const หัวทั้งเครือ = (await หัว(page, ตาราง).allInnerTexts()).map(t => t.trim());
    // ภูมิภาค (ภาคของดีลเลอร์ทดสอบ) — ตารางสรุปเปลี่ยนเป็นรายจังหวัด · ไม่ล้น
    const ภาค = (await ตัวเลือกที่สอง(page, "ภูมิภาค")).ค่า;
    await เลือก(page, "ภูมิภาค", ภาค);
    await expect.poll(() => ล้น(page), { message: "ระดับภูมิภาค: จอ 1366 ไม่มีแถบเลื่อนแนวนอน" }).toEqual([]);
    await expect.poll(async () => (await หัว(page, ตาราง).allInnerTexts()).map(t => t.trim()), { message: "ระดับภูมิภาค: หัวคอลัมน์ชุดเดิม (ภูมิภาค/จังหวัดไม่ซ่อน)" }).toEqual(หัวทั้งเครือ);
    const จังหวัด = (await ตัวเลือกที่สอง(page, "จังหวัด")).ค่า;
    await เลือก(page, "จังหวัด", จังหวัด);
    await expect.poll(async () => (await หัว(page, ตาราง).allInnerTexts()).map(t => t.trim()), { message: "ระดับจังหวัด: หัวคอลัมน์ชุดเดิม (ภูมิภาค/จังหวัดไม่ซ่อน)" }).toEqual(หัวทั้งเครือ);
    // ดีลเลอร์รายเดียว
    await เปิด(page, path);
    await เลือก(page, "ดีลเลอร์", DEALER);
    await expect(page.locator("[data-drill-table]"), "ระดับดีลเลอร์: ตารางสรุปเป็นรายเดือน").toHaveAttribute("data-drill-table", "month");
    await expect(รายชื่อ, "ระดับดีลเลอร์: ตารางรายชื่อบอกว่าซ่อนคอลัมน์ดีลเลอร์").toHaveAttribute("data-hidden-cols", /dealer/, { timeout: 30_000 });
    await expect(รายชื่อ.locator(ช่องดีลเลอร์), "ระดับดีลเลอร์: ไม่มีดีลเลอร์ในแถว").toHaveCount(0);
    await expect(หัว(page, ตาราง).filter({ hasText: หัวดีลเลอร์ }), "ระดับดีลเลอร์: ไม่มีหัวคอลัมน์ดีลเลอร์").toHaveCount(0);
    await expect.poll(() => ล้น(page), { message: "ระดับดีลเลอร์: จอ 1366 ไม่มีแถบเลื่อนแนวนอน" }).toEqual([]);
    assertNoErrors(errs, path);
  });
}

test("[ui·hq] ตารางสรุปเจาะลึก: เจาะภาค = บรรทัดใต้ชื่อไม่มีภูมิภาค · เจาะจังหวัด = ไม่มีบรรทัด", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 820 });
  await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
  await settle(page);
  const { ค่า: ภาค, ข้อความ: ชื่อภาค } = await ตัวเลือกที่สอง(page, "ภูมิภาค");
  // ทั้งเครือ (แท็บดีลเลอร์): บรรทัดใต้ชื่อมีภูมิภาค
  await expect(page.locator('[data-drill-table="dealer"] [data-row-sub]').first(), "ทั้งเครือ: บรรทัดใต้ชื่อมีภูมิภาค · จังหวัด").toContainText(" · ", { timeout: 30_000 });
  await เลือก(page, "ภูมิภาค", ภาค);
  await page.getByRole("tab", { name: "ดีลเลอร์" }).click();
  const ใต้ชื่อ = page.locator('[data-drill-table="dealer"] [data-row-sub]');
  await expect(ใต้ชื่อ.first()).toBeVisible({ timeout: 20_000 });
  for (const t of await ใต้ชื่อ.allInnerTexts()) expect(t, "เจาะภาค: ไม่บอกภูมิภาคซ้ำ").not.toContain(ชื่อภาค);
  const จังหวัด = (await ตัวเลือกที่สอง(page, "จังหวัด")).ค่า;
  await เลือก(page, "จังหวัด", จังหวัด);
  await expect(page.locator('[data-drill-table="dealer"] tbody tr').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-drill-table="dealer"] [data-row-sub]'), "เจาะจังหวัด: ไม่มีบรรทัดภูมิภาค/จังหวัดใต้ชื่อ").toHaveCount(0);
});

test("[ui·hq] ภาพรวมยอดขาย: เจาะภาค = ไม่มีบรรทัดภูมิภาคใต้ชื่อ · เจาะดีลเลอร์ = ไม่มีคอลัมน์ดีลเลอร์ · จอ 1366 ไม่ล้น", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 820 });
  await loginUI(page, HQ_ORIGIN, "/hq/pipeline", ADMIN);
  await settle(page);
  const ผลงาน = page.getByRole("table", { name: "ตารางผลงานดีลเลอร์" });
  await expect(ผลงาน.locator("[data-row-sub]").first(), "ทั้งเครือ: บรรทัดภูมิภาคใต้ชื่อ").toBeVisible({ timeout: 30_000 });
  await expect.poll(() => ล้น(page), { message: "ทั้งเครือ: ไม่ล้น" }).toEqual([]);
  const ภาค = (await ตัวเลือกที่สอง(page, "ทุกภูมิภาค")).ค่า;
  await เลือก(page, "ทุกภูมิภาค", ภาค);
  await page.getByRole("tab", { name: "ดีลเลอร์" }).click().catch(() => {});
  await expect(ผลงาน.locator("tbody tr").first()).toBeVisible({ timeout: 20_000 });
  await expect(ผลงาน.locator("[data-row-sub]"), "เจาะภาค: ไม่มีบรรทัดภูมิภาคใต้ชื่อ").toHaveCount(0);
  await expect.poll(() => ล้น(page), { message: "ระดับภูมิภาค: ไม่ล้น" }).toEqual([]);
  await เปิด(page, "/hq/pipeline");
  await เลือก(page, "ทุกดีลเลอร์", DEALER);
  // ระดับดีลเลอร์ (บอสสั่ง 19 พ.ย. 69 · ทับ 9 พ.ย. "แถวเดียว ผลงานในช่วง"): ไม่มีแท็บดีลเลอร์ · ตารางเป็นรายเดือน · ไม่มีคอลัมน์ดีลเลอร์/บรรทัดภูมิภาค
  const รายเดือน = page.getByRole("table", { name: "ตารางผลงานรายเดือน", exact: true });
  await expect(รายเดือน.locator("tbody tr").first(), "ระดับดีลเลอร์: ตารางผลงานรายเดือน").toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[role="tab"][data-dim="dealer"]'), "ระดับดีลเลอร์: ไม่มีแท็บดีลเลอร์").toHaveCount(0);
  await expect(ผลงาน, "ระดับดีลเลอร์: ไม่มีตารางแถวเดียว").toHaveCount(0);
  await expect(รายเดือน.locator("thead th").filter({ hasText: /^ดีลเลอร์$/ }), "ระดับดีลเลอร์: ไม่มีหัวคอลัมน์ดีลเลอร์").toHaveCount(0);
  await expect(รายเดือน.locator("[data-row-sub]"), "ระดับดีลเลอร์: ไม่มีบรรทัดภูมิภาค").toHaveCount(0);
  await expect.poll(() => ล้น(page), { message: "ระดับดีลเลอร์: ไม่ล้น" }).toEqual([]);
});
