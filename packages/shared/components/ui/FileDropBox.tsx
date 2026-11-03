"use client";

// ── กล่องแนบไฟล์กลาง (บอสสั่ง 3 พ.ย. 69 "ทำจุดแนบไฟล์แบบรู้เลย") ────────────────────────────────────────────────────────
// ตัวเดียวใช้ทุกจุดที่แนบไฟล์ของคำขอราคา: ฟอร์มขอราคา (ดีลเลอร์) · แท็บใบเสนอราคาของดีลเลอร์ · ใบ HQ ในหน้าคำขอใบเสนอราคา
//   กรอบเส้นประ + ไอคอน + ป้ายบอกชัด + ปุ่ม "เลือกไฟล์" + ลากไฟล์มาวางได้ · ข้อจำกัด (ชนิด · ขนาด · จำนวน) อยู่ในกล่อง
//   ตรวจชนิด/ขนาด/จำนวนทันทีที่เลือก (ตรงกับฐาน lib/quoteFiles.ts) — ไฟล์ที่ไม่ผ่านขึ้นเป็นแถวเตือนของไฟล์นั้น · เซิร์ฟเวอร์ยังตรวจซ้ำ
// ข้อทดสอบ: tests/scenario/quote-request-files.spec.ts
import { useRef, useState } from "react";
import { Paperclip, Upload, X, AlertTriangle } from "lucide-react";
import { acceptไฟล์แนบ, ป้ายชนิดที่รับ, ตรวจไฟล์แนบ, ขนาดไฟล์, ไฟล์มากสุดต่อฝั่ง } from "@pms/shared/lib/quoteFiles";

export type ไฟล์ไม่ผ่าน = { key: string; name: string; size: number; เหตุ: string };

