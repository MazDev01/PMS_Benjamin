"use client";

/* ── ชิ้นส่วนกลางของ "หน้าต่างรายละเอียดเอกสาร" (ใบเสนอราคาของดีลเลอร์ · ใบค่าแฟรนไชส์ของ HQ · บอสสั่ง 9 พ.ย. 69) ──
   • แถบสรุป 4 ช่อง ใต้แถบหัวน้ำเงิน — ตัวเลข/สถานะที่ต้องเห็นก่อนเลื่อนจอ (จอแคบเหลือ 2 คอลัมน์)
   • กริดรายละเอียด 3 คอลัมน์ — หัวข้อเล็กสีเทาอยู่บน ค่าตัวหนาอยู่ล่าง (จอแคบเหลือ 2 หรือ 1 คอลัมน์)
   • กล่องยอดรวมชิดขวา กว้างครึ่งหนึ่ง (จอแคบเต็มแถว)
   คอลัมน์ตามความกว้างจอคุมที่ globals.css (.doc-summary / .doc-grid / .doc-totals) — สไตล์ในบรรทัดทำ media query ไม่ได้
   ไม่มีข้อมูล = "-" ห้ามเดาค่าแทน
   ⚠️ ไฟล์ใหม่ — ไม่แตะ DetailPanel (PanelSection/PanelRow) ที่หน้าอื่นใช้อยู่ */

import type { CSSProperties, ReactNode } from "react";

const ว่าง = (v: ReactNode) => v === undefined || v === null || v === "" || v === "—" || v === "-";

export type ช่องสรุป = {
  คีย์: string;
  ป้าย: string;
  ค่า: ReactNode;
  /** บรรทัดย่อยใต้ค่า (เช่น "เหลือ 3 วัน") */
  ย่อย?: ReactNode;
  /** บรรทัดย่อยเป็นสีแดง (เช่น เลยวันหมดอายุ) */
  ย่อยแดง?: boolean;
  /** ตัวใหญ่ (ยอดเงินหลักของเอกสาร) */
  เด่น?: boolean;
};

/** แถบสรุป 4 ช่องใต้หัวหน้าต่าง */
export function แถบสรุปเอกสาร({ ช่อง, style }: { ช่อง: ช่องสรุป[]; style?: CSSProperties }) {
  return (
    <div data-doc-summary className="doc-summary"
      style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid #E7EDF4", flexShrink: 0, ...style }}>
      {ช่อง.map(c => {
        const ไม่มี = ว่าง(c.ค่า);
        return (
          <div key={c.คีย์} data-summary-item={c.คีย์} style={{ minWidth: 0, padding: "2px 0" }}>
            <div data-summary-label style={{ fontSize: "0.66rem", fontWeight: 700, color: "#64748B" }}>{c.ป้าย}</div>
            <div data-summary-value style={{ fontSize: c.เด่น ? "1.3rem" : "0.9rem", fontWeight: 800, color: ไม่มี ? "#94A3B8" : "#003366",
              marginTop: 3, lineHeight: 1.25, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{ไม่มี ? "-" : c.ค่า}</div>
            {c.ย่อย && (
              <div data-summary-sub data-overdue={c.ย่อยแดง ? "" : undefined}
                style={{ fontSize: "0.7rem", fontWeight: 700, marginTop: 2, color: c.ย่อยแดง ? "#DC2626" : "#64748B" }}>{c.ย่อย}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** กริดรายละเอียด — ใส่ ช่องกริด เป็นลูก */
export function กริดรายละเอียด({ children, style, ...rest }: { children: ReactNode; style?: CSSProperties } & Record<`data-${string}`, string | undefined>) {
  return <div className="doc-grid" data-doc-grid style={style} {...rest}>{children}</div>;
}

/** หนึ่งช่องในกริด: หัวข้อเล็กสีเทาอยู่บน · ค่าตัวหนาอยู่ล่าง · เต็มแถว = ข้อความยาว (คงบรรทัดตามที่พิมพ์) */
export function ช่องกริด({ ป้าย, ค่า, เต็มแถว, ป้ายเสริม, ...rest }: {
  ป้าย: string; ค่า: ReactNode; เต็มแถว?: boolean;
  /** ป้ายเล็กต่อท้ายหัวข้อ (เช่น "ภายใน ไม่พิมพ์ลงเอกสาร") */
  ป้ายเสริม?: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  const ไม่มี = ว่าง(ค่า);
  return (
    <div data-grid-item className={เต็มแถว ? "doc-wide" : undefined} style={{ minWidth: 0 }} {...rest}>
      <div data-field-label style={{ fontSize: "0.66rem", fontWeight: 600, color: "#8a929c", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{ป้าย}{ป้ายเสริม}</div>
      <div data-field-value style={{ fontSize: "0.82rem", fontWeight: 700, color: ไม่มี ? "#94A3B8" : "#1F2937", marginTop: 3, overflowWrap: "anywhere",
        ...(เต็มแถว ? { whiteSpace: "pre-line", lineHeight: 1.7 } : {}) }}>{ไม่มี ? "-" : ค่า}</div>
    </div>
  );
}
