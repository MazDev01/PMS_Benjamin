"use client";

// ─── HQ · ใบค่าแฟรนไชส์ (หน้ารวมทุกลูกค้าเป้าหมาย) ─────────────────────────────
//
// บอสสั่ง 14 ก.ย. 69:
//   "ทำหน้า ใบค่าแฟรนไชส์ ด้วย"
//   "ให้มีการแสดงในหน้าเดียวแบบดีลเลอร์" · "ใบค่าแฟรนไชส์มันไม่จบแบบหน้าเดียว ให้แบบใช้งานง่าย"
//   → แบบเดียวกับหน้าใบเสนอราคาของดีลเลอร์: ทุกแถวมีปุ่ม ส่ง/ดู/พิมพ์/แก้ไข/ลบ · ดูรายละเอียดเป็นแผงกลางจอ
//     เปลี่ยนสถานะได้ในแผงเลย · ออกใบใหม่เลือกลูกค้าเป้าหมายในฟอร์มเดียว (ไม่ต้องเปิดต่อหลายชั้น)
//
// ⚠️ ห้ามเขียนฟอร์ม/คำสั่งซ้ำในหน้านี้ — ใช้ ProposalFormModal + useProposalActions ชุดเดียวกับหน้าลูกค้าเป้าหมาย
// สิทธิ์: ดูได้ทุกบทบาทฝั่งสำนักงานใหญ่ · ออกใบ/เปลี่ยนสถานะ = ผู้มีสิทธิ์จัดการดีลเลอร์ (RLS 0172 บังคับซ้ำ)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText, Send, CheckCircle2, Percent, Search, X, Plus, Eye, Printer, Pencil, Trash2, MapPin, ExternalLink, Coins, XCircle, CopyPlus,
} from "lucide-react";
import { proposals as proposalsRepo, prospects as prospectsRepo } from "@pms/shared/lib/data";
import type { DealerPackage, DealerPackageProposal, DealerProposalStatus, DealerProspect } from "@pms/shared/lib/data/types";
import {
  PACKAGE_ORDER, PROPOSAL_STATUS_ORDER, packageLabel, proposalStatusLabel, proposalStatusColor,
  มูลค่าอ่านง่าย, ระยะสัญญาอ่านง่าย, หมดอายุแล้ว, ใบล็อกแล้ว, สถานะที่เปลี่ยนไปได้, ทำเวอร์ชันใหม่ได้,
} from "@pms/shared/lib/dealerProposals";
import { ยังติดตามอยู่ } from "@pms/shared/lib/dealerProspects";
import { ProposalFormModal } from "@pms/shared/components/hq/ProposalFormModal";
import { ProposalPaymentsBox } from "@pms/shared/components/hq/ProposalPaymentsBox";
import { useProposalActions } from "@pms/shared/components/hq/useProposalActions";
import { useRole } from "@pms/shared/context/RoleContext";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
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
  const { พิมพ์, เปลี่ยนสถานะ, ทำเวอร์ชันใหม่, ลบใบ } = useProposalActions();

  const [ใบ, setใบ] = useState<DealerPackageProposal[]>([]);
  const [ราย, setราย] = useState<DealerProspect[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "expired" | DealerProposalStatus>("all");
  const [packageFilter, setPackageFilter] = useState<"all" | DealerPackage>("all");
  const [page, setPage] = useState(0);

  const [ดูรหัส, setดูรหัส] = useState<number | null>(null);
  const [ฟอร์ม, setฟอร์ม] = useState<{ editing: DealerPackageProposal | null; prospect: DealerProspect | null } | null>(null);

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
      const id = Number(new URLSearchParams(search).get("open"));
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
      if (statusFilter === "expired" ? !หมดอายุแล้ว(p, APP_NOW_ISO) : statusFilter !== "all" && p.status !== statusFilter) return false;
      if (packageFilter !== "all" && p.package !== packageFilter) return false;
      if (!คำ) return true;
      const r = รายตามรหัส.get(p.prospectId);
      return [p.proposalNo, r?.name, r?.social, p.province, p.region, packageLabel[p.package]]
        .some(v => String(v ?? "").toLowerCase().includes(คำ));
    });
  }, [ใบ, statusFilter, packageFilter, q, รายตามรหัส]);

  // การ์ดคิดจาก "ผลที่กรองอยู่" — ตรงกับตาราง · อัตราตอบรับคิดจากใบที่ได้คำตอบแล้วเท่านั้น (ยังไม่มี = "—")
  const สรุป = useMemo(() => {
    const ตอบรับ = filtered.filter(p => p.status === "accepted").length;
    const ปฏิเสธ = filtered.filter(p => p.status === "rejected").length;
    return {
      ทั้งหมด: filtered.length,
      รอคำตอบ: filtered.filter(p => p.status === "sent").length,
      ตอบรับ,
      อัตราตอบรับ: ตอบรับ + ปฏิเสธ > 0 ? Math.round((ตอบรับ / (ตอบรับ + ปฏิเสธ)) * 100) : null,
    };
  }, [filtered]);

  // ออกใบได้เฉพาะรายที่ยังติดตามอยู่ — รายที่เป็นดีลเลอร์แล้วหรือจบว่าไม่สำเร็จ ไม่มีเหตุให้เสนอแพ็กเกจอีก
  const รายที่ออกใบได้ = useMemo(
    () => ราย.filter(r => ยังติดตามอยู่(r.status)).sort((a, b) => a.name.localeCompare(b.name, "th")),
    [ราย],
  );

  const ใบที่ดู = ดูรหัส == null ? null : ใบ.find(p => p.id === ดูรหัส) ?? null;
  const รายของใบที่ดู = ใบที่ดู ? รายตามรหัส.get(ใบที่ดู.prospectId) ?? null : null;

  // ── คำสั่งในแถว / ในแผง ──
  function แทนใบ(saved: DealerPackageProposal) {
    setใบ(l => l.map(x => x.id === saved.id ? saved : x));
  }
  async function กดเปลี่ยนสถานะ(p: DealerPackageProposal, status: DealerProposalStatus) {
    const r = รายตามรหัส.get(p.prospectId);
    const saved = await เปลี่ยนสถานะ(p, status, r?.name ?? "");
    if (saved) {
      แทนใบ(saved);
      // ส่งใบแล้ว ฐานข้อมูลอาจเลื่อนขั้นลูกค้าเป้าหมายให้ (นัดคุยแล้ว → รอตัดสินใจ) — ดึงรายชื่อใหม่ให้ตรงของจริง
      prospectsRepo.list().then(setราย).catch(() => { /* ตารางใบยังถูกต้อง — ขั้นของรายค่อยตรงตอนโหลดหน้าครั้งถัดไป */ });
    }
  }
  async function กดทำเวอร์ชันใหม่(p: DealerPackageProposal) {
    const r = รายตามรหัส.get(p.prospectId);
    const ใหม่ = await ทำเวอร์ชันใหม่(p, r?.name ?? "");
    if (!ใหม่) return;
    setใบ(l => [ใหม่, ...l]);
    setดูรหัส(null);
    กดแก้ไข(ใหม่);   // เปิดร่างเวอร์ชันใหม่ให้แก้ทันที
  }
  async function กดลบ(p: DealerPackageProposal) {
    const r = รายตามรหัส.get(p.prospectId);
    if (await ลบใบ(p, r?.name ?? "")) {
      setใบ(l => l.filter(x => x.id !== p.id));
      if (ดูรหัส === p.id) setดูรหัส(null);
    }
  }
  function กดพิมพ์(p: DealerPackageProposal) {
    const r = รายตามรหัส.get(p.prospectId);
    if (r) void พิมพ์(p, r);
  }
  function กดแก้ไข(p: DealerPackageProposal) {
    setฟอร์ม({ editing: p, prospect: รายตามรหัส.get(p.prospectId) ?? null });
  }

  return (
    <div className="erp">
      <TopbarActions>
        <ExportMenu
          filename="hq-dealer-package-proposals"
          title="ใบค่าแฟรนไชส์"
          headers={["เลขที่", "ลูกค้าเป้าหมาย", "แพ็กเกจ", "ภาค", "จังหวัด", "ค่าแรกเข้า (บาท)", "ระยะสัญญา (เดือน)", "เป้ายอดซื้อต่อปี (บาท)", "สถานะ", "วันที่เสนอ", "มีผลถึง", "เงื่อนไข"]}
          rows={filtered.map(p => [
            p.proposalNo ?? "", รายตามรหัส.get(p.prospectId)?.name ?? "", packageLabel[p.package], p.region ?? "", p.province ?? "",
            p.amount ?? "", p.contractMonths ?? "", p.annualTarget ?? "", proposalStatusLabel[p.status],
            p.proposedDate ?? "", p.validUntil ?? "", p.terms ?? "",
          ])}
        />
        {จัดการได้ && (
          <button className="btn btn-primary btn-sm" onClick={() => setฟอร์ม({ editing: null, prospect: null })}>
            <Plus size={14} /> ออกใบค่าแฟรนไชส์
          </button>
        )}
      </TopbarActions>

      {/* สรุป — 4 ใบตามกติกากลาง (globals.css: ทุกหน้าใช้ KPI 4 ใบเท่ากัน) */}
      <div className="kpi-bar">
        <div className="kpi"><div className="kpi-icon kpi-navy"><FileText size={16} /></div><div><div className="kpi-val">{สรุป.ทั้งหมด.toLocaleString()}</div><div className="kpi-label">ใบที่แสดงอยู่</div></div></div>
        <div className="kpi"><div className="kpi-icon kpi-navy"><Send size={16} /></div><div><div className="kpi-val">{สรุป.รอคำตอบ.toLocaleString()}</div><div className="kpi-label">ส่งแล้ว รอคำตอบ</div></div></div>
        <div className="kpi"><div className="kpi-icon kpi-green"><CheckCircle2 size={16} /></div><div><div className="kpi-val">{สรุป.ตอบรับ.toLocaleString()}</div><div className="kpi-label">ตอบรับ</div></div></div>
        <div className="kpi"><div className="kpi-icon kpi-green"><Percent size={16} /></div><div><div className="kpi-val">{สรุป.อัตราตอบรับ === null ? "—" : `${สรุป.อัตราตอบรับ}%`}</div><div className="kpi-label">อัตราตอบรับ (จากใบที่ได้คำตอบแล้ว)</div></div></div>
      </div>

      {/* Toolbar */}
      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", marginBottom: 16 }}>
        <div className="search-bar">
          <Search size={14} color="#9ca3af" />
          <input aria-label="ค้นหาใบค่าแฟรนไชส์" value={q} onChange={e => { setQ(e.target.value); setPage(0); }} placeholder="ค้นหาเลขที่ / ลูกค้าเป้าหมาย / จังหวัด..." />
          {q && <button aria-label="ล้างคำค้น" onClick={() => { setQ(""); setPage(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", display: "flex", padding: 0 }}><X size={13} /></button>}
        </div>
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
                <th>เลขที่</th><th>ลูกค้าเป้าหมาย</th><th>แพ็กเกจ</th><th className="num">ค่าแรกเข้า</th><th>สถานะ</th><th>วันที่เสนอ</th><th>มีผลถึง</th>
                <th style={{ ...ตรึงคอลัมน์ปุ่ม(true), textAlign: "right" }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "36px 14px", color: "#9ca3af", fontSize: "0.8rem" }}>
                  {!loaded ? "กำลังโหลด…" : ใบ.length === 0 ? "ยังไม่มีใบค่าแฟรนไชส์ — กด “ออกใบค่าแฟรนไชส์” มุมขวาบน" : "ไม่พบใบค่าแฟรนไชส์ตามตัวกรองที่เลือก"}
                </td></tr>
              )}
              {pageSlice(filtered, page).map(p => {
                const r = รายตามรหัส.get(p.prospectId);
                const สี = proposalStatusColor[p.status];
                const เลยกำหนด = หมดอายุแล้ว(p, APP_NOW_ISO);
                const ล็อก = ใบล็อกแล้ว(p.status);
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
                        {จัดการได้ && p.status === "draft" && (
                          <button onClick={() => void กดเปลี่ยนสถานะ(p, "sent")} title="เปลี่ยนเป็นส่งแล้ว" aria-label={`ส่งใบ ${p.proposalNo ?? ""}`}
                            style={{ ...ปุ่มไอคอน(), border: "none", background: "#d97706", color: "#fff" }}><Send size={12} /></button>
                        )}
                        {/* แถวใบร่างมีไม่เกิน 2 ปุ่ม: ส่ง + พิมพ์ (ขั้นที่พาใบร่างเดินต่อ) — ดู/แก้ไข/ลบ อยู่ในแผงรายละเอียด (กดแถว)
                            รอบ 3 · บอสสั่ง 20 ต.ค. 69 · ข้อทดสอบ hq-proposals.spec.ts */}
                        {p.status !== "draft" && <button onClick={() => setดูรหัส(p.id)} title="ดูรายละเอียด" aria-label={`ดูใบ ${p.proposalNo ?? ""}`} style={ปุ่มไอคอน()}><Eye size={13} /></button>}
                        <button onClick={() => กดพิมพ์(p)} title="พิมพ์ใบค่าแฟรนไชส์" aria-label={`พิมพ์ใบ ${p.proposalNo ?? ""}`} style={ปุ่มไอคอน()} disabled={!r}><Printer size={13} /></button>
                        {จัดการได้ && p.status !== "draft" && (
                          <>
                            <button onClick={() => !ล็อก && กดแก้ไข(p)} disabled={ล็อก} aria-label={`แก้ไขใบ ${p.proposalNo ?? ""}`}
                              title={ล็อก ? "ใบที่ส่งแล้วแก้ไม่ได้ — ถ้าเงื่อนไขเปลี่ยนให้ออกใบใหม่" : "แก้ไข"}
                              style={{ ...ปุ่มไอคอน(), ...(ล็อก ? ปุ่มปิดใช้ : {}) }}><Pencil size={13} /></button>
                            <button onClick={() => !ล็อก && void กดลบ(p)} disabled={ล็อก} aria-label={`ลบใบ ${p.proposalNo ?? ""}`}
                              title={ล็อก ? "ใบที่ส่งแล้วลบไม่ได้ — ต้องเก็บไว้เป็นหลักฐาน" : "ลบใบร่าง"}
                              style={{ ...ปุ่มไอคอน(true), ...(ล็อก ? ปุ่มปิดใช้ : {}) }}><Trash2 size={13} /></button>
                          </>
                        )}
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
        const ล็อก = ใบล็อกแล้ว(p.status);
        const ไปต่อได้ = สถานะที่เปลี่ยนไปได้(p.status).filter(s => s !== p.status);
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
                    {จัดการได้ && !ล็อก && <button onClick={() => กดแก้ไข(p)} style={qa}><Pencil size={13} /> แก้ไข</button>}
                    {จัดการได้ && ทำเวอร์ชันใหม่ได้(p, ใบ) && <button onClick={() => void กดทำเวอร์ชันใหม่(p)} style={qa}><CopyPlus size={13} /> ทำเวอร์ชันใหม่</button>}
                    {/* เป็นดีลเลอร์แล้ว = ไม่อยู่หน้าลูกค้าเป้าหมายแล้ว (บอสสั่ง 15 ก.ย. 69) → ลิงก์ไปหน้าดีลเลอร์นั้นแทน */}
                    {r && r.status === "won"
                      ? r.dealerCode && <Link href={`/hq/dealers/${r.dealerCode}`} style={qa}><ExternalLink size={13} /> ดีลเลอร์ {r.dealerCode}</Link>
                      : r && <Link href={`/hq/prospects?open=${r.id}`} style={qa}><ExternalLink size={13} /> ลูกค้าเป้าหมาย</Link>}
                    {จัดการได้ && !ล็อก && <button onClick={() => void กดลบ(p)} title="ลบใบร่าง" aria-label="ลบใบร่าง" style={{ ...qa, width: 30, padding: 0, justifyContent: "center", color: "#fecaca" }}><Trash2 size={14} /></button>}
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
                {/* สถานะใบ — ขั้นถัดไปกดได้ในแผงเลย ไม่ต้องไปหาที่อื่น */}
                <div style={การ์ด}>
                  <div style={หัวการ์ด}><Send size={13} color={PRIMARY} /> สถานะใบ</div>
                  {ไปต่อได้.length === 0 ? (
                    <div style={{ fontSize: "0.78rem", color: MUTED }}>ใบนี้{proposalStatusLabel[p.status]}แล้ว — จบขั้นตอนของใบนี้</div>
                  ) : !จัดการได้ ? (
                    <div style={{ fontSize: "0.78rem", color: MUTED }}>ตอนนี้: {proposalStatusLabel[p.status]}</div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.78rem", color: STEEL, flex: "1 1 200px" }}>
                        {p.status === "draft" ? "พิมพ์ส่งให้ผู้สนใจแล้ว กด “ส่งแล้ว” — หลังจากนั้นแก้เนื้อหาในใบไม่ได้" : "ผู้สนใจตอบกลับแล้ว บันทึกคำตอบ"}
                      </span>
                      {ไปต่อได้.map(s => (
                        <button key={s} className="btn btn-sm" onClick={() => void กดเปลี่ยนสถานะ(p, s)}
                          style={s === "rejected"
                            ? { background: "#fff", color: "#dc2626", border: "1px solid #fecaca" }
                            : { background: s === "accepted" ? "#059669" : "#d97706", color: "#fff" }}>
                          {s === "sent" ? <Send size={13} /> : s === "accepted" ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {" "}{s === "sent" ? "ส่งแล้ว" : proposalStatusLabel[s]}
                        </button>
                      ))}
                    </div>
                  )}
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

      {/* ── ฟอร์มออก/แก้ใบ — ออกใหม่เลือกลูกค้าเป้าหมายในฟอร์มเดียว ── */}
      {ฟอร์ม && (
        <ProposalFormModal
          prospect={ฟอร์ม.prospect}
          choices={ฟอร์ม.prospect ? undefined : รายที่ออกใบได้}
          editing={ฟอร์ม.editing}
          onClose={() => setฟอร์ม(null)}
          onSaved={saved => {
            if (ฟอร์ม.editing) แทนใบ(saved); else setใบ(l => [saved, ...l]);
            setฟอร์ม(null);
            // ออกใบเสร็จ เปิดแผงของใบนั้นให้เลย — ขั้นต่อไป (พิมพ์ / ส่งแล้ว) กดต่อได้ทันที
            setดูรหัส(saved.id);
          }}
        />
      )}
    </div>
  );
}
