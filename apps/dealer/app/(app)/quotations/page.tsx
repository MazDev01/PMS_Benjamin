"use client";

import { quoteExpiryISO } from "@pms/shared/lib/quoteExpiry";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { SortableTh } from "@pms/shared/components/ui/SortableTh";
import { useRouter } from "next/navigation";
import { ยืนยัน, แจ้งพลาด, แจ้งสำเร็จ } from "@pms/shared/components/ui/ConfirmToast";
import {
  quotationStatusLabel, quotationStatusColor,
  DEFAULT_ISSUER, DEFAULT_DEALER_CODE,
  negotiationSummary, OTHER_REASON_OPTION,
  type QuotationStatus, type QuotationMock, type CustomerRow, type IssuerProfile, type QuoteLineItem,
} from "@pms/shared/lib/mock";
import { HqMarkupEditor } from "@pms/shared/components/ui/HqMarkupEditor";
import { quoteRequests as quoteRequestsRepo } from "@pms/shared/lib/data";
import type { HqQuote } from "@pms/shared/lib/quoteRequests";
import { boqLineItems, boqSubtotal } from "@pms/shared/lib/boq";
import { คิดภาษีใบเสนอราคา, ช่องภาษีสำหรับบันทึก } from "@pms/shared/lib/quoteTax";
import { AssigneeAvatars, PersonPicker } from "@pms/shared/components/ui/PersonPicker";
import { buildQuotationHTML, DEFAULT_DOC, type DocProfile } from "@pms/shared/lib/quotationPrint";
import { useDealerSettings, useDealerVat, useDealerWht } from "@pms/shared/lib/useDealerSettings";
import { useSales } from "@pms/shared/context/SalesContext";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import { useLostReasons } from "@pms/shared/lib/useHQConfig";
import { useQuoteValidity } from "@pms/shared/lib/useQuoteValidity";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { useFilters, FilterProvider, APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { FilterRow, FilterSelect } from "@pms/shared/components/filters/FilterRow";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useTableLayout, type Col } from "@pms/shared/components/ui/TableTools";
import { fmtFull as fmtMoney, fmtFullRounded as fmtBaht } from "@pms/shared/lib/format";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import {
  X, FileText, LayoutList, LayoutGrid,
  Edit2, Trash2, ChevronUp, ChevronDown, Printer, Eye,
  ExternalLink, ArrowRight, ChevronLeft, ChevronRight,
  Send, Coins, MapPin, Package, Layers, Check, Lock, History,
} from "lucide-react";

// ── Tokens ────────────────────────────────────────────────────
const PRIMARY = "#003366";
const STEEL   = "#2D2D2D";
const BORDER  = "#e5e7eb";
const MUTED   = "#6b7280";
const CARD: React.CSSProperties = { background:"#fff", borderRadius:16, border:`1px solid ${BORDER}`, boxShadow:"0 2px 14px rgba(0,51,102,.07)" };

// ── Quotation workflow (Dealer self-serve — ไม่มีขั้นตอนขออนุมัติจาก HQ) ──────
// Sales (Dealer): draft → sent_to_client → won / lost / expired
// หลังปิดการขาย (won) ถือว่าจบงานฝั่งดีลเลอร์ — บันทึกเข้า HQ อัตโนมัติ
const STATUS_ORDER: QuotationStatus[] = ["draft","sent_to_client","won","lost","expired"];

const PAGE_SIZE = 10;
// เหตุผล "ลูกค้าปฏิเสธ" มาจากรายการที่ HQ กำหนดเท่านั้น (useLostReasons) — ถ้าเหตุผลจริงไม่ตรงกับ
// รายการนั้นเลย ต้องมีทางกรอกเอง (บอสสั่ง 31 ก.ค. 69) sentinel นี้ใช้เฉพาะสลับโหมดปุ่ม → ช่องพิมพ์
// ไม่เคยถูกบันทึกลง DB จริง
const OTHER_REASON = "__OTHER__";

const STATUS_ACTIONS: Record<QuotationStatus,{label:string;next:QuotationStatus;bg:string;color:string}[]> = {
  draft:          [
    {label:"ส่งใบเสนอราคา", next:"sent_to_client", bg:"#dce5f0", color:PRIMARY},
  ],
  sent_to_client: [
    {label:"ลูกค้าตอบรับ ✓", next:"won",  bg:"#e5faf0", color:"#059669"},
    {label:"ลูกค้าปฏิเสธ",     next:"lost", bg:"#fee2e2", color:"#dc2626"},
    {label:"หมดอายุ",                       next:"expired", bg:"#f0f0f5", color:"#6b7280"},
  ],
  // สถานะ "viewed" (เปิดอ่านแล้ว) ถูกลบทั้งฟีเจอร์ — เส้นทางเดิม ส่งแล้ว→เปิดอ่าน→ตอบรับ/ปฏิเสธ
  // ตอนนี้ยุบเหลือ ส่งแล้ว→ตอบรับ/ปฏิเสธ/หมดอายุ (อยู่ในบล็อก sent_to_client ข้างบนแล้ว)
  won:      [],
  // ปฏิเสธ/หมดอายุ = จบแล้ว · ต้องการราคาใหม่ให้ขอราคาจาก HQ ใหม่ (ลบ "เปิดร่างใหม่" ของ Flow เก่า 16 ต.ค. 69)
  lost:     [],
  expired:  [],
};

// statusOptions สำหรับ FilterBar กลาง — value = enum key, label = ไทยจาก quotationStatusLabel
const Q_STATUS_OPTIONS = STATUS_ORDER.map(s => ({ value: s, label: quotationStatusLabel[s] }));

// คอลัมน์ที่ซ่อน/แสดงได้ในตารางรายการ (เลขที่ + ลูกค้า + สถานะ + การกระทำ = คงที่เสมอ)
const COLS: Col[] = [
  { key: "project", label: "โครงการ" },
  { key: "owner",   label: "ผู้รับผิดชอบ" },
  { key: "value",   label: "มูลค่า" },
  { key: "created", label: "วันที่สร้าง" },
  { key: "expiry",  label: "หมดอายุ" },
];

// ── Types ─────────────────────────────────────────────────────
type SortKey = "id"|"customer"|"project"|"totalValue"|"date"|"status";
// ใบที่สร้างล่าสุดก่อน: เวลาบันทึกจริง (savedAt = created_at) → ถ้าไม่มี ใช้เลขที่ใบ (รันต่อกันตามลำดับที่ออก)
function ใหม่ก่อน(a: QuotationMock, b: QuotationMock): number {
  const ta = a.savedAt ? Date.parse(a.savedAt) : NaN, tb = b.savedAt ? Date.parse(b.savedAt) : NaN;
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
  return b.id.localeCompare(a.id, "en", { numeric: true });
}
type SortDir = "asc"|"desc";
type QForm = {
  customerId:number; customer:string;
  project:string; projectId:number;
  province:string; area:number;
  materialCost:number;
  status:QuotationStatus; date:string; items:number;
  lineItems:QuoteLineItem[];
  revision:string; expiry:string;
  // ภาษีของใบนี้ (บอสสั่ง 28 ส.ค. 69) — ติ๊กเปิด/ปิดและแก้อัตราได้ · เก็บเป็นสแนปช็อตติดใบ
  vatOn:boolean; vatPct:string; whtOn:boolean; whtPct:string;
  // ผู้รับผิดชอบ — ไม่ใช่ฟิลด์ของใบเสนอราคา (QuotationMock ไม่มี) เป็นของลูกค้าที่ผูกอยู่
  // บอสสั่งให้แก้ในหน้านี้ได้ → ตอนบันทึกจะเขียนกลับไปที่ตัวลูกค้า (updateCustomer) ไม่ได้เก็บลงใบ
  owner:string;
};

// แม่แบบ = แคตตาล็อกกลาง (useMasterCatalog ในคอมโพเนนต์)

// ── Dealer identity — ใบเสนอราคาออกในนามบริษัทของดีลเลอร์เอง (ไม่ใช่เบญจมินทร์) ──
// ค่าเริ่มต้น + คีย์ = แหล่งเดียวใน mock (DEFAULT_ISSUER/ISSUER_KEY) ใช้ร่วมกับใบเสนอราคา inline
type Issuer = IssuerProfile;
// ตรา/ลายเซ็น/VAT/prefix มาจาก quotationPrint (DocProfile/DEFAULT_DOC/DOC_KEY) — แหล่งเดียวร่วมกับใบเสนอ inline

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(d:string){ if(!d||d==="—") return "—"; const [y,m,day]=d.split("-"); const mo=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]; return `${parseInt(day)} ${mo[parseInt(m)-1]} ${parseInt(y)+543}`; }
// วัน+เวลาของรอบต่อรอง — ฐานข้อมูลส่งมาเป็นเวลาไทยแล้ว ("2026-08-19T14:05:00") แสดงตรง ๆ ไม่แปลงโซนซ้ำ
function fmtStamp(s:string){
  const m=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s||"");
  if(!m) return s||"—";
  return `${fmtDate(`${m[1]}-${m[2]}-${m[3]}`)} ${m[4]}:${m[5]}`;
}
// วันที่แบบสั้น (ไม่มีปี พ.ศ.) — ใช้เฉพาะในตาราง ตามรูปแบบที่บอสกำหนดมา ("28 มิ.ย." / "28 ก.ค.")
// ทำให้ 9 คอลัมน์พอดีกรอบโดยไม่ต้องเลื่อนแนวนอน · แผงรายละเอียด/เอกสารพิมพ์ยังใช้วันที่เต็มมีปี
function fmtDateShort(d:string){ if(!d||d==="—") return "—"; const [,m,day]=d.split("-"); const mo=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]; return `${parseInt(day)} ${mo[parseInt(m)-1]}`; }
// วันหมดอายุที่ใช้แสดงผล — ใบที่กรอกวันเองใช้ค่านั้น · ใบที่ไม่ได้กรอก (11 จาก 17 ใบใน seed)
// คำนวณจาก วันที่สร้าง + อายุใบเสนอราคา (ของสาขา ถ้าไม่ได้ตั้งค่อยใช้ของ HQ — ดู useQuoteValidity)
// ไม่ใช่การเดา — "อายุใบเสนอราคา" เป็นนโยบายจริงในหน้าตั้งค่า และเป็นกฎที่ใช้ตอนสร้างใบใหม่อยู่แล้ว
// validityDays ส่งเข้ามาจากหน้าจอ (useQuoteValidity) — ห้ามอ่าน localStorage ตรงนี้
// เพราะโหมด supabase ค่าจริงอยู่ใน DB ที่ HQ ตั้งไว้ ไม่ใช่ค่า default ในเครื่อง
// ตัวคำนวณย้ายไปที่ lib/quoteExpiry.ts — กระดิ่งแจ้งเตือนใช้ตัวเดียวกัน วันหมดอายุจะได้ตรงกันทุกจุด
const expiryOf = quoteExpiryISO;
// (nextQId ถูกลบ — เดิมแอปมีตัวออกเลขสองระบบที่ให้คำตอบคนละชุด:
//  หน้านี้นับจากแถวที่โหลดมา + ค่าตั้งต้นใน localStorage → Q-2026-1101
//  ส่วนแผงใบเสนอราคาในหน้าลูกค้าเป้าหมายใช้ newQuoteId() = RPC ของ DB → Q-2026-0001
//  ออกใบจากคนละหน้าจึงได้เลขคนละชุด และชนกันเองได้ · ตอนนี้เหลือทางเดียวคือ newQuoteId())
// ── Add / Edit Modal ──────────────────────────────────────────
// ชื่อโครงการแนะนำจากลูกค้า = ชื่อบริษัท · แก้ได้ (ไม่ประกอบจากแม่แบบแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
function suggestProject(c?:CustomerRow):string{
  return c ? c.company : "";
}

