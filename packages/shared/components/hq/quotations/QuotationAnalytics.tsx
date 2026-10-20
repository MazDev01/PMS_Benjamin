"use client";

// ─── ส่วนวิเคราะห์ใบเสนอราคาทั้งเครือ ─────────────────────────────────────────
// ลูกค้าเป้าหมาย→ใบเสนอราคา · มูลค่าเทียบยอดขายจริง · ใบเสนอราคารายดีลเลอร์ · สถานะแยกดีลเลอร์
// แนวโน้ม 12 เดือน · เทียบรายภูมิภาค · เหตุผลที่เสียโอกาส · อายุใบที่ค้าง · อันดับดีลเลอร์
// ใช้เฉพาะแท่ง/แท่งแนวนอน/แท่งซ้อน/เส้น — ไม่มีกรวย/วงกลม/เกจ
//
// ไม่มี "อัตราการเปิดอ่าน" และ "การใช้แม่แบบ" — ระบบไม่มีข้อมูลรองรับทั้งสองอย่าง (ห้ามกุ)
// ไม่มีกราฟ "ประเภทอาคาร" (จัดกลุ่มตามแม่แบบ) แล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { TablePagination } from "@pms/shared/components/ui/TablePagination";
import { QuotationTrendChart } from "./QuotationTrendChart";
import { QuotationAgingChart } from "./QuotationAgingChart";
import { LeadsVsQuotationsChart } from "./LeadsVsQuotationsChart";
import { QuotationValueVsSalesChart } from "./QuotationValueVsSalesChart";
import { TopNRows } from "@pms/shared/components/hq/TopNRows";
import { LostReasonsChart } from "./LostReasonsChart";
import { conversionRate, sumAggs, regionDisplay, type DealerAgg, type AgingBucket } from "@pms/shared/lib/hqQuotations";
import { fmtBaht } from "@pms/shared/lib/format";

const PRIMARY = "#003366";
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
    <div className="card chart-m" style={{ marginBottom: 0 }}>
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

