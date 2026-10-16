"use client";

// ─── กราฟวิเคราะห์ฐานข้อมูลลูกค้า ────────────────────────────────────────────────
// ทุกกราฟนับจาก "ใบเสนอราคาที่ปิดการขายได้" ของลูกค้าในผลกรอง
// ลูกค้าที่ไม่มีใบปิดการขาย จะไม่ปรากฏในกราฟที่เกี่ยวกับอาคาร (ไม่ใช่การซ่อน — ไม่มีข้อมูลจริง)
//
// เลือกชนิดกราฟตาม "รูปร่างข้อมูล" ไม่ใช่ตามความสวย:
//   โดนัท   = กลุ่มต้องไม่ทับกันและรวมกันได้ยอดจริง (ลูกค้า 1 ราย = ดีลเลอร์ 1 เจ้า → ใช้ได้)
//   แท่งตั้ง = เทียบค่าข้ามหมวดที่ป้ายสั้น (รหัสดีลเลอร์) และมี 2 ชุดตัวเลขหน่วยเดียวกัน
//   แท่งนอน = อันดับ/ป้ายไทยยาว
// การ์ด "ลูกค้า ตามประเภทอาคาร" (แม่แบบหลัก) และ "ลูกค้า ตามแม่แบบย่อย" ถอดออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
//   (charts.byType / charts.bySubtype ยังอยู่ใน type ของ ports แต่หน้านี้ไม่อ่านแล้ว)
import { useState } from "react";
import { TopNRows } from "@pms/shared/components/hq/TopNRows";
import { Donut, GroupedBarChart } from "@pms/shared/components/ui/Charts";
import type { HQCustomersCharts } from "@pms/shared/lib/data/ports";

const PRIMARY = "#003366";
// ชุดสีโดนัท — ไล่จากกรมท่าเข้ม (ดีลเลอร์รายใหญ่) ไปอ่อน · ก้อน "ดีลเลอร์อื่น" ใช้เทาเสมอ
const DEALER_RAMP = ["#003366", "#0d5c9e", "#0891b2", "#0d9488", "#7c3aed", "#d97706"];
const REST_COLOR = "#94a3b8";

type HRow = { label: string; value: number; note?: string };

/** โดนัท + แถวคำอธิบายที่เน้นก้อนเดียวกัน — ชี้ที่วงกลมหรือชี้ที่แถวก็ได้ผลเหมือนกัน
 *  (ตัวเน้นอยู่ที่นี่ที่เดียว แล้วส่งให้ทั้งสองฝั่งใช้ — ไม่งั้นชี้คนละที่ได้คนละผล) */
