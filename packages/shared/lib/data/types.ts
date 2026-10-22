// สัญญาข้อมูลกลาง (Data Layer) — type เดียวใช้ทั้ง LocalAdapter และ SupabaseAdapter
// เพื่อไม่ให้ shape ข้อมูลระหว่าง local/backend หลุดจากกัน (drift)
export type {
  LeadRow, CustomerRow, QuotationMock, AppointmentMock,
  DealerRow, DealerFile, ResponsiblePerson,
  HQPolicy, HQTargets, HQNotifRules, LeadRules, DealerLeadRulesMap, QuoteNumbering,
  LeadTaskDef,
} from "@pms/shared/lib/mock";
export type { IssuerProfile, NotifPrefs, UserProfile } from "@pms/shared/lib/mock";
export type { DocProfile } from "@pms/shared/lib/quotationPrint";

// ตั้งค่าทั้งชุดของสาขาหนึ่ง — เดิมกระจายอยู่ใน localStorage 4 คีย์
import type { IssuerProfile as _Issuer, NotifPrefs as _Notif } from "@pms/shared/lib/mock";
import type { DocProfile as _Doc } from "@pms/shared/lib/quotationPrint";
export type DealerSettings = {
  issuer: _Issuer;      // หัวกระดาษ: ชื่อบริษัท/ที่อยู่/โทร/เลขภาษี
  document: _Doc;       // คำนำหน้าเลขที่ · อายุใบ · เงื่อนไข · ตราประทับ · ลายเซ็น
  logo: string;         // โลโก้สัญลักษณ์ (ไอคอน) บนแถบเมนู · "" = ยังไม่ตั้ง
  notifPrefs: _Notif;   // การแจ้งเตือนที่สาขาเปิด/ปิดเอง
  pricing: DealerPricing; // % บวกตั้งต้นของสาขานี้ (ดูด้านล่าง)
};

/** % บวกตั้งต้นของสาขา (บวกบนต้นทุนจากใบ HQ) — เป็นสิทธิ์ของดีลเลอร์ ตั้งเองได้อิสระ · หน่วยเปอร์เซ็นต์ (10 = บวก 10%)
 *  defaultPct = ค่าที่ใช้ · byTemplate = ค่าเดิมสมัยตั้งรายแม่แบบ (อ่านอย่างเดียว ใช้ย้ายค่า — ดู markupPctOf ใน lib/boq.ts) */
export type DealerPricing = {
  defaultPct?: number;
  byTemplate?: Record<string, number>;
};

// รายการในบันทึกตรวจสอบ (audit_log) — ใครทำอะไร เมื่อไหร่
//
// นิยามไว้ที่นี่ ไม่ใช่ที่ useAudit.ts: ไฟล์นี้คือ "สัญญาข้อมูลกลาง" ที่ทุกอย่างในชั้นข้อมูลอ้างถึง
// เดิม re-export มาจาก useAudit.ts (ซึ่งเป็น React hook) ทำให้เกิดวงจร import ย้อนกลับ:
//   types.ts → useAudit.ts → RoleContext.tsx → data/index.ts → LocalAdapter.ts → ports.ts → types.ts
// ตอนนั้นยังไม่พังเพราะเป็น import แบบ type ล้วน (ถูกตัดทิ้งตอนคอมไพล์) แต่เปราะมาก —
// วันไหนมีใครเปลี่ยนเป็นการ import ค่าจริง จะกลายเป็นวงจรตอนรัน (ค่าเป็น undefined ตอน render แรก)
// ย้ายมาไว้ที่นี่แล้วให้ useAudit.ts import กลับไปแทน = ทิศทางถูกต้อง วงจรหายถาวร
export type AuditEntry = {
  id: number; user: string; role: string; action: string; target: string; at: string;
};

