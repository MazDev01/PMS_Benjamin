"use client";

// ── กรอกและยืนยันอีเมลติดต่อของดีลเลอร์ (ด่าน 1 · ใบ 0194) ─────────────────────────────────────────
//
// ใช้ทั้งในขั้นหลังตั้งรหัสครั้งแรก (FirstPasswordGate) และในแถบเตือนของบัญชีที่ยังไม่ยืนยัน (ContactEmailBanner)
// ขั้น: กรอกอีเมล → ส่งโค้ด → กรอกโค้ด 6 หลัก → ยืนยัน
//   ส่งไม่สำเร็จ (ระบบอีเมลขัดข้อง) = บอกชัด + ปุ่มส่งโค้ดใหม่ + บอกว่า HQ ยืนยันแทนได้ — ไม่ขังผู้ใช้ไว้เงียบ ๆ
//   "ตรวจอีกครั้ง" สำหรับกรณีที่ HQ ยืนยันแทนให้แล้ว
import { useEffect, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { account } from "@pms/shared/lib/data";
import { friendlyError } from "@pms/shared/lib/friendlyError";

const รอส่งใหม่วินาที = 60;

export function ContactEmailForm({ initialEmail, dealerCode, onVerified }: {
  initialEmail: string; dealerCode: string; onVerified: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [ส่งไปที่, setส่งไปที่] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [รอ, setรอ] = useState(0);

  useEffect(() => {
    if (รอ <= 0) return;
    const t = setTimeout(() => setรอ(n => n - 1), 1000);
    return () => clearTimeout(t);
  }, [รอ]);

  async function ส่งโค้ด() {
    setErr(""); setBusy(true);
    try {
      const r = await account.sendContactEmailCode(email.trim());
      setส่งไปที่(r.sentTo); setCode(""); setรอ(รอส่งใหม่วินาที);
    } catch (e) {
      setErr(friendlyError(e));
      // ส่งไม่สำเร็จก็ให้รอก่อนกดใหม่ — กันกดรัวตอนระบบอีเมลล่ม
      setรอ(r => Math.max(r, 15));
    } finally { setBusy(false); }
  }
  async function ยืนยัน() {
    setErr(""); setBusy(true);
    try { await account.verifyContactEmail(code.trim()); onVerified(); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }
  async function ตรวจอีกครั้ง() {
    setErr(""); setBusy(true);
    try {
      const s = await account.state(dealerCode);
      if (s.contactEmailVerified) onVerified();
      else setErr("ยังไม่ได้รับการยืนยัน — กรอกโค้ดจากอีเมล หรือรอสำนักงานใหญ่ยืนยันแทน");
    } catch (e) { setErr(friendlyError(e)); }
    finally { setBusy(false); }
  }

  const ช่อง: React.CSSProperties = { width: "100%", border: "1px solid #d5dbe4", borderRadius: 10, padding: "11px 12px", fontSize: "0.9rem", boxSizing: "border-box", fontFamily: "inherit" };
  return (
    <div>
      <label htmlFor="ce-email" className="form-label">อีเมลติดต่อ (รับแจ้งเตือน)</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <input id="ce-email" type="email" autoComplete="email" style={ช่อง} value={email} disabled={busy}
          placeholder="เช่น sales@บริษัทของคุณ.co.th" onChange={e => { setEmail(e.target.value); setErr(""); }} />
        <button type="button" className="btn btn-secondary btn-md" disabled={busy || !email.trim() || รอ > 0} onClick={() => void ส่งโค้ด()}
          style={{ whiteSpace: "nowrap" }}>
          <Mail size={14} /> {ส่งไปที่ ? (รอ > 0 ? `ส่งโค้ดใหม่ (${รอ})` : "ส่งโค้ดใหม่") : (รอ > 0 ? `ส่งโค้ด (${รอ})` : "ส่งโค้ด")}
        </button>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: "0.72rem", color: "#6b7280", lineHeight: 1.6 }}>
        สำนักงานใหญ่ส่งแจ้งเตือนถึงอีเมลนี้ เช่น เมื่อส่งใบเสนอราคาให้ · ใช้อีเมลที่เปิดอ่านได้จริง ไม่ใช่อีเมลเข้าระบบ
      </p>

      {ส่งไปที่ && (
        <>
          <div role="status" style={{ fontSize: "0.78rem", color: "#047857", marginBottom: 8 }}>ส่งโค้ด 6 หลักไปที่ {ส่งไปที่} แล้ว</div>
          <label htmlFor="ce-code" className="form-label">โค้ดยืนยัน</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input id="ce-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} style={ช่อง} value={code} disabled={busy}
              onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setErr(""); }}
              onKeyDown={e => { if (e.key === "Enter" && code.length === 6) void ยืนยัน(); }} />
            <button type="button" className="btn btn-primary btn-md" disabled={busy || code.length !== 6} onClick={() => void ยืนยัน()}>
              <ShieldCheck size={14} /> ยืนยันอีเมล
            </button>
          </div>
        </>
      )}

      {err && <div role="alert" style={{ fontSize: "0.76rem", color: "#dc2626", fontWeight: 600, marginBottom: 10, lineHeight: 1.6 }}>{err}</div>}
      <button type="button" onClick={() => void ตรวจอีกครั้ง()} disabled={busy}
        style={{ background: "none", border: "none", color: "#2563eb", fontSize: "0.76rem", cursor: "pointer", padding: 0 }}>
        สำนักงานใหญ่ยืนยันแทนให้แล้ว? ตรวจอีกครั้ง
      </button>
    </div>
  );
}