function DonutWithLegend({ segments, total, centerLabel }: {
  segments: { label: string; value: number; color: string }[]; total: number; centerLabel: string;
}) {
  const [เน้น, setเน้น] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Donut segments={segments} centerLabel={centerLabel} centerValue={`${total}`} size={150}
        activeIndex={เน้น} onActiveChange={setเน้น} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}
        onMouseLeave={() => setเน้น(null)}>
        {segments.map((s, i) => {
          const นี่แหละ = เน้น === i;
          const จาง = เน้น != null && !นี่แหละ;
          return (
            <div key={s.label}
              onMouseEnter={() => setเน้น(i)}
              onFocus={() => setเน้น(i)}
              onBlur={() => setเน้น(null)}
              tabIndex={0}
              aria-label={`${s.label} ${s.value} (${Math.round(s.value / (total || 1) * 100)}%)`}
              style={{
                display: "flex", alignItems: "center", gap: 7, fontSize: "0.7rem",
                padding: "2px 6px", margin: "0 -6px", borderRadius: 7, cursor: "default",
                background: นี่แหละ ? "var(--muted, #f1f5f9)" : "transparent",
                opacity: จาง ? 0.45 : 1,
                transition: "background 0.15s ease, opacity 0.15s ease",
              }}>
              <span style={{
                width: นี่แหละ ? 11 : 9, height: นี่แหละ ? 11 : 9, borderRadius: 3,
                background: s.color, flexShrink: 0, transition: "width 0.15s ease, height 0.15s ease",
              }} />
              <span style={{ flex: 1, color: "#374151", fontWeight: นี่แหละ ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <span style={{ fontWeight: 800, color: "#1F2937", fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
              <span style={{ color: "var(--muted-foreground)", minWidth: 32, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {Math.round(s.value / (total || 1) * 100)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** แท่งแนวนอน — เติมจากซ้าย (.bar-grow) ตามมาตรฐานแถบของระบบ · โชว์ 5 อันดับแรก ที่เหลือกดดู */
// ⚠️ ค่าตั้งต้นของข้อความว่างต้องเป็นประโยค ไม่ใช่ขีดเดียว (แก้ 10 ส.ค. 69)
//   เดิม empty = "—" การ์ดที่ไม่ได้ระบุข้อความเองจึงเหลือแค่ขีดในกล่องขาวสูง 340px
//   ผู้ใช้แยกไม่ออกว่า "ยังไม่มีข้อมูล" หรือ "การ์ดพัง" · การ์ดข้างกันที่ระบุข้อความไว้ทำถูกอยู่แล้ว
//   แก้ที่ค่าตั้งต้น = ครอบทุกการ์ดที่ยังไม่ได้ระบุ และการ์ดใหม่ในอนาคตก็ได้ของถูกมาตั้งแต่ต้น
function HBar({ rows, fmt, color = PRIMARY, empty = "— ยังไม่มีข้อมูลในผลกรองนี้", unit = "ราย" }: {
  rows: HRow[]; fmt: (v: number) => string; color?: string; empty?: string;
  /** หน่วยในปุ่ม "ดูทั้งหมด (อีก N ...)" — บอกให้ตรงกับสิ่งที่แถวนับ */
  unit?: string;
}) {
  // max คิดจากทุกแถวเสมอ (ไม่ใช่แค่แถวที่โชว์) — ไม่งั้นกด "ดูทั้งหมด" แล้วความยาวแท่งขยับ ทั้งที่ข้อมูลเท่าเดิม
  const max = Math.max(...rows.map(r => r.value), 0);
  if (!rows.length || max <= 0) return <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>{empty}</div>;
  return (
    <TopNRows topN={5} unit={unit} gap={10}>
      {rows.map((r, i) => (
        <div key={r.label}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: "0.72rem", color: "#2D2D2D", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
            <span style={{ fontSize: "0.7rem", fontWeight: 700, color: PRIMARY, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {fmt(r.value)}
              {r.note && <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}> · {r.note}</span>}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: "#eef1f5", overflow: "hidden" }}>
            <div
              className="bar-grow"
              style={{
                width: `${(r.value / max) * 100}%`, height: "100%", borderRadius: 99,
                background: color, transformOrigin: "left", animationDelay: `${i * 50}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </TopNRows>
  );
}

// chart-m = ความสูงมาตรฐาน 340px ของการ์ดกราฟคู่ (ดู globals.css)
// การ์ดพวกนี้เคยสูง 479–519px และโตตามจำนวนแถว → หน้ายาว 5 จอ
// ตรึงความสูงแล้วให้แถวที่เกินเลื่อนเอาในการ์ด — ทุกใบสูงเท่ากันเป็นชุด อ่านเป็น "แถว" ได้ทันที
// hint ไม่บังคับแล้ว — การ์ดที่ไม่ต้องการคำอธิบายกำกับ ส่งแค่ title ได้ (บอสสั่ง 27 ส.ค. 69)
function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card chart-m" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <div className="card-title">{title}</div>
        {/* คำอธิบายกำกับการ์ดถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
      </div>
      <div className="card-body" style={{ paddingTop: 12 }}>{children}</div>
    </div>
  );
}

// charts คำนวณที่ DB จากทั้งชุดที่กรองแล้วแล้ว (byProvince ตัด 10 อันดับแรกมาจาก DB) — M9 Phase 6, migration 0080
export function CustomerAnalytics({ charts }: { charts: HQCustomersCharts }) {
  // 1 · ลูกค้าตามดีลเลอร์
  const byDealer: HRow[] = charts.byDealer.map(d => ({ label: `${d.code} · ${d.name}`, value: d.value }));

  // 2b · โดนัท "ลูกค้า ตามดีลเลอร์" — ลูกค้า 1 ราย = ดีลเลอร์ 1 เจ้า → กลุ่มไม่ทับกัน รวมกันได้จำนวนลูกค้าจริง
  // ดีลเลอร์เกิน 6 เจ้ายุบเป็นก้อน "ดีลเลอร์อื่น" (ยังรวมได้ยอดเดิมเป๊ะ ไม่ตัดใครทิ้ง) — 10 ก้อนอ่านไม่ออก
  const dealerDonut = (() => {
    const top = byDealer.slice(0, 6).map((r, i) => ({ label: r.label, value: r.value, color: DEALER_RAMP[i] }));
    const rest = byDealer.slice(6);
    const restSum = rest.reduce((s, r) => s + r.value, 0);
    return restSum > 0
      ? [...top, { label: `ดีลเลอร์อื่น (${rest.length} เจ้า)`, value: restSum, color: REST_COLOR }]
      : top;
  })();
  const dealerTotal = dealerDonut.reduce((s, r) => s + r.value, 0);

  // 2 · ยอดซื้อตามดีลเลอร์ — แท่งตั้ง ชุดเดียว (ยอดซื้อสะสม)
  // ⚠️ อย่าเอา "เฉลี่ยต่อลูกค้า" มาวางเป็นแท่งคู่บนแกนเดียวกัน: ยอดสะสมสูงสุด ฿47M แต่ค่าเฉลี่ยแค่ ฿1.4–4.2M
  //    ต่างกัน ~30 เท่า → แท่งเฉลี่ยเตี้ยติดพื้นจนอ่านไม่ออก (ลองแล้ว) · ตัวเลขเฉลี่ยดูได้ที่ตารางด้านล่าง
  const revenueByDealer = charts.revenueByDealer;
  const toM = (v: number) => Math.round(v / 1e5) / 10; // บาท → ล้านบาท (ทศนิยม 1 ตำแหน่ง)

  // 3 · จังหวัด (10 อันดับแรก — ตัดมาจาก DB แล้ว)
  const byProvince: HRow[] = charts.byProvince;

  const cnt = (v: number) => `${v} ราย`;

  return (
    // คู่ 2 คอลัมน์: (ตามดีลเลอร์ · ยอดซื้อตามดีลเลอร์) — แถวสอง "ตามจังหวัด" กินเต็มแถว ไม่เว้นช่องว่างครึ่งแถว
    <div className="hq-cust-charts">
      <Card title="ลูกค้า ตามดีลเลอร์">
        {!dealerTotal ? (
          <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>—</div>
        ) : (
          // ชี้ที่ก้อนสี หรือชี้ที่แถวคำอธิบาย ก็เน้นก้อนเดียวกัน (บอสสั่ง 20 ส.ค. 69)
          <DonutWithLegend segments={dealerDonut} total={dealerTotal} centerLabel="ลูกค้า" />
        )}
      </Card>

      <Card title="ยอดซื้อ ตามดีลเลอร์">
        {!revenueByDealer.length ? (
          <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>—</div>
        ) : (
          <GroupedBarChart
            months={revenueByDealer.map(d => d.code)}
            vw={560} height={244}
            fmt={v => `${v.toFixed(1)}M`}
            series={[{ name: "ยอดซื้อสะสม", color: "#0891B2", data: revenueByDealer.map(d => toM(d.revenue)) }]}
          />
        )}
      </Card>

      <div style={{ gridColumn: "1 / -1" }}>
        <Card title="ลูกค้า ตามจังหวัด">
          <HBar rows={byProvince} fmt={cnt} color="#6366F1" unit="จังหวัด" />
        </Card>
      </div>

    </div>
  );
}
