"use client";

// ─── แหล่งข้อมูลเครือแบบรวม (Single source สำหรับหน้า HQ) ──────────────────────
// รวม "ใบเสนอราคา/ลูกค้าที่ดีลเลอร์สร้างจริง" (SalesContext = สมุดงานสาขา CNX)
// เข้ากับ seed ของสาขาอื่น (hqAllQuotations/hqAllCustomers)
// → ดีลเลอร์สร้าง/แก้ใบเสนอราคา แล้ว HQ เห็นทันที (dedup ด้วยเลขที่/ชื่อ · live ทับ seed)
import { useMemo, useEffect, useState } from "react";
import { มูลค่าลีด } from "@pms/shared/lib/mock";   // มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)
import { ขั้นของลีด } from "./leadStage";
import { useSales } from "@pms/shared/context/SalesContext";
import {
  dealerDetails, fmtISOToThai, hqAllQuotations, hqAllCustomers,
  type HQQuotation, type HQCustomer, type LeadStatus, type LeadRow,
  type DealerDetail, type DealerLeadItem, type DealerProjectItem, type DealerQuoteItem,
} from "@pms/shared/lib/mock";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { dealers as dealersRepo, metrics as metricsRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import type { DealerRow } from "@pms/shared/lib/data/types";
import type { QuoteRangeRow, DashboardQuoteSummary, HQQuotationsSummary, QuoteSummaryFilters, QuoteListOpts, QuoteListResult, LeadSummary, LeadSummaryFilters, LeadListOpts, LeadListResult, NetworkCustomerSummary, UnassignedSummary, UnassignedFilters, HQCustomersPageOpts, HQCustomersPageResult, HQCustomersFilterOptions } from "@pms/shared/lib/data/ports";
import { metrics as metricsRepo2, quotations as quotationsRepo, leads as leadsRepo, customers as customersRepo, appointments as appointmentsRepo } from "@pms/shared/lib/data";
import type { CustomerRow, AppointmentMock, QuotationMock } from "@pms/shared/lib/data/types";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { useAuthReady } from "@pms/shared/lib/useAuthReady";

// ── aggregate ใบในช่วงวันที่ที่ DB (M9) — supabase เท่านั้น · local คืน null (คงเส้นทาง winQuotes เดิม) ──
// reactive: refetch เมื่อ quotations เปลี่ยน หรือช่วง/สาขาเปลี่ยน · debounce 150ms
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function useNetworkQuoteRange(start: Date, end: Date, dealer?: string): Map<string, QuoteRangeRow> | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const s = isoDate(start), e = isoDate(end);
  const [rows, setRows] = useState<Map<string, QuoteRangeRow> | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setRows(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      metricsRepo.networkQuoteRange(s, e, dealer)
        .then(r => { if (alive) setRows(r); })
        .catch(err => logRepoRead("metrics.networkQuoteRange", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [ready, s, e, dealer, salesVersion]);
  return rows;
}

// หน้าเดียวของตารางลูกค้าเป้าหมาย (paged/filtered ที่ DB) — M9 Phase 4 · supabase เท่านั้น · local คืน null
export function useLeadsPage(opts: LeadListOpts): LeadListResult | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const key = JSON.stringify(opts);
  const [page, setPage] = useState<LeadListResult | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setPage(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      leadsRepo.listPage(undefined, opts)
        .then(r => { if (alive) setPage(r); })
        .catch(err => logRepoRead("leads.listPage", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, salesVersion]);
  return page;
}

// สรุปลูกค้าเป้าหมาย "หลังกรอง" ที่ DB สำหรับ /hq/leads — M9 Phase 2 · supabase เท่านั้น · local คืน null → client fallback
// reactive: refetch เมื่อ leads เปลี่ยน หรือ filters เปลี่ยน
export function useLeadSummary(filters: LeadSummaryFilters): LeadSummary | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const key = JSON.stringify(filters);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setSummary(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      metricsRepo2.leadSummary(filters)
        .then(r => { if (alive) setSummary(r); })
        .catch(err => logRepoRead("metrics.leadSummary", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, salesVersion]);
  return summary;
}

// สรุปใบ "หลังกรอง" ที่ DB สำหรับ /hq/quotations (byDealer/byMonth/byProduct/aging) — M9 Phase 2
// supabase เท่านั้น · local คืน null → หน้าใช้ client fallback (คำนวณจาก rows เดิม)
export function useHQQuotationsSummary(filters: QuoteSummaryFilters): HQQuotationsSummary | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const key = JSON.stringify(filters);
  const [summary, setSummary] = useState<HQQuotationsSummary | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setSummary(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      metricsRepo2.hqQuotationsSummary(filters)
        .then(r => { if (alive) setSummary(r); })
        .catch(err => logRepoRead("metrics.hqQuotationsSummary", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, salesVersion]);
  return summary;
}

// หน้าเดียวของตารางใบ (paged/filtered/sorted ที่ DB) — M9 Phase 2 · supabase เท่านั้น · local คืน null
export function useQuotationsPage(opts: QuoteListOpts): QuoteListResult | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const key = JSON.stringify(opts);
  const [page, setPage] = useState<QuoteListResult | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setPage(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      quotationsRepo.listPage(undefined, opts)
        .then(r => { if (alive) setPage(r); })
        .catch(err => logRepoRead("quotations.listPage", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, salesVersion]);
  return page;
}

// ผู้รับผิดชอบใบ (จากลูกค้าเป้าหมายที่ผูก) รายใบ — ป้อน drawer โดยไม่ต้องโหลดลูกค้าเป้าหมายทั้งเครือ (M9 Phase 4)
// supabase เท่านั้น · local คืน null → หน้าใช้ค่า salesperson เดิมของ row (มาจาก array อยู่แล้ว)
export function useQuotationSalesperson(quoteId: string | null, dealerCode: string | null): string | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready || !quoteId || !dealerCode) { setName(null); return; }
    let alive = true;
    quotationsRepo.salesperson(quoteId, dealerCode)
      .then(r => { if (alive) setName(r); })
      .catch(err => logRepoRead("quotations.salesperson", err));
    return () => { alive = false; };
  }, [ready, quoteId, dealerCode]);
  return name;
}

