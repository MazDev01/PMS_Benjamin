"use client";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";

// ─── HQ · แคตตาล็อกแม่แบบ / ราคากลาง (แหล่งเดียวทั้งเครือ) ─────────────────
// HQ แก้ไขที่นี่ → persist ลง MASTER_CATALOG_KEY → Dealer (/products + dropdown ฟอร์ม)
// อ่านจากคีย์เดียวกันทันที · ขอบเขต Sales เท่านั้น (ไม่มี lead time/การส่งมอบ)
import { useState, useRef, useEffect } from "react";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { useRepoState } from "@pms/shared/lib/useRepoState";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { scaleSubtypePrices } from "@pms/shared/lib/repricing";
import { catalog as catalogRepo, storage as fileStorage } from "@pms/shared/lib/data";
import { AdminGate } from "@pms/shared/components/layout/AdminGate";
// เริ่มด้วยรายการว่าง — เดิมตั้งต้นด้วยชุดตัวอย่าง ทำให้เห็นแม่แบบปลอมกะพริบก่อนของจริงมา
import { type SolutionProduct, type CatalogPlan } from "@pms/shared/lib/mock";
import { useAuditLogger } from "@pms/shared/lib/useAudit";
import { fmtFull as fmtBaht, formatMoneyInput, ขนาดไฟล์อ่านง่าย as ขนาดอ่านง่าย } from "@pms/shared/lib/format";
import { catalogRate } from "@pms/shared/lib/boq";
import { fileToResizedDataURL } from "@pms/shared/lib/imageResize";
import { CountUp } from "@pms/shared/components/ui/CountUp";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { Search, Plus, Pencil, History, X, Check, Trash2, Building2, CalendarClock, ImagePlus, Layers, Tag, ChevronRight, FileText, Upload, Download, Paperclip } from "lucide-react";
import { แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import { UPLOAD_MAX_BYTES } from "@pms/shared/lib/uploadLimits";

const PRIMARY = "#003366";
const STEEL   = "#2D2D2D";
const MUTED   = "#6b7280";
const BORDER  = "#e5e7eb";

const TH_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
// วันของระบบ (APP_NOW) ไม่ใช่นาฬิกาเครื่อง — effectiveDate ของราคากลางต้องอยู่ในยุคเดียวกับข้อมูล
function todayTH() { const d = APP_NOW; return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`; }

type EditForm = { name: string; spec: string; price: string; unit: string; subtypes: string[]; image: string; subtypeImages: Record<string, string>; subtypePrices: Record<string, number>; plans: CatalogPlan[]; subtypePlans: Record<string, CatalogPlan[]> };

// ── หน่วยที่เลือกได้ (บอสสั่ง 28 ส.ค. 69: "ทำให้ปรับหน่วยได้") ────────────────────
//
// ⚠️ เดิมเป็นช่องพิมพ์อิสระ ซึ่งอันตรายกว่าที่เห็น: ตัวคิดราคาอัตโนมัติเทียบ "ตร.ม." แบบตรงตัว
//    (lib/boq.ts — พื้นที่ × ราคากลาง ทำได้เฉพาะแม่แบบที่ขายเป็น ตร.ม.)
//    พิมพ์ตกจุดเป็น "ตร.ม" หรือพิมพ์ "ตารางเมตร" = ระบบเลิกคิดราคาให้เงียบ ๆ
//    ไม่มีอะไรฟ้องเลย ดีลเลอร์แค่เห็นช่องประเมินราคาว่างแล้วไม่รู้ว่าทำไม
//    เลือกจากรายการจึงพิมพ์ผิดไม่ได้ และยังเปลี่ยนหน่วยได้อิสระเหมือนเดิม
const หน่วยที่ใช้ได้ = ["ตร.ม.", "ตร.ฟุต", "เมตร", "ตัน", "หลัง", "ชุด", "งาน", "รายการ"] as const;

/** ช่องเลือกหน่วย — ค่าเดิมที่ไม่อยู่ในรายการต้องไม่หาย (ข้อมูลเก่าอาจใช้หน่วยอื่น) */
function UnitSelect({ value, style, onChange }: { value: string; style: React.CSSProperties; onChange: (v: string) => void }) {
  const มีอยู่แล้ว = (หน่วยที่ใช้ได้ as readonly string[]).includes(value);
  return (
    // ต้องมีค่าเสมอ — แม่แบบทุกตัวขายเป็นหน่วยใดหน่วยหนึ่ง ไม่มีสถานะ "ยังไม่ระบุหน่วย"
    // (ตอนบันทึกยังมีค่าสำรองเป็น "ตร.ม." อยู่แล้วถ้าค่าว่างหลุดมาได้)
    <select aria-label="หน่วย" style={style} value={value} onChange={e => onChange(e.target.value)}>
      {!มีอยู่แล้ว && value !== "" && <option value={value}>{value}</option>}
      {หน่วยที่ใช้ได้.map(u => <option key={u} value={u}>{u}</option>)}
    </select>
  );
}

const subInp: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px 14px", fontSize: "0.92rem", color: STEEL, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

// ── แบบแปลน — อัปโหลดไฟล์จากเครื่อง (บอสสั่ง 28 ส.ค. 69) ────────────────────────
//
// ⚠️ ไฟล์จริงไปอยู่ใน Storage ไม่ใช่ในคอลัมน์ (ดู migration 0166)
//    ที่เก็บในข้อมูลคือรายการอ้างอิง {ชื่อที่คนอ่านรู้เรื่อง, พาธ, ขนาด}
//    ถ้าเก็บไฟล์ลงคอลัมน์แบบเดียวกับรูปแม่แบบ ทุกหน้าที่อ่านแคตตาล็อก (ดีลเลอร์/ฟอร์มลูกค้าเป้าหมาย/
//    ใบเสนอราคา) จะลากไฟล์หลาย MB มาด้วยทุกครั้ง ทั้งที่แทบไม่มีใครเปิดดู
//
// ⚠️ อัปโหลดสำเร็จแล้วผู้ใช้ยังไม่กด "บันทึก" = ไฟล์ค้างในที่เก็บโดยไม่มีใครอ้างถึง
//    ยอมให้ค้างดีกว่าลบผิดตัว — ถ้าลบตอนกดยกเลิก แล้วผู้ใช้กดยกเลิกหลังบันทึกไปแล้วรอบหนึ่ง
//    ไฟล์ที่ใช้งานอยู่จริงจะหายไปด้วย (คนละกรณีกับกดถังขยะ ซึ่งลบทันทีถูกแล้ว)
const PLAN_MAX = UPLOAD_MAX_BYTES;   // เท่ากับเพดานไฟล์แนบของดีลเลอร์ — ผู้ใช้จะได้ไม่ต้องจำสองตัวเลข

function PlansEditor({ value, onChange }: { value: CatalogPlan[]; onChange: (next: CatalogPlan[]) => void }) {
  const [กำลังอัป, setกำลังอัป] = useState(false);
  const [ผิดพลาด, setผิดพลาด] = useState("");

  // ⚠️ ต้องรับเป็น File[] ไม่ใช่ FileList — FileList เป็น "รายการสด" ที่ผูกกับช่องเลือกไฟล์
  //    ผู้เรียกล้างช่อง (value = "") เพื่อให้เลือกไฟล์เดิมซ้ำได้ ซึ่งทำให้รายการสดว่างทันที
  //    ถ้าถือ FileList ไว้จะกลายเป็น 0 ไฟล์แบบเงียบ ๆ (เจอจริงตอนทดสอบ: กดเลือกแล้วไม่มีอะไรเกิดขึ้น
  //    ไม่มี error ไม่มีคำขอออกไปเลย) — คัดลอกเป็นอาร์เรย์ก่อนล้างช่องเสมอ
  async function เพิ่มไฟล์(files: File[]) {
    setผิดพลาด("");
    setกำลังอัป(true);
    try {
      const เพิ่ม: CatalogPlan[] = [];
      for (const f of files) {
        if (f.size > PLAN_MAX) { setผิดพลาด(`"${f.name}" ใหญ่เกิน ${ขนาดอ่านง่าย(PLAN_MAX)}`); continue; }
        const path = await fileStorage.uploadCatalog(f);
        if (!path) { setผิดพลาด(`อัปโหลด "${f.name}" ไม่สำเร็จ`); continue; }
        เพิ่ม.push({ name: f.name, path, size: f.size });
      }
      if (เพิ่ม.length) onChange([...value, ...เพิ่ม]);
    } catch (e) {
      setผิดพลาด(friendlyError(e));
    } finally { setกำลังอัป(false); }
  }

  async function ลบไฟล์(i: number) {
    const ตัวที่ลบ = value[i];
    onChange(value.filter((_, x) => x !== i));
    // ลบไบต์จริงตามหลัง — ล้มเหลวก็แค่เหลือไฟล์ที่ไม่มีใครอ้างถึง ไม่ใช่ข้อมูลเสียหาย
    try { await fileStorage.removeCatalog(ตัวที่ลบ.path); } catch { /* ไฟล์กำพร้า ไม่กระทบผู้ใช้ */ }
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {value.map((f, i) => (
            <div key={f.path} style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${BORDER}`, borderRadius: 9, padding: "7px 10px", background: "#fafafa" }}>
              <FileText size={15} style={{ color: PRIMARY, flexShrink: 0 }} />
              <a href={fileStorage.catalogUrl(f.path)} target="_blank" rel="noreferrer"
                style={{ flex: 1, minWidth: 0, fontSize: "0.82rem", fontWeight: 600, color: STEEL, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={`เปิดดู ${f.name}`}>{f.name}</a>
              <span style={{ fontSize: "0.7rem", color: "#9ca3af", flexShrink: 0 }}>{ขนาดอ่านง่าย(f.size)}</span>
              <button type="button" onClick={() => ลบไฟล์(i)} title="ลบแบบแปลนนี้"
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4, flexShrink: 0 }}><Trash2 size={13} color="#dc2626" /></button>
            </div>
          ))}
        </div>
      )}
      <label className="btn btn-secondary btn-md" style={{ cursor: กำลังอัป ? "wait" : "pointer", opacity: กำลังอัป ? 0.6 : 1 }}>
        <Upload size={14} /> {กำลังอัป ? "กำลังอัปโหลด…" : "เพิ่มแบบแปลนจากเครื่อง"}
        <input type="file" multiple accept=".pdf,.dwg,.dxf,image/*" disabled={กำลังอัป} style={{ display: "none" }}
          aria-label="เลือกไฟล์แบบแปลน"
          onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) เพิ่มไฟล์(fs); }} />
      </label>
      {ผิดพลาด && <div role="alert" style={{ fontSize: "0.76rem", color: "#dc2626", marginTop: 6 }}>{ผิดพลาด}</div>}
    </div>
  );
}

