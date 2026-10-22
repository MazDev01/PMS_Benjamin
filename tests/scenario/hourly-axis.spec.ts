import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── เลือกช่วง "วันนี้" แล้วกราฟต้องเป็นแกน 24 ชั่วโมงจริง ────────────────────────
// ⚠️ บั๊กจริง 26 ส.ค. 69: หัวข้อเขียน "ยอดขายรายชั่วโมง" แต่กราฟโชว์จุดเดียวป้าย "26 ส.ค."
//    (ตกกลับไปเป็นรายวันเพราะวันนั้นยังไม่มีใบที่ปิดการขาย) — หัวข้อกับของที่เห็นไม่ตรงกัน
async function เลือกวันนี้(page: any) {
  await page.getByRole("button", { name: /2569/ }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "วันนี้", exact: true }).first().click();
  await page.waitForTimeout(3500);
}

test("[ui·dealer] เลือกวันนี้ → กราฟยอดขายเป็นแกนรายชั่วโมง", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await open(page, "dealer", "/dashboard");
  await page.waitForTimeout(3000);
  await เลือกวันนี้(page);
  const การ์ด = page.locator(".card").filter({ hasText: "ยอดขายราย" }).first();
  const หัวข้อ = await การ์ด.locator("span").first().innerText();
  // ⚠️ innerText ใช้กับ <text> ใน SVG ไม่ได้ (ได้ null) ต้องอ่าน textContent
  const ป้าย = await การ์ด.locator("svg text").evaluateAll(els => els.map(e => e.textContent ?? ""));
  const มีเวลา = ป้าย.some(t => /^\d{2}:00$/.test(String(t ?? "").trim()));
  expect(มีเวลา || !หัวข้อ.includes("รายชั่วโมง"),
    `หัวข้อ "${หัวข้อ}" บอกว่ารายชั่วโมง แต่แกนไม่มีป้ายเวลาเลย: ${JSON.stringify(ป้าย.slice(0, 8))}`).toBe(true);
});

test("[ui·hq] เลือกวันนี้ → แดชบอร์ดต้องไม่พังและเป็นแกนรายชั่วโมง", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await open(page, "hq", "/hq/dashboard");
  await page.waitForTimeout(3000);
  await เลือกวันนี้(page);
  await expect(page.getByText("เกิดข้อผิดพลาดในหน้านี้"), "แดชบอร์ดต้องไม่พังเมื่อเลือกวันนี้").toHaveCount(0);
  const การ์ด = page.locator("[data-card='trend']");
  await expect(การ์ด).toContainText("ยอดขายรวมทั้งเครือ รายชั่วโมง", { timeout: 20_000 });
  // วันนี้ยังไม่มียอดขาย = กรอบว่าง "ยังไม่มียอดขาย" (บอสสั่ง 21 ต.ค. 69 ทับ "ต้องเห็นแกน 24 ชม. เสมอ" ของ 26 ส.ค. 69)
  if (await การ์ด.locator("[data-empty]").count()) {
    await expect(การ์ด.locator("[data-empty]")).toHaveText("ยังไม่มียอดขาย");
    await expect(การ์ด.locator("svg"), "ไม่มียอด = ไม่วาดเส้น 0").toHaveCount(0);
    return;
  }
  // ⚠️ innerText ใช้กับ <text> ใน SVG ไม่ได้ (ได้ null) ต้องอ่าน textContent
  const ป้าย = await การ์ด.locator("svg text").evaluateAll(els => els.map(e => e.textContent ?? ""));
  expect(ป้าย.some(t => /^\d{2}:00$/.test(String(t ?? "").trim())), `แกนต้องเป็นเวลา: ${JSON.stringify(ป้าย.slice(0, 8))}`).toBe(true);
});
