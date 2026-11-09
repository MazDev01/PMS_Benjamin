"use client";
// ─── HQ · ภาพรวมยอดขายทั้งเครือ (/hq/pipeline · FLOW H12) ──────────────────────────────────────────────────────────
// อ่านอย่างเดียว ไม่มีสร้าง/แก้/ลบ · บอสสั่ง 30 ต.ค. 69: เหลือ 3 ส่วน — การ์ด 4 ใบ · กราฟยอดขายเทียบเป้าตามช่วง · ตารางผลงานดีลเลอร์ตารางเดียว
//   ตัวเลขทุกตัวในหน้า = ฟังก์ชันกลางชุดเดียวกับการ์ด: ตาราง/กราฟมาจาก hq_pipeline_dealers (ใบ 0264) · การ์ดจาก kpi_cards('hq.pipeline')
//   ชุดสาขาที่เห็นในตาราง (หลังทุกตัวกรอง) = ชุดที่ส่งให้การ์ด → แถวรวมท้ายตาราง = การ์ด ทุกตัว ทุกตัวกรอง
//   (ข้อทดสอบ supabase/tests/hq_pipeline_dealers.sql · tests/scenario/hq-pipeline-h12.spec.ts)
//   เอาออก (ข้อมูลซ้ำ · รวมเข้าตารางแล้ว): ใบที่ออก vs ปิดได้ · ลีดเทียบออกใบ · มูลค่าใบเทียบยอดขาย · ตัวเลขการปิดการขายรายดีลเลอร์
//     · เป้าทั้งปีเทียบยอด (เคยขึ้น ฿0 ทุกสาขา — ยอดมาจากตัวรวมฝั่งหน้าเว็บอีกตัว) · ส่วนบวกรายดีลเลอร์ (ไม่ขึ้นกับตัวกรอง)
//   เป้าบนการ์ด = ผลรวมเป้าตามช่วงของสาขาในตารางเสมอ รวมตอนไม่กรอง (ใบ 0283 · บอสสั่ง 9 พ.ย. 69 · ทับข้อตัดสิน 22 ต.ค. 69 ที่ใช้เป้าทั้งเครือแยก)
//   ถึงเป้า = ยอดในช่วง ≥ เป้าตามช่วง (ช่วงเดียวกับการ์ด) · แผงที่มาเป็นหน้าต่างกลางจอ ไม่มีแถวรวม · ไม่มีปุ่มกรองถึงเป้าในแผงแล้ว
import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Percent, Trophy, Eye, X, Coins, Search, Award, ArrowDown, ArrowUp } from "lucide-react";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { ซ่อนคอลัมน์ว่าง } from "@pms/shared/lib/tableFit";
import { สร้างชื่อแสดง } from "@pms/shared/lib/dealerDisplayName";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { ชื่ออัตราปิดการขาย, คำอธิบายอัตราปิดการขาย } from "@pms/shared/lib/winRate";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { useKpiCards } from "@pms/shared/lib/useKpiCards";
import { ค่า, บาทเต็ม } from "@pms/shared/lib/kpiCards";
import { useSales } from "@pms/shared/context/SalesContext";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { fmtISOToThai, type DealerRow } from "@pms/shared/lib/mock";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useAuthReady } from "@pms/shared/lib/useAuthReady";
import { dealers as dealersRepo, metrics } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { ชื่อภาค, ภาคมาตรฐาน, ป้ายทุกภูมิภาค } from "@pms/shared/lib/provinces";
import { รวมผลงาน, type ผลงานดีลเลอร์, type ผลงานรายเดือน } from "@pms/shared/lib/hqPipeline";
import { fmtBaht } from "@pms/shared/lib/format";
import { useLeadSummary } from "@pms/shared/lib/useNetworkData";
import { ชื่อหัวข้อ, คำอธิบายหัวข้อ, คำแนะนำกดแถว, ป้ายระดับ } from "@pms/shared/lib/drillTitles";
import { BoxTitle } from "@pms/shared/components/ui/BoxTitle";
import { useประวัติระดับ } from "@pms/shared/lib/useDrillHistory";
import { แถบระดับ, จัดกลุ่ม, ตารางกลุ่ม, รอข้อมูลรายเดือน, แผงที่มา, กล่องล่าง, ล่าสุดของดีลเลอร์, ยังไม่รู้ผล, ชื่อมิติ, จัดรายเดือน, ตารางรายเดือน, แผงเดือน, type มิติ, type การ์ดที่มา, type แถวเดือน } from "./Drill";
import { useกว้างคอลัมน์ชื่อ } from "@pms/shared/lib/useNameColWidth";

const PRIMARY = "#003366";
const MUTED = "var(--muted-foreground)";
const isoDateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ALL = "ALL";

// ── แท่งแนวนอนคู่ — ใช้ซ้ำใน Section 1 / 2 / 3 (แท่งหลัก + แท่งเทียบ) ──
// เปิดมาโชว์ครบทุกแถวเลย (บอสสั่ง 17 ก.ค. 69) — ให้อ่านคู่กับตารางข้าง ๆ ที่ก็ลิสต์ครบทุกดีลเลอร์เหมือนกัน
// การ์ดไม่ยืดตามจำนวนแถว เพราะความสูงตรึงด้วย .chart-l แล้วให้ .chart-scroll เลื่อนข้างใน
// (กติกาใน globals.css: ข้อมูลล้น = เลื่อนใน .chart-scroll หรือตัด Top N + ปุ่มดูทั้งหมด — ที่นี่ใช้แบบเลื่อน)
// ปุ่มย่อกลับเป็น 5 อันดับแรกยังอยู่ เผื่ออยากดูเฉพาะหัวตาราง
const TOP_N = 5;
type HRow = { key: string; label: string; a: number; b: number; note?: string; onClick?: () => void; /** บรรทัดเล็กใต้ชื่อ (ภูมิภาค) */ sub?: string };
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
                <span style={{ color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }} title={r.label}>
                  {r.label}{r.sub && <span data-row-sub style={{ color: MUTED, fontWeight: 500, fontSize: "0.64rem", marginLeft: 6 }}>{r.sub}</span>}
                </span>
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

