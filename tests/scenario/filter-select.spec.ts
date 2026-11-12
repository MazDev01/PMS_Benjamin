import { test, expect, devices, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, ช่องตัวกรอง } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ช่องเลือกในแถบตัวกรอง = ตัวกลางทำเอง (บอสสั่ง 11 พ.ย. 69 · แทน <select> ของเบราว์เซอร์) ──────────────────────────
//   1) ช่องที่อยู่ล่างจอ: รายการกางลง "ใต้ช่อง" และไม่ล้นจอ (สูงไม่เกินที่ว่างใต้ช่อง · ยาวกว่าเลื่อนในรายการ)
//   2) เกิน 8 ตัวเลือก มีช่องค้นหาบนสุด พิมพ์แล้วกรองได้ · เลือกแล้วตารางกรองตาม
//   3) คีย์บอร์ด: ลูกศรลงเปิด · ลูกศรขึ้น/ลงเลื่อน · Enter เลือก · Esc ปิด (โฟกัสกลับช่อง) · คลิกข้างนอกปิด
//   4) มือถือ: แตะเปิด/เลือกได้ · ตัวเลือกสูง ≥ 30px
//   ข้อมูลของข้อ: สาขาของข้อ + ลูกค้าเป้าหมาย 10 ราย 10 จังหวัด → ตัวกรองจังหวัด 11 ตัวเลือก (เกิน 8)
//   ตกบนโค้ดเดิม: ช่องตัวกรองเป็น <select> (ไม่มี combobox แบบปุ่ม/รายการ/ช่องค้นหา)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const จังหวัด = ["ตราด", "ระยอง", "ชลบุรี", "จันทบุรี", "เชียงใหม่", "เชียงราย", "ลำปาง", "ขอนแก่น", "อุดรธานี", "สงขลา"];
let ส: สาขาของข้อ;
const เลข = 1_890_000_000 + Math.floor(Math.random() * 400_000) * 100;
const บริษัท = (i: number) => `ZZTEST ตัวกรองเลือก ${i}`;

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  // ใส่ด้วยกุญแจฝั่งเซิร์ฟเวอร์ — ดีลเลอร์สร้างลีดนอกพื้นที่ไม่ได้ (lead_outside_territory · ใบ 0214/0225) แต่ข้อนี้ต้องมีจังหวัดเกิน 8 จังหวัดในตัวกรอง
  const sd = adminClient();
  for (const [i, p] of จังหวัด.entries())
    expect((await sd.from("leads").insert({ id: `#L-${เลข + i}`, num_id: เลข + i, dealer_code: ส.รหัส, company: บริษัท(i), name: บริษัท(i),
      contact: "ผู้ทดสอบ", phone: `000-000-${String(500 + i).padStart(4, "0")}`, province: p, status: "BULLET" })).error, `ลูกค้าเป้าหมาย ${p}`).toBeNull();
});
test.afterAll(async () => { if (ส) await ส.ลบ(); });

async function เปิดหน้าลีด(page: Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByRole("button", { name: "ตาราง", exact: true }).click();   // ตรวจตรง ไม่กลืนผิดพลาด (ตัวตรวจผ่านหลอก)
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill("ZZTEST ตัวกรองเลือก");   // ค้นก่อน: ตารางแบ่งหน้า แถวของข้ออาจไม่อยู่หน้าแรก
  await expect(page.locator("tbody tr").filter({ hasText: "ZZTEST ตัวกรองเลือก" })).toHaveCount(จังหวัด.length, { timeout: 25_000 });
}
const รายการ = (page: Page) => page.locator("[data-filter-select-list]");

