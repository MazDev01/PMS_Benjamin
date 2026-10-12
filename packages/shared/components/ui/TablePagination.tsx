"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

// ── ตัวแบ่งหน้าของตาราง — ใช้ร่วมกันทุกตารางในระบบ ────────────────────────────────
//
// ทำไมต้องมี (สั่งโดยผู้บริหาร 7 ส.ค. 69: "ตารางทุกอัน ถ้าเกิน 10 ให้ไปหน้าถัดไป"):
//   เดิมแต่ละหน้าเขียนตัวแบ่งหน้าของตัวเอง และตั้งจำนวนแถวต่อหน้าไม่ตรงกันเลย
//   (8 · 10 · 12 · 20 · 50) ผู้ใช้จึงเจอพฤติกรรมต่างกันในแต่ละหน้าโดยไม่มีเหตุผล
//   และตารางสำคัญบางอัน (ทะเบียนดีลเลอร์ · บันทึกการใช้งานที่มีเกือบหมื่นแถว) ไม่มีเลย
//   → บันทึกการใช้งานเรนเดอร์ทีเดียวเป็นพัน ๆ แถว เบราว์เซอร์หน่วงเห็นได้ชัด
//
// ใช้ที่เดียวกันหมด = แก้ครั้งเดียวมีผลทุกตาราง และผู้ใช้เจอของเหมือนกันทุกหน้า
//
// แสดงตลอดแม้มีหน้าเดียว (สั่งโดยผู้บริหาร 13 ส.ค. 69):
//   เดิมซ่อนเมื่อ pageCount<=1 → ท้ายตารางบางอันมีแถบ บางอันไม่มี ผู้ใช้อ่านไม่ออกว่า
//   "ไม่มีแถบ = ข้อมูลหมดแค่นี้" หรือ "ตารางนี้ไม่แบ่งหน้า" · ตอนนี้เห็น "หน้า 1 / 1" = จบแล้วชัดเจน

/** จำนวนแถวต่อหน้ามาตรฐานของทั้งระบบ — เกินจากนี้ให้ไปหน้าถัดไป */
export const ROWS_PER_PAGE = 10;

/** ตัดข้อมูลเฉพาะหน้าที่กำลังดู · page เริ่มที่ 0 */
export function pageSlice<T>(rows: T[], page: number, size = ROWS_PER_PAGE): T[] {
  return rows.slice(page * size, page * size + size);
}

/** จำนวนหน้าทั้งหมด (อย่างน้อย 1 เสมอ แม้ไม่มีข้อมูล) */
export function pageCountOf(total: number, size = ROWS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / size));
}

export function TablePagination({
  page, total, onPage, size = ROWS_PER_PAGE, unit = "รายการ",
}: {
  /** หน้าปัจจุบัน เริ่มที่ 0 */
  page: number;
  /** จำนวนข้อมูลทั้งหมด (ไม่ใช่เฉพาะหน้านี้) */
  total: number;
  onPage: (next: number) => void;
  size?: number;
  /** หน่วยนับที่แสดงให้ผู้ใช้อ่าน เช่น "ราย" "ใบ" "สาขา" */
  unit?: string;
}) {
  const pageCount = pageCountOf(total, size);
  const cur = Math.min(Math.max(page, 0), pageCount - 1);
  const from = total === 0 ? 0 : cur * size + 1;
  const to = Math.min(total, (cur + 1) * size);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "10px 14px", borderTop: "1px solid #f2f4f7", fontSize: "0.72rem", color: "#6b7280",
        flexWrap: "wrap",
      }}
    >
      {/* บอก "กำลังดูช่วงไหนจากทั้งหมดเท่าไหร่" ไม่ใช่แค่เลขหน้า — ผู้ใช้จะรู้ว่าเหลืออีกเยอะไหม */}
      <span style={{ fontVariantNumeric: "tabular-nums" }}>
        แสดง {from.toLocaleString()}–{to.toLocaleString()} จาก {total.toLocaleString()} {unit}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button" className="btn btn-secondary btn-sm"
          disabled={cur <= 0} onClick={() => onPage(cur - 1)}
          aria-label="หน้าก่อนหน้า"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <ChevronLeft size={13} /> ก่อนหน้า
        </button>
        {/* เลขหน้าอยู่ระหว่างปุ่มทั้งสอง — ตำแหน่งเดียวกับฝั่งดีลเลอร์ */}
        <span style={{ fontWeight: 700, color: "#334155", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          หน้า {cur + 1} / {pageCount}
        </span>
        <button
          type="button" className="btn btn-secondary btn-sm"
          disabled={cur >= pageCount - 1} onClick={() => onPage(cur + 1)}
          aria-label="หน้าถัดไป"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          ถัดไป <ChevronRight size={13} />
        </button>
      </span>
    </div>
  );
}
