// ── ตัวช่วยกลางของ Route Handler ฝั่งผู้ดูแล (/api/admin/*) ─────────────────────────
//
// ทำไมต้องมี: 3 route (dealers, dealers/impersonate, users) เขียนขั้นตอนเดียวกันซ้ำกันคนละชุด
//   — ตรวจ service_role → ตรวจ JWT → อ่านบทบาทจาก profiles → เช็คสิทธิ์ → บันทึก audit
//   พอมีบั๊กในขั้นตอนใดขั้นตอนหนึ่ง ต้องไล่แก้ทุกไฟล์ และเคยตกหล่นมาแล้วจริง
//   (ผลตรวจสอบระบบ 5 ส.ค. 69: error ของ select บทบาทถูกทิ้งทั้ง 4 จุด → ผู้มีสิทธิ์จริงได้ 403
//    ตอน DB สะดุด และไม่มี log ให้ตามเลย)
//
// รวมไว้ที่เดียว = แก้ครั้งเดียวมีผลทุก route และ route ใหม่ได้ของถูกต้องมาตั้งแต่ต้น
import { NextResponse, type NextRequest } from "next/server";
import { callerToken } from "@pms/shared/server/v1/_cookie";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasPermission, type Permission } from "@pms/shared/lib/permissions";
import type { UserRole } from "@pms/shared/lib/mock";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export type CallerProfile = { role?: string; name?: string };

export function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** โปรไฟล์ผู้เรียกที่ผ่านการตรวจสิทธิ์แล้ว + client ที่ใช้ service_role */
export type Authorized = { admin: SupabaseClient; callerId: string; prof: CallerProfile };

/**
 * ตรวจ service_role + JWT + บทบาทของผู้เรียก (อ่านจาก profiles จริง ไม่เชื่อค่าที่ client ส่งมา)
 *
 * แยก "ไม่มีสิทธิ์" (403) ออกจาก "อ่านบทบาทไม่สำเร็จ" (503) — ถ้ารวมกันเหมือนเดิม ผู้ใช้ที่มีสิทธิ์
 * ถูกต้องจะเห็นข้อความ "ไม่มีสิทธิ์" ตอน DB สะดุดชั่วคราว ซึ่งทำให้ไล่ปัญหาไม่ถูกจุด
 */
export async function authorizeAdmin(
  req: NextRequest,
  permission: Permission,
  denyMessage: string,
  notConfiguredMessage: string,
): Promise<{ ok: true; auth: Authorized } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, res: bad(501, notConfiguredMessage) };
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ระยะ 4: ใบผ่านย้ายไปอยู่ใน cookie httpOnly แล้ว (หน้าเว็บแนบ header เองไม่ได้)
  // ยังรับ header ไว้ด้วย — สคริปต์ดูแลระบบและชุดทดสอบยิงด้วย Bearer
  const token = callerToken(req);
  if (!token) return { ok: false, res: bad(401, "unauthorized") };
  const { data: caller, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !caller.user) return { ok: false, res: bad(401, "unauthorized") };

  const { data: prof, error: profErr } = await admin
    .from("profiles").select("role, name, status").eq("id", caller.user.id).maybeSingle();
  if (profErr) {
    // อ่านบทบาทไม่ได้ ≠ ไม่มีสิทธิ์ — ต้องบอกให้ต่างกัน ไม่งั้นไล่ปัญหาไม่ถูก (และไม่มีร่องรอยเลย)
    console.error("[adminRoute] อ่านบทบาทผู้เรียกไม่สำเร็จ", profErr);
    return { ok: false, res: bad(503, "ตรวจสอบสิทธิ์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง") };
  }
  // บัญชีที่ถูกปิดการใช้งาน ต้องสั่งงานไม่ได้ "ทันที" ไม่ใช่รอ token หมดอายุ
  //   token ของ Supabase มีอายุ 1 ชั่วโมง — เดิมตรวจแค่บทบาท พนักงานที่เพิ่งถูกปลด/พักงาน
  //   จึงยังสร้างดีลเลอร์ รีเซ็ตรหัสผ่าน หรือลบผู้ใช้ได้อีกนานถึง 1 ชั่วโมงหลังถูกปิดบัญชี
  //   (ผลตรวจสอบระบบรอบ 2 · ระดับสูง) · ตรวจที่นี่ที่เดียวครอบทุก /api/admin/*
  if (prof && String(prof.status) !== "active") {
    return { ok: false, res: bad(403, "บัญชีนี้ถูกปิดการใช้งานแล้ว — ติดต่อผู้ดูแลระบบ") };
  }
  if (!prof || !hasPermission(String(prof.role) as UserRole, permission)) {
    return { ok: false, res: bad(403, denyMessage) };
  }
  return { ok: true, auth: { admin, callerId: caller.user.id, prof } };
}

/**
 * บันทึก audit ฝั่งเซิร์ฟเวอร์ — best-effort (ล้มเหลวต้องไม่ทำให้งานหลักพัง)
 * แต่ต้อง "ดังพอให้รู้" ถ้าเขียนไม่ได้ ไม่งั้นร่องรอยการใช้สิทธิ์สำคัญดับเงียบโดยไม่มีใครรู้
 */
