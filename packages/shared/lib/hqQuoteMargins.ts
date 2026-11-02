// ── ส่วนต่างรายใบของหน้าใบเสนอราคาทั้งเครือ (บอสสั่ง 2 พ.ย. 69 · ใบ 0272 hq_quote_margins) ─────
//   ราคาส่ง HQ · ราคาขายลูกค้า · ส่วนต่าง ฿ · ส่วนต่าง % — สูตรเดียวกับการ์ด "ส่วนต่างกำไรเฉลี่ย" ของภาพรวมยอดขาย
//   ตัวเลขคิดที่ฐาน · จัดรูปที่นี่ที่เดียว (ทางต่อฐานตรง + ทาง API ใช้ตัวเดียวกัน) · ใบที่ไม่ได้ทำจากใบ HQ = ไม่มีแถว (หน้าจอ "—")
export type ส่วนต่างใบ = { dealer: string; id: string; hqQuoteNo: string; hqCost: number; sale: number; baht: number; pct: number | null };

const N = (v: unknown) => Number(v ?? 0) || 0;
export function จัดรูปส่วนต่างใบ(d: unknown): ส่วนต่างใบ[] {
  return ((d ?? []) as Record<string, unknown>[]).map(r => ({
    dealer: String(r.dealer ?? ""), id: String(r.id ?? ""), hqQuoteNo: String(r.hqQuoteNo ?? ""),
    hqCost: N(r.hqCost), sale: N(r.sale), baht: N(r.baht), pct: r.pct == null ? null : N(r.pct),
  }));
}
/** คีย์ของใบ (เลขที่ใบซ้ำข้ามสาขาได้ — คีย์จริง = สาขา + เลขที่) */
export const คีย์ใบ = (dealer: string | undefined | null, id: string) => `${dealer ?? ""}|${id}`;
/** ส่วนต่าง % เฉลี่ยถ่วง (Σ ส่วนต่าง ÷ Σ ขาย · ปัด 1 ตำแหน่ง) = สูตรการ์ด · ขายรวม 0 = null */
export function เฉลี่ยถ่วง(rows: Pick<ส่วนต่างใบ, "sale" | "baht">[]): number | null {
  const ขาย = rows.reduce((a, r) => a + r.sale, 0), ต่าง = rows.reduce((a, r) => a + r.baht, 0);
  return ขาย === 0 ? null : Math.round(1000 * ต่าง / ขาย) / 10;
}
