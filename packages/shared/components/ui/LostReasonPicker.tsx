"use client";

// ── เลือกเหตุผลปิดการขายไม่สำเร็จ — ตัวเดียวทั้งระบบ (รอบ 4 · เดิมลอกไว้ 3 ที่: แท็บงาน · หน้าต่างจากตาราง/บอร์ด · หน้าใบเสนอราคา) ──
//   รายการมาจาก HQ (useLostReasons) · "อื่นๆ (ระบุเอง)" = เปิดช่องพิมพ์ ค่าโหมดพิมพ์ห้ามหลุดลงฐาน (ปุ่มยืนยันล็อกจนพิมพ์จริง)
import { useState } from "react";
import { OTHER_LOST_REASON, OTHER_REASON_OPTION } from "@pms/shared/lib/mock";
import { useLostReasons } from "@pms/shared/lib/useHQConfig";

export function LostReasonPicker({ หัวข้อ = "เลือกเหตุผลที่ปิดการขายไม่ได้", ปุ่มยืนยัน = "ยืนยันปิดการขาย", กำลังบันทึก = false, onConfirm, onCancel }: {
  หัวข้อ?: string; ปุ่มยืนยัน?: string; กำลังบันทึก?: boolean;
  onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const lostReasons = useLostReasons();
  const [เลือก, setเลือก] = useState("");
  const [พิมพ์, setพิมพ์] = useState("");
  const เหตุผล = เลือก === OTHER_LOST_REASON ? พิมพ์.trim() : เลือก;
  const ปุ่ม = (r: string, on: boolean, fn: () => void, dashed = false) => (
    <button key={r} type="button" onClick={fn}
      style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", fontSize: "0.78rem", fontFamily: "inherit", textAlign: "left",
        border: `1px ${dashed ? "dashed" : "solid"} ${on ? "#dc2626" : dashed ? "#9ca3af" : "#e5e7eb"}`, background: on ? "#fee2e2" : dashed ? "#fafafa" : "#fff",
        color: on ? "#dc2626" : dashed ? "#6b7280" : "#2D2D2D", fontWeight: on || dashed ? 700 : 400 }}>{r}</button>
  );
  return (
    <div data-lost-picker style={{ padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#dc2626", marginBottom: 8 }}>{เลือก === OTHER_LOST_REASON ? "ระบุเหตุผลที่ปิดการขายไม่ได้" : หัวข้อ}</div>
      {เลือก === OTHER_LOST_REASON ? (
        <div style={{ marginBottom: 10 }}>
          <input autoFocus aria-label="เหตุผลที่ปิดการขายไม่ได้" value={พิมพ์} onChange={e => setพิมพ์(e.target.value)} placeholder="พิมพ์เหตุผล…"
            style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 11px", fontSize: "0.8rem", color: "#2D2D2D", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          <button type="button" onClick={() => { setเลือก(""); setพิมพ์(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#003366", fontSize: "0.72rem", fontWeight: 700, padding: "6px 0 0" }}>← กลับไปเลือกจากรายการ</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, marginBottom: 10 }}>
          {lostReasons.map(r => ปุ่ม(r, เลือก === r, () => setเลือก(r === OTHER_REASON_OPTION ? OTHER_LOST_REASON : r)))}
          {!lostReasons.includes(OTHER_REASON_OPTION) && ปุ่ม(OTHER_REASON_OPTION, false, () => setเลือก(OTHER_LOST_REASON), true)}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>ยกเลิก</button>
        <button type="button" className="btn btn-sm" disabled={!เหตุผล || กำลังบันทึก} onClick={() => onConfirm(เหตุผล)}
          style={{ background: เหตุผล && !กำลังบันทึก ? "#dc2626" : "#f3f4f6", color: เหตุผล && !กำลังบันทึก ? "#fff" : "#9ca3af", cursor: เหตุผล && !กำลังบันทึก ? "pointer" : "not-allowed" }}>
          {ปุ่มยืนยัน}
        </button>
      </div>
    </div>
  );
}
