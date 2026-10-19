import type { LeadIntent } from "../leadIntent";
import type { HqOverview } from "../hqOverview";
// Ports — สัญญา (interface) ที่ทุก adapter ต้องมี
// context/hook เรียกผ่าน repository เหล่านี้เท่านั้น · เบื้องหลังสลับ adapter ได้
// ทุกเมธอดเป็น async ตั้งแต่แรก → ต่อ network (เฟส B) ไม่ต้องแก้ signature
import type { DealerPackageProposal, DealerProposalStatus, DealerProposalPayment, DealerProposalPaymentInput } from "./types";
import type { DealerProspect, ProspectActivity, ProspectContactInput } from "./types";
import type { HQRecruitSettings } from "../recruitSettings";
import type {
  DealerRow, DealerFile, ResponsiblePerson,
  HQPolicy, HQTargets, HQNotifRules, LeadRules, DealerLeadRulesMap, LeadTaskDef,
  AuditEntry, LeadRow, QuotationMock, CustomerRow, AppointmentMock, Scope,
  DealerSettings, UserProfile, HQCompany, CustomerNote, SystemUser,
} from "./types";

// ── โดเมนอ้างอิง/ตั้งค่า (ห่อ loader เดิมได้ทันที — Step 0) ──
export interface DealersRepo {
  list(): Promise<DealerRow[]>;
  /** เพิ่ม/แก้ (upsert) ตามชุดที่ส่งมา — "ไม่" ลบแถวที่ไม่ได้ส่งมา */
  save(all: DealerRow[]): Promise<void>;
  /** ลบสาขา — ต้องสั่งตรง ๆ ห้ามให้ระบบเดาจากการที่แถวหายไปจากอาร์เรย์ */
  remove(code: string): Promise<void>;
}
export interface FilesRepo {
  list(scope?: Scope): Promise<DealerFile[]>;
  add(f: Omit<DealerFile, "id">): Promise<DealerFile>;
  update(f: DealerFile): Promise<void>;
  remove(id: number): Promise<void>;
}
export interface PersonsRepo {
  list(scope?: Scope): Promise<ResponsiblePerson[]>;
  // แทนที่รายชื่อ "ของสาขานั้น" ทั้งชุด (ตรา dealer_code ให้ · supabase: ลบของสาขาแล้วใส่ใหม่ · RLS dealer-own)
  save(all: ResponsiblePerson[], dealerCode: string): Promise<void>;
}
export interface SettingsRepo {
  getPolicy(): Promise<HQPolicy>;
  getTargets(): Promise<HQTargets>;
  getNotifRules(): Promise<HQNotifRules>;
  getLeadRulesMap(): Promise<DealerLeadRulesMap>;
  saveLeadRules(dealerCode: string, rules: LeadRules): Promise<void>;
  getQuoteValidityDays(): Promise<number>;
  /** เหตุผล "ปิดการขายไม่สำเร็จ" ที่ HQ ตั้ง — ดีลเลอร์ใช้ร่วมกันทั้งเครือ (เขียนได้เฉพาะ HQ) */
  getLostReasons(): Promise<string[]>;
  saveLostReasons(lost: string[]): Promise<void>;
  /** งานมาตรฐานของแต่ละขั้นในเส้นทางการขาย ที่ HQ ตั้ง — ดีลเลอร์เช็กงานชุดนี้ (เขียนได้เฉพาะ HQ) */
  getLeadTasks(): Promise<LeadTaskDef[]>;
  saveLeadTasks(tasks: LeadTaskDef[]): Promise<void>;
  /** ค่าตั้งงานหาดีลเลอร์ของ HQ (ช่องทาง/ประเภทธุรกิจ/เหตุผล/ชื่องาน/ค่าตั้งต้นใบค่าแฟรนไชส์ · 0176) — อ่าน HQ · เขียนผู้ดูแลข้อมูลกลาง */
  getRecruitSettings(): Promise<HQRecruitSettings>;
  saveRecruitSettings(s: HQRecruitSettings): Promise<void>;
  // เขียนนโยบายระดับเครือ (HQ เท่านั้น — RLS is_hq ฝั่ง supabase · singleton id=1)
  savePolicy(policy: HQPolicy): Promise<void>;
  saveTargets(targets: HQTargets): Promise<void>;
  saveNotifRules(rules: HQNotifRules): Promise<void>;
  /** กู้คืน/นำเข้าค่าตั้งหลายกลุ่มพร้อมกันแบบ all-or-nothing (Phase 4 transaction, 0093) — undefined = ไม่แตะ
   *  กลุ่มนั้น · ใช้กับปุ่ม "นำเข้า (กู้คืน)"/"คืนค่าเริ่มต้น" หน้า HQ ตั้งค่า (เดิมยิงแยกทีละกลุ่ม เน็ตหลุด
   *  กลางทาง = กู้คืนได้แค่บางส่วน) · supabase: RPC restore_hq_settings · local: เขียนทีละกลุ่มในเครื่อง */
  restoreSettings(patch: {
    policy?: HQPolicy; targets?: HQTargets; notifRules?: HQNotifRules; lostReasons?: string[]; company?: HQCompany;
  }): Promise<void>;
}
// ── ตั้งค่าของดีลเลอร์แต่ละสาขา (หัวกระดาษ/เอกสาร/โลโก้/แจ้งเตือน) ──
// เดิมอยู่ใน localStorage ของเครื่องที่ใช้ → ล้างเบราว์เซอร์/ย้ายเครื่องแล้วหาย
// เจ้าของคือ "สาขา" ไม่ใช่ผู้ใช้คนใดคนหนึ่ง · HQ อ่านได้แต่แก้ไม่ได้ (RLS ที่ DB บังคับ)
export interface DealerSettingsRepo {
  get(dealerCode: string): Promise<DealerSettings>;
  /** บันทึกเฉพาะกลุ่มที่ส่งมา (patch) — ไม่ต้องส่งครบทุกกลุ่ม */
  save(dealerCode: string, patch: Partial<DealerSettings>): Promise<void>;
  /** โลโก้ของทุกสาขาที่ตั้งไว้แล้ว (รหัสสาขา → รูป) — HQ ใช้แสดงการ์ดหน้าดีลเลอร์ · ไม่มีรูป = ไม่มีคีย์ */
  logos(): Promise<Record<string, string>>;
}

// ── โปรไฟล์ของผู้ใช้ที่ล็อกอินอยู่ (ชื่อ/เบอร์/อีเมลติดต่อ/รูป) ──
// เดิมอยู่ใน localStorage และผูกกับ "สาขา" ไม่ใช่ "คน" → ผู้ใช้ในสาขาเดียวกันทับกันเอง
// เขียนได้เฉพาะโปรไฟล์ตัวเอง · บทบาท/สาขา แก้เองไม่ได้ (trigger ที่ DB กัน)
export interface ProfileRepo {
  get(): Promise<UserProfile | null>;
  save(p: UserProfile): Promise<void>;
}

