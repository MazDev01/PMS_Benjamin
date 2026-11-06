import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── งานในแต่ละขั้นกดได้ (บอสสั่ง 6 พ.ย. 69 · คำตอบบอสข้อ 1–3) ───────────────────────────────────────────────────────────
//   ยังไม่ติ๊ก = "กดเพื่อทำ" เปิดฟอร์มของงาน (ทางเดียวกับลากบอร์ด/กล่องขั้นต่อไป) · ทำจริงแล้วระบบติ๊ก · ยกเลิก = ไม่ติ๊ก
//   ติ๊กแล้ว = เปิดดูรายละเอียด ไม่ถอนติ๊ก
//   สรุปความต้องการ → เลื่อนไปช่องที่ขาด · ส่งคำขอราคา → ฟอร์มขอราคา · ได้ใบ HQ → คำขอรอ HQ อยู่ = บอก "รอ HQ ส่งใบอยู่" (ข้อ 1 ก)
//   ติดตามลูกค้า → กล่องเลือก บันทึกการติดต่อ/นัดหมาย · บันทึก = ติ๊ก + ลงไทม์ไลน์ · ยกเลิก = ไม่ติ๊ก (ข้อ 2 ข)
//   ตกบนโค้ดก่อนแก้: งานของระบบกดไม่ได้ (disabled) · ติดตามลูกค้ากดแล้วติ๊กเปล่า ๆ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const admin = adminClient();
const แท็ก = Date.now() % 100_000;
const ชื่อA = `ZZTEST-กดงาน-ก-${แท็ก}`, ชื่อB = `ZZTEST-กดงาน-ข-${แท็ก}`;
const เลขA = เลขลูกค้าเป้าหมายทดสอบ(), เลขB = เลขลูกค้าเป้าหมายทดสอบ();
const โทร = (n: number) => `000-000-${String(n).slice(-4)}`;

test.beforeAll(async () => {
  // ก: ข้อมูลลูกค้าครบ ข้อมูลงานยังว่าง (สรุปความต้องการยังไม่ติ๊ก) · ยังไม่ขอราคา
  const a = await admin.from("leads").insert({ id: `#L-${เลขA}`, num_id: เลขA, dealer_code: "RYG", company: ชื่อA, name: ชื่อA,
    contact: "ผู้ทดสอบ", phone: โทร(เลขA), province: "ระยอง", status: "BULLET", assigned: "ทดสอบระบบ" });
  expect(a.error, "ลีด ก").toBeNull();
  // ข: ข้อมูลครบ + ส่งคำขอราคาแล้ว HQ ยังไม่ส่งใบ
  const b = await admin.from("leads").insert({ id: `#L-${เลขB}`, num_id: เลขB, dealer_code: "RYG", company: ชื่อB, name: ชื่อB,
    contact: "ผู้ทดสอบ", phone: โทร(เลขB), province: "ระยอง", status: "BULLET", assigned: "ทดสอบระบบ", ...ข้อมูลงานครบชุด });
  expect(b.error, "ลีด ข").toBeNull();
  const r = await (await db(RYG)).rpc("quote_request_submit", { p_lead_num_id: เลขB, p_product: "โกดังสำเร็จรูป" });
  expect(r.error, "ส่งคำขอราคาของลีด ข").toBeNull();
});
test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", [เลขA, เลขB]);
  await admin.from("leads").delete().eq("dealer_code", "RYG").in("num_id", [เลขA, เลขB]);
});

type งาน = { key: string; done: boolean };
const งานในฐาน = async (เลข: number) => ((await admin.from("leads").select("tasks, activities").eq("dealer_code", "RYG").eq("num_id", เลข).single()).data ?? {}) as { tasks?: งาน[]; activities?: { text?: string }[] };
const ติ๊กในฐาน = async (เลข: number, key: string) => (await งานในฐาน(เลข)).tasks?.find(t => t.key === key)?.done ?? false;

