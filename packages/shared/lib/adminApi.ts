"use client";

// ── ตัวเรียกงาน admin ที่ต้องทำ "ฝั่งเซิร์ฟเวอร์" (service_role) ────────────────────
// งานอย่างสร้างบัญชีเข้าระบบต้องใช้ service_role ซึ่งอยู่ในเบราว์เซอร์ไม่ได้
// จึงยิงไปที่ Route Handler ของแอป HQ (/api/admin/*) ที่ถือ service_role ฝั่งเซิร์ฟเวอร์แทน
// (โมดูลนี้อยู่ฝั่ง client — ส่งแค่ JWT ของผู้เรียกไปให้เซิร์ฟเวอร์ตรวจสิทธิ์เอง ไม่แตะ service_role)
import { getSupabase } from "./data/supabase/client";
import { REAL_BACKEND, DATA_SOURCE } from "./data/config";
import { friendlyError } from "./friendlyError";

// ── ระยะ 4: โหมด api เก็บใบผ่านใน cookie httpOnly — หน้าเว็บอ่านมาแนบเองไม่ได้ (และไม่ต้อง) ──
const COOKIE_AUTH = DATA_SOURCE === "api";

/** คืน "COOKIE" เป็นสัญญาณว่า "ล็อกอินอยู่ ไม่ต้องแนบ header"
 *  เพื่อให้ด่านเช็ก `if (!token)` ที่มีอยู่เดิมทุกจุดยังทำงานเหมือนเดิม ไม่ต้องแก้ทีละที่ */
async function adminToken(): Promise<string> {
  if (COOKIE_AUTH) return "COOKIE";
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? "";
  } catch { return ""; }
}

/** header สำหรับเรียก /api/admin/* — โหมด cookie ไม่แนบ authorization เลย */
const authHeaders = (token: string, json = false): Record<string, string> => ({
  ...(json ? { "content-type": "application/json" } : {}),
  ...(COOKIE_AUTH ? {} : { authorization: `Bearer ${token}` }),
});

export type CreateDealerInput = {
  code: string; name: string; province: string; region: string; revenueTarget: number;
  /** อีเมล/รหัสผ่านที่ HQ กรอกเอง — เว้นว่าง = ให้เซิร์ฟเวอร์ตั้งให้ (บอสสั่ง 20 ส.ค. 69) */
  email?: string; password?: string;
  /** บังคับ — ดีลเลอร์ต้องมาจากลูกค้าเป้าหมายที่สำเร็จแล้ว (บอสสั่ง 14 ก.ย. 69)
   *  เซิร์ฟเวอร์ผูกรายนั้นเป็น "เป็นดีลเลอร์แล้ว" ให้ในคำขอเดียวกัน */
  prospectId: number;
  /** จังหวัดที่ดูแล (FLOW: แปลงเป็นดีลเลอร์ · HQ กำหนดจังหวัดที่ดูแล · กฎหนึ่งจังหวัดหนึ่งดีลเลอร์ 0195) */
  provinces?: string[];
};
export type CreateDealerResult =
  | { ok: true; email: string; password: string; prospectLinked?: boolean }
  | { ok: false; error: string };