// ── ข้อมูลบริษัทของสำนักงานใหญ่ — อ่านได้ทุกคน เขียนเฉพาะผู้มีสิทธิ์แก้ข้อมูลกลาง ──
// ── พื้นที่ของดีลเลอร์ (ใบ 0195 · จังหวัดเดียวมีหลายดีลเลอร์ได้ตั้งแต่ใบ 0214) ──
export type UnmatchedDealer = { dealerCode: string; province: string };
/** เจ้าของพื้นที่รายจังหวัด (ทุกบัญชีอ่านได้ · RLS 0195) — ใช้บอกว่าจังหวัดไหนยังว่างตอนแปลงเป็นดีลเลอร์ */
export type TerritoryOwner = { province: string; dealerCode: string; legacy: boolean };
/** แผนโอนลูกค้าเป้าหมายของ HQ ต่อจังหวัด — auto = ดีลเลอร์รายเดียว · choose = ทับซ้อน HQ เลือก · queue = ไม่มีจังหวัด/จังหวัดว่าง */
export type HqTransferPlanRow = { province: string; mode: "auto" | "choose" | "queue"; leads: number; dealerCodes: string[] };
export interface TerritoriesRepo {
  /** พื้นที่ทั้งหมด: จังหวัด → ดีลเลอร์ที่ดูแล */
  owners(): Promise<TerritoryOwner[]>;
  /** ดีลเลอร์ที่ไม่ได้พื้นที่ เพราะจังหวัดในทะเบียนไม่ตรงรายชื่อมาตรฐาน (ระบบไม่เดาจับคู่) */
  unmatched(): Promise<UnmatchedDealer[]>;
  /** โอนลูกค้าเป้าหมายของ HQ (ใบ 0197): แผน · โอนทุกจังหวัดที่มีดีลเลอร์รายเดียว · โอนจังหวัดเดียวให้ดีลเลอร์ที่เลือก — คืนจำนวนที่โอน */
  transferPlan(): Promise<HqTransferPlanRow[]>;
  transferAuto(): Promise<number>;
  transfer(province: string, to: string): Promise<number>;
}

// ── คำขอใบเสนอราคา (Flow ใหม่ · ใบ 0183) — ทุกคำสั่งเรียกคำสั่งของฐาน ฐานขยับสถานะทั้งสองฝั่งเอง ──
export type QuoteRequestInput = { leadNumId: number; product: string; subtype?: string; area?: number | null; spec?: string; province?: string };
export interface QuoteRequestsRepo {
  /** คำขอทั้งหมดของลูกค้าเป้าหมายหนึ่งราย (ใหม่→เก่า) */
  listForLead(dealerCode: string, leadNumId: number): Promise<import("../quoteRequests").QuoteRequest[]>;
  /** คิวของสำนักงานใหญ่: คำขอที่ยังเปิดอยู่ทั้งเครือ (ใหม่ / กำลังทำราคา / ส่งใบแล้ว) พร้อมชื่อบริษัท */
  listQueue(): Promise<import("../quoteRequests").QuoteRequest[]>;
  /** กล่องงาน HQ (หน้า 5 · ใบ 0215): จำนวน 4 กลุ่ม + รายการของกลุ่มที่เลือก — คำค้นเดียวกันกรองทั้งคู่ · ฐานนับ/เรียง/ติดป้ายให้ */
  board(group: import("../quoteRequests").QuoteBoardGroup, q: string): Promise<import("../quoteRequests").QuoteBoard>;
  submit(input: QuoteRequestInput): Promise<import("../quoteRequests").QuoteRequest>;
  /** ยกเลิกได้จนกว่า HQ ส่งใบ · ต้องมีเหตุผล · closeLead = ปิดลูกค้าเป้าหมายเป็นไม่สำเร็จ (ไม่งั้นกลับเป็นรวบรวมความต้องการ) */
  cancel(id: number, reason: string, closeLead: boolean): Promise<void>;
  /** ขอแก้ราคา (หลัง HQ ส่งใบ) — คำขอเดิมปิด เปิดคำขอใหม่ เริ่มนับ 14 วันใหม่ */
  reprice(id: number, reason: string, spec?: string): Promise<import("../quoteRequests").QuoteRequest>;
  /** HQ กดรับเรื่อง → กำลังทำราคา (ผู้รับผิดชอบ = ผู้กด) */
  accept(id: number): Promise<void>;
  /** ใบ HQ ของคำขอ (ขั้น 5–6 · ด่าน 2) — ดีลเลอร์เห็นเฉพาะใบที่ส่งแล้ว (ฐานกรองให้) · ยังไม่มี = null */
  hqQuoteFor(requestId: number): Promise<import("../quoteRequests").HqQuote | null>;
  /** HQ บันทึกร่างใบ (ทำ BOQ) — คำขอที่ยังไม่รับเรื่อง = รับเรื่องให้เลย · ส่งแล้วแก้ไม่ได้ */
  saveHqQuote(requestId: number, lines: import("../quoteRequests").HqQuoteLine[], validUntil: string, note: string): Promise<import("../quoteRequests").HqQuote>;
  /** HQ ส่งใบให้ดีลเลอร์ — ล็อกเวอร์ชัน · หยุดนับ 14 วัน · อีเมลถึงดีลเลอร์ (ฐานทำเอง) */
  sendHqQuote(requestId: number): Promise<import("../quoteRequests").HqQuote>;
  /** HQ เริ่มเวอร์ชันใหม่จากใบที่ส่งไปแล้ว (หลังดีลเลอร์ขอแก้ราคา) */
  copyHqQuote(requestId: number, sourceHqQuoteId: number): Promise<import("../quoteRequests").HqQuote>;
  /** ใบ HQ ตามเลขใบ (ใบลูกค้าที่ผูกไว้ · ด่าน 3) — ดีลเลอร์เห็นเฉพาะใบที่ส่งแล้วของสาขาตัวเอง */
  hqQuoteById(id: number): Promise<import("../quoteRequests").HqQuote | null>;
  /** margin ของใบลูกค้า (ใบ 0201 · quotation_margin) — HQ ทุกใบ · ดีลเลอร์ของตัวเอง · ไม่ผูกใบ HQ = null */
  margin(dealerCode: string, quotationId: string): Promise<import("../quoteRequests").QuoteMargin | null>;
  /** HQ ย้อนการตอบรับ (won) ของใบลูกค้า — ต้องมีเหตุผล · ฐานตรวจว่าเป็น HQ + จดไทม์ไลน์/บันทึกการใช้งานเอง (ใบ 0204/0205) */
  revertWon(dealerCode: string, quotationId: string, reason: string, to: "sent_to_client" | "lost"): Promise<void>;
  /** ลูกค้าเป้าหมายของสาขาที่ HQ ส่งใบแล้ว รอดีลเลอร์ทำใบให้ลูกค้า (ป้าย "ได้ราคาแล้ว") */
  quotedLeadIds(dealerCode: string): Promise<number[]>;
}

export interface HQCompanyRepo {
  get(): Promise<HQCompany>;
  save(c: HQCompany): Promise<void>;
}

// ── โน้ตลูกค้า (ของแต่ละสาขา) ──
export interface NotesRepo {
  list(scope?: Scope): Promise<CustomerNote[]>;
  create(n: Omit<CustomerNote, "id">): Promise<CustomerNote>;
  update(n: CustomerNote): Promise<CustomerNote>;
  remove(id: number): Promise<void>;
}

// ── ลูกค้าเป้าหมายของสำนักงานใหญ่ (ผู้สนใจเป็นดีลเลอร์) — อ่าน = HQ · เขียน = ผู้ดูแลข้อมูลกลาง (0170) ──
export interface ProspectsRepo {
  list(): Promise<DealerProspect[]>;
  create(p: Omit<DealerProspect, "id">): Promise<DealerProspect>;
  update(p: DealerProspect): Promise<DealerProspect>;
  remove(id: number): Promise<void>;
}

