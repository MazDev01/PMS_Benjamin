"use client";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { มูลค่าลีด } from "@pms/shared/lib/mock";   // มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

// ─── HQ · ใบเสนอราคาทั้งเครือ (Network Quotations) ────────────────────────────
// ศูนย์กลางใบเสนอราคาของดีลเลอร์ทุกสาขา — HQ เป็นเจ้าของข้อมูล แต่ "ไม่ออกใบเอง"
// จึงมีแค่ ดู / วิเคราะห์ / เปรียบเทียบ / ส่งออก — ไม่มีปุ่มสร้าง แก้ไข ลบ อนุมัติ
import { useState, useMemo, useEffect } from "react";
import { ความละเอียดของช่วง, ช่องเวลาในช่วง, คีย์ช่อง, type ความละเอียด } from "@pms/shared/lib/trendBuckets";
import { quotationStatusLabel, fmtISOToThai, DEFAULT_DEALER_CODE, QUOTED_UP, type HQQuotation } from "@pms/shared/lib/mock";
import type { QuotationMock } from "@pms/shared/lib/data/types";
import { useQuoteValidityDays } from "@pms/shared/lib/useHQConfig";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useSales } from "@pms/shared/context/SalesContext";
import { dealers as dealersRepo, quotations as quotationsRepo } from "@pms/shared/lib/data";
import type { DealerRow } from "@pms/shared/lib/data/types";
import type { QuoteSummaryFilters, QuoteListOpts } from "@pms/shared/lib/data/ports";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { useNetworkQuotations, useNetworkLeads, useHQQuotationsSummary, useQuotationsPage, useLeadSummary, useQuotationSalesperson } from "@pms/shared/lib/useNetworkData";
import {
  toQuoteRows, aggregate, groupBy, agingBucketOf, regionDisplay, dealerLookups,
  type QuoteRow, type DealerAgg, type AgingBucket,
} from "@pms/shared/lib/hqQuotations";
import { groupLostReasons } from "@pms/shared/lib/lostReasons";

const TH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const QPAGE_SIZE = 10;
const isoDateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
import { QuotationKPICards } from "@pms/shared/components/hq/quotations/QuotationKPICards";
import { QuotationFilterBar, EMPTY_FILTERS, type QuotationFilters } from "@pms/shared/components/hq/quotations/QuotationFilterBar";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { QuotationAnalytics } from "@pms/shared/components/hq/quotations/QuotationAnalytics";
import { QuotationTable } from "@pms/shared/components/hq/quotations/QuotationTable";
import { pageSlice } from "@pms/shared/components/ui/TablePagination";
import { QuotationDrawer } from "@pms/shared/components/hq/quotations/QuotationDrawer";

