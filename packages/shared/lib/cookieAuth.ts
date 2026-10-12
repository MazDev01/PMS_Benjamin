"use client";

// ── เข้าระบบแบบไม่ให้ใบผ่านตกถึงมือ JavaScript (ระยะ 4 · เฉพาะโหมด api) ──────────────
//
// คู่ขนานกับ supabaseAuth.ts แต่ไม่คุยกับ Supabase ตรง ๆ เลย — คุยกับ backend ของเราแทน
// ใบผ่านอยู่ใน cookie httpOnly ที่โมดูลนี้ "อ่านไม่ได้ด้วยซ้ำ" ซึ่งเป็นเป้าหมายของทั้งระยะ
//
// ⚠️ อย่าพยายามอ่านใบผ่านจากที่นี่ ไม่ว่ากรณีใด — ถ้าโค้ดตรงไหนต้องใช้ใบผ่าน
//    แปลว่าออกแบบผิด ให้ย้ายงานนั้นไปทำที่เซิร์ฟเวอร์แทน
import type { MockSession, UserRole } from "@pms/shared/lib/mock";
import type { AuthResult } from "@pms/shared/lib/auth";

/** สิ่งที่ backend ยอมบอกหน้าเว็บ — ไม่มีใบผ่านปนมา */
type PublicSession = {
  userId: string; email: string; role: string; dealerCode: string; expiresAt: number;
  name: string; dealerName: string;
};

const HQ_ROLES = new Set(["SUPER_ADMIN", "HQ_ADMIN", "HQ_MANAGER", "HQ_SALES", "HQ_VIEWER"]);

/** แปลง "ใครคือใคร" ที่ backend บอก → session ที่หน้าเว็บทั้งระบบใช้กันอยู่แล้ว
 *  ต้องได้รูปเดียวกับ supabaseAuth เป๊ะ ไม่งั้นหน้าจอจะแสดงต่างกันระหว่างสองโหมด */
function toSession(p: PublicSession): MockSession {
  const role = (p.role || "DEALER_SALES") as UserRole;
  const dealerCode = p.dealerCode ?? "";
  // เกณฑ์เดียวกับ supabaseAuth.sessionFromToken เป๊ะ — ไม่มีสาขาผูก = HQ
  const scopeAll = HQ_ROLES.has(role) || dealerCode === "";
  return {
    name: p.name || p.email,                     // ไม่มีชื่อในโปรไฟล์ → ใช้อีเมลไปก่อน (เหมือนโหมดเดิม)
    role,
    dealerName: scopeAll ? "Benjamin HQ" : (p.dealerName || dealerCode),
    dealerCode,
    scopeAll,
  };
}

async function call(path: string, init?: RequestInit): Promise<PublicSession | null> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",   // cookie ต้องเดินทางไปด้วย
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json().catch(() => null)) as PublicSession | null;
}

/** เข้าสู่ระบบ — เซิร์ฟเวอร์เป็นคนคุยกับ Supabase แล้วตั้ง cookie ให้ */
export async function caSignIn(email: string, password: string): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch("/api/v1/auth?op=login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, error: "ต่ออินเทอร์เน็ตไม่ได้ — ลองใหม่อีกครั้ง" };
  }
  const body = (await res.json().catch(() => null)) as (PublicSession & { error?: string }) | null;
  if (!res.ok || !body || body.error) {
    return { ok: false, error: body?.error ?? "เข้าสู่ระบบไม่สำเร็จ" };
  }
  return { ok: true, session: toSession(body) };
}

/** ลิงก์ "เข้าระบบแทนดีลเลอร์" ส่งใบผ่านมาทาง #hash ของ URL — แลกเป็น cookie แล้วลบทิ้งทันที
 *
 *  ⚠️ ต้องลบออกจาก URL ให้ได้ ไม่งั้นใบผ่านจะติดไปกับลิงก์ที่ผู้ใช้ copy ต่อ/บันทึกไว้
 *  ⚠️ #hash ไม่ถูกส่งไปเซิร์ฟเวอร์ตามหลักการของเบราว์เซอร์ จึงต้องให้หน้าเว็บอ่านแล้วส่งเอง
 *     (ใบผ่านผ่านมือ JavaScript แค่เสี้ยววินาทีนี้เท่านั้น แล้วย้ายเข้า cookie ที่อ่านไม่ได้ทันที)
 *  คืนค่า session ถ้าแลกสำเร็จ · null ถ้าไม่มีใบผ่านติดมาหรือแลกไม่ผ่าน */