// ── ใบค่าแฟรนไชส์ (ของสำนักงานใหญ่) — สิทธิ์ชุดเดียวกับลูกค้าเป้าหมาย HQ (0172) ──
//   setStatus แยกจาก update: ใบที่ส่งแล้วถูกล็อกเนื้อหา เปลี่ยนสถานะต้องไม่ส่งทั้งแถวกลับไป
export interface ProposalsRepo {
  list(prospectId?: number): Promise<DealerPackageProposal[]>;
  create(p: Omit<DealerPackageProposal, "id">): Promise<DealerPackageProposal>;
  update(p: DealerPackageProposal): Promise<DealerPackageProposal>;
  /** ปฏิเสธต้องส่งเหตุผล (ฐานข้อมูลบังคับ 0207) */
  setStatus(id: number, status: DealerProposalStatus, reason?: string): Promise<DealerPackageProposal>;
  /** ส่งแล้วแก้ไม่ได้ → ทำเวอร์ชันใหม่ (ร่าง) จากใบล่าสุดของสาย ที่ส่งแล้ว/ปฏิเสธ/หมดอายุ (0207) */
  newVersion(id: number): Promise<DealerPackageProposal>;
  remove(id: number): Promise<void>;
  /** ตกลง + ชำระ (0208): บันทึกการชำระของใบที่ตอบรับ — HQ เท่านั้น · แก้/ลบไม่ได้ ยกเลิกพร้อมเหตุผล */
  payments(proposalId: number): Promise<DealerProposalPayment[]>;
  addPayment(input: DealerProposalPaymentInput): Promise<DealerProposalPayment>;
  cancelPayment(id: number, reason: string): Promise<DealerProposalPayment>;
  /** พร้อมแปลงเป็นดีลเลอร์ไหม — null = พร้อม · ข้อความ = ยังไม่พร้อมเพราะอะไร (ฐานข้อมูลตอบ) */
  conversionReady(prospectId: number): Promise<string | null>;
}

// ── ประวัติลูกค้าเป้าหมาย (HQ) — อ่าน = HQ · เพิ่มได้แค่บันทึกการติดต่อ · ไม่มีแก้/ลบ (0174) ──
//   บันทึกการติดต่อแล้ว ฐานข้อมูลตั้ง ติดต่อล่าสุด/นัดติดตาม/ขั้น ให้เอง → หน้าจอต้องโหลดลูกค้าเป้าหมายรายนั้นใหม่
export interface ProspectActivitiesRepo {
  list(prospectId: number): Promise<ProspectActivity[]>;
  addContact(input: ProspectContactInput): Promise<ProspectActivity>;
}

// ── ผู้ใช้ในระบบ (หน้า /hq/users) ──
// อ่านได้ = HQ · แก้บทบาท/สถานะ/แผนก ได้เฉพาะ SUPER_ADMIN (บังคับที่ RLS)
//
// ⚠️ สร้าง/ลบบัญชีจริงทำจากฝั่ง client ไม่ได้ — ต้องใช้ service_role ซึ่งห้ามอยู่ในเบราว์เซอร์
//    (แอปจึงต้องปิดปุ่มพวกนั้นในโหมดจริง ไม่ใช่ปล่อยให้กดแล้วเข้าใจว่าสำเร็จ)
export interface UsersRepo {
  list(): Promise<SystemUser[]>;
  /** แก้ได้: ชื่อ/บทบาท/แผนก/สถานะ/รูป/เบอร์/อีเมลติดต่อ
   *
   *  ⚠️ "email" ที่นี่คือ **อีเมลติดต่อ** ที่ผู้ใช้ตั้งเอง ไม่ใช่อีเมลที่ใช้ล็อกอิน
   *     อีเมลล็อกอินอยู่ที่ระบบยืนยันตัวตน แก้จากหน้านี้ไม่ได้
   *
   *  รูป/เบอร์/อีเมลติดต่อ เคยไม่อยู่ในรายการนี้ (แก้ 11 ส.ค. 69) ทั้งที่ฟอร์มแก้ไขผู้ใช้
   *  ให้กรอกได้ครบ ผลคือเปลี่ยนรูปแล้วหน้าจอขึ้นรูปใหม่ให้ดู แต่ไม่เคยถูกบันทึกเลย
   *  พอโหลดหน้าใหม่รูปเก่ากลับมา — ผู้ใช้แจ้งว่า "เปลี่ยนรูปแล้วทำไมไม่เปลี่ยน"
   */
  update(u: Pick<SystemUser, "id" | "name" | "role" | "department" | "status">
    & Partial<Pick<SystemUser, "avatar" | "phone" | "email">>): Promise<void>;
  /** สร้าง/ลบบัญชีได้ไหมในโหมดนี้ — โหมดเดโมได้ · โหมดจริงต้องทำที่ระบบยืนยันตัวตน */
  canCreate(): boolean;
}

// ── บัญชีเข้าระบบของดีลเลอร์ (ดีลเลอร์แก้อีเมล/รหัสผ่านเองได้) ─────────────────────
//
// กติกา (บอสสั่ง 28 ส.ค. 69):
//   • ดีลเลอร์แก้เองได้ 2 ครั้ง "ตลอดอายุบัญชี" (นับรวมตั้งแต่ HQ สร้างบัญชีให้)
//   • ครั้งที่ 3 เป็นต้นไป ต้องส่งคำขอให้สำนักงานใหญ่อนุมัติก่อน จึงจะมีผล
//   • ทุกครั้งที่เปลี่ยน สำนักงานใหญ่ต้องรู้ (แจ้งเตือน + บันทึกการใช้งาน)
//     และเปิดดูรหัสที่ดีลเลอร์ตั้งเองได้เหมือนรหัสที่ HQ ตั้งให้
export type AccountChangeKind = "email" | "password" | "both";

export type AccountRequest = {
  id: string;
  dealerCode: string;
  dealerName?: string;
  kind: AccountChangeKind;
  /** อีเมลใหม่ที่ขอเปลี่ยน (ถ้าขอเปลี่ยนอีเมล) — รหัสผ่านไม่ส่งมาที่หน้าจอ */
  newEmail?: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
};

export type AccountState = {
  email: string;
  /** ใช้สิทธิ์แก้เองไปกี่ครั้งแล้ว · เพดานกี่ครั้ง (ปกติ 2) */
  selfChangesUsed: number;
  selfChangesLimit: number;
  /** คำขอที่ยังรอสำนักงานใหญ่อนุมัติ (มีได้ทีละใบ) */
  pending: AccountRequest | null;
  /** คำขอล่าสุดที่ถูกปฏิเสธ (ยังไม่มีการเปลี่ยนบัญชีหลังจากนั้น) — ดีลเลอร์ต้องรู้ผล ไม่ใช่คำขอหายเงียบ */
  lastRejected?: { kind: AccountChangeKind; newEmail?: string; requestedAt: string; decidedAt: string; reason?: string } | null;
  /** ยังไม่ได้ตั้งรหัสผ่านของตัวเองตั้งแต่สำนักงานใหญ่สร้างบัญชี — ต้องตั้งก่อนใช้งาน (ไม่นับสิทธิ์แก้เอง) */
  mustChangePassword?: boolean;
  /** อีเมลติดต่อ (รับแจ้งเตือน) และสถานะยืนยัน — ด่าน 1 · ใบ 0194 */
  contactEmail?: string;
  contactEmailVerified?: boolean;
  /** บัญชีที่ HQ สร้างให้และยังไม่ได้ยืนยันอีเมลติดต่อ — หน้าจอพาไปยืนยันหลังตั้งรหัสครั้งแรก */
  mustVerifyEmail?: boolean;
};

/** ผลของการกดบันทึก — applied = มีผลทันที · pending = ส่งคำขอรออนุมัติแล้ว */
export type AccountChangeResult = { applied: boolean; pending: boolean; message: string };

