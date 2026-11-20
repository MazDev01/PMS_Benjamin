import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, ข้อมูลงานครบชุด } from "./hqQuoteFixture";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── รายการในคำขอราคา: ดีลเลอร์พิมพ์เอง → HQ เห็น → ใส่ลงใบ HQ ได้ (ใบ 0290 · บอสสั่ง 20 พ.ย. 69) ──────────────────────
//   ฟอร์มขอราคา: "+ เพิ่มรายการ" แถว = รายการ · จำนวน · หน่วย · ไม่มีราคา · ไม่บังคับ · ลบได้
//   คำขอที่ส่งแล้ว (ดีลเลอร์) + หน้าต่างคำขอ (HQ) = ตารางอ่านอย่างเดียว · ใบ HQ ปุ่ม "ใส่รายการจากคำขอ" (ราคาว่าง · ไม่ใส่ให้เอง)
//   ตกบนโค้ดเดิม (45d1428c): ไม่มีปุ่มเพิ่มรายการในฟอร์มขอราคา · ฐานปฏิเสธแถวที่ไม่มีรหัสวัสดุ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
const แท็ก = Date.now() % 100_000;
const บริษัท = `ZZTEST-รายการในคำขอ-${แท็ก}`;
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
let สาขา: สาขาของข้อ;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  const sd = await db(สาขา.บัญชี);
  expect((await sd.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: สาขา.รหัส, company: บริษัท, name: บริษัท, contact: "ผู้ทดสอบ",
    phone: `000-000-${String(เลข).slice(-4)}`, province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด })).error, "ลูกค้าเป้าหมายของข้อ").toBeNull();
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, [เลข]);
  await สาขา?.ลบ();
});

test("[D·dealer] ฟอร์มขอราคา: เพิ่ม 2 รายการ (ไม่มีช่องราคา) → ส่ง → คำขอที่ส่งแล้วแสดงตาราง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill(บริษัท);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัท });
  await expect(แถว).toHaveCount(1, { timeout: 20_000 });
  await แถว.locator("td").first().click();
  await page.locator(`[data-panel="next-step"]:not([aria-busy]) [data-next-step="request"]`).click({ timeout: 20_000 });
  await expect(page.locator("#qr-product"), "ฟอร์มขอราคาเปิด").toBeVisible({ timeout: 20_000 });
  const เพิ่ม = page.getByRole("button", { name: "เพิ่มรายการ", exact: true });
  await เพิ่ม.click(); await เพิ่ม.click();
  const ตาราง = page.getByRole("table", { name: "รายการในคำขอ", exact: true });
  await expect(ตาราง.locator("thead th"), "คอลัมน์: ลำดับ · รายการ · จำนวน · หน่วย · (ลบ) — ไม่มีราคา").toHaveText(["ลำดับ", "รายการ", "จำนวน", "หน่วย", ""]);
  await page.getByLabel("รายการ 1", { exact: true }).fill("เสาเหล็ก H-Beam");
  await page.getByLabel("จำนวน 1", { exact: true }).fill("8");
  await page.getByLabel("รายการ 2", { exact: true }).fill("แผ่นหลังคาเมทัลชีท");
  await page.getByLabel("จำนวน 2", { exact: true }).fill("760");
  await page.getByRole("button", { name: "ส่งคำขอ", exact: true }).click();
  const ส่งแล้ว = page.locator("[data-request-items-view]").first();
  await expect(ส่งแล้ว, "คำขอที่ส่งแล้วแสดงรายการ").toContainText("เสาเหล็ก H-Beam", { timeout: 20_000 });
  await expect(ส่งแล้ว).toContainText("แผ่นหลังคาเมทัลชีท");
  assertNoErrors(errs, "รายการในคำขอ (ดีลเลอร์)");
});

test("[H·hq] หน้าต่างคำขอเห็นรายการ · ใบ HQ กด \"ใส่รายการจากคำขอ\" → แถวเริ่มต้นราคาว่าง (ไม่ใส่ให้เอง)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" }); await settle(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, บริษัท);
  const รายการ = ใบ.getByRole("table", { name: "รายการที่ดีลเลอร์ระบุในคำขอ", exact: true });
  await expect(รายการ, "HQ เห็นรายการในคำขอ").toContainText("เสาเหล็ก H-Beam", { timeout: 20_000 });
  await expect(ใบ.getByLabel("ชื่อรายการ 1", { exact: true }), "ไม่ใส่ให้เองอัตโนมัติ (แถวว่าง)").toHaveValue("");
  await ใบ.getByRole("button", { name: "ใส่รายการจากคำขอ", exact: true }).click();
  await expect(ใบ.getByLabel("ชื่อรายการ 1", { exact: true }), "ใส่รายการจากคำขอ").toHaveValue("เสาเหล็ก H-Beam");
  await expect(ใบ.getByLabel("ชื่อรายการ 2", { exact: true })).toHaveValue("แผ่นหลังคาเมทัลชีท");
  await expect(ใบ.getByLabel("ต้นทุนต่อหน่วย 1", { exact: true }), "ราคาว่างให้ HQ กรอก").toHaveValue("0");
  assertNoErrors(errs, "รายการในคำขอ (HQ)");
});
