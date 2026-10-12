"use client";

// ชั้น AUTH ฝั่ง Supabase (Phase 0) — เชื่อม Supabase Auth จริง
//   signInWithPassword · signOut · restore session · onAuthStateChange
// อ่าน dealer_code / user_role จาก JWT claims (ใส่โดย custom_access_token_hook ที่ DB)
// แล้วปั้นเป็น MockSession รูปเดียวกับโหมด local → RoleContext ใช้ร่วมกันได้ทั้งสองโหมด
import type { Session } from "@supabase/supabase-js";
import { getSupabase, hasStoredSession } from "./data/supabase/client";
import type { AuthResult } from "./auth";
import { friendlyError } from "./friendlyError";
import type { MockSession, UserRole } from "./mock";
import { HQ_ROLES } from "./permissions";
import { logRepoRead } from "./repoLog";
import { DATA_SOURCE } from "./data/config";
import { caAdoptTokens } from "./cookieAuth";

const isHQRole = (r: UserRole): boolean => HQ_ROLES.includes(r);

const ERR_GENERIC = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";

// decode payload (ส่วนกลาง) ของ JWT แบบ base64url → UTF-8 ปลอดภัย (รองรับอักขระไทยใน claims)
function decodeClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    let json: string;
    if (typeof atob === "function") {
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      json = new TextDecoder().decode(bytes);
    } else {
      json = Buffer.from(b64, "base64").toString("utf8");
    }
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// JWT (access_token) → MockSession · dealer_code ว่าง = HQ (เห็นทั้งเครือ)
// โทเค็นเพี้ยน/ไม่ใช่ JWT/ไม่มี custom claim ที่ custom_access_token_hook ใส่ให้เลย → คืน null (ห้ามเดาเป็น HQ)
//   เดิม decode พังแล้วได้ {} → dealer_code default เป็น "" → ตีความเป็น HQ เสมอ (Medium, พบจากผลตรวจสอบ 30 ก.ค. 69)
//   RLS ฝั่ง DB ยังกันข้อมูลจริงไว้อยู่แล้ว แต่ UI ไม่ควรเปิดเปลือก HQ ให้บัญชีสิทธิ์ต่ำเห็นเลยตั้งแต่แรก
function sessionFromToken(accessToken: string, email: string): MockSession | null {
  const c = decodeClaims(accessToken);
  if (typeof c.user_role !== "string") return null;
  const role = c.user_role as UserRole;
  const dealerCode = typeof c.dealer_code === "string" ? c.dealer_code : "";
  const hq = isHQRole(role) || dealerCode === "";
  return {
    name: email,                                    // ชื่อจริงเติมทีหลังจาก profiles.name
    role,
    dealerName: hq ? "Benjamin HQ" : dealerCode,    // ชื่อสาขาจริงเติมทีหลังจาก dealers.name
    dealerCode,
    scopeAll: hq,
  };
}

// JWT พก dealer_code/role มาให้ แต่ไม่มี "ชื่อ" — ต้องอ่านจากตารางเอง
// ไม่งั้นหน้าจอโชว์ "cnx@dealer.com" แทนชื่อคน และ "CNX" แทน "บจ. เชียงใหม่สตีลบิลด์"
// อ่านไม่ได้ (เน็ต/RLS) → คงค่าเดิมไว้ ดีกว่าล็อกอินไม่ผ่านเพราะเรื่องชื่อ
async function withNames(base: MockSession, userId: string): Promise<MockSession> {
  const sb = getSupabase();
  const out = { ...base };
  // ใช้ user id จาก JWT (claim sub) — ห้ามเรียก auth.getUser() เพราะเป็นคำขอเครือข่ายเพิ่มอีกหนึ่ง
  // ที่ถูกยกเลิกเมื่อผู้ใช้เปลี่ยนหน้าระหว่างรอ แล้วโผล่เป็น console error "Failed to fetch"
  if (userId) {
    try {
      const { data } = await sb.from("profiles").select("name").eq("id", userId).maybeSingle();
      const n = (data as { name?: string } | null)?.name?.trim();
      if (n) out.name = n;
    } catch { /* คงอีเมลไว้ */ }
  }
  if (!out.scopeAll && base.dealerCode) {
    // อ่านผ่านวิว dealers_directory — มุมมองเดียวกับที่ stillValid ใช้ และเลี่ยงคอลัมน์ที่ถูกตัดสิทธิ์ไว้ (revenue_target · migration 0090)
    //   ⚠️ สำคัญกว่าคือ "ต้องบันทึกเมื่ออ่านไม่สำเร็จ" — เดิม catch ทิ้งเงียบ ๆ แล้วตกกลับไปใช้ "รหัสสาขา" เป็นชื่อ
    //     ผู้ใช้แจ้ง (18 ส.ค. 69) ว่าแถบบน/เมนูซ้ายขึ้นรหัสสาขาแทนชื่อบริษัท — ทำซ้ำในเครื่องทดสอบไม่ได้
    //     ถ้ามี log ตั้งแต่แรก จะรู้ทันทีว่าคำสั่งนี้พลาด แทนที่จะต้องมานั่งเดา
    try {
      const { data, error } = await sb.from("dealers_directory").select("name").eq("code", base.dealerCode).maybeSingle();
      if (error) logRepoRead("auth.dealerName", error);
      const n = (data as { name?: string } | null)?.name?.trim();
      if (n) out.dealerName = n;
    } catch (e) { logRepoRead("auth.dealerName", e); }
  }
  return out;
}

