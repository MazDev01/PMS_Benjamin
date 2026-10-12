"use client";

import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { useState, useMemo } from "react";
import {
  Package, FileText, Download, Search, Lock, X, History, CalendarClock, Building2, ChevronRight,
} from "lucide-react";
import { useEffect } from "react";
import { storage as fileStorage } from "@pms/shared/lib/data";
import { ขนาดไฟล์อ่านง่าย as ขนาดอ่านง่าย } from "@pms/shared/lib/format";
import { type SolutionProduct } from "@pms/shared/lib/mock";
import { catalogRate, markupPctOf, withMarkup } from "@pms/shared/lib/boq";
import { ชั่วโมงนาทีไทย } from "@pms/shared/lib/thaiDate";
import { useDealerSettings } from "@pms/shared/lib/useDealerSettings";
import { useMasterCatalog } from "@pms/shared/lib/useMasterCatalog";
import { TemplateHero } from "@pms/shared/components/ui/TemplateHero";
import { fmtFull as fmtMoney } from "@pms/shared/lib/format";

// ── Design tokens ─────────────────────────────────────────────
const PRIMARY = "#003366";
const STEEL   = "#2D2D2D";
const BORDER  = "#e5e7eb";
const MUTED   = "#6b7280";

type Product = SolutionProduct;

