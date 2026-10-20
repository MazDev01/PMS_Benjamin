// Mock data สำหรับ frontend (ยังไม่เชื่อม backend)
// ─── ROLE / SESSION ───────────────────────────────────────────
import { วันเวลาไทย } from "./thaiDate";

export type UserRole =
  | "SUPER_ADMIN"
  | "HQ_MANAGEMENT"
  | "HQ_STAFF"
  | "DEALER_ADMIN"
  | "DEALER_SALES"
  | "DEALER_SITE";

export type MockSession = {
  name: string;
  role: UserRole;
  dealerName: string;
  dealerCode: string;  // "" = HQ (ไม่ผูกกับสาขา), "CNX" / "RYG" etc. = Dealer
  scopeAll: boolean;   // true = HQ เห็นทุก dealer
};

export const sessions: Record<string, MockSession> = {
  // ⚠️ บัญชีของโหมดตัวอย่าง (เว็บ demo) ต้องเป็น "ผู้ดูแลระบบ" — เว็บนี้มีไว้ให้คนดูของ
  //    ถ้าเป็นบทบาทที่ต่ำกว่า เมนู/ปุ่มที่สงวนไว้ให้ผู้ดูแลจะหายไปทั้งหมด แล้วคนดูเข้าใจว่าระบบไม่มี
  //    (เจอจริง 3 ก.ย. 69: หลังจำกัดสิทธิ์แต่งตั้งบทบาท ปุ่ม "เพิ่มผู้ใช้งาน HQ" หายจาก demo)
  hq: {
    name: "วิชัย ประสิทธิ์",
    role: "SUPER_ADMIN",
    dealerName: "Benjamin HQ",
    dealerCode: "",
    scopeAll: true,
  },
  dealer: {
    name: "สมชาย เชียงใหม่",
    role: "DEALER_ADMIN",
    dealerName: "เชียงใหม่สตีลบิลด์",
    dealerCode: "CNX",
    scopeAll: false,
  },
};


// ─── โปรไฟล์ผู้ใช้ที่ล็อกอิน (แก้ได้ในหน้า /profile · persist ต่อ workspace) ──
export type UserProfile = { name: string; email: string; phone: string; avatar?: string };
export const PROFILE_KEY_PREFIX = "bpms_profile_";
export const PROFILE_UPDATED_EVENT = "bpms-profile-updated";
export function profileKey(dealerCode: string) { return PROFILE_KEY_PREFIX + (dealerCode || "hq"); }
export function defaultProfileEmail(dealerCode: string) {
  return dealerCode ? `${dealerCode.toLowerCase()}@dealer.com` : "admin@benjamin.com";
}
export function loadUserProfile(dealerCode: string, fallbackName: string): UserProfile {
  const base: UserProfile = { name: fallbackName, email: defaultProfileEmail(dealerCode), phone: "" };
  if (typeof window === "undefined") return base;
  try {
    const s = localStorage.getItem(profileKey(dealerCode));
    if (s) { const p = JSON.parse(s); if (p && typeof p === "object") return { ...base, ...p }; }
  } catch {}
  return base;
}

// ─── RESPONSIBLE PERSONS ──────────────────────────────────────
export const RP_STORAGE_KEY = "bpms_responsible_persons";

export type ResponsiblePerson = {
  id: number;
  name: string;   // ชื่อเต็ม เช่น "สมชาย เชียงใหม่"
  title: string;  // ตำแหน่ง เช่น "ผู้จัดการฝ่ายขาย"
  phone: string;
  email: string;
  active: boolean;
  avatar?: string; // รูปโปรไฟล์ (data URL) — ไม่บังคับ, ถ้าไม่มีใช้อักษรย่อ
  dealerCode?: string; // สาขาเจ้าของ (multi-tenant) — undefined = สาขา CNX (พนักงานขายเป็นของแต่ละสาขา)
};

// โหลดรายชื่อผู้รับผิดชอบจาก localStorage (ที่ตั้งค่าในหน้า Settings) — fallback = mock
// ใช้โดย PersonPicker เพื่อให้ตัวเลือกมีรูป+ชื่อ ตรงกับที่บันทึกไว้
export function loadResponsiblePersons(): ResponsiblePerson[] {
  if (typeof window === "undefined") return responsiblePersons;
  try {
    const s = localStorage.getItem(RP_STORAGE_KEY);
    if (s) {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length) return arr.map((p, i) => ({ ...p, id: i + 1 }));
    }
  } catch {}
  return responsiblePersons;
}

export const responsiblePersons: ResponsiblePerson[] = [
  { id: 1, name: "สมชาย เชียงใหม่", title: "ผู้จัดการฝ่ายขาย", phone: "081-234-5678", email: "somchai@dealer.co.th", active: true },
  { id: 2, name: "วิภา รัตนกุล",    title: "เจ้าหน้าที่ขาย",   phone: "082-345-6789", email: "wipa@dealer.co.th",    active: true },
  { id: 3, name: "กาญจนา มีสุข",    title: "เจ้าหน้าที่ขาย",   phone: "083-456-7890", email: "kanjana@dealer.co.th", active: true },
  { id: 4, name: "วิชัย ประสิทธิ์", title: "ผู้ช่วยผู้จัดการ",  phone: "084-567-8901", email: "wichai@dealer.co.th",  active: true },
  { id: 5, name: "สุรชัย บุญมา",    title: "เจ้าหน้าที่ขาย",   phone: "085-678-9012", email: "surachai@dealer.co.th", active: false },
];

// โครงสร้างฐานข้อมูลจริงอยู่ที่ supabase/migrations (ไล่ตามลำดับเลข) — เป็นแหล่งเดียวที่เชื่อได้

// Sales Journey — 7 ขั้นมาตรฐาน (Dealer สร้าง Lead หลังติดต่อลูกค้าแล้ว → ไม่มีสถานะ "ลูกค้าเป้าหมายใหม่")
// ติดต่อแล้ว → รวบรวมความต้องการ → เสนอราคา → ติดตามผล → เจรจาต่อรอง → ปิดการขาย (Won / Lost)
export type LeadStatus =
  | "WAITING"    // Contacted (ขั้นเริ่มต้น)
  | "BULLET"     // Requirement
  | "HQ_PRICING" // รอราคา HQ (Flow ใหม่ · ใบ 0182) — ฐานข้อมูลขยับเองเมื่อส่ง/ยกเลิกคำขอราคา ดีลเลอร์เลือกเองไม่ได้
  | "HQ_QUOTED"  // ได้ราคา HQ (ใบ 0218/0219 · 20 ต.ค. 69) — ฐานขยับเองเมื่อ HQ ส่งใบ · ดีลเลอร์เลือกเองไม่ได้
  | "QUOTED"     // Quotation
  | "FOLLOWUP"   // Follow-up
  | "NEGO"       // Negotiation
  | "PAID"       // Won
  | "CANCELLED"; // Lost

// สาขาเริ่มต้น (เดโม/HQ ที่ไม่ได้ผูกสาขาใด) — แหล่งเดียว เดิม hardcode "CNX" ซ้ำ ๆ ~40 จุดทั่วแอป
// ใช้เป็น fallback เมื่อ dealerCode ว่าง (เช่น HQ ดูภาพรวม, เรคคอร์ดเก่าที่ไม่มี dealer_code ผูกไว้)
export const DEFAULT_DEALER_CODE = "CNX";

// ── ข้อมูลประจำสถานะ: แหล่งเดียว และต้องมีครบทุกสถานะ (Record<LeadStatus,…> — เพิ่มสถานะแล้วลืมใส่ = typecheck ตก) ──
//   บอสสั่ง 20 ต.ค. 69 (เพิ่ม "ได้ราคา HQ"): ทุกที่ที่แปลงสถานะเป็นป้าย สี ตัวกรอง ลำดับขั้น ต้องให้ระบบบังคับครบเอง
//   ลำดับ/รายการที่ดีลเลอร์เลือกได้/คอลัมน์บอร์ด/ถึงขั้นเสนอราคา คำนวณจากตารางนี้ทั้งหมด ไม่เขียนรายการซ้ำที่อื่น
//   manual  = ดีลเลอร์เลือกเองได้จากเมนูขั้น (สถานะที่ฐานขยับให้เองตามคำขอราคา = false)
//   active  = ยังเปิดอยู่ (คอลัมน์บอร์ด · % ความคืบหน้า) · quotedUp = มีใบเสนอราคาถึงลูกค้าแล้ว
export const LEAD_STATUS_META: Record<LeadStatus, { order: number; manual: boolean; active: boolean; quotedUp: boolean }> = {
  WAITING:    { order: 0, manual: true,  active: true,  quotedUp: false },
  BULLET:     { order: 1, manual: true,  active: true,  quotedUp: false },
  HQ_PRICING: { order: 2, manual: false, active: true,  quotedUp: false },
  HQ_QUOTED:  { order: 3, manual: false, active: true,  quotedUp: false },
  QUOTED:     { order: 4, manual: true,  active: true,  quotedUp: true },
  FOLLOWUP:   { order: 5, manual: true,  active: true,  quotedUp: true },
  NEGO:       { order: 6, manual: true,  active: true,  quotedUp: true },
  PAID:       { order: 7, manual: true,  active: false, quotedUp: true },
  CANCELLED:  { order: 8, manual: true,  active: false, quotedUp: false },
};
// ลำดับขั้นเต็ม (ใช้จัดเรียง/ตัวเลือกดรอปดาวน์/บอร์ด)
export const LEAD_STATUS_ORDER: LeadStatus[] = (Object.keys(LEAD_STATUS_META) as LeadStatus[]).sort((a, b) => LEAD_STATUS_META[a].order - LEAD_STATUS_META[b].order);
// สถานะที่ดีลเลอร์ "เลือกเอง" ได้จากเมนูขั้น — ไม่รวมรอราคา HQ / ได้ราคา HQ (ฐานข้อมูลขยับให้เองตามคำขอราคา · FLOW.html ตารางสถานะ)
export const MANUAL_LEAD_STATUSES: LeadStatus[] = LEAD_STATUS_ORDER.filter(s => LEAD_STATUS_META[s].manual);
// สถานะที่ "ถึงขั้นเสนอราคาแล้ว" (มีใบเสนอราคาออกไปแล้ว)
export const QUOTED_UP: LeadStatus[] = LEAD_STATUS_ORDER.filter(s => LEAD_STATUS_META[s].quotedUp);
// สถานะที่ "ยังเปิดอยู่ ไม่ใช่ปลายทาง" เรียงตามลำดับขั้น — ใช้ทำคอลัมน์ Kanban/คำนวณ % ความคืบหน้า
export const ACTIVE_LEAD_STATUSES: LeadStatus[] = LEAD_STATUS_ORDER.filter(s => LEAD_STATUS_META[s].active);

export const leadStatusLabel: Record<LeadStatus, string> = {
  WAITING:   "ติดต่อแล้ว",
  BULLET:    "รวบรวมความต้องการ",
  HQ_PRICING: "รอราคา HQ",
  HQ_QUOTED: "ได้ราคา HQ",
  QUOTED:    "เสนอราคา",
  FOLLOWUP:  "ติดตามผล",
  NEGO:      "เจรจาต่อรอง",
  PAID:      "ปิดการขายสำเร็จ",
  CANCELLED: "ปิดการขายไม่สำเร็จ",
};

// สีไล่ตามลำดับขั้น: ติดต่อแล้ว (เริ่ม/เทา) → navy → indigo → amber → orange → green(Won) → red(Lost)
export const leadStatusColor: Record<LeadStatus, { bg: string; text: string }> = {
  WAITING:   { bg: "#eef2f7",  text: "#475569" },
  BULLET:    { bg: "#dce5f0",  text: "#003366" },
  HQ_PRICING: { bg: "#f3e8ff", text: "#6b21a8" },   // ม่วง = ลูกบอลอยู่ที่สำนักงานใหญ่
  HQ_QUOTED:  { bg: "#dcfce7", text: "#166534" },   // เขียว = ได้ราคาแล้ว ลูกบอลกลับมาที่ดีลเลอร์ (ทำใบให้ลูกค้า)
  QUOTED:    { bg: "#e0e7ff",  text: "#4338ca" },
  // text เข้มขึ้นจาก #d97706 (contrast ~2.9:1 บนพื้นเดิม ต่ำกว่า WCAG AA มาก อ่านยาก
  // — พบจาก /scenario 31 ก.ค. 69) เป็น #92400e (amber-800) ให้ผ่านมาตรฐาน 4.5:1
  FOLLOWUP:  { bg: "#fff3cd",  text: "#92400e" },
  NEGO:      { bg: "#fde8cd",  text: "#b45309" },
  PAID:      { bg: "#e5faf0",  text: "#059669" },
  CANCELLED: { bg: "#fee2e2",  text: "#dc2626" },
};

// ─── Global: Tags (มาตรฐานเดียวทั้งระบบ) ───────────────────────────
export type TagKey = "VIP" | "HOT" | "Urgent" | "Government" | "Private";
export const TAGS: { key: TagKey; label: string; bg: string; color: string }[] = [
  { key: "VIP",        label: "VIP",    bg: "#fef3cd", color: "#b45309" },
  { key: "HOT",        label: "HOT",    bg: "#fee2e2", color: "#dc2626" },
  { key: "Urgent",     label: "ด่วน",   bg: "#fde8cd", color: "#c2410c" },
  { key: "Government", label: "ภาครัฐ", bg: "#e5faf0", color: "#065f46" },
  { key: "Private",    label: "เอกชน",  bg: "#dce5f0", color: "#003366" },
];

// ─── Global: Lost Reasons (เหตุผลที่เสียโอกาสการขาย) ────────────────
// ค่าเริ่มต้นชุดเดียวทั้งระบบ — เดิมฝั่ง HQ กับฝั่งดีลเลอร์มีคนละชุด ผู้ใช้เลยเห็นไม่ตรงกัน
/** ข้อความของตัวเลือก "พิมพ์เหตุผลเอง" — อยู่ในรายการเหตุผลจริง (บอสสั่ง 21 ส.ค. 69)
 *  ⚠️ เป็น "ตัวเลือก" ในรายการ แต่ไม่ใช่ "เหตุผลที่บันทึก": กดแล้วระบบเปิดช่องให้พิมพ์
 *     แล้วเก็บข้อความที่พิมพ์ลงฐานข้อมูลแทน — รายงานจึงยังเห็นเหตุผลจริง ไม่ใช่คำว่า "อื่นๆ" ทุกใบ */
export const OTHER_REASON_OPTION = "อื่นๆ (ระบุเอง)";

export const LOST_REASONS = [
  "ราคาสูงเกินงบประมาณ", "คู่แข่งให้ข้อเสนอดีกว่า", "งบประมาณไม่พร้อม", "ลูกค้าไม่ตอบสนอง",
  OTHER_REASON_OPTION,
] as const;
/** ค่าธงของตัวเลือก "อื่นๆ (ระบุเอง)" — เหตุผลจริงไม่ตรงกับรายการที่ HQ ตั้งไว้
 *  ⚠️ เป็นแค่ "โหมดพิมพ์เอง" ของหน้าจอ ห้ามบันทึกค่านี้ลงฐานข้อมูลเด็ดขาด
 *     ทุกจุดที่ใช้ต้องล็อกปุ่มยืนยันจนกว่าผู้ใช้จะพิมพ์เหตุผลจริง
 *     (ไม่งั้นกราฟ "เหตุผลที่เสียโอกาส" จะมีแท่งชื่อ __OTHER__ โผล่ขึ้นมา) */
export const OTHER_LOST_REASON = "__OTHER__";
export const HQ_JOURNEY_KEY = "hq_sales_journey";
// เหตุผลปิดการขายไม่สำเร็จ (Lost) — จัดการโดย HQ (หน้า HQ ตั้งค่า › เส้นทางการขาย) ใช้ร่วมทุกดีลเลอร์
// อ่านตรงจาก localStorage แบบนี้ใช้ได้เฉพาะโหมด local · ทุกหน้าจอต้องเรียกผ่าน useLostReasons()
// (คนละ origin = คนละกล่องเก็บของ ค่าที่ HQ ตั้งไม่มีทางข้ามมาเองได้ — ดู useHQConfig)
export function loadLostReasons(): string[] {
  if (typeof window === "undefined") return [...LOST_REASONS];
  try {
    const s = localStorage.getItem(HQ_JOURNEY_KEY);
    if (s) {
      const d = JSON.parse(s);
      if (Array.isArray(d?.lost) && d.lost.length) {
        // รองรับทั้งแบบเก่า {label} และแบบใหม่ string[]
        const labels = d.lost.map((r: unknown) => typeof r === "string" ? r : (r as { label?: string })?.label).filter((x: unknown): x is string => typeof x === "string" && !!x);
        if (labels.length) return labels;
      }
    }
  } catch {}
  return [...LOST_REASONS];
}
/** งานมาตรฐานของแต่ละขั้น ที่ HQ ตั้งไว้ (โหมด local) — เก็บกล่องเดียวกับเหตุผลปิดไม่สำเร็จ
 *  ยังไม่เคยตั้ง = ใช้ชุดเริ่มต้น · ทุกหน้าจอต้องอ่านผ่าน useLeadTaskTemplate() ไม่ใช่ฟังก์ชันนี้ตรง ๆ */
export function loadLeadTaskTemplate(): LeadTaskDef[] {
  if (typeof window === "undefined") return [...LEAD_TASK_TEMPLATE];
  try {
    const s = localStorage.getItem(HQ_JOURNEY_KEY);
    if (s) {
      const d = JSON.parse(s);
      if (Array.isArray(d?.tasks) && d.tasks.length) return normalizeLeadTaskTemplate(d.tasks);
    }
  } catch {}
  return [...LEAD_TASK_TEMPLATE];
}
// ─── นโยบายการขายของ HQ (แหล่งเดียว) — บังคับใช้กับทุกดีลเลอร์ ────────────────
// ตั้งที่ /hq/settings → คุม VAT / อายุใบเสนอราคา ทั้งเครือ (ระบบไม่มีส่วนลดแล้ว)
// ⚠️ เคยมี requireApproval ("ใบเสนอราคาต้องผ่านการอนุมัติก่อนส่ง") — ลบทิ้ง 4 ก.ย. 69
//    ตั้ง true ค้างไว้ตั้งแต่โครงร่างแรก แต่ไม่เคยมีฟีเจอร์อนุมัติจริง:
//    ไม่มีสถานะ "รออนุมัติ" · ไม่มีหน้าอนุมัติ · ไม่มีสวิตช์ให้ตั้ง · ไม่มีโค้ดไหนอ่านไปกั้นการส่งใบ
//    เก็บไว้ = หลอกคนอ่านไฟล์สำรองว่าระบบมีขั้นอนุมัติ ทั้งที่ดีลเลอร์กดส่งได้ทันทีเสมอ
export type HQPolicy = { vat: number; quoteValidityDays: number };
export const HQ_POLICY_KEY = "hq_sales_policy";
export const DEFAULT_HQ_POLICY: HQPolicy = { vat: 7, quoteValidityDays: 30 };
// HQ บันทึกนโยบาย/เป้า/กฎแจ้งเตือน → ยิง event นี้ให้หน้าที่เปิดค้างอยู่ใช้ค่าใหม่ทันที
// (โหมด local ได้เฉพาะ origin เดียวกัน · ข้ามแอปต้องใช้ supabase + Realtime)
export const HQ_SETTINGS_EVENT = "bpms-hq-settings-updated";

// ── กฎการดูแลลูกค้าเป้าหมาย (ดีลเลอร์ตั้งเอง · แยกรายสาขา) ──────────────────────
// ⚠️ เจ้าของกฎเปลี่ยนแล้ว (บอสสั่ง): เดิมเป็นเกณฑ์กลางที่ HQ ตั้งให้ทุกสาขาใช้ค่าเดียวกัน
//    ตอนนี้ดีลเลอร์แต่ละสาขาตั้งของตัวเองที่ /settings → "การแจ้งเตือน" · HQ ตั้งให้ไม่ได้แล้ว
//    → ห้ามอ่านกฎเป็น "ค่าเดียวทั้งเครือ" อีก ทุกจุดต้องอ่านด้วย dealerCode ของลูกค้าเป้าหมายใบนั้น
//    (หน้า HQ ที่รวมหลายสาขาจะมีหลายเกณฑ์ปนกัน — ห้ามเขียนป้ายว่า "ภายใน N ชั่วโมง" ลอย ๆ)
// เกณฑ์สองข้อนี้ถูกอ่านไปใช้จริง:
//   unassignedAlertHours (ค่าเริ่มต้น 48 ชม.) → การ์ด "ยังไม่มีผู้รับผิดชอบ" ที่ /hq/leads + กระดิ่ง HQ
//   followUpAlertDays (ค่าเริ่มต้น 7 วัน)     → ป้าย/การ์ด "ต้องติดตามด่วน" ที่ /hq/leads · /leads · แดชบอร์ดดีลเลอร์
// ไม่มี leadExpirationDays (ลบลูกค้าเป้าหมายอัตโนมัติ) — ระบบไม่มีเครื่องมือลบจริง จึงเป็นการแจ้งเตือนแทน
// ไม่มี autoReminder — ไม่มีตัวส่งเตือนอัตโนมัติจริง (เดิมเป็น toggle ที่ไม่มีใครอ่าน)
export type LeadRules = { followUpAlertDays: number; unassignedAlertHours: number };
/** ที่เก็บ = แผนที่ รหัสสาขา → กฎของสาขานั้น · สาขาที่ยังไม่ตั้งเองใช้ค่าเริ่มต้น */
export type DealerLeadRulesMap = Record<string, LeadRules>;
export const DEALER_LEAD_RULES_KEY = "dealer_lead_rules";
export const DEALER_LEAD_RULES_EVENT = "bpms-dealer-lead-rules-updated";
export const DEFAULT_LEAD_RULES: LeadRules = { followUpAlertDays: 7, unassignedAlertHours: 48 };

// ─── การแจ้งเตือนของสำนักงานใหญ่ — ตั้งที่ /hq/settings → "การแจ้งเตือน" ──
// ทุกข้อคำนวณจากข้อมูลจริงและขึ้นกระดิ่ง HQ จริง (ดู @pms/shared/lib/hqAlerts + Topbar) — ไม่ใช่ toggle เปล่า
//
// ขอบเขต = งานของสำนักงานใหญ่เองเท่านั้น (บอสสั่ง 14 ก.ย. 69: "การแจ้งเตือนของ hq แสดงแค่ในขอบเขตของ HQ อย่างเดียว"
//   เลือก "งานของสำนักงานใหญ่เอง") → เอาเรื่องงานขายของดีลเลอร์ 6 เรื่องออก (ลูกค้าเป้าหมายไม่มีผู้รับผิดชอบ/ไม่มีการติดต่อ
//   ใบเสนอราคาใกล้หมดอายุ ดีลเลอร์เงียบ ทำยอดถึงเป้า อัตราปิดไม่สำเร็จ) — ห้ามเติมกลับ งานขายของดีลเลอร์ดูที่หน้าในกลุ่ม "งานขายทั้งเครือ"
// เกณฑ์ (จำนวนวัน) เก็บใน alerts[เรื่อง].days — ตาราง hq_notif_rules มีคอลัมน์เกณฑ์เก่าตายตัว ไม่ต้องเพิ่มคอลัมน์ใหม่
export type HQAlertKey = "prospectFollowUpDue" | "prospectIdle" | "proposalAwaiting" | "proposalExpired";
export type HQAlertPref = { on: boolean; email: boolean; inapp: boolean; days?: number };
export const HQ_ALERT_META: { key: HQAlertKey; label: string; desc: string; เกณฑ์?: { ป้าย: string; หน่วย: string; ค่าเริ่มต้น: number } }[] = [
  { key: "prospectFollowUpDue", label: "ลูกค้าเป้าหมาย (HQ) ถึงกำหนดติดตาม", desc: "รายที่ยังติดตามอยู่ และวันนัดติดตามครั้งถัดไปมาถึงแล้ว" },
  { key: "prospectIdle",        label: "ลูกค้าเป้าหมาย (HQ) ไม่ได้ติดต่อนาน", desc: "รายที่ยังติดตามอยู่ แต่ไม่มีบันทึกการติดต่อตั้งแต่จำนวนวันที่กำหนด",
    เกณฑ์: { ป้าย: "ลูกค้าเป้าหมาย (HQ) ไม่ได้ติดต่อกี่วันถึงเตือน (วัน)", หน่วย: "วันขึ้นไป", ค่าเริ่มต้น: 14 } },
  { key: "proposalAwaiting",    label: "ใบค่าแฟรนไชส์รอคำตอบ",            desc: "ใบที่ส่งแล้ว ยังไม่ตอบรับหรือปฏิเสธ นานเกินจำนวนวันที่กำหนด",
    เกณฑ์: { ป้าย: "ใบค่าแฟรนไชส์รอคำตอบกี่วันถึงเตือน (วัน)", หน่วย: "วันขึ้นไป", ค่าเริ่มต้น: 7 } },
  { key: "proposalExpired",     label: "ใบค่าแฟรนไชส์เลยวันมีผล",          desc: "ใบที่ส่งแล้วยังไม่มีคำตอบ แต่เลยวันที่ข้อเสนอมีผลไปแล้ว" },
];
/** เกณฑ์วันของเรื่องนั้น — ยังไม่เคยตั้ง = ค่าเริ่มต้น */
export function เกณฑ์วันแจ้งเตือน(rules: Pick<HQNotifRules, "alerts">, key: HQAlertKey): number {
  const d = rules.alerts?.[key]?.days;
  return typeof d === "number" && Number.isFinite(d) && d > 0 ? d : (HQ_ALERT_META.find(m => m.key === key)?.เกณฑ์?.ค่าเริ่มต้น ?? 0);
}
export type HQNotifRules = {
  alerts: Record<HQAlertKey, HQAlertPref>;
  // ── เกณฑ์ของเรื่องงานขายดีลเลอร์ชุดเดิม — ไม่ได้ใช้แล้ว (ตัดออกจากกระดิ่ง 14 ก.ย. 69)
  //    คงไว้ในชนิดข้อมูลเพราะคอลัมน์ในฐานข้อมูลเป็น not null และตัวคำนวณ metrics.hqAlerts เดิมยังอ้างถึง
  leadIdleDays: number;
  quoteExpiringDays: number;
  dealerIdleDays: number;
  targetAchievedPct: number;
  lostRatePct: number;
  lostRateMinClosed: number;
  // ช่องทางแจ้งเตือนของแต่ละเรื่อง (อีเมล/ในระบบ) — ย้ายจาก localStorage คีย์ hq_notifications_v2
  // เดิมผู้ดูแลคนหนึ่งตั้งไว้ อีกคนไม่เห็น และล้างเบราว์เซอร์แล้วกลับไปค่าเริ่มต้น
  channels?: Record<string, HQNotifChannels>;
  // ผู้รับอีเมลแจ้งเตือนของสำนักงานใหญ่ (คำขอใหม่ · เกิน 14 วัน · ยกเลิก · ขอแก้ราคา) — ใบ 0193 · ตั้งที่ ตั้งค่า › การแจ้งเตือน
  //   ฐานข้อมูลตรวจรูปแบบ ตัดซ้ำ และทำเป็นตัวเล็กให้เอง · ไม่ใช้อีเมลรายคน (ข้อตัดสิน 14 ต.ค. 69)
  emailRecipients?: string[];
};
export const HQ_NOTIF_RULES_KEY = "hq_notif_rules_v2";
const alertPref = (on: boolean, email: boolean): HQAlertPref => ({ on, email, inapp: true });
export const DEFAULT_HQ_NOTIF_RULES: HQNotifRules = {
  alerts: {
    prospectFollowUpDue: alertPref(true, false),
    prospectIdle:        { ...alertPref(true, false), days: 14 },
    proposalAwaiting:    { ...alertPref(true, false), days: 7 },
    proposalExpired:     alertPref(true, false),
  },
  leadIdleDays: 30, quoteExpiringDays: 7, dealerIdleDays: 30, targetAchievedPct: 100,
  lostRatePct: 40, lostRateMinClosed: 5,
};
/** รวมค่าที่บันทึกไว้เข้ากับค่าเริ่มต้น "ทีละเรื่อง"
 *  • เรื่องที่เพิ่มมาทีหลังยังไม่มีในค่าที่บันทึก → ได้ค่าเริ่มต้น (ไม่ใช่ของว่างจนหน้าตั้งค่าพัง)
 *  • คีย์เรื่องชุดเก่าที่ตัดออกแล้ว (unassignedLead ฯลฯ) ยังค้างในฐานข้อมูล → ทิ้ง ไม่ส่งต่อ */
export function รวมกฎแจ้งเตือน(r: Partial<HQNotifRules> | null | undefined): HQNotifRules {
  if (!r) return { ...DEFAULT_HQ_NOTIF_RULES };
  const saved = (r.alerts ?? {}) as Partial<Record<HQAlertKey, Partial<HQAlertPref>>>;
  const alerts = {} as Record<HQAlertKey, HQAlertPref>;
  for (const m of HQ_ALERT_META) alerts[m.key] = { ...DEFAULT_HQ_NOTIF_RULES.alerts[m.key], ...(saved[m.key] ?? {}) };
  return { ...DEFAULT_HQ_NOTIF_RULES, ...r, alerts, channels: { ...DEFAULT_HQ_NOTIF_RULES.channels, ...(r.channels ?? {}) } };
}
export function loadHQNotifRules(): HQNotifRules {
  if (typeof window === "undefined") return { ...DEFAULT_HQ_NOTIF_RULES };
  try {
    const s = localStorage.getItem(HQ_NOTIF_RULES_KEY);
    if (s) return รวมกฎแจ้งเตือน(JSON.parse(s));
  } catch {}
  return { ...DEFAULT_HQ_NOTIF_RULES };
}

