"use client";

// ─── HQ · ทำ BOQ และส่งใบ HQ ให้ดีลเลอร์ (FLOW.html ขั้น 5–6 · ด่าน 2) ─────────────────────────────────────────
//
// ขั้น 5  ทำ BOQ — HQ พิมพ์รายการเอง (ชื่อ · จำนวน · หน่วย · ต้นทุน) · บันทึกร่างกี่ครั้งก็ได้ ดีลเลอร์ไม่เห็นร่าง
//         (ตัวเลือกจากแม่แบบเอาออกแล้ว — บอสสั่งเอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
// ขั้น 6  ส่งใบ HQ — ล็อกเวอร์ชัน · หยุดนับ 14 วัน · อีเมลถึงดีลเลอร์ · ลูกค้าเป้าหมายคงเดิม (ฐานข้อมูลทำทั้งหมด)
// ส่งแล้วแก้ไม่ได้ (กฎ "ใบ HQ ที่ส่งแล้วแก้ไม่ได้ ต้องออกเวอร์ชันใหม่") — แผงนี้แสดงแบบอ่านอย่างเดียว
//   เวอร์ชันใหม่เกิดเมื่อดีลเลอร์ "ขอแก้ราคา" → คำขอใหม่ · HQ กด "เริ่มจากใบเวอร์ชันก่อน" แล้วแก้ต่อ
// ⚠️ แถวรายการเขียนในตัว map ตรง ๆ — ห้ามแยกเป็นคอมโพเนนต์ที่ประกาศในคอมโพเนนต์นี้ (ช่องกรอกโฟกัสหลุดทุกครั้งที่พิมพ์)
import { useEffect, useMemo, useState } from "react";
import { Plus, Send, Trash2, X, Copy, Lock } from "lucide-react";
import { quoteRequests as repo } from "@pms/shared/lib/data";
import {
  type QuoteRequest, type HqQuote, type HqQuoteLine, hqQuoteStatusLabel, ยอดบรรทัด, ยอดรวมใบ, วันไทยสั้น, เกินกำหนด,
} from "@pms/shared/lib/quoteRequests";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { NumberInput } from "@pms/shared/components/ui/NumberInput";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { logRepoRead } from "@pms/shared/lib/repoLog";

const NAVY = "#003366";
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** วันยืนราคาตั้งต้น = 30 วันจากวันนี้ (เวลาไทย) */
const วันยืนราคาตั้งต้น = () => new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);

