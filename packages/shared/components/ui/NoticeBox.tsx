"use client";

// ── กล่องแจ้งเตือนกลาง (บอสสั่ง 29 ต.ค. 69 · แถบ "ดีลเลอร์ที่ยังไม่มีพื้นที่") ─────────────────────────────────
//   กล่องเตือน/แจ้งในหน้า (ไม่ใช่ป๊อปอัพ) ใช้ตัวนี้ตัวเดียว — สี ขอบ ระยะ ไอคอน มาจากที่เดียว ห้ามเขียนกล่องเตือนเองรายหน้า
//   tone: เตือน = ต้องแก้ก่อนทำต่อ/มีข้อมูลไม่ครบ · แจ้ง = ข้อมูลประกอบ · ผิด = ทำไม่สำเร็จ
import type { CSSProperties, ReactNode } from "react";
import { AlertTriangle, Info, XCircle, type LucideIcon } from "lucide-react";

const ชุดสี = {
  เตือน: { bg: "#fff8e6", border: "#f5d78e", text: "#7a5b12", icon: AlertTriangle },
  แจ้ง: { bg: "#eef4fb", border: "#c9dbef", text: "#1e3a5f", icon: Info },
  ผิด: { bg: "#fdeaed", border: "#f5c2c9", text: "#991b1b", icon: XCircle },
} as const;

export function NoticeBox({ tone = "เตือน", icon, title, children, style, ...data }: {
  tone?: keyof typeof ชุดสี;
  /** ไอคอนแทนของตั้งต้นตามโทน */
  icon?: LucideIcon;
  /** หัวข้อตัวหนา (ตามด้วยเนื้อความ) */
  title?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
} & { [k: `data-${string}`]: string | undefined }) {
  const ส = ชุดสี[tone];
  const Icon = icon ?? ส.icon;
  return (
    <div role={tone === "ผิด" ? "alert" : "note"} data-notice={tone} {...data}
      style={{ display: "flex", alignItems: "flex-start", gap: 9, background: ส.bg, border: `1px solid ${ส.border}`, borderRadius: 10,
        padding: "10px 12px", fontSize: "0.76rem", color: ส.text, lineHeight: 1.6, ...style }}>
      <Icon size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
      <div style={{ minWidth: 0 }}>
        {title != null && <b>{title}</b>}
        {children}
      </div>
    </div>
  );
}
