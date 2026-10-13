// ── ดีลเลอร์เปลี่ยนรหัสผ่านตัวเองสำเร็จ → ต้องถูกพาไปเข้าสู่ระบบใหม่ ────────────────
//
// บั๊กที่กันไว้ (เจอจริง 1 ก.ย. 69 ด้วยเบราว์เซอร์จริง):
//   ระบบยืนยันตัวตนยกเลิกใบผ่านทันทีที่รหัสผ่านเปลี่ยน แต่หน้าจอยังอยู่หน้าเดิมเหมือนไม่มีอะไรเกิดขึ้น
//   กลายเป็น "ล็อกอินค้างแบบผี": เดินไปหน้าอื่นได้ เมนูยังอยู่ครบ แต่ทุกคำขอข้อมูลถูกปฏิเสธ 401
//   ตารางจึงว่างเปล่าโดยไม่มีคำอธิบาย และผู้ใช้ไม่รู้ว่าต้องเข้าสู่ระบบใหม่
//
// ⚠️ ห้ามยัดใบผ่านด้วย addInitScript — มันรันใหม่ทุกครั้งที่เปลี่ยนหน้า จะยัดใบผ่านกลับเข้าไปเอง
//    หลังระบบล้างทิ้ง แล้วเทสต์จะบอกว่า "ยังค้างอยู่" ทั้งที่ระบบทำถูกแล้ว
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const CODE = "ZTP";
const EMAIL = "zztest-pw-relogin@example.co.th";
const PASSWORD = "ZZtest-Pass-2569";
const รหัสใหม่ = "ZZtest-Pass-9999";
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function purge() {
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
  for (const t of ["dealer_login_secrets", "dealer_settings", "dealer_account_changes", "dealer_account_requests"]) {
    await admin.from(t).delete().eq("dealer_code", CODE).then(() => {}, () => {});
  }
  await admin.from("dealers").delete().eq("code", CODE);
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of users?.users ?? []) if (u.email === EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
}
test.beforeAll(purge);
test.afterAll(purge);

test("[auth·dealer] เปลี่ยนรหัสผ่านตัวเองสำเร็จ → ถูกพาไปเข้าสู่ระบบใหม่ ไม่ค้างแบบล็อกอินผี", async ({ page, request }) => {
  const token = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { code: CODE, name: "ZZTEST สาขาทดสอบเปลี่ยนรหัส", province: "ระยอง", region: "ตะวันออก",
            revenueTarget: 0, email: EMAIL, password: PASSWORD, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  test.skip(สร้าง.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(สร้าง.status(), `ต้องสร้างสาขาทดสอบได้ (${await สร้าง.text()})`).toBe(200);
  // เทสต์นี้ทดสอบการเปลี่ยนรหัสที่หน้าบัญชี ไม่ใช่หน้าตั้งรหัสครั้งแรก (มีเทสต์แยก) — ปลดไว้ก่อน
  await (await import("./firstLogin")).ข้ามตั้งรหัสครั้งแรก(EMAIL);

  // เข้าระบบเป็นสาขานั้นแล้ววางใบผ่านไว้ในเครื่อง (วางหลังเปิดหน้าแล้ว ไม่ใช้ addInitScript)
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  expect(error, `ต้องเข้าระบบด้วยบัญชีที่เพิ่งสร้างได้ (${error?.message ?? ""})`).toBeNull();
  const คีย์ = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.goto(`${DEALER_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [คีย์, JSON.stringify(signed.session)] as const);

  // เปลี่ยนรหัสผ่านผ่านหน้าจอจริง
  await page.goto(`${DEALER_ORIGIN}/settings/account`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("อย่างน้อย 8 ตัวอักษร").fill(รหัสใหม่);
  await page.getByPlaceholder("พิมพ์รหัสใหม่อีกครั้ง").fill(รหัสใหม่);
  await page.getByPlaceholder("ยืนยันตัวตนก่อนเปลี่ยน").last().fill(PASSWORD);
  await page.getByRole("button", { name: /บันทึกรหัสผ่านใหม่|ส่งคำขอ/ }).click();

  // ★ ของจริง: ต้องถูกพาไปหน้าเข้าสู่ระบบ และใบผ่านที่ตายแล้วต้องไม่ค้างในเครื่อง
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  const ใบผ่านค้าง = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("sb-") && k.endsWith("-auth-token")));
  expect(ใบผ่านค้าง, "ใบผ่านที่ถูกยกเลิกแล้วต้องไม่ค้างอยู่ในเครื่อง").toEqual([]);

  // เดินกลับเข้าหน้าใช้งานไม่ได้อีก (ไม่ใช่เห็นเมนูครบแต่ข้อมูลว่าง)
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/login/, { timeout: 30_000 });

  // และรหัสใหม่ใช้เข้าระบบได้จริง
  const { error: errNew } = await sb.auth.signInWithPassword({ email: EMAIL, password: รหัสใหม่ });
  expect(errNew, "รหัสผ่านใหม่ต้องใช้เข้าระบบได้จริง").toBeNull();
  await sb.auth.signOut({ scope: "local" }).catch(() => {});
});
