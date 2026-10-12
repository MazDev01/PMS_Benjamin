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
import { FileText, User, Store, Wallet, Package, CalendarDays, CalendarClock, Clock, MapPin, IdCard, UserCheck, Building2 } from "lucide-react";
import { quotationStatusLabel, quotationStatusColor } from "@pms/shared/lib/mock";
import { fmtBaht } from "@pms/shared/lib/format";
import { regionDisplay, type QuoteRow } from "@pms/shared/lib/hqQuotations";
import { PanelSection, PanelRow, PanelStats, PanelStat } from "@pms/shared/components/ui/DetailPanel";
import { SidePanel } from "@pms/shared/components/ui/SidePanel";

const PRIMARY = "#003366";

export function QuotationDrawer({ quote, onClose }: {
  quote: QuoteRow;
  onClose: () => void;
}) {
  const sc = quotationStatusColor[quote.status];
  const items = quote.lineItems ?? [];
  // ใบที่ปิดการขายแล้ว/ยังไม่ได้ส่ง อ่านจากสถานะเดียวกับที่ตารางใช้ — ไม่คิดเงื่อนไขใหม่ให้ขัดกัน
  const ปิดการขายแล้ว = quote.status === "won";
  const หมดอายุ = quote.status === "expired";

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
