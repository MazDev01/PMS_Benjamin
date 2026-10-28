"use client";

// ── แผงดูใบเสนอราคา (หน้าใบเสนอราคาของดีลเลอร์ · บอสสั่ง 28 ต.ค. 69 "กดแล้วเปิดดูใบได้เลย") ─────────────────
//
// เดิม (รอบ 4) กดแถวแล้วพาไปแผงลีด — คนที่แค่อยากดูยอด/รายการต้องออกจากหน้ารายการทุกครั้ง แล้วหาแถวเดิมใหม่
// ตอนนี้: กดแถว = เปิดแผงกลางจอ 820px บนหน้าเดิม (URL ยังเป็น /quotations) · ปิดแล้วอยู่ที่แถวเดิม ตัวกรอง/หน้าเดิม
// แผงนี้ "ดูอย่างเดียว" — ส่ง/ตอบรับ/ปฏิเสธ/ทำฉบับใหม่ (D6/D8/D8x) ยังทำที่แผงลีดที่เดียว → ปุ่ม "ไปแผงลีด"
//   (ไม่ก๊อปปุ่มทำงานมาไว้ที่นี่ — สองที่ทำงานเดียวกัน แก้ที่หนึ่งแล้วอีกที่ไม่ตาม คือปัญหาที่รอบ 4 ตัดทิ้งไปแล้ว)
// ยอดแยก VAT ใช้สูตรกลาง (quoteTax.ts) · พิมพ์ใช้ทางเดียวกับแผงลีด (ขอหัวกระดาษจากฐาน + กันข้อมูลบริษัทไม่ครบ ใบ 0247)
import { Printer, X, ArrowRight, FileText, User, MapPin, Calendar, Coins, Layers } from "lucide-react";
import { quotationStatusLabel, quotationStatusColor, fmtISOToThai, type QuotationMock } from "@pms/shared/lib/mock";
import { boqLineItems } from "@pms/shared/lib/boq";
import { fmtFull } from "@pms/shared/lib/format";
import { คิดภาษีใบเสนอราคา } from "@pms/shared/lib/quoteTax";
import { printQuotation, type PrintCustomer } from "@pms/shared/lib/quotationPrint";
import { quotations as quotationsRepo } from "@pms/shared/lib/data";
import { ช่องที่ขาดตอนพิมพ์ } from "@pms/shared/lib/issuerComplete";
import { IssuerGuardNote } from "@pms/shared/components/ui/IssuerGuardNote";
import { useDealerSettings, useDealerVat } from "@pms/shared/lib/useDealerSettings";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { ป้ายฉบับ } from "@pms/shared/lib/quoteRevision";
import { quoteExpiryISO } from "@pms/shared/lib/quoteExpiry";
import { useModalA11y } from "@pms/shared/lib/useModalA11y";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";
import { PanelSection, PanelRow } from "@pms/shared/components/ui/DetailPanel";
import { ช่อง } from "@pms/shared/lib/fieldLabels";

const เลขฉบับ = (q: QuotationMock) => Number(ป้ายฉบับ(q.revision).slice(1));

/** ทุกฉบับของใบเดียวกัน (V1, V2 …) — ผูกด้วย supersedes_id (ใบ 0227) · ใบที่ไม่มีช่องนี้ผูกด้วยเลขที่ "<เลขV1>-V<n>" (0228 ตั้งเลขแบบนี้) */
export function ฉบับทั้งหมดของใบ(q: QuotationMock, ทั้งหมด: QuotationMock[]): QuotationMock[] {
  const ราก = (x: QuotationMock) => x.id.replace(/-V\d+$/, "");
  const ตาม = new Map(ทั้งหมด.map(x => [x.id, x]));
  // เดินขึ้นหาฉบับแรก (กันวนซ้ำด้วยชุดที่เคยผ่าน)
  let ต้น = q; const ผ่าน = new Set<string>();
  while (ต้น.supersedesId && ตาม.has(ต้น.supersedesId) && !ผ่าน.has(ต้น.id)) { ผ่าน.add(ต้น.id); ต้น = ตาม.get(ต้น.supersedesId)!; }
  const ชุด = new Map<string, QuotationMock>([[ต้น.id, ต้น], [q.id, q]]);
  for (let เพิ่ม = true; เพิ่ม;) {
    เพิ่ม = false;
    for (const x of ทั้งหมด) {
      if (ชุด.has(x.id)) continue;
      if ((x.supersedesId && ชุด.has(x.supersedesId)) || ราก(x) === ราก(ต้น)) { ชุด.set(x.id, x); เพิ่ม = true; }
    }
  }
  return [...ชุด.values()].sort((a, b) => เลขฉบับ(a) - เลขฉบับ(b) || a.id.localeCompare(b.id, "en", { numeric: true }));
}

