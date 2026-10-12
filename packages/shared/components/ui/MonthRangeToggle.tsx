"use client";

// ─── ปุ่มเลือกช่วงย้อนหลังของกราฟ (3 / 6 / 12 เดือน) — แหล่งเดียวของทั้งระบบ ──────
// เดิมโค้ดชุดนี้ฝังอยู่ในแดชบอร์ดดีลเลอร์ใบเดียว · ย้ายออกมาเพื่อให้กราฟรายเดือนทุกหน้า
// หน้าตา/พฤติกรรมเหมือนกันหมด (บอสสั่ง 17 ก.ค. 69)
//
// กติกา: กราฟที่มีปุ่มนี้ "ไม่ผูกกับตัวกรองช่วงเวลาบนแถบบน" — เป็นกราฟแนวโน้ม ต้องเห็นย้อนหลังเสมอ
// จึงต้องเขียนช่วงที่ครอบไว้ใต้หัวข้อด้วย monthRangeSubtitle() ทุกครั้ง ไม่งั้นคนอ่านไม่รู้ว่ากำลังดูช่วงไหน
import { NAVY } from "@pms/shared/lib/theme";

const BORDER = "#E5E7EB";
const SUB = "#6B7280";
const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export const MONTH_RANGES = [3, 6, 12] as const;
export type MonthRange = (typeof MONTH_RANGES)[number];

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
          <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={on} title={`${label} — ย้อนหลัง ${n} เดือน`}
            style={{
              fontFamily: "inherit", fontSize: "0.68rem", fontWeight: 700, whiteSpace: "nowrap",
              padding: "5px 9px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${on ? NAVY : BORDER}`, background: on ? NAVY : "#fff", color: on ? "#fff" : SUB,
              transition: "background .15s ease, color .15s ease, border-color .15s ease",
            }}>
            {n} เดือน
          </button>
        );
      })}
    </span>
  );
}
