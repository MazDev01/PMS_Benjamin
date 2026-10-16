// BOQ — รายการสินค้าของใบเสนอราคา (แหล่งเดียว)
// ใบที่สร้างจากฟอร์มใหม่มี lineItems ครบ · ใบเก่า/ใบที่ย้ายข้อมูลมามีแต่ยอดรวม
// จึง "สังเคราะห์" เป็นรายการเดียวจากข้อมูลจริงที่มีอยู่ (แม่แบบ + พื้นที่ + ราคารวม) ไม่ได้กุตัวเลขใหม่
// เดิมตรรกะนี้ก๊อปกันอยู่ 5 ที่ (หน้าใบเสนอราคา 2 · หน้าลูกค้า 1 · แผงใบเสนอราคาของลูกค้าเป้าหมาย 2) แก้ที่เดียวไม่ครบ
import type { QuoteLineItem } from "./mock";

/** ข้อมูลขั้นต่ำที่ใช้ปั้น BOQ — รับได้ทั้ง QuotationMock และฟอร์มระหว่างแก้ */
export type BoqSource = {
  lineItems?: QuoteLineItem[];
  materialCost: number;
  buildingType: string;
  area: number;
};

/** รายการ BOQ ที่ใช้แสดง/แก้ — ไม่มีข้อมูลให้ปั้นเลยคืนว่าง (หน้าจอขึ้นสถานะว่าง ไม่ใช่เลข 0 หลอก ๆ) */
export function boqLineItems(q: BoqSource): QuoteLineItem[] {
  if (q.lineItems) return q.lineItems;
  if (q.materialCost <= 0) return [];
  return [{
    name: q.buildingType || "รายการ",
    qty: q.area || 1,
    unit: q.area ? "ตร.ม." : "รายการ",
    unitPrice: q.area ? Math.round(q.materialCost / q.area) : q.materialCost,
  }];
}

/** ยอดรวมก่อน VAT = Σ(จำนวน × ราคา/หน่วย) */
export function boqSubtotal(items: QuoteLineItem[]): number {
  return items.reduce((s, li) => s + li.qty * li.unitPrice, 0);
}


// ── % บวกตั้งต้นของสาขา — ตั้งที่ ตั้งค่า › ตั้งค่าใบเสนอราคา (ย้ายจากหน้าแม่แบบ 16 ต.ค. 69) ──
//
// ใช้ตั้งต้น % ของทุกบรรทัดตอนทำใบให้ลูกค้าจากใบ HQ · ดีลเลอร์แก้รายบรรทัดได้
// ไม่มีเพดาน ไม่มีขั้นต่ำ (ห้ามใส่ validation เทียบต้นทุน)
// ค่าเดิมที่เคยตั้ง "รายแม่แบบ" (byTemplate) ต้องไม่หายหลังย้าย: ยังไม่เคยตั้ง defaultPct → ใช้ค่าที่พบบ่อยสุดของ byTemplate
//   (ปุ่ม "ใช้กับทุกแม่แบบ" เดิมบันทึกค่าเดียวกันทุกแม่แบบ = ได้ค่านั้นตรงตัว · ค่าเท่ากันหลายค่า → เอาค่ามากสุด)
//   byTemplate เก็บไว้ในฐานตามเดิม ไม่ลบ · บันทึกครั้งแรกจากหน้าตั้งค่าเขียน defaultPct
export type DealerMarkup = { defaultPct?: number; byTemplate?: Record<string, number> };

/** % บวกตั้งต้นของสาขา · ไม่เคยตั้ง = 0 */
export function markupPctOf(pricing: DealerMarkup | undefined): number {
  if (!pricing) return 0;
  if (typeof pricing.defaultPct === "number" && Number.isFinite(pricing.defaultPct)) return pricing.defaultPct;
  const ค่า = Object.values(pricing.byTemplate ?? {}).filter(v => typeof v === "number" && Number.isFinite(v));
  if (!ค่า.length) return 0;
  const นับ = new Map<number, number>();
  for (const v of ค่า) นับ.set(v, (นับ.get(v) ?? 0) + 1);
  return [...นับ.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

// ลบตัวคิดราคาจากราคาแม่แบบของ Flow เก่าแล้ว (16 ต.ค. 69): withMarkup · sellRate · estimateLeadValue · seedLineItems
//   ดีลเลอร์ไม่เห็นราคาแม่แบบ (สวิตช์ซ่อนราคา) · ราคาขาย = ต้นทุนจากใบ HQ × (1 + %) คิดที่ฐาน (quotations_hq_apply_markup)
