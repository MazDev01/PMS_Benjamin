"use client";

// ─── ปุ่มเลือกช่วงย้อนหลังของกราฟ (3 เดือน / 6 เดือน / 9 เดือน / 1 ปี · ค่าเริ่มต้น 1 ปี · บอสสั่ง 11 พ.ย. 69 · เดิม 3/6/12) — แหล่งเดียวของทั้งระบบ ──────
// เดิมโค้ดชุดนี้ฝังอยู่ในแดชบอร์ดดีลเลอร์ใบเดียว · ย้ายออกมาเพื่อให้กราฟรายเดือนทุกหน้า
// หน้าตา/พฤติกรรมเหมือนกันหมด (บอสสั่ง 17 ก.ค. 69)
//
// กติกา: กราฟที่มีปุ่มนี้ "ไม่ผูกกับตัวกรองช่วงเวลาบนแถบบน" — เป็นกราฟแนวโน้ม ต้องเห็นย้อนหลังเสมอ
// (เดิมเขียนช่วงที่ครอบไว้ใต้หัวข้อด้วย monthRangeSubtitle() — 12 พ.ย. 69 บอสสั่งเอาข้อความใต้ชื่อกราฟออก ใช้ หัวกราฟรายเดือน แทน) ไม่งั้นคนอ่านไม่รู้ว่ากำลังดูช่วงไหน
import type { CSSProperties, ReactNode } from "react";
import { NAVY } from "@pms/shared/lib/theme";
import { THAI_MONTHS, MONTH_RANGES, MONTH_RANGE_DEFAULT, ชื่อช่วงเดือน, ป้ายเดือนปี, type MonthRange } from "@pms/shared/lib/monthRange";   // ค่าคงที่/ตัวคำนวณล้วน (ข้อทดสอบหน่วย)
export { MONTH_RANGES, MONTH_RANGE_DEFAULT, ชื่อช่วงเดือน, ป้ายเดือนปี, type MonthRange };

const BORDER = "#E5E7EB";
const SUB = "#6B7280";

/** คีย์ถังรายเดือน "YYYY-MM"
 *  ⚠️ ต้องมี "ปี" เสมอ — ถ้าใช้แต่เลขเดือน ยอด ก.ย. 2568 จะไปทับช่อง ก.ย. 2569 (บั๊กที่เคยเจอมาแล้ว) */
export const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`;
export const monthKeyOf = (d: Date) => monthKey(d.getFullYear(), d.getMonth());

export type MonthBucket = { key: string; label: string; year: number };

/** ถังเดือนย้อนหลัง n เดือน เรียงเก่า→ใหม่ ปิดท้ายด้วยเดือนของ `now` */
export function lastNMonths(n: number, now: Date): MonthBucket[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1); // ข้ามปีเองเมื่อเลขเดือนติดลบ
    return { key: monthKey(d.getFullYear(), d.getMonth()), label: THAI_MONTHS[d.getMonth()], year: d.getFullYear() };
  });
}

/** "ม.ค. 2569 – มิ.ย. 2569" — ป้ายแกนบอกแต่ชื่อเดือน ช่วงที่ครอบจึงต้องบอกไว้ใต้หัวข้อ */
export function monthRangeSubtitle(n: number, now: Date): string {
  const b = lastNMonths(n, now), f = b[0], l = b[b.length - 1];
  return `${f.label} ${f.year + 543} – ${l.label} ${l.year + 543}`;
}

export function MonthRangeToggle({ value, onChange, label }: {
  value: MonthRange;
  onChange: (v: MonthRange) => void;
  /** ใช้เป็น aria-label ของกลุ่มปุ่ม + tooltip — บอกว่าปุ่มชุดนี้คุมกราฟใบไหน */
  label: string;
}) {
  return (
    <span role="group" aria-label={label} style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
      {MONTH_RANGES.map(n => {
        const on = n === value;
        return (
          <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={on} data-month-range={n} title={`${label} — ย้อนหลัง ${ชื่อช่วงเดือน(n)}`}
            style={{
              fontFamily: "inherit", fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap",
              padding: "5px 9px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${on ? NAVY : BORDER}`, background: on ? NAVY : "#fff", color: on ? "#fff" : SUB,
              transition: "background .15s ease, color .15s ease, border-color .15s ease",
            }}>
            {ชื่อช่วงเดือน(n)}
          </button>
        );
      })}
    </span>
  );
}

/** หัวกราฟรายเดือน — ตัวกลางเดียวทุกกราฟรายเดือน HQ + ดีลเลอร์ (บอสสั่ง 12 พ.ย. 69)
 *  บรรทัดบน: ชื่อกราฟ (+ ของมุมขวา เช่นลิงก์ "ดูทั้งหมด") · บรรทัดล่าง: ปุ่ม 3/6/9 เดือน/1 ปี ชิดขวา ใต้ชื่อกราฟ
 *  ไม่มีข้อความกำกับใต้ชื่อ (เดิม "ช่วง … · ช่วงจากปุ่มของกราฟ … · ปิดสำเร็จ/ไม่สำเร็จ = …" — บอกช่วงด้วยปุ่มที่ถูกเลือกแทน)
 *  ข้อทดสอบ: tests/scenario/monthly-chart-ranges.spec.ts (ปุ่มอยู่ใต้ชื่อ ชิดขวา · ไม่มีข้อความกำกับ) */
export function หัวกราฟรายเดือน({ ชื่อ, ปุ่ม, ขวา, className = "card-header", สไตล์ชื่อ, style }: {
  ชื่อ: ReactNode;
  /** <MonthRangeToggle … /> ของกราฟนี้ */
  ปุ่ม: ReactNode;
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
      <div data-month-range-row style={{ display: "flex", justifyContent: "flex-end" }}>{ปุ่ม}</div>
    </div>
  );
}
