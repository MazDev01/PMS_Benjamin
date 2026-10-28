import { test, expect } from "@playwright/test";
import { ที่อยู่เว็บ } from "./sessionPorts";

// ─── ช่องอีเมลหน้าเข้าสู่ระบบ ต้องไม่รับช่องว่าง (ผู้ใช้แจ้ง 25 ส.ค. 69) ────────
// เดิมตัดช่องว่างตอนกดเข้าระบบเท่านั้น ผู้ใช้จึงเห็นช่องว่างค้างอยู่หน้าอีเมล
// แล้วไม่แน่ใจว่าที่เข้าไม่ได้เป็นเพราะช่องว่างหรือเพราะรหัสผิด

for (const [ชื่อ, url] of [["สำนักงานใหญ่", `${ที่อยู่เว็บ.hq}/hq/login`], ["ดีลเลอร์", `${ที่อยู่เว็บ.dealer}/login`]] as const) {
  test(`[func] หน้าเข้าสู่ระบบ${ชื่อ}: พิมพ์เว้นวรรคในช่องอีเมล/รหัสผ่านต้องไม่ติด`, async ({ page }) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // ดีลเลอร์พิมพ์รหัสสาขา (ป้าย "รหัสสาขา" · 19 ต.ค. 69) · HQ พิมพ์อีเมล
    const ช่องอีเมล = page.getByLabel(ชื่อ === "ดีลเลอร์" ? "รหัสสาขา" : "อีเมล", { exact: true });
    await expect(ช่องอีเมล).toBeVisible();

    // ⚠️ ต้องรอให้หน้าจอ "รับค่าได้จริง" ก่อน แล้วค่อยตรวจ (แก้ 26 ส.ค. 69)
    //   หน้า login วาดจากเซิร์ฟเวอร์มาก่อน แล้วเบราว์เซอร์ค่อยติดตั้งตัวควบคุมช่องกรอกทีหลัง
    //   ถ้าพิมพ์ก่อนตัวควบคุมพร้อม ค่าที่พิมพ์จะถูกล้างทิ้งตอนติดตั้งเสร็จ → ช่องกลายเป็นว่าง
    //   เทสต์จะล้มว่า "ได้ค่าว่าง" ทั้งที่ระบบไม่ได้พัง (เจอเฉพาะตอนเครื่องกำลังหนัก)
    const พิมพ์ให้ติด = async (ช่อง: typeof ช่องอีเมล, ข้อความ: string, ควรได้: string, ทีละตัว = false) => {
      for (let i = 0; i < 6; i++) {
        await ช่อง.fill("");
        if (ทีละตัว) { await ช่อง.click(); await ช่อง.pressSequentially(ข้อความ, { delay: 15 }); }
        else await ช่อง.fill(ข้อความ);
        await page.waitForTimeout(250);
        if (await ช่อง.inputValue() === ควรได้) return;
      }
    };

    // เคาะเว้นวรรคนำหน้า แล้วพิมพ์อีเมล — ช่องว่างต้องไม่เข้าไปอยู่ในช่อง
    await พิมพ์ให้ติด(ช่องอีเมล, "  admin@benjamin.com ", "admin@benjamin.com", true);
    await expect(ช่องอีเมล).toHaveValue("admin@benjamin.com");

    // วางค่าที่มีช่องว่างปนกลางก็ต้องถูกตัดเหมือนกัน
    await พิมพ์ให้ติด(ช่องอีเมล, " admin @benjamin.com ", "admin@benjamin.com");
    await expect(ช่องอีเมล).toHaveValue("admin@benjamin.com");

    // ช่องรหัสผ่านต้องกันช่องว่างเหมือนกัน (บอสสั่ง 25 ส.ค. 69)
    const ช่องรหัส = page.getByLabel("รหัสผ่าน", { exact: true });
    await พิมพ์ให้ติด(ช่องรหัส, " ab cd ", "abcd", true);
    await expect(ช่องรหัส).toHaveValue("abcd");
    await พิมพ์ให้ติด(ช่องรหัส, "  P@ss w0rd  ", "P@ssw0rd");
    await expect(ช่องรหัส).toHaveValue("P@ssw0rd");
  });
}
