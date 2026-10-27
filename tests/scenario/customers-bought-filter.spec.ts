import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ─── HQ · ฐานข้อมูลลูกค้าทั้งเครือ: ตัวกรอง "ซื้อล่าสุด" (บอสสั่ง 24 ส.ค. 69) ───
// หน้านี้เป็น "ฐานข้อมูล" ไม่ใช่รายงานรายงวด → ค่าเริ่มต้นต้องไม่กรองเวลา
// ไม่งั้นเปิดหน้ามาแล้วลูกค้าเก่าหายไปเงียบ ๆ ซึ่งเป็นเหตุผลเดิมที่หน้านี้ไม่เคยมีตัวกรองเวลา

/** เลขบนการ์ด "ลูกค้าทั้งหมด" (การ์ดกลาง · ค่าดิบ data-value) — การ์ดเดินตามตัวกรองของตาราง (บอสตัดสิน 27 ต.ค. 69 · ใบ 0246) */
async function ลูกค้าทั้งหมด(page: import("@playwright/test").Page): Promise<number> {
  const v = await page.locator('[data-kpi-row] [data-kpi="total"] [data-value]').first().getAttribute("data-value", { timeout: 8_000 });
  return Number(v || 0);
}

test("[func·hq] ตัวกรองซื้อล่าสุด: เริ่มต้นไม่กรอง · แคบช่วงแล้วลูกค้าต้องไม่เพิ่มขึ้น", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  const sel = page.getByLabel("กรองตามช่วงเวลาที่ซื้อล่าสุด");
  await expect(sel).toBeVisible();
  // ค่าเริ่มต้นต้องเป็น "ทุกช่วงเวลาที่ซื้อ" — ห้ามเปลี่ยนเป็นช่วงแคบ
  await expect(sel).toHaveValue("all");

  await expect.poll(() => ลูกค้าทั้งหมด(page)).toBeGreaterThan(0);
  const ทั้งหมด = await ลูกค้าทั้งหมด(page);

  await sel.selectOption("m12");
  await expect.poll(() => ลูกค้าทั้งหมด(page)).toBeLessThanOrEqual(ทั้งหมด);
  const สิบสองเดือน = await ลูกค้าทั้งหมด(page);

  // 6 เดือน เป็นช่วงย่อยของ 12 เดือน → ต้องไม่มากกว่ากันเด็ดขาด
  await sel.selectOption("m6");
  await expect.poll(() => ลูกค้าทั้งหมด(page)).toBeLessThanOrEqual(สิบสองเดือน);

  // กลับมา "ทุกช่วงเวลา" ต้องได้เท่าเดิม (ตัวกรองไม่ทิ้งสถานะค้าง)
  await sel.selectOption("all");
  await expect.poll(() => ลูกค้าทั้งหมด(page)).toBe(ทั้งหมด);
});
