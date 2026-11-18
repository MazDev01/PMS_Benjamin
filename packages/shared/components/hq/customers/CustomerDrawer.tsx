"use client";

// ─── แผงรายละเอียดลูกค้า (HQ ดูอย่างเดียว) ──────────────────────────────────────
// แท็บทั้งหมดอ่านจากข้อมูลจริง: ใบที่ปิดการขายได้ (รูปแม่แบบเอาออกแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
// ไม่มีแท็บสัญญา / ใบส่งมอบ / แบบก่อสร้าง — ระบบไม่มีที่เก็บข้อมูลเหล่านั้น
import { DataLink } from "../../ui/RecordLink";
import { Building2, IdCard, MapPin, Compass, Store, Repeat, CalendarDays, Wallet, StickyNote, Activity, User, Phone, Mail, Home } from "lucide-react";
import { ช่อง } from "@pms/shared/lib/fieldLabels";
import { PanelSection, PanelRow, PanelStats, PanelStat } from "@pms/shared/components/ui/DetailPanel";
import { SidePanel, type แท็บแผง } from "@pms/shared/components/ui/SidePanel";
import { customerCode, noteCategoryColor } from "@pms/shared/lib/mock";
import { fmtBaht } from "@pms/shared/lib/format";
import { toThaiDate } from "@pms/shared/lib/thaiDate";
import { useCustomerNotesForDealer } from "@pms/shared/lib/useCustomerNotes";
import { type CustomerDbRow } from "@pms/shared/lib/customerDb";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { ชื่อภาค } from "@pms/shared/lib/provinces";
import { useDealerNames } from "@pms/shared/lib/dealerDisplay";
import type { QuotationMock } from "@pms/shared/lib/mock";
import { PurchaseHistory } from "@pms/shared/components/ui/PurchaseHistory";

const noteColorOf = (cat: string) =>
  (noteCategoryColor as Record<string, { bg: string; text: string; dot: string }>)[cat] ?? noteCategoryColor["ทั่วไป"];

const PRIMARY = "#003366";

const Empty = ({ text }: { text: string }) => (
  <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)", padding: "8px 2px" }}>{text}</div>
);