// ── #3 อันดับดีลเลอร์ — 10 อันดับแรก: ใบเสนอราคา · มูลค่า · ตอบรับ · อัตราปิดการขาย ──
const TOP_N = 10;
function TopDealerRanking({ dealerAgg }: { dealerAgg: DealerAgg[] }) {
  const router = useRouter();
  const all = [...dealerAgg].sort((a, b) => b.value - a.value);
  const ranked = all.slice(0, TOP_N);
  const hidden = all.length - ranked.length;  // บอกจำนวนที่ไม่ได้แสดง — ห้ามตัดเงียบ

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <div className="card-title">อันดับดีลเลอร์</div>
        {/* คำอธิบายกำกับใต้หัวข้อถูกเอาออกทั้งระบบ (บอสสั่ง 27 ส.ค. 69) */}
      </div>
      <div className="table-wrap">
        <table>
          {/* ความกว้างคุมที่ colgroup เท่านั้น (ตาราง table-layout:fixed — ใส่ที่ th ไม่มีผล) */}
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: 96 }} />{/* รหัส — ต้องเห็นครบ 5 ตัวอักษร (บอสสั่ง 19 ต.ค. 69) */}
            <col style={{ width: "24%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "11%" }} />{/* อัตราปิดการขาย */}
            <col style={{ width: "5%", minWidth: 64 }} />{/* ปุ่มดูรายละเอียด */}
          </colgroup>
          <thead>
            <tr>
              <th>อันดับ</th>
              <th>รหัส</th>
              <th>ดีลเลอร์</th>
              <th>ภูมิภาค</th>
              <th className="num">ใบเสนอราคา</th>
              <th className="num">มูลค่า</th>
              <th className="num">ตอบรับ</th>
              <th className="num" title="ตอบรับ ÷ ใบที่ส่งถึงลูกค้าแล้ว (รวมใบที่ยังรอตอบในตัวหาร) — คนละสูตรกับ “อัตราปิด” ที่หน้าภาพรวมยอดขาย ซึ่งนับเฉพาะใบที่รู้ผลแล้ว">อัตราปิดการขาย<br /><span style={{ fontWeight: 500, fontSize: "0.9em", textTransform: "none", letterSpacing: 0 }}>ตอบรับ ÷ ที่ส่งแล้ว</span></th>
              <th></th>{/* คอลัมน์ปุ่มดู — ไม่ต้องมีหัวคอลัมน์ */}
            </tr>
          </thead>
          <tbody>
            {!ranked.length ? (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: "28px 14px", color: "var(--muted-foreground)" }}>ไม่พบข้อมูล</td></tr>
            ) : ranked.map((d, i) => (
              <ClickableRow key={d.code} className="clickable" onActivate={() => router.push(`/hq/dealers/${d.code}`)} label={`เปิดหน้าดีลเลอร์ ${d.name}`}>
                <td style={{ fontWeight: 700, color: "var(--muted-foreground)" }}>{i + 1}</td>
                <td data-col="code" style={{ fontFamily: "monospace", fontWeight: 700, color: PRIMARY, overflow: "visible", textOverflow: "clip", whiteSpace: "nowrap" }}>{d.code}</td>
                <td style={{ fontWeight: 600, color: "#1F2937" }}>{d.name}</td>
                <td style={{ color: "#374151" }}>{regionDisplay(d.region)}</td>
                <td className="num" style={{ fontVariantNumeric: "tabular-nums" }}>{d.count}</td>
                <td className="num" style={{ fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(d.value)}</td>
                <td className="num" style={{ fontWeight: 700, color: "#059669", fontVariantNumeric: "tabular-nums" }}>{d.accepted}</td>
                {/* ยังไม่ส่งใบถึงลูกค้าเลย = หารไม่ได้ → "—" ไม่ใช่ 0% */}
                <td className="num" style={{ fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>{d.sent ? `${conversionRate(d)}%` : "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button title="ดูรายละเอียดดีลเลอร์" onClick={() => router.push(`/hq/dealers/${d.code}`)}
                      style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid #dbe3ec", background: "#fff", color: PRIMARY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Eye size={13} />
                    </button>
                  </div>
                </td>
              </ClickableRow>
            ))}
          </tbody>
        </table>
      </div>
      {/* ตารางนี้ตั้งใจโชว์แค่ 10 อันดับแรกตามสเปก — แถบจึงเป็น "หน้า 1 / 1" เสมอ
          (มีไว้ให้ท้ายตารางเหมือนกันทุกหน้า HQ) · จำนวนที่ไม่ได้แสดงบอกไว้ใต้แถบ */}
      <TablePagination page={0} total={ranked.length} onPage={() => {}} size={TOP_N} unit="ดีลเลอร์" />
      {hidden > 0 && (
        <div style={{ padding: "8px 14px", fontSize: "0.65rem", color: "#9ca3af", borderTop: "1px solid #f2f4f7" }}>
          แสดง 10 อันดับแรก — อีก {hidden} ดีลเลอร์ไม่ได้แสดงในตารางนี้
        </div>
      )}
    </div>
  );
}

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

      <div className="hq-dealer-charts">
        <LeadsVsQuotationsChart dealerAgg={dealerAgg} leadsByDealer={leadsByDealer} />
        <QuotationValueVsSalesChart dealerAgg={dealerAgg} />
      </div>

      {/* "ใบเสนอราคา รายดีลเลอร์" (DealerRankingChart) ถูกตัดออก — ข้อมูลซ้ำทั้งใบ:
          มูลค่ารายดีลเลอร์มีใน "มูลค่าใบเสนอราคา เทียบ ยอดขายจริง" · จำนวนใบมีใน "อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์"
          และตาราง "อันดับดีลเลอร์" ท้ายหน้ามีครบทั้งคู่ + อัตราปิดการขาย */}
      {/* "ออกใบเสนอราคาเยอะ แต่ปิดได้น้อย" (DealerClosingChart) ถูกตัดออก — ย้ายไปอยู่ที่ /hq/pipeline
          ซึ่งเป็นเจ้าของเรื่อง "ผลงานดีลเลอร์ / ใครต้องเข้าไปช่วย" (ใบนั้นมีตารางสรุปใต้กราฟด้วย)
          หน้านี้เหลือเฉพาะเรื่องของตัวเอกสารใบเสนอราคา — อายุใบ / สถานะ / แนวโน้ม / มูลค่า */}
      {/* เทียบรายภูมิภาค กินเต็มแถว — คู่เดิม "ประเภทอาคาร" (แม่แบบ) ถูกถอด: เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
          ไม่เว้นช่องว่างครึ่งแถวไว้ (มาตรฐานการ์ดคู่) */}
      <div style={{ marginBottom: 24 }}>
        <RegionalComparison dealerAgg={dealerAgg} />
      </div>

      <div className="hq-dealer-charts">
        <LostReasonsChart reasons={lostReasons} unspecified={unspecifiedLost} totalLost={totalLost} />
        <QuotationAgingChart aging={aging} />
      </div>

      {/* ตารางอันดับปิดท้าย — เป็น "ตัวเลขครบทุกดีลเลอร์" ที่ให้ไล่อ่านหลังดูกราฟภาพรวมจบแล้ว */}
      <div style={{ marginBottom: 24 }}>
        <TopDealerRanking dealerAgg={dealerAgg} />
      </div>
    </>
  );
}
