"use client";
// ── ปุ่มนำเข้าแบบเมนูเลื่อนลง ตัวกลาง (บอสสั่ง 5 พ.ย. 69) — หน้าตาเดียวกับ "ส่งออก" (ExportMenu): ไอคอน + ชื่อ + คำอธิบายสั้น ─────
//   Excel (.xlsx) · CSV (.csv) · ดาวน์โหลดแบบฟอร์มตัวอย่าง
//   เลือก Excel/CSV = เปิดหน้าต่างเลือกไฟล์ทันที (รับเฉพาะนามสกุลนั้น) ไม่มีกล่องเปล่าคั่น → onFile → หน้าตรวจเดิมของแต่ละหน้า
//   ใช้ร่วม: ผู้สนใจเป็นดีลเลอร์ (/hq/prospects) · ลูกค้าเดิม (/customers ดีลเลอร์)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Upload, ChevronDown, FileSpreadsheet, FileText, FileDown } from "lucide-react";
import type { ExtraAction } from "@pms/shared/components/ui/ExportMenu";

import { ตัวเลือกนำเข้า, type ชนิดไฟล์นำเข้า } from "@pms/shared/lib/importMenuOptions";
export { ตัวเลือกนำเข้า, type ชนิดไฟล์นำเข้า };
const ไอคอน: Record<string, ReactNode> = { xlsx: <FileSpreadsheet size={15} />, csv: <FileText size={15} />, template: <FileDown size={15} /> };

export function ImportMenu({ label = "นำเข้าจากไฟล์", onFile, onTemplate, small = true, primary = false, extraActions, extraLabel }: {
  /** ชื่อปุ่ม (เช่น "นำเข้าจากไฟล์" · "นำเข้าลูกค้าเดิม") */
  label?: string;
  /** เลือกไฟล์แล้ว → หน้าตรวจของหน้านั้น */
  onFile: (f: File, ชนิด: ชนิดไฟล์นำเข้า) => void;
  /** ดาวน์โหลดแบบฟอร์มตัวอย่าง (หัวตารางตรงกับที่ระบบอ่าน) */
  onTemplate: () => void;
  small?: boolean;
  primary?: boolean;
  /** รายการเสริมใต้เส้นคั่น (เช่น ชุดที่นำเข้าล่าสุด) */
  extraActions?: ExtraAction[];
  extraLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ช่องXlsx = useRef<HTMLInputElement>(null), ช่องCsv = useRef<HTMLInputElement>(null);
  const ช่อง = { xlsx: ช่องXlsx, csv: ช่องCsv };
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", esc); };
  }, []);
  const เลือก = (k: ชนิดไฟล์นำเข้า | "template") => {
    setOpen(false);
    if (k === "template") onTemplate();
    else ช่อง[k].current?.click();   // ภายในการกดเดียวกัน — เบราว์เซอร์ยอมเปิดหน้าต่างเลือกไฟล์
  };
  const ปุ่มรายการ = (key: string, ป้าย: string, คำอธิบาย: string | undefined, icon: ReactNode, onClick: () => void, extra = {}) => (
    <button key={key} type="button" role="menuitem" onClick={onClick} {...extra}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f8f9fb"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: "#dce5f0", color: "#003366", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</span>
      <span>
        <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D" }}>{ป้าย}</span>
        {คำอธิบาย && <span style={{ display: "block", fontSize: "0.65rem", color: "#6b7280" }}>{คำอธิบาย}</span>}
      </span>
    </button>
  );
  return (
    <div ref={ref} style={{ position: "relative" }} data-import-menu>
      <button type="button" className={`btn ${primary ? "btn-primary" : "btn-secondary"} ${small ? "btn-sm" : "btn-md"}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(o => !o)} style={{ gap: 6 }}>
        <Upload size={14} /> {label}
        <ChevronDown size={13} style={{ opacity: 0.55, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {(["xlsx", "csv"] as const).map(k => (
        <input key={k} ref={ช่อง[k]} type="file" accept={ตัวเลือกนำเข้า.find(x => x.key === k)!.accept} aria-label={`${label} — ${k === "xlsx" ? "Excel" : "CSV"}`}
          data-import-input={k} style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f, k); }} />
      ))}
      {open && (
        <div role="menu" aria-label={label} className="card" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60, minWidth: 240, boxShadow: "var(--shadow-lg, 0 12px 36px rgba(0,0,0,.14))", overflow: "hidden", padding: 4 }}>
          {ตัวเลือกนำเข้า.map(o => ปุ่มรายการ(o.key, o.label, o.desc, ไอคอน[o.key], () => เลือก(o.key), { "data-import-option": o.key }))}
          {extraActions && extraActions.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid #eef0f4", margin: "4px 0" }} />
              {extraLabel && <div style={{ padding: "4px 10px 2px", fontSize: "0.62rem", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.04em" }}>{extraLabel}</div>}
              {extraActions.map(a => ปุ่มรายการ(a.label, a.label, a.desc, a.icon, () => { setOpen(false); a.onClick(); }, { "data-import-extra": "" }))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
