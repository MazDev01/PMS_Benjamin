"use client";

// การ์ดกันสิทธิ์หน้า HQ ระดับผู้ดูแล — hq/layout กันแค่ isHQ (ทุก role HQ ผ่านเท่ากัน)
// หน้าจัดการ (ดีลเลอร์/แคตตาล็อก/ผู้ใช้/ตั้งค่า/บริษัท) ต้องมี permission เฉพาะ ไม่งั้น HQ_STAFF เข้าถึง+แก้ได้
// ครอบ children เป็น wrapper (ไม่ใช่ early-return ในหน้า) → ไม่ทำ hooks order ของหน้าพัง
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@pms/shared/context/RoleContext";
import type { Permission } from "@pms/shared/lib/permissions";

export function AdminGate({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const { can, hydrated } = useRole();
  const router = useRouter();
  const ok = can(perm);

  useEffect(() => {
    if (hydrated && !ok) router.replace("/hq/dashboard");
  }, [hydrated, ok, router]);

  if (!hydrated) return <div style={{ visibility: "hidden" }} />;
  if (!ok) return null;
  return <>{children}</>;
}