/** กฎของทุกสาขาที่ตั้งไว้ (สาขาที่ไม่มีคีย์ = ยังไม่เคยตั้งเอง → ใช้ค่าเริ่มต้น) */
export function loadDealerLeadRulesMap(): DealerLeadRulesMap {
  if (typeof window === "undefined") return {};
  try { const s = localStorage.getItem(DEALER_LEAD_RULES_KEY); if (s) return JSON.parse(s) as DealerLeadRulesMap; } catch {}
  return {};
}
/** กฎของสาขาเดียว — ใช้ที่นี่ที่เดียวเวลาจะรู้ว่า "ลูกค้าเป้าหมายใบนี้ใช้เกณฑ์อะไร" */
export function leadRulesOf(map: DealerLeadRulesMap, dealerCode: string | undefined): LeadRules {
  return { ...DEFAULT_LEAD_RULES, ...(dealerCode ? map[dealerCode] : undefined) };
}
export function saveDealerLeadRules(dealerCode: string, rules: LeadRules) {
  if (typeof window === "undefined") return;
  const map = loadDealerLeadRulesMap();
  map[dealerCode] = rules;
  localStorage.setItem(DEALER_LEAD_RULES_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(DEALER_LEAD_RULES_EVENT));
}
export function loadHQPolicy(): HQPolicy {
  if (typeof window === "undefined") return { ...DEFAULT_HQ_POLICY };
  try { const s = localStorage.getItem(HQ_POLICY_KEY); if (s) return { ...DEFAULT_HQ_POLICY, ...JSON.parse(s) }; } catch {}
  return { ...DEFAULT_HQ_POLICY };
}

// ─── เป้าหมายยอดขายของ HQ (แหล่งเดียว) — ใช้เทียบความคืบหน้าบนแดชบอร์ด/รายงาน ─────
// ตั้งที่ /hq/settings → แท็บ "เป้าหมายยอดขาย" · แดชบอร์ด/หน้าดีลเลอร์ ดึงค่านี้ไปใช้จริง (ไม่ hardcode ซ้ำ)
// เป้าทั้งปีคือแหล่งเดียว — เป้าไตรมาส/เดือน "แบ่งจากเป้าทั้งปี" (ไม่ได้ตั้งแยก จะได้ไม่ขัดกันเอง)
// ตัดทิ้งแล้ว: period · leadTarget · conversionTarget · quotationTarget · avgDealSize
//   (เขียนลง localStorage ได้ แต่ไม่มีโค้ดไหนอ่านไปใช้ = ช่องตั้งค่าหลอก)
export type HQTargets = {
  annualTarget: number;     // ยอดขายรวมทั้งเครือ (รายปี) — แดชบอร์ด HQ/ดีลเลอร์ใช้จริง
  winRateTarget: number;    // เป้าอัตราปิดการขายเฉลี่ย % (เกณฑ์สีบนหน้าดีลเลอร์)
  onTimeTarget: number;     // เป้าติดตามตรงเวลา % (เกณฑ์สีบนหน้าดีลเลอร์)
};
export const HQ_TARGETS_KEY = "hq_targets";
export const DEFAULT_HQ_TARGETS: HQTargets = { annualTarget: 260_000_000, winRateTarget: 40, onTimeTarget: 85 };
export function loadHQTargets(): HQTargets {
  if (typeof window === "undefined") return { ...DEFAULT_HQ_TARGETS };
  try { const s = localStorage.getItem(HQ_TARGETS_KEY); if (s) return { ...DEFAULT_HQ_TARGETS, ...JSON.parse(s) }; } catch {}
  return { ...DEFAULT_HQ_TARGETS };
}

// ─── การแจ้งเตือนของ HQ (แหล่งเดียว) — หมวดตาม "บันทึกการใช้งาน" (Audit Log) ที่ HQ ควรรู้ ──
// ต่างจากฝั่งดีลเลอร์ (งานขาย) — HQ = ผู้คุมเครือ จึงแจ้งเรื่องธรรมาภิบาล/การเปลี่ยนแปลงนโยบาย
// toggle "ในระบบ" (inapp) กรองกระดิ่ง HQ จริง (ดู hqAuditCategory + Topbar)
// ช่องทาง = อีเมล + ในระบบ เท่านั้น (ไลน์ถูกตัดตามสเปก Enterprise)
export type HQNotifChannels = { email: boolean; inapp: boolean };
export const HQ_NOTIF_KEY = "hq_notifications_v2";
export const HQ_NOTIF_UPDATED_EVENT = "bpms-hq-notif-updated";
export const HQ_NOTIF_EVENTS: { key: string; label: string; desc: string }[] = [
  { key: "dealer",  label: "จัดการดีลเลอร์",         desc: "สร้าง แก้ไข หรือปิดใช้งานดีลเลอร์ในเครือ" },
  { key: "target",  label: "เป้าหมายและการตั้งค่า", desc: "แก้เป้ายอดขายเครือ หรือการตั้งค่าระบบ" },
  { key: "users",   label: "ผู้ใช้และสิทธิ์",        desc: "เพิ่มหรือแก้ไขผู้ใช้และสิทธิ์ใน HQ" },
];
export const DEFAULT_HQ_NOTIFS: Record<string, HQNotifChannels> =
  Object.fromEntries(HQ_NOTIF_EVENTS.map(e => [e.key, { email: e.key === "dealer", inapp: true }]));
export function loadHQNotifPrefs(): Record<string, HQNotifChannels> {
  if (typeof window === "undefined") return { ...DEFAULT_HQ_NOTIFS };
  try { const s = localStorage.getItem(HQ_NOTIF_KEY); if (s) return { ...DEFAULT_HQ_NOTIFS, ...JSON.parse(s) }; } catch {}
  return { ...DEFAULT_HQ_NOTIFS };
}
// จัดหมวดข้อความ audit action → หมวดแจ้งเตือน HQ (ใช้กรองกระดิ่งตาม toggle)
// ⚠️ ตัวนี้มีไว้สำหรับ "กระดิ่งแจ้งเตือน" เท่านั้น — หมวดต้องตรงกับ toggle ในหน้าตั้งค่า
//    หน้าบันทึกการใช้งานใช้ hqAuditModule() ด้านล่างแทน (คนละวัตถุประสงค์ ดูเหตุผลที่นั่น)
/** คำเรียกดีลเลอร์ทั้งคำใหม่และคำเดิม — บันทึกที่เกิดก่อน 12 ต.ค. 69 ยังเขียนคำเดิมอยู่ในฐาน (ลบ/แก้ไม่ได้)
 *  คำเดิมเขียนเป็นรหัสอักขระ กันการค้นหา-แทนที่ทั้งโปรเจกต์มาแก้ทับจนเหลือคำเดียว */
const คำเรียกดีลเลอร์ = /ดีลเลอร์|ตัวแทน/;
export function hqAuditCategory(action: string): string {
  if (คำเรียกดีลเลอร์.test(action)) return "dealer";
  if (action.includes("ราคากลาง")) return "pricing";
  if (action.includes("แม่แบบ")) return "catalog";
  if (action.includes("ผู้ใช้")) return "users";
  return "target"; // เป้า/ตั้งค่า/อื่นๆ
}

// ── หมวดงานสำหรับ "หน้าบันทึกการใช้งาน" (/hq/audit) ────────────────────────────────
//
// บั๊กจริง (เอเจนต์สวมบทผู้ดูแล HQ + ผู้บริหาร เจอตรงกันทั้งคู่ 10 ส.ค. 69):
//   หน้าบันทึกการใช้งานเอา hqAuditCategory ของกระดิ่งมาใช้เป็นตัวกรองโมดูลด้วย
//   ซึ่งมีแค่ 5 หมวดตาม toggle การแจ้งเตือน อะไรที่ไม่เข้าหมวดจะตกไปอยู่ "เป้าหมายและการตั้งค่า" หมด
//   ผลที่เจอจริง:
//     • "เข้าสู่ระบบ" 2,800+ แถว ไปกองอยู่ในหมวดเป้าหมายและการตั้งค่า
//     • "UPDATE/INSERT/DELETE แคตตาล็อก" (ข้อความที่ตัวดักฐานข้อมูลเขียน) ก็ตกไปหมวดเดียวกัน
//       ทั้งที่ "แก้ไขแม่แบบ" (ข้อความที่แอปเขียน) เข้าหมวดแคตตาล็อกถูกต้อง
//       → กรองหมวด "แม่แบบและแคตตาล็อก" แล้วแถวหายไปดื้อ ๆ หาไม่เจอทั้งที่มีอยู่
//
// ต้นเหตุ: ฟังก์ชันเดียวถูกใช้สองวัตถุประสงค์ที่ต้องการหมวดคนละชุด
//   → แยกออกมาเป็นของหน้านี้เอง เพิ่มหมวดได้อิสระโดยไม่กระทบ toggle การแจ้งเตือน
export function hqAuditModule(action: string): string {
  if (/เข้าสู่ระบบ|ออกจากระบบ|เข้าระบบแทน/.test(action)) return "auth";
  if (คำเรียกดีลเลอร์.test(action)) return "dealer";
  if (action.includes("ราคากลาง")) return "pricing";
  if (/แม่แบบ|แคตตาล็อก/.test(action)) return "catalog";
  if (action.includes("ผู้ใช้")) return "users";
  return "target"; // เป้า/ตั้งค่า/อื่นๆ
}

/** รายการนี้เป็น "งานขายของสาขา" หรือเปล่า (บอสสั่ง 21 ส.ค. 69)
 *
 *  บันทึกการใช้งานเก็บสองเรื่องปนกัน:
 *    1) งานของสำนักงานใหญ่ — เข้าระบบ · แก้ราคากลาง · เพิ่ม/ลบดีลเลอร์ · แก้สิทธิ์ผู้ใช้
 *    2) ร่องรอยงานขายที่ฐานข้อมูลบันทึกเอง — ออกใบ/ลบใบ/เปลี่ยนขั้นของลูกค้าเป้าหมาย (ตัวดัก 0150)
 *  การ์ด "กิจกรรมล่าสุด" บนแดชบอร์ดสำนักงานใหญ่ต้องการเฉพาะข้อ 1
 *    ข้อ 2 คืองานประจำวันของสาขา ซึ่งเกิดวันละหลายสิบรายการ ไหลมากลบงานของสำนักงานใหญ่จนหมด
 *    (กติกาเดียวกับกระดิ่งแจ้งเตือนฝั่ง HQ ที่ตัดงานขายของดีลเลอร์ออกไปแล้ว)
 *  ⚠️ ไม่ได้ลบทิ้ง — ยังดูได้ครบที่หน้า "บันทึกการใช้งาน" ซึ่งเป็นที่ของการตรวจย้อนหลัง */
export function isDealerSalesAudit(action: string): boolean {
  return /ลูกค้าเป้าหมาย|ใบเสนอราคา|ปิดการขาย/.test(action);
}

/** ชื่อหมวดที่แสดงในหน้าบันทึกการใช้งาน — ครอบคลุมทุกค่าที่ hqAuditModule คืนได้ */
export const HQ_AUDIT_MODULE_LABEL: Record<string, string> = {
  auth: "เข้า–ออกระบบ",
  dealer: "ดีลเลอร์",
  pricing: "ราคากลาง",
  catalog: "แม่แบบและแคตตาล็อก",
  users: "ผู้ใช้และสิทธิ์",
  target: "เป้าหมายและการตั้งค่า",
};

// ─── รูปแบบเลขที่ใบเสนอราคา (แหล่งเดียว = HQ) — ดีลเลอร์ใช้ตาม ห้ามแก้ ──────────────
// ตั้งที่ /hq/settings → แท็บ "ระบบ" (hq_system.runningPrefix / runningNext)
export type QuoteNumbering = { prefix: string; next: number };
export const HQ_SYSTEM_KEY = "hq_system";
// prefix เป็นแค่ป้ายนำหน้า (ไม่ใช่ตัวกันชนอีกต่อไป) — รหัสสาขา+ปีปัจจุบัน+เลขรัน ต่อท้ายเสมอที่ RPC/LocalAdapter
// รูปแบบเต็ม: Q-{DealerCode}-{Year}-{Running} เช่น Q-CNX-2026-0001 (0088_quotation_number_dealer_code.sql)
export const DEFAULT_QUOTE_NUMBERING: QuoteNumbering = { prefix: "Q-", next: 1101 };
// ⛔ ป้ายนำหน้าเป็นค่าคงที่ของระบบ — ดีลเลอร์แก้ไม่ได้ (ช่องในหน้าตั้งค่าเป็นแบบล็อก)
//   เดิมพิมพ์เองได้ → มีสาขาพิมพ์ "Q-CNX-2026-" ทับ แล้วได้เลขซ้อนเป็น Q-CNX-2026-CNX-2026-0001
export const QUOTE_PREFIX = DEFAULT_QUOTE_NUMBERING.prefix;
// คำนำหน้าเต็มที่ระบบออกให้ = Q-{รหัสสาขา}-{ปีปัจจุบัน}- (ปีเดินเองทุกปี) แล้วต่อด้วยเลขรัน 4 หลัก
export function quoteNoPrefix(dealerCode: string, year: number = new Date().getFullYear()): string {
  return `${QUOTE_PREFIX}${dealerCode}-${year}-`;
}
export function loadQuoteNumbering(): QuoteNumbering {
  if (typeof window === "undefined") return { ...DEFAULT_QUOTE_NUMBERING };
  // ดีลเลอร์คุมเลขที่ใบเสนอราคาของตัวเอง (เหมือนแฟรนไชส์แต่ไม่ใช่แฟรนไชส์) → อ่านจากตั้งค่าใบเสนอราคาของดีลเลอร์ก่อน
  try {
    const s = localStorage.getItem("dealer_document_settings");
    if (s) { const d = JSON.parse(s);
      const prefix = typeof d.quotePrefix === "string" && d.quotePrefix ? d.quotePrefix : undefined;
      const next   = typeof d.runningNumber === "number" && d.runningNumber > 0 ? d.runningNumber : undefined;
      if (prefix || next) return { prefix: prefix ?? DEFAULT_QUOTE_NUMBERING.prefix, next: next ?? DEFAULT_QUOTE_NUMBERING.next };
    }
  } catch {}
  try {
    const s = localStorage.getItem(HQ_SYSTEM_KEY);
    if (s) { const o = JSON.parse(s);
      return {
        prefix: typeof o.runningPrefix === "string" && o.runningPrefix ? o.runningPrefix : DEFAULT_QUOTE_NUMBERING.prefix,
        next:   typeof o.runningNext === "number" && o.runningNext > 0 ? o.runningNext : DEFAULT_QUOTE_NUMBERING.next,
      };
    }
  } catch {}
  return { ...DEFAULT_QUOTE_NUMBERING };
}

// อายุใบเสนอราคาเริ่มต้น (วัน) — ดีลเลอร์คุมเอง (ตั้งค่าใบเสนอราคาของดีลเลอร์) ก่อน · fallback = นโยบาย HQ · สุดท้าย 30
export function loadQuoteValidityDays(): number {
  if (typeof window === "undefined") return 30;
  try { const s = localStorage.getItem("dealer_document_settings"); if (s) { const d = JSON.parse(s); if (typeof d.validityDays === "number" && d.validityDays > 0) return d.validityDays; } } catch {}
  const pol = loadHQPolicy(); if (pol.quoteValidityDays > 0) return pol.quoteValidityDays;
  return 30;
}

// ── ตั้งค่าการแจ้งเตือน (ดีลเลอร์เลือกเปิด/ปิดแต่ละชนิดได้) ──
export type NotifCategory = "newLead" | "followUp" | "meeting" | "quoteExpiry" | "won" | "lost";
export type NotifPrefs = Record<NotifCategory, boolean>;
export const NOTIF_PREFS_KEY = "dealer_notif_prefs";
/** ส่วนบวกเพิ่มจากราคากลางของสาขา (โหมดเดโม/local) — โหมดจริงเก็บที่ dealer_settings.pricing */
export const DEALER_PRICING_KEY = "dealer_pricing";
export const NOTIF_PREFS_EVENT = "bpms-notif-prefs-updated";
export const DEFAULT_NOTIF_PREFS: NotifPrefs = { newLead: true, followUp: true, meeting: true, quoteExpiry: true, won: true, lost: true };
export const NOTIF_META: { key: NotifCategory; label: string; desc: string }[] = [
  { key: "newLead",     label: "ลูกค้าเป้าหมายรอดำเนินการ", desc: "ลูกค้าเป้าหมายขั้นติดต่อแล้ว ที่ไม่มีความเคลื่อนไหวเกินจำนวนวันที่ตั้งไว้" },
  { key: "followUp",    label: "เตือนติดตาม",              desc: "งานติดตาม/นัดติดตามที่ถึงกำหนด" },
  { key: "meeting",     label: "เตือนประชุม/นัดหมาย",       desc: "นัดพบ/นำเสนอที่กำลังจะถึง" },
  { key: "quoteExpiry", label: "ใบเสนอราคาใกล้หมดอายุ",     desc: "ใบที่ส่งแล้วรอลูกค้าตอบ และใกล้หมดอายุตามจำนวนวันที่ตั้งไว้ใน ตั้งค่า › ใบเสนอราคา (หรือเลยวันหมดอายุแล้ว)" },
  { key: "won",         label: "ปิดการขายสำเร็จ",             desc: "เมื่อปิดการขายสำเร็จ" },
  { key: "lost",        label: "เสียโอกาส",                desc: "เมื่อปิดการขายไม่สำเร็จ" },
];
export function loadNotifPrefs(): NotifPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIF_PREFS };
  try { const s = localStorage.getItem(NOTIF_PREFS_KEY); if (s) return { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(s) }; } catch {}
  return { ...DEFAULT_NOTIF_PREFS };
}
// map หัวข้อแจ้งเตือน → หมวด (ใช้กรองตาม prefs)
export function notifCategoryOf(title: string): NotifCategory | null {
  if (title.includes("รอดำเนินการ")) return "newLead";
  if (title.includes("ติดตาม")) return "followUp";
  if (title.includes("ประชุม")) return "meeting";
  if (title.includes("หมดอายุ")) return "quoteExpiry";
  if (title.includes("ปิดการขายสำเร็จ")) return "won";
  if (title.includes("เสียโอกาส")) return "lost";
  return null;
}

// ─── Global: คลังไฟล์ของดีลเลอร์ (แหล่งเดียว) ──────────────────────────
// ไฟล์แนบทั้งหมดรวมศูนย์ที่นี่ — แนบจากหน้าลูกค้า/ลูกค้าเป้าหมาย แล้วปรากฏในหน้าไฟล์กลางอัตโนมัติ
export type DealerFileExt = "pdf" | "docx" | "xlsx" | "dwg" | "pptx" | "jpg" | "png" | "other";
// ⚠️ ชื่อโฟลเดอร์: "แบบแปลน" → "แม่แบบ" (28 ส.ค. 69) → กลับเป็น "แบบแปลน" (บอสสั่ง 16 ต.ค. 69 · เอาแม่แบบออกทั้งระบบ)
//    ข้อมูลเก่าในฐานข้อมูล/เครื่องผู้ใช้ยังเก็บคำเดิมอยู่ — อ่านมาแล้วต้องผ่าน normalizeFileCategory()
//    ก่อนเสมอ ไม่งั้นแถวเก่าจะตกไปอยู่โฟลเดอร์ที่ไม่มีในรายการ (ป้ายสี/ตัวนับหาไม่เจอ)
export type DealerFileCategory = "ใบเสนอราคา" | "แบบแปลน" | "รูปภาพ" | "นำเสนอ" | "สัญญา" | "อื่นๆ";
const FILE_CATEGORIES: readonly DealerFileCategory[] = ["ใบเสนอราคา", "แบบแปลน", "รูปภาพ", "นำเสนอ", "สัญญา", "อื่นๆ"];
const LEGACY_FILE_CATEGORY: Record<string, DealerFileCategory> = { "แม่แบบ": "แบบแปลน" }; // แถวในฐานที่บันทึกช่วง 28 ส.ค.–16 ต.ค. 69 (ไฟล์ไม่แตะ แปลงตอนอ่าน)
/** แปลงชื่อโฟลเดอร์เก่าให้เป็นชื่อปัจจุบัน · ค่าที่ไม่รู้จักถือเป็น "อื่นๆ" (ไม่ทิ้งแถวหาย) */
export function normalizeFileCategory(c: string | undefined | null): DealerFileCategory {
  const ชื่อ = (c ?? "").trim();
  const แปลงแล้ว = LEGACY_FILE_CATEGORY[ชื่อ] ?? ชื่อ;
  return FILE_CATEGORIES.includes(แปลงแล้ว as DealerFileCategory) ? (แปลงแล้ว as DealerFileCategory) : "อื่นๆ";
}
export type DealerFileSource = "lead" | "customer" | "upload";
export type DealerFile = {
  id: number;
  name: string;
  size: string;
  ext: DealerFileExt;
  category: DealerFileCategory;
  project: string;          // ชื่อโอกาสการขาย/โครงการ (แสดงในหน้าไฟล์กลาง)
  uploadedBy: string;
  uploadedAt: string;       // YYYY-MM-DD
  source: DealerFileSource; // มาจากไหน: ลูกค้าเป้าหมาย / ลูกค้า / อัปโหลดตรง
  recordId?: number;        // ผูกกับ customer.id หรือ lead.numId
  customerId?: number;      // คงไว้เพื่อความเข้ากันได้ย้อนหลัง
  dealerCode?: string;      // สาขาเจ้าของ (multi-tenant) — undefined = สาขา CNX (คลังไฟล์เดิม)
  storagePath?: string;     // พาธไฟล์จริงใน Supabase Storage (dealer-files/{dealerCode}/...) — โหมด local ไม่มี
};
export const DEALER_FILES_KEY = "dealer_files_v1";
export const DEALER_FILES_EVENT = "bpms-files-updated";

// ไฟล์ตั้งต้น = ไฟล์ที่ "แนบไว้กับลูกค้า/ลูกค้าเป้าหมายจริง" (source บอกว่ามาจากหน้าไหน)
// นามสกุลของชุดตัวอย่างจำกัดไว้เฉพาะชนิดที่มี "ไฟล์ตัวอย่างจริง" วางไว้ในเว็บแล้ว (pdf/xlsx/jpg)
// เพื่อให้ทุกแถวกดเปิดอ่าน/ดาวน์โหลดได้จริง — ดู DEMO_SAMPLE ในหน้าไฟล์ และ scripts/gen-demo-files.mjs
// หน้าไฟล์กลางเพียงดึงไฟล์เหล่านี้มารวมกัน — ไม่มีการสร้างไฟล์ใหม่จากใบเสนอราคา
export const DEFAULT_DEALER_FILES: DealerFile[] = [
  { id: 1,  name: "ใบเสนอราคา_โกดังสำเร็จรูป_ไทยสตีล_v2.pdf", size: "1.4 MB", ext: "pdf",  category: "ใบเสนอราคา", project: "โกดังสำเร็จรูป บจ. ไทยสตีล", uploadedBy: "วิภา",     uploadedAt: "2026-06-20", source: "customer", recordId: 1, customerId: 1 },
  { id: 2,  name: "สัญญาขาย_ไทยสตีล.pdf",                   size: "2.1 MB", ext: "pdf",  category: "สัญญา",      project: "โกดังสำเร็จรูป บจ. ไทยสตีล", uploadedBy: "สมชาย",   uploadedAt: "2026-06-18", source: "customer", recordId: 1, customerId: 1 },
  { id: 3,  name: "ผังพื้นที่ลูกค้า_โรงงาน.pdf",             size: "8.3 MB", ext: "pdf",  category: "แบบแปลน",      project: "โรงงาน PEB เชียงใหม่",     uploadedBy: "วิชัย",   uploadedAt: "2026-06-15", source: "customer", recordId: 2, customerId: 2 },
  { id: 4,  name: "เอกสารนำเสนอ_VCS_Asia.pdf",              size: "5.7 MB", ext: "pdf",  category: "นำเสนอ",     project: "VCS Asia Expansion",       uploadedBy: "กาญจนา", uploadedAt: "2026-06-12", source: "customer", recordId: 5, customerId: 5 },
  { id: 5,  name: "สรุปราคา_คลังสินค้า_บจ.ซีซีเอส.xlsx",       size: "340 KB", ext: "xlsx", category: "ใบเสนอราคา", project: "คลังสินค้า CCS",           uploadedBy: "สมชาย",   uploadedAt: "2026-06-10", source: "customer", recordId: 2, customerId: 2 },
  { id: 6,  name: "รูปถ่ายพื้นที่_พิษณุโลกฟาร์ม.jpg",         size: "3.2 MB", ext: "jpg",  category: "รูปภาพ",     project: "โกดังเก็บข้าว บจ. พิษณุโลกฟาร์ม", uploadedBy: "สมชาย", uploadedAt: "2026-06-08", source: "lead", recordId: 8 },
  { id: 7,  name: "ใบเสนอราคา_Q-2026-0101_พิษณุโลกฟาร์ม.pdf", size: "1.1 MB", ext: "pdf",  category: "ใบเสนอราคา", project: "โกดังเก็บข้าว บจ. พิษณุโลกฟาร์ม", uploadedBy: "สมชาย", uploadedAt: "2026-06-05", source: "lead", recordId: 8 },
  { id: 8,  name: "ใบเสนอราคา_Q-2026-0102_ลำพูนอิเล็กทรอนิกส์.pdf", size: "1.3 MB", ext: "pdf", category: "ใบเสนอราคา", project: "โรงงานอิเล็กทรอนิกส์ ลำพูน", uploadedBy: "วิภา", uploadedAt: "2026-06-03", source: "lead", recordId: 10 },
  { id: 9,  name: "รายละเอียดสินค้า_โกดังสำเร็จรูป.xlsx",         size: "512 KB", ext: "xlsx", category: "แบบแปลน",      project: "โรงงานสำเร็จรูป เชียงใหม่",     uploadedBy: "วิชัย",   uploadedAt: "2026-05-30", source: "customer", recordId: 2, customerId: 2 },
  { id: 10, name: "เอกสารนำเสนอ_ลำพูนอิเล็กทรอนิกส์.pdf",       size: "12.4 MB",ext: "pdf",  category: "นำเสนอ",     project: "โรงงานอิเล็กทรอนิกส์ ลำพูน", uploadedBy: "วิภา",   uploadedAt: "2026-05-20", source: "lead", recordId: 10 },
  { id: 11, name: "รูปถ่ายพื้นที่_VCS_Asia.jpg",              size: "3.2 MB", ext: "jpg",  category: "รูปภาพ",     project: "VCS Asia Expansion",       uploadedBy: "กาญจนา", uploadedAt: "2026-06-05", source: "customer", recordId: 5, customerId: 5 },
];

// เดานามสกุลไฟล์ → ประเภท
export function extOfName(name: string): DealerFileExt {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const e = m?.[1];
  if (e === "jpeg") return "jpg";
  if (e === "doc") return "docx";
  if (e === "xls" || e === "csv") return "xlsx";
  if (e === "ppt") return "pptx";
  if (e === "pdf" || e === "docx" || e === "xlsx" || e === "dwg" || e === "pptx" || e === "jpg" || e === "png") return e as DealerFileExt;
  return "other";
}
// เดาโฟลเดอร์จากชื่อไฟล์
export function guessFileCategory(name: string): DealerFileCategory {
  const n = name.toLowerCase();
  if (name.includes("ใบเสนอราคา") || n.includes("quotation") || n.includes("quote") || name.includes("เสนอราคา")) return "ใบเสนอราคา";
  if (name.includes("สัญญา") || n.includes("contract")) return "สัญญา";
  if (name.includes("แบบ") || name.includes("ผัง") || n.includes("plan") || n.endsWith(".dwg")) return "แบบแปลน";
  if (name.includes("นำเสนอ") || n.includes("present") || n.endsWith(".pptx") || n.endsWith(".ppt")) return "นำเสนอ";
  if (name.includes("รูป") || name.includes("ภาพ") || /\.(jpg|jpeg|png)$/.test(n)) return "รูปภาพ";
  return "อื่นๆ";
}

export function loadDealerFiles(): DealerFile[] {
  if (typeof window === "undefined") return [...DEFAULT_DEALER_FILES];
  try { const s = localStorage.getItem(DEALER_FILES_KEY); if (s) return JSON.parse(s) as DealerFile[]; } catch {}
  return [...DEFAULT_DEALER_FILES];
}
export function saveDealerFiles(files: DealerFile[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(DEALER_FILES_KEY, JSON.stringify(files)); } catch {}
  try { window.dispatchEvent(new Event(DEALER_FILES_EVENT)); } catch {}
}
// แนบไฟล์ใหม่เข้าคลัง (คืนค่า record ที่สร้าง) — id = max+1 เพื่อความ deterministic
export function addDealerFile(f: Omit<DealerFile, "id">): DealerFile {
  const files = loadDealerFiles();
  const id = files.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  const rec: DealerFile = { ...f, id };
  saveDealerFiles([rec, ...files]);
  return rec;
}
export function removeDealerFile(id: number) {
  saveDealerFiles(loadDealerFiles().filter(f => f.id !== id));
}