// หน้าเดียวของฐานข้อมูลลูกค้า HQ + KPI/กราฟ จากทั้งชุดที่กรองแล้ว — M9 Phase 6 (migration 0080)
// supabase เท่านั้น · local คืน null → หน้าใช้ client fallback (useCustomerDbLocal)
export function useHQCustomersPage(opts: HQCustomersPageOpts): HQCustomersPageResult | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const key = JSON.stringify(opts);
  const [page, setPage] = useState<HQCustomersPageResult | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setPage(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      metricsRepo2.hqCustomersPage(opts)
        .then(r => { if (alive) setPage(r); })
        .catch(err => logRepoRead("metrics.hqCustomersPage", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, salesVersion]);
  return page;
}

// ตัวเลือกตัวกรอง (ดีลเลอร์/จังหวัด/ประเภทอาคาร/ปีที่ส่งมอบ) ของหน้าฐานข้อมูลลูกค้า — ไม่อิงตัวกรองปัจจุบัน
// supabase เท่านั้น · local คืน null → หน้าคำนวณตัวเลือกจาก useCustomerDbLocal() เอง
export function useHQCustomersFilterOptions(): HQCustomersFilterOptions | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const [opts, setOpts] = useState<HQCustomersFilterOptions | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setOpts(null); return; }
    let alive = true;
    metricsRepo2.hqCustomersFilterOptions()
      .then(r => { if (alive) setOpts(r); })
      .catch(err => logRepoRead("metrics.hqCustomersFilterOptions", err));
    return () => { alive = false; };
  }, [ready, salesVersion]);
  return opts;
}

