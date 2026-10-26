"use client";

// ── ตัวเลขจากภาพรวม HQ (hq_overview · ใบ 0209) ที่ย้ายมาอยู่หน้าเจ้าของเรื่อง (บอสตัดสิน 22 ต.ค. 69) ───────────────────
//   เวลาตอบเฉลี่ย + อัตรายกเลิกคำขอ = ผลงานของ HQ เอง → การ์ด 4 ใบของหน้า "คำขอใบเสนอราคา" (KpiCard · 26 ต.ค. 69)
//   ส่วนบวก (margin) รายดีลเลอร์ → หน้า "ภาพรวมยอดขาย" — แอป HQ เท่านั้น (ห้ามใส่ในไฟล์ส่งออก/หน้าพิมพ์/ฝั่งดีลเลอร์)
//   ตัวเลขทั้งหมดคิดที่ฐาน — ที่นี่แสดงอย่างเดียว · ตัวเลข ณ ตอนนี้ทั้งหมด ไม่ขึ้นกับตัวกรองของหน้า (บอกไว้บนป้าย)
//   ข้อทดสอบ: tests/scenario/hq-overview.spec.ts
import { useEffect, useState } from "react";
import { metrics as metricsRepo } from "@pms/shared/lib/data";
import type { HqOverview } from "@pms/shared/lib/hqOverview";
import { fmtBaht } from "@pms/shared/lib/format";
import { logRepoRead } from "@pms/shared/lib/repoLog";

const PRIMARY = "#003366";
const ร้อยละ = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

function useOverview() {
  const [o, setO] = useState<HqOverview | null>(null);
  useEffect(() => { metricsRepo.hqOverview().then(setO).catch(e => logRepoRead("metrics.hqOverview", e)); }, []);
  return o;
}

/** ภาพรวมยอดขาย: ส่วนบวกรายดีลเลอร์ (ใบลูกค้าที่ตอบรับและผูกใบ HQ) — เห็นเฉพาะ HQ */
export function DealerMarginCard() {
  const o = useOverview();
  const rows = o?.sales.marginByDealer ?? [];
  const th: React.CSSProperties = { textAlign: "right", fontSize: "0.68rem", fontWeight: 700, color: "#6b7280", padding: "8px 10px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { textAlign: "right", fontSize: "0.78rem", padding: "8px 10px", borderTop: "1px solid #eef0f4", fontVariantNumeric: "tabular-nums" };
  return (
    <div className="card" data-testid="dealer-margin" style={{ marginBottom: "1.25rem" }}>
      <div className="card-header">
        <div className="card-title">ส่วนบวกรายดีลเลอร์ (เฉพาะ HQ)</div>
        <span style={{ fontSize: "0.72rem", color: "#8a929c" }}>ใบที่ลูกค้าตอบรับและทำจากใบ HQ · ทั้งหมด ไม่ขึ้นกับตัวกรอง</span>
      </div>
      <div className="card-body" style={{ paddingTop: 4 }}>
        {!o ? <div style={{ fontSize: "0.8rem", color: "#8a929c" }}>กำลังโหลด…</div>
          : rows.length === 0 ? <div data-empty style={{ fontSize: "0.8rem", color: "#8a929c" }}>ยังไม่มีใบที่ลูกค้าตอบรับจากใบ HQ</div>
          : (
            <div className="table-wrap" style={{ borderTop: "none" }}>
              <table>
                <thead><tr>
                  <th style={{ ...th, textAlign: "left" }}>ดีลเลอร์</th><th style={th}>ใบ</th><th style={th}>ขายรวม (ก่อน VAT)</th>
                  <th style={th}>ต้นทุน HQ</th><th style={th}>ส่วนบวก % ของราคาขาย</th><th style={th}>% ของต้นทุน</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.dealerCode} data-margin-row={r.dealerCode}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 700 }}>{r.dealerCode}</td>
                      <td style={td}>{r.quotes.toLocaleString()}</td>
                      <td style={td} data-sale={r.sale}>{fmtBaht(r.sale)}</td>
                      <td style={td} data-cost={r.cost}>{fmtBaht(r.cost)}</td>
                      <td style={{ ...td, fontWeight: 800, color: PRIMARY }} data-pct-sale={r.pctOfSale ?? ""}>{ร้อยละ(r.pctOfSale)}</td>
                      <td style={td} data-pct-cost={r.pctOfCost ?? ""}>{ร้อยละ(r.pctOfCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
