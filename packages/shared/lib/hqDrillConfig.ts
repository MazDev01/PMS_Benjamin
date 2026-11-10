// ── ตั้งค่าเจาะลึก 3 หน้า HQ (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า) — แหล่งเดียวของการ์ดและคอลัมน์ (บอสสั่ง 2 พ.ย. 69 · แบบหน้า DCFG) ─────
//   หน้าจอ (apps/hq/app/(app)/hq/_drill/DrillEngine.tsx) และข้อทดสอบ (tests/scenario/hq-drill-pages.spec.ts) ใช้ตั้งค่าชุดนี้ชุดเดียว
//   กติกา: การ์ดที่มีคอลัมน์ k เดียวกัน = แถวรวมของตารางคอลัมน์นั้น (ทุกระดับ ทุกแท็บ) · ไม่มีเป้า/% เป้า/อัตราปิด (อยู่ภาพรวมยอดขายที่เดียว)
//   ตัวเลขจากฐาน hq_drill (ใบ 0271) — คีย์ใน sum = คีย์ของแถวรายดีลเลอร์/รายเดือน
import { รวมคีย์, type หน้าเจาะลึก, type แถวเจาะลึก, type เดือนเจาะลึก } from "./hqDrill";
import { fmtBaht } from "./format";
import { ชื่อขั้น } from "./leadStage";   // ชื่อขั้นจากตัวกลางตัวเดียว (check-lead-stage-map)

export type มิติเจาะลึก = "dealer" | "region" | "prov" | "month";
/** ค่าของชุดแถว: sum = ผลรวมคีย์ (มีในแถวรายเดือนด้วยถ้า month=true) · หรือสูตรเอง v (แถวรายดีลเลอร์) / mv (แถวรายเดือน) */
export type ตัวเลขเจาะลึก = {
  k: string; l: string;
  sum?: string; month?: boolean;
  v?: (rows: แถวเจาะลึก[], ทั้งเครือ: แถวเจาะลึก[]) => number | null;
  mv?: (ms: เดือนเจาะลึก[]) => number | null;
  f?: (n: number) => string;
  /** แสดงเฉพาะแท็บเหล่านี้ (เช่น "ดีลเลอร์ที่มีลูกค้า" ไม่มีความหมายในแถวดีลเลอร์รายเดียว) */
  dims?: มิติเจาะลึก[];
};
/** ไอคอนของการ์ด (หน้าจอแปลงเป็นรูป) */
export type ไอคอนการ์ด = "users" | "phone" | "inbox" | "alarm" | "send" | "hourglass" | "check" | "percent" | "userPlus" | "store";
export type การ์ดเจาะลึก = ตัวเลขเจาะลึก & {
  /** data-kpi ของการ์ด (ชื่อเดียวกับ kpi_cards) */
  kpi: string; sub: (rows: แถวเจาะลึก[]) => string; icon: ไอคอนการ์ด; color?: string; bg?: string; danger?: boolean;
};
export type ตั้งค่าเจาะลึก = {
  หน้า: หน้าเจาะลึก; ป้ายแถว: string;
  การ์ด: การ์ดเจาะลึก[]; คอลัมน์: ตัวเลขเจาะลึก[];
  /** คอลัมน์ที่ใช้วาดแท่ง + ป้าย */
  แท่ง: string; ป้ายแท่ง: string;
};

/** ค่าของตัวเลขบนชุดแถวรายดีลเลอร์ */
export function ค่าแถว(c: ตัวเลขเจาะลึก, rows: แถวเจาะลึก[], ทั้งเครือ: แถวเจาะลึก[]): number | null {
  if (c.v) return c.v(rows, ทั้งเครือ);
  return c.sum ? รวมคีย์(rows, c.sum) : null;
}
/** ค่าของตัวเลขบนชุดแถวรายเดือน (ไม่มีรายเดือน = null) */
export function ค่าเดือน(c: ตัวเลขเจาะลึก, ms: เดือนเจาะลึก[]): number | null {
  if (c.mv) return c.mv(ms);
  return c.sum && c.month ? รวมคีย์(ms, c.sum) : null;
}
export const มีรายเดือน = (c: ตัวเลขเจาะลึก) => !!c.mv || (!!c.sum && !!c.month);

