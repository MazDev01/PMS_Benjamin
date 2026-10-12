// BOQ — รายการสินค้าของใบเสนอราคา (แหล่งเดียว)
// ใบที่สร้างจากฟอร์มใหม่มี lineItems ครบ · ใบเก่า/ใบที่ย้ายข้อมูลมามีแต่ยอดรวม
// จึง "สังเคราะห์" เป็นรายการเดียวจากข้อมูลจริงที่มีอยู่ (แม่แบบ + พื้นที่ + ราคารวม) ไม่ได้กุตัวเลขใหม่
// เดิมตรรกะนี้ก๊อปกันอยู่ 5 ที่ (หน้าใบเสนอราคา 2 · หน้าลูกค้า 1 · แผงใบเสนอราคาของลูกค้าเป้าหมาย 2) แก้ที่เดียวไม่ครบ
import type { QuoteLineItem, SolutionProduct } from "./mock";
import { parseBaht } from "./format";

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

// ── ราคากลางที่ใช้จริงของแม่แบบหนึ่ง ๆ ──────────────────────────────────────────
// แม่แบบย่อยตั้งราคาแยกของตัวเองได้ (subtypePrices) · ไม่ได้ตั้ง = ใช้ราคาของแม่แบบหลัก
// จุดเดียวที่ตัดสินเรื่องนี้ทั้งระบบ — ห้ามอ่าน p.price ตรง ๆ ที่อื่นเวลารู้ชื่อแม่แบบย่อย
// ไม่งั้นหน้าจอกับใบเสนอราคาจะบอกราคาคนละตัว
export function catalogRate(prod: SolutionProduct | undefined, productName?: string): number {
  if (!prod) return 0;
  const sub = productName && productName !== prod.name ? prod.subtypePrices?.[productName] : undefined;
  return sub && sub > 0 ? sub : (prod.price ?? 0);
}

// ── ราคาขายของสาขา = ราคากลาง + ส่วนบวกเพิ่มที่สาขาตั้งเอง (บอสสั่ง 20 ส.ค. 69) ──
//
// สำนักงานใหญ่ตั้ง "ราคากลาง/ต้นทุน" · ส่วนบวกเพิ่มเป็นสิทธิ์ของดีลเลอร์ ตั้งเองได้อิสระ
// ไม่มีเพดาน ไม่มีขั้นต่ำ (กติกาเดิมของระบบ — ห้ามใส่ validation เทียบราคากลาง)
//
// จุดเดียวที่คิดเรื่องนี้ทั้งระบบ — หน้าแม่แบบ ตัวเลือกในใบเสนอราคา และการตั้งต้น BOQ
// ต้องได้ตัวเลขเดียวกันเสมอ ไม่งั้นดีลเลอร์เห็นราคาหนึ่งบนหน้าจอ แต่ใบออกมาอีกราคา
export type DealerMarkup = { defaultPct?: number; byTemplate?: Record<string, number> };

/** บวกกี่ % สำหรับแม่แบบนี้ — ตั้งเฉพาะตัวชนะค่ากลางของสาขาเสมอ · ไม่ตั้ง = 0 */
export function markupPctOf(pricing: DealerMarkup | undefined, templateId: string | undefined): number {
  if (!pricing) return 0;
  const เฉพาะตัว = templateId ? pricing.byTemplate?.[templateId] : undefined;
  const pct = เฉพาะตัว ?? pricing.defaultPct ?? 0;
  return Number.isFinite(pct) ? pct : 0;
}

/** ราคากลาง + ส่วนบวกเพิ่ม → ราคาขายของสาขา (ปัดเป็นจำนวนเต็มบาท) */
export function withMarkup(base: number, pct: number): number {
  if (!(base > 0)) return base;      // ยังไม่ได้ตั้งราคากลาง = บวกอะไรก็ยังเป็น 0
  return Math.round(base * (1 + (pct || 0) / 100));
}

/** ราคาขายของสาขาสำหรับแม่แบบ (หลักหรือย่อย) — ใช้แทน catalogRate ทุกที่ที่เป็น "ราคาที่จะขาย" */
export function sellRate(
  prod: SolutionProduct | undefined, productName: string | undefined, pricing: DealerMarkup | undefined,
): number {
  return withMarkup(catalogRate(prod, productName), markupPctOf(pricing, prod?.id));
}

// ── ประเมินราคาของลูกค้าเป้าหมาย = พื้นที่ × ราคาขายของสาขา (บอสสั่ง 20 ส.ค. 69) ──
//
// เดิมช่อง "ประเมินราคา" ให้เซลส์กรอกเองล้วน ๆ ถ้าไม่กรอกก็ไม่มีมูลค่า
// ทั้งที่ข้อมูลพอจะคิดให้ได้อยู่แล้ว (พื้นที่ที่กรอก + ราคาขายของแม่แบบที่เลือก)
// จึงคิดให้เป็นค่าตั้งต้น แล้วเซลส์แก้ทับได้เสมอ — ไม่ใช่ตัวเลขที่ล็อกไว้
//
// ⚠️ คิดไม่ได้ = คืน 0 ให้ผู้เรียกไปขึ้น "—" ห้ามคืนเลขมั่ว:
//    ไม่มีพื้นที่ · แม่แบบไม่ได้คิดเป็น ตร.ม. · สำนักงานใหญ่ยังไม่ได้ตั้งราคากลาง
export function estimateLeadValue(
  product: string | undefined, area: number | undefined,
  catalog: SolutionProduct[], pricing?: DealerMarkup,
): number {
  if (!product || !((area ?? 0) > 0)) return 0;
  const prod = catalog.find(p => p.name === product) ?? catalog.find(p => p.subtypes?.includes(product));
  if (!prod || prod.unit !== "ตร.ม.") return 0;   // แม่แบบที่ขายเป็น "หลัง"/"ชุด" คูณพื้นที่ไม่ได้
  const rate = sellRate(prod, product, pricing);
  return rate > 0 ? Math.round(rate * area!) : 0;
}

