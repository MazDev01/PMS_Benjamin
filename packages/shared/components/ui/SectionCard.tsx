"use client";

// ── กรอบหัวข้อของหน้าตั้งค่า (การ์ด + ส่วนหัว + เนื้อหา) — ตัวกลางตัวเดียวทุกแท็บ (ย้ายจาก hq/settings/page.tsx · 27 ต.ค. 69) ─────
//   บอสสั่ง: แท็บแม่แบบวัสดุต้องใช้กรอบ/ส่วนหัว/ตารางกลางตัวเดียวกับแท็บอื่น ห้ามเขียนระยะห่างเองเฉพาะหน้า
//   ระยะห่างทั้งหมดมาจาก .card / .card-header / .card-body (globals.css) · ไม่มีคำบรรยายใต้หัวข้อ (บอสสั่ง 27 ส.ค. 69 ทั้งระบบ)
import type { ReactNode } from "react";

export function SectionCard({ icon, title, children, action, fill }: {
  icon?: ReactNode; title: string; children: ReactNode; action?: ReactNode;
  /** รับไว้เพื่อให้ผู้เรียกเดิมใช้ได้ แต่ไม่แสดง (คำอธิบายใต้หัวข้อเอาออกทั้งระบบ · บอสสั่ง 27 ส.ค. 69) */
  desc?: string;
  /** การ์ดที่วางคู่กันในแถวเดียว — ยืดสูงเท่ากัน และให้เนื้อหาข้างในดันส่วนท้ายลงล่างได้ (แถวตรงกัน) */
  fill?: boolean;
}) {
  return (
    <div className="card" data-section-card style={fill ? { display: "flex", flexDirection: "column" } : undefined}>
      <div className="card-header">
        <div>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {icon && <span style={{ color: "var(--primary)", display: "flex" }}>{icon}</span>}{title}
          </div>
        </div>
        {action}
      </div>
      <div className="card-body" style={fill ? { flex: 1, display: "flex", flexDirection: "column" } : undefined}>{children}</div>
    </div>
  );
}
