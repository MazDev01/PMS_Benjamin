"use client";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { มูลค่าลีด, วันที่สร้างอ่านง่าย } from "@pms/shared/lib/mock";   // มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

// ─── HQ · ลูกค้าเป้าหมายทั้งเครือ (Network Leads) ──────────────────────────────
// ภาพรวมลูกค้าเป้าหมายของทุกดีลเลอร์ · กรอง (ค้นหา/สถานะ/จังหวัด/ช่วงเวลา) · KPI · กราฟ · ตาราง drill-down
// ใช้ข้อมูลจริงจาก SalesContext (leads) — HQ ดูอย่างเดียว (Sales CRM เท่านั้น)
import { useMemo, useState, useEffect, useRef } from "react";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { AssigneeAvatars } from "@pms/shared/components/ui/PersonPicker";
import { TablePagination, pageSlice, ROWS_PER_PAGE } from "@pms/shared/components/ui/TablePagination";
import { useRouter } from "next/navigation";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { useKpiCards } from "@pms/shared/lib/useKpiCards";
import { ค่า, นับ } from "@pms/shared/lib/kpiCards";
import {
  Users, PhoneCall, AlarmClock, X, GitBranch, Eye, Inbox,
  User, Phone, Mail, MapPin, Compass, Wallet, CalendarDays,
  Store, IdCard, UserCheck, FileText, Activity, CalendarClock, Paperclip, StickyNote, Lock, AlertTriangle,
} from "lucide-react";
import { useNetworkLeads, useNetworkQuotations, useLeadSummary, useLeadsPage, useUnassignedLeads, useDashboardQuoteSummary, useLeadAppointments } from "@pms/shared/lib/useNetworkData";
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
import { ภาคมาตรฐาน, ชื่อภาค, ป้ายทุกภูมิภาค } from "@pms/shared/lib/provinces";  // แหล่งเดียวของชื่อภาค — ไม่ก็อปโค้ดซ้ำ
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
import { ช่อง, กลุ่มช่อง } from "@pms/shared/lib/fieldLabels";
import { วันที่แสดงไทย } from "@pms/shared/lib/thaiDate";
import { เลขขั้นของลีด, ชื่อขั้น, สีขั้น, สีกราฟขั้น, ตัวเลือกขั้น, เลขขั้นทั้งหมด, type เลขขั้น } from "@pms/shared/lib/leadStage";
import { quoteBelongsToLead } from "@pms/shared/lib/leadQuote";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { fmtBaht, fmtFull, formatPhone } from "@pms/shared/lib/format";
import { groupLostReasons, withUnspecified } from "@pms/shared/lib/lostReasons";
import { HqLeadTransferCard } from "@pms/shared/components/hq/HqLeadTransferCard";

