// ── ภาพรวม HQ 3 กล่อง (ด่าน 5 · FLOW ช่วงที่ 3 · ตัวคำนวณ hq_overview ใบ 0209) ──────────────────────────────────
//   ชนิดข้อมูล + ตัวจัดรูปผลจากฐาน — ใช้ชุดเดียวทั้งต่อฐานตรง (SupabaseAdapter) และ /api/v1/metrics
//   ฐานข้อมูลเป็นคนคิดทุกตัวเลข ที่นี่แค่แปลงชนิด/ใส่ค่าว่างที่ปลอดภัย (ไม่คิดใหม่)
import type { DealerProspectStatus } from "./data/types";

export type HqOverview = {
  recruit: {
    stages: Record<DealerProspectStatus, number>;
    proposalsWaiting: { count: number; amount: number };
    provincesNoDealer: { province: string; leads: number }[];
  };
  requests: {
    queue: { assignee: string | null; open: number; overdue: number }[];
    overdue: number;
    avgResponseDays: number | null;
    closeRate: { won: number; lost: number; pct: number | null };
    cancel: { cancelled: number; total: number; pct: number | null; reasons: { reason: string; count: number }[] };
  };
  sales: {
    hqOrdered: number;
    dealerWon: number;
    marginByDealer: { dealerCode: string; quotes: number; sale: number; cost: number; pctOfSale: number | null; pctOfCost: number | null }[];
  };
};

type R = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0);
const Nn = (v: unknown) => (v == null ? null : Number(v));
const L = (v: unknown) => (Array.isArray(v) ? (v as R[]) : []);
const STAGES: DealerProspectStatus[] = ["new", "contacted", "profile_sent", "meeting", "considering", "won", "lost"];

export function จัดรูปภาพรวมHQ(d: unknown): HqOverview {
  const x = (d ?? {}) as R;
  const rc = (x.recruit ?? {}) as R, rq = (x.requests ?? {}) as R, sl = (x.sales ?? {}) as R;
  const st = (rc.stages ?? {}) as R, pw = (rc.proposalsWaiting ?? {}) as R, cr = (rq.closeRate ?? {}) as R, cc = (rq.cancel ?? {}) as R;
  return {
    recruit: {
      stages: Object.fromEntries(STAGES.map(s => [s, N(st[s])])) as Record<DealerProspectStatus, number>,
      proposalsWaiting: { count: N(pw.count), amount: N(pw.amount) },
      provincesNoDealer: L(rc.provincesNoDealer).map(r => ({ province: String(r.province ?? ""), leads: N(r.leads) })),
    },
    requests: {
      queue: L(rq.queue).map(r => ({ assignee: (r.assignee as string | null) ?? null, open: N(r.open), overdue: N(r.overdue) })),
      overdue: N(rq.overdue),
      avgResponseDays: Nn(rq.avgResponseDays),
      closeRate: { won: N(cr.won), lost: N(cr.lost), pct: Nn(cr.pct) },
      cancel: { cancelled: N(cc.cancelled), total: N(cc.total), pct: Nn(cc.pct),
        reasons: L(cc.reasons).map(r => ({ reason: String(r.reason ?? ""), count: N(r.count) })) },
    },
    sales: {
      hqOrdered: N(sl.hqOrdered), dealerWon: N(sl.dealerWon),
      marginByDealer: L(sl.marginByDealer).map(r => ({ dealerCode: String(r.dealerCode ?? "—"), quotes: N(r.quotes), sale: N(r.sale), cost: N(r.cost),
        pctOfSale: Nn(r.pctOfSale), pctOfCost: Nn(r.pctOfCost) })),
    },
  };
}
