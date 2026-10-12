// ── ดีลเลอร์แก้บัญชีเอง → ครบโควตา → ส่งคำขอ → สำนักงานใหญ่อนุมัติ/ปฏิเสธ (ครบวงที่เซิร์ฟเวอร์) ──
//
// เดิมไม่มีเทสต์ไหนแตะ /api/admin/dealers/account-requests เลย (ตรวจ 15 ก.ย. 69)
// สิ่งที่ต้องพิสูจน์:
//   1) กติกาเดียวทั้งระบบ: รหัสมีช่องว่าง/สั้น ถูกปฏิเสธ · อีเมลใหม่ = อีเมลเดิม ถูกปฏิเสธ (ไม่กินโควตา)
//   2) ครบ 2 ครั้งแล้วกลายเป็นคำขอ ยังไม่แตะบัญชี
//   3) อนุมัติแล้วเข้าด้วยรหัสใหม่ได้จริง · ประวัติไม่นับโควตา · รหัสในคำขอถูกล้าง · กดอนุมัติซ้ำได้ 409
//   4) ปฏิเสธแล้วดีลเลอร์เห็นผล (lastRejected) · รหัสในคำขอถูกล้าง
import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const CODE = "ZTR";
const EMAIL = "zztest-dealer-request@example.co.th";
const PASSWORD = "ZZtest-Req-2569";
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
  await admin.from("dealer_prospects").delete().like("name", `%ผู้สนใจ-${CODE}`);
}
test.beforeAll(purge);
test.afterAll(purge);

const hqToken = async () => (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
async function dealerToken(password: string) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password });
  return { token: data.session?.access_token ?? "", error };
}
const ยิงบัญชี = (request: APIRequestContext, token: string, data: Record<string, unknown>) =>
  request.post(`${HQ_ORIGIN}/api/account`, { headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, data });
const สถานะ = async (request: APIRequestContext, token: string) =>
  (await request.get(`${HQ_ORIGIN}/api/account`, { headers: { authorization: `Bearer ${token}` } })).json() as Promise<{
    selfChangesUsed: number; pending: { id: string } | null; lastRejected?: { reason?: string } | null;
  }>;
const ตัดสิน = (request: APIRequestContext, token: string, id: string, action: "approve" | "reject", reason?: string) =>
  request.patch(`${HQ_ORIGIN}/api/admin/dealers/account-requests`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, data: { id, action, reason },
  });

