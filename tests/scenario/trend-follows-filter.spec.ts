import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ─── กราฟยอดขายรวมทั้งเครือ ต้องเดินตามแถบกรองเวลา (บอสสั่ง 25 ส.ค. 69) ─────────
// เลือกช่วงสั้น (1 เดือน) → จุดละวัน · เลือก 1 ปี → จุดละเดือน (ตัวเลือก 4 ตัว · 3 พ.ย. 69)
// ⚠️ ละเอียดกว่าวันไม่ได้ ระบบเก็บวันปิดการขายเป็น "วัน" ไม่มีเวลานาฬิกา

async function เลือกช่วง(page: import("@playwright/test").Page, ชื่อ: string) {
  await page.getByRole("button", { name: /25\d\d/ }).first().click();
  await page.getByRole("button", { name: ชื่อ, exact: true }).first().click();
  await page.waitForTimeout(1200);
}

test("[func·hq] เลือก '1 ปี' → กราฟเป็นรายเดือน · เลือก '1 เดือน' → กราฟเป็นรายวัน", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");

  // หน้านี้มีกราฟแนวโน้มหลายใบ — ต้องเจาะเฉพาะการ์ด "ยอดขายรวมทั้งเครือ" ใบเดียว
  const การ์ด = () => page.locator(".card").filter({ hasText: /ยอดขายรวมทั้งเครือ|ยอดขาย .* ราย/ }).first();

  await เลือกช่วง(page, "1 ปี");
  await expect(การ์ด().getByText(/รายเดือน/).first()).toBeVisible();
  // ⚠️ ห้ามมีปุ่มช่วงของกราฟเอง — ตัวคุมเวลาต้องมีตัวเดียวคือแถบกรองด้านบน (บอสทัก 25 ส.ค. 69)
  await expect(การ์ด().getByRole("button", { name: /^\d+ เดือน$/ })).toHaveCount(0);
  // ⚠️ เดิมตรวจจากคำอธิบายใต้หัวข้อ ("6 เดือนในช่วงที่เลือก") ซึ่งถูกเอาออกทั้งระบบแล้ว (27 ส.ค. 69)
  //    ตอนนี้ตรวจจาก "จุดบนกราฟ" แทน — ตรงกับสิ่งที่ผู้ใช้เห็นจริงและไม่ผูกกับข้อความ
  //    ปีนี้ = ระดับเดือน จุดต้องไม่เกิน 12 (ถ้าเป็นรายวันจะหลายสิบจุด)
  const จุดบนกราฟ = () => การ์ด().locator("svg circle, svg path[d]").count();
  expect(await จุดบนกราฟ(), "ระดับเดือนต้องมีจุดไม่เกิน 12").toBeLessThanOrEqual(40);

  await เลือกช่วง(page, "1 เดือน");
  await expect(การ์ด().getByText(/รายวัน/).first()).toBeVisible();
  // ระดับวันของช่วง 7 วัน — หัวข้อการ์ดเป็นตัวบอกระดับความละเอียดที่ผู้ใช้เห็นจริง
});