function QuotationModal({ initial, title, onSave, onClose, customers, quoteId, hqQuoteId, locked }:{
  initial:QForm; title:string; onSave:(f:QForm)=>void|Promise<void>; onClose:()=>void; customers:CustomerRow[];
  /** ใบที่ทำจากใบ HQ (ด่าน 3) — รายการ/จำนวนล็อก แก้ได้เฉพาะ % ที่บวก · ใบเดิมที่ไม่มีใบ HQ แก้ไม่ได้ (ไม่เปิดฟอร์มนี้) */
  hqQuoteId?:number|null;
  /** ลูกค้าตอบรับและสั่งผลิตแล้ว — ราคาถูกล็อกที่ฐานข้อมูล (ใบ 0201) */
  locked?:boolean;
  quoteId?:string; // เลขที่ใบ — โชว์อย่างเดียว แก้ไม่ได้ (HQ กำหนดรูปแบบ/เลขรัน)
}){
  const [form,setForm]=useState<QForm>(initial);
  const [ใบHQ,setใบHQ]=useState<HqQuote|null>(null);
  useEffect(()=>{
    if(!hqQuoteId) return;
    let alive=true;
    quoteRequestsRepo.hqQuoteById(hqQuoteId).then(h=>{ if(alive) setใบHQ(h); }).catch(()=>{ /* ขึ้น "กำลังโหลดใบ HQ" ค้างไว้ — บันทึกไม่ได้ */ });
    return ()=>{ alive=false; };
  },[hqQuoteId]);
  const [busy,setBusy]=useState(false); // กันกดบันทึกซ้ำ + รอออกเลขที่ใบจาก DB (H8)
  const INP:React.CSSProperties={width:"100%",border:`1px solid ${BORDER}`,borderRadius:9,padding:"8px 12px",fontSize:"0.8rem",outline:"none",color:STEEL,boxSizing:"border-box"};
  const LBL:React.CSSProperties={fontSize:"0.65rem",fontWeight:700,color:MUTED,display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.04em"};
  function set<K extends keyof QForm>(k:K,v:QForm[K]){setForm(p=>({...p,[k]:v}));}
  const total=form.lineItems.reduce((s,it)=>s+it.qty*it.unitPrice,0); // = Σ รายการ (BOQ)
  // ── กันออกใบที่บันทึกไม่ได้ พร้อมบอกต้นเหตุจริง (บอสแจ้ง 19 ส.ค. 69) ──
  //   ฐานข้อมูลปฏิเสธใบที่ไม่มีรายการอยู่แล้ว (ใบ 0073) แต่ฟอร์มนี้ไม่ได้กันไว้
  //   ดีลเลอร์จึงกดบันทึกแล้วเจอข้อความของฐานข้อมูลดิบ ๆ แทนที่จะรู้ว่าติดตรงไหน
  //   และต้นเหตุที่พบจริงคือสำนักงานใหญ่ยังไม่ได้ตั้งแม่แบบ/ราคา ซึ่งดีลเลอร์แก้เองไม่ได้
  const เหตุที่บันทึกไม่ได้=
    !ใบHQ ? "กำลังโหลดใบ HQ — รอสักครู่"
    : form.lineItems.length===0 ? "ต้องมีรายการสินค้าอย่างน้อย 1 รายการก่อนบันทึก"
    : total<=0 ? "ยอดรวมเป็น ฿0 — ระบุจำนวนและราคาต่อหน่วยก่อนออกใบ"
    : !form.customer ? "ต้องระบุลูกค้าก่อนบันทึก"
    : !form.project ? "ต้องระบุชื่องานก่อนบันทึก"
    : "";
  function pickCustomer(id:number){
    const c=customers.find(c=>c.id===id);
    // เลือก "ยังไม่ระบุลูกค้า" กลับมา ต้องล้างของเดิมออกจริง — เดิม return เฉย ๆ ค่าเก่าจึงค้างอยู่
    // ช่องโชว์ "ยังไม่ระบุ" แต่ในระบบยังผูกกับลูกค้ารายก่อนหน้า = ใบไปออกให้ผิดคนโดยไม่มีใครเห็น
    if(!c){ setForm(p=>({...p,customerId:0,customer:""})); return; }
    // prefill ทุกช่องที่ดึงจากลูกค้าได้: จังหวัด · ชื่อโครงการ (แนะนำ แก้ได้) — ไม่หยิบแม่แบบ (category) แล้ว เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
    // ผู้รับผิดชอบตามลูกค้าที่เลือก (ดึงมาโชว์ให้ตรงกับตาราง — แก้ต่อได้)
    setForm(p=>({...p,customerId:c.id,customer:c.company,province:c.province||p.province,project:suggestProject(c),owner:c.owner??""}));
  }
  async function submit(){
    if(เหตุที่บันทึกไม่ได้||busy)return;
    setBusy(true);
    // await ให้ออกเลข+บันทึกเสร็จก่อนปิด — ปิดทันทีแบบเดิมทำให้กดซ้ำได้ระหว่างรอเลขจาก DB
    try { await onSave({...form, items:form.lineItems.length, materialCost:total}); onClose(); }
    finally { setBusy(false); }
  }
  return (
    <>
      <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.4)",zIndex:200}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"fixed",inset:0,zIndex:210,display:"flex",alignItems:"center",justifyContent:"center",padding:20,pointerEvents:"none"}}>
        <div style={{...CARD,width:"100%",maxWidth:580,pointerEvents:"auto",overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.2)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 22px",borderBottom:`1px solid ${BORDER}`,background:PRIMARY}}>
            <div style={{fontSize:"0.92rem",fontWeight:800,color:"#fff"}}>{title}</div>
            <button onClick={onClose} style={{width:28,height:28,borderRadius:8,border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={13}/></button>
          </div>
          <div className="form-grid" style={{padding:"20px 22px",overflowY:"auto",maxHeight:"68vh"}}>
            <div className="form-section">ลูกค้า</div>
            {/* เลขที่ — โชว์อย่างเดียวตามที่บอสสั่ง (HQ กำหนดรูปแบบ ดีลเลอร์แก้ไม่ได้) */}
            {quoteId && (
              <div className="col-full">
                <label style={LBL}>เลขที่</label>
                <div style={{...INP,background:"#f4f6f9",color:MUTED,fontFamily:"monospace",fontWeight:700,display:"flex",alignItems:"center",gap:7}}>
                  <Lock size={11}/> {quoteId}
                  <span style={{marginLeft:"auto",fontSize:"0.62rem",fontWeight:400}}>สำนักงานใหญ่กำหนด</span>
                </div>
              </div>
            )}
            {/* Customer */}
            <div className="col-full">
              <label style={LBL}>ลูกค้า *</label>
              {/* ตัวเลือก "ยังไม่ระบุ" ต้องอยู่บนสุดเสมอ — เดิมอยู่ล่างสุด ช่องจึงโชว์ลูกค้ารายแรกในทะเบียน
                  ทั้งที่ยังไม่มีใครเลือก เผลอกดผ่านแล้วใบเสนอราคาไปผูกกับลูกค้าผิดคน */}
              {/* ตัวเลือกแรกคือทั้งหมด — value={0} คือ "ยังไม่ระบุลูกค้า (พิมพ์เอง)" */}
              <select aria-label="ลูกค้า" value={form.customerId} onChange={e=>pickCustomer(Number(e.target.value))} style={INP}>
                <option value={0}>— ยังไม่ระบุลูกค้า (พิมพ์เอง) —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}
              </select>
              {form.customerId===0&&<input value={form.customer} onChange={e=>set("customer",e.target.value)} placeholder="ชื่อบริษัท..." style={{...INP,marginTop:6}}/>}
            </div>
            {/* ผู้รับผิดชอบ — เป็นข้อมูลของ "ลูกค้า" ไม่ใช่ของใบเสนอราคา
                บอสสั่งให้แก้ที่นี่ได้ → บันทึกแล้วจะไปเปลี่ยนที่ตัวลูกค้า (มีผลกับใบอื่นของลูกค้าคนนี้ด้วย) */}
            <div className="col-full">
              <label style={LBL}>ผู้รับผิดชอบ</label>
              <PersonPicker value={form.owner} onChange={v=>set("owner",v)} multiple />
              <div style={{fontSize:"0.62rem",color:MUTED,marginTop:5,display:"flex",alignItems:"center",gap:4}}>
                <Lock size={9}/> {form.customerId
                  ? "เป็นผู้รับผิดชอบของลูกค้า — แก้แล้วมีผลกับใบเสนอราคาอื่นของลูกค้ารายนี้ด้วย"
                  : "ใบนี้ยังผูกกับลูกค้าเป้าหมาย — แก้แล้วจะไปเปลี่ยนผู้รับผิดชอบที่ลูกค้าเป้าหมาย"}
              </div>
            </div>
            {/* Project */}
            <div className="form-section">โครงการ</div>
            <div className="col-full">
              <label style={LBL}>ชื่อโครงการ *</label>
              <input value={form.project} onChange={e=>set("project",e.target.value)} placeholder="เช่น โกดังสินค้า ABC" style={INP}/>
            </div>
            <div>
              <label style={LBL}>จังหวัด</label>
              <input value={form.province} onChange={e=>set("province",e.target.value)} placeholder="จังหวัด" style={INP}/>
            </div>
            <div>
              <label style={LBL}>พื้นที่ (ตร.ม.)</label>
              <input type="number" value={form.area||""} onChange={e=>set("area",Number(e.target.value))} placeholder="0" style={INP}/>
            </div>
            {/* ช่อง "ประเภท" (แม่แบบ) เอาออกแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 */}
            {/* รายการสินค้า — มาจากใบ HQ เท่านั้น แก้ได้เฉพาะ % ที่บวก */}
            <div className="form-section">รายการสินค้า</div>
            <div className="col-full">{ใบHQ
              ? <HqMarkupEditor hqLines={ใบHQ.lineItems} items={form.lineItems} readOnly={locked}
                  onChange={li=>setForm(p=>({...p,lineItems:li}))} />
              : <div style={{color:MUTED,fontSize:"0.78rem",padding:12}}>กำลังโหลดใบ HQ…</div>}</div>
            {/* ── ภาษีของใบนี้ + ยอดสรุปสด (บอสสั่ง 28 ส.ค. 69) ────────────────────
                 ⚠️ "มูลค่างาน" คือยอดที่บันทึกเป็นยอดขาย — ภาษีไม่ไปแตะตัวนี้ */}
            <div className="col-full" style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {([
                {on:"vatOn",pct:"vatPct",ป้าย:"ภาษีมูลค่าเพิ่ม (VAT)"},
                {on:"whtOn",pct:"whtPct",ป้าย:"ภาษีหัก ณ ที่จ่าย"},
              ] as const).map(t=>{
                const เปิด=form[t.on] as boolean;
                return (
                  <label key={t.on} style={{flex:"1 1 220px",display:"flex",alignItems:"center",gap:9,padding:"9px 11px",
                    border:`1px solid ${เปิด?PRIMARY:"#e5e7eb"}`,borderRadius:10,background:เปิด?"#f4f8fc":"#fff",cursor:"pointer"}}>
                    <input type="checkbox" checked={เปิด} onChange={e=>set(t.on,e.target.checked)} style={{width:16,height:16,cursor:"pointer"}}/>
                    <span style={{flex:1,fontSize:"0.78rem",fontWeight:700,color:"#2D2D2D"}}>{t.ป้าย}</span>
                    <input type="text" inputMode="decimal" aria-label={`อัตรา${t.ป้าย}`} disabled={!เปิด}
                      value={form[t.pct] as string} onClick={e=>e.stopPropagation()}
                      onChange={e=>set(t.pct,e.target.value.replace(/[^0-9.]/g,""))}
                      style={{width:50,textAlign:"right",padding:"5px 7px",borderRadius:8,border:"1px solid #e5e7eb",
                        fontFamily:"inherit",fontSize:"0.8rem",fontWeight:700,color:เปิด?"#2D2D2D":"#b7bec7",background:เปิด?"#fff":"#f8fafc"}}/>
                    <span style={{fontSize:"0.78rem",fontWeight:700,color:MUTED}}>%</span>
                  </label>
                );
              })}
            </div>
            {/* Total preview — จัดเป็นตาราง ป้าย | เครื่องหมาย | จำนวนเงิน
                 ตัวเลขใช้ความกว้างเท่ากันทุกหลัก (tabular-nums) และเครื่องหมาย +/− อยู่คนละช่อง
                 หลักตัวเลขจึงตรงกันทุกแถว (ผู้ใช้แจ้ง 28 ส.ค. 69 ว่าเรียงไม่ตรง) */}
            {total>0&&(()=>{
              const ภ=คิดภาษีใบเสนอราคา(total,{vatPercent:form.vatOn?Number(form.vatPct):0,whtPercent:form.whtOn?Number(form.whtPct):0});
              const แถว=(ป้าย:string,ค่า:number,o?:{sign?:string;เด่น?:boolean;สี?:string})=>(
                <>
                  <span style={{fontSize:o?.เด่น?"0.82rem":"0.74rem",fontWeight:o?.เด่น?800:600,color:o?.สี??(o?.เด่น?PRIMARY:MUTED),whiteSpace:"nowrap"}}>{ป้าย}</span>
                  <span style={{textAlign:"right",fontSize:"0.74rem",fontWeight:700,color:o?.สี??MUTED}}>{o?.sign??""}</span>
                  <span style={{textAlign:"right",fontVariantNumeric:"tabular-nums",fontSize:o?.เด่น?"0.92rem":"0.78rem",fontWeight:o?.เด่น?800:700,color:o?.สี??PRIMARY}}>{fmtMoney(ค่า)}</span>
                </>
              );
              const เส้น=(หนา?:boolean)=>(<span style={{gridColumn:"1 / -1",height:1,background:หนา?"#b9c7d9":"#c9d4e2",margin:หนา?"6px 0 2px":"4px 0"}}/>);
              return (
                <div className="col-full" style={{padding:"12px 14px",background:"#dce5f0",borderRadius:10,
                  display:"grid",gridTemplateColumns:"1fr 12px auto",alignItems:"baseline",columnGap:6,rowGap:4}}>
                  {แถว("มูลค่างาน (ยอดที่บันทึกเป็นยอดขาย)",ภ.subtotal)}
                  {เส้น()}
                  {form.vatOn&&แถว(`ภาษีมูลค่าเพิ่ม ${ภ.vatRate}%`,ภ.vatAmount,{sign:"+"})}
                  {แถว("รวมเป็นเงิน",ภ.totalAmount)}
                  {form.whtOn&&แถว(`หัก ณ ที่จ่าย ${ภ.whtRate}%`,ภ.whtAmount,{sign:"−",สี:"#b45309"})}
                  {เส้น(true)}
                  {แถว("ยอดชำระสุทธิ",ภ.netPayable,{เด่น:true})}
                </div>
              );
            })()}

            <div className="form-section">สถานะและกำหนดเวลา</div>
              <div className="col-full">
                <label style={LBL}>สถานะ</label>
                {/* "ปิดการขายสำเร็จ" ตั้งจากที่นี่ตรงๆ ไม่ได้ — ต้องผ่านปุ่ม "ลูกค้าตอบรับ ✓" เท่านั้น
                    เพราะขั้นตอนนั้นสร้าง/ผูกลูกค้าให้ก่อนเสมอ · ฟอร์มนี้เขียนแค่ฟิลด์ตรงๆ ไม่ผ่านขั้นตอนนั้น
                    (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69 — เดิมตั้ง won ที่นี่ได้ โหมดออฟไลน์จะได้ใบ
                    "ปิดการขายสำเร็จ" ที่ไม่มีลูกค้าผูกอยู่จริงแบบเงียบๆ) */}
                {/* ต้องมีค่าเสมอ — ทุกใบต้องมีสถานะ (ร่าง/ส่งแล้ว/…) ว่างไม่ได้ */}
                <select aria-label="สถานะใบเสนอราคา" value={form.status} onChange={e=>set("status",e.target.value as QuotationStatus)} style={INP}>
                  {STATUS_ORDER.filter(s=>s!=="won"||form.status==="won").map(s=><option key={s} value={s}>{quotationStatusLabel[s]}</option>)}
                </select>
                {form.status!=="won" && <div style={{fontSize:"0.62rem",color:MUTED,marginTop:5,display:"flex",alignItems:"center",gap:4}}>
                  <Lock size={9}/> ปิดการขายสำเร็จ ให้กดปุ่ม &quot;ลูกค้าตอบรับ ✓&quot; ที่รายการใบเสนอราคาแทน
                </div>}
              </div>
              <div>
                <label style={LBL}>วันที่</label>
                <input type="date" value={form.date} onChange={e=>set("date",e.target.value)} style={INP}/>
              </div>
              <div>
                <label style={LBL}>วันหมดอายุ</label>
                <input type="date" value={form.expiry} onChange={e=>set("expiry",e.target.value)} style={INP}/>
              </div>
          </div>
          <div style={{padding:"13px 22px",borderTop:`1px solid ${BORDER}`,display:"flex",gap:8,justifyContent:"flex-end",background:"#fafafa"}}>
            <button onClick={onClose} className="btn btn-secondary btn-md">ยกเลิก</button>
            {!!เหตุที่บันทึกไม่ได้&&<div style={{marginRight:"auto",color:"#dc2626",fontSize:"0.7rem",fontWeight:600,lineHeight:1.5,maxWidth:340}}>{เหตุที่บันทึกไม่ได้}</div>}
            <button onClick={()=>void submit()} disabled={busy||!!เหตุที่บันทึกไม่ได้} className="btn btn-primary btn-md" style={(busy||เหตุที่บันทึกไม่ได้)?{opacity:.6,cursor:"not-allowed"}:undefined}>{busy?"กำลังบันทึก…":"บันทึก"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Pagination bar (CI-styled) ────────────────────────────────
function PaginationBar({ from, to, total, page, totalPages, onPrev, onNext }:{
  from:number; to:number; total:number; page:number; totalPages:number;
  onPrev:()=>void; onNext:()=>void;
}){
  const atFirst = page<=1;
  const atLast  = page>=totalPages;
  const navBtn=(disabled:boolean):React.CSSProperties=>({
    display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:8,
    border:`1px solid ${disabled?BORDER:PRIMARY}`,
    background:disabled?"#f3f4f6":"#fff",
    // #6b7280 (MUTED มาตรฐาน) แทน #9ca3af เดิม — contrast ต่ำกว่า WCAG AA (พบจาก /scenario 31 ก.ค. 69)
    color:disabled?"#6b7280":PRIMARY,
    fontSize:"0.72rem",fontWeight:700,cursor:disabled?"default":"pointer",
    opacity:disabled?0.7:1,transition:"all .15s",
  });
  return (
    <div style={{padding:"10px 16px",borderTop:`1px solid ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
      <span style={{fontSize:"0.72rem",color:MUTED}}>แสดง {from}–{to} จาก {total} รายการ</span>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button onClick={onPrev} disabled={atFirst} style={navBtn(atFirst)}>
          <ChevronLeft size={13}/> ก่อนหน้า
        </button>
        <span style={{fontSize:"0.72rem",color:STEEL,fontWeight:700}}>หน้า {page} / {totalPages}</span>
        <button onClick={onNext} disabled={atLast} style={navBtn(atLast)}>
          ถัดไป <ChevronRight size={13}/>
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
// ห่อด้วย FilterProvider ของหน้านี้เอง → ช่วงเวลาแยกอิสระจากหน้าอื่น
export default function QuotationsPage(){
  return (
    <FilterProvider>
      <QuotationsPageInner />
    </FilterProvider>
  );
}

function QuotationsPageInner(){
  const router = useRouter();
  const { passes } = useFilters(); // timeRange ใช้แค่ในคำโปรยหัวหน้า ซึ่งถูกเอาออกแล้ว
  // ค่าคุมจาก HQ (อ่านผ่าน repo · อัปเดตตามเมื่อ HQ แก้) — อายุใบมีผลกับการคิดวันหมดอายุ
  const lostReasons = useLostReasons(); // เหตุผลปิดไม่สำเร็จที่ HQ กำหนด (ชุดเดียวกับที่ลูกค้าเป้าหมายใช้)
  const dealerCfg = useDealerSettings(); // หัวกระดาษ/ตั้งค่าเอกสารของสาขา (ผ่าน repo)
  const dealerVat = useDealerVat();
  const dealerWht = useDealerWht();   // อัตราหัก ณ ที่จ่ายตั้งต้นของสาขา      // % VAT ที่สาขาตั้งเอง — ค่าสำรองของใบที่ไม่มีสแนปช็อต
  // อายุใบของ "สาขา" มาก่อนนโยบายเครือ (บอสสั่ง 20 ส.ค. 69) — สาขาตั้งไว้เท่าไรต้องใช้ค่านั้นจริง
  const validityDays = useQuoteValidity();
  const {
    quotations: allQuotationsRaw, customers: allCustomersRaw, leads: allLeads,
    updateQuotation, deleteQuotation: ctxDeleteQuotation, setQuotationStatus,
    updateCustomer, บันทึกลีด,
  } = useSales();
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน (multi-tenant)
  // scope ทุกอย่างเป็นของสาขาที่ล็อกอิน — RYG ไม่เห็นใบ/ลูกค้า/ลูกค้าเป้าหมายของ CNX (undefined = ของ CNX)
  // (ลูกค้าเป้าหมาย lookup ผู้รับผิดชอบด้วยชื่อบริษัท — ถ้าไม่กรอง ownerOf/saveQ ไปเจอ+เขียนทับลูกค้าเป้าหมายสาขาอื่นชื่อซ้ำ)
  const data = useMemo(() => allQuotationsRaw.filter(q => (q.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code), [allQuotationsRaw, currentDealer.code]);
  const customers = useMemo(() => allCustomersRaw.filter(c => (c.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code), [allCustomersRaw, currentDealer.code]);
  const leads = useMemo(
    () => allLeads.filter(l => (l.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code),
    [allLeads, currentDealer.code],
  );
  const [query, setQuery]           = useState("");
  const [filterStatus, setFilterStatus] = useState<QuotationStatus|"ALL">("ALL");
  // ตัวกรองในแถบ FilterRow — ตัวเลือกสร้างจากใบเสนอราคาจริงที่มีอยู่
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [provFilter, setProvFilter]   = useState("ALL");
  const [view, setView]             = useState<"list"|"card">("list");
  const savingQRef = useRef(false); // กันกดบันทึกใบซ้ำระหว่างรอเลขที่ใบจาก DB (H8)
  // ค่าเริ่มต้น = ไม่เลือกคอลัมน์ → ใบที่สร้างล่าสุดขึ้นก่อน · บอสสั่ง 21 ก.ย. 69 ทุกตาราง
  // ⚠️ ห้ามเรียงด้วย date — ค่านี้ถูกตั้งใหม่ทุกครั้งที่กดส่ง ใบเก่าที่เพิ่งส่งจะเด้งขึ้นบนสุด
  const [sortKey, setSortKey]       = useState<SortKey|null>(null);
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const [page, setPage]             = useState(1);
  const [selected, setSelected]     = useState<QuotationMock|null>(null);
  // เปิดใบตรงจากลิงก์ /quotations?open=<เลขใบ> — ปุ่ม "ขั้นต่อไป" ในแผงลูกค้าเป้าหมายพามา (ส่งให้ลูกค้า / บันทึกผล)
  //   รอข้อมูลโหลดก่อน · เปิดครั้งเดียวต่อการเข้าหน้า
  const เปิดจากลิงก์ = useRef(false);
  const [showModal, setShowModal]   = useState(false);
  const [editingQ, setEditingQ]     = useState<QuotationMock|null>(null);
  // ใบที่กำลังจะลบ — เก็บ "ตัวใบ" ไม่ใช่ boolean เพราะลบได้จากรายการโดยไม่ต้องเปิดแผงรายละเอียด
  const [delTarget, setDelTarget]   = useState<QuotationMock|null>(null);
  const [detailTab, setDetailTab]   = useState<"info"|"customer"|"lead">("info");
  const [issuer, setIssuer]         = useState<Issuer>(DEFAULT_ISSUER);
  const [docProfile, setDocProfile] = useState<DocProfile>(DEFAULT_DOC);
  const [toast, setToast]           = useState<string|null>(null);
  // ลูกค้าใหม่ที่เพิ่งปิดการขาย — โชว์ปุ่มลัดพาไปหน้าลูกค้าพร้อมค้นหาให้เลย (เดิมหาไม่เจอง่าย
  // เพราะรายการลูกค้ามีแบ่งหน้า — /scenario 31 ก.ค. 69)
  const [justWonCompany, setJustWonCompany] = useState<string|null>(null);
  // Table toolbar layout — ความหนาแน่นแถว + ซ่อน/แสดงคอลัมน์ (persist ใน localStorage)
  const { density, setDensity, hiddenCols, toggleCol } = useTableLayout("quotations");

  // แสดง toast ชั่วคราวแล้วซ่อนอัตโนมัติ
  function showToast(msg:string){ setToast(msg); }
  useEffect(()=>{
    if(!toast) return;
    const t=setTimeout(()=>{ setToast(null); setJustWonCompany(null); }, justWonCompany ? 6000 : 2600);
    return ()=>clearTimeout(t);
  },[toast, justWonCompany]);


  // ผู้ออกใบเสนอราคา + ตั้งค่าเอกสาร = ของสาขา อ่านผ่าน repo (โหมด supabase เก็บที่ DB)
  // เดิมอ่าน localStorage ตรง ๆ → ล้างเบราว์เซอร์/ย้ายเครื่องแล้วหัวกระดาษหายทั้งหมด
  useEffect(() => {
    setIssuer(dealerCfg.settings.issuer);
    setDocProfile(dealerCfg.settings.document);
  }, [dealerCfg.settings]);

  function handleSort(k:SortKey){ if(sortKey===k) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(k);setSortDir("asc");} }
  const SortIcon=({k}:{k:SortKey})=>sortKey===k?(sortDir==="asc"?<ChevronUp size={10} style={{marginLeft:2}}/>:<ChevronDown size={10} style={{marginLeft:2}}/>):<ChevronDown size={10} style={{marginLeft:2,opacity:.3}}/>;

  // ── ผู้รับผิดชอบของใบเสนอราคา (แหล่งเดียว ใช้ทั้งตาราง/ฟอร์มแก้ไข/ส่งออก) ──────
  // ใบเสนอราคาไม่มีฟิลด์ผู้รับผิดชอบของตัวเอง — ต้องไปหาจากที่มา 2 ทาง:
  //   1) ลูกค้าที่ผูกอยู่ (customerId) → customer.owner  — ใบที่ปิดการขายเป็นลูกค้าแล้ว
  //   2) ลูกค้าเป้าหมายที่ยังไม่ปิด → lead.assigned              — ใบที่ออกให้ลูกค้าเป้าหมาย (customerId=0)
  // เดิมดูแต่ทาง 1 ใบที่ยังเป็นลูกค้าเป้าหมาย (7/17 ใบ) เลยขึ้น "—" ทั้งที่ลูกค้าเป้าหมายระบุผู้รับผิดชอบไว้ครบ
  // ผูกด้วย dealId ก่อน (แม่นสุด) ไม่มีค่อยเทียบชื่อบริษัท (วิธีเดียวกับที่ SalesContext ผูกย้อนหลัง)
  const ownerOf = useCallback((q:{customerId:number;customer:string;dealId?:number}):string => {
    const byCust = customers.find(c=>c.id===q.customerId)?.owner;
    if (byCust) return byCust;
    const lead = (q.dealId ? leads.find(l=>l.numId===q.dealId) : undefined)
      ?? leads.find(l=>l.company===q.customer);
    return lead?.assigned ?? "";
  },[customers,leads]);

  useEffect(()=>{
    if(เปิดจากลิงก์.current) return;
    const id=new URLSearchParams(window.location.search).get("open");
    if(!id){ เปิดจากลิงก์.current=true; return; }
    const q=data.find(x=>x.id===id);
    if(q){ setSelected(q); เปิดจากลิงก์.current=true; }
  },[data]);

  const filtered = useMemo(()=>{
    let rows=data.filter(q=>{
      const matchQ=!query||q.id.toLowerCase().includes(query.toLowerCase())||q.customer.toLowerCase().includes(query.toLowerCase())||q.project.toLowerCase().includes(query.toLowerCase())||q.province?.includes(query);
      const matchS=filterStatus==="ALL"||q.status===filterStatus;
      const matchOwner=ownerFilter==="ALL"||ownerOf(q)===ownerFilter;
      const matchProv=provFilter==="ALL"||q.province===provFilter;
      // FilterBar กลาง: ช่วงเวลา (date) + สถานะ (enum) + จังหวัด
      const matchGlobal=passes({ date:q.date, status:q.status, province:q.province });
      return matchQ&&matchS&&matchOwner&&matchProv&&matchGlobal;
    });
    if(sortKey===null) return [...rows].sort(ใหม่ก่อน);
    rows=[...rows].sort((a,b)=>{
      const va:string|number=a[sortKey] as string|number;
      const vb:string|number=b[sortKey] as string|number;
      const cmp=typeof va==="number"?(va as number)-(vb as number):(va as string).localeCompare(vb as string,"th");
      return sortDir==="asc"?cmp:-cmp;
    });
    return rows;
  },[data,query,filterStatus,ownerFilter,provFilter,sortKey,sortDir,passes,ownerOf]);

  // ตัวเลือกตัวกรอง — ดึงจากใบเสนอราคาจริง ไม่ hardcode
  const provOptions  = useMemo(()=>[...new Set(data.map(q=>q.province).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th")),[data]);
  const ownerOptions = useMemo(()=>[...new Set(data.map(q=>ownerOf(q)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th")),[data,ownerOf]);


  // ── Pagination (client-side) ──────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // clamp/reset page เมื่อค้นหา / กรองสถานะ / จัดเรียง / ชุดข้อมูลเปลี่ยน
  useEffect(()=>{ setPage(1); },[query,filterStatus,sortKey,sortDir]);
  useEffect(()=>{ setPage(p=>Math.min(p,totalPages)); },[totalPages]);
  const pageStart = (page-1)*PAGE_SIZE;
  const paged     = useMemo(()=>filtered.slice(pageStart,pageStart+PAGE_SIZE),[filtered,pageStart]);
  const rangeFrom = filtered.length===0 ? 0 : pageStart+1;
  const rangeTo   = Math.min(pageStart+PAGE_SIZE, filtered.length);

  // สรุปด้านบนนับจากชุดที่อยู่ในช่วงเวลา/จังหวัดของ FilterBar (ไม่ผูกกับ pill สถานะในเครื่อง)
  // ── ฐานของการ์ด KPI = ผ่านตัวกรองของหน้านี้ทั้งหมด ยกเว้น "สถานะ" (บอสสั่ง 20 ส.ค. 69) ──
  //   ยกเว้นสถานะเพราะการ์ด KPI เป็นตัวสลับสถานะเอง — ถ้ารวมเข้าไปด้วย พอกดกรอง "ตอบรับแล้ว"
  //   การ์ด "ปฏิเสธแล้ว" จะกลายเป็น 0 แล้วกดสลับกลับไม่ได้อีก
  //   ส่วนที่เหลือ (ค้นหา/ผู้รับผิดชอบ/จังหวัด/ช่วงเวลา) ต้องคุมการ์ดได้ทั้งหมด
  const scoped = useMemo(()=>data.filter(q=>{
    const matchQ=!query||q.id.toLowerCase().includes(query.toLowerCase())||q.customer.toLowerCase().includes(query.toLowerCase())||q.project.toLowerCase().includes(query.toLowerCase())||q.province?.includes(query);
    const matchOwner=ownerFilter==="ALL"||ownerOf(q)===ownerFilter;
    const matchProv=provFilter==="ALL"||q.province===provFilter;
    return !!matchQ&&matchOwner&&matchProv&&passes({ date:q.date, province:q.province });
  }),[data,passes,query,ownerFilter,provFilter,ownerOf]);

  // Related data for selected quotation

  // ใบเดิมที่ไม่มีใบ HQ = ดูได้อย่างเดียว (บอสสั่งลบ Flow เก่า 16 ต.ค. 69) — ไม่มีปุ่มแก้/ส่ง/ลบ/เปลี่ยนสถานะ
  const แก้ได้=(q:QuotationMock)=>!!q.hqQuoteId;
  function openEdit(q:QuotationMock){ if(!แก้ได้(q)) return; setEditingQ(q); setShowModal(true); }

  async function saveQ(form:QForm){
    if (savingQRef.current) return; // กันกดซ้ำระหว่างรอเลขที่ใบจาก DB (H8)
    savingQRef.current = true;
    try {
    // owner ไม่ใช่ฟิลด์ของใบเสนอราคา — แยกออกก่อน ไม่งั้นจะติดไปกับ QuotationMock เป็นฟิลด์ขยะ
    // owner / ช่องติ๊กภาษี ไม่ใช่ฟิลด์ของใบเสนอราคา — แยกออกก่อน ไม่งั้นจะติดไปลงฐานข้อมูล
    const { owner, vatOn, vatPct, whtOn, whtPct, ...qf } = form;
    const tv=qf.materialCost;
    const total=fmtMoney(tv);
    // สแนปช็อตภาษี ณ ตอนบันทึก — สูตรเดียวกับฟอร์มออกใบและเอกสารที่พิมพ์ (lib/quoteTax.ts)
    const ภาษีที่บันทึก = ช่องภาษีสำหรับบันทึก(tv, {
      vatPercent: vatOn ? Number(vatPct) : 0,
      whtPercent: whtOn ? Number(whtPct) : 0,
    });
    // หน้านี้แก้ใบอย่างเดียว — ออกใบใหม่ทำจากใบ HQ ที่แผงลูกค้าเป้าหมาย
    if(!editingQ) return;
    {
      const updated:QuotationMock={...editingQ,...qf,...ภาษีที่บันทึก,revision:qf.revision,expiry:qf.expiry,total,totalValue:tv};
      updateQuotation(updated);
      setSelected(p=>p?.id===editingQ.id?updated:p);
    }
    // ผู้รับผิดชอบ → เขียนกลับที่ "ต้นทาง" ตามที่บอสสั่ง (ใบเสนอราคาไม่มีฟิลด์นี้)
    // ปิดการขายแล้ว → เขียนที่ลูกค้า · ยังเป็นลูกค้าเป้าหมาย → เขียนที่ลูกค้าเป้าหมาย
    // ถ้าเขียนแค่ที่ลูกค้าอย่างเดียว ใบที่ยังเป็นลูกค้าเป้าหมาย (customerId=0) จะเลือกแล้วบันทึกไม่ลงแบบเงียบๆ
    // เปลี่ยนเฉพาะตอนค่าต่างจริง เพื่อไม่ไปแตะเรคคอร์ดต้นทางโดยไม่จำเป็น
    const cust = customers.find(c=>c.id===qf.customerId);
    if(cust){
      if((cust.owner ?? "") !== owner){
        updateCustomer({ ...cust, owner });
        setToast(`บันทึกแล้ว · เปลี่ยนผู้รับผิดชอบของลูกค้า ${cust.company} เป็น ${owner||"—"}`);
      }
    } else {
      const lead = (editingQ?.dealId ? leads.find(l=>l.numId===editingQ.dealId) : undefined)
        ?? leads.find(l=>l.company===qf.customer);
      if(lead && lead.assigned !== owner){
        บันทึกลีด(lead.id, { fields: { assigned: owner } });
        setToast(`บันทึกแล้ว · เปลี่ยนผู้รับผิดชอบของลูกค้าเป้าหมาย ${lead.company} เป็น ${owner||"—"}`);
      }
    }
    } finally { savingQRef.current = false; }
  }
  async function changeStatus(id:string,s:QuotationStatus){
    // "won" (ลูกค้าตอบรับ) = สร้าง/ผูกลูกค้าอัตโนมัติทันที ย้อนกลับไม่ได้ — ต้องยืนยันก่อนเสมอ
    // (ยืนยันจาก scenario test 31 ก.ค. 69: เดิมกดครั้งเดียวจบ เงียบสนิทไม่มี feedback เลย)
    if (s === "won") {
      const target = allQuotationsRaw.find(q => q.id === id);
      if (!(await ยืนยัน({
        หัวข้อ: `ปิดการขายสำเร็จสำหรับใบเสนอราคา "${id}"${target ? ` (${target.customer})` : ""} ?`,
        รายละเอียด: "ระบบจะสร้าง/ผูกลูกค้าให้อัตโนมัติทันที — ย้อนกลับไม่ได้",
        ปุ่มตกลง: "ปิดการขายสำเร็จ", อันตราย: true,
      }))) return;
      setQuotationStatus(id,s);
      setSelected(p=>p?.id===id?{...p,status:s}:p);
      showToast("ปิดการขายสำเร็จ — ระบบสร้าง/ผูกลูกค้าให้อัตโนมัติ");
      setJustWonCompany(target?.customer ?? null);
      return;
    }
    setQuotationStatus(id,s);
    setSelected(p=>p?.id===id?{...p,status:s}:p);
  }
  // "ลูกค้าปฏิเสธ" ต้องเลือกเหตุผลก่อนเสมอ — ใช้ชุดเหตุผลเดียวกับที่ลูกค้าเป้าหมายใช้ (HQ กำหนด)
  // (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69: เดิมกดปุ่มเดียวจบ ไม่เก็บเหตุผลอะไรเลย)
  const [pendingLostQ, setPendingLostQ] = useState<QuotationMock|null>(null);
  const [pendingLostReason, setPendingLostReason] = useState("");
  function confirmPendingLost(){
    const reason = pendingLostReason.trim();
    if(!pendingLostQ || !reason || reason===OTHER_REASON) return;
    updateQuotation({ ...pendingLostQ, status:"lost", lostReason:reason });
    setSelected(p=>p?.id===pendingLostQ.id?{...p,status:"lost",lostReason:reason}:p);
    setPendingLostQ(null); setPendingLostReason("");
  }
  // ส่งอีกครั้ง — ตั้งสถานะกลับเป็น "ส่งแล้ว" และประทับวันที่ = วันนี้ของระบบ (supabase=จริง)
  function sendAgain(q:QuotationMock){
    const RESENT_DATE=APP_NOW_ISO;
    const updated:QuotationMock={...q,status:"sent_to_client",date:RESENT_DATE};
    updateQuotation(updated);
    setSelected(p=>p?.id===q.id?updated:p);
    showToast(`ส่งใบเสนอราคา ${q.id} ให้ลูกค้าอีกครั้งแล้ว`);
  }
  // (ทำสำเนา/สร้างเวอร์ชัน ถูกตัดออกตามการรีวิว — ปุ่มไม่ได้ใช้)
  function deleteQ(){
    const target = delTarget;
    if(!target) return;
    ctxDeleteQuotation(target.id);
    // ปิดแผงรายละเอียดเฉพาะเมื่อกำลังเปิดใบที่เพิ่งลบอยู่ (ลบจากรายการ = แผงไม่ได้เปิด)
    setSelected(p=>p?.id===target.id?null:p);
    setDelTarget(null);
    showToast(`ลบใบเสนอราคา ${target.id} แล้ว`);
  }
  function selectRow(q:QuotationMock){
    setSelected(p=>p?.id===q.id?null:q);
    setDetailTab("info"); setDelTarget(null);
  }

  // พิมพ์ใบเสนอราคาเป็นเอกสาร A4 (ต้องตั้งชื่อบริษัทผู้ออกก่อน)
  function printQuotation(q:QuotationMock){
    // ⚠️ "ยังโหลดข้อมูลบริษัทไม่เสร็จ" ไม่เท่ากับ "ยังไม่ได้ตั้งชื่อบริษัท" (เจอจริง 27 ส.ค. 69)
    //    เปิดหน้าแล้วกดพิมพ์เร็ว ๆ จะขึ้นว่า "กรุณาตั้งชื่อบริษัท" ทั้งที่ตั้งไว้เรียบร้อยแล้ว
    //    แล้วเอกสารก็ไม่ออก ผู้ใช้ไม่รู้ว่าต้องทำอะไร (กติกาเดียวกับด่านปิดการขายที่แก้ไปแล้ว)
    if(!dealerCfg.loaded){ แจ้งสำเร็จ("กำลังโหลดข้อมูลบริษัท — รอสักครู่แล้วกดพิมพ์อีกครั้ง"); return; }
    if(!issuer.company.trim()){ แจ้งพลาด("กรุณาตั้งชื่อบริษัทที่ ตั้งค่า → โปรไฟล์บริษัท ก่อนพิมพ์ใบเสนอราคา"); router.push("/settings"); return; }
    const cust=customers.find(c=>c.id===q.customerId);
    const w=window.open("","_blank","width=880,height=1040");
    if(!w){ แจ้งพลาด("เบราว์เซอร์บล็อกป็อปอัป — กรุณาอนุญาตป็อปอัปเพื่อพิมพ์ใบเสนอราคา"); return; }
    // ใบเก่าใช้สแนปช็อตผู้ออกที่ตรึงไว้ (คงชื่อเดิม); ใบที่ยังไม่มีค่อยใช้โปรไฟล์ปัจจุบัน
    // VAT: ใช้สแนปช็อตที่ตรึงไว้กับใบตอนสร้าง (q.vatPercent) เสมอถ้ามี
    //   ใบเก่าที่ไม่มีค่อย fallback ไปใช้ค่าที่สาขาตั้งไว้ปัจจุบัน (ดีลเลอร์ตั้ง VAT เองได้แล้ว · 7 ส.ค. 69)
    w.document.write(buildQuotationHTML(q,q.issuer??issuer,cust,{...docProfile,vatPercent:q.vatPercent??dealerVat}));
    w.document.close();
  }

  const detailTabs:[string,string][]=[["info","ข้อมูล"],["customer","ลูกค้า"],["lead","ลูกค้าเป้าหมาย"]];

  // form initial for edit
  function toForm(q:QuotationMock):QForm{
    // ผู้รับผิดชอบมาจากลูกค้าที่ใบนี้ผูกอยู่ (ใบไม่มีฟิลด์นี้)
    const owner = ownerOf(q);
    // ใบเก่าที่ไม่มี lineItems → สังเคราะห์เป็น 1 รายการจาก แม่แบบ/พื้นที่/มูลค่า (แก้ต่อได้)
    const lineItems:QuoteLineItem[] = boqLineItems(q);
    return {vatOn:(q.vatPercent ?? 0)>0, vatPct:String(q.vatPercent ?? 7), whtOn:(q.whtRate ?? 0)>0, whtPct:String(q.whtRate ?? dealerWht ?? 3), customerId:q.customerId,customer:q.customer,project:q.project,projectId:q.projectId??0,province:q.province,area:q.area,materialCost:q.materialCost,status:q.status,date:q.date,items:q.items,lineItems,revision:q.revision??"V1",expiry:q.expiry??"",owner};
  }

  return (
    <div className="erp" style={{display:"flex",gap:16,alignItems:"flex-start"}}>

      {/* ══ MAIN ════════════════════════════════════════════ */}
      <div style={{flex:1,minWidth:0}}>

        {/* หัวหน้า/ปุ่ม → ไปอยู่บนแถบบน (ชื่อหน้ามาจาก Topbar) */}
        <TopbarActions>
          <FilterBar dims={[]} />
          <ExportMenu filename="quotations" title="ใบเสนอราคา" small
            headers={["เลขที่","ฉบับ","ลูกค้า","ผู้รับผิดชอบ","โครงการ","จังหวัด","พื้นที่","มูลค่ารวม","สถานะ","วันที่"]}
            rows={filtered.map(q=>[q.id,q.revision ?? "V1",q.customer,ownerOf(q) || "—",q.project,q.province,q.area,q.totalValue,quotationStatusLabel[q.status],q.date])} />
        </TopbarActions>
        {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

        {/* ── สรุป 5 ตัวชี้วัด — การ์ด KPI คลิกกรองได้ (มาตรฐานเดียวกับหน้าลูกค้าเป้าหมาย/ลูกค้า) ── */}
        {(() => {
          const fmtC = (v:number) => v>=1e6 ? `฿${(v/1e6).toFixed(1)}M` : v>=1e3 ? `฿${Math.round(v/1e3)}K` : `฿${v}`;
          // STATUS_LIST ถูกลบพร้อมชิปกรองสถานะ — ไม่มีใครอ่านแล้ว
          const valOf = (list: QuotationMock[]) => list.reduce((a,q)=>a+q.totalValue,0);
          // ── มูลค่ารวมต้องเดินตามสถานะที่กรองอยู่ (บอสสั่ง 20 ส.ค. 69) ──────────────
          //   เดิมรวมทุกสถานะเสมอ กดกรอง "ตอบรับแล้ว" ตารางเหลือ 2 ใบ แต่การ์ดยังโชว์ ฿8.7M
          //   ของทั้งหน้า → อ่านแล้วเข้าใจว่าที่ตอบรับมีมูลค่าเท่านั้น ทั้งที่ไม่ใช่
          //   ตอนนี้รวมเฉพาะใบที่ตรงสถานะที่เลือก และเขียนกำกับไว้ว่ากำลังรวมของสถานะไหน
          //   ⚠️ ไม่ผูกกับช่องค้นหา — การ์ด KPI เป็นภาพรวมของสถานะ ไม่ใช่ผลค้นหารายใบ
          const ตามสถานะ = filterStatus === "ALL" ? scoped : scoped.filter(q => q.status === filterStatus);
          const totalVal = valOf(ตามสถานะ); // สรุปตามช่วงเวลา + สถานะที่กรอง
          const wonList  = scoped.filter(q=>q.status==="won");
          const lostList = scoped.filter(q=>q.status==="lost");
          const clear    = () => setFilterStatus("ALL");
          const kpis = [
            { label:"ใบเสนอราคาทั้งหมด", value:`${scoped.length}`,      sub:"รายการ",            Icon:FileText, color:"#2563EB", bg:"#E8F0FE", on: filterStatus==="ALL", onClick: clear },
            { label:"มูลค่ารวม",         value:fmtC(totalVal),          sub: filterStatus==="ALL" ? "ทุกสถานะ" : quotationStatusLabel[filterStatus], Icon:Coins, color:"#16A34A", bg:"#E6F7EE", on: false, onClick: clear },
            { label:"ตอบรับแล้ว",        value:`${wonList.length}`,     sub:fmtC(valOf(wonList)), Icon:Check,    color:"#0D9488", bg:"#E6F7F5", on: filterStatus==="won",  onClick:()=>setFilterStatus(filterStatus==="won"?"ALL":"won") },
            { label:"ปฏิเสธแล้ว",        value:`${lostList.length}`,    sub:fmtC(valOf(lostList)), Icon:X,       color:"#DC2626", bg:"#FEE2E2", on: filterStatus==="lost", onClick:()=>setFilterStatus(filterStatus==="lost"?"ALL":"lost") },
          ];
          return (
            <>
              <div className="dash-kpis" style={{ marginBottom:16 }}>
                {/* สถานะ "ถูกเลือก" คุมด้วย .kpi-toggle + aria-pressed ใน globals.css — ห้ามใส่ border/boxShadow เป็น inline */}
                {kpis.map(k=>(
                  <button key={k.label} onClick={k.onClick} aria-pressed={k.on} title={k.on?"กดอีกครั้งเพื่อล้างตัวกรอง":`กรอง: ${k.label}`}
                    className="card clickable kpi-toggle" style={{ padding:"16px 14px", display:"flex", flexDirection:"column", gap:6, textAlign:"left",
                      cursor:"pointer", fontFamily:"inherit", width:"100%" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, width:"100%" }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:"0.72rem", color:"#6B7280" }}>{k.label}</div>
                        <div style={{ fontSize:"1.42rem", fontWeight:800, color:"#1F2937", marginTop:6, fontVariantNumeric:"tabular-nums" }}>{k.value}</div>
                        <div style={{ fontSize:"0.72rem", color:"#6B7280", marginTop:2 }}>{k.sub}</div>
                      </div>
                      <span style={{ width:42, height:42, borderRadius:12, background:k.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <k.Icon size={20} color={k.color} strokeWidth={2.1} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* ชิปกรองสถานะ (ทั้งหมด/ร่าง/ส่งแล้ว/...) เอาออกตามที่บอสสั่ง
                  กรองสถานะยังทำได้ที่การ์ด KPI ด้านบน (กดการ์ดแล้วกรอง) */}
            </>
          );
        })()}

        {/* ── แถบตัวกรองแถวเดียว (มาตรฐานเดียวกับหน้า /hq/pipeline) ──
            เดิมเป็นปุ่ม "ตัวกรอง" + แผงชิปที่ต้องกดเปิด — ตอนนี้เห็นตัวกรองทุกตัวพร้อมกัน
            ตัวเลือกทุกตัวสร้างจากใบเสนอราคาจริงที่มีอยู่ ไม่ hardcode
            "ทุกสถานะ" ใช้ state เดียวกับการ์ด KPI ด้านบน → กดที่ไหนก็ตรงกัน */}
        <FilterRow
          query={query} onQuery={setQuery} placeholder="ค้นหาเลขที่ / ลูกค้า / โครงการ..."
          showClear={filterStatus!=="ALL" || ownerFilter!=="ALL" || provFilter!=="ALL" || !!query}
          onClear={()=>{ setQuery(""); setFilterStatus("ALL"); setOwnerFilter("ALL"); setProvFilter("ALL"); }}
          right={
            /* สลับมุมมอง รายการ/การ์ด — อยู่ท้ายแถบตัวกรองเหมือนหน้าลูกค้าเป้าหมาย (ช่อง right ของ FilterRow)
               ขนาดเล็กกว่าช่องกรอง (สูง 30 · ไอคอน 12) เพราะเป็นตัวควบคุมรอง ไม่ใช่ตัวกรอง */
            <div style={{display:"flex",border:`1px solid ${BORDER}`,borderRadius:8,overflow:"hidden",height:30,boxSizing:"border-box",flexShrink:0}}>
              {([["list",LayoutList,"รายการ"],["card",LayoutGrid,"การ์ด"]] as const).map(([v,Ico,tip])=>(
                <button key={v} title={tip} onClick={()=>setView(v)}
                  style={{display:"flex",alignItems:"center",gap:4,padding:"0 8px",height:"100%",border:"none",cursor:"pointer",
                    background:view===v?PRIMARY:"#fff",color:view===v?"#fff":"#6b7280",fontFamily:"inherit",fontSize:"0.68rem",fontWeight:600}}>
                  <Ico size={12}/> {tip}
                </button>
              ))}
            </div>
          }
        >
          <FilterSelect caption="ทุกสถานะ" value={filterStatus} onChange={v=>setFilterStatus(v as QuotationStatus|"ALL")}
            options={STATUS_ORDER.map(s=>({v:s,l:quotationStatusLabel[s]}))} />
          <FilterSelect caption="ทุกผู้รับผิดชอบ" value={ownerFilter} onChange={setOwnerFilter}
            options={ownerOptions.map(o=>({v:o,l:o}))} minWidth={140} />
          <FilterSelect caption="ทุกจังหวัด" value={provFilter} onChange={setProvFilter}
            options={provOptions.map(p=>({v:p,l:p}))} />
        </FilterRow>

        {/* ── LIST VIEW ── */}
        {view==="list"&&(
          <div className="card">
            <div className={`table-wrap${density==="compact"?" dense":""}`}>
              <table>
                {/* บอสสั่ง "ตารางมันเกิน" → ต้องพอดีกรอบ (~1012px) ห้ามเลื่อนแนวนอน
                    ที่ประหยัดพื้นที่มาได้: ตัดไอคอนเอกสารหน้าเลขที่ (ซ้ำทุกแถว ไม่ได้บอกอะไร) ~36px
                    + ปุ่มการกระทำเป็นไอคอนล้วน (hover เห็นชื่อ) ~60px
                    คอลัมน์ข้อความยาวใช้ ... + hover ดูเต็ม · minWidth รวม ~1000px */}
                <colgroup>
                  {/* ความกว้างมาจากการ "วัดจริง" ในเบราว์เซอร์ ทั้งหัวตารางและข้อมูล (ไม่ใช่เดา)
                      ของจริงต้องการรวม 1284px แต่กรอบมีแค่ 1012px (กรอบกว้างเท่านี้ตายตัว ขยายจอไม่ช่วย)
                      → คอลัมน์ห้ามตัด (เลขที่/มูลค่า/สถานะ/วันที่/ปุ่ม) ให้เต็มตามที่วัดได้ รวมหัวตารางด้วย
                        คอลัมน์ข้อความยาว (ลูกค้า/โครงการ/ประเภท/ผู้รับผิดชอบ) รับส่วนที่เหลือ → "..." + hover ดูเต็ม */}
                  <col style={{width:"10.7%",minWidth:110}} />{/* เลขที่ — "Q-2026-0096" 110 ห้ามตัด */}
                  {/* คอลัมน์ข้อความหดลงรวม 32px เพื่อแลกที่ให้ปุ่ม "ลบ" ที่เพิ่มเข้ามา (13 ส.ค. 69)
                      หดได้เพราะยังกว้างกว่าหัวคอลัมน์ของตัวเอง — ข้อมูลยาวยังตัดด้วย … + hover ดูเต็มเหมือนเดิม */}
                  <col style={{width:"11.8%",minWidth:78}} />{/* ลูกค้า (…) หัว 74 · รับส่วนของคอลัมน์ "ประเภท" ที่ถอดออก 16 ต.ค. 69 */}
                  {!hiddenCols.includes("project")&&<col style={{width:"12.7%",minWidth:90}} />}{/* โครงการ (…) หัว 88 */}
                  {!hiddenCols.includes("owner")&&<col style={{width:"8.7%",minWidth:88}} />}{/* ผู้รับผิดชอบ (…) หัว 87 */}
                  {!hiddenCols.includes("value")&&<col style={{width:"11.3%",minWidth:116}} />}{/* มูลค่า — ข้อมูล 114 ห้ามตัด */}
                  <col style={{width:"10.9%",minWidth:110}} />{/* สถานะ — ป้ายยาวสุด "ส่งแล้ว"/"ปฏิเสธ" */}
                  {!hiddenCols.includes("created")&&<col style={{width:"7.7%",minWidth:78}} />}{/* วันที่สร้าง — หัว 75 (ไม่มีลูกศร) */}
                  {!hiddenCols.includes("expiry")&&<col style={{width:"7.5%",minWidth:74}} />}{/* หมดอายุ — หัว 71 */}
                  <col style={{width:"18.7%",minWidth:190}} />{/* ปุ่ม 5 ไอคอน (ส่ง·ดู·พิมพ์·แก้ไข·ลบ) — 5×28 + 4×4 gap + padding */}
                </colgroup>
                <thead>
                  <tr>
                    {([{label:"เลขที่",key:"id",col:null},{label:"ลูกค้า",key:"customer",col:null},{label:"โครงการ",key:"project",col:"project"},{label:"ผู้รับผิดชอบ",key:null,col:"owner"},{label:"มูลค่า",key:"totalValue",col:"value"},{label:"สถานะ",key:"status",col:null},
                      /* "วันที่สร้าง" ไม่มีลูกศรเรียงตามที่บอสสั่ง (key:null) — หัวคอลัมน์เหลือแค่ตัวหนังสือ ไม่มี ‹› ไม่มี "..." */
                      {label:"วันที่สร้าง",key:null,col:"created"},{label:"หมดอายุ",key:null,col:"expiry"},{label:"",key:null,col:null}] as {label:string;key:SortKey|null;col:string|null}[])
                      .filter(col=>!col.col||!hiddenCols.includes(col.col))
                      .map((col,i)=>(
                      <SortableTh key={i} label={col.label || "คอลัมน์"}
                        active={!!col.key && sortKey === col.key} dir={sortDir}
                        onSort={col.key?()=>handleSort(col.key as SortKey):undefined}
                        style={{cursor:col.key?"pointer":"default",userSelect:"none"}}>
                        {/* nowrap กันหัวคอลัมน์ตกบรรทัดเวลาช่องแคบ (มาตรฐานเดียวกับตารางลูกค้าเป้าหมาย/ลูกค้า) */}
                        <span style={{display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>{col.label}{col.key&&<SortIcon k={col.key}/>}</span>
                      </SortableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length===0&&<tr><td colSpan={9-["project","owner","value","created","expiry"].filter(c=>hiddenCols.includes(c)).length} style={{padding:0}}>
                    <EmptyState icon={<FileText size={28}/>} title="ไม่พบใบเสนอราคา" description="ใบเสนอราคาออกจากหน้า “ลูกค้าเป้าหมาย” — เปิดรายการแล้วสร้างในแท็บใบเสนอราคา"
                      action={<button className="btn btn-secondary btn-md" style={{color:"#003366"}} onClick={()=>router.push("/leads")}>ไปหน้าลูกค้าเป้าหมาย →</button>} />
                  </td></tr>}
                  {paged.map(q=>{
                    const sc=quotationStatusColor[q.status]; const isSel=selected?.id===q.id;
                    return (
                      <ClickableRow key={q.id} onActivate={()=>selectRow(q)} className="clickable"
                        label={`เปิดรายละเอียดใบเสนอราคา ${q.id}`}
                        style={{background:isSel?"#f0f6ff":undefined}}>
                        {/* ไอคอนเอกสารหน้าเลขที่เอาออก — ซ้ำกันทุกแถว ไม่ได้บอกอะไร แลกที่ให้คอลัมน์อื่น */}
                        <td>
                          {/* เลขที่ + ฉบับ (บอสสั่ง 21 ส.ค. 69) — ต้องรู้จากตารางเลยว่าใบนี้แก้มากี่รอบแล้ว */}
                          <span style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:"0.8rem",fontWeight:700,color:STEEL,fontFamily:"monospace",whiteSpace:"nowrap"}}>{q.id}</span>
                            <span className="badge" style={{background:"#eef3f8",color:PRIMARY,fontSize:"0.62rem",fontWeight:800}}
                            title="ฉบับที่เท่าไรของใบนี้ — แก้ใบที่ส่งไปแล้วจะขึ้นฉบับใหม่">{q.revision ?? "V1"}</span>
                          </span>
                        </td>
                        <td>
                          {q.customerId ? (
                            <button onClick={e=>{e.stopPropagation();router.push(`/customers?open=${q.customerId}`);}}
                              style={{background:"none",border:"none",cursor:"pointer",color:PRIMARY,fontSize:"0.8rem",fontWeight:700,padding:0,textAlign:"left"}}>
                              {q.customer}
                            </button>
                          ) : (
                            <span style={{fontSize:"0.8rem",fontWeight:700,color:STEEL}}>{q.customer}</span>
                          )}
                        </td>
                        {!hiddenCols.includes("project")&&(
                        <td title={q.project} style={{fontSize:"0.78rem",color:STEEL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.project||"—"}</td>
                        )}
                        {!hiddenCols.includes("owner")&&(() => {
                          // ผู้รับผิดชอบ = ผู้รับผิดชอบลูกค้าที่ใบนี้ผูกอยู่ · ใบที่ไม่ได้ผูกลูกค้า (customerId=0) หาไม่เจอ
                          // แสดงเป็นวงกลมย่อ + ชื่อ (AssigneeAvatars) ตามที่บอสสั่ง — ตัวคอมโพเนนต์ขึ้น "—" ให้เองเมื่อไม่มีค่า
                          const owner = ownerOf(q);
                          return (
                            <td title={owner||undefined} style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              <AssigneeAvatars value={owner} size={26} />
                            </td>
                          );
                        })()}
                        {!hiddenCols.includes("value")&&(
                        <td className="num" style={{fontSize:"0.86rem",fontWeight:800,color:STEEL,whiteSpace:"nowrap"}}>{q.total}</td>
                        )}
                        <td>
                          <span className="badge" style={{background:sc.bg,color:sc.text}}>{quotationStatusLabel[q.status]}</span>
                        </td>
                        {!hiddenCols.includes("created")&&(
                        <td title={fmtDate(q.date)} style={{fontSize:"0.72rem",color:MUTED,whiteSpace:"nowrap"}}>{fmtDateShort(q.date)}</td>
                        )}
                        {!hiddenCols.includes("expiry")&&(() => {
                          const ex = expiryOf(q, validityDays);
                          return <td title={ex?fmtDate(ex):undefined} style={{fontSize:"0.72rem",color:MUTED,whiteSpace:"nowrap"}}>{ex?fmtDateShort(ex):"—"}</td>;
                        })()}
                        <td onClick={e=>e.stopPropagation()}>
                          <div style={{display:"flex",gap:4,flexWrap:"nowrap",justifyContent:"flex-end"}}>
                            {/* ปุ่มเป็นไอคอนล้วนเพื่อให้ตารางพอดีกรอบ — hover เห็นชื่อปุ่มจาก title */}
                            {แก้ได้(q)&&q.status==="draft"&&(
                              <button onClick={()=>changeStatus(q.id,"sent_to_client")} title="ส่งให้ลูกค้า"
                                style={{width:28,height:28,borderRadius:7,border:"none",background:"#d97706",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Send size={12}/></button>
                            )}
                            <button onClick={()=>selectRow(q)} title="ดูรายละเอียด"
                              style={{width:28,height:28,borderRadius:7,border:`1px solid ${BORDER}`,background:"#fff",color:PRIMARY,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Eye size={13}/></button>
                            <button onClick={()=>printQuotation(q)} title="พิมพ์ใบเสนอราคา"
                              style={{width:28,height:28,borderRadius:7,border:`1px solid ${BORDER}`,background:"#fff",color:PRIMARY,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Printer size={13}/></button>
                            {/* ใบเดิมที่ไม่มีใบ HQ = ดูได้อย่างเดียว ไม่มีแก้/ลบ */}
                            {แก้ได้(q)&&<>
                            <button onClick={()=>openEdit(q)} title="แก้ไข"
                              style={{width:28,height:28,borderRadius:7,border:`1px solid ${BORDER}`,background:"#fff",color:PRIMARY,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Edit2 size={13}/></button>
                            {/* ลบได้จากรายการเลย ไม่ต้องเปิดแผงรายละเอียดก่อน — ยังถามยืนยันเหมือนเดิม */}
                            <button onClick={()=>setDelTarget(q)} title="ลบใบเสนอราคา"
                              style={{width:28,height:28,borderRadius:7,border:"1px solid #f3c9c9",background:"#fff",color:"#dc2626",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Trash2 size={13}/></button>
                            </>}
                          </div>
                        </td>
                      </ClickableRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationBar from={rangeFrom} to={rangeTo} total={filtered.length}
              page={page} totalPages={totalPages}
              onPrev={()=>setPage(p=>Math.max(1,p-1))} onNext={()=>setPage(p=>Math.min(totalPages,p+1))}/>
          </div>
        )}

        {/* ── CARD VIEW ── */}
        {view==="card"&&(
          <div className="card" style={{borderRadius:"0 0 var(--radius-xl) var(--radius-xl)",borderTop:"none"}}>
            <div style={{padding:16}}>
            {filtered.length===0&&<EmptyState icon={<FileText size={28}/>} title="ไม่พบใบเสนอราคา" description="ใบเสนอราคาออกจากหน้า “ลูกค้าเป้าหมาย” — เปิดรายการแล้วสร้างในแท็บใบเสนอราคา"
              action={<button className="btn btn-secondary btn-md" style={{color:"#003366"}} onClick={()=>router.push("/leads")}>ไปหน้าลูกค้าเป้าหมาย →</button>} />}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
              {paged.map(q=>{
                const sc=quotationStatusColor[q.status]; const isSel=selected?.id===q.id;
                return (
                  <div key={q.id} onClick={()=>selectRow(q)}
                    style={{background:"#fff",borderRadius:14,border:isSel?`1.5px solid ${PRIMARY}`:`1px solid ${BORDER}`,boxShadow:isSel?"0 4px 18px rgba(0,0,0,.15)":"0 2px 10px rgba(0,0,0,.06)",cursor:"pointer",overflow:"hidden",transition:"all .15s"}}
                    onMouseEnter={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.boxShadow="0 6px 22px rgba(0,0,0,.13)";}}
                    onMouseLeave={e=>{if(!isSel)(e.currentTarget as HTMLElement).style.boxShadow="0 2px 10px rgba(0,0,0,.06)";}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderBottom:"1px solid #f0f4f8"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:28,height:28,borderRadius:8,background:"#dce5f0",display:"flex",alignItems:"center",justifyContent:"center"}}><FileText size={12} color={PRIMARY}/></div>
                        <span style={{fontSize:"0.8rem",fontWeight:700,color:STEEL,fontFamily:"monospace"}}>{q.id}</span>
                        <span className="badge" style={{background:"#eef3f8",color:PRIMARY,fontSize:"0.62rem",fontWeight:800}}
                        title="ฉบับที่เท่าไรของใบนี้ — แก้ใบที่ส่งไปแล้วจะขึ้นฉบับใหม่">{q.revision ?? "V1"}</span>
                      </div>
                      <span className="badge" style={{background:sc.bg,color:sc.text}}>{quotationStatusLabel[q.status]}</span>
                    </div>
                    <div style={{padding:"12px 14px"}}>
                      <button onClick={e=>{e.stopPropagation(); if(q.customerId) router.push(`/customers?open=${q.customerId}`);}}
                        style={{background:"none",border:"none",cursor:q.customerId?"pointer":"default",color:q.customerId?PRIMARY:STEEL,fontSize:"0.92rem",fontWeight:800,padding:0,textAlign:"left",display:"block",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>
                        {q.customer}
                      </button>
                      <div style={{fontSize:"0.72rem",color:MUTED,marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.project} · {q.province}</div>
                      <div style={{display:"flex",gap:0,borderRadius:9,overflow:"hidden",border:"1px solid #f0f4f8",marginBottom:10}}>
                        {[{label:"พื้นที่",value:`${q.area?.toLocaleString()} ม²`}].map((item,i)=>(
                          <div key={i} style={{flex:1,padding:"6px 8px",background:i%2===0?"#fafafa":"#f3f6fb",borderRight:"none",textAlign:"center"}}>
                            <div style={{fontSize:"0.65rem",color:"#9ca3af",fontWeight:600,marginBottom:2}}>{item.label}</div>
                            <div style={{fontSize:"0.65rem",color:STEEL,fontWeight:700}}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{fontSize:"1.15rem",fontWeight:800,color:PRIMARY}}>{q.total}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 14px",borderTop:"1px solid #f0f4f8",background:"#fafbfc"}}>
                      <span style={{fontSize:"0.65rem",color:MUTED}}>{fmtDate(q.date)}</span>
                      <div style={{display:"flex",gap:4}} onClick={e=>e.stopPropagation()}>
                        {แก้ได้(q)&&q.status==="draft"&&(
                          <button onClick={()=>changeStatus(q.id,"sent_to_client")} className="btn btn-sm"
                            style={{background:"#d97706",color:"#fff",border:"none",padding:"4px 9px",fontSize:"0.65rem"}}>ส่งลูกค้า</button>
                        )}
                        <button onClick={()=>printQuotation(q)} title="พิมพ์ใบเสนอราคา" className="btn btn-secondary btn-sm"
                          style={{color:PRIMARY,padding:"4px 8px",fontSize:"0.65rem"}}><Printer size={11}/></button>
                        {แก้ได้(q)&&<>
                        <button onClick={()=>openEdit(q)} className="btn btn-secondary btn-sm"
                          style={{color:PRIMARY,padding:"4px 9px",fontSize:"0.65rem"}}>แก้ไข</button>
                        <button onClick={()=>setDelTarget(q)} title="ลบใบเสนอราคา" className="btn btn-secondary btn-sm"
                          style={{color:"#dc2626",borderColor:"#f3c9c9",padding:"4px 8px",fontSize:"0.65rem"}}><Trash2 size={11}/></button>
                        </>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
            <PaginationBar from={rangeFrom} to={rangeTo} total={filtered.length}
              page={page} totalPages={totalPages}
              onPrev={()=>setPage(p=>Math.max(1,p-1))} onNext={()=>setPage(p=>Math.min(totalPages,p+1))}/>
          </div>
        )}
      </div>

      {/* ══ DETAIL PANEL ════════════════════════════════════ */}
      {selected&&(() => {
        const cardStyle: React.CSSProperties = { background:"#fff", border:"1px solid #eef1f5", borderRadius:14, padding:16 };
        const secLabel: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, fontSize:"0.62rem", fontWeight:800, color:"#8a929c", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 };
        const qa: React.CSSProperties = { background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, height:30, padding:"0 11px", cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", gap:6, fontSize:"0.72rem", fontWeight:600, fontFamily:"inherit", whiteSpace:"nowrap" };
        const lineItems: QuoteLineItem[] = boqLineItems(selected);
        const subtotal = boqSubtotal(lineItems);
        const net = subtotal;                            // = totalValue (มูลค่างาน ก่อน VAT) — ไม่มีส่วนลด
        // ใช้สูตรกลางเดียวกับฟอร์มและเอกสารที่พิมพ์ (lib/quoteTax.ts) — ตัวเลขต้องตรงกันทุกที่
        const ภาษี = คิดภาษีใบเสนอราคา(net, { vatPercent: selected.vatPercent ?? dealerVat, whtPercent: selected.whtRate });
        const vatPct = ภาษี.vatRate;
        const sc = quotationStatusColor[selected.status];

        return (
        <>
          <div onClick={()=>setSelected(null)} className="drawer-overlay" style={{position:"fixed",inset:0,background:"rgba(45,45,45,.45)",zIndex:200}}/>

          {/* Quotation Detail — แผงกลางจอ · คอลัมน์เดียว (มาตรฐานเดียวกับ ลูกค้าเป้าหมาย/ลูกค้า) */}
          <div className="modal-pop" style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:820, maxWidth:"calc(100vw - 24px)", height:"min(920px, calc(100vh - 24px))",
            zIndex:210, background:"#fff", boxShadow:"0 30px 90px rgba(0,0,0,.32)", borderRadius:18,
            display:"flex", flexDirection:"column", overflow:"hidden"}}>

            {/* Sticky navy header + quick actions */}
            <div style={{background:PRIMARY,padding:"14px 20px",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                  <div style={{width:46,height:46,borderRadius:13,background:"rgba(255,255,255,.18)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",border:"2px solid rgba(255,255,255,.25)",flexShrink:0}}>
                    <FileText size={20}/>
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:"0.65rem",fontWeight:700,color:"rgba(255,255,255,.6)",fontFamily:"monospace",letterSpacing:"0.05em"}}>{selected.id}</span>
                    </div>
                    <div style={{fontSize:"1.08rem",fontWeight:800,color:"#fff",lineHeight:1.2,marginTop:2}}>{selected.customer}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:"0.72rem",color:"rgba(255,255,255,.72)",marginTop:4}}>
                      {selected.project && <span>{selected.project}</span>}
                      <span style={{display:"flex",alignItems:"center",gap:3}}><MapPin size={11}/> {selected.province}</span>
                      {/* "วันที่ / หมดอายุ" เอาออกตามที่บอสสั่ง — ซ้ำกับ "วันที่ออก / วันหมดอายุ" ในการ์ดข้อมูลใบเสนอราคาด้านล่าง */}
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0,flexWrap:"wrap"}}>
                  {/* ปิดปุ่มไว้จนกว่าข้อมูลบริษัทจะโหลดเสร็จ — กันไม่ให้กดแล้วได้คำเตือนที่ผิด
                      ("กรุณาตั้งชื่อบริษัท" ทั้งที่ตั้งไว้แล้ว) · ดูเหตุผลเต็มที่ printQuotation */}
                  <button title={dealerCfg.loaded ? "พิมพ์ / ดาวน์โหลด PDF" : "กำลังโหลดข้อมูลบริษัท…"}
                    disabled={!dealerCfg.loaded} onClick={()=>printQuotation(selected)}
                    style={{...qa, ...(dealerCfg.loaded ? {} : { opacity: .55, cursor: "wait" })}}><Printer size={13}/> พิมพ์ PDF</button>
                  {แก้ได้(selected) && <button title="แก้ไข" onClick={()=>openEdit(selected)} style={qa}><Edit2 size={13}/> แก้ไข</button>}
                  {แก้ได้(selected) && selected.status==="sent_to_client" && <button title="ส่งอีกครั้ง" onClick={()=>sendAgain(selected)} style={qa}><Send size={13}/> ส่งอีกครั้ง</button>}
                  {selected.customerId ? <button title="ดูลูกค้า" onClick={()=>router.push(`/customers?open=${selected.customerId}`)} style={qa}><ExternalLink size={13}/> ลูกค้า</button> : null}
                  {แก้ได้(selected) && <button title="ลบใบเสนอราคา" onClick={()=>setDelTarget(selected)} style={{...qa,width:30,padding:0,justifyContent:"center",color:"#fecaca"}}><Trash2 size={14}/></button>}
                  <button onClick={()=>setSelected(null)} title="ปิด" style={{...qa,width:30,padding:0,justifyContent:"center"}}><X size={15}/></button>
                </div>
              </div>
              {/* Badges: status · total · items · area */}
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:12}}>
                <span style={{padding:"2px 10px",borderRadius:99,fontSize:"0.65rem",fontWeight:700,background:sc.bg,color:sc.text}}>{quotationStatusLabel[selected.status]}</span>
                {selected.buildingType && <span style={{display:"flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:99,fontSize:"0.65rem",fontWeight:700,background:"rgba(255,255,255,.18)",color:"#fff"}}><Package size={11}/> {selected.buildingType}</span>}
                <span style={{display:"flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:99,fontSize:"0.65rem",fontWeight:700,background:"rgba(255,255,255,.18)",color:"#fff"}}>{selected.items} รายการ · {selected.area?.toLocaleString()} ตร.ม.</span>
                <span style={{display:"flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:99,fontSize:"0.65rem",fontWeight:800,background:"#fff",color:PRIMARY}}><Coins size={11}/> {selected.total}</span>
              </div>
            </div>

            {/* Body — คอลัมน์เดียว เลื่อนทั้งแผง (drawer) */}
            <div style={{flex:1,overflowY:"auto",background:"#f5f7fa"}}>
              {/* เอกสารใบเสนอราคา (BOQ + รายละเอียด) */}
              <div style={{padding:16,display:"flex",flexDirection:"column",gap:14}}>
                {/* รายละเอียดเอกสาร */}
                <div style={cardStyle}>
                  <div style={secLabel}><FileText size={13} color={PRIMARY}/> รายละเอียดเอกสาร</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
                    {([
                      ["จังหวัด", selected.province],
                      ...(selected.buildingType ? [["ประเภทอาคาร", selected.buildingType]] : []), // ใบเก่าเท่านั้น
                      ["พื้นที่", `${selected.area?.toLocaleString()} ตร.ม.`],
                      ["จำนวนรายการ", `${selected.items} รายการ`],
                      ["วันที่ออก", fmtDate(selected.date)],
                      ["วันหมดอายุ", expiryOf(selected,validityDays)?fmtDate(expiryOf(selected,validityDays)):"—"],
                    ] as [string,string][]).map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"7px 0",borderBottom:"1px solid #f0f4f8",fontSize:"0.76rem"}}>
                        <span style={{color:"#8a929c"}}>{k}</span><span style={{fontWeight:700,color:STEEL,textAlign:"right"}}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BOQ line items */}
                <div style={cardStyle}>
                  <div style={secLabel}><Layers size={13} color={PRIMARY}/> รายการสินค้า (BOQ)</div>
                  {lineItems.length===0?(
                    <div style={{fontSize:"0.8rem",color:MUTED,textAlign:"center",padding:"18px 0"}}>ไม่มีรายการสินค้า</div>
                  ):(
                    <div style={{overflowX:"auto"}}>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.78rem"}}>
                        <thead>
                          <tr style={{background:"#f7f9fc"}}>
                            {["รายการ","จำนวน","หน่วย","ราคา/หน่วย","รวม"].map((h,i)=>(
                              <th key={h} style={{textAlign:i>0?"right":"left",padding:"8px 10px",color:"#8a929c",fontWeight:700,whiteSpace:"nowrap",fontSize:"0.68rem"}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lineItems.map((li,i)=>(
                            <tr key={i} style={{borderTop:"1px solid #f0f4f8"}}>
                              <td style={{padding:"8px 10px",fontWeight:700,color:STEEL}}>{li.name}</td>
                              <td style={{padding:"8px 10px",textAlign:"right",color:STEEL}}>{li.qty.toLocaleString()}</td>
                              <td style={{padding:"8px 10px",textAlign:"right",color:MUTED}}>{li.unit}</td>
                              <td style={{padding:"8px 10px",textAlign:"right",color:STEEL}}>{fmtBaht(li.unitPrice)}</td>
                              <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,color:STEEL}}>{fmtBaht(li.qty*li.unitPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Totals — ตรงกับเอกสารพิมพ์: มูลค่างาน (ก่อน VAT) = ยอดที่บันทึก, บวก VAT → ยอดรวมสุทธิ */}
                  <div style={{marginTop:12,marginLeft:"auto",width:"min(340px,100%)",display:"flex",flexDirection:"column",gap:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.78rem"}}><span style={{color:"#8a929c"}}>ยอดรวมย่อย</span><span style={{fontWeight:700,color:STEEL}}>{fmtBaht(subtotal)}</span></div>
                    {/* แถบ "มูลค่างาน (ก่อน VAT)" เอาออกตามที่บอสสั่ง — ซ้ำกับ "ยอดรวมย่อย" เป๊ะ
                        (พอไม่มีส่วนลดในระบบ ยอดก่อน VAT = ผลรวม BOQ เสมอ) */}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.76rem",marginTop:2}}><span style={{color:"#8a929c"}}>ภาษีมูลค่าเพิ่ม {vatPct}%</span><span style={{fontWeight:700,color:STEEL}}>{fmtMoney(ภาษี.vatAmount)}</span></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.78rem",fontWeight:700,color:STEEL,borderTop:"1px solid #e6eaf0",paddingTop:6}}><span>รวมเป็นเงิน</span><span>{fmtMoney(ภาษี.totalAmount)}</span></div>
                    {ภาษี.whtRate > 0 && (
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.76rem"}}><span style={{color:"#b45309"}}>หัก ณ ที่จ่าย {ภาษี.whtRate}%</span><span style={{fontWeight:700,color:"#b45309"}}>−{fmtMoney(ภาษี.whtAmount)}</span></div>
                    )}
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.82rem",fontWeight:800,color:STEEL,borderTop:"2px solid #e6eaf0",paddingTop:7}}><span>ยอดชำระสุทธิ</span><span>{fmtMoney(ภาษี.netPayable)}</span></div>
                  </div>
                  {selected.note && (
                    <div style={{marginTop:12,padding:"10px 12px",background:"#fafbfc",border:"1px solid #f0f4f8",borderRadius:10,fontSize:"0.75rem",color:"#4b5563",lineHeight:1.6}}>
                      <span style={{fontWeight:700,color:"#8a929c"}}>หมายเหตุ: </span>{selected.note}
                    </div>
                  )}
                  {selected.status==="lost" && selected.lostReason && (
                    <div style={{marginTop:12,padding:"10px 12px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:10,fontSize:"0.75rem",color:"#991b1b",lineHeight:1.6}}>
                      <span style={{fontWeight:700}}>เหตุผลที่ปฏิเสธ: </span>{selected.lostReason}
                    </div>
                  )}
                </div>

              </div>

              {/* สรุป/สถานะ/ลูกค้า/ลูกค้าเป้าหมาย — ต่อในคอลัมน์เดียวกัน */}
              <div style={{width:"100%",padding:"0 16px 16px",display:"flex",flexDirection:"column",gap:14}}>

                {/* ประวัติการต่อรองราคา — ฐานข้อมูลบันทึกให้เองทุกครั้งที่ยอดเปลี่ยน (0148)
                    ไม่เคยต่อรอง = ไม่มีการ์ดนี้ ไม่ขึ้นการ์ดว่างให้รก */}
                {(() => {
                  const nego = negotiationSummary(selected);
                  if (!nego) return null;
                  const ลด = nego.diff < 0;
                  return (
                    <div style={cardStyle}>
                      <div style={secLabel}><History size={13} color={PRIMARY}/> ประวัติการต่อรองราคา</div>
                      {/* สรุปหัวการ์ด: ตั้งต้น → ปัจจุบัน · ต่างกันเท่าไร กี่เปอร์เซ็นต์ */}
                      <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",marginBottom:12}}>
                        <span style={{fontSize:"0.78rem",color:MUTED,textDecoration:"line-through"}}>{fmtBaht(nego.first)}</span>
                        <ArrowRight size={12} color="#8a929c"/>
                        <span style={{fontSize:"0.9rem",fontWeight:800,color:STEEL}}>{fmtBaht(nego.last)}</span>
                        <span style={{fontSize:"0.7rem",fontWeight:700,padding:"2px 8px",borderRadius:99,
                          background: ลด ? "#fef0e6" : "#e5faf0", color: ลด ? "#b45309" : "#059669"}}>
                          {ลด ? "ลด" : "เพิ่ม"} {fmtBaht(Math.abs(nego.diff))} ({Math.abs(nego.pct).toFixed(1)}%)
                        </span>
                        <span style={{fontSize:"0.68rem",color:"#8a929c",marginLeft:"auto"}}>{nego.rounds} รอบ</span>
                      </div>
                      {/* ทีละรอบ ใหม่สุดอยู่บน */}
                      <div style={{display:"flex",flexDirection:"column",gap:0}}>
                        {[...(selected.priceHistory ?? [])].reverse().map((h, i, arr) => {
                          const รอบ = arr.length - i;
                          const ต่าง = h.to - h.from;
                          return (
                            <div key={`${h.at}-${รอบ}`} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",
                              borderTop: i === 0 ? "1px solid #eef1f5" : "1px solid #f6f8fa"}}>
                              <span style={{flexShrink:0,width:22,height:22,borderRadius:99,background:"#f4f7fb",color:PRIMARY,
                                fontSize:"0.62rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{รอบ}</span>
                              <div style={{minWidth:0,flex:1}}>
                                <div style={{fontSize:"0.74rem",color:STEEL,fontVariantNumeric:"tabular-nums"}}>
                                  {fmtBaht(h.from)} <span style={{color:"#8a929c"}}>→</span> <span style={{fontWeight:700}}>{fmtBaht(h.to)}</span>
                                </div>
                                {h.note && <div style={{fontSize:"0.68rem",color:MUTED,marginTop:2}}>{h.note}</div>}
                              </div>
                              <div style={{textAlign:"right",flexShrink:0}}>
                                <div style={{fontSize:"0.7rem",fontWeight:700,color: ต่าง < 0 ? "#b45309" : "#059669",fontVariantNumeric:"tabular-nums"}}>
                                  {ต่าง < 0 ? "−" : "+"}{fmtBaht(Math.abs(ต่าง))}
                                </div>
                                <div style={{fontSize:"0.63rem",color:"#9ca3af"}}>{fmtStamp(h.at)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Status workflow */}
                {แก้ได้(selected)&&STATUS_ACTIONS[selected.status].length>0&&(
                  <div style={cardStyle}>
                    <div style={secLabel}><ArrowRight size={13} color={PRIMARY}/> เปลี่ยนสถานะ</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {STATUS_ACTIONS[selected.status].map(action=>(
                        <button key={action.next} onClick={()=>action.next==="lost"?setPendingLostQ(selected):changeStatus(selected.id,action.next)} className="btn"
                          style={{justifyContent:"space-between",padding:"9px 12px",background:action.bg,border:"none",width:"100%"}}>
                          <span style={{fontSize:"0.72rem",fontWeight:700,color:action.color}}>{action.label}</span>
                          <ArrowRight size={13} color={action.color}/>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Floating action bar */}
            <div style={{flexShrink:0,borderTop:"1px solid #e6eaf0",background:"#fafbfc",padding:"11px 20px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:"0.68rem",color:"#8a929c",display:"flex",alignItems:"center",gap:5}}><Coins size={13} color={PRIMARY}/> มูลค่างาน (ก่อน VAT) {fmtBaht(net)} · ยอดชำระสุทธิ {fmtBaht(ภาษี.netPayable)}</span>
              {/* ปุ่ม "แก้ไข" + "พิมพ์ / ดาวน์โหลด PDF" ที่แถบล่าง ลบตามที่บอสสั่ง
                  ซ้ำกับปุ่มบนหัวแผงสีน้ำเงินอยู่แล้ว (พิมพ์ PDF · แก้ไข) */}
            </div>
          </div>
        </>
        );
      })()}

      {/* Delete confirm dialog */}
      {delTarget&&(
        <div onClick={()=>setDelTarget(null)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.5)",zIndex:220,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:360,background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
            <div style={{padding:"22px 22px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{width:38,height:38,borderRadius:"50%",background:"#fee2e2",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Trash2 size={17} color="#dc2626"/></span>
                <div style={{fontSize:"1rem",fontWeight:800,color:STEEL}}>ลบใบเสนอราคา</div>
              </div>
              {delTarget.status==="won" ? (
                // ใบที่ปิดการขายแล้วคือประวัติยอดขายจริง — เตือนแรงกว่าใบร่างทั่วไป กันมือลื่นลบยอดที่ปิดได้แล้ว
                // (พบจากผลตรวจสอบระบบ 30 ก.ค. 69, Low: ข้อความเดิมเหมือนกันหมดทุกสถานะ ไม่มีสัญญาณเตือนพิเศษ)
                <p style={{fontSize:"0.8rem",color:"#dc2626",lineHeight:1.6,margin:0,fontWeight:600}}>
                  ใบนี้ <strong>ปิดการขายแล้ว</strong> (฿{Math.round(delTarget.totalValue).toLocaleString("th-TH")}) — ลบแล้วยอดขายของ {delTarget.customer} จะถูกหักออกด้วย และการลบไม่สามารถย้อนกลับได้
                </p>
              ) : (
                <p style={{fontSize:"0.8rem",color:MUTED,lineHeight:1.6,margin:0}}>ต้องการลบ <strong style={{color:STEEL}}>{delTarget.id}</strong>? การลบไม่สามารถย้อนกลับได้</p>
              )}
            </div>
            <div style={{padding:"14px 22px",borderTop:`1px solid ${BORDER}`,background:"#fafafa",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button className="btn btn-secondary btn-md" onClick={()=>setDelTarget(null)}>ยกเลิก</button>
              <button className="btn btn-md" style={{background:"#dc2626",color:"#fff",border:"none"}} onClick={deleteQ}><Trash2 size={13}/> ลบ</button>
            </div>
          </div>
        </div>
      )}

      {/* เลือกเหตุผลก่อน "ลูกค้าปฏิเสธ" — บังคับเลือกเสมอ (ชุดเหตุผลเดียวกับที่ลูกค้าเป้าหมายใช้) */}
      {pendingLostQ && (
        <div onClick={()=>setPendingLostQ(null)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.5)",zIndex:230,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:420,background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,.3)"}}>
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:9}}>
              <span style={{fontSize:"0.9rem",fontWeight:800,color:"#dc2626"}}>ลูกค้าปฏิเสธ — ระบุเหตุผล</span>
            </div>
            <div style={{padding:"16px 18px"}}>
              {lostReasons.includes(pendingLostReason) || pendingLostReason === "" ? (
                <>
                  <div style={{fontSize:"0.75rem",color:MUTED,marginBottom:10}}>เลือกเหตุผลที่ลูกค้าปฏิเสธใบเสนอราคานี้</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {/* ⚠️ ถ้า "อื่นๆ (ระบุเอง)" อยู่ในรายการที่สำนักงานใหญ่ตั้งไว้ กดตัวนั้น = เปิดโหมดพิมพ์เอง
                        ไม่ใช่บันทึกคำว่า "อื่นๆ" ลงไปตรง ๆ (กติกาเดียวกับหน้าลูกค้าเป้าหมาย) */}
                    {lostReasons.map(r=>(
                      <button key={r} onClick={()=>setPendingLostReason(r===OTHER_REASON_OPTION?OTHER_REASON:r)}
                        style={{padding:"8px 10px",borderRadius:9,border:`1px solid ${pendingLostReason===r?"#dc2626":BORDER}`,
                          background:pendingLostReason===r?"#fef2f2":"#fff",color:pendingLostReason===r?"#dc2626":"#374151",
                          fontSize:"0.76rem",fontWeight:700,cursor:"pointer",textAlign:"left"}}>
                        {r}
                      </button>
                    ))}
                    {/* เหตุผลจริงไม่ตรงกับรายการที่ HQ กำหนดเลย → กรอกเองได้ (บอสสั่ง 31 ก.ค. 69)
                        โผล่เฉพาะตอนรายการยังไม่มีตัวเลือกนี้ ไม่งั้นจะมีปุ่มชื่อเดียวกันสองอันในจอเดียว */}
                    {!lostReasons.includes(OTHER_REASON_OPTION) && (
                      <button onClick={()=>setPendingLostReason(OTHER_REASON)}
                        style={{padding:"8px 10px",borderRadius:9,border:"1px dashed #9ca3af",
                          background:"#fafafa",color:"#6b7280",fontSize:"0.76rem",fontWeight:700,cursor:"pointer",textAlign:"left"}}>
                        {OTHER_REASON_OPTION}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{fontSize:"0.75rem",color:MUTED,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>ระบุเหตุผลที่ลูกค้าปฏิเสธใบเสนอราคานี้</span>
                    <button type="button" onClick={()=>setPendingLostReason("")} style={{background:"none",border:"none",cursor:"pointer",color:"#003366",fontSize:"0.72rem",fontWeight:700}}>← กลับไปเลือกจากรายการ</button>
                  </div>
                  <input autoFocus value={pendingLostReason === OTHER_REASON ? "" : pendingLostReason} onChange={e=>setPendingLostReason(e.target.value)} placeholder="พิมพ์เหตุผล…"
                    style={{width:"100%",border:`1px solid ${BORDER}`,borderRadius:9,padding:"9px 12px",fontSize:"0.82rem",color:"#2D2D2D",outline:"none",boxSizing:"border-box",fontFamily:"inherit"}} />
                </>
              )}
            </div>
            <div style={{padding:"12px 18px",borderTop:`1px solid ${BORDER}`,display:"flex",justifyContent:"flex-end",gap:8,background:"#fafafa"}}>
              <button onClick={()=>setPendingLostQ(null)} className="btn btn-secondary btn-md">ยกเลิก</button>
              <button onClick={confirmPendingLost} disabled={!pendingLostReason.trim() || pendingLostReason===OTHER_REASON} className="btn btn-md"
                style={{background:"#dc2626",color:"#fff",opacity:pendingLostReason.trim() && pendingLostReason!==OTHER_REASON ?1:0.5,cursor:pendingLostReason.trim() && pendingLostReason!==OTHER_REASON ?"pointer":"not-allowed"}}>
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal — แก้ไขใบที่ทำจากใบ HQ (ออกใบใหม่ทำที่แผงลูกค้าเป้าหมาย) */}
      {showModal && editingQ && (
        <QuotationModal
          title="แก้ไขใบเสนอราคา"
          initial={toForm(editingQ)}
          customers={customers}
          quoteId={editingQ.id}
          hqQuoteId={editingQ.hqQuoteId}
          locked={editingQ.status==="won"&&!!editingQ.hqQuoteId}
          onSave={saveQ} onClose={()=>setShowModal(false)}/>
      )}

      {/* Toast — การแจ้งเตือนสั้นๆ */}
      {toast&&(
        <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:300,
          background:PRIMARY,color:"#fff",padding:"11px 20px",borderRadius:12,
          boxShadow:"0 12px 40px rgba(0,0,0,.28)",display:"flex",alignItems:"center",gap:9,
          fontSize:"0.8rem",fontWeight:700,maxWidth:"calc(100vw - 32px)"}}>
          <span style={{width:18,height:18,borderRadius:99,background:"rgba(255,255,255,.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✓</span>
          {toast}
          {justWonCompany && (
            <button onClick={() => router.push(`/customers?search=${encodeURIComponent(justWonCompany)}`)}
              style={{ background:"rgba(255,255,255,.18)", color:"#fff", border:"none", borderRadius:8,
                padding:"5px 11px", fontSize:"0.74rem", fontWeight:700, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>
              ดูลูกค้าใหม่ →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
