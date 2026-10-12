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
import { provincesOfRegion, ALL_PROVINCES } from "./provinces";
import type { DealerRow } from "./mock";

/** รายชื่อจังหวัดสำรอง — ใช้เฉพาะตอนทะเบียนดีลเลอร์ยังโหลดไม่เสร็จ (ยังไม่รู้ภาค) */
const PROVINCES_FALLBACK = ["กรุงเทพฯ","เชียงใหม่","ระยอง","เชียงราย","นนทบุรี","สมุทรสาคร","นครสวรรค์","ราชบุรี","ขอนแก่น","อื่นๆ"];

export function useMyProvinces(current?: string): string[] {
  const me = useCurrentDealer();
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  return useMemo(() => {
    const mine = dealers.find(d => d.code === me.code);
    const inRegion = provincesOfRegion(mine?.region ?? "");
    const ฐาน = inRegion.length ? inRegion : [...PROVINCES_FALLBACK];
    const พ่วง: string[] = [];
    // จังหวัดที่ตั้งของสาขาต้องอยู่ในลิสต์เสมอ (บางสาขาตั้งอยู่คนละภาคกับที่รับผิดชอบ)
    //   ยกเว้น "ทุกจังหวัด" ของสำนักงานใหญ่ — เป็นคำบอกขอบเขต ไม่ใช่ชื่อจังหวัดที่เลือกลงเอกสารได้
    if (inRegion.length && mine?.province && mine.province !== ALL_PROVINCES && !ฐาน.includes(mine.province)) พ่วง.push(mine.province);
    if (current && !ฐาน.includes(current) && !พ่วง.includes(current)) พ่วง.push(current);
    return พ่วง.length ? [...พ่วง, ...ฐาน] : ฐาน;
  }, [dealers, me.code, current]);
}
