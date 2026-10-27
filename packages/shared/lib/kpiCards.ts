// ── การ์ด KPI 4 ใบทุกหน้า (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) — ตัวเลขทุกตัวคิดที่ฐาน (kpi_cards) ─────────────────────────
//
// หน้าเว็บเรียก metrics.kpiCards(หน้า, ช่วง) ตัวเดียว แล้ววาดด้วย KpiRow/KpiCard (components/ui/KpiCard.tsx)
//   ห้ามคิดการ์ดในเบราว์เซอร์อีก · ไม่มีข้อมูล = null → การ์ดขึ้น "—" ห้ามใส่ 0 ปลอม
//   "ในช่วงนี้" = ตัวกรองช่วงเวลาของหน้า · หน้าที่ไม่มีตัวกรอง ใช้ เดือนนี้() และชื่อการ์ดเขียน "เดือนนี้" (บอสตัดสิน 27 ต.ค. 69)
//   ตัวตรวจในรอบตรวจเต็ม: ทุกแถวการ์ดต้องมี 4 ใบพอดี (scripts/check-kpi-rows.mjs + tests/scenario/kpi-cards.spec.ts)

export type KpiPage =
  | "dealer.dashboard" | "dealer.leads" | "dealer.quotations" | "dealer.customers" | "dealer.calendar"
  | "hq.prospects" | "hq.proposals" | "hq.dealers" | "hq.pipeline" | "hq.leads" | "hq.quotations" | "hq.customers" | "hq.audit" | "hq.users";

/** ผลดิบจากฐาน (คีย์การ์ด → ตัวเลข หรือก้อนย่อย) — โหลดไม่สำเร็จ/โหมดตัวอย่าง = {} (ทุกใบขึ้น "—") */
export type KpiCardsData = Record<string, unknown>;

/** อ่านตัวเลขจากผล (รองรับคีย์ซ้อน "won.count") · ไม่มี/ไม่ใช่ตัวเลข = null */
export function ค่า(d: KpiCardsData | null | undefined, path: string): number | null {
  let v: unknown = d;
  for (const k of path.split(".")) {
    if (v == null || typeof v !== "object") return null;
    v = (v as Record<string, unknown>)[k];
  }
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const เวลาไทย = (now = Date.now()) => new Date(now + 7 * 3_600_000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** วันนี้ (เวลาไทย) YYYY-MM-DD */
export function วันนี้ISO(now = Date.now()): string { return iso(เวลาไทย(now)); }

/** ช่วง "เดือนนี้" = วันที่ 1 ของเดือนนี้ .. วันนี้ (เวลาไทย) — ใช้กับหน้าที่ไม่มีตัวกรองช่วงเวลา */
export function เดือนนี้(now = Date.now()): { start: string; end: string } {
  const t = เวลาไทย(now);
  return { start: `${t.toISOString().slice(0, 7)}-01`, end: iso(t) };
}

/** ตัวเลขนับ (ไม่มีค่า = null) */
export const นับ = (n: number | null) => (n == null ? null : n.toLocaleString("th-TH"));
/** บาท ไม่มีทศนิยม */
export const บาทเต็ม = (n: number | null) => (n == null ? null : `฿${Math.round(n).toLocaleString("th-TH")}`);
/** ร้อยละ (ไม่มีค่า = null) */
export const ร้อยละ = (n: number | null, ตำแหน่ง = 0) => (n == null ? null : `${n.toFixed(ตำแหน่ง)}%`);
