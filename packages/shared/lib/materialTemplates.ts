// ── แม่แบบวัสดุ (บอสสั่ง 26 ต.ค. 69 · ใบ 0244) — วัสดุ/ส่วนประกอบ + ราคาต่อหน่วย (ราคาส่งดีลเลอร์ ก่อน VAT) ─────────────
//
// HQ ตั้งในหน้าตั้งค่า › แม่แบบวัสดุ · ดีลเลอร์เลือกตอนขอราคา (D3) ได้ "ราคาประเมินเบื้องต้น" — ไม่ใช่ใบเสนอราคา
//   ราคาประเมินคิดที่ฐานตอนส่งคำขอ (_estimate_snapshot) — หน้าเว็บคิดให้ดูก่อนส่งด้วยสูตรเดียวกัน (ประเมินรวม)
//   ไม่ใช่แม่แบบอาคารแบบเดิม (เอาออก 16 ต.ค. 69) — ตารางแม่แบบเดิมคงไว้ในฐาน ไม่ถูกอ่าน
import type { HqQuoteLine } from "./quoteRequests";

export type MaterialTemplate = {
  id: number;
  category: string;
  name: string;
  unit: string;
  /** ราคาส่งดีลเลอร์ต่อหน่วย (ก่อน VAT) */
  unitPrice: number;
  active: boolean;
  /** ฐานประทับเองเมื่อราคาเปลี่ยน */
  priceUpdatedAt: string;
};

/** แถวที่ส่งไปบันทึก — ไม่มี id = เพิ่มใหม่ */
export type MaterialTemplateDraft = Omit<MaterialTemplate, "id" | "priceUpdatedAt"> & { id?: number };

/** สำเนารายการประเมินที่คำขอเก็บไว้ ณ ตอนส่ง (HQ เปลี่ยนราคาทีหลัง สำเนานี้ไม่เปลี่ยน) */
export type EstimateItem = { templateId: number; category: string; name: string; unit: string; qty: number; unitPrice: number };

/** ความแม่นของราคาประเมิน — n = 0 → ค่าเฉลี่ย null (แสดง "—") */
export type EstimateAccuracy = { n: number; avgAbsPct: number | null; avgPct: number | null };

export const ป้ายราคาประเมิน = "ราคาประเมินเบื้องต้น ไม่ใช่ใบเสนอราคา";

/** ยอดประเมิน — ปัดรายบรรทัด 2 ตำแหน่งแบบเดียวกับฐาน · ไม่มีรายการ = null */
export function ยอดประเมิน(items: { qty: number; unitPrice: number }[]): number | null {
  if (!items.length) return null;
  return items.reduce((s, i) => s + Math.round(Number(i.qty) * Number(i.unitPrice) * 100) / 100, 0);
}

/** รายการประเมินของคำขอ → แถวในใบ HQ (H8 เปิดมามีรายการจากคำขอ) · ราคาต่อหน่วยตั้งต้น = ราคาแม่แบบ ณ ตอนส่ง HQ แก้ได้ */
export function รายการประเมินเป็นแถวHQ(items: EstimateItem[] | null | undefined): HqQuoteLine[] {
  return (items ?? []).map(i => ({ name: i.name, qty: Number(i.qty), unit: i.unit, unitCost: Number(i.unitPrice) }));
}

/** แม่แบบ → แถวในใบ HQ (ปุ่ม "เลือกจากแม่แบบวัสดุ") · จำนวนตั้งต้น 1 */
export function แม่แบบเป็นแถวHQ(t: MaterialTemplate, qty = 1): HqQuoteLine {
  return { name: t.name, qty, unit: t.unit, unitCost: Number(t.unitPrice) };
}

/** หมวดที่มีอยู่ (ไม่ซ้ำ เรียงตามตัวอักษร) — ช่องหมวดพิมพ์เองได้ มีหมวดเดิมขึ้นให้เลือก (บอสตัดสิน 26 ต.ค. 69) */
export function หมวดที่มี(rows: { category: string }[]): string[] {
  return [...new Set(rows.map(r => r.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
}

/** ค้นแม่แบบ (ชื่อ/หมวด/หน่วย) */
export function ค้นแม่แบบ<T extends { name: string; category: string; unit: string }>(rows: T[], q: string): T[] {
  const k = q.trim().toLowerCase();
  if (!k) return rows;
  return rows.filter(r => `${r.category} ${r.name} ${r.unit}`.toLowerCase().includes(k));
}

/** "+10.0%" / "−3.5%" / "—" */
export function ป้ายเปอร์เซ็นต์คลาด(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(Number(p))) return "—";
  const n = Number(p);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;
}