// ใบ won ของลูกค้ารายเดียว — ป้อน CustomerDrawer (แท็บอาคาร/ประวัติ/ส่งมอบ/ไทม์ไลน์) โดยไม่โหลดใบทั้งเครือ
// supabase เท่านั้น · local คืน null → หน้าใช้ buildings ที่มากับ CustomerDbRow จาก useCustomerDbLocal() อยู่แล้ว
export function useCustomerBuildings(customerId: number | null, dealerCode: string | null): QuotationMock[] | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const [rows, setRows] = useState<QuotationMock[] | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready || customerId == null || !dealerCode) { setRows(null); return; }
    let alive = true;
    quotationsRepo.listForCustomer(customerId, dealerCode)
      .then(r => { if (alive) setRows(r); })
      .catch(err => logRepoRead("quotations.listForCustomer", err));
    return () => { alive = false; };
  }, [ready, customerId, dealerCode]);
  return rows;
}

// สรุปใบในช่วง (byMonth/byStatus/byProduct) ที่ DB รอบเดียว — ป้อนหลายการ์ด (M9)
// supabase เท่านั้น · local คืน null → dashboard คงคำนวณจาก winQuotes เดิม
export function useDashboardQuoteSummary(start: Date, end: Date, dealer?: string): DashboardQuoteSummary | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const s = isoDate(start), e = isoDate(end);
  const [summary, setSummary] = useState<DashboardQuoteSummary | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setSummary(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      metricsRepo.dashboardQuoteSummary(s, e, dealer)
        .then(r => { if (alive) setSummary(r); })
        .catch(err => logRepoRead("metrics.dashboardQuoteSummary", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [ready, s, e, dealer, salesVersion]);
  return summary;
}

// ลูกค้าเป้าหมายไร้ผู้รับผิดชอบเกินเกณฑ์ (ชม.) รายสาขา — ป้อนการ์ดเตือน /hq/leads (M9 Phase 4) · supabase เท่านั้น → null=fallback
export function useUnassignedLeads(filters: UnassignedFilters): UnassignedSummary | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const key = JSON.stringify(filters);
  const [summary, setSummary] = useState<UnassignedSummary | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setSummary(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      metricsRepo2.unassignedLeads(filters)
        .then(r => { if (alive) setSummary(r); })
        .catch(err => logRepoRead("metrics.unassignedLeads", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, salesVersion]);
  return summary;
}

// สรุปลูกค้าทั้งเครือ (total + byProvince) — ป้อน KPI ลูกค้า + provinceTop6 หน้า dashboard (M9 Phase 4)
export function useNetworkCustomerSummary(
  filters?: { dealerCode?: string; dateStart?: string; dateEnd?: string },
): NetworkCustomerSummary | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const [summary, setSummary] = useState<NetworkCustomerSummary | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setSummary(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      metricsRepo.networkCustomerSummary(filters)
        .then(r => { if (alive) setSummary(r); })
        .catch(err => logRepoRead("metrics.networkCustomerSummary", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
    // ⚠️ ต้องมีตัวกรองใน dependency ด้วย — ไม่งั้นเปลี่ยนดีลเลอร์/ช่วงเวลาแล้วตัวเลขค้างของเดิม
    //    (คีย์เป็นสตริงเพื่อไม่ให้ object ที่สร้างใหม่ทุกเรนเดอร์ยิงซ้ำไม่รู้จบ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, salesVersion, JSON.stringify(filters ?? {})]);
  return summary;
}

// โหมด supabase = ข้อมูลจริงทุกสาขาอยู่ใน DB แล้ว (SalesContext ฝั่ง HQ โหลดมาทั้งเครือ)
// → ห้ามเอา seed จำลอง (hqAllQuotations/hqAllCustomers/dealerDetails) มาผสมเด็ดขาด
//   ไม่งั้น HQ จะเห็น "ข้อมูลที่ไม่มีอยู่จริง" ปนกับของจริง (กติกา: ห้ามกุข้อมูล)
// โหมด local = ยังเป็นเดโม → คงพฤติกรรมเดิมไว้ให้หน้าจอมีข้อมูลให้ดู
const USE_SEED = !REAL_BACKEND;

// ดีลเลอร์หลักของเดโม (สาขาที่ลูกค้าเป้าหมาย/ใบไม่ระบุ dealerCode ถือเป็นของสาขานี้)
export const CURRENT_DEALER = { code: "CNX", name: "เชียงใหม่สตีลบิลด์" };

// multi-tenant: บันทึกที่สาขาอื่นสร้างจริง (SalesContext ติด dealerCode) → HQ ต้องระบุสาขาให้ถูก
//
// ชื่อสาขาต้องมาจากทะเบียนจริง — เดิมสร้าง Map จากชุด seed ตอน import โมดูล
// สาขาที่ HQ เพิ่มใหม่จึงแสดงเป็นรหัส 3 ดีลเลอร์ชื่อบริษัท และแก้ชื่อแล้วก็ไม่เปลี่ยนตาม
// อ่านไม่ได้/ยังไม่โหลด → ใช้รหัสสาขาไปก่อน (ไม่กุชื่อขึ้นมาเอง)
function useDealerInfo() {
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  return useMemo(() => {
    const byCode = new Map(dealers.map(d => [d.code, d.name]));
    return (code: string | undefined) => {
      const c = code ?? CURRENT_DEALER.code;
      return { code: c, name: byCode.get(c) ?? c };
    };
  }, [dealers]);
}

// ใบเสนอราคาทั้งเครือ = ใบที่ดีลเลอร์สร้างจริง (map เป็นสาขา CNX) + seed สาขาอื่นที่ไม่ซ้ำเลขที่
export function useNetworkQuotations(): HQQuotation[] {
  const { quotations, leads } = useSales();
  const dealerInfoOf = useDealerInfo();
  return useMemo(() => {
    const live: HQQuotation[] = quotations.map(q => {
      const lead = leads.find(l => (q.dealId != null && l.numId === q.dealId) || (q.customerId > 0 && l.customerId === q.customerId));
      const dl = dealerInfoOf(q.dealerCode); // สาขาเจ้าของใบจริง (undefined = CNX)
      return {
        id: `LIVE-${q.id}`, quoteNo: q.id,
        dealerCode: dl.code, dealerName: dl.name,
        customer: q.customer, valueNum: q.totalValue,
        status: q.status, createdAt: fmtISOToThai(q.date), savedAt: q.savedAt,
        salesperson: lead?.assigned ?? `ดีลเลอร์ ${dl.code}`,
        productLine: q.project, // ไม่ใช้ประเภทอาคาร (แม่แบบ) — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
        // รายละเอียดราคาจริงของใบที่ดีลเลอร์สร้าง → HQ เจาะดูรายการสินค้าได้
        materialCost: q.materialCost, lineItems: q.lineItems,
      };
    });
    if (!USE_SEED) return live; // supabase: ใบทุกสาขามาจาก DB จริงแล้ว
    const liveNos = new Set(live.map(l => l.quoteNo));
    return [...live, ...hqAllQuotations.filter(h => !liveNos.has(h.quoteNo))];
    // ต้องมี dealerInfoOf ด้วย — ทะเบียนสาขาโหลดทีหลังข้อมูลขาย ถ้าไม่เฝ้าดู ชื่อสาขาจะค้างเป็น
    // "รหัส 3 ตัว" ไปจนกว่าจะมีอย่างอื่นมาสะกิดให้คำนวณใหม่ (อาการเดียวกับที่คอมเมนต์ข้างบนพยายามกันอยู่)
  }, [quotations, leads, dealerInfoOf]);
}

// ลูกค้าเป้าหมายทั้งเครือ = ลูกค้าเป้าหมายจริงจาก SalesContext เท่านั้น (ไม่มีข้อมูลเติมสังเคราะห์)
// ลูกค้าเป้าหมายที่ระบุ dealerCode = ของสาขานั้น · ลูกค้าเป้าหมายที่ไม่ระบุ = สมุดงานของสาขา CNX (ดีลเลอร์ที่เล่นได้)
export function useNetworkLeads(): LeadRow[] {
  const { leads } = useSales();
  return useMemo(() => leads.map(l => ({ ...l, dealerCode: l.dealerCode ?? CURRENT_DEALER.code })), [leads]);
}

// ลูกค้าทั้งเครือ = ลูกค้าที่ดีลเลอร์สร้างจริง (สาขา CNX) + seed สาขาอื่นที่ไม่ซ้ำชื่อ
export function useNetworkCustomers(): HQCustomer[] {
  const { customers, quotations } = useSales();
  const dealerInfoOf = useDealerInfo();
  return useMemo(() => {
    const live: HQCustomer[] = customers.map(c => {
      const dl = dealerInfoOf(c.dealerCode); // สาขาเจ้าของลูกค้าจริง (undefined = CNX)
      return {
        // id = คีย์ฝั่ง HQ (กันชนกับ seed) · localId = เลขนับจริงของสาขา → ใช้ออกรหัสลูกค้า
        id: 10000 + c.id, localId: c.id, name: c.company,
        dealerCode: dl.code, dealerName: dl.name,
        province: c.province,
        dealsWon: quotations.filter(q => q.customerId === c.id && q.status === "won").length,
        totalRevenue: c.totalValue,
        status: c.status === "inactive" ? "inactive" : "active",
        // ระบบยังไม่บันทึก "วันติดต่อล่าสุด" ของลูกค้า (มีแต่ของลูกค้าเป้าหมาย) → ไม่มีข้อมูลก็ต้องขึ้น "—"
        // เดิมยัดวันเดียวกันให้ลูกค้าทุกรายทั้งเครือ = ค่าที่กุขึ้นมา
        lastContact: "—", segment: "sme",
      };
    });
    if (!USE_SEED) return live; // supabase: ลูกค้าทุกสาขามาจาก DB จริงแล้ว
    // กันซ้ำด้วย dealerCode ไม่ใช่ชื่อ — ชื่อสะกดต่างนิดเดียวก็หลุด
    // (เคยมี "บ.ไทยสตีล" ใน seed กับ "บจ. ไทยสตีล" ในสมุดสด แล้ว HQ นับเป็น 2 ราย)
    // ลูกค้าของสาขาที่เล่นได้มาจากสมุดสดเสมอ → seed ของสาขานั้นไม่ต้องเอามาต่อท้าย
    return [...live, ...hqAllCustomers.filter(h => h.dealerCode !== CURRENT_DEALER.code)];
  }, [customers, quotations, dealerInfoOf]);
}

// เพดานดึงลูกค้าทั้งเครือ (หน้า /hq/customers ยังทำ KPI/analytics/filter จากชุดนี้ทั้งก้อนในเครื่อง —
// ยังไม่คุ้มรื้อเป็น server-side filter/pagination เต็มรูปแบบ แค่กันไม่ให้โตไม่มีเพดานจนถึง 50k hard cap
// ของ pageAll() แบบเงียบ ๆ · พบจากผลตรวจสอบระบบ 30 ก.ค. 69) — สูงพอที่จะไม่กระทบการใช้งานจริงตอนนี้
const HQ_CUSTOMERS_FETCH_CAP = 5000;

// ลูกค้าของดีลเลอร์สาขาเดียว (หน้ารายละเอียดดีลเลอร์ /hq/dealers/[code]) — กรองที่ repo ตรง ๆ
// เดิมดึงลูกค้าทั้งเครือ (~5000 แถวสูงสุด) แล้วค่อยกรอง .filter() ฝั่ง client — วัดจริงพบ ~1.15MB/หน้า
// ทั้งที่โชว์แค่สาขาเดียว (ผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69) แก้เป็นกรองที่ repo ตรงแทน
export function useNetworkCustomersForDealer(code: string): HQCustomer[] {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const local = useNetworkCustomers().filter(c => c.dealerCode === code);
  const { salesVersion } = useSales();
  const dealerInfoOf = useDealerInfo();
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setRows(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      // ⚠️ ต้องส่ง dealerCodes ไม่ใช่ dealerCode (แก้ 10 ส.ค. 69)
      //   ตัวอะแดปเตอร์ตัดเงื่อนไข dealerCode ทิ้งเมื่อ isHQ เป็นจริง (ตั้งใจ — HQ เห็นทั้งเครือ)
      //   พารามิเตอร์ที่ส่งไปจึงไม่มีผลเลย แล้วผลลัพธ์ก็ไม่ได้กรองซ้ำตอนแปลง
      //   ผลที่เอเจนต์ยืนยัน: หน้ารายละเอียด "ทุกสาขา" โชว์ลูกค้าทั้งเครือเท่ากันหมด
      //   สาขาที่ไม่มีลูกค้าสักรายก็ขึ้น "ลูกค้า 3" และเห็นชื่อ+มูลค่าของสาขาอื่น
      //   dealerCodes เป็นตัวกรองของคำสั่งค้นหาโดยตรง ไม่ผูกกับ isHQ จึงมีผลจริง
      customersRepo.listPage({ isHQ: true }, { limit: HQ_CUSTOMERS_FETCH_CAP, offset: 0, dealerCodes: [code] })
        .then(r => { if (alive) setRows(r.rows); })
        .catch(err => logRepoRead("customers.listPage(dealer)", err));
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [ready, code, salesVersion]);
  return useMemo(() => {
    // ลูกค้าที่เพิ่มล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69)
    if (!rows) return local.slice().sort((a, b) => b.id - a.id); // local mode หรือ supabase ระหว่างโหลด
    // กรองซ้ำอีกชั้น — ถ้าชั้นล่างเปลี่ยนพฤติกรรมอีก หน้านี้ต้องไม่หลุดไปโชว์สาขาอื่น
    return rows.filter(c => c.dealerCode === code).sort((a, b) => b.id - a.id).map(c => {
      const dl = dealerInfoOf(c.dealerCode);
      return {
        id: 10000 + c.id, localId: c.id, name: c.company, dealerCode: dl.code, dealerName: dl.name,
        province: c.province, dealsWon: 0, totalRevenue: c.totalValue,
        status: c.status === "inactive" ? "inactive" : "active" as HQCustomer["status"],
        lastContact: "—", segment: "sme" as HQCustomer["segment"],
      };
    });
  }, [rows, local, dealerInfoOf, code]);
}

// ─── รายละเอียดดีลเลอร์ (เจาะรายสาขา) — CNX = ข้อมูลสด · สาขาอื่น = seed ────────────
// ขั้นของลีดมาจากตัวแปลงกลาง lib/leadStage.ts (รอบ 4) — ตาราง LEAD_TO_ITEM / LEAD_PROGRESS ที่เขียนเองเอาออก
const TH_MO = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function useNetworkDealerDetail(code: string): DealerDetail {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { leads, quotations, salesVersion } = useSales();
  // supabase: ดึงลูกค้าเป้าหมาย/ใบของสาขานี้ตรงจาก repo (RLS = ทั้งเครือ) — ไม่พึ่ง array ทั้งเครือของ SalesContext (M9 Phase 4)
  // local/ยังไม่กลับ: ใช้ array ของ SalesContext เหมือนเดิม (สาขา CNX มีข้อมูลสด · อื่น ๆ ใช้ seed ด้านล่าง)
  const [fetched, setFetched] = useState<{ leads: LeadRow[]; quotes: QuotationMock[] } | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready) { setFetched(null); return; }
    let alive = true;
    Promise.all([
      leadsRepo.listPage(undefined, { limit: 5000, offset: 0, dealerCodes: [code] }),
      quotationsRepo.listPage(undefined, { limit: 5000, offset: 0, dealerCodes: [code] }),
    ]).then(([lp, qp]) => { if (alive) setFetched({ leads: lp.rows, quotes: qp.rows }); })
      .catch(e => logRepoRead("dealerDetail", e));
    return () => { alive = false; };
  }, [ready, code, salesVersion]);
  return useMemo(() => {
    // โหมด local (เดโม): มีข้อมูลสดเฉพาะสาขาที่เล่นได้ (CNX) — สาขาอื่นใช้ seed จำลอง
    // โหมด supabase: ทุกสาขามีข้อมูลจริงใน DB → สร้างจากข้อมูลจริงเสมอ (ห้ามใช้ seed)
    if (USE_SEED && code !== CURRENT_DEALER.code) {
      return dealerDetails[code] ?? { code, monthlySales: [], leads: [], projects: [], quotes: [] };
    }
    // supabase: จากที่ดึงตรง (fetched) · local: กรอง array ของ SalesContext (CNX = ลูกค้าเป้าหมาย/ใบไม่ระบุ dealerCode)
    // ที่เพิ่มล่าสุดขึ้นก่อนทุกแท็บ (บอสสั่ง 21 ก.ย. 69) — ลูกค้าเป้าหมาย = numId · ใบ = เลขที่ใบ (ออกเรียงกัน)
    const mine = (fetched ? fetched.leads : leads.filter(l => (l.dealerCode ?? CURRENT_DEALER.code) === code))
      .slice().sort((a, b) => b.numId - a.numId);
    const myQuotes = (fetched ? fetched.quotes : quotations.filter(q => (q.dealerCode ?? CURRENT_DEALER.code) === code))
      .slice().sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
    const quotes: DealerQuoteItem[] = myQuotes.map(q => ({
      quoteNo: q.id, customer: q.customer, product: q.project,
      valueNum: q.totalValue, status: q.status, date: fmtISOToThai(q.date),
    }));
    const leadItems: DealerLeadItem[] = mine.map(l => ({
      id: l.id, name: l.company || l.name, province: l.province, product: "", // ไม่แสดงแม่แบบของลูกค้าเป้าหมาย
      valueNum: มูลค่าลีด(l), assignedAt: l.createdAt ?? "—",
      stage: ขั้นของลีด(l.status, myQuotes.some(q => q.dealId === l.numId && q.status === "draft")),
    }));
    // แท็บ "โอกาสการขาย" (มูลค่า + % ความคืบหน้า) เอาออกจากหน้ารายละเอียดดีลเลอร์ (รอบ 4 · ไม่มีตัวเลขยอดขาย)
    const projects: DealerProjectItem[] = [];
    // ยอดขายรายเดือน (พันบาท) จากใบเสนอราคาที่ปิดได้ของสาขานี้ · แสดง ม.ค.–มิ.ย. (mock วันนี้ = มิ.ย.)
    const byMonth = new Map<number, number>();
    myQuotes.forEach(q => {
      if (q.status !== "won") return;
      const m = parseInt((q.date || "").slice(5, 7)) - 1;
      if (!isNaN(m)) byMonth.set(m, (byMonth.get(m) ?? 0) + q.totalValue);
    });
    // ⚠️ เดิมตัดไว้ 6 เดือนแรกตายตัว ไม่เกี่ยวกับว่าตอนนี้เดือนอะไร (แก้ 10 ส.ค. 69)
    //   วันนี้ ส.ค. แต่กราฟหยุดที่ มิ.ย. และแท่งสุดท้ายถูกเน้นเป็น "เดือนปัจจุบัน" ผิดไป 2 เดือน
    //   ยอดของ ก.ค./ส.ค. จึงหายไปจากกราฟทั้งที่การ์ดเดียวกันนับรวมอยู่ในตัวเลขสะสม
    //   → แสดงตั้งแต่ ม.ค. ถึงเดือนปัจจุบัน แท่งสุดท้ายจึงเป็นเดือนนี้เสมอ
    const monthsToShow = APP_NOW.getMonth() + 1;
    const monthlySales = TH_MO.slice(0, monthsToShow).map((month, i) => ({ month, value: Math.round((byMonth.get(i) ?? 0) / 1000) }));
    return { code, monthlySales, leads: leadItems, projects, quotes };
  }, [code, fetched, leads, quotations]);
}

