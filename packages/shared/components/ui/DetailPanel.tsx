"use client";

/* ── ชิ้นส่วนกลางของ "แผงรายละเอียด" ทุกหน้า ────────────────────────────────
   มาตรฐานหน้าตาเดียวกันทั้งระบบ (บอสสั่ง 28 ส.ค. 69 · ต้นแบบคือแผงลูกค้าเป้าหมายทั้งเครือ):
     • หัวข้อเป็นตัวพิมพ์เล็กสีเทาอยู่นอกการ์ด · เนื้อหาอยู่ในการ์ดขอบมน
     • แถวข้อมูล = ไอคอน + ป้ายกำกับทางซ้าย · ค่าทางขวาตัวหนา
     • ไม่มีข้อมูลขึ้น "—" สีจาง — ห้ามเดาค่าแทน (กติกาเดิมของทั้งระบบ)

   ⚠️ ประกาศไว้ที่นี่ที่เดียว ห้ามก๊อปไปไว้ในหน้า — เคยมีสามหน้าถือสไตล์คนละชุด
      แล้วแก้ที่เดียวไม่ครบทุกที่ (ปัญหาเดิมของแถบตัวกรอง/ตารางแบ่งหน้า) */

import type { ComponentType, CSSProperties, ReactNode } from "react";

const หัวข้อสไตล์: CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, fontSize: "0.62rem", fontWeight: 800,
  color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8,
};

const การ์ด: CSSProperties = {
  background: "#fff", border: "1px solid #E7EDF4", borderRadius: 14,
  padding: "4px 14px", boxShadow: "0 1px 2px rgba(15,23,42,.04)",
};

export type ไอคอนแบบ = ComponentType<{ size?: number; color?: string }>;

/** หนึ่งหัวข้อในแผงรายละเอียด — หัวข้ออยู่นอกการ์ด เนื้อหาอยู่ในการ์ด */
export function PanelSection({ icon: Ico, title, children, style, bodyStyle }: {
  icon?: ไอคอนแบบ;
  title: string;
  children: ReactNode;
  style?: CSSProperties;
  /** ปรับ padding ของการ์ดเมื่อเนื้อหาไม่ใช่แถวข้อมูล (เช่น รายการการ์ดย่อย) */
  bodyStyle?: CSSProperties;
}) {
  return (
    <section style={{ marginTop: 14, ...style }}>
      <div style={หัวข้อสไตล์}>{Ico && <Ico size={13} color="#94A3B8" />} {title}</div>
      <div style={{ ...การ์ด, ...bodyStyle }}>{children}</div>
    </section>
  );
}

/** แถวป้ายกำกับ: ไอคอน + หัวข้อทางซ้าย · ค่าทางขวา
 *  ในแผงจากแถว (.row-panel · RowPanel) ค่าอยู่ชิดหัวข้อ ไม่กวาดไปขอบขวา (globals.css .row-panel .panel-kv) */
export function PanelRow({ icon: Ico, label, value, strong }: {
  icon?: ไอคอนแบบ;
  label: string;
  value?: ReactNode;
  /** ค่าที่ต้องเด่นกว่าแถวอื่น (เช่น มูลค่า) */
  strong?: boolean;
}) {
  const ว่าง = value === undefined || value === null || value === "" || value === "—";
  return (
    <div className="panel-kv" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "9px 0", borderBottom: "1px solid #F1F5F9", fontSize: "0.76rem",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748B", flexShrink: 0 }}>
        {Ico && <Ico size={13} color="#94A3B8" />} {label}
      </span>
      <span style={{
        fontWeight: strong ? 800 : 700,
        color: ว่าง ? "#94A3B8" : (strong ? "#003366" : "#1F2937"),
        fontSize: strong ? "0.86rem" : undefined,
        textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {ว่าง ? "—" : value}
      </span>
    </div>
  );
}

/** แถบสรุปบนสุดของแผง — ตัวเลขสำคัญที่ต้องเห็นก่อนเลื่อนจอ */
export function PanelStats({ children }: { children: ReactNode }) {
  // ในแผงจากแถว (.row-panel) = กริด 3 ช่อง (globals.css) · หน้าต่างใบคง 2 ช่อง
  return <div className="panel-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}

export function PanelStat({ label, value, sub, tone = "plain" }: {
  label: string; value: ReactNode; sub?: ReactNode;
  /** good = เขียว (สถานะที่ทำแล้ว) · plain = ปกติ */
  tone?: "plain" | "good";
}) {
  const ดี = tone === "good";
  return (
    <div style={{
      background: ดี ? "#ECFDF5" : "#fff", border: `1px solid ${ดี ? "#A7F3D0" : "#E7EDF4"}`,
      borderRadius: 14, padding: "12px 14px", boxShadow: "0 1px 2px rgba(15,23,42,.04)", minWidth: 0,
    }}>
      <div style={{ fontSize: "0.62rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: ดี ? "0.82rem" : "1.15rem", fontWeight: 800, color: ดี ? "#059669" : "#003366", marginTop: ดี ? 6 : 4, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.62rem", color: "#64748B", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** ตัวอักษรย่อสำหรับวงกลมหัวแผง — ตัดคำนำหน้านิติบุคคลออกก่อน ไม่งั้นได้ "บจ" ทุกราย */
export function ย่อชื่อ(ชื่อ: string): string {
  return (ชื่อ || "?").replace(/บจ\.|บมจ\.|หจก\.|บริษัท|จำกัด/g, "").trim().slice(0, 2) || "?";
}
