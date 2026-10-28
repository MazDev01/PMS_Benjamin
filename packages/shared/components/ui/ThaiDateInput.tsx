"use client";

// ── ช่องเลือกวันที่ที่แสดงปี พ.ศ. (บอสสั่ง 26 ต.ค. 69 · หน้าคำขอใบเสนอราคา "ยืนราคาถึง") ─────────────────────────────
//   ปัญหา: <input type="date"> ของเบราว์เซอร์แสดงตามเครื่อง (เช่น 25/11/2026 = ปี ค.ศ.) ขณะที่ทั้งระบบแสดง พ.ศ.
//   ทางแก้: แสดงวันที่ด้วยตัวจัดรูปกลางตัวเดียวกับทั้งระบบ (fmtISOToThai · "25 พ.ย. 2569") แล้ววางช่องเลือกวันที่จริง
//   ของเบราว์เซอร์ทับไว้แบบโปร่งใส — กดที่ช่องได้ปฏิทินเดิม · ค่าที่เก็บ/ส่ง = YYYY-MM-DD เหมือนเดิม
//   ช่องจริงมีป้าย (ariaLabel) ให้โปรแกรมอ่านหน้าจอและข้อทดสอบ · กรอบโฟกัสอยู่ที่ .thai-date:focus-within
import type React from "react";
import { CalendarDays } from "lucide-react";
import { fmtISOToThai } from "@pms/shared/lib/mock";

export function ThaiDateInput({ value, onChange, ariaLabel, min, disabled, width = 180, style }: {
  value: string;
  onChange: (iso: string) => void;
  ariaLabel: string;
  min?: string;
  disabled?: boolean;
  width?: number | string;
  /** ทับสไตล์กรอบนอก — เช่นช่องแก้ในที่เดิมแบบไร้กรอบ (แผงลูกค้า "เป็นลูกค้าเมื่อ" · ตรวจเทียบ FLOW รอบ 5) */
  style?: React.CSSProperties;
}) {
  return (
    <span className="thai-date" style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 8, width, height: 36, padding: "0 10px",
      border: "1px solid #e5e7eb", borderRadius: 8, background: disabled ? "#f8fafc" : "#fff", fontSize: "0.84rem", color: "#1f2937", boxSizing: "border-box", ...style }}>
      <span data-thai-date style={{ flex: 1, whiteSpace: "nowrap" }}>{value ? fmtISOToThai(value) : "เลือกวันที่"}</span>
      <CalendarDays size={15} color="#6b7280" aria-hidden />
      <input type="date" aria-label={ariaLabel} value={value} min={min} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        onClick={e => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* เบราว์เซอร์ที่ไม่รองรับ = ปฏิทินเปิดเองตามปกติ */ } }}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: disabled ? "default" : "pointer", border: "none", padding: 0 }} />
    </span>
  );
}
