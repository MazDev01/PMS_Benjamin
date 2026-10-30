"use client";

import { ProvinceSelect } from "@pms/shared/components/ui/ProvinceSelect";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { มูลค่าลีด } from "@pms/shared/lib/mock";   // มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)
import { useRouter } from "next/navigation";
import { KpiRow, KpiCard } from "@pms/shared/components/ui/KpiCard";
import { useKpiCards } from "@pms/shared/lib/useKpiCards";
import { ค่า, นับ, บาทเต็ม, วันที่ISO, ชุดที่กรอง, type KpiFilters } from "@pms/shared/lib/kpiCards";
import { validateUpload, humanFileSize, UPLOAD_ACCEPTED_EXT } from "@pms/shared/lib/uploadLimits";
import { printQuotation } from "@pms/shared/lib/quotationPrint";
import { buildLeadTasks, leadStatusLabel, QUOTED_UP, DEFAULT_DEALER_CODE, quotationStatusLabel, quotationStatusColor, noteCategoryColor, fmtISOToThai, customerCode, DEALER_FILES_EVENT, extOfName, guessFileCategory, apptTypeLabel, type QuotationMock, type QuoteLineItem, type LeadRow, type CustomerRow, type DealerFile, type LeadStatus, type AppointmentMock, type LeadActivity, type CustomerStatus } from "@pms/shared/lib/mock";
import { useCustomerNotes } from "@pms/shared/lib/useCustomerNotes";
import { อ่านตารางจากไฟล์, นามสกุลที่รับได้ } from "@pms/shared/lib/importSheet";
import { CSV_HEADERS, จับคู่คอลัมน์, แถวตัวอย่าง, แผ่นค่าที่เลือกได้, เนื้อไฟล์Csv, type ImportRow, type ค่าที่ระบบมี as ค่าที่เลือกได้ในระบบ } from "@pms/shared/lib/customerImportTemplate";
import { สร้างไฟล์Xlsx as สร้างสมุดงานXlsx } from "@pms/shared/lib/exportWorkbook";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { fmtFull as fmtMoney, formatPhone } from "@pms/shared/lib/format";
import { fmtLeadValue } from "@pms/shared/lib/format";

// กันข้อมูลหายถ้าผู้ใช้รีเฟรช/ปิดแท็บระหว่างกำลังบันทึก (พบจริงจากทดสอบโหลด: รีเฟรชทันทีหลังกดบันทึก
// ทำให้คำขอที่กำลังส่งถูกตัดตอนกลางทาง ข้อมูลไม่ถูกสร้างเลยโดยผู้ใช้ไม่รู้ตัว) — เตือนผู้ใช้ก่อนออกจากหน้า
// ระหว่างกำลังส่งคำขอ ให้เวลาตัดสินใจว่าจะรอให้บันทึกเสร็จก่อนหรือไม่
function warnBeforeUnloadDuring<T>(fn: () => Promise<T>): Promise<T> {
  const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", onBeforeUnload);
  return fn().finally(() => window.removeEventListener("beforeunload", onBeforeUnload));
}

// หมวดโน้ตจาก DB เป็นข้อความอิสระ — หมวดที่ไม่รู้จักต้องไม่ทำหน้าพัง ให้ใช้สีของ "ทั่วไป"
const noteColorOf = (cat: string) =>
  (noteCategoryColor as Record<string, { bg: string; text: string; dot: string }>)[cat] ?? noteCategoryColor["ทั่วไป"];
import { useUserProfile } from "@pms/shared/lib/useUserProfile";
import { useDealerSettings } from "@pms/shared/lib/useDealerSettings";
import type { CustomerNote } from "@pms/shared/lib/data/types";
import { boqLineItems, boqSubtotal } from "@pms/shared/lib/boq";
import { useSales } from "@pms/shared/context/SalesContext";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { ReportEditor } from "@pms/shared/components/ui/ReportEditor";
import { useTableLayout, type Col } from "@pms/shared/components/ui/TableTools";
import { PersonPicker } from "@pms/shared/components/ui/PersonPicker";
import { useLeadTaskTemplate } from "@pms/shared/lib/useHQConfig";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import { provincesOfRegion, เป็นจังหวัดมาตรฐาน, ALL_REGIONS } from "@pms/shared/lib/provinces";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { leads as leadsRepo, dealers as dealersRepo, persons as personsRepo } from "@pms/shared/lib/data";
import type { DealerRow } from "@pms/shared/lib/data/types";
import { useDealerVat } from "@pms/shared/lib/useDealerSettings";
import { files as filesRepo, storage as fileStorage, quotations as quotationsRepo } from "@pms/shared/lib/data";
import { เลขขั้นของลีด, ชื่อขั้น, สีขั้น } from "@pms/shared/lib/leadStage";
import { quoteBelongsToLead } from "@pms/shared/lib/leadQuote";
import { ช่องที่ขาดตอนพิมพ์ } from "@pms/shared/lib/issuerComplete";
import { IssuerGuardNote } from "@pms/shared/components/ui/IssuerGuardNote";
import { dealerCodeOf } from "@pms/shared/lib/dealerCode";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { FilterRow, FilterSelect } from "@pms/shared/components/filters/FilterRow";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { useFilters, APP_NOW, APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { ช่อง, ตัวอย่างช่อง, ป้ายบังคับ, กลุ่มช่อง } from "@pms/shared/lib/fieldLabels";
import { Plus, X, ChevronUp, ChevronDown, Upload, Download, Phone, Building2, Calendar, FileText, StickyNote, Check, User, Paperclip, Eye, Printer, MapPin, Mail, Coins, Layers, CalendarClock, Users, Trash2, UserPlus, Briefcase } from "lucide-react";
import { FilePreviewModal } from "@pms/shared/components/ui/FilePreviewModal";
import { ThaiDateInput } from "@pms/shared/components/ui/ThaiDateInput";
import { แจ้งพลาด, แจ้งสำเร็จ, ยืนยัน } from "@pms/shared/components/ui/ConfirmToast";
import { ลบไฟล์, ลบไฟล์ได้ } from "@pms/shared/lib/fileDelete";
import { ตารางรายการ } from "@pms/shared/components/ui/LineItemsTable";
import { จัดรูปจำนวน, จัดรูปหน่วย } from "@pms/shared/lib/lineItemColumns";

// ── Design tokens ────────────────────────────────────────────
const PRIMARY = "#003366";
const STEEL   = "#2D2D2D";
const BORDER  = "#e5e7eb";
const MUTED   = "#6b7280";

// เกณฑ์ไฟล์แนบใช้ของกลาง (uploadLimits) — ทุกช่องแนบเขียนลงคลังไฟล์เดียวกัน ห้ามตั้งกฎเองรายหน้า

// ── Types ────────────────────────────────────────────────────
// CustomerRow imported from mock (shared app-wide)
type SortKey = "company"|"name"|"phone"|"province"|"owner"|"lastActivity"|"quotationCount"|"joinDate";
type SortDir = "asc"|"desc";

// สาขาที่ยังไม่มีภาค = เลือกได้ทั้ง 77 จังหวัด (เดิมรายชื่อสำรองมีชื่อย่อ "กรุงเทพฯ" / "อื่นๆ" ที่ฐานไม่รับ)
const PROVINCES = provincesOfRegion(ALL_REGIONS);

// ── จังหวัดที่เลือกได้ = จังหวัดใน "ภาค" ของสาขาที่ล็อกอิน (บอสสั่ง 17 ส.ค. 69) ──
// กติกาเดียวกับหน้าลูกค้าเป้าหมาย · ค่าที่บันทึกไว้แล้วแต่อยู่นอกภาค ต้องยังเห็นในลิสต์ ห้ามให้หายเงียบ
function useMyProvinces(): string[] {
  const me = useCurrentDealer();
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);
  return useMemo(() => {
    const mine = dealers.find(d => d.code === me.code);
    const inRegion = provincesOfRegion(mine?.region ?? "");
    if (inRegion.length) {
      return mine?.province && !inRegion.includes(mine.province) ? [mine.province, ...inRegion] : inRegion;
    }
    return [...PROVINCES];
  }, [dealers, me.code]);
}