async function เปิดลีด(page: Page, ชื่อ: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first().fill(ชื่อ);
  await page.locator("tbody tr").filter({ hasText: ชื่อ }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click({ timeout: 20_000 });
  await expect(page.locator("[data-lead-tasks]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-panel='next-step']:not([aria-busy])"), "กล่องขั้นต่อไปโหลดครบ").toBeVisible({ timeout: 30_000 });
  for (let i = 0, พับ = page.locator("[data-lead-tasks] button[aria-expanded='false']"); i < 5 && await พับ.count(); i++) await พับ.first().click();
}
const งานบนจอ = (page: Page, key: string) => page.locator(`[data-lead-tasks] [data-task-key="${key}"]`);
const ไปภาพรวม = (page: Page) => page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click();

test("[ui·dealer] กดงานที่ยังไม่ติ๊ก = เปิดฟอร์ม · ติดตามลูกค้า บันทึกแล้วติ๊ก ยกเลิกไม่ติ๊ก · ติ๊กแล้ว = ดูรายละเอียด", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดลีด(page, ชื่อA);

  // สรุปความต้องการ (ยังไม่ติ๊ก) → เลื่อนไปช่องแรกที่ขาดในข้อมูลงาน (จังหวัดมีแล้ว → งานที่ต้องการ)
  const สรุป = งานบนจอ(page, "requirement");
  await expect(สรุป.locator("[data-system-badge]"), "ยังไม่ติ๊ก = ป้าย กดเพื่อทำ").toHaveText("กดเพื่อทำ");
  await สรุป.click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id), { message: "สรุปความต้องการ = โฟกัสช่องที่ขาด (งานที่ต้องการ)" }).toBe("ov-project");
  expect(await ติ๊กในฐาน(เลขA, "requirement"), "กดแล้วไม่ติ๊กเอง").toBe(false);

  // ส่งคำขอราคา → ฟอร์มขอราคา (ข้อมูลงานยังขาด = ฟอร์มเติมช่องที่ขาดก่อน · ด่านเดียวกับปุ่มขั้นต่อไป)
  await งานบนจอ(page, "requestQuote").click();
  await expect(page.locator("[data-form='lead-info-missing'], #qr-product").first(), "ส่งคำขอราคา = เปิดฟอร์มขอราคา").toBeVisible({ timeout: 15_000 });
  expect(await ติ๊กในฐาน(เลขA, "requestQuote"), "เปิดฟอร์มเฉย ๆ ไม่ติ๊ก").toBe(false);
  await page.locator("[data-act='abandon-request-form']").click().catch(() => {});

  // ได้ใบ HQ (ยังไม่ขอราคา) → บอกให้ขอราคาก่อน + ฟอร์มขอราคา
  await ไปภาพรวม(page);
  await งานบนจอ(page, "hqQuote").click();
  await expect(page.getByRole("status").filter({ hasText: "ยังไม่ได้ส่งคำขอราคาให้ HQ" }), "ได้ใบ HQ ยังไม่ขอราคา = บอกให้ขอก่อน").toBeVisible({ timeout: 15_000 });
  await page.locator("[data-act='abandon-request-form']").click().catch(() => {});

  // ติดตามลูกค้า → กล่องเลือก · ยกเลิก = ไม่ติ๊ก
  await ไปภาพรวม(page);
  const ติดตาม = งานบนจอ(page, "followCustomer");
  await expect(ติดตาม.locator("[data-system-badge]"), "ติดตามลูกค้ายังไม่ติ๊ก = กดเพื่อทำ").toHaveText("กดเพื่อทำ");
  await ติดตาม.click();
  const กล่อง = page.locator("[data-follow-dialog]");
  await expect(กล่อง.getByRole("radio", { name: "บันทึกการติดต่อ" }), "กล่องเลือกได้: บันทึกการติดต่อ").toBeVisible();
  await กล่อง.getByRole("radio", { name: "นัดหมาย" }).click();
  await expect(กล่อง.locator("#la-type"), "เลือกนัดหมาย = ฟอร์มนัดหมายในกล่องเดียว").toBeVisible();
  await กล่อง.getByRole("button", { name: "ยกเลิก" }).click();
  await expect(กล่อง).toHaveCount(0);
  await page.waitForTimeout(800);   // วัดว่าไม่ติ๊ก (ไม่ใช่รอให้ผ่าน)
  expect(await ติ๊กในฐาน(เลขA, "followCustomer"), "ยกเลิก = ไม่ติ๊ก").toBe(false);
  await expect(ติดตาม).toHaveAttribute("aria-checked", "false");

  // บันทึกการติดต่อ: ไม่พิมพ์ = บอกเหตุผล · พิมพ์แล้วบันทึก = ติ๊ก + ลงไทม์ไลน์ (คำสั่งเดียว)
  await ติดตาม.click();
  await กล่อง.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
  await expect(กล่อง.getByRole("alert"), "ไม่เลือกช่องทาง = บอกเหตุผล").toContainText("เลือกช่องทางที่ติดต่อ");
  await กล่อง.getByLabel("ช่องทางที่ติดต่อ").selectOption({ label: "โทร" });
  await กล่อง.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
  await expect(กล่อง.getByRole("alert"), "ไม่พิมพ์ = บอกเหตุผล").toContainText("พิมพ์สิ่งที่คุยกับลูกค้า");
  const คุย = `ZZTEST โทรติดตาม ${แท็ก}`;
  await กล่อง.getByLabel("สิ่งที่คุยกับลูกค้า").fill(คุย);
  await กล่อง.getByRole("button", { name: "บันทึกการติดต่อ" }).last().click();
  await expect(กล่อง).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => ติ๊กในฐาน(เลขA, "followCustomer"), { timeout: 15_000, message: "บันทึกแล้ว = ติ๊ก" }).toBe(true);
  expect((await งานในฐาน(เลขA)).activities?.some(a => (a.text ?? "").includes(คุย)), "บันทึกการติดต่อลงไทม์ไลน์").toBe(true);
  await expect(ติดตาม).toHaveAttribute("aria-checked", "true");
  await expect(ติดตาม.locator("[data-system-badge]"), "ติ๊กแล้ว = ป้าย ระบบติ๊กให้").toHaveText("ระบบติ๊กให้");

  // ติ๊กแล้ว = ดูรายละเอียด (ไทม์ไลน์) ไม่ถอนติ๊ก
  await ติดตาม.click();
  await expect(page.locator("[data-tab-panel='history']"), "ติ๊กแล้ว = เปิดประวัติ").toBeVisible();
  await expect(page.locator("[data-tab-panel='history']")).toContainText(คุย);
  await page.waitForTimeout(800);   // วัดว่าไม่ถอนติ๊ก (ไม่ใช่รอให้ผ่าน)
  expect(await ติ๊กในฐาน(เลขA, "followCustomer"), "กดงานที่ติ๊กแล้วไม่ถอนติ๊ก").toBe(true);
  assertNoErrors(errs, "กดงานในแต่ละขั้น (ก)");
});

