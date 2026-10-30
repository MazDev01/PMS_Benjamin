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
import { ตารางรายการ } from "@pms/shared/components/ui/LineItemsTable";
import { จัดรูปจำนวน, จัดรูปหน่วย } from "@pms/shared/lib/lineItemColumns";

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
      {/* ตารางรายการกลาง: จำนวน/หน่วยคนละคอลัมน์ หัวตรงแนวข้อมูล (บอสสั่ง 30 ต.ค. 69) */}
      <ตารางรายการ ป้าย="รายการในใบเสนอราคา (จากใบ HQ)" แน่น กว้างขั้นต่ำ={720} แถว={hqLines} คอลัมน์={[
        { key: "name", หัว: "รายการ", ชนิด: "ข้อความ", กว้าง: "24%", ค่า: l => l.name, ชี้: l => l.name },
        { key: "qty", หัว: "จำนวน", ชนิด: "จำนวน", กว้าง: "10%", ค่า: l => จัดรูปจำนวน(l.qty) },
        { key: "unit", หัว: "หน่วย", ชนิด: "หน่วย", กว้าง: "10%", ค่า: l => จัดรูปหน่วย(l.unit) },
        { key: "cost", หัว: "ต้นทุน/หน่วย", ชนิด: "เงิน", กว้าง: "14%", สไตล์: () => ({ color: "#6b7280" }), ค่า: l => บาท(Number(l.unitCost)) },
        { key: "pct", หัว: "% ที่บวก", ชนิด: "ร้อยละ", กว้าง: "12%", แสดงเกิน: !readOnly, ค่า: (_l, i) => readOnly
          ? `${pctOf(i)}%`
          : <NumberInput ariaLabel={`% ที่บวก ${i + 1}`} value={pctOf(i)} min={0} onChange={n => ตั้งบรรทัด(i, n)}
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 8px" }} /> },
        { key: "price", หัว: "ราคาขาย/หน่วย", ชนิด: "เงิน", กว้าง: "15%", ค่า: (l, i) => <span data-testid={`hq-line-price-${i}`}>{บาท(ราคาขายจากต้นทุน(l.unitCost, pctOf(i)))}</span> },
        { key: "total", หัว: "ยอด", ชนิด: "เงิน", กว้าง: "15%", สไตล์: () => ({ fontWeight: 600 }), ค่า: (l, i) => บาท(ยอดบรรทัด({ qty: l.qty, unitCost: ราคาขายจากต้นทุน(l.unitCost, pctOf(i)) })) },
      ]} ท้าย={
        <tr>
          <td colSpan={4} style={{ fontWeight: 700 }}>รวม</td>
          <td className="num" style={{ color: "#6b7280" }}>ต้นทุน {บาท(ต้นทุนรวม)}</td>
          <td />
          <td colSpan={2} className="num" style={{ fontWeight: 800, color: "#003366" }} data-testid="hq-markup-sale-total">{บาท(ขายรวม)}</td>
        </tr>} />
    </div>
  );
}
