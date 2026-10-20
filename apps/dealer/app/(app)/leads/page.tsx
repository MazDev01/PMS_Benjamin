"use client";

import { diffLeadFields, type LeadIntent, type LeadFields } from "@pms/shared/lib/leadIntent";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { validateUpload, humanFileSize } from "@pms/shared/lib/uploadLimits";
import { useRouter } from "next/navigation";
import { ยืนยัน, แจ้งพลาด } from "@pms/shared/components/ui/ConfirmToast";
import {
  leadStatusLabel, leadStatusColor,
  buildLeadReport, applyTaskTemplate, findAppointmentTask,
  seedLeadTasks, taskProgress, apptTypeLabel, fmtISOToThai,
  DEALER_FILES_EVENT, extOfName, guessFileCategory, LEAD_STATUS_ORDER, MANUAL_LEAD_STATUSES, LEAD_STATUS_META, DEFAULT_DEALER_CODE, ACTIVE_LEAD_STATUSES, CLOSE_TASK_KEY, QUOTE_TASK_KEY, SEND_QUOTE_TASK_KEY,
  OTHER_LOST_REASON, OTHER_REASON_OPTION, มูลค่าลีด,
  type LeadStatus, type LeadRow, type ApptType, type DealerFile, type LeadTaskDef,
} from "@pms/shared/lib/mock";
import type { QuotationMock } from "@pms/shared/lib/data/types";
import { FilePreviewModal } from "@pms/shared/components/ui/FilePreviewModal";
import { EmptyState } from "@pms/shared/components/ui/EmptyState";
import { LeadTasks } from "@pms/shared/components/ui/LeadTasks";
import { LeadQuotationsPanel } from "@pms/shared/components/ui/LeadQuotationsPanel";
import { QuoteRequestPanel } from "@pms/shared/components/ui/QuoteRequestPanel";
import { LeadNextStep } from "@pms/shared/components/ui/LeadNextStep";
import { PersonPicker, AssigneeAvatars } from "@pms/shared/components/ui/PersonPicker";
import { matchCustomers } from "@pms/shared/lib/customerMatch";
import { useLeadRules } from "@pms/shared/lib/useHQRules";
import { useLostReasons, useLeadTaskTemplate } from "@pms/shared/lib/useHQConfig";
import { fileToResizedDataURL } from "@pms/shared/lib/imageResize";
import { formatPhone } from "@pms/shared/lib/format";
import { fmtLeadValue } from "@pms/shared/lib/format";
import { useEscapeKey } from "@pms/shared/lib/useModalA11y";
import { useRole } from "@pms/shared/context/RoleContext";
import {
  Plus, X,
  CheckCircle2, User, Building2,
  MessageSquare, Paperclip, Trash2, Eye, XCircle, Coins, Target, TrendingUp, Percent,
  Phone, Mail, Users, FileText, StickyNote, CalendarClock, MapPin, CheckSquare, Calendar,
  Check, ChevronDown,
  ArrowUpDown, ArrowUp, ArrowDown,
  LayoutList, Columns3, AlarmClock, Ruler,
} from "lucide-react";
import { ExportMenu } from "@pms/shared/components/ui/ExportMenu";
import { useSales } from "@pms/shared/context/SalesContext";
import { DrawerSection } from "@pms/shared/components/ui/RightDrawer";
import { useTableLayout } from "@pms/shared/components/ui/TableTools";
import { useFilters, APP_NOW, APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { FilterBar } from "@pms/shared/components/filters/FilterBar";
import { FilterRow, FilterSelect } from "@pms/shared/components/filters/FilterRow";
import { TopbarActions } from "@pms/shared/components/layout/TopbarActions";
import { Donut } from "@pms/shared/components/ui/Charts";
import { leadCreatedDate } from "@pms/shared/lib/leadMetrics";
import { useCurrentDealer } from "@pms/shared/lib/useCurrentDealer";
import { provincesOfRegion } from "@pms/shared/lib/provinces";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useMyProvinces } from "@pms/shared/lib/useMyProvinces";
import { dealers as dealersRepo } from "@pms/shared/lib/data";
import type { DealerRow } from "@pms/shared/lib/data/types";
import { persons as personsRepo, files as filesRepo, storage as fileStorage, leads as leadsRepo } from "@pms/shared/lib/data";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { lastContactLabel, leadLatestDate as leadLatestDateOf, leadEnteredInRange } from "@pms/shared/lib/leadMetrics";
import { ClickableRow } from "@pms/shared/components/ui/ClickableRow";
import { reportRepoSaveError } from "@pms/shared/lib/useRepoState";
import { ReportEditor } from "@pms/shared/components/ui/ReportEditor";

// ─── Design tokens ────────────────────────────────────────────────────────

const ALL_STATUSES: LeadStatus[] = LEAD_STATUS_ORDER;
// ความคืบหน้าตามขั้นตอน (module-level เพื่อใช้ใน OverviewEditor) — PAID=100, CANCELLED=0
// (DEFAULT_PERSONS ถูกลบ — เดิมเป็นพนักงาน 5 คนจากชุดตัวอย่าง
//  ตาราง responsible_persons ว่าง = ไม่มีวันถูกแทนที่ → ดีลเลอร์เลือกชื่อคนที่ไม่มีอยู่จริง
//  แล้วชื่อนั้นถูกบันทึกลงลูกค้าเป้าหมายใน DB จริง)
// Lead Source ตามสเปก: Facebook / Website / LINE / Walk-in / Referral / Exhibition / Other
// สีของแต่ละแหล่งที่มา (โดนัท) — วนใช้ตามลำดับจำนวนมาก→น้อย
const SOURCE_COLORS = ["#2563EB", "#16A34A", "#F59E0B", "#7C3AED", "#EA580C", "#0D9488", "#94A3B8"];
// ⚠️ "Walk-in" → "ลูกค้าเข้ามาเอง" (แก้ 10 ส.ค. 69) — เหลือคำอังกฤษคำเดียวในลิสต์ที่เป็นไทยหมด
//    และไม่ใช่ชื่อแบรนด์อย่าง Facebook/LINE จึงแปลได้ (ดู legacySource ข้างล่าง — ลูกค้าเป้าหมายเก่าที่บันทึก
//    ค่าเดิมไว้ต้องยังเห็นค่าตัวเองในช่องเลือก ไม่ใช่ถูกเบราว์เซอร์สลับไปตัวเลือกแรกเงียบ ๆ)
const SOURCES = ["Facebook","เว็บไซต์","LINE","ลูกค้าเข้ามาเอง","แนะนำต่อ","งานแสดงสินค้า","อื่นๆ"];

// ── จังหวัดที่เลือกได้ = จังหวัดใน "ภาค" ของสาขาที่ล็อกอิน (บอสสั่ง 17 ส.ค. 69) ──
// เดิมเป็นรายการตายตัว 10 จังหวัดเหมือนกันทุกสาขา — สาขาใต้ก็ยังเห็นเชียงใหม่/เชียงราย
/** ค่าที่บันทึกไว้แต่ไม่อยู่ในลิสต์มาตรฐาน (ลูกค้าเป้าหมายเก่า/ข้อมูลนำเข้า) → แทรกเป็นตัวเลือกเพิ่ม ห้ามทำค่าเดิมหาย */
const legacySource = (v: string) => (v && !SOURCES.includes(v) ? [v] : []);
// ช่วงมูลค่าใน FilterRow — เดิมเป็นช่องกรอก "มูลค่าขั้นต่ำ/สูงสุด (M฿)" สองช่องในแผงตัวกรอง
// เก็บเป็นสตริงหน่วยล้านบาท เพราะตัวกรองจริง (fValueMin/fValueMax) อ่านค่าแบบนั้นอยู่แล้ว
const VALUE_BANDS = [
  { v:"lt1",   l:"ต่ำกว่า 1 ล้าน",  min:"",   max:"1"  },
  { v:"1to5",  l:"1 – 5 ล้าน",      min:"1",  max:"5"  },
  { v:"5to10", l:"5 – 10 ล้าน",     min:"5",  max:"10" },
  { v:"gte10", l:"มากกว่า 10 ล้าน", min:"10", max:""   },
];
const PROVINCES = ["กรุงเทพฯ","เชียงใหม่","ระยอง","เชียงราย","นนทบุรี","สมุทรสาคร","นครสวรรค์","ราชบุรี","ขอนแก่น","อื่นๆ"];
// เหตุผลปิดการขายไม่สำเร็จมาจากรายการที่ HQ กำหนดเท่านั้น (useLostReasons) — ถ้าเหตุผลจริงไม่ตรงกับ
// รายการนั้นเลย ต้องมีทางกรอกเอง (บอสสั่ง 31 ก.ค. 69) ใช้ sentinel นี้เฉพาะตอนเลือกใน <select> เพื่อ
// สลับเป็นช่องพิมพ์เอง — ไม่เคยถูกบันทึกลง DB จริง (lostReason ที่บันทึกคือข้อความที่กรอก)

