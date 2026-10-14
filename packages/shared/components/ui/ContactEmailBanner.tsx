"use client";

// ── แถบเตือน: บัญชีดีลเลอร์ที่ยังไม่มีอีเมลติดต่อที่ยืนยันแล้ว (ด่าน 1 · ใบ 0194) ─────────────────────────────
//
// ปิดไม่ได้จนกว่าจะยืนยัน แต่ไม่บล็อกการใช้งาน (ข้อตัดสินของบอส 14 ต.ค. 69)
//   ไม่มีอีเมลที่ยืนยัน = แจ้งเตือนจากสำนักงานใหญ่ (เช่น ส่งใบเสนอราคาให้) ไม่ถึงดีลเลอร์เลย
// เปลี่ยนอีเมลติดต่อเมื่อไร สถานะยืนยันถูกล้างที่ฐาน → แถบนี้กลับมาเอง
// บัญชีที่ HQ เพิ่งสร้างให้ (ยังต้องยืนยันตอนเข้าครั้งแรก) ไม่เห็นแถบนี้ — FirstPasswordGate พาไปยืนยันแทน
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRole } from "@pms/shared/context/RoleContext";
import { accountStateOnce, ล้างสถานะบัญชี } from "@pms/shared/lib/accountStateOnce";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ContactEmailForm } from "./ContactEmailForm";

export function ContactEmailBanner() {
  const { session } = useRole();
  const [แสดง, setแสดง] = useState(false);
  const [อีเมล, setอีเมล] = useState("");
  const [เปิดฟอร์ม, setเปิดฟอร์ม] = useState(false);

  const ตรวจ = useCallback(() => {
    if (!REAL_BACKEND || !session.dealerCode) return;
    accountStateOnce(session.dealerCode)
      .then(s => { setอีเมล(s.contactEmail ?? ""); setแสดง(!s.contactEmailVerified && !s.mustVerifyEmail && !s.mustChangePassword); })
      .catch(e => {
        // อ่านไม่ได้ = ไม่แสดง ไม่ขวางการใช้งาน · ใบผ่านใช้ไม่ได้แล้ว (สาขาถูกลบ/ปิดใช้งาน) = AuthGuard กำลังพาออกจากระบบอยู่ ไม่ต้องบันทึก
        if (!/unauthorized|401|403|ปิดการใช้งาน/i.test(String((e as Error)?.message ?? e))) logRepoRead("account.state(contact-email-banner)", e);
      });
  }, [session.dealerCode]);
  useEffect(ตรวจ, [ตรวจ]);

  if (!แสดง) return null;
  return (
    <div role="alert" aria-label="ยังไม่มีอีเมลติดต่อที่ยืนยันแล้ว"
      style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 12, padding: "12px 16px", margin: "0 0 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <AlertTriangle size={17} color="#B45309" />
        <div style={{ flex: "1 1 260px", fontSize: "0.82rem", color: "#78350F", lineHeight: 1.6 }}>
          <strong>{อีเมล ? "อีเมลติดต่อยังไม่ได้ยืนยัน" : "ยังไม่มีอีเมลติดต่อ"}</strong> — แจ้งเตือนจากสำนักงานใหญ่จะไม่ถึงคุณจนกว่าจะยืนยันอีเมล
        </div>
        {!เปิดฟอร์ม && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setเปิดฟอร์ม(true)}>
            {อีเมล ? "ยืนยันอีเมล" : "กรอกอีเมลติดต่อ"}
          </button>
        )}
      </div>
      {เปิดฟอร์ม && (
        <div style={{ marginTop: 12, background: "#fff", borderRadius: 10, padding: 14, maxWidth: 520 }}>
          <ContactEmailForm initialEmail={อีเมล} dealerCode={session.dealerCode ?? ""} onVerified={() => { setเปิดฟอร์ม(false); ล้างสถานะบัญชี(session.dealerCode ?? undefined); ตรวจ(); }} />
        </div>
      )}
    </div>
  );
}