/** สร้างดีลเลอร์ "พร้อมบัญชีเข้าระบบจริง" ผ่าน Route Handler ฝั่งเซิร์ฟเวอร์ (H5) */
export async function createDealerAccount(input: CreateDealerInput): Promise<CreateDealerResult> {
  // โหมดเดโม (local) ไม่มีระบบยืนยันตัวตนจริงให้ผูก — บอกตามจริง ไม่แกล้งทำสำเร็จ
  if (!REAL_BACKEND) {
    return { ok: false, error: "โหมดเดโม: สร้างบัญชีดีลเลอร์จริงไม่ได้ (ต้องมีระบบยืนยันตัวตน)" };
  }
  const token = await adminToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };

  try {
    const res = await fetch("/api/admin/dealers", { credentials: "same-origin",
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; email?: string; password?: string; prospectLinked?: boolean };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, email: json.email ?? "", password: json.password ?? "", prospectLinked: json.prospectLinked };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

// ใบผ่านของผู้เรียก — โหมด cookie ไม่มีให้อ่าน (โดยตั้งใจ) จึงใช้ตัวช่วยกลางตัวเดียวกัน
const callerToken = adminToken;

/** ผูกลูกค้าเป้าหมายกับดีลเลอร์ที่มีอยู่แล้ว — เซิร์ฟเวอร์ตรวจว่าสาขามีจริง/เปิดใช้งาน/ยังไม่ถูกผูกกับรายอื่น
 *  hasAccount=false = ผูกแล้ว แต่สาขายังไม่มีบัญชีเข้าระบบ (หน้าจอต้องเตือน) · โหมดเดโมหน้าจอทำเอง */
export async function linkProspectToDealer(prospectId: number, dealerCode: string): Promise<
  { ok: true; hasAccount: boolean } | { ok: false; error: string }
> {
  if (!REAL_BACKEND) return { ok: false, error: "โหมดเดโม: ผูกผ่านเซิร์ฟเวอร์ไม่ได้" };
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch("/api/admin/dealers/link-prospect", { credentials: "same-origin",
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ prospectId, dealerCode }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; hasAccount?: boolean };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, hasAccount: json.hasAccount !== false };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

/** สิทธิ์แก้อีเมล/รหัสผ่านเองของดีลเลอร์ — ใช้ไปกี่ครั้ง (HQ ดู) */
export async function getDealerSelfQuota(code: string): Promise<
  { ok: true; used: number; limit: number } | { ok: false; error: string }
> {
  if (!REAL_BACKEND) {
    const { accountLocal } = await import("./data/local/accountLocal");
    const s = await accountLocal.state(code);
    return { ok: true, used: s.selfChangesUsed, limit: s.selfChangesLimit };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch(`/api/admin/dealers/self-quota?code=${encodeURIComponent(code)}`, { credentials: "same-origin",
      headers: authHeaders(token),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; used?: number; limit?: number };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, used: json.used ?? 0, limit: json.limit ?? 2 };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

/** คืนสิทธิ์แก้เอง — ประวัติการเปลี่ยนเดิมยังอยู่ แค่เริ่มนับใหม่ · เซิร์ฟเวอร์บันทึกว่าใครคืนให้สาขาไหน */
export async function resetDealerSelfQuota(code: string): Promise<
  { ok: true; reset: number } | { ok: false; error: string }
> {
  if (!REAL_BACKEND) {
    const { accountLocal } = await import("./data/local/accountLocal");
    return { ok: true, reset: accountLocal.resetSelfQuota(code) };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch(`/api/admin/dealers/self-quota?code=${encodeURIComponent(code)}`, { credentials: "same-origin",
      method: "POST",
      headers: authHeaders(token),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; reset?: number };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, reset: json.reset ?? 0 };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

// ── ผู้ใช้สำนักงานใหญ่ (HQ) — สร้าง/ลบ ผ่าน Route Handler ฝั่งเซิร์ฟเวอร์ ──
export type CreateHQUserInput = {
  name: string; email: string; phone: string; role: string; department: string;
  status: "active" | "inactive"; avatar?: string;
  /** รหัสผ่านชั่วคราวที่กรอกในฟอร์ม · เว้นว่าง = เซิร์ฟเวอร์สุ่มให้ */
  password?: string;
};
export type CreateHQUserResult =
  | { ok: true; id: string; email: string; password: string }
  | { ok: false; error: string };

/** สร้างผู้ใช้ HQ "พร้อมบัญชีเข้าระบบจริง" — รหัสผ่านสุ่มที่เซิร์ฟเวอร์ คืนมาโชว์ครั้งเดียว */
export async function createHQUser(input: CreateHQUserInput): Promise<CreateHQUserResult> {
  if (!REAL_BACKEND) {
    return { ok: false, error: "โหมดเดโม: สร้างบัญชีผู้ใช้จริงไม่ได้ (ต้องมีระบบยืนยันตัวตน)" };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch("/api/admin/users", { credentials: "same-origin",
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; id?: string; email?: string; password?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, id: json.id ?? "", email: json.email ?? "", password: json.password ?? "" };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

/** ลบผู้ใช้ HQ จริง (auth + profile) ผ่าน Route Handler ฝั่งเซิร์ฟเวอร์ */
export async function deleteHQUser(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!REAL_BACKEND) {
    return { ok: false, error: "โหมดเดโม: ลบบัญชีจริงไม่ได้ (ต้องมีระบบยืนยันตัวตน)" };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { credentials: "same-origin",
      method: "DELETE",
      headers: authHeaders(token),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

/** ออกรหัสผ่านใหม่ให้ดีลเลอร์ (HQ คุมรหัสผ่านของดีลเลอร์เท่านั้น — ดีลเลอร์ไม่มีสิทธิ์ตั้ง/ขอรีเซ็ตเอง)
 *  รหัสใหม่สุ่มที่เซิร์ฟเวอร์เสมอ คืนมาโชว์ครั้งเดียวเหมือนตอนสร้างบัญชี */
export async function resetDealerPassword(
  code: string,
  /** แก้เองได้ (บอสสั่ง 20 ส.ค. 69): ส่งอีเมลใหม่/รหัสใหม่ · ไม่ส่ง = สุ่มรหัสให้เหมือนเดิม
   *  ส่งเฉพาะ email = เปลี่ยนอีเมลอย่างเดียว รหัสเดิมยังใช้ได้ (ห้ามเตะสาขาหลุดโดยไม่ได้ขอ) */
  แก้?: { email?: string; password?: string },
): Promise<CreateDealerResult> {
  if (!REAL_BACKEND) {
    return { ok: false, error: "โหมดเดโม: รีเซ็ตรหัสผ่านจริงไม่ได้ (ต้องมีระบบยืนยันตัวตน)" };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch(`/api/admin/dealers?code=${encodeURIComponent(code)}`, { credentials: "same-origin",
      method: "PATCH",
      headers: authHeaders(token, true),
      body: JSON.stringify({ email: แก้?.email?.trim() || undefined, password: แก้?.password || undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; email?: string; password?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, email: json.email ?? "", password: json.password ?? "" };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

/** อีเมลเข้าระบบจริงของแต่ละสาขา (รหัสสาขา → อีเมล) — สาขาที่ไม่มีบัญชีจะไม่มีคีย์
 *  ต้องถามเซิร์ฟเวอร์ ห้ามคำนวณเอาเองจากรหัสสาขา (อีเมลจริงของแต่ละสาขาไม่ได้เป็นสูตรเดียวกัน) */
export async function listDealerLoginEmails(): Promise<Record<string, string>> {
  // โหมดตัวอย่าง (เว็บ demo) ไม่มีเซิร์ฟเวอร์ให้ถาม — แต่ชุดข้อมูลตัวอย่างมีอีเมลของแต่ละสาขาอยู่แล้ว
  // เดิมคืนค่าว่างเสมอ หน้าจอจึงขึ้น "—" คู่กับรหัสผ่านที่ดูได้ คนดูเข้าใจว่าระบบเก็บอีเมลไม่ได้
  // (บอสทักท้วง 3 ก.ย. 69) · ไม่ใช่การเดาอีเมล — เป็นค่าที่อยู่ในชุดตัวอย่างจริง ๆ
  if (!REAL_BACKEND) {
    const { loadHQDealers } = await import("./mock");
    return Object.fromEntries(
      loadHQDealers()
        .filter(d => d.credentials?.email)
        .map(d => [d.code, d.credentials!.email]),
    );
  }
  const token = await callerToken();
  if (!token) return {};
  try {
    const res = await fetch("/api/admin/dealers/logins", { credentials: "same-origin", headers: authHeaders(token) });
    const json = (await res.json().catch(() => ({}))) as { logins?: Record<string, string> };
    return res.ok ? (json.logins ?? {}) : {};
  } catch { return {}; }
}

/** เปิดดูรหัสผ่านของดีลเลอร์ (HQ ที่มีสิทธิ์ dealers:manage เท่านั้น)
 *  ดึงตอนกดดูเท่านั้น — ห้ามโหลดล่วงหน้ามาไว้ในหน้า เพราะเคยมีรหัสหลุดไปกับ bundle มาแล้ว
 *  ฝั่งเซิร์ฟเวอร์บันทึก audit ทุกครั้งที่เรียก (ดู /api/admin/dealers/secret) */
export async function viewDealerPassword(code: string): Promise<
  { ok: true; password: string; updatedAt: string; updatedBy: string } | { ok: false; error: string }
> {
  if (!REAL_BACKEND) {
    return { ok: false, error: "โหมดเดโม: รหัสผ่านแสดงอยู่ในหน้าอยู่แล้ว" };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch(`/api/admin/dealers/secret?code=${encodeURIComponent(code)}`, { credentials: "same-origin",
      headers: authHeaders(token),
    });
    const json = (await res.json().catch(() => ({}))) as
      { error?: string; password?: string; updatedAt?: string; updatedBy?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, password: json.password ?? "", updatedAt: json.updatedAt ?? "", updatedBy: json.updatedBy ?? "" };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

/** ขอลิงก์ "เข้าระบบแทนดีลเลอร์" — ไม่ต้องรู้/รีเซ็ตรหัสผ่านดีลเลอร์เลย (ใช้ Supabase magic-link)
 *  ลิงก์ใช้ได้ครั้งเดียวแล้วหมดอายุ — เปิดในแท็บใหม่ไปยังแอปดีลเลอร์เสมอ (คนละ origin กับ HQ) */
export async function impersonateDealer(code: string): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  if (!REAL_BACKEND) {
    return { ok: false, error: "โหมดเดโม: ไม่ต้องขอลิงก์ — ใช้ปุ่มเข้าระบบแทนแบบเดโมได้เลย" };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch(`/api/admin/dealers/impersonate?code=${encodeURIComponent(code)}`, { credentials: "same-origin",
      method: "POST",
      headers: authHeaders(token),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; link?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, link: json.link ?? "" };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

// ล้างบันทึกการใช้งานทั้งหมด — เฉพาะผู้ดูแลสูงสุด (เซิร์ฟเวอร์บังคับอีกชั้น)
// ⚠️ ปกติ audit_log ลบไม่ได้ (append-only) — เส้นทางนี้เป็นข้อยกเว้นเดียวที่บอสสั่งให้มี
//    การล้างจะถูกบันทึกกลับเป็นรายการแรกเสมอ (ใครล้าง เมื่อไหร่ ไปกี่แถว)
export async function clearAuditLog(): Promise<
  { ok: true; removed: number } | { ok: false; error: string }
> {
  if (!REAL_BACKEND) return { ok: false, error: "โหมดเดโม: ล้างบันทึกจริงไม่ได้" };
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch("/api/admin/audit/clear", { credentials: "same-origin",
      method: "POST", headers: authHeaders(token),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; removed?: number };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, removed: json.removed ?? 0 };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}

// ตั้งรหัสผ่านใหม่ให้ผู้ใช้สำนักงานใหญ่ — เฉพาะผู้ดูแลสูงสุด (เซิร์ฟเวอร์บังคับอีกชั้น)
// คืนรหัสใหม่มาโชว์ครั้งเดียว ให้ผู้ดูแลคัดลอกไปแจ้งเจ้าตัว (แนวเดียวกับรีเซ็ตรหัสของดีลเลอร์)
// ต่างจาก "ส่งลิงก์ทางอีเมล" ตรงที่ไม่พึ่งอีเมลเลย — ใช้ได้แม้ยังไม่ได้ตั้ง SMTP
export async function resetHQUserPassword(id: string, password?: string): Promise<
  { ok: true; email: string; password: string } | { ok: false; error: string }
> {
  if (!REAL_BACKEND) {
    return { ok: false, error: "โหมดเดโม: ตั้งรหัสผ่านจริงไม่ได้ (ต้องมีระบบยืนยันตัวตน)" };
  }
  const token = await callerToken();
  if (!token) return { ok: false, error: "ยังไม่ได้เข้าสู่ระบบ" };
  try {
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { credentials: "same-origin",
      method: "PATCH",
      headers: authHeaders(token, true),
      body: JSON.stringify(password ? { password } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; email?: string; password?: string };
    if (!res.ok) return { ok: false, error: json.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}` };
    return { ok: true, email: json.email ?? "", password: json.password ?? "" };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้") };
  }
}
