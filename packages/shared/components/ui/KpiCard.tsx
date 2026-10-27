"use client";

// ── การ์ด KPI กลาง (บอสสั่ง 22–26 ต.ค. 69: ทุกหน้ามีแถวการ์ด 4 ใบ · การ์ดเดียวกันทั้งสองแอปใช้คอมโพเนนต์เดียว) ───────
//   หน้าตาเดียวกับการ์ดแดชบอร์ด HQ: ป้าย → ตัวเลข (เข้ม) → หน่วย/คำอธิบาย · ไอคอนในกล่องสีจางมุมขวา · ทั้งใบกดได้
//   ไม่มีข้อมูล = "—" พร้อมคำอธิบายสั้น (ห้ามแสดง 0 หลอก) — ผู้เรียกส่ง value = null แล้วใส่เหตุผลที่ empty
//   ตัวเลขคิดที่ฐาน ที่นี่แสดงอย่างเดียว · data-kpi = ชื่อการ์ด · data-value = ค่าดิบ (ข้อทดสอบเทียบกับฐาน)
//   แถว: <KpiRow> (.hq-kpi4 · 4 คอลัมน์ → 2 → 1 ตามจอ) — ตัวตรวจในรอบตรวจเต็มนับว่าแถวละ 4 ใบพอดี
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { ProgressRing } from "@pms/shared/components/ui/Charts";

const NAVY = "#003366";
const ป้าย: React.CSSProperties = { fontSize: "0.8rem", color: "var(--muted-foreground)" };
const ตัวเลข: React.CSSProperties = { fontSize: "1.25rem", fontWeight: 800, color: "#1F2937", lineHeight: 1.15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

export function KpiRow({ label, children, style }: { label: string; children: ReactNode; style?: React.CSSProperties }) {
  return <div className="hq-kpi4" role="group" aria-label={label} data-kpi-row style={{ marginBottom: "1.25rem", ...style }}>{children}</div>;
}

export function KpiCard({ kpi, label, value, rawValue, unit, empty, sub, danger, icon: Icon, color = NAVY, bg = "#E8F0FE", onClick, actionLabel = "ดูรายการ", testId, ring }: {
  /** ชื่อการ์ด (data-kpi) */
  kpi: string;
  label: string;
  /** ข้อความตัวเลขที่แสดง · null = ไม่มีข้อมูล → "—" */
  value: string | null;
  /** ค่าดิบสำหรับข้อทดสอบ (data-value) · ไม่มีข้อมูล = "" */
  rawValue?: number | string | null;
  unit?: string;
  /** คำอธิบายเมื่อไม่มีข้อมูล (แสดงแทนหน่วย) */
  empty?: string;
  /** บรรทัดรอง (เช่น "3 จาก 40") */
  sub?: ReactNode;
  /** ตัวเลขสีแดง (เกินกำหนด) */
  danger?: boolean;
  icon: LucideIcon;
  color?: string;
  bg?: string;
  /** กดแล้วไปรายการที่กรองตรงเรื่อง */
  onClick?: () => void;
  actionLabel?: string;
  testId?: string;
  /** วงแหวนความคืบหน้า (%) แทนไอคอน — เช่น ยอดขายเทียบเป้า · null = ยังไม่ตั้งเป้า (วงแหวนขึ้น "—") · ไม่ส่ง = ไอคอนตามปกติ */
  ring?: number | null;
}) {
  const ว่าง = value == null;
  const เนื้อ = (
    <>
      <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, width: "100%" }}>
        <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
          <span style={ป้าย}>{label}</span>
          <b data-testid={testId} data-value={rawValue ?? ""} style={{ ...ตัวเลข, marginTop: 4, color: ว่าง ? "#9ca3af" : danger ? "#dc2626" : ตัวเลข.color }}>{ว่าง ? "—" : value}</b>
          <span style={{ ...ป้าย, fontSize: "0.76rem" }}>{ว่าง ? (empty ?? "ยังไม่มีข้อมูล") : unit}</span>
          {sub && !ว่าง && <span style={{ ...ป้าย, fontSize: "0.74rem" }}>{sub}</span>}
        </span>
        {ring !== undefined
          ? <span data-kpi-ring={ring ?? ""} style={{ flexShrink: 0 }}><ProgressRing pct={ring} size={50} /></span>
          : <span aria-hidden style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={20} color={danger && !ว่าง ? "#dc2626" : color} strokeWidth={2.1} />
            </span>}
      </span>
      {onClick && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.8rem", fontWeight: 700, color: NAVY, marginTop: "auto" }}>
          {actionLabel} <ChevronRight size={13} />
        </span>
      )}
    </>
  );
  const กรอบ: React.CSSProperties = { marginBottom: 0, padding: "18px 18px 15px", display: "flex", flexDirection: "column", gap: 10, textAlign: "left", fontFamily: "inherit", width: "100%" };
  return onClick
    ? <button type="button" className="card clickable" data-kpi={kpi} onClick={onClick} style={{ ...กรอบ, cursor: "pointer" }}>{เนื้อ}</button>
    : <div className="card" data-kpi={kpi} style={กรอบ}>{เนื้อ}</div>;
}
