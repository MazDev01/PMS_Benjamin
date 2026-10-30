"use client";

// ─── ลิ้นชักรายละเอียดใบเสนอราคา (เปิดจากปุ่ม "ดู" — ไม่เปลี่ยนหน้า) ──────────
// อ่านอย่างเดียว ไม่มีปุ่มแก้ไข/ลบ/อนุมัติ
//
// หน้าตาต้องเป็นชุดเดียวกับแผง "ลูกค้าเป้าหมายทั้งเครือ" (บอสสั่ง 2 ก.ย. 69)
//   แผงลอยจากขอบจอ มนทุกมุม · หัวแผงมีวงย่อชื่อ + ป้ายสถานะ/มูลค่า
//   · การ์ดสรุปบนสุด · เนื้อหาแบ่งเป็นการ์ดหัวข้อพร้อมไอคอน (PanelSection/PanelRow)
//   ใช้ชิ้นส่วนกลางชุดเดียวกัน (DetailPanel) — แก้ที่เดียวแล้วเปลี่ยนเหมือนกันทุกหน้า
//
// สิ่งที่ระบบไม่มีข้อมูล จึงไม่แสดง (ห้ามกุ):
//  · ประวัติการเปิดอ่าน — ลบทั้งฟีเจอร์แล้ว (ไม่มีการติดตามจริง)
//  · ไทม์ไลน์/ประวัติการแก้ไขของ "ใบเสนอราคา" — ระบบเก็บไทม์ไลน์ไว้ที่ดีล ไม่ได้ผูกรายใบ
//  · เอกสารแนบรายใบ — คลังไฟล์ผูกกับลูกค้า/ลูกค้าเป้าหมาย ไม่ได้ผูกกับเลขที่ใบเสนอราคา
//  · รายการสินค้า — มีเฉพาะใบที่ดีลเลอร์สร้างจริง ที่เหลือขึ้น "—"
//
// margin (ด่าน 3 · FLOW "% ที่ดีลเลอร์บวก → HQ ดู margin"): ใบที่ทำจากใบ HQ แสดงรายบรรทัด
//   ต้นทุนจากใบ HQ · % ที่บวก · ราคาขาย · ส่วนบวกเป็นบาท + สรุปทั้งใบ บวกรวม (บาท) · % ของต้นทุน · % ของราคาขาย
//   ตัวเลขคิดที่ฐานข้อมูล (quotation_margin · ใบ 0201) ไม่คิดซ้ำที่หน้าจอ · ราคาก่อนภาษี
//   ใบเดิมที่ไม่ได้ทำจากใบ HQ = ไม่มีต้นทุนให้เทียบ → ขึ้นว่าไม่มีข้อมูล (ห้ามกุ)
import { useEffect, useState } from "react";
import { FileText, User, Store, Wallet, Package, CalendarDays, CalendarClock, Clock, MapPin, IdCard, UserCheck, TrendingUp } from "lucide-react";
import { quoteRequests as quoteRequestsRepo } from "@pms/shared/lib/data";
import type { QuoteMargin } from "@pms/shared/lib/quoteRequests";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { quotationStatusLabel, quotationStatusColor } from "@pms/shared/lib/mock";
import { fmtBaht } from "@pms/shared/lib/format";
import { regionDisplay, type QuoteRow } from "@pms/shared/lib/hqQuotations";
import { PanelSection, PanelRow, PanelStats, PanelStat } from "@pms/shared/components/ui/DetailPanel";
import { SidePanel } from "@pms/shared/components/ui/SidePanel";
import { ถามเหตุผล, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { ช่อง } from "@pms/shared/lib/fieldLabels";
import { ตารางรายการ } from "@pms/shared/components/ui/LineItemsTable";
import { จัดรูปจำนวน, จัดรูปหน่วย } from "@pms/shared/lib/lineItemColumns";

const PRIMARY = "#003366";
const บาท2 = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const เปอร์เซ็นต์ = (n: number | null) => n == null ? "—" : `${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function QuotationDrawer({ quote, onClose, onChanged }: {
  quote: QuoteRow;
  onClose: () => void;
  /** สถานะใบเปลี่ยน (HQ ย้อนการตอบรับ) — ให้หน้าแม่โหลดตารางใหม่ */
  onChanged?: () => void;
}) {
  const sc = quotationStatusColor[quote.status];
  const items = quote.lineItems ?? [];
  // ใบที่ปิดการขายแล้ว/ยังไม่ได้ส่ง อ่านจากสถานะเดียวกับที่ตารางใช้ — ไม่คิดเงื่อนไขใหม่ให้ขัดกัน
  const ปิดการขายแล้ว = quote.status === "won";
  const หมดอายุ = quote.status === "expired";
  const [margin, setMargin] = useState<QuoteMargin | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setMargin(undefined);
    quoteRequestsRepo.margin(quote.dealerCode, quote.quoteNo)
      .then(m => alive && setMargin(m))
      .catch(e => { logRepoRead("quoteRequests.margin", e); if (alive) setMargin(null); });
    return () => { alive = false; };
  }, [quote.dealerCode, quote.quoteNo]);

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

  return (
    <SidePanel
      label="รายละเอียดใบเสนอราคา"
      onClose={onClose}
      title={quote.quoteNo}
      subtitle={`${quote.customer} · ${quote.dealerCode}`}
      badges={[
        { ข้อความ: quotationStatusLabel[quote.status], พื้น: sc.bg, ตัวอักษร: sc.text },
        { ข้อความ: fmtBaht(quote.valueNum) },
      ]}
      footerNote="สำนักงานใหญ่ดูอย่างเดียว — แก้ไข/ลบใบได้ที่ดีลเลอร์เจ้าของใบ (ย้อนการตอบรับทำได้ที่สำนักงานใหญ่เท่านั้น)"
    >
      {ปิดการขายแล้ว && (
        <div data-panel="revert-won" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: "0.74rem", color: "#9A3412" }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>ลูกค้าตอบรับแล้ว — ดีลเลอร์เปลี่ยนสถานะเองไม่ได้ ถ้าตอบรับผิด สำนักงานใหญ่ย้อนได้พร้อมเหตุผล</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={ย้อนอยู่} onClick={() => void ย้อน("sent_to_client")}>ย้อนเป็นส่งให้ลูกค้าแล้ว</button>
            <button type="button" className="btn btn-sm" disabled={ย้อนอยู่} onClick={() => void ย้อน("lost")}
              style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>ย้อนเป็นลูกค้าปฏิเสธ</button>
          </div>
        </div>
      )}
      {/* แถบสรุปบนสุด — มูลค่ากับอายุใบ อ่านได้ตั้งแต่ยังไม่เลื่อนจอ (เหมือนแผงลูกค้าเป้าหมาย) */}
      <PanelStats>
        <PanelStat label="มูลค่างาน (ก่อน VAT)" value={fmtBaht(quote.valueNum)} />
        <PanelStat
          label="สถานะใบ"
          tone={ปิดการขายแล้ว ? "good" : "plain"}
          value={quotationStatusLabel[quote.status]}
          sub={หมดอายุ ? "เลยวันที่ยืนราคาแล้ว"
            : quote.agingDays != null ? `อายุใบ ${quote.agingDays} วัน` : undefined}
        />
      </PanelStats>

      <PanelSection icon={FileText} title="ข้อมูลใบเสนอราคา">
        <PanelRow icon={CalendarDays} label="วันที่สร้าง" value={quote.createdAt} />
        <PanelRow icon={CalendarClock} label="ใช้ได้ถึง" value={quote.validUntil} />
        <PanelRow icon={Clock} label="อายุใบ" value={quote.agingDays != null ? `${quote.agingDays} วัน` : undefined} />
      </PanelSection>

      <PanelSection icon={User} title="ข้อมูลลูกค้า">
        <PanelRow icon={User} label="ชื่อลูกค้า" value={quote.customer} />
        {/* ช่องนี้เดิมป้าย "ประเภทอาคาร" แต่ค่าจริงคือชื่องานของใบ (productLine = project · แม่แบบอาคารเอาออกแล้ว 16 ต.ค. 69)
            FLOW ไม่มีแม่แบบอาคาร → เอาป้ายประเภทอาคารออก ใช้คำของ FLOW "งานที่ต้องการ" (บอสสั่ง 28 ต.ค. 69) */}
        <PanelRow icon={FileText} label={ช่อง.งาน} value={quote.productLine} />
        <PanelRow icon={Wallet} label="มูลค่างาน (ก่อน VAT)" value={fmtBaht(quote.valueNum)} strong />
      </PanelSection>

      <PanelSection icon={Store} title="ข้อมูลดีลเลอร์">
        <PanelRow icon={IdCard} label="รหัสดีลเลอร์" value={quote.dealerCode} />
        <PanelRow icon={Store} label="ดีลเลอร์" value={quote.dealerName} />
        <PanelRow icon={MapPin} label="จังหวัด" value={quote.dealerProvince} />
        <PanelRow icon={MapPin} label="ภูมิภาค" value={regionDisplay(quote.region)} />
        <PanelRow icon={UserCheck} label="ผู้รับผิดชอบ" value={quote.salesperson} />
      </PanelSection>

      <PanelSection icon={TrendingUp} title="ส่วนต่างกำไรของดีลเลอร์ (เทียบใบ HQ)" bodyStyle={margin ? { padding: 0 } : undefined}>
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

      <PanelSection icon={Package} title="รายการสินค้า" bodyStyle={items.length ? { padding: 0 } : undefined}>
        {!items.length ? (
          <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>
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
      </PanelSection>
    </SidePanel>
  );
}
