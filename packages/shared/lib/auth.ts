"use client";

// ─── ชั้น AUTH (Phase A) — ตรวจตัวตนจริงกับคลังบัญชีที่มีอยู่ ────────────────────
// interface กลาง: หน้า login / RoleContext เรียกผ่านไฟล์นี้เท่านั้น
// เฟส B (Supabase) จะสลับเฉพาะไฟล์นี้ (supabase.auth.signInWithPassword) โดยที่เหลือไม่ต้องแก้
//
// คลังบัญชี 2 แหล่ง (ของจริงในระบบ ไม่มีการกุ):
//   • ดีลเลอร์  → hq_dealers_v4 · credentials { email } — เก็บได้เฉพาะอีเมล ห้ามเก็บรหัสผ่านจริง (ดูหมายเหตุที่ DealerCredentials ใน mock.ts)
//   • ผู้ใช้ HQ → hq_users_v4 · มี email/role/status แต่ "ไม่เก็บรหัสผ่าน"
//     (UsersPanel สร้างรหัสชั่วคราวโชว์ครั้งเดียว ไม่ persist) → ฝั่ง login ใช้รหัส demo ที่ประกาศชัด
//     จนกว่าจะถึงเฟส B ที่ Supabase Auth ถือรหัสจริง (bcrypt)

import { loadHQDealers, sessions, type MockSession, type UserRole } from "@pms/shared/lib/mock";
import { DEMO_PASSWORD, localDealerEmail, localDealerSecret } from "@pms/shared/lib/data/local/accountLocal";

export type AuthResult =
  | { ok: true; session: MockSession }
  | { ok: false; error: string };

// รหัส demo สำหรับบัญชีที่ระบบยังไม่เก็บรหัสจริง (ผู้ใช้ HQ + บัญชีเดโม)
// ดีลเลอร์ใช้รหัสจริงจาก credentials ได้เลย (หรือรหัส demo นี้ก็ได้ในโหมดเดโม)
// ค่าอยู่ที่ accountLocal ที่เดียว — หน้าบัญชีของดีลเลอร์ใช้ยืนยันรหัสปัจจุบันด้วยค่าเดียวกัน
export { DEMO_PASSWORD };

/** รหัสของบัญชีดีลเลอร์ในโหมดตัวอย่าง (แก้ 15 ก.ย. 69)
 *  ดีลเลอร์เคยเปลี่ยนรหัสที่หน้าบัญชี = ใช้ได้เฉพาะรหัสใหม่ · ยังไม่เคยเปลี่ยน = รหัสใน credentials หรือรหัสกลาง
 *  เดิมหน้าเข้าสู่ระบบไม่อ่านรหัส/อีเมลที่เปลี่ยนเลย → เปลี่ยนแล้วรหัสใหม่เข้าไม่ได้ รหัสเดิมยังเข้าได้ */
function รหัสดีลเลอร์ถูก(code: string, password: string, รหัสในทะเบียน?: string): boolean {
  const ลับ = localDealerSecret(code);
  return ลับ ? password === ลับ : (password === รหัสในทะเบียน || password === DEMO_PASSWORD);
}

// แม็พบทบาทภายในของ UsersPanel (5 คีย์) → UserRole ในระบบสิทธิ์ (permissions.ts)
// ทุกบัญชี HQ = scopeAll (เห็นทั้งเครือ) ต่างกันที่ระดับสิทธิ์
const HQ_ROLE_MAP: Record<string, UserRole> = {
  super_admin:    "SUPER_ADMIN",
  executive:      "HQ_MANAGEMENT",
  sales_manager:  "HQ_MANAGEMENT",
  central_sales:  "HQ_STAFF",
  system_officer: "HQ_MANAGEMENT",
};

// บัญชีเดโมในตัว — อีเมลที่หน้า login แนะนำ (ผูกกับ session สำเร็จรูป 2 ตัว)
const BUILT_IN: { email: string; session: MockSession }[] = [
  { email: "admin@benjamin.com", session: sessions.hq },      // ผู้ดูแลสำนักงานใหญ่
  { email: "cnx@dealer.com",     session: sessions.dealer },  // ดีลเลอร์เชียงใหม่ (CNX)
];