/** ข้อมูลจากลูกค้าเป้าหมาย/ลูกค้า ที่ใช้ตั้งต้น BOQ ของใบใหม่ */
export type SeedSubject = {
  /** แม่แบบที่เลือกไว้ — ตรงกับชื่อหลัก หรือชื่อประเภทย่อยในแคตตาล็อก */
  product: string;
  /** มูลค่าประเมิน (ข้อความอย่าง "฿155K" ก็ได้) */
  value?: string;
  /** พื้นที่ที่กรอกไว้ (ตร.ม.) */
  area?: number;
};

// ── BOQ ตั้งต้นของใบเสนอราคาใหม่ ────────────────────────────────────────────────
// แยกออกมาจากคอมโพเนนต์เพื่อ (1) ทดสอบได้จริง (2) เรียกซ้ำได้ตอนแคตตาล็อกมาช้า
//
// ⚠️ ต้องเรียกใหม่เมื่อแคตตาล็อกโหลดเสร็จ — useMasterCatalog เริ่มด้วยรายการว่างเสมอ
//    แล้วค่อยเติมทีหลัง ถ้าคิด BOQ ครั้งเดียวตอนเปิดฟอร์ม จะได้ราคากลาง = 0 → ไม่มีรายการ
//    และหน้านั้นซ่อนปุ่ม "เลือกจากแคตตาล็อก" ไว้ ผู้ใช้จึงเพิ่มแถวเองไม่ได้ = ออกใบไม่ได้เลย
//    (ผู้ใช้แจ้ง 11 ส.ค. 69 "ไม่มีตัวแม่แบบขึ้นมา" ทั้งที่ลูกค้าเป้าหมายระบุแม่แบบและมูลค่าไว้ครบ)
export function seedLineItems(
  subj: SeedSubject, catalog: SolutionProduct[], pricing?: DealerMarkup,
): QuoteLineItem[] {
  if (!subj.product) return [];
  // ลูกค้าเป้าหมายอาจระบุ "แม่แบบย่อย" (เช่น โรงยิมอเนกประสงค์ อยู่ใต้ สนามกีฬาในร่ม) → หาทั้ง 2 ชั้น
  const prod = catalog.find(p => p.name === subj.product)
            ?? catalog.find(p => p.subtypes?.includes(subj.product));
  // ตั้งต้นด้วย "ราคาขายของสาขา" (ราคากลาง + ส่วนบวกเพิ่มที่สาขาตั้งไว้) ไม่ใช่ราคากลางดิบ
  // ดีลเลอร์ยังแก้ราคาต่อหน่วยรายแถวได้เหมือนเดิม — นี่แค่ค่าตั้งต้นที่ตรงกับที่เขาตั้งไว้เอง
  const rate = sellRate(prod, subj.product, pricing);
  if (rate <= 0) return [];   // ยังไม่รู้ราคากลาง = ยังปั้นไม่ได้ (ไม่ใช่ปั้นด้วยเลข 0)

  // จำนวนตั้งต้น เรียงตามความน่าเชื่อถือของข้อมูล:
  //  1) พื้นที่ที่กรอกไว้ในลูกค้าเป้าหมาย + แม่แบบคิดเป็น ตร.ม. → ใช้ตัวเลขจริงจากลูกค้าเป้าหมาย (ตรงที่สุด · บอสสั่ง 17 ก.ค. 69)
  //  2) ไม่มีพื้นที่ → ถอดกลับจาก มูลค่าประเมิน ÷ ราคากลาง (ประมาณเอา)
  // มีมูลค่าประเมินแล้วต้องได้อย่างน้อย 1 หน่วยเสมอ — มูลค่าที่น้อยกว่าราคากลาง 1 หน่วย
  // เคยปัดลงเป็น 0 แล้วคืนตารางว่าง ซึ่งผู้ใช้เพิ่มแถวเองไม่ได้ = ออกใบไม่ได้
  const est = parseBaht(subj.value || "");
  const areaQty = prod!.unit === "ตร.ม." && (subj.area ?? 0) > 0 ? subj.area! : 0;
  const qty = areaQty > 0 ? areaQty : (est > 0 ? Math.max(1, Math.round(est / rate)) : 0);
  if (qty <= 0) return [];

  return [{ name: subj.product, qty: Math.max(1, qty), unit: prod!.unit, unitPrice: rate }];
}