test("[api] แก้เองตามกติกา → ครบโควตาเป็นคำขอ → อนุมัติมีผลจริง → ปฏิเสธแล้วดีลเลอร์เห็นผล", async ({ request }) => {
  const hq = await hqToken();
  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${hq}`, "content-type": "application/json" },
    data: { code: CODE, name: "ZZTEST สาขาคำขอบัญชี", province: "ระยอง", region: "ตะวันออก", revenueTarget: 0,
            email: EMAIL, password: PASSWORD, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  test.skip(สร้าง.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(สร้าง.status(), await สร้าง.text()).toBe(200);

  const { token, error } = await dealerToken(PASSWORD);
  expect(error, "ดีลเลอร์ต้องเข้าด้วยรหัสที่ตั้งตอนสร้างได้").toBeNull();
  const ก่อน = await สถานะ(request, token);
  test.skip(!("selfChangesUsed" in ก่อน), "ฐานข้อมูลนี้ยังไม่มีตารางบัญชีดีลเลอร์ (0165)");

  // ── 1) กติกาเดียวทั้งระบบ — ถูกปฏิเสธต้องไม่กินโควตา ──
  const เว้นวรรค = await ยิงบัญชี(request, token, { currentPassword: PASSWORD, password: "มี ช่องว่าง 12345" });
  expect(เว้นวรรค.status(), "รหัสมีช่องว่างต้องถูกปฏิเสธ").toBe(400);
  const อีเมลเดิม = await ยิงบัญชี(request, token, { currentPassword: PASSWORD, email: EMAIL.toUpperCase() });
  expect(อีเมลเดิม.status(), "อีเมลใหม่ = อีเมลเดิม ต้องถูกปฏิเสธ").toBe(400);
  expect((await สถานะ(request, token)).selfChangesUsed, "คำขอที่ถูกปฏิเสธต้องไม่กินโควตา").toBe(0);

  // ── 2) ใช้โควตาครบ 2 ครั้ง (บันทึกตรงให้เร็ว) แล้วส่งคำขอเปลี่ยนรหัส = ยังไม่มีผล ──
  expect((await admin.from("dealer_account_changes").insert([
    { dealer_code: CODE, kind: "password", by_self: true }, { dealer_code: CODE, kind: "password", by_self: true },
  ])).error).toBeNull();
  const รหัสใหม่ = "ZZtest-Approved-2569";
  const ขอ = await ยิงบัญชี(request, token, { currentPassword: PASSWORD, password: รหัสใหม่ });
  expect(ขอ.status(), await ขอ.text()).toBe(200);
  expect((await ขอ.json() as { applied: boolean }).applied, "เกินโควตาต้องเป็นคำขอ ยังไม่มีผล").toBe(false);
  expect((await dealerToken(รหัสใหม่)).error, "ก่อนอนุมัติ รหัสใหม่ต้องยังเข้าไม่ได้").not.toBeNull();
  const ค้าง = (await สถานะ(request, token)).pending;
  expect(ค้าง, "ต้องมีคำขอค้าง").not.toBeNull();

  // ── 3) อนุมัติ → มีผลจริง · รหัสในคำขอถูกล้าง · ประวัติไม่นับโควตา · อนุมัติซ้ำได้ 409 ──
  const อนุมัติ = await ตัดสิน(request, hq, ค้าง!.id, "approve");
  expect(อนุมัติ.status(), await อนุมัติ.text()).toBe(200);
  const หลังอนุมัติ = await dealerToken(รหัสใหม่);
  expect(หลังอนุมัติ.error, "อนุมัติแล้วต้องเข้าด้วยรหัสใหม่ได้").toBeNull();
  const { data: ใบ } = await admin.from("dealer_account_requests").select("status, secret").eq("id", ค้าง!.id).single();
  expect(ใบ?.status).toBe("approved");
  expect(ใบ?.secret ?? null, "ตัดสินแล้วต้องไม่เก็บรหัสที่ขอไว้ต่อ").toBeNull();
  const { count: ไม่นับ } = await admin.from("dealer_account_changes").select("id", { count: "exact", head: true })
    .eq("dealer_code", CODE).eq("by_self", false);
  expect(ไม่นับ, "การเปลี่ยนจากการอนุมัติต้องมีประวัติแบบไม่นับโควตา").toBe(1);
  expect((await ตัดสิน(request, hq, ค้าง!.id, "approve")).status(), "ตัดสินซ้ำต้องได้ 409").toBe(409);

  // ── 4) ส่งคำขออีกใบแล้วปฏิเสธ → ดีลเลอร์เห็นผล · รหัสในคำขอถูกล้าง · บัญชีไม่เปลี่ยน ──
  const ขอรอบสอง = await ยิงบัญชี(request, หลังอนุมัติ.token, { currentPassword: รหัสใหม่, password: "ZZtest-Rejected-2569" });
  expect(ขอรอบสอง.status(), await ขอรอบสอง.text()).toBe(200);
  const ค้างสอง = (await สถานะ(request, หลังอนุมัติ.token)).pending;
  expect(ค้างสอง).not.toBeNull();
  expect((await ตัดสิน(request, hq, ค้างสอง!.id, "reject", "ZZTEST ขอยืนยันตัวตนทางโทรศัพท์ก่อน")).status()).toBe(200);
  const เห็นผล = await สถานะ(request, หลังอนุมัติ.token);
  expect(เห็นผล.pending, "ปฏิเสธแล้วต้องไม่มีคำขอค้าง").toBeNull();
  expect(เห็นผล.lastRejected?.reason, "ดีลเลอร์ต้องเห็นว่าคำขอถูกปฏิเสธพร้อมเหตุผล").toBe("ZZTEST ขอยืนยันตัวตนทางโทรศัพท์ก่อน");
  const { data: ใบสอง } = await admin.from("dealer_account_requests").select("secret").eq("id", ค้างสอง!.id).single();
  expect(ใบสอง?.secret ?? null, "ปฏิเสธแล้วต้องไม่เก็บรหัสที่ขอไว้ต่อ").toBeNull();
  expect((await dealerToken(รหัสใหม่)).error, "ปฏิเสธแล้วรหัสเดิมต้องยังใช้ได้").toBeNull();

  // ── 5) คืนสิทธิ์แก้เอง (บอสสั่ง 15 ก.ย. 69) → เริ่มนับใหม่ · ประวัติเดิมยังอยู่ · ดีลเลอร์คืนเองไม่ได้ ──
  const ดูสิทธิ์ = async () => (await request.get(`${HQ_ORIGIN}/api/admin/dealers/self-quota?code=${CODE}`,
    { headers: { authorization: `Bearer ${hq}` } })).json() as Promise<{ used: number; limit: number }>;
  expect((await ดูสิทธิ์()).used, "HQ ต้องเห็นว่าใช้สิทธิ์ครบแล้ว").toBe(2);
  const ดีลเลอร์คืนเอง = await request.post(`${HQ_ORIGIN}/api/admin/dealers/self-quota?code=${CODE}`,
    { headers: { authorization: `Bearer ${หลังอนุมัติ.token}` } });
  expect(ดีลเลอร์คืนเอง.status(), "ดีลเลอร์ต้องคืนสิทธิ์ให้ตัวเองไม่ได้").toBe(403);

  const คืน = await request.post(`${HQ_ORIGIN}/api/admin/dealers/self-quota?code=${CODE}`, { headers: { authorization: `Bearer ${hq}` } });
  expect(คืน.status(), await คืน.text()).toBe(200);
  expect((await ดูสิทธิ์()).used, "คืนแล้วต้องเริ่มนับใหม่").toBe(0);
  expect((await สถานะ(request, หลังอนุมัติ.token)).selfChangesUsed, "ฝั่งดีลเลอร์ต้องเห็นสิทธิ์กลับมาด้วย").toBe(0);
  const { count: ประวัติแก้เอง } = await admin.from("dealer_account_changes").select("id", { count: "exact", head: true })
    .eq("dealer_code", CODE).eq("by_self", true);
  expect(ประวัติแก้เอง, "ประวัติการแก้เองเดิมต้องยังอยู่").toBe(2);
  const { data: บันทึก } = await admin.from("audit_log").select("action, target").eq("action", "คืนสิทธิ์แก้บัญชีเองให้ดีลเลอร์")
    .like("target", `${CODE}%`).limit(1);
  expect(บันทึก ?? [], "ต้องบันทึกว่าใครคืนสิทธิ์ให้สาขาไหน").toHaveLength(1);
  expect((await request.post(`${HQ_ORIGIN}/api/admin/dealers/self-quota?code=${CODE}`, { headers: { authorization: `Bearer ${hq}` } })).status(),
    "ไม่มีสิทธิ์ที่ใช้ไป คืนซ้ำได้ 409").toBe(409);

  // คืนแล้วแก้เองมีผลทันที ไม่กลายเป็นคำขอ
  const แก้หลังคืน = await ยิงบัญชี(request, หลังอนุมัติ.token, { currentPassword: รหัสใหม่, password: "ZZtest-AfterReset-2569" });
  expect(แก้หลังคืน.status(), await แก้หลังคืน.text()).toBe(200);
  expect((await แก้หลังคืน.json() as { applied: boolean }).applied, "คืนสิทธิ์แล้วต้องแก้เองได้ทันที").toBe(true);
});
