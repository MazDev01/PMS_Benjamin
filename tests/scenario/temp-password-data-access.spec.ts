import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { ข้ามตั้งรหัสครั้งแรก } from "./firstLogin";

// ── บัญชีที่ยังถือ "รหัสชั่วคราวจากสำนักงานใหญ่" ต้องแตะข้อมูลไม่ได้ จนกว่าจะตั้งรหัสของตัวเอง ──────
//
// ช่องโหว่ที่ปิด (พบ 13 ต.ค. 69 ตอนไล่โหมด api):
//   การบังคับ "เข้าระบบครั้งแรกต้องตั้งรหัสใหม่" มีอยู่แค่ที่หน้าจอ (FirstPasswordGate)
//   กฎสิทธิ์ของฐานข้อมูลและ /api/v1 ไม่เคยดูเครื่องหมาย must_change_password เลย
//   → ใครถือรหัสชั่วคราว (ดีลเลอร์เอง · คนที่เห็นตอนส่งต่อ · เจ้าหน้าที่ที่เปิดดูสำเนารหัสได้)
//     ยิงตรงเข้าฐานหรือผ่าน /api/v1 อ่าน-เขียนข้อมูลของสาขานั้นได้เรื่อย ๆ โดยไม่ต้องผ่านหน้าตั้งรหัส
//
// ด่านจริงอยู่ที่ฐานข้อมูล (ใบ 0187): เครื่องหมายอยู่ในใบผ่าน → กฎสิทธิ์ทุกตารางปฏิเสธทั้งอ่านและเขียน
// ชุดนี้ยิงด้วย "ใบผ่านจริงของบัญชีรหัสชั่วคราว" ทั้งสองทาง ไม่ผ่านหน้าจอ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
// เรียงลำดับเป็นค่าปกติ (ข้อท้าย ๆ ตั้งรหัสจริง) · PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนหน้าตก ใช้ตอนพิสูจน์ว่า "ถอดด่านแล้วตกทุกข้อ"
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
  for (const t of ["dealer_login_secrets", "dealer_settings", "dealer_account_changes", "dealer_account_requests", "entity_counters"]) {
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
  // ของให้อ่าน: ลูกค้าเป้าหมายของสาขานี้ 1 ราย (ใส่ด้วยสิทธิ์ผู้ดูแล) — ไม่งั้น "อ่านไม่ได้" กับ "ไม่มีอะไรให้อ่าน" แยกไม่ออก
  const { error } = await admin.from("leads").insert(แถวลูกค้าเป้าหมาย(880_100_001, บริษัท));
  expect(error, `เตรียมลูกค้าเป้าหมายตั้งต้น (${error?.message ?? ""})`).toBeNull();

  const { data, error: e2 } = await ไคลเอนต์().auth.signInWithPassword({ email: EMAIL, password: รหัสชั่วคราว });
  expect(e2, "รหัสชั่วคราวต้องเข้าระบบได้ (ไม่งั้นตั้งรหัสใหม่ไม่ได้)").toBeNull();
  ใบผ่าน = data.session!;
  expect(ใบผ่าน.user.app_metadata?.must_change_password, "บัญชีใหม่ต้องถูกทำเครื่องหมายให้ตั้งรหัส").toBe(true);
});
test.afterAll(purge);

test("[security] รหัสชั่วคราว · ยิงตรงฐานข้อมูล: อ่านข้อมูลของสาขาไม่ได้", async ({ request }) => {
  const leads = await (await ตรง(request, `leads?select=id,company&dealer_code=eq.${CODE}`, ใบผ่าน.access_token)).json();
  expect(Array.isArray(leads) ? leads.length : -1, `ต้องอ่านลูกค้าเป้าหมายไม่ได้ (ได้ ${JSON.stringify(leads).slice(0, 120)})`).toBe(0);
  for (const t of ["quotations", "customers", "appointments", "dealer_settings", "master_catalog", "dealers"]) {
    const rows = await (await ตรง(request, `${t}?select=*&limit=5`, ใบผ่าน.access_token)).json();
    expect(Array.isArray(rows) ? rows.length : 0, `ต้องอ่านตาราง ${t} ไม่ได้`).toBe(0);
  }
});

