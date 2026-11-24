import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── กดโลโก้ BENJAMIN (มุมซ้ายบนของเมนู) = กลับหน้าหลัก (บอสสั่ง 24 พ.ย. 69) ──
//   HQ → /hq/dashboard · ดีลเลอร์ → /dashboard · ลิงก์จริงชื่อ "ไปหน้าหลัก" · เมนูจอใหญ่และเมนูมือถือ (กดแล้วเมนูมือถือปิด)
//   ตกบนโค้ดเดิม (2d80179d): โลโก้เป็นกล่องธรรมดา ไม่มีลิงก์ "ไปหน้าหลัก"
const แอป = [
  { app: "hq" as const, เริ่ม: "/hq/leads", หน้าหลัก: /\/hq\/dashboard$/ },
  { app: "dealer" as const, เริ่ม: "/leads", หน้าหลัก: /\/dashboard$/ },
];

for (const { app, เริ่ม, หน้าหลัก } of แอป) {
  test(`[ui·${app}] จอใหญ่: กดโลโก้ BENJAMIN = ไปหน้าหลัก`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, app, เริ่ม);
    const โลโก้ = page.getByRole("link", { name: "ไปหน้าหลัก", exact: true });
    await expect(โลโก้, "โลโก้เป็นลิงก์จริงชื่อ ไปหน้าหลัก").toBeVisible({ timeout: 25_000 });
    await expect(โลโก้).toContainText("BENJAMIN");
    await โลโก้.click();
    await expect(page, "กดแล้วไปหน้าหลักของแอปนี้").toHaveURL(หน้าหลัก, { timeout: 20_000 });
  });
}

test.describe("มือถือ", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const { app, เริ่ม, หน้าหลัก } of แอป) {
    test(`[ui·${app}] มือถือ: เปิดเมนู → กดโลโก้ = ไปหน้าหลัก · เมนูปิด`, async ({ page }) => {
      await open(page, app, เริ่ม);
      await page.getByRole("button", { name: "เปิดเมนู", exact: true }).click({ timeout: 25_000 });
      const เมนู = page.locator("aside.erp-sidebar");
      await expect(เมนู, "เมนูมือถือเปิด").toHaveClass(/\bopen\b/);
      await page.getByRole("link", { name: "ไปหน้าหลัก", exact: true }).click();
      await expect(page, "กดแล้วไปหน้าหลักของแอปนี้").toHaveURL(หน้าหลัก, { timeout: 20_000 });
      await expect(เมนู, "กดแล้วเมนูมือถือปิด").not.toHaveClass(/\bopen\b/);
    });
  }
});
