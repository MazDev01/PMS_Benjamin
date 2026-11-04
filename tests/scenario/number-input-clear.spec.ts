import { test, expect } from "@playwright/test";
import { open, settle } from "./helpers";
import { ใช้แถวกลาง } from "./sharedRowLock";

// หน้าตั้งค่าของ RYG อ่านแถวตั้งค่ากลางของ RYG — ต่อคิวกับข้อที่แก้แถวนี้ชั่วคราว (พิมพ์ใบตั้งชื่อบริษัททดสอบ · RLS)
ใช้แถวกลาง(test, "dealer_settings.RYG");

// ช่องตัวเลข: ลบทั้งช่องแล้วต้องว่างจริง (ไม่เด้งเป็น 0) · พิมพ์ต่อต้องไม่ได้ "09"
test("[dealer] ช่อง % ภาษี ลบแล้วว่าง พิมพ์ใหม่ไม่มีศูนย์นำหน้า", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 950 });
  await open(page, "dealer", "/settings"); await settle(page);
  // แท็บ "ตั้งค่าใบเสนอราคา" ตรงตัว — เดิมจับปุ่มแรกที่มีคำว่า "เอกสาร"/"ใบเสนอราคา" แล้วกลืนข้อผิดพลาด
  //   ชื่อบริษัทของสาขามีคำว่า "เอกสาร" (ข้อทดสอบพิมพ์ใบ) = ไปกดเมนูบัญชีแทน แล้วหาช่อง VAT ไม่เจอ (รอบตรวจ deploy16)
  await page.getByRole("button", { name: "ตั้งค่าใบเสนอราคา", exact: true }).click();
  const vat = page.getByLabel("ภาษีมูลค่าเพิ่ม %");
  await expect(vat).toBeVisible({ timeout: 20_000 });

  await vat.click();
  await vat.press("Control+a");
  await vat.press("Backspace");
  expect(await vat.inputValue(), "ลบแล้วต้องว่าง ไม่ใช่ 0").toBe("");
  await vat.type("9");
  expect(await vat.inputValue(), "พิมพ์ 9 ต้องได้ 9 ไม่ใช่ 09").toBe("9");
  await vat.press("Tab");
  expect(await vat.inputValue()).toBe("9");

  // ปล่อยว่างแล้วออกจากช่อง → ลงค่าต่ำสุดให้ (0) ไม่ค้างว่าง
  await vat.click(); await vat.press("Control+a"); await vat.press("Backspace"); await vat.press("Tab");
  expect(await vat.inputValue()).toBe("0");

  // ช่องหัก ณ ที่จ่าย เป็นแบบเดียวกัน
  const wht = page.getByLabel("ภาษีหัก ณ ที่จ่าย %");
  await wht.click(); await wht.press("Control+a"); await wht.press("Backspace");
  expect(await wht.inputValue()).toBe("");
  await wht.type("3");
  expect(await wht.inputValue()).toBe("3");
});
