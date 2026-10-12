"use client";

// ─── แผงรายละเอียดลูกค้า (HQ ดูอย่างเดียว) ──────────────────────────────────────
// แท็บทั้งหมดอ่านจากข้อมูลจริง: ใบที่ปิดการขายได้ + รูปแม่แบบจาก Master Catalog
// ไม่มีแท็บสัญญา / ใบส่งมอบ / แบบก่อสร้าง — ระบบไม่มีที่เก็บข้อมูลเหล่านั้น
import { Building2, IdCard, MapPin, Compass, Store, Repeat, CalendarDays, Wallet, StickyNote, History, Activity } from "lucide-react";
import { PanelSection, PanelRow, PanelStats, PanelStat } from "@pms/shared/components/ui/DetailPanel";
import { SidePanel, type แท็บแผง } from "@pms/shared/components/ui/SidePanel";
import { customerCode, noteCategoryColor } from "@pms/shared/lib/mock";
import { fmtBaht } from "@pms/shared/lib/format";
import { toThaiDate } from "@pms/shared/lib/thaiDate";
import { useMasterCatalog } from "@pms/shared/lib/useMasterCatalog";
import { useCustomerNotesForDealer } from "@pms/shared/lib/useCustomerNotes";
import { type CustomerDbRow, type PurchasedBuilding } from "@pms/shared/lib/customerDb";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";

const noteColorOf = (cat: string) =>
  (noteCategoryColor as Record<string, { bg: string; text: string; dot: string }>)[cat] ?? noteCategoryColor["ทั่วไป"];

const PRIMARY = "#003366";

const Empty = ({ text }: { text: string }) => (
  <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)", padding: "8px 2px" }}>{text}</div>
);

/** รูปแม่แบบจาก Master Catalog — แม่แบบย่อยใช้รูปของตัวเอง ไม่มีก็ใช้รูปแม่แบบหลัก */
function BuildingThumb({ b }: { b: PurchasedBuilding }) {
  const catalog = useMasterCatalog();
  const product = catalog.find(p => p.name === b.buildingType);
  const src = (b.template && product?.subtypeImages?.[b.template]) || product?.image;

  if (!src) {
    return (
      <div style={{ width: 56, height: 56, borderRadius: 8, background: "#eef1f5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Building2 size={20} color="#9ca3af" />
      </div>
    );
  }
  // รูปเป็น data URL ที่ย่อขนาดแล้วใน Master Catalog — ใช้ <img> ตรง ๆ (next/image ไม่รองรับ data URL แบบนี้)
   
  return <img src={src} alt={b.template ?? b.buildingType} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />;
}

function BuildingCard({ b }: { b: PurchasedBuilding }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: 10, border: "1px solid #e9edf2", borderRadius: 10 }}>
      <BuildingThumb b={b} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#2D2D2D" }}>{b.template ?? b.buildingType}</div>
        <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>
          {b.buildingType} · {b.quoteNo}
        </div>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: PRIMARY, marginTop: 4 }}>{fmtBaht(b.value)}</div>
      </div>
    </div>
  );
}

