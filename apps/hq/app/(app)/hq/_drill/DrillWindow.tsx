"use client";
// ─── หน้าต่างเจาะลึกกลางจอ — ตัวกลางของทุกแผงที่มาการ์ด/รายเดือน ในหน้า HQ ภาพรวมยอดขาย · ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า ───
//   บอสสั่ง 9 พ.ย. 69: เดิมเป็นแผงชิดขวา → หน้าต่างกลางจอแบบเดียวกันทุกแผง
//   • แถบหัวน้ำเงิน: ชื่อ · บรรทัดรอง (ช่วงเวลา/สูตร) · ป้าย · ปุ่มปิด
//   • เนื้อหาเป็นส่วน ๆ (ส่วนเจาะ): ไอคอนเล็ก + หัวข้อ · ตารางอยู่ในกล่องขาวมุมโค้ง
//   • ไม่มีแถวสรุป/แถวรวมในหน้าต่าง (ตัวเลขรวมดูที่การ์ด · บอสสั่ง 6 พ.ย. 69)
//   ข้อทดสอบ: tests/scenario/drill-window.spec.ts
import { useEffect, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

const NAVY = "#003366";

export function หน้าต่างเจาะ({ ชื่อ, คำอธิบาย, ป้าย = [], ปิด, ป้ายเข้าถึง, กว้าง = 820, children, ...ข้อมูล }: {
  ชื่อ: string;
  /** บรรทัดรองใต้ชื่อ — ช่วงเวลา / สูตรสั้น ๆ */
  คำอธิบาย?: ReactNode;
  /** ป้ายเล็กบนแถบหัว (เช่น "ถึงเป้า 3 จาก 10 ราย") */
  ป้าย?: { คีย์: string; ข้อความ: ReactNode }[];
  ปิด: () => void;
  /** ชื่อสำหรับโปรแกรมอ่านหน้าจอ (ค่าเริ่ม = "ที่มา <ชื่อ>") */
  ป้ายเข้าถึง?: string;
  กว้าง?: number;
  children: ReactNode;
} & Record<`data-${string}`, string | undefined>) {
  useEffect(() => {
    const กด = (e: KeyboardEvent) => { if (e.key === "Escape") ปิด(); };
    window.addEventListener("keydown", กด);
    return () => window.removeEventListener("keydown", กด);
  }, [ปิด]);
  return (
    <div onClick={ปิด} data-drill-backdrop
      style={{ position: "fixed", inset: 0, background: "rgba(8,16,32,.45)", zIndex: 240, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-label={ป้ายเข้าถึง ?? `ที่มา ${ชื่อ}`} data-drill-window="" {...ข้อมูล}
        onClick={e => e.stopPropagation()}
        style={{ width: `min(${กว้าง}px, 100%)`, maxHeight: "calc(100vh - 32px)", background: "#f4f7fb", borderRadius: 14, overflow: "hidden",
          display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(8,16,32,.28)" }}>
        <header data-drill-head style={{ background: NAVY, color: "#fff", padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "1rem", fontWeight: 800 }}>{ชื่อ}</div>
            {คำอธิบาย && <div data-drill-sub style={{ fontSize: "0.74rem", color: "rgba(255,255,255,.78)", marginTop: 4, lineHeight: 1.5 }}>{คำอธิบาย}</div>}
            {ป้าย.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {ป้าย.map(p => (
                  <span key={p.คีย์} data-drill-badge={p.คีย์}
                    style={{ fontSize: "0.68rem", fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "rgba(255,255,255,.14)", color: "#fff", whiteSpace: "nowrap" }}>{p.ข้อความ}</span>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={ปิด} aria-label="ปิดแผง" title="ปิด (Esc)"
            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.1)", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
        </header>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
      </section>
    </div>
  );
}

/** หนึ่งส่วนในหน้าต่าง: ไอคอนเล็ก + หัวข้อ · ตารางอยู่ในกล่องขาวมุมโค้ง */
export function ส่วนเจาะ({ ไอคอน: Icon, ชื่อ, children, ...ข้อมูล }: { ไอคอน: LucideIcon; ชื่อ: ReactNode; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <div data-drill-section="" {...ข้อมูล}>
      <div data-drill-section-title style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, fontSize: "0.8rem", fontWeight: 800, color: "#1F2937" }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: "#e6eef7", color: NAVY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon size={13} /></span>
        {ชื่อ}
      </div>
      <div data-drill-box style={{ background: "#fff", border: "1px solid #E7EDF4", borderRadius: 12, overflow: "hidden" }}>
        <div className="table-wrap dense fit" style={{ borderTop: "none" }}>{children}</div>
      </div>
    </div>
  );
}