export function HqQuoteEditor({ request, dealerName, onClose, onChanged, inline = false, headerExtra, onDirtyChange, onBusyChange }: {
  request: QuoteRequest;
  dealerName: string;
  onClose: () => void;
  /** ฝังในหน้า (กล่องงานคำขอราคา · หน้า 5) แทนหน้าต่างลอย — ใช้เนื้อหาชุดเดียวกัน · เป็นพื้นที่ชื่อ "ใบ HQ" */
  inline?: boolean;
  /** ปุ่มเพิ่มบนหัว (เช่น "รับเรื่อง" ของคำขอใหม่) — แสดงเฉพาะแบบฝังในหน้า */
  headerExtra?: React.ReactNode;
  /** มีการแก้ที่ยังไม่บันทึกหรือไม่ — หน้าแม่ใช้ถามก่อนทิ้งเมื่อเปลี่ยนแถว/กลุ่ม (หน้า 5 · บอสสั่ง 19 ต.ค. 69) */
  onDirtyChange?: (dirty: boolean) => void;
  /** กำลังบันทึก/ส่งใบ — หน้าแม่ห้ามเปลี่ยนแถวจนกว่าจะเสร็จ (เปลี่ยนระหว่างรอคำตอบ = ต้นเหตุข้อไม่นิ่งรอบก่อน ๆ) */
  onBusyChange?: (busy: boolean) => void;
  /** สถานะคำขอเปลี่ยน (รับเรื่อง/ส่งใบ) — ให้คิวโหลดใหม่ */
  onChanged: () => void;
}) {
  const [ใบ, setใบ] = useState<HqQuote | null | undefined>(undefined);
  const [ใบก่อน, setใบก่อน] = useState<HqQuote | null>(null);
  const [lines, setLines] = useState<HqQuoteLine[]>([]);
  const [ยืนราคาถึง, setยืนราคาถึง] = useState(วันยืนราคาตั้งต้น());
  const [หมายเหตุ, setหมายเหตุ] = useState("");
  const [busy, setBusy] = useState(false);
  // ภาพของใบตอนโหลด/บันทึกล่าสุด — ต่างจากที่อยู่บนจอ = มีการแก้ที่ยังไม่บันทึก
  const [ภาพที่บันทึก, setภาพที่บันทึก] = useState<string | null>(null);
  const ภาพ = (ls: HqQuoteLine[], v: string, n: string) => JSON.stringify([ls.map(l => [l.name, Number(l.qty), l.unit, Number(l.unitCost)]), v, n]);

  useEffect(() => {
    let alive = true;
    repo.hqQuoteFor(request.id).then(h => {
      if (!alive) return;
      setใบ(h);
      if (h) { setLines(h.lineItems); setยืนราคาถึง(h.validUntil ?? วันยืนราคาตั้งต้น()); setหมายเหตุ(h.note); }
      setภาพที่บันทึก(h ? ภาพ(h.lineItems, h.validUntil ?? วันยืนราคาตั้งต้น(), h.note) : ภาพ([], วันยืนราคาตั้งต้น(), ""));
    }).catch(e => { logRepoRead("quoteRequests.hqQuoteFor", e); if (alive) { setใบ(null); setภาพที่บันทึก(ภาพ([], วันยืนราคาตั้งต้น(), "")); } });
    // ขอแก้ราคา: ใบเวอร์ชันก่อนหน้า (ใช้เป็นจุดเริ่มของเวอร์ชันใหม่)
    if (request.supersedesId) repo.hqQuoteFor(request.supersedesId).then(h => alive && setใบก่อน(h)).catch(e => logRepoRead("quoteRequests.hqQuoteFor(prev)", e));
    return () => { alive = false; };
  }, [request.id, request.supersedesId]);

  const ล็อก = !!ใบ && ใบ.status !== "draft";
  const แก้ได้ = !ล็อก && (request.status === "new" || request.status === "pricing");
  const รวม = useMemo(() => ยอดรวมใบ(lines), [lines]);
  const ปัญหา = useMemo(() => {
    if (lines.length === 0) return "ยังไม่มีรายการ";
    const ผิด = lines.find(l => !l.name.trim() || !(Number(l.qty) > 0) || !(Number(l.unitCost) >= 0));
    if (ผิด) return `รายการ "${ผิด.name || "ไม่มีชื่อ"}" ต้องมีชื่อ จำนวนมากกว่า 0 และต้นทุนต่อหน่วย`;
    if (รวม <= 0) return "ยอดรวมต้องมากกว่า 0";
    if (!ยืนราคาถึง) return "ต้องกำหนดวันยืนราคา";
    return "";
  }, [lines, รวม, ยืนราคาถึง]);

  const แก้ค้าง = ภาพที่บันทึก !== null && ภาพ(lines, ยืนราคาถึง, หมายเหตุ) !== ภาพที่บันทึก;
  useEffect(() => { onDirtyChange?.(แก้ค้าง); }, [แก้ค้าง, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onDirtyChange?.(false); onBusyChange?.(false); }, [onDirtyChange, onBusyChange]);
  const แก้บรรทัด = (i: number, patch: Partial<HqQuoteLine>) => setLines(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l));

  const บันทึก = async (): Promise<HqQuote | null> => {
    const clean = lines.map(l => ({ ...l, name: l.name.trim(), unit: l.unit.trim(), qty: Number(l.qty), unitCost: Number(l.unitCost) }));
    const h = await repo.saveHqQuote(request.id, clean, ยืนราคาถึง, หมายเหตุ);
    setใบ(h);
    setภาพที่บันทึก(ภาพ(clean, ยืนราคาถึง, หมายเหตุ));
    return h;
  };
  const กดบันทึก = async () => {
    setBusy(true);
    try { await บันทึก(); แจ้งสำเร็จ("บันทึกร่างใบ HQ แล้ว — ดีลเลอร์ยังไม่เห็นจนกว่าจะส่ง"); onChanged(); }
    catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const กดส่ง = async () => {
    if (ปัญหา) { แจ้งพลาด(ปัญหา); return; }
    const ตกลง = await ยืนยัน({
      หัวข้อ: `ส่งใบ HQ ให้ ${request.dealerCode} ?`,
      รายละเอียด: `ยอดต้นทุนรวม ${บาท(รวม)} บาท · ยืนราคาถึง ${วันไทยสั้น(ยืนราคาถึง)} — ส่งแล้วแก้ไม่ได้ ถ้าต้องแก้ ดีลเลอร์ต้องขอแก้ราคาเป็นเวอร์ชันใหม่`,
      ปุ่มตกลง: "ส่งใบ HQ",
    });
    if (!ตกลง) return;
    setBusy(true);
    try {
      await บันทึก();
      const h = await repo.sendHqQuote(request.id);
      setใบ(h);
      แจ้งสำเร็จ(`ส่งใบ ${h.quoteNo} ให้ดีลเลอร์แล้ว`);
      onChanged();
    } catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };
  const เริ่มจากใบก่อน = async () => {
    if (!ใบก่อน) return;
    setBusy(true);
    try {
      const h = await repo.copyHqQuote(request.id, ใบก่อน.id);
      setใบ(h); setLines(h.lineItems); setยืนราคาถึง(h.validUntil ?? วันยืนราคาตั้งต้น()); setหมายเหตุ(h.note);
      setภาพที่บันทึก(ภาพ(h.lineItems, h.validUntil ?? วันยืนราคาตั้งต้น(), h.note));
      แจ้งสำเร็จ(`เริ่มเวอร์ชันใหม่จาก ${ใบก่อน.quoteNo} แล้ว — แก้รายการแล้วส่งได้เลย`);
      onChanged();
    } catch (e) { แจ้งพลาด(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const ช่อง: React.CSSProperties = { width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", fontSize: "0.84rem" };
  const เนื้อหา = (
    <>
        <div style={{ background: NAVY, color: "#fff", padding: "16px 22px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 800 }}>
              ใบ HQ · {request.requestNo}{ใบ ? ` · ${ใบ.quoteNo}` : ""}
            </h2>
            <div style={{ fontSize: "0.78rem", opacity: 0.85, marginTop: 2 }}>
              {request.dealerCode} {dealerName} · {request.leadCompany || "—"}
            </div>
          </div>
          {ใบ && <span className="badge" style={{ background: ล็อก ? "#dcfce7" : "#fef3c7", color: ล็อก ? "#166534" : "#92400e" }}>{hqQuoteStatusLabel[ใบ.status]}</span>}
          {inline && headerExtra}
          {!inline && <button type="button" onClick={onClose} disabled={busy} aria-label="ปิด" style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex" }}><X size={18} /></button>}
        </div>

        {/* minmax(0,1fr): ตาราง BOQ กว้างเกินจอแคบ = เลื่อนในกรอบตัวเอง ไม่ดันทั้งแผงล้นขอบ (หน้า 5 แบบฝังในหน้า) */}
        <div style={{ padding: "16px 22px", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
          {/* สิ่งที่ดีลเลอร์ขอ */}
          <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", fontSize: "0.82rem", color: "#374151", display: "grid", gap: 4 }}>
            <div><b>งานที่ขอ:</b> {request.product}{request.subtype ? ` · ${request.subtype}` : ""}{request.area ? ` · ${Number(request.area).toLocaleString()} ตร.ม.` : ""} · <b>จังหวัดหน้างาน:</b> {request.province || "—"}</div>
            <div style={{ whiteSpace: "pre-wrap" }}><b>สเปกจากดีลเลอร์:</b> {request.spec || "—"}</div>
            {request.status !== "quoted" && (
              <div><b>กำหนดส่งใบ HQ:</b> {วันไทยสั้น(request.dueAt)}{เกินกำหนด(request) && <span className="badge" style={{ marginLeft: 6, background: "#fee2e2", color: "#b91c1c" }}>เกินกำหนด</span>}</div>
            )}
          </div>

          {ใบ === undefined && <div style={{ color: "#9ca3af", fontSize: "0.84rem" }}>กำลังโหลด…</div>}

          {ใบ !== undefined && !ใบ && ใบก่อน && แก้ได้ && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#eff6ff", borderRadius: 12, padding: "10px 14px", fontSize: "0.82rem" }}>
              <span style={{ flex: 1 }}>ดีลเลอร์ขอแก้ราคาจาก {ใบก่อน.quoteNo} — เริ่มเวอร์ชันใหม่จากรายการเดิมแล้วแก้ต่อได้</span>
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void เริ่มจากใบก่อน()}><Copy size={13} /> เริ่มจากใบเวอร์ชันก่อน</button>
            </div>
          )}

          {ใบ !== undefined && (
            <>
              {ล็อก && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534", background: "#f0fdf4", borderRadius: 12, padding: "10px 14px", fontSize: "0.82rem" }}>
                  <Lock size={14} /> ส่งให้ดีลเลอร์แล้ว{ใบ?.sentAt ? ` ${วันไทยสั้น(ใบ.sentAt)}` : ""}{ใบ?.sentByName ? ` โดย ${ใบ.sentByName}` : ""} — ใบนี้แก้ไม่ได้ ถ้าต้องแก้ ดีลเลอร์ต้องขอแก้ราคาเป็นเวอร์ชันใหม่
                </div>
              )}
              <div className="table-scroll">
                <table className="table" style={{ width: "100%" }} aria-label="รายการ BOQ">
                  <thead>
                    <tr><th style={{ minWidth: 220 }}>รายการ</th><th style={{ width: 110 }}>จำนวน</th><th style={{ width: 90 }}>หน่วย</th><th style={{ width: 140 }}>ต้นทุน/หน่วย</th><th style={{ width: 140, textAlign: "right" }}>ยอด</th>{แก้ได้ && <th style={{ width: 44 }}></th>}</tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "#9ca3af", padding: 18 }}>ยังไม่มีรายการ — กด "เพิ่มรายการอื่น" ด้านล่างเพื่อเริ่ม BOQ</td></tr>}
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td>{แก้ได้
                          ? <input aria-label={`ชื่อรายการ ${i + 1}`} value={l.name} onChange={e => แก้บรรทัด(i, { name: e.target.value })} style={ช่อง} />
                          : l.name}</td>
                        <td>{แก้ได้
                          ? <NumberInput ariaLabel={`จำนวน ${i + 1}`} value={Number(l.qty)} min={0} onChange={n => แก้บรรทัด(i, { qty: n })} style={ช่อง} />
                          : Number(l.qty).toLocaleString()}</td>
                        <td>{แก้ได้
                          ? <input aria-label={`หน่วย ${i + 1}`} value={l.unit} onChange={e => แก้บรรทัด(i, { unit: e.target.value })} style={ช่อง} />
                          : l.unit}</td>
                        <td>{แก้ได้
                          ? <NumberInput ariaLabel={`ต้นทุนต่อหน่วย ${i + 1}`} value={Number(l.unitCost)} min={0} onChange={n => แก้บรรทัด(i, { unitCost: n })} style={ช่อง} />
                          : บาท(Number(l.unitCost))}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{บาท(ยอดบรรทัด(l))}</td>
                        {แก้ได้ && <td><button type="button" aria-label={`ลบรายการ ${i + 1}`} onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", display: "flex" }}><Trash2 size={15} /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>ต้นทุนรวม (ราคาที่ดีลเลอร์ได้)</td><td style={{ textAlign: "right", fontWeight: 800, color: NAVY }} data-testid="hq-quote-total">{บาท(รวม)}</td>{แก้ได้ && <td />}</tr>
                  </tfoot>
                </table>
              </div>

              {แก้ได้ && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setLines(ls => [...ls, { name: "", qty: 1, unit: "งาน", unitCost: 0 }])}>
                    <Plus size={13} /> เพิ่มรายการอื่น
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <label style={{ display: "grid", gap: 4, fontSize: "0.8rem", fontWeight: 600, color: "#374151" }}>
                  ยืนราคาถึง
                  {แก้ได้
                    ? <input type="date" aria-label="ยืนราคาถึง" value={ยืนราคาถึง} onChange={e => setยืนราคาถึง(e.target.value)} style={{ ...ช่อง, width: 180 }} />
                    : <span style={{ fontWeight: 400 }}>{ใบ?.validUntil ? วันไทยสั้น(ใบ.validUntil) : "—"}</span>}
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: "0.8rem", fontWeight: 600, color: "#374151", flex: 1, minWidth: 240 }}>
                  หมายเหตุถึงดีลเลอร์
                  {แก้ได้
                    ? <input aria-label="หมายเหตุถึงดีลเลอร์" value={หมายเหตุ} onChange={e => setหมายเหตุ(e.target.value)} style={ช่อง} placeholder="เช่น ราคานี้ยังไม่รวมฐานราก" />
                    : <span style={{ fontWeight: 400 }}>{ใบ?.note || "—"}</span>}
                </label>
              </div>

              {แก้ได้ && (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                  {ปัญหา && <span style={{ fontSize: "0.78rem", color: "#92400e", marginRight: "auto" }}>{ปัญหา}</span>}
                  <button type="button" className="btn btn-outline btn-md" disabled={busy || lines.length === 0} onClick={() => void กดบันทึก()}>บันทึกร่าง</button>
                  <button type="button" className="btn btn-primary btn-md" disabled={busy || !!ปัญหา} onClick={() => void กดส่ง()}>
                    <Send size={14} /> ส่งใบ HQ ให้ดีลเลอร์
                  </button>
                </div>
              )}
            </>
          )}
        </div>
    </>
  );
  if (inline) return (
    <section aria-label="ใบ HQ" style={{ background: "#fff", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden" }}>{เนื้อหา}</section>
  );
  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.42)", zIndex: 1050, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <ModalCard onClose={() => !busy && onClose()} label="ใบ HQ" className="modal-fit"
        style={{ width: 960, maxWidth: "100%", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.28)" }}>
        {เนื้อหา}
      </ModalCard>
    </div>
  );
}
