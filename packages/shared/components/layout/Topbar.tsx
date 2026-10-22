"use client";
import { ไม่ใช่แถวHQ } from "@pms/shared/lib/hqDealerRow";
import { มูลค่าลีด } from "@pms/shared/lib/mock";   // มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { fmtLeadValue } from "@pms/shared/lib/format";
import { ModalCard } from "@pms/shared/components/ui/ModalCard";
import { useRouter, usePathname } from "next/navigation";
import { useRole } from "@pms/shared/context/RoleContext";
import { useUserProfile } from "@pms/shared/lib/useUserProfile";
import { useSales } from "@pms/shared/context/SalesContext";
import {
  DEFAULT_DEALER_CODE,
  type LeadRow, type CustomerRow, type QuotationMock, type DealerRow,
  roleLabelOf,
} from "@pms/shared/lib/mock";
import { useRepoValue } from "@pms/shared/lib/useRepoState";
import { useImpersonating } from "@pms/shared/lib/useImpersonating";
import { dealers as dealersRepo } from "@pms/shared/lib/data";
import { MessageSquare, UserCircle, Settings, Users, FileText, Sparkles, LogOut, Menu, Search, Compass } from "lucide-react";
import { PRIMARY, STEEL } from "@pms/shared/lib/theme";
import { confirmDiscard } from "@pms/shared/lib/useUnsavedGuard";
import { useHQSearch } from "@pms/shared/lib/useNetworkData";
import { useCurrentDealer, useDealerDisplayName } from "@pms/shared/lib/useCurrentDealer";
import { NotificationBell } from "./NotificationBell";
import { APP_NOW } from "@pms/shared/context/FilterContext";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";

// วันที่ของชุดข้อมูลตัวอย่าง แบบอ่านง่าย (ใช้บนป้ายเตือนโหมดตัวอย่าง)
const APP_NOW_TH = `${APP_NOW.getDate()} ${["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."][APP_NOW.getMonth()]} ${APP_NOW.getFullYear() + 543}`;

const BORDER   = "#e5e7eb";
const BG       = "#fafafa";

type SearchResult = { type: string; label: string; sub: string; href: string };

function useClickOutside(ref: React.RefObject<HTMLElement | null>, cb: () => void) {
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, cb]);
}

const TITLE_MAP: { match: string; title: string }[] = [
  /* Dealer */
  { match: "/dashboard",       title: "แดชบอร์ด" },
  { match: "/leads",           title: "ลูกค้าเป้าหมาย" },
  { match: "/customers",       title: "ลูกค้า" },
  { match: "/quotations",      title: "ใบเสนอราคา" },
  { match: "/calendar",        title: "ปฏิทิน" },
  { match: "/files",           title: "ไฟล์" },
  { match: "/settings",        title: "ตั้งค่า" },
  { match: "/profile",         title: "โปรไฟล์" },
  /* HQ */
  { match: "/hq/dashboard",      title: "แดชบอร์ดสำนักงานใหญ่" },
  { match: "/hq/pipeline",       title: "ภาพรวมยอดขาย" },
  // ต้องตรงกับชื่อในเมนูข้าง — เดิมเมนูเรียก "ดีลเลอร์" แต่หัวหน้าเพจเรียก "ดีลเลอร์"
  { match: "/hq/dealers",        title: "ดีลเลอร์" },
  { match: "/hq/prospects",      title: "ลูกค้าเป้าหมาย (HQ)" },
  { match: "/hq/proposals",      title: "ใบค่าแฟรนไชส์" },
  { match: "/hq/quote-requests", title: "คำขอใบเสนอราคา" },
  { match: "/hq/leads",          title: "ลูกค้าเป้าหมายทั้งเครือ" },
  { match: "/hq/customers",      title: "ลูกค้าทั้งเครือ" },
  { match: "/hq/quotations",     title: "ใบเสนอราคาทั้งเครือ" },
  { match: "/hq/users",          title: "ผู้ใช้งาน" },
  { match: "/hq/audit",          title: "บันทึกการใช้งาน" },
  { match: "/hq/settings",        title: "ตั้งค่า" },
];