// ── ใบผ่านยังใช้ได้จริงไหม (ไม่ใช่แค่ "ลายเซ็นยังไม่หมดอายุ") ────────────────────
//
// บั๊กจริงที่ผู้ใช้แจ้ง 14 ส.ค. 69: สำนักงานใหญ่ลบสาขาไปแล้ว (ทะเบียน + บัญชีเข้าระบบหายจริง)
//   แต่เบราว์เซอร์ที่ยังถือ JWT ใบเดิมอยู่ยังเปิดหน้าในระบบได้ต่อจนกว่าใบจะหมดอายุ (นานถึง 1 ชม.)
//   ทุกคำขอข้อมูลถูกฐานข้อมูลปฏิเสธหมด หน้าจอจึงว่างเปล่า — ผู้ใช้เห็นเป็น "ระบบพัง" ไม่ใช่ "ถูกลบสิทธิ์"
//   ต้นเหตุ: การฟื้น session อ่านจากใบผ่านในเครื่องอย่างเดียว ไม่เคยถามว่าบัญชี/สาขายังมีอยู่ไหม
//
// เรื่องเดียวกันกับ "ปิดใช้งาน" (ผู้ใช้แจ้ง 14 ส.ค. 69): ปิดสาขาแล้ว "ล็อกอินใหม่เข้าไม่ได้" จริง
//   (ด่านที่ฐานข้อมูล 0032 ไม่ออกใบผ่านให้) แต่คนที่เปิดหน้าค้างอยู่ยังใช้งานต่อได้จนใบหมดอายุ
//   → ต้องตรวจ "สถานะ" ด้วย ไม่ใช่แค่ "ยังมีอยู่ไหม"
//
// กติกา: "อ่านสำเร็จแต่ไม่มีแถว" = ถูกลบไปแล้ว · "มีแถวแต่ status ไม่ใช่ active" = ถูกปิดใช้งาน
//   ทั้งสองกรณีใช้ต่อไม่ได้
//   · โปรไฟล์ของตัวเองอ่านได้เสมอตามสิทธิ์ (profiles_read: id = auth.uid()) — ไม่มีแถว = บัญชีถูกลบ
//   · ทะเบียนสาขาอ่านได้ทุกคนที่ล็อกอิน — ไม่มีแถว = สาขาถูกลบ
// ⚠️ "อ่านไม่ได้" (เน็ตล่ม/เซิร์ฟเวอร์ล่ม) ต้องไม่ถือว่าถูกลบ ไม่งั้นเน็ตกระตุกทีเดียวเด้งผู้ใช้ออกทั้งระบบ
// ⚠️ status ที่อ่านไม่ออก/ไม่มีค่า ให้ถือว่าใช้งานได้ — ระบบเก่าบางแถวไม่มีค่านี้ ห้ามเด้งคนออกเพราะข้อมูลเก่า
async function stillValid(base: MockSession, userId: string): Promise<boolean> {
  const sb = getSupabase();
  const disabled = (s: unknown) => typeof s === "string" && s.trim() !== "" && s !== "active";
  if (userId) {
    try {
      const { data, error } = await sb.from("profiles").select("id,status").eq("id", userId).maybeSingle();
      if (error) logRepoRead("auth.checkProfile", error);              // อ่านไม่ได้ต้องรู้ ไม่ใช่กลืนเงียบ
      if (!error && !data) return false;                               // ไม่มีโปรไฟล์แล้ว = บัญชีถูกลบ
      if (!error && disabled((data as { status?: string } | null)?.status)) return false;  // บัญชีถูกปิดใช้งาน
    } catch (e) { logRepoRead("auth.checkProfile", e); }
  }
  if (!base.scopeAll && base.dealerCode) {
    try {
      // ⚠️ ต้องอ่านผ่าน view dealers_directory เท่านั้น — ตาราง dealers ถูกถอนสิทธิ์อ่าน
      //    ออกจาก authenticated ไปแล้ว (0090) ยิงตรงจะถูกปฏิเสธทุกครั้ง แล้วการตรวจนี้
      //    จะกลายเป็นโค้ดตายที่ "ไม่เคยจับอะไรได้เลย" โดยไม่มีอะไรฟ้อง (เจอจริง 14 ส.ค. 69)
      const { data, error } = await sb.from("dealers_directory").select("code,status").eq("code", base.dealerCode).maybeSingle();
      if (error) logRepoRead("auth.checkDealer", error);
      if (!error && !data) return false;                               // ไม่มีสาขาแล้ว = สาขาถูกลบ
      if (!error && disabled((data as { status?: string } | null)?.status)) return false;  // สาขาถูกปิดใช้งาน
    } catch (e) { logRepoRead("auth.checkDealer", e); }
  }
  return true;
}

