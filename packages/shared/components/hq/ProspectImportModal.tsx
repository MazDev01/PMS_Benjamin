"use client";

// ── นำเข้าผู้สนใจเป็นดีลเลอร์จากไฟล์ทำงานจริงของทีม (HQ · ใบ 0275 · บอสสั่ง 3 พ.ย. 69) ─────────────────────────────────────
//   ขั้น: อัปโหลด → จับคู่คอลัมน์ (ระบบเดา แก้ได้ จำไว้ครั้งหน้าตามหัวตาราง) → ตรวจ 3 กลุ่ม พร้อม/ต้องตรวจ/ข้าม → นำเข้า → สรุป + ดาวน์โหลดแถวที่ข้าม
//   ไม่บังคับใช้แม่แบบ: หาแถวหัวตารางเอง · ข้ามแถวหัวข้อแทรก · แยกแถวรวมช่องเดียว · จับคู่จังหวัด 77 · ถามปีครั้งเดียว · ตารางแปลงช่องทางแก้ได้
//   ฐานตัดสินสุดท้าย (เบอร์ซ้ำ · ขั้น · จังหวัด · ไม่เกิน 1,000 แถว · ทั้งชุด) · ยกเลิกทั้งชุดได้ · ตรรกะล้วนอยู่ lib/prospectImport.ts
import { useEffect, useMemo, useState } from "react";
import { Upload, X, Download, Check, Undo2 } from "lucide-react";
import { ModalPortal } from "@pms/shared/components/ui/ModalPortal";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { ยืนยัน, แจ้งสำเร็จ, แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { prospects as prospectsRepo } from "@pms/shared/lib/data";
import type { ชุดนำเข้าผู้สนใจ, ผลนำเข้าผู้สนใจ } from "@pms/shared/lib/data/types";
import { อ่านสมุดงานจากไฟล์, นามสกุลที่รับได้ } from "@pms/shared/lib/importSheet";
import { สร้างไฟล์Xlsx, ดาวน์โหลดไฟล์ } from "@pms/shared/lib/exportWorkbook";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import {
  หาแถวหัวตาราง, เดาคอลัมน์, ลายเซ็นหัว, เตรียมแถว, จัดกลุ่ม, แถวส่งฐาน, แปลงช่องทางตั้งต้น, ช่องทางที่ไม่รู้จัก, จังหวัดทั้งหมด,
  ชื่อช่องนำเข้า, นำเข้าได้สูงสุด, type การจับคู่, type ช่องนำเข้า, type แถวนำเข้า, type ขั้นนำเข้า, type กลุ่มแถว,
} from "@pms/shared/lib/prospectImport";

const ที่จำ = "bpms_prospect_import_map";
const ขั้นที่นำเข้าได้: { k: ขั้นนำเข้า; label: string }[] = [
  { k: "new", label: "รอติดต่อ" }, { k: "contacted", label: "ติดต่อแล้ว" }, { k: "profile_sent", label: "ส่งข้อมูลบริษัทแล้ว" }, { k: "lost", label: "ไม่สำเร็จ" },
];
const ป้ายกลุ่ม: Record<กลุ่มแถว, string> = { ready: "พร้อม", review: "ต้องตรวจ", skip: "ข้าม" };
const ปีพศนี้ = () => new Date(Date.now() + 7 * 3_600_000).getUTCFullYear() + 543;
const อ่านที่จำ = (): Record<string, การจับคู่> => { try { return JSON.parse(localStorage.getItem(ที่จำ) ?? "{}"); } catch { return {}; } };
const จำ = (ลาย: string, คู่: การจับคู่) => { try { localStorage.setItem(ที่จำ, JSON.stringify({ ...อ่านที่จำ(), [ลาย]: คู่ })); } catch { /* จำไม่ได้ = ครั้งหน้าเดาใหม่ */ } };

export function ProspectImportModal({ open, onClose, onImported, เบอร์ที่มีอยู่, แหล่งที่มา, เหตุผลไม่สำเร็จ }: {
  open: boolean; onClose: () => void; onImported: () => void;
  /** เบอร์ของผู้สนใจที่มีอยู่ (ตรวจซ้ำก่อนส่ง · ฐานตรวจอีกชั้น) */
  เบอร์ที่มีอยู่: string[];
  /** รายการแหล่งที่มาของหน้าตั้งค่า (ตารางแปลงช่องทางเลือกจากนี้) */
  แหล่งที่มา: string[];
  เหตุผลไม่สำเร็จ: string[];
}) {
  const [ไฟล์, setไฟล์] = useState<{ ชื่อ: string; ตาราง: string[][] } | null>(null);
  const [แถวหัว, setแถวหัว] = useState(-1);
  const [คู่, setคู่] = useState<การจับคู่>({});
  const [ปี, setปี] = useState(ปีพศนี้());
  const [ช่องทาง, setช่องทาง] = useState<Record<string, string>>({ ...แปลงช่องทางตั้งต้น });
  const [แถว, setแถว] = useState<แถวนำเข้า[] | null>(null);
  const [หัวข้อที่ข้าม, setหัวข้อที่ข้าม] = useState(0);
  const [ดู, setดู] = useState<กลุ่มแถว>("review");
  const [กำลัง, setกำลัง] = useState(false);
  const [ผล, setผล] = useState<ผลนำเข้าผู้สนใจ | null>(null);
  const [พลาด, setพลาด] = useState("");
  const [ชุด, setชุด] = useState<ชุดนำเข้าผู้สนใจ[]>([]);
  const โหลดชุด = () => prospectsRepo.importBatches().then(setชุด).catch(() => setชุด([]));
  useEffect(() => { if (open) void โหลดชุด(); }, [open]);
  const ล้าง = () => { setไฟล์(null); setแถว(null); setผล(null); setพลาด(""); setแถวหัว(-1); setคู่({}); };

  const หัว = ไฟล์ && แถวหัว >= 0 ? ไฟล์.ตาราง[แถวหัว] ?? [] : [];
  // ช่องทางดิบที่พบในไฟล์ (ทำตารางแปลงให้แก้)
  const ช่องทางในไฟล์ = useMemo(() => {
    if (!ไฟล์ || คู่.channel === undefined) return [];
    return [...new Set(ไฟล์.ตาราง.slice(แถวหัว + 1).map(r => String(r[คู่.channel!] ?? "").trim()).filter(Boolean))];
  }, [ไฟล์, คู่.channel, แถวหัว]);
  const คีย์ช่องทาง = (s: string) => s.toLowerCase().replace(/\s+/g, "");

  async function เลือกไฟล์(f: File | undefined) {
    if (!f) return;
    ล้าง();
    try {
      const เล่ม = await อ่านสมุดงานจากไฟล์(f);
      const ตาราง = [...เล่ม.values()][0] ?? [];
      const h = หาแถวหัวตาราง(ตาราง);
      setไฟล์({ ชื่อ: f.name, ตาราง });
      setแถวหัว(h);
      if (h >= 0) setคู่(อ่านที่จำ()[ลายเซ็นหัว(ตาราง[h])] ?? เดาคอลัมน์(ตาราง[h]));
      else setพลาด("หาแถวหัวตารางไม่เจอ (ต้องมีหัวคอลัมน์ เช่น เบอร์ · จังหวัด · ชื่อ) — เลือกแถวหัวตารางเองด้านล่าง");
    } catch (e) { setพลาด(`อ่านไฟล์ไม่ได้: ${friendlyError(e)}`); }
  }
  function ไปตรวจ() {
    if (!ไฟล์ || แถวหัว < 0) return;
    if (คู่.phone === undefined) { setพลาด("ต้องเลือกคอลัมน์เบอร์โทร (ใช้กันรายซ้ำ)"); return; }
    setพลาด("");
    จำ(ลายเซ็นหัว(หัว), คู่);
    const ได้ = เตรียมแถว(ไฟล์.ตาราง, แถวหัว, คู่, { ปี, ช่องทาง, เหตุผลไม่สำเร็จ, เบอร์ที่มีอยู่ });
    setแถว(ได้.แถว); setหัวข้อที่ข้าม(ได้.หัวข้อที่ข้าม);
    setดู(ได้.แถว.some(r => r.กลุ่ม === "review") ? "review" : "ready");
  }
  const แก้แถว = (row: number, patch: Partial<แถวนำเข้า>) => setแถว(xs => xs && จัดกลุ่ม(xs.map(r => r.row === row ? { ...r, ...patch } : r), เบอร์ที่มีอยู่));
  const นับ = (g: กลุ่มแถว) => (แถว ?? []).filter(r => r.กลุ่ม === g).length;
  const พร้อม = (แถว ?? []).filter(r => r.กลุ่ม === "ready");

  async function นำเข้า() {
    if (!ไฟล์ || !พร้อม.length) return;
    if (พร้อม.length > นำเข้าได้สูงสุด) { setพลาด(`นำเข้าได้ครั้งละไม่เกิน ${นำเข้าได้สูงสุด.toLocaleString()} แถว — แบ่งไฟล์ก่อน`); return; }
    if (!(await ยืนยัน({ หัวข้อ: `นำเข้าผู้สนใจ ${พร้อม.length.toLocaleString()} ราย?`,
      รายละเอียด: `แถวต้องตรวจที่ยังไม่ยืนยัน ${นับ("review")} แถว และแถวข้าม ${นับ("skip")} แถว จะไม่ถูกนำเข้า · ยกเลิกทั้งชุดได้ภายหลัง`, ปุ่มตกลง: "นำเข้า" }))) return;
    setกำลัง(true); setพลาด("");
    try {
      const r = await prospectsRepo.importRows(ไฟล์.ชื่อ, พร้อม.map(แถวส่งฐาน));
      setผล(r); แจ้งสำเร็จ(`นำเข้าแล้ว ${r.inserted.toLocaleString()} ราย`); onImported(); void โหลดชุด();
    } catch (e) { setพลาด(`นำเข้าไม่สำเร็จ (ไม่มีแถวใดถูกบันทึก): ${friendlyError(e)}`); }
    finally { setกำลัง(false); }
  }
  function ดาวน์โหลดที่ข้าม() {
    if (!แถว) return;
    const จากฐาน = new Map((ผล?.skipped ?? []).map(s => [String(s.row), s.reason]));
    const รายการ = แถว.filter(r => r.กลุ่ม !== "ready" || จากฐาน.has(String(r.row)));
    const blob = สร้างไฟล์Xlsx([{ ชื่อ: "แถวที่ไม่ได้นำเข้า", หัวตาราง: ["แถว", "เหตุผล", "ชื่อ", "เบอร์", "จังหวัด", "ข้อความเดิม"],
      แถว: รายการ.map(r => [r.row, จากฐาน.get(String(r.row)) ?? (r.กลุ่ม === "review" ? `ยังไม่ยืนยัน: ${r.เหตุ.join(" · ")}` : r.เหตุ.join(" · ")),
        r.name, r.phone, r.province ?? "", r.เดิม ?? ""]) }]);
    ดาวน์โหลดไฟล์(blob, `แถวที่ไม่ได้นำเข้า-${ไฟล์?.ชื่อ.replace(/\.[^.]+$/, "") ?? "ไฟล์"}.xlsx`);
  }
  async function ยกเลิกชุด(b: ชุดนำเข้าผู้สนใจ) {
    if (!(await ยืนยัน({ หัวข้อ: `ยกเลิกการนำเข้า "${b.fileName}" ทั้งชุด?`, รายละเอียด: `ลบผู้สนใจที่นำเข้าชุดนี้ ${b.remaining.toLocaleString()} ราย · มีรายที่ออกใบค่าแฟรนไชส์แล้ว = ยกเลิกไม่ได้`,
      ปุ่มตกลง: "ยกเลิกทั้งชุด", อันตราย: true }))) return;
    try { const r = await prospectsRepo.cancelImport(b.id); แจ้งสำเร็จ(`ยกเลิกแล้ว · ลบ ${r.deleted.toLocaleString()} ราย`); onImported(); void โหลดชุด(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
  }

  if (!open) return null;
  const เซลล์: React.CSSProperties = { padding: "6px 8px", fontSize: "0.76rem", borderBottom: "1px solid #f0f2f4", verticalAlign: "top" };
  return (
    <ModalPortal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200 }} />
      <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
        <ModalCard onClose={onClose} label="นำเข้าผู้สนใจ" className="card" style={{ width: "100%", maxWidth: 1080, maxHeight: "92vh", display: "flex", flexDirection: "column", pointerEvents: "auto" }}>
          <div data-panel-head style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
            <div style={{ fontWeight: 800 }}>นำเข้าผู้สนใจจากไฟล์</div>
            <button type="button" aria-label="ปิด" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}><X size={16} /></button>
          </div>
          <div style={{ padding: 18, overflowY: "auto", display: "grid", gap: 14 }}>
            {/* 1 · อัปโหลด */}
            <div>
              <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                <Upload size={13} /> เลือกไฟล์ (.xlsx / .csv)
                <input type="file" aria-label="ไฟล์ผู้สนใจ" accept={นามสกุลที่รับได้.join(",")} hidden onChange={e => void เลือกไฟล์(e.target.files?.[0])} />
              </label>
              {ไฟล์ && <span data-testid="import-file" style={{ marginLeft: 8, fontSize: "0.78rem" }}>{ไฟล์.ชื่อ} · {ไฟล์.ตาราง.length.toLocaleString()} แถวที่มีข้อมูล</span>}
            </div>
            {พลาด && <div role="alert" style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "0.78rem", fontWeight: 600 }}>{พลาด}</div>}

            {/* 2 · จับคู่คอลัมน์ */}
            {ไฟล์ && !แถว && (
              <section aria-label="จับคู่คอลัมน์" style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: "0.78rem" }}>
                  <label htmlFor="pi-header">แถวหัวตาราง</label>
                  {/* ต้องมีค่าเสมอ — แถวหัวตาราง (ตัวเลือกแรก −1 = ยังไม่ระบุ) */}
                  <select id="pi-header" className="form-select" style={{ width: "auto" }} value={แถวหัว}
                    onChange={e => { const h = Number(e.target.value); setแถวหัว(h); setคู่(h >= 0 ? (อ่านที่จำ()[ลายเซ็นหัว(ไฟล์.ตาราง[h])] ?? เดาคอลัมน์(ไฟล์.ตาราง[h])) : {}); }}>
                    <option value={-1}>— ยังไม่ระบุ —</option>
                    {ไฟล์.ตาราง.slice(0, 15).map((r, i) => <option key={i} value={i}>แถว {i + 1}: {r.filter(Boolean).slice(0, 4).join(" · ").slice(0, 60)}</option>)}
                  </select>
                  <label htmlFor="pi-year">ปีของวันที่ (วัน.เดือน ในไฟล์ไม่มีปี)</label>
                  {/* ต้องมีค่าเสมอ — ปีของวันที่ในไฟล์ (ถามครั้งเดียว · ค่าตั้งต้นปีนี้) */}
                  <select id="pi-year" className="form-select" style={{ width: "auto" }} value={ปี} onChange={e => setปี(Number(e.target.value))}>
                    {[ปีพศนี้() - 1, ปีพศนี้(), ปีพศนี้() + 1].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                {แถวหัว >= 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                    {(Object.keys(ชื่อช่องนำเข้า) as ช่องนำเข้า[]).map(k => (
                      <label key={k} style={{ display: "grid", gap: 3, fontSize: "0.72rem", color: "#52606d" }}>
                        {ชื่อช่องนำเข้า[k]}{k === "phone" ? " *" : ""}
                        <select aria-label={`คอลัมน์ ${ชื่อช่องนำเข้า[k]}`} className="form-select" value={คู่[k] ?? ""}
                          onChange={e => setคู่(c => { const n = { ...c }; if (e.target.value === "") delete n[k]; else n[k] = Number(e.target.value); return n; })}>
                          <option value="">— ไม่ใช้ —</option>
                          {หัว.map((h, i) => h ? <option key={i} value={i}>{h}</option> : null)}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                {ช่องทางในไฟล์.length > 0 && (
                  <table aria-label="ตารางแปลงช่องทาง" style={{ maxWidth: 520 }}>
                    <thead><tr><th style={{ textAlign: "left" }}>ช่องทางในไฟล์</th><th style={{ textAlign: "left" }}>แหล่งที่มาในระบบ</th></tr></thead>
                    <tbody>
                      {ช่องทางในไฟล์.map(c => (
                        <tr key={c}><td style={เซลล์}>{c}</td><td style={เซลล์}>
                          {/* ต้องมีค่าเสมอ — ตารางแปลงช่องทาง (ไม่รู้จัก = แนะนำต่อ) */}
                          <select aria-label={`แหล่งที่มาของ ${c}`} className="form-select" value={ช่องทาง[คีย์ช่องทาง(c)] ?? ช่องทางที่ไม่รู้จัก}
                            onChange={e => setช่องทาง(m => ({ ...m, [คีย์ช่องทาง(c)]: e.target.value }))}>
                            {[...new Set([...แหล่งที่มา, ช่องทางที่ไม่รู้จัก])].map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div><button type="button" className="btn btn-primary btn-sm" disabled={แถวหัว < 0} onClick={ไปตรวจ}>ไปหน้าตรวจ</button></div>
              </section>
            )}

            {/* 3 · ตรวจ 3 กลุ่ม */}
            {แถว && !ผล && (
              <section aria-label="ตรวจก่อนนำเข้า" style={{ display: "grid", gap: 10 }}>
                <div role="tablist" aria-label="กลุ่มแถว" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {(["ready", "review", "skip"] as const).map(g => (
                    <button key={g} type="button" role="tab" aria-selected={ดู === g} data-group={g} className={ดู === g ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} onClick={() => setดู(g)}>
                      {ป้ายกลุ่ม[g]} <span data-count={นับ(g)}>{นับ(g).toLocaleString()}</span>
                    </button>
                  ))}
                  <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>แถวหัวข้อแทรกที่ข้าม {หัวข้อที่ข้าม} แถว</span>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setแถว(null)}>กลับไปจับคู่คอลัมน์</button>
                </div>
                <div className="table-wrap" style={{ maxHeight: "48vh", overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
                  <table aria-label={`แถว${ป้ายกลุ่ม[ดู]}`} style={{ width: "100%" }}>
                    <thead><tr><th>แถว</th><th>ชื่อ</th><th>เบอร์</th><th>จังหวัด</th><th>แหล่งที่มา</th><th>ขั้น</th><th>{ดู === "skip" ? "เหตุผลที่ข้าม" : "ต้องตรวจ / หมายเหตุ"}</th>{ดู === "review" && <th />}</tr></thead>
                    <tbody>
                      {แถว.filter(r => r.กลุ่ม === ดู).map(r => (
                        <tr key={r.row} data-import-row={r.row} data-group={r.กลุ่ม}>
                          <td style={เซลล์}>{r.row}</td>
                          <td style={เซลล์}>{ดู === "review"
                            ? <input className="form-input" aria-label={`ชื่อ แถว ${r.row}`} value={r.name} onChange={e => แก้แถว(r.row, { name: e.target.value })} />
                            : r.name || "—"}{r.เดิม && <div style={{ fontSize: "0.66rem", color: "#9ca3af" }}>เดิม: {r.เดิม}</div>}</td>
                          <td style={เซลล์}>{r.phone || "—"}</td>
                          <td style={เซลล์}>{ดู === "review"
                            ? <select className="form-select" aria-label={`จังหวัด แถว ${r.row}`} value={r.province ?? ""} onChange={e => แก้แถว(r.row, { province: e.target.value || null })}>
                                <option value="">— ยังไม่ระบุ —</option>
                                {จังหวัดทั้งหมด.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            : r.province ?? "—"}</td>
                          <td style={เซลล์}>{r.channel ?? "—"}</td>
                          <td style={เซลล์}>{ดู === "review"
                            ? <>
                                {/* ต้องมีค่าเสมอ — ขั้นของผู้สนใจ (ระบบเดาจากหมายเหตุ · HQ แก้ได้) */}
                                <select className="form-select" aria-label={`ขั้น แถว ${r.row}`} value={r.status} onChange={e => แก้แถว(r.row, { status: e.target.value as ขั้นนำเข้า })}>
                                  {ขั้นที่นำเข้าได้.map(s => <option key={s.k} value={s.k}>{s.label}</option>)}
                                </select>
                                {/* ไม่ใช่กล่องเหตุผล — แก้ค่าของแถวในหน้าตรวจก่อนนำเข้า (ยังไม่ได้ส่งฐาน · ฐานบังคับเหตุผลตอนนำเข้า) */}
                                {r.status === "lost" && (
                                  <select className="form-select" aria-label={`เหตุผล แถว ${r.row}`} value={r.lostReason ?? ""} onChange={e => แก้แถว(r.row, { lostReason: e.target.value || null })} style={{ marginTop: 4 }}>
                                    <option value="">— ยังไม่ระบุ —</option>
                                    {[...new Set([...เหตุผลไม่สำเร็จ, ...(r.lostReason ? [r.lostReason] : [])])].map(x => <option key={x} value={x}>{x}</option>)}
                                  </select>
                                )}
                              </>
                            : ขั้นที่นำเข้าได้.find(s => s.k === r.status)?.label}</td>
                          <td style={{ ...เซลล์, color: ดู === "ready" ? "#52606d" : "#b45309" }}>{ดู === "ready" ? (r.note || "—") : r.เหตุ.join(" · ")}</td>
                          {ดู === "review" && <td style={เซลล์}>
                            <button type="button" className="btn btn-secondary btn-sm" aria-label={`ยืนยัน แถว ${r.row}`} onClick={() => แก้แถว(r.row, { เหตุ: [] })}><Check size={12} /> ยืนยัน</button>
                          </td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={กำลัง || !พร้อม.length} onClick={() => void นำเข้า()}>
                    {กำลัง ? "กำลังนำเข้า…" : `นำเข้า ${พร้อม.length.toLocaleString()} ราย`}
                  </button>
                  <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>นำเข้าเฉพาะกลุ่มพร้อม · ต้องตรวจ = กด "ยืนยัน" ทีละแถวก่อน · ไม่เกิน {นำเข้าได้สูงสุด.toLocaleString()} แถวต่อครั้ง</span>
                </div>
              </section>
            )}

            {/* 4 · สรุปผล */}
            {ผล && (
              <section aria-label="ผลการนำเข้า" data-testid="import-result" data-inserted={ผล.inserted} style={{ display: "grid", gap: 8, fontSize: "0.82rem" }}>
                <div><b>นำเข้าแล้ว {ผล.inserted.toLocaleString()} ราย</b> · ฐานข้าม {ผล.skipped.length.toLocaleString()} แถว · ไม่ได้ส่ง (ต้องตรวจ/ข้าม) {(นับ("review") + นับ("skip")).toLocaleString()} แถว</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={ดาวน์โหลดที่ข้าม}><Download size={13} /> ดาวน์โหลดแถวที่ไม่ได้นำเข้า (พร้อมเหตุผล)</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={ล้าง}>นำเข้าไฟล์อื่น</button>
                </div>
              </section>
            )}

            {/* ชุดที่นำเข้าล่าสุด — ยกเลิกทั้งชุดได้ */}
            {ชุด.length > 0 && (
              <section aria-label="ชุดที่นำเข้าล่าสุด" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 6 }}>ชุดที่นำเข้าล่าสุด</div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
                  {ชุด.map(b => (
                    <li key={b.id} data-batch={b.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.74rem" }}>
                      <span style={{ flex: 1 }}>{b.fileName || "ไฟล์ไม่มีชื่อ"} · เพิ่ม {b.inserted.toLocaleString()} · ข้าม {b.skipped.toLocaleString()} · {b.createdBy || "—"}</span>
                      {b.cancelledAt ? <span style={{ color: "#6b7280" }}>ยกเลิกแล้ว</span>
                        : <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ยกเลิกชุด(b)}><Undo2 size={12} /> ยกเลิกทั้งชุด</button>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </ModalCard>
      </div>
    </ModalPortal>
  );
}