export async function auditLog(
  admin: SupabaseClient, prof: CallerProfile | null, action: string, target: string,
): Promise<void> {
  try {
    const { error } = await admin.from("audit_log")
      .insert({ user: prof?.name ?? "", role: prof?.role ?? "", action, target });
    if (error) console.error(`[audit] บันทึกไม่สำเร็จ (${action} · ${target})`, error);
  } catch (e) {
    console.error(`[audit] บันทึกไม่สำเร็จ (${action} · ${target})`, e);
  }
}

/**
 * ลบบัญชีเข้าระบบแบบ "ดังเมื่อพลาด" — ใช้ตอนย้อนกลับ (rollback) ที่ห้ามล้มเหลวเงียบ
 *
 * ทำไมต้องมีตัวนี้: supabase-js **คืน error เป็นค่า** ไม่ได้โยน exception
 *   โค้ดเดิมเขียน `try { await admin.auth.admin.deleteUser(uid) } catch { log }` ซึ่งดักไม่ติดเลย
 *   → การย้อนกลับล้มเหลวโดยไม่มีใครรู้ เหลือ "บัญชีที่ล็อกอินได้แต่ไม่มีโปรไฟล์" ค้างในระบบ
 *   ซึ่งเป็นสิ่งที่การย้อนกลับนั้นตั้งใจจะกันอยู่แท้ ๆ (ผลตรวจสอบระบบรอบ 2 · ระดับสูง)
 *
 * คืน true เมื่อลบสำเร็จจริง — ผู้เรียกเอาไปบอกผู้ใช้ได้ว่าเหลือของค้างหรือไม่
 */