/** พิมพ์ใบให้ลูกค้า — ทางเดียวของแผงดูใบและปุ่มพิมพ์ในแถวตาราง (ขอหัวกระดาษจากฐาน + กันข้อมูลบริษัทไม่ครบ ใบ 0247)
 *  ขาด(q) = ช่องข้อมูลบริษัทที่ยังไม่กรอก (มี = กดพิมพ์ไม่ได้) · ยังโหลดข้อมูลบริษัทไม่เสร็จ ≠ ยังไม่ได้กรอก (เจอจริง 27 ส.ค. 69) */
export function usePrintQuote() {
  const dealerCfg = useDealerSettings();
  const dealerVat = useDealerVat();
  const ขาด = (q: QuotationMock) => dealerCfg.loaded ? ช่องที่ขาดตอนพิมพ์(q.issuer, dealerCfg.settings.issuer) : [];
  const พิมพ์ = async (q: QuotationMock, ลูกค้า?: PrintCustomer) => {
    if (!dealerCfg.loaded) { แจ้งสำเร็จ("กำลังโหลดข้อมูลบริษัท — รอสักครู่แล้วกดพิมพ์อีกครั้ง"); return; }
    try {
      await printQuotation(q, { company: q.customer, ...ลูกค้า }, q.vatPercent ?? dealerVat,
        { issuer: dealerCfg.settings.issuer, doc: dealerCfg.settings.document }, () => quotationsRepo.printData(dealerCodeOf(q), q.id));
    } catch (e) { แจ้งพลาด("พิมพ์ใบเสนอราคาไม่สำเร็จ: " + friendlyError(e)); }
  };
  return { ขาด, พิมพ์ };
}

type Props = {
  q: QuotationMock;
  /** ใบทั้งหมดของสาขา — ใช้หาฉบับอื่นของใบเดียวกัน */
  ทั้งหมด: QuotationMock[];
  ผู้รับผิดชอบ: string;
  /** ผู้ติดต่อ/เบอร์/จังหวัดจากลีดหรือลูกค้าที่ใบผูกอยู่ — ใช้หัวเอกสารตอนพิมพ์ (ไม่มี = ว่าง ไม่เดา) */
  ลูกค้า?: PrintCustomer;
  validityDays: number;
  onClose: () => void;
  /** เลือกดูฉบับอื่น */
  onPick: (id: string) => void;
  /** ไปแผงลีด (หรือแผงลูกค้าสำหรับใบเดิมที่ไม่ผูกลีด) · undefined = ไม่มีที่ให้ไป */
  onGoLead?: () => void;
};

// แขวนที่ <body> (ModalPortal) · ตัวแผงแยกเป็นคอมโพเนนต์ข้างใน — useModalA11y ต้องเห็นกล่องตอน mount
//   (ModalPortal เรนเดอร์ว่างรอบแรก ถ้าใส่ ref ไว้ชั้นนี้ Esc/กักโฟกัส/คืนโฟกัสให้แถวเดิมจะไม่ทำงาน)
export function QuotationViewPanel(p: Props) {
  return <ModalPortal><แผงใบ {...p} /></ModalPortal>;
}

