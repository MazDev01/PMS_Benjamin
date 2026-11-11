import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── เลือกช่วง "วันนี้" บนแถบกรอง → กราฟยอดขายยังเป็นรายเดือนตามปุ่มของกราฟเอง (ตรวจกลับด้าน) ────────────────
// เดิม (26 ส.ค. 69): กราฟยอดขายเดินตามแถบกรอง เลือกวันนี้ = แกนรายชั่วโมง · บั๊กจริงตอนนั้น: หัวข้อ "รายชั่วโมง" แต่แกนเป็นจุดเดียว
// ⚠️ 11 พ.ย. 69 บอสสั่งทับ: กราฟรายเดือนทุกใบมีปุ่มของตัวเอง 3 เดือน · 6 เดือน · 9 เดือน · 1 ปี (ค่าเริ่มต้น 1 ปี)
//    และเลิกเดินตามช่วงเวลาของหน้า → เลือกวันนี้แล้ว กราฟต้องยังเป็น 12 เดือน ป้ายเดือนครบ ไม่มีแกนรายชั่วโมง
// 3 พ.ย. 69 บอสเอาตัวเลือก "วันนี้" ออก (เหลือ 1 เดือน · 3 เดือน · 1 ปี · กำหนดเอง) → ช่วงวันเดียวเลือกผ่าน "กำหนดช่วงเอง" วันนี้–วันนี้
async function เลือกวันนี้(page: any) {
  const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: /2569/ }).first().click();
  await page.getByRole("button", { name: "กำหนดช่วงเอง" }).first().click();
  await page.getByLabel("วันเริ่มต้นของช่วงที่กำหนดเอง").first().fill(วันนี้);
  await page.getByLabel("วันสิ้นสุดของช่วงที่กำหนดเอง").first().fill(วันนี้);
  await page.getByRole("button", { name: "ใช้ช่วงเวลานี้" }).first().click();
  await page.waitForTimeout(3500);
}

test("[ui·dealer] เลือกวันนี้ → กราฟยอดขายยังเป็นรายเดือน 12 เดือน (ไม่เดินตามช่วงของหน้า)", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await open(page, "dealer", "/dashboard");
  await page.waitForTimeout(3000);
  await เลือกวันนี้(page);
  const การ์ด = page.locator(".card").filter({ hasText: "ยอดขายรายเดือน" }).first();
  await expect(การ์ด.locator("span").first()).toHaveText("ยอดขายรายเดือน");
  await expect(การ์ด.locator("[data-month-range='12']"), "ปุ่ม 1 ปี ถูกเลือกอยู่").toHaveAttribute("aria-pressed", "true");
  const ป้าย = await การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.map(e => e.getAttribute("data-x-label") ?? ""));
  expect(ป้าย.length, `ป้ายเดือนครบ 12: ${JSON.stringify(ป้าย)}`).toBe(12);
  expect(ป้าย.some(t => /^\d{2}:00$/.test(t)), "ไม่มีแกนรายชั่วโมง").toBe(false);
});

test("[ui·hq] เลือกวันนี้ → แดชบอร์ดไม่พัง และกราฟแนวโน้มยอดขายยังเป็นรายเดือน", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await open(page, "hq", "/hq/dashboard");
  await page.waitForTimeout(3000);
  await เลือกวันนี้(page);
  await expect(page.getByText("เกิดข้อผิดพลาดในหน้านี้"), "แดชบอร์ดต้องไม่พังเมื่อเลือกวันนี้").toHaveCount(0);
  const การ์ด = page.locator("[data-card='trend']");
  await expect(การ์ด).toContainText("ยอดขายรวมทั้งเครือ รายเดือน", { timeout: 20_000 });
  await expect(การ์ด).not.toContainText("รายชั่วโมง");
  await expect(การ์ด.locator("[data-month-range='12']"), "ปุ่ม 1 ปี ถูกเลือกอยู่").toHaveAttribute("aria-pressed", "true");
  // 12 เดือนล่าสุดไม่มียอดเลย = กรอบว่าง "ยังไม่มียอดขาย" (บอสสั่ง 21 ต.ค. 69)
  if (await การ์ด.locator("[data-empty]").count()) {   // ไม่ใช่การข้าม: ไม่มียอด 12 เดือน = ตรวจกรอบว่างแทน (มีข้อตรวจในทั้ง 2 ทาง)
    await expect(การ์ด.locator("[data-empty]")).toHaveText("ยังไม่มียอดขาย");
    await expect(การ์ด.locator("svg"), "ไม่มียอด = ไม่วาดเส้น 0").toHaveCount(0);
    return;
  }
  const ป้าย = await การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.map(e => e.getAttribute("data-x-label") ?? ""));
  expect(ป้าย.length, `ป้ายเดือนครบ 12: ${JSON.stringify(ป้าย)}`).toBe(12);
  expect(ป้าย.some(t => /^\d{2}:00$/.test(t)), "ไม่มีแกนรายชั่วโมง").toBe(false);
});