export async function caAdoptFromUrl(): Promise<MockSession | null> {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!h.includes("access_token=")) return null;
  const q = new URLSearchParams(h);
  const access_token = q.get("access_token") ?? "";
  const refresh_token = q.get("refresh_token") ?? "";
  // ล้าง URL ก่อนเสมอ — แลกสำเร็จหรือไม่ก็ตาม ใบผ่านต้องไม่ค้างอยู่ในแถบที่อยู่
  try { window.history.replaceState({}, "", window.location.pathname + window.location.search); } catch { /* ล้างไม่ได้ก็ยังต้องแลกต่อ */ }
  const s = await call("/api/v1/auth?op=adopt", { method: "POST", body: JSON.stringify({ access_token, refresh_token }) })
    .catch(() => null);
  return s ? toSession(s) : null;
}

/** แลกใบผ่านที่ได้มาแล้ว (ไม่ได้อยู่ใน URL) เป็น cookie httpOnly
 *
 *  ใช้กับหน้า "เข้าระบบแทนดีลเลอร์" ที่ตรวจใบผ่านกับ Supabase เองแล้วได้ token มาถือไว้
 *  โหมด api หน้าเว็บถือ session เองไม่ได้ — ต้องส่งให้เซิร์ฟเวอร์ตั้ง cookie เท่านั้น
 *  ⚠️ เซิร์ฟเวอร์ยังยืนยันใบผ่านกับ Supabase อีกชั้นเสมอ (op=adopt) ห้ามเชื่อฝั่งเบราว์เซอร์
 */
export async function caAdoptTokens(access_token: string, refresh_token?: string): Promise<MockSession | null> {
  const s = await call("/api/v1/auth?op=adopt", {
    method: "POST",
    body: JSON.stringify({ access_token, refresh_token }),
  }).catch(() => null);
  return s ? toSession(s) : null;
}

/** ฟื้น session ตอนเปิดหน้าใหม่ — ถ้าใบผ่านหมดอายุ ลองต่ออายุให้หนึ่งครั้งก่อนยอมแพ้
 *
 *  ⚠️ 204 = ไม่มีใบผ่านติดมาเลย (ยังไม่เคยล็อกอิน) — ต้องเลิกตรงนี้ ห้ามไปลองต่ออายุต่อ
 *     ไม่งั้นทุกครั้งที่เปิดหน้าเข้าสู่ระบบจะยิง ?op=refresh แล้วได้ 401 เป็น error ค้างใน console */
export async function caRestore(): Promise<MockSession | null> {
  let res: Response;
  try {
    res = await fetch("/api/v1/auth", { credentials: "same-origin", cache: "no-store" });
  } catch { return null; }
  if (res.status === 204) return null;                        // ยังไม่ได้ล็อกอิน — ไม่ใช่ข้อผิดพลาด
  if (res.ok) {
    const me = (await res.json().catch(() => null)) as PublicSession | null;
    if (me) return toSession(me);
  }
  return caRefresh();                                         // ใบผ่านหมดอายุ/ใช้ไม่ได้ → ลองต่ออายุ
}

// ⚠️ ห้ามต่ออายุพร้อมกันหลายสายเด็ดขาด — refresh token ของ Supabase ใช้ได้ครั้งเดียวแล้วเปลี่ยนใบใหม่
//    เปิดหน้าหนึ่งหน้ายิงคำขอพร้อมกันสิบกว่าสาย ถ้าใบผ่านหมดอายุพอดี ทุกสายจะ 401 พร้อมกัน
//    แล้วเรียกต่ออายุพร้อมกันสิบกว่าครั้ง → สายแรกสำเร็จและ "เผา" ใบเก่าทิ้ง สายที่เหลือใช้ใบที่ถูกเผาแล้ว
//    → ล้มหมด → ผู้ใช้เด้งออกจากระบบทั้งที่เพิ่งล็อกอิน (เจอจริง 18 ส.ค. 69: ทั้งหน้าขึ้น "ยังไม่ได้เข้าสู่ระบบ")
//    ทางแก้: ใครมาก่อนเป็นคนต่ออายุ ที่เหลือรอผลของสายเดียวกันนั้น
let refreshInFlight: Promise<MockSession | null> | null = null;

/** ต่ออายุใบผ่าน — เซิร์ฟเวอร์ใช้ refresh token ที่อยู่ใน cookie (หน้าเว็บไม่เห็นเช่นกัน) */
export function caRefresh(): Promise<MockSession | null> {
  if (!refreshInFlight) {
    refreshInFlight = call("/api/v1/auth?op=refresh", { method: "POST" })
      .catch(() => null)
      .then(s => (s ? toSession(s) : null))
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

/** ออกจากระบบ — เซิร์ฟเวอร์ปิด session ฝั่ง Supabase แล้วล้าง cookie ให้ */
export async function caSignOut(): Promise<void> {
  try { await fetch("/api/v1/auth?op=logout", { method: "POST", credentials: "same-origin" }); }
  catch { /* ออกไม่สำเร็จก็ยังต้องเด้งผู้ใช้ออกจากหน้าจอ */ }
}
