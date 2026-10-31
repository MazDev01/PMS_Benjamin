// ── แผงดีลเลอร์ด้านขวาของหน้า HQ ดีลเลอร์ (ใบ 0266 · hq_dealer_panel · บอสสั่ง 30 ต.ค. 69) ──
//   ตัวเลขงานดูแลเป็นจำนวน ไม่มีเงิน (FLOW H11) · ฐานคิดทั้งหมด ที่นี่จัดรูปอย่างเดียว · ไม่มีข้อมูล = null (หน้าแสดง "—")
export type สถานะชำระ = "paid" | "partial" | "unpaid";
export type กิจกรรมดีลเลอร์ = { at: string; action: string; target: string; user: string };
export type แผงดีลเลอร์ = {
  code: string; name: string; province: string; region: string; status: string; package: string | null;
  counts: { openLeads: number; requestsWaitingHq: number; quotesAwaiting: number; customers: number };
  lastLoginAt: string | null; lastSalesAt: string | null;
  issuer: { company: string; address: string; phone: string; taxId: string; missing: string | null };
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  franchise: { proposalId: number; proposalNo: string; package: string | null; dueOn: string | null; payment: สถานะชำระ } | null;
  activity: กิจกรรมดีลเลอร์[];
};

const S = (v: unknown) => (v == null ? "" : String(v));
const N = (v: unknown) => Number(v ?? 0) || 0;
const Sn = (v: unknown) => (v == null || v === "" ? null : String(v));

export function จัดรูปแผงดีลเลอร์(d: unknown): แผงดีลเลอร์ | null {
  if (!d || typeof d !== "object") return null;
  const r = d as Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = r.counts ?? {}, i = r.issuer ?? {}, f = r.franchise, p = r.contact;
  return {
    code: S(r.code), name: S(r.name), province: S(r.province), region: S(r.region), status: S(r.status), package: Sn(r.package),
    counts: { openLeads: N(c.openLeads), requestsWaitingHq: N(c.requestsWaitingHq), quotesAwaiting: N(c.quotesAwaiting), customers: N(c.customers) },
    lastLoginAt: Sn(r.lastLoginAt), lastSalesAt: Sn(r.lastSalesAt),
    issuer: { company: S(i.company), address: S(i.address), phone: S(i.phone), taxId: S(i.taxId), missing: Sn(i.missing) },
    contact: p ? { name: Sn(p.name), email: Sn(p.email), phone: Sn(p.phone) } : null,
    franchise: f ? { proposalId: N(f.proposalId), proposalNo: S(f.proposalNo), package: Sn(f.package), dueOn: Sn(f.dueOn),
      payment: (["paid", "partial", "unpaid"].includes(S(f.payment)) ? S(f.payment) : "unpaid") as สถานะชำระ } : null,
    activity: Array.isArray(r.activity) ? r.activity.map((a: Record<string, unknown>) => ({ at: S(a.at), action: S(a.action), target: S(a.target), user: S(a.user) })) : [],
  };
}

export const ป้ายสถานะชำระ: Record<สถานะชำระ, string> = { paid: "ชำระครบ", partial: "ชำระบางส่วน", unpaid: "ยังไม่ชำระ" };
