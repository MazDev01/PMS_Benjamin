import { test, expect } from "@playwright/test";
import { open, assertHealthyPage } from "./helpers";

// ─── Persona: ผู้ใช้จริง (End User) ───────────────────────────────────────────
// "ผู้ใช้จะเปิดหน้าไหนบ้าง แล้วมันพังไหม" — ไล่ทุกหน้าหลักของทั้ง 2 workspace + edge cases

const DEALER_PAGES = [
  ["/dashboard", "แดชบอร์ดดีลเลอร์"], ["/leads", "ลูกค้าเป้าหมาย"], ["/customers", "ลูกค้า"],
  ["/quotations", "ใบเสนอราคา"], ["/calendar", "ปฏิทิน"],
  ["/files", "ไฟล์"], ["/settings", "ตั้งค่า Dealer"],
] as const;

const HQ_PAGES = [
  ["/hq/dashboard", "แดชบอร์ด HQ"], ["/hq/dealers", "ดีลเลอร์"], ["/hq/customers", "ลูกค้าทั้งเครือ"],
  ["/hq/pipeline", "ภาพรวมยอดขาย"], ["/hq/quotations", "ใบเสนอราคาทั้งเครือ"],
  ["/hq/audit", "บันทึกการใช้งาน"], ["/hq/settings", "ตั้งค่า HQ"],
] as const;

for (const [path, label] of DEALER_PAGES) {
  test(`[user·dealer] เปิด ${label} (${path})`, async ({ page }) => {
    await open(page, "dealer", path);
    await assertHealthyPage(page, label);
  });
}

for (const [path, label] of HQ_PAGES) {
  test(`[user·hq] เปิด ${label} (${path})`, async ({ page }) => {
    await open(page, "hq", path);
    await assertHealthyPage(page, label);
  });
}

// Edge: เปิดหน้าเจาะดีลเลอร์ที่ไม่มีอยู่ → ต้องไม่แครช (แสดง not-found)
test("[user·hq·edge] ดีลเลอร์ที่ไม่มีจริง (/hq/dealers/ZZZ) ไม่แครช", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "hq", "/hq/dealers/ZZZ");
  await page.waitForLoadState("domcontentloaded");
  expect(errors, "หน้า not-found ไม่ควรมี JS error").toEqual([]);
});

// Edge: ค้นหาที่ไม่มีผลลัพธ์ในใบเสนอราคาทั้งเครือ → ต้องขึ้น "ไม่พบ"
test("[user·hq·edge] ค้นหาที่ไม่เจอ → แสดงสถานะว่าง", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await page.locator('input[placeholder*="ค้นหา"]').first().fill("zzz-ไม่มีทางเจอ-9999");
  await expect(page.getByText(/ไม่พบ/).first()).toBeVisible();
});
