"use client";

import { quoteExpiryISO, daysUntilISO } from "@pms/shared/lib/quoteExpiry";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { useKpiCards } from "@pms/shared/lib/useKpiCards";
import { ค่า, นับ, บาทเต็ม, วันที่ISO, ชุดที่กรอง, type KpiFilters } from "@pms/shared/lib/kpiCards";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { SortableTh } from "@pms/shared/components/ui/SortableTh";
import { useRouter } from "next/navigation";
import { quotationStatusLabel, quotationStatusColor, DEFAULT_ISSUER, DEFAULT_DEALER_CODE, type QuotationStatus, type QuotationMock, type IssuerProfile } from "@pms/shared/lib/mock";
import { AssigneeAvatars } from "@pms/shared/components/ui/PersonPicker";
import { DEFAULT_DOC, type DocProfile } from "@pms/shared/lib/quotationPrint";
import { useSales } from "@pms/shared/context/SalesContext";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import { useQuoteValidity } from "@pms/shared/lib/useQuoteValidity";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { useFilters, FilterProvider } from "@pms/shared/context/FilterContext";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { FilterRow, FilterSelect } from "@pms/shared/components/filters/FilterRow";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useTableLayout, type Col } from "@pms/shared/components/ui/TableTools";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { X, FileText, LayoutList, LayoutGrid, ChevronUp, ChevronDown, Eye, ChevronLeft, ChevronRight, Check, Hourglass, AlarmClock } from "lucide-react";

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
// แม่แบบ = แคตตาล็อกกลาง (useMasterCatalog ในคอมโพเนนต์)

// ── Dealer identity — ใบเสนอราคาออกในนามบริษัทของดีลเลอร์เอง (ไม่ใช่เบญจมินทร์) ──
// ค่าเริ่มต้น + คีย์ = แหล่งเดียวใน mock (DEFAULT_ISSUER/ISSUER_KEY) ใช้ร่วมกับใบเสนอราคา inline
type Issuer = IssuerProfile;
// ตรา/ลายเซ็น/VAT/prefix มาจาก quotationPrint (DocProfile/DEFAULT_DOC/DOC_KEY) — แหล่งเดียวร่วมกับใบเสนอ inline