const THAI_MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
function thaiDateStr(d: Date) { return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`; }

type SortKey = "company"|"value"|"status"|"assigned";

// คอลัมน์ที่ซ่อน/แสดงได้ (optional) สำหรับ TableTools — key ตรงกับ th/td/col ในตาราง
const COLS: { key: string; label: string }[] = [
  { key: "province", label: "จังหวัด" },
  { key: "source",   label: "ช่องทางที่มา" },
  { key: "area",     label: "พื้นที่" },
  { key: "activity", label: "กิจกรรมล่าสุด" },
];
// ─── Helpers ─────────────────────────────────────────────────────────────
function fmtM(n: number) {
  if (!isFinite(n) || n <= 0) return "฿0";
  if (n >= 1e12) return "฿"+(n/1e12).toFixed(1)+"T";
  if (n >= 1e9)  return "฿"+(n/1e9).toFixed(1)+"B";
  if (n >= 1e6) return "฿"+(n/1e6).toFixed(1)+"M";
  if (n >= 1e3) return "฿"+Math.round(n/1e3)+"K";
  return "฿"+n.toLocaleString();
}
// ── มูลค่าลีด = ยอดก่อน VAT ของใบเสนอราคาล่าสุด (บอสตัดสิน 20 ต.ค. 69 · ข้อ 5 · ใบ 0223) — ไม่มีใบ = "—" ──
//   ช่องประเมินราคา (l.value) ที่ดีลเลอร์พิมพ์เองเอาออกจากหน้าเว็บแล้ว ห้ามอ่านมาโชว์/รวมยอด
function fmtมูลค่าย่อ(n: number | null) { return n == null ? "—" : fmtM(n); }
function fmtมูลค่าเต็ม(n: number | null) {
  return n == null ? "—" : "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


// ความคืบหน้าของลูกค้าเป้าหมาย (%) — จากงานที่เช็ก (แหล่งเดียวกับ LeadTasks) · PAID=100 · CANCELLED=0
// tpl = งานมาตรฐานที่ HQ ตั้งไว้ (ส่งมาจากคอมโพเนนต์ที่เรียก useLeadTaskTemplate)
// ลูกค้าเป้าหมายที่ยังไม่มี checklist ต้องนับจากชุดของ HQ ไม่ใช่ชุดเริ่มต้นในโค้ด — ไม่งั้น "0/10" ทั้งที่ HQ ตั้งไว้ 12 งาน
function leadProg(l: LeadRow, tpl?: LeadTaskDef[]): number {
  if (l.status === "PAID") return 100;
  if (l.status === "CANCELLED") return 0;
  return taskProgress(applyTaskTemplate(l.tasks, tpl, l.status));
}
// จำนวนงานที่ทำเสร็จ / ทั้งหมด (ไว้แสดงบนการ์ดบอร์ด)
function leadTaskCount(l: LeadRow, tpl?: LeadTaskDef[]): { done: number; total: number } {
  const t = applyTaskTemplate(l.tasks, tpl, l.status);
  return { done: t.filter(x => x.done).length, total: t.length };
}
// กิจกรรมล่าสุดของลูกค้าเป้าหมาย (activities เรียงใหม่สุดอยู่บน) — ไม่มีกิจกรรม/ไม่มีวันที่สร้าง = "—"
// ห้าม fallback ไป leadCreatedDate(): มันสังเคราะห์วันจาก numId (numId × 17 % 150 วันก่อนวันนี้)
// ซึ่งใช้ได้แค่กับกราฟรวมของลูกค้าเป้าหมาย seed — เอามาโชว์เป็น "ติดต่อล่าสุด" คือโกหกคนอ่าน
// (ลูกค้าเป้าหมายที่เพิ่งสร้างเคยขึ้น "11 ก.พ. 2569" ย้อนหลัง 5 เดือน → เซลส์นึกว่าลูกค้าเป้าหมายถูกทิ้งค้าง)
// กติกาเดียวกับ lastContactLabel() ใน leadMetrics และคอมเมนต์ที่ hq/leads/page.tsx:559
// ตารางไม่มีไทม์ไลน์ติดมาแล้ว (กินขนส่ง) — ใช้ค่าที่ฐานข้อมูลคำนวณไว้แทน (lastContactLabel)
function lastActivity(l: LeadRow): string { return lastContactLabel(l); }
// ผู้รับผิดชอบเก็บได้หลายคน (คั่นด้วย ", ") → เทียบแบบ "มีคนนี้อยู่ในรายชื่อ" ไม่ใช่เท่ากันเป๊ะ
function assignedHas(assigned: string, person: string): boolean {
  return assigned.split(",").map(s => s.trim()).includes(person);
}

// แปลงวันที่ไทยของกิจกรรม ("22 มิ.ย. 2569") → Date เพื่อใช้กรองตามช่วงเวลา (พ.ศ. − 543)
const TH_MONTH: Record<string, number> = { "ม.ค.":0, "ก.พ.":1, "มี.ค.":2, "เม.ย.":3, "พ.ค.":4, "มิ.ย.":5, "ก.ค.":6, "ส.ค.":7, "ก.ย.":8, "ต.ค.":9, "พ.ย.":10, "ธ.ค.":11 };
function parseThaiDate(s?: string): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})\s+(\S+)\s+(\d{4})/.exec(s.trim());
  if (!m || !(m[2] in TH_MONTH)) return null;
  const y = +m[3] > 2500 ? +m[3] - 543 : +m[3];
  return new Date(y, TH_MONTH[m[2]], +m[1]);
}
// วันที่ล่าสุดของลูกค้าเป้าหมาย — ใช้ตัวกลางของระบบ (อ่านจากค่าที่ฐานคำนวณไว้ก่อน)
//   ไม่มีวันติดต่อ = ไม่ตัดออกจากตัวกรองเวลา
const leadLatestDate = leadLatestDateOf;
// ── ลูกค้าเป้าหมายที่ต้องรีบติดตาม (ขาดการติดต่อเกิน 7 วัน) — กฎธุรกิจเดียวที่ต้องมี (ไม่มี SLA) ──
const MOCK_TODAY_LEAD = APP_NOW; // "วันนี้ของระบบ" (supabase=จริง / local=ตรึง 30 มิ.ย. 2569)
const CUR_YEAR = MOCK_TODAY_LEAD.getFullYear(); // กราฟรายเดือน = ปีปัจจุบันเท่านั้น (ข้อมูลมีของปีที่แล้วปนอยู่)
function daysSinceContact(l: LeadRow): number | null {
  const d = leadLatestDate(l) ?? parseThaiDate(l.createdAt);
  if (!d) return null;
  return Math.floor((MOCK_TODAY_LEAD.getTime() - d.getTime()) / 86400000);
}
function needsFollowUp(l: LeadRow, threshold = 7): boolean {
  if (l.status === "PAID" || l.status === "CANCELLED") return false; // ปิดแล้วไม่ต้องตาม
  const days = daysSinceContact(l);
  return days !== null && days > threshold;
}

// ─── Deterministic drawer seeds (no randomness) ───────────────────────────
// กิจกรรม — เริ่มว่าง (เกิดจากการทำงานจริง ไม่ใส่ข้อมูลกระป๋อง)
// งานแต่ละอย่าง → ประเภทกิจกรรม (ไอคอน) เพื่อสร้างไทม์ไลน์จากงานที่ทำเสร็จจริง
const TASK_ACTIVITY_TYPE: Record<string, string> = {
  contact: "call", collect: "note", requirement: "meeting",
  appointment: "meeting", makeQuote: "doc", sendQuote: "doc",
  followup: "call", negotiate: "meeting", close: "doc",
};
// ไทม์ไลน์กิจกรรม — ถ้าลูกค้าเป้าหมายยังไม่มี activities ที่บันทึกไว้ ให้สร้างจากงานที่ติ๊กเสร็จจริง
// เรียงเก่า→ใหม่ ตามลำดับงานในเส้นทางการขาย (ตรงกับลำดับที่ไทม์ไลน์แสดง — บอสสั่ง 21 ส.ค. 69)
function seedActivities(lead: LeadRow): { date: string; text: string; type?: string }[] {
  return (lead.tasks ?? [])
    .filter(t => t.done && t.doneAt)
    .map(t => ({
      date: t.doneAt!,
      text: t.doneBy ? `${t.label} · ${t.doneBy}` : t.label,
      type: TASK_ACTIVITY_TYPE[t.key] ?? "task",
    }));
}
// ไฟล์ — เริ่มว่าง (อัปโหลดจริงเท่านั้น)
function seedFiles(_lead: LeadRow): string[] {
  return [];
}

// ─── Sub-components ───────────────────────────────────────────────────────
// ── แถวป้ายกำกับบนการ์ดกระดาน — "หัวข้อ: ค่า" ทีละบรรทัด (บอสสั่ง 20 ส.ค. 69) ────
//
// ยึดหน้าตาตามระบบเดิมที่บอสใช้อยู่ (Grow CRM) เพื่อให้อ่านการ์ดได้โดยไม่ต้องเรียนรู้ใหม่
// ⚠️ ไม่มีข้อมูล = ขึ้น "—" เสมอ ห้ามซ่อนทั้งบรรทัด: การ์ดแต่ละใบจะได้มีบรรทัดชุดเดียวกัน
//    กวาดตาเทียบกันได้ และผู้ใช้แยกออกว่า "ยังไม่ได้กรอก" ต่างจาก "ไม่มีช่องนี้"
function CardField({ icon: Ic, label, value, tone }: {
  icon: typeof User; label: string; value?: string | null; tone?: string;
}) {
  const มีค่า = !!value && value !== "—";
  return (
    <span style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
      <Ic size={10} color="#94a3b8" style={{ flexShrink:0 }} />
      <span style={{ color:"#94a3b8", fontWeight:600, flexShrink:0 }}>{label}:</span>
      <span title={มีค่า ? String(value) : undefined}
        style={{ color: มีค่า ? (tone ?? "#475569") : "#cbd5e1", fontWeight: tone ? 700 : 600,
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0 }}>
        {มีค่า ? value : "—"}
      </span>
    </span>
  );
}

function SortIcon({ field, sortKey, sortDir }: { field:string; sortKey:string; sortDir:"asc"|"desc" }) {
  if (sortKey !== field) return <ArrowUpDown size={11} color="#e5e7eb" />;
  return sortDir === "asc" ? <ArrowUp size={11} color="#003366" /> : <ArrowDown size={11} color="#003366" />;
}

// ─── ภาพรวม (แก้ไขในตัว) — ฟอร์มแก้ไขข้อมูลลูกค้าเป้าหมายในแท็บภาพรวมของโมดัลรายละเอียด ─────
// สไตล์ + Cell ต้องอยู่นอก OverviewEditor — ประกาศข้างในจะได้ "ฟังก์ชันตัวใหม่" ทุกเรนเดอร์
// React ถือเป็นคนละคอมโพเนนต์ → unmount/mount ลูกใหม่ทุกครั้งที่พิมพ์ → ช่องกรอกหลุดโฟกัสหลังพิมพ์ 1 ตัวอักษร
// ช่องกรอกไม่มีกรอบของตัวเอง (บอสสั่ง) — กรอบมีแค่ชั้นเดียวคือขอบแถว หน้าตาเหมือนตอนอ่าน
const OV_INP: React.CSSProperties = { width:"100%", height:26, padding:"0 8px", borderRadius:6, border:"none", outline:"none", fontSize:"0.8rem", fontWeight:700, fontFamily:"inherit", color:"#2D2D2D", background:"transparent", boxSizing:"border-box" };
const OV_CELL: React.CSSProperties = { display:"flex", alignItems:"center", gap:10, padding:"5px 10px", border:"1px solid #eef1f5", borderRadius:9, background:"#fafbfc", minWidth:0 };
const OV_CELL_LBL: React.CSSProperties = { fontSize:"0.7rem", color:"#8a929c", fontWeight:600, flexShrink:0 };
// หัวข้อกลุ่มในแผงรายละเอียด — 11 ช่องเรียงติดกันรวดเดียวอ่านยาก แบ่งเป็นก้อนตามความหมาย
// (บอสสั่ง 19 ส.ค. 69) · เป็นแค่ style ไม่ใช่คอมโพเนนต์ใหม่ เพราะประกาศคอมโพเนนต์ซ้อนใน
// OverviewEditor จะทำให้ React สร้าง element ใหม่ทุกครั้งที่พิมพ์ แล้วโฟกัสหลุดจากช่องที่กำลังกรอก
const OV_GROUP: React.CSSProperties = {
  gridColumn: "1/-1", fontSize: "0.62rem", color: "#9ca3af", fontWeight: 700,
  letterSpacing: "0.02em", marginTop: 6,
};
const OV_GROUP_FIRST: React.CSSProperties = { ...OV_GROUP, marginTop: 0 };

function OvCell({ icon:Ic, label, children }:{ icon: typeof User; label:string; children:React.ReactNode }) {
  return (
    <div style={OV_CELL}>
      <Ic size={14} color="#94a3b8" style={{ flexShrink:0 }} />
      <span style={OV_CELL_LBL}>{label}</span>
      <span style={{ flex:1, minWidth:0 }}>{children}</span>
    </div>
  );
}

function OverviewEditor({ lead, persons, onSave }: {
  lead: LeadRow; persons: string[]; onSave: (intent: LeadIntent) => void;
}) {
  const lostReasons = useLostReasons(); // เหตุผลปิดไม่สำเร็จที่ HQ กำหนด (ผ่าน repo)
  const taskTpl = useLeadTaskTemplate(); // งานมาตรฐานที่ HQ ตั้ง — ใช้คิด % ของลูกค้าเป้าหมายที่ยังไม่มี checklist
  const myProvinces = useMyProvinces();  // จังหวัดตามภาคของสาขาที่ล็อกอิน
  const seed = () => ({
    company: lead.company ?? "", contact: lead.contact ?? "", phone: lead.phone ?? "",
    email: lead.email ?? "", province: lead.province ?? "", address: lead.address ?? "",
    source: lead.source ?? "",
    status: lead.status,
    assigned: lead.assigned ?? "",
    area: lead.area != null ? String(lead.area) : "",
    project: lead.project ?? "",
    note: lead.note ?? "", lostReason: lead.lostReason ?? "", logo: lead.logo ?? "",
  });
  const [f, setF] = useState(seed);
  // ค่าตอนเปิดฟอร์ม — บันทึกส่งเฉพาะช่องที่ต่างจากนี้ (ไม่ใช่ค่าล่าสุดบนจอ: ช่องที่ฐาน/แท็บอื่นเพิ่งเปลี่ยนต้องไม่ถูกส่งทับ)
  const [ต้นฉบับ, setต้นฉบับ] = useState<LeadRow>(lead);
  // ช่องประเมินราคาเอาออก (บอสตัดสิน 20 ต.ค. 69 · ข้อ 5) — มูลค่าลีดมาจากใบเสนอราคาล่าสุด (แท็บใบเสนอราคา)
  const logoRef = useRef<HTMLInputElement>(null);
  // reseed เมื่อสลับลูกค้าเป้าหมาย
  // จงใจไม่ใส่ seed ใน dependency — seed ถูกสร้างใหม่ทุก render จะล้างสิ่งที่ผู้ใช้กำลังพิมพ์ทิ้ง
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setF(seed()); setต้นฉบับ(lead); }, [lead.id]);
  const set = (k: keyof ReturnType<typeof seed>, v: string) => setF(p => ({ ...p, [k]: v }));
  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้หลังถูกปฏิเสธ
    if (!file) return;
    try { set("logo", await fileToResizedDataURL(file, 256)); } // ย่อก่อนเก็บ กัน quota เต็ม
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นโลโก้ไม่ได้"); }
  }

  const dirty =
    f.company !== (lead.company ?? "") || f.contact !== (lead.contact ?? "") ||
    f.phone !== (lead.phone ?? "") || f.email !== (lead.email ?? "") ||
    f.province !== (lead.province ?? "") || f.source !== (lead.source ?? "") ||
    f.status !== lead.status ||
    f.assigned !== (lead.assigned ?? "") ||
    f.area !== (lead.area != null ? String(lead.area) : "") ||
    f.project !== (lead.project ?? "") ||
    f.note !== (lead.note ?? "") || f.lostReason !== (lead.lostReason ?? "") || f.logo !== (lead.logo ?? "");
  // ความคืบหน้า = แหล่งเดียวกับแท็บ "งาน/ความคืบหน้า" (LeadTasks) → เลขตรงกันทุกแท็บ
  const pct = leadProg(lead, taskTpl);

  const inp = OV_INP;

  function save() {
    const หลัง: LeadRow = {
      // value (ประเมินราคาเดิม) ไม่แก้จากหน้าเว็บแล้ว — ไม่อยู่ในฟอร์ม จึงคงค่าเดิมในฐาน
      ...lead, ...f, logo: f.logo || undefined,
      address: f.address.trim() || undefined,   // ว่าง = ไม่มีข้อมูล (undefined) — ห้ามเก็บสตริงว่างหลอกว่ากรอกแล้ว
      // เว้นว่าง = ไม่มีข้อมูลพื้นที่ (undefined) ไม่ใช่ 0
      area: f.area.trim() && Number(f.area) > 0 ? Number(f.area) : undefined,
      project: f.project.trim() || undefined,
      lostReason: f.status === "CANCELLED" && f.lostReason.trim() && f.lostReason !== OTHER_LOST_REASON ? f.lostReason.trim() : undefined,
    };
    // ส่วนต่างจากตอนเปิดฟอร์ม · ขั้น/เหตุผลปิด = เจตนาเปลี่ยนขั้น (ฐานเป็นเจ้าของ — ไม่ส่งทาง fields)
    const ขั้นเปลี่ยน = หลัง.status !== ต้นฉบับ.status || (หลัง.status === "CANCELLED" && (หลัง.lostReason ?? "") !== (ต้นฉบับ.lostReason ?? ""));
    onSave({
      fields: diffLeadFields(ต้นฉบับ, หลัง),
      ...(ขั้นเปลี่ยน ? { stage: { status: หลัง.status, ...(หลัง.lostReason ? { lostReason: หลัง.lostReason } : {}) } } : {}),
    });
    setต้นฉบับ(หลัง);
  }

  // แก้ไข "ในที่เดิม" — ใช้แถวหน้าตาเดียวกับตอนอ่าน (ไอคอน + ป้าย + ค่า) ค่ากลายเป็นช่องกรอก
  // ไม่เด้งป็อบอัพ (บอสสั่ง — ให้เหมือนหน้าลูกค้า) · Cell/สไตล์อยู่นอกคอมโพเนนต์ (ดูคอมเมนต์ข้างบน)
  const cell = OV_CELL, cellLbl = OV_CELL_LBL, Cell = OvCell;

  return (
    <div>
      {/* มูลค่า + ป้ายสถานะ — ตำแหน่งเดียวกับตอนอ่าน */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12, marginBottom:12 }}>
        <div style={{ minWidth:0 }}>
          {/* ── รูปลูกค้า/โลโก้ อยู่บนสุด (บอสสั่ง 21 ส.ค. 69) ─────────────────────────
          เดิมอยู่ท้ายการ์ดปนกับปุ่มบันทึก ต้องเลื่อนจอลงไปสุดถึงจะเจอ
          รูปเป็น "หน้าตาของลูกค้ารายนี้" ควรเห็นตั้งแต่เปิดการ์ด เหมือนหน้าลูกค้า */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
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

          {/* ช่องเลือกสถานะเอาออก (บอสสั่ง 19 ต.ค. 69 "สถานะเหลือที่เดียว"): สถานะแสดงที่ป้ายหัวแผง + แถบขั้น
              เปลี่ยนขั้นได้ทางปุ่ม "ขั้นต่อไป" และแท็บงานเท่านั้น — เดิมเลือกได้ทุกสถานะ ข้ามหน้ายืนยัน/เหตุผล */}
        </div>
      </div>

      {/* รายละเอียด — แถวเดียวกับตอนอ่าน แต่ค่าแก้ได้ */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, borderTop:"1px solid #eef1f5", paddingTop:14 }}>
        <div style={OV_GROUP_FIRST}>ข้อมูลติดต่อ</div>
        <div style={{ gridColumn:"1/-1", ...cell }}>
          <Building2 size={14} color="#94a3b8" style={{ flexShrink:0 }} />
          <span style={cellLbl}>บริษัท</span>
          <span style={{ flex:1, minWidth:0 }}><input aria-label="ชื่อบริษัท" value={f.company} onChange={e=>set("company",e.target.value)} style={inp} /></span>
        </div>
        {/* ชื่อโครงการมีเฉพาะดีลที่สร้างจากลูกค้าเดิม — โชว์ให้แก้เมื่อมีจริงเท่านั้น (ลูกค้าเป้าหมายทั่วไปไม่มีฟิลด์นี้) */}
        {(lead.project ?? "") !== "" && (
          <div style={{ gridColumn:"1/-1", ...cell }}>
            <FileText size={14} color="#94a3b8" style={{ flexShrink:0 }} />
            <span style={cellLbl}>ชื่อโครงการ</span>
            <span style={{ flex:1, minWidth:0 }}><input aria-label="ชื่อโครงการ" value={f.project} onChange={e=>set("project",e.target.value)} style={inp} /></span>
          </div>
        )}
        <Cell icon={User}    label="ผู้ติดต่อ"><input aria-label="ชื่อผู้ติดต่อ" value={f.contact} onChange={e=>set("contact",e.target.value)} style={inp} /></Cell>
        <Cell icon={Phone}   label="โทรศัพท์"><input inputMode="tel" value={f.phone} onChange={e=>set("phone",formatPhone(e.target.value))} placeholder="0XX-XXX-XXXX" style={inp} /></Cell>
        <Cell icon={Mail}    label="อีเมล"><input aria-label="อีเมล" value={f.email} onChange={e=>set("email",e.target.value)} type="email" style={inp} /></Cell>
        {/* ⚠️ ทุกช่องเลือกในแผงนี้ต้องมีตัวเลือก "ยังไม่ระบุ" (บั๊กจริง พบ 10 ส.ค. 69)
            ค่าจริงเป็นว่างได้ทุกช่อง แต่ถ้าไม่มีตัวเลือกว่างให้ตรง เบราว์เซอร์จะโชว์ตัวเลือกแรกแทน
            → หน้าจอบอกว่ากรอกแล้ว ทั้งที่ในระบบยังว่าง แล้วผู้ใช้ก็หาสาเหตุไม่เจอ */}
        <Cell icon={MapPin}  label="จังหวัด">
          <select aria-label="จังหวัด" value={f.province} onChange={e=>set("province",e.target.value)} style={inp}>
            <option value="">— ยังไม่ระบุ —</option>
            {myProvinces.map(x=><option key={x}>{x}</option>)}
            {f.province && !myProvinces.includes(f.province) && <option value={f.province}>{f.province} (นอกภาค)</option>}
          </select>
        </Cell>
        <div style={{ gridColumn:"1/-1", ...cell }}>
          <MapPin size={14} color="#94a3b8" style={{ flexShrink:0 }} />
          <span style={cellLbl}>ที่อยู่</span>
          <span style={{ flex:1, minWidth:0 }}><input aria-label="ที่อยู่" value={f.address} onChange={e=>set("address",e.target.value)} placeholder="—" style={inp} /></span>
        </div>
        <div style={OV_GROUP}>รายละเอียดงาน</div>
        <Cell icon={Ruler}   label="พื้นที่ (ตร.ม.)">
          <input type="number" min={0} value={f.area} onChange={e=>set("area",e.target.value)} placeholder="—" style={inp} />
        </Cell>
        <div style={OV_GROUP}>การดูแล</div>
        <Cell icon={Target}  label="แหล่งที่มา">
          <select aria-label="ช่องทางที่มา" value={f.source} onChange={e=>set("source",e.target.value)} style={inp}>
            <option value="">— ยังไม่ระบุ —</option>
            {[...legacySource(f.source), ...SOURCES].map(x=><option key={x}>{x}</option>)}
          </select>
        </Cell>
        <Cell icon={Users}   label="ผู้รับผิดชอบ">
          <select aria-label="ผู้รับผิดชอบ" value={f.assigned} onChange={e=>set("assigned",e.target.value)} style={inp}>
            <option value="">— ยังไม่มอบหมาย —</option>
            {persons.map(x=><option key={x}>{x}</option>)}
          </select>
        </Cell>
        {f.status === "CANCELLED" && (
          <Cell icon={XCircle} label="เหตุผลที่เสีย">
            {/* เหตุผลไม่ตรงรายการที่ HQ กำหนดไว้เลย → กรอกเองได้ (ค่า lostReason เดิม/พิมพ์เองใหม่ ไม่ผูกกับ
                รายการตายตัว) — เดิมเลือกได้แค่จากลิสต์ ถ้าเหตุผลจริงไม่มีในนั้นก็บันทึกไม่ได้เลย */}
            {lostReasons.includes(f.lostReason) || f.lostReason === "" ? (
              <select aria-label="เหตุผลที่ปิดการขายไม่สำเร็จ" value={f.lostReason} onChange={e=>set("lostReason", e.target.value)} style={inp}>
                <option value="">— เลือก —</option>
                {lostReasons.map(r => <option key={r} value={r}>{r}</option>)}
                <option value={OTHER_LOST_REASON}>อื่นๆ (ระบุเอง)</option>
              </select>
            ) : (
              <span style={{ display:"flex", gap:6, alignItems:"center" }}>
                <input value={f.lostReason === OTHER_LOST_REASON ? "" : f.lostReason} onChange={e=>set("lostReason", e.target.value)} placeholder="ระบุเหตุผล…" style={inp} autoFocus />
                <button type="button" onClick={()=>set("lostReason","")} title="กลับไปเลือกจากรายการ" style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", flexShrink:0, padding:4 }}><X size={14}/></button>
              </span>
            )}
          </Cell>
        )}
        {/* สองแถวนี้ระบบคำนวณ/ประทับเอง — โชว์ไว้ให้ครบเหมือนมุมมองอ่านเดิม แต่แก้ไม่ได้
            แยกกลุ่มไว้ท้ายสุด เพื่อให้เห็นได้ทันทีว่าอันไหนกรอกเองได้ อันไหนระบบใส่ให้ */}
        <div style={OV_GROUP}>ระบบบันทึกให้</div>
        <Cell icon={MessageSquare} label="ติดต่อล่าสุด"><span style={{ display:"block", fontSize:"0.82rem", fontWeight:700, color:"#2D2D2D", textAlign:"right" }}>{lastActivity(lead)}</span></Cell>
        <Cell icon={CalendarClock} label="สร้างเมื่อ"><span style={{ display:"block", fontSize:"0.82rem", fontWeight:700, color:"#2D2D2D", textAlign:"right" }}>{lead.createdAt || "—"}</span></Cell>
      </div>

      {/* หมายเหตุ — ตำแหน่งเดียวกับตอนอ่าน */}
      <div style={{ background:"#f7f9fc", border:"1px solid #eef1f5", borderRadius:10, padding:"10px 12px", marginTop:12 }}>
        <div style={{ fontSize:"0.62rem", color:"#9ca3af", fontWeight:700, marginBottom:4 }}>หมายเหตุ</div>
        <textarea value={f.note} onChange={e=>set("note",e.target.value)} rows={2} placeholder="รายละเอียดเพิ่มเติม…"
          style={{ ...inp, height:"auto", resize:"vertical", lineHeight:1.6 }} />
      </div>

      {/* แถวล่าง: ข้อความเตือน + ปุ่มบันทึก (รูปย้ายขึ้นไปบนสุดแล้ว — บอสสั่ง 21 ส.ค. 69) */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:12, paddingTop:10, borderTop:"1px solid #f4f6f9", flexWrap:"wrap" }}>
        <span style={{ flex:1 }} />
        {dirty && <button onClick={()=>setF(seed())} className="btn btn-secondary btn-sm" style={{ color:"#374151" }}>ยกเลิก</button>}
        {(() => {
          // ปิดการขายไม่สำเร็จ ต้องเลือกเหตุผลก่อนถึงจะบันทึกได้ — ให้ตรงกับปุ่ม "ปิดการขายไม่สำเร็จ"
          // ในแผงเดียวกัน (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69: เดิมช่องนี้ปล่อยผ่านได้โดยไม่กรอกเหตุผล)
          const needsReason = f.status === "CANCELLED" && !f.lostReason;
          const disabled = !dirty || needsReason;
          return (
            <button onClick={save} disabled={disabled} className="btn btn-primary btn-sm"
              title={needsReason ? "เลือกเหตุผลที่ปิดการขายไม่สำเร็จก่อนบันทึก" : undefined}
              style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
              <Check size={13} /> บันทึกการแก้ไข
            </button>
          );
        })()}
      </div>
    </div>
  );
}

// ─── ADD / EDIT LEAD FORM ─────────────────────────────────────────────────
// ฟอร์มเดียวใช้ได้ทั้งเพิ่ม (initial ว่าง) และแก้ไข (มี initial) — อัปเดต local state ผ่าน onSave
function LeadFormModal({ onClose, onSave, persons, initial }: {
  onClose:()=>void; onSave:(l:LeadRow)=>void; persons:string[]; initial?:LeadRow|null;
}) {
  const isEdit = !!initial;
  // สมุดลูกค้า + ลูกค้าเป้าหมายที่มีอยู่ของสาขา — ใช้เตือนว่าบริษัทนี้มีอยู่แล้ว (ดู dupHint ด้านล่าง)
  const { customers, leads: existingLeads } = useSales();
  const myDealer = useCurrentDealer();
  const myProvinces = useMyProvinces();  // จังหวัดตามภาคของสาขาที่ล็อกอิน
  const [form, setForm] = useState({
    company: initial?.company ?? "", contact: initial?.contact ?? "",
    phone: initial?.phone ?? "", email: initial?.email ?? "",
    province: initial?.province ?? "", address: initial?.address ?? "",
    // เก็บเป็นสตริง ให้ปล่อยว่างได้ (= ยังไม่รู้พื้นที่) — ตอนบันทึกค่อยแปลงเป็นตัวเลข
    area: initial?.area != null ? String(initial.area) : "",
    status: (initial?.status ?? "WAITING") as LeadStatus,
    assigned: initial?.assigned ?? "",  // เริ่มที่ "ยังไม่ระบุ" — ห้ามยัดคนแรกในทะเบียนให้เอง
    source: initial?.source ?? "", note: initial?.note ?? "",
    logo: initial?.logo ?? "",
  });

  // ── เติมค่าตั้งต้นเมื่อข้อมูลมาถึงทีหลัง (บั๊กจริง พบ 10 ส.ค. 69) ──────────────────
  //
  // ทุกช่องเริ่มที่ "ยังไม่ระบุ" — ไม่มีการเดาค่าให้จากรายการอีกต่อไป
  // แต่ทั้งสองอย่างโหลดแบบไม่พร้อมกัน ถ้าผู้ใช้กดเปิดฟอร์มเร็วกว่าข้อมูลมาถึง
  // ค่าจะค้างเป็นว่างถาวร แล้ว useState ก็ไม่อ่านใหม่อีกเลยตลอดอายุฟอร์ม
  //
  // ผลที่ผู้ใช้เจอจริง: บันทึกลูกค้าเป้าหมายโดยเข้าใจว่าเลือกแม่แบบไว้แล้ว (ช่องโชว์ตัวแรกให้)
  // แต่ในระบบว่าง → ออกใบเสนอราคาไม่ได้เลย และย้อนกลับมาดูก็ยังเห็นแม่แบบอยู่ หาสาเหตุไม่เจอ
  //
  // เติมเฉพาะตอน "เพิ่มลูกค้าเป้าหมายใหม่ และช่องยังว่างอยู่" — ห้ามไปทับค่าที่ผู้ใช้เลือกเองหรือค่าของลูกค้าเป้าหมายเดิม
  // ⚠️ เคยมีตัวเติม "แม่แบบตัวแรก / ผู้รับผิดชอบคนแรก" ให้เอง — ถอดออกแล้ว (บอสสั่ง 18 ส.ค. 69)
  //   กติกาเดียวกันกับจังหวัด/แหล่งที่มา/โฟลเดอร์: ช่องที่ผู้ใช้ยังไม่ได้เลือก ต้องขึ้น "ยังไม่ระบุ"
  //   ห้ามยัดตัวแรกในรายการให้ — ไม่งั้นจะได้ข้อมูลที่ไม่มีใครระบุเข้าฐานข้อมูลเงียบ ๆ

  // ⚠️ ปิดฟอร์มทั้งที่ยังมีของที่กรอกค้างไว้ ต้องถามก่อน (แก้ 10 ส.ค. 69)
  //   เดิมกด "ยกเลิก" หรือเผลอคลิกโดนฉากหลัง ป๊อปอัพปิดทันทีโดยไม่ถามอะไรเลย
  //   สิ่งที่พิมพ์ไปหายหมดแบบเงียบ ๆ · หน้าตั้งค่าเตือนถูกอยู่แล้ว ("ยังมีงานที่ยังไม่บันทึก…")
  //   ที่อื่นไม่เตือน = ผู้ใช้เดาไม่ได้ว่าหน้าไหนปลอดภัยที่จะกดปิด
  //
  // ⚠️ ต้องเทียบกับ "ค่าตอนเปิดฟอร์ม" ไม่ใช่กับ initial (แก้ 10 ส.ค. 69 รอบสอง)
  //   ตอนเพิ่มลูกค้าเป้าหมายใหม่ initial เป็น undefined แต่ฟอร์มมีค่าตั้งต้นไม่ว่าง (จังหวัด/แหล่งที่มา/ขั้นตอน/แม่แบบ)
  //   เทียบแบบเดิมจึงถือว่า "แก้แล้ว" ตั้งแต่วินาทีที่เปิด → เด้งถามทุกครั้งแม้ยังไม่ได้พิมพ์อะไร
  //   คำเตือนที่เด้งทุกครั้งจะถูกกดผ่านโดยไม่อ่าน แล้ววันที่กรอกจริงก็จะเสียของ
  async function closeGuarded() {
    const touched = JSON.stringify(form) !== openedSnapshot.current;
    if (touched && !(await ยืนยัน({
      หัวข้อ: "ยังมีข้อมูลที่กรอกไว้แต่ยังไม่ได้บันทึก",
      รายละเอียด: "ปิดแล้วข้อมูลที่กรอกจะหาย",
      ปุ่มตกลง: "ปิดโดยไม่บันทึก", ปุ่มยกเลิก: "กรอกต่อ", อันตราย: true,
    }))) return;
    onClose();
  }

  // สแนปช็อตค่าฟอร์ม ณ วินาทีที่เปิด — ใช้เทียบว่าผู้ใช้แตะอะไรไปจริงหรือยัง
  const openedSnapshot = useRef(JSON.stringify(form));
  useEscapeKey(closeGuarded);   // กด Esc = เหมือนกดยกเลิก (ถามก่อนถ้ากรอกค้างไว้)
  const logoInputRef = useRef<HTMLInputElement>(null);
  // เดิมกด "บันทึก" แล้วขาดชื่อบริษัท/ผู้ติดต่อ = ออกเงียบๆ ไม่มีอะไรบอกผู้ใช้เลยว่าทำไมไม่บันทึก (QA เคส 6)
  const [submitError, setSubmitError] = useState("");
  // กันกดบันทึกซ้ำ (H8 · guard synchronous) — เดิมไม่มี guard เลย: กดรัว ๆ เร็วกว่า React จะ re-render
  // ปุ่ม/unmount โมดัลทัน (onClose() unmount แบบ synchronous หลัง onSave() แต่ React batch การอัปเดต
  // ให้ effect จริงทำงานคนละ tick) → ยิง addLead() ซ้ำหลายครั้งได้จริง สร้างลูกค้าเป้าหมายซ้ำหลายแถว
  // (พบจากทดสอบ Edge Case จริง 3 ส.ค. 69) แพตเทิร์นเดียวกับ apptSavingRef ที่ใช้กันฟอร์มนัดหมายอยู่แล้ว
  const savingRef = useRef(false);
  // เตือนตั้งแต่ตอนพิมพ์ว่าบริษัทนี้มีอยู่แล้ว — กันเปิดลูกค้าเป้าหมายซ้ำแล้วได้ลูกค้าซ้ำตอนปิดการขาย (M3)
  // แค่บอก ไม่ได้ห้าม (บางทีก็อยากเปิดลูกค้าเป้าหมายใหม่จริง ๆ) · ทางที่ถูกคือกด "สร้างดีลใหม่" จากหน้าลูกค้า
  //
  // เช็ค "ลูกค้าเป้าหมายที่มีอยู่" ด้วย ไม่ใช่แค่ลูกค้า: savingRef กันกดรัวได้เฉพาะในแท็บเดียว — เปิดสองแท็บแล้ว
  // กรอกบริษัทเดียวกันทั้งคู่ ต่างคนต่างผ่าน guard ของตัวเอง ได้ลูกค้าเป้าหมายซ้ำ 2 แถวจริง (ยืนยันด้วยการทดสอบ
  // จริง 5 ส.ค. 69: แท็บเดียวกดรัว 5 ครั้ง → 1 แถว · สองแท็บพร้อมกัน → 2 แถว)
  // ไม่ใช้ unique constraint ที่ DB เพราะ "หลายดีลของบริษัทเดียวกัน" เป็นเรื่องปกติของงานขาย
  // การเตือนให้เห็นก่อนกดบันทึกจึงตรงกับปัญหาจริง (กดซ้ำเพราะนึกว่าไม่สำเร็จ) โดยไม่ขวางงานที่ถูกต้อง
  const dupHint = useMemo(() => {
    if (isEdit || !form.company.trim()) return "";
    const { exact, similar } = matchCustomers(customers, form.company, myDealer.code);
    if (exact)        return `"${exact.company}" เป็นลูกค้าอยู่แล้ว — ปิดการขายได้ ระบบจะผูกเข้ากับลูกค้ารายเดิมให้ ไม่สร้างซ้ำ`;
    const dupLead = matchCustomers(existingLeads, form.company, myDealer.code);
    if (dupLead.exact) return `มีลูกค้าเป้าหมายชื่อ "${dupLead.exact.company}" อยู่แล้ว — ถ้าเพิ่งกดบันทึกไปในหน้าอื่น อาจกลายเป็นรายการซ้ำ`;
    if (similar[0])   return `ชื่อใกล้เคียงกับลูกค้าเดิม "${similar[0].company}" — ถ้าเป็นบริษัทเดียวกัน ควรกด "สร้างดีลใหม่" จากหน้าลูกค้าแทน`;
    if (dupLead.similar[0]) return `ชื่อใกล้เคียงกับลูกค้าเป้าหมายที่มีอยู่ "${dupLead.similar[0].company}" — ตรวจก่อนว่าไม่ใช่รายการเดียวกัน`;
    return "";
  }, [isEdit, form.company, customers, existingLeads, myDealer.code]);
  function set(k: keyof typeof form, v: string) { setForm(p=>({...p,[k]:v})); if (submitError) setSubmitError(""); }
  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้หลังถูกปฏิเสธ
    if (!file) return;
    try { set("logo", await fileToResizedDataURL(file, 256)); } // ย่อก่อนเก็บ กัน quota เต็ม
    catch (err) { แจ้งพลาด(err instanceof Error ? err.message : "ใช้ไฟล์นี้เป็นโลโก้ไม่ได้"); }
  }
  function submit() {
    if (savingRef.current) return;
    // ช่องบังคับ (บอสสั่ง 17 ส.ค. 69 เพิ่มโทรศัพท์+จังหวัด) — ดาว * บนป้ายกำกับต้องตรงกับที่ตรวจจริงตรงนี้เสมอ
    //   โทรศัพท์: ไม่มีเบอร์ = ตามงานต่อไม่ได้เลย · จังหวัด: ใช้แบ่งเขต/ทำรายงานรายภาค ถ้าว่างตัวเลขจะเพี้ยน
    const missing = [
      !form.company.trim() && "บริษัท",
      !form.contact.trim() && "ผู้ติดต่อ",
      !form.phone.trim() && "โทรศัพท์",
      !form.province.trim() && "จังหวัด",
    ].filter(Boolean) as string[];
    if (missing.length) {
      setSubmitError(`กรอกให้ครบก่อนบันทึก: ${missing.join(" · ")}`);
      return;
    }
    savingRef.current = true;
    setSubmitError("");
    const base = {
      name: form.company,
      company: form.company, contact: form.contact,
      phone: form.phone, email: form.email,
      province: form.province, address: form.address.trim() || undefined,
      // แม่แบบเอาออกทั้งระบบ (16 ต.ค. 69) — ไม่อ่านช่องแม่แบบ: แก้ของเดิมคงค่าเดิมผ่าน ...initial · ใหม่ใส่ค่าว่างข้างล่าง
      status: form.status, assigned: form.assigned,
      source: form.source, note: form.note,
      logo: form.logo || undefined,
      // เว้นว่าง/ไม่ใช่ตัวเลข = ไม่มีข้อมูลพื้นที่ (undefined) — ห้ามบันทึกเป็น 0 เพราะ 0 แปลว่า "พื้นที่ศูนย์" ซึ่งไม่จริง
      area: form.area.trim() && Number(form.area) > 0 ? Number(form.area) : undefined,
    };
    if (initial) {
      onSave({ ...initial, ...base });
    } else {
      // id/numId ถูกกำหนดจริงในหน้า (handleAddLead) แบบ max+1 กันชนกัน
      // value = ช่องประเมินราคาเดิม (เอาออกจากหน้าเว็บ · ข้อ 5) — ลีดใหม่ว่างเสมอ · แก้ของเดิมคงค่าเดิมผ่าน ...initial
      onSave({ id: "", numId: 0, ...base, value: "", product: "", category: "" });
    }
    onClose();
  }

  const inputStyle: React.CSSProperties = {
    width:"100%", border:"1px solid #e5e7eb", borderRadius:8,
    padding:"8px 11px", fontSize:"0.8rem", outline:"none", color:"#2D2D2D",
  };
  const labelStyle: React.CSSProperties = {
    display:"block", fontSize:"0.65rem", fontWeight:700,
    color:"#374151", marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em",
  };
  const dupHintStyle: React.CSSProperties = {
    marginTop:6, padding:"7px 10px", borderRadius:8, background:"#fff8ed",
    border:"1px solid #fcd9a4", color:"#8a5a10", fontSize:"0.7rem", lineHeight:1.5,
  };

  return (
    <>
      <div onClick={closeGuarded} style={{ position:"fixed", inset:0, background:"rgba(45,45,45,.45)", zIndex:1100 }} />
      <div style={{ position:"fixed", inset:0, zIndex:1110, display:"flex", alignItems:"center", justifyContent:"center", padding:24, pointerEvents:"none" }}>
        {/* ⚠️ ต้องบอกโปรแกรมอ่านหน้าจอว่านี่คือหน้าต่างซ้อน (แก้ 10 ส.ค. 69)
             เดิมเป็น div เปล่า ๆ — ผู้ใช้ที่ใช้โปรแกรมอ่านหน้าจอไม่รู้เลยว่ามีหน้าต่างเปิดอยู่
             ยังคุยกับเนื้อหาข้างหลังต่อเหมือนไม่มีอะไรเกิดขึ้น
             ป๊อปอัพที่ใช้ ModalCard มีของพวกนี้ครบอยู่แล้ว ใบนี้เขียนแยกจึงตกหล่น */}
        <div onClick={e=>e.stopPropagation()}
          role="dialog" aria-modal="true"
          aria-label={isEdit ? "แก้ไขลูกค้าเป้าหมาย" : "เพิ่มลูกค้าเป้าหมาย"}
          style={{ width:"100%", maxWidth:600, background:"#fff", borderRadius:20,
            border:"1px solid #e5e7eb", boxShadow:"0 24px 80px rgba(0,0,0,.2)",
            pointerEvents:"auto", overflow:"hidden" }}>

          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"18px 24px", borderBottom:"1px solid #e5e7eb", background:"#003366" }}>
            {/* ⚠️ ห้ามใส่คำอธิบายกำกับใต้หัวข้อ (บอสสั่ง 28 ส.ค. 69 · แนวเดียวกับที่เอาออกจากการ์ดทุกหน้า)
                 บรรทัดเดิมคือ "กรอกข้อมูลลูกค้าเป้าหมาย" ซึ่งพูดซ้ำกับหัวข้อ แถมเป็นสีเทาบนพื้นน้ำเงินจนอ่านแทบไม่ออก
                 ตอนแก้ไขเคยโชว์เลขที่ลูกค้าเป้าหมายตรงนี้ด้วย — ย้ายไปต่อท้ายหัวข้อแทน ข้อมูลจึงไม่หาย */}
            <div style={{ fontSize:"1rem", fontWeight:800, color:"#fff" }}>
              {isEdit ? `แก้ไขลูกค้าเป้าหมาย${initial?.id ? ` · ${initial.id}` : ""}` : "เพิ่มลูกค้าเป้าหมาย"}
            </div>
            <button onClick={closeGuarded}
              style={{ width:32, height:32, borderRadius:9, border:"1px solid rgba(255,255,255,.2)",
                background:"rgba(255,255,255,.1)", color:"#fff", cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center" }}>
              <X size={15} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding:"24px", overflowY:"auto", maxHeight:"65vh" }}>
            {/* .form-grid / .form-section / .col-full = มาตรฐานกลาง (globals.css) — ห้ามเขียน grid เอง */}
            <div className="form-grid">

              {/* ── ข้อมูลบริษัท ── */}
              <div className="form-section">ข้อมูลบริษัท</div>
              <div className="col-full" style={{ display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:56, height:56, borderRadius:14, flexShrink:0, overflow:"hidden",
                  border:`2px dashed ${form.logo ? "transparent" : "#e5e7eb"}`, background:form.logo ? "#fff" : "#f8fafc",
                  display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {form.logo
                    ? <img src={form.logo} alt="โลโก้" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    : <User size={24} color="#9ca3af" />}
                </div>
                <div style={{ minWidth:0 }}>
                  <label style={labelStyle}>รูป / โลโก้ลูกค้า</label>
                  <input ref={logoInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={uploadLogo} />
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button type="button" onClick={()=>logoInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ color:"#374151" }}>
                      <Paperclip size={13} /> {form.logo ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                    </button>
                    {form.logo && (
                      <button type="button" onClick={()=>set("logo","")} className="btn btn-secondary btn-sm" style={{ color:"#dc2626" }}>
                        <X size={13} /> ลบรูป
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="col-full">
                <label style={labelStyle}>บริษัท *</label>
                <input value={form.company} onChange={e=>set("company",e.target.value)}
                  placeholder="เช่น บริษัท ตัวอย่าง จำกัด" style={inputStyle} autoFocus />
                {dupHint && <div style={dupHintStyle}>{dupHint}</div>}
              </div>
              <div>
                <label style={labelStyle}>จังหวัด *</label>
                <select aria-label="จังหวัด" value={form.province} onChange={e=>set("province",e.target.value)} style={inputStyle}>
                  <option value="">— ยังไม่ระบุ —</option>
                  {myProvinces.map(p=><option key={p}>{p}</option>)}
                  {form.province && !myProvinces.includes(form.province) && <option value={form.province}>{form.province} (นอกภาค)</option>}
                </select>
              </div>
              <div>
                <label style={labelStyle}>แหล่งที่มา</label>
                <select aria-label="แหล่งที่มา" value={form.source} onChange={e=>set("source",e.target.value)} style={inputStyle}>
                  <option value="">— ยังไม่ระบุ —</option>
                  {[...legacySource(form.source), ...SOURCES].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              {/* ที่อยู่ — กรอกตั้งแต่ตอนเป็นลูกค้าเป้าหมาย แล้วส่งต่อเป็นที่อยู่ลูกค้าตอนปิดการขายสำเร็จ
                  เดิมช่องนี้มีเฉพาะฝั่งลูกค้า เซลส์จึงต้องไปตามถามซ้ำหลังปิดการขาย (บอสแจ้ง 19 ส.ค. 69) */}
              <div className="col-full">
                <label style={labelStyle}>ที่อยู่</label>
                <input value={form.address} onChange={e=>set("address",e.target.value)}
                  placeholder="เลขที่ ถนน ตำบล/แขวง อำเภอ/เขต รหัสไปรษณีย์" style={inputStyle} />
              </div>

              {/* ── ผู้ติดต่อ ── */}
              <div className="form-section">ผู้ติดต่อ</div>
              <div>
                <label style={labelStyle}>ผู้ติดต่อ *</label>
                <input value={form.contact} onChange={e=>set("contact",e.target.value)}
                  placeholder="ชื่อผู้ติดต่อ" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>โทรศัพท์ *</label>
                <input inputMode="tel" value={form.phone} onChange={e=>set("phone",formatPhone(e.target.value))}
                  placeholder="0XX-XXX-XXXX" style={inputStyle} />
              </div>
              <div className="col-full">
                <label style={labelStyle}>อีเมล</label>
                <input value={form.email} onChange={e=>set("email",e.target.value)}
                  placeholder="email@company.com" type="email" style={inputStyle} />
              </div>

              {/* ── รายละเอียดงาน ── */}
              <div className="form-section">รายละเอียดงาน</div>
              <div>
                <label style={labelStyle}>พื้นที่ (ตร.ม.)</label>
                <input type="number" min={0} value={form.area} onChange={e=>set("area",e.target.value)}
                  placeholder="เช่น 1200" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>ขั้นตอน</label>
                {/* เลือกได้เฉพาะขั้นก่อน "เสนอราคา" — ขั้นเสนอราคาขึ้นไปเลื่อนอัตโนมัติเมื่อมีใบเสนอราคา
                    aria-label: ชื่อเดียวกับ label — กันสับสนกับ dropdown "ทุกสถานะ" บนแถบเครื่องมือที่มีครบทุกขั้น */}
                {/* ต้องมีค่าเสมอ — งานขายต้องเริ่มที่ขั้นใดขั้นหนึ่งเสมอ */}
                {/* "รอราคา HQ" ฐานข้อมูลขยับให้เองตามคำขอราคา (FLOW.html) — ระหว่างรอ เปลี่ยนขั้นเองไม่ได้ ยกเลิกคำขอได้ที่แท็บใบเสนอราคา */}
                <select aria-label="ขั้นตอน" value={form.status} onChange={e=>set("status",e.target.value as LeadStatus)} style={inputStyle} disabled={!LEAD_STATUS_META[form.status].manual}>
                  {(!LEAD_STATUS_META[form.status].manual ? ([form.status] as LeadStatus[]) : isEdit ? MANUAL_LEAD_STATUSES : (["WAITING","BULLET"] as LeadStatus[])).map(s=><option key={s} value={s}>{leadStatusLabel[s]}</option>)}
                </select>
              </div>

              {/* ── การดูแล ── */}
              <div className="form-section">การดูแล</div>
              <div className="col-full">
                <label style={labelStyle}>ผู้รับผิดชอบ</label>
                <PersonPicker value={form.assigned} onChange={v=>set("assigned",v)} multiple />
              </div>
              <div className="col-full">
                <label style={labelStyle}>หมายเหตุ</label>
                <textarea value={form.note} onChange={e=>set("note",e.target.value)}
                  rows={3} placeholder="รายละเอียดเพิ่มเติม..."
                  style={{ ...inputStyle, resize:"vertical", fontFamily:"inherit", lineHeight:1.6 }} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding:"16px 24px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8, justifyContent:"flex-end", alignItems:"center", background:"#fafafa" }}>
            {submitError && (
              <div style={{ marginRight:"auto", color:"#dc2626", fontSize:"0.75rem", fontWeight:600 }}>{submitError}</div>
            )}
            <button onClick={closeGuarded}
              style={{ padding:"9px 20px", borderRadius:9, border:"1px solid #e5e7eb",
                background:"#fff", color:"#374151", fontSize:"0.8rem", fontWeight:600, cursor:"pointer" }}>
              ยกเลิก
            </button>
            <button onClick={submit}
              style={{ padding:"9px 22px", borderRadius:9, border:"none",
                background:"#003366", color:"#fff", fontSize:"0.8rem", fontWeight:700,
                cursor:"pointer", boxShadow:"0 4px 12px rgba(0,0,0,.3)" }}>
              บันทึก
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── รายงานการติดตาม (Lead Report) — textarea แก้ไข/เพิ่ม/ลบ/ขึ้นบรรทัด/bullet ได้ทั้งหมด ──

// ─── MAIN PAGE ────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const router = useRouter();
  const { session } = useRole(); // ผู้ดำเนินการ (บันทึกลง task ที่เช็ก)
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน (multi-tenant) — scope ข้อมูล/กฎด้วย code นี้
  const { followUpAlertDays } = useLeadRules(currentDealer.code); // กฎของสาขานี้ — ตั้งเองที่ ตั้งค่า › การแจ้งเตือน
  const lostReasons = useLostReasons(); // เหตุผลปิดไม่สำเร็จที่ HQ กำหนด (ผ่าน repo)
  const taskTpl = useLeadTaskTemplate(); // งานมาตรฐานรายขั้นที่ HQ ตั้ง (ผ่าน repo — ไม่ใช่ค่าคงที่ในโค้ด)
  const fileInputRef = useRef<HTMLInputElement>(null);

  // List state
  const {
    leads: allLeads, addLead, บันทึกลีด, deleteLead: removeLead, updateLeadStatus, newLeadNumId, syncLeadFromServer,
    appointments, addAppointment, newAppointmentId, quotations, quotationsReady, ensureQuotations,
  } = useSales();
  // ปิดการขายสำเร็จ = เป็น "ลูกค้า" แล้ว → ไม่แสดงในหน้าลูกค้าเป้าหมาย (ไปอยู่ที่ /customers)
  // สมุดงานของ "ดีลเลอร์ที่ล็อกอิน" เท่านั้น — กรองด้วย dealerCode
  // จำเป็นตั้งแต่มีลูกค้าเป้าหมายของสาขาอื่นในระบบ (ก่อนหน้านี้มีสาขาเดียวเลยไม่กรองก็ไม่มีใครเห็นความต่าง)
  // ลูกค้าเป้าหมายที่ดีลเลอร์สร้างเองไม่มี dealerCode → ถือเป็นของสาขาตัวเอง
  // สมุดงานของสาขาตัวเอง "ทุกสถานะ" (รวมที่ปิดการขายสำเร็จแล้ว) — ใช้คิดอัตราปิดการขาย
  // ป้าย "ได้ราคาแล้ว" แบบเดิม (ลีดค้างรอราคา HQ + ถามฐานว่าได้ใบแล้วหรือยัง) เอาออก — สถานะจริง "ได้ราคา HQ" อยู่ในฐานแล้ว (ใบ 0219)
  // ลบลีดได้เฉพาะลีดที่ยังไม่มีคำขอราคาหรือใบเสนอราคาผูกอยู่ — มีแล้วใช้ "เสียโอกาส" แทน (บอสตัดสิน 19 ต.ค. 69 · ใบ 0217 กันที่ฐาน)
  //   รอราคา HQ / ได้ราคาแล้ว = มีคำขอ · ปิดการขายสำเร็จ = มีใบ · คำขอที่ถูกยกเลิกไปแล้วหน้าจอไม่เห็น — ฐานปฏิเสธพร้อมข้อความบอกทาง
  //   สถานะที่ฐานขยับเอง (รอราคา HQ · ได้ราคา HQ) = มีคำขอแล้ว · ปิดการขายสำเร็จ = มีใบแล้ว
  const ลบได้ = (l: LeadRow) => LEAD_STATUS_META[l.status].manual && l.status !== "PAID" && !quotations.some(q => quoteBelongsToLead(q, l));
  const myAllLeads = useMemo(
    () => allLeads.filter(l => (l.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code),
    [allLeads, currentDealer.code],
  );
  const leadsData = useMemo(() => myAllLeads.filter(l => l.status !== "PAID"), [myAllLeads]);

  // sync งาน/สถานะที่ระบบติ๊กอัตโนมัติ (เช่น สร้าง/ส่งใบเสนอราคา) เข้าโมดัลที่เปิดอยู่
  // — อัปเดตเฉพาะ tasks/status ไม่ทับฟิลด์ที่ผู้ใช้กำลังแก้ใน draft
  useEffect(() => {
    if (!selectedLead) return;
    const fresh = allLeads.find(l => l.id === selectedLead.id);
    if (!fresh) return;
    // ไทม์ไลน์/เหตุผลปิด: ฐานจดเอง (ใบ 0211) — ค่าที่ฐานคืนมาหลังบันทึกต้องขึ้นในแผงด้วย
    const กิจกรรมใหม่ = fresh.activities !== undefined && fresh.activities !== selectedLead.activities;
    if (fresh.tasks !== selectedLead.tasks || fresh.status !== selectedLead.status || กิจกรรมใหม่ || fresh.lostReason !== selectedLead.lostReason) {
      const ซิงก์ = (prev: LeadRow | null) => prev ? { ...prev, tasks: fresh.tasks, status: fresh.status, lostReason: fresh.lostReason,
        ...(กิจกรรมใหม่ ? { activities: fresh.activities } : {}) } : prev;
      setSelectedLead(ซิงก์);
      setDraft(ซิงก์);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeads]);

  // บันทึกลูกค้าเป้าหมาย + sync snapshot ในโมดัลทันที (กันปัญหา "เช็ก task แล้วไม่ติ๊ก" เพราะ c เป็นค่าเก่า)
  // บันทึกผ่านตัวกลาง — ส่งเฉพาะเจตนา/ส่วนต่าง ไม่ส่งลูกค้าเป้าหมายทั้งก้อน (ก่อนขึ้นระบบจริง ข้อ 14)
  //   แผงนี้ถือรายงาน/ไทม์ไลน์ที่เติมเองตอนเปิด (รายการไม่ดึงมา) — รวมกลับ ไม่ให้หายจากจอระหว่างรอฐาน
  function saveLead(intent: LeadIntent) {
    if (!selectedLead) return;
    const prevStatus = selectedLead.status;
    const ได้ = บันทึกลีด(selectedLead.id, intent);
    if (!ได้) return;
    const l: LeadRow = { ...selectedLead, ...ได้, report: ได้.report ?? selectedLead.report, activities: ได้.activities ?? selectedLead.activities };
    setSelectedLead(l); setDraft(l);
    // เช็กงานแล้วสถานะเลื่อนอัตโนมัติ → แจ้ง toast ให้เห็นชัด (ป้ายหัวโมดัล/ตาราง/บอร์ด/funnel เปลี่ยนตามทันที)
    if (prevStatus && l.status !== prevStatus) {
      setToast(l.status === "PAID"
        ? "ปิดการขายสำเร็จ — สร้างลูกค้าให้อัตโนมัติแล้ว"
        : l.status === "CANCELLED"
        ? "บันทึกปิดการขายไม่สำเร็จแล้ว"
        : `เลื่อนสถานะอัตโนมัติ → ${leadStatusLabel[l.status]}`);
    }
  }
  // Global filter: ผู้รับผิดชอบ + ช่วงเวลา (วันเดือนปีจากตัวกรองกลาง — กรองจากวันที่กิจกรรมล่าสุดของลูกค้าเป้าหมาย)
  const { person, timeRange } = useFilters();
  // Table toolbar: density + column show/hide (localStorage-backed)
  const { density, setDensity, hiddenCols, toggleCol } = useTableLayout("leads");
  const [view, setView] = useState<"list"|"kanban">("list"); // ค่าเริ่มต้น = ตาราง (สลับไปบอร์ดได้ที่ปุ่มมุมขวา)
  const [dragId, setDragId] = useState<string|null>(null); // การ์ดที่กำลังลากในมุมมอง Kanban
  // ลูกค้าเป้าหมายที่กำลังจะปิดการขายไม่สำเร็จ (จากตาราง/Kanban) — รอเลือกเหตุผลก่อนค่อยเปลี่ยนสถานะจริง
  // (พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69: เดิมสองช่องทางนี้ปิดได้โดยไม่ต้องกรอกเหตุผลเลย
  //  ต่างจากปุ่ม "ปิดการขายไม่สำเร็จ" ในแผงลูกค้าเป้าหมายที่บังคับอยู่แล้ว — ทำให้ตรงกันทุกช่องทาง)
  const [pendingLostId, setPendingLostId] = useState<string|null>(null);
  const [pendingLostReason, setPendingLostReason] = useState("");
  /** พาไปแท็บ "งาน" ของลูกค้าเป้าหมายรายนี้ — ใช้ตอนบล็อกการย้ายขั้นเพราะงานยังไม่ครบ */
  function openLeadTasks(l: LeadRow) {
    setSelectedLead(l); setDraft({ ...l });
    setEditingField(null); setShowDeleteConfirm(false);
    setPopupField(null); setEditPopupPos(null); setShowStatusDropdown(false);
    setActiveTab("tasks"); setDTab("tasks");
  }

  /** ── พาไป "ลงมือทำงานนั้น" จริง ๆ ไม่ใช่แค่บอกว่าเหลืองานอะไร (บอสสั่ง 21 ส.ค. 69) ──
   *
   *  ลากการ์ดข้ามขั้นแล้วโดนบล็อก ผู้ใช้ต้องได้ไปอยู่หน้าที่ "ทำงานนั้นได้ทันที"
   *  งานที่ต้องมีของจริงจึงพาไปที่ฟอร์มของจริง (ลงนัด/ออกใบ/กดส่งใบ)
   *  งานอื่นที่ติ๊กได้เอง พาไปแท็บงาน แล้วผู้ใช้ติ๊กต่อได้ทีละงานตามลำดับ
   */
  function พาไปทำงาน(l: LeadRow, taskKey: string) {
    const ของลูกค้าเป้าหมาย = quotations.filter(q => quoteBelongsToLead(q, l));
    if (taskKey === findAppointmentTask(taskTpl)?.key) {
      const มีนัดแล้ว = appointments.some(a => a.leadId === l.numId && a.status !== "cancelled");
      if (!มีนัดแล้ว) {
        setSelectedLead(l); setDraft({ ...l });
        setActiveTab("appts"); setDTab("timeline"); setApptAdding(true);
        return;
      }
    }
    if (taskKey === QUOTE_TASK_KEY && !ของลูกค้าเป้าหมาย.length) { openQuotationForm(l); return; }
    if (taskKey === SEND_QUOTE_TASK_KEY) {
      if (!ของลูกค้าเป้าหมาย.length) { openQuotationForm(l); return; }
      if (ของลูกค้าเป้าหมาย.every(q => q.status === "draft")) { openQuotationList(l); return; }
    }
    openLeadTasks(l);
  }

  async function requestStatusChange(id: string, status: LeadStatus) {
    // ปิดการขายสำเร็จแล้ว ดีลเลอร์ย้อนเองไม่ได้ — HQ ย้อนการตอบรับได้คนเดียว (บอสตัดสิน 19 ต.ค. 69 · ใบ 0217 กันที่ฐานด้วย)
    if (allLeads.find(l => l.id === id)?.status === "PAID") { setToast("ปิดการขายสำเร็จแล้ว — ย้อนได้เฉพาะสำนักงานใหญ่"); return; }
    // สถานะที่ฐานขยับเอง (ใบ 0219): รอราคา HQ เปลี่ยนเองไม่ได้ · ได้ราคา HQ ออกเองได้แค่ปิดไม่สำเร็จ (ลากการ์ดบนบอร์ดก็เช่นกัน)
    const ตอนนี้ = allLeads.find(l => l.id === id)?.status;
    if (ตอนนี้ === "HQ_PRICING") { setToast("รอราคาจากสำนักงานใหญ่ — เปลี่ยนขั้นเองไม่ได้ระหว่างรอ"); return; }
    if (ตอนนี้ === "HQ_QUOTED" && status !== "CANCELLED") { setToast("ได้ราคาจาก HQ แล้ว — ขั้นต่อไปคือทำใบและส่งให้ลูกค้า"); return; }
    if (status === "CANCELLED") { setPendingLostId(id); setPendingLostReason(""); return; }

    // ── ย้ายขั้นบนกระดาน: ข้ามงานไม่ได้ · ถอยหลังต้องยืนยัน (บอสสั่ง 21 ส.ค. 69) ────────
    //
    // ทำไมต้องกั้น: ลากการ์ดข้ามไปขั้นท้าย ๆ ได้เลย = ขั้นของดีลบอกว่าทำงานถึงตรงนั้นแล้ว
    //   ทั้งที่งานจริง (นัดหมาย/สรุปความต้องการ/ออกใบ) ยังไม่ได้ทำ — รายงานของสำนักงานใหญ่
    //   จะอ่านว่า "ดีลนี้ถึงขั้นเจรจาแล้ว" ทั้งที่ยังไม่เคยคุยราคากับลูกค้าเลยสักครั้ง
    // วิธีกั้น: ต้องติ๊กงานของขั้นก่อนหน้าให้ครบก่อน — พาไปทำทีละงานตามลำดับที่สำนักงานใหญ่ตั้งไว้
    const เป้าหมาย = allLeads.find(l => l.id === id);
    if (เป้าหมาย && status !== "PAID") {
      const ลำดับ = (st: LeadStatus) => LEAD_STATUS_ORDER.indexOf(st);
      const ขั้นเดิม = ลำดับ(เป้าหมาย.status), ขั้นใหม่ = ลำดับ(status);

      // ถอยกลับ = ต้องยืนยันเสมอ (ความคืบหน้าที่บันทึกไว้จะดูขัดกับขั้นที่ถอยไป)
      if (ขั้นใหม่ < ขั้นเดิม && เป้าหมาย.status !== "CANCELLED") {
        const ตกลง = await ยืนยัน({
          หัวข้อ: `ย้อนขั้นของ "${เป้าหมาย.company || เป้าหมาย.name}" ?`,
          รายละเอียด: `จาก "${leadStatusLabel[เป้าหมาย.status]}" กลับไป "${leadStatusLabel[status]}"\n`
            + "งานที่ติ๊กไว้แล้วจะไม่ถูกล้าง — ขั้นกับงานจะไม่ตรงกันชั่วคราว",
          ปุ่มตกลง: "ย้อนขั้น",
        });
        if (!ตกลง) return;
      }

      // เดินหน้า = งานของทุกขั้นก่อนหน้าต้องครบ (ไม่รวมงานปิดการขาย ซึ่งเป็นงานของขั้นสุดท้าย)
      if (ขั้นใหม่ > ขั้นเดิม) {
        const ทำแล้ว = new Set((เป้าหมาย.tasks ?? []).filter(t => t.done).map(t => t.key));
        const ค้าง = taskTpl.filter(t =>
          t.key !== CLOSE_TASK_KEY && ลำดับ(t.stage) < ขั้นใหม่ && !ทำแล้ว.has(t.key));
        if (ค้าง.length) {
          // พาไปลงมือทำงานที่ค้างอยู่ "งานแรก" ทันที — ทำเสร็จแล้วค่อยลากใหม่ ระบบจะไล่งานถัดไปให้เอง
          พาไปทำงาน(เป้าหมาย, ค้าง[0].key);
          setToast(ค้าง.length === 1
            ? `ย้ายขั้นไม่ได้ — เหลืองาน "${ค้าง[0].label}" อีก 1 งาน · พามาทำให้แล้ว`
            : `ย้ายขั้นไม่ได้ — เหลืออีก ${ค้าง.length} งาน · เริ่มที่ "${ค้าง[0].label}"`);
          return;
        }
      }
    }
    // ── ขั้น "เสนอราคา" ต้องมีใบเสนอราคาจริง (บอสสั่ง 14 ส.ค. 69) ──
    // ลาก/เลือกสถานะไปขั้นนี้ทั้งที่ยังไม่เคยออกใบ = ขั้นขยับแต่ไม่มีเอกสารถึงลูกค้า
    // → พาไปออกใบแทน · พอบันทึกใบเสร็จ ระบบติ๊กงาน "จัดทำใบเสนอราคา" แล้วเลื่อนขั้นให้เอง
    // ⚠️ "ยังโหลดใบไม่เสร็จ" ไม่เท่ากับ "ไม่มีใบ" — ตัดสินตอนนี้คือกล่าวหาผิด แล้วผู้ใช้กดไม่ติดโดยไม่รู้สาเหตุ
    //    (เจอจริง 27 ส.ค. 69 บนโหมดเดียวกับเว็บจริง: ใบเสนอราคาเดินทางมาถึงช้ากว่าลูกค้าเป้าหมายเสมอ
    //     กดปิดการขายในจังหวะนั้นแล้วระบบตอบว่า "ต้องออกใบก่อน" ทั้งที่ใบมีอยู่จริง แล้วเงียบไปเฉย ๆ)
    //    จึงรอให้ใบมาถึงก่อนแล้วค่อยตัดสิน — ไม่ใช่ไล่ให้ผู้ใช้กดใหม่
    const ใบทั้งหมด = await ensureQuotations();
    if (status === "QUOTED") {
      const target = allLeads.find(l => l.id === id);
      if (target && !ใบทั้งหมด.some(q => quoteBelongsToLead(q, target))) {
        openQuotationForm(target);
        setToast("ขั้นเสนอราคาต้องมีใบเสนอราคา — ออกใบให้ลูกค้าก่อน แล้วขั้นจะเลื่อนให้เอง");
        return;
      }
    }
    // ปิดการขายสำเร็จ = สร้างลูกค้าอัตโนมัติทันที ย้อนกลับไม่ได้ — ต้องยืนยันก่อนเสมอ (ทุกช่องทาง
    // ไม่ใช่แค่ปุ่มลัดในแผงลูกค้าเป้าหมาย) ยืนยันจาก scenario test 31 ก.ค. 69: เดิมกดครั้งเดียวสร้างลูกค้าทันที
    if (status === "PAID") {
      const target = allLeads.find(l => l.id === id);
      if (!target) return;
      // ด่านเดียวกับปุ่ม "ได้งาน" ในแท็บงาน — ปิดการขายสำเร็จต้องมีใบที่ส่งถึงลูกค้าแล้ว
      //   ปิดได้โดยไม่มีใบ = ได้ลูกค้ายอดสะสม ฿0 ปนในฐาน ยอดขาย/อัตราปิดการขายเพี้ยน (พบจากทดสอบหาบั๊ก 19 ส.ค. 69)
      const ของลูกค้าเป้าหมาย = ใบทั้งหมด.filter(q => quoteBelongsToLead(q, target));
      if (!ของลูกค้าเป้าหมาย.length) {
        openQuotationForm(target);
        setToast("ปิดการขายสำเร็จต้องมีใบเสนอราคา — ออกใบแล้วส่งให้ลูกค้าก่อน");
        return;
      }
      if (ของลูกค้าเป้าหมาย.every(q => q.status === "draft")) {
        openQuotationList(target);
        setToast("ใบเสนอราคายังเป็นร่าง — กดส่งให้ลูกค้าก่อน จึงจะปิดการขายสำเร็จได้");
        return;
      }
      if (!(await ยืนยัน({
        หัวข้อ: `ปิดการขายสำเร็จสำหรับ "${target.company || target.name}" ?`,
        รายละเอียด: "ระบบจะสร้างลูกค้าใหม่ให้อัตโนมัติทันที — ย้อนกลับไม่ได้",
        ปุ่มตกลง: "ปิดการขายสำเร็จ", อันตราย: true,
      }))) return;
      updateLeadStatus(id, status);
      setToast("ปิดการขายสำเร็จ — ระบบสร้างลูกค้าให้อัตโนมัติ");
      setJustWonCompany(target.company || target.name);
      return;
    }
    updateLeadStatus(id, status);
  }
  function confirmPendingLost() {
    const reason = pendingLostReason.trim();
    if (!pendingLostId || !reason || reason === OTHER_LOST_REASON) return;
    const target = allLeads.find(l => l.id === pendingLostId);
    if (!target) { setPendingLostId(null); return; }
    บันทึกลีด(target.id, { stage: { status: "CANCELLED", lostReason: reason } });
    setPendingLostId(null); setPendingLostReason("");
  }
  const [dragOver, setDragOver] = useState<LeadStatus|null>(null); // คอลัมน์ที่กำลังลากค้างอยู่ (ไฮไลต์)

  // ── ลากการ์ดไปชิดขอบ = กระดานเลื่อนตามให้เอง (บอสสั่ง 20 ส.ค. 69) ─────────────
  //
  // คอลัมน์รวมกันกว้างเกินจอ ต้องเลื่อนแนวนอนถึงจะเห็นคอลัมน์ท้าย ๆ
  // แต่ระหว่างลากการ์ดอยู่ ผู้ใช้ปล่อยเมาส์ไปเลื่อนแถบเลื่อนไม่ได้ (ปล่อย = วางการ์ด)
  // จึงย้ายการ์ดข้ามไปคอลัมน์ที่มองไม่เห็นไม่ได้เลย — ต้องให้กระดานเลื่อนเองเมื่อลากไปชิดขอบ
  //
  // ใช้ตัวจับเวลาแทนการเลื่อนใน onDragOver ตรง ๆ เพราะ onDragOver จะหยุดยิงเมื่อเมาส์หยุดนิ่ง
  // (ผู้ใช้ที่ค้างเมาส์ไว้ที่ขอบจะเห็นกระดานหยุดเลื่อนทั้งที่ยังลากอยู่)
  const กระดานRef = useRef<HTMLDivElement>(null);
  // ── ความสูงกระดาน: ยืดลงไปจนสุดขอบล่างจอ (บอสสั่ง 20 ส.ค. 69) ─────────────────
  //
  // เดิมตรึงไว้ว่า calc(100vh - 330px) ซึ่งเป็นการ "เดา" ว่าของเหนือกระดานสูงเท่าไร
  //   จอ/ความสูงของแถบตัวกรองเปลี่ยนเมื่อไร ตัวเลขนั้นก็ผิดทันที — เหลือที่ว่างขาวใต้กระดาน
  //   คอลัมน์เลยดูสั้นกึด และช่องวางการ์ดก็สั้นตามไปด้วย
  // ตอนนี้วัดจากตำแหน่งจริงของกระดานบนจอ แล้วยืดลงไปจนเกือบสุด (เว้นที่ให้แถบเลื่อน)
  const [ความสูงกระดาน, setความสูงกระดาน] = useState<number | null>(null);
  useEffect(() => {
    const วัด = () => {
      const el = กระดานRef.current;
      if (!el) return;
      const บนสุด = el.getBoundingClientRect().top;
      setความสูงกระดาน(Math.max(360, Math.round(window.innerHeight - บนสุด - 18)));
    };
    วัด();
    window.addEventListener("resize", วัด);
    // ของเหนือกระดาน (การ์ดตัวเลข/แถบตัวกรอง) สูงเปลี่ยนได้เอง เช่น ตอนตัวกรองขึ้นบรรทัดที่สอง
    const ro = new ResizeObserver(วัด);
    if (กระดานRef.current?.parentElement) ro.observe(กระดานRef.current.parentElement);
    return () => { window.removeEventListener("resize", วัด); ro.disconnect(); };
  }, [view]);
  const ทิศเลื่อนRef = useRef(0);
  const ตัวเลื่อนRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const หยุดเลื่อนกระดาน = useCallback(() => {
    ทิศเลื่อนRef.current = 0;
    if (ตัวเลื่อนRef.current) { clearInterval(ตัวเลื่อนRef.current); ตัวเลื่อนRef.current = null; }
  }, []);
  const เลื่อนกระดานตามเมาส์ = useCallback((clientX: number) => {
    const el = กระดานRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ระยะขอบ = 100;   // เข้าใกล้ขอบเท่านี้ถึงเริ่มเลื่อน — แคบกว่านี้จะเล็งยาก
    const ทิศ = clientX > r.right - ระยะขอบ ? 1 : clientX < r.left + ระยะขอบ ? -1 : 0;
    ทิศเลื่อนRef.current = ทิศ;
    if (ทิศ === 0) { หยุดเลื่อนกระดาน(); return; }
    if (!ตัวเลื่อนRef.current) {
      ตัวเลื่อนRef.current = setInterval(() => {
        const box = กระดานRef.current;
        if (!box || ทิศเลื่อนRef.current === 0) return;
        box.scrollLeft += ทิศเลื่อนRef.current * 18;
      }, 16);
    }
  }, [หยุดเลื่อนกระดาน]);
  // ── ต้องดักที่ทั้งหน้า ไม่ใช่แค่บนกระดาน (บอสแจ้ง 20 ส.ค. 69: "ขยับออกมันไม่เลื่อนตาม") ──
  //
  // เดิมดัก dragover ไว้ที่กล่องกระดานอย่างเดียว ซึ่งพังในกรณีที่ผู้ใช้ทำจริงที่สุด:
  //   ลากการ์ดออกไปทางซ้าย/ขวาจนพ้นกระดาน (ไปทับแถบเมนูข้าง หรือขอบจอ)
  //   → เบราว์เซอร์ยิง dragover ให้เฉพาะสิ่งที่อยู่ใต้เมาส์ กระดานจึงไม่ได้ยินอะไรเลย
  //   ซ้ำร้าย onDragLeave ยังสั่งหยุดเลื่อนทันทีที่เมาส์พ้นขอบ — ตรงข้ามกับที่ควรเป็น
  // ตอนนี้ฟังที่ document ตลอดช่วงที่ยังลากอยู่ และถ้าเมาส์เลยขอบกระดานออกไปแล้ว
  //   ให้ถือว่า "เลื่อนเต็มที่" ไปทางนั้น ไม่ใช่หยุด
  //
  // ไม่ผูกกับสถานะ "กำลังลาก" ของหน้าจอ: dragover เกิดได้เฉพาะตอนมีการลากอยู่จริงอยู่แล้ว
  //   ผูกเพิ่มมีแต่จะพลาดกรณีขอบ ๆ (เช่นลากจากที่อื่นเข้ามา)
  useEffect(() => {
    const ขยับ = (e: DragEvent) => เลื่อนกระดานตามเมาส์(e.clientX);
    document.addEventListener("dragover", ขยับ);
    document.addEventListener("dragend", หยุดเลื่อนกระดาน);
    document.addEventListener("drop", หยุดเลื่อนกระดาน);
    return () => {
      document.removeEventListener("dragover", ขยับ);
      document.removeEventListener("dragend", หยุดเลื่อนกระดาน);
      document.removeEventListener("drop", หยุดเลื่อนกระดาน);
      หยุดเลื่อนกระดาน();
    };
  }, [เลื่อนกระดานตามเมาส์, หยุดเลื่อนกระดาน]);
  // ลากค้างไว้แล้วออกจากหน้า/ปล่อยนอกกระดาน — ต้องหยุดเลื่อนเสมอ ไม่งั้นกระดานไหลต่อเอง
  useEffect(() => () => หยุดเลื่อนกระดาน(), [หยุดเลื่อนกระดาน]);
  const [hideEmpty, setHideEmpty] = useState(false); // ซ่อนคอลัมน์ที่ไม่มีการ์ด
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<LeadStatus|"ALL">("ALL");
  // ค่าเริ่มต้น = ไม่เลือกคอลัมน์ → ลูกค้าเป้าหมายที่เพิ่มล่าสุดขึ้นก่อน (numId มากสุด) · บอสสั่ง 21 ก.ย. 69 ทุกตาราง
  const [sortKey, setSortKey] = useState<SortKey|null>(null);
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");
  const [followUpDays, setFollowUpDays] = useState(0); // Smart filter: 0=off · 7/14/30 = ขาดติดต่อเกินกี่วัน
  // quick filter chips ถูกลบตามที่บอสสั่ง — state นี้ไม่มีใครตั้งค่าได้แล้ว จึงลบทิ้ง
  const [dTab, setDTab] = useState<"overview"|"tasks"|"quotation"|"timeline">("overview"); // แท็บใน drawer รายละเอียด
  const [showAddForm, setShowAddForm] = useState(false);

  // List pagination (LIST view only)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Advanced filters
  const [fAssignee, setFAssignee] = useState("");
  const [fValueMin, setFValueMin] = useState("");
  const [fValueMax, setFValueMax] = useState("");
  const [fProvince, setFProvince] = useState("");
  const [fSource, setFSource] = useState("");
  // ฟีเจอร์ "ความสำคัญ" ถูกลบออกทั้งหมด (ตัวกรอง · ป้าย · การเรียง) — บอสสั่ง 18 ส.ค. 69

  // Panel state
  const [selectedLead, setSelectedLead] = useState<LeadRow|null>(null);
  // (โหมดแก้ไข/อ่านถูกถอดแล้ว — OverviewEditor reseed เองเมื่อสลับลูกค้าเป้าหมายผ่าน useEffect ของมัน)
  const [activeTab, setActiveTab] = useState<"overview"|"tasks"|"report"|"activities"|"appts"|"quotation"|"files">("overview");
  const [editingField, setEditingField] = useState<string|null>(null);
  // Lead Detail (split layout) — refs สำหรับ quick action เลื่อนไปการ์ด + ปิดการขายไม่สำเร็จ (เลือกเหตุผล)
  const journeyRef = useRef<HTMLDivElement>(null);
  const rightQuoteRef = useRef<HTMLDivElement>(null);
  const rightApptRef = useRef<HTMLDivElement>(null);
  // ฟอร์มนัดหมายในแท็บนัดหมายของลูกค้าเป้าหมาย (นัดก่อนปิดการขาย)
  const [apptAdding, setApptAdding] = useState(false);
  // ⚠️ ประเภทนัดเริ่มที่ "ยังไม่ระบุ" ("") — ห้ามยัด "เข้าพบลูกค้า" ให้เอง (บอสสั่ง 25 ส.ค. 69)
  //    ฟอร์มนัดหมายที่หน้าปฏิทินทำแบบนี้อยู่แล้ว สองที่ต้องเหมือนกัน
  const [apptForm, setApptForm] = useState<{ type: ApptType | ""; date: string; time: string; title: string; note: string }>({ type: "", date: APP_NOW_ISO, time: "10:00", title: "", note: "" });
  const apptSavingRef = useRef(false); // กันกดบันทึกนัดซ้ำระหว่างรอเลขนัดจาก DB (H8 · guard synchronous)
  const [apptSaving, setApptSaving] = useState(false); // ไว้ disable ปุ่ม (visual)
  const [apptErr, setApptErr] = useState("");  // ฟ้องเมื่อยังไม่เลือกประเภทนัด — ห้ามกดแล้วเงียบ
  const [draft, setDraft] = useState<LeadRow|null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // โมดัลรายละเอียด: ล็อกสกรอลล์พื้นหลังเท่านั้น — การปิดด้วย Esc จัดการโดย effect ปิดทีละชั้นด้านล่าง
  useEffect(() => {
    if (!selectedLead) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [selectedLead]);

  // Files — คลังไฟล์รวม (แหล่งเดียว) กรองเฉพาะของลูกค้าเป้าหมายนี้
  const [dealerFiles, setDealerFiles] = useState<DealerFile[]>([]);
  const [previewFile, setPreviewFile] = useState<DealerFile | null>(null);
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

  // Persons registry — พนักงานขายของสาขานี้ ผ่าน repository (local: localStorage · supabase: DB)
  // ยังไม่มีพนักงานในทะเบียน = รายการว่าง (ไปเพิ่มที่ ตั้งค่า › ผู้รับผิดชอบ)
  // ห้ามใส่ค่าตั้งต้นปลอม และห้ามใช้ `if (names.length)` — ทะเบียนว่างต้องแปลว่าว่างจริง
  const [personsList, setPersonsList] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    personsRepo.list({ dealerCode: currentDealer.code, isHQ: false })
      .then(arr => { if (alive) setPersonsList(arr.filter(p => p.active).map(p => p.name)); })
      .catch(e => logRepoRead("persons.list", e));
    return () => { alive = false; };
  }, [currentDealer.code]);

  // Inline status dropdown (table view)
  // เมนูเลือกขั้น — ต้องเก็บพิกัดปุ่มด้วย เพราะเมนูวางแบบ "ลอย" (fixed) ให้พ้นกล่องตาราง
  const [statusMenu, setStatusMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  // ช่อง "มูลค่า" ในตารางแก้เองไม่ได้แล้ว — มาจากใบเสนอราคาล่าสุด (บอสตัดสิน 20 ต.ค. 69 · ข้อ 5)

  // success toast
  const [toast, setToast] = useState<string|null>(null);
  // ลูกค้าใหม่ที่เพิ่งปิดการขาย (ชื่อบริษัท) — โชว์ปุ่มลัดพาไปหน้าลูกค้าพร้อมค้นหาให้เลย
  // (เดิมลูกค้าใหม่หายไปอยู่หน้าไหนก็ไม่รู้ในรายการที่แบ่งหน้า ต้องค้นหาเองเสมอ — /scenario 31 ก.ค. 69)
  const [justWonCompany, setJustWonCompany] = useState<string|null>(null);
  useEffect(() => {
    if (!toast) return;
    // ถ้ามีปุ่ม "ดูลูกค้าใหม่" ให้เวลานานกว่าปกติ (มี action ให้กด ไม่ใช่แค่แจ้งเฉยๆ)
    const t = setTimeout(() => { setToast(null); setJustWonCompany(null); }, justWonCompany ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [toast, justWonCompany]);


  // ─── Derived ──────────────────────────────────────────────────────────
  // ── ตัวกรองพื้นฐานของหน้านี้ — ใช้ร่วมกันทั้งตารางและการ์ด KPI (บอสสั่ง 20 ส.ค. 69) ──
  //
  // "ให้พวกนี้คุมได้" — เดิมการ์ด KPI คิดจากลูกค้าเป้าหมายทั้งสาขาเสมอ (สรุปที่ฐานข้อมูล)
  //   เลือกจังหวัด/ผู้รับผิดชอบ/ช่องทาง/ช่วงมูลค่า ตารางเปลี่ยน แต่ตัวเลขบนการ์ดนิ่งสนิท
  //   → อ่านคู่กันแล้วขัดกันเอง ("กรองเหลือ 3 ราย แต่การ์ดบอก 16 ราย")
  //
  // ⚠️ จงใจไม่รวม "สถานะ" กับ "ค้างติดต่อ" ไว้ในฐานนี้ เพราะการ์ด KPI เป็นตัวสลับสองอย่างนั้นเอง
  //    ถ้ารวมเข้าไปด้วย พอกดกรองสถานะหนึ่ง การ์ดอื่นจะกลายเป็น 0 แล้วกดสลับกลับไม่ได้อีก
  const ตรงตัวกรองพื้นฐาน = useCallback((l: LeadRow) => {
    const q = query.toLowerCase();
    const matchQ = !query
      || l.company.toLowerCase().includes(q)
      || l.contact.toLowerCase().includes(q)
      || l.province.toLowerCase().includes(q)
      || l.id.toLowerCase().includes(q);
    const matchPerson = person === "all" || assignedHas(l.assigned, person);
    // ช่วงเวลา = วันที่ลูกค้าเข้ามา เกณฑ์เดียวกับหน้าสำนักงานใหญ่ (บอสเลือก 15 ก.ย. 69 · เดิมใช้วันติดต่อล่าสุด)
    const matchTime = leadEnteredInRange(l, timeRange.start, timeRange.end);
    const matchA = !fAssignee || assignedHas(l.assigned, fAssignee);
    const matchP = !fProvince || l.province === fProvince;
    const matchSrc = !fSource || (l.source ?? "") === fSource;
    const val = มูลค่าลีด(l) ?? 0;   // ยอดใบล่าสุด (ไม่มีใบ = 0 → ไม่ผ่านตัวกรองขั้นต่ำ)
    const matchMin = !fValueMin || val >= parseFloat(fValueMin.replace(/[฿,M]/g,""))*1e6;
    const matchMax = !fValueMax || val <= parseFloat(fValueMax.replace(/[฿,M]/g,""))*1e6;
    return matchQ && matchPerson && matchTime && matchA && matchP && matchSrc && matchMin && matchMax;
  }, [query, person, timeRange, fAssignee, fProvince, fSource, fValueMin, fValueMax]);

  const filtered = useMemo(() => {
    let arr = leadsData.filter(l => {
      // ตัวกรองพื้นฐาน (ค้นหา/ผู้รับผิดชอบ/ช่วงเวลา/จังหวัด/ช่องทาง/ช่วงมูลค่า) ใช้ตัวเดียวกับการ์ด KPI
      const matchS = filterStatus === "ALL" || l.status === filterStatus;
      const matchFollow = followUpDays === 0 || needsFollowUp(l, followUpDays);
      // ตัวกรอง quick (วันนี้/สัปดาห์นี้/ของฉัน/ค้างเกิน 7 วัน/ปิดไม่สำเร็จ) ถูกลบพร้อมชิปกรองด่วน
      return ตรงตัวกรองพื้นฐาน(l) && matchS && matchFollow;
    });

    arr = [...arr].sort((a,b) => {
      if (sortKey === null) return b.numId - a.numId;
      let av: string|number = 0, bv: string|number = 0;
      if (sortKey === "value") { av = มูลค่าลีด(a) ?? -1; bv = มูลค่าลีด(b) ?? -1; }
      else { av = (a[sortKey] as string) ?? ""; bv = (b[sortKey] as string) ?? ""; }
      // เรียงข้อความไทยตามพยัญชนะ (locale "th") — เรียงด้วย < > ตรงๆ จะได้ลำดับ Unicode ที่ไม่ตรงตามตัวอักษรไทย
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv, "th");
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [leadsData, ตรงตัวกรองพื้นฐาน, filterStatus, sortKey, sortDir, followUpDays]);

  // จำนวนลูกค้าเป้าหมายที่ต้องรีบติดตาม (ขาดการติดต่อเกินเกณฑ์กฎธุรกิจ) — สำหรับแจ้งเตือน "ด่วน"
  const followUpCount = useMemo(() => leadsData.filter(l => needsFollowUp(l, followUpAlertDays)).length, [leadsData, followUpAlertDays]);

  // ─── List pagination (LIST view only) ──────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Reset to page 1 whenever filters / search / sort change the result set
  useEffect(() => { setPage(1); }, [query, filterStatus, person, fAssignee, fProvince, fSource, fValueMin, fValueMax, sortKey, sortDir]);
  // Clamp page into range if the list shrinks
  useEffect(() => { setPage(p => Math.min(p, totalPages)); }, [totalPages]);
  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
  const pageStart = filtered.length === 0 ? 0 : (page-1)*PAGE_SIZE + 1;
  const pageEnd = Math.min(page*PAGE_SIZE, filtered.length);

  // totalValue / wonLeads / nonLost / winRate ถูกลบ — คำนวณไว้แต่ไม่มีใครแสดง
  // และทั้งสามคิดจาก allLeads (ทั้งเครือ) ซึ่งผิดขอบเขตของหน้าดีลเลอร์อยู่แล้ว
  // อัตราปิดการขายที่แสดงจริงคือ convRate ด้านล่าง (คิดจาก myAllLeads)
  const hasActiveFilters = !!(fAssignee || fProvince || fSource || fValueMin || fValueMax);
  // ช่วงมูลค่าใน FilterRow ↔ fValueMin/fValueMax ที่ตัวกรองจริงใช้ (แหล่งความจริงเดียวยังเป็นสองค่านี้)
  const valueBand = VALUE_BANDS.find(b => b.min === fValueMin && b.max === fValueMax)?.v ?? "ALL";
  const pickValueBand = (v: string) => {
    const b = VALUE_BANDS.find(x => x.v === v);
    setFValueMin(b?.min ?? ""); setFValueMax(b?.max ?? "");
  };

  function onSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ─── Panel helpers ─────────────────────────────────────────────────────
  const current = draft ?? selectedLead;
  const lid = current?.id ?? "";

  function resetApptForm() { setApptAdding(false); setApptForm({ type: "", date: APP_NOW_ISO, time: "10:00", title: "", note: "" }); }
  // ใบเสนอราคาใบนี้เป็นของลูกค้าเป้าหมายนี้ไหม — กติกาเดียวกับที่แท็บใบเสนอราคาใช้กรองรายการ
  // (ใบใหม่ผูกด้วย dealId · ใบเก่าก่อนมี dealId ผูกด้วยรหัสลูกค้า/ชื่อบริษัท)
  function quoteBelongsToLead(q: QuotationMock, l: LeadRow): boolean {
    if (q.dealId != null) return q.dealId === l.numId;
    if (l.customerId && q.customerId === l.customerId) return true;
    return q.customer === l.company;
  }
  // พาไปแท็บใบเสนอราคาของลูกค้าเป้าหมายนี้ — ใช้ทั้งตอนพาไปออกใบใหม่ และตอนพาไปกดส่งใบที่มีอยู่
  const [quoteFormSignal, setQuoteFormSignal] = useState(0);
  // ปุ่ม "ขั้นต่อไป" สั่งแผงคำขอราคาเปิดฟอร์ม (ขอราคา / ขอราคาใหม่) — n เปลี่ยน = สั่งใหม่
  const [reqSignal, setReqSignal] = useState<{ mode: "ขอราคา" | "แก้ราคา"; n: number } | undefined>(undefined);
  function focusQuotationTab(l: LeadRow) {
    setSelectedLead(l); setDraft({ ...l });
    setEditingField(null); setShowDeleteConfirm(false);
    setPopupField(null); setEditPopupPos(null);
    setShowStatusDropdown(false);
    setActiveTab("quotation"); setDTab("quotation");
  }
  /** พาไปดูรายการใบของลูกค้าเป้าหมายนี้ (ไม่เปิดฟอร์ม) — ใช้ตอนพาไปกดส่งใบที่ออกไว้แล้ว */
  function openQuotationList(l: LeadRow) { focusQuotationTab(l); setQuoteFormSignal(0); }
  /** พาไปออกใบใหม่ — เพิ่มค่าสัญญาณเสมอ (ห้ามรีเซ็ตเป็น 0 ก่อน ไม่งั้นสั่งซ้ำรอบสองจะได้ค่าเดิม = ไม่เปิด) */
  function openQuotationForm(l: LeadRow) { focusQuotationTab(l); setQuoteFormSignal(n => n + 1); }

  function openPanel(l: LeadRow) {
    if (selectedLead?.id === l.id) return closePanel();
    setSelectedLead(l); setDraft({...l});
    setEditingField(null); setShowDeleteConfirm(false);
    setActiveTab("overview"); setDTab("overview");
    setQuoteFormSignal(0); // เปิดแผงตามปกติ = ไม่ได้สั่งออกใบ (กันฟอร์มค้างจากลูกค้าเป้าหมายก่อนหน้า)
    setPopupField(null); setEditPopupPos(null);
    setShowStatusDropdown(false);
    resetApptForm(); // กันฟอร์มนัดหมายค้างข้ามลูกค้าเป้าหมาย
    // รายงานติดตาม (report) กับไทม์ไลน์ (activities) ไม่ได้มากับรายการ
    //   ทั้งสองกินขนส่งมากแต่ใช้เฉพาะในแผงนี้ — จึงมาเติมตอนเปิดแทน
    //   ⚠️ report ต้องเติมให้ทัน ไม่งั้นตัวแก้รายงานจะเห็นว่าว่างแล้วเสนอเทมเพลตใหม่ (ดู ReportEditor)
    void leadsRepo.get(l.id)
      .then(full => {
        if (!full) return;
        const เติม = (p: LeadRow) => ({ ...p, report: full.report, activities: full.activities });
        setSelectedLead(prev => prev && prev.id === l.id ? เติม(prev) : prev);
        setDraft(prev => prev && prev.id === l.id ? เติม(prev) : prev);
      })
      .catch(e => logRepoRead("leads.get", e));
  }
  function closePanel() {
    setSelectedLead(null); setDraft(null); setQuoteFormSignal(0);
    setEditingField(null); setShowDeleteConfirm(false);
    setPopupField(null); setEditPopupPos(null);
    setShowStatusDropdown(false);
    resetApptForm();
  }

  // เปิดโมดัลจากพารามิเตอร์ ?open=N — ใช้ทั้งตอนโหลดหน้า (deep link/ลิงก์เดิม) และตอนค้นหาจาก Topbar หน้าเดิม
  const allLeadsRef = useRef(allLeads);
  allLeadsRef.current = allLeads;
  useEffect(() => {
    const openByParam = (qs: string) => {
      const p = new URLSearchParams(qs).get("open");
      if (!p) return;
      const target = allLeadsRef.current.find(l => String(l.numId) === p || l.id === p);
      if (target) {
        if (target.status === "PAID") {
          // เป็นลูกค้าแล้ว — ส่งต่อไปหน้าลูกค้าแทน (โปรไฟล์อยู่ที่นั่น)
          router.replace(target.customerId != null ? `/customers?open=${target.customerId}` : "/customers");
          return;
        }
        openPanel(target);
      } else {
        // ลิงก์เดิม/แชร์มาแต่ลูกค้าเป้าหมายถูกลบ/ไม่มีจริง — เดิมหายไปเงียบ ๆ ไม่มีข้อความอะไรเลย
        // (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
        setToast("ไม่พบลูกค้าเป้าหมายรายนี้ — อาจถูกลบหรือลิงก์ไม่ถูกต้อง");
      }
      window.history.replaceState(null, "", "/leads"); // ล้าง param กันเปิดซ้ำเมื่อรีเฟรช
    };
    // 1) ตอนโหลดหน้า (mount) — จาก URL จริง
    openByParam(window.location.search);
    // 2) ตอนค้นหาจาก Topbar ขณะอยู่หน้าเดิม — Topbar ยิง event พร้อม href ปลายทาง
    const onOpen = (e: Event) => {
      const href = (e as CustomEvent<string>).detail ?? "";
      const [path, query = ""] = href.split("?");
      if (path === "/leads" && query) openByParam(`?${query}`);
    };
    window.addEventListener("bpms:open-record", onOpen);
    return () => window.removeEventListener("bpms:open-record", onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function deleteLead() {
    removeLead(selectedLead!.id);
    closePanel();
  }
  function handleStatusChange(val: string) {
    if (!draft) return;
    saveLead({ stage: { status: val as LeadStatus } });
  }

  // หมายเหตุ: ลูกค้าถูกสร้างอัตโนมัติเมื่อปิดการขายสำเร็จ (WON) ผ่าน context — ไม่มีปุ่มสร้างเองแล้ว
  // (ระบบ "ดีล" แยกถูกตัดออก — Kanban ลูกค้าเป้าหมายคือบอร์ดการขายเดียว)

  // ความคืบหน้า (Progress) จากลำดับขั้นตอน — PAID=100%, CANCELLED=0% (ใช้ใน drawer)
  function leadProgress(status: LeadStatus): number {
    if (status === "PAID") return 100;
    if (status === "CANCELLED") return 0;
    const idx = ACTIVE_LEAD_STATUSES.indexOf(status);
    if (idx < 0) return 0;
    return Math.round(((idx + 1) / (ACTIVE_LEAD_STATUSES.length + 1)) * 100);
  }

  // Files — ของลูกค้าเป้าหมายรายนี้ (ผูกด้วย numId) จากคลังไฟล์รวม
  const myFiles: DealerFile[] = current
    ? dealerFiles.filter(f => f.source === "lead" && f.recordId === current.numId).sort((a, b) => b.id - a.id)
    : [];
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f || !current) return;
    // ช่องนี้เคยไม่ตรวจอะไรเลย — ไฟล์ใหญ่แค่ไหน ชนิดอะไรก็แนบได้ ทั้งที่เขียนลงคลังไฟล์
    // ก้อนเดียวกับหน้าไฟล์/แผงลูกค้าซึ่งตรวจอยู่แล้ว (พบ 6 ส.ค. 69) · ใช้กฎกลางตัวเดียวกัน
    const problem = validateUpload(f);
    if (problem) {
      แจ้งพลาด(problem);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    const size = humanFileSize(f.size);
    const lead = current;
    if (fileInputRef.current) fileInputRef.current.value = "";
    void (async () => {
      // upload คืน path (supabase) หรือ null (local) · โยน error ถ้าอัปโหลดจริงไม่สำเร็จ — ห้ามกลืน (H1)
      // เดิม .catch(()=>null) → ไฟล์โผล่ในลิ้นชักเหมือนสำเร็จ แต่ไบต์ไม่เคยขึ้น Storage
      let storagePath: string | null = null;
      try {
        storagePath = await fileStorage.upload(currentDealer.code, f);
        await filesRepo.add({
          name: f.name, size, ext: extOfName(f.name), category: guessFileCategory(f.name),
          project: lead.company || lead.name, uploadedBy: lead.assigned || "คุณ",
          uploadedAt: APP_NOW_ISO, source: "lead", recordId: lead.numId, dealerCode: currentDealer.code,
          ...(storagePath ? { storagePath } : {}),
        });
        await filesRepo.list({ dealerCode: currentDealer.code, isHQ: false }).then(setDealerFiles);
      } catch (err) {
        if (storagePath) await fileStorage.remove(storagePath).catch(() => {}); // กันไบต์กำพร้า
        reportRepoSaveError(err);
      }
    })();
  }

  // Status dropdown
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Field popup (right sidebar detail rows)
  const [popupField, setPopupField] = useState<string|null>(null);
  const [editPopupPos, setEditPopupPos] = useState<{top:number;left:number}|null>(null);
  const [editPopupLabel, setEditPopupLabel] = useState("");
  const [editPopupVal, setEditPopupVal] = useState("");
  const [editPopupType, setEditPopupType] = useState("text");
  const [editPopupOptions, setEditPopupOptions] = useState<string[]|null>(null);

  function openFieldPopup(field: string, label: string, type: string, e: React.MouseEvent, options?: string[]) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const popW = 300;
    let left = rect.left;
    if (left + popW > window.innerWidth - 16) left = window.innerWidth - popW - 16;
    const top = rect.bottom + 8 + 160 > window.innerHeight ? rect.top - 168 : rect.bottom + 8;
    const curVal = (draft as unknown as Record<string,string>|null)?.[field] ?? (current as unknown as Record<string,string>)?.[field] ?? "";
    setPopupField(field);
    setEditPopupLabel(label);
    setEditPopupVal(curVal);
    setEditPopupType(type);
    setEditPopupOptions(options ?? null);
    setEditPopupPos({ top, left });
  }
  function closeFieldPopup() { setPopupField(null); setEditPopupPos(null); setEditPopupVal(""); setEditPopupOptions(null); }
  function commitFieldPopup() {
    if (!draft || !popupField) return;
    saveLead({ fields: { [popupField]: editPopupVal } as LeadFields });
    closeFieldPopup();
  }

  // Escape closes the detail modal (or the topmost nested overlay first)
  useEffect(() => {
    if (!selectedLead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showDeleteConfirm) setShowDeleteConfirm(false);
      else if (popupField) closeFieldPopup();
      else closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead, showDeleteConfirm, popupField]);

  // ── เลิกใช้ "สรุปทั้งสาขาจากฐานข้อมูล" ที่หน้านี้ (บอสสั่ง 20 ส.ค. 69) ──────────
  //   สรุปนั้นเร็วก็จริง แต่ไม่รู้จักตัวกรองของหน้า (จังหวัด/ผู้รับผิดชอบ/ช่องทาง/ช่วงมูลค่า)
  //   ตัวเลขบนการ์ดกับกราฟจึงนิ่งอยู่กับที่ ขัดกับตารางที่กรองแล้วตรงหน้า
  //   ข้อมูลของสาขาถูกโหลดมาอยู่ในหน้าอยู่แล้ว (ตารางใช้ชุดเดียวกัน) — คิดฝั่งหน้าจอจึงไม่ได้เพิ่มภาระ

  // ฐานของการ์ด KPI = ผ่านตัวกรองพื้นฐานทั้งหมดของหน้านี้ (ยังไม่กรองสถานะ/ค้างติดต่อ)
  //   สองชุด: ไม่รวมที่ปิดการขายแล้ว (เหมือนตาราง) และรวมทุกสถานะ (ใช้คิดอัตราปิดการขาย)
  const ฐานสรุป = useMemo(() => leadsData.filter(ตรงตัวกรองพื้นฐาน), [leadsData, ตรงตัวกรองพื้นฐาน]);
  const ฐานสรุปรวมปิดแล้ว = useMemo(() => myAllLeads.filter(ตรงตัวกรองพื้นฐาน), [myAllLeads, ตรงตัวกรองพื้นฐาน]);

  // ─── สรุปด้านบน: 5 ตัวชี้วัด + กราฟแนวโน้ม + แหล่งที่มา ────────────────
  // นับจาก leadsData (ชุดที่ผ่านตัวกรองหลักแล้ว) — คลิกการ์ดเพื่อกรองต่อ
  const newThisMonth = useMemo(
    () => leadsData.filter(l => { const d = leadCreatedDate(l); return d.getMonth() === MOCK_TODAY_LEAD.getMonth() && d.getFullYear() === MOCK_TODAY_LEAD.getFullYear(); }).length,
    [leadsData]);
  // ⚠️ ต้องนับจากฐานที่ผ่านตัวกรองของหน้านี้ ไม่ใช่ยอดทั้งสาขาจากฐานข้อมูล (overduePage)
  //    ไม่งั้นกรองจังหวัดแล้วการ์ด "เกิน N วัน" ยังนับของทั้งสาขาอยู่ = ขัดกับตารางตรงหน้า
  const overdue7 = useMemo(
    () => ฐานสรุป.filter(l => needsFollowUp(l, followUpAlertDays)).length,
    [ฐานสรุป, followUpAlertDays]);
  const meetingToday = useMemo(() => appointments.filter(a => a.date === APP_NOW_ISO && a.status !== "cancelled" && a.type !== "follow_up").length, [appointments]);
  const newWaiting = useMemo(() => ฐานสรุป.filter(l => l.status === "WAITING").length, [ฐานสรุป]);
  // Sales Opportunity = มูลค่ารวมของลูกค้าเป้าหมายที่ยังเปิดอยู่ (Expected Revenue)
  const openValue = useMemo(
    () => ฐานสรุป.filter(l => l.status !== "PAID" && l.status !== "CANCELLED").reduce((s, l) => s + (มูลค่าลีด(l) ?? 0), 0),
    [ฐานสรุป]);
  // Conversion Rate = ปิดได้ / (ปิดได้ + ปิดไม่ได้) — ต้องนับจากฐานที่ "รวมที่ปิดการขายแล้ว" ด้วย
  // (ตารางตัด PAID ออก) และต้องเป็นของสาขาตัวเองเท่านั้น
  const convRate = useMemo(() => {
    const นับ = (st: string) => ฐานสรุปรวมปิดแล้ว.filter(l => l.status === st).length;
    const won = นับ("PAID"), lost = นับ("CANCELLED");
    return won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null;   // ยังไม่มีดีลที่ปิด = "—" ไม่ใช่ 0% (บอสตัดสิน 19 ต.ค. 69 ข้อ 8)
  }, [ฐานสรุปรวมปิดแล้ว]);
  const fmtCompact = (v:number) => v>=1e6 ? `฿${(v/1e6).toFixed(1)}M` : v>=1e3 ? `฿${Math.round(v/1e3)}K` : `฿${v}`;

  // การ์ด = ปุ่มกรอง · on = กำลังกรองด้วยเงื่อนไขนี้อยู่ (กดซ้ำ = ล้าง)
  // ช่วงวันในดรอปดาวน์ — เกณฑ์ของสาขาต้องเป็นตัวเลือกแรกเสมอ (การ์ด "เกิน N วัน" กดแล้วเซ็ตค่านี้)
  // เดิมฟิกซ์ [7,14,30] ไว้ พอสาขาตั้ง 3 วัน ค่าที่การ์ดเซ็ตจะไม่มีในลิสต์ → ดรอปดาวน์เด้งกลับ
  const followUpBands = useMemo(
    () => [...new Set([followUpAlertDays, 7, 14, 30])].sort((a, b) => a - b),
    [followUpAlertDays],
  );
  const noFilter = filterStatus === "ALL" && followUpDays === 0;
  const leadKpis = [
    /* ⚠️ นับจากชุดเดียวกับตาราง ซึ่ง "ไม่รวมรายที่ปิดการขายแล้ว" — ต้องเขียนบอก ไม่งั้นเทียบกับหน้าสำนักงานใหญ่
       (ที่รวมทุกสถานะ) แล้วเห็นเลขต่างกันโดยไม่รู้สาเหตุ (ผลตรวจภายนอก DL-11 · 24 ส.ค. 69: 14 vs 16) */
    { label:"ลูกค้าเป้าหมายทั้งหมด", value:`${ฐานสรุป.length}`,   sub:"ไม่รวมรายที่ปิดแล้ว",       Icon:Users,      color:"#2563EB", bg:"#E8F0FE", on: noFilter,                 onClick:()=>{ setFilterStatus("ALL"); setFollowUpDays(0); } },
    { label:"โอกาสการขาย",          value:fmtCompact(openValue),    sub:"มูลค่าที่เปิดอยู่", Icon:TrendingUp, color:"#16A34A", bg:"#E6F7EE", on: false,                   onClick:()=>{ setFilterStatus("ALL"); setFollowUpDays(0); } },
    { label:`เกิน ${followUpAlertDays} วัน`, value:`${overdue7}`,     sub:"รายการ",       Icon:AlarmClock, color:"#EA580C", bg:"#FEF0E6", on: followUpDays === followUpAlertDays, onClick:()=>{ setFilterStatus("ALL"); setFollowUpDays(followUpDays === followUpAlertDays ? 0 : followUpAlertDays); } },
    /* ⚠️ การ์ดนี้นับ "ดีล" (ลูกค้าเป้าหมายที่ปิดแล้ว) ส่วนแดชบอร์ดนับ "ใบเสนอราคา" — คนละหน่วย เลขจึงต่างกันได้
       ถ้าใช้ชื่อเดียวกันทั้งสองที่ ผู้ใช้จะเห็นเลขขัดกันในแอปเดียว (ผลตรวจภายนอก DL-03 · 24 ส.ค. 69) */
    { label:"อัตราปิดดีล",       value: convRate == null ? "—" : `${convRate}%`,           sub:"ปิดได้ ÷ ดีลที่ปิดแล้วทั้งหมด", Icon:Percent,   color:"#0D9488", bg:"#E6F7F5", on: false,                   onClick:()=>{ setFilterStatus("ALL"); setFollowUpDays(0); } },
  ];

  // แนวโน้ม 12 เดือน — ลูกค้าเป้าหมายใหม่ เทียบ ปิดการขาย · ปีปัจจุบันเท่านั้น
  // ข้อมูลมีทั้งปี 2568 และ 2569 — เดิมนับแต่เดือนโดยไม่ดูปี ของปีที่แล้วเลยมาโผล่ในกราฟปีนี้
  // ⚠️ leadsData ตัด PAID ออกไปแล้ว — เส้น "ปิดการขาย" ที่นับจากมันจึงเป็น 0 ตลอดทั้งกราฟ
  // สรุปจากฐานนับครบทุกสถานะ จึงแก้เส้นที่หายไปด้วย (จัดกลุ่มตามเดือนที่สร้าง เหมือนเดิม)
  // ⚠️ ต้องนับจากฐานที่ผ่านตัวกรองของหน้านี้ (ไม่ใช่สรุปทั้งสาขาที่ฐานข้อมูล) — ไม่งั้นเลือกจังหวัดแล้ว
  //    การ์ดกับตารางเปลี่ยน แต่กราฟยังเป็นของทั้งสาขา อ่านคู่กันแล้วขัดกันเอง
  const leadTrend = useMemo(() => {
    const newLeads = Array(12).fill(0), won = Array(12).fill(0);
    ฐานสรุปรวมปิดแล้ว.forEach(l => {
      const d = leadCreatedDate(l);
      if (d.getFullYear() !== CUR_YEAR) return;
      newLeads[d.getMonth()]++;
      if (l.status === "PAID") won[d.getMonth()]++;
    });
    return { newLeads, won };
  }, [ฐานสรุปรวมปิดแล้ว]);

  // Lead vs Quotations — จำนวนลูกค้าเป้าหมาย (น้ำเงิน) เทียบ ใบเสนอราคา (ส้ม) รายเดือน · ปีปัจจุบันเท่านั้น
  const leadVsQuote = useMemo(() => {
    const leadC = Array(12).fill(0), quoteC = Array(12).fill(0);
    ฐานสรุปรวมปิดแล้ว.forEach(l => { const d = leadCreatedDate(l); if (d.getFullYear() === CUR_YEAR) leadC[d.getMonth()]++; });
    quotations.filter(q => q.date.slice(0, 4) === String(CUR_YEAR))
      .forEach(q => { const mo = parseInt(q.date.slice(5, 7), 10) - 1; if (mo >= 0 && mo < 12) quoteC[mo]++; });
    return { leadC, quoteC };
  }, [ฐานสรุปรวมปิดแล้ว, quotations]);

  // stageStats (Sales Journey) ถูกลบพร้อมการ์ดเส้นทาง/action center — เหลือแต่การคำนวณที่ไม่มีใครอ่าน
  // และนับจาก allLeads ทั้งเครือ ซึ่งผิดขอบเขตของหน้าดีลเลอร์

  // ─── RENDER ────────────────────────────────────────────────────────────
  return (
    <>
      {/* ═══ PAGE ═══════════════════════════════════════════════════ */}
      <div className="erp">
        {/* หัวหน้า/ปุ่ม → ไปอยู่บนแถบบน (ชื่อหน้ามาจาก Topbar) · เหลือคำบรรยายไว้ในเนื้อหา */}
        <TopbarActions>
          {/* ตัวเลือกของมุมมองบอร์ด — โผล่เฉพาะตอนดูบอร์ด */}
          {view === "kanban" && (
            <button onClick={()=>setHideEmpty(v=>!v)}
              style={{ display:"flex", alignItems:"center", gap:6, padding:"0 12px", height:33, boxSizing:"border-box", borderRadius:9, cursor:"pointer",
                border:`1px solid ${hideEmpty?"#003366":"#e5e7eb"}`, background: hideEmpty?"#dce5f0":"#fff",
                color: hideEmpty?"#003366":"#6b7280", fontFamily:"inherit", fontSize:"0.72rem", fontWeight:600 }}>
              {hideEmpty ? <Check size={13} /> : <Columns3 size={13} />} ซ่อนคอลัมน์ว่าง
            </button>
          )}
          <FilterBar dims={[]} />
          <ExportMenu filename="leads" title="รายชื่อลูกค้าเป้าหมาย"
            headers={["รหัส","ชื่อ","ผู้ติดต่อ","จังหวัด","ช่องทางที่มา","พื้นที่ (ตร.ม.)","สถานะ","ความคืบหน้า","มูลค่า","ผู้รับผิดชอบ","กิจกรรมล่าสุด"]}
            rows={filtered.map(l=>[l.id,l.name,l.contact,l.province,l.source??"—",l.area ?? "—",leadStatusLabel[l.status],`${leadProg(l, taskTpl)}%`,fmtมูลค่าย่อ(มูลค่าลีด(l)),l.assigned,lastActivity(l)])} />
          <button onClick={() => setShowAddForm(true)} className="btn btn-primary btn-sm">
            <Plus size={15} /> เพิ่มลูกค้าเป้าหมาย
          </button>
        </TopbarActions>
        {/* จำนวน/อัตราปิดการขาย อยู่บนการ์ด KPI แล้ว — บรรทัดนี้บอกแค่ช่วงเวลาที่กำลังดู */}
        {/* คำโปรยใต้ชื่อหน้าถูกเอาออกทุกหน้า (บอสสั่ง 14 ส.ค. 69) */}

        {/* ── สรุป 4 ตัวชี้วัด — ทั้งการ์ดคือปุ่มกรอง (กดซ้ำ = ล้าง) · ไม่มีลิงก์ซ้ำในการ์ด ── */}
        <div className="dash-kpis" style={{ marginBottom: 16 }}>
          {/* สถานะ "ถูกเลือก" คุมด้วย .kpi-toggle + aria-pressed ใน globals.css — ห้ามใส่ border/boxShadow เป็น inline */}
          {leadKpis.map(k => (
            <button key={k.label} onClick={k.onClick} aria-pressed={k.on} title={k.on ? "กดอีกครั้งเพื่อล้างตัวกรอง" : `กรอง: ${k.label}`}
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


        {/* ชิปกรองด่วน (ทั้งหมด/วันนี้/สัปดาห์นี้/ของฉัน/ค้างเกิน 7 วัน/ปิดไม่สำเร็จ) เอาออกตามที่บอสสั่ง */}

        {/* ── แถบตัวกรองแถวเดียว (มาตรฐานเดียวกับหน้า /hq/pipeline) ──
            เดิมเป็นปุ่ม "ตัวกรอง" + แผงเลื่อนจากขวา — ตอนนี้เห็นตัวกรองทุกตัวพร้อมกัน
            "ทุกสถานะ" ใช้ state เดียวกับการ์ด KPI ด้านบน → กดที่ไหนก็ตรงกัน
            ปิดการขายสำเร็จ (PAID) ไม่อยู่ในตัวเลือก — ลูกค้าเป้าหมายที่ปิดแล้วย้ายไปหน้าลูกค้า (leadsData ตัดออก) */}
        <FilterRow
          query={query} onQuery={setQuery} placeholder="ค้นหาบริษัท ผู้ติดต่อ..."
          showClear={hasActiveFilters || filterStatus!=="ALL" || followUpDays!==0 || !!query}
          onClear={()=>{ setQuery(""); setFilterStatus("ALL"); setFollowUpDays(0); setFAssignee(""); setFProvince(""); setFSource(""); setFValueMin(""); setFValueMax(""); }}
          right={
            /* สลับมุมมอง ตาราง/บอร์ด — กลับมาอยู่ท้ายแถบตัวกรองเหมือนเดิม (ช่อง right ของ FilterRow เตรียมไว้ให้พอดี)
               ขนาดเล็กกว่าช่องกรอง (สูง 30 · ไอคอน 12) เพราะเป็นตัวควบคุมรอง ไม่ใช่ตัวกรอง */
            <div style={{ display:"flex", border:"1px solid #e5e7eb", borderRadius:8, overflow:"hidden", height:30, boxSizing:"border-box", flexShrink:0 }}>
              {([["list", LayoutList, "ตาราง"], ["kanban", Columns3, "บอร์ด"]] as const).map(([v, Ico, tip]) => (
                <button key={v} title={tip} onClick={()=>setView(v)}
                  style={{ display:"flex", alignItems:"center", gap:4, padding:"0 8px", height:"100%", border:"none", cursor:"pointer",
                    background: view===v ? "#003366" : "#fff", color: view===v ? "#fff" : "#6b7280", fontFamily:"inherit", fontSize:"0.68rem", fontWeight:600 }}>
                  <Ico size={12} /> {tip}
                </button>
              ))}
            </div>
          }
        >
          {/* ไม่ตั้ง minWidth เกินจำเป็น — select กว้างตามคำ caption อยู่แล้ว
              ตั้งเกินไว้ = กินที่ฟรีจนแถบตกบรรทัดที่จอ 1440 */}
          <FilterSelect caption="ทุกสถานะ" value={filterStatus} onChange={v=>setFilterStatus(v as LeadStatus|"ALL")}
            options={ALL_STATUSES.filter(s=>s!=="PAID").map(s=>({v:s,l:leadStatusLabel[s]}))} />
          <FilterSelect caption="ทุกผู้รับผิดชอบ" value={fAssignee} onChange={setFAssignee} all=""
            options={personsList.map(p=>({v:p,l:p}))} />
          <FilterSelect caption="ทุกจังหวัด" value={fProvince} onChange={setFProvince} all=""
            options={PROVINCES.map(p=>({v:p,l:p}))} />
          <FilterSelect caption="ทุกช่องทางที่มา" value={fSource} onChange={setFSource} all=""
            options={SOURCES.map(s=>({v:s,l:s}))} />
          <FilterSelect caption="ทุกช่วงมูลค่า" value={valueBand} onChange={pickValueBand}
            options={VALUE_BANDS.map(b=>({v:b.v,l:b.l}))} />
          {/* ค้างติดต่อเกิน N วัน — เกณฑ์วันอย่างเดียว (จำนวนอยู่บนการ์ด "เกิน 7 วัน" ด้านบนแล้ว ไม่ซ้ำ) */}
          {followUpCount > 0 && (
            <FilterSelect caption="ค้างติดต่อทุกช่วง" value={String(followUpDays)} onChange={v=>setFollowUpDays(Number(v))} all="0"
              options={followUpBands.map(d=>({v:String(d),l:`ค้างติดต่อ >${d} วัน`}))} />
          )}
        </FilterRow>

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <div className="card">
            <div className={`table-wrap${density === "compact" ? " dense" : ""}`}>
              <table>
                {/* เดิมเป็น % ล้วนทุกคอลัมน์ — พอจอแคบ (768px) บีบสัดส่วนจนตัวอักษรเหลือตัวเดียว+จุดไข่ปลา
                    แทนที่จะดัน .table-wrap ให้ scroll (ต่างจากตาราง /customers ที่ตั้ง minWidth ครบทุกคอลัมน์)
                    → เติม minWidth ให้ครบเหมือนกัน */}
                <colgroup>
                  <col style={{width:"18%", minWidth:180}} />{/* บริษัท / ผู้ติดต่อ */}
                  {!hiddenCols.includes("province") && <col style={{width:"9%", minWidth:90}} />}
                  {!hiddenCols.includes("source")   && <col style={{width:"10%", minWidth:100}} />}
                  {!hiddenCols.includes("area")     && <col style={{width:"8%", minWidth:100}} />}
                  <col style={{width:"14%", minWidth:150}} />{/* ขั้นตอน — minWidth ต้องพอให้ชื่อขั้นที่ยาวที่สุด ("รวบรวมความต้องการ") อยู่ได้ */}
                  <col style={{width:"13%", minWidth:110}} />{/* ความคืบหน้า */}
                  <col style={{width:"11%", minWidth:90}} />{/* มูลค่า */}
                  <col style={{width:"12%", minWidth:110}} />{/* ผู้รับผิดชอบ */}
                  {!hiddenCols.includes("activity") && <col style={{width:"9%", minWidth:100}} />}
                  <col style={{width:"12%", minWidth:48}} />{/* ปุ่มลบ */}
                </colgroup>
                <thead>
                  <tr>
                    {([
                      ["company","บริษัท / ผู้ติดต่อ",null],
                      [null,"จังหวัด","province"],
                      [null,"ช่องทางที่มา","source"],
                      [null,"พื้นที่ (ตร.ม.)","area"],
                      ["status","ขั้นตอน",null],
                      [null,"ความคืบหน้า",null],
                      ["value","มูลค่า",null],
                      ["assigned","ผู้รับผิดชอบ",null],
                      [null,"กิจกรรมล่าสุด","activity"],
                      [null,"",null], // คอลัมน์ปุ่มลบ — ไม่ต้องมีหัวคอลัมน์ (มาตรฐานเดียวกับตารางใบเสนอราคา)
                    ] as [SortKey|null,string,string|null][])
                      .filter(([,,colKey]) => !colKey || !hiddenCols.includes(colKey))
                      .map(([key,label])=>{
                      const isNum = key === "value" || label === "พื้นที่ (ตร.ม.)"; // คอลัมน์ตัวเลข — จัดหัวคอลัมน์ชิดขวาให้ตรงกับค่าในเซลล์ (.num)
                      return (
                      <th key={label || "actions"}
                        className={isNum ? "num" : undefined}
                        style={key ? { cursor:"pointer", userSelect:"none" } : undefined}
                        onClick={key ? ()=>onSort(key) : undefined}>
                        <span style={{ display:"flex", alignItems:"center", gap:4, justifyContent: isNum ? "flex-end" : "flex-start" }}>
                          {label} {key && <SortIcon field={key} sortKey={sortKey ?? ""} sortDir={sortDir} />}
                        </span>
                      </th>
                    );})}
                  </tr>
                </thead>
                <tbody>
                  {paged.map(l => {
                    const sc = leadStatusColor[l.status];
                    const done = !!l.customerId;
                    const isSel = selectedLead?.id === l.id;
                    return (
                      <ClickableRow key={l.id} onActivate={()=>openPanel(l)} className="clickable"
                        label={`เปิดรายละเอียดลูกค้าเป้าหมาย ${l.company}`}
                        style={{ background:isSel?"#f0f4f8":undefined }}>
                        <td style={{ minWidth:0 }}>
                          <div style={{ fontSize:"0.86rem", fontWeight:700, color:"#2D2D2D", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={l.company}>{l.company}</div>
                          <div style={{ fontSize:"0.65rem", color:"#374151", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={l.contact}>{l.contact}</div>
                        </td>
                        {!hiddenCols.includes("province") && (
                          <td style={{ fontSize:"0.72rem", color:"#374151" }}>{l.province || "—"}</td>
                        )}
                        {!hiddenCols.includes("source") && (
                          <td style={{ fontSize:"0.72rem", color:"#374151", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={l.source}>{l.source || "—"}</td>
                        )}
                        {!hiddenCols.includes("area") && (
                          <td className="num" style={{ fontSize:"0.72rem", color:"#374151", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" }}>
                            {l.area != null ? l.area.toLocaleString() : "—"}
                          </td>
                        )}
                        {/* ⚠️ เมนูเลือกขั้นต้องวางแบบ "ลอย" (position:fixed ตามพิกัดปุ่ม) — ผู้ใช้แจ้ง 19 ส.ค. 69
                            กล่องตาราง (.table-wrap) ตั้ง overflow-x:auto → เบราว์เซอร์ตัดแนวตั้งด้วย
                            เมนูที่วางแบบ absolute จึงโดนตัดหาย — เห็นแค่ขอบขาว ๆ โผล่ใต้แถว เลือกสถานะไม่ได้เลย
                            ท่านี้เป็นท่าเดียวกับเมนูจัดการผู้ใช้ที่ HQ (UsersPanel ActionMenu) ที่เจอปัญหาเดียวกันมาก่อน
                            ⛔ ห้ามใส่ z-index ที่ <td> นี้เด็ดขาด — เคยใส่แล้วเมนูกดไม่ได้ทันที (18 ส.ค. 69)
                            ⛔ ห้ามใส่ z-index ที่ <td> นี้เด็ดขาด — เคยใส่แล้วเมนูเลือกขั้นกดไม่ได้ทันที (18 ส.ค. 69)
                            เพราะ z-index สร้าง stacking context ใหม่ → เมนูข้างในถูกขังอยู่ใต้แถวถัดไป กดไม่โดน
                            การแก้ที่ถูกคือ "ล็อกป้ายไม่ให้ล้น" อย่างเดียว — ไม่ต้องมี z-index
                            ช่องนี้ต้องเปิด overflow ไว้ให้เมนูเลือกขั้นกางออกมาได้ แต่ผลข้างเคียงคือป้ายที่ชื่อยาวก็ล้นไปด้วย
                            ช่อง "ความคืบหน้า" อยู่ถัดไปและวาดทีหลัง จึงมาทับส่วนที่ล้น → คลิกโดนช่องข้างแทน */}
                        <td style={{ position:"relative" }}
                          onClick={e => { e.stopPropagation(); }}>
                          <button className="badge" title={leadStatusLabel[l.status]}
                            onClick={e => {
                              e.stopPropagation();
                              if (statusMenu?.id === l.id) { setStatusMenu(null); return; }
                              const r = e.currentTarget.getBoundingClientRect();
                              // ความสูงเมนูคำนวณได้แน่นอน (จำนวนขั้น × สูงแถว + ขอบ) — ไม่ต้องรอวัดหลังเรนเดอร์
                              //   ถ้าเพิ่ม/ลดขั้น หรือเปลี่ยนความสูงแถว ต้องอัปเดตเลข 38 ด้วย
                              const H = MANUAL_LEAD_STATUSES.length * 38 + 12;
                              const below = r.bottom + 4;
                              const y = below + H <= window.innerHeight - 8 ? below : Math.max(8, r.top - 4 - H);
                              setStatusMenu({ id: l.id, x: r.left, y });
                            }}
                            style={{ background:sc.bg, color:sc.text, border:"none", cursor:"pointer",
                              maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", display:"inline-flex" }}>
                            <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{leadStatusLabel[l.status]}</span> ▾
                          </button>
                          {statusMenu?.id === l.id && (
                            <>
                              {/* ⛔ ห้ามเอา portal ออก — ถ้าเมนูอยู่ในเซลล์ตาราง ตัวเลือกจะไปโผล่ใต้ขอบจอกดไม่ได้ */}
                              {/* (วัดจริง 19 ส.ค. 69: ตัวเลือก 7 ตัวหลุดจอทั้งหมด) มีเทสต์คุมใน redesign.spec.ts */}
                              {/* ⬆ ฉากคลิกปิดก็ต้องอยู่ใน portal เดียวกัน (ผู้ใช้แจ้ง 19 ส.ค. 69 "กดนอกตารางช้อยไม่หาย")
                                  เดิมวางไว้ในเซลล์ตาราง — ถึงจะเป็น fixed ก็โดน .table-wrap (overflow) ตัดเหลือแค่พื้นที่ตาราง
                                  คลิกพื้นที่นอกตารางจึงไม่โดนอะไรเลย เมนูค้างคาอยู่อย่างนั้น */}
                              {createPortal(
                              <>
                              <div onClick={e => { e.stopPropagation(); setStatusMenu(null); }}
                                style={{ position:"fixed", inset:0, zIndex:299 }}/>
                              <div data-menu="stage" style={{ position:"fixed", top:statusMenu.y, left:statusMenu.x, zIndex:300,
                                background:"#fff", border:"1px solid #e5e7eb", borderRadius:12,
                                boxShadow:"0 8px 24px rgba(0,0,0,.14)", minWidth:168, overflow:"hidden" }}>
                                {/* เมนูเปลี่ยนขั้นเอง: ไม่มี "รอราคา HQ" (ฐานข้อมูลขยับให้ตามคำขอราคา) · ระหว่างรอราคา HQ ฐานข้อมูลไม่ให้เปลี่ยนขั้นเอง */}
                                {l.status === "HQ_PRICING" ? (
                                  <div style={{ padding:"10px 14px", fontSize:"0.76rem", color:"#6b21a8", maxWidth:240, lineHeight:1.6 }}>
                                    รอราคาจากสำนักงานใหญ่ — เปลี่ยนขั้นเองไม่ได้ระหว่างรอ · ยกเลิกคำขอได้ที่แท็บใบเสนอราคา
                                  </div>
                                ) : l.status === "HQ_QUOTED" ? (
                                  <>
                                    <div style={{ padding:"10px 14px 4px", fontSize:"0.76rem", color:"#166534", maxWidth:240, lineHeight:1.6 }}>
                                      ได้ราคาจากสำนักงานใหญ่แล้ว — ขั้นต่อไปคือทำใบและส่งให้ลูกค้า
                                    </div>
                                    <button onClick={e => { e.stopPropagation(); void requestStatusChange(l.id, "CANCELLED"); setStatusMenu(null); }}
                                      style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"9px 14px", border:"none", background:"transparent", cursor:"pointer", textAlign:"left" }}>
                                      <span style={{ width:8, height:8, borderRadius:"50%", background:leadStatusColor.CANCELLED.text, flexShrink:0 }}/>
                                      <span style={{ fontSize:"0.8rem", color:"#2D2D2D" }}>{leadStatusLabel.CANCELLED}</span>
                                    </button>
                                  </>
                                ) : l.status === "PAID" ? (
                                  <div style={{ padding:"10px 14px", fontSize:"0.76rem", color:"#065f46", maxWidth:240, lineHeight:1.6 }}>
                                    ปิดการขายสำเร็จแล้ว — ย้อนได้เฉพาะสำนักงานใหญ่
                                  </div>
                                ) : MANUAL_LEAD_STATUSES.map(s => {
                                  const c = leadStatusColor[s];
                                  return (
                                    <button key={s}
                                      onClick={e => { e.stopPropagation(); void requestStatusChange(l.id, s); setStatusMenu(null); }}
                                      style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"9px 14px",
                                        border:"none", background:s===l.status?"#f0f4f8":"transparent",
                                        cursor:"pointer", textAlign:"left" }}>
                                      <span style={{ width:8, height:8, borderRadius:"50%", background:c.text, flexShrink:0 }}/>
                                      <span style={{ fontSize:"0.8rem", color:s===l.status?"#003366":"#2D2D2D", fontWeight:s===l.status?700:400 }}>
                                        {leadStatusLabel[s]}
                                      </span>
                                      {s===l.status && <span style={{ marginLeft:"auto", fontSize:"0.65rem", color:"#003366" }}>✓</span>}
                                    </button>
                                  );
                                })}
                              </div>
                              </>, document.body)}
                            </>
                          )}
                        </td>
                        <td>
                          {(() => {
                            const p = leadProg(l, taskTpl);
                            const col = l.status==="CANCELLED" ? "#dc2626" : p>=100 ? "#059669" : "#003366";
                            return (
                              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                <div style={{ flex:1, height:6, background:"#eef2f7", borderRadius:99, overflow:"hidden", minWidth:44 }}>
                                  <div className="bar-grow" style={{ height:"100%", width:`${p}%`, background:col, borderRadius:99 }} />
                                </div>
                                <span style={{ fontSize:"0.72rem", fontWeight:800, color:col, fontVariantNumeric:"tabular-nums", minWidth:30, textAlign:"right" }}>{p}%</span>
                              </div>
                            );
                          })()}
                        </td>
                        {(
                          <td className="num" style={{ fontSize:"0.8rem", fontWeight:700, color: มูลค่าลีด(l) == null ? "#cbd5e1" : "#2D2D2D" }}
                            title="ยอดใบเสนอราคาล่าสุด (ก่อน VAT)">
                            {fmtมูลค่าย่อ(มูลค่าลีด(l))}
                          </td>
                        )}
                        <td>
                          <AssigneeAvatars value={l.assigned} size={26} />
                        </td>
                        {!hiddenCols.includes("activity") && (
                          <td style={{ fontSize:"0.72rem", color:"#6b7280" }}>{lastActivity(l)}</td>
                        )}
                        {/* ── จัดการ: ปุ่มลัด (โทร / แก้ไข / ดูรายละเอียด) · WON = ป้ายลูกค้าแล้ว ── */}
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display:"flex", alignItems:"center", gap:5, justifyContent:"flex-end" }}>
                            {done && l.status==="PAID" && (
                              <span title="ปิดการขายแล้ว" style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:"0.62rem", fontWeight:700, color:"#059669", marginRight:2 }}>
                                <CheckCircle2 size={11} /> ลูกค้าแล้ว
                              </span>
                            )}
                            <button title="ดูรายละเอียด" onClick={()=>openPanel(l)}
                              style={{ width:28, height:28, borderRadius:7, border:"1px solid #dbe3ec", background:"#fff", color:"#003366", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <Eye size={13} />
                            </button>
                            {ลบได้(l) && <button title="ลบลูกค้าเป้าหมาย" onClick={async ()=>{
                              if (!(await ยืนยัน({ หัวข้อ: `ลบลูกค้าเป้าหมาย "${l.company}" ?`, รายละเอียด: "ย้อนกลับไม่ได้", ปุ่มตกลง: "ลบ", อันตราย: true }))) return;
                              removeLead(l.id); setToast("ลบลูกค้าเป้าหมายแล้ว");
                            }}
                              style={{ width:28, height:28, borderRadius:7, border:"1px solid #fecaca", background:"#fff", color:"#dc2626", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <Trash2 size={13} />
                            </button>}
                          </div>
                        </td>
                      </ClickableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={10 - COLS.filter(c => hiddenCols.includes(c.key)).length} style={{ padding:0 }}>
                      <EmptyState icon={<Users size={28} />} title="ไม่พบลูกค้าเป้าหมาย"
                        description="ลองปรับตัวกรอง หรือเพิ่มลูกค้าเป้าหมายรายใหม่เพื่อเริ่มการขาย"
                        action={<button className="btn btn-primary btn-md" onClick={()=>setShowAddForm(true)}><Plus size={14} /> เพิ่มลูกค้าเป้าหมาย</button>} />
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding:"11px 16px", borderTop:"1px solid #e5e7eb", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
              {/* Left: range summary */}
              <span style={{ fontSize:"0.72rem", color:"#374151" }}>
                แสดง {pageStart}–{pageEnd} จาก {filtered.length} รายการ
              </span>
              {/* Right: pagination controls */}
              <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <button
                    onClick={()=>setPage(p=>Math.max(1, p-1))}
                    disabled={page<=1}
                    style={{ display:"flex", alignItems:"center", gap:3, padding:"5px 11px", borderRadius:8,
                      border:"1px solid #e5e7eb", fontSize:"0.72rem", fontWeight:600,
                      background: page<=1 ? "#fafafa" : "#fff",
                      // #6b7280 (MUTED มาตรฐาน) แทน #C0C0C0 เดิม — contrast ต่ำกว่า WCAG AA มาก
                      // (ratio ~1.7 บนพื้น #fafafa) แทบมองไม่เห็นตัวหนังสือ (พบจาก /scenario 31 ก.ค. 69)
                      color: page<=1 ? "#6b7280" : "#003366",
                      cursor: page<=1 ? "not-allowed" : "pointer" }}>
                    <ChevronDown size={12} style={{ transform:"rotate(90deg)" }} /> ก่อนหน้า
                  </button>
                  <span style={{ fontSize:"0.72rem", fontWeight:700, color:"#374151", padding:"0 4px", whiteSpace:"nowrap" }}>
                    หน้า {page} / {totalPages}
                  </span>
                  <button
                    onClick={()=>setPage(p=>Math.min(totalPages, p+1))}
                    disabled={page>=totalPages}
                    style={{ display:"flex", alignItems:"center", gap:3, padding:"5px 11px", borderRadius:8,
                      border:"1px solid #e5e7eb", fontSize:"0.72rem", fontWeight:600,
                      background: page>=totalPages ? "#fafafa" : "#fff",
                      color: page>=totalPages ? "#6b7280" : "#003366",
                      cursor: page>=totalPages ? "not-allowed" : "pointer" }}>
                    ถัดไป <ChevronDown size={12} style={{ transform:"rotate(-90deg)" }} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── KANBAN VIEW — คอลัมน์ตามสถานะ · ลากการ์ดเพื่อเปลี่ยนสถานะ (รวม "เส้นทางการขาย") ── */}
        {view === "kanban" && (() => {
          const ACTIVE = ACTIVE_LEAD_STATUSES;
          // PAID ไม่มีคอลัมน์แล้ว — ปิดการขายสำเร็จจะย้ายไปหน้า "ลูกค้า" อัตโนมัติ
          const TERMINAL: LeadStatus[] = ["CANCELLED"];
          const renderColumn = (status: LeadStatus, wide: boolean) => {
            const col = filtered.filter(l => l.status === status);
            if (hideEmpty && col.length === 0) return null;
            const sc = leadStatusColor[status];
            const isOver = dragOver === status;
            const total = col.reduce((s, l) => s + (มูลค่าลีด(l) ?? 0), 0);
            const w = wide ? 300 : 264;
            return (
              <div key={status}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOver !== status) setDragOver(status); }}
                onDragLeave={() => setDragOver(o => o === status ? null : o)}
                onDrop={() => { หยุดเลื่อนกระดาน(); if (dragId) { void requestStatusChange(dragId, status); setDragId(null); } setDragOver(null); }}
                style={{ minWidth:w, width:w, flexShrink:0, display:"flex", flexDirection:"column",
                  // คอลัมน์ยาวลงมาเต็มพื้นที่จอเสมอ ไม่หดตามจำนวนการ์ด — คอลัมน์ว่างจึงยังเป็นเป้าให้ลากมาวางได้ชัด ๆ
                  // (เดิม alignSelf:"flex-start" ทำให้สูงพอดีเนื้อหา คอลัมน์ที่ยังไม่มีลูกค้าเป้าหมายเลยเหลือแค่แถบเตี้ย ๆ)
                  minHeight: ความสูงกระดาน ?? "max(360px, calc(100vh - 330px))",
                  background: isOver ? "#eaf1fb" : "#f6f7f9", borderRadius:12, padding:10,
                  border: isOver ? "1.5px dashed #003366" : "1.5px solid transparent", transition:"background .12s, border-color .12s" }}>
                {/* header */}
                <div style={{ padding:"7px 6px 11px", borderTop:`3px solid ${sc.text}`, marginBottom:2 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6 }}>
                    <span style={{ display:"inline-flex", alignItems:"center", gap:6, minWidth:0 }}>
                      <span style={{ width:9, height:9, borderRadius:"50%", background:sc.text, flexShrink:0 }} />
                      <span style={{ fontSize:"0.8rem", fontWeight:800, color:"#2D2D2D", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{leadStatusLabel[status]}</span>
                    </span>
                    <span className="badge" style={{ background:sc.bg, color:sc.text, flexShrink:0 }}>{col.length}</span>
                  </div>
                  {total > 0 && <div style={{ fontSize:"0.65rem", color:"#9ca3af", fontWeight:600, marginTop:3, fontVariantNumeric:"tabular-nums" }}>{fmtM(total)}</div>}
                </div>
                {/* cards */}
                <div style={{ display:"flex", flexDirection:"column", gap:10, minHeight:44, flex:1 }}>
                  {col.map(l => (
                    <div key={l.id} draggable
                      onDragStart={e => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", l.id);
                        // drag image เอง — ทึบ มีขอบกรม+เงา+เอียงเล็กน้อย ไม่ให้กลืนพื้นหลัง
                        const node = e.currentTarget as HTMLElement;
                        const ghost = node.cloneNode(true) as HTMLElement;
                        Object.assign(ghost.style, {
                          width: `${node.offsetWidth}px`, position:"absolute", top:"-9999px", left:"-9999px",
                          opacity:"1", background:"#fff", border:"2px solid #003366", borderRadius:"10px",
                          boxShadow:"0 14px 32px rgba(0,51,102,.32)", transform:"rotate(-2deg)", pointerEvents:"none",
                        } as CSSStyleDeclaration);
                        document.body.appendChild(ghost);
                        e.dataTransfer.setDragImage(ghost, 24, 22);
                        setTimeout(() => ghost.remove(), 0);
                        setDragId(l.id);
                      }}
                      onDragEnd={() => { setDragId(null); setDragOver(null); }}
                      onClick={() => openPanel(l)}
                      className="card"
                      style={{ padding:"12px 14px", cursor: dragId===l.id ? "grabbing" : "pointer", userSelect:"none", borderRadius:10,
                        opacity: dragId===l.id ? 0.5 : 1,
                        outline: dragId===l.id ? "2px dashed #94a9c9" : "none", outlineOffset: dragId===l.id ? "-1px" : 0,
                        boxShadow: dragId===l.id ? "none" : "0 1px 4px rgba(0,0,0,.05)", transition:"box-shadow .12s, transform .12s" }}
                      onMouseEnter={e => { if (dragId!==l.id) (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 14px rgba(0,51,102,.12)"; }}
                      onMouseLeave={e => { if (dragId!==l.id) (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,.05)"; }}>
                      {/* Sales-only — ไม่มีรูปอาคาร/building type (โฟกัสโอกาสการขายอย่างเดียว)
                          ไอคอนตา = แค่บอกใบ้ว่าคลิกการ์ดเปิดรายละเอียดได้ (การ์ดทั้งใบคลิกได้อยู่แล้ว เลยไม่ต้องมี onClick ซ้ำ)
                          เดิมไม่มี affordance เลย ผู้ใช้ที่ไม่คุ้น kanban อาจไม่รู้ว่าคลิกการ์ดได้ */}
                      {/* ── หัวการ์ด = ชื่อบริษัท (เดิมเป็นแม่แบบ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) ── */}
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:6 }}>
                        <div style={{ fontSize:"0.86rem", fontWeight:800, color:"#2D2D2D", minWidth:0,
                          display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden", lineHeight:1.35 }}
                          title={l.company}>
                          {l.company}
                        </div>
                        <Eye size={13} color="#9ca3af" style={{ flexShrink:0, marginTop:2 }} />
                      </div>
                      <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:6, margin:"6px 0" }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:"0.68rem", fontWeight:600, color:"#64748b",
                          background:"#f1f5f9", borderRadius:6, padding:"2px 8px", maxWidth:"100%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={l.contact}>
                          <User size={10} /> {l.contact}
                        </span>
                        <span style={{ display:"inline-flex", alignItems:"center", fontSize:"0.72rem", fontWeight:800, color:"#003366",
                          background:"#e3f0fb", borderRadius:6, padding:"2px 8px", fontVariantNumeric:"tabular-nums" }}>
                          {fmtมูลค่าเต็ม(มูลค่าลีด(l))}
                        </span>
                      </div>

                      {/* ข้อมูลติดต่อแบบแถวป้ายกำกับ + เตือนขาดการติดต่อ */}
                      <div style={{ display:"flex", flexDirection:"column", gap:3, fontSize:"0.68rem",
                        borderTop:"1px solid #f1f5f9", borderBottom:"1px solid #f1f5f9", padding:"7px 0", marginBottom:9 }}>
                        <CardField icon={Phone} label="โทรศัพท์" value={l.phone} />
                        <CardField icon={Mail} label="อีเมล" value={l.email} />
                        <CardField icon={MapPin} label="จังหวัด" value={l.province} />
                        <CardField icon={Calendar} label="สร้าง" value={l.createdAt} />
                        {(() => {
                          const d = daysSinceContact(l);
                          // ไม่เคยติดต่อ = "—" (ห้ามเดาว่าเพิ่งติดต่อ) · เกินกำหนดของสำนักงานใหญ่ = แดง
                          if (d === null) return <CardField icon={AlarmClock} label="ติดต่อล่าสุด" value={null} />;
                          const late = d > followUpAlertDays;
                          return <CardField icon={AlarmClock} label="ติดต่อล่าสุด" value={`${d} วันที่แล้ว`} tone={late ? "#DC3545" : undefined} />;
                        })()}
                      </div>

                      {/* มูลค่าย้ายไปเป็นป้ายด้านบนแล้ว (ตามระบบเดิม) — ตรงนี้เหลือผู้รับผิดชอบ ไม่แสดงซ้ำสองที่ */}
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-start", marginBottom:10 }}>
                        <AssigneeAvatars value={l.assigned} size={24} showName={false} />
                      </div>

                      {/* Progress + จำนวนงาน + กิจกรรมล่าสุด */}
                      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                        <div style={{ flex:1, height:5, background:"#eef2f7", borderRadius:99, overflow:"hidden" }}>
                          <div className="bar-grow" style={{ height:"100%", width:`${leadProg(l, taskTpl)}%`, background:"#003366", borderRadius:99 }} />
                        </div>
                        <span style={{ fontSize:"0.65rem", fontWeight:700, color:"#6b7280", fontVariantNumeric:"tabular-nums" }}>{leadProg(l, taskTpl)}%</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:"0.65rem", color:"#9ca3af", fontWeight:600 }}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                          <CheckSquare size={10} /> {leadTaskCount(l, taskTpl).done}/{leadTaskCount(l, taskTpl).total} งาน
                        </span>
                        {lastActivity(l) !== "—" && (
                          <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                            <CalendarClock size={10} /> {lastActivity(l)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* ── ช่องวางการ์ด ───────────────────────────────────────────────
                      ลากการ์ดมาค้างไว้เหนือคอลัมน์ = โชว์ช่องวาง "ท้ายรายการ" ให้เห็นชัดว่าการ์ดจะไปอยู่ตรงไหน
                      (บอสสั่ง 20 ส.ค. 69 — เดิมคอลัมน์ที่มีการ์ดอยู่แล้วไม่มีช่องวางเลย
                       ส่วนคอลัมน์ว่างก็ลอยอยู่กลางช่อง ไม่ตรงกับตำแหน่งที่การ์ดจะตกจริง) */}
                  {isOver && col.length > 0 && (
                    <div style={{ height:60, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"0.65rem", color:"#003366", border:"1.5px dashed #003366", borderRadius:10, background:"#eaf1fb" }}>
                      วางการ์ดที่นี่
                    </div>
                  )}
                  {col.length === 0 && (
                    <div style={{ flex:1, display:"flex", alignItems:"flex-end", justifyContent:"center", padding: isOver ? "16px 6px 28px" : "16px 6px", fontSize:"0.65rem", color: isOver ? "#003366" : "#c7ccd3", border:`1.5px dashed ${isOver ? "#003366" : "#e5e7eb"}`, borderRadius:10, background: isOver ? "#eaf1fb" : undefined, transition:"padding .12s" }}>วางการ์ดที่นี่</div>
                  )}
                </div>
              </div>
            );
          };
          return (
            <div ref={กระดานRef}
              onDrop={หยุดเลื่อนกระดาน}
              style={{ display:"flex", gap:16, overflowX:"auto", paddingBottom:10, alignItems:"stretch" }}>
              {ACTIVE.map(s => renderColumn(s, true))}
              {/* เส้นคั่นก่อนกลุ่มปิดการขาย (ปิดการขายสำเร็จ/ปิดการขายไม่สำเร็จ) — หัวคอลัมน์ตรงแนวเดียวกัน */}
              <div style={{ width:1, alignSelf:"stretch", background:"#e5e7eb", flexShrink:0, margin:"2px 0" }} />
              {TERMINAL.map(s => renderColumn(s, false))}
            </div>
          );
        })()}

      </div>

      {/* hidden file input */}
      <input ref={fileInputRef} type="file" aria-label="แนบไฟล์เข้าลูกค้าเป้าหมาย" style={{ display:"none" }} onChange={handleFileSelect} />

      {/* Field edit popup */}
      {popupField && editPopupPos && (
        <>
          <div onClick={closeFieldPopup}
            style={{ position:"fixed", inset:0, zIndex:200 }} />
          <div style={{ position:"fixed", top:editPopupPos.top, left:editPopupPos.left,
            zIndex:201, background:"#fff", borderRadius:14, border:"1px solid #e5e7eb",
            boxShadow:"0 8px 32px rgba(0,0,0,.18)", padding:"18px 20px", width:300 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <span style={{ fontSize:"0.86rem", fontWeight:700, color:"#2D2D2D" }}>{editPopupLabel}</span>
              <button onClick={closeFieldPopup}
                style={{ width:28, height:28, borderRadius:8, border:"1px solid #e5e7eb",
                  background:"#f8f9fb", cursor:"pointer", display:"flex", alignItems:"center",
                  justifyContent:"center", color:"#374151", padding:0 }}>
                <X size={13}/>
              </button>
            </div>
            {editPopupOptions ? (
              <select autoFocus
                aria-label={editPopupLabel}
                value={editPopupVal}
                onChange={e=>setEditPopupVal(e.target.value)}
                style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:9,
                  padding:"9px 12px", fontSize:"0.8rem", outline:"none", color:"#2D2D2D",
                  marginBottom:12, background:"#fff", cursor:"pointer",
                  boxSizing:"border-box" as const }}>
                {editPopupOptions.map(o=><option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input autoFocus
                aria-label={editPopupLabel}
                type={editPopupType}
                value={editPopupVal}
                onChange={e=>setEditPopupVal(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") commitFieldPopup(); if(e.key==="Escape") closeFieldPopup(); }}
                style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:9,
                  padding:"9px 12px", fontSize:"0.8rem", outline:"none", color:"#2D2D2D",
                  marginBottom:12, boxSizing:"border-box" as const }} />
            )}
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button onClick={commitFieldPopup} className="btn btn-primary btn-md">
                อัปเดต
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add lead modal */}
      {showAddForm && (
        <LeadFormModal
          onClose={()=>setShowAddForm(false)}
          onSave={async (l)=>{
            // num_id ออกจากตัวนับ atomic ของ DB (M7) — เลิก Math.max+1 ฝั่ง client ที่ชนกันได้
            // เมื่อสร้างลูกค้าเป้าหมายพร้อมกันในสาขาเดียว · id ที่แสดง (#L-…) derive จาก num_id นี้
            const nid = await newLeadNumId();
            // สร้าง "รายงานการติดตาม" + "Report Checklist (Task)" อัตโนมัติทุกครั้งที่สร้าง Lead
            // createdAt ต้องมีตั้งแต่ตอนสร้าง — ไม่มีแล้วหน้าไหนก็โชว์ "สร้างเมื่อ —"
            // และ leadCreatedDate() จะไปสังเคราะห์วันจาก numId แทน (ได้วันย้อนหลังหลายเดือน)
            // ติด dealerCode ของสาขาที่ล็อกอิน → ลูกค้าเป้าหมายใหม่เป็นของสาขานั้น (multi-tenant) ไม่ตกเป็นของ CNX
            const withIds = { ...l, dealerCode: currentDealer.code, numId: nid, id: `#L-${40321 + nid}`, createdAt: l.createdAt || thaiDateStr(APP_NOW) };
            addLead({
              ...withIds,
              report: l.report || buildLeadReport(withIds, thaiDateStr(APP_NOW)),
              // ดีลเลอร์สร้างลูกค้าเป้าหมายหลังติดต่อลูกค้าแล้ว → ติ๊กงานให้ถึงสถานะที่เลือก (เริ่มต้น "ติดต่อแล้ว" = ติ๊กงานติดต่อแล้ว/เก็บข้อมูลลูกค้า)
              tasks: l.tasks?.length ? l.tasks : seedLeadTasks(l.status, l.assigned || "—", 30, taskTpl),
            });
          }}
          persons={personsList}
        />
      )}

      {/* เลือกเหตุผลก่อนปิดการขายไม่สำเร็จ — จากตาราง/Kanban (บังคับเลือกเหมือนปุ่มในแผงลูกค้าเป้าหมาย) */}
      {pendingLostId && (
        <>
          <div onClick={()=>setPendingLostId(null)} style={{ position:"fixed", inset:0, background:"rgba(45,45,45,.5)", zIndex:230 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:240, width:420, maxWidth:"calc(100vw - 32px)", background:"#fff", borderRadius:16, overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,.3)" }}>
            <div style={{ padding:"14px 18px", borderBottom:"1px solid #f0f4f8", display:"flex", alignItems:"center", gap:9 }}>
              <XCircle size={17} color="#dc2626" /><span style={{ fontSize:"0.9rem", fontWeight:800, color:"#dc2626" }}>ปิดการขายไม่สำเร็จ</span>
            </div>
            <div style={{ padding:"16px 18px" }}>
              {lostReasons.includes(pendingLostReason) || pendingLostReason === "" ? (
                <>
                  <div style={{ fontSize:"0.75rem", color:"#6b7280", marginBottom:10 }}>เลือกเหตุผลที่ปิดการขายไม่ได้</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {/* ⚠️ "อื่นๆ (ระบุเอง)" อยู่ในรายการที่สำนักงานใหญ่ตั้งไว้แล้ว (บอสสั่ง 21 ส.ค. 69)
                        กดตัวนี้ = เปิดโหมดพิมพ์เอง ไม่ใช่บันทึกคำว่า "อื่นๆ" ลงไปตรง ๆ
                        กติกาเดียวกับแท็บงาน (LeadTasks) — ห้ามมีปุ่มซ้ำสองอันในจอเดียว */}
                    {lostReasons.map(r => (
                      <button key={r} onClick={()=>setPendingLostReason(r === OTHER_REASON_OPTION ? OTHER_LOST_REASON : r)}
                        style={{ padding:"8px 10px", borderRadius:9, border:`1px solid ${pendingLostReason===r?"#dc2626":"#e5e7eb"}`,
                          background:pendingLostReason===r?"#fef2f2":"#fff", color:pendingLostReason===r?"#dc2626":"#374151",
                          fontSize:"0.76rem", fontWeight:700, cursor:"pointer", textAlign:"left" }}>
                        {r}
                      </button>
                    ))}
                    {/* เหตุผลจริงไม่ตรงกับรายการที่ HQ กำหนดเลย → กรอกเองได้ (บอสสั่ง 31 ก.ค. 69)
                        โผล่เฉพาะตอนที่รายการยังไม่มีตัวเลือกนี้ ไม่งั้นจะมีปุ่มชื่อเดียวกันสองอัน */}
                    {!lostReasons.includes(OTHER_REASON_OPTION) && (
                      <button onClick={()=>setPendingLostReason(OTHER_LOST_REASON)}
                        style={{ padding:"8px 10px", borderRadius:9, border:"1px dashed #9ca3af",
                          background:"#fafafa", color:"#6b7280", fontSize:"0.76rem", fontWeight:700, cursor:"pointer", textAlign:"left" }}>
                        {OTHER_REASON_OPTION}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize:"0.75rem", color:"#6b7280", marginBottom:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <span>ระบุเหตุผลที่ปิดการขายไม่ได้</span>
                    <button type="button" onClick={()=>setPendingLostReason("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#003366", fontSize:"0.72rem", fontWeight:700 }}>← กลับไปเลือกจากรายการ</button>
                  </div>
                  <input autoFocus value={pendingLostReason === OTHER_LOST_REASON ? "" : pendingLostReason} onChange={e=>setPendingLostReason(e.target.value)} placeholder="พิมพ์เหตุผล…"
                    style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:9, padding:"9px 12px", fontSize:"0.82rem", color:"#2D2D2D", outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} />
                </>
              )}
            </div>
            <div style={{ padding:"12px 18px", borderTop:"1px solid #f0f4f8", display:"flex", justifyContent:"flex-end", gap:8, background:"#fafafa" }}>
              <button onClick={()=>setPendingLostId(null)} className="btn btn-secondary btn-md">ยกเลิก</button>
              <button onClick={confirmPendingLost} disabled={!pendingLostReason.trim() || pendingLostReason===OTHER_LOST_REASON} className="btn btn-md"
                style={{ background:"#dc2626", color:"#fff", opacity:pendingLostReason.trim() && pendingLostReason!==OTHER_LOST_REASON ?1:0.5, cursor:pendingLostReason.trim() && pendingLostReason!==OTHER_LOST_REASON ?"pointer":"not-allowed" }}>
                ยืนยันปิดการขาย
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm dialog */}
      {showDeleteConfirm && selectedLead && (
        <>
          <div onClick={()=>setShowDeleteConfirm(false)}
            style={{ position:"fixed", inset:0, background:"rgba(45,45,45,.45)", zIndex:1120 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:1121,
            background:"#fff", borderRadius:16, border:"1px solid #e5e7eb",
            boxShadow:"0 24px 80px rgba(0,0,0,.2)", width:"100%", maxWidth:380, padding:24 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <span style={{ width:38, height:38, borderRadius:"50%", background:"#fee2e2",
                display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <Trash2 size={17} color="#dc2626" />
              </span>
              <div style={{ fontSize:"1rem", fontWeight:800, color:"#2D2D2D" }}>ลบลูกค้าเป้าหมาย</div>
            </div>
            <p style={{ fontSize:"0.8rem", color:"#6b7280", lineHeight:1.6, margin:"0 0 20px" }}>
              ต้องการลบ <strong style={{ color:"#2D2D2D" }}>{selectedLead.company}</strong> ({selectedLead.id}) หรือไม่?
              การลบไม่สามารถย้อนกลับได้
            </p>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={()=>setShowDeleteConfirm(false)}
                style={{ padding:"9px 20px", borderRadius:9, border:"1px solid #e5e7eb",
                  background:"#fff", color:"#374151", fontSize:"0.8rem", fontWeight:600, cursor:"pointer" }}>
                ยกเลิก
              </button>
              <button onClick={deleteLead}
                style={{ padding:"9px 22px", borderRadius:9, border:"none",
                  background:"#dc2626", color:"#fff", fontSize:"0.8rem", fontWeight:700, cursor:"pointer",
                  display:"flex", alignItems:"center", gap:6 }}>
                <Trash2 size={13} /> ลบ
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ DETAIL MODAL (2-column, navy header — same as customers) ═══ */}
      {selectedLead && current && (() => {
        const c = current;
        const sc = leadStatusColor[c.status];
        const cInitials = (c.company || c.name).replace(/บจ\.|หจก\./g, "").trim().slice(0, 2) || "—";
        // ── ไทม์ไลน์ = "ทุกอย่างที่ทำกับดีลนี้" ตั้งแต่ต้นจนถึงตอนนี้ (บอสสั่ง 21 ส.ค. 69) ──
        //
        // ⚠️ ต้อง "รวม" สองแหล่ง ไม่ใช่เลือกอย่างใดอย่างหนึ่ง (บั๊กจริง — บอสเห็นกิจกรรมเหลือบรรทัดเดียว):
        //   1) กิจกรรมที่ระบบบันทึกไว้ (ออกใบ/ส่งใบ/แก้ใบ/นัดหมาย/เปลี่ยนขั้น)
        //   2) งานในเช็กลิสต์ที่ติ๊กเสร็จไปแล้ว — ของเก่าที่ทำก่อนระบบจะเริ่มบันทึกกิจกรรม
        //   เดิมเขียนว่า "ถ้ามี (1) ให้ใช้ (1) อย่างเดียว" → พอมีกิจกรรมใหม่แค่บรรทัดเดียว
        //   ประวัติการทำงานทั้งหมดก่อนหน้านั้นก็หายไปจากหน้าจอทันที
        // กันซ้ำ: ถ้างานนั้นถูกบันทึกเป็นกิจกรรมไว้แล้ว (ข้อความมีชื่องาน) ไม่ต้องเติมซ้ำอีก
        const บันทึกไว้ = c.activities ?? [];
        const จากงาน = seedActivities(c).filter(g =>
          !บันทึกไว้.some(a => String(a.text ?? "").includes(g.text.split(" · ")[0])));
        const activities = [...บันทึกไว้, ...จากงาน]
          .sort((a, b) => {
            const เวลา = (x: { date?: string; id?: number }) => {
              const t = Date.parse(String(x.date ?? ""));
              return Number.isFinite(t) ? t : 0;
            };
            // ล่าสุดขึ้นก่อน (บอสสั่ง 21 ก.ย. 69)
            const ต่าง = เวลา(b) - เวลา(a);
            // วันเดียวกัน/อ่านวันไม่ออก (ป้ายวันแบบไทย) → ที่บันทึกทีหลัง (id มากกว่า) ขึ้นก่อน
            return ต่าง !== 0 ? ต่าง : (Number((b as { id?: number }).id ?? 0) - Number((a as { id?: number }).id ?? 0));
          });
        const drawerFiles = myFiles;
        // เป็นลูกค้าเมื่อปิดการขายสำเร็จ (WON) เท่านั้น — mock บางลูกค้าเป้าหมายมี customerId ผูกไว้แต่ยังไม่ WON จึงไม่นับ
        const isCustomer = c.status === "PAID";

        const detailTabs = [
          { key: "overview",   label: "ภาพรวม" },
          { key: "tasks",      label: "งาน/ความคืบหน้า" },
          { key: "report",     label: "รายงานติดตาม" },
          { key: "activities", label: "กิจกรรม" },
          { key: "appts",      label: "นัดหมาย" },
          { key: "quotation",  label: "ใบเสนอราคา" },
          { key: "files",      label: "ไฟล์" },
        ] as const;

        // ── Tab: นัดหมาย — นัดกับลูกค้าเป้าหมายก่อนปิดการขาย (แสดงในปฏิทิน+แจ้งเตือนด้วย) ──
        const leadAppts = appointments.filter(a => a.leadId === c.numId)
          .slice().sort((a, b) => (a.date + a.time) < (b.date + b.time) ? 1 : -1);
        const saveAppt = async () => {
          if (apptSavingRef.current) return; // กันกดซ้ำระหว่างรอเลขนัดจาก DB (H8)
          if (!apptForm.type) { setApptErr("เลือกประเภทนัดหมายก่อนบันทึก"); return; }
          setApptErr("");
          apptSavingRef.current = true; setApptSaving(true);
          try {
          addAppointment({
            id: await newAppointmentId(), // เลขจาก DB แบบ atomic — เดิมใช้ max+1 ของชุดที่โหลดมา
            leadId: c.numId,
            company: c.company, contact: c.contact ?? "", phone: c.phone ?? "", province: c.province ?? "",
            project: apptForm.title.trim() || apptTypeLabel[apptForm.type as ApptType],
            buildingType: "", // ไม่คัดลอกแม่แบบเก่าของลูกค้าเป้าหมาย (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
            // ⚠️ เดิมใส่ 0 ตายตัว ทั้งที่ช่องอื่นคัดลอกจากลูกค้าเป้าหมายหมด (แก้ 10 ส.ค. 69)
            //   นัดหมายจึงบันทึกพื้นที่เป็น 0 เสมอ แม้ลูกค้าเป้าหมายจะระบุไว้ 800 ตร.ม. ก็ตาม
            area: c.area ?? 0,
            date: apptForm.date, time: apptForm.time, type: apptForm.type as ApptType,
            assigned: c.assigned || session.name, status: "upcoming", note: apptForm.note.trim(),
          });
          setApptForm({ type: "visit", date: APP_NOW_ISO, time: "10:00", title: "", note: "" });
          setApptAdding(false);
          // ติ๊กงาน "นัดหมาย" ให้เอง — ตัวจริงอยู่ที่ SalesContext.addAppointment แล้ว
          // (ลงนัดจากปฏิทินก็ต้องติ๊กเหมือนกัน จึงย้ายไปไว้ที่เดียว · 3 ก.ย. 69)
          const apptDef = findAppointmentTask(taskTpl);
          const ติ๊กให้ = apptDef && c.status !== "PAID" && c.status !== "CANCELLED"
            && !applyTaskTemplate(c.tasks, taskTpl, c.status).find(t => t.key === apptDef.key)?.done
            ? apptDef.label : "";
          setToast(ติ๊กให้ ? `บันทึกนัดหมายแล้ว · ติ๊กงาน “${ติ๊กให้}” ให้อัตโนมัติ` : "บันทึกนัดหมายแล้ว");
          } finally { apptSavingRef.current = false; setApptSaving(false); }
        };
        const aInp: React.CSSProperties = { width:"100%", border:"1px solid #e5e7eb", borderRadius:9, padding:"8px 11px", fontSize:"0.8rem", color:"#2D2D2D", outline:"none", boxSizing:"border-box", fontFamily:"inherit", background:"#fff" };
        const aLbl: React.CSSProperties = { display:"block", fontSize:"0.65rem", fontWeight:700, color:"#6b7280", marginBottom:5 };
        const tabAppts = (
          <DrawerSection title="นัดหมาย">
            {!apptAdding ? (
              <button onClick={() => setApptAdding(true)} className="btn btn-primary btn-sm" style={{ marginBottom:12 }}>
                <Plus size={13} /> เพิ่มนัดหมาย
              </button>
            ) : (
              <div style={{ border:"1px solid #e5e7eb", borderRadius:12, padding:14, marginBottom:12, background:"#fafbfc" }}>
                <div style={{ fontSize:"0.8rem", fontWeight:800, color:"#2D2D2D", marginBottom:12 }}>นัดหมายใหม่ · {c.company}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div className="col-full">
                    <label style={aLbl}>ประเภทนัดหมาย</label>
                    <select aria-label="ประเภทนัดหมาย" value={apptForm.type} onChange={e => setApptForm(f => ({ ...f, type: e.target.value as ApptType | "" }))} style={aInp}>
                      <option value="">— ยังไม่ระบุ —</option>
                      {(Object.keys(apptTypeLabel) as ApptType[]).map(t => <option key={t} value={t}>{apptTypeLabel[t]}</option>)}
                    </select>
                  </div>
                  <div><label style={aLbl}>วันที่</label>
                    <input type="date" value={apptForm.date} onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))} style={aInp} /></div>
                  <div><label style={aLbl}>เวลา</label>
                    <input type="time" value={apptForm.time} onChange={e => setApptForm(f => ({ ...f, time: e.target.value }))} style={aInp} /></div>
                  <div className="col-full"><label style={aLbl}>หัวข้อ</label>
                    <input value={apptForm.title} onChange={e => setApptForm(f => ({ ...f, title: e.target.value }))} placeholder={apptForm.type ? apptTypeLabel[apptForm.type] : "หัวข้อนัดหมาย"} style={aInp} /></div>
                  <div className="col-full"><label style={aLbl}>รายละเอียด</label>
                    <input value={apptForm.note} onChange={e => setApptForm(f => ({ ...f, note: e.target.value }))} placeholder="บันทึกเพิ่มเติม" style={aInp} /></div>
                </div>
                {apptErr && <div role="alert" style={{ fontSize:"0.72rem", color:"#B91C1C", marginTop:8 }}>{apptErr}</div>}
                <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
                  <button onClick={() => setApptAdding(false)} className="btn btn-secondary btn-sm">ยกเลิก</button>
                  <button onClick={saveAppt} disabled={apptSaving} className="btn btn-primary btn-sm" style={apptSaving ? { opacity: .6, cursor: "not-allowed" } : undefined}><Check size={13} /> บันทึกนัดหมาย</button>
                </div>
                <div style={{ fontSize:"0.65rem", color:"#9ca3af", marginTop:8 }}>ผู้รับผิดชอบ: {c.assigned || session.name} · นัดหมายจะแสดงในปฏิทินด้วย</div>
              </div>
            )}
            {leadAppts.length === 0 ? (
              <div style={{ color:"#9aa2ad", fontSize:"0.8rem", padding:"18px 0", textAlign:"center" }}>ยังไม่มีนัดหมาย</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {leadAppts.map(a => (
                  <div key={a.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", borderRadius:10, background:"#f8f9fb", border:"1px solid #eef0f4" }}>
                    <span style={{ width:32, height:32, borderRadius:"50%", background:"#e7eef7", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Calendar size={15} color="#003366" /></span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:"0.8rem", fontWeight:700, color:"#2D2D2D" }}>{a.project}</div>
                      <div style={{ fontSize:"0.65rem", color:"#6b7280", marginTop:2 }}>{apptTypeLabel[a.type]} · {fmtISOToThai(a.date)} · {a.time} น.</div>
                    </div>
                    <span className="badge" style={{ flexShrink:0, background:"#dce5f0", color:"#003366" }}>
                      {a.status === "upcoming" ? "กำลังจะมาถึง" : a.status === "done" ? "เสร็จแล้ว" : "ยกเลิก"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
        );

        // ── Tab: งาน/ความคืบหน้า (Task-driven) — เช็กแล้วเลื่อน Stage อัตโนมัติ ──
        const tabTasks = (
          // ผู้ทำงาน = ผู้รับผิดชอบของลูกค้าเป้าหมายนั้น (ไม่ใช่บัญชีดีลเลอร์ที่ล็อกอิน)
          // งาน "จัดทำใบเสนอราคา" ติ๊กเองไม่ได้ถ้ายังไม่มีใบ — ส่ง onRequestQuotation ไปพาออกใบแทน
          <LeadTasks lead={c} performedBy={c.assigned || session.name} onSave={saveLead}
            // งาน "นัดหมาย" ก็ต้องมีของจริงเหมือนงานที่ต้องมีใบเสนอราคา (บอสสั่ง 20 ส.ค. 69)
            //   ยังไม่เคยลงนัดกับลูกค้าเป้าหมายรายนี้ = ติ๊กเองไม่ได้ → พาไปลงนัดจริง
            //   พอบันทึกนัดเสร็จ ระบบติ๊กงานให้เอง (ดูตัวติ๊กอัตโนมัติในแท็บนัดหมาย)
            onRequestAppointment={() => {
              const มีนัดแล้ว = appointments.some(a => a.leadId === c.numId && a.status !== "cancelled");
              if (มีนัดแล้ว) return false;   // มีนัดจริงแล้ว → ติ๊กได้ตามปกติ
              // ⚠️ ต้องสลับทั้งสองแท็บ (แก้ 25 ส.ค. 69) — เดิมสั่งแค่ setDTab
              //    ผู้ใช้จึงกดติ๊กแล้ว "ไม่มีอะไรเกิดขึ้น" เพราะฟอร์มไปเปิดอยู่ในแท็บที่ยังไม่ได้เปิดดู
              //    (ทางที่ถูกอยู่ในฟังก์ชัน พาไปทำงาน() อยู่แล้ว — ตรงนี้ลอกมาไม่ครบ)
              setActiveTab("appts"); setDTab("timeline"); setApptAdding(true);
              // เลื่อนจอไปที่ฟอร์มให้เห็นเลย ไม่ต้องหาเอง
              setTimeout(() => rightApptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
              setToast("ติ๊กงานนี้เองไม่ได้ — ลงนัดหมายจริงก่อน แล้วระบบจะติ๊กให้เอง");
              return true;
            }}
            onRequestQuotation={taskKey => {
              if (!quotationsReady) { setToast("กำลังโหลดใบเสนอราคาอยู่ — รอสักครู่แล้วกดใหม่อีกครั้ง"); return true; }
              const mine = quotations.filter(q => quoteBelongsToLead(q, c));
              // ยังไม่มีใบเลย → พาไปออกใบ (ทั้งงาน "จัดทำ" และ "ส่ง" ต้องมีใบก่อนทั้งคู่)
              if (!mine.length) {
                openQuotationForm(c);
                setToast("ติ๊กงานนี้เองไม่ได้ — ออกใบเสนอราคาจริงแล้วระบบจะติ๊กให้เอง");
                return true;
              }
              // มีใบแล้วแต่ยังไม่เคยส่งถึงลูกค้า → พาไปที่รายการใบ ให้กดปุ่มส่งของใบนั้น
              if (taskKey === "sendQuote" && mine.every(q => q.status === "draft")) {
                openQuotationList(c);
                setToast("ติ๊กงานนี้เองไม่ได้ — กดปุ่มส่งใบเสนอราคาในรายการ แล้วระบบจะติ๊กให้เอง");
                return true;
              }
              return false; // ของจริงมีแล้ว → ติ๊กได้ตามปกติ
            }}
            // ปิดการขายสำเร็จต้องมีใบที่ส่งถึงลูกค้าแล้วเสมอ (บอสสั่ง 19 ส.ค. 69)
            //   เดิมกดได้งานได้ตั้งแต่ขั้นแรก → ได้ลูกค้ายอดสะสม ฿0 ปนในฐาน อัตราปิดการขายก็เพี้ยน
            //   กติกาเดียวกับด่านของขั้น "เสนอราคา" ที่บังคับว่าต้องมีใบจริงก่อน
            whyCannotWin={() => {
              if (!quotationsReady) return "กำลังโหลดใบเสนอราคา — รอสักครู่";
              const mine = quotations.filter(q => quoteBelongsToLead(q, c));
              if (!mine.length) return "ยังปิดการขายไม่ได้ — ต้องออกใบเสนอราคาและส่งให้ลูกค้าก่อน";
              if (mine.every(q => q.status === "draft")) return "ยังปิดการขายไม่ได้ — ใบเสนอราคายังเป็นร่าง กดส่งให้ลูกค้าก่อน";
              return "";
            }} />
        );

        // ── Tab: รายงานการติดตาม (Lead Report) — แก้ไข/เพิ่ม/ลบได้ทั้งหมด ──
        const tabReport = (
          <ReportEditor lead={c} onSave={saveLead} />
        );

        // แท็บภาพรวมแบบอ่านอย่างเดียว (tabOverview) ถูกลบ — การ์ด "ข้อมูลลูกค้า (Overview)"
        // เรนเดอร์ OverviewEditor ตรง ๆ แล้ว (แก้ไขในที่เดิมได้ตลอด ไม่มีปุ่มสลับโหมด — บอสสั่ง 17 ก.ค. 69)

        // ── Tab: กิจกรรม (Activities) — ไทม์ไลน์ ไอคอนตามประเภท + empty state ──
        const ACT_ICON: Record<string, { Icon: typeof Phone; color: string; bg: string }> = {
          call:    { Icon: Phone,        color: "#003366", bg: "#e7eef7" },
          email:   { Icon: Mail,         color: "#0369a1", bg: "#e0f2fe" },
          meeting: { Icon: Users,        color: "#4338ca", bg: "#e0e7ff" },
          doc:     { Icon: FileText,     color: "#b45309", bg: "#fef3e2" },
          note:    { Icon: StickyNote,   color: "#6b7280", bg: "#f0f0f5" },
          task:    { Icon: CheckCircle2, color: "#059669", bg: "#e6f6ef" },
        };
        const tabActivities = (
          <DrawerSection title="กิจกรรม">
            {activities.length === 0 ? (
              <div style={{ color:"#9aa2ad", fontSize:"0.8rem", padding:"22px 0", textAlign:"center" }}>
                <MessageSquare size={26} color="#C0C0C0" style={{ marginBottom:8 }} />
                <div>ยังไม่มีกิจกรรม</div>
                <div style={{ fontSize:"0.72rem", marginTop:3 }}>กิจกรรมจะถูกบันทึกอัตโนมัติเมื่อทำงานในแท็บ “งาน/ความคืบหน้า”</div>
              </div>
            ) : (
              <div style={{ position:"relative", display:"flex", flexDirection:"column", gap:2 }}>
                {activities.map((a,i) => {
                  const meta = ACT_ICON[(a as { type?: string }).type ?? "task"] ?? ACT_ICON.task;
                  const last = i === activities.length - 1;
                  return (
                    <div key={i} style={{ display:"flex", gap:11, position:"relative" }}>
                      {/* เส้นไทม์ไลน์ + จุดไอคอน */}
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
                        <div style={{ width:28, height:28, borderRadius:"50%", background:meta.bg,
                          display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <meta.Icon size={14} color={meta.color} />
                        </div>
                        {!last && <div style={{ width:2, flex:1, minHeight:14, background:"#eef1f5" }} />}
                      </div>
                      <div style={{ minWidth:0, paddingBottom:last ? 0 : 12 }}>
                        <div style={{ fontSize:"0.8rem", color:"#2D2D2D", fontWeight:600, lineHeight:1.4 }}>{a.text}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:"0.65rem", color:"#6b7280", marginTop:3 }}>
                          <CalendarClock size={11} /> {a.date}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DrawerSection>
        );

        // ── Tab: ใบเสนอราคา (Quotation) ──
        // ── Tab: ใบเสนอราคา — สร้าง/แก้/ดู/พิมพ์/ทำสำเนา/ลบ inline (ไม่ออกจากหน้า) ──
        const tabQuotation = (
          <DrawerSection title="ใบเสนอราคา">
            {/* ราคาจากสำนักงานใหญ่ (Flow ใหม่ · ขั้น 3) — ส่งคำขอ / ยกเลิก / ขอแก้ราคา · ฐานข้อมูลขยับสถานะเอง */}
            <QuoteRequestPanel lead={c} onChanged={() => void syncLeadFromServer(c.id)} openSignal={reqSignal} />
            <LeadQuotationsPanel lead={c} onToast={setToast} openCreateSignal={quoteFormSignal} />
          </DrawerSection>
        );

        // ── Tab: ไฟล์ (Files) ──
        const tabFiles = (
          <DrawerSection title="ไฟล์">
            {drawerFiles.length === 0 ? (
              <div style={{ color:"#9aa2ad", fontSize:"0.8rem", padding:"18px 0", textAlign:"center" }}>
                ยังไม่มีไฟล์แนบ
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {drawerFiles.map(file => (
                  <button key={file.id} type="button" onClick={()=>setPreviewFile(file)} title="กดเพื่อดูไฟล์"
                    className="file-row" style={{ display:"flex", alignItems:"center", gap:8, textAlign:"left",
                    padding:"8px 10px", borderRadius:8, background:"#fafafa", border:"1px solid #f0f4f8", cursor:"pointer", width:"100%" }}>
                    <Paperclip size={13} color="#C0C0C0" />
                    <span style={{ flex:1, fontSize:"0.8rem", color:"#2D2D2D", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{file.name}</span>
                    <Eye size={13} color="#003366" />
                  </button>
                ))}
              </div>
            )}
            <button onClick={()=>fileInputRef.current?.click()} className="btn btn-primary btn-sm" style={{ marginTop:12 }}>
              <Plus size={13} /> เพิ่มไฟล์แนบ
            </button>
          </DrawerSection>
        );

        // ── สรุป/เมตริก + การกระทำด่วน (Lead Detail split layout) ──
        const cardStyle: React.CSSProperties = { background:"#fff", border:"1px solid #eef1f5", borderRadius:14, padding:16 };
        const secLabel: React.CSSProperties = { display:"flex", alignItems:"center", gap:6, fontSize:"0.62rem", fontWeight:800, color:"#8a929c", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 };
        const qa: React.CSSProperties = { background:"rgba(255,255,255,.15)", border:"none", borderRadius:8, height:30, padding:"0 11px", cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", gap:6, fontSize:"0.72rem", fontWeight:600, fontFamily:"inherit", whiteSpace:"nowrap" };
        const progressPct = leadProg(c, taskTpl);
        const scrollTo = (r: React.RefObject<HTMLDivElement|null>) => r.current?.scrollIntoView({ behavior:"smooth", block:"nearest" });
        // ย้อนกลับไม่ได้ (สร้างลูกค้าทันที) — ต้องยืนยันก่อนเสมอ เหมือนช่องทางอื่น (ดรอปดาวน์สถานะ)

        return (
          <>
            {/* Backdrop */}
            <div onClick={closePanel} className="drawer-overlay"
              style={{ position:"fixed", inset:0, background:"rgba(45,45,45,.45)", zIndex:200 }} />

            {/* Lead Detail — แผงกลางจอ · คอลัมน์เดียว (Overview / Tasks / Quotation / Timeline) */}
            <div className="modal-pop" style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
              width:820, maxWidth:"calc(100vw - 24px)", height:"min(920px, calc(100vh - 24px))",
              zIndex:210, background:"#fff", boxShadow:"0 30px 90px rgba(0,0,0,.32)", borderRadius:18,
              display:"flex", flexDirection:"column", overflow:"hidden" }}>

              {/* Sticky navy header + quick actions */}
              <div style={{ background:"#003366", padding:"14px 20px", flexShrink:0 }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:14, flexWrap:"wrap" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                    <div style={{ width:46, height:46, borderRadius:13, background:"rgba(255,255,255,.18)",
                      display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", overflow:"hidden",
                      fontWeight:800, fontSize:"1rem", border:"2px solid rgba(255,255,255,.25)", flexShrink:0 }}>
                      {c.logo ? <img src={c.logo} alt="โลโก้" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : cInitials}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:"1.12rem", fontWeight:800, color:"#fff", lineHeight:1.2 }}>{c.company || c.name}</div>
                      {/* หัวแผงบอกแค่ว่า "นี่คือใคร ที่ไหน" — โทรศัพท์/อีเมล/วันที่สร้าง ตัดออกแล้ว
                          เพราะซ้ำกับการ์ด "ข้อมูลลูกค้า (OVERVIEW)" ในแท็บภาพรวมที่มีครบกว่า (มีแหล่งที่มา/ผู้รับผิดชอบ/ติดต่อล่าสุดด้วย)
                          รหัสลูกค้าเป้าหมายก็ตัดออก — หัวแผงใช้ชื่อบริษัทระบุตัวอยู่แล้ว (และของเดิมเรนเดอร์เพี้ยนเป็น "##L-40336"
                          เพราะ c.id มี "#" ติดมาอยู่แล้วแต่โค้ดเติม "#" ซ้ำอีกตัว) */}
                      <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", fontSize:"0.72rem", color:"rgba(255,255,255,.72)", marginTop:4 }}>
                        <span>{c.contact}</span>
                        <span style={{ display:"flex", alignItems:"center", gap:3 }}><MapPin size={11} /> {c.province}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:7, flexShrink:0, flexWrap:"wrap" }}>
                    {/* หัว = การกระทำด่วนเท่านั้น · Won/Lost/ใบเสนอราคา อยู่แถบล่าง (ไม่ซ้ำ)
                        ปุ่ม "โทร" (tel: ลิงก์) ถูกเอาออก (บอสสั่ง 17 ก.ค. 69) — เบอร์โทรยังอยู่ในการ์ดข้อมูลลูกค้า แท็บภาพรวม */}
                    <button title="สร้างนัดหมาย" onClick={()=>{ setActiveTab("appts"); setDTab("timeline"); setApptAdding(true); setTimeout(() => rightApptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }} style={qa}><CalendarClock size={13} /> นัดหมาย</button>
                    {isCustomer && (
                      <button title="ดูโปรไฟล์ลูกค้า" onClick={()=>{ closePanel(); router.push(c.customerId ? `/customers?open=${c.customerId}` : "/customers"); }} style={qa}><CheckCircle2 size={13} /> ลูกค้า</button>
                    )}
                    {ลบได้(c) && <button title="ลบ" onClick={()=>setShowDeleteConfirm(true)} style={{ ...qa, width:30, padding:0, justifyContent:"center", color:"#fecaca" }}><Trash2 size={14} /></button>}
                    <button onClick={closePanel} title="ปิด" style={{ ...qa, width:30, padding:0, justifyContent:"center" }}><X size={15} /></button>
                  </div>
                </div>
                {/* Badges: stage · priority · template · est value */}
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginTop:12 }}>
                  <span style={{ padding:"2px 10px", borderRadius:99, fontSize:"0.65rem", fontWeight:700, background:sc.bg, color:sc.text }}>{leadStatusLabel[c.status]}</span>
                  <span style={{ display:"flex", alignItems:"center", gap:4, padding:"2px 10px", borderRadius:99, fontSize:"0.65rem", fontWeight:800, background:"#fff", color:"#003366" }}><Coins size={11} /> {fmtLeadValue(มูลค่าลีด(c))}</span>
                </div>
              </div>

              {/* แถบขั้นตอน + ขั้นต่อไป (UI ตาม flow · หน้า 3 · 16 ต.ค. 69) — ปุ่มพาไปทางเดิมที่มีอยู่ */}
              <LeadNextStep lead={c} onAction={(kind, quoteId) => {
                if (kind === "request_quote" || kind === "reprice") {
                  setActiveTab("quotation"); setDTab("quotation");
                  setReqSignal(s => ({ mode: kind === "reprice" ? "แก้ราคา" : "ขอราคา", n: (s?.n ?? 0) + 1 }));
                } else if (kind === "make_quote") {
                  openQuotationForm(c);
                } else if (quoteId) {
                  // ส่งให้ลูกค้า / บันทึกผลจากลูกค้า อยู่ในแผงรายละเอียดของหน้าใบเสนอราคา
                  closePanel(); router.push(`/quotations?open=${encodeURIComponent(quoteId)}`);
                }
              }} />

              {/* Tab bar — Overview / Tasks / Quotation / Timeline */}
              <div style={{ display:"flex", gap:0, borderBottom:"1px solid #e5e7eb", background:"#fff", flexShrink:0, padding:"0 8px" }}>
                {([["overview","ภาพรวม"],["tasks","งาน"],["quotation","ใบเสนอราคา"],["timeline","ไทม์ไลน์"]] as ["overview"|"tasks"|"quotation"|"timeline",string][]).map(([k,label])=>(
                  <button key={k} onClick={()=>setDTab(k)}
                    style={{ padding:"11px 14px", border:"none", borderBottom:`2px solid ${dTab===k?"#003366":"transparent"}`, background:"transparent",
                      cursor:"pointer", fontFamily:"inherit", fontSize:"0.8rem", fontWeight:dTab===k?800:600, color:dTab===k?"#003366":"#6b7280", marginBottom:-1 }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Body — เนื้อหาตามแท็บ */}
              <div style={{ flex:1, overflowY:"auto", background:"#f5f7fa" }}>
                {/* ── TAB: ภาพรวม ── */}
                <div style={{ padding:16, display:dTab==="overview"?"flex":"none", flexDirection:"column", gap:14 }}>
                  <div style={cardStyle}>
                    {/* แก้ไขได้ในที่เดิมตลอดเวลา — ปุ่มสลับโหมด "แก้ไขข้อมูล" ถูกถอดออก (บอสสั่ง 17 ก.ค. 69)
                        ปุ่ม "บันทึกการแก้ไข" ท้ายการ์ดติดไฟเมื่อมีการแก้จริงเท่านั้น */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ ...secLabel, marginBottom:0 }}><User size={13} color="#003366" /> ข้อมูลลูกค้า (Overview)</div>
                    </div>
                    <OverviewEditor lead={c} persons={personsList} onSave={saveLead} />
                  </div>
                </div>

                {/* ── TAB: งาน ── */}
                <div style={{ padding:16, display:dTab==="tasks"?"flex":"none", flexDirection:"column", gap:14 }}>
                  <div ref={journeyRef} style={cardStyle}>{tabTasks}</div>
                </div>

                {/* ── TAB: ใบเสนอราคา ── */}
                <div style={{ padding:16, display:dTab==="quotation"?"flex":"none", flexDirection:"column", gap:14 }}>
                  <div ref={rightQuoteRef} style={cardStyle}>{tabQuotation}</div>
                </div>

                {/* ── TAB: ไทม์ไลน์ + นัดหมาย + ไฟล์ + โน้ต ── */}
                <div style={{ padding:16, display:dTab==="timeline"?"flex":"none", flexDirection:"column", gap:14 }}>
                  <div style={cardStyle}>{tabActivities}</div>
                  <div ref={rightApptRef} style={cardStyle}>{tabAppts}</div>
                  <div style={cardStyle}>{tabFiles}</div>
                  <div style={cardStyle}><div style={secLabel}><StickyNote size={13} color="#003366" /> โน้ต</div>{tabReport}</div>
                </div>
              </div>

              {/* แถบปุ่มติดล่าง */}
              <div style={{ flexShrink:0, borderTop:"1px solid #e6eaf0", background:"#fff", padding:"12px 20px",
                display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, flexWrap:"wrap" }}>
                <div />{/* ปุ่มสร้างใบเสนอราคา/นัดหมาย เอาออกตามที่บอสสั่ง — ทำได้ที่แท็บ "ใบเสนอราคา" และ "ไทม์ไลน์" */}
                {/* ── ปุ่ม "ปิดการขาย / ปิดการขายไม่สำเร็จ" ตรงนี้ถูกเอาออก (บอสทักว่าซ้ำ 20 ส.ค. 69) ──
                    ซ้ำกับปุ่ม "ได้งาน / ไม่ได้งาน" ในแท็บงาน ซึ่งเป็นที่ที่ถูกต้องกว่า
                    และสำคัญกว่านั้น: คู่ปุ่มตรงนี้ "ไม่มีด่านกัน" — กดปิดการขายได้เลย
                    ข้ามกฎที่บอสสั่งไว้ว่าต้องมีใบเสนอราคาที่ส่งถึงลูกค้าแล้วก่อน (19 ส.ค. 69)
                    ปุ่มในแท็บงานมีด่านนั้นอยู่ (ปิดปุ่มพร้อมบอกเหตุผล) จึงเหลือไว้ทางเดียว */}
              </div>
            </div>

            {/* ปิดการขายไม่สำเร็จ — เลือกเหตุผล */}
          </>
        );
      })()}

      {/* Success toast (Convert to Customer) — ถ้าเพิ่งปิดการขาย มีปุ่มลัดไปหน้าลูกค้าพร้อมค้นหาให้เลย */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)",
          zIndex:300, display:"flex", alignItems:"center", gap:9,
          background:"#003366", color:"#fff", borderRadius:12, padding:"12px 18px",
          boxShadow:"0 10px 32px rgba(0,0,0,.25)", fontSize:"0.8rem", fontWeight:600,
          maxWidth:"calc(100vw - 32px)" }}>
          <CheckCircle2 size={17} color="#34d399" />
          <span>{toast}</span>
          {justWonCompany && (
            <button onClick={() => router.push(`/customers?search=${encodeURIComponent(justWonCompany)}`)}
              style={{ background:"rgba(255,255,255,.18)", color:"#fff", border:"none", borderRadius:8,
                padding:"5px 11px", fontSize:"0.74rem", fontWeight:700, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>
              ดูลูกค้าใหม่ →
            </button>
          )}
        </div>
      )}
      {previewFile && <FilePreviewModal file={previewFile} onClose={()=>setPreviewFile(null)} />}
    </>
  );
}