/** แยกไฟล์ที่เลือกเป็น ผ่าน/ไม่ผ่าน ตามกติกาเดียวกับฐาน (มีอยู่แล้ว = จำนวนที่แนบไว้ของฝั่งนี้) */
export function คัดไฟล์(เลือก: File[], มีอยู่แล้ว: number): { ผ่าน: File[]; ไม่ผ่าน: ไฟล์ไม่ผ่าน[] } {
  const ผ่าน: File[] = [], ไม่ผ่าน: ไฟล์ไม่ผ่าน[] = [];
  for (const f of เลือก) {
    const เหตุ = ตรวจไฟล์แนบ(f, มีอยู่แล้ว + ผ่าน.length);
    if (เหตุ) ไม่ผ่าน.push({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`, name: f.name, size: f.size, เหตุ });
    else ผ่าน.push(f);
  }
  return { ผ่าน, ไม่ผ่าน };
}

/** กล่องเลือก/ลากไฟล์ — onFiles ได้ไฟล์ทั้งหมดที่เลือก (ผู้เรียกคัดด้วย คัดไฟล์) */
export function FileDropBox({ onFiles, มีอยู่แล้ว, disabled, กำลัง, ป้าย = "แนบไฟล์ (แบบ/รูป/ใบเสนอเดิม)", inputId }: {
  onFiles: (files: File[]) => void;
  /** id ของช่องเลือกไฟล์ (ข้อทดสอบ/ป้ายอ้างถึง) */
  inputId?: string;
  /** จำนวนไฟล์ที่แนบไว้แล้วของฝั่งนี้ (แสดง n/10) */
  มีอยู่แล้ว: number;
  disabled?: boolean;
  /** ข้อความระหว่างทำงาน เช่น "กำลังอัปโหลด 1/2…" (ปุ่มปิดระหว่างนั้น) */
  กำลัง?: string;
  ป้าย?: string;
}) {
  const ช่อง = useRef<HTMLInputElement>(null);
  const [ลากอยู่, setลากอยู่] = useState(false);
  const เต็ม = มีอยู่แล้ว >= ไฟล์มากสุดต่อฝั่ง;
  const ปิด = disabled || !!กำลัง || เต็ม;
  const รับ = (list: FileList | null) => { const fs = Array.from(list ?? []); if (fs.length && !ปิด) onFiles(fs); };
  return (
    <div data-file-drop aria-disabled={ปิด || undefined}
      onDragOver={e => { e.preventDefault(); if (!ปิด) setลากอยู่(true); }}
      onDragLeave={() => setลากอยู่(false)}
      onDrop={e => { e.preventDefault(); setลากอยู่(false); รับ(e.dataTransfer.files); }}
      style={{ border: `2px dashed ${ลากอยู่ ? "#003366" : "#c3cede"}`, background: ลากอยู่ ? "#eef4fb" : "#fbfcfe", borderRadius: 12,
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: disabled ? 0.6 : 1 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: "#e8eef6", color: "#003366", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Upload size={18} />
      </span>
      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
        <div data-drop-label style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1f2937" }}>{ป้าย}</div>
        <div style={{ fontSize: "0.72rem", color: "#4b5563" }}>{เต็ม ? `แนบครบ ${ไฟล์มากสุดต่อฝั่ง} ไฟล์แล้ว — ลบไฟล์เดิมก่อนถ้าจะแนบเพิ่ม` : "ลากไฟล์มาวาง หรือกดเลือกไฟล์"}</div>
        <div data-drop-limits style={{ fontSize: "0.68rem", color: "#6b7280", marginTop: 2 }}>{ป้ายชนิดที่รับ} (แนบแล้ว {มีอยู่แล้ว}/{ไฟล์มากสุดต่อฝั่ง})</div>
      </div>
      <input ref={ช่อง} id={inputId} type="file" multiple accept={acceptไฟล์แนบ} aria-label="เลือกไฟล์แนบ" style={{ display: "none" }} disabled={ปิด}
        onChange={e => { รับ(e.target.files); e.target.value = ""; }} />
      <button type="button" className="btn btn-primary btn-sm" disabled={ปิด} aria-busy={!!กำลัง || undefined} onClick={() => ช่อง.current?.click()}
        style={{ flexShrink: 0 }}>
        <Paperclip size={13} /> {กำลัง || "เลือกไฟล์"}
      </button>
    </div>
  );
}

/** แถวไฟล์แบบการ์ด (ชื่อ · ขนาด · ส่วนเสริม · ปุ่ม) — ใช้กับไฟล์ที่รอส่งและไฟล์ที่ไม่ผ่าน */
export function แถวไฟล์({ name, size, รายละเอียด, เตือน, เอาออก, ป้ายเอาออก }: {
  name: string; size: number; รายละเอียด?: string; เตือน?: string; เอาออก?: () => void; ป้ายเอาออก?: string;
}) {
  return (
    <div data-file-row data-file-name={name} data-file-invalid={เตือน ? "1" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 8, background: เตือน ? "#fef2f2" : "#fff", border: `1px solid ${เตือน ? "#fecaca" : "#e5e7eb"}`,
        borderRadius: 8, padding: "6px 10px", minWidth: 0 }}>
      {เตือน ? <AlertTriangle size={13} color="#dc2626" style={{ flexShrink: 0 }} /> : <Paperclip size={13} color="#6b7280" style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#1f2937", overflowWrap: "anywhere" }}>{name}</div>
        <div style={{ fontSize: "0.7rem", color: เตือน ? "#b91c1c" : "#6b7280" }} role={เตือน ? "alert" : undefined}>
          {ขนาดไฟล์(size)}{รายละเอียด ? ` · ${รายละเอียด}` : ""}{เตือน ? ` · ${เตือน}` : ""}
        </div>
      </div>
      {เอาออก && (
        <button type="button" className="btn btn-secondary btn-sm" aria-label={ป้ายเอาออก ?? `เอา ${name} ออก`} onClick={เอาออก}><X size={13} /></button>
      )}
    </div>
  );
}
