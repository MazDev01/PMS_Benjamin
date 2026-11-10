"use client";

// ── นำเข้ารายการวัสดุจากไฟล์ (ตั้งค่า › รายการวัสดุ · บอสสั่ง 5 พ.ย. 69 · ใบ 0279) ─────────────────────────────────────────────
//   เปิดจากเมนูนำเข้าตัวกลาง (ImportMenu): เลือกไฟล์ → ตรวจ 4 กลุ่ม พร้อม / อัปเดตราคา (ราคาเก่า→ใหม่) / ต้องตรวจ / ข้าม → นำเข้าทั้งชุด
//   ต้องตรวจ: หน่วยนอกรายการ = "ใช้หน่วยนี้" หรือเลือกหน่วยจากรายการ · หน่วยต่างจากของเดิม = "ใช้หน่วยเดิม" · ราคาผิด = พิมพ์ราคาใหม่ · เปิดใช้อ่านไม่ออก = เลือก
//   ชุดที่นำเข้าล่าสุด: ยกเลิกทั้งชุดได้ถ้ายังไม่มีคำขอราคาใช้วัสดุในชุด และไม่มีใครแก้ราคาหลังนำเข้า (ฐานตัดสิน) · คืนราคาเดิมด้วย
//   ตรรกะล้วนอยู่ lib/materialImport.ts · ฐานตรวจซ้ำทุกข้อ (hq_materials_import)
import { useEffect, useMemo, useState } from "react";
import { X, Check, Undo2 } from "lucide-react";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { ยืนยัน, แจ้งสำเร็จ, แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { UnitSelect } from "@pms/shared/components/ui/UnitSelect";
import { materialTemplates as repo } from "@pms/shared/lib/data";
import { อ่านสมุดงานจากไฟล์ } from "@pms/shared/lib/importSheet";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { fmtISOToThai } from "@pms/shared/lib/mock";
import type { MaterialTemplate, ชุดนำเข้าวัสดุ } from "@pms/shared/lib/materialTemplates";
import {
  หาหัวตารางวัสดุ, เตรียมแถววัสดุ, จัดกลุ่มวัสดุ, แถวส่งฐานวัสดุ, นำเข้าวัสดุได้สูงสุด, type แถววัสดุ, type กลุ่มวัสดุ,
} from "@pms/shared/lib/materialImport";

const ป้ายกลุ่ม: Record<กลุ่มวัสดุ, string> = { ready: "พร้อม", update: "อัปเดตราคา", review: "ต้องตรวจ", skip: "ข้าม" };
const บาท = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MaterialImportModal({ open, onClose, onImported, ไฟล์เริ่ม, ที่มี, หน่วย }: {
  open: boolean; onClose: () => void; onImported: () => void;
  /** ไฟล์ที่เลือกจากเมนูนำเข้า — เปิดแล้วอ่านทันที · ไม่มี = เปิดที่ชุดที่นำเข้าล่าสุด */
  ไฟล์เริ่ม?: File | null;
  /** รายการวัสดุในระบบ (ตรวจอัปเดตราคา · ฐานตรวจอีกชั้น) */
  ที่มี: MaterialTemplate[];
  /** หน่วยที่รู้จัก: หน่วยมาตรฐาน + หน่วยที่รายการวัสดุใช้อยู่ (useรายการหน่วย) */
  หน่วย: string[];
}) {
  const [ไฟล์, setไฟล์] = useState<string | null>(null);
  const [ดิบ, setดิบ] = useState<แถววัสดุ[] | null>(null);
  const [ดู, setดู] = useState<กลุ่มวัสดุ>("ready");
  const [กำลัง, setกำลัง] = useState(false);
  const [พลาด, setพลาด] = useState("");
  const [ชุด, setชุด] = useState<ชุดนำเข้าวัสดุ[]>([]);
  const โหลดชุด = () => repo.importBatches().then(setชุด).catch(() => setชุด([]));
  useEffect(() => { if (open) void โหลดชุด(); }, [open]);
  useEffect(() => { if (open && ไฟล์เริ่ม) void เลือกไฟล์(ไฟล์เริ่ม); }, [open, ไฟล์เริ่ม]);   // eslint-disable-line react-hooks/exhaustive-deps

  const แถว = useMemo(() => ดิบ && จัดกลุ่มวัสดุ(ดิบ, ที่มี, หน่วย), [ดิบ, ที่มี, หน่วย]);
  const นับ = (g: กลุ่มวัสดุ) => (แถว ?? []).filter(r => r.กลุ่ม === g).length;
  const ส่งได้ = (แถว ?? []).filter(r => r.กลุ่ม === "ready" || r.กลุ่ม === "update");

  async function เลือกไฟล์(f: File) {
    setดิบ(null); setพลาด(""); setไฟล์(f.name);
    try {
      const ตาราง = [...(await อ่านสมุดงานจากไฟล์(f)).values()][0] ?? [];
      const หัว = หาหัวตารางวัสดุ(ตาราง);
      if (!หัว) { setพลาด("หาแถวหัวตารางไม่เจอ — ต้องมีคอลัมน์ \"ชื่อวัสดุ\" และ \"หน่วย\" (ดาวน์โหลดแบบฟอร์มตัวอย่างจากเมนูนำเข้า)"); return; }
      const rs = เตรียมแถววัสดุ(ตาราง, หัว.แถวหัว, หัว.คู่);
      if (!rs.length) { setพลาด("ไฟล์นี้ไม่มีแถวข้อมูลใต้หัวตาราง"); return; }
      setดิบ(rs);
      const g = จัดกลุ่มวัสดุ(rs, ที่มี, หน่วย);
      setดู(g.some(r => r.กลุ่ม === "review") ? "review" : g.some(r => r.กลุ่ม === "ready") ? "ready" : g.some(r => r.กลุ่ม === "update") ? "update" : "skip");
    } catch (e) { setพลาด(`อ่านไฟล์ไม่ได้: ${friendlyError(e)}`); }
  }
  const แก้ = (row: number, patch: Partial<แถววัสดุ>) => setดิบ(xs => xs && xs.map(r => r.row === row ? { ...r, ...patch } : r));

  async function นำเข้า() {
    if (!ไฟล์ || !ส่งได้.length) return;
    if (ส่งได้.length > นำเข้าวัสดุได้สูงสุด) { setพลาด(`นำเข้าได้ครั้งละไม่เกิน ${นำเข้าวัสดุได้สูงสุด.toLocaleString()} แถว — แบ่งไฟล์ก่อน`); return; }
    if (!(await ยืนยัน({ หัวข้อ: `นำเข้ารายการวัสดุ: เพิ่ม ${นับ("ready")} · อัปเดตราคา ${นับ("update")} รายการ?`,
      รายละเอียด: `แถวต้องตรวจที่ยังไม่แก้ ${นับ("review")} แถว และแถวข้าม ${นับ("skip")} แถว จะไม่ถูกนำเข้า · ไม่ลบวัสดุที่มีอยู่ · ยกเลิกทั้งชุดได้ภายหลัง (คืนราคาเดิม)`,
      ปุ่มตกลง: "นำเข้า" }))) return;
    setกำลัง(true); setพลาด("");
    try {
      const r = await repo.importRows(ไฟล์, ส่งได้.map(แถวส่งฐานวัสดุ));
      แจ้งสำเร็จ(`นำเข้าแล้ว · เพิ่ม ${r.inserted} · อัปเดตราคา ${r.updated} รายการ`);
      setดิบ(null); setไฟล์(null); onImported(); void โหลดชุด();
    } catch (e) { setพลาด(`นำเข้าไม่สำเร็จ (ไม่มีแถวใดถูกบันทึก): ${friendlyError(e)}`); }
    finally { setกำลัง(false); }
  }
  async function ยกเลิกชุด(b: ชุดนำเข้าวัสดุ) {
    if (!(await ยืนยัน({ หัวข้อ: `ยกเลิกการนำเข้า "${b.fileName || "ไฟล์ไม่มีชื่อ"}" ทั้งชุด?`,
      รายละเอียด: `ลบวัสดุที่ชุดนี้เพิ่ม ${b.inserted} รายการ · คืนราคาเดิม ${b.updated} รายการ`, ปุ่มตกลง: "ยกเลิกทั้งชุด", อันตราย: true }))) return;
    try { const r = await repo.cancelImport(b.id); แจ้งสำเร็จ(`ยกเลิกแล้ว · ลบ ${r.deleted} · คืนราคาเดิม ${r.restored} รายการ`); onImported(); void โหลดชุด(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
  }

  if (!open) return null;
  const เซลล์: React.CSSProperties = { padding: "6px 8px", fontSize: "0.76rem", borderBottom: "1px solid #f0f2f4", verticalAlign: "top" };
  const แสดง = (แถว ?? []).filter(r => r.กลุ่ม === ดู);
  return (
    <ModalPortal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
        <ModalCard onClose={onClose} label="นำเข้ารายการวัสดุ" className="card" style={{ width: "100%", maxWidth: 980, maxHeight: "92vh", display: "flex", flexDirection: "column", pointerEvents: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 800 }}>นำเข้ารายการวัสดุจากไฟล์</div>
            <button type="button" aria-label="ปิด" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={16} /></button>
          </div>
          <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 14 }}>
            {ไฟล์ && <div data-testid="material-import-file" style={{ fontSize: "0.8rem", color: "#374151" }}>ไฟล์: <b>{ไฟล์}</b></div>}
            {พลาด && <div role="alert" style={{ fontSize: "0.8rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px" }}>{พลาด}</div>}

            {แถว && (
              <section aria-label="ตรวจแถวก่อนนำเข้า" style={{ display: "grid", gap: 10 }}>
                <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["ready", "update", "review", "skip"] as const).map(g => (
                    <button key={g} type="button" role="tab" aria-selected={ดู === g} data-material-group={g} onClick={() => setดู(g)}
                      className={ดู === g ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}>{ป้ายกลุ่ม[g]} <span data-count>{นับ(g)}</span></button>
                  ))}
                </div>
                <div className="table-wrap">
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <colgroup><col style={{ width: 56 }} /><col style={{ width: "14%" }} /><col /><col style={{ width: "16%" }} /><col style={{ width: "18%" }} /><col style={{ width: "26%" }} /></colgroup>
                    <thead><tr>{["แถว", "หมวด", "ชื่อวัสดุ", "หน่วย", ดู === "update" ? "ราคาเก่า → ใหม่" : "ราคาต่อหน่วย", ดู === "ready" ? "เปิดใช้" : "เหตุผล / แก้"].map(h =>
                      <th key={h} style={{ ...เซลล์, textAlign: "left", fontWeight: 700, color: "#6b7280", background: "#f8f9fb" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {แสดง.length === 0 && <tr><td colSpan={6} style={{ ...เซลล์, color: "#9ca3af", textAlign: "center", padding: 18 }}>ไม่มีแถวในกลุ่มนี้</td></tr>}
                      {แสดง.map(r => (
                        <tr key={r.row} data-material-import-row={r.row}>
                          <td style={เซลล์}>{r.row}</td>
                          <td style={เซลล์}>{r.category || "—"}</td>
                          <td style={{ ...เซลล์, fontWeight: 600 }}>{r.name || "—"}</td>
                          <td style={เซลล์}>
                            {ดู === "review" && !r.เดิม && r.เหตุ.some(x => x.includes("ไม่อยู่ในรายการ"))
                              ? <UnitSelect ariaLabel={`หน่วย แถว ${r.row}`} value={r.unit} หน่วย={[...หน่วย, r.unit]} onChange={u => แก้(r.row, { unit: u })} />
                              : r.unit || "—"}
                          </td>
                          <td style={เซลล์}>
                            {ดู === "update" ? <span data-price-change>{บาท(r.เดิม?.unitPrice)} → <b>{บาท(r.unitPrice)}</b></span>
                              : ดู === "review" && r.unitPrice === null
                                ? <input aria-label={`ราคาต่อหน่วย แถว ${r.row}`} defaultValue={r.ราคาดิบ} onBlur={e => แก้(r.row, { ราคาดิบ: e.target.value })}
                                    style={{ width: "100%", border: "1px solid #dc2626", borderRadius: 7, padding: "4px 6px", fontSize: "0.78rem", boxSizing: "border-box" }} />
                                : บาท(r.unitPrice)}
                          </td>
                          <td style={เซลล์}>
                            {ดู === "ready" ? (r.active === false ? "ปิด" : "เปิด") : (
                              <div style={{ display: "grid", gap: 4 }}>
                                {r.เหตุ.map(x => <span key={x} style={{ color: ดู === "review" ? "#b45309" : "#6b7280" }}>{x}</span>)}
                                {ดู === "review" && (
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {!r.เดิม && r.เหตุ.some(x => x.includes("ไม่อยู่ในรายการ")) &&
                                      <button type="button" className="btn btn-secondary btn-sm" data-use-unit onClick={() => แก้(r.row, { ยืนยันหน่วย: true })}><Check size={12} /> ใช้หน่วยนี้</button>}
                                    {r.เดิม && r.เหตุ.some(x => x.startsWith("หน่วยต่างจากของเดิม")) &&
                                      <button type="button" className="btn btn-secondary btn-sm" data-use-old-unit onClick={() => แก้(r.row, { unit: r.เดิม!.unit })}>ใช้หน่วยเดิม ({r.เดิม.unit})</button>}
                                    {!r.เดิม && r.active === null &&
                                      <>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => แก้(r.row, { เปิดใช้ดิบ: "เปิด" })}>เปิดใช้</button>
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => แก้(r.row, { เปิดใช้ดิบ: "ปิด" })}>ปิดใช้</button>
                                      </>}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setดิบ(null); setไฟล์(null); }}>ยกเลิก</button>
                  <button type="button" className="btn btn-primary btn-sm" data-material-import-submit disabled={กำลัง || !ส่งได้.length} onClick={() => void นำเข้า()}>
                    {กำลัง ? "กำลังนำเข้า…" : `นำเข้า ${ส่งได้.length} รายการ`}
                  </button>
                </div>
              </section>
            )}

            <section aria-label="ชุดที่นำเข้าล่าสุด" style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: "0.84rem" }}>ชุดที่นำเข้าล่าสุด</div>
              {ชุด.length === 0 && <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>ยังไม่มีชุดที่นำเข้า</div>}
              {ชุด.map(b => (
                <div key={b.id} data-material-batch={b.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.76rem", padding: "6px 10px", border: "1px solid #eef0f3", borderRadius: 8, flexWrap: "wrap" }}>
                  <b>{b.fileName || "ไฟล์ไม่มีชื่อ"}</b>
                  <span>เพิ่ม {b.inserted} · อัปเดตราคา {b.updated}</span>
                  <span style={{ color: "#9ca3af" }}>{b.createdBy} · {fmtISOToThai(String(b.createdAt).slice(0, 10))}</span>
                  <span style={{ flex: 1 }} />
                  {b.cancelledAt ? <span style={{ color: "#6b7280" }}>ยกเลิกแล้ว</span>
                    : b.blocked ? <span data-batch-blocked style={{ color: "#b45309" }}>ยกเลิกไม่ได้ — {b.blocked}</span>
                      : <button type="button" className="btn btn-secondary btn-sm" data-cancel-batch onClick={() => void ยกเลิกชุด(b)}><Undo2 size={12} /> ยกเลิกทั้งชุด</button>}
                </div>
              ))}
            </section>
          </div>
        </ModalCard>
      </div>
    </ModalPortal>
  );
}
