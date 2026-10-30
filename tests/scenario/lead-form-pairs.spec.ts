import { test, expect, type Page } from "@playwright/test";
import { settle } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";

// ── ฟอร์มเพิ่มลูกค้าเป้าหมาย: ช่องคู่อยู่บรรทัดเดียวกัน (บอสสั่ง 30 ต.ค. 69) ─────────────────────────────────────────────
//   งานที่ต้องการ คู่ พื้นที่ (ตร.ม.) · ช่องทางที่มา คู่ ผู้รับผิดชอบ — วัดตำแหน่งจริงบนจอ (ขอบบนเท่ากัน · อยู่ซ้าย-ขวา)
//   จอมือถือ: ฟอร์มเหลือคอลัมน์เดียว ช่องเรียงลงตามเดิม (ไม่บีบ)
//   โค้ดเดิม: งานที่ต้องการ/ผู้รับผิดชอบ เต็มแถว → พื้นที่/ช่องทางที่มา อยู่บรรทัดถัดไปคนเดียว → ตก
//   ไม่บันทึกอะไรลงฐาน (เปิดฟอร์มแล้ววัดเท่านั้น)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

async function เปิดฟอร์ม(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const ฟอร์ม = page.getByRole("dialog");
  await expect(ฟอร์ม.locator("#lf-project")).toBeVisible({ timeout: 15_000 });
  return ฟอร์ม;
}
const กล่อง = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
// ช่องพื้นที่หาด้วยป้าย (ไม่ใช้ id) — โค้ดเดิมไม่มี id ช่องนี้ จะได้ตกเพราะตำแหน่ง ไม่ใช่เพราะหาช่องไม่เจอ
const ช่องพื้นที่ = (page: Page) => page.getByRole("dialog").locator("label").filter({ hasText: /^พื้นที่/ }).first().locator("xpath=..").locator("input").first();
const ช่องของป้าย = (ฟอร์ม: ReturnType<Page["getByRole"]>, ป้าย: string) =>
  ฟอร์ม.locator("label").filter({ hasText: new RegExp(`^${ป้าย}`) }).first().locator("xpath=..");

test("[ui·dealer] ฟอร์มเพิ่มลูกค้าเป้าหมาย: งานที่ต้องการคู่พื้นที่ · ช่องทางที่มาคู่ผู้รับผิดชอบ อยู่บรรทัดเดียวกัน", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ฟอร์ม = await เปิดฟอร์ม(page);
  const งาน = await กล่อง(page, "#lf-project"), พื้นที่ = (await ช่องพื้นที่(page).boundingBox())!;
  expect(Math.abs(งาน.y - พื้นที่.y), `งานที่ต้องการ (y ${งาน.y}) กับ พื้นที่ (y ${พื้นที่.y}) ต้องอยู่บรรทัดเดียวกัน`).toBeLessThan(4);
  expect(พื้นที่.x, "พื้นที่อยู่ขวาของงานที่ต้องการ").toBeGreaterThan(งาน.x + งาน.width - 1);
  const ช่องทาง = (await ช่องของป้าย(ฟอร์ม, "ช่องทางที่มา").boundingBox())!, ผู้รับผิดชอบ = (await ช่องของป้าย(ฟอร์ม, "ผู้รับผิดชอบ").boundingBox())!;
  expect(Math.abs(ช่องทาง.y - ผู้รับผิดชอบ.y), `ช่องทางที่มา (y ${ช่องทาง.y}) กับ ผู้รับผิดชอบ (y ${ผู้รับผิดชอบ.y}) ต้องอยู่บรรทัดเดียวกัน`).toBeLessThan(4);
  expect(ผู้รับผิดชอบ.x, "ผู้รับผิดชอบอยู่ขวาของช่องทางที่มา").toBeGreaterThan(ช่องทาง.x + ช่องทาง.width - 1);
  // จังหวัดหน้างานเต็มแถว (คู่ งาน+พื้นที่ ขึ้นมาพอดี ไม่เหลือช่องว่างครึ่งแถว)
  //   วัดกล่องของช่อง (ช่องเลือกจังหวัดเองมีความกว้างสูงสุดของมัน) — กล่องเต็มแถว = งาน+พื้นที่ ขึ้นบรรทัดถัดไปพอดี
  const จังหวัด = (await page.locator("div.col-full:has(#lf-province)").first().boundingBox())!;
  expect(จังหวัด.width, "จังหวัดหน้างานเต็มแถว").toBeGreaterThan(งาน.width + พื้นที่.width - 4);
  expect(งาน.y, "งานที่ต้องการอยู่ใต้จังหวัด (บรรทัดใหม่)").toBeGreaterThan(จังหวัด.y + จังหวัด.height - 1);
});

test("[ui·dealer] ฟอร์มเพิ่มลูกค้าเป้าหมายบนมือถือ: ช่องเรียงลงทีละช่อง (ไม่บีบคู่)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await เปิดฟอร์ม(page);
  const งาน = await กล่อง(page, "#lf-project"), พื้นที่ = (await ช่องพื้นที่(page).boundingBox())!;
  expect(พื้นที่.y, "มือถือ: พื้นที่อยู่ใต้งานที่ต้องการ").toBeGreaterThan(งาน.y + งาน.height - 1);
  const กว้างจอ = await page.evaluate(() => document.documentElement.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "หน้าไม่ล้นจอแนวนอน").toBeLessThanOrEqual(กว้างจอ + 3);
});
