// ── เมนูข้าง — แหล่งเดียว ──────────────────────────────────────────────────────────
//
// UI รอบใหม่ (บอสสั่ง 14 ก.ย. 69: "รี ui ให้ออกแบบตามเว็บตัวอย่าง ยกเว้นสี เอาสีเดิม")
//   • เมนูจัดกลุ่ม ชื่อไทย · หัวกลุ่มเป็นป้ายธรรมดา ไม่พับ/กาง (บอสสั่งเอาปุ่มพับออก) · แดชบอร์ดอยู่เดี่ยวบนสุด
//   • ไม่มีป้ายกลุ่มเหนือชื่อหน้าแล้ว — บอสสั่งเอาออกทุกหน้า 15 ก.ย. 69 (ชื่อกลุ่มใช้เป็นหัวกลุ่มในเมนูอย่างเดียว)
//
// ⚠️ ลำดับเมนูภายในยังเป็นลำดับเดิมที่บอสสั่งไว้ทุกข้อ — แค่จัดเข้ากลุ่ม ห้ามสลับลำดับเอง
//    (ลูกค้าเป้าหมาย HQ ก่อนดีลเลอร์ · ภาพรวมยอดขายก่อนลูกค้าเป้าหมายทั้งเครือ ฯลฯ)
import {
  LayoutDashboard, Store, Phone, Settings, GitMerge, ScrollText, Users,
  CalendarDays, FolderOpen, History, UserPlus, FileText, Inbox,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: React.ReactNode; badge?: number };
export type NavGroup = {
  key: string;
  /** ชื่อกลุ่ม — ขึ้นเป็นหัวกลุ่มในเมนู */
  group: string;
  icon?: React.ReactNode;
  /** กลุ่มเดี่ยว (แดชบอร์ด) — แสดงเป็นเมนูตรง ๆ ไม่มีป้ายหัวกลุ่ม */
  flat?: boolean;
  items: NavItem[];
};

// Dealer = ฝ่ายขายล้วน (Sales-only)
export const DEALER_NAV: NavGroup[] = [
  { key: "overview", group: "ภาพรวม", flat: true, items: [
    { label: "แดชบอร์ด", href: "/dashboard", icon: <LayoutDashboard size={17} /> },
  ] },
  { key: "sales", group: "งานขาย", icon: <Phone size={15} />, items: [
    { label: "ลูกค้าเป้าหมาย", href: "/leads",      icon: <Phone size={16} /> },
    { label: "ใบเสนอราคา",     href: "/quotations", icon: <ScrollText size={16} /> },
    { label: "ลูกค้า",         href: "/customers",  icon: <Users size={16} /> },
  ] },
  { key: "tools", group: "เครื่องมือ", icon: <FolderOpen size={15} />, items: [
    { label: "ปฏิทิน", href: "/calendar", icon: <CalendarDays size={16} /> },
    { label: "ไฟล์",   href: "/files",    icon: <FolderOpen size={16} /> },
  ] },
  { key: "system", group: "ระบบ", icon: <Settings size={15} />, items: [
    { label: "ตั้งค่า", href: "/settings", icon: <Settings size={16} /> },
  ] },
];

// HQ — ลำดับ "ภาพรวมยอดขาย" มาก่อน "ลูกค้าเป้าหมายทั้งเครือ" (บอสสั่ง 16 ก.ค. 69)
//      "ลูกค้าเป้าหมาย (HQ)" + "ใบค่าแฟรนไชส์" มาก่อน "ดีลเลอร์" (บอสสั่ง 14 ก.ย. 69)
export const HQ_NAV: NavGroup[] = [
  { key: "overview", group: "ภาพรวมทั้งเครือ", flat: true, items: [
    { label: "แดชบอร์ดสำนักงานใหญ่", href: "/hq/dashboard", icon: <LayoutDashboard size={17} /> },
  ] },
  { key: "recruit", group: "หาดีลเลอร์", icon: <UserPlus size={15} />, items: [
    { label: "ลูกค้าเป้าหมาย (HQ)",  href: "/hq/prospects", icon: <UserPlus size={16} /> },
    { label: "ใบค่าแฟรนไชส์", href: "/hq/proposals", icon: <FileText size={16} /> },
    { label: "ดีลเลอร์",       href: "/hq/dealers",   icon: <Store size={16} /> },
  ] },
  { key: "sales", group: "งานขายทั้งเครือ", icon: <GitMerge size={15} />, items: [
    { label: "ภาพรวมยอดขาย",          href: "/hq/pipeline",   icon: <GitMerge size={16} /> },
    // คิวคำขอใบเสนอราคาจากดีลเลอร์ (Flow ใหม่ · FLOW.html ขั้น 4)
    { label: "คำขอใบเสนอราคา",        href: "/hq/quote-requests", icon: <Inbox size={16} /> },
    { label: "ลูกค้าเป้าหมายทั้งเครือ", href: "/hq/leads",      icon: <Phone size={16} /> },
    { label: "ใบเสนอราคาทั้งเครือ",    href: "/hq/quotations", icon: <ScrollText size={16} /> },
    { label: "ลูกค้าทั้งเครือ",        href: "/hq/customers",  icon: <Users size={16} /> },
  ] },
  // กลุ่ม "สินค้า" (แคตตาล็อกแม่แบบ) ลบแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
  { key: "system", group: "ระบบ", icon: <Settings size={15} />, items: [
    { label: "บันทึกการใช้งาน", href: "/hq/audit",    icon: <History size={16} /> },
    { label: "ตั้งค่า",         href: "/hq/settings", icon: <Settings size={16} /> },
  ] },
];

export const isActiveHref = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