// ── Helpers ───────────────────────────────────────────────────
function fmtDate(d:string){ if(!d||d==="—") return "—"; const [y,m,day]=d.split("-"); const mo=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."]; return `${parseInt(day)} ${mo[parseInt(m)-1]} ${parseInt(y)+543}`; }
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
// ฟอร์มแก้ไขใบ/ส่ง/ตอบรับ/ปฏิเสธ ย้ายไปแผงลีด › แท็บใบเสนอราคาที่เดียว (รอบ 4 · LeadQuotationsPanel)

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
  const { passes, timeRange } = useFilters(); // timeRange = ช่วงของการ์ด "ตอบรับในช่วงนี้" (ใบ 0246)
  // ค่าคุมจาก HQ (อ่านผ่าน repo · อัปเดตตามเมื่อ HQ แก้) — อายุใบมีผลกับการคิดวันหมดอายุ
  // อายุใบของ "สาขา" มาก่อนนโยบายเครือ (บอสสั่ง 20 ส.ค. 69) — สาขาตั้งไว้เท่าไรต้องใช้ค่านั้นจริง
  const validityDays = useQuoteValidity();
  const {
    quotations: allQuotationsRaw, customers: allCustomersRaw, leads: allLeads, salesVersion,
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
  // การ์ด "ใกล้หมดอายุ 3 วัน" (ใบ 0246) — ส่งลูกค้าแล้ว และวันยืนราคาในใบเหลือ 0–3 วัน (กติกาเดียวกับฐาน _quote_valid_until)
  const [ใกล้หมดอายุ, setใกล้หมดอายุ] = useState(false);
  const วันนี้ = วันที่ISO(APP_NOW);
  const หมดใน3วัน = useCallback((q: QuotationMock) => { const n = daysUntilISO(quoteExpiryISO(q, validityDays), วันนี้); return q.status === "sent_to_client" && n != null && n >= 0 && n <= 3; }, [validityDays, วันนี้]);
  // ?kpi= จากการ์ดหน้าอื่น — awaiting (แดชบอร์ด "รอลูกค้าตอบ") · won (หน้าลูกค้า "ยอดขายจากลูกค้าในช่วงนี้") — เปิดหน้ามากรองตามนั้น
  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("kpi");
    if (k === "awaiting") setFilterStatus("sent_to_client");
    else if (k === "won") setFilterStatus("won");
  }, []);
  // ตัวกรองในแถบ FilterRow — ตัวเลือกสร้างจากใบเสนอราคาจริงที่มีอยู่
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [provFilter, setProvFilter]   = useState("ALL");
  const [view, setView]             = useState<"list"|"card">("list");
  // ค่าเริ่มต้น = ไม่เลือกคอลัมน์ → ใบที่สร้างล่าสุดขึ้นก่อน · บอสสั่ง 21 ก.ย. 69 ทุกตาราง
  // ⚠️ ห้ามเรียงด้วย date — ค่านี้ถูกตั้งใหม่ทุกครั้งที่กดส่ง ใบเก่าที่เพิ่งส่งจะเด้งขึ้นบนสุด
  const [sortKey, setSortKey]       = useState<SortKey|null>(null);
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const [page, setPage]             = useState(1);
  // เปิดใบตรงจากลิงก์ /quotations?open=<เลขใบ> — ปุ่ม "ขั้นต่อไป" ในแผงลูกค้าเป้าหมายพามา (ส่งให้ลูกค้า / บันทึกผล)
  //   รอข้อมูลโหลดก่อน · เปิดครั้งเดียวต่อการเข้าหน้า
  const เปิดจากลิงก์ = useRef(false);
  // ใบที่กำลังจะลบ — เก็บ "ตัวใบ" ไม่ใช่ boolean เพราะลบได้จากรายการโดยไม่ต้องเปิดแผงรายละเอียด
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

  // ?open=เลขใบ (กระดิ่ง "ใบเสนอราคาใกล้หมดอายุ" · ใบ 0231) — เปิดใบนั้นเมื่อข้อมูลมาถึง แล้วล้างออกจาก URL
  //   อยู่หน้านี้อยู่แล้วกดกระดิ่งอีก (เปลี่ยนแค่ ?open=) หน้าไม่โหลดใหม่ → ฟัง bpms:open-record
  const [ขอเปิด,setขอเปิด]=useState<string|null>(null);
  useEffect(()=>{
    if(!เปิดจากลิงก์.current){ เปิดจากลิงก์.current=true; setขอเปิด(new URLSearchParams(window.location.search).get("open")); }
    const on=(e:Event)=>{
      const href=String((e as CustomEvent).detail??"");
      if(href.startsWith("/quotations?")) setขอเปิด(new URLSearchParams(href.slice(href.indexOf("?"))).get("open"));
    };
    window.addEventListener("bpms:open-record",on);
    return ()=>window.removeEventListener("bpms:open-record",on);
  },[]);
  useEffect(()=>{
    if(!ขอเปิด) return;
    const q=data.find(x=>x.id===ขอเปิด);
    // รอบ 4: ใบเปิดดู/ทำงานที่แผงลีด — ลิงก์ ?open=<เลขใบ> (กระดิ่ง/ค้นหา) พาไปแผงลีดของใบนั้นแทน
    if(q){ setขอเปิด(null); window.history.replaceState(null,"","/quotations"); selectRow(q); }
  },[data,ขอเปิด]);

  // ตัวกรองอื่นของหน้า (ค้นหา/ผู้รับผิดชอบ/จังหวัด/สถานะของแถบกลาง · ไม่รวมช่วงเวลาและการ์ดที่กด) — ตารางกับการ์ด KPI ใช้ตัวเดียวกัน
  //   (บอสตัดสิน 27 ต.ค. 69 การ์ดเดินตามตัวกรอง)
  const ตรงตัวกรองอื่น = useCallback((q: QuotationMock)=>{
    const matchQ=!query||q.id.toLowerCase().includes(query.toLowerCase())||q.customer.toLowerCase().includes(query.toLowerCase())||q.project.toLowerCase().includes(query.toLowerCase())||q.province?.includes(query);
    const matchOwner=ownerFilter==="ALL"||ownerOf(q)===ownerFilter;
    const matchProv=provFilter==="ALL"||q.province===provFilter;
    return matchQ&&matchOwner&&matchProv&&passes({ status:q.status, province:q.province });
  },[query,ownerFilter,provFilter,passes,ownerOf]);
  const ชุดการ์ด = useMemo(()=>ชุดที่กรอง(data, ตรงตัวกรองอื่น, q=>q.id),[data,ตรงตัวกรองอื่น]);
  const filtered = useMemo(()=>{
    let rows=data.filter(q=>{
      const matchS=(filterStatus==="ALL"||q.status===filterStatus)&&(!ใกล้หมดอายุ||หมดใน3วัน(q));
      // FilterBar กลาง: ช่วงเวลา (date) — สถานะ/จังหวัดอยู่ใน ตรงตัวกรองอื่น
      return ตรงตัวกรองอื่น(q)&&matchS&&passes({ date:q.date });
    });
    if(sortKey===null) return [...rows].sort(ใหม่ก่อน);
    rows=[...rows].sort((a,b)=>{
      const va:string|number=a[sortKey] as string|number;
      const vb:string|number=b[sortKey] as string|number;
      const cmp=typeof va==="number"?(va as number)-(vb as number):(va as string).localeCompare(vb as string,"th");
      return sortDir==="asc"?cmp:-cmp;
    });
    return rows;
  },[data,ตรงตัวกรองอื่น,filterStatus,ใกล้หมดอายุ,sortKey,sortDir,passes]);

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


  // ── กดแถว = เปิดแผงลีดของใบนั้น (รอบ 4 · บอสสั่ง 21 ต.ค. 69) ───────────────────────────────────────────────
  //   ส่ง ตอบรับ ปฏิเสธ แก้ ทำฉบับใหม่ พิมพ์ ทำที่แผงลีด › แท็บใบเสนอราคาที่เดียว · ลีดที่ปิดสำเร็จแล้ว แผงลีดพาไปหน้าลูกค้าเอง
  //   ใบเดิมที่ไม่ผูกลีด (ก่อนมี dealId) → แผงลูกค้า · ไม่มีทั้งคู่ = บอกตรง ๆ ว่าเปิดไม่ได้
  function selectRow(q:QuotationMock){
    if(q.dealId!=null) router.push(`/leads?open=${q.dealId}`);
    else if(q.customerId) router.push(`/customers?open=${q.customerId}`);
    else showToast(`ใบ ${q.id} เป็นใบเดิมที่ไม่ผูกลูกค้าเป้าหมาย — เปิดดูได้จากหน้าลูกค้า`);
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

        {/* ── การ์ด KPI 4 ใบ (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) — ตัวเลขคิดที่ฐาน (kpi_cards · สาขาของผู้ล็อกอิน) · กดการ์ด = กรองตาราง (กดซ้ำ = ล้าง) ──
              ใบร่าง/รอลูกค้าตอบ/ใกล้หมดอายุ = ณ ตอนนี้ · ตอบรับ = ตามวันลูกค้าตอบรับในช่วงที่เลือก (ยอดก่อน VAT) */}
        {(() => {
          const ช่วง = { start: วันที่ISO(timeRange.start), end: วันที่ISO(timeRange.end) };
          return <KpiCardsRow ช่วง={ช่วง} วันนี้={วันนี้} ตัวกรอง={ชุดการ์ด} รุ่น={salesVersion} filterStatus={filterStatus} ใกล้หมดอายุ={ใกล้หมดอายุ}
            กด={(s, หมด) => { const ซ้ำ = หมด ? ใกล้หมดอายุ : filterStatus === s && !ใกล้หมดอายุ; setใกล้หมดอายุ(!ซ้ำ && หมด); setFilterStatus(ซ้ำ ? "ALL" : s); }} />;
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
                  <col style={{width:170}} />{/* เลขที่ — ฉบับใหม่ "Q-RYG-2026-4104-V2" ต้องเห็น "-V2" เต็ม (บอสสั่ง 21 ต.ค. 69) · ป้ายฉบับขึ้นบรรทัดล่างได้ */}
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
                    const sc=quotationStatusColor[q.status]; const isSel=false;
                    return (
                      <ClickableRow key={q.id} onActivate={()=>selectRow(q)} className="clickable"
                        label={`เปิดรายละเอียดใบเสนอราคา ${q.id}`}
                        style={{background:isSel?"#f0f6ff":undefined}}>
                        {/* ไอคอนเอกสารหน้าเลขที่เอาออก — ซ้ำกันทุกแถว ไม่ได้บอกอะไร แลกที่ให้คอลัมน์อื่น */}
                        <td>
                          {/* เลขที่ + ฉบับ (บอสสั่ง 21 ส.ค. 69) — ต้องรู้จากตารางเลยว่าใบนี้แก้มากี่รอบแล้ว */}
                          <span style={{display:"flex",alignItems:"center",gap:"2px 6px",flexWrap:"wrap"}}>
                            <span data-quote-no style={{fontSize:"0.8rem",fontWeight:700,color:STEEL,fontFamily:"monospace",whiteSpace:"nowrap"}}>{q.id}</span>
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
                        {/* ปุ่มทำงานรายใบเอาออก (รอบ 4) — กดแถวแล้วเปิดแผงลีดของใบนั้น ทำทุกอย่างที่นั่น */}
                        <td style={{textAlign:"right"}}><Eye size={13} color={MUTED} aria-hidden /></td>
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
                const sc=quotationStatusColor[q.status]; const isSel=false;
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

// แถวการ์ด KPI ของหน้าใบเสนอราคา — แยกเป็นคอมโพเนนต์ระดับไฟล์ (ห้ามประกาศซ้อนในคอมโพเนนต์หลัก)
function KpiCardsRow({ ช่วง, วันนี้, ตัวกรอง, รุ่น, filterStatus, ใกล้หมดอายุ, กด }: {
  ช่วง: { start: string; end: string }; วันนี้: string; ตัวกรอง: KpiFilters | null; รุ่น: unknown; filterStatus: QuotationStatus | "ALL"; ใกล้หมดอายุ: boolean;
  กด: (s: QuotationStatus, ใกล้หมด: boolean) => void;
}) {
  const kpi = useKpiCards("dealer.quotations", { ...ช่วง, today: วันนี้, filters: ตัวกรอง, รุ่น });
  const cards = [
    { kpi: "drafts", label: "ใบร่าง", value: ค่า(kpi, "drafts"), unit: "ใบ · ยังไม่ส่งลูกค้า", icon: FileText, color: "#2563EB", bg: "#E8F0FE", on: filterStatus === "draft" && !ใกล้หมดอายุ, s: "draft" as const, หมด: false },
    { kpi: "awaiting", label: "รอลูกค้าตอบ", value: ค่า(kpi, "awaiting"), unit: "ใบ · ส่งลูกค้าแล้ว", icon: Hourglass, color: "#EA580C", bg: "#FEF0E6", on: filterStatus === "sent_to_client" && !ใกล้หมดอายุ, s: "sent_to_client" as const, หมด: false },
    { kpi: "won", label: "ตอบรับในช่วงนี้", value: ค่า(kpi, "won.count"), unit: "ใบ · ตามวันลูกค้าตอบรับ", sub: ค่า(kpi, "won.value") == null ? undefined : `มูลค่า ${บาทเต็ม(ค่า(kpi, "won.value"))} (ก่อน VAT)`,
      icon: Check, color: "#0D9488", bg: "#E6F7F5", on: filterStatus === "won", s: "won" as const, หมด: false },
    { kpi: "expiring", label: "ใกล้หมดอายุ 3 วัน", value: ค่า(kpi, "expiring"), unit: "ใบ · ตามวันยืนราคาในใบ", icon: AlarmClock, color: "#DC2626", bg: "#FEE2E2", danger: (ค่า(kpi, "expiring") ?? 0) > 0,
      on: ใกล้หมดอายุ, s: "sent_to_client" as const, หมด: true },
  ];
  return (
    <KpiRow label="สรุปใบเสนอราคา" range={ช่วง} style={{ marginBottom: 16 }}>
      {cards.map(k => (
        <KpiCard key={k.kpi} kpi={k.kpi} label={k.label} value={นับ(k.value)} rawValue={k.value} unit={k.unit} sub={k.sub} danger={k.danger}
          icon={k.icon} color={k.color} bg={k.bg} actionLabel={k.on ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ"} onClick={() => กด(k.s, k.หมด)} />
      ))}
    </KpiRow>
  );
}
