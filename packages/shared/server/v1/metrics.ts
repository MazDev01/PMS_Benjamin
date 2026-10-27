// ── /api/v1/metrics — ตัวเลขสรุปทั้งหมด ─────────────────────────────────────────
//
// ระยะ 1 กลุ่มที่ 16 · ทุกตัวเป็น RPC ที่คิดเสร็จแล้วที่ฐานข้อมูล เซิร์ฟเวอร์แค่ส่งต่อ + แปลงชื่อคีย์
// เส้นทางเดียวแยกด้วย ?k= เพราะเป็นเรื่องเดียวกันทั้งหมด (สรุปตัวเลข) และอาร์กิวเมนต์เป็นก้อน JSON
//
// ⚠️ ค่ากลาง (วันนี้ของระบบ / เกณฑ์วันเตือน) อยู่ฝั่งแอป — ผู้เรียกเติมมาให้ครบแล้ว
//    ที่นี่ส่งต่อตรง ๆ ห้ามเดาค่าแทน ไม่งั้นตัวเลขบนจอกับที่คิดจริงจะคนละชุด
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail } from "./_ctx";
import { จัดรูปภาพรวมHQ } from "@pms/shared/lib/hqOverview";
import { จัดรูปแดชบอร์ดHQ } from "@pms/shared/lib/hqDashboard";

type Row = Record<string, unknown>;
type Args = Record<string, unknown>;
export { runtime } from "./_ctx";

const N = (v: unknown) => Number(v ?? 0);
const S = (v: unknown) => String(v ?? "");

