"use client";

// ── จังหวัดที่สาขาของฉันรับผิดชอบ — แหล่งเดียวของทั้งแอปดีลเลอร์ ────────────────────
//
// ทุกที่ที่ให้ "เลือกจังหวัด" ในแอปดีลเลอร์ต้องใช้ตัวนี้ ไม่ใช่ช่องพิมพ์อิสระหรือรายชื่อของใครของมัน
//   (บอสแจ้ง 20 ส.ค. 69: ช่องจังหวัดในฟอร์มเพิ่มกิจกรรมหน้าปฏิทินยังพิมพ์เองได้
//    จึงพิมพ์จังหวัดนอกเขตรับผิดชอบ/สะกดคนละแบบลงไปได้ แล้วตัวกรองจังหวัดก็จับไม่ตรงกัน)
//
// ⚠️ ต้องไม่ทำให้ค่าที่บันทึกไว้แล้วหาย: ระเบียนเก่าที่จังหวัดอยู่นอกภาค (ย้ายสาขา/ข้อมูลเก่า)
//    ต้องยังเห็นค่าเดิมของตัวเองในลิสต์ ไม่งั้นแค่เปิดฟอร์มมาแก้ช่องอื่น จังหวัดก็ถูกบันทึกทับเป็นค่าว่าง
//    → ผู้เรียกต้องส่งค่าปัจจุบันเข้ามาด้วย (current) เพื่อให้พ่วงเข้าลิสต์ให้เมื่อไม่มีในเขต
import { useMemo } from "react";
import { useCurrentDealer } from "./useCurrentDealer";
import { useRepoValue } from "./useRepoState";
import { dealers as dealersRepo } from "./data";
import { จังหวัดให้เลือก } from "./provinces";
import type { DealerRow } from "./mock";

export function useMyProvinces(current?: string): string[] {
  const me = useCurrentDealer();
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  return useMemo(() => จังหวัดให้เลือก(dealers, me.code, current), [dealers, me.code, current]);
}
