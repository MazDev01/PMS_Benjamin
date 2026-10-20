import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";

// ── บัญชีที่ยังมีเครื่องหมาย "ต้องเปลี่ยนรหัส/ยืนยันอีเมล" ค้าง ใช้งานได้ปกติ (ใบ 0216 · บอสตัดสิน 19 ต.ค. 69) ──────
//
// เดิม (ใบ 0187 · 13 ต.ค. 69): เครื่องหมายค้างในใบผ่าน → ฐานปฏิเสธทั้งอ่านและเขียนทุกตาราง จนกว่าจะตั้งรหัสเอง
// บอสตัดสิน: ไม่มีขั้นบังคับใน flow แล้ว — ถ้ายังมีด่านนี้ บัญชีที่เครื่องหมายค้างแม้บัญชีเดียวจะเห็นข้อมูลว่างโดยไม่มีอะไรบอก
//   ใบ 0216 เอาด่านออก · ทางลัด "ตั้งรหัสครั้งแรก" (ไม่ต้องใส่รหัสเดิม) ปิดเป็น 410
// ชุดนี้ยิงด้วยใบผ่านจริงของบัญชีที่มีเครื่องหมายค้าง ทั้งยิงตรงฐานและผ่าน /api/v1:
//   เห็น/เขียนข้อมูลสาขาตัวเองได้ · ยังไม่เห็นข้อมูลสาขาอื่น (สิทธิ์รายแถวปกติไม่หลวมตาม)
// ข้อทดสอบระดับฐาน: supabase/tests/no_temp_password_gate.sql
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
// เรียงลำดับเป็นค่าปกติ · PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนหน้าตก (ใช้ตอนพิสูจน์ว่าตกได้จริง)
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });
test.setTimeout(180_000);

const CODE = "ZTP";
const EMAIL = "zztest-temp-pass@example.test";
const รหัสชั่วคราว = "ZZtest-Temp-2569";
const รหัสของดีลเลอร์ = "ZZtest-Mine-2569";
const บริษัท = "ZZTEST-TEMPPASS-ลูกค้าเป้าหมายของสาขา";
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ไคลเอนต์ = () => createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
let ใบผ่าน: Session;

const ตรง = (req: APIRequestContext, path: string, token: string, init: { method?: string; data?: unknown } = {}) =>
  req.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? "GET", data: init.data,
    headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}`, "content-type": "application/json", prefer: "return=representation" },
  });
const ผ่านแอป = (req: APIRequestContext, path: string, token: string, init: { method?: string; data?: unknown } = {}) =>
  req.fetch(`${DEALER_ORIGIN}/api/v1/${path}`, {
    method: init.method ?? "GET", data: init.data,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
const แถวลูกค้าเป้าหมาย = (n: number, ชื่อ: string) => ({
  id: `ZZTEST-TEMPPASS-${n}`, num_id: n, dealer_code: CODE, name: ชื่อ, company: ชื่อ,
  contact: "ผู้ทดสอบ", phone: "081-555-0142", province: "ระยอง", status: "WAITING",
});
const นับในฐาน = async (ชื่อ: string) =>
  (await admin.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", CODE).eq("company", ชื่อ)).count ?? 0;

async function purge() {
  await admin.from("leads").delete().eq("dealer_code", CODE);
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
  for (const t of ["dealer_login_secrets", "dealer_settings", "dealer_account_changes", "dealer_account_requests", "entity_counters", "dealer_territories"]) {
    await admin.from(t).delete().eq("dealer_code", CODE).then(() => {}, () => {});
  }
  await admin.from("dealers").delete().eq("code", CODE);
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of users?.users ?? []) if (u.email === EMAIL) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await admin.from("dealer_prospects").delete().like("name", `%ผู้สนใจ-${CODE}`);
}

test.beforeAll(async ({ request }) => {
  await purge();
  const hq = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${hq}`, "content-type": "application/json" },
    data: { code: CODE, name: "ZZTEST สาขารหัสชั่วคราว", province: "ระยอง", region: "ตะวันออก", revenueTarget: 0,
            email: EMAIL, password: รหัสชั่วคราว, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
    timeout: 60_000,   // เส้นทางสร้างดีลเลอร์ถูกคอมไพล์ตอนเรียกครั้งแรกบนเซิร์ฟเวอร์พัฒนา — เกิน 8 วินาทีได้ ไม่เกี่ยวกับสิ่งที่ชุดนี้ตรวจ
  });
  test.skip(สร้าง.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(สร้าง.status(), await สร้าง.text()).toBe(200);
  // พื้นที่ระยองให้สาขานี้ด้วย (จังหวัดเดียวหลายสาขาได้ · ใบ 0214) — ข้อเขียนลูกค้าเป้าหมายต้องไม่ติดกฎพื้นที่
  await admin.from("dealer_territories").insert({ province: "ระยอง", dealer_code: CODE });
  // ของให้อ่าน: ลูกค้าเป้าหมายของสาขานี้ 1 ราย (ใส่ด้วยสิทธิ์ผู้ดูแล) — ไม่งั้น "อ่านไม่ได้" กับ "ไม่มีอะไรให้อ่าน" แยกไม่ออก
  const { error } = await admin.from("leads").insert(แถวลูกค้าเป้าหมาย(880_100_001, บริษัท));
  expect(error, `เตรียมลูกค้าเป้าหมายตั้งต้น (${error?.message ?? ""})`).toBeNull();

  // บอสตัดสิน 19 ต.ค. 69: สร้างดีลเลอร์แล้วไม่ตั้งเครื่องหมายบังคับตั้งรหัสอีก (เข้าแล้วเข้าหน้าหลักทันที)
  const { data: สร้างแล้ว } = await ไคลเอนต์().auth.signInWithPassword({ email: EMAIL, password: รหัสชั่วคราว });
  expect(สร้างแล้ว.session?.user.app_metadata?.must_change_password, "เส้นทางสร้างดีลเลอร์ต้องไม่ตั้งเครื่องหมายแล้ว").not.toBe(true);
  expect(สร้างแล้ว.session?.user.app_metadata?.must_verify_email, "เส้นทางสร้างดีลเลอร์ต้องไม่ตั้งเครื่องหมายยืนยันอีเมลแล้ว").not.toBe(true);
  // จำลองบัญชีที่ยังมีเครื่องหมายค้าง (เช่น 155 บัญชีบนระบบจริงก่อนล้าง 19 ต.ค. 69)
  const uid = สร้างแล้ว.session!.user.id;
  const { error: e1 } = await admin.auth.admin.updateUserById(uid, { app_metadata: { ...(สร้างแล้ว.session!.user.app_metadata ?? {}), must_change_password: true, must_verify_email: true } });
  expect(e1).toBeNull();
  const { data, error: e2 } = await ไคลเอนต์().auth.signInWithPassword({ email: EMAIL, password: รหัสชั่วคราว });
  expect(e2, "รหัสชั่วคราวต้องเข้าระบบได้").toBeNull();
  ใบผ่าน = data.session!;
  expect(ใบผ่าน.user.app_metadata?.must_change_password, "จำลองบัญชีที่มีเครื่องหมายค้าง").toBe(true);
});
test.afterAll(purge);

