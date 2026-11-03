"use client";

// ─── #8 อายุใบเสนอราคาที่ค้างอยู่ (Aging) ─────────────────────────────────────
// นับเฉพาะใบที่ "ส่งแล้วแต่ลูกค้ายังไม่ตอบ" — ใบที่ปิดไปแล้วไม่มีอายุค้าง
// จำนวนวัน = วันที่สร้าง → "วันนี้" ของระบบ (30 มิ.ย. 2569)
import { BoxTitle } from "@pms/shared/components/ui/BoxTitle";
import { AGING_BUCKETS, type AgingBucket } from "@pms/shared/lib/hqQuotations";
import { fmtBaht } from "@pms/shared/lib/format";
import { Donut } from "@pms/shared/components/ui/Charts";

// aging = จำนวน/มูลค่าต่อช่วง (เฉพาะใบค้าง sent_to_client) คำนวณมาแล้ว (DB หรือ client) — M9 Phase 2
export function QuotationAgingChart({ aging, หัวข้อ }: { aging: { key: AgingBucket; count: number; value: number }[];
  /** หัวข้อ 2 บรรทัด (บอสสั่ง 3 พ.ย. 69) — ไม่ส่ง = ชื่อเดิมบรรทัดเดียว */
  หัวข้อ?: { ชื่อ: string; คำอธิบาย: string } }) {
  const byKey = new Map(aging.map(a => [a.key, a]));
  const buckets = AGING_BUCKETS.map(b => ({ ...b, count: byKey.get(b.key)?.count ?? 0, value: byKey.get(b.key)?.value ?? 0 }));
  const pendingLen = buckets.reduce((s, b) => s + b.count, 0);
  // agingBucketOf จับใบหนึ่งลงช่วงเดียวเสมอ → 4 ช่วงไม่ทับกันและรวมกัน = ใบที่ค้างทั้งหมดพอดี ทำโดนัทได้
  const shown = buckets.filter(b => b.count > 0);

  return (
    <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column" }}>
      {หัวข้อ ? <BoxTitle ชื่อ={หัวข้อ.ชื่อ} คำอธิบาย={หัวข้อ.คำอธิบาย} /> : (
        <div className="card-header">
          <div>
            <div className="card-title">อายุใบเสนอราคาที่ค้างอยู่</div>
          </div>
        </div>
      )}
      {/* ข้อมูลแค่ 4 ช่วง → โดนัทอ่านง่ายกว่าแท่ง (สีเดิมของแต่ละช่วง: เขียว→เหลือง→ส้ม→แดง ตามความเร่งด่วน) */}
      <div className="card-body" style={{ paddingTop: 6, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
        {!pendingLen ? (
          <div style={{ fontSize: "0.74rem", color: "var(--muted-foreground)" }}>—</div>
        ) : (<>
          <Donut
            segments={shown.map(b => ({ label: b.label, value: b.count, color: b.color }))}
            centerLabel="ใบที่ค้าง"
            centerValue={`${pendingLen}`}
            size={168}
          />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 9 }}>
            {shown.map(b => (
              <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem" }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: "#374151", fontWeight: 600, whiteSpace: "nowrap" }}>{b.label}</span>
                <span style={{ fontWeight: 800, color: "#1F2937", fontVariantNumeric: "tabular-nums" }}>{b.count}</span>
                {/* มูลค่ารวมของช่วงนั้น — ข้อมูลจริง ไม่ตัดทิ้งตอนเปลี่ยนเป็นโดนัท */}
                <span style={{ color: "var(--muted-foreground)", fontWeight: 600, minWidth: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(b.value)}</span>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}