// ── ตัวจัดการแม่แบบย่อย — เพิ่ม / แก้ชื่อ / ลบ + อัปโหลดรูปรายแม่แบบย่อย ── (ใช้ร่วมฟอร์มเพิ่ม/แก้ไข)
function SubtypeEditor({ value, images, prices, plans, mainPrice, onChange, onImagesChange, onPricesChange, onPlansChange, onPriceEdited }: {
  value: string[];
  images: Record<string, string>;
  /** ราคากลางรายแม่แบบย่อย — ไม่ใส่ = ใช้ราคาแม่แบบหลัก */
  prices: Record<string, number>;
  /** แบบแปลนรายแม่แบบย่อย — ไม่มีคีย์ = ตัวนั้นยังไม่มีแบบแปลนเฉพาะ (หน้าจอจะใช้ของแม่แบบหลัก) */
  plans: Record<string, CatalogPlan[]>;
  /** ราคาแม่แบบหลัก — ใช้เป็น placeholder ให้เห็นว่า "ไม่ใส่แล้วจะได้เท่าไหร่" */
  mainPrice: number;
  onChange: (next: string[]) => void;
  onImagesChange: (next: Record<string, string>) => void;
  onPricesChange: (next: Record<string, number>) => void;
  onPlansChange: (next: Record<string, CatalogPlan[]>) => void;
  /** ผู้ใช้พิมพ์ราคาของแม่แบบย่อยตัวนี้เอง — ตัวปรับราคาตามสัดส่วนต้องไม่ไปทับค่าที่เขาตั้งใจใส่ */
  onPriceEdited?: (name: string) => void;
}) {
  // ── แถวเพิ่ม: ใส่รูป + ชื่อ + ราคา ให้ครบในจังหวะเดียว (บอสสั่ง 28 ส.ค. 69) ──────────
  //
  // เดิมแถวเพิ่มมีแค่ช่องชื่อ ต้องกด "เพิ่ม" ให้แถวโผล่ก่อนถึงจะใส่รูป/ราคาได้
  //   สาเหตุเชิงโครงสร้าง: รูปกับราคาเก็บโดยใช้ "ชื่อ" เป็นกุญแจ (subtypeImages / subtypePrices)
  //   ยังไม่มีชื่อ = ยังไม่มีกุญแจให้ผูก · แต่ผู้ใช้ไม่มีทางรู้เรื่องนี้ เห็นแค่ช่องชื่อเปล่า ๆ
  //   แล้วเข้าใจว่าระบบใส่ราคา/รูปรายแม่แบบย่อยไม่ได้เลย (บอสถามเอง 28 ส.ค. 69)
  // ตอนนี้พักรูป/ราคาไว้ในแถวเพิ่มก่อน แล้วผูกเข้ากับชื่อทีเดียวตอนกด "เพิ่ม"
  const [draft, setDraft] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftImg, setDraftImg] = useState("");
  // เตือนในที่ที่ผู้ใช้กำลังมองอยู่ — เดิมชื่อซ้ำ/ชื่อว่างจะล้างช่องทิ้งเงียบ ๆ
  // ซึ่งตอนนี้อันตรายกว่าเดิมมาก เพราะจะพารูปกับราคาที่เพิ่งใส่หายไปด้วย
  const [warn, setWarn] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  // แถวไหนกางแผงแบบแปลนอยู่ — กางทีละแถว ไม่งั้นรายการยาวจนหาแถวที่จะแก้ไม่เจอ
  const [planIdx, setPlanIdx] = useState<number | null>(null);

  function add() {
    const v = draft.trim();
    if (!v) { setWarn("ใส่ชื่อแม่แบบย่อยก่อน"); return; }
    if (value.includes(v)) { setWarn(`มี "${v}" อยู่แล้ว — ใช้ชื่ออื่น`); return; }
    onChange([...value, v]);
    if (draftImg) onImagesChange({ ...images, [v]: draftImg });
    const p = parseFloat(draftPrice.replace(/,/g, ""));
    if (p > 0) onPricesChange({ ...prices, [v]: p });   // ไม่ใส่/ใส่ไม่ถูก = ใช้ราคาแม่แบบหลัก
    setDraft(""); setDraftPrice(""); setDraftImg(""); setWarn("");
  }
  /** เลือกรูปให้แถวที่ "ยังไม่ได้กดเพิ่ม" — พักไว้ก่อน ผูกกับชื่อตอนกดเพิ่ม */
  async function pickDraftImg(file: File) {
    try { setDraftImg(await fileToResizedDataURL(file, 512, 0.85)); }
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง"); }
  }
  function removeAt(i: number) {
    const name = value[i];
    onChange(value.filter((_, x) => x !== i));
    if (images[name]) { const n = { ...images }; delete n[name]; onImagesChange(n); }
    if (prices[name] != null) { const n = { ...prices }; delete n[name]; onPricesChange(n); }
    if (plans[name]) { const n = { ...plans }; delete n[name]; onPlansChange(n); }
  }
  function commitEdit() {
    if (editIdx === null) return;
    const old = value[editIdx];
    const v = editText.trim();
    if (!v) { removeAt(editIdx); }
    else if (!value.some((x, i) => x === v && i !== editIdx)) {
      onChange(value.map((x, i) => i === editIdx ? v : x));
      if (images[old] && old !== v) { const n = { ...images }; n[v] = n[old]; delete n[old]; onImagesChange(n); } // ย้ายรูปตามชื่อใหม่
      // ราคาต้องย้ายตามชื่อใหม่ด้วย — ไม่ย้าย = ราคาที่ตั้งไว้หายเงียบตอนแก้ชื่อ
      if (prices[old] != null && old !== v) { const n = { ...prices }; n[v] = n[old]; delete n[old]; onPricesChange(n); }
      // แบบแปลนต้องย้ายตามชื่อใหม่ด้วย — ไม่ย้าย = ไฟล์ที่แนบไว้หายเงียบตอนแก้ชื่อ
      if (plans[old] && old !== v) { const n = { ...plans }; n[v] = n[old]; delete n[old]; onPlansChange(n); }
    }
    setEditIdx(null); setEditText("");
  }
  function setPrice(name: string, raw: string) {
    onPriceEdited?.(name);
    const n = { ...prices };
    const v = parseFloat(raw);
    if (raw.trim() === "" || !(v > 0)) delete n[name];   // ว่าง/ไม่ถูกต้อง = กลับไปใช้ราคาแม่แบบหลัก
    else n[name] = v;
    onPricesChange(n);
  }
  async function pickImg(name: string, file: File) {
    // ข้อความจาก imageResize บอกเหตุผลชัด (ชนิดไฟล์/ขนาด/ไฟล์เสีย) — ส่งต่อให้ผู้ใช้ตรง ๆ ดีกว่าข้อความกลาง ๆ
    try { onImagesChange({ ...images, [name]: await fileToResizedDataURL(file, 512, 0.85) }); }
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง"); }
  }
  function clearImg(name: string) { const n = { ...images }; delete n[name]; onImagesChange(n); }

  const iconBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", display: "flex", padding: 4, flexShrink: 0 };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
        {value.length === 0 && <span style={{ fontSize: "0.82rem", color: MUTED }}>ยังไม่มีแม่แบบย่อย (ไม่ใส่ก็ได้)</span>}
        {value.map((s, i) => (
          <div key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${BORDER}`, borderRadius: planIdx === i ? "9px 9px 0 0" : 9, padding: "6px 8px", background: "#fafafa" }}>
            {/* รูปรายแม่แบบย่อย — คลิกเพื่ออัปโหลด */}
            <label title="อัปโหลด/เปลี่ยนรูปแม่แบบย่อย"
              style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0, cursor: "pointer", border: `1px solid ${BORDER}`, background: "#f0f4f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {images[s]
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={images[s]} alt={s} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <ImagePlus size={15} color="#9ca3af" />}
              <input type="file" accept="image/*" aria-label="อัปโหลดรูปแม่แบบ" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickImg(s, f); }} />
            </label>
            {/* ชื่อ (คลิกเพื่อแก้) */}
            {editIdx === i ? (
              <input autoFocus aria-label="แก้ไขข้อความ" value={editText} onChange={e => setEditText(e.target.value)} onBlur={commitEdit}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commitEdit(); } else if (e.key === "Escape") { setEditIdx(null); setEditText(""); } }}
                style={{ ...subInp, flex: 1, minWidth: 0, padding: "7px 10px", fontSize: "0.88rem" }} />
            ) : (
              <button type="button" onClick={() => { setEditIdx(i); setEditText(s); }} title="คลิกเพื่อแก้ชื่อ"
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "0.88rem", fontWeight: 600, color: STEEL, padding: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</button>
            )}
            {/* ราคากลางของแม่แบบย่อยนี้ — ว่างไว้ = ใช้ราคาแม่แบบหลัก (placeholder บอกว่าจะได้เท่าไหร่) */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              <span style={{ fontSize: "0.82rem", color: MUTED }}>฿</span>
              <input type="text" inputMode="decimal" aria-label={`ราคากลางของ ${s}`}
                value={prices[s] != null ? formatMoneyInput(String(prices[s])) : ""}
                onChange={e => setPrice(s, e.target.value.replace(/,/g, ""))}
                placeholder={mainPrice > 0 ? formatMoneyInput(String(mainPrice)) : "ราคาหลัก"}
                title={prices[s] != null ? "ราคาเฉพาะของแม่แบบย่อยนี้" : "ยังไม่ตั้ง — ใช้ราคาของแม่แบบหลัก"}
                style={{ ...subInp, width: 108, padding: "7px 9px", fontSize: "0.86rem", textAlign: "right",
                  fontWeight: prices[s] != null ? 700 : 400, color: prices[s] != null ? PRIMARY : STEEL }} />
            </div>
            {images[s] && <button type="button" onClick={() => clearImg(s)} title="ลบรูป" style={iconBtn}><Trash2 size={13} color="#dc2626" /></button>}
            {/* แนบแบบแปลนของแม่แบบย่อยตัวนี้ — ตัวเลขข้างคลิปคือจำนวนไฟล์ที่แนบไว้แล้ว */}
            <button type="button" onClick={() => setPlanIdx(planIdx === i ? null : i)}
              title={`แบบแปลนของ ${s}`} aria-label={`แบบแปลนของ ${s}`} aria-expanded={planIdx === i}
              style={{ ...iconBtn, gap: 3, alignItems: "center", color: plans[s]?.length ? PRIMARY : "#9ca3af", fontWeight: 700, fontSize: "0.7rem", fontFamily: "inherit" }}>
              <Paperclip size={13} />{plans[s]?.length ? plans[s].length : ""}
            </button>
            <button type="button" onClick={() => removeAt(i)} title="ลบแม่แบบย่อย" style={iconBtn}><X size={14} color="#9ca3af" /></button>
          </div>
          {planIdx === i && (
            <div style={{ border: `1px solid ${BORDER}`, borderTop: "none", borderRadius: "0 0 9px 9px", padding: "10px 12px 12px", background: "#f8fafc", marginTop: -6 }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: MUTED, marginBottom: 7 }}>แบบแปลนของ {s}</div>
              <PlansEditor value={plans[s] ?? []} onChange={next => {
                const n = { ...plans };
                if (next.length) n[s] = next; else delete n[s];
                onPlansChange(n);
              }} />
            </div>
          )}
          </div>
        ))}
      </div>
      {/* แถวเพิ่ม — วางเรียงให้ตรงกับแถวที่เพิ่มไปแล้ว (รูป · ชื่อ · ราคา) จะได้เห็นทันทีว่าใส่อะไรได้บ้าง */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px dashed ${BORDER}`, borderRadius: 9, padding: "6px 8px" }}>
        <label title="เลือกรูปของแม่แบบย่อยนี้ (ไม่ใส่ก็ได้)"
          style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0, cursor: "pointer", border: `1px solid ${BORDER}`, background: "#f0f4f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {draftImg
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={draftImg} alt="รูปแม่แบบย่อยที่เลือกไว้" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <ImagePlus size={15} color="#9ca3af" />}
          <input type="file" accept="image/*" aria-label="เลือกรูปแม่แบบย่อยใหม่" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickDraftImg(f); }} />
        </label>
        {/* ⚠️ minWidth: 0 ห้ามเอาออก — input มีความกว้างขั้นต่ำในตัว (ราว 170px) flexbox จะไม่ยอมย่อ
            ให้ต่ำกว่านั้นถ้าไม่สั่ง → แถวล้นกล่อง แล้วมีแถบเลื่อนแนวนอนโผล่ใต้ฟอร์ม (บอสทัก 28 ส.ค. 69) */}
        <input style={{ ...subInp, flex: 1, minWidth: 0 }} value={draft} aria-label="ชื่อแม่แบบย่อยใหม่" placeholder="เพิ่มแม่แบบย่อย เช่น โรงงานอาหาร"
          onChange={e => { setDraft(e.target.value); if (warn) setWarn(""); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: "0.82rem", color: MUTED }}>฿</span>
          <input type="text" inputMode="decimal" aria-label="ราคากลางของแม่แบบย่อยใหม่" value={draftPrice}
            onChange={e => setDraftPrice(formatMoneyInput(e.target.value.replace(/,/g, "")))}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={mainPrice > 0 ? formatMoneyInput(String(mainPrice)) : "ราคาหลัก"}
            title="ว่างไว้ = ใช้ราคาของแม่แบบหลัก"
            style={{ ...subInp, width: 108, padding: "7px 9px", fontSize: "0.86rem", textAlign: "right" }} />
        </div>
        {draftImg && <button type="button" onClick={() => setDraftImg("")} title="เอารูปที่เลือกไว้ออก" style={iconBtn}><Trash2 size={13} color="#dc2626" /></button>}
        <button type="button" className="btn btn-secondary btn-md" onClick={add} style={{ flexShrink: 0 }}><Plus size={14} /> เพิ่ม</button>
      </div>
      {warn && <div role="alert" style={{ fontSize: "0.76rem", color: "#dc2626", marginTop: 6 }}>{warn}</div>}
      {/* ⚠️ ห้ามเติมบรรทัดบรรยายวิธีใช้ใต้กล่องนี้ (บอสสั่ง 28 ส.ค. 69 · สั่งซ้ำหลังเอาคำอธิบายใต้หัวข้อออก)
           ตัวช่องกับป้ายกำกับบอกตัวเองอยู่แล้ว — ที่เหลือให้ผู้ใช้ลองกด ไม่ใช่ให้อ่านคู่มือในฟอร์ม */}
    </div>
  );
}

