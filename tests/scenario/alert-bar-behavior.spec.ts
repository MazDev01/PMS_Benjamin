import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── แถบเตือนสีแดง "บันทึก/ลบไม่สำเร็จ" ต้องขึ้นแป๊บเดียว และอยู่เฉพาะหน้าที่กด ──
// บอสสั่ง (14 ส.ค. 69): "ข้อความแบบนี้แสดงแปบเดียวพอไม่ต้องแสดงนาน และแสดงในหน้านั้นๆ
//   ไม่ต้องแสดงในหน้าอื่นๆ" — เดิมแถบค้างจนกว่าจะกดกากบาท และตามไปโผล่ทุกหน้าที่เปิดต่อ
// ยิง event ตรงๆ แทนการสร้างเงื่อนไขผิดพลาดจริง เพราะที่ตรวจคือ "พฤติกรรมของแถบ" ไม่ใช่ต้นเหตุ
// ⚠️ ต้องยิงซ้ำจนกว่าแถบจะขึ้น (แก้ 26 ส.ค. 69)
//   เดิมยิงครั้งเดียวทันทีหลังเปิดหน้า · ถ้าหน้าจอยังติดตั้งตัวรับ event ไม่เสร็จ (เซิร์ฟเวอร์เพิ่งเปิด
//   หรือเครื่องกำลังหนัก) event จะหายไปเงียบ ๆ แล้วเทสต์ล้มด้วย "ไม่เจอแถบ" ทั้งที่ระบบไม่ได้พัง
const ยิงข้อความเตือน = async (page: import("@playwright/test").Page, msg: string) => {
  for (let i = 0; i < 10; i++) {
    await page.evaluate((m) => window.dispatchEvent(new CustomEvent("pms:repo-save-error", { detail: m })), msg);
    if (await page.getByRole("alert").filter({ hasText: "บันทึกไม่สำเร็จ" }).count()) return;   // ไม่ใช่การข้าม: วนรอให้แถบเตือนขึ้น (เจอแล้วจบวน)
    await page.waitForTimeout(500);
  }
};

const แถบ = (page: import("@playwright/test").Page) =>
  page.getByRole("alert").filter({ hasText: "บันทึกไม่สำเร็จ" });

test("แถบเตือนหายเองภายในไม่กี่วินาที ไม่ต้องกดปิด", async ({ page }) => {
  await open(page, "dealer", "/customers");
  await ยิงข้อความเตือน(page, "ทดสอบข้อความเตือน");
  await expect(แถบ(page)).toBeVisible();
  // ยังต้องอยู่นานพอให้อ่านทัน (ไม่ใช่วาบเดียวแล้วหาย)
  await page.waitForTimeout(3000);
  await expect(แถบ(page)).toBeVisible();
  // แล้วหายเองโดยผู้ใช้ไม่ต้องทำอะไร
  await expect(แถบ(page)).toBeHidden({ timeout: 8000 });
});

test("เปลี่ยนหน้าแล้วแถบเตือนของหน้าเดิมไม่ตามไปด้วย", async ({ page }) => {
  await open(page, "dealer", "/customers");
  await ยิงข้อความเตือน(page, "ทดสอบข้อความเตือน");
  await expect(แถบ(page)).toBeVisible();
  await page.getByRole("link", { name: /ลูกค้าเป้าหมาย/ }).first().click();
  await expect(page).toHaveURL(/\/leads/);
  await expect(แถบ(page)).toBeHidden();
});