// ดีลเลอร์เปลี่ยนอีเมล/รหัสผ่านเองได้ (ยืนยันด้วยรหัสปัจจุบัน) · ดูรหัสของตัวเองได้เมื่อยืนยันเลขทางอีเมล (ดูด้านล่าง)
//   สำนักงานใหญ่เปิดดูสำเนารหัสของทุกสาขาได้ที่ /api/admin/dealers/secret
export interface AccountRepo {
  /** สถานะบัญชีของสาขา (อีเมลปัจจุบัน · โควตาที่เหลือ · คำขอที่ค้าง) */
  state(dealerCode: string): Promise<AccountState>;
  /** ดีลเลอร์ขอเปลี่ยนอีเมล/รหัสผ่านของตัวเอง — ต้องยืนยันรหัสผ่านปัจจุบันเสมอ */
  change(input: {
    dealerCode: string;
    currentPassword: string;
    email?: string;
    password?: string;
  }): Promise<AccountChangeResult>;
  /** ฝั่งสำนักงานใหญ่: รายการคำขอ (ใหม่→เก่า) */
  listRequests(): Promise<AccountRequest[]>;
  /** ฝั่งสำนักงานใหญ่: อนุมัติ/ปฏิเสธคำขอ — อนุมัติแล้วระบบเปลี่ยนให้ทันที */
  decide(id: string, action: "approve" | "reject", reason?: string): Promise<void>;
  /** ดีลเลอร์ตั้งรหัสผ่านใหม่ตอนเข้าระบบครั้งแรก — ไม่นับสิทธิ์แก้เอง 2 ครั้ง (บอสสั่ง 15 ก.ย. 69) */
  setFirstPassword(password: string): Promise<{ message: string }>;
  /** บันทึกอีเมลติดต่อและส่งโค้ดยืนยันไปที่อีเมลนั้น (ส่งไม่สำเร็จ = โยนข้อผิดพลาดพร้อมข้อความบอกทางออก) */
  sendContactEmailCode(email: string): Promise<{ sentTo: string }>;
  /** กรอกโค้ดที่ได้รับ → ยืนยันอีเมลติดต่อ */
  verifyContactEmail(code: string): Promise<{ verified: true }>;
  /** ฝั่งสำนักงานใหญ่: สถานะอีเมลติดต่อของดีลเลอร์ / ยืนยันแทน */
  contactEmailOf(dealerCode: string): Promise<{ contactEmail: string; verified: boolean }>;
  verifyContactEmailFor(dealerCode: string): Promise<{ verified: true; contactEmail: string }>;

  // ── ดูรหัสผ่านของตัวเอง โดยยืนยันด้วยเลขที่ส่งไปทางอีเมล (บอสสั่ง 1 ก.ย. 69) ──
  //
  // ⚠️ กติกาเปลี่ยนจากเดิม: 28 ส.ค. 69 เคยกำหนดว่า "ดีลเลอร์ดูรหัสผ่านตัวเองไม่ได้เลย"
  //    บอสสั่งใหม่ให้ดูได้ แต่ต้องพิสูจน์ก่อนว่าเป็นเจ้าของอีเมลนั้นจริง
  //    (คนที่แอบนั่งหน้าจอที่เปิดค้างไว้ จะเปิดดูไม่ได้ถ้าไม่มีอีเมลของสาขา)

  /** ขอเลขยืนยัน — ระบบส่งไปที่อีเมลเข้าระบบของสาขา คืนอีเมลปลายทาง (ปิดบางส่วน) ให้แสดงบนหน้าจอ */
  sendRevealCode(dealerCode: string): Promise<{ sentTo: string }>;
  /** ส่งเลขที่ได้จากอีเมลกลับมา — ถูกต้องจึงคืนรหัสผ่านปัจจุบัน */
  reveal(dealerCode: string, code: string): Promise<{ password: string }>;
}

export interface AuditRepo {
  /** อ่านบันทึกล่าสุดสูงสุด `limit` รายการ (ใหม่→เก่า) — audit_log โตไม่จำกัด จึงมีเพดานอ่านเสมอ (M8)
   *  ไม่ส่ง limit = ใช้ค่า default ของ adapter · หน้า /hq/audit แจ้งเมื่อชนเพดาน (ไม่ตัดเงียบ) */
  list(limit?: number): Promise<AuditEntry[]>;
  append(e: Omit<AuditEntry, "id" | "at">): Promise<void>;
}

// ── ตัวชี้วัดที่รวมยอดที่ DB (M9 Phase 1) — client ไม่ต้องดึงทุกแถวมารวมเอง ──
/** rollup ผลงานรายสาขา — นิยามตรงกับ useDealerPerformance (parity บังคับ) */
export interface DealerRollup {
  quotes: number;
  won: number;
  lost: number;
  /** Σ มูลค่าใบ won ที่ปีของ date = ปีที่ขอ */
  revenue: number;
  /** ลูกค้าเป้าหมายที่ยังไม่ปิด (status ไม่ใช่ PAID/CANCELLED) */
  openLeads: number;
  /** ลูกค้าเป้าหมายเปิดที่เงียบเกินเกณฑ์ (needsFollowUp) — ใช้คิด onTimePct = (open−stale)/open */
  staleLeads: number;
}
/** พารามิเตอร์คิด stale (onTimePct) — as_of + เกณฑ์วันรายสาขา (rules[code] ?? default) */
export interface DealerRollupOpts { asOf: string; defaultDays: number; perDealer: Record<string, number>; }
/** สถิติใบเสนอราคารายสาขา "ในช่วงวันที่" — ป้อน Scorecard (ผลรวม) + dealerStats ของ /hq/dashboard */
export interface QuoteRangeRow {
  quotes: number;
  won: number;
  lost: number;
  /** Σ total_value ของใบ won ในช่วง */
  wonVal: number;
  /** Σ total_value ของทุกใบในช่วง */
  quoteVal: number;
}
/** สรุปใบเสนอราคาของ /hq/dashboard ในช่วง — 3 ชุด ป้อนได้หลายการ์ดในรอบเดียว */
export interface QuoteMonthRow { y: number; m: number; quotes: number; won: number; lost: number; wonVal: number; }
/** สรุปรายวันในช่วง — ใช้กับกราฟ วันนี้ / 7 วันล่าสุด / เดือนนี้ (migration 0160) */
export interface QuoteDayRow { d: string; quotes: number; won: number; lost: number; wonVal: number; }
/** สรุปรายชั่วโมงตาม "เวลาที่บันทึกใบเข้าระบบ" (created_at · โซนไทย) — ใช้กับช่วง 1 วัน
 *  ⚠️ ไม่ใช่เวลาที่ปิดการขาย ระบบไม่ได้เก็บเวลานั้น */