function initials(name:string){ return name.replace(/บจ\.|หจก\./g,"").trim().slice(0,2); }
// ── นำเข้าลูกค้าเดิม (CSV/Excel) ────────────────────────────
// นิยามคอลัมน์ · แถวตัวอย่าง · แผ่น "ค่าที่เลือกได้" ย้ายไปอยู่ที่ shared/lib/customerImportTemplate.ts
//   เพราะต้องตรงกับปุ่มส่งออกและตัวอ่านไฟล์เสมอ และหน้านี้เป็น "use client" เทสต์เรียกตรง ๆ ไม่ได้
function บันทึกไฟล์(blob:Blob, ชื่อ:string){
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=ชื่อ; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
// เทมเพลตหลัก = ไฟล์ Excel เปิดแล้วเป็นตารางพร้อมพิมพ์ (บอสแจ้ง 28 ส.ค. 69 ว่าไฟล์ CSV เปิดมาเป็นข้อความ กรอกต่อไม่ได้)
//   สองแผ่น: "ลูกค้าเดิม" ไว้กรอก · "ค่าที่เลือกได้" ลอกค่าจริงจากระบบมาให้ดูคู่กัน จะได้กรอกแล้วนำเข้าได้เลย
function downloadXlsxTemplate(ค่า: ค่าที่เลือกได้ในระบบ){
  บันทึกไฟล์(สร้างสมุดงานXlsx([
    { ชื่อ:"ลูกค้าเดิม", หัวตาราง:CSV_HEADERS, แถว:[แถวตัวอย่าง(ค่า)] },
    แผ่นค่าที่เลือกได้(ค่า),
  ]), "เทมเพลตลูกค้าเดิม.xlsx");
}
// เผื่อใครถนัด CSV หรือใช้ Google ชีต — ไฟล์เดียวไม่มีแผ่นที่สอง จึงต่อค่าที่เลือกได้เป็นบรรทัดหมายเหตุท้ายไฟล์
function downloadCsvTemplate(ค่า: ค่าที่เลือกได้ในระบบ){
  บันทึกไฟล์(new Blob(["\ufeff"+เนื้อไฟล์Csv(ค่า)],{type:"text/csv;charset=utf-8"}), "เทมเพลตลูกค้าเดิม.csv");
}
const THAI_MO=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
// "วันนี้" ต้องเป็นวันของระบบ (APP_NOW = 30 มิ.ย. 2569) ไม่ใช่นาฬิกาเครื่อง
// ใช้ new Date() = ดีลใหม่ได้วันที่ล่วงหน้าจากยุคของข้อมูล แล้วหลุดนอกช่วงตัวกรองทุกพรีเซ็ต (ทุกพรีเซ็ตจบที่ APP_NOW)
function thaiToday(){ const d=APP_NOW; return `${d.getDate()} ${THAI_MO[d.getMonth()]} ${d.getFullYear()+543}`; }
// จัดรูปแบบมูลค่า (Expected Revenue) จากสตริงดิบ → "฿1.2M" / "฿480K" · ว่าง = ""
function fmtDate(d:string){
  if(!d||d==="—") return "—";
  const [y,m,day]=d.split("-");
  const months=["","ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
  return `${parseInt(day)} ${months[parseInt(m)]} ${parseInt(y)+543}`;
}
const PALETTE = ["#003366","#059669","#f59e0b","#dc2626","#002244","#8fa3b8","#2D2D2D","#C0C0C0"];
const PAGE_SIZE = 10;

// ── Optional table columns (แสดง/ซ่อนได้ผ่าน TableTools) ──────
// key ต้องตรงกับที่ใช้ hide/show ทั้ง <col>/<th>/<td>
const COLS: Col[] = [
  { key: "owner",          label: ช่อง.ผู้รับผิดชอบ },
  { key: "lastActivity",   label: "กิจกรรมล่าสุด" },
  { key: "quotationCount", label: "จำนวนใบเสนอราคา" },
  { key: "totalSales",     label: "ยอดขายรวม" },
  { key: "currentDeal",    label: "สินค้าที่ซื้อไป" },
];

// ── Derived (deterministic) per-customer values ──────────────
// ทุกฟังก์ชันรับ qs = ใบเสนอราคาจาก context (แหล่งความจริงเดียว) เพื่อให้ค่าตอบ runtime
// จำนวนใบเสนอราคาของลูกค้า
function quotationCountFor(customerId:number, qs:QuotationMock[]){
  return qs.filter(q=>q.customerId===customerId).length;
}
// กิจกรรมล่าสุด — วันที่ใบเสนอราคาล่าสุด (deterministic) มิเช่นนั้นใช้วันที่เพิ่มลูกค้า
function lastActivityFor(customerId:number, joinDate:string, qs:QuotationMock[]){
  const dates = qs.filter(q=>q.customerId===customerId).map(q=>q.date);
  if(dates.length===0) return joinDate || "—";
  return dates.reduce((a,b)=>a>b?a:b);
}
// ── Per-customer metrics (deterministic, derived) ────────────
// ยอดขายรวม — ผลรวม totalValue ของใบเสนอราคาที่ปิดการขาย (won)
function totalSalesFor(customerId:number, qs:QuotationMock[]){
  return qs.filter(q=>q.customerId===customerId && q.status==="won").reduce((s,q)=>s+q.totalValue,0);
}
// จำนวนใบเสนอราคาที่ปิดการขายแล้ว (won)
function wonQuotationCountFor(customerId:number, qs:QuotationMock[]){
  return qs.filter(q=>q.customerId===customerId && q.status==="won").length;
}
// ⚠️ เคยมี purchasedItemsFor (ชื่อแม่แบบของใบที่ปิดการขาย) ไว้ทำคอลัมน์ "สินค้าที่ซื้อไป" ในไฟล์ส่งออก
//    เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 → ลบทิ้ง ข้อมูล building_type ยังอยู่ในฐาน แค่ไม่แสดงแล้ว
// พิมพ์ข้อมูลลูกค้า — เปิดหน้าต่างพิมพ์ (ข้อมูลลูกค้า + ประวัติการปิดการขาย) · รูปแบบเดียวกับ ExportMenu → PDF
function printCustomer(c:CustomerRow, rows:QuotationMock[], code:string){
  const win = window.open("", "_blank", "width=900,height=700");
  if(!win) return;
  // XSS: หน้านี้ประกอบ HTML ด้วย document.write() ตรงๆ — ต้อง escape เอนทิตี HTML จริง ไม่ใช่แค่ stringify
  // (เดิม esc() แค่ String(s??"—") ไม่กันเลย — ชื่อบริษัท/ที่อยู่/ชื่องาน ที่มี <script> จะรันจริงตอนพิมพ์)
  const esc = (s:unknown)=>String(s??"—").replace(/[&<>"]/g, c => (({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" } as Record<string,string>)[c]));
  const info: [string,string][] = [
    ["รหัสลูกค้า", code], [ช่อง.ผู้ติดต่อ, esc(c.name)],
    [ช่อง.โทรศัพท์, esc(c.phone)], [ช่อง.อีเมล, esc(c.email)], [ช่อง.ที่อยู่, esc(c.address)],
    // แถว "แม่แบบ" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
    [ช่อง.จังหวัด, esc(c.province)],
    ["เป็นลูกค้าเมื่อ", fmtDate(c.joinDate)], [ช่อง.ผู้รับผิดชอบ, esc(c.owner)],
    ["สถานะ", c.status==="active"?"ใช้งาน":"ไม่ใช้งาน"],
  ];
  const total = rows.reduce((s,q)=>s+q.totalValue,0);
  win.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ข้อมูลลูกค้า — ${esc(c.company)}</title>
    <style>
      *{font-family:"Noto Sans Thai","Sarabun",system-ui,sans-serif;box-sizing:border-box}
      body{margin:28px;color:#2D2D2D}
      h1{font-size:18px;color:#003366;margin:0 0 2px}
      .sub{font-size:11px;color:#6b7280;margin-bottom:18px}
      h2{font-size:13px;color:#003366;margin:20px 0 8px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;font-size:11px}
      .row{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9}
      .k{color:#6b7280;flex:0 0 96px} .v{font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
      th{background:#003366;color:#fff;text-align:left;padding:7px 10px}
      td{padding:6px 10px;border-bottom:1px solid #e5e7eb}
      tr:nth-child(even) td{background:#f8f9fb}
      .num{text-align:right}
      tfoot td{font-weight:800;background:#eef3f8;color:#003366}
    </style></head><body>
    <h1>${esc(c.company)}</h1>
    <div class="sub">ข้อมูลลูกค้า · Benjamin PMS</div>
    <h2>ข้อมูลลูกค้า</h2>
    <div class="grid">${info.map(([k,v])=>`<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}</div>
    <h2>ประวัติการปิดการขาย (${rows.length})</h2>
    ${rows.length===0 ? `<div style="font-size:11px;color:#6b7280">— ยังไม่มีงานที่ปิดการขาย</div>` : `
    <table><thead><tr><th>#</th><th>เลขที่ใบเสนอราคา</th><th>ชื่องาน</th><th>วันที่ซื้อ</th><th class="num">ราคา</th></tr></thead>
    <tbody>${rows.map((q,i)=>`<tr><td>${i+1}</td><td>${esc(q.id)}</td><td>${esc(q.project)}</td><td>${fmtDate(q.date)}</td><td class="num">${fmtMoney(q.totalValue)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td colspan="4" class="num">รวมมูลค่าทั้งหมด</td><td class="num">${fmtMoney(total)}</td></tr></tfoot></table>`}
    <script>window.onload=function(){window.print()}<\/script>
    </body></html>`);
  win.document.close();
}

// โครงการที่ซื้อไปแล้ว — ใบเสนอราคาที่ปิดการขาย (won) เท่านั้น · เรียงวันปิดล่าสุดขึ้นก่อน
// ไม่มีใบ won = ยังไม่มีโครงการที่ซื้อ (ไม่เดาจากดีลที่ยังไม่ปิด)
// เดิมจัดกลุ่มตาม "แม่แบบหลัก" — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 จึงเป็นรายการใบต่อใบตรง ๆ
function purchasedFor(customerId:number, qs:QuotationMock[]): QuotationMock[] {
  return qs.filter(q=>q.customerId===customerId && q.status==="won").sort((a,b)=>a.date<b.date?1:-1);
}
// ⚠️ เคยมี deliveryDateFor (วันส่งมอบ) ตรงนี้ — ลบทั้งฟีเจอร์แล้ว (บอสสั่ง 20 ส.ค. 69)
//    ไม่มีที่ให้ใครกรอกวันส่งมอบจริงเลยทั้งระบบ · ค่าที่เคยใส่ในไฟล์ส่งออกคือ
//    "วันปิดการขาย + 90 วัน" ที่โปรแกรมคิดขึ้นเอง = ตัวเลขที่ไม่มีอยู่จริงในงาน

// ── Deterministic drawer feeds (จากลูกค้า + quotations + leads) ──
// ไทม์ไลน์กิจกรรม — สร้างจากใบเสนอราคาและลูกค้าเป้าหมายที่ผูกกับลูกค้ารายนี้ (deterministic)

// ── ลูกค้าใหม่ / ลูกค้าเดิม ───────────────
// เกณฑ์ (deterministic): มีใบเสนอราคาปิดการขาย ≥1 หรือ joinDate เก่ากว่า ~6 เดือน → ลูกค้าเดิม, มิฉะนั้น → ลูกค้าใหม่
type LifecycleType = "existing" | "new";
// เกณฑ์ = "วันนี้ของระบบ" (APP_NOW) ลบ 6 เดือน · supabase=จริง / local=ตรึง → 2026-01-01 (deterministic)
const EXISTING_CUTOFF_DATE = (() => {
  const d = new Date(APP_NOW); d.setMonth(d.getMonth() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
function lifecycleTypeFor(customerId:number, joinDate:string, qs:QuotationMock[]): LifecycleType {
  if(wonQuotationCountFor(customerId, qs) >= 1) return "existing";
  if(joinDate && joinDate !== "—" && joinDate < EXISTING_CUTOFF_DATE) return "existing";
  return "new";
}
const LIFECYCLE_META: Record<LifecycleType,{label:string; fg:string; bg:string}> = {
  existing: { label:"ลูกค้าเดิม", fg:"#059669", bg:"#e5faf0" },
  new:      { label:"ลูกค้าใหม่",       fg:"#003366", bg:"#dce5f0" },
};

// ── Customer form shape — ใช้กับฟอร์ม "แก้ไขในตัว" เท่านั้น ──
// ลูกค้าสร้างใหม่โดยตรงไม่ได้ (ฝั่งดีลเลอร์) — เกิดจาก Lead→Won อัตโนมัติเท่านั้น · หน้านี้ไว้ดู/แก้ไขที่มีอยู่
type CustomerForm = Omit<CustomerRow,"id"|"initials"|"color"|"totalValue"|"category">; // ไม่มี category (แม่แบบ) — คงค่าเดิมผ่าน ...selected ตอนบันทึก (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)

// ─── ภาพรวม (แก้ไขในตัว) — ฟอร์มแก้ไขข้อมูลลูกค้าในแท็บ "ข้อมูล" ของโมดัลรายละเอียด ───
// สไตล์ + Row ต้องอยู่นอกคอมโพเนนต์ — ประกาศข้างในจะได้ "ฟังก์ชันตัวใหม่" ทุกเรนเดอร์
// React ถือเป็นคนละคอมโพเนนต์ → unmount/mount ช่องกรอกใหม่ทุกครั้งที่พิมพ์ → โฟกัสหลุดหลังพิมพ์ 1 ตัวอักษร
// ช่องกรอกไม่มีกรอบของตัวเอง (บอสสั่ง 17 ก.ค. 69 — มาตรฐานเดียวกับการ์ดภาพรวมหน้าลูกค้าเป้าหมาย)
const CU_INP: React.CSSProperties = { width:"100%", height:28, padding:"0 8px", borderRadius:6, border:"none", outline:"none", fontSize:"0.78rem", fontWeight:700, fontFamily:"inherit", color:"#2D2D2D", background:"transparent", boxSizing:"border-box" };
// แต่ละแถวมีกรอบ + พื้นจาง — โทนเดียวกับช่องข้อมูลหน้าลูกค้าเป้าหมาย (OV_CELL: #fafbfc / ขอบ #eef1f5)
// บอสสั่ง 17 ก.ค. 69: "เพิ่มกรอบข้างหลังที่มีสีให้ดูง่าย" · โครง "ป้าย : ค่า" เดิมคงไว้ทุกช่อง
const CU_ROW: React.CSSProperties = { display:"flex", gap:8, alignItems:"center", padding:"6px 10px", minWidth:0, background:"#fafbfc", border:"1px solid #eef1f5", borderRadius:9, marginBottom:6 };
const CU_KEY: React.CSSProperties = { fontSize:"0.74rem", color:"#8a929c", flex:"0 0 96px" };
const CU_COLON: React.CSSProperties = { fontSize:"0.74rem", color:"#c7ccd3", flexShrink:0 };
function CuRow({ label, children }:{ label:string; children:React.ReactNode }) {
  return (
    <div style={CU_ROW}><span style={CU_KEY}>{label}</span><span style={CU_COLON}>:</span>
      <span style={{ flex:1, minWidth:0 }}>{children}</span></div>
  );
}
// สไตล์เดียวกับหน้าลูกค้าเป้าหมาย (OverviewEditor) — แก้ในหน้านี้เลย ไม่มีฟอร์มแยก
function CustomerOverviewEditor({ customer, code, onSave }:{
  customer: CustomerRow; code: string; onSave: (f: CustomerForm)=>void;
}){
  const seed = (): CustomerForm => ({
    name: customer.name, company: customer.company, email: customer.email,
    phone: customer.phone, address: customer.address ?? "", province: customer.province,
    status: customer.status, projects: customer.projects, joinDate: customer.joinDate, owner: customer.owner,
    logo: customer.logo ?? "",
  });
  const [f, setF] = useState<CustomerForm>(seed);
  const myProvinces = useMyProvinces();  // จังหวัดตามภาคของสาขาที่ล็อกอิน
  // ตั้งค่าฟอร์มใหม่เฉพาะตอน "สลับไปลูกค้าคนอื่น" เท่านั้น — จงใจไม่ใส่ seed ใน dependency
  // (seed ถูกสร้างใหม่ทุก render จะทำให้ล้างสิ่งที่ผู้ใช้กำลังพิมพ์อยู่ทิ้งทุกครั้ง)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setF(seed()); }, [customer.id]);
  const set = <K extends keyof CustomerForm>(k:K,v:CustomerForm[K])=>setF(p=>({...p,[k]:v}));
  // อัปโหลดโลโก้เอาออกจากฟอร์ม (บอสสั่ง 26 ต.ค. 69 · ชุดช่องมาตรฐาน) — คอลัมน์ logo ในฐานคงไว้ ค่าเดิมไม่ถูกแตะ
  const dirty = (Object.keys(f) as (keyof CustomerForm)[]).some(k => (f[k] ?? "") !== ((customer as unknown as CustomerForm)[k] ?? ""));

  // แก้ไข "ในฟอร์มเดิม" — ตาราง ป้าย : ค่า 2 คอลัมน์ ตำแหน่งเดียวกับตอนอ่าน (ค่ากลายเป็นช่องกรอก)
  // ห้ามสลับไปฟอร์มคนละหน้าตา (บอสสั่ง) · Row/สไตล์อยู่นอกคอมโพเนนต์ (ดูคอมเมนต์ข้างบน)
  const inp = CU_INP, keyS = CU_KEY, colonS = CU_COLON, Row = CuRow;

  return (
    <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 28px", borderTop:"1px solid #eef1f5", paddingTop:12 }}>
        <div style={{ display:"flex", flexDirection:"column" }}>
          <Row label="รหัสลูกค้า"><span style={{ fontSize:"0.8rem", fontWeight:700, color:"#9ca3af" }}>{code}</span></Row>
          <Row label={ช่อง.บริษัท}><input aria-label={ช่อง.บริษัท} value={f.company} onChange={e=>set("company",e.target.value)} style={inp} /></Row>
          <Row label={ช่อง.ผู้ติดต่อ}><input aria-label={ช่อง.ผู้ติดต่อ} value={f.name} onChange={e=>set("name",e.target.value)} style={inp} /></Row>
          <Row label={ช่อง.โทรศัพท์}><input aria-label={ช่อง.โทรศัพท์} inputMode="tel" value={f.phone} onChange={e=>set("phone",formatPhone(e.target.value))} placeholder="0XX-XXX-XXXX" style={inp} /></Row>
          <Row label={ช่อง.อีเมล}><input aria-label={ช่อง.อีเมล} value={f.email} onChange={e=>set("email",e.target.value)} type="email" placeholder="email@company.com" style={inp} /></Row>
        </div>
        <div style={{ display:"flex", flexDirection:"column" }}>
          <Row label={ช่อง.ที่อยู่}>
            <textarea aria-label={ช่อง.ที่อยู่} value={f.address ?? ""} onChange={e=>set("address",e.target.value)} rows={2}
              placeholder={ตัวอย่างช่อง.ที่อยู่}
              style={{ ...inp, height:"auto", padding:"5px 8px", resize:"vertical", lineHeight:1.4, fontWeight:400 }} />
          </Row>
          <Row label={ช่อง.จังหวัด}>
            <ProvinceSelect label={ช่อง.จังหวัด} value={f.province} onChange={v=>set("province",v)} style={{ ...inp, cursor:"pointer" }} options={myProvinces}
              หลัง={f.province && !myProvinces.includes(f.province) && <option value={f.province}>{f.province} (นอกภาค)</option>} />
          </Row>
          {/* แถว "แม่แบบ" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · category ยังอยู่ใน f (มาจาก seed)
              บันทึกแล้วส่งค่าเดิมกลับไปตรง ๆ ไม่มีใครแก้ได้ ข้อมูลในฐานจึงไม่เปลี่ยน */}
          {/* joinDate = วันที่เข้าระบบเป็นลูกค้า — ป้าย "วันที่สมัคร" เดิมชวนเข้าใจผิด (บอสสั่งเปลี่ยน 17 ก.ค. 69) */}
          {/* แสดงปี พ.ศ. แบบเดียวกับหัวแผง ("เข้าร่วม 29 ธ.ค. 2568") — เดิมช่องวันที่ของเบราว์เซอร์แสดงตามเครื่อง = 29/12/2025 (ค.ศ.)
              ตรวจเทียบ FLOW รอบ 5 · ใช้ช่องเลือกวันที่กลาง ThaiDateInput (ค่าที่เก็บยังเป็น YYYY-MM-DD) */}
          <Row label="เป็นลูกค้าเมื่อ"><ThaiDateInput ariaLabel="วันที่เป็นลูกค้า" value={f.joinDate} onChange={v=>set("joinDate",v)} width="100%"
            style={{ height:28, padding:"0 8px", border:"none", borderRadius:6, background:"transparent", fontSize:"0.78rem", fontWeight:700, color:"#2D2D2D" }} /></Row>
          <Row label={ช่อง.ผู้รับผิดชอบ}><PersonPicker value={f.owner} onChange={v=>set("owner",v)} multiple /></Row>
          {/* แถว "สถานะ" ถูกถอดออกจากการ์ด (บอสสั่ง 17 ก.ค. 69) — สถานะกลับเป็นข้อมูลแสดงผลอย่างเดียว
              (เหมือนก่อนมีตัวแก้ในที่เดิม: ไม่เคยมี UI แก้สถานะมาก่อน ดรอปดาวน์นี้เพิ่งถูกเพิ่มแล้วถูกสั่งถอด) */}
        </div>
      </div>
      {/* แถวล่าง: ปุ่มบันทึก (รูปย้ายขึ้นบนสุดแล้ว — บอสสั่ง 21 ส.ค. 69) */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:8, paddingTop:8, borderTop:"1px solid #f4f6f9", flexWrap:"wrap" }}>
        <span style={{ flex:1 }} />
        {dirty && <button onClick={()=>setF(seed())} className="btn btn-secondary btn-sm" style={{ color:"#374151" }}>ยกเลิก</button>}
        <button onClick={()=>onSave(f)} disabled={!dirty} className="btn btn-primary btn-sm"
          style={{ opacity: dirty ? 1 : 0.5, cursor: dirty ? "pointer" : "default" }}>
          <Check size={13} /> บันทึกการแก้ไข
        </button>
      </div>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────
// หน้าลูกค้าไม่ใช้ตัวกรองช่วงเวลากลาง (ไม่จำเป็น) — แสดงลูกค้าทั้งหมด ใช้ค้นหา/ตัวกรองในเครื่องแทน
export default function CustomersPage(){
  const router = useRouter();
  const {
    customers: allCustomers, quotations: allQuotations, leads: allLeadsRaw,
    appointments,
    addLead, บันทึกลีด, newLeadNumId, addCustomer: ctxAddCustomer,
    updateCustomer: ctxUpdateCustomer, salesVersion,
  } = useSales();
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน (multi-tenant) — ใช้ออกรหัสลูกค้า
  const userProfile = useUserProfile();
  const dealerCfg = useDealerSettings(); // หัวกระดาษ/ตราประทับของสาขา — ต้องส่งเข้าเอกสารพิมพ์
  const printCfg = { issuer: dealerCfg.settings.issuer, doc: dealerCfg.settings.document };
  const ขาดตอนพิมพ์ = (q: QuotationMock) => (dealerCfg.loaded ? ช่องที่ขาดตอนพิมพ์(q.issuer, dealerCfg.settings.issuer) : []);
  const dealerVat = useDealerVat();  // % VAT ที่สาขาตั้งเอง (ตั้งค่า › ใบเสนอราคา) — ใบที่มีสแนปช็อตใช้ของใบเสมอ
  const customerNotes = useCustomerNotes(userProfile.profile.name);
  const [addingNote, setAddingNote] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState(""); // โน้ตลูกค้าผ่าน repo (ผู้เขียน = ผู้ใช้ที่ล็อกอิน) // VAT จาก HQ ผ่าน repo (ดีลเลอร์ตั้งเองไม่ได้ · อัปเดตตามเมื่อ HQ แก้)
  // scope ทุกอย่างเป็นของสาขาที่ล็อกอิน (multi-tenant) — RYG ไม่เห็นลูกค้า/ใบ/ลูกค้าเป้าหมายของ CNX
  // undefined = ของ CNX (สมุดงานเดิม) · ที่เหลือกรองด้วย dealerCode ตรง ๆ
  const data = useMemo(() => allCustomers.filter(c => (c.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code), [allCustomers, currentDealer.code]);
  const quotations = useMemo(() => allQuotations.filter(q => (q.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code), [allQuotations, currentDealer.code]);
  const leads = useMemo(() => allLeadsRaw.filter(l => (l.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code), [allLeadsRaw, currentDealer.code]);
  // รายชื่อผู้รับผิดชอบของสาขา — ใช้เติมลงเทมเพลตนำเข้า ให้กรอกแล้วตรงกับที่ระบบมีจริง
  const จังหวัดของสาขา = useMyProvinces();   // จังหวัดตามภาคของสาขาที่ล็อกอิน (กติกาเดียวกับฟอร์มกรอกมือ)
  const persons = useRepoValue(() => personsRepo.list({ dealerCode: currentDealer.code, isHQ: false }), []);
  // ค่าจริงในระบบที่ต้องใส่ลงเทมเพลตนำเข้า — กรอกตามนี้แล้วอัปกลับเข้ามาได้โดยไม่ติดขัด
  const ค่าที่ระบบมี = useMemo(() => ({
    จังหวัด: จังหวัดของสาขา,
    ผู้รับผิดชอบ: persons.filter(p => p.active !== false).map(p => p.name),
  }), [จังหวัดของสาขา, persons]);
  const taskTpl = useLeadTaskTemplate(); // งานมาตรฐานที่ HQ ตั้ง — ดีลใหม่ต้องได้ checklist ชุดเดียวกับลูกค้าเป้าหมายอื่น
  const { passes, timeRange, inRange, setPreset, setCustomRange } = useFilters(); // ตัวกรองช่วงเวลา (กรองตามกิจกรรมล่าสุดของลูกค้า)
  // ตัวกรองช่วงเวลากลาง (วันเดือนปี) — กรองจากวันที่เข้าเป็นลูกค้า
  const [query, setQuery]             = useState("");
  // ตัวกรอง "แม่แบบ" + ลิงก์ ?template= จากแดชบอร์ด เอาออกแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
  // มาจากปุ่ม "ดูลูกค้าใหม่" หลังปิดการขาย (/leads, /quotations) → /customers?search=<ชื่อบริษัท>
  // ตั้งช่องค้นหาให้ทันที กันลูกค้าที่เพิ่งปิดการขายหายไปในรายการที่แบ่งหน้า (/scenario 31 ก.ค. 69)
  const urlSearchDone = useRef(false);
  useEffect(() => {
    if (urlSearchDone.current) return;
    urlSearchDone.current = true;
    const s = new URLSearchParams(window.location.search).get("search");
    if (s) setQuery(s);
  }, []);
  // ตัวกรองจังหวัด/ผู้รับผิดชอบ — ตัวเลือกสร้างจากข้อมูลลูกค้าจริงที่มีอยู่ ไม่ใช่รายการตายตัว
  const [provFilter, setProvFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  // ค่าเริ่มต้น = ไม่เลือกคอลัมน์ → ลูกค้าที่เพิ่มล่าสุด (id มากสุด) ขึ้นก่อน · บอสสั่ง 21 ก.ย. 69 ทุกตาราง
  const [sortKey, setSortKey]         = useState<SortKey|null>(null);
  const [sortDir, setSortDir]         = useState<SortDir>("asc");
  const [selected, setSelected]       = useState<CustomerRow|null>(null);
  const [custTab, setCustTab]         = useState<"overview"|"deals">("overview"); // แท็บ detail
  // (โหมดอ่าน/แก้ไขถูกถอดแล้ว — การ์ดข้อมูลลูกค้าแก้ในที่เดิมได้ตลอด · CustomerOverviewEditor reseed เองเมื่อสลับลูกค้า)
  useEffect(() => { setCustTab("overview"); }, [selected?.id]);
  const [page, setPage]               = useState(1);

  // เปิดโมดัลจากพารามิเตอร์ ?open=N — ใช้ทั้งตอนโหลดหน้า (ลิงก์เดิม/deep link) และตอนค้นหาจาก Topbar หน้าเดิม
  const dataRef = useRef(data);
  dataRef.current = data;
  // แจ้งเตือนสั้น ๆ เมื่อลิงก์ที่ตามมาไม่พบลูกค้าจริง (เดิมหายไปเงียบ ๆ — พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
  const [linkToast, setLinkToast] = useState<string | null>(null);
  useEffect(() => {
    if (!linkToast) return;
    const t = setTimeout(() => setLinkToast(null), 3200);
    return () => clearTimeout(t);
  }, [linkToast]);
  useEffect(() => {
    const openByParam = (qs: string) => {
      const p = new URLSearchParams(qs).get("open");
      if (!p) return;
      const target = dataRef.current.find(c => String(c.id) === p);
      if (target) setSelected(target);
      else setLinkToast("ไม่พบลูกค้ารายนี้ — อาจถูกลบหรือลิงก์ไม่ถูกต้อง");
      window.history.replaceState(null, "", "/customers");
    };
    // 1) ตอนโหลดหน้า (mount) — จาก URL จริง
    openByParam(window.location.search);
    // 2) ตอนค้นหาจาก Topbar ขณะอยู่หน้าเดิม — Topbar ยิง event พร้อม href ปลายทาง
    const onOpen = (e: Event) => {
      const href = (e as CustomEvent<string>).detail ?? "";
      const [path, query = ""] = href.split("?");
      if (path === "/customers" && query) openByParam(`?${query}`);
    };
    window.addEventListener("bpms:open-record", onOpen);
    return () => window.removeEventListener("bpms:open-record", onOpen);
  }, []);
  // รายชื่อผู้รับผิดชอบดึงจาก PersonPicker เอง (registry กลาง) — ไม่ต้องเก็บ list ที่นี่
  // โมดัลรายละเอียด: ปิดด้วย Esc + ล็อกสกรอลล์พื้นหลัง (parity กับ RightDrawer)
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [selected]);

  const [view] = useState<"card"|"table">("table"); // ตารางอย่างเดียว (เอามุมมองการ์ดออก)
  // ลูกค้าที่กำลังจะลบ — เก็บ "ตัวลูกค้า" ไม่ใช่ boolean เพราะลบได้จากตารางโดยไม่ต้องเปิดแผงรายละเอียด
  // ปุ่มลบลูกค้าเอาออกแล้ว (บอสตัดสิน 19 ต.ค. 69): ลูกค้าทุกรายเกิดจากใบที่ลูกค้าตอบรับ ซึ่งลบไม่ได้ (ใบ 0203) · ข้อทดสอบ flow-a-safety.spec.ts
  const [detailTab, setDetailTab]     = useState<"info"|"deals"|"quotes"|"appts"|"notes"|"files">("info");
  // โครงการที่กดดู (จากตาราง "ประวัติการปิดการขาย") → เปิดแผงรายละเอียดโครงการซ้อนขึ้นมา
  const [viewProject, setViewProject] = useState<{ q: QuotationMock } | null>(null);
  // ไทม์ไลน์กิจกรรมของดีลที่กำลังเปิดดู — รายการลูกค้าเป้าหมายไม่ขน activities มาแล้ว (กินขนส่ง)
  //   จึงโหลดเฉพาะตอนเปิดแผงใบเสนอราคา · ไม่โหลด = ไทม์ไลน์ว่างทั้งที่มีข้อมูลจริง
  const [dealActs, setDealActs] = useState<LeadActivity[] | null>(null);
  const viewDealId = viewProject?.q.dealId ?? null;
  useEffect(() => {
    setDealActs(null);
    if (viewDealId == null) return;
    const target = leads.find(l => l.numId === viewDealId);
    if (!target) return;
    if (target.activities) { setDealActs(target.activities); return; }
    let alive = true;
    leadsRepo.get(target.id)
      .then(full => { if (alive) setDealActs(full?.activities ?? []); })
      .catch(e => logRepoRead("leads.get", e));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDealId]);
  // สร้างดีลใหม่ (ลูกค้าเดิมซื้อโครงการใหม่) — Deal = ลูกค้าเป้าหมายที่ผูก customerId
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [dealCustomer, setDealCustomer] = useState<CustomerRow|null>(null);
  const [dealForm, setDealForm] = useState({project:"",value:"",area:"",province:"",status:"WAITING" as LeadStatus,assigned:"",note:""});
  // ข้อความฟ้องตอนกดบันทึก — ต้องมีเหมือนฟอร์มเพิ่มลูกค้าเป้าหมาย ไม่ใช่กดแล้วเงียบ
  const [dealErr, setDealErr] = useState("");
  // นำเข้าลูกค้าเดิม (ดีลเลอร์) — ลูกค้าก่อนมีระบบ / ไม่ได้ผ่าน Lead→Won · CSV + คีย์มือ
  const [showImport, setShowImport]   = useState(false);
  const [importRows, setImportRows]   = useState<ImportRow[]>([]);
  const [importErr, setImportErr]     = useState("");
  const [importFile, setImportFile]   = useState("");   // ชื่อไฟล์ที่เลือก — ให้ผู้ใช้เห็นว่ากำลังดูไฟล์ไหน
  // ชื่อซ้ำตอนนำเข้า (บอสสั่ง 2 ก.ย. 69) — ห้ามเงียบ ๆ สร้างลูกค้าชื่อเดียวกันซ้อนอีกราย
  //   ต้องถามก่อนว่าจะ "อัปเดตข้อมูล" (เติมเฉพาะช่องที่ว่างอยู่) หรือ "แทนที่" (เอาของในไฟล์ทับ)
  const [ซ้ำที่ต้องถาม, setซ้ำที่ต้องถาม] = useState<{ row: ImportRow; เดิม: CustomerRow }[] | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const savingImportRef = useRef(false); // กันกดนำเข้า CSV ซ้ำ — ดู commitImport()
  // ไฟล์แนบต่อลูกค้า — คลังไฟล์รวม (แหล่งเดียว) ปรากฏในหน้าไฟล์กลางด้วย
  const [dealerFiles, setDealerFiles] = useState<DealerFile[]>([]);
  const [previewFile, setPreviewFile] = useState<DealerFile | null>(null);
  const [viewAppt, setViewAppt] = useState<AppointmentMock | null>(null);
  const [viewNote, setViewNote] = useState<CustomerNote | null>(null);
  // request token กันผลลัพธ์เก่าทับใหม่ — sync ถูกยิงซ้ำได้จากหลายทาง (mount, event, สลับสาขา)
  const dealerFilesReqRef = useRef(0);
  useEffect(() => {
    // ไฟล์ของสาขานี้ผ่าน repository (local: localStorage · supabase: DB)
    const sync = () => {
      const myReq = ++dealerFilesReqRef.current;
      filesRepo.list({ dealerCode: currentDealer.code, isHQ: false })
        .then(r => { if (dealerFilesReqRef.current === myReq) setDealerFiles(r); })
        .catch(e => logRepoRead("files.list", e));
    };
    sync();
    window.addEventListener(DEALER_FILES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(DEALER_FILES_EVENT, sync); window.removeEventListener("storage", sync); };
  }, [currentDealer.code]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rightApptRef  = useRef<HTMLDivElement|null>(null);
  const scrollTo = (r: React.RefObject<HTMLDivElement|null>) => r.current?.scrollIntoView({ behavior:"smooth", block:"nearest" });
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !selected) return;
    // เช็คชนิด/ขนาดไฟล์เหมือนหน้า "ไฟล์" หลัก (apps/dealer/app/(app)/files/page.tsx) — ที่นี่แนบเข้าคลังเดียวกัน
    // เดิมช่องนี้ไม่เช็คอะไรเลย (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69)
    const ext = ("." + (f.name.split(".").pop() ?? "")).toLowerCase();
    const problem = validateUpload(f);
    if (problem) {
      แจ้งพลาด(problem);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const size = humanFileSize(f.size);
    const cust = selected;
    if (fileInputRef.current) fileInputRef.current.value = "";
    // ขั้นตอนเดียวกับแผงลีด: อัปไบต์ขึ้น Storage ก่อน (เส้นทางเดิม fileStorage.upload · local คืน null = เก็บแค่ metadata)
    //   แล้วบันทึก metadata · อัปไม่สำเร็จต้องดัง ห้ามกลืน (H1) — เดิม .catch(()=>null) ทำให้ไฟล์โผล่เหมือนสำเร็จแต่ไบต์ไม่ขึ้น
    void (async () => {
      let storagePath: string | null = null;
      try {
        storagePath = await fileStorage.upload(currentDealer.code, f);
        await filesRepo.add({
          name: f.name, size, ext: extOfName(f.name), category: guessFileCategory(f.name),
          project: cust.company || cust.name, uploadedBy: cust.owner || "คุณ",
          uploadedAt: APP_NOW_ISO, source: "customer", recordId: cust.id, customerId: cust.id, dealerCode: currentDealer.code,
          ...(storagePath ? { storagePath } : {}),
        });
        setDealerFiles(await filesRepo.list({ dealerCode: currentDealer.code, isHQ: false }));
        แจ้งสำเร็จ(`แนบไฟล์ "${f.name}" แล้ว`);
      } catch (err) {
        if (storagePath) await fileStorage.remove(storagePath).catch(() => {}); // กันไบต์กำพร้า
        แจ้งพลาด("แนบไฟล์ไม่สำเร็จ: " + friendlyError(err));
      }
    })();
  }
  // ลบไฟล์ที่แนบผิด (รอบ 4 · ย้ายมาจากหน้าไฟล์) — ถามยืนยัน · ไฟล์ของใบที่ส่งลูกค้าแล้วลบไม่ได้ (ฐานกัน ใบ 0233)
  async function ลบไฟล์นี้(f: DealerFile) {
    if (!(await ยืนยัน({ หัวข้อ: `ลบไฟล์ "${f.name}" ?`, รายละเอียด: "ย้อนกลับไม่ได้", ปุ่มตกลง: "ลบไฟล์", อันตราย: true }))) return;
    try {
      await ลบไฟล์(f);
      setDealerFiles(await filesRepo.list({ dealerCode: currentDealer.code, isHQ: false }));
      แจ้งสำเร็จ("ลบไฟล์แล้ว");
    } catch (e) { แจ้งพลาด("ลบไฟล์ไม่สำเร็จ: " + friendlyError(e)); }
  }
  // ไฟล์ของลูกค้าที่เลือก — ผูกด้วย customerId หรือแนบตรงกับลูกค้า
  const selectedFiles: DealerFile[] = selected
    ? dealerFiles.filter(f => f.customerId === selected.id || (f.source === "customer" && f.recordId === selected.id))
    : [];


  // Table layout (density + hidden columns) จาก TableTools
  const { density, setDensity, hiddenCols, toggleCol } = useTableLayout("customers");

  function handleSort(k: SortKey){ if(sortKey===k) setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortKey(k);setSortDir("asc");} }

  // มีตัวกรองถูกตั้งไว้จริงไหม — ใช้เลือกข้อความตอนไม่มีผลลัพธ์ (ดูหมายเหตุที่ตารางด้านล่าง)
  const hasActiveFilter = query.trim() !== "" || provFilter !== "ALL" || ownerFilter !== "ALL";
  // การ์ด KPI ที่กดอยู่ (ใบ 0246) — กติกาเดียวกับฐาน: ลูกค้าใหม่ = วันที่เป็นลูกค้าอยู่ในช่วง · มีงานขายใหม่ = มีลีดที่ยังเปิดผูกลูกค้ารายนี้
  const [การ์ดที่กด, setการ์ดที่กด] = useState<"new" | "openDeal" | null>(null);
  const ลูกค้ามีงานเปิด = useMemo(() => new Set(leads.filter(l => l.customerId != null && l.status !== "PAID" && l.status !== "CANCELLED").map(l => l.customerId!)), [leads]);
  const ตรงการ์ด = useCallback((c: CustomerRow) => {
    if (การ์ดที่กด === "openDeal") return ลูกค้ามีงานเปิด.has(c.id);
    if (การ์ดที่กด === "new") { const d = /^\d{4}-\d{2}-\d{2}/.test(c.joinDate ?? "") ? c.joinDate.slice(0, 10) : ""; return !!d && d >= วันที่ISO(timeRange.start) && d <= วันที่ISO(timeRange.end); }
    return true;
  }, [การ์ดที่กด, ลูกค้ามีงานเปิด, timeRange]);
  // ตัวกรองอื่นของหน้า (ค้นหา/จังหวัด/ผู้ดูแล · ไม่รวมช่วงเวลาและการ์ดที่กด) — ตารางกับการ์ด KPI ใช้ตัวเดียวกัน
  //   (บอสตัดสิน 27 ต.ค. 69 การ์ดเดินตามตัวกรอง)
  const ตรงตัวกรองอื่น = useCallback((c: CustomerRow)=>{
    const q=query.toLowerCase();
    const matchQ=!q||c.company.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.province.toLowerCase().includes(q)||c.phone.includes(q);
    // ตัวกรอง "สถานะ" + "ลูกค้าใหม่/เดิม" ถูกลบตามที่บอสสั่ง — ไม่มี UI ให้ตั้งค่าแล้ว
    const matchP=provFilter==="ALL"||c.province===provFilter;
    const matchO=ownerFilter==="ALL"||(c.owner||"")===ownerFilter;
    return matchQ&&matchP&&matchO;
  },[query,provFilter,ownerFilter]);
  const ชุดการ์ด = useMemo(()=>ชุดที่กรอง(data, ตรงตัวกรองอื่น, c=>c.id),[data,ตรงตัวกรองอื่น]);
  const filtered = useMemo(()=>{
    let rows=data.filter(c=>{
      // กรองตามช่วงเวลา — ใช้ "กิจกรรมล่าสุด" ของลูกค้า (โชว์ลูกค้าที่มีความเคลื่อนไหวในช่วงที่เลือก)
      const matchT=passes({date:lastActivityFor(c.id,c.joinDate,quotations)});
      return ตรงตัวกรองอื่น(c)&&matchT&&ตรงการ์ด(c);
    });
    if(sortKey===null) return [...rows].sort((a,b)=>b.id-a.id);
    const sortVal=(c:CustomerRow):string|number=>{
      switch(sortKey){
        case "lastActivity":   return lastActivityFor(c.id,c.joinDate,quotations);
        case "quotationCount": return quotationCountFor(c.id,quotations);
        default:               return c[sortKey] as string|number;
      }
    };
    rows=[...rows].sort((a,b)=>{
      const va=sortVal(a);
      const vb=sortVal(b);
      // เรียงข้อความไทยตามพยัญชนะ (locale "th")
      if(typeof va==="string" && typeof vb==="string"){
        const cmp=va.localeCompare(vb,"th");
        return sortDir==="asc"?cmp:-cmp;
      }
      if(va<vb) return sortDir==="asc"?-1:1;
      if(va>vb) return sortDir==="asc"?1:-1;
      return 0;
    });
    return rows;
  },[data,quotations,ตรงตัวกรองอื่น,sortKey,sortDir,timeRange,passes,ตรงการ์ด]);

  // ตัวเลือกตัวกรอง — ดึงจากข้อมูลลูกค้าจริงที่มีอยู่ (ไม่ hardcode รายการจังหวัด/พนักงาน)
  const provOptions  = useMemo(()=>[...new Set(data.map(c=>c.province).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th")),[data]);
  const ownerOptions = useMemo(()=>[...new Set(data.map(c=>c.owner).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"th")),[data]);

  // ── Pagination (client-side) ──────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // รีเซ็ต/clamp หน้าเมื่อค้นหา/เรียง/ตัวกรองเปลี่ยน หรือจำนวนหน้าลดลง
  useEffect(() => { setPage(1); }, [query,provFilter,ownerFilter,sortKey,sortDir]);
  useEffect(() => { setPage(p => Math.min(p, totalPages)); }, [totalPages]);
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged     = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo   = Math.min(pageStart + PAGE_SIZE, filtered.length);

  // ── สรุปด้านบนต้องเดินตามตัวกรองของหน้านี้ (บอสสั่ง 20 ส.ค. 69) ─────────────────
  //   เดิมนับจากลูกค้าทั้งหมดเสมอ เลือกจังหวัด/ผู้ดูแลแล้วตารางเหลือไม่กี่ราย
  //   แต่การ์ด "ลูกค้าทั้งหมด/ยอดขายรวม" กับกราฟยังเป็นของทั้งสาขา = อ่านคู่กันแล้วขัดกันเอง
  //   หน้านี้ไม่มีการ์ดที่ใช้สลับตัวกรอง จึงรวมทุกตัวกรองได้เลย (ต่างจากหน้าลูกค้าเป้าหมาย/ใบเสนอราคา)
  const scoped = useMemo(()=>data.filter(c=>{
    const q=query.toLowerCase();
    const matchQ=!q||c.company.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.province.toLowerCase().includes(q)||c.phone.includes(q);
    const matchP=provFilter==="ALL"||c.province===provFilter;
    const matchO=ownerFilter==="ALL"||(c.owner||"")===ownerFilter;
    const matchT=passes({date:lastActivityFor(c.id,c.joinDate,quotations)});
    return matchQ&&matchP&&matchO&&matchT;
  }),[data,query,provFilter,ownerFilter,passes,quotations]);
  const totalAll      = scoped.length;
  const totalValue    = scoped.reduce((s,c)=>s+c.totalValue,0);

  // ── S1: KPI + กราฟ (ภาษาเดียวกับแดชบอร์ด) — mock วันนี้ = 2026-06-30 ──
  const newThisMonth = useMemo(() => scoped.filter(c => {
    const d = new Date(c.joinDate);
    return d.getFullYear() === 2026 && d.getMonth() === 5;
  }).length, [scoped]);

  // กราฟ 1 — การเติบโตของลูกค้า (สะสมตามเดือนที่เข้าร่วม, 12 เดือน)
  const growthSeries = useMemo(() => {
    const per = Array(12).fill(0);
    scoped.forEach(c => { const d = new Date(c.joinDate); if (d.getFullYear() === 2026) per[d.getMonth()]++; });
    const cum: number[] = []; let run = 0;
    for (let i = 0; i < 12; i++) { run += per[i]; cum.push(run); }
    return { per, cum };
  }, [scoped]);
  // กราฟ 2 "สินค้าที่ซื้อ (โดนัทตามแม่แบบหลัก)" ลบแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69

  // Related data for selected customer
  const relatedQuotations   = selected ? quotations.filter(q=>q.customerId===selected.id) : [];
  // ไม่รวมลูกค้าเป้าหมายที่ปิดการขายสำเร็จ (PAID) — กลายเป็นลูกค้ารายนี้ไปแล้ว ลิงก์จะวนกลับหน้าเดิม
  // "งานขายทั้งหมด" = ประวัติการปิดการขาย (ใบเสนอราคาที่ปิดการขาย) + โครงการที่กำลังทำ (ลูกค้าเป้าหมายที่ยังไม่ปิด)
  // เดิมทั้งสองการ์ดอ่านจากลูกค้าเป้าหมายชุดเดียวกัน → โชว์ตัวที่กำลังทำซ้ำบน-ล่าง ส่วนที่ซื้อแล้วไม่โผล่เลย (บอสทัก)
  // รายการในแผงรายละเอียด: ที่เพิ่มล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69)
  const activeDeals   = selected ? leads.filter(l=>(l.customerId===selected.id||l.company===selected.company) && l.status!=="PAID").sort((a,b)=>b.numId-a.numId) : [];
  const projectCount  = activeDeals.length;   // ที่ปิดการขายแล้วอยู่การ์ดประวัติการปิดการขายที่เดียว (รอบ 4)
  // ลูกค้าเป้าหมายทุกสถานะของลูกค้ารายนี้ — ใช้ผูกใบเสนอราคากลับไปหาลูกค้าเป้าหมาย (คนละชุดกับการ์ด "งานขายทั้งหมด")
  const customerDeals = selected ? leads.filter(l=>l.customerId===selected.id||l.company===selected.company) : [];
  const relatedAppointments = selected ? appointments.filter(a=>a.company===selected.company).sort((a,b)=>b.id-a.id) : [];
  // โน้ตของลูกค้ารายนี้ — จากตาราง customer_notes (ของสาขาตัวเอง)
  // เดิมไม่มีที่เก็บจริง จึงต้องปิดแท็บไว้ในโหมด supabase · ตอนนี้จดได้จริงและอยู่ข้ามเครื่อง
  const relatedNotes        = selected ? customerNotes.notes.filter(n=>n.customerId===selected.id).sort((a,b)=>b.id-a.id) : [];

  // บันทึกการแก้ไขในตัว (จากแท็บ "ข้อมูล" ของโมดัลรายละเอียด)
  function saveInline(form: CustomerForm){
    if(!selected) return;
    const updated: CustomerRow = {...selected,...form,initials:initials(form.company)};
    ctxUpdateCustomer(updated);
    setSelected(updated);
  }
  // ── นำเข้าลูกค้าเดิม (ดีลเลอร์) — เพิ่มเข้า SalesContext เดียว · flag imported=true ──
  // รับแถวที่ไม่มี category ก็ได้ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · ลูกค้าที่นำเข้าใหม่ได้ category ว่างเสมอ
  //   (ไม่อ่าน r.category แม้ไฟล์จะมีคอลัมน์แม่แบบติดมา เพราะไม่มีที่ไหนในระบบแสดง/แก้ค่านี้แล้ว)
  function makeImported(r: Omit<ImportRow,"category">, id: number): CustomerRow {
    return { id, name:r.name||r.company, company:r.company, email:r.email, phone:r.phone,
      address:r.address||undefined,
      province:r.province||"", category:"", status:"active", projects:0,   // ไม่มีจังหวัด = ว่าง (ห้ามเดา)
      // วันที่/ผู้รับผิดชอบจากไฟล์ก่อนเสมอ — ไม่มีค่อยใช้ค่าตั้งต้น (วันนี้ / ผู้รับผิดชอบที่เลือกในฟอร์ม)
      joinDate:r.joinDate||APP_NOW_ISO, owner:r.owner||"",   /* ไม่มีผู้รับผิดชอบ = เว้นว่าง ห้ามใส่ชื่อตัวอย่าง (บอสสั่ง 20 ต.ค. 69) */
      initials:initials(r.company), color:PALETTE[id%PALETTE.length], totalValue:0, imported:true };
  }
  /** รวมข้อมูลจากไฟล์เข้ากับลูกค้าที่มีอยู่แล้ว (ชื่อซ้ำ)
   *  ⚠️ ห้ามแตะค่าที่ระบบคิดเองจากงานขายจริง — จำนวนงานขาย/มูลค่ารวม/รหัส/สีการ์ด
   *     ถึงจะเลือก "แทนที่" ก็ทับได้แค่ข้อมูลติดต่อที่คนกรอก ไม่ใช่ตัวเลขยอดขาย */
  function รวมลูกค้า(เดิม: CustomerRow, r: ImportRow, ทับ: boolean): CustomerRow {
    const เอา = (ใหม่: string|undefined, ของเดิม: string|undefined) =>
      ทับ ? (ใหม่?.trim() || ของเดิม) : (ของเดิม?.trim() || ใหม่);
    return { ...เดิม,
      name: เอา(r.name, เดิม.name) || เดิม.name,
      company: เดิม.company,                      // ชื่อบริษัทคือตัวที่ใช้จับคู่ ไม่เปลี่ยน
      email: เอา(r.email, เดิม.email) || เดิม.email,
      phone: เอา(r.phone, เดิม.phone) || เดิม.phone,
      address: เอา(r.address, เดิม.address),
      province: เอา(r.province, เดิม.province) || เดิม.province,
      // category ไม่แตะ (มาจาก ...เดิม) — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 ไฟล์นำเข้าห้ามทับค่าเดิม
      joinDate: เอา(r.joinDate, เดิม.joinDate) || เดิม.joinDate,
      owner: เอา(r.owner, เดิม.owner) || เดิม.owner };
  }
  // รับได้ทั้ง CSV · Excel (.xlsx) · .xls/HTML ที่ระบบเก่าส่งออก — ตัวอ่านอยู่ที่ lib/importSheet
  async function onCsvFile(e: React.ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0]; if(e.target)e.target.value=""; if(!f) return;
    setImportFile(f.name); setImportRows([]); setImportErr("");
    try{
      const rows=จับคู่คอลัมน์(await อ่านตารางจากไฟล์(f));
      // จังหวัดต้องอยู่ในรายชื่อ 77 จังหวัด (บอสสั่ง 29 ต.ค. 69 · ฐานกันอีกชั้น) — ชื่อย่อ/สะกดผิด = ไม่นำเข้าทั้งไฟล์ บอกแถวให้แก้
      const จังหวัดผิด = rows.map((r,i)=>({ แถว:i+2, p:(r.province??"").trim() })).filter(x=>x.p && !เป็นจังหวัดมาตรฐาน(x.p));
      if(จังหวัดผิด.length){
        setImportErr(`จังหวัดไม่อยู่ในรายชื่อ 77 จังหวัด ${จังหวัดผิด.length} แถว: ${จังหวัดผิด.slice(0,8).map(x=>`แถว ${x.แถว} "${x.p}"`).join(" · ")}${จังหวัดผิด.length>8?" …":""} — แก้ในไฟล์ให้ตรงรายชื่อ (ดูแผ่น "ค่าที่เลือกได้") แล้วนำเข้าใหม่`);
        return;
      }
      setImportRows(rows);
      setImportErr(rows.length?"":`ไม่พบข้อมูลในไฟล์ — ต้องมีคอลัมน์ "${ช่อง.บริษัท}" และมีอย่างน้อย 1 แถว`);
    }catch(err){ setImportErr(friendlyError(err)); }
  }
  // เทียบชื่อบริษัทแบบ "คนอ่านแล้วถือว่าเป็นรายเดียวกัน" — ตัดช่องว่างหัวท้าย/ช่องว่างซ้ำ + ไม่สนตัวพิมพ์
  const ชื่อเทียบ = (s: string) => s.trim().replace(/\s+/g," ").toLowerCase();
  /** นำเข้าไฟล์ลูกค้าเดิม · โหมดซ้ำ = สิ่งที่ผู้ใช้เลือกในป๊อปอัพเตือนชื่อซ้ำ (บอสสั่ง 2 ก.ย. 69)
   *    update  = เติมเฉพาะช่องที่ลูกค้าเดิมยังว่างอยู่ (ของเดิมที่กรอกไว้แล้วไม่หาย)
   *    replace = เอาข้อมูลในไฟล์ทับของเดิม (ยกเว้นตัวเลขที่ระบบคิดเอง เช่น จำนวนงานขาย/มูลค่ารวม) */
  async function commitImport(โหมดซ้ำ?: "update" | "replace"){
    if(savingImportRef.current) return; // กันกดนำเข้าซ้ำ (H8) — เดิมไม่มี guard กดรัวจะนำเข้าซ้ำทั้งชุด
    // ── ชื่อซ้ำต้องถามก่อนเสมอ ────────────────────────────────────────────────
    // เดิมนำเข้าไฟล์ที่มีลูกค้ารายเดิมอยู่แล้ว จะได้ลูกค้าชื่อเดียวกันสองแถวโดยไม่มีใครรู้
    const ซ้ำ = importRows
      .map(r => ({ row: r, เดิม: data.find(c => ชื่อเทียบ(c.company) === ชื่อเทียบ(r.company)) }))
      .filter((x): x is { row: ImportRow; เดิม: CustomerRow } => !!x.เดิม);
    if (ซ้ำ.length && !โหมดซ้ำ) { setซ้ำที่ต้องถาม(ซ้ำ); return; }
    savingImportRef.current = true;
    try {
      await warnBeforeUnloadDuring(async () => {
        // id จริงออกจาก counter อะตอมมิกใน addCustomer · base ที่ส่งไปใช้แค่ seed สีให้ต่างกัน
        // await ทีละรายการ กัน nextId อ่านค่าซ้ำก่อนสร้างเสร็จ (โหมด local)
        const base=Math.max(0,...data.map(c=>c.id));
        for(let i=0;i<importRows.length;i++){
          const r = importRows[i];
          const เดิม = data.find(c => ชื่อเทียบ(c.company) === ชื่อเทียบ(r.company));
          if (เดิม) { ctxUpdateCustomer(รวมลูกค้า(เดิม, r, โหมดซ้ำ === "replace")); continue; }
          await ctxAddCustomer(makeImported(r, base+i+1));
        }
      });
      // ── กดนำเข้าแล้ว "เหมือนไม่มีอะไรเกิดขึ้น" (บอสแจ้ง 28 ส.ค. 69) ────────────────
      // ต้นเหตุ: ตารางกรองด้วยช่วงเวลาของหน้า (ค่าเริ่มต้น = ปีนี้) โดยดูจากกิจกรรมล่าสุด
      //   ลูกค้าเดิมที่นำเข้ายังไม่มีใบเสนอราคา → กิจกรรมล่าสุด = วันที่เป็นลูกค้า
      //   ไฟล์ลูกค้าเดิมส่วนใหญ่เป็นวันที่ปีก่อน ๆ จึงถูกกรองออกทันทีที่บันทึกเสร็จ
      //   ผู้ใช้เห็นจำนวนเท่าเดิม แยกไม่ออกเลยว่า "นำเข้าไม่สำเร็จ" หรือ "สำเร็จแต่ถูกซ่อน"
      // แก้: ถ้ามีรายการที่ตกนอกช่วง ให้ขยายช่วงเวลาครอบไปถึงวันที่เก่าสุด/ใหม่สุดที่เพิ่งนำเข้า
      //   แล้วบอกผู้ใช้ตรง ๆ ว่านำเข้ากี่รายและช่วงเวลาถูกขยายให้แล้ว
      const วันที่นำเข้า = importRows.map(r => r.joinDate || APP_NOW_ISO).sort();
      const นอกช่วง = วันที่นำเข้า.filter(d => !inRange(d));
      const จำนวน = importRows.length;
      if (นอกช่วง.length) {
        const เริ่ม = วันที่นำเข้า[0] < timeRange.start.toISOString().slice(0,10) ? วันที่นำเข้า[0] : timeRange.start.toISOString().slice(0,10);
        const จบ  = วันที่นำเข้า[วันที่นำเข้า.length-1] > APP_NOW_ISO ? วันที่นำเข้า[วันที่นำเข้า.length-1] : APP_NOW_ISO;
        setPreset("custom"); setCustomRange(เริ่ม, จบ);
      }
      setQuery("");   // คำค้นเดิมค้างอยู่ก็ซ่อนรายการที่เพิ่งนำเข้าได้เหมือนกัน
      setShowImport(false); setImportRows([]); setImportErr(""); setซ้ำที่ต้องถาม(null);
      // บอกให้ครบว่า "เพิ่มใหม่กี่ราย ทับ/เติมของเดิมกี่ราย" — ไม่งั้นผู้ใช้ไม่รู้ว่าเกิดอะไรกับรายที่ซ้ำ
      const เพิ่มใหม่ = จำนวน - ซ้ำ.length;
      แจ้งสำเร็จ([
        ซ้ำ.length
          ? `นำเข้าลูกค้า ${จำนวน} ราย — เพิ่มใหม่ ${เพิ่มใหม่} ราย · ${โหมดซ้ำ === "replace" ? "แทนที่" : "อัปเดต"}ของเดิม ${ซ้ำ.length} ราย`
          : `นำเข้าลูกค้า ${จำนวน} ราย`,
        ...(นอกช่วง.length
          ? [`${นอกช่วง.length} ราย เป็นลูกค้าตั้งแต่นอกช่วงเวลาที่กรองอยู่ — ขยายช่วงเวลาให้เห็นแล้ว`]
          : []),
      ].join(String.fromCharCode(10)));
    } catch(e){ แจ้งพลาด("นำเข้าลูกค้าไม่สำเร็จ: " + friendlyError(e)); }
    finally { savingImportRef.current = false; }
  }
  // เปิด dialog สร้างดีลใหม่ — prefill ผู้รับผิดชอบจากลูกค้า (เรียกจากการ์ด/หัวโมดัล/แท็บดีล)
  //   ช่อง "แม่แบบ" ไม่มีแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
  function openNewDeal(c: CustomerRow){
    setDealCustomer(c);
    // จังหวัดหน้างาน: ตั้งต้นเป็นจังหวัดในระเบียนลูกค้า (ข้อมูลจริงของลูกค้ารายนี้) แก้ได้ถ้างานนี้อยู่จังหวัดอื่น
    setDealForm({project:"",value:"",area:"",province:c.province ?? "",status:"WAITING",assigned:c.owner,note:""}); setDealErr("");
    setShowNewDeal(true);
  }
  // กันกดสร้างดีลซ้ำ (H8 · guard synchronous) — เดิมไม่มี guard: กดรัว ๆ ระหว่างรอ newLeadNumId() (async)
  // จะยิงขอเลขซ้อนกันได้หลายครั้ง สร้างดีลซ้ำหลายใบจากคลิกเดียว (แพทเทิร์นเดียวกับที่พบใน
  // ฟอร์มเพิ่มลูกค้าเป้าหมาย/ลูกค้า — Edge Case sweep 3 ส.ค. 69)
  const creatingDealRef = useRef(false);
  // สร้างดีล = ลูกค้าเป้าหมายใหม่ผูก customerId · status WAITING · tasks = default checklist · activities/report ว่าง → เปิด Deal Detail ทันที
  async function createDeal(){
    if(creatingDealRef.current) return;
    const c=dealCustomer; if(!c) return;
    setDealErr("");
    if(!dealForm.province.trim()){ setDealErr(`กรอกให้ครบก่อนบันทึก: ${ช่อง.จังหวัด}`); return; }
    creatingDealRef.current = true;
    try {
      const nid = await newLeadNumId(); // num_id atomic ต่อสาขา (M7) — เลิก Math.max+1 ที่ชนได้
      const newDeal: LeadRow={
        id:`#L-${40321+nid}`, numId:nid,
        name:c.company, company:c.company,                              // ── ข้อมูลลูกค้าเดิม ──
        contact:c.name, phone:c.phone, email:c.email, address:c.address,
        province:dealForm.province,                                   // ── ข้อมูลงาน ── จังหวัดหน้างาน
        assigned:dealForm.assigned||c.owner, logo:c.logo, customerId:c.id,
        // ── รายละเอียดดีล ── ไม่มีช่องแม่แบบแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) → product/category ว่าง
        product:"", category:"",
        // เก็บตามที่พิมพ์ เหมือนฟอร์มลูกค้าเป้าหมาย — เดิมย่อผ่าน fmtDealValue เป็น "฿1.2M"
        // ทำให้ 1,234,567 กลายเป็น 1.2M = เงินหายไปสามหมื่นกว่าบาทตั้งแต่ตอนบันทึก
        value:"",   // ช่องประเมินราคาเอาออก (บอสตัดสิน 20 ต.ค. 69 · ข้อ 5) — มูลค่ามาจากใบเสนอราคาล่าสุด
        // เว้นว่าง = ไม่มีข้อมูลพื้นที่ (undefined) ห้ามเก็บ 0 เพราะ 0 แปลว่า "พื้นที่ศูนย์" ซึ่งไม่จริง
        area:dealForm.area.trim() && Number(dealForm.area) > 0 ? Number(dealForm.area) : undefined,
        project:dealForm.project||undefined,
        note:dealForm.note||undefined,
        status:dealForm.status,                                        // เลือกขั้นเริ่มต้นได้เหมือนฟอร์มเพิ่มลูกค้าเป้าหมาย
        source:"ลูกค้าเดิม (ดีลใหม่)",
        createdAt:thaiToday(),
        tasks:buildLeadTasks(taskTpl),                                 // Checklist ตามที่ HQ ตั้งไว้ (ยังไม่ติ๊ก)
        activities:[],                                                 // เริ่มว่าง
      };
      addLead(newDeal);
      setShowNewDeal(false);
      router.push(`/leads?open=${newDeal.numId}`);                     // เปิด Deal Detail ทันที (ไม่ต้องกลับหน้า Lead)
    } finally { creatingDealRef.current = false; }
  }
  // toggleStatus ถูกลบ — โค้ดตาย (นิยามไว้แต่ไม่มีใครเรียก) · สถานะลูกค้าเป็นข้อมูลแสดงผลอย่างเดียว

  const SortIcon = ({k}:{k:SortKey})=>sortKey===k
    ? (sortDir==="asc"?<ChevronUp size={11} style={{marginLeft:2}}/>:<ChevronDown size={11} style={{marginLeft:2}}/>)
    : <ChevronDown size={11} style={{marginLeft:2,opacity:0.3}}/>;

  const detailFileCount = selectedFiles.length;
  const detailTabs: {key:"info"|"deals"|"quotes"|"appts"|"notes"|"files"; label:string; icon:React.ReactNode}[] = [
    {key:"info",    label:"ภาพรวม",     icon:<Building2 size={11}/>},
    {key:"deals",   label:`ดีล (${customerDeals.length})`, icon:<FileText size={11}/>},
    {key:"quotes",  label:`ใบเสนอราคา (${relatedQuotations.length})`, icon:<FileText size={11}/>},
    {key:"appts",   label:`นัดหมาย (${relatedAppointments.length})`,icon:<Calendar size={11}/>},
    {key:"notes",   label:`โน้ต (${relatedNotes.length})`, icon:<StickyNote size={11}/>},
    {key:"files",   label:`ไฟล์ (${detailFileCount})`, icon:<Paperclip size={11}/>},
  ];

  // แถบแบ่งหน้า — "แสดง X–Y จาก Z" ซ้าย · Prev / หน้า p / total / Next ขวา
  const Pagination = () => {
    const btnStyle = (disabled:boolean): React.CSSProperties => ({
      display:"inline-flex",alignItems:"center",justifyContent:"center",
      padding:"5px 12px",borderRadius:8,border:`1px solid ${BORDER}`,
      // #6b7280 (MUTED มาตรฐาน) แทน #9ca3af เดิม — contrast ต่ำกว่า WCAG AA (พบจาก /scenario 31 ก.ค. 69)
      background:disabled?"#f1f5f9":"#fff",color:disabled?"#6b7280":PRIMARY,
      fontSize:"0.72rem",fontWeight:700,cursor:disabled?"not-allowed":"pointer",
      opacity:disabled?0.7:1,transition:"all .15s",
    });
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:"0.72rem",color:MUTED}}>แสดง {rangeFrom}–{rangeTo} จาก {filtered.length} รายการ</span>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button type="button" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1} style={btnStyle(page<=1)}>ก่อนหน้า</button>
          <span style={{fontSize:"0.72rem",fontWeight:700,color:STEEL,padding:"0 4px"}}>หน้า {page} / {totalPages}</span>
          <button type="button" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages} style={btnStyle(page>=totalPages)}>ถัดไป</button>
        </div>
      </div>
    );
  };

  return (
    <div className="erp">

      {/* ══ MAIN ══════════════════════════════════════════════ */}
      <div className="erp-col">{/* ระยะระหว่างส่วนจากโครงกลาง (.erp-col) */}

        {/* หัวหน้า/ปุ่ม → ไปอยู่บนแถบบน (ชื่อหน้ามาจาก Topbar) */}
        <TopbarActions>
          <FilterBar dims={[]} />
          {/* ── ไฟล์ที่ "ส่งออก" ต้องนำกลับเข้ามาได้เลย (บอสสั่ง 9 ก.ย. 69) ────────────────
              เดิมส่งออก 9 ช่องแต่ขาด อีเมล · ที่อยู่ · แม่แบบ · เป็นลูกค้าเมื่อ ซึ่งเป็นช่องที่ "นำเข้าลูกค้าเดิม" รับ
              ใครส่งออกไปแก้ใน Excel แล้วนำเข้ากลับ ช่องพวกนั้นจะกลายเป็นว่างทันทีโดยไม่มีอะไรเตือน
              จึงให้คอลัมน์ชุดแรกตรงกับเทมเพลตนำเข้าเป๊ะ (CSV_HEADERS) แล้วค่อยต่อด้วยตัวเลขสรุปที่ระบบคำนวณเอง
              ⚠️ ตัวเลขสรุปท้ายตาราง (กิจกรรมล่าสุด/จำนวนใบ/ยอดขาย/สินค้าที่ซื้อ) นำเข้ากลับไม่ได้โดยตั้งใจ —
                 เป็นค่าที่คิดจากใบเสนอราคาจริง ถ้ารับกลับมาก็เท่ากับให้พิมพ์ยอดขายเอง
              ⚠️ "เป็นลูกค้าเมื่อ" ส่งออกเป็น YYYY-MM-DD ซึ่ง แปลงวันที่นำเข้า() อ่านกลับได้ ห้ามเปลี่ยนเป็นวันไทย
              เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 → ตัดคอลัมน์ "แม่แบบ" กับ "สินค้าที่ซื้อไป" (ชื่อแม่แบบของใบที่ปิด) ออก
              ⚠️ คอลัมน์ชุดแรก = CSV_HEADERS ตรงตัว · scripts/check-export-import-columns.mjs ตรวจให้ */}
          <ExportMenu filename="customers" title="รายชื่อลูกค้า"
            headers={[...CSV_HEADERS,"กิจกรรมล่าสุด","จำนวนใบเสนอราคา","ยอดขายรวม"]}
            rows={filtered.map(c=>[c.company,c.name,c.phone,c.email,c.address??"",c.province,c.joinDate,c.owner,
                lastActivityFor(c.id,c.joinDate,quotations),quotationCountFor(c.id,quotations),fmtMoney(totalSalesFor(c.id,quotations))])} />
          {/* นำเข้าลูกค้าเดิม (คีย์มือ/CSV) — ลูกค้าใหม่ยังเกิดจาก Lead→Won เท่านั้น */}
          <button className="btn btn-primary btn-sm" onClick={()=>{setImportRows([]);setImportErr("");setImportFile("");setShowImport(true);}}>
            <Upload size={14}/> นำเข้าลูกค้าเดิม
          </button>
        </TopbarActions>
        {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

        {/* ── การ์ด KPI 4 ใบ (บอสสั่ง 22 ต.ค. 69 · ใบ 0246 · ทับความจำ "2 ใบตั้งใจ") — ตัวเลขคิดที่ฐาน (kpi_cards · สาขาของผู้ล็อกอิน)
              ทั้งหมด / มีงานขายใหม่เปิดอยู่ = ณ ตอนนี้ · ใหม่ / ยอดขาย = ในช่วงที่เลือก · กดการ์ด = กรองตาราง (ยอดขาย → ใบที่ตอบรับ) */}
        <CustomerKpiRow ช่วง={{ start: วันที่ISO(timeRange.start), end: วันที่ISO(timeRange.end) }} ตัวกรอง={ชุดการ์ด} รุ่น={salesVersion} การ์ดที่กด={การ์ดที่กด}
          กด={k => k === "sales" ? router.push("/quotations?kpi=won") : setการ์ดที่กด(การ์ดที่กด === k || k === "total" ? null : k)} />


        {/* ── แถบตัวกรองแถวเดียว (มาตรฐานเดียวกับหน้า /hq/pipeline) ──
            เดิมเป็นปุ่ม "ตัวกรอง" + แผงชิปเลื่อนจากขวา — ตอนนี้เห็นตัวกรองทุกตัวพร้อมกัน
            ตัวเลือกจังหวัด/ผู้รับผิดชอบสร้างจากข้อมูลลูกค้าจริง · ตัวกรองแม่แบบเอาออกแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
            "ลูกค้าทั้งหมด N รายการ" เอาออกตามที่บอสสั่ง — จำนวนดูได้ที่การ์ด KPI และแถบแบ่งหน้า */}
        <FilterRow
          query={query} onQuery={setQuery} placeholder="ค้นหาลูกค้า, เบอร์โทร, อีเมล..."
          showClear={provFilter!=="ALL" || ownerFilter!=="ALL" || !!query}
          onClear={()=>{ setQuery(""); setProvFilter("ALL"); setOwnerFilter("ALL"); }}
        >
          <FilterSelect caption="ทุกจังหวัด" value={provFilter} onChange={setProvFilter}
            options={provOptions.map(p=>({v:p,l:p}))} />
          <FilterSelect caption="ทุกผู้รับผิดชอบ" value={ownerFilter} onChange={setOwnerFilter}
            options={ownerOptions.map(o=>({v:o,l:o}))} minWidth={140} />
        </FilterRow>

        {/* ── ตารางลูกค้า — คลิกแถวเพื่อเปิดแผงรายละเอียด · เรียงได้ที่หัวคอลัมน์
             ความกว้างคุมที่ colgroup เท่านั้น (table-layout:fixed — ใส่ที่ th ไม่มีผล) ── */}
        {/* ⚠️ ต้องแยก "ไม่มีลูกค้าเลย" ออกจาก "กรองแล้วไม่เจอ" (แก้ 10 ส.ค. 69)
             เดิมขึ้นข้อความเดียวกันหมด — ดีลเลอร์ที่ยังไม่มีลูกค้าสักรายเห็น "ลองล้างตัวกรอง"
             พร้อมปุ่มล้างตัวกรองที่กดแล้วไม่เกิดอะไร เพราะไม่ได้ตั้งตัวกรองไว้ตั้งแต่แรก
             = ชี้ทางผิด ผู้ใช้เสียเวลาหาว่าตัวเองตั้งตัวกรองอะไรไว้
             ที่ถูกคือบอกว่าลูกค้าเกิดจากการปิดการขายลูกค้าเป้าหมาย แล้วพาไปหน้าลูกค้าเป้าหมาย */}
        {filtered.length===0?(
          <div className="card" style={{ marginBottom:16 }}>
            {hasActiveFilter ? (
              <EmptyState icon={<User size={28}/>} title="ไม่พบลูกค้าที่ตรงกับเงื่อนไข"
                description="ลองปรับคำค้นหรือล้างตัวกรองเพื่อดูลูกค้าทั้งหมด"
                action={<button className="btn btn-secondary btn-md" style={{color:PRIMARY}} onClick={()=>{ setProvFilter("ALL"); setOwnerFilter("ALL"); setQuery(""); }}>ล้างตัวกรอง</button>} />
            ) : (
              <EmptyState icon={<User size={28}/>} title="ยังไม่มีลูกค้าในระบบ"
                description="ลูกค้าจะถูกสร้างให้อัตโนมัติเมื่อปิดการขายลูกค้าเป้าหมายได้สำเร็จ"
                action={<button className="btn btn-primary btn-md" onClick={()=>router.push("/leads")}>ไปที่ลูกค้าเป้าหมาย</button>} />
            )}
          </div>
        ):(
          <div className="card" style={{ marginBottom:16 }}>
            <div className="table-wrap" style={{ borderTop:"none" }}>
              <table>
                <colgroup>
                  {/* ความกว้างวัดจริงในเบราว์เซอร์ (หัวตาราง + ข้อมูล) · minWidth รวม ~1006px ต้องไม่เกินกรอบ 1012px
                      "ยอดขายรวม" หัวต้องการ 111px และ "โครงการ" 87px — เคยตั้งแคบไปจนหัวโดนตัด */}
                  {/* บริษัท/ผู้ติดต่อ/จังหวัด หดรวม 32px แลกที่ให้ปุ่ม "ลบ" ที่เพิ่มเข้ามา (13 ส.ค. 69)
                      สามช่องนี้ตัดข้อความด้วย … + hover ดูเต็มได้ และยังกว้างกว่าหัวคอลัมน์ของตัวเอง */}
                  {/* คอลัมน์ "แม่แบบ" (12% · min 116) เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · ยกความกว้างให้ "บริษัท" ทั้งก้อน */}
                  <col style={{ width:"27.4%", minWidth:154 }} />{/* บริษัท */}
                  <col style={{ width:"11.2%", minWidth:110 }} />{/* ผู้ติดต่อ */}
                  <col style={{ width:"11%",   minWidth:118 }} />{/* โทรศัพท์ — เบอร์ห้ามตัด */}
                  <col style={{ width:"9.2%",  minWidth:96 }} />{/* จังหวัด */}
                  <col style={{ width:"11.5%", minWidth:114 }} />{/* ยอดขายรวม — หัว 111 */}
                  <col style={{ width:"9%",    minWidth:90 }} />{/* งานที่ปิดการขาย (จำนวน) */}
                  <col style={{ width:"11%",   minWidth:112 }} />{/* ติดต่อล่าสุด */}
                  <col style={{ width:"9.7%",  minWidth:96 }} />{/* ปุ่ม ดู + ลบ — 2×28 + gap + padding */}
                </colgroup>
                <thead>
                  <tr>
                    {/* หัวคอลัมน์ครอบด้วย flex + nowrap ทุกช่อง — ไม่งั้นลูกศรเรียงตกไปบรรทัดล่างเวลาคอลัมน์แคบ
                        (มาตรฐานเดียวกับตารางลูกค้าเป้าหมาย/ใบเสนอราคา) · คอลัมน์ตัวเลขจัดชิดขวาให้ตรงกับค่าในเซลล์ */}
                    {([
                      ["company",ช่อง.บริษัท,false],["name",ช่อง.ผู้ติดต่อ,false],["phone",ช่อง.โทรศัพท์,false],["province",ช่อง.จังหวัด,false],
                      // "งานที่ปิดการขาย" (เดิม "โครงการ" — ไม่ใช่คำของระบบ · ตรวจเทียบ FLOW รอบ 5) = จำนวนใบที่ลูกค้าตอบรับ
                      //   ไม่ใช้ป้าย "งานที่ต้องการ" เพราะช่องนี้เป็นจำนวน ไม่ใช่ข้อความงานที่ลูกค้าต้องการ
                      [null,"ยอดขายรวม",true],[null,"งานที่ปิดการขาย",true],["lastActivity","ติดต่อล่าสุด",false],
                    ] as [SortKey|null,string,boolean][]).map(([k,label,isNum])=>(
                      <th key={label} className={isNum?"num":(k?"clickable":undefined)}
                        onClick={k?()=>handleSort(k):undefined}
                        style={k?{cursor:"pointer"}:undefined}>
                        <span style={{display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap",justifyContent:isNum?"flex-end":"flex-start"}}>
                          {label}{k&&<SortIcon k={k}/>}
                        </span>
                      </th>
                    ))}
                    <th></th>{/* คอลัมน์ปุ่มดู — ไม่ต้องมีหัวคอลัมน์ (มาตรฐานเดียวกับตารางลูกค้าเป้าหมาย/ใบเสนอราคา) */}
                  </tr>
                </thead>
                <tbody>
                  {paged.map(c=>{
                    const sales = totalSalesFor(c.id, quotations) || c.totalValue;
                    // จำนวนโครงการ = ใบเสนอราคาที่ปิดการขายจริง (ยังไม่ซื้อ = "—" ไม่เดา)
                    const projects = purchasedFor(c.id, quotations).length;
                    return (
                      <ClickableRow key={c.id} className="clickable"
                        onActivate={()=>{ setSelected(c); setCustTab("overview"); }}
                        label={`เปิดรายละเอียดลูกค้า ${c.company}`}
                        style={{ background: selected?.id===c.id ? "#f4f8fd" : undefined }}>
                        <td style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={c.company}>
                          <span style={{ display:"inline-flex", alignItems:"center", gap:9, minWidth:0, maxWidth:"100%" }}>
                            <span style={{ width:28, height:28, borderRadius:8, flexShrink:0, background:c.color||PRIMARY, color:"#fff",
                              display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:"0.62rem", fontWeight:800, overflow:"hidden" }}>
                              {c.logo ? <img src={c.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : c.initials}
                            </span>
                            <span style={{ fontWeight:700, color:STEEL, overflow:"hidden", textOverflow:"ellipsis" }}>{c.company}</span>
                          </span>
                        </td>
                        <td title={c.name} style={{ color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name || "—"}</td>
                        <td style={{ color:"#374151", whiteSpace:"nowrap" }}>{c.phone || "—"}</td>
                        <td style={{ color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.province || "—"}</td>
                        <td className="num" style={{ fontWeight:800, color:PRIMARY, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" }}>{fmtMoney(sales)}</td>
                        <td className="num" style={{ fontWeight:700, color: projects?STEEL:"#9ca3af", fontVariantNumeric:"tabular-nums" }}>{projects || "—"}</td>
                        <td style={{ color:MUTED, fontSize:"0.78rem", whiteSpace:"nowrap" }}>{fmtDate(lastActivityFor(c.id,c.joinDate,quotations))}</td>
                        <td onClick={e=>e.stopPropagation()}>
                          <div style={{ display:"flex", justifyContent:"flex-end", gap:4 }}>
                            <button title="ดูรายละเอียด"
                              onClick={()=>{ setSelected(c); setCustTab("overview"); }}
                              style={{ width:28, height:28, borderRadius:7, border:"1px solid #dbe3ec", background:"#fff", color:PRIMARY, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <Eye size={13} />
                            </button>
                          </div>
                        </td>
                      </ClickableRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div style={{ marginBottom:18 }}><Pagination /></div>

      </div>

      {/* ══ DETAIL PANEL ══════════════════════════════════════ */}
      {selected&&(() => {
        const cardStyle: React.CSSProperties = { background:"#fff", border:"1px solid #eef1f5", borderRadius:14, padding:16 };
        const secLabel: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, fontSize:"0.62rem", fontWeight:800, color:"#8a929c", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 };
        const qa: React.CSSProperties = { background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, height:30, padding:"0 11px", cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", gap:6, fontSize:"0.72rem", fontWeight:600, fontFamily:"inherit", whiteSpace:"nowrap" };
        const lcType = lifecycleTypeFor(selected.id, selected.joinDate, quotations);
        const lcMeta = LIFECYCLE_META[lcType];
        // ลูกค้ามาจากลูกค้าเป้าหมายที่ปิดการขาย → ถ้ายังไม่มีใบเสนอราคาปิดผูกไว้ ใช้มูลค่าที่ยกมาจากลูกค้าเป้าหมาย (totalValue) เป็นค่าตั้งต้น
        const totalSales = totalSalesFor(selected.id, quotations) || selected.totalValue;
        // โครงการที่ซื้อไปแล้ว (ใบเสนอราคาที่ปิดการขาย) — 1 ใบต่อ 1 งาน · เรียงวันปิดล่าสุดขึ้นก่อน
        // เดิมจัดกลุ่มตามแม่แบบ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
        const purchasedRows = purchasedFor(selected.id, quotations);
        const purchasedTotal = purchasedRows.reduce((s,q)=>s+q.totalValue,0);
        // รหัสลูกค้า = รูปแบบแสดงผลของ id จริง (ไม่ใช่ฟิลด์ใหม่)
        const custCode = customerCode(currentDealer.code, selected.id); // แหล่งเดียวกับฝั่ง HQ

        // ประวัติการปิดการขาย — การ์ดต่อใบ (ชื่องาน / เลขที่ใบ / วันที่ซื้อ / ราคา) · ปิดท้ายด้วยแถวรวม
        // ไม่มีคอลัมน์ "สถานะ" (บอสสั่งตัด — สถานะแบบ โอน/ผ่อน/จอง เป็นของธุรกิจอสังหา ระบบนี้ไม่มี)
        const purchasedTable = (
          <>
            <div style={{...secLabel, marginBottom:12}}><Layers size={13} color={PRIMARY}/> ประวัติการปิดการขาย ({purchasedRows.length})</div>
            {purchasedRows.length===0 ? (
              <div style={{fontSize:"0.8rem",color:MUTED,textAlign:"center",padding:"20px 0"}}>
                ยังไม่มีงานที่ปิดการขาย — จะขึ้นที่นี่เมื่อใบเสนอราคาถูกตอบรับ
              </div>
            ) : (
              <>
                {/* การ์ด = 1 ใบต่อ 1 งานที่ปิดการขาย · กดแล้วเปิดรายละเอียดงานนั้นเลย
                    เดิมเป็นการ์ดต่อ "แม่แบบ" + รูปแม่แบบ + ตัวเลือกงานเมื่อมีหลายงาน — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
                  {purchasedRows.map(q=>(
                    <button key={q.id}
                      onClick={()=>setViewProject({q})}
                      title={q.project || q.id}
                      style={{border:"1px solid #eef1f5",borderRadius:12,overflow:"hidden",background:"#fff",padding:0,
                        cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",flexDirection:"column"}}
                      onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.borderColor="rgba(0,51,102,.25)"; }}
                      onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor="#eef1f5"; }}>
                      <span style={{padding:"10px 12px",display:"block",minWidth:0}}>
                        <span style={{display:"block",fontSize:"0.78rem",fontWeight:700,color:STEEL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.project || q.id}</span>
                        <span style={{display:"block",fontSize:"0.66rem",color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2}}>{q.id}</span>
                        <span style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:6,marginTop:6}}>
                          <span style={{fontSize:"0.62rem",color:"#8a929c",whiteSpace:"nowrap"}}>{fmtDate(q.date)}</span>
                          <span style={{fontSize:"0.72rem",fontWeight:800,color:PRIMARY,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{fmtMoney(q.totalValue)}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",borderTop:"1px solid #eef1f5",marginTop:12,paddingTop:10}}>
                  <span style={{fontSize:"0.75rem",color:"#8a929c",fontWeight:700}}>รวมมูลค่าทั้งหมด</span>
                  <span style={{fontSize:"0.95rem",fontWeight:800,color:PRIMARY,fontVariantNumeric:"tabular-nums"}}>{fmtMoney(purchasedTotal)}</span>
                </div>
              </>
            )}
          </>
        );

        return (
        <>
          <div onClick={()=>setSelected(null)} className="drawer-overlay" style={{position:"fixed",inset:0,background:"rgba(45,45,45,.45)",zIndex:200}}/>

          {/* Customer Detail — แผงกลางจอ · คอลัมน์เดียว (มาตรฐานเดียวกับลูกค้าเป้าหมาย) */}
          <div className="modal-pop" style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:820, maxWidth:"calc(100vw - 24px)", height:"min(920px, calc(100vh - 24px))",
            zIndex:210, background:"#fff", boxShadow:"0 30px 90px rgba(0,0,0,.32)", borderRadius:18,
            display:"flex", flexDirection:"column", overflow:"hidden"}}>

            {/* Sticky navy header + quick actions */}
            <div style={{background:PRIMARY,padding:"14px 20px",flexShrink:0}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:14,flexWrap:"wrap"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
                  <div style={{width:46,height:46,borderRadius:13,overflow:"hidden",background:"rgba(255,255,255,.18)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:"1rem",border:"2px solid rgba(255,255,255,.25)",flexShrink:0}}>
                    {selected.logo ? <img src={selected.logo} alt="โลโก้" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : selected.initials}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:"1.12rem",fontWeight:800,color:"#fff",lineHeight:1.2}}>{selected.company}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:"0.72rem",color:"rgba(255,255,255,.72)",marginTop:4}}>
                      {selected.name && <span>{selected.name}</span>}
                      <span style={{display:"flex",alignItems:"center",gap:3}}><MapPin size={11}/> {selected.province}</span>
                      {selected.phone && <span style={{display:"flex",alignItems:"center",gap:3}}><Phone size={11}/> {selected.phone}</span>}
                      {selected.email && <span style={{display:"flex",alignItems:"center",gap:3}}><Mail size={11}/> {selected.email}</span>}
                      <span style={{opacity:.8}}>{custCode}</span>{/* รหัสรูปแบบเดียวกับในแผง (เดิมหัวแผงแสดง #id ดิบ · ตารางเทียบรอบ 1) */}
                      <span style={{opacity:.8}}>เข้าร่วม {fmtDate(selected.joinDate)}</span>
                    </div>
                  </div>
                </div>
                {/* หัว = ลบ · ปิด (ปุ่ม "โทร" เอาออกตามที่บอสสั่ง — เบอร์อยู่ใต้ชื่อแล้ว) */}
                <div style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
                  <button onClick={()=>setSelected(null)} title="ปิด" style={{...qa,width:30,padding:0,justifyContent:"center"}}><X size={15}/></button>
                </div>
              </div>
              {/* Badges: ยอดขายรวม (ป้ายแม่แบบเอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) */}
              <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:12}}>
                <span style={{display:"flex",alignItems:"center",gap:4,padding:"2px 10px",borderRadius:99,fontSize:"0.65rem",fontWeight:800,background:"#fff",color:PRIMARY}}><Coins size={11}/> {fmtMoney(totalSales)}</span>
              </div>
            </div>

            {/* Tab bar — ภาพรวม / ดีล / ใบเสนอราคา / ไทม์ไลน์ (มาตรฐานเดียวกับหน้าลูกค้าเป้าหมาย) */}
            <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb", background:"#fff", flexShrink:0, padding:"0 8px" }}>
              {/* 2 แท็บ: ข้อมูลลูกค้า (มีตารางประวัติการปิดการขาย) · เพิ่มงานขายใหม่ (ดีลของลูกค้ารายนี้ + ปุ่มสร้าง) */}
              {([["overview","ข้อมูลลูกค้า"],["deals","เพิ่มงานขายใหม่"]] as ["overview"|"deals",string][]).map(([k,label])=>(
                <button key={k} onClick={()=>setCustTab(k)}
                  style={{ padding:"11px 14px", border:"none", borderBottom:`2px solid ${custTab===k?PRIMARY:"transparent"}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:"0.8rem", fontWeight:custTab===k?800:600, color:custTab===k?PRIMARY:"#6b7280", marginBottom:-1 }}>{label}</button>
              ))}
            </div>

            {/* Body — เนื้อหาตามแท็บ */}
            <div style={{ flex:1, overflowY:"auto", background:"#f5f7fa" }}>

              {/* ── ข้อมูลลูกค้า (แท็บแรก) = ข้อมูลลูกค้า + ตารางประวัติการปิดการขาย ── */}
              <div style={{ padding:16, display:custTab==="overview"?"flex":"none", flexDirection:"column", gap:14 }}>
                <div style={cardStyle}>
                  {/* แก้ไขได้ในที่เดิมตลอดเวลา — ปุ่มสลับโหมด "แก้ไขข้อมูล" ถูกถอดออก (บอสสั่ง 17 ก.ค. 69 · มาตรฐานเดียวกับหน้าลูกค้าเป้าหมาย)
                      หัวการ์ด (ยอดขายรวม) เป็นค่าที่ระบบคำนวณ คงไว้เหนือฟอร์ม · ป้ายแม่แบบเอาออก (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:2}}>
                    <div style={{...secLabel,marginBottom:0}}><User size={13} color={PRIMARY}/> ข้อมูลลูกค้า</div>
                  </div>
                  <div style={{fontSize:"0.62rem",color:"#8a929c",fontWeight:700}}>ยอดขายรวม</div>
                  <div style={{fontSize:"1.5rem",fontWeight:800,color:PRIMARY,fontVariantNumeric:"tabular-nums",lineHeight:1.2,marginBottom:12}}>{fmtMoney(totalSales)}</div>
                  <CustomerOverviewEditor customer={selected} code={custCode} onSave={saveInline} />
                </div>

                {/* ประวัติการปิดการขาย — การ์ดต่อใบ + แถวรวมมูลค่า
                    ยังไม่มีโครงการ = ไม่ต้องโชว์การ์ดเปล่า (ดูได้ที่แท็บ "ประวัติการปิดการขาย") */}
                {purchasedRows.length>0 && <div style={cardStyle}>{purchasedTable}</div>}
                <div style={cardStyle}>
                  <div style={{...secLabel, justifyContent:"space-between"}}>
                    <span style={{display:"flex",alignItems:"center",gap:6}}><StickyNote size={13} color={PRIMARY}/> โน้ต</span>
                    <button type="button" onClick={()=>setAddingNote(true)} className="btn btn-secondary btn-sm" style={{color:PRIMARY}}>
                      <Plus size={12}/> เพิ่มโน้ต
                    </button>
                  </div>
                  {/* ฟอร์มเพิ่มโน้ต — เดิมมีแต่ส่วนแสดงผล ตารางกับ repo พร้อมแล้วแต่ไม่มีทางเพิ่มจากหน้าจอ */}
                  {addingNote && (
                    <div style={{marginBottom:10,padding:12,borderRadius:10,background:"#f8f9fb",border:"1px solid #eef0f4",display:"flex",flexDirection:"column",gap:8}}>
                      <input value={noteTitle} onChange={e=>setNoteTitle(e.target.value)} placeholder="หัวข้อโน้ต"
                        style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:8,padding:"7px 10px",fontSize:"0.8rem",outline:"none",fontFamily:"inherit"}}/>
                      <textarea value={noteBody} onChange={e=>setNoteBody(e.target.value)} placeholder="รายละเอียดการติดตาม" rows={3}
                        style={{width:"100%",border:"1px solid #e5e7eb",borderRadius:8,padding:"7px 10px",fontSize:"0.8rem",outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
                      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
                        <button type="button" onClick={()=>{setAddingNote(false);setNoteTitle("");setNoteBody("");}} className="btn btn-secondary btn-sm" style={{color:"#374151"}}>ยกเลิก</button>
                        <button type="button" disabled={!noteTitle.trim()} className="btn btn-primary btn-sm"
                          style={{opacity:noteTitle.trim()?1:.5,cursor:noteTitle.trim()?"pointer":"not-allowed"}}
                          onClick={async()=>{
                            try {
                              await customerNotes.add({ title:noteTitle.trim(), content:noteBody.trim(), category:"ลูกค้า", color:"#003366", customerId:selected.id });
                              setAddingNote(false); setNoteTitle(""); setNoteBody("");
                            } catch(e){ แจ้งพลาด("บันทึกโน้ตไม่สำเร็จ: " + friendlyError(e)); }
                          }}>บันทึกโน้ต</button>
                      </div>
                    </div>
                  )}
                  {relatedNotes.length===0 && !addingNote?(
                    <div style={{fontSize:"0.8rem",color:MUTED,textAlign:"center",padding:"18px 0"}}>ยังไม่มีโน้ต</div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {relatedNotes.map(n=>{
                        const c=noteColorOf(n.category);
                        return (
                          <button key={n.id} type="button" onClick={()=>setViewNote(n)} title="กดเพื่อดูโน้ตเต็ม"
                            style={{padding:"10px 12px",borderRadius:10,background:"#f8f9fb",border:`1px solid #eef0f4`,cursor:"pointer",textAlign:"left",width:"100%"}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#eef2f7";}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#f8f9fb";}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                              <span style={{width:6,height:6,borderRadius:"50%",background:c.dot,flexShrink:0}}/>
                              <span style={{fontSize:"0.8rem",fontWeight:700,color:STEEL,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.title}</span>
                              <span style={{fontSize:"0.65rem",color:MUTED}}>{n.updatedAt}</span>
                              <Eye size={13} color={PRIMARY} style={{flexShrink:0}}/>
                            </div>
                            <div style={{fontSize:"0.72rem",color:"#4b5563",whiteSpace:"pre-wrap",lineHeight:1.5,maxHeight:70,overflow:"hidden"}}>{n.content}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div ref={rightApptRef} style={cardStyle}>
                  <div style={secLabel}><CalendarClock size={13} color={PRIMARY}/> นัดหมาย</div>
                  {relatedAppointments.length===0?(
                    <div style={{fontSize:"0.8rem",color:MUTED,textAlign:"center",padding:"14px 0"}}>ยังไม่มีนัดหมาย</div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {relatedAppointments.map(a=>(
                        <button key={a.id} onClick={()=>setViewAppt(a)} title="กดเพื่อดูรายละเอียดนัดหมาย"
                          style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:10,background:"#f8f9fb",border:`1px solid #eef0f4`,cursor:"pointer",textAlign:"left",width:"100%"}}
                          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#e5faf0";}}
                          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#f8f9fb";}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:"0.72rem",fontWeight:700,color:STEEL}}>{a.project}</div>
                            <div style={{fontSize:"0.65rem",color:MUTED,marginTop:2}}>{apptTypeLabel[a.type]} · {fmtISOToThai(a.date)} · {a.time} น.</div>
                          </div>
                          <span className="badge" style={{flexShrink:0,background:"#dce5f0",color:PRIMARY}}>{a.status==="upcoming"?"กำลังจะมาถึง":a.status==="done"?"เสร็จแล้ว":"ยกเลิก"}</span>
                          <Eye size={14} color={PRIMARY} style={{flexShrink:0}}/>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* ── ไฟล์ของลูกค้า — แนบ/ลบที่นี่ (FLOW: "แนบ/ลบไฟล์ — แผงลีด หรือ แผงลูกค้า · หน้าไฟล์ = ดูอย่างเดียว") ──
                    คลังไฟล์ตัวเดียวกับแผงลีด/หน้าไฟล์ (filesRepo + fileStorage.upload) · ลบผ่าน ลบไฟล์() กลางตัวเดียวกับแผงลีด
                    เดิมการ์ดนี้อยู่ในแผงรายละเอียดงานที่ปิดการขาย (เปิดได้เฉพาะลูกค้าที่มีใบตอบรับ) — ย้ายมาแผงลูกค้า ตรวจเทียบ FLOW รอบ 5 */}
                <div style={cardStyle} data-customer-files>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{...secLabel,marginBottom:0}}><Paperclip size={13} color={PRIMARY}/> ไฟล์ ({selectedFiles.length})</div>
                    <button type="button" onClick={()=>fileInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{color:PRIMARY}}>
                      <Plus size={12}/> แนบไฟล์
                    </button>
                  </div>
                  {selectedFiles.length===0 ? (
                    <div style={{fontSize:"0.8rem",color:MUTED,textAlign:"center",padding:"14px 0"}}>ยังไม่มีไฟล์แนบ</div>
                  ) : (
                    <div style={{display:"flex",flexDirection:"column",gap:5}}>
                      {selectedFiles.map(f=>(
                        <button key={f.id} type="button" onClick={()=>setPreviewFile(f)} title="กดเพื่อดูไฟล์"
                          style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",borderRadius:9,
                            border:`1px solid ${BORDER}`,background:"#fff",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                          <Paperclip size={12} color={MUTED} style={{flexShrink:0}}/>
                          <span style={{flex:1,minWidth:0,fontSize:"0.74rem",fontWeight:700,color:STEEL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                          <span style={{fontSize:"0.65rem",color:MUTED,flexShrink:0}}>{f.size}</span>
                          {/* ไฟล์ของใบที่ส่งลูกค้าแล้วไม่มีปุ่มลบ (ฐานกัน ใบ 0233) — กติกาเดียวกับแผงลีด (ลบไฟล์ได้) */}
                          {ลบไฟล์ได้(f, quotations, currentDealer.code) && (
                            <span role="button" tabIndex={0} title="ลบไฟล์" aria-label={`ลบไฟล์ ${f.name}`}
                              onClick={e=>{ e.stopPropagation(); void ลบไฟล์นี้(f); }}
                              onKeyDown={e=>{ if(e.key==="Enter"){ e.stopPropagation(); void ลบไฟล์นี้(f); } }}
                              style={{display:"flex",padding:3,borderRadius:6,color:"#dc2626",flexShrink:0}}><Trash2 size={12}/></span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── ดีล/โครงการ ── */}
              <div style={{ padding:16, display:custTab==="deals"?"flex":"none", flexDirection:"column", gap:14 }}>
                {/* ตารางประวัติการปิดการขายอยู่ในแท็บ "ข้อมูลลูกค้า" ที่เดียว (บอสสั่งไม่ให้ซ้ำที่นี่)
                    แท็บนี้ = ดีลทั้งหมดของลูกค้า รวมที่ยังไม่ปิดการขาย */}
                <div style={cardStyle}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{...secLabel,marginBottom:0}}><Layers size={13} color={PRIMARY}/> งานขายที่กำลังทำ ({projectCount})</div>
                    <button onClick={()=>openNewDeal(selected)} className="btn btn-primary btn-sm"><Plus size={13}/> เพิ่มงานขายใหม่</button>
                  </div>
                  {projectCount===0?(
                    <div style={{fontSize:"0.8rem",color:MUTED,textAlign:"center",padding:"24px 0"}}>ยังไม่มีงานขาย — กด &ldquo;เพิ่มงานขายใหม่&rdquo; เพื่อเริ่มงานขายแรก</div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {/* ประวัติการปิดการขายเหลือที่เดียว = การ์ด "ประวัติการปิดการขาย" แท็บข้อมูลลูกค้า (กดเปิดรายละเอียดได้) · รอบ 4 */}
                      {/* ── โครงการที่กำลังทำ (ลูกค้าเป้าหมายที่ยังไม่ปิดการขาย) ── */}
                      {activeDeals.map(d=>{
                        // ป้ายขั้น = ชื่อ/สีจากตัวกลาง leadStage.ts (ตรงกับแถบ 5 ขั้นในแผงลีด · บอสสั่ง 27 ต.ค. 69)
                        const ขั้น=เลขขั้นของลีด(d.status,quotations.some(q=>q.status==="draft"&&quoteBelongsToLead(q,d)));
                        const sc=สีขั้น(ขั้น);
                        const dealQuoteCount=quotations.filter(q=>q.dealId===d.numId).length;
                        const quoteLabel=dealQuoteCount>0?`${dealQuoteCount} ใบ`:(QUOTED_UP.includes(d.status)?"มี":"—");
                        return (
                          <button key={d.id} onClick={()=>router.push(`/leads?open=${d.numId}`)}
                            style={{display:"flex",flexDirection:"column",gap:6,padding:"10px 12px",borderRadius:10,background:"#f8f9fb",border:`1px solid #eef0f4`,cursor:"pointer",textAlign:"left",width:"100%"}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#eef3f8";}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#f8f9fb";}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontSize:"0.8rem",fontWeight:800,color:STEEL,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.project||d.company}</span>
                              <span className="badge" data-stage-label style={{flexShrink:0,background:sc.bg,color:sc.text}}>{ชื่อขั้น(ขั้น)}</span>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:"0.65rem",color:MUTED}}>
                              {มูลค่าลีด(d)!=null&&<span style={{color:PRIMARY,fontWeight:700}}>{fmtLeadValue(มูลค่าลีด(d))}</span>}
                              <span>ใบเสนอราคา: {quoteLabel}</span>
                              <span>ผู้รับผิดชอบ: {d.assigned}</span>
                              {d.createdAt&&<span>สร้าง: {d.createdAt}</span>}
                              <span style={{marginLeft:"auto",color:PRIMARY,fontWeight:700}}>เปิด →</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* การ์ด "โครงการที่กำลังเริ่ม" เอาออกตามที่บอสสั่ง — มันโชว์ลูกค้าเป้าหมายชุดเดียวกับการ์ด
                    "งานขายทั้งหมด" ข้างบน กลายเป็นตัวเดิมซ้ำบน-ล่าง · ตอนนี้การ์ดเดียวรวมครบแล้ว
                    (ซื้อแล้ว = ใบที่ปิดการขาย · กำลังทำ = ลูกค้าเป้าหมายที่ยังไม่ปิด) */}
              </div>

              {/* แท็บ ใบเสนอราคา/ไทม์ไลน์ ของแผงลูกค้าเอาออก (รอบ 4) — ไม่มีปุ่มเปิดถึงอยู่แล้ว · ใบของลูกค้าดูที่การ์ดประวัติการปิดการขาย */}
            </div>

            {/* แถบปุ่มล่าง — พิมพ์ข้อมูล · ปิด (ปุ่มแก้ไข/สร้างดีล เอาออกตามที่บอสสั่ง
                — แก้ไขยังทำได้จากปุ่มดินสอในการ์ดข้อมูลลูกค้า · สร้างดีลใหม่อยู่ในแท็บโครงการ) */}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, padding:"12px 20px", borderTop:"1px solid #e5e7eb", background:"#fff", flexShrink:0 }}>
              <button onClick={()=>printCustomer(selected, purchasedRows, custCode)} className="btn btn-secondary btn-md" style={{ color:PRIMARY }}>
                <Printer size={14}/> พิมพ์ข้อมูล
              </button>
              <button onClick={()=>setSelected(null)} className="btn btn-primary btn-md">ปิด</button>
            </div>

          </div>
        </>
        );
      })()}

      {/* (ตัวเลือกงานเมื่อการ์ดแม่แบบมีหลายงาน เอาออกแล้ว — การ์ดเป็นใบต่อใบ เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) */}

      {/* ══ PROJECT DETAIL — คลิกโครงการในตาราง "ประวัติการปิดการขาย" ══════════
          ซ้าย = สรุปสถานะ/วันที่/มูลค่า · ขวา = ข้อมูลทุกอย่างของโครงการนั้น
          (ภาพ + ชื่อแม่แบบด้านซ้ายเอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
          ทุกอย่างมาจากใบเสนอราคาที่ปิดการขาย + ดีลที่ผูกอยู่ (ไม่มีข้อมูล = "—") */}
      {viewProject && selected && (() => {
        const { q } = viewProject;
        const cardS: React.CSSProperties = { background:"#fff", border:"1px solid #eef1f5", borderRadius:14, padding:16 };
        const secL: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, fontSize:"0.62rem", fontWeight:800, color:"#8a929c", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 };
        const sc = quotationStatusColor[q.status];
        // BOQ — ใบที่ไม่มี lineItems เก็บไว้ ใช้ materialCost ปั้นเป็นรายการเดียว (ตรรกะเดียวกับหน้าใบเสนอราคา)
        const lis: QuoteLineItem[] = boqLineItems(q);
        const boqTotal = boqSubtotal(lis);
        const vatPct = q.vatPercent ?? dealerVat;   // สแนปช็อตที่ตรึงไว้กับใบ · ใบเก่าที่ไม่มีค่อยใช้ค่าที่สาขาตั้งไว้
        // ดีลที่ผูกกับใบนี้ → ไทม์ไลน์กิจกรรมจริงของดีล
        const deal = customerDeals.find(l => (q.dealId!=null && l.numId===q.dealId)) ?? customerDeals.find(l=>l.company===q.customer);
        const acts = deal?.activities ?? dealActs ?? [];
        const projNotes = relatedNotes;
        const projAppts = relatedAppointments;

        return (
          <>
            <div onClick={()=>setViewProject(null)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.5)",zIndex:240}}/>
            <div className="modal-pop" style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
              width:1040, maxWidth:"calc(100vw - 24px)", height:"min(900px, calc(100vh - 24px))",
              zIndex:250, background:"#fff", boxShadow:"0 30px 90px rgba(0,0,0,.34)", borderRadius:18,
              display:"flex", flexDirection:"column", overflow:"hidden"}}>

              {/* หัว */}
              <div style={{background:PRIMARY,padding:"13px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexShrink:0}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:"1rem",fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.project}</div>
                  <div style={{fontSize:"0.72rem",color:"rgba(255,255,255,.72)",marginTop:2}}>{selected.company} · {q.id}</div>
                </div>
                <button onClick={()=>setViewProject(null)} title="ปิด"
                  style={{width:30,height:30,borderRadius:8,background:"rgba(255,255,255,.15)",border:"none",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <X size={15}/>
                </button>
              </div>

              {/* ซ้าย: สรุปงาน · ขวา: ข้อมูลทั้งหมด */}
              <div className="proj-shell" style={{flex:1,minHeight:0,display:"grid",gridTemplateColumns:"320px minmax(0,1fr)",background:"#f5f7fa"}}>
                <div style={{padding:16,borderRight:"1px solid #e9edf2",display:"flex",flexDirection:"column",gap:12,overflowY:"auto"}}>
                  <div style={cardS}>
                    {([
                      ["สถานะ", ""], ["วันที่ซื้อ", fmtDate(q.date)],
                      ["พื้นที่", q.area>0 ? `${q.area.toLocaleString()} ตร.ม.` : "—"],
                    ] as [string,string][]).map(([k,v])=>(
                      <div key={k} style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",padding:"7px 0",borderBottom:"1px solid #f4f6f9",fontSize:"0.75rem"}}>
                        <span style={{color:"#8a929c",flexShrink:0}}>{k}</span>
                        {k==="สถานะ"
                          ? <span className="badge" style={{background:sc.bg,color:sc.text}}>{quotationStatusLabel[q.status]}</span>
                          : <span style={{fontWeight:700,color:STEEL,textAlign:"right",minWidth:0,wordBreak:"break-word"}}>{v}</span>}
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",paddingTop:10}}>
                      <span style={{fontSize:"0.72rem",color:"#8a929c"}}>มูลค่างาน</span>
                      <span style={{fontSize:"1.1rem",fontWeight:800,color:PRIMARY,fontVariantNumeric:"tabular-nums"}}>{fmtMoney(q.totalValue)}</span>
                    </div>
                  </div>
                </div>

                <div style={{padding:16,display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>

                  {/* รายละเอียดเอกสาร — ชุดเดียวกับหน้าใบเสนอราคา (ไม่มีข้อมูล = "—" ไม่เดา) */}
                  <div style={cardS}>
                    <div style={secL}><FileText size={13} color={PRIMARY}/> รายละเอียดเอกสาร</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
                      {([
                        [ช่อง.จังหวัด, q.province || "—"],
                        // แถว "ประเภทอาคาร" (= building_type แม่แบบของใบ) เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
                        ["พื้นที่", q.area ? `${q.area.toLocaleString()} ตร.ม.` : "—"],
                        ["จำนวนรายการ", `${lis.length} รายการ`],
                        ["วันที่ออก", fmtDate(q.date)],
                        ["วันหมดอายุ", q.expiry ? fmtDate(q.expiry) : "—"],
                      ] as [string,string][]).map(([k,v])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",gap:10,padding:"7px 0",borderBottom:"1px solid #f0f4f8",fontSize:"0.76rem"}}>
                          <span style={{color:"#8a929c"}}>{k}</span>
                          <span style={{fontWeight:700,color:STEEL,textAlign:"right"}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* การ์ด "ไฟล์" ย้ายไปแผงลูกค้า (แท็บข้อมูลลูกค้า) ที่เดียว — ไฟล์เป็นของลูกค้า ไม่ใช่ของใบ
                      (FLOW: แนบ/ลบไฟล์ — แผงลีด หรือ แผงลูกค้า · ตรวจเทียบ FLOW รอบ 5) ไม่ซ้ำไว้ที่นี่อีก */}

                  {/* ไทม์ไลน์ของดีลที่ผูกกับใบนี้ */}
                  <div style={cardS}>
                    <div style={secL}><CalendarClock size={13} color={PRIMARY}/> ไทม์ไลน์ที่เกี่ยวข้อง</div>
                    {acts.length===0 ? (
                      <div style={{fontSize:"0.78rem",color:MUTED}}>— ไม่มีบันทึกกิจกรรมของดีลนี้</div>
                    ) : (
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {acts.map(a=>(
                          <div key={a.id} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                            <span style={{width:8,height:8,borderRadius:"50%",background:PRIMARY,flexShrink:0,marginTop:5}}/>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:"0.78rem",color:STEEL}}>{a.text}</div>
                              <div style={{fontSize:"0.65rem",color:MUTED}}>{a.date}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* รายงานติดตามของดีลนี้ — แก้ได้ (เก็บที่ LeadRow.report ของดีลที่ผูกกับใบนี้) */}
                  <div style={cardS}>
                    {deal
                      ? <ReportEditor lead={deal} onSave={intent => บันทึกลีด(deal.id, intent)} />
                      : <><div style={secL}><StickyNote size={13} color={PRIMARY}/> รายงานติดตาม</div>
                          <div style={{fontSize:"0.78rem",color:MUTED}}>— ใบนี้ไม่ได้ผูกกับดีลในระบบ จึงยังไม่มีที่เก็บรายงาน</div></>}
                  </div>

                  {/* โน้ต ของลูกค้ารายนี้ */}
                  <div style={cardS}>
                    <div style={secL}><StickyNote size={13} color={PRIMARY}/> โน้ต</div>
                    {projNotes.length===0 ? (
                      <div style={{fontSize:"0.78rem",color:MUTED}}>— ยังไม่มีโน้ต</div>
                    ) : projNotes.map(n=>(
                      <div key={n.id} style={{borderLeft:`3px solid ${n.color||PRIMARY}`,paddingLeft:10,marginBottom:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                          <span style={{fontSize:"0.78rem",fontWeight:700,color:STEEL}}>{n.title}</span>
                          <span style={{fontSize:"0.65rem",color:MUTED,flexShrink:0}}>{n.updatedAt||n.createdAt}</span>
                        </div>
                        <div style={{fontSize:"0.72rem",color:"#374151",whiteSpace:"pre-line",lineHeight:1.6,marginTop:3}}>{n.content}</div>
                      </div>
                    ))}
                  </div>

                  {/* นัดหมายของลูกค้ารายนี้ */}
                  <div style={cardS}>
                    <div style={secL}><Calendar size={13} color={PRIMARY}/> นัดหมาย</div>
                    {projAppts.length===0 ? (
                      <div style={{fontSize:"0.78rem",color:MUTED}}>— ยังไม่มีนัดหมาย</div>
                    ) : projAppts.map(a=>(
                      <div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f4f6f9"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:"0.78rem",fontWeight:700,color:STEEL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.project}</div>
                          <div style={{fontSize:"0.65rem",color:MUTED}}>{apptTypeLabel[a.type]} · {fmtDate(a.date)} · {a.time} น.</div>
                        </div>
                        <span className="badge" style={{background:a.status==="upcoming"?"#fff8e1":a.status==="done"?"#e5faf0":"#f0f0f5",color:a.status==="upcoming"?"#b7892a":a.status==="done"?"#059669":"#9ca3af",flexShrink:0}}>
                          {a.status==="upcoming"?"กำลังจะถึง":a.status==="done"?"เสร็จแล้ว":"ยกเลิก"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* ใบเสนอราคา + BOQ */}
                  <div style={cardS}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{...secL,marginBottom:0}}><FileText size={13} color={PRIMARY}/> ใบเสนอราคา</div>
                      {/* พิมพ์ = ขอหัวกระดาษจากฐาน ข้อมูลบริษัทต้องครบ (ใบ 0247) · ไม่ครบ = ปุ่มปิด + ป้ายบอกเหตุผลด้านล่าง */}
                      <button data-print-quote disabled={ขาดตอนพิมพ์(q).length>0}
                        title={ขาดตอนพิมพ์(q).length ? `พิมพ์ไม่ได้ — กรอกข้อมูลบริษัทให้ครบก่อน (ยังขาด: ${ขาดตอนพิมพ์(q).join(" · ")})` : undefined}
                        onClick={()=>void printQuotation(q,{ company:selected.company, name:selected.name, phone:selected.phone, province:selected.province }, q.vatPercent??dealerVat, printCfg,
                          ()=>quotationsRepo.printData(dealerCodeOf(q), q.id)).catch(e=>แจ้งพลาด("พิมพ์ใบเสนอราคาไม่สำเร็จ: "+friendlyError(e)))}
                        className="btn btn-secondary btn-sm" style={{color:PRIMARY}}><Printer size={12}/> พิมพ์ PDF</button>
                    </div>
                    <IssuerGuardNote ขาด={ขาดตอนพิมพ์(q)} การกระทำ="พิมพ์ใบให้ลูกค้า" style={{marginBottom:12}} />
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px",marginBottom:12}}>
                      {([
                        ["เลขที่", q.id], ["ลูกค้า", selected.name||"—"],
                        [ช่อง.บริษัท, selected.company], ["โทร", selected.phone||"—"],
                        [ช่อง.อีเมล, selected.email||"—"], [ช่อง.จังหวัด, q.province||selected.province],
                        [ช่อง.ผู้รับผิดชอบ, selected.owner||"—"],
                      ] as [string,string][]).map(([k,v])=>(
                        <div key={k} style={{display:"flex",gap:8,padding:"5px 0",fontSize:"0.75rem",minWidth:0}}>
                          <span style={{color:"#8a929c",flex:"0 0 78px"}}>{k}</span>
                          <span style={{fontWeight:700,color:STEEL,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={v}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {/* รายการสินค้า (BOQ) */}
                    {/* ตารางรายการกลาง: ลำดับ · รายการ · จำนวน · หน่วย · ราคา/หน่วย · ยอด (บอสสั่ง 30 ต.ค. 69) */}
                    <ตารางรายการ ป้าย="รายการสินค้าในใบเสนอราคา" กว้างขั้นต่ำ={560} กรอบ={{border:"1px solid #eef1f5",borderRadius:10}} ว่าง="— ใบนี้ไม่มีรายการสินค้าบันทึกไว้" แถว={lis} คอลัมน์={[
                      { key:"name", หัว:"รายการ", ชนิด:"ข้อความ", กว้าง:"34%", สไตล์:()=>({fontWeight:700,color:STEEL}), ค่า:li=>li.name, ชี้:li=>li.name },
                      { key:"qty", หัว:"จำนวน", ชนิด:"จำนวน", กว้าง:"12%", ค่า:li=>จัดรูปจำนวน(li.qty) },
                      { key:"unit", หัว:"หน่วย", ชนิด:"หน่วย", กว้าง:"12%", สไตล์:()=>({color:MUTED}), ค่า:li=>จัดรูปหน่วย(li.unit) },
                      { key:"price", หัว:"ราคา/หน่วย", ชนิด:"เงิน", กว้าง:"18%", ค่า:li=>li.unitPrice.toLocaleString() },
                      { key:"total", หัว:"ยอด", ชนิด:"เงิน", กว้าง:"18%", สไตล์:()=>({fontWeight:700}), ค่า:li=>fmtMoney(li.qty*li.unitPrice) },
                    ]} ท้าย={lis.length>0 ? (
                      <>
                        <tr>
                          <td colSpan={5} className="num" style={{color:MUTED,background:"#f8fafc"}}>{lis.length} รายการ · ยอดรวมย่อย</td>
                          <td className="num" style={{fontWeight:700,color:STEEL,background:"#f8fafc"}}>{fmtMoney(boqTotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} className="num" style={{color:MUTED,background:"#f8fafc"}}>VAT {vatPct}%</td>
                          <td className="num" style={{color:STEEL,background:"#f8fafc"}}>{fmtMoney(Math.round(boqTotal*vatPct/100))}</td>
                        </tr>
                        <tr>
                          <td colSpan={5} className="num" style={{fontWeight:800,color:STEEL,background:"#f8fafc"}}>ยอดรวมสุทธิ (รวม VAT)</td>
                          <td className="num" style={{fontWeight:800,color:PRIMARY,background:"#f8fafc"}}>{fmtMoney(boqTotal + Math.round(boqTotal*vatPct/100))}</td>
                        </tr>
                      </>
                    ) : undefined} />
                    {q.note && (
                      <div style={{marginTop:12,fontSize:"0.75rem",color:"#374151",lineHeight:1.6}}>
                        <span style={{color:"#8a929c"}}>หมายเหตุ: </span>{q.note}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* input ไฟล์ (ซ่อน) — ใช้ร่วมกับแท็บไฟล์ของโมดัลลูกค้า */}
      <input ref={fileInputRef} type="file" aria-label="แนบไฟล์เข้าลูกค้า" accept={UPLOAD_ACCEPTED_EXT.join(",")} style={{display:"none"}} onChange={handleFileSelect} />
      <input ref={csvInputRef} type="file" aria-label="นำเข้าลูกค้าจากไฟล์" accept={นามสกุลที่รับได้.join(",")} style={{display:"none"}} onChange={onCsvFile} />

      {/* นำเข้าลูกค้าเดิมจาก CSV */}
      {showImport && (
        <div onClick={()=>setShowImport(false)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.5)",zIndex:230,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:560,background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
            <div style={{background:PRIMARY,color:"#fff",padding:"15px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                {/* รายชื่อคอลัมน์บนหัวหน้าต่างเอาออกแล้ว (บอสสั่ง 28 ส.ค. 69) — ซ้ำกับที่บอกในขั้นที่ 2 อยู่แล้ว */}
                <div style={{fontSize:"0.92rem",fontWeight:800}}>นำเข้าลูกค้าเดิม</div>
              </div>
              <button onClick={()=>setShowImport(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,width:28,height:28,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
            </div>
            <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
              {/* ย้ายลูกค้าเดิมจากระบบเก่า = ทางเดียวคือเทมเพลต (บอสสั่ง 28 ส.ค. 69)
                  ดีลเลอร์ดึงรายชื่อลูกค้าของตัวเองจากระบบเก่า กรอกลงเทมเพลต แล้วอัปกลับเข้ามา
                  ทำเป็น 3 ขั้นชัด ๆ เพราะของเดิมเป็นปุ่มเรียงกัน ผู้ใช้ไม่รู้ว่าต้องเริ่มตรงไหน */}
              {[
                { ที่: 1, หัว: "ดาวน์โหลดเทมเพลต", รอง: "เปิดด้วย Excel หรือ Google ชีต แล้วพิมพ์ต่อได้เลย — มีหัวคอลัมน์และแถวตัวอย่างให้พิมพ์ทับ" },
                { ที่: 2, หัว: "กรอกลูกค้าเดิมจากระบบเก่า", รอง: `ใส่ทีละแถว · ช่อง "${ช่อง.บริษัท}" ต้องมี ช่องอื่นเว้นว่างได้ · คอลัมน์: ${CSV_HEADERS.join(" · ")} · ในไฟล์มีแผ่น "ค่าที่เลือกได้" บอกจังหวัด/ผู้รับผิดชอบที่ระบบมีจริง` },
                { ที่: 3, หัว: "อัปโหลดไฟล์กลับเข้ามา", รอง: `รับไฟล์ ${นามสกุลที่รับได้.map(n=>n.replace(".","")).join(" · ")} · ระบบจะให้ตรวจรายชื่อก่อน แล้วค่อยกดนำเข้า` },
              ].map(ข => (
                <div key={ข.ที่} style={{display:"flex",gap:11,alignItems:"flex-start"}}>
                  <span style={{flex:"0 0 22px",height:22,borderRadius:"50%",background:"#f0f4fa",color:PRIMARY,
                    fontSize:"0.68rem",fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{ข.ที่}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:"0.78rem",fontWeight:700,color:STEEL}}>{ข.หัว}</div>
                    <div style={{fontSize:"0.68rem",color:MUTED,marginTop:2,lineHeight:1.55}}>{ข.รอง}</div>
                    {ข.ที่===1 && (
                      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginTop:8}}>
                        <button className="btn btn-primary btn-sm" onClick={()=>downloadXlsxTemplate(ค่าที่ระบบมี)}>
                          <Download size={13}/> ดาวน์โหลดเทมเพลต (Excel)
                        </button>
                        {/* เป็นปุ่มเหมือนกัน (บอสสั่ง 28 ส.ค. 69) — ของเดิมเป็นข้อความขีดเส้นใต้ ดูไม่ออกว่ากดได้ */}
                        <button className="btn btn-secondary btn-sm" onClick={()=>downloadCsvTemplate(ค่าที่ระบบมี)}>
                          <Download size={13}/> แบบ CSV
                        </button>
                      </div>
                    )}
                    {ข.ที่===3 && (
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginTop:8}}>
                        <button className="btn btn-secondary btn-sm" onClick={()=>csvInputRef.current?.click()}><Upload size={13}/> เลือกไฟล์</button>
                        {importFile && <span style={{fontSize:"0.68rem",color:MUTED,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:240}}>{importFile}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {importErr && <div style={{fontSize:"0.72rem",color:"#dc2626"}}>{importErr}</div>}
              {importRows.length>0 ? (
                <>
                  <div style={{fontSize:"0.72rem",color:MUTED,fontWeight:600}}>พบ {importRows.length} รายการ — ตรวจก่อนยืนยัน</div>
                  <div style={{maxHeight:280,overflowY:"auto",border:`1px solid ${BORDER}`,borderRadius:10}}>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.72rem"}}>
                      <thead><tr style={{background:"#f8f9fb"}}>{[ช่อง.บริษัท,ช่อง.ผู้ติดต่อ,ช่อง.จังหวัด,"เป็นลูกค้าเมื่อ",ช่อง.ผู้รับผิดชอบ].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",color:MUTED,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {importRows.map((r,i)=>(
                          <tr key={i} style={{borderTop:`1px solid ${BORDER}`}}>
                            <td style={{padding:"7px 10px",fontWeight:700,color:STEEL}}>{r.company}</td>
                            <td style={{padding:"7px 10px",color:MUTED}}>{r.name||"—"}</td>
                            <td style={{padding:"7px 10px",color:MUTED}}>{r.province}</td>
                            {/* ไม่ได้กรอกมา = ขึ้น "—" แล้วระบบจะลงค่าตั้งต้นให้ตอนบันทึก (วันนี้ / ผู้รับผิดชอบตั้งต้น) */}
                            <td style={{padding:"7px 10px",color:MUTED,whiteSpace:"nowrap"}}>{r.joinDate?fmtDate(r.joinDate):"—"}</td>
                            <td style={{padding:"7px 10px",color:MUTED}}>{r.owner||"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{fontSize:"0.7rem",color:"#9ca3af",padding:"14px 0",textAlign:"center",borderTop:`1px dashed ${BORDER}`}}>รายชื่อจะขึ้นให้ตรวจตรงนี้หลังเลือกไฟล์</div>
              )}
            </div>
            <div style={{padding:"14px 20px",borderTop:`1px solid ${BORDER}`,background:"#fafafa",display:"flex",justifyContent:"flex-end",gap:8}}>
              {/* ปุ่ม "คีย์เองทีละราย" เอาออกตามที่บอสสั่ง 2 ก.ย. 69 — นำเข้าลูกค้าเดิมใช้ไฟล์อย่างเดียว */}
              <button className="btn btn-secondary btn-md" onClick={()=>setShowImport(false)}>ยกเลิก</button>
              {/* ⚠️ ต้องห่อด้วย arrow — ส่ง onClick ตรง ๆ จะยัด event เข้าไปเป็น "โหมดซ้ำ" แล้วข้ามป๊อปอัพเตือน */}
              <button className="btn btn-primary btn-md" onClick={()=>commitImport()} disabled={!importRows.length}><Check size={14}/> นำเข้า {importRows.length>0?`${importRows.length} ราย`:""}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── เตือนชื่อซ้ำก่อนนำเข้า (บอสสั่ง 2 ก.ย. 69) ─────────────────────────────
          ไฟล์ลูกค้าเดิมมักมีรายที่อยู่ในระบบแล้วปนมาด้วย ถ้าเพิ่มดื้อ ๆ จะได้ลูกค้าชื่อเดียวกันสองแถว
          แยกไม่ออกว่าอันไหนของจริง — จึงต้องให้คนตัดสินก่อนว่าจะเติมของที่ขาด หรือเอาของใหม่ทับ */}
      {ซ้ำที่ต้องถาม && (
        <div onClick={()=>setซ้ำที่ต้องถาม(null)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.5)",zIndex:260,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div role="dialog" aria-label="พบชื่อลูกค้าซ้ำ" className="modal-fit-auto" onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
            <div style={{background:PRIMARY,color:"#fff",padding:"15px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:"0.92rem",fontWeight:800}}>พบชื่อลูกค้าซ้ำ {ซ้ำที่ต้องถาม.length} ราย</div>
              <button aria-label="ปิด" onClick={()=>setซ้ำที่ต้องถาม(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,width:28,height:28,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
            </div>
            <div style={{padding:20,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:"0.78rem",color:STEEL,lineHeight:1.7}}>
                ลูกค้าเหล่านี้มีอยู่ในระบบแล้ว จะให้ทำอย่างไรกับข้อมูลในไฟล์
              </div>
              <div style={{maxHeight:200,overflowY:"auto",border:`1px solid ${BORDER}`,borderRadius:10}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.72rem"}}>
                  <thead><tr style={{background:"#f8f9fb"}}>{[ช่อง.บริษัท,"ในระบบตอนนี้","ในไฟล์"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",color:MUTED,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {ซ้ำที่ต้องถาม.map(({row,เดิม},i)=>(
                      <tr key={i} style={{borderTop:`1px solid ${BORDER}`}}>
                        <td style={{padding:"7px 10px",fontWeight:700,color:STEEL}}>{เดิม.company}</td>
                        <td style={{padding:"7px 10px",color:MUTED}}>{[เดิม.name,เดิม.phone].filter(Boolean).join(" · ")||"—"}</td>
                        <td style={{padding:"7px 10px",color:MUTED}}>{[row.name,row.phone].filter(Boolean).join(" · ")||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{fontSize:"0.7rem",color:MUTED,lineHeight:1.7}}>
                <b>อัปเดตข้อมูล</b> = เติมเฉพาะช่องที่ยังว่างอยู่ ของเดิมที่กรอกไว้แล้วไม่หาย<br/>
                <b>แทนที่</b> = เอาข้อมูลในไฟล์ทับของเดิม (จำนวนงานขายและมูลค่ารวมยังคิดจากงานจริงเหมือนเดิม)
              </div>
            </div>
            <div style={{padding:"14px 20px",borderTop:`1px solid ${BORDER}`,background:"#fafafa",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button className="btn btn-secondary btn-md" onClick={()=>setซ้ำที่ต้องถาม(null)}>ยกเลิก</button>
              <button className="btn btn-secondary btn-md" onClick={()=>{setซ้ำที่ต้องถาม(null); void commitImport("replace");}}>แทนที่</button>
              <button className="btn btn-primary btn-md" onClick={()=>{setซ้ำที่ต้องถาม(null); void commitImport("update");}}><Check size={14}/> อัปเดตข้อมูล</button>
            </div>
          </div>
        </div>
      )}

      {/* สร้างดีลใหม่ dialog — ลูกค้าเดิมซื้อโครงการใหม่ (ข้อมูลลูกค้าคงเดิม) */}
      {showNewDeal && dealCustomer && (
        <div onClick={()=>setShowNewDeal(false)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.5)",zIndex:230,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          {/* สูงไม่เกินจอ: เนื้อหาเลื่อนในกล่อง ปุ่มบันทึกอยู่ท้ายเสมอ (26 ต.ค. 69 · เพิ่มกล่องข้อมูลลูกค้าแล้วปุ่มตกขอบจอเตี้ย) */}
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:460,maxHeight:"calc(100vh - 32px)",display:"flex",flexDirection:"column",background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
            <div style={{background:PRIMARY,color:"#fff",padding:"15px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:"0.92rem",fontWeight:800}}>เพิ่มงานขายใหม่</div>
              </div>
              <button onClick={()=>setShowNewDeal(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,width:28,height:28,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
            </div>
            <div style={{padding:20,display:"flex",flexDirection:"column",gap:13,overflowY:"auto",flex:"1 1 auto",minHeight:0}}>
              {/* ข้อมูลลูกค้า — ดึงจากระเบียนลูกค้า ไม่ถามซ้ำ (บอสสั่ง 26 ต.ค. 69 · ชุดช่องมาตรฐาน) · แก้ได้ที่แท็บข้อมูลลูกค้า */}
              <div data-box="deal-customer" style={{padding:"10px 12px",borderRadius:9,background:"#f0f4f8",border:`1px solid ${BORDER}`,display:"grid",gridTemplateColumns:"auto 1fr",gap:"3px 10px",fontSize:"0.78rem",color:STEEL}}>
                <div style={{gridColumn:"1/-1",fontSize:"0.7rem",fontWeight:800,color:MUTED}}>{กลุ่มช่อง.ลูกค้า}</div>
                {([["company",ช่อง.บริษัท,dealCustomer.company],["contact",ช่อง.ผู้ติดต่อ,dealCustomer.name],["phone",ช่อง.โทรศัพท์,dealCustomer.phone],["email",ช่อง.อีเมล,dealCustomer.email],["address",ช่อง.ที่อยู่,dealCustomer.address]] as const).map(([k,ป้าย,v])=>(
                  <React.Fragment key={k}><span style={{color:MUTED}}>{ป้าย}</span><b data-field={k} style={{fontWeight:700,overflowWrap:"anywhere"}}>{v||"—"}</b></React.Fragment>
                ))}
              </div>
              <div style={{fontSize:"0.7rem",fontWeight:800,color:MUTED,marginBottom:-6}}>{กลุ่มช่อง.งาน}</div>
              <div><label className="form-label" htmlFor="nd-province">{ป้ายบังคับ("จังหวัด")}</label>
                <ProvinceSelect id="nd-province" label={ช่อง.จังหวัด} className="form-select" value={dealForm.province} onChange={v=>setDealForm(f=>({...f,province:v}))} options={จังหวัดของสาขา}
                  หลัง={dealForm.province && !จังหวัดของสาขา.includes(dealForm.province) && <option value={dealForm.province}>{dealForm.province} (นอกภาค)</option>} /></div>
              {/* ชื่อ + ตัวอย่างเดียวกับฟอร์มลูกค้าเป้าหมาย (บอสสั่ง 26 ต.ค. 69 · เดิม "ชื่อโครงการ") — ฟอร์มขอราคาดึงช่องนี้ไปกรอกให้ */}
              <div><label className="form-label" htmlFor="nd-project">{ช่อง.งาน}</label>
                <input id="nd-project" className="form-input" value={dealForm.project} onChange={e=>setDealForm(f=>({...f,project:e.target.value}))} placeholder={ตัวอย่างช่อง.งาน} maxLength={200} /></div>
              {/* ช่อง "แม่แบบ" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · พื้นที่จึงเต็มแถวแทนคู่กับแม่แบบ
                  ป้ายและตัวอย่างต้องเหมือนฟอร์มเพิ่มลูกค้าเป้าหมาย — ช่องเดียวกันห้ามเรียกคนละชื่อ
                  เดิมที่นี่เขียน "มูลค่าคาดการณ์ · เช่น ฿1.2M" ทำให้ผู้ใช้พิมพ์แบบย่อ แล้วเงินปัดหาย */}
              <div><label className="form-label" htmlFor="nd-area">{ช่อง.พื้นที่}</label>
                <input id="nd-area" className="form-input" value={dealForm.area} onChange={e=>setDealForm(f=>({...f,area:e.target.value}))} placeholder="เช่น 1200" /></div>
              {/* ขั้นตอน — ชุดตัวเลือกเดียวกับฟอร์มเพิ่มลูกค้าเป้าหมาย: เลือกได้เฉพาะขั้นก่อน "เสนอราคา"
                  เพราะขั้นเสนอราคาขึ้นไปเลื่อนเองเมื่อมีใบเสนอราคาจริง (ห้ามให้ตั้งเองแล้วขัดกับใบที่มี) */}
              <div><label className="form-label">{ช่อง.ขั้นตอน}</label>
                {/* ต้องมีค่าเสมอ — งานขายต้องเริ่มที่ขั้นใดขั้นหนึ่งเสมอ */}
                <select aria-label={ช่อง.ขั้นตอน} className="form-select" value={dealForm.status}
                  onChange={e=>setDealForm(f=>({...f,status:e.target.value as LeadStatus}))}>
                  {(["WAITING","BULLET"] as LeadStatus[]).map(st=><option key={st} value={st}>{leadStatusLabel[st]}</option>)}
                </select></div>
              <div style={{fontSize:"0.7rem",fontWeight:800,color:MUTED,marginBottom:-6}}>{กลุ่มช่อง.การดูแล}</div>
              <div><label className="form-label">{ช่อง.ผู้รับผิดชอบ}</label>
                <PersonPicker value={dealForm.assigned} onChange={v=>setDealForm(f=>({...f,assigned:v}))} multiple /></div>
              <div><label className="form-label" htmlFor="nd-spec">{ช่อง.สเปก}</label>
                <textarea id="nd-spec" className="form-input" rows={2} style={{resize:"vertical"}} value={dealForm.note} onChange={e=>setDealForm(f=>({...f,note:e.target.value}))} placeholder={ตัวอย่างช่อง.สเปก} /></div>
              {dealErr && (
                <div role="alert" style={{fontSize:"0.72rem",color:"#B91C1C",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 10px"}}>{dealErr}</div>
              )}
              {/* คำอธิบายต้องเป็นภาษาไทยทั้งบรรทัด — เดิมปน "pipeline" กับ "Dashboard" ทั้งที่หน้าจอเรียกว่า
                  "บอร์ดงานขาย" และ "แดชบอร์ด" อยู่แล้ว (มาตรฐานคำไทยของระบบ) */}
              <div style={{fontSize:"0.65rem",color:"#9ca3af"}}>งานขายใหม่จะไปอยู่ในบอร์ดงานขายตามขั้นที่เลือก · นับรวมในแดชบอร์ดและรายงานทันที · เปิดหน้ารายละเอียดให้เลย</div>
            </div>
            <div style={{padding:"14px 20px",borderTop:`1px solid ${BORDER}`,background:"#fafafa",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button className="btn btn-secondary btn-md" onClick={()=>setShowNewDeal(false)}>ยกเลิก</button>
              <button className="btn btn-primary btn-md" onClick={()=>void createDeal()}><Plus size={14}/> เพิ่มงานขาย</button>
            </div>
          </div>
        </div>
      )}


      {/* ลูกค้าเกิดจาก Lead→Won อัตโนมัติเท่านั้น — ฝั่งดีลเลอร์สร้างลูกค้าเองไม่ได้ (ไม่มีฟอร์มเพิ่ม) */}
      {previewFile && <FilePreviewModal file={previewFile} onClose={()=>setPreviewFile(null)} />}

      {/* รายละเอียดนัดหมาย (ดูในตัว) */}
      {viewAppt && (
        <>
          <div onClick={()=>setViewAppt(null)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.45)",zIndex:300}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:310,width:420,maxWidth:"calc(100vw - 32px)",background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,51,102,.28)"}}>
            <div style={{background:PRIMARY,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
                <Calendar size={16} color="#fff"/>
                <div style={{fontSize:"0.9rem",fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{viewAppt.project}</div>
              </div>
              <button onClick={()=>setViewAppt(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,width:28,height:28,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X size={13}/></button>
            </div>
            <div style={{padding:"16px 18px",display:"flex",flexDirection:"column",gap:2}}>
              {[
                ["ประเภท", apptTypeLabel[viewAppt.type]],
                ["วันที่", `${fmtISOToThai(viewAppt.date)} · ${viewAppt.time} น.`],
                ["สถานะ", viewAppt.status==="upcoming"?"กำลังจะมาถึง":viewAppt.status==="done"?"เสร็จแล้ว":"ยกเลิก"],
                [ช่อง.ผู้รับผิดชอบ, viewAppt.assigned||"—"],
                [ช่อง.ผู้ติดต่อ, viewAppt.contact||"—"],
                [ช่อง.โทรศัพท์, viewAppt.phone||"—"],
                [ช่อง.จังหวัด, viewAppt.province||"—"],
                ["หมายเหตุนัด", viewAppt.note||"—"],
              ].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0",borderBottom:`1px solid #f0f4f8`}}>
                  <span style={{fontSize:"0.72rem",color:MUTED,flexShrink:0}}>{k}</span>
                  <span style={{fontSize:"0.76rem",fontWeight:600,color:STEEL,textAlign:"right"}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{padding:"12px 18px",borderTop:`1px solid ${BORDER}`,background:"#fafafa",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button onClick={()=>router.push("/calendar")} className="btn btn-secondary btn-sm" style={{color:"#374151"}}><Calendar size={13}/> เปิดในปฏิทิน</button>
              <button onClick={()=>setViewAppt(null)} className="btn btn-primary btn-sm">ปิด</button>
            </div>
          </div>
        </>
      )}

      {/* รายละเอียดโน้ต (ดูในตัว) */}
      {viewNote && (
        <>
          <div onClick={()=>setViewNote(null)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.45)",zIndex:300}}/>
          <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:310,width:460,maxWidth:"calc(100vw - 32px)",maxHeight:"85vh",background:"#fff",borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 80px rgba(0,51,102,.28)"}}>
            <div style={{background:PRIMARY,padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
                <StickyNote size={16} color="#fff"/>
                <div style={{fontSize:"0.9rem",fontWeight:800,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{viewNote.title}</div>
              </div>
              <button onClick={()=>setViewNote(null)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:7,width:28,height:28,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><X size={13}/></button>
            </div>
            <div style={{padding:"14px 18px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid #f0f4f8`,flexWrap:"wrap"}}>
              <span className="badge" style={{background:noteColorOf(viewNote.category).bg,color:noteColorOf(viewNote.category).text}}>{viewNote.category}</span>
              <span style={{fontSize:"0.68rem",color:MUTED}}>โดย {viewNote.author}</span>
              <span style={{fontSize:"0.68rem",color:MUTED,marginLeft:"auto"}}>แก้ไขล่าสุด {viewNote.updatedAt}</span>
            </div>
            <div style={{padding:"16px 18px",overflowY:"auto",fontSize:"0.8rem",color:"#374151",whiteSpace:"pre-wrap",lineHeight:1.7}}>{viewNote.content}</div>
            <div style={{padding:"12px 18px",borderTop:`1px solid ${BORDER}`,background:"#fafafa",display:"flex",justifyContent:"flex-end"}}>
              <button onClick={()=>setViewNote(null)} className="btn btn-primary btn-sm">ปิด</button>
            </div>
          </div>
        </>
      )}

      {linkToast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)",
          zIndex:300, background:"#003366", color:"#fff", borderRadius:12, padding:"12px 18px",
          boxShadow:"0 10px 32px rgba(0,0,0,.25)", fontSize:"0.8rem", fontWeight:600,
          maxWidth:"calc(100vw - 32px)" }}>
          {linkToast}
        </div>
      )}
    </div>
  );
}

// แถวการ์ด KPI ของหน้าลูกค้า — คอมโพเนนต์ระดับไฟล์ (ห้ามประกาศซ้อนในคอมโพเนนต์หลัก)
function CustomerKpiRow({ ช่วง, ตัวกรอง, รุ่น, การ์ดที่กด, กด }: {
  ช่วง: { start: string; end: string }; ตัวกรอง: KpiFilters | null; รุ่น: unknown; การ์ดที่กด: "new" | "openDeal" | null; กด: (k: "total" | "new" | "sales" | "openDeal") => void;
}) {
  const kpi = useKpiCards("dealer.customers", { ...ช่วง, today: วันที่ISO(APP_NOW), filters: ตัวกรอง, รุ่น });
  const cards = [
    { kpi: "total" as const, label: "ลูกค้าทั้งหมด", value: นับ(ค่า(kpi, "total")), raw: ค่า(kpi, "total"), unit: "ราย", icon: Users, color: "#2563EB", bg: "#E8F0FE", on: การ์ดที่กด == null },
    { kpi: "new" as const, label: "ลูกค้าใหม่ในช่วงนี้", value: นับ(ค่า(kpi, "new")), raw: ค่า(kpi, "new"), unit: "ราย · ตามวันที่เป็นลูกค้า", icon: UserPlus, color: "#7C3AED", bg: "#F3E8FF", on: การ์ดที่กด === "new" },
    { kpi: "sales" as const, label: "ยอดขายจากลูกค้าในช่วงนี้", value: บาทเต็ม(ค่า(kpi, "sales")), raw: ค่า(kpi, "sales"), unit: "ใบที่ตอบรับ · ก่อน VAT", icon: Coins, color: "#EA580C", bg: "#FEF0E6", on: false },
    { kpi: "openDeal" as const, label: "ลูกค้าที่มีงานขายใหม่เปิดอยู่", value: นับ(ค่า(kpi, "openDeal")), raw: ค่า(kpi, "openDeal"), unit: "ราย · มีลูกค้าเป้าหมายที่ยังไม่ปิด", icon: Briefcase, color: "#0D9488", bg: "#E6F7F5", on: การ์ดที่กด === "openDeal" },
  ];
  return (
    <KpiRow label="สรุปลูกค้า" range={ช่วง} style={{ marginBottom: 16 }}>
      {cards.map(k => (
        <KpiCard key={k.kpi} kpi={k.kpi} label={k.label} value={k.value} rawValue={k.raw} unit={k.unit} icon={k.icon} color={k.color} bg={k.bg}
          actionLabel={k.kpi === "sales" ? "ดูใบที่ตอบรับ" : k.on && k.kpi !== "total" ? "กดอีกครั้งเพื่อล้างตัวกรอง" : "ดูรายการ"} onClick={() => กด(k.kpi)} />
      ))}
    </KpiRow>
  );
}
