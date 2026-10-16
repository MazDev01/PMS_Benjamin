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

// ข้อของดีลเลอร์ (ช่องราคาต่อหน่วยตอนแก้ใบเดิม) ลบแล้ว 16 ต.ค. 69 — ใบเดิมที่ไม่มีใบ HQ ดูได้อย่างเดียว
//   ดีลเลอร์ไม่มีช่องพิมพ์ราคาอีกแล้ว (ราคา = ต้นทุนจากใบ HQ × %) · ช่องต้นทุนของ HQ ตรวจใน hq-quote-flow.spec.ts