function แผงใบ({ q, ทั้งหมด, ผู้รับผิดชอบ, ลูกค้า, validityDays, onClose, onPick, onGoLead }: Props) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const dealerVat = useDealerVat();
  const พิมพ์ใบ = usePrintQuote();
  const sc = quotationStatusColor[q.status];
  const lis = boqLineItems(q);
  // สูตรเดียวกับหน้าดูใบในแผงลีด (LeadQuotationsPanel โหมด view) — ผลรวมรายการก่อน ไม่มีค่อยใช้ยอดที่บันทึก
  const subtotal = lis.reduce((s, it) => s + it.qty * it.unitPrice, 0) || q.materialCost || q.totalValue;
  const ภาษีใบ = คิดภาษีใบเสนอราคา(subtotal, { vatPercent: q.vatPercent ?? dealerVat, whtPercent: q.whtRate });
  const ฉบับ = ฉบับทั้งหมดของใบ(q, ทั้งหมด);
  const หมดอายุ = quoteExpiryISO(q, validityDays);
  const ขาด = พิมพ์ใบ.ขาด(q);
  const พิมพ์ = () => พิมพ์ใบ.พิมพ์(q, ลูกค้า);
  const th: React.CSSProperties = { textAlign: "left", fontSize: "0.65rem", fontWeight: 700, color: "#6b7280", padding: "8px 10px", background: "#f7f9fc", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { fontSize: "0.78rem", color: "#2D2D2D", padding: "9px 10px", borderTop: "1px solid #eef0f4" };
  const ปุ่มหัว: React.CSSProperties = { background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, height: 30, padding: "0 11px", cursor: "pointer", color: "#fff",
    display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" };

  return (
    <>
      <div onClick={onClose} className="drawer-overlay" style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }} />
      {/* แผงกลางจอ 820px — มาตรฐานเดียวกับแผงลีด/แผงลูกค้าของดีลเลอร์ */}
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`ใบเสนอราคา ${q.id}`} data-quote-view={q.id} className="modal-pop"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 820, maxWidth: "calc(100vw - 24px)",
          maxHeight: "calc(100vh - 24px)", zIndex: 210, background: "#F8FAFC", boxShadow: "0 30px 90px rgba(0,0,0,.32)", borderRadius: 18,
          display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: "#003366", padding: "14px 20px", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>{q.id}</span>
              <span className="badge" data-view-revision style={{ background: "#fff", color: "#003366", fontWeight: 800 }}>{ป้ายฉบับ(q.revision)}</span>
              <span className="badge" style={{ background: sc.bg, color: sc.text }}>{quotationStatusLabel[q.status]}</span>
            </div>
            <div style={{ fontSize: "0.74rem", color: "rgba(255,255,255,.75)", marginTop: 4, overflowWrap: "anywhere" }}>{q.customer || "—"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <button onClick={() => void พิมพ์()} disabled={ขาด.length > 0} data-print-quote style={{ ...ปุ่มหัว, opacity: ขาด.length ? .5 : 1, cursor: ขาด.length ? "not-allowed" : "pointer" }}
              title={ขาด.length ? `พิมพ์ไม่ได้ — กรอกข้อมูลบริษัทให้ครบก่อน (ยังขาด: ${ขาด.join(" · ")})` : "พิมพ์ PDF"}><Printer size={13} /> พิมพ์ PDF</button>
            {onGoLead && (
              <button onClick={onGoLead} data-goto-lead style={{ ...ปุ่มหัว, background: "#fff", color: "#003366", fontWeight: 800 }}
                title="ส่งให้ลูกค้า · บันทึกผลจากลูกค้า · ทำฉบับใหม่ ทำที่แผงลีด">
                {q.dealId != null ? "ไปแผงลีด" : "ไปแผงลูกค้า"} <ArrowRight size={13} />
              </button>
            )}
            <button onClick={onClose} aria-label="ปิด" title="ปิด" style={{ ...ปุ่มหัว, width: 30, padding: 0, justifyContent: "center" }}><X size={15} /></button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "4px 20px 20px" }}>
          <IssuerGuardNote ขาด={ขาด} การกระทำ="พิมพ์ใบให้ลูกค้า" style={{ marginTop: 14 }} />

          <PanelSection icon={User} title="ลูกค้า">
            <PanelRow icon={User} label="ลูกค้า" value={q.customer} />
            <PanelRow icon={FileText} label={ช่อง.งาน} value={q.project} />
            <PanelRow icon={MapPin} label="จังหวัด" value={q.province} />
            <PanelRow icon={User} label="ผู้รับผิดชอบ" value={ผู้รับผิดชอบ} />
            <PanelRow icon={Calendar} label="วันที่สร้าง" value={q.date ? fmtISOToThai(q.date) : "—"} />
            <PanelRow icon={Calendar} label="วันหมดอายุ" value={หมดอายุ ? fmtISOToThai(หมดอายุ) : "—"} />
          </PanelSection>

          <PanelSection icon={Coins} title="รายการสินค้า" bodyStyle={{ padding: 0, overflow: "hidden" }}>
            {/* จอแคบ: ตารางเลื่อนในกล่องตัวเอง — หน้าไม่เลื่อนแนวนอน */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 460, borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>รายการ</th><th style={{ ...th, textAlign: "right" }}>จำนวน</th>
                  <th style={th}>หน่วย</th><th style={{ ...th, textAlign: "right" }}>ราคา/หน่วย</th>
                  <th style={{ ...th, textAlign: "right" }}>รวม</th>
                </tr></thead>
                <tbody>
                  {lis.length === 0 ? (
                    <tr><td style={{ ...td, textAlign: "center", color: "#9aa2ad" }} colSpan={5}>ไม่มีรายการ</td></tr>
                  ) : lis.map((it, i) => (
                    <tr key={i}>
                      <td style={{ ...td, fontWeight: 600 }}>{it.name || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{it.qty.toLocaleString("th-TH")}</td>
                      <td style={td}>{it.unit || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{it.unitPrice.toLocaleString("th-TH")}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#003366" }}>{fmtFull(it.qty * it.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div data-quote-totals style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 14px", borderTop: "1px solid #eef0f4", background: "#f7f9fc" }}>
              {([
                ["ยอดรวมก่อน VAT", fmtFull(ภาษีใบ.subtotal), { คีย์: "subtotal" }],
                [`ภาษีมูลค่าเพิ่ม ${ภาษีใบ.vatRate}%`, fmtFull(ภาษีใบ.vatAmount), { คีย์: "vat" }],
                ["รวมเป็นเงิน", fmtFull(ภาษีใบ.totalAmount), { คีย์: "total", หนา: true }],
                ...(ภาษีใบ.whtRate > 0 ? [[`หัก ณ ที่จ่าย ${ภาษีใบ.whtRate}%`, `−${fmtFull(ภาษีใบ.whtAmount)}`, { คีย์: "wht", สี: "#b45309" }] as const] : []),
                ["ยอดชำระสุทธิ", fmtFull(ภาษีใบ.netPayable), { คีย์: "net", หนา: true, เด่น: true }],
              ] as const).map(([ป้าย, ค่า, o]) => {
                const ตั้ง = o as { คีย์: string; หนา?: boolean; เด่น?: boolean; สี?: string };
                return (
                  <div key={ป้าย} data-total-row={ตั้ง.คีย์} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: ตั้ง.เด่น ? "0.9rem" : "0.78rem",
                    fontWeight: ตั้ง.หนา ? 800 : 600, color: ตั้ง.สี ?? (ตั้ง.หนา ? "#003366" : "#4b5563"),
                    ...(ตั้ง.หนา ? { borderTop: "1px solid #e6eaf0", paddingTop: 6 } : {}) }}>
                    <span>{ป้าย}</span><span data-total-value style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{ค่า}</span>
                  </div>
                );
              })}
            </div>
          </PanelSection>

          {q.note && (
            <PanelSection icon={FileText} title="หมายเหตุ" bodyStyle={{ padding: "10px 14px" }}>
              <div style={{ fontSize: "0.8rem", color: "#2D2D2D", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{q.note}</div>
            </PanelSection>
          )}

          {/* ทุกฉบับของใบนี้ — กดเพื่อดูฉบับนั้น (ฉบับที่ถูกแทนที่ยังดูได้ เป็นหลักฐานว่าลูกค้าเคยได้ใบไหน) */}
          <PanelSection icon={Layers} title={`ฉบับของใบนี้ · ${ฉบับ.length} ฉบับ`} bodyStyle={{ padding: 6 }}>
            <div data-quote-versions style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {ฉบับ.map(v => {
                const c = quotationStatusColor[v.status]; const นี้ = v.id === q.id;
                return (
                  <button key={v.id} onClick={() => !นี้ && onPick(v.id)} aria-current={นี้ || undefined} data-version-item={v.id}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: นี้ ? "1.5px solid #003366" : "1px solid transparent",
                      background: นี้ ? "#eef3f8" : "#fff", cursor: นี้ ? "default" : "pointer", fontFamily: "inherit", textAlign: "left", width: "100%" }}>
                    <span className="badge" style={{ background: "#eef3f8", color: "#003366", fontWeight: 800 }}>{ป้ายฉบับ(v.revision)}</span>
                    <span style={{ fontFamily: "monospace", fontSize: "0.76rem", fontWeight: 700, color: "#2D2D2D", overflowWrap: "anywhere" }}>{v.id}</span>
                    <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>{v.date ? fmtISOToThai(v.date) : "—"}</span>
                    <span className="badge" style={{ background: c.bg, color: c.text, marginLeft: "auto" }}>{quotationStatusLabel[v.status]}</span>
                    <span style={{ fontSize: "0.76rem", fontWeight: 800, color: "#003366", whiteSpace: "nowrap" }}>{v.total || "—"}</span>
                  </button>
                );
              })}
            </div>
          </PanelSection>
        </div>
      </div>
    </>
  );
}
