"use client";
// ── การ์ดบอร์ดตัวกลาง (บอสสั่ง 13 พ.ย. 69) — บอร์ดลูกค้าเป้าหมาย (/leads ดีลเลอร์) + บอร์ดผู้สนใจเป็นดีลเลอร์ (/hq/prospects) ─────
//   หน้าตาเดียวกันทั้งสองบอร์ด: ชื่อ + ไอคอนตา · ป้ายชื่อ (ผู้ติดต่อ/ชื่อบนโซเชียล) · โทรศัพท์ · อีเมล · จังหวัด · เริ่มติดต่อ ·
//   ติดต่อล่าสุด (นานเกินเกณฑ์ของหน้านั้น = แดง) · รูปผู้ดูแล · ป้ายสถานะ · แถบความคืบหน้า % · ติดตามครั้งถัดไป
//   ปุ่ม "ย้ายไปขั้น…" อยู่ที่ StageBoard (ต่อท้ายการ์ดทุกใบ)
//   ไม่มีข้อมูล = "—" ทุกช่อง (ห้ามกุ) · ค่าทุกช่องมาจากหน้า (ข้อมูลจริงของรายนั้น) — การ์ดไม่คิดเอง
//   ข้อทดสอบ: tests/scenario/board-card-shared.spec.ts
import React from "react";
import { Eye, User, Phone, Mail, MapPin, Calendar, AlarmClock, CalendarClock } from "lucide-react";

/** ช่องของการ์ด (ชื่อช่องตรงตัว — ข้อทดสอบตรวจครบทุกช่องจาก data-board-field) */
export const ช่องการ์ดบอร์ด = ["โทรศัพท์", "อีเมล", "จังหวัด", "เริ่มติดต่อ", "ติดต่อล่าสุด", "ติดตามครั้งถัดไป"] as const;

export function BoardCard({ ชื่อ, ป้ายชื่อ, ป้ายชื่อคือ, ป้ายมูลค่า, โทรศัพท์, อีเมล, จังหวัด, เริ่มติดต่อ, ติดต่อล่าสุด, นานเกิน, ผู้ดูแล, ป้ายสถานะ, ความคืบหน้า, ติดตามครั้งถัดไป, เลยกำหนดติดตาม, children }: {
  ชื่อ: string;
  /** ป้ายใต้ชื่อ (ลีด = ผู้ติดต่อ · ผู้สนใจ = ชื่อบนโซเชียล) */
  ป้ายชื่อ?: string | null;
  ป้ายชื่อคือ: string;
  /** มูลค่า (เฉพาะลีด) — ไม่ส่ง = ไม่มีป้ายนี้ */
  ป้ายมูลค่า?: string;
  โทรศัพท์?: string | null;
  อีเมล?: string | null;
  จังหวัด?: string | null;
  เริ่มติดต่อ?: string | null;
  ติดต่อล่าสุด?: string | null;
  นานเกิน?: boolean;
  ผู้ดูแล: React.ReactNode;
  ป้ายสถานะ: React.ReactNode;
  ความคืบหน้า: React.ReactNode;
  ติดตามครั้งถัดไป?: string | null;
  เลยกำหนดติดตาม?: boolean;
  /** ของเฉพาะบอร์ด (เช่น ลิงก์ดีลเลอร์ของผู้สนใจที่เป็นดีลเลอร์แล้ว) */
  children?: React.ReactNode;
}) {
  return (
    <div data-board-card-body>
      {/* ไอคอนตา = บอกใบ้ว่ากดการ์ดเปิดรายละเอียดได้ (การ์ดทั้งใบกดได้อยู่แล้ว) */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div data-board-name style={{ fontSize: "0.86rem", fontWeight: 800, color: "#2D2D2D", minWidth: 0,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.35 }} title={ชื่อ}>
          {ชื่อ || "—"}
        </div>
        <Eye size={13} color="#9ca3af" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, margin: "6px 0" }}>
        <span data-board-tag={ป้ายชื่อคือ} title={ป้ายชื่อ ? `${ป้ายชื่อคือ}: ${ป้ายชื่อ}` : `${ป้ายชื่อคือ}: —`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.68rem", fontWeight: 600, color: ป้ายชื่อ ? "#64748b" : "#cbd5e1",
            background: "#f1f5f9", borderRadius: 6, padding: "2px 8px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <User size={10} /> {ป้ายชื่อ || "—"}
        </span>
        {ป้ายมูลค่า !== undefined && (
          <span data-board-value style={{ display: "inline-flex", alignItems: "center", fontSize: "0.72rem", fontWeight: 800, color: "#003366",
            background: "#e3f0fb", borderRadius: 6, padding: "2px 8px", fontVariantNumeric: "tabular-nums" }}>
            {ป้ายมูลค่า}
          </span>
        )}
      </div>
      {children}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "0.68rem",
        borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", padding: "7px 0", marginBottom: 9 }}>
        <Field icon={Phone} label="โทรศัพท์" value={โทรศัพท์} />
        <Field icon={Mail} label="อีเมล" value={อีเมล} />
        <Field icon={MapPin} label="จังหวัด" value={จังหวัด} />
        <Field icon={Calendar} label="เริ่มติดต่อ" value={เริ่มติดต่อ} />
        <Field icon={AlarmClock} label="ติดต่อล่าสุด" value={ติดต่อล่าสุด} tone={นานเกิน ? "#DC3545" : undefined} />
      </div>
      <div data-board-owner style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", marginBottom: 10 }}>{ผู้ดูแล}</div>
      <div data-mini-stage style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        {ป้ายสถานะ}
        {ความคืบหน้า}
      </div>
      <div style={{ fontSize: "0.65rem", marginTop: 6 }}>
        <Field icon={CalendarClock} label="ติดตามครั้งถัดไป" value={ติดตามครั้งถัดไป} tone={เลยกำหนดติดตาม ? "#DC3545" : undefined} />
      </div>
    </div>
  );
}

