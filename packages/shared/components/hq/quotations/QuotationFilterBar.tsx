"use client";

// ─── ตัวกรองใบเสนอราคาทั้งเครือ (Sticky) ──────────────────────────────────────
// ค้นหา: เลขที่ / ดีลเลอร์ / รหัสดีลเลอร์ / ลูกค้า
// ตัวเลือก: สถานะ — ดีลเลอร์/ภูมิภาค/จังหวัด ย้ายไปเป็น "ระดับ" ของตัวเจาะลึกด้านบน (บอสสั่ง 2 พ.ย. 69 · ไม่มีช่องเลือกซ้ำสองที่)
// (ตัวกรอง "ประเภทอาคาร"/แม่แบบ ถอดออกแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
// (ตัวกรอง "ช่วงมูลค่า" ถูกลบทั้งฟีเจอร์ตามที่บอสสั่ง — อย่าใส่กลับ)
// หมายเหตุ: "จังหวัด" = จังหวัดของดีลเลอร์ที่ออกใบ ไม่ใช่จังหวัดลูกค้า/หน้างาน
// (ใบเสนอราคาไม่เก็บจังหวัดของตัวเอง — ป้ายบนตัวเลือกจึงต้องเขียนว่า "จังหวัดดีลเลอร์" ให้ชัด)
import { Search, X } from "lucide-react";
import type { QuotationStatus } from "@pms/shared/lib/mock";

const MUTED = "#6b7280";

export type QuotationFilters = {
  search: string;
  /** "sent" = ส่งลูกค้าแล้ว ไม่นับร่าง/ถูกแทนที่ (ค่าเริ่มต้น = ชุดเดียวกับการ์ด · บอสสั่ง 30 ต.ค. 69) · "all" = ทุกสถานะ */
  status: QuotationStatus | "all" | "sent";
};

/** ชื่อสถานะบนหน้า HQ ใบเสนอราคาทั้งเครือ — คำเดียวกับ FLOW (ส่งให้ลูกค้าแล้ว · ตอบรับ · ลูกค้าปฏิเสธ · ถูกแทนที่ · ร่าง) */
export const ชื่อสถานะใบHQ: Record<QuotationStatus, string> = {
  sent_to_client: "ส่งให้ลูกค้าแล้ว", won: "ตอบรับ", lost: "ลูกค้าปฏิเสธ", expired: "หมดอายุ", superseded: "ถูกแทนที่", draft: "ร่าง",
};

export const EMPTY_FILTERS: QuotationFilters = {
  search: "", status: "sent",
};

export function QuotationFilterBar({ filters, onChange }: {
  filters: QuotationFilters;
  onChange: (f: QuotationFilters) => void;
}) {
  const set = <K extends keyof QuotationFilters>(k: K, v: QuotationFilters[K]) => onChange({ ...filters, [k]: v });
  const dirty = filters.search !== "" || filters.status !== "sent";

  // ขนาดเดียวกับแถบกรองหน้าลูกค้าทั้งเครือ — ย่อตัวได้เมื่อจอแคบ ไม่ตกบรรทัด
  const ช่องเลือก = { width: "auto", flex: "0 1 auto", minWidth: 0, maxWidth: 168, padding: "7px 10px", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer" } as const;

  return (
    // ตัวกรองทั้งแถบต้องอยู่บรรทัดเดียว (บอสสั่ง 25 ส.ค. 69) — เดิม flexWrap:"wrap" ทำให้ "ทุกสถานะ" ตกไปบรรทัดสอง
    // nowrap + minWidth:0 + maxWidth ที่ช่องเลือก = พอจอแคบลงช่องจะย่อตัวเอง แทนที่จะตกบรรทัด
    // (กติกาเดียวกับแถบกรองหน้าลูกค้าทั้งเครือ ซึ่งอยู่แถวเดียวอยู่แล้ว)
    <div className="card hq-sticky-filter" style={{ display: "flex", gap: 10, flexWrap: "nowrap", alignItems: "center", margin: "16px 0", padding: "10px 14px" }}>
      <div className="card-title" style={{ flex: "0 0 auto" }}>รายการใบเสนอราคา</div>
      {/* ใช้ .search-bar ตัวมาตรฐาน (280px) ให้เท่ากับทุกหน้า — เดิมหน้านี้ประกอบเองกว้าง 300 */}
      <div className="search-bar">
        <Search size={14} color={MUTED} strokeWidth={2} />
        <input
          type="text"
          placeholder="ค้นหาเลขที่ / ลูกค้า / ดีลเลอร์ / รหัสดีลเลอร์..."
          value={filters.search}
          onChange={e => set("search", e.target.value)}
        />
      </div>

      <div style={{ flex: 1 }} />


      {/* ต้องมีค่าเสมอ — ค่าเริ่มต้น "ส่งลูกค้าแล้ว" = ชุดเดียวกับการ์ด (บอสสั่ง 30 ต.ค. 69) · "ทุกสถานะ" เป็นตัวเลือกท้ายสุด */}
      <select aria-label="กรองตามสถานะใบเสนอราคา" value={filters.status} onChange={e => set("status", e.target.value as QuotationFilters["status"])} className="form-select" style={{ ...ช่องเลือก, maxWidth: 260 }}>
        <option value="sent">ส่งลูกค้าแล้ว (ไม่นับร่าง/ถูกแทนที่)</option>
        {(Object.keys(ชื่อสถานะใบHQ) as QuotationStatus[]).map(s => (
          <option key={s} value={s}>{ชื่อสถานะใบHQ[s]}</option>
        ))}
        <option value="all">ทุกสถานะ</option>
      </select>


      {dirty && (
        <button onClick={() => onChange(EMPTY_FILTERS)} className="btn btn-secondary btn-sm" style={{ gap: 5 }}>
          <X size={13} /> ล้างตัวกรอง
        </button>
      )}
    </div>
  );
}
