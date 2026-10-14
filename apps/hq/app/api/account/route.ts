// ── ดีลเลอร์แก้อีเมล/รหัสผ่านเข้าระบบของตัวเอง (บอสสั่ง 28 ส.ค. 69) ─────────────────
//
// ทำไม route นี้อยู่ที่แอปสำนักงานใหญ่ ทั้งที่คนใช้คือดีลเลอร์:
//   คีย์ผู้ดูแล (service role) และกุญแจถอดรหัสสำเนารหัสผ่าน (DEALER_SECRET_KEY) อยู่ที่นี่ที่เดียว
//   ถ้าให้แอปดีลเลอร์เปลี่ยนบัญชีเองตรง ๆ สำนักงานใหญ่จะเปิดดูรหัสที่ดีลเลอร์ตั้งไม่ได้เลย
//   (แอปดีลเลอร์ยิงข้ามมาที่นี่พร้อมใบผ่านของตัวเอง — ดู accountRemote.ts)
//
// ด่านป้องกัน:
//   1) ต้องมีใบผ่านที่ใช้ได้ และเป็นบัญชี "ของสาขานั้นจริง" (เทียบ profiles.dealer_code)
//      — ห้ามเชื่อรหัสสาขาที่ส่งมากับคำขอ
//   2) ต้องกรอกรหัสผ่านปัจจุบันถูกต้อง (ยืนยันด้วยการล็อกอินซ้ำ) — กันคนที่มานั่งหน้าจอที่เปิดค้าง
//   3) จำกัดความถี่ · บันทึก audit ทุกครั้ง (สำนักงานใหญ่ต้องรู้ว่าใครเปลี่ยนอะไรเมื่อไหร่)
//   4) แก้เองได้ 2 ครั้งตลอดอายุบัญชี — ครั้งที่ 3 ขึ้นไปกลายเป็น "คำขอ" ที่ยังไม่มีผล
//   5) เข้าระบบครั้งแรก (บัญชีที่ HQ สร้างให้) ต้องตั้งรหัสใหม่ก่อน — ครั้งนั้นไม่นับสิทธิ์ข้อ 4 (บอสสั่ง 15 ก.ย. 69)

import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@pms/shared/lib/rateLimit";
import { auditLog, withErrors, อีเมลถูกใช้แล้ว, รหัสผ่านยังเข้าระบบได้ } from "@pms/shared/lib/adminRoute";
import { encryptSecret, dealerSecretReady } from "@pms/shared/lib/dealerSecret";
import { ตรวจรหัสผ่านใหม่ } from "@pms/shared/lib/passwordRule";
import { สถานะอีเมลติดต่อ, ส่งโค้ดยืนยันอีเมล, ยืนยันโค้ดอีเมล } from "@pms/shared/server/contactEmail";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
/** จำนวนครั้งที่ดีลเลอร์แก้เองได้ตลอดอายุบัญชี — ต้องตรงกับฝั่งหน้าจอ (accountLocal.SELF_CHANGE_LIMIT) */
const SELF_LIMIT = 2;

