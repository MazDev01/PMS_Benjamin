"use client";
// ─── HQ · ภาพรวมยอดขายทั้งเครือ (/hq/pipeline · FLOW H12) ──────────────────────────────────────────────────────────
// อ่านอย่างเดียว ไม่มีสร้าง/แก้/ลบ · บอสสั่ง 30 ต.ค. 69: เหลือ 3 ส่วน — การ์ด 4 ใบ · กราฟยอดขายเทียบเป้าตามช่วง · ตารางผลงานดีลเลอร์ตารางเดียว
//   ตัวเลขทุกตัวในหน้า = ฟังก์ชันกลางชุดเดียวกับการ์ด: ตาราง/กราฟมาจาก hq_pipeline_dealers (ใบ 0264) · การ์ดจาก kpi_cards('hq.pipeline')
//   ชุดสาขาที่เห็นในตาราง (หลังทุกตัวกรอง) = ชุดที่ส่งให้การ์ด → แถวรวมท้ายตาราง = การ์ด ทุกตัว ทุกตัวกรอง
//   (ข้อทดสอบ supabase/tests/hq_pipeline_dealers.sql · tests/scenario/hq-pipeline-h12.spec.ts)
//   เอาออก (ข้อมูลซ้ำ · รวมเข้าตารางแล้ว): ใบที่ออก vs ปิดได้ · ลีดเทียบออกใบ · มูลค่าใบเทียบยอดขาย · ตัวเลขการปิดการขายรายดีลเลอร์
//     · เป้าทั้งปีเทียบยอด (เคยขึ้น ฿0 ทุกสาขา — ยอดมาจากตัวรวมฝั่งหน้าเว็บอีกตัว) · ส่วนบวกรายดีลเลอร์ (ไม่ขึ้นกับตัวกรอง)
//   เป้าบนการ์ดตอนไม่กรอง = เป้าทั้งเครือที่ HQ ตั้ง (บอสตัดสิน 22 ต.ค. 69) · แถวรวมท้ายตาราง = ผลรวมเป้าสาขา (คนละตัว ตั้งใจ)
import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Percent, Trophy, Eye, X, Coins, Search, Award, ArrowDown, ArrowUp } from "lucide-react";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
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
import { รวมผลงาน, type ผลงานดีลเลอร์ } from "@pms/shared/lib/hqPipeline";
import { fmtBaht } from "@pms/shared/lib/format";

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

type คีย์เรียง = "code" | "name" | "region" | "leads" | "quotes" | "won" | "lost" | "rate" | "sales" | "target" | "pct" | "marginPct" | "latest";
// คอลัมน์ตารางผลงาน (FLOW H12 · บอสสั่ง 30 ต.ค. 69): รหัส · ดีลเลอร์ · ภูมิภาค · ลีด · ใบเสนอราคา · ปิดได้ · ปิดไม่ได้ · อัตราปิด
//   · ยอดขาย · เป้าตามช่วง · % เป้า · ส่วนต่างกำไร · เสนอล่าสุด · ดู — เรียงได้ทุกคอลัมน์ · ข้อความยาวแสดงเต็มเมื่อชี้
//   ความกว้างคุมที่ colgroup (ตารางแบบตายตัว) · รวม ~1,180px = พอดีพื้นที่จริงที่จอ 1440 (ช่องแน่น)
const คอลัมน์: { k: คีย์เรียง | "view"; หัว: string; ชี้?: string; num?: boolean; w: number }[] = [
  { k: "code", หัว: "รหัส", w: 74 },
  { k: "name", หัว: "ดีลเลอร์", w: 150 },
  { k: "region", หัว: "ภูมิภาค", w: 150 },
  { k: "leads", หัว: "ลีด", ชี้: "ลีดที่เข้ามาในช่วง", num: true, w: 56 },
  { k: "quotes", หัว: "ใบเสนอราคา", ชี้: "ใบที่ส่งลูกค้าแล้ว (ไม่นับร่าง/ถูกแทนที่) ออกในช่วง", num: true, w: 92 },
  { k: "won", หัว: "ปิดได้", ชี้: "ลีดปิดสำเร็จ (เข้ามาในช่วง)", num: true, w: 64 },
  { k: "lost", หัว: "ปิดไม่ได้", ชี้: "ลีดปิดไม่สำเร็จ (เข้ามาในช่วง)", num: true, w: 76 },
  { k: "rate", หัว: "อัตราปิด", ชี้: "ปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ) — สูตรกลาง", num: true, w: 76 },
  { k: "sales", หัว: "ยอดขาย", ชี้: "ใบที่ลูกค้าตอบรับในช่วง (ตามวันตอบรับ · ก่อน VAT)", num: true, w: 110 },
  { k: "target", หัว: "เป้าตามช่วง", ชี้: "เป้าทั้งปี × จำนวนวันในช่วง ÷ 365", num: true, w: 110 },
  { k: "pct", หัว: "% เป้า", num: true, w: 68 },
  { k: "marginPct", หัว: "ส่วนต่างกำไร", ชี้: "ส่วนบวกของใบที่ทำจากใบ HQ ตอบรับในช่วง · % ของราคาขาย", num: true, w: 96 },
  { k: "latest", หัว: "เสนอล่าสุด", ชี้: "วันออกใบเสนอราคาล่าสุดที่ส่งลูกค้าแล้ว", w: 96 },
  { k: "view", หัว: "", w: 44 },
];

