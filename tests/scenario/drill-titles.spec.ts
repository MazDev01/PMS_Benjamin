// ── หัวข้อของกราฟและตารางในหน้าเจาะลึก HQ (บอสสั่ง 3 พ.ย. 69 "ใส่หัวข้อให้ตารางและกราฟ") ─────────────────────────────────
//   1) ทุกกราฟและทุกตารางใน /hq/leads · /hq/quotations · /hq/customers · /hq/pipeline มีหัวข้อ 2 บรรทัด (ชื่อ + คำอธิบาย)
//      ตารางรายชื่อที่หัวข้ออยู่บนแถบตัวกรองเหนือตาราง นับหัวข้อของแถบนั้น
//   2) กราฟ/ตารางเจาะลึก: ชื่อบอก เป็นอะไร · แยกตามอะไร · ระดับไหน — เปลี่ยนตามแท็บมิติ และตามระดับที่เลือก (ทั้งเครือ › ภาค › จังหวัด › ดีลเลอร์)
//      คำอธิบายบอกช่วงเวลาที่เลือก (ตรงกับช่วงของแถวการ์ด) · ระดับดีลเลอร์ไม่มีคำแนะนำ "กดแถว"
//   ตกบนโค้ดเดิม: ตารางเจาะลึกไม่มีหัวข้อ · กราฟมีแค่ "แยกตาม…" ไม่บอกเรื่อง/ระดับ/ช่วง
// ข้อมูล: สาขาของข้อ (ตราด · ภาคตะวันออก) = เส้นทางเจาะลงที่รู้ชื่อแน่นอน
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ตั้งค่าเจาะลึกทั้งหมด } from "@pms/shared/lib/hqDrillConfig";
import { ชื่อหัวข้อ, ป้ายช่วง, type มิติ, type ระดับหัวข้อ } from "@pms/shared/lib/drillTitles";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);

let สาขา: สาขาของข้อ;
const ชื่อสาขา = () => `ZZTEST ${สาขา.รหัส}`;   // ชื่อที่ สร้างสาขาของข้อ() ตั้งให้
test.beforeAll(async () => { สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" }); });
test.afterAll(async () => { await สาขา?.ลบ(); });

/** ทุกตาราง/กราฟบนหน้า (นอกแผงลอย/การ์ดตัวเลข) ที่ไม่มีหัวข้อ 2 บรรทัด — คืนรายการที่ขาด */
async function กล่องที่ไม่มีหัวข้อ(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const มีหัวข้อ = (el: Element | null) => {
      const h = el?.querySelector("[data-box-title]");
      return !!h && !!h.querySelector("[data-title]")?.textContent?.trim() && !!h.querySelector("[data-subtitle]")?.textContent?.trim();
    };
    const เป้า = new Set<Element>();
    document.querySelectorAll("table").forEach(t => เป้า.add(t));
    // กราฟ = svg ขนาดใหญ่ (ไม่ใช่ไอคอน) · แท่งแนวนอน (.bar-grow) ในการ์ด
    document.querySelectorAll("svg").forEach(s => { if (s.getBoundingClientRect().width > 120) เป้า.add(s); });
    document.querySelectorAll(".card .bar-grow").forEach(b => เป้า.add(b));
    const ขาด: string[] = [];
    เป้า.forEach(el => {
      if (el.closest("[role=dialog], [data-kpi-row], aside, nav, header, .hq-sticky-filter")) return;
      const การ์ด = el.closest(".card");
      if (!การ์ด) { if (el.tagName === "TABLE") ขาด.push(`ตารางนอกการ์ด ${el.getAttribute("aria-label") ?? ""}`); return; }
      if (มีหัวข้อ(การ์ด)) return;
      // ตารางรายชื่อ: หัวข้ออยู่บนแถบตัวกรองการ์ดก่อนหน้า
      if (el.tagName === "TABLE" && มีหัวข้อ(การ์ด.previousElementSibling)) return;
      ขาด.push(`${el.tagName.toLowerCase()} ${el.getAttribute("aria-label") ?? การ์ด.getAttribute("data-testid") ?? การ์ด.getAttribute("data-chart") ?? ""}`.trim());
    });
    return [...new Set(ขาด)];
  });
}