function pageTitle(pathname: string): string {
  const hit = [...TITLE_MAP].sort((a, b) => b.match.length - a.match.length).find(t => pathname.startsWith(t.match));
  return hit?.title ?? "แดชบอร์ด";
}

// ── หน้า/เมนูที่ค้นหาได้ทั้งระบบ (แยกตามบทบาท) — keywords รวมคำพ้อง/อังกฤษเพื่อให้ค้นเจอง่าย ──
type PageEntry = { label: string; href: string; keywords: string };
const DEALER_PAGES: PageEntry[] = [
  { label: "แดชบอร์ด",       href: "/dashboard",  keywords: "แดชบอร์ด dashboard หน้าแรก home ภาพรวม สรุป" },
  { label: "ลูกค้าเป้าหมาย", href: "/leads",      keywords: "ลูกค้าเป้าหมาย ลีด lead leads ลูกค้าเป้าหมาย โอกาสการขาย" },
  { label: "ลูกค้า",         href: "/customers",  keywords: "ลูกค้า customer customers" },
  { label: "ใบเสนอราคา",     href: "/quotations", keywords: "ใบเสนอราคา quotation quote เสนอราคา" },
  { label: "ปฏิทิน",         href: "/calendar",   keywords: "ปฏิทิน calendar นัดหมาย นัด appointment" },
  { label: "ไฟล์",           href: "/files",      keywords: "ไฟล์ file files เอกสาร document" },
  { label: "ตั้งค่า",         href: "/settings",   keywords: "ตั้งค่า setting settings config" },
  { label: "บัญชีดีลเลอร์",   href: "/settings",   keywords: "บัญชี account โปรไฟล์ profile ข้อมูลส่วนตัว บริษัท ดีลเลอร์" },
];
const HQ_PAGES: PageEntry[] = [
  { label: "แดชบอร์ดสำนักงานใหญ่", href: "/hq/dashboard",  keywords: "แดชบอร์ด dashboard สำนักงานใหญ่ hq ภาพรวม สรุป หน้าแรก" },
  { label: "ดีลเลอร์",              href: "/hq/dealers",    keywords: "ดีลเลอร์ dealer dealers จำหน่าย" },
  { label: "ลูกค้าเป้าหมาย (HQ)", href: "/hq/prospects", keywords: "ลูกค้าเป้าหมาย ผู้สนใจ สมัครดีลเลอร์ prospect prospects dealer ใหม่ hq" },
  { label: "ใบค่าแฟรนไชส์", href: "/hq/proposals", keywords: "ใบค่าแฟรนไชส์ แพ็กเกจดีลเลอร์ ค่าแรกเข้า ระยะสัญญา proposal package dp hq" },
  { label: "ลูกค้าเป้าหมายทั้งเครือ", href: "/hq/leads",   keywords: "ลูกค้าเป้าหมาย lead leads ลีด ทั้งเครือ" },
  { label: "ลูกค้าทั้งเครือ",       href: "/hq/customers",  keywords: "ลูกค้า customer customers ทั้งเครือ" },
  { label: "ภาพรวมยอดขาย",        href: "/hq/pipeline",   keywords: "ภาพรวมยอดขาย pipeline ยอดขาย sales funnel" },
  { label: "ใบเสนอราคาทั้งเครือ",   href: "/hq/quotations", keywords: "ใบเสนอราคา quotation quote ทั้งเครือ" },
  // หน้า /hq/company ถูกยุบเมื่อ 10 ส.ค. 69 — เนื้อหาซ้ำกับแท็บ "บริษัท" ในหน้าตั้งค่าทุกประการ
  // และไม่มีลิงก์ในเมนู (เข้าได้ด้วยการพิมพ์ที่อยู่เท่านั้น) · ค้นหาคำว่า "บริษัท" ให้ไปที่หน้าตั้งค่าแทน
  { label: "บริษัท",              href: "/hq/settings",   keywords: "บริษัท องค์กร โปรไฟล์บริษัท ข้อมูลบริษัท" },
  { label: "ผู้ใช้งาน",            href: "/hq/users",      keywords: "ผู้ใช้งาน user users บัญชีผู้ใช้ สิทธิ์" },
  { label: "ตั้งค่า",              href: "/hq/settings",   keywords: "ตั้งค่า setting settings config" },
  { label: "โปรไฟล์",             href: "/profile",       keywords: "โปรไฟล์ profile บัญชี account ข้อมูลส่วนตัว" },
];

