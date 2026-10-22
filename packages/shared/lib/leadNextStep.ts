// ── กล่อง "ขั้นต่อไป" ของลูกค้าเป้าหมาย — ตัวตัดสินเดียวของปุ่มหลักในแผงลีด (บอสสั่ง 16 ต.ค. 69 · รอบ 4 21 ต.ค. 69) ─────────
//
// กติกา (รอบ 4): กล่องนี้คือทางเดียวที่ดีลเลอร์ขยับลีด — ปุ่มหลักหนึ่งปุ่ม (ทำงานในแผง ไม่พาไปหน้าอื่น) + ปุ่ม "ปิดไม่สำเร็จ"
//   ปุ่มต้องตรงกับสถานะจริง · ห้ามเสนอปุ่มที่ฐานไม่ยอมให้ทำ
//   ปิดไม่สำเร็จ: ได้เฉพาะตอนยังไม่มีใบที่ส่งให้ลูกค้า (ขั้น 1–4) · มีใบส่งอยู่ → "ลูกค้าปฏิเสธ" ที่ใบ (ข้อตัดสินบอส 2 · ใบ 0232)
// แถบ 5 ขั้น (ขั้นที่อยู่ตอนนี้) อยู่ที่ lib/leadStage.ts — ไฟล์นี้ตัดสินแค่ "ทำอะไรต่อ"
// ลำดับตัดสิน (บนลงล่าง):
//   ปิดสำเร็จ → ปิดไม่สำเร็จ → มีคำขอกำลังรอ HQ → ใบลูกค้าร่าง/ส่งแล้ว → HQ ส่งใบแล้ว (หมดอายุ? ขอใหม่ : ทำใบ)
//   → ลีดอยู่ขั้นที่ขอราคาได้ → ไม่มีทางไปต่อจากขั้นนี้ (บอกวิธี ไม่มีปุ่ม)
// ข้อทดสอบ: tests/unit/leadNextStep.test.ts (ครบทุกสถานะ) · tests/scenario/lead-next-step.spec.ts (บนหน้าจอ)
import type { LeadStatus, QuotationStatus } from "./mock";
import { วันไทยสั้น, type QuoteRequestStatus, type HqQuoteStatus } from "./quoteRequests";

export type NextStepInput = {
  leadStatus: LeadStatus;
  /** คำขอราคาล่าสุดของลีดนี้ (ใหม่สุด) — ไม่มี = null */
  request: { status: QuoteRequestStatus; dueAt: string } | null;
  /** ใบ HQ ของคำขอล่าสุด (ดีลเลอร์เห็นเฉพาะใบที่ส่งแล้ว) */
  hqQuote: { status: HqQuoteStatus; validUntil: string | null } | null;
  /** ใบลูกค้าล่าสุดของดีลนี้ */
  quote: { status: QuotationStatus } | null;
  /** มีใบของดีลนี้ที่ส่งให้ลูกค้าอยู่ (รอลูกค้าตอบ) — ไม่ว่าจะเป็นใบล่าสุดหรือไม่ */
  มีใบส่งให้ลูกค้า?: boolean;
  /** วันนี้ (YYYY-MM-DD เวลาไทย) — ราคา HQ หมดอายุเมื่อ validUntil < วันนี้ (เกณฑ์เดียวกับฐาน hq_quote_send) */
  today: string;
};

export type NextStepKey = "request" | "waiting_hq" | "make_quote" | "requote" | "send_quote" | "await_customer" | "won" | "lost" | "stuck";
export type NextStepAction = { kind: "request_quote" | "make_quote" | "reprice" | "send_quote" | "customer_result"; label: string };
export type NextStep = {
  key: NextStepKey;
  title: string;
  detail: string;
  action: NextStepAction | null;
  /** แสดงปุ่ม "ปิดไม่สำเร็จ" ในกล่อง */
  ปิดไม่สำเร็จได้: boolean;
};

