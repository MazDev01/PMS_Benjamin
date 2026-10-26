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

// ── ใบ HQ (BOQ + ต้นทุนดีลเลอร์ · ขั้น 5–6 · ด่าน 2) ─────────────────────────────────────────────────────────
//   ร่าง (draft) แก้ได้เรื่อย ๆ และดีลเลอร์ไม่เห็น · ส่งแล้ว (sent) ล็อกทั้งใบ — แก้ราคา = ดีลเลอร์ขอแก้ราคา → เวอร์ชันใหม่
export type HqQuoteStatus = "draft" | "sent" | "ordered" | "superseded";
export type HqQuoteLine = {
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  /** แม่แบบที่ใช้ราคา (ว่าง = รายการที่ HQ พิมพ์เอง เช่น ค่าขนส่ง) */
  catalogId?: string;
  subtype?: string;
};
export type HqQuote = {
  id: number;
  requestId: number;
  version: number;
  quoteNo: string;
  status: HqQuoteStatus;
  lineItems: HqQuoteLine[];
  totalCost: number;
  validUntil: string | null;
  note: string;
  sentAt: string | null;
  sentByName: string;
};
export const hqQuoteStatusLabel: Record<HqQuoteStatus, string> = {
  draft: "ร่าง (ดีลเลอร์ยังไม่เห็น)",
  sent: "ส่งแล้ว",
  ordered: "สั่งผลิตแล้ว",
  superseded: "มีเวอร์ชันใหม่แทน",
};
/** ยอดรายบรรทัด — ปัดสองตำแหน่งแบบเดียวกับฐานข้อมูล (hq_quote_save) */
export const ยอดบรรทัด = (l: Pick<HqQuoteLine, "qty" | "unitCost">) => Math.round(Number(l.qty) * Number(l.unitCost) * 100) / 100;
export const ยอดรวมใบ = (lines: Pick<HqQuoteLine, "qty" | "unitCost">[]) => Math.round(lines.reduce((s, l) => s + ยอดบรรทัด(l), 0) * 100) / 100;
// ── ตาราง BOQ ของ HQ (หน้าคำขอใบเสนอราคา · บอสสั่ง 26 ต.ค. 69) ──────────────────────────────────────────────
/** หน่วยที่เลือกได้ในตาราง BOQ — พิมพ์หน่วยอื่นเองได้ */
export const หน่วยBOQ = ["ตร.ม.", "ตัน", "เมตร", "ชุด", "งาน"] as const;
/** แถวที่ยังไม่ได้กรอกอะไร (ไม่มีชื่อ ไม่มีต้นทุน) — ไม่นับเป็นรายการ ไม่ส่งเข้าฐาน ไม่ถือว่า "แก้ค้าง" */
export const แถวว่าง = (l: Pick<HqQuoteLine, "name" | "unitCost">) => !l.name.trim() && !(Number(l.unitCost) > 0);
export const แถวเปล่าใหม่ = (): HqQuoteLine => ({ name: "", qty: 1, unit: "", unitCost: 0 });