/** เข้าสู่ระบบด้วยอีเมล/รหัสผ่านจริง (Supabase Auth) */
export async function sbSignIn(email: string, password: string): Promise<AuthResult> {
  localSignInAt = Date.now();   // บอกตัวกันสลับบัญชีว่าครั้งนี้แท็บนี้กดเอง อย่าสั่งโหลดหน้าใหม่
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  // Supabase คืนข้อความอังกฤษดิบ ("Invalid login credentials") — แปลกรณีนี้เป็นไทยให้ตรงกับ UI ที่เหลือ
  // (เจอจากทดสอบ QA: กรอกรหัสผิดแล้วขึ้นข้อความอังกฤษปนอยู่กลางฟอร์มภาษาไทยทั้งหน้า)
  if (error || !data.session) {
    const raw = error?.message ?? "";
    const msg = /invalid login credentials/i.test(raw) ? ERR_GENERIC : (raw || ERR_GENERIC);
    return { ok: false, error: msg };
  }
  // คืน session ทันที ไม่รอ query ชื่อ — ไม่งั้นทุกหน้าหลังล็อกอินช้าขึ้นเพราะรอ 2 คำขอ
  // ชื่อจริงมาทีหลังผ่าน sbOnChange (RoleContext อัปเดต session ให้เอง)
  const session = sessionFromToken(data.session.access_token, data.user?.email ?? email);
  if (!session) return { ok: false, error: ERR_GENERIC };
  // บัญชีที่สาขาถูกลบไปแล้วแต่บัญชีเข้าระบบยังค้าง (route ลบสาขาเตือนกรณีนี้ไว้เอง) ต้องเข้าไม่ได้
  // ไม่งั้นล็อกอินผ่านแล้วเจอหน้าจอเปล่าเพราะฐานข้อมูลปฏิเสธทุกคำขอ — ผู้ใช้ไม่รู้ว่าเกิดอะไรขึ้น
  if (!(await stillValid(session, data.user?.id ?? ""))) {
    await sbSignOutLocal();
    return { ok: false, error: "บัญชีนี้ถูกปิดการใช้งานแล้ว — ติดต่อสำนักงานใหญ่" };
  }
  return { ok: true, session };
}

/** ออกจากระบบ (ล้าง session ฝั่ง Supabase) */
export async function sbSignOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

