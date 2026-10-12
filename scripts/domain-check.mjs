// เปิดหน้าเข้าสู่ระบบของเว็บจริงด้วยเบราว์เซอร์จริง (ไม่ต้องล็อกอิน)
// ตรวจว่า: หน้าโหลดได้ · โค้ดฝั่งหน้าเว็บทำงาน · ไม่มี error · ไม่มี mixed content
// · คำขอทุกอันเป็น https · หน้าเว็บคุยกับ API ของตัวเองได้จริง
import { chromium } from "@playwright/test";

const เว็บ = [
  ["สำนักงานใหญ่ (ของจริง)", "https://pms.benjaminpebsteel.com/hq/login"],
  ["ดีลเลอร์ (ของจริง)", "https://dealerpms.benjaminpebsteel.com/login"],
  ["สำนักงานใหญ่ (ตัวอย่าง)", "https://pms-demo-two.vercel.app/hq/login"],
  ["ดีลเลอร์ (ตัวอย่าง)", "https://pms-demo-dealer.vercel.app/login"],
];
const browser = await chromium.launch();
for (const [ชื่อ, url] of เว็บ) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [], คำขอ = [], ไม่ปลอดภัย = [];
  page.on("pageerror", e => errs.push("uncaught: " + e.message.slice(0, 90)));
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0, 90)); });
  page.on("request", r => {
    คำขอ.push(r.url());
    if (r.url().startsWith("http://")) ไม่ปลอดภัย.push(r.url());
  });
  const t0 = Date.now();
  const res = await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(4000);
  const มีฟอร์ม = await page.locator("input[type=password]").count();
  const เนื้อหา = (await page.evaluate(() => document.body.innerText)).trim().length;
  const พัง = (await page.evaluate(() => document.body.innerText)).includes("เกิดข้อผิดพลาด");
  const ของเรา = errs.filter(e => !/sentry|analytics|favicon|404/i.test(e));
  console.log("");
  console.log("=== " + ชื่อ);
  console.log("  status " + (res?.status() ?? "-") + " · เปิดใน " + (Date.now() - t0) + "ms · เนื้อหา " + เนื้อหา + " ตัวอักษร · ช่องรหัสผ่าน " + มีฟอร์ม);
  console.log("  คำขอทั้งหมด " + คำขอ.length + " · แบบไม่เข้ารหัส (http) " + ไม่ปลอดภัย.length + " · จอผิดพลาด " + (พัง ? "มี" : "ไม่มี"));
  console.log("  error ที่เป็นของระบบเรา: " + (ของเรา.length ? ของเรา.join(" | ") : "ไม่มี"));
  await ctx.close();
}
await browser.close();
