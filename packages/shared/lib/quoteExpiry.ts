// ── วันหมดอายุของใบเสนอราคา (ISO) — ที่เดียวทั้งแอป ──
// ใบที่กรอกวันเองใช้ค่านั้น · ไม่ได้กรอก = วันที่ใบ + อายุใบเสนอราคา (ของสาขา ถ้าไม่ได้ตั้งค่อยใช้ของ HQ — ดู useQuoteValidity)
// validityDays ส่งเข้ามาจากหน้าจอ — ห้ามอ่าน localStorage ตรงนี้ (โหมดจริงค่าอยู่ใน DB)
export function quoteExpiryISO(q: { date: string; expiry?: string }, validityDays: number): string {
  if (q.expiry) return q.expiry;
  if (!q.date) return "";
  const d = new Date(q.date); if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + validityDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** จำนวนวันจาก todayISO ถึงวันหมดอายุ (ติดลบ = เลยมาแล้ว) · อ่านวันไม่ได้ = null */
export function daysUntilISO(iso: string, todayISO: string): number | null {
  const a = Date.parse(iso), b = Date.parse(todayISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

/** ป้ายนับวันใต้วันหมดอายุ (แถบสรุปของหน้าต่างใบเสนอราคา/ใบค่าแฟรนไชส์ · บอสสั่ง 9 พ.ย. 69)
 *  เหลือ x วัน · หมดอายุวันนี้ · เลยมา x วัน (เลย = แดง) · ไม่มีวัน/อ่านวันไม่ได้ = null (ไม่แสดงบรรทัดนี้ ไม่เดา) */
export function ป้ายนับวันหมดอายุ(iso: string | null | undefined, todayISO: string): { ข้อความ: string; เลย: boolean } | null {
  if (!iso) return null;
  const วัน = daysUntilISO(iso, todayISO);
  if (วัน == null) return null;
  if (วัน > 0) return { ข้อความ: `เหลือ ${วัน} วัน`, เลย: false };
  if (วัน === 0) return { ข้อความ: "หมดอายุวันนี้", เลย: false };
  return { ข้อความ: `เลยมา ${-วัน} วัน`, เลย: true };
}
