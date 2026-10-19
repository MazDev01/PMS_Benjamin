"use client";

import { AuthGuard } from "@pms/shared/components/layout/AuthGuard";
import { AppShell } from "@pms/shared/components/layout/AppShell";
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
        {/* เข้าระบบแล้วเข้าหน้าหลักทันที (บอสตัดสิน 19 ต.ค. 69): ไม่มีหน้าบังคับตั้งรหัส/ยืนยันอีเมล ไม่มีแถบเตือน
            เปลี่ยนรหัสผ่าน + ใส่อีเมลติดต่อ = หน้าบัญชี (/settings/account) ตามใจดีลเลอร์ · ข้อทดสอบ dealer-no-forced-gate.spec.ts */}
        <AppShell>{children}</AppShell>
      </DealerRoleGuard>
    </AuthGuard>
  );
}