test("[security] รหัสชั่วคราว · ยิงตรงฐานข้อมูล: เขียนข้อมูลไม่ได้ และเรียกคำสั่งของระบบไม่ได้", async ({ request }) => {
  const ชื่อ = "ZZTEST-TEMPPASS-เขียนตรง";
  const res = await ตรง(request, "leads", ใบผ่าน.access_token, { method: "POST", data: แถวลูกค้าเป้าหมาย(880_100_002, ชื่อ) });
  expect(res.status(), `เพิ่มลูกค้าเป้าหมายต้องถูกปฏิเสธ (ได้ ${res.status()})`).toBeGreaterThanOrEqual(400);
  expect(await นับในฐาน(ชื่อ), "ต้องไม่มีแถวหลุดลงฐาน").toBe(0);

  const แก้ = await ตรง(request, `leads?dealer_code=eq.${CODE}&num_id=eq.880100001`, ใบผ่าน.access_token, { method: "PATCH", data: { note: "แก้ด้วยรหัสชั่วคราว" } });
  const แก้ได้ = แก้.ok() ? ((await แก้.json()) as unknown[]).length : 0;
  expect(แก้ได้, "แก้ลูกค้าเป้าหมายเดิมต้องไม่ได้สักแถว").toBe(0);

  // คำสั่งของระบบที่ทำงานด้วยสิทธิ์สูงกว่าผู้เรียก (ข้ามกฎรายตาราง) ต้องปฏิเสธเองด้วย
  const เลข = await ตรง(request, "rpc/next_entity_id", ใบผ่าน.access_token, { method: "POST", data: { p_dealer: CODE, p_entity: "leads" } });
  expect(เลข.status(), `ขอเลขลูกค้าเป้าหมายต้องถูกปฏิเสธ (ได้ ${เลข.status()} ${await เลข.text()})`).toBeGreaterThanOrEqual(400);
});

test("[security] รหัสชั่วคราว · ผ่าน /api/v1 ของแอป: อ่านและเขียนไม่ได้", async ({ request }) => {
  const อ่าน = await ผ่านแอป(request, `leads?dealer=${CODE}`, ใบผ่าน.access_token);
  const ข้อความ = await อ่าน.text();
  expect(ข้อความ.includes(บริษัท), `/api/v1/leads ต้องไม่ส่งลูกค้าเป้าหมายของสาขากลับมา (สถานะ ${อ่าน.status()})`).toBe(false);
  for (const r of ["quotations", "customers", "catalog"]) {
    const res = await ผ่านแอป(request, `${r}?dealer=${CODE}`, ใบผ่าน.access_token);
    const body = await res.text();
    const จำนวน = res.ok() ? (() => { try { const j = JSON.parse(body); return Array.isArray(j) ? j.length : 0; } catch { return 0; } })() : 0;
    expect(จำนวน, `/api/v1/${r} ต้องไม่ส่งข้อมูลกลับมา`).toBe(0);
  }
  const ชื่อ = "ZZTEST-TEMPPASS-เขียนผ่านแอป";
  const เขียน = await ผ่านแอป(request, "leads", ใบผ่าน.access_token, {
    method: "POST",
    data: { id: "ZZTEST-TEMPPASS-3", numId: 880_100_003, dealerCode: CODE, name: ชื่อ, company: ชื่อ, contact: "ผู้ทดสอบ",
            phone: "081-555-0143", province: "ระยอง", status: "WAITING", value: "", product: "", assigned: "" },
  });
  expect(เขียน.status(), `เพิ่มผ่าน /api/v1 ต้องถูกปฏิเสธ (ได้ ${เขียน.status()})`).toBeGreaterThanOrEqual(400);
  expect(await นับในฐาน(ชื่อ), "ต้องไม่มีแถวหลุดลงฐาน").toBe(0);
});

test("[security] ผู้ใช้ล้างเครื่องหมายเองไม่ได้ — แก้ข้อมูลบัญชีฝั่งตัวเองแล้วยังถูกปฏิเสธ", async ({ request }) => {
  const sb = ไคลเอนต์();
  await sb.auth.setSession({ access_token: ใบผ่าน.access_token, refresh_token: ใบผ่าน.refresh_token });
  // ช่องที่ผู้ใช้แก้เองได้คือ user_metadata เท่านั้น — เครื่องหมายจริงอยู่ที่ app_metadata ซึ่งแก้ได้เฉพาะฝั่งเซิร์ฟเวอร์
  await sb.auth.updateUser({ data: { must_change_password: false, app_metadata: { must_change_password: false } } });
  const { data } = await sb.auth.refreshSession();
  const ใหม่ = data.session ?? ใบผ่าน;
  expect(ใหม่.user.app_metadata?.must_change_password, "เครื่องหมายจริงต้องยังอยู่").toBe(true);
  const leads = await (await ตรง(request, `leads?select=id&dealer_code=eq.${CODE}`, ใหม่.access_token)).json();
  expect(Array.isArray(leads) ? leads.length : -1, "ใบผ่านใบใหม่หลังพยายามล้างเครื่องหมาย ต้องยังอ่านไม่ได้").toBe(0);
  ใบผ่าน = ใหม่;
});

