"use client";

// ─── แผงรายละเอียดด้านขวา — หน้าตากลางของทุกหน้า "ทั้งเครือ" ────────────────────
//
// ที่มา: หน้าใบเสนอราคาทั้งเครือกับหน้าลูกค้าเป้าหมายทั้งเครือใช้หน้าตานี้อยู่แล้ว
// บอสสั่ง 3 ก.ย. 69 ให้หน้าลูกค้าทั้งเครือใช้แบบเดียวกัน (เดิมเป็นกล่องกลางจอ คนละแบบ)
// จึงยกโครงออกมาเป็นชิ้นส่วนกลาง — แก้ที่เดียวแล้วเปลี่ยนพร้อมกันทุกหน้า ไม่ต้องไล่ลอก
//
// โครง: แผงลอยจากขอบจอ มนทุกมุม · หัวแผงมีวงย่อชื่อ + ป้ายสรุป · เนื้อหาเลื่อนได้
//       · แถบล่างตรึงไว้เสมอ (บอกขอบเขตสิทธิ์ + ปุ่มปิดที่นิ้วโป้งถึง)
import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useModalA11y } from "@pms/shared/lib/useModalA11y";
import { ย่อชื่อ } from "@pms/shared/components/ui/DetailPanel";

const PRIMARY = "#003366";

export type ป้ายหัวแผง = { ข้อความ: string; พื้น?: string; ตัวอักษร?: string };
export type แท็บแผง = { key: string; label: string; content: ReactNode };

export function SidePanel({
  title, subtitle, badges = [], tabs, children, footerNote, onClose, label, width = 440,
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
  width?: number;
}) {
  const [tab, setTab] = useState(tabs?.[0]?.key ?? "");
  // Esc ปิดได้ · Tab วนอยู่ในแผง · ปิดแล้วโฟกัสกลับไปที่แถวที่กดเปิด
  const ref = useModalA11y<HTMLElement>(onClose);
  const เนื้อหา = tabs ? (tabs.find(t => t.key === tab) ?? tabs[0])?.content : children;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }}>
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={e => e.stopPropagation()}
        className="side-drawer"
        style={{ position: "fixed", top: 12, right: 12, bottom: 12, width, maxWidth: "calc(100vw - 24px)",
          background: "#F8FAFC", boxShadow: "0 24px 70px rgba(0,0,0,.24)", borderRadius: 18, overflow: "hidden",
          display: "flex", flexDirection: "column" }}
      >
        {/* หัวแผง — ชื่อเด่น + วงย่อชื่อ · ป้ายสรุปอยู่บรรทัดเดียวกัน */}
        <div data-panel-head style={{ background: "linear-gradient(135deg,#003366 0%,#00284F 60%,#001B36 100%)", padding: "18px 20px 16px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.2)",
              color: "#fff", fontWeight: 800, fontSize: "0.92rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {ย่อชื่อ(title)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
              {subtitle && (
                <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,.7)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {subtitle}
                </div>
              )}
              {badges.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                  {badges.map((b, i) => (
                    <span key={i} className="badge" style={{ background: b.พื้น ?? "rgba(255,255,255,.15)", color: b.ตัวอักษร ?? "#fff" }}>{b.ข้อความ}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="ปิด" title="ปิด" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.2)",
            background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
            <X size={14} />
          </button>
        </div>

        {/* แท็บ — มีเฉพาะแผงที่มีหลายเรื่องให้ดู · เลื่อนตามแนวนอนได้เมื่อแท็บเยอะ */}
        {tabs && tabs.length > 1 && (
          <div role="tablist" aria-label="หัวข้อ" style={{ display: "flex", gap: 2, padding: "0 12px", background: "#fff",
            borderBottom: "1px solid #E7EDF4", overflowX: "auto", flexShrink: 0 }}>
            {tabs.map(t => {
              const on = t.key === (tabs.find(x => x.key === tab) ? tab : tabs[0].key);
              return (
                <button key={t.key} role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                  style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                    // เส้นใต้ต้องทับเส้นขอบล่างพอดี ไม่ให้เห็นช่องว่างขาวคั่น (แก้ 2 ก.ย. 69)
                    padding: "11px 12px 9px", marginBottom: -1, fontSize: "0.76rem",
                    fontWeight: on ? 800 : 600, color: on ? PRIMARY : "#64748B",
                    borderBottom: `3px solid ${on ? PRIMARY : "transparent"}` }}>
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 20px" }}>{เนื้อหา}</div>

        <div style={{ borderTop: "1px solid #E7EDF4", background: "#fff", padding: "10px 14px", display: "flex",
          alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: "0.68rem", color: "#94A3B8", lineHeight: 1.5 }}>{footerNote}</span>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ color: PRIMARY, flexShrink: 0 }}>ปิด</button>
        </div>
      </aside>
    </div>
  );
}
