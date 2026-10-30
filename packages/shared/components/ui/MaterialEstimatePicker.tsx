"use client";

// ── เลือกวัสดุจากแม่แบบตอนขอราคา (ดีลเลอร์ · D3 · บอสสั่ง 26 ต.ค. 69 · ใบ 0244) ─────────────────────────────────────
//
// ไม่บังคับ · ได้ "ราคาประเมินเบื้องต้น ไม่ใช่ใบเสนอราคา" — ไม่นับในมูลค่าโอกาสการขาย · พิมพ์ส่งลูกค้าไม่ได้ (class no-print)
//   ราคาที่เห็นคือราคาแม่แบบ ณ ตอนนี้ · ฐานคิดซ้ำจากแม่แบบตอนส่งคำขอและเก็บสำเนาไว้ (หน้าเว็บส่งแค่ วัสดุ + จำนวน)
//   ควบคุมจากข้างนอก (value + onChange) — แผงคำขอถือรายการไว้จนกดส่ง
import { useEffect, useMemo, useState } from "react";
import { Boxes, Trash2 } from "lucide-react";
import { materialTemplates as repo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { ตารางรายการ } from "@pms/shared/components/ui/LineItemsTable";
import { จัดรูปหน่วย } from "@pms/shared/lib/lineItemColumns";
import { type MaterialTemplate, ป้ายราคาประเมิน, ยอดประเมิน, ค้นแม่แบบ } from "@pms/shared/lib/materialTemplates";

export type วัสดุที่เลือก = { templateId: number; qty: number };
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ช่อง: React.CSSProperties = { width: "100%", border: "1px solid #d5dbe4", borderRadius: 9, padding: "7px 10px", fontSize: "0.82rem", fontFamily: "inherit", boxSizing: "border-box" };

export function MaterialEstimatePicker({ value, onChange, disabled }: { value: วัสดุที่เลือก[]; onChange: (v: วัสดุที่เลือก[]) => void; disabled?: boolean }) {
  const [แม่แบบ, setแม่แบบ] = useState<MaterialTemplate[] | null>(null);
  const [ค้น, setค้น] = useState("");
  useEffect(() => {
    let alive = true;
    repo.list().then(ls => alive && setแม่แบบ(ls.filter(t => t.active))).catch(e => { logRepoRead("materialTemplates.list(dealer)", e); if (alive) setแม่แบบ([]); });
    return () => { alive = false; };
  }, []);

  const ตาม = useMemo(() => new Map((แม่แบบ ?? []).map(t => [t.id, t])), [แม่แบบ]);
  const แถว = value.map(v => ({ ...v, t: ตาม.get(v.templateId) })).filter(r => r.t);
  const รวม = ยอดประเมิน(แถว.map(r => ({ qty: r.qty, unitPrice: Number(r.t!.unitPrice) })));
  const ตัวเลือก = useMemo(() => ค้นแม่แบบ((แม่แบบ ?? []).filter(t => !value.some(v => v.templateId === t.id)), ค้น).slice(0, 50), [แม่แบบ, value, ค้น]);

  if (แม่แบบ && แม่แบบ.length === 0) {
    return <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>วัสดุ (ไม่บังคับ): สำนักงานใหญ่ยังไม่มีแม่แบบวัสดุ</div>;
  }
  return (
    <div className="no-print" data-box="material-estimate" style={{ border: "1px dashed #d8b4fe", background: "#fff", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 700, color: "#3b0764" }}>
        <Boxes size={14} /> วัสดุจากแม่แบบ (ไม่บังคับ)
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input aria-label="ค้นวัสดุ" placeholder="ค้นวัสดุ เช่น ผนัง ประตู หลังคา" style={{ ...ช่อง, flex: "1 1 180px" }} value={ค้น} onChange={e => setค้น(e.target.value)} disabled={disabled || !แม่แบบ} />
        <select aria-label="เลือกวัสดุ" style={{ ...ช่อง, flex: "2 1 220px" }} value="" disabled={disabled || !แม่แบบ}
          onChange={e => { const id = Number(e.target.value); if (id) { onChange([...value, { templateId: id, qty: 1 }]); setค้น(""); } }}>
          <option value="">{แม่แบบ ? `เลือกวัสดุ (${ตัวเลือก.length} รายการ)` : "กำลังโหลด…"}</option>
          {ตัวเลือก.map(t => <option key={t.id} value={t.id}>{t.category ? `${t.category} · ` : ""}{t.name} — {บาท(Number(t.unitPrice))} บาท/{t.unit || "หน่วย"}</option>)}
        </select>
      </div>
      {แถว.length > 0 && (
        // ตารางกลาง (.table-wrap · colgroup · table-layout: fixed) แบบเดียวกับตารางอื่นในระบบ (บอสสั่ง 27 ต.ค. 69)
        //   เดิมเขียนตารางเอง ความกว้างช่องลอยตามเนื้อหา → ช่องจำนวนล้นทับหน่วย · ถังขยะชิดยอด (ข้อทดสอบ material-picker-layout.spec.ts)
        //   ความกว้างแก้ที่ colgroup เท่านั้น · ชื่อ/หน่วยยาวตัดด้วย … (ชี้ดูชื่อเต็ม) · จอแคบเลื่อนในกรอบตาราง ไม่ดันหน้า
        <ตารางรายการ ป้าย="วัสดุที่เลือก" แน่น กว้างขั้นต่ำ={640} กรอบ={{ border: "1px solid var(--border)", borderRadius: 8 }} แถว={แถว}
          คุณสมบัติแถว={r => ({ "data-estimate-row": String(r.templateId) })} คอลัมน์={[
            { key: "name", หัว: "รายการ", ชนิด: "ข้อความ", กว้าง: "30%", ค่า: r => r.t!.name, ชี้: r => r.t!.name },
            { key: "qty", หัว: "จำนวน", ชนิด: "จำนวน", กว้าง: "14%", ค่า: (r, i) => <NumberInput ariaLabel={`จำนวนวัสดุ ${i + 1}`} value={r.qty} min={0} onChange={n => onChange(value.map(v => v.templateId === r.templateId ? { ...v, qty: n } : v))} style={{ ...ช่อง, textAlign: "right" }} /> },
            { key: "unit", หัว: "หน่วย", ชนิด: "หน่วย", กว้าง: "12%", ค่า: r => จัดรูปหน่วย(r.t!.unit), ชี้: r => r.t!.unit },
            { key: "price", หัว: "ราคาต่อหน่วย", ชนิด: "เงิน", กว้าง: "19%", ค่า: r => บาท(Number(r.t!.unitPrice)) },
            { key: "total", หัว: "ยอด", ชนิด: "เงิน", กว้าง: "19%", ค่า: r => บาท(Math.round(r.qty * Number(r.t!.unitPrice) * 100) / 100) },
            { key: "del", หัว: "", ชนิด: "ปุ่ม", กว้าง: 48, ค่า: r => <button type="button" aria-label={`เอา ${r.t!.name} ออก`} disabled={disabled} onClick={() => onChange(value.filter(v => v.templateId !== r.templateId))}
              style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", display: "inline-flex", padding: 4 }}><Trash2 size={14} /></button> },
          ]} />
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#374151" }}>รวมประเมิน</span>
        <span data-testid="estimate-total" style={{ fontSize: "0.95rem", fontWeight: 800, color: "#3b0764" }}>{รวม == null ? "—" : `${บาท(รวม)} บาท`}</span>
        <span data-testid="estimate-label" className="badge" style={{ background: "#fef3c7", color: "#92400e" }}>{ป้ายราคาประเมิน}</span>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>ราคาส่งดีลเลอร์ (ก่อน VAT) ตามแม่แบบ ณ วันนี้ — ใช้กะงบเบื้องต้นเท่านั้น ราคาจริงตามใบ HQ · ไม่แสดงต่อลูกค้า</div>
    </div>
  );
}
