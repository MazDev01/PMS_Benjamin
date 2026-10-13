"use client";

// ── H4 · หน้าตั้งรหัสผ่านใหม่ (ปลายทางของลิงก์รีเซ็ตทางอีเมล) ──────────────────────
// ผู้ใช้กดลิงก์จากอีเมล → มาที่นี่พร้อม recovery token · supabase แลก token เป็น session ให้อัตโนมัติ
// จากนั้นตั้งรหัสใหม่ (auth.updateUser) แล้วให้กลับไปล็อกอินด้วยรหัสใหม่
// เป็นหน้าสาธารณะ (อยู่กลุ่ม (auth) ไม่มี AuthGuard) เพราะตอนกดลิงก์ยังไม่ได้ล็อกอินตามปกติ
import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@pms/shared/lib/data/supabase/client";
import { sbUpdatePassword, sbSignOut } from "@pms/shared/lib/supabaseAuth";
import { Lock, Check, AlertTriangle, KeyRound } from "lucide-react";

const NAVY = "#003366";
const BORDER = "#e5e7eb";

type Phase = "checking" | "ready" | "done" | "invalid";

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // รอ recovery session ที่ supabase แลกจาก token ใน URL (detectSessionInUrl)
  useEffect(() => {
    let settled = false;
    let sb;
    try { sb = getSupabase(); } catch { setPhase("invalid"); return; }
    const ready = () => { if (!settled) { settled = true; setPhase("ready"); } };
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { if (session) ready(); });
    // เผื่อ session ถูกตั้งไปก่อน listener ติด
    void sb.auth.getSession().then(({ data }) => { if (data.session) ready(); });
    // ไม่มี session ภายในเวลาที่กำหนด = ลิงก์ไม่ถูกต้อง/หมดอายุ
    const t = setTimeout(() => { if (!settled) { settled = true; setPhase("invalid"); } }, 4000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  async function submit() {
    setErr("");
    if (pw !== confirm) { setErr("ยืนยันรหัสผ่านใหม่ไม่ตรงกัน"); return; }
    setBusy(true);
    const r = await sbUpdatePassword(pw);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    // ออกจาก recovery session — ให้เข้าสู่ระบบใหม่ด้วยรหัสที่เพิ่งตั้ง
    await sbSignOut("global").catch(() => {});   // ตั้งรหัสใหม่แล้ว ทุกเครื่องที่ใช้รหัสเดิมต้องหลุด (ตั้งใจ)
    setPhase("done");
  }

  const card: React.CSSProperties = {
    width: "100%", maxWidth: 400, background: "#fff", borderRadius: 18,
    boxShadow: "0 24px 64px rgba(0,0,0,.15)", overflow: "hidden",
  };
  const inp: React.CSSProperties = {
    width: "100%", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px 10px 38px",
    fontSize: "0.9rem", color: "#2D2D2D", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef1f5", padding: 20 }}>
      <div style={card}>
        <div style={{ background: NAVY, color: "#fff", padding: "18px 24px", display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
          <KeyRound size={18} /> ตั้งรหัสผ่านใหม่
        </div>
        <div style={{ padding: 24 }}>
          {phase === "checking" && (
            <div style={{ fontSize: "0.86rem", color: "#6b7280", textAlign: "center", padding: "20px 0" }}>
              กำลังตรวจสอบลิงก์…
            </div>
          )}

          {phase === "invalid" && (
            <div style={{ textAlign: "center" }}>
              <AlertTriangle size={34} color="#dc2626" style={{ margin: "6px auto 12px" }} />
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#2D2D2D", marginBottom: 6 }}>ลิงก์ไม่ถูกต้องหรือหมดอายุ</div>
              <div style={{ fontSize: "0.8rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 16 }}>
                กรุณาขอลิงก์ตั้งรหัสผ่านใหม่จากผู้ดูแลระบบอีกครั้ง
              </div>
              <Link href="/hq/login" style={{ color: NAVY, fontWeight: 700, fontSize: "0.84rem" }}>กลับไปหน้าเข้าสู่ระบบ</Link>
            </div>
          )}

          {phase === "done" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#e7f6ee", display: "flex", alignItems: "center", justifyContent: "center", margin: "6px auto 12px" }}>
                <Check size={24} color="#059669" />
              </div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#2D2D2D", marginBottom: 6 }}>ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว</div>
              <div style={{ fontSize: "0.8rem", color: "#6b7280", lineHeight: 1.6, marginBottom: 16 }}>
                เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย
              </div>
              <Link href="/hq/login" className="btn btn-primary btn-md" style={{ textDecoration: "none" }}>เข้าสู่ระบบ</Link>
            </div>
          )}

          {phase === "ready" && (
            <>
              <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: 16 }}>ตั้งรหัสผ่านใหม่สำหรับเข้าสู่ระบบ</div>
              {[
                { v: pw, set: setPw, ph: "รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)" },
                { v: confirm, set: setConfirm, ph: "ยืนยันรหัสผ่านใหม่" },
              ].map((f, i) => (
                <div key={i} style={{ position: "relative", marginBottom: 12 }}>
                  <Lock size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  {/* ห้ามเว้นวรรค — หน้าเข้าสู่ระบบตัดช่องว่างทิ้ง ตั้งไว้แล้วจะพิมพ์เข้าไม่ได้ */}
                  <input type="password" style={inp} value={f.v} placeholder={f.ph}
                    onChange={e => { f.set(e.target.value.replace(/\s/g, "")); setErr(""); }}
                    onKeyDown={e => { if (e.key === "Enter") void submit(); }} />
                </div>
              ))}
              {err && <div style={{ fontSize: "0.76rem", color: "#dc2626", fontWeight: 600, marginBottom: 12 }}>{err}</div>}
              <button onClick={() => void submit()} disabled={busy || !pw} className="btn btn-primary btn-md"
                style={{ width: "100%", justifyContent: "center", ...(busy || !pw ? { opacity: .6, cursor: "not-allowed" } : {}) }}>
                {busy ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
