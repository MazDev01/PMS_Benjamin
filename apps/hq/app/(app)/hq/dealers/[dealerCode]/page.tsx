"use client";

import { useState } from "react";
import Link from "next/link";
import { use } from "react";
import {
  DEFAULT_HQ_TARGETS, dealerStatusLabel, dealerStatusColor,
  quotationStatusColor, quotationStatusLabel,
  type DealerRow, type DealerDetail, type DealerLeadItem, type DealerProjectItem, type DealerQuoteItem, type HQTargets, type HQCustomer,
} from "@pms/shared/lib/mock";
import { useRepoValue, useRepoValueLoaded } from "@pms/shared/lib/useRepoState";
import { useDealerPerformance, EMPTY_PERF } from "@pms/shared/lib/useDealerPerformance";
import { dealers as dealersRepo, settings as settingsRepo } from "@pms/shared/lib/data";
import { useNetworkDealerDetail, useNetworkCustomersForDealer } from "@pms/shared/lib/useNetworkData";
import { CountUp } from "@pms/shared/components/ui/CountUp";
import { packageLabel } from "@pms/shared/lib/dealerProposals";
import { DealerCredentialsCard } from "@pms/shared/components/hq/DealerCredentialsCard";
import { TablePagination, pageSlice, pageCountOf } from "@pms/shared/components/ui/TablePagination";
import { ArrowLeft, TrendingUp, TrendingDown, Users, Lock, ScrollText } from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────

function fmtM(n: number) {
  return n >= 1_000_000 ? `฿${(n / 1_000_000).toFixed(1)}M` : `฿${(n / 1000).toFixed(0)}K`;
}

const BADGE = (bg: string, color: string): React.CSSProperties => ({ background: bg, color });

const LEAD_STATUS: Record<DealerLeadItem["status"], { label: string; bg: string; color: string }> = {
  contacted: { label: "ติดต่อแล้ว", bg: "#eef2f7", color: "#475569" },
  quoted:    { label: "ส่งใบเสนอ", bg: "#dce5f0", color: "#003366" },
  won:       { label: "ปิดการขายสำเร็จ",     bg: "#e5faf0", color: "#059669" },
  lost:      { label: "ปิดการขายไม่สำเร็จ",  bg: "#fee2e2", color: "#dc2626" },
};

const PROJ_STATUS: Record<DealerProjectItem["status"], { label: string; bg: string; color: string; bar: string }> = {
  in_progress: { label: "กำลังดำเนินการ", bg: "#dce5f0", color: "#003366", bar: "#003366" },
  completed:   { label: "ปิดได้",         bg: "#e5faf0", color: "#059669", bar: "#059669" },
  on_hold:     { label: "พักโอกาสการขาย",         bg: "#fef3cd", color: "#d97706", bar: "#f59e0b" },
  overdue:     { label: "เกินกำหนด",      bg: "#fee2e2", color: "#dc2626", bar: "#dc2626" },
};

// สี/ป้ายสถานะใบเสนอราคา = ใช้ของกลาง (mock.ts) แหล่งเดียว — เดิม map ในไฟล์นี้ลอกไว้แล้วเพี้ยน
// (lost เป็นแดงที่นี่ แต่เทาที่อื่น) → ใบเดียวกันสีต่างกันคนละหน้า · 1.3

// ── Mini bar chart ───────────────────────────────────────────────