export function CustomerDrawer({ row, onClose }: { row: CustomerDbRow | null; onClose: () => void }) {
  // ต้องเรียก hook ก่อน early-return เสมอ (Rules of Hooks) — dealerCode ว่างตอน row ยังไม่มา ก็ไม่ยิง fetch
  const { notes: dealerNotes } = useCustomerNotesForDealer(row ? dealerCodeOf(row) : "");
  if (!row) return null;

  const customerNotes = dealerNotes.filter(n => n.customerId === (row.localId ?? row.id));
  const totalBought = row.buildings.reduce((s, b) => s + b.value, 0);

  const tabs: แท็บแผง[] = [
    {
      key: "profile",
      label: "โปรไฟล์",
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
            <PanelRow icon={MapPin} label="จังหวัด" value={row.province} />
            <PanelRow icon={Compass} label="ภาค" value={row.region} />
            <PanelRow icon={Repeat} label="ลูกค้าซื้อซ้ำ" value={row.isRepeat ? "ใช่" : "ไม่ใช่"} />
          </PanelSection>
          <PanelSection icon={Store} title="ดีลเลอร์ที่ดูแล">
            <PanelRow icon={IdCard} label="รหัสดีลเลอร์" value={row.dealerCode} />
            <PanelRow icon={Store} label="ดีลเลอร์" value={row.dealerName} />
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
    {
      key: "buildings",
      label: `อาคารที่ซื้อ (${row.buildings.length})`,
      content: row.buildings.length ? (
        <PanelSection icon={Building2} title="อาคารที่ซื้อแล้ว" style={{ marginTop: 0 }} bodyStyle={{ padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {row.buildings.map(b => <BuildingCard key={b.quoteNo} b={b} />)}
        </PanelSection>
      ) : <Empty text="ยังไม่มีอาคารที่ปิดการขายในระบบสำหรับลูกค้ารายนี้" />,
    },
    {
      key: "history",
      label: "ประวัติการซื้อ",
      content: row.buildings.length ? (
        <PanelSection icon={History} title="ประวัติการซื้อ" style={{ marginTop: 0 }} bodyStyle={{ padding: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...row.buildings].reverse().map(b => (
              <div key={b.quoteNo} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 11px", border: "1px solid #e9edf2", borderRadius: 9 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.74rem", fontWeight: 700, color: "#2D2D2D" }}>{b.quoteNo}</div>
                  <div style={{ fontSize: "0.65rem", color: "#6b7280", marginTop: 2 }}>{b.template ?? b.buildingType} · ปิดการขาย {b.wonDate}</div>
                </div>
                <div style={{ fontSize: "0.74rem", fontWeight: 700, color: PRIMARY, whiteSpace: "nowrap" }}>{fmtBaht(b.value)}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", fontSize: "0.76rem", fontWeight: 800, color: PRIMARY }}>
            <span>รวมจากใบที่ปิดการขาย</span><span>{fmtBaht(totalBought)}</span>
          </div>
        </PanelSection>
      ) : <Empty text="ไม่มีใบเสนอราคาที่ปิดการขายได้ผูกกับลูกค้ารายนี้" />,
    },
    // ⚠️ เคยมีแท็บ "การส่งมอบ" ตรงนี้ — ลบทั้งแท็บแล้ว (บอสสั่ง 20 ส.ค. 69)
    //    ไม่มีที่กรอกวันส่งมอบจริงทั้งฝั่งดีลเลอร์และสำนักงานใหญ่ · ที่โชว์อยู่คือ
    //    "วันปิดการขาย + 90 วัน" ที่ระบบคิดเอง = ตัวเลขที่ไม่มีอยู่จริงในงาน
    {
      key: "timeline",
      label: "ไทม์ไลน์",
      content: row.buildings.length ? (
        <PanelSection icon={Activity} title="ไทม์ไลน์" style={{ marginTop: 0 }} bodyStyle={{ padding: "12px 14px" }}>
          {row.buildings.flatMap(b => [
            { at: b.wonAt, label: `ปิดการขาย ${b.quoteNo}`, sub: `${b.template ?? b.buildingType} · ${fmtBaht(b.value)}`, color: PRIMARY },
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
      ) : <Empty text="ยังไม่มีเหตุการณ์ — ไทม์ไลน์เริ่มจากใบที่ปิดการขายได้" />,
    },
  ];

  return (
    <SidePanel
      label="รายละเอียดลูกค้า"
      onClose={onClose}
      title={row.name}
      subtitle={`${row.dealerCode} · ${row.dealerName} · ${row.province}`}
      badges={[
        { ข้อความ: row.totalRevenue > 0 ? fmtBaht(row.totalRevenue) : "ยังไม่มียอดซื้อ" },
        ...(row.buildings.length ? [{ ข้อความ: `${row.buildings.length} อาคาร` }] : []),
        ...(row.isRepeat ? [{ ข้อความ: "ลูกค้าซื้อซ้ำ", พื้น: "#DCFCE7", ตัวอักษร: "#166534" }] : []),
      ]}
      tabs={tabs}
      footerNote="สำนักงานใหญ่ดูอย่างเดียว — แก้ไขได้ที่ดีลเลอร์เจ้าของลูกค้า"
      width={460}
    />
  );
}