export default function DealerProductsPage() {
  const [query, setQuery] = useState("");
  const [viewP, setViewP] = useState<Product | null>(null);
  const [historyP, setHistoryP] = useState<Product | null>(null);
  const [subView, setSubView] = useState<{ parent: Product; sub: string } | null>(null); // ดูรายละเอียดแม่แบบย่อย
  // ค้นหา/มุมมองของรายการแม่แบบย่อยในกล่องรายละเอียด (ชุดเดียวกับฝั่งสำนักงานใหญ่ 28 ส.ค. 69)
  const [subQ, setSubQ] = useState("");

  // ── ส่วนบวกเพิ่มจากราคากลาง — ดีลเลอร์ตั้งเอง (บอสสั่ง 20 ส.ค. 69) ───────────────
  // เก็บที่ตั้งค่าของสาขา (dealer_settings.pricing) → ตามไปทุกเครื่อง/ทุกเบราว์เซอร์ของสาขานั้น
  // ร่าง = ค่าที่กำลังพิมพ์อยู่ (ยังไม่บันทึก) แยกจากค่าจริง เพื่อให้พิมพ์ "1" ก่อนเป็น "12" ได้
  //   โดยหน้าจอไม่กระตุกและไม่ยิงบันทึกทุกตัวอักษร — บันทึกตอนออกจากช่อง/กด Enter
  const { settings: dealerSet, loaded: setLoaded, save: saveDealer } = useDealerSettings();
  const pricing = dealerSet.pricing;
  const [ร่าง, setร่าง] = useState<Record<string, string>>({});
  const [กำลังบันทึก, setกำลังบันทึก] = useState(false);
  const [ทุกแม่แบบ, setทุกแม่แบบ] = useState("");
  const [บันทึกแล้วเมื่อ, setบันทึกแล้วเมื่อ] = useState<string>("");

  const เขียนเปอร์เซ็นต์ = async (byTemplate: Record<string, number>) => {
    setกำลังบันทึก(true);
    try {
      await saveDealer({ pricing: { ...pricing, byTemplate } });
      setบันทึกแล้วเมื่อ(ชั่วโมงนาทีไทย());
    } finally { setกำลังบันทึก(false); }
  };

  const บันทึกเปอร์เซ็นต์ = async (templateId: string) => {
    const ข้อความ = (ร่าง[templateId] ?? "").trim();
    const เดิม = markupPctOf(pricing, templateId);
    // ล้างช่องทิ้ง = ไม่บวกเพิ่ม (0) — ไม่ใช่ "ไม่เปลี่ยนแปลง"
    const ใหม่ = ข้อความ === "" ? 0 : Number(ข้อความ);
    if (!Number.isFinite(ใหม่) || ใหม่ === เดิม) { setร่าง(v => { const n = { ...v }; delete n[templateId]; return n; }); return; }
    const byTemplate = { ...(pricing.byTemplate ?? {}) };
    if (ใหม่ === 0) delete byTemplate[templateId]; else byTemplate[templateId] = ใหม่;
    await เขียนเปอร์เซ็นต์(byTemplate);
    setร่าง(v => { const n = { ...v }; delete n[templateId]; return n; });
  };

  /** ใช้ % ที่กรอกไว้ล่าสุดกับทุกแม่แบบ — สาขาที่บวกเท่ากันทั้งหมดจะได้ไม่ต้องพิมพ์ทีละใบ */
  const ใช้กับทุกแม่แบบ = async (pct: number) => {
    const byTemplate: Record<string, number> = {};
    if (pct !== 0) for (const p of PRODUCTS) byTemplate[p.id] = pct;
    await เขียนเปอร์เซ็นต์(byTemplate);
    setร่าง({});
  };
  // แคตตาล็อกเดียวทั้งเครือ — อ่านผ่าน repository (local: localStorage · supabase: DB)
  const PRODUCTS = useMasterCatalog();

  // XSS: หน้านี้ประกอบ HTML ด้วย document.write() ตรงๆ — ต้อง escape เอนทิตี HTML ก่อนแทรกเสมอ
  // (เดิมแทรก p.name/p.spec ดิบๆ — ชื่อ/รายละเอียดแม่แบบที่มี <script> จะรันจริงตอนเปิดหน้าพิมพ์)
  const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => (({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]));

  // ดาวน์โหลดเอกสารแม่แบบ (เปิดหน้าพิมพ์ · ไทยล้วน)
  function downloadSpec(p: Product) {
    const win = window.open("", "_blank", "width=820,height=640");
    if (!win) return;
    win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(p.name)}</title>
      <style>*{font-family:"Noto Sans Thai","Sarabun",system-ui,sans-serif;box-sizing:border-box}
        body{margin:36px;color:#2D2D2D}h1{color:#003366;font-size:20px;margin:0 0 2px}
        .sub{color:#6b7280;font-size:12px;margin-bottom:20px}
        .row{display:flex;border-bottom:1px solid #eef1f5;padding:9px 0;font-size:13px}
        .k{width:150px;color:#6b7280;font-weight:600}.v{font-weight:700}
        .price{color:#003366;font-size:18px;font-weight:800}</style></head>
      <body><h1>${esc(p.name)}</h1><div class="sub">แม่แบบอาคารสำเร็จรูป</div>
      <div class="row"><div class="k">รายละเอียด</div><div class="v">${esc(p.spec)}</div></div>
      <div class="row"><div class="k">ราคากลาง</div><div class="v price">${fmtMoney(p.price)} / ${esc(p.unit)}</div></div>
      <p style="margin-top:24px;font-size:11px;color:#9ca3af">ราคากลางกำหนดโดยสำนักงานใหญ่ · ใช้อ้างอิงในการนำเสนอ</p>
      <script>window.onload=function(){window.print()}<\/script></body></html>`);
    win.document.close();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter(p => !q || p.name.toLowerCase().includes(q) || p.spec.toLowerCase().includes(q));
  }, [query, PRODUCTS]);

  return (
    <div className="erp">
      {/* ── หัวข้อหน้า ── */}
      {/* หัวหน้า/ช่องค้นหา → ไปอยู่บนแถบบน (ชื่อหน้ามาจาก Topbar) */}
      <TopbarActions>
        <div style={{ position: "relative", width: 240, maxWidth: "100%" }}>
          <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: MUTED }} />
          <input
            className="form-input"
            style={{ paddingLeft: 36 }}
            placeholder="ค้นหาแม่แบบ / รายละเอียด…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
      </TopbarActions>
      {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

      {/* ── แถบส่วนบวกเพิ่มของสาขา ────────────────────────────────────────────
          บอกให้ชัดว่าตัวเลขไหนของสำนักงานใหญ่ ตัวไหนของสาขา แล้วให้ทางลัดสำหรับ
          สาขาที่บวกเท่ากันทุกแม่แบบ จะได้ไม่ต้องพิมพ์ทีละใบ */}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 800, color: STEEL }}>ราคาขายของสาขา = ราคากลาง + ส่วนบวกเพิ่มที่คุณตั้งเอง</div>
          <div style={{ fontSize: "0.7rem", color: MUTED, marginTop: 2 }}>
            สำนักงานใหญ่กำหนดราคากลาง · ส่วนบวกเพิ่มเป็นของสาขา ตั้งได้อิสระไม่มีเพดาน · ใบเสนอราคาใหม่จะตั้งต้นด้วยราคาขายนี้ (แก้รายแถวได้)
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <label htmlFor="pct-ทุกแม่แบบ" style={{ fontSize: "0.7rem", color: MUTED, fontWeight: 700 }}>ตั้งพร้อมกันทุกแม่แบบ</label>
          <input id="pct-ทุกแม่แบบ" type="number" inputMode="decimal" step="0.5" aria-label="บวกเพิ่มทุกแม่แบบ"
            value={ทุกแม่แบบ} onChange={e => setทุกแม่แบบ(e.target.value)} placeholder="0"
            style={{ width: 70, textAlign: "right", padding: "6px 8px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: "0.8rem", fontWeight: 700, color: STEEL, background: "#fff", outline: "none", fontFamily: "inherit" }} />
          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: MUTED }}>%</span>
          <button className="btn btn-secondary btn-sm" disabled={กำลังบันทึก || ทุกแม่แบบ.trim() === ""}
            onClick={() => { const n = Number(ทุกแม่แบบ); if (Number.isFinite(n)) void ใช้กับทุกแม่แบบ(n); }}
            style={{ color: STEEL, opacity: (กำลังบันทึก || ทุกแม่แบบ.trim() === "") ? .5 : 1 }}>ใช้กับทุกแม่แบบ</button>
          {กำลังบันทึก
            ? <span style={{ fontSize: "0.7rem", color: MUTED }}>กำลังบันทึก…</span>
            : บันทึกแล้วเมื่อ && <span style={{ fontSize: "0.7rem", color: "#059669", fontWeight: 700 }}>บันทึกแล้ว {บันทึกแล้วเมื่อ}</span>}
        </div>
      </div>

      {/* ── Banner: read-only ── */}
      {/* ── แคตตาล็อกแม่แบบ (grid) ── */}
      {filtered.length === 0 ? (
        <div className="card" style={{ padding: "48px 24px", textAlign: "center", color: MUTED }}>
          <Package size={32} style={{ color: "#C0C0C0", marginBottom: 10 }} />
          <div style={{ fontSize: "0.92rem" }}>ไม่พบแม่แบบที่ตรงกับเงื่อนไข</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18 }}>
          {filtered.map(p => (
            <div
              key={p.id}
              className="card tpl-card"
              role="button"
              tabIndex={0}
              onClick={() => { setSubQ(""); setViewP(p); }}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSubQ(""); setViewP(p); } }}
              style={{ display: "flex", flexDirection: "column", overflow: "hidden", cursor: "pointer" }}
            >
              {/* ── Hero: ไทล์โลโก้ + ป้ายจำนวนแม่แบบย่อย ── */}
              <div
                style={{
                  position: "relative", aspectRatio: "16 / 9",
                  background: "#f0f4f9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderBottom: `1px solid ${BORDER}`, overflow: "hidden",
                }}
              >
                {p.image ? (
                  /* รูปแม่แบบที่ HQ อัปโหลด — เต็มพื้นที่ Hero */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.image} alt={p.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  /* ไม่มีรูปจริง → ภาพประกอบ SVG ตามประเภทอาคาร */
                  <TemplateHero name={p.name} />
                )}
                {p.subtypes && p.subtypes.length > 0 && (
                  <span style={{ position: "absolute", top: 12, right: 12, fontSize: "0.65rem", fontWeight: 700, color: PRIMARY, background: "rgba(255,255,255,.85)", border: `1px solid #dce5f0`, borderRadius: 999, padding: "3px 10px", backdropFilter: "blur(2px)" }}>
                    {p.subtypes.length} แม่แบบย่อย
                  </span>
                )}
              </div>

              {/* เนื้อหา */}
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: STEEL, lineHeight: 1.3 }}>
                  {p.name}
                </div>

                {/* รายละเอียด (2 บรรทัด) */}
                <div className="tpl-clamp2" style={{ fontSize: "0.8rem", color: MUTED, lineHeight: 1.5, minHeight: "2.34em" }}>
                  {p.spec}
                </div>

                {/* แม่แบบย่อย */}
                {p.subtypes && p.subtypes.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {p.subtypes.map(s => (
                      <span key={s} style={{ fontSize: "0.65rem", fontWeight: 600, color: PRIMARY, background: "#eef3f8", border: `1px solid #dce5f0`, borderRadius: 7, padding: "3px 9px" }}>{s}</span>
                    ))}
                  </div>
                )}

                {/* เส้นคั่น */}
                <div style={{ borderTop: `1px solid ${BORDER}`, marginTop: "auto", paddingTop: 12 }}>
                  {/* ราคากลางจากสำนักงานใหญ่ (อ่านอย่างเดียว) */}
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                        <Lock size={9} style={{ color: MUTED, flexShrink: 0 }} />
                        <span style={{ fontSize: "0.65rem", color: MUTED, fontWeight: 700 }}>ราคากลางจากสำนักงานใหญ่</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                        <span style={{ fontSize: "0.98rem", fontWeight: 700, color: STEEL }}>{fmtMoney(p.price)}</span>
                        <span style={{ fontSize: "0.7rem", color: MUTED }}>/ {p.unit}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, color: MUTED, fontSize: "0.65rem", whiteSpace: "nowrap" }}>
                      <CalendarClock size={11} /> {p.effectiveDate}
                    </div>
                  </div>

                  {/* ── ส่วนบวกเพิ่มของสาขา — ดีลเลอร์ตั้งเอง (บอสสั่ง 20 ส.ค. 69) ──
                      ราคากลาง = ต้นทุนที่สำนักงานใหญ่ตั้ง · ราคาขายเป็นสิทธิ์ของดีลเลอร์
                      ไม่มีเพดาน ไม่มีขั้นต่ำ — ห้ามใส่ตัวตรวจเทียบราคากลาง */}
                  <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, padding: "9px 10px", background: "#f7f9fc", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <label htmlFor={`pct-${p.id}`} style={{ fontSize: "0.65rem", color: MUTED, fontWeight: 700 }}>บวกเพิ่มจากราคากลาง</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input id={`pct-${p.id}`} type="number" inputMode="decimal" step="0.5" aria-label={`บวกเพิ่มจากราคากลาง ${p.name}`}
                          value={ร่าง[p.id] ?? String(markupPctOf(pricing, p.id) || "")}
                          placeholder="0"
                          onChange={e => setร่าง(v => ({ ...v, [p.id]: e.target.value }))}
                          onBlur={() => บันทึกเปอร์เซ็นต์(p.id)}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          style={{ width: 68, textAlign: "right", padding: "5px 8px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: "0.8rem", fontWeight: 700, color: STEEL, background: "#fff", outline: "none", fontFamily: "inherit" }} />
                        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: MUTED }}>%</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 7 }}>
                      <span style={{ fontSize: "0.65rem", color: MUTED, fontWeight: 700 }}>ราคาขายของเรา</span>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                        <span style={{ fontSize: "1.25rem", fontWeight: 800, color: PRIMARY, letterSpacing: "-0.01em" }}>
                          {fmtMoney(withMarkup(p.price, Number(ร่าง[p.id] ?? markupPctOf(pricing, p.id)) || 0))}
                        </span>
                        <span style={{ fontSize: "0.72rem", color: MUTED }}>/ {p.unit}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ปุ่ม */}
                <div style={{ display: "flex", gap: 7, marginTop: 4 }}>
                  <button onClick={e => { e.stopPropagation(); setSubQ(""); setViewP(p); }} className="btn btn-secondary btn-sm" style={{ flex: 1, color: STEEL }}>
                    <FileText size={13} /> รายละเอียด
                  </button>
                  <button onClick={e => { e.stopPropagation(); setHistoryP(p); }} className="btn btn-secondary btn-sm" title="ประวัติราคา" style={{ width: 40, padding: 0, color: STEEL }}>
                    <History size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── รายละเอียดแม่แบบ modal ── */}
      {viewP && (
        <div onClick={() => setViewP(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <ModalCard onClose={() => setViewP(null)} label="รายละเอียดแม่แบบ" className="modal-pop-flex"
            style={{ position: "static", width: "100%", maxWidth: 1100, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>

            {/* ── หัวกล่อง: ชื่อแม่แบบ + ค้นหาแม่แบบย่อย + ปิด (ชุดเดียวกับฝั่งสำนักงานใหญ่) ── */}
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: STEEL, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewP.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {(viewP.subtypes?.length ?? 0) > 0 && (
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Search size={14} color="#9ca3af" style={{ position: "absolute", left: 11, pointerEvents: "none" }} />
                    <input value={subQ} onChange={e => setSubQ(e.target.value)} aria-label="ค้นหาแม่แบบย่อย" placeholder="ค้นหาแม่แบบย่อย..."
                      style={{ width: 240, maxWidth: "40vw", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px 9px 32px", fontSize: "0.84rem", color: STEEL, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                )}
                <button onClick={() => setViewP(null)} aria-label="ปิด"
                  style={{ width: 34, height: 34, borderRadius: 10, background: "#f4f6f9", color: STEEL, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
              </div>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* ── รูปใหญ่ + การ์ดลอยทับมุมล่างซ้าย ─────────────────────────────────── */}
              {/* ⚠️ flexShrink: 0 ห้ามเอาออก — กรอบนี้เป็นลูกของกล่องแนวตั้งที่เลื่อนได้
                   ความสูงมาจาก aspect-ratio ซึ่ง flexbox ถือว่า "ย่อได้" พอมีแม่แบบย่อยเยอะ
                   รูปจะถูกบีบจนเหลือ 2px แล้วการ์ดข้อมูลล้นออกไปโดนตัดหัว (บอสเจอเอง 28 ส.ค. 69)
                   วัดจริงตอนพัง: สูง 2px ทั้งที่ควรเป็น 446px */}
              <div style={{ position: "relative", aspectRatio: "21 / 9", flexShrink: 0, borderRadius: 14, overflow: "hidden", background: "#f0f4f9", border: `1px solid ${BORDER}` }}>
                {viewP.image
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={viewP.image} alt={viewP.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ position: "absolute", inset: 0 }}><TemplateHero name={viewP.name} /></div>}
                {/* ⚠️ รูปแถบนี้ใช้ cover ต่างจากที่อื่น — เป็นภาพพื้นหลังที่มีการ์ดวางทับ
                     ถ้าใช้ contain จะมีขอบว่างแล้วการ์ดลอยอยู่บนพื้นเปล่า ไม่ใช่บนรูปตามแบบ */}
                <div style={{ position: "absolute", left: 20, bottom: 20, maxWidth: "min(420px, 70%)", background: "rgba(255,255,255,.93)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.7)", borderRadius: 14, padding: "16px 18px", boxShadow: "0 10px 30px rgba(0,51,102,.18)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, background: "#dce5f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Building2 size={16} style={{ color: PRIMARY }} /></span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 800, color: STEEL, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewP.name}</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#4b5563" }}>{viewP.spec || "—"}</div>
                  {/* ⚠️ ดีลเลอร์ต้องเห็น "ราคาขายของเรา" เป็นตัวเด่น — ราคากลางของสำนักงานใหญ่เป็นต้นทุน
                       ไม่ใช่ตัวเลขที่เอาไปคุยกับลูกค้า (กติกาเดิมของหน้านี้ ห้ามสลับที่กัน) */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(withMarkup(viewP.price, markupPctOf(pricing, viewP.id)))}</span>
                    <span style={{ fontSize: "0.72rem", color: MUTED }}>/{viewP.unit}</span>
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: "0.68rem", color: "#9ca3af", whiteSpace: "nowrap" }}><CalendarClock size={11} /> {viewP.effectiveDate}</span>
                  </div>
                </div>
              </div>


              {/* ── แบบแปลนของแม่แบบนี้ — ดีลเลอร์เปิดดู/ดาวน์โหลดได้ (บอสสั่ง 28 ส.ค. 69) ──── */}
              {(viewP.plans?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: "1.02rem", fontWeight: 800, color: STEEL, marginBottom: 10 }}>แบบแปลน</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {(viewP.plans ?? []).map(f => (
                      <a key={f.path} href={fileStorage.catalogUrl(f.path)} target="_blank" rel="noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "11px 13px", textDecoration: "none", background: "#fff" }}>
                        <span style={{ width: 34, height: 34, borderRadius: 10, background: "#dce5f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={16} style={{ color: PRIMARY }} /></span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          <span style={{ display: "block", fontSize: "0.7rem", color: "#9ca3af" }}>{ขนาดอ่านง่าย(f.size)}</span>
                        </span>
                        <Download size={15} color="#9ca3af" style={{ flexShrink: 0 }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {/* ── รายการแม่แบบย่อย + สลับมุมมอง ────────────────────────────────────── */}
              {(viewP.subtypes?.length ?? 0) > 0 && (() => {
                const ทั้งหมด = viewP.subtypes ?? [];
                const รายการ = subQ.trim() ? ทั้งหมด.filter(s => s.toLowerCase().includes(subQ.trim().toLowerCase())) : ทั้งหมด;
                const รูปของ = (s: string) => viewP.subtypeImages?.[s] ?? viewP.image;
                const ราคาขายของ = (s: string) => fmtMoney(withMarkup(catalogRate(viewP, s), markupPctOf(pricing, viewP.id)));
                return (
                  <div>
                    <div style={{ fontSize: "1.02rem", fontWeight: 800, color: STEEL, marginBottom: 12 }}>แม่แบบย่อยทั้งหมด</div>

                    {รายการ.length === 0 && (
                      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: "0.8rem", border: `1px dashed ${BORDER}`, borderRadius: 12 }}>ไม่พบแม่แบบย่อยที่ค้นหา</div>
                    )}

                    {รายการ.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                        {รายการ.map(s => (
                          <button key={s} onClick={() => setSubView({ parent: viewP, sub: s })} title={`ดูรายละเอียด ${s}`}
                            style={{ border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", background: "#fff", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit", display: "flex", flexDirection: "column", transition: "box-shadow .15s, border-color .15s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 22px rgba(0,51,102,.14)"; (e.currentTarget as HTMLElement).style.borderColor = "#cdd8e6"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.borderColor = BORDER; }}>
                            <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#f0f4f9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                              {รูปของ(s)
                                /* eslint-disable-next-line @next/next/no-img-element */
                                ? <img src={รูปของ(s)} alt={s} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                                : <TemplateHero name={`${viewP.name} ${s}`} />}
                            </div>
                            <div style={{ padding: "11px 13px", display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                              <span style={{ width: 32, height: 32, borderRadius: 10, background: "#dce5f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Building2 size={15} style={{ color: PRIMARY }} /></span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
                                {/* แบบที่บอสส่งมาเป็น "จังหวัด" แต่แม่แบบย่อยไม่มีข้อมูลจังหวัด — ใช้ราคาขายของสาขาแทน */}
                                <span style={{ display: "block", fontSize: "0.74rem", marginTop: 1, fontWeight: 700, color: PRIMARY }}>
                                  {ราคาขายของ(s)}<span style={{ fontWeight: 500, color: "#9ca3af" }}>/{viewP.unit}</span>
                                </span>
                              </span>
                            </div>
                            <div style={{ marginTop: "auto", borderTop: `1px solid ${BORDER}`, padding: "9px 13px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.76rem", fontWeight: 700, color: PRIMARY }}>
                              ดูรายละเอียด <ChevronRight size={14} />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                  </div>
                );
              })()}
            </div>

            {/* ── ท้ายกล่อง ─────────────────────────────────────────────────────────── */}
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, background: "#fafbfc", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.8rem", color: MUTED, fontWeight: 600 }}>ทั้งหมด {viewP.subtypes?.length ?? 0} แม่แบบย่อย</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { const p = viewP; setViewP(null); setHistoryP(p); }} className="btn btn-secondary btn-md" style={{ color: STEEL }}>
                  <History size={14} /> ดูประวัติราคา
                </button>
                <button onClick={() => downloadSpec(viewP)} className="btn btn-secondary btn-md" style={{ color: STEEL }}>
                  <Download size={14} /> ดาวน์โหลด
                </button>
              </div>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── รายละเอียดแม่แบบย่อย modal ── */}
      {subView && (
        <div onClick={() => setSubView(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <ModalCard onClose={() => setSubView(null)} label="รายละเอียดแม่แบบย่อย"
            style={{ width: "100%", maxWidth: 760, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: STEEL, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subView.sub}</div>
              <button onClick={() => setSubView(null)} aria-label="ปิด"
                style={{ width: 34, height: 34, borderRadius: 10, background: "#f4f6f9", color: STEEL, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
            </div>

            {(() => {
              const แม่ = subView.parent, ย่อย = subView.sub;
              const pct = markupPctOf(pricing, แม่.id);
              const ราคากลางย่อย = catalogRate(แม่, ย่อย);
              const ราคาขายย่อย = withMarkup(ราคากลางย่อย, pct);
              const ตั้งเฉพาะ = แม่.subtypePrices?.[ย่อย] != null;
              const รูป = แม่.subtypeImages?.[ย่อย] ?? แม่.image;
              const ใช้รูปแม่ = !แม่.subtypeImages?.[ย่อย] && !!แม่.image;
              const พี่น้อง = (แม่.subtypes ?? []).filter(x => x !== ย่อย);
              return (
                <>
                  <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* ⚠️ flexShrink: 0 — กันกรอบรูปถูก flexbox บีบจนแบน (บั๊กจริง 28 ส.ค. 69) */}
                    <div style={{ position: "relative", aspectRatio: "21 / 9", flexShrink: 0, borderRadius: 14, overflow: "hidden", background: "#f0f4f9", border: `1px solid ${BORDER}` }}>
                      {รูป
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={รูป} alt={ย่อย} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                        : <div style={{ position: "absolute", inset: 0 }}><TemplateHero name={`${แม่.name} ${ย่อย}`} /></div>}
                      {ใช้รูปแม่ && (
                        <span style={{ position: "absolute", left: 12, bottom: 12, fontSize: "0.66rem", fontWeight: 700, color: MUTED, background: "rgba(255,255,255,.9)", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "3px 10px" }}>ใช้รูปของแม่แบบหลัก</span>
                      )}
                    </div>

                    {/* ── ราคาขายของเรา (ตัวเด่น) · ราคากลางจากสำนักงานใหญ่ (ต้นทุน) ────── */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      <div style={{ padding: "14px 16px", borderRadius: 12, background: "#dce5f0" }}>
                        <div style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 3 }}>ราคาขายของเรา</div>
                        <span style={{ fontSize: "1.35rem", fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(ราคาขายย่อย)}</span>
                        <span style={{ fontSize: "0.74rem", color: MUTED }}> /{แม่.unit}</span>
                        {pct !== 0 && <div style={{ fontSize: "0.7rem", color: MUTED, marginTop: 3 }}>บวกจากราคากลาง {pct}%</div>}
                      </div>
                      <div style={{ padding: "14px 16px", borderRadius: 12, background: "#f6f8fa", border: `1px solid ${BORDER}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 3 }}>
                          ราคากลาง (สำนักงานใหญ่กำหนด)
                          <span style={{ fontSize: "0.6rem", fontWeight: 700, color: ตั้งเฉพาะ ? PRIMARY : "#9ca3af", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "1px 8px" }}>
                            {ตั้งเฉพาะ ? "ตั้งเฉพาะ" : "ตามแม่แบบหลัก"}
                          </span>
                        </div>
                        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: STEEL, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(ราคากลางย่อย)}</span>
                        <span style={{ fontSize: "0.74rem", color: MUTED }}> /{แม่.unit}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                          <CalendarClock size={11} style={{ color: MUTED }} />
                          <span style={{ fontSize: "0.7rem", color: MUTED }}>มีผล {แม่.effectiveDate}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 5 }}>รายละเอียด (ของแม่แบบหลัก)</div>
                      <div style={{ fontSize: "0.86rem", fontWeight: 600, lineHeight: 1.65, color: STEEL }}>{แม่.spec || "—"}</div>
                    </div>

                    {/* ── ประวัติราคาของแม่แบบย่อยนี้ ─────────────────────────────────────
                         ⚠️ รอบที่บันทึกก่อน 28 ส.ค. 69 ไม่ได้เก็บราคาย่อยไว้ — บอกตามตรงว่าไม่มีข้อมูล
                         ห้ามเอาราคาแม่แบบหลักมาแสดงแทนเหมือนเป็นราคาย่อย */}
                    <div>
                      <div style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 6 }}>ประวัติราคากลางของแม่แบบย่อยนี้</div>
                      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#dce5f0" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: PRIMARY }}>ปัจจุบัน · {แม่.effectiveDate}</span>
                          <span style={{ fontSize: "0.84rem", fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(ราคากลางย่อย)}</span>
                        </div>
                        {แม่.priceHistory.map((h, i2) => {
                          const เคยบันทึกย่อย = h.subtypePrices != null;
                          const ราคาตอนนั้น = h.subtypePrices?.[ย่อย];
                          return (
                            <div key={i2} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 14px", borderTop: `1px solid ${BORDER}` }}>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: "0.74rem", color: STEEL, fontWeight: 600 }}>{h.effectiveDate}</span>
                                {h.note && <span style={{ display: "block", fontSize: "0.66rem", color: MUTED }}>{h.note}</span>}
                              </span>
                              <span style={{ flexShrink: 0, textAlign: "right" }}>
                                {!เคยบันทึกย่อย
                                  ? <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>ไม่ได้บันทึกราคาแม่แบบย่อยไว้</span>
                                  : ราคาตอนนั้น != null
                                    ? <span style={{ fontSize: "0.8rem", fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(ราคาตอนนั้น)}</span>
                                    : <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>ตามแม่แบบหลัก {fmtMoney(h.price)}</span>}
                              </span>
                            </div>
                          );
                        })}
                        {แม่.priceHistory.length === 0 && (
                          <div style={{ fontSize: "0.74rem", color: "#9ca3af", textAlign: "center", padding: "14px 0", borderTop: `1px solid ${BORDER}` }}>ยังไม่มีประวัติการปรับราคา</div>
                        )}
                      </div>
                    </div>


                    {/* ── แบบแปลน — ของแม่แบบย่อยเองก่อน ไม่มีค่อยใช้ของแม่แบบหลัก ────────
                         ⚠️ ต้องบอกให้รู้ว่าอันไหนเป็นของแม่แบบหลัก ไม่งั้นเข้าใจว่าเป็นแบบแปลนเฉพาะตัวนี้ */}
                    {(() => {
                      const ของย่อย = แม่.subtypePlans?.[ย่อย] ?? [];
                      const ใช้ของแม่ = ของย่อย.length === 0;
                      const รายการแปลน = ใช้ของแม่ ? (แม่.plans ?? []) : ของย่อย;
                      if (รายการแปลน.length === 0) return null;
                      return (
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 6 }}>
                            แบบแปลน
                            {ใช้ของแม่ && <span style={{ fontSize: "0.6rem", fontWeight: 700, color: "#9ca3af", background: "#f4f6f9", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "1px 8px" }}>ของแม่แบบหลัก</span>}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {รายการแปลน.map(f => (
                              <a key={f.path} href={fileStorage.catalogUrl(f.path)} target="_blank" rel="noreferrer"
                                style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px", textDecoration: "none", background: "#fff" }}>
                                <FileText size={15} style={{ color: PRIMARY, flexShrink: 0 }} />
                                <span style={{ flex: 1, minWidth: 0, fontSize: "0.82rem", fontWeight: 600, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                                <span style={{ fontSize: "0.7rem", color: "#9ca3af", flexShrink: 0 }}>{ขนาดอ่านง่าย(f.size)}</span>
                                <Download size={14} color="#9ca3af" style={{ flexShrink: 0 }} />
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {พี่น้อง.length > 0 && (
                      <div>
                        <div style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 6 }}>แม่แบบย่อยอื่นของ {แม่.name}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {พี่น้อง.map(x => (
                            <button key={x} onClick={() => setSubView({ parent: แม่, sub: x })}
                              style={{ fontSize: "0.74rem", fontWeight: 600, color: PRIMARY, background: "#eef3f8", border: `1px solid #dce5f0`, borderRadius: 999, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}>{x}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, background: "#fafbfc", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
                    <span style={{ fontSize: "0.8rem", color: MUTED, fontWeight: 600 }}>แม่แบบย่อยของ {แม่.name}</span>
                    <button className="btn btn-secondary btn-md" style={{ color: STEEL }} onClick={() => { setSubView(null); setHistoryP(แม่); }}><History size={13} /> ประวัติราคาแม่แบบหลัก</button>
                  </div>
                </>
              );
            })()}
          </ModalCard>
        </div>
      )}

      {/* ── ประวัติราคา modal (read-only) ── */}
      {historyP && (
        <div onClick={() => setHistoryP(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <ModalCard onClose={() => setHistoryP(null)} label="ประวัติราคา" style={{ width: "100%", maxWidth: 480, maxHeight: "84vh", overflowY: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,.22)" }}>
            <div style={{ background: PRIMARY, color: "#fff", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "1rem", fontWeight: 800 }}>ประวัติราคา — {historyP.name}</div>
              </div>
              <button onClick={() => setHistoryP(null)} style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.15)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={15} /></button>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f5f7fa", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "8px 12px", color: MUTED, fontSize: "0.72rem" }}>
                <Lock size={13} style={{ color: PRIMARY, flexShrink: 0 }} />
                <span>ราคากลางและประวัติราคากำหนดโดยสำนักงานใหญ่ — ดีลเลอร์ดูได้อย่างเดียว</span>
              </div>

              {/* ราคาปัจจุบัน */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: "12px 14px", borderRadius: 10, background: "#dce5f0" }}>
                <div>
                  <div style={{ fontSize: "0.65rem", color: MUTED, fontWeight: 700 }}>ราคากลางปัจจุบัน</div>
                  <span style={{ fontSize: "1.15rem", fontWeight: 800, color: PRIMARY }}>{fmtMoney(historyP.price)}</span>
                  <span style={{ fontSize: "0.72rem", color: MUTED }}> / {historyP.unit}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, color: MUTED, fontSize: "0.72rem" }}>
                  <CalendarClock size={12} /> มีผล {historyP.effectiveDate}
                </div>
              </div>

              {/* ราคาก่อนหน้า */}
              <div>
                <div style={{ fontSize: "0.65rem", color: MUTED, marginBottom: 8, fontWeight: 700 }}>ราคาก่อนหน้า</div>
                {historyP.priceHistory.length === 0 ? (
                  <div style={{ fontSize: "0.8rem", color: MUTED }}>ยังไม่มีประวัติราคา</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {historyP.priceHistory.map((h, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                        <div>
                          <div style={{ fontSize: "0.92rem", fontWeight: 700, color: STEEL }}>{fmtMoney(h.price)}</div>
                          {h.note && <div style={{ fontSize: "0.72rem", color: MUTED, marginTop: 2 }}>{h.note}</div>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, color: MUTED, fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                          <CalendarClock size={12} /> {h.effectiveDate}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ModalCard>
        </div>
      )}
    </div>
  );
}
