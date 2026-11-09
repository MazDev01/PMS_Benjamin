"use client";

// ─── หน้าต่างรายละเอียดใบเสนอราคาฝั่ง HQ (เปิดจากปุ่ม "ดู" — ไม่เปลี่ยนหน้า) ──────────
// อ่านอย่างเดียว ไม่มีปุ่มแก้ไข/ลบ/อนุมัติ (ย้อนการตอบรับทำได้ที่นี่ที่เดียว)
//
// บอสสั่ง 9 พ.ย. 69: แบบเดียวกับหน้าต่างใบของดีลเลอร์ (QuotationViewPanel) — กลางจอ 820px หัวน้ำเงิน
//   แถบหัว = เลขที่ + ลูกค้า · ดีลเลอร์ + ปุ่มปิด (ไม่มีป้ายซ้ำ)
//   แถบสรุป 4 ช่อง: ยอดชำระสุทธิ · สถานะ · วันหมดอายุ + เหลือ/เลยมา x วัน (เฉพาะใบร่าง/ส่งแล้ว) · ฉบับ
//   ลูกค้า = กริด 3 คอลัมน์ (ชุดเดียวกับดีลเลอร์) · ดีลเลอร์ = กริด (ฝั่ง HQ เท่านั้น) · กล่องยอดรวมชิดขวาครึ่งหนึ่ง
//   ชิ้นส่วนกลาง DocDetailParts — แก้ที่เดียวเปลี่ยนทั้งสองฝั่ง
//
// สิ่งที่ระบบไม่มีข้อมูล จึงไม่แสดง (ห้ามกุ):
//  · ประวัติการเปิดอ่าน — ลบทั้งฟีเจอร์แล้ว (ไม่มีการติดตามจริง)
//  · ไทม์ไลน์/ประวัติการแก้ไขของ "ใบเสนอราคา" — ระบบเก็บไทม์ไลน์ไว้ที่ดีล ไม่ได้ผูกรายใบ
//  · เอกสารแนบรายใบ — คลังไฟล์ผูกกับลูกค้า/ลูกค้าเป้าหมาย ไม่ได้ผูกกับเลขที่ใบเสนอราคา
//  · รายการสินค้า — มีเฉพาะใบที่ดีลเลอร์สร้างจริง ที่เหลือขึ้น "—"
//  · อัตรา VAT — ใบที่ข้อมูลไม่มีอัตรา (ข้อมูลตัวอย่างเดิม) ไม่คิดยอดภาษี ขึ้น "-"
//
// margin (ด่าน 3 · FLOW "% ที่ดีลเลอร์บวก → HQ ดู margin"): ใบที่ทำจากใบ HQ แสดงรายบรรทัด
//   ต้นทุนจากใบ HQ · % ที่บวก · ราคาขาย · ส่วนบวกเป็นบาท + สรุปทั้งใบ บวกรวม (บาท) · % ของต้นทุน · % ของราคาขาย
//   ตัวเลขคิดที่ฐานข้อมูล (quotation_margin · ใบ 0201) ไม่คิดซ้ำที่หน้าจอ · ราคาก่อนภาษี
//   ใบเดิมที่ไม่ได้ทำจากใบ HQ = ไม่มีต้นทุนให้เทียบ → ขึ้นว่าไม่มีข้อมูล (ห้ามกุ)
import { useEffect, useState } from "react";
import { X, User, Store, Package, TrendingUp, FileText } from "lucide-react";
import { quoteRequests as quoteRequestsRepo, metrics, dealerSettings as dealerSettingsRepo } from "@pms/shared/lib/data";
import type { ส่วนต่างใบ } from "@pms/shared/lib/hqQuoteMargins";
import { คอลัมน์ส่วนต่าง } from "./QuotationTable";
import type { QuoteMargin } from "@pms/shared/lib/quoteRequests";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { quotationStatusLabel, quotationStatusColor, fmtISOToThai } from "@pms/shared/lib/mock";
import { fmtBaht, fmtFull } from "@pms/shared/lib/format";
import { regionDisplay, type QuoteRow } from "@pms/shared/lib/hqQuotations";
import { PanelSection } from "@pms/shared/components/ui/DetailPanel";
import { แถบสรุปเอกสาร, กริดรายละเอียด, ช่องกริด } from "@pms/shared/components/ui/DocDetailParts";
import { ถามเหตุผล, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { ช่อง } from "@pms/shared/lib/fieldLabels";
import { ตารางรายการ } from "@pms/shared/components/ui/LineItemsTable";
import { จัดรูปจำนวน, จัดรูปหน่วย } from "@pms/shared/lib/lineItemColumns";
import { useชื่อดีลเลอร์ } from "@pms/shared/lib/dealerDisplay";
import { คิดภาษีใบเสนอราคา } from "@pms/shared/lib/quoteTax";
import { quoteExpiryISO, ป้ายนับวันหมดอายุ } from "@pms/shared/lib/quoteExpiry";
import { APP_NOW_ISO } from "@pms/shared/lib/appTime";
import { ป้ายฉบับ } from "@pms/shared/lib/quoteRevision";
import { useQuoteValidityDays } from "@pms/shared/lib/useHQConfig";
import { useModalA11y } from "@pms/shared/lib/useModalA11y";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";

const PRIMARY = "#003366";
const บาท2 = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const เปอร์เซ็นต์ = (n: number | null) => n == null ? "—" : `${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

type Props = {
  quote: QuoteRow;
  onClose: () => void;
  /** สถานะใบเปลี่ยน (HQ ย้อนการตอบรับ) — ให้หน้าแม่โหลดตารางใหม่ */
  onChanged?: () => void;
};

// แขวนที่ <body> (ModalPortal) อยู่เหนือแผงดีลเลอร์/หน้าต่างเจาะลึก (z 240–241)
//   ตัวหน้าต่างแยกคอมโพเนนต์ — useModalA11y ต้องเห็นกล่องตอน mount (ModalPortal เรนเดอร์ว่างรอบแรก)
export function QuotationDrawer(p: Props) {
  return <ModalPortal><หน้าต่างใบ {...p} /></ModalPortal>;
}

function หน้าต่างใบ({ quote, onClose, onChanged }: Props) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const ชื่อของ = useชื่อดีลเลอร์();   // ชื่อแสดง ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" (บอสสั่ง 6 พ.ย. 69)
  const sc = quotationStatusColor[quote.status];
  const items = quote.lineItems ?? [];
  const ปิดการขายแล้ว = quote.status === "won";
  const [margin, setMargin] = useState<QuoteMargin | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setMargin(undefined);
    quoteRequestsRepo.margin(quote.dealerCode, quote.quoteNo)
      .then(m => alive && setMargin(m))
      .catch(e => { logRepoRead("quoteRequests.margin", e); if (alive) setMargin(null); });
    return () => { alive = false; };
  }, [quote.dealerCode, quote.quoteNo]);
  // 4 ตัวเลขขายต่อ (บอสสั่ง 2 พ.ย. 69 · ใบ 0272) — ที่มาเดียวกับคอลัมน์ในตาราง → แผง = แถว · ไม่ได้ทำจากใบ HQ = "—"
  const [ขายต่อ, setขายต่อ] = useState<ส่วนต่างใบ | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setขายต่อ(undefined);
    metrics.hqQuoteMargins([{ dealer: quote.dealerCode, id: quote.quoteNo }])
      .then(r => alive && setขายต่อ(r[0] ?? null))
      .catch(e => { logRepoRead("metrics.hqQuoteMargins", e); if (alive) setขายต่อ(null); });
    return () => { alive = false; };
  }, [quote.dealerCode, quote.quoteNo]);

  // วันหมดอายุ = กติกาเดียวกับหน้าต่างใบของดีลเลอร์และฐาน (_quote_valid_until):
  //   วันที่กรอกในใบ · ไม่กรอก = วันที่ใบ + อายุใบของสาขา (สาขาไม่ได้ตั้ง = ของ HQ) · ไม่มีวันที่ใบ = "-"
  const ของHQ = useQuoteValidityDays();
  const [อายุสาขา, setอายุสาขา] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (quote.expiry) { setอายุสาขา(null); return; }
    let alive = true;
    setอายุสาขา(undefined);
    dealerSettingsRepo.get(quote.dealerCode)
      .then(st => {
        const v = Number((st.document as { validityDays?: unknown } | undefined)?.validityDays);
        if (alive) setอายุสาขา(Number.isFinite(v) && v > 0 ? Math.round(v) : null);
      })
      .catch(e => { logRepoRead("dealerSettings.get", e); if (alive) setอายุสาขา(null); });
    return () => { alive = false; };
  }, [quote.dealerCode, quote.expiry]);
  const หมดอายุ: string | undefined = quote.expiry ? quote.expiry
    : อายุสาขา === undefined ? undefined
    : quoteExpiryISO({ date: quote.dateISO ?? "" }, อายุสาขา ?? ของHQ);
  // นับวันเฉพาะใบที่ยังรอคำตอบ (ร่าง/ส่งแล้ว) — กติกาเดียวกับฝั่งดีลเลอร์ (บอสตอบ 9 พ.ย. 69)
  const นับวัน = หมดอายุ && (quote.status === "draft" || quote.status === "sent_to_client") ? ป้ายนับวันหมดอายุ(หมดอายุ, APP_NOW_ISO) : null;
  const วันหมดอายุ = หมดอายุ === undefined ? "…" : หมดอายุ ? fmtISOToThai(หมดอายุ) : "-";

  // ยอดแยก VAT สูตรกลาง (quoteTax.ts) — ผลรวมรายการก่อน ไม่มีค่อยใช้ยอดที่บันทึก (สูตรเดียวกับหน้าต่างใบของดีลเลอร์)
  //   ใบที่ข้อมูลไม่มีอัตรา VAT = ไม่คิด ขึ้น "-" (ห้ามเดาอัตรา)
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0) || quote.materialCost || quote.valueNum;
  const ภาษีใบ = quote.vatPercent != null ? คิดภาษีใบเสนอราคา(subtotal, { vatPercent: quote.vatPercent, whtPercent: quote.whtRate }) : null;
  const แถวยอด: { คีย์: string; ป้าย: string; ค่า: string; หนา?: boolean; เด่น?: boolean; สี?: string }[] = [
    { คีย์: "subtotal", ป้าย: "ยอดรวมก่อน VAT", ค่า: fmtFull(ภาษีใบ?.subtotal ?? subtotal) },
    { คีย์: "vat", ป้าย: ภาษีใบ ? `ภาษีมูลค่าเพิ่ม ${ภาษีใบ.vatRate}%` : "ภาษีมูลค่าเพิ่ม", ค่า: ภาษีใบ ? fmtFull(ภาษีใบ.vatAmount) : "-" },
    { คีย์: "total", ป้าย: "รวมเป็นเงิน", ค่า: ภาษีใบ ? fmtFull(ภาษีใบ.totalAmount) : "-", หนา: true },
    ...(ภาษีใบ && ภาษีใบ.whtRate > 0 ? [{ คีย์: "wht", ป้าย: `หัก ณ ที่จ่าย ${ภาษีใบ.whtRate}%`, ค่า: `−${fmtFull(ภาษีใบ.whtAmount)}`, สี: "#b45309" }] : []),
    { คีย์: "net", ป้าย: "ยอดชำระสุทธิ", ค่า: ภาษีใบ ? fmtFull(ภาษีใบ.netPayable) : "-", หนา: true, เด่น: true },
  ];

  // ── HQ ย้อนการตอบรับ (won) — ดีลเลอร์ทำเองไม่ได้ (ฐานข้อมูลบังคับ 0204/0205) · ต้องมีเหตุผล · ไทม์ไลน์บอกว่าใคร/เมื่อไร ──
  const [ย้อนอยู่, setย้อนอยู่] = useState(false);
  async function ย้อน(to: "sent_to_client" | "lost") {
    // กล่องเหตุผลกลาง (28 ต.ค. 69): กล่องรอฐาน · ฐานปฏิเสธ = ข้อความในกล่อง ไม่ปิดเอง
    setย้อนอยู่(true);
    try {
      const ทำแล้ว = await ถามเหตุผล({
        หัวข้อ: `ย้อนการตอบรับใบ ${quote.quoteNo} เป็น “${to === "lost" ? "ลูกค้าปฏิเสธ" : "ส่งให้ลูกค้าแล้ว"}” ?`,
        รายละเอียด: "ยอดขายของใบนี้จะไม่นับแล้ว · ไทม์ไลน์ของลูกค้าเป้าหมายบันทึกว่าสำนักงานใหญ่ย้อน พร้อมเหตุผล",
        ป้ายช่อง: "เหตุผลที่ย้อน", ปุ่มตกลง: "ย้อนการตอบรับ", ปุ่มกำลังทำ: "กำลังย้อนการตอบรับ…", อันตราย: true,
        ทำ: เหตุผล => quoteRequestsRepo.revertWon(quote.dealerCode, quote.quoteNo, เหตุผล, to),
      });
      if (!ทำแล้ว) return;
      แจ้งสำเร็จ(`ย้อนการตอบรับใบ ${quote.quoteNo} แล้ว`);
      onChanged?.();
      onClose();
    } finally { setย้อนอยู่(false); }
  }
  const ชื่อดีลเลอร์ = ชื่อของ(quote.dealerCode, quote.dealerName);

  return (
    <>
      <div onClick={onClose} className="drawer-overlay" style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 250 }} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="รายละเอียดใบเสนอราคา" data-hq-quote-view={quote.quoteNo} className="modal-pop"
        style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 820, maxWidth: "calc(100vw - 24px)",
          maxHeight: "calc(100vh - 24px)", zIndex: 251, background: "#F8FAFC", boxShadow: "0 30px 90px rgba(0,0,0,.32)", borderRadius: 18,
          display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* แถบหัว = เลขที่ + ลูกค้า · ดีลเลอร์ + ปุ่มปิด — สถานะ/ฉบับ/ยอดอยู่ในแถบสรุปที่เดียว (บอสตอบ 9 พ.ย. 69) */}
        <div data-panel-head style={{ background: PRIMARY, padding: "14px 20px", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", fontFamily: "monospace", overflowWrap: "anywhere" }}>{quote.quoteNo}</div>
            <div style={{ fontSize: "0.74rem", color: "rgba(255,255,255,.75)", marginTop: 4, overflowWrap: "anywhere" }}>{quote.customer || "-"} · {ชื่อดีลเลอร์}</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" title="ปิด" style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, height: 30, width: 30, padding: 0,
            cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={15} /></button>
        </div>

        <แถบสรุปเอกสาร ช่อง={[
          { คีย์: "net", ป้าย: "ยอดชำระสุทธิ", ค่า: ภาษีใบ ? fmtFull(ภาษีใบ.netPayable) : "-", เด่น: true },
          { คีย์: "status", ป้าย: "สถานะ", ค่า: <span className="badge" style={{ background: sc.bg, color: sc.text }}>{quotationStatusLabel[quote.status]}</span>,
            ย่อย: quote.agingDays != null ? `อายุใบ ${quote.agingDays} วัน` : undefined },
          { คีย์: "expiry", ป้าย: "วันหมดอายุ", ค่า: วันหมดอายุ, ย่อย: นับวัน?.ข้อความ, ย่อยแดง: นับวัน?.เลย },
          // ป้ายฉบับกติกาเดียวกับฝั่งดีลเลอร์ (quoteRevision.ts · ใบที่ฐานไม่ได้เก็บฉบับ = ฉบับแรก "V1" บอสสั่ง 28 ต.ค. 69)
          { คีย์: "revision", ป้าย: "ฉบับ", ค่า: ป้ายฉบับ(quote.revision) },
        ]} />

        <div style={{ overflowY: "auto", padding: "4px 20px 20px" }}>
          {ปิดการขายแล้ว && (
            <div data-panel="revert-won" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: "10px 12px", marginTop: 14, fontSize: "0.74rem", color: "#9A3412" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>ลูกค้าตอบรับแล้ว — ดีลเลอร์เปลี่ยนสถานะเองไม่ได้ ถ้าตอบรับผิด สำนักงานใหญ่ย้อนได้พร้อมเหตุผล</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={ย้อนอยู่} onClick={() => void ย้อน("sent_to_client")}>ย้อนเป็นส่งให้ลูกค้าแล้ว</button>
                <button type="button" className="btn btn-sm" disabled={ย้อนอยู่} onClick={() => void ย้อน("lost")}
                  style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>ย้อนเป็นลูกค้าปฏิเสธ</button>
              </div>
            </div>
          )}

          {/* กริด 3 คอลัมน์ × 2 แถว ชุดเดียวกับหน้าต่างใบของดีลเลอร์ */}
          <PanelSection icon={User} title="ลูกค้า">
            <กริดรายละเอียด data-quote-customer="">
              <ช่องกริด data-field="ลูกค้า" ป้าย="ลูกค้า" ค่า={quote.customer} />
              <ช่องกริด data-field={ช่อง.งาน} ป้าย={ช่อง.งาน} ค่า={quote.productLine} />
              <ช่องกริด data-field="จังหวัด" ป้าย="จังหวัด" ค่า={quote.province} />
              <ช่องกริด data-field="ผู้รับผิดชอบ" ป้าย="ผู้รับผิดชอบ" ค่า={quote.salesperson} />
              <ช่องกริด data-field="วันที่สร้าง" ป้าย="วันที่สร้าง" ค่า={quote.createdAt} />
              <ช่องกริด data-field="วันหมดอายุ" ป้าย="วันหมดอายุ" ค่า={วันหมดอายุ} />
            </กริดรายละเอียด>
          </PanelSection>

          {/* ฝั่ง HQ เท่านั้น: ดีลเลอร์เจ้าของใบ (ชื่อแสดง ไม่มีรหัส) */}
          <PanelSection icon={Store} title="ดีลเลอร์">
            <กริดรายละเอียด data-quote-dealer="">
              <ช่องกริด data-field="ดีลเลอร์" ป้าย="ดีลเลอร์" ค่า={ชื่อดีลเลอร์} />
              <ช่องกริด data-field="จังหวัดของดีลเลอร์" ป้าย="จังหวัดของดีลเลอร์" ค่า={quote.dealerProvince} />
              <ช่องกริด data-field="ภูมิภาค" ป้าย="ภูมิภาค" ค่า={regionDisplay(quote.region)} />
            </กริดรายละเอียด>
          </PanelSection>

          <PanelSection icon={Package} title="รายการสินค้า" bodyStyle={{ padding: 0, overflow: "hidden" }}>
            {!items.length ? (
              <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 14px" }}>
                — ใบนี้ไม่มีรายการสินค้าบันทึกไว้ในระบบ
              </div>
            ) : (
              <ตารางรายการ ป้าย="รายการสินค้าในใบเสนอราคา" แน่น กว้างขั้นต่ำ={520} แถว={items} คอลัมน์={[
                { key: "name", หัว: "รายการ", ชนิด: "ข้อความ", กว้าง: "34%", สไตล์: () => ({ fontWeight: 700, color: "#1F2937" }), ค่า: li => li.name, ชี้: li => li.name },
                { key: "qty", หัว: "จำนวน", ชนิด: "จำนวน", กว้าง: "13%", ค่า: li => จัดรูปจำนวน(li.qty) },
                { key: "unit", หัว: "หน่วย", ชนิด: "หน่วย", กว้าง: "13%", ค่า: li => จัดรูปหน่วย(li.unit) },
                { key: "price", หัว: "ราคา/หน่วย", ชนิด: "เงิน", กว้าง: "20%", ค่า: li => fmtBaht(li.unitPrice) },
                { key: "total", หัว: "ยอด", ชนิด: "เงิน", กว้าง: "20%", สไตล์: () => ({ fontWeight: 800, color: "#1F2937" }), ค่า: li => fmtBaht(li.qty * li.unitPrice) },
              ]} />
            )}
            {/* กล่องยอดรวมชิดขวา กว้างครึ่งหนึ่ง (จอแคบเต็มแถว · .doc-totals) — ชุดเดียวกับหน้าต่างใบของดีลเลอร์ */}
            <div style={{ borderTop: "1px solid #eef0f4", background: "#f7f9fc", padding: "10px 14px" }}>
              <div data-quote-totals className="doc-totals" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {แถวยอด.map(r => (
                  <div key={r.คีย์} data-total-row={r.คีย์} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: r.เด่น ? "0.9rem" : "0.78rem",
                    fontWeight: r.หนา ? 800 : 600, color: r.สี ?? (r.หนา ? PRIMARY : "#4b5563"),
                    ...(r.หนา ? { borderTop: "1px solid #e6eaf0", paddingTop: 6 } : {}) }}>
                    <span>{r.ป้าย}</span><span data-total-value style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.ค่า}</span>
                  </div>
                ))}
              </div>
            </div>
          </PanelSection>

          <PanelSection icon={TrendingUp} title="ดีลเลอร์ขายต่อเท่าไหร่">
            <div data-panel="quote-resale" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, padding: "10px 0 0" }}>
              {คอลัมน์ส่วนต่าง.map(c => (
                <div key={c.k}>
                  <div style={{ fontSize: "0.64rem", color: "#64748B" }}>{c.l}</div>
                  <div data-cell={c.k} data-value={ขายต่อ ? (c.n(ขายต่อ) ?? "") : ""} style={{ fontWeight: 800, color: ขายต่อ ? PRIMARY : "#94A3B8", whiteSpace: "nowrap" }}>{ขายต่อ === undefined ? "…" : ขายต่อ ? c.v(ขายต่อ) : "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "0.66rem", color: "#64748B", margin: "6px 0 10px" }}>
              {ขายต่อ === null ? "ใบนี้ไม่ได้ทำจากใบ HQ จึงไม่มีราคาจาก HQ ให้เทียบ" : "ราคาก่อนภาษี · ส่วนต่าง % = ส่วนต่าง ÷ ราคาขาย (สูตรเดียวกับการ์ดส่วนต่างกำไรเฉลี่ย)"}
            </div>
          </PanelSection>

          <PanelSection icon={TrendingUp} title="ส่วนต่างกำไรของดีลเลอร์ (เทียบใบ HQ)" bodyStyle={margin ? { padding: 0, overflow: "hidden" } : undefined}>
            {margin === undefined ? (
              <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>กำลังโหลด…</div>
            ) : !margin ? (
              <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>— ใบนี้ไม่ได้ทำจากใบ HQ จึงไม่มีต้นทุนให้เทียบ</div>
            ) : (
              <div data-panel="quote-margin">
                <div style={{ fontSize: "0.68rem", color: "#64748B", padding: "8px 12px 0" }}>จากใบ HQ {margin.hqQuoteNo} · ราคาก่อนภาษี</div>
                {/* ตารางรายการกลาง: จำนวน/หน่วยคนละคอลัมน์ (เดิมอยู่ใต้ชื่อเป็น "38 ตัน") หัวตรงแนวข้อมูล (บอสสั่ง 30 ต.ค. 69) */}
                <ตารางรายการ ป้าย="ส่วนต่างกำไรรายบรรทัด" แน่น กว้างขั้นต่ำ={640} แถว={margin.lines} คุณสมบัติแถว={(_l, i) => ({ "data-margin-line": String(i) })} คอลัมน์={[
                  { key: "name", หัว: "รายการ", ชนิด: "ข้อความ", กว้าง: "24%", ค่า: l => l.name, ชี้: l => l.name },
                  { key: "qty", หัว: "จำนวน", ชนิด: "จำนวน", กว้าง: "10%", ค่า: l => จัดรูปจำนวน(l.qty) },
                  { key: "unit", หัว: "หน่วย", ชนิด: "หน่วย", กว้าง: "10%", ค่า: l => จัดรูปหน่วย(l.unit) },
                  { key: "cost", หัว: "ต้นทุน/หน่วย", ชนิด: "เงิน", กว้าง: "14%", ค่า: l => <span data-cell="cost">{บาท2(l.unitCost)}</span> },
                  { key: "pct", หัว: "% ที่บวก", ชนิด: "ร้อยละ", กว้าง: "12%", ค่า: l => <span data-cell="pct">{เปอร์เซ็นต์(l.markupPct)}</span> },
                  { key: "price", หัว: "ราคาขาย/หน่วย", ชนิด: "เงิน", กว้าง: "15%", ค่า: l => <span data-cell="price">{บาท2(l.unitPrice)}</span> },
                  { key: "baht", หัว: "บวก (บาท)", ชนิด: "เงิน", กว้าง: "15%", สไตล์: () => ({ fontWeight: 700 }), ค่า: l => <span data-cell="baht">{บาท2(l.markupBaht)}</span> },
                ]} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "10px 12px" }}>
                  <div><div style={{ fontSize: "0.64rem", color: "#64748B" }}>บวกเพิ่มรวม</div><div style={{ fontWeight: 800, color: PRIMARY }} data-cell="sum-baht">{บาท2(margin.markupBaht)} บาท</div></div>
                  <div><div style={{ fontSize: "0.64rem", color: "#64748B" }}>% ของต้นทุน</div><div style={{ fontWeight: 800, color: PRIMARY }} data-cell="sum-pct-cost">{เปอร์เซ็นต์(margin.pctOfCost)}</div></div>
                  <div><div style={{ fontSize: "0.64rem", color: "#64748B" }}>% ของราคาขาย</div><div style={{ fontWeight: 800, color: PRIMARY }} data-cell="sum-pct-sale">{เปอร์เซ็นต์(margin.pctOfSale)}</div></div>
                </div>
                <div style={{ fontSize: "0.66rem", color: "#64748B", padding: "0 12px 10px" }}>ต้นทุนรวม {บาท2(margin.costTotal)} · ราคาขายรวม {บาท2(margin.saleTotal)}</div>
              </div>
            )}
          </PanelSection>

          <div data-hq-readonly-note style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: "#94A3B8", lineHeight: 1.5, marginTop: 14 }}>
            <FileText size={12} /> สำนักงานใหญ่ดูอย่างเดียว — แก้ไข/ลบใบได้ที่ดีลเลอร์เจ้าของใบ (ย้อนการตอบรับทำได้ที่สำนักงานใหญ่เท่านั้น)
          </div>
        </div>
      </div>
    </>
  );
}
