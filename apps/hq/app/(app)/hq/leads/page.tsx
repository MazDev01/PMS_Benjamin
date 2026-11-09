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
import { หัวเจาะลึก, useเจาะลึก, ในขอบเขต, ขอบเขตทั้งเครือ, ขอบเขตของดีลเลอร์, ป้ายระดับของขอบ, type ขอบเขต } from "../_drill/DrillEngine";
import { ซ่อนตามระดับ } from "@pms/shared/lib/drillColumns";
import { คำอธิบายหัวข้อ } from "@pms/shared/lib/drillTitles";
import { BoxTitle } from "@pms/shared/components/ui/BoxTitle";
import { ตั้งค่าเจาะลึกทั้งหมด } from "@pms/shared/lib/hqDrillConfig";
import { รวมคีย์, เดือนในช่วง } from "@pms/shared/lib/hqDrill";
import {
  Users, AlarmClock, X, GitBranch, Eye,
  User, Phone, Mail, MapPin, Compass, Wallet, CalendarDays,
  Store, IdCard, UserCheck, FileText, Activity, CalendarClock, Paperclip, StickyNote, Lock, AlertTriangle,
} from "lucide-react";
import { useNetworkLeads, useLeadSummary, useLeadsPage, useUnassignedLeads, useLeadAppointments } from "@pms/shared/lib/useNetworkData";
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
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useSales } from "@pms/shared/context/SalesContext";
import { DEALER_FILES_EVENT, type DealerFile } from "@pms/shared/lib/mock";
import { files as filesRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { GroupedBarChart, Donut } from "@pms/shared/components/ui/Charts";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { ช่อง, กลุ่มช่อง } from "@pms/shared/lib/fieldLabels";
import { วันที่แสดงไทย } from "@pms/shared/lib/thaiDate";
import { เลขขั้นของลีด, ชื่อขั้น, สีขั้น, สีกราฟขั้น, ตัวเลือกขั้น, เลขขั้นทั้งหมด, ขั้นเปิดอยู่, ป้ายย่อยขั้น, แปลงชื่อขั้นเดิม, type เลขขั้น } from "@pms/shared/lib/leadStage";
import { quoteBelongsToLead } from "@pms/shared/lib/leadQuote";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { fmtBaht, fmtFull, formatPhone } from "@pms/shared/lib/format";
import { groupLostReasons, withUnspecified } from "@pms/shared/lib/lostReasons";
import { HqLeadTransferCard } from "@pms/shared/components/hq/HqLeadTransferCard";
import { สร้างชื่อแสดง } from "@pms/shared/lib/dealerDisplayName";

// ── ตัวเลขและเบอร์โทรบนหน้าสำนักงานใหญ่ ต้องอ่านง่ายเหมือนฝั่งดีลเลอร์ (บอสสั่ง 21 ส.ค. 69) ──
//   มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (บอสตัดสิน 20 ต.ค. 69 · ข้อ 5 · ใบ 0223) — ยังไม่มีใบ = "—"
const มูลค่าอ่านง่าย = (n: number | null) => n == null ? "—" : fmtFull(n);
const เบอร์อ่านง่าย = (v?: string) => formatPhone(String(v ?? "")) || "—";

const PRIMARY = "#003366";

// ── เจาะลึกแบบเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69 · ใบ 0271) — การ์ด/คอลัมน์จากตั้งค่ากลาง (แหล่งเดียวกับข้อทดสอบ) ──
const ตั้งค่าลีด = ตั้งค่าเจาะลึกทั้งหมด.leads;
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
// "ต้องติดตาม" = ลูกค้าเป้าหมายที่ยังไม่ปิด และเงียบเกินเกณฑ์ของสาขาเจ้าของลูกค้าเป้าหมาย (needsFollowUp)
// ⚠️ ห้ามกลับไปใช้รายการสถานะ: เดิมนับจากสถานะ (ติดต่อแล้ว + สถานะติดตามแบบเก่า) ซึ่งไม่ได้นับวันเลย
//    แต่ป้ายเขียนว่า ">7 วัน" → ตัวเลขไม่ตรงกับคำ และไม่ตรงกับที่ดีลเลอร์เห็นบนหน้าตัวเอง
//    เกณฑ์วันเป็นของแต่ละสาขา (ดีลเลอร์ตั้งเอง) → ต้องถามด้วย dealerCode ของลูกค้าเป้าหมายใบนั้นเสมอ


export default function HQLeadsPage() {
  const router = useRouter();
  const { timeRange } = useFilters();
  const leads = useNetworkLeads();
  // เกณฑ์เป็นของแต่ละสาขา (ดีลเลอร์ตั้งเองที่ ตั้งค่า › การแจ้งเตือน) → ถามเป็นรายใบด้วย dealerCode
  const rulesOf = useLeadRulesOf();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [query, setQuery] = useState("");
  // ตัวกรองขั้น = เลขขั้น (1–4 · 6 ปิดสำเร็จ · 7 ปิดไม่สำเร็จ) จากตัวกลาง leadStage.ts (บอสสั่ง 27 ต.ค. 69 · เดิมกรองตามชื่อสถานะภายใน) · ALL = ทุกขั้น
  // กลุ่มขั้น (บอสสั่ง 28 ต.ค. 69): OPEN = กำลังดำเนินการ ขั้น 1–4 (ค่าเริ่มต้น) · "6" ปิดสำเร็จ · "7" ปิดไม่สำเร็จ · ALL = ทั้งหมด
  const [status, setStatus] = useState<string>("OPEN");
  // เลขขั้นของแถว: แถวจากฐาน (leads_page ใบ 0251) มี stageNo · โหมดตัวอย่าง/ค้างติดตาม คิดจากใบร่างที่มีในเครื่อง
  const เลขขั้นแถว = (l: LeadRow): เลขขั้น => (l.stageNo as เลขขั้น | undefined)
    ?? เลขขั้นของลีด(l.status, quotations.some(q => q.status === "draft" && quoteBelongsToLead(q, l)));
  // ป้ายย่อยขั้นเสนอราคาลูกค้า (ทำใบแล้ว ยังไม่ส่ง / ส่งให้ลูกค้าแล้ว · บอสสั่ง 9 พ.ย. 69) — ได้ราคา HQ + ขั้น 4 = มีใบร่าง (กติกา lead_stage_no)
  const ป้ายย่อยแถว = (l: LeadRow) => ป้ายย่อยขั้น(l.status, เลขขั้นแถว(l) === 4);
  const [viewLead, setViewLead] = useState<LeadRow | null>(null);
  // โดนัท 2 ใบ: ชี้ก้อนสีหรือแถวคำอธิบาย เน้นก้อนเดียวกัน (บอสสั่ง 20 ส.ค. 69 · ย้ายมาจากโดนัทหน้าลูกค้าที่เอาออก 2 พ.ย. 69)
  const [เน้นแหล่ง, setเน้นแหล่ง] = useState<number | null>(null);
  const [เน้นเหตุผล, setเน้นเหตุผล] = useState<number | null>(null);  // Drawer — ดูอย่างเดียว
  // ?open=รหัสสาขา:รหัสลีด (กดแถวในแท็บลูกค้าเป้าหมายของแผงดีลเลอร์ · บอสสั่ง 30 ต.ค. 69) = เปิดแผงลีดนั้น แล้วล้างออกจาก URL
  //   รหัสลีดซ้ำกันได้ข้ามสาขา → ค้นในสาขานั้นเท่านั้น · ไม่พบ = ไม่เปิดอะไร
  useEffect(() => {
    const ค่า = new URLSearchParams(window.location.search).get("open");
    if (!ค่า) return;
    window.history.replaceState(null, "", window.location.pathname);
    const k = ค่า.indexOf(":");
    const สาขา = ค่า.slice(0, k), รหัส = ค่า.slice(k + 1);
    if (k < 1 || !รหัส) return;
    let alive = true;
    leadsRepo.listPage(undefined, { limit: 20, offset: 0, dealerCodes: [สาขา], search: รหัส })
      .then(r => { const l = r.rows.find(x => x.id === รหัส && dealerCodeOf(x) === สาขา); if (alive && l) setViewLead(l); })
      .catch(e => logRepoRead("leads.listPage(open)", e));
    return () => { alive = false; };
  }, []);
  // ระดับที่เลือก (ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์) — ทุกการ์ด/กราฟ/รายชื่อคิดตามระดับนี้ (บอสสั่ง 2 พ.ย. 69)
  const [ขอบ, setขอบ] = useState<ขอบเขต>(ขอบเขตทั้งเครือ);
  const ช่วงการ์ด = useMemo(() => ({ start: isoDateOf(timeRange.start), end: isoDateOf(timeRange.end) }), [timeRange.start, timeRange.end]);
  const เจาะลึก = useเจาะลึก("leads", ช่วงการ์ด.start, ช่วงการ์ด.end, isoDateOf(APP_NOW));
  // ?dealer=รหัส (ปุ่ม "ดูทั้งหมด" ลีดล่าสุดของดีลเลอร์ในภาพรวมยอดขาย · 30 ต.ค. 69) = เจาะลงดีลเลอร์นั้น (รอแถวรายดีลเลอร์โหลดก่อน) แล้วล้างออกจาก URL
  const [ดีลเลอร์จากลิงก์, setดีลเลอร์จากลิงก์] = useState<string | null>(null);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("dealer");
    if (!code) return;
    setดีลเลอร์จากลิงก์(code.toUpperCase());
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  useEffect(() => {
    if (!ดีลเลอร์จากลิงก์ || !เจาะลึก) return;
    if (เจาะลึก.dealers.some(d => d.code === ดีลเลอร์จากลิงก์)) setขอบ(ขอบเขตของดีลเลอร์(เจาะลึก.dealers, ดีลเลอร์จากลิงก์));
    setดีลเลอร์จากลิงก์(null);
  }, [ดีลเลอร์จากลิงก์, เจาะลึก]);
  // ชุดดีลเลอร์ของระดับที่เลือก (ทั้งเครือ = ไม่กรอง)
  const ชุดดีลเลอร์ = useMemo<string[] | undefined>(() => ขอบ.ภาค || ขอบ.จังหวัด || ขอบ.ดีลเลอร์
    ? ในขอบเขต(เจาะลึก?.dealers ?? [], ขอบ).map(r => r.code) : undefined, [เจาะลึก, ขอบ]);
  const [srcSel, setSrcSel] = useState<string>("ALL");
  // ป้ายระดับที่เลือก สำหรับหัวข้อกราฟ/ตาราง (บอสสั่ง 3 พ.ย. 69)
  const ระดับ = ป้ายระดับของขอบ(ขอบ, เจาะลึก?.dealers ?? []);

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

  // ตัวเลือกตัวกรอง — จากลูกค้าเป้าหมายจริงในช่วง (ไม่ hardcode) · supabase: lead_summary (เวลาอย่างเดียว) · local/ยังไม่กลับ: scoped
  const optsSummary = useLeadSummary(useMemo(() => ({ dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end) }), [timeRange.start, timeRange.end]));
  const srcOpts = useMemo(() => (optsSummary
    ? optsSummary.bySource.map(s => s.source)
    : [...new Set(scoped.map(l => l.source || "ไม่ระบุ"))]).sort((a, b) => a.localeCompare(b, "th")), [optsSummary, scoped]);
  // ฐานของ KPI = ตัวกรอง "ขอบเขต" ทุกตัว (ดีลเลอร์ · ภูมิภาค · จังหวัด · แหล่งที่มา · ค้นหา)
  // แต่ยังไม่กรองด้วย "สถานะ" และ "ต้องติดตามด่วน" — สองอันนั้นคือปุ่มของการ์ด KPI เอง
  // ถ้า KPI ตามสองอันนั้นด้วย ตัวเลขจะยุบเหลือค่าเดียวทันทีที่กด การ์ดจะไร้ความหมาย
  const ตรงขอบเขต = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (l: LeadRow) =>
      (!ชุดดีลเลอร์ || ชุดดีลเลอร์.includes(dealerCodeOf(l))) &&
      (srcSel === "ALL" || (l.source || "ไม่ระบุ") === srcSel) &&
      (!q || (l.company + l.contact + l.province + l.assigned + (l.id ?? "") + (l.dealerCode ?? "")).toLowerCase().includes(q));
  }, [query, ชุดดีลเลอร์, srcSel]);
  // ณ ตอนนี้ (ไม่ผูกช่วงเวลา): ลีดที่เปิดอยู่ · ไม่เคลื่อนไหว — บอสตัดสิน 22 ต.ค. 69 (ยืนยันอีกครั้ง 30 ต.ค. 69)
  const kpiBaseAll = useMemo(() => ของดีลเลอร์.filter(ตรงขอบเขต), [ของดีลเลอร์, ตรงขอบเขต]);
  // ตามช่วงเวลา (วันที่ลีดเข้ามา): ลีดใหม่ · ปิดสำเร็จ/ปิดไม่สำเร็จ · กราฟ
  const kpiBase = useMemo(() => scoped.filter(ตรงขอบเขต), [scoped, ตรงขอบเขต]);

  // ตาราง: "กำลังดำเนินการ" (ขั้น 1–4 · การ์ดลีดที่เปิดอยู่/ไม่เคลื่อนไหว) = ณ ตอนนี้ · ขั้นอื่น/ทั้งหมด = ตามช่วง
  const filtered = useMemo(() => (status === "OPEN" ? kpiBaseAll : kpiBase).filter(l =>
    (status === "ALL" || (status === "OPEN" ? ขั้นเปิดอยู่(เลขขั้นแถว(l)) : เลขขั้นแถว(l) === Number(status))) &&
    (!overdueOnly || needsFollowUp(l, 30))
  ), [kpiBase, kpiBaseAll, status, overdueOnly, quotations]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── M9 Phase 2: สรุปลูกค้าเป้าหมายหลังกรองที่ DB (supabase) · local/overdue/ระหว่างโหลด = client fallback ──
  const leadDealerCodes = ชุดดีลเลอร์;
  // กราฟ = ระดับที่เลือก + ช่วงเท่านั้น (บอสสั่ง 2 พ.ย. 69 · ไม่ผูกคำค้น/แหล่งที่มา/ขั้นของรายชื่อ) → ผลรวมกราฟขั้นตอน = การ์ด · วงกลมแหล่งที่มา = การ์ดลีดใหม่
  const baseF: LeadSummaryFilters = { dealerCodes: leadDealerCodes, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end) };
  const chartSummary = useLeadSummary(baseF);
  // กราฟตามขั้นตอน ขั้น 1–4 = ลีดที่เปิดอยู่ ณ ตอนนี้ (ชุดเดียวกับการ์ด "ลีดที่เปิดอยู่") · ขั้น 6–7 = ปิดในช่วง (ตามวันที่ลีดเข้ามา)
  const openSummary = useLeadSummary({ ...baseF, dateStart: undefined, dateEnd: undefined });

  // ── ตารางลูกค้าเป้าหมาย: แบ่งหน้าที่ DB (M9 Phase 4) · local/ยังไม่กลับ = filtered (client) ──
  // 10 แถว/หน้าเท่าทุกตารางในระบบ (บอสสั่ง 13 ส.ค. 69 — เดิมหน้านี้ 25 อยู่หน้าเดียวที่ไม่เหมือนใคร)
  const LEADS_PAGE = ROWS_PER_PAGE;
  const [leadPage, setLeadPage] = useState(0);
  const leadOpts: LeadListOpts = useMemo(() => ({
    limit: LEADS_PAGE, offset: leadPage * LEADS_PAGE,
    // 0 = กำลังดำเนินการ (ขั้น 1–4 · ใบ 0256)
    stage: status === "ALL" ? undefined : status === "OPEN" ? 0 : Number(status), dealerCodes: leadDealerCodes,
    source: srcSel === "ALL" ? undefined : srcSel, search: query.trim() || undefined,
    // กำลังดำเนินการ (ขั้น 1–4) = ณ ตอนนี้ ตรงการ์ดลีดที่เปิดอยู่ (ไม่ผูกช่วง) · ขั้นอื่น/ทั้งหมด = ลีดที่เข้ามาในช่วง
    dateStart: status === "OPEN" ? undefined : isoDateOf(timeRange.start), dateEnd: status === "OPEN" ? undefined : isoDateOf(timeRange.end),
    // การ์ด "ไม่เคลื่อนไหวเกิน 30 วัน" (ใบ 0246) = ตัวกรองค้างติดตามที่ 30 วันทุกสาขา (กติกาเดียวกับฐาน)
    overdue: overdueOnly, asOf: isoDateOf(APP_NOW), defaultDays: 30, perDealer: undefined,
  }), [leadPage, status, leadDealerCodes, srcSel, query, timeRange.start, timeRange.end, overdueOnly]);
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
    dealerCodes: leadDealerCodes,
    source: srcSel === "ALL" ? undefined : srcSel,
    search: query.trim() || undefined, dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
  }), [perDealerHours, leadDealerCodes, srcSel, query, timeRange.start, timeRange.end]));
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
  const anyFilter = !!query.trim() || status !== "OPEN" || srcSel !== "ALL" || overdueOnly;


  // ชื่อแสดงของดีลเลอร์ (ตัวกลาง · ไม่มีรหัสบนจอ · ชื่อซ้ำ = "ชื่อ (รหัส)" · บอสสั่ง 6 พ.ย. 69)
  const DEALER_NAME = useMemo(() => { const f = สร้างชื่อแสดง(allDealers); return new Map(allDealers.map(d => [d.code, f(d.code, d.name)])); }, [allDealers]);


  // ── ลีดใหม่รายเดือน (แบบหน้า) — แถวรายดีลเลอร์รายเดือนชุดเดียวกับการ์ด (hq_drill) · รวมลีดใหม่ = การ์ดลีดใหม่ ──
  //   ปิดสำเร็จ/ไม่สำเร็จ = ลีดที่เข้ามาในเดือนนั้นและปิดแล้ว (= ภาพรวมยอดขาย)
  const trend = useMemo(() => {
    const ช่อง = เดือนในช่วง(ช่วงการ์ด.start, ช่วงการ์ด.end);
    if (!เจาะลึก) return { months: ช่อง.map(c => c.label), newM: ช่อง.map(() => 0), wonM: ช่อง.map(() => 0), lostM: ช่อง.map(() => 0), ready: false };
    const codes = new Set(ในขอบเขต(เจาะลึก.dealers, ขอบ).map(r => r.code));
    const ms = เจาะลึก.months.filter(m => codes.has(m.code));
    const ของ = (y: number, m: number, k: string) => รวมคีย์(ms.filter(x => x.y === y && x.m === m), k);
    return { months: ช่อง.map(c => c.label), newM: ช่อง.map(c => ของ(c.y, c.m, "leads")), wonM: ช่อง.map(c => ของ(c.y, c.m, "won")), lostM: ช่อง.map(c => ของ(c.y, c.m, "lost")), ready: true };
  }, [เจาะลึก, ขอบ, ช่วงการ์ด.start, ช่วงการ์ด.end]);

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
    // ขั้น 1–4 = เปิดอยู่ ณ ตอนนี้ (openSummary · ชุดเดียวกับการ์ด) · ขั้น 6–7 = ปิดในช่วง (chartSummary)
    const จากฐาน = (sum: typeof chartSummary) => sum ? new Map((sum.byStage ?? []).map(r => [r.stage, r.count])) : null;
    const เปิด = จากฐาน(openSummary), ช่วง = จากฐาน(chartSummary);
    const count = (n: เลขขั้น) => {
      const ฐาน = ขั้นเปิดอยู่(n) ? เปิด : ช่วง;
      return ฐาน ? (ฐาน.get(n) ?? 0) : (ขั้นเปิดอยู่(n) ? kpiBaseAll : kpiBase).filter(l => เลขขั้นแถว(l) === n).length;
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

  // คอลัมน์ที่ระดับเจาะบอกอยู่แล้ว (บอสสั่ง 9 พ.ย. 69 · ตัวกลาง drillColumns) — ตารางรายชื่อ
  const ซ่อนรายชื่อ = ซ่อนตามระดับ({ ภาค: ขอบ.ภาค, จังหวัด: ขอบ.จังหวัด, ดีลเลอร์: ขอบ.ดีลเลอร์ }, displayLeads, { จังหวัด: l => l.province });

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

      {/* ── เจาะลึก: ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ › เดือน (บอสสั่ง 2 พ.ย. 69) · ทุกส่วนคิดตามระดับที่เลือก · แถวรวม = การ์ด ── */}
      <หัวเจาะลึก ตั้งค่า={ตั้งค่าลีด} ข้อมูล={เจาะลึก} ขอบ={ขอบ} ตั้งขอบ={setขอบ} ช่วง={ช่วงการ์ด} ชื่อแถวการ์ด="สรุปลูกค้าเป้าหมายทั้งเครือ" />
      <div style={{ height: 16 }} />

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
          <BoxTitle ชื่อ={`กราฟลีดใหม่รายเดือน · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วงการ์ด, "รวม = การ์ดลีดใหม่", "ปิดสำเร็จ/ไม่สำเร็จ = ลีดที่เข้ามาในเดือนนั้น")} />
          <div className="card-body" data-lead-monthly data-ready={trend.ready ? "1" : ""} data-sum-new={trend.newM.reduce((a, b) => a + b, 0)}
            data-sum-won={trend.wonM.reduce((a, b) => a + b, 0)} data-sum-lost={trend.lostM.reduce((a, b) => a + b, 0)}
            style={{ paddingTop: 4, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {/* vw = ความกว้าง viewBox ต้องใกล้ความกว้างการ์ดจริง (~480px) ไม่งั้น SVG ถูกย่อตามสัดส่วน
                เดิมไม่ได้ส่ง vw → ใช้ค่าเริ่มต้น 1180 → อัตราส่วน 1180:250 ทำให้กราฟสูงจริงแค่ ~100px ลอยอยู่กลางการ์ด
                (หน้าอื่นที่การ์ดแคบส่ง vw กันหมดแล้ว — หน้านี้ตกหล่นอยู่หน้าเดียว)
                แท่งกลุ่ม ไม่ใช่แท่งซ้อน — สี่ชุดนี้เป็นขั้นของลูกค้าเป้าหมายเดียวกัน บวกกันแล้วยอดรวมไม่มีความหมาย */}
            <GroupedBarChart months={trend.months} vw={560} height={210} fmt={v => `${Math.round(v)}`}
              series={[
                { name: "ลีดใหม่", color: "#003366", data: trend.newM },
                { name: ชื่อขั้น(6), color: "#10B981", data: trend.wonM },
                { name: ชื่อขั้น(7), color: "#dc2626", data: trend.lostM },
              ]} />
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <BoxTitle ชื่อ={`กราฟลีดตามขั้นตอน · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วงการ์ด, "ขั้น 1–4 = ลีดที่เปิดอยู่ ณ ตอนนี้", "ปิดสำเร็จ/ไม่สำเร็จ = ปิดในช่วง")} />
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
          <BoxTitle ชื่อ={`กราฟลีดตามแหล่งที่มา · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วงการ์ด, "ลีดที่เข้ามาในช่วง", "กลางวง = รวมทั้งหมด")}><GitBranch size={16} color="#9ca3af" /></BoxTitle>
          <div className="card-body" data-source-chart data-ready={chartSummary ? "1" : ""} data-total={sources.reduce((t, x) => t + x.count, 0)}
            style={{ paddingTop: 6, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
            {!sources.length ? (
              <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>— ไม่มีข้อมูลในช่วงที่เลือก</div>
            ) : (<>
              <Donut
                segments={sources.map((s, i) => ({ label: s.label, value: s.count, color: RAMP[i % RAMP.length] }))}
                centerLabel="ทั้งหมด"
                centerValue={`${sources.reduce((s, x) => s + x.count, 0)}`}
                size={150} activeIndex={เน้นแหล่ง} onActiveChange={setเน้นแหล่ง}
              />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }} onMouseLeave={() => setเน้นแหล่ง(null)}>
                {sources.map((s, i) => (
                  <div key={s.label} tabIndex={0} aria-label={`${s.label} ${s.count} (${s.share}%)`}
                    onMouseEnter={() => setเน้นแหล่ง(i)} onFocus={() => setเน้นแหล่ง(i)} onBlur={() => setเน้นแหล่ง(null)}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", opacity: เน้นแหล่ง != null && เน้นแหล่ง !== i ? 0.45 : 1, transition: "opacity 0.15s ease" }}>
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
          <BoxTitle ชื่อ={`กราฟเหตุผลที่ปิดการขายไม่สำเร็จ · ${ระดับ}`} คำอธิบาย={คำอธิบายหัวข้อ(ช่วงการ์ด, "ลีดที่ปิดไม่สำเร็จ แยกตามเหตุผล", "ไม่ได้บันทึกเหตุผล = ก้อนอื่นๆ")} />
          <div className="card-body" style={{ paddingTop: 6, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
            {!lostReasons.length ? (
              <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>— ไม่มีข้อมูลในช่วงที่เลือก</div>
            ) : (<>
              <Donut
                segments={lostReasons.map((r, i) => ({ label: r.reason, value: r.count, color: LOST_RAMP[i % LOST_RAMP.length] }))}
                centerLabel="ปิดไม่สำเร็จ"
                centerValue={`${lostReasons.reduce((s, r) => s + r.count, 0)}`}
                size={150} activeIndex={เน้นเหตุผล} onActiveChange={setเน้นเหตุผล}
              />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }} onMouseLeave={() => setเน้นเหตุผล(null)}>
                {(() => {
                  const รวม = lostReasons.reduce((s, r) => s + r.count, 0) || 1;
                  return lostReasons.map((r, i) => (
                    // ก้อน "อื่นๆ (ระบุเอง)" ชี้เมาส์แล้วเห็นข้อความจริงที่ดีลเลอร์พิมพ์ไว้ (ยุบเพื่อให้อ่านง่าย ไม่ใช่ซ่อน)
                    <div key={r.reason} title={r.details?.length ? r.details.join(" · ") : undefined}
                      tabIndex={0} aria-label={`${r.reason} ${r.count} (${Math.round(r.count / รวม * 100)}%)`}
                      onMouseEnter={() => setเน้นเหตุผล(i)} onFocus={() => setเน้นเหตุผล(i)} onBlur={() => setเน้นเหตุผล(null)}
                      style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", opacity: เน้นเหตุผล != null && เน้นเหตุผล !== i ? 0.45 : 1, transition: "opacity 0.15s ease" }}>
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
      {/* ── ตัวกรองรายชื่อ (คุมเฉพาะรายชื่อด้านล่าง · ระดับ ดีลเลอร์/ภาค/จังหวัด อยู่ที่ตัวเจาะลึกด้านบน) ── */}
      <div className="card hq-sticky-filter" style={{ marginBottom: 12 }}>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 14, paddingBottom: 14 }}>
          <div data-box-title style={{ flex: "0 0 auto", marginRight: 6 }}>
            <div className="card-title" data-title>ตารางรายชื่อลูกค้าเป้าหมาย · {ระดับ}</div>
            <div data-subtitle style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", marginTop: 2 }}>
              {status === "OPEN" ? คำอธิบายหัวข้อ(null, "ลีดที่กำลังดำเนินการ", "กดแถวเพื่อเปิด") : คำอธิบายหัวข้อ(ช่วงการ์ด, "ลีดที่เข้ามาในช่วง", "กดแถวเพื่อเปิด")}
            </div>
          </div>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…" aria-label="ค้นหาลูกค้าเป้าหมาย"
            className="form-input" style={{ flex: "1 1 150px", minWidth: 130, maxWidth: 240, padding: "7px 11px", fontSize: "0.74rem" }} />
          {leadSel(srcSel, setSrcSel, "ทุกแหล่งที่มา", srcOpts.map(o => ({ v: o, l: o })))}
          {/* ต้องมีค่าเสมอ — กลุ่มขั้น: ค่าเริ่มต้นกำลังดำเนินการ (ขั้น 1–4) · ลีดปิดแล้วดูได้จากปิดสำเร็จ/ปิดไม่สำเร็จ/ทั้งหมด (บอสสั่ง 28 ต.ค. 69) */}
          <select aria-label={ช่อง.ขั้นตอน} value={status} onChange={e => setStatus(e.target.value)} className="form-input"
            style={{ flex: "1 1 0", minWidth: 96, maxWidth: 180, padding: "7px 10px", fontSize: "0.74rem", fontWeight: 600, cursor: "pointer", textOverflow: "ellipsis" }}>
            <option value="OPEN">กำลังดำเนินการ</option>
            <option value="6">{ชื่อขั้น(6)}</option>
            <option value="7">{ชื่อขั้น(7)}</option>
            <option value="ALL">ทั้งหมด</option>
          </select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.74rem", fontWeight: 600, color: "#374151", cursor: "pointer" }}>
            <input type="checkbox" checked={overdueOnly} onChange={e => { setOverdueOnly(e.target.checked); if (e.target.checked) setStatus("OPEN"); }} />
            ไม่เคลื่อนไหวเกิน 30 วัน
          </label>
          {anyFilter && (
            <button onClick={() => { setQuery(""); setSrcSel("ALL"); setStatus("OPEN"); setOverdueOnly(false); }}
              className="btn btn-secondary btn-sm" style={{ flexShrink: 0, whiteSpace: "nowrap" }}>ล้างตัวกรอง</button>
          )}
        </div>
      </div>

      <div className="card" data-lead-table data-ready={leadsPage ? "1" : ""} data-total={leadTotal} style={{ marginBottom: 0, overflow: "hidden" }}>
        {/* พอดีจอ 1366 ไม่มีแถบเลื่อนแนวนอน (บอสสั่ง 9 พ.ย. 69 · .table-wrap.fit · สัดส่วน % ไม่มีความกว้างขั้นต่ำ · ตัดคำด้วย … ชี้แล้วเห็นเต็ม)
            คอลัมน์ที่ระดับเจาะบอกอยู่แล้ว ซ่อน (ตัวกลาง drillColumns): ระดับดีลเลอร์ = ไม่มีคอลัมน์ดีลเลอร์ · ทุกแถวจังหวัดเดียวกับระดับ = ไม่มีคอลัมน์จังหวัด */}
        <div className="table-wrap fit">
          <table aria-label="ตารางลูกค้าเป้าหมายทั้งเครือ" data-hidden-cols={[ซ่อนรายชื่อ.ดีลเลอร์ && "dealer", ซ่อนรายชื่อ.จังหวัด && "province"].filter(Boolean).join(",")}>
            {/* แบบเดียวกับตารางลูกค้าเป้าหมายฝั่งดีลเลอร์ (บอสส่งแบบ 28 ต.ค. 69) + คอลัมน์ดีลเลอร์ (บอสสั่ง 30 ต.ค. 69)
                · เอาคอลัมน์ "ความคืบหน้า %" ออก (ซ้ำป้ายขั้นตอน และขั้นตอนไม่มีตัวเลข)
                · "งานที่ต้องการ" คงไว้ = ช่อง project ที่ดีลเลอร์กรอกในฟอร์มลีด (ข้อมูลจริง · ไม่กรอก = "—")
                · ชื่อบริษัท / ดีลเลอร์ / มูลค่า / หัวคอลัมน์ ไม่ตัด ไม่ตกบรรทัดที่จอกว้าง — ชี้แล้วเห็นเต็ม (title)
                เพิ่ม/ลบคอลัมน์ต้องแก้ที่นี่เท่านั้น (table-layout: fixed — ใส่ที่ <th> ไม่มีผล) · รวม % = 100 */}
            <colgroup>
              <col style={{ width: `${17 + (ซ่อนรายชื่อ.ดีลเลอร์ ? 12 : 0) + (ซ่อนรายชื่อ.จังหวัด ? 9 : 0)}%` }} />{/* บริษัท / ผู้ติดต่อ (ได้ที่ของคอลัมน์ที่ซ่อน) */}
              {!ซ่อนรายชื่อ.ดีลเลอร์ && <col style={{ width: "12%" }} />}{/* ดีลเลอร์ */}
              {!ซ่อนรายชื่อ.จังหวัด && <col style={{ width: "9%" }} />}{/* จังหวัดหน้างาน */}
              <col style={{ width: "8%" }} />{/* ช่องทางที่มา */}
              <col style={{ width: "10%" }} />{/* งานที่ต้องการ */}
              <col style={{ width: "6%" }} />{/* พื้นที่ (ตร.ม.) */}
              <col style={{ width: "11%" }} />{/* ขั้นตอน — พอให้ "เสนอราคาลูกค้า" ไม่ถูกตัด */}
              <col style={{ width: "8%" }} />{/* มูลค่า */}
              <col style={{ width: "7%" }} />{/* ผู้รับผิดชอบ */}
              <col style={{ width: "8%" }} />{/* กิจกรรมล่าสุด "28 ต.ค. 2569" + ต้องติดตาม */}
              <col style={{ width: 44 }} />{/* ดู — ไอคอนล้วน */}
            </colgroup>
            <thead><tr>
              <th>บริษัท / ผู้ติดต่อ</th>{!ซ่อนรายชื่อ.ดีลเลอร์ && <th>ดีลเลอร์</th>}{!ซ่อนรายชื่อ.จังหวัด && <th>{ช่อง.จังหวัด}</th>}<th>{ช่อง.ช่องทาง}</th><th>{ช่อง.งาน}</th><th className="num">{ช่อง.พื้นที่}</th>
              <th>{ช่อง.ขั้นตอน}</th>
              <th className="num">มูลค่า</th><th>{ช่อง.ผู้รับผิดชอบ}</th><th>กิจกรรมล่าสุด</th>
              {/* คอลัมน์ปุ่มตรึงไว้ขวาสุด — ตารางกว้างเกินจอแคบ (26 ส.ค. 69) */}
              <th style={ตรึงคอลัมน์ปุ่ม(true)} aria-label="ดู"></th>
            </tr></thead>
            <tbody>
              {displayLeads.length === 0 ? (
                <tr><td colSpan={11 - (ซ่อนรายชื่อ.ดีลเลอร์ ? 1 : 0) - (ซ่อนรายชื่อ.จังหวัด ? 1 : 0)} style={{ padding: 0 }}><EmptyState icon={<Users size={26} />} title="ไม่พบลูกค้าเป้าหมาย" description="ลองปรับตัวกรองหรือคำค้น" /></td></tr>
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
                    {/* ดีลเลอร์เจ้าของลีด (ลีดทั้งเครือ) — ชื่ออย่างเดียว (บอสสั่ง 6 พ.ย. 69 · ไม่มีรหัส) */}
                    {!ซ่อนรายชื่อ.ดีลเลอร์ && <td data-cell="dealer" title={DEALER_NAME.get(l.dealerCode ?? "") ?? l.dealerCode ?? "—"} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {DEALER_NAME.get(l.dealerCode ?? "") ?? l.dealerCode ?? "—"}
                    </td>}
                    {!ซ่อนรายชื่อ.จังหวัด && <td data-cell="province" style={{ color: "var(--muted-foreground)" }} title={l.province || undefined}>{l.province || "—"}</td>}
                    <td style={{ color: "var(--muted-foreground)", fontSize: "0.78rem" }} title={l.source || undefined}>{l.source || "—"}</td>
                    <td data-cell="project" style={{ color: "var(--muted-foreground)", fontSize: "0.78rem" }} title={l.project || undefined}>{l.project || "—"}</td>
                    <td className="num" style={{ color: "var(--muted-foreground)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>{l.area != null ? Number(l.area).toLocaleString() : "—"}</td>
                    {/* ── ปิดไม่สำเร็จ = ต้องเห็นเหตุผลจากหน้ารายการเลย (บอสสั่ง 21 ส.ค. 69) ──────
                        เดิมต้องเปิดแผงรายละเอียดทีละใบถึงจะรู้ว่าเสียงานเพราะอะไร
                        ⚠️ ใส่ไว้ใต้ป้ายสถานะ ไม่เพิ่มคอลัมน์ใหม่ — ตารางนี้เต็มความกว้างพอดีแล้ว
                           (ดูหมายเหตุที่ colgroup: เพิ่มคอลัมน์แล้วจะกลับมามีแถบเลื่อนแนวนอนอีก) */}
                    <td className="wrap">
                      <span className="badge" data-stage-label style={{ background: c.bg, color: c.text, whiteSpace: "nowrap" }}>{ชื่อขั้น(เลขขั้นแถว(l))}</span>
                      {ป้ายย่อยแถว(l) && (
                        <span data-stage-sub style={{ display: "block", fontSize: "0.65rem", color: "#6b7280", fontWeight: 600, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ป้ายย่อยแถว(l)}</span>
                      )}
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
                  <PanelStat label={ช่อง.ขั้นตอน} tone={เลขขั้นแถว(l) === 6 ? "good" : "plain"} value={ป้ายย่อยแถว(l) ? `${ชื่อขั้น(เลขขั้นแถว(l))} · ${ป้ายย่อยแถว(l)}` : ชื่อขั้น(เลขขั้นแถว(l))} />
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
                            <span style={{ display: "block", fontSize: "0.76rem", color: "#1F2937", lineHeight: 1.5 }}>{แปลงชื่อขั้นเดิม(a.text)}</span>
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
