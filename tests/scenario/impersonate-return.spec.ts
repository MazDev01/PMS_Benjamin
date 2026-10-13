// ── สำนักงานใหญ่เข้าระบบแทนดีลเลอร์ → ต้องมีทางกลับที่ชัดเจน (บอสสั่ง 20 ส.ค. 69) ──
//
// เดิมกดปุ่ม "เข้าระบบ" แล้วไม่เกิดอะไรขึ้นเลย (ตัวกันป๊อปอัพบล็อก + ลิงก์ชี้ผิดที่)
// และเมื่อเข้าไปได้ ปุ่มในแถบเมนูข้างยังเขียนว่า "ออกจากระบบ" ซึ่งไม่ใช่สิ่งที่ผู้ดูแลต้องการ
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[auth] HQ กดเข้าระบบแทนดีลเลอร์ → เข้าแอปดีลเลอร์ได้จริง และมีปุ่มกลับสู่ HQ แทนออกจากระบบ", async ({ page, context }) => {
  await openAs(page, ADMIN, "hq", "/hq/dealers?view=table");   // มุมมองตาราง — เลือกแถวของสาขาที่ต้องการได้ชัด
  await settle(page);

  // ⚠️ ต้องกดที่แถวของสาขาที่ "มีบัญชีเข้าระบบ" (RYG) — ห้ามกดแถวแรกเฉย ๆ (พบ 12 ต.ค. 69)
  //    ฐานทดสอบมีบัญชีแค่ RYG/CNX อีก 6 สาขาไม่มี · ตารางเรียงเพิ่มล่าสุดบนสุด แถวแรกจึงเป็นสาขาที่ไม่มีบัญชี
  //    → เซิร์ฟเวอร์ตอบ 404 "ไม่พบบัญชีเข้าระบบ" หน้าจอแจ้งและปิดแท็บ (ถูกต้องแล้ว) แต่ข้อนี้ตกเพราะรอแท็บที่ไม่มีวันเปิด
  const ปุ่ม = page.locator("tbody tr").filter({ hasText: "RYG" }).getByRole("button", { name: "เข้าระบบ" }).first();
  await expect(ปุ่ม, "หน้าดีลเลอร์ต้องมีปุ่มเข้าระบบแทน").toBeVisible({ timeout: 30_000 });

  const [แท็บดีลเลอร์] = await Promise.all([
    context.waitForEvent("page", { timeout: 30_000 }),
    ปุ่ม.click(),
  ]);
  await แท็บดีลเลอร์.waitForLoadState("domcontentloaded");

  // ต้องเข้าแอปดีลเลอร์ได้จริง ไม่ใช่หน้าเปล่า/หน้า error
  await expect(แท็บดีลเลอร์.getByRole("link", { name: "ลูกค้าเป้าหมาย" }).first(),
    "ต้องเข้าแอปดีลเลอร์ได้จริง").toBeVisible({ timeout: 45_000 });
  expect(แท็บดีลเลอร์.url(), "ต้องอยู่ที่แอปดีลเลอร์ ไม่ใช่ปลายทางอื่น").toContain("localhost:3001");

  // แถบเมนูข้าง: ต้องเป็น "กลับสู่ HQ" ไม่ใช่ "ออกจากระบบ"
  await expect(แท็บดีลเลอร์.getByRole("button", { name: "กลับสู่ HQ" }).first(),
    "ต้องมีปุ่มกลับสู่ HQ").toBeVisible({ timeout: 20_000 });
  await expect(แท็บดีลเลอร์.getByRole("button", { name: "ออกจากระบบ" }),
    "ตอนสวมสิทธิ์ต้องไม่มีปุ่มออกจากระบบให้กดสับสน").toHaveCount(0);

  // ★ รวมถึงในเมนูผู้ใช้มุมขวาบนด้วย (บอสสั่ง 20 ส.ค. 69) — เมนูนี้ปิดอยู่ตอนเปิดหน้า
  //   ถ้าไม่กดเปิดก่อน เทสต์จะ "ผ่าน" ฟรี ๆ ทั้งที่ปุ่มยังอยู่ข้างใน
  await แท็บดีลเลอร์.locator(".topbar-right button").last().click();
  await แท็บดีลเลอร์.waitForTimeout(400);
  await expect(แท็บดีลเลอร์.getByRole("button", { name: "ออกจากระบบ" }),
    "เมนูผู้ใช้มุมขวาบนก็ต้องไม่มีปุ่มออกจากระบบตอนสวมสิทธิ์").toHaveCount(0);

  await แท็บดีลเลอร์.close();
});
