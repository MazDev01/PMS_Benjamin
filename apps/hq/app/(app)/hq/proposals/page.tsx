"use client";

// ─── HQ · ใบค่าแฟรนไชส์ (หน้ารวมทุกผู้สนใจ) ─────────────────────────────
//
// บอสสั่ง 14 ก.ย. 69:
//   "ทำหน้า ใบค่าแฟรนไชส์ ด้วย"
//   "ให้มีการแสดงในหน้าเดียวแบบดีลเลอร์" · "ใบค่าแฟรนไชส์มันไม่จบแบบหน้าเดียว ให้แบบใช้งานง่าย"
//   → แบบเดียวกับหน้าใบเสนอราคาของดีลเลอร์: ทุกแถวมีปุ่ม ส่ง/ดู/พิมพ์/แก้ไข/ลบ · ดูรายละเอียดเป็นแผงกลางจอ
//     เปลี่ยนสถานะได้ในแผงเลย · ออกใบใหม่เลือกผู้สนใจในฟอร์มเดียว (ไม่ต้องเปิดต่อหลายชั้น)
//
// ⚠️ รอบ 4: หน้านี้ไม่มีฟอร์ม/คำสั่งเปลี่ยนสถานะแล้ว (อยู่แผงผู้สนใจ) · เดิม: ห้ามเขียนฟอร์ม/คำสั่งซ้ำในหน้านี้ — ใช้ ProposalFormModal + useProposalActions ชุดเดียวกับหน้าผู้สนใจ
// สิทธิ์: ดูได้ทุกบทบาทฝั่งสำนักงานใหญ่ · ออกใบ/เปลี่ยนสถานะ = ผู้มีสิทธิ์จัดการดีลเลอร์ (RLS 0172 บังคับซ้ำ)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { useKpiCards } from "@pms/shared/lib/useKpiCards";
import { ค่า, นับ, บาทเต็ม, เดือนนี้ } from "@pms/shared/lib/kpiCards";
import { FileText, Send, AlarmClock, Search, X, Eye, Printer, MapPin, ExternalLink, Coins, Wallet } from "lucide-react";
import { proposals as proposalsRepo, prospects as prospectsRepo, metrics as metricsRepo } from "@pms/shared/lib/data";
import type { DealerPackage, DealerPackageProposal, DealerProposalStatus, DealerProspect } from "@pms/shared/lib/data/types";
import { PACKAGE_ORDER, PROPOSAL_STATUS_ORDER, packageLabel, proposalStatusLabel, proposalStatusColor, มูลค่าอ่านง่าย, ระยะสัญญาอ่านง่าย, หมดอายุแล้ว } from "@pms/shared/lib/dealerProposals";
import { ProposalPaymentsBox } from "@pms/shared/components/hq/ProposalPaymentsBox";
import { useProposalActions } from "@pms/shared/components/hq/useProposalActions";
import { useRole } from "@pms/shared/context/RoleContext";
import { APP_NOW_ISO, APP_NOW } from "@pms/shared/context/FilterContext";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { TablePagination, pageSlice } from "@pms/shared/components/ui/TablePagination";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { ตรึงคอลัมน์ปุ่ม } from "@pms/shared/components/ui/stickyActionCol";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { formatPhone } from "@pms/shared/lib/format";
import { friendlyError } from "@pms/shared/lib/friendlyError";

const PRIMARY = "#003366";
const STEEL = "#2D2D2D";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

/** ข้อความพื้นที่ — ทุกภาค = ทั่วประเทศ */
const พื้นที่ของใบ = (p: DealerPackageProposal) =>
  p.region === "ทุกภาค" ? "ทั่วประเทศ" : [p.province, p.region ? `ภาค${p.region}` : ""].filter(Boolean).join(" · ") || "—";

// ปุ่มไอคอนในแถว — หน้าตาเดียวกับหน้าใบเสนอราคาของดีลเลอร์
const ปุ่มไอคอน = (อันตราย = false): React.CSSProperties => ({
  width: 28, height: 28, borderRadius: 7, border: `1px solid ${อันตราย ? "#f3c9c9" : BORDER}`, background: "#fff",
  color: อันตราย ? "#dc2626" : PRIMARY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
});
const ปุ่มปิดใช้: React.CSSProperties = { opacity: .35, cursor: "not-allowed" };

