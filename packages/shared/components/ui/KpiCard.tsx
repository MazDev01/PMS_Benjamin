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
import { InfoTip } from "@pms/shared/components/ui/InfoTip";

// ── ใต้ตัวเลขเหลือแค่หน่วยสั้น (บอสสั่ง 19 พ.ย. 69 "ข้อมูลแบบนี้เอาออก") ──────────────────────────────────────────────
//   การ์ดทุกใบ: ชื่อการ์ด · ตัวเลข · หน่วยสั้น (คำเดียว เช่น "ราย" "ใบ" "คำขอ") · ลิงก์ดูรายละเอียด
//   คำอธิบาย/สูตร/ขอบเขต (ส่วนหลัง " · " ของหน่วย · หน่วยที่ยาวเป็นประโยค · บรรทัดรอง sub · เหตุผลตอนไม่มีข้อมูล) → ไอคอน ⓘ ข้างชื่อการ์ด
//   ความหมายไม่หาย (ข้อความเดิมอยู่ใน ⓘ ครบ) · data-kpi-unit = หน่วยที่แสดง · data-kpi-tip = ข้อความใน ⓘ (ข้อทดสอบ kpi-card-short.spec)
export function แยกหน่วย(unit: string | undefined): { สั้น: string; อธิบาย: string } {
  const u = (unit ?? "").trim();
  if (!u) return { สั้น: "", อธิบาย: "" };
  const [หัว, ...ที่เหลือ] = u.split(" · ");
  const สั้นพอ = /^[฀-๿A-Za-z%]{1,9}$/.test(หัว);   // คำเดียว (อักษรไทย/อังกฤษ) ไม่มีตัวเลข/ช่องว่าง/ลูกศร
  return สั้นพอ ? { สั้น: หัว, อธิบาย: ที่เหลือ.join(" · ") } : { สั้น: "", อธิบาย: u };
}

const NAVY = "#003366";
const ป้าย: React.CSSProperties = { fontSize: "0.8rem", color: "var(--muted-foreground)" };
const ตัวเลข: React.CSSProperties = { fontSize: "1.25rem", fontWeight: 800, color: "#1F2937", lineHeight: 1.15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

/** range = ช่วงที่การ์ด "ในช่วงนี้" ใช้ (ข้อทดสอบอ่าน data-range-* แล้วเทียบกับ kpi_cards ช่วงเดียวกัน) · ไม่ส่ง = ณ ตอนนี้/ทุกช่วง */
/** สามใบ = แถวการ์ด 3 ใบเต็มความกว้าง (หน้าลูกค้าทั้งเครือ · บอสสั่ง 30 ต.ค. 69) */
export function KpiRow({ label, children, style, range, สามใบ }: { label: string; children: ReactNode; style?: React.CSSProperties; range?: { start: string; end: string } | null; สามใบ?: boolean }) {
  return <div className={สามใบ ? "hq-kpi4 hq-kpi3" : "hq-kpi4"} role="group" aria-label={label} data-kpi-row data-range-start={range?.start ?? ""} data-range-end={range?.end ?? ""}
    style={{ marginBottom: "1.25rem", ...style }}>{children}</div>;
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
  const { สั้น, อธิบาย } = แยกหน่วย(ว่าง ? undefined : unit);
  const มีคำอธิบาย = !!(อธิบาย || (sub && !ว่าง) || ว่าง);
  const เนื้อ = (
    <>
      <span style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, width: "100%" }}>
        <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
          <span style={{ ...ป้าย, display: "inline-flex", alignItems: "center", gap: 2 }}>{label}
            {มีคำอธิบาย && <span data-kpi-tip style={{ display: "inline-flex" }}><InfoTip ในปุ่ม={!!onClick} label={`คำอธิบาย ${label}`}>
              {ว่าง ? (empty ?? "ยังไม่มีข้อมูล") : <>{อธิบาย}{อธิบาย && sub ? <br /> : null}{sub}</>}
            </InfoTip></span>}
          </span>
          <b data-testid={testId} data-value={rawValue ?? ""} style={{ ...ตัวเลข, marginTop: 4, color: ว่าง ? "#9ca3af" : danger ? "#dc2626" : ตัวเลข.color }}>{ว่าง ? "—" : value}</b>
          {สั้น && <span data-kpi-unit style={{ ...ป้าย, fontSize: "0.76rem" }}>{สั้น}</span>}
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
