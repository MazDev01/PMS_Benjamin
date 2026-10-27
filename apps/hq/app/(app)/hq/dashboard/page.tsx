"use client";

// ── แดชบอร์ดสำนักงานใหญ่ = แบบเดิม (af19ee1) + แถว "วันนี้ต้องทำ" (บอสสั่ง 21 ต.ค. 69 · ยกเลิกแบบ 3 กล่องของรอบ 4) ─────────
//   ตัวเลขทุกตัวคิดที่ฐาน (hq_dashboard · ใบ 0235) — หน้านี้แสดงอย่างเดียว ไม่คิดใหม่จากรายการในเครื่อง
//   · วันนี้ต้องทำ: งานค้างของ HQ ทั้งหมด ไม่ขึ้นกับตัวกรองช่วงเวลา/ดีลเลอร์ · กดแล้วไปหน้างานพร้อมตัวกรอง
//   · การ์ด 4 ใบ + 10 อันดับ + กราฟยอดขาย + ดีลเลอร์ตามภาค + กิจกรรม: ขึ้นกับตัวกรองช่วงเวลา/ดีลเลอร์
//     ยอดขาย = ใบที่ลูกค้าตอบรับ (ฉบับล่าสุด ก่อน VAT) นับตามวันที่ลูกค้าตอบรับ · เทียบเป้าเฉลี่ยตามช่วง (เป้าทั้งปี × วัน ÷ 365)
//     อัตราปิดการขาย = ฟังก์ชันกลาง lib/winRate.ts (ลีดที่เข้ามาในช่วง)
//   · กราฟ 2 ใบล่าง (ลีด·ใบ·ปิดการขาย · เป้าเทียบยอดจริง) มีปุ่ม 3/6/12 เดือนของตัวเอง (ขึ้นกับดีลเลอร์ ไม่ขึ้นกับช่วงเวลา)
//   · ไม่มีข้อมูล = กรอบว่างบอกตรง ๆ ไม่วาดเส้น 0 หรือแท่งเทาเต็มกราฟ · ไม่นับแถว HQ ทุกส่วน
//   กล่อง "ภาพรวม ณ ตอนนี้" 3 กล่องเอาออก (ซ้ำกับการ์ด/แถววันนี้ต้องทำ) — ผู้สนใจกำลังคุย · จังหวัดที่ยังไม่มีดีลเลอร์ ย้ายไปหน้าผู้สนใจเป็นดีลเลอร์
// ข้อทดสอบ: tests/scenario/hq-dashboard.spec.ts · supabase/tests/hq_dashboard.sql
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { ChevronRight, CheckCircle2, ClipboardList, Receipt, Target, Users2, FileText, Percent } from "lucide-react";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { FilterBar, SelectFilter } from "@pms/shared/components/filters/FilterBar";
import { useFilters, APP_NOW } from "@pms/shared/context/FilterContext";
import { PlanVsActualBars, GroupedBarChart, Donut } from "@pms/shared/components/ui/Charts";
import { SalesTrendChart } from "@pms/shared/components/ui/SalesTrendChart";
import { ActivityTimeline, type ActivityTimelineItem } from "@pms/shared/components/ui/ActivityTimeline";
import { MonthRangeToggle, type MonthRange } from "@pms/shared/components/ui/MonthRangeToggle";
import { ความละเอียดของช่วง } from "@pms/shared/lib/trendBuckets";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useSales } from "@pms/shared/context/SalesContext";
import { dealers as dealersRepo, metrics as metricsRepo } from "@pms/shared/lib/data";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { hqAuditCategory, type DealerRow } from "@pms/shared/lib/mock";
import { regionDisplay } from "@pms/shared/lib/hqQuotations";
import { fmtBaht } from "@pms/shared/lib/format";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { อัตราปิดการขาย, ชื่ออัตราปิดการขาย } from "@pms/shared/lib/winRate";
import { ลิงก์กิจกรรม, type HqDashboard } from "@pms/shared/lib/hqDashboard";

