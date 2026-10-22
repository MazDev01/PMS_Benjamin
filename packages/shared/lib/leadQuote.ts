// ใบเสนอราคาใบนี้เป็นของลูกค้าเป้าหมายนี้ไหม — กติกาเดียวกับแท็บใบเสนอราคาในแผงลีด (ย้ายจาก leads/page.tsx · รอบ 4)
//   ใบใหม่ผูกด้วย dealId · ใบเก่าก่อนมี dealId ผูกด้วยรหัสลูกค้า/ชื่อบริษัท
import type { LeadRow, QuotationMock } from "./mock";

export function quoteBelongsToLead(q: QuotationMock, l: LeadRow): boolean {
  if (q.dealId != null) return q.dealId === l.numId;
  if (l.customerId && q.customerId === l.customerId) return true;
  return q.customer === l.company;
}
