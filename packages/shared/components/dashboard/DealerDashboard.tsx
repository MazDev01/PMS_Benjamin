"use client";

// ── Dealer Dashboard — สมุดงานของดีลเลอร์ที่ล็อกอิน ────────────────────────────
// ขอบเขตข้อมูล: ลูกค้าเป้าหมายของดีลเลอร์รายนี้เท่านั้น (กติกาเดียวกับหน้า /leads และ /calendar)
// S1: 4 KPI (ทั้งใบกดได้) · S2: 2 กราฟใหญ่ (แท่งคู่จำนวน + เส้นยอดขาย) · S3: ผลงาน + ขั้นตอนการขาย
// S4: 4 การ์ดรายการ (ปิดท้ายด้วยกิจกรรมล่าสุด) · stack เดิม (SVG charts, ไม่ลง Recharts)
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Target, TrendingUp, PhoneCall, Activity, Building2, User,
  CalendarClock, FileText, Trophy, AlarmClock, ChevronRight,
  UserPlus, CheckCircle2, Mail,
} from "lucide-react";
import { useSales } from "@pms/shared/context/SalesContext";
import { fmtLeadValue } from "@pms/shared/lib/format";
import { useFilters, APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { ความละเอียดของช่วง, ช่องเวลาในช่วง, คีย์ช่อง, ยอดรายชั่วโมง } from "@pms/shared/lib/trendBuckets";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { PlanVsActualBars, SalesLineChart, CategoryRows, Donut, ProgressRing } from "@pms/shared/components/ui/Charts";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import {
  MonthRangeToggle, lastNMonths, monthKey,
  type MonthRange,
} from "@pms/shared/components/ui/MonthRangeToggle";
import {
  leadStatusLabel, leadStatusColor, apptTypeLabel, fmtISOToThai,
  quotationStatusLabel, quotationStatusColor, LEAD_STATUS_ORDER, DEFAULT_DEALER_CODE, QUOTED_UP,
} from "@pms/shared/lib/mock";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { percentShare } from "@pms/shared/lib/percentShare";
import { dealers as dealersRepo } from "@pms/shared/lib/data";
import type { DealerRow } from "@pms/shared/lib/data/types";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import {
  parseValue, isLeadOpen, needsFollowUp, daysSinceContact,
  MOCK_TODAY, leadCreatedDate, leadEnteredInRange,
} from "@pms/shared/lib/leadMetrics";
import { useLeadRules } from "@pms/shared/lib/useHQRules";
import { useHQTargets } from "@pms/shared/lib/useHQConfig";

const NAVY = "#003366", SUCCESS = "#16A34A", DANGER = "#DC2626";
// แท่ง "ใบเสนอราคา" — #F59E0B เดิม contrast กับพื้นขาวแค่ 2.09:1 (ต่ำกว่าเกณฑ์ 3:1) แท่งจางจนแทบไม่เห็น
// #D97706 ผ่านครบทั้ง contrast และการแยกสีสำหรับตาบอดสี เมื่อวางคู่กับสีน้ำเงินลูกค้าเป้าหมาย
const AMBER = "#D97706";
const TEXT = "#1F2937", SUB = "#6B7280", BORDER = "#E5E7EB";
const TODAY_ISO = APP_NOW_ISO; // "วันนี้ของระบบ" (supabase=จริง / local=ตรึง) — งานวันนี้/ติดตามวันนี้เดินตามปฏิทินจริง
const CUR_M = MOCK_TODAY.getMonth();
const CUR_Y = MOCK_TODAY.getFullYear();


// วงแหวนความคืบหน้าใช้ ProgressRing จาก @pms/shared/components/ui/Charts — แหล่งเดียวร่วมกับแดชบอร์ด HQ

// จำนวนเงินเต็มจำนวน (฿10,000,000) — ใช้บนการ์ด KPI ตาม design reference
function baht(v: number): string { return `฿${Math.round(v).toLocaleString("en-US")}`; }

// วันที่ท้องถิ่นเป็น ISO (YYYY-MM-DD) — ห้ามใช้ Date.toISOString() เพราะมันแปลงเป็น UTC ก่อน
// โซนไทย (UTC+7) จะทำให้ midnight local ถอยไปเป็นวันก่อนหน้า (30 มิ.ย. → 29 มิ.ย.) = off-by-one
function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DealerDashboard() {
  const router = useRouter();
  const { leads: allLeads, quotations, appointments } = useSales();
  const { timeRange, passes } = useFilters();
  const targets = useHQTargets(); // เป้าจาก HQ ผ่าน repo (โหมด supabase = ค่าจริงใน DB ไม่ใช่ default)
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน (multi-tenant)
  const { followUpAlertDays } = useLeadRules(currentDealer.code); // กฎของสาขานี้ — ตั้งเองที่ ตั้งค่า › การแจ้งเตือน

  // ── ขอบเขตข้อมูล ─────────────────────────────────────────────────────────
  // สมุดงานของดีลเลอร์ที่ล็อกอินเท่านั้น — กติกาเดียวกับหน้าลูกค้าเป้าหมาย/ปฏิทิน
  // (ลูกค้าเป้าหมายที่ดีลเลอร์สร้างเองไม่มี dealerCode → ถือเป็นของสาขาตัวเอง)
  // เดิมอ่าน leads จาก context ตรง ๆ → แดชบอร์ดนับของทั้งเครือ 10 สาขา ตัวเลขเลยไม่ตรงหน้า /leads
  // ใบเสนอราคา/นัดหมายไม่มี dealerCode ในข้อมูล → เป็นของสาขาตัวเองอยู่แล้ว (ตรงกับหน้า /quotations)
  const myLeads = useMemo(
    () => allLeads.filter(l => (l.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code),
    [allLeads, currentDealer.code],
  );

  // ── ช่วงเวลา (ตัวเลือกบนแถบบน) ────────────────────────────────────────────
  // ลูกค้าเป้าหมายในช่วง = นับตามวันที่ลูกค้าเข้ามา เกณฑ์เดียวกับหน้า /leads และฝั่งสำนักงานใหญ่ (บอสเลือก 15 ก.ย. 69)
  //   (รายที่ไม่มีวันเข้ามาไม่ถูกตัดออก) · ใบเสนอราคา/นัดหมาย: ใช้ passes() ตัวเดียวกับหน้า /quotations
  const leadsIn = useMemo(() => myLeads.filter(l => leadEnteredInRange(l, timeRange.start, timeRange.end)), [myLeads, timeRange]);
  const quotesIn = useMemo(() => quotations.filter(q => passes({ date: q.date })), [quotations, passes]);
  const apptsIn = useMemo(() => appointments.filter(a => passes({ date: a.date })), [appointments, passes]);

  // ยอดปิดการขายรายเดือน — ทุกปี เก็บเป็นคีย์ "YYYY-MM" (ช่วงย้อนหลัง 12 เดือนคาบเกี่ยว 2 ปี)
  // ไม่ตัดตามช่วงเวลาบนแถบบน — กราฟรายเดือนมีปุ่มช่วงของตัวเอง และเป้าเทียบทั้งปีเสมอ
  const wonByKey = useMemo(() => {
    const m = new Map<string, number>();
    quotations.filter(q => q.status === "won")
      .forEach(q => { const k = q.date.slice(0, 7); m.set(k, (m.get(k) ?? 0) + q.totalValue); });
    return m;
  }, [quotations]);

  // ── KPI ── เป้าหมาย = รายปีของดีลเลอร์รายนี้ (HQ ตั้งที่ /hq/dealers) · ยอดขาย = สะสมตั้งแต่ต้นปี (YTD)
  // ไม่เฉลี่ย/ไม่หารตามช่วงตัวกรอง — เทียบ YTD กับเป้าทั้งปีเสมอ
  // เป้าของสาขานี้ต้องมาจากทะเบียนดีลเลอร์จริงที่ HQ ตั้งไว้ (เดิมอ่านจากชุด seed
  // โหมด supabase เลยเทียบ YTD กับเป้าปลอม → เปอร์เซ็นต์ความคืบหน้าผิดทั้งแดชบอร์ด)
  const allDealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  const annualTarget = useMemo(() => {
    const me = allDealers.find(d => d.code === currentDealer.code);
    return me?.revenueTarget ?? targets.annualTarget ?? 0;
  }, [allDealers, targets.annualTarget, currentDealer.code]);
  const monthTarget = annualTarget / 12; // เส้นเป้าหมายรายเดือนในกราฟยอดขาย
  // สะสมตั้งแต่ต้นปีถึงเดือนปัจจุบัน (ม.ค. → เดือนนี้ ของปีนี้เท่านั้น) — ไม่เกี่ยวกับปุ่มช่วงของกราฟ
  const ytdSales = useMemo(
    () => Array.from({ length: CUR_M + 1 }, (_, i) => wonByKey.get(monthKey(CUR_Y, i)) ?? 0).reduce((s, v) => s + v, 0),
    [wonByKey],
  );
  const achievePct = annualTarget > 0 ? Math.round((ytdSales / annualTarget) * 100) : 0;
  // ⚠️ "งานที่ยังเปิดอยู่" คือสถานะ ณ ตอนนี้ ไม่ใช่ตัวเลขที่เกิดในช่วงเวลา (บอสสั่ง 26 ส.ค. 69
  //    ให้ตัวกรองคุมแค่บางส่วน · กติกาเดียวกับฝั่งสำนักงานใหญ่)
  //    เดิมกรองด้วยช่วงเวลาด้วย → เลือก "วันนี้" แล้วโอกาสการขายเหลือ ฿0 ทั้งที่งานยังค้างอยู่จริงหลายสิบดีล
  const openLeads = useMemo(() => myLeads.filter(isLeadOpen), [myLeads]);
  const openValue = useMemo(() => openLeads.reduce((s, l) => s + parseValue(l.value), 0), [openLeads]);
  const followUpToday = useMemo(() => appointments.filter(a => a.date === TODAY_ISO && a.status !== "cancelled").length, [appointments]);
  // ปิดการขายได้ = จำนวนใบเสนอราคาที่ปิดได้ (won) · อัตราปิดการขาย = won / (won + lost)
  //   นิยามเดียวกับฝั่ง HQ (useDealerPerformance / dealer_rollup) และกับ KPI "ยอดขาย" ของแดชบอร์ดเอง (wonByKey)
  //   เดิมนับจากลูกค้าเป้าหมาย PAID/CANCELLED → ตัวเลข win-rate ของสาขาไม่ตรงกับที่ HQ เห็น (ลูกค้าเป้าหมาย PAID ≠ ใบ won) · H3
  const wonCount = useMemo(() => quotations.filter(q => q.status === "won").length, [quotations]);
  const lostCount = useMemo(() => quotations.filter(q => q.status === "lost").length, [quotations]);
  const winRate = useMemo(
    () => (wonCount + lostCount ? Math.round((wonCount / (wonCount + lostCount)) * 1000) / 10 : 0),
    [wonCount, lostCount],
  );

  // ── กราฟใหญ่ 2 ใบ ── แต่ละใบมีปุ่มช่วงย้อนหลังของตัวเอง (3/6/12 เดือน) เป็นอิสระจากกัน
  // ไม่ผูกกับตัวกรองช่วงเวลาบนแถบบน — เป็นกราฟแนวโน้ม ต้องเห็นย้อนหลังเสมอ
  const [lqRange, setLqRange] = useState<MonthRange>(6);
  // ── กราฟยอดขาย: เดินตามแถบกรองด้านบน เหมือนฝั่งสำนักงานใหญ่ (บอสสั่ง 25 ส.ค. 69) ──
  //   วันนี้ → รายชั่วโมง (ตามเวลาที่ระบบบันทึกใบ) · ไม่เกิน 62 วัน → รายวัน · ยาวกว่านั้น → รายเดือน
  //   ⚠️ เดิมตรึงไว้ 6 เดือนเสมอ ไม่ว่าจะเลือกช่วงไหนบนแถบก็ไม่ขยับ
  // q.date เก็บเป็น "YYYY-MM-DD" — แปลงเป็นวันที่แบบไม่ผ่าน timezone (new Date("2026-08-01") ได้ UTC แล้วเพี้ยนวัน)
  const parseISO = (v: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "");
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const ละเอียดยอดขาย = ความละเอียดของช่วง(timeRange.start, timeRange.end);
  const salesData = useMemo(() => {
    const won = quotations.filter(q => q.status === "won");
    if (ละเอียดยอดขาย === "hour") {
      const ของวันนั้น = won.filter(q => { const d = parseISO(q.date); return !!d && d >= timeRange.start && d <= timeRange.end; });
      const pts = ยอดรายชั่วโมง(ของวันนั้น.map(q => ({ savedAt: q.savedAt, valueNum: q.totalValue })));
      if (pts) return pts.map(p => ({ label: p.month, value: Math.round(p.value * 10) / 10 }));
      // ⚠️ เลือก "วันนี้" ต้องเห็นแกน 24 ชั่วโมงเสมอ แม้ยังไม่มียอดขายเลย (บอสทัก 26 ส.ค. 69)
      //    เดิมตกกลับไปเป็นรายวัน แล้วได้จุดเดียวโดด ๆ ใต้หัวข้อที่เขียนว่า "รายชั่วโมง"
      //    กติกาเดียวกับแดชบอร์ดสำนักงานใหญ่ · ยกเว้นกรณีเดียว: วันนั้นมียอดขายจริงแต่ใบไม่มีเวลาบันทึก
      //    → ต้องกลับไปรายวัน ไม่งั้นเงินที่ขายได้จะหายไปจากกราฟทั้งก้อน (ซ่อนของจริง = ห้ามเด็ดขาด)
      const ยอดวันนั้น = ของวันนั้น.reduce((s, q) => s + q.totalValue, 0);
      if (ยอดวันนั้น <= 0) {
        return Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}:00`, value: 0 }));
      }
      // ไม่มีเวลาบันทึก แต่มียอดจริง = ทำรายชั่วโมงไม่ได้ → ตกไปเป็นรายวัน ไม่เดาเวลาให้
    }
    const ช่อง = ช่องเวลาในช่วง(timeRange.start, timeRange.end, ละเอียดยอดขาย === "hour" ? "day" : ละเอียดยอดขาย);
    const ยอด = new Map<string, number>();
    won.forEach(q => {
      const d = parseISO(q.date); if (!d || d < timeRange.start || d > timeRange.end) return;
      const k = คีย์ช่อง(d, ละเอียดยอดขาย === "hour" ? "day" : ละเอียดยอดขาย);
      ยอด.set(k, (ยอด.get(k) ?? 0) + q.totalValue);
    });
    return ช่อง.map(b => ({ label: b.label, value: Math.round(((ยอด.get(b.key) ?? 0) / 1e6) * 10) / 10 }));
  }, [quotations, ละเอียดยอดขาย, timeRange.start, timeRange.end]);
  // ความละเอียดที่ "แสดงจริง" อาจไม่เท่าที่ช่วงเวลาสั่ง (ดูกรณีตกกลับไปรายวันข้างบน)
  const ละเอียดที่แสดงจริง = ละเอียดยอดขาย === "hour" && !salesData[0]?.label?.includes(":")
    ? "day" : ละเอียดยอดขาย;
  const monthTargetM = Math.round((monthTarget / 1e6) * 10) / 10;
  // ── ลูกค้าเป้าหมาย เทียบ ที่ออกใบเสนอราคาแล้ว: แท่งคู่รายเดือน หน่วย "ราย" ทั้งคู่ ──
  //
  // ⚠️ ของเดิมแท่งหลังนับ "จำนวนใบเสนอราคา" ซึ่งเป็นคนละหน่วยกับแท่งหน้าที่นับ "จำนวนราย"
  //    ลูกค้าหนึ่งรายออกได้หลายใบ · ใบของลูกค้าเก่าก็ถูกนับทั้งที่เจ้าตัวไม่อยู่ในแท่งหน้า
  //    แท่งหลังจึงยาวเกินแท่งหน้าได้ ทั้งที่ควรเป็นส่วนย่อยของกัน (บอสทักอาการเดียวกันฝั่ง HQ 21 ส.ค. 69)
  //    ตอนนี้แท่งหลัง = ลูกค้าเป้าหมาย "รุ่นเดือนนั้น" ที่ไปถึงขั้นออกใบเสนอราคาแล้ว
  //
  // ⚠️ ที่นี่ "ไม่ตัด" รายที่ปิดการขายได้ออก (ต่างจากการ์ดของสำนักงานใหญ่ที่บอสสั่งให้ตัด)
  //    เพราะการ์ดนี้อ่านว่า "ที่รับเข้ามาเดือนนั้น ได้เสนอราคากี่ราย" — รายที่ปิดได้ก็ผ่านการเสนอราคามาแล้ว
  //    ถ้าตัดออก เดือนที่ขายดีจะดูเหมือนเสนอราคาได้น้อย ซึ่งกลับหัวกลับหางกับความจริง
  // นับลงถังตามคีย์ปี-เดือน → ข้อมูลข้ามปีไม่ทับกัน ไม่ต้องกรองปีทิ้งอีก
  const leadQuoteData = useMemo(() => {
    const lC = new Map<string, number>(), qC = new Map<string, number>();
    myLeads.forEach(l => {
      const d = leadCreatedDate(l), k = monthKey(d.getFullYear(), d.getMonth());
      lC.set(k, (lC.get(k) ?? 0) + 1);
      if (QUOTED_UP.includes(l.status)) qC.set(k, (qC.get(k) ?? 0) + 1);
    });
    return lastNMonths(lqRange, MOCK_TODAY).map(b => ({ label: b.label, actual: lC.get(b.key) ?? 0, plan: qC.get(b.key) ?? 0 }));
  }, [myLeads, lqRange]);

  const dealStatus = useMemo(() => {
    const m = new Map<string, number>();
    leadsIn.forEach(l => m.set(l.status, (m.get(l.status) ?? 0) + 1));
    // ⚠️ ปัด % ทีละขั้นแล้วบวกกัน = รวมเกิน 100 (เจอจริง 103% · ผลตรวจภายนอก DL-08)
    //    ใช้ percentShare ที่แจกเศษให้รวมได้ 100 พอดีเสมอ
    const ขั้นที่มี = LEAD_STATUS_ORDER.filter(s => m.get(s));
    const เปอร์เซ็นต์ = percentShare(ขั้นที่มี.map(s => m.get(s)!));
    return ขั้นที่มี.map((s, i) => ({
      label: leadStatusLabel[s], value: m.get(s)!, color: leadStatusColor[s].text,
      pct: เปอร์เซ็นต์[i],
    }));
  }, [leadsIn]);

  // ── ผลงานผู้รับผิดชอบ ───────────────────────────────────
  const teamPerf = useMemo(() => {
    const owner = (l: (typeof leadsIn)[number]) => l.assigned || "ไม่ระบุ";
    const m = new Map<string, { deals: number; won: number; quotes: number; quotesWon: number }>();
    leadsIn.forEach(l => {
      const key = owner(l);
      const e = m.get(key) ?? { deals: 0, won: 0, quotes: 0, quotesWon: 0 };
      e.deals++;
      m.set(key, e);
    });
    // ใบเสนอราคาไม่มีช่องผู้รับผิดชอบของตัวเอง → ยึดผู้รับผิดชอบของดีลที่ใบนั้นผูกอยู่
    // (กติกาเดียวกับ useNetworkQuotations: ผูกด้วย dealId ก่อน ไม่มีค่อยเทียบ customerId)
    // ใบที่ผูกกับดีลนอกช่วงเวลาที่เลือกไม่ถูกนับ — ขอบเขตเดียวกับจำนวนดีลในแถวเดียวกัน
    quotesIn.forEach(q => {
      const lead = leadsIn.find(l => q.dealId != null
        ? l.numId === q.dealId
        : q.customerId > 0 && l.customerId === q.customerId);
      const e = lead && m.get(owner(lead));
      if (!e) return;
      e.quotes++;
      // ⚠️ "ยอดปิดการขาย" ต้องมาจากใบที่ชนะจริง ไม่ใช่มูลค่าประเมินของลูกค้าเป้าหมาย (แก้ 10 ส.ค. 69)
      //   เดิมบวกจาก l.value ของลูกค้าเป้าหมายสถานะ PAID ซึ่งเป็น "ตัวเลขที่เซลส์เดาไว้ตอนเปิดลูกค้าเป้าหมาย"
      //   ผลที่เห็นจริง: การ์ดนี้ขึ้น ฿3.2M ขณะที่ยอดขายสะสมทั้งปีและใบที่ชนะขึ้น ฿10.2M
      //   ทั้งที่การ์ดเขียนกำกับตัวเองว่า "ยอดปิดการขายของแต่ละคน"
      //   เป็นบทเรียนเดียวกับการ์ด "ยอดขายตามแม่แบบ" ที่แก้ไปแล้ว — ทั้งแดชบอร์ดต้องนิยาม "ยอดขาย" เหมือนกัน
      if (q.status === "won") { e.quotesWon++; e.won += q.totalValue; }
    });
    // โชว์ 5 อันดับแรก — การ์ดนี้ตอบว่า "ใครทำได้ดี/ใครต้องช่วย" ไม่ได้ให้ไล่อ่านทุกคน
    // (รายชื่อครบอยู่ที่หน้าลูกค้าเป้าหมาย — กด "ดูทั้งหมด" ที่หัวการ์ด)
    // ข้อความบอกส่วนที่เหลือถูกลบทั้งหมดตามที่บอสสั่ง (25 ส.ค. 69)
    return [...m.entries()].map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.won - a.won || b.deals - a.deals)
      .slice(0, 5);
  }, [leadsIn, quotesIn]);

  // ตัวย่อยอดเงินของการ์ดผลงาน (฿1.2M · ฿350K)
  const cmpBaht = (v: number) => v >= 1e6 ? `฿${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `฿${Math.round(v / 1e3)}K` : `฿${v}`;

  // ── การ์ดรายการ ──────────────────────────────────────────────────────────
  // เรียงจากวันน้อยไปมาก (บอสสั่ง 21 ส.ค. 69) — รายที่เพิ่งเลยกำหนดอยู่บนสุด
  //   เหตุผล: รายที่เงียบไป 2-3 เดือนมักเย็นไปแล้ว ส่วนรายที่เพิ่งเลยกำหนดไม่กี่วันคือรายที่โทรกลับแล้วได้ผลจริง
  //   ⚠️ ตัดเหลือ 4 รายการ "หลังเรียง" เสมอ — สลับลำดับแล้วรายการที่โชว์จะเปลี่ยนชุดไปด้วย
  // ⚠️ "ค้างติดต่อ" คือสถานะ ณ ตอนนี้ เหมือน "งานที่ยังเปิดอยู่" — ไม่กรองด้วยช่วงเวลา
  //    เดิมเลือก "วันนี้" แล้วรายการนี้ว่างเปล่า ทั้งที่ยังมีงานค้างจริง (บอสสั่ง 26 ส.ค. 69)
  const urgentLeads = useMemo(
    () => myLeads.filter(l => needsFollowUp(l, followUpAlertDays))
      .sort((a, b) => (daysSinceContact(a) ?? 0) - (daysSinceContact(b) ?? 0))
      .slice(0, 4),
    [myLeads, followUpAlertDays]);
  const todayTasks = useMemo(() => appointments.filter(a => a.date === TODAY_ISO && a.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time)).slice(0, 4), [appointments]);
  const latestQuotes = useMemo(() => [...quotesIn].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4), [quotesIn]);

  // ── กิจกรรมล่าสุด ────────────────────────────────────────────────────────
  const recent = useMemo(() => {
    type Ev = { kind: string; icon: typeof FileText; title: string; customer: string; date: string; time?: string; color: string; bg: string; href: string };
    const ev: Ev[] = [];
    leadsIn.forEach(l => ev.push({ kind: "lead", icon: UserPlus, title: "สร้างลูกค้าเป้าหมายใหม่", customer: l.company, date: localISO(leadCreatedDate(l)), color: "#2563EB", bg: "#E8F0FE", href: `/leads?open=${l.numId}` }));
    // นัดหมายต้องอยู่ในช่วงเวลาที่เลือกด้วย — ไม่งั้นการ์ด "ล่าสุด" โผล่นัดของเดือนหน้าทั้งที่เลือกดูถึงแค่ มิ.ย.
    apptsIn.forEach(a => ev.push({ kind: "appt", icon: CalendarClock, title: "นัดหมาย", customer: a.company, date: a.date, time: a.time, color: "#7C3AED", bg: "#F0EBFB", href: "/calendar" }));
    quotesIn.forEach(q => {
      ev.push({ kind: "quote", icon: Mail, title: `ส่งใบเสนอราคา ${q.id}`, customer: q.customer, date: q.date, color: "#EA580C", bg: "#FEF0E6", href: "/quotations" });
      if (q.status === "won") ev.push({ kind: "won", icon: CheckCircle2, title: "ปิดการขายสำเร็จ", customer: q.customer, date: q.date, color: SUCCESS, bg: "#E6F7EE", href: "/customers" });
    });
    // แสดง "ล่าสุดของแต่ละประเภท" → ไทม์ไลน์หลากหลาย (ไม่ซ้ำชนิดเดียว) แล้วเรียงตามวัน
    const byKind = new Map<string, Ev>();
    ev.sort((a, b) => b.date.localeCompare(a.date)).forEach(e => { if (!byKind.has(e.kind)) byKind.set(e.kind, e); });
    const picked = [...byKind.values()];
    // เติมด้วยรายการล่าสุดที่เหลือให้ครบ 6
    ev.forEach(e => { if (picked.length < 6 && !picked.includes(e)) picked.push(e); });
    return picked.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  }, [leadsIn, apptsIn, quotesIn]);

  // ── styles ──
  // การ์ดเนื้อหาบนแดชบอร์ด — พื้น/ขอบ/มุม/เงา + hover ยกลอย มาจากคลาส .card ใน globals.css (มาตรฐานเดียวทั้งแอป)
  // ห้ามกลับไปตั้ง background/border/borderRadius/boxShadow เป็น inline: inline ชนะ CSS → hover จะไม่ทำงาน
  // (นี่คือเหตุผลที่การ์ดกลุ่มนี้เคยไม่ยกลอยตอนชี้ ทั้งที่ทั้งแอปยกหมดแล้ว)
  const card: React.CSSProperties = { padding: 24 };
  const hd: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "nowrap" };
  const title: React.CSSProperties = { fontSize: "0.92rem", fontWeight: 700, color: TEXT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const sub: React.CSSProperties = { fontSize: "0.8rem", color: SUB };
  // ตัวเลขบนการ์ด KPI — ค่าเดียวกับ kNum ของ /hq/pipeline เป๊ะ ๆ (การ์ด KPI ต้องหน้าตาเหมือนกันทุกหน้า)
  const num: React.CSSProperties = { fontSize: "1.25rem", fontWeight: 800, color: TEXT, lineHeight: 1.15, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em", whiteSpace: "nowrap" };
  // กรอบการ์ด KPI — ใช้คลาส .card ร่วมกับหน้าอื่น (พื้น/ขอบ/มุม/เงา/ยกตอนชี้) แทน inline style เดิม
  // .dash-tile ติดไว้เพื่อกรอบโฟกัสตอนกดด้วยคีย์บอร์ด (.card ไม่มี) — transform ตรงกันทั้งคู่ ไม่ตีกัน
  const kpiCard: React.CSSProperties = {
    marginBottom: 0, padding: "18px 18px 15px",
    display: "flex", flexDirection: "column", gap: 10,
    textAlign: "left", cursor: "pointer", fontFamily: "inherit", width: "100%",
  };
  // แถวในรายการ = ปุ่มเต็มความกว้าง (กดได้ทุกแถว)
  // กว้างกว่ากล่อง 16px + ถอยขอบข้างละ 8px → ไฮไลต์ตอนชี้ล้นเข้าไปในขอบการ์ด ไม่ลอยกลางอากาศ
  const rowBtn: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", textAlign: "left", background: "none", border: "none", padding: "6px 8px", margin: "0 -8px", cursor: "pointer", fontFamily: "inherit", width: "calc(100% + 16px)", borderRadius: 10 };
  // กล่องรายการที่เลื่อนได้ — ใช้ร่วมกันทุกการ์ด
  // กับดัก: ตั้ง overflow-y: auto อย่างเดียว สเปก CSS จะบังคับ overflow-x เป็น auto ตามไปด้วย
  // แถว (rowBtn) กว้างกว่ากล่อง 16px จึงล้นขวา → แถบเลื่อนแนวนอนโผล่ใต้ทุกการ์ด
  // แก้ด้วยการถ่างกล่องออกข้างละ 8px แล้วดันเนื้อในกลับเข้าที่เดิม → แถวพอดีกล่องเป๊ะ ไม่มีอะไรล้น
  // (overflowX: hidden เป็นตัวกันเศษทศนิยม ไม่ได้บังไฮไลต์ เพราะแถวไม่ล้นแล้ว)
  const listWrap: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: 6,
    maxHeight: 320, overflowY: "auto", overflowX: "hidden",
    marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8,
  };
  const more = (href: string) => (
    <button onClick={() => router.push(href)} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "0.78rem", fontWeight: 700, color: SUB, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
      ดูทั้งหมด <ChevronRight size={13} />
    </button>
  );
  const IconBox = ({ Icon, color, bg }: { Icon: typeof Target; color: string; bg: string }) => (
    <span style={{ width: 42, height: 42, borderRadius: 12, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={20} color={color} strokeWidth={2.1} />
    </span>
  );
  const Thumb = ({ logo }: { logo?: string }) => (
    <span style={{ width: 40, height: 40, borderRadius: 9, background: "#F1F5F9", border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
      {logo ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Building2 size={18} color="#94A3B8" />}
    </span>
  );

  const kpis = [
    { label: "เป้าหมายยอดขาย", tip: "เป้าหมายยอดขายทั้งปีที่สำนักงานใหญ่กำหนด เทียบกับยอดปิดการขายสะสมตั้งแต่ต้นปี · การ์ดนี้เทียบทั้งปีเสมอ ไม่เปลี่ยนตามช่วงเวลาที่เลือก", Icon: Target, color: "#2563EB", bg: "#E8F0FE", href: "/quotations", ring: true },
    { label: "โอกาสการขาย", tip: "มูลค่ารวมของดีลที่ยังเปิดอยู่ (ยังไม่ปิดการขาย และยังไม่ยกเลิก)", Icon: TrendingUp, color: SUCCESS, bg: "#E6F7EE", href: "/leads", value: baht(openValue), sub1: "รวมประเมินราคาของงานที่ยังเปิดอยู่", sub2: `${openLeads.length} ดีล` },
    { label: "ติดตามวันนี้", tip: "งานติดตาม/นัดหมายที่ต้องทำวันนี้", Icon: PhoneCall, color: "#EA580C", bg: "#FEF0E6", href: "/calendar", value: `${followUpToday}`, sub1: "รายการ" },
    // ตัวเลขหลัก = จำนวนดีลที่ปิดสำเร็จ · อัตราปิดการขาย (%) ลงมาเป็นบรรทัดรอง
    // ชื่อการ์ดต้องตรงกับหน่วยของตัวเลขที่โชว์ — "ปิดการขายได้" คู่กับ "50%" จะอ่านว่าปิดได้ 50 ดีล
    { label: "ปิดการขายได้", tip: `จำนวนใบเสนอราคาที่ปิดการขายได้ (won) · อัตราปิดการขาย = ปิดได้ ÷ (ปิดได้ + ปิดไม่ได้) = ${wonCount} ÷ ${wonCount + lostCount} · นิยามเดียวกับที่สำนักงานใหญ่เห็น`, Icon: Activity, color: "#0D9488", bg: "#E6F7F5", href: "/quotations", value: `${wonCount} ดีล`, sub1: wonCount + lostCount ? `อัตราปิดการขาย ${winRate}%` : "ยังไม่มีดีลที่ปิด" },
  ];
  // ไอคอน (i) ท้ายชื่อการ์ดถูกเอาออกตามที่บอสสั่ง (25 ส.ค. 69) — เหตุผลเดียวกับแดชบอร์ดสำนักงานใหญ่
  const KpiLabel = ({ label }: { label: string; tip?: string }) => (
    <span style={{ ...sub, display: "inline-flex", alignItems: "center", gap: 4 }}>
      {label}
    </span>
  );
  // ข้อความชวนกดท้ายการ์ด KPI — ทั้งใบเป็นปุ่มแล้ว จึงเป็นแค่ป้าย ไม่ใช่ปุ่มซ้อนปุ่ม
  const detailHint = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.8rem", fontWeight: 700, color: NAVY, marginTop: "auto" }}>
      ดูรายละเอียด <ChevronRight size={13} />
    </span>
  );

  return (
    <div className="dash-anim">
      {/* ปุ่มหัวหน้า — ช่วงเวลา (มีผลกับทุกการ์ด ยกเว้นเป้าหมายทั้งปี/กราฟรายเดือนที่เทียบทั้งปี) */}
      <TopbarActions>
        <FilterBar dims={[]} />
      </TopbarActions>
      {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้าทั้ง HQ และดีลเลอร์ (บอสสั่ง 14 ส.ค. 69)
          ชื่อสาขาและช่วงเวลายังอ่านได้จากแถบบน/ตัวกรอง — ไม่ต้องเขียนซ้ำใต้ชื่อหน้า */}

      {/* SECTION 1 — 4 KPI (ทั้งใบกดได้) */}
      <div className="dash-kpis" style={{ marginBottom: 24 }}>
        {kpis.map(k => (
          <button key={k.label} onClick={() => router.push(k.href)} className="card clickable dash-tile"
            title={`ไปที่ ${k.label}`} style={kpiCard}>
            {k.ring ? (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, width: "100%" }}>
                  <div style={{ minWidth: 0 }}>
                    <KpiLabel label={k.label} tip={k.tip} />
                    <div style={{ ...num, marginTop: 6 }}>{baht(annualTarget)}</div>
                    <div style={{ ...sub, marginTop: 2 }}>เป้าหมายทั้งปี</div>
                  </div>
                  <ProgressRing pct={achievePct} size={50} />
                </div>
                <div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: NAVY, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{baht(ytdSales)}</div>
                  <div style={sub}>ยอดขายสะสมทั้งปี</div>
                </div>
                {detailHint}
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, width: "100%" }}>
                  <div style={{ minWidth: 0 }}>
                    <KpiLabel label={k.label} tip={k.tip} />
                    <div style={{ ...num, marginTop: 6 }}>{k.value}</div>
                    <div style={{ ...sub, marginTop: 2 }}>{k.sub1}</div>
                    {k.sub2 && <div style={{ fontSize: "1.15rem", fontWeight: 800, color: TEXT, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{k.sub2}</div>}
                  </div>
                  <IconBox Icon={k.Icon} color={k.color} bg={k.bg} />
                </div>
                {detailHint}
              </>
            )}
          </button>
        ))}
      </div>

      {/* SECTION 2 — 2 กราฟใหญ่ · แต่ละใบมีปุ่มช่วงย้อนหลังของตัวเอง (3/6/12 เดือน) เป็นอิสระจากกัน
          ไม่ผูกกับตัวกรองช่วงเวลาบนแถบบน — เป็นกราฟแนวโน้ม ต้องเห็นย้อนหลังเสมอ
          แยกการ์ดเพราะคนละหน่วย: จำนวนรายการ (แท่งคู่) กับ บาท (เส้น) */}
      <div className="dash-charts-2" style={{ marginBottom: 24 }}>
        {/* ลูกค้าเป้าหมาย เทียบ ใบเสนอราคา — จำนวนรายการ */}
        <div className="card" style={card}>
          <div style={hd}>
            <span style={title}>ลูกค้าเป้าหมาย เทียบ ที่ออกใบเสนอราคาแล้ว</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <MonthRangeToggle value={lqRange} onChange={setLqRange} label="ช่วงเวลากราฟลูกค้าเป้าหมายเทียบใบเสนอราคา" />
              {more("/leads")}
            </span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {/* คำอธิบายสีอยู่ใน PlanVsActualBars แล้ว — เดิมเขียนมือซ้ำไว้ใต้การ์ดนี้ใบเดียว
                (อีก 2 การ์ดที่ใช้กราฟตัวเดียวกันเลยไม่มีคำอธิบายสีมาตลอด) */}
            <PlanVsActualBars data={leadQuoteData} height={260} aLabel="ลูกค้าเป้าหมายใหม่" bLabel="ออกใบเสนอราคาแล้ว"
              fmt={v => `${Math.round(v)} ราย`} highlightExceeded={false} aFill="#2563EB" bFill={AMBER} />
          </div>
        </div>

        {/* ยอดขาย — กราฟเส้น + เส้นประเป้าหมาย · ช่วง/ความละเอียดมาจากแถบกรองด้านบน */}
        <div className="card" style={card}>
          <div style={hd}>
            {/* ⚠️ หัวข้อต้องตรงกับสิ่งที่กราฟแสดงจริง — เลือก "วันนี้" แต่ใบไม่มีเวลาบันทึก
                กราฟจะตกไปเป็นรายวัน หัวข้อจึงห้ามยืนยันว่า "รายชั่วโมง" (บอสทัก 26 ส.ค. 69) */}
            <span style={title}>ยอดขาย{ละเอียดที่แสดงจริง === "month" ? "รายเดือน" : ละเอียดที่แสดงจริง === "day" ? "รายวัน" : "รายชั่วโมง"}</span>
            {more("/quotations")}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <SalesLineChart data={salesData} target={monthTargetM} height={260}
              fmt={v => `฿${v.toFixed(1)}M`} targetLabel="เป้า/เดือน" />
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "flex-start", marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDER}`, fontSize: "0.8rem", color: SUB, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: NAVY }} /> ยอดขาย</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: "50%", background: SUCCESS }} /> เดือนที่ถึงเป้า</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 2, background: "#EA580C" }} /> เป้าหมายรายเดือน {baht(monthTarget)}</span>
          </div>
        </div>
      </div>

      {/* SECTION 3 — ผลงานผู้รับผิดชอบ · ขั้นตอนการขาย (การ์ด "ยอดขายตามแม่แบบ" ลบแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 → คู่ 2 คอลัมน์) */}
      <div className="dash-charts-2" style={{ marginBottom: 24 }}>
        {/* ผลงานผู้รับผิดชอบ */}
        <div className="card" style={card}>
          <div style={hd}><span style={title}>ผลงานผู้รับผิดชอบ</span>{more("/leads")}</div>
          {teamPerf.length === 0 ? <EmptyState icon={<Trophy size={26} />} title="ไม่มีข้อมูลในช่วงนี้" description="ลองขยายช่วงเวลาด้านบน" compact /> : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <CategoryRows
                data={teamPerf.map(t => ({ label: t.name, value: t.won, note: `${t.deals} ดีล · เสนอ ${t.quotes} ใบ` }))}
                fmt={cmpBaht} icon={<User size={11} />} onSelect={() => router.push("/leads")}
                ariaLabel="ยอดปิดการขายของผู้รับผิดชอบแต่ละคน" />
            </div>
          )}
        </div>


        {/* ขั้นตอนการขาย (โดนัท) */}
        <div className="card" style={card}>
          <div style={hd}><span style={title}>สัดส่วนตามขั้นตอนการขาย</span>{more("/leads")}</div>
          {dealStatus.length === 0 ? <EmptyState icon={<Target size={26} />} title="ไม่มีดีลในช่วงนี้" description="ลองขยายช่วงเวลาด้านบน" compact /> : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Donut segments={dealStatus} centerLabel="ดีลทั้งหมด" centerValue={`${leadsIn.length}`} size={118} />
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 168 }}>
                {dealStatus.map(s => (
                  <button key={s.label} className="dash-row" onClick={() => router.push("/leads")} title={`ดูลูกค้าเป้าหมายขั้นตอน ${s.label}`}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", whiteSpace: "nowrap", background: "none", border: "none", padding: "5px 8px", margin: "0 -8px", cursor: "pointer", fontFamily: "inherit", borderRadius: 8, textAlign: "left" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: TEXT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>
                    <span style={{ fontWeight: 800, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                    <span style={{ color: SUB, fontVariantNumeric: "tabular-nums" }}>({s.pct}%)</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4 — 4 การ์ดรายการ (แถวเดียว) */}
      <div className="dash-cards" style={{ marginBottom: 24 }}>
        {/* ต้องติดตามด่วน — เกณฑ์วันมาจากกฎ HQ ไม่ใช่เลขตายตัว */}
        <div className="card" style={card}>
          <div style={hd}><span style={{ ...title, display: "flex", alignItems: "center", gap: 6, flexShrink: 1 }}><AlarmClock size={15} color={DANGER} style={{ flexShrink: 0 }} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>ต้องติดตามด่วน (เกิน {followUpAlertDays} วัน)</span></span>{more("/leads")}</div>
          {urgentLeads.length === 0 ? <EmptyState icon={<PhoneCall size={26} />} title="ไม่มีรายการค้าง" description={`ทุกรายติดต่อใน ${followUpAlertDays} วัน`} compact /> : (
            <div style={listWrap}>
              {urgentLeads.map(l => (
                <button key={l.id} className="dash-row" onClick={() => router.push(`/leads?open=${l.numId}`)} title={`เปิด ${l.company}`} style={rowBtn}>
                  <Thumb logo={l.logo} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "0.86rem", fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.company}</span>
                    {/* "สนใจ: <แม่แบบ>" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 (ข้อมูลเก่าเก็บไว้ ไม่แสดง) */}
                    <span style={{ display: "block", fontSize: "0.76rem", color: DANGER, fontWeight: 700 }}>ไม่ได้ติดต่อ {daysSinceContact(l)} วัน</span>
                  </span>
                  <span style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ display: "block", fontSize: "0.72rem", color: SUB }}>ประเมินราคา</span>
                    <span style={{ display: "block", fontSize: "0.88rem", fontWeight: 800, color: NAVY }}>{fmtLeadValue(l.value)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* งานที่ต้องทำวันนี้ */}
        <div className="card" style={card}>
          <div style={hd}><span style={{ ...title, display: "flex", alignItems: "center", gap: 6 }}><CalendarClock size={15} color={NAVY} /> งานที่ต้องทำวันนี้</span>{more("/calendar")}</div>
          {todayTasks.length === 0 ? <EmptyState icon={<CheckCircle2 size={26} />} title="ไม่มีงานวันนี้" description="—" compact /> : (
            <div style={listWrap}>
              {todayTasks.map(a => (
                <button key={a.id} className="dash-row" onClick={() => router.push("/calendar")} title={`เปิดปฏิทิน · ${a.company}`} style={rowBtn}>
                  <IconBox Icon={a.type === "follow_up" ? PhoneCall : a.type === "presentation" ? Mail : CalendarClock}
                    color={a.type === "follow_up" ? "#2563EB" : a.type === "presentation" ? "#EA580C" : "#7C3AED"}
                    bg={a.type === "follow_up" ? "#E8F0FE" : a.type === "presentation" ? "#FEF0E6" : "#F0EBFB"} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "0.86rem", fontWeight: 700, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{apptTypeLabel[a.type]} {a.company}</span>
                    <span style={{ display: "block", fontSize: "0.76rem", color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.project}</span>
                  </span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: SUB, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{a.time}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ใบเสนอราคาล่าสุด */}
        <div className="card" style={card}>
          <div style={hd}><span style={{ ...title, display: "flex", alignItems: "center", gap: 6 }}><FileText size={15} color={NAVY} /> ใบเสนอราคาล่าสุด</span>{more("/quotations")}</div>
          {latestQuotes.length === 0 ? <EmptyState icon={<FileText size={26} />} title="ไม่มีใบเสนอราคาในช่วงนี้" description="ลองขยายช่วงเวลาด้านบน" compact /> : (
            <div style={listWrap}>
              {latestQuotes.map(q => { const sc = quotationStatusColor[q.status]; return (
                <button key={q.id} className="dash-row" onClick={() => router.push("/quotations")} title={`เปิดใบเสนอราคา ${q.id}`} style={rowBtn}>
                  <IconBox Icon={FileText} color={NAVY} bg="#F1F5F9" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: TEXT, fontFamily: "monospace" }}>{q.id}</span>
                    <span style={{ display: "block", fontSize: "0.76rem", color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.customer}</span>
                    <span style={{ display: "block", fontSize: "0.86rem", fontWeight: 800, color: NAVY }}>{q.total}</span>
                  </span>
                  <span style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span className="badge" style={{ background: sc.bg, color: sc.text }}>{quotationStatusLabel[q.status]}</span>
                    <span style={{ fontSize: "0.72rem", color: SUB }}>{fmtISOToThai(q.date)}</span>
                  </span>
                </button>
              ); })}
            </div>
          )}
        </div>

        {/* กิจกรรมล่าสุด — ย้ายจากการ์ดเต็มความกว้างมาเป็นใบที่ 4 ของแถวนี้ (แทน "ดีลที่มูลค่าสูงสุด")
            ใช้แถวแบบเดียวกับการ์ดพี่น้องในแถว (ไม่ตีกรอบรายบรรทัด) ให้จังหวะสายตาเสมอกัน */}
        <div className="card" style={card}>
          <div style={hd}><span style={{ ...title, display: "flex", alignItems: "center", gap: 6 }}><Activity size={15} color={NAVY} /> กิจกรรมล่าสุด</span>{more("/leads")}</div>
          {recent.length === 0 ? <EmptyState icon={<Activity size={26} />} title="ไม่มีกิจกรรมในช่วงนี้" description="ลองขยายช่วงเวลาด้านบน" compact /> : (
            <div style={listWrap}>
              {recent.map((e, i) => (
                <button key={i} className="dash-row" onClick={() => router.push(e.href)} title={`ไปที่ ${e.customer}`} style={rowBtn}>
                  <IconBox Icon={e.icon} color={e.color} bg={e.bg} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: TEXT, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                    <span style={{ display: "block", fontSize: "0.76rem", color: SUB, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.customer}</span>
                    <span style={{ display: "block", fontSize: "0.72rem", color: "#94A3B8", marginTop: 2 }}>{fmtISOToThai(e.date)}{e.time ? ` ${e.time}` : ""}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