export async function deleteAuthUserLoud(
  admin: SupabaseClient, userId: string, label: string,
): Promise<boolean> {
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`[${label}] ย้อนลบบัญชี ${userId} ไม่สำเร็จ — อาจเหลือบัญชีกำพร้า`, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[${label}] ย้อนลบบัญชี ${userId} ไม่สำเร็จ — อาจเหลือบัญชีกำพร้า`, e);
    return false;
  }
}

/**
 * ครอบ handler ให้ throw ที่ไม่ได้คาดคิด (เช่น network ของ supabase-js พังจริง ไม่ใช่คืน error object)
 * กลายเป็น 500 รูปแบบ JSON เดียวกับ error อื่น ๆ + มี log ฝั่งเซิร์ฟเวอร์เสมอ
 * เดิมจะหลุดไป error boundary ของ Next เอง → client ได้ response คนละรูปแบบ และไม่มี log ว่าอะไรพัง
 */
export function withErrors(
  label: string,
  handler: (req: NextRequest) => Promise<NextResponse>,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (e) {
      console.error(`[${label}] ล้มเหลวโดยไม่คาดคิด`, e);
      return bad(500, "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ — ลองใหม่อีกครั้ง");
    }
  };
}

/** รหัสผ่านตั้งต้นที่แข็งแรง — ออกที่เซิร์ฟเวอร์เสมอ ไม่ให้ client กำหนด (กันรหัสอ่อน/เดาได้) */
export function strongPassword(prefix: string): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const all = upper + lower + digit;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const pick = (set: string, i: number) => set[bytes[i] % set.length];
  // ให้มีครบทุกชนิดอย่างน้อยอย่างละตัว แล้วเติมที่เหลือ
  let out = pick(upper, 0) + pick(lower, 1) + pick(digit, 2);
  for (let i = 3; i < 14; i++) out += pick(all, i);
  return prefix + out;
}

/**
 * หา "บัญชีเข้าระบบของสาขา" — หนึ่งสาขาหนึ่งบัญชี (ดู H5)
 * แยก 3 กรณีออกจากกัน: อ่านไม่ได้ / ไม่พบ / เจอมากกว่าหนึ่ง
 *   profiles.dealer_code ไม่มี unique constraint ที่ DB (0104 เพิ่มให้แล้ว แต่ข้อมูลเก่าอาจซ้ำอยู่)
 *   เดิม .maybeSingle() คืน error เมื่อเจอหลายแถว แล้ว error ถูกทิ้ง → รายงานว่า "ไม่พบบัญชี" (404)
 *   ทั้งที่จริงคือเจอหลายบัญชี — แอดมินงงว่าทำไมรีเซ็ตรหัสผ่าน/เข้าระบบแทนไม่ได้ทั้งที่สาขามีอยู่
 */
export async function findDealerAccount(
  admin: SupabaseClient, code: string,
): Promise<{ ok: true; id: string } | { ok: false; res: NextResponse }> {
  const { data, error } = await admin.from("profiles").select("id").eq("dealer_code", code);
  if (error) {
    console.error(`[adminRoute] ค้นหาบัญชีของสาขา ${code} ไม่สำเร็จ`, error);
    return { ok: false, res: bad(503, "ค้นหาบัญชีของดีลเลอร์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง") };
  }
  if (!data || data.length === 0) {
    return { ok: false, res: bad(404, `ไม่พบบัญชีเข้าระบบของดีลเลอร์รหัส "${code}"`) };
  }
  if (data.length > 1) {
    console.error(`[adminRoute] สาขา ${code} มีบัญชีเข้าระบบ ${data.length} บัญชี (ควรมีบัญชีเดียว)`);
    return { ok: false, res: bad(409, `สาขา "${code}" มีบัญชีเข้าระบบมากกว่าหนึ่ง (${data.length}) — ต้องแก้ข้อมูลก่อน`) };
  }
  return { ok: true, id: String(data[0].id) };
}

// ── อีเมลนี้มีคนใช้อยู่แล้วไหม (ถามระบบยืนยันตัวตนตรง ๆ) ─────────────────────────
//
// ทำไมต้องถามก่อน แทนที่จะยิงเปลี่ยนแล้วค่อยอ่าน error:
//   ตอนอีเมลซ้ำ ระบบยืนยันตัวตนตอบกลับมาเป็น 500 พร้อมเนื้อความว่าง "{}" (วัดจริง 1 ก.ย. 69)
//   โค้ดเดิมจับคำว่า already/registered/exists จากข้อความ จึงจับไม่ได้เลย แล้วตกไปทาง
//   "ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" ซึ่งผิดความจริง: ลองอีกกี่ครั้งก็ไม่มีวันสำเร็จ
//   ผู้ใช้ไม่มีทางรู้ว่าต้องเปลี่ยนไปใช้อีเมลอื่น
//
// ใช้ปลายทาง /auth/v1/admin/users?filter= ซึ่งค้นด้วยอีเมลได้ตรง ๆ (ต้องใช้ service_role)
// คืน null = ตรวจไม่ได้ (เน็ต/สิทธิ์มีปัญหา) → ผู้เรียกควรเดินหน้าต่อตามเดิม ไม่ใช่บล็อกงาน
export async function อีเมลถูกใช้แล้ว(
  url: string, serviceKey: string, email: string, ยกเว้นบัญชี?: string,
): Promise<boolean | null> {
  const e = email.trim().toLowerCase();
  if (!url || !serviceKey || !e) return null;
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=50&filter=${encodeURIComponent(e)}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { users?: { id?: string; email?: string }[] };
    if (!Array.isArray(body.users)) return null;
    // filter เป็นการค้นแบบ "มีคำนี้อยู่" → ต้องเทียบอีเมลเต็มเองอีกชั้น ไม่งั้นชื่อที่คล้ายกันจะถูกนับว่าซ้ำ
    return body.users.some(u => String(u.email ?? "").toLowerCase() === e && u.id !== ยกเว้นบัญชี);
  } catch (err) {
    console.warn("[adminRoute] ตรวจอีเมลซ้ำไม่สำเร็จ — ปล่อยผ่าน", err);
    return null;
  }
}

// ── สำเนารหัสผ่านที่เก็บไว้ ยังใช้เข้าระบบได้จริงไหม ─────────────────────────────────
//
// ทำไมต้องตรวจตอนเปิดดู: ดีลเลอร์ตั้งรหัสใหม่ผ่านลิงก์ "ลืมรหัสผ่าน" ได้ แล้วหน้าเว็บของดีลเลอร์
//   ต้องแจ้งกลับมาให้ลบสำเนาเก่า — ถ้าการแจ้งนั้นไม่ถึง (ยังไม่ได้ตั้งที่อยู่แอป HQ / เน็ตหลุด)
//   สำเนาเก่าจะค้าง แล้ว HQ เปิดดูเห็นรหัสที่ใช้ไม่ได้แล้ว เอาไปแจ้งดีลเลอร์ = เข้าระบบไม่ได้
//   (ข้อมูลผิดที่ดูเหมือนถูก อันตรายกว่าไม่มีข้อมูล) · ตรวจตอนเปิดดูจึงไม่ต้องพึ่งหน้าเว็บฝั่งดีลเลอร์
//
// คืน true = เข้าได้ · false = รหัสผิดแน่นอน · null = ตรวจไม่ได้ (ระบบขัดข้อง/ถูกจำกัดความถี่) ห้ามตีความว่าใช้ไม่ได้
// ⚠️ ห้ามสั่งออกจากระบบหลังตรวจ — ค่าเริ่มต้นของ signOut คือยกเลิก "ทุกเครื่อง" ดีลเลอร์ที่ใช้งานอยู่จะหลุดทันที
export async function รหัสผ่านยังเข้าระบบได้(email: string, password: string): Promise<boolean | null> {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!SUPABASE_URL || !anon || !email || !password) return null;
  try {
    const sb = createClient(SUPABASE_URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (data?.session) return true;
    if (error && /invalid login credentials/i.test(String(error.message ?? ""))) return false;
    return null;
  } catch (e) {
    console.warn("[adminRoute] ตรวจสำเนารหัสผ่านไม่สำเร็จ — ไม่ถือว่าใช้ไม่ได้", e);
    return null;
  }
}
