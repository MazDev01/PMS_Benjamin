import { test, expect } from "@playwright/test";
import { settle } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";

// ── กล่องยืนยันกดรัว ๆ ตอนเครื่องทำงานหนัก: ต้องเหลือใบที่เปิดอยู่ใบเดียว (ไม่นิ่ง → บั๊กจริง 26 ต.ค. 69) ─────────────
//
// ต้นเหตุ: ใบใหม่ปิดใบเก่า (toast.dismiss) — sonner ส่งคำสั่งปิดผ่าน requestAnimationFrame แต่เพิ่มใบผ่าน setTimeout
//   timer ช้ากว่าเฟรม (เครื่องทำงานหนัก) = คำสั่งปิดถึงก่อนใบถูกเพิ่ม → หาย → ใบเก่าค้างจอซ้อนใบใหม่ และปุ่มตกลงของใบเก่าไม่ทำอะไร
//   (edge-cases-sales "กดปิดการขายรัว ๆ" 10 รอบ: เห็น 2 ใบค้าง 15 วินาที 4 รอบ)
// ข้อนี้ทำให้ "timer ช้ากว่าเฟรม" เกิดแน่นอน (setTimeout 0 → 150ms เฉพาะช่วงกดรัว) — จำลองต้นเหตุ ไม่ใช่การรอเพิ่ม
//   บนโค้ดเดิมตก (ค้าง 2–3 ใบ) · แก้แล้ว: ใบที่ถูกยกเลิกก่อนขึ้นจอปิดตัวเองตอนขึ้นจอ (ConfirmToast.tsx ปิดเองถ้ายกเลิกแล้ว)
//   ไม่บันทึกอะไรลงฐาน (กด "กรอกต่อ" แล้วปิดฟอร์มทิ้ง)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

test("[edge] กดปิดฟอร์มรัว ๆ ตอนเครื่องหน่วง → กล่องยืนยันที่เปิดอยู่เหลือใบเดียว ตอบแล้วไม่มีใบค้าง", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill("ZZT กล่องยืนยันรัว");   // กรอกค้าง = ปิดแล้วต้องถาม
  const ปิดฟอร์ม = page.getByRole("dialog").getByRole("button", { name: "ยกเลิก", exact: true });
  await expect(ปิดฟอร์ม).toBeVisible();

  await page.evaluate(() => {
    const w = window as unknown as { __เดิม?: typeof setTimeout; setTimeout: typeof setTimeout };
    w.__เดิม = w.setTimeout;
    w.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => w.__เดิม!(fn, ms ? ms : 150, ...a)) as typeof setTimeout;
  });
  await Promise.all([0, 1, 2].map(() => ปิดฟอร์ม.click({ force: true, timeout: 5_000 }).catch(() => {})));
  const ที่เปิดอยู่ = page.locator("[data-sonner-toast][data-removed='false'] .pms-confirm[role='alertdialog']");
  await expect(ที่เปิดอยู่.first()).toBeVisible({ timeout: 10_000 });
  await page.evaluate(() => { const w = window as unknown as { __เดิม?: typeof setTimeout; setTimeout: typeof setTimeout }; if (w.__เดิม) w.setTimeout = w.__เดิม; });

  await expect(ที่เปิดอยู่, "กดรัว 3 ที ต้องเหลือกล่องยืนยันที่เปิดอยู่ใบเดียว (ใบเก่าต้องไม่ค้างจอ)").toHaveCount(1, { timeout: 5_000 });
  await ที่เปิดอยู่.getByRole("button", { name: "กรอกต่อ" }).click();
  await expect(page.locator(".pms-confirm[role='alertdialog']"), "ตอบแล้วต้องไม่มีกล่องค้าง").toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด"), "กรอกต่อ = ฟอร์มยังเปิดอยู่").toHaveValue("ZZT กล่องยืนยันรัว");
});
