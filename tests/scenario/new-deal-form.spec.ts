import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ─── ฟอร์ม "เพิ่มงานขายใหม่" (หน้าลูกค้า) ต้องใช้กติกาเดียวกับฟอร์มเพิ่มลูกค้าเป้าหมาย ───
// ทั้งสองฟอร์มสร้างของอย่างเดียวกัน (งานขาย 1 รายการ) แต่คนละไฟล์ เดิมกฎจึงไม่ตรงกัน (บอสสั่งให้ปรับ 25 ส.ค. 69)
// ช่องประเมินราคาเอาออกจากหน้าเว็บทุกที่แล้ว (บอสตัดสิน 19 ต.ค. 69 ข้อ 5 · มูลค่าลีด = ยอดใบเสนอราคาล่าสุด)
//   ข้อ "มูลค่าอ่านไม่ออก/เกินเพดาน ต้องฟ้อง" จึงกลับด้านเป็น "ไม่มีช่องให้พิมพ์มูลค่าเลย"

// หน้าลูกค้ามีปุ่ม "เพิ่มงานขายใหม่" หลายจุด (หัวแถว + ในแผงรายละเอียด) — ยึดตัวฟอร์มเป็นหลัก
// ไม่ใช่ยึดข้อความบนปุ่ม ไม่งั้นเจอหลายตัวแล้วเทสต์ตกโดยที่ระบบไม่ได้ผิด
async function เปิดฟอร์มเพิ่มงานขาย(page: import("@playwright/test").Page) {
  await open(page, "dealer", "/customers");
  await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  // แผงลูกค้ามีทั้ง "แท็บ" และ "ปุ่ม" ที่ชื่อเดียวกัน — ต้องกดแท็บก่อน แล้วค่อยกดปุ่มข้างใน
  await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).first().click();
  await page.locator("button.btn-primary").filter({ hasText: "เพิ่มงานขายใหม่" }).first().click();
  await expect(page.getByText("พื้นที่ (ตร.ม.)"), "ฟอร์มต้องเปิดแล้ว").toBeVisible();
}

test("[func·dealer] เพิ่มงานขายใหม่: ไม่มีช่องประเมินราคา (มูลค่ามาจากใบเสนอราคาล่าสุด)", async ({ page }) => {
  await เปิดฟอร์มเพิ่มงานขาย(page);
  await expect(page.getByLabel("ประเมินราคา"), "ไม่มีช่องประเมินราคา").toHaveCount(0);
  await expect(page.getByText("ประเมินราคา", { exact: true }), "ไม่มีป้ายประเมินราคา").toHaveCount(0);
});

test("[func·dealer] เพิ่มงานขายใหม่: ไม่มีช่องแม่แบบ (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)", async ({ page }) => {
  await เปิดฟอร์มเพิ่มงานขาย(page);
  await expect(page.getByLabel("แม่แบบ", { exact: true }), "ฟอร์มเพิ่มงานขายต้องไม่มีช่องแม่แบบ").toHaveCount(0);
  await expect(page.getByText("แม่แบบ", { exact: true }), "ต้องไม่มีป้ายแม่แบบ").toHaveCount(0);
});

test("[func·dealer] เพิ่มงานขายใหม่: ช่องต้องเรียกชื่อเหมือนฟอร์มลูกค้าเป้าหมาย และคำอธิบายเป็นภาษาไทย", async ({ page }) => {
  await เปิดฟอร์มเพิ่มงานขาย(page);
  // ช่องเดียวกันห้ามเรียกคนละชื่อคนละหน้า
  await expect(page.getByText("พื้นที่ (ตร.ม.)")).toBeVisible();
  // ขั้นตอน — ต้องมีชุดตัวเลือกเดียวกับฟอร์มลูกค้าเป้าหมาย (เฉพาะขั้นก่อนเสนอราคา)
  const ขั้นตอน = page.getByLabel("ขั้นตอน");
  await expect(ขั้นตอน).toBeVisible();
  expect(await ขั้นตอน.locator("option").count(), "เลือกได้เฉพาะขั้นก่อนเสนอราคา").toBe(2);
  // คำอธิบายต้องไม่ปนศัพท์อังกฤษที่หน้าจอมีคำไทยใช้อยู่แล้ว
  const คำอธิบาย = page.getByText(/บอร์ดงานขาย|นับรวมใน/).first();
  await expect(คำอธิบาย).toBeVisible();
  const ข้อความ = await คำอธิบาย.innerText();
  expect(ข้อความ).not.toContain("pipeline");
  expect(ข้อความ).not.toContain("Dashboard");
});
