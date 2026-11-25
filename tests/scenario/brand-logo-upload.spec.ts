import { test, expect, type Page } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";

// ── HQ เปลี่ยนโลโก้ของระบบได้ (บอสสั่ง 24 พ.ย. 69 · ใบ 0304) ─────────────────────────────────────
//   ตั้งค่า › บริษัท › โลโก้ของระบบ: อัปแล้วเมนูมุมซ้ายบนของ HQ และดีลเลอร์เปลี่ยน · ปุ่ม "กลับไปใช้โลโก้ Benjamin เดิม"
//   PNG / JPG / WebP ≤ 1 MB · SVG / ไฟล์ปลอมนามสกุล / เกินขนาด ถูกปฏิเสธ — ทั้งหน้าเว็บ และเซิร์ฟเวอร์ (ยิงเส้นทางตรง ไม่ผ่านหน้าเว็บ)
//   ดีลเลอร์เปลี่ยนเองไม่ได้ · ไม่ล็อกอิน = ไม่ได้รูป/ไม่ได้ sha · หน้าเข้าระบบใช้โลโก้เดิมเสมอ · ไม่แสดงชื่อไฟล์ที่อัป
//   ตกบนโค้ดเดิม: หน้าตั้งค่าไม่มีปุ่มอัปโหลดโลโก้ ("เปลี่ยน/แนบโลโก้อื่นไม่ได้") · ไม่มีเส้นทาง /api/v1/brand-logo
//   ⚠️ โลโก้เป็นค่าเดียวทั้งเครือ — ข้อนี้รันเรียงกัน และคืนโลโก้เดิมทุกครั้งที่จบ (afterAll)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

// รูปจริงขนาด 1×1 (เบราว์เซอร์แสดงได้) — ชื่อไฟล์ตั้งให้จำได้ เพื่อตรวจว่าไม่ถูกแสดงบนจอ
const PNG_1x1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
const ชื่อไฟล์ลับ = "zz-ชื่อไฟล์ห้ามแสดง.png";
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>', "utf8");
const ข้อความปลอม = Buffer.from("ไม่ใช่รูป แค่ตั้งชื่อเป็น logo.png", "utf8");
const ใหญ่เกิน = Buffer.concat([PNG_1x1.subarray(0, 8), Buffer.alloc(1_048_576 - 7)]);   // หัว PNG + รวม 1 MB + 1 ไบต์

const ยิง = (page: Page, origin: string, method: "GET" | "POST" | "DELETE", body?: unknown, q = "") =>
  page.request.fetch(`${origin}/api/v1/brand-logo${q}`, { method, data: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });

async function เข้าตั้งค่าบริษัท(page: Page) {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  const กล่อง = page.locator("[data-panel='brand-logo']");
  await expect(กล่อง, "ตั้งค่า › บริษัท มีกล่องโลโก้ของระบบ").toBeVisible({ timeout: 30_000 });
  return กล่อง;
}
const โลโก้เมนู = (page: Page) => page.locator("aside.erp-sidebar .brand-mark");

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await ยิง(page, HQ_ORIGIN, "DELETE");
  await page.close();
});

test("[ui·hq] อัปโลโก้: SVG/ไฟล์ปลอมนามสกุลเตือนไม่เปลี่ยน · PNG จริง = เมนู HQ เปลี่ยน · ไม่แสดงชื่อไฟล์", async ({ page }) => {
  const กล่อง = await เข้าตั้งค่าบริษัท(page);
  await ยิง(page, HQ_ORIGIN, "DELETE");   // เริ่มจากโลโก้เดิม
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(กล่อง.locator("[data-brand-logo-preview]")).toHaveAttribute("data-brand-logo-preview", "default", { timeout: 30_000 });
  await expect(กล่อง.getByRole("button", { name: "กลับไปใช้โลโก้ Benjamin เดิม", exact: true }), "ยังไม่ตั้ง = ไม่มีปุ่มกลับโลโก้เดิม").toHaveCount(0);
  const ช่องไฟล์ = กล่อง.getByLabel("เลือกไฟล์โลโก้", { exact: true });

  for (const [ชื่อ, buffer, mimeType] of [["logo.svg", SVG, "image/svg+xml"], ["logo.png", ข้อความปลอม, "image/png"]] as const) {
    await ช่องไฟล์.setInputFiles({ name: ชื่อ, mimeType, buffer });
    await expect(กล่อง.locator("[data-brand-logo-error]"), `${ชื่อ} (ไม่ใช่รูปจริง) ถูกปฏิเสธ`).toHaveText("ไฟล์โลโก้ต้องเป็น PNG JPG หรือ WebP");
    await expect(กล่อง.locator("[data-brand-logo-preview]")).toHaveAttribute("data-brand-logo-preview", "default");
  }

  await ช่องไฟล์.setInputFiles({ name: ชื่อไฟล์ลับ, mimeType: "image/png", buffer: PNG_1x1 });
  await expect(กล่อง.locator("[data-brand-logo-preview]"), "อัป PNG จริงแล้วตัวอย่างเปลี่ยน").toHaveAttribute("data-brand-logo-preview", "custom", { timeout: 20_000 });
  await expect(กล่อง.locator("[data-brand-logo-error]")).toHaveCount(0);
  await expect(โลโก้เมนู(page), "เมนู HQ เปลี่ยนเป็นโลโก้ที่อัปทันที").toHaveAttribute("data-brand-logo", "custom", { timeout: 20_000 });
  await expect.poll(() => โลโก้เมนู(page).locator("img").evaluate(i => (i as HTMLImageElement).naturalWidth), { message: "รูปในเมนูโหลดขึ้นจริง" }).toBe(1);
  await expect(page.getByText(ชื่อไฟล์ลับ), "ไม่แสดงชื่อไฟล์ที่อัป").toHaveCount(0);
});