type คีย์เรียง = "code" | "name" | "region" | "leads" | "quotes" | "won" | "lost" | "pend" | "rate" | "sales" | "target" | "pct" | "marginPct" | "latest";
// คอลัมน์ตารางผลงาน (FLOW H12 · บอสสั่ง 30 ต.ค. 69 · ปรับ 6 พ.ย. 69): ดีลเลอร์ (ภูมิภาคบรรทัดเล็กใต้ชื่อ · ไม่มีคอลัมน์รหัส) · ลีด · ใบเสนอราคา
//   · ปิดได้ · ปิดไม่ได้ · ยังไม่รู้ผล · อัตราปิด · ยอดขาย · เป้าตามช่วง · % เป้า · ส่วนต่างกำไร · เสนอล่าสุด · ดู — เรียงได้ทุกคอลัมน์ · ข้อความยาวแสดงเต็มเมื่อชี้
//   พอดีจอ 1366/1920 (บอสสั่ง 6 พ.ย. 69): ชื่อยืดเต็มที่เหลือ (ไม่ระบุความกว้าง) · ตัวเลขช่องแน่น (.table-wrap.fit) · ความกว้างคุมที่ colgroup
//   คอลัมน์ที่ทั้งตารางเป็น "—" ซ่อนเอง (ว่างได้: อัตราปิด · เป้า · % เป้า · ส่วนต่างกำไร · เสนอล่าสุด) · ไฟล์ส่งออกยังมีรหัส/ภูมิภาคครบ
const คอลัมน์: { k: คีย์เรียง | "view"; หัว: string; ชี้?: string; num?: boolean; w?: number; ค่า?: (r: ผลงานดีลเลอร์) => unknown }[] = [
  { k: "name", หัว: "ดีลเลอร์" },
  { k: "leads", หัว: "ลีด", ชี้: "ลีดที่เข้ามาในช่วง", num: true },
  { k: "quotes", หัว: "ใบที่ส่ง", ชี้: "ใบที่ส่งลูกค้าแล้ว (ไม่นับร่าง/ถูกแทนที่) ออกในช่วง", num: true },
  { k: "won", หัว: "ปิดได้", ชี้: "ลีดปิดสำเร็จ (เข้ามาในช่วง)", num: true },
  { k: "lost", หัว: "ปิดไม่ได้", ชี้: "ลีดปิดไม่สำเร็จ (เข้ามาในช่วง)", num: true },
  { k: "pend", หัว: "ยังไม่รู้ผล", ชี้: "ลีดที่เข้ามาในช่วงที่ยังไม่ปิด (ลีด − ปิดได้ − ปิดไม่ได้)", num: true },
  { k: "rate", หัว: "อัตราปิด", ชี้: "ปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ) — สูตรกลาง", num: true, ค่า: r => r.rate },
  { k: "sales", หัว: "ยอดขาย", ชี้: "ใบที่ลูกค้าตอบรับในช่วง (ตามวันตอบรับ · ก่อน VAT)", num: true },
  { k: "target", หัว: "เป้าตามช่วง", ชี้: "เป้าทั้งปี × จำนวนวันในช่วง ÷ 365", num: true, ค่า: r => r.target },
  { k: "pct", หัว: "% เป้า", num: true, ค่า: r => r.pct },
  { k: "marginPct", หัว: "ส่วนต่างกำไร", ชี้: "ส่วนบวกของใบที่ทำจากใบ HQ ตอบรับในช่วง · % ของราคาขาย", num: true, ค่า: r => r.marginPct },
  { k: "latest", หัว: "เสนอล่าสุด", ชี้: "วันออกใบเสนอราคาล่าสุดที่ส่งลูกค้าแล้ว", ค่า: r => r.latest },
  { k: "view", หัว: "", w: 40 },
];
// คอลัมน์ชื่อกว้างพอดีชื่อยาวสุดในตาราง ≤ 25% · คอลัมน์ตัวเลขไม่ระบุความกว้าง = เกลี่ยที่เหลือเท่ากัน (บอสสั่ง 6 พ.ย. 69 รอบ 2) · จอแคบกว่าความกว้างขั้นต่ำ = เลื่อนในกรอบ
const กว้างชื่อขั้นต่ำ = 170, กว้างตัวเลขขั้นต่ำ = 64;

