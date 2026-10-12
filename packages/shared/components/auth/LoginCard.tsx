"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@pms/shared/context/RoleContext";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { DEMO_PASSWORD, DEMO_LOGINS } from "@pms/shared/lib/auth";
import { sbSendPasswordReset, sbLoginWithCode, sbRestore, sbSignOut } from "@pms/shared/lib/supabaseAuth";

// ── ทางเข้าเดโมของอีกฝั่ง (ตั้งที่ Vercel ของโปรเจกต์เดโมเท่านั้น) ──
// ว่าง = ไม่มีปุ่ม · ระบบจริงไม่ตั้งค่านี้
// ⚠️ เก็บเฉพาะ "ที่อยู่" ในค่าตั้งค่า — ข้อความไทยอยู่ในโค้ด
//    (เคยเอาข้อความไปไว้ในค่าตั้งค่าแล้วภาษาไทยเพี้ยนเป็น ????? บนหน้าเว็บจริง · 18 ส.ค. 69)
//    และผูกชื่อปุ่มกับฝั่งที่เปิดอยู่ — ชื่อกับปลายทางจึงสลับกันไม่ได้
const OTHER_DEMO_URL = process.env.NEXT_PUBLIC_DEMO_OTHER_URL ?? "";

// ── inline SVG (feather/lucide style) — ไม่พึ่ง icon library ──
const IconMail = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
  </svg>
);
const IconLock = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const IconEye = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const IconEyeOff = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3 3.8M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.4-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </svg>
);