test("[ui·dealer] เมนูดีลเลอร์ใช้โลโก้ที่ HQ ตั้ง · ดีลเลอร์เปลี่ยน/ล้างเองไม่ได้ · หน้าเข้าระบบใช้โลโก้เดิม", async ({ page }) => {
  const คำขอโลโก้: string[] = [];
  page.on("request", r => { if (r.url().includes("/api/v1/brand-logo")) คำขอโลโก้.push(r.url()); });
  await page.goto(`${DEALER_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("img[src='/benjamin-logo.png']").first(), "หน้าเข้าระบบใช้โลโก้ Benjamin เดิม").toBeVisible({ timeout: 20_000 });
  expect(คำขอโลโก้, "หน้าเข้าระบบไม่ถามโลโก้ (ยังไม่ล็อกอิน)").toEqual([]);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(โลโก้เมนู(page), "เมนูดีลเลอร์ใช้โลโก้ที่ HQ ตั้ง").toHaveAttribute("data-brand-logo", "custom", { timeout: 30_000 });
  await expect.poll(() => โลโก้เมนู(page).locator("img").evaluate(i => (i as HTMLImageElement).naturalWidth)).toBe(1);

  const เปลี่ยน = await ยิง(page, DEALER_ORIGIN, "POST", { base64: PNG_1x1.toString("base64") });
  expect(เปลี่ยน.status(), "ดีลเลอร์เปลี่ยนโลโก้ไม่ได้").toBe(403);
  const ล้าง = await ยิง(page, DEALER_ORIGIN, "DELETE");
  expect(ล้าง.status(), "ดีลเลอร์ล้างโลโก้ไม่ได้").toBe(403);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-panel='brand-logo']"), "หน้าตั้งค่าดีลเลอร์ไม่มีกล่องเปลี่ยนโลโก้").toHaveCount(0);
});

test("[api] เซิร์ฟเวอร์ตรวจชนิดจากไบต์จริง: SVG · ข้อความตั้งชื่อ .png · เกิน 1 MB ถูกปฏิเสธ · ไม่ล็อกอิน = 401", async ({ page, playwright }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const ก่อน = await (await ยิง(page, HQ_ORIGIN, "GET", undefined, "?op=meta")).json();
  expect(typeof ก่อน === "string" && ก่อน.length === 64, "มีโลโก้จากข้อก่อนหน้า").toBe(true);
  for (const [ชื่อ, buf, ข้อความ] of [["SVG", SVG, "PNG JPG หรือ WebP"], ["ข้อความตั้งชื่อ .png", ข้อความปลอม, "PNG JPG หรือ WebP"], ["เกิน 1 MB", ใหญ่เกิน, "1 MB"]] as const) {
    const r = await ยิง(page, HQ_ORIGIN, "POST", { base64: buf.toString("base64") });
    expect(r.status(), `${ชื่อ} → 400`).toBe(400);
    expect(String((await r.json()).error), `${ชื่อ} บอกเหตุผล`).toContain(ข้อความ);
  }
  expect(await (await ยิง(page, HQ_ORIGIN, "GET", undefined, "?op=meta")).json(), "ไฟล์ที่ถูกปฏิเสธไม่ทับโลโก้เดิม").toBe(ก่อน);

  // ตัวรูป: ชนิดจากฐาน + nosniff
  const รูป = await ยิง(page, HQ_ORIGIN, "GET", undefined, `?v=${ก่อน}`);
  expect(รูป.status()).toBe(200);
  expect(รูป.headers()["content-type"]).toBe("image/png");
  expect(รูป.headers()["x-content-type-options"]).toBe("nosniff");
  expect(Buffer.compare(await รูป.body(), PNG_1x1), "ไบต์ตรงกับที่อัป").toBe(0);

  // ไม่ล็อกอิน (ไม่มีคุกกี้) = ไม่ได้ทั้ง sha และตัวรูป
  const นอก = await playwright.request.newContext();
  for (const origin of [HQ_ORIGIN, DEALER_ORIGIN]) {
    expect((await นอก.get(`${origin}/api/v1/brand-logo?op=meta`)).status(), `ไม่ล็อกอินขอ sha (${origin})`).toBe(401);
    expect((await นอก.get(`${origin}/api/v1/brand-logo?v=${ก่อน}`)).status(), `ไม่ล็อกอินขอรูป (${origin})`).toBe(401);
  }
  await นอก.dispose();
});

test("[ui·hq] กลับไปใช้โลโก้ Benjamin เดิม", async ({ page }) => {
  const กล่อง = await เข้าตั้งค่าบริษัท(page);
  await expect(กล่อง.locator("[data-brand-logo-preview]")).toHaveAttribute("data-brand-logo-preview", "custom", { timeout: 30_000 });
  await กล่อง.getByRole("button", { name: "กลับไปใช้โลโก้ Benjamin เดิม", exact: true }).click();
  await page.getByRole("button", { name: "กลับไปใช้โลโก้เดิม", exact: true }).click();
  await expect(กล่อง.locator("[data-brand-logo-preview]"), "ตัวอย่างกลับเป็นโลโก้เดิม").toHaveAttribute("data-brand-logo-preview", "default", { timeout: 20_000 });
  await expect(โลโก้เมนู(page), "เมนู HQ กลับเป็นโลโก้เดิม").toHaveAttribute("data-brand-logo", "default", { timeout: 20_000 });
  await expect(โลโก้เมนู(page).locator("img")).toHaveAttribute("src", "/benjamin-logo-white.png");
  expect(await (await ยิง(page, HQ_ORIGIN, "GET", undefined, "?op=meta")).json(), "ฐานไม่มีโลโก้แล้ว").toBeNull();
});