// ── ตัวเลขและเบอร์โทรบนหน้าสำนักงานใหญ่ ต้องอ่านง่ายเหมือนฝั่งดีลเลอร์ (บอสสั่ง 21 ส.ค. 69) ──
//   มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (บอสตัดสิน 20 ต.ค. 69 · ข้อ 5 · ใบ 0223) — ยังไม่มีใบ = "—"
const มูลค่าอ่านง่าย = (n: number | null) => n == null ? "—" : fmtFull(n);
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
// ⚠️ ห้ามกลับไปใช้รายการสถานะ: เดิมนับจากสถานะ (ติดต่อแล้ว + สถานะติดตามแบบเก่า) ซึ่งไม่ได้นับวันเลย
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
  // ตัวกรองขั้น = เลขขั้น 1–7 จากตัวกลาง leadStage.ts (บอสสั่ง 27 ต.ค. 69 · เดิมกรองตามชื่อสถานะภายใน) · ALL = ทุกขั้น
  // กลุ่มขั้น (บอสสั่ง 28 ต.ค. 69): OPEN = กำลังดำเนินการ ขั้น 1–5 (ค่าเริ่มต้น) · "6" ปิดสำเร็จ · "7" ปิดไม่สำเร็จ · ALL = ทั้งหมด
  const [status, setStatus] = useState<string>("OPEN");
  // เลขขั้นของแถว: แถวจากฐาน (leads_page ใบ 0251) มี stageNo · โหมดตัวอย่าง/ค้างติดตาม คิดจากใบร่างที่มีในเครื่อง
  const เลขขั้นแถว = (l: LeadRow): เลขขั้น => (l.stageNo as เลขขั้น | undefined)
    ?? เลขขั้นของลีด(l.status, quotations.some(q => q.status === "draft" && quoteBelongsToLead(q, l)));
  const [province, setProvince] = useState<string>("ALL");
  const [viewLead, setViewLead] = useState<LeadRow | null>(null);  // Drawer — ดูอย่างเดียว
  const [dealerSel, setDealerSel] = useState<string>("ALL");
  const [regionSel, setRegionSel] = useState<string>("ALL");
  const [srcSel, setSrcSel] = useState<string>("ALL");

  // ชุดลีดของหน้า (บอสตัดสิน 30 ต.ค. 69 · ใบ 0265): ไม่นับลีดของ HQ ที่ยังไม่โอน — อยู่ในกล่องโอนที่เดียว (การ์ด "ลีดของ HQ รอโอน")
  //   ทุกส่วนของหน้า (การ์ด · กราฟ · ตาราง) นับชุดเดียวกัน · ฐานคิด (kpi_cards · lead_summary · leads_page) — ตรงนี้คือทางสำรองโหมดตัวอย่าง
  const ของดีลเลอร์ = useMemo(() => leads.filter(l => ไม่ใช่แถวHQ({ code: l.dealerCode })), [leads]);
  // ลูกค้าเป้าหมายในช่วงเวลาที่เลือก (ตาม createdAt)
  const scoped = useMemo(() => ของดีลเลอร์.filter(l => {
    const d = parseThaiDate(l.createdAt ?? "");
    return !d || (d >= timeRange.start && d <= timeRange.end);
  }), [ของดีลเลอร์, timeRange.start, timeRange.end]);

  // นัดหมาย + ไฟล์ — ใช้แสดงใน Drawer เท่านั้น (HQ ดูอย่างเดียว)
  // นัดหมายผูกด้วย leadId · ไฟล์ผูกด้วย source="lead" + recordId — ทั้งคู่คือ numId ของลูกค้าเป้าหมาย
  const { appointments, quotations } = useSales();
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
  const REGION_OF = useMemo(() => new Map(allDealers.map(d => [d.code, ภาคมาตรฐาน(d.region) ?? d.region])), [allDealers]);   // ภาคมาตรฐาน — ชื่อแสดงผ่าน ชื่อภาค()

  // ตัวเลือกตัวกรอง — จากลูกค้าเป้าหมายจริงในช่วง (ไม่ hardcode) · supabase: lead_summary (เวลาอย่างเดียว) · local/ยังไม่กลับ: scoped
  const optsSummary = useLeadSummary(useMemo(() => ({ dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end) }), [timeRange.start, timeRange.end]));
  const dealerOpts = useMemo(() => (optsSummary
    ? [...new Set(optsSummary.byDealer.map(d => d.dealerCode))]
    : [...new Set(scoped.map(l => l.dealerCode).filter(Boolean))] as string[]).filter(c => ไม่ใช่แถวHQ({ code: c })).sort(), [optsSummary, scoped]);   // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
  const regionOpts = useMemo(() => (optsSummary
    ? [...new Set(optsSummary.byDealer.map(d => REGION_OF.get(d.dealerCode)).filter(Boolean))]
    : [...new Set(scoped.map(l => REGION_OF.get(dealerCodeOf(l))).filter(Boolean))]).sort() as string[], [optsSummary, scoped, REGION_OF]);
  const srcOpts = useMemo(() => (optsSummary
    ? optsSummary.bySource.map(s => s.source)
    : [...new Set(scoped.map(l => l.source || "ไม่ระบุ"))]).sort((a, b) => a.localeCompare(b, "th")), [optsSummary, scoped]);
  const provinces = useMemo(() => (optsSummary
    ? optsSummary.byProvince.map(p => p.province)
    : [...new Set(scoped.map(l => l.province).filter(Boolean))]).sort(), [optsSummary, scoped]);

  // ฐานของ KPI = ตัวกรอง "ขอบเขต" ทุกตัว (ดีลเลอร์ · ภูมิภาค · จังหวัด · แหล่งที่มา · ค้นหา)
  // แต่ยังไม่กรองด้วย "สถานะ" และ "ต้องติดตามด่วน" — สองอันนั้นคือปุ่มของการ์ด KPI เอง
  // ถ้า KPI ตามสองอันนั้นด้วย ตัวเลขจะยุบเหลือค่าเดียวทันทีที่กด การ์ดจะไร้ความหมาย
  const ตรงขอบเขต = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (l: LeadRow) =>
      (province === "ALL" || l.province === province) &&
      (dealerSel === "ALL" || l.dealerCode === dealerSel) &&
      (regionSel === "ALL" || REGION_OF.get(dealerCodeOf(l)) === regionSel) &&
      (srcSel === "ALL" || (l.source || "ไม่ระบุ") === srcSel) &&
      (!q || (l.company + l.contact + l.province + l.assigned + (l.id ?? "") + (l.dealerCode ?? "")).toLowerCase().includes(q));
  }, [query, province, dealerSel, regionSel, srcSel, REGION_OF]);
  // ณ ตอนนี้ (ไม่ผูกช่วงเวลา): ลีดที่เปิดอยู่ · ไม่เคลื่อนไหว — บอสตัดสิน 22 ต.ค. 69 (ยืนยันอีกครั้ง 30 ต.ค. 69)
  const kpiBaseAll = useMemo(() => ของดีลเลอร์.filter(ตรงขอบเขต), [ของดีลเลอร์, ตรงขอบเขต]);
  // ตามช่วงเวลา (วันที่ลีดเข้ามา): ลีดใหม่ · ปิดสำเร็จ/ปิดไม่สำเร็จ · กราฟ
  const kpiBase = useMemo(() => scoped.filter(ตรงขอบเขต), [scoped, ตรงขอบเขต]);

  // ตาราง: "กำลังดำเนินการ" (ขั้น 1–5 · การ์ดลีดที่เปิดอยู่/ไม่เคลื่อนไหว) = ณ ตอนนี้ · ขั้นอื่น/ทั้งหมด = ตามช่วง
  const filtered = useMemo(() => (status === "OPEN" ? kpiBaseAll : kpiBase).filter(l =>
    (status === "ALL" || (status === "OPEN" ? เลขขั้นแถว(l) <= 5 : เลขขั้นแถว(l) === Number(status))) &&
    (!overdueOnly || needsFollowUp(l, 30))
  ), [kpiBase, kpiBaseAll, status, overdueOnly, quotations]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── M9 Phase 2: สรุปลูกค้าเป้าหมายหลังกรองที่ DB (supabase) · local/overdue/ระหว่างโหลด = client fallback ──
  const leadDealerCodes = useMemo<string[] | undefined>(() => {
    let codes: string[] | undefined;
    const restrict = (pred: (c: string) => boolean) => { codes = (codes ?? allDealers.map(d => d.code)).filter(pred); };
    if (dealerSel !== "ALL") restrict(c => c === dealerSel);
    if (regionSel !== "ALL") restrict(c => REGION_OF.get(c) === regionSel);
    return codes;
  }, [dealerSel, regionSel, allDealers, REGION_OF]);
  const baseF: LeadSummaryFilters = {
    // ไม่ส่ง product แล้ว — ตัวกรองประเภทอาคาร (แม่แบบ) ถูกถอด: เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
    dealerCodes: leadDealerCodes, province: province === "ALL" ? undefined : province,
    source: srcSel === "ALL" ? undefined : srcSel,
    search: query.trim() || undefined, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
  };
  // กราฟนับตามช่วงเวลา (รวมลีดปิดแล้ว · FLOW แถว /hq/leads) — ไม่ผูกตัวกรองขั้น/ค้างติดตาม: สองตัวนั้นคุมตาราง เหมือนการ์ด
  //   (บอสสั่ง 30 ต.ค. 69: ทุกตัวกรอง ผลรวมกราฟขั้นตอน = การ์ด · วงกลมแหล่งที่มา = การ์ดลีดใหม่)
  const chartSummary = useLeadSummary(baseF);
  // กราฟตามขั้นตอน ขั้น 1–5 = ลีดที่เปิดอยู่ ณ ตอนนี้ (ชุดเดียวกับการ์ด "ลีดที่เปิดอยู่") · ขั้น 6–7 = ปิดในช่วง (ตามวันที่ลีดเข้ามา)
  const openSummary = useLeadSummary({ ...baseF, dateStart: undefined, dateEnd: undefined });

  // ── ตารางลูกค้าเป้าหมาย: แบ่งหน้าที่ DB (M9 Phase 4) · local/ยังไม่กลับ = filtered (client) ──
  // 10 แถว/หน้าเท่าทุกตารางในระบบ (บอสสั่ง 13 ส.ค. 69 — เดิมหน้านี้ 25 อยู่หน้าเดียวที่ไม่เหมือนใคร)
  const LEADS_PAGE = ROWS_PER_PAGE;
  const [leadPage, setLeadPage] = useState(0);
  const leadOpts: LeadListOpts = useMemo(() => ({
    limit: LEADS_PAGE, offset: leadPage * LEADS_PAGE,
    // 0 = กำลังดำเนินการ (ขั้น 1–5 · ใบ 0256)
    stage: status === "ALL" ? undefined : status === "OPEN" ? 0 : Number(status), dealerCodes: leadDealerCodes,
    province: province === "ALL" ? undefined : province,
    source: srcSel === "ALL" ? undefined : srcSel, search: query.trim() || undefined,
    // กำลังดำเนินการ (ขั้น 1–5) = ณ ตอนนี้ ตรงการ์ดลีดที่เปิดอยู่ (ไม่ผูกช่วง) · ขั้นอื่น/ทั้งหมด = ลีดที่เข้ามาในช่วง
    dateStart: status === "OPEN" ? undefined : isoDateOf(timeRange.start), dateEnd: status === "OPEN" ? undefined : isoDateOf(timeRange.end),
    // การ์ด "ไม่เคลื่อนไหวเกิน 30 วัน" (ใบ 0246) = ตัวกรองค้างติดตามที่ 30 วันทุกสาขา (กติกาเดียวกับฐาน)
    overdue: overdueOnly, asOf: isoDateOf(APP_NOW), defaultDays: 30, perDealer: undefined,
  }), [leadPage, status, leadDealerCodes, province, srcSel, query, timeRange.start, timeRange.end, overdueOnly]);
  const leadsPage = useLeadsPage(leadOpts);
  const leadTableKey = JSON.stringify({ ...leadOpts, offset: 0 });
  useEffect(() => { setLeadPage(0); }, [leadTableKey]); // เปลี่ยนตัวกรอง → หน้า 1
  // local ต้องตัดเป็นหน้า ๆ ที่ client ด้วย — ไม่งั้นแถบบอกเลขหน้าแต่ตารางเทมาทั้งชุด
  const localLeadPage = Math.min(leadPage, Math.max(1, Math.ceil(filtered.length / LEADS_PAGE)) - 1);
  const displayLeads = leadsPage?.rows ?? pageSlice(filtered, localLeadPage, LEADS_PAGE);
  const leadTotal = leadsPage ? leadsPage.total : filtered.length;
  const leadPagination = { page: leadsPage ? leadPage : localLeadPage, total: leadTotal, onPage: setLeadPage };


  // ── เตือน: ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบนานเกินเกณฑ์ (กฎธุรกิจ HQ · ค่าเริ่มต้น 48 ชม.) ──
  // ตอนนี้ลูกค้าเป้าหมายทุกใบมีผู้รับผิดชอบ → ขึ้น 0 ซึ่งเป็นความจริง · ตรรกะพร้อมใช้ พอมีลูกค้าเป้าหมาย assigned ว่างเกินเกณฑ์ การ์ดจะเด้ง
  // อิงขอบเขต kpiBase (ดีลเลอร์/ภาค/จังหวัด/แหล่ง/ค้นหา + ช่วงเวลา) — ไม่ผูกสถานะ (เตือนไร้ผู้รับผิดชอบ ไม่เกี่ยวสถานะ)
  const perDealerHours = useMemo(() => Object.fromEntries(allDealers.map(d => [d.code, rulesOf(d.code).unassignedAlertHours])), [allDealers, rulesOf]);
  const unassignedSummary = useUnassignedLeads(useMemo(() => ({
    asOf: isoDateOf(APP_NOW), defaultHours: DEFAULT_LEAD_RULES.unassignedAlertHours, perDealer: perDealerHours,
    dealerCodes: leadDealerCodes, province: province === "ALL" ? undefined : province,
    source: srcSel === "ALL" ? undefined : srcSel,
    search: query.trim() || undefined, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
  }), [perDealerHours, leadDealerCodes, province, srcSel, query, timeRange.start, timeRange.end]));
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
  const anyFilter = !!query.trim() || status !== "OPEN" || [province, dealerSel, regionSel, srcSel].some(v => v !== "ALL");


  const netQuotes = useNetworkQuotations();
  const DEALER_NAME = useMemo(() => new Map(allDealers.map(d => [d.code, d.name])), [allDealers]);


  // ── การ์ด KPI 4 ใบ (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) — ตัวเลขคิดที่ฐาน (kpi_cards) · ช่วงเวลา + ดีลเลอร์ที่เลือก · ไม่นับแถว HQ
  //   เปิดอยู่ / ไม่เคลื่อนไหว / ลีดของ HQ รอโอน = ณ ตอนนี้ · ลีดใหม่ = เข้ามาในช่วงที่เลือก
  //   การ์ดเดินตามตัวกรองภาค/จังหวัด/ช่องทาง/คำค้น (บอสตัดสิน 27 ต.ค. 69) — ส่งตัวกรองชุดเดียวกับที่ส่งให้รายการ (leads_page) ฐานกรองกติกาเดียวกัน
  //   ลีดของ HQ รอโอน = คิวของ HQ เอง ไม่ขึ้นกับตัวกรองสาขา
  const { salesVersion } = useSales();
  const ช่วงการ์ด = { start: isoDateOf(timeRange.start), end: isoDateOf(timeRange.end) };
  const ตัวกรองการ์ด = useMemo(() => {
    const f = { dealerCodes: leadDealerCodes, province: baseF.province, source: baseF.source, search: baseF.search };
    return Object.values(f).some(v => v !== undefined) ? f : null;
  }, [leadDealerCodes, baseF.province, baseF.source, baseF.search]);
  const การ์ด = useKpiCards("hq.leads", { ...ช่วงการ์ด, dealer: dealerSel === "ALL" ? null : dealerSel, today: isoDateOf(APP_NOW), filters: ตัวกรองการ์ด, รุ่น: salesVersion });
  const kpiCards = [
    { kpi: "open", label: "ลีดที่เปิดอยู่", value: ค่า(การ์ด, "open"), unit: "ราย · ยังไม่ปิดการขาย", Icon: Users, color: "#2563a8", on: status === "OPEN" && !overdueOnly,
      onClick: () => { setStatus("OPEN"); setOverdueOnly(false); } },
    // ลีดใหม่ = ทุกขั้นที่เข้ามาในช่วง → ตาราง "ทั้งหมด" (ตามช่วง) · จำนวนแถว = การ์ด
    { kpi: "new", label: "ลีดใหม่ในช่วงนี้", value: ค่า(การ์ด, "new"), unit: "ราย · เข้ามาในช่วงที่เลือก", Icon: PhoneCall, color: "#7c3aed", on: status === "ALL" && !overdueOnly,
      onClick: () => { setStatus("ALL"); setOverdueOnly(false); } },
    { kpi: "hqWaiting", label: "ลีดของ HQ รอโอน", value: ค่า(การ์ด, "hqWaiting"), unit: "ราย · ยังไม่โอนให้ดีลเลอร์", Icon: Inbox, color: "#0891B2", on: false,
      onClick: () => document.querySelector("[data-card='hq-lead-transfer']")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
    { kpi: "idle", label: "ไม่เคลื่อนไหวเกิน 30 วัน", value: ค่า(การ์ด, "idle"), unit: "ราย · ติดต่อล่าสุดเกิน 30 วัน", Icon: AlarmClock, color: "#EA580C", on: overdueOnly,
      onClick: () => { setStatus("OPEN"); setOverdueOnly(v => !v); } },
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
      kpiBase.forEach(l => {
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
      kpiBase.forEach(l => {
        const d = parseThaiDate(l.createdAt ?? ""); if (!d) return;
        const k = monthKeyOf(d);
        bump(newM, k);
        if (l.status === "PAID") bump(wonM, k);
        if (l.status === "CANCELLED") bump(lostM, k);
      });
    }
    const pick = (m: Map<string, number>) => buckets.map(b => m.get(b.key) ?? 0);
    return { months: buckets.map(b => b.label), newM: pick(newM), wonM: pick(wonM), lostM: pick(lostM), quoteM: pick(quoteM) };
  }, [chartSummary, kpiBase, quoteTrendSum, netQuotes, trendRange, ละเอียดกราฟ, timeRange.start, timeRange.end]);

  // ลูกค้าเป้าหมายตามแหล่งที่มา + ตามสถานะ (แท่งแนวนอน)
  const sources = useMemo(() => {
    const base = chartSummary
      ? chartSummary.bySource.map(r => ({ label: r.source, count: r.count }))
      : (() => { const m = new Map<string, number>(); kpiBase.forEach(l => m.set(l.source || "ไม่ระบุ", (m.get(l.source || "ไม่ระบุ") ?? 0) + 1)); return [...m.entries()].map(([label, count]) => ({ label, count })); })();
    const arr = [...base].sort((a, b) => b.count - a.count);
    const max = Math.max(...arr.map(a => a.count), 1);
    const total = arr.reduce((s, a) => s + a.count, 0) || 1;
    // pct = เทียบตัวมากสุด (ใช้กับแท่ง) · share = สัดส่วนของทั้งหมด (ใช้กับโดนัท) — คนละความหมาย อย่าสลับ
    return arr.map(a => ({ ...a, pct: Math.round(a.count / max * 100), share: Math.round(a.count / total * 100) }));
  }, [chartSummary, kpiBase]);

  // ตามขั้น — เลขขั้นจากฐาน (lead_summary.byStage ใบ 0251) · ชื่อขั้นจากตัวกลาง leadStage.ts
  const byStatus = useMemo(() => {
    // ขั้น 1–5 = เปิดอยู่ ณ ตอนนี้ (openSummary · ชุดเดียวกับการ์ด) · ขั้น 6–7 = ปิดในช่วง (chartSummary)
    const จากฐาน = (sum: typeof chartSummary) => sum ? new Map((sum.byStage ?? []).map(r => [r.stage, r.count])) : null;
    const เปิด = จากฐาน(openSummary), ช่วง = จากฐาน(chartSummary);
    const count = (n: เลขขั้น) => {
      const ฐาน = n <= 5 ? เปิด : ช่วง;
      return ฐาน ? (ฐาน.get(n) ?? 0) : (n <= 5 ? kpiBaseAll : kpiBase).filter(l => เลขขั้นแถว(l) === n).length;
    };
    const max = Math.max(...เลขขั้นทั้งหมด.map(count), 1);
    return เลขขั้นทั้งหมด.map(n => ({ stage: n, count: count(n), pct: Math.round(count(n) / max * 100) }));
  }, [chartSummary, openSummary, kpiBase, kpiBaseAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Section 4 · เหตุผลที่ปิดการขายไม่สำเร็จ ────────────────────────────────
  // นับเฉพาะลูกค้าเป้าหมายที่ปิดไม่สำเร็จ "และบันทึกเหตุผลไว้จริง" — ไม่เดาเหตุผลให้ลูกค้าเป้าหมายที่ไม่ได้ระบุ
  // รายการเหตุผลเป็นของ HQ (ตั้งค่า › เส้นทางการขาย) ใช้ร่วมทุกดีลเลอร์
  const lostReasons = useMemo(() => {
    const ดิบ = chartSummary
      ? chartSummary.byLostReason.map(r => ({ reason: r.reason, count: r.count }))
      : (() => { const m = new Map<string, number>(); kpiBase.filter(l => l.status === "CANCELLED" && l.lostReason).forEach(l => m.set(l.lostReason!, (m.get(l.lostReason!) ?? 0) + 1)); return [...m.entries()].map(([reason, count]) => ({ reason, count })); })();
    // โชว์ทุกเหตุผลตามจริง · ยุบเฉพาะหางยาวที่เกิน 6 ชิ้น (ดู groupLostReasons)
    // แล้วเติมก้อน "อื่นๆ (ไม่ได้ระบุเหตุผล)" ให้ผลรวมของชิ้นเท่ากับเลขกลางวงเสมอ
    const ปิดไม่สำเร็จทั้งหมด = chartSummary
      ? (chartSummary.byStatus.find(s => s.status === "CANCELLED")?.count ?? 0)
      : kpiBase.filter(l => l.status === "CANCELLED").length;
    const มีเหตุผล = ดิบ.reduce((s, r) => s + r.count, 0);
    return withUnspecified(groupLostReasons(ดิบ), ปิดไม่สำเร็จทั้งหมด - มีเหตุผล);
  }, [chartSummary, kpiBase]);



  // Export — หนึ่งแถวต่อลูกค้าเป้าหมาย (คอลัมน์ตรงกับตาราง) · supabase: ดึงทั้งชุดที่กรองจาก DB ตอนกด · local: จาก filtered
  const leadToCells = (l: LeadRow) => [
    l.id, l.dealerCode ?? "—", DEALER_NAME.get(l.dealerCode ?? "") ?? "—", l.company, l.contact,
    l.province, l.source || "—", มูลค่าอ่านง่าย(มูลค่าลีด(l)),
    lastContactLabel(l),
    needsFollowUp(l, rulesOf(l.dealerCode).followUpAlertDays) ? "ต้องติดตาม" : "—",
    l.assigned || "—", ชื่อขั้น(เลขขั้นแถว(l)),
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
            headers={["รหัสลูกค้าเป้าหมาย","รหัสดีลเลอร์","ดีลเลอร์","ลูกค้า","ผู้ติดต่อ","จังหวัด","แหล่งที่มา","มูลค่า","ติดต่อล่าสุด","ต้องติดตาม","ผู้รับผิดชอบ","ขั้นตอน","เหตุผลที่ปิดไม่สำเร็จ"]}
            rows={filtered.map(leadToCells)} getRows={exportGetRows} />
      </TopbarActions>

      {/* โอนลูกค้าเป้าหมายใต้รหัส HQ ให้ดีลเลอร์ (ด่าน 1 · ใบ 0197) — HQ ไม่ขายตรง · ไม่มีลูกค้าเป้าหมายของ HQ = ไม่แสดง */}
      <HqLeadTransferCard dealerName={c => allDealers.find(d => d.code === c)?.name ?? ""} />

      {/* ── KPI ── หน้าตาเดียวกับ /hq/pipeline และแดชบอร์ดดีลเลอร์ (ค่าลอกมาตรง ๆ ห้ามเพี้ยน)
          แถบสีนำสายตาด้านซ้ายถูกตัดออก — หน้าอื่นไม่มี การ์ด KPI ต้องหน้าตาเหมือนกันทุกหน้า
          ต่างจากหน้าอื่นตรงที่ "กดเพื่อกรองสถานะได้" → คงปุ่ม + สถานะถูกเลือก (ขอบน้ำเงิน) ไว้ */}
      <KpiRow label="สรุปลูกค้าเป้าหมายทั้งเครือ" range={ช่วงการ์ด}>
        {kpiCards.map(k => (
          <KpiCard key={k.kpi} kpi={k.kpi} label={k.label} value={นับ(k.value)} rawValue={k.value} unit={k.unit} icon={k.Icon} color={k.color} bg={k.color + "17"}
            danger={k.kpi === "idle" && (k.value ?? 0) > 0} actionLabel={k.on && k.kpi === "idle" ? "กดอีกครั้งเพื่อล้างตัวกรอง" : k.kpi === "hqWaiting" ? "ไปที่การโอน" : "ดูรายการ"} onClick={k.onClick} />
        ))}
      </KpiRow>

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
          {leadSel(regionSel, setRegionSel, ป้ายทุกภูมิภาค, regionOpts.map(o => ({ v: o, l: ชื่อภาค(o) })))}
          {leadSel(province, setProvince, "ทุกจังหวัด", provinces.map(p => ({ v: p, l: p })))}
          {leadSel(srcSel, setSrcSel, "ทุกแหล่งที่มา", srcOpts.map(o => ({ v: o, l: o })))}
          {/* ต้องมีค่าเสมอ — กลุ่มขั้น: ค่าเริ่มต้นกำลังดำเนินการ (ขั้น 1–5) · ลีดปิดแล้วดูได้จากปิดสำเร็จ/ปิดไม่สำเร็จ/ทั้งหมด (บอสสั่ง 28 ต.ค. 69) */}
          <select aria-label={ช่อง.ขั้นตอน} value={status} onChange={e => setStatus(e.target.value)} className="form-input"
            style={{ flex: "1 1 0", minWidth: 96, maxWidth: 180, padding: "7px 10px", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer", textOverflow: "ellipsis" }}>
            <option value="OPEN">กำลังดำเนินการ</option>
            <option value="6">{ชื่อขั้น(6)}</option>
            <option value="7">{ชื่อขั้น(7)}</option>
            <option value="ALL">ทั้งหมด</option>
          </select>
          {anyFilter && (
            <button onClick={() => { setQuery(""); setDealerSel("ALL"); setRegionSel("ALL"); setProvince("ALL"); setSrcSel("ALL"); setStatus("OPEN"); }}
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
      {/* ── แถว 1 · แนวโน้ม · ตามสถานะ ── คู่ 2 คอลัมน์
          เดิม 3 คอลัมน์ (มี "ประเภทอาคารที่สนใจ" = จัดกลุ่มตามแม่แบบ) — การ์ดนั้นเอาออก: เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
          เหลือ 2 ใบจึงใช้กริดคู่ .hq-dealer-charts (ใช้ .hq-leads-row 3 คอลัมน์ต่อจะเว้าขวา) */}
      <div className="hq-dealer-charts" style={{ marginBottom: 12, alignItems: "stretch" }}>
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
                { name: "ลีดใหม่", color: "#003366", data: trend.newM },
                { name: "ใบเสนอราคา", color: "#0891b2", data: trend.quoteM },
                { name: ชื่อขั้น(6), color: "#10B981", data: trend.wonM },
                { name: ชื่อขั้น(7), color: "#dc2626", data: trend.lostM },
              ]} />
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><div className="card-title">ตามขั้นตอน</div></div>
          {/* data-ready = ตัวเลขมาจากฐานครบทั้งสองชุดแล้ว (ข้อทดสอบรอก่อนอ่าน · ระหว่างโหลดเป็นทางสำรองในเครื่อง) */}
          <div className="card-body" data-stage-chart data-ready={chartSummary && openSummary ? "1" : ""} style={{ paddingTop: 6, display: "flex", flexDirection: "column", gap: 10 }}>
            {byStatus.map(s => { const c = สีกราฟขั้น[s.stage]; return (
              <div key={s.stage} data-stage={s.stage} data-count={s.count}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: 3 }}>
                  <span style={{ color: "#374151", fontWeight: 600 }}>{ชื่อขั้น(s.stage)}</span><span style={{ fontWeight: 800, color: c }}>{s.count}</span>
                </div>
                <div style={{ height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                  <div className="bar-grow" style={{ height: "100%", width: `${s.pct}%`, background: c, borderRadius: 999 }} />
                </div>
              </div>
            ); })}
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
          <div className="card-body" data-source-chart data-ready={chartSummary ? "1" : ""} data-total={sources.reduce((t, x) => t + x.count, 0)}
            style={{ paddingTop: 6, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
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

      {/* การ์ด "ผลงานดีลเลอร์ 10 อันดับแรก" เอาออก (ผลตรวจ FLOW รอบ 5 แถว 22 · 28 ต.ค. 69) — FLOW: ผลงานดีลเลอร์ดูได้ที่ภาพรวมยอดขายที่เดียว */}
      {/* ── ตารางลูกค้าเป้าหมายทั้งเครือ — คอลัมน์ตามสเปก ──
          13 คอลัมน์ต้องการ ~1,500px แต่กรอบมี ~1,012px → เลื่อนแนวนอน (.table-wrap overflow-x:auto)
          ดีกว่าบีบจนอ่านไม่ออก · ความกว้างคุมที่ colgroup เท่านั้น (table-layout:fixed) */}
      {/* overflow: hidden — .card มีมุมโค้ง 16px แต่ไม่ตัดเนื้อใน (overflow: visible)
          หัวตารางพื้นเทาและเส้นแบ่งแถวเป็นมุมเหลี่ยม จึงทาบทับพ้นส่วนโค้งออกมาทั้งสี่มุม = "ตารางทะลุขอบ"
          เดิมไม่เจอเพราะการ์ดตัดมุมบนทิ้ง (เชื่อมกับแถบตัวกรอง) — พอคืนมุมโค้งครบ อาการเลยโผล่
          การเลื่อนแนวนอนยังทำงานปกติ เพราะ .table-wrap มี overflow-x: auto เป็นตัวเลื่อนของมันเอง */}
      <div className="card" data-lead-table data-ready={leadsPage ? "1" : ""} data-total={leadTotal} style={{ marginBottom: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table aria-label="ตารางลูกค้าเป้าหมายทั้งเครือ">
            {/* แบบเดียวกับตารางลูกค้าเป้าหมายฝั่งดีลเลอร์ (บอสส่งแบบ 28 ต.ค. 69) + คอลัมน์ดีลเลอร์ (บอสสั่ง 30 ต.ค. 69)
                · เอาคอลัมน์ "ความคืบหน้า %" ออก (ซ้ำป้ายขั้นตอน และขั้นตอนไม่มีตัวเลข)
                · "งานที่ต้องการ" คงไว้ = ช่อง project ที่ดีลเลอร์กรอกในฟอร์มลีด (ข้อมูลจริง · ไม่กรอก = "—")
                · ชื่อบริษัท / ดีลเลอร์ / มูลค่า / หัวคอลัมน์ ไม่ตัด ไม่ตกบรรทัดที่จอกว้าง — ชี้แล้วเห็นเต็ม (title)
                เพิ่ม/ลบคอลัมน์ต้องแก้ที่นี่เท่านั้น (table-layout: fixed — ใส่ที่ <th> ไม่มีผล) · รวม % = 100 */}
            <colgroup>
              <col style={{ width: "20%", minWidth: 190 }} />{/* บริษัท / ผู้ติดต่อ */}
              <col style={{ width: "15%", minWidth: 170 }} />{/* ดีลเลอร์ (รหัส + ชื่อ) */}
              <col style={{ width: "8%", minWidth: 112 }} />{/* จังหวัดหน้างาน */}
              <col style={{ width: "7%", minWidth: 104 }} />{/* ช่องทางที่มา */}
              <col style={{ width: "9%", minWidth: 112 }} />{/* งานที่ต้องการ */}
              <col style={{ width: "7%", minWidth: 104 }} />{/* พื้นที่ (ตร.ม.) */}
              <col style={{ width: "9%", minWidth: 124 }} />{/* ขั้นตอน — พอให้ "ทำใบให้ลูกค้า" ไม่ถูกตัด */}
              <col style={{ width: "8%", minWidth: 104 }} />{/* มูลค่า "฿12,345,678" */}
              <col style={{ width: "6%", minWidth: 104 }} />{/* ผู้รับผิดชอบ */}
              <col style={{ width: "8%", minWidth: 108 }} />{/* กิจกรรมล่าสุด "28 ต.ค. 2569" + ต้องติดตาม */}
              <col style={{ width: "3%", minWidth: 52 }} />{/* ดู — ไอคอนล้วน */}
            </colgroup>
            <thead><tr>
              <th>บริษัท / ผู้ติดต่อ</th><th>ดีลเลอร์</th><th>{ช่อง.จังหวัด}</th><th>{ช่อง.ช่องทาง}</th><th>{ช่อง.งาน}</th><th className="num">{ช่อง.พื้นที่}</th>
              <th>{ช่อง.ขั้นตอน}</th>
              <th className="num">มูลค่า</th><th>{ช่อง.ผู้รับผิดชอบ}</th><th>กิจกรรมล่าสุด</th>
              {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอแคบ (26 ส.ค. 69) */}
              <th style={ตรึงคอลัมน์ปุ่ม(true)} aria-label="ดู"></th>
            </tr></thead>
            <tbody>
              {displayLeads.length === 0 ? (
                <tr><td colSpan={11} style={{ padding: 0 }}><EmptyState icon={<Users size={26} />} title="ไม่พบลูกค้าเป้าหมาย" description="ลองปรับตัวกรองหรือคำค้น" /></td></tr>
              ) : displayLeads.map(l => {
                const c = สีขั้น(เลขขั้นแถว(l));
                const followUp = needsFollowUp(l, rulesOf(l.dealerCode).followUpAlertDays);
                // ติดต่อล่าสุด = กิจกรรมล่าสุดของลูกค้าเป้าหมาย · ลูกค้าเป้าหมายที่ไม่มีบันทึกกิจกรรม = "—" (ไม่เดาวันให้)
                const last = lastContactLabel(l);
                // คีย์ต้องพ่วงรหัสสาขา — เลขที่ลูกค้าเป้าหมายไม่ซ้ำ "เฉพาะภายในสาขา" (คีย์จริง = สาขา + เลขที่)
                // หน้านี้รวมลูกค้าเป้าหมายทุกสาขาไว้ด้วยกัน เลขเดียวกันจากคนละสาขาจึงชนกันได้จริง
                // พบจริงจากหน้าจอผู้ใช้ 7 ส.ค. 69: "two children with the same key #L-40322"
                // ผลคือ React แยกสองแถวไม่ออก อาจสลับ/ซ้ำ/หายเวลาข้อมูลอัปเดต (ตารางลูกค้าแก้ถูกอยู่แล้ว)
                return (
                  <ClickableRow key={`${l.dealerCode ?? ""}-${l.id}`} className="clickable" onActivate={() => setViewLead(l)} label={`เปิดรายละเอียดลูกค้าเป้าหมาย ${l.company}`}>
                    <td data-cell="company" title={[l.company, l.contact].filter(Boolean).join(" · ")}>
                      <div style={{ fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis" }}>{l.company || "—"}</div>
                      <div style={{ fontSize: "0.66rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis" }}>{l.contact || "—"}</div>
                    </td>
                    {/* ดีลเลอร์เจ้าของลีด (ลีดทั้งเครือ) — รหัส + ชื่อ */}
                    <td data-cell="dealer" title={`${l.dealerCode ?? "—"} ${DEALER_NAME.get(l.dealerCode ?? "") ?? l.dealerCode ?? "—"}`}>
                      <span className="badge" style={{ background: "#eef2f7", color: PRIMARY, fontFamily: "monospace" }}>{l.dealerCode || "—"}</span>
                      <div style={{ fontSize: "0.66rem", color: "var(--muted-foreground)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis" }}>{DEALER_NAME.get(l.dealerCode ?? "") ?? l.dealerCode ?? "—"}</div>
                    </td>
                    <td style={{ color: "var(--muted-foreground)" }} title={l.province || undefined}>{l.province || "—"}</td>
                    <td style={{ color: "var(--muted-foreground)", fontSize: "0.78rem" }} title={l.source || undefined}>{l.source || "—"}</td>
                    <td data-cell="project" style={{ color: "var(--muted-foreground)", fontSize: "0.78rem" }} title={l.project || undefined}>{l.project || "—"}</td>
                    <td className="num" style={{ color: "var(--muted-foreground)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>{l.area != null ? Number(l.area).toLocaleString() : "—"}</td>
                    {/* ── ปิดไม่สำเร็จ = ต้องเห็นเหตุผลจากหน้ารายการเลย (บอสสั่ง 21 ส.ค. 69) ──────
                        เดิมต้องเปิดแผงรายละเอียดทีละใบถึงจะรู้ว่าเสียงานเพราะอะไร
                        ⚠️ ใส่ไว้ใต้ป้ายสถานะ ไม่เพิ่มคอลัมน์ใหม่ — ตารางนี้เต็มความกว้างพอดีแล้ว
                           (ดูหมายเหตุที่ colgroup: เพิ่มคอลัมน์แล้วจะกลับมามีแถบเลื่อนแนวนอนอีก) */}
                    <td className="wrap">
                      <span className="badge" data-stage-label style={{ background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{ชื่อขั้น(เลขขั้นแถว(l))}</span>
                      {l.status === "CANCELLED" && (
                        <span title={l.lostReason || "ไม่ได้ระบุเหตุผล"}
                          style={{ display: "block", fontSize: "0.65rem", color: l.lostReason ? "#dc2626" : "#9ca3af", marginTop: 3,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.lostReason || "— ไม่ได้ระบุเหตุผล"}
                        </span>
                      )}
                    </td>
                    <td className="num" data-cell="value" style={{ fontWeight: 800, color: PRIMARY }} title={มูลค่าอ่านง่าย(มูลค่าลีด(l))}>{มูลค่าอ่านง่าย(มูลค่าลีด(l))}</td>
                    <td className="wrap"><AssigneeAvatars value={l.assigned} size={24} /></td>
                    <td className="wrap" data-cell="activity">
                      <span style={{ color: "var(--muted-foreground)", fontSize: "0.76rem", whiteSpace: "nowrap" }}>{last}</span>
                      {followUp && <span className="badge" style={{ display: "table", marginTop: 3, background: "#fff3e6", color: "#d97706", whiteSpace: "nowrap" }}>ต้องติดตาม</span>}
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
        const c = สีขั้น(เลขขั้นแถว(l));
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
                      <span className="badge" data-stage-label style={{ background: c.bg, color: c.text }}>{ชื่อขั้น(เลขขั้นแถว(l))}</span>
                      <span className="badge" style={{ background: "rgba(255,255,255,.15)", color: "#fff" }}>{มูลค่าอ่านง่าย(มูลค่าลีด(l))}</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setViewLead(null)} title="ปิด" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,.2)",
                  background: "rgba(255,255,255,.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} /></button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px 20px" }}>
                {/* แถบสรุปบนสุด — ยอดใบเสนอราคาล่าสุด กับสถานะใบเสนอราคา อ่านได้ตั้งแต่ยังไม่เลื่อนจอ (บอสตัดสิน 20 ต.ค. 69 · ข้อ 5 · ใบ 0223) */}
                <PanelStats>
                  <PanelStat label="ใบเสนอราคาล่าสุด" value={มูลค่าอ่านง่าย(มูลค่าลีด(l))} />
                  {/* ขั้นจาก leadStage.ts (เดิม "เสนอราคาแล้ว" = ชื่อสถานะภายใน · ผลตรวจ FLOW รอบ 5 แถว 19) */}
                  <PanelStat label={ช่อง.ขั้นตอน} tone={เลขขั้นแถว(l) === 6 ? "good" : "plain"} value={ชื่อขั้น(เลขขั้นแถว(l))} />
                </PanelStats>

                {/* ชุดช่องมาตรฐาน (lib/fieldLabels.ts · บอสสั่ง 26 ต.ค. 69): ข้อมูลลูกค้า · ข้อมูลงาน · การดูแล — ชื่อช่องเดียวกับแผงลีดดีลเลอร์ */}
                <PanelSection icon={User} title={กลุ่มช่อง.ลูกค้า}>
                  <PanelRow icon={User} label={ช่อง.ผู้ติดต่อ} value={l.contact} />
                  <PanelRow icon={Phone} label={ช่อง.โทรศัพท์} value={เบอร์อ่านง่าย(l.phone)} />
                  <PanelRow icon={Mail} label={ช่อง.อีเมล} value={l.email} />
                  <PanelRow icon={MapPin} label={ช่อง.ที่อยู่} value={l.address} />
                </PanelSection>

                <PanelSection icon={Compass} title={กลุ่มช่อง.งาน}>
                  <PanelRow icon={MapPin} label={ช่อง.จังหวัด} value={l.province} />
                  <PanelRow icon={Compass} label={ช่อง.งาน} value={l.project} />
                  <PanelRow icon={Compass} label={ช่อง.พื้นที่} value={l.area != null && l.area > 0 ? l.area.toLocaleString("th-TH") : undefined} />
                  <PanelRow icon={Compass} label={ช่อง.สเปก} value={l.note} />
                </PanelSection>

                <PanelSection icon={UserCheck} title={กลุ่มช่อง.การดูแล}>
                  <PanelRow icon={Compass} label={ช่อง.ช่องทาง} value={l.source} />
                  <PanelRow icon={CalendarDays} label="สร้างเมื่อ" value={วันที่สร้างอ่านง่าย(l.createdAt)} />
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
                            {/* ตัวจัดรูปวันที่กลาง (พ.ศ.) — ข้อมูลเดิมเก็บ ISO ค.ศ. บางรายการ (ผลตรวจ FLOW รอบ 5 แถว 20) */}
                            <span style={{ display: "block", fontSize: "0.66rem", color: "#94A3B8", marginTop: 2 }}>{วันที่แสดงไทย(a.date) || "—"}</span>
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
