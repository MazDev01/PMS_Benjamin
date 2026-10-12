"use client";

// ─── #2 มูลค่าใบเสนอราคา เทียบ ยอดขายจริง รายดีลเลอร์ ───────────────────────────
// เสนอราคาไปเท่าไร ปิดได้จริงเท่าไร
// มูลค่าใบเสนอราคา = ทุกใบในตัวกรอง · ยอดขายจริง = เฉพาะใบที่สถานะ "ปิดการขายได้"
// (ระบบไม่มีตัวเลขยอดขายแยกต่างหาก — ยอดขาย = มูลค่าใบที่ปิดได้ ตามนิยามเดียวกันทั้งหน้า)
import { type DealerAgg } from "@pms/shared/lib/hqQuotations";
import { TopNRows } from "@pms/shared/components/hq/TopNRows";
import { fmtBaht } from "@pms/shared/lib/format";

const QUOTE_COLOR = "#0891b2";
const SALES_COLOR = "#059669";

export function QuotationValueVsSalesChart({ dealerAgg }: { dealerAgg: DealerAgg[] }) {
  const bars = [...dealerAgg]
    .map(d => ({ code: d.code, name: d.name, value: d.value, wonValue: d.wonValue }))
    .sort((a, b) => b.value - a.value);

  const max = Math.max(...bars.map(b => b.value), 1);

  return (
    <div className="card chart-l" style={{ marginBottom: 0 }}>
      <div className="card-header">
        <div>
          <div className="card-title">มูลค่าใบเสนอราคา เทียบ ยอดขายจริง</div>
        </div>
        <span style={{ display: "flex", gap: 10, fontSize: "0.62rem", color: "var(--muted-foreground)", flexShrink: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: QUOTE_COLOR }} />เสนอราคา
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: SALES_COLOR }} />ขายได้จริง
          </span>
        </span>
      </div>
      <div className="card-body" style={{ paddingTop: 6, display: "flex", flexDirection: "column" }}>
        {!bars.length ? (
          <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>—</div>
        ) : (
        <TopNRows topN={4} unit="ราย" gap={14}>
          {bars.map(b => (
          <div key={b.code}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.74rem", marginBottom: 4 }}>
              <span style={{ color: "#374151", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#003366", marginRight: 6 }}>{b.code}</span>
                {b.name}
              </span>
              <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--muted-foreground)" }}>
                {/* ยังไม่เสนอราคา = หารไม่ได้ → "—" */}
                {b.value ? `${Math.round((b.wonValue / b.value) * 100)}%` : "—"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <div style={{ flex: 1, height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${Math.round(b.value / max * 100)}%`, background: QUOTE_COLOR, borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: "0.62rem", color: "var(--muted-foreground)", fontWeight: 700, minWidth: 54, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(b.value)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ flex: 1, height: 6, background: "var(--muted)", borderRadius: 999, overflow: "hidden" }}>
                <div className="bar-grow" style={{ height: "100%", width: `${Math.round(b.wonValue / max * 100)}%`, background: SALES_COLOR, borderRadius: 999 }} />
              </div>
              <span style={{ fontSize: "0.62rem", color: "var(--muted-foreground)", fontWeight: 700, minWidth: 54, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(b.wonValue)}</span>
            </div>
          </div>
          ))}
        </TopNRows>
        )}
      </div>
    </div>
  );
}
