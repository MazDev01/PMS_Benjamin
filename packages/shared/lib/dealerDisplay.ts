"use client";
// ── ชื่อแสดงของดีลเลอร์ ตัวกลางตัวเดียว (บอสสั่ง 6 พ.ย. 69) ─────────────────────────────────────────────────────────────
//   ฝั่ง HQ แสดงชื่อดีลเลอร์แทนรหัสทุกที่บนจอ (ยกเว้นหน้า "ดีลเลอร์" ที่คงรหัส · ช่องพิมพ์รหัสตอนตั้งดีลเลอร์ · กล่องบัญชีเข้าระบบ · เลขเอกสาร)
//   ชื่อซ้ำกัน (ฐานจริงมี 1 คู่ จังหวัดเดียวกัน) = "ชื่อ (รหัส)" เฉพาะคู่ที่ซ้ำ — ใช้ทั้งตัวกรอง · ตาราง · ชิป · การ์ด · แผง
//   ฐานใช้กติกาเดียวกันใน _dealer_display_name (ใบ 0281 · ข้อความกระดิ่ง/อีเมลถึง HQ ฉบับใหม่) · ข้อทดสอบ tests/unit/dealerDisplay.test.ts
//   ไฟล์ส่งออกคงรหัสแยกคอลัมน์ (ไม่ใช้ตัวนี้) · ค้นหาด้วยรหัสได้เหมือนเดิม
import { useMemo } from "react";
import { useRepoValue } from "./useRepoState";
import { dealers as dealersRepo } from "./data";
import type { DealerRow } from "./data/types";

import { สร้างชื่อแสดง } from "./dealerDisplayName";
export { สร้างชื่อแสดง };

/** ชื่อแสดงของดีลเลอร์ (โหลดทะเบียนดีลเลอร์ครั้งเดียวต่อหน้า) — ใช้ทุกหน้าฝั่ง HQ ที่แสดงดีลเลอร์ */
export function useชื่อดีลเลอร์(): (code: string | null | undefined, สำรอง?: string | null) => string {
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  return useMemo(() => สร้างชื่อแสดง(dealers), [dealers]);
}
