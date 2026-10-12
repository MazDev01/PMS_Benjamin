// ── สิทธิ์แก้อีเมล/รหัสผ่านเองของดีลเลอร์ (2 ครั้ง) — HQ ดู / คืนสิทธิ์ (บอสสั่ง 15 ก.ย. 69) ─────────
//
// GET  ?code=XXX → { used, limit }
// POST ?code=XXX → คืนสิทธิ์: ตั้ง quota_reset_at ให้แถวที่ดีลเลอร์แก้เองที่ยังนับอยู่ (0177)
//   ประวัติการเปลี่ยนเดิมยังอยู่ครบ แค่เริ่มนับใหม่ · บันทึกการใช้งานว่าใครคืนให้สาขาไหน
// เฉพาะผู้มีสิทธิ์จัดการดีลเลอร์ (dealers:manage)
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors } from "@pms/shared/lib/adminRoute";
import { SELF_CHANGE_LIMIT } from "@pms/shared/lib/data/local/accountLocal";

export const runtime = "nodejs";

const DENY = "ไม่มีสิทธิ์จัดการดีลเลอร์";
const NOT_CONFIGURED = "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY) — จัดการสิทธิ์แก้บัญชีจากที่นี่ยังไม่ได้";

function รหัสสาขา(req: NextRequest): string | null {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  return /^[A-Z]{2,5}$/.test(code) ? code : null;
}

export const GET = withErrors("dealer-self-quota", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const code = รหัสสาขา(req);
  if (!code) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");
  const { count, error } = await authz.auth.admin.from("dealer_account_changes")
    .select("id", { count: "exact", head: true })
    .eq("dealer_code", code).eq("by_self", true).is("quota_reset_at", null);
  if (error || count === null) {
    console.error(`[dealer-self-quota] อ่านสิทธิ์แก้เองของ ${code} ไม่สำเร็จ`, error);
    return bad(503, "อ่านสิทธิ์แก้บัญชีเองไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  return NextResponse.json({ used: count, limit: SELF_CHANGE_LIMIT });
});

export const POST = withErrors("dealer-self-quota-reset", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;
  if (!(await checkRateLimit(admin, `self-quota-reset:${callerId}`, 10, 60))) {
    return bad(429, "คืนสิทธิ์ถี่เกินไป — รอสักครู่แล้วลองใหม่");
  }
  const code = รหัสสาขา(req);
  if (!code) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");

  const { data, error } = await admin.from("dealer_account_changes")
    .update({ quota_reset_at: new Date().toISOString() })
    .eq("dealer_code", code).eq("by_self", true).is("quota_reset_at", null)
    .select("id");
  if (error) {
    console.error(`[dealer-self-quota-reset] คืนสิทธิ์ของ ${code} ไม่สำเร็จ`, error);
    return bad(503, "คืนสิทธิ์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง");
  }
  const reset = data?.length ?? 0;
  if (reset === 0) return bad(409, "ดีลเลอร์รายนี้ยังไม่ได้ใช้สิทธิ์แก้เอง — ไม่มีอะไรต้องคืน");
  await auditLog(admin, prof, "คืนสิทธิ์แก้บัญชีเองให้ดีลเลอร์", `${code} · เริ่มนับใหม่ (เดิมใช้ไป ${reset} ครั้ง)`);
  return NextResponse.json({ ok: true, reset });
});