test("[ui·dealer] ช่องตัวกรองล่างจอกางลงใต้ช่อง · ค้นหาเมื่อเกิน 8 · คีย์บอร์ด · คลิกข้างนอกปิด", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await เปิดหน้าลีด(page);
  const ช่อง = ช่องตัวกรอง(page, "ทุกจังหวัด");
  await expect(ช่อง, "ตัวกรองจังหวัดเป็นตัวกลางทำเอง").toHaveAttribute("data-filter-select");

  // ── 1) ช่องอยู่ล่างจอ (ดันให้ขอบล่างของช่องอยู่ราว 90px จากขอบล่างจอ) → รายการอยู่ใต้ช่อง ไม่ล้นจอ ──
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-filter-select][aria-label="ทุกจังหวัด"]')!;
    document.body.style.paddingTop = `${Math.max(0, window.innerHeight - 90 - b.getBoundingClientRect().bottom)}px`;
  });
  const กรอบช่อง = (await ช่อง.boundingBox())!;
  expect(กรอบช่อง.y + กรอบช่อง.height, "ช่องอยู่ล่างจอ").toBeGreaterThan(768 - 120);
  await ช่อง.click();
  await expect(รายการ(page)).toBeVisible();
  // ที่ว่างใต้ช่องไม่พอ = เลื่อนช่องขึ้นก่อนแล้วกางลง (13 พ.ย. 69 · เดิมรายการตกนอกจอ คลิกตัวเลือกไม่ได้ — ลูกค้าเป้าหมายทั้งเครือ)
  const ช่องหลังเปิด = (await ช่อง.boundingBox())!;
  expect(ช่องหลังเปิด.y, "ช่องเลื่อนขึ้นก่อนกาง (ที่ว่างใต้ช่องไม่พอ)").toBeLessThan(กรอบช่อง.y);
  const กรอบรายการ = (await รายการ(page).boundingBox())!;
  expect(กรอบรายการ.y, "รายการอยู่ใต้ช่อง (ไม่พลิกขึ้นบน)").toBeGreaterThanOrEqual(ช่องหลังเปิด.y + ช่องหลังเปิด.height);
  expect(กรอบรายการ.y + กรอบรายการ.height, "รายการไม่ล้นจอ").toBeLessThanOrEqual(768);
  const เลื่อนได้ = await page.locator("[data-filter-select-list] [role='listbox']").evaluate(e => e.scrollHeight > e.clientHeight);
  expect(เลื่อนได้, "ที่ว่างใต้ช่องน้อยกว่ารายการ = เลื่อนในรายการ").toBe(true);
  await page.mouse.click(10, 10);   // คลิกข้างนอก
  await expect(รายการ(page), "คลิกข้างนอกแล้วปิด").toHaveCount(0);
  await page.evaluate(() => { document.body.style.paddingTop = ""; });

  // ── 2) ค้นหา: 11 ตัวเลือก (ทุกจังหวัด + 10) → มีช่องค้นหา · พิมพ์แล้วเหลือที่ตรง · เลือกแล้วตารางกรองตาม ──
  await ช่อง.click();
  const ค้น = รายการ(page).getByRole("textbox", { name: "ค้นหาในทุกจังหวัด", exact: true });
  await expect(ค้น, "เกิน 8 ตัวเลือก = มีช่องค้นหา").toBeVisible();
  await expect(ค้น, "เปิดแล้วโฟกัสช่องค้นหา").toBeFocused();
  await ค้น.fill("เชียง");
  await expect(รายการ(page).getByRole("option"), "ค้น 'เชียง' = ทุกจังหวัด + เชียงราย + เชียงใหม่ (เรียงตามพจนานุกรมไทยแบบหน้าจอ)").toHaveText(["ทุกจังหวัด", "เชียงราย", "เชียงใหม่"]);
  await รายการ(page).getByRole("option", { name: "เชียงราย", exact: true }).click();
  await expect(ช่อง).toHaveAttribute("data-filter-value", "เชียงราย");
  await expect(page.locator("tbody tr").filter({ hasText: "ZZTEST ตัวกรองเลือก" }), "ตารางกรองเหลือเชียงราย").toHaveCount(1);

  // ── 3) คีย์บอร์ด ──
  await ช่อง.focus();
  await page.keyboard.press("ArrowDown");
  await expect(รายการ(page), "ลูกศรลงเปิดรายการ").toBeVisible();
  await page.keyboard.press("Escape");
  await expect(รายการ(page), "Esc ปิด").toHaveCount(0);
  await expect(ช่อง, "Esc แล้วโฟกัสกลับช่อง").toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");   // ไปบนสุด = ทุกจังหวัด
  await page.keyboard.press("Enter");
  await expect(ช่อง, "Home + Enter = ทุกจังหวัด").toHaveAttribute("data-filter-value", "");   // ตัวกรองจังหวัดหน้าลีด: ทั้งหมด = ค่าว่าง
  await expect(page.locator("tbody tr").filter({ hasText: "ZZTEST ตัวกรองเลือก" })).toHaveCount(จังหวัด.length);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");   // ตัวถัดจากทุกจังหวัด
  await page.keyboard.press("Enter");
  await expect(ช่อง, "ลูกศรลง + Enter = ตัวเลือกถัดไป").not.toHaveAttribute("data-filter-value", "");
  assertNoErrors(errs, "ช่องตัวกรองทำเอง");
});

// ขนาดจอ/สัมผัสแบบ iPhone 12 โดยไม่เปลี่ยนชนิดเบราว์เซอร์ (defaultBrowserType ใช้ในกลุ่มย่อยไม่ได้ · ต้องแยก worker)
const { defaultBrowserType: _ชนิด, ...แบบมือถือ } = devices["iPhone 12"];
test.describe("มือถือ", () => {
  test.use(แบบมือถือ);
  test("[ui·dealer·มือถือ] ช่องตัวกรองแตะเปิด/เลือกได้ · ตัวเลือกสูง ≥ 30px · รายการไม่ล้นจอ", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await เปิดหน้าลีด(page);
    const ช่อง = ช่องตัวกรอง(page, "ทุกจังหวัด");
    await ช่อง.tap();
    await expect(รายการ(page)).toBeVisible();
    const สูง = await รายการ(page).getByRole("option").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)));
    expect(สูง.filter(h => h < 30), `ตัวเลือกเตี้ยกว่า 30px: ${สูง.join(",")}`).toEqual([]);
    const ก = (await รายการ(page).boundingBox())!, จอ = page.viewportSize()!;
    expect(ก.x, "ไม่ล้นซ้าย").toBeGreaterThanOrEqual(0);
    expect(ก.x + ก.width, "ไม่ล้นขวา").toBeLessThanOrEqual(จอ.width);
    await รายการ(page).getByRole("option", { name: "ตราด", exact: true }).tap();
    await expect(ช่อง).toHaveAttribute("data-filter-value", "ตราด");
    await expect(page.locator("tbody tr, [data-lead-card]").filter({ hasText: "ZZTEST ตัวกรองเลือก" }).first()).toBeVisible();
  });
});
