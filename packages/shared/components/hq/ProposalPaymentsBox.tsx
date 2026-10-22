"use client";

// ── บันทึกการชำระของใบค่าแฟรนไชส์ที่ตอบรับแล้ว (ด่าน 4 · FLOW: ตกลง + ชำระ · บอสตัดสิน 15 ต.ค. 69 · 0208) ──────────────
//   บันทึกได้หลายงวด (วันที่ · ยอด > 0 · เลขอ้างอิง) เฉพาะ HQ · แก้/ลบไม่ได้ ผิดให้ "ยกเลิกพร้อมเหตุผล" แล้วบันทึกใหม่
//   ยอดที่ยกเลิกไม่นับ · แปลงเป็นดีลเลอร์ได้เมื่อยอดชำระรวม ≥ ยอดในใบ (ฐานข้อมูลบังคับ)
import React, { useCallback, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { proposals as proposalsRepo } from "@pms/shared/lib/data";
import type { DealerPackageProposal, DealerProposalPayment } from "@pms/shared/lib/data/types";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { formatMoneyInput, parseMoneyInput } from "@pms/shared/lib/format";
import { ถามเหตุผล, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { useAuditLogger } from "@pms/shared/lib/useAudit";

const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ProposalPaymentsBox({ proposal, editable, onChanged }: {
  proposal: DealerPackageProposal;
  /** ผู้มีสิทธิ์จัดการดีลเลอร์ — ไม่มีสิทธิ์ = ดูอย่างเดียว */
  editable: boolean;
  /** ยอดชำระเปลี่ยน — ให้หน้าแม่ตรวจความพร้อมแปลงใหม่ */
  onChanged?: () => void;
}) {
  const logAudit = useAuditLogger();
  const [list, setList] = useState<DealerProposalPayment[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [วันที่, setวันที่] = useState(APP_NOW_ISO.slice(0, 10));
  const [ยอด, setยอด] = useState(0);
  const [อ้างอิง, setอ้างอิง] = useState("");
  const [busy, setBusy] = useState(false);
  // วันครบกำหนดชำระ (ใบ 0231 · บอสตัดสิน 21 ต.ค. 69) — เลยแล้วยังชำระไม่ครบ = กระดิ่ง HQ "ใบค่าแฟรนไชส์เกินกำหนดชำระ"
  const [กำหนด, setกำหนด] = useState(proposal.paymentDueOn ?? "");
  useEffect(() => { setกำหนด(proposal.paymentDueOn ?? ""); }, [proposal.paymentDueOn]);
  async function ตั้งกำหนด(v: string) {
    setกำหนด(v);
    try {
      await proposalsRepo.setPaymentDue(proposal.id, v || null);
      logAudit("ตั้งวันครบกำหนดชำระค่าแฟรนไชส์", `${proposal.proposalNo ?? ""} · ${v ? fmtISOToThai(v) : "ล้างวัน"}`);
      onChanged?.();
    } catch (e) { setกำหนด(proposal.paymentDueOn ?? ""); แจ้งพลาด(friendlyError(e, "บันทึกวันครบกำหนดชำระไม่สำเร็จ")); }
  }

  const โหลด = useCallback(async () => {
    try { setList(await proposalsRepo.payments(proposal.id)); setLoadErr(""); }
    catch (e) { setLoadErr(friendlyError(e, "โหลดบันทึกการชำระไม่สำเร็จ")); }
  }, [proposal.id]);
  useEffect(() => { void โหลด(); }, [โหลด]);

  const ยอดในใบ = Number(proposal.amount ?? 0);
  const ชำระแล้ว = (list ?? []).filter(x => !x.cancelledAt).reduce((s, x) => s + x.amount, 0);
  const ครบ = list != null && ชำระแล้ว >= ยอดในใบ;

  async function บันทึก() {
    if (!(ยอด > 0)) { แจ้งพลาด("ยอดชำระต้องมากกว่า 0"); return; }
    if (!อ้างอิง.trim()) { แจ้งพลาด("ต้องระบุเลขอ้างอิงการชำระ"); return; }
    if (!วันที่) { แจ้งพลาด("ต้องระบุวันที่ชำระ"); return; }
    setBusy(true);
    try {
      const row = await proposalsRepo.addPayment({ proposalId: proposal.id, paidOn: วันที่, amount: ยอด, reference: อ้างอิง.trim() });
      setList(l => [...(l ?? []), row]);
      setยอด(0); setอ้างอิง("");
      logAudit("บันทึกการชำระค่าแฟรนไชส์", `${proposal.proposalNo ?? ""} · ${บาท(row.amount)} บาท · ${row.reference}`);
      แจ้งสำเร็จ(`บันทึกการชำระ ${บาท(row.amount)} บาท แล้ว`);
      onChanged?.();
    } catch (e) { แจ้งพลาด(friendlyError(e, "บันทึกการชำระไม่สำเร็จ")); }
    finally { setBusy(false); }
  }

  async function ยกเลิก(x: DealerProposalPayment) {
    const เหตุผล = await ถามเหตุผล({
      หัวข้อ: `ยกเลิกการชำระ ${บาท(x.amount)} บาท (${x.reference}) ?`,
      รายละเอียด: "บันทึกการชำระแก้/ลบไม่ได้ — ยกเลิกแล้วยอดนี้ไม่นับ ถ้าบันทึกผิดให้บันทึกใหม่",
      ป้ายช่อง: "เหตุผลที่ยกเลิก", ปุ่มตกลง: "ยกเลิกการชำระ", อันตราย: true,
    });
    if (เหตุผล == null) return;
    try {
      const row = await proposalsRepo.cancelPayment(x.id, เหตุผล);
      setList(l => (l ?? []).map(y => y.id === row.id ? row : y));
      logAudit("ยกเลิกการชำระค่าแฟรนไชส์", `${proposal.proposalNo ?? ""} · ${บาท(x.amount)} บาท · ${เหตุผล}`);
      onChanged?.();
    } catch (e) { แจ้งพลาด(friendlyError(e, "ยกเลิกการชำระไม่สำเร็จ")); }
  }

  const ช่อง: React.CSSProperties = { padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: "0.76rem", fontFamily: "inherit" };
  return (
    <div role="region" aria-label={`การชำระ ${proposal.proposalNo ?? ""}`} style={{ flexBasis: "100%", borderTop: "1px dashed #e5e7eb", paddingTop: 8, marginTop: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.74rem", fontWeight: 700, color: "#374151" }}>
        <Wallet size={13} /> การชำระ
        <span data-testid={`ยอดชำระ-${proposal.proposalNo ?? ""}`} style={{ fontWeight: 600, color: ครบ ? "#15803d" : "#92400e" }}>
          {list == null ? "…" : `ชำระแล้ว ${บาท(ชำระแล้ว)} / ${บาท(ยอดในใบ)} บาท${ครบ ? " · ครบแล้ว" : ` · ค้าง ${บาท(ยอดในใบ - ชำระแล้ว)}`}`}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: "#374151", marginTop: 4 }}>
        ครบกำหนดชำระ
        {editable
          ? <input type="date" aria-label="วันครบกำหนดชำระ" value={กำหนด} onChange={e => void ตั้งกำหนด(e.target.value)} style={ช่อง} />
          : <span>{กำหนด ? fmtISOToThai(กำหนด) : "—"}</span>}
        {กำหนด && !ครบ && list != null && กำหนด < APP_NOW_ISO.slice(0, 10) && <span style={{ color: "#b91c1c", fontWeight: 700 }}>เกินกำหนดแล้ว</span>}
      </div>
      {loadErr && <div role="alert" style={{ fontSize: "0.72rem", color: "#b91c1c" }}>{loadErr}</div>}
      {(list ?? []).map(x => (
        <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: x.cancelledAt ? "#9ca3af" : "#374151", marginTop: 3 }}>
          <span style={{ textDecoration: x.cancelledAt ? "line-through" : "none" }}>
            {fmtISOToThai(x.paidOn)} · {บาท(x.amount)} บาท · อ้างอิง {x.reference}{x.createdByName ? ` · ${x.createdByName}` : ""}
          </span>
          {x.cancelledAt
            ? <span style={{ color: "#991b1b" }}>ยกเลิกแล้ว: {x.cancelReason}</span>
            : editable && <button type="button" className="btn btn-sm" aria-label={`ยกเลิกการชำระ ${x.reference}`} onClick={() => void ยกเลิก(x)}
                style={{ padding: "1px 8px", fontSize: "0.68rem", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>ยกเลิก</button>}
        </div>
      ))}
      {editable && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
          <input type="date" aria-label="วันที่ชำระ" value={วันที่} onChange={e => setวันที่(e.target.value)} style={ช่อง} disabled={busy} />
          <input type="text" inputMode="numeric" aria-label="ยอดชำระ" placeholder="ยอด (บาท)" style={{ ...ช่อง, width: 120 }} disabled={busy}
            value={ยอด ? formatMoneyInput(String(ยอด)) : ""} onChange={e => setยอด(parseMoneyInput(e.target.value))} />
          <input type="text" aria-label="เลขอ้างอิง" placeholder="เลขอ้างอิง เช่น เลขที่โอน" style={{ ...ช่อง, width: 170 }} disabled={busy}
            value={อ้างอิง} onChange={e => setอ้างอิง(e.target.value)} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void บันทึก()}>บันทึกการชำระ</button>
        </div>
      )}
    </div>
  );
}