export default function SalesAnalyticsPage() {
  const router = useRouter();
  const { timeRange } = useFilters();
  const ready = useAuthReady();
  // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ/ไม่แสดง (บอสตัดสิน 19 ต.ค. 69 · lib/hqDealerRow.ts)
  const allDealers = useRepoValue<DealerRow[]>(() => dealersRepo.list().then(l => l.filter(ไม่ใช่แถวHQ)), []);

  // ── ตัวกรอง (แถวเดียว ค้างใต้แถบบนตอนเลื่อน — ส่วนกลาง .hq-sticky-filter) ──
  const [q, setQ] = useState("");
  const [dealerSel, setDealerSel] = useState(ALL);
  const [regionSel, setRegionSel] = useState(ALL);
  const [provSel, setProvSel] = useState(ALL);
  const [salesSel, setSalesSel] = useState(ALL);
  const [ถึงเป้าเท่านั้น, setถึงเป้าเท่านั้น] = useState(false);
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
    (salesSel === ALL || (SALES_BANDS.find(b => b.v === salesSel)?.hit(r.sales) ?? true)) && (!ถึงเป้าเท่านั้น || r.onTarget)), [แถวฐาน, salesSel, SALES_BANDS, ถึงเป้าเท่านั้น]);
  const กรองตัวเลข = salesSel !== ALL || ถึงเป้าเท่านั้น;
  const ชุดการ์ด = useMemo(() => (ชุดฐาน === null && !กรองตัวเลข) ? null : { dealerCodes: แถว.map(r => r.code) }, [ชุดฐาน, กรองตัวเลข, แถว]);
  const การ์ด = useKpiCards("hq.pipeline", { ...ช่วง, dealer: null, today: isoDateOf(APP_NOW), filters: แถวฐาน === null && กรองตัวเลข ? undefined : ชุดการ์ด, รุ่น: salesVersion });
  const ยอดการ์ด = ค่า(การ์ด, "sales.value"), เป้าการ์ด = ค่า(การ์ด, "sales.target");
  const รวม = useMemo(() => รวมผลงาน(แถว), [แถว]);

  // ── เรียงตาราง (กดหัวคอลัมน์) · ค่าเริ่มต้น = ยอดขายมากสุดก่อน ──
  const [เรียง, setเรียง] = useState<{ k: คีย์เรียง; ลง: boolean }>({ k: "sales", ลง: true });
  const ค่าเรียง = (r: ผลงานดีลเลอร์, k: คีย์เรียง): string | number => k === "region" ? ชื่อภาค(r.region) : k === "latest" ? r.latest ?? "" : (r[k] as string | number | null) ?? -Infinity;
  const เรียงแล้ว = useMemo(() => [...แถว].sort((a, b) => {
    const x = ค่าเรียง(a, เรียง.k), y = ค่าเรียง(b, เรียง.k);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "th");
    return (เรียง.ลง ? -c : c) || a.code.localeCompare(b.code);
  }), [แถว, เรียง]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [หน้า, setหน้า] = useState(0);
  useEffect(() => { setหน้า(0); }, [q, dealerSel, regionSel, provSel, salesSel, ถึงเป้าเท่านั้น, เรียง, ช่วง.start, ช่วง.end]);   // eslint-disable-line react-hooks/exhaustive-deps
  const หน้าจริง = Math.min(หน้า, pageCountOf(เรียงแล้ว.length) - 1);
  const ในหน้า = pageSlice(เรียงแล้ว, หน้าจริง);

  // กราฟ: ยอดขาย เทียบ เป้าตามช่วง รายดีลเลอร์ (ลำดับเดียวกับตาราง · แบ่งหน้า 7 แถว)
  const แท่ง: HRow[] = useMemo(() => เรียงแล้ว.map(r => ({
    key: r.code, label: `${r.code} – ${r.name}`, a: r.sales, b: r.target ?? 0,
    note: r.pct == null ? "ยังไม่ตั้งเป้า" : `${r.pct}% ของเป้า`, onClick: () => router.push(`/hq/dealers/${r.code}`),
  })), [เรียงแล้ว, router]);
  const ขนาดกราฟ = 7;
  const [หน้ากราฟ, setหน้ากราฟ] = useState(0);
  useEffect(() => { setหน้ากราฟ(0); }, [แท่ง.length]);
  const หน้ากราฟจริง = Math.min(หน้ากราฟ, pageCountOf(แท่ง.length, ขนาดกราฟ) - 1);

  const anyFilter = q.trim() !== "" || [dealerSel, regionSel, provSel, salesSel].some(v => v !== ALL) || ถึงเป้าเท่านั้น;
  const ล้าง = () => { setQ(""); setDealerSel(ALL); setRegionSel(ALL); setProvSel(ALL); setSalesSel(ALL); setถึงเป้าเท่านั้น(false); };
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
            headers={["รหัสดีลเลอร์", "ดีลเลอร์", "ภูมิภาค", "ลีด", "ใบเสนอราคา", "ปิดได้", "ปิดไม่ได้", "อัตราปิด", "ยอดขาย", "เป้าตามช่วง", "% เป้า", "ส่วนต่างกำไร", "เสนอล่าสุด"]}
            rows={เรียงแล้ว.map(r => [r.code, r.name, ชื่อภาค(r.region), r.leads, r.quotes, r.won, r.lost, r.rate == null ? "—" : `${r.rate}%`,
              r.sales, r.target ?? "—", r.pct == null ? "—" : `${r.pct}%`, r.marginPct == null ? "—" : `${r.marginPct}%`, r.latest ? fmtISOToThai(r.latest) : "—"])} />
      </TopbarActions>

      {/* ── 1 · การ์ด KPI 4 ใบ (ใบ 0246) — ชุดสาขาเดียวกับตาราง: ผลรวมแถวท้ายตาราง = การ์ด ── */}
      <KpiRow label="สรุปภาพรวมยอดขาย" range={ช่วง}>
        <KpiCard kpi="sales" label="ยอดขาย (เทียบเป้า)" value={บาทเต็ม(ยอดการ์ด)} rawValue={ยอดการ์ด} empty="กำลังโหลด…"
          unit={เป้าการ์ด == null ? "ยังไม่ได้ตั้งเป้า" : `เป้าในช่วง ${บาทเต็ม(เป้าการ์ด)} · ตามวันลูกค้าตอบรับ`}
          ring={ยอดการ์ด != null && เป้าการ์ด ? Math.round(ยอดการ์ด / เป้าการ์ด * 100) : null} icon={Trophy}
          onClick={() => router.push("/hq/quotations?kpi=won")} />
        <KpiCard kpi="winRate" label={ชื่ออัตราปิดการขาย} value={ค่า(การ์ด, "winRate.rate") == null ? null : `${ค่า(การ์ด, "winRate.rate")}%`} rawValue={ค่า(การ์ด, "winRate.rate")}
          unit={คำอธิบายอัตราปิดการขาย} empty={การ์ด ? "ยังไม่มีลีดที่ปิดในช่วงนี้" : "กำลังโหลด…"} icon={Percent}
          sub={การ์ด ? `ปิดสำเร็จ ${ค่า(การ์ด, "winRate.won") ?? 0} · ไม่สำเร็จ ${ค่า(การ์ด, "winRate.lost") ?? 0}` : undefined} onClick={() => router.push("/hq/leads")} />
        <KpiCard kpi="margin" label="ส่วนต่างกำไรเฉลี่ย" value={ค่า(การ์ด, "margin.pct") == null ? null : `${Number(ค่า(การ์ด, "margin.pct")).toFixed(1)}%`} rawValue={ค่า(การ์ด, "margin.pct")}
          unit={`ส่วนต่างกำไร % ของราคาขาย · จาก ${ค่า(การ์ด, "margin.quotes") ?? 0} ใบที่ผูกใบ HQ`} empty={การ์ด ? "ยังไม่มีใบที่ตอบรับจากใบ HQ ในช่วงนี้" : "กำลังโหลด…"}
          icon={Coins} color="#059669" bg="#E6F6EF" actionLabel="เรียงตามส่วนต่าง"
          onClick={() => { setเรียง({ k: "marginPct", ลง: true }); document.querySelector("[data-testid='pipeline-table']")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
        <KpiCard kpi="onTarget" label="ดีลเลอร์ที่ถึงเป้า" value={ค่า(การ์ด, "onTarget.reached") == null ? null : `${ค่า(การ์ด, "onTarget.reached")} จาก ${ค่า(การ์ด, "onTarget.of") ?? 0}`}
          rawValue={ค่า(การ์ด, "onTarget.reached")} unit="ราย · ยอดตั้งแต่ต้นปีถึงเป้าทั้งปี" empty="กำลังโหลด…" icon={Award} color="#d97706" bg="#FEF3C7"
          actionLabel={ถึงเป้าเท่านั้น ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ"} onClick={() => setถึงเป้าเท่านั้น(v => !v)} />
      </KpiRow>

      {/* ── ตัวกรองแถวเดียว — ค้างใต้แถบบนตอนเลื่อน (พื้นทึบ ไม่ทับเนื้อหา · ส่วนกลาง .hq-sticky-filter) ── */}
      <div className="card hq-sticky-filter" data-filter-row>
        <div className="card-body" style={{ display: "flex", gap: 8, flexWrap: "nowrap", alignItems: "center", paddingTop: 12, paddingBottom: 12, overflowX: "auto" }}>
          <div className="search-bar" style={{ flex: "1.4 1 0", minWidth: 180, maxWidth: 300 }}>
            <Search size={14} color="#9ca3af" />
            <input aria-label="ค้นหาดีลเลอร์" value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหารหัส ชื่อดีลเลอร์ จังหวัด…" />
            {q && <button aria-label="ล้างคำค้น" onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
          </div>
          {sel(dealerSel, setDealerSel, "ทุกดีลเลอร์", allDealers.map(d => ({ v: d.code, l: `${d.code} – ${d.name}` })))}
          {sel(regionSel, setRegionSel, ป้ายทุกภูมิภาค, regionOpts.map(r => ({ v: r, l: ชื่อภาค(r) })))}
          {sel(provSel, setProvSel, "ทุกจังหวัด", provOpts.map(p => ({ v: p, l: p })))}
          {sel(salesSel, setSalesSel, "ทุกช่วงยอดขาย", SALES_BANDS.map(b => ({ v: b.v, l: b.l })))}
          {anyFilter && <button onClick={ล้าง} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>ล้างตัวกรอง</button>}
        </div>
      </div>

      {/* ── 2 · กราฟเดียว: ยอดขาย เทียบ เป้าตามช่วง (เป้าทั้งปี × วัน ÷ 365) รายดีลเลอร์ ── */}
      <div className="card" data-testid="pipeline-chart" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
        <div className="card-header">
          <div className="card-title">ยอดขาย เทียบ เป้าตามช่วง · รายดีลเลอร์</div>
        </div>
        <div style={{ flex: 1 }}>
          {โหลด ? <div className="card-body" style={{ fontSize: "0.8rem", color: "#9ca3af" }}>กำลังโหลด…</div>
            : <HBars rows={pageSlice(แท่ง, หน้ากราฟจริง, ขนาดกราฟ)} aLabel="ยอดขายในช่วง" bLabel="เป้าตามช่วง" fmt={fmtBaht} paged />}
        </div>
        <TablePagination page={หน้ากราฟจริง} total={แท่ง.length} onPage={setหน้ากราฟ} size={ขนาดกราฟ} unit="ดีลเลอร์" />
      </div>

      {/* ── 3 · ตารางผลงานดีลเลอร์ตารางเดียว — เรียงได้ทุกคอลัมน์ · แถวท้าย = ผลรวม (เท่าการ์ด) ── */}
      <div className="card" data-testid="pipeline-table" style={{ marginBottom: 0 }}>
        <div className="card-header">
          <div className="card-title">ตารางผลงานดีลเลอร์</div>
        </div>
        <div className="table-wrap dense">
          <table aria-label="ตารางผลงานดีลเลอร์" style={{ minWidth: คอลัมน์.reduce((s, c) => s + c.w, 0) }}>
            <colgroup>{คอลัมน์.map(c => <col key={c.k} style={{ width: c.w }} />)}</colgroup>
            <thead>
              <tr>
                {คอลัมน์.map(c => c.k === "view" ? <th key={c.k} aria-label="ดู" /> : (
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
              {โหลด && <tr><td colSpan={คอลัมน์.length} className="empty-row">กำลังโหลด…</td></tr>}
              {!โหลด && !เรียงแล้ว.length && <tr><td colSpan={คอลัมน์.length} className="empty-row">ไม่พบดีลเลอร์ที่ตรงกับตัวกรอง</td></tr>}
              {ในหน้า.map(r => (
                <ClickableRow key={r.code} className="clickable" onActivate={() => router.push(`/hq/dealers/${r.code}`)} label={`เปิดหน้าดีลเลอร์ ${r.name}`}>
                  <td data-perf-row={r.code} style={{ fontFamily: "monospace", fontWeight: 700, color: PRIMARY }} title={r.code}>{r.code}</td>
                  <td style={{ fontWeight: 600, color: "#1F2937" }} title={r.name}>{r.name}{r.status === "inactive" && <span style={{ marginLeft: 6, fontSize: "0.62rem", fontWeight: 700, color: MUTED }}>(ปิดใช้งาน)</span>}</td>
                  <td title={ชื่อภาค(r.region)}>{ชื่อภาค(r.region)}</td>
                  <td className="num" data-cell="leads">{r.leads.toLocaleString()}</td>
                  <td className="num" data-cell="quotes">{r.quotes.toLocaleString()}</td>
                  <td className="num" data-cell="won">{r.won.toLocaleString()}</td>
                  <td className="num" data-cell="lost">{r.lost.toLocaleString()}</td>
                  <td className="num" data-cell="rate" style={{ fontWeight: 700 }}>{r.rate == null ? "—" : `${r.rate}%`}</td>
                  <td className="num" data-cell="sales" data-value={r.sales} style={{ fontWeight: 800, color: "#1F2937" }} title={fmtBaht(r.sales)}>{fmtBaht(r.sales)}</td>
                  <td className="num" data-cell="target" data-value={r.target ?? ""} title={เงิน(r.target)}>{เงิน(r.target)}</td>
                  <td className="num" data-cell="pct" style={{ fontWeight: 700, color: r.pct == null ? "#94a3b8" : r.pct >= 100 ? "#059669" : PRIMARY }}>{r.pct == null ? "—" : `${r.pct}%`}</td>
                  <td className="num" data-cell="margin">{r.marginPct == null ? "—" : `${r.marginPct.toFixed(1)}%`}</td>
                  <td style={{ color: MUTED }} title={r.latest ? fmtISOToThai(r.latest) : "ยังไม่มีใบที่ส่งลูกค้า"}>{r.latest ? fmtISOToThai(r.latest) : "—"}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button title="เปิดหน้าดีลเลอร์" aria-label={`เปิดหน้าดีลเลอร์ ${r.name}`} onClick={() => router.push(`/hq/dealers/${r.code}`)}
                      style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #dbe3ec", background: "#fff", color: PRIMARY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Eye size={13} />
                    </button>
                  </td>
                </ClickableRow>
              ))}
            </tbody>
            {/* แถวรวมแสดงเสมอเมื่อโหลดเสร็จ — ไม่มีแถว = ผลรวม 0 (เทียบกับการ์ดได้ทุกตัวกรอง เช่น "ถึงเป้าเท่านั้น" แล้วยังไม่มีใครถึงเป้า) */}
            {!โหลด && (
              <tfoot>
                <tr data-perf-total style={{ background: "#f7f9fc", fontWeight: 800 }}>
                  <td colSpan={3}>รวม {เรียงแล้ว.length.toLocaleString()} ดีลเลอร์</td>
                  <td className="num" data-sum="leads">{รวม.leads.toLocaleString()}</td>
                  <td className="num" data-sum="quotes">{รวม.quotes.toLocaleString()}</td>
                  <td className="num" data-sum="won" data-value={รวม.won}>{รวม.won.toLocaleString()}</td>
                  <td className="num" data-sum="lost" data-value={รวม.lost}>{รวม.lost.toLocaleString()}</td>
                  <td className="num" data-sum="rate" data-value={รวม.rate ?? ""}>{รวม.rate == null ? "—" : `${รวม.rate}%`}</td>
                  <td className="num" data-sum="sales" data-value={รวม.sales} title={fmtBaht(รวม.sales)}>{fmtBaht(รวม.sales)}</td>
                  <td className="num" data-sum="target" data-value={รวม.target ?? ""} title="ผลรวมเป้าตามช่วงของสาขาที่ตั้งเป้า">{เงิน(รวม.target)}</td>
                  <td className="num" data-sum="pct">{รวม.pct == null ? "—" : `${รวม.pct}%`}</td>
                  <td className="num" data-sum="margin" data-value={รวม.marginPct ?? ""}>{รวม.marginPct == null ? "—" : `${รวม.marginPct.toFixed(1)}%`}</td>
                  <td colSpan={2} data-sum="onTarget" data-value={รวม.onTarget}>ถึงเป้า {รวม.onTarget} ราย</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <TablePagination page={หน้าจริง} total={เรียงแล้ว.length} onPage={setหน้า} unit="ดีลเลอร์" />
      </div>
    </div>
  );
}
