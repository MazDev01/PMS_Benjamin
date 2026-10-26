"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { sessions, type MockSession, type UserRole } from "@pms/shared/lib/mock";
import { hasPermission, HQ_ROLES, type Permission } from "@pms/shared/lib/permissions";
import { authenticate, type AuthResult } from "@pms/shared/lib/auth";
import { REAL_BACKEND, DATA_SOURCE } from "@pms/shared/lib/data/config";
import { sbSignIn, sbSignOut, sbRestoreSafe, sbOnChange, hasStoredSession } from "@pms/shared/lib/supabaseAuth";
import { caSignIn, caSignOut, caRestore, caAdoptFromUrl } from "@pms/shared/lib/cookieAuth";

// โหมด api: ใบผ่านอยู่ใน cookie ที่ JavaScript อ่านไม่ได้ (ระยะ 4) — เส้นทางล็อกอินจึงคนละตัว
// โหมด supabase: หน้าเว็บต้องถือใบผ่านเอง เพราะต้องคุยกับฐานข้อมูลตรง
const COOKIE_AUTH = DATA_SOURCE === "api";
import { audit as auditRepo } from "@pms/shared/lib/data";
import { isAbortedRequest } from "@pms/shared/lib/repoLog";

// Phase 9 (Logging/Audit) — เดิมระบบไม่บันทึกเข้า/ออกจากระบบเลย (มีแต่ mutation ของ admin)
// เข้าสู่ระบบ/ออกจากระบบเป็นเหตุการณ์ที่ audit trail มาตรฐานต้องมี — บันทึกล้มเหลวต้องไม่บล็อกการ
// เข้า/ออกระบบจริง แต่ต้อง "ดังพอให้รู้" ไม่ใช่เงียบสนิท ไม่งั้นร่องรอยการเข้าระบบดับไปโดยไม่มีใครรู้
// (แนวเดียวกับ auditLog ใน adminRoute.ts ฝั่งเซิร์ฟเวอร์)
//
// ⚠️ ต้องข้ามกรณีคำขอถูกยกเลิก: ทันทีที่ล็อกอินสำเร็จ แอปจะพาไปหน้าใหม่ เบราว์เซอร์จึงยกเลิกคำขอ
//    audit ที่ยังค้างอยู่เป็นปกติ (ได้ "Failed to fetch" เหมือนเน็ตหลุดเป๊ะ) — ถ้าไม่กรอง จะมี error
//    ขึ้นทุกครั้งที่ล็อกอินสำเร็จ ทั้งที่ไม่มีอะไรผิด (เจอจริงตอนรันชุดทดสอบหลังแก้รอบนี้)
// ใบ 0240: หน้าเว็บส่งแค่ชนิดเรื่อง — ชื่อผู้ทำ/บทบาท/เวลา ฐานคิดจากใบผ่านเอง (audit_auth_event) · ดีลเลอร์ = ฐานไม่ลง
//   คำขอส่งแบบรอดข้ามการเปลี่ยนหน้า (keepalive ใน HttpAdapter) — ข้อยกเว้นคำขอถูกยกเลิกข้างล่างยังคงไว้กันเบราว์เซอร์รุ่นที่ไม่รองรับ
function logAuthEvent(action: "เข้าสู่ระบบ" | "ออกจากระบบ", s: MockSession) {
  // บันทึกตรวจสอบเป็นของสำนักงานใหญ่เท่านั้น (ดู /hq/audit) — ฐานข้อมูลปฏิเสธการเขียนจากดีลเลอร์อยู่แล้ว
  //   เดิมแอปดีลเลอร์ก็ยิงคำสั่งนี้ทุกครั้งที่ล็อกอิน แล้วโดนปฏิเสธ 403 ทุกครั้ง
  //   → ผู้ใช้เห็น error ค้างใน console ทุกการล็อกอิน และชุดทดสอบที่ตรวจ "ต้องไม่มี error" ก็ล้มตาม
  //   ไม่ใช่ปัญหาสิทธิ์ที่ต้องเปิดเพิ่ม แต่เป็นการ "เรียกในสิ่งที่ไม่ควรเรียกตั้งแต่ต้น"
  //   (พบจากการรันชุดเต็ม 6 ส.ค. 69 · ของเดิมสะสมมาตั้งแต่รัด policy ที่ 0031)
  if (!HQ_ROLES.includes(s.role)) return;
  auditRepo.authEvent(action)
    .catch(e => { if (!isAbortedRequest(e)) console.error(`[audit] บันทึก "${action}" ไม่สำเร็จ`, e); });
}