/** ใบ = ใบที่ลูกค้าตอบรับของลูกค้ารายนี้ (null = กำลังโหลด · ไม่ส่ง = โหมดเดโม ใช้อาคารจาก row) */
export function CustomerDrawer({ row, onClose, ใบ: ใบที่ส่ง }: { row: CustomerDbRow | null; onClose: () => void; ใบ?: QuotationMock[] | null }) {
  const ชื่อของ = useDealerNames();   // ชื่อแสดง ไม่มีรหัส · ชื่อซ้ำ = "ชื่อ (รหัส)" (บอสสั่ง 6 พ.ย. 69)
  // ต้องเรียก hook ก่อน early-return เสมอ (Rules of Hooks) — dealerCode ว่างตอน row ยังไม่มา ก็ไม่ยิง fetch
  const { notes: dealerNotes } = useCustomerNotesForDealer(row ? dealerCodeOf(row) : "");
  if (!row) return null;

  const customerNotes = dealerNotes.filter(n => n.customerId === (row.localId ?? row.id));
  // โหมดเดโม (ไม่ส่งใบ) = แปลงอาคารที่ซื้อจาก row เป็นใบอย่างย่อ (ไม่มีรายการ/ไฟล์ = "—")
  const ใบ: QuotationMock[] | null = ใบที่ส่ง !== undefined ? ใบที่ส่ง : row.buildings.map(b => ({
    id: b.quoteNo, customer: row.name, project: "", total: "", totalValue: b.value, materialCost: 0, province: row.province, buildingType: "", area: 0,
    status: "won", date: b.wonAt ? b.wonAt.toISOString().slice(0, 10) : "", items: 0, wonAt: b.wonAt ? b.wonAt.toISOString() : null,
    customerId: row.localId ?? row.id, projectId: 0, dealerCode: row.dealerCode,
  }) as QuotationMock);

  const tabs: แท็บแผง[] = [
    {
      key: "profile",
      label: "ข้อมูลลูกค้า",
      content: (
        <>
          {/* ตัวเลขสำคัญอยู่บนสุด — เห็นก่อนเลื่อนจอ (มาตรฐานเดียวกับแผงลูกค้าเป้าหมายทั้งเครือ) */}
          <PanelStats>
            <PanelStat label="ยอดซื้อรวม" value={row.totalRevenue > 0 ? fmtBaht(row.totalRevenue) : "—"} />
            <PanelStat label="อาคารที่ซื้อแล้ว" value={row.buildings.length ? `${row.buildings.length} อาคาร` : "—"}
              sub={row.lastPurchase ? `ซื้อล่าสุด ${row.lastPurchase}` : undefined} />
          </PanelStats>
          <PanelSection icon={IdCard} title="ข้อมูลลูกค้า" style={{ marginTop: 14 }}>
            <PanelRow icon={IdCard} label="รหัสลูกค้า" value={customerCode(row.dealerCode, row.localId ?? row.id)} />
            {/* ชุดช่องมาตรฐานข้อมูลลูกค้า (FLOW · fieldLabels.ts) — ข้อมูลที่ดีลเลอร์กรอกครั้งเดียวแล้วไหลมาถึง HQ
                เดิมหมวดนี้มีแค่ รหัส/จังหวัด/ภาค/ซื้อซ้ำ (ตรวจเทียบ FLOW รอบ 5 · แถว 29) · ไม่มีข้อมูล = "—" */}
            <PanelRow icon={User} label={ช่อง.ผู้ติดต่อ} value={row.contact} />
            <PanelRow icon={Phone} label={ช่อง.โทรศัพท์} value={row.phone} />
            <PanelRow icon={Mail} label={ช่อง.อีเมล} value={row.email} />
            <PanelRow icon={Home} label={ช่อง.ที่อยู่} value={row.address} />
            <PanelRow icon={MapPin} label={ช่อง.จังหวัด} value={row.province} />
            <PanelRow icon={Compass} label="ภาค" value={ชื่อภาค(row.region)} />
            <PanelRow icon={Repeat} label="ลูกค้าซื้อซ้ำ" value={row.isRepeat ? "ใช่" : "ไม่ใช่"} />
          </PanelSection>
          <PanelSection icon={Store} title="ดีลเลอร์ที่ดูแล">
            <PanelRow icon={Store} label="ดีลเลอร์" value={<DataLink เป้า={{ ชนิด: "dealer", รหัส: row.dealerCode }}>{ชื่อของ(row.dealerCode, row.dealerName)}</DataLink>} />
          </PanelSection>
          <PanelSection icon={Wallet} title="สรุปการซื้อ">
            <PanelRow icon={Wallet} label="ยอดซื้อรวม" value={row.totalRevenue > 0 ? fmtBaht(row.totalRevenue) : undefined} strong />
            <PanelRow icon={Building2} label="อาคารที่ซื้อแล้ว" value={row.buildings.length ? `${row.buildings.length} อาคาร` : undefined} />
            <PanelRow icon={CalendarDays} label="ซื้อล่าสุด" value={row.lastPurchase} />
          </PanelSection>
        </>
      ),
    },
    {
      key: "notes",
      label: `บันทึก (${customerNotes.length})`,
      content: customerNotes.length ? (
        <PanelSection icon={StickyNote} title="บันทึกของลูกค้า" style={{ marginTop: 0 }} bodyStyle={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          {customerNotes.map(n => {
            const c = noteColorOf(n.category);
            return (
              <div key={n.id} style={{ padding: "10px 12px", borderRadius: 10, background: "#f8f9fb", border: "1px solid #eef0f4" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</span>
                  <span style={{ fontSize: "0.65rem", color: "#6b7280" }}>{n.updatedAt}</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#4b5563", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{n.content}</div>
                <div style={{ fontSize: "0.63rem", color: "#9ca3af", marginTop: 6 }}>โดย {n.author || "—"}</div>
              </div>
            );
          })}
        </PanelSection>
      ) : <Empty text="ยังไม่มีบันทึกของลูกค้ารายนี้ (ดูอย่างเดียว — แก้ไขได้ที่หน้าลูกค้าฝั่งดีลเลอร์)" />,
    },
    // ประวัติการซื้อ (บอสสั่ง 18 พ.ย. 69): แท็บ "อาคารที่ซื้อ" เปลี่ยนเป็น "ประวัติการซื้อ" ตำแหน่งเดิม · รวมกับแท็บประวัติการซื้อเดิม (ของเดิมทั้งสองแท็บ = ใบที่ตอบรับ ไม่มีของซ้ำ)
    //   ตัวกลาง PurchaseHistory (HQ + ดีลเลอร์) · กดรายการ = รายละเอียดงาน + รายการที่ซื้อ + รูปแปลน · ระหว่างโหลด = กำลังโหลด (ไม่ใช่ว่างหลอก)
    {
      key: "purchases",
      label: ใบ === null ? "ประวัติการซื้อ" : `ประวัติการซื้อ (${(ใบ ?? []).filter(q => q.status === "won").length})`,
      content: <PurchaseHistory ใบ={ใบ ?? null} ฝั่ง="hq" />,
    },
    // ⚠️ เคยมีแท็บ "การส่งมอบ" ตรงนี้ — ลบทั้งแท็บแล้ว (บอสสั่ง 20 ส.ค. 69)
    //    ไม่มีที่กรอกวันส่งมอบจริงทั้งฝั่งดีลเลอร์และสำนักงานใหญ่ · ที่โชว์อยู่คือ
    //    "วันปิดการขาย + 90 วัน" ที่ระบบคิดเอง = ตัวเลขที่ไม่มีอยู่จริงในงาน
    {
      key: "timeline",
      label: "ประวัติ",
      content: row.buildings.length ? (
        <PanelSection icon={Activity} title="ประวัติ" style={{ marginTop: 0 }} bodyStyle={{ padding: "12px 14px" }}>
          {row.buildings.flatMap(b => [
            { at: b.wonAt, label: `ปิดการขาย ${b.quoteNo}`, sub: fmtBaht(b.value), color: PRIMARY },
          ])
            .filter((e): e is { at: Date; label: string; sub: string; color: string } => !!e.at)
            .sort((a, b) => b.at.getTime() - a.at.getTime())
            .map((e, i, arr) => (
              <div key={`${e.label}-${i}`} style={{ display: "flex", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: e.color, marginTop: 5 }} />
                  {i < arr.length - 1 && <span style={{ flex: 1, width: 2, background: "#e9edf2" }} />}
                </div>
                <div style={{ paddingBottom: i < arr.length - 1 ? 14 : 0, minWidth: 0 }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#2D2D2D" }}>{e.label}</div>
                  <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 1 }}>
                    {toThaiDate(e.at)}{e.sub && ` · ${e.sub}`}
                  </div>
                </div>
              </div>
            ))}
        </PanelSection>
      ) : <Empty text="ยังไม่มีเหตุการณ์ — ประวัติเริ่มจากใบที่ปิดการขายสำเร็จ" />,
    },
  ];

  return (
    <SidePanel
      label="รายละเอียดลูกค้า"
      onClose={onClose}
      title={row.name}
      subtitle={<><DataLink พื้นเข้ม เป้า={{ ชนิด: "dealer", รหัส: row.dealerCode }}>{ชื่อของ(row.dealerCode, row.dealerName)}</DataLink> · {row.province}</>}
      badges={[
        { ข้อความ: row.totalRevenue > 0 ? fmtBaht(row.totalRevenue) : "ยังไม่มียอดซื้อ" },
        ...(row.buildings.length ? [{ ข้อความ: `${row.buildings.length} อาคาร` }] : []),
        ...(row.isRepeat ? [{ ข้อความ: "ลูกค้าซื้อซ้ำ", พื้น: "#DCFCE7", ตัวอักษร: "#166534" }] : []),
      ]}
      tabs={tabs}
      footerNote="สำนักงานใหญ่ดูอย่างเดียว — แก้ไขได้ที่ดีลเลอร์เจ้าของลูกค้า"
    />
  );
}
