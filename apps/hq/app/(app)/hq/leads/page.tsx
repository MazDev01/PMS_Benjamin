"use client";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

// ─── HQ · ลูกค้าเป้าหมายทั้งเครือ (Network Leads) ──────────────────────────────
// ภาพรวมลูกค้าเป้าหมายของทุกดีลเลอร์ · กรอง (ค้นหา/สถานะ/จังหวัด/ช่วงเวลา) · KPI · กราฟ · ตาราง drill-down
// ใช้ข้อมูลจริงจาก SalesContext (leads) — HQ ดูอย่างเดียว (Sales CRM เท่านั้น)
import { useMemo, useState, useEffect, useRef } from "react";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { TopNRows } from "@pms/shared/components/hq/TopNRows";
import { TablePagination, pageSlice, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { useRouter } from "next/navigation";
import {
  Users, PhoneCall, AlarmClock, Percent, X, GitBranch, Eye,
  User, Phone, Mail, MapPin, Building2, Compass, Wallet, CalendarDays,
  Store, IdCard, UserCheck, FileText, Activity, CalendarClock, Paperclip, StickyNote, Lock, AlertTriangle,
} from "lucide-react";
import { useNetworkLeads, useNetworkQuotations, useLeadSummary, useLeadsPage, useNetworkQuoteRange, useUnassignedLeads, useDashboardQuoteSummary, useLeadAppointments } from "@pms/shared/lib/useNetworkData";
import type { LeadSummaryFilters, LeadListOpts } from "@pms/shared/lib/data/ports";
import { DEFAULT_LEAD_RULES } from "@pms/shared/lib/mock";
import { useLeadRulesOf } from "@pms/shared/lib/useHQRules";
import { unassignedLeads } from "@pms/shared/lib/hqAlerts";
import { lastContactLabel, needsFollowUp } from "@pms/shared/lib/leadMetrics";
import { fmtISOToThai, type LeadRow } from "@pms/shared/lib/mock";
// ชิ้นส่วนกลางของแผงรายละเอียด — หน้าตาเดียวกันทุกหน้า (ห้ามประกาศสไตล์เองซ้ำ)
import { PanelSection, PanelRow, PanelStats, PanelStat, ย่อชื่อ } from "@pms/shared/components/ui/DetailPanel";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { dealers as dealersRepo, leads as leadsRepo } from "@pms/shared/lib/data";
import type { DealerRow } from "@pms/shared/lib/data/types";
import { regionDisplay } from "@pms/shared/lib/hqQuotations";  // แหล่งเดียวของชื่อภาค — ไม่ก็อปโค้ดซ้ำ
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useSales } from "@pms/shared/context/SalesContext";
import { DEALER_FILES_EVENT, type DealerFile } from "@pms/shared/lib/mock";
import { files as filesRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { ความละเอียดของช่วง, ช่องเวลาในช่วง, คีย์ช่อง, type ความละเอียด } from "@pms/shared/lib/trendBuckets";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { GroupedBarChart, Donut } from "@pms/shared/components/ui/Charts";
import {
  MonthRangeToggle, lastNMonths, monthRangeSubtitle, monthKeyOf, monthKey,
  type MonthRange,
} from "@pms/shared/components/ui/MonthRangeToggle";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { leadStatusLabel, leadStatusColor, QUOTED_UP, LEAD_STATUS_ORDER, type LeadStatus } from "@pms/shared/lib/mock";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { fmtBaht, pctOrNull, parseBaht, fmtFull, formatPhone } from "@pms/shared/lib/format";
import { groupLostReasons, withUnspecified } from "@pms/shared/lib/lostReasons";

// ── ตัวเลขและเบอร์โทรบนหน้าสำนักงานใหญ่ ต้องอ่านง่ายเหมือนฝั่งดีลเลอร์ (บอสสั่ง 21 ส.ค. 69) ──
//   มูลค่าเก็บเป็นข้อความอิสระ ("5310000" / "฿1.4M" / เว้นว่าง) — แปลงเป็นตัวเลขก่อนแล้วค่อยใส่ลูกน้ำ
//   ⚠️ อ่านค่าไม่ออก = คืนข้อความเดิม ห้ามกลายเป็น ฿0 (กติกาเดิมของทั้งระบบ)
const มูลค่าอ่านง่าย = (v?: string) => {
  const ดิบ = String(v ?? "").trim();
  if (!ดิบ) return "—";
  const n = parseBaht(ดิบ);
  return n > 0 ? fmtFull(n) : ดิบ;
};
const เบอร์อ่านง่าย = (v?: string) => formatPhone(String(v ?? "")) || "—";

const PRIMARY = "#003366";
// 8 สี — โดนัท "ตามแหล่งที่มา" มีได้ถึง 8 ชิ้น ถ้าสีวนซ้ำจะอ่านผิดว่าเป็นชิ้นเดียวกัน
const RAMP = ["#003366", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0f766e", "#b45309"];
// โทนแดง-ส้ม สำหรับ "เหตุผลที่ปิดการขายไม่สำเร็จ" — คงความหมายเดิม (แท่งเคยเป็นสีแดงทั้งหมด)
const LOST_RAMP = ["#dc2626", "#ea580c", "#d97706", "#b45309", "#9f1239", "#7c2d12"];
const TH_MONTH: Record<string, number> = { "ม.ค.": 0, "ก.พ.": 1, "มี.ค.": 2, "เม.ย.": 3, "พ.ค.": 4, "มิ.ย.": 5, "ก.ค.": 6, "ส.ค.": 7, "ก.ย.": 8, "ต.ค.": 9, "พ.ย.": 10, "ธ.ค.": 11 };
const TH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const parseThaiDate = (s: string): Date | null => {
  const mt = /^(\d{1,2})\s+(\S+)\s+(\d{4})/.exec((s ?? "").trim());
  if (!mt || !(mt[2] in TH_MONTH)) return null;
  const y = +mt[3] > 2500 ? +mt[3] - 543 : +mt[3];
  return new Date(y, TH_MONTH[mt[2]], +mt[1]);
};
const isoDateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// ช่วงกว้างคงที่สำหรับสรุปใบรายเดือน (กราฟแนวโน้มลูกค้าเป้าหมาย) — อ้างอิงคงที่ กัน hook รีเฟตช์
const TREND_QUOTE_START = new Date(2000, 0, 1);
const TREND_QUOTE_END = new Date(2999, 11, 31);
// "ต้องติดตาม" = ลูกค้าเป้าหมายที่ยังไม่ปิด และเงียบเกินเกณฑ์ของสาขาเจ้าของลูกค้าเป้าหมาย (needsFollowUp)
// ⚠️ ห้ามกลับไปใช้รายการสถานะ: เดิมเป็น ["WAITING","FOLLOWUP"] ซึ่งไม่ได้นับวันเลย
//    แต่ป้ายเขียนว่า ">7 วัน" → ตัวเลขไม่ตรงกับคำ และไม่ตรงกับที่ดีลเลอร์เห็นบนหน้าตัวเอง
//    เกณฑ์วันเป็นของแต่ละสาขา (ดีลเลอร์ตั้งเอง) → ต้องถามด้วย dealerCode ของลูกค้าเป้าหมายใบนั้นเสมอ


export default function HQLeadsPage() {
  const router = useRouter();
  const { timeRange } = useFilters();
  const ละเอียดของหน้า = ความละเอียดของช่วง(timeRange.start, timeRange.end);
  const leads = useNetworkLeads();
  // เกณฑ์เป็นของแต่ละสาขา (ดีลเลอร์ตั้งเองที่ ตั้งค่า › การแจ้งเตือน) → ถามเป็นรายใบด้วย dealerCode
  const rulesOf = useLeadRulesOf();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LeadStatus | "ALL">("ALL");
  const [province, setProvince] = useState<string>("ALL");
  const [viewLead, setViewLead] = useState<LeadRow | null>(null);  // Drawer — ดูอย่างเดียว
  const [dealerSel, setDealerSel] = useState<string>("ALL");
  const [regionSel, setRegionSel] = useState<string>("ALL");
  const [btSel, setBtSel] = useState<string>("ALL");
  const [srcSel, setSrcSel] = useState<string>("ALL");

  // ลูกค้าเป้าหมายในช่วงเวลาที่เลือก (ตาม createdAt) — แหล่งเดียวของทั้งหน้า
  const scoped = useMemo(() => leads.filter(l => {
    const d = parseThaiDate(l.createdAt ?? "");
    return !d || (d >= timeRange.start && d <= timeRange.end);
  }), [leads, timeRange.start, timeRange.end]);

  // นัดหมาย + ไฟล์ — ใช้แสดงใน Drawer เท่านั้น (HQ ดูอย่างเดียว)
  // นัดหมายผูกด้วย leadId · ไฟล์ผูกด้วย source="lead" + recordId — ทั้งคู่คือ numId ของลูกค้าเป้าหมาย
  const { appointments } = useSales();
  // นัดหมายของลูกค้าเป้าหมายที่กำลังเปิด drawer — supabase: ดึงตรง (M9 Phase 4) · local/ยังไม่กลับ: กรอง appointments array เดิม
  // เลขลูกค้าเป้าหมาย (numId) ซ้ำกันได้ข้ามสาขา — ต้องระบุสาขาของลูกค้าเป้าหมายที่เปิดอยู่ ไม่งั้นนัดหมายของสาขาอื่นจะปนเข้ามา
  const drawerAppts = useLeadAppointments(viewLead?.numId ?? null, viewLead?.dealerCode ?? null);
  const [dealerFiles, setDealerFiles] = useState<DealerFile[]>([]);
  // request token กันผลลัพธ์เก่าทับใหม่ — read ถูกยิงซ้ำได้ทุกครั้งที่มีการอัปโหลด/ลบไฟล์ทั้งเครือ
  const dealerFilesReqRef = useRef(0);
  useEffect(() => {
    const read = () => {
      const myReq = ++dealerFilesReqRef.current;
      filesRepo.list({ isHQ: true }).then(r => { if (dealerFilesReqRef.current === myReq) setDealerFiles(r); }).catch(e => logRepoRead("files.list", e)); // HQ เห็นไฟล์ทั้งเครือ
    };
    read();
    window.addEventListener(DEALER_FILES_EVENT, read);
    return () => window.removeEventListener(DEALER_FILES_EVENT, read);
  }, []);

  // ภาค/ชื่อของดีลเลอร์ — จากทะเบียนดีลเลอร์จริง (เดิมอ่านจากชุด seed → โหมด supabase ได้ภาคของสาขาที่ไม่มีอยู่จริง)
  const allDealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  const REGION_OF = useMemo(() => new Map(allDealers.map(d => [d.code, d.region])), [allDealers]);

  // ตัวเลือกตัวกรอง — จากลูกค้าเป้าหมายจริงในช่วง (ไม่ hardcode) · supabase: lead_summary (เวลาอย่างเดียว) · local/ยังไม่กลับ: scoped
  const optsSummary = useLeadSummary(useMemo(() => ({ dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end) }), [timeRange.start, timeRange.end]));
  const dealerOpts = useMemo(() => (optsSummary
    ? [...new Set(optsSummary.byDealer.map(d => d.dealerCode))]
    : [...new Set(scoped.map(l => l.dealerCode).filter(Boolean))] as string[]).sort(), [optsSummary, scoped]);
  const regionOpts = useMemo(() => (optsSummary
    ? [...new Set(optsSummary.byDealer.map(d => REGION_OF.get(d.dealerCode)).filter(Boolean))]
    : [...new Set(scoped.map(l => REGION_OF.get(dealerCodeOf(l))).filter(Boolean))]).sort() as string[], [optsSummary, scoped, REGION_OF]);
  const btOpts = useMemo(() => (optsSummary
    ? optsSummary.byProduct.map(p => p.product).filter(p => p !== "ไม่ระบุ")
    : [...new Set(scoped.map(l => l.product).filter(Boolean))]).sort((a, b) => a.localeCompare(b, "th")), [optsSummary, scoped]);
  const srcOpts = useMemo(() => (optsSummary
    ? optsSummary.bySource.map(s => s.source)
    : [...new Set(scoped.map(l => l.source || "ไม่ระบุ"))]).sort((a, b) => a.localeCompare(b, "th")), [optsSummary, scoped]);
  const provinces = useMemo(() => (optsSummary
    ? optsSummary.byProvince.map(p => p.province)
    : [...new Set(scoped.map(l => l.province).filter(Boolean))]).sort(), [optsSummary, scoped]);

  // ฐานของ KPI = ตัวกรอง "ขอบเขต" ทุกตัว (ดีลเลอร์ · ภูมิภาค · จังหวัด · ประเภทอาคาร · แหล่งที่มา · ค้นหา)
  // แต่ยังไม่กรองด้วย "สถานะ" และ "ต้องติดตามด่วน" — สองอันนั้นคือปุ่มของการ์ด KPI เอง
  // ถ้า KPI ตามสองอันนั้นด้วย ตัวเลขจะยุบเหลือค่าเดียวทันทีที่กด การ์ดจะไร้ความหมาย
  const kpiBase = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter(l =>
      (province === "ALL" || l.province === province) &&
      (dealerSel === "ALL" || l.dealerCode === dealerSel) &&
      (regionSel === "ALL" || REGION_OF.get(dealerCodeOf(l)) === regionSel) &&
      (btSel === "ALL" || l.product === btSel) &&
      (srcSel === "ALL" || (l.source || "ไม่ระบุ") === srcSel) &&
      (!q || (l.company + l.contact + l.province + l.product + l.assigned + (l.id ?? "") + (l.dealerCode ?? "")).toLowerCase().includes(q))
    );
  }, [scoped, query, province, dealerSel, regionSel, btSel, srcSel, REGION_OF]);

  const filtered = useMemo(() => kpiBase.filter(l =>
    (status === "ALL" || l.status === status) &&
    (!overdueOnly || needsFollowUp(l, rulesOf(l.dealerCode).followUpAlertDays))
  ), [kpiBase, status, overdueOnly, rulesOf]);

  // ── M9 Phase 2: สรุปลูกค้าเป้าหมายหลังกรองที่ DB (supabase) · local/overdue/ระหว่างโหลด = client fallback ──
  const leadDealerCodes = useMemo<string[] | undefined>(() => {
    let codes: string[] | undefined;
    const restrict = (pred: (c: string) => boolean) => { codes = (codes ?? allDealers.map(d => d.code)).filter(pred); };
    if (dealerSel !== "ALL") restrict(c => c === dealerSel);
    if (regionSel !== "ALL") restrict(c => REGION_OF.get(c) === regionSel);
    return codes;
  }, [dealerSel, regionSel, allDealers, REGION_OF]);
  const baseF: LeadSummaryFilters = {
    dealerCodes: leadDealerCodes, province: province === "ALL" ? undefined : province,
    product: btSel === "ALL" ? undefined : btSel, source: srcSel === "ALL" ? undefined : srcSel,
    search: query.trim() || undefined, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
  };
  const sumBase = useLeadSummary(baseF);                                              // KPI (kpiBase — ไม่กรอง status/overdue)
  const sumCharts = useLeadSummary({ ...baseF, status: status === "ALL" ? undefined : status }); // กราฟ (filtered)
  const chartSummary = overdueOnly ? null : sumCharts;                               // overdue → client (พึ่ง last_contact + เกณฑ์)

  // ── ตารางลูกค้าเป้าหมาย: แบ่งหน้าที่ DB (M9 Phase 4) · local/ยังไม่กลับ = filtered (client) ──
  // 10 แถว/หน้าเท่าทุกตารางในระบบ (บอสสั่ง 13 ส.ค. 69 — เดิมหน้านี้ 25 อยู่หน้าเดียวที่ไม่เหมือนใคร)
  const LEADS_PAGE = ROWS_PER_PAGE;
  const [leadPage, setLeadPage] = useState(0);
  const perDealerDays = useMemo(() => Object.fromEntries(allDealers.map(d => [d.code, rulesOf(d.code).followUpAlertDays])), [allDealers, rulesOf]);
  const leadOpts: LeadListOpts = useMemo(() => ({
    limit: LEADS_PAGE, offset: leadPage * LEADS_PAGE,
    status: status === "ALL" ? undefined : status, dealerCodes: leadDealerCodes,
    province: province === "ALL" ? undefined : province, product: btSel === "ALL" ? undefined : btSel,
    source: srcSel === "ALL" ? undefined : srcSel, search: query.trim() || undefined,
    dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
    overdue: overdueOnly, asOf: isoDateOf(APP_NOW), defaultDays: DEFAULT_LEAD_RULES.followUpAlertDays, perDealer: perDealerDays,
  }), [leadPage, status, leadDealerCodes, province, btSel, srcSel, query, timeRange.start, timeRange.end, overdueOnly, perDealerDays]);
  const leadsPage = useLeadsPage(leadOpts);
  const leadTableKey = JSON.stringify({ ...leadOpts, offset: 0 });
  useEffect(() => { setLeadPage(0); }, [leadTableKey]); // เปลี่ยนตัวกรอง → หน้า 1
  // local ต้องตัดเป็นหน้า ๆ ที่ client ด้วย — ไม่งั้นแถบบอกเลขหน้าแต่ตารางเทมาทั้งชุด
  const localLeadPage = Math.min(leadPage, Math.max(1, Math.ceil(filtered.length / LEADS_PAGE)) - 1);
  const displayLeads = leadsPage?.rows ?? pageSlice(filtered, localLeadPage, LEADS_PAGE);
  const leadTotal = leadsPage ? leadsPage.total : filtered.length;
  const leadPagination = { page: leadsPage ? leadPage : localLeadPage, total: leadTotal, onPage: setLeadPage };

  // จำนวน "ต้องติดตามด่วน" (ในขอบเขต kpiBase, ไม่กรอง status) ที่ DB — overdue=true, นับรวม (limit 1 พอ)
  //   supabase: leads_page.total · local/ยังไม่กลับ: นับจาก kpiBase ฝั่ง client
  const followUpOpts: LeadListOpts = useMemo(() => ({
    limit: 1, offset: 0, dealerCodes: leadDealerCodes,
    province: province === "ALL" ? undefined : province, product: btSel === "ALL" ? undefined : btSel,
    source: srcSel === "ALL" ? undefined : srcSel, search: query.trim() || undefined,
    dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
    overdue: true, asOf: isoDateOf(APP_NOW), defaultDays: DEFAULT_LEAD_RULES.followUpAlertDays, perDealer: perDealerDays,
  }), [leadDealerCodes, province, btSel, srcSel, query, timeRange.start, timeRange.end, perDealerDays]);
  const followUpPage = useLeadsPage(followUpOpts);

  // ── เตือน: ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบนานเกินเกณฑ์ (กฎธุรกิจ HQ · ค่าเริ่มต้น 48 ชม.) ──
  // ตอนนี้ลูกค้าเป้าหมายทุกใบมีผู้รับผิดชอบ → ขึ้น 0 ซึ่งเป็นความจริง · ตรรกะพร้อมใช้ พอมีลูกค้าเป้าหมาย assigned ว่างเกินเกณฑ์ การ์ดจะเด้ง
  // อิงขอบเขต kpiBase (ดีลเลอร์/ภาค/จังหวัด/แม่แบบ/แหล่ง/ค้นหา + ช่วงเวลา) — ไม่ผูกสถานะ (เตือนไร้ผู้รับผิดชอบ ไม่เกี่ยวสถานะ)
  const perDealerHours = useMemo(() => Object.fromEntries(allDealers.map(d => [d.code, rulesOf(d.code).unassignedAlertHours])), [allDealers, rulesOf]);
  const unassignedSummary = useUnassignedLeads(useMemo(() => ({
    asOf: isoDateOf(APP_NOW), defaultHours: DEFAULT_LEAD_RULES.unassignedAlertHours, perDealer: perDealerHours,
    dealerCodes: leadDealerCodes, province: province === "ALL" ? undefined : province,
    product: btSel === "ALL" ? undefined : btSel, source: srcSel === "ALL" ? undefined : srcSel,
    search: query.trim() || undefined, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
  }), [perDealerHours, leadDealerCodes, province, btSel, srcSel, query, timeRange.start, timeRange.end]));
  const unassignedClient = useMemo(() => unassignedLeads(kpiBase, rulesOf), [kpiBase, rulesOf]);
  const unassignedCount = unassignedSummary ? unassignedSummary.total : unassignedClient.length;
  // ป้ายบอกเกณฑ์ — หน้านี้รวมหลายสาขาที่ตั้งเกณฑ์ต่างกันได้ จึงสรุปเป็นช่วงเมื่อไม่เท่ากัน
  const unassignedHoursText = useMemo(() => {
    const codes = unassignedSummary ? unassignedSummary.byDealer.map(d => d.dealerCode) : unassignedClient.map(dealerCodeOf);
    const hrs = [...new Set(codes.map(c => rulesOf(c).unassignedAlertHours))].sort((a, b) => a - b);
    if (!hrs.length) return "—";
    return hrs.length === 1 ? `เกิน ${hrs[0]} ชั่วโมง` : `เกิน ${hrs[0]}–${hrs[hrs.length - 1]} ชั่วโมง แล้วแต่สาขา`;
  }, [unassignedSummary, unassignedClient, rulesOf]);

  // ── แถบตัวกรอง — รูปแบบเดียวกับ /hq/pipeline (ดรอปดาวน์กว้างตามข้อความ ไม่ตรึง 150px) ──
  // ปุ่ม "ล้างตัวกรอง" โผล่เมื่อมีตัวกรองทำงานอยู่จริงเท่านั้น — ไม่งั้นเป็นปุ่มที่กดแล้วไม่เกิดอะไร
  // ทุกช่องอยู่บรรทัดเดียว: แชร์ความกว้างเท่า ๆ กัน (flex:1) แล้วย่อได้เมื่อจอแคบ
  // ห้ามใช้ width:"auto" — select จะกว้างตามตัวเลือกที่ยาวที่สุด ("D-001 – ชื่อบริษัทเต็ม") แล้วดันจนตกบรรทัด
  const leadSel = (v: string, on: (x: string) => void, caption: string, opts: { v: string; l: string }[]) => (
    <select aria-label={caption} value={v} onChange={e => on(e.target.value)} className="form-input"
      style={{ flex: "1 1 0", minWidth: 96, maxWidth: 180, padding: "7px 10px", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer", textOverflow: "ellipsis" }}>
      <option value="ALL">{caption}</option>
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const anyFilter = !!query.trim() || [status, province, dealerSel, regionSel, btSel, srcSel].some(v => v !== "ALL");

  // KPI — คิดจาก kpiBase (ตามตัวกรองขอบเขต) ไม่ใช่ scoped (ทั้งเครือ)
  // เดิมคิดจาก scoped → กรองเหลือดีลเลอร์เดียว ตารางหด 25→7 แถว แต่ KPI นิ่งที่ 61/24/42% คนอ่านเข้าใจผิด
  const kpis = useMemo(() => {
    const followUp = followUpPage ? followUpPage.total : kpiBase.filter(l => needsFollowUp(l, rulesOf(l.dealerCode).followUpAlertDays)).length; // supabase: leads_page overdue · local: client
    const lastM = timeRange.end.getMonth();
    if (sumBase) { // supabase: total/won/lost/newThis จาก DB
      const byS = new Map(sumBase.byStatus.map(r => [r.status, r.count]));
      const total = sumBase.byStatus.reduce((s, r) => s + r.count, 0);
      const won = byS.get("PAID") ?? 0, lost = byS.get("CANCELLED") ?? 0, closed = won + lost;
      const newThis = sumBase.byMonth.filter(r => r.m === lastM).reduce((s, r) => s + r.created, 0);
      return { total, followUp, newThis, conv: pctOrNull(won, closed) };
    }
    const total = kpiBase.length;
    const won = kpiBase.filter(l => l.status === "PAID").length;
    const lost = kpiBase.filter(l => l.status === "CANCELLED").length;
    const closed = won + lost;
    const newThis = kpiBase.filter(l => { const d = parseThaiDate(l.createdAt ?? ""); return d && d.getMonth() === lastM; }).length;
    return { total, followUp, newThis, conv: pctOrNull(won, closed) };
  }, [sumBase, followUpPage, kpiBase, timeRange.end, rulesOf]);

  // ── Section 1 · ลูกค้าเป้าหมาย เทียบ ใบเสนอราคา รายดีลเลอร์ ─────────────────────────────
  // สาขาไหนรับลูกค้าเป้าหมายเยอะแต่ออกใบเสนอราคาน้อย = จุดที่ผู้บริหารต้องเร่ง
  //
  // อัตราแปลง = ลูกค้าเป้าหมายที่ไปถึงขั้น "เสนอราคา" ขึ้นไป ÷ ลูกค้าเป้าหมายทั้งหมด
  // ตั้งใจไม่ใช้ "จำนวนใบเสนอราคา ÷ จำนวนลูกค้าเป้าหมาย" เพราะผิดความจริง 2 ทาง:
  //   1) ลูกค้าเป้าหมาย 1 ใบออกใบเสนอราคาได้หลายใบ (revision/เสนอใหม่) → หารแล้วเกิน 100% ได้
  //   2) ใบเสนอราคา seed ของสาขาอื่นไม่ได้ผูกกับลูกค้าเป้าหมาย → เอามาหารกันคนละชุดข้อมูล
  // สถานะของลูกค้าเป้าหมายบอกเองว่าเคยเสนอราคาแล้วหรือยัง — ใช้แหล่งเดียว ไม่มีทางเกิน 100%
  const netQuotes = useNetworkQuotations();
  const DEALER_NAME = useMemo(() => new Map(allDealers.map(d => [d.code, d.name])), [allDealers]);
  // ใบ/ยอดขายรายสาขาในช่วง ที่ DB (M9 Phase 4) — supabase · local/ยังไม่กลับ = netQuotes (client)
  const rangeByDealer = useNetworkQuoteRange(timeRange.start, timeRange.end);
  const leadVsQuote = useMemo(() => {
    const m = new Map<string, { leads: number; quoted: number; quotes: number }>();
    const at = (c: string) => m.get(c) ?? (m.set(c, { leads: 0, quoted: 0, quotes: 0 }), m.get(c)!);
    // ลูกค้าเป้าหมาย/ถึงขั้นเสนอราคา รายสาขา: supabase = byDealer (chartSummary) · overdue/local = filtered
    if (chartSummary) { chartSummary.byDealer.forEach(d => { const r = at(d.dealerCode); r.leads = d.leads; r.quoted = d.quoted; }); }
    else filtered.forEach(l => { const r = at(l.dealerCode || "—"); r.leads++; if (QUOTED_UP.includes(l.status)) r.quoted++; });
    // จำนวนใบในช่วง รายสาขา: supabase = rangeByDealer · local = netQuotes
    if (rangeByDealer) { for (const [code, v] of rangeByDealer) at(code).quotes = v.quotes; }
    else netQuotes.forEach(q => { const d = parseThaiDate(q.createdAt ?? ""); if (d && (d < timeRange.start || d > timeRange.end)) return; at(q.dealerCode).quotes++; });
    const arr = [...m.entries()].map(([code, v]) => ({
      code, name: DEALER_NAME.get(code) ?? code,
      leads: v.leads, quotes: v.quotes,
      conv: v.leads > 0 ? Math.round(v.quoted / v.leads * 100) : null,  // ไม่มีลูกค้าเป้าหมาย = คำนวณไม่ได้ ไม่ใส่ 0%
    })).sort((a, b) => b.leads - a.leads);
    const max = Math.max(1, ...arr.flatMap(a => [a.leads, a.quotes]));
    return arr.map(a => ({ ...a, lPct: Math.round(a.leads / max * 100), qPct: Math.round(a.quotes / max * 100) }));
  }, [chartSummary, filtered, rangeByDealer, netQuotes, timeRange.start, timeRange.end, DEALER_NAME]);
  // เกณฑ์เป็นของแต่ละสาขา → หน้านี้ที่รวมหลายสาขาต้องสรุปเป็นช่วง ไม่ใช่เลขเดียว
  const followUpSub = useMemo(() => {
    const ds = [...new Set(kpiBase.map(l => rulesOf(l.dealerCode).followUpAlertDays))].sort((a, b) => a - b);
    if (!ds.length) return "ตามเกณฑ์ของแต่ละสาขา";
    return ds.length === 1 ? `เงียบเกิน ${ds[0]} วัน` : `เงียบเกิน ${ds[0]}–${ds[ds.length - 1]} วัน แล้วแต่สาขา`;
  }, [kpiBase, rulesOf]);

  // ขอบเขตที่ KPI กำลังนับอยู่ — ไม่มีตัวกรอง = "ทั้งเครือ" · มี = บอกว่ากรองอะไรไว้
  // ป้ายนี้ต้องเปลี่ยนตามจริง ไม่งั้นเลข 7 รายการจะขึ้นคำว่า "ทั้งเครือ" กำกับ ซึ่งโกหกคนอ่าน
  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (dealerSel !== "ALL") parts.push(DEALER_NAME.get(dealerSel) ?? dealerSel);
    if (regionSel !== "ALL") parts.push(regionDisplay(regionSel));
    if (province !== "ALL") parts.push(province);
    if (btSel !== "ALL") parts.push(btSel);
    if (srcSel !== "ALL") parts.push(srcSel);
    if (query.trim()) parts.push(`ค้นหา “${query.trim()}”`);
    return parts.length ? parts.join(" · ") : "ทั้งเครือ";
  }, [dealerSel, regionSel, province, btSel, srcSel, query, DEALER_NAME]);

  const kpiCards = [
    { label: "ลูกค้าเป้าหมายทั้งหมด", value: `${kpis.total}`, sub: scopeLabel, Icon: Users, color: "#2563a8", on: status === "ALL", onClick: () => setStatus("ALL") },
    { label: "ลูกค้าเป้าหมายใหม่ (เดือนนี้)", value: `${kpis.newThis}`, sub: "รายการ", Icon: PhoneCall, color: "#7c3aed", on: false, onClick: () => setStatus("ALL") },
    { label: "ต้องติดตามด่วน", value: `${kpis.followUp}`, sub: followUpSub, Icon: AlarmClock, color: "#EA580C", on: overdueOnly, onClick: () => { setStatus("ALL"); setOverdueOnly(v => !v); } },
    { label: "อัตราแปลงเป็นลูกค้า", value: kpis.conv === null ? "—" : `${kpis.conv}%`, sub: "ปิดได้ / ปิดทั้งหมด", Icon: Percent, color: "#059669", on: false, onClick: () => setStatus("ALL") },
  ];

  // ── Section 7 · แนวโน้มรายเดือน — 4 เส้น: ลูกค้าเป้าหมายใหม่ · ใบเสนอราคา · ปิดได้ · ปิดไม่สำเร็จ ──
  // ลูกค้าเป้าหมายนับตามเดือนที่สร้าง · ใบเสนอราคานับตามเดือนที่ออก (คนละแหล่ง จับคู่ด้วยเดือน)
  // ช่วงเดือนตัดตามตัวกรองเวลา — ไม่ฟิกซ์ 12 เดือน เพราะระบบมีข้อมูลปี 2569 ปีเดียว
  // ── กราฟแนวโน้มรายเดือน — ปุ่มช่วงย้อนหลังของตัวเอง (ไม่ผูกกับตัวกรองเวลาบนแถบบน) ──
  // ถังเดือนใช้คีย์ YYYY-MM — ช่วง 12 เดือนคาบเกี่ยว 2 ปี ถ้านับแต่เลขเดือน ยอดปีที่แล้วจะทับปีนี้
  const [trendRange, setTrendRange] = useState<MonthRange>(6);
  // ใบเสนอราคารายเดือนทั้งเครือ (คนละ entity กับลูกค้าเป้าหมาย ไม่ผูกตัวกรองลูกค้าเป้าหมาย) — supabase: byMonth ที่ DB · local: netQuotes
  const quoteTrendSum = useDashboardQuoteSummary(TREND_QUOTE_START, TREND_QUOTE_END, undefined);
  // ⚠️ เดินตามแถบกรองด้านบนแล้ว (บอสสั่ง 25 ส.ค. 69 "เอาทุกกราฟใน hq")
  //    ช่วงสั้นใช้ข้อมูลดิบฝั่งเครื่อง เพราะสรุปจากฐานข้อมูลมีแค่ระดับเดือน
  const ละเอียดกราฟ: ความละเอียด = ละเอียดของหน้า === "hour" ? "day" : ละเอียดของหน้า;
  const trend = useMemo(() => {
    if (ละเอียดกราฟ !== "month") {
      const ช่อง = ช่องเวลาในช่วง(timeRange.start, timeRange.end, ละเอียดกราฟ);
      const newM = new Map<string, number>(), wonM = new Map<string, number>(),
        lostM = new Map<string, number>(), quoteM = new Map<string, number>();
      const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
      const ในช่วง = (d: Date) => d >= timeRange.start && d <= timeRange.end;
      netQuotes.forEach(q => { const d = parseThaiDate(q.createdAt ?? ""); if (d && ในช่วง(d)) bump(quoteM, คีย์ช่อง(d, ละเอียดกราฟ)); });
      filtered.forEach(l => {
        const d = parseThaiDate(l.createdAt ?? ""); if (!d || !ในช่วง(d)) return;
        const k = คีย์ช่อง(d, ละเอียดกราฟ);
        bump(newM, k);
        if (l.status === "PAID") bump(wonM, k);
        if (l.status === "CANCELLED") bump(lostM, k);
      });
      const เท = (m: Map<string, number>) => ช่อง.map(b => m.get(b.key) ?? 0);
      return { months: ช่อง.map(b => b.label), newM: เท(newM), wonM: เท(wonM), lostM: เท(lostM), quoteM: เท(quoteM) };
    }
    const buckets = lastNMonths(trendRange, APP_NOW);
    const newM = new Map<string, number>(), wonM = new Map<string, number>(),
      lostM = new Map<string, number>(), quoteM = new Map<string, number>();
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    // ใบเสนอราคา (quoteM): supabase = byMonth ที่ DB (key YYYY-MM) · local/ยังไม่กลับ = netQuotes
    if (quoteTrendSum) { for (const r of quoteTrendSum.byMonth) quoteM.set(monthKey(r.y, r.m), r.quotes); }
    else netQuotes.forEach(q => { const d = parseThaiDate(q.createdAt ?? ""); if (d) bump(quoteM, monthKeyOf(d)); });
    if (chartSummary) { // ลูกค้าเป้าหมาย: จาก byMonth ที่ DB (key YYYY-MM)
      chartSummary.byMonth.forEach(r => { const k = `${r.y}-${String(r.m + 1).padStart(2, "0")}`; newM.set(k, r.created); wonM.set(k, r.won); lostM.set(k, r.lost); });
    } else {
      filtered.forEach(l => {
        const d = parseThaiDate(l.createdAt ?? ""); if (!d) return;
        const k = monthKeyOf(d);
        bump(newM, k);
        if (l.status === "PAID") bump(wonM, k);
        if (l.status === "CANCELLED") bump(lostM, k);
      });
    }
    const pick = (m: Map<string, number>) => buckets.map(b => m.get(b.key) ?? 0);
    return { months: buckets.map(b => b.label), newM: pick(newM), wonM: pick(wonM), lostM: pick(lostM), quoteM: pick(quoteM) };
  }, [chartSummary, filtered, quoteTrendSum, netQuotes, trendRange, ละเอียดกราฟ, timeRange.start, timeRange.end]);

  // ลูกค้าเป้าหมายตามแหล่งที่มา + ตามสถานะ (แท่งแนวนอน)
  const sources = useMemo(() => {
    const base = chartSummary
      ? chartSummary.bySource.map(r => ({ label: r.source, count: r.count }))
      : (() => { const m = new Map<string, number>(); filtered.forEach(l => m.set(l.source || "ไม่ระบุ", (m.get(l.source || "ไม่ระบุ") ?? 0) + 1)); return [...m.entries()].map(([label, count]) => ({ label, count })); })();
    const arr = [...base].sort((a, b) => b.count - a.count);
    const max = Math.max(...arr.map(a => a.count), 1);
    const total = arr.reduce((s, a) => s + a.count, 0) || 1;
    // pct = เทียบตัวมากสุด (ใช้กับแท่ง) · share = สัดส่วนของทั้งหมด (ใช้กับโดนัท) — คนละความหมาย อย่าสลับ
    return arr.map(a => ({ ...a, pct: Math.round(a.count / max * 100), share: Math.round(a.count / total * 100) }));
  }, [chartSummary, filtered]);

  const byStatus = useMemo(() => {
    const order: LeadStatus[] = LEAD_STATUS_ORDER;
    const byS = chartSummary ? new Map(chartSummary.byStatus.map(r => [r.status, r.count])) : null;
    const count = (s: LeadStatus) => byS ? (byS.get(s) ?? 0) : filtered.filter(l => l.status === s).length;
    const max = Math.max(...order.map(count), 1);
    return order.map(s => ({ status: s, count: count(s), pct: Math.round(count(s) / max * 100) }));
  }, [chartSummary, filtered]);

  // ── Section 3 · ประเภทอาคารที่ลูกค้าสนใจ ──────────────────────────────────
  // จัดกลุ่มด้วย "แม่แบบ" ของลูกค้าเป้าหมาย (product) — ใช้ค่าจริงในระบบ ไม่ยุบ/ไม่แปลงชื่อ
  const buildingTypes = useMemo(() => {
    const base = chartSummary
      ? chartSummary.byProduct.map(r => ({ label: r.product, count: r.count }))
      : (() => { const m = new Map<string, number>(); filtered.forEach(l => { const k = l.product || "ไม่ระบุ"; m.set(k, (m.get(k) ?? 0) + 1); }); return [...m.entries()].map(([label, count]) => ({ label, count })); })();
    const arr = [...base].sort((a, b) => b.count - a.count);
    const max = Math.max(...arr.map(a => a.count), 1);
    const total = arr.reduce((s, a) => s + a.count, 0) || 1;
    return arr.map(a => ({ ...a, pct: Math.round(a.count / max * 100), share: Math.round(a.count / total * 100) }));
  }, [chartSummary, filtered]);

  // ── Section 4 · เหตุผลที่ปิดการขายไม่สำเร็จ ────────────────────────────────
  // นับเฉพาะลูกค้าเป้าหมายที่ปิดไม่สำเร็จ "และบันทึกเหตุผลไว้จริง" — ไม่เดาเหตุผลให้ลูกค้าเป้าหมายที่ไม่ได้ระบุ
  // รายการเหตุผลเป็นของ HQ (ตั้งค่า › เส้นทางการขาย) ใช้ร่วมทุกดีลเลอร์
  const lostReasons = useMemo(() => {
    const ดิบ = chartSummary
      ? chartSummary.byLostReason.map(r => ({ reason: r.reason, count: r.count }))
      : (() => { const m = new Map<string, number>(); filtered.filter(l => l.status === "CANCELLED" && l.lostReason).forEach(l => m.set(l.lostReason!, (m.get(l.lostReason!) ?? 0) + 1)); return [...m.entries()].map(([reason, count]) => ({ reason, count })); })();
    // โชว์ทุกเหตุผลตามจริง · ยุบเฉพาะหางยาวที่เกิน 6 ชิ้น (ดู groupLostReasons)
    // แล้วเติมก้อน "อื่นๆ (ไม่ได้ระบุเหตุผล)" ให้ผลรวมของชิ้นเท่ากับเลขกลางวงเสมอ
    const ปิดไม่สำเร็จทั้งหมด = chartSummary
      ? (chartSummary.byStatus.find(s => s.status === "CANCELLED")?.count ?? 0)
      : filtered.filter(l => l.status === "CANCELLED").length;
    const มีเหตุผล = ดิบ.reduce((s, r) => s + r.count, 0);
    return withUnspecified(groupLostReasons(ดิบ), ปิดไม่สำเร็จทั้งหมด - มีเหตุผล);
  }, [chartSummary, filtered]);


  // ── Section 5 · ผลงานดีลเลอร์ (Top 10) ─────────────────────────────────────
  // ใช้ leadVsQuote ที่คำนวณไว้แล้ว (แหล่งเดียว ไม่คำนวณซ้ำ) + ยอดขายจากใบที่ตอบรับ
  const dealerPerf = useMemo(() => {
    const sales = new Map<string, number>();
    if (rangeByDealer) { for (const [code, v] of rangeByDealer) sales.set(code, v.wonVal); } // supabase
    else netQuotes.forEach(q => { // local/ยังไม่กลับ
      const d = parseThaiDate(q.createdAt ?? "");
      if (d && (d < timeRange.start || d > timeRange.end)) return;
      if (q.status === "won") sales.set(q.dealerCode, (sales.get(q.dealerCode) ?? 0) + q.valueNum);
    });
    return leadVsQuote
      .map(d => ({ ...d, sales: sales.get(d.code) ?? 0 }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
  }, [leadVsQuote, rangeByDealer, netQuotes, timeRange.start, timeRange.end]);

  // Export — หนึ่งแถวต่อลูกค้าเป้าหมาย (คอลัมน์ตรงกับตาราง) · supabase: ดึงทั้งชุดที่กรองจาก DB ตอนกด · local: จาก filtered
  const leadToCells = (l: LeadRow) => [
    l.id, l.dealerCode ?? "—", DEALER_NAME.get(l.dealerCode ?? "") ?? "—", l.company, l.contact,
    l.province, l.product, l.source || "—", มูลค่าอ่านง่าย(l.value),
    QUOTED_UP.includes(l.status) ? "เสนอแล้ว" : "—",
    lastContactLabel(l),
    needsFollowUp(l, rulesOf(l.dealerCode).followUpAlertDays) ? "ต้องติดตาม" : "—",
    l.assigned || "—", leadStatusLabel[l.status],
    // เหตุผลที่ปิดไม่สำเร็จ — มีเฉพาะดีลที่ปิดไม่สำเร็จ (บอสสั่ง 21 ส.ค. 69)
    l.status === "CANCELLED" ? (l.lostReason || "ไม่ได้ระบุเหตุผล") : "—",
  ];
  const exportGetRows = leadsPage
    ? async () => {
        const all = await leadsRepo.listPage(undefined, { ...leadOpts, limit: Math.max(1, leadTotal), offset: 0 });
        return all.rows.map(leadToCells);
      }
    : undefined;

  return (
    <div className="erp">
      {/* ปุ่ม/ตัวกรองของหน้าอยู่ขวาหัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้า/ป้ายกลุ่มมาจากแถบบนแล้ว */}
      <TopbarActions>
          <FilterBar dims={[]} />
          {/* ส่งออก = สิ่งที่เห็นบนจอตอนนี้ (ผ่านตัวกรองทุกตัวแล้ว) · คอลัมน์เรียงตรงกับตาราง */}
          <ExportMenu filename="hq-leads" title="ลูกค้าเป้าหมายทั้งเครือ"
            headers={["รหัสลูกค้าเป้าหมาย","รหัสดีลเลอร์","ดีลเลอร์","ลูกค้า","ผู้ติดต่อ","จังหวัด","ประเภทอาคาร","แหล่งที่มา","มูลค่า","เสนอราคาแล้ว","ติดต่อล่าสุด","ต้องติดตาม","ผู้รับผิดชอบ","สถานะ","เหตุผลที่ปิดไม่สำเร็จ"]}
            rows={filtered.map(leadToCells)} getRows={exportGetRows} />
      </TopbarActions>

      {/* ── KPI ── หน้าตาเดียวกับ /hq/pipeline และแดชบอร์ดดีลเลอร์ (ค่าลอกมาตรง ๆ ห้ามเพี้ยน)
          แถบสีนำสายตาด้านซ้ายถูกตัดออก — หน้าอื่นไม่มี การ์ด KPI ต้องหน้าตาเหมือนกันทุกหน้า
          ต่างจากหน้าอื่นตรงที่ "กดเพื่อกรองสถานะได้" → คงปุ่ม + สถานะถูกเลือก (ขอบน้ำเงิน) ไว้ */}
      <div className="dash-kpis" style={{ marginBottom: 16 }}>
        {/* สถานะ "ถูกเลือก" คุมด้วย .kpi-toggle + aria-pressed ใน globals.css — ห้ามใส่ border/boxShadow เป็น inline
            (inline ชนะ CSS → hover ยกลอยจะไม่มีเงา) */}
        {kpiCards.map(k => (
          <button key={k.label} onClick={k.onClick} aria-pressed={k.on} className="card clickable kpi-toggle" title={`กรอง: ${k.label}`}
            style={{ marginBottom: 0, padding: "18px 18px 15px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#1F2937", marginTop: 6, lineHeight: 1.15, letterSpacing: "-0.015em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{k.value}</div>
              <div style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.sub}</div>
            </div>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: k.color + "17", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <k.Icon size={20} color={k.color} strokeWidth={2.1} />
            </span>
          </button>
        ))}
      </div>

      {/* ── SMART FILTER ── อยู่ใต้ KPI เหมือนหน้าอื่น (/hq/quotations · /hq/pipeline)
          เดิมแถบนี้อยู่ล่างสุดเหนือตาราง → กราฟทุกใบอยู่ "เหนือ" ตัวกรอง คนอ่านเลยไม่รู้ว่ามันคุมกราฟได้
          ตอนนี้คุมทั้งหน้า: การ์ดตัวเลข · กราฟ · 10 อันดับแรก · การ์ดเตือน · ตาราง
          (KPI ตามตัวกรองขอบเขตทุกตัว แต่ไม่ตาม "สถานะ"/"ต้องติดตามด่วน" เพราะการ์ด KPI คือปุ่มของสองอันนั้นเอง — ดู kpiBase)
          ตัวเลือกในดรอปดาวน์สร้างจาก scoped ไม่ใช่ filtered — ไม่งั้นพอเลือกดีลเลอร์แล้วจะเปลี่ยนกลับไม่ได้ */}
      <div className="card hq-sticky-filter" style={{ marginBottom: "1.25rem" }}>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 14, paddingBottom: 14 }}>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…"
            className="form-input" style={{ flex: "1 1 150px", minWidth: 130, maxWidth: 240, padding: "7px 11px", fontSize: "0.74rem" }} />
          {leadSel(dealerSel, setDealerSel, "ทุกดีลเลอร์", dealerOpts.map(o => ({ v: o, l: `${o} – ${DEALER_NAME.get(o) ?? o}` })))}
          {leadSel(regionSel, setRegionSel, "ทุกภูมิภาค", regionOpts.map(o => ({ v: o, l: regionDisplay(o) })))}
          {leadSel(province, setProvince, "ทุกจังหวัด", provinces.map(p => ({ v: p, l: p })))}
          {leadSel(btSel, setBtSel, "ทุกประเภทอาคาร (จากลูกค้าเป้าหมาย)", btOpts.map(o => ({ v: o, l: o })))}
          {leadSel(srcSel, setSrcSel, "ทุกแหล่งที่มา", srcOpts.map(o => ({ v: o, l: o })))}
          {leadSel(status, v => setStatus(v as LeadStatus | "ALL"), "ทุกสถานะ",
            LEAD_STATUS_ORDER.map(s => ({ v: s, l: leadStatusLabel[s] })))}
          {anyFilter && (
            <button onClick={() => { setQuery(""); setDealerSel("ALL"); setRegionSel("ALL"); setProvince("ALL"); setBtSel("ALL"); setSrcSel("ALL"); setStatus("ALL"); }}
              className="btn btn-secondary btn-sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }}>ล้างตัวกรอง</button>
          )}
        </div>
      </div>

      {/* ── เตือน: ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบเกิน 48 ชม. (กฎ HQ) ──
          อยู่บนสุดใต้ KPI — เป็นเรื่องต้องรีบ ไม่ควรให้ต้องเลื่อนผ่านกราฟ 4 ใบกว่าจะเจอ
          แสดงเฉพาะตอนมีจริง — ไม่มี = ไม่ขึ้นการ์ดเปล่า */}
      {unassignedCount > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "3px solid #dc2626" }}>
          <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlarmClock size={16} color="#dc2626" />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#1F2937" }}>ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบ</span>
              <span style={{ display: "block", fontSize: "0.68rem", color: "var(--muted-foreground)", marginTop: 2 }}>เกินเกณฑ์ที่แต่ละสาขาตั้งไว้เอง ({unassignedHoursText})</span>
            </span>
            <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "#dc2626", fontVariantNumeric: "tabular-nums" }}>{unassignedCount}</span>
            <span style={{ fontSize: "0.66rem", color: "var(--muted-foreground)" }}>ราย</span>
          </div>
        </div>
      )}

      {/* ── แถว 3 · แนวโน้ม (แท่งกลุ่ม) | ตามสถานะ (แท่ง) ──
          เดิมเป็น 3 คอลัมน์ (มีแหล่งที่มาด้วย) — ย้ายแหล่งที่มาไปคู่กับเหตุผลที่แถว 2 เพราะเป็นโดนัทเหมือนกัน */}
      {/* ── แถว 1 · แนวโน้ม · ตามสถานะ · ประเภทอาคาร ──
          3 คอลัมน์: แนวโน้มกว้างกว่าเพื่อน (6 เดือน × 4 ชุด = 24 แท่ง ต้องการที่) */}
      <div className="hq-leads-row" style={{ marginBottom: 12 }}>
        {/* กราฟเส้นเป็น SVG ที่ย่อ/ขยายตามความกว้างการ์ด → ความสูงจริงไม่เท่า height ที่ส่งเข้าไป
            การ์ดถูกยืดให้สูงเท่าเพื่อนในแถว จึงเหลือที่ว่างท้ายการ์ด ~190px → จัดกึ่งกลางแนวตั้งแทน */}
        <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="card-header">
            <div className="card-title">แนวโน้มลูกค้าเป้าหมาย{ละเอียดกราฟ === "month" ? "รายเดือน" : "รายวัน"}</div>
            {ละเอียดกราฟ === "month" && <MonthRangeToggle value={trendRange} onChange={setTrendRange} label="ช่วงเวลากราฟแนวโน้มลูกค้าเป้าหมาย" />}
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--muted-foreground)", padding: "0 1.15rem 2px" }}>
            {ละเอียดกราฟ === "month" ? monthRangeSubtitle(trendRange, APP_NOW) : `ตามช่วงที่เลือกด้านบน (${trend.months.length} วัน)`}
          </div>
          <div className="card-body" style={{ paddingTop: 4, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {/* vw = ความกว้าง viewBox ต้องใกล้ความกว้างการ์ดจริง (~480px) ไม่งั้น SVG ถูกย่อตามสัดส่วน
                เดิมไม่ได้ส่ง vw → ใช้ค่าเริ่มต้น 1180 → อัตราส่วน 1180:250 ทำให้กราฟสูงจริงแค่ ~100px ลอยอยู่กลางการ์ด
                (หน้าอื่นที่การ์ดแคบส่ง vw กันหมดแล้ว — หน้านี้ตกหล่นอยู่หน้าเดียว)
                แท่งกลุ่ม ไม่ใช่แท่งซ้อน — สี่ชุดนี้เป็นขั้นของลูกค้าเป้าหมายเดียวกัน บวกกันแล้วยอดรวมไม่มีความหมาย */}
            <GroupedBarChart months={trend.months} vw={560} height={210} fmt={v => `${Math.round(v)}`}
              series={[
                { name: "ลูกค้าเป้าหมายใหม่", color: "#003366", data: trend.newM },
                { name: "ใบเสนอราคา", color: "#0891b2", data: trend.quoteM },
                { name: "ปิดการขาย", color: "#10B981", data: trend.wonM },
                { name: "ปิดไม่สำเร็จ", color: "#dc2626", data: trend.lostM },
              ]} />
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><div className="card-title">ตามสถานะ</div></div>
          <div className="card-body" style={{ paddingTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
            {byStatus.map(s => { const c = leadStatusColor[s.status]; return (
              <div key={s.status}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: 3 }}>
                  <span style={{ color: "#374151", fontWeight: 600 }}>{leadStatusLabel[s.status]}</span><span style={{ fontWeight: 800, color: c.text }}>{s.count}</span>
                </div>
                <div style={{ height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                  <div className="bar-grow" style={{ height: "100%", width: `${s.pct}%`, background: c.text, borderRadius: 999 }} />
                </div>
              </div>
            ); })}
          </div>
        </div>
      {/* ⚠️ อย่าทำเป็นโดนัท: ลูกค้าเป้าหมายหนึ่งรายนับแม่แบบเดียว แต่ที่นี่ตัดเป็น 11 ชนิดย่อย — เป็นการเทียบค่า ไม่ใช่สัดส่วนก้อนเดียว */}
      <div className="card chart-l" style={{ marginBottom: 0 }}>
        <div className="card-header"><div className="card-title">ประเภทอาคารที่สนใจ</div></div>
        <div className="card-body" style={{ paddingTop: 6, display: "flex", flexDirection: "column" }}>
          {!buildingTypes.length ? (
            <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>— ไม่มีข้อมูลในช่วงที่เลือก</div>
          ) : (
          <TopNRows topN={6} unit="ประเภท" gap={11}>
            {buildingTypes.map(r => (
            <div key={r.label}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.72rem", marginBottom: 4 }}>
                <span style={{ color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums", color: "var(--muted-foreground)" }}>
                  {r.count} ราย <span style={{ fontWeight: 800, color: "#003366" }}>{r.share}%</span>
                </span>
              </div>
              <div style={{ height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${r.pct}%`, background: "#003366", borderRadius: 999 }} />
              </div>
            </div>
            ))}
          </TopNRows>
          )}
        </div>
        </div>
      </div>

      {/* ── แถว 2 · แหล่งที่มา · เหตุผลที่ไม่ปิด ── โดนัทสองใบ (สัดส่วนของก้อนเดียวทั้งคู่)
          กริด 2 คอลัมน์เท่ากัน — ไม่ใช่ .hq-leads-row (3 คอลัมน์) เพราะเหลือ 2 ใบแล้วจะเว้าขวา */}
      <div className="hq-dealer-charts" style={{ marginBottom: 16, alignItems: "stretch" }}>
        {/* โดนัท: แหล่งที่มารวมกัน = ลูกค้าเป้าหมายทั้งหมดพอดี → สัดส่วนของก้อนเดียว
            ย้ายมาจากแถว 3 · การ์ดกว้างขึ้น (ครึ่งจอ) → วางโดนัทซ้าย legend ขวา แบบเดียวกับใบข้าง ๆ */}
        <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="card-header"><div className="card-title">ตามแหล่งที่มา</div><GitBranch size={16} color="#9ca3af" /></div>
          <div className="card-body" style={{ paddingTop: 6, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
            {!sources.length ? (
              <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>— ไม่มีข้อมูลในช่วงที่เลือก</div>
            ) : (<>
              <Donut
                segments={sources.map((s, i) => ({ label: s.label, value: s.count, color: RAMP[i % RAMP.length] }))}
                centerLabel="ทั้งหมด"
                centerValue={`${sources.reduce((s, x) => s + x.count, 0)}`}
                size={150}
              />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {sources.map((s, i) => (
                  <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem" }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: RAMP[i % RAMP.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                    <span style={{ fontWeight: 800, color: "#1F2937", fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
                    <span style={{ color: "var(--muted-foreground)", minWidth: 34, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.share}%</span>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        </div>
        {/* โดนัท: เหตุผลรวมกันได้ 100% ของลูกค้าเป้าหมายที่ปิดไม่สำเร็จพอดี → เป็นสัดส่วนของก้อนเดียว เหมาะกับโดนัทมากกว่าแท่ง */}
        <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="card-header"><div className="card-title">เหตุผลที่ปิดการขายไม่สำเร็จ</div></div>
          <div className="card-body" style={{ paddingTop: 6, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
            {!lostReasons.length ? (
              <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>— ไม่มีข้อมูลในช่วงที่เลือก</div>
            ) : (<>
              <Donut
                segments={lostReasons.map((r, i) => ({ label: r.reason, value: r.count, color: LOST_RAMP[i % LOST_RAMP.length] }))}
                centerLabel="ปิดไม่สำเร็จ"
                centerValue={`${lostReasons.reduce((s, r) => s + r.count, 0)}`}
                size={150}
              />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                {(() => {
                  const รวม = lostReasons.reduce((s, r) => s + r.count, 0) || 1;
                  return lostReasons.map((r, i) => (
                    // ก้อน "อื่นๆ (ระบุเอง)" ชี้เมาส์แล้วเห็นข้อความจริงที่ดีลเลอร์พิมพ์ไว้ (ยุบเพื่อให้อ่านง่าย ไม่ใช่ซ่อน)
                    <div key={r.reason} title={r.details?.length ? r.details.join(" · ") : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: LOST_RAMP[i % LOST_RAMP.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason}</span>
                      <span style={{ fontWeight: 800, color: "#1F2937", fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
                      <span style={{ color: "var(--muted-foreground)", minWidth: 34, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Math.round(r.count / รวม * 100)}%</span>
                    </div>
                  ));
                })()}
              </div>
            </>)}
          </div>
        </div>
      </div>

      {/* ── แถว 3 · ผลงานดีลเลอร์ (Top 10) — เต็มความกว้าง ──
          ตารางนี้มี 6 คอลัมน์ กว้างขั้นต่ำ 674px (colgroup) จึงอยู่ในช่องแคบไม่ได้
          เคยอยู่ช่องที่ 3 ของกริด (~300px) → เห็นแค่คอลัมน์ "ลูกค้าเป้าหมาย" ที่เหลือต้องเลื่อนแนวนอน */}
      <div className="card" style={{ marginBottom: 16, display: "flex", flexDirection: "column" }}>
        <div className="card-header"><div className="card-title">ผลงานดีลเลอร์ 10 อันดับแรก</div></div>
        <div className="table-wrap">
          <table>
            <colgroup>
              <col style={{ width: "6%", minWidth: 64 }} />
              <col style={{ width: "30%", minWidth: 180 }} />
              <col style={{ width: "14%", minWidth: 90 }} />
              <col style={{ width: "16%", minWidth: 110 }} />
              <col style={{ width: "16%", minWidth: 110 }} />
              <col style={{ width: "18%", minWidth: 120 }} />
            </colgroup>
            <thead><tr>
              <th>อันดับ</th><th>ดีลเลอร์</th>
              <th className="num">ลูกค้าเป้าหมาย</th><th className="num">ใบเสนอราคา</th>
              <th className="num" title="ลูกค้าเป้าหมายที่ออกใบเสนอราคาแล้ว ÷ ลูกค้าเป้าหมายทั้งหมด — ไม่ใช่อัตราปิดการขาย">อัตราออกใบเสนอราคา</th><th className="num">ยอดขาย</th>
            </tr></thead>
            <tbody>
              {!dealerPerf.length ? (
                <tr><td colSpan={6} style={{ textAlign: "center", padding: "28px 14px", color: "var(--muted-foreground)" }}>ไม่มีข้อมูลในช่วงที่เลือก</td></tr>
              ) : dealerPerf.map((d, i) => (
                <ClickableRow key={d.code} className="clickable" onActivate={() => router.push(`/hq/dealers/${d.code}`)} label={`เปิดหน้าดีลเลอร์ ${d.name}`}>
                  <td>
                    {/* อันดับ 1-3 = เหรียญ ทอง/เงิน/ทองแดง · ที่เหลือ = เลขในชิปเทา (โพลิชแบบ leaderboard) */}
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, fontWeight: 800, fontSize: "0.72rem", fontVariantNumeric: "tabular-nums",
                      background: i === 0 ? "linear-gradient(135deg,#ffe9a8,#f6c453)" : i === 1 ? "linear-gradient(135deg,#e9edf3,#c7cfdb)" : i === 2 ? "linear-gradient(135deg,#f5ddc4,#e0a878)" : "#eef2f9",
                      color: i === 0 ? "#7a5a00" : i === 1 ? "#48566b" : i === 2 ? "#6b4522" : "#6b7280" }}>{i + 1}</span>
                  </td>
                  <td title={d.name} style={{ fontWeight: 600, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</td>
                  <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>{d.leads}</td>
                  <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>{d.quotes}</td>
                  <td className="num" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{d.conv === null ? "—" : `${d.conv}%`}</td>
                  <td className="num" style={{ fontWeight: 800, color: "#003366", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtBaht(d.sales)}</td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ตารางลูกค้าเป้าหมายทั้งเครือ — คอลัมน์ตามสเปก ──
          13 คอลัมน์ต้องการ ~1,500px แต่กรอบมี ~1,012px → เลื่อนแนวนอน (.table-wrap overflow-x:auto)
          ดีกว่าบีบจนอ่านไม่ออก · ความกว้างคุมที่ colgroup เท่านั้น (table-layout:fixed) */}
      {/* overflow: hidden — .card มีมุมโค้ง 16px แต่ไม่ตัดเนื้อใน (overflow: visible)
          หัวตารางพื้นเทาและเส้นแบ่งแถวเป็นมุมเหลี่ยม จึงทาบทับพ้นส่วนโค้งออกมาทั้งสี่มุม = "ตารางทะลุขอบ"
          เดิมไม่เจอเพราะการ์ดตัดมุมบนทิ้ง (เชื่อมกับแถบตัวกรอง) — พอคืนมุมโค้งครบ อาการเลยโผล่
          การเลื่อนแนวนอนยังทำงานปกติ เพราะ .table-wrap มี overflow-x: auto เป็นตัวเลื่อนของมันเอง */}
      <div className="card" style={{ marginBottom: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table>
            {/* 12 คอลัมน์ · รวม minWidth = 1,116px — พอดีพื้นที่จริง 1,128px (วัดที่จอ 1440 · 11 ส.ค. 69)
                ชุดก่อนหน้ารวม 1,214px → เกินไป 86px ตารางจึงยังมีแถบเลื่อนแนวนอนคาอยู่
                (เดิม 13 คอลัมน์ = 1,440px · ที่ประหยัดมาได้: รวม "รหัสดีลเลอร์" เข้ากับ "ดีลเลอร์" ซึ่งข้อมูลซ้ำกัน)
                จอกว้างกว่า 1440 คอลัมน์จะยืดตาม % เอง (รวมต้องได้ 100)
                เพิ่ม/ลบคอลัมน์ต้องแก้ที่นี่เท่านั้น (table-layout: fixed — ใส่ที่ <th> ไม่มีผล)
                และต้องคุมผลรวม minWidth ไม่ให้เกินกรอบ ไม่งั้นกลับมาล้นอีก */}
            <colgroup>
              <col style={{ width: "7%", minWidth: 88 }} />{/* รหัสลูกค้าเป้าหมาย */}
              <col style={{ width: "12%", minWidth: 140 }} />{/* ดีลเลอร์ (รหัส + ชื่อ) */}
              <col style={{ width: "11%", minWidth: 120 }} />{/* ลูกค้า */}
              <col style={{ width: "7%", minWidth: 84 }} />{/* จังหวัด */}
              <col style={{ width: "9%", minWidth: 100 }} />{/* ประเภทอาคาร */}
              <col style={{ width: "8%", minWidth: 84 }} />{/* แหล่งที่มา */}
              <col style={{ width: "7%", minWidth: 84 }} />{/* มูลค่า */}
              <col style={{ width: "8%", minWidth: 88 }} />{/* เสนอราคา */}
              <col style={{ width: "8%", minWidth: 88 }} />{/* ติดต่อล่าสุด */}
              <col style={{ width: "8%", minWidth: 100 }} />{/* ต้องติดตาม — ในช่องเป็นป้ายชื่อ ห้ามตัด */}
              <col style={{ width: "8%", minWidth: 92 }} />{/* สถานะ */}
              <col style={{ width: "5%", minWidth: 52 }} />{/* ดู — ไอคอนล้วน (ปุ่ม 28px + padding ของ td) */}
            </colgroup>
            <thead><tr>
              <th>รหัส</th><th>ดีลเลอร์</th><th>ลูกค้า</th>
              <th>จังหวัด</th><th>ประเภทอาคาร</th><th>แหล่งที่มา</th>
              {/* หัวคอลัมน์ต้องสั้นพอไม่ให้ถูกตัด (th ตั้ง white-space: nowrap ทั้งระบบ) — ไฟล์ส่งออกยังใช้ชื่อเต็ม */}
              <th className="num">มูลค่า</th><th>เสนอราคา</th><th>ติดต่อล่าสุด</th>
              {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอ 1280 (26 ส.ค. 69) */}
              <th>ต้องติดตาม</th><th>สถานะ</th><th style={ตรึงคอลัมน์ปุ่ม(true)}></th>
            </tr></thead>
            <tbody>
              {displayLeads.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 0 }}><EmptyState icon={<Users size={26} />} title="ไม่พบลูกค้าเป้าหมาย" description="ลองปรับตัวกรองหรือคำค้น" /></td></tr>
              ) : displayLeads.map(l => {
                const c = leadStatusColor[l.status];
                const followUp = needsFollowUp(l, rulesOf(l.dealerCode).followUpAlertDays);
                const quoted = QUOTED_UP.includes(l.status);
                // ติดต่อล่าสุด = กิจกรรมล่าสุดของลูกค้าเป้าหมาย · ลูกค้าเป้าหมายที่ไม่มีบันทึกกิจกรรม = "—" (ไม่เดาวันให้)
                const last = lastContactLabel(l);
                // คีย์ต้องพ่วงรหัสสาขา — เลขที่ลูกค้าเป้าหมายไม่ซ้ำ "เฉพาะภายในสาขา" (คีย์จริง = สาขา + เลขที่)
                // หน้านี้รวมลูกค้าเป้าหมายทุกสาขาไว้ด้วยกัน เลขเดียวกันจากคนละสาขาจึงชนกันได้จริง
                // พบจริงจากหน้าจอผู้ใช้ 7 ส.ค. 69: "two children with the same key #L-40322"
                // ผลคือ React แยกสองแถวไม่ออก อาจสลับ/ซ้ำ/หายเวลาข้อมูลอัปเดต (ตารางลูกค้าแก้ถูกอยู่แล้ว)
                return (
                  <ClickableRow key={`${l.dealerCode ?? ""}-${l.id}`} className="clickable" onActivate={() => setViewLead(l)} label={`เปิดรายละเอียดลูกค้าเป้าหมาย ${l.company}`}>
                    <td style={{ fontFamily: "monospace", fontWeight: 700, color: PRIMARY, whiteSpace: "nowrap" }}>{l.id}</td>
                    {/* รหัส + ชื่อดีลเลอร์รวมเซลล์เดียว — เดิมแยก 2 คอลัมน์ทั้งที่เป็นข้อมูลตัวเดียวกัน กินที่ 228px */}
                    <td title={DEALER_NAME.get(l.dealerCode ?? "") ?? ""} style={{ overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span className="badge" style={{ background: "#eef2f7", color: PRIMARY, fontFamily: "monospace", flexShrink: 0 }}>{l.dealerCode || "—"}</span>
                        <span style={{ color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{DEALER_NAME.get(l.dealerCode ?? "") ?? l.dealerCode ?? "—"}</span>
                      </div>
                    </td>
                    <td title={l.company}>
                      <div style={{ fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.company}</div>
                      <div style={{ fontSize: "0.66rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.contact}</div>
                    </td>
                    <td style={{ color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{l.province}</td>
                    <td title={l.product} style={{ color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.product}</td>
                    <td style={{ color: "var(--muted-foreground)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>{l.source || "—"}</td>
                    <td className="num" style={{ fontWeight: 800, color: PRIMARY, whiteSpace: "nowrap" }}>{มูลค่าอ่านง่าย(l.value)}</td>
                    <td>
                      {/* ระบบไม่มี dealId ผูกใบเสนอราคากับลูกค้าเป้าหมาย → นับจำนวนใบไม่ได้
                          ใช้สถานะของลูกค้าเป้าหมายแทน (ไปถึงขั้นเสนอราคา = เคยออกใบแล้วจริง) */}
                      {quoted ? <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.76rem" }}>เสนอแล้ว</span>
                              : <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                    <td style={{ color: "var(--muted-foreground)", fontSize: "0.76rem", whiteSpace: "nowrap" }}>{last}</td>
                    <td>
                      {followUp
                        ? <span className="badge" style={{ background: "#fff3e6", color: "#d97706", whiteSpace: "nowrap" }}>ต้องติดตาม</span>
                        : <span style={{ color: "#9ca3af" }}>—</span>}
                    </td>
                    {/* ── ปิดไม่สำเร็จ = ต้องเห็นเหตุผลจากหน้ารายการเลย (บอสสั่ง 21 ส.ค. 69) ──────
                        เดิมต้องเปิดแผงรายละเอียดทีละใบถึงจะรู้ว่าเสียงานเพราะอะไร
                        ⚠️ ใส่ไว้ใต้ป้ายสถานะ ไม่เพิ่มคอลัมน์ใหม่ — ตารางนี้เต็มความกว้างพอดีแล้ว
                           (ดูหมายเหตุที่ colgroup: เพิ่มคอลัมน์แล้วจะกลับมามีแถบเลื่อนแนวนอนอีก) */}
                    <td>
                      <span className="badge" style={{ background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{leadStatusLabel[l.status]}</span>
                      {l.status === "CANCELLED" && (
                        <span title={l.lostReason || "ไม่ได้ระบุเหตุผล"}
                          style={{ display: "block", fontSize: "0.65rem", color: l.lostReason ? "#dc2626" : "#9ca3af", marginTop: 3,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.lostReason || "— ไม่ได้ระบุเหตุผล"}
                        </span>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={ตรึงคอลัมน์ปุ่ม()}>
                      {/* ปุ่มไอคอนล้วน — ข้อความ "ดู" ซ้ำกับที่ไอคอนสื่ออยู่แล้ว · title/aria-label คงไว้ให้ screen reader */}
                      <button onClick={() => setViewLead(l)} title="ดูรายละเอียด" aria-label="ดูรายละเอียด" className="btn btn-secondary btn-sm"
                        style={{ width: 28, height: 28, padding: 0, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>
                        <Eye size={13} />
                      </button>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* แถบเปลี่ยนหน้าแสดงตลอด แม้มีหน้าเดียว (มาตรฐานทุกตาราง HQ) · หน้านี้ 25 แถว/หน้า */}
        <TablePagination
          page={leadPagination.page} total={leadPagination.total} onPage={leadPagination.onPage}
          size={LEADS_PAGE} unit="ราย"
        />
      </div>

      {/* ── Drawer · ดูรายละเอียดลูกค้าเป้าหมาย (HQ ดูอย่างเดียว — ไม่มีแก้/ลบ/มอบหมาย) ──
          เปิดทับหน้าเดิม ไม่เปลี่ยนหน้า ตามสเปก · ไม่มีข้อมูล = "—" ไม่เดาให้ */}
      {viewLead && (() => {
        const l = viewLead;
        const c = leadStatusColor[l.status];
        const quoted = QUOTED_UP.includes(l.status);
        return (
          <>
            <div onClick={() => setViewLead(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 240 }} />
            {/* แผงลอยจากขอบจอเล็กน้อยแล้วมนทุกมุม (บอสสั่ง 28 ส.ค. 69) — เดิมชนขอบขวาและมนแค่สองมุมซ้าย */}
            <div className="side-drawer" style={{ position: "fixed", top: 12, right: 12, bottom: 12, width: 420, maxWidth: "calc(100vw - 24px)", zIndex: 241,
              background: "#F8FAFC", boxShadow: "0 24px 70px rgba(0,0,0,.24)", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column" }}>

              {/* หัวแผง — ชื่อบริษัทเด่น + วงกลมย่อชื่อ · ป้ายสถานะและมูลค่าอยู่บรรทัดเดียวกัน */}
              <div style={{ background: "linear-gradient(135deg,#003366 0%,#00284F 60%,#001B36 100%)", padding: "18px 20px 16px",
                display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                  <span style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.2)",
                    color: "#fff", fontWeight: 800, fontSize: "0.92rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {ย่อชื่อ(l.company)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.company}</div>
                    <div style={{ fontSize: "0.68rem", color: "rgba(255,255,255,.7)", marginTop: 3 }}>{l.id} · {l.contact}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                      <span className="badge" style={{ background: c.bg, color: c.text }}>{leadStatusLabel[l.status]}</span>
                      <span className="badge" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>{มูลค่าอ่านง่าย(l.value)}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setViewLead(null)} title="ปิด" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.2)",
                  background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} /></button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 20px" }}>
                {/* แถบสรุปบนสุด — มูลค่าที่ประเมินไว้ กับสถานะใบเสนอราคา อ่านได้ตั้งแต่ยังไม่เลื่อนจอ */}
                {/* แถบสรุปบนสุด — มูลค่าที่ประเมินไว้ กับสถานะใบเสนอราคา อ่านได้ตั้งแต่ยังไม่เลื่อนจอ */}
                <PanelStats>
                  <PanelStat label="ประเมินราคา" value={มูลค่าอ่านง่าย(l.value)} />
                  <PanelStat label="ใบเสนอราคา" tone={quoted ? "good" : "plain"}
                    value={quoted ? "เสนอราคาแล้ว" : "ยังไม่ได้เสนอราคา"}
                    sub={quoted ? "ดูใบได้ที่ ใบเสนอราคาทั้งเครือ" : undefined} />
                </PanelStats>

                <PanelSection icon={User} title="ข้อมูลลูกค้า">
                  <PanelRow icon={User} label="ผู้ติดต่อ" value={l.contact} />
                  <PanelRow icon={Phone} label="โทรศัพท์" value={เบอร์อ่านง่าย(l.phone)} />
                  <PanelRow icon={Mail} label="อีเมล" value={l.email} />
                  <PanelRow icon={MapPin} label="จังหวัด" value={l.province} />
                  <PanelRow icon={Building2} label="ประเภทอาคารที่สนใจ" value={l.product} />
                  <PanelRow icon={Compass} label="แหล่งที่มา" value={l.source} />
                  <PanelRow icon={Wallet} label="ประเมินราคา" value={มูลค่าอ่านง่าย(l.value)} strong />
                  <PanelRow icon={CalendarDays} label="สร้างเมื่อ" value={l.createdAt} />
                </PanelSection>

                <PanelSection icon={Store} title="ข้อมูลดีลเลอร์">
                  <PanelRow icon={IdCard} label="รหัสดีลเลอร์" value={l.dealerCode} />
                  <PanelRow icon={Store} label="ดีลเลอร์" value={DEALER_NAME.get(l.dealerCode ?? "")} />
                  <PanelRow icon={UserCheck} label="ผู้รับผิดชอบ" value={l.assigned} />
                </PanelSection>

                <PanelSection icon={Activity} title="กิจกรรม / ไทม์ไลน์">
                  {!l.activities?.length ? (
                    <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>— ไม่มีบันทึกกิจกรรม</div>
                  ) : (
                    <div style={{ padding: "10px 0 4px" }}>
                      {l.activities.map((a, i, ทั้งหมด) => (
                        <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", position: "relative", paddingBottom: i === ทั้งหมด.length - 1 ? 8 : 14 }}>
                          {/* เส้นไทม์ไลน์ลากจากจุดนี้ไปจุดถัดไป — จุดสุดท้ายไม่ต้องมีเส้นห้อย */}
                          {i !== ทั้งหมด.length - 1 && (
                            <span style={{ position: "absolute", left: 4, top: 14, bottom: 0, width: 1, background: "#E2E8F0" }} />
                          )}
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", border: "2px solid #003366", marginTop: 4, flexShrink: 0, zIndex: 1 }} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: "0.76rem", color: "#1F2937", lineHeight: 1.5 }}>{a.text}</span>
                            <span style={{ display: "block", fontSize: "0.66rem", color: "#94A3B8", marginTop: 2 }}>{a.date}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </PanelSection>

                <PanelSection icon={CalendarClock} title="ประวัตินัดหมาย">
                  {(() => {
                    const appts = drawerAppts ?? appointments.filter(a => a.leadId === l.numId);
                    return !appts.length ? (
                      <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>— ไม่มีนัดหมาย</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", padding: "4px 0" }}>
                        {appts.map((a, i) => (
                          <div key={a.id} style={{ padding: "9px 0", borderBottom: i === appts.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                            <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.project || a.company}</div>
                            <div style={{ fontSize: "0.66rem", color: "#64748B", marginTop: 3 }}>{fmtISOToThai(a.date)} · {a.time} · {a.assigned}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </PanelSection>

                <PanelSection icon={Paperclip} title="ไฟล์แนบ">
                  {(() => {
                    const files = dealerFiles.filter(f => f.source === "lead" && f.recordId === l.numId);
                    return !files.length ? (
                      <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>— ไม่มีไฟล์แนบ</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", padding: "4px 0" }}>
                        {files.map((f, i) => (
                          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderBottom: i === files.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                            <FileText size={14} color="#94A3B8" />
                            <span style={{ flex: 1, minWidth: 0, fontSize: "0.74rem", fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                            <span style={{ fontSize: "0.65rem", color: "#94A3B8", flexShrink: 0 }}>{f.size}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </PanelSection>

                <PanelSection icon={StickyNote} title="หมายเหตุ">
                  <div style={{ fontSize: "0.78rem", color: l.note ? "#374151" : "#94A3B8", lineHeight: 1.65, padding: "10px 0" }}>{l.note || "— ไม่มีหมายเหตุ"}</div>
                </PanelSection>

                {l.status === "CANCELLED" && (
                  <section style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.62rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}><AlertTriangle size={13} color="#F87171" /> เหตุผลที่ปิดการขายไม่สำเร็จ</div>
                    <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14, padding: "12px 14px",
                      fontSize: "0.8rem", fontWeight: 700, color: "#DC2626" }}>
                      {l.lostReason || "— ไม่ได้ระบุเหตุผล"}
                    </div>
                  </section>
                )}
              </div>

              <div style={{ padding: "12px 20px", borderTop: "1px solid #E5E7EB", background: "#fff", flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.66rem", color: "#64748B", flex: 1 }}>
                  <Lock size={12} color="#94A3B8" /> สำนักงานใหญ่ดูอย่างเดียว — แก้ไขได้ที่ดีลเลอร์เจ้าของรายการ
                </span>
                <button onClick={() => setViewLead(null)} className="btn btn-secondary btn-md" style={{ color: "#374151" }}>ปิด</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