export function Topbar({ onMenu }: { onMenu?: () => void } = {}) {
  const { session, isHQ, logout } = useRole();
  // แท็บนี้เปิดมาจาก "สำนักงานใหญ่กดเข้าระบบแทนดีลเลอร์" หรือเปล่า — ใช้ซ่อนปุ่มออกจากระบบ
  const สวมสิทธิ์อยู่ = useImpersonating();
  const currentDealer = useCurrentDealer(); // สาขาที่ล็อกอิน — กระดิ่งฝั่งดีลเลอร์ scope ด้วย code นี้
  const router = useRouter();
  const pathname = usePathname();

  // โปรไฟล์ที่ผู้ใช้บันทึกไว้ (/profile) → ชื่อ/รูปบน Topbar อัปเดตทันทีเมื่อบันทึก
  // โปรไฟล์ผ่าน repo — เดิมอ่าน localStorage ต่อสาขา (ผู้ใช้ในสาขาเดียวกันทับกันเอง)
  const { profile } = useUserProfile();


  const displayName = profile?.name || session.name;
  // ชื่อบัญชี = ชื่อเดียวทั้งแอป · ดีลเลอร์ใช้ชื่อบริษัทของสาขา (ไม่ใช่ชื่อคน/รหัสสาขา) · HQ ใช้ชื่อผู้ใช้
  const dealerDisplayName = useDealerDisplayName(); // ชื่อบริษัทที่สาขากรอก → ทะเบียน HQ → รหัสสาขา
  const acctName = isHQ ? displayName : dealerDisplayName;
  const acctSub = isHQ ? session.dealerName : `ผู้ดูแล: ${displayName}`;
  const avatarUrl = profile?.avatar;
  const initial = acctName.charAt(0).toUpperCase();
  const roleLabel = roleLabelOf(session.role, isHQ);   // แหล่งเดียวกับแถบข้าง — ห้ามเขียนชื่อบทบาทซ้ำที่นี่
  // ข้อมูลสดจาก SalesContext → ใช้กับช่องค้นหา (กระดิ่งไม่อ่านจากที่นี่แล้ว · ใบ 0231)
  const { leads: allLeads, quotations: liveQuotations, customers: liveCustomers } = useSales();

  // ── ขอบเขตข้อมูลของลูกค้าเป้าหมาย (สำคัญ) ────────────────────────────────────────────
  // SalesContext ถือลูกค้าเป้าหมายของ "ทั้งเครือ" 10 สาขา — ดีลเลอร์ต้องเห็นเฉพาะสมุดงานตัวเอง
  // กติกาเดียวกับ DealerDashboard/หน้า /leads: ไม่มี dealerCode = ลูกค้าเป้าหมายที่ดีลเลอร์สร้างเอง → ของสาขาตัวเอง
  // HQ เห็นทั้งเครือตามปกติ
  //
  // เดิม Topbar ใช้ allLeads ตรง ๆ ทั้งกระดิ่งและช่องค้นหา → ดีลเลอร์ CNX เห็นลูกค้าเป้าหมายของ RYG/MST
  // พร้อมชื่อผู้ติดต่อ เบอร์ มูลค่าดีล และชื่อเซลส์สาขาอื่น (ยืนยันด้วยเทสต์: ระยอง/ตาก โผล่ในกระดิ่ง CNX)
  const liveLeads = useMemo(
    () => isHQ ? allLeads : allLeads.filter(l => (l.dealerCode ?? DEFAULT_DEALER_CODE) === currentDealer.code),
    [allLeads, isHQ, currentDealer.code],
  );
  const [showNotifs, setShowNotifs]     = useState(false);

  // ── states ──
  const [showSearch, setShowSearch]     = useState(false);
  const [showUser,   setShowUser]       = useState(false);
  const [searchQ,    setSearchQ]        = useState("");
  // ค้นหาฝั่ง HQ — ดึงตรงจาก repo ตามคำค้น (M9 Phase 4) · dealer/local ใช้ array ของ SalesContext เหมือนเดิม
  const hqSearch = useHQSearch(isHQ ? searchQ : "");
  const userRef   = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeUser   = useCallback(() => setShowUser(false),   []);
  useClickOutside(userRef,   closeUser);

  // open search overlay
  useEffect(() => {
    if (showSearch) setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [showSearch]);

  // close on Esc
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") { setShowSearch(false); setShowNotifs(false); setShowUser(false); } }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // รายชื่อดีลเลอร์ในผลค้นหา — จากทะเบียนจริง ไม่ใช่ชุดตัวอย่าง
  const dealers = useRepoValue<DealerRow[]>(() => dealersRepo.list(), []);

  // ── search results (grouped, ≥2 chars, up to 5 per group) ──
  const q = searchQ.trim().toLowerCase();
  const results: SearchResult[] = useMemo(() => {
    if (q.length < 1) return [];
    const has = (s?: string) => (s ?? "").toLowerCase().includes(q);
    // แหล่งค้นหา: HQ (supabase) = ผลจาก repo ที่ match แล้ว · dealer/local = array ของ SalesContext (สกอปสาขา)
    const srcLeads = hqSearch ? hqSearch.leads : liveLeads;
    const srcCustomers = hqSearch ? hqSearch.customers : liveCustomers;
    const srcQuotations = hqSearch ? hqSearch.quotes : liveQuotations;
    // ลูกค้าไม่มี owner field → หาผู้รับผิดชอบจากลูกค้าเป้าหมายที่ผูก customerId เดียวกัน
    const ownerOfCustomer = (cid: number) => srcLeads.find(l => l.customerId === cid)?.assigned;
    return [
      // หน้า/เมนู — ค้นหาได้ทุกหน้าในระบบตามบทบาท (นำทางไปหน้านั้นทันที)
      ...(isHQ ? HQ_PAGES : DEALER_PAGES)
        .filter(p => p.keywords.toLowerCase().includes(q))
        .slice(0, 6)
        .map(p => ({ type: "หน้า", label: p.label, sub: "เปิดหน้านี้", href: p.href })),
      // ลูกค้าเป้าหมาย — match company/contact/name/phone/ผู้รับผิดชอบ
      ...srcLeads
        .filter((l: LeadRow) => has(l.name) || has(l.company) || has(l.contact) || has(l.phone) || has(l.assigned))
        .slice(0, 5)
        .map((l: LeadRow) => {
          // แสดง secondary text ตามสิ่งที่ตรงกัน (เบอร์โทร / ผู้รับผิดชอบ)
          const sub = has(l.phone)
            ? `${l.contact} · ${l.phone ?? ""}`
            : has(l.assigned)
            ? `${l.contact} · ผู้รับผิดชอบ ${l.assigned}`
            : `${l.contact} · ${l.province} · ${fmtLeadValue(มูลค่าลีด(l))}`;
          return { type: "ลูกค้าเป้าหมาย", label: l.company, sub, href: `/leads?open=${l.numId}` };
        }),
      // ลูกค้า — match company/name/province/phone/ผู้รับผิดชอบ (ผ่านลูกค้าเป้าหมายที่ผูกกัน)
      ...srcCustomers
        .filter((c: CustomerRow) => has(c.company) || has(c.name) || has(c.province) || has(c.phone) || has(ownerOfCustomer(c.id)))
        .slice(0, 5)
        .map((c: CustomerRow) => {
          const owner = ownerOfCustomer(c.id);
          const sub = has(c.phone)
            ? `${c.name} · ${c.phone}`
            : has(owner)
            ? `${c.name} · ผู้รับผิดชอบ ${owner}`
            : `${c.name} · ${c.province}`;
          return { type: "ลูกค้า", label: c.company, sub, href: `/customers?open=${c.id}` };
        }),
      // ใบเสนอราคา — match id (เลขที่ใบเสนอราคา)/customer/project
      ...srcQuotations
        .filter((qt: QuotationMock) => has(qt.id) || has(qt.customer) || has(qt.project))
        .slice(0, 5)
        .map((qt: QuotationMock) => ({ type: "ใบเสนอราคา", label: qt.id, sub: `${qt.customer} · ${qt.total}`, href: "/quotations" })),
      // ดีลเลอร์ — เฉพาะ role HQ (dealer ไม่มีสิทธิ์เข้าหน้า /hq)
      ...(isHQ ? dealers.filter(ไม่ใช่แถวHQ)
        .filter((d: DealerRow) => has(d.name) || has(d.code) || has(d.region))
        .slice(0, 5)
        .map((d: DealerRow) => ({ type: "ดีลเลอร์", label: d.name, sub: `${d.code} · ${d.region}`, href: `/hq/dealers/${d.code}` })) : []),
    ];
  }, [q, dealers, liveLeads, liveCustomers, liveQuotations, isHQ, hqSearch]);

  // ทุกทางที่พาออกจากหน้าปัจจุบันต้องผ่าน confirmDiscard() ก่อน — หน้าที่มีฟอร์มค้าง (ตั้งค่า)
  // จะได้เตือนครบทุกทาง ไม่ใช่เตือนเฉพาะตอนสลับแท็บ (ดู @pms/shared/lib/useUnsavedGuard)
  async function handleLogout() {
    if (!(await confirmDiscard())) return;
    setShowUser(false);
    logout();
    router.push("/login");
  }

  async function goTo(href: string) {
    if (!(await confirmDiscard())) return;
    setShowSearch(false);
    setSearchQ("");
    router.push(href);
    // แจ้งหน้าปลายทางให้เปิดเรคคอร์ดที่ค้นเจอ แม้ผู้ใช้อยู่หน้าเดิมอยู่แล้ว
    // (router.push ไปเส้นทางเดิมด้วย query ต่างกัน จะไม่ remount → effect ?open ไม่ทำงาน)
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bpms:open-record", { detail: href }));
    }
  }

  // ── type badge color + icon per group ──
  const typeMeta: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    "หน้า":           { bg: "#eef2f7", text: PRIMARY,   icon: <Compass size={14} /> },
    "ลูกค้าเป้าหมาย":  { bg: "#dce5f0", text: PRIMARY,   icon: <MessageSquare size={14} /> },
    "ลูกค้า":         { bg: "#e5faf0", text: "#059669", icon: <Users size={14} /> },
    "ใบเสนอราคา":     { bg: "#fef3cd", text: "#b45309", icon: <FileText size={14} /> },
    "ดีลเลอร์":  { bg: "#e8eaed", text: STEEL, icon: <Sparkles size={14} /> },
  };

  return (
    <>
      {/* ── Search overlay ──────────────────────────────────────── */}
      {showSearch && (
        <div
          onClick={() => { setShowSearch(false); setSearchQ(""); }}
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:400, display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:80 }}>
          <ModalCard
            onClose={() => { setShowSearch(false); setSearchQ(""); }}
            label="ค้นหาทั้งระบบ"
            style={{ width:"100%", maxWidth:560, background:"#fff", borderRadius:16, boxShadow:"0 24px 64px rgba(0,0,0,.22)", overflow:"hidden" }}>
            {/* Input */}
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 16px", borderBottom:`1px solid ${BORDER}` }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={searchInputRef}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder={isHQ ? "ค้นหาหน้า ลูกค้าเป้าหมาย ดีลเลอร์ ใบเสนอราคา…" : "ค้นหาหน้า ลูกค้าเป้าหมาย ลูกค้า ใบเสนอราคา…"}
                style={{ flex:1, border:"none", outline:"none", fontSize:"0.92rem", color:STEEL, background:"transparent" }}/>
              <button onClick={() => { setShowSearch(false); setSearchQ(""); }}
                style={{ fontSize:"0.72rem", color:"#9ca3af", background:"none", border:`1px solid ${BORDER}`, borderRadius:6, padding:"3px 8px", cursor:"pointer" }}>
                Esc
              </button>
            </div>
            {/* Results */}
            {results.length > 0 ? (
              <div style={{ maxHeight:360, overflowY:"auto" }}>
                {results.map((r, i) => {
                  const tc = typeMeta[r.type] ?? { bg:"#f0f0f5", text:"#6b7280", icon:null };
                  const isGroupStart = i === 0 || results[i - 1].type !== r.type;
                  return (
                    <div key={i}>
                    {isGroupStart && (
                      <div style={{ padding:"9px 16px 4px", fontSize:"0.65rem", fontWeight:800, color:"#9ca3af", letterSpacing:"0.05em", background:"#fff" }}>
                        {r.type}
                      </div>
                    )}
                    <button onClick={() => goTo(r.href)}
                      style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"9px 16px",
                        border:"none", borderBottom:`1px solid ${BG}`, background:"#fff", cursor:"pointer", textAlign:"left" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BG; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}>
                      <span style={{ display:"flex", alignItems:"center", justifyContent:"center", width:30, height:30, borderRadius:"50%", background:tc.bg, color:tc.text, flexShrink:0 }}>{tc.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:"0.86rem", fontWeight:700, color:STEEL, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.label}</div>
                        <div style={{ fontSize:"0.72rem", color:"#6b7280", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.sub}</div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                    </div>
                  );
                })}
              </div>
            ) : q.length >= 1 ? (
              <div style={{ padding:"28px 16px", textAlign:"center", fontSize:"0.8rem", color:"#9ca3af" }}>
                ไม่พบผลลัพธ์สำหรับ &ldquo;{searchQ}&rdquo;
              </div>
            ) : (
              <div style={{ padding:"28px 16px", textAlign:"center", fontSize:"0.8rem", color:"#9ca3af" }}>
                พิมพ์เพื่อค้นหา
              </div>
            )}
          </ModalCard>
        </div>
      )}

      {/* ── Topbar (ERP look) ───────────────────────────────────── */}
      <header className="erp-topbar">

        {/* ปุ่มเมนู (มือถือ) */}
        <button className="hamburger" onClick={onMenu} aria-label="เปิดเมนู">
          <Menu size={20} />
        </button>

        {/* ช่องค้นหากว้างแบบเว็บตัวอย่าง (UI รอบใหม่ 14 ก.ย. 69) — กดแล้วเปิดหน้าต่างค้นหาทั้งระบบตัวเดิม
            ชื่อหน้าย้ายลงไปหัวหน้าเพจใต้แถบนี้ (ป้ายกลุ่ม + ชื่อใหญ่) */}
        <button type="button" className="topbar-search" aria-label="ค้นหา"
          onClick={() => { setShowSearch(true); setShowNotifs(false); setShowUser(false); }}>
          <Search size={16} />
          <span>{isHQ ? "ค้นหาหน้า ลูกค้าเป้าหมาย ดีลเลอร์ ใบเสนอราคา…" : "ค้นหาหน้า ลูกค้าเป้าหมาย ลูกค้า ใบเสนอราคา…"}</span>
        </button>

        {/* ── ป้ายบอกว่ากำลังดูชุดข้อมูลตัวอย่าง (บอสสั่ง 24 ส.ค. 69 · ผลตรวจภายนอก DL-05/HQ-12a) ──
            โหมดตัวอย่างตรึง "วันนี้ของระบบ" ไว้ที่ยุคของข้อมูล (ดู appTime.ts) ไม่ใช่วันจริง
            ถ้าไม่บอกไว้ ผู้ใช้จะอ่านคำว่า "วันนี้/เกิน 7 วัน" เป็นวันจริงแล้วสรุปผิด
            ⚠️ ขึ้นเฉพาะโหมดตัวอย่างเท่านั้น — ระบบจริงต่อฐานข้อมูลอยู่ ห้ามมีป้ายนี้ */}
        {!REAL_BACKEND && (
          <span title={`ข้อมูลตัวอย่างสำหรับสาธิต · ระบบตรึงวันที่ไว้ที่ ${APP_NOW_TH} ทุกคำว่า "วันนี้" ในจอนับจากวันนั้น`}
            style={{
              marginLeft: 10, flexShrink: 0, whiteSpace: "nowrap", padding: "3px 9px", borderRadius: 999,
              fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.01em",
              background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A",
            }}>
            ข้อมูลตัวอย่าง · {APP_NOW_TH}
          </span>
        )}

        <div className="topbar-right">

        {/* กระดิ่ง — อ่านจากตารางกลางของแจ้งเตือนอย่างเดียว (ใบ 0231 · NotificationBell) */}
        <NotificationBell scope={isHQ ? "hq" : currentDealer.code} open={showNotifs}
          onOpenChange={v => { setShowNotifs(v); if (v) setShowUser(false); }} />

        {/* User pill + dropdown */}
        <div ref={userRef} style={{ position:"relative" }}>
          <button className="user-chip"
            onClick={() => { setShowUser(p => !p); setShowNotifs(false); }}>
            {avatarUrl
              ? <img className="avatar avatar-sm" src={avatarUrl} alt="" style={{ objectFit:"cover" }} />
              : <div className="avatar avatar-sm" style={{ background:PRIMARY, color:"#fff" }}>{initial}</div>}
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:"0.72rem", fontWeight:700, color:STEEL, lineHeight:1.2 }}>{acctName}</div>
              <div style={{ fontSize:"0.65rem", color:"#6b7280" }}>{roleLabel}</div>
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft:2, transform: showUser ? "rotate(180deg)" : "none", transition:"transform .15s" }}>
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>

          {/* User menu */}
          {showUser && (
            <div style={{ position:"absolute", top:"calc(100% + 10px)", right:0, width:240, background:"#fff", borderRadius:14, border:`1px solid ${BORDER}`, boxShadow:"0 16px 48px rgba(0,0,0,.16)", zIndex:300, overflow:"hidden" }}>
              {/* Profile header */}
              <div style={{ padding:"14px 16px", borderBottom:`1px solid ${BORDER}`, display:"flex", alignItems:"center", gap:10 }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" style={{ width:40, height:40, borderRadius:"50%", objectFit:"cover", flexShrink:0 }} />
                  : <div style={{ width:40, height:40, borderRadius:"50%", background:PRIMARY, display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"1rem", fontWeight:900, color:"#fff", flexShrink:0 }}>
                      {initial}
                    </div>}
                <div>
                  <div style={{ fontSize:"0.86rem", fontWeight:800, color:STEEL }}>{acctName}</div>
                  <div style={{ fontSize:"0.65rem", color:"#6b7280" }}>{roleLabel}</div>
                  <div style={{ fontSize:"0.65rem", color:"#9ca3af", marginTop:1 }}>{acctSub}</div>
                </div>
              </div>

              {/* Menu items */}
              <div style={{ padding:"6px 0" }}>
                {[
                  // ดีลเลอร์: บัญชีดีลเลอร์รวมอยู่ในหน้า "ตั้งค่า" แล้ว → ไม่ต้องมีเมนูซ้ำ · HQ ยังมี "โปรไฟล์" (/profile) แยก
                  ...(isHQ ? [{ Icon: UserCircle, label: "โปรไฟล์", href: "/profile" }] : []),
                  { Icon: Settings,    label:"ตั้งค่า",  href: isHQ ? "/hq/settings" : "/settings" },
                ].map(item => (
                  <button key={item.label} onClick={async () => { if (!(await confirmDiscard())) return; setShowUser(false); router.push(item.href); }}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"9px 16px", border:"none", background:"none", cursor:"pointer", color:STEEL, fontSize:"0.8rem", fontWeight:600, textAlign:"left" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = BG; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
                    <item.Icon size={15} color="#6b7280" strokeWidth={2} /> {item.label}
                  </button>
                ))}
              </div>

              {/* Logout — ซ่อนตอน "สำนักงานใหญ่กำลังเข้าระบบแทนดีลเลอร์" (บอสสั่ง 20 ส.ค. 69)
                  แท็บนี้มีทางกลับอยู่แล้วสองที่ (แถบแจ้งด้านบน + ท้ายเมนูข้าง) ปุ่มออกจากระบบ
                  จึงเป็นทางที่สาม ที่พาไปผิดที่ด้วย: ออกจากบัญชีสาขาแล้วค้างอยู่หน้าเข้าสู่ระบบ
                  ทั้งที่สิ่งที่ผู้ดูแลต้องการคือ "กลับไปหน้า HQ ของตัวเอง" */}
              {!สวมสิทธิ์อยู่ && (
              <div style={{ padding:"6px 0 8px", borderTop:`1px solid ${BORDER}` }}>
                <button onClick={handleLogout}
                  style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"9px 16px", border:"none", background:"none", cursor:"pointer", color:"#dc2626", fontSize:"0.8rem", fontWeight:700, textAlign:"left" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#fee2e2"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
                  <LogOut size={15} strokeWidth={2} /> ออกจากระบบ
                </button>
              </div>
              )}
            </div>
          )}
        </div>

        </div>{/* /topbar-right */}
      </header>

      {/* ── หัวหน้าเพจ (UI รอบใหม่ 14 ก.ย. 69) — ชื่อหน้าตัวใหญ่ · ปุ่มเฉพาะหน้าอยู่ขวา · เส้นคั่นล่าง ──
          ไม่มีคำโปรยใต้ชื่อหน้า (บอสสั่ง 14 ส.ค. 69 · บอสยืนยันอีกครั้งตอนเลือกแบบ)
          ไม่มีป้ายกลุ่มเมนูเหนือชื่อหน้า (เช่น "ภาพรวม" "งานขาย") — บอสสั่งเอาออกทุกหน้าทั้ง HQ และดีลเลอร์ 15 ก.ย. 69 ห้ามเติมกลับ
          คลาส topbar-title คงไว้ที่ h1 — เทสต์และตัวช่วยเดิมยังหาชื่อหน้าจากคลาสนี้ */}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title topbar-title">{pageTitle(pathname)}</h1>
        </div>
        {/* แถวปุ่มเฉพาะหน้า (ช่วงวันที่ · ส่งออก · เพิ่ม) — TopbarActions ส่งเข้ามาที่ช่องนี้ · ว่าง = ยุบหาย */}
        <div id="topbar-slot" className="topbar-slot" />
      </div>
    </>
  );
}
