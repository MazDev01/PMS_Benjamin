// ── บัญชีเข้าระบบของดีลเลอร์ — โหมดจริง (คุยกับ API ของสำนักงานใหญ่) ──────────────
//
// ทำไมต้องผ่านแอปสำนักงานใหญ่ (บอสตัดสิน 28 ส.ค. 69):
//   คีย์ผู้ดูแลระบบ (service role) กับกุญแจถอดรหัสสำเนารหัสผ่าน (DEALER_SECRET_KEY)
//   อยู่ที่แอปสำนักงานใหญ่ที่เดียวโดยตั้งใจ — แอปดีลเลอร์ไม่มี และไม่ควรมี
//   ถ้าให้แอปดีลเลอร์เปลี่ยนบัญชีเองตรง ๆ สำนักงานใหญ่จะเปิดดูรหัสที่ดีลเลอร์ตั้งไม่ได้เลย
//
// การยืนยันตัวตน: ส่งใบผ่านของ "ดีลเลอร์คนที่กำลังใช้งาน" ไปกับคำขอ (Bearer)
//   ฝั่งเซิร์ฟเวอร์ตรวจว่าใบผ่านนี้เป็นของสาขานั้นจริงก่อนทำอะไร — ไม่เชื่อรหัสสาขาที่ส่งมา

import type { AccountChangeResult, AccountRepo, AccountRequest, AccountState } from "./ports";
import { getAccessToken } from "./supabase/client";
import { DATA_SOURCE } from "./config";

/** โหมด api = ใบผ่านอยู่ใน cookie httpOnly ที่หน้าเว็บอ่านไม่ได้ (ระยะ 4)
 *  แอปดีลเลอร์จึงแนบ Bearer ไปหาสำนักงานใหญ่เองไม่ได้ → ยิงผ่านเซิร์ฟเวอร์ของตัวเองแทน
 *  (ดู server/v1/accountProxy.ts) · เจอบนเว็บจริง 1 ก.ย. 69: หน้าบัญชีขึ้น "เกิดข้อผิดพลาด" ตลอด */
const ผ่านเซิร์ฟเวอร์ตัวเอง = DATA_SOURCE === "api" && process.env.PMS_APP !== "hq";

/** ที่อยู่แอปสำนักงานใหญ่ — ตั้งใน .env (NEXT_PUBLIC_HQ_ORIGIN) · แอป HQ เองเรียกที่ตัวเอง */
function hqOrigin(): string {
  const ตั้งไว้ = process.env.NEXT_PUBLIC_HQ_ORIGIN;
  if (ตั้งไว้) return ตั้งไว้.replace(/\/$/, "");
  // แอป HQ เรียกเส้นทางของตัวเอง (same-origin) — แอปดีลเลอร์ที่ยังไม่ตั้งค่าจะได้ error ที่อ่านออก
  if (typeof window !== "undefined" && process.env.PMS_APP === "hq") return window.location.origin;
  return "";
}

async function ยิง<T>(path: string, init?: RequestInit): Promise<T> {
  // ยิงที่เซิร์ฟเวอร์ของแอปตัวเอง แล้วให้มันส่งต่อพร้อมใบผ่านจาก cookie
  if (ผ่านเซิร์ฟเวอร์ตัวเอง) {
    const res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
    });
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) throw new Error(body?.error || `คำขอไม่สำเร็จ (${res.status})`);
    return body as T;
  }

  const origin = hqOrigin();
  if (!origin && process.env.PMS_APP !== "hq") {
    throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_HQ_ORIGIN — เปลี่ยนบัญชีเข้าระบบจากหน้านี้ยังไม่ได้");
  }
  const token = await getAccessToken();
  const res = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(body?.error || `คำขอไม่สำเร็จ (${res.status})`);
  return body as T;
}

export const accountRemote: AccountRepo = {
  state: (dealerCode) =>
    ยิง<AccountState>(`/api/account?code=${encodeURIComponent(dealerCode)}`),

  change: (input) =>
    ยิง<AccountChangeResult>("/api/account", { method: "POST", body: JSON.stringify(input) }),

  listRequests: () =>
    ยิง<{ requests: AccountRequest[] }>("/api/admin/dealers/account-requests").then(r => r.requests),

  decide: (id, action, reason) =>
    ยิง<{ ok: true }>("/api/admin/dealers/account-requests", {
      method: "PATCH",
      body: JSON.stringify({ id, action, reason }),
    }).then(() => undefined),

  // ตั้งรหัสผ่านใหม่ตอนเข้าระบบครั้งแรก — ไม่นับสิทธิ์แก้เอง 2 ครั้ง (บอสสั่ง 15 ก.ย. 69)
  setFirstPassword: (password) =>
    ยิง<{ message: string }>("/api/account", { method: "POST", body: JSON.stringify({ op: "first-password", password }) }),

  // ดูรหัสผ่านของตัวเอง: ขอเลขทางอีเมลก่อน แล้วเอาเลขนั้นมายืนยัน (บอสสั่ง 1 ก.ย. 69)
  sendRevealCode: () =>
    ยิง<{ sentTo: string }>("/api/account/reveal", { method: "POST", body: JSON.stringify({ op: "send" }) }),

  reveal: (_dealerCode, code) =>
    ยิง<{ password: string }>("/api/account/reveal", { method: "POST", body: JSON.stringify({ op: "verify", code }) }),
};
