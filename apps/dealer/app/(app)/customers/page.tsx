"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { มูลค่าลีด } from "@pms/shared/lib/mock";   // มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)
import { useRouter } from "next/navigation";
import { validateUpload, humanFileSize, UPLOAD_ACCEPTED_EXT } from "@pms/shared/lib/uploadLimits";
import { printQuotation } from "@pms/shared/lib/quotationPrint";
import { buildLeadTasks, leadStatusLabel, leadStatusColor, QUOTED_UP, DEFAULT_DEALER_CODE, quotationStatusLabel, quotationStatusColor, noteCategoryColor, fmtISOToThai, customerCode, DEALER_FILES_EVENT, extOfName, guessFileCategory, apptTypeLabel, type QuotationMock, type QuoteLineItem, type LeadRow, type CustomerRow, type DealerFile, type LeadStatus, type AppointmentMock, type LeadActivity, type CustomerStatus } from "@pms/shared/lib/mock";
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
import { provincesOfRegion } from "@pms/shared/lib/provinces";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { leads as leadsRepo, dealers as dealersRepo, persons as personsRepo } from "@pms/shared/lib/data";
import type { DealerRow } from "@pms/shared/lib/data/types";
import { useDealerVat } from "@pms/shared/lib/useDealerSettings";
import { files as filesRepo, storage as fileStorage } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { FilterRow, FilterSelect } from "@pms/shared/components/filters/FilterRow";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { useFilters, APP_NOW, APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { fileToResizedDataURL } from "@pms/shared/lib/imageResize";
import { Plus, X, ChevronUp, ChevronDown, Upload, Download, Phone, Building2, Calendar, FileText, StickyNote, Check, User, Paperclip, Eye, Printer, MapPin, Mail, Coins, Layers, CalendarClock, Users, Trash2 } from "lucide-react";
import { FilePreviewModal } from "@pms/shared/components/ui/FilePreviewModal";
import { แจ้งพลาด, แจ้งสำเร็จ, ยืนยัน } from "@pms/shared/components/ui/ConfirmToast";
import { ลบไฟล์, ลบไฟล์ได้ } from "@pms/shared/lib/fileDelete";

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

const PROVINCES  =["กรุงเทพฯ","เชียงใหม่","ระยอง","เชียงราย","นนทบุรี","สมุทรสาคร","สมุทรปราการ","นครสวรรค์","ราชบุรี","ขอนแก่น","ตาก","อุตรดิตถ์","อื่นๆ"];

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
  { key: "owner",          label: "ผู้รับผิดชอบ" },
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
    ["รหัสลูกค้า", code], ["ชื่อ-สกุล", esc(c.name)],
    ["เบอร์โทรศัพท์", esc(c.phone)], ["อีเมล", esc(c.email)], ["ที่อยู่", esc(c.address)],
    // แถว "แม่แบบ" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
    ["จังหวัด", esc(c.province)],
    ["เป็นลูกค้าเมื่อ", fmtDate(c.joinDate)], ["ผู้รับผิดชอบ", esc(c.owner)],
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
    ${rows.length===0 ? `<div style="font-size:11px;color:#6b7280">— ยังไม่มีโครงการที่ปิดการขาย</div>` : `
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
  const logoRef = useRef<HTMLInputElement>(null);
  const myProvinces = useMyProvinces();  // จังหวัดตามภาคของสาขาที่ล็อกอิน
  // ตั้งค่าฟอร์มใหม่เฉพาะตอน "สลับไปลูกค้าคนอื่น" เท่านั้น — จงใจไม่ใส่ seed ใน dependency
  // (seed ถูกสร้างใหม่ทุก render จะทำให้ล้างสิ่งที่ผู้ใช้กำลังพิมพ์อยู่ทิ้งทุกครั้ง)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setF(seed()); }, [customer.id]);
  const set = <K extends keyof CustomerForm>(k:K,v:CustomerForm[K])=>setF(p=>({...p,[k]:v}));
  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้หลังถูกปฏิเสธ
    if(!file) return;
    try { set("logo", await fileToResizedDataURL(file, 256)); } // ย่อก่อนเก็บ กัน quota เต็ม
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นโลโก้ไม่ได้"); }
  }
  const dirty = (Object.keys(f) as (keyof CustomerForm)[]).some(k => (f[k] ?? "") !== ((customer as unknown as CustomerForm)[k] ?? ""));

  // แก้ไข "ในฟอร์มเดิม" — ตาราง ป้าย : ค่า 2 คอลัมน์ ตำแหน่งเดียวกับตอนอ่าน (ค่ากลายเป็นช่องกรอก)
  // ห้ามสลับไปฟอร์มคนละหน้าตา (บอสสั่ง) · Row/สไตล์อยู่นอกคอมโพเนนต์ (ดูคอมเมนต์ข้างบน)
  const inp = CU_INP, keyS = CU_KEY, colonS = CU_COLON, Row = CuRow;

  return (
    <>
      {/* ── รูปลูกค้า/โลโก้ อยู่บนสุด (บอสสั่ง 21 ส.ค. 69) — ให้ตรงกับการ์ดลูกค้าเป้าหมาย ─── */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
        <span style={{ ...keyS, flex:"0 0 96px" }}>รูป / โลโก้</span><span style={colonS}>:</span>
        <span style={{ width:28, height:28, borderRadius:8, flexShrink:0, overflow:"hidden", background:f.logo?"#fff":"#f8fafc",
          border:`1px ${f.logo?"solid":"dashed"} #e5e7eb`, display:"flex", alignItems:"center", justifyContent:"center" }}>
          {f.logo ? <img src={f.logo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <User size={13} color="#9ca3af" />}
        </span>
        <input ref={logoRef} type="file" accept="image/*" aria-label="อัปโหลดโลโก้ลูกค้า" style={{ display:"none" }} onChange={uploadLogo} />
        <button type="button" onClick={()=>logoRef.current?.click()} className="btn btn-secondary btn-sm" style={{ color:"#374151" }}>
          <Paperclip size={12} /> {f.logo ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
        </button>
        {f.logo && (
          <button type="button" onClick={()=>set("logo","")} className="btn btn-secondary btn-sm" style={{ color:"#dc2626" }}>
            <X size={12} /> ลบรูป
          </button>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 28px", borderTop:"1px solid #eef1f5", paddingTop:12 }}>
        <div style={{ display:"flex", flexDirection:"column" }}>
          <Row label="รหัสลูกค้า"><span style={{ fontSize:"0.8rem", fontWeight:700, color:"#9ca3af" }}>{code}</span></Row>
          <Row label="บริษัท"><input aria-label="ชื่อบริษัท" value={f.company} onChange={e=>set("company",e.target.value)} style={inp} /></Row>
          <Row label="ชื่อ-สกุล"><input aria-label="ชื่อ-สกุลผู้ติดต่อ" value={f.name} onChange={e=>set("name",e.target.value)} style={inp} /></Row>
          <Row label="เบอร์โทรศัพท์"><input inputMode="tel" value={f.phone} onChange={e=>set("phone",formatPhone(e.target.value))} placeholder="0XX-XXX-XXXX" style={inp} /></Row>
          <Row label="อีเมล"><input value={f.email} onChange={e=>set("email",e.target.value)} type="email" placeholder="email@company.com" style={inp} /></Row>
        </div>
        <div style={{ display:"flex", flexDirection:"column" }}>
          <Row label="ที่อยู่">
            <textarea value={f.address ?? ""} onChange={e=>set("address",e.target.value)} rows={2}
              placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ รหัสไปรษณีย์"
              style={{ ...inp, height:"auto", padding:"5px 8px", resize:"vertical", lineHeight:1.4, fontWeight:400 }} />
          </Row>
          <Row label="จังหวัด">
            <select aria-label="จังหวัด" value={f.province} onChange={e=>set("province",e.target.value)} style={{ ...inp, cursor:"pointer" }}>
              <option value="">— ยังไม่ระบุ —</option>
              {myProvinces.map(p=><option key={p}>{p}</option>)}
              {f.province && !myProvinces.includes(f.province) && <option value={f.province}>{f.province} (นอกภาค)</option>}
            </select>
          </Row>
          {/* แถว "แม่แบบ" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · category ยังอยู่ใน f (มาจาก seed)
              บันทึกแล้วส่งค่าเดิมกลับไปตรง ๆ ไม่มีใครแก้ได้ ข้อมูลในฐานจึงไม่เปลี่ยน */}
          {/* joinDate = วันที่เข้าระบบเป็นลูกค้า — ป้าย "วันที่สมัคร" เดิมชวนเข้าใจผิด (บอสสั่งเปลี่ยน 17 ก.ค. 69) */}
          <Row label="เป็นลูกค้าเมื่อ"><input type="date" aria-label="วันที่เป็นลูกค้า" value={f.joinDate} onChange={e=>set("joinDate",e.target.value)} style={inp} /></Row>
          <Row label="ผู้รับผิดชอบ"><PersonPicker value={f.owner} onChange={v=>set("owner",v)} multiple /></Row>
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
    updateCustomer: ctxUpdateCustomer,
  } = useSales();
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน (multi-tenant) — ใช้ออกรหัสลูกค้า
  const userProfile = useUserProfile();
  const dealerCfg = useDealerSettings(); // หัวกระดาษ/ตราประทับของสาขา — ต้องส่งเข้าเอกสารพิมพ์
  const printCfg = { issuer: dealerCfg.settings.issuer, doc: dealerCfg.settings.document };
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
  const [dealForm, setDealForm] = useState({project:"",value:"",area:"",status:"WAITING" as LeadStatus,assigned:"",note:""});
  // ข้อความฟ้องตอนกดบันทึก — ต้องมีเหมือนฟอร์มเพิ่มลูกค้าเป้าหมาย ไม่ใช่กดแล้วเงียบ
  const [dealErr, setDealErr] = useState("");
  // นำเข้าลูกค้าเดิม (ดีลเลอร์) — ลูกค้าก่อนมีระบบ / ไม่ได้ผ่าน Lead→Won · CSV + คีย์มือ
  const [showImport, setShowImport]   = useState(false);
  const [importRows, setImportRows]   = useState<ImportRow[]>([]);
  const [importErr, setImportErr]     = useState("");
  const [importFile, setImportFile]   = useState("");   // ชื่อไฟล์ที่เลือก — ให้ผู้ใช้เห็นว่ากำลังดูไฟล์ไหน
  const [showManual, setShowManual]   = useState(false);
  // ชื่อซ้ำตอนนำเข้า (บอสสั่ง 2 ก.ย. 69) — ห้ามเงียบ ๆ สร้างลูกค้าชื่อเดียวกันซ้อนอีกราย
  //   ต้องถามก่อนว่าจะ "อัปเดตข้อมูล" (เติมเฉพาะช่องที่ว่างอยู่) หรือ "แทนที่" (เอาของในไฟล์ทับ)
  const [ซ้ำที่ต้องถาม, setซ้ำที่ต้องถาม] = useState<{ row: ImportRow; เดิม: CustomerRow }[] | null>(null);
  // ⚠️ ช่องในฟอร์มนี้ต้องครบเท่ากับ "ข้อมูลที่ลูกค้าหนึ่งรายมี" (บอสสั่ง 1 ก.ย. 69)
  //    ที่เหลือของ CustomerRow เป็นค่าที่ระบบคิดเอง: จำนวนงานขาย/มูลค่ารวมมาจากดีลจริง
  //    ตัวย่อ/สีการ์ดมาจากชื่อบริษัท — กรอกเองไม่ได้และไม่ควรให้กรอก
  const legacyเปล่า = {company:"",name:"",phone:"",email:"",address:"",province:"กรุงเทพฯ",joinDate:"",owner:"",status:"" as CustomerStatus | "",logo:""};
  const [legacyForm, setLegacyForm]   = useState(legacyเปล่า);
  const legacyLogoRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  // กันกดบันทึกซ้ำ (H8 · guard synchronous) — เดิม createLegacy() ไม่มี guard เลย กดรัว ๆ เร็วกว่า React
  // จะปิดโมดัล/re-render ทัน สร้างลูกค้าซ้ำหลายแถวได้จริง (แพทเทิร์นเดียวกับที่พบในฟอร์มเพิ่มลูกค้าเป้าหมาย — Edge Case, 3 ส.ค. 69)
  const savingLegacyRef = useRef(false);
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
    // อัปโหลด bytes เข้า Storage ก่อน (local คืน null = เก็บแค่ metadata) แล้วบันทึก metadata
    void fileStorage.upload(currentDealer.code, f).catch(() => null)
      .then(storagePath => filesRepo.add({
        name: f.name, size, ext: extOfName(f.name), category: guessFileCategory(f.name),
        project: selected.company || selected.name, uploadedBy: selected.owner || "คุณ",
        uploadedAt: APP_NOW_ISO, source: "customer", recordId: selected.id, customerId: selected.id, dealerCode: currentDealer.code,
        ...(storagePath ? { storagePath } : {}),
      }))
      .then(() => filesRepo.list({ dealerCode: currentDealer.code, isHQ: false }).then(setDealerFiles))
      .catch(e => logRepoRead("files.add/list", e));
    if (fileInputRef.current) fileInputRef.current.value = "";
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
  const filtered = useMemo(()=>{
    let rows=data.filter(c=>{
      const q=query.toLowerCase();
      const matchQ=!q||c.company.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||c.province.toLowerCase().includes(q)||c.phone.includes(q);
      // ตัวกรอง "สถานะ" + "ลูกค้าใหม่/เดิม" ถูกลบตามที่บอสสั่ง — ไม่มี UI ให้ตั้งค่าแล้ว
      const matchP=provFilter==="ALL"||c.province===provFilter;
      const matchO=ownerFilter==="ALL"||(c.owner||"")===ownerFilter;
      // กรองตามช่วงเวลา — ใช้ "กิจกรรมล่าสุด" ของลูกค้า (โชว์ลูกค้าที่มีความเคลื่อนไหวในช่วงที่เลือก)
      const matchT=passes({date:lastActivityFor(c.id,c.joinDate,quotations)});
      return matchQ&&matchP&&matchO&&matchT;
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
  },[data,quotations,query,provFilter,ownerFilter,sortKey,sortDir,timeRange,passes]);

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
      province:r.province||"กรุงเทพฯ", category:"", status:"active", projects:0,
      // วันที่/ผู้รับผิดชอบจากไฟล์ก่อนเสมอ — ไม่มีค่อยใช้ค่าตั้งต้น (วันนี้ / ผู้รับผิดชอบที่เลือกในฟอร์ม)
      joinDate:r.joinDate||APP_NOW_ISO, owner:r.owner||legacyForm.owner||"",   /* ไม่มีผู้รับผิดชอบ = เว้นว่าง ห้ามใส่ชื่อตัวอย่าง (บอสสั่ง 20 ต.ค. 69) */
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
      setImportRows(rows);
      setImportErr(rows.length?"":'ไม่พบข้อมูลในไฟล์ — ต้องมีคอลัมน์ "บริษัท" และมีอย่างน้อย 1 แถว');
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
  async function createLegacy(){
    if(savingLegacyRef.current) return;
    if(!legacyForm.company.trim()) return;
    savingLegacyRef.current = true;
    try {
      const base=Math.max(0,...data.map(c=>c.id)); // seed สีเท่านั้น — id จริงจาก counter
      await warnBeforeUnloadDuring(() =>
        ctxAddCustomer({...makeImported({company:legacyForm.company.trim(),name:legacyForm.name.trim(),phone:legacyForm.phone,
          email:legacyForm.email,address:legacyForm.address.trim(),province:legacyForm.province,
          joinDate:legacyForm.joinDate,owner:legacyForm.owner}, base+1),
          // สองช่องนี้มีเฉพาะตอนคีย์เอง (ไฟล์นำเข้าไม่มีคอลัมน์รูป/สถานะ)
          status:legacyForm.status || "active", ...(legacyForm.logo ? {logo:legacyForm.logo} : {})})
      );
      setShowManual(false);
      setLegacyForm(legacyเปล่า);
    } catch(e){ แจ้งพลาด("เพิ่มลูกค้าไม่สำเร็จ: " + friendlyError(e)); }
    finally { savingLegacyRef.current = false; }
  }
  // เปิด dialog สร้างดีลใหม่ — prefill ผู้รับผิดชอบจากลูกค้า (เรียกจากการ์ด/หัวโมดัล/แท็บดีล)
  //   ช่อง "แม่แบบ" ไม่มีแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
  function openNewDeal(c: CustomerRow){
    setDealCustomer(c);
    setDealForm({project:"",value:"",area:"",status:"WAITING",assigned:c.owner,note:""}); setDealErr("");
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
    creatingDealRef.current = true;
    try {
      const nid = await newLeadNumId(); // num_id atomic ต่อสาขา (M7) — เลิก Math.max+1 ที่ชนได้
      const newDeal: LeadRow={
        id:`#L-${40321+nid}`, numId:nid,
        name:c.company, company:c.company,                              // ── ข้อมูลลูกค้าเดิม ──
        contact:c.name, phone:c.phone, email:c.email, province:c.province, address:c.address,
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
    <div className="erp" style={{display:"flex",gap:16,alignItems:"flex-start"}}>

      {/* ══ MAIN ══════════════════════════════════════════════ */}
      <div style={{flex:1,minWidth:0}}>

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

        {/* ── KPI 4 ใบ (ภาษาเดียวกับแดชบอร์ด) ── */}
        {(() => {
          const fmtC = (v:number) => v>=1e6 ? `฿${(v/1e6).toFixed(1)}M` : v>=1e3 ? `฿${Math.round(v/1e3)}K` : `฿${v}`;
          const kpis = [
            { label:"ลูกค้าทั้งหมด",     value:`${totalAll}`,        sub:"ราย",     Icon:Users,       color:"#2563EB", bg:"#E8F0FE" },
            { label:"ยอดขายรวม",         value:fmtC(totalValue),     sub:"ทุกโครงการ", Icon:Coins,    color:"#EA580C", bg:"#FEF0E6" },
          ];
          return (
            <div className="dash-kpis" style={{ marginBottom:16 }}>
              {kpis.map(k => (
                <div key={k.label} className="card" style={{ padding:"16px 14px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:"0.72rem", color:"#6B7280" }}>{k.label}</div>
                    <div style={{ fontSize:"1.42rem", fontWeight:800, color:"#1F2937", marginTop:6, fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap" }}>{k.value}</div>
                    <div style={{ fontSize:"0.72rem", color:"#6B7280", marginTop:2 }}>{k.sub}</div>
                  </div>
                  <span style={{ width:42, height:42, borderRadius:12, background:k.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <k.Icon size={20} color={k.color} strokeWidth={2.1} />
                  </span>
                </div>
              ))}
            </div>
          );
        })()}


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
                  <col style={{ width:"9%",    minWidth:90 }} />{/* โครงการ — หัว 87 */}
                  <col style={{ width:"11%",   minWidth:112 }} />{/* ติดต่อล่าสุด */}
                  <col style={{ width:"9.7%",  minWidth:96 }} />{/* ปุ่ม ดู + ลบ — 2×28 + gap + padding */}
                </colgroup>
                <thead>
                  <tr>
                    {/* หัวคอลัมน์ครอบด้วย flex + nowrap ทุกช่อง — ไม่งั้นลูกศรเรียงตกไปบรรทัดล่างเวลาคอลัมน์แคบ
                        (มาตรฐานเดียวกับตารางลูกค้าเป้าหมาย/ใบเสนอราคา) · คอลัมน์ตัวเลขจัดชิดขวาให้ตรงกับค่าในเซลล์ */}
                    {([
                      ["company","บริษัท",false],["name","ผู้ติดต่อ",false],["phone","โทรศัพท์",false],["province","จังหวัด",false],
                      [null,"ยอดขายรวม",true],[null,"โครงการ",true],["lastActivity","ติดต่อล่าสุด",false],
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
                ยังไม่มีโครงการที่ปิดการขาย — จะขึ้นที่นี่เมื่อใบเสนอราคาถูกตอบรับ
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
                        const sc=leadStatusColor[d.status];
                        const dealQuoteCount=quotations.filter(q=>q.dealId===d.numId).length;
                        const quoteLabel=dealQuoteCount>0?`${dealQuoteCount} ใบ`:(QUOTED_UP.includes(d.status)?"มี":"—");
                        return (
                          <button key={d.id} onClick={()=>router.push(`/leads?open=${d.numId}`)}
                            style={{display:"flex",flexDirection:"column",gap:6,padding:"10px 12px",borderRadius:10,background:"#f8f9fb",border:`1px solid #eef0f4`,cursor:"pointer",textAlign:"left",width:"100%"}}
                            onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="#eef3f8";}}
                            onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="#f8f9fb";}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontSize:"0.8rem",fontWeight:800,color:STEEL,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.project||d.company}</span>
                              <span className="badge" style={{flexShrink:0,background:sc.bg,color:sc.text}}>{leadStatusLabel[d.status]}</span>
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
                        ["จังหวัด", q.province || "—"],
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

                  {/* ไฟล์ของลูกค้ารายนี้ + แนบเพิ่ม — ใช้คลังไฟล์ตัวเดียวกับหน้าไฟล์ (addDealerFile) */}
                  <div style={cardS}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{...secL,marginBottom:0}}><Paperclip size={13} color={PRIMARY}/> ไฟล์ ({selectedFiles.length})</div>
                      <button onClick={()=>fileInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{color:PRIMARY}}>
                        <Plus size={12}/> แนบไฟล์
                      </button>
                    </div>
                    {selectedFiles.length===0 ? (
                      <div style={{fontSize:"0.78rem",color:MUTED}}>— ยังไม่มีไฟล์แนบ</div>
                    ) : (
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {selectedFiles.map(f=>(
                          <button key={f.id} onClick={()=>setPreviewFile(f)} title="กดเพื่อดูไฟล์"
                            style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",borderRadius:9,
                              border:`1px solid ${BORDER}`,background:"#fff",cursor:"pointer",textAlign:"left",fontFamily:"inherit"}}>
                            <Paperclip size={12} color={MUTED} style={{flexShrink:0}}/>
                            <span style={{flex:1,minWidth:0,fontSize:"0.74rem",fontWeight:700,color:STEEL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</span>
                            <span style={{fontSize:"0.65rem",color:MUTED,flexShrink:0}}>{f.size}</span>
                            {/* ลบไฟล์ที่นี่ (หน้าไฟล์ดูอย่างเดียว · รอบ 4) — ไฟล์ของใบที่ส่งลูกค้าแล้วไม่มีปุ่ม (ฐานกัน ใบ 0233) */}
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
                      <button onClick={()=>printQuotation(q,{ company:selected.company, name:selected.name, phone:selected.phone, province:selected.province }, q.vatPercent??dealerVat, printCfg)}
                        className="btn btn-secondary btn-sm" style={{color:PRIMARY}}><Printer size={12}/> พิมพ์ PDF</button>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px",marginBottom:12}}>
                      {([
                        ["เลขที่", q.id], ["ลูกค้า", selected.name||"—"],
                        ["บริษัท", selected.company], ["โทร", selected.phone||"—"],
                        ["อีเมล", selected.email||"—"], ["จังหวัด", q.province||selected.province],
                        ["ผู้รับผิดชอบ", selected.owner||"—"],
                      ] as [string,string][]).map(([k,v])=>(
                        <div key={k} style={{display:"flex",gap:8,padding:"5px 0",fontSize:"0.75rem",minWidth:0}}>
                          <span style={{color:"#8a929c",flex:"0 0 78px"}}>{k}</span>
                          <span style={{fontWeight:700,color:STEEL,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={v}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {/* รายการสินค้า (BOQ) */}
                    <div className="table-wrap" style={{border:"1px solid #eef1f5",borderRadius:10,overflow:"hidden"}}>
                      <table>
                        <colgroup>
                          <col style={{width:"40%",minWidth:150}} /><col style={{width:"14%",minWidth:70}} />
                          <col style={{width:"14%",minWidth:70}} /><col style={{width:"16%",minWidth:90}} />
                          <col style={{width:"16%",minWidth:90}} />
                        </colgroup>
                        <thead><tr><th>รายการ</th><th className="num">จำนวน</th><th>หน่วย</th><th className="num">ราคา/หน่วย</th><th className="num">รวม</th></tr></thead>
                        <tbody>
                          {lis.length===0 ? (
                            <tr><td colSpan={5} style={{textAlign:"center",padding:"18px",color:MUTED,fontSize:"0.78rem"}}>— ใบนี้ไม่มีรายการสินค้าบันทึกไว้</td></tr>
                          ) : lis.map((li,i)=>(
                            <tr key={i}>
                              <td style={{fontWeight:700,color:STEEL,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={li.name}>{li.name}</td>
                              <td className="num">{li.qty.toLocaleString()}</td>
                              <td style={{color:MUTED}}>{li.unit}</td>
                              <td className="num">{li.unitPrice.toLocaleString()}</td>
                              <td className="num" style={{fontWeight:700}}>{fmtMoney(li.qty*li.unitPrice)}</td>
                            </tr>
                          ))}
                          {/* ยอดท้าย BOQ ให้ครบเหมือนหน้าใบเสนอราคา — VAT อ่านจากนโยบาย HQ (แหล่งเดียว ไม่ hardcode) */}
                          {lis.length>0 && (
                            <>
                              <tr>
                                <td colSpan={4} style={{textAlign:"right",color:MUTED,background:"#f8fafc"}}>{lis.length} รายการ · ยอดรวมย่อย</td>
                                <td className="num" style={{fontWeight:700,color:STEEL,background:"#f8fafc"}}>{fmtMoney(boqTotal)}</td>
                              </tr>
                              <tr>
                                <td colSpan={4} style={{textAlign:"right",color:MUTED,background:"#f8fafc"}}>VAT {vatPct}%</td>
                                <td className="num" style={{color:STEEL,background:"#f8fafc"}}>{fmtMoney(Math.round(boqTotal*vatPct/100))}</td>
                              </tr>
                              <tr>
                                <td colSpan={4} style={{textAlign:"right",fontWeight:800,color:STEEL,background:"#f8fafc"}}>ยอดรวมสุทธิ (รวม VAT)</td>
                                <td className="num" style={{fontWeight:800,color:PRIMARY,background:"#f8fafc"}}>{fmtMoney(boqTotal + Math.round(boqTotal*vatPct/100))}</td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
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

      {/* คีย์ลูกค้าเดิมทีละราย (legacy manual) */}
      {showManual && (
        <div onClick={()=>setShowManual(false)} style={{position:"fixed",inset:0,background:"rgba(45,45,45,.5)",zIndex:230,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:480,background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
            <div style={{background:PRIMARY,color:"#fff",padding:"15px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                {/* ⚠️ ห้ามใส่คำอธิบายกำกับใต้หัวข้อ (บอสสั่ง 28 ส.ค. 69 · แนวเดียวกับที่เอาออกจากการ์ดทุกหน้า) */}
                <div style={{fontSize:"0.92rem",fontWeight:800}}>เพิ่มลูกค้าเดิม</div>
              </div>
              <button onClick={()=>setShowManual(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,width:28,height:28,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
            </div>
            <div style={{padding:20,overflow:"visible"}}>
              <div className="form-grid">
                <div className="form-section">ข้อมูลบริษัท</div>
                <div className="col-full"><label className="form-label">บริษัท / ชื่อลูกค้า *</label>
                  <input className="form-input" value={legacyForm.company} autoFocus onChange={e=>setLegacyForm(f=>({...f,company:e.target.value}))} placeholder="ชื่อบริษัท / ชื่อลูกค้า" /></div>
                <div><label className="form-label">จังหวัด</label>
                  <input className="form-input" value={legacyForm.province} onChange={e=>setLegacyForm(f=>({...f,province:e.target.value}))} /></div>
                {/* ช่อง "แม่แบบ" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 */}
                {/* ช่องเดียวกับการ์ดข้อมูลลูกค้า — ที่อยู่ / เป็นลูกค้าเมื่อ / ผู้รับผิดชอบ (บอสสั่ง 28 ส.ค. 69)
                    เดิมไม่มีให้กรอก ลูกค้าที่คีย์เข้ามาจึงมีช่องว่างค้างไว้ ต้องไปแก้ทีหลังทุกราย */}
                <div className="col-full"><label className="form-label">ที่อยู่</label>
                  <textarea className="form-input" rows={2} value={legacyForm.address}
                    onChange={e=>setLegacyForm(f=>({...f,address:e.target.value}))}
                    placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์" /></div>
                <div><label className="form-label">เป็นลูกค้าเมื่อ</label>
                  {/* ไม่กรอก = ระบบลงวันที่วันนี้ให้ (ลูกค้าเดิมส่วนใหญ่เข้าระบบมาก่อน ควรใส่วันที่จริง) */}
                  <input type="date" className="form-input" value={legacyForm.joinDate}
                    onChange={e=>setLegacyForm(f=>({...f,joinDate:e.target.value}))} /></div>
                <div><label className="form-label">ผู้รับผิดชอบ</label>
                  <PersonPicker value={legacyForm.owner} onChange={v=>setLegacyForm(f=>({...f,owner:v}))} /></div>
                {/* สถานะ + โลโก้ = อีกสองช่องที่การ์ดลูกค้ามี (บอสสั่ง 1 ก.ย. 69 ให้กรอกได้ครบตั้งแต่ตอนคีย์)
                    เดิมคีย์เองแล้วได้ "ใช้งาน" เสมอและไม่มีรูป ต้องไปแก้ทีหลังทุกราย */}
                <div><label className="form-label">สถานะ</label>
                  {/* ต้องเริ่มที่ "ยังไม่ระบุ" เหมือนช่องเลือกอื่นทั้งระบบ — ไม่งั้นหน้าจอโชว์คำตอบให้แล้ว
                      ทั้งที่ผู้ใช้ยังไม่ได้เลือก · ไม่เลือก = ลงเป็น "ใช้งาน" ตอนบันทึก (ลูกค้าที่เพิ่งคีย์เข้ามา) */}
                  <select aria-label="สถานะ" className="form-select" value={legacyForm.status}
                    onChange={e=>setLegacyForm(f=>({...f,status:e.target.value as CustomerStatus | ""}))}>
                    <option value="">— ยังไม่ระบุ —</option>
                    <option value="active">ใช้งาน</option>
                    <option value="inactive">พักงาน</option>
                  </select></div>
                <div><label className="form-label">โลโก้ / รูปลูกค้า</label>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:30,height:30,borderRadius:8,flexShrink:0,overflow:"hidden",background:legacyForm.logo?"#fff":"#f8fafc",
                      border:`1px ${legacyForm.logo?"solid":"dashed"} ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      {legacyForm.logo
                        ? <img src={legacyForm.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
                        : <User size={13} color="#9ca3af" />}
                    </span>
                    <input ref={legacyLogoRef} type="file" accept="image/*" aria-label="อัปโหลดโลโก้ลูกค้า" style={{display:"none"}}
                      onChange={async e=>{
                        const file=e.target.files?.[0]; e.target.value="";
                        if(!file) return;
                        try{
                          const รูป=await fileToResizedDataURL(file,256);  // ย่อก่อนเก็บ กัน quota เต็ม
                          setLegacyForm(f=>({...f,logo:รูป}));
                        } catch(err){ แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นโลโก้ไม่ได้"); }
                      }} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={()=>legacyLogoRef.current?.click()}>เลือกรูป</button>
                    {legacyForm.logo && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={()=>setLegacyForm(f=>({...f,logo:""}))}>ลบรูป</button>
                    )}
                  </div></div>

                <div className="form-section">ผู้ติดต่อ</div>
                <div><label className="form-label">ผู้ติดต่อ</label>
                  <input className="form-input" value={legacyForm.name} onChange={e=>setLegacyForm(f=>({...f,name:e.target.value}))} placeholder="ชื่อผู้ติดต่อ" /></div>
                <div><label className="form-label">โทรศัพท์</label>
                  <input className="form-input" inputMode="tel" value={legacyForm.phone} onChange={e=>setLegacyForm(f=>({...f,phone:formatPhone(e.target.value)}))} placeholder="0XX-XXX-XXXX" /></div>
                <div className="col-full"><label className="form-label">อีเมล</label>
                  <input className="form-input" value={legacyForm.email} onChange={e=>setLegacyForm(f=>({...f,email:e.target.value}))} placeholder="email@company.com" /></div>
              </div>
              <div style={{fontSize:"0.65rem",color:"#9ca3af",marginTop:12}}>ลูกค้านำเข้าจะติดป้าย &ldquo;นำเข้า&rdquo; · ลูกค้าใหม่ปกติเกิดจากปิดการขาย (Lead→Won)</div>
            </div>
            <div style={{padding:"14px 20px",borderTop:`1px solid ${BORDER}`,background:"#fafafa",display:"flex",justifyContent:"flex-end",gap:8}}>
              <button className="btn btn-secondary btn-md" onClick={()=>setShowManual(false)}>ยกเลิก</button>
              <button className="btn btn-primary btn-md" onClick={createLegacy} disabled={!legacyForm.company.trim()}><Plus size={14}/> เพิ่มลูกค้า</button>
            </div>
          </div>
        </div>
      )}

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
                { ที่: 2, หัว: "กรอกลูกค้าเดิมจากระบบเก่า", รอง: `ใส่ทีละแถว · ช่อง "บริษัท" ต้องมี ช่องอื่นเว้นว่างได้ · คอลัมน์: ${CSV_HEADERS.join(" · ")} · ในไฟล์มีแผ่น "ค่าที่เลือกได้" บอกจังหวัด/ผู้รับผิดชอบที่ระบบมีจริง` },
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
                      <thead><tr style={{background:"#f8f9fb"}}>{["บริษัท","ผู้ติดต่อ","จังหวัด","เป็นลูกค้าเมื่อ","ผู้รับผิดชอบ"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",color:MUTED,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
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
                  <thead><tr style={{background:"#f8f9fb"}}>{["บริษัท","ในระบบตอนนี้","ในไฟล์"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 10px",color:MUTED,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
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
          <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:460,background:"#fff",borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.25)"}}>
            <div style={{background:PRIMARY,color:"#fff",padding:"15px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:"0.92rem",fontWeight:800}}>เพิ่มงานขายใหม่</div>
              </div>
              <button onClick={()=>setShowNewDeal(false)} style={{background:"rgba(255,255,255,.15)",border:"none",borderRadius:8,width:28,height:28,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><X size={14}/></button>
            </div>
            <div style={{padding:20,display:"flex",flexDirection:"column",gap:13,overflow:"visible"}}>
              <div>
                <label className="form-label">ลูกค้า</label>
                <div style={{padding:"9px 12px",borderRadius:9,background:"#f0f4f8",border:`1px solid ${BORDER}`,fontSize:"0.8rem",fontWeight:700,color:STEEL}}>{dealCustomer.company}</div>
              </div>
              {/* ชื่อ + ตัวอย่างเดียวกับฟอร์มลูกค้าเป้าหมาย (บอสสั่ง 26 ต.ค. 69 · เดิม "ชื่อโครงการ") — ฟอร์มขอราคาดึงช่องนี้ไปกรอกให้ */}
              <div><label className="form-label" htmlFor="nd-project">งานที่ต้องการ</label>
                <input id="nd-project" className="form-input" value={dealForm.project} onChange={e=>setDealForm(f=>({...f,project:e.target.value}))} placeholder="เช่น โกดังเก็บสินค้า 20x40 ม." maxLength={200} /></div>
              {/* ช่อง "แม่แบบ" เอาออก — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · พื้นที่จึงเต็มแถวแทนคู่กับแม่แบบ
                  ป้ายและตัวอย่างต้องเหมือนฟอร์มเพิ่มลูกค้าเป้าหมาย — ช่องเดียวกันห้ามเรียกคนละชื่อ
                  เดิมที่นี่เขียน "มูลค่าคาดการณ์ · เช่น ฿1.2M" ทำให้ผู้ใช้พิมพ์แบบย่อ แล้วเงินปัดหาย */}
              <div><label className="form-label">พื้นที่ (ตร.ม.)</label>
                <input className="form-input" value={dealForm.area} onChange={e=>setDealForm(f=>({...f,area:e.target.value}))} placeholder="เช่น 1200" /></div>
              {/* ขั้นตอน — ชุดตัวเลือกเดียวกับฟอร์มเพิ่มลูกค้าเป้าหมาย: เลือกได้เฉพาะขั้นก่อน "เสนอราคา"
                  เพราะขั้นเสนอราคาขึ้นไปเลื่อนเองเมื่อมีใบเสนอราคาจริง (ห้ามให้ตั้งเองแล้วขัดกับใบที่มี) */}
              <div><label className="form-label">ขั้นตอน</label>
                {/* ต้องมีค่าเสมอ — งานขายต้องเริ่มที่ขั้นใดขั้นหนึ่งเสมอ */}
                <select aria-label="ขั้นตอน" className="form-select" value={dealForm.status}
                  onChange={e=>setDealForm(f=>({...f,status:e.target.value as LeadStatus}))}>
                  {(["WAITING","BULLET"] as LeadStatus[]).map(st=><option key={st} value={st}>{leadStatusLabel[st]}</option>)}
                </select></div>
              <div><label className="form-label">ผู้รับผิดชอบ</label>
                <PersonPicker value={dealForm.assigned} onChange={v=>setDealForm(f=>({...f,assigned:v}))} multiple /></div>
              <div><label className="form-label">หมายเหตุ</label>
                <textarea className="form-input" rows={2} style={{resize:"vertical"}} value={dealForm.note} onChange={e=>setDealForm(f=>({...f,note:e.target.value}))} placeholder="รายละเอียดเพิ่มเติม..." /></div>
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
                ["ผู้รับผิดชอบ", viewAppt.assigned||"—"],
                ["ผู้ติดต่อ", viewAppt.contact||"—"],
                ["โทรศัพท์", viewAppt.phone||"—"],
                ["จังหวัด", viewAppt.province||"—"],
                ["หมายเหตุ", viewAppt.note||"—"],
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
