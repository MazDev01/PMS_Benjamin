import { test, expect } from "@playwright/test";
import { open, settle } from "./helpers";
import { นำเข้าผ่านเมนู } from "./funcHelpers";

// เทมเพลตที่ระบบแจก ต้องเอากลับเข้ามานำเข้าได้จริง (ทั้ง Excel และ CSV)
//
// ทำไมต้องมีเทสต์นี้: ตัวเขียนไฟล์ .xlsx กับตัวอ่านไฟล์ .xlsx เป็นคนละไฟล์กัน (makeXlsx / importSheet)
//   ทั้งคู่เขียนเองไม่ได้พึ่งไลบรารีภายนอก — แก้ข้างหนึ่งแล้วอีกข้างพังได้เงียบ ๆ
//   และอาการที่ผู้ใช้เห็นคือ "โหลดเทมเพลตมากรอกแล้วอัปกลับ ระบบบอกว่าไม่พบข้อมูล"
// ปุ่มเป็นเมนูนำเข้า ตัวกลาง (บอสสั่ง 5 พ.ย. 69): แบบฟอร์มตัวอย่าง (Excel) อยู่ในเมนู · แบบ CSV อยู่ในกล่องตรวจ
//   อัปโหลดกลับผ่านเมนู (Excel/CSV เปิดหน้าต่างเลือกไฟล์ทันที รับเฉพาะนามสกุลนั้น) แล้วเข้ากล่องตรวจเดิม
const บันทึกไฟล์ที่ได้ = async (ไฟล์: import("@playwright/test").Download) => {
  // ต้องบันทึกด้วย "ชื่อไฟล์จริง" ก่อน — path() ของ Playwright เป็นชื่อสุ่มไม่มีนามสกุล
  const ที่อยู่ไฟล์ = require("node:path").join(require("node:os").tmpdir(), ไฟล์.suggestedFilename());
  await ไฟล์.saveAs(ที่อยู่ไฟล์);
  console.log(ไฟล์.suggestedFilename(), require("node:fs").statSync(ที่อยู่ไฟล์).size, "bytes");
  return ที่อยู่ไฟล์ as string;
};
const ตรวจแถวตัวอย่าง = async (page: import("@playwright/test").Page) => {
  await expect(page.getByText("พบ 1 รายการ — ตรวจก่อนยืนยัน")).toBeVisible({ timeout: 20_000 });
  const แถว = page.locator("tr", { hasText: "บจ. ตัวอย่างสตีล" });
  await expect(แถว).toBeVisible();
  await expect(แถว).toContainText("2568");            // 05/10/2025 → แสดงเป็น พ.ศ.
  // ⚠️ แถวตัวอย่างในเทมเพลตใช้ "ค่าจริงจากระบบ" แล้ว (จังหวัด/ผู้รับผิดชอบ ของสาขาที่ล็อกอิน · คอลัมน์แม่แบบลบแล้ว 16 ต.ค. 69)
  //    จึงห้ามผูกเทสต์กับค่าตายตัวเดิม ("เชียงใหม่"/"สมชาย เชียงใหม่") — ตรวจแค่ว่าไม่ว่างและอ่านกลับได้
  //    (บอสสั่ง 9 ก.ย. 69: ฟอร์มที่โหลดไปต้องกรอกแล้วอัปกลับได้โดยไม่ติดขัด)
  const จังหวัดในแถว = (await แถว.locator("td").nth(3).innerText()).trim();
  expect(จังหวัดในแถว.length, "ช่องจังหวัดของแถวตัวอย่างต้องมีค่าจริงจากระบบ").toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /^นำเข้า 1 ราย$/ })).toBeEnabled();
};
const เปิด = async (page: import("@playwright/test").Page) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await open(page, "dealer", "/customers");
  await settle(page);
};
const โหลดแบบฟอร์มจากเมนู = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: "นำเข้าลูกค้าเดิม" }).first().click();
  const [ไฟล์] = await Promise.all([
    page.waitForEvent("download", { timeout: 25_000 }),
    page.getByRole("menu", { name: "นำเข้าลูกค้าเดิม" }).locator('[data-import-option="template"]').click(),
  ]);
  expect(ไฟล์.suggestedFilename(), "แบบฟอร์มตัวอย่าง = เทมเพลต Excel เดิม").toBe("เทมเพลตลูกค้าเดิม.xlsx");
  return บันทึกไฟล์ที่ได้(ไฟล์);
};

test("[func·dealer] เทมเพลต Excel → อัปโหลดกลับเข้ามาอ่านได้", async ({ page }) => {
  test.setTimeout(150_000);
  await เปิด(page);
  const ที่อยู่ไฟล์ = await โหลดแบบฟอร์มจากเมนู(page);
  // อัปโหลดไฟล์เดิมกลับเข้าไปผ่านเมนู (Excel) — ต้องอ่านแถวตัวอย่างได้ 1 แถว พร้อมช่องใหม่ครบ
  await นำเข้าผ่านเมนู(page, "นำเข้าลูกค้าเดิม", "xlsx", ที่อยู่ไฟล์);
  await ตรวจแถวตัวอย่าง(page);
  // อัปโหลดซ้ำด้วยไฟล์เดิมที่ "ไม่มีนามสกุล" (ปุ่มเลือกไฟล์ในกล่อง) — ต้องยังอ่านออก (ดูจากเนื้อไฟล์ ไม่ใช่ชื่อ)
  await page.setInputFiles('input[aria-label="นำเข้าลูกค้าจากไฟล์"]',
    { name: "ไฟล์ที่ถูกเปลี่ยนชื่อ", mimeType: "application/octet-stream", buffer: require("node:fs").readFileSync(ที่อยู่ไฟล์) });
  await ตรวจแถวตัวอย่าง(page);
});

test("[func·dealer] เทมเพลต CSV → อัปโหลดกลับเข้ามาอ่านได้", async ({ page }) => {
  test.setTimeout(150_000);
  await เปิด(page);
  await นำเข้าผ่านเมนู(page, "นำเข้าลูกค้าเดิม", "xlsx", await โหลดแบบฟอร์มจากเมนู(page));
  const [ไฟล์] = await Promise.all([
    page.waitForEvent("download", { timeout: 25_000 }),
    page.getByRole("button", { name: "แบบ CSV" }).click(),
  ]);
  const ที่อยู่ไฟล์ = await บันทึกไฟล์ที่ได้(ไฟล์);
  await page.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  // อัปโหลดกลับผ่านเมนู (CSV)
  await นำเข้าผ่านเมนู(page, "นำเข้าลูกค้าเดิม", "csv", ที่อยู่ไฟล์);
  await ตรวจแถวตัวอย่าง(page);
});
