// ── ดีลเลอร์กู้บัญชีด้วยลิงก์ "ลืมรหัสผ่าน" สำเร็จแล้ว — เก็บกวาดฝั่งสำนักงานใหญ่ ──────
//
// เรียกจากหน้า /reset-password ของแอปดีลเลอร์ ทันทีหลังตั้งรหัสใหม่สำเร็จ (ยังมีใบผ่านอยู่)
//
// ทำสองอย่าง:
//   1) ลบสำเนารหัสเก่าที่สำนักงานใหญ่เก็บไว้ (dealer_login_secrets)
//      ⚠️ สำคัญ: ถ้าไม่ลบ HQ จะกด "ดูรหัสผ่านดีลเลอร์" แล้วเห็นรหัสเก่าที่ใช้ไม่ได้แล้ว
//         แล้วเอาไปแจ้งดีลเลอร์ → เข้าระบบไม่ได้ และไม่มีใครรู้ว่าเลขนั้นผิดตั้งแต่แรก
//         ข้อมูลผิดที่ดูเหมือนถูก อันตรายกว่าไม่มีข้อมูล
//   2) บันทึกไว้ให้สำนักงานใหญ่เห็น (audit + dealer_account_changes)
//      by_self = false → "ไม่นับโควตาแก้เอง 2 ครั้ง" เพราะเป็นการกู้บัญชี ไม่ใช่การเปลี่ยนตามใจ
//      (บอสตัดสิน 28 ส.ค. 69)

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { auditLog, withErrors } from "@pms/shared/lib/adminRoute";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** แอปดีลเลอร์อยู่คนละที่อยู่ → อนุญาตข้ามต้นทางเฉพาะที่อยู่ที่ตั้งไว้ (เหมือน /api/account) */
function corsHeaders(req: NextRequest): Record<string, string> {
  const allow = (process.env.DEALER_APP_ORIGIN ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  return {
    ...(allow.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };
}
const json = (req: NextRequest, body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: corsHeaders(req) });

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export const POST = withErrors("dealer-reset-done", async (req: NextRequest) => {
  if (!SUPABASE_URL || !SERVICE_KEY) return json(req, { error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์" }, 501);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(req, { error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller.user) return json(req, { error: "unauthorized" }, 401);

  if (!(await checkRateLimit(admin, `dealer-reset-done:${caller.user.id}`, 10, 300))) {
    return json(req, { error: "เรียกถี่เกินไป — รอสักครู่แล้วลองใหม่" }, 429);
  }

  const { data: prof } = await admin.from("profiles")
    .select("dealer_code, name").eq("id", caller.user.id).maybeSingle();
  const dealerCode = String(prof?.dealer_code ?? "").trim().toUpperCase();
  if (!dealerCode) return json(req, { error: "บัญชีนี้ไม่ได้สังกัดสาขา" }, 403);

  // 1) สำเนารหัสเก่าใช้ไม่ได้แล้ว — ลบทิ้ง (ไม่มีแถวอยู่แล้วก็ไม่ถือว่าผิดพลาด)
  const { error: delErr } = await admin.from("dealer_login_secrets").delete().eq("dealer_code", dealerCode);
  if (delErr) console.error(`[reset-done] ลบสำเนารหัสของ ${dealerCode} ไม่สำเร็จ`, delErr);

  // 2) บันทึกให้สำนักงานใหญ่เห็น — by_self=false = ไม่กินโควตาแก้เอง
  const { error: logErr } = await admin.from("dealer_account_changes")
    .insert({ dealer_code: dealerCode, kind: "password", by_self: false });
  if (logErr) console.error(`[reset-done] บันทึกการกู้บัญชีของ ${dealerCode} ไม่สำเร็จ`, logErr);

  await auditLog(admin, { name: String(prof?.name ?? ""), role: "DEALER" },
    "ดีลเลอร์ตั้งรหัสผ่านใหม่ผ่านลิงก์อีเมล (ลืมรหัสผ่าน)", dealerCode);

  return json(req, { ok: true });
});