// โหมด backend — supabase = auth จริง (JWT) · local = mock เดิม (localStorage)
// "ของจริง" = supabase หรือ api (ไม่ใช่โหมดเดโม) — ดู REAL_BACKEND ใน data/config.ts
const USE_SUPABASE = REAL_BACKEND;

type RoleContextType = {
  session: MockSession;
  isLoggedIn: boolean;
  hydrated: boolean;   // true = ฟื้น session เสร็จ (auth พร้อม → ค่อย query เพื่อกัน RLS คืนว่าง)
  loading: boolean;    // true = ยังฟื้น session ไม่เสร็จ (= !hydrated) — ให้ useAuth ใช้
  isHQ: boolean;
  role: UserRole;
  dealerCode: string;
  can: (permission: Permission) => boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  login: (key: "hq" | "dealer") => Promise<void>;
  logout: () => void;
  currentKey: "hq" | "dealer";
};

const RoleContext = createContext<RoleContextType | null>(null);

const STORAGE_KEY = "pms_session_key";     // "hq" | "dealer" — คงไว้เพื่อ backward-compat + test harness
const STORAGE_LOGIN = "pms_logged_in";
const STORAGE_SESSION = "pms_session_v2";  // session เต็ม (role จริงทั้ง 6) จากการ login ด้วยบัญชี