function Field({ icon: Ic, label, value, tone }: { icon: typeof User; label: (typeof ช่องการ์ดบอร์ด)[number]; value?: string | null; tone?: string }) {
  const มีค่า = !!value && value !== "—";
  return (
    <span data-board-field={label} style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
      <Ic size={10} color="#94a3b8" style={{ flexShrink: 0 }} />
      <span style={{ color: "#94a3b8", fontWeight: 600, flexShrink: 0 }}>{label}:</span>
      <span data-board-value-of={label} title={มีค่า ? String(value) : undefined}
        style={{ color: มีค่า ? (tone ?? "#475569") : "#cbd5e1", fontWeight: tone ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {มีค่า ? value : "—"}
      </span>
    </span>
  );
}

/** แถบความคืบหน้าแบบช่องขั้น + % (ตัวกลาง — LeadProgressBar ของลีดก็วาดด้วยตัวนี้) */
export function StepProgressBar({ ขั้น, จำนวนขั้น, เปอร์เซ็นต์, สีแถบ, สีตัวเลข = "#374151", ป้าย }: {
  ขั้น: number; จำนวนขั้น: number; เปอร์เซ็นต์: number; สีแถบ: string; สีตัวเลข?: string; ป้าย?: string;
}) {
  return (
    <div role="img" aria-label={`ความคืบหน้า ${เปอร์เซ็นต์}%${ป้าย ? ` · ${ป้าย}` : ""}`} data-progress={เปอร์เซ็นต์} data-progress-steps={จำนวนขั้น}
      title={`${ขั้น} จาก ${จำนวนขั้น} ขั้น${ป้าย ? ` · ${ป้าย}` : ""}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "grid", gridTemplateColumns: `repeat(${จำนวนขั้น}, 1fr)`, gap: 2, flex: 1, maxWidth: 90 }}>
        {Array.from({ length: จำนวนขั้น }, (_, i) => i + 1).map(k => <span key={k} data-progress-cell style={{ height: 4, borderRadius: 99, background: k <= ขั้น ? สีแถบ : "#e5e7eb" }} />)}
      </span>
      <span style={{ fontSize: "0.66rem", fontWeight: 700, color: สีตัวเลข, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{เปอร์เซ็นต์}%</span>
    </div>
  );
}
