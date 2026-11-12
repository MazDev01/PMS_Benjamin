"use client";

import React from "react";
import { useModalA11y } from "@pms/shared/lib/useModalA11y";
import { X, Eye, Image as ImageIcon, FileText, FileSpreadsheet, File as FileIcon } from "lucide-react";
import type { DealerFile, DealerFileExt } from "@pms/shared/lib/mock";

const PRIMARY = "#003366";
const STEEL = "#2D2D2D";
const MUTED = "#8a929c";
const BORDER = "#eef0f3";

export function extLabel(ext: DealerFileExt): string {
  switch (ext) {
    case "pdf": return "เอกสาร PDF";
    case "docx": return "เอกสาร Word";
    case "xlsx": return "ตาราง Excel";
    case "pptx": return "งานนำเสนอ";
    case "dwg": return "แบบ CAD";
    case "jpg": case "png": return "รูปภาพ";
    default: return "ไฟล์";
  }
}
function extIcon(ext: DealerFileExt, size = 24) {
  if (ext === "jpg" || ext === "png") return <ImageIcon size={size} color="#0891b2" />;
  if (ext === "xlsx") return <FileSpreadsheet size={size} color="#059669" />;
  if (ext === "pdf") return <FileText size={size} color="#dc2626" />;
  if (ext === "docx") return <FileText size={size} color="#003366" />;
  if (ext === "pptx") return <FileText size={size} color="#d97706" />;
  return <FileIcon size={size} color="#64748b" />;
}
function extBg(ext: DealerFileExt): string {
  if (ext === "jpg" || ext === "png") return "#e0f2fe";
  if (ext === "xlsx") return "#dcfce7";
  if (ext === "pdf") return "#fee2e2";
  if (ext === "docx") return "#dbeafe";
  if (ext === "pptx") return "#fef3c7";
  return "#f1f5f9";
}

/** ตัวไฟล์ที่พรีวิวได้ (DealerFile หรือรูปแบบใกล้เคียง) */
export type PreviewFile = Pick<DealerFile, "name" | "ext" | "size" | "category" | "project" | "uploadedBy" | "uploadedAt">;

