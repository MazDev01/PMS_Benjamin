"use client";

// ─── ตารางรายการของใบลูกค้าที่ทำจากใบ HQ (FLOW.html ขั้น 7 · ด่าน 3) ──────────────────────────────────────────
//
// "ทำใบให้ลูกค้า: ต้นทุน HQ + % (แก้รายบรรทัดได้)" · กฎ "ใบลูกค้าตรงกับใบ HQ — รายการและจำนวนล็อก ราคา = ต้นทุน × (1 + %)
//   และ % ต้องไม่ติดลบ" — ตารางนี้จึงแก้ได้อย่างเดียวคือ % ต่อบรรทัด (หรือตั้งทั้งใบทีเดียว)
//   ชื่อ/จำนวน/หน่วย มาจากใบ HQ · ราคาขายคิดให้ (สูตรเดียวกับฐาน — ฐานคิดซ้ำและเป็นตัวตัดสินจริง)
// ต้นทุนเป็นของดีลเลอร์เอง (เห็นได้ — FLOW "ใบ HQ: HQ + ดีลเลอร์ที่ได้รับใบ") · หน้าพิมพ์/ไฟล์ส่งลูกค้าไม่มีคอลัมน์นี้
// ⚠️ แถวเขียนในตัว map ตรง ๆ — ห้ามแยกเป็นคอมโพเนนต์ที่ประกาศข้างใน (ช่องกรอกโฟกัสหลุดทุกครั้งที่พิมพ์)
import { useState } from "react";
import type { QuoteLineItem } from "@pms/shared/lib/mock";
import { type HqQuoteLine, ราคาขายจากต้นทุน, ยอดบรรทัด } from "@pms/shared/lib/quoteRequests";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";

// เพดานกันพิมพ์ผิดจำนวนหลัก (ไม่ใช่เพดานทางธุรกิจ — ดีลเลอร์ตั้งราคาขายเองได้): ราคาขายต่อหน่วยไม่เกิน 100 ล้าน
//   เพดานราคาต่อหน่วย 100 ล้าน (เท่าช่องราคาของใบแบบเดิมที่ลบไปแล้ว) — พิมพ์ 0 เกินแล้วใบหลุดถึงลูกค้าไม่ได้
const MAX_UNIT_PRICE = 100_000_000;
const เพดานเปอร์เซ็นต์ = (unitCost: number) => unitCost > 0 ? Math.floor((MAX_UNIT_PRICE / unitCost - 1) * 100) : 0;
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function HqMarkupEditor({ hqLines, items, onChange, readOnly }: {
  hqLines: HqQuoteLine[];
  /** รายการของใบลูกค้า (ลำดับเดียวกับใบ HQ) — ใช้ markupPct ของแต่ละบรรทัด */
  items: QuoteLineItem[];
  onChange: (items: QuoteLineItem[]) => void;
  readOnly?: boolean;
}) {
  const [ทั้งใบ, setทั้งใบ] = useState<number>(items[0]?.markupPct ?? 0);
  const จำกัด = (i: number, pct: number) => Math.min(เพดานเปอร์เซ็นต์(Number(hqLines[i]?.unitCost)), Math.max(0, Number(pct) || 0));
  const pctOf = (i: number) => จำกัด(i, Number(items[i]?.markupPct ?? 0));
  const สร้าง = (pcts: number[]): QuoteLineItem[] => hqLines.map((l, i) => ({
    ...(items[i]?.id ? { id: items[i].id } : {}),
    name: l.name, qty: Number(l.qty), unit: l.unit, markupPct: pcts[i], unitPrice: ราคาขายจากต้นทุน(l.unitCost, pcts[i]),
  }));
  const ตั้งบรรทัด = (i: number, pct: number) => onChange(สร้าง(hqLines.map((_, j) => j === i ? จำกัด(j, pct) : pctOf(j))));
  const ตั้งทั้งใบ = (pct: number) => onChange(สร้าง(hqLines.map((_, j) => จำกัด(j, pct))));

  const ต้นทุนรวม = hqLines.reduce((s, l) => s + ยอดบรรทัด(l), 0);
  const ขายรวม = hqLines.reduce((s, l, i) => s + ยอดบรรทัด({ qty: l.qty, unitCost: ราคาขายจากต้นทุน(l.unitCost, pctOf(i)) }), 0);

  return (
    <div data-editor="hq-markup">
      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: "0.78rem", color: "#374151" }}>
          <span>บวกทั้งใบ</span>
          <NumberInput ariaLabel="% ที่บวกทั้งใบ" value={ทั้งใบ} min={0} onChange={n => setทั้งใบ(n)} style={{ width: 80, border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 8px" }} />
          <span>%</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => ตั้งทั้งใบ(ทั้งใบ)}>ใช้กับทุกรายการ</button>
          <span style={{ marginLeft: "auto", color: "#6b7280" }}>รายการและจำนวนมาจากใบ HQ — แก้ได้เฉพาะ % ที่บวก</span>
        </div>
      )}
      <div className="table-scroll">
        <table className="table" style={{ width: "100%", fontSize: "0.8rem" }} aria-label="รายการในใบเสนอราคา (จากใบ HQ)">
          <thead>
            <tr>
              <th>รายการ</th><th style={{ textAlign: "right" }}>จำนวน</th><th>หน่วย</th>
              <th style={{ textAlign: "right" }}>ต้นทุน/หน่วย</th><th style={{ width: 96 }}>% ที่บวก</th>
              <th style={{ textAlign: "right" }}>ราคาขาย/หน่วย</th><th style={{ textAlign: "right" }}>รวม</th>
            </tr>
          </thead>
          <tbody>
            {hqLines.map((l, i) => {
              const ราคา = ราคาขายจากต้นทุน(l.unitCost, pctOf(i));
              return (
                <tr key={i}>
                  <td>{l.name}</td>
                  <td style={{ textAlign: "right" }}>{Number(l.qty).toLocaleString()}</td>
                  <td>{l.unit}</td>
                  <td style={{ textAlign: "right", color: "#6b7280" }}>{บาท(Number(l.unitCost))}</td>
                  <td>{readOnly
                    ? `${pctOf(i)}%`
                    : <NumberInput ariaLabel={`% ที่บวก ${i + 1}`} value={pctOf(i)} min={0} onChange={n => ตั้งบรรทัด(i, n)}
                        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 8px" }} />}</td>
                  <td style={{ textAlign: "right" }} data-testid={`hq-line-price-${i}`}>{บาท(ราคา)}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{บาท(ยอดบรรทัด({ qty: l.qty, unitCost: ราคา }))}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} style={{ fontWeight: 700 }}>รวม</td>
              <td style={{ textAlign: "right", color: "#6b7280" }}>ต้นทุน {บาท(ต้นทุนรวม)}</td>
              <td />
              <td colSpan={2} style={{ textAlign: "right", fontWeight: 800, color: "#003366" }} data-testid="hq-markup-sale-total">{บาท(ขายรวม)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
