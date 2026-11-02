// ── เจาะลึก 3 หน้า HQ (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า) แบบเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69 · ใบ 0271) ─────
//   ตัวเลขคิดที่ฐาน hq_drill: แถวรายดีลเลอร์ + รายดีลเลอร์รายเดือน · ทุกระดับ/แท็บ/แผงที่มา/การ์ด = ผลรวมของแถวชุดเดียวนี้
//   จัดรูปที่นี่ที่เดียว — ทางต่อฐานตรง (SupabaseAdapter) และทาง API (server/v1/metrics) ใช้ตัวเดียวกัน
export type หน้าเจาะลึก = "leads" | "quotations" | "customers";
/** แถวรายดีลเลอร์ — ตัวเลขของหน้านั้น ๆ (คีย์ตาม hq_drill) */
export type แถวเจาะลึก = { code: string; name: string; region: string; province: string; ค่า: Record<string, number> };
/** แถวรายดีลเลอร์รายเดือน — m = 0..11 */
export type เดือนเจาะลึก = { code: string; y: number; m: number; ค่า: Record<string, number> };
export type ข้อมูลเจาะลึก = { dealers: แถวเจาะลึก[]; months: เดือนเจาะลึก[] };

const N = (v: unknown) => Number(v ?? 0) || 0;
const ตัวเลข = (r: Record<string, unknown>, ไม่เอา: string[]) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => !ไม่เอา.includes(k)).map(([k, v]) => [k, N(v)]));

export function จัดรูปเจาะลึก(d: unknown): ข้อมูลเจาะลึก {
  const o = (d ?? {}) as { dealers?: Record<string, unknown>[]; months?: Record<string, unknown>[] };
  return {
    dealers: (o.dealers ?? []).map(r => ({ code: String(r.code ?? ""), name: String(r.name ?? ""), region: String(r.region ?? ""),
      province: String(r.province ?? ""), ค่า: ตัวเลข(r, ["code", "name", "region", "province"]) })),
    months: (o.months ?? []).map(r => ({ code: String(r.code ?? ""), y: N(r.y), m: N(r.m), ค่า: ตัวเลข(r, ["code", "y", "m"]) })),
  };
}

/** ผลรวมคีย์หนึ่งของชุดแถว */
export const รวมคีย์ = (rows: { ค่า: Record<string, number> }[], k: string) => rows.reduce((a, r) => a + (r.ค่า[k] ?? 0), 0);

const ชื่อเดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** ทุกเดือนในช่วง (แม้ไม่มีข้อมูล) · label = "ต.ค. 2569" */
export function เดือนในช่วง(start: string, end: string): { key: string; y: number; m: number; label: string }[] {
  const out: { key: string; y: number; m: number; label: string }[] = [];
  const s = new Date(`${start}T00:00:00`), e = new Date(`${end}T00:00:00`);
  for (let d = new Date(s.getFullYear(), s.getMonth(), 1); d <= e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, y: d.getFullYear(), m: d.getMonth(), label: `${ชื่อเดือน[d.getMonth()]} ${d.getFullYear() + 543}` });
  }
  return out;
}
