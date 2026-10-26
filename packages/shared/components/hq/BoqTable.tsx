"use client";

// ─── ตาราง BOQ กลาง (ชื่อ · จำนวน · หน่วย · ต้นทุนต่อหน่วย) — คอมโพเนนต์เดียวของทั้งระบบ (บอสสั่ง 26 ต.ค. 69) ─────────────
//
// ใช้ที่ใบ HQ (H8) ตอนนี้ · งานแม่แบบวัสดุใช้ตัวเดียวกัน ไม่รื้อตาราง: แหล่งรายการใหม่ = ส่งปุ่มเข้ามาทาง `แหล่ง`
//   รายการจากทุกแหล่งเข้าตารางทางเดียว: แทรกรายการ() (lib/quoteRequests.ts) — วางจาก Excel ก็ใช้ตัวนี้
//   แหล่งที่มีตอนนี้: พิมพ์เอง · Enter ที่แถวสุดท้าย = แถวใหม่ · วางจาก Excel (แตกแถวเอง แถวที่อ่านไม่ได้เตือนที่แถว)
//   แหล่งที่จะมา: เลือกจากแม่แบบวัสดุ · รายการจากคำขอดีลเลอร์ — ผู้เรียกส่ง { label, เปิด(แทรก) } มา ตารางไม่ต้องรู้ว่ามาจากไหน
// ตัวตาราง "ควบคุมจากข้างนอก" (lines + onChange) — ผู้เรียกถือสถานะ/ร่างค้าง/การบันทึกเอง
// ยอดรวม = ผลรวมแถวที่ไม่ว่าง (ปัดสองตำแหน่งแบบเดียวกับฐาน) · ใต้ยอดรวม "เฉลี่ย X บาท/ตร.ม." เมื่อมีพื้นที่
// ⚠️ แถวรายการเขียนในตัว map ตรง ๆ — ห้ามแยกเป็นคอมโพเนนต์ที่ประกาศในคอมโพเนนต์นี้ (ช่องกรอกโฟกัสหลุดทุกครั้งที่พิมพ์)
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import {
  type HqQuoteLine, type แถววาง, ยอดบรรทัด, ยอดรวมใบ, หน่วยBOQ, แถวว่าง, แถวเปล่าใหม่, แยกแถววางจากExcel, แทรกรายการ,
} from "@pms/shared/lib/quoteRequests";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";

const NAVY = "#003366";
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ช่องกรอก: React.CSSProperties = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", fontSize: "0.84rem" };

/** แหล่งรายการเพิ่มเติม (ปุ่มข้าง "เพิ่มรายการอื่น") — เปิด(แทรก) แล้วส่งรายการกลับผ่าน แทรก(rows) */
export type แหล่งรายการ = { key: string; label: string; icon?: LucideIcon; disabled?: boolean; เปิด: (แทรก: (rows: แถววาง[]) => void) => void };