// ── ลูกค้าเป้าหมายทั้งเครือ (DCFG.leads) — จำนวนลีดเท่านั้น · ลีด HQ ไม่นับ (อยู่ในกล่องโอน) ──
//   เปิดอยู่/รอราคา HQ/เสนอราคาลูกค้า/ไม่เคลื่อนไหว = ตอนนี้ · ลีดใหม่/ปิดสำเร็จ/ไม่สำเร็จ = ลีดที่เข้ามาในช่วง (= ภาพรวมยอดขาย)
const ลีด: ตั้งค่าเจาะลึก = {
  หน้า: "leads", ป้ายแถว: "ลูกค้าเป้าหมาย", แท่ง: "leads", ป้ายแท่ง: "ลูกค้าเป้าหมายใหม่ในช่วง",
  การ์ด: [
    { k: "open", kpi: "open", l: "ลูกค้าเป้าหมายที่เปิดอยู่", sum: "open", sub: () => "ราย · ตอนนี้ ยังไม่ปิดการขาย", icon: "users", color: "#2563a8", bg: "#2563a817" },
    { k: "leads", kpi: "new", l: "ลูกค้าเป้าหมายใหม่ในช่วงนี้", sum: "leads", month: true, sub: () => "ราย · เข้ามาในช่วงที่เลือก", icon: "phone", color: "#7c3aed", bg: "#7c3aed17" },
    { k: "qr", kpi: "qr", l: "รอราคา HQ", sum: "qr", sub: () => `ราย · ขั้น${ชื่อขั้น(2)} ตอนนี้`, icon: "inbox", color: "#0891B2", bg: "#0891B217" },
    { k: "stale", kpi: "idle", l: "ไม่เคลื่อนไหวเกิน 30 วัน", sum: "stale", sub: () => "ราย · ตอนนี้ ติดต่อล่าสุดเกิน 30 วัน", icon: "alarm", color: "#EA580C", bg: "#EA580C17", danger: true },
  ],
  คอลัมน์: [
    { k: "leads", l: "ลูกค้าเป้าหมายใหม่", sum: "leads", month: true },
    { k: "open", l: "เปิดอยู่ (ตอนนี้)", sum: "open" },
    { k: "qr", l: ชื่อขั้น(2), sum: "qr" },
    // ขั้นเสนอราคาลูกค้า ทั้งหมด (ทำใบแล้วยังไม่ส่ง + ส่งแล้ว · บอสตอบ 9 พ.ย. 69 ข้อ 2 ก · ฐาน hq_drill ใบ 0284)
    { k: "wait", l: ชื่อขั้น(4), sum: "wait" },
    { k: "stale", l: "ไม่เคลื่อนไหว 30 วัน", sum: "stale" },
    { k: "won", l: "ปิดสำเร็จ", sum: "won", month: true },
    { k: "lost", l: "ปิดไม่สำเร็จ", sum: "lost", month: true },
  ],
};

