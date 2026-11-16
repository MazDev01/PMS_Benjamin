// ── หน้าลูกค้า (ดีลเลอร์) ค้นไม่เจอ: ปุ่มในหน้าว่างใช้คำว่า "แสดงทั้งหมด" แทน "ล้างตัวกรอง" (บอสสั่ง 16 พ.ย. 69 · ตรวจคำขั้น 4) ──
//   กดแล้วกลับมาเห็นลูกค้าทั้งหมด (ล้างคำค้น/จังหวัด/ผู้รับผิดชอบ) · ไม่มีปุ่มชื่อ "ล้างตัวกรอง" ในหน้าว่างแล้ว
import { test, expect } from "@playwright/test";
import { open, settle } from "./helpers";
import { EXISTING_CUSTOMER_NAME } from "./global-setup";

test("[dealer] ลูกค้า: ค้นไม่เจอ → ปุ่ม \"แสดงทั้งหมด\" · กดแล้วเห็นลูกค้าเดิม · ไม่มีปุ่ม \"ล้างตัวกรอง\"", async ({ page }) => {
  await open(page, "dealer", "/customers");
  await settle(page);
  await expect(page.getByText(EXISTING_CUSTOMER_NAME, { exact: true }).first(), "ลูกค้าตั้งต้นขึ้นก่อนค้น").toBeVisible({ timeout: 20_000 });

  const ช่องค้น = page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...", { exact: true });
  await ช่องค้น.fill(`ZZไม่มีลูกค้าชื่อนี้${Date.now()}`);
  await expect(page.getByText("ไม่พบลูกค้าที่ตรงกับเงื่อนไข", { exact: true })).toBeVisible();
  await expect(page.getByText("ลองปรับคำค้นหรือตัวกรอง", { exact: true })).toBeVisible();
  const ปุ่ม = page.getByRole("button", { name: "แสดงทั้งหมด", exact: true });
  await expect(ปุ่ม, "ปุ่มในหน้าว่างชื่อ แสดงทั้งหมด").toBeVisible();
  await expect(page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }), "ไม่มีปุ่มชื่อ ล้างตัวกรอง แล้ว").toHaveCount(0);

  await ปุ่ม.click();
  await expect(page.getByText("ไม่พบลูกค้าที่ตรงกับเงื่อนไข", { exact: true }), "กดแล้วหน้าว่างหาย").toHaveCount(0);
  await expect(ช่องค้น, "กดแล้วคำค้นถูกล้าง").toHaveValue("");
  await expect(page.getByText(EXISTING_CUSTOMER_NAME, { exact: true }).first(), "กดแล้วเห็นลูกค้าเดิม").toBeVisible();
});