/** บัญชีที่ปุ่ม "เข้าใช้งานได้เลย" บนหน้าล็อกอินใช้ — โหมดเดโมเท่านั้น
 *  ⚠️ ปุ่มนั้นถูกกันด้วย !REAL_BACKEND ที่ LoginCard · ระบบจริงไม่เรนเดอร์เลย
 *     ค่าที่นี่จึงเป็นแค่ "ทางลัดของชุดสาธิต" ไม่ใช่ช่องทางเข้าระบบจริง */
export const DEMO_LOGINS: { email: string; label: string; scopeAll: boolean }[] = [
  { email: "admin@benjamin.com", label: "เข้าใช้งานเป็น สำนักงานใหญ่", scopeAll: true },
  { email: "cnx@dealer.com",     label: "เข้าใช้งานเป็น ดีลเลอร์", scopeAll: false },
];

type StoredHQUser = { name: string; email: string; role: string; status: string };

function loadHQUsers(): StoredHQUser[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem("hq_users_v4");
    if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) return arr; }
  } catch {}
  return [];
}

const ERR_BAD_PASSWORD = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
const ERR_INACTIVE     = "บัญชีนี้ถูกปิดใช้งาน — กรุณาติดต่อผู้ดูแลระบบ";
const ERR_NOT_FOUND    = "ไม่พบบัญชีผู้ใช้นี้ในระบบ";
const ERR_EMPTY        = "กรุณากรอกอีเมลและรหัสผ่าน";

function dealerSession(name: string, code: string): MockSession {
  return { name, role: "DEALER_ADMIN", dealerName: name, dealerCode: code, scopeAll: false };
}
function hqUserSession(u: StoredHQUser): MockSession {
  return {
    name: u.name,
    role: HQ_ROLE_MAP[u.role] ?? "HQ_MANAGEMENT",
    dealerName: "Benjamin HQ",
    dealerCode: "",
    scopeAll: true,
  };
}

/** ตรวจตัวตน — คืน session จริงตามบทบาท หรือ error ที่อ่านรู้เรื่อง */
export function authenticate(email: string, password: string): AuthResult {
  const e = email.trim().toLowerCase();
  if (!e || !password) return { ok: false, error: ERR_EMPTY };

  // 1) บัญชีดีลเลอร์ — อีเมลปัจจุบัน (รวมที่เปลี่ยนที่หน้าบัญชี) · รหัสปัจจุบัน
  for (const d of loadHQDealers()) {
    const อีเมล = localDealerEmail(d.code, d.credentials?.email ?? "").toLowerCase();
    if (อีเมล && อีเมล === e) {
      if (d.status === "inactive") return { ok: false, error: ERR_INACTIVE };
      if (รหัสดีลเลอร์ถูก(d.code, password, d.credentials?.password)) {
        return { ok: true, session: dealerSession(d.name, d.code) };
      }
      return { ok: false, error: ERR_BAD_PASSWORD };
    }
  }

  // 2) บัญชีเดโมในตัว (ผู้ดูแล HQ / ดีลเลอร์ CNX) — บัญชีดีลเลอร์ในตัวก็ต้องอ่านอีเมล/รหัสที่เปลี่ยนแล้วด้วย
  const b = BUILT_IN.find(x =>
    (x.session.dealerCode ? localDealerEmail(x.session.dealerCode, x.email).toLowerCase() : x.email) === e);
  if (b) {
    const ถูก = b.session.dealerCode ? รหัสดีลเลอร์ถูก(b.session.dealerCode, password) : password === DEMO_PASSWORD;
    if (ถูก) return { ok: true, session: b.session };
    return { ok: false, error: ERR_BAD_PASSWORD };
  }

  // 3) ผู้ใช้ HQ ที่จัดการในหน้า /hq/users — ระบบยังไม่เก็บรหัส → ใช้รหัส demo
  for (const u of loadHQUsers()) {
    if (u.email?.toLowerCase() === e) {
      if (u.status === "inactive") return { ok: false, error: ERR_INACTIVE };
      if (password === DEMO_PASSWORD) return { ok: true, session: hqUserSession(u) };
      return { ok: false, error: ERR_BAD_PASSWORD };
    }
  }

  return { ok: false, error: ERR_NOT_FOUND };
}
