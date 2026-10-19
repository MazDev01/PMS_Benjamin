"use client";

// ── แถบขั้นตอน + กล่อง "ขั้นต่อไป" ในแผงลูกค้าเป้าหมาย (UI ตาม flow · หน้า 3 · บอสอนุมัติ 16 ต.ค. 69) ─────────────
//
// ปัญหาที่แก้: flow ใหม่ (ขอราคา → HQ ตีราคา → ทำใบ → ส่ง → ลูกค้าตอบ) ซ่อนอยู่ในแท็บ "ใบเสนอราคา"
//   ดีลเลอร์ดูไม่ออกว่าตอนนี้อยู่ขั้นไหน ต้องทำอะไรต่อ
// ตัวตัดสินอยู่ที่ lib/leadNextStep.ts ที่เดียว — ที่นี่แค่ดึงสถานะจริง (คำขอล่าสุด · ใบ HQ · ใบลูกค้าล่าสุด) แล้ววาด
// ปุ่มพาไปทางเดิมที่มีอยู่ (ไม่สร้างทางทำงานซ้ำ): ผู้เรียกส่งตัวจัดการแต่ละชนิดเข้ามา
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { quoteRequests as repo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { useSales } from "@pms/shared/context/SalesContext";
import { ขั้นต่อไป, ขั้นทั้งหมด, type NextStepAction } from "@pms/shared/lib/leadNextStep";
import type { HqQuote, QuoteRequest } from "@pms/shared/lib/quoteRequests";
import type { LeadRow, QuotationMock } from "@pms/shared/lib/mock";

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — เกณฑ์เดียวกับฐานตอนตรวจราคา HQ หมดอายุ */
const วันนี้ไทย = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export function LeadNextStep({ lead, onAction }: {
  lead: LeadRow;
  /** ตัวจัดการปุ่ม — quoteId = ใบลูกค้าล่าสุด (ส่งให้ลูกค้า / บันทึกผลจากลูกค้า) */
  onAction: (kind: NextStepAction["kind"], quoteId?: string) => void;
}) {
  const { quotations } = useSales();
  const [คำขอ, setคำขอ] = useState<QuoteRequest | null | undefined>(undefined);
  const [ใบHQ, setใบHQ] = useState<HqQuote | null>(null);
  const dealerCode = dealerCodeOf(lead);

  // ดึงใหม่เมื่อขั้นของลีดเปลี่ยน (ส่งคำขอ / HQ ส่งใบ / ปิดงาน ทำให้ขั้นเปลี่ยนเสมอ)
  useEffect(() => {
    if (!REAL_BACKEND || !dealerCode || lead.numId == null) { setคำขอ(null); return; }
    let alive = true;
    repo.listForLead(dealerCode, lead.numId)
      .then(rs => { if (alive) setคำขอ(rs[0] ?? null); })
      .catch(e => { logRepoRead("quoteRequests.listForLead(next-step)", e); if (alive) setคำขอ(null); });
    return () => { alive = false; };
  }, [dealerCode, lead.numId, lead.status]);
  useEffect(() => {
    if (คำขอ?.status !== "quoted") { setใบHQ(null); return; }
    let alive = true;
    repo.hqQuoteFor(คำขอ.id).then(h => { if (alive) setใบHQ(h); })
      .catch(e => logRepoRead("quoteRequests.hqQuoteFor(next-step)", e));
    return () => { alive = false; };
  }, [คำขอ]);

  // ใบลูกค้าล่าสุดของดีลนี้ (สาขาเดียวกันเท่านั้น — SalesContext มีใบทั้งเครือ)
  const ใบล่าสุด = useMemo<QuotationMock | null>(() => {
    const ของดีล = quotations.filter(q => q.dealId === lead.numId && dealerCodeOf(q) === dealerCode);
    return ของดีล.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id.localeCompare(a.id, "en", { numeric: true }))[0] ?? null;
  }, [quotations, lead.numId, dealerCode]);

  // ยังโหลดไม่เสร็จ — ไม่เดาขั้น แต่จองพื้นที่ขนาดเท่าของจริงไว้ก่อน
  //   เดิมคืน null แล้วกล่องโผล่ทีหลัง ดันเนื้อหาข้างล่างลง = กดปุ่มในแท็บพลาดเป้าได้ (เจอในรอบเต็ม 16 ต.ค. 69: กดสร้างใบแล้วไม่เกิดอะไร)
  if (คำขอ === undefined) {
    return (
      <div data-panel="next-step" aria-busy="true" style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          {ขั้นทั้งหมด.map(ชื่อ => (
            <div key={ชื่อ} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ height: 5, borderRadius: 99, background: "#e5e7eb" }} />
              <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ชื่อ}</div>
            </div>
          ))}
        </div>
        <div style={{ minHeight: 62, boxSizing: "border-box", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "10px 14px", fontSize: "0.74rem", color: "#9ca3af", display: "flex", alignItems: "center" }}>
          กำลังโหลดขั้นต่อไป…
        </div>
      </div>
    );
  }
  const ขั้น = ขั้นต่อไป({
    leadStatus: lead.status,
    request: คำขอ ? { status: คำขอ.status, dueAt: คำขอ.dueAt } : null,
    hqQuote: ใบHQ ? { status: ใบHQ.status, validUntil: ใบHQ.validUntil } : null,
    quote: ใบล่าสุด ? { status: ใบล่าสุด.status } : null,
    today: วันนี้ไทย(),
  });
  const จบแล้ว = ขั้น.key === "won" || ขั้น.key === "lost";
  const สีกล่อง = ขั้น.key === "lost" ? { bg: "#f3f4f6", line: "#d1d5db", text: "#374151" }
    : ขั้น.key === "won" ? { bg: "#ecfdf5", line: "#059669", text: "#065f46" }
    : ขั้น.action ? { bg: "#fff4e5", line: "#b45309", text: "#7c3d06" }
    : { bg: "#eef3f8", line: "#9fb3c8", text: "#003366" };

  return (
    <div data-panel="next-step" style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <ol aria-label="ขั้นตอนการขาย" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
        {ขั้นทั้งหมด.map((ชื่อ, i) => {
          const ที่ = i + 1;
          const เสร็จ = จบแล้ว ? ขั้น.key === "won" || ที่ < ขั้น.step : ที่ < ขั้น.step;
          const ตอนนี้ = !จบแล้ว && ที่ === ขั้น.step;
          return (
            <li key={ชื่อ} aria-current={ตอนนี้ ? "step" : undefined} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <div style={{ height: 5, borderRadius: 99, background: เสร็จ ? "#003366" : ตอนนี้ ? "#d97706" : "#e5e7eb" }} />
              <div style={{ fontSize: "0.68rem", fontWeight: ตอนนี้ ? 800 : 600, color: ตอนนี้ ? "#b45309" : เสร็จ ? "#003366" : "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {เสร็จ && <Check size={10} style={{ verticalAlign: "-1px", marginRight: 2 }} />}{ที่} · {ชื่อ}
              </div>
            </li>
          );
        })}
      </ol>
      <div role="status" aria-label="ขั้นต่อไป" style={{ minHeight: 62, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: สีกล่อง.bg, border: `1px solid ${สีกล่อง.line}`, borderRadius: 12, padding: "10px 14px" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <div style={{ fontSize: "0.66rem", fontWeight: 700, color: สีกล่อง.text, opacity: 0.85 }}>{จบแล้ว ? "สถานะ" : "ขั้นต่อไป"}</div>
          <div style={{ fontSize: "0.92rem", fontWeight: 800, color: สีกล่อง.text }}>{ขั้น.title}</div>
          <div style={{ fontSize: "0.74rem", color: สีกล่อง.text }}>{ขั้น.detail}</div>
        </div>
        {ขั้น.action && (
          <button type="button" data-next-step={ขั้น.key} onClick={() => onAction(ขั้น.action!.kind, ใบล่าสุด?.id)}
            style={{ height: 40, padding: "0 16px", border: "none", borderRadius: 10, background: "#b45309", color: "#fff", fontFamily: "inherit", fontSize: "0.84rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {ขั้น.action.label} <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