export function BoqTable({ lines, onChange, editable, area, แหล่ง = [], ป้ายยอดรวม = "ราคาส่งดีลเลอร์ (ก่อน VAT)", ป้ายตาราง = "รายการ BOQ", ป้ายพื้นที่ = "คำขอนี้" }: {
  lines: แถววาง[];
  onChange: (next: แถววาง[] | ((prev: แถววาง[]) => แถววาง[])) => void;
  editable: boolean;
  /** พื้นที่ (ตร.ม.) — มีค่า = แสดงเฉลี่ยบาท/ตร.ม. ใต้ยอดรวม */
  area?: number | null;
  แหล่ง?: แหล่งรายการ[];
  ป้ายยอดรวม?: string;
  ป้ายตาราง?: string;
  ป้ายพื้นที่?: string;
}) {
  const ตาราง = useRef<HTMLTableElement>(null);
  const [โฟกัสแถว, setโฟกัสแถว] = useState<number | null>(null);
  const รวม = useMemo(() => ยอดรวมใบ(lines.filter(l => !แถวว่าง(l))), [lines]);
  const พื้นที่ = Number(area) > 0 ? Number(area) : null;

  // Enter ที่แถวสุดท้ายเพิ่มแถวใหม่ → โฟกัสช่องชื่อของแถวใหม่หลังวาด
  useEffect(() => {
    if (โฟกัสแถว == null) return;
    ตาราง.current?.querySelector<HTMLInputElement>(`input[aria-label="ชื่อรายการ ${โฟกัสแถว + 1}"]`)?.focus();
    setโฟกัสแถว(null);
  }, [โฟกัสแถว, lines.length]);

  const แก้บรรทัด = (i: number, patch: Partial<HqQuoteLine>) => onChange(ls => ls.map((l, j) => j === i ? { ...l, ...patch, เตือน: undefined } : l));
  const เพิ่มแถว = () => { onChange(ls => [...ls, แถวเปล่าใหม่()]); setโฟกัสแถว(lines.length); };
  const ลบแถว = (i: number) => onChange(ls => { const ต่อ = ls.filter((_, j) => j !== i); return ต่อ.length ? ต่อ : [แถวเปล่าใหม่()]; });
  /** ทางเดียวที่รายการจากแหล่งอื่นเข้าตาราง (at = แถวที่วาง · ไม่ระบุ = ต่อท้าย) */
  const แทรก = (rows: แถววาง[], at?: number) => {
    if (!rows.length) return;
    onChange(ls => แทรกรายการ(ls, rows, at));
    const อ่านไม่ได้ = rows.filter(r => r.เตือน).length;
    if (อ่านไม่ได้) แจ้งพลาด(`เพิ่ม ${rows.length} รายการ — อ่านไม่ได้ ${อ่านไม่ได้} แถว ดูคำเตือนที่แถวนั้น`);
    else แจ้งสำเร็จ(`เพิ่ม ${rows.length} รายการแล้ว`);
  };
  const กดปุ่มในแถว = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (i === lines.length - 1) เพิ่มแถว();
    else ตาราง.current?.querySelector<HTMLInputElement>(`input[aria-label="ชื่อรายการ ${i + 2}"]`)?.focus();
  };
  // วางจาก Excel: หลายแถว (คั่น Tab) แตกเป็นรายการเอง · ข้อความธรรมดา = วางในช่องตามปกติ
  const วาง = (e: React.ClipboardEvent<HTMLInputElement>, i: number) => {
    const แถว = แยกแถววางจากExcel(e.clipboardData.getData("text/plain"));
    if (!แถว) return;
    e.preventDefault();
    แทรก(แถว, i);
  };

  return (
    <div data-boq-table style={{ display: "grid", gap: 10, minWidth: 0 }}>
      {editable && (
        <div style={{ fontSize: "0.74rem", color: "#6b7280" }}>
          พิมพ์แล้วกด Enter ที่แถวสุดท้ายเพื่อเพิ่มแถว · วางจาก Excel ได้หลายแถว (คอลัมน์ รายการ · จำนวน · หน่วย · ต้นทุนต่อหน่วย)
        </div>
      )}
      <datalist id="boq-units">{หน่วยBOQ.map(u => <option key={u} value={u} />)}</datalist>
      <div className="table-scroll">
        <table ref={ตาราง} className="table" style={{ width: "100%" }} aria-label={ป้ายตาราง}>
          <thead>
            <tr><th style={{ minWidth: 220 }}>รายการ</th><th style={{ width: 110 }}>จำนวน</th><th style={{ width: 100 }}>หน่วย</th><th style={{ width: 140 }}>ต้นทุน/หน่วย</th><th style={{ width: 140, textAlign: "right" }}>ยอด</th>{editable && <th style={{ width: 44 }}></th>}</tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "#9ca3af", padding: 18 }}>ยังไม่มีรายการ</td></tr>}
            {lines.map((l, i) => (
              <tr key={i} data-row-warning={l.เตือน ? "true" : undefined} style={l.เตือน ? { background: "#fff7ed" } : undefined}>
                <td>{editable
                  ? <>
                      <input aria-label={`ชื่อรายการ ${i + 1}`} value={l.name} onChange={e => แก้บรรทัด(i, { name: e.target.value })}
                        onKeyDown={e => กดปุ่มในแถว(e, i)} onPaste={e => วาง(e, i)} placeholder={i === 0 && lines.length === 1 ? "เช่น โครงสร้างเหล็ก" : undefined} style={ช่องกรอก} />
                      {l.เตือน && <div role="alert" data-testid={`row-warning-${i + 1}`} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: "0.72rem", color: "#b45309", fontWeight: 600 }}><AlertTriangle size={12} /> {l.เตือน}</div>}
                    </>
                  : l.name}</td>
                <td>{editable
                  ? <span onKeyDown={e => กดปุ่มในแถว(e, i)}><NumberInput ariaLabel={`จำนวน ${i + 1}`} value={Number(l.qty)} min={0} onChange={n => แก้บรรทัด(i, { qty: n })} style={ช่องกรอก} /></span>
                  : Number(l.qty).toLocaleString()}</td>
                <td>{editable
                  ? <input aria-label={`หน่วย ${i + 1}`} list="boq-units" value={l.unit} onChange={e => แก้บรรทัด(i, { unit: e.target.value })} onKeyDown={e => กดปุ่มในแถว(e, i)} placeholder="เลือก/พิมพ์" style={ช่องกรอก} />
                  : l.unit}</td>
                <td>{editable
                  ? <span onKeyDown={e => กดปุ่มในแถว(e, i)}><NumberInput ariaLabel={`ต้นทุนต่อหน่วย ${i + 1}`} value={Number(l.unitCost)} min={0} onChange={n => แก้บรรทัด(i, { unitCost: n })} style={ช่องกรอก} /></span>
                  : บาท(Number(l.unitCost))}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{แถวว่าง(l) ? "—" : บาท(ยอดบรรทัด(l))}</td>
                {editable && <td><button type="button" aria-label={`ลบรายการ ${i + 1}`} onClick={() => ลบแถว(i)} style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", display: "flex" }}><Trash2 size={15} /></button></td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>{ป้ายยอดรวม}</td><td style={{ textAlign: "right", fontWeight: 800, color: NAVY }} data-testid="hq-quote-total">{บาท(รวม)}</td>{editable && <td />}</tr>
            {พื้นที่ && รวม > 0 && (
              <tr><td colSpan={4} style={{ textAlign: "right", fontSize: "0.76rem", color: "#6b7280", borderTop: "none" }}>{ป้ายพื้นที่} {พื้นที่.toLocaleString()} ตร.ม.</td>
                <td data-testid="hq-quote-per-sqm" data-value={Math.round(รวม / พื้นที่ * 100) / 100} style={{ textAlign: "right", fontSize: "0.78rem", color: "#374151", fontWeight: 700, borderTop: "none", whiteSpace: "nowrap" }}>เฉลี่ย {บาท(Math.round(รวม / พื้นที่ * 100) / 100)} บาท/ตร.ม.</td>{editable && <td style={{ borderTop: "none" }} />}</tr>
            )}
          </tfoot>
        </table>
      </div>
      {editable && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={เพิ่มแถว}>
            <Plus size={13} /> เพิ่มรายการอื่น
          </button>
          {แหล่ง.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.key} type="button" className="btn btn-outline btn-sm" data-boq-source={s.key} disabled={s.disabled} onClick={() => s.เปิด(rows => แทรก(rows))}>
                {Icon && <Icon size={13} />} {s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
