"use client";

// ─── ตารางรายการสินค้าใบเสนอราคา (BOQ) ──────────────────────────────────────────
// เลือกจากแคตตาล็อกแม่แบบ (main + subtypes) → ดึง "ราคากลาง HQ" (SolutionProduct.price) มาเติมให้อัตโนมัติ
// แก้จำนวน/ราคาต่อหน่วยได้ · รวมต่อแถว + ยอดรวม คิดเอง · จำนวนรายการ = จำนวนแถว
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { useMasterCatalog } from "@pms/shared/lib/useMasterCatalog";
import { sellRate } from "@pms/shared/lib/boq";
import { formatMoneyInput } from "@pms/shared/lib/format";
import { useDealerSettings } from "@pms/shared/lib/useDealerSettings";
import type { QuoteLineItem } from "@pms/shared/lib/mock";

const PRIMARY = "#003366";
const BORDER = "#e5e7eb";
const fmt = (n: number) => n.toLocaleString("th-TH");
// id เสถียรต่อแถว — ใช้ key แทน index (ลบแถวกลางแล้วโฟกัส/ค่าที่กำลังพิมพ์ไม่เลื่อนไปแถวอื่น)
const genId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `li-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// หน่วยมาตรฐานของงานขายอาคารสำเร็จรูป — แคตตาล็อก HQ คิดราคาเป็น ตร.ม. เป็นหลัก
// ที่เหลือคือหน่วยที่ใช้จริงตอนแตกรายการย่อย (งานเสริม/อุปกรณ์/เหมาทั้งหลัง)
const UNIT_OPTIONS = ["ตร.ม.", "เมตร", "จุด", "ชุด", "ชิ้น", "งาน", "หลัง", "รายการ"];

// เพดานกันกรอกเลขเกินจริง (พิมพ์เลข 0 เกินโดยไม่ตั้งใจ) — ไม่ใช่เพดานส่วนลด/ธุรกิจ
// ระบบไม่มีฟีเจอร์ส่วนลดแล้ว ราคา/หน่วยเจรจากับลูกค้าได้ตามจริง แค่กันพิมพ์ผิดจำนวนหลัก
// (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69 — เดิมกันแค่ค่าติดลบ ไม่มีเพดานบนเลย)
const MAX_QTY = 100_000;
const MAX_UNIT_PRICE = 100_000_000;
const clamp = (n: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(n) ? n : 0));

// showCatalog=false → ซ่อนทั้งปุ่ม "เลือกจากแคตตาล็อก" และปุ่มลบรายการ (บอสสั่ง)
// ใช้ตอน BOQ ตั้งต้นมาจากแม่แบบของลูกค้าแล้ว — เพิ่มไม่ได้ก็ไม่ควรลบได้ ไม่งั้นลบแล้วเอากลับไม่ได้
// ยังแก้ชื่อ/จำนวน/ราคาต่อหน่วยได้ตามปกติ
export function LineItemsEditor({ items, onChange, defaultQty, showCatalog = true }: { items: QuoteLineItem[]; onChange: (items: QuoteLineItem[]) => void; defaultQty?: number; showCatalog?: boolean }) {
  const catalog = useMasterCatalog();
  // ราคาที่โชว์ในตัวเลือก = "ราคาขายของสาขา" (ราคากลาง + ส่วนบวกเพิ่มที่ตั้งไว้ที่หน้าแม่แบบ)
  // ต้องเป็นตัวเลขเดียวกับที่หน้าแม่แบบโชว์ ไม่งั้นดีลเลอร์เห็นราคาหนึ่ง แต่ใบออกมาอีกราคา
  const pricing = useDealerSettings().settings.pricing;
  const ราคาขาย = (p: typeof catalog[number], subtype?: string) => sellRate(p, subtype ?? p.name, pricing);
  const [pickOpen, setPickOpen] = useState(false);
  const pickRef = useRef<HTMLDivElement>(null);
  // ── เลื่อนหน้าจอขณะเปิดรายการแคตตาล็อกไม่ได้ (แก้ 14 ส.ค. 69 · อาการเดียวกับเมนูผู้ใช้ HQ) ──
  // ฉากหลังใสที่คลุมทั้งจอไว้ดักคลิก ดักล้อเมาส์ไปด้วย — และป๊อปอัพนี้เลื่อนที่กล่องเนื้อหาข้างใน
  // ล้อจึงไปไม่ถึงตัวที่เลื่อนได้จริง · ปิดรายการเมื่อผู้ใช้ "ลงมือเลื่อน" นอกกล่องเท่านั้น
  // ⚠️ ต้องยกเว้นการเลื่อนในตัวรายการเอง (maxHeight 320 + overflow) ไม่งั้นเลื่อนดูแม่แบบล่าง ๆ ไม่ได้
  //
  // ⚠️ ห้ามดัก event "scroll" (17 ส.ค. 69): มันยิงตอนจอเลื่อน "เอง" ด้วย ไม่ใช่แค่ตอนผู้ใช้เลื่อน
  //    อาการที่เจอ: กดขั้น "เสนอราคา" → ระบบเปิดฟอร์มออกใบแล้วเลื่อนจอไปหาแบบนุ่ม ๆ (smooth)
  //    ถ้ากด "เลือกจากแคตตาล็อก" ระหว่างที่จอยังเลื่อนอยู่ → scroll ยิง → เมนูปิดทันทีที่เพิ่งเปิด
  //    ผู้ใช้เห็นเป็น "กดแล้วไม่ขึ้น" ต้องกดสองครั้ง → ออกใบไม่ได้ → ไปขั้นเสนอราคาไม่ได้ทั้งเส้นทาง
  //    wheel/touchmove ยิงจากมือผู้ใช้เท่านั้น จึงใช้แทนได้โดยไม่กระทบเจตนาเดิม
  //    (ป๊อปอัพนี้เป็น absolute เกาะปุ่มอยู่แล้ว จอเลื่อนก็เลื่อนตามไปด้วย ไม่ต้องปิดทิ้ง)
  useEffect(() => {
    if (!pickOpen) return;
    const close = (e?: Event) => {
      if (e && e.target instanceof Node && pickRef.current?.contains(e.target)) return;
      setPickOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickOpen(false); };
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("touchmove", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", close);
      window.removeEventListener("touchmove", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickOpen]);
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

  // เติม id ให้แถวที่ยังไม่มี (ข้อมูลเก่าที่ persist ไว้ / ที่ synth มาจากที่อื่น) ครั้งเดียวตอนโหลด
  useEffect(() => {
    if (items.some((it) => !it.id)) onChange(items.map((it) => (it.id ? it : { ...it, id: genId() })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const set = (i: number, patch: Partial<QuoteLineItem>) => onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const del = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const addFromCatalog = (name: string, unit: string, price: number) => { onChange([...items, { id: genId(), name, qty: defaultQty && defaultQty > 0 ? defaultQty : 1, unit, unitPrice: price }]); setPickOpen(false); };

  const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 7, border: `1px solid ${BORDER}`, fontSize: "0.78rem", outline: "none", color: "#2D2D2D", background: "#fff", boxSizing: "border-box" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>รายการสินค้า (BOQ)</label>
        <div style={{ display: "flex", gap: 6, position: "relative" }}>
          {showCatalog && <button type="button" onClick={() => setPickOpen(o => !o)} className="btn btn-secondary btn-sm"><Plus size={13} /> เลือกจากแคตตาล็อก <ChevronDown size={12} /></button>}
          {showCatalog && pickOpen && (
            <>
              <div onClick={() => setPickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 220 }} />
              <div ref={pickRef} style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 221, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,.16)", padding: 6, width: 300, maxHeight: 320, overflowY: "auto" }}>
                {catalog.length === 0 && (
                  // ต้นเหตุจริงคือสำนักงานใหญ่ยังไม่ได้ตั้งแม่แบบ — ดีลเลอร์แก้เองไม่ได้ ต้องบอกให้รู้ว่าไปบอกใคร
                  <div style={{ padding: "12px 14px", fontSize: "0.75rem", color: "#b45309", background: "#fef7ed", borderRadius: 8, lineHeight: 1.6 }}>
                    สำนักงานใหญ่ยังไม่ได้ตั้งแม่แบบ<br />
                    <span style={{ color: "#92400e" }}>ออกใบเสนอราคาไม่ได้จนกว่าจะมีแม่แบบพร้อมราคา — กรุณาแจ้งสำนักงานใหญ่</span>
                  </div>
                )}
                {catalog.map(p => (
                  <div key={p.id}>
                    <button type="button" onClick={() => addFromCatalog(p.name, p.unit, ราคาขาย(p))} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", padding: "8px 10px", border: "none", background: "none", cursor: "pointer", borderRadius: 8, fontSize: "0.8rem", fontWeight: 700, color: "#2D2D2D", textAlign: "left", fontFamily: "inherit" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f0f4fa")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <span>{p.name}</span>
                      {/* ราคา 0 = สำนักงานใหญ่ยังไม่ได้ตั้ง — บอกตรงนี้เลย ไม่ให้ดีลเลอร์เลือกไปแล้วงงว่าทำไมบันทึกไม่ได้ */}
                      <span style={{ fontSize: "0.68rem", color: p.price > 0 ? PRIMARY : "#b45309", fontWeight: 800, flexShrink: 0 }}>
                        {p.price > 0 ? `฿${fmt(ราคาขาย(p))}/${p.unit}` : "ยังไม่ได้ตั้งราคา"}
                      </span>
                    </button>
                    {p.subtypes?.map(st => (
                      <button key={st} type="button" onClick={() => addFromCatalog(`${p.name} · ${st}`, p.unit, ราคาขาย(p, st))} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", padding: "6px 10px 6px 22px", border: "none", background: "none", cursor: "pointer", borderRadius: 8, fontSize: "0.74rem", color: "#6b7280", textAlign: "left", fontFamily: "inherit" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f0f4fa")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                        <span>{st}</span><span style={{ fontSize: "0.64rem", color: "#9ca3af", flexShrink: 0 }}>฿{fmt(ราคาขาย(p, st))}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          <thead>
            <tr style={{ background: "#f7f9fc", color: "#6b7280", fontSize: "0.66rem", fontWeight: 700 }}>
              <th style={{ textAlign: "left", padding: "7px 8px" }}>รายการ</th>
              <th style={{ textAlign: "right", padding: "7px 6px", width: 70 }}>จำนวน</th>
              <th style={{ textAlign: "left", padding: "7px 6px", width: 62 }}>หน่วย</th>
              <th style={{ textAlign: "right", padding: "7px 6px", width: 96 }}>ราคา/หน่วย</th>
              <th style={{ textAlign: "right", padding: "7px 8px", width: 100 }}>รวม</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={6} style={{ padding: 18, textAlign: "center", color: "#9ca3af", fontSize: "0.76rem" }}>{!showCatalog
                ? "ยังไม่มีรายการ — ระบุแม่แบบและมูลค่าประเมินที่ลูกค้าเป้าหมายก่อน"
                : catalog.length === 0
                  ? "ยังไม่มีรายการ — สำนักงานใหญ่ยังไม่ได้ตั้งแม่แบบ จึงเพิ่มรายการไม่ได้"
                  : "ยังไม่มีรายการ — กด “เลือกจากแคตตาล็อก” เพื่อเพิ่ม"}</td></tr>}
            {items.map((it, i) => (
              <tr key={it.id ?? i} style={{ borderTop: `1px solid #f1f5f9` }}>
                <td style={{ padding: "5px 8px" }}><input style={inp} value={it.name} onChange={e => set(i, { name: e.target.value })} placeholder="ชื่อรายการ" /></td>
                <td style={{ padding: "5px 6px" }}><input type="number" aria-label="จำนวน" min={0} max={MAX_QTY} style={{ ...inp, textAlign: "right" }} value={it.qty || ""} onChange={e => set(i, { qty: clamp(Number(e.target.value), MAX_QTY) })} /></td>
                {/* หน่วย = ดรอปดาวน์ (บอสสั่ง 17 ก.ค. 69: "ทำให้เปลี่ยนหน่วยได้") — เดิมเป็นช่องพิมพ์เปล่า ๆ ไม่มีตัวเลือก
                    ใบเก่าที่หน่วยไม่อยู่ในลิสต์มาตรฐาน ให้แทรกค่าเดิมเป็นตัวเลือกแรก — ห้ามทำค่าที่บันทึกไว้หาย */}
                <td style={{ padding: "5px 6px" }}>
                  <select style={{ ...inp, cursor: "pointer", padding: "6px 4px" }} value={it.unit} onChange={e => set(i, { unit: e.target.value })} aria-label="หน่วย">
                    {!it.unit && <option value="">— ยังไม่ระบุ —</option>}
                    {it.unit && !UNIT_OPTIONS.includes(it.unit) && <option value={it.unit}>{it.unit}</option>}
                    {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                {/* ราคาต่อหน่วยเป็นช่อง text เพื่อโชว์ลูกน้ำระหว่างพิมพ์ (บอสสั่ง 26 ส.ค. 69) — type="number" ใส่ลูกน้ำไม่ได้ */}
                <td style={{ padding: "5px 6px" }}><input type="text" inputMode="decimal" aria-label="ราคาต่อหน่วย" style={{ ...inp, textAlign: "right" }} value={it.unitPrice ? formatMoneyInput(String(it.unitPrice)) : ""} onChange={e => set(i, { unitPrice: clamp(Number(e.target.value.replace(/,/g, "")), MAX_UNIT_PRICE) })} /></td>
                <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 800, color: PRIMARY, whiteSpace: "nowrap" }}>฿{fmt(it.qty * it.unitPrice)}</td>
                <td style={{ padding: "5px 4px", textAlign: "center" }}>{showCatalog && <button type="button" onClick={() => del(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", display: "flex", padding: 3 }}><Trash2 size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: `1px solid ${BORDER}`, background: "#f8fafc" }}>
                <td colSpan={4} style={{ padding: "8px 10px", textAlign: "right", fontSize: "0.72rem", fontWeight: 700, color: "#6b7280" }}>{items.length} รายการ · รวมก่อน VAT</td>
                <td style={{ padding: "8px 8px", textAlign: "right", fontWeight: 800, color: PRIMARY, fontSize: "0.86rem", whiteSpace: "nowrap" }}>฿{fmt(subtotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div style={{ fontSize: "0.64rem", color: "#9ca3af", marginTop: 5 }}>ราคา/หน่วยตั้งต้นจากราคาขายของสาขา (ราคากลางสำนักงานใหญ่ + ส่วนบวกเพิ่มที่ตั้งไว้ที่หน้าแม่แบบ) · ปรับได้ตามการเจรจา</div>
    </div>
  );
}
