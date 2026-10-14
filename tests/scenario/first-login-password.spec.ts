// ── เข้าระบบครั้งแรกต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน · ไม่นับสิทธิ์แก้เอง 2 ครั้ง (บอสสั่ง 15 ก.ย. 69) ──
//
// สิ่งที่ต้องพิสูจน์:
//   1) บัญชีที่สร้างจาก "ตั้งเป็นดีลเลอร์" ถูกทำเครื่องหมายไว้ · เข้าครั้งแรกเจอหน้าตั้งรหัส ไม่เห็นเมนูระบบ
//   2) กติกาเดียวกับทุกทาง: รหัสซ้ำรหัสเดิม/มีช่องว่าง ถูกปฏิเสธที่เซิร์ฟเวอร์
//   3) ตั้งแล้ว: พาไปเข้าสู่ระบบใหม่ · รหัสใหม่ใช้ได้ รหัสเดิมใช้ไม่ได้ · สิทธิ์แก้เองยังเหลือ 2 ครั้ง
//      · ประวัติบันทึกแบบไม่นับสิทธิ์ · สำเนาที่ HQ ดูได้เป็นรหัสใหม่ · ตั้งซ้ำไม่ได้
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { เข้าระบบผ่านหน้าจอ, มีกล่องจดหมายทดสอบ, โค้ดยืนยันในกล่อง } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const CODE = "ZTK";
const EMAIL = "zztest-first-login@example.co.th";
const PASSWORD = "ZZtest-First-2569";
const รหัสของดีลเลอร์ = "ZZtest-Own-2569";
const อีเมลติดต่อ = "zztest-ztk-contact@example.test";
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
  await admin.from("email_outbox").delete().eq("to_email", อีเมลติดต่อ);
}
test.beforeAll(purge);
test.afterAll(purge);

