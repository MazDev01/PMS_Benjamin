import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ใบเสนอราคาดีลเลอร์จากใบ HQ: ช่อง "บวกทั้งใบ %" กรอกแล้วทุกแถวเปลี่ยนทันที (บั๊ก 20 พ.ย. 69 · บอสเจอ HQ-2026-00048-V1) ──
//   เดิม: กรอก 9 แล้วทุกแถว "% ที่บวก" ยัง 12 — ต้องกดปุ่ม "ใช้กับทุกรายการ" ก่อน (บอสไม่รู้ว่าต้องกด)
//   ตอนนี้: กรอกแล้วทุกแถว = ค่านั้นทันที · ราคาขาย/ยอดคิดใหม่ · แก้รายแถวได้ต่อ · เปลี่ยนช่องทั้งใบอีกครั้ง = ทุกแถวกลับเป็นค่าใหม่ (บอกบนจอ)
//   ตกบนโค้ดเดิม (2b19425a): กรอก 9 แล้วแถวยังเป็นค่าเดิม
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
const แท็ก = Date.now() % 100_000;
const บริษัท = `ZZTEST-บวกทั้งใบ-${แท็ก}`;
let สาขา: สาขาของข้อ, ใบ: ใบHQพร้อมใช้ | null = null;
const รายการ = [{ name: "เสาเหล็ก H-Beam", qty: 8, unit: "ตัน", unitCost: 42_000 }, { name: "แผ่นหลังคาเมทัลชีท", qty: 760, unit: "ตร.ม.", unitCost: 290 }];

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส);
  ใบ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัท, province: "ตราด", lines: รายการ });
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
const ราคา = (ต้นทุน: number, pct: number) => (Math.round(ต้นทุน * (1 + pct / 100) * 100) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test("[D·dealer] บวกทั้งใบ: กรอกแล้วทุกแถว % ที่บวก + ราคาขายเปลี่ยนทันที · แก้รายแถวได้ · เปลี่ยนทั้งใบอีกครั้งทับทุกแถว", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  const ฟอร์ม = await เปิดฟอร์มทำใบ(page);
  await expect(ฟอร์ม.getByTestId("markup-all-hint"), "บอกบนจอว่ากรอกแล้วใช้ทุกรายการทันที").toContainText("ใช้กับทุกรายการทันที");

  await ฟอร์ม.getByLabel("% ที่บวกทั้งใบ", { exact: true }).fill("9");
  for (let i = 0; i < รายการ.length; i++) {
    await expect(ฟอร์ม.getByLabel(`% ที่บวก ${i + 1}`, { exact: true }), `แถว ${i + 1} = 9 ทันที (ไม่ต้องกดปุ่ม)`).toHaveValue("9");
    await expect(ฟอร์ม.getByTestId(`hq-line-price-${i}`), `แถว ${i + 1} ราคาขาย = ต้นทุน × 1.09`).toHaveText(ราคา(รายการ[i].unitCost, 9));
  }
  // แก้รายแถว: แถว 2 = 20 · แถว 1 คง 9
  await ฟอร์ม.getByLabel("% ที่บวก 2", { exact: true }).fill("20");
  await expect(ฟอร์ม.getByTestId("hq-line-price-1")).toHaveText(ราคา(รายการ[1].unitCost, 20));
  await expect(ฟอร์ม.getByLabel("% ที่บวก 1", { exact: true }), "แก้แถว 2 ไม่กระทบแถว 1").toHaveValue("9");
  // เปลี่ยนทั้งใบอีกครั้ง = ทุกแถวกลับเป็นค่าใหม่
  await ฟอร์ม.getByLabel("% ที่บวกทั้งใบ", { exact: true }).fill("15");
  for (let i = 0; i < รายการ.length; i++)
    await expect(ฟอร์ม.getByLabel(`% ที่บวก ${i + 1}`, { exact: true }), `แถว ${i + 1} = 15`).toHaveValue("15");
  const ยอด = รายการ.reduce((s, l) => s + Math.round(l.qty * Math.round(l.unitCost * 1.15 * 100) / 100 * 100) / 100, 0);
  await expect(ฟอร์ม.getByTestId("hq-markup-sale-total"), "ยอดรวมคิดใหม่").toHaveText(ยอด.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  assertNoErrors(errs, "บวกทั้งใบ");
});