test("[0216] เครื่องหมายค้าง · ยิงตรงฐาน: อ่านข้อมูลของสาขาตัวเองได้ · ไม่เห็นสาขาอื่น", async ({ request }) => {
  const leads = await (await ตรง(request, `leads?select=id,company&dealer_code=eq.${CODE}`, ใบผ่าน.access_token)).json() as { company: string }[];
  expect(Array.isArray(leads) ? leads.map(l => l.company) : [], "ต้องเห็นลูกค้าเป้าหมายของสาขาตัวเอง").toContain(บริษัท);
  const อื่น = await (await ตรง(request, "leads?select=id&dealer_code=eq.RYG&limit=5", ใบผ่าน.access_token)).json();
  expect(Array.isArray(อื่น) ? อื่น.length : -1, "ต้องไม่เห็นลูกค้าเป้าหมายของสาขาอื่น").toBe(0);
  const สาขา = await (await ตรง(request, `dealers_directory?select=code&code=eq.${CODE}`, ใบผ่าน.access_token)).json();
  expect(Array.isArray(สาขา) ? สาขา.length : -1, "เห็นแถวสาขาตัวเองในทะเบียน").toBe(1);
});

test("[0216] เครื่องหมายค้าง · ผ่าน /api/v1: อ่านได้ · เขียนลูกค้าเป้าหมายใหม่ได้", async ({ request }) => {
  const อ่าน = await (await ผ่านแอป(request, `leads?dealer=${CODE}`, ใบผ่าน.access_token)).text();
  expect(อ่าน.includes(บริษัท), "/api/v1/leads ต้องส่งลูกค้าเป้าหมายของสาขากลับมา").toBe(true);
  const ชื่อ = "ZZTEST-TEMPPASS-เขียนผ่านแอป";
  const เขียน = await ผ่านแอป(request, "leads", ใบผ่าน.access_token, {
    method: "POST",
    data: { id: "ZZTEST-TEMPPASS-3", numId: 880_100_003, dealerCode: CODE, name: ชื่อ, company: ชื่อ, contact: "ผู้ทดสอบ",
            phone: "081-555-0143", province: "ระยอง", status: "WAITING", value: "", product: "", assigned: "" },
  });
  expect(เขียน.status(), `เพิ่มผ่าน /api/v1 ต้องสำเร็จ (ได้ ${เขียน.status()} ${await เขียน.text()})`).toBeLessThan(400);
  expect(await นับในฐาน(ชื่อ), "แถวต้องลงฐาน").toBe(1);
});

