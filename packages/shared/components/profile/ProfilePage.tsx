"use client";

// ─── โปรไฟล์ของฉัน — ใช้ได้ทั้ง HQ และดีลเลอร์ (แยก persist ต่อ workspace) ─────
// แก้รูป/ชื่อ/อีเมล/เบอร์ + เปลี่ยนรหัสผ่าน (เดโม) · บันทึกลง localStorage แล้วอัปเดต Topbar ทันที
//
// เดิมไฟล์นี้อยู่แค่ apps/dealer/app/(app)/profile/page.tsx เท่านั้น — ตอนแยกโมโนเรโปจาก main
// (ที่เดิมเป็นแอปเดียว มีแค่ /profile เส้นทางเดียวใช้ร่วมกัน) ไม่ได้ย้ายมาไว้ที่ apps/hq ด้วย
// ปุ่ม "โปรไฟล์" ใน Topbar ของ HQ จึงพา router.push("/profile") ไปเจอ 404 เสมอ (ไม่มี route จริง)
// ย้ายมาไว้ที่นี่ (SSOT) ให้ page.tsx ทั้งสองแอป re-export ไฟล์เดียวกัน — เหมือนแพทเทิร์น DealerDashboard
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@pms/shared/context/RoleContext";
import {
  defaultProfileEmail, type UserProfile,
} from "@pms/shared/lib/mock";
import { useUserProfile } from "@pms/shared/lib/useUserProfile";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { sbChangeOwnPassword } from "@pms/shared/lib/supabaseAuth";
import { REAL_BACKEND, DATA_SOURCE } from "@pms/shared/lib/data/config";
import { getSupabase } from "@pms/shared/lib/data/supabase/client";

/** ใบผ่านของผู้ใช้ที่กำลังล็อกอิน — โหมด api เก็บใน cookie httpOnly หน้าเว็บอ่านไม่ได้ (และไม่ต้อง)
 *  คืนค่าว่างในโหมดนั้น แล้วให้ fetch ส่ง cookie ไปเอง (credentials: same-origin) */
async function ใบผ่านของฉัน(): Promise<string> {
  if (DATA_SOURCE === "api") return "";
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? "";
  } catch { return ""; }
}
import { PRIMARY, STEEL } from "@pms/shared/lib/theme";
import { fileToResizedDataURL } from "@pms/shared/lib/imageResize";
import {
  UserCircle, Mail, Phone, Camera, Check, ShieldCheck, Building2, Lock, KeyRound, Trash2, Eye, EyeOff,
} from "lucide-react";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";

const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const ROLE_LABEL: Record<string, string> = {
  HQ_MANAGEMENT: "ผู้บริหารสำนักงานใหญ่",
  DEALER_ADMIN: "ผู้จัดการดีลเลอร์",
  DEALER_SALES: "เซลส์",
  DEALER_SITE: "เซลส์ภาคสนาม",
};