/** ล้าง session เฉพาะในเครื่อง — ใช้ตอนใบผ่าน "ตายไปแล้ว" ตั้งแต่ก่อนกดออก
 *  บัญชีที่ไม่มีอยู่แล้วสั่งออกจากระบบที่เซิร์ฟเวอร์ไม่ได้ (ตอบ 403) แล้วโผล่เป็น error แดงในคอนโซล
 *  ทั้งที่เป็นสถานการณ์ที่เราตั้งใจจัดการอยู่ — ล้างในเครื่องอย่างเดียวก็พอ ใบผ่านตายไปพร้อมบัญชีแล้ว
 *  อีกกรณีที่ต้องใช้ (1 ก.ย. 69): ดีลเลอร์เปลี่ยนรหัสผ่านตัวเองสำเร็จ → ระบบยืนยันตัวตนยกเลิกใบผ่านทันที
 *  สั่ง signOut ปกติจะได้ 403 แล้ว "ไม่ได้ล้างของในเครื่อง" → เดินกลับเข้าหน้าเดิมได้ทั้งที่ใบผ่านตายแล้ว */
export async function sbSignOutLocal(): Promise<void> {
  try { await getSupabase().auth.signOut({ scope: "local" }); } catch { /* ล้างไม่ได้ก็ยังต้องเด้งออก */ }
}

/** ผลของการฟื้น session
 *   session — ล็อกอินอยู่
 *   "ออกแล้ว" — ไม่ได้ล็อกอินจริง ๆ (ไม่มีใบผ่าน/ใบผ่านตายแล้ว/บัญชีถูกปิด) → พาไปหน้าเข้าสู่ระบบได้
 *   "ยังไม่รู้" — ถามไม่สำเร็จชั่วคราว (เน็ตสะดุด/เซิร์ฟเวอร์ตอบช้า) → **ห้ามเตะออก** ให้รอแล้วลองใหม่ */
export type RestoreResult = MockSession | "ออกแล้ว" | "ยังไม่รู้";

/** เก็บใบผ่านไว้ในเครื่องอยู่ไหม — ใช้แยก "ยังไม่ได้ล็อกอิน" ออกจาก "ล็อกอินอยู่แต่ถามไม่สำเร็จ" */
export { hasStoredSession };

/** ฟื้น session แบบไม่เตะผู้ใช้ออกเพราะเรื่องชั่วคราว (บอสสั่ง 20 ส.ค. 69)
 *
 *  กติกา: เข้าระบบแล้วต้องอยู่ต่อไปจนกว่าจะกดออกเอง ไม่ว่าจะทำอะไร
 *  ของเดิมถามครั้งเดียว ถ้าไม่ได้คำตอบก็ถือว่า "ไม่ได้ล็อกอิน" แล้วเด้งไปหน้าเข้าสู่ระบบทันที
 *  เน็ตสะดุดแวบเดียว ปิดฝาโน้ตบุ๊กแล้วเปิด หรือสัญญาณหลุดตอนโหลดหน้า = โดนเตะออกทั้งที่ใบผ่านยังอยู่ครบ
 *
 *  ⚠️ และของเดิม "อ่านใบไม่ออก = สั่งออกจากระบบ" ซึ่งลบกุญแจต่ออายุทิ้งด้วย
 *     พอลบแล้วต่ออายุไม่ได้อีกเลย ต้องพิมพ์รหัสผ่านใหม่สถานเดียว — แรงเกินกว่าเหตุมาก
 *     ตอนนี้ลองต่ออายุก่อนเสมอ จะออกจากระบบก็ต่อเมื่อกุญแจต่ออายุตายจริง ๆ */