/** แอปดีลเลอร์อยู่คนละที่อยู่กับแอปนี้ → ต้องอนุญาตข้ามต้นทางให้เฉพาะที่อยู่ที่เราตั้งไว้เท่านั้น */
function corsHeaders(req: NextRequest): Record<string, string> {
  const allow = (process.env.DEALER_APP_ORIGIN ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const ok = allow.includes(origin);
  return {
    ...(ok ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
  };
}
const json = (req: NextRequest, body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: corsHeaders(req) });

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

type ผู้เรียก = {
  admin: SupabaseClient; userId: string; email: string; dealerCode: string; name: string;
  /** app_metadata ของบัญชี (ผู้ใช้แก้เองไม่ได้) — ต้องพกของเดิมไปด้วยตอนอัปเดต ไม่งั้นค่าอื่นหาย */
  appMeta: Record<string, unknown>;
  /** บัญชีที่ HQ สร้างให้และยังไม่เคยตั้งรหัสของตัวเอง */
  mustChangePassword: boolean;
  /** บัญชีที่ HQ สร้างให้และยังไม่ได้ยืนยันอีเมลติดต่อ (ด่าน 1) — หน้าจอพาไปยืนยันหลังตั้งรหัส */
  mustVerifyEmail: boolean;
};

/** ตรวจใบผ่าน → คืนบัญชี "ของสาขา" ที่เรียกมา · ไม่ใช่ดีลเลอร์ = ปฏิเสธ */
async function ดีลเลอร์ที่เรียก(req: NextRequest): Promise<{ ok: true; who: ผู้เรียก } | { ok: false; res: NextResponse }> {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { ok: false, res: json(req, { error: "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — เปลี่ยนบัญชีเข้าระบบยังไม่ได้" }, 501) };
  }
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, res: json(req, { error: "unauthorized" }, 401) };

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  // getUser ถามระบบยืนยันตัวตนสด ๆ — app_metadata ที่ได้เป็นค่าปัจจุบัน ไม่ใช่ค่าที่ฝังในใบผ่านตอนออก
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller.user) return { ok: false, res: json(req, { error: "unauthorized" }, 401) };

  const { data: prof, error: profErr } = await admin
    .from("profiles").select("dealer_code, name, status").eq("id", caller.user.id).maybeSingle();
  if (profErr) {
    console.error("[account] อ่านโปรไฟล์ผู้เรียกไม่สำเร็จ", profErr);
    return { ok: false, res: json(req, { error: "ตรวจสอบสิทธิ์ไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503) };
  }
  if (!prof || String(prof.status ?? "active") !== "active") {
    return { ok: false, res: json(req, { error: "บัญชีนี้ถูกปิดการใช้งานแล้ว — ติดต่อผู้ดูแลระบบ" }, 403) };
  }
  const dealerCode = String(prof.dealer_code ?? "").trim().toUpperCase();
  if (!dealerCode) {
    return { ok: false, res: json(req, { error: "บัญชีนี้ไม่ได้สังกัดสาขา — เปลี่ยนจากหน้านี้ไม่ได้" }, 403) };
  }
  const appMeta = (caller.user.app_metadata ?? {}) as Record<string, unknown>;
  return { ok: true, who: {
    admin, userId: caller.user.id, email: caller.user.email ?? "", dealerCode, name: String(prof.name ?? ""),
    appMeta, mustChangePassword: appMeta.must_change_password === true, mustVerifyEmail: appMeta.must_verify_email === true,
  } };
}

/** ยืนยันรหัสผ่านปัจจุบันด้วยการล็อกอินซ้ำ (ไม่เก็บ session) */
async function รหัสปัจจุบันถูกไหม(email: string, password: string): Promise<boolean> {
  if (!ANON_KEY) return false;
  const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return !error && !!data.session;
}

/** ยังไม่ได้ติดตั้งตาราง = ตอบให้รู้ว่าต้องรัน migration ไม่ใช่ปล่อยให้เห็น error ดิบของฐานข้อมูล */
// (ไม่ export — ไฟล์ route ของ Next อนุญาตให้ export เฉพาะ handler/ค่าตั้งค่าเท่านั้น)
class ยังไม่ได้ติดตั้ง extends Error {}

async function สรุปสถานะ(admin: SupabaseClient, dealerCode: string, email: string) {
  const [changes, pendingRes, rejectedRes, lastChangeRes] = await Promise.all([
    admin.from("dealer_account_changes")
      // สำนักงานใหญ่คืนสิทธิ์แล้ว (quota_reset_at · 0177) = ไม่นับ แต่ประวัติยังอยู่
      .select("id", { count: "exact", head: true }).eq("dealer_code", dealerCode).eq("by_self", true).is("quota_reset_at", null),
    admin.from("dealer_account_requests")
      .select("id, dealer_code, kind, new_email, status, requested_at")
      .eq("dealer_code", dealerCode).eq("status", "pending").maybeSingle(),
    // คำขอล่าสุดที่ถูกปฏิเสธ — หน้าอนุมัติบอก HQ ว่า "ดีลเลอร์จะเห็นว่าถูกปฏิเสธ" จึงต้องส่งให้ดีลเลอร์เห็นจริง
    admin.from("dealer_account_requests")
      .select("kind, new_email, requested_at, decided_at, reason")
      .eq("dealer_code", dealerCode).eq("status", "rejected")
      .order("decided_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("dealer_account_changes")
      .select("changed_at").eq("dealer_code", dealerCode)
      .order("changed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // มีการเปลี่ยนบัญชีหลังถูกปฏิเสธแล้ว = เรื่องนั้นจบไปแล้ว ไม่ต้องขึ้นเตือนค้างไว้
  const ปฏิเสธ = rejectedRes.data;
  const เปลี่ยนล่าสุด = lastChangeRes.data?.changed_at ? String(lastChangeRes.data.changed_at) : "";
  const lastRejected = ปฏิเสธ?.decided_at && (!เปลี่ยนล่าสุด || String(ปฏิเสธ.decided_at) > เปลี่ยนล่าสุด) ? {
    kind: ปฏิเสธ.kind, newEmail: ปฏิเสธ.new_email ?? undefined,
    requestedAt: String(ปฏิเสธ.requested_at), decidedAt: String(ปฏิเสธ.decided_at), reason: ปฏิเสธ.reason ?? undefined,
  } : null;
  // ⚠️ ต้อง "ล้มแบบปิดประตู" เมื่อยืนยันโควตาไม่ได้ — ไม่ใช่ปล่อยผ่านเป็น 0 ครั้ง
  //    ยังไม่ได้ติดตั้งตาราง PostgREST คืน count = null โดยไม่มี error (ไม่ใช่ 42P01 เสมอไป)
  //    ถ้าถือว่า "ใช้ไป 0 ครั้ง" ดีลเลอร์จะแก้บัญชีได้ไม่จำกัด และไม่มีบันทึกให้สำนักงานใหญ่เห็นเลย
  const ขาดตาราง = changes.count === null
    || [changes.error, pendingRes.error].some(e => e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? "")));
  if (ขาดตาราง) throw new ยังไม่ได้ติดตั้ง("ยังไม่ได้ติดตั้งตารางบัญชีดีลเลอร์ในฐานข้อมูล (migration 0165) — รัน npx supabase db push ก่อน");
  const { count } = changes;
  const pending = pendingRes.data;
  return {
    email,
    selfChangesUsed: count ?? 0,
    selfChangesLimit: SELF_LIMIT,
    pending: pending ? {
      id: String(pending.id), dealerCode, kind: pending.kind,
      newEmail: pending.new_email ?? undefined, status: "pending" as const,
      requestedAt: String(pending.requested_at),
    } : null,
    lastRejected,
  };
}

// ── สถานะบัญชีของสาขาที่ล็อกอินอยู่ (อีเมล · โควตาที่เหลือ · คำขอที่ค้าง · ต้องตั้งรหัสครั้งแรกไหม) ──
export const GET = withErrors("dealer-account-state", async (req: NextRequest) => {
  const who = await ดีลเลอร์ที่เรียก(req);
  if (!who.ok) return who.res;
  const { admin, dealerCode, email, mustChangePassword, mustVerifyEmail, userId } = who.who;
  // อีเมลติดต่อ (ด่าน 1): อ่านพลาดไม่ทำให้สถานะบัญชีทั้งก้อนล้ม — ถือว่ายังไม่ยืนยัน แถบเตือนขึ้นแทน
  //   เริ่มอ่านพร้อมกับสรุปสถานะ ไม่ต่อคิว — ทุกหน้าของดีลเลอร์รอคำตอบนี้ก่อนแสดงเนื้อหา (ด่านตั้งรหัสครั้งแรก)
  const ติดต่อP = สถานะอีเมลติดต่อ(admin, userId).catch(e => { console.error("[account] อ่านอีเมลติดต่อไม่สำเร็จ", e); return { contactEmail: "", contactEmailVerified: false }; });

  // เส้นทางนี้คืนแค่สถานะ (อีเมล · โควตา · คำขอค้าง · คำขอล่าสุดที่ถูกปฏิเสธ) ไม่คืนรหัสผ่าน
  //   ดีลเลอร์ดูรหัสของตัวเองได้ที่ /api/account/reveal (ต้องยืนยันเลขทางอีเมล · บอสสั่ง 1 ก.ย. 69)
  //   mustChangePassword ต้องมาก่อนเสมอ แม้ตารางโควตายังไม่ได้ติดตั้ง — หน้าตั้งรหัสครั้งแรกอ่านค่านี้
  try {
    const [สรุป, ติดต่อ] = await Promise.all([สรุปสถานะ(admin, dealerCode, email), ติดต่อP]);
    return json(req, { ...สรุป, mustChangePassword, mustVerifyEmail, ...ติดต่อ });
  } catch (e) {
    if (e instanceof ยังไม่ได้ติดตั้ง) return json(req, { error: e.message, mustChangePassword, mustVerifyEmail, ...(await ติดต่อP) }, 501);
    throw e;
  }
});

// ── ตั้งรหัสผ่านใหม่ตอนเข้าระบบครั้งแรก (บอสสั่ง 15 ก.ย. 69: "เปลี่ยนฟรี ไม่รวม 2 ครั้งนั้น") ──
//   ใช้ได้ครั้งเดียวต่อบัญชีที่ HQ สร้างให้ · ไม่ต้องกรอกรหัสปัจจุบัน (เพิ่งเข้าระบบด้วยรหัสนั้นมา)
//   บันทึกประวัติแบบ by_self=false (ไม่นับสิทธิ์) · เก็บสำเนาให้ HQ ดูได้ · ปลดเครื่องหมายบังคับ
async function ตั้งรหัสครั้งแรก(req: NextRequest, who: ผู้เรียก, รหัสใหม่: string): Promise<NextResponse> {
  const { admin, userId, email, dealerCode, name, appMeta, mustChangePassword } = who;
  if (!mustChangePassword) {
    return json(req, { error: "บัญชีนี้ตั้งรหัสผ่านครั้งแรกไปแล้ว — เปลี่ยนรหัสได้ที่ ตั้งค่า › บัญชีเข้าสู่ระบบ" }, 409);
  }
  const ผิดกติกา = ตรวจรหัสผ่านใหม่(รหัสใหม่);
  if (ผิดกติกา) return json(req, { error: ผิดกติกา }, 400);
  // รหัสใหม่ต้องไม่ใช่รหัสที่ได้รับจาก HQ — ไม่งั้นการบังคับตั้งรหัสไม่มีความหมาย
  if ((await รหัสผ่านยังเข้าระบบได้(email, รหัสใหม่)) === true) {
    return json(req, { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสที่ได้รับจากสำนักงานใหญ่" }, 400);
  }
  const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
    password: รหัสใหม่,
    app_metadata: { ...appMeta, must_change_password: false },
  });
  if (upErr) {
    console.error(`[account] ตั้งรหัสครั้งแรกของสาขา ${dealerCode} ไม่สำเร็จ`, upErr);
    return json(req, { error: "ตั้งรหัสผ่านไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503);
  }
  if (dealerSecretReady()) {
    const secret = encryptSecret(รหัสใหม่);
    if (secret) {
      const { error } = await admin.from("dealer_login_secrets")
        .upsert({ dealer_code: dealerCode, secret, updated_at: new Date().toISOString(), updated_by: `${name} (ตั้งตอนเข้าระบบครั้งแรก)` });
      if (error) console.error(`[account] เก็บสำเนารหัสครั้งแรกของ ${dealerCode} ไม่สำเร็จ`, error);
    }
  }
  const { error: logErr } = await admin.from("dealer_account_changes")
    .insert({ dealer_code: dealerCode, kind: "password", by_self: false });
  if (logErr && logErr.code !== "42P01") console.error(`[account] บันทึกการตั้งรหัสครั้งแรกของ ${dealerCode} ไม่สำเร็จ`, logErr);
  await auditLog(admin, { name, role: "DEALER" }, "ดีลเลอร์ตั้งรหัสผ่านใหม่ตอนเข้าระบบครั้งแรก", dealerCode);
  return json(req, { message: "ตั้งรหัสผ่านใหม่แล้ว — กำลังพาไปเข้าสู่ระบบด้วยรหัสใหม่" });
}

// ── ขอเปลี่ยนอีเมล/รหัสผ่านของตัวเอง ──
export const POST = withErrors("dealer-account-change", async (req: NextRequest) => {
  const who = await ดีลเลอร์ที่เรียก(req);
  if (!who.ok) return who.res;
  const { admin, userId, email: อีเมลเดิม, dealerCode, name } = who.who;

  if (!(await checkRateLimit(admin, `dealer-account-change:${userId}`, 5, 300))) {
    return json(req, { error: "เปลี่ยนบัญชีถี่เกินไป — รอสักครู่แล้วลองใหม่" }, 429);
  }

  const body = (await req.json().catch(() => null)) as null | { op?: string; email?: string; password?: string; currentPassword?: string; code?: string };
  if (body?.op === "first-password") return ตั้งรหัสครั้งแรก(req, who.who, String(body.password ?? ""));
  // ── อีเมลติดต่อ (ด่าน 1 · ใบ 0194): ส่งโค้ด / ยืนยันโค้ด — ไม่ต้องกรอกรหัสผ่านปัจจุบัน (ไม่ใช่อีเมลเข้าระบบ) ──
  if (body?.op === "contact-email-send") {
    const r = await ส่งโค้ดยืนยันอีเมล(admin, who.who, String(body.email ?? ""));
    if (!r.ok) return json(req, { error: r.error }, r.status);
    await auditLog(admin, { name, role: "DEALER" }, "ดีลเลอร์ขอโค้ดยืนยันอีเมลติดต่อ", `${dealerCode} · ${r.sentTo}`);
    return json(req, { sentTo: r.sentTo });
  }
  if (body?.op === "contact-email-verify") {
    const r = await ยืนยันโค้ดอีเมล(admin, who.who, String(body.code ?? ""));
    if (!r.ok) return json(req, { error: r.error }, r.status);
    await auditLog(admin, { name, role: "DEALER" }, "ดีลเลอร์ยืนยันอีเมลติดต่อ", dealerCode);
    return json(req, { verified: true });
  }

  const อีเมลที่ส่ง = String(body?.email ?? "").trim().toLowerCase();
  const รหัสใหม่ = String(body?.password ?? "");
  const รหัสเดิม = String(body?.currentPassword ?? "");
  // อีเมลใหม่ = อีเมลเดิม ไม่ใช่การเปลี่ยน — เดิมหน้าจอกันไว้อย่างเดียว ยิงตรงแล้วกินโควตาไป 1 ครั้งฟรี ๆ
  const อีเมลเดิมเป๊ะ = !!อีเมลที่ส่ง && อีเมลที่ส่ง === อีเมลเดิม.trim().toLowerCase();
  if (อีเมลเดิมเป๊ะ && !รหัสใหม่) return json(req, { error: "อีเมลนี้เป็นอีเมลเข้าระบบเดิมอยู่แล้ว" }, 400);
  const อีเมลใหม่ = อีเมลเดิมเป๊ะ ? "" : อีเมลที่ส่ง;
  if (!อีเมลใหม่ && !รหัสใหม่) return json(req, { error: "ยังไม่ได้กรอกอีเมลหรือรหัสผ่านใหม่" }, 400);
  if (อีเมลใหม่ && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(อีเมลใหม่)) return json(req, { error: "รูปแบบอีเมลไม่ถูกต้อง" }, 400);
  // กติการหัสผ่านชุดเดียวทั้งระบบ (ยาว ≥ 8 · ห้ามช่องว่าง) — ใช้ทั้งตอนมีผลทันทีและตอนเก็บเป็นคำขอ
  const ผิดกติกา = รหัสใหม่ ? ตรวจรหัสผ่านใหม่(รหัสใหม่) : null;
  if (ผิดกติกา) return json(req, { error: ผิดกติกา }, 400);
  if (!รหัสเดิม) return json(req, { error: "ต้องกรอกรหัสผ่านปัจจุบันเพื่อยืนยันตัวตน" }, 400);
  if (!(await รหัสปัจจุบันถูกไหม(อีเมลเดิม, รหัสเดิม))) {
    return json(req, { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" }, 400);
  }

  const kind = อีเมลใหม่ && รหัสใหม่ ? "both" : (อีเมลใหม่ ? "email" : "password");
  let สถานะ;
  try {
    สถานะ = await สรุปสถานะ(admin, dealerCode, อีเมลเดิม);
  } catch (e) {
    if (e instanceof ยังไม่ได้ติดตั้ง) return json(req, { error: e.message }, 501);
    throw e;
  }
  if (สถานะ.pending) {
    return json(req, { error: "มีคำขอที่รอสำนักงานใหญ่อนุมัติอยู่แล้ว — รอผลก่อนส่งคำขอใหม่" }, 409);
  }

  // ถามก่อนว่าอีเมลใหม่มีคนใช้อยู่ไหม — ทั้งตอนมีผลทันทีและตอนจะเก็บเป็นคำขอ
  //   เดิมตรวจเฉพาะตอนมีผลทันที: คำขอที่ใช้อีเมลซ้ำจึงรอสำนักงานใหญ่อนุมัติไปเปล่า ๆ แล้วค่อยพังตอนกดอนุมัติ
  //   ระบบยืนยันตัวตนตอบกรณีซ้ำเป็น 500 เนื้อความว่าง ถ้าไม่ถามก่อนผู้ใช้จะได้ "ลองใหม่อีกครั้ง" ที่ลองกี่ครั้งก็ไม่สำเร็จ
  if (อีเมลใหม่ && (await อีเมลถูกใช้แล้ว(SUPABASE_URL, SERVICE_KEY, อีเมลใหม่, userId)) === true) {
    return json(req, { error: `อีเมล ${อีเมลใหม่} ถูกใช้ไปแล้วในระบบ — กรุณาใช้อีเมลอื่น` }, 400);
  }

  // ── เกินโควตา → เก็บเป็นคำขอ ยังไม่แตะบัญชีจริง ──
  if (สถานะ.selfChangesUsed >= SELF_LIMIT) {
    if (รหัสใหม่ && !dealerSecretReady()) {
      return json(req, { error: "เซิร์ฟเวอร์ยังไม่พร้อมรับคำขอเปลี่ยนรหัสผ่าน — ติดต่อผู้ดูแลระบบ" }, 501);
    }
    const { error } = await admin.from("dealer_account_requests").insert({
      dealer_code: dealerCode, kind,
      new_email: อีเมลใหม่ || null,
      secret: รหัสใหม่ ? encryptSecret(รหัสใหม่) : null,
    });
    if (error) {
      console.error(`[account] เปิดคำขอของสาขา ${dealerCode} ไม่สำเร็จ`, error);
      return json(req, { error: "ส่งคำขอไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503);
    }
    await auditLog(admin, { name, role: "DEALER" }, "ดีลเลอร์ขอเปลี่ยนบัญชีเข้าระบบ", `${dealerCode}${อีเมลใหม่ ? ` · ${อีเมลใหม่}` : ""}`);
    return json(req, {
      applied: false, pending: true,
      message: "ใช้สิทธิ์แก้เองครบแล้ว — ส่งคำขอให้สำนักงานใหญ่อนุมัติแล้ว การเปลี่ยนจะมีผลเมื่อได้รับอนุมัติ",
    });
  }

  // ── ยังมีโควตา → เปลี่ยนให้ทันที (อีเมลซ้ำตรวจไปแล้วด้านบน) ──
  const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
    ...(รหัสใหม่ ? { password: รหัสใหม่ } : {}),
    ...(อีเมลใหม่ ? { email: อีเมลใหม่, email_confirm: true } : {}),
  });
  if (upErr) {
    if (/already|registered|exists/i.test(upErr.message ?? "")) {
      return json(req, { error: `อีเมล ${อีเมลใหม่} ถูกใช้ไปแล้วในระบบ` }, 400);
    }
    console.error(`[account] เปลี่ยนบัญชีของสาขา ${dealerCode} ไม่สำเร็จ`, upErr);
    return json(req, { error: "เปลี่ยนบัญชีไม่สำเร็จชั่วคราว — ลองใหม่อีกครั้ง" }, 503);
  }

  // เก็บสำเนารหัสให้สำนักงานใหญ่เปิดดูได้ (ที่เดียวกับรหัสที่ HQ ตั้งให้)
  if (รหัสใหม่ && dealerSecretReady()) {
    const secret = encryptSecret(รหัสใหม่);
    if (secret) {
      const { error } = await admin.from("dealer_login_secrets")
        .upsert({ dealer_code: dealerCode, secret, updated_at: new Date().toISOString(), updated_by: `${name} (ดีลเลอร์ตั้งเอง)` });
      if (error) console.error(`[account] เก็บสำเนารหัสของ ${dealerCode} ไม่สำเร็จ`, error);
    }
  }
  const { error: logErr } = await admin.from("dealer_account_changes").insert({
    dealer_code: dealerCode, kind, old_email: อีเมลเดิม, new_email: อีเมลใหม่ || null, by_self: true,
  });
  if (logErr) console.error(`[account] บันทึกการเปลี่ยนของ ${dealerCode} ไม่สำเร็จ`, logErr);

  await auditLog(admin, { name, role: "DEALER" },
    kind === "email" ? "ดีลเลอร์เปลี่ยนอีเมลเข้าระบบเอง" : kind === "password" ? "ดีลเลอร์เปลี่ยนรหัสผ่านเอง" : "ดีลเลอร์เปลี่ยนอีเมลและรหัสผ่านเอง",
    `${dealerCode}${อีเมลใหม่ ? ` · ${อีเมลใหม่}` : ""}`);

  const เหลือ = Math.max(0, SELF_LIMIT - สถานะ.selfChangesUsed - 1);
  return json(req, {
    applied: true, pending: false,
    message: `เปลี่ยนเรียบร้อย — เหลือสิทธิ์แก้เองอีก ${เหลือ} ครั้ง · สำนักงานใหญ่จะเห็นการเปลี่ยนนี้`,
  });
});
