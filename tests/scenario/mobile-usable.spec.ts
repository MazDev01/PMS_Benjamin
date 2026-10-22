import { test, expect, devices } from "@playwright/test";
import { open } from "./helpers";

// ใช้งานบนมือถือได้จริง (บอสสั่ง 4 ก.ย. 69: "ใช้ระบบเหมือนเดิม แค่รองรับมือถือ")
//
// สองข้อที่วัดได้และเป็นตัวชี้ขาดว่ามือถือใช้งานได้จริงหรือไม่:
//   1) หน้าต้องไม่ล้นออกนอกจอแนวนอน — ถ้าล้น ผู้ใช้ต้องปัดซ้ายขวาทั้งหน้าเพื่ออ่านข้อความ
//      (ตารางที่กว้างกว่าจอไม่นับ เพราะอยู่ในกรอบที่เลื่อนได้ของตัวเอง = ตั้งใจออกแบบไว้แบบนั้น)
//   2) ปุ่มต้องสูงพอให้ปลายนิ้วกดถูก — เกณฑ์ที่ใช้กันคือ 44px · ระบบนี้ตั้งพื้นไว้ 32px
//      เพราะตารางมีความหนาแน่นสูง ถ้าดันทุกปุ่มเป็น 44 แถวจะยืดจนอ่านยากกว่าเดิม
test.use({ ...devices["iPhone 12"] });

const หน้าดีลเลอร์ = ["/dashboard", "/leads", "/quotations", "/customers", "/files", "/settings"];
const หน้าสำนักงานใหญ่ = ["/hq/dashboard", "/hq/dealers", "/hq/pipeline", "/hq/leads", "/hq/quotations", "/hq/customers", "/hq/settings"];

async function ตรวจหน้า(page: import("@playwright/test").Page, ชื่อ: string) {
  const ผล = await page.evaluate(() => ({
    ล้นแนวนอน: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ปุ่มเตี้ย: [...document.querySelectorAll("button, a[href], select, input:not([type=checkbox]):not([type=radio])")]
      .filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 30; })
      .map(el => (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24)),
  }));
  expect(ผล.ล้นแนวนอน, `${ชื่อ} ล้นออกนอกจอแนวนอน ${ผล.ล้นแนวนอน}px`).toBeLessThanOrEqual(2);
  expect(ผล.ปุ่มเตี้ย, `${ชื่อ} มีปุ่มที่เตี้ยกว่า 30px: ${ผล.ปุ่มเตี้ย.join(" · ")}`).toEqual([]);
}

test("[ui·dealer] ทุกหน้าของดีลเลอร์ใช้งานบนมือถือได้", async ({ page }) => {
  test.setTimeout(180_000);
  for (const path of หน้าดีลเลอร์) {
    await open(page, "dealer", path);
    await page.waitForTimeout(1_500);
    await ตรวจหน้า(page, `ดีลเลอร์ ${path}`);
  }
});

test("[ui·hq] ทุกหน้าของสำนักงานใหญ่ใช้งานบนมือถือได้", async ({ page }) => {
  test.setTimeout(180_000);
  for (const path of หน้าสำนักงานใหญ่) {
    await open(page, "hq", path);
    await page.waitForTimeout(1_500);
    await ตรวจหน้า(page, `สำนักงานใหญ่ ${path}`);
  }
});

// แดชบอร์ด HQ: ลิงก์ "ดูรายละเอียด" และแถวอันดับ 10 อันดับ ต้องสูงอย่างน้อย 44px บนมือถือ (บอสอนุมัติ 22 ต.ค. 69 — เกณฑ์ปลายนิ้วเต็ม)
test("[ui·hq] แดชบอร์ด HQ บนมือถือ: ลิงก์ดูรายละเอียด + แถวอันดับ สูงอย่างน้อย 44px", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");
  const ลิงก์ = page.getByRole("link", { name: /ดูรายละเอียด/ });
  await expect(ลิงก์.first()).toBeVisible({ timeout: 25_000 });
  const แถว = page.locator("[data-top-row]");
  await expect(แถว.first(), "ข้อมูลตั้งต้นต้องมีดีลเลอร์ในอันดับ").toBeVisible({ timeout: 25_000 });
  const ความสูง = async (l: import("@playwright/test").Locator) =>
    (await l.evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().height))));
  const สูงลิงก์ = await ความสูง(ลิงก์), สูงแถว = await ความสูง(แถว);
  expect(สูงลิงก์.length, "ต้องมีลิงก์ดูรายละเอียดครบ 4 การ์ด").toBe(4);
  expect(สูงลิงก์.filter(h => h < 44), `ลิงก์ดูรายละเอียดเตี้ยกว่า 44px: ${สูงลิงก์.join(",")}`).toEqual([]);
  expect(สูงแถว.filter(h => h < 44), `แถวอันดับเตี้ยกว่า 44px: ${สูงแถว.join(",")}`).toEqual([]);
});

test("[ui·dealer] เมนูหลักบนมือถือ — เปิดจากปุ่มขีดสามขีดแล้วกดไปหน้าอื่นได้", async ({ page }) => {
  await open(page, "dealer", "/dashboard");
  // บนมือถือเมนูด้านข้างถูกยุบ ต้องมีปุ่มเปิดเมนู
  const ปุ่มเมนู = page.getByRole("button", { name: /เมนู|menu/i }).first();
  await expect(ปุ่มเมนู).toBeVisible({ timeout: 20_000 });
  await ปุ่มเมนู.click();
  const ลิงก์ลูกค้าเป้าหมาย = page.getByRole("link", { name: /ลูกค้าเป้าหมาย/ }).first();
  await expect(ลิงก์ลูกค้าเป้าหมาย).toBeVisible({ timeout: 10_000 });
  await ลิงก์ลูกค้าเป้าหมาย.click();
  await expect(page).toHaveURL(/\/leads/, { timeout: 20_000 });
});