test("[0216] ทางลัด \"ตั้งรหัสครั้งแรก\" (ไม่ต้องใส่รหัสเดิม) ปิดแล้ว — 410 · รหัสเดิมยังเข้าได้", async ({ request }) => {
  const ตั้ง = await request.post(`${HQ_ORIGIN}/api/account`, {
    headers: { authorization: `Bearer ${ใบผ่าน.access_token}`, "content-type": "application/json" },
    data: { op: "first-password", password: รหัสของดีลเลอร์ },
  });
  expect(ตั้ง.status(), await ตั้ง.text()).toBe(410);
  const { error } = await ไคลเอนต์().auth.signInWithPassword({ email: EMAIL, password: รหัสชั่วคราว });
  expect(error, "รหัสเดิมยังใช้ได้").toBeNull();
});

test("[0216] สำนักงานใหญ่เข้าระบบแทนบัญชีที่มีเครื่องหมายค้าง: ได้ใบผ่านที่เห็นข้อมูลของสาขานั้น", async ({ request }) => {
  const hq = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=${CODE}`, { headers: { authorization: `Bearer ${hq}` } });
  test.skip(res.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(res.status(), await res.text()).toBe(200);
  const th = new URLSearchParams(new URL(String((await res.json() as { link: string }).link)).hash.replace(/^#/, "")).get("th") ?? "";
  const { data, error } = await ไคลเอนต์().auth.verifyOtp({ token_hash: th, type: "magiclink" });
  expect(error, `ลิงก์เข้าระบบแทนต้องแลกใบผ่านได้ (${error?.message ?? ""})`).toBeNull();
  const leads = await (await ตรง(request, `leads?select=company&dealer_code=eq.${CODE}`, data.session!.access_token)).json() as { company: string }[];
  expect(Array.isArray(leads) ? leads.map(l => l.company) : [], "เข้าระบบแทนแล้วต้องเห็นข้อมูลของสาขา").toContain(บริษัท);
});

test("[หน้าจอ] สำนักงานใหญ่เข้าระบบแทนบัญชีที่ยังมีเครื่องหมายค้าง → เข้าหน้าหลักทันที ไม่เจอหน้าตั้งรหัส/ยืนยันอีเมล", async ({ request, page }) => {
  // บอสตัดสิน 19 ต.ค. 69 (บอสกดเข้าแทนบนเว็บจริงแล้วติดหน้ายืนยันอีเมล): ไม่มีหน้าบังคับแล้ว
  const hq = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=${CODE}`, { headers: { authorization: `Bearer ${hq}` } });
  test.skip(res.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(res.status(), await res.text()).toBe(200);
  await page.goto(String((await res.json() as { link: string }).link), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "ลูกค้าเป้าหมาย" }).first(), "เข้าแทนแล้วต้องเห็นเมนูของระบบทันที").toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน|ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน/ }), "ต้องไม่มีหน้าบังคับ").toHaveCount(0);
});

test("[0216][หน้าจอ] บัญชีที่มีเครื่องหมายค้าง เข้าระบบด้วยรหัสสาขา → หน้าลูกค้าเป้าหมายแสดงข้อมูลของสาขาทันที ไม่ว่าง", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", { email: EMAIL, password: รหัสชั่วคราว });
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(บริษัท).first(), "หน้าลูกค้าเป้าหมายต้องแสดงข้อมูลของสาขาทันที").toBeVisible({ timeout: 30_000 });
});

// ── คำสั่งดูแลระบบที่ทำงานด้วยสิทธิ์เจ้าของ ห้ามให้ผู้ใช้เรียกเอง ───────────────────────────────
// restore_sync_sequences() ตั้งตัวนับเลขใหม่ทั้งฐาน มีไว้ให้สคริปต์กู้ข้อมูลเรียกด้วยสิทธิ์เซิร์ฟเวอร์เท่านั้น
// เดิมใครเข้าระบบได้ (รวมคนที่ยังไม่เข้าระบบ) ก็เรียกได้ และข้างในไม่ตรวจสิทธิ์เลย (พบ 13 ต.ค. 69 · ปิดในใบ 0187)
test("[security] ดีลเลอร์และคนที่ยังไม่เข้าระบบ เรียกคำสั่งตั้งตัวนับเลขของระบบไม่ได้", async ({ request }) => {
  const { RYG } = await import("./supabaseEnv");
  const ryg = (await ไคลเอนต์().auth.signInWithPassword(RYG)).data.session!.access_token;
  const ดีลเลอร์ = await ตรง(request, "rpc/restore_sync_sequences", ryg, { method: "POST", data: {} });
  expect(ดีลเลอร์.status(), `ดีลเลอร์เรียกต้องถูกปฏิเสธ (ได้ ${ดีลเลอร์.status()})`).toBeGreaterThanOrEqual(400);
  const คนนอก = await ตรง(request, "rpc/restore_sync_sequences", SUPABASE_ANON, { method: "POST", data: {} });
  expect(คนนอก.status(), `คนที่ยังไม่เข้าระบบเรียกต้องถูกปฏิเสธ (ได้ ${คนนอก.status()})`).toBeGreaterThanOrEqual(400);
  // สคริปต์กู้ข้อมูล (สิทธิ์เซิร์ฟเวอร์) ต้องยังเรียกได้
  const { error } = await admin.rpc("restore_sync_sequences");
  expect(error, `สิทธิ์เซิร์ฟเวอร์ต้องยังเรียกได้ (${error?.message ?? ""})`).toBeNull();
});