// แจ้งเตือนหนึ่งเรื่อง (ตาราง notifications · ใบ 0231) — ฐานสร้างจากตารางกลาง notification_kinds ที่เดียว
//   หน้าเว็บแสดงตามนี้อย่างเดียว ห้ามประกอบแจ้งเตือนเองจากลีด/ใบ/บันทึกการใช้งาน (ตัวตรวจ check-notification-catalog)
export type AppNotification = {
  id: number; kind: string; title: string; body: string;
  /** กดแล้วเปิดตรงเรื่องนั้น (ลีด/คำขอ/ใบ) */
  href: string;
  createdAt: string;
};

// ข้อมูลบริษัทของสำนักงานใหญ่ (แถวเดียวทั้งระบบ)
export type HQCompany = {
  name: string; address: string; taxId: string;
  phone: string; email: string; website: string;
};

// โน้ตของลูกค้า — ของแต่ละสาขา
export type CustomerNote = {
  id: number;
  dealerCode?: string;
  customerId?: number;
  title: string;
  content: string;
  category: string;
  pinned: boolean;
  color: string;
  author: string;
  createdAt: string;
  updatedAt: string;
};

// ผู้ใช้ในระบบ (แถวใน profiles) — หน้า /hq/users ใช้แสดง "คนที่ล็อกอินได้จริง"
export type SystemUser = {
  id: string;               // = auth user id
  name: string;
  email: string;            // อีเมลที่ใช้ล็อกอิน (จาก auth) — แก้จากหน้านี้ไม่ได้
  phone: string;
  role: string;             // user_role enum: SUPER_ADMIN | HQ_MANAGEMENT | HQ_STAFF | DEALER_*
  department: string;
  dealerCode: string;       // "" = ผู้ใช้ฝั่งสำนักงานใหญ่
  status: "active" | "inactive";
  createdAt: string;
  avatar?: string;
};

// ขอบเขตข้อมูล — ส่งเข้าทุก query ที่ผูกกับสาขา
// วันนี้ LocalAdapter ใช้ filter · เฟส B ส่งให้ RLS ที่ Supabase คุมแทน
export type Scope = { dealerCode?: string; isHQ?: boolean };

// ── ลูกค้าเป้าหมายของสำนักงานใหญ่ = ผู้สนใจเป็นดีลเลอร์ (บอสสั่ง 14 ก.ย. 69) ──
//   คนละเรื่องกับ LeadRow (ลูกค้าที่จะซื้ออาคารของดีลเลอร์) — ดู migration 0170 · lib/dealerProspects.ts
export type DealerProspectStatus = "new" | "contacted" | "profile_sent" | "meeting" | "considering" | "won" | "lost";
export type DealerProspect = {
  id: number;
  name: string;                  // ชื่อผู้ติดต่อ / ชื่อบริษัท
  social?: string | null;        // ชื่อบนโซเชียล (Facebook/LINE)
  phone?: string | null;
  email?: string | null;
  province?: string | null;
  region?: string | null;        // ภาค (เลือกก่อนจังหวัด) · "ทุกภาค" = ทั่วประเทศ คู่กับจังหวัด "ทุกจังหวัด"
  businessType?: string | null;  // ประเภทธุรกิจ (คอลัมน์ Type ในไฟล์ของเบนจามิน)
  channel?: string | null;       // ช่องทางที่เข้ามา
  firstContact?: string | null;  // YYYY-MM-DD
  followUp?: string | null;      // YYYY-MM-DD นัดติดตามครั้งถัดไป
  note?: string | null;
  status: DealerProspectStatus;
  lostReason?: string | null;
  assigned?: string | null;      // ผู้ดูแลฝั่งสำนักงานใหญ่ (ชื่อ ไม่ใช่บัญชีเข้าระบบ)
  dealerCode?: string | null;    // ดีลเลอร์ที่รายนี้กลายมาเป็น (ตั้งเมื่อสำเร็จ)
  convertedAt?: string | null;
  logo?: string | null;          // รูปประจำตัว (data URL ย่อ 256px · 0175) — ว่าง = ตัวย่อชื่อ
  lastContactAt?: string | null; // ติดต่อล่าสุด — ฐานข้อมูลตั้งจากบันทึกการติดต่อเท่านั้น (0174) แอปเขียนเองไม่ได้
  createdAt?: string;
  updatedAt?: string;
};