const หัว = (page: Page, sel: string) => page.locator(`${sel} [data-box-title]`).first();
async function ตรวจหัวข้อเจาะลึก(page: Page, หน้า: keyof typeof ตั้งค่าเจาะลึกทั้งหมด, dim: มิติ, r: ระดับหัวข้อ, ช่วง: { start: string; end: string }, ที่: string) {
  const cfg = ตั้งค่าเจาะลึกทั้งหมด[หน้า];
  await expect(หัว(page, "[data-drill-chart]").locator("[data-title]"), `${ที่}: หัวข้อกราฟ`).toHaveText(`กราฟ${ชื่อหัวข้อ(cfg.ป้ายแท่ง, dim, r)}`);
  await expect(หัว(page, "[data-drill-table]").locator("[data-title]"), `${ที่}: หัวข้อตาราง`).toHaveText(`ตาราง${ชื่อหัวข้อ(cfg.ป้ายแถว, dim, r)}`);
  for (const sel of ["[data-drill-chart]", "[data-drill-table]"]) {
    const sub = หัว(page, sel).locator("[data-subtitle]");
    await expect(sub, `${ที่}: คำอธิบายบอกช่วงที่เลือก`).toContainText(ป้ายช่วง(ช่วง));
    if (r.ดีลเลอร์) await expect(sub, `${ที่}: ระดับดีลเลอร์ไม่มีที่ให้เจาะต่อ`).not.toContainText("กดแถว");
    else await expect(sub, `${ที่}: บอกวิธีกดแถว`).toContainText(dim === "month" ? "กดแถวเพื่อดูรายดีลเลอร์" : "กดแถวเพื่อเจาะลึก");
  }
}
async function ช่วงของหน้า(page: Page) {
  const แถว = page.locator("[data-kpi-row]").first();
  return { start: (await แถว.getAttribute("data-range-start")) ?? "", end: (await แถว.getAttribute("data-range-end")) ?? "" };
}
async function เลือกแท็บ(page: Page, dim: มิติ) {
  await page.locator(`[data-drill-chart] [role="tab"][data-dim="${dim}"]`).click();
  await expect(page.locator("[data-drill-table]")).toHaveAttribute("data-drill-table", dim);
}
async function กดแถว(page: Page, key: string, crumb: string) {
  await page.locator("[data-drill-table] tbody tr.clickable").filter({ has: page.locator(`td[data-group-row="${key}"]`) }).click();
  await expect(page.locator(`[data-crumbs] [data-crumb="${crumb}"]`)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-drill-table] tbody")).not.toContainText("กำลังโหลด", { timeout: 30_000 });
}

for (const หน้า of ["quotations", "leads", "customers"] as const) {
  test(`[ui·hq] /hq/${หน้า}: ทุกกราฟ/ตารางมีหัวข้อ · หัวข้อเจาะลึกตามแท็บและระดับ`, async ({ page }) => {
    const errs = watchErrors(page);
    await loginUI(page, HQ_ORIGIN, `/hq/${หน้า}`, ADMIN);
    await settle(page);
    await expect(page.locator("[data-drill-table] tbody")).not.toContainText("กำลังโหลด", { timeout: 30_000 });
    const ช่วง = await ช่วงของหน้า(page);
    expect(ช่วง.start, "แถวการ์ดบอกช่วง").not.toBe("");
    expect(await กล่องที่ไม่มีหัวข้อ(page), "ทุกกราฟ/ตารางบนหน้ามีหัวข้อ 2 บรรทัด").toEqual([]);
    if (หน้า === "quotations") {
      // ตัวอย่างตามภาพที่บอสส่ง — ตัวอักษรตรง ๆ (ไม่พึ่งตัวคิดหัวข้อ)
      await expect(หัว(page, "[data-drill-table]").locator("[data-title]")).toHaveText("ตารางใบเสนอราคาแยกตามดีลเลอร์ · ทั้งเครือ");
      // ไม่มีแถวรวมแล้ว (บอสสั่ง 6 พ.ย. 69) — คำอธิบายไม่มี "แถวรวม = การ์ดด้านบน" (ตรวจกลับด้าน)
      await expect(หัว(page, "[data-drill-table]").locator("[data-subtitle]")).not.toContainText("แถวรวม");
      await expect(หัว(page, "[data-drill-table]").locator("[data-subtitle]")).toContainText("กดหัวคอลัมน์เพื่อเรียง");
    }
    const ทั้งเครือ = { ภาค: null, จังหวัด: null, ดีลเลอร์: null };
    for (const dim of ["dealer", "region", "prov", "month"] as มิติ[]) {
      await เลือกแท็บ(page, dim);
      await ตรวจหัวข้อเจาะลึก(page, หน้า, dim, ทั้งเครือ, ช่วง, `ทั้งเครือ · แท็บ ${dim}`);
    }
    await เลือกแท็บ(page, "region");
    await กดแถว(page, "region:ตะวันออก", "region");
    await ตรวจหัวข้อเจาะลึก(page, หน้า, "prov", { ภาค: "ตะวันออก", จังหวัด: null, ดีลเลอร์: null }, ช่วง, "ภาคตะวันออก · แท็บจังหวัด");
    await expect(หัว(page, "[data-drill-table]").locator("[data-title]")).toContainText("· ภาคตะวันออก");
    await กดแถว(page, "prov:ตราด", "prov");
    await ตรวจหัวข้อเจาะลึก(page, หน้า, "dealer", { ภาค: "ตะวันออก", จังหวัด: "ตราด", ดีลเลอร์: null }, ช่วง, "จังหวัดตราด · แท็บดีลเลอร์");
    await กดแถว(page, `dealer:${สาขา.รหัส}`, "dealer");
    await ตรวจหัวข้อเจาะลึก(page, หน้า, "month", { ภาค: "ตะวันออก", จังหวัด: "ตราด", ดีลเลอร์: สาขา.รหัส, ชื่อดีลเลอร์: ชื่อสาขา() }, ช่วง, "ระดับดีลเลอร์");
    await expect(หัว(page, "[data-drill-table]").locator("[data-title]")).toContainText(`รายเดือน · ดีลเลอร์ ${สาขา.รหัส}`);
    expect(await กล่องที่ไม่มีหัวข้อ(page), "ระดับดีลเลอร์: ทุกกราฟ/ตารางยังมีหัวข้อ").toEqual([]);
    assertNoErrors(errs, `หัวข้อ /hq/${หน้า}`);
  });
}

