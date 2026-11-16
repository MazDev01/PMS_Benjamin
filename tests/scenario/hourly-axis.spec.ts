import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── เลือกช่วง "วันนี้" บนแถบกรอง → กราฟยอดขายเป็นรายเดือน 1 ช่อง (เดือนนี้) · ไม่มีแกนรายชั่วโมง · ไม่มีปุ่มของกราฟ ────────────────
// เดิม (26 ส.ค. 69): กราฟยอดขายเดินตามแถบกรอง เลือกวันนี้ = แกนรายชั่วโมง · บั๊กจริงตอนนั้น: หัวข้อ "รายชั่วโมง" แต่แกนเป็นจุดเดียว
// 11 พ.ย. 69: กราฟมีปุ่มของตัวเอง เลือกวันนี้แล้วยัง 12 เดือน
// ⚠️ 13 พ.ย. 69 บอสสั่งทับ 11 พ.ย.: หน้าที่มีตัวเลือกช่วงเวลาด้านบน → เอาปุ่มของกราฟออก กราฟแสดงทุกเดือนตามช่วงด้านบน
//    ช่วงสั้นกว่าเดือน (วันนี้) = เดือนที่ช่วงแตะ 1 ช่อง ยังเป็นรายเดือน ไม่เปลี่ยนเป็นรายวัน/รายชั่วโมง (ef เลือก 13 พ.ย. 69)
// 3 พ.ย. 69 บอสเอาตัวเลือก "วันนี้" ออก (เหลือ 1 เดือน · 3 เดือน · 1 ปี · กำหนดเอง) → ช่วงวันเดียวเลือกผ่าน "กำหนดช่วงเอง" วันนี้–วันนี้
// 13 พ.ย. 69 เลิกรอตายตัว (waitForTimeout 3000/3500) — รอจนป้ายแกนเป็นเดือนนี้จริง
const เดือนไทย = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ป้ายเดือนนี้ = `${เดือนไทย[Number(วันนี้.slice(5, 7)) - 1]} ${String(Number(วันนี้.slice(0, 4)) + 543).slice(-2)}`;

async function เลือกวันนี้(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /25\d\d/ }).first().click();
  await page.getByRole("button", { name: "กำหนดช่วงเอง" }).first().click();
  await page.getByLabel("วันเริ่มต้นของช่วงที่กำหนดเอง").first().fill(วันนี้);
  await page.getByLabel("วันสิ้นสุดของช่วงที่กำหนดเอง").first().fill(วันนี้);
  await page.getByRole("button", { name: "ใช้ช่วงเวลานี้" }).first().click();
}

test("[ui·dealer] เลือกวันนี้ → กราฟยอดขายเป็นรายเดือน 1 ช่อง (เดือนนี้) ไม่มีปุ่มของกราฟ", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await open(page, "dealer", "/dashboard");
  await เลือกวันนี้(page);
  const การ์ด = page.locator(".card").filter({ hasText: "ยอดขายรายเดือน" }).first();
  await expect(การ์ด.locator("[data-title]").first()).toHaveText("ยอดขายรายเดือน");   // หัวกราฟรายเดือนตัวกลาง (12 พ.ย. 69)
  await expect(การ์ด.locator("[data-month-range]"), "ไม่มีปุ่ม 3/6/9 เดือน/1 ปี").toHaveCount(0);
  await expect.poll(() => การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.map(e => e.getAttribute("data-x-label") ?? "")),
    { timeout: 20_000, message: "ช่วงวันนี้ = เดือนนี้ 1 ช่อง (ไม่มีแกนรายชั่วโมง)" }).toEqual([ป้ายเดือนนี้]);
});

test("[ui·hq] เลือกวันนี้ → หน้าหลักไม่พัง และกราฟแนวโน้มยอดขายเป็นรายเดือน (เดือนนี้)", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await open(page, "hq", "/hq/dashboard");
  await เลือกวันนี้(page);
  await expect(page.getByText("เกิดข้อผิดพลาดในหน้านี้"), "หน้าหลักต้องไม่พังเมื่อเลือกวันนี้").toHaveCount(0);
  const การ์ด = page.locator("[data-card='trend']");
  await expect(การ์ด).toContainText("ยอดขายรวมทั้งเครือ รายเดือน", { timeout: 20_000 });
  await expect(การ์ด).not.toContainText("รายชั่วโมง");
  await expect(การ์ด.locator("[data-month-range]"), "ไม่มีปุ่ม 3/6/9 เดือน/1 ปี").toHaveCount(0);
  // เดือนนี้ไม่มียอดเลย = กรอบว่าง "ยังไม่มียอดขาย" (บอสสั่ง 21 ต.ค. 69) · มียอด = ป้ายแกนเป็นเดือนนี้ช่องเดียว
  //   (ไม่ใช่การข้าม: ตรวจได้ทั้ง 2 ทาง · รอจนอย่างใดอย่างหนึ่งขึ้นจริง)
  await expect.poll(async () => (await การ์ด.locator("[data-empty]").count())
    ? `ว่าง:${await การ์ด.locator("[data-empty]").textContent()}:เส้น${await การ์ด.locator("svg").count()}`
    : `ป้าย:${(await การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.map(e => e.getAttribute("data-x-label") ?? ""))).join(",")}`,
    { timeout: 20_000, message: "เดือนนี้ 1 ช่อง หรือกรอบว่างไม่วาดเส้น 0" }).toMatch(new RegExp(`^(ว่าง:ยังไม่มียอดขาย:เส้น0|ป้าย:${ป้ายเดือนนี้.replace(/\./g, "\\.")})$`));
});