test("[ui·dealer] ได้ใบ HQ ระหว่างรอ HQ = เปิดคำขอ บอกว่ารอ HQ ส่งใบ · ส่งคำขอราคาที่ติ๊กแล้ว = ดูคำขอ ไม่ถอนติ๊ก", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดลีด(page, ชื่อB);
  expect(await ติ๊กในฐาน(เลขB, "requestQuote"), "ข้อมูลตั้งต้น: ส่งคำขอแล้ว = ติ๊ก").toBe(true);

  await งานบนจอ(page, "hqQuote").click();
  await expect(page.getByRole("status").filter({ hasText: "รอ HQ ส่งใบอยู่" }), "ได้ใบ HQ = บอกว่ารอ HQ ส่งใบอยู่ (บอสตอบข้อ 1 ก)").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first(), "เปิดแท็บคำขอ/ใบเสนอราคา").toHaveCSS("font-weight", "800");
  expect(await ติ๊กในฐาน(เลขB, "hqQuote"), "ไม่ติ๊กเอง").toBe(false);

  await ไปภาพรวม(page);
  const ขอ = งานบนจอ(page, "requestQuote");
  await expect(ขอ.locator("[data-system-badge]")).toHaveText("ระบบติ๊กให้");
  await ขอ.click();
  await expect(page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first(), "ติ๊กแล้ว = ดูคำขอ").toHaveCSS("font-weight", "800");
  await page.waitForTimeout(800);   // วัดว่าไม่ถอนติ๊ก (ไม่ใช่รอให้ผ่าน)
  expect(await ติ๊กในฐาน(เลขB, "requestQuote"), "ไม่ถอนติ๊ก").toBe(true);
  assertNoErrors(errs, "กดงานในแต่ละขั้น (ข)");
});
