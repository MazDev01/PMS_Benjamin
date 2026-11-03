// ── ส่งอีเมลทดสอบถึงผู้รับแจ้งเตือนของ HQ (ตั้งค่า › การแจ้งเตือน · ใบ 0274 · บอสสั่ง 3 พ.ย. 69) ─────────────────────
//
// ส่งถึงทุกอีเมลในรายชื่อผู้รับของ HQ ที่บันทึกแล้ว (hq_notif_rules.email_recipients — รายชื่อเดียวกับที่ตัววางจดหมายของฐานใช้)
//   ส่งทันทีทีละฉบับ แล้วตอบผลรายอีเมล (สำเร็จ/ไม่สำเร็จ + เหตุ) · ไม่มีผู้รับ = รายการว่าง
// สิทธิ์: settings:edit (คนที่แก้รายชื่อผู้รับได้) · บันทึกการใช้งานทุกครั้ง
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors } from "@pms/shared/lib/adminRoute";
import { ส่งอีเมลทดสอบ } from "@pms/shared/server/contactEmail";

export const runtime = "nodejs";
const DENY = "ไม่มีสิทธิ์ส่งอีเมลทดสอบการแจ้งเตือน";
const NOT_CONFIGURED = "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY)";

export const POST = withErrors("hq-notify-test", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "settings:edit", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;
  if (!(await checkRateLimit(admin, `hq-notify-test:${callerId}`, 5, 300))) return bad(429, "ส่งอีเมลทดสอบถี่เกินไป — รอสักครู่แล้วลองใหม่");
  const { data, error } = await admin.from("hq_notif_rules").select("email_recipients").eq("id", 1).maybeSingle();
  if (error) return bad(503, "อ่านรายชื่อผู้รับไม่สำเร็จชั่วคราว");
  const รายชื่อ = ((data?.email_recipients ?? []) as string[]).map(String);
  const results = await ส่งอีเมลทดสอบ(admin, รายชื่อ, "สำนักงานใหญ่");
  await auditLog(admin, prof, "ส่งอีเมลทดสอบการแจ้งเตือน",
    `${results.filter(r => r.ok).length} จาก ${results.length} อีเมลสำเร็จ`);
  return NextResponse.json({ results });
});
