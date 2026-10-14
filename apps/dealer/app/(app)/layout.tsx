"use client";

import { AuthGuard } from "@pms/shared/components/layout/AuthGuard";
import { AppShell } from "@pms/shared/components/layout/AppShell";
import { FirstPasswordGate } from "@pms/shared/components/ui/FirstPasswordGate";
import { ContactEmailBanner } from "@pms/shared/components/ui/ContactEmailBanner";
import { useRole } from "@pms/shared/context/RoleContext";

// กันบัญชี HQ หลงเข้ามาใช้หน้าดีลเลอร์ — ฝั่ง HQ มี HQLayout กันบัญชีดีลเลอร์อยู่แล้ว (apps/hq/app/(app)/hq/layout.tsx)
// แต่ฝั่งนี้ไม่เคยมีด่านแบบเดียวกัน (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69) — เดิมหน้าเปิดให้ใช้งานได้ตามปกติ
// จนกว่าจะกดบันทึกจริงแล้วโดน RLS ปฏิเสธแบบงงๆ แทนที่จะกันไว้ตั้งแต่แรก
function DealerRoleGuard({ children }: { children: React.ReactNode }) {
  const { isHQ, hydrated } = useRole();
  if (!hydrated) return null;
  if (isHQ) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "inherit" }}>
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#003366", marginBottom: 8 }}>บัญชีนี้เป็นบัญชีสำนักงานใหญ่ (HQ)</div>
          <div style={{ fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.7 }}>ระบบนี้สำหรับบัญชีดีลเลอร์เท่านั้น — กรุณาออกจากระบบแล้วเข้าใช้งานที่ระบบสำนักงานใหญ่แทน</div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      {/* FilterProvider ถูกครอบต่อหน้าใน AppShell (แยกอิสระต่อ route) */}
      <DealerRoleGuard>
        {/* เข้าระบบครั้งแรกต้องตั้งรหัสผ่านใหม่ก่อน (บอสสั่ง 15 ก.ย. 69) — ยังไม่ตั้ง = ไม่เห็นเมนูระบบเลย */}
        <FirstPasswordGate>
          {/* ยังไม่มีอีเมลติดต่อที่ยืนยัน = แถบเตือนที่ปิดไม่ได้ แต่ไม่บล็อกการใช้งาน (ด่าน 1 · 14 ต.ค. 69) */}
          <AppShell notice={<ContactEmailBanner />}>{children}</AppShell>
        </FirstPasswordGate>
      </DealerRoleGuard>
    </AuthGuard>
  );
}