test("[security] สำนักงานใหญ่เข้าระบบแทนบัญชีที่ยังไม่ตั้งรหัส: ได้ใบผ่านที่แตะข้อมูลไม่ได้เหมือนกัน", async ({ request }) => {
  const hq = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=${CODE}`, { headers: { authorization: `Bearer ${hq}` } });
  test.skip(res.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(res.status(), await res.text()).toBe(200);
  const th = new URLSearchParams(new URL(String((await res.json() as { link: string }).link)).hash.replace(/^#/, "")).get("th") ?? "";
  const { data, error } = await ไคลเอนต์().auth.verifyOtp({ token_hash: th, type: "magiclink" });
  expect(error, `ลิงก์เข้าระบบแทนต้องแลกใบผ่านได้ (${error?.message ?? ""})`).toBeNull();
  const leads = await (await ตรง(request, `leads?select=id&dealer_code=eq.${CODE}`, data.session!.access_token)).json();
  expect(Array.isArray(leads) ? leads.length : -1, "เข้าระบบแทนก็ต้องอ่านข้อมูลไม่ได้ จนกว่าบัญชีนั้นจะตั้งรหัสของตัวเอง").toBe(0);
});

test("[หน้าจอ] สำนักงานใหญ่เข้าระบบแทนบัญชีที่ยังไม่ตั้งรหัส → เจอหน้าตั้งรหัส ไม่ใช่หน้าระบบ", async ({ request, page }) => {
  // ไม่ยกเว้นการเข้าระบบแทน (ข้อตัดสิน 13 ต.ค. 69): ฐานข้อมูลปฏิเสธข้อมูลของบัญชีนี้อยู่แล้ว
  //   ถ้าหน้าจอปล่อยผ่าน สำนักงานใหญ่จะเห็นหน้าระบบว่างเปล่าโดยไม่รู้ว่าเพราะอะไร
  const hq = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=${CODE}`, { headers: { authorization: `Bearer ${hq}` } });
  test.skip(res.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(res.status(), await res.text()).toBe(200);
  await page.goto(String((await res.json() as { link: string }).link), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" }),
    "เข้าแทนบัญชีที่ยังไม่ตั้งรหัส ต้องเห็นหน้าตั้งรหัส").toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: "ลูกค้าเป้าหมาย" }), "ต้องยังไม่เห็นเมนูของระบบ").toHaveCount(0);
});

test("ตั้งรหัสของตัวเองแล้ว → เข้าระบบใหม่ เห็นข้อมูลของสาขาทันที ไม่ว่าง (ด่านไม่กันเกิน)", async ({ request, page }) => {
  // ใบผ่านของรหัสชั่วคราวต้องยังใช้ "ตั้งรหัสใหม่" ได้ — ทางเดียวที่บัญชีนี้ทำได้
  const เข้าใหม่ก่อน = await ไคลเอนต์().auth.signInWithPassword({ email: EMAIL, password: รหัสชั่วคราว });
  const ตั้ง = await request.post(`${HQ_ORIGIN}/api/account`, {
    headers: { authorization: `Bearer ${เข้าใหม่ก่อน.data.session?.access_token ?? ""}`, "content-type": "application/json" },
    data: { op: "first-password", password: รหัสของดีลเลอร์ },
  });
  expect(ตั้ง.status(), `ตั้งรหัสครั้งแรกต้องสำเร็จ (${await ตั้ง.text()})`).toBe(200);

  const { data, error } = await ไคลเอนต์().auth.signInWithPassword({ email: EMAIL, password: รหัสของดีลเลอร์ });
  expect(error, "รหัสที่ตั้งเองต้องเข้าระบบได้").toBeNull();
  expect(data.session!.user.app_metadata?.must_change_password, "ตั้งแล้วเครื่องหมายต้องหาย").not.toBe(true);
  const leads = await (await ตรง(request, `leads?select=company&dealer_code=eq.${CODE}`, data.session!.access_token)).json() as { company: string }[];
  expect(leads.map(l => l.company), "ตั้งรหัสแล้วต้องอ่านข้อมูลของสาขาตัวเองได้").toContain(บริษัท);
  const ทางแอป = await (await ผ่านแอป(request, `leads?dealer=${CODE}`, data.session!.access_token)).text();
  expect(ทางแอป.includes(บริษัท), "และอ่านผ่าน /api/v1 ได้").toBe(true);

  // ขั้นยืนยันอีเมลติดต่อหลังตั้งรหัส (ด่าน 1) ไม่ใช่เรื่องที่ข้อนี้ทดสอบ — ข้ามไป (มีข้อทดสอบของตัวเองที่ contact-email-verify.spec.ts)
  await ข้ามตั้งรหัสครั้งแรก(EMAIL);
  // หน้าจอ: เข้าระบบด้วยรหัสใหม่ผ่านหน้าเข้าสู่ระบบจริง → หน้าลูกค้าเป้าหมายต้องมีข้อมูลของสาขา ไม่ว่าง
  await loginUI(page, DEALER_ORIGIN, "/login", { email: EMAIL, password: รหัสของดีลเลอร์ });
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" }), "ตั้งแล้วต้องไม่เจอหน้าตั้งรหัสอีก").toHaveCount(0);
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
