import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { settle } from "./helpers";
import { ข้ามตั้งรหัสครั้งแรก } from "./firstLogin";

// ── ลบสาขาแล้ว บัญชีของสาขานั้นต้องใช้งานระบบต่อไม่ได้ (ผู้ใช้แจ้ง 14 ส.ค. 69) ──────
//
// อาการเดิม: สำนักงานใหญ่ลบสาขาไปแล้ว — ทะเบียนหาย บัญชีเข้าระบบถูกลบจริง — แต่เบราว์เซอร์
//   ที่ยังถือใบผ่าน (JWT) ใบเดิมยังเปิดหน้าในระบบได้ต่อจนกว่าใบจะหมดอายุ (นานถึง 1 ชม.)
//   ทุกคำขอข้อมูลถูกฐานข้อมูลปฏิเสธ หน้าจอจึงว่างเปล่า ผู้ใช้เห็นเป็น "ระบบพัง" ไม่ใช่ "ถูกลบสิทธิ์"
//   ต้นเหตุ: การฟื้น session อ่านจากใบผ่านในเครื่องอย่างเดียว ไม่เคยถามว่าบัญชี/สาขายังอยู่ไหม
//
// เรื่องเดียวกันกับ "ปิดใช้งานสาขา" (ผู้ใช้แจ้ง 14 ส.ค. 69): ล็อกอินใหม่ถูกปฏิเสธจริงตั้งแต่ที่
//   ฐานข้อมูล (0032) แต่คนที่เปิดหน้าค้างอยู่ยังใช้ต่อได้ — ต้องเด้งออกเหมือนกัน
//
// เทสต์นี้ล็อกไว้ 4 ด้าน:
//   1. สาขาถูกลบ → หน้าที่เปิดค้างต้องเด้งออกไปหน้าเข้าสู่ระบบ
//   2. สาขาที่ยังอยู่ → ต้องใช้งานได้ตามปกติ (กันการแก้เผลอเด้งคนที่ยังมีสิทธิ์ออก)
//   3. สาขาถูกปิดใช้งาน → ล็อกอินใหม่ไม่ได้ และหน้าที่เปิดค้างต้องเด้งออก
//   4. การตรวจสาขาต้องอ่านผ่าน view dealers_directory — ตาราง dealers ถูกถอนสิทธิ์อ่านไปแล้ว (0090)
//      เคยพลาดมาแล้ว: ยิงตรงที่ตาราง แล้วการตรวจกลายเป็นโค้ดตายที่ไม่เคยจับอะไรได้เลย
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

// เสียงที่ "ต้องมี" ตามธรรมชาติของสถานการณ์นี้ — ไม่ใช่ข้อบกพร่องของแอป:
//   โหมด supabase: คำสั่งออกจากระบบถูกตอบ 403 เพราะบัญชีถูกลบไปแล้วจริง ๆ
//   โหมด api: การถามว่า "ตอนนี้เป็นใคร" ถูกตอบ 401 — นั่นแหละคือกลไกที่ทำให้เด้งออกได้
//             (เบราว์เซอร์รายงาน 401 เป็น error เสมอ ห้ามใช้เป็นหลักฐานว่าแอปพัง)
//   ทั้งสองแบบจบเหมือนกัน: ใบผ่านถูกล้าง ผู้ใช้ถูกพากลับหน้าเข้าสู่ระบบ — ซึ่งเทสต์ยืนยันไว้ข้างบนแล้ว
// [http 401] /api/account = หน้าตั้งค่าถามสถานะบัญชีของสาขา (ฟีเจอร์ใหม่ 28 ส.ค. 69)
//   สาขาถูกลบไปแล้ว ใบผ่านจึงใช้ไม่ได้ — คำตอบ 401 ตรงนี้คือ "กลไกที่ทำให้เด้งออก" ไม่ใช่ความพัง
const INHERENT = /auth\/v1\/logout|status of 403|\/api\/v1\/auth|status of 401|\[http 401\].*\/api\/account/;

