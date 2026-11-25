"use client";

// ─── ปุ่มเลือกช่วงย้อนหลังของกราฟ (3 เดือน / 6 เดือน / 9 เดือน / 1 ปี · ค่าเริ่มต้น 1 ปี · บอสสั่ง 11 พ.ย. 69 · เดิม 3/6/12) — แหล่งเดียวของทั้งระบบ ──────
// เดิมโค้ดชุดนี้ฝังอยู่ในแดชบอร์ดดีลเลอร์ใบเดียว · ย้ายออกมาเพื่อให้กราฟรายเดือนทุกหน้า
// หน้าตา/พฤติกรรมเหมือนกันหมด (บอสสั่ง 17 ก.ค. 69)
//
// กติกา: กราฟที่มีปุ่มนี้ "ไม่ผูกกับตัวกรองช่วงเวลาบนแถบบน" — เป็นกราฟแนวโน้ม ต้องเห็นย้อนหลังเสมอ
// (เดิมเขียนช่วงที่ครอบไว้ใต้หัวข้อด้วย monthRangeSubtitle() — 12 พ.ย. 69 บอสสั่งเอาข้อความใต้ชื่อกราฟออก ใช้ หัวกราฟรายเดือน แทน) ไม่งั้นคนอ่านไม่รู้ว่ากำลังดูช่วงไหน
import type { CSSProperties, ReactNode } from "react";
import { THAI_MONTHS, ป้ายเดือนปี } from "@pms/shared/lib/monthRange";   // ค่าคงที่/ตัวคำนวณล้วน (ข้อทดสอบหน่วย)
export { ป้ายเดือนปี };

/** คีย์ถังรายเดือน "YYYY-MM"
 *  ⚠️ ต้องมี "ปี" เสมอ — ถ้าใช้แต่เลขเดือน ยอด ก.ย. 2568 จะไปทับช่อง ก.ย. 2569 (บั๊กที่เคยเจอมาแล้ว) */
export const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
export const monthKeyOf = (d: Date) => monthKey(d.getFullYear(), d.getMonth());

export type MonthBucket = { key: string; label: string; year: number };

/** ถังเดือนทุกเดือนที่ช่วงเวลาแตะ (เดือนของวันเริ่ม → เดือนของวันจบ) เรียงเก่า→ใหม่
 *  ใช้กับกราฟรายเดือนบนหน้าที่มีตัวเลือกช่วงเวลาด้านบน (บอสสั่ง 13 พ.ย. 69 · ทับ 11 พ.ย. "ทุกกราฟมีปุ่มของตัวเอง")
 *  ช่วงสั้นกว่าเดือน (วันนี้ / 7 วัน) = เดือนที่ช่วงนั้นแตะ 1–2 แท่ง ไม่เปลี่ยนเป็นรายวัน */
export function เดือนตามช่วง(start: Date, end: Date): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({ key: monthKey(d.getFullYear(), d.getMonth()), label: THAI_MONTHS[d.getMonth()], year: d.getFullYear() });
  }
  return out;
}

// ปุ่ม MonthRangeToggle · lastNMonths · monthRangeSubtitle ลบแล้ว 25 พ.ย. 69 (บอสสั่ง "เคลียไฟขยะ") — ไม่มีกราฟใช้ตั้งแต่ 13 พ.ย. 69
//   กราฟรายเดือนทุกหน้าแสดงตามตัวเลือกช่วงเวลาด้านบน (เดือนตามช่วง) · ช่อง ปุ่ม ของหัวกราฟคงไว้เผื่อหน้าที่ไม่มีตัวกรองด้านบน

/** หัวกราฟรายเดือน — ตัวกลางเดียวทุกกราฟรายเดือน HQ + ดีลเลอร์ (บอสสั่ง 12 พ.ย. 69)
 *  บรรทัดบน: ชื่อกราฟ (+ ของมุมขวา เช่นลิงก์ "ดูทั้งหมด") · บรรทัดล่าง: ปุ่ม 3/6/9 เดือน/1 ปี ชิดขวา ใต้ชื่อกราฟ
 *  13 พ.ย. 69 บอสสั่ง: หน้าที่มีตัวเลือกช่วงเวลาด้านบน = ไม่ส่ง ปุ่ม (กราฟแสดงทุกเดือนตามช่วงด้านบน) · หน้าไม่มีตัวกรองด้านบน = ส่งปุ่ม ชิดขวา
 *  ไม่มีข้อความกำกับใต้ชื่อ (เดิม "ช่วง … · ช่วงจากปุ่มของกราฟ … · ปิดสำเร็จ/ไม่สำเร็จ = …" — บอกช่วงด้วยปุ่มที่ถูกเลือกแทน)
 *  ข้อทดสอบ: tests/scenario/monthly-chart-ranges.spec.ts (ปุ่มอยู่ใต้ชื่อ ชิดขวา · ไม่มีข้อความกำกับ) */
export function หัวกราฟรายเดือน({ ชื่อ, ปุ่ม, ขวา, className = "card-header", สไตล์ชื่อ, style }: {
  ชื่อ: ReactNode;
  /** ปุ่มของกราฟนี้ (ถ้ามี) — เฉพาะหน้าที่ไม่มีตัวเลือกช่วงเวลาด้านบน */
  ปุ่ม?: ReactNode;
  /** ของมุมขวาบรรทัดชื่อ (ถ้ามี) */
  ขวา?: ReactNode;
  className?: string;
  สไตล์ชื่อ?: CSSProperties;
  style?: CSSProperties;
}) {
  return (
    <div className={className} data-month-chart-head style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
        <div className={สไตล์ชื่อ ? undefined : "card-title"} data-title style={{ minWidth: 0, ...สไตล์ชื่อ }}>{ชื่อ}</div>
        {ขวา}
      </div>
      {ปุ่ม ? <div data-month-range-row style={{ display: "flex", justifyContent: "flex-end" }}>{ปุ่ม}</div> : null}
    </div>
  );
}
