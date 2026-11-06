"use client";

// ── แถบ 5 ขั้น + กล่อง "ขั้นต่อไป" ในแผงลูกค้าเป้าหมาย (หน้า 3 · 16 ต.ค. 69 · รอบ 4 21 ต.ค. 69) ─────────────────────────
//
// รอบ 4 (บอสสั่ง): สถานะของลีดเหลือที่เดียว = แถบ 5 ขั้นนี้ (ป้ายสถานะบนหัวแผงเอาออก) · แถบไฮไลต์ "ขั้นที่อยู่ตอนนี้"
//   กล่องขั้นต่อไป = ทางเดียวที่ดีลเลอร์ขยับลีด: ปุ่มหลักหนึ่งปุ่ม (ทำงานในแผง) + "ปิดไม่สำเร็จ" ที่เดียว
//   ขั้นของแถบ → lib/leadStage.ts · ปุ่มของกล่อง → lib/leadNextStep.ts (ที่นี่แค่ดึงข้อมูลจริงแล้ววาด)
// ปิดไม่สำเร็จระหว่างรอราคา HQ = ยกเลิกคำขอพร้อมปิดลีด (ฐานไม่ให้เปลี่ยนสถานะเองระหว่างรอ · ใบ 0183)
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, XCircle } from "lucide-react";
import { quoteRequests as repo } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { useSales } from "@pms/shared/context/SalesContext";
import { ขั้นต่อไป, type NextStepAction } from "@pms/shared/lib/leadNextStep";
import { ชื่อขั้น, ชื่อขั้นการขาย, สภาพแถบขั้น, สีแถบขั้น, type เลขขั้น } from "@pms/shared/lib/leadStage";
import { ถามเหตุผล, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { useLostReasons } from "@pms/shared/lib/useHQConfig";
import { quoteBelongsToLead } from "@pms/shared/lib/leadQuote";
import type { HqQuote, QuoteRequest } from "@pms/shared/lib/quoteRequests";
import type { LeadRow, QuotationMock } from "@pms/shared/lib/mock";
import { useDealerSettings } from "@pms/shared/lib/useDealerSettings";
import { ข้อมูลบริษัทที่ขาด } from "@pms/shared/lib/issuerComplete";
import { IssuerGuardNote } from "@pms/shared/components/ui/IssuerGuardNote";

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — เกณฑ์เดียวกับฐานตอนตรวจราคา HQ หมดอายุ */
const วันนี้ไทย = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

/** คำสั่งจากบอร์ดลีด (ลากการ์ด · ปุ่ม "ย้ายไปขั้น…" · บอสสั่ง 5 พ.ย. 69) — n เปลี่ยน = สั่งใหม่
 *  ถัดไป = ปุ่มหลักของกล่องนี้ · ปิดสำเร็จ = บันทึกผลจากลูกค้า (ตอบรับที่ใบ · L2) · ปิดไม่สำเร็จ = กล่องเหตุผล หรือ "ลูกค้าปฏิเสธ" ที่ใบเมื่อส่งใบแล้ว (L3)
 *  ตัดสินจากขั้นต่อไป() ตัวเดียวกับปุ่ม — ไม่มีทางไปต่อ = บอกเหตุผล ไม่เดา */
export type คำสั่งบอร์ดลีด = { เป้า: "ถัดไป" | "ปิดสำเร็จ" | "ปิดไม่สำเร็จ" | "งาน"; n: number; /** เป้า "งาน" = กดงานในแต่ละขั้นที่ยังไม่ติ๊ก (บอสสั่ง 6 พ.ย. 69) */ งาน?: string };
/** งานในแต่ละขั้น → ปุ่มของกล่องขั้นต่อไปที่ทำงานนั้น (ทางเดียวกับบอร์ด) · ไม่ตรงกับขั้นตอนนี้ = บอกเหตุผล ไม่เดา */
const ปุ่มของงาน: Record<string, NextStepAction["kind"][]> = {
  requestQuote: ["request_quote", "reprice"], hqQuote: ["request_quote", "reprice"], makeQuote: ["make_quote"], sendQuote: ["send_quote"],
};

export function LeadNextStep({ lead, onAction, onLost, onRequests, คำสั่ง }: {
  lead: LeadRow;
  /** คำสั่งจากบอร์ดลีด — ทำเมื่อโหลดคำขอ/ใบ HQ ครบแล้ว ครั้งเดียวต่อ n */
  คำสั่ง?: คำสั่งบอร์ดลีด | null;
  /** ปุ่มหลัก — quoteId = ใบลูกค้าที่เกี่ยว (ใบร่างที่จะส่ง / ใบที่รอลูกค้าตอบ) */
  onAction: (kind: NextStepAction["kind"] | "ดูคำขอ", quoteId?: string) => void;
  /** ปิดไม่สำเร็จ — ยกเลิกคำขอแล้ว = ฐานปิดลีดให้แล้ว ผู้เรียกแค่ดึงลีดใหม่ · ไม่ใช่ = บันทึกผ่านตัวกลางบันทึกลีด · โยน = แสดงข้อความในกล่อง */
  onLost: (reason: string, ยกเลิกคำขอแล้ว: boolean) => Promise<void>;
  /** คำขอราคาทั้งหมดของลีด (หลังโหลด) — แผงใช้ตัดสินปุ่มลบลีด */
  onRequests?: (rs: QuoteRequest[]) => void;
}) {
  const { quotations } = useSales();
  // ข้อมูลบริษัทของสาขา — ส่งใบให้ลูกค้าต้องครบ (ใบ 0247 · ฐานกัน) · ยังโหลดไม่เสร็จ = ไม่ปิดปุ่ม
  const ตั้งค่าสาขา = useDealerSettings();
  const [คำขอทั้งหมด, setคำขอทั้งหมด] = useState<QuoteRequest[] | undefined>(undefined);
  const [ใบHQ, setใบHQ] = useState<HqQuote | null>(null);
  const [ใบHQพร้อม, setใบHQพร้อม] = useState(false);   // คำสั่งจากบอร์ดรอผลใบ HQ (ราคาหมดอายุ? · L4) ไม่เดา
  const lostReasons = useLostReasons();
  const [รอบ, setรอบ] = useState(0);
  const dealerCode = dealerCodeOf(lead);

  // ดึงใหม่เมื่อขั้นของลีดเปลี่ยน (ส่งคำขอ / HQ ส่งใบ / ปิดงาน ทำให้ขั้นเปลี่ยนเสมอ)
  useEffect(() => {
    if (!REAL_BACKEND || !dealerCode || lead.numId == null) { setคำขอทั้งหมด([]); onRequests?.([]); return; }
    let alive = true;
    repo.listForLead(dealerCode, lead.numId)
      .then(rs => { if (alive) { setคำขอทั้งหมด(rs); onRequests?.(rs); } })
      .catch(e => { logRepoRead("quoteRequests.listForLead(next-step)", e); if (alive) setคำขอทั้งหมด([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerCode, lead.numId, lead.status, รอบ]);
  const คำขอ = คำขอทั้งหมด?.[0] ?? null;
  useEffect(() => {
    if (คำขอ?.status !== "quoted") { setใบHQ(null); setใบHQพร้อม(true); return; }
    let alive = true;
    setใบHQพร้อม(false);
    repo.hqQuoteFor(คำขอ.id).then(h => { if (alive) { setใบHQ(h); setใบHQพร้อม(true); } })
      .catch(e => { logRepoRead("quoteRequests.hqQuoteFor(next-step)", e); if (alive) setใบHQพร้อม(true); });
    return () => { alive = false; };
  }, [คำขอ]);

  // ใบลูกค้าทุกใบของดีลนี้ (สาขาเดียวกันเท่านั้น — SalesContext มีใบทั้งเครือ) · ใหม่สุดก่อน
  const ใบของดีล = useMemo<QuotationMock[]>(() =>
    quotations.filter(q => dealerCodeOf(q) === dealerCode && (q.dealId === lead.numId || (q.dealId == null && quoteBelongsToLead(q, lead))))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id.localeCompare(a.id, "en", { numeric: true })),
  [quotations, lead, dealerCode]);
  const ใบล่าสุด = ใบของดีล[0] ?? null;
  const ใบที่ส่งอยู่ = ใบของดีล.find(q => q.status === "sent_to_client") ?? null;
  // คำสั่งจากบอร์ด: ทำเมื่อโหลดครบ ครั้งเดียวต่อ n (ตัวทำตั้งหลังคิดขั้นต่อไปด้านล่าง)
  const ทำคำสั่ง = useRef<(() => void) | null>(null);
  const ทำแล้ว = useRef(0);
  useEffect(() => {
    if (!คำสั่ง || คำสั่ง.n === ทำแล้ว.current || คำขอทั้งหมด === undefined || !ใบHQพร้อม || !ทำคำสั่ง.current) return;
    ทำแล้ว.current = คำสั่ง.n;
    ทำคำสั่ง.current();
  });

  // ยังโหลดไม่เสร็จ — ไม่เดาขั้น แต่จองพื้นที่ขนาดเท่าของจริงไว้ก่อน (กล่องโผล่ทีหลังดันเนื้อหา = กดปุ่มในแท็บพลาดเป้า · 16 ต.ค. 69)
  if (คำขอทั้งหมด === undefined) {
    return (
      <div data-panel="next-step" aria-busy="true" style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
          {ชื่อขั้นการขาย.map(ชื่อ => (
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
  const แถบ = สภาพแถบขั้น(lead.status, ใบของดีล.some(q => q.status === "draft"), {
    คำขอ: คำขอทั้งหมด.map(r => r.status), ใบลูกค้า: ใบของดีล.map(q => q.status),
  });
  const ขั้น = ขั้นต่อไป({
    leadStatus: lead.status,
    request: คำขอ ? { status: คำขอ.status, dueAt: คำขอ.dueAt } : null,
    hqQuote: ใบHQ ? { status: ใบHQ.status, validUntil: ใบHQ.validUntil } : null,
    quote: ใบล่าสุด ? { status: ใบล่าสุด.status, เดิม: !ใบล่าสุด.hqQuoteId } : null,
    มีใบส่งให้ลูกค้า: !!ใบที่ส่งอยู่,
    today: วันนี้ไทย(),
  });
  const จบแล้ว = ขั้น.key === "won" || ขั้น.key === "lost";
  const ขาดตอนส่ง = ตั้งค่าสาขา.loaded ? ข้อมูลบริษัทที่ขาด(ตั้งค่าสาขา.settings.issuer) : [];
  const กันส่ง = ขั้น.action?.kind === "send_quote" && ขาดตอนส่ง.length > 0;
  const สีกล่อง = ขั้น.key === "lost" ? { bg: "#f3f4f6", line: "#d1d5db", text: "#374151" }
    : ขั้น.key === "won" ? { bg: "#ecfdf5", line: "#059669", text: "#065f46" }
    : ขั้น.action ? { bg: "#fff4e5", line: "#b45309", text: "#7c3d06" }
    : { bg: "#eef3f8", line: "#9fb3c8", text: "#003366" };

  // คำสั่งจากบอร์ดลีด → ทางเดียวกับปุ่มในกล่องนี้ (บอสตอบ L1–L5 · 5 พ.ย. 69)
  ทำคำสั่ง.current = () => {
    const เป้า = คำสั่ง?.เป้า;
    if (เป้า === "งาน") {
      const งาน = คำสั่ง?.งาน ?? "";
      // ได้ใบ HQ: คำขอรออยู่ = เปิดคำขอ + บอกว่ารอ HQ ส่งใบ (บอสตอบ 6 พ.ย. 69 ข้อ 1 ก) · ยังไม่มีคำขอรอ = ไปทางขอราคาด้านล่าง
      if (งาน === "hqQuote" && คำขอ && (คำขอ.status === "new" || คำขอ.status === "pricing")) {
        onAction("ดูคำขอ");
        return แจ้งสำเร็จ("รอ HQ ส่งใบอยู่ — ระบบติ๊กให้เมื่อ HQ ส่งใบ");
      }
      if (!ขั้น.action || !(ปุ่มของงาน[งาน] ?? []).includes(ขั้น.action.kind)) return แจ้งพลาด(`ยังทำงานนี้ไม่ได้ตอนนี้ — ${ขั้น.title}: ${ขั้น.detail}`);
      if (งาน === "hqQuote") แจ้งสำเร็จ("ยังไม่ได้ส่งคำขอราคาให้ HQ — ส่งคำขอก่อน แล้ว HQ จะส่งใบกลับมา");
    }
    if (เป้า === "ปิดไม่สำเร็จ") {
      if (ขั้น.ปิดไม่สำเร็จได้) return ปิดไม่สำเร็จ();
      if (ขั้น.action?.kind === "customer_result") return onAction("customer_result", ใบที่ส่งอยู่?.id);   // ส่งใบแล้ว = "ลูกค้าปฏิเสธ" ที่ใบ (L3)
      return แจ้งพลาด(`ปิดไม่สำเร็จไม่ได้ — ${ขั้น.title}`);
    }
    if (เป้า === "ปิดสำเร็จ") {
      if (ขั้น.action?.kind === "customer_result") return onAction("customer_result", ใบที่ส่งอยู่?.id);   // บันทึก "ลูกค้าตอบรับ" ที่ใบ (L2)
      return แจ้งพลาด(`ปิดสำเร็จได้เมื่อส่งใบให้ลูกค้าแล้ว — ตอนนี้: ${ขั้น.title}`);
    }
    if (!ขั้น.action) return แจ้งพลาด(`${ขั้น.title} — ${ขั้น.detail}`);
    if (กันส่ง) return แจ้งพลาด(`ส่งไม่ได้ — กรอกข้อมูลบริษัทให้ครบก่อน (ยังขาด: ${ขาดตอนส่ง.join(" · ")})`);
    if (ขั้น.action.kind === "reprice") แจ้งพลาด(`${ขั้น.title} — ${ขั้น.detail}`);   // ราคา HQ หมดอายุ → ฟอร์มขอราคาใหม่แทน (L4)
    onAction(ขั้น.action.kind, ขั้น.key === "await_customer" ? ใบที่ส่งอยู่?.id : ใบล่าสุด?.id);
  };

  // ปิดไม่สำเร็จ = กล่องเหตุผลกลาง (บอสสั่ง 28 ต.ค. 69) — กล่องรอฐาน · ผิดพลาดแสดงในกล่อง
  function ปิดไม่สำเร็จ() {
    // รอราคา HQ อยู่ = ยกเลิกคำขอพร้อมปิดลีด (ฐานเลื่อนลีดให้เอง) · อย่างอื่น = บันทึกปิดไม่สำเร็จที่ลีด
    const รอHQ = !!คำขอ && (คำขอ.status === "new" || คำขอ.status === "pricing");
    void ถามเหตุผล({
      หัวข้อ: รอHQ ? "ปิดไม่สำเร็จ — ระบบยกเลิกคำขอราคาที่รอ HQ ให้ด้วย" : "ปิดไม่สำเร็จ — เลือกเหตุผลที่ปิดการขายไม่ได้",
      ป้ายช่อง: "เหตุผลที่ปิดการขายไม่ได้", ตัวเลือก: lostReasons,
      ปุ่มตกลง: "ยืนยันปิดการขาย", ปุ่มกำลังทำ: "กำลังปิดการขาย…", อันตราย: true,
      ทำ: async reason => {
        if (รอHQ) await repo.cancel(คำขอ!.id, reason, true);
        await onLost(reason, รอHQ);
        setรอบ(n => n + 1);
      },
    });
  }

  return (
    <div data-panel="next-step" style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 20px", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <ol aria-label="ขั้นตอนการขาย" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6 }}>
        {ชื่อขั้นการขาย.map((ชื่อ, i) => {
          const สภาพ = แถบ[i];
          const ผ่าน = สภาพ === "ผ่าน", ตอนนี้ = สภาพ === "ตอนนี้";
          return (
            <li key={ชื่อ} aria-current={ตอนนี้ ? "step" : undefined} data-step-state={สภาพ} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <div style={{ height: 5, borderRadius: 99, background: ผ่าน ? สีแถบขั้น.ผ่าน : ตอนนี้ ? สีแถบขั้น.ตอนนี้ : สีแถบขั้น.ยังไม่ถึง }} />
              {/* ชื่อขั้นขึ้นบรรทัดใหม่ได้ (มือถือเดิมถูกตัดเป็น "2 · ขอราค…" · ทดลองเว็บจริง 21 ต.ค. 69)
                  ไม่มีเลขลำดับนำหน้า — ชื่อจาก ชื่อขั้น() ตัวเดียวกับป้ายในตาราง/บอร์ด/หน้า HQ (บอสสั่ง 28 ต.ค. 69) */}
              <div style={{ fontSize: "0.68rem", fontWeight: ตอนนี้ ? 800 : 600, color: ตอนนี้ ? สีแถบขั้น.ตอนนี้ตัวอักษร : ผ่าน ? สีแถบขั้น.ผ่าน : "#9ca3af", lineHeight: 1.3, overflowWrap: "anywhere" }}>
                {ผ่าน && <Check size={10} style={{ verticalAlign: "-1px", marginRight: 2 }} />}{ชื่อขั้น((i + 1) as เลขขั้น)}
              </div>
            </li>
          );
        })}
      </ol>
      {(
        <div role="status" aria-label="ขั้นต่อไป" style={{ minHeight: 62, boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: สีกล่อง.bg, border: `1px solid ${สีกล่อง.line}`, borderRadius: 12, padding: "10px 14px" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: "0.66rem", fontWeight: 700, color: สีกล่อง.text, opacity: 0.85 }}>{จบแล้ว ? "สถานะ" : "ขั้นต่อไป"}</div>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: สีกล่อง.text }}>{ขั้น.title}</div>
            <div style={{ fontSize: "0.74rem", color: สีกล่อง.text }}>{ขั้น.detail}{ขั้น.key === "lost" && lead.lostReason ? ` · เหตุผล: ${lead.lostReason}` : ""}</div>
          </div>
          {ขั้น.ปิดไม่สำเร็จได้ && (
            <button type="button" onClick={ปิดไม่สำเร็จ}
              style={{ height: 40, padding: "0 14px", border: "1px solid #fecaca", borderRadius: 10, background: "#fff", color: "#dc2626", fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <XCircle size={14} /> ปิดไม่สำเร็จ
            </button>
          )}
          {ขั้น.action && (
            <button type="button" data-next-step={ขั้น.key} disabled={กันส่ง}
              title={กันส่ง ? `ส่งไม่ได้ — กรอกข้อมูลบริษัทให้ครบก่อน (ยังขาด: ${ขาดตอนส่ง.join(" · ")})` : undefined}
              onClick={() => onAction(ขั้น.action!.kind, ขั้น.key === "await_customer" ? ใบที่ส่งอยู่?.id : ใบล่าสุด?.id)}
              style={{ height: 40, padding: "0 16px", border: "none", borderRadius: 10, background: กันส่ง ? "#d6b48c" : "#b45309", color: "#fff", fontFamily: "inherit", fontSize: "0.84rem", fontWeight: 800, cursor: กันส่ง ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              {ขั้น.action.label} <ArrowRight size={14} />
            </button>
          )}
          {กันส่ง && <IssuerGuardNote ขาด={ขาดตอนส่ง} การกระทำ="ส่งใบให้ลูกค้า" หมายเหตุ="ใบร่างยังแก้ได้ตามปกติ" style={{ flex: "1 1 100%" }} />}
        </div>
      )}
    </div>
  );
}
