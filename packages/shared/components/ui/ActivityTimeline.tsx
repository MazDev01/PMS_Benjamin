"use client";

import Link from "next/link";
import type React from "react";
import {
  Phone, FileText, Users, GitCommit, StickyNote,
  type LucideIcon,
} from "lucide-react";

const PRIMARY = "#003366";
const STEEL   = "#2D2D2D";
const MUTED   = "#6b7280";
const BORDER  = "#e5e7eb";

export type ActivityTimelineItem = {
  id: number | string;
  type: string;
  text: string;
  time: string;
  /** ป้ายกำกับเฉพาะรายการ — ใส่เมื่อข้อความบนป้ายไม่ใช่ชื่อประเภทตายตัว
   *  (เช่น บันทึกการใช้งาน: ป้ายต้องเป็นชื่อการกระทำจริง "แก้ราคากลาง" ไม่ใช่คำว่า "บันทึก")
   *  ไม่ใส่ = ใช้ชื่อประเภทตาม ACTIVITY_META เหมือนเดิม */
  label?: string;
  /** กดแล้วไปที่เรื่องนั้น (แดชบอร์ด HQ · บอสสั่ง 21 ต.ค. 69) — ไม่ใส่ = อ่านอย่างเดียวเหมือนเดิม */
  href?: string;
};

// แต่ละประเภทกิจกรรม — ไอคอน + สีเน้น (CI) + คำอธิบายภาษาไทย
type ActivityMeta = { icon: LucideIcon; color: string; bg: string; label: string };

const ACTIVITY_META: Record<string, ActivityMeta> = {
  call:    { icon: Phone,      color: PRIMARY,   bg: "#dce5f0", label: "โทรหา" },
  quote:   { icon: FileText,   color: "#0d9488", bg: "#d5f2ee", label: "ส่งใบเสนอราคา" },
  meeting: { icon: Users,      color: "#4338ca", bg: "#e0e7ff", label: "นัดประชุม" },
  status:  { icon: GitCommit,  color: "#059669", bg: "#d5f0e3", label: "เปลี่ยนสถานะ" },
  note:    { icon: StickyNote, color: STEEL,     bg: "#eef0f3", label: "บันทึก" },
};

const NEUTRAL: ActivityMeta = { icon: StickyNote, color: MUTED, bg: "#f0f0f5", label: "กิจกรรม" };

export function ActivityTimeline({ items }: { items: ActivityTimelineItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "24px 8px", color: MUTED, fontSize: "0.8rem" }}>
        ยังไม่มีกิจกรรม
      </div>
    );
  }

  return (
    <div style={{ position: "relative", paddingLeft: 4 }}>
      {items.map((item, i) => {
        const meta = ACTIVITY_META[item.type] ?? NEUTRAL;
        const Icon = meta.icon;
        const isLast = i === items.length - 1;

        return (
          <div key={item.id} style={{ display: "flex", gap: 12, position: "relative" }}>
            {/* Rail: icon dot + connecting line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
                background: meta.bg, color: meta.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${BORDER}`, zIndex: 1,
              }}>
                <Icon size={15} strokeWidth={2} />
              </div>
              {!isLast && (
                <div style={{ width: 2, flex: 1, minHeight: 14, background: BORDER, marginTop: 2, marginBottom: 2 }} />
              )}
            </div>

            {/* Body — มีลิงก์ = ทั้งก้อนกดได้ */}
            <Body href={item.href} style={{ paddingBottom: isLast ? 0 : 16, minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.04em", color: meta.color,
                  background: meta.bg, borderRadius: 6, padding: "2px 7px",
                }}>
                  {item.label ?? meta.label}
                </span>
                <span style={{ fontSize: "0.65rem", color: MUTED }}>{item.time}</span>
              </div>
              <div style={{ fontSize: "0.8rem", fontWeight: 500, color: STEEL, marginTop: 4, lineHeight: 1.4 }}>
                {item.text}
              </div>
            </Body>
          </div>
        );
      })}
    </div>
  );
}

function Body({ href, style, children }: { href?: string; style: React.CSSProperties; children: React.ReactNode }) {
  if (!href) return <div style={style}>{children}</div>;
  return <Link href={href} className="clickable" data-activity-link style={{ ...style, display: "block", color: "inherit", textDecoration: "none", borderRadius: 8 }}>{children}</Link>;
}

export default ActivityTimeline;
