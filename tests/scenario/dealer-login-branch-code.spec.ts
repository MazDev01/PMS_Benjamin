import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN } from "./funcHelpers";
import { settle } from "./helpers";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";

// ── หน้าเข้าระบบดีลเลอร์: พิมพ์รหัสสาขา ระบบเติมโดเมนให้ (บอสสั่ง 19 ต.ค. 69) ─────────────────────────────
//   บัญชีดีลเลอร์ = <รหัสสาขา>@dealer.benjaminpebsteel.com (lib/dealerLogin.ts) — ดีลเลอร์ไม่ต้องรู้อีเมลนี้
//   ไม่สนตัวพิมพ์เล็กใหญ่ · ตัดช่องว่างหัวท้าย · พิมพ์อีเมลเต็มก็ยังได้ · รหัสผ่านผิดต้องเข้าไม่ได้
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const admin = adminClient();
const CODE = "ZTL";   // รหัสสาขาทดสอบเฉพาะไฟล์นี้ (ZZT ไฟล์อื่นใช้อยู่)
const อีเมล = "ztl@dealer.benjaminpebsteel.com";
const รหัส = "Branch-Code-7731";

async function purge() {
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter(x => x.email === อีเมล)) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await ลบสาขาทดสอบตรง(CODE);
  await admin.from("dealers").delete().eq("code", CODE);
}
test.beforeAll(async () => {
  await purge();
  expect((await admin.from("dealers").insert({ code: CODE, name: `ZZTEST ${CODE}`, province: "ตราด", region: "ตะวันออก", revenue_target: 0, status: "active" })).error).toBeNull();
  const { data, error } = await admin.auth.admin.createUser({ email: อีเมล, password: รหัส, email_confirm: true });
  expect(error).toBeNull();
  expect((await admin.from("profiles").upsert({ id: data.user!.id, role: "DEALER_ADMIN", dealer_code: CODE, name: `ZZTEST ${CODE}`, status: "active", contact_email_verified_at: new Date().toISOString() }, { onConflict: "id" })).error).toBeNull();
});
test.afterAll(purge);

/** กรอกหน้าเข้าระบบดีลเลอร์แล้วกดเข้า · คืน true = ออกจากหน้าเข้าระบบได้ */
async function เข้าระบบ(page: Page, พิมพ์: string, password: string): Promise<boolean> {
  await page.goto(`${DEALER_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ช่อง = page.getByLabel("รหัสสาขา", { exact: true }), ช่องรหัส = page.getByLabel(/รหัสผ่าน/).first();
  const ควรได้ = พิมพ์.replace(/\s/g, "");   // ช่องตัดช่องว่างตั้งแต่ตอนพิมพ์
  for (let i = 0; i < 6; i++) {
    await ช่อง.fill(พิมพ์); await ช่องรหัส.fill(password);
    await page.waitForTimeout(300);
    if (await ช่อง.inputValue() === ควรได้ && await ช่องรหัส.inputValue() === password) break;
  }
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  return page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 20_000 }).then(() => true, () => false);
}

for (const พิมพ์ of ["ztl", " ZTL ", "ztl@dealer.benjaminpebsteel.com"]) {
  test(`[func·dealer] ช่อง "รหัสสาขา" พิมพ์ "${พิมพ์}" + รหัสผ่านถูก → เข้าระบบได้`, async ({ browser }) => {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    expect(await เข้าระบบ(page, พิมพ์, รหัส), `พิมพ์ "${พิมพ์}" ต้องเข้าได้`).toBe(true);
    await ctx.close();
  });
}

test(`[func·dealer] รหัสสาขาถูกแต่รหัสผ่านผิด → เข้าระบบไม่ได้ ขึ้นข้อความผิดพลาด`, async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  expect(await เข้าระบบ(page, "ztl", "Wrong-Pass-0000"), "รหัสผ่านผิดต้องเข้าไม่ได้").toBe(false);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("alert").first()).toBeVisible();
  await ctx.close();
});