// ── ข้อมูลรายสาขาสำหรับ DealerDrawer หน้า /hq/pipeline (customers/leads/quotes/appointments) ──
// supabase: ดึงตรงจาก repo เมื่อเปิด drawer (code != null) — ไม่พึ่ง array ทั้งเครือ (M9 Phase 4)
// local/ยังไม่กลับ/ปิด drawer (code=null): คืน null → หน้าใช้เส้นทาง filter array เดิม
export type DealerDrawerData = {
  customers: { id: number; name: string; province: string; dealsWon: number; totalRevenue: number }[];
  leads: { numId: number; company: string; status: string }[];
  quotes: { quoteNo: string; customer: string; valueNum: number; status: string; createdAt: string }[];
  appointments: AppointmentMock[];
};
export function useDealerDrawerData(code: string | null): DealerDrawerData | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const [data, setData] = useState<DealerDrawerData | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready || !code) { setData(null); return; }
    let alive = true;
    Promise.all([
      customersRepo.listPage(undefined, { limit: 5000, offset: 0, dealerCodes: [code] }),
      leadsRepo.listPage(undefined, { limit: 5000, offset: 0, dealerCodes: [code] }),
      quotationsRepo.listPage(undefined, { limit: 5000, offset: 0, dealerCodes: [code] }),
      appointmentsRepo.listForDealer(code),
    ]).then(([cp, lp, qp, appts]) => {
      if (!alive) return;
      setData({
        customers: cp.rows.map(c => ({ id: c.id, name: c.company, province: c.province, dealsWon: 0, totalRevenue: c.totalValue })),
        leads: lp.rows.map(l => ({ numId: l.numId, company: l.company, status: l.status })),
        quotes: qp.rows.map(q => ({ quoteNo: q.id, customer: q.customer, valueNum: q.totalValue, status: q.status, createdAt: fmtISOToThai(q.date) })),
        appointments: appts,
      });
    }).catch(e => logRepoRead("dealerDrawerData", e));
    return () => { alive = false; };
  }, [ready, code, salesVersion]);
  return data;
}