export interface QuoteHourRow { h: number; quotes: number; won: number; wonVal: number; }
export interface QuoteStatusRow { status: string; count: number; value: number; }
// wonValue/wonProjects = เฉพาะใบที่ปิดการขายได้ — การ์ด "ยอดขาย" ต้องใช้ตัวนี้เท่านั้น
// (value/projects = ทุกใบรวมร่าง ใช้กับการ์ดที่พูดถึง "ใบเสนอราคา" ไม่ใช่ "ยอดขาย")
export interface QuoteProductRow { product: string | null; value: number; projects: number; wonValue?: number; wonProjects?: number; }
export interface DashboardQuoteSummary {
  byMonth: QuoteMonthRow[];
  byDay: QuoteDayRow[];
  byHour: QuoteHourRow[];
  byStatus: QuoteStatusRow[];
  byProduct: QuoteProductRow[];
}
/** สรุปใบเสนอราคา "หลังกรอง" สำหรับ /hq/quotations (M9 Phase 2) — ป้อน analytics ทั้งหน้า */
export interface QuoteDealerRow { dealerCode: string; count: number; value: number; sent: number; won: number; lost: number; wonVal: number; latest?: string | null; }
export interface QuoteAgingRow { bucket: string; count: number; value: number; }
export interface HQQuotationsSummary {
  byDealer: QuoteDealerRow[];
  byMonth: QuoteMonthRow[];
  byProduct: QuoteProductRow[];
  aging: QuoteAgingRow[];
}
/** ชุดกรองของหน้า quotations — derived filter (region/province/ชื่อ→dealerCodes · product→productLines) resolve มาก่อน */
export interface QuoteSummaryFilters {
  status?: string;
  dealerCodes?: string[];
  productLines?: string[];
  search?: string;
  /** รหัสดีลเลอร์ที่ชื่อ/รหัส match คำค้น — OR เข้ากับ id/customer (ให้ search ตรงกับ client ที่ค้นชื่อดีลเลอร์ได้) */
  searchDealers?: string[];
  dateStart?: string;
  dateEnd?: string;
  asOf?: string; // "วันนี้ของระบบ" (APP_NOW ISO) สำหรับคิดอายุใบ
}
/** สรุปลูกค้าเป้าหมาย "หลังกรอง" สำหรับ /hq/leads (M9 Phase 2) */
/** quoted = ราย (ไม่ใช่ใบ) ของรุ่นเดือนนั้นที่ไปถึงขั้นเสนอราคาแล้ว · won = ปิดการขายได้ = เป็นลูกค้าแล้ว */
export interface LeadMonthRow { y: number; m: number; created: number; won: number; lost: number; quoted: number; }
export interface LeadSummary {
  byStatus: { status: string; count: number; value: number }[];
  bySource: { source: string; count: number }[];
  byProduct: { product: string; count: number }[];
  byLostReason: { reason: string; count: number; value: number }[];
  /** จังหวัด (ลูกค้า) ที่มีลูกค้าเป้าหมาย — ป้อนตัวเลือกดรอปดาวน์ "จังหวัด" หน้า /hq/leads (M9 Phase 4) */
  byProvince: { province: string; count: number }[];
  byMonth: LeadMonthRow[];
  /** รายสาขา — leads=จำนวนลูกค้าเป้าหมาย · quoted=ถึงขั้นเสนอราคาขึ้นไป (QUOTED_UP)
   *  won=ปิดการขายได้แล้ว (เป็นลูกค้าแล้ว) · ป้อน leadVsQuote/dealerPerf */
  byDealer: { dealerCode: string; leads: number; quoted: number; won: number }[];
}
export interface LeadSummaryFilters {
  dealerCodes?: string[]; province?: string; product?: string; source?: string;
  search?: string; status?: string; dateStart?: string; dateEnd?: string;
}
/** สรุปลูกค้าทั้งเครือ — total (จำนวนลูกค้า) + ยอดขายรายจังหวัด · ป้อน KPI ลูกค้า + provinceTop6 (M9 Phase 4) */
export interface NetworkCustomerSummary {
  total: number;
  byProvince: { province: string; revenue: number; count: number }[];
}
/** ลูกค้าเป้าหมายไร้ผู้รับผิดชอบเกินเกณฑ์ (ชม.) รายสาขา — ป้อนการ์ดเตือน /hq/leads (M9 Phase 4) */
export interface UnassignedSummary {
  total: number;
  byDealer: { dealerCode: string; count: number }[];
}
export interface UnassignedFilters {
  asOf?: string; defaultHours?: number; perDealer?: Record<string, number>;
  dealerCodes?: string[]; province?: string; product?: string; source?: string;
  search?: string; dateStart?: string; dateEnd?: string;
}
/** ผู้สมัครของกฎแจ้งเตือน HQ (คำนวณที่ DB) — client ประกอบเป็นข้อความ + toggle (M9 Phase 4) */
export interface HQAlertsData {
  unassigned: { numId: number; dealerCode: string | null; company: string; province: string; value: string }[];
  idle: { numId: number; dealerCode: string | null; company: string; assigned: string; idleDays: number }[];
  expiring: { quoteNo: string; customer: string; value: number; dealerCode: string | null; daysLeft: number }[];
  dealerLatest: { dealerCode: string; idleDays: number }[];
  lostRate: { dealerCode: string; lost: number; closed: number }[];
}
export interface HQAlertsFilters {
  asOf?: string; unassignedDefaultHours?: number; unassignedPerDealer?: Record<string, number>;
  leadIdleDays?: number; quoteValidityDays?: number; quoteExpiringDays?: number; dealerIdleDays?: number;
}
// ── หน้าฐานข้อมูลลูกค้า HQ (M9 Phase 6) — filter+pagination+KPI/กราฟ ที่ DB (ดู migration 0080) ──
export interface HQCustomerPageRow {
  id: number; name: string; dealerCode: string; dealerName: string; province: string;
  totalValue: number; buildingTypes: string[]; templates: string[];
  // ⚠️ เคยมี deliveredAt (วันส่งมอบ) ตรงนี้ — ลบทั้งฟีเจอร์แล้ว (บอสสั่ง 20 ส.ค. 69)
  //    เพราะไม่มีที่กรอกวันส่งมอบจริงทั้งฝั่งดีลเลอร์และสำนักงานใหญ่ ตัวเลขที่โชว์คือ
  //    "วันปิดการขาย + 90 วัน" ซึ่งเป็นค่าที่ระบบคิดขึ้นเอง ไม่ใช่ข้อมูลจริงของงาน
  /** ISO date (ไม่ใช่ Thai string) — client format เองด้วย fmtISOToThai ตอนแสดงผล */
  lastPurchaseAt: string | null;
}
export interface HQCustomersPageOpts {
  search?: string; dealerCode?: string; provinces?: string[]; buildingType?: string;
  /** ตัวกรอง "ซื้อล่าสุด" (ISO date) — เทียบกับวันปิดการขายล่าสุดของลูกค้ารายนั้น
   *  ไม่ส่งมา = ไม่กรอง (ค่าเริ่มต้นของหน้า) · ส่งมา = ลูกค้าที่ยังไม่เคยมีใบปิดการขายจะไม่เข้าเกณฑ์ */
  boughtFrom?: string; boughtTo?: string;
  limit: number; offset: number;
}
/** active = ลูกค้าที่ "ยังซื้ออยู่" — มีการซื้อภายใน 12 เดือนล่าสุด (ใบ 0158)
 *  ไม่ใช่ "เคยซื้อแล้ว" ซึ่งเท่ากับ total เสมอ เพราะลูกค้าเกิดจากการปิดการขายทางเดียว */
