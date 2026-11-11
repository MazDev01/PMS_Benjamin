"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── /hq/dealers/[รหัส] = ลิงก์เก่า (กระดิ่ง/บันทึก/ลิงก์ที่จดไว้) → ที่อยู่แบบเดียว /hq/dealers?open=รหัส (บอสสั่ง 11 พ.ย. 69 · แผงอยู่ในที่อยู่หน้าเว็บ) ──
//   แทนที่ทันทีโดยไม่วาดแผงเอง — ถ้าวาดรายการ+แผงที่นี่แล้วค่อยแทนที่ หน้าวาดใหม่ แท็บที่กดไปแล้วกลับเป็นภาพรวม (ข้อทดสอบ hq-quote-detail-layout ตก)
//   สิทธิ์ตรวจที่หน้าปลายทาง (AdminGate ของ /hq/dealers) · เดิม (30 ต.ค. 69) หน้านี้วาด DealersRegistry พร้อมแผงเอง
export default function DealerDrillDownPage({ params }: { params: Promise<{ dealerCode: string }> }) {
  const { dealerCode } = use(params);
  const router = useRouter();
  useEffect(() => {
    router.replace(`/hq/dealers?open=${encodeURIComponent(decodeURIComponent(dealerCode).toUpperCase())}`, { scroll: false });
  }, [dealerCode, router]);
  return null;
}
