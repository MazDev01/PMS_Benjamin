"use client";

import React from "react";
import { Search, X } from "lucide-react";

/* ── FilterRow ────────────────────────────────────────────────────────────
   แถบตัวกรองแบบแถวเดียว: ช่องค้นหา + dropdown เรียงข้างกัน เห็นตัวกรองทุกตัวพร้อมกัน
   มาตรฐานเดียวกับหน้า /hq/pipeline — ใช้แทนปุ่ม "ตัวกรอง" + แผงชิปที่ต้องกดเปิด
   ตารางจึงโชว์ทุกสถานะเป็นค่าเริ่มต้น และเลือกกรองสถานะได้จาก dropdown "ทุกสถานะ"
──────────────────────────────────────────────────────────────────────────── */

const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const STEEL = "#374151";

// ช่องเลือกตัวกรอง = ตัวกลางทำเอง (บอสสั่ง 11 พ.ย. 69 · เดิม <select> ของเบราว์เซอร์อยู่ในไฟล์นี้) — ค่าเข้า-ออกเดิม
export { FilterSelect, type FilterOption } from "@pms/shared/components/filters/FilterSelect";

export function FilterRow({
  query, onQuery, placeholder, children, note, right, style,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  /** ใส่ <FilterSelect/> ของแต่ละหน้าตรงนี้ */
  children?: React.ReactNode;
  /** ข้อความสรุปท้ายแถว เช่น "12 จาก 40 รายการ" */
  note?: React.ReactNode;
  /** ตัวควบคุมชิดขวาสุด เช่น สลับมุมมองรายการ/การ์ด */
  right?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="card" style={{ marginBottom: 14, ...style }}>
      {/* ซ้าย = ค้นหา + dropdown (ขึ้นบรรทัดใหม่เองเมื่อจอแคบ) · ขวา = ตัวควบคุมของหน้า
          แยกเป็นสองกลุ่มเพื่อไม่ให้ตัวควบคุมขวาหล่นไปอยู่บรรทัดล่างตามลำพังเวลา dropdown เต็มแถว */}
      <div
        className="card-body"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 16px" }}
      >
        {/* flex-grow ต้องเป็น 0 — ถ้าโตเต็มที่ว่างจะดันตัวควบคุมขวาตกบรรทัด ทั้งที่ยังมีที่เหลือพอ */}
        {/* gap 5 — หน้าลูกค้าเป้าหมายมี 7 ชิ้นในแถว (ค้นหา + 6 ตัวกรอง) ที่จอ 1366 ต้องการพอดีเป๊ะ
            ทุก px มีผลว่าจะตกบรรทัดหรือไม่ */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", flex: "0 1 auto", minWidth: 0 }}>
          {/* ช่องค้นหา 180px — ย่อจาก 240 เพื่อให้ทั้งแถบ (ค้นหา + 6 ตัวกรอง + ปุ่มมุมมอง) อยู่บรรทัดเดียวถึงจอ 1366 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6, background: "#fafafa", border: `1px solid ${BORDER}`,
            borderRadius: 8, padding: "0 9px", height: 33, boxSizing: "border-box", width: 180, maxWidth: "100%", flexShrink: 0,
          }}>
            <Search size={13} color={MUTED} />
            <input
              value={query}
              onChange={e => onQuery(e.target.value)}
              placeholder={placeholder}
              style={{ border: "none", outline: "none", fontSize: "0.72rem", color: STEEL, background: "transparent", flex: 1, minWidth: 0, fontFamily: "inherit" }}
            />
            {query && (
              <button onClick={() => onQuery("")} aria-label="ล้างคำค้นหา"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: MUTED, display: "flex" }}>
                <X size={12} />
              </button>
            )}
          </div>

          {children}

          {/* ไม่มีปุ่มล้างตัวกรอง (บอสสั่ง 13 พ.ย. 69) — กลับค่าตั้งต้นที่ตัวกรองแต่ละช่อง */}
        </div>

        {(note || right) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexShrink: 0 }}>
            {note && <span style={{ fontSize: "0.7rem", color: MUTED }}>{note}</span>}
            {right}
          </div>
        )}
      </div>
    </div>
  );
}
