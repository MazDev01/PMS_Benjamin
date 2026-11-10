"use client";

import { useEffect, useState, type JSX, type ReactNode } from "react";
import { STEEL } from "@pms/shared/lib/theme";
import { RowPanel } from "@pms/shared/components/ui/RowPanel";
import { ย่อชื่อ } from "@pms/shared/components/ui/DetailPanel";

export type DrawerTab = { key: string; label: string; content: ReactNode };

export type RightDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** optional action buttons rendered on the right of the header */
  headerRight?: ReactNode;
  /** รูปประจำตัว (โลโก้/รูปโปรไฟล์) — ไม่ส่งมา = ใช้ตัวย่อของชื่อเหมือนเดิม
   *  บอสแจ้ง 2 ก.ย. 69: อัปโหลดรูปแล้วในเนื้อแผงเห็นรูป แต่หัวแผงยังขึ้นตัวย่อ "ad" อยู่ */
  avatar?: string;
  tabs: DrawerTab[];
  initialTab?: string;
  /** เลิกใช้ — แผงจากแถวกว้างเท่ากันทุกแผง (RowPanel) */
  width?: number;
};

/**
 * แผงผู้ใช้ (ตั้งค่า › ผู้ใช้งาน) — เปลือก = ตัวกลาง RowPanel (แผงจากแถว · ชิดขวา กว้าง 640 · จอ < 1024 เต็มจอ · บอสตอบ 10 พ.ย. 69)
 * คงรูปแบบรับค่าเดิม (open/title/subtitle/headerRight/tabs/initialTab) · width เลิกใช้ · avatar แสดงในป้ายหัวแผง
 */
export function RightDrawer({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  avatar,
  tabs,
  initialTab,
}: RightDrawerProps): JSX.Element | null {
  const [active, setActive] = useState<string>(initialTab ?? tabs[0]?.key ?? "");
  // เปิดใหม่ = กลับแท็บตั้งต้น
  useEffect(() => {
    if (open) setActive(initialTab ?? tabs[0]?.key ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);
  if (!open) return null;
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];
  const isEmptyContent =
    activeTab?.content == null ||
    activeTab.content === "" ||
    (Array.isArray(activeTab.content) && activeTab.content.length === 0);
  return (
    <RowPanel label={title} onClose={onClose} closeLabel="ปิด" zIndex={1000}
      title={<span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {/* มีรูปก็โชว์รูป · ไม่มีค่อยใช้ตัวย่อชื่อ (บอสแจ้ง 2 ก.ย. 69) */}
        {avatar
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={avatar} alt="" style={{ width: 32, height: 32, borderRadius: 10, objectFit: "cover", flexShrink: 0, border: "1px solid rgba(255,255,255,.28)" }} />
          : <span style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.2)", fontSize: "0.8rem",
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ย่อชื่อ(title)}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </span>}
      subtitle={subtitle}
      actions={headerRight}
      tabs={tabs.map(t => ({ key: t.key, label: t.label }))} tab={active} onTab={setActive}>
      {isEmptyContent
        ? <div style={{ color: "#9aa2ad", fontSize: "0.86rem", padding: "24px 0", textAlign: "center" }}>ไม่มีข้อมูล</div>
        : <div style={{ color: STEEL }}>{activeTab?.content}</div>}
    </RowPanel>
  );
}

/** Labeled block used to group rows/content inside a drawer tab. */
export function DrawerSection({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  // หัวข้ออยู่นอกการ์ด · เนื้อหาอยู่ในการ์ดขอบมน — มาตรฐานเดียวกับแผงรายละเอียดฝั่ง HQ
  // (เดิมเป็นหัวข้อขีดเส้นใต้แล้วเนื้อหาลอยบนพื้นหลัง อ่านแล้วแยกกลุ่มไม่ออกเวลามีหลายหัวข้อ)
  return (
    <section style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: "0.62rem",
          fontWeight: 800,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "#64748B",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{
        background: "#fff",
        border: "1px solid #E7EDF4",
        borderRadius: 14,
        padding: "4px 14px",
        boxShadow: "0 1px 2px rgba(15,23,42,.04)",
      }}>
        {children}
      </div>
    </section>
  );
}

/** Label / value row for consistent key-value display inside a drawer. */
export function DrawerRow({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div
      className="panel-kv"
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 14,
        padding: "9px 0",
        borderBottom: "1px solid #F1F5F9",
      }}
    >
      <span style={{ fontSize: "0.76rem", color: "#64748B", flexShrink: 0 }}>{label}</span>
      {/* ไม่มีข้อมูล = "—" สีจาง (ห้ามเดาค่าแทน) · มีข้อมูล = ตัวหนาสีเข้ม อ่านคู่ป้ายกำกับได้ทันที */}
      <span style={{
        fontSize: "0.8rem", fontWeight: 700,
        color: value == null || value === "" ? "#94A3B8" : STEEL,
        textAlign: "right", minWidth: 0,
      }}>
        {value == null || value === "" ? "—" : value}
      </span>
    </div>
  );
}