// ── ใบเสนอราคาทั้งเครือ (DCFG.quo) — ใบที่ส่ง = ไม่นับร่าง/ถูกแทนที่ · มูลค่าตอบรับตามวันลูกค้าตอบรับ ก่อน VAT (= ยอดขายของภาพรวมยอดขาย) ──
//   อัตราตอบรับ = ตอบรับ ÷ ใบที่ส่ง (ระดับใบ) · เป้า/อัตราปิดการขาย (ระดับลีด) อยู่ภาพรวมยอดขายที่เดียว
const อัตรา = (won: number, sent: number) => (sent ? Math.round(1000 * won / sent) / 10 : null);
const อัตราแถว = (rows: { ค่า: Record<string, number> }[]) => อัตรา(รวมคีย์(rows, "won"), รวมคีย์(rows, "sent"));
const ร้อยละ = (x: number) => `${x.toFixed(1)}%`;
const ใบ: ตั้งค่าเจาะลึก = {
  หน้า: "quotations", ป้ายแถว: "ใบเสนอราคา", แท่ง: "sent", ป้ายแท่ง: "ใบที่ส่งในช่วง",
  การ์ด: [
    { k: "sent", kpi: "sent", l: "ส่งลูกค้าในช่วงนี้", sum: "sent", month: true, sub: () => "ใบ · ไม่นับร่าง/ถูกแทนที่", icon: "send" },
    { k: "wait", kpi: "awaiting", l: "รอลูกค้าตอบ", sum: "wait", sub: () => "ใบ · ส่งแล้ว ยังไม่ตอบ (ตอนนี้)", icon: "hourglass", color: "#d97706", bg: "#FEF3C7" },
    { k: "sales", kpi: "won", l: "ตอบรับ (มูลค่า)", sum: "sales", month: true, f: fmtBaht,
      sub: rows => `${รวมคีย์(rows, "won").toLocaleString()} ใบ · ตามวันที่ลูกค้าตอบรับ ก่อน VAT`, icon: "check", color: "#059669", bg: "#E6F6EF" },
    { k: "rate", kpi: "acceptRate", l: "อัตราตอบรับ", v: rows => อัตราแถว(rows), mv: ms => อัตราแถว(ms), f: ร้อยละ,
      // ไม่มีใบที่ส่ง = ไม่มีตัวหาร → ค่า "—" + บอกเหตุ (ไม่ใช่ 0%)
      sub: rows => รวมคีย์(rows, "sent") ? `ตอบรับ ${รวมคีย์(rows, "won").toLocaleString()} ÷ ใบที่ส่ง ${รวมคีย์(rows, "sent").toLocaleString()}` : "ยังไม่มีใบที่ส่งแล้ว", icon: "percent", color: "#7c3aed", bg: "#F3E8FF" },
  ],
  คอลัมน์: [
    { k: "sent", l: "ใบที่ส่ง", sum: "sent", month: true },
    { k: "wait", l: "รอลูกค้าตอบ (ตอนนี้)", sum: "wait" },
    { k: "won", l: "ตอบรับ", sum: "won", month: true },
    { k: "rate", l: "อัตราตอบรับ", v: rows => อัตราแถว(rows), mv: ms => อัตราแถว(ms), f: ร้อยละ },
    { k: "sales", l: "มูลค่าตอบรับ (ก่อน VAT)", sum: "sales", month: true, f: fmtBaht },
  ],
};

// ── ลูกค้าทั้งเครือ (DCFG.cus) — ไม่มียอดขายรายดีลเลอร์ (อยู่ภาพรวมยอดขายที่เดียว) · ยอดซื้อรวมรายลูกค้าอยู่ในรายชื่อ ──
const มีลูกค้า = (rows: แถวเจาะลึก[]) => rows.filter(r => (r.ค่า.cust ?? 0) > 0).length;
const ลูกค้า: ตั้งค่าเจาะลึก = {
  หน้า: "customers", ป้ายแถว: "ลูกค้า", แท่ง: "cust", ป้ายแท่ง: "ลูกค้าทั้งหมด",
  การ์ด: [
    { k: "cust", kpi: "total", l: "ลูกค้าทั้งหมด", sum: "cust", sub: () => "ราย · ไม่นับสำนักงานใหญ่", icon: "users" },
    { k: "newc", kpi: "new", l: "ลูกค้าใหม่ในช่วงนี้", sum: "newc", month: true, sub: () => "ราย · ตามวันที่เป็นลูกค้า", icon: "userPlus", color: "#7c3aed", bg: "#F3E8FF" },
    { k: "withc", kpi: "dealers", l: "ดีลเลอร์ที่มีลูกค้า", v: rows => มีลูกค้า(rows), sub: rows => `จาก ${rows.length} ดีลเลอร์ในขอบเขตนี้`, icon: "store", color: "#059669", bg: "#E6F6EF" },
  ],
  คอลัมน์: [
    { k: "cust", l: "ลูกค้าทั้งหมด", sum: "cust" },
    { k: "newc", l: "ลูกค้าใหม่ในช่วง", sum: "newc", month: true },
    { k: "share", l: "สัดส่วนของเครือ", v: (rows, all) => รวมคีย์(rows, "cust") / Math.max(1, รวมคีย์(all, "cust")), f: x => `${(x * 100).toFixed(1)}%` },
    { k: "withc", l: "ดีลเลอร์ที่มีลูกค้า", v: rows => มีลูกค้า(rows), dims: ["region", "prov"] },
  ],
};

export const ตั้งค่าเจาะลึกทั้งหมด: Record<หน้าเจาะลึก, ตั้งค่าเจาะลึก> = { leads: ลีด, quotations: ใบ, customers: ลูกค้า };