test("[auth·dealer] เข้าระบบครั้งแรกต้องตั้งรหัสใหม่ก่อนใช้งาน · ไม่นับสิทธิ์แก้เอง", async ({ page, request }) => {
  const hq = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${hq}`, "content-type": "application/json" },
    data: { code: CODE, name: "ZZTEST สาขาเข้าครั้งแรก", province: "ระยอง", region: "ตะวันออก", revenueTarget: 0,
            email: EMAIL, password: PASSWORD, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  test.skip(สร้าง.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(สร้าง.status(), await สร้าง.text()).toBe(200);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  expect(error, "รหัสจากสำนักงานใหญ่ต้องใช้เข้าครั้งแรกได้").toBeNull();
  const token = signed.session?.access_token ?? "";
  const สถานะ = async (tok: string) => (await request.get(`${HQ_ORIGIN}/api/account`, { headers: { authorization: `Bearer ${tok}` } }))
    .json() as Promise<{ mustChangePassword?: boolean; selfChangesUsed: number }>;
  expect((await สถานะ(token)).mustChangePassword, "บัญชีใหม่ต้องถูกทำเครื่องหมายให้ตั้งรหัสครั้งแรก").toBe(true);

  // ── 1) เข้าหน้าใดก็ตามต้องเจอหน้าตั้งรหัส ไม่เห็นเมนูระบบ ──
  //    เข้าผ่านหน้าเข้าสู่ระบบจริง (ตัวช่วยกลาง) — โหมด api ใบผ่านอยู่ในคุกกี้ ยัดลงเครื่องเองไม่มีผล (14 ต.ค. 69)
  await เข้าระบบผ่านหน้าจอ(page, DEALER_ORIGIN, EMAIL, PASSWORD);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }), "ยังไม่ตั้งรหัส ต้องใช้หน้าระบบไม่ได้").toHaveCount(0);

  // ── 2) กติกาเดียวกับทุกทาง ──
  await page.locator("#fp-new").fill(PASSWORD);
  await page.locator("#fp-confirm").fill(PASSWORD);
  await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่", exact: true }).click();
  // หาจากข้อความ ไม่ใช่ role="alert" — Next.js มีกล่องประกาศเส้นทาง (route announcer) role เดียวกันอยู่ทุกหน้า
  await expect(page.getByText("ต้องไม่ซ้ำกับรหัสที่ได้รับจากสำนักงานใหญ่"), "รหัสซ้ำรหัสเดิมต้องถูกปฏิเสธ").toBeVisible({ timeout: 15_000 });
  const เว้นวรรค = await request.post(`${HQ_ORIGIN}/api/account`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { op: "first-password", password: "มี ช่องว่าง 12345" },
  });
  expect(เว้นวรรค.status(), "ยิงตรงด้วยรหัสมีช่องว่างต้องถูกปฏิเสธ").toBe(400);

  // ── 3) ตั้งรหัสของตัวเอง → พาไปเข้าสู่ระบบใหม่ ──
  await page.locator("#fp-new").fill(รหัสของดีลเลอร์);
  await page.locator("#fp-confirm").fill(รหัสของดีลเลอร์);
  await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่", exact: true }).click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  const คุกกี้ค้าง = (await page.context().cookies()).filter(c => /^pms_(at|rt)/.test(c.name) && c.value).map(c => c.name);
  expect(คุกกี้ค้าง, "ตั้งรหัสแล้วคุกกี้ใบผ่านของรหัสชั่วคราวต้องถูกลบ (โหมด api)").toEqual([]);

  const ใหม่ = await sb.auth.signInWithPassword({ email: EMAIL, password: รหัสของดีลเลอร์ });
  expect(ใหม่.error, "รหัสที่ดีลเลอร์ตั้งเองต้องใช้เข้าระบบได้").toBeNull();
  const เดิม = await createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } }).auth
    .signInWithPassword({ email: EMAIL, password: PASSWORD });
  expect(เดิม.error, "รหัสจากสำนักงานใหญ่ต้องใช้ไม่ได้แล้ว").not.toBeNull();

  const หลังตั้ง = await สถานะ(ใหม่.data.session?.access_token ?? "");
  expect(หลังตั้ง.mustChangePassword, "ตั้งแล้วต้องไม่ถูกบังคับอีก").toBe(false);
  expect(หลังตั้ง.selfChangesUsed, "ครั้งแรกต้องไม่นับสิทธิ์แก้เอง").toBe(0);
  const { count } = await admin.from("dealer_account_changes").select("id", { count: "exact", head: true })
    .eq("dealer_code", CODE).eq("by_self", false);
  expect(count, "ต้องมีประวัติแบบไม่นับสิทธิ์").toBe(1);

  const ดู = await request.get(`${HQ_ORIGIN}/api/admin/dealers/secret?code=${CODE}`, { headers: { authorization: `Bearer ${hq}` } });
  if (ดู.status() !== 501) {
    expect(ดู.status(), await ดู.text()).toBe(200);
    expect((await ดู.json() as { password: string }).password, "สำเนาที่ HQ ดูได้ต้องเป็นรหัสที่ดีลเลอร์ตั้งเอง").toBe(รหัสของดีลเลอร์);
  }

  const ซ้ำ = await request.post(`${HQ_ORIGIN}/api/account`, {
    headers: { authorization: `Bearer ${ใหม่.data.session?.access_token ?? ""}`, "content-type": "application/json" },
    data: { op: "first-password", password: "ZZtest-Again-2569" },
  });
  expect(ซ้ำ.status(), "ตั้งรหัสครั้งแรกซ้ำไม่ได้ (ต้องไปใช้หน้าบัญชีแทน)").toBe(409);

  // ── 4) เข้าใหม่ด้วยรหัสของตัวเอง → ขั้นยืนยันอีเมลติดต่อ (ด่าน 1) → ยืนยันแล้วจึงใช้งานได้ ──
  if (!(await มีกล่องจดหมายทดสอบ())) return;   // เครื่องที่ไม่มีกล่องจดหมายทดสอบ: ข้อ 1–3 ยังวัดครบ
  await เข้าระบบผ่านหน้าจอ(page, DEALER_ORIGIN, EMAIL, รหัสของดีลเลอร์);
  const ด่านอีเมล = page.getByRole("heading", { name: "ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน" });
  await expect(ด่านอีเมล, "ตั้งรหัสแล้ว ต้องเจอขั้นยืนยันอีเมลติดต่อต่อ").toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }), "ยังไม่ยืนยันอีเมล ต้องใช้หน้าระบบไม่ได้").toHaveCount(0);
  await page.locator("#ce-email").fill(อีเมลติดต่อ);
  const กดส่งเมื่อ = Date.now();
  await page.getByRole("button", { name: /^ส่งโค้ด/ }).click();
  await expect(page.getByText(`ส่งโค้ด 6 หลักไปที่ ${อีเมลติดต่อ} แล้ว`)).toBeVisible({ timeout: 30_000 });
  await page.locator("#ce-code").fill(await โค้ดยืนยันในกล่อง(อีเมลติดต่อ, กดส่งเมื่อ));
  await page.getByRole("button", { name: "ยืนยันอีเมล" }).click();
  await expect(ด่านอีเมล, "ยืนยันแล้วต้องผ่านด่าน").toHaveCount(0, { timeout: 30_000 });
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first(), "ผ่านทั้งสองขั้นแล้วต้องใช้หน้าระบบได้").toBeVisible({ timeout: 30_000 });
});

test("[auth·dealer] ดีลเลอร์เดิมที่ยังไม่เคยเข้าระบบ: HQ ตั้งรหัสให้ครั้งแรก → ต้องตั้งรหัสใหม่ · เคยเข้าแล้วไม่บังคับซ้ำ", async ({ request }) => {
  await purge();
  const hq = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const hdr = { authorization: `Bearer ${hq}`, "content-type": "application/json" };
  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: hdr,
    data: { code: CODE, name: "ZZTEST สาขาเดิมยังไม่เคยเข้า", province: "ระยอง", region: "ตะวันออก", revenueTarget: 0,
            email: EMAIL, password: PASSWORD, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  test.skip(สร้าง.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(สร้าง.status(), await สร้าง.text()).toBe(200);
  // จำลองบัญชีจากสคริปต์เปิดบัญชีดีลเลอร์เดิม: ไม่มีเครื่องหมาย และยังไม่เคยเข้าระบบ
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  const uid = String(profs?.[0]?.id ?? "");
  await admin.auth.admin.updateUserById(uid, { app_metadata: { must_change_password: false } });
  const เครื่องหมาย = async () => (await admin.auth.admin.getUserById(uid)).data.user?.app_metadata?.must_change_password;

  const ตั้งให้ = await request.patch(`${HQ_ORIGIN}/api/admin/dealers?code=${CODE}`, { headers: hdr, data: { password: "ZZtest-Legacy-2569" } });
  expect(ตั้งให้.status(), await ตั้งให้.text()).toBe(200);
  expect(await เครื่องหมาย(), "ยังไม่เคยเข้าระบบ + HQ ตั้งรหัสให้ = ได้บัญชีครั้งแรก ต้องบังคับตั้งรหัสใหม่").toBe(true);

  // เข้าระบบแล้ว (ปลดเครื่องหมายแทนการตั้งรหัสผ่านหน้าจอ) → HQ รีเซ็ตรหัสอีกครั้ง ต้องไม่บังคับซ้ำ
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await sb.auth.signInWithPassword({ email: EMAIL, password: "ZZtest-Legacy-2569" })).error).toBeNull();
  await admin.auth.admin.updateUserById(uid, { app_metadata: { must_change_password: false } });
  const รีเซ็ต = await request.patch(`${HQ_ORIGIN}/api/admin/dealers?code=${CODE}`, { headers: hdr, data: { password: "ZZtest-Legacy2-2569" } });
  expect(รีเซ็ต.status(), await รีเซ็ต.text()).toBe(200);
  expect(await เครื่องหมาย(), "เคยเข้าระบบแล้ว ต้องไม่บังคับตั้งรหัสซ้ำ").toBe(false);
});
