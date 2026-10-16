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

  // ⚠️ กติกาเปลี่ยนแล้ว (บอสสั่ง 1 ก.ย. 69): หน้านี้ต้องมีปุ่ม "ดูรหัสผ่าน"
  //    เดิม (28 ส.ค. 69) ห้ามมีเด็ดขาด · ตอนนี้ดูได้แต่ต้องยืนยันด้วยเลขที่ส่งไปทางอีเมลก่อน
  //    (กติกาที่ยังเหมือนเดิมคือ "หน้าตั้งค่ารวมต้องไม่มีปุ่มนี้" — ตรวจไว้ด้านบนแล้ว)
  const ปุ่มดูรหัส = page.getByRole("button", { name: "ดูรหัสผ่าน" });
  await expect(ปุ่มดูรหัส).toHaveCount(1);
  // กดแล้วต้องยังไม่เห็นรหัส — ต้องผ่านขั้นกรอกเลขจากอีเมลก่อนเสมอ
  await ปุ่มดูรหัส.click();
  await expect(page.getByLabel("เลขยืนยันจากอีเมล").or(page.getByText(/ปิดชั่วคราว|ส่งเลขยืนยันไปที่|ไม่มีสำเนารหัสผ่าน|ส่งเลขยืนยัน/)).first())
    .toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/acct-page.png` });
});
