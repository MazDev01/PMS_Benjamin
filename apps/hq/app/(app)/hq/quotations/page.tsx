"use client";
import { ช่อง } from "@pms/shared/lib/fieldLabels";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

// ─── HQ · ใบเสนอราคาทั้งเครือ (Network Quotations) ────────────────────────────
// ศูนย์กลางใบเสนอราคาของดีลเลอร์ทุกสาขา — HQ เป็นเจ้าของข้อมูล แต่ "ไม่ออกใบเอง"
// จึงมีแค่ ดู / วิเคราะห์ / เปรียบเทียบ / ส่งออก — ไม่มีปุ่มสร้าง แก้ไข ลบ อนุมัติ
import { useState, useMemo, useEffect } from "react";
import { fmtISOToThai, DEFAULT_DEALER_CODE, type HQQuotation } from "@pms/shared/lib/mock";
import type { QuotationMock } from "@pms/shared/lib/data/types";
import { useQuoteValidityDays } from "@pms/shared/lib/useHQConfig";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useSales } from "@pms/shared/context/SalesContext";
import { dealers as dealersRepo, quotations as quotationsRepo, metrics } from "@pms/shared/lib/data";
import { คีย์ใบ, type ส่วนต่างใบ } from "@pms/shared/lib/hqQuoteMargins";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import type { DealerRow } from "@pms/shared/lib/data/types";
import type { QuoteSummaryFilters, QuoteListOpts } from "@pms/shared/lib/data/ports";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { useNetworkQuotations, useNetworkLeads, useHQQuotationsSummary, useQuotationsPage, useQuotationSalesperson } from "@pms/shared/lib/useNetworkData";
import {
  toQuoteRows, agingBucketOf, regionDisplay, dealerLookups,
  type QuoteRow, type AgingBucket,
} from "@pms/shared/lib/hqQuotations";

const QPAGE_SIZE = 10;
const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const isoDateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
import { หัวเจาะลึก, useเจาะลึก, ในขอบเขต, ขอบเขตทั้งเครือ, ขอบเขตของดีลเลอร์, ป้ายระดับของขอบ, type ขอบเขต } from "../_drill/DrillEngine";
import { คำอธิบายหัวข้อ } from "@pms/shared/lib/drillTitles";
import { ตั้งค่าเจาะลึกทั้งหมด } from "@pms/shared/lib/hqDrillConfig";
import { รวมคีย์, เดือนในช่วง } from "@pms/shared/lib/hqDrill";

// ── เจาะลึกแบบเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69 · ใบ 0271) — การ์ด/คอลัมน์จากตั้งค่ากลาง (แหล่งเดียวกับข้อทดสอบ) ──
const ตั้งค่าใบ = ตั้งค่าเจาะลึกทั้งหมด.quotations;
import { QuotationFilterBar, EMPTY_FILTERS, ชื่อสถานะใบHQ, type QuotationFilters } from "@pms/shared/components/hq/quotations/QuotationFilterBar";
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
  const [ขอบ, setขอบ] = useState<ขอบเขต>(ขอบเขตทั้งเครือ);
  const ช่วง = useMemo(() => ({ start: isoDateOf(timeRange.start), end: isoDateOf(timeRange.end) }), [timeRange.start, timeRange.end]);
  const เจาะลึก = useเจาะลึก("quotations", ช่วง.start, ช่วง.end, isoDateOf(APP_NOW));
  const [viewQ, setViewQ] = useState<QuoteRow | null>(null);

  // อายุใบเสนอราคา = นโยบาย HQ — อ่านผ่าน repo (เดิมอ่าน localStorage ตรง ๆ
  // โหมด supabase เลยได้ค่า default 30 วันเสมอ ไม่ใช่ค่าจริงที่ HQ ตั้งไว้ → วันหมดอายุบนหน้าเพี้ยน)
  const validityDays = useQuoteValidityDays();
  // รายชื่อดีลเลอร์จากทะเบียนจริง (เดิมถอดจากใบเสนอราคา mock → เห็นสาขาที่ไม่มีอยู่จริง)
  // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
  const ALL_DEALERS_FULL = useRepoValue<DealerRow[]>(() => dealersRepo.list().then(l => l.filter(ไม่ใช่แถวHQ)), []);

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
  // ?dealer= → เจาะลงระดับดีลเลอร์นั้น (รอแถวรายดีลเลอร์โหลดก่อน — ภาค/จังหวัดตามดีลเลอร์)
  useEffect(() => {
    if (!pendingDealer || !เจาะลึก) return;
    if (เจาะลึก.dealers.some(d => d.code === pendingDealer)) setขอบ(ขอบเขตของดีลเลอร์(เจาะลึก.dealers, pendingDealer));
    setPendingDealer(null);
  }, [pendingDealer, เจาะลึก]);

  // ภาค/จังหวัดมาจากทะเบียนดีลเลอร์จริง — สาขาที่ HQ เพิ่งเพิ่มต้องโผล่ในตัวกรองด้วย
  const look = useMemo(() => dealerLookups(ALL_DEALERS_FULL), [ALL_DEALERS_FULL]);
  const allRows = useMemo(() => toQuoteRows(netQuotes, validityDays, look), [netQuotes, validityDays, look]);

  // ตัวกรอง/กราฟ/คอลัมน์ส่งออก "ประเภทอาคาร" (แม่แบบ) ถอดออกทั้งหมด — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
  //   ไม่ส่ง productLines ให้ฐานข้อมูลแล้ว (byProduct ที่ RPC ยังส่งมา = ไม่ใช้)

  // ตัวกรองทุกตัว "ยกเว้นช่วงเวลา" — กราฟแนวโน้ม 12 เดือนใช้ชุดนี้ (ถ้าอิงช่วงเวลาจะว่าง 11 ช่อง)
  // ชุดดีลเลอร์ของระดับที่เลือก (ทั้งเครือ = ไม่กรอง) — ตาราง/กราฟด้านล่างคิดตามระดับนี้
  const ชุดดีลเลอร์ = useMemo<string[] | undefined>(() => ขอบ.ภาค || ขอบ.จังหวัด || ขอบ.ดีลเลอร์
    ? ในขอบเขต(เจาะลึก?.dealers ?? [], ขอบ).map(r => r.code) : undefined, [เจาะลึก, ขอบ]);
  // ป้ายระดับที่เลือก สำหรับหัวข้อกราฟ/ตาราง (บอสสั่ง 3 พ.ย. 69)
  const ป้ายระดับที่เลือก = ป้ายระดับของขอบ(ขอบ, เจาะลึก?.dealers ?? []);
  const matchesNonTime = useMemo(() => (r: QuoteRow) => {
    if (ชุดดีลเลอร์ && !ชุดดีลเลอร์.includes(r.dealerCode)) return false;
    // "sent" (ค่าเริ่มต้น) = ไม่นับร่าง/ถูกแทนที่ — ชุดเดียวกับการ์ด "ส่งลูกค้าในช่วงนี้" (บอสสั่ง 30 ต.ค. 69)
    if (filters.status === "sent" ? (r.status === "draft" || r.status === "superseded") : filters.status !== "all" && r.status !== filters.status) return false;
    if (filters.search.trim()) {
      const s = filters.search.trim().toLowerCase();
      const hay = `${r.quoteNo} ${r.customer} ${r.dealerName} ${r.dealerCode}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  }, [filters, ชุดดีลเลอร์]);

  const trendRows = useMemo(() => allRows.filter(matchesNonTime), [allRows, matchesNonTime]);
  const rows = useMemo(() => trendRows.filter(r => inRange(r.createdAt)), [trendRows, inRange]);

  // ใบที่ออกล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69 — ตรงกับทางต่อฐานที่เรียง created_at) · เลขที่ใบรันตามลำดับที่ออก
  const tableRows = useMemo(() => [...rows].sort((a, b) =>
    b.quoteNo.localeCompare(a.quoteNo, "en", { numeric: true })), [rows]);

  // ── M9 Phase 2: resolve derived filter → คอลัมน์จริง ให้ DB รวมยอด/แบ่งหน้าได้ ──
  const nameOf = useMemo(() => new Map(ALL_DEALERS_FULL.map(d => [d.code, d.name])), [ALL_DEALERS_FULL]);
  const resolvedDealerCodes = ชุดดีลเลอร์;
  const search = filters.search.trim();
  const searchDealers = useMemo<string[] | undefined>(() => {
    if (!search) return undefined;
    const s = search.toLowerCase();
    return ALL_DEALERS_FULL.filter(d => d.name.toLowerCase().includes(s) || d.code.toLowerCase().includes(s)).map(d => d.code);
  }, [search, ALL_DEALERS_FULL]);

  const status = filters.status === "all" || filters.status === "sent" ? undefined : filters.status;
  const sentOnly = filters.status === "sent";
  // ตาราง = ระดับที่เลือก + คำค้น + สถานะ + ช่วง
  const baseFilters: QuoteSummaryFilters = { dealerCodes: resolvedDealerCodes, search: search || undefined, searchDealers, asOf: isoDateOf(APP_NOW) };
  const qFilters = { ...baseFilters, status, sentOnly, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end) };   // ตาราง (ช่วง + สถานะ)
  // กราฟ = ระดับที่เลือกเท่านั้น (ไม่ขึ้นกับคำค้น/สถานะของรายการ) → รวมกราฟ = การ์ด
  //   อายุใบที่รอลูกค้าตอบ = ณ ตอนนี้ (รวม = การ์ดรอลูกค้าตอบ) · รายเดือน = แถวรายดีลเลอร์รายเดือนชุดเดียวกับการ์ด (hq_drill)
  const nowSummary = useHQQuotationsSummary({ dealerCodes: resolvedDealerCodes, asOf: isoDateOf(APP_NOW) });
  const รายเดือน = useMemo(() => {
    if (!เจาะลึก) return null;
    const codes = new Set(ในขอบเขต(เจาะลึก.dealers, ขอบ).map(r => r.code));
    const ms = เจาะลึก.months.filter(m => codes.has(m.code));
    const ช่อง = เดือนในช่วง(ช่วง.start, ช่วง.end);
    const ของ = (y: number, m: number, k: string) => รวมคีย์(ms.filter(x => x.y === y && x.m === m), k);
    return { months: ช่อง.map(c => `${TH_MONTH[c.m]} ${String(c.y + 543).slice(2)}`), sent: ช่อง.map(c => ของ(c.y, c.m, "sent")), won: ช่อง.map(c => ของ(c.y, c.m, "won")) };
  }, [เจาะลึก, ขอบ, ช่วง.start, ช่วง.end]);

  const aging = useMemo(() => {
    if (nowSummary) return nowSummary.aging.map(a => ({ key: a.bucket as AgingBucket, count: a.count, value: a.value }));
    const m = new Map<AgingBucket, { count: number; value: number }>();
    trendRows.filter(r => r.pending && r.agingDays != null).forEach(r => { const k = agingBucketOf(r.agingDays!); const x = m.get(k) ?? { count: 0, value: 0 }; x.count += 1; x.value += r.valueNum; m.set(k, x); });
    return [...m.entries()].map(([key, x]) => ({ key, ...x }));
  }, [nowSummary, trendRows]);

  // ตาราง: supabase = แบ่งหน้าที่ DB (listPage) · local/ยังไม่กลับ = tableRows (client, ทั้งชุด)
  const [tablePage, setTablePage] = useState(0);
  const tableKey = JSON.stringify(qFilters);
  useEffect(() => { setTablePage(0); }, [tableKey]); // เปลี่ยนตัวกรอง → กลับหน้า 1
  const listOpts = useMemo<QuoteListOpts>(() => ({
    limit: QPAGE_SIZE, offset: tablePage * QPAGE_SIZE, sort: { col: "created_at", dir: "desc" }, // ใบที่สร้างล่าสุดก่อน (บอสสั่ง 21 ก.ย. 69) — date เปลี่ยนทุกครั้งที่ส่ง
    status, sentOnly, dealerCodes: resolvedDealerCodes, search: search || undefined, searchDealers,
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
      salesperson: lead?.assigned ?? `ดีลเลอร์ ${nameOf.get(code) ?? code}`, siteProvince: lead?.province || undefined, productLine: q.project || "",
      materialCost: q.materialCost, lineItems: q.lineItems,
      // หน้าต่างใบเสนอราคา (แถบสรุป/กล่องยอดรวม) — ชุดเดียวกับ useNetworkQuotations
      dateISO: q.date, expiry: q.expiry, revision: q.revision, vatPercent: q.vatPercent, whtRate: q.whtRate, province: q.province || undefined,
    };
  };
  // mapToHQ ปิดคลุม netLeads/nameOf — ขาดไปก่อนหน้านี้ทำให้ชื่อผู้รับผิดชอบค้างค่าเก่าถ้าลูกค้าเป้าหมาย/ทะเบียนดีลเลอร์
  // เปลี่ยนผ่าน realtime โดย pageResult reference เดิม (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
  // local ต้องตัดเป็นหน้า ๆ ที่ client ด้วย — ไม่งั้นแถบเปลี่ยนหน้าบอก "หน้า 1/9" แต่ตารางเทมาทั้ง 9 หน้า
  const localPageCount = Math.max(1, Math.ceil(tableRows.length / QPAGE_SIZE));
  const localPage = Math.min(tablePage, localPageCount - 1);
  const displayRows = useMemo(() => pageResult ? toQuoteRows(pageResult.rows.map(mapToHQ), validityDays, look) : pageSlice(tableRows, localPage, QPAGE_SIZE), [pageResult, tableRows, localPage, validityDays, look, netLeads, nameOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalRows = pageResult ? pageResult.total : tableRows.length;
  // ส่วนต่างรายใบของแถวในหน้านี้ (บอสสั่ง 2 พ.ย. 69 · ใบ 0272) — คิดที่ฐาน · ขอทีละหน้า
  const คีย์หน้า = JSON.stringify(displayRows.map(r => [r.dealerCode, r.quoteNo]));
  const [ส่วนต่าง, setส่วนต่าง] = useState<Map<string, ส่วนต่างใบ> | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setส่วนต่าง(undefined);
    metrics.hqQuoteMargins(displayRows.map(r => ({ dealer: r.dealerCode, id: r.quoteNo })))
      .then(l => alive && setส่วนต่าง(new Map(l.map(m => [คีย์ใบ(m.dealer, m.id), m]))))
      .catch(e => { logRepoRead("metrics.hqQuoteMargins", e); if (alive) setส่วนต่าง(new Map()); });
    return () => { alive = false; };
  }, [คีย์หน้า]); // eslint-disable-line react-hooks/exhaustive-deps
  const pagination = { page: pageResult ? tablePage : localPage, pageCount: Math.max(1, Math.ceil(totalRows / QPAGE_SIZE)), total: totalRows, onPage: setTablePage };

  // ผู้รับผิดชอบใบใน drawer — supabase (แถวมาจาก listPage) เดิมได้ placeholder → เติมชื่อจริงจากลูกค้าเป้าหมายผ่าน RPC
  //   local (ไม่มี pageResult) = viewQ.salesperson มาจาก array จริงอยู่แล้ว → hook คืน null ไม่ทับ
  // ต้องระบุสาขาของใบที่เปิดอยู่ — ไม่งั้นอาจได้ชื่อพนักงานของสาขาอื่นที่เลขที่ใบตรงกัน
  const drawerSp = useQuotationSalesperson(viewQ && pageResult ? viewQ.quoteNo : null, viewQ?.dealerCode ?? null);

  // Export — หนึ่งแถวต่อใบ · supabase: ดึงทั้งชุดที่กรองจาก DB ตอนกด · local: จาก tableRows (ทั้งชุดอยู่แล้ว)
  const quoteToCells = (q: QuoteRow) => [
    q.quoteNo, q.dealerCode, q.dealerName, q.customer, q.siteProvince || "—", regionDisplay(q.region),
    q.valueNum, ชื่อสถานะใบHQ[q.status], q.status === "draft" ? "—" : q.createdAt, q.validUntil ?? "—", q.agingDays ?? "—",
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
            headers={["เลขที่", "รหัสดีลเลอร์", "ดีลเลอร์", "ลูกค้า", ช่อง.จังหวัด, "ภูมิภาค (ดีลเลอร์)", "มูลค่า ก่อน VAT (บาท)", "สถานะ", "วันที่ส่ง", "ยืนราคาถึง", "อายุใบ (วัน)"]}
            rows={tableRows.map(quoteToCells)}
            getRows={exportGetRows}
          />
      </TopbarActions>

      {/* ── เจาะลึก: ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ › เดือน (บอสสั่ง 2 พ.ย. 69) · ทุกส่วนคิดตามระดับที่เลือก · แถวรวม = การ์ด ── */}
      <หัวเจาะลึก ตั้งค่า={ตั้งค่าใบ} ข้อมูล={เจาะลึก} ขอบ={ขอบ} ตั้งขอบ={setขอบ} ช่วง={ช่วง} ชื่อแถวการ์ด="สรุปใบเสนอราคาทั้งเครือ" />

      <div style={{ marginTop: 16 }}><QuotationAnalytics aging={aging} รายเดือน={รายเดือน} ระดับ={ป้ายระดับที่เลือก} ช่วง={ช่วง} /></div>

      <QuotationFilterBar filters={filters} onChange={setFilters} />

      {/* ตารางเต็มอยู่ท้ายหน้าตามเดิม (ตามที่บอสสั่ง — ไม่แยกแท็บ)
          ความยาวหน้าคุมด้วยกฎอื่นแทน: การ์ดกราฟตรึงความสูง S/M/L + กราฟรายการโชว์ Top N
          supabase = แบ่งหน้าที่ DB (listPage) · local = ทั้งชุด (tableRows) */}
      <QuotationTable rows={displayRows} onView={setViewQ} pagination={pagination} margins={ส่วนต่าง} ระดับ={{ ภาค: ขอบ.ภาค, จังหวัด: ขอบ.จังหวัด, ดีลเลอร์: ขอบ.ดีลเลอร์ }}
        หัวข้อ={{ ชื่อ: `ตารางรายการใบเสนอราคา · ${ป้ายระดับที่เลือก}`, คำอธิบาย: คำอธิบายหัวข้อ(ช่วง, "ตามสถานะและคำค้นด้านบน", "ใหม่สุดก่อน", "กดแถวเพื่อเปิดใบ") }} />

      {/* ย้อนการตอบรับแล้ว ตาราง/การ์ด/กราฟ ต้องดึงใหม่เอง (ตารางเทียบรอบ 1: เดิมต้องรีเฟรชหน้าเอง) */}
      {viewQ && <QuotationDrawer quote={drawerSp ? { ...viewQ, salesperson: drawerSp } : viewQ} onClose={() => setViewQ(null)} onChanged={refreshSales} />}
    </div>
  );
}