const CODE = "ZTG"; // รหัสสาขาทดสอบเฉพาะไฟล์นี้ — ไม่ชนกับ CNX/RYG/UBN ของจริง
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function adminToken() {
  return (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
}
/** เก็บกวาดสาขาทดสอบ + บัญชีของมัน — ต้องลบบัญชี auth ด้วย ไม่งั้นรอบถัดไปสร้างไม่ได้ (อีเมลซ้ำ) */
async function purge() {
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
  await admin.from("dealers").delete().eq("code", CODE);
}

test.beforeAll(purge);
test.afterAll(purge);

test("[auth] ลบสาขาแล้ว หน้าที่เปิดค้างอยู่ต้องเด้งออกจากระบบ", async ({ page, request }) => {
  const errs = watchErrors(page);

  const created = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${await adminToken()}` },
    data: { code: CODE, name: "ZZTMP สาขาทดสอบเด้งออก", province: "ระยอง", region: "ตะวันออก", revenueTarget: 1_000_000, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  expect(created.status(), `สร้างสาขาต้องผ่าน (ได้ ${created.status()} · ${await created.text()})`).toBe(200);
  const cred = await created.json() as { email: string; password: string };
  // เทสต์นี้ไม่ได้ทดสอบหน้าตั้งรหัสครั้งแรก — ปลดไว้ ไม่งั้นทุกหน้าติดอยู่ที่หน้านั้น
  await ข้ามตั้งรหัสครั้งแรก(cred.email);

  await loginUI(page, DEALER_ORIGIN, "/login", cred);
  expect(new URL(page.url()).pathname, "ล็อกอินแล้วต้องเข้าถึงหน้าในระบบได้ก่อน").not.toContain("/login");

  // สำนักงานใหญ่ลบสาขาทิ้ง (route ลบบัญชีเข้าระบบให้ด้วย)
  const del = await request.delete(`${HQ_ORIGIN}/api/admin/dealers?code=${CODE}`, {
    headers: { authorization: `Bearer ${await adminToken()}` },
  });
  expect(del.status(), `ลบสาขาต้องผ่าน (ได้ ${del.status()} · ${await del.text()})`).toBe(200);
  // ลูกค้าเป้าหมายที่สร้างสาขานี้ขึ้นมาต้องหายไปด้วย ไม่ค้าง "เป็นดีลเลอร์แล้ว" แบบไม่มีสาขา (บอสสั่ง 15 ก.ย. 69)
  const { data: ค้าง } = await admin.from("dealer_prospects").select("id").like("name", `%ผู้สนใจ-${CODE}`);
  expect(ค้าง ?? [], "ลบสาขาแล้ว ลูกค้าเป้าหมายต้นทางต้องถูกลบตาม").toEqual([]);

  // เบราว์เซอร์ที่ยังถือใบผ่านใบเดิม — เปิดหน้าในระบบต้องถูกเด้งออก ไม่ใช่เข้าไปเจอหน้าจอเปล่า
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname,
    { timeout: 20_000, message: "สาขาถูกลบแล้ว ต้องเด้งไปหน้าเข้าสู่ระบบ" }).toContain("/login");

  assertNoErrors(errs.filter(e => !INHERENT.test(e)), "ลบสาขาแล้วเด้งออก");
});

test("[auth] สาขาที่ยังอยู่ต้องใช้งานได้ตามปกติ (ไม่เด้งออกผิดคน)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).pathname, "สาขาปกติต้องไม่ถูกเด้งออก").not.toContain("/login");
  await expect(page.getByText("บัญชีดีลเลอร์").first()).toBeVisible({ timeout: 15_000 });
});

test("[auth] ปิดใช้งานสาขา → ล็อกอินใหม่ไม่ได้ และหน้าที่เปิดค้างต้องเด้งออก", async ({ page, request }) => {
  const errs = watchErrors(page);
  const CODE2 = "ZTI";
  const purge2 = async () => {
    const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE2);
    for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
    await admin.from("dealers").delete().eq("code", CODE2);
  };
  await purge2();
  try {
    const created = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
      headers: { authorization: `Bearer ${await adminToken()}` },
      data: { code: CODE2, name: "ZZTMP สาขาปิดใช้งาน", province: "ระยอง", region: "ตะวันออก", revenueTarget: 1_000_000, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE2) },
    });
    expect(created.status(), `สร้างสาขาต้องผ่าน (${await created.text()})`).toBe(200);
    const cred = await created.json() as { email: string; password: string };
    await ข้ามตั้งรหัสครั้งแรก(cred.email);

    await loginUI(page, DEALER_ORIGIN, "/login", cred);
    expect(new URL(page.url()).pathname, "ตอนยังเปิดใช้งานต้องเข้าได้ปกติ").not.toContain("/login");

    // สำนักงานใหญ่กดปิดใช้งานสาขา
    await admin.from("dealers").update({ status: "inactive" }).eq("code", CODE2);

    // ล็อกอินใหม่จากศูนย์ต้องถูกปฏิเสธที่ฐานข้อมูล (ไม่ออกใบผ่านให้เลย)
    const fresh = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await fresh.auth.signInWithPassword(cred);
    expect(error, "สาขาที่ถูกปิดใช้งานต้องล็อกอินใหม่ไม่ได้").not.toBeNull();

    // หน้าที่เปิดค้างอยู่ต้องเด้งออกเมื่อโหลดหน้าถัดไป
    await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
    await expect.poll(() => new URL(page.url()).pathname,
      { timeout: 20_000, message: "สาขาถูกปิดใช้งานแล้ว ต้องเด้งไปหน้าเข้าสู่ระบบ" }).toContain("/login");

    assertNoErrors(errs.filter(e => !INHERENT.test(e)), "ปิดใช้งานสาขาแล้วเด้งออก");
  } finally {
    await purge2();
  }
});
