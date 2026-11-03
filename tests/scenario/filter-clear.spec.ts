// ── "ล้างตัวกรอง" ต้องล้างช่วงเวลาด้วย (บอสแจ้ง 24 ส.ค. 69: "ทำไมมันยังไม่ล้าง") ──
//
// เดิมปุ่มล้างแตะเฉพาะตัวกรองที่เป็นดรอปดาวน์ ช่วงเวลาที่กำหนดเองยังค้างอยู่
// ตัวเลขบนจอจึงยังแคบตามช่วงเดิมทั้งที่ผู้ใช้เห็นว่าล้างไปแล้ว — และช่องวันที่ก็ยังค้างค่าเก่า
//
// ปรับกติกา 3 พ.ย. 69 (บอสสั่ง · ตัวเลือกช่วงเวลาเหลือ 1 เดือน · 3 เดือน · 1 ปี · กำหนดเอง): "ทุกช่วงเวลา" เอาออก
//   ล้างแล้ว = กลับค่าตั้งต้น "1 ปี" (เดิม 28 ส.ค. 69 = ทุกช่วงเวลา) · ช่วงที่กำหนดเองต้องไม่ค้าง
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle, ปุ่มช่วงเวลา } from "./helpers";
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test("ล้างตัวกรองต้องล้างช่วงเวลาที่กำหนดเองด้วย", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/leads");
  await settle(page); await page.waitForTimeout(1200);
  const ปุ่มเวลา = ปุ่มช่วงเวลา(page);
  const ก่อน = (await ปุ่มเวลา.innerText()).trim();
  await ปุ่มเวลา.click();
  await page.getByRole("button", { name: "กำหนดช่วงเอง" }).click();
  await page.getByLabel("วันเริ่มต้นของช่วงที่กำหนดเอง").fill("2026-03-01");
  await page.getByLabel("วันสิ้นสุดของช่วงที่กำหนดเอง").fill("2026-03-31");
  await page.getByRole("button", { name: "ใช้ช่วงเวลานี้" }).click();
  await page.waitForTimeout(700);
  const หลังตั้ง = (await ปุ่มเวลา.innerText()).trim();
  console.log("ก่อน:", ก่อน, "→ ตั้งช่วงเอง:", หลังตั้ง);
  expect(หลังตั้ง).not.toBe(ก่อน);
  const ล้าง = page.getByRole("button", { name: "ล้างตัวกรอง" });
  await expect(ล้าง, "เลือกช่วงเองแล้วปุ่มล้างต้องโผล่").toBeVisible();
  await ล้าง.click();
  await page.waitForTimeout(700);
  const หลังล้าง = (await ปุ่มเวลา.innerText()).trim();
  console.log("หลังล้าง:", หลังล้าง);
  await expect(page.locator("[data-time-range]").first(), "ล้างแล้วกลับค่าตั้งต้น 1 ปี").toHaveAttribute("data-time-range", "y1");
  expect(หลังล้าง, "ล้างแล้ว = ช่วงตั้งต้นเดิมตอนเปิดหน้า").toBe(ก่อน);
  expect(หลังล้าง, "ต้องไม่ค้างช่วงที่กำหนดเองไว้").not.toBe(หลังตั้ง);
  // ช่องวันที่ต้องว่างตามด้วย
  await ปุ่มเวลา.click();
  await page.getByRole("button", { name: "กำหนดช่วงเอง" }).click();
  const v1 = await page.getByLabel("วันเริ่มต้นของช่วงที่กำหนดเอง").inputValue();
  const v2 = await page.getByLabel("วันสิ้นสุดของช่วงที่กำหนดเอง").inputValue();
  console.log("ค่าในช่องวันที่หลังล้าง:", JSON.stringify([v1, v2]));
  expect([v1, v2], "ช่องวันที่ต้องถูกล้างตาม").toEqual(["", ""]);
});
