"use client";

// ── รายการในคำขอราคา (บอสสั่ง 20 พ.ย. 69 · ทับ "ไม่ต้องมี" ก่อนหน้า) ─────────────────────────────────────────────────
//   ดีลเลอร์พิมพ์รายการเอง: รายการ + จำนวน + หน่วย (ช่องหน่วยตัวกลางเดียวกับใบ HQ) · ไม่มีราคา (HQ ตีราคา) · ไม่บังคับ (0 แถวได้) · ลบแถวได้
//   เก็บในช่อง estimate_items ของคำขอ ({ name, qty, unit } ไม่มีรหัสวัสดุ/ราคา) · คำขอเก่าที่เลือกวัสดุไว้ก็แสดงด้วยตารางเดียวกัน (ไม่แสดงราคา)
//   RequestItemsEditor = ฟอร์มขอราคา/ขอแก้ราคา · RequestItemsTable = อ่านอย่างเดียว (คำขอที่ส่งแล้ว ดีลเลอร์ · หน้าต่างคำขอ HQ)
import { Plus, Trash2 } from "lucide-react";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { UnitSelect, useUnitList } from "@pms/shared/components/ui/UnitSelect";

export type รายการคำขอ = { name: string; qty: number; unit: string };
export const สูงสุดรายการคำขอ = 50;

/** แถวที่ส่งได้ (ตัดแถวว่างทั้งแถวทิ้ง) · ข้อผิด = แถวที่กรอกไม่ครบ (มีชื่อแต่จำนวน ≤ 0 · มีจำนวน/หน่วยแต่ไม่มีชื่อ) */
export function ตรวจรายการคำขอ(rows: รายการคำขอ[]): { ส่ง: รายการคำขอ[]; ผิด: string | null } {
  const มีค่า = rows.filter(r => r.name.trim() || r.unit.trim());
  for (const [i, r] of มีค่า.entries()) {
    if (!r.name.trim()) return { ส่ง: [], ผิด: `รายการแถว ${i + 1}: ใส่ชื่อรายการ หรือลบแถวนี้` };
    if (!(Number(r.qty) > 0)) return { ส่ง: [], ผิด: `รายการ "${r.name.trim()}": จำนวนต้องมากกว่า 0` };
  }
  if (มีค่า.length > สูงสุดรายการคำขอ) return { ส่ง: [], ผิด: `รายการได้ไม่เกิน ${สูงสุดรายการคำขอ} แถว` };
  return { ส่ง: มีค่า.map(r => ({ name: r.name.trim().slice(0, 200), qty: Number(r.qty), unit: r.unit.trim().slice(0, 30) })), ผิด: null };
}

export function RequestItemsEditor({ value, onChange, disabled }: { value: รายการคำขอ[]; onChange: (v: รายการคำขอ[]) => void; disabled?: boolean }) {
  const หน่วย = useUnitList();
  const แก้ = (i: number, p: Partial<รายการคำขอ>) => onChange(value.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const ช่อง: React.CSSProperties = { width: "100%", boxSizing: "border-box" };
  return (
    <div data-field="request-items" style={{ display: "grid", gap: 6 }}>
      <div className="form-label" style={{ marginBottom: 0 }}>รายการที่ต้องการ <span style={{ fontWeight: 400, color: "#6b7280" }}>(ไม่บังคับ · HQ ตีราคา)</span></div>
      {value.length > 0 && (
        <div className="table-wrap">
          <table aria-label="รายการในคำขอ" style={{ tableLayout: "fixed", width: "100%" }}>
            <colgroup><col style={{ width: "6%" }} /><col /><col style={{ width: "18%" }} /><col style={{ width: "20%" }} /><col style={{ width: 40 }} /></colgroup>
            <thead><tr><th>ลำดับ</th><th>รายการ</th><th className="num">จำนวน</th><th>หน่วย</th><th aria-label="ลบ" /></tr></thead>
            <tbody>
              {value.map((r, i) => (
                <tr key={i} data-request-item={i + 1}>
                  <td>{i + 1}</td>
                  <td><input aria-label={`รายการ ${i + 1}`} value={r.name} maxLength={200} disabled={disabled} style={ช่อง}
                    onChange={e => แก้(i, { name: e.target.value })} placeholder="เช่น เสาเหล็กรูปตัวเอช 200x200" /></td>
                  <td className="num"><NumberInput ariaLabel={`จำนวน ${i + 1}`} value={Number(r.qty)} min={0} onChange={n => แก้(i, { qty: n })} style={ช่อง} /></td>
                  <td><UnitSelect ariaLabel={`หน่วย ${i + 1}`} value={r.unit} onChange={u => แก้(i, { unit: u })} หน่วย={หน่วย} style={ช่อง} /></td>
                  <td><button type="button" className="btn-icon" aria-label={`ลบรายการ ${i + 1}`} disabled={disabled}
                    onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={disabled || value.length >= สูงสุดรายการคำขอ}
          onClick={() => onChange([...value, { name: "", qty: 1, unit: "" }])}><Plus size={13} /> เพิ่มรายการ</button>
      </div>
    </div>
  );
}

/** ตารางอ่านอย่างเดียว · ไม่มีรายการ = ไม่แสดง (ผู้เรียกไม่ต้องเช็กเอง) */
export function RequestItemsTable({ items, label = "รายการในคำขอ" }: { items: { name: string; qty: number | string; unit?: string | null }[] | null | undefined; label?: string }) {
  if (!items?.length) return null;
  return (
    <div className="table-wrap" data-request-items-view>
      <table aria-label={label} style={{ tableLayout: "fixed", width: "100%" }}>
        <colgroup><col style={{ width: "8%" }} /><col /><col style={{ width: "18%" }} /><col style={{ width: "18%" }} /></colgroup>
        <thead><tr><th>ลำดับ</th><th>รายการ</th><th className="num">จำนวน</th><th>หน่วย</th></tr></thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i}><td>{i + 1}</td><td>{r.name}</td><td className="num">{Number(r.qty).toLocaleString("th-TH")}</td><td>{r.unit || "—"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
