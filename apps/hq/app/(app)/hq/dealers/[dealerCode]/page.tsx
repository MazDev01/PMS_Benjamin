"use client";
import { use } from "react";
import { AdminGate } from "@pms/shared/components/layout/AdminGate";
import { DealersRegistry } from "../DealersRegistry";

// ── /hq/dealers/[รหัส] = หน้ารายการดีลเลอร์พร้อมแผงของดีลเลอร์นั้น (บอสสั่ง 30 ต.ค. 69) ──
//   ลิงก์เก่าและกระดิ่งที่ชี้มาที่นี่ยังใช้ได้ · ปิดแผง = อยู่หน้ารายการ (URL กลับเป็น /hq/dealers)
//   เดิมเป็นหน้ารายละเอียดเต็มจอ (แท็บ ภาพรวม/ลูกค้าเป้าหมาย/ใบเสนอ/ลูกค้า/กิจกรรม) — ย้ายเข้าแผงทั้งหมดแล้ว
export default function DealerDrillDownPage({ params }: { params: Promise<{ dealerCode: string }> }) {
  const { dealerCode } = use(params);
  return <AdminGate perm="dealers:manage"><DealersRegistry เปิดรหัส={decodeURIComponent(dealerCode).toUpperCase()} /></AdminGate>;
}
