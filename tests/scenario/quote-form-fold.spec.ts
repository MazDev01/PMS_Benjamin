import { test, expect } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ได้ใบ HQ แล้ว = กล่องคำขอ/ใบ HQ พับตั้งแต่เปิดแท็บ · กด "ทำใบให้ลูกค้า" = เลื่อนลงไปที่ฟอร์มเอง (บอสสั่ง 20 พ.ย. 69 "หุบไว้" ดูบน bb3035f4) ──
//   เดิม: ตารางรายการในคำขอยาว ดันฟอร์มทำใบลงไปข้างล่าง ดีลเลอร์ต้องเลื่อนหาเอง
//   เปิดแท็บ → บรรทัดสรุป (คำขอ · ใบ HQ) + "ดูคำขอและใบ HQ" กางเองได้ · ฟอร์มเปิด → แถบเลื่อนของหน้าต่าง 820 เลื่อนให้ฟอร์มอยู่บนสุด
//   ตกบนโค้ดเดิม (bb3035f4): เปิดแท็บแล้วกล่องกางเต็ม · พับเฉพาะหลังกดปุ่ม
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
const แท็ก = Date.now() % 100_000;
const บริษัท = `ZZTEST-พับคำขอ-${แท็ก}`;
let สาขา: สาขาของข้อ, ใบ: ใบHQพร้อมใช้ | null = null;

/** ตำแหน่งในแถบเลื่อนของหน้าต่างลูกค้าเป้าหมาย (ไม่ใช่หน้าหลังหน้าต่าง): เลื่อนไปเท่าไร · ของที่ต้องการห่างขอบบนเท่าไร · เลื่อนสุดแล้วไหม */
async function ตำแหน่งในหน้าต่าง(page: import("@playwright/test").Page, ตัวเลือก: string) {
  return page.evaluate(sel => {
    const กล่อง = document.querySelector("[data-lead-drawer-scroll]") as HTMLElement | null, ของ = document.querySelector(sel) as HTMLElement | null;
    if (!กล่อง || !ของ) return null;
    return { เลื่อน: Math.round(กล่อง.scrollTop), ห่างบน: Math.round(ของ.getBoundingClientRect().top - กล่อง.getBoundingClientRect().top),
      สุด: กล่อง.scrollTop + กล่อง.clientHeight >= กล่อง.scrollHeight - 2, หน้าเลื่อน: Math.round(window.scrollY) };
  }, ตัวเลือก);
}

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส);
  ใบ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัท, province: "ตราด",
    lines: Array.from({ length: 12 }, (_, i) => ({ name: `ZZ รายการโครงเหล็ก ${i + 1}`, qty: 1, unit: "ชุด", unitCost: 10_000 })) });
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, ใบ ? [ใบ.leadNum] : []);
  await สาขา?.ลบ();
});

test("[D·dealer] เปิดแท็บ = คำขอ/ใบ HQ พับ · ทำใบให้ลูกค้า → เลื่อนลงไปที่ฟอร์มในหน้าต่าง · กางดูได้ · กลับ = ยังพับ", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill(บริษัท);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัท });
  await expect(แถว, "เจอลูกค้าเป้าหมายของข้อ").toHaveCount(1, { timeout: 20_000 });
  await แถว.locator("td").first().click();
  const กล่องHQ = page.locator('[data-panel="quote-request"]');
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await expect(กล่องHQ.locator("[data-quote-request-folded]"), "เปิดแท็บ = พับเป็นค่าเริ่มต้น (ยังไม่กดปุ่ม)").toBeVisible({ timeout: 20_000 });
  await expect(กล่องHQ.getByTestId("hq-quote-summary"), "รายละเอียดใบ HQ ซ่อนอยู่ตั้งแต่เปิดแท็บ").toHaveCount(0);
  await page.locator('[data-panel="next-step"]:not([aria-busy]) [data-next-step="make_quote"]').click({ timeout: 20_000 });

  const ฟอร์ม = page.locator("[data-quote-form]");
  await expect(ฟอร์ม.locator("[data-editor='hq-markup']"), "ฟอร์มทำใบเปิด").toBeVisible({ timeout: 20_000 });
  await expect(กล่องHQ.locator("[data-quote-request-folded]"), "คำขอ/ใบ HQ พับเหลือบรรทัดสรุป").toBeVisible();
  await expect(กล่องHQ.locator("[data-quote-request-folded]")).toContainText(ใบ!.quoteNo);
  await expect(กล่องHQ.getByTestId("hq-quote-summary"), "รายละเอียดใบ HQ ซ่อนอยู่").toHaveCount(0);
  await expect(ฟอร์ม.locator("[data-editor='hq-markup']"), "เลื่อนจอมาที่ฟอร์มเอง").toBeInViewport({ timeout: 5_000 });
  // เลื่อนจริงในแถบเลื่อนของหน้าต่าง 820 (ไม่ใช่หน้าหลังหน้าต่าง): ฟอร์มชิดขอบบน หรือเลื่อนสุดแล้ว
  await expect.poll(async () => { const t = await ตำแหน่งในหน้าต่าง(page, "[data-quote-form]"); return !!t && t.หน้าเลื่อน === 0 && (Math.abs(t.ห่างบน - 12) <= 30 || (t.สุด && t.เลื่อน > 0)); },
    { timeout: 5_000, message: "ฟอร์มขึ้นมาบนสุดของแถบเลื่อนหน้าต่าง" }).toBe(true);

  await กล่องHQ.getByRole("button", { name: "ดูคำขอและใบ HQ", exact: true }).click();
  await expect(กล่องHQ.getByTestId("hq-quote-summary"), "กางดูได้").toBeVisible();
  await กล่องHQ.getByRole("button", { name: "พับคำขอและใบ HQ", exact: true }).click();
  await expect(กล่องHQ.locator("[data-quote-request-folded]"), "พับกลับได้").toBeVisible();

  await ฟอร์ม.getByRole("button", { name: "กลับ", exact: true }).click();
  await expect(กล่องHQ.locator("[data-quote-request-folded]"), "ปิดฟอร์ม = ยังพับ (ค่าเริ่มต้น)").toBeVisible();
  await expect(กล่องHQ.getByTestId("hq-quote-summary")).toHaveCount(0);
  assertNoErrors(errs, "พับคำขอตอนทำใบ");
});