// ─── Auto-link: ใบเสนอราคา → ไฟล์ (หมวด "ใบเสนอราคา") ผูกกับลูกค้าเป้าหมาย/ลูกค้าอัตโนมัติ ──────
// สร้างใบ → มีไฟล์โผล่ในแท็บ "ไฟล์" ของลูกค้าเป้าหมาย/ลูกค้า + หน้าไฟล์กลางทันที · ลบใบ → ลบไฟล์อัตโนมัติที่ระบบสร้าง
export const AUTO_FILE_BY = "ระบบ · จากใบเสนอราคา";
export function quotationToFile(q: QuotationMock): Omit<DealerFile, "id"> {
  const isLead = !!q.dealId;
  return {
    name: `ใบเสนอราคา_${q.id}_${(q.customer || "").replace(/\s+/g, "")}.pdf`,
    // ⚠️ ห้ามใส่ขนาดไฟล์ตายตัว (แก้ 10 ส.ค. 69) — แถวนี้ไม่ใช่ไฟล์จริง
    //   เป็นแค่ "ตัวชี้" ไปที่ใบเสนอราคา เอกสารตัวจริงถูกสร้างตอนสั่งพิมพ์ ไม่ได้เก็บไว้เป็นไฟล์
    //   เดิมใส่ "~140 KB" ไว้ ซึ่งเป็นตัวเลขที่กุขึ้นมาเอง ไม่ได้วัดจากอะไรเลย
    //   ผิดกฎเดียวกับข้อมูลบริษัทปลอมที่เพิ่งลบไป — ไม่มีข้อมูลจริงให้ปล่อยว่าง
    size: "", ext: "pdf", category: "ใบเสนอราคา", project: q.project,
    uploadedBy: AUTO_FILE_BY, uploadedAt: q.date,
    source: isLead ? "lead" : "customer",
    recordId: isLead ? q.dealId : q.customerId,
    customerId: q.customerId,
  };
}
export function syncAddQuotationFile(q: QuotationMock) {
  if (loadDealerFiles().some(f => f.category === "ใบเสนอราคา" && f.name.includes(q.id))) return; // กันซ้ำ
  addDealerFile(quotationToFile(q));
}

// ─── Global: โปรไฟล์ผู้ออกใบเสนอราคา (บริษัทดีลเลอร์) ────────────────
// แหล่งเดียว — ใช้ทั้งหน้าใบเสนอราคา และใบเสนอราคาแบบ inline ในหน้า Lead
// ให้หัวกระดาษ (ชื่อบริษัท/ที่อยู่/โทร/เลขภาษี) ตรงกันทุกที่เมื่อยังไม่ได้ตั้งค่าโปรไฟล์
export type IssuerProfile = { company: string; address: string; phone: string; taxId: string };
export const ISSUER_KEY = "dealer_issuer_profile_v2";
// ⛔ ห้ามใส่ข้อมูลบริษัทของสาขาใดสาขาหนึ่งเป็นค่าเริ่มต้นเด็ดขาด — ต้องว่างเสมอ
//   ค่านี้คือ "ค่าที่ใช้เมื่อสาขายังไม่เคยตั้งค่าหัวกระดาษ" ซึ่งใช้ร่วมกันทุกสาขา
//   เดิมใส่ข้อมูลจริงของ CNX (เชียงใหม่สตีลบิลด์) ไว้ ผลคือ (พบ 7 ส.ค. 69):
//     · ดีลเลอร์ที่เพิ่งสร้างใหม่ เปิดหน้าบัญชีดีลเลอร์แล้วเห็นชื่อ/ที่อยู่/เลขผู้เสียภาษีของ CNX
//     · ร้ายกว่านั้น — ใบเสนอราคาที่ดีลเลอร์ใหม่ออกให้ลูกค้า ขึ้นหัวกระดาษเป็นชื่อบริษัท CNX
//       และช่องลงนามผู้เสนอราคาก็เป็นชื่อ CNX (ดู quotationPrint.ts · SalesContext issuerRef)
//   ว่างเปล่า = ผู้ใช้เห็นทันทีว่ายังไม่ได้กรอก ดีกว่าเห็นข้อมูลบริษัทอื่นแล้วเข้าใจว่าเป็นของตัวเอง
export const DEFAULT_ISSUER: IssuerProfile = { company: "", address: "", phone: "", taxId: "" };

export const kpis = [
  { key: "target", label: "เป้า vs ยอดขาย", value: "68%", delta: 10.4, icon: "target" },
  { key: "pipeline", label: "มูลค่าโอกาสการขาย", value: "฿4.2M", delta: 8.6, icon: "trending" },
  { key: "win", label: "อัตราปิดการขาย", value: "35%", delta: 4.2, icon: "award" },
  { key: "projects", label: "โอกาสการขายที่กำลังดำเนินการ", value: "5", delta: 16.4, icon: "building" },
] as const;

export type LeadRow = {
  id: string;
  numId: number;
  name: string;
  company: string;
  contact: string;
  phone?: string;
  email?: string;
  province: string;
  address?: string;      // ที่อยู่ลูกค้า — กรอกตอนเพิ่ม/แก้ลูกค้าเป้าหมาย · ส่งต่อเป็นที่อยู่ของลูกค้าเมื่อปิดการขายสำเร็จ
                         // ไม่มี = undefined (หน้าจอขึ้น "—") — ห้ามเก็บค่าว่างหลอกว่ามีข้อมูล
  product: string;
  category: string;
  status: LeadStatus;
  value: string;
  area?: number;         // พื้นที่ใช้สอย (ตร.ม.) — กรอกตอนเพิ่ม/แก้ลูกค้าเป้าหมาย · ส่งต่อเป็นค่าตั้งต้นของใบเสนอราคา
                         // optional: ลูกค้าเป้าหมายเก่า/ลูกค้าเป้าหมายที่ยังไม่รู้พื้นที่ = ไม่มีค่า → หน้าจอขึ้น "—" (ห้ามเดาเป็น 0)
  assigned: string;      // ชื่อผู้รับผิดชอบ (พนักงานขาย) — ไม่ใช่ดีลเลอร์
  dealerCode?: string;   // ดีลเลอร์เจ้าของลูกค้าเป้าหมาย (HQ ใช้ดูทั้งเครือ) — ไม่ระบุ = สมุดงานของดีลเลอร์ที่ล็อกอิน
  source?: string;
  note?: string;
  project?: string;      // ชื่อดีล/โครงการ (ลูกค้าเดิมสร้างดีลใหม่) — ไม่มีก็ใช้ "{แม่แบบ} — {บริษัท}"
  createdAt?: string;    // วันที่สร้างดีล (Thai date) — ดีลใหม่ = วันนี้
  lostReason?: string;   // เหตุผลที่ปิดการขายไม่ได้ (เมื่อ status = CANCELLED)
  report?: string;       // รายงานการติดตามลูกค้า (สร้างอัตโนมัติตอนสร้าง Lead · แก้ไขได้ทั้งหมด)
  tasks?: LeadTask[];    // Report Checklist ขับเคลื่อนสถานะ/ความคืบหน้า (Task-driven Sales Journey)
  activities?: LeadActivity[]; // ไทม์ไลน์กิจกรรมของลูกค้าเป้าหมาย (บันทึกจริง · persist ผ่าน updateLead)
                               // ⚠ รายการไม่ดึงมาด้วย (กินขนส่งมาก) — มีเฉพาะตอนเปิดแผงรายละเอียด (leads.get)
  /** วันที่ติดต่อล่าสุด (YYYY-MM-DD) — ฐานข้อมูลคำนวณจากไทม์ไลน์ให้เองทุกครั้งที่บันทึก (trigger 0046)
   *  ตาราง/การ์ดใช้ค่านี้แทนการอ่านไทม์ไลน์ทั้งก้อน — เท่ากันทุกอย่างแต่เบากว่ามาก */
  lastContactAt?: string;
  customerId?: number;
  logo?: string;   // รูป/โลโก้ลูกค้า (base64) — อัปโหลดในฟอร์มเพิ่มลูกค้าเป้าหมาย
};

// กิจกรรมของลูกค้าเป้าหมาย — บันทึกการโทร/ประชุม/โน้ต ฯลฯ ที่เกิดขึ้นจริง
export type LeadActivity = { id: number; date: string; icon: string; text: string; type: string };

// ─── Task-driven Sales Journey ─────────────────────────────────────
// เช็ก Task → บันทึกเวลา/ผู้ทำ → คำนวณ % (Completed/Total) → เลื่อน Stage อัตโนมัติ
export type LeadTask = { key: string; label: string; done: boolean; doneAt?: string; doneBy?: string };

export type LeadTaskDef = { key: string; label: string; stage: LeadStatus };

/** งานสุดท้ายของเส้นทาง — ปิดการขาย · ห้ามลบ/ห้ามย้ายขั้น (ปุ่มปิดดีลทั้งระบบผูกกับ key นี้) */
export const CLOSE_TASK_KEY = "close";
/** งาน "จัดทำใบเสนอราคา" — ติ๊กเองไม่ได้ ต้องออกใบจริง แล้วระบบติ๊กให้ (ดู completeLeadQuoteTasks) */
export const QUOTE_TASK_KEY = "makeQuote";
/** งาน "ส่งใบเสนอราคา" — ติ๊กเองไม่ได้เช่นกัน ต้องกดส่งใบจริงถึงจะติ๊กให้ */
export const SEND_QUOTE_TASK_KEY = "sendQuote";

// เทมเพลต Checklist มาตรฐาน (สร้างอัตโนมัติทุก Lead) + stage ที่แต่ละ task พาไปถึง
// ⚠️ นี่คือ "ค่าเริ่มต้น" เท่านั้น — ของจริง HQ แก้ได้ที่ /hq/settings › เส้นทางการขาย (เก็บใน hq_sales_journey.tasks)
//    ทุกหน้าจอต้องอ่านผ่าน useLeadTaskTemplate() ไม่ใช่ค่านี้ตรง ๆ (คนละ origin = ค่าที่ HQ ตั้งไม่ข้ามมาเอง)
// ⚠️ ลำดับนี้บอสสั่งเอง (17 ส.ค. 69) — เปลี่ยนจากของเดิม 2 อย่าง:
//    · "ติดต่อครั้งแรก" → "ติดต่อแล้ว"
//    · ย้าย "ส่งแม่แบบให้ลูกค้า" ไปไว้ "หลัง" ส่งใบเสนอราคา (ยืนยันแล้วว่าตั้งใจ ไม่ใช่พิมพ์สลับ)
//      → stage ต้องเป็น QUOTED ไม่ใช่ BULLET ไม่งั้น normalize เรียงตามขั้นแล้วเด้งกลับไปอยู่ก่อนออกใบ
//    · ตัด "รวบรวมความต้องการ" ออก (ชื่อ "ขั้น" BULLET ยังเป็นคำนี้อยู่ ไม่ได้เปลี่ยน)
//    · งานสุดท้าย "ปิดการขาย" → "ปิดการขาย / ไม่สำเร็จ" (บอสส่งรายการมายืนยันซ้ำแบบนี้)
//      ⚠️ ติ๊กงานนี้ = ปิดการขาย "สำเร็จ" (ไปขั้น PAID) เสมอ · ปิดไม่สำเร็จใช้ปุ่มแยก (CANCELLED)
//      ชื่อเป็นแค่ป้ายบนหน้าจอ กลไกผูกกับ key "close" ไม่ใช่ชื่อ — เปลี่ยนชื่อไม่กระทบการทำงาน
// ⚠ แก้ต่อ (19 ส.ค. 69) — บอสสั่ง "แบ่งงานให้เหมาะสมกับเส้นทางการขาย":
//    · ขั้น "รวบรวมความต้องการ" เหลืองานเดียวคือ "นัดหมาย" ชื่อขั้นกับงานจึงไม่สัมพันธ์กัน
//      → เติมงาน "สรุปความต้องการ" ต่อจากนัดหมาย (นัดเจอ → ได้ความต้องการ → ออกใบ)
//      คนละตัวกับงานเก่าชื่อ "รวบรวมความต้องการ" ที่สั่งตัดไป — งานนี้คือ "สรุปหลังคุย" ไม่ใช่ขั้นตอนซ้ำ
//    · "เจรจา" → "เจรจาต่อรอง" ให้ตรงชื่อขั้น (key เดิม — ประวัติการติ๊กของลูกค้าเก่าไม่หาย)
export const LEAD_TASK_TEMPLATE: LeadTaskDef[] = [
  { key: "contact",     label: "ติดต่อแล้ว",          stage: "WAITING"  },
  { key: "collect",     label: "เก็บข้อมูลลูกค้า",     stage: "WAITING"  },
  { key: "appointment", label: "นัดหมาย",            stage: "BULLET"   },
  { key: "requirement", label: "สรุปความต้องการ",     stage: "BULLET"   },
  { key: "makeQuote",   label: "จัดทำใบเสนอราคา",     stage: "QUOTED"   },
  { key: "sendQuote",   label: "ส่งใบเสนอราคา",       stage: "QUOTED"   },
  { key: "followup",    label: "ติดตามผล",           stage: "FOLLOWUP" },
  { key: "negotiate",   label: "เจรจาต่อรอง",          stage: "NEGO"     },
  { key: "close",       label: "ปิดการขาย / ไม่สำเร็จ", stage: "PAID"   },
];

/** ตรวจ/ซ่อมชุดงานที่ HQ ตั้งไว้ก่อนเอาไปใช้จริง — กันข้อมูลเพี้ยนจาก DB/หน้าจอ
 *  · ทิ้งแถวที่ไม่มีชื่อ/ขั้นไม่ถูกต้อง · คีย์ซ้ำเก็บตัวแรก
 *  · เรียงตามลำดับขั้นเสมอ (กลไกเลื่อนขั้นอ่านจากบนลงล่าง สลับลำดับ = เลื่อนขั้นเพี้ยน)
 *  · งาน "ปิดการขาย" ต้องมีเสมอ — หายไปเมื่อไรเติมกลับให้ (ไม่งั้นปิดดีลไม่ได้ทั้งระบบ) */
export function normalizeLeadTaskTemplate(raw: unknown): LeadTaskDef[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const clean: LeadTaskDef[] = [];
  for (const item of list) {
    const t = item as Partial<LeadTaskDef>;
    const key = typeof t?.key === "string" ? t.key.trim() : "";
    const label = typeof t?.label === "string" ? t.label.trim() : "";
    const stage = t?.stage as LeadStatus;
    if (!key || !label || !LEAD_STATUS_ORDER.includes(stage) || seen.has(key)) continue;
    // งาน "ส่งแม่แบบให้ลูกค้า" (key catalog) เลิกใช้แล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · ชุดงานในฐานที่ยังมีอยู่ไม่แสดง
    if (key === "catalog") continue;
    seen.add(key);
    clean.push({ key, label, stage });
  }
  if (!clean.length) return [...LEAD_TASK_TEMPLATE];
  const closeDef = LEAD_TASK_TEMPLATE.find(t => t.key === CLOSE_TASK_KEY)!;
  if (!seen.has(CLOSE_TASK_KEY)) clean.push({ ...closeDef });
  const rank = (s: LeadStatus) => LEAD_STATUS_ORDER.indexOf(s);
  return clean.sort((a, b) => rank(a.stage) - rank(b.stage));
}

export function buildLeadTasks(tpl: LeadTaskDef[] = LEAD_TASK_TEMPLATE): LeadTask[] {
  return tpl.map(t => ({ key: t.key, label: t.label, done: false }));
}

// seed งานของลูกค้าเป้าหมายตัวอย่างให้ "ตรงสถานะจริง" — เช็กงานครบถึงขั้นของสถานะ พร้อมผู้ทำ/เวลา (deterministic)
// ให้ % ความคืบหน้า/แถบ Kanban/stageFromTasks ของข้อมูลตัวอย่างสอดคล้องกับกลไก Task-driven ปัจจุบัน
const STAGE_RANK: Record<LeadStatus, number> = { WAITING: 0, BULLET: 1, HQ_PRICING: 1, HQ_QUOTED: 1, QUOTED: 2, FOLLOWUP: 3, NEGO: 4, PAID: 5, CANCELLED: 2 };
export function seedLeadTasks(status: LeadStatus, doneBy: string, baseDay: number, tpl: LeadTaskDef[] = LEAD_TASK_TEMPLATE): LeadTask[] {
  const rank = STAGE_RANK[status];
  let day = baseDay;
  return tpl.map(t => {
    const done = t.key === CLOSE_TASK_KEY ? status === "PAID" : STAGE_RANK[t.stage] <= rank;
    const entry: LeadTask = done
      ? { key: t.key, label: t.label, done: true, doneAt: `${Math.min(day, 29)} มิ.ย. 2569 · 10:30`, doneBy }
      : { key: t.key, label: t.label, done: false };
    if (done) day += 2;
    return entry;
  });
}

// ความคืบหน้า = จำนวน task ที่ทำสำเร็จ / ทั้งหมด × 100 (คำนวณอย่างเดียว — ห้ามผู้ใช้กรอก/ลาก)
export function taskProgress(tasks: LeadTask[] = []): number {
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
}

// สถานะจาก task ที่ทำล่าสุด (ไม่รวม "ปิดการขาย" ซึ่งแยกเป็น Won/Lost) — ฐานเริ่มที่ "ติดต่อแล้ว"
// ปรับ Checklist ให้ "ตรงกับสเตจเป๊ะ" — ไปข้างหน้าติ๊กงานถึงสเตจนั้น · ย้อนกลับเอาติ๊กที่เกินสเตจออก
// (คง doneAt/doneBy ของงานที่ยังอยู่ในสเตจไว้) ใช้ตอนลากการ์ดเปลี่ยนสถานะบนบอร์ด
// วันเวลาปัจจุบันแบบไทย ใช้ประทับบนงานที่เพิ่งถูกติ๊ก — ต้องเป็นเวลาจริง ห้ามฝังตายตัว
// เวลาไทยเสมอ ไม่ขึ้นกับโซนเวลาของเครื่อง (ดู วันเวลาไทย ใน thaiDate.ts)
export function nowStampTH(d: Date = new Date()): string {
  return วันเวลาไทย(d);
}

export function syncTasksToStage(tasks: LeadTask[] | undefined, status: LeadStatus, doneBy: string, tpl: LeadTaskDef[] = LEAD_TASK_TEMPLATE): LeadTask[] {
  const base = (tasks && tasks.length) ? tasks : buildLeadTasks(tpl);
  if (status === "CANCELLED") return base; // ปิดการขายไม่สำเร็จ — ไม่แตะ Checklist
  const rank = STAGE_RANK[status];
  // ⚠️ เดิมฝังวันที่ "30 มิ.ย. 2569" ไว้ตายตัว — ของเก่าจากยุคข้อมูลตัวอย่าง (แก้ 10 ส.ค. 69)
  //   ตอนนี้ระบบต่อฐานข้อมูลจริงแล้ว ลูกค้าเป้าหมายที่สร้างวันนี้จึงมีงาน "ทำเสร็จแล้ว" ลงวันที่ย้อนหลัง 6 สัปดาห์
  //   และค่านี้ถูกเขียนลงฐานข้อมูลจริง ไม่ใช่แค่แสดงผล = ประวัติการทำงานที่ไม่เคยเกิดขึ้น
  const stamp = nowStampTH();
  return tpl.map(def => {
    const existing = base.find(t => t.key === def.key);
    const shouldDone = def.key === CLOSE_TASK_KEY ? status === "PAID" : STAGE_RANK[def.stage] <= rank;
    if (shouldDone) {
      // อยู่ในสเตจ → ติ๊ก (ถ้าติ๊กแล้วเก็บ doneAt/doneBy เดิม)
      return existing?.done ? existing : { key: def.key, label: def.label, done: true, doneAt: stamp, doneBy };
    }
    // เกินสเตจ → เอาติ๊กออก
    return { key: def.key, label: def.label, done: false };
  });
}
/** ปรับรายการงานของลูกค้าเป้าหมายให้ตรงกับ "งานมาตรฐาน" ล่าสุดที่ HQ ตั้งไว้
 *
 *  บอสแจ้ง (19 ส.ค. 69): "แก้ใน hq แล้ว ดีลเลอร์ยังไม่เปลี่ยน"
 *  เดิมหน้าจออ่าน lead.tasks ที่ฝังอยู่กับลูกค้าเป้าหมายตรง ๆ — รายที่มีอยู่ก่อนจึงค้างชุดเก่าตลอดไป
 *  HQ เป็นเจ้าของเส้นทางการขาย ทุกสาขาต้องเหมือนกัน จึงต้องยึดแม่แบบเป็นหลักเสมอ
 *
 *  · ชุดงาน/ลำดับ/ชื่อ = ตามแม่แบบเสมอ · งานที่รหัสตรงกัน คงติ๊ก/ผู้ทำ/เวลาเดิมไว้
 *  · งานที่ HQ ลบทิ้งแล้วจะหลุดจากรายการ (ตั้งใจ — HQ สั่งเอาออก)
 *    ⚠ ลบงานแล้วเพิ่มใหม่ชื่อเดิม = คนละงาน (รหัสใหม่) ประวัตการติ๊กของงานเก่าจึงหาย — อยากเก็บประวัติไว้ให้แก้ชื่อแทน
 *  · ลูกค้าเป้าหมายที่ปิดแล้ว (สำเร็จ/ไม่สำเร็จ) ไม่แตะเลย — ประวัติที่ปิดไปแล้วต้องคงที่
 */
/** งาน "นัดหมาย" — ระบบติ๊กให้เองเมื่อบันทึกนัดหมายจริง (กติกาเดียวกับงานใบเสนอราคา) */
export const APPOINTMENT_TASK_KEY = "appointment";

/** หา "งานนัดหมาย" ในชุดที่ HQ ตั้งไว้
 *  ยึดรหัสมาตรฐานก่อน · ถ้า HQ ลบงานนั้นแล้วสร้างใหม่ รหัสจะเปลี่ยน (เช่น task_bullet_1)
 *  จึงเผื่อหาจากชื่อไว้ด้วย — ไม่งั้นการติ๊กอัตโนมัติจะเงียบหายทันทีที่ HQ แก้รายการงาน โดยไม่มีอะไรฟ้อง */
export function findAppointmentTask(tpl: LeadTaskDef[] = LEAD_TASK_TEMPLATE): LeadTaskDef | undefined {
  return tpl.find(t => t.key === APPOINTMENT_TASK_KEY) ?? tpl.find(t => t.label.includes("นัด"));
}

/** ติ๊กงานหนึ่งงานให้เสร็จ (ที่ติ๊กแล้วคงเดิม) — คืน checklist ชุดใหม่ ไม่แตะงานอื่น */
export function completeTask(tasks: LeadTask[], key: string, doneBy: string, stamp: string = nowStampTH()): LeadTask[] {
  return tasks.map(t => t.key === key && !t.done ? { ...t, done: true, doneAt: stamp, doneBy } : t);
}

export function applyTaskTemplate(
  tasks: LeadTask[] | undefined, tpl: LeadTaskDef[] = LEAD_TASK_TEMPLATE, status?: LeadStatus,
): LeadTask[] {
  if (!tasks?.length) return buildLeadTasks(tpl);
  if (status === "PAID" || status === "CANCELLED") return tasks;
  const by = new Map(tasks.map(t => [t.key, t]));
  return tpl.map(def => {
    const cur = by.get(def.key);
    return cur ? { ...cur, label: def.label } : { key: def.key, label: def.label, done: false };
  });
}

export function stageFromTasks(tasks: LeadTask[] = [], tpl: LeadTaskDef[] = LEAD_TASK_TEMPLATE): LeadStatus {
  let stage: LeadStatus = "WAITING";
  for (const def of tpl) {
    if (def.key === CLOSE_TASK_KEY) continue;
    if (tasks.find(t => t.key === def.key && t.done)) stage = def.stage;
  }
  return stage;
}

// เทมเพลต "รายงานการติดตามลูกค้า" เริ่มต้น (พรีฟิลจากข้อมูล Lead · ผู้ใช้แก้ไข/เพิ่ม/ลบได้ทั้งหมด)
export function buildLeadReport(lead: Partial<LeadRow>, dateStr = ""): string {
  return [
    "สรุปรายงานการติดตามลูกค้า",
    "",
    `วันที่สร้าง : ${dateStr}`,
    `ผู้รับผิดชอบ : ${lead.assigned ?? ""}`,
    `ลูกค้า : ${lead.contact ?? ""}`,
    `บริษัท : ${lead.company ?? ""}`,
    "",
    "รายละเอียดเบื้องต้น",
    "- ลูกค้าสนใจ : ", // ไม่เติมแม่แบบเก่าของลูกค้าเป้าหมาย (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
    "- ขนาดโครงการ : ",
    `- จังหวัด : ${lead.province ?? ""}`,
    `- งบประมาณ : ${lead.value ?? ""}`,
    "- ระยะเวลาดำเนินการ : ",
    "",
    "ผลการพูดคุย",
    "- ",
    "",
    "สิ่งที่ต้องดำเนินการต่อ",
    "- ",
    "",
    "หมายเหตุ",
    "- ",
  ].join("\n");
}