/** ชื่อ RPC + วิธีจัดรูปผลลัพธ์ ของแต่ละตัวสรุป — คัดมาจาก SupabaseAdapter.metrics ตรง ๆ */
// export ไว้ให้เทสต์ย่อยเรียกตรวจรูปแบบข้อมูลได้ โดยไม่ต้องยกเซิร์ฟเวอร์ทั้งตัว
export const CALLS: Record<string, { rpc: string; args: (a: Args) => Args; shape: (d: unknown) => unknown }> = {
  // ภาพรวม HQ 3 กล่อง (ด่าน 5 · 0209) — ตัวคำนวณตรวจว่าเป็น HQ เอง · จัดรูปด้วยตัวเดียวกับฝั่งต่อฐานตรง
  hqOverview: { rpc: "hq_overview", args: () => ({}), shape: d => จัดรูปภาพรวมHQ(d) },
  // แดชบอร์ด HQ (0235) — ตัวคำนวณตรวจว่าเป็น HQ เอง · จัดรูปด้วยตัวเดียวกับฝั่งต่อฐานตรง
  hqDashboard: {
    rpc: "hq_dashboard",
    args: a => ({ p_start: a.start, p_end: a.end, p_dealer: a.dealer ?? null, p_today: a.today ?? null }),
    shape: d => จัดรูปแดชบอร์ดHQ(d),
  },
  // การ์ด KPI 4 ใบ (ใบ 0246) — ฐานตรวจสิทธิ์เอง (หน้าดีลเลอร์ = สาขาของผู้เรียก · หน้า HQ = is_hq) · ส่งก้อนตรง ๆ
  kpiCards: {
    rpc: "kpi_cards",
    args: a => ({ p_page: S(a.page), p_start: a.start ?? null, p_end: a.end ?? null, p_dealer: a.dealer ?? null, p_today: a.today ?? null }),
    shape: d => (d ?? {}),
  },
  dealerRollup: {
    rpc: "dealer_rollup",
    args: a => ({ p_year: a.year, p_as_of: a.asOf, p_default_days: a.defaultDays, p_follow_up_days: a.perDealer ?? null }),
    // Map ข้าม JSON ไม่ได้ → ส่งเป็นรายการคู่ แล้วให้ฝั่งแอปประกอบกลับเป็น Map
    shape: d => ((d as Row[]) ?? []).map(r => [S(r.dealer_code), {
      quotes: N(r.quotes), won: N(r.won), lost: N(r.lost),
      revenue: N(r.revenue), openLeads: N(r.open_leads), staleLeads: N(r.stale_leads),
    }]),
  },
  networkQuoteRange: {
    rpc: "network_quote_range",
    args: a => ({ p_start: a.start, p_end: a.end, p_dealer: a.dealer ?? null }),
    shape: d => ((d as Row[]) ?? []).map(r => [S(r.dealer_code), {
      quotes: N(r.quotes), won: N(r.won), lost: N(r.lost), wonVal: N(r.won_val), quoteVal: N(r.quote_val),
    }]),
  },
  leadSummary: {
    rpc: "lead_summary",
    args: a => ({
      p_dealer_codes: a.dealerCodes ?? null, p_province: a.province ?? null, p_product: a.product ?? null,
      p_source: a.source ?? null, p_search: a.search ?? null, p_status: a.status ?? null,
      p_date_start: a.dateStart ?? null, p_date_end: a.dateEnd ?? null,
    }),
    shape: (d) => {
      const x = (d ?? {}) as Record<string, Row[] | undefined>;
      return {
        byStatus: (x.byStatus ?? []).map(r => ({ status: S(r.status), count: N(r.count), value: N(r.value) })),
        bySource: (x.bySource ?? []).map(r => ({ source: S(r.source), count: N(r.count) })),
        byProduct: (x.byProduct ?? []).map(r => ({ product: S(r.product), count: N(r.count) })),
        byProvince: (x.byProvince ?? []).map(r => ({ province: S(r.province), count: N(r.count) })),
        byLostReason: (x.byLostReason ?? []).map(r => ({ reason: S(r.reason), count: N(r.count), value: N(r.value) })),
        // ⚠️ quoted รายเดือน + won รายสาขา (ใบ 0157) ต้องส่งต่อด้วย — ให้ตรงกับ SupabaseAdapter
        //   บั๊กจริงบนเว็บจริง 15 ก.ย. 69: ลืมสองช่องนี้ → /hq/pipeline คิด leads - undefined = NaN
        //   การ์ด "ลูกค้าเป้าหมาย เทียบ ที่ออกใบเสนอราคาแล้ว" ขึ้น "NaN ราย / NaN ราย"
        byMonth: (x.byMonth ?? []).map(r => ({ y: N(r.y), m: N(r.m), created: N(r.new), won: N(r.won), lost: N(r.lost), quoted: N(r.quoted) })),
        byDealer: (x.byDealer ?? []).map(r => ({ dealerCode: S(r.dealer_code), leads: N(r.leads), quoted: N(r.quoted), won: N(r.won), lost: N(r.lost) })),   // lost: ใบ 0234 · ต้องตรงกับ SupabaseAdapter
      };
    },
  },
  dashboardQuoteSummary: {
    rpc: "dashboard_quote_summary",
    args: a => ({ p_start: a.start, p_end: a.end, p_dealer: a.dealer ?? null }),
    shape: (d) => {
      const x = (d ?? {}) as Record<string, Row[] | undefined>;
      return {
        byMonth: (x.byMonth ?? []).map(r => ({ y: N(r.y), m: N(r.m), quotes: N(r.quotes), won: N(r.won), lost: N(r.lost), wonVal: N(r.won_val) })),
        // ⚠️ byDay/byHour ต้องส่งต่อด้วย (ใบ 0160) — ห้ามลืมเหมือนรอบแรก
        //   เส้นทาง api เป็นทางที่ "เว็บใช้งานจริง" ใช้ (NEXT_PUBLIC_DATA_SOURCE=api)
        //   ตอนเพิ่มกราฟรายวัน/รายชั่วโมง 25 ส.ค. 69 แก้ครบทั้งฐานข้อมูลและเส้นทาง supabase
        //   แต่ลืมเส้นทางนี้ → หน้าจอได้ undefined แล้วแดชบอร์ดพังทั้งหน้าเมื่อเลือก "วันนี้"
        //   (บนเครื่องนักพัฒนาไม่เจอ เพราะ dev ใช้เส้นทาง supabase ตรง — เจอจริงบนเว็บจริง 26 ส.ค. 69)
        byDay: (x.byDay ?? []).map(r => ({ d: S(r.d), quotes: N(r.quotes), won: N(r.won), lost: N(r.lost), wonVal: N(r.won_val) })),
        byHour: (x.byHour ?? []).map(r => ({ h: N(r.h), quotes: N(r.quotes), won: N(r.won), wonVal: N(r.won_val) })),
        byStatus: (x.byStatus ?? []).map(r => ({ status: S(r.status), count: N(r.count), value: N(r.value) })),
        // won_value/won_projects = เฉพาะใบที่ปิดการขายได้ (0132) — การ์ด "ยอดขาย" ใช้ตัวนี้
        byProduct: (x.byProduct ?? []).map(r => ({
          product: (r.product as string) ?? null, value: N(r.value), projects: N(r.projects),
          wonValue: N(r.won_value), wonProjects: N(r.won_projects),
        })),
      };
    },
  },
  networkCustomerSummary: {
    rpc: "network_customer_summary",
    // ⚠️ ต้องส่งตัวกรองต่อให้ฐานข้อมูล ให้ตรงกับ SupabaseAdapter (แก้ 27 ส.ค. 69)
    //    เดิมส่งก้อนว่าง = การ์ดลูกค้าบนแดชบอร์ดไม่เดินตามช่วงเวลา/สาขาที่เลือกเลย
    args: a => ({
      p_dealer_code: a.dealerCode ?? null,
      p_date_start: a.dateStart ?? null,
      p_date_end: a.dateEnd ?? null,
    }),
    shape: (d) => {
      const x = (d ?? {}) as { total?: number; byProvince?: Row[] };
      return { total: N(x.total), byProvince: (x.byProvince ?? []).map(r => ({ province: S(r.province), revenue: N(r.revenue), count: N(r.count) })) };
    },
  },
  unassignedLeads: {
    rpc: "unassigned_leads",
    args: a => ({
      p_as_of: a.asOf, p_default_hours: a.defaultHours, p_per_dealer: a.perDealer ?? null,
      p_dealer_codes: a.dealerCodes ?? null, p_province: a.province ?? null, p_product: a.product ?? null,
      p_source: a.source ?? null, p_search: a.search ?? null,
      p_date_start: a.dateStart ?? null, p_date_end: a.dateEnd ?? null,
    }),
    shape: (d) => {
      const x = (d ?? {}) as { total?: number; byDealer?: Row[] };
      return { total: N(x.total), byDealer: (x.byDealer ?? []).map(r => ({ dealerCode: S(r.dealer_code), count: N(r.count) })) };
    },
  },
  hqAlerts: {
    rpc: "hq_alerts",
    args: a => ({
      p_as_of: a.asOf,
      p_unassigned_default_hours: a.unassignedDefaultHours, p_unassigned_per_dealer: a.unassignedPerDealer ?? null,
      p_lead_idle_days: a.leadIdleDays, p_quote_validity_days: a.quoteValidityDays,
      p_quote_expiring_days: a.quoteExpiringDays, p_dealer_idle_days: a.dealerIdleDays,
    }),
    shape: (d) => {
      const x = (d ?? {}) as Record<string, Row[] | undefined>;
      return {
        unassigned: (x.unassigned ?? []).map(r => ({ numId: N(r.num_id), dealerCode: (r.dealer_code as string) ?? null, company: S(r.company), province: S(r.province), value: S(r.value) })),
        idle: (x.idle ?? []).map(r => ({ numId: N(r.num_id), dealerCode: (r.dealer_code as string) ?? null, company: S(r.company), assigned: S(r.assigned), idleDays: N(r.idle_days) })),
        expiring: (x.expiring ?? []).map(r => ({ quoteNo: S(r.quote_no), customer: S(r.customer), value: N(r.value), dealerCode: (r.dealer_code as string) ?? null, daysLeft: N(r.days_left) })),
        dealerLatest: (x.dealer_latest ?? []).map(r => ({ dealerCode: S(r.dealer_code), idleDays: N(r.idle_days) })),
        lostRate: (x.lost_rate ?? []).map(r => ({ dealerCode: S(r.dealer_code), lost: N(r.lost), closed: N(r.closed) })),
      };
    },
  },
  hqQuotationsSummary: {
    rpc: "hq_quotations_summary",
    args: a => ({
      p_status: a.status ?? null, p_dealer_codes: a.dealerCodes ?? null, p_product_lines: a.productLines ?? null,
      p_search: a.search ?? null, p_date_start: a.dateStart ?? null, p_date_end: a.dateEnd ?? null,
      p_as_of: a.asOf, p_search_dealers: a.searchDealers ?? null,
    }),
    shape: (d) => {
      const x = (d ?? {}) as Record<string, Row[] | undefined>;
      return {
        byDealer: (x.byDealer ?? []).map(r => ({
          dealerCode: S(r.dealer_code), count: N(r.count), value: N(r.value),
          sent: N(r.sent), won: N(r.won), lost: N(r.lost), wonVal: N(r.won_val), latest: (r.latest as string) ?? null,
        })),
        byMonth: (x.byMonth ?? []).map(r => ({ y: N(r.y), m: N(r.m), quotes: N(r.quotes), won: N(r.won), lost: N(r.lost), wonVal: N(r.won_val) })),
        byProduct: (x.byProduct ?? []).map(r => ({ product: (r.product as string) ?? null, value: N(r.value), projects: N(r.projects) })),
        aging: (x.aging ?? []).map(r => ({ bucket: S(r.bucket), count: N(r.count), value: N(r.value) })),
      };
    },
  },
  hqCustomersPage: {
    rpc: "hq_customers_page",
    args: a => ({
      p_search: a.search ?? null, p_dealer_code: a.dealerCode ?? null,
      p_provinces: (a.provinces as string[] | undefined)?.length ? a.provinces : null,
      p_building_type: a.buildingType ?? null,
      p_bought_from: a.boughtFrom ?? null, p_bought_to: a.boughtTo ?? null,
      p_limit: a.limit, p_offset: a.offset,
    }),
    shape: (d) => {
      const x = d as { total: number; kpi: unknown; charts: unknown; rows: Row[] };
      return {
        total: x.total, kpi: x.kpi, charts: x.charts,
        rows: (x.rows ?? []).map(r => ({
          id: N(r.id), name: S(r.name), dealerCode: S(r.dealer_code), dealerName: S(r.dealer_name || r.dealer_code),
          province: S(r.province), totalValue: N(r.total_value),
          buildingTypes: (r.building_types as string[] | null) ?? [], templates: (r.templates as string[] | null) ?? [],
          lastPurchaseAt: (r.last_purchase_at as string | null) ?? null,
        })),
      };
    },
  },
  hqCustomersFilterOptions: { rpc: "hq_customers_filter_options", args: () => ({}), shape: d => d },
};

export const POST = handler("metrics", async (req: NextRequest, sb) => {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  const call = CALLS[k];
  if (!call) return fail(400, `ไม่รู้จักตัวสรุป "${k}"`);
  const a = ((await req.json().catch(() => null)) ?? {}) as Args;
  const { data, error } = await sb.rpc(call.rpc, call.args(a));
  if (error) return dbFail(`metrics.${k}`, error);
  return ok(call.shape(data));
}, { อ่าน: () => true });   // ตัวเลขสรุปทุกตัวเป็นการอ่าน (RPC อ่านอย่างเดียว) — นับถังอ่าน
