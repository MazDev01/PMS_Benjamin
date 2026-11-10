import type { LeadRow, QuotationMock, LeadStatus } from "./mock";

// ── ลบลูกค้าได้เมื่อไหร่ และจะพาอะไรไปด้วย ────────────────────────────────────────
//
// บั๊กจริง (ผู้ใช้แจ้ง 14 ส.ค. 69 · ทางตันที่ออกไม่ได้เลย):
//   ลบลูกค้าไม่ได้ ระบบบอกว่า "ยังมีลูกค้าเป้าหมาย 2 รายการผูกอยู่ · กรุณาย้าย/ลบรายการเหล่านั้นก่อน"
//   แต่หน้าลูกค้าเป้าหมายขึ้น "ไม่พบลูกค้าเป้าหมาย · 0 รายการ"
//
//   เพราะดีลทั้ง 2 อันปิดการขายสำเร็จไปแล้ว และหน้าลูกค้าเป้าหมาย "ตั้งใจซ่อนดีลที่ปิดแล้ว"
//   (มันกลายเป็นลูกค้ารายนี้ไปแล้ว โชว์ซ้ำจะวนกลับที่เดิม) — ด่านจึงสั่งให้ไปลบของที่
//   ระบบไม่ยอมให้เห็น = ลูกค้าที่ปิดการขายแล้วทุกรายลบไม่ได้ตลอดกาล
//
// กติกาที่ถูก — แยกตามว่าดีลนั้น "จบแล้ว" หรือ "ยังเดินอยู่":
//   • จบแล้ว (ปิดการขายสำเร็จ/ไม่สำเร็จ) = ประวัติของลูกค้ารายนี้เอง → ลบไปพร้อมกัน
//     เก็บไว้ก็ไม่มีเจ้าของ กลายเป็นข้อมูลกำพร้าที่ชี้ไปหาลูกค้าที่ไม่มีอยู่แล้ว
//   • ยังเดินอยู่ = งานขายที่ยังทำอยู่ → กันไว้เหมือนเดิม และอันนี้ผู้ใช้เห็นในหน้าลูกค้าเป้าหมายจริง
//     จึงไปจัดการเองได้ ไม่ใช่ทางตัน
//
// แยกออกมาเป็นฟังก์ชันล้วนเพื่อให้ทดสอบได้ และให้หน้าจอกับตัวลบใช้คำตอบชุดเดียวกัน
// (กล่องยืนยันต้องบอกจำนวนตรงกับที่จะถูกลบจริงเป๊ะ ๆ ไม่ใช่ต่างคนต่างนับ)

/** ดีลที่ถือว่า "จบแล้ว" — ไม่มีงานขายเดินต่อ */
const CLOSED: LeadStatus[] = ["PAID", "CANCELLED"];
export const isClosedDeal = (s: LeadStatus): boolean => CLOSED.includes(s);

export type CustomerDeletionImpact = {
  /** ดีลที่ยังขายอยู่ — มีแม้แต่อันเดียวก็ลบลูกค้าไม่ได้ */
  activeLeads: LeadRow[];
  /** ดีลที่จบแล้ว — จะถูกลบไปพร้อมลูกค้า */
  closedLeads: LeadRow[];
  /** ใบเสนอราคาที่จะถูกลบไปพร้อมกัน (ของลูกค้ารายนี้ หรือของดีลที่จบแล้วข้างต้น) */
  quotations: QuotationMock[];
  /** ลบได้ไหม */
  canDelete: boolean;
};

export function customerDeletionImpact(
  customerId: number, leads: LeadRow[], quotations: QuotationMock[],
): CustomerDeletionImpact {
  const linked = leads.filter(l => l.customerId === customerId);
  const activeLeads = linked.filter(l => !isClosedDeal(l.status));
  const closedLeads = linked.filter(l => isClosedDeal(l.status));
  // ใบที่ผูกกับลูกค้าโดยตรง + ใบที่ผูกกับดีลที่จบแล้ว (dealId = numId ของลูกค้าเป้าหมาย)
  const closedDealIds = new Set(closedLeads.map(l => l.numId).filter((n): n is number => n != null));
  const quotes = quotations.filter(q =>
    (q.customerId != null && q.customerId !== 0 && q.customerId === customerId)
    || (q.dealId != null && closedDealIds.has(q.dealId)));
  return { activeLeads, closedLeads, quotations: quotes, canDelete: activeLeads.length === 0 };
}

/** ข้อความบอกว่า "ลบไม่ได้เพราะอะไร" — คืน "" ถ้าลบได้ */
export function blockReason(impact: CustomerDeletionImpact): string {
  if (impact.canDelete) return "";
  return `ลบลูกค้าไม่ได้ — ยังมีงานขายที่เปิดอยู่ ${impact.activeLeads.length} รายการ · ` +
    `ปิดการขาย (สำเร็จ/ไม่สำเร็จ) หรือลบงานขายเหล่านั้นก่อน แล้วค่อยลบลูกค้า`;
}

/** ข้อความยืนยันก่อนลบ — ต้องบอกให้ครบว่าอะไรจะหายไปบ้าง */
export function confirmMessage(company: string, impact: CustomerDeletionImpact): string {
  const extra = [
    impact.closedLeads.length ? `ประวัติการขาย ${impact.closedLeads.length} งานขาย` : "",
    impact.quotations.length ? `ใบเสนอราคา ${impact.quotations.length} ใบ` : "",
  ].filter(Boolean);
  return `ลบลูกค้า "${company}"?` +
    (extra.length ? `\nจะลบ${extra.join(" และ ")} ไปพร้อมกันด้วย` : "") +
    `\nการกระทำนี้ย้อนกลับไม่ได้`;
}
