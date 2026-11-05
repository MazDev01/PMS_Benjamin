"use client";

// ── เพิ่มวัสดุหลายรายการ (ตั้งค่า › รายการวัสดุ · บอสสั่ง 5 พ.ย. 69) ───────────────────────────────────────────────────────────
//   ตารางกรอกหลายแถว: + เพิ่มแถว · วางหลายแถวจาก Excel ได้ (วางที่ช่องไหน = เริ่มจากแถว/คอลัมน์นั้น · คอลัมน์ หมวด · ชื่อวัสดุ · หน่วย · ราคา · เปิดใช้)
//   บันทึกครั้งเดียว (material_templates_save = ทั้งหมดหรือไม่เลย) · แถวว่างทั้งแถวไม่นับ
//   ช่องบังคับ * (ชื่อวัสดุ · หน่วย) แดงเหมือนเดิม · แถวผิด (ขาดช่องบังคับ · ราคาไม่ใช่ตัวเลข · ซ้ำกันเอง/ซ้ำของเดิมในหมวดเดียวกัน) = กรอบแดง ไม่บันทึกทั้งชุด
import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { แจ้งสำเร็จ, แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { UnitSelect } from "@pms/shared/components/ui/UnitSelect";
import { ดาวบังคับ, กรอบผิด } from "@pms/shared/components/ui/FieldLabel";
import { materialTemplates as repo } from "@pms/shared/lib/data";
import { แยกตารางจากข้อความ } from "@pms/shared/lib/importSheet";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { อ่านราคา, อ่านเปิดใช้, ตรวจแถวเพิ่มวัสดุ, ว่างทั้งแถว, type แถวกรอก } from "@pms/shared/lib/materialImport";
import type { MaterialTemplate } from "@pms/shared/lib/materialTemplates";

const คอลัมน์วาง = ["category", "name", "unit", "price", "active"] as const;
let ลำดับ = 0;
const แถวเปล่า = (): แถวกรอก => ({ key: ++ลำดับ, category: "", name: "", unit: "", price: "", active: true });
const ช่อง: React.CSSProperties = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", fontSize: "0.82rem", boxSizing: "border-box", fontFamily: "inherit" };

export function MaterialAddModal({ open, onClose, onSaved, ที่มี, หน่วย }: {
  open: boolean; onClose: () => void;
  /** บันทึกสำเร็จ — รายการทั้งหมดหลังบันทึก */
  onSaved: (ls: MaterialTemplate[]) => void;
  ที่มี: MaterialTemplate[];
  หน่วย: string[];
}) {
  const [แถว, setแถว] = useState<แถวกรอก[]>(() => [แถวเปล่า()]);
  const [ตรวจแล้ว, setตรวจแล้ว] = useState(false);
  const [กำลัง, setกำลัง] = useState(false);
  const หมวด = useMemo(() => [...new Set(ที่มี.map(t => t.category.trim()).filter(Boolean))].sort(), [ที่มี]);
  const ปัญหา = useMemo(() => ตรวจแถวเพิ่มวัสดุ(แถว, ที่มี), [แถว, ที่มี]);
  const แก้ = (key: number, patch: Partial<แถวกรอก>) => setแถว(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));

  // วางหลายแถว/หลายคอลัมน์จาก Excel (คั่นด้วย tab · ขึ้นบรรทัดใหม่) — เริ่มที่แถว/คอลัมน์ที่วาง เพิ่มแถวให้พอเอง
  function วาง(e: React.ClipboardEvent, key: number, คอล: (typeof คอลัมน์วาง)[number]) {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;   // ข้อความช่องเดียว = วางปกติ
    e.preventDefault();
    const ตาราง = แยกตารางจากข้อความ(text, "\t");
    setแถว(rs => {
      const ใหม่ = [...rs];
      const เริ่ม = ใหม่.findIndex(r => r.key === key), ค = คอลัมน์วาง.indexOf(คอล);
      ตาราง.forEach((cells, i) => {
        const at = เริ่ม + i;
        if (!ใหม่[at]) ใหม่[at] = แถวเปล่า();
        const r = { ...ใหม่[at] };
        cells.forEach((v, j) => {
          const k = คอลัมน์วาง[ค + j];
          if (!k) return;
          if (k === "active") r.active = อ่านเปิดใช้(v) ?? true;
          else r[k] = String(v ?? "").trim();
        });
        ใหม่[at] = r;
      });
      return ใหม่;
    });
  }

  async function บันทึก() {
    setตรวจแล้ว(true);
    const ใช้ = แถว.filter(r => !ว่างทั้งแถว(r));
    if (!ใช้.length) { แจ้งพลาด("ยังไม่มีรายการให้บันทึก — กรอกอย่างน้อย 1 แถว"); return; }
    if (ปัญหา.size) { แจ้งพลาด(`มี ${ปัญหา.size} แถวที่ต้องแก้ (กรอบแดง) — ยังไม่บันทึกทั้งชุด`); return; }
    setกำลัง(true);
    try {
      const ls = await repo.save(ใช้.map(r => ({ category: r.category.trim(), name: r.name.trim(), unit: r.unit.trim(), unitPrice: อ่านราคา(r.price) ?? 0, active: r.active })), []);
      แจ้งสำเร็จ(`เพิ่มวัสดุแล้ว ${ใช้.length} รายการ`);
      setแถว([แถวเปล่า()]); setตรวจแล้ว(false);
      onSaved(ls);
    } catch (e) { แจ้งพลาด("บันทึกไม่สำเร็จ (ไม่มีรายการใดถูกบันทึก): " + friendlyError(e)); }
    finally { setกำลัง(false); }
  }

  if (!open) return null;
  const เซลล์: React.CSSProperties = { padding: "5px 6px", borderBottom: "1px solid #f0f2f4", verticalAlign: "top" };
  const ข้อความผิด = (s?: string) => s && ตรวจแล้ว ? <div style={{ fontSize: "0.68rem", color: "#dc2626", marginTop: 2 }}>{s}</div> : null;
  return (
    <ModalPortal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
        <ModalCard onClose={onClose} label="เพิ่มวัสดุ" className="card" style={{ width: "100%", maxWidth: 980, maxHeight: "92vh", display: "flex", flexDirection: "column", pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 800 }}>เพิ่มวัสดุ</div>
            <button type="button" aria-label="ปิด" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={16} /></button>
          </div>
          <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 10 }}>
            <div style={{ fontSize: "0.76rem", color: "#6b7280" }}>กรอกได้หลายแถว · คัดลอกหลายแถวจาก Excel (หมวด · ชื่อวัสดุ · หน่วย · ราคา · เปิดใช้) แล้ววางที่ช่องแรกได้เลย · บันทึกครั้งเดียวทั้งชุด</div>
            <datalist id="mt-add-categories">{หมวด.map(h => <option key={h} value={h} />)}</datalist>
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 760 }}>
                <colgroup><col style={{ width: 40 }} /><col style={{ width: "17%" }} /><col /><col style={{ width: "17%" }} /><col style={{ width: "17%" }} /><col style={{ width: 82 }} /><col style={{ width: 40 }} /></colgroup>
                <thead><tr>
                  {["#", "หมวด", <>ชื่อวัสดุ<ดาวบังคับ /></>, <>หน่วย<ดาวบังคับ /></>, "ราคาต่อหน่วย (ก่อน VAT)", "เปิดใช้", ""].map((h, i) =>
                    <th key={i} style={{ ...เซลล์, textAlign: i === 4 ? "right" : "left", fontSize: "0.74rem", fontWeight: 700, color: "#6b7280", background: "#f8f9fb", whiteSpace: "nowrap" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {แถว.map((r, i) => {
                    const ผิด = ตรวจแล้ว ? ปัญหา.get(r.key) : undefined;
                    return (
                      <tr key={r.key} data-add-row={i + 1} data-invalid={ผิด ? "1" : undefined} style={ผิด ? { outline: "2px solid #dc2626", outlineOffset: -2 } : undefined}>
                        <td style={{ ...เซลล์, fontSize: "0.74rem", color: "#9ca3af" }}>{i + 1}</td>
                        <td style={เซลล์}><input list="mt-add-categories" aria-label={`หมวด แถว ${i + 1}`} style={ช่อง} value={r.category} maxLength={80}
                          onChange={e => แก้(r.key, { category: e.target.value })} onPaste={e => วาง(e, r.key, "category")} /></td>
                        <td style={เซลล์}><input aria-label={`ชื่อวัสดุ แถว ${i + 1}`} style={{ ...ช่อง, ...(ผิด?.name ? กรอบผิด : {}) }} value={r.name} maxLength={200}
                          onChange={e => แก้(r.key, { name: e.target.value })} onPaste={e => วาง(e, r.key, "name")} />{ข้อความผิด(ผิด?.name)}</td>
                        <td style={เซลล์}><UnitSelect ariaLabel={`หน่วย แถว ${i + 1}`} value={r.unit} หน่วย={[...หน่วย, ...แถว.map(x => x.unit).filter(Boolean)]}
                          onChange={u => แก้(r.key, { unit: u })} style={ผิด?.unit ? กรอบผิด : undefined} />{ข้อความผิด(ผิด?.unit)}</td>
                        <td style={เซลล์}><input aria-label={`ราคาต่อหน่วย แถว ${i + 1}`} inputMode="decimal" placeholder="0.00" style={{ ...ช่อง, textAlign: "right", ...(ผิด?.price ? กรอบผิด : {}) }} value={r.price}
                          onChange={e => แก้(r.key, { price: e.target.value })} onPaste={e => วาง(e, r.key, "price")} />{ข้อความผิด(ผิด?.price)}</td>
                        <td style={เซลล์}><label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", cursor: "pointer" }}>
                          <input type="checkbox" aria-label={`เปิดใช้ แถว ${i + 1}`} checked={r.active} onChange={e => แก้(r.key, { active: e.target.checked })} />{r.active ? "เปิด" : "ปิด"}</label></td>
                        <td style={เซลล์}>{แถว.length > 1 &&
                          <button type="button" aria-label={`ลบแถว ${i + 1}`} onClick={() => setแถว(rs => rs.filter(x => x.key !== r.key))}
                            style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", display: "inline-flex", padding: 4 }}><Trash2 size={14} /></button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div><button type="button" className="btn btn-secondary btn-sm" data-add-line onClick={() => setแถว(rs => [...rs, แถวเปล่า()])}><Plus size={13} /> เพิ่มแถว</button></div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>ยกเลิก</button>
              <button type="button" className="btn btn-primary btn-sm" data-add-save disabled={กำลัง} onClick={() => void บันทึก()}>{กำลัง ? "กำลังบันทึก…" : "บันทึกทั้งหมด"}</button>
            </div>
          </div>
        </ModalCard>
      </div>
    </ModalPortal>
  );
}
