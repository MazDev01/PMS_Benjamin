"use client";

// ── อีเมลติดต่อของดีลเลอร์ ที่หน้าบัญชี (ไม่บังคับ · บอสตัดสิน 19 ต.ค. 69) ──────────────────────────────────────
//
// เดิมเข้าครั้งแรกต้องตั้งรหัส → เข้าใหม่ → ยืนยันอีเมลก่อนใช้งาน (FirstPasswordGate) + แถบเตือนที่ปิดไม่ได้ (ContactEmailBanner)
// บอสเปลี่ยน: เข้าระบบแล้วเข้าหน้าหลักทันที ไม่มีหน้าบังคับ ไม่มีป้าย/หน้าต่างเตือน
//   ใส่/ยืนยันอีเมลติดต่อ = ทำที่นี่เมื่อดีลเลอร์อยากรับแจ้งเตือนจากสำนักงานใหญ่ (ตามใจ)
//   ไม่มีอีเมลที่ยืนยัน = แจ้งเตือนทางอีเมลไม่ถึง แต่ใช้ระบบได้ครบตามปกติ
import { useEffect, useState } from "react";
import { Mail, CheckCircle2 } from "lucide-react";
import { account } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ContactEmailForm } from "./ContactEmailForm";

export function ContactEmailCard({ dealerCode }: { dealerCode: string }) {
  const [สถานะ, setสถานะ] = useState<{ email: string; verified: boolean } | null>(null);
  const [แก้, setแก้] = useState(false);
  const โหลด = () => {
    if (!REAL_BACKEND || !dealerCode) { setสถานะ({ email: "", verified: false }); return; }
    account.state(dealerCode)
      .then(s => setสถานะ({ email: s.contactEmail ?? "", verified: !!s.contactEmailVerified }))
      .catch(e => { logRepoRead("account.state(contact-email-card)", e); setสถานะ({ email: "", verified: false }); });
  };
  useEffect(โหลด, [dealerCode]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section aria-label="อีเมลติดต่อ" className="card" style={{ padding: 20, maxWidth: 860, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Mail size={16} color="#003366" />
        <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "#003366" }}>อีเมลติดต่อ</h2>
      </div>
      <p style={{ margin: "0 0 12px", fontSize: "0.76rem", color: "#475569" }}>
        ใส่อีเมลแล้วจะได้รับแจ้งเตือนจากสำนักงานใหญ่ เช่น เมื่อสำนักงานใหญ่ส่งราคาให้ · ไม่ใส่ก็ใช้ระบบได้ตามปกติ
      </p>
      {สถานะ === null && <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>}
      {สถานะ && สถานะ.verified && !แก้ && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <CheckCircle2 size={15} color="#166534" />
          <span style={{ fontSize: "0.84rem", color: "#166534", fontWeight: 700 }}>ยืนยันแล้ว: {สถานะ.email}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setแก้(true)}>เปลี่ยนอีเมลติดต่อ</button>
        </div>
      )}
      {สถานะ && (!สถานะ.verified || แก้) && (
        <ContactEmailForm initialEmail={สถานะ.email} dealerCode={dealerCode} onVerified={() => { setแก้(false); โหลด(); }} />
      )}
    </section>
  );
}
