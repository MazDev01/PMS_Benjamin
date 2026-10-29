// ── วันที่ของใบในรายงานยอดขาย (บอสตัดสิน 29 ต.ค. 69 · ใบ 0260) ───────────────────────────────────────────────
//   ยอดขายทุกหน้านับตาม "วันที่ลูกค้าตอบรับ" ไม่ใช่วันออกใบ — ทั้งการกรองช่วงเวลาและการแยกปี/เดือน
//   กติกาเดียวกับฟังก์ชันกลางที่ฐาน _q_report_date (ใบ 0260) ทุกตัวอักษร:
//     ใบตอบรับที่มีเวลาตอบรับ = วันตอบรับตามเวลาไทย · ไม่มีบันทึก / ใบสถานะอื่น = วันออกใบ (date รูปแบบ YYYY-MM-DD · อื่น = null)
//   ตัวอย่างของบอส: ใบออก ก.ย. ตอบรับ ต.ค. = ยอด ต.ค. · ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. = ยอดปีนี้
import type { QuotationMock } from "./mock";

type ใบที่ใช้ = Pick<QuotationMock, "status" | "date" | "wonAt">;

/** วันที่ของใบ (YYYY-MM-DD) สำหรับรายงาน: ใบตอบรับ = วันตอบรับ · ใบอื่น = วันออกใบ · ไม่มี = null */
export function วันที่ขายของใบ(q: ใบที่ใช้): string | null {
  if (q.status === "won" && q.wonAt) {
    const t = new Date(q.wonAt);
    if (!Number.isNaN(t.getTime())) return new Date(t.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);   // เวลาไทย (UTC+7 ไม่มีเวลาออมแสง)
  }
  return /^\d{4}-\d{2}-\d{2}/.test(q.date ?? "") ? q.date.slice(0, 10) : null;
}

/** เวลาของใบสำหรับกราฟรายชั่วโมง: ใบตอบรับ = เวลาตอบรับ · ใบอื่น = เวลาที่ระบบบันทึกใบ (savedAt) */
export function เวลาขายของใบ(q: ใบที่ใช้ & Pick<QuotationMock, "savedAt">): string | undefined {
  return q.status === "won" && q.wonAt ? q.wonAt : q.savedAt;
}