// ── อัปโหลด/แก้รูปแม่แบบ (ย่อขนาดก่อนเก็บ กัน quota) ──
function ImageUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try { onChange(await fileToResizedDataURL(file, 512, 0.85)); }
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง"); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 76, height: 76, borderRadius: 12, border: `1px dashed ${value ? "transparent" : "#cbd5e1"}`, background: value ? "#f0f4f9" : "#fafafa", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
        {value
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <Building2 size={26} style={{ color: "#9ca3af" }} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
          <ImagePlus size={13} /> {busy ? "กำลังอัปโหลด..." : value ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
          <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
        </label>
        {value && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange("")} style={{ color: "#dc2626" }}><Trash2 size={12} /> ลบรูป</button>}
        <span style={{ fontSize: "0.76rem", color: "#9ca3af" }}>PNG, JPG · ไม่ใส่ก็ได้</span>
      </div>
    </div>
  );
}

// แก้ราคากลาง/แคตตาล็อกส่วนกลาง = ต้องมีสิทธิ์ catalog:edit — HQ_STAFF เข้าไม่ได้
export default function HQMasterPage() {
  return <AdminGate perm="catalog:edit"><HQMasterPageInner /></AdminGate>;
}
function HQMasterPageInner() {
  // อ่าน/เขียนผ่าน repository (local: localStorage · supabase: DB · RLS: เขียนได้เฉพาะ HQ)
  // ตัวที่ 4 = กำลังบันทึกอยู่ไหม — ใช้ปิดกล่อง "เพิ่มแม่แบบ" หลังบันทึกจริงเสร็จ ไม่ใช่ปิดทันทีที่กด
  const [catalog, setCatalog, , กำลังบันทึก] = useRepoState<SolutionProduct[]>(() => catalogRepo.list(), (v) => catalogRepo.save(v), []);
  // ⚠️ หน้านี้ "ไม่จด" บันทึกการใช้งานเอง — ตัวดักที่ฐานข้อมูลเป็นผู้จดเพียงผู้เดียว (migration 0135)
  //   เดิมจดทั้งสองที่ → 1 การกระทำได้ 2 แถว และใช้ชื่อผู้ใช้คนละแบบ (ชื่อที่แสดง vs อีเมล)
  //   ทำให้ตัวกรองผู้ใช้แยกคนคนเดียวเป็น 2 คน และการ์ด "ผู้ใช้ที่มีกิจกรรม" นับเกินจริง
  //   ที่สำคัญกว่า: ฝั่งแอปจดแม้กดบันทึกโดยไม่ได้แก้อะไรเลย ส่วนตัวดักยิงเฉพาะที่เปลี่ยนจริง // บันทึกการแก้แม่แบบ/ราคากลาง
  const addingRef = useRef(false); // กันกดปุ่ม "เพิ่ม" ซ้ำเร็ว ๆ — ดู addProduct()
  const [q, setQ] = useState("");

  // modals
  const [editing, setEditing]   = useState<SolutionProduct | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", spec: "", price: "", unit: "ตร.ม.", subtypes: [], image: "", subtypeImages: {}, subtypePrices: {}, plans: [], subtypePlans: {} });
  const [adding, setAdding]     = useState(false);
  const [รอบันทึกเพิ่ม, setรอบันทึกเพิ่ม] = useState(false);
  const [addForm, setAddForm]   = useState({ name: "", spec: "", price: "", unit: "ตร.ม.", subtypes: [] as string[], image: "", subtypeImages: {} as Record<string, string>, subtypePrices: {} as Record<string, number>, plans: [] as CatalogPlan[], subtypePlans: {} as Record<string, CatalogPlan[]> });
  // ── รวม "แก้ไข" กับ "ปรับราคา" เป็นปุ่มเดียว (บอสสั่ง 28 ส.ค. 69) ────────────────
  //   เดิมสองปุ่มทับกันอยู่เรื่องหนึ่ง: ราคาแม่แบบย่อยแก้ได้ทั้งสองที่ แต่ทางฝั่ง "แก้ไข"
  //   ไม่บันทึกประวัติราคาเลย — กฎ "ราคาต้องแก้ผ่านปรับราคาเพื่อเก็บประวัติ" จึงบังคับได้แค่ครึ่งเดียว
  //   ตอนนี้ราคาทุกระดับอยู่ในฟอร์มเดียว และ "ราคาเปลี่ยน = ลงประวัติเสมอ" ไม่มีทางเลี่ยง
  const [editNote, setEditNote] = useState("");    // หมายเหตุของการเปลี่ยนราคาครั้งนี้
  // ปรับราคาแม่แบบย่อยตามสัดส่วนเดิมเมื่อราคาหลักเปลี่ยนหรือไม่ (ค่าเริ่มต้น = ปรับ)
  const [editScale, setEditScale] = useState(true);
  const [editError, setEditError] = useState("");  // ต้องมี ไม่งั้นกล่องปิดเงียบเหมือนบันทึกสำเร็จ
  // ค่าตั้งต้นตอนเปิดฟอร์ม — ใช้เป็น "ฐาน" ของการคิดสัดส่วน ไม่ใช่ค่าที่พิมพ์ล่าสุด
  //   ถ้าคิดจากค่าล่าสุด การพิมพ์ทีละตัวเลขจะทบกันไปเรื่อย ๆ (5,100 → 5,10 → 5,1 แล้วเพี้ยนถาวร)
  const editBase = useRef<{ price: number; subtypePrices: Record<string, number> }>({ price: 0, subtypePrices: {} });
  // แม่แบบย่อยที่ผู้ใช้พิมพ์ราคาเองในรอบนี้ — ห้ามให้ตัวปรับสัดส่วนไปทับค่าที่เขาตั้งใจใส่
  const editTouched = useRef<Set<string>>(new Set());
  const [history, setHistory]   = useState<SolutionProduct | null>(null);
  const [delTarget, setDelTarget] = useState<SolutionProduct | null>(null);
  // ดูรายละเอียดแม่แบบ (แบบเดียวกับหน้าดีลเลอร์) + เจาะแม่แบบย่อยพร้อมรูป
  const [viewing, setViewing]   = useState<SolutionProduct | null>(null);
  const [subView, setSubView]   = useState<{ parent: SolutionProduct; sub: string } | null>(null);
  // ค้นหา/มุมมองของรายการแม่แบบย่อยในกล่องรายละเอียด (ออกแบบใหม่ตามแบบที่บอสส่งมา 28 ส.ค. 69)
  const [subQ, setSubQ] = useState("");
  // ── แก้ไขเฉพาะแม่แบบย่อยตัวเดียว (บอสสั่ง 28 ส.ค. 69) ──────────────────────────
  //   เดิมปุ่มในกล่องแม่แบบย่อยเปิดฟอร์มของ "แม่แบบทั้งก้อน" — คนที่ตั้งใจแก้แค่ราคาของย่อยตัวเดียว
  //   ต้องเปิดฟอร์มใหญ่แล้วไปหาแถวของมันเอง และเสี่ยงเผลอแก้ของตัวอื่นไปด้วย
  const [editSub, setEditSub] = useState<{ parent: SolutionProduct; sub: string } | null>(null);
  const [subForm, setSubForm] = useState<{ name: string; image: string; price: string; plans: CatalogPlan[] }>({ name: "", image: "", price: "", plans: [] });
  const [subErr, setSubErr] = useState("");

  // แม่แบบที่เพิ่มล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69) — id เป็นข้อความ "tpl-N" ต้องเทียบแบบตัวเลข ไม่งั้น tpl-10 มาก่อน tpl-2
  const filtered = catalog.filter(p =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.spec.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.id.localeCompare(a.id, "en", { numeric: true }));
  const avgPrice = catalog.length ? Math.round(catalog.reduce((s, p) => s + p.price, 0) / catalog.length) : 0;
  const totalSub = catalog.reduce((s, p) => s + (p.subtypes?.length ?? 0), 0);

  // เก็บเฉพาะรูปของแม่แบบย่อยที่ยังมีอยู่ (กันรูปค้างของชื่อที่ถูกลบ) + undefined ถ้าว่าง
  const pruneImages = (subs: string[], imgs: Record<string, string>): Record<string, string> | undefined => {
    const keep: Record<string, string> = {};
    subs.forEach(s => { if (imgs[s]) keep[s] = imgs[s]; });
    return Object.keys(keep).length ? keep : undefined;
  };
  // ราคาของแม่แบบย่อยที่ถูกลบไปแล้ว ต้องไม่ค้างอยู่ในข้อมูล (แนวเดียวกับ pruneImages)
  const prunePrices = (subs: string[], prices: Record<string, number>): Record<string, number> | undefined => {
    const keep: Record<string, number> = {};
    subs.forEach(s => { if (prices[s] > 0) keep[s] = prices[s]; });
    return Object.keys(keep).length ? keep : undefined;
  };
  // แบบแปลนของแม่แบบย่อยที่ถูกลบไปแล้ว ต้องไม่ค้างอยู่ในข้อมูล (แนวเดียวกับ pruneImages)
  const prunePlans = (subs: string[], plans: Record<string, CatalogPlan[]>): Record<string, CatalogPlan[]> => {
    const keep: Record<string, CatalogPlan[]> = {};
    subs.forEach(s2 => { if (plans[s2]?.length) keep[s2] = plans[s2]; });
    return keep;
  };
  function openEdit(p: SolutionProduct) {
    setEditing(p);
    setEditForm({ name: p.name, spec: p.spec, price: String(p.price), unit: p.unit, subtypes: [...(p.subtypes ?? [])], image: p.image ?? "", subtypeImages: { ...(p.subtypeImages ?? {}) }, subtypePrices: { ...(p.subtypePrices ?? {}) }, plans: [...(p.plans ?? [])], subtypePlans: { ...(p.subtypePlans ?? {}) } });
    editBase.current = { price: p.price, subtypePrices: { ...(p.subtypePrices ?? {}) } };
    editTouched.current = new Set();
    setEditNote(""); setEditScale(true); setEditError("");
  }

  /** ราคาแม่แบบย่อยหลังปรับตามสัดส่วนของราคาหลักใหม่
   *  · คิดจาก "ค่าตั้งต้นตอนเปิดฟอร์ม" เสมอ — พิมพ์แก้ราคาหลักกี่รอบผลลัพธ์ก็เท่าเดิม
   *  · ข้ามตัวที่ผู้ใช้พิมพ์ราคาเองในรอบนี้ (ตั้งใจใส่เลขนั้น ห้ามทับ)
   *  · ข้ามตัวที่ถูกล้างจนว่างไปแล้ว = ตั้งใจให้กลับไปใช้ราคาแม่แบบหลัก */
  function ราคาย่อยหลังปรับ(cur: Record<string, number>, ราคาใหม่: number): Record<string, number> {
    const ฐาน = editBase.current;
    if (!editScale || !(ราคาใหม่ > 0) || !(ฐาน.price > 0)) return cur;
    const ที่ปรับได้: Record<string, number> = {};
    for (const [name, เดิม] of Object.entries(ฐาน.subtypePrices)) {
      if (editTouched.current.has(name) || cur[name] == null) continue;
      ที่ปรับได้[name] = เดิม;
    }
    return { ...cur, ...scaleSubtypePrices(ที่ปรับได้, ฐาน.price, ราคาใหม่, true) };
  }

  /** พิมพ์ราคาหลัก → ราคาย่อยขยับตามให้เห็นทันที (ยังพิมพ์ทับรายตัวได้) */
  function setEditPrice(raw: string) {
    setEditError("");
    setEditForm(f => ({ ...f, price: raw, subtypePrices: ราคาย่อยหลังปรับ(f.subtypePrices, parseFloat(raw)) }));
  }

  /** ติ๊ก/เอาติ๊กออก "ปรับราคาย่อยตามสัดส่วน" — ติ๊กออก = คืนค่าตั้งต้นให้ตัวที่ยังไม่ได้พิมพ์เอง */
  function setEditScaleAndApply(on: boolean) {
    setEditScale(on);
    setEditForm(f => {
      const next = { ...f.subtypePrices };
      const ฐาน = editBase.current;
      for (const [name, เดิม] of Object.entries(ฐาน.subtypePrices)) {
        if (editTouched.current.has(name) || next[name] == null) continue;
        const ราคาใหม่ = parseFloat(f.price);
        next[name] = on && ราคาใหม่ > 0 && ฐาน.price > 0
          ? scaleSubtypePrices({ [name]: เดิม }, ฐาน.price, ราคาใหม่, true)[name]
          : เดิม;
      }
      return { ...f, subtypePrices: next };
    });
  }

  // จำนวนแม่แบบย่อยที่ "ตั้งราคาเฉพาะไว้" ตอนเปิดฟอร์ม — มีเท่านั้นถึงจะมีอะไรให้ปรับตามสัดส่วน
  const ราคาเดิมของแม่แบบย่อย = Object.keys(editBase.current.subtypePrices).length;

  function openEditSub(parent: SolutionProduct, sub: string) {
    setEditSub({ parent, sub });
    setSubForm({
      name: sub,
      image: parent.subtypeImages?.[sub] ?? "",
      price: parent.subtypePrices?.[sub] != null ? String(parent.subtypePrices[sub]) : "",
      plans: [...(parent.subtypePlans?.[sub] ?? [])],
    });
    setSubErr("");
  }

  /** บันทึกเฉพาะแม่แบบย่อยตัวนี้ — แตะเฉพาะคีย์ของมัน ตัวอื่นในกลุ่มต้องไม่ขยับเลย
   *  ⚠️ เปลี่ยนชื่อ = ต้องย้าย รูป/ราคา/แบบแปลน ตามชื่อใหม่ด้วย ไม่งั้นของที่ตั้งไว้หายเงียบ
   *     (กติกาเดียวกับตอนแก้ชื่อในฟอร์มใหญ่ — ดู commitEdit ใน SubtypeEditor) */
  function saveEditSub() {
    if (!editSub) return;
    const เดิม = editSub.sub;
    const ชื่อใหม่ = subForm.name.trim();
    if (!ชื่อใหม่) { setSubErr("ต้องระบุชื่อแม่แบบย่อย"); return; }
    const พี่น้อง = (editSub.parent.subtypes ?? []).filter(x => x !== เดิม);
    if (พี่น้อง.includes(ชื่อใหม่)) { setSubErr(`มี "${ชื่อใหม่}" อยู่แล้วในแม่แบบนี้`); return; }
    const ราคา = parseFloat(subForm.price.replace(/,/g, ""));
    if (subForm.price.trim() !== "" && !(ราคา > 0)) { setSubErr("ราคาต้องมากกว่า 0 บาท (เว้นว่าง = ใช้ราคาแม่แบบหลัก)"); return; }
    setSubErr("");

    setCatalog(prev => prev.map(pr => {
      if (pr.id !== editSub.parent.id) return pr;
      const subs = (pr.subtypes ?? []).map(x => x === เดิม ? ชื่อใหม่ : x);
      const imgs = { ...(pr.subtypeImages ?? {}) };
      const prices = { ...(pr.subtypePrices ?? {}) };
      const plans = { ...(pr.subtypePlans ?? {}) };
      delete imgs[เดิม]; delete prices[เดิม]; delete plans[เดิม];
      if (subForm.image) imgs[ชื่อใหม่] = subForm.image;
      if (ราคา > 0) prices[ชื่อใหม่] = ราคา;
      if (subForm.plans.length) plans[ชื่อใหม่] = subForm.plans;
      return {
        ...pr, subtypes: subs,
        subtypeImages: Object.keys(imgs).length ? imgs : undefined,
        subtypePrices: Object.keys(prices).length ? prices : undefined,
        subtypePlans: plans,
      };
    }));
    // กล่องที่เปิดค้างอยู่ต้องตามชื่อใหม่ ไม่งั้นปิดกล่องนี้แล้วเจอกล่องเปล่าที่อ้างชื่อเก่า
    setSubView(v => v && v.parent.id === editSub.parent.id ? { ...v, sub: ชื่อใหม่ } : v);
    setEditSub(null);
  }

  function saveEdit() {
    if (!editing) return;
    // ⚠️ ห้ามปิดกล่องเงียบ ๆ เมื่อค่าใช้ไม่ได้ (บั๊กจริง พบ 10 ส.ค. 69 ตอนยังเป็นกล่อง "ปรับราคา")
    //   เดิมกรอก 0 หรือติดลบ แล้วกล่องปิดลงเหมือนบันทึกสำเร็จ ทั้งที่ราคาไม่ได้เปลี่ยนเลย
    //   ผู้ดูแลเชื่อว่าปรับราคากลางทั้งเครือแล้ว แต่ดีลเลอร์ทุกสาขายังเห็นราคาเดิม โดยไม่มีร่องรอยอะไรเลย
    if (!editForm.name.trim()) { setEditError("ต้องระบุชื่อแม่แบบ"); return; }
    const price = parseFloat(editForm.price);
    if (!(price > 0)) { setEditError("ราคากลางต้องมากกว่า 0 บาท"); return; }
    setEditError("");
    const subs = prunePrices(editForm.subtypes, editForm.subtypePrices);
    // "ราคาเปลี่ยน" นับทั้งราคาหลักและราคาย่อย — ราคาย่อยคือตัวที่ไหลไปเป็น BOQ ตั้งต้นของใบจริง
    // เปลี่ยนแล้วไม่ลงประวัติ = สืบย้อนไม่ได้ว่าใบเก่าคิดราคาจากอะไร (บอสสั่งให้เก็บ 28 ส.ค. 69)
    const ราคาเปลี่ยน = price !== editing.price
      || JSON.stringify(subs ?? {}) !== JSON.stringify(editing.subtypePrices ?? {});
    setCatalog(prev => prev.map(p => p.id !== editing.id ? p : {
      ...p,
      name: editForm.name.trim(), spec: editForm.spec.trim(), unit: editForm.unit.trim() || "ตร.ม.",
      subtypes: editForm.subtypes, image: editForm.image || undefined,
      subtypeImages: pruneImages(editForm.subtypes, editForm.subtypeImages),
      plans: editForm.plans,
      // แบบแปลนของแม่แบบย่อยที่ถูกลบไปแล้ว ต้องไม่ค้าง (แนวเดียวกับ pruneImages/prunePrices)
      subtypePlans: prunePlans(editForm.subtypes, editForm.subtypePlans),
      price, subtypePrices: subs,
      effectiveDate: ราคาเปลี่ยน ? todayTH() : p.effectiveDate,
      // ราคาปัจจุบันถูกดันลงประวัติ (ใหม่สุดอยู่บน) พร้อมราคาย่อยชุดที่ใช้อยู่ ณ ตอนนั้น
      priceHistory: ราคาเปลี่ยน
        ? [{ price: p.price, effectiveDate: p.effectiveDate, note: editNote.trim() || undefined, subtypePrices: p.subtypePrices }, ...p.priceHistory]
        : p.priceHistory,
    }));
    setEditing(null); setEditNote(""); setEditError("");
  }
  function openAdd() { setAddForm({ name: "", spec: "", price: "", unit: "ตร.ม.", subtypes: [], image: "", subtypeImages: {}, subtypePrices: {}, plans: [], subtypePlans: {} }); setAdding(true); }
  function addProduct() {
    // กันกดซ้ำ (H8 · guard synchronous) — nid คำนวณจาก catalog ปิดคลุม (closure) ไม่ใช่ prev ข้างใน
    // updater กดรัว ๆ เร็วกว่า React re-render ทันจะได้ nid ซ้ำ (สร้างสองแม่แบบ id ชนกัน) — พบจาก
    // Edge Case sweep เดียวกับที่เจอในฟอร์มเพิ่มลูกค้าเป้าหมาย/ลูกค้าฝั่งดีลเลอร์ (3 ส.ค. 69)
    if (addingRef.current) return;
    const price = parseFloat(addForm.price);
    if (!addForm.name.trim() || !(price > 0)) return;
    addingRef.current = true;
    const nid = Math.max(0, ...catalog.map(p => parseInt(p.id.replace(/\D/g, "")) || 0)) + 1;
    setCatalog(prev => [...prev, {
      id: `tpl-${nid}`, name: addForm.name.trim(), spec: addForm.spec.trim(),
      price, unit: addForm.unit.trim() || "ตร.ม.", effectiveDate: todayTH(), priceHistory: [],
      subtypes: addForm.subtypes, image: addForm.image || undefined, subtypeImages: pruneImages(addForm.subtypes, addForm.subtypeImages), subtypePrices: prunePrices(addForm.subtypes, addForm.subtypePrices),
      plans: addForm.plans, subtypePlans: prunePlans(addForm.subtypes, addForm.subtypePlans),
    }]);
    // ⚠️ ห้ามปิดกล่องทันที — คำขอบันทึกยังไม่จบ (เจอจริง 31 ส.ค. 69: กดบันทึกแล้วรีเฟรชทันที
    //    คำขอถูกตัดกลางทาง แม่แบบไม่ถูกสร้างเลย และไม่มีข้อความผิดพลาดเพราะหน้าถูกทิ้งไปก่อน)
    //    ตั้งธงไว้ แล้วให้ effect ปิดกล่องเมื่อบันทึกเสร็จจริง
    setรอบันทึกเพิ่ม(true);
    addingRef.current = false;
  }
  // ปิดกล่อง + ล้างฟอร์มเมื่อคำขอบันทึกจบแล้วเท่านั้น
  //
  // ⚠️ ต้องรอให้ "เห็นสถานะกำลังบันทึกก่อน" — ตอนกดบันทึกใหม่ ๆ ธงยังเป็น false อยู่หนึ่งจังหวะ
  //    (state ของ React คนละรอบเรนเดอร์) ถ้าปิดเลยจะกลายเป็นปิดทันทีเหมือนเดิม
  //    โหมดที่บันทึกแบบไม่มีคำขอ (เดโม) จะไม่มีสถานะนี้เลย → ปิดให้หลังผ่านไปครู่หนึ่ง
  const เห็นกำลังบันทึก = useRef(false);
  useEffect(() => { if (กำลังบันทึก) เห็นกำลังบันทึก.current = true; }, [กำลังบันทึก]);
  useEffect(() => {
    if (!รอบันทึกเพิ่ม) return;
    const ปิด = () => {
      เห็นกำลังบันทึก.current = false;
      setรอบันทึกเพิ่ม(false);
      setAddForm({ name: "", spec: "", price: "", unit: "ตร.ม.", subtypes: [], image: "", subtypeImages: {}, subtypePrices: {}, plans: [], subtypePlans: {} });
      setAdding(false);
    };
    if (!กำลังบันทึก && เห็นกำลังบันทึก.current) { ปิด(); return; }
    if (!กำลังบันทึก) {
      const t = setTimeout(() => { if (!เห็นกำลังบันทึก.current) ปิด(); }, 400);
      return () => clearTimeout(t);
    }
  }, [รอบันทึกเพิ่ม, กำลังบันทึก]);
  function deleteProduct() {
    if (!delTarget) return;
    // สั่งลบตรง ๆ (เหตุผลเดียวกับหน้าดีลเลอร์ — ห้ามอนุมานการลบจากอาร์เรย์ที่หายไป)
    const target = delTarget;
    void catalogRepo.remove(target.id)
      .then(() => setCatalog(prev => prev.filter(p => p.id !== target.id)))
      .catch(e => แจ้งพลาด("ลบแม่แบบไม่สำเร็จ: " + friendlyError(e)));
    setDelTarget(null);
  }

  // ขนาดตัวอักษร/ช่องกรอกของฟอร์มแม่แบบ — ขยายขึ้นทั้งชุดตามที่ผู้ใช้แจ้งว่าเล็กเกินไป (14 ส.ค. 69)
  const inp: React.CSSProperties = { width: "100%", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "11px 14px", fontSize: "0.92rem", color: STEEL, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const lbl: React.CSSProperties = { display: "block", fontSize: "0.78rem", fontWeight: 700, color: MUTED, marginBottom: 7 };
  const pill: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", fontWeight: 700, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 99, padding: "7px 16px" };

  return (
    <div className="erp">
      {/* ปุ่ม/ตัวกรองของหน้าอยู่ขวาหัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้า/ป้ายกลุ่มมาจากแถบบนแล้ว */}
      <TopbarActions>
        <button className="btn btn-primary btn-md" onClick={openAdd}><Plus size={15} /> เพิ่มแม่แบบ</button>
      </TopbarActions>

      {/* Summary — KPI มาตรฐานของ HQ (.hq-kpi4) : ป้าย → ตัวเลข → หน่วย/บริบท · ไอคอนกล่องสีจางมุมขวา
          เดิมหน้านี้ใช้ .hqx-kpi ชุดเก่า (แถบสีซ้าย + ไอคอนซ้าย + ตัวเลขขึ้นก่อนป้าย)
          หน้าเดียวในระบบที่หน้าตาไม่เหมือนชาวบ้าน (บอสแจ้ง 19 ส.ค. 69) · 3 ใบในตะแกรง 4 ช่อง → การ์ดกว้างเท่าหน้าอื่น */}
      <div className="hq-kpi4" style={{ marginBottom: "1.25rem" }}>
        {([
          { label: "แม่แบบทั้งหมด", value: `${catalog.length}`, sub: "รายการ", Icon: Building2, color: "#003366", bg: "#E8F0FE" },
          { label: "ราคากลางเฉลี่ย", value: fmtBaht(avgPrice), sub: "ต่อ ตร.ม.", Icon: Tag, color: "#0891B2", bg: "#E6F4F9" },
          { label: "แม่แบบย่อยทั้งหมด", value: `${totalSub}`, sub: "รายการ", Icon: Layers, color: "#059669", bg: "#E6F6EF" },
        ] as const).map(t => (
          <div key={t.label} className="card" style={{ marginBottom: 0, padding: "14px 14px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.68rem", color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#1F2937", lineHeight: 1.2, marginTop: 5, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.015em", whiteSpace: "nowrap" }}>
                <CountUp value={t.value} />
              </div>
              <div style={{ fontSize: "0.65rem", color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.sub}</div>
            </div>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <t.Icon size={17} color={t.color} strokeWidth={2.1} />
            </span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card hq-sticky-filter" style={{ padding: "12px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="search-bar">
          <Search size={13} color={MUTED} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาแม่แบบ..." />
          {q && <button onClick={() => setQ("")} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 0, display: "flex" }}><X size={13} /></button>}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 16 }}>
        {filtered.map(p => (
          <div key={p.id} className="card tpl-card" role="button" tabIndex={0}
            onClick={() => { setSubQ(""); setViewing(p); }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSubQ(""); setViewing(p); } }}
            style={{ display: "flex", flexDirection: "column", overflow: "hidden", cursor: "pointer" }}>
            {/* ── Hero: ไทล์ + ป้ายจำนวนแม่แบบย่อย ── */}
            {/* ── กรอบรูปยึด "สัดส่วน 16:9" แทนความสูงตายตัว (บอสสั่ง 28 ส.ค. 69) ──────────
                 ก่อนหน้านี้กรอบสูงแค่ 104px ส่วนการ์ดกว้าง ~500px → รูปถ่ายแนวนอนถูกบีบด้วย "ความสูง"
                 เหลือเล็กนิดเดียวกลางกรอบ มีขอบขาวซ้ายขวาเต็มไปหมด (บอสทัก "รูปเต็ม ไม่ใช่ย่อแบบนี้")
                 16:9 = สัดส่วนเดียวกับรูปถ่ายส่วนใหญ่ รูปจึงเต็มกรอบพอดี ไม่มีขอบและไม่ต้องตัดขอบ
                 ⚠️ ยังต้องเป็น contain ไม่ใช่ cover — บอสสั่งไว้ว่าห้ามตัดรูป (28 ส.ค. 69)
                 ⚠️ ใช้สัดส่วนแทนความสูงตายตัว การ์ดทุกใบจึงยังสูงเท่ากันเป๊ะ (กว้างเท่ากันในกริดเดียวกัน) */}
            <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#f0f4f9", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: `1px solid ${BORDER}`, overflow: "hidden" }}>
              {p.image ? (
                /* รูปแม่แบบที่อัปโหลด — กรอบสูงเท่ากันทุกใบ แต่ต้องเห็นรูป "ทั้งรูป" ไม่ตัดขอบ (บอสสั่ง 28 ส.ค. 69)
                   contain = ย่อให้พอดีกรอบตามสัดส่วนเดิม · cover (ของเดิม) จะซูมจนล้นแล้วตัดส่วนเกินทิ้ง
                   รูปแบบแปลนอาคารโดนตัดหัวตัดท้ายจนดูไม่รู้เรื่อง · padding กันรูปชนขอบกรอบ */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={p.image} alt={p.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <>
                  <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(#00336610 1px, transparent 1px), linear-gradient(90deg, #00336610 1px, transparent 1px)", backgroundSize: "22px 22px", opacity: 0.5 }} />
                  <div className="tpl-hero" style={{ width: 54, height: 54, borderRadius: 14, background: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 6px 16px rgba(0,51,102,.12)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>
                    <Building2 size={26} style={{ color: PRIMARY }} />
                  </div>
                </>
              )}
              {p.subtypes && p.subtypes.length > 0 && (
                <span style={{ position: "absolute", top: 11, right: 11, fontSize: "0.65rem", fontWeight: 700, color: PRIMARY, background: "rgba(255,255,255,.85)", border: `1px solid #dce5f0`, borderRadius: 999, padding: "3px 10px" }}>{p.subtypes.length} แม่แบบย่อย</span>
              )}
            </div>

            {/* ── เนื้อหา ── */}
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
              <div style={{ fontSize: "1rem", fontWeight: 800, color: STEEL, lineHeight: 1.3 }}>{p.name}</div>
              <div className="tpl-clamp2" style={{ fontSize: "0.72rem", color: MUTED, lineHeight: 1.5, minHeight: "2.25em" }}>{p.spec}</div>

              {p.subtypes && p.subtypes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {p.subtypes.map(s => (
                    <span key={s} style={{ fontSize: "0.65rem", fontWeight: 600, color: PRIMARY, background: "#eef3f8", border: `1px solid #dce5f0`, borderRadius: 7, padding: "3px 9px" }}>{s}</span>
                  ))}
                </div>
              )}

              {/* เส้นคั่น + ราคา */}
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
                <div>
                  <div style={{ fontSize: "0.65rem", color: MUTED, fontWeight: 700, marginBottom: 1 }}>ราคากลาง</div>
                  <span style={{ fontSize: "1.3rem", fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{fmtBaht(p.price)}</span>
                  <span style={{ fontSize: "0.72rem", color: MUTED }}> /{p.unit}</span>
                </div>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.65rem", color: "#9ca3af", whiteSpace: "nowrap" }}><CalendarClock size={11} /> {p.effectiveDate}</span>
              </div>

              {/* ปุ่มจัดการ (คลิกที่การ์ดเพื่อดูรายละเอียด · ปุ่มเหล่านี้ไม่เปิดหน้ารายละเอียด) */}
              <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={e => { e.stopPropagation(); openEdit(p); }}><Pencil size={12} /> แก้ไข</button>
                <button className="btn btn-secondary btn-sm" title="ประวัติราคา" style={{ width: 38, padding: 0, justifyContent: "center" }} aria-label={`ประวัติราคา ${p.name}`} onClick={e => { e.stopPropagation(); setHistory(p); }}><History size={13} /></button>
                <button className="btn btn-danger btn-sm" title="ลบแม่แบบ" style={{ width: 38, padding: 0, justifyContent: "center" }} aria-label={`ลบแม่แบบ ${p.name}`} onClick={e => { e.stopPropagation(); setDelTarget(p); }}><Trash2 size={13} /></button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card" style={{ gridColumn: "1/-1", padding: 40, textAlign: "center", color: "#9ca3af", fontSize: "0.8rem" }}>ไม่พบแม่แบบ</div>
        )}
      </div>

      {/* ── View detail modal — ดูแบบเดียวกับที่ดีลเลอร์เห็น + จัดการได้ในตัว (HQ ควบคุม) ── */}
      {viewing && (
        <div onClick={() => setViewing(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <ModalCard onClose={() => setViewing(null)} label="รายละเอียดแม่แบบ" className="modal-pop-flex"
            style={{ position: "static", width: "100%", maxWidth: 1100, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>

            {/* ── หัวกล่อง: ชื่อแม่แบบ + ช่องค้นหาแม่แบบย่อย + ปิด ─────────────────────
                 พื้นขาว (ไม่ใช่แถบน้ำเงิน) ตามแบบที่บอสส่งมา — รูปใหญ่ด้านล่างเป็นตัวเด่นแทน */}
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: STEEL, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewing.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {(viewing.subtypes?.length ?? 0) > 0 && (
                  <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                    <Search size={14} color="#9ca3af" style={{ position: "absolute", left: 11, pointerEvents: "none" }} />
                    <input value={subQ} onChange={e => setSubQ(e.target.value)} aria-label="ค้นหาแม่แบบย่อย" placeholder="ค้นหาแม่แบบย่อย..."
                      style={{ width: 240, maxWidth: "40vw", border: `1px solid ${BORDER}`, borderRadius: 10, padding: "9px 12px 9px 32px", fontSize: "0.84rem", color: STEEL, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                )}
                <button onClick={() => setViewing(null)} aria-label="ปิด"
                  style={{ width: 34, height: 34, borderRadius: 10, background: "#f4f6f9", color: STEEL, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
              </div>
            </div>

            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
              {/* ── รูปใหญ่ + การ์ดลอยทับมุมล่างซ้าย (ชื่อ + รายละเอียด) ───────────────── */}
              {/* ⚠️ flexShrink: 0 ห้ามเอาออก — กรอบนี้เป็นลูกของกล่องแนวตั้งที่เลื่อนได้
                   ความสูงมาจาก aspect-ratio ซึ่ง flexbox ถือว่า "ย่อได้" พอมีแม่แบบย่อยเยอะ
                   รูปจะถูกบีบจนเหลือ 2px แล้วการ์ดข้อมูลล้นออกไปโดนตัดหัว (บอสเจอเอง 28 ส.ค. 69)
                   วัดจริงตอนพัง: สูง 2px ทั้งที่ควรเป็น 446px */}
              <div style={{ position: "relative", aspectRatio: "21 / 9", flexShrink: 0, borderRadius: 14, overflow: "hidden", background: "#f0f4f9", border: `1px solid ${BORDER}` }}>
                {viewing.image
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={viewing.image} alt={viewing.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Building2 size={56} style={{ color: PRIMARY }} /></div>}
                {/* ⚠️ รูปในแถบนี้ใช้ cover ต่างจากที่อื่น — เป็น "ภาพพื้นหลัง" ที่มีการ์ดวางทับ
                     ถ้าใช้ contain จะมีขอบว่างแล้วการ์ดลอยอยู่บนพื้นเปล่า ไม่ใช่บนรูปตามแบบ
                     ส่วนรูปที่ต้อง "เห็นครบทั้งรูป" (การ์ดแคตตาล็อก · แม่แบบย่อย) ยังเป็น contain เหมือนเดิม */}
                <div style={{ position: "absolute", left: 20, bottom: 20, maxWidth: "min(420px, 70%)", background: "rgba(255,255,255,.93)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,.7)", borderRadius: 14, padding: "16px 18px", boxShadow: "0 10px 30px rgba(0,51,102,.18)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, background: "#dce5f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Building2 size={16} style={{ color: PRIMARY }} /></span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 800, color: STEEL, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{viewing.name}</span>
                  </div>
                  <div style={{ fontSize: "0.78rem", lineHeight: 1.6, color: "#4b5563" }}>{viewing.spec || "—"}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(viewing.price)}</span>
                    <span style={{ fontSize: "0.72rem", color: MUTED }}>/{viewing.unit}</span>
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: "0.68rem", color: "#9ca3af", whiteSpace: "nowrap" }}><CalendarClock size={11} /> {viewing.effectiveDate}</span>
                  </div>
                </div>
              </div>


              {/* ── แบบแปลนของแม่แบบนี้ — ดีลเลอร์เปิดดู/ดาวน์โหลดได้ (บอสสั่ง 28 ส.ค. 69) ──── */}
              {(viewing.plans?.length ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: "1.02rem", fontWeight: 800, color: STEEL, marginBottom: 10 }}>แบบแปลน</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                    {(viewing.plans ?? []).map(f => (
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
              {/* ── หัวข้อรายการแม่แบบย่อย + ปุ่มสลับมุมมอง ───────────────────────────── */}
              {(viewing.subtypes?.length ?? 0) > 0 && (() => {
                const ทั้งหมด = viewing.subtypes ?? [];
                const รายการ = subQ.trim() ? ทั้งหมด.filter(s => s.toLowerCase().includes(subQ.trim().toLowerCase())) : ทั้งหมด;
                const รูปของ = (s: string) => viewing.subtypeImages?.[s] ?? viewing.image;
                const ตั้งราคาเอง = (s: string) => viewing.subtypePrices?.[s] != null;
                return (
                  <div>
                    <div style={{ fontSize: "1.02rem", fontWeight: 800, color: STEEL, marginBottom: 12 }}>แม่แบบย่อยทั้งหมด</div>

                    {รายการ.length === 0 && (
                      <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: "0.8rem", border: `1px dashed ${BORDER}`, borderRadius: 12 }}>ไม่พบแม่แบบย่อยที่ค้นหา</div>
                    )}

                    {/* มุมมองตาราง — การ์ดรูปใหญ่ */}
                    {รายการ.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                        {รายการ.map(s => (
                          <button key={s} onClick={() => setSubView({ parent: viewing, sub: s })} title={`ดูรายละเอียด ${s}`}
                            style={{ border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden", background: "#fff", cursor: "pointer", padding: 0, textAlign: "left", fontFamily: "inherit", display: "flex", flexDirection: "column", transition: "box-shadow .15s, border-color .15s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 22px rgba(0,51,102,.14)"; (e.currentTarget as HTMLElement).style.borderColor = "#cdd8e6"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; (e.currentTarget as HTMLElement).style.borderColor = BORDER; }}>
                            <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#f0f4f9", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                              {รูปของ(s)
                                /* eslint-disable-next-line @next/next/no-img-element */
                                ? <img src={รูปของ(s)} alt={s} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                                : <Building2 size={26} style={{ color: PRIMARY }} />}
                            </div>
                            <div style={{ padding: "11px 13px", display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                              <span style={{ width: 32, height: 32, borderRadius: 10, background: "#dce5f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Building2 size={15} style={{ color: PRIMARY }} /></span>
                              <span style={{ minWidth: 0 }}>
                                <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</span>
                                {/* แบบที่บอสส่งมาเป็น "จังหวัด" แต่แม่แบบย่อยไม่มีข้อมูลจังหวัด (เก็บแค่ ชื่อ/รูป/ราคา)
                                    จึงใช้ราคากลางของแม่แบบย่อยนั้นแทน — ของจริงที่คนดูแคตตาล็อกต้องรู้ที่สุด */}
                                <span style={{ display: "block", fontSize: "0.74rem", marginTop: 1, fontWeight: ตั้งราคาเอง(s) ? 800 : 500, color: ตั้งราคาเอง(s) ? PRIMARY : "#9ca3af" }}
                                  title={ตั้งราคาเอง(s) ? "ราคาเฉพาะของแม่แบบย่อยนี้" : "ใช้ราคาของแม่แบบหลัก"}>
                                  {fmtBaht(catalogRate(viewing, s))}<span style={{ fontWeight: 500, color: "#9ca3af" }}>/{viewing.unit}</span>
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

                    {/* มุมมองรายการ — แถวเตี้ย เห็นได้เยอะในจอเดียว */}
                  </div>
                );
              })()}
            </div>

            {/* ── ท้ายกล่อง: จำนวนแม่แบบย่อย + ปุ่มจัดการ ────────────────────────────── */}
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, background: "#fafbfc", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.8rem", color: MUTED, fontWeight: 600 }}>ทั้งหมด {viewing.subtypes?.length ?? 0} แม่แบบย่อย</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary btn-md" onClick={() => { const p = viewing; setViewing(null); setHistory(p); }}><History size={13} /> ประวัติราคา</button>
                <button className="btn btn-danger btn-md" onClick={() => { const p = viewing; setViewing(null); setDelTarget(p); }}><Trash2 size={13} /> ลบแม่แบบ</button>
                <button className="btn btn-primary btn-md" onClick={() => { const p = viewing; setViewing(null); openEdit(p); }}><Pencil size={13} /> แก้ไข</button>
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
            {/* ธีมเดียวกับกล่องอื่นของหน้านี้ — หัวขาว ตัวหนังสือเข้ม ปุ่มปิดพื้นเทา */}
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, color: STEEL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subView.sub}</div>
              </div>
              <button onClick={() => setSubView(null)} aria-label="ปิด"
                style={{ width: 34, height: 34, borderRadius: 10, background: "#f4f6f9", color: STEEL, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
            </div>

            {(() => {
              const แม่ = subView.parent, ย่อย = subView.sub;
              const ราคาย่อย = catalogRate(แม่, ย่อย);
              const ตั้งเฉพาะ = แม่.subtypePrices?.[ย่อย] != null;
              const ต่างกัน = แม่.price > 0 ? Math.round(((ราคาย่อย - แม่.price) / แม่.price) * 1000) / 10 : 0;
              const รูป = แม่.subtypeImages?.[ย่อย] ?? แม่.image;
              const ใช้รูปแม่ = !แม่.subtypeImages?.[ย่อย] && !!แม่.image;
              const พี่น้อง = (แม่.subtypes ?? []).filter(x => x !== ย่อย);
              return (
                <>
                  <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* ⚠️ flexShrink: 0 — เหตุผลเดียวกับกรอบรูปในกล่องรายละเอียดแม่แบบ (ดูคอมเมนต์ที่นั่น) */}
                    <div style={{ position: "relative", aspectRatio: "21 / 9", flexShrink: 0, borderRadius: 14, overflow: "hidden", background: "#f0f4f9", border: `1px solid ${BORDER}` }}>
                      {รูป
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={รูป} alt={ย่อย} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                        : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Building2 size={48} style={{ color: PRIMARY }} /></div>}
                      {/* บอกตามจริงว่ารูปนี้เป็นของแม่แบบหลัก ไม่ใช่รูปเฉพาะของแม่แบบย่อยนี้ */}
                      {ใช้รูปแม่ && (
                        <span style={{ position: "absolute", left: 12, bottom: 12, fontSize: "0.66rem", fontWeight: 700, color: MUTED, background: "rgba(255,255,255,.9)", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "3px 10px" }}>ใช้รูปของแม่แบบหลัก</span>
                      )}
                    </div>

                    {/* ── ราคา: ของแม่แบบย่อยนี้ เทียบกับแม่แบบหลัก ───────────────────── */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      <div style={{ padding: "14px 16px", borderRadius: 12, background: "#dce5f0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 3 }}>
                          ราคากลางของแม่แบบย่อยนี้
                          <span style={{ fontSize: "0.6rem", fontWeight: 700, color: ตั้งเฉพาะ ? PRIMARY : "#9ca3af", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 999, padding: "1px 8px" }}>
                            {ตั้งเฉพาะ ? "ตั้งเฉพาะ" : "ตามแม่แบบหลัก"}
                          </span>
                        </div>
                        <span style={{ fontSize: "1.35rem", fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(ราคาย่อย)}</span>
                        <span style={{ fontSize: "0.74rem", color: MUTED }}> /{แม่.unit}</span>
                      </div>
                      <div style={{ padding: "14px 16px", borderRadius: 12, background: "#f6f8fa", border: `1px solid ${BORDER}` }}>
                        <div style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 3 }}>ราคาแม่แบบหลัก ({แม่.name})</div>
                        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: STEEL, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(แม่.price)}</span>
                        <span style={{ fontSize: "0.74rem", color: MUTED }}> /{แม่.unit}</span>
                        {ตั้งเฉพาะ && ต่างกัน !== 0 && (
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, marginTop: 3, color: ต่างกัน > 0 ? "#b45309" : "#059669" }}>
                            {ต่างกัน > 0 ? "แพงกว่า" : "ถูกกว่า"} {Math.abs(ต่างกัน)}%
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 5 }}>รายละเอียด (ของแม่แบบหลัก)</div>
                      <div style={{ fontSize: "0.86rem", fontWeight: 600, lineHeight: 1.65, color: STEEL }}>{แม่.spec || "—"}</div>
                    </div>

                    {/* ── ประวัติราคาเฉพาะของแม่แบบย่อยนี้ ─────────────────────────────
                         ⚠️ รอบที่บันทึกก่อน 28 ส.ค. 69 ไม่ได้เก็บราคาย่อยไว้ — ต้องบอกตามตรงว่า
                         "ไม่ได้บันทึกไว้" ห้ามเอาราคาแม่แบบหลักมาแสดงแทนเหมือนเป็นราคาย่อย */}
                    <div>
                      <div style={{ fontSize: "0.66rem", color: MUTED, fontWeight: 700, marginBottom: 6 }}>ประวัติราคาของแม่แบบย่อยนี้</div>
                      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#dce5f0" }}>
                          <span style={{ fontSize: "0.78rem", fontWeight: 700, color: PRIMARY }}>ปัจจุบัน · {แม่.effectiveDate}</span>
                          <span style={{ fontSize: "0.84rem", fontWeight: 800, color: PRIMARY, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(ราคาย่อย)}</span>
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
                                    ? <span style={{ fontSize: "0.8rem", fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(ราคาตอนนั้น)}</span>
                                    : <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>ตามแม่แบบหลัก {fmtBaht(h.price)}</span>}
                              </span>
                            </div>
                          );
                        })}
                        {แม่.priceHistory.length === 0 && (
                          <div style={{ fontSize: "0.74rem", color: "#9ca3af", textAlign: "center", padding: "14px 0", borderTop: `1px solid ${BORDER}` }}>ยังไม่มีประวัติการปรับราคา</div>
                        )}
                      </div>
                    </div>

                    {/* ── กระโดดไปดูแม่แบบย่อยตัวอื่นในกลุ่มเดียวกันได้เลย ───────────────── */}

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
                    {/* ปุ่ม "แก้ไขแม่แบบทั้งก้อน" ถูกเอาออก (บอสสั่ง 1 ก.ย. 69) — กล่องนี้คือรายละเอียด
                        ของแม่แบบย่อยตัวเดียว ปุ่มที่พาไปแก้ทั้งก้อนจึงชวนกดพลาดไปแก้ของตัวอื่น */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-primary btn-md" onClick={() => openEditSub(แม่, ย่อย)}><Pencil size={13} /> แก้ไขแม่แบบย่อยนี้</button>
                    </div>
                  </div>
                </>
              );
            })()}
          </ModalCard>
        </div>
      )}

      {/* ── Add modal ── */}
      {adding && (
        <div onClick={() => setAdding(false)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setAdding(false)} label="เพิ่มแม่แบบใหม่" className="modal-pop-flex" style={{ position: "static", width: "100%", maxWidth: 720, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: STEEL }}>เพิ่มแม่แบบใหม่</div>
              <button onClick={() => setAdding(false)} aria-label="ปิด"
                style={{ width: 34, height: 34, borderRadius: 10, background: "#f4f6f9", color: STEEL, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
            </div>
            <div className="form-grid" style={{ padding: 24, overflowY: "auto", flex: 1 }}>
              <div className="form-section">ข้อมูลแม่แบบ</div>
              <div className="col-full"><label style={lbl}>ชื่อแม่แบบ *</label><input style={inp} value={addForm.name} autoFocus onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="เช่น โกดังสำเร็จรูป" /></div>
              <div className="col-full"><label style={lbl}>รูปแม่แบบ</label><ImageUpload value={addForm.image} onChange={v => setAddForm(f => ({ ...f, image: v }))} /></div>
              <div className="col-full"><label style={lbl}>รายละเอียด/สเปก</label><textarea style={{ ...inp, resize: "vertical" }} rows={3} value={addForm.spec} onChange={e => setAddForm(f => ({ ...f, spec: e.target.value }))} /></div>

              <div className="form-section">แบบแปลน</div>
              <div className="col-full">
                <PlansEditor value={addForm.plans} onChange={next => setAddForm(f => ({ ...f, plans: next }))} />
              </div>

              <div className="form-section">ราคากลาง</div>
              <div><label style={lbl}>ราคากลาง (บาท) *</label><input style={inp} type="text" inputMode="decimal" aria-label="ราคากลาง (บาท)" value={formatMoneyInput(addForm.price)} onChange={e => setAddForm(f => ({ ...f, price: e.target.value.replace(/,/g, "") }))} placeholder="5,100" /></div>
              <div><label style={lbl}>หน่วย</label><UnitSelect value={addForm.unit} style={inp} onChange={v => setAddForm(f => ({ ...f, unit: v }))} /></div>

              {/* แม่แบบย่อย — ใส่/แก้/ลบ ได้ตั้งแต่ตอนสร้าง */}
              <div className="form-section">แม่แบบย่อย</div>
              <div className="col-full">
                <label style={lbl}>แม่แบบย่อย ({addForm.subtypes.length})</label>
                <SubtypeEditor value={addForm.subtypes} images={addForm.subtypeImages}
                  prices={addForm.subtypePrices} plans={addForm.subtypePlans} mainPrice={parseFloat(addForm.price) || 0}
                  onChange={next => setAddForm(f => ({ ...f, subtypes: next }))}
                  onImagesChange={next => setAddForm(f => ({ ...f, subtypeImages: next }))}
                  onPricesChange={next => setAddForm(f => ({ ...f, subtypePrices: next }))}
                  onPlansChange={next => setAddForm(f => ({ ...f, subtypePlans: next }))} />
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, background: "#fafbfc", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-md" onClick={() => setAdding(false)}>ยกเลิก</button>
              <button className="btn btn-primary btn-md" onClick={addProduct}
                disabled={!addForm.name.trim() || !parseFloat(addForm.price) || รอบันทึกเพิ่ม}
                style={!addForm.name.trim() || !parseFloat(addForm.price) || รอบันทึกเพิ่ม ? { opacity: .5, cursor: "not-allowed" } : undefined}>
                <Check size={14} /> {รอบันทึกเพิ่ม ? "กำลังบันทึก…" : "บันทึก"}
              </button>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setEditing(null)} label="แก้ไขแม่แบบ" style={{ width: "100%", maxWidth: 720, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
            {/* ธีมเดียวกับกล่องรายละเอียด (บอสสั่ง 28 ส.ค. 69) — หัวขาว ตัวหนังสือเข้ม ปุ่มปิดพื้นเทา */}
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: STEEL, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>แก้ไขแม่แบบ</div>
              <button onClick={() => setEditing(null)} aria-label="ปิด"
                style={{ width: 34, height: 34, borderRadius: 10, background: "#f4f6f9", color: STEEL, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
            </div>
            <div className="form-grid" style={{ padding: 24, overflowY: "auto", flex: 1 }}>
              <div className="form-section">ข้อมูลแม่แบบ</div>
              <div className="col-full"><label style={lbl}>ชื่อแม่แบบ *</label><input style={inp} value={editForm.name} autoFocus onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div className="col-full"><label style={lbl}>รูปแม่แบบ</label><ImageUpload value={editForm.image} onChange={v => setEditForm(f => ({ ...f, image: v }))} /></div>
              <div className="col-full"><label style={lbl}>รายละเอียด/สเปก</label><textarea style={{ ...inp, resize: "vertical" }} rows={3} value={editForm.spec} onChange={e => setEditForm(f => ({ ...f, spec: e.target.value }))} /></div>

              <div className="form-section">แบบแปลน</div>
              <div className="col-full">
                <PlansEditor value={editForm.plans} onChange={next => setEditForm(f => ({ ...f, plans: next }))} />
              </div>
              {/* ── ราคากลาง — ย้ายมาจากกล่อง "ปรับราคา" ที่ถูกยุบไป (บอสสั่ง 28 ส.ค. 69) ── */}
              <div className="form-section">ราคากลาง</div>
              <div>
                <label style={lbl}>ราคากลาง (บาท) *</label>
                <input aria-label="ราคากลาง (บาท)" style={inp} type="text" inputMode="decimal"
                  value={formatMoneyInput(editForm.price)} onChange={e => setEditPrice(e.target.value.replace(/,/g, ""))} />
              </div>
              <div>
                <label style={lbl}>หน่วย</label>
                <UnitSelect value={editForm.unit} style={inp} onChange={v => setEditForm(f => ({ ...f, unit: v }))} />
              </div>
              <div className="col-full">
                <label style={lbl}>หมายเหตุของการเปลี่ยนราคา</label>
                <input aria-label="หมายเหตุของการเปลี่ยนราคา" style={inp} value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="เช่น ปรับตามราคาเหล็ก" />
              </div>
              {ราคาเดิมของแม่แบบย่อย > 0 && (
                <label className="col-full" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", border: `1px solid ${BORDER}`, borderRadius: 10, background: "#f8fafc", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, color: STEEL }}>
                  <input type="checkbox" checked={editScale} onChange={e => setEditScaleAndApply(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>
                    ปรับราคาแม่แบบย่อยตาม ({ราคาเดิมของแม่แบบย่อย} รายการที่ตั้งราคาเฉพาะไว้)
                  </span>
                </label>
              )}

              {/* แม่แบบย่อย — เพิ่ม/แก้ไขชื่อ/ลบได้ (เลือกได้ในฟอร์มลูกค้าเป้าหมาย/ใบเสนอราคา) */}
              <div className="form-section">แม่แบบย่อย</div>
              <div className="col-full">
                <label style={lbl}>แม่แบบย่อย ({editForm.subtypes.length})</label>
                <SubtypeEditor value={editForm.subtypes} images={editForm.subtypeImages}
                  prices={editForm.subtypePrices} plans={editForm.subtypePlans} mainPrice={parseFloat(editForm.price) || 0}
                  onChange={next => setEditForm(f => ({ ...f, subtypes: next }))}
                  onImagesChange={next => setEditForm(f => ({ ...f, subtypeImages: next }))}
                  onPricesChange={next => setEditForm(f => ({ ...f, subtypePrices: next }))}
                  onPlansChange={next => setEditForm(f => ({ ...f, subtypePlans: next }))}
                  onPriceEdited={name => editTouched.current.add(name)} />
              </div>
              {editError && <div className="col-full" role="alert" style={{ fontSize: "0.74rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px" }}>{editError}</div>}
            </div>
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, background: "#fafbfc", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-md" onClick={() => setEditing(null)}>ยกเลิก</button>
              <button className="btn btn-primary btn-md" onClick={saveEdit}><Check size={14} /> บันทึก</button>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── History modal ── */}
      {history && (
        <div onClick={() => setHistory(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setHistory(null)} label="ประวัติการเปลี่ยนราคา" className="modal-fit-auto" style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>
            <div style={{ background: PRIMARY, color: "#fff", padding: "15px 20px", fontSize: "0.92rem", fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              ประวัติราคา — {history.name}
              <button onClick={() => setHistory(null)} style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, width: 28, height: 28, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={14} /></button>
            </div>
            <div style={{ padding: 20, maxHeight: 360, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "#dce5f0", marginBottom: 8 }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: PRIMARY }}>ปัจจุบัน · {history.effectiveDate}</span>
                <span style={{ fontSize: "0.86rem", fontWeight: 800, color: PRIMARY }}>{fmtBaht(history.price)}/{history.unit}</span>
              </div>
              {history.priceHistory.map((h, i) => {
                // ราคาย่อยที่ใช้อยู่ ณ ตอนนั้น — เก็บตั้งแต่ 28 ส.ค. 69 · ประวัติเก่ากว่านั้นไม่มีข้อมูลนี้
                const ราคาย่อย = Object.entries(h.subtypePrices ?? {});
                return (
                  <div key={i} style={{ padding: "9px 12px", borderBottom: "1px solid #f0f4f8" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "0.72rem", color: STEEL, fontWeight: 600 }}>{h.effectiveDate}</div>
                        {h.note && <div style={{ fontSize: "0.65rem", color: MUTED }}>{h.note}</div>}
                      </div>
                      <span style={{ fontSize: "0.8rem", fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(h.price)}</span>
                    </div>
                    {ราคาย่อย.length > 0 && (
                      <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 3 }}>
                        {ราคาย่อย.map(([name, price]) => (
                          <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: "0.68rem", color: MUTED }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                            <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(price)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {history.priceHistory.length === 0 && <div style={{ fontSize: "0.72rem", color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>ยังไม่มีประวัติการปรับราคา</div>}
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── แก้ไขเฉพาะแม่แบบย่อยตัวเดียว ── */}
      {editSub && (
        <div onClick={() => setEditSub(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", zIndex: 230, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setEditSub(null)} label="แก้ไขแม่แบบย่อย"
            style={{ width: "100%", maxWidth: 620, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 18, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,.24)" }}>
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: STEEL, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>แก้ไขแม่แบบย่อย</div>
              <button onClick={() => setEditSub(null)} aria-label="ปิด"
                style={{ width: 34, height: 34, borderRadius: 10, background: "#f4f6f9", color: STEEL, border: `1px solid ${BORDER}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={16} /></button>
            </div>
            <div className="form-grid" style={{ padding: 24, overflowY: "auto", flex: 1 }}>
              <div className="form-section">ข้อมูลแม่แบบย่อย</div>
              <div className="col-full">
                <label style={lbl}>ชื่อแม่แบบย่อย *</label>
                <input aria-label="ชื่อแม่แบบย่อย" style={inp} value={subForm.name} autoFocus
                  onChange={e => { setSubForm(f => ({ ...f, name: e.target.value })); if (subErr) setSubErr(""); }} />
              </div>
              <div className="col-full">
                <label style={lbl}>รูปแม่แบบย่อย</label>
                <ImageUpload value={subForm.image} onChange={v => setSubForm(f => ({ ...f, image: v }))} />
              </div>
              <div className="col-full">
                <label style={lbl}>ราคากลางของแม่แบบย่อยนี้</label>
                <input aria-label="ราคากลางของแม่แบบย่อยนี้" style={inp} type="text" inputMode="decimal"
                  value={formatMoneyInput(subForm.price)}
                  placeholder={editSub.parent.price > 0 ? formatMoneyInput(String(editSub.parent.price)) : "ราคาแม่แบบหลัก"}
                  onChange={e => { setSubForm(f => ({ ...f, price: e.target.value.replace(/,/g, "") })); if (subErr) setSubErr(""); }} />
              </div>

              <div className="form-section">แบบแปลน</div>
              <div className="col-full">
                <PlansEditor value={subForm.plans} onChange={next => setSubForm(f => ({ ...f, plans: next }))} />
              </div>

              {subErr && <div className="col-full" role="alert" style={{ fontSize: "0.74rem", color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 10px" }}>{subErr}</div>}
            </div>
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, background: "#fafbfc", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
              <button className="btn btn-secondary btn-md" onClick={() => setEditSub(null)}>ยกเลิก</button>
              <button className="btn btn-primary btn-md" onClick={saveEditSub}><Check size={14} /> บันทึก</button>
            </div>
          </ModalCard>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {delTarget && (
        <div onClick={() => setDelTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(45,45,45,.5)", zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <ModalCard onClose={() => setDelTarget(null)} label="ยืนยันการลบแม่แบบ" style={{ width: "100%", maxWidth: 360, background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,.25)" }}>
            <div style={{ padding: "22px 22px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 38, height: 38, borderRadius: "50%", background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Trash2 size={17} color="#dc2626" /></span>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: STEEL }}>ลบแม่แบบ</div>
              </div>
              <p style={{ fontSize: "0.8rem", color: MUTED, lineHeight: 1.6, margin: 0 }}>ต้องการลบ <strong style={{ color: STEEL }}>{delTarget.name}</strong>? ดีลเลอร์จะไม่เห็นแม่แบบนี้อีก</p>
            </div>
            <div style={{ padding: "14px 22px", borderTop: `1px solid ${BORDER}`, background: "#fafafa", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-secondary btn-md" onClick={() => setDelTarget(null)}>ยกเลิก</button>
              <button className="btn btn-md" style={{ background: "#dc2626", color: "#fff", border: "none" }} onClick={deleteProduct}><Trash2 size={13} /> ลบ</button>
            </div>
          </ModalCard>
        </div>
      )}
    </div>
  );
}