/** แถวที่วางมาจาก Excel — เตือน = อ่านช่องไหนไม่ได้ (แถวยังอยู่ให้แก้ต่อ ไม่ทิ้งเงียบ ๆ) */
export type แถววาง = HqQuoteLine & { เตือน?: string };
const ตัวเลข = (s: string | undefined): number | null => {
  const t = (s ?? "").replace(/[,\s฿]/g, "").replace(/บาท$/, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
/** ข้อความที่วางจาก Excel/Google Sheets (แถวคั่นบรรทัด · ช่องคั่น Tab) → รายการ BOQ
 *  คอลัมน์: รายการ · จำนวน · หน่วย · ต้นทุนต่อหน่วย · แถวหัวตาราง (ช่องตัวเลขอ่านไม่ได้ทั้งคู่ + มีคำว่า รายการ/ชื่อ) ข้ามให้
 *  คืน null = ไม่ใช่ข้อมูลตาราง (วางข้อความธรรมดาในช่องตามปกติ) */
export function แยกแถววางจากExcel(text: string): แถววาง[] | null {
  const บรรทัด = text.replace(/\r\n?/g, "\n").split("\n");
  while (บรรทัด.length && !บรรทัด[บรรทัด.length - 1].trim()) บรรทัด.pop();
  if (!บรรทัด.length || (บรรทัด.length === 1 && !บรรทัด[0].includes("\t"))) return null;
  const ผล: แถววาง[] = [];
  บรรทัด.forEach((b, i) => {
    if (!b.trim()) return;
    const [ชื่อ = "", จำนวน, หน่วย = "", ต้นทุน] = b.split("\t").map(c => c.trim());
    const qty = ตัวเลข(จำนวน), cost = ตัวเลข(ต้นทุน);
    if (i === 0 && qty === null && cost === null && /รายการ|ชื่อ/.test(ชื่อ)) return;   // หัวตาราง
    const ผิด = [
      !ชื่อ && "ไม่มีชื่อรายการ",
      !(qty !== null && qty > 0) && `อ่านจำนวนไม่ได้ (${จำนวน ?? "ว่าง"})`,
      !(cost !== null && cost >= 0) && `อ่านต้นทุนไม่ได้ (${ต้นทุน ?? "ว่าง"})`,
    ].filter(Boolean) as string[];
    ผล.push({ name: ชื่อ, qty: qty !== null && qty > 0 ? qty : 1, unit: หน่วย, unitCost: cost !== null && cost >= 0 ? cost : 0,
      ...(ผิด.length ? { เตือน: ผิด.join(" · ") } : {}) });
  });
  return ผล.length ? ผล : null;
}

/** "เหลือ X วัน" / "เกิน X วัน" / "ครบกำหนดวันนี้" / "เกินกำหนดวันนี้" — นับวันตามปฏิทินเวลาไทย
 *  เกิน = เลยเวลาจริงแล้ว (ตรงกับป้ายเกินกำหนดของฐาน due_at < now()) */
export function เหลือหรือเกิน(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso.length === 10 ? `${iso}T23:59:59+07:00` : iso).getTime();
  if (Number.isNaN(t)) return "—";
  const วัน = (ms: number) => Math.floor((ms + 7 * 3_600_000) / 86_400_000);
  const ห่าง = วัน(t) - วัน(now);
  if (ห่าง > 0) return t < now ? "เกินกำหนดวันนี้" : `เหลือ ${ห่าง} วัน`;
  if (ห่าง === 0) return t < now ? "เกินกำหนดวันนี้" : "ครบกำหนดวันนี้";
  return `เกิน ${-ห่าง} วัน`;
}

/** ป้ายฝั่งดีลเลอร์ (ตารางสถานะแถว "HQ ส่งใบ": Lead คงเดิม + ป้าย "ได้ราคาแล้ว") */
export const ป้ายได้ราคาแล้ว = "ได้ราคาแล้ว";

// ── ใบลูกค้าจากใบ HQ (ขั้น 7 · ด่าน 3) ─────────────────────────────────────────────────────────────────────
//   ราคาขาย = ต้นทุน × (1 + %) ปัด 2 ตำแหน่ง — สูตรเดียวกับฐานข้อมูล (quotations_hq_apply_markup) ที่เป็นตัวตัดสินจริง
//   หน้าจอคิดให้เห็นก่อนบันทึกเท่านั้น · รายการและจำนวนมาจากใบ HQ เสมอ แก้ไม่ได้
export const ราคาขายจากต้นทุน = (unitCost: number, pct: number) => Math.round(Number(unitCost) * (1 + (Number(pct) || 0) / 100) * 100) / 100;
export function รายการใบลูกค้าจากใบHQ(
  hqLines: HqQuoteLine[], pctOf: (line: HqQuoteLine, i: number) => number,
): import("./mock").QuoteLineItem[] {
  return hqLines.map((l, i) => {
    const pct = Math.max(0, Number(pctOf(l, i)) || 0);
    return { name: l.name, qty: Number(l.qty), unit: l.unit, unitPrice: ราคาขายจากต้นทุน(l.unitCost, pct), markupPct: pct };
  });
}

/** margin ที่ HQ เห็น (FLOW "% ที่ดีลเลอร์บวก → HQ ดู margin") — ฐานข้อมูลคิดให้ (quotation_margin) ราคาก่อนภาษี */
export type QuoteMarginLine = { name: string; qty: number; unit: string; unitCost: number; markupPct: number; unitPrice: number; markupBaht: number };
export type QuoteMargin = {
  hqQuoteNo: string; lines: QuoteMarginLine[];
  costTotal: number; saleTotal: number; markupBaht: number; pctOfCost: number | null; pctOfSale: number | null;
};

// ── กล่องงานคำขอราคาของ HQ (หน้า 5 · ใบ 0215 hq_quote_board) ─────────────────────────────────────────────
//   จำนวนทุกกลุ่ม + ลำดับ + ป้ายของแถว คิดที่ฐานที่เดียว — หน้าจอแสดงตามที่ได้ ห้ามนับ/เรียงเอง
export type QuoteBoardGroup = "todo" | "quoted" | "won" | "closed";
export const quoteBoardGroups: { key: QuoteBoardGroup; label: string }[] = [
  { key: "todo", label: "ต้องตีราคา" }, { key: "quoted", label: "ส่งแล้ว รอดีลเลอร์" },
  { key: "won", label: "สั่งผลิต" }, { key: "closed", label: "ปิด/ยกเลิก" },
];
export type QuoteBoardTag = "overdue" | "reprice" | "draft" | "new" | "pricing" | "quoted" | "won" | "lost" | "cancelled" | "superseded";
/** ป้ายของแถวในกล่องงาน — ข้อความ + สี (สีแยกด้วยความสว่าง ไม่ใช่สีอย่างเดียว) */
export const quoteBoardTag: Record<QuoteBoardTag, { label: string; color: string; bar: string; bg: string }> = {
  overdue:    { label: "เกิน 14 วัน",   color: "#b91c1c", bar: "#b91c1c", bg: "#fff7f7" },
  reprice:    { label: "ขอแก้ราคา",    color: "#1d4ed8", bar: "#1d4ed8", bg: "#ffffff" },
  draft:      { label: "ร่างค้าง",      color: "#92400e", bar: "#d97706", bg: "#ffffff" },
  new:        { label: "ใหม่",          color: "#52606d", bar: "transparent", bg: "#ffffff" },
  pricing:    { label: "กำลังตีราคา",   color: "#92400e", bar: "transparent", bg: "#ffffff" },
  quoted:     { label: "รอดีลเลอร์",    color: "#003366", bar: "transparent", bg: "#ffffff" },
  won:        { label: "สั่งผลิต",       color: "#166534", bar: "transparent", bg: "#ffffff" },
  lost:       { label: "ไม่ได้งาน",     color: "#52606d", bar: "transparent", bg: "#ffffff" },
  cancelled:  { label: "ยกเลิก",        color: "#52606d", bar: "transparent", bg: "#ffffff" },
  superseded: { label: "มีเวอร์ชันใหม่", color: "#52606d", bar: "transparent", bg: "#ffffff" },
};
export type QuoteBoardRow = QuoteRequest & {
  dealerName: string; leadCompany: string; hqStatus: HqQuoteStatus | null; quoteNo: string | null;
  validUntil: string | null; waitingDays: number; tag: QuoteBoardTag;
};
export type QuoteBoard = { counts: Record<QuoteBoardGroup, number> & { overdue: number }; rows: QuoteBoardRow[] };