export default function SalesAnalyticsPage() {
  const router = useRouter();
  const { timeRange } = useFilters();
  const ready = useAuthReady();
  // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
  const allDealers = useRepoValue<DealerRow[]>(() => dealersRepo.list().then(l => l.filter(ไม่ใช่แถวHQ)), []);
  // ชื่อแสดงของดีลเลอร์ (ตัวกลาง · ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" · บอสสั่ง 6 พ.ย. 69)
  const ชื่อแสดง = useMemo(() => สร้างชื่อแสดง(allDealers), [allDealers]);

  // ── ตัวกรอง (แถวเดียว ค้างใต้แถบบนตอนเลื่อน — ส่วนกลาง .hq-sticky-filter) ──
  const [q, setQ] = useState("");
  const [dealerSel, setDealerSel] = useState(ALL);
  // ?dealer=รหัส (ปุ่ม "ดูผลงาน" จากหน้า/แผงดีลเลอร์ · บอสสั่ง 30 ต.ค. 69) = เลือกดีลเลอร์นั้นไว้ให้ · ตั้งหลังเปิดหน้า แล้วล้างออกจาก URL
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("dealer");
    if (!code) return;
    setDealerSel(code.toUpperCase());
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [regionSel, setRegionSel] = useState(ALL);
  const [provSel, setProvSel] = useState(ALL);
  const [salesSel, setSalesSel] = useState(ALL);
  // ── เจาะลึก (บอสสั่ง 30 ต.ค. 69): แท็บ ดีลเลอร์/ภูมิภาค/จังหวัด/รายเดือน · แผงที่มาของการ์ด ──
  const [มิติเลือก, setมิติ] = useState<มิติ>("dealer");
  const [แผงการ์ด, setแผงการ์ด] = useState<การ์ดที่มา | null>(null);
  const SALES_BANDS = useMemo(() => [
    { v: "lt5", l: "ยอดขายต่ำกว่า ฿5M", hit: (n: number) => n < 5e6 },
    { v: "5to8", l: "ยอดขาย ฿5M – ฿8M", hit: (n: number) => n >= 5e6 && n < 8e6 },
    { v: "gte8", l: "ยอดขาย ฿8M ขึ้นไป", hit: (n: number) => n >= 8e6 },
  ], []);
  const regionOpts = useMemo(() => [...new Set(allDealers.map(d => ภาคมาตรฐาน(d.region)).filter((r): r is NonNullable<typeof r> => !!r))].sort(), [allDealers]);
  const provOpts = useMemo(() => [...new Set(allDealers.map(d => d.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")), [allDealers]);

  // ชุดสาขาจากตัวกรองที่ไม่ขึ้นกับตัวเลข (คำค้น · ดีลเลอร์ · ภาค · จังหวัด) → ส่งให้ฐานคิดผลงาน
  const ชุดฐาน = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ผ่าน = allDealers.filter(d =>
      (dealerSel === ALL || d.code === dealerSel) &&
      (regionSel === ALL || ภาคมาตรฐาน(d.region) === regionSel) &&
      (provSel === ALL || d.province === provSel) &&
      (!s || `${d.code} ${d.name} ${d.province} ${ชื่อภาค(d.region)}`.toLowerCase().includes(s)));
    return ผ่าน.length === allDealers.length ? null : ผ่าน.map(d => d.code);
  }, [allDealers, q, dealerSel, regionSel, provSel]);

  // ── ผลงานรายดีลเลอร์ที่ฐาน (ใบ 0264 · hq_pipeline_dealers) — ชุดเดียวกับการ์ด ──
  const ช่วง = { start: isoDateOf(timeRange.start), end: isoDateOf(timeRange.end) };
  const { salesVersion } = useSales();
  const [แถวฐาน, setแถวฐาน] = useState<ผลงานดีลเลอร์[] | null>(null);
  const ลำดับคำขอ = useRef(0);
  const คีย์ชุด = JSON.stringify(ชุดฐาน);
  useEffect(() => {
    if (!ready) return;
    const ครั้งนี้ = ++ลำดับคำขอ.current;
    metrics.hqPipelineDealers(ช่วง.start, ช่วง.end, คีย์ชุด === "null" ? null : JSON.parse(คีย์ชุด), isoDateOf(APP_NOW))
      .then(r => { if (ครั้งนี้ === ลำดับคำขอ.current) setแถวฐาน(r); })
      .catch(e => { logRepoRead("metrics.hqPipelineDealers", e); if (ครั้งนี้ === ลำดับคำขอ.current) setแถวฐาน([]); });
  }, [ready, ช่วง.start, ช่วง.end, คีย์ชุด, salesVersion]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ตัวกรองที่ขึ้นกับตัวเลข (ช่วงยอดขาย · ถึงเป้า) กรองแถวที่ฐานคืน → ชุดสาขาที่เห็นจริง = ชุดที่ส่งให้การ์ด (ผลรวม = การ์ด ทุกตัวกรอง)
  const แถว = useMemo(() => (แถวฐาน ?? []).filter(r =>
    (salesSel === ALL || (SALES_BANDS.find(b => b.v === salesSel)?.hit(r.sales) ?? true))), [แถวฐาน, salesSel, SALES_BANDS]);
  const กรองตัวเลข = salesSel !== ALL;
  const ชุดการ์ด = useMemo(() => (ชุดฐาน === null && !กรองตัวเลข) ? null : { dealerCodes: แถว.map(r => r.code) }, [ชุดฐาน, กรองตัวเลข, แถว]);
  const การ์ด = useKpiCards("hq.pipeline", { ...ช่วง, dealer: null, today: isoDateOf(APP_NOW), filters: แถวฐาน === null && กรองตัวเลข ? undefined : ชุดการ์ด, รุ่น: salesVersion });
  const ยอดการ์ด = ค่า(การ์ด, "sales.value"), เป้าการ์ด = ค่า(การ์ด, "sales.target");
  const รวม = useMemo(() => รวมผลงาน(แถว), [แถว]);

  // ── เรียงตาราง (กดหัวคอลัมน์) · ค่าเริ่มต้น = ยอดขายมากสุดก่อน ──
  const [เรียง, setเรียง] = useState<{ k: คีย์เรียง; ลง: boolean }>({ k: "sales", ลง: true });
  const ค่าเรียง = (r: ผลงานดีลเลอร์, k: คีย์เรียง): string | number => k === "region" ? ชื่อภาค(r.region) : k === "latest" ? r.latest ?? "" : k === "pend" ? ยังไม่รู้ผล(r) : (r[k] as string | number | null) ?? -Infinity;
  const เรียงแล้ว = useMemo(() => [...แถว].sort((a, b) => {
    const x = ค่าเรียง(a, เรียง.k), y = ค่าเรียง(b, เรียง.k);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "th");
    return (เรียง.ลง ? -c : c) || a.code.localeCompare(b.code);
  }), [แถว, เรียง]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [หน้า, setหน้า] = useState(0);
  useEffect(() => { setหน้า(0); }, [q, dealerSel, regionSel, provSel, salesSel, เรียง, ช่วง.start, ช่วง.end]);   // eslint-disable-line react-hooks/exhaustive-deps
  const หน้าจริง = Math.min(หน้า, pageCountOf(เรียงแล้ว.length) - 1);
  const ในหน้า = pageSlice(เรียงแล้ว, หน้าจริง);
  // คอลัมน์ที่ทั้งตารางเป็น "—" ซ่อนเอง (บอสสั่ง 6 พ.ย. 69) — ดูทุกแถวหลังตัวกรอง (ไม่ใช่แค่หน้าที่เห็น) · ยังไม่มีแถว = แสดงครบ
  const คอลัมน์แสดง = useMemo(() => ซ่อนคอลัมน์ว่าง(คอลัมน์, เรียงแล้ว, (c, r) => c.ค่า ? c.ค่า(r) : 1), [เรียงแล้ว]);
  // เจาะภาค/จังหวัดอยู่ = ทุกแถวภาคเดียวกับระดับ (ตารางกรองตามระดับแล้ว) → ซ่อนบรรทัดภูมิภาค (กติกาเดียวกับ ซ่อนตามระดับ · drillColumns)
  const ซ่อนภาค = regionSel !== ALL || provSel !== ALL || dealerSel !== ALL;
  const ชื่อคอล = useกว้างคอลัมน์ชื่อ(เรียงแล้ว.map(r => ชื่อแสดง(r.code, r.name) + (r.status === "inactive" ? " (ปิดใช้งาน)" : "")), { ขั้นต่ำ: 120 }, ซ่อนภาค ? [] : เรียงแล้ว.map(r => ชื่อภาค(r.region)));
  const แสดงคอล = useMemo(() => Object.fromEntries(คอลัมน์แสดง.map(c => [c.k, true])) as Partial<Record<คีย์เรียง | "view", boolean>>, [คอลัมน์แสดง]);

  // กราฟ: ยอดขาย เทียบ เป้าตามช่วง รายดีลเลอร์ (ลำดับเดียวกับตาราง · แบ่งหน้า 7 แถว)
  const แท่ง: HRow[] = useMemo(() => เรียงแล้ว.map(r => ({
    key: r.code, label: ชื่อแสดง(r.code, r.name), sub: ซ่อนภาค ? undefined : ชื่อภาค(r.region), a: r.sales, b: r.target ?? 0,
    note: r.pct == null ? "ยังไม่ตั้งเป้า" : `${r.pct}% ของเป้า`, onClick: () => { setDealerSel(r.code); window.scrollTo({ top: 0, behavior: "smooth" }); },   // กดแท่ง = เจาะดูดีลเลอร์
  })), [เรียงแล้ว, ชื่อแสดง]);
  const ขนาดกราฟ = 7;
  const [หน้ากราฟ, setหน้ากราฟ] = useState(0);
  useEffect(() => { setหน้ากราฟ(0); }, [แท่ง.length]);
  const หน้ากราฟจริง = Math.min(หน้ากราฟ, pageCountOf(แท่ง.length, ขนาดกราฟ) - 1);

  // ระดับที่ดูอยู่ (แถบระดับ): เลือกดีลเลอร์ = ระดับดีลเลอร์ (ตาราง/กราฟเป็นรายเดือน = รอข้อมูล)
  const ดีลเลอร์ที่ดู = dealerSel !== ALL ? dealerSel : null;
  const แท็บ: มิติ[] = ดีลเลอร์ที่ดู ? ["dealer", "month"] : (["dealer", "region", "prov", "month"] as มิติ[]).filter(m => !(m === "region" && (regionSel !== ALL || provSel !== ALL)) && !(m === "prov" && provSel !== ALL));
  const มิติจริง: มิติ = แท็บ.includes(มิติเลือก) ? มิติเลือก : แท็บ[0];
  const กลุ่ม = useMemo(() => (มิติจริง === "region" || มิติจริง === "prov") ? จัดกลุ่ม(แถว, มิติจริง) : [], [แถว, มิติจริง]);
  const เจาะ = (key: string) => {
    if (มิติจริง === "region") { setRegionSel(key); setProvSel(ALL); setDealerSel(ALL); setมิติ("prov"); }
    else if (มิติจริง === "prov") { setProvSel(key); setDealerSel(ALL); setมิติ("dealer"); }
    else setDealerSel(key);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const ภาคที่ดู = regionSel !== ALL ? regionSel : provSel !== ALL ? (ภาคมาตรฐาน(allDealers.find(d => d.province === provSel)?.region) ?? null) : ดีลเลอร์ที่ดู ? (ภาคมาตรฐาน(allDealers.find(d => d.code === ดีลเลอร์ที่ดู)?.region) ?? null) : null;
  const จังหวัดที่ดู = provSel !== ALL ? provSel : ดีลเลอร์ที่ดู ? (allDealers.find(d => d.code === ดีลเลอร์ที่ดู)?.province || null) : null;
  // กดชิประดับ = กลับไประดับนั้น ตัวกรองของระดับก่อนหน้ายังอยู่ (บอสสั่ง 5 พ.ย. 69)
  //   เดิม: เลือกดีลเลอร์ตรง (ตัวกรอง/กดแท่ง) ภาค/จังหวัดมาจากดีลเลอร์ ไม่ได้อยู่ในตัวกรอง → กดชิปจังหวัด/ภาค ล้างดีลเลอร์แล้วเหลือทั้งเครือ
  //   ตอนนี้: ตั้งตัวกรองภาค/จังหวัดตามที่แถบแสดงอยู่ก่อนถอย
  const ไปที่ระดับ = (r: { ภาค: string | null; จังหวัด: string | null; ดีลเลอร์: string | null }) => {
    setRegionSel(r.ภาค ?? ALL); setProvSel(r.จังหวัด ?? ALL); setDealerSel(r.ดีลเลอร์ ?? ALL);
    setมิติ(r.ภาค && !r.จังหวัด && !r.ดีลเลอร์ ? "prov" : "dealer");
  };
  const ไประดับ = (ระดับ: "all" | "region" | "prov") => {
    if (ระดับ === "all") ไปที่ระดับ({ ภาค: null, จังหวัด: null, ดีลเลอร์: null });
    if (ระดับ === "region") ไปที่ระดับ({ ภาค: ภาคที่ดู, จังหวัด: null, ดีลเลอร์: null });
    if (ระดับ === "prov") ไปที่ระดับ({ ภาค: ภาคที่ดู, จังหวัด: จังหวัดที่ดู, ดีลเลอร์: null });
  };
  // ปุ่มย้อนกลับของเบราว์เซอร์ = ถอยทีละ 1 ระดับ (ตัวกลาง useประวัติระดับ · ตัวเดียวกับหัวเจาะลึก 3 หน้า)
  useประวัติระดับ({ ภาค: ภาคที่ดู, จังหวัด: จังหวัดที่ดู, ดีลเลอร์: ดีลเลอร์ที่ดู }, ไปที่ระดับ);
  const แท่งกลุ่ม: HRow[] = useMemo(() => กลุ่ม.map(g => ({ key: g.key, label: g.label, a: g.รวม.sales, b: g.รวม.target ?? 0,
    note: g.รวม.pct == null ? "ยังไม่ตั้งเป้า" : `${g.รวม.pct}% ของเป้า`, onClick: () => เจาะ(g.key) })), [กลุ่ม]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ── รายเดือน (ใบ 0268 · hq_pipeline_months): ดึงเฉพาะตอนเปิดแท็บรายเดือน หรือแผงที่มาตอนอยู่ระดับดีลเลอร์ ──
  //   null = ยังไม่ดึง/ฐานยังไม่ถึงใบนั้น (เรียกแล้วพัง) → "รอข้อมูล"
  const ต้องรายเดือน = มิติจริง === "month" || (แผงการ์ด != null && ดีลเลอร์ที่ดู != null);
  const [รายเดือนฐาน, setรายเดือนฐาน] = useState<ผลงานรายเดือน[] | null>(null);
  const ชุดรายเดือน = ชุดการ์ด ? JSON.stringify(ชุดการ์ด.dealerCodes) : "null";
  useEffect(() => {
    if (!ready || !ต้องรายเดือน) return;
    let ยังอยู่ = true;
    metrics.hqPipelineMonths(ช่วง.start, ช่วง.end, JSON.parse(ชุดรายเดือน))
      .then(r => { if (ยังอยู่) setรายเดือนฐาน(r); })
      .catch(e => { logRepoRead("metrics.hqPipelineMonths", e); if (ยังอยู่) setรายเดือนฐาน(null); });
    return () => { ยังอยู่ = false; };
  }, [ready, ต้องรายเดือน, ช่วง.start, ช่วง.end, ชุดรายเดือน, salesVersion]);   // eslint-disable-line react-hooks/exhaustive-deps
  const รหัสในตาราง = useMemo(() => new Set(แถว.map(r => r.code)), [แถว]);
  const เป้าทั้งปี = useMemo(() => new Map(แถว.map(r => [r.code, r.annualTarget] as const)), [แถว]);
  const เดือน = useMemo(() => รายเดือนฐาน ? จัดรายเดือน(รายเดือนฐาน, ดีลเลอร์ที่ดู ? new Set([ดีลเลอร์ที่ดู]) : รหัสในตาราง, ช่วง.start, ช่วง.end, เป้าทั้งปี) : null,
    [รายเดือนฐาน, รหัสในตาราง, ดีลเลอร์ที่ดู, ช่วง.start, ช่วง.end, เป้าทั้งปี]);
  const [เดือนที่เปิด, setเดือนที่เปิด] = useState<แถวเดือน | null>(null);
  const ชื่อดีลเลอร์ = useMemo(() => new Map(allDealers.map(d => [d.code, ชื่อแสดง(d.code, d.name)] as const)), [allDealers, ชื่อแสดง]);
  // ระดับที่เลือกสำหรับหัวข้อกราฟ/ตาราง (บอสสั่ง 3 พ.ย. 69)
  const ระดับหัวข้อ = { ภาค: regionSel !== ALL ? regionSel : null, จังหวัด: provSel !== ALL ? provSel : null,
    ดีลเลอร์: ดีลเลอร์ที่ดู, ชื่อดีลเลอร์: ดีลเลอร์ที่ดู ? ชื่อดีลเลอร์.get(ดีลเลอร์ที่ดู) : undefined };
  const แท่งเดือน: HRow[] = useMemo(() => (เดือน ?? []).map(g => ({ key: g.key, label: g.label, a: g.รวม.sales, b: g.รวม.target ?? 0,
    note: g.รวม.pct == null ? "ยังไม่ตั้งเป้า" : `${g.รวม.pct}% ของเป้า`, onClick: ดีลเลอร์ที่ดู ? undefined : () => setเดือนที่เปิด(g) })), [เดือน, ดีลเลอร์ที่ดู]);
  // กล่องล่าง: ลีดของชุดสาขาเดียวกับตาราง (งานค้าง = ตอนนี้ · เหตุผล/แหล่งที่มา = ลีดที่เข้ามาในช่วง)
  const ชุดลีด = ชุดการ์ด?.dealerCodes;
  const ขั้นตอนนี้ = useLeadSummary({ dealerCodes: ชุดลีด });
  const ลีดในช่วง = useLeadSummary({ dealerCodes: ชุดลีด, dateStart: ช่วง.start, dateEnd: ช่วง.end });

  const anyFilter = q.trim() !== "" || [dealerSel, regionSel, provSel, salesSel].some(v => v !== ALL);
  const ล้าง = () => { setQ(""); setDealerSel(ALL); setRegionSel(ALL); setProvSel(ALL); setSalesSel(ALL); };
  const sel = (v: string, on: (x: string) => void, caption: string, opts: { v: string; l: string }[]) => (
    <select aria-label={caption} title={caption} value={v} onChange={e => on(e.target.value)} className="form-select"
      style={{ flex: "1 1 0", minWidth: 120, maxWidth: 210, fontSize: "0.82rem" }}>
      <option value={ALL}>{caption}</option>
      {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  );
  const เงิน = (v: number | null) => (v == null ? "—" : fmtBaht(v));
  const โหลด = แถวฐาน === null;

  return (
    <div className="erp">
      <TopbarActions>
          <FilterBar dims={[]} />
          {/* ส่งออก = ตารางผลงานที่เห็นบนจอ (ผ่านตัวกรองทุกตัวแล้ว · เรียงตามตาราง) */}
          <ExportMenu filename="hq-sales-analytics" title="ภาพรวมยอดขายทั้งเครือ"
            headers={["รหัสดีลเลอร์", "ดีลเลอร์", "ภูมิภาค", "ลีด", "ใบที่ส่ง", "ปิดได้", "ปิดไม่ได้", "ยังไม่รู้ผล", "อัตราปิด", "ยอดขาย", "เป้าตามช่วง", "% เป้า", "ส่วนต่างกำไร", "เสนอล่าสุด"]}
            rows={เรียงแล้ว.map(r => [r.code, r.name, ชื่อภาค(r.region), r.leads, r.quotes, r.won, r.lost, ยังไม่รู้ผล(r), r.rate == null ? "—" : `${r.rate}%`,
              r.sales, r.target ?? "—", r.pct == null ? "—" : `${r.pct}%`, r.marginPct == null ? "—" : `${r.marginPct}%`, r.latest ? fmtISOToThai(r.latest) : "—"])} />
      </TopbarActions>

      <แถบระดับ ภาค={ภาคที่ดู} จังหวัด={จังหวัดที่ดู} ดีลเลอร์={ดีลเลอร์ที่ดู} ชื่อดีลเลอร์={allDealers.find(d => d.code === ดีลเลอร์ที่ดู)?.name} ไป={ไประดับ} />

      {/* ── 1 · การ์ด KPI 4 ใบ (ใบ 0246) — ชุดสาขาเดียวกับตาราง: ผลรวมแถวท้ายตาราง = การ์ด ── */}
      <KpiRow label="สรุปภาพรวมยอดขาย" range={ช่วง}>
        <KpiCard kpi="sales" label="ยอดขาย (เทียบเป้า)" value={บาทเต็ม(ยอดการ์ด)} rawValue={ยอดการ์ด} empty="กำลังโหลด…"
          unit={เป้าการ์ด == null ? "ยังไม่ได้ตั้งเป้า" : `เป้าในช่วง ${บาทเต็ม(เป้าการ์ด)} · ตามวันลูกค้าตอบรับ`}
          ring={ยอดการ์ด != null && เป้าการ์ด ? Math.round(ยอดการ์ด / เป้าการ์ด * 100) : null} icon={Trophy}
          actionLabel="เจาะดูที่มา" onClick={() => setแผงการ์ด("sales")} />
        <KpiCard kpi="winRate" label={ชื่ออัตราปิดการขาย} value={ค่า(การ์ด, "winRate.rate") == null ? null : `${ค่า(การ์ด, "winRate.rate")}%`} rawValue={ค่า(การ์ด, "winRate.rate")}
          unit={คำอธิบายอัตราปิดการขาย} empty={การ์ด ? "ยังไม่มีลีดที่ปิดในช่วงนี้" : "กำลังโหลด…"} icon={Percent}
          sub={การ์ด ? `ปิดสำเร็จ ${ค่า(การ์ด, "winRate.won") ?? 0} · ไม่สำเร็จ ${ค่า(การ์ด, "winRate.lost") ?? 0}` : undefined} actionLabel="เจาะดูที่มา" onClick={() => setแผงการ์ด("winRate")} />
        <KpiCard kpi="margin" label="ส่วนต่างกำไรเฉลี่ย" value={ค่า(การ์ด, "margin.pct") == null ? null : `${Number(ค่า(การ์ด, "margin.pct")).toFixed(1)}%`} rawValue={ค่า(การ์ด, "margin.pct")}
          unit={`ส่วนต่างกำไร % ของราคาขาย · จาก ${ค่า(การ์ด, "margin.quotes") ?? 0} ใบที่ผูกใบ HQ`} empty={การ์ด ? "ยังไม่มีใบที่ตอบรับจากใบ HQ ในช่วงนี้" : "กำลังโหลด…"}
          icon={Coins} color="#059669" bg="#E6F6EF" actionLabel="เจาะดูที่มา" onClick={() => setแผงการ์ด("margin")} />
        <KpiCard kpi="onTarget" label="ดีลเลอร์ที่ถึงเป้า" value={ค่า(การ์ด, "onTarget.reached") == null ? null : `${ค่า(การ์ด, "onTarget.reached")} จาก ${ค่า(การ์ด, "onTarget.of") ?? 0}`}
          rawValue={ค่า(การ์ด, "onTarget.reached")} unit="ราย · ยอดในช่วงถึงเป้าตามช่วง" empty="กำลังโหลด…" icon={Award} color="#d97706" bg="#FEF3C7"
          actionLabel="เจาะดูที่มา" onClick={() => setแผงการ์ด("onTarget")} />
      </KpiRow>

      {/* ── ตัวกรองแถวเดียว — ค้างใต้แถบบนตอนเลื่อน (พื้นทึบ ไม่ทับเนื้อหา · ส่วนกลาง .hq-sticky-filter) ── */}
      <div className="card hq-sticky-filter" data-filter-row>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "nowrap", alignItems: "center", paddingTop: 12, paddingBottom: 12, overflowX: "auto" }}>
          <div className="search-bar" style={{ flex: "1.4 1 0", minWidth: 180, maxWidth: 300 }}>
            <Search size={14} color="#9ca3af" />
            <input aria-label="ค้นหาดีลเลอร์" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหารหัส ชื่อดีลเลอร์ จังหวัด…" />
            {q && <button aria-label="ล้างคำค้น" onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
          </div>
          {sel(dealerSel, setDealerSel, "ทุกดีลเลอร์", allDealers.map(d => ({ v: d.code, l: ชื่อแสดง(d.code, d.name) })))}
          {sel(regionSel, setRegionSel, ป้ายทุกภูมิภาค, regionOpts.map(r => ({ v: r, l: ชื่อภาค(r) })))}
          {sel(provSel, setProvSel, "ทุกจังหวัด", provOpts.map(p => ({ v: p, l: p })))}
          {sel(salesSel, setSalesSel, "ทุกช่วงยอดขาย", SALES_BANDS.map(b => ({ v: b.v, l: b.l })))}
          {anyFilter && <button onClick={ล้าง} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>ล้างตัวกรอง</button>}
        </div>
      </div>

      {/* หัวข้อกราฟ/ตาราง (บอสสั่ง 3 พ.ย. 69) — เปลี่ยนตามแท็บมิติและระดับที่เลือก (ตัวกลาง lib/drillTitles.ts) */}
      {/* ── 2 · กราฟ: ยอดขาย เทียบ เป้าตามช่วง ตามแท็บ (ดีลเลอร์/ภูมิภาค/จังหวัด · รายเดือน = รอข้อมูล) · กดแท่ง = เจาะลง ── */}
      <div className="card" data-testid="pipeline-chart" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
        <BoxTitle ชื่อ={`กราฟ${ชื่อหัวข้อ("ยอดขาย เทียบ เป้าตามช่วง ", มิติจริง, ระดับหัวข้อ)}`}
          คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, มิติจริง === "month" ? "แท่งเข้ม = ยอดขายในเดือน · แท่งอ่อน = เป้ารายเดือน" : "แท่งเข้ม = ยอดขายในช่วง · แท่งอ่อน = เป้าตามช่วง", คำแนะนำกดแถว(มิติจริง, ระดับหัวข้อ))}>
          {แท็บ.length > 1 && (
            <div role="tablist" aria-label="ดูผลงานแยกตาม" style={{ display: "inline-flex", border: "1px solid #dbe3ec", borderRadius: 10, overflow: "hidden" }}>
              {แท็บ.map(m => (
                <button key={m} type="button" role="tab" aria-selected={มิติจริง === m} data-dim={m} onClick={() => setมิติ(m)}
                  style={{ border: "none", padding: "5px 12px", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer",
                    background: มิติจริง === m ? PRIMARY : "#fff", color: มิติจริง === m ? "#fff" : MUTED }}>{ชื่อมิติ[m]}</button>
              ))}
            </div>
          )}
        </BoxTitle>
        <div style={{ flex: 1 }}>
          {มิติจริง === "month" ? (เดือน ? <HBars rows={แท่งเดือน} aLabel="ยอดขายในเดือน" bLabel="เป้ารายเดือน" fmt={fmtBaht} /> : <รอข้อมูลรายเดือน ข้อความ="ฐานข้อมูลยังไม่มีผลงานรายเดือน (รอบรวมงานฐาน)" />)
            : โหลด ? <div className="card-body" style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>
            : มิติจริง === "dealer" ? <HBars rows={pageSlice(แท่ง, หน้ากราฟจริง, ขนาดกราฟ)} aLabel="ยอดขายในช่วง" bLabel="เป้าตามช่วง" fmt={fmtBaht} paged />
            : <HBars rows={แท่งกลุ่ม} aLabel="ยอดขายในช่วง" bLabel="เป้าตามช่วง" fmt={fmtBaht} />}
        </div>
        {มิติจริง === "dealer" && <TablePagination page={หน้ากราฟจริง} total={แท่ง.length} onPage={setหน้ากราฟ} size={ขนาดกราฟ} unit="ดีลเลอร์" />}
      </div>

      {/* ── 3 · ตารางผลงานดีลเลอร์ตารางเดียว — เรียงได้ทุกคอลัมน์ · ไม่มีแถวรวม (ตัวเลขรวมดูที่การ์ด · บอสสั่ง 6 พ.ย. 69) ── */}
      <div className="card" data-testid="pipeline-table" style={{ marginBottom: 0 }}>
        <BoxTitle ชื่อ={`ตาราง${ชื่อหัวข้อ("ผลงาน", มิติจริง, ระดับหัวข้อ)}`}
          คำอธิบาย={คำอธิบายหัวข้อ(ช่วง, คำแนะนำกดแถว(มิติจริง, ระดับหัวข้อ), มิติจริง === "dealer" ? "กดหัวคอลัมน์เพื่อเรียง" : null)} />
        {มิติจริง === "month" && (เดือน ? <ตารางรายเดือน แถว={เดือน} รวมทั้งหมด={รวม} เลือกเดือน={ดีลเลอร์ที่ดู ? undefined : setเดือนที่เปิด} /> : <รอข้อมูลรายเดือน ข้อความ="ฐานข้อมูลยังไม่มีผลงานรายเดือน (รอบรวมงานฐาน)" />)}
        {(มิติจริง === "region" || มิติจริง === "prov") && (โหลด ? <div className="card-body" style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>
          : <ตารางกลุ่ม มิติ={มิติจริง} แถว={กลุ่ม} รวมทั้งหมด={รวม} เจาะ={เจาะ} />)}
        {มิติจริง === "dealer" && <>
        <div className="table-wrap dense fit">
          {/* ไม่มีแถวรวมบนจอ (บอสสั่ง 6 พ.ย. 69) — ผลรวมชุดเดียวกับแถวในตาราง (หลังทุกตัวกรอง) อยู่ใน data-total ให้ข้อทดสอบเทียบกับการ์ด (การ์ดนับชุดเดียวกับตาราง) */}
          <table ref={ชื่อคอล.ref} aria-label="ตารางผลงานดีลเลอร์" data-total={โหลด ? undefined : JSON.stringify({ sales: รวม.sales, rate: รวม.rate ?? "", margin: รวม.marginPct ?? "", onTarget: รวม.onTarget, won: รวม.won, lost: รวม.lost, leads: รวม.leads, quotes: รวม.quotes, n: เรียงแล้ว.length })} style={{ minWidth: คอลัมน์แสดง.reduce((s, c) => s + (c.w ?? (c.k === "name" ? กว้างชื่อขั้นต่ำ : กว้างตัวเลขขั้นต่ำ)), 0) }}>
            <colgroup>{คอลัมน์แสดง.map(c => <col key={c.k} data-col-key={c.k} style={c.k === "name" ? { width: ชื่อคอล.กว้าง } : c.w ? { width: c.w } : undefined} />)}</colgroup>
            <thead>
              <tr>
                {คอลัมน์แสดง.map(c => c.k === "view" ? <th key={c.k} aria-label="ดู" /> : c.k === "name" && ดีลเลอร์ที่ดู ? <th key={c.k} data-col-head="period">ผลงานในช่วง</th> : (
                  <th key={c.k} className={c.num ? "num" : undefined} title={c.ชี้ ?? c.หัว}
                    aria-sort={เรียง.k === c.k ? (เรียง.ลง ? "descending" : "ascending") : "none"}>
                    <button type="button" data-sort={c.k} onClick={() => setเรียง(s => ({ k: c.k as คีย์เรียง, ลง: s.k === c.k ? !s.ลง : c.num ?? false }))}
                      style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}>
                      {c.หัว}{เรียง.k === c.k ? (เรียง.ลง ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : null}
                    </button>
                  </th>))}
              </tr>
            </thead>
            <tbody>
              {โหลด && <tr><td colSpan={คอลัมน์แสดง.length} className="empty-row">กำลังโหลด…</td></tr>}
              {!โหลด && !เรียงแล้ว.length && <tr><td colSpan={คอลัมน์แสดง.length} className="empty-row">ไม่พบดีลเลอร์ที่ตรงกับตัวกรอง</td></tr>}
              {ในหน้า.map(r => (
                <ClickableRow key={r.code} className="clickable" onActivate={() => เจาะ(r.code)} label={`เปิดผลงานของ ${r.name} (เจาะลงระดับดีลเลอร์)`}>
                  <td data-perf-row={r.code} style={{ fontWeight: 600, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis" }} title={ชื่อแสดง(r.code, r.name)}>
                    {/* ระดับดีลเลอร์: หัวตาราง/แถบระดับบอกชื่อแล้ว → ไม่มีคอลัมน์ดีลเลอร์ แถวนี้ = ผลงานของดีลเลอร์ในช่วงที่เลือก (บอสสั่ง 9 พ.ย. 69) */}
                    {ดีลเลอร์ที่ดู ? "ทั้งช่วงที่เลือก" : <>{ชื่อแสดง(r.code, r.name)}{r.status === "inactive" && <span style={{ marginLeft: 6, fontSize: "0.62rem", fontWeight: 700, color: MUTED }}>(ปิดใช้งาน)</span>}</>}
                    {/* บรรทัดภูมิภาคใต้ชื่อ: เจาะภาค/จังหวัดอยู่ = ทุกแถวภาคเดียวกัน → ซ่อน (บอสสั่ง 9 พ.ย. 69 · ตัวกลาง drillColumns) */}
                    {!ซ่อนภาค && <div data-row-sub style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ชื่อภาค(r.region)}</div>}
                  </td>
                  <td className="num" data-cell="leads">{r.leads.toLocaleString()}</td>
                  <td className="num" data-cell="quotes">{r.quotes.toLocaleString()}</td>
                  <td className="num" data-cell="won">{r.won.toLocaleString()}</td>
                  <td className="num" data-cell="lost">{r.lost.toLocaleString()}</td>
                  <td className="num" data-cell="pend">{ยังไม่รู้ผล(r).toLocaleString()}</td>
                  {แสดงคอล.rate && <td className="num" data-cell="rate" style={{ fontWeight: 700 }}>{r.rate == null ? "—" : `${r.rate}%`}</td>}
                  <td className="num" data-cell="sales" data-value={r.sales} style={{ fontWeight: 800, color: "#1F2937" }} title={fmtBaht(r.sales)}>{fmtBaht(r.sales)}</td>
                  {แสดงคอล.target && <td className="num" data-cell="target" data-value={r.target ?? ""} title={เงิน(r.target)}>{เงิน(r.target)}</td>}
                  {แสดงคอล.pct && <td className="num" data-cell="pct" style={{ fontWeight: 700, color: r.pct == null ? "#94a3b8" : r.pct >= 100 ? "#059669" : PRIMARY }}>{r.pct == null ? "—" : `${r.pct}%`}</td>}
                  {แสดงคอล.marginPct && <td className="num" data-cell="margin">{r.marginPct == null ? "—" : `${r.marginPct.toFixed(1)}%`}</td>}
                  {แสดงคอล.latest && <td style={{ color: MUTED, whiteSpace: "normal" }} title={r.latest ? fmtISOToThai(r.latest) : "ยังไม่มีใบที่ส่งลูกค้า"}>{r.latest ? fmtISOToThai(r.latest) : "—"}</td>}
                  <td onClick={e => e.stopPropagation()}>
                    <button title="เปิดหน้าดีลเลอร์" aria-label={`เปิดหน้าดีลเลอร์ ${r.name}`} onClick={() => router.push(`/hq/dealers/${r.code}`)}
                      style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #dbe3ec", background: "#fff", color: PRIMARY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Eye size={13} />
                    </button>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination page={หน้าจริง} total={เรียงแล้ว.length} onPage={setหน้า} unit="ดีลเลอร์" />
        </>}
      </div>

      {/* ── 4 · ระดับดีลเลอร์: ใบ/ลีดล่าสุด + ปุ่มเปิดแผงดีลเลอร์ ── */}
      {ดีลเลอร์ที่ดู && <div style={{ marginTop: 24 }}><ล่าสุดของดีลเลอร์ code={ดีลเลอร์ที่ดู} /></div>}

      {/* ── 5 · เส้นทางการขาย · งานค้างตามขั้นตอน (ตอนนี้) · เหตุผลปิดไม่สำเร็จ · ลีดตามแหล่งที่มา (ชุดสาขาเดียวกับตาราง) ── */}
      <div style={{ marginTop: 24 }}>
        <กล่องล่าง รวมทั้งหมด={รวม} ขั้นตอนนี้={ขั้นตอนนี้} ในช่วง={ลีดในช่วง} ระดับ={ป้ายระดับ(ระดับหัวข้อ)} ช่วง={ช่วง} />
      </div>

      {แผงการ์ด && <แผงที่มา การ์ด={แผงการ์ด} แถว={แถว} ดีลเลอร์={ดีลเลอร์ที่ดู} ปิด={() => setแผงการ์ด(null)} เดือน={ดีลเลอร์ที่ดู ? เดือน : null} ช่วง={ช่วง}
        เจาะ={code => { setDealerSel(code); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
      {เดือนที่เปิด && รายเดือนฐาน && <แผงเดือน เดือน={เดือนที่เปิด} rows={รายเดือนฐาน} codes={รหัสในตาราง} ชื่อ={ชื่อดีลเลอร์} ปิด={() => setเดือนที่เปิด(null)}
        เจาะ={code => { setDealerSel(code); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </div>
  );
}