test("[ui·hq] /hq/pipeline: ทุกกราฟ/ตารางมีหัวข้อ · หัวข้อกราฟ/ตารางตามแท็บและระดับ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/pipeline", ADMIN);
  await settle(page);
  const ตาราง = page.locator("[data-testid='pipeline-table']"), กราฟ = page.locator("[data-testid='pipeline-chart']");
  await expect(ตาราง).not.toContainText("กำลังโหลด", { timeout: 30_000 });
  const ช่วง = await ช่วงของหน้า(page);
  expect(await กล่องที่ไม่มีหัวข้อ(page), "ทุกกราฟ/ตารางบนหน้ามีหัวข้อ 2 บรรทัด").toEqual([]);
  const ทั้งเครือ = { ภาค: null, จังหวัด: null, ดีลเลอร์: null };
  await expect(ตาราง.locator("[data-title]").first()).toHaveText("ตารางผลงานแยกตามดีลเลอร์ · ทั้งเครือ");
  for (const dim of ["dealer", "region", "prov", "month"] as มิติ[]) {
    const แท็บ = กราฟ.locator(`[role="tab"][data-dim="${dim}"]`);
    if (!(await แท็บ.count())) continue;
    await แท็บ.click();
    await expect(กราฟ.locator("[data-title]").first(), `แท็บ ${dim}: หัวข้อกราฟ`).toHaveText(`กราฟ${ชื่อหัวข้อ("ยอดขาย เทียบ เป้าตามช่วง ", dim, ทั้งเครือ)}`);
    await expect(ตาราง.locator("[data-title]").first(), `แท็บ ${dim}: หัวข้อตาราง`).toHaveText(`ตาราง${ชื่อหัวข้อ("ผลงาน", dim, ทั้งเครือ)}`);
    await expect(กราฟ.locator("[data-subtitle]").first()).toContainText(ป้ายช่วง(ช่วง));
  }
  // ระดับดีลเลอร์ (ตัวเลือกดีลเลอร์บนแถบตัวกรอง) — หัวข้อเปลี่ยนเป็นรายเดือนของดีลเลอร์
  await page.locator("[data-filter-row] select").first().selectOption(สาขา.รหัส);
  await expect(ตาราง.locator("[data-title]").first()).toHaveText(`ตารางผลงานรายเดือน · ดีลเลอร์ ${สาขา.รหัส} ${ชื่อสาขา()}`, { timeout: 20_000 });
  await expect(page.locator("[data-testid='pipeline-funnel'] [data-title]")).toContainText(`ดีลเลอร์ ${สาขา.รหัส}`);
  expect(await กล่องที่ไม่มีหัวข้อ(page), "ระดับดีลเลอร์: ทุกกราฟ/ตารางยังมีหัวข้อ").toEqual([]);
  assertNoErrors(errs, "หัวข้อ /hq/pipeline");
});