export interface HQCustomersKPI { total: number; active: number; revenue: number; repeat: number; }
export interface HQCustomersCharts {
  byType: { label: string; value: number }[];
  bySubtype: { label: string; value: number }[];
  byProvince: { label: string; value: number }[];
  byDealer: { code: string; name: string; value: number }[];
  revenueByDealer: { code: string; revenue: number }[];
}
/** kpi/charts คำนวณจาก "ทั้งชุดที่กรองแล้ว" เสมอ (ไม่ใช่แค่ rows ของหน้าปัจจุบัน) — ตรงกับพฤติกรรมเดิมของหน้า */
export interface HQCustomersPageResult {
  total: number; kpi: HQCustomersKPI; charts: HQCustomersCharts; rows: HQCustomerPageRow[];
}
export interface HQCustomersFilterOptions {
  dealers: { code: string; name: string }[];
  provinces: string[];
  types: string[];
}
export interface MetricsRepo {
  /** rollup รายสาขาของปีที่ระบุ (key = dealerCode) — supabase: RPC dealer_rollup · local: คำนวณจาก array เอง
   *  scope คุมด้วย RLS ฝั่ง supabase (ดีลเลอร์=สาขาตน · HQ=ทั้งเครือ) เหมือนที่ client เคยเห็น */
  dealerRollup(year: number, opts?: DealerRollupOpts): Promise<Map<string, DealerRollup>>;
  /** สรุปลูกค้าเป้าหมายหลังกรอง (byStatus/bySource/byProduct/byLostReason/byMonth) — ป้อน analytics หน้า /hq/leads */
  leadSummary(filters: LeadSummaryFilters): Promise<LeadSummary>;
  /** สรุปใบหลังกรอง (byDealer/byMonth/byProduct/aging) — ป้อน analytics หน้า /hq/quotations (M9 Phase 2) */
  hqQuotationsSummary(filters: QuoteSummaryFilters): Promise<HQQuotationsSummary>;
  /** สถิติใบในช่วง [start,end] (ISO YYYY-MM-DD, inclusive) รายสาขา (key = dealerCode)
   *  dealer ระบุ = ดูดีลเลอร์รายตัว (selDealer) · ไม่ระบุ = ทั้ง scope · parity กับ winQuotes ฝั่ง client */
  networkQuoteRange(start: string, end: string, dealer?: string): Promise<Map<string, QuoteRangeRow>>;
  /** สรุปใบในช่วง (byMonth/byStatus/byProduct) รอบเดียว — ป้อนการ์ด dashboard หลายใบ (M9) */
  dashboardQuoteSummary(start: string, end: string, dealer?: string): Promise<DashboardQuoteSummary>;
  /** สรุปลูกค้าทั้งเครือ (total + byProvince) — ปลด dashboard ออกจาก netCustomers array (M9 Phase 4) */
  /** สรุปลูกค้าทั้งเครือ · กรองตามดีลเลอร์/ช่วงเวลาได้ (0155) — ไม่ส่งอะไร = ทั้งหมดเหมือนเดิม */
  networkCustomerSummary(f?: { dealerCode?: string; dateStart?: string; dateEnd?: string }): Promise<NetworkCustomerSummary>;
  /** ลูกค้าเป้าหมายไร้ผู้รับผิดชอบเกินเกณฑ์ (ชม.) รายสาขา — ปลดการ์ดเตือน /hq/leads ออกจาก netLeads array (M9 Phase 4) */
  unassignedLeads(filters: UnassignedFilters): Promise<UnassignedSummary>;
  /** ผู้สมัครกฎแจ้งเตือน HQ (unassigned/idle/expiring/dealerLatest/lostRate) — ปลดกระดิ่ง HQ ออกจาก array (M9 Phase 4) */
  hqAlerts(filters: HQAlertsFilters): Promise<HQAlertsData>;
  /** หน้าเดียวของฐานข้อมูลลูกค้า HQ + KPI/กราฟ 5 ตัวจากทั้งชุดที่กรองแล้ว — ปลด /hq/customers จากการดึงทั้งตาราง (M9 Phase 6) */
  hqCustomersPage(opts: HQCustomersPageOpts): Promise<HQCustomersPageResult>;
  /** ตัวเลือกตัวกรอง (ดีลเลอร์/จังหวัด/ประเภทอาคาร/ปีที่ส่งมอบ) ของหน้าฐานข้อมูลลูกค้า — ไม่อิงตัวกรองปัจจุบัน */
  hqCustomersFilterOptions(): Promise<HQCustomersFilterOptions>;
  /** ภาพรวม HQ 3 กล่องตาม FLOW (ด่าน 5 · ใบ 0209) — ตัวเลข ณ ตอนนี้ ไม่ขึ้นกับตัวกรอง · HQ เท่านั้น */
  hqOverview(): Promise<HqOverview>;
}

// ── โดเมนงานขาย — list (อ่าน) + CRUD เต็ม (Phase 0) ──
// write ทุกตัว implement ทั้ง LocalAdapter (localStorage) และ SupabaseAdapter (insert/update/delete)
// ฝั่ง Supabase: dealer_code ต้องตรงสาขา session (บังคับด้วย RLS with-check ที่ DB)
/** ตัวเลือกดึงลูกค้าเป้าหมายแบบ "แบ่งหน้า + กรอง ที่ DB" (M9 Phase 4) — ผู้เรียก resolve region→dealerCodes มาก่อน
 *  overdue (needsFollowUp) กรองที่ DB ด้วย last_contact_at + เกณฑ์รายสาขา (asOf/defaultDays/perDealer) */
export interface LeadListOpts {
  limit: number;
  offset: number;
  status?: string;
  dealerCodes?: string[];
  province?: string;
  product?: string;
  source?: string;             // "ไม่ระบุ" = source ว่าง
  search?: string;             // ilike company/contact/province/product/assigned/id/dealer_code
  dateStart?: string;
  dateEnd?: string;
  overdue?: boolean;           // เฉพาะลูกค้าเป้าหมายเปิดที่เงียบเกินเกณฑ์
  asOf?: string; defaultDays?: number; perDealer?: Record<string, number>;
  /** จำนวนรวมที่ผู้เรียก "รู้อยู่แล้ว" จากการนับครั้งก่อน (ตัวกรองชุดเดียวกัน)
   *  ส่งมา = ข้ามการนับยอดรวมที่ฐานข้อมูล แล้วคืนตัวเลขนี้กลับไปเลย
   *  ทำไม: วัดจริงที่ข้อมูล 20,000 แถว — การนับแบบเป๊ะกินเวลา ~2 วินาที ส่วนการอ่าน 20 แถวใช้ ~0.2 วินาที
   *  (ตัวกรองเท่าเดิม จำนวนรวมย่อมเท่าเดิม การนับซ้ำทุกครั้งที่กดเปลี่ยนหน้าจึงเป็นงานเปล่า) */
  knownTotal?: number;
}
export interface LeadListResult { rows: LeadRow[]; total: number; }
export interface LeadsRepo {
  /** รายการลูกค้าเป้าหมาย — ไม่รวมคอลัมน์หนักที่ใช้เฉพาะในแผงรายละเอียด (ดู get) */
  list(scope?: Scope): Promise<LeadRow[]>;
  /** ลูกค้าเป้าหมายรายเดียวแบบครบทุกคอลัมน์ — ใช้ตอนเปิดแผงรายละเอียด
   *  จำเป็นเพราะรายการ (list) ไม่ดึง report มาด้วย — คอลัมน์นั้นหนักแต่ใช้ที่เดียว
   *  คืน null เมื่อหาไม่เจอ (ถูกลบไปแล้ว/อยู่คนละสาขา) */
  get(id: string): Promise<LeadRow | null>;
  /** หน้าเดียวของลูกค้าเป้าหมาย + จำนวนรวมหลังกรอง (M9 Phase 4) — supabase: query ที่ DB · local: filter/sort/slice */
  listPage(scope: Scope | undefined, opts: LeadListOpts): Promise<LeadListResult>;
  /** เลข num_id ถัดไปของสาขาแบบ atomic (M7) — supabase: RPC next_entity_id · local: max+1
   *  id ที่แสดง (#L-....) แอป derive จาก num_id นี้ · เดิม Math.max+1 ฝั่ง client ชนกันได้ */
  nextNumId(dealerCode: string): Promise<number>;
  create(row: LeadRow): Promise<LeadRow>;
  /** บันทึกส่วนต่าง (ทางเดียวที่แก้ลูกค้าเป้าหมาย · ใบ 0211 lead_apply) — คืนแถวล่าสุดจากฐาน
   *  ⚠️ ไม่มี update ทั้งแถวแล้ว (15 ต.ค. 69): หน้าที่เปิดค้างเขียนทับงาน/ขั้นที่ฐานเพิ่งตั้ง · ดู lib/leadIntent.ts */
  apply(id: string, intent: LeadIntent): Promise<LeadRow>;
  remove(id: string): Promise<void>;
}
/** ตัวเลือกดึงใบแบบ "แบ่งหน้า + กรอง + เรียง ที่ DB" (M9 Phase 2) — ผู้เรียก resolve derived filter มาก่อน
 *  (region/province/ชื่อดีลเลอร์ → dealerCodes · product → productLines) เหลือแต่คอลัมน์จริงส่งให้ DB */