const คำขอรอHQ = (s?: QuoteRequestStatus) => s === "new" || s === "pricing";

export function ขั้นต่อไป(x: NextStepInput): NextStep {
  const req = x.request, q = x.quote;
  const ปิดได้ = !x.มีใบส่งให้ลูกค้า && q?.status !== "sent_to_client";
  const ผล = (r: Omit<NextStep, "ปิดไม่สำเร็จได้">): NextStep => ({ ...r, ปิดไม่สำเร็จได้: ปิดได้ });
  if (x.leadStatus === "PAID" || q?.status === "won") {
    return { key: "won", title: "ปิดการขายสำเร็จ", detail: "ลูกค้าตอบรับแล้ว · ใบ HQ เปลี่ยนเป็นสั่งผลิต", action: null, ปิดไม่สำเร็จได้: false };
  }
  if (x.leadStatus === "CANCELLED") {
    return { key: "lost", title: "ปิดการขายไม่สำเร็จ", detail: "ลูกค้าเป้าหมายนี้ปิดแล้ว", action: null, ปิดไม่สำเร็จได้: false };
  }
  if (คำขอรอHQ(req?.status)) {
    return ผล({ key: "waiting_hq", title: "รอราคาจาก HQ", detail: "HQ กำลังตีราคา — ยังไม่ต้องทำอะไร ระบบแจ้งเมื่อได้ราคา · ยกเลิกคำขอได้ที่แท็บใบเสนอราคา", action: null });
  }
  if (q?.status === "draft") {
    return ผล({ key: "send_quote", title: "ใบเสนอราคายังเป็นร่าง — ส่งให้ลูกค้า", detail: "ตรวจรายการและ % ที่บวก แล้วส่งให้ลูกค้า", action: { kind: "send_quote", label: "ส่งให้ลูกค้า" } });
  }
  if (q?.status === "sent_to_client") {
    return ผล({ key: "await_customer", title: "รอลูกค้าตอบ", detail: "ลูกค้าตอบแล้ว บันทึก \"ลูกค้าตอบรับ\" หรือ \"ลูกค้าปฏิเสธ\" ที่ใบ", action: { kind: "customer_result", label: "บันทึกผลจากลูกค้า" } });
  }
  if (req?.status === "quoted") {
    const หมดอายุ = !!x.hqQuote?.validUntil && x.hqQuote.validUntil < x.today;
    if (หมดอายุ) {
      return ผล({ key: "requote", title: "ราคา HQ หมดอายุแล้ว", detail: `ราคาใช้ได้ถึง ${วันไทยสั้น(x.hqQuote!.validUntil!)} — ขอราคาใหม่ก่อนทำใบให้ลูกค้า`, action: { kind: "reprice", label: "ขอราคาใหม่" } });
    }
    return ผล({ key: "make_quote", title: "HQ ส่งราคามาแล้ว — ทำใบเสนอราคาให้ลูกค้า", detail: x.hqQuote?.validUntil ? `ราคา HQ ใช้ได้ถึง ${วันไทยสั้น(x.hqQuote.validUntil)}` : "ใส่ % ที่บวกแล้วส่งให้ลูกค้า", action: { kind: "make_quote", label: "ทำใบให้ลูกค้า" } });
  }
  if (x.leadStatus === "WAITING" || x.leadStatus === "BULLET") {
    return ผล({ key: "request", title: "ขอราคาจาก HQ", detail: "พิมพ์งานที่ขอราคาและสเปก แล้วส่งให้ HQ ตีราคา", action: { kind: "request_quote", label: "ขอราคาจาก HQ" } });
  }
  return ผล({ key: "stuck", title: "ไม่มีคำขอราคาหรือใบที่ใช้ได้", detail: "ไม่มีคำขอที่เปิดอยู่และไม่มีใบที่รอลูกค้าตอบ · ลูกค้าไม่สนใจแล้วกด \"ปิดไม่สำเร็จ\"", action: null });
}
