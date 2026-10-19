import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { settle } from "./helpers";

// ── ดีลเลอร์เข้าระบบแล้วเข้าหน้าหลักทันที — ไม่มีหน้าบังคับตั้งรหัส/ยืนยันอีเมล ไม่มีแถบเตือน (บอสตัดสิน 19 ต.ค. 69) ─────
//   ทับข้อตัดสินเดิม (15 ก.ย. / 14 ต.ค. 69) · บอสกดเข้าแทนดีลเลอร์บนเว็บจริงแล้วติดหน้ายืนยันอีเมล
//   1) บัญชีที่ยังมีเครื่องหมายค้าง (แบบ 155 บัญชีบนระบบจริงก่อนล้าง) พิมพ์รหัสสาขาเข้า → /dashboard ทันที
//   2) HQ สร้างดีลเลอร์ / ตั้งรหัสให้ → ไม่ตั้งเครื่องหมายบังคับอีก (ฐานยังมีด่าน 0187: มีเครื่องหมาย = ข้อมูลว่างทั้งสาขา)
//   3) เปลี่ยนรหัส/ใส่อีเมลติดต่อ = หน้าบัญชี ตามใจดีลเลอร์ (contact-email-verify.spec.ts ตรวจการยืนยันอีเมล)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const CODE = "ZTK";
const EMAIL = "ztk@dealer.benjaminpebsteel.com";   // อีเมลเข้าระบบของสาขาที่ระบบตั้งให้ (lib/dealerLogin.ts)
const PASSWORD = "ZZtest-Branch-2569";
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function purge() {
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
  for (const t of ["dealer_login_secrets", "dealer_settings", "dealer_account_changes", "dealer_account_requests"]) {
    await admin.from(t).delete().eq("dealer_code", CODE).then(() => {}, () => {});
  }
  await admin.from("dealers").delete().eq("code", CODE);
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of users?.users ?? []) if (u.email === EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await admin.from("dealer_prospects").delete().like("name", `%ผู้สนใจ-${CODE}`);
}
test.beforeAll(purge);
test.afterAll(purge);

let uid = "";
const เครื่องหมาย = async () => {
  const m = (await admin.auth.admin.getUserById(uid)).data.user?.app_metadata ?? {};
  return { เปลี่ยนรหัส: m.must_change_password === true, ยืนยันอีเมล: m.must_verify_email === true };
};
const hqHeaders = async () => ({ authorization: `Bearer ${(await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? ""}`, "content-type": "application/json" });

async function เข้าด้วยรหัสสาขา(page: Page, พิมพ์: string) {
  await page.goto(`${DEALER_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ช่อง = page.locator("#login-email"), ช่องรหัส = page.locator("#login-password");
  for (let i = 0; i < 6; i++) {
    await ช่อง.fill(พิมพ์); await ช่องรหัส.fill(PASSWORD);
    await page.waitForTimeout(300);
    if (await ช่อง.inputValue() === พิมพ์ && await ช่องรหัส.inputValue() === PASSWORD) break;
  }
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
}

test("[auth·hq] HQ สร้างดีลเลอร์ → บัญชีไม่มีเครื่องหมายบังคับตั้งรหัส/ยืนยันอีเมล", async ({ request }) => {
  const r = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: await hqHeaders(), timeout: 60_000,
    data: { code: CODE, name: "ZZTEST สาขาไม่บังคับ", province: "ระยอง", region: "ตะวันออก", revenueTarget: 0,
            email: EMAIL, password: PASSWORD, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  test.skip(r.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(r.status(), await r.text()).toBe(200);
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  uid = String(profs?.[0]?.id ?? "");
  expect(await เครื่องหมาย(), "สร้างใหม่ต้องไม่มีเครื่องหมาย").toEqual({ เปลี่ยนรหัส: false, ยืนยันอีเมล: false });

  // HQ ตั้งรหัสให้บัญชีที่ยังไม่เคยเข้าระบบ (เดิม = บังคับตั้งรหัสใหม่) → ต้องไม่ตั้งเครื่องหมายแล้ว
  const ตั้งให้ = await request.patch(`${HQ_ORIGIN}/api/admin/dealers?code=${CODE}`, { headers: await hqHeaders(), data: { password: PASSWORD } });
  expect(ตั้งให้.status(), await ตั้งให้.text()).toBe(200);
  expect(await เครื่องหมาย(), "HQ ตั้งรหัสให้ต้องไม่ตั้งเครื่องหมาย").toEqual({ เปลี่ยนรหัส: false, ยืนยันอีเมล: false });
});

test("[auth·dealer] บัญชีที่ยังมีเครื่องหมายค้าง พิมพ์รหัสสาขาเข้า → /dashboard ทันที ไม่เจอหน้าตั้งรหัส/ยืนยันอีเมล ไม่มีแถบเตือน", async ({ page }) => {
  test.skip(!uid, "ข้อก่อนหน้าไม่ผ่าน");
  // จำลองบัญชีบนระบบจริงก่อนรันสคริปต์ล้าง (ตั้งเครื่องหมายไว้ 155 บัญชี 19 ต.ค. 69)
  const { data: u } = await admin.auth.admin.getUserById(uid);
  expect((await admin.auth.admin.updateUserById(uid, { app_metadata: { ...(u.user?.app_metadata ?? {}), must_change_password: true, must_verify_email: true } })).error).toBeNull();
  expect(await เครื่องหมาย()).toEqual({ เปลี่ยนรหัส: true, ยืนยันอีเมล: true });

  await เข้าด้วยรหัสสาขา(page, "ztk");
  await expect(page, "เข้าแล้วต้องไปหน้าหลักทันที").toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "ลูกค้าเป้าหมาย" }).first(), "เห็นเมนูของระบบ").toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน|ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน/ }), "ต้องไม่มีหน้าบังคับ").toHaveCount(0);
  await expect(page.getByRole("alert", { name: "ยังไม่มีอีเมลติดต่อที่ยืนยันแล้ว" }), "ต้องไม่มีแถบเตือน").toHaveCount(0);
  // เปิดหน้าอื่นตรง ๆ ก็ไม่ถูกพาไปหน้าบังคับ
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/leads/);
  await expect(page.getByRole("heading", { name: /ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน|ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน/ })).toHaveCount(0);
});

test("[auth·dealer] หน้าบัญชีมีที่เปลี่ยนรหัสผ่านและใส่อีเมลติดต่อ (ตามใจดีลเลอร์)", async ({ page }) => {
  test.skip(!uid, "ข้อก่อนหน้าไม่ผ่าน");
  await admin.auth.admin.updateUserById(uid, { app_metadata: { must_change_password: false, must_verify_email: false } });
  await เข้าด้วยรหัสสาขา(page, " ZTK ");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await page.goto(`${DEALER_ORIGIN}/settings/account`, { waitUntil: "domcontentloaded" });
  const อีเมล = page.getByRole("region", { name: "อีเมลติดต่อ" });
  await expect(อีเมล).toBeVisible({ timeout: 30_000 });
  await expect(อีเมล.getByText("ใส่อีเมลแล้วจะได้รับแจ้งเตือนจากสำนักงานใหญ่")).toBeVisible();
  await expect(อีเมล.locator("#ce-email")).toBeVisible();
  await expect(page.getByText("บัญชีเข้าสู่ระบบ")).toBeVisible();
});
