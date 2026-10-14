// ── คำขอใบเสนอราคา (Flow ใหม่ · ใบ 0183) — ชนิดข้อมูล ป้ายสถานะ และตัวช่วยที่ใช้ทั้งฝั่งดีลเลอร์และ HQ ─────────────
//
// FLOW.html: ดีลเลอร์ส่งคำขอ (แม่แบบ + สเปก) → ลูกค้าเป้าหมายเป็น "รอราคา HQ" → คำขอเข้าคิว HQ เริ่มนับ 14 วัน
//   → HQ กดรับเรื่อง (กำลังทำราคา) → ส่งใบ HQ (ด่าน 2) · ยกเลิกได้จนกว่า HQ ส่งใบ (ต้องมีเหตุผล)
// ฐานข้อมูลเป็นคนขยับสถานะทั้งสองฝั่ง — หน้าจอเรียกคำสั่งของฐานเท่านั้น ไม่เขียนสถานะเอง

export type QuoteRequestStatus = "new" | "pricing" | "quoted" | "won" | "lost" | "cancelled" | "superseded";

export type QuoteRequest = {
  id: number;
  requestNo: string;
  dealerCode: string;
  leadNumId: number;
  rootId: number | null;
  supersedesId: number | null;
  product: string;
  subtype: string;
  area: number | null;
  province: string;
  spec: string;
  status: QuoteRequestStatus;
  assignee: string | null;
  assigneeName: string;
  submittedAt: string;
  dueAt: string;
  acceptedAt: string | null;
  quotedAt: string | null;
  closedAt: string | null;
  cancelReason: string;
  /** สำหรับคิวของ HQ — ชื่อบริษัทของลูกค้าเป้าหมาย (ไม่มีในตารางคำขอ เติมตอนอ่าน) */
  leadCompany?: string;
};

export const quoteRequestStatusLabel: Record<QuoteRequestStatus, string> = {
  new: "ใหม่",
  pricing: "กำลังทำราคา",
  quoted: "ส่งใบแล้ว",
  won: "ปิด (ได้งาน)",
  lost: "ปิด (ไม่ได้งาน)",
  cancelled: "ยกเลิก",
  superseded: "ขอแก้ราคาแล้ว",
};
export const quoteRequestStatusColor: Record<QuoteRequestStatus, { bg: string; text: string }> = {
  new:        { bg: "#e0e7ff", text: "#4338ca" },
  pricing:    { bg: "#f3e8ff", text: "#6b21a8" },
  quoted:     { bg: "#dcfce7", text: "#166534" },
  won:        { bg: "#e5faf0", text: "#059669" },
  lost:       { bg: "#fee2e2", text: "#dc2626" },
  cancelled:  { bg: "#f1f5f9", text: "#475569" },
  superseded: { bg: "#f1f5f9", text: "#475569" },
};

/** คำขอที่ยังอยู่กับ HQ (ช่วงที่นับ 14 วัน) */
export const อยู่กับHQ = (s: QuoteRequestStatus) => s === "new" || s === "pricing";
/** คำขอที่ยังเปิดอยู่ (ลูกค้าเป้าหมายหนึ่งรายมีได้ทีละคำขอ) */
export const คำขอเปิดอยู่ = (s: QuoteRequestStatus) => s === "new" || s === "pricing" || s === "quoted";
/** เกินกำหนดส่งใบ HQ — ป้ายแดงในคิว (ตารางสถานะแถว "ครบ 14 วันยังไม่ส่งใบ") */
export const เกินกำหนด = (r: Pick<QuoteRequest, "status" | "dueAt">, now = Date.now()) =>
  อยู่กับHQ(r.status) && new Date(r.dueAt).getTime() < now;

/** วันที่แบบไทยสั้นสำหรับแสดงกำหนดส่ง เช่น "28 ต.ค. 2569" */
export function วันไทยสั้น(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const เดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const t = new Date(d.getTime() + 7 * 3_600_000);   // เวลาไทย
  return `${t.getUTCDate()} ${เดือน[t.getUTCMonth()]} ${t.getUTCFullYear() + 543}`;
}
