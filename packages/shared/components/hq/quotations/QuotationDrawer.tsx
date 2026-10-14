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
import { FileText, User, Store, Wallet, Package, CalendarDays, CalendarClock, Clock, MapPin, IdCard, UserCheck, Building2, TrendingUp } from "lucide-react";
import { quoteRequests as quoteRequestsRepo } from "@pms/shared/lib/data";
import type { QuoteMargin } from "@pms/shared/lib/quoteRequests";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { quotationStatusLabel, quotationStatusColor } from "@pms/shared/lib/mock";
import { fmtBaht } from "@pms/shared/lib/format";
import { regionDisplay, type QuoteRow } from "@pms/shared/lib/hqQuotations";
import { PanelSection, PanelRow, PanelStats, PanelStat } from "@pms/shared/components/ui/DetailPanel";
import { SidePanel } from "@pms/shared/components/ui/SidePanel";

const PRIMARY = "#003366";
const บาท2 = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const เปอร์เซ็นต์ = (n: number | null) => n == null ? "—" : `${Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function QuotationDrawer({ quote, onClose }: {
  quote: QuoteRow;
  onClose: () => void;
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
      footerNote="สำนักงานใหญ่ดูอย่างเดียว — แก้ไข/ลบใบได้ที่ดีลเลอร์เจ้าของใบ"
    >
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
        <PanelRow icon={Building2} label="ประเภทอาคาร" value={quote.productLine} />
        <PanelRow icon={Wallet} label="มูลค่างาน (ก่อน VAT)" value={fmtBaht(quote.valueNum)} strong />
      </PanelSection>

      <PanelSection icon={Store} title="ข้อมูลดีลเลอร์">
        <PanelRow icon={IdCard} label="รหัสดีลเลอร์" value={quote.dealerCode} />
        <PanelRow icon={Store} label="ดีลเลอร์" value={quote.dealerName} />
        <PanelRow icon={MapPin} label="จังหวัด" value={quote.dealerProvince} />
        <PanelRow icon={MapPin} label="ภูมิภาค" value={regionDisplay(quote.region)} />
        <PanelRow icon={UserCheck} label="ผู้รับผิดชอบ" value={quote.salesperson} />
      </PanelSection>

      <PanelSection icon={TrendingUp} title="Margin ของดีลเลอร์ (เทียบใบ HQ)" bodyStyle={margin ? { padding: 0 } : undefined}>
        {margin === undefined ? (
          <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>กำลังโหลด…</div>
        ) : !margin ? (
          <div style={{ fontSize: "0.76rem", color: "#94A3B8", padding: "10px 0" }}>— ใบนี้ไม่ได้ทำจากใบ HQ จึงไม่มีต้นทุนให้เทียบ</div>
        ) : (
          <div data-panel="quote-margin">
            <div style={{ fontSize: "0.68rem", color: "#64748B", padding: "8px 12px 0" }}>จากใบ HQ {margin.hqQuoteNo} · ราคาก่อนภาษี</div>
            <div className="table-scroll">
              <table className="table" style={{ width: "100%", fontSize: "0.72rem" }} aria-label="margin รายบรรทัด">
                <thead><tr><th>รายการ</th><th style={{ textAlign: "right" }}>ต้นทุน/หน่วย</th><th style={{ textAlign: "right" }}>% ที่บวก</th><th style={{ textAlign: "right" }}>ราคาขาย/หน่วย</th><th style={{ textAlign: "right" }}>บวก (บาท)</th></tr></thead>
                <tbody>
                  {margin.lines.map((l, i) => (
                    <tr key={i} data-margin-line={i}>
                      <td>{l.name}<div style={{ color: "#94A3B8", fontSize: "0.64rem" }}>{Number(l.qty).toLocaleString()} {l.unit}</div></td>
                      <td style={{ textAlign: "right" }} data-cell="cost">{บาท2(l.unitCost)}</td>
                      <td style={{ textAlign: "right" }} data-cell="pct">{เปอร์เซ็นต์(l.markupPct)}</td>
                      <td style={{ textAlign: "right" }} data-cell="price">{บาท2(l.unitPrice)}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }} data-cell="baht">{บาท2(l.markupBaht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <div>
            {items.map((li, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 12px",
                borderTop: i ? "1px solid #F1F5F9" : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "#1F2937", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{li.name}</div>
                  <div style={{ fontSize: "0.66rem", color: "#64748B", marginTop: 2 }}>{li.qty.toLocaleString()} {li.unit} × {fmtBaht(li.unitPrice)}</div>
                </div>
                <div style={{ fontSize: "0.76rem", fontWeight: 800, color: "#1F2937", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {fmtBaht(li.qty * li.unitPrice)}
                </div>
              </div>
            ))}
          </div>
        )}
      </PanelSection>
    </SidePanel>
  );
}
