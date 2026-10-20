import { test, expect } from "@playwright/test";
import { open, settle } from "./helpers";
const OUT = "C:/Users/boomb/AppData/Local/Temp/claude/c---claude-Benjamin-HQ-main/0b483470-aee6-4cee-b441-de2f8b9c366f/scratchpad";
test("[dealer] บัญชีเข้าระบบ: หน้าตั้งค่าโชว์แค่อีเมล · แก้ที่หน้าแยก", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 950 });
  await open(page, "dealer", "/settings"); await settle(page);

  // หน้าตั้งค่า: ไม่มีปุ่มดูรหัส ไม่มีช่องรหัสผ่าน
  await expect(page.getByText("จัดการข้อมูลบัญชีและการเข้าสู่ระบบของคุณ")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /ดูรหัส/ })).toHaveCount(0);
  await expect(page.getByLabel("รหัสผ่านปัจจุบัน")).toHaveCount(0);
  await expect(page.getByLabel("รหัสผ่านใหม่")).toHaveCount(0);
  // ทางเข้ามีปุ่มเดียว (กดแล้วไปหน้าเดียวกันอยู่แล้ว) และไม่มีออกจากระบบ/เคล็ดลับโผล่กลับมา
  await expect(page.getByRole("button", { name: /เปลี่ยนอีเมล \/ รหัสผ่าน/ })).toHaveCount(1);
  await expect(page.getByText("เคล็ดลับความปลอดภัย")).toHaveCount(0);
  await page.screenshot({ path: `${OUT}/acct-summary.png` });

  // กดปุ่มแล้วต้องไปหน้าบัญชีแยก
  await page.getByRole("button", { name: /เปลี่ยนอีเมล \/ รหัสผ่าน/ }).click();
  await page.waitForURL(/\/settings\/account/, { timeout: 20_000 });
  await expect(page.getByText("บัญชีเข้าสู่ระบบ").first()).toBeVisible();
  // หน้านี้แยกเป็นสองก้อน: เปลี่ยนรหัสผ่าน (มาก่อน) และเปลี่ยนอีเมล — แต่ละก้อนมีช่องยืนยันของตัวเอง
  await expect(page.getByLabel("รหัสผ่านปัจจุบัน", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /บันทึกรหัสผ่านใหม่/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /บันทึกอีเมลใหม่/ })).toBeVisible();

  // ⚠️ กติกาเปลี่ยนอีกรอบ (บอสตัดสิน 20 ต.ค. 69: ปุ่ม "ดูรหัสผ่าน" ที่ส่งเลขทางอีเมลเอาออก (อีเมลล็อกอินปิด ใบ 0213) · ลืมรหัสผ่าน = ติดต่อสำนักงานใหญ่)
  //    เดิม (1 ก.ย. 69) มีปุ่มดูรหัสที่ต้องกรอกเลขจากอีเมล — ข้อ "เลขค้างหลังรีเฟรช/ดูซ้ำได้" (reveal-code-survives-reload) ลบไปพร้อมปุ่ม
  await expect(page.getByRole("button", { name: "ดูรหัสผ่าน" }), "ไม่มีปุ่มดูรหัสผ่านทางอีเมล").toHaveCount(0);
  await expect(page.getByLabel("เลขยืนยันจากอีเมล"), "ไม่มีช่องกรอกเลขจากอีเมล").toHaveCount(0);
  await expect(page.getByText("ลืมรหัสผ่าน ติดต่อสำนักงานใหญ่").first(), "บอกทางเมื่อลืมรหัส").toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/acct-page.png` });
});