function MiniBarChart({ data }: { data: { month: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value));
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  // prev.value === 0 → หารศูนย์ได้ Infinity/NaN → โชว์ "—" แทน (ห้ามเรนเดอร์ +Infinity%/NaN%)
  const delta = prev && prev.value > 0 ? Math.round(((last.value - prev.value) / prev.value) * 100) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 72, marginBottom: 6 }}>
        {data.map((d, i) => {
          const pct = max > 0 ? Math.round((d.value / max) * 100) : 0;
          const isLast = i === data.length - 1;
          return (
            <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
              <div title={`${d.month}: ฿${(d.value / 1000).toFixed(1)}M`} className="vbar-grow"
                style={{ width: "100%", height: `${pct}%`, minHeight: 4, borderRadius: "4px 4px 0 0", background: isLast ? "#003366" : "#dce5f0", animationDelay: `${i * 60}ms` }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {data.map(d => (
          <span key={d.month} style={{ flex: 1, textAlign: "center", fontSize: "0.65rem", color: "#9ca3af" }}>{d.month}</span>
        ))}
      </div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
        {delta === null ? (
          // เดือนก่อนหน้ายังไม่มียอด → คิดเปอร์เซ็นต์ไม่ได้ ต้องเขียนให้อ่านออก ไม่ใช่ขีดเปล่า (บอสสั่ง 26 ส.ค. 69)
          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#9ca3af" }} title="เดือนก่อนหน้ายังไม่มียอด จึงคิดเป็นเปอร์เซ็นต์ไม่ได้">เทียบเดือนก่อนไม่ได้</span>
        ) : (
          <>
            {delta >= 0
              ? <TrendingUp size={12} color="#059669" />
              : <TrendingDown size={12} color="#dc2626" />}
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: delta >= 0 ? "#059669" : "#dc2626" }}>
              {delta >= 0 ? "+" : ""}{delta}% เทียบเดือนก่อน
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tab components ───────────────────────────────────────────────

function OverviewTab({ dealer, detail }: { dealer: DealerRow; detail: DealerDetail }) {
  // เกณฑ์ Win rate / ตรงเวลา = เป้าที่ HQ ตั้งไว้ (แหล่งเดียว) ไม่ hardcode
  const targets = useRepoValue<HQTargets>(() => settingsRepo.getTargets(), DEFAULT_HQ_TARGETS);
  // ผลงานจริงจากใบเสนอราคา/ลูกค้าเป้าหมาย — คอลัมน์ revenue_actual/win_rate/… ในตาราง dealers เป็นค่าเดโม
  const perf = useDealerPerformance().get(dealer.code) ?? EMPTY_PERF;
  // ⚠️ ตัวเลขที่โชว์ต้องเป็นค่าจริง · ตัดที่ 100 ได้เฉพาะความยาวแท่ง (บอสสั่ง 24 ส.ค. 69)
  //   เดิมสาขาที่ทำได้เกินเป้าขึ้น "100%" เท่ากันหมด แยกไม่ออกว่าใครทำได้ 101% หรือ 410%
  const targetPct = dealer.revenueTarget > 0 ? Math.round(perf.revenue / dealer.revenueTarget * 100) : 0;
  const targetBar = Math.min(100, targetPct);
  const barColor  = targetPct >= 80 ? "#059669" : targetPct >= 50 ? "#003366" : "#dc2626";
  // ⚠️ ไม่มีข้อมูลเลย = ยังตัดสินไม่ได้ ห้ามขึ้น "ล้าหลังเป้า" (แก้ 10 ส.ค. 69)
  //   เดิมสาขาที่ยังไม่มีลูกค้าเป้าหมาย/ใบเสนอราคา/ลูกค้าสักรายการ ถูกขึ้นป้ายแดง "ล้าหลังเป้า"
  //   พร้อมแถบเตือน "ต้องกระตุ้นการปิดการขาย" ทันทีที่เปิดหน้า เพราะยอด 0 ย่อมน้อยกว่า 50%
  //   สาขาที่เพิ่งเปิดจึงถูกตีตราตั้งแต่วันแรก · การ์ด "ติดตามตรงเวลา" ในหน้าเดียวกันทำถูกอยู่แล้ว
  //   (ขึ้น "ยังไม่มีข้อมูล") — ใบนี้แค่ยังไม่ได้ทำตาม
  const hasAnyActivity = perf.revenue > 0 || perf.openLeads > 0 || perf.quotes > 0;
  const isAtRisk  = hasAnyActivity && targetPct < 50;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      {/* ข้อมูลเข้าระบบของสาขานี้ — ย้ายมาจากปุ่มรูปกุญแจในตารางหน้ารายชื่อดีลเลอร์ (13 ส.ค. 69)
          แสดงเฉพาะผู้มีสิทธิ์จัดการดีลเลอร์ (การ์ดเช็คสิทธิ์ในตัวเอง) */}
      <DealerCredentialsCard dealer={dealer} />

      {/* Revenue progress */}
      <div className="card" style={{ padding: "18px 20px", gridColumn: "1 / -1" }}>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>ความคืบหน้าเทียบเป้าทั้งปี</p>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: "1.3rem", fontWeight: 800, color: "#2D2D2D" }}>฿{(perf.revenue / 1_000_000).toFixed(1)}M</span>
              <span style={{ fontSize: "1rem", fontWeight: 700, color: barColor }}>{targetPct}%</span>
            </div>
            <div style={{ height: 8, background: "#f0f0f5", borderRadius: 99, overflow: "hidden" }}>
              <div className="top5-bar" style={{ height: "100%", width: `${targetBar}%`, background: barColor, borderRadius: 99 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
              <span style={{ fontSize: "0.65rem", color: "#6b7280" }}>ยอดจริง</span>
              {/* ทศนิยม 1 ตำแหน่ง — เป้า Standard 1.6 ล้าน เดิมปัดขึ้น "฿2M" ไม่ตรงกับหน้าดีลเลอร์ */}
              <span style={{ fontSize: "0.65rem", color: "#6b7280" }}>เป้า ฿{(dealer.revenueTarget / 1_000_000).toFixed(1)}M{dealer.package ? ` · ${packageLabel[dealer.package]}` : ""}</span>
            </div>
            {isAtRisk && (
              <div style={{ marginTop: 10, padding: "6px 12px", background: "#fee2e2", borderRadius: 8, fontSize: "0.72rem", color: "#dc2626", fontWeight: 600 }}>
                ⚠ ยอดขายต่ำกว่า 50% ของเป้า — ต้องกระตุ้นการปิดการขาย
              </div>
            )}
          </div>
          <div style={{ minWidth: 180 }}>
            {detail && <MiniBarChart data={detail.monthlySales} />}
          </div>
        </div>
      </div>

      {/* Stats */}
      {[
        // ยังไม่มีข้อมูลให้วัด = "—" ไม่ใช่ 0% (0% แปลว่าวัดแล้วได้ศูนย์ ซึ่งคนละความหมาย)
        { label: "โอกาสการขายที่กำลังดำเนินการ", value: String(perf.openLeads),  unit: "โอกาสการขาย",     color: "#003366" },
        { label: "อัตราปิดการขาย",     value: perf.winRate === null ? "—" : String(perf.winRate),   unit: perf.winRate === null ? "" : "%", color: (perf.winRate ?? 0) >= targets.winRateTarget ? "#059669" : "#dc2626" },
        { label: "ติดตามตรงเวลา",         value: perf.onTimePct === null ? "—" : String(perf.onTimePct), unit: perf.onTimePct === null ? "" : "%", color: perf.onTimePct === null ? "#C0C0C0" : perf.onTimePct >= targets.onTimeTarget ? "#059669" : perf.onTimePct >= targets.onTimeTarget - 20 ? "#f59e0b" : "#dc2626" },
        { label: "ใบเสนอราคา",         value: String(detail?.quotes.length ?? 0),   unit: "ใบ",      color: "#2D2D2D" },
      ].map(s => (
        <div key={s.label} className="stat-card">
          <div className="stat-label">{s.label}</div>
          <div className="stat-value" style={{ color: s.color }}>
            <CountUp value={s.value} /><span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#6b7280", marginLeft: 4 }}>{s.unit}</span>
          </div>
        </div>
      ))}

      {/* Top products */}
      <div className="card" style={{ padding: "18px 20px", gridColumn: "1 / -1" }}>
        <p style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>แม่แบบที่ขาย</p>
        {(() => {
          const byProduct: Record<string, number> = {};
          (detail?.projects ?? []).forEach(p => { byProduct[p.product] = (byProduct[p.product] || 0) + p.valueNum; });
          const sorted = Object.entries(byProduct).sort((a, b) => b[1] - a[1]);
          const total = sorted.reduce((s, [, v]) => s + v, 0);
          const colors = ["#003366", "#0a4f8c", "#1e6fbf", "#4d94d4", "#82b4e3", "#b8d4f0"];
          // ไม่มีข้อมูล = บอกให้รู้ ไม่ปล่อยกล่องเปล่า (แก้ 10 ส.ค. 69)
          if (sorted.length === 0) return (
            <div style={{ padding: "14px 0", fontSize: "0.78rem", color: "#8a94a3" }}>— ยังไม่มีแม่แบบที่ปิดการขายได้</div>
          );
          return sorted.map(([product, value], i) => (
            <div key={product} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span className="badge" style={BADGE(colors[i % colors.length] + "22", colors[i % colors.length])}>{product}</span>
              <div style={{ flex: 1, height: 6, background: "#f0f0f5", borderRadius: 99, overflow: "hidden" }}>
                <div className="top5-bar" style={{ height: "100%", width: `${Math.round(value / total * 100)}%`, background: colors[i % colors.length], borderRadius: 99 }} />
              </div>
              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#2D2D2D", minWidth: 60, textAlign: "right" }}>{fmtM(value)}</span>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}

function LeadsTab({ leads }: { leads: DealerLeadItem[] }) {
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(leads.length) - 1);
  const rows = pageSlice(leads, cur);
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">ลูกค้าเป้าหมายที่ได้รับมอบหมาย</div>
      </div>
      <div className="table-wrap">
        <table>
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "24%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              {["รหัสลูกค้าเป้าหมาย", "ลูกค้า", "จังหวัด", "แม่แบบ", "มูลค่า", "สถานะ", "มอบหมายเมื่อ"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ไม่มีลูกค้าเป้าหมาย</td></tr>
            )}
            {rows.map(l => {
              const st = LEAD_STATUS[l.status];
              return (
                <tr key={l.id}>
                  <td style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 600 }}>{l.id}</td>
                  <td style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D" }}>{l.name}</td>
                  <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>{l.province}</td>
                  <td><span className="badge" style={BADGE("#f0f0f5", "#6b7280")}>{l.product}</span></td>
                  <td className="num" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#003366" }}>{fmtM(l.valueNum)}</td>
                  <td><span className="badge" style={BADGE(st.bg, st.color)}>{st.label}</span></td>
                  <td style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{l.assignedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={leads.length} onPage={setPage} unit="ราย" />
    </div>
  );
}

function ProjectsTab({ projects }: { projects: DealerProjectItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {projects.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ไม่มีโอกาสการขาย</div>
      )}
      {projects.map(p => {
        const st = PROJ_STATUS[p.status];
        return (
          <div key={p.id} className="card" style={{ padding: "14px 18px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: "0.86rem", fontWeight: 700, color: "#2D2D2D" }}>{p.name}</span>
                  <span className="badge" style={BADGE(st.bg, st.color)}>{st.label}</span>
                  <span className="badge" style={BADGE("#f0f0f5", "#6b7280")}>{p.product}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#003366" }}>{fmtM(p.valueNum)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuotesTab({ quotes }: { quotes: DealerQuoteItem[] }) {
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(quotes.length) - 1);
  const rows = pageSlice(quotes, cur);
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">ใบเสนอราคา</div>
      </div>
      <div className="table-wrap">
        <table>
          {/* ตัดคอลัมน์ "ส่วนลด" ออก (ระบบไม่มีส่วนลดแล้ว) → เกลี่ย % ใหม่ให้ครบ 100 */}
          <colgroup>
            <col style={{ width: "11%" }} />
            <col style={{ width: "30%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              {["เลขที่", "ลูกค้า", "แม่แบบ", "มูลค่า", "สถานะ", "วันที่"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ไม่มีใบเสนอ</td></tr>
            )}
            {rows.map(q => {
              const st = quotationStatusColor[q.status];
              return (
                <tr key={q.quoteNo}>
                  <td style={{ fontSize: "0.72rem", fontWeight: 700, color: "#003366" }}>{q.quoteNo}</td>
                  <td style={{ fontSize: "0.8rem", fontWeight: 600, color: "#2D2D2D" }}>{q.customer}</td>
                  <td><span className="badge" style={BADGE("#f0f0f5", "#6b7280")}>{q.product}</span></td>
                  <td className="num" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#003366" }}>{fmtM(q.valueNum)}</td>
                  <td><span className="badge" style={BADGE(st.bg, st.text)}>{quotationStatusLabel[q.status]}</span></td>
                  <td style={{ fontSize: "0.72rem", color: "#9ca3af" }}>{q.date}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={quotes.length} onPage={setPage} unit="ใบ" />
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────

const TABS = [
  { key: "overview",  label: "ภาพรวม" },
  { key: "leads",     label: "ลูกค้าเป้าหมาย" },
  { key: "projects",  label: "โอกาสการขาย" },
  { key: "quotes",    label: "ใบเสนอ" },
  { key: "customers", label: "ลูกค้า" },
  { key: "activity",  label: "กิจกรรม" },
] as const;

// ── Customer tab (read-only) — ลูกค้าที่ดีลเลอร์นี้ดูแล ────────────────────────────
function CustomerTab({ customers }: { customers: HQCustomer[] }) {
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pageCountOf(customers.length) - 1);
  const rows = pageSlice(customers, cur);
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">ลูกค้าที่ดีลเลอร์นี้ดูแล</div></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{["ลูกค้า", "จังหวัด", "ดีลที่ปิด", "มูลค่ารวม", "สถานะ"].map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ยังไม่มีลูกค้า</td></tr>
            )}
            {rows.map(c => (
              <tr key={c.id}>
                <td style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D" }}>{c.name}</td>
                <td style={{ fontSize: "0.8rem", color: "#6b7280" }}>{c.province}</td>
                <td className="num" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D" }}>{c.dealsWon}</td>
                <td className="num" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#003366" }}>{fmtM(c.totalRevenue)}</td>
                <td><span className="badge" style={c.status === "active" ? BADGE("#e5faf0", "#059669") : BADGE("#f0f0f5", "#9ca3af")}>{c.status === "active" ? "ใช้งาน" : "ไม่ใช้งาน"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TablePagination page={cur} total={customers.length} onPage={setPage} unit="ราย" />
    </div>
  );
}

// ── Activity tab (read-only) — ไทม์ไลน์งาน: ออกใบเสนอ + รับมอบหมายลูกค้าเป้าหมาย ──
function ActivityTab({ leads, quotes }: { leads: DealerLeadItem[]; quotes: DealerQuoteItem[] }) {
  const items = [
    ...quotes.map(q => ({ id: `q-${q.quoteNo}`, icon: <ScrollText size={14} />, color: "#003366",
      title: `ออกใบเสนอราคา ${q.customer}`, sub: `${q.product} · ${fmtM(q.valueNum)} · ${quotationStatusLabel[q.status]}`, date: q.date })),
    ...leads.map(l => ({ id: `l-${l.id}`, icon: <Users size={14} />, color: "#6b7280",
      title: `รับมอบหมายลูกค้าเป้าหมาย ${l.name}`, sub: `${l.product} · ${fmtM(l.valueNum)}`, date: l.assignedAt })),
  ];
  return (
    <div className="card">
      <div className="card-header"><div className="card-title">กิจกรรมล่าสุด</div></div>
      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: "0.8rem", color: "#9ca3af" }}>ยังไม่มีกิจกรรม</div>}
        {items.map((it, i) => (
          <div key={it.id} style={{ display: "flex", gap: 12, padding: "12px 4px", borderTop: i ? "1px solid #f1f5f9" : "none" }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, background: it.color + "14", color: it.color, display: "flex", alignItems: "center", justifyContent: "center" }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#2D2D2D" }}>{it.title}</div>
              <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 1 }}>{it.sub}</div>
            </div>
            <span style={{ fontSize: "0.7rem", color: "#9ca3af", flexShrink: 0 }}>{it.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type TabKey = typeof TABS[number]["key"];

export default function DealerDrillDownPage({ params }: { params: Promise<{ dealerCode: string }> }) {
  const { dealerCode } = use(params);
  // อ่านจากชุดที่ persist (HQ_DEALERS_KEY) — ดีลเลอร์ที่ HQ เพิ่มใหม่ต้องเปิดหน้านี้ได้ ไม่ใช่ 404
  const { value: dealers, loaded } = useRepoValueLoaded<DealerRow[]>(() => dealersRepo.list(), []);
  const perfMap = useDealerPerformance();
  const [tab, setTab] = useState<TabKey>("overview");
  const code = dealerCode.toUpperCase();
  const dealer = dealers.find(d => d.code === code);
  // รายละเอียดดีลเลอร์แบบเชื่อมต่อ: CNX = ข้อมูลสด (leads/projects/quotes/ยอดรายเดือน) · สาขาอื่น = seed
  const detail = useNetworkDealerDetail(code);
  const custs = useNetworkCustomersForDealer(code); // ลูกค้าของดีลเลอร์นี้ (กรองที่ repo ตรง ๆ — ไม่ดึงทั้งเครือ)

  // ทะเบียนดีลเลอร์มาจาก repo (async) — ต้องรอโหลดจบก่อน ไม่งั้นเรนเดอร์แรกเด้ง 404 ทุกครั้ง
  if (!loaded) return <div className="erp" />;
  // รหัสดีลเลอร์ที่พิมพ์ผิด/บุ๊กมาร์กเก่า/สาขาที่ถูกลบไปแล้ว — เรนเดอร์ข้อความในหน้าเอง (ไม่ใช้ notFound())
  // เพราะ notFound() ในคอมโพเนนต์ "use client" ที่ไม่มี not-found.tsx ครอบ เคยขึ้นจอเปล่าเงียบ ๆ
  // ไม่มี error เลยด้วย (พบจริงจากผลตรวจสอบระบบเต็มรูปแบบรอบ 2, 31 ก.ค. 69)
  if (!dealer) {
    return (
      <div className="erp" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 8 }}>ไม่พบดีลเลอร์รหัส &quot;{code}&quot;</div>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20, lineHeight: 1.6 }}>
            อาจพิมพ์รหัสผิด หรือดีลเลอร์รายนี้ถูกลบ/ยังไม่ถูกสร้างในระบบ
          </p>
          <Link href="/hq/dealers" className="btn btn-primary" style={{ display: "inline-flex", textDecoration: "none" }}>
            <ArrowLeft size={14} style={{ marginRight: 6 }} /> กลับไปหน้าดีลเลอร์
          </Link>
        </div>
      </div>
    );
  }

  const perf = perfMap.get(code) ?? EMPTY_PERF;
  const targetPct = dealer.revenueTarget > 0 ? Math.round(perf.revenue / dealer.revenueTarget * 100) : 0;
  // ⚠️ ไม่มีข้อมูลเลย = ยังตัดสินไม่ได้ ห้ามขึ้น "ล้าหลังเป้า" (แก้ 10 ส.ค. 69)
  //   เดิมสาขาที่ยังไม่มีลูกค้าเป้าหมาย/ใบเสนอราคา/ลูกค้าสักรายการ ถูกขึ้นป้ายแดง "ล้าหลังเป้า"
  //   พร้อมแถบเตือน "ต้องกระตุ้นการปิดการขาย" ทันทีที่เปิดหน้า เพราะยอด 0 ย่อมน้อยกว่า 50%
  //   สาขาที่เพิ่งเปิดจึงถูกตีตราตั้งแต่วันแรก · การ์ด "ติดตามตรงเวลา" ในหน้าเดียวกันทำถูกอยู่แล้ว
  //   (ขึ้น "ยังไม่มีข้อมูล") — ใบนี้แค่ยังไม่ได้ทำตาม
  const hasAnyActivity = perf.revenue > 0 || perf.openLeads > 0 || perf.quotes > 0;
  const isAtRisk  = hasAnyActivity && targetPct < 50;
  const isWarn    = targetPct >= 50 && targetPct < 70;

  return (
    <div className="erp">
      {/* Back link */}
      <Link href="/hq/dealers" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.8rem", color: "#6b7280", textDecoration: "none", marginBottom: 16, fontWeight: 600 }}>
        <ArrowLeft size={14} /> กลับไปหน้าดีลเลอร์
      </Link>

      {/* Header */}
      <div className="page-head">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 style={{ marginBottom: 0 }}>{dealer.name}</h2>
            <span className="badge" style={BADGE("#f0f0f5", "#6b7280")}>{dealer.code}</span>
            {/* แพ็กเกจของดีลเลอร์ (บอสสั่ง 15 ก.ย. 69) — สีเดียวกับป้ายในหน้า /hq/dealers · ไม่มีแพ็กเกจ = ไม่แสดง */}
            {dealer.package && (
              <span className="badge" style={dealer.package === "exclusive" ? BADGE("#fdf3e1", "#b45309") : BADGE("#e8f0fe", "#1d4ed8")}>
                แพ็กเกจ {packageLabel[dealer.package]}
              </span>
            )}
            {isAtRisk && <span className="badge" style={BADGE("#fee2e2", "#dc2626")}>🔴 ล้าหลังเป้า</span>}
            {isWarn   && <span className="badge" style={BADGE("#fef3cd", "#d97706")}>⚠ ระวัง</span>}
            {/* ป้าย/สี มาจาก @pms/shared/lib/mock แหล่งเดียว — ให้ตรงกับตารางหน้า /hq/dealers เป๊ะ */}
            {dealer.status === "inactive" && (
              <span className="badge" style={BADGE(dealerStatusColor.inactive.bg, dealerStatusColor.inactive.color)}>
                {dealerStatusLabel.inactive}
              </span>
            )}
          </div>
          <p>
            ภาค{dealer.region} · {perf.openLeads} โอกาสการขาย · อัตราปิดการขาย {perf.winRate === null ? "—" : `${perf.winRate}%`} · ติดตามตรงเวลา {perf.onTimePct === null ? "—" : `${perf.onTimePct}%`}
          </p>
        </div>
      </div>

      {/* โหมดดูอย่างเดียว — HQ เจาะดูข้อมูลดีลเลอร์ได้ทั้งหมด แก้ไม่ได้ (จัดการที่หน้าดีลเลอร์) */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#f5f7fa", border: "1px solid #e5e7eb",
        borderLeft: "3px solid #003366", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
        <Lock size={15} color="#003366" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "0.78rem", color: "#374151", flex: 1, minWidth: 180 }}>
          {/* ⚠️ ข้อความเดิมพูดคลุมเกินจริง (บอสแจ้ง 20 ส.ค. 69: กำลังจะแก้อีเมล/รหัสผ่านแล้วมาเจอป้ายนี้)
              หน้านี้แก้ "บัญชีเข้าระบบ" ได้จริงที่การ์ดด้านล่าง — ป้ายที่บอกว่าแก้อะไรไม่ได้เลย
              ทำให้ผู้ดูแลไม่กล้ากดต่อ หรือนึกว่าปุ่มที่เห็นเป็นปุ่มที่กดไม่ได้ */}
          <strong style={{ color: "#003366" }}>โหมดดูอย่างเดียว</strong> — ข้อมูลงานขายของดีลเลอร์ (ลูกค้าเป้าหมาย/ใบเสนอราคา/ลูกค้า) แก้จากหน้านี้ไม่ได้
          {" · "}บัญชีเข้าระบบแก้ได้ที่การ์ด “ข้อมูลเข้าระบบของดีลเลอร์” ด้านล่าง
        </span>
        {/* ⚠️ ปุ่ม "เข้าสู่โหมดจัดการ" ถูกลบเมื่อ 10 ส.ค. 69 — เดิมเขียน disabled ตายตัวในโค้ด
            ทดสอบด้วยบัญชีผู้ดูแลระบบจริงก็ยังกดไม่ได้ พร้อมคำอธิบายว่า "เฉพาะ Super Admin"
            ซึ่งผู้ใช้เข้าเงื่อนไขอยู่แล้ว = ปุ่มที่ไม่มีวันกดได้และบอกเหตุผลผิด
            การจัดการดีลเลอร์ทำที่หน้าทะเบียนดีลเลอร์อยู่แล้ว จึงชี้ทางไปที่นั่นแทน */}
        <Link href="/hq/dealers" className="btn btn-secondary btn-sm">
          <Lock size={12} /> จัดการที่หน้าทะเบียนดีลเลอร์
        </Link>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{ marginBottom: 20, overflowX: "auto" }}>
        {TABS.map(t => {
          const count = t.key === "leads" ? detail.leads.length
            : t.key === "projects" ? detail.projects.length
            : t.key === "quotes" ? detail.quotes.length
            : t.key === "customers" ? custs.length
            : null;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`tab-item ${tab === t.key ? "active" : ""}`}
              style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {t.label}
              {count !== null && (
                <span style={{ fontSize: "0.65rem", fontWeight: 700, background: tab === t.key ? "#dce5f0" : "#e5e7eb", color: tab === t.key ? "#003366" : "#6b7280", borderRadius: 99, padding: "1px 6px" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content — เชื่อมต่อ: CNX = ข้อมูลสด · สาขาอื่น = seed (แต่ละแท็บมี empty state ในตัว) */}
      {tab === "overview"  && <OverviewTab dealer={dealer} detail={detail} />}
      {tab === "leads"     && <LeadsTab    leads={detail.leads} />}
      {tab === "projects"  && <ProjectsTab projects={detail.projects} />}
      {tab === "quotes"    && <QuotesTab   quotes={detail.quotes} />}
      {tab === "customers" && <CustomerTab customers={custs} />}
      {tab === "activity"  && <ActivityTab leads={detail.leads} quotes={detail.quotes} />}
    </div>
  );
}