export default function ProfilePage() {
  const { session, isHQ, hydrated } = useRole();
  const router = useRouter();
  // ฝั่งดีลเลอร์: โปรไฟล์ส่วนตัวถูกรวมเป็น "บัญชีดีลเลอร์" ในหน้าตั้งค่าแล้ว → ส่งไปที่นั่น (HQ ยังใช้หน้านี้)
  //
  // ⚠️ ต้องรอฟื้น session ให้เสร็จก่อน (hydrated) — แก้ 11 ส.ค. 69
  //   ก่อนฟื้นเสร็จ ระบบใช้ session ตั้งต้นซึ่งเป็นของ "ดีลเลอร์" ทำให้ isHQ เป็นเท็จชั่วขณะ
  //   ผู้ใช้สำนักงานใหญ่ที่กดรีเฟรชหน้าโปรไฟล์จึงถูกเด้งไป /settings ทันทีทุกครั้ง
  //   ซึ่งฝั่งสำนักงานใหญ่ไม่มีเส้นทางนั้น (ของเขาคือ /hq/settings) → ตกไปหน้าไม่พบหน้าที่ต้องการ
  //   อาการที่ผู้ใช้เห็น: แก้โปรไฟล์แล้วรีเฟรชดู กลับไม่ได้เห็นหน้าโปรไฟล์อีกเลย
  useEffect(() => { if (hydrated && !isHQ) router.replace("/settings"); }, [hydrated, isHQ, router]);
  // เริ่มด้วยค่า default (deterministic — server/client ตรงกัน) แล้วโหลดจาก localStorage หลัง mount กัน hydration mismatch
  const userProfile = useUserProfile(); // อ่าน/เขียนผ่าน repo (โหมด supabase = ตาราง profiles)
  const [form, setForm] = useState<UserProfile>({ name: session.name, email: defaultProfileEmail(session.dealerCode), phone: "" });
  useEffect(() => { if (userProfile.loaded) setForm(userProfile.profile); }, [userProfile.loaded, userProfile.profile]);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ cur: "", next: "", confirm: "" });
  // ช่องที่กำลัง "เปิดดู" อยู่ (ปุ่มลูกตา · บอสสั่ง 2 ก.ย. 69) — แยกทีละช่อง
  const [เปิดดูรหัส, setเปิดดูรหัส] = useState({ cur: false, next: false, confirm: false });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── ฟอร์มเปลี่ยนรหัสกางเมื่อกดปุ่มเท่านั้น (บอสสั่ง 2 ก.ย. 69) ──────────────────
  //   คนเข้าหน้าโปรไฟล์ส่วนใหญ่มาแก้ชื่อ/รูป ไม่ได้มาเปลี่ยนรหัส · กางค้างไว้ตลอดจึงเป็น
  //   ช่องรหัสผ่านเปล่า 3 ช่องที่กินพื้นที่ครึ่งการ์ดโดยไม่มีใครใช้
  const [เปิดฟอร์มรหัส, setเปิดฟอร์มรหัส] = useState(false);
  // ── ดูรหัสผ่านของตัวเอง: ต้องเอาเลขที่ส่งไปทางอีเมลมากรอกก่อน (บอสสั่ง 2 ก.ย. 69) ──
  // ขั้นตอน: ปิดอยู่ → กดขอเลข (ส่งอีเมล) → กรอกเลข → เห็นรหัส (กดซ่อนแล้วกดดูซ้ำได้)
  const [ขั้นดูรหัส, setขั้นดูรหัส] = useState<"ปิด" | "กรอกเลข" | "เห็นแล้ว" | "ซ่อนอยู่">("ปิด");
  const [เลขยืนยัน, setเลขยืนยัน] = useState("");
  const [ส่งไปที่, setส่งไปที่] = useState("");
  const [รหัสที่เห็น, setรหัสที่เห็น] = useState("");
  const [msgReveal, setMsgReveal] = useState<{ ok: boolean; text: string } | null>(null);
  const [กำลังดู, setกำลังดู] = useState(false);

  /** ยิงคำสั่งไปที่เส้นทางของผู้ดูแล — โหมด cookie ไม่ต้องแนบใบผ่าน (เหมือน adminApi) */
  async function เรียกเส้นทางรหัสผ่าน(payload: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
    const token = await ใบผ่านของฉัน();
    const res = await fetch("/api/account/hq-secret", {
      method: "POST", credentials: "same-origin",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, data };
  }

  /** เก็บสำเนารหัสใหม่ไว้ให้ดูย้อนหลัง — คืน false ถ้าเก็บไม่สำเร็จ (ไม่ถือว่าเปลี่ยนรหัสล้มเหลว) */
  async function เก็บสำเนารหัสผ่าน(password: string): Promise<boolean> {
    try {
      const { ok } = await เรียกเส้นทางรหัสผ่าน({ op: "save", password });
      return ok;
    } catch { return false; }
  }

  async function ขอเลขทางอีเมล() {
    setMsgReveal(null); setกำลังดู(true);
    try {
      const { ok, data } = await เรียกเส้นทางรหัสผ่าน({ op: "send" });
      if (!ok) { setMsgReveal({ ok: false, text: String(data.error ?? "ส่งเลขยืนยันไม่สำเร็จ") }); return; }
      setส่งไปที่(String(data.sentTo ?? "")); setขั้นดูรหัส("กรอกเลข"); setเลขยืนยัน("");
    } finally { setกำลังดู(false); }
  }

  async function ยืนยันเลขแล้วดูรหัส() {
    setMsgReveal(null);
    const เป็นลิงก์ = /^https?:\/\//i.test(เลขยืนยัน.trim()) || เลขยืนยัน.includes("token=");
    if (!เป็นลิงก์ && เลขยืนยัน.replace(/\D/g, "").length < 6) {
      setMsgReveal({ ok: false, text: "กรอกเลขยืนยันจากอีเมล หรือวางลิงก์ที่ได้จากอีเมล" }); return;
    }
    setกำลังดู(true);
    try {
      const { ok, data } = await เรียกเส้นทางรหัสผ่าน({ op: "verify", code: เลขยืนยัน });
      if (!ok) { setMsgReveal({ ok: false, text: String(data.error ?? "ยืนยันไม่สำเร็จ") }); return; }
      setรหัสที่เห็น(String(data.password ?? "")); setขั้นดูรหัส("เห็นแล้ว"); setเลขยืนยัน("");
    } finally { setกำลังดู(false); }
  }

  // รหัสที่โชว์บนจอต้องไม่ค้างไว้ตลอด — ปิดตาเองหลัง 60 วินาที (ยังกดดูซ้ำได้ ไม่ต้องขอเลขใหม่)
  useEffect(() => {
    if (ขั้นดูรหัส !== "เห็นแล้ว") return;
    const t = setTimeout(() => setขั้นดูรหัส("ซ่อนอยู่"), 60_000);
    return () => clearTimeout(t);
  }, [ขั้นดูรหัส]);

  const roleLabel = ROLE_LABEL[session.role] ?? "สมาชิก";
  const initial = (form.name || session.name).charAt(0).toUpperCase();
  const set = (k: keyof UserProfile, v: string) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); };

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้หลังถูกปฏิเสธ
    if (!file) return;
    // ไฟล์ที่ไม่ผ่านการตรวจต้องบอกเหตุผล ไม่ใช่เงียบแล้วไม่มีอะไรเกิดขึ้น (ผู้ใช้จะนึกว่าปุ่มเสีย)
    try { set("avatar", await fileToResizedDataURL(file, 256)); } // ย่อก่อนเก็บ กัน quota เต็ม
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นรูปโปรไฟล์ไม่ได้"); }
  }

  function save() {
    const clean: UserProfile = {
      name: form.name.trim() || session.name,
      email: form.email.trim() || defaultProfileEmail(session.dealerCode),
      phone: form.phone.trim(),
      avatar: form.avatar,
    };
    // เขียนผ่าน repo · ล้มเหลวต้องบอก ไม่ใช่กลืน error แล้วขึ้นว่าบันทึกแล้ว
    void userProfile.save(clean)
      .catch(e => แจ้งพลาด("บันทึกโปรไฟล์ไม่สำเร็จ: " + friendlyError(e)));
    setForm(clean);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  const [pwBusy, setPwBusy] = useState(false);
  async function changePassword() {
    if (pwBusy) return;
    if (!pw.cur || !pw.next) { setPwMsg({ ok: false, text: "กรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่" }); return; }
    if (pw.next.length < 8) { setPwMsg({ ok: false, text: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ ok: false, text: "ยืนยันรหัสผ่านใหม่ไม่ตรงกัน" }); return; }

    // H3 — เปลี่ยนรหัสจริงในโหมด supabase (ยืนยันรหัสปัจจุบันก่อน) · โหมดเดโมไม่มีระบบยืนยันตัวตนจริง
    if (!REAL_BACKEND) {
      setPwMsg({ ok: false, text: "โหมดเดโม: เปลี่ยนรหัสผ่านจริงไม่ได้ (ต้องมีระบบยืนยันตัวตน)" });
      return;
    }
    setPwBusy(true);
    const r = await sbChangeOwnPassword(pw.cur, pw.next);
    setPwBusy(false);
    if (!r.ok) { setPwMsg({ ok: false, text: r.error }); return; }
    // เก็บสำเนา (เข้ารหัส) ไว้ให้เจ้าของบัญชีเปิดดูย้อนหลังได้ (บอสสั่ง 2 ก.ย. 69)
    //   ระบบเห็นรหัสได้เฉพาะจังหวะนี้เท่านั้น — Supabase เก็บเป็น hash อ่านกลับไม่ได้
    //   เก็บไม่สำเร็จก็ไม่ถือว่าเปลี่ยนรหัสล้มเหลว (รหัสใหม่ใช้ได้แล้ว) แค่บอกว่าดูย้อนหลังไม่ได้
    const เก็บ = await เก็บสำเนารหัสผ่าน(pw.next);
    setPw({ cur: "", next: "", confirm: "" });
    setMsgReveal(null);
    setPwMsg({ ok: true, text: เก็บ ? "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว" : "เปลี่ยนรหัสผ่านแล้ว — แต่เก็บสำเนาไว้ดูย้อนหลังไม่สำเร็จ" });
    setTimeout(() => setPwMsg(null), 2600);
  }

  const inp: React.CSSProperties = { width: "100%", border: `1px solid ${BORDER}`, borderRadius: 9, padding: "9px 12px 9px 36px", fontSize: "0.86rem", color: STEEL, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "#fff" };
  const lbl: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 700, color: MUTED, marginBottom: 6 };
  // ปุ่มลูกตาเปิดดูรหัสที่พิมพ์ (บอสสั่ง 2 ก.ย. 69) — แยกทีละช่อง ไม่ใช่เปิดพร้อมกันทั้งสามช่อง
  //   ช่อง "ยืนยันรหัสผ่านใหม่" มีไว้กันพิมพ์ผิด ถ้าเปิดดูพร้อมกันหมดก็ไม่เหลืออะไรให้ยืนยัน
  const roBox: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, border: `1px solid ${BORDER}`, background: "#f7f8fa", borderRadius: 9, padding: "9px 12px", fontSize: "0.86rem", color: STEEL };

  /* ── แผง "ดูรหัสผ่านของฉัน" (บอสสั่ง 2 ก.ย. 69) ────────────────────────────────
       ต้องขอเลขทางอีเมลมากรอกก่อนทุกครั้ง — จอที่เปิดค้างไว้จึงเปิดดูไม่ได้
       รหัสที่เห็นคือ "สำเนาที่ระบบเก็บไว้ตอนเปลี่ยนรหัสครั้งล่าสุดผ่านหน้านี้"
       บัญชีที่ยังไม่เคยเปลี่ยนผ่านหน้านี้จะยังไม่มีสำเนา (Supabase เก็บเป็น hash อ่านกลับไม่ได้)
       แยกออกมาเป็นตัวแปรเพราะต้องไปวางรวมแถวเดียวกับปุ่มเปลี่ยนรหัส แต่ตัวมันมีหลายสถานะ */
  const PANEL_ดูรหัส = ขั้นดูรหัส === "เห็นแล้ว" ? (
    <>
      <code style={{ fontWeight: 800, color: STEEL, fontSize: "0.85rem", background: "#f7f8fa",
        border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 12px" }}>{รหัสที่เห็น}</code>
      <button className="btn btn-secondary btn-sm" style={{ color: STEEL }}
        onClick={() => { void navigator.clipboard?.writeText(รหัสที่เห็น).catch(() => {}); }}>คัดลอก</button>
      {/* กดซ่อนแล้วยังกดดูซ้ำได้ ไม่ต้องขอเลขใหม่ (แพตเทิร์นเดียวกับหน้าบัญชีของดีลเลอร์) */}
      <button className="btn btn-secondary btn-sm" style={{ color: STEEL }}
        onClick={() => setขั้นดูรหัส("ซ่อนอยู่")}>ซ่อน</button>
    </>
  ) : ขั้นดูรหัส === "ซ่อนอยู่" ? (
    <>
      <button className="btn btn-secondary btn-sm" style={{ color: STEEL }}
        onClick={() => setขั้นดูรหัส("เห็นแล้ว")}><Eye size={13} /> ดูอีกครั้ง</button>
      <button className="btn btn-secondary btn-sm" style={{ color: STEEL }}
        onClick={() => { setขั้นดูรหัส("ปิด"); setรหัสที่เห็น(""); setMsgReveal(null); }}>เสร็จสิ้น</button>
    </>
  ) : ขั้นดูรหัส === "กรอกเลข" ? (
    <>
      <input aria-label="เลขยืนยันจากอีเมล" autoComplete="one-time-code" value={เลขยืนยัน}
        onChange={e => {
          const v = e.target.value;
          setเลขยืนยัน(/^https?:\/\//i.test(v.trim()) || v.includes("token=") ? v.trim() : v.replace(/\D/g, "").slice(0, 12));
        }}
        placeholder="เลขยืนยันจากอีเมล หรือวางลิงก์"
        style={{ ...inp, paddingLeft: 12, width: 240, textAlign: "center" }} />
      <button className="btn btn-primary btn-sm" disabled={กำลังดู}
        onClick={() => void ยืนยันเลขแล้วดูรหัส()}>{กำลังดู ? "กำลังตรวจ…" : "ยืนยัน"}</button>
      <button className="btn btn-secondary btn-sm" style={{ color: STEEL }}
        onClick={() => { setขั้นดูรหัส("ปิด"); setMsgReveal(null); }}>ยกเลิก</button>
    </>
  ) : (
    <button className="btn btn-secondary btn-md" style={{ color: STEEL }} disabled={กำลังดู}
      onClick={() => void ขอเลขทางอีเมล()}><Eye size={14} /> {กำลังดู ? "กำลังส่งเลข…" : "ดูรหัสผ่าน"}</button>
  );

  if (!isHQ) return null; // ฝั่งดีลเลอร์ redirect ไป /settings (บัญชีดีลเลอร์) แล้ว — ไม่เรนเดอร์โปรไฟล์เดิม

  return (
    <div className="erp">
      <div className="page-head">
        <div>
          <p>ข้อมูลส่วนตัวและความปลอดภัยของบัญชี · {isHQ ? "สำนักงานใหญ่" : "ดีลเลอร์"}</p>
        </div>
      </div>

      {/* ── การ์ดเดียวจบ (บอสสั่ง 2 ก.ย. 69) ────────────────────────────────────────
          เดิมแยกเป็นสองการ์ดซ้าย–ขวา · พอฟอร์มเปลี่ยนรหัสยุบเหลือปุ่ม การ์ดขวาก็เหลือ
          ปุ่มสองใบลอยอยู่กลางพื้นที่ว่างครึ่งจอ — รวมมาไว้ทางซ้ายการ์ดเดียวจึงอ่านเป็นเรื่องเดียวกัน */}
      <div style={{ maxWidth: 760 }}>

        {/* ── การ์ดข้อมูลส่วนตัว ── */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
            <UserCircle size={18} color={PRIMARY} />
            <span style={{ fontSize: "0.92rem", fontWeight: 800, color: STEEL }}>ข้อมูลส่วนตัว</span>
          </div>

          {/* Avatar */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {form.avatar ? (
                <img src={form.avatar} alt="" style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover", boxShadow: "0 2px 8px rgba(0,51,102,.25)" }} />
              ) : (
                <div style={{ width: 76, height: 76, borderRadius: "50%", background: PRIMARY, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.7rem", fontWeight: 900, boxShadow: "0 2px 8px rgba(0,51,102,.25)" }}>{initial}</div>
              )}
              <button onClick={() => fileRef.current?.click()} title="เปลี่ยนรูปโปรไฟล์"
                style={{ position: "absolute", bottom: -2, right: -2, width: 28, height: 28, borderRadius: "50%", background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 2px 6px rgba(0,0,0,.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: PRIMARY }}>
                <Camera size={14} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" aria-label="อัปโหลดรูปโปรไฟล์" onChange={onPickAvatar} style={{ display: "none" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: STEEL }}>{form.name || session.name}</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: "0.65rem", fontWeight: 700, color: PRIMARY, background: "#eef3f8", border: `1px solid #dce5f0`, borderRadius: 999, padding: "3px 10px" }}>
                <ShieldCheck size={11} /> {roleLabel}
              </div>
              {form.avatar && (
                <button onClick={() => set("avatar", "")} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, background: "none", border: "none", color: "#dc2626", fontSize: "0.65rem", fontWeight: 600, cursor: "pointer", padding: 0 }}>
                  <Trash2 size={11} /> ลบรูป
                </button>
              )}
            </div>
          </div>

          {/* ชื่อ */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>ชื่อ–นามสกุล</label>
            <div style={{ position: "relative" }}>
              <UserCircle size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
              <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="ชื่อ–นามสกุล" />
            </div>
          </div>

          {/* อีเมล — HQ แก้ได้ · ดีลเลอร์ใช้อีเมลล็อกอินที่ HQ ตั้งให้ (read-only) */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>อีเมล{!isHQ && " (สำหรับเข้าสู่ระบบ)"}</label>
            {isHQ ? (
              <div style={{ position: "relative" }}>
                <Mail size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
                <input style={inp} type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="name@email.com" />
              </div>
            ) : (
              <>
                <div style={{ ...roBox, gap: 8 }}>
                  <Mail size={14} color={MUTED} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{form.email}</span>
                  <Lock size={12} color="#9ca3af" style={{ marginLeft: "auto", flexShrink: 0 }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, fontSize: "0.65rem", color: "#9ca3af" }}>
                  <Lock size={10} /> อีเมลล็อกอินกำหนดโดยสำนักงานใหญ่ — แก้ไขที่นี่ไม่ได้
                </div>
              </>
            )}
            {/* ── ปุ่มดูรหัสผ่านอยู่ใต้ช่องอีเมล (บอสสั่ง 2 ก.ย. 69) ──────────────────────
                เลขยืนยันถูกส่งไปที่อีเมลช่องนี้ — วางไว้ติดกันแล้วเห็นทันทีว่าจะไปโผล่ที่ไหน
                ไม่ต้องเลื่อนลงไปหาว่า "แล้วเลขส่งไปที่อีเมลไหน" */}
            {isHQ && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>{PANEL_ดูรหัส}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: "0.65rem", color: "#9ca3af" }}>
                  <ShieldCheck size={11} /> สำเนารหัสผ่านถูกเข้ารหัสไว้ที่เซิร์ฟเวอร์ ไม่ได้เก็บเป็นข้อความธรรมดา
                </div>
                {ขั้นดูรหัส === "กรอกเลข" && !msgReveal && (
                  <div style={{ fontSize: "0.68rem", color: MUTED, marginTop: 8 }}>
                    ส่งเลขยืนยันไปที่ {ส่งไปที่} แล้ว — เปิดอีเมลแล้วเอาเลขมากรอก
                  </div>
                )}
                {msgReveal && (
                  <div style={{ fontSize: "0.7rem", fontWeight: 600, marginTop: 8, color: msgReveal.ok ? "#059669" : "#dc2626" }}>
                    {msgReveal.text}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* เบอร์โทร */}
          <div style={{ marginBottom: 18 }}>
            <label style={lbl}>เบอร์โทรศัพท์</label>
            <div style={{ position: "relative" }}>
              <Phone size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
              <input style={inp} value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="08X-XXX-XXXX" />
            </div>
          </div>

          {/* Read-only: ตำแหน่ง + workspace */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
            <div>
              <label style={lbl}>ตำแหน่ง</label>
              <div style={roBox}><ShieldCheck size={14} color={MUTED} /> {roleLabel}</div>
            </div>
            <div>
              <label style={lbl}>{isHQ ? "หน่วยงาน" : "บริษัทดีลเลอร์"}</label>
              <div style={roBox}><Building2 size={14} color={MUTED} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.dealerName}{session.dealerCode ? ` (${session.dealerCode})` : ""}</span></div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="btn btn-primary btn-md" onClick={save}><Check size={15} /> บันทึกโปรไฟล์</button>
            {saved && <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.8rem", fontWeight: 700, color: "#059669" }}><Check size={14} /> บันทึกแล้ว</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 12, fontSize: "0.65rem", color: "#9ca3af" }}>
            <Lock size={11} /> ตำแหน่งและหน่วยงานกำหนดโดยผู้ดูแลระบบ — แก้ไขที่นี่ไม่ได้
          </div>

          {/* ── ส่วนความปลอดภัย ── HQ เปลี่ยนรหัสผ่านเองได้ · ดีลเลอร์จัดการโดยสำนักงานใหญ่ */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, marginTop: 22, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
            <KeyRound size={18} color={PRIMARY} />
            <span style={{ fontSize: "0.92rem", fontWeight: 800, color: STEEL }}>ความปลอดภัย</span>
          </div>

          {isHQ ? (
            <>
              {/* ปุ่มเปิดฟอร์มเปลี่ยนรหัส — ส่วน "ดูรหัสผ่าน" ย้ายไปอยู่ใต้ช่องอีเมลข้างบนแล้ว */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-md" aria-expanded={เปิดฟอร์มรหัส} style={{ color: STEEL }}
                  onClick={() => {
                    // ปิดฟอร์ม = ล้างสิ่งที่พิมพ์ค้างไว้ ไม่เก็บรหัสไว้ในหน่วยความจำหน้าจอโดยไม่จำเป็น
                    setเปิดฟอร์มรหัส(v => { if (v) { setPw({ cur: "", next: "", confirm: "" }); setเปิดดูรหัส({ cur: false, next: false, confirm: false }); } return !v; });
                    setPwMsg(null);
                  }}>
                  <KeyRound size={14} /> {เปิดฟอร์มรหัส ? "ยกเลิกการเปลี่ยนรหัสผ่าน" : "เปลี่ยนรหัสผ่าน"}
                </button>
              </div>

              {เปิดฟอร์มรหัส && (<div style={{ borderTop: `1px solid ${BORDER}`, marginTop: 16, paddingTop: 16 }}>
              {[
                { k: "cur" as const, label: "รหัสผ่านปัจจุบัน", ph: "••••••••" },
                { k: "next" as const, label: "รหัสผ่านใหม่", ph: "อย่างน้อย 8 ตัวอักษร" },
                { k: "confirm" as const, label: "ยืนยันรหัสผ่านใหม่", ph: "พิมพ์รหัสผ่านใหม่อีกครั้ง" },
              ].map(f => (
                <div key={f.k} style={{ marginBottom: 14 }}>
                  <label htmlFor={`pw-${f.k}`} style={lbl}>{f.label}</label>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
                    {/* ห้ามเว้นวรรค — หน้าเข้าสู่ระบบตัดช่องว่างทิ้ง ตั้งไว้แล้วจะพิมพ์เข้าไม่ได้ */}
                    <input id={`pw-${f.k}`} style={{ ...inp, paddingRight: 40 }} type={เปิดดูรหัส[f.k] ? "text" : "password"}
                      value={pw[f.k]} placeholder={f.ph}
                      onChange={e => { setPw(p => ({ ...p, [f.k]: e.target.value.replace(/\s/g, "") })); setPwMsg(null); }} />
                    {/* ปุ่มลูกตา — กดค้างไม่ได้ ต้องกดสลับ เพราะบางคนใช้เมาส์อย่างเดียว
                        aria-label เปลี่ยนตามสถานะ เครื่องอ่านหน้าจอจะได้บอกถูกว่ากดแล้วเกิดอะไร */}
                    <button type="button" tabIndex={-1}
                      aria-label={เปิดดูรหัส[f.k] ? `ซ่อน${f.label}` : `แสดง${f.label}`}
                      onClick={() => setเปิดดูรหัส(v => ({ ...v, [f.k]: !v[f.k] }))}
                      style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                        width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
                        background: "none", border: "none", borderRadius: 8, cursor: "pointer", color: MUTED, padding: 0 }}>
                      {เปิดดูรหัส[f.k] ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              ))}
              {pwMsg && (
                <div style={{ fontSize: "0.72rem", fontWeight: 600, color: pwMsg.ok ? "#059669" : "#dc2626", marginBottom: 12 }}>
                  {pwMsg.text}
                </div>
              )}
              {/* ชื่อปุ่มต้องไม่ซ้ำกับปุ่มที่ใช้เปิดฟอร์ม — ซ้ำแล้วทั้งคนและเทสต์แยกไม่ออกว่ากดใบไหน */}
              <button className="btn btn-primary btn-md" onClick={() => void changePassword()} disabled={pwBusy} style={pwBusy ? { opacity: .6, cursor: "not-allowed" } : undefined}><KeyRound size={14} /> {pwBusy ? "กำลังเปลี่ยน…" : "บันทึกรหัสผ่านใหม่"}</button>
              </div>)}
            </>
          ) : (
            // ดีลเลอร์: รหัสผ่านออกและจัดการโดยสำนักงานใหญ่ — แก้เองไม่ได้
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#f5f7fa", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px" }}>
                <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#eef3f8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Lock size={16} color={PRIMARY} />
                </span>
                <div>
                  {/* ข้อความเดิม "ดีลเลอร์เปลี่ยนรหัสผ่านเองไม่ได้" ขัดกับระบบปัจจุบัน (ดีลเลอร์แก้เองได้ 2 ครั้ง · บอสสั่ง 28 ส.ค. 69) */}
                  <div style={{ fontSize: "0.86rem", fontWeight: 700, color: STEEL, marginBottom: 3 }}>เปลี่ยนอีเมล/รหัสผ่านที่หน้าบัญชีเข้าสู่ระบบ</div>
                  <div style={{ fontSize: "0.72rem", color: MUTED, lineHeight: 1.6 }}>
                    ไปที่ ตั้งค่า › บัญชีเข้าสู่ระบบ · แก้เองได้ 2 ครั้ง ครั้งต่อไปต้องให้สำนักงานใหญ่อนุมัติ · ลืมรหัสผ่านใช้ปุ่ม “ลืมรหัสผ่าน?” ที่หน้าเข้าสู่ระบบ
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
