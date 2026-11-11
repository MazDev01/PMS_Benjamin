// ── ปุ่มช่วงเดือนของกราฟ — ค่าคงที่และตัวคำนวณล้วน (ไม่มี JSX) · คอมโพเนนต์ปุ่มอยู่ที่ components/ui/MonthRangeToggle.tsx ──
//   3 เดือน · 6 เดือน · 9 เดือน · 1 ปี · ค่าเริ่มต้น 1 ปี (บอสสั่ง 11 พ.ย. 69 · เดิม 3/6/12) · ข้อทดสอบหน่วย tests/unit/chartAxis.test.ts
export const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export const MONTH_RANGES = [3, 6, 9, 12] as const;
export type MonthRange = (typeof MONTH_RANGES)[number];
/** ค่าเริ่มต้นของทุกกราฟที่มีปุ่มนี้ (บอสสั่ง 11 พ.ย. 69) */
export const MONTH_RANGE_DEFAULT: MonthRange = 12;
/** ชื่อปุ่ม: 12 = "1 ปี" */
export const ชื่อช่วงเดือน = (n: MonthRange) => (n === 12 ? "1 ปี" : `${n} เดือน`);
/** ป้ายแกนนอนของกราฟรายเดือน: "พ.ย. 68" (ตัวกลางกราฟแยกเป็น 2 บรรทัด "พ.ย." บน "68" ล่าง เมื่อช่องแคบ) · m = 0–11 · y = ค.ศ. */
export const ป้ายเดือนปี = (y: number, m: number) => `${THAI_MONTHS[m]} ${String(y + 543).slice(-2)}`;
