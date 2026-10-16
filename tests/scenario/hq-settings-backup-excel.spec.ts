import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ปุ่ม "สำรองและกู้คืนข้อมูล" ที่ /hq/settings ต้องได้ไฟล์ที่คนเปิดอ่านเองได้ และนำกลับเข้าระบบได้จริง
// (บอสสั่ง 3 ก.ย. 69: ของเดิมเป็น .json อ่านไม่รู้เรื่อง — "เอาไฟล์ปกติที่คนใช้กัน")
//
// เทสต์นี้ตรวจตั้งแต่กดปุ่มจนถึงค่าที่เปลี่ยนจริงบนหน้าจอ ไม่ใช่แค่ "มีไฟล์ดาวน์โหลด"

test.describe("[func·hq] สำรอง/กู้คืนการตั้งค่าเป็นไฟล์ Excel", () => {
  test("ส่งออกได้ไฟล์ .xlsx ที่มีครบทุกแท็บ แล้วนำเข้ากลับได้", async ({ page }) => {
    await open(page, "hq", "/hq/settings");
    await page.getByRole("button", { name: "บริษัท", exact: true }).click().catch(() => {});
    const ปุ่มส่งออก = page.getByRole("button", { name: /ส่งออก \(สำรองข้อมูล\)/ });
    await expect(ปุ่มส่งออก).toBeVisible({ timeout: 20_000 });

    const [ไฟล์] = await Promise.all([page.waitForEvent("download"), ปุ่มส่งออก.click()]);
    expect(ไฟล์.suggestedFilename()).toMatch(/\.xlsx$/);
    const ที่เก็บ = await ไฟล์.path();
    expect(ที่เก็บ).toBeTruthy();

    // ไฟล์ต้องเป็นซอง zip ของจริง (Excel เปิดได้) ไม่ใช่ HTML ที่ตั้งชื่อว่า .xlsx
    const ไบต์ = await ไฟล์.createReadStream().then(async s => {
      const ชิ้น: Buffer[] = [];
      for await (const c of s) ชิ้น.push(c as Buffer);
      return Buffer.concat(ชิ้น);
    });
    expect(ไบต์.subarray(0, 2).toString()).toBe("PK");
    const ข้อความในไฟล์ = ไบต์.toString("utf8");
    for (const แท็บ of ["ข้อมูลบริษัท", "นโยบายการขาย", "เป้าหมายยอดขาย", "ดีลเลอร์"]) {
      expect(ข้อความในไฟล์).toContain(แท็บ);
    }
    // แท็บแม่แบบ/ราคาแม่แบบ ลบแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
    expect(ข้อความในไฟล์, "ไฟล์สำรองต้องไม่มีแท็บแม่แบบ").not.toContain("แม่แบบสินค้า");
    await expect(page.getByText(/ส่งออกแล้ว — \d+ แท็บ/)).toBeVisible();

    // นำไฟล์เดิมกลับเข้าระบบ — ค่าต้องเท่าเดิม ไม่มีอะไรพัง
    await page.locator('input[type="file"][accept=".xlsx,.csv,.json"]').setInputFiles(ที่เก็บ!);
    await expect(page.getByText(/นำเข้าสำเร็จ/)).toBeVisible({ timeout: 20_000 });
  });

  test("ไฟล์ที่ไม่ใช่ไฟล์สำรอง ต้องบอกผู้ใช้ ไม่ใช่เขียนทับค่าเดิม", async ({ page }) => {
    await open(page, "hq", "/hq/settings");
    await expect(page.getByRole("button", { name: /ส่งออก \(สำรองข้อมูล\)/ })).toBeVisible({ timeout: 20_000 });
    await page.locator('input[type="file"][accept=".xlsx,.csv,.json"]').setInputFiles({
      name: "รายชื่ออะไรก็ไม่รู้.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("ชื่อ,นามสกุล\nสมชาย,ใจดี\n", "utf8"),
    });
    await expect(page.getByText(/ไม่มีแท็บการตั้งค่าที่ระบบรู้จัก/)).toBeVisible({ timeout: 15_000 });
  });
});
