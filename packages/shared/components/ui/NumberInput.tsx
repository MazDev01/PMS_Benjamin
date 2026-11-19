"use client";

/* ── ช่องกรอกตัวเลขที่ "ลบให้ว่างได้" ระหว่างพิมพ์ ────────────────────────────
   ปัญหาเดิม (บอสแจ้ง 28 ส.ค. 69): ช่อง % ภาษีผูกค่ากับตัวเลขตรง ๆ แล้วแปลงด้วย
   Number(e.target.value) || 0 — พอผู้ใช้ลบทั้งช่องเพื่อพิมพ์ใหม่ ค่าที่ได้คือ ""
   ซึ่งกลายเป็น 0 ทันที ช่องจึงเด้งเป็น "0" แล้วพอพิมพ์ 9 ต่อ ได้ "09"
   (ต้องลบเลข 0 ทิ้งอีกรอบทุกครั้ง — เจอทุกช่องที่ทำแบบเดียวกัน)

   วิธีแก้: ระหว่างที่ช่องยังโฟกัสอยู่ เก็บ "ข้อความที่พิมพ์" ไว้ตามจริง (รวมค่าว่าง)
   แล้วส่งขึ้นไปเฉพาะตอนที่อ่านเป็นตัวเลขได้ · ออกจากช่องทั้งที่ยังว่าง ค่อยลงค่าสำรอง

   ⚠️ ประกาศไว้ที่นี่ที่เดียว — ห้ามก๊อปตรรกะนี้ไปไว้ในหน้า ไม่งั้นแก้ไม่ครบเหมือนเดิม */

import { useState, type CSSProperties } from "react";

export function NumberInput({
  value, onChange, min, max, step, fallback, className = "form-input", style, ariaLabel, id, หน่วย,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
  /** ค่าที่ลงให้เมื่อผู้ใช้ปล่อยช่องว่างไว้ (ไม่ระบุ = min หรือ 0) */
  fallback?: number;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  id?: string;
  /** หน่วยท้ายช่อง เช่น "%" "฿" "ตร.ม." (19 พ.ย. 69 · ช่องตัวเลขทุกช่องไม่มีลูกศรขึ้นลง — class number-input ใน globals.css) */
  หน่วย?: string;
}) {
  // null = ไม่ได้กำลังพิมพ์ → แสดงค่าจริง · string = ข้อความที่ผู้ใช้พิมพ์อยู่ (ว่างได้)
  const [ร่าง, setร่าง] = useState<string | null>(null);
  const จำกัด = (n: number) => {
    let x = n;
    if (min !== undefined) x = Math.max(min, x);
    if (max !== undefined) x = Math.min(max, x);
    return x;
  };
  const ช่อง = (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      className={`${className} number-input`}
      style={หน่วย ? { width: "100%", paddingRight: `${0.9 + หน่วย.length * 0.55}rem`, ...style } : style}
      value={ร่าง ?? String(value)}
      onChange={e => {
        const t = e.target.value;
        setร่าง(t);
        if (t.trim() === "") return;            // ยังพิมพ์ไม่เสร็จ — ยังไม่เขียนค่ากลับ
        const n = Number(t);
        if (Number.isNaN(n)) return;            // "-" หรือ "1e" ระหว่างพิมพ์ — รอให้ครบก่อน
        onChange(จำกัด(n));
      }}
      onBlur={() => {
        const t = ร่าง;
        setร่าง(null);                           // กลับไปแสดงค่าจริงที่บันทึกไว้
        if (t !== null && t.trim() === "") onChange(fallback ?? min ?? 0);
      }}
    />
  );
  if (!หน่วย) return ช่อง;
  return (
    <span data-number-unit={หน่วย} style={{ position: "relative", display: "block" }}>
      {ช่อง}
      <span aria-hidden style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: "0.78rem", fontWeight: 700, color: "#8a929c", pointerEvents: "none" }}>{หน่วย}</span>
    </span>
  );
}
