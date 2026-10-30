// ── ผลงานดีลเลอร์ของหน้าภาพรวมยอดขาย HQ (/hq/pipeline) — ตัวเลขคิดที่ฐาน hq_pipeline_dealers (ใบ 0264 · FLOW H12) ─────
//   ชุดเดียวกับการ์ด kpi_cards('hq.pipeline'): ผลรวมรายดีลเลอร์ = การ์ด (ยอดขาย · ปิดสำเร็จ/ไม่สำเร็จ · ส่วนต่างกำไร · ถึงเป้า)
//   จัดรูปที่นี่ที่เดียว — ทางต่อฐานตรง (SupabaseAdapter) และทาง API (server/v1/metrics) ใช้ตัวเดียวกัน
export type ผลงานดีลเลอร์ = {
  code: string; name: string; region: string; province: string; status: string;
  leads: number; quotes: number; latest: string | null;
  won: number; lost: number; rate: number | null;
  sales: number; annualTarget: number | null; target: number | null; pct: number | null;
  marginSale: number; marginCost: number; marginQuotes: number; marginPct: number | null;
  ytd: number; onTarget: boolean;
};

const N = (v: unknown) => Number(v ?? 0) || 0;
const Nn = (v: unknown) => (v == null || v === "" ? null : Number(v));

export function จัดรูปผลงานดีลเลอร์(d: unknown): ผลงานดีลเลอร์[] {
  return ((d as Record<string, unknown>[] | null) ?? []).map(r => ({
    code: String(r.code ?? ""), name: String(r.name ?? ""), region: String(r.region ?? ""), province: String(r.province ?? ""),
    status: String(r.status ?? ""), leads: N(r.leads), quotes: N(r.quotes), latest: r.latest ? String(r.latest) : null,
    won: N(r.won), lost: N(r.lost), rate: Nn(r.rate),
    sales: N(r.sales), annualTarget: Nn(r.annualTarget), target: Nn(r.target), pct: Nn(r.pct),
    marginSale: N(r.marginSale), marginCost: N(r.marginCost), marginQuotes: N(r.marginQuotes), marginPct: Nn(r.marginPct),
    ytd: N(r.ytd), onTarget: Boolean(r.onTarget),
  }));
}

/** ผลรวมของแถว (แถวท้ายตาราง) — % คิดจากผลรวม (ไม่ใช่ค่าเฉลี่ยของ %) ด้วยสูตรเดียวกับการ์ด */
export function รวมผลงาน(rows: ผลงานดีลเลอร์[]) {
  const s = (k: keyof ผลงานดีลเลอร์) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const won = s("won"), lost = s("lost"), sales = s("sales"), sale = s("marginSale"), cost = s("marginCost");
  const targets = rows.filter(r => r.target != null);
  const target = targets.length ? targets.reduce((a, r) => a + (r.target ?? 0), 0) : null;
  return {
    leads: s("leads"), quotes: s("quotes"), won, lost, rate: won + lost === 0 ? null : Math.round(100 * won / (won + lost)),
    sales, target, pct: target ? Math.round(100 * sales / target) : null,
    marginQuotes: s("marginQuotes"), marginPct: sale === 0 ? null : Math.round(1000 * (sale - cost) / sale) / 10,
    onTarget: rows.filter(r => r.onTarget).length,
  };
}
