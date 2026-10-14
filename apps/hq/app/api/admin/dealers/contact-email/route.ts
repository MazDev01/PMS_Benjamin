// ── อีเมลติดต่อของดีลเลอร์: HQ ดูสถานะ / ยืนยันแทน (ด่าน 1 · ใบ 0194) ─────────────────────────────────
//
// ทางออกเมื่อระบบส่งอีเมลขัดข้อง หรือดีลเลอร์ไม่ได้รับโค้ด: HQ ยืนยันอีเมลที่ดีลเลอร์กรอกไว้แทนได้
//   (HQ ไม่ได้พิมพ์อีเมลเอง — ยืนยันได้เฉพาะที่ดีลเลอร์กรอกไว้แล้ว) · บันทึกการใช้งานว่าใครยืนยันแทน
// สิทธิ์: dealers:manage (เหมือนหน้าจัดการดีลเลอร์ส่วนอื่น)
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { bad, authorizeAdmin, auditLog, withErrors } from "@pms/shared/lib/adminRoute";
import { ยืนยันอีเมลแทนดีลเลอร์ } from "@pms/shared/server/contactEmail";

export const runtime = "nodejs";
const DENY = "ไม่มีสิทธิ์จัดการอีเมลติดต่อของดีลเลอร์";
const NOT_CONFIGURED = "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (SUPABASE_SERVICE_ROLE_KEY)";
const รหัสจากคำขอ = (req: NextRequest) => (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();

export const GET = withErrors("dealer-contact-email-state", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const code = รหัสจากคำขอ(req);
  if (!/^[A-Z]{2,5}$/.test(code)) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");
  const { data, error } = await authz.auth.admin.from("profiles").select("contact_email, contact_email_verified_at")
    .eq("dealer_code", code).eq("role", "DEALER_ADMIN").limit(1).maybeSingle();
  if (error) return bad(503, "อ่านอีเมลติดต่อไม่สำเร็จชั่วคราว");
  return NextResponse.json({ contactEmail: String(data?.contact_email ?? ""), verified: !!data?.contact_email_verified_at });
});

export const POST = withErrors("dealer-contact-email-verify", async (req: NextRequest) => {
  const authz = await authorizeAdmin(req, "dealers:manage", DENY, NOT_CONFIGURED);
  if (!authz.ok) return authz.res;
  const { admin, callerId, prof } = authz.auth;
  if (!(await checkRateLimit(admin, `verify-contact-email:${callerId}`, 20, 60))) return bad(429, "กดถี่เกินไป — รอสักครู่แล้วลองใหม่");
  const code = รหัสจากคำขอ(req);
  if (!/^[A-Z]{2,5}$/.test(code)) return bad(400, "รหัสดีลเลอร์ไม่ถูกต้อง");
  const r = await ยืนยันอีเมลแทนดีลเลอร์(admin, code);
  if (!r.ok) return bad(r.status, r.error);
  await auditLog(admin, prof, "ยืนยันอีเมลติดต่อแทนดีลเลอร์", `${code} · ${r.email}`);
  return NextResponse.json({ verified: true, contactEmail: r.email });
});
