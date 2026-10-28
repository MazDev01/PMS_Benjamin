"use client";

// ─── ส่วนวิเคราะห์ใบเสนอราคาทั้งเครือ ─────────────────────────────────────────
// ลูกค้าเป้าหมาย→ใบเสนอราคา · แนวโน้ม 12 เดือน · เทียบรายภูมิภาค · เหตุผลที่เสียโอกาส · อายุใบที่ค้าง
// (มูลค่าเทียบยอดขายจริง + อันดับดีลเลอร์ = ผลงานดีลเลอร์ → ย้ายไปภาพรวมยอดขายที่เดียว ตาม FLOW รอบ 5)
// ใช้เฉพาะแท่ง/แท่งแนวนอน/แท่งซ้อน/เส้น — ไม่มีกรวย/วงกลม/เกจ
//
// ไม่มี "อัตราการเปิดอ่าน" และ "การใช้แม่แบบ" — ระบบไม่มีข้อมูลรองรับทั้งสองอย่าง (ห้ามกุ)
// ไม่มีกราฟ "ประเภทอาคาร" (จัดกลุ่มตามแม่แบบ) แล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
import { QuotationTrendChart } from "./QuotationTrendChart";
import { QuotationAgingChart } from "./QuotationAgingChart";
import { LeadsVsQuotationsChart } from "./LeadsVsQuotationsChart";
import { TopNRows } from "@pms/shared/components/hq/TopNRows";
import { LostReasonsChart } from "./LostReasonsChart";
import { sumAggs, regionDisplay, type DealerAgg, type AgingBucket } from "@pms/shared/lib/hqQuotations";
import { fmtBaht } from "@pms/shared/lib/format";

const RAMP = ["#003366", "#0891b2", "#059669", "#d97706", "#7c3aed", "#dc2626"];

