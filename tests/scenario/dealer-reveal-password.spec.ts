// ── ดีลเลอร์ดูรหัสผ่านของตัวเอง ต้องยืนยันด้วยเลขที่ส่งไปทางอีเมลก่อน ────────────────
//
// บอสสั่ง 1 ก.ย. 69 — ทับกติกาเดิม (28 ส.ค. 69) ที่ห้ามดีลเลอร์ดูรหัสตัวเองเลย
// สิ่งที่ต้องกันไว้: กดปุ่มแล้วเห็นรหัสทันทีโดยไม่ต้องพิสูจน์ว่าถือกล่องอีเมลของสาขาจริง
//   (จอที่เปิดค้างไว้ในออฟฟิศ = ใครเดินมานั่งก็เปิดดูรหัสได้)
//
// เลขยืนยันที่ใช้ในเทสต์เอามาจากระบบยืนยันตัวตนโดยตรง (generateLink → email_otp)
//   = เลขตัวเดียวกับที่จะถูกส่งไปทางอีเมลจริง ทดสอบได้โดยไม่ต้องมีกล่องจดหมาย
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const CODE = "ZTR";
const EMAIL = "zztest-reveal@example.co.th";
const PASSWORD = "ZZtest-Reveal-2569";
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

test("[auth·dealer] ดูรหัสผ่านตัวเองได้ ต่อเมื่อใส่เลขยืนยันที่ส่งไปทางอีเมล", async ({ request }) => {
  const adminToken = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    data: { code: CODE, name: "ZZTEST สาขาทดสอบดูรหัส", province: "ระยอง", region: "ตะวันออก", revenueTarget: 0, email: EMAIL, password: PASSWORD, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  test.skip(สร้าง.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(สร้าง.status(), `ต้องสร้างสาขาทดสอบได้ (${await สร้าง.text()})`).toBe(200);

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const dealerToken = signed.session?.access_token ?? "";
  const เรียก = (data: unknown, token = dealerToken) => request.post(`${HQ_ORIGIN}/api/account/reveal`, {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    data,
  });

  // ไม่มีใบผ่าน = เข้าไม่ถึงเลย
  const ไม่มีใบผ่าน = await เรียก({ op: "send" }, "");
  expect(ไม่มีใบผ่าน.status(), "คนไม่ได้ล็อกอินต้องขอเลขไม่ได้").toBe(401);

  // เดาเลขมั่ว = ไม่เห็นรหัส
  const เลขมั่ว = await เรียก({ op: "verify", code: "000000" });
  expect(เลขมั่ว.status(), "เลขยืนยันผิดต้องไม่คืนรหัสผ่าน").toBe(400);
  expect(await เลขมั่ว.text()).not.toContain(PASSWORD);

  // เลขจริงจากระบบยืนยันตัวตน = เห็นรหัสของตัวเอง
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const otp = link?.properties?.email_otp ?? "";
  expect(otp, "ต้องได้เลขยืนยันมาทดสอบ").not.toBe("");
  const ถูกต้อง = await เรียก({ op: "verify", code: otp });
  expect(ถูกต้อง.status(), `ใส่เลขถูกต้องแล้วต้องเห็นรหัส (${await ถูกต้อง.text()})`).toBe(200);
  expect((await ถูกต้อง.json()).password, "ต้องเป็นรหัสผ่านจริงของสาขานั้น").toBe(PASSWORD);

  // เลขเดิมใช้ซ้ำไม่ได้ (ใช้ครั้งเดียว)
  const ซ้ำ = await เรียก({ op: "verify", code: otp });
  expect(ซ้ำ.ok(), "เลขยืนยันต้องใช้ได้ครั้งเดียว").toBeFalsy();

  // เปิดดูแล้วต้องมีร่องรอยให้สำนักงานใหญ่เห็น
  const { data: log } = await admin.from("audit_log").select("action").eq("target", CODE).order("id", { ascending: false }).limit(10);
  expect((log ?? []).some(x => /เปิดดูรหัสผ่านของตัวเอง/.test(String(x.action))), "ต้องบันทึกไว้ว่ามีการเปิดดูรหัส").toBeTruthy();

  // ไม่มีสำเนารหัสในระบบ (เคยตั้งใหม่ผ่านลิงก์อีเมล) → ต้องบอกตรง ๆ ไม่ใช่ส่งอีเมลเสียเที่ยว
  await admin.from("dealer_login_secrets").delete().eq("dealer_code", CODE);
  const ไม่มีสำเนา = await เรียก({ op: "send" });
  expect(ไม่มีสำเนา.status(), "ไม่มีสำเนารหัสต้องตอบ 404 พร้อมเหตุผล").toBe(404);
  expect(await ไม่มีสำเนา.text()).toContain("ไม่มีสำเนารหัสผ่าน");
});
