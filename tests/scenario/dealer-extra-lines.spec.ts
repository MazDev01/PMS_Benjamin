import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ใบเสนอราคาดีลเลอร์จากใบ HQ: "+ เพิ่มรายการอื่น" = รายการของดีลเลอร์ (ใบ 0291 · บอสสั่ง 20 พ.ย. 69) ──────────────────────
//   เหตุผลบอส: "ดีลเลอร์ซื้อโครงที่เรา แต่สั่งทำผนัง/หลังคาเอง" · แถวของดีลเลอร์: รายการ · จำนวน · หน่วย · ราคาขาย/หน่วย (กรอกเอง) · ลบได้
//   แถวจากใบ HQ ล็อกเหมือนเดิม (แก้ได้แค่ %) · ยอดใบ = ทั้งสองส่วน (ฐานคิด) · ใบที่บันทึกแล้วเปิดใหม่ยังมีแถวของดีลเลอร์
//   ตกบนโค้ดเดิม (45d1428c): ไม่มีปุ่ม "เพิ่มรายการอื่น" · ฐานทิ้งแถวที่หน้าจอส่งเพิ่ม
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
const แท็ก = Date.now() % 100_000;
const บริษัท = `ZZTEST-รายการดีลเลอร์-${แท็ก}`;
let สาขา: สาขาของข้อ, ใบ: ใบHQพร้อมใช้ | null = null;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส);
  ใบ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัท, province: "ตราด", lines: [{ name: "เสาเหล็ก H-Beam", qty: 10, unit: "ตัน", unitCost: 40_000 }] });
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, ใบ ? [ใบ.leadNum] : []);
  await สาขา?.ลบ();
});

async function เปิดฟอร์มทำใบ(page: Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill(บริษัท);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัท });
  await expect(แถว, "เจอลูกค้าเป้าหมายของข้อ").toHaveCount(1, { timeout: 20_000 });
  await แถว.locator("td").first().click();
  await page.locator('[data-panel="next-step"]:not([aria-busy]) [data-next-step="make_quote"]').click({ timeout: 20_000 });
  const ฟอร์ม = page.locator("[data-editor='hq-markup']");
  await expect(ฟอร์ม, "ฟอร์มทำใบจากใบ HQ").toBeVisible({ timeout: 20_000 });
  return ฟอร์ม;
}

test("[D·dealer] เพิ่มรายการของดีลเลอร์ 2 แถว → ยอดรวมถูก · แถวใบ HQ ยังแก้ชื่อ/จำนวนไม่ได้ · บันทึกแล้วฐานเก็บครบ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  const ฟอร์ม = await เปิดฟอร์มทำใบ(page);
  await ฟอร์ม.getByLabel("% ที่บวกทั้งใบ", { exact: true }).fill("10");
  // แถวใบ HQ: ไม่มีช่องกรอกชื่อ/จำนวน (ล็อก)
  await expect(ฟอร์ม.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)", exact: true }).locator("input:not([aria-label^='% ที่บวก'])"), "แถวใบ HQ แก้ได้แค่ %").toHaveCount(0);

  const เพิ่ม = ฟอร์ม.getByRole("button", { name: "เพิ่มรายการอื่น", exact: true });
  await เพิ่ม.click(); await เพิ่ม.click();
  const ตาราง = ฟอร์ม.getByRole("table", { name: "รายการของดีลเลอร์", exact: true });
  await expect(ตาราง, "มีส่วนรายการของดีลเลอร์แยกชัด").toContainText("รายการของดีลเลอร์");
  await ฟอร์ม.getByLabel("รายการของดีลเลอร์ 1", { exact: true }).fill("ผนังเมทัลชีท (ดีลเลอร์จัดหาเอง)");
  await ฟอร์ม.getByLabel("จำนวนรายการของดีลเลอร์ 1", { exact: true }).fill("500");
  await ฟอร์ม.getByLabel("ราคาขายต่อหน่วยรายการของดีลเลอร์ 1", { exact: true }).fill("100");
  await ฟอร์ม.getByLabel("รายการของดีลเลอร์ 2", { exact: true }).fill("หลังคาเมทัลชีท");
  await ฟอร์ม.getByLabel("จำนวนรายการของดีลเลอร์ 2", { exact: true }).fill("100");
  await ฟอร์ม.getByLabel("ราคาขายต่อหน่วยรายการของดีลเลอร์ 2", { exact: true }).fill("300");
  // ใบ HQ 400,000 × 1.10 = 440,000 · ของดีลเลอร์ 50,000 + 30,000 = 80,000 → รวม 520,000
  await expect(ฟอร์ม.getByTestId("hq-markup-sale-total"), "ยอดรวมทั้งใบ").toHaveText("520,000.00");

  // ลบแถวได้ แล้วเพิ่มกลับ (ปุ่มลบทำงาน)
  await ฟอร์ม.getByRole("button", { name: "ลบรายการของดีลเลอร์ 2", exact: true }).click();
  await expect(ฟอร์ม.getByTestId("hq-markup-sale-total"), "ลบแถว 2 แล้วยอดลด").toHaveText("490,000.00");
  await เพิ่ม.click();
  await ฟอร์ม.getByLabel("รายการของดีลเลอร์ 2", { exact: true }).fill("หลังคาเมทัลชีท");
  await ฟอร์ม.getByLabel("จำนวนรายการของดีลเลอร์ 2", { exact: true }).fill("100");
  await ฟอร์ม.getByLabel("ราคาขายต่อหน่วยรายการของดีลเลอร์ 2", { exact: true }).fill("300");
  await expect(ฟอร์ม.getByTestId("hq-markup-sale-total")).toHaveText("520,000.00");

  await page.getByRole("button", { name: "สร้างใบเสนอราคา", exact: true }).click();
  const sd = await db(สาขา.บัญชี);
  await expect.poll(async () => {
    const { data } = await sd.from("quotations").select("total_value, hq_lines_value, line_items").eq("dealer_code", สาขา.รหัส).eq("hq_quote_id", ใบ!.hqQuoteId).maybeSingle();
    return data ? JSON.stringify({ t: Number(data.total_value), h: Number(data.hq_lines_value), n: (data.line_items as unknown[]).length }) : "ยังไม่มีใบ";
  }, { timeout: 20_000, message: "ฐานเก็บใบ: ยอด 520,000 · ใบ HQ 440,000 · 3 แถว" }).toBe(JSON.stringify({ t: 520000, h: 440000, n: 3 }));
  assertNoErrors(errs, "รายการของดีลเลอร์");
});
