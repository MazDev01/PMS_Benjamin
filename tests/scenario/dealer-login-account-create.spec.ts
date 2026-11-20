import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ตั้งบัญชีเข้าระบบให้ดีลเลอร์ที่ยังไม่มีบัญชี (บอสสั่ง 20 พ.ย. 69 · เคส HQD) ──────────────────────
//   แผงดีลเลอร์ › ข้อมูลเข้าระบบ: สาขาไม่มีบัญชี = ปุ่ม "ตั้งบัญชีเข้าระบบ" (แทน "แก้อีเมล/รหัสผ่าน")
//   อีเมลเติมให้ = รหัสสาขา@dealer.benjaminpebsteel.com · แก้ได้แต่ต้องตรงรูปแบบนี้ · รหัสผ่านตามกฎกลาง
//   บทบาท/ค่าบัญชีเหมือนสร้างผ่านผู้สนใจเป็นดีลเลอร์ (DEALER_ADMIN · ผูก dealer_code) · สาขาที่มีบัญชีแล้ว = ปฏิเสธ (409)
//   ตกบนโค้ดเดิม (be88df7b): ไม่มีปุ่ม · PUT /api/admin/dealers ไม่มี (405)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
const ตัวอักษร = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const รหัส = "ZT" + Array.from({ length: 3 }, () => ตัวอักษร[Math.floor(Math.random() * 26)]).join("");
const อีเมล = `${รหัส.toLowerCase()}@dealer.benjaminpebsteel.com`;
const รหัสผ่าน = `ZZtest-${รหัส}-2569`;
let มีบัญชี: สาขาของข้อ | null = null;

test.beforeAll(async () => {
  const ใส่ = await adminClient().from("dealers").insert({ code: รหัส, name: `ZZTEST ไม่มีบัญชี ${รหัส}`, province: "ตราด", region: "ตะวันออก", revenue_target: 0, status: "active" });
  expect(ใส่.error, "สร้างสาขาที่ยังไม่มีบัญชี").toBeNull();
  มีบัญชี = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
});
test.afterAll(async () => {
  expect(await ลบสาขาทดสอบตรง(รหัส), `ลบสาขาทดสอบ ${รหัส} ครบ`).toEqual([]);
  await มีบัญชี?.ลบ();
});

async function ยิง(request: import("@playwright/test").APIRequestContext, code: string, data: Record<string, unknown>) {
  const token = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  return request.put(`${HQ_ORIGIN}/api/admin/dealers?code=${code}`, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, data });
}

test("[admin] ปฏิเสธที่เซิร์ฟเวอร์: อีเมลไม่ตรงรูปแบบสาขา · รหัสผ่านสั้น · สาขาที่มีบัญชีแล้ว", async ({ request }) => {
  const ผิดอีเมล = await ยิง(request, รหัส, { email: "zztest-other@example.test", password: รหัสผ่าน });
  test.skip(ผิดอีเมล.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(ผิดอีเมล.status(), "อีเมลไม่ใช่ รหัสสาขา@dealer... = 400").toBe(400);
  expect((await ยิง(request, รหัส, { email: อีเมล, password: "1234" })).status(), "รหัสผ่านสั้น = 400").toBe(400);
  expect((await ยิง(request, มีบัญชี!.รหัส, { email: มีบัญชี!.บัญชี.email, password: รหัสผ่าน })).status(), "สาขามีบัญชีแล้ว = 409 (ไม่ลงทับ)").toBe(409);
  const { data } = await adminClient().from("profiles").select("id").eq("dealer_code", รหัส);
  expect(data ?? [], "ยังไม่มีบัญชีเกิดขึ้นจากคำขอที่ถูกปฏิเสธ").toHaveLength(0);
});

test("[H·hq] แผงดีลเลอร์ไม่มีบัญชี → ตั้งบัญชีเข้าระบบ → ล็อกอินได้จริง · บทบาท DEALER_ADMIN ของสาขา", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?open=${รหัส}`, { waitUntil: "domcontentloaded" }); await settle(page);
  const แผง = page.locator(`[data-dealer-panel="${รหัส}"]`);
  await expect(แผง.getByTestId("dealer-login-hint"), "บอกว่ายังไม่มีบัญชี").toContainText("ยังไม่มีบัญชีเข้าระบบ", { timeout: 20_000 });
  await expect(แผง.getByRole("button", { name: "แก้อีเมล/รหัสผ่าน", exact: true }), "ไม่มีบัญชี = ไม่มีปุ่มแก้").toHaveCount(0);
  await แผง.getByRole("button", { name: "ตั้งบัญชีเข้าระบบ", exact: true }).click();
  const ช่องอีเมล = page.getByLabel("อีเมลเข้าระบบของบัญชีใหม่", { exact: true });
  await expect(ช่องอีเมล, "เติมอีเมลตามรูปแบบสาขาให้").toHaveValue(อีเมล);
  // แก้อีเมลเป็นอย่างอื่น = หน้าจอเตือน ไม่ส่ง
  await ช่องอีเมล.fill("zztest-other@example.test");
  await page.getByLabel("รหัสผ่านของบัญชีใหม่", { exact: true }).fill(รหัสผ่าน);
  await page.getByRole("button", { name: "ตั้งบัญชี", exact: true }).click();
  await expect(page.getByRole("alert"), "อีเมลผิดรูปแบบสาขา").toContainText(อีเมล);
  await ช่องอีเมล.fill(อีเมล);
  await page.getByRole("button", { name: "ตั้งบัญชี", exact: true }).click();
  await expect(page.getByText("ตั้งบัญชีแล้ว — แจ้งอีเมลและรหัสผ่านนี้ให้ดีลเลอร์ทราบ", { exact: true }), "โชว์บัญชีใหม่ให้คัดลอก").toBeVisible({ timeout: 20_000 });

  const { data: prof } = await adminClient().from("profiles").select("role, status, name").eq("dealer_code", รหัส).maybeSingle();
  expect(prof, "บัญชีผูกกับสาขา · DEALER_ADMIN · active").toMatchObject({ role: "DEALER_ADMIN", status: "active", name: `ZZTEST ไม่มีบัญชี ${รหัส}` });
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: อีเมล, password: รหัสผ่าน });
  expect(error, `ล็อกอินด้วยบัญชีที่ตั้งได้จริง (${error?.message ?? ""})`).toBeNull();
  await sb.auth.signOut({ scope: "local" });
  assertNoErrors(errs, "ตั้งบัญชีเข้าระบบดีลเลอร์");
});
