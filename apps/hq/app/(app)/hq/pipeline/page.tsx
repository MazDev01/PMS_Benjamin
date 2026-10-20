"use client";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

// ─── HQ · ภาพรวมยอดขายทั้งเครือ (Sales Analytics) ──────────────────────────────
// ศูนย์บัญชาการยอดขายของสำนักงานใหญ่ — อ่านอย่างเดียว ไม่มีสร้าง/แก้/ลบ (Action = ดู · วิเคราะห์ · ส่งออก)
// กราฟใช้ได้เฉพาะ แท่งแนวนอน / แท่งคู่ / แท่งซ้อน / เส้น (ไม่มีกรวย/เกจ/วงกลม)
//
// ── สิ่งที่ตัดออกจากสเปก เพราะข้อมูลจริงไม่รองรับ (อย่าใส่กลับโดยไม่มีข้อมูลก่อน) ──
// • Forecast / คาดการณ์รายได้ — ระบบไม่มีวันคาดปิดการขาย (ลบทั้งฟีเจอร์แล้ว) และไม่มีฟิลด์ % ความน่าจะเป็น
//   จึงถ่วงน้ำหนัก pipeline ไม่ได้ · บอสสั่งตัดออก
// • ย้อนหลังฟิกซ์ 12 เดือน — ดีลเลอร์ 9/10 รายมีข้อมูลแค่ 3 เดือน · กราฟตัดตามตัวกรองเวลา "เท่าที่มีข้อมูล"
// • Last Updated รายดีลเลอร์ — DealerRow ไม่มีฟิลด์นี้ · ใช้ "ใบเสนอราคาล่าสุด" ที่หาได้จริงแทน (ชื่อคอลัมน์ตรงกับสิ่งที่มันเป็น)
// • Refresh — ระบบไม่มี backend ให้ refresh (ข้อมูลสดจาก SalesContext อยู่แล้ว)
import { useMemo, useState, useRef, useEffect } from "react";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { useRouter } from "next/navigation";
import {
  FileText, Percent, Target, Trophy, Eye, X, Building2, Users, Coins, CalendarDays, FolderOpen, Search,
} from "lucide-react";
import { DealerQuotationPerformance, DealerQuotationTable } from "@pms/shared/components/hq/pipeline/DealerQuotationPerformance";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import {
  DEFAULT_HQ_TARGETS,
  DEALER_FILES_EVENT, fmtISOToThai, QUOTED_UP,
  type DealerRow, type HQTargets, type DealerFile,
} from "@pms/shared/lib/mock";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useDealerPerformance, EMPTY_PERF } from "@pms/shared/lib/useDealerPerformance";
import { dealers as dealersRepo, settings as settingsRepo, files as filesRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { useSales } from "@pms/shared/context/SalesContext";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { useNetworkQuotations, useNetworkLeads, useNetworkCustomers, useHQQuotationsSummary, useLeadSummary, useDealerDrawerData } from "@pms/shared/lib/useNetworkData";
import { regionDisplay } from "@pms/shared/lib/hqQuotations";
import { fmtBaht } from "@pms/shared/lib/format";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";

const PRIMARY = "#003366";
const STEEL = "#2D2D2D";
const MUTED = "var(--muted-foreground)";
const RAMP = ["#003366", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626"];
const TH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const isoDateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TH_MONTH: Record<string, number> = Object.fromEntries(TH_ABBR.map((m, i) => [m, i]));
const parseThaiDate = (s: string): Date | null => {
  const mt = /^(\d{1,2})\s+(\S+)\s+(\d{4})/.exec((s || "").trim());
  if (!mt || !(mt[2] in TH_MONTH)) return null;
  const y = +mt[3] > 2500 ? +mt[3] - 543 : +mt[3];
  return new Date(y, TH_MONTH[mt[2]], +mt[1]);
};
const ALL = "ALL";

// ── แท่งแนวนอนคู่ — ใช้ซ้ำใน Section 1 / 2 / 3 (แท่งหลัก + แท่งเทียบ) ──
// เปิดมาโชว์ครบทุกแถวเลย (บอสสั่ง 17 ก.ค. 69) — ให้อ่านคู่กับตารางข้าง ๆ ที่ก็ลิสต์ครบทุกดีลเลอร์เหมือนกัน
// การ์ดไม่ยืดตามจำนวนแถว เพราะความสูงตรึงด้วย .chart-l แล้วให้ .chart-scroll เลื่อนข้างใน
// (กติกาใน globals.css: ข้อมูลล้น = เลื่อนใน .chart-scroll หรือตัด Top N + ปุ่มดูทั้งหมด — ที่นี่ใช้แบบเลื่อน)
// ปุ่มย่อกลับเป็น 5 อันดับแรกยังอยู่ เผื่ออยากดูเฉพาะหัวตาราง
const TOP_N = 5;
type HRow = { key: string; label: string; a: number; b: number; note?: string; onClick?: () => void };
function HBars({ rows, aLabel, bLabel, aColor = PRIMARY, bColor = "#C0C0C0", fmt, paged = false }: {
  rows: HRow[]; aLabel: string; bLabel: string; aColor?: string; bColor?: string; fmt: (v: number) => string;
  /** แบ่งหน้าจากข้างนอกแล้ว (มีแถบเปลี่ยนหน้า) — แสดงทุกแถวที่ส่งมา ไม่มีปุ่มย่อ/ดูทั้งหมด (บอสสั่ง 22 ก.ย. 69) */
  paged?: boolean;
}) {
  const [allState, setAll] = useState(true);
  const all = paged || allState;
  // max คิดจากทุกแถวเสมอ — ไม่งั้นพอกด "ดูทั้งหมด" ความยาวแท่งจะขยับ ทั้งที่ข้อมูลเท่าเดิม
  const max = Math.max(...rows.flatMap(r => [r.a, r.b]), 1);
  const shown = all ? rows : rows.slice(0, TOP_N);
  const hidden = rows.length - shown.length;
  // flex: 1 — เดิมได้ความยืดมาจากคลาส chart-l ของการ์ด พอเลิกล็อกความสูงตายตัวก็ต้องยืดเอง
  // ไม่งั้นเนื้อในหดตามจำนวนข้อมูล การ์ดเลยเตี้ยกลับไปไม่เท่าเพื่อนในแถวเหมือนเดิม
  return (
    <div className="card-body" style={{ paddingTop: 4, display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      {/* คำอธิบายสี — ต้องมี ไม่งั้นแท่งคู่อ่านไม่ออกว่าอันไหนคืออะไร */}
      <div style={{ display: "flex", gap: 14, marginBottom: 12, flexShrink: 0 }}>
        {[[aLabel, aColor], [bLabel, bColor]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.66rem", fontWeight: 700, color: MUTED }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: c, flexShrink: 0 }} /> {l}
          </span>
        ))}
      </div>
      {!rows.length ? (
        <EmptyState icon={<Coins size={26} />} title="ไม่พบข้อมูลในช่วงที่เลือก" description="ลองปรับตัวกรอง" compact />
      ) : (<>
        <div className="chart-scroll" style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
          {shown.map(r => (
            <div key={r.key} onClick={r.onClick} style={{ cursor: r.onClick ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.72rem", marginBottom: 4 }}>
                <span style={{ color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                <span style={{ flexShrink: 0, fontWeight: 700, color: "#1F2937", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(r.a)} <span style={{ color: MUTED, fontWeight: 400 }}>/ {fmt(r.b)}</span>
                  {r.note && <span style={{ color: MUTED, fontWeight: 400 }}> · {r.note}</span>}
                </span>
              </div>
              <div style={{ height: 8, background: "var(--muted)", borderRadius: 999, overflow: "hidden", marginBottom: 3 }}>
                <div className="bar-grow" style={{ height: "100%", width: `${Math.round(r.a / max * 100)}%`, background: aColor, borderRadius: 999 }} />
              </div>
              <div style={{ height: 5, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${Math.round(r.b / max * 100)}%`, background: bColor, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
        {/* บอกจำนวนที่ซ่อนไว้เสมอ — ห้ามตัดเงียบ ไม่งั้นคนอ่านนึกว่าเห็นครบแล้ว */}
        {!paged && (hidden > 0 || (all && rows.length > 5)) && (
          <button type="button" onClick={() => setAll(v => !v)}
            style={{ marginTop: 10, flexShrink: 0, alignSelf: "flex-start", background: "none", border: "none", padding: 0,
              cursor: "pointer", fontFamily: "inherit", fontSize: "0.68rem", fontWeight: 700, color: PRIMARY }}>
            {all ? "ย่อกลับเป็น 5 อันดับแรก" : `ดูทั้งหมด (อีก ${hidden} ราย)`}
          </button>
        )}
      </>)}
    </div>
  );
}

export default function SalesAnalyticsPage() {
  const router = useRouter();
  const { timeRange, inRange } = useFilters();
  // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
  const allDealers = useRepoValue<DealerRow[]>(() => dealersRepo.list().then(l => l.filter(ไม่ใช่แถวHQ)), []);
  // ยอดขายจริงรายสาขา — จากใบที่ปิดการขายได้ ไม่ใช่คอลัมน์ revenue_actual ที่ seed ไว้
  const dealerPerf = useDealerPerformance();
  const perfOf = (code: string) => dealerPerf.get(code) ?? EMPTY_PERF;
  // ยอดขายที่ยังโหลดไม่เสร็จต้องขึ้น "—" ไม่ใช่ ฿0 — ศูนย์แปลว่า "ขายไม่ได้เลย" ซึ่งคนละเรื่องกับ "ยังไม่รู้"
  const money = (v: number) => (dealerPerf.ready ? fmtBaht(v) : "—");
  const targets = useRepoValue<HQTargets>(() => settingsRepo.getTargets(), DEFAULT_HQ_TARGETS);

  const netQuotes = useNetworkQuotations();
  const netLeads = useNetworkLeads();
  const netCustomers = useNetworkCustomers();
  const { appointments } = useSales();

  // ไฟล์แนบ — ใช้เฉพาะใน Drawer (ผูกกับลูกค้าเป้าหมายด้วย recordId = numId)
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

  // ── Smart Filter — ทุกตัวเลือกสร้างจากข้อมูลจริง ไม่ฮาร์ดโค้ด ──
  const [q, setQ] = useState("");
  const [dealerSel, setDealerSel] = useState(ALL);
  const [regionSel, setRegionSel] = useState(ALL);
  const [provSel, setProvSel] = useState(ALL);
  const [salesSel, setSalesSel] = useState(ALL);
  const [view, setView] = useState<"dealer" | "region" | "province" | "month">("dealer");

  const DEALER_META = useMemo(() => new Map(allDealers.map(d => [d.code, d])), [allDealers]);
  const SALES_BANDS = useMemo(() => [
    { v: "lt5", l: "ต่ำกว่า ฿5M", hit: (n: number) => n < 5e6 },
    { v: "5to8", l: "฿5M – ฿8M", hit: (n: number) => n >= 5e6 && n < 8e6 },
    { v: "gte8", l: "฿8M ขึ้นไป", hit: (n: number) => n >= 8e6 },
  ], []);

  // ดีลเลอร์ที่ผ่านตัวกรอง = ขอบเขตของทั้งหน้า (ทุกกราฟ/ตารางอิงชุดนี้ชุดเดียว)
  const dealers = useMemo(() => {
    const s = q.trim().toLowerCase();
    return allDealers.filter(d =>
      (dealerSel === ALL || d.code === dealerSel) &&
      (regionSel === ALL || d.region === regionSel) &&
      (provSel === ALL || d.province === provSel) &&
      (salesSel === ALL || (SALES_BANDS.find(b => b.v === salesSel)?.hit(perfOf(d.code).revenue) ?? true)) &&
      (!s || (d.code + d.name + d.province + d.region).toLowerCase().includes(s)),
    );
  }, [allDealers, q, dealerSel, regionSel, provSel, salesSel, SALES_BANDS]);
  const codes = useMemo(() => new Set(dealers.map(d => d.code)), [dealers]);

  const quotes = useMemo(
    () => netQuotes.filter(x => codes.has(x.dealerCode) && inRange(x.createdAt)),
    [netQuotes, codes, inRange],
  );
  // ⚠️ ต้องกรองช่วงเวลาด้วย (inRange) เหมือน quotes ข้างบน — เดิมไม่กรอง ทำให้ทุกการ์ดที่จับคู่
  //    "ลูกค้าเป้าหมาย เทียบ ใบเสนอราคา" เอาลูกค้าเป้าหมาย "ทั้งหมดตั้งแต่เปิดสาขา" ไปเทียบกับใบ "เฉพาะช่วงที่เลือก"
  //    เลือกช่วงแคบ ๆ แล้วแท่งสองอันจึงไม่มีทางสัมพันธ์กันเลย (บอสแจ้ง 21 ส.ค. 69: "ทำไมมันไม่เท่ากัน")
  const leads = useMemo(
    () => netLeads.filter(l => codes.has(dealerCodeOf(l)) && inRange(l.createdAt ?? "")),
    [netLeads, codes, inRange],
  );

  // filter(Boolean) จำเป็น ไม่ใช่กันไว้เฉย ๆ — ดีลเลอร์ที่บันทึกไว้ก่อนมีฟิลด์ province/region จะได้ค่า undefined
  // กลายเป็น <option> ที่เลือกแล้วกรองอะไรไม่ได้ + React เตือน "unique key" (key={undefined})
  const regionOpts = useMemo(() => [...new Set(allDealers.map(d => d.region).filter(Boolean))].sort(), [allDealers]);
  const provOpts = useMemo(() => [...new Set(allDealers.map(d => d.province).filter(Boolean))].sort(), [allDealers]);
  // ตัวกรอง "ประเภทอาคาร" (แม่แบบ) ถอดออกแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69

  // สถิติใบรายดีลเลอร์ "หลังกรอง" ที่ DB (M9 Phase 2) — supabase · local/ยังไม่กลับ = client จาก quotes
  // ตัวกรอง = ชุดเดียวกับ quotes: dealerCodes (codes ที่ผ่านตัวกรอง) · ช่วงเวลา
  const qSummary = useHQQuotationsSummary(useMemo(() => ({
    dealerCodes: [...codes],
    dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end), asOf: isoDateOf(APP_NOW),
  }), [codes, timeRange.start, timeRange.end]));
  const byDealer = useMemo(() => qSummary ? new Map(qSummary.byDealer.map(d => [d.dealerCode, d])) : null, [qSummary]);
  // ลูกค้าเป้าหมายรายสาขา (leads/quoted) ที่ DB — ตัวกรองชุดเดียวกับ leads: codes + ช่วงเวลา
  // ⚠️ ช่วงเวลาต้องส่งไปด้วย ไม่งั้นได้ยอด "ทั้งหมดตั้งแต่เปิดสาขา" มาเทียบกับใบเสนอราคาเฉพาะช่วงที่เลือก
  const leadSum = useLeadSummary(useMemo(() => ({
    dealerCodes: [...codes],
    dateStart: isoDateOf(timeRange.start), dateEnd: isoDateOf(timeRange.end),
  }), [codes, timeRange.start, timeRange.end]));
  const leadByDealer = useMemo(() => leadSum ? new Map(leadSum.byDealer.map(d => [d.dealerCode, d])) : null, [leadSum]);

  // ── สถิติรายดีลเลอร์ — แหล่งเดียวของทุกกราฟ/ตาราง (คำนวณครั้งเดียว) ──
  const perf = useMemo(() => dealers.map(d => {
    const dq = quotes.filter(x => x.dealerCode === d.code);
    const dl = leads.filter(l => l.dealerCode === d.code);
    const lbd = leadByDealer?.get(d.code);
    // นับ/รวมยอด: supabase = จาก byDealer (parity) · ไม่มี = client จาก dq
    const a = byDealer?.get(d.code);
    // ใบเสนอราคาล่าสุด: supabase = byDealer.latest (ISO) · fallback = client dq
    let latestStr = "—";
    if (a) {
      if (a.latest) { const p = a.latest.split("-").map(Number); latestStr = `${p[2]} ${TH_ABBR[p[1] - 1]} ${p[0] + 543}`; }
    } else {
      const latest = dq.map(x => parseThaiDate(x.createdAt)).filter(Boolean).sort((x, y) => +y! - +x!)[0] ?? null;
      if (latest) latestStr = `${latest.getDate()} ${TH_ABBR[latest.getMonth()]} ${latest.getFullYear() + 543}`;
    }
    const quotesN = a ? a.count : dq.length;
    const quoteVal = a ? a.value : dq.reduce((s, x) => s + x.valueNum, 0);
    const wonCount = a ? a.won : dq.filter(x => x.status === "won").length;
    const lostCount = a ? a.lost : dq.filter(x => x.status === "lost").length;
    const wonVal = a ? a.wonVal : dq.filter(x => x.status === "won").reduce((s, x) => s + x.valueNum, 0);
    const closed = wonCount + lostCount;
    return {
      ...d,
      leads: lbd ? lbd.leads : dl.length,
      quoted: lbd ? lbd.quoted : dl.filter(l => QUOTED_UP.includes(l.status)).length,
      quotes: quotesN,
      quoteVal,
      wonCount,
      lostCount,   // ปฏิเสธจริงเท่านั้น — ไม่ใช่ "ใบทั้งหมด − ปิดได้"
      wonVal,
      conv: closed ? Math.round(wonCount / closed * 100) : null,
      // ⚠️ ยอดสะสม/เป้า = ตัวเลข "ทั้งปี" ไม่ขึ้นกับตัวกรอง (บอสสั่งกลับ 26 ส.ค. 69)
      //    เป้าที่ HQ ตั้งให้ดีลเลอร์เป็นรายปี — ถ้าหดตามช่วง เลือก "วันนี้" จะได้ 0% ทุกสาขา
      //    ส่วนคอลัมน์ลูกค้าเป้าหมาย/ใบเสนอราคา/มูลค่า ยังเดินตามตัวกรองตามเดิม
      revenueActual: perfOf(d.code).revenue,
      tpct: d.revenueTarget > 0 ? Math.round(perfOf(d.code).revenue / d.revenueTarget * 100) : 0,
      latest: latestStr,
    };
  }).sort((a, b) => b.revenueActual - a.revenueActual), [dealers, quotes, leads, byDealer, leadByDealer]);

  // ── Executive KPI (4 การ์ด — ตัด Forecast ออก ไม่มีข้อมูล · ตัด "ดีลเลอร์ยอดขายสูงสุด" ตามคำสั่ง) ──
  const kpi = useMemo(() => {
    // รวมจาก perf (มาจาก byDealer ที่ DB เมื่อพร้อม · client เมื่อ fallback) — ชุดเดียวกับตาราง/กราฟ
    const wonCount = perf.reduce((s, d) => s + d.wonCount, 0), lostCount = perf.reduce((s, d) => s + d.lostCount, 0);
    const closed = wonCount + lostCount;
    const actual = dealers.reduce((s, d) => s + perfOf(d.code).revenue, 0);   // ยอดสะสมทั้งปี
    // เป้าทั้งเครือใช้ค่าที่ HQ ตั้งไว้ · แต่ถ้ากรองเหลือบางดีลเลอร์ ต้องรวมเป้าเฉพาะรายนั้น ไม่งั้น % ผิด
    const filtered = dealers.length !== allDealers.length;
    const target = filtered ? dealers.reduce((s, d) => s + d.revenueTarget, 0) : targets.annualTarget;
    return {
      wonVal: perf.reduce((s, d) => s + d.wonVal, 0), wonCount,
      quotes: perf.reduce((s, d) => s + d.quotes, 0), quoteVal: perf.reduce((s, d) => s + d.quoteVal, 0),
      conv: closed ? Math.round(wonCount / closed * 100) : null,
      actual, target, tpct: target > 0 ? Math.round(actual / target * 100) : 0, filtered,
    };
  }, [perf, dealers, allDealers.length, targets.annualTarget]);

  // ── Section 1 · ลูกค้าเป้าหมาย เทียบ ใบเสนอราคา — สลับมุมมองได้ 4 แบบ ──
  // "อัตราแปลง" ที่เคยต่อท้ายแต่ละแถวถูกตัดออก (บอสสั่ง 17 ก.ค. 69) — มันคิดจากสถานะลูกค้าเป้าหมาย
  // (ถึงขั้นเสนอราคาขึ้นไป ÷ ลูกค้าเป้าหมายทั้งหมด) ไม่ใช่เลขคู่ "ลูกค้าเป้าหมาย / ใบ" ที่โชว์อยู่ข้างหน้า คนอ่านเลยตีความผิด
  // และ seed วนสถานะเท่า ๆ กันจนได้ 50% แทบทุกแถว ไม่มีสาระให้เทียบ
  //
  // ⚠️ หน่วยของสองแท่งต้องเป็น "ราย" เหมือนกัน (บอสแจ้ง 21 ส.ค. 69: "ทำไมมันไม่เท่ากัน")
  //    ของเดิมแท่งหลังนับ "จำนวนใบเสนอราคา" ซึ่งเป็นคนละหน่วยกับแท่งหน้าที่นับ "จำนวนราย"
  //    ลูกค้าหนึ่งรายออกได้หลายใบ · ใบของลูกค้าเก่าก็ถูกนับทั้งที่เจ้าตัวไม่อยู่ในแท่งหน้า
  //    → เชียงใหม่จึงขึ้น 16 / 24 แท่งหลังยาวกว่าแท่งหน้า ทั้งที่ควรเป็นส่วนย่อยของกันและกัน
  //    ตอนนี้แท่งหลัง = "ลูกค้าเป้าหมายที่ออกใบเสนอราคาแล้ว" (QUOTED_UP) จึงไม่มีทางเกินแท่งหน้า
  //    สูตรเดียวกับ /hq/leads และการ์ด "อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา" ที่ /hq/quotations
  const leadVsQuote = useMemo(() => {
    // ⚠️ ปิดการขายได้แล้ว = เป็น "ลูกค้า" ไปแล้ว ไม่ใช่ลูกค้าเป้าหมายอีกต่อไป จึงหักออกทั้งสองแท่ง
    //    (บอสสั่ง 21 ส.ค. 69) การ์ดนี้จึงเป็นภาพของ "รายที่ยังไล่อยู่" ไม่ใช่ยอดสะสมตลอดกาล
    //    รายที่ปิดไม่สำเร็จยังนับอยู่ — เขาไม่เคยเป็นลูกค้า จึงยังเป็นตัวหารของความพยายามในช่วงนั้น
    // ⚠️ ต้องหักจากตัวเลขที่ฐานข้อมูลสรุปมา (ใบ 0157 เพิ่ม won รายสาขา + quoted รายเดือน)
    //    ห้ามหันไปนับจากรายการดิบฝั่งหน้าจอ — หน้าสำนักงานใหญ่ไม่ได้โหลดลูกค้าเป้าหมายทั้งเครือไว้
    //    (ลองแล้วได้การ์ดว่าง "ไม่พบข้อมูลในช่วงที่เลือก" ทั้งที่ข้อมูลมีอยู่จริง)
    const useRpc = !!leadSum;
    if (view === "month") {
      // รายเดือน = มองเป็นรุ่น (cohort): ลูกค้าเป้าหมายที่เข้ามาเดือนนั้น กี่รายไปถึงขั้นออกใบเสนอราคา
      const lM = new Map<string, number>(), qM = new Map<string, number>();
      if (useRpc) {
        leadSum.byMonth.forEach(r => {
          lM.set(`${r.y}-${r.m}`, Math.max(0, r.created - r.won));
          qM.set(`${r.y}-${r.m}`, Math.max(0, r.quoted - r.won));
        });
      } else {
        const mk = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;
        leads.filter(l => l.status !== "PAID").forEach(l => {
          const d = parseThaiDate(l.createdAt ?? ""); if (!d) return;
          lM.set(mk(d), (lM.get(mk(d)) ?? 0) + 1);
          if (QUOTED_UP.includes(l.status)) qM.set(mk(d), (qM.get(mk(d)) ?? 0) + 1);
        });
      }
      const out: { key: string; label: string; a: number; b: number }[] = [];
      const cur = new Date(timeRange.start.getFullYear(), timeRange.start.getMonth(), 1);
      const end = new Date(timeRange.end.getFullYear(), timeRange.end.getMonth(), 1);
      while (cur <= end) {
        const k = `${cur.getFullYear()}-${cur.getMonth()}`;
        out.push({ key: k, label: TH_ABBR[cur.getMonth()], a: lM.get(k) ?? 0, b: qM.get(k) ?? 0 });
        cur.setMonth(cur.getMonth() + 1);
      }
      return out;
    }
    const keyOf = (code: string) => view === "dealer" ? code
      : view === "region" ? (DEALER_META.get(code)?.region ?? "—")
      : (DEALER_META.get(code)?.province ?? "—");
    const m = new Map<string, { a: number; b: number }>();
    const add = (k: string, f: "a" | "b", n: number) => { const r = m.get(k) ?? { a: 0, b: 0 }; r[f] += n; m.set(k, r); };
    if (useRpc) {
      leadSum.byDealer.forEach(d => {
        add(keyOf(d.dealerCode), "a", Math.max(0, d.leads - d.won));
        add(keyOf(d.dealerCode), "b", Math.max(0, d.quoted - d.won));
      });
    } else {
      leads.filter(l => l.status !== "PAID").forEach(l => {
        add(keyOf(dealerCodeOf(l)), "a", 1);
        if (QUOTED_UP.includes(l.status)) add(keyOf(dealerCodeOf(l)), "b", 1);
      });
    }
    return [...m.entries()].map(([k, v]) => ({
      key: k, a: v.a, b: v.b,
      label: view === "dealer" ? `${k} – ${DEALER_META.get(k)?.name ?? k}` : view === "region" ? regionDisplay(k) : k,
      onClick: view === "dealer" ? () => router.push(`/hq/dealers/${k}`) : undefined,
    })).sort((x, y) => y.a - x.a);
  }, [view, leadSum, leads, DEALER_META, timeRange, router]);

  // ── Section 2 · มูลค่าใบเสนอราคา เทียบ ยอดขายจริง (รายดีลเลอร์) ──
  const quoteVsSales = useMemo(() => perf.map(d => ({
    key: d.code, label: `${d.code} – ${d.name}`, a: d.quoteVal, b: d.wonVal,
    // สัดส่วน "มูลค่า" ไม่ใช่ "จำนวนใบ" — คนละตัวกับ "อัตราปิดการขาย" ที่นับใบ ต้องกำกับหน่วยไว้ ไม่งั้นอ่านว่าขัดกัน
    note: d.quoteVal ? `ปิดได้ ${Math.round(d.wonVal / d.quoteVal * 100)}% ของมูลค่า` : undefined,
    onClick: () => router.push(`/hq/dealers/${d.code}`),
  })).sort((a, b) => b.a - a.a), [perf, router]);

  // ── Section 2b · วิเคราะห์ประสิทธิภาพการปิดการขายของดีลเลอร์ ──
  // แท่งคู่ทุกดีลเลอร์: ออกใบกี่ใบ เทียบ ปิดได้กี่ใบ · เรียงออกใบมาก→น้อย
  // "ยังไม่รู้ผล" ต้องแยกออกมาเสมอ ไม่ยุบเข้า "ปิดไม่ได้" (ดูเหตุผลในคอมเมนต์ของคอมโพเนนต์)
  const quotePerf = useMemo(
    () => perf
      .filter(d => d.quotes > 0)  // ไม่มีใบเลย = ไม่มีอะไรให้วัด
      .map(d => ({
        code: d.code, name: d.name,
        quotes: d.quotes, won: d.wonCount, lost: d.lostCount,
        pending: d.quotes - d.wonCount - d.lostCount,
        conv: d.conv,
      }))
      .sort((a, b) => b.quotes - a.quotes || b.won - a.won),
    [perf],
  );

  // ── Section 3 · เป้าหมายทั้งปี เทียบ ยอดขายจริง — สลับกลุ่มได้ ──
  const [tgView, setTgView] = useState<"dealer" | "region" | "province">("dealer");
  const targetVsActual = useMemo(() => {
    const keyOf = (d: DealerRow) => tgView === "dealer" ? d.code : tgView === "region" ? d.region : d.province;
    const m = new Map<string, { a: number; b: number }>();
    dealers.forEach(d => {
      const k = keyOf(d);
      const r = m.get(k) ?? { a: 0, b: 0 };
      r.a += perfOf(d.code).revenue; r.b += d.revenueTarget;
      m.set(k, r);
    });
    return [...m.entries()].map(([k, v]) => ({
      key: k, a: v.a, b: v.b,
      label: tgView === "dealer" ? `${k} – ${DEALER_META.get(k)?.name ?? k}` : tgView === "region" ? regionDisplay(k) : k,
      note: v.b ? `${Math.round(v.a / v.b * 100)}% ของเป้า` : undefined,
      onClick: tgView === "dealer" ? () => router.push(`/hq/dealers/${k}`) : undefined,
    }))
      // ยอดเท่ากัน (เช่นต้นปียัง ฿0 หมด) → % ของเป้า แล้วค่อยเป้าที่ใหญ่กว่า
      .sort((x, y) => y.a - x.a || (y.b ? y.a / y.b : 0) - (x.b ? x.a / x.b : 0) || y.b - x.b);
  }, [tgView, dealers, DEALER_META, router]);
  // แสดงหน้าละ 7 แถว + แถบเปลี่ยนหน้า (บอสสั่ง 22 ก.ย. 69 — เดิมเทรวดทุกดีลเลอร์ 155 แถว ยาวเกินไป)
  const TG_PAGE_SIZE = 7;
  const [tgPage, setTgPage] = useState(0);
  useEffect(() => { setTgPage(0); }, [tgView]);
  const tgPageSafe = Math.min(tgPage, pageCountOf(targetVsActual.length, TG_PAGE_SIZE) - 1);
  const tgRows = pageSlice(targetVsActual, tgPageSafe, TG_PAGE_SIZE);

  // เดิมมี regional / lostReasons / trend สำหรับกราฟ 4 ใบที่ถูกตัดออก (ข้อมูลซ้ำกับหน้าอื่น) — ลบทิ้งพร้อมกัน

  // ── Drawer (View) — เจาะรายดีลเลอร์ ไม่เปลี่ยนหน้า ──
  const [drawer, setDrawer] = useState<typeof perf[number] | null>(null);
  // ข้อมูลรายสาขาใน drawer — supabase: ดึงตรงจาก repo (M9 Phase 4) · local/ยังไม่กลับ: กรอง array เดิม
  const drawerData = useDealerDrawerData(drawer?.code ?? null);
  const anyFilter = q.trim() !== "" || [dealerSel, regionSel, provSel, salesSel].some(v => v !== ALL);

  // ── ตารางผลงานดีลเลอร์: แบ่งหน้า 10 แถวเท่าทุกตารางในระบบ ──
  // เปลี่ยนตัวกรองต้องกลับหน้า 1 เสมอ — ไม่งั้นกรองแล้วค้างอยู่หน้ากลางลิสต์ที่ไม่มีข้อมูลแล้ว
  const [perfPage, setPerfPage] = useState(0);
  useEffect(() => { setPerfPage(0); }, [q, dealerSel, regionSel, provSel, salesSel]);
  const perfPageSafe = Math.min(perfPage, pageCountOf(perf.length) - 1);
  const perfRows = pageSlice(perf, perfPageSafe);

  const kNum: React.CSSProperties = { fontSize: "1.15rem", fontWeight: 800, color: "#1F2937", lineHeight: 1.15, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em", whiteSpace: "nowrap" };
  const kSub: React.CSSProperties = { fontSize: "0.72rem", color: MUTED };
  const kpiCards = [
    { label: "ยอดขายจริง (ในช่วง)", value: fmtBaht(kpi.wonVal), sub: `${kpi.wonCount} ดีล · จากใบเสนอราคาที่ปิดได้`, Icon: Trophy, color: "#059669", bg: "#E6F6EF" },
    { label: "มูลค่าใบเสนอราคา", value: fmtBaht(kpi.quoteVal), sub: `${kpi.quotes} ใบ · ในช่วงที่เลือก`, Icon: FileText, color: "#0891B2", bg: "#E6F4F9" },
    // ⚠️ หารด้วย "ใบที่รู้ผลแล้ว" เท่านั้น — คนละตัวหารกับการ์ดชื่อคล้ายกันที่หน้าใบเสนอราคาทั้งเครือ
    { label: "อัตราปิดการขาย (จากใบที่รู้ผลแล้ว)", value: kpi.conv === null ? "—" : `${kpi.conv}%`, sub: "ตอบรับ ÷ (ตอบรับ + ปฏิเสธ)", Icon: Percent, color: "#7C3AED", bg: "#F0EBFB" },
    { label: "เป้าหมายทั้งปี", value: dealerPerf.ready ? `${kpi.tpct}%` : "—", sub: `ยอดสะสม ${money(kpi.actual)} จาก ${fmtBaht(kpi.target)}`, Icon: Target, color: "#2563EB", bg: "#E8F0FE" },
  ];

  // ตัวกรองทุกช่องกว้างเท่ากันและยืด/หดร่วมกันในแถวเดียว (บอสสั่ง 14 ก.ย. 69 "แก้" — ภาพแถบที่ขึ้น 2 แถว)
  //   เดิม width:auto → ช่อง "ทุกดีลเลอร์" กว้างตามชื่อดีลเลอร์ที่ยาวที่สุด ดันช่องอื่นตกไปแถวสอง
  //   ป้ายยาว ถูกตัดด้วย … ในช่อง — ชี้ค้างอ่านเต็มได้จาก title · ห้ามตัดคำบอกที่มาทิ้ง
  const sel = (v: string, on: (x: string) => void, caption: string, opts: { v: string; l: string }[]) => (
    // ตัวเลือกแรกคือทั้งหมด — ป้าย "ทุก…" ของตัวกรองแต่ละช่อง
    <select aria-label={caption} title={caption} value={v} onChange={e => on(e.target.value)} className="form-select"
      style={{ flex: "1 1 130px", minWidth: 0, maxWidth: 210, cursor: "pointer", textOverflow: "ellipsis" }}>
      <option value={ALL}>{caption}</option>
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const viewTab = (cur: string, v: string, l: string, on: () => void) => (
    <button key={v} onClick={on} style={{
      padding: "4px 11px", borderRadius: 8, fontSize: "0.68rem", fontWeight: 700, cursor: "pointer",
      border: `1px solid ${cur === v ? PRIMARY : "#dbe3ec"}`, background: cur === v ? PRIMARY : "#fff",
      color: cur === v ? "#fff" : MUTED,
    }}>{l}</button>
  );

  return (
    <div className="erp">
      {/* ── HEADER ── */}
      {/* ปุ่ม/ตัวกรองของหน้าอยู่ขวาหัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้า/ป้ายกลุ่มมาจากแถบบนแล้ว */}
      <TopbarActions>
          <FilterBar dims={[]} />
          {/* ส่งออก = ตารางผลงานที่เห็นบนจอ (ผ่านตัวกรองทุกตัวแล้ว) */}
          <ExportMenu filename="hq-sales-analytics" title="ภาพรวมยอดขายทั้งเครือ"
            headers={["รหัสดีลเลอร์", "ดีลเลอร์", "ภูมิภาค", "จังหวัด", "ลูกค้าเป้าหมาย", "ใบเสนอราคา", "มูลค่าใบเสนอราคา", "ยอดขายสะสมทั้งปี", "อัตราปิดการขาย", "เป้าหมายทั้งปี", "% ของเป้า", "ใบเสนอราคาล่าสุด"]}
            rows={perf.map(d => [
              d.code, d.name, regionDisplay(d.region), d.province, d.leads, d.quotes, d.quoteVal,
              d.revenueActual, d.conv === null ? "—" : `${d.conv}%`, d.revenueTarget, `${d.tpct}%`, d.latest,
            ])} />
      </TopbarActions>

      {/* ── EXECUTIVE KPI ── */}
      <div className="hq-kpi4" style={{ marginBottom: "1.25rem" }}>
        {kpiCards.map(k => (
          <div key={k.label} className="card" style={{ marginBottom: 0, padding: "18px 18px 15px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...kSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</div>
              <div style={{ ...kNum, marginTop: 6 }}>{k.value}</div>
              <div style={{ ...kSub, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.sub}</div>
            </div>
            <span style={{ width: 42, height: 42, borderRadius: 12, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <k.Icon size={20} color={k.color} strokeWidth={2.1} />
            </span>
          </div>
        ))}
      </div>

      {/* ── SMART FILTER ── อยู่ใต้ KPI เหมือนหน้า HQ อื่น (ใบเสนอราคา/ลูกค้า/ดีลเลอร์)
          เดิมหน้านี้หน้าเดียวที่เอาตัวกรองไว้เหนือ KPI */}
      <div className="card hq-sticky-filter" style={{ marginBottom: "1.25rem" }}>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", paddingTop: 12, paddingBottom: 12 }}>
          {/* ช่องค้นหาแบบเดียวกับทุกหน้า HQ (ไอคอน + ปุ่มล้าง) */}
          <div className="search-bar" style={{ flex: "1.4 1 200px", minWidth: 180, maxWidth: 300 }}>
            <Search size={14} color="#9ca3af" />
            <input aria-label="ค้นหาดีลเลอร์" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหารหัส ชื่อดีลเลอร์ จังหวัด…" />
            {q && <button aria-label="ล้างคำค้น" onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
          </div>
          {sel(dealerSel, setDealerSel, "ทุกดีลเลอร์", allDealers.map(d => ({ v: d.code, l: `${d.code} – ${d.name}` })))}
          {sel(regionSel, setRegionSel, "ทุกภูมิภาค", regionOpts.map(r => ({ v: r, l: regionDisplay(r) })))}
          {sel(provSel, setProvSel, "ทุกจังหวัด", provOpts.map(p => ({ v: p, l: p })))}
          {sel(salesSel, setSalesSel, "ทุกช่วงยอดขาย", SALES_BANDS.map(b => ({ v: b.v, l: b.l })))}
          {anyFilter && (
            <button onClick={() => { setQ(""); setDealerSel(ALL); setRegionSel(ALL); setProvSel(ALL); setSalesSel(ALL); }}
              className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>ล้างตัวกรอง</button>
          )}
        </div>
      </div>

      {/* ── แถว 1 · วิเคราะห์ประสิทธิภาพการปิดการขายของดีลเลอร์ — เต็มความกว้าง ──
          คำถามหลักของหน้า "ใครออกใบเยอะแต่ปิดได้น้อย" จึงขึ้นก่อนเพื่อน
          แท่งคู่ 10 ดีลเลอร์ · ตัวเลขชุดเดียวกันอยู่ในตารางแถว 3 (แยกการ์ดเพื่อไม่ให้ใบเดียวสูง 1,010px) */}
      <DealerQuotationPerformance rows={quotePerf} />

      {/* ── แถว 2 · เปรียบเทียบรายดีลเลอร์: ลูกค้าเป้าหมาย→ใบเสนอราคา | มูลค่า→ยอดขายจริง ──
          สองใบนี้เป็นแท่งคู่รายดีลเลอร์เหมือนกันและสูงพอ ๆ กัน จับคู่ไว้แถวเดียว
          (เดิมทั้งหน้าเป็นการ์ดเต็มความกว้าง 8 ใบเรียงซ้อนกัน ยาว 4,800px) */}
      <div className="hq-dealer-charts" style={{ marginBottom: "1.25rem", alignItems: "stretch" }}>
      <div className="card chart-m" style={{ marginBottom: 0 }}>
        <div className="card-header">
          <div className="card-title">ลูกค้าเป้าหมาย เทียบ ที่ออกใบเสนอราคาแล้ว</div>
          <div style={{ display: "flex", gap: 5 }}>
            {([["dealer", "ดีลเลอร์"], ["region", "ภูมิภาค"], ["province", "จังหวัด"], ["month", "รายเดือน"]] as const)
              .map(([v, l]) => viewTab(view, v, l, () => setView(v)))}
          </div>
        </div>
        <HBars rows={leadVsQuote} aLabel="ลูกค้าเป้าหมาย" bLabel="ออกใบเสนอราคาแล้ว" bColor="#0891b2" fmt={v => `${v} ราย`} />
      </div>

      {/* ── SECTION 2 · มูลค่าใบเสนอราคา เทียบ ยอดขายจริง ── */}
      <div className="card chart-m" style={{ marginBottom: 0 }}>
        <div className="card-header">
          <div className="card-title">มูลค่าใบเสนอราคา เทียบ ยอดขายจริง · รายดีลเลอร์</div>
        </div>
        <HBars rows={quoteVsSales} aLabel="มูลค่าใบเสนอราคา" bLabel="ยอดขายจริง" aColor="#0891b2" bColor="#059669" fmt={fmtBaht} />
      </div>
      </div>

      {/* ── แถว 3 · ตัวเลขการปิดการขาย (ตารางของกราฟแถว 1) | เป้าหมายทั้งปี เทียบ ยอดขายจริง ──
          โดนัท "เหตุผลที่เสียโอกาสการขาย" ที่เคยอยู่แถวนี้ถูกตัดออก — ซ้ำกับ /hq/leads และ /hq/quotations */}
      <div className="hq-dealer-charts" style={{ marginBottom: "1.25rem", alignItems: "stretch" }}>
      <DealerQuotationTable rows={quotePerf} avgConv={kpi.conv} />

      {/* ไม่ใช้ chart-l (ล็อกสูง 420px ตายตัว) — การ์ดคู่กันเป็นตารางที่สูงตามจำนวนดีลเลอร์
          ความสูงตายตัวชนะ align-items: stretch เสมอ → การ์ดขวาเตี้ยกว่า เหลือช่องว่างใต้การ์ด
          ยืดเองด้วย flex column แทน แล้วปล่อยให้ .chart-scroll ข้างในกินที่ที่เหลือ */}
      <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
        <div className="card-header">
          <div className="card-title">เป้าหมายทั้งปี เทียบ ยอดขายจริง</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {([["dealer", "ดีลเลอร์"], ["region", "ภูมิภาค"], ["province", "จังหวัด"]] as const)
              .map(([v, l]) => viewTab(tgView, v, l, () => setTgView(v)))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <HBars rows={tgRows} aLabel="ยอดขายสะสมทั้งปี" bLabel="เป้าหมายทั้งปี" fmt={fmtBaht} paged />
        </div>
        <TablePagination page={tgPageSafe} total={targetVsActual.length} onPage={setTgPage} size={TG_PAGE_SIZE}
          unit={tgView === "dealer" ? "ดีลเลอร์" : tgView === "region" ? "ภูมิภาค" : "จังหวัด"} />
      </div>
      </div>

      {/* กราฟที่ถูกตัดออกจากหน้านี้ (ข้อมูลซ้ำ — ดูที่เจ้าของเรื่องแทน):
          · เหตุผลที่เสียโอกาสการขาย → /hq/leads และ /hq/quotations
          · เทียบรายภูมิภาค          → /hq/quotations
          · แนวโน้มจำนวนรายการ/ยอดขาย → แดชบอร์ด HQ (SalesTrendChart + ลูกค้าเป้าหมาย·ใบเสนอราคา·ปิดการขาย รายเดือน) */}
      {/* ── PERFORMANCE TABLE — ตารางเต็มท้ายหน้าตามเดิม (ตามที่บอสสั่ง ไม่แยกแท็บ) ── */}
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="card-header">
          <div className="card-title">ตารางผลงานดีลเลอร์</div>
        </div>
        <div className="table-wrap">
          <table>
            <colgroup>
              {/* รวม minWidth = 1,102px — พอดีพื้นที่จริง 1,128px (วัดที่จอ 1440 · 11 ส.ค. 69)
                  ชุดเดิมรวม 996px แต่แบ่งผิดสัดส่วน: ช่องภูมิภาคแคบกว่าป้ายชื่อภาคเต็ม
                  ("ภาคตะวันออกเฉียงเหนือ") และหัวคอลัมน์ยาวหลายอันถูกเฉือน ทั้งที่ยังเหลือที่ว่าง */}
              <col style={{ width: 96 }} />{/* รหัส — ต้องเห็นครบ 5 ตัวอักษร (บอสสั่ง 19 ต.ค. 69) */}
              <col style={{ width: "12%", minWidth: 136 }} />{/* ดีลเลอร์ */}
              <col style={{ width: "13%", minWidth: 148 }} />{/* ภูมิภาค — ป้ายชื่อภาคเต็ม ห้ามตัด */}
              <col style={{ width: "5%", minWidth: 58 }} />{/* ลูกค้าเป้าหมาย */}
              <col style={{ width: "8%", minWidth: 94 }} />{/* ใบเสนอราคา */}
              <col style={{ width: "9%", minWidth: 100 }} />{/* มูลค่าเสนอ */}
              <col style={{ width: "9%", minWidth: 100 }} />{/* ยอดขายสะสม */}
              <col style={{ width: "7%", minWidth: 84 }} />{/* อัตราปิด */}
              <col style={{ width: "8%", minWidth: 94 }} />{/* เป้าทั้งปี */}
              <col style={{ width: "6%", minWidth: 76 }} />{/* % เป้า */}
              <col style={{ width: "9%", minWidth: 98 }} />{/* เสนอล่าสุด */}
              <col style={{ width: "8%", minWidth: 56 }} />{/* ปุ่มดู */}
            </colgroup>
            <thead>
              <tr>
                <th>รหัส</th>
                <th>ดีลเลอร์</th>
                <th>ภูมิภาค</th>
                <th style={{ textAlign: "right" }} title="ลูกค้าเป้าหมาย">เป้าหมาย</th>
                <th style={{ textAlign: "right" }}>ใบเสนอราคา</th>
                {/* หัวคอลัมน์ต้องสั้นพอไม่ให้ถูกเฉือน (th ตั้ง white-space: nowrap ทั้งระบบ) */}
                <th style={{ textAlign: "right" }} title="มูลค่ารวมของใบเสนอราคาทั้งหมด">มูลค่าเสนอ</th>
                <th style={{ textAlign: "right" }}>ยอดขายสะสม</th>
                <th style={{ textAlign: "right" }} title="ปิดได้ ÷ (ปิดได้ + ปิดไม่ได้) — นับเฉพาะใบที่รู้ผลแล้ว · คนละสูตรกับ “อัตราปิดการขาย” ที่หน้าใบเสนอราคาทั้งเครือ">อัตราปิด</th>
                <th style={{ textAlign: "right" }}>เป้าทั้งปี</th>
                <th style={{ textAlign: "right" }}>% เป้า</th>
                <th title="วันที่ออกใบเสนอราคาล่าสุด">เสนอล่าสุด</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!perf.length && <tr><td colSpan={12} style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ไม่พบดีลเลอร์ที่ตรงกับตัวกรอง</td></tr>}
              {perfRows.map(d => (
                <ClickableRow key={d.code} className="clickable" onActivate={() => setDrawer(d)} label={`เปิดรายละเอียดดีลเลอร์ ${d.name}`}>
                  <td data-col="code" style={{ fontFamily: "monospace", fontWeight: 700, color: PRIMARY, overflow: "visible", textOverflow: "clip", whiteSpace: "nowrap" }}>{d.code}</td>
                  <td style={{ fontWeight: 600, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.name}
                    {d.status === "inactive" && <span style={{ marginLeft: 6, fontSize: "0.62rem", fontWeight: 700, color: MUTED }}>(ปิดใช้งาน)</span>}
                  </td>
                  <td style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{regionDisplay(d.region)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.leads}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.quotes}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(d.quoteVal)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800, color: "#1F2937" }}>{money(d.revenueActual)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{d.conv === null ? "—" : `${d.conv}%`}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(d.revenueTarget)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: d.tpct >= 100 ? "#059669" : PRIMARY }}>{d.tpct}%</td>
                  <td style={{ color: MUTED, whiteSpace: "nowrap" }}>{d.latest}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button title="ดูรายละเอียด" onClick={() => setDrawer(d)}
                        style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #dbe3ec", background: "#fff", color: PRIMARY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Eye size={13} />
                      </button>
                    </div>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={perfPageSafe} total={perf.length} onPage={setPerfPage} unit="ดีลเลอร์" />
      </div>

      {/* ── DRAWER — เจาะรายดีลเลอร์ (อ่านอย่างเดียว ไม่มีแก้/ลบ) ── */}
      {drawer && <DealerDrawer d={drawer} onClose={() => setDrawer(null)}
        customers={drawerData ? drawerData.customers : netCustomers.filter(c => c.dealerCode === drawer.code)}
        leads={drawerData ? drawerData.leads : netLeads.filter(l => l.dealerCode === drawer.code)}
        quotes={drawerData ? drawerData.quotes : netQuotes.filter(x => x.dealerCode === drawer.code)}
        appointments={drawerData ? drawerData.appointments : appointments} files={dealerFiles} onOpenDealer={() => router.push(`/hq/dealers/${drawer.code}`)} />}
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────
// นัดหมาย/ไฟล์ ไม่มี dealerCode ในระบบ → ผูกผ่าน leadId/recordId = numId ของลูกค้าเป้าหมายดีลเลอร์รายนี้
// ดีลเลอร์ที่ยังไม่มีนัดหมาย/ไฟล์บันทึกไว้จะขึ้น "—" ตามจริง (ไม่เติมข้อมูลปลอม)
function DealerDrawer({ d, onClose, customers, leads, quotes, appointments, files, onOpenDealer }: {
  d: { code: string; name: string; region: string; province: string; status: string; revenueActual: number; revenueTarget: number; tpct: number; leads: number; quoted: number; quotes: number; quoteVal: number; wonCount: number; wonVal: number; conv: number | null; latest: string };
  onClose: () => void;
  customers: { id: number; name: string; province: string; dealsWon: number; totalRevenue: number }[];
  leads: { numId: number; company: string; status: string }[];
  quotes: { quoteNo: string; customer: string; valueNum: number; status: string; createdAt: string }[];
  appointments: { id: number; leadId?: number; company: string; project: string; date: string; time: string; assigned: string }[];
  files: DealerFile[];
  onOpenDealer: () => void;
}) {
  const leadIds = new Set(leads.map(l => l.numId));
  const appts = appointments.filter(a => a.leadId != null && leadIds.has(a.leadId));
  const docs = files.filter(f => f.source === "lead" && f.recordId != null && leadIds.has(f.recordId));

  // ยอดขายรายเดือนของดีลเลอร์รายนี้ — จากใบเสนอราคาที่ปิดได้จริง
  const monthly = (() => {
    const m = Array(12).fill(0);
    quotes.forEach(x => { if (x.status !== "won") return; const dt = parseThaiDate(x.createdAt); if (dt) m[dt.getMonth()] += x.valueNum; });
    const last = m.reduce((acc, v, i) => v > 0 ? i : acc, -1);
    return last < 0 ? [] : m.slice(0, last + 1).map((v, i) => ({ month: TH_ABBR[i], value: v }));
  })();
  const maxM = Math.max(...monthly.map(x => x.value), 1);

  const head: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, fontSize: "0.62rem", fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 14, marginBottom: 8 };
  // เนื้อหาแต่ละหัวข้ออยู่ในการ์ดขอบมน — มาตรฐานเดียวกับแผงลูกค้าเป้าหมายฝั่ง HQ
  const กล่อง = (children: React.ReactNode) => (
    <div style={{ background: "#fff", border: "1px solid #E7EDF4", borderRadius: 14, padding: "6px 14px", boxShadow: "0 1px 2px rgba(15,23,42,.04)" }}>{children}</div>
  );
  const row = (l: string, v: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", fontSize: "0.76rem", borderBottom: "1px solid #F1F5F9" }}>
      <span style={{ color: "#64748B" }}>{l}</span>
      <span style={{ fontWeight: 700, color: STEEL, textAlign: "right" }}>{v}</span>
    </div>
  );
  const empty = (t: string) => <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "8px 0" }}>— {t}</div>;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.35)", zIndex: 300 }} />
      {/* แผงลอยจากขอบจอแล้วมนทุกมุม เหมือนแผงรายละเอียดหน้าอื่น (บอสสั่ง 28 ส.ค. 69) */}
      <div className="side-drawer" style={{ position: "fixed", top: 12, right: 12, bottom: 12, width: 460, maxWidth: "calc(100vw - 24px)", background: "#f8fafc", zIndex: 310, display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 70px rgba(0,51,102,.22)" }}>
        {/* Dealer Profile */}
        <div style={{ background: PRIMARY, padding: "18px 20px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,.72)", marginTop: 3 }}>
                {d.code} · {regionDisplay(d.region)} · {d.province}{d.status === "inactive" ? " · ปิดใช้งาน" : ""}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 18px" }}>
          <div style={head}><Users size={11} /> สรุปลูกค้าเป้าหมาย</div>
          {กล่อง(<>
            {row("ลูกค้าเป้าหมายทั้งหมด", `${d.leads} ราย`)}
            {row("เสนอราคาแล้ว", `${d.quoted} ราย`)}
            {row("อัตราแปลงเป็นใบเสนอราคา", d.leads ? `${Math.round(d.quoted / d.leads * 100)}%` : "—")}
          </>)}

          <div style={head}><FileText size={11} /> สรุปใบเสนอราคา</div>
          {กล่อง(<>
            {row("ใบเสนอราคา (ในช่วง)", `${d.quotes} ใบ`)}
            {row("มูลค่ารวม", fmtBaht(d.quoteVal))}
            {row("ปิดได้", `${d.wonCount} ใบ · ${fmtBaht(d.wonVal)}`)}
            {row("อัตราปิดการขาย", d.conv === null ? "—" : `${d.conv}%`)}
            {row("ใบเสนอราคาล่าสุด", d.latest)}
          </>)}

          <div style={head}><Building2 size={11} /> สรุปลูกค้า</div>
          {กล่อง(<>
            {row("ลูกค้าทั้งหมด", `${customers.length} ราย`)}
            {row("มูลค่ารวมจากลูกค้า", fmtBaht(customers.reduce((s, c) => s + c.totalRevenue, 0)))}
            {!customers.length ? empty("ยังไม่มีลูกค้า") : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {[...customers].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5).map((c, i, ทั้งหมด) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", fontSize: "0.74rem", borderBottom: i === ทั้งหมด.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                    <span style={{ color: "#64748B", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(c.totalRevenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </>)}

          <div style={head}><Coins size={11} /> สรุปยอดขาย</div>
          <div style={{ fontSize: "0.66rem", color: "#94A3B8", marginBottom: 6 }}>ยอดสะสม/เป้า = ตัวเลขทางการของดีลเลอร์ · ไม่ใช่ผลรวมใบเสนอราคาด้านบน</div>
          {กล่อง(<>
            {row("ยอดขายสะสมทั้งปี", fmtBaht(d.revenueActual))}
            {row("เป้าหมายทั้งปี", fmtBaht(d.revenueTarget))}
            {row("% ของเป้า", <span style={{ color: d.tpct >= 100 ? "#059669" : PRIMARY }}>{d.tpct}%</span>)}
          </>)}

          <div style={head}>ยอดขายรายเดือน · จากใบเสนอราคาที่ปิดได้</div>
          {!monthly.length ? กล่อง(empty("ยังไม่มียอดปิดการขาย")) : กล่อง(
            <div style={{ display: "flex", flexDirection: "column", gap: 7, padding: "8px 0" }}>
              {monthly.map(m => (
                <div key={m.month} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 34, fontSize: "0.66rem", color: MUTED, fontWeight: 700, flexShrink: 0 }}>{m.month}</span>
                  <div style={{ flex: 1, height: 7, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                    <div className="bar-grow" style={{ height: "100%", width: `${Math.round(m.value / maxM * 100)}%`, background: PRIMARY, borderRadius: 999 }} />
                  </div>
                  <span style={{ width: 58, textAlign: "right", fontSize: "0.66rem", fontWeight: 700, color: STEEL, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{m.value ? fmtBaht(m.value) : "—"}</span>
                </div>
              ))}
            </div>
          )}

          <div style={head}><CalendarDays size={11} /> ไทม์ไลน์นัดหมาย</div>
          {กล่อง(!appts.length ? empty("ไม่มีนัดหมายที่ผูกกับลูกค้าเป้าหมายของดีลเลอร์รายนี้") : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {appts.map((a, i) => (
                <div key={a.id} style={{ padding: "9px 0", borderBottom: i === appts.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.project || a.company}</div>
                  <div style={{ fontSize: "0.65rem", color: "#64748B", marginTop: 3 }}>{fmtISOToThai(a.date)} · {a.time} · {a.assigned}</div>
                </div>
              ))}
            </div>
          ))}

          <div style={head}><FolderOpen size={11} /> เอกสาร</div>
          {กล่อง(!docs.length ? empty("ไม่มีเอกสารที่ผูกกับลูกค้าเป้าหมายของดีลเลอร์รายนี้") : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {docs.map((f, i) => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderBottom: i === docs.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "0.74rem", fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ fontSize: "0.65rem", color: "#94A3B8", flexShrink: 0 }}>{f.size}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #e6ebf2", background: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: "0.68rem", color: MUTED }}>สำนักงานใหญ่ดูอย่างเดียว</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onOpenDealer} className="btn btn-secondary btn-sm">เปิดหน้าดีลเลอร์</button>
            <button onClick={onClose} className="btn btn-primary btn-sm">ปิด</button>
          </div>
        </div>
      </div>
    </>
  );
}