export interface QuoteListOpts {
  limit: number;
  offset: number;
  /** created_at = เวลาที่สร้างใบจริง (date ถูกตั้งใหม่ทุกครั้งที่กดส่ง ใช้เรียง "ใหม่ก่อน" ไม่ได้) */
  sort?: { col: "date" | "total_value" | "status" | "id" | "created_at"; dir: "asc" | "desc" };
  status?: string;              // สถานะเดียว (เว้น = ทุกสถานะ)
  dealerCodes?: string[];       // dealer_code in (...) — จาก dealer/region/province/ค้นหาชื่อ
  productLines?: string[];      // product_line in (...) — จาก product filter (รวม mainTemplate ที่ resolve แล้ว)
  search?: string;              // ilike บน id/customer
  searchDealers?: string[];     // รหัสดีลเลอร์ที่ชื่อ/รหัส match คำค้น — OR เข้ากับ search (ค้นชื่อดีลเลอร์)
  dateStart?: string;           // ISO YYYY-MM-DD (inclusive) บนคอลัมน์ date
  dateEnd?: string;
  /** จำนวนรวมที่ผู้เรียก "รู้อยู่แล้ว" จากการนับครั้งก่อน (ตัวกรองชุดเดียวกัน)
   *  ส่งมา = ข้ามการนับยอดรวมที่ฐานข้อมูล แล้วคืนตัวเลขนี้กลับไปเลย
   *  ทำไม: วัดจริงที่ข้อมูล 20,000 แถว — การนับแบบเป๊ะกินเวลา ~2 วินาที ส่วนการอ่าน 20 แถวใช้ ~0.2 วินาที
   *  (ตัวกรองเท่าเดิม จำนวนรวมย่อมเท่าเดิม การนับซ้ำทุกครั้งที่กดเปลี่ยนหน้าจึงเป็นงานเปล่า) */
  knownTotal?: number;
}
export interface QuoteListResult { rows: QuotationMock[]; total: number; }
export interface QuotationsRepo {
  list(scope?: Scope): Promise<QuotationMock[]>;
  /** หน้าเดียวของใบ + จำนวนรวมหลังกรอง (M9 Phase 2) — supabase: query ที่ DB · local: filter/sort/slice array */
  listPage(scope: Scope | undefined, opts: QuoteListOpts): Promise<QuoteListResult>;
  // ไม่มี create แบบเขียนตรง — ใบใหม่ต้องออกเลขผ่าน createNumbered และผูกใบ HQ (ลบทาง Flow เก่า 16 ต.ค. 69)
  update(row: QuotationMock): Promise<QuotationMock>;
  remove(id: string): Promise<void>;
  setStatus(id: string, status: QuotationMock["status"]): Promise<void>;
  /** เปลี่ยนสถานะใบ + รวมยอดลูกค้าใหม่ (ถ้าใบผูก customer_id อยู่แล้ว) ในทรานแซกชันเดียว (0102) —
   *  เดิมเรียก setStatus แล้วค่อย customers.reconcileWonTotal แยกกัน 2 คำขอ ภายใต้โหลดสูงพบว่า
   *  reconcile บางครั้งคำนวณได้ 0 ทั้งที่สถานะเปลี่ยนไปแล้วจริง (ช่องว่างจังหวะเวลาระหว่าง 2 คำขอ
   *  ไม่ใช่เน็ตสะดุดที่ withNetworkRetry จับได้) — รวมเป็นคำสั่งเดียวตัดช่องว่างนั้นทิ้ง
   *  ใช้แทน setStatus เฉพาะกรณีที่ status เดิม/ใหม่เกี่ยวข้องกับ "won" (ต้อง reconcile) */
  setStatusReconciled(id: string, status: QuotationMock["status"]): Promise<{ quotation: QuotationMock; customer: CustomerRow | null }>;
  /** ออกเลขที่ใบ + insert ใน "ทรานแซกชันเดียว" (atomic) — insert ล้ม = เลขไม่หาย (H8)
   *  รับ row ที่ "ยังไม่มี id" (DB เป็นคนออกเลขให้) · คืนใบที่บันทึกจริงพร้อมเลขที่
   *  supabase: RPC create_quotation (ออกเลข+insert รวด) · local: max+1 แล้ว insert (เธรดเดียว = atomic) */
  createNumbered(dealer: string, prefix: string | undefined, row: Omit<QuotationMock, "id">): Promise<QuotationMock>;
  /** ปิดใบที่ "ส่งแล้ว" และเลยวันหมดอายุ → สถานะ expired · asOf = วันนี้ของระบบ (YYYY-MM-DD) · คืนจำนวนใบที่ปิด */
  // validityDays: อายุใบเสนอราคาเริ่มต้น (นโยบาย HQ) — ใช้เป็น "หมดอายุ" ของใบที่ไม่ได้กรอก expiry เอง
  //   (นิยามเดียวกับที่ hq_alerts ใช้เตือน "ใกล้หมดอายุ" — ไม่งั้นสองจุดเห็นวันหมดอายุคนละวัน)
  expireOverdue(asOf: string, scope?: Scope, validityDays?: number): Promise<number>;
  /** ผู้รับผิดชอบใบ (จากลูกค้าเป้าหมายที่ผูก) รายใบ — ป้อน drawer โดยไม่ต้องโหลดลูกค้าเป้าหมายทั้งเครือ (M9 Phase 4) · ไม่พบ = null */
  salesperson(quoteId: string, dealerCode: string): Promise<string | null>;
  /** ใบที่ won ของลูกค้ารายเดียว (ผูกด้วย customer_id) — ป้อนแท็บอาคาร/ประวัติ/ส่งมอบ/ไทม์ไลน์ของ
   *  CustomerDrawer โดยไม่ต้องโหลดใบทั้งเครือ (M9 Phase 6) — เหมือน appointments.listForLead */
  listForCustomer(customerId: number, dealerCode: string): Promise<QuotationMock[]>;
  /** ผูกใบเสนอราคา "กำพร้า" (customer_id ว่าง, ชื่อลูกค้าตรงกัน) เข้ากับลูกค้าที่เพิ่งสร้าง/พบ ทั้งชุด
   *  ในคำสั่งเดียว (atomic) — cascadeWon=true จะเลื่อนสถานะใบที่ยังไม่ปิด (ไม่ใช่ lost/expired) เป็น won
   *  ด้วย (ปิดจากฝั่งลูกค้าเป้าหมายโดยตรง) · supabase: RPC relink_customer_quotes (Phase 4, กัน partial-relink
   *  ที่เดิมเป็น N คำขอ update แยกกัน) · local: วนอัปเดตในเครื่อง (เธรดเดียว = atomic โดยธรรมชาติ) */
  relinkCustomerQuotes(dealer: string, customerId: number, company: string, cascadeWon: boolean): Promise<QuotationMock[]>;
}
// ตัวเลือกดึงลูกค้าแบบ "แบ่งหน้า + กรอง ที่ DB" (M9 Phase 5) — เจาะจุดที่ดึงทั้งตารางแล้ว filter ฝั่ง client
// (dealer-detail drawer, useHQSearch) ยังไม่ครอบคลุมหน้า /hq/customers หลัก ซึ่งต้องใช้ทั้งชุดเพื่อทำ KPI/analytics/filter
export interface CustomerListOpts {
  limit: number;
  offset: number;
  dealerCodes?: string[];
  search?: string;              // ilike name/company/province/phone
}
export interface CustomerListResult { rows: CustomerRow[]; total: number; }
export interface CustomersRepo {
  list(scope?: Scope): Promise<CustomerRow[]>;
  /** หน้าเดียวของลูกค้า + จำนวนรวมหลังกรอง — supabase: query ที่ DB · local: filter/slice */
  listPage(scope: Scope | undefined, opts: CustomerListOpts): Promise<CustomerListResult>;
  // เลข id ถัดไปของสาขา — supabase: RPC atomic (กันชนเมื่อสร้างพร้อมกัน) · local: max+1
  nextId(dealerCode: string): Promise<number>;
  create(row: CustomerRow): Promise<CustomerRow>;
  update(row: CustomerRow): Promise<CustomerRow>;
  remove(id: number): Promise<void>;
  // หา "ลูกค้าเดิมที่ชื่อบริษัทตรงเป๊ะ" หรือสร้างใหม่ — ทรานแซกชันเดียวที่ DB (supabase) กันแข่งกัน
  // ปิดลูกค้าเป้าหมายชื่อเดียวกันพร้อมกัน 2 session สร้างลูกค้าซ้ำ · local: เช็ก+สร้างในเครื่อง (เครื่องเดียว ไม่มี race จริง)
  upsertForCompany(dealerCode: string, row: CustomerRow): Promise<CustomerRow>;
  // รวมยอดลูกค้าใหม่จากใบ won ปัจจุบันตรงจาก DB (ไม่รับผลรวมจาก client) — กัน race ตอนแก้ 2 ใบพร้อมกัน (0078)
  // supabase: subquery SUM ในสเตตเมนต์ UPDATE เดียว ที่ DB · local: คำนวณจากอาร์เรย์ในเครื่อง (ไม่มี race จริง)
  reconcileWonTotal(customerId: number): Promise<CustomerRow>;
  /** ปิดการขายสำเร็จแบบ atomic ทั้งก้อน (Phase 4, 0094) — หา/สร้างลูกค้า + relink ใบกำพร้าของบริษัทนี้
   *  (cascade เป็น won ด้วยถ้า cascadeWon) + บังคับใบเป้าหมายเป็น won (ถ้าระบุ targetQuoteId) + รวมยอดใหม่
   *  ในทรานแซกชันเดียว — แทนที่ upsertForCompany + relink แยก + setStatus แยก + reconcile แยก (4 คำสั่งเขียน
   *  เดิม เน็ตหลุดกลางทางได้) · supabase: RPC close_won_quotation · local: เรียงลำดับ await เดิม (เธรดเดียว) */
  closeWon(args: {
    dealer: string; knownCustomerId: number | null; leadCompany: string;
    targetQuoteId: string | null; cascadeWon: boolean; customerPayload: CustomerRow;
  }): Promise<{ customer: CustomerRow; quotations: QuotationMock[] }>;
  /** ลบลูกค้าพร้อมประวัติทั้งก้อนแบบ atomic (ระยะ 2, 0141) — ดีลที่จบแล้ว + ใบ + ไฟล์ ไปพร้อมกัน
   *  "ยังมีดีลที่ขายอยู่ = ลบไม่ได้" บังคับที่ฐานข้อมูล ไม่ใช่แค่ที่หน้าจอซึ่งข้ามได้
   *  เดิมเป็นคำสั่งลบแยกกันหลายคำสั่ง เน็ตหลุดกลางทาง = ประวัติลูกค้าหายไปครึ่งเดียว
   *  คืนพาธไฟล์ใน Storage ให้ผู้เรียกลบไบต์ตาม — ฐานข้อมูลลบข้ามระบบให้ไม่ได้ */
  deleteCascade(id: number): Promise<CustomerDeletionResult>;
}
/** ผลของการลบลูกค้าพร้อมประวัติ — จำนวนที่ลบจริง + ไบต์ที่ผู้เรียกต้องตามไปลบใน Storage */
export type CustomerDeletionResult = { quotations: number; leads: number; storagePaths: string[] };
export interface AppointmentsRepo {
  list(scope?: Scope): Promise<AppointmentMock[]>;
  /** นัดหมายของสาขาหนึ่ง (HQ เจาะดูดีลเลอร์) — ดึงเฉพาะที่ต้องใช้ ไม่ต้องโหลดทั้งเครือ (M9 Phase 4) */
  listForDealer(dealerCode: string): Promise<AppointmentMock[]>;
  /** นัดหมายของลูกค้าเป้าหมายหนึ่ง (drawer ดูลูกค้าเป้าหมาย) — ผูกด้วย lead_id = numId (M9 Phase 4) */
  listForLead(leadId: number, dealerCode: string): Promise<AppointmentMock[]>;
  nextId(dealerCode: string): Promise<number>;
  create(row: AppointmentMock): Promise<AppointmentMock>;
  update(row: AppointmentMock): Promise<AppointmentMock>;
  remove(id: number): Promise<void>;
}