// ── #6 เทียบรายภูมิภาค — จำนวนใบ · มูลค่า ──
function RegionalComparison({ dealerAgg }: { dealerAgg: DealerAgg[] }) {
  const byRegion = new Map<string, DealerAgg[]>();
  dealerAgg.forEach(d => { const a = byRegion.get(d.region); if (a) a.push(d); else byRegion.set(d.region, [d]); });
  const regions = [...byRegion.entries()]
    .map(([region, list]) => ({ region, ...sumAggs(list) }))
    .sort((a, b) => b.value - a.value);
  const maxV = Math.max(...regions.map(r => r.value), 1);
  const maxC = Math.max(...regions.map(r => r.count), 1);

  return (
    // chart-l = สูงเท่าการ์ดคู่ (อัตราลูกค้าเป้าหมายที่ออกใบ · chart-l) — การ์ดคู่ต้องสูงเท่ากัน
    <div className="card chart-l" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <div className="card-title">เทียบรายภูมิภาค</div>
        {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
      </div>
      <div className="card-body" style={{ paddingTop: 6, display: "flex", flexDirection: "column" }}>
        {!regions.length ? (
          <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>—</div>
        ) : (
        <TopNRows topN={4} unit="ภาค" gap={14}>
          {regions.map((r, i) => (
          <div key={r.region}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.74rem", marginBottom: 4 }}>
              <span style={{ color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{regionDisplay(r.region)}</span>
              <span style={{ display: "flex", gap: 8, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontWeight: 800, color: "#1F2937" }}>{fmtBaht(r.value)}</span>
              </span>
            </div>
            <div style={{ height: 7, background: "var(--muted)", borderRadius: 999, overflow: "hidden", marginBottom: 3 }}>
              <div className="bar-grow" style={{ height: "100%", width: `${Math.round(r.value / maxV * 100)}%`, background: RAMP[i % RAMP.length], borderRadius: 999 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 4, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${Math.round(r.count / maxC * 100)}%`, background: "#C0C0C0", borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: "0.62rem", color: "var(--muted-foreground)", fontWeight: 700, minWidth: 44, textAlign: "right" }}>{r.count} ใบ</span>
            </div>
          </div>
          ))}
        </TopNRows>
        )}
      </div>
    </div>
  );
}

// ── #3 อันดับดีลเลอร์ + #2 มูลค่าใบเสนอราคา เทียบ ยอดขายจริง — เอาออกจากหน้านี้ (ตรวจเทียบ FLOW รอบ 5 · 28 ต.ค. 69)
//   FLOW: "ผลงานดีลเลอร์ (ยอดขาย เป้า อัตราปิด) — ทำได้ที่เดียว: HQ › ภาพรวมยอดขาย"
//   ทั้งสองใบเป็นผลงานรายดีลเลอร์ (ขายได้จริง · อันดับ · อัตราตอบรับ) → ดูที่ /hq/pipeline ที่เดียว
//   ห้ามเอากลับมา · ข้อทดสอบ hq-quotations.spec.ts "[H10] ไม่มีผลงานดีลเลอร์"

export function QuotationAnalytics({ dealerAgg, aging, trend, หน่วยเวลา, leadsByDealer, lostReasons, unspecifiedLost, totalLost }: {
  dealerAgg: DealerAgg[];
  aging: { key: AgingBucket; count: number; value: number }[];
  trend: { months: string[]; bar: number[]; line: number[] };
  /** ป้ายหน่วยเวลาของกราฟแนวโน้ม — ต้องตรงกับช่องที่หน้าเรียกตัดมา */
  หน่วยเวลา?: string;
  leadsByDealer: Record<string, { leads: number; quoted: number }>;
  lostReasons: { reason: string; count: number; value: number }[];
  unspecifiedLost: number;
  totalLost: number;
}) {
  return (
    <>
      {/* แนวโน้ม 12 เดือน มาก่อน — ให้เห็นภาพรวมว่าทั้งเครือกำลังไปทางไหน แล้วค่อยแยกย่อยรายดีลเลอร์/ภาค
          กินเต็มแถว: กราฟ 12 จุดอ่านง่ายกว่าตอนกว้าง (และไม่มีใบไหนคู่ควรจับคู่ด้วย) */}
      <QuotationTrendChart trend={trend} หน่วยเวลา={หน่วยเวลา} />

      {/* การ์ดคู่: ลูกค้าเป้าหมาย→ใบ (รายดีลเลอร์) · เทียบรายภูมิภาค
          เดิมคู่กับ "มูลค่าใบเสนอราคา เทียบ ยอดขายจริง" — เอาออกแล้ว (ผลงานดีลเลอร์อยู่ภาพรวมยอดขายที่เดียว · FLOW รอบ 5)
          เทียบรายภูมิภาคจึงขึ้นมาจับคู่แทน ไม่เว้นช่องว่างครึ่งแถว (มาตรฐานการ์ดคู่) */}
      <div className="hq-dealer-charts">
        <LeadsVsQuotationsChart dealerAgg={dealerAgg} leadsByDealer={leadsByDealer} />
        <RegionalComparison dealerAgg={dealerAgg} />
      </div>

      {/* "ใบเสนอราคา รายดีลเลอร์" (DealerRankingChart) และ "ออกใบเสนอราคาเยอะ แต่ปิดได้น้อย" (DealerClosingChart)
          ถูกตัดออกก่อนหน้านี้แล้ว — เรื่องผลงานดีลเลอร์ทั้งหมดอยู่ที่ /hq/pipeline
          หน้านี้เหลือเฉพาะเรื่องของตัวเอกสารใบเสนอราคา — อายุใบ / สถานะ / แนวโน้ม / ภูมิภาค */}
      <div className="hq-dealer-charts">
        <LostReasonsChart reasons={lostReasons} unspecified={unspecifiedLost} totalLost={totalLost} />
        <QuotationAgingChart aging={aging} />
      </div>
    </>
  );
}
