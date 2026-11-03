// ── หัวข้อกล่องกราฟ/ตาราง 2 บรรทัด (บอสสั่ง 3 พ.ย. 69) — ชื่อ + คำอธิบายสั้น · ตัวเดียวใช้ทุกกล่องของหน้าเจาะลึก HQ ─────────────
//   data-box-title / data-title / data-subtitle = ข้อทดสอบอ่าน (tests/scenario/drill-titles.spec.ts) · ชิดซ้าย ส่วนเสริม (แท็บ/ไอคอน) ชิดขวา
import type { ReactNode } from "react";

export function BoxTitle({ ชื่อ, คำอธิบาย, children }: { ชื่อ: string; คำอธิบาย: string; children?: ReactNode }) {
  return (
    <div className="card-header" data-box-title style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <div className="card-title" data-title>{ชื่อ}</div>
        <div data-subtitle style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 2 }}>{คำอธิบาย}</div>
      </div>
      {children}
    </div>
  );
}
