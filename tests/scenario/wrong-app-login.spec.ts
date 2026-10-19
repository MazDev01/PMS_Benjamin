import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN } from "./funcHelpers";
import { settle } from "./helpers";

// ── บัญชีต้องตรงกับแอปที่กำลังเข้า (ผู้ใช้แจ้ง 18 ส.ค. 69) ─────────────────────────
//
// อาการเดิม: เอารหัสของสำนักงานใหญ่ไปกรอกที่หน้าเข้าสู่ระบบของ "ดีลเลอร์" แล้วเข้าได้จริง
//   แถมถูกพาไป /hq/dashboard ซึ่งไม่มีอยู่ในแอปดีลเลอร์ → ผู้ใช้เจอหน้า 404 เฉย ๆ
//   ต้นเหตุ: หลังล็อกอินสำเร็จ โค้ดดูแค่ "บัญชีนี้เป็น HQ หรือดีลเลอร์" แล้วส่งไปตามนั้น
//   ไม่เคยถามว่า "แอปที่เขายืนอยู่ตอนนี้ใช่ที่ของเขาหรือเปล่า"
//
// เทสต์นี้ล็อกสองด้าน — ต้องไม่เข้าได้ และต้องบอกให้ไปเข้าที่ถูกที่
//   ⚠️ ที่สำคัญไม่แพ้กัน: ต้องไม่ค้างอยู่ในระบบ ตอนตรวจเจอนั้นใบผ่านถูกออกให้ไปแล้ว
//      ถ้าลืมสั่งออกจากระบบ = มีใบผ่านของคนสำนักงานใหญ่ค้างบนโดเมนของดีลเลอร์
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

async function tryLogin(page: Page, origin: string, path: string, who: { email: string; password: string }) {
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const email = page.locator("#login-email");
  const pass = page.getByLabel(/รหัสผ่าน/i).first();
  // กรอกแล้วต้องอยู่นิ่งก่อนกด — React hydrate อาจมาคั่นแล้วล้างค่าที่กรอกไป
  for (let i = 0; i < 6; i++) {
    await email.fill(who.email); await pass.fill(who.password);
    await page.waitForTimeout(300);
    if (await email.inputValue() === who.email && await pass.inputValue() === who.password) break;
  }
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  await page.waitForTimeout(6000);
}

test("[auth] รหัสสำนักงานใหญ่ใช้ที่หน้าเข้าสู่ระบบของดีลเลอร์ไม่ได้", async ({ page }) => {
  await tryLogin(page, DEALER_ORIGIN, "/login", ADMIN);

  expect(new URL(page.url()).pathname, "ต้องยังอยู่ที่หน้าเข้าสู่ระบบ ไม่ใช่ถูกพาไปหน้าอื่น").toContain("/login");
  await expect(page.getByText(/เป็นของสำนักงานใหญ่/).first(),
    "ต้องบอกว่าบัญชีนี้ใช้ที่นี่ไม่ได้ และให้ไปเข้าที่ไหน — ไม่ใช่ปล่อยไปเจอหน้า 404",
  ).toBeVisible({ timeout: 15_000 });

  // เปิดหน้าในระบบต่อต้องเข้าไม่ได้ = ไม่มีใบผ่านค้างอยู่จริง
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  expect(new URL(page.url()).pathname, "ต้องไม่มีใบผ่านค้างอยู่หลังถูกปฏิเสธ").toContain("/login");
});

test("[auth] รหัสดีลเลอร์ใช้ที่หน้าเข้าสู่ระบบของสำนักงานใหญ่ไม่ได้", async ({ page }) => {
  await tryLogin(page, HQ_ORIGIN, "/hq/login", RYG);

  expect(new URL(page.url()).pathname, "ต้องยังอยู่ที่หน้าเข้าสู่ระบบ").toContain("/login");
  // ⚠️ ลองล็อกอินซ้ำหนึ่งครั้งถ้าข้อความยังไม่ขึ้น (แก้ 26 ส.ค. 69)
  //   ตอนรันทั้งชุด มีการล็อกอินผ่านหน้าจอถี่มาก บริการยืนยันตัวตนจะหน่วงคำขอเป็นครั้งคราว
  //   คำขอที่ถูกหน่วงไม่ได้แปลว่าระบบยอมให้เข้า — แค่ตอบช้าจนเลยเวลารอ
  const ข้อความ = page.getByText(/เป็นของดีลเลอร์/).first();
  if (!(await ข้อความ.isVisible().catch(() => false))) {
    await page.waitForTimeout(2000);
    await tryLogin(page, HQ_ORIGIN, "/hq/login", RYG);
  }
  await expect(ข้อความ, "ต้องบอกว่าบัญชีนี้ใช้ที่นี่ไม่ได้").toBeVisible({ timeout: 20_000 });

  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  expect(new URL(page.url()).pathname, "ต้องไม่มีใบผ่านค้างอยู่หลังถูกปฏิเสธ").toContain("/login");
});
