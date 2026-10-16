import { test, expect } from "@playwright/test";
import { open, settle } from "./helpers";

// เทมเพลตที่ระบบแจก ต้องเอากลับเข้ามานำเข้าได้จริง (ทั้ง Excel และ CSV)
//
// ทำไมต้องมีเทสต์นี้: ตัวเขียนไฟล์ .xlsx กับตัวอ่านไฟล์ .xlsx เป็นคนละไฟล์กัน (makeXlsx / importSheet)
//   ทั้งคู่เขียนเองไม่ได้พึ่งไลบรารีภายนอก — แก้ข้างหนึ่งแล้วอีกข้างพังได้เงียบ ๆ
//   และอาการที่ผู้ใช้เห็นคือ "โหลดเทมเพลตมากรอกแล้วอัปกลับ ระบบบอกว่าไม่พบข้อมูล"
for (const [ชื่อ, ปุ่ม] of [["Excel", "ดาวน์โหลดเทมเพลต (Excel)"], ["CSV", "แบบ CSV"]] as const) {
  test(`[func·dealer] เทมเพลต ${ชื่อ} → อัปโหลดกลับเข้ามาอ่านได้`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1440, height: 950 });
    await open(page, "dealer", "/customers");
    await settle(page);
    await page.getByRole("button", { name: "นำเข้าลูกค้าเดิม" }).click();

    const [ไฟล์] = await Promise.all([
      page.waitForEvent("download", { timeout: 25_000 }),
      page.getByRole("button", { name: ปุ่ม }).click(),
    ]);
    // ต้องบันทึกด้วย "ชื่อไฟล์จริง" ก่อน — path() ของ Playwright เป็นชื่อสุ่มไม่มีนามสกุล
    const ที่อยู่ไฟล์ = require("node:path").join(
      require("node:os").tmpdir(), ไฟล์.suggestedFilename());
    await ไฟล์.saveAs(ที่อยู่ไฟล์);
    expect(ที่อยู่ไฟล์, "ต้องได้ไฟล์เทมเพลตจริง").toBeTruthy();
    console.log(ชื่อ, "→", ไฟล์.suggestedFilename(), require("node:fs").statSync(ที่อยู่ไฟล์).size, "bytes");

    // อัปโหลดไฟล์เดิมกลับเข้าไป — ต้องอ่านแถวตัวอย่างได้ 1 แถว พร้อมช่องใหม่ครบ
    await page.setInputFiles('input[aria-label="นำเข้าลูกค้าจากไฟล์"]', ที่อยู่ไฟล์);
    await expect(page.getByText("พบ 1 รายการ — ตรวจก่อนยืนยัน")).toBeVisible({ timeout: 20_000 });

    // อัปโหลดซ้ำด้วยไฟล์เดิมที่ "ไม่มีนามสกุล" — ต้องยังอ่านออก (ดูจากเนื้อไฟล์ ไม่ใช่ชื่อ)
    await page.setInputFiles('input[aria-label="นำเข้าลูกค้าจากไฟล์"]',
      { name: "ไฟล์ที่ถูกเปลี่ยนชื่อ", mimeType: "application/octet-stream",
        buffer: require("node:fs").readFileSync(ที่อยู่ไฟล์) });
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
  });
}