const PRIMARY = "#003366";
const RAMP = ["#003366", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626"];
const TH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const isoDateOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const AUDIT_ICON: Record<string, string> = { dealer: "meeting", users: "meeting", pricing: "quote", catalog: "quote", target: "status" };
const เวลาไทย = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${TH_ABBR[d.getMonth()]} ${d.getFullYear() + 543} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function กรอบว่าง({ text, h = 260 }: { text: string; h?: number }) {
  return (
    <div data-empty style={{ height: h, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #dfe4ea",
      borderRadius: 12, color: "#8a929c", fontSize: "0.84rem", fontWeight: 600, background: "#fafbfc" }}>{text}</div>
  );
}

export default function HQDashboard() {
  const { timeRange } = useFilters();
  const router = useRouter();
  const allDealers = useRepoValue<DealerRow[]>(() => dealersRepo.list().then(l => l.filter(ไม่ใช่แถวHQ)), []);
  const [dealerSel, setDealerSel] = useState<string>("all");
  const selDealer = dealerSel === "all" ? null : allDealers.find(d => d.code === dealerSel) ?? null;

  const [ข้อมูล, setข้อมูล] = useState<HqDashboard | null>(null);
  const [err, setErr] = useState("");
  const เริ่ม = isoDateOf(timeRange.start), จบ = isoDateOf(timeRange.end);
  // ตัวเลขขยับเองโดยไม่ต้องรีเฟรช: ข้อมูลขายในเครือเปลี่ยน (realtime / ซิงก์ทุก 30 วินาที) → salesVersion ขยับ → ดึงใหม่
  const { salesVersion } = useSales();
  const โหลด = useCallback(async () => {
    try { setข้อมูล(await metricsRepo.hqDashboard(เริ่ม, จบ, dealerSel === "all" ? null : dealerSel, isoDateOf(APP_NOW))); setErr(""); }
    catch (e) { setErr(friendlyError(e, "โหลดแดชบอร์ดไม่สำเร็จ")); }
  }, [เริ่ม, จบ, dealerSel]);
  useEffect(() => { const t = setTimeout(() => void โหลด(), 150); return () => clearTimeout(t); }, [โหลด, salesVersion]);

  const [barRange, setBarRange] = useState<MonthRange>(6);
  const [tgtRange, setTgtRange] = useState<MonthRange>(6);

  // ── กราฟแนวโน้มยอดขาย: ช่วงสั้นแยกรายชั่วโมง/วัน ช่วงยาวรายเดือน (ตรรกะแบ่งช่วงอยู่ที่ trendBuckets.ts) ──
  const ละเอียด = ความละเอียดของช่วง(timeRange.start, timeRange.end);
  const trend = useMemo(() => {
    if (!ข้อมูล) return [];
    const t = ข้อมูล.trend;
    if (ละเอียด === "hour") {
      const byH = new Map(t.byHour.map(r => [r.h, r.sales]));
      return Array.from({ length: 24 }, (_, h) => ({ month: `${String(h).padStart(2, "0")}:00`, value: (byH.get(h) ?? 0) / 1e6 }));
    }
    if (ละเอียด === "day") {
      const byD = new Map(t.byDay.map(r => [r.d, r.sales]));
      const pts: { month: string; value: number }[] = [];
      for (const d = new Date(timeRange.start.getFullYear(), timeRange.start.getMonth(), timeRange.start.getDate()); d <= timeRange.end; d.setDate(d.getDate() + 1))
        pts.push({ month: `${d.getDate()} ${TH_ABBR[d.getMonth()]}`, value: (byD.get(isoDateOf(d)) ?? 0) / 1e6 });
      return pts;
    }
    const byM = new Map(t.byMonth.map(r => [`${r.y}-${r.m}`, r.sales]));
    const pts: { month: string; value: number }[] = [];
    for (const d = new Date(timeRange.start.getFullYear(), timeRange.start.getMonth(), 1); d <= timeRange.end; d.setMonth(d.getMonth() + 1))
      pts.push({ month: TH_ABBR[d.getMonth()], value: (byM.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0) / 1e6 });
    return pts;
  }, [ข้อมูล, ละเอียด, timeRange.start, timeRange.end]);
  const มียอดในช่วง = (ข้อมูล?.cards.sales ?? 0) > 0;
  const หน่วยเวลา = ละเอียด === "hour" ? "รายชั่วโมง" : ละเอียด === "day" ? "รายวัน" : "รายเดือน";
  const trendTitle = selDealer ? `ยอดขาย ${selDealer.name.replace("Benjamin ", "")} ${หน่วยเวลา}` : `ยอดขายรวมทั้งเครือ ${หน่วยเวลา}`;

  const เดือน = (n: number) => (ข้อมูล?.monthly ?? []).slice(-n);
  const barRows = เดือน(barRange);
  const barมีข้อมูล = barRows.some(r => r.leads + r.quotes + r.won > 0);
  const tgtRows = เดือน(tgtRange);
  const tgtมียอด = tgtRows.some(r => r.sales > 0);
  const แผนเดือน = (ข้อมูล?.monthlyTarget ?? 0) / 1e6;

  const activity = useMemo<ActivityTimelineItem[]>(() => (ข้อมูล?.activity ?? []).map(e => ({
    id: e.id, type: AUDIT_ICON[hqAuditCategory(e.action)] ?? "note", label: e.action,
    text: `${e.user} · ${e.target}`, time: เวลาไทย(e.at), href: ลิงก์กิจกรรม(e),
  })), [ข้อมูล]);

  const c = ข้อมูล?.cards;
  const อัตรา = c ? อัตราปิดการขาย(c.closedWon, c.closedLost) : null;
  const ช่วงคำ = `${c?.days ?? 0} วัน`;
  const td = ข้อมูล?.today;
  const มีงานค้าง = !!td && (td.requestsOpen > 0 || td.franchiseOverdue.count > 0);

  return (
    <div className="erp">
      <TopbarActions>
        <SelectFilter caption="ทุกดีลเลอร์ (ทั้งเครือ)" value={dealerSel}
          options={allDealers.map(d => ({ value: d.code, label: `${d.code} – ${d.name}` }))}
          onChange={setDealerSel} />
        <FilterBar dims={[]} />
      </TopbarActions>

      {err && (
        <div role="alert" className="card" style={{ marginBottom: "1.25rem", padding: 14, color: "#b91c1c", display: "flex", gap: 10, alignItems: "center" }}>
          {err} <button className="btn btn-secondary btn-sm" onClick={() => void โหลด()}>ลองใหม่</button>
        </div>
      )}

      {/* ── วันนี้ต้องทำ (ไม่ขึ้นกับตัวกรอง) ── */}
      <section aria-label="วันนี้ต้องทำ" className="card" style={{ marginBottom: "1.25rem", padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#1F2937", minWidth: 110 }}>วันนี้ต้องทำ</div>
          {!td ? <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>กำลังโหลด…</span>
            : !มีงานค้าง ? (
              <span data-testid="today-clear" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#059669", fontWeight: 700, fontSize: "0.86rem" }}>
                ไม่มีงานค้าง <CheckCircle2 size={16} />
              </span>
            ) : (
              <>
                <Link href="/hq/quote-requests?overdue=1" data-testid="today-requests" className="clickable"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", border: "1px solid #e6eaf0", borderRadius: 12, textDecoration: "none", color: "inherit" }}>
                  <ClipboardList size={18} color={PRIMARY} />
                  <span style={{ fontSize: "0.82rem", color: "#374151" }}>คำขอราคารอตีราคา</span>
                  <b data-value={td.requestsOpen} style={{ fontSize: "1.05rem", color: PRIMARY }}>{td.requestsOpen}</b>
                  {td.requestsOverdue > 0 && (
                    <span data-testid="today-overdue" data-value={td.requestsOverdue} style={{ fontSize: "0.78rem", fontWeight: 800, color: "#dc2626" }}>
                      เกิน 14 วัน {td.requestsOverdue}
                    </span>
                  )}
                  <ChevronRight size={14} color="#9ca3af" />
                </Link>
                <Link href="/hq/proposals?overdue=1" data-testid="today-franchise" className="clickable"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", border: "1px solid #e6eaf0", borderRadius: 12, textDecoration: "none", color: "inherit" }}>
                  <Receipt size={18} color={PRIMARY} />
                  <span style={{ fontSize: "0.82rem", color: "#374151" }}>ใบค่าแฟรนไชส์ค้างชำระ</span>
                  <b data-value={td.franchiseOverdue.count} style={{ fontSize: "1.05rem", color: td.franchiseOverdue.count > 0 ? "#dc2626" : PRIMARY }}>{td.franchiseOverdue.count}</b>
                  {td.franchiseOverdue.count > 0 && <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>{fmtBaht(td.franchiseOverdue.amount)}</span>}
                  <ChevronRight size={14} color="#9ca3af" />
                </Link>
              </>
            )}
        </div>
      </section>

      {/* ── การ์ด 4 ใบ (ขึ้นกับตัวกรองช่วงเวลา/ดีลเลอร์) — ตัวเลขคิดที่ฐาน (hq_dashboard 0235) · คอมโพเนนต์กลาง KpiCard (ใบ 0246) ── */}
      <KpiRow label="สรุปแดชบอร์ดสำนักงานใหญ่" range={{ start: เริ่ม, end: จบ }} style={{ marginBottom: "1.5rem" }}>
        <KpiCard kpi="sales" label="ยอดขาย (ใบที่ลูกค้าตอบรับ ก่อน VAT)" value={c ? fmtBaht(c.sales) : null} rawValue={c?.sales ?? null} empty="กำลังโหลด…"
          sub={<span data-target={c?.target ?? ""}>{!c ? " " : c.target == null ? "ยังไม่ได้ตั้งเป้า" : `เป้า ${fmtBaht(c.target)} (เฉลี่ยตามช่วง ${ช่วงคำ})`}</span>}
          ring={c && c.target ? Math.round(c.sales / c.target * 100) : null} icon={Target} actionLabel="ดูรายละเอียด" onClick={() => router.push("/hq/pipeline")} />
        <KpiCard kpi="leads" label={selDealer ? `ลีดใหม่ของ ${selDealer.code}` : "ลีดใหม่ทั้งเครือ"} value={c ? c.leadsNew.toLocaleString("th-TH") : null} rawValue={c?.leadsNew ?? null}
          unit="ราย · เข้ามาในช่วงที่เลือก" empty="กำลังโหลด…" icon={Users2} color="#7C3AED" bg="#F0EBFB" actionLabel="ดูรายละเอียด" onClick={() => router.push("/hq/leads")} />
        <KpiCard kpi="quotes" label="ใบเสนอราคาที่ส่งลูกค้า" value={c ? c.quotesSent.toLocaleString("th-TH") : null} rawValue={c?.quotesSent ?? null}
          unit="ใบ · ออกในช่วงที่เลือก (ไม่นับร่าง/ถูกแทนที่)" empty="กำลังโหลด…" icon={FileText} color="#0891B2" bg="#E6F4F9" actionLabel="ดูรายละเอียด" onClick={() => router.push("/hq/quotations")} />
        <KpiCard kpi="winrate" label={ชื่ออัตราปิดการขาย} value={อัตรา == null ? null : `${อัตรา}%`} rawValue={อัตรา}
          unit={c ? `ลีดปิดสำเร็จ ${c.closedWon} · ไม่สำเร็จ ${c.closedLost}` : " "} empty={c ? "ยังไม่มีลีดที่ปิด" : "กำลังโหลด…"}
          icon={Percent} color="#D97706" bg="#FEF0E6" actionLabel="ดูรายละเอียด" onClick={() => router.push("/hq/pipeline")} />
      </KpiRow>

      {/* แถว 1: แนวโน้มยอดขาย · สัดส่วนดีลเลอร์ตามภาค */}
      <div className="hq-row2a" style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: "1.25rem", alignItems: "stretch", marginBottom: "1.25rem" }}>
        <div className="card" data-card="trend" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="card-body" style={{ flex: 1, display: "flex", flexDirection: "column", paddingTop: "1.15rem" }}>
            {มียอดในช่วง
              ? <SalesTrendChart title={trendTitle} monthly={trend} granularity={ละเอียด} height={395} />
              : (<>
                  <div className="card-title" style={{ marginBottom: 12 }}>{trendTitle}</div>
                  <กรอบว่าง text="ยังไม่มียอดขาย" h={395} />
                </>)}
          </div>
        </div>
        <div className="card" data-card="regions" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">สัดส่วนดีลเลอร์ตามภาค</div>
            <Link href="/hq/dealers" className="btn btn-secondary btn-sm">จัดการ →</Link>
          </div>
          <div className="card-body" style={{ paddingTop: 4 }}>
            {!ข้อมูล ? <กรอบว่าง text="กำลังโหลด…" h={200} /> : ข้อมูล.dealerCount === 0 ? <กรอบว่าง text="ยังไม่มีดีลเลอร์" h={200} /> : (() => {
              const regions = ข้อมูล.regions;
              const tot = ข้อมูล.dealerCount || 1;
              const colorOf = new Map(regions.map((r, i) => [r.region, RAMP[i % RAMP.length]]));
              const segs = regions.map(r => ({ label: regionDisplay(r.region), value: r.dealers, color: colorOf.get(r.region)!, sales: r.sales, pct: Math.round(r.dealers / tot * 100) }));
              const byRev = [...segs].sort((a, b) => b.sales - a.sales);
              const maxRev = Math.max(...segs.map(s => s.sales), 1);
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <Donut segments={segs} centerLabel="ดีลเลอร์" centerValue={`${ข้อมูล.dealerCount}`} size={140} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      {segs.map(s => (
                        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                          <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                          <span style={{ flex: 1, color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                          <span style={{ fontWeight: 800, color: "#1F2937" }}>{s.value}</span>
                          <span style={{ color: "var(--muted-foreground)", minWidth: 32, textAlign: "right", fontWeight: 700 }}>{s.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid #f0f4f8", marginTop: 16, paddingTop: 13 }}>
                    <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--muted-foreground)", marginBottom: 11 }}>ยอดขายตามภูมิภาค <span style={{ fontWeight: 400 }}>(ตามช่วงเวลาที่เลือก · ทุกภาค)</span></div>
                    {!มียอดในช่วง ? <div style={{ fontSize: "0.8rem", color: "#8a929c" }}>ยังไม่มียอดขายในช่วงนี้</div> : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                        {byRev.map(s => (
                          <div key={s.label}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 3 }}>
                              <span style={{ color: "#374151", fontWeight: 600 }}>{s.label}</span>
                              <span style={{ fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(s.sales)}</span>
                            </div>
                            <div style={{ height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                              <div className="bar-grow" style={{ height: "100%", width: `${Math.round(s.sales / maxRev * 100)}%`, background: s.color, borderRadius: 999 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* แถว 2: ลีด·ใบเสนอราคา·ปิดการขาย · เป้าหมายเทียบยอดขายจริง (ปุ่ม 3/6/12 เดือนของตัวเอง) */}
      <div className="hq-row2b" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", alignItems: "stretch", marginBottom: "1.25rem" }}>
        <div className="card" data-card="bars" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="card-header">
            <div className="card-title">ลีดใหม่ · ใบเสนอราคา · ปิดการขาย (รายเดือน)</div>
            <MonthRangeToggle value={barRange} onChange={setBarRange} label="ช่วงเวลากราฟลีดใหม่·ใบเสนอราคา·ปิดการขาย" />
          </div>
          <div className="card-body" style={{ paddingTop: 4, flex: 1 }}>
            {barมีข้อมูล ? (
              <GroupedBarChart months={barRows.map(r => TH_ABBR[r.m])} vw={820} height={260} fmt={v => `${Math.round(v)}`}
                series={[
                  { name: "ลีดใหม่", color: "#003366", data: barRows.map(r => r.leads) },
                  { name: "ใบเสนอราคา", color: "#0891b2", data: barRows.map(r => r.quotes) },
                  { name: "ปิดการขาย", color: "#10B981", data: barRows.map(r => r.won) },
                ]} />
            ) : <กรอบว่าง text="ยังไม่มีข้อมูลในช่วงนี้" />}
          </div>
        </div>
        <div className="card" data-card="target" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">เป้าหมาย เทียบ ยอดขายจริง</div>
            <MonthRangeToggle value={tgtRange} onChange={setTgtRange} label="ช่วงเวลากราฟเป้าหมายเทียบยอดขายจริง" />
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            {tgtมียอด ? (
              <PlanVsActualBars unit="M" aLabel="ยอดขายจริง" bLabel="เป้าหมาย"
                data={tgtRows.map(r => ({ label: TH_ABBR[r.m], actual: Math.round(r.sales / 1e6 * 10) / 10, plan: Math.round(แผนเดือน * 10) / 10 }))} />
            ) : <กรอบว่าง text="ยังไม่มียอดขาย" />}
          </div>
        </div>
      </div>

      {/* แถว 3: ผลงานดีลเลอร์ 10 อันดับ · กิจกรรมล่าสุด */}
      <div className="hq-row3c" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "1.25rem", alignItems: "stretch", marginBottom: "1.25rem", minHeight: 340 }}>
        <div className="card" data-card="top" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div className="card-title">ผลงานดีลเลอร์ 10 อันดับแรก</div>
            <Link href="/hq/pipeline" className="btn btn-secondary btn-sm">ดูทั้งหมด →</Link>
          </div>
          <div className="card-body" style={{ paddingTop: 4, display: "flex", flexDirection: "column", gap: 9 }}>
            {!ข้อมูล ? <กรอบว่าง text="กำลังโหลด…" h={200} /> : ข้อมูล.top.length === 0 ? <กรอบว่าง text="ยังไม่มียอดขายในช่วงนี้" h={200} /> : (<>
              <div style={{ display: "flex", fontSize: "0.68rem", color: "var(--muted-foreground)", paddingLeft: 26, gap: 8 }}>
                <span style={{ flex: 1 }} /><span style={{ flex: "0 0 52px", textAlign: "right" }}>ยอดขาย</span><span style={{ flex: "0 0 38px", textAlign: "right" }}>% เป้า</span><span style={{ flex: "0 0 52px", textAlign: "right" }}>อัตราปิด</span>
              </div>
              {(() => { const max = Math.max(...ข้อมูล.top.map(d => d.sales), 1); return ข้อมูล.top.map((d, i) => {
                const อัตราสาขา = อัตราปิดการขาย(d.closedWon, d.closedLost);
                return (
                  <Link key={d.code} href={`/hq/dealers/${d.code}`} data-top-row={d.code} className="clickable hq-tap"
                    aria-label={`เปิดหน้าดีลเลอร์ ${d.name}`} style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "inherit" }}>
                    <span style={{ width: 16, textAlign: "center", fontSize: "0.74rem", fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: "0 0 84px", fontSize: "0.76rem", fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name.replace("Benjamin ", "")}</span>
                    <div style={{ flex: 1, height: 8, background: "var(--muted)", borderRadius: 999, overflow: "hidden", minWidth: 20 }}>
                      <div className="bar-grow" style={{ height: "100%", width: `${Math.round(d.sales / max * 100)}%`, background: PRIMARY, borderRadius: 999 }} />
                    </div>
                    <span data-value={d.sales} style={{ flex: "0 0 52px", fontSize: "0.76rem", fontWeight: 800, color: "#1F2937", textAlign: "right" }}>฿{(d.sales / 1e6).toFixed(1)}M</span>
                    <span style={{ flex: "0 0 38px", fontSize: "0.74rem", fontWeight: 700, color: PRIMARY, textAlign: "right" }}>{d.target ? `${Math.round(d.sales / d.target * 100)}%` : "—"}</span>
                    <span style={{ flex: "0 0 52px", fontSize: "0.74rem", fontWeight: 700, color: "var(--muted-foreground)", textAlign: "right" }}>{อัตราสาขา == null ? "—" : `${อัตราสาขา}%`}</span>
                  </Link>
                );
              }); })()}
            </>)}
          </div>
        </div>
        <div className="card" data-card="activity" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
          <div className="card-header"><div className="card-title">กิจกรรมล่าสุด</div></div>
          <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
            <div className="chart-scroll" style={{ position: "absolute", inset: 0, padding: "4px 1.15rem 1.15rem" }}>
              <ActivityTimeline items={activity} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
