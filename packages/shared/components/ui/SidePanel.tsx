"use client";

// ─── แผงรายละเอียดด้านขวา (หน้าลูกค้าทั้งเครือ HQ) ────────────────────
//
// เปลือกแผง = ตัวกลาง RowPanel (แผงเลื่อนขวาที่เปิดจากแถวตารางทุกหน้า · 10 พ.ย. 69 · กว้าง 820 · จอ < 1024 เต็มจอ)
// ที่นี่คงรูปแบบรับค่าเดิม (ป้าย · แท็บ · ข้อความมุมซ้ายล่าง) ให้ผู้เรียกเดิมไม่ต้องแก้
import { useState, type ReactNode } from "react";
import { RowPanel, ป้ายหัวแผง as ป้ายหัว } from "@pms/shared/components/ui/RowPanel";

const PRIMARY = "#003366";

export type ป้ายหัวแผง = { ข้อความ: string; พื้น?: string; ตัวอักษร?: string };
export type แท็บแผง = { key: string; label: string; content: ReactNode };

export function SidePanel({
  title, subtitle, badges = [], tabs, children, footerNote, onClose, label,
}: {
  title: string;
  subtitle?: string;
  /** ป้ายใต้ชื่อ เช่น สถานะ · มูลค่า (ไม่เกิน 2–3 อันให้อ่านง่าย) */
  badges?: ป้ายหัวแผง[];
  /** มีหลายเรื่องให้ดู = ส่งแท็บมา · เรื่องเดียว = ส่ง children มาแทน */
  tabs?: แท็บแผง[];
  children?: ReactNode;
  /** ข้อความมุมซ้ายล่าง เช่น "สำนักงานใหญ่ดูอย่างเดียว" */
  footerNote?: string;
  onClose: () => void;
  /** ชื่อที่โปรแกรมอ่านหน้าจอจะอ่าน */
  label: string;
  /** เลิกใช้ — ทุกแผงจากแถวกว้างเท่ากัน (RowPanel) */
  width?: number;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.key ?? "");
  const เนื้อหา = tabs ? (tabs.find(t => t.key === tab) ?? tabs[0])?.content : children;

  return (
    <RowPanel label={label} onClose={onClose} closeLabel="ปิด" zIndex={250}
      title={title}
      badges={badges.length ? <>{badges.map((b, i) => <ป้ายหัว key={i} bg={b.พื้น} color={b.ตัวอักษร}>{b.ข้อความ}</ป้ายหัว>)}</> : undefined}
      subtitle={subtitle}
      tabs={tabs?.map(t => ({ key: t.key, label: t.label }))} tab={tab} onTab={setTab}
      footer={
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: "0.68rem", color: "#94A3B8", lineHeight: 1.5 }}>{footerNote}</span>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ color: PRIMARY, flexShrink: 0 }}>ปิด</button>
        </div>
      }>
      {เนื้อหา}
    </RowPanel>
  );
}