// ── ไฟล์จริง (bytes) ใน Supabase Storage — bucket dealer-files/{dealerCode}/... ──
// โหมด local ไม่มี Storage → upload/signedUrl คืน null (เก็บแค่ metadata เหมือนเดิม · หน้าจอต้องรองรับ null)
export interface StoragePort {
  upload(dealerCode: string, file: File): Promise<string | null>; // คืน storagePath
  signedUrl(path: string): Promise<string | null>;                // ลิงก์ดาวน์โหลดชั่วคราว
  remove(path: string): Promise<void>;
}

// ── Realtime — ฟังการเปลี่ยนแปลงของตารางงานขายข้ามเครื่อง (supabase) ──
// โหมด local ไม่มี Realtime → subscribe คืนฟังก์ชันเปล่า (ยังใช้ event bus ของ localStorage เหมือนเดิม)
export type SalesTable = "leads" | "quotations" | "customers" | "appointments";

// การเปลี่ยนแปลงราย "แถว" — พก record มาด้วย เพื่อให้หน้าจอ patch เฉพาะแถวนั้น
// (เดิมส่งแค่ชื่อตาราง → ต้องโหลดทั้งตารางใหม่ทุก event ซึ่งไม่ไหวเมื่อข้อมูลเยอะ · H2)
// แถวที่ส่งมาถูก RLS กรองแล้ว = เห็นเฉพาะที่มีสิทธิ์เห็น
export type SalesChange =
  | { table: "leads";        type: "INSERT" | "UPDATE"; row: LeadRow }
  | { table: "quotations";   type: "INSERT" | "UPDATE"; row: QuotationMock }
  | { table: "customers";    type: "INSERT" | "UPDATE"; row: CustomerRow }
  | { table: "appointments"; type: "INSERT" | "UPDATE"; row: AppointmentMock }
  | { table: SalesTable;     type: "DELETE"; id: string | number };

export interface RealtimePort {
  /** เรียก onChange ทุกครั้งที่มีแถวเปลี่ยน (RLS กรองให้แล้ว) · คืนฟังก์ชัน unsubscribe */
  subscribeSales(onChange: (change: SalesChange) => void): () => void;
  /** นโยบาย/เป้า/กฎแจ้งเตือนของ HQ เปลี่ยน → ฝั่งดีลเลอร์ใช้ค่าใหม่ทันที (VAT/อายุใบมีผลกับการคิดเงิน) */
  subscribeSettings(onChange: () => void): () => void;
  /** โน้ตลูกค้าเปลี่ยน (เพิ่ม/แก้/ลบ จากอีกแท็บ/อีกเครื่อง) → โหลดโน้ตใหม่
   *  แยกช่องจาก subscribeSales เพราะโน้ตไม่ได้อยู่ในสี่ตารางงานขาย (0028 เปิด Realtime ให้แล้ว) */
  subscribeNotes(onChange: () => void): () => void;
  /** ตั้งค่าของสาขา (หัวกระดาษ/เอกสาร/โลโก้/แจ้งเตือน) เปลี่ยนจากอีกแท็บ/อีกเครื่อง → โหลดใหม่ (M4)
   *  0024 เปิด Realtime ให้ dealer_settings แล้ว · RLS กรองให้เห็นเฉพาะของสาขาตัวเอง */
  subscribeDealerSettings(onChange: () => void): () => void;
}

// ── รวมทุก repository เป็น adapter เดียว ──
export interface DataAdapter {
  storage: StoragePort;
  realtime: RealtimePort;
  dealers: DealersRepo;
  files: FilesRepo;
  persons: PersonsRepo;
  settings: SettingsRepo;
  dealerSettings: DealerSettingsRepo;
  profile: ProfileRepo;
  hqCompany: HQCompanyRepo;
  territories: TerritoriesRepo;
  quoteRequests: QuoteRequestsRepo;
  notes: NotesRepo;
  users: UsersRepo;
  audit: AuditRepo;
  account: AccountRepo;
  metrics: MetricsRepo;
  leads: LeadsRepo;
  quotations: QuotationsRepo;
  customers: CustomersRepo;
  appointments: AppointmentsRepo;
  prospects: ProspectsRepo;
  proposals: ProposalsRepo;
  prospectActivities: ProspectActivitiesRepo;
}