export async function sbRestoreSafe(): Promise<RestoreResult> {
  let s: Session | null = null;
  try {
    const { data, error } = await getSupabase().auth.getSession();
    if (error) return "ยังไม่รู้";          // ถามไม่ได้ ≠ ไม่ได้ล็อกอิน
    s = data.session;
  } catch { return "ยังไม่รู้"; }            // เน็ตหลุดกลางคัน

  // ไม่มีใบผ่านในเครื่องเลย = ยังไม่เคยล็อกอิน (หรือกดออกไปแล้ว) — อันนี้เตะออกได้
  if (!s) return hasStoredSession() ? "ยังไม่รู้" : "ออกแล้ว";

  let session = sessionFromToken(s.access_token, s.user?.email ?? "");
  if (!session) {
    // ใบผ่านอ่านไม่ออก — ลองขอใบใหม่ด้วยกุญแจต่ออายุก่อน (ส่วนใหญ่แค่ใบเก่าค้าง)
    try {
      const { data, error } = await getSupabase().auth.refreshSession();
      if (error || !data.session) return "ยังไม่รู้";   // ต่อไม่ได้ตอนนี้ ≠ ตายถาวร
      s = data.session;
      session = sessionFromToken(s.access_token, s.user?.email ?? "");
    } catch { return "ยังไม่รู้"; }
    // ต่ออายุแล้วยังอ่านไม่ออก = ใบผ่านเสียจริง (คนละสคีมา/ถูกแก้เอง) → ล้างทิ้งได้
    if (!session) { await sbSignOut(); return "ออกแล้ว"; }
  }

  const uid = (decodeClaims(s.access_token).sub as string) ?? "";
  // สาขา/บัญชีถูกลบหรือถูกปิด = เหตุผลที่ "ถูกต้อง" ที่จะออกจากระบบ (stillValid คืน true เมื่ออ่านไม่ได้)
  if (!(await stillValid(session, uid))) { await sbSignOutLocal(); return "ออกแล้ว"; }
  return await withNames(session, uid);
}

/** ฟื้น session ตอนโหลดหน้าใหม่ — คืน MockSession ถ้ายังล็อกอินอยู่ ไม่งั้น null
 *  (รูปแบบเดิม เก็บไว้ให้ผู้เรียกที่ไม่ต้องแยก "ยังไม่รู้" · ตัวที่ควรใช้คือ sbRestoreSafe) */
export async function sbRestore(): Promise<MockSession | null> {
  const r = await sbRestoreSafe();
  return typeof r === "string" ? null : r;
}


// ── H4 · รีเซ็ตรหัสผ่านด้วย "ลิงก์ทางอีเมล" (ไม่ต้องใช้ service_role) ──────────────
// ผู้ดูแลกดรีเซ็ต → ระบบส่งลิงก์ไปที่อีเมลล็อกอินของผู้ใช้ → ผู้ใช้กดลิงก์แล้วตั้งรหัสเอง
// ปลอดภัยกว่าการออกรหัสชั่วคราว (ไม่มีใครเห็น/ถือรหัสของคนอื่น) และทำจากฝั่ง client ได้
// เดิม (บั๊ก H4): สร้างสตริงรหัสปลอมแล้วโชว์ให้ก๊อป — ไม่เคยส่งไปที่ระบบยืนยันตัวตนเลย ล็อกอินไม่ได้
export type ResetResult = { ok: true } | { ok: false; error: string };

/** ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมล · redirect กลับมาหน้า /reset-password ของแอปเดียวกัน */
export async function sbSendPasswordReset(email: string): Promise<ResetResult> {
  const e = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, error: "อีเมลไม่ถูกต้อง" };
  try {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { error } = await getSupabase().auth.resetPasswordForEmail(e, { redirectTo });
    // Supabase ตอบสำเร็จเสมอแม้ไม่พบอีเมล (กัน user enumeration) — ถือว่าส่งแล้ว
    if (error) {
      // ⚠️ สองกรณีนี้ต้องบอกสาเหตุจริง ไม่ใช่ "เกิดข้อผิดพลาด ลองใหม่" (ลองใหม่กี่ครั้งก็ไม่หาย)
      //    เจอจริงตอนต่อฟีเจอร์ลืมรหัสผ่านฝั่งดีลเลอร์: บัญชีเดโมใช้โดเมนที่ไม่มีจริง
      //    ระบบอีเมลจึงปฏิเสธ แล้วหน้าจอขึ้นข้อความกลาง ๆ จนไล่สาเหตุไม่ถูก
      const msg = String(error.message ?? "");
      if (/invalid/i.test(msg) && /email/i.test(msg)) {
        return { ok: false, error: `ส่งลิงก์ไปที่ ${e} ไม่ได้ — อีเมลนี้ใช้ส่งจริงไม่ได้ (โดเมนไม่มีอยู่จริง) กรุณาแจ้งสำนักงานใหญ่ให้แก้อีเมลเข้าระบบของสาขา` };
      }
      if (/rate|too many|429/i.test(msg)) {
        return { ok: false, error: "ขอลิงก์ถี่เกินไป — รอสัก 1 นาทีแล้วลองใหม่" };
      }
      return { ok: false, error: friendlyError(error) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

// ── ลืมรหัสผ่านแบบ "กรอกเลขยืนยัน" (บอสสั่ง 1 ก.ย. 69) ───────────────────────────
//
// ทางเดิมคือกดลิงก์ในอีเมล ซึ่งต้องไปตั้ง "ที่อยู่ปลายทางที่อนุญาต" ที่หน้าจัดการโปรเจกต์ก่อน
//   ไม่ตั้ง = กดลิงก์แล้วไปโผล่หน้าเปล่า (บอสเจอจริง) และเป็นขั้นตอนที่คนต้องจำไปตั้งเอง
//
// ทางนี้ใช้ "เลขยืนยันที่ส่งไปกับอีเมลฉบับเดียวกัน" แล้วกรอกกลับมาที่หน้าเข้าสู่ระบบ
//   • ไม่ต้องพึ่งการเด้งข้ามเว็บเลย → ไม่เกี่ยวกับที่อยู่ปลายทางที่อนุญาตอีกต่อไป
//   • เป็นวิธีเดียวกับ "ดูรหัสผ่านของตัวเอง" ผู้ใช้จึงเจอขั้นตอนแบบเดียวกันทั้งสองเรื่อง
//
// รับได้ทั้งเลข 6 หลักและลิงก์ที่ก๊อปมาทั้งอัน — เพราะแม่แบบอีเมลมาตรฐานของผู้ให้บริการ
// มีแต่ลิงก์จนกว่าจะแก้แม่แบบให้ใส่ {{ .Token }} (ทำได้เมื่อตั้งระบบส่งอีเมลของตัวเองแล้ว)
export async function sbResetPasswordWithCode(
  email: string, codeOrLink: string, newPassword: string,
): Promise<ResetResult> {
  const e = email.trim().toLowerCase();
  const ที่กรอก = String(codeOrLink).trim();
  if (newPassword.length < 8) return { ok: false, error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };
  const เป็นลิงก์ = /^https?:\/\//i.test(ที่กรอก) || ที่กรอก.includes("token=");
  const เลข = ที่กรอก.replace(/\D/g, "");
  if (!เป็นลิงก์ && เลข.length < 6) return { ok: false, error: "กรอกเลขยืนยันที่ได้จากอีเมล หรือวางลิงก์จากอีเมล" };
  try {
    const sb = getSupabase();
    let token_hash = "";
    if (เป็นลิงก์) {
      try { token_hash = new URL(ที่กรอก).searchParams.get("token") ?? ""; }
      catch { token_hash = (ที่กรอก.split("token=")[1] ?? "").split("&")[0]; }
      if (!token_hash) return { ok: false, error: "ลิงก์ไม่ถูกต้อง — ก๊อปลิงก์จากอีเมลมาทั้งอัน" };
    }
    // ยืนยันตัวตนด้วยเลข/ลิงก์ก่อน → ได้ใบผ่านชั่วคราวสำหรับตั้งรหัสใหม่
    const { data, error } = เป็นลิงก์
      ? await sb.auth.verifyOtp({ token_hash, type: "recovery" })
      : await sb.auth.verifyOtp({ email: e, token: เลข, type: "recovery" });
    if (error || !data.session) {
      return { ok: false, error: "เลขยืนยันไม่ถูกต้องหรือหมดอายุแล้ว — กด \"ลืมรหัสผ่าน?\" ใหม่อีกครั้ง" };
    }
    const { error: upErr } = await sb.auth.updateUser({ password: newPassword });
    if (upErr) return { ok: false, error: friendlyError(upErr) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

// ── เข้าสู่ระบบด้วย "เลขยืนยันจากอีเมล" โดยไม่ต้องตั้งรหัสใหม่ (บอสสั่ง 2 ก.ย. 69) ────
//
// เดิม: ลืมรหัสผ่าน → กรอกเลข → บังคับตั้งรหัสใหม่สองช่องก่อนถึงจะเข้าได้
//   บอสสั่งตัดขั้นตอนนั้นออก — เอาเลขจากอีเมลมากรอกแล้วเข้าระบบได้เลย
//   (คนที่ลืมรหัสส่วนใหญ่แค่อยากเข้าไปทำงาน ไม่ได้อยากคิดรหัสใหม่ตอนนั้น
//    ถ้าอยากเปลี่ยนค่อยไปเปลี่ยนที่หน้าบัญชีของตัวเองทีหลัง)
//
// เลขที่ส่งมาเป็นของ resetPasswordForEmail จึงต้องยืนยันแบบ recovery
//   ยืนยันผ่าน = ได้ session จริงเลย (Supabase ออกใบผ่านให้ตั้งแต่ขั้นยืนยัน) — ไม่ต้องเรียก signIn ซ้ำ
//   โหมด api (ใบผ่านอยู่ใน cookie httpOnly) ต้องส่งใบผ่านให้เซิร์ฟเวอร์แลกเป็น cookie ต่อ
export async function sbLoginWithCode(email: string, codeOrLink: string): Promise<ResetResult> {
  const e = email.trim().toLowerCase();
  const ที่กรอก = String(codeOrLink).trim();
  const เป็นลิงก์ = /^https?:\/\//i.test(ที่กรอก) || ที่กรอก.includes("token=");
  const เลข = ที่กรอก.replace(/\D/g, "");
  if (!เป็นลิงก์ && เลข.length < 6) return { ok: false, error: "กรอกเลขยืนยันที่ได้จากอีเมล หรือวางลิงก์จากอีเมล" };
  try {
    const sb = getSupabase();
    let token_hash = "";
    if (เป็นลิงก์) {
      try { token_hash = new URL(ที่กรอก).searchParams.get("token") ?? ""; }
      catch { token_hash = (ที่กรอก.split("token=")[1] ?? "").split("&")[0]; }
      if (!token_hash) return { ok: false, error: "ลิงก์ไม่ถูกต้อง — ก๊อปลิงก์จากอีเมลมาทั้งอัน" };
    }
    const { data, error } = เป็นลิงก์
      ? await sb.auth.verifyOtp({ token_hash, type: "recovery" })
      : await sb.auth.verifyOtp({ email: e, token: เลข, type: "recovery" });
    if (error || !data.session) {
      return { ok: false, error: "เลขยืนยันไม่ถูกต้องหรือหมดอายุแล้ว — กด \"ลืมรหัสผ่าน?\" ใหม่อีกครั้ง" };
    }
    if (DATA_SOURCE === "api") {
      // หน้าเว็บถือ session เองไม่ได้ในโหมดนี้ — ต้องให้เซิร์ฟเวอร์ตั้ง cookie ให้
      const ok = await caAdoptTokens(data.session.access_token, data.session.refresh_token);
      if (!ok) return { ok: false, error: "เข้าสู่ระบบไม่สำเร็จ — ลองใหม่อีกครั้ง" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

/** ตั้งรหัสผ่านใหม่ของ "ผู้ใช้ปัจจุบัน" — ใช้ในหน้า /reset-password หลังกดลิงก์ (มี recovery session แล้ว) */
export async function sbUpdatePassword(newPassword: string): Promise<ResetResult> {
  if (newPassword.length < 8) return { ok: false, error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };
  try {
    const { error } = await getSupabase().auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyError(err) };
  }
}

// ── H3 · เปลี่ยนรหัสผ่านตัวเอง (จากหน้าโปรไฟล์ ขณะล็อกอินอยู่) ──────────────────────
// เดิม (บั๊ก H3): หน้าโปรไฟล์ตรวจความยาว/ความตรงกันแล้วขึ้น "เปลี่ยนแล้ว" ทันที
//   โดยไม่เคยเรียกระบบยืนยันตัวตนเลย → ล็อกอินด้วยรหัสใหม่ไม่ได้
// ปลอดภัยขึ้น: ยืนยัน "รหัสปัจจุบัน" ด้วยการ sign-in ซ้ำก่อน (กัน session ที่ถูกขโมยเปลี่ยนรหัสง่าย ๆ)
// แล้วค่อย updateUser · Supabase เองไม่บังคับรหัสเดิม เราจึงเช็กเองที่ชั้นนี้
export async function sbChangeOwnPassword(current: string, next: string): Promise<ResetResult> {
  if (next.length < 8) return { ok: false, error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" };
  const sb = getSupabase();
  const { data: sess } = await sb.auth.getSession();
  const email = sess.session?.user?.email;
  if (!email) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  // ยืนยันรหัสปัจจุบัน
  const { error: reauth } = await sb.auth.signInWithPassword({ email, password: current });
  if (reauth) return { ok: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  // ตั้งรหัสใหม่
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

// ── ตัวกันบัญชีปนกันข้ามแท็บ ──────────────────────────────────────────────────────
//
// ใบผ่านเข้าระบบเก็บใน localStorage = ทุกแท็บใช้ร่วมกัน (เพื่อให้เปิดแท็บใหม่แล้วไม่ต้องล็อกอินซ้ำ)
// ผลข้างเคียงที่ต้องกัน: ล็อกอินบัญชีอื่นในแท็บใหม่ แท็บเก่าจะได้ session ของบัญชีใหม่มาแทน
// ถ้าปล่อยให้ setSession เฉย ๆ แท็บเก่าจะเอาข้อมูลบัญชีใหม่มาปะทับหน้าจอที่ยังค้างของบัญชีเดิม
// (หัวจอเขียนสาขาหนึ่ง ตารางข้างล่างเป็นอีกสาขา) — เคยเจอจริงตอนทดสอบ QA
//
// โหลดหน้าใหม่ทั้งหน้าเมื่อ "คนที่ล็อกอินเปลี่ยนคน" เท่านั้น — ต่ออายุใบผ่านหรือรีเฟรชปกติ
// ผู้ใช้คนเดิม จึงไม่โดนโหลดใหม่ (เช็กที่ id ของผู้ใช้ ไม่ใช่ที่ตัวใบผ่านซึ่งเปลี่ยนทุก 10 นาที)
//
// ⚠️ ต้องยกเว้น "แท็บที่กดล็อกอินเอง" ด้วย ไม่งั้นเจอบั๊กนี้ (เจอตอนทดสอบ 11 ส.ค. 69):
//   ออกจากระบบไม่ได้กด แต่ไปหน้าเข้าสู่ระบบแล้วล็อกอินอีกบัญชี → แท็บนั้นเห็นว่า "คนเปลี่ยน"
//   เลยสั่งโหลดหน้าใหม่ทับการพาไปหน้าแดชบอร์ด ผู้ใช้ค้างอยู่หน้าเข้าสู่ระบบทั้งที่ล็อกอินสำเร็จแล้ว
//   จึงจดเวลาที่แท็บนี้กดล็อกอินไว้ แล้วเว้นช่วงสั้น ๆ ให้การล็อกอินของตัวเองเดินจนจบ
let tabUserId: string | null = null;
let localSignInAt = 0;
const LOCAL_SIGNIN_GRACE_MS = 5000;

/** ติดตามการเปลี่ยนสถานะ auth (login/logout/token refresh) — คืนฟังก์ชัน unsubscribe */
export function sbOnChange(cb: (session: MockSession | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, s) => {
    // ใบผ่านเปลี่ยน (ออกจากระบบ/สลับบัญชี/ต่ออายุ) → ทิ้งใบที่ HttpAdapter จำไว้ทันที
    // ไม่งั้นโหมด api จะยิงคำขอด้วยใบของคนเดิมต่อไปจนกว่าใบจะหมดอายุเอง
    void import("@pms/shared/lib/data/http/HttpAdapter").then(m => m.forgetCallerToken()).catch(() => {});
    if (!s) { tabUserId = null; cb(null); return; }
    const uid = s.user?.id ?? "";
    const justSignedInHere = Date.now() - localSignInAt < LOCAL_SIGNIN_GRACE_MS;
    if (tabUserId && uid && uid !== tabUserId && !justSignedInHere) {
      if (typeof window !== "undefined") window.location.reload();
      return;
    }
    tabUserId = uid;
    const base = sessionFromToken(s.access_token, s.user?.email ?? "");
    if (!base) { cb(null); void sbSignOut(); return; } // โทเค็นเพี้ยนกลางเซสชัน → ออกจากระบบ ไม่ใช่ถือ session ผี
    cb(base);                                   // ใช้งานต่อได้ทันที (ชื่อยังเป็นอีเมล/รหัสสาขา)
    void withNames(base, s.user?.id ?? "").then(full => {  // ได้ชื่อจริงแล้วค่อยส่งซ้ำ
      if (full.name !== base.name || full.dealerName !== base.dealerName) cb(full);
    });
  });
  return () => data.subscription.unsubscribe();
}