export function RoleProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MockSession>(sessions.dealer);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // กู้ session ตอน mount — โหมด supabase ฟื้นจาก JWT · โหมด local ฟื้นจาก localStorage
  useEffect(() => {
    if (USE_SUPABASE) {
      let alive = true;
      // โหมด api ไม่มี onAuthStateChange ให้ฟัง (หน้าเว็บไม่ได้ถือ session ของ Supabase แล้ว)
      // การต่ออายุเป็นหน้าที่ของเซิร์ฟเวอร์ · ที่นี่แค่ถามว่า "ตอนนี้เป็นใคร" ตอนเปิดหน้า
      if (COOKIE_AUTH) {
        // ลิงก์เข้าระบบแทนดีลเลอร์แนบใบผ่านมาทาง #hash — ต้องแลกเป็น cookie ก่อน ไม่งั้นจะเห็นเป็น "ยังไม่ล็อกอิน"
        caAdoptFromUrl()
          .catch(() => null)
          .then((adopted) => (adopted ? adopted : caRestore()))
          .then((s) => {
            if (!alive) return;
            if (s) { setSession(s); setIsLoggedIn(true); }
            setHydrated(true);
          })
          .catch(() => { if (alive) setHydrated(true); });
        return () => { alive = false; };
      }
      // ── เข้าระบบแล้วต้องอยู่ต่อจนกว่าจะกดออกเอง (บอสสั่ง 20 ส.ค. 69) ────────────
      //
      // เดิมถามครั้งเดียวว่า "ยังล็อกอินอยู่ไหม" ถามไม่สำเร็จ = ถือว่าไม่ได้ล็อกอิน
      //   แล้ว AuthGuard เด้งไปหน้าเข้าสู่ระบบทันที — เน็ตสะดุดแวบเดียว ปิดฝาโน้ตบุ๊กแล้วเปิด
      //   หรือสัญญาณหลุดตอนโหลดหน้า ก็โดนเตะออกทั้งที่ใบผ่านยังอยู่ครบในเครื่อง
      //
      // ตอนนี้ sbRestoreSafe แยก "ออกแล้วจริง" ออกจาก "ยังไม่รู้" ให้ · ที่นี่จัดการต่อว่า
      //   ยังไม่รู้ + ยังมีใบผ่านในเครื่อง → ลองใหม่เรื่อย ๆ และ **ไม่ตั้ง hydrated**
      //   (hydrated=false = หน้าจอค้างที่ "กำลังเชื่อมต่อ" ไม่ใช่เด้งออก)
      let ครั้งที่ = 0;
      let ตัดสินแล้ว = false;   // ⚠️ อ่าน isLoggedIn ใน closure นี้ไม่ได้ — มันค้างค่าตอนสร้าง effect
      const ลองฟื้น = () => {
        void sbRestoreSafe().then((r) => {
          if (!alive) return;
          if (typeof r !== "string") { ตัดสินแล้ว = true; setSession(r); setIsLoggedIn(true); setHydrated(true); return; }
          if (r === "ออกแล้ว" || !hasStoredSession()) { ตัดสินแล้ว = true; setIsLoggedIn(false); setHydrated(true); return; }
          // ยังไม่รู้ + มีใบผ่านค้างอยู่ = ยังไม่ตัดสิน · ถอยห่างขึ้นเรื่อย ๆ สูงสุด 30 วินาที
          ครั้งที่ += 1;
          const รอ = Math.min(30_000, 1000 * 2 ** Math.min(ครั้งที่, 5));
          setTimeout(() => { if (alive) ลองฟื้น(); }, รอ);
        }).catch(() => {
          if (!alive) return;
          if (!hasStoredSession()) { ตัดสินแล้ว = true; setIsLoggedIn(false); setHydrated(true); return; }
          ครั้งที่ += 1;
          setTimeout(() => { if (alive) ลองฟื้น(); }, Math.min(30_000, 1000 * 2 ** Math.min(ครั้งที่, 5)));
        });
      };
      ลองฟื้น();
      // เน็ตกลับมา / กลับมาที่แท็บนี้ → ลองทันที ไม่ต้องรอรอบถัดไป
      const ลองทันที = () => { if (alive && !ตัดสินแล้ว && hasStoredSession()) { ครั้งที่ = 0; ลองฟื้น(); } };
      const เห็นแท็บ = () => { if (document.visibilityState === "visible") ลองทันที(); };
      window.addEventListener("online", ลองทันที);
      document.addEventListener("visibilitychange", เห็นแท็บ);

      // ติดตาม login/logout/refresh (เช่น token หมดอายุ) → ซิงก์ session ให้เสมอ
      const unsub = sbOnChange((s) => {
        if (!alive) return;
        if (s) { setSession(s); setIsLoggedIn(true); setHydrated(true); }
        // ⚠️ ไม่มี session ที่นี่ = supabase แจ้งว่าออกจากระบบแล้วจริง (กดออกเอง/กุญแจต่ออายุตาย)
        //    ต่างจาก "ถามไม่สำเร็จ" ข้างบน — อันนั้นไม่ผ่านทางนี้
        else { setIsLoggedIn(false); setHydrated(true); }
      });
      return () => {
        alive = false; unsub();
        window.removeEventListener("online", ลองทันที);
        document.removeEventListener("visibilitychange", เห็นแท็บ);
      };
    }

    // ── โหมด local (mock) ──
    try {
      const loggedIn = localStorage.getItem(STORAGE_LOGIN) === "true";
      // 1) session เต็มจากการ login ด้วยบัญชีจริง
      const saved = localStorage.getItem(STORAGE_SESSION);
      if (loggedIn && saved) {
        const s = JSON.parse(saved) as MockSession;
        if (s && s.role && typeof s.scopeAll === "boolean") {
          // ⚠️ บัญชีของชุดสาธิตถูกกำหนดไว้ในโค้ด ไม่ใช่ของที่ผู้ใช้ตั้งเอง
          //    ที่เก็บไว้ในเครื่องเป็นแค่สำเนาตอนกดเข้าใช้งานครั้งแรก
          //    ถ้าเราปรับบทบาทของบัญชีสาธิตทีหลัง คนที่เคยเข้ามาแล้วจะยังถือบทบาทเก่าตลอดไป
          //    จนกว่าจะล้างข้อมูลเว็บ (เจอจริง 3 ก.ย. 69 — เมนูที่สงวนไว้หายไปทั้งที่แก้แล้ว)
          //    → คนเดิมของชุดสาธิต ให้ยึดบทบาทจากโค้ดปัจจุบันเสมอ · ผู้ใช้ที่สร้างเองในโหมดสาธิตไม่แตะ
          const ชุดสาธิต = s.scopeAll ? sessions.hq : sessions.dealer;
          const ฟื้น = s.name === ชุดสาธิต.name ? { ...s, role: ชุดสาธิต.role } : s;
          setSession(ฟื้น); setIsLoggedIn(true); setHydrated(true); return;
        }
      }
      // 2) fallback: pms_session_key = "hq"|"dealer" (เดโมเข้าด่วน / role switcher / test harness)
      const key = localStorage.getItem(STORAGE_KEY) as "hq" | "dealer" | null;
      if (loggedIn && key && sessions[key]) {
        setSession(sessions[key]); setIsLoggedIn(true);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const persist = (s: MockSession) => {
    localStorage.setItem(STORAGE_KEY, s.scopeAll ? "hq" : "dealer");
    localStorage.setItem(STORAGE_LOGIN, "true");
    localStorage.setItem(STORAGE_SESSION, JSON.stringify(s));
  };

  // login ด้วยอีเมล/รหัสผ่านจริง → session ตามบทบาทของบัญชี
  // supabase: signInWithPassword (JWT) · local: mock authenticate + persist localStorage
  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    if (USE_SUPABASE) {
      const r = COOKIE_AUTH ? await caSignIn(email, password) : await sbSignIn(email, password);
      if (r.ok) { setSession(r.session); setIsLoggedIn(true); logAuthEvent("เข้าสู่ระบบ", r.session); }
      return r;
    }
    const r = authenticate(email, password);
    if (r.ok) { setSession(r.session); setIsLoggedIn(true); persist(r.session); logAuthEvent("เข้าสู่ระบบ", r.session); }
    return r;
  };

  // เข้าด่วนด้วย session สำเร็จรูป — ใช้เฉพาะโหมด local (เช่น "เข้าระบบแทนดีลเลอร์" ในหน้า HQ dealers
  // ซึ่งปิดไว้แล้วในโหมด supabase เพราะสวมสิทธิ์ข้ามบัญชีจริงทำไม่ได้)
  const login = async (key: "hq" | "dealer"): Promise<void> => {
    const s = sessions[key];
    setSession(s); setIsLoggedIn(true); persist(s);
    logAuthEvent("เข้าสู่ระบบ", s);
  };

  const logout = () => {
    setIsLoggedIn(false);
    logAuthEvent("ออกจากระบบ", session);
    if (USE_SUPABASE) { void (COOKIE_AUTH ? caSignOut() : sbSignOut()); return; }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_LOGIN);
    localStorage.removeItem(STORAGE_SESSION);
  };

  return (
    <RoleContext.Provider
      value={{
        session,
        isLoggedIn,
        hydrated,
        loading: !hydrated,
        isHQ: session.scopeAll,
        role: session.role,
        dealerCode: session.dealerCode,
        can: (permission: Permission) => hasPermission(session.role, permission),
        signIn,
        login,
        logout,
        currentKey: session.scopeAll ? "hq" : "dealer",
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside RoleProvider");
  return ctx;
}

// useAuth — มุมมอง "ผู้ใช้ปัจจุบัน" ที่กระชับ (ตาม Master Plan Phase 0)
// user = session ปัจจุบัน · dealerCode/role/isHQ มาจาก JWT (supabase) หรือ mock (local)
// loading = ยังฟื้น session ไม่เสร็จ → หน้า/query ควรรอก่อน
export function useAuth() {
  const { session, dealerCode, role, isHQ, loading } = useRole();
  return { user: session, dealerCode, role, isHQ, loading };
}
