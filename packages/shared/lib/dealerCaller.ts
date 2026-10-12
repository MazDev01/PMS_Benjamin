// ── "ใครเป็นคนเรียก" สำหรับ API บัญชีของดีลเลอร์ (ใช้ร่วมกันหลาย route) ─────────────
//
// แยกออกมาจาก /api/account เพราะมีมากกว่าหนึ่งเส้นทางที่ต้องตอบคำถามเดียวกัน:
//   • เปลี่ยนอีเมล/รหัสผ่านของตัวเอง        (/api/account)
//   • ขอเลขยืนยันทางอีเมลเพื่อดูรหัสของตัวเอง (/api/account/reveal)
// ไฟล์ route ของ Next export ได้เฉพาะ handler จึงแชร์โค้ดข้าม route ตรง ๆ ไม่ได้
//
// กติกาความปลอดภัยที่ยึดไว้เหมือนกันทุกเส้นทาง:
//   • เชื่อ "ใบผ่าน" เท่านั้น ไม่เชื่อรหัสสาขาที่ส่งมากับคำขอ (ส่งรหัสสาขาอื่นมาก็ไม่มีผล)
//   • บัญชีที่ถูกปิดใช้งานสั่งอะไรไม่ได้ทันที ไม่ต้องรอใบผ่านหมดอายุ
//   • คีย์ service_role อยู่ที่แอปสำนักงานใหญ่เท่านั้น
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** แอปดีลเลอร์อยู่คนละที่อยู่ → อนุญาตข้ามต้นทางเฉพาะที่อยู่ที่ตั้งไว้ (DEALER_APP_ORIGIN) */
export function dealerCors(req: NextRequest): Record<string, string> {
  const allow = (process.env.DEALER_APP_ORIGIN ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  return {
    ...(allow.includes(origin) ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };
}

export const dealerJson = (req: NextRequest, body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: dealerCors(req) });

export type ดีลเลอร์ผู้เรียก = {
  admin: SupabaseClient;
  userId: string;
  email: string;
  dealerCode: string;
  name: string;
};

/** ตรวจใบผ่าน → คืนบัญชี "ของสาขา" ที่เรียกมา · ไม่ใช่ดีลเลอร์ = ปฏิเสธ */
export async function ดีลเลอร์ที่เรียก(
  req: NextRequest,
): Promise<{ ok: true; who: ดีลเลอร์ผู้เรียก } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, res: dealerJson(req, { error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ใช้งานหน้านี้ยังไม่ได้" }, 501) };
  }
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, res: dealerJson(req, { error: "unauthorized" }, 401) };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller.user) return { ok: false, res: dealerJson(req, { error: "unauthorized" }, 401) };

  const { data: prof, error: profErr } = await admin
    .from("profiles").select("dealer_code, name, status").eq("id", caller.user.id).maybeSingle();
  if (profErr) {
    console.error("[dealerCaller] อ่านโปรไฟล์ผู้เรียกไม่สำเร็จ", profErr);
    return { ok: false, res: dealerJson(req, { error: "ตรวจสอบสิทธิ์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503) };
  }
  if (!prof || String(prof.status ?? "active") !== "active") {
    return { ok: false, res: dealerJson(req, { error: "บัญชีนี้ถูกปิดการใช้งานแล้ว — ติดต่อผู้ดูแลระบบ" }, 403) };
  }
  const dealerCode = String(prof.dealer_code ?? "").trim().toUpperCase();
  if (!dealerCode) {
    return { ok: false, res: dealerJson(req, { error: "บัญชีนี้ไม่ได้สังกัดสาขา — ใช้งานหน้านี้ไม่ได้" }, 403) };
  }
  return {
    ok: true,
    who: { admin, userId: caller.user.id, email: caller.user.email ?? "", dealerCode, name: String(prof.name ?? "") },
  };
}

/** ปิดอีเมลบางส่วนไว้บอกผู้ใช้ว่า "ส่งไปที่ไหน" โดยไม่เปิดอีเมลเต็มบนหน้าจอ
 *  sales@cmsteelbuild.co.th → sa•••@cmsteelbuild.co.th */
export function ปิดบางส่วนของอีเมล(email: string): string {
  const [ชื่อ, โดเมน] = String(email).split("@");
  if (!โดเมน) return email;
  const หัว = ชื่อ.slice(0, Math.min(2, ชื่อ.length));
  return `${หัว}${"•".repeat(Math.max(3, ชื่อ.length - หัว.length))}@${โดเมน}`;
}
