"use client";

// ── ช่องเลือกจังหวัด (บอสสั่ง 29 ต.ค. 69) — เลือกจากรายชื่อ 77 จังหวัดชุดเดียวกับที่ฐานใช้เช็คพื้นที่ (th_provinces · lib/provinces.ts) ──
//   พิมพ์ค้นได้: ช่องค้นข้างหลังกรองรายการในช่องเลือก (ช่องเลือกมาก่อนในหน้า — getByLabel("จังหวัด").first() ได้ช่องเลือก) (ช่องเลือกจริงยังเป็น <select> — พิมพ์ชื่อแปลก ๆ ลงไปไม่ได้)
//   ใช้ทุกที่ที่กรอกจังหวัด: ดีลเลอร์ · ลีด · ลูกค้า · ผู้สนใจ · ตั้งเป็นดีลเลอร์ (H5) · ใบค่าแฟรนไชส์ · ฐานกันชื่อนอกรายชื่ออีกชั้น (ใบ 0259)
import { useState, type CSSProperties, type ReactNode } from "react";

export function ProvinceSelect({ id, label, value, onChange, options, ว่าง = "— ยังไม่ระบุ —", ก่อน, หลัง, style, className, disabled }: {
  id?: string;
  /** ชื่อช่อง (aria-label ของช่องเลือก) · ช่องค้น = "ค้นหา" + ชื่อช่อง */
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** จังหวัดที่เลือกได้ (ชื่อมาตรฐาน) — เรียงตามที่ส่งมา */
  options: readonly string[];
  /** ข้อความตัวเลือกว่าง · null = ไม่มีตัวเลือกว่าง */
  ว่าง?: string | null;
  /** ตัวเลือกพิเศษก่อน/หลังรายการ (เช่น ค่าเดิมที่อยู่นอกภาค) */
  ก่อน?: ReactNode;
  หลัง?: ReactNode;
  style?: CSSProperties;
  className?: string;
  disabled?: boolean;
}) {
  const [ค้น, setค้น] = useState("");
  const คำ = ค้น.trim();
  // ค่าที่เลือกอยู่ต้องอยู่ในรายการเสมอ (กรองแล้วไม่หาย)
  const เห็น = คำ ? options.filter(p => p.includes(คำ) || p === value) : options;
  return (
    <span style={{ display: "flex", gap: 6, minWidth: 0, width: "100%" }} data-province-select>
      <select id={id} aria-label={label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className={className} style={{ ...style, flex: 1, minWidth: 0 }}>
        {ว่าง != null && <option value="">{ว่าง}</option>}
        {ก่อน}
        {เห็น.map(p => <option key={p} value={p}>{p}</option>)}
        {หลัง}
      </select>
      <input type="search" aria-label={`ค้นหา${label}`} placeholder="พิมพ์ค้น…" value={ค้น} disabled={disabled}
        onChange={e => {
          setค้น(e.target.value);
          // พิมพ์แล้วเหลือจังหวัดเดียว = เลือกให้เลย
          const ตรง = options.filter(p => p.includes(e.target.value.trim()));
          if (e.target.value.trim() && ตรง.length === 1 && ตรง[0] !== value) onChange(ตรง[0]);
        }}
        className={className} style={{ ...style, flex: "0 0 92px", width: 92, minWidth: 0 }} />
    </span>
  );
}