// ── คำสั่งภายในของระบบ 2 ตัว ต้องเรียกได้เฉพาะฝั่งที่ควรเรียก ───────────────────────────────────
// ตัวออกใบผ่าน (เรียกโดยระบบยืนยันตัวตนเท่านั้น) · ตัวนับจำนวนคำขอ (เรียกโดยเส้นทางผู้ดูแลด้วยสิทธิ์เซิร์ฟเวอร์เท่านั้น)
// ใบแก้ฐานข้อมูลถอนสิทธิ์ไว้ตั้งแต่ 0005/0032 และ 0065 — ฐานที่สร้างจากใบต้องปฏิเสธ
// (พบ 13 ต.ค. 69: ฐานทดสอบตัวเดิมถูกให้สิทธิ์คืนนอกใบ ทั้งสองตัวเลยเรียกได้ทุกคน · scripts/db-audit-grants.mjs คอยจับ)
test("[security] ตัวออกใบผ่านและตัวนับคำขอ: คนนอกและผู้ใช้เรียกเองไม่ได้ · เข้าระบบยังได้ข้อมูลสิทธิ์ในใบผ่านครบ", async ({ request }) => {
  const { RYG } = await import("./supabaseEnv");
  const { data, error } = await ไคลเอนต์().auth.signInWithPassword(RYG);
  expect(error, "ถอนสิทธิ์เรียกแล้ว ระบบยืนยันตัวตนต้องยังออกใบผ่านได้").toBeNull();
  const claims = JSON.parse(Buffer.from(data.session!.access_token.split(".")[1], "base64url").toString());
  expect(claims.user_role, "ใบผ่านต้องมีบทบาท").toBe("DEALER_ADMIN");
  expect(claims.dealer_code, "ใบผ่านต้องมีรหัสสาขา").toBe("RYG");
  expect(claims.must_change_password, "ใบผ่านต้องมีเครื่องหมายตั้งรหัส (บัญชีปกติ = false)").toBe(false);

  const ผู้เรียก: [string, string][] = [["คนที่ยังไม่เข้าระบบ", SUPABASE_ANON], ["ดีลเลอร์", data.session!.access_token]];
  for (const [ใคร, token] of ผู้เรียก) {
    const hook = await ตรง(request, "rpc/custom_access_token_hook", token, { method: "POST", data: { event: { user_id: data.session!.user.id, claims: {} } } });
    expect(hook.status(), `${ใคร}เรียกตัวออกใบผ่านต้องถูกปฏิเสธ (ได้ ${hook.status()})`).toBeGreaterThanOrEqual(400);
    const นับ = await ตรง(request, "rpc/check_rate_limit", token, { method: "POST", data: { p_key: "zztest-outsider", p_max: 1, p_window_seconds: 60 } });
    expect(นับ.status(), `${ใคร}เรียกตัวนับคำขอต้องถูกปฏิเสธ (ได้ ${นับ.status()})`).toBeGreaterThanOrEqual(400);
  }
  // สิทธิ์เซิร์ฟเวอร์ (เส้นทางผู้ดูแล) ต้องยังเรียกตัวนับได้ และนับจริง: ครั้งที่เกินโควตาต้องได้ false
  const key = `zztest-admin-${Date.now()}`;
  const แรก = await admin.rpc("check_rate_limit", { p_key: key, p_max: 1, p_window_seconds: 60 });
  const สอง = await admin.rpc("check_rate_limit", { p_key: key, p_max: 1, p_window_seconds: 60 });
  expect(แรก.error, `สิทธิ์เซิร์ฟเวอร์ต้องเรียกตัวนับได้ (${แรก.error?.message ?? ""})`).toBeNull();
  expect([แรก.data, สอง.data], "ครั้งแรกผ่าน ครั้งที่เกินโควตาต้องถูกจำกัด").toEqual([true, false]);
  await admin.from("rate_limits").delete().like("key", "zztest-%");
});
