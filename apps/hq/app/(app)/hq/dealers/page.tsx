"use client";
import { AdminGate } from "@pms/shared/components/layout/AdminGate";
import { DealersRegistry } from "./DealersRegistry";

// ── HQ · ทะเบียนดีลเลอร์ (/hq/dealers) — งานดูแล ไม่มีตัวเลขยอดขาย (FLOW H11 · บอสตัดสิน 30 ต.ค. 69) ──
//   กดแถว = เปิดแผงด้านขวา (ไม่เปลี่ยนหน้า) · ตัวรายการ + แผงอยู่ที่ DealersRegistry.tsx
export default function HQDealersPage() {
  return <AdminGate perm="dealers:manage"><DealersRegistry /></AdminGate>;
}