export default function LoginCard({ variant = "dealer" }: { variant?: "dealer" | "hq" }) {
  const { signIn, logout } = useRole();
  const router = useRouter();
  const isHQ = variant === "hq";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // "ลืมรหัสผ่าน?" — โหมด supabase ส่งลิงก์ตั้งรหัสใหม่ทางอีเมลจริง (H4/sbSendPasswordReset)
  //   โหมด local (เดโม) ไม่มีระบบยืนยันตัวตนจริงให้ส่งอีเมล → คงข้อความ "ติดต่อ HQ" เดิมไว้
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // ── ขั้นตอน "กรอกเลขยืนยันแล้วตั้งรหัสใหม่ที่หน้านี้เลย" (บอสสั่ง 1 ก.ย. 69) ──────
  //    วิธีเดียวกับตอนดูรหัสผ่านของตัวเอง: ระบบส่งเลขไปที่อีเมลเข้าระบบ → เอาเลขมากรอก
  //    ไม่ต้องกดลิงก์ข้ามเว็บ จึงไม่ต้องพึ่งการตั้งค่าที่อยู่ปลายทางที่หน้าจัดการโปรเจกต์
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetExp, setResetExp] = useState(0);     // เลขยืนยันหมดอายุกี่โมง (ms)
  const [resetLeft, setResetLeft] = useState(0);   // เหลืออีกกี่วินาที (ไว้โชว์บนจอ)

  // ── กดรีเฟรช/ปิดหน้าไปแล้วกลับมา ต้องกรอกเลขเดิมต่อได้จนกว่าจะหมดอายุ (บอสสั่ง 2 ก.ย. 69) ──
  //    เดิมพอรีเฟรช ช่องกรอกหายหมด ต้องกดขอเลขใหม่ ซึ่งติดด่านกันขอถี่ (3 ครั้ง/15 นาที)
  //    → กลายเป็นตั้งรหัสใหม่ไม่ได้เลยทั้งที่เลขในอีเมลยังใช้ได้
  //    เก็บแค่ "อีเมลที่ขอไว้" กับ "เวลาหมดอายุ" ในเครื่องผู้ใช้ — ไม่มีเลขยืนยัน/รหัสผ่านใด ๆ
  const RESET_KEY = "pms_reset_otp";
  const OTP_อายุ = 60 * 60 * 1000;   // เลขจากอีเมลมีอายุ 1 ชั่วโมง
  useEffect(() => {
    try {
      const เก็บไว้ = JSON.parse(localStorage.getItem(RESET_KEY) || "null") as { email: string; exp: number } | null;
      if (เก็บไว้ && เก็บไว้.exp > Date.now()) {
        setEmail(e => e || เก็บไว้.email);
        setResetExp(เก็บไว้.exp); setResetOpen(true);
        setForgotMsg({ ok: true, text: `ส่งเลขยืนยันไปที่ ${เก็บไว้.email} แล้ว — เอาเลขจากอีเมลมากรอกด้านล่างแล้วเข้าระบบได้เลย` });
      } else if (เก็บไว้) localStorage.removeItem(RESET_KEY);
    } catch { /* อ่านไม่ได้ = เริ่มใหม่ตามปกติ */ }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!resetOpen || !resetExp) { setResetLeft(0); return; }
    const นับ = () => {
      const เหลือ = Math.max(0, Math.round((resetExp - Date.now()) / 1000));
      setResetLeft(เหลือ);
      if (เหลือ === 0) {
        ลืมเลขที่ขอไว้(); setResetOpen(false);
        setForgotMsg({ ok: false, text: "เลขยืนยันหมดอายุแล้ว — กด \"ลืมรหัสผ่าน?\" เพื่อขอเลขใหม่" });
      }
    };
    นับ();
    const t = setInterval(นับ, 1000);
    return () => clearInterval(t);
  }, [resetOpen, resetExp]);   // eslint-disable-line react-hooks/exhaustive-deps

  function ลืมเลขที่ขอไว้() {
    setResetExp(0);
    try { localStorage.removeItem(RESET_KEY); } catch { /* ไม่มีที่เก็บ = ไม่ต้องล้าง */ }
  }
  const นาทีวินาที = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const busy = loading;

  // ── บัญชีต้องตรงกับแอปที่กำลังเข้า ──────────────────────────────────────────
  //
  // ⚠️ บั๊กจริง (ผู้ใช้แจ้ง 18 ส.ค. 69): เอารหัสสำนักงานใหญ่ไปกรอกที่หน้าเข้าสู่ระบบของดีลเลอร์
  //    แล้ว "เข้าได้" แถมถูกพาไป /hq/dashboard ซึ่งไม่มีอยู่ในแอปดีลเลอร์ → เจอหน้า 404
  //    ต้นเหตุ: หลังล็อกอินสำเร็จโค้ดดูแค่ "บัญชีนี้เป็น HQ หรือดีลเลอร์" แล้วส่งไปตามนั้น
  //    ไม่เคยถามว่า "แอปที่เขายืนอยู่ตอนนี้ใช่ที่ของเขาหรือเปล่า"
  //    (สองแอปคนละที่อยู่ ทางที่ถูกคือปฏิเสธแล้วบอกให้ไปเข้าที่ถูก ไม่ใช่พาข้ามแอปให้)
  //
  // ⚠️ ต้องออกจากระบบให้ด้วย — ตอนเช็คเจอ ใบผ่านถูกออกให้ไปแล้ว
  //    ถ้าปล่อยไว้ = มีใบผ่านของคนสำนักงานใหญ่ค้างอยู่บนโดเมนของดีลเลอร์
  const WRONG_APP = isHQ
    ? "บัญชีนี้เป็นของดีลเลอร์ — กรุณาเข้าสู่ระบบที่หน้าของดีลเลอร์"
    : "บัญชีนี้เป็นของสำนักงานใหญ่ — กรุณาเข้าสู่ระบบที่หน้าของสำนักงานใหญ่";

  /** เข้าได้จริงหรือไม่ · คืน true = พาเข้าแล้ว · false = ปฏิเสธและแสดงเหตุผลแล้ว */
  const enter = (scopeAll: boolean): boolean => {
    if (scopeAll !== isHQ) {
      logout();
      setError(WRONG_APP);
      setLoading(false);
      return false;
    }
    router.push(scopeAll ? "/hq/dashboard" : "/dashboard");
    return true;
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // signIn เป็น async แล้ว — โหมด supabase รอ signInWithPassword จริง · โหมด local เร็วทันที
    const r = await signIn(email.trim(), password.trim());
    if (r.ok) enter(r.session.scopeAll);
    else { setError(r.error); setLoading(false); }
  }

  // ── เข้าระบบทันที (เฉพาะโหมดเดโม) ─────────────────────────────────────────────
  // ⚠️ ต้องผูกกับ !REAL_BACKEND เท่านั้น ห้ามใช้ธงอื่น (เช่น NODE_ENV) เด็ดขาด
  //    ระบบจริงตั้ง NEXT_PUBLIC_DATA_SOURCE=supabase → REAL_BACKEND=true → ปุ่มนี้ไม่ถูกเรนเดอร์เลย
  //    ถ้าหลุดไปโผล่บนระบบจริง = ใครก็กดเข้าเป็นผู้ดูแลได้โดยไม่ต้องรู้รหัสผ่าน
  async function quickLogin(demoEmail: string) {
    setError(null);
    setLoading(true);
    const r = await signIn(demoEmail, DEMO_PASSWORD);
    if (r.ok) enter(r.session.scopeAll);
    else { setError(r.error); setLoading(false); }
  }

  // ── มาจากปุ่มข้ามเดโม (?autologin=1) → เข้าให้เลย ไม่ต้องกดซ้ำที่หน้านี้ ──
  // บอสสั่ง 18 ส.ค. 69: "กดเข้าใช้ให้เข้าไปเลย ไม่ต้องเด้งมาหน้า login อีกฝั่ง"
  // ⚠️ อยู่ใต้ !REAL_BACKEND เหมือนปุ่มเดโม — ระบบจริงต่อฐานข้อมูลจริงเสมอ จึงเข้าเงื่อนไขนี้ไม่ได้เลย
  //    (ต่อให้ใครเดาลิงก์ ?autologin=1 ยิงใส่ระบบจริง ก็ไม่มีผลอะไร)
  const autoRan = useRef(false);   // กันยิงซ้ำตอน React เรนเดอร์รอบสอง (StrictMode/dev)
  useEffect(() => {
    if (REAL_BACKEND || autoRan.current) return;
    if (new URLSearchParams(window.location.search).get("autologin") !== "1") return;
    const acct = DEMO_LOGINS.find(d => (isHQ ? d.scopeAll : !d.scopeAll));
    if (!acct) return;
    autoRan.current = true;
    void quickLogin(acct.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ใช้อีเมลในช่องที่กรอกไว้แล้ว — ไม่ต้องเปิดฟอร์มใหม่ซ้อน
  // ── ดีลเลอร์กู้บัญชีเองได้แล้ว (บอสสั่ง 28 ส.ค. 69) ────────────────────────────
  //   เดิมฝั่งดีลเลอร์กดแล้วขึ้นแค่ "ติดต่อ HQ" เพราะกติกาเก่าคือ HQ คุมรหัสผ่านทั้งหมด
  //   ตอนนี้ดีลเลอร์เปลี่ยนรหัสเองได้อยู่แล้ว การลืมรหัสจึงต้องกู้เองได้ด้วย ไม่ต้องรอคนอื่น
  //   ปลายทางลิงก์ = /reset-password ของแอปที่กดมา (แต่ละแอปมีหน้าของตัวเอง)
  //   ⚠️ โหมดเดโมไม่มีระบบยืนยันตัวตนจริง จึงบอกในหน้าว่าเป็นข้อมูลตัวอย่าง ไม่มีการส่งอีเมล
  async function handleForgot() {
    // โหมดตัวอย่าง (เว็บเดโม) — ไม่มีระบบอีเมลจริงให้ส่ง บอกในหน้าตรง ๆ
    // ห้ามเด้งกล่องที่มีอีเมลติดต่อซึ่งไม่มีอยู่จริง (บอสสั่งเอาออก 2 ก.ย. 69)
    if (!REAL_BACKEND) {
      setForgotMsg({ ok: false, text: "หน้านี้เป็นข้อมูลตัวอย่าง จึงไม่มีการส่งอีเมลจริง" });
      return;
    }
    const e = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(e)) {
      setForgotMsg({ ok: false, text: "กรอกอีเมลในช่องด้านบนก่อน แล้วกด \"ลืมรหัสผ่าน?\" อีกครั้ง" });
      return;
    }
    setForgotBusy(true);
    setForgotMsg(null);
    const r = await sbSendPasswordReset(e);
    setForgotBusy(false);
    if (r.ok) {
      const exp = Date.now() + OTP_อายุ;
      setResetOpen(true); setResetCode(""); setResetExp(exp);
      try { localStorage.setItem(RESET_KEY, JSON.stringify({ email: e, exp })); } catch { /* ไม่มีที่เก็บ = รีเฟรชแล้วต้องขอใหม่ */ }
      setForgotMsg({ ok: true, text: `ส่งเลขยืนยันไปที่ ${e} แล้ว — เปิดอีเมลแล้วเอาเลขยืนยันมากรอกด้านล่างแล้วเข้าระบบได้เลย` });
    } else {
      setForgotMsg({ ok: false, text: r.error });
    }
  }

  /** เอาเลขจากอีเมลมากรอก แล้ว "เข้าสู่ระบบได้เลย" — ไม่ต้องตั้งรหัสใหม่ (บอสสั่ง 2 ก.ย. 69)
   *  คนที่ลืมรหัสส่วนใหญ่แค่อยากเข้าไปทำงานต่อ ไม่ได้อยากคิดรหัสใหม่ตอนนั้น
   *  อยากเปลี่ยนรหัสค่อยไปเปลี่ยนที่หน้าบัญชีของตัวเองทีหลังได้ */
  async function handleLoginWithCode() {
    const e = email.trim();
    if (!resetCode.trim()) { setForgotMsg({ ok: false, text: "กรอกเลขยืนยันที่ได้จากอีเมลก่อน" }); return; }
    setForgotBusy(true);
    const r = await sbLoginWithCode(e, resetCode);
    if (!r.ok) { setForgotBusy(false); setForgotMsg({ ok: false, text: r.error }); return; }

    // ยืนยันผ่านแล้ว = ถือใบผ่านจริงอยู่ในมือ · เช็กก่อนว่าบัญชีนี้เป็นของแอปที่ยืนอยู่จริงไหม
    //   (กติกาเดียวกับล็อกอินด้วยรหัสผ่าน — บัญชีสำนักงานใหญ่ห้ามเข้าที่หน้าดีลเลอร์ และกลับกัน)
    const me = await sbRestore();
    if (!me) { setForgotBusy(false); setForgotMsg({ ok: false, text: "เข้าสู่ระบบไม่สำเร็จ — ลองใหม่อีกครั้ง" }); return; }
    if (me.scopeAll !== isHQ) {
      await sbSignOut();
      setForgotBusy(false);
      setForgotMsg({ ok: false, text: WRONG_APP });
      return;
    }
    ลืมเลขที่ขอไว้();
    setResetOpen(false); setResetCode("");
    setForgotMsg({ ok: true, text: "ยืนยันแล้ว — กำลังพาเข้าระบบ" });
    // เปลี่ยนหน้าแบบเต็ม ไม่ใช่ router.push — ให้ตัวจัดการสิทธิ์เริ่มใหม่แล้วอ่านใบผ่านที่เพิ่งได้
    // (router.push อยู่ในหน้าเดิม ตัวจัดการสิทธิ์ยังจำสถานะ "ยังไม่ล็อกอิน" ค้างอยู่)
    window.location.href = isHQ ? "/hq/dashboard" : "/dashboard";
  }

  const inputWrap =
    "flex h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-slate-500 " +
    "transition focus-within:border-[#2563eb] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#2563eb]/15";
  const inputEl = "w-full bg-transparent text-[0.92rem] text-slate-800 outline-none placeholder:text-slate-400";
  // globals.css มี global `input:focus-visible { outline }` แบบ unlayered → utility ใน @layer แพ้เสมอ
  // ใช้ inline style (ชนะทุก layer) กันกรอบซ้อนเล็กๆ รอบ input; ตัวบอกโฟกัสใช้ focus-within ring ของ wrapper
  const noOutline: React.CSSProperties = { outline: "none" };

  return (
    <div className="flex min-h-[600px] flex-col bg-white px-8 py-8 sm:px-12">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-sm">
          {/* Heading */}
          <h2 className="text-[2rem] font-extrabold tracking-tight text-[#0e2a5c]">Login</h2>
          <p className="mt-1.5 text-sm text-slate-500">{isHQ ? "เข้าสู่ระบบสำนักงานใหญ่" : "เข้าสู่ระบบเพื่อใช้งานระบบ"}</p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4" noValidate>
            {/* Email */}
            <div>
              {/* ⚠️ ตัดช่องว่างทิ้งตั้งแต่ตอนพิมพ์ (ผู้ใช้แจ้ง 25 ส.ค. 69) — เดิมตัดตอนกดเข้าระบบเท่านั้น
                  ผู้ใช้เห็นช่องว่างนำหน้าค้างอยู่ในช่อง เลยไม่แน่ใจว่าที่เข้าไม่ได้เพราะอะไร
                  อีเมลไม่มีช่องว่างอยู่แล้วโดยธรรมชาติ ตัดทิ้งได้เลยไม่ต้องถาม */}
              <label htmlFor="login-email" className="mb-1 block text-[0.78rem] font-bold text-[#0e2a5c]">อีเมล / Email</label>
              <div className={inputWrap}>
                <IconMail />
                <input id="login-email" type="text" inputMode="email" autoComplete="username" value={email}
                  onChange={(e) => setEmail(e.target.value.replace(/\s/g, ""))} placeholder={isHQ ? "name@benjamin.com" : "dealer@example.com"} required className={inputEl} style={noOutline} />
              </div>
            </div>

            {/* Password */}
            <div>
              {/* ตัดช่องว่างเหมือนช่องอีเมล (บอสสั่ง 25 ส.ค. 69) — ใช้กับทั้งสำนักงานใหญ่และดีลเลอร์
                  เพราะไฟล์นี้เป็นหน้าเข้าสู่ระบบตัวเดียวกันของทั้งสองแอป (variant hq/dealer)
                  ⚠️ ผลข้างเคียงที่ต้องรู้: ถ้าวันหนึ่งมีรหัสผ่านที่ตั้งใจให้มีเว้นวรรคจริง จะพิมพ์ไม่ได้
                  ตอนนี้ไม่มีบัญชีแบบนั้น และช่องว่างติดมากับการ copy-paste เป็นปัญหาที่เจอจริงมากกว่า */}
              <label htmlFor="login-password" className="mb-1 block text-[0.78rem] font-bold text-[#0e2a5c]">รหัสผ่าน / Password</label>
              <div className={inputWrap}>
                <IconLock />
                <input id="login-password" type={showPass ? "text" : "password"} autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\s/g, ""))} placeholder="••••••••" required className={inputEl} style={noOutline} />
                <button type="button" onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} aria-pressed={showPass}
                  className="shrink-0 rounded-md p-1 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40">
                  {showPass ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            {/* Forgot — เดิมมี checkbox "จดจำฉันไว้ในระบบ" คู่กัน แต่ไม่เคยถูกส่งเข้า signIn() เลย
                (session ตั้งใจแยกต่อแท็บกันบัญชีรั่วข้ามแท็บ — ดู client.ts) ลบทิ้งแทนแก้ให้ทำงานจริง
                เพื่อไม่ย้อนกลับไปเจอบั๊กเดิมที่ร้ายแรงกว่า (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69) */}
            <div className="flex items-center justify-end">
              <button type="button" onClick={handleForgot} disabled={forgotBusy}
                className="text-[0.85rem] font-bold text-[#1d4ed8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40 rounded disabled:opacity-60">
                {forgotBusy ? "กำลังส่ง…" : "ลืมรหัสผ่าน?"}
              </button>
            </div>

            {forgotMsg && (
              <p role="alert" className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium ${forgotMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`}>
                {forgotMsg.text}
              </p>
            )}

            {/* เข้าระบบด้วยเลขยืนยัน — โผล่หลังกด "ลืมรหัสผ่าน?" สำเร็จ
                บอสสั่ง 2 ก.ย. 69: ไม่ต้องตั้งรหัสใหม่ เอาเลขจากอีเมลมากรอกแล้วเข้าได้เลย
                (อยากเปลี่ยนรหัสค่อยไปเปลี่ยนที่หน้าบัญชีของตัวเองทีหลัง) */}
            {resetOpen && (
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[0.8rem] font-bold text-slate-700">เข้าสู่ระบบด้วยเลขยืนยัน</span>
                  {resetLeft > 0 && (
                    <span className="text-[0.7rem] text-slate-500">เลขใช้ได้อีก <b>{นาทีวินาที(resetLeft)}</b> นาที</span>
                  )}
                </div>
                <input value={resetCode} aria-label="เลขยืนยันจากอีเมล" autoComplete="one-time-code" autoFocus
                  onChange={ev => {
                    const v = ev.target.value;
                    // รับได้ทั้งเลขและลิงก์ที่ก๊อปมาจากอีเมล (แม่แบบอีเมลมาตรฐานมีแต่ลิงก์)
                    setResetCode(/^https?:\/\//i.test(v.trim()) || v.includes("token=") ? v.trim() : v.replace(/\D/g, "").slice(0, 12));
                  }}
                  onKeyDown={ev => { if (ev.key === "Enter") { ev.preventDefault(); void handleLoginWithCode(); } }}
                  placeholder="เลขยืนยันจากอีเมล (หรือวางลิงก์)"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-center text-[0.95rem] tracking-[0.12em] text-slate-800 outline-none" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => void handleLoginWithCode()} disabled={forgotBusy}
                    className="h-9 flex-1 rounded-lg bg-[#1d4ed8] text-[0.85rem] font-bold text-white disabled:opacity-60">
                    {forgotBusy ? "กำลังตรวจเลข…" : "เข้าสู่ระบบ"}
                  </button>
                  <button type="button" onClick={() => { setResetOpen(false); setForgotMsg(null); ลืมเลขที่ขอไว้(); }}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[0.85rem] font-semibold text-slate-600">
                    ยกเลิก
                  </button>
                </div>
                <div className="text-[0.68rem] leading-relaxed text-slate-500">
                  เข้าได้แล้วอยากเปลี่ยนรหัสผ่าน ไปที่ ตั้งค่า › บัญชีของฉัน ได้ตลอด
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600">{error}</p>
            )}

            {/* Submit */}
            <button type="submit" disabled={busy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0e2a5c] text-[0.95rem] font-bold text-white shadow-[0_10px_30px_-12px_rgba(14,42,92,0.55)] transition hover:bg-[#12326e] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2563eb]/30 disabled:cursor-not-allowed disabled:opacity-70">
              {loading
                ? <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-white/30 border-t-white" aria-hidden="true" />
                : "เข้าสู่ระบบ"}
            </button>
          </form>

          {/* ── โหมดเดโม: กดเข้าใช้งานได้เลย ไม่ต้องจำอีเมล/รหัส ──
              ไม่มีในระบบจริง (REAL_BACKEND=true) — ดูเหตุผลที่ quickLogin */}
          {!REAL_BACKEND && (
            <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3.5">
              <p className="mb-2.5 text-center text-[0.72rem] font-bold uppercase tracking-wide text-slate-500">
                โหมดสาธิต — เข้าใช้งานได้เลย
              </p>
              <div className="flex flex-col gap-2">
                {DEMO_LOGINS.filter(d => (isHQ ? d.scopeAll : !d.scopeAll)).map(d => (
                  <button key={d.email} type="button" disabled={busy} onClick={() => void quickLogin(d.email)}
                    className="flex h-10 w-full items-center justify-center rounded-lg border border-[#0e2a5c]/25 bg-white text-[0.85rem] font-bold text-[#0e2a5c] transition hover:bg-[#0e2a5c]/5 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60">
                    {d.label}
                  </button>
                ))}
                {/* ── ข้ามไปเดโมของอีกฝั่ง (บอสสั่ง 18 ส.ค. 69: รวมทางเข้าไว้ที่เดียว) ──
                    ฝั่งดีลเลอร์กับสำนักงานใหญ่เป็นคนละแอป จึงคนละที่อยู่เว็บ — เชื่อมด้วยลิงก์
                    ⚠️ ปลายทางมาจากค่าตั้งค่า ไม่ฝังในโค้ด · ระบบจริงไม่ตั้งค่านี้ = ไม่มีปุ่มนี้เลย
                       (และถึงตั้ง ก็อยู่ในบล็อก !REAL_BACKEND ซึ่งระบบจริงไม่เรนเดอร์อยู่แล้ว) */}
                {OTHER_DEMO_URL && (
                  <a href={OTHER_DEMO_URL}
                    className="flex h-10 w-full items-center justify-center rounded-lg border border-dashed border-[#0e2a5c]/30 bg-white text-[0.85rem] font-bold text-[#0e2a5c] transition hover:bg-[#0e2a5c]/5">
                    {isHQ ? "เข้าใช้งานเป็น ดีลเลอร์" : "เข้าใช้งานเป็น สำนักงานใหญ่"}
                  </a>
                )}
              </div>
              <p className="mt-2.5 text-center text-[0.68rem] text-slate-400">ข้อมูลทั้งหมดเป็นข้อมูลตัวอย่าง</p>
            </div>
          )}

        </div>
      </div>

      {/* Footer — ล่างสุดของคอลัมน์ */}
      <footer className="pt-5 text-center text-[0.7rem] text-slate-400">
        © 2569 Benjamin PEB Steel Co., Ltd. All rights reserved.
      </footer>
    </div>
  );
}
