import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ─── กราฟยอดขายรวมทั้งเครือ (หน้าหลัก HQ) เดินตามแถบกรองเวลาของหน้า · ไม่มีปุ่มของกราฟ ─────────────────────────────
//   ตรวจกลับด้านอีกครั้ง (บอสสั่ง 13 พ.ย. 69 · ทับ 11 พ.ย. 69 "ทุกกราฟรายเดือนมีปุ่มช่วงของตัวเอง 3/6/9 เดือน/1 ปี · ไม่เปลี่ยนตามช่วงหน้า"):
//   หน้าที่มีตัวเลือกช่วงเวลาด้านบน → เอาปุ่มของกราฟออก · กราฟแสดงทุกเดือนตามช่วงด้านบน
//   ช่วงสั้นกว่าเดือน ('1 เดือน') = เดือนที่ช่วงแตะ ยังเป็นรายเดือน ไม่เปลี่ยนเป็นรายวัน (ef เลือก 13 พ.ย. 69)
//   ตรวจละเอียด (ป้ายครบตามช่วง · ขีดกลม · ทุกกราฟรายเดือน): tests/scenario/monthly-chart-ranges.spec.ts
//   ไม่มีรอตายตัว — ใช้ expect ที่รอจนเงื่อนไขจริง

async function เลือกช่วงหน้า(page: import("@playwright/test").Page, ชื่อ: string) {
  await page.getByRole("button", { name: /25\d\d/ }).first().click();
  await page.getByRole("button", { name: ชื่อ, exact: true }).first().click();
}

test("[func·hq] กราฟยอดขายรวมทั้งเครือ: ไม่มีปุ่มช่วงของตัวเอง · เลือก '1 ปี' หรือ '1 เดือน' ที่หน้า กราฟเป็นรายเดือนตามช่วง", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");
  const การ์ด = () => page.locator("[data-card='trend']");
  const ปุ่มของกราฟ = () => การ์ด().getByRole("button", { name: /^(\d+ เดือน|1 ปี)$/ });

  for (const ช่วง of ["1 ปี", "1 เดือน"]) {
    await เลือกช่วงหน้า(page, ช่วง);
    await expect(การ์ด().getByText(/รายเดือน/).first(), `ช่วงหน้า '${ช่วง}': กราฟเป็นรายเดือน`).toBeVisible({ timeout: 15_000 });
    await expect(การ์ด().getByText(/รายวัน/), `ช่วงหน้า '${ช่วง}': กราฟไม่เปลี่ยนเป็นรายวัน`).toHaveCount(0);
    await expect(ปุ่มของกราฟ(), `ช่วงหน้า '${ช่วง}': กราฟไม่มีปุ่มช่วงของตัวเอง (หน้ามีตัวเลือกช่วงด้านบน)`).toHaveCount(0);
    await expect(การ์ด().locator("[data-month-range]"), `ช่วงหน้า '${ช่วง}': ไม่มีปุ่ม 3/6/9 เดือน/1 ปี`).toHaveCount(0);
  }
});
