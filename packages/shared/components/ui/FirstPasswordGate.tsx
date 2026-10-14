"use client";

// ── ตั้งรหัสผ่านใหม่ตอนเข้าระบบครั้งแรก (บอสสั่ง 15 ก.ย. 69) ─────────────────────────────
//
// บัญชีที่สร้างจาก "ตั้งเป็นดีลเลอร์" ถูกทำเครื่องหมาย must_change_password ไว้ที่บัญชีเข้าระบบ
//   เข้าครั้งแรกต้องตั้งรหัสของตัวเองก่อนใช้งาน · ครั้งนี้ไม่นับสิทธิ์แก้เอง 2 ครั้ง
//   (บอส: "ตอนเข้ารหัสให้เปลี่ยนฟรี ไม่รวม 2 ครั้งนั้น")
//
// ข้ามหน้านี้เมื่อ:
//   • โหมดข้อมูลตัวอย่าง — ไม่มีบัญชีจริง
//   • สำนักงานใหญ่กด "เข้าระบบแทน" — ต้องไม่ไปตั้งรหัสแทนดีลเลอร์
//   • อ่านสถานะบัญชีไม่ได้ — ไม่ขังผู้ใช้ไว้หน้านี้เพราะเน็ตสะดุด (บันทึกข้อผิดพลาดไว้)
// ⚠️ ด่านจริงของ "ครั้งแรก" อยู่ที่เซิร์ฟเวอร์ (/api/account op=first-password) — หน้านี้แค่พาไปทำ
import { useEffect, useState } from "react";
import { KeyRound, Lock, LogOut, Mail } from "lucide-react";
import { ContactEmailForm } from "./ContactEmailForm";
import { accountStateOnce, ล้างสถานะบัญชี } from "@pms/shared/lib/accountStateOnce";
import { useRole } from "@pms/shared/context/RoleContext";
import { account } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { sbSignOutLocal } from "@pms/shared/lib/supabaseAuth";
import { ตรวจรหัสผ่านใหม่ } from "@pms/shared/lib/passwordRule";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";

const NAVY = "#003366";
// "ต้องยืนยันอีเมล" (ด่าน 1 · 14 ต.ค. 69): บัญชีที่ HQ สร้างให้ ตั้งรหัสแล้ว แต่ยังไม่ยืนยันอีเมลติดต่อ
//   ด่านนี้อยู่ที่หน้าจออย่างเดียว ไม่ปิดข้อมูลที่ฐาน — เรื่องการแจ้งเตือน ไม่ใช่ความปลอดภัย (ข้อตัดสินของบอส)
type ขั้น = "ตรวจ" | "ผ่าน" | "ต้องตั้ง" | "ต้องยืนยันอีเมล";