// ── "บันทึกผลจากลูกค้า" = เด้งให้เลือก ลูกค้าตอบรับ / ลูกค้าปฏิเสธ ทันที + พับข้างบน เลื่อนไปที่ใบ (บอสสั่ง 20 พ.ย. 69) ──
//   ปุ่มในกล่องเรียกการทำงานเดิมของปุ่มบนใบ (ยืนยันตอบรับ · กล่องเหตุผลปฏิเสธ) — ข้อนี้กดยกเลิก ไม่บันทึกผลจริง
//   ตกบนโค้ดเดิม (c0f7cb22): กดแล้วแค่เปิดใบ ไม่มีกล่องเลือกผล · ส่วนคำขอไม่พับ
test("[D·dealer] บันทึกผลจากลูกค้า → กล่องเลือกผล 2 ปุ่ม · คำขอพับ · ใบอยู่ในจอ · ปฏิเสธ = กล่องเหตุผลเดิม", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill(บริษัท);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัท });
  await expect(แถว).toHaveCount(1, { timeout: 20_000 });
  await แถว.locator("td").first().click();
  const ขั้นต่อไป = page.locator('[data-panel="next-step"]:not([aria-busy])');
  // ทำใบ → สร้าง → ส่งให้ลูกค้า (ทางเดียวกับที่ดีลเลอร์ใช้)
  await ขั้นต่อไป.locator('[data-next-step="make_quote"]').click({ timeout: 20_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา", exact: true }).click();
  await ขั้นต่อไป.locator('[data-next-step="send_quote"]').click({ timeout: 25_000 });
  await page.getByRole("alertdialog").getByRole("button", { name: "ส่งให้ลูกค้า", exact: true }).click();
  await expect(ขั้นต่อไป, "ส่งแล้ว").toContainText("ส่งใบให้ลูกค้าแล้ว — รอผลจากลูกค้า", { timeout: 25_000 });

  await ขั้นต่อไป.locator('[data-next-step="await_customer"]').click();   // ปุ่ม "บันทึกผลจากลูกค้า →"
  const เลือก = page.getByRole("dialog", { name: "บันทึกผลจากลูกค้า", exact: true });
  await expect(เลือก, "เด้งให้เลือกผลทันที").toBeVisible({ timeout: 20_000 });
  await expect(เลือก.locator("[data-customer-result-choice] button")).toHaveText(["ลูกค้าตอบรับ", "ลูกค้าปฏิเสธ"]);
  const กล่องHQ = page.locator('[data-panel="quote-request"]');
  await expect(กล่องHQ.locator("[data-quote-request-folded]"), "คำขอ/ใบ HQ พับ").toBeVisible();
  await expect(page.locator("[data-quote-view]"), "เลื่อนไปที่ใบ").toBeInViewport({ timeout: 5_000 });
  await expect.poll(async () => { const t = await ตำแหน่งในหน้าต่าง(page, "[data-quote-view]"); return !!t && t.หน้าเลื่อน === 0 && (Math.abs(t.ห่างบน - 12) <= 30 || (t.สุด && t.เลื่อน > 0)); },
    { timeout: 5_000, message: "ใบขึ้นมาบนสุดของแถบเลื่อนหน้าต่าง" }).toBe(true);

  await เลือก.getByRole("button", { name: "ลูกค้าปฏิเสธ", exact: true }).click();
  await expect(page.getByRole("alertdialog"), "ปฏิเสธ = กล่องเหตุผลเดิม").toContainText("เลือกเหตุผล", { timeout: 10_000 });
  await page.getByRole("alertdialog").locator("[data-dialog-cancel]").click();
  await expect(เลือก, "ยกเลิกแล้วกล่องเลือกปิด").toHaveCount(0);
  await expect(page.locator("[data-quote-view] [data-customer-result]"), "ปุ่มบนใบยังอยู่ (ยังไม่บันทึกผล)").toBeVisible();
  assertNoErrors(errs, "บันทึกผลจากลูกค้า");
});
