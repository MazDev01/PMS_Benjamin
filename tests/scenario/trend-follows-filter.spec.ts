import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ─── กราฟยอดขายรวมทั้งเครือ (แดชบอร์ด HQ) ไม่เดินตามแถบกรองเวลาของหน้า ─────────────────────────────
//   ตรวจกลับด้าน (บอสสั่ง 11 พ.ย. 69 · ทับคำสั่ง 25 ส.ค. 69 "กราฟเดินตามแถบกรอง · ห้ามมีปุ่มช่วงของกราฟเอง"):
//   ทุกกราฟรายเดือนมีปุ่มช่วงของตัวเอง 3/6/9 เดือน/1 ปี ค่าเริ่ม 1 ปี และไม่เปลี่ยนตามช่วงเวลาของหน้า
//   เดิม (25 ส.ค.): เลือก '1 เดือน' → กราฟรายวัน · ไม่มีปุ่มของกราฟ — ตกในรอบ deploy21 (12 พ.ย. 69) เพราะคำสั่งใหม่
//   ตรวจละเอียด (ป้ายครบ · ขีดกลม · ทุกกราฟรายเดือน): tests/scenario/monthly-chart-ranges.spec.ts
//   เลิกรอตายตัว (waitForTimeout 1200) — ใช้ expect ที่รอจนเงื่อนไขจริงแทน

async function เลือกช่วงหน้า(page: import("@playwright/test").Page, ชื่อ: string) {
  await page.getByRole("button", { name: /25\d\d/ }).first().click();
  await page.getByRole("button", { name: ชื่อ, exact: true }).first().click();
}

test("[func·hq] กราฟยอดขายรวมทั้งเครือ: มีปุ่มช่วงของตัวเอง · เลือก '1 ปี' หรือ '1 เดือน' ที่หน้า กราฟยังเป็นรายเดือน", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");
  const การ์ด = () => page.locator(".card").filter({ hasText: /ยอดขายรวมทั้งเครือ|ยอดขาย .* ราย/ }).first();
  const ปุ่มของกราฟ = () => การ์ด().getByRole("button", { name: /^(\d+ เดือน|1 ปี)$/ });

  for (const ช่วง of ["1 ปี", "1 เดือน"]) {
    await เลือกช่วงหน้า(page, ช่วง);
    await expect(การ์ด().getByText(/รายเดือน/).first(), `ช่วงหน้า '${ช่วง}': กราฟยังเป็นรายเดือน (ไม่เดินตามช่วงหน้า)`).toBeVisible({ timeout: 15_000 });
    await expect(การ์ด().getByText(/รายวัน/), `ช่วงหน้า '${ช่วง}': กราฟไม่เปลี่ยนเป็นรายวัน`).toHaveCount(0);
    await expect(ปุ่มของกราฟ(), `ช่วงหน้า '${ช่วง}': กราฟมีปุ่มช่วงของตัวเอง 3/6/9 เดือน/1 ปี`).toHaveCount(4);
  }
});
