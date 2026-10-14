import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── ช่องกรอกจำนวนเงิน ต้องเห็นลูกน้ำระหว่างพิมพ์ (บอสสั่ง 26 ส.ค. 69) ──────────────
// ⚠️ <input type="number"> ใส่ลูกน้ำไม่ได้ (เบราว์เซอร์ถือว่าค่าไม่ใช่ตัวเลข แล้วล้างทิ้ง)
//    ช่องเงินทุกช่องจึงต้องเป็น type="text" + จัดรูปเอง — เทสต์นี้กันการเผลอเปลี่ยนกลับ
test("[ui·hq] เป้ายอดขายดีลเลอร์ พิมพ์แล้วขึ้นลูกน้ำ", async ({ page }) => {
  await open(page, "hq", "/hq/dealers?view=table");   // หน้าเริ่มเป็นการ์ด — ปุ่มแก้ไขในแถวตาราง
  const ช่อง = page.getByLabel("เป้ายอดขายทั้งปี");
  // ฟอร์มเพิ่มดีลเลอร์ถูกถอดแล้ว (บอสสั่ง 14 ก.ย. 69) — ช่องเป้ายอดขายเหลืออยู่ในฟอร์มแก้ไข
  //   พิมพ์ดูแล้วกดยกเลิก ไม่บันทึกทับเป้าของสาขาจริง
  await page.locator("tbody").getByRole("button", { name: "แก้ไข" }).first().click();
  await expect(ช่อง).toBeVisible();
  await ช่อง.fill("");
  await ช่อง.pressSequentially("12000000", { delay: 20 });
  await expect(ช่อง).toHaveValue("12,000,000");
  await page.getByRole("dialog", { name: "ฟอร์มข้อมูลดีลเลอร์" }).getByRole("button", { name: "ยกเลิก" }).click();
});

test("[ui·dealer] ราคาต่อหน่วยในใบเสนอราคา พิมพ์แล้วขึ้นลูกน้ำ", async ({ page }) => {
  // ด่าน 3: ใบใหม่ไม่มีช่องพิมพ์ราคา (ราคา = ต้นทุนจากใบ HQ × %) — ช่องราคาต่อหน่วยเหลืออยู่ที่การแก้ "ใบเดิม" ที่ยังไม่ปิด
  //   ใช้ใบร่างเดิมของข้อมูลตั้งต้น (ZZTEST-BASE-Q-RYG-6) · พิมพ์ดูแล้วไม่บันทึก
  await open(page, "dealer", "/quotations");
  const แถว = page.locator("tbody tr").filter({ hasText: "ZZTEST-BASE-Q-RYG-6" }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await แถว.getByRole("button", { name: "แก้ไข", exact: true }).first().click();
  const ราคา = page.getByLabel("ราคาต่อหน่วย").first();
  if (await page.getByLabel("ราคาต่อหน่วย").count() === 0) {   // ใบร่างเดิมไม่มีรายการ — เพิ่มจากแคตตาล็อกก่อน (ไม่บันทึก)
    await page.getByRole("button", { name: /เลือกจากแคตตาล็อก/ }).click();
    await page.locator("button").filter({ hasText: /฿[\d,]+\/\S+/ }).first().click();
  }
  await expect(ราคา).toBeVisible();
  await ราคา.fill("");
  await ราคา.pressSequentially("250000", { delay: 20 });
  await expect(ราคา).toHaveValue("250,000");
});