function PreviewBody({ f }: { f: PreviewFile }) {
  // PDF — จำลองหน้ากระดาษ A4 พร้อมลายน้ำ
  if (f.ext === "pdf") {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 24, background: "#eceef0" }}>
        <div style={{
          position: "relative", width: "100%", maxWidth: 440, aspectRatio: "1 / 1.414",
          background: "#fff", borderRadius: 4, boxShadow: "0 6px 24px rgba(0,0,0,.14)",
          padding: "40px 36px", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "5rem", fontWeight: 900, color: "rgba(220,38,38,.06)", transform: "rotate(-24deg)",
            letterSpacing: 6, pointerEvents: "none", userSelect: "none",
          }}>PDF</div>
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 800, color: PRIMARY, letterSpacing: 1, textTransform: "uppercase" }}>{f.category}</div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: STEEL, marginTop: 10, lineHeight: 1.4, wordBreak: "break-word" }}>{f.name}</div>
            <div style={{ height: 3, width: 54, background: PRIMARY, borderRadius: 3, margin: "12px 0 20px" }} />
            {[92, 100, 78, 96, 64].map((w, i) => (
              <div key={i} style={{ height: 8, width: `${w}%`, background: "#e5e7eb", borderRadius: 4, marginBottom: 11 }} />
            ))}
            <div style={{ height: 8, width: "42%", background: "#eef0f3", borderRadius: 4, margin: "22px 0 11px" }} />
            {[88, 97, 71].map((w, i) => (
              <div key={i} style={{ height: 8, width: `${w}%`, background: "#e5e7eb", borderRadius: 4, marginBottom: 11 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // รูปภาพ
  if (f.ext === "jpg" || f.ext === "png") {
    return (
      <div style={{ padding: 24, background: "#eceef0", display: "flex", justifyContent: "center" }}>
        <div style={{
          width: "100%", maxWidth: 520, aspectRatio: "4 / 3", borderRadius: 12, overflow: "hidden",
          border: "6px solid #fff", boxShadow: "0 8px 30px rgba(0,0,0,.16)", background: "#003366",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
        }}>
          <ImageIcon size={56} color="rgba(255,255,255,.9)" />
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#fff", textAlign: "center", padding: "0 20px", wordBreak: "break-word" }}>{f.name}</div>
          <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,.72)" }}>{f.size} · {extLabel(f.ext)}</div>
        </div>
      </div>
    );
  }

  // PowerPoint — สไลด์ 16:9
  if (f.ext === "pptx") {
    return (
      <div style={{ padding: 24, background: "#eceef0", display: "flex", justifyContent: "center" }}>
        <div style={{
          width: "100%", maxWidth: 560, aspectRatio: "16 / 9", background: "#fff", borderRadius: 8,
          boxShadow: "0 8px 30px rgba(0,0,0,.16)", overflow: "hidden", display: "flex", flexDirection: "column",
        }}>
          <div style={{ background: PRIMARY, padding: "18px 24px" }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "rgba(255,255,255,.6)", letterSpacing: 1 }}>สไลด์นำเสนอ</div>
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", marginTop: 4, lineHeight: 1.3, wordBreak: "break-word" }}>{f.name}</div>
          </div>
          <div style={{ flex: 1, padding: "20px 28px", display: "flex", flexDirection: "column", gap: 14, justifyContent: "center" }}>
            {[86, 72, 90].map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: PRIMARY, flexShrink: 0 }} />
                <div style={{ height: 9, width: `${w}%`, background: "#e5e7eb", borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // อื่นๆ (xlsx / docx / dwg / other) — การ์ดข้อมูลไฟล์
  return (
    <div style={{ padding: 28, background: "#eceef0", display: "flex", justifyContent: "center" }}>
      <div style={{
        width: "100%", maxWidth: 460, background: "#fff", borderRadius: 12,
        boxShadow: "0 8px 30px rgba(0,0,0,.12)", padding: "28px 26px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
      }}>
        <div style={{ background: extBg(f.ext), borderRadius: 16, padding: 20, display: "flex" }}>
          {extIcon(f.ext, 48)}
        </div>
        <div style={{ fontSize: "0.92rem", fontWeight: 800, color: STEEL, textAlign: "center", wordBreak: "break-word" }}>{f.name}</div>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1, borderTop: `1px solid ${BORDER}` }}>
          {[
            ["ประเภท", extLabel(f.ext)],
            ["ขนาด", f.size],
            ["แฟ้ม", f.category],
            ["โอกาสการขาย", f.project],
            ["ผู้แนบ", f.uploadedBy],
            ["วันที่", f.uploadedAt],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
              <span style={{ fontSize: "0.72rem", color: MUTED, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: STEEL, textAlign: "right", wordBreak: "break-word" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FilePreviewModal({ file, onClose }: { file: PreviewFile; onClose: () => void }) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose);   // Esc / Tab / คืนโฟกัส
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", zIndex: 200 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, pointerEvents: "none" }}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="ดูตัวอย่างไฟล์" onClick={e => e.stopPropagation()} className="card"
          style={{ width: "100%", maxWidth: 640, maxHeight: "90vh", pointerEvents: "auto", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,51,102,.28)" }}>
          <div style={{ background: PRIMARY, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div style={{ background: "rgba(255,255,255,.15)", borderRadius: 8, padding: 7, display: "flex", flexShrink: 0 }}>
                <Eye size={15} color="#fff" />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={file.name}>{file.name}</div>
                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,.72)", marginTop: 2 }}>{extLabel(file.ext)} · {file.size}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 7, width: 28, height: 28, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={13} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <PreviewBody f={file} />
          </div>
          <div style={{ padding: "13px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, justifyContent: "flex-end", background: "#fafafa" }}>
            <button onClick={onClose} className="btn btn-primary btn-md">ปิด</button>
          </div>
        </div>
      </div>
    </>
  );
}