// ค้นหาทั่วระบบฝั่ง HQ (spotlight) — ดึงเฉพาะที่ match คำค้นจาก repo (bounded) ไม่พึ่ง array ทั้งเครือ (M9 Phase 4)
// supabase เท่านั้น · local/ไม่ใช่ HQ/คำสั้น = คืนว่าง → Topbar ใช้ array ของ SalesContext เอง (dealer scope)
export function useHQSearch(query: string): { leads: LeadRow[]; quotes: QuotationMock[]; customers: CustomerRow[] } | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const [res, setRes] = useState<{ leads: LeadRow[]; quotes: QuotationMock[]; customers: CustomerRow[] } | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!REAL_BACKEND || !ready || q.length < 2) { setRes(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      Promise.all([
        leadsRepo.listPage(undefined, { limit: 6, offset: 0, search: q }),
        quotationsRepo.listPage(undefined, { limit: 6, offset: 0, search: q }),
        customersRepo.listPage(undefined, { limit: 6, offset: 0, search: q }),
      ]).then(([lp, qp, cp]) => {
        if (!alive) return;
        setRes({ leads: lp.rows, quotes: qp.rows, customers: cp.rows });
      }).catch(e => logRepoRead("hqSearch", e));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [ready, query]);
  return res;
}

// นัดหมายของลูกค้าเป้าหมายหนึ่ง (drawer ดูลูกค้าเป้าหมาย หน้า /hq/leads) — supabase: ดึงตรง · local/ยังไม่กลับ: null → ใช้ appointments array เดิม
export function useLeadAppointments(leadNumId: number | null, dealerCode: string | null): AppointmentMock[] | null {
  const ready = useAuthReady();   // ยังไม่ล็อกอิน = ห้ามยิงคำขอ (ดู useAuthReady.ts)
  const { salesVersion } = useSales();
  const [appts, setAppts] = useState<AppointmentMock[] | null>(null);
  useEffect(() => {
    if (!REAL_BACKEND || !ready || leadNumId == null || !dealerCode) { setAppts(null); return; }
    let alive = true;
    appointmentsRepo.listForLead(leadNumId, dealerCode).then(r => { if (alive) setAppts(r); }).catch(e => logRepoRead("appointments.listForLead", e));
    return () => { alive = false; };
  }, [ready, leadNumId, dealerCode, salesVersion]);
  return appts;
}