export default function HQProposalsPage() {
  const { can } = useRole();
  const จัดการได้ = can("dealers:manage");
  const { พิมพ์ } = useProposalActions();

  const [ใบ, setใบ] = useState<DealerPackageProposal[]>([]);
  const [ราย, setราย] = useState<DealerProspect[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "expired" | DealerProposalStatus>("all");
  const [packageFilter, setPackageFilter] = useState<"all" | DealerPackage>("all");
  // ?overdue=1 (แถว "วันนี้ต้องทำ" ของแดชบอร์ด) = เฉพาะใบค้างชำระ — รายการเลขใบมาจากตัวคำนวณเดียวกับแดชบอร์ด (hq_dashboard · ใบ 0235)
  const [ค้างชำระ, setค้างชำระ] = useState<Set<number> | null>(null);
  // ชุดเลขใบที่กรองอยู่มาจากไหน (การ์ด KPI · ใบ 0246 / ลิงก์แดชบอร์ด) — ป้ายบนชิปกรอง
  const [ป้ายชุด, setป้ายชุด] = useState("เฉพาะใบค้างชำระ");
  const ช่วงเดือนนี้ = useMemo(() => เดือนนี้(APP_NOW.getTime()), []);
  const [page, setPage] = useState(0);

  const [ดูรหัส, setดูรหัส] = useState<number | null>(null);

  const โหลด = useCallback(async () => {
    try {
      const [ใบทั้งหมด, รายทั้งหมด] = await Promise.all([proposalsRepo.list(), prospectsRepo.list()]);
      setใบ(ใบทั้งหมด);
      setราย(รายทั้งหมด);
      setLoadErr("");
    } catch (e) {
      // ห้ามปล่อยตารางว่างเงียบ ๆ — ผู้ใช้จะนึกว่ายังไม่เคยออกใบ
      setLoadErr(friendlyError(e, "โหลดใบค่าแฟรนไชส์ไม่สำเร็จ"));
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => { void โหลด(); }, [โหลด]);
  // มาจากกระดิ่ง "ใบค่าแฟรนไชส์เกินกำหนดชำระ" (ใบ 0231): ?open=เลขใบ = เปิดแผงของใบนั้น · อยู่หน้านี้อยู่แล้ว = ฟัง bpms:open-record
  useEffect(() => {
    const เปิด = (search: string) => {
      const u = new URLSearchParams(search);
      // ?q= (กิจกรรมล่าสุดของแดชบอร์ด) = ค้นเลขที่ใบ · ?overdue=1 = เฉพาะใบค้างชำระ
      if (u.get("kpi") === "waiting") { window.history.replaceState(null, "", window.location.pathname); setStatusFilter("sent"); setPage(0); return; }
      if (u.get("q") || u.get("overdue")) {
        window.history.replaceState(null, "", window.location.pathname);
        if (u.get("q")) { setQ(u.get("q") ?? ""); setPage(0); }
        if (u.get("overdue")) void metricsRepo.hqDashboard(APP_NOW_ISO, APP_NOW_ISO, null, APP_NOW_ISO)
          .then(d => { setป้ายชุด("เฉพาะใบค้างชำระ"); setค้างชำระ(new Set(d.today.franchiseOverdue.ids)); setPage(0); })
          .catch(e => setLoadErr(friendlyError(e, "โหลดรายการใบค้างชำระไม่สำเร็จ")));
        return;
      }
      const id = Number(u.get("open"));
      if (!id) return;
      window.history.replaceState(null, "", window.location.pathname);
      setดูรหัส(id);
    };
    เปิด(window.location.search);
    const on = (e: Event) => {
      const href = String((e as CustomEvent).detail ?? "");
      if (href.startsWith("/hq/proposals?")) { เปิด(href.slice(href.indexOf("?"))); void โหลด(); }
    };
    window.addEventListener("bpms:open-record", on);
    return () => window.removeEventListener("bpms:open-record", on);
  }, [โหลด]);

  const รายตามรหัส = useMemo(() => new Map(ราย.map(r => [r.id, r])), [ราย]);

  const filtered = useMemo(() => {
    const คำ = q.trim().toLowerCase();
    return ใบ.filter(p => {
      if (ค้างชำระ && !ค้างชำระ.has(p.id)) return false;
      if (statusFilter === "expired" ? !หมดอายุแล้ว(p, APP_NOW_ISO) : statusFilter !== "all" && p.status !== statusFilter) return false;
      if (packageFilter !== "all" && p.package !== packageFilter) return false;
      if (!คำ) return true;
      const r = รายตามรหัส.get(p.prospectId);
      return [p.proposalNo, r?.name, r?.social, p.province, p.region, packageLabel[p.package]]
        .some(v => String(v ?? "").toLowerCase().includes(คำ));
    });
  }, [ใบ, statusFilter, packageFilter, q, รายตามรหัส, ค้างชำระ]);

  // ── การ์ด KPI 4 ใบ (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) — ตัวเลขคิดที่ฐาน (kpi_cards) · ทั้งหมด ไม่ขึ้นกับตัวกรองของตาราง
  //   ไม่มีตัวกรองช่วงเวลา → รับชำระ = เดือนนี้ (บอสตัดสิน 27 ต.ค. 69) · ค้าง/เกินกำหนด/รับชำระ: ฐานส่งเลขใบมาให้กรองตารางตรงกับตัวเลข
  const kpi = useKpiCards("hq.proposals", { ...ช่วงเดือนนี้, today: APP_NOW_ISO, รุ่น: ใบ.map(p => `${p.id}:${p.status}`).join(",") });
  const กรองชุด = (คีย์: "unpaid" | "overdue" | "paid", ป้าย: string) => {
    const ids = ((kpi?.[คีย์] as { ids?: number[] } | undefined)?.ids ?? []).map(Number);
    const ซ้ำ = !!ค้างชำระ && ป้ายชุด === ป้าย;
    setStatusFilter("all"); setป้ายชุด(ป้าย); setค้างชำระ(ซ้ำ ? null : new Set(ids)); setPage(0);
  };

  const ใบที่ดู = ดูรหัส == null ? null : ใบ.find(p => p.id === ดูรหัส) ?? null;
  const รายของใบที่ดู = ใบที่ดู ? รายตามรหัส.get(ใบที่ดู.prospectId) ?? null : null;

  // ── คำสั่งในแถว / ในแผง ──
  // ส่ง/ตอบรับ/ปฏิเสธ/แก้/ทำเวอร์ชันใหม่/ลบ ย้ายไปแผงผู้สนใจที่เดียว (รอบ 4) — หน้านี้เหลือพิมพ์ + บันทึกการชำระ
  function กดพิมพ์(p: DealerPackageProposal) {
    const r = รายตามรหัส.get(p.prospectId);
    if (r) void พิมพ์(p, r);
  }
  return (
    <div className="erp">
      <TopbarActions>
        <ExportMenu
          filename="hq-dealer-package-proposals"
          title="ใบค่าแฟรนไชส์"
          headers={["เลขที่", "ผู้สนใจ", "แพ็กเกจ", "ภาค", "จังหวัด", "ค่าแรกเข้า (บาท)", "ระยะสัญญา (เดือน)", "เป้ายอดซื้อต่อปี (บาท)", "สถานะ", "วันที่เสนอ", "มีผลถึง", "เงื่อนไข"]}
          rows={filtered.map(p => [
            p.proposalNo ?? "", รายตามรหัส.get(p.prospectId)?.name ?? "", packageLabel[p.package], p.region ?? "", p.province ?? "",
            p.amount ?? "", p.contractMonths ?? "", p.annualTarget ?? "", proposalStatusLabel[p.status],
            p.proposedDate ?? "", p.validUntil ?? "", p.terms ?? "",
          ])}
        />
        {/* ปุ่มออกใบค่าแฟรนไชส์เอาออก (รอบ 4 · บอสสั่ง 21 ต.ค. 69) — ออกใบได้จากแผงผู้สนใจเป็นดีลเลอร์ที่เดียว
            หน้านี้ = รายการ · ติดตามชำระ · พิมพ์ */}
      </TopbarActions>

      <KpiRow label="สรุปใบค่าแฟรนไชส์" range={ช่วงเดือนนี้}>
        <KpiCard kpi="waiting" label="รอคำตอบ" value={นับ(ค่า(kpi, "waiting"))} rawValue={ค่า(kpi, "waiting")} unit="ใบ · ส่งแล้ว ยังไม่ตอบ" icon={Send}
          actionLabel={statusFilter === "sent" && !ค้างชำระ ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ"}
          onClick={() => { setค้างชำระ(null); setStatusFilter(statusFilter === "sent" ? "all" : "sent"); setPage(0); }} />
        <KpiCard kpi="unpaid" label="ค้างชำระ" value={นับ(ค่า(kpi, "unpaid.count"))} rawValue={ค่า(kpi, "unpaid.count")} unit="ใบ · ตอบรับแล้ว ยังจ่ายไม่ครบ"
          sub={ค่า(kpi, "unpaid.amount") ? `คงค้าง ${บาทเต็ม(ค่า(kpi, "unpaid.amount"))}` : undefined} icon={Wallet} color="#EA580C" bg="#FEF0E6"
          actionLabel={ค้างชำระ && ป้ายชุด === "ค้างชำระ" ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ"} onClick={() => กรองชุด("unpaid", "ค้างชำระ")} />
        <KpiCard kpi="overdue" label="เกินกำหนดชำระ" value={นับ(ค่า(kpi, "overdue.count"))} rawValue={ค่า(kpi, "overdue.count")} unit="ใบ · เลยวันครบกำหนดชำระ"
          sub={ค่า(kpi, "overdue.amount") ? `คงค้าง ${บาทเต็ม(ค่า(kpi, "overdue.amount"))}` : undefined} danger={(ค่า(kpi, "overdue.count") ?? 0) > 0} icon={AlarmClock} color="#DC2626" bg="#FEE2E2"
          actionLabel={ค้างชำระ && ป้ายชุด === "เกินกำหนดชำระ" ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ"} onClick={() => กรองชุด("overdue", "เกินกำหนดชำระ")} />
        <KpiCard kpi="paid" label="รับชำระแล้วเดือนนี้" value={บาทเต็ม(ค่า(kpi, "paid.amount"))} rawValue={ค่า(kpi, "paid.amount")}
          unit={`${นับ(ค่า(kpi, "paid.count")) ?? "—"} รายการรับชำระ`} icon={Coins} color="#16A34A" bg="#E6F7EE"
          actionLabel={ค้างชำระ && ป้ายชุด === "รับชำระเดือนนี้" ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ"} onClick={() => กรองชุด("paid", "รับชำระเดือนนี้")} />
      </KpiRow>

      {/* Toolbar */}
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 16 }}>
        <div className="search-bar">
          <Search size={14} color="#9ca3af" />
          <input aria-label="ค้นหาใบค่าแฟรนไชส์" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="ค้นหาเลขที่ / ผู้สนใจ / จังหวัด..." />
          {q && <button aria-label="ล้างคำค้น" onClick={() => { setQ(""); setPage(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
        </div>
        {ค้างชำระ && (
          <span data-testid="filter-overdue" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "#fef2f2", color: "#b91c1c", fontSize: "0.76rem", fontWeight: 700 }}>
            {ป้ายชุด} ({ค้างชำระ.size})
            <button aria-label="ล้างตัวกรองค้างชำระ" onClick={() => { setค้างชำระ(null); setPage(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#b91c1c", display: "flex", padding: 0 }}><X size={12} /></button>
          </span>
        )}
        <div style={{ flex: 1 }} />
        <select aria-label="กรองตามสถานะใบ" value={statusFilter} onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          <option value="all">ทุกสถานะ</option>
          {PROPOSAL_STATUS_ORDER.map(s => <option key={s} value={s}>{proposalStatusLabel[s]}</option>)}
          <option value="expired">ส่งแล้ว · เลยวันมีผล</option>
        </select>
        <select aria-label="กรองตามแพ็กเกจ" value={packageFilter} onChange={e => { setPackageFilter(e.target.value as typeof packageFilter); setPage(0); }} className="form-select" style={{ width: "auto", cursor: "pointer" }}>
          <option value="all">ทุกแพ็กเกจ</option>
          {PACKAGE_ORDER.map(k => <option key={k} value={k}>{packageLabel[k]}</option>)}
        </select>
      </div>

      {loadErr && (
        <div className="card" role="alert" style={{ padding: "10px 14px", marginBottom: 12, fontSize: "0.8rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", display: "flex", alignItems: "center", gap: 10 }}>
          {loadErr}
          <button className="btn btn-secondary btn-sm" onClick={() => void โหลด()}>ลองใหม่</button>
        </div>
      )}

      {/* ตาราง */}
      <div className="card">
        <div className="table-wrap" style={{ borderTop: "none" }}>
          <table>
            {/* เพิ่ม/ลบคอลัมน์ต้องแก้ colgroup ด้วย (table-layout: fixed) · minWidth รวม ~930px พอดีกรอบจอคอม
                คอลัมน์ปุ่มตรึงขวาสุด — จอแคบเลื่อนตารางได้ แต่ปุ่มยังกดได้เสมอ (มาตรฐานตาราง HQ 26 ส.ค. 69)
                เป้ายอดซื้อ/ระยะสัญญา/พื้นที่ ดูในแผงรายละเอียด — ใส่ครบในตารางแล้วล้นกรอบ (ภาพหน้าจอ 14 ก.ย. 69) */}
            <colgroup>
              <col style={{ width: "13%", minWidth: 124 }} />
              <col style={{ width: "21%", minWidth: 170 }} />
              <col style={{ width: "10%", minWidth: 90 }} />
              <col style={{ width: "11%", minWidth: 104 }} />
              <col style={{ width: "10%", minWidth: 84 }} />
              <col style={{ width: "11%", minWidth: 104 }} />
              <col style={{ width: "11%", minWidth: 104 }} />
              <col style={{ width: "13%", minWidth: 156 }} />
            </colgroup>
            <thead>
              <tr>
                <th>เลขที่</th><th>ผู้สนใจ</th><th>แพ็กเกจ</th><th className="num">ค่าแรกเข้า</th><th>สถานะ</th><th>วันที่เสนอ</th><th>มีผลถึง</th>
                <th style={{ ...ตรึงคอลัมน์ปุ่ม(true), textAlign: "right" }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "36px 14px", color: "#9ca3af", fontSize: "0.8rem" }}>
                  {!loaded ? "กำลังโหลด…" : ใบ.length === 0 ? "ยังไม่มีใบค่าแฟรนไชส์ — ออกใบได้ที่แผงผู้สนใจเป็นดีลเลอร์ (แท็บใบค่าแฟรนไชส์)" : "ไม่พบใบค่าแฟรนไชส์ตามตัวกรองที่เลือก"}
                </td></tr>
              )}
              {pageSlice(filtered, page).map(p => {
                const r = รายตามรหัส.get(p.prospectId);
                const สี = proposalStatusColor[p.status];
                const เลยกำหนด = หมดอายุแล้ว(p, APP_NOW_ISO);
                // คีย์ใช้ p.id ได้: id ไม่ซ้ำทั้งระบบ (identity เดียวทั้งตาราง dealer_package_proposals)
                return (
                  <ClickableRow key={p.id} onActivate={() => setดูรหัส(p.id)} label={`เปิดใบค่าแฟรนไชส์ ${p.proposalNo ?? ""} ของ ${r?.name ?? ""}`}
                    style={{ background: ดูรหัส === p.id ? "#f0f6ff" : undefined }}>
                    <td style={{ fontWeight: 800, color: PRIMARY, whiteSpace: "nowrap", fontFamily: "monospace" }}>{p.proposalNo ?? "—"}</td>
                    <td title={r?.name} style={{ fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r?.name ?? "—"}</td>
                    <td><span className="badge" style={{ background: "#eef3f8", color: PRIMARY }}>{packageLabel[p.package]}</span></td>
                    <td className="num" style={{ fontWeight: 800, color: STEEL, whiteSpace: "nowrap" }}>{มูลค่าอ่านง่าย(p.amount)}</td>
                    <td><span className="badge" style={{ background: สี.bg, color: สี.text }}>{proposalStatusLabel[p.status]}</span></td>
                    <td style={{ fontSize: "0.76rem", color: MUTED, whiteSpace: "nowrap" }}>{p.proposedDate ? fmtISOToThai(p.proposedDate) : "—"}</td>
                    <td style={{ fontSize: "0.76rem", whiteSpace: "nowrap", color: เลยกำหนด ? "#b91c1c" : MUTED, fontWeight: เลยกำหนด ? 700 : undefined }}>
                      {p.validUntil ? fmtISOToThai(p.validUntil) : "—"}
                    </td>
                    <td style={ตรึงคอลัมน์ปุ่ม()} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                        {/* ปุ่มไอคอนล้วนแบบหน้าใบเสนอราคาของดีลเลอร์ — ชี้ค้างเห็นชื่อปุ่ม */}
                        {/* รอบ 4: แถวเหลือ ดู + พิมพ์ — ส่ง/แก้/ลบ ทำที่แผงผู้สนใจ */}
                        {<button onClick={() => setดูรหัส(p.id)} title="ดูรายละเอียด" aria-label={`ดูใบ ${p.proposalNo ?? ""}`} style={ปุ่มไอคอน()}><Eye size={13} /></button>}
                        <button onClick={() => กดพิมพ์(p)} title="พิมพ์ใบค่าแฟรนไชส์" aria-label={`พิมพ์ใบ ${p.proposalNo ?? ""}`} style={ปุ่มไอคอน()} disabled={!r}><Printer size={13} /></button>
                      </div>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
        <TablePagination page={page} total={filtered.length} onPage={setPage} unit="ใบ" />
      </div>

      {/* ══ แผงรายละเอียดใบ — กลางจอ หัวน้ำเงิน แบบหน้าใบเสนอราคาของดีลเลอร์ ══ */}
      {ใบที่ดู && (() => {
        const p = ใบที่ดู;
        const r = รายของใบที่ดู;
        const sc = proposalStatusColor[p.status];
        const qa: React.CSSProperties = { background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, height: 30, padding: "0 11px", cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap", textDecoration: "none" };
        const การ์ด: React.CSSProperties = { background: "#fff", border: "1px solid #eef1f5", borderRadius: 14, padding: 16 };
        const หัวการ์ด: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: "0.62rem", fontWeight: 800, color: "#8a929c", letterSpacing: "0.06em", marginBottom: 12 };
        const termLines = String(p.terms ?? "").split(/\r?\n/).map(t => t.trim()).filter(Boolean);
        return (
          <div onClick={() => setดูรหัส(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
            <ModalCard onClose={() => setดูรหัส(null)} label="รายละเอียดใบค่าแฟรนไชส์"
              style={{ width: 760, maxWidth: "100%", maxHeight: "calc(100vh - 24px)", background: "#fff", borderRadius: 18, boxShadow: "0 30px 90px rgba(0,0,0,.32)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ background: PRIMARY, padding: "14px 20px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", border: "2px solid rgba(255,255,255,.25)", flexShrink: 0 }}>
                      <FileText size={20} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,.65)", fontFamily: "monospace", letterSpacing: "0.05em" }}>{p.proposalNo ?? "—"}</div>
                      <h2 style={{ margin: "2px 0 0", fontSize: "1.08rem", fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{r?.name ?? "—"}</h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: "0.72rem", color: "rgba(255,255,255,.72)", marginTop: 4 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MapPin size={11} /> {พื้นที่ของใบ(p)}</span>
                        {r?.phone && <span>{formatPhone(r.phone) || r.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    {r && <button onClick={() => กดพิมพ์(p)} style={qa}><Printer size={13} /> พิมพ์ PDF</button>}
                    {/* แก้ไข · ทำเวอร์ชันใหม่ · ลบ · เปลี่ยนสถานะ ย้ายไปแผงผู้สนใจที่เดียว (รอบ 4) — ปุ่มลิงก์ "ผู้สนใจ" ด้านขวาพาไป */}
                    {/* เป็นดีลเลอร์แล้ว = ไม่อยู่หน้าผู้สนใจแล้ว (บอสสั่ง 15 ก.ย. 69) → ลิงก์ไปหน้าดีลเลอร์นั้นแทน */}
                    {r && r.status === "won"
                      ? r.dealerCode && <Link href={`/hq/dealers/${r.dealerCode}`} style={qa}><ExternalLink size={13} /> ดีลเลอร์ {r.dealerCode}</Link>
                      : r && <Link href={`/hq/prospects?open=${r.id}`} style={qa}><ExternalLink size={13} /> ผู้สนใจ</Link>}
                    <button onClick={() => setดูรหัส(null)} title="ปิด" aria-label="ปิด" style={{ ...qa, width: 30, padding: 0, justifyContent: "center" }}><X size={15} /></button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                  <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, background: sc.bg, color: sc.text }}>{proposalStatusLabel[p.status]}</span>
                  {(p.version ?? 1) > 1 && <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, background: "rgba(255,255,255,.18)", color: "#fff" }}>เวอร์ชัน {p.version}</span>}
                  {p.closeReason && <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, background: "#fee2e2", color: "#991b1b" }}>เหตุผล: {p.closeReason}</span>}
                  <span style={{ padding: "2px 10px", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, background: "rgba(255,255,255,.18)", color: "#fff" }}>แพ็กเกจ {packageLabel[p.package]}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 99, fontSize: "0.65rem", fontWeight: 800, background: "#fff", color: PRIMARY }}><Coins size={11} /> ค่าแรกเข้า {มูลค่าอ่านง่าย(p.amount)}</span>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: "auto", background: "#f5f7fa", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                {/* สถานะใบ = ดูอย่างเดียว (รอบ 4) — ส่ง/ตอบรับ/ปฏิเสธ ทำที่แผงผู้สนใจที่เดียว */}
                <div style={การ์ด}>
                  <div style={หัวการ์ด}><Send size={13} color={PRIMARY} /> สถานะใบ</div>
                  <div style={{ fontSize: "0.78rem", color: STEEL }}>ตอนนี้: {proposalStatusLabel[p.status]}</div>
                </div>

                <div style={การ์ด}>
                  <div style={หัวการ์ด}><FileText size={13} color={PRIMARY} /> รายละเอียดข้อเสนอ</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0 24px" }}>
                    {([
                      ["แพ็กเกจ", packageLabel[p.package]],
                      ["พื้นที่ที่ได้สิทธิ์", พื้นที่ของใบ(p)],
                      ["ค่าแรกเข้า", มูลค่าอ่านง่าย(p.amount)],
                      ["ระยะสัญญา", ระยะสัญญาอ่านง่าย(p.contractMonths)],
                      ["เป้ายอดซื้อต่อปี", มูลค่าอ่านง่าย(p.annualTarget)],
                      ["วันที่เสนอ", p.proposedDate ? fmtISOToThai(p.proposedDate) : "—"],
                      ["ข้อเสนอมีผลถึง", p.validUntil ? fmtISOToThai(p.validUntil) + (หมดอายุแล้ว(p, APP_NOW_ISO) ? " (เลยกำหนด)" : "") : "—"],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0f4f8", fontSize: "0.78rem" }}>
                        <span style={{ color: "#8a929c" }}>{k}</span><span style={{ fontWeight: 700, color: STEEL, textAlign: "right" }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ใบที่ตอบรับแล้ว: บันทึกการชำระ + วันครบกำหนดชำระ (ปลายทางของกระดิ่ง "เกินกำหนดชำระ" · ใบ 0231) */}
                {p.status === "accepted" && (
                  <div style={การ์ด}>
                    <ProposalPaymentsBox proposal={p} editable={จัดการได้} onChanged={() => void โหลด()} />
                  </div>
                )}

                <div style={การ์ด}>
                  <div style={หัวการ์ด}>เงื่อนไข</div>
                  {termLines.length === 0
                    ? <div style={{ fontSize: "0.78rem", color: "#9ca3af" }}>ไม่ได้ระบุเงื่อนไข</div>
                    : <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", fontSize: "0.8rem", color: STEEL, lineHeight: 1.8 }}>{termLines.map((t, i) => <li key={i}>{t}</li>)}</ul>}
                  {p.note && (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: "#fafbfc", border: "1px solid #f0f4f8", borderRadius: 10, fontSize: "0.75rem", color: "#4b5563", lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 700, color: "#8a929c" }}>หมายเหตุภายใน (ไม่พิมพ์ลงเอกสาร): </span>{p.note}
                    </div>
                  )}
                </div>
              </div>
            </ModalCard>
          </div>
        );
      })()}

    </div>
  );
}