export default function NetworkQuotationPage() {
  const { inRange, timeRange } = useFilters();
  const netQuotes = useNetworkQuotations();
  const { refreshSales } = useSales();
  const netLeads = useNetworkLeads();
  const [filters, setFilters] = useState<QuotationFilters>(EMPTY_FILTERS);
  const [viewQ, setViewQ] = useState<QuoteRow | null>(null);

  // อายุใบเสนอราคา = นโยบาย HQ — อ่านผ่าน repo (เดิมอ่าน localStorage ตรง ๆ
  // โหมด supabase เลยได้ค่า default 30 วันเสมอ ไม่ใช่ค่าจริงที่ HQ ตั้งไว้ → วันหมดอายุบนหน้าเพี้ยน)
  const validityDays = useQuoteValidityDays();
  // รายชื่อดีลเลอร์จากทะเบียนจริง (เดิมถอดจากใบเสนอราคา mock → เห็นสาขาที่ไม่มีอยู่จริง)
  // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
  const ALL_DEALERS_FULL = useRepoValue<DealerRow[]>(() => dealersRepo.list().then(l => l.filter(ไม่ใช่แถวHQ)), []);
  const ALL_DEALERS = useMemo(
    () => ALL_DEALERS_FULL.map(d => ({ code: d.code, name: d.name })).sort((a, b) => a.code.localeCompare(b.code)),
    [ALL_DEALERS_FULL],
  );

  // เปิดหน้าด้วย ?dealer=CODE (กดมาจากแดชบอร์ด/การ์ดสถิติ) → กรองดีลเลอร์นั้นให้เลย
  // เก็บค่าจาก URL ไว้ก่อน แล้วค่อยใช้ตอนทะเบียนดีลเลอร์โหลดเสร็จ
  // (ทะเบียนมาจาก repo = ยังว่างตอนเรนเดอร์แรก · ถ้าเช็คทันทีแล้วล้าง URL ทิ้ง ตัวกรองจะไม่ติดเลย)
  const [pendingDealer, setPendingDealer] = useState<string | null>(null);
  useEffect(() => {
    const u = new URLSearchParams(window.location.search), code = u.get("dealer");
    // ?kpi=won (การ์ดยอดขายของภาพรวมยอดขาย · ใบ 0246) = กรองใบที่ตอบรับ
    if (u.get("kpi") === "won") { setFilters(f => ({ ...f, status: "won" })); window.history.replaceState(null, "", "/hq/quotations"); }
    if (code) { setPendingDealer(code); window.history.replaceState(null, "", "/hq/quotations"); }
  }, []);
  useEffect(() => {
    if (!pendingDealer || !ALL_DEALERS.length) return;
    if (ALL_DEALERS.some(d => d.code === pendingDealer)) setFilters(f => ({ ...f, dealer: pendingDealer }));
    setPendingDealer(null);
  }, [pendingDealer, ALL_DEALERS]);

  // ภาค/จังหวัดมาจากทะเบียนดีลเลอร์จริง — สาขาที่ HQ เพิ่งเพิ่มต้องโผล่ในตัวกรองด้วย
  const look = useMemo(() => dealerLookups(ALL_DEALERS_FULL), [ALL_DEALERS_FULL]);
  const allRows = useMemo(() => toQuoteRows(netQuotes, validityDays, look), [netQuotes, validityDays, look]);

  // ตัวกรอง/กราฟ/คอลัมน์ส่งออก "ประเภทอาคาร" (แม่แบบ) ถอดออกทั้งหมด — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
  //   ไม่ส่ง productLines ให้ฐานข้อมูลแล้ว (byProduct ที่ RPC ยังส่งมา = ไม่ใช้)

  // ตัวกรองทุกตัว "ยกเว้นช่วงเวลา" — กราฟแนวโน้ม 12 เดือนใช้ชุดนี้ (ถ้าอิงช่วงเวลาจะว่าง 11 ช่อง)
  const matchesNonTime = useMemo(() => (r: QuoteRow) => {
    if (filters.dealer !== "all" && r.dealerCode !== filters.dealer) return false;
    if (filters.region !== "all" && r.region !== filters.region) return false;
    if (filters.province !== "all" && r.dealerProvince !== filters.province) return false;
    if (filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.search.trim()) {
      const s = filters.search.trim().toLowerCase();
      const hay = `${r.quoteNo} ${r.customer} ${r.dealerName} ${r.dealerCode}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }, [filters]);

  const trendRows = useMemo(() => allRows.filter(matchesNonTime), [allRows, matchesNonTime]);
  const rows = useMemo(() => trendRows.filter(r => inRange(r.createdAt)), [trendRows, inRange]);

  // ลูกค้าเป้าหมายสำหรับกราฟ "อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์" และ "เหตุผลที่เสียโอกาส"
  // กรองเฉพาะมิติที่ลูกค้าเป้าหมายมีจริง: ขอบเขตดีลเลอร์ (ดีลเลอร์/ภูมิภาค/จังหวัดดีลเลอร์) + ช่วงเวลา
  // ไม่กรองด้วยสถานะของใบเสนอราคา — เป็นคนละเอกสารกัน จะกรองข้ามไม่ได้
  const leadRows = useMemo(() => netLeads.filter(l => {
    const code = l.dealerCode || "";
    if (filters.dealer !== "all" && code !== filters.dealer) return false;
    if (filters.region !== "all" && look.regionOf(code) !== filters.region) return false;
    if (filters.province !== "all" && look.provinceOf(code) !== filters.province) return false;
    return l.createdAt ? inRange(l.createdAt) : true;
  }), [netLeads, filters.dealer, filters.region, filters.province, inRange]);

  // ใบที่ออกล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69 — ตรงกับทางต่อฐานที่เรียง created_at) · เลขที่ใบรันตามลำดับที่ออก
  const tableRows = useMemo(() => [...rows].sort((a, b) =>
    b.quoteNo.localeCompare(a.quoteNo, "en", { numeric: true })), [rows]);

  // ── M9 Phase 2: resolve derived filter → คอลัมน์จริง ให้ DB รวมยอด/แบ่งหน้าได้ ──
  const nameOf = useMemo(() => new Map(ALL_DEALERS_FULL.map(d => [d.code, d.name])), [ALL_DEALERS_FULL]);
  const resolvedDealerCodes = useMemo<string[] | undefined>(() => {
    let codes: string[] | undefined;
    const restrict = (pred: (c: string) => boolean) => { codes = (codes ?? ALL_DEALERS_FULL.map(d => d.code)).filter(pred); };
    if (filters.dealer !== "all") restrict(c => c === filters.dealer);
    if (filters.region !== "all") restrict(c => look.regionOf(c) === filters.region);
    if (filters.province !== "all") restrict(c => look.provinceOf(c) === filters.province);
    return codes;
  }, [filters.dealer, filters.region, filters.province, ALL_DEALERS_FULL, look]);
  const search = filters.search.trim();
  const searchDealers = useMemo<string[] | undefined>(() => {
    if (!search) return undefined;
    const s = search.toLowerCase();
    return ALL_DEALERS_FULL.filter(d => d.name.toLowerCase().includes(s) || d.code.toLowerCase().includes(s)).map(d => d.code);
  }, [search, ALL_DEALERS_FULL]);

  const status = filters.status === "all" ? undefined : filters.status;
  const baseFilters: QuoteSummaryFilters = { status, dealerCodes: resolvedDealerCodes, search: search || undefined, searchDealers, asOf: isoDateOf(APP_NOW) };
  // การ์ด KPI เดินตามตัวกรองภาค/จังหวัด/คำค้น (บอสตัดสิน 27 ต.ค. 69) — ชุดเดียวกับที่ส่งให้ตาราง (สถานะ = ปุ่มเดียวกับการ์ด ไม่ส่ง)
  const ตัวกรองการ์ด = useMemo(() => (resolvedDealerCodes || search
    ? { dealerCodes: resolvedDealerCodes, search: search || undefined, searchDealers } : null), [resolvedDealerCodes, search, searchDealers]);
  const qFilters: QuoteSummaryFilters = { ...baseFilters, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end) };
  const summary = useHQQuotationsSummary(qFilters);       // มีเวลา → analytics/KPI/ตาราง
  const trendSummary = useHQQuotationsSummary(baseFilters); // ไม่มีเวลา → กราฟแนวโน้ม 12 เดือน

  // ลูกค้าเป้าหมายของสาขาในตัวกรอง (ขอบเขต+เวลาเดียวกับ leadRows) ที่ DB — ป้อน LeadsVsQuotations + LostReasons
  //   province ใช้ resolvedDealerCodes (จังหวัด "ของดีลเลอร์") ไม่ใช่ p_province ของ lead_summary (จังหวัดลูกค้า)
  const leadSum = useLeadSummary({ dealerCodes: resolvedDealerCodes, dateStart: qFilters.dateStart, dateEnd: qFilters.dateEnd });
  // leads = ลูกค้าเป้าหมายทั้งหมด · quoted = ที่ไปถึงขั้นเสนอราคาแล้ว (QUOTED_UP)
  //   quoted ใช้คิด "อัตราแปลง" — สูตรเดียวกับ /hq/leads และ /hq/pipeline (เดิมกราฟนี้หาร "จำนวนใบ" จึงเกิน 100% ได้)
  const leadsByDealer = useMemo<Record<string, { leads: number; quoted: number }>>(() => {
    if (leadSum) return Object.fromEntries(leadSum.byDealer.map(d => [d.dealerCode, { leads: d.leads, quoted: d.quoted }]));
    const m: Record<string, { leads: number; quoted: number }> = {};
    leadRows.forEach(l => {
      const c = l.dealerCode || ""; if (!c) return;
      const r = m[c] ?? (m[c] = { leads: 0, quoted: 0 });
      r.leads += 1;
      if (QUOTED_UP.includes(l.status)) r.quoted += 1;
    });
    return m;
  }, [leadSum, leadRows]);
  // โชว์ทุกเหตุผลตามจริงในกราฟ · ยุบเฉพาะหางยาวเป็น "อื่นๆ" (ดู groupLostReasons)
  const lostReasons = useMemo(() => {
    const ดิบ = leadSum ? leadSum.byLostReason : (() => {
      const m = new Map<string, { count: number; value: number }>();
      leadRows.filter(l => l.status === "CANCELLED" && l.lostReason).forEach(l => { const r = m.get(l.lostReason!) ?? { count: 0, value: 0 }; r.count += 1; r.value += มูลค่าลีด(l) ?? 0; m.set(l.lostReason!, r); });   // มูลค่า = ยอดใบล่าสุด (ใบ 0223)
      return [...m.entries()].map(([reason, x]) => ({ reason, ...x }));
    })();
    return groupLostReasons(ดิบ);
  }, [leadSum, leadRows]);
  const totalLost = useMemo(
    () => leadSum ? (leadSum.byStatus.find(s => s.status === "CANCELLED")?.count ?? 0) : leadRows.filter(l => l.status === "CANCELLED").length,
    [leadSum, leadRows],
  );
  const unspecifiedLost = useMemo(
    () => leadSum ? Math.max(0, totalLost - lostReasons.reduce((s, r) => s + r.count, 0)) : leadRows.filter(l => l.status === "CANCELLED" && !l.lostReason).length,
    [leadSum, leadRows, totalLost, lostReasons],
  );

  // dealerAgg = รายดีลเลอร์ (supabase: DB · local/ยังไม่กลับ: client จาก rows) → ป้อน KPI/ภูมิภาค/อันดับ/ลูกค้าเป้าหมายเทียบใบ/มูลค่า
  const dealerAgg = useMemo<DealerAgg[]>(() => {
    if (summary) return summary.byDealer.map(d => ({
      code: d.dealerCode, name: nameOf.get(d.dealerCode) ?? d.dealerCode, region: look.regionOf(d.dealerCode),
      count: d.count, value: d.value, sent: d.sent, accepted: d.won, rejected: d.lost, wonValue: d.wonVal,
    }));
    return [...groupBy(rows, r => r.dealerCode).entries()].map(([code, list]) => ({ code, name: list[0].dealerName, region: list[0].region, ...aggregate(list) }));
  }, [summary, rows, nameOf, look]);

  const aging = useMemo(() => {
    if (summary) return summary.aging.map(a => ({ key: a.bucket as AgingBucket, count: a.count, value: a.value }));
    const m = new Map<AgingBucket, { count: number; value: number }>();
    rows.filter(r => r.pending && r.agingDays != null).forEach(r => { const k = agingBucketOf(r.agingDays!); const x = m.get(k) ?? { count: 0, value: 0 }; x.count += 1; x.value += r.valueNum; m.set(k, x); });
    return [...m.entries()].map(([key, x]) => ({ key, ...x }));
  }, [summary, rows]);

  // ⚠️ เดินตามแถบกรองด้านบนแล้ว (บอสสั่ง 25 ส.ค. 69 "เอาทุกกราฟใน hq")
  //    ช่วงสั้นนับจากแถวจริงฝั่งเครื่อง (trendRows) เพราะสรุปจากฐานข้อมูลมีแค่ระดับเดือน
  const ละเอียดแท่ง: ความละเอียด = ความละเอียดของช่วง(timeRange.start, timeRange.end) === "month" ? "month" : "day";
  const trend = useMemo(() => {
    if (ละเอียดแท่ง !== "month") {
      const ช่อง = ช่องเวลาในช่วง(timeRange.start, timeRange.end, ละเอียดแท่ง);
      const barM = new Map<string, number>(), lineM = new Map<string, number>();
      trendRows.forEach(r => {
        const d = r.createdDate; if (!d || d < timeRange.start || d > timeRange.end) return;
        const k = คีย์ช่อง(d, ละเอียดแท่ง);
        barM.set(k, (barM.get(k) ?? 0) + 1);
        if (r.status === "won") lineM.set(k, (lineM.get(k) ?? 0) + 1);
      });
      return { months: ช่อง.map(b => b.label), bar: ช่อง.map(b => barM.get(b.key) ?? 0), line: ช่อง.map(b => lineM.get(b.key) ?? 0) };
    }
    const slots: { label: string; y: number; m: number }[] = [];
    for (let i = 11; i >= 0; i--) { const d = new Date(APP_NOW.getFullYear(), APP_NOW.getMonth() - i, 1); slots.push({ label: TH_ABBR[d.getMonth()], y: d.getFullYear(), m: d.getMonth() }); }
    const bar = Array(12).fill(0), line = Array(12).fill(0);
    if (trendSummary) {
      const byKey = new Map(trendSummary.byMonth.map(r => [`${r.y}-${r.m}`, r]));
      slots.forEach((s, i) => { const r = byKey.get(`${s.y}-${s.m}`); if (r) { bar[i] = r.quotes; line[i] = r.won; } });
    } else {
      slots.forEach((s, i) => {
        bar[i] = trendRows.filter(r => r.createdDate && r.createdDate.getFullYear() === s.y && r.createdDate.getMonth() === s.m).length;
        line[i] = trendRows.filter(r => r.status === "won" && r.createdDate && r.createdDate.getFullYear() === s.y && r.createdDate.getMonth() === s.m).length;
      });
    }
    return { months: slots.map(s => s.label), bar, line };
  }, [trendSummary, trendRows, ละเอียดแท่ง, timeRange.start, timeRange.end]);

  // ตาราง: supabase = แบ่งหน้าที่ DB (listPage) · local/ยังไม่กลับ = tableRows (client, ทั้งชุด)
  const [tablePage, setTablePage] = useState(0);
  const tableKey = JSON.stringify(qFilters);
  useEffect(() => { setTablePage(0); }, [tableKey]); // เปลี่ยนตัวกรอง → กลับหน้า 1
  const listOpts = useMemo<QuoteListOpts>(() => ({
    limit: QPAGE_SIZE, offset: tablePage * QPAGE_SIZE, sort: { col: "created_at", dir: "desc" }, // ใบที่สร้างล่าสุดก่อน (บอสสั่ง 21 ก.ย. 69) — date เปลี่ยนทุกครั้งที่ส่ง
    status, dealerCodes: resolvedDealerCodes, search: search || undefined, searchDealers,
    dateStart: qFilters.dateStart, dateEnd: qFilters.dateEnd,
  }), [tablePage, tableKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageResult = useQuotationsPage(listOpts);
  // แถวจาก listPage เป็น QuotationMock ดิบ → map เป็น HQQuotation (เท่า useNetworkQuotations) ก่อน toQuoteRows
  const mapToHQ = (q: QuotationMock): HQQuotation => {
    const lead = netLeads.find(l => (q.dealId != null && l.numId === q.dealId) || ((q.customerId ?? 0) > 0 && l.customerId === q.customerId));
    const code = q.dealerCode ?? DEFAULT_DEALER_CODE;
    return {
      id: `LIVE-${q.id}`, quoteNo: q.id, dealerCode: code, dealerName: nameOf.get(code) ?? code,
      customer: q.customer, valueNum: q.totalValue, status: q.status, createdAt: fmtISOToThai(q.date),
      salesperson: lead?.assigned ?? `ดีลเลอร์ ${code}`, productLine: q.project || "",
      materialCost: q.materialCost, lineItems: q.lineItems,
    };
  };
  // mapToHQ ปิดคลุม netLeads/nameOf — ขาดไปก่อนหน้านี้ทำให้ชื่อผู้รับผิดชอบค้างค่าเก่าถ้าลูกค้าเป้าหมาย/ทะเบียนดีลเลอร์
  // เปลี่ยนผ่าน realtime โดย pageResult reference เดิม (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
  // local ต้องตัดเป็นหน้า ๆ ที่ client ด้วย — ไม่งั้นแถบเปลี่ยนหน้าบอก "หน้า 1/9" แต่ตารางเทมาทั้ง 9 หน้า
  const localPageCount = Math.max(1, Math.ceil(tableRows.length / QPAGE_SIZE));
  const localPage = Math.min(tablePage, localPageCount - 1);
  const displayRows = useMemo(() => pageResult ? toQuoteRows(pageResult.rows.map(mapToHQ), validityDays, look) : pageSlice(tableRows, localPage, QPAGE_SIZE), [pageResult, tableRows, localPage, validityDays, look, netLeads, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalRows = pageResult ? pageResult.total : tableRows.length;
  const pagination = { page: pageResult ? tablePage : localPage, pageCount: Math.max(1, Math.ceil(totalRows / QPAGE_SIZE)), total: totalRows, onPage: setTablePage };

  // ผู้รับผิดชอบใบใน drawer — supabase (แถวมาจาก listPage) เดิมได้ placeholder → เติมชื่อจริงจากลูกค้าเป้าหมายผ่าน RPC
  //   local (ไม่มี pageResult) = viewQ.salesperson มาจาก array จริงอยู่แล้ว → hook คืน null ไม่ทับ
  // ต้องระบุสาขาของใบที่เปิดอยู่ — ไม่งั้นอาจได้ชื่อพนักงานของสาขาอื่นที่เลขที่ใบตรงกัน
  const drawerSp = useQuotationSalesperson(viewQ && pageResult ? viewQ.quoteNo : null, viewQ?.dealerCode ?? null);

  // Export — หนึ่งแถวต่อใบ · supabase: ดึงทั้งชุดที่กรองจาก DB ตอนกด · local: จาก tableRows (ทั้งชุดอยู่แล้ว)
  const quoteToCells = (q: QuoteRow) => [
    q.quoteNo, q.dealerCode, q.dealerName, q.customer, q.dealerProvince, regionDisplay(q.region),
    q.valueNum, quotationStatusLabel[q.status], q.createdAt, q.validUntil ?? "—", q.agingDays ?? "—",
  ];
  const exportGetRows = pageResult
    ? async () => {
        const all = await quotationsRepo.listPage(undefined, { ...listOpts, limit: Math.max(1, totalRows), offset: 0 });
        return toQuoteRows(all.rows.map(mapToHQ), validityDays, look).map(quoteToCells);
      }
    : undefined;

  return (
    <div className="erp">
      {/* ปุ่ม/ตัวกรองของหน้าอยู่ขวาหัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้า/ป้ายกลุ่มมาจากแถบบนแล้ว */}
      <TopbarActions>
          {/* ช่วงเวลาอยู่ที่หัวหน้า — ที่เดียวกับทุกหน้า HQ (แดชบอร์ด/ภาพรวมยอดขาย/ลูกค้าเป้าหมาย) */}
          <FilterBar dims={[]} />
          <ExportMenu
            filename="hq-network-quotations"
            title="ใบเสนอราคาทั้งเครือ"
            headers={["เลขที่", "รหัสดีลเลอร์", "ดีลเลอร์", "ลูกค้า", "จังหวัด (ดีลเลอร์)", "ภูมิภาค", "มูลค่า (บาท)", "สถานะ", "วันที่สร้าง", "ใช้ได้ถึง", "อายุใบ (วัน)"]}
            rows={tableRows.map(quoteToCells)}
            getRows={exportGetRows}
          />
      </TopbarActions>

      <QuotationKPICards ช่วง={{ start: isoDateOf(timeRange.start), end: isoDateOf(timeRange.end) }} dealer={filters.dealer === "all" ? null : filters.dealer}
        today={isoDateOf(APP_NOW)} ตัวกรอง={ตัวกรองการ์ด} รุ่น={netQuotes.length} status={filters.status} onStatus={s => setFilters(f => ({ ...f, status: s }))} />

      <QuotationFilterBar
        filters={filters}
        onChange={setFilters}
        dealers={ALL_DEALERS}
        regions={look.allRegions}
        provinces={look.allProvinces}
      />

      <QuotationAnalytics dealerAgg={dealerAgg} aging={aging} trend={trend} หน่วยเวลา={ละเอียดแท่ง === "month" ? "รายเดือน" : "รายวัน"} leadsByDealer={leadsByDealer} lostReasons={lostReasons} unspecifiedLost={unspecifiedLost} totalLost={totalLost} />

      {/* ตารางเต็มอยู่ท้ายหน้าตามเดิม (ตามที่บอสสั่ง — ไม่แยกแท็บ)
          ความยาวหน้าคุมด้วยกฎอื่นแทน: การ์ดกราฟตรึงความสูง S/M/L + กราฟรายการโชว์ Top N
          supabase = แบ่งหน้าที่ DB (listPage) · local = ทั้งชุด (tableRows) */}
      <QuotationTable rows={displayRows} onView={setViewQ} pagination={pagination} />

      {/* ย้อนการตอบรับแล้ว ตาราง/การ์ด/กราฟ ต้องดึงใหม่เอง (ตารางเทียบรอบ 1: เดิมต้องรีเฟรชหน้าเอง) */}
      {viewQ && <QuotationDrawer quote={drawerSp ? { ...viewQ, salesperson: drawerSp } : viewQ} onClose={() => setViewQ(null)} onChanged={refreshSales} />}
    </div>
  );
}
