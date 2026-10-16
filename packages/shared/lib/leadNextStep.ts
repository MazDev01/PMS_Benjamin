// ── "ขั้นต่อไป" ของลูกค้าเป้าหมาย — ตัวตัดสินเดียวของแถบขั้นตอน + ปุ่มหลักในแผงลีด (บอสสั่ง 16 ต.ค. 69) ─────────
//
// UI ตาม flow (หน้า 3): ดีลเลอร์ต้องเห็นทันทีว่าตอนนี้อยู่ขั้นไหน และกดอะไรต่อ — ปุ่มเดียว
// กติกา: ปุ่มต้องตรงกับสถานะจริง · ห้ามเสนอปุ่มที่ฐานไม่ยอมให้ทำ (เช่น ขอราคาเมื่อลีดไม่อยู่ขั้น ติดต่อแล้ว/รวบรวมความต้องการ)
// ลำดับตัดสิน (บนลงล่าง):
//   ปิดสำเร็จ → ปิดไม่สำเร็จ → มีคำขอกำลังรอ HQ → ใบลูกค้าร่าง/ส่งแล้ว → HQ ส่งใบแล้ว (หมดอายุ? ขอใหม่ : ทำใบ)
//   → ลีดอยู่ขั้นที่ขอราคาได้ → ไม่มีทางไปต่อจากขั้นนี้ (บอกวิธี ไม่มีปุ่ม)
// ข้อทดสอบ: tests/unit/leadNextStep.test.ts (ครบทุกสถานะ) · tests/scenario/lead-next-step.spec.ts (บนหน้าจอ)
import type { LeadStatus, QuotationStatus } from "./mock";
import type { QuoteRequestStatus, HqQuoteStatus } from "./quoteRequests";

export type NextStepInput = {
  leadStatus: LeadStatus;
  /** คำขอราคาล่าสุดของลีดนี้ (ใหม่สุด) — ไม่มี = null */
  request: { status: QuoteRequestStatus; dueAt: string } | null;
  /** ใบ HQ ของคำขอล่าสุด (ดีลเลอร์เห็นเฉพาะใบที่ส่งแล้ว) */
  hqQuote: { status: HqQuoteStatus; validUntil: string | null } | null;
  /** ใบลูกค้าล่าสุดของดีลนี้ */
  quote: { status: QuotationStatus } | null;
  /** วันนี้ (YYYY-MM-DD เวลาไทย) — ราคา HQ หมดอายุเมื่อ validUntil < วันนี้ (เกณฑ์เดียวกับฐาน hq_quote_send) */
  today: string;
};

export type NextStepKey = "request" | "waiting_hq" | "make_quote" | "requote" | "send_quote" | "await_customer" | "won" | "lost" | "stuck";
export type NextStepAction = { kind: "request_quote" | "make_quote" | "reprice" | "send_quote" | "customer_result"; label: string };
export type NextStep = {
  /** ขั้นที่กำลังอยู่ 1–5: ข้อมูลลูกค้า · ขอราคา HQ · ได้ใบ HQ · ทำใบให้ลูกค้า · ลูกค้าตอบรับ */
  step: 1 | 2 | 3 | 4 | 5;
  key: NextStepKey;
  title: string;
  detail: string;
  action: NextStepAction | null;
};

export const ขั้นทั้งหมด = ["ข้อมูลลูกค้า", "ขอราคา HQ", "ได้ใบ HQ", "ทำใบให้ลูกค้า", "ลูกค้าตอบรับ"] as const;

const คำขอรอHQ = (s?: QuoteRequestStatus) => s === "new" || s === "pricing";

export function ขั้นต่อไป(x: NextStepInput): NextStep {
  const req = x.request, q = x.quote;
  if (x.leadStatus === "PAID" || q?.status === "won") {
    return { step: 5, key: "won", title: "ปิดการขายสำเร็จ", detail: "ลูกค้าตอบรับแล้ว · ใบ HQ เปลี่ยนเป็นสั่งผลิต", action: null };
  }
  if (x.leadStatus === "CANCELLED") {
    return { step: 5, key: "lost", title: "ปิดการขายไม่สำเร็จ", detail: "ลูกค้าเป้าหมายนี้ปิดแล้ว", action: null };
  }
  if (คำขอรอHQ(req?.status)) {
    return { step: 3, key: "waiting_hq", title: "รอราคาจาก HQ", detail: "HQ กำลังตีราคา — ยังไม่ต้องทำอะไร ระบบแจ้งเมื่อได้ราคา", action: null };
  }
  if (q?.status === "draft") {
    return { step: 4, key: "send_quote", title: "ใบเสนอราคายังเป็นร่าง — ส่งให้ลูกค้า", detail: "ตรวจรายการและ % ที่บวก แล้วส่งให้ลูกค้า", action: { kind: "send_quote", label: "ส่งให้ลูกค้า" } };
  }
  if (q?.status === "sent_to_client") {
    return { step: 5, key: "await_customer", title: "รอลูกค้าตอบ", detail: "ติดตามลูกค้า แล้วบันทึกว่าตอบรับหรือปฏิเสธ", action: { kind: "customer_result", label: "บันทึกผลจากลูกค้า" } };
  }
  if (req?.status === "quoted") {
    const หมดอายุ = !!x.hqQuote?.validUntil && x.hqQuote.validUntil < x.today;
    if (หมดอายุ) {
      return { step: 3, key: "requote", title: "ราคา HQ หมดอายุแล้ว", detail: `ราคาใช้ได้ถึง ${x.hqQuote!.validUntil} — ขอราคาใหม่ก่อนทำใบให้ลูกค้า`, action: { kind: "reprice", label: "ขอราคาใหม่" } };
    }
    return { step: 4, key: "make_quote", title: "HQ ส่งราคามาแล้ว — ทำใบเสนอราคาให้ลูกค้า", detail: x.hqQuote?.validUntil ? `ราคา HQ ใช้ได้ถึง ${x.hqQuote.validUntil}` : "ใส่ % ที่บวกแล้วส่งให้ลูกค้า", action: { kind: "make_quote", label: "ทำใบให้ลูกค้า" } };
  }
  if (x.leadStatus === "WAITING" || x.leadStatus === "BULLET") {
    return { step: 2, key: "request", title: "ขอราคาจาก HQ", detail: "พิมพ์งานที่ขอราคาและสเปก แล้วส่งให้ HQ ตีราคา", action: { kind: "request_quote", label: "ขอราคาจาก HQ" } };
  }
  return { step: 2, key: "stuck", title: "ไม่มีคำขอราคาที่เปิดอยู่", detail: "เปลี่ยนขั้นเป็น \"รวบรวมความต้องการ\" ก่อน แล้วขอราคาจาก HQ ใหม่", action: null };
}