// ── ประวัติผู้สนใจเป็นดีลเลอร์ — ระบบบันทึกเอง + บันทึกการติดต่อ · แก้/ลบไม่ได้ (migration 0174) ──
export type ProspectActivityKind = "created" | "status" | "contact" | "proposal";
export type ProspectActivity = {
  id: number;
  prospectId: number;
  kind: ProspectActivityKind;
  channel?: string | null;       // เฉพาะบันทึกการติดต่อ
  body: string;
  fromStatus?: DealerProspectStatus | null;
  toStatus?: DealerProspectStatus | null;
  nextFollowUp?: string | null;  // YYYY-MM-DD เฉพาะบันทึกการติดต่อ
  actor: string;                 // อีเมลผู้ทำ (ฐานข้อมูลตั้งเอง) · งานเบื้องหลัง = system
  createdAt: string;
};
export type ProspectContactInput = { prospectId: number; channel: string; body: string; nextFollowUp?: string | null };

// ── ใบค่าแฟรนไชส์ (บอสสั่ง 14 ก.ย. 69) ──
//   "เหมือนใบเสนอราคาของดีลเลอร์ แต่ของ HQ" · คล้ายแฟรนไชส์แต่ไม่ใช่แฟรนไชส์ (บอสยืนยัน)
//   ต้องมีใบที่ส่งแล้ว/ตอบรับ ถึงจะสร้างดีลเลอร์ใหม่ได้ · ดู migration 0172 · lib/dealerProposals.ts
export type DealerPackage = "standard" | "exclusive";
/** บันทึกการชำระค่าแฟรนไชส์ (0208) — แก้/ลบไม่ได้ ยกเลิกพร้อมเหตุผลแล้วบันทึกใหม่ · ยอดที่ยกเลิกไม่นับ */
export type DealerProposalPayment = {
  id: number;
  proposalId: number;
  paidOn: string;                // YYYY-MM-DD
  amount: number;
  reference: string;
  createdAt?: string;
  createdByName?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
};
export type DealerProposalPaymentInput = { proposalId: number; paidOn: string; amount: number; reference: string };
// expired / superseded ระบบตั้งให้เท่านั้น (เลยวันยืนราคา · ส่งเวอร์ชันใหม่แล้ว · 0207)
export type DealerProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "superseded";
export type DealerPackageProposal = {
  id: number;
  prospectId: number;
  proposalNo?: string | null;    // DP-ปี-NNNN ฐานข้อมูลออกให้เสมอ
  package: DealerPackage;
  region?: string | null;
  province?: string | null;
  amount?: number | null;        // ค่าแรกเข้า (บาท · จ่ายครั้งเดียว) — HQ กรอกเอง ไม่บังคับ
  contractMonths?: number | null; // ระยะสัญญา (เดือน) 1–120 — ไม่บังคับ
  annualTarget?: number | null;  // เป้ายอดซื้อต่อปี (บาท) — ตั้งเป็นดีลเลอร์แล้วเป็นเป้ายอดขายรายปีของสาขา
  terms?: string | null;
  proposedDate?: string | null;  // YYYY-MM-DD
  validUntil?: string | null;    // YYYY-MM-DD
  status: DealerProposalStatus;
  note?: string | null;          // หมายเหตุภายใน ไม่พิมพ์ลงเอกสาร
  version?: number;              // เวอร์ชันในสายเดียวกัน (1 = ใบแรก) · ฐานข้อมูลตั้งให้ (0207)
  supersedesId?: number | null;  // ใบเวอร์ชันก่อนหน้า
  closeReason?: string | null;   // เหตุผลที่ปิด (ปฏิเสธ/หมดอายุ/ถูกแทน)
  closedAt?: string | null;
  /** วันครบกำหนดชำระ (YYYY-MM-DD · ใบ 0231) — เลยแล้วยังชำระไม่ครบ = แจ้งเตือน HQ · คนละเรื่องกับ validUntil */
  paymentDueOn?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

