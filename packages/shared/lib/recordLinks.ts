// ── ที่อยู่ของข้อมูลแต่ละชนิด (ลิงก์กลาง · บอสสั่ง 11 พ.ย. 69) — ไม่มีส่วนหน้าจอ ทดสอบหน่วยได้ (tests/unit/recordLinks.test.ts)
//   ตัวลิงก์บนจอ: components/ui/RecordLink.tsx · แผงอยู่ในที่อยู่หน้าเว็บ: lib/panelUrl.ts

export type ชนิดข้อมูล = "dealer" | "customer" | "lead" | "prospect" | "quotation" | "request" | "hqQuote" | "proposal";

export type เป้าลิงก์ = {
  ชนิด: ชนิดข้อมูล;
  /** รหัสของเรื่อง: ดีลเลอร์ = รหัสสาขา · ลูกค้า = id · ลูกค้าเป้าหมาย = id (#L-…) หรือ numId · ผู้สนใจ/ใบค่าแฟรนไชส์ = id
   *  ใบเสนอราคา = เลขที่ใบ · คำขอ (HQ) = เลขคำขอ · ใบ HQ (HQ) = เลขที่ใบ HQ · คำขอ/ใบ HQ (ดีลเลอร์) = ลูกค้าเป้าหมายของคำขอ (numId หรือ id) */
  รหัส: string | number | null | undefined;
  /** สาขาเจ้าของเรื่อง — HQ ใช้หาเรื่องในสาขานั้น · ดีลเลอร์ใช้กันลิงก์ข้ามสาขา (ไม่ใช่สาขาตัวเอง = ข้อความธรรมดา) */
  สาขา?: string | null;
};

/** ที่อยู่ของเรื่อง — null = ไม่มีที่ให้ไป/ไม่มีสิทธิ์ (แสดงเป็นข้อความธรรมดา) */
export function ที่อยู่เรื่อง(เป้า: เป้าลิงก์, ฝั่ง: "hq" | "dealer", สาขาฉัน?: string | null): string | null {
  const { ชนิด, รหัส, สาขา } = เป้า;
  if (รหัส == null || รหัส === "") return null;
  const r = encodeURIComponent(String(รหัส));
  if (ฝั่ง === "hq") {
    switch (ชนิด) {
      case "dealer": return `/hq/dealers?open=${r}`;
      case "customer": return สาขา ? `/hq/customers?open=${encodeURIComponent(สาขา)}:${r}` : null;
      case "lead": return สาขา ? `/hq/leads?open=${encodeURIComponent(สาขา)}:${r}` : null;
      case "prospect": return `/hq/prospects?open=${r}`;
      case "quotation": return `/hq/quotations?open=${r}`;
      case "request": case "hqQuote": return `/hq/quote-requests?open=${r}`;
      case "proposal": return `/hq/proposals?open=${r}`;
    }
  }
  // ดีลเลอร์: ข้อมูลของสาขาอื่น/ของ HQ = ไม่มีลิงก์
  if (สาขา && สาขาฉัน && สาขา !== สาขาฉัน) return null;
  switch (ชนิด) {
    case "customer": return `/customers?open=${r}`;
    case "lead": return `/leads?open=${r}`;
    case "quotation": return `/quotations?open=${r}`;
    case "request": case "hqQuote": return `/leads?open=${r}&tab=quotes`;
    default: return null;
  }
}

/** ลูกค้าของใบเสนอราคา: ผูกลูกค้าแล้ว (customerId > 0) = แผงลูกค้า · ยังเป็นลูกค้าเป้าหมาย (dealId) = แผงลูกค้าเป้าหมาย · ไม่ผูก = ไม่มีลิงก์ */
export function เป้าลูกค้าของใบ(q: { customerId?: number | null; dealId?: number | null; dealerCode?: string | null }): เป้าลิงก์ | null {
  if ((q.customerId ?? 0) > 0) return { ชนิด: "customer", รหัส: q.customerId, สาขา: q.dealerCode };
  if (q.dealId != null) return { ชนิด: "lead", รหัส: q.dealId, สาขา: q.dealerCode };
  return null;
}