export function FirstPasswordGate({ children }: { children: React.ReactNode }) {
  const { session, logout } = useRole();
  const [ขั้นตอน, setขั้นตอน] = useState<ขั้น>(REAL_BACKEND ? "ตรวจ" : "ผ่าน");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [สำเร็จ, setสำเร็จ] = useState("");
  const [busy, setBusy] = useState(false);
  const [อีเมลติดต่อ, setอีเมลติดต่อ] = useState("");

  useEffect(() => {
    if (!REAL_BACKEND) return;
    // ⚠️ ไม่ยกเว้นการเข้าระบบแทนดีลเลอร์ (ข้อตัดสิน 13 ต.ค. 69): ใบผ่านที่ได้เป็นของบัญชีนั้นเอง
    //    ฐานข้อมูลปฏิเสธข้อมูลทุกอย่างจนกว่าบัญชีจะตั้งรหัสของตัวเอง (ใบ 0187) — ยกเว้นที่หน้าจอ = เห็นหน้าระบบว่างเปล่า
    //    สำนักงานใหญ่เข้าแทนบัญชีที่ยังไม่ตั้งรหัส จึงต้องเจอหน้าตั้งรหัสเหมือนดีลเลอร์เอง
    if (!session.dealerCode) { setขั้นตอน("ผ่าน"); return; }
    let alive = true;
    accountStateOnce(session.dealerCode)
      .then(s => {
        if (!alive) return;
        setอีเมลติดต่อ(s.contactEmail ?? "");
        setขั้นตอน(s.mustChangePassword ? "ต้องตั้ง" : s.mustVerifyEmail && !s.contactEmailVerified ? "ต้องยืนยันอีเมล" : "ผ่าน");
      })
      .catch(e => {
        // ใบผ่านใช้ไม่ได้แล้ว (สาขาถูกลบ/ปิดใช้งาน) = AuthGuard กำลังพาออกจากระบบอยู่แล้ว ไม่ใช่ข้อผิดพลาดที่ต้องรายงาน
        if (!/unauthorized|401|403|ปิดการใช้งาน/i.test(String((e as Error)?.message ?? e))) logRepoRead("account.state(first-password)", e);
        if (alive) setขั้นตอน("ผ่าน");
      });
    return () => { alive = false; };
  }, [session.dealerCode]);

  async function บันทึก() {
    setErr("");
    const ผิด = ตรวจรหัสผ่านใหม่(pw);
    if (ผิด) { setErr(ผิด); return; }
    if (pw !== pw2) { setErr("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน"); return; }
    setBusy(true);
    try {
      const r = await account.setFirstPassword(pw);
      setสำเร็จ(r.message);
      // รหัสเปลี่ยนแล้วใบผ่านเดิมใช้ต่อไม่ได้ — พาไปเข้าสู่ระบบใหม่ (แบบเดียวกับตอนเปลี่ยนรหัสที่หน้าบัญชี)
      setTimeout(() => {
        void sbSignOutLocal().finally(() => {
          try {
            Object.keys(localStorage)
              .filter(k => k.startsWith("sb-") && k.endsWith("-auth-token"))
              .forEach(k => localStorage.removeItem(k));
          } catch { /* ปิด storage — ยังไงก็ต้องไปหน้าเข้าสู่ระบบ */ }
          window.location.href = "/login";
        });
      }, 1600);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  // ยังไม่รู้ผล: เรนเดอร์ไว้แต่ซ่อน (ตอน build ต้องมีเนื้อหาให้สร้างหน้า — แนวเดียวกับ AuthGuard)
  if (ขั้นตอน === "ตรวจ") return <div style={{ visibility: "hidden" }}>{children}</div>;
  if (ขั้นตอน === "ผ่าน") return <>{children}</>;
  if (ขั้นตอน === "ต้องยืนยันอีเมล") return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef1f5", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#fff", borderRadius: 18, boxShadow: "0 24px 64px rgba(0,0,0,.14)", overflow: "hidden" }}>
        <div style={{ background: NAVY, color: "#fff", padding: "18px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <Mail size={18} />
          <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน</h1>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ margin: "0 0 16px", fontSize: "0.84rem", color: "#374151", lineHeight: 1.7 }}>
            ขั้นสุดท้าย — กรอกอีเมลที่ใช้ติดต่อจริง ระบบจะส่งโค้ดไปให้ยืนยัน สำนักงานใหญ่ใช้อีเมลนี้แจ้งเรื่องสำคัญของงานขายถึงคุณ
          </p>
          <ContactEmailForm initialEmail={อีเมลติดต่อ} dealerCode={session.dealerCode ?? ""} onVerified={() => { ล้างสถานะบัญชี(session.dealerCode ?? undefined); setขั้นตอน("ผ่าน"); }} />
          <button type="button" onClick={logout}
            style={{ marginTop: 16, width: "100%", background: "none", border: "none", color: "#6b7280", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <LogOut size={13} /> ออกจากระบบ
          </button>
        </div>
      </div>
    </main>
  );

  const ช่อง: React.CSSProperties = {
    width: "100%", border: "1px solid #d5dbe4", borderRadius: 10, padding: "11px 12px 11px 38px",
    fontSize: "0.9rem", color: "#1F2937", outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "#fff",
  };
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef1f5", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440, background: "#fff", borderRadius: 18, boxShadow: "0 24px 64px rgba(0,0,0,.14)", overflow: "hidden" }}>
        <div style={{ background: NAVY, color: "#fff", padding: "18px 24px", display: "flex", alignItems: "center", gap: 10 }}>
          <KeyRound size={18} />
          <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 800 }}>ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน</h1>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ margin: "0 0 6px", fontSize: "0.84rem", color: "#374151", lineHeight: 1.7 }}>
            รหัสที่ได้รับจากสำนักงานใหญ่ใช้เข้าระบบครั้งแรกเท่านั้น — ตั้งรหัสของคุณเองก่อนใช้งาน
          </p>
          <p style={{ margin: "0 0 18px", fontSize: "0.74rem", color: "#6b7280", lineHeight: 1.6 }}>
            ครั้งนี้ไม่นับสิทธิ์แก้อีเมล/รหัสผ่านเอง 2 ครั้ง · ยาวอย่างน้อย 8 ตัว ห้ามมีช่องว่าง · ห้ามซ้ำรหัสเดิม
          </p>

          {สำเร็จ ? (
            <div role="status" style={{ fontSize: "0.82rem", fontWeight: 700, color: "#047857", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "12px 14px" }}>
              {สำเร็จ}
            </div>
          ) : (
            <>
              {([
                { id: "fp-new", label: "รหัสผ่านใหม่", v: pw, set: setPw, ph: "อย่างน้อย 8 ตัวอักษร" },
                { id: "fp-confirm", label: "ยืนยันรหัสผ่านใหม่", v: pw2, set: setPw2, ph: "พิมพ์รหัสผ่านใหม่อีกครั้ง" },
              ] as const).map(f => (
                <div key={f.id} style={{ marginBottom: 12 }}>
                  <label htmlFor={f.id} className="form-label">{f.label}</label>
                  <div style={{ position: "relative" }}>
                    <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                    {/* ห้ามเว้นวรรค — หน้าเข้าสู่ระบบตัดช่องว่างทิ้ง ตั้งไว้แล้วจะพิมพ์เข้าไม่ได้ */}
                    <input id={f.id} type="password" autoComplete="new-password" style={ช่อง} value={f.v} placeholder={f.ph} disabled={busy}
                      onChange={e => { f.set(e.target.value.replace(/\s/g, "")); setErr(""); }}
                      onKeyDown={e => { if (e.key === "Enter") void บันทึก(); }} />
                  </div>
                </div>
              ))}
              {err && <div role="alert" style={{ fontSize: "0.76rem", color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{err}</div>}
              <button type="button" className="btn btn-primary btn-md" disabled={busy || !pw}
                onClick={() => void บันทึก()}
                style={{ width: "100%", justifyContent: "center", ...(busy || !pw ? { opacity: .6, cursor: "not-allowed" } : {}) }}>
                {busy ? "กำลังบันทึก…" : "ตั้งรหัสผ่านใหม่"}
              </button>
              <button type="button" onClick={logout} disabled={busy}
                style={{ marginTop: 12, width: "100%", background: "none", border: "none", color: "#6b7280", fontSize: "0.78rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                <LogOut size={13} /> ออกจากระบบ
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
