"use client";

// ─── ตารางรายการของใบลูกค้าที่ทำจากใบ HQ (FLOW.html ขั้น 7 · ด่าน 3) ──────────────────────────────────────────
//
// "ทำใบให้ลูกค้า: ต้นทุน HQ + % (แก้รายบรรทัดได้)" · กฎ "ใบลูกค้าตรงกับใบ HQ — รายการและจำนวนล็อก ราคา = ต้นทุน × (1 + %)
//   และ % ต้องไม่ติดลบ" — ตารางนี้จึงแก้ได้อย่างเดียวคือ % ต่อบรรทัด (หรือตั้งทั้งใบทีเดียว)
//   ชื่อ/จำนวน/หน่วย มาจากใบ HQ · ราคาขายคิดให้ (สูตรเดียวกับฐาน — ฐานคิดซ้ำและเป็นตัวตัดสินจริง)
// ต้นทุนเป็นของดีลเลอร์เอง (เห็นได้ — FLOW "ใบ HQ: HQ + ดีลเลอร์ที่ได้รับใบ") · หน้าพิมพ์/ไฟล์ส่งลูกค้าไม่มีคอลัมน์นี้
// ⚠️ แถวเขียนในตัว map ตรง ๆ — ห้ามแยกเป็นคอมโพเนนต์ที่ประกาศข้างใน (ช่องกรอกโฟกัสหลุดทุกครั้งที่พิมพ์)
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { UnitSelect, useUnitList } from "@pms/shared/components/ui/UnitSelect";
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
  const หน่วย = useUnitList();
  // ── รายการของดีลเลอร์ (ใบ 0291 · บอสสั่ง 20 พ.ย. 69 "ดีลเลอร์ซื้อโครงที่เรา แต่สั่งทำผนัง/หลังคาเอง") ──
  //   แถว source = "dealer" ต่อท้ายแถวจากใบ HQ: รายการ · จำนวน · หน่วย · ราคาขาย/หน่วย (กรอกเอง) · ลบได้ · ไม่มีต้นทุน/% บวก
  //   แถวจากใบ HQ ล็อกเหมือนเดิม (แก้ได้แค่ %) · ฐานประกอบแถวใบ HQ ใหม่ทุกครั้ง แล้วต่อท้ายแถวของดีลเลอร์ (ตรวจ ชื่อ/จำนวน/ราคา)
  const ของดีลเลอร์ = items.filter(it => it.source === "dealer");
  const จำกัด = (i: number, pct: number) => Math.min(เพดานเปอร์เซ็นต์(Number(hqLines[i]?.unitCost)), Math.max(0, Number(pct) || 0));
  const pctOf = (i: number) => จำกัด(i, Number(items[i]?.markupPct ?? 0));
  const สร้าง = (pcts: number[], dealer: QuoteLineItem[] = ของดีลเลอร์): QuoteLineItem[] => [...hqLines.map((l, i) => ({
    ...(items[i]?.id ? { id: items[i].id } : {}),
    name: l.name, qty: Number(l.qty), unit: l.unit, markupPct: pcts[i], unitPrice: ราคาขายจากต้นทุน(l.unitCost, pcts[i]),
  })), ...dealer];
  const pctsเดิม = () => hqLines.map((_, j) => pctOf(j));
  const แก้ของดีลเลอร์ = (i: number, p: Partial<QuoteLineItem>) => onChange(สร้าง(pctsเดิม(), ของดีลเลอร์.map((r, j) => (j === i ? { ...r, ...p } : r))));
  const ตั้งบรรทัด = (i: number, pct: number) => onChange(สร้าง(hqLines.map((_, j) => j === i ? จำกัด(j, pct) : pctOf(j))));
  const ตั้งทั้งใบ = (pct: number) => onChange(สร้าง(hqLines.map((_, j) => จำกัด(j, pct))));

  const ต้นทุนรวม = hqLines.reduce((s, l) => s + ยอดบรรทัด(l), 0);
  const ขายรวมHQ = hqLines.reduce((s, l, i) => s + ยอดบรรทัด({ qty: l.qty, unitCost: ราคาขายจากต้นทุน(l.unitCost, pctOf(i)) }), 0);
  const ขายรวมดีลเลอร์ = ของดีลเลอร์.reduce((s, r) => s + ยอดบรรทัด({ qty: r.qty, unitCost: r.unitPrice }), 0);
  const ขายรวม = ขายรวมHQ + ขายรวมดีลเลอร์;

  return (
    <div data-editor="hq-markup">
      {!readOnly && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: "0.78rem", color: "#374151" }}>
          {/* บั๊ก 20 พ.ย. 69 (บอสเจอ HQ-2026-00048-V1): เดิมกรอกแล้วต้องกด "ใช้กับทุกรายการ" แถวถึงเปลี่ยน — กรอก 9 แล้วทุกแถวยัง 12
              ตอนนี้: กรอกแล้วทุกแถวเปลี่ยนทันที (ราคาขาย/ยอดคิดใหม่) · แก้รายแถวในตารางได้ต่อ · เปลี่ยนช่องนี้อีกครั้ง = ทุกแถวกลับเป็นค่านี้ */}
          <label htmlFor="markup-all">บวกทั้งใบ</label>
          <NumberInput id="markup-all" ariaLabel="% ที่บวกทั้งใบ" value={ทั้งใบ} min={0} onChange={n => { setทั้งใบ(n); ตั้งทั้งใบ(n); }} style={{ width: 80, border: "1px solid #e5e7eb", borderRadius: 8, padding: "5px 8px" }} />
          <span>%</span>
          <span data-testid="markup-all-hint" style={{ color: "#6b7280" }}>ใช้กับทุกรายการทันที · แก้รายแถวในตารางได้ (เปลี่ยนช่องนี้อีกครั้ง = ทุกแถวกลับเป็นค่านี้)</span>
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
          <td colSpan={2} className="num" style={{ fontWeight: 800, color: "#003366" }} data-testid={ของดีลเลอร์.length ? "hq-markup-sale-hq" : "hq-markup-sale-total"}>{บาท(ขายรวม - ขายรวมดีลเลอร์)}</td>
        </tr>} />
      {(ของดีลเลอร์.length > 0 || !readOnly) && (
        <div data-dealer-lines style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {ของดีลเลอร์.length > 0 && (
            <div className="table-wrap">
              <table aria-label="รายการของดีลเลอร์" style={{ tableLayout: "fixed", width: "100%", minWidth: 640 }}>
                <colgroup><col style={{ width: "34%" }} /><col style={{ width: "12%" }} /><col style={{ width: "14%" }} /><col style={{ width: "18%" }} /><col style={{ width: "16%" }} /><col style={{ width: 40 }} /></colgroup>
                <thead>
                  <tr><th colSpan={6} style={{ textAlign: "left", background: "#fff7ed", color: "#9a3412" }}>รายการของดีลเลอร์ <span style={{ fontWeight: 400 }}>(ไม่ได้มาจากใบ HQ · ราคาขายที่ดีลเลอร์กำหนดเอง)</span></th></tr>
                  <tr><th>รายการ</th><th className="num">จำนวน</th><th>หน่วย</th><th className="num">ราคาขาย/หน่วย</th><th className="num">ยอด</th><th aria-label="ลบ" /></tr>
                </thead>
                <tbody>
                  {ของดีลเลอร์.map((r, i) => (
                    <tr key={i} data-dealer-line={i + 1}>
                      <td>{readOnly ? r.name : <input aria-label={`รายการของดีลเลอร์ ${i + 1}`} value={r.name} maxLength={200} onChange={e => แก้ของดีลเลอร์(i, { name: e.target.value })} style={{ width: "100%" }} placeholder="เช่น ผนังเมทัลชีท (ดีลเลอร์จัดหาเอง)" />}</td>
                      <td className="num">{readOnly ? Number(r.qty).toLocaleString("th-TH") : <NumberInput ariaLabel={`จำนวนรายการของดีลเลอร์ ${i + 1}`} value={Number(r.qty)} min={0} onChange={n => แก้ของดีลเลอร์(i, { qty: n })} style={{ width: "100%" }} />}</td>
                      <td>{readOnly ? (r.unit || "—") : <UnitSelect ariaLabel={`หน่วยรายการของดีลเลอร์ ${i + 1}`} value={r.unit} onChange={u => แก้ของดีลเลอร์(i, { unit: u })} หน่วย={หน่วย} style={{ width: "100%" }} />}</td>
                      <td className="num">{readOnly ? บาท(Number(r.unitPrice)) : <NumberInput ariaLabel={`ราคาขายต่อหน่วยรายการของดีลเลอร์ ${i + 1}`} value={Number(r.unitPrice)} min={0} max={MAX_UNIT_PRICE} onChange={n => แก้ของดีลเลอร์(i, { unitPrice: n })} style={{ width: "100%" }} />}</td>
                      <td className="num" data-testid={`dealer-line-total-${i}`}>{บาท(ยอดบรรทัด({ qty: r.qty, unitCost: r.unitPrice }))}</td>
                      <td>{!readOnly && <button type="button" className="btn-icon" aria-label={`ลบรายการของดีลเลอร์ ${i + 1}`} onClick={() => onChange(สร้าง(pctsเดิม(), ของดีลเลอร์.filter((_, j) => j !== i)))}><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!readOnly && (
            <div><button type="button" className="btn btn-secondary btn-sm" disabled={ของดีลเลอร์.length >= 50}
              onClick={() => onChange(สร้าง(pctsเดิม(), [...ของดีลเลอร์, { source: "dealer", name: "", qty: 1, unit: "", unitPrice: 0 }]))}><Plus size={13} /> เพิ่มรายการอื่น</button></div>
          )}
          {ของดีลเลอร์.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, fontSize: "0.8rem" }}>
              <span>รายการจากใบ HQ {บาท(ขายรวมHQ)}</span><span>รายการของดีลเลอร์ {บาท(ขายรวมดีลเลอร์)}</span>
              <b style={{ color: "#003366" }}>รวมทั้งใบ <span data-testid="hq-markup-sale-total">{บาท(ขายรวม)}</span></b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