// พื้นที่ (area) ของลูกค้าเป้าหมาย seed — ที่มาเรียงตามความน่าเชื่อถือ:
//   1) โน้ตของลูกค้าเป้าหมายระบุ ตร.ม. ไว้เอง (5 ใบ) → ใช้เลขนั้นตรง ๆ
//   2) ใบเสนอราคา seed ที่ผูกกันและมูลค่าตรงกัน (ทีทีวาย Q-0096 · สมุทรโกดัง Q-0097) → ใช้เลขจากใบ
//   3) ที่เหลือเติมตามสเกลเดียวกับ seed ที่มีอยู่ (~฿2,000/ตร.ม. — ทั้งโน้ตและใบเสนอราคา seed ตกราวนี้) ปัดเลขกลม
export const leads: LeadRow[] = [
  { id: "#L-40322", numId: 1, createdAt: "12 มิ.ย. 2569", name: "บจ. ไทยสตีล", company: "บจ. ไทยสตีล", contact: "คุณสมชาย ใจดี", phone: "081-234-5678", email: "somchai@thaisteel.co.th", province: "นนทบุรี", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "QUOTED", value: "฿1.2M", area: 1200, assigned: "สมชาย เชียงใหม่", source: "โทรเข้า", note: "ต้องการโกดัง 1,200 ตร.ม. พร้อมสำนักงาน", customerId: 1, tasks: seedLeadTasks("QUOTED", "สมชาย เชียงใหม่", 10), activities: [ { id: 1, date: "22 มิ.ย. 2569", icon: "doc", text: "ส่งใบเสนอราคา Q-2026-0089 ให้ลูกค้า", type: "doc" }, { id: 2, date: "18 มิ.ย. 2569", icon: "meeting", text: "ประชุมเก็บความต้องการโกดัง 1,200 ตร.ม.", type: "meeting" }, { id: 3, date: "12 มิ.ย. 2569", icon: "call", text: "โทรแนะนำบริษัทและแม่แบบโกดังสำเร็จรูป", type: "call" } ] },
  { id: "#L-40323", numId: 2, createdAt: "26 มิ.ย. 2569", name: "บจ. ซีซีเอส", company: "บจ. ซีซีเอส", contact: "คุณกาญจนา ม.", phone: "082-345-6789", email: "kanchana@ccs.co.th", province: "เชียงใหม่", product: "อาคารสำเร็จรูปทุกประเภท", category: "อาคารสำเร็จรูปทุกประเภท", status: "WAITING", value: "฿480K", area: 240, assigned: "วิภา รัตนกุล", source: "เว็บไซต์", customerId: 2, tasks: seedLeadTasks("WAITING", "วิภา รัตนกุล", 24), activities: [ { id: 1, date: "26 มิ.ย. 2569", icon: "call", text: "ติดต่อครั้งแรก — ลูกค้าสนใจอาคารสำนักงานสำเร็จรูป", type: "call" } ] },
  { id: "#L-40324", numId: 3, createdAt: "20 มิ.ย. 2569", name: "หจก. ราชบุรีโลหะ", company: "หจก. ราชบุรีโลหะ", contact: "คุณประยุทธ ร.", phone: "083-456-7890", email: "prayut@rajburimetal.com", province: "ราชบุรี", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "BULLET", value: "฿3.1M", area: 1550, assigned: "วิภา รัตนกุล", source: "แนะนำ", note: "ขอต่อรองราคาในใบเสนอราคา", customerId: 3, tasks: seedLeadTasks("BULLET", "วิภา รัตนกุล", 16), activities: [ { id: 1, date: "24 มิ.ย. 2569", icon: "email", text: "ส่งแม่แบบโกดังสำเร็จรูปให้ลูกค้า", type: "email" }, { id: 2, date: "20 มิ.ย. 2569", icon: "call", text: "โทรสอบถามขนาดพื้นที่และงบประมาณ", type: "call" } ] },
  { id: "#L-40325", numId: 4, createdAt: "25 มิ.ย. 2569", name: "บจ. สมุทรโกดัง", company: "บจ. สมุทรโกดัง", contact: "คุณดารัล ส.", phone: "084-567-8901", email: "daran@samutwarehouse.co.th", province: "สมุทรปราการ", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "WAITING", value: "฿2.0M", area: 1200, assigned: "สมชาย เชียงใหม่", source: "งานแสดงสินค้า", customerId: 4, tasks: seedLeadTasks("WAITING", "สมชาย เชียงใหม่", 25), activities: [ { id: 1, date: "25 มิ.ย. 2569", icon: "meeting", text: "พบลูกค้าที่บูธงานแสดงสินค้า — แลกนามบัตร", type: "meeting" } ] },
  { id: "#L-40326", numId: 5, createdAt: "27 มิ.ย. 2569", name: "บจ. นครสวรรค์โลหะ", company: "บจ. นครสวรรค์โลหะ", contact: "คุณวิชัย น.", phone: "085-678-9012", email: "wichai@nsmetal.co.th", province: "นครสวรรค์", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "WAITING", value: "฿760K", area: 380, assigned: "กาญจนา มีสุข", source: "Facebook", customerId: 8, tasks: seedLeadTasks("WAITING", "กาญจนา มีสุข", 26), activities: [ { id: 1, date: "27 มิ.ย. 2569", icon: "note", text: "ทักมาจากเพจ Facebook — ขอข้อมูลโกดังขนาดเล็ก", type: "note" } ] },
  { id: "#L-40328", numId: 7, createdAt: "14 มิ.ย. 2569",  name: "บจ. ลำปางแพ็คเกจจิ้ง", company: "บจ. ลำปางแพ็คเกจจิ้ง", contact: "คุณอรทัย พ.", phone: "089-111-2233", email: "orathai@lpkg.co.th", province: "ลำปาง", product: "โรงงานอาหาร", category: "โรงงาน", status: "PAID", value: "฿3.6M", area: 1800, assigned: "วิภา รัตนกุล", source: "แนะนำ", note: "ปิดการขายแล้ว — โรงงานบรรจุภัณฑ์ 1,800 ตร.ม.", customerId: 10, tasks: seedLeadTasks("PAID", "วิภา รัตนกุล", 2), activities: [ { id: 1, date: "20 มิ.ย. 2569", icon: "doc", text: "ปิดการขายสำเร็จ — เซ็นสัญญา ฿3.6M", type: "doc" }, { id: 2, date: "14 มิ.ย. 2569", icon: "meeting", text: "เจรจาส่วนลดรอบสุดท้าย 3%", type: "meeting" } ] },
  { id: "#L-40329", numId: 8, createdAt: "19 มิ.ย. 2569",  name: "บจ. พิษณุโลกฟาร์ม", company: "บจ. พิษณุโลกฟาร์ม", contact: "คุณธนา ก.", phone: "089-222-3344", email: "thana@plkfarm.co.th", province: "พิษณุโลก", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "NEGO", value: "฿2.7M", area: 1400, assigned: "สมชาย เชียงใหม่", source: "เว็บไซต์", note: "ต่อรองราคาโกดังเก็บข้าว 1,400 ตร.ม.", tasks: seedLeadTasks("NEGO", "สมชาย เชียงใหม่", 8), activities: [ { id: 1, date: "26 มิ.ย. 2569", icon: "call", text: "โทรเจรจาราคา — ลูกค้าขอส่วนลดเพิ่ม 5%", type: "call" }, { id: 2, date: "19 มิ.ย. 2569", icon: "doc", text: "ส่งใบเสนอราคา Q-2026-0101", type: "doc" } ] },
  { id: "#L-40330", numId: 9, createdAt: "27 มิ.ย. 2569",  name: "หจก. เชียงใหม่ค้าวัสดุ", company: "หจก. เชียงใหม่ค้าวัสดุ", contact: "คุณมานพ ว.", phone: "089-333-4455", email: "manop@cmmaterial.co.th", province: "เชียงใหม่", product: "ต่อเติมอาคาร", category: "งานรีโนเวท", status: "NEGO", value: "฿890K", area: 450, assigned: "กาญจนา มีสุข", source: "LINE", note: "รีโนเวทโกดังเดิม เพิ่มชั้นลอย", tasks: seedLeadTasks("NEGO", "กาญจนา มีสุข", 9), activities: [ { id: 1, date: "27 มิ.ย. 2569", icon: "meeting", text: "ประชุมสรุปขอบเขตงานรีโนเวท", type: "meeting" } ] },
  { id: "#L-40331", numId: 10, createdAt: "17 มิ.ย. 2569", name: "บจ. ลำพูนอิเล็กทรอนิกส์", company: "บจ. ลำพูนอิเล็กทรอนิกส์", contact: "คุณศิริพร บ.", phone: "089-444-5566", email: "siriporn@lpelec.co.th", province: "ลำพูน", product: "โรงงานอิเล็กทรอนิกส์", category: "โรงงาน", status: "FOLLOWUP", value: "฿4.8M", area: 2400, assigned: "วิภา รัตนกุล", source: "งานแสดงสินค้า", note: "โรงงานชิ้นส่วนอิเล็กทรอนิกส์ นิคมลำพูน", tasks: seedLeadTasks("FOLLOWUP", "วิภา รัตนกุล", 12), activities: [ { id: 1, date: "25 มิ.ย. 2569", icon: "call", text: "โทรติดตามใบเสนอราคา — ลูกค้ากำลังเทียบผู้รับเหมา", type: "call" }, { id: 2, date: "17 มิ.ย. 2569", icon: "doc", text: "ส่งใบเสนอราคา Q-2026-0102", type: "doc" } ] },
  { id: "#L-40332", numId: 11, createdAt: "24 มิ.ย. 2569", name: "โรงเรียนนานาชาติเชียงใหม่", company: "โรงเรียนนานาชาติเชียงใหม่", contact: "คุณเดวิด ล.", phone: "089-555-6677", email: "david@cmis.ac.th", province: "เชียงใหม่", product: "โรงยิมอเนกประสงค์", category: "สนามกีฬาในร่ม", status: "FOLLOWUP", value: "฿6.5M", area: 2000, assigned: "สมชาย เชียงใหม่", source: "แนะนำ", note: "โรงยิมอเนกประสงค์ 2,000 ตร.ม.", tasks: seedLeadTasks("FOLLOWUP", "สมชาย เชียงใหม่", 11), activities: [ { id: 1, date: "24 มิ.ย. 2569", icon: "email", text: "ส่งข้อมูลเพิ่มเรื่องระบบระบายอากาศ", type: "email" } ] },
  { id: "#L-40333", numId: 12, createdAt: "23 มิ.ย. 2569", name: "บจ. แพร่วู้ดโปรดักส์", company: "บจ. แพร่วู้ดโปรดักส์", contact: "คุณสมบัติ จ.", phone: "089-666-7788", email: "sombat@phraewood.co.th", province: "แพร่", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "QUOTED", value: "฿1.9M", area: 1000, assigned: "กาญจนา มีสุข", source: "Facebook", note: "โกดังเก็บไม้แปรรูป 1,000 ตร.ม.", tasks: seedLeadTasks("QUOTED", "กาญจนา มีสุข", 15), activities: [ { id: 1, date: "23 มิ.ย. 2569", icon: "doc", text: "จัดทำใบเสนอราคา Q-2026-0103", type: "doc" } ] },
  { id: "#L-40334", numId: 13, createdAt: "25 มิ.ย. 2569", name: "สหกรณ์การเกษตรเชียงดาว", company: "สหกรณ์การเกษตรเชียงดาว", contact: "คุณบุญมี ส.", phone: "089-777-8899", email: "boonmee@cdcoop.or.th", province: "เชียงใหม่", product: "โกดังเก็บสินค้าเกษตร", category: "โกดังสำเร็จรูป", status: "BULLET", value: "฿1.4M", area: 700, assigned: "วิภา รัตนกุล", source: "ลูกค้าเข้ามาเอง", note: "ไซโลและโกดังเก็บข้าวโพด", tasks: seedLeadTasks("BULLET", "วิภา รัตนกุล", 20), activities: [ { id: 1, date: "25 มิ.ย. 2569", icon: "meeting", text: "ลงพื้นที่ดูหน้างานที่เชียงดาว", type: "meeting" } ] },
  { id: "#L-40335", numId: 14, createdAt: "28 มิ.ย. 2569", name: "บจ. น่านโลจิสติกส์", company: "บจ. น่านโลจิสติกส์", contact: "คุณพงศกร น.", phone: "089-888-9900", email: "pongsakorn@nanlogis.co.th", province: "น่าน", product: "งานตามแบบของลูกค้า", category: "งานตามแบบของลูกค้า", status: "WAITING", value: "฿3.3M", area: 1650, assigned: "สมชาย เชียงใหม่", source: "โทรเข้า", note: "ศูนย์กระจายสินค้าตามแบบเฉพาะ", tasks: seedLeadTasks("WAITING", "สมชาย เชียงใหม่", 27), activities: [ { id: 1, date: "28 มิ.ย. 2569", icon: "call", text: "ลูกค้าโทรเข้ามาสอบถาม — นัดเก็บความต้องการสัปดาห์หน้า", type: "call" } ] },
  { id: "#L-40336", numId: 15, createdAt: "18 มิ.ย. 2569", name: "บจ. เชียงรายฟู้ดส์", company: "บจ. เชียงรายฟู้ดส์", contact: "คุณรัชนี ก.", phone: "089-999-0011", email: "ratchanee@crfoods.co.th", province: "เชียงราย", product: "โรงงานอาหาร", category: "โรงงาน", status: "CANCELLED", value: "฿2.2M", area: 1100, assigned: "กาญจนา มีสุข", source: "เว็บไซต์", lostReason: "ราคา", note: "เลือกผู้รับเหมาท้องถิ่น ราคาต่ำกว่า 12%", tasks: seedLeadTasks("CANCELLED", "กาญจนา มีสุข", 5), activities: [ { id: 1, date: "18 มิ.ย. 2569", icon: "note", text: "ลูกค้าแจ้งเลือกเจ้าอื่น — เหตุผลด้านราคา", type: "note" } ] },
  { id: "#L-40337", numId: 16, createdAt: "10 มิ.ย. 2569", name: "หจก. แม่ฮ่องสอนพาณิชย์", company: "หจก. แม่ฮ่องสอนพาณิชย์", contact: "คุณอนุชา ม.", phone: "089-000-1122", email: "anucha@mhscon.co.th", province: "แม่ฮ่องสอน", product: "อาคารสำเร็จรูปทุกประเภท", category: "อาคารสำเร็จรูปทุกประเภท", status: "CANCELLED", value: "฿950K", area: 480, assigned: "วิภา รัตนกุล", source: "แนะนำ", lostReason: "งบประมาณ", note: "โครงการถูกพับ — งบไม่อนุมัติ", tasks: seedLeadTasks("CANCELLED", "วิภา รัตนกุล", 3), activities: [ { id: 1, date: "10 มิ.ย. 2569", icon: "call", text: "ลูกค้าแจ้งพับโครงการ งบประมาณไม่ผ่าน", type: "call" } ] },
  { id: "#L-40327", numId: 6, createdAt: "21 มิ.ย. 2569", name: "บจ. ทีทีวาย", company: "บจ. ทีทีวาย อินเตอร์", contact: "คุณวิทยา ท.", phone: "086-789-0123", email: "wittaya@ttyinter.com", province: "นครสวรรค์", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "PAID", value: "฿5.4M", area: 2400, assigned: "สมชาย เชียงใหม่", source: "แนะนำ", note: "ปิดการขายแล้ว รอทำสัญญา", customerId: 9, tasks: seedLeadTasks("PAID", "สมชาย เชียงใหม่", 4), activities: [ { id: 1, date: "28 มิ.ย. 2569", icon: "doc", text: "ปิดการขายสำเร็จ — ลูกค้ายืนยันสั่งซื้อ ฿5.4M", type: "doc" }, { id: 2, date: "21 มิ.ย. 2569", icon: "meeting", text: "เจรจาราคารอบสุดท้าย ตกลงเงื่อนไขชำระเงิน", type: "meeting" } ] },

  // ── ลูกค้าเป้าหมายของสาขาอื่น (สมมุติขึ้นตามที่บอสสั่ง — ระบบมีสมุดงานจริงแค่ CNX สาขาเดียว) ──
  // มีไว้ให้ HQ เทียบสาขา/ภาค/อัตราแปลงได้จริง · numId เริ่ม 201 กันชนกับลูกค้าเป้าหมายจริงของ CNX
  // ทุกค่าเลือกจากรายการจริงของระบบ (แม่แบบ/แหล่งที่มา/สถานะ/เหตุผลปิดไม่สำเร็จ/จังหวัดของสาขานั้น)
  // สร้างแบบ deterministic (ไม่ใช้ Math.random) — ข้อมูลจะไม่เปลี่ยนทุกครั้งที่โหลด
  // ไม่มี tasks/activities — HQ ดูอย่างเดียว ไม่มีใครติ๊กงานให้ลูกค้าเป้าหมายสาขาอื่น
  { id: "#L-41201", numId: 201, name: "บจ. ระยองอุตสาหกรรม", company: "บจ. ระยองอุตสาหกรรม", contact: "คุณธนา ก.", phone: "0800-100-1000", province: "ระยอง", product: "โรงงาน", category: "โรงงาน", status: "WAITING", value: "฿480K", assigned: "สมชาย จ.", dealerCode: "RYG", source: "LINE", createdAt: "1 ม.ค. 2569" },
  { id: "#L-41202", numId: 202, name: "บจ. ระยองเทรดดิ้ง", company: "บจ. ระยองเทรดดิ้ง", contact: "คุณอนันต์ ช.", phone: "0800-103-1021", province: "ระยอง", product: "อาคารสำเร็จรูปทุกประเภท", category: "อาคารสำเร็จรูปทุกประเภท", status: "FOLLOWUP", value: "฿5.4M", assigned: "ธนา ต.", dealerCode: "RYG", source: "งานแสดงสินค้า", createdAt: "16 เม.ย. 2569" },
  { id: "#L-41203", numId: 203, name: "บจ. ระยองเกษตร", company: "บจ. ระยองเกษตร", contact: "คุณสุดา น.", phone: "0800-106-1042", province: "ระยอง", product: "งานรีโนเวท", category: "งานรีโนเวท", status: "CANCELLED", value: "฿4.1M", assigned: "อนันต์ ม.", dealerCode: "RYG", source: "เว็บไซต์", createdAt: "4 ม.ค. 2569", lostReason: "ราคา" },
  { id: "#L-41204", numId: 204, name: "บจ. ระยองพลาสติก", company: "บจ. ระยองพลาสติก", contact: "คุณสมชาย ว.", phone: "0800-109-1063", province: "ระยอง", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "QUOTED", value: "฿2.8M", assigned: "สุดา อ.", dealerCode: "RYG", source: "แนะนำต่อ", createdAt: "19 เม.ย. 2569" },
  { id: "#L-41205", numId: 205, name: "บจ. ตากอิเล็กทรอนิกส์", company: "บจ. ตากอิเล็กทรอนิกส์", contact: "คุณวีระ ป.", phone: "0801-107-1049", province: "ตาก", product: "ต่อเติมอาคาร", category: "ต่อเติมอาคาร", status: "WAITING", value: "฿1.6M", assigned: "ปรีชา ว.", dealerCode: "MST", source: "LINE", createdAt: "9 ก.พ. 2569" },
  { id: "#L-41206", numId: 206, name: "บจ. ตากฟาร์ม", company: "บจ. ตากฟาร์ม", contact: "คุณวิภา ส.", phone: "0801-110-1070", province: "ตาก", product: "โรงงาน", category: "โรงงาน", status: "FOLLOWUP", value: "฿6.5M", assigned: "วีระ ก.", dealerCode: "MST", source: "งานแสดงสินค้า", createdAt: "24 พ.ค. 2569" },
  { id: "#L-41207", numId: 207, name: "บจ. ตากโลจิสติกส์", company: "บจ. ตากโลจิสติกส์", contact: "คุณศิริพร ข.", phone: "0801-113-1091", province: "ตาก", product: "อาคารสำเร็จรูปทุกประเภท", category: "อาคารสำเร็จรูปทุกประเภท", status: "CANCELLED", value: "฿5.2M", assigned: "วิภา ช.", dealerCode: "MST", source: "เว็บไซต์", createdAt: "12 ก.พ. 2569", lostReason: "คู่แข่ง" },
  { id: "#L-41208", numId: 208, name: "บจ. ตากคอนสตรัคชั่น", company: "บจ. ตากคอนสตรัคชั่น", contact: "คุณปรีชา ด.", phone: "0801-116-1112", province: "ตาก", product: "งานรีโนเวท", category: "งานรีโนเวท", status: "QUOTED", value: "฿3.9M", assigned: "ศิริพร น.", dealerCode: "MST", source: "แนะนำต่อ", createdAt: "27 พ.ค. 2569" },
  { id: "#L-41209", numId: 209, name: "บจ. ตากอิเล็กทรอนิกส์", company: "บจ. ตากอิเล็กทรอนิกส์", contact: "คุณวีระ ป.", phone: "0801-119-1133", province: "ตาก", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "PAID", value: "฿2.6M", assigned: "ปรีชา ว.", dealerCode: "MST", source: "Facebook", createdAt: "15 ก.พ. 2569" },
  { id: "#L-41210", numId: 210, name: "บจ. เชียงรายฟู้ดส์", company: "บจ. เชียงรายฟู้ดส์", contact: "คุณมานพ จ.", phone: "0802-114-1098", province: "เชียงราย", product: "สนามกีฬาในร่ม", category: "สนามกีฬาในร่ม", status: "WAITING", value: "฿2.7M", assigned: "กาญจนา ด.", dealerCode: "CRI", source: "LINE", createdAt: "17 มี.ค. 2569" },
  { id: "#L-41211", numId: 211, name: "บจ. เชียงรายแพ็คเกจจิ้ง", company: "บจ. เชียงรายแพ็คเกจจิ้ง", contact: "คุณนภา ต.", phone: "0802-117-1119", province: "เชียงราย", product: "ต่อเติมอาคาร", category: "ต่อเติมอาคาร", status: "FOLLOWUP", value: "฿1.4M", assigned: "มานพ ป.", dealerCode: "CRI", source: "งานแสดงสินค้า", createdAt: "5 มิ.ย. 2569" },
  { id: "#L-41212", numId: 212, name: "บจ. เชียงรายเมทัล", company: "บจ. เชียงรายเมทัล", contact: "คุณจินตนา ม.", phone: "0802-120-1140", province: "เชียงราย", product: "โรงงาน", category: "โรงงาน", status: "CANCELLED", value: "฿6.3M", assigned: "นภา ส.", dealerCode: "CRI", source: "เว็บไซต์", createdAt: "20 มี.ค. 2569", lostReason: "งบประมาณ" },
  { id: "#L-41213", numId: 213, name: "บจ. เชียงรายสตอเรจ", company: "บจ. เชียงรายสตอเรจ", contact: "คุณกาญจนา อ.", phone: "0802-123-1161", province: "เชียงราย", product: "อาคารสำเร็จรูปทุกประเภท", category: "อาคารสำเร็จรูปทุกประเภท", status: "QUOTED", value: "฿5.0M", assigned: "จินตนา ข.", dealerCode: "CRI", source: "แนะนำต่อ", createdAt: "8 มิ.ย. 2569" },
  { id: "#L-41214", numId: 214, name: "บจ. เชียงรายฟู้ดส์", company: "บจ. เชียงรายฟู้ดส์", contact: "คุณมานพ จ.", phone: "0802-126-1182", province: "เชียงราย", product: "งานรีโนเวท", category: "งานรีโนเวท", status: "PAID", value: "฿3.7M", assigned: "กาญจนา ด.", dealerCode: "CRI", source: "Facebook", createdAt: "23 มี.ค. 2569" },
  { id: "#L-41215", numId: 215, name: "บจ. เชียงรายแพ็คเกจจิ้ง", company: "บจ. เชียงรายแพ็คเกจจิ้ง", contact: "คุณนภา ต.", phone: "0802-129-1203", province: "เชียงราย", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "BULLET", value: "฿2.4M", assigned: "มานพ ป.", dealerCode: "CRI", source: "ลูกค้าเข้ามาเอง", createdAt: "11 มิ.ย. 2569" },
  { id: "#L-41216", numId: 216, name: "บจ. นครสวรรค์พลาสติก", company: "บจ. นครสวรรค์พลาสติก", contact: "คุณสมชาย ว.", phone: "0803-121-1147", province: "นครสวรรค์", product: "โรงงานอาหาร", category: "โรงงานอาหาร", status: "WAITING", value: "฿3.8M", assigned: "สุดา อ.", dealerCode: "NSN", source: "LINE", createdAt: "25 เม.ย. 2569" },
  { id: "#L-41217", numId: 217, name: "บจ. นครสวรรค์อุตสาหกรรม", company: "บจ. นครสวรรค์อุตสาหกรรม", contact: "คุณธนา ก.", phone: "0803-124-1168", province: "นครสวรรค์", product: "สนามกีฬาในร่ม", category: "สนามกีฬาในร่ม", status: "FOLLOWUP", value: "฿2.5M", assigned: "สมชาย จ.", dealerCode: "NSN", source: "งานแสดงสินค้า", createdAt: "13 ม.ค. 2569" },
  { id: "#L-41218", numId: 218, name: "บจ. นครสวรรค์เทรดดิ้ง", company: "บจ. นครสวรรค์เทรดดิ้ง", contact: "คุณอนันต์ ช.", phone: "0803-127-1189", province: "นครสวรรค์", product: "ต่อเติมอาคาร", category: "ต่อเติมอาคาร", status: "CANCELLED", value: "฿1.2M", assigned: "ธนา ต.", dealerCode: "NSN", source: "เว็บไซต์", createdAt: "1 เม.ย. 2569", lostReason: "ลูกค้าเลื่อน" },
  { id: "#L-41219", numId: 219, name: "บจ. นครสวรรค์เกษตร", company: "บจ. นครสวรรค์เกษตร", contact: "คุณสุดา น.", phone: "0803-130-1210", province: "นครสวรรค์", product: "โรงงาน", category: "โรงงาน", status: "QUOTED", value: "฿6.1M", assigned: "อนันต์ ม.", dealerCode: "NSN", source: "แนะนำต่อ", createdAt: "16 ม.ค. 2569" },
  { id: "#L-41220", numId: 220, name: "บจ. สงขลาคอนสตรัคชั่น", company: "บจ. สงขลาคอนสตรัคชั่น", contact: "คุณปรีชา ด.", phone: "0804-128-1196", province: "สงขลา", product: "งานตามแบบของลูกค้า", category: "งานตามแบบของลูกค้า", status: "WAITING", value: "฿4.9M", assigned: "ศิริพร น.", dealerCode: "HYI", source: "LINE", createdAt: "6 พ.ค. 2569" },
  { id: "#L-41221", numId: 221, name: "บจ. สงขลาอิเล็กทรอนิกส์", company: "บจ. สงขลาอิเล็กทรอนิกส์", contact: "คุณวีระ ป.", phone: "0804-131-1217", province: "สงขลา", product: "โรงงานอาหาร", category: "โรงงานอาหาร", status: "FOLLOWUP", value: "฿3.6M", assigned: "ปรีชา ว.", dealerCode: "HYI", source: "งานแสดงสินค้า", createdAt: "21 ก.พ. 2569" },
  { id: "#L-41222", numId: 222, name: "บจ. สงขลาฟาร์ม", company: "บจ. สงขลาฟาร์ม", contact: "คุณวิภา ส.", phone: "0804-134-1238", province: "สงขลา", product: "สนามกีฬาในร่ม", category: "สนามกีฬาในร่ม", status: "CANCELLED", value: "฿2.3M", assigned: "วีระ ก.", dealerCode: "HYI", source: "เว็บไซต์", createdAt: "9 พ.ค. 2569", lostReason: "ติดต่อไม่ได้" },
  { id: "#L-41223", numId: 223, name: "บจ. สงขลาโลจิสติกส์", company: "บจ. สงขลาโลจิสติกส์", contact: "คุณศิริพร ข.", phone: "0804-137-1259", province: "สงขลา", product: "ต่อเติมอาคาร", category: "ต่อเติมอาคาร", status: "QUOTED", value: "฿980K", assigned: "วิภา ช.", dealerCode: "HYI", source: "แนะนำต่อ", createdAt: "24 ก.พ. 2569" },
  { id: "#L-41224", numId: 224, name: "บจ. สงขลาคอนสตรัคชั่น", company: "บจ. สงขลาคอนสตรัคชั่น", contact: "คุณปรีชา ด.", phone: "0804-140-1280", province: "สงขลา", product: "โรงงาน", category: "โรงงาน", status: "PAID", value: "฿5.9M", assigned: "ศิริพร น.", dealerCode: "HYI", source: "Facebook", createdAt: "12 พ.ค. 2569" },
  { id: "#L-41225", numId: 225, name: "บจ. พระนครศรีอยุธยาสตอเรจ", company: "บจ. พระนครศรีอยุธยาสตอเรจ", contact: "คุณกาญจนา อ.", phone: "0805-135-1245", province: "พระนครศรีอยุธยา", product: "โรงยิมอเนกประสงค์", category: "โรงยิมอเนกประสงค์", status: "WAITING", value: "฿6.0M", assigned: "จินตนา ข.", dealerCode: "AYA", source: "LINE", createdAt: "14 มิ.ย. 2569" },
  { id: "#L-41226", numId: 226, name: "บจ. พระนครศรีอยุธยาฟู้ดส์", company: "บจ. พระนครศรีอยุธยาฟู้ดส์", contact: "คุณมานพ จ.", phone: "0805-138-1266", province: "พระนครศรีอยุธยา", product: "งานตามแบบของลูกค้า", category: "งานตามแบบของลูกค้า", status: "FOLLOWUP", value: "฿4.7M", assigned: "กาญจนา ด.", dealerCode: "AYA", source: "งานแสดงสินค้า", createdAt: "2 มี.ค. 2569" },
  { id: "#L-41227", numId: 227, name: "บจ. พระนครศรีอยุธยาแพ็คเกจจิ้ง", company: "บจ. พระนครศรีอยุธยาแพ็คเกจจิ้ง", contact: "คุณนภา ต.", phone: "0805-141-1287", province: "พระนครศรีอยุธยา", product: "โรงงานอาหาร", category: "โรงงานอาหาร", status: "CANCELLED", value: "฿3.4M", assigned: "มานพ ป.", dealerCode: "AYA", source: "เว็บไซต์", createdAt: "17 มิ.ย. 2569", lostReason: "อื่นๆ" },
  { id: "#L-41228", numId: 228, name: "บจ. พระนครศรีอยุธยาเมทัล", company: "บจ. พระนครศรีอยุธยาเมทัล", contact: "คุณจินตนา ม.", phone: "0805-144-1308", province: "พระนครศรีอยุธยา", product: "สนามกีฬาในร่ม", category: "สนามกีฬาในร่ม", status: "QUOTED", value: "฿2.1M", assigned: "นภา ส.", dealerCode: "AYA", source: "แนะนำต่อ", createdAt: "5 มี.ค. 2569" },
  { id: "#L-41229", numId: 229, name: "บจ. พระนครศรีอยุธยาสตอเรจ", company: "บจ. พระนครศรีอยุธยาสตอเรจ", contact: "คุณกาญจนา อ.", phone: "0805-147-1329", province: "พระนครศรีอยุธยา", product: "ต่อเติมอาคาร", category: "ต่อเติมอาคาร", status: "PAID", value: "฿780K", assigned: "จินตนา ข.", dealerCode: "AYA", source: "Facebook", createdAt: "20 มิ.ย. 2569" },
  { id: "#L-41230", numId: 230, name: "บจ. พระนครศรีอยุธยาฟู้ดส์", company: "บจ. พระนครศรีอยุธยาฟู้ดส์", contact: "คุณมานพ จ.", phone: "0805-150-1350", province: "พระนครศรีอยุธยา", product: "โรงงาน", category: "โรงงาน", status: "BULLET", value: "฿5.7M", assigned: "กาญจนา ด.", dealerCode: "AYA", source: "ลูกค้าเข้ามาเอง", createdAt: "8 มี.ค. 2569" },
  { id: "#L-41231", numId: 231, name: "บจ. ขอนแก่นเกษตร", company: "บจ. ขอนแก่นเกษตร", contact: "คุณสุดา น.", phone: "0806-142-1294", province: "ขอนแก่น", product: "โรงงานอิเล็กทรอนิกส์", category: "โรงงานอิเล็กทรอนิกส์", status: "WAITING", value: "฿880K", assigned: "อนันต์ ม.", dealerCode: "KKN", source: "LINE", createdAt: "22 ม.ค. 2569" },
  { id: "#L-41232", numId: 232, name: "บจ. ขอนแก่นพลาสติก", company: "บจ. ขอนแก่นพลาสติก", contact: "คุณสมชาย ว.", phone: "0806-145-1315", province: "ขอนแก่น", product: "โรงยิมอเนกประสงค์", category: "โรงยิมอเนกประสงค์", status: "FOLLOWUP", value: "฿5.8M", assigned: "สุดา อ.", dealerCode: "KKN", source: "งานแสดงสินค้า", createdAt: "10 เม.ย. 2569" },
  { id: "#L-41233", numId: 233, name: "บจ. ขอนแก่นอุตสาหกรรม", company: "บจ. ขอนแก่นอุตสาหกรรม", contact: "คุณธนา ก.", phone: "0806-148-1336", province: "ขอนแก่น", product: "งานตามแบบของลูกค้า", category: "งานตามแบบของลูกค้า", status: "CANCELLED", value: "฿4.5M", assigned: "สมชาย จ.", dealerCode: "KKN", source: "เว็บไซต์", createdAt: "25 ม.ค. 2569", lostReason: "ราคา" },
  { id: "#L-41234", numId: 234, name: "บจ. ขอนแก่นเทรดดิ้ง", company: "บจ. ขอนแก่นเทรดดิ้ง", contact: "คุณอนันต์ ช.", phone: "0806-151-1357", province: "ขอนแก่น", product: "โรงงานอาหาร", category: "โรงงานอาหาร", status: "QUOTED", value: "฿3.2M", assigned: "ธนา ต.", dealerCode: "KKN", source: "แนะนำต่อ", createdAt: "13 เม.ย. 2569" },
  { id: "#L-41235", numId: 235, name: "บจ. อุบลราชธานีโลจิสติกส์", company: "บจ. อุบลราชธานีโลจิสติกส์", contact: "คุณศิริพร ข.", phone: "0807-149-1343", province: "อุบลราชธานี", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "WAITING", value: "฿2.0M", assigned: "วิภา ช.", dealerCode: "UBN", source: "LINE", createdAt: "3 ก.พ. 2569" },
  { id: "#L-41236", numId: 236, name: "บจ. อุบลราชธานีคอนสตรัคชั่น", company: "บจ. อุบลราชธานีคอนสตรัคชั่น", contact: "คุณปรีชา ด.", phone: "0807-152-1364", province: "อุบลราชธานี", product: "โรงงานอิเล็กทรอนิกส์", category: "โรงงานอิเล็กทรอนิกส์", status: "FOLLOWUP", value: "฿680K", assigned: "ศิริพร น.", dealerCode: "UBN", source: "งานแสดงสินค้า", createdAt: "18 พ.ค. 2569" },
  { id: "#L-41237", numId: 237, name: "บจ. อุบลราชธานีอิเล็กทรอนิกส์", company: "บจ. อุบลราชธานีอิเล็กทรอนิกส์", contact: "คุณวีระ ป.", phone: "0807-155-1385", province: "อุบลราชธานี", product: "โรงยิมอเนกประสงค์", category: "โรงยิมอเนกประสงค์", status: "CANCELLED", value: "฿5.6M", assigned: "ปรีชา ว.", dealerCode: "UBN", source: "เว็บไซต์", createdAt: "6 ก.พ. 2569", lostReason: "คู่แข่ง" },
  { id: "#L-41238", numId: 238, name: "บจ. อุบลราชธานีฟาร์ม", company: "บจ. อุบลราชธานีฟาร์ม", contact: "คุณวิภา ส.", phone: "0807-158-1406", province: "อุบลราชธานี", product: "งานตามแบบของลูกค้า", category: "งานตามแบบของลูกค้า", status: "QUOTED", value: "฿4.3M", assigned: "วีระ ก.", dealerCode: "UBN", source: "แนะนำต่อ", createdAt: "21 พ.ค. 2569" },
  { id: "#L-41239", numId: 239, name: "บจ. อุบลราชธานีโลจิสติกส์", company: "บจ. อุบลราชธานีโลจิสติกส์", contact: "คุณศิริพร ข.", phone: "0807-161-1427", province: "อุบลราชธานี", product: "โรงงานอาหาร", category: "โรงงานอาหาร", status: "PAID", value: "฿3.0M", assigned: "วิภา ช.", dealerCode: "UBN", source: "Facebook", createdAt: "9 ก.พ. 2569" },
  { id: "#L-41240", numId: 240, name: "บจ. ภูเก็ตเมทัล", company: "บจ. ภูเก็ตเมทัล", contact: "คุณจินตนา ม.", phone: "0808-156-1392", province: "ภูเก็ต", product: "งานรีโนเวท", category: "งานรีโนเวท", status: "WAITING", value: "฿3.1M", assigned: "นภา ส.", dealerCode: "PKT", source: "LINE", createdAt: "11 มี.ค. 2569" },
  { id: "#L-41241", numId: 241, name: "บจ. ภูเก็ตสตอเรจ", company: "บจ. ภูเก็ตสตอเรจ", contact: "คุณกาญจนา อ.", phone: "0808-159-1413", province: "ภูเก็ต", product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป", status: "FOLLOWUP", value: "฿1.8M", assigned: "จินตนา ข.", dealerCode: "PKT", source: "งานแสดงสินค้า", createdAt: "26 มิ.ย. 2569" },
  { id: "#L-41242", numId: 242, name: "บจ. ภูเก็ตฟู้ดส์", company: "บจ. ภูเก็ตฟู้ดส์", contact: "คุณมานพ จ.", phone: "0808-162-1434", province: "ภูเก็ต", product: "โรงงานอิเล็กทรอนิกส์", category: "โรงงานอิเล็กทรอนิกส์", status: "CANCELLED", value: "฿480K", assigned: "กาญจนา ด.", dealerCode: "PKT", source: "เว็บไซต์", createdAt: "14 มี.ค. 2569", lostReason: "งบประมาณ" },
  { id: "#L-41243", numId: 243, name: "บจ. ภูเก็ตแพ็คเกจจิ้ง", company: "บจ. ภูเก็ตแพ็คเกจจิ้ง", contact: "คุณนภา ต.", phone: "0808-165-1455", province: "ภูเก็ต", product: "โรงยิมอเนกประสงค์", category: "โรงยิมอเนกประสงค์", status: "QUOTED", value: "฿5.4M", assigned: "มานพ ป.", dealerCode: "PKT", source: "แนะนำต่อ", createdAt: "2 มิ.ย. 2569" },
  { id: "#L-41244", numId: 244, name: "บจ. ภูเก็ตเมทัล", company: "บจ. ภูเก็ตเมทัล", contact: "คุณจินตนา ม.", phone: "0808-168-1476", province: "ภูเก็ต", product: "งานตามแบบของลูกค้า", category: "งานตามแบบของลูกค้า", status: "PAID", value: "฿4.1M", assigned: "นภา ส.", dealerCode: "PKT", source: "Facebook", createdAt: "17 มี.ค. 2569" },
  { id: "#L-41245", numId: 245, name: "บจ. ภูเก็ตสตอเรจ", company: "บจ. ภูเก็ตสตอเรจ", contact: "คุณกาญจนา อ.", phone: "0808-171-1497", province: "ภูเก็ต", product: "โรงงานอาหาร", category: "โรงงานอาหาร", status: "BULLET", value: "฿2.8M", assigned: "จินตนา ข.", dealerCode: "PKT", source: "ลูกค้าเข้ามาเอง", createdAt: "5 มิ.ย. 2569" },
];

// ─── CUSTOMER ROWS (rich, shared app-wide via SalesContext) ───
// แหล่งความจริงเดียวของ "ลูกค้า" ที่ใช้ทั้งหน้า ลูกค้า / ใบเสนอราคา / การแปลงจากลูกค้าเป้าหมาย
export type CustomerStatus = "active" | "inactive";
// บันทึกการติดต่อลูกค้า (โทร/อีเมล/ประชุม ฯลฯ) — persist จริงผ่าน updateCustomer
export type CustomerContact = { id:number; date:string; icon:string; text:string; type:string };
export type CustomerRow = {
  id:number; name:string; company:string; email:string; phone:string;
  address?:string;   // ที่อยู่เต็ม — กรอกเองในหน้าลูกค้า · ลูกค้าเก่าที่ยังไม่กรอกจะว่าง (แสดง "—")
  province:string; category:string; status:CustomerStatus; projects:number;
  joinDate:string; owner:string; initials:string; color:string;
  totalValue:number; contacts?:CustomerContact[];
  logo?:string;   // รูป/โลโก้ลูกค้า (base64) — อัปโหลด/แก้ไขในแท็บ "ข้อมูล"
  imported?:boolean; // ลูกค้าเดิมที่นำเข้า/คีย์มือ (ไม่ได้ผ่าน Lead→Won) — สำหรับข้อมูลลูกค้าก่อนมีระบบ
  dealerCode?:string; // สาขาเจ้าของ (multi-tenant) — undefined = สาขา CNX (สมุดงานเดิม)
};

export const initialCustomers: CustomerRow[] = [
  { id:1, name:"คุณสมชาย ใจดี",      company:"บจ. ไทยสตีล", email:"somchai@thaisteel.co.th",  phone:"081-234-5678", province:"นนทบุรี",       category:"โกดังสำเร็จรูป",  status:"active",   projects:2, joinDate:"2025-09-15", owner:"สมชาย เชียงใหม่",  initials:"สช", color:"#003366", totalValue: 2610000 },
  { id:2, name:"คุณกาญจนา ม.",        company:"บจ. ซีซีเอส", email:"kanjana@ccs.co.th",        phone:"082-345-6789", province:"เชียงใหม่",    category:"โรงงาน", status:"active",   projects:1, joinDate:"2025-11-03", owner:"วิภา รัตนกุล",    initials:"กม", color:"#059669", totalValue: 3200600 },
  { id:3, name:"คุณประยุทธ ร.",        company:"หจก. ราชบุรีโลหะ", email:"prayuth@rajburi.co.th",    phone:"083-456-7890", province:"ราชบุรี",      category:"โรงงาน", status:"active",   projects:1, joinDate:"2026-01-20", owner:"วิภา รัตนกุล",    initials:"ปร", color:"#f59e0b", totalValue: 759200 },
  { id:4, name:"คุณดารัล ส.",          company:"บจ. สมุทรโกดัง", email:"darat@smgodown.co.th",     phone:"084-567-8901", province:"สมุทรปราการ", category:"โกดังสำเร็จรูป",  status:"active",   projects:2, joinDate:"2026-02-10", owner:"สมชาย เชียงใหม่",  initials:"ดส", color:"#dc2626", totalValue: 2000250 },
  { id:5, name:"VCS Asia (ระยอง)",     company:"VCS Asia Co., Ltd.", email:"vcs@vcsasia.com",           phone:"085-678-9012", province:"ระยอง",        category:"โรงงาน", status:"inactive", projects:3, joinDate:"2025-08-01", owner:"วิชัย ประสิทธิ์",  initials:"VC", color:"#002244", totalValue: 10848800 },
  { id:6, name:"คุณสุรัตน์ ล.",        company:"บจ. แม่สอดโลหะ", email:"surat@maesot.co.th",       phone:"086-789-0123", province:"ตาก",           category:"โกดังสำเร็จรูป",  status:"active",   projects:1, joinDate:"2025-12-01", owner:"สมชาย เชียงใหม่",  initials:"สล", color:"#8fa3b8", totalValue: 4099500 },
  { id:7, name:"บจ. อุตรดิตถ์โลหะ",   company:"บจ. อุตรดิตถ์โลหะ", email:"info@uttaradit.co.th",      phone:"087-890-1234", province:"อุตรดิตถ์",    category:"โรงงาน",status:"inactive", projects: 1, joinDate:"2026-06-01", owner:"วิภา รัตนกุล",    initials:"อต", color:"#8fa3b8", totalValue: 2800000 },
  { id:8, name:"บจ. นครสวรรค์โลหะ",   company:"บจ. นครสวรรค์โลหะ", email:"nakhon@nsloha.co.th",      phone:"088-901-2345", province:"นครสวรรค์",    category:"อาคารสำเร็จรูปทุกประเภท", status:"active",   projects:2, joinDate:"2025-07-15", owner:"กาญจนา มีสุข",    initials:"นส", color:"#059669", totalValue: 7831200 },
  { id:9, name:"คุณวิทยา ท.",          company:"บจ. ทีทีวาย อินเตอร์", email:"wittaya@ttyinter.com",     phone:"086-789-0123", province:"นครสวรรค์",    category:"โกดังสำเร็จรูป", status:"active", projects:1, joinDate:"2026-06-28", owner:"สมชาย เชียงใหม่", initials:"ทท", color:"#003366", totalValue:5400000 },
  { id:10, name:"คุณอรทัย พ.",         company:"บจ. ลำปางแพ็คเกจจิ้ง", email:"orathai@lpkg.co.th",       phone:"089-111-2233", province:"ลำปาง",        category:"โรงงาน", status:"active", projects:1, joinDate:"2026-06-20", owner:"วิภา รัตนกุล", initials:"ลป", color:"#059669", totalValue:3600000, contacts:[ { id:1, date:"20 มิ.ย. 2569", icon:"meeting", text:"เซ็นสัญญาซื้อขายโรงงาน ฿3.6M", type:"meeting" } ] },
  { id:11, name:"คุณประเสริฐ อ.",      company:"บจ. เอกชัยสตอเรจ", email:"prasert@ekachai.co.th",    phone:"089-333-2211", province:"ลำปาง",        category:"โกดังสำเร็จรูป", status:"active", projects:2, joinDate:"2025-10-12", owner:"กาญจนา มีสุข", initials:"อช", color:"#003366", totalValue: 2450250 },
  { id:12, name:"คุณนภา ว.",           company:"คุณนภา วงศ์สวรรค์",  email:"napa.w@gmail.com",          phone:"089-444-3322", province:"เชียงใหม่",    category:"อาคารสำเร็จรูปทุกประเภท", status:"active", projects:1, joinDate:"2026-03-05", owner:"วิภา รัตนกุล", initials:"นภ", color:"#f59e0b", totalValue: 679200 },
  { id:13, name:"คุณกิตติ ธ.",          company:"หจก. พะเยาเทรดดิ้ง", email:"kitti@phayaotrading.co.th", phone:"089-555-4433", province:"พะเยา",        category:"โรงงาน", status:"inactive", projects: 1, joinDate:"2025-09-01", owner:"สมชาย เชียงใหม่", initials:"พย", color:"#8fa3b8", totalValue: 1149200 },
];

// ─── แม่แบบอาคาร (แคตตาล็อก) ลบแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 ───
//   ตาราง master_catalog ในฐานยังเก็บข้อมูลไว้ (ห้าม drop) แต่ไม่มีโค้ดแอปไหนใช้ · ตัวตรวจ scripts/check-no-catalog.mjs

// ── รหัสลูกค้า — แหล่งเดียวของทั้งระบบ (ฝั่งดีลเลอร์และฝั่ง HQ ต้องได้รหัสเดียวกัน) ──
// รูปแบบ: {รหัสดีลเลอร์}-{เลขนับ 5 หลัก} เช่น CNX-00001
// ทำไมต้องมีรหัสดีลเลอร์นำหน้า: id ลูกค้าเป็นเลขนับ "ของแต่ละสาขา" ไม่ใช่ของทั้งเครือ
// ถ้าใช้แค่ CUS-00001 พอ HQ เอาทุกสาขามารวม เลขจะซ้ำกันข้ามสาขาทันที (ลูกค้าคนละคนรหัสเดียวกัน)
export function customerCode(dealerCode: string, localId: number): string {
  return `${dealerCode}-${String(localId).padStart(5, "0")}`;
}



// แปลงวันที่ ISO ("2026-06-30") → ไทย พ.ศ. ("30 มิ.ย. 2569") · ใช้แสดงวันนัดหมายทุกจุด
const _THAI_MO_ABBR = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
export function fmtISOToThai(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "—";
  return `${parseInt(m[3])} ${_THAI_MO_ABBR[parseInt(m[2]) - 1]} ${parseInt(m[1]) + 543}`;
}

// ─── QUOTATIONS ───────────────────────────────────────────────
// สถานะ "viewed" (เปิดอ่านแล้ว) ถูกลบทั้งฟีเจอร์ตามที่บอสสั่ง — ระบบไม่มีการติดตามการเปิดอ่านจริงอยู่แล้ว
export type QuotationStatus = "draft" | "sent_to_client" | "won" | "lost" | "expired";

// รายการสินค้าในใบเสนอราคา (BOQ) — ราคา/หน่วยดึงจากราคากลาง HQ (แคตตาล็อกแม่แบบ) แก้ได้
export type QuoteLineItem = {
  id?: string; name: string; qty: number; unit: string; unitPrice: number;
  /** ใบที่ทำจากใบ HQ (ด่าน 3): % ที่ดีลเลอร์บวกบนต้นทุนของบรรทัดนี้ — ฐานข้อมูลคิดราคาจากค่านี้ (ราคาที่ส่งมาไม่มีผล) */
  markupPct?: number;
};

// หนึ่งรอบของการต่อรองราคา — ยอดก่อน → ยอดหลัง พร้อมเวลาที่เปลี่ยน
// at = เวลาไทยแบบ "2026-08-19T14:05:00" (ฐานข้อมูลแปลงมาให้แล้ว) · by = รหัสผู้ใช้ที่แก้
export type PriceChange = { at: string; from: number; to: number; by?: string; note?: string };

// ส่วนต่างของการต่อรองทั้งใบ: ยอดตั้งต้น → ยอดปัจจุบัน · ลดไปเท่าไร กี่เปอร์เซ็นต์ กี่รอบ
// ไม่มีประวัติ = ยังไม่เคยต่อรอง → คืน null (หน้าจอขึ้น "—" ไม่ใช่ 0%)
export function negotiationSummary(q: Pick<QuotationMock, "priceHistory" | "totalValue">):
  { first: number; last: number; diff: number; pct: number; rounds: number } | null {
  const h = q.priceHistory ?? [];
  if (!h.length) return null;
  const first = h[0].from;
  const last = h[h.length - 1].to;
  const diff = last - first;
  return { first, last, diff, pct: first > 0 ? (diff / first) * 100 : 0, rounds: h.length };
}

export type QuotationMock = {
  id: string; customer: string; project: string;
  total: string; totalValue: number;
  materialCost: number;
  province: string; buildingType: string; area: number;
  status: QuotationStatus; date: string; items: number;
  lineItems?: QuoteLineItem[]; // รายการสินค้าจริง (BOQ) — items=ความยาว, materialCost=Σ(qty×unitPrice)
  customerId: number;
  projectId: number;
  dealId?: number;   // ผูกกับดีล (LeadRow.numId) — 1 Deal → หลาย Revision ใบเสนอราคา
  revision?: string; // เวอร์ชันใบเสนอราคา V1/V2/V3
  expiry?: string;   // วันหมดอายุใบเสนอราคา (Expiry Date)
  note?: string;        // หมายเหตุ
  lostReason?: string;  // เหตุผลที่ลูกค้าปฏิเสธ (เมื่อ status = lost) — ตัวเลือกมาจาก HQ (getLostReasons ร่วมกับลูกค้าเป้าหมาย)
  // สแนปช็อต % VAT ณ ตอนสร้างใบ — พิมพ์ซ้ำทีหลังใช้ค่านี้เสมอ ไม่ใช้ VAT ปัจจุบันของ HQ (ใบเก่าที่ไม่มีค่านี้ = fallback ไปใช้ hqPolicy.vat)
  vatPercent?: number;
  /** จำนวนเงิน VAT (บาท) — สแนปช็อตคู่กับอัตราข้างบน */
  vatAmount?: number;
  /** อัตราภาษีหัก ณ ที่จ่าย (%) — 0 หรือไม่ระบุ = ไม่หัก (บอสสั่ง 28 ส.ค. 69) */
  whtRate?: number;
  /** จำนวนเงินภาษีหัก ณ ที่จ่าย (บาท) — คิดจากยอดก่อน VAT ตามหลักสรรพากร */
  whtAmount?: number;
  /** ยอดรวมเป็นเงิน = ยอดก่อน VAT + VAT */
  totalAmount?: number;
  /** ยอดชำระสุทธิ = ยอดรวม − หัก ณ ที่จ่าย
   *  ⚠️ เก็บไว้ทำรายงานภายหลัง — ยังไม่ใช้แทน totalValue (ยอดขายของรายงาน/เป้ายังเป็นยอดก่อน VAT) */
  netPayable?: number;
  // paymentTerms / deliveryTime ถูกลบตามที่บอสสั่ง — มีที่เก็บแต่ไม่มีช่องกรอก ขึ้น "—" ทุกใบ
  // (HQCustomer.deliveryTime เป็นคนละตัว ฝั่ง HQ ยังใช้คิดวันส่งมอบอยู่ ไม่แตะ)
  issuer?: IssuerProfile; // สแนปช็อตโปรไฟล์บริษัทผู้ออก ณ ตอนสร้าง — ใบเก่าคงชื่อเดิมแม้เปลี่ยนโปรไฟล์
  // ประวัติการต่อรองราคา — ฐานข้อมูลเขียนให้เองทุกครั้งที่ยอดรวมเปลี่ยน (trigger 0148)
  // ⚠️ อ่านอย่างเดียว: แอปไม่ส่งค่านี้กลับไปเขียน (quoteToRow ตัดทิ้ง) ไม่งั้นสำเนาเก่าจะทับประวัติจริง
  priceHistory?: PriceChange[];
  dealerCode?: string; // สาขาเจ้าของ (multi-tenant) — undefined = สาขา CNX (สมุดงานเดิม)
  /** เวลาที่ "ระบบบันทึกแถวนี้" (ฐานข้อมูลใส่ให้เอง) — ไม่ใช่วันที่ปิดการขาย
   *  ใช้ทำกราฟรายชั่วโมงของวันนี้เท่านั้น (บอสเลือกทาง ก · 25 ส.ค. 69)
   *  ⚠️ อ่านอย่างเดียว ห้ามส่งกลับไปเขียน — ฐานข้อมูลเป็นเจ้าของ */
  savedAt?: string;
  /** ใบ HQ ที่ใบนี้ทำจาก (ด่าน 3 · 0201) — ใบใหม่ทุกใบต้องมี · ว่าง = ใบแบบเดิม (ก่อนปิดทางเดิม) ดูได้อย่างเดียวเรื่องราคา */
  hqQuoteId?: number | null;
  /** % ที่บวกทั้งใบ (บรรทัดที่ไม่ได้ตั้ง % เองใช้ค่านี้) */
  markupPercent?: number | null;
  /** เหตุที่หมดอายุ (เช่น ใบ HQ หมดอายุ / มีเวอร์ชันใหม่) — ฐานข้อมูลเขียนให้ */
  expiredReason?: string | null;
};

// สถานะใบเสนอราคาตามสเปก: Draft / Sent / Viewed / Accepted / Rejected / Expired
export const quotationStatusLabel: Record<QuotationStatus, string> = {
  draft: "ร่าง", sent_to_client: "ส่งแล้ว",
  won: "ตอบรับ", lost: "ปฏิเสธ", expired: "หมดอายุ",
};
export const quotationStatusColor: Record<QuotationStatus, { bg: string; text: string }> = {
  draft:          { bg: "#f0f0f5", text: "#6b7280" },
  sent_to_client: { bg: "#dce5f0", text: "#003366" },
  won:            { bg: "#e5faf0", text: "#059669" },
  lost:           { bg: "#f5f5f5", text: "#9ca3af" },
  expired:        { bg: "#f5f5f5", text: "#9ca3af" },
};

export const quotations: QuotationMock[] = [
  { id: "Q-2026-0096", customer: "บจ. ทีทีวาย อินเตอร์", project: "โกดังสำเร็จรูป ทีทีวาย", total: "฿5,400,000", totalValue: 5400000, materialCost: 5400000, province: "นครสวรรค์", buildingType: "โกดังสำเร็จรูป", area: 2400, status: "won", date: "2026-06-28", items: 10, customerId: 9, projectId: 0 },
  { id: "Q-2026-0089", customer: "บจ. ไทยสตีล", project: "โกดังสำเร็จรูป บจ. ไทยสตีล", total: "฿1,800,000", totalValue: 1800000, materialCost: 1800000, province: "นนทบุรี", buildingType: "โกดังสำเร็จรูป", area: 960, status: "won", date: "2026-05-15", items: 8, customerId: 1, projectId: 1 },
  { id: "Q-2026-0091", customer: "หจก. ราชบุรีโลหะ", project: "โกดังสำเร็จรูป ราชบุรี", total: "฿760,000", totalValue: 760000, materialCost: 760000, province: "ราชบุรี", buildingType: "โกดังสำเร็จรูป", area: 480, status: "sent_to_client", date: "2026-06-01", items: 5, customerId: 3, projectId: 5 },
  { id: "Q-2026-0092", customer: "VCS Asia", project: "โกดังระยอง VCS Asia", total: "฿6,200,000", totalValue: 6200000, materialCost: 6200000, province: "ระยอง", buildingType: "โรงงาน", area: 3200, status: "won", date: "2025-11-10", items: 15, customerId: 5, projectId: 8 },
  { id: "Q-2026-0095", customer: "บจ. ซีซีเอส", project: "โรงงาน อาคารสำเร็จรูป เชียงใหม่", total: "฿3,200,000", totalValue: 3200000, materialCost: 3200000, province: "เชียงใหม่", buildingType: "โรงงาน", area: 1800, status: "sent_to_client", date: "2026-06-10", items: 12, customerId: 2, projectId: 2 },
  { id: "Q-2026-0097", customer: "บจ. สมุทรโกดัง", project: "โกดังปากน้ำ พระปราชญ์", total: "฿2,000,000", totalValue: 2000000, materialCost: 2000000, province: "สมุทรปราการ", buildingType: "โกดังสำเร็จรูป", area: 1200, status: "sent_to_client", date: "2026-06-18", items: 7, customerId: 4, projectId: 3 },
  { id: "Q-2026-0098", customer: "บจ. อุตรดิตถ์โลหะ", project: "อาคารสำเร็จรูป อุตรดิตถ์", total: "฿2,800,000", totalValue: 2800000, materialCost: 2800000, province: "อุตรดิตถ์", buildingType: "โรงงาน", area: 1600, status: "won", date: "2026-06-20", items: 9, customerId: 7, projectId: 7 },
  { id: "Q-2026-0099", customer: "บจ. นครสวรรค์โลหะ", project: "โรงงานสำเร็จรูป นครสวรรค์", total: "฿5,400,000", totalValue: 5400000, materialCost: 5400000, province: "นครสวรรค์", buildingType: "โรงงาน", area: 2800, status: "won", date: "2026-04-05", items: 18, customerId: 8, projectId: 6 },
  { id: "Q-2026-0100", customer: "บจ. เชียงรายเมทัล", project: "โกดังสำเร็จรูป เชียงราย", total: "฿1,500,000", totalValue: 1500000, materialCost: 1500000, province: "เชียงราย", buildingType: "โกดังสำเร็จรูป", area: 720, status: "lost", date: "2026-05-28", items: 6, customerId: 0, projectId: 9 },
  { id: "Q-2026-0101", customer: "บจ. พิษณุโลกฟาร์ม", project: "โกดังเก็บข้าว พิษณุโลก", total: "฿2,700,000", totalValue: 2700000, materialCost: 2700000, province: "พิษณุโลก", buildingType: "โกดังสำเร็จรูป", area: 1400, status: "sent_to_client", date: "2026-06-19", items: 9, customerId: 0, projectId: 0, expiry: "2026-07-19" },
  { id: "Q-2026-0102", customer: "บจ. ลำพูนอิเล็กทรอนิกส์", project: "โรงงานชิ้นส่วนอิเล็กทรอนิกส์ ลำพูน", total: "฿4,800,000", totalValue: 4800000, materialCost: 4800000, province: "ลำพูน", buildingType: "โรงงานอิเล็กทรอนิกส์", area: 2200, status: "sent_to_client", date: "2026-06-17", items: 14, customerId: 0, projectId: 0, expiry: "2026-07-17" },
  { id: "Q-2026-0103", customer: "บจ. แพร่วู้ดโปรดักส์", project: "โกดังเก็บไม้แปรรูป แพร่", total: "฿1,900,000", totalValue: 1900000, materialCost: 1900000, province: "แพร่", buildingType: "โกดังสำเร็จรูป", area: 1000, status: "sent_to_client", date: "2026-06-23", items: 7, customerId: 0, projectId: 0, expiry: "2026-07-23" },
  { id: "Q-2026-0104", customer: "บจ. ลำปางแพ็คเกจจิ้ง", project: "โรงงานบรรจุภัณฑ์ ลำปาง", total: "฿3,600,000", totalValue: 3600000, materialCost: 3600000, province: "ลำปาง", buildingType: "โรงงานอาหาร", area: 1800, status: "won", date: "2026-06-20", items: 12, customerId: 10, projectId: 0 },
  { id: "Q-2026-0105", customer: "หจก. เชียงใหม่ค้าวัสดุ", project: "รีโนเวทโกดัง เพิ่มชั้นลอย", total: "฿890,000", totalValue: 890000, materialCost: 890000, province: "เชียงใหม่", buildingType: "ต่อเติมอาคาร", area: 450, status: "sent_to_client", date: "2026-06-22", items: 5, customerId: 0, projectId: 0, expiry: "2026-07-22" },
  { id: "Q-2026-0106", customer: "โรงเรียนนานาชาติเชียงใหม่", project: "โรงยิมอเนกประสงค์ CMIS", total: "฿6,500,000", totalValue: 6500000, materialCost: 6500000, province: "เชียงใหม่", buildingType: "โรงยิมอเนกประสงค์", area: 2000, status: "sent_to_client", date: "2026-06-16", items: 16, customerId: 0, projectId: 0, expiry: "2026-07-16" },
  { id: "Q-2026-0107", customer: "บจ. เชียงรายฟู้ดส์", project: "โรงงานแปรรูปอาหาร เชียงราย", total: "฿2,200,000", totalValue: 2200000, materialCost: 2200000, province: "เชียงราย", buildingType: "โรงงานอาหาร", area: 1100, status: "lost", date: "2026-06-05", items: 8, customerId: 0, projectId: 0, note: "แพ้ราคาผู้รับเหมาท้องถิ่น" },
  { id: "Q-2026-0108", customer: "บจ. เอกชัยสตอเรจ", project: "คลังสินค้า เฟส 2 ลำปาง", total: "฿1,650,000", totalValue: 1650000, materialCost: 1650000, province: "ลำปาง", buildingType: "โกดังสำเร็จรูป", area: 850, status: "expired", date: "2026-04-02", items: 6, customerId: 11, projectId: 0, expiry: "2026-05-02", note: "ลูกค้าเลื่อนโครงการ — ใบเสนอราคาหมดอายุ" },
  // ── ใบเสนอราคาที่ปิดการขาย เติมให้ครบตามจำนวนโครงการของลูกค้าแต่ละราย (บอสสั่ง) ──
  // เดิม seed มีลูกค้า 13 ราย แต่ใบที่ปิดจริงมีแค่ 5 ใบ → ลูกค้า 8 รายไม่มีที่มา
  // ทั้งที่ลูกค้าเกิดจากปิดการขายเท่านั้น → ทุกรายต้องมีอย่างน้อย 1 โครงการ
  // มูลค่า = พื้นที่ × ราคากลางต่อ ตร.ม. (BOQ จึงตรงกับมูลค่าใบเป๊ะ)
  // totalValue ของลูกค้า = ผลรวมใบที่ปิดจริงเสมอ
  { id: "Q-2026-0109", customer: "บจ. ไทยสตีล", project: "โกดังสำเร็จรูป ไทยสตีล เฟส 2", total: "฿810,000", totalValue: 810000, materialCost: 810000, province: "นนทบุรี", buildingType: "โกดังสำเร็จรูป", area: 360, status: "won", date: "2025-11-19", items: 1, lineItems: [{ name: "โกดังสำเร็จรูป", qty: 360, unit: "ตร.ม.", unitPrice: 2250 }], customerId: 1, projectId: 0, expiry: "2025-12-19" },
  { id: "Q-2026-0110", customer: "บจ. ซีซีเอส", project: "โรงงาน ซีซีเอส", total: "฿3,200,600", totalValue: 3200600, materialCost: 3200600, province: "เชียงใหม่", buildingType: "โรงงาน", area: 1231, status: "won", date: "2025-11-23", items: 1, lineItems: [{ name: "โรงงาน", qty: 1231, unit: "ตร.ม.", unitPrice: 2600 }], customerId: 2, projectId: 0, expiry: "2025-12-23" },
  { id: "Q-2026-0111", customer: "หจก. ราชบุรีโลหะ", project: "โรงงาน ราชบุรีโลหะ", total: "฿759,200", totalValue: 759200, materialCost: 759200, province: "ราชบุรี", buildingType: "โรงงาน", area: 292, status: "won", date: "2026-02-09", items: 1, lineItems: [{ name: "โรงงาน", qty: 292, unit: "ตร.ม.", unitPrice: 2600 }], customerId: 3, projectId: 0, expiry: "2026-03-11" },
  { id: "Q-2026-0112", customer: "บจ. สมุทรโกดัง", project: "โกดังสำเร็จรูป สมุทรโกดัง เฟส 1", total: "฿1,199,250", totalValue: 1199250, materialCost: 1199250, province: "สมุทรปราการ", buildingType: "โกดังสำเร็จรูป", area: 533, status: "won", date: "2026-03-02", items: 1, lineItems: [{ name: "โกดังสำเร็จรูป", qty: 533, unit: "ตร.ม.", unitPrice: 2250 }], customerId: 4, projectId: 0, expiry: "2026-04-01" },
  { id: "Q-2026-0113", customer: "บจ. สมุทรโกดัง", project: "โกดังสำเร็จรูป สมุทรโกดัง เฟส 2", total: "฿801,000", totalValue: 801000, materialCost: 801000, province: "สมุทรปราการ", buildingType: "โกดังสำเร็จรูป", area: 356, status: "won", date: "2026-04-16", items: 1, lineItems: [{ name: "โกดังสำเร็จรูป", qty: 356, unit: "ตร.ม.", unitPrice: 2250 }], customerId: 4, projectId: 0, expiry: "2026-05-16" },
  { id: "Q-2026-0114", customer: "VCS Asia Co., Ltd.", project: "โรงงาน VCS Asia Co., Ltd. เฟส 2", total: "฿2,789,800", totalValue: 2789800, materialCost: 2789800, province: "ระยอง", buildingType: "โรงงาน", area: 1073, status: "won", date: "2025-10-05", items: 1, lineItems: [{ name: "โรงงาน", qty: 1073, unit: "ตร.ม.", unitPrice: 2600 }], customerId: 5, projectId: 0, expiry: "2025-11-04" },
  { id: "Q-2026-0115", customer: "VCS Asia Co., Ltd.", project: "โรงงาน VCS Asia Co., Ltd. เฟส 3", total: "฿1,859,000", totalValue: 1859000, materialCost: 1859000, province: "ระยอง", buildingType: "โรงงาน", area: 715, status: "won", date: "2025-11-19", items: 1, lineItems: [{ name: "โรงงาน", qty: 715, unit: "ตร.ม.", unitPrice: 2600 }], customerId: 5, projectId: 0, expiry: "2025-12-19" },
  { id: "Q-2026-0116", customer: "บจ. แม่สอดโลหะ", project: "โกดังสำเร็จรูป แม่สอดโลหะ", total: "฿4,099,500", totalValue: 4099500, materialCost: 4099500, province: "ตาก", buildingType: "โกดังสำเร็จรูป", area: 1822, status: "won", date: "2025-12-21", items: 1, lineItems: [{ name: "โกดังสำเร็จรูป", qty: 1822, unit: "ตร.ม.", unitPrice: 2250 }], customerId: 6, projectId: 0, expiry: "2026-01-20" },
  { id: "Q-2026-0117", customer: "บจ. นครสวรรค์โลหะ", project: "อาคารสำเร็จรูปทุกประเภท นครสวรรค์โลหะ เฟส 2", total: "฿2,431,200", totalValue: 2431200, materialCost: 2431200, province: "นครสวรรค์", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 1013, status: "won", date: "2025-09-18", items: 1, lineItems: [{ name: "อาคารสำเร็จรูปทุกประเภท", qty: 1013, unit: "ตร.ม.", unitPrice: 2400 }], customerId: 8, projectId: 0, expiry: "2025-10-18" },
  { id: "Q-2026-0118", customer: "บจ. เอกชัยสตอเรจ", project: "โกดังสำเร็จรูป เอกชัยสตอเรจ เฟส 1", total: "฿1,469,250", totalValue: 1469250, materialCost: 1469250, province: "ลำปาง", buildingType: "โกดังสำเร็จรูป", area: 653, status: "won", date: "2025-11-01", items: 1, lineItems: [{ name: "โกดังสำเร็จรูป", qty: 653, unit: "ตร.ม.", unitPrice: 2250 }], customerId: 11, projectId: 0, expiry: "2025-12-01" },
  { id: "Q-2026-0119", customer: "บจ. เอกชัยสตอเรจ", project: "โกดังสำเร็จรูป เอกชัยสตอเรจ เฟส 2", total: "฿981,000", totalValue: 981000, materialCost: 981000, province: "ลำปาง", buildingType: "โกดังสำเร็จรูป", area: 436, status: "won", date: "2025-12-16", items: 1, lineItems: [{ name: "โกดังสำเร็จรูป", qty: 436, unit: "ตร.ม.", unitPrice: 2250 }], customerId: 11, projectId: 0, expiry: "2026-01-15" },
  { id: "Q-2026-0120", customer: "คุณนภา วงศ์สวรรค์", project: "อาคารสำเร็จรูปทุกประเภท คุณนภา วงศ์สวรรค์", total: "฿679,200", totalValue: 679200, materialCost: 679200, province: "เชียงใหม่", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 283, status: "won", date: "2026-03-25", items: 1, lineItems: [{ name: "อาคารสำเร็จรูปทุกประเภท", qty: 283, unit: "ตร.ม.", unitPrice: 2400 }], customerId: 12, projectId: 0, expiry: "2026-04-24" },
  { id: "Q-2026-0121", customer: "หจก. พะเยาเทรดดิ้ง", project: "โรงงาน พะเยาเทรดดิ้ง", total: "฿1,149,200", totalValue: 1149200, materialCost: 1149200, province: "พะเยา", buildingType: "โรงงาน", area: 442, status: "won", date: "2025-09-21", items: 1, lineItems: [{ name: "โรงงาน", qty: 442, unit: "ตร.ม.", unitPrice: 2600 }], customerId: 13, projectId: 0, expiry: "2025-10-21" },
];

// ─── TEAM ─────────────────────────────────────────────────────
export type TeamMock = {
  id: number; name: string; role: string; dept: string;
  initials: string; color: string; tasks: number; projects: number; phone: string;
};

export const team: TeamMock[] = [
  { id: 1, name: "สมชาย เชียงใหม่",  role: "DEALER_ADMIN", dept: "บริหาร",    initials: "สช", color: "#003366", tasks: 5, projects: 4, phone: "081-234-5678" },
  { id: 2, name: "วิภา รัตนกุล",      role: "DEALER_SALES", dept: "ขาย",       initials: "วร", color: "#059669", tasks: 3, projects: 3, phone: "082-345-6789" },
  { id: 3, name: "วิชัย ประสิทธิ์",   role: "DEALER_SITE",  dept: "ขายภาคสนาม",  initials: "วป", color: "#f59e0b", tasks: 4, projects: 2, phone: "083-456-7890" },
  { id: 4, name: "กาญจนา มีสุข",      role: "DEALER_SALES", dept: "ขาย",       initials: "กม", color: "#8fa3b8", tasks: 2, projects: 2, phone: "084-567-8901" },
  { id: 5, name: "ประสิทธิ์ ดีงาน",   role: "DEALER_SITE",  dept: "ขายภาคสนาม",  initials: "ปด", color: "#002244", tasks: 1, projects: 1, phone: "085-678-9012" },
  { id: 6, name: "สุดาวรรณ สวยงาม",   role: "DEALER_SALES", dept: "ขาย",       initials: "สส", color: "#8fa3b8", tasks: 2, projects: 2, phone: "086-789-0123" },
];

// ─── HQ MOCK DATA ─────────────────────────────────────────────

// บริษัทดีลเลอร์ (เครือข่ายดีลเลอร์)
// ⛔ ห้ามใส่รหัสผ่านจริงลงในไฟล์นี้เด็ดขาด
//    mock.ts ถูก import จากคอมโพเนนต์ฝั่ง client (RoleContext ฯลฯ) จึงถูกรวมเข้าไปในไฟล์ที่
//    เบราว์เซอร์โหลด "ทุกหน้า รวมหน้าล็อกอินที่ยังไม่ต้องเข้าระบบ" — ใครเปิดดูซอร์สก็อ่านได้หมด
//    เคยมีรหัสผ่านจริงของดีลเลอร์ทั้ง 10 สาขาอยู่ตรงนี้ และหลุดไปถึงเบราว์เซอร์จริง
//    (พบจากผลตรวจสอบระบบรอบ 2 · 5 ส.ค. 69 · ยืนยันจากไฟล์ build ทั้งสองแอป)
//
//    รหัสผ่านจริงอยู่ใน Supabase Auth (hash) ที่เดียวเท่านั้น
//    โหมดจำลอง (local) ใช้ DEMO_PASSWORD ใน auth.ts ซึ่งไม่ใช่รหัสของบัญชีจริง
export type DealerCredentials = {
  email: string;
  /** ⛔ ห้ามใส่ค่าจริง — เก็บ optional ไว้เฉพาะเพื่อความเข้ากันได้ของ type เดิมเท่านั้น */
  password?: string;
};

export type DealerRow = {
  id: string;
  code: string;
  name: string;
  province: string;   // จังหวัดที่ตั้งของดีลเลอร์ — รหัสสาขามาตรฐานอ้างอิงจังหวัดนี้ (เช่น RYG = ระยอง)
  region: string;
  // เป้าทั้งปีที่ HQ ตั้งให้สาขานี้ — เป็น "ค่าที่คนกรอก" จึงเก็บในตาราง
  //   มีแพ็กเกจ + แพ็กเกจนั้นตั้งเป้าไว้ที่ ตั้งค่า › หาดีลเลอร์ = ใช้เป้าของแพ็กเกจเสมอ (0178 · บอสสั่ง 15 ก.ย. 69)
  revenueTarget: number;
  /** แพ็กเกจดีลเลอร์ — ว่าง = ไม่ระบุ (เป้ากรอกเอง) */
  package?: "standard" | "exclusive" | null;
  /** true = เป้ายอดขายกำหนดเองรายดีลเลอร์ ไม่ตามแพ็กเกจ (0180 · บอสสั่ง 15 ก.ย. 69 "แก้เองหรือแก้ในตั้งค่าก็ได้") */
  targetManual?: boolean;
  /** เวลาที่เพิ่มดีลเลอร์เข้าระบบ (created_at ของ DB · อ่านอย่างเดียว ตอนบันทึกถูกตัดทิ้ง) — ไม่มีในโหมดข้อมูลตัวอย่าง */
  createdAt?: string;
  status: DealerStatus;
  // (revenueActual / winRate / activeProjects / onTimePct ถูกตัดออก — เป็นค่าที่ "คำนวณได้"
  //  จากใบเสนอราคา/ลูกค้าเป้าหมายจริง ไม่ใช่ค่าที่ใครกรอก · เก็บไว้ในตารางแล้วมันไม่ขยับตามข้อมูล
  //  ทำให้ /hq/dealers โชว์ ฿22.4M ขณะที่ /hq/dashboard คำนวณได้ ฿0 ของสาขาเดียวกัน
  //  → อ่านผ่าน useDealerPerformance() แทน)
  // บัญชีเข้าระบบของดีลเลอร์ — มีเฉพาะโหมด local (mock) เท่านั้น
  // โหมด supabase: รหัสผ่านถูก hash อยู่ใน Supabase Auth · ตาราง dealers ไม่เก็บ (และห้ามเก็บ)
  // → หน้าจอต้องรองรับกรณีไม่มีค่า (แสดง "—") ห้าม assume ว่ามีเสมอ
  credentials?: DealerCredentials;
};

// ─── สถานะดีลเลอร์ (แหล่งเดียว) — มี 2 สถานะเท่านั้น ตามข้อมูลจริง ────────────────
// เดิมค่า "inactive" ค่าเดียวถูกเรียก 3 ชื่อคนละที่: "ไม่ใช้งาน" (ตาราง/ตัวกรอง)
// "ปิดใช้งาน" (ฟอร์ม/หน้ารายละเอียด) และ "ระงับดีลเลอร์" (บันทึกการใช้งาน)
// → ยึด "ปิดใช้งาน" คำเดียว เพราะเป็นคำที่ปุ่ม/ฟอร์ม/UsersPanel ใช้อยู่แล้ว และเป็นคู่ตรงข้ามของ "เปิดใช้งาน"
//
// ไม่มีสถานะ "ระงับ" (suspended) — DealerRow ไม่มีฟิลด์รองรับ
// (เดิมหน้า /hq/dealers ฮาร์ดโค้ด CRI ให้เป็น "ระงับ" ทั้งที่ข้อมูลจริงบอกว่า active
//  → ดีลเลอร์รายเดียวกันขึ้นคนละสถานะในคนละหน้า · ถ้าต้องการ 3 สถานะจริง ต้องเพิ่มฟิลด์ก่อน)
export type DealerStatus = "active" | "inactive";
export const dealerStatusLabel: Record<DealerStatus, string> = {
  active:   "เปิดใช้งาน",
  inactive: "ปิดใช้งาน",
};
export const dealerStatusColor: Record<DealerStatus, { bg: string; color: string }> = {
  active:   { bg: "#e5faf0", color: "#059669" },
  inactive: { bg: "#f0f0f5", color: "#6b7280" },
};

// คีย์เก็บรายชื่อดีลเลอร์ (แหล่งเดียว — ทุกหน้า HQ ต้องอ่านคีย์นี้)
// v3: เพิ่มฟิลด์ province · ข้อมูล v2 เก่าไม่มีจังหวัด จึงต้องขึ้นเวอร์ชันใหม่ ไม่งั้นคอลัมน์จังหวัดจะว่าง
// v4 (17 ก.ค. 69): เครื่องที่ใช้งานมานานมี blob ค้างอยู่ใน v3 เป็นรายชื่อ "ชุดอื่น" 48 ราย (รหัส D101–D138
//   ที่ไม่มีในระบบ และยอดขายไม่ตรงกับใบเสนอราคาจริง) → หน้า HQ เชื่อ localStorage เลยโชว์ดีลเลอร์ที่ไม่มีจริง
//   ขึ้นเวอร์ชันคีย์เพื่อให้ทุกเครื่องเริ่มจาก dealerLeaderboard (10 ราย) ใหม่
//   ⚠️ ผลข้างเคียงที่ยอมรับแล้ว: ถ้าเคยเพิ่ม/แก้ดีลเลอร์ไว้ในคีย์เก่า จะกลับไปเป็นชุดตั้งต้น
export const HQ_DEALERS_KEY = "hq_dealers_v4";
const HQ_DEALERS_KEY_OLD = ["hq_dealers_v3", "hq_dealers_v2"];

/** ลบคีย์รายชื่อดีลเลอร์รุ่นเก่าทิ้ง — กันของค้างกินที่ และกันคนหลงไปอ่านคีย์เก่าในอนาคต
 *  เรียกครั้งเดียวตอนแอปเริ่ม (ดู AppShell) · ไม่แตะคีย์ปัจจุบัน */
export function purgeOldDealerKeys(): void {
  if (typeof window === "undefined") return;
  HQ_DEALERS_KEY_OLD.forEach(k => { try { localStorage.removeItem(k); } catch {} });
}

// อ่านรายชื่อดีลเลอร์แบบ "อ่านอย่างเดียว" — สำหรับหน้าที่แค่ดู ไม่ได้แก้ (เช่น กระดิ่งแจ้งเตือน)
// อย่าใช้ usePersistentState ในหน้าพวกนั้น: hook นั้นเขียนกลับ → ค่า seed จะทับของจริงตอน mount
export function loadHQDealers(): DealerRow[] {
  if (typeof window === "undefined") return dealerLeaderboard;
  try { const s = localStorage.getItem(HQ_DEALERS_KEY); if (s) return JSON.parse(s) as DealerRow[]; } catch {}
  return dealerLeaderboard;
}

// จังหวัดของแต่ละสาขา = จังหวัดที่รหัสสาขามาตรฐานอ้างถึงอยู่แล้ว (RYG=ระยอง, CNX=เชียงใหม่, …)
// CNX = สาขาที่ล็อกอินใน demo → ตัวเลขต้องตรงกับใบเสนอราคาจริงใน SalesContext ที่หน้าดีลเลอร์ใช้
// (ใบที่ตอบรับแล้วปี 2569 รวม ฿22,438,650 · run-rate ทั้งปี ≈ ฿45M · ปิดได้ 50%)
// เดิมตั้งไว้ ฿4.2M/เป้า ฿6.2M ซึ่งเล็กกว่ายอดจริงราว 5 เท่า แดชบอร์ดดีลเลอร์เลยขึ้น 362% และทุกเดือนเกินเป้า
// สาขาอื่นยังเป็นตัวเลขสมมติของ HQ ล้วน — ไม่มีใบเสนอราคาจริงผูกอยู่
export const dealerLeaderboard: DealerRow[] = [
  { id: "RYG", code: "RYG", name: "บจ. ระยองสตีลเวิร์คส์",      province: "ระยอง",           region: "ตะวันออก", revenueTarget: 6000000, status: "active",   credentials: { email: "sales@rayongsteel.co.th" } },
  { id: "CNX", code: "CNX", name: "บจ. เชียงใหม่สตีลบิลด์",   province: "เชียงใหม่",       region: "เหนือ",    revenueTarget: 45000000, status: "active",   credentials: { email: "sales@cmsteelbuild.co.th" } },
  { id: "MST", code: "MST", name: "หจก. แม่สอดเมทัลเวิร์ค",      province: "ตาก",             region: "ตะวันตก", revenueTarget: 5000000, status: "active",   credentials: { email: "sales@maesotmetal.co.th" } },
  { id: "CRI", code: "CRI", name: "บจ. เชียงรายสตรัคเจอร์",    province: "เชียงราย",        region: "เหนือ",    revenueTarget: 5800000, status: "active",   credentials: { email: "sales@crstructure.co.th" } },
  { id: "NSN", code: "NSN", name: "บจ. นครสวรรค์เอ็นจิเนียริ่ง",   province: "นครสวรรค์",       region: "กลาง",     revenueTarget: 5000000, status: "active",   credentials: { email: "sales@nsn-engineering.co.th" } },
  { id: "HYI", code: "HYI", name: "บจ. หาดใหญ่สตีลกรุ๊ป",    province: "สงขลา",           region: "ใต้",      revenueTarget: 4000000, status: "inactive", credentials: { email: "sales@hatyaisteel.co.th" } },
  { id: "AYA", code: "AYA", name: "บจ. อยุธยาเมทัลบิลด์",     province: "พระนครศรีอยุธยา", region: "กลาง",     revenueTarget: 5200000, status: "active",   credentials: { email: "sales@ayametalbuild.co.th" } },
  { id: "KKN", code: "KKN", name: "หจก. ขอนแก่นโครงเหล็ก",   province: "ขอนแก่น",         region: "อีสาน",    revenueTarget: 4800000, status: "active",   credentials: { email: "sales@kksteelframe.co.th" } },
  { id: "UBN", code: "UBN", name: "บจ. อุบลสตีลกรุ๊ป",        province: "อุบลราชธานี",     region: "อีสาน",    revenueTarget: 4500000, status: "active",   credentials: { email: "sales@ubonsteel.co.th" } },
  { id: "PKT", code: "PKT", name: "บจ. ภูเก็ตสตรัคเจอรัล",   province: "ภูเก็ต",          region: "ใต้",      revenueTarget: 3500000, status: "active",   credentials: { email: "sales@phuketstructural.co.th" } },
];

// ยอดขายรายเดือน (รวมทั้งเครือ)
// (hqSalesByMonth ถูกลบ — HQ dashboard คำนวณเทรนด์จากใบเสนอราคาจริงแล้ว)


// ─── APPOINTMENTS ─────────────────────────────────────────────
export type ApptType = "visit" | "design_meet" | "presentation" | "contract_sign" | "close" | "follow_up";
export type ApptStatus = "upcoming" | "done" | "cancelled";

export const apptTypeLabel: Record<ApptType, string> = {
  visit: "นัดพบลูกค้า",
  design_meet: "นัดนำเสนอสินค้า",
  presentation: "นำเสนอราคา",
  contract_sign: "เซ็นสัญญาซื้อขาย",
  close: "ปิดการขาย",
  follow_up: "โทรติดตาม",
};

export type AppointmentMock = {
  id: number; company: string; contact: string; phone: string;
  // ผูกกับลูกค้าเป้าหมายโดยตรง — ไม่เดาจากชื่อบริษัท (ชื่อซ้ำ/แก้ชื่อแล้วขาด)
  // ว่างได้: นัดหมายที่สร้างจากหน้าปฏิทินเองยังไม่ผูกลูกค้าเป้าหมาย
  leadId?: number;
  project: string; buildingType: string; area: number; province: string;
  date: string; time: string; type: ApptType; assigned: string;
  status: ApptStatus; note: string;
  dealerCode?: string; // สาขาเจ้าของ (multi-tenant) — undefined = สาขา CNX (สมุดงานเดิม)
};

export const appointments: AppointmentMock[] = [
  { id: 11, leadId: 3, company: "หจก. ราชบุรีโลหะ", contact: "คุณประยุทธ ร.", phone: "083-456-7890", project: "โกดังสำเร็จรูป ราชบุรี", buildingType: "โกดังสำเร็จรูป", area: 480, province: "ราชบุรี", date: "2026-06-30", time: "14:00", type: "visit", assigned: "วิภา รัตนกุล", status: "upcoming", note: "นัดพบเก็บความต้องการเพิ่มเติม" },
  { id: 1, leadId: 1, company: "บจ. ไทยสตีล", contact: "คุณสมชาย ใจดี", phone: "081-234-5678", project: "โกดังสำเร็จรูป บจ. ไทยสตีล", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 1200, province: "นนทบุรี", date: "2026-06-24", time: "09:00", type: "visit", assigned: "สมชาย", status: "upcoming", note: "นัดพบลูกค้าคุยความต้องการโกดังสินค้า" },
  { id: 2, leadId: 2, company: "บจ. ซีซีเอส", contact: "คุณกาญจนา ม.", phone: "082-345-6789", project: "โรงงานสำเร็จรูป บจ. ซีซีเอส", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 800, province: "เชียงใหม่", date: "2026-06-24", time: "13:30", type: "design_meet", assigned: "วิภา", status: "upcoming", note: "นำเสนอแบบและสเปกสินค้า" },
  { id: 3, leadId: 1, company: "บจ. ไทยสตีล", contact: "คุณสมชาย ใจดี", phone: "081-234-5678", project: "โกดังสำเร็จรูป บจ. ไทยสตีล", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 1200, province: "นนทบุรี", date: "2026-06-26", time: "09:00", type: "contract_sign", assigned: "สมชาย", status: "upcoming", note: "เซ็นสัญญาซื้อขาย" },
  { id: 4, leadId: 2, company: "บจ. ซีซีเอส", contact: "คุณกาญจนา ม.", phone: "082-345-6789", project: "โรงงานสำเร็จรูป บจ. ซีซีเอส", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 800, province: "เชียงใหม่", date: "2026-06-30", time: "13:00", type: "follow_up", assigned: "สมชาย", status: "upcoming", note: "ติดตามผลใบเสนอราคา" },
  { id: 5, leadId: 4, company: "บจ. สมุทรโกดัง", contact: "คุณดารัล ส.", phone: "084-567-8901", project: "โกดังปากน้ำ พระปราชญ์", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 2000, province: "สมุทรปราการ", date: "2026-07-03", time: "08:00", type: "visit", assigned: "วิชัย", status: "upcoming", note: "นัดพบลูกค้าเก็บความต้องการ" },
  { id: 6, leadId: 3, company: "หจก. ราชบุรีโลหะ", contact: "คุณประยุทธ ร.", phone: "083-456-7890", project: "โกดังสำเร็จรูป ราชบุรี", buildingType: "โกดังสำเร็จรูป", area: 3100, province: "ราชบุรี", date: "2026-07-05", time: "10:00", type: "presentation", assigned: "วิภา", status: "upcoming", note: "นำเสนอใบเสนอราคาฉบับปรับปรุง" },
  { id: 7, company: "บจ. แม่สอดโลหะ", contact: "คุณสุรัตน์ ล.", phone: "086-789-0123", project: "อาคารสำเร็จรูป แม่สอด", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 4100, province: "ตาก", date: "2026-06-15", time: "10:00", type: "visit", assigned: "สมชาย", status: "done", note: "พบลูกค้าเรียบร้อย รอติดตามผล" },
  { id: 8, company: "VCS Asia", contact: "VCS Asia (ระยอง)", phone: "085-678-9012", project: "โกดังระยอง VCS Asia", buildingType: "โกดังสำเร็จรูป", area: 6200, province: "ระยอง", date: "2026-02-25", time: "13:00", type: "close", assigned: "วิชัย", status: "done", note: "ปิดการขายเรียบร้อย" },
  { id: 9, leadId: 5, company: "บจ. นครสวรรค์โลหะ", contact: "บจ. นครสวรรค์โลหะ", phone: "088-901-2345", project: "โรงงานสำเร็จรูป นครสวรรค์", buildingType: "โรงงาน", area: 5400, province: "นครสวรรค์", date: "2026-03-15", time: "14:00", type: "follow_up", assigned: "กาญจนา", status: "done", note: "โทรติดตามหลังปิดการขาย" },
  { id: 10, company: "บจ. อุตรดิตถ์โลหะ", contact: "บจ. อุตรดิตถ์โลหะ", phone: "087-890-1234", project: "อาคารสำเร็จรูป อุตรดิตถ์", buildingType: "อาคารสำเร็จรูปทุกประเภท", area: 2800, province: "อุตรดิตถ์", date: "2026-07-10", time: "10:00", type: "presentation", assigned: "วิภา", status: "cancelled", note: "ลูกค้าขอเลื่อน" },
  { id: 12, leadId: 8, company: "บจ. พิษณุโลกฟาร์ม", contact: "คุณธนา ก.", phone: "089-222-3344", project: "โกดังเก็บข้าว พิษณุโลก", buildingType: "โกดังสำเร็จรูป", area: 1400, province: "พิษณุโลก", date: "2026-06-30", time: "10:30", type: "presentation", assigned: "สมชาย เชียงใหม่", status: "upcoming", note: "นำเสนอราคาปรับปรุงหลังต่อรอง" },
  { id: 13, leadId: 10, company: "บจ. ลำพูนอิเล็กทรอนิกส์", contact: "คุณศิริพร บ.", phone: "089-444-5566", project: "โรงงานชิ้นส่วนอิเล็กทรอนิกส์", buildingType: "โรงงาน", area: 2200, province: "ลำพูน", date: "2026-07-01", time: "09:30", type: "follow_up", assigned: "วิภา รัตนกุล", status: "upcoming", note: "โทรติดตามผลการเทียบราคา" },
  { id: 14, leadId: 11, company: "โรงเรียนนานาชาติเชียงใหม่", contact: "คุณเดวิด ล.", phone: "089-555-6677", project: "โรงยิมอเนกประสงค์ CMIS", buildingType: "สนามกีฬาในร่ม", area: 2000, province: "เชียงใหม่", date: "2026-07-02", time: "14:00", type: "design_meet", assigned: "สมชาย เชียงใหม่", status: "upcoming", note: "นำเสนอแบบโครงหลังคาช่วงกว้าง" },
  { id: 15, leadId: 13, company: "สหกรณ์การเกษตรเชียงดาว", contact: "คุณบุญมี ส.", phone: "089-777-8899", project: "โกดังเก็บข้าวโพด เชียงดาว", buildingType: "โกดังสำเร็จรูป", area: 700, province: "เชียงใหม่", date: "2026-07-03", time: "13:00", type: "visit", assigned: "วิภา รัตนกุล", status: "upcoming", note: "ลงพื้นที่วัดขนาดหน้างานรอบ 2" },
  { id: 16, leadId: 9, company: "หจก. เชียงใหม่ค้าวัสดุ", contact: "คุณมานพ ว.", phone: "089-333-4455", project: "รีโนเวทโกดัง เพิ่มชั้นลอย", buildingType: "งานรีโนเวท", area: 450, province: "เชียงใหม่", date: "2026-07-06", time: "11:00", type: "contract_sign", assigned: "กาญจนา มีสุข", status: "upcoming", note: "นัดเซ็นสัญญาหลังตกลงราคาได้" },
  { id: 17, leadId: 7, company: "บจ. ลำปางแพ็คเกจจิ้ง", contact: "คุณอรทัย พ.", phone: "089-111-2233", project: "โรงงานบรรจุภัณฑ์ ลำปาง", buildingType: "โรงงาน", area: 1800, province: "ลำปาง", date: "2026-06-20", time: "10:00", type: "close", assigned: "วิภา รัตนกุล", status: "done", note: "ปิดการขาย + เซ็นสัญญา ฿3.6M เรียบร้อย" },
  { id: 18, leadId: 12, company: "บจ. แพร่วู้ดโปรดักส์", contact: "คุณสมบัติ จ.", phone: "089-666-7788", project: "โกดังเก็บไม้แปรรูป แพร่", buildingType: "โกดังสำเร็จรูป", area: 1000, province: "แพร่", date: "2026-06-18", time: "13:30", type: "visit", assigned: "กาญจนา มีสุข", status: "done", note: "เก็บความต้องการครบ พร้อมทำใบเสนอราคา" },
  { id: 19, leadId: 14, company: "บจ. น่านโลจิสติกส์", contact: "คุณพงศกร น.", phone: "089-888-9900", project: "ศูนย์กระจายสินค้า น่าน", buildingType: "งานตามแบบของลูกค้า", area: 1600, province: "น่าน", date: "2026-07-07", time: "09:00", type: "visit", assigned: "สมชาย เชียงใหม่", status: "upcoming", note: "นัดเก็บความต้องการครั้งแรก" },
];

// ─── TAGS ─────────────────────────────────────────────────────────
export type TagVisibility = "public" | "team" | "private";
export type TagMock = {
  id: number; title: string; visibility: TagVisibility; color: string; created: string;
};
export const tags: TagMock[] = [
  { id: 1, title: "VIP", visibility: "public", color: "#f59e0b", created: "2026-01-01" },
  { id: 2, title: "ลูกค้าประจำ", visibility: "public", color: "#059669", created: "2026-01-01" },
  { id: 3, title: "ติดตามด่วน", visibility: "team", color: "#dc2626", created: "2026-02-01" },
  { id: 4, title: "โอกาสการขายใหญ่", visibility: "public", color: "#003366", created: "2026-02-01" },
  { id: 5, title: "รอเสนอราคา", visibility: "team", color: "#6b7280", created: "2026-03-01" },
];

// ─── DEALER DRILL-DOWN ────────────────────────────────────────
export type DealerLeadItem = {
  id: string; name: string; province: string; product: string;
  valueNum: number; status: "contacted" | "quoted" | "won" | "lost";
  assignedAt: string;
};
export type DealerProjectItem = {
  id: string; name: string; product: string;
  valueNum: number; progress: number;
  status: "in_progress" | "completed" | "on_hold" | "overdue";
};
export type DealerQuoteItem = {
  quoteNo: string; customer: string; product: string;
  valueNum: number;
  status: QuotationStatus;
  date: string;
};
export type DealerDetail = {
  code: string;
  monthlySales: { month: string; value: number }[];
  leads: DealerLeadItem[];
  projects: DealerProjectItem[];
  quotes: DealerQuoteItem[];
};

export const dealerDetails: Record<string, DealerDetail> = {
  RYG: {
    code: "RYG",
    monthlySales: [
      { month: "ม.ค.", value: 3200 }, { month: "ก.พ.", value: 6200 }, { month: "มี.ค.", value: 4800 },
      { month: "เม.ย.", value: 5600 }, { month: "พ.ค.", value: 7100 }, { month: "มิ.ย.", value: 5400 },
    ],
    leads: [
      { id: "LD-R01", name: "บจ. แหลมฉบัง อุตสาหกรรม", province: "ชลบุรี",    product: "โรงงาน",  valueNum: 4200000, status: "quoted",    assignedAt: "3 วันก่อน" },
      { id: "LD-R02", name: "หจก. มาบตาพุดโลหะ",       province: "ระยอง",     product: "โกดังสำเร็จรูป", valueNum: 1800000, status: "contacted", assignedAt: "1 สัปดาห์" },
      { id: "LD-R03", name: "บจ. ชลอุตสาหกรรม",        province: "ชลบุรี",    product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 2600000, status: "contacted", assignedAt: "2 วันก่อน" },
      { id: "LD-R04", name: "นาย อนันต์ ศ.",            province: "จันทบุรี",  product: "โกดังสำเร็จรูป", valueNum: 850000,  status: "won",       assignedAt: "2 สัปดาห์" },
    ],
    projects: [
      { id: "PRJ-R01", name: "โกดัง VCS Asia ระยอง",        product: "โรงงาน",  valueNum: 6200000, progress: 100, status: "completed" },
      { id: "PRJ-R02", name: "โรงงาน บจ. แหลมฉบัง",         product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 3800000, progress: 62,  status: "in_progress" },
      { id: "PRJ-R03", name: "โกดัง มาบตาพุดโลหะ",           product: "โกดังสำเร็จรูป", valueNum: 1800000, progress: 38,  status: "in_progress" },
      { id: "PRJ-R04", name: "คลังสินค้า ชลบุรี เฟส 2",       product: "โรงงาน",  valueNum: 2400000, progress: 10,  status: "in_progress" },
      { id: "PRJ-R05", name: "โกดัง จันทบุรี อนันต์",         product: "โกดังสำเร็จรูป", valueNum: 850000,  progress: 0,   status: "in_progress" },
      { id: "PRJ-R06", name: "โรงงาน ตราด อุตสาหกรรม",        product: "โรงงาน",  valueNum: 3100000, progress: 0,   status: "in_progress" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0091", customer: "หจก. ราชบุรีโลหะ",      product: "โรงงาน",  valueNum: 1800000, status: "sent_to_client", date: "3 ชม." },
      { quoteNo: "Q-2026-0086", customer: "บจ. แหลมฉบัง อุตฯ",     product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 3800000,  status: "sent_to_client",     date: "2 วัน" },
      { quoteNo: "Q-2026-0118", customer: "หจก. มาบตาพุดโลหะ",      product: "โกดังสำเร็จรูป", valueNum: 1800000,  status: "won",      date: "2 สัปดาห์" },
      { quoteNo: "Q-2026-0065", customer: "VCS Asia",                product: "โรงงาน",  valueNum: 6200000,  status: "won",      date: "4 สัปดาห์" },
    ],
  },
  CNX: {
    code: "CNX",
    monthlySales: [
      { month: "ม.ค.", value: 2100 }, { month: "ก.พ.", value: 1800 }, { month: "มี.ค.", value: 3200 },
      { month: "เม.ย.", value: 4100 }, { month: "พ.ค.", value: 2600 }, { month: "มิ.ย.", value: 4200 },
    ],
    leads: [
      { id: "LD-C01", name: "บจ. ไทยสตีล",          province: "เชียงใหม่",  product: "โกดังสำเร็จรูป", valueNum: 3200000, status: "quoted",    assignedAt: "5 วันก่อน" },
      { id: "LD-C02", name: "หจก. สันทรายเมทัล",  province: "เชียงใหม่",  product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 1200000, status: "contacted", assignedAt: "1 สัปดาห์" },
      { id: "LD-C03", name: "บจ. ลำพูนโลหะ",         province: "ลำพูน",      product: "โรงงาน",  valueNum: 2800000, status: "contacted", assignedAt: "1 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-C01", name: "โกดัง บจ. ไทยสตีล เชียงใหม่",  product: "โกดังสำเร็จรูป", valueNum: 3200000, progress: 45, status: "in_progress" },
      { id: "PRJ-C02", name: "โรงงาน อาคารสำเร็จรูป ซีซีเอส",          product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 3200000, progress: 72, status: "in_progress" },
      { id: "PRJ-C03", name: "คลังสินค้า ลำพูน อุตฯ",          product: "โรงงาน",  valueNum: 1600000, progress: 0,  status: "in_progress" },
      { id: "PRJ-C04", name: "โกดัง เชียงใหม่-ลำปาง",          product: "โกดังสำเร็จรูป", valueNum: 2100000, progress: 25, status: "on_hold" },
      { id: "PRJ-C05", name: "โรงงาน น่าน (งานตามแบบ)",             product: "งานตามแบบของลูกค้า",    valueNum: 4800000, progress: 5,  status: "in_progress" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0089", customer: "บจ. ไทยสตีล",       product: "โกดังสำเร็จรูป", valueNum: 1800000,  status: "won", date: "6 สัปดาห์" },
      { quoteNo: "Q-2026-0083", customer: "หจก. สันทราย",       product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 1200000,  status: "sent_to_client",     date: "4 วัน" },
      { quoteNo: "Q-2026-0074", customer: "บจ. ลำพูนโลหะ",     product: "โรงงาน",  valueNum: 2800000,  status: "draft",    date: "1 สัปดาห์" },
    ],
  },
  MST: {
    code: "MST",
    monthlySales: [
      { month: "ม.ค.", value: 1800 }, { month: "ก.พ.", value: 2400 }, { month: "มี.ค.", value: 3100 },
      { month: "เม.ย.", value: 4200 }, { month: "พ.ค.", value: 3600 }, { month: "มิ.ย.", value: 3800 },
    ],
    leads: [
      { id: "LD-M01", name: "บจ. แม่สอดโลหะ",        province: "ตาก",    product: "โกดังสำเร็จรูป", valueNum: 4100000, status: "quoted",    assignedAt: "3 วันก่อน" },
      { id: "LD-M02", name: "หจก. กาญจน์อุตฯ",       province: "กาญจนบุรี", product: "โรงงาน", valueNum: 2200000, status: "contacted", assignedAt: "5 วันก่อน" },
      { id: "LD-M03", name: "นาย ธนกร ป.",            province: "ตาก",    product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 980000,  status: "contacted", assignedAt: "2 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-M01", name: "โกดังสำเร็จรูป แม่สอด บจ. แม่สอดโลหะ", product: "โกดังสำเร็จรูป", valueNum: 4100000, progress: 82, status: "in_progress" },
      { id: "PRJ-M02", name: "โกดัง โรงงานสำเร็จรูป กาญจนบุรี",         product: "โรงงาน",  valueNum: 2200000, progress: 55, status: "in_progress" },
      { id: "PRJ-M03", name: "โรงงาน อาคารสำเร็จรูป ตาก",                product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 1600000, progress: 30, status: "in_progress" },
      { id: "PRJ-M04", name: "คลังสินค้า ราชบุรี",               product: "โกดังสำเร็จรูป", valueNum: 1800000, progress: 0,  status: "in_progress" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0085", customer: "บจ. แม่สอดโลหะ", product: "โกดังสำเร็จรูป", valueNum: 4100000,  status: "won",  date: "1 สัปดาห์" },
      { quoteNo: "Q-2026-0080", customer: "หจก. กาญจน์อุตฯ", product: "โรงงาน",  valueNum: 2200000,  status: "sent_to_client", date: "2 สัปดาห์" },
      { quoteNo: "Q-2026-0077", customer: "นาย ธนกร ป.",     product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 980000,  status: "draft", date: "2 สัปดาห์" },
    ],
  },
  CRI: {
    code: "CRI",
    monthlySales: [
      { month: "ม.ค.", value: 1200 }, { month: "ก.พ.", value: 900 }, { month: "มี.ค.", value: 2200 },
      { month: "เม.ย.", value: 3100 }, { month: "พ.ค.", value: 2800 }, { month: "มิ.ย.", value: 3100 },
    ],
    leads: [
      { id: "LD-CR01", name: "บจ. เชียงรายอุตสาหกรรม", province: "เชียงราย", product: "โรงงาน",  valueNum: 3600000, status: "quoted",    assignedAt: "4 วันก่อน" },
      { id: "LD-CR02", name: "หจก. พะเยาสตีล",    province: "พะเยา",    product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 1100000, status: "contacted", assignedAt: "1 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-CR01", name: "โรงงาน โรงงานสำเร็จรูป เชียงราย",     product: "โรงงาน",  valueNum: 3600000, progress: 40, status: "in_progress" },
      { id: "PRJ-CR02", name: "โกดัง โกดังสำเร็จรูป พะเยา",        product: "โกดังสำเร็จรูป", valueNum: 1800000, progress: 60, status: "in_progress" },
      { id: "PRJ-CR03", name: "อาคารสำเร็จรูป เชียงราย เฟส 1",        product: "อาคารสำเร็จรูปทุกประเภท",    valueNum: 2100000, progress: 15, status: "overdue" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0082", customer: "บจ. เชียงรายอุตฯ", product: "โรงงาน",  valueNum: 3600000,  status: "sent_to_client",  date: "3 วัน" },
      { quoteNo: "Q-2026-0075", customer: "หจก. พะเยาสตีล", product: "อาคารสำเร็จรูปทุกประเภท",  valueNum: 1100000,  status: "draft", date: "1 สัปดาห์" },
      { quoteNo: "Q-2026-0070", customer: "บจ. เชียงรายอุตฯ", product: "โกดังสำเร็จรูป", valueNum: 1800000,  status: "won",   date: "3 สัปดาห์" },
    ],
  },
  NSN: {
    code: "NSN",
    monthlySales: [
      { month: "ม.ค.", value: 5400 }, { month: "ก.พ.", value: 800 }, { month: "มี.ค.", value: 600 },
      { month: "เม.ย.", value: 400 }, { month: "พ.ค.", value: 500 }, { month: "มิ.ย.", value: 1900 },
    ],
    leads: [
      { id: "LD-N01", name: "บจ. นครสวรรค์โกดัง", province: "นครสวรรค์", product: "โกดังสำเร็จรูป", valueNum: 2400000, status: "contacted", assignedAt: "6 วันก่อน" },
      { id: "LD-N02", name: "หจก. สุโขทัยอุตฯ",  province: "สุโขทัย",   product: "โรงงาน",  valueNum: 1800000, status: "contacted", assignedAt: "2 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-N01", name: "โรงงาน โรงงานสำเร็จรูป นครสวรรค์",    product: "โรงงาน",  valueNum: 5400000, progress: 100, status: "completed" },
      { id: "PRJ-N02", name: "โกดัง โกดังสำเร็จรูป นครสวรรค์",    product: "โกดังสำเร็จรูป", valueNum: 1900000, progress: 20,  status: "in_progress" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0117", customer: "บจ. นครสวรรค์โกดัง", product: "โกดังสำเร็จรูป", valueNum: 2400000, status: "sent_to_client", date: "4 วัน" },
      { quoteNo: "Q-2026-0072", customer: "หจก. สุโขทัยอุตฯ",    product: "โรงงาน",  valueNum: 1800000, status: "draft", date: "1 สัปดาห์" },
    ],
  },
  HYI: {
    code: "HYI",
    monthlySales: [
      { month: "ม.ค.", value: 300 }, { month: "ก.พ.", value: 220 }, { month: "มี.ค.", value: 150 },
      { month: "เม.ย.", value: 120 }, { month: "พ.ค.", value: 80 }, { month: "มิ.ย.", value: 50 },
    ],
    leads: [
      { id: "LD-H01", name: "บ.สงขลาแคนนิ่ง", province: "สงขลา", product: "โรงงาน", valueNum: 2600000, status: "contacted", assignedAt: "2 เดือนก่อน" },
    ],
    projects: [
      { id: "PRJ-H01", name: "โกดัง หาดใหญ่ เฟส 1", product: "โกดังสำเร็จรูป", valueNum: 920000, progress: 100, status: "completed" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0059", customer: "บ.สงขลาแคนนิ่ง", product: "โรงงาน", valueNum: 2600000, status: "lost", date: "2 เดือน" },
    ],
  },
  AYA: {
    code: "AYA",
    monthlySales: [
      { month: "ม.ค.", value: 3800 }, { month: "ก.พ.", value: 4200 }, { month: "มี.ค.", value: 5100 },
      { month: "เม.ย.", value: 4400 }, { month: "พ.ค.", value: 5300 }, { month: "มิ.ย.", value: 4650 },
    ],
    leads: [
      { id: "LD-A01", name: "บ.โรจนะอินดัสทรี",       province: "พระนครศรีอยุธยา", product: "โรงงาน",  valueNum: 6400000, status: "quoted",    assignedAt: "2 วันก่อน" },
      { id: "LD-A02", name: "หจก. บางปะอินโลจิสติกส์", province: "พระนครศรีอยุธยา", product: "โกดังสำเร็จรูป", valueNum: 2700000, status: "quoted",    assignedAt: "5 วันก่อน" },
      { id: "LD-A03", name: "บ.สระบุรีคอนกรีต",        province: "สระบุรี",          product: "งานตามแบบของลูกค้า",      valueNum: 3100000, status: "contacted", assignedAt: "1 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-A01", name: "โรงงาน วังน้อยฟู้ดส์",     product: "โรงงาน",  valueNum: 4100000, progress: 35, status: "in_progress" },
      { id: "PRJ-A02", name: "โกดัง นิคมโรจนะ B4",       product: "โกดังสำเร็จรูป", valueNum: 2800000, progress: 70, status: "in_progress" },
      { id: "PRJ-A03", name: "อาคารสำนักงาน อยุธยาพาร์ค", product: "อาคารสำเร็จรูปทุกประเภท",  valueNum: 1900000, progress: 100, status: "completed" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0093", customer: "บ.โรจนะอินดัสทรี",        product: "โรงงาน",  valueNum: 6400000, status: "sent_to_client", date: "4 วัน" },
      { quoteNo: "Q-2026-0090", customer: "หจก. บางปะอินโลจิสติกส์", product: "โกดังสำเร็จรูป", valueNum: 2700000, status: "sent_to_client", date: "1 สัปดาห์" },
      { quoteNo: "Q-2026-0084", customer: "บ.วังน้อยฟู้ดส์",          product: "โรงงาน",  valueNum: 4100000, status: "won",   date: "3 สัปดาห์" },
    ],
  },
  KKN: {
    code: "KKN",
    monthlySales: [
      { month: "ม.ค.", value: 2600 }, { month: "ก.พ.", value: 3100 }, { month: "มี.ค.", value: 2900 },
      { month: "เม.ย.", value: 3600 }, { month: "พ.ค.", value: 3200 }, { month: "มิ.ย.", value: 3450 },
    ],
    leads: [
      { id: "LD-K01", name: "บ.อีสานแดรี่",        province: "ขอนแก่น",   product: "โรงงาน",  valueNum: 3900000, status: "quoted",    assignedAt: "3 วันก่อน" },
      { id: "LD-K02", name: "เทศบาลนครขอนแก่น",   province: "ขอนแก่น",   product: "อาคารสำเร็จรูปทุกประเภท",   valueNum: 1750000, status: "quoted",    assignedAt: "1 สัปดาห์" },
      { id: "LD-K03", name: "หจก. ชุมแพเกษตรภัณฑ์", province: "ขอนแก่น",   product: "โกดังสำเร็จรูป", valueNum: 1300000, status: "contacted", assignedAt: "2 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-K01", name: "โกดัง สหกรณ์โคนมขอนแก่น",  product: "โกดังสำเร็จรูป", valueNum: 2150000, progress: 55, status: "in_progress" },
      { id: "PRJ-K02", name: "โรงงาน อีสานแดรี่ เฟส 1",    product: "โรงงาน",  valueNum: 3900000, progress: 10, status: "in_progress" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0088", customer: "บ.อีสานแดรี่",       product: "โรงงาน",  valueNum: 3900000, status: "sent_to_client", date: "1 สัปดาห์" },
      { quoteNo: "Q-2026-0081", customer: "สหกรณ์โคนมขอนแก่น", product: "โกดังสำเร็จรูป", valueNum: 2150000, status: "won",   date: "4 สัปดาห์" },
    ],
  },
  UBN: {
    code: "UBN",
    monthlySales: [
      { month: "ม.ค.", value: 1900 }, { month: "ก.พ.", value: 2300 }, { month: "มี.ค.", value: 2100 },
      { month: "เม.ย.", value: 2600 }, { month: "พ.ค.", value: 2400 }, { month: "มิ.ย.", value: 2750 },
    ],
    leads: [
      { id: "LD-U01", name: "บ.อุบลไรซ์มิลล์",  province: "อุบลราชธานี", product: "โกดังสำเร็จรูป", valueNum: 2900000, status: "quoted",    assignedAt: "4 วันก่อน" },
      { id: "LD-U02", name: "หจก. เดชอุดมค้าวัสดุ", province: "อุบลราชธานี", product: "อาคารสำเร็จรูปทุกประเภท",  valueNum: 950000,  status: "contacted", assignedAt: "1 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-U01", name: "โกดังข้าว วารินฟาร์ม",   product: "โกดังสำเร็จรูป", valueNum: 1450000, progress: 80, status: "in_progress" },
      { id: "PRJ-U02", name: "โกดัง อุบลไรซ์มิลล์",     product: "โกดังสำเร็จรูป", valueNum: 2900000, progress: 0,  status: "in_progress" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0087", customer: "บ.อุบลไรซ์มิลล์",     product: "โกดังสำเร็จรูป", valueNum: 2900000,  status: "sent_to_client", date: "2 สัปดาห์" },
      { quoteNo: "Q-2026-0076", customer: "หจก. วารินฟาร์ม",     product: "โกดังสำเร็จรูป", valueNum: 1450000,  status: "won",  date: "5 สัปดาห์" },
      { quoteNo: "Q-2026-0066", customer: "บ.ศรีสะเกษวัสดุภัณฑ์",  product: "งานตามแบบของลูกค้า",     valueNum: 2300000, status: "lost", date: "2 เดือน" },
    ],
  },
  PKT: {
    code: "PKT",
    monthlySales: [
      { month: "ม.ค.", value: 1500 }, { month: "ก.พ.", value: 1800 }, { month: "มี.ค.", value: 2200 },
      { month: "เม.ย.", value: 1900 }, { month: "พ.ค.", value: 2100 }, { month: "มิ.ย.", value: 2300 },
    ],
    leads: [
      { id: "LD-P01", name: "บ.อันดามันมารีน่า",     province: "ภูเก็ต", product: "งานตามแบบของลูกค้า",      valueNum: 5200000, status: "quoted",    assignedAt: "2 วันก่อน" },
      { id: "LD-P02", name: "บ.กะตะบีชรีสอร์ท",      province: "ภูเก็ต", product: "อาคารสำเร็จรูปทุกประเภท",  valueNum: 2800000, status: "contacted", assignedAt: "6 วันก่อน" },
    ],
    projects: [
      { id: "PRJ-P01", name: "คลังสินค้า ถลางแวร์เฮาส์", product: "โกดังสำเร็จรูป", valueNum: 1850000, progress: 45, status: "in_progress" },
      { id: "PRJ-P02", name: "โครงหลังคา มารีน่าคลับ",    product: "งานตามแบบของลูกค้า",     valueNum: 3200000, progress: 20, status: "in_progress" },
    ],
    quotes: [
      { quoteNo: "Q-2026-0094", customer: "บ.อันดามันมารีน่า",    product: "งานตามแบบของลูกค้า",      valueNum: 5200000,  status: "sent_to_client", date: "1 สัปดาห์" },
      { quoteNo: "Q-2026-0079", customer: "หจก. ถลางแวร์เฮาส์",   product: "โกดังสำเร็จรูป", valueNum: 1850000,  status: "won",     date: "5 สัปดาห์" },
      { quoteNo: "Q-2026-0060", customer: "บ.ภูเก็ตรีสอร์ทกรุ๊ป", product: "อาคารสำเร็จรูปทุกประเภท",  valueNum: 3400000, status: "expired", date: "2 เดือน" },
    ],
  },
};

// ─── PIPELINE FUNNEL — ถูกลบทั้งหัวข้อ ───────────────────────
// ตัวเลข funnel/เป้า/เหตุผลเสียโอกาส เคยเป็นค่าคงที่ค้างไว้ที่นี่ ตอนนี้อ่านจากของจริงหมดแล้ว:
// ขั้นตอนการขาย → lead.status · เป้า → loadHQTargets() · เหตุผลเสียโอกาส → loadLostReasons()


// ─── HQ ALL CUSTOMERS ────────────────────────────────────────────────────────

export type HQCustomer = {
  id: number;
  localId?: number;  // เลขนับลูกค้า "ของสาขาต้นทาง" — ใช้ออกรหัส CNX-00001 ให้ตรงกับที่ดีลเลอร์เห็น
                     // ไม่ระบุ = ใช้ id (ลูกค้า seed ของสาขาอื่นเก็บเลขนับไว้ที่ id อยู่แล้ว)
  name: string;
  dealerCode: string;
  dealerName: string;
  province: string;
  dealsWon: number;
  totalRevenue: number;
  status: "active" | "inactive";
  lastContact: string;
  segment: "enterprise" | "sme" | "government";
};

// ไม่มีลูกค้าของ CNX ที่นี่โดยตั้งใจ — CNX คือสาขาที่เล่นได้ ลูกค้าจึงมาจากสมุดสด (useNetworkCustomers)
// ถ้าเติม CNX กลับมาที่นี่ HQ จะนับซ้ำกับสมุดสดทันที
export const hqAllCustomers: HQCustomer[] = [
  { id:1,  name:"บ.อุตสาหกรรมไทย จก.",        dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",        province:"ระยอง",       dealsWon:2, totalRevenue:7400000,  status:"active",   lastContact:"23 มิ.ย. 2569", segment:"enterprise" },
  { id:2,  name:"บ.เอบีซี แมนูแฟคเจอริ่ง",    dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",        province:"ชลบุรี",      dealsWon:1, totalRevenue:2800000,  status:"active",   lastContact:"18 มิ.ย. 2569", segment:"enterprise" },
  { id:3,  name:"หจก. ไอซ์โลจิสติกส์",         dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",          province:"ระยอง",       dealsWon:3, totalRevenue:9200000,  status:"active",   lastContact:"10 มิ.ย. 2569", segment:"sme" },
  { id:4,  name:"บ.พีซีบี คอนสตรัคชั่น",       dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",        province:"ชลบุรี",      dealsWon:1, totalRevenue:3500000,  status:"active",   lastContact:"15 มิ.ย. 2569", segment:"sme" },
  { id:5,  name:"บ.ปิโตรเคม (ไทย)",            dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",        province:"ระยอง",       dealsWon:1, totalRevenue:5100000,  status:"active",   lastContact:"5 มิ.ย. 2569",  segment:"enterprise" },
  { id:10, name:"บ.ทีดีเค ลอจิสติกส์",         dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",        province:"ตาก",         dealsWon:2, totalRevenue:8100000,  status:"active",   lastContact:"21 มิ.ย. 2569", segment:"enterprise" },
  { id:11, name:"หจก. แม่สอดพาณิชย์",          dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",          province:"ตาก",         dealsWon:2, totalRevenue:4200000,  status:"active",   lastContact:"18 มิ.ย. 2569", segment:"sme" },
  { id:12, name:"บ.เฟรชโลจิส",                 dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",        province:"ตาก",         dealsWon:1, totalRevenue:3200000,  status:"active",   lastContact:"15 มิ.ย. 2569", segment:"sme" },
  { id:13, name:"วิสาหกิจชุมชนดอยอินทนนท์",   dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",         province:"เชียงราย",    dealsWon:1, totalRevenue:3100000,  status:"active",   lastContact:"20 มิ.ย. 2569", segment:"sme" },
  { id:14, name:"บ.โกลเด้น ทรี โลจิส",         dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",        province:"เชียงราย",    dealsWon:2, totalRevenue:4500000,  status:"active",   lastContact:"18 มิ.ย. 2569", segment:"sme" },
  { id:15, name:"ม.ราชภัฏเชียงราย",            dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",   province:"เชียงราย",    dealsWon:1, totalRevenue:4900000,  status:"inactive", lastContact:"5 มิ.ย. 2569",  segment:"government" },
  { id:16, name:"สหกรณ์การเกษตรนครสวรรค์",    dealerCode:"NSN", dealerName:"นครสวรรค์เอ็นจิเนียริ่ง",          province:"นครสวรรค์",   dealsWon:1, totalRevenue:1600000,  status:"active",   lastContact:"10 มิ.ย. 2569", segment:"sme" },
  { id:17, name:"เทศบาลเมืองนครสวรรค์",        dealerCode:"NSN", dealerName:"นครสวรรค์เอ็นจิเนียริ่ง",   province:"นครสวรรค์",   dealsWon:1, totalRevenue:900000,   status:"active",   lastContact:"24 มิ.ย. 2569", segment:"government" },
  { id:18, name:"บ.ระยองยานยนต์",              dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",        province:"ระยอง",       dealsWon:1, totalRevenue:3300000,  status:"active",   lastContact:"8 มิ.ย. 2569",  segment:"sme" },
  { id:20, name:"หจก. ราชบุรีโลหะ",            dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",          province:"ราชบุรี",     dealsWon:0, totalRevenue:0,        status:"active",   lastContact:"24 มิ.ย. 2569", segment:"sme" },
  { id:21, name:"บ.โรจนะอินดัสทรี",            dealerCode:"AYA", dealerName:"อยุธยาเมทัลบิลด์",        province:"พระนครศรีอยุธยา", dealsWon:0, totalRevenue:0,       status:"active",   lastContact:"26 มิ.ย. 2569", segment:"enterprise" },
  { id:22, name:"บ.วังน้อยฟู้ดส์",              dealerCode:"AYA", dealerName:"อยุธยาเมทัลบิลด์",        province:"พระนครศรีอยุธยา", dealsWon:1, totalRevenue:4100000, status:"active",   lastContact:"9 มิ.ย. 2569",  segment:"sme" },
  { id:23, name:"หจก. บางปะอินโลจิสติกส์",      dealerCode:"AYA", dealerName:"อยุธยาเมทัลบิลด์",          province:"พระนครศรีอยุธยา", dealsWon:0, totalRevenue:0,       status:"active",   lastContact:"23 มิ.ย. 2569", segment:"sme" },
  { id:24, name:"บ.อีสานแดรี่",                 dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",        province:"ขอนแก่น",     dealsWon:0, totalRevenue:0,        status:"active",   lastContact:"21 มิ.ย. 2569", segment:"enterprise" },
  { id:25, name:"สหกรณ์โคนมขอนแก่น",           dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",          province:"ขอนแก่น",     dealsWon:1, totalRevenue:2150000,  status:"active",   lastContact:"4 มิ.ย. 2569",  segment:"sme" },
  { id:26, name:"เทศบาลนครขอนแก่น",            dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",   province:"ขอนแก่น",     dealsWon:0, totalRevenue:0,        status:"active",   lastContact:"16 พ.ค. 2569", segment:"government" },
  { id:27, name:"บ.อุบลไรซ์มิลล์",              dealerCode:"UBN", dealerName:"อุบลสตีลกรุ๊ป",        province:"อุบลราชธานี", dealsWon:0, totalRevenue:0,        status:"active",   lastContact:"19 มิ.ย. 2569", segment:"sme" },
  { id:28, name:"หจก. วารินฟาร์ม",              dealerCode:"UBN", dealerName:"อุบลสตีลกรุ๊ป",          province:"อุบลราชธานี", dealsWon:1, totalRevenue:1450000,  status:"active",   lastContact:"27 พ.ค. 2569", segment:"sme" },
  { id:29, name:"บ.ศรีสะเกษวัสดุภัณฑ์",           dealerCode:"UBN", dealerName:"อุบลสตีลกรุ๊ป",        province:"ศรีสะเกษ",    dealsWon:0, totalRevenue:0,        status:"inactive", lastContact:"7 พ.ค. 2569",  segment:"sme" },
  { id:30, name:"บ.อันดามันมารีน่า",            dealerCode:"PKT", dealerName:"ภูเก็ตสตรัคเจอรัล",        province:"ภูเก็ต",      dealsWon:0, totalRevenue:0,        status:"active",   lastContact:"27 มิ.ย. 2569", segment:"enterprise" },
  { id:31, name:"หจก. ถลางแวร์เฮาส์",           dealerCode:"PKT", dealerName:"ภูเก็ตสตรัคเจอรัล",          province:"ภูเก็ต",      dealsWon:1, totalRevenue:1850000,  status:"active",   lastContact:"31 พ.ค. 2569", segment:"sme" },
  { id:32, name:"บ.สงขลาแคนนิ่ง",               dealerCode:"HYI", dealerName:"หาดใหญ่สตีลกรุ๊ป",        province:"สงขลา",       dealsWon:0, totalRevenue:0,        status:"inactive", lastContact:"22 เม.ย. 2569", segment:"sme" },
  { id:33, name:"บ.มาบตาพุดเคมิคอล",           dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",        province:"ระยอง",       dealsWon:0, totalRevenue:0,        status:"active",   lastContact:"27 มิ.ย. 2569", segment:"enterprise" },
  { id:35, name:"บ.ชายแดนเทรดดิ้ง",             dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",        province:"ตาก",         dealsWon:0, totalRevenue:0,        status:"active",   lastContact:"7 มิ.ย. 2569",  segment:"sme" },
  { id:36, name:"หจก. น้ำพองวัสดุ",             dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",          province:"ขอนแก่น",     dealsWon:1, totalRevenue:1250000,  status:"active",   lastContact:"2 พ.ค. 2569",  segment:"sme" },
];

// ─── HQ ALL QUOTATIONS ───────────────────────────────────────────────────────

// ระยะเวลาส่งมอบมาตรฐาน (วัน) — HQ กำหนดเป็นกฎธุรกิจ ใช้เมื่อใบเสนอราคาไม่ได้ระบุ deliveryTime ไว้เอง
// วันส่งมอบ = วันปิดการขาย + ระยะเวลานี้ (ดู delivery.ts)
// ⚠️ เคยมี DEFAULT_DELIVERY_DAYS = 90 ตรงนี้ — ลบแล้ว (บอสสั่ง 20 ส.ค. 69)
//    มันคือ "ระยะเวลาส่งมอบมาตรฐาน" ที่ใช้เสกวันส่งมอบให้ทุกงาน ทั้งที่ไม่มีใครกรอกวันส่งมอบจริง
//    ตัวเลขที่โชว์จึงเป็นของที่โปรแกรมคิดเอง ไม่ใช่ข้อมูลของงาน — ตัดทั้งสายแล้ว

export type HQQuotation = {
  id: string;
  quoteNo: string;
  dealerCode: string;
  dealerName: string;
  customer: string;
  valueNum: number;
  status: QuotationStatus;
  createdAt: string;
  /** เวลาที่ระบบบันทึกใบนี้ (มีเฉพาะโหมดต่อฐานข้อมูลจริง) — ดู QuotationMock.savedAt */
  savedAt?: string;
  salesperson: string;
  productLine: string;
  // ── รายละเอียดราคา: มีเฉพาะใบที่ดีลเลอร์สร้างจริง (สาขา CNX) — ใบ seed ของสาขาอื่นไม่มี ──
  // valueNum = มูลค่างานก่อน VAT · materialCost = ราคารวมจากรายการสินค้า (เท่ากับ valueNum)
  materialCost?: number;
  lineItems?: QuoteLineItem[];
};

export const hqAllQuotations: HQQuotation[] = [
  { id:"HQ-Q01", quoteNo:"Q-2026-0089", dealerCode:"CNX", dealerName:"เชียงใหม่สตีลบิลด์", customer:"บจ. ไทยสตีล",            valueNum:1800000,  status:"won"          , createdAt:"15 พ.ค. 2569", salesperson:"วิภา ป.",      productLine:"โกดังสำเร็จรูป"  },
  { id:"HQ-Q02", quoteNo:"Q-2026-0091", dealerCode:"CNX", dealerName:"เชียงใหม่สตีลบิลด์", customer:"หจก. ราชบุรีโลหะ",       valueNum:760000,  status:"sent_to_client"          , createdAt:"1 มิ.ย. 2569",  salesperson:"วิภา ป.",     productLine:"โกดังสำเร็จรูป" },
  { id:"HQ-Q03", quoteNo:"Q-2026-0085", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.อุตสาหกรรมไทย จก.",    valueNum:4200000,  status:"won",              createdAt:"10 มิ.ย. 2569", salesperson:"สมชาย ว.",     productLine:"โรงงาน"  },
  { id:"HQ-Q04", quoteNo:"Q-2026-0086", dealerCode:"CNX", dealerName:"เชียงใหม่สตีลบิลด์", customer:"สหกรณ์ลำพูน จก.",        valueNum:2200000,  status:"won",              createdAt:"8 มิ.ย. 2569",  salesperson:"วิภา ป.",      productLine:"โกดังสำเร็จรูป" },
  { id:"HQ-Q05", quoteNo:"Q-2026-0082", dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",    customer:"บ.ทีดีเค ลอจิสติกส์",    valueNum:5800000,  status:"sent_to_client",             createdAt:"5 มิ.ย. 2569",  salesperson:"อนันต์ ส.",    productLine:"โรงงานผลิตเหล็ก"  },
  { id:"HQ-Q06", quoteNo:"Q-2026-0080", dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",  customer:"วิสาหกิจชุมชนดอยอินทนนท์",valueNum:3100000,  status:"sent_to_client",             createdAt:"3 มิ.ย. 2569",  salesperson:"เกรียงไกร จ.", productLine:"งานตามแบบของลูกค้า"    },
  { id:"HQ-Q07", quoteNo:"Q-2026-0078", dealerCode:"NSN", dealerName:"นครสวรรค์เอ็นจิเนียริ่ง", customer:"สหกรณ์การเกษตรนครสวรรค์",valueNum:1600000,  status:"won",              createdAt:"1 มิ.ย. 2569",  salesperson:"ธีรพล อ.",    productLine:"โกดังเก็บสินค้าเกษตร" },
  { id:"HQ-Q08", quoteNo:"Q-2026-0077", dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",  customer:"บ.โกลเด้น ทรี โลจิส",    valueNum:2400000,  status:"won",              createdAt:"28 พ.ค. 2569",  salesperson:"เกรียงไกร จ.", productLine:"โรงงาน"  },
  { id:"HQ-Q09", quoteNo:"Q-2026-0075", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.ปิโตรเคม (ไทย)",       valueNum:5100000,  status:"won",              createdAt:"25 พ.ค. 2569",  salesperson:"สมชาย ว.",     productLine:"โรงงานพลาสติก"  },
  { id:"HQ-Q10", quoteNo:"Q-2026-0073", dealerCode:"CNX", dealerName:"เชียงใหม่สตีลบิลด์", customer:"บ.ซีเอ็นเอ็กซ์ ฟูด",    valueNum:3800000,  status:"sent_to_client",             createdAt:"20 พ.ค. 2569",  salesperson:"สุรชัย ท.",    productLine:"โรงงานอาหาร"  },
  { id:"HQ-Q11", quoteNo:"Q-2026-0070", dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",    customer:"หจก. แม่สอดพาณิชย์",    valueNum:2100000,  status:"won",              createdAt:"15 พ.ค. 2569",  salesperson:"อนันต์ ส.",    productLine:"งานตามแบบของลูกค้า"    },
  { id:"HQ-Q12", quoteNo:"Q-2026-0068", dealerCode:"HYI", dealerName:"หาดใหญ่สตีลกรุ๊ป",  customer:"บ.หาดใหญ่อุตสาหกรรม",   valueNum:480000,  status:"draft",            createdAt:"10 พ.ค. 2569",  salesperson:"พิมพ์ ท.",     productLine:"งานตามแบบของลูกค้า"    },
  { id:"HQ-Q13", quoteNo:"Q-2026-0065", dealerCode:"NSN", dealerName:"นครสวรรค์เอ็นจิเนียริ่ง", customer:"เทศบาลเมืองนครสวรรค์",  valueNum:900000,  status:"sent_to_client",             createdAt:"5 พ.ค. 2569",   salesperson:"ธีรพล อ.",    productLine:"อาคารสำนักงาน"    },
  { id:"HQ-Q14", quoteNo:"Q-2026-0062", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.เอสทีพี โฮลดิ้ง",     valueNum:1900000,  status:"won",              createdAt:"1 พ.ค. 2569",   salesperson:"ประภาส ร.",    productLine:"อาคารสำนักงาน"    },
  { id:"HQ-Q15", quoteNo:"Q-2026-0058", dealerCode:"CNX", dealerName:"เชียงใหม่สตีลบิลด์", customer:"กลุ่มเกษตรลำพูน",       valueNum:2900000,  status:"lost",             createdAt:"20 เม.ย. 2569", salesperson:"วิภา ป.",      productLine:"งานตามแบบของลูกค้า"    },
  { id:"HQ-Q16", quoteNo:"Q-2026-0055", dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",  customer:"ม.ราชภัฏเชียงราย",       valueNum:4900000,  status:"draft",            createdAt:"15 เม.ย. 2569", salesperson:"สุชาติ ม.",    productLine:"งานตามแบบของลูกค้า"    },
  { id:"HQ-Q17", quoteNo:"Q-2026-0111", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.ระยองยานยนต์",         valueNum:3300000,  status:"sent_to_client",             createdAt:"25 มิ.ย. 2569", salesperson:"สมชาย ว.",     productLine:"งานโครงสร้างพิเศษ"    },
  { id:"HQ-Q18", quoteNo:"Q-2026-0093", dealerCode:"AYA", dealerName:"อยุธยาเมทัลบิลด์",   customer:"บ.โรจนะอินดัสทรี",        valueNum:6400000,  status:"sent_to_client",  createdAt:"26 มิ.ย. 2569", salesperson:"กมล พ.",       productLine:"โรงงานผลิตเหล็ก"  },
  { id:"HQ-Q19", quoteNo:"Q-2026-0090", dealerCode:"AYA", dealerName:"อยุธยาเมทัลบิลด์",   customer:"หจก. บางปะอินโลจิสติกส์",  valueNum:2700000,  status:"sent_to_client",  createdAt:"23 มิ.ย. 2569", salesperson:"กมล พ.",       productLine:"โกดังสำเร็จรูป" },
  { id:"HQ-Q20", quoteNo:"Q-2026-0084", dealerCode:"AYA", dealerName:"อยุธยาเมทัลบิลด์",   customer:"บ.วังน้อยฟู้ดส์",          valueNum:4100000,  status:"won",             createdAt:"9 มิ.ย. 2569",  salesperson:"อรทัย บ.",     productLine:"โรงงานอาหาร"  },
  { id:"HQ-Q21", quoteNo:"Q-2026-0088", dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",  customer:"บ.อีสานแดรี่",             valueNum:3900000,  status:"sent_to_client",  createdAt:"21 มิ.ย. 2569", salesperson:"ชูชัย ก.",     productLine:"โรงงานอาหาร"  },
  { id:"HQ-Q22", quoteNo:"Q-2026-0081", dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",  customer:"สหกรณ์โคนมขอนแก่น",       valueNum:2150000,  status:"won",             createdAt:"4 มิ.ย. 2569",  salesperson:"ชูชัย ก.",     productLine:"โกดังสำเร็จรูป" },
  { id:"HQ-Q23", quoteNo:"Q-2026-0071", dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",  customer:"เทศบาลนครขอนแก่น",        valueNum:1750000,  status:"sent_to_client",  createdAt:"16 พ.ค. 2569",  salesperson:"มณีรัตน์ ศ.",  productLine:"อาคารสำเร็จรูปทุกประเภท"    },
  { id:"HQ-Q24", quoteNo:"Q-2026-0087", dealerCode:"UBN", dealerName:"อุบลสตีลกรุ๊ป",      customer:"บ.อุบลไรซ์มิลล์",          valueNum:2900000,  status:"sent_to_client",  createdAt:"19 มิ.ย. 2569", salesperson:"ประวิทย์ ห.",  productLine:"โกดังเก็บสินค้าเกษตร" },
  { id:"HQ-Q25", quoteNo:"Q-2026-0076", dealerCode:"UBN", dealerName:"อุบลสตีลกรุ๊ป",      customer:"หจก. วารินฟาร์ม",          valueNum:1450000,  status:"won",             createdAt:"27 พ.ค. 2569",  salesperson:"ประวิทย์ ห.",  productLine:"โกดังเก็บสินค้าเกษตร" },
  { id:"HQ-Q26", quoteNo:"Q-2026-0066", dealerCode:"UBN", dealerName:"อุบลสตีลกรุ๊ป",      customer:"บ.ศรีสะเกษวัสดุภัณฑ์",       valueNum:2300000, status:"lost",            createdAt:"7 พ.ค. 2569",   salesperson:"ประวิทย์ ห.",  productLine:"งานตามแบบของลูกค้า"    },
  { id:"HQ-Q27", quoteNo:"Q-2026-0094", dealerCode:"PKT", dealerName:"ภูเก็ตสตรัคเจอรัล", customer:"บ.อันดามันมารีน่า",        valueNum:5200000,  status:"sent_to_client",  createdAt:"27 มิ.ย. 2569", salesperson:"ศิริพร ณ.",    productLine:"งานโครงสร้างพิเศษ"    },
  { id:"HQ-Q28", quoteNo:"Q-2026-0079", dealerCode:"PKT", dealerName:"ภูเก็ตสตรัคเจอรัล", customer:"หจก. ถลางแวร์เฮาส์",       valueNum:1850000,  status:"won",             createdAt:"31 พ.ค. 2569",  salesperson:"ศิริพร ณ.",    productLine:"โกดังสำเร็จรูป" },
  { id:"HQ-Q29", quoteNo:"Q-2026-0060", dealerCode:"PKT", dealerName:"ภูเก็ตสตรัคเจอรัล", customer:"บ.ภูเก็ตรีสอร์ทกรุ๊ป",     valueNum:3400000, status:"expired",         createdAt:"25 เม.ย. 2569", salesperson:"ศิริพร ณ.",    productLine:"อาคารพาณิชย์"    },
  { id:"HQ-Q30", quoteNo:"Q-2026-0059", dealerCode:"HYI", dealerName:"หาดใหญ่สตีลกรุ๊ป",  customer:"บ.สงขลาแคนนิ่ง",           valueNum:2600000,  status:"lost",            createdAt:"22 เม.ย. 2569", salesperson:"พิมพ์ ท.",     productLine:"โรงงานอาหาร"  },
  { id:"HQ-Q31", quoteNo:"Q-2026-0112", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",  customer:"บ.มาบตาพุดเคมิคอล",    valueNum:7200000,  status:"sent_to_client",  createdAt:"27 มิ.ย. 2569", salesperson:"สมชาย ว.",   productLine:"โรงงานพลาสติก"  },
  { id:"HQ-Q32", quoteNo:"Q-2026-0069", dealerCode:"CNX", dealerName:"เชียงใหม่สตีลบิลด์", customer:"บ.นอร์ทเทิร์นฟาร์ม",   valueNum:2500000,  status:"expired",         createdAt:"12 พ.ค. 2569",  salesperson:"วิภา ป.",     productLine:"โกดังสำเร็จรูป" },
  { id:"HQ-Q33", quoteNo:"Q-2026-0083", dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",  customer:"บ.ชายแดนเทรดดิ้ง",     valueNum:1900000,  status:"sent_to_client",  createdAt:"7 มิ.ย. 2569",  salesperson:"อนันต์ ส.",   productLine:"อาคารสำเร็จรูปทุกประเภท"    },
  { id:"HQ-Q34", quoteNo:"Q-2026-0074", dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์", customer:"บ.แม่สายอิมปอร์ต",     valueNum:3300000,  status:"lost",            createdAt:"20 พ.ค. 2569",  salesperson:"เกรียงไกร จ.", productLine:"โรงงานอิเล็กทรอนิกส์"  },
  { id:"HQ-Q35", quoteNo:"Q-2026-0113", dealerCode:"AYA", dealerName:"อยุธยาเมทัลบิลด์",   customer:"บ.บ้านแพนอุตสาหกรรม",  valueNum:5600000,  status:"draft",           createdAt:"28 มิ.ย. 2569", salesperson:"อรทัย บ.",    productLine:"โรงงาน"  },
  { id:"HQ-Q36", quoteNo:"Q-2026-0064", dealerCode:"KKN", dealerName:"ขอนแก่นโครงเหล็ก",  customer:"หจก. น้ำพองวัสดุ",      valueNum:1250000,  status:"won",             createdAt:"2 พ.ค. 2569",   salesperson:"มณีรัตน์ ศ.",  productLine:"โกดังสำเร็จรูป" },

  // ── ใบที่ปิดการขายแล้วของลูกค้าสาขาอื่น (ประวัติการซื้อย้อนหลัง) ──────────────────
  // เติมให้ "ใบที่ปิดการขายได้" ตรงกับ dealsWon / totalRevenue ที่ประกาศไว้ใน hqAllCustomers
  // (เดิม hqAllCustomers บอกว่าลูกค้าซื้อแล้วกี่ดีล/กี่บาท แต่ไม่มีใบรองรับ → /hq/customers ขึ้น "—" ทั้งแถว)
  // กติกา: จำนวนใบ = dealsWon · ผลรวม valueNum = totalRevenue (ไม่คิดยอดขายขึ้นใหม่)
  //        ผู้ขาย = คนของสาขานั้นที่มีอยู่แล้ว · productLine = แม่แบบ/แม่แบบย่อยใน Master Catalog เท่านั้น
  // ลูกค้าที่ซื้อหลายดีล จะมีดีลเก่าย้อนไปหลายปี → วันส่งมอบจึงกระจายหลายปี
  { id:"HQ-Q37", quoteNo:"Q-2014-0012", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.อุตสาหกรรมไทย จก.",    valueNum:3200000,  status:"won",             createdAt:"12 ก.พ. 2557",  salesperson:"สมชาย ว.",     productLine:"โกดังเก็บวัตถุดิบ" },
  { id:"HQ-Q38", quoteNo:"Q-2014-0038", dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",    customer:"หจก. แม่สอดพาณิชย์",     valueNum:2100000,  status:"won",             createdAt:"5 มิ.ย. 2557",  salesperson:"อนันต์ ส.",    productLine:"อาคารพาณิชย์" },
  { id:"HQ-Q39", quoteNo:"Q-2015-0019", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"หจก. ไอซ์โลจิสติกส์",    valueNum:3000000,  status:"won",             createdAt:"8 มี.ค. 2558",  salesperson:"สมชาย ว.",     productLine:"โกดังห้องเย็น" },
  { id:"HQ-Q40", quoteNo:"Q-2016-0057", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"หจก. ไอซ์โลจิสติกส์",    valueNum:2400000,  status:"won",             createdAt:"20 ส.ค. 2559",  salesperson:"ประภาส ร.",    productLine:"โกดังเก็บสินค้าทั่วไป" },
  { id:"HQ-Q41", quoteNo:"Q-2016-0061", dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",  customer:"บ.โกลเด้น ทรี โลจิส",    valueNum:2100000,  status:"won",             createdAt:"11 ก.ย. 2559",  salesperson:"เกรียงไกร จ.", productLine:"โกดังเก็บสินค้าทั่วไป" },
  { id:"HQ-Q42", quoteNo:"Q-2016-0074", dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",    customer:"บ.ทีดีเค ลอจิสติกส์",    valueNum:4700000,  status:"won",             createdAt:"16 พ.ย. 2559",  salesperson:"อนันต์ ส.",    productLine:"คลังกระจายสินค้า" },
  { id:"HQ-Q43", quoteNo:"Q-2026-0031", dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",  customer:"ม.ราชภัฏเชียงราย",       valueNum:4900000,  status:"won",             createdAt:"15 ม.ค. 2569",  salesperson:"สุชาติ ม.",    productLine:"อาคารเรียน" },
  { id:"HQ-Q44", quoteNo:"Q-2026-0033", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.พีซีบี คอนสตรัคชั่น",  valueNum:3500000,  status:"won",             createdAt:"22 ม.ค. 2569",  salesperson:"ประภาส ร.",    productLine:"อาคารสำนักงาน" },
  { id:"HQ-Q45", quoteNo:"Q-2026-0036", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"หจก. ไอซ์โลจิสติกส์",    valueNum:3800000,  status:"won",             createdAt:"3 ก.พ. 2569",   salesperson:"สมชาย ว.",     productLine:"คลังกระจายสินค้า" },
  { id:"HQ-Q46", quoteNo:"Q-2026-0037", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.เอบีซี แมนูแฟคเจอริ่ง", valueNum:2800000, status:"won",             createdAt:"5 ก.พ. 2569",   salesperson:"ประภาส ร.",    productLine:"โรงงานทั่วไป" },
  { id:"HQ-Q47", quoteNo:"Q-2026-0038", dealerCode:"CRI", dealerName:"เชียงรายสตรัคเจอร์",  customer:"วิสาหกิจชุมชนดอยอินทนนท์", valueNum:3100000, status:"won",             createdAt:"6 ก.พ. 2569",   salesperson:"เกรียงไกร จ.", productLine:"โกดังเก็บสินค้าเกษตร" },
  { id:"HQ-Q48", quoteNo:"Q-2026-0039", dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",    customer:"บ.ทีดีเค ลอจิสติกส์",    valueNum:3400000,  status:"won",             createdAt:"9 ก.พ. 2569",   salesperson:"อนันต์ ส.",    productLine:"โกดังเก็บสินค้าทั่วไป" },
  { id:"HQ-Q49", quoteNo:"Q-2026-0041", dealerCode:"MST", dealerName:"แม่สอดเมทัลเวิร์ค",    customer:"บ.เฟรชโลจิส",            valueNum:3200000,  status:"won",             createdAt:"12 ก.พ. 2569",  salesperson:"อนันต์ ส.",    productLine:"โกดังห้องเย็น" },
  { id:"HQ-Q50", quoteNo:"Q-2026-0043", dealerCode:"RYG", dealerName:"ระยองสตีลเวิร์คส์",     customer:"บ.ระยองยานยนต์",         valueNum:3300000,  status:"won",             createdAt:"19 ก.พ. 2569",  salesperson:"สมชาย ว.",     productLine:"โรงงานทั่วไป" },
  { id:"HQ-Q51", quoteNo:"Q-2026-0045", dealerCode:"NSN", dealerName:"นครสวรรค์เอ็นจิเนียริ่ง", customer:"เทศบาลเมืองนครสวรรค์", valueNum:900000,   status:"won",             createdAt:"28 ก.พ. 2569",  salesperson:"ธีรพล อ.",     productLine:"อาคารสำนักงาน" },
];

// (DEALER PIPELINE ถูกลบทั้งบล็อก — ยุบกระดานดีลเข้ากับลูกค้าเป้าหมาย: lead.status + tasks เป็นแหล่งเดียว
//  ไม่มี PipelineDealMock/pipelineDeals/pipelineStages/DealActivity อีกแล้ว · ดู SalesContext)

// ─── DEALER NOTES (ported from pms-benjamin) ──────────────────────────────────
export type NoteCategory = "ลูกค้า" | "โอกาสการขาย" | "ประชุม" | "ทั่วไป";
export type NoteMock = {
  id: number; title: string; content: string;
  category: NoteCategory; pinned: boolean;
  customerId?: number; customerName?: string;
  author: string; createdAt: string; updatedAt: string;
  color: string;
};

export const noteCategoryColor: Record<NoteCategory, { bg: string; text: string; dot: string }> = {
  ลูกค้า:  { bg: "#dce5f0", text: "#003366", dot: "#003366" },
  โอกาสการขาย: { bg: "#fef3cd", text: "#b45309", dot: "#f59e0b" },
  ประชุม:  { bg: "#f0fdf4", text: "#15803d", dot: "#059669" },
  ทั่วไป:  { bg: "#f0f0f5", text: "#6b7280", dot: "#9ca3af" },
};

export const notes: NoteMock[] = [
  {
    id: 1, title: "สรุปการโทรหา บจ. ไทยสตีล", category: "ลูกค้า", pinned: true,
    content: "โทรคุยกับคุณสมชาย เรื่องความคืบหน้าการขายโกดัง\n- ลูกค้าพอใจกับความคืบหน้า 65%\n- ขอให้ส่งรายงานรายสัปดาห์\n- จะนัดติดตามโอกาสการขายวันที่ 5 ก.ค. 2569",
    customerId: 1, customerName: "บจ. ไทยสตีล",
    author: "สมชาย", createdAt: "2026-06-20 14:30", updatedAt: "2026-06-20 14:30", color: "#003366",
  },
  {
    id: 2, title: "ประชุมทีมขาย ประจำสัปดาห์", category: "ประชุม", pinned: true,
    content: "ประชุมวันจันทร์ที่ 23 มิ.ย. 2569\n\nสรุปประเด็น:\n1. โอกาสการขายรวม ฿14.6M (กำลังดำเนินการ 6 รายการ)\n2. เป้าหมาย Q2 ต้องปิด 2 deals เพิ่ม\n3. ลูกค้าเป้าหมายรายใหม่จาก นิคมฯ อมตะ 3 ราย\n\nAction items:\n- วิภา: follow up บจ. อุตรดิตถ์โลหะ ภายใน 3 วัน\n- วิชัย: นำเสนอ spec ให้ VCS Asia รอบ 2",
    author: "กาญจนา", createdAt: "2026-06-23 10:00", updatedAt: "2026-06-23 10:45", color: "#15803d",
  },
  {
    id: 3, title: "ข้อเสนอพิเศษ บจ. ซีซีเอส", category: "โอกาสการขาย", pinned: false,
    content: "ลูกค้าขอส่วนลดเพิ่ม 5% สำหรับโอกาสการขาย อาคารสำเร็จรูป เชียงใหม่\n\nพิจารณา:\n- มูลค่าโอกาสการขาย ฿3.2M\n- ส่วนลด 5% = ฿160,000\n- อัตรากำไรยังคุ้มอยู่ถ้าได้ออเดอร์ครั้งถัดไป\n\nตัดสินใจ: อนุมัติส่วนลด 3% เป็นพิเศษ รอยืนยัน",
    customerId: 2, customerName: "บจ. ซีซีเอส",
    author: "กาญจนา", createdAt: "2026-06-18 16:00", updatedAt: "2026-06-19 09:00", color: "#b45309",
  },
  {
    id: 4, title: "ติดต่อ Mr. Kevin Lim (VCS Asia)", category: "ลูกค้า", pinned: false,
    content: "อีเมลถึง Kevin เรื่องโอกาสการขายระยอง เฟส 2\n- Kevin สนใจขยายโกดังอีก 2,000 ตร.ม.\n- งบประมาณ ฿8-10M\n- ต้องการใบเสนอราคาภายใน 2 สัปดาห์\n\nขั้นถัดไป: ส่ง BOQ เบื้องต้นภายใน 27 มิ.ย.",
    customerId: 5, customerName: "VCS Asia Co., Ltd.",
    author: "วิชัย", createdAt: "2026-06-22 11:15", updatedAt: "2026-06-22 11:15", color: "#003366",
  },
  {
    id: 5, title: "รายการตรวจปิดการขาย โรงงานสำเร็จรูป", category: "ทั่วไป", pinned: false,
    content: "สิ่งที่ต้องทำก่อนปิดการขาย โรงงานสำเร็จรูป นครสวรรค์:\n\n☑ ยืนยันรายละเอียดใบเสนอราคาครบ\n☑ ตรวจสอบเงื่อนไขการชำระเงิน\n☑ ส่งเอกสารสัญญาให้ลูกค้า\n☑ ทบทวนเงื่อนไขร่วมกับลูกค้า\n☐ รับเงินงวดสุดท้าย\n☐ ออกใบรับประกัน",
    author: "สมชาย", createdAt: "2026-06-15 08:00", updatedAt: "2026-06-21 13:00", color: "#6b7280",
  },
  {
    id: 6, title: "ติดตาม หจก. ราชบุรีโลหะ", category: "โอกาสการขาย", pinned: false,
    content: "โอกาสการขายโกดังสำเร็จรูป ราชบุรี 760K\nลูกค้ายังลังเลเรื่องราคา เปรียบเทียบกับคู่แข่ง\n\nจุดแข็งที่ต้องเน้น:\n- โครงสร้างมาตรฐาน ISO\n- รับประกัน 5 ปี\n- ส่งได้เร็วกว่า (8 สัปดาห์)\n\nวางแผนโทรติดตามอีกครั้ง 25 มิ.ย.",
    customerId: 3, customerName: "หจก. ราชบุรีโลหะ",
    author: "วิภา", createdAt: "2026-06-17 09:30", updatedAt: "2026-06-17 09:30", color: "#b45309",
  },
];

// ── ชื่อบทบาทที่แสดงให้ผู้ใช้เห็น — แหล่งเดียวทั้งระบบ ──────────────────────────────
//
// บั๊กจริง (เอเจนต์ตรวจ UI เจอเอง 10 ส.ค. 69):
//   ผู้ใช้คนเดียวถูกเรียกสองชื่อพร้อมกันในจอเดียว
//     แถบบนขวา "ผู้บริหาร HQ"      / มุมซ้ายล่าง "เจ้าของแพลตฟอร์ม"
//     แถบบนขวา "ผู้จัดการดีลเลอร์"   / มุมซ้ายล่าง "เจ้าของบัญชีดีลเลอร์"
//   เพราะสองที่เขียนชื่อบทบาทของตัวเองแยกกัน ไม่ได้อ้างแหล่งเดียวกัน
//   ผู้ใช้อ่านแล้วไม่แน่ใจว่าตกลงตัวเองเป็นอะไร และคำไหนคือคำที่ระบบใช้จริง
export function roleLabelOf(role: string, isHQ: boolean): string {
  if (isHQ) return role === "SUPER_ADMIN" ? "ผู้ดูแลระบบ" : "ผู้บริหาร HQ";
  return ({ DEALER_ADMIN: "ผู้จัดการดีลเลอร์", DEALER_SALES: "เซลส์", DEALER_SITE: "เซลส์ภาคสนาม" } as Record<string, string>)[role] ?? "สมาชิก";
}
