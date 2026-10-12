"use client";

import {
  createContext, useContext, useState, useCallback, useMemo, useRef, useEffect,
  type ReactNode,
} from "react";
import { logRepoRead } from "@pms/shared/lib/repoLog";
import { friendlyError } from "@pms/shared/lib/friendlyError";
import { useRole } from "@pms/shared/context/RoleContext";
import {
  quotations as seedQuotations, initialCustomers, DEFAULT_ISSUER, QUOTE_PREFIX,
  type IssuerProfile,
  appointments as seedAppointments, buildLeadTasks, stageFromTasks, syncTasksToStage, findAppointmentTask,
  quotationToFile, AUTO_FILE_BY, fmtISOToThai, DEFAULT_DEALER_CODE, leadStatusLabel,
  type LeadRow,
  type CustomerRow, type QuotationMock, type QuotationStatus,
  type AppointmentMock, type DealerFile,
} from "@pms/shared/lib/mock";

import { parseBaht } from "@pms/shared/lib/format";
import { customerPayloadFromLead } from "@pms/shared/lib/leadToCustomer";
import { shouldCloseWon } from "@pms/shared/lib/closeWon";
import { ฉบับถัดไป } from "@pms/shared/lib/quoteRevision";
import { customerDeletionImpact, blockReason } from "@pms/shared/lib/customerDeletion";
import { APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { toThaiDate, ชั่วโมงนาทีไทย } from "@pms/shared/lib/thaiDate";
import { useQuoteValidityDays, useLeadTaskTemplate } from "@pms/shared/lib/useHQConfig";
import { dealerSettings as dealerSettingsRepo, leads as leadsRepo, customers as customersRepo, quotations as quotationsRepo, appointments as appointmentsRepo, files as filesRepo, storage as fileStorage, realtime } from "@pms/shared/lib/data";
import { REAL_BACKEND } from "@pms/shared/lib/data/config";

// โหมด backend — supabase: ลูกค้าเป้าหมายมาจาก DB (RLS แยกสาขา) · local: LocalAdapter (localStorage)
// "ของจริง" = supabase หรือ api (ไม่ใช่โหมดเดโม) — ดู REAL_BACKEND ใน data/config.ts
const USE_SUPABASE = REAL_BACKEND;

// ปิดใบหมดอายุ = คำสั่ง "เขียน" — ทำครั้งเดียวพอต่อสาขาต่อ session (M5)
// เดิมยิงทุกครั้งที่ mount/สลับสาขา → เขียนซ้ำโดยไม่จำเป็น (ยิ่งหลายแท็บยิ่งบ่อย)
const expiredThisSession = new Set<string>();

// ใบเสนอราคาเดิม (seed) = ออกภายใต้โปรไฟล์บริษัทตั้งต้น → ตรึงชื่อไว้ ไม่เปลี่ยนตามโปรไฟล์ที่แก้ทีหลัง
const seedQuotationsStamped: QuotationMock[] = seedQuotations.map(q =>
  q.issuer ? q : { ...q, issuer: { ...DEFAULT_ISSUER } }
);

// ── คีย์เก็บข้อมูลงานขายลง localStorage — กด F5 แล้วข้อมูลต้องไม่หาย ──────────────
// สำคัญ: ถ้าแก้ "ข้อมูลตั้งต้น" ใน mock.ts (เพิ่มฟิลด์/แก้ค่า) ต้องขึ้นเลขเวอร์ชันคีย์ด้วย
// ไม่งั้นเบราว์เซอร์ที่เคยเปิดจะอ่านของเก่าที่บันทึกไว้ทับตลอด แล้วมองไม่เห็นข้อมูลใหม่
// ─── Types ─────────────────────────────────────────────────────────
// โดเมนที่เขียนผ่าน repo — ใช้บอกว่าต้องดึงชุดไหนกลับมาทับเมื่อบันทึกล้มเหลว
export type SyncEntity = "leads" | "quotations" | "customers" | "appointments";

// ── กระดาน Pipeline/Deals ถูกยุบเข้ากับ "ลูกค้าเป้าหมาย" แล้ว ──────────────────
// เหตุผล: เดิมมีสองที่ที่บอกว่าดีลไปถึงไหน (deal.stageId/tasks กับ lead.status/tasks)
//         = ความจริงซ้ำซ้อน · และ deals เก็บแค่ใน localStorage เครื่องเดียว HQ ไม่เคยเห็น
// ตอนนี้ LeadRow เป็นแหล่งเดียว (status + tasks + activities + customerId)
export type SalesContextType = {
  // Leads (lifted state so both pages share it)
  leads: LeadRow[];
  updateLeadStatus: (leadId: string, status: LeadRow["status"]) => void;
  /** เลข num_id ถัดไปของสาขาแบบ atomic (M7) — id ที่แสดง (#L-…) derive จากค่านี้
   *  เดิมหน้าจอใช้ Math.max+1 ฝั่ง client → สร้างลูกค้าเป้าหมายพร้อมกันในสาขาเดียว num_id/id ชนกันได้ */
  newLeadNumId: () => Promise<number>;
  addLead: (lead: LeadRow) => void;
  updateLead: (lead: LeadRow) => void;
  deleteLead: (leadId: string) => void;

  // Customers (lifted — one shared list app-wide)
  customers: CustomerRow[];
  addCustomer: (customer: CustomerRow) => Promise<void>;
  updateCustomer: (customer: CustomerRow) => void;
  deleteCustomer: (id: number) => void;

  // Quotations (lifted — one shared list app-wide)
  quotations: QuotationMock[];
  /** โหลดรายการใบเสนอราคาเสร็จแล้วหรือยัง — "ยังไม่เสร็จ" ไม่เท่ากับ "ไม่มีใบ"
   *  ⚠️ ด่านที่ตัดสินจาก quotations.length ต้องเช็กค่านี้ก่อนเสมอ (เจอจริง 27 ส.ค. 69)
   *     โหมด api ข้อมูลเดินทางไกลกว่า ใบมาถึงช้ากว่าลูกค้าเป้าหมายเสมอ — กดปิดการขาย
   *     ระหว่างนั้นแล้วระบบตอบว่า "ต้องออกใบก่อน" ทั้งที่ใบมีอยู่จริง (แล้วไม่เกิดอะไรขึ้นเลย) */
  quotationsReady: boolean;
  /** รายการใบเสนอราคาที่ "โหลดเสร็จแน่นอนแล้ว" — โหลดเสร็จอยู่แล้วคืนทันที ยังไม่เสร็จก็รอให้เสร็จก่อน
   *  ใช้กับด่านที่ตัดสินใจจากจำนวนใบ (ปิดการขาย/เลื่อนขั้น) — ตัดสินจาก array ที่ยังโหลดไม่เสร็จ = ตัดสินผิด */
  ensureQuotations: () => Promise<QuotationMock[]>;
  /** สร้างใบใหม่ = ออกเลข + insert แบบ atomic (H8) · รับ draft ที่ยังไม่มี id · คืนใบที่บันทึกจริง */
  createQuotation: (draft: Omit<QuotationMock, "id">) => Promise<QuotationMock>;
  /** แก้ใบเสนอราคา · opts.แนบแม่แบบ = ผู้ใช้ยืนยันว่าส่งแม่แบบไปกับใบด้วย (ติ๊กงาน "ส่งแม่แบบให้ลูกค้า" ให้)
   *  ไม่ส่ง opts มา = ไม่ติ๊กงานนั้น — ห้ามเดาแทนผู้ใช้ว่าแนบไปหรือเปล่า */
  updateQuotation: (quotation: QuotationMock, opts?: { แนบแม่แบบ?: boolean }) => void;
  deleteQuotation: (id: string) => void;
  setQuotationStatus: (id: string, status: QuotationStatus) => void;
  /** เลขนัดหมายถัดไปของสาขา — ออกจาก DB แบบ atomic เหมือนเลขลูกค้า/เลขที่ใบ
   *  (เดิมหน้าปฏิทินใช้ Date.now() · หน้าลูกค้าเป้าหมายใช้ max+1 — คนละแบบและไม่กันชนจริง) */
  newAppointmentId: () => Promise<number>;



  // Appointments (lifted — ปฏิทิน/แดชบอร์ด/แจ้งเตือน ใช้ชุดเดียวกันสด)
  appointments: AppointmentMock[];
  addAppointment: (appt: AppointmentMock) => void;
  updateAppointment: (appt: AppointmentMock) => void;
  deleteAppointment: (id: number) => void;

  // Lead → Customer conversion (creates a REAL customer)
  convertLeadToCustomer: (lead: LeadRow, removeLead?: boolean, targetQuoteId?: string) => Promise<CustomerRow>;

  // สถานะการบันทึกล้มเหลว (C1) — หน้าจอกลาง (AppShell) เอาไปแสดงเตือนผู้ใช้
  syncError: string | null;
  clearSyncError: () => void;

  // สัญญาณ "ข้อมูลขายเปลี่ยน" (M9 Phase 4) — ตัวเลขเดียวที่ bump เมื่อโหลด/เขียน/realtime
  //   hook ที่รวมยอดที่ DB (RPC) ผูก refetch กับตัวนี้แทนการจับ array ตรง ๆ
  //   → ก้าวต่อไปตัดการโหลด array เต็มของ HQ ได้ โดย reactivity ไม่พัง (เปลี่ยนต้นทาง bump เป็น realtime)
  salesVersion: number;
};

const SalesContext = createContext<SalesContextType | null>(null);

export function SalesProvider({
  children,
  initialLeads,
}: {
  children: ReactNode;
  initialLeads: LeadRow[];
}) {
  // สาขาที่ล็อกอิน (multi-tenant) + auth พร้อมหรือยัง (hydrated) — โหลดลูกค้าเป้าหมายตามขอบเขตสาขา
  const { dealerCode, isHQ, hydrated, isLoggedIn } = useRole();
  const myDealerCode = dealerCode || DEFAULT_DEALER_CODE;
  // อายุใบเสนอราคา (นโยบาย HQ) — ใบที่ไม่ได้กรอก expiry เอง ใช้ค่านี้คำนวณวันหมดอายุ (0067)
  const quoteValidityDays = useQuoteValidityDays();
  // งานมาตรฐานรายขั้นที่ HQ ตั้งไว้ — ตัวขับการเลื่อนขั้นของลูกค้าเป้าหมาย (HQ แก้ได้ที่ /hq/settings › เส้นทางการขาย)
  // ต้องอ่านผ่าน hook: ค่าตั้งต้นในโค้ดใช้ได้แค่ตอนยังโหลดไม่เสร็จ ไม่ใช่ของจริงที่ HQ ตั้ง
  const taskTpl = useLeadTaskTemplate();
  const taskTplRef = useRef(taskTpl);
  useEffect(() => { taskTplRef.current = taskTpl; }, [taskTpl]);
  // ── M9 Phase 4 (unload) — HQ ในโหมด supabase ไม่โหลด array งานขายทั้งเครืออีกต่อไป ──
  // ทุก surface ของ HQ อ่านผ่าน RPC/รายการแบ่งหน้าที่ DB แล้ว (dashboard/quotations/leads/pipeline/
  //   customers/dealers-detail/กระดิ่งแจ้งเตือน/ค้นหา) → ไม่ต้องถือ leads/quotations/customers/appointments
  //   ของทั้ง 10 สาขาไว้ในหน่วยความจำ · reactivity มาจาก realtime → bump salesVersion (hook RPC refetch)
  // ดีลเลอร์ (ไม่ใช่ HQ) และโหมด local ยังโหลดตามเดิม (ต้องใช้ array ทำ CRUD หน้าดีลเลอร์)
  const gateHQ = USE_SUPABASE && isHQ;
  // ── ยังไม่ได้ล็อกอิน = ห้ามยิงคำขอข้อมูลใด ๆ ────────────────────────────────
  //
  // ⚠️ hydrated แปลว่า "ฟื้น session เสร็จแล้ว" ซึ่งเป็นจริงแม้ผลลัพธ์คือ "ไม่มี session"
  //    ค่าเริ่มต้นของ session คือสาขาเดโม (CNX) ตอนอยู่หน้าเข้าสู่ระบบจึงยิงคำขอ
  //    ในนามสาขา CNX ออกไปจริง ๆ ทั้งที่ยังไม่มีใครล็อกอิน
  //    โหมด supabase มองไม่เห็นเพราะฐานข้อมูลปฏิเสธเงียบ ๆ แต่โหมด api ตอบ 401 ให้เห็นชัด
  //    (เจอจริง 18 ส.ค. 69: หน้าเข้าสู่ระบบยิง leads/customers/quotations?dealer=CNX แล้วได้ 401 ยกชุด)
  //    โหมด local ไม่มีการล็อกอินจริง จึงต้องโหลดตามปกติ
  const ready = hydrated && !(USE_SUPABASE && !isLoggedIn);

  // ── Leads (Phase 1) — โหลดผ่าน repository (async) + เขียนทะลุถึง repo ──
  // supabase: RLS ที่ DB คืนเฉพาะลูกค้าเป้าหมายสาขาตัวเอง (HQ = ทั้งเครือ) · local: LocalAdapter กรอง + เก็บ localStorage
  // seed แรก: local ใช้ initialLeads ทันที (ไม่มี network) · supabase เริ่มว่างแล้วเติมเมื่อโหลดเสร็จ (กัน flash ข้ามสาขา)
  const [leads, setLeads] = useState<LeadRow[]>(USE_SUPABASE ? [] : initialLeads);
  // ref อ่านค่า leads ล่าสุดใน callback โดยไม่พึ่ง closure (ใช้ใน updateLeadStatus / completeLeadQuoteTasks)
  const leadsRef = useRef(leads);
  // โหลดลูกค้าเป้าหมายเสร็จแล้วหรือยัง + คำขอโหลดรอบล่าสุด — ใช้โดย ensureLeads (ดูเหตุผลที่ ensureQuotations)
  const leadsReadyRef = useRef(!USE_SUPABASE);
  const leadsLoadRef = useRef<Promise<LeadRow[]> | null>(null);
  useEffect(() => { leadsRef.current = leads; }, [leads]);

  // ── กัน "ผลการโหลดที่มาช้า" ทับสิ่งที่ผู้ใช้เพิ่งทำ (พบจากทดสอบโหลด 10 สาขา · 6 ส.ค. 69) ──
  //
  // อาการจริงที่จับได้: เปิดหน้าลูกค้าแล้วรีบกด "เพิ่มลูกค้า" ก่อนรายการโหลดเสร็จ → แถวที่เพิ่งเพิ่ม
  //   หายไปจากหน้าจอทั้งที่บันทึกลง DB สำเร็จแล้ว และไม่มีข้อความเตือนอะไรเลย (ตารางว่าง 0 แถว)
  // สาเหตุ: list() ที่ยิงตอนเปิดหน้าได้ภาพ ณ ตอนนั้น (ยังไม่มีลูกค้ารายนี้) แต่ resolve ทีหลัง
  //   แล้ว setLeads/setCustomers(rows) ทับทั้งอาร์เรย์ — ลบทั้งแถวที่ใส่แบบ optimistic และแถวที่
  //   realtime เพิ่งเติมเข้ามาทิ้ง · ผู้ใช้ต้องรีเฟรชเองถึงจะเห็น
  // วิธีแก้: นับจำนวน "การเขียนจากฝั่งเรา" ถ้าตัวเลขขยับระหว่างที่รอ list() = ภาพนั้นเก่ากว่าหน้าจอ
  //   → ทิ้งแล้วโหลดใหม่ (ไม่เกิน 3 รอบ)
  // ⚠️ ไม่ใช้วิธี "รวมอาร์เรย์เก่ากับใหม่" เพราะตอนสลับสาขา (login คนละบัญชี) จะกลายเป็นข้อมูล
  //   สาขาเก่าค้างอยู่ = ข้อมูลข้ามสาขา ซึ่งเป็นบั๊กที่ร้ายแรงกว่ามาก (ดู branch-isolation.spec.ts)
  const writeSeq = useRef(0);
  const bumpWrite = useCallback(() => { writeSeq.current += 1; }, []);
  const loadFresh = useCallback(async <T,>(
    load: () => Promise<T>, apply: (rows: T) => void, alive: () => boolean, label: string,
  ) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const seq = writeSeq.current;
      let rows: T;
      try { rows = await load(); } catch (e) { if (alive()) logRepoRead(label, e); return; }
      if (!alive()) return;
      // รอบสุดท้ายรับไว้เลย — ยอมเสี่ยงทับดีกว่าปล่อยให้หน้าจอไม่มีข้อมูลตั้งต้นเลย
      // (แถวที่หายจะถูก realtime เติมกลับให้อยู่แล้ว เพราะ INSERT event ตามมาทีหลังการเขียน)
      if (writeSeq.current === seq || attempt === 2) { apply(rows); return; }
    }
  }, []);

  // โหลดลูกค้าเป้าหมายเมื่อ auth พร้อม + รีโหลดเมื่อสลับสาขา (login คนละบัญชี) — scope ส่งให้ repo (RLS ฝั่ง supabase)
  useEffect(() => {
    if (!ready || gateHQ) return; // HQ/supabase: ไม่โหลดลูกค้าเป้าหมายทั้งเครือ (อ่านผ่าน RPC แทน)
    let alive = true;
    const กำลังโหลดลีด = leadsRepo.list({ dealerCode, isHQ });
    leadsLoadRef.current = กำลังโหลดลีด;
    void loadFresh(() => กำลังโหลดลีด, rows => { setLeads(rows); leadsReadyRef.current = true; }, () => alive, "leads.list");
    return () => { alive = false; };
  }, [ready, dealerCode, isHQ, gateHQ, loadFresh]);

  // ── การบันทึกล้มเหลว ต้อง "ดัง" เสมอ (C1) ────────────────────────────────
  // เดิม: .catch(console.error) → RLS ปฏิเสธ/เน็ตหลุด แล้วผู้ใช้ยังเห็นข้อมูลบนจอเหมือนบันทึกสำเร็จ
  // ตอนนี้: แจ้งผู้ใช้ + ดึงของจริงจาก repo มาทับ เพื่อไม่ให้จอค้างอยู่กับค่าที่ไม่ได้ถูกบันทึก
  const [syncError, setSyncError] = useState<string | null>(null);

  // M9 Phase 4: สัญญาณข้อมูลขายเปลี่ยน — ตอนนี้ derive จากอาร์เรย์ (bump เมื่อโหลด/เขียน/realtime เปลี่ยน array)
  //   พฤติกรรมเท่าเดิมกับที่ hook เคยจับ [leads,quotations] · เฟสถัดไปเปลี่ยนต้นทาง bump เป็น realtime ตรง
  //   (effect ที่ bump อยู่หลังประกาศ array ทั้ง 4 — กัน TDZ)
  const [salesVersion, setSalesVersion] = useState(0);
  // late-bind: ตัวรายงานถูกประกอบหลัง state ทุกตัวถูกประกาศ (ดู useEffect ด้านล่าง)
  const failRef = useRef<(entity: SyncEntity, op: string, e: unknown) => void>(() => {});
  const onFail = (entity: SyncEntity, op: string) => (e: unknown) => failRef.current(entity, op, e);

  // เขียนทะลุถึง repo — optimistic: อัปเดต UI ก่อน แล้ว persist เบื้องหลัง
  // bumpWrite() ทุกครั้ง = บอก loadFresh ว่า "หน้าจอใหม่กว่าภาพที่กำลังโหลดอยู่แล้ว อย่าเอามาทับ"
  // ── คำสั่งเขียน "ลูกค้าเป้าหมายแถวเดียวกัน" ต้องเรียงคิว ห้ามยิงคาบเกี่ยว (บั๊กจริง 28 ส.ค. 69) ──
  //
  // อาการ: ดีลเลอร์กดส่งใบเสนอราคา แล้วบรรทัด "ส่งใบเสนอราคา … ให้ลูกค้า พร้อมแม่แบบ" หายจากไทม์ไลน์
  //   (ยิงพิสูจน์แล้ว: 3 วินาทีหลังกดส่ง ในฐานข้อมูลมีแต่ "ออกใบเสนอราคา" — ส่วนงานที่ติ๊กให้ครบ)
  //
  // สาเหตุ: การกดส่งหนึ่งครั้งเขียนแถวลูกค้าเป้าหมาย "สองคำสั่ง" ติด ๆ กัน
  //   1) ติ๊กงาน (ส่งใบ/ส่งแม่แบบ) + เลื่อนขั้น — ยังไม่มีบรรทัดกิจกรรมใหม่
  //   2) ต่อบรรทัดกิจกรรมลงไทม์ไลน์ — มีทั้งงานที่ติ๊กและบรรทัดใหม่ (ครอบข้อ 1 ทั้งหมด)
  //   ทั้งคู่เขียน "ทั้งแถว" แบบไม่รอกัน · คำสั่งไหนถึงฐานข้อมูลทีหลังก็ทับ — ถ้าเป็นข้อ 1
  //   บรรทัดกิจกรรมหายเงียบ ๆ (ผู้ใช้ไม่มีทางรู้ว่าร่องรอยหาย) และหายถาวร เพราะการเขียนครั้งถัดไป
  //   ประกอบจากแถวที่ไม่มีบรรทัดนั้นแล้ว
  //
  // แก้ที่นี่จุดเดียวแทนการไล่แก้ทุกผู้เรียก: ต่อคิวตาม id ของแถว → คำสั่งหลังเริ่มเมื่อคำสั่งก่อนจบ
  //   ผู้เรียกประกอบแถวจาก leadsRef ที่อัปเดตทันทีอยู่แล้ว คำสั่งหลังจึงเป็น "ของครบกว่า" เสมอ
  //   (คิวรายแถว ไม่ใช่คิวรวม — คนละลูกค้าเป้าหมายยังเขียนพร้อมกันได้เหมือนเดิม ไม่ช้าลง)
  const leadWrites = useRef(new Map<string, Promise<unknown>>()).current;
  const เข้าคิวเขียนลีด = (id: string, ทำ: () => Promise<unknown>): void => {
    const ก่อนหน้า = leadWrites.get(id) ?? Promise.resolve();
    // .catch ก่อน then — คำสั่งก่อนล้มเหลวต้องไม่ทำให้คำสั่งถัดไปไม่ได้ยิง (ตัวมันเองรายงาน error เองแล้ว)
    const คิวนี้ = ก่อนหน้า.catch(() => {}).then(ทำ);
    leadWrites.set(id, คิวนี้);
    void คิวนี้.finally(() => { if (leadWrites.get(id) === คิวนี้) leadWrites.delete(id); });
  };
  const persistLead = useRef({
    create: (l: LeadRow) => { bumpWrite(); เข้าคิวเขียนลีด(l.id, () => leadsRepo.create(l).catch(onFail("leads", "สร้างลูกค้าเป้าหมาย"))); },
    update: (l: LeadRow) => { bumpWrite(); เข้าคิวเขียนลีด(l.id, () => leadsRepo.update(l).catch(onFail("leads", "แก้ไขลูกค้าเป้าหมาย"))); },
    remove: (id: string) => { bumpWrite(); เข้าคิวเขียนลีด(id, () => leadsRepo.remove(id).catch(onFail("leads", "ลบลูกค้าเป้าหมาย"))); },
  }).current;
  // ── Customers (Phase 2) — โหลดผ่าน repository (async) + เขียนทะลุถึง repo ──
  // supabase: RLS แยกสาขา (HQ = ทั้งเครือ) · local: LocalAdapter กรอง + เก็บ localStorage
  // Lead→Won: แอปเป็นแหล่งเดียวที่สร้างลูกค้า (convertLeadToCustomer) — ข้อมูลครบ · id จริงจากตัวนับ DB
  //           trigger on_quote_won ที่ DB ถูกลบใน 0033 (เดิมสร้างลูกค้า id=0 ไร้ชื่อ + นับยอดซ้ำ · C6)
  const [customers, setCustomers]   = useState<CustomerRow[]>(USE_SUPABASE ? [] : initialCustomers);
  useEffect(() => {
    if (!ready || gateHQ) return; // HQ/supabase: ลูกค้าทั้งเครืออ่านผ่าน repo ที่หน้า /hq/customers เอง
    let alive = true;
    void loadFresh(() => customersRepo.list({ dealerCode, isHQ }), setCustomers, () => alive, "customers.list");
    return () => { alive = false; };
  }, [ready, dealerCode, isHQ, gateHQ, loadFresh]);
  const persistCustomer = useRef({
    create: (c: CustomerRow) => { bumpWrite(); void customersRepo.create(c).catch(onFail("customers", "สร้างลูกค้า")); },
    update: (c: CustomerRow) => { bumpWrite(); void customersRepo.update(c).catch(onFail("customers", "แก้ไขลูกค้า")); },
    remove: (id: number) => { bumpWrite(); void customersRepo.remove(id).catch(onFail("customers", "ลบลูกค้า")); },
  }).current;
  // ── Quotations (Phase 3) — โหลดผ่าน repository (async) + เขียนทะลุถึง repo ──
  // supabase: RLS แยกสาขา · setStatus→won ให้แอปสร้างลูกค้าเอง (ดู setQuotationStatus · trigger ถูกลบ 0033)
  const [quotations, setQuotations] = useState<QuotationMock[]>(USE_SUPABASE ? [] : seedQuotationsStamped);
  // โหมด local มีข้อมูลตั้งต้นอยู่ในเครื่องแล้ว = พร้อมทันที · โหมดของจริงต้องรอโหลดก่อน
  const [quotationsReady, setQuotationsReady] = useState(!USE_SUPABASE);
  const quotationsReadyRef = useRef(quotationsReady);
  useEffect(() => { quotationsReadyRef.current = quotationsReady; }, [quotationsReady]);
  // คำขอโหลดรอบล่าสุด — ให้ ensureQuotations รอใบชุดเดียวกับที่หน้าจอกำลังรออยู่ ไม่ยิงซ้ำ
  const quotationsLoadRef = useRef<Promise<QuotationMock[]> | null>(null);
  const ensureLeads = useCallback(async (): Promise<LeadRow[]> => {
    if (leadsReadyRef.current) return leadsRef.current;
    const p = leadsLoadRef.current;
    if (p) { try { return await p; } catch { /* ใช้เท่าที่มี */ } }
    return leadsRef.current;
  }, []);
  const ensureQuotations = useCallback(async (): Promise<QuotationMock[]> => {
    if (quotationsReadyRef.current) return quotationsRef.current;
    const p = quotationsLoadRef.current;
    if (p) { try { return await p; } catch { /* ใช้เท่าที่มี */ } }
    return quotationsRef.current;
  }, []);
  const quotationsRef = useRef(quotations);
  useEffect(() => { quotationsRef.current = quotations; }, [quotations]);
  useEffect(() => {
    if (!ready || gateHQ) return; // HQ/supabase: ใบทั้งเครืออ่านผ่าน RPC (summary/listPage) แทน array
    let alive = true;
    // ปิดใบที่เลยวันหมดอายุก่อนโหลด (H5) — ใช้ "วันนี้ของระบบ" (APP_NOW) ให้ตรงกับที่หน้าจอแสดง
    // ดีลเลอร์เท่านั้นที่ปิดได้ (RLS) · HQ ข้ามไป เพราะเขียนงานขายไม่ได้อยู่แล้ว
    //
    // ⚠️ ต้องเช็ก isLoggedIn ด้วย ไม่ใช่แค่ hydrated
    //    hydrated = "ฟื้น session เสร็จแล้ว" ซึ่งเป็น true แม้ผลลัพธ์คือ "ไม่มี session"
    //    AuthGuard ก็ยังเรนเดอร์ลูกไว้ (แค่ซ่อนด้วย CSS) → หน้า login จึงยิง RPC ตัวนี้
    //    ในสถานะยังไม่ล็อกอินทุกครั้ง = สั่ง "เขียน" โดยไม่มีตัวตน
    //    เดิมผ่านเงียบ ๆ เพราะ RLS ทำให้แก้ 0 แถว · พอปิดสิทธิ์ anon (0031) จึงโผล่เป็น 401
    const scope = { dealerCode, isHQ };
    // ปิดใบหมดอายุครั้งเดียวพอต่อสาขาต่อ session (M5) — HQ/ยังไม่ล็อกอิน ไม่ต้องทำ
    const skipExpire = isHQ || !isLoggedIn || expiredThisSession.has(myDealerCode);
    if (!skipExpire) expiredThisSession.add(myDealerCode);
    const prepare = skipExpire
      ? Promise.resolve(0)
      : quotationsRepo.expireOverdue(APP_NOW_ISO, scope, quoteValidityDays).catch(() => { expiredThisSession.delete(myDealerCode); return 0; });
    const กำลังโหลด = prepare.then(() => quotationsRepo.list(scope));
    quotationsLoadRef.current = กำลังโหลด;
    void loadFresh(
      () => กำลังโหลด,
      rows => { setQuotations(rows); setQuotationsReady(true); }, () => alive, "quotations.list",
    );
    return () => { alive = false; };
  }, [ready, dealerCode, myDealerCode, isHQ, isLoggedIn, gateHQ, quoteValidityDays, loadFresh]);
  const persistQuote = useRef({
    create: (q: QuotationMock) => { bumpWrite(); void quotationsRepo.create(q).catch(onFail("quotations", "สร้างใบเสนอราคา")); },
    update: (q: QuotationMock) => { bumpWrite(); return quotationsRepo.update(q).catch(onFail("quotations", "แก้ไขใบเสนอราคา")); },
    remove: (id: string) => { bumpWrite(); void quotationsRepo.remove(id).catch(onFail("quotations", "ลบใบเสนอราคา")); },
    setStatus: (id: string, status: QuotationStatus) => { bumpWrite(); void quotationsRepo.setStatus(id, status).catch(onFail("quotations", "เปลี่ยนสถานะใบเสนอราคา")); },
  }).current;
  // auto-link ไฟล์ใบเสนอราคา (metadata) ผ่าน repository — แทน syncAddQuotationFile/Remove เดิม (Phase 6)
  const fileScopeRef = useRef({ dealerCode, isHQ, myDealerCode });
  fileScopeRef.current = { dealerCode, isHQ, myDealerCode };
  // เงียบโดยตั้งใจทั้งสองเมธอด: เป็นงานเบื้องหลังผูก "ไฟล์ใบเสนอราคา" ให้อัตโนมัติ ไม่ใช่ข้อมูลที่ผู้ใช้
  // กำลังรออ่านบนจอ — ล้มเหลวแล้วแค่ไม่มีไฟล์อัตโนมัติ (แนบเองได้) ไม่ควรเด้งแถบเตือนกวนตอนกดบันทึกสำเร็จ
  const syncQuoteFile = useRef({
    add: (q: QuotationMock) => {
      const s = fileScopeRef.current;
      filesRepo.list({ dealerCode: s.dealerCode, isHQ: s.isHQ }).then(files => {
        if (files.some(f => f.category === "ใบเสนอราคา" && f.name.includes(q.id))) return; // กันซ้ำ
        void filesRepo.add({ ...quotationToFile(q), dealerCode: q.dealerCode ?? s.myDealerCode });
      }).catch(() => {});
    },
    remove: (id: string) => {
      const s = fileScopeRef.current;
      filesRepo.list({ dealerCode: s.dealerCode, isHQ: s.isHQ }).then(files => {
        const f = files.find(x => x.category === "ใบเสนอราคา" && x.name.includes(id) && x.uploadedBy === AUTO_FILE_BY);
        if (f) void filesRepo.remove(f.id); // ลบเฉพาะไฟล์ที่ระบบสร้างเอง
      }).catch(() => {});
    },
  }).current;
  // ── Appointments (Phase 4) — โหลดผ่าน repository (async) + เขียนทะลุถึง repo ──
  // supabase: RLS แยกสาขา · local: LocalAdapter กรอง + เก็บ localStorage
  const [appointments, setAppointments] = useState<AppointmentMock[]>(USE_SUPABASE ? [] : seedAppointments);
  useEffect(() => {
    if (!ready || gateHQ) return; // HQ/supabase: นัดหมายดึงเฉพาะที่ต้องใช้ (per-lead/per-dealer) ที่หน้า
    let alive = true;
    void loadFresh(() => appointmentsRepo.list({ dealerCode, isHQ }), setAppointments, () => alive, "appointments.list");
    return () => { alive = false; };
  }, [ready, dealerCode, isHQ, gateHQ, loadFresh]);
  // bump สัญญาณเมื่อข้อมูลขายชุดใดเปลี่ยน (โหลด/เขียน/realtime) — hook RPC ผูก refetch กับ salesVersion
  useEffect(() => { setSalesVersion(v => v + 1); }, [leads, quotations, customers, appointments]);
  const persistAppt = useRef({
    create: (a: AppointmentMock) => { bumpWrite(); void appointmentsRepo.create(a).catch(onFail("appointments", "สร้างนัดหมาย")); },
    update: (a: AppointmentMock) => { bumpWrite(); void appointmentsRepo.update(a).catch(onFail("appointments", "แก้ไขนัดหมาย")); },
    remove: (id: number) => { bumpWrite(); void appointmentsRepo.remove(id).catch(onFail("appointments", "ลบนัดหมาย")); },
  }).current;

  // ประกอบตัวรายงานความล้มเหลว (C1) — ทำหลัง state ครบทุกตัวแล้วจึงรู้จัก setter ทั้งหมด
  // หน้าที่: แจ้งผู้ใช้ + ดึงชุดข้อมูลจริงจาก repo มาทับ (ยกเลิก optimistic ที่ไม่ได้ถูกบันทึก)
  useEffect(() => {
    failRef.current = (entity, op, e) => {
      console.error(`[${entity}] ${op}`, e);
      setSyncError(`บันทึกไม่สำเร็จ: ${op} — ${friendlyError(e)}`);
      const scope = { dealerCode, isHQ };
      // เงียบโดยตั้งใจ: บรรทัดบนแจ้งผู้ใช้ไปแล้ว (setSyncError) — การดึงข้อมูลกลับมาทับตรงนี้เป็นแค่
      // ความพยายามกู้สภาพ ถ้าแจ้งซ้ำจะได้ข้อความเตือน 2 อันจากความผิดพลาดครั้งเดียว
      if (entity === "leads") leadsRepo.list(scope).then(setLeads).catch(() => {});
      else if (entity === "quotations") quotationsRepo.list(scope).then(setQuotations).catch(() => {});
      else if (entity === "customers") customersRepo.list(scope).then(setCustomers).catch(() => {});
      else appointmentsRepo.list(scope).then(setAppointments).catch(() => {});
    };
  }, [dealerCode, isHQ]);

  // ── ตาข่ายกันหน้าจอค้าง: ซิงก์ซ้ำเป็นระยะ ไม่ฝากความถูกต้องไว้กับ realtime อย่างเดียว ──
  //
  // พบจากการรันชุดทดสอบเต็ม (6 ส.ค. 69): การเชื่อมต่อ realtime "เปิดอยู่" และสมัครรับข้อมูลตอบ "ok"
  //   ครบทุกช่อง แต่เซิร์ฟเวอร์ไม่ส่งสัญญาณข้อมูลใหม่มาเลยสักรายการ (นับได้ 0)
  //   ผลคือหน้า HQ ค้างที่ "ลูกค้าทั้งเครือ 13 ราย" ขณะฐานข้อมูลมี 16 ราย และค้างแบบนั้นต่อไปเรื่อย ๆ
  //   จนกว่าผู้ใช้จะกดรีเฟรช/เปลี่ยนหน้าเอง — ผู้ใช้ไม่มีทางรู้เลยว่าตัวเลขที่เห็นไม่ใช่ของจริง
  //
  // เกิดจริงได้หลายกรณีนอกห้องทดสอบ: เน็ตสะดุด · หลับเครื่องแล้วเปิดใหม่ · เปลี่ยน wifi/มือถือ ·
  //   ผู้ให้บริการจำกัดปริมาณสัญญาณช่วงงานหนัก · ไฟร์วอลล์องค์กรตัด websocket ทิ้งเงียบ ๆ
  //
  // จึงเพิ่ม 3 จังหวะ "ขอข้อมูลใหม่": กลับมาที่แท็บนี้ · เน็ตกลับมา · และทุก 30 วินาทีระหว่างเปิดหน้าอยู่
  //   (ทำเฉพาะตอนแท็บถูกมองเห็น — แท็บที่ซ่อนอยู่ไม่ต้องยิงให้เปลืองทั้งเครื่องและเซิร์ฟเวอร์)
  const resyncAll = useCallback(() => {
    if (!ready) return;
    if (gateHQ) { setSalesVersion(v => v + 1); return; } // HQ อ่านผ่าน RPC — แค่บอกให้ไปดึงใหม่
    const scope = { dealerCode, isHQ };
    // ⚠️ ตาข่ายนี้พังเงียบไม่ได้ — มันคือด่านสุดท้ายที่กัน "หน้าจอค้างข้อมูลเก่าโดยไม่มีใครรู้"
    //   ถ้าตัวมันเองล้มเหลวแล้วเรากลืน error ทิ้ง ผู้ใช้จะเห็นตัวเลขเก่าต่อไปเรื่อย ๆ
    //   โดยไม่มีสัญญาณอะไรเลยแม้แต่ใน log — ซึ่งเป็นสถานการณ์ที่ตาข่ายนี้ถูกสร้างมาเพื่อกัน
    //   logRepoRead ข้ามคำขอที่ถูกยกเลิก/ยังไม่มี session ให้แล้ว จึงไม่ส่งเสียงตอนสลับหน้า
    leadsRepo.list(scope).then(setLeads).catch(e => logRepoRead("resync.leads", e));
    customersRepo.list(scope).then(setCustomers).catch(e => logRepoRead("resync.customers", e));
    quotationsRepo.list(scope).then(setQuotations).catch(e => logRepoRead("resync.quotations", e));
    appointmentsRepo.list(scope).then(setAppointments).catch(e => logRepoRead("resync.appointments", e));
  }, [ready, gateHQ, dealerCode, isHQ]);

  useEffect(() => {
    if (!ready || typeof document === "undefined") return;
    const tick = () => { if (document.visibilityState === "visible") resyncAll(); };
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [ready, resyncAll]);

  // ── Realtime — มีคนแก้ข้อมูลจากเครื่องอื่น → อัปเดตเฉพาะแถวนั้น ──
  // supabase: postgres_changes (RLS กรอง event ตามสาขาให้แล้ว) · local: no-op (ยังใช้ event bus เดิม)
  useEffect(() => {
    if (!ready) return;
    // patch เฉพาะแถวที่เปลี่ยน (H2) — เดิมโหลดทั้งตารางใหม่ทุก event ซึ่งไม่ไหวเมื่อข้อมูลเยอะ
    // แถวที่ได้มาถูก RLS กรองแล้ว (เห็นเฉพาะที่มีสิทธิ์) จึงนำมาใส่ได้เลย
    const upsert = <T extends { id: string | number }>(list: T[], row: T): T[] => {
      const i = list.findIndex(x => x.id === row.id);
      return i >= 0 ? list.map((x, j) => (j === i ? row : x)) : [row, ...list];
    };
    return realtime.subscribeSales((ch) => {
      // HQ/supabase (gate): ไม่ถือ array แล้ว → มีอะไรเปลี่ยนทั้งเครือ ก็แค่ bump ให้ hook RPC refetch
      if (gateHQ) { setSalesVersion(v => v + 1); return; }
      if (ch.type === "DELETE") {
        if (ch.table === "leads") setLeads(prev => prev.filter(l => l.id !== ch.id));
        else if (ch.table === "quotations") setQuotations(prev => prev.filter(q => q.id !== ch.id));
        else if (ch.table === "customers") setCustomers(prev => prev.filter(c => c.id !== ch.id));
        else setAppointments(prev => prev.filter(a => a.id !== ch.id));
        return;
      }
      if (ch.table === "leads") setLeads(prev => upsert(prev, ch.row));
      else if (ch.table === "quotations") setQuotations(prev => upsert(prev, ch.row));
      else if (ch.table === "customers") setCustomers(prev => upsert(prev, ch.row));
      else setAppointments(prev => upsert(prev, ch.row));
    });
  }, [ready, dealerCode, isHQ, gateHQ]);
  // ── Lead → Customer conversion (creates a REAL customer) ─────────
  // removeLead = true → "เปลี่ยนลูกค้าเป้าหมายเป็นลูกค้า" (ลบออกจากรายการลูกค้าเป้าหมาย) · false → แค่ผูกลูกค้าให้ลูกค้าเป้าหมาย (คงลูกค้าเป้าหมายไว้ เช่นตอนสร้างใบเสนอราคา)
  // targetQuoteId → ใบที่ต้องบังคับเป็น won เสมอ (เส้นทางจากหน้าใบเสนอราคา "ลูกค้าตอบรับ" ใบเดียว)
  //   ไม่ใส่ = ไม่มีใบเป้าหมายเดี่ยว พึ่ง cascade (lead.status==="PAID") อย่างเดียว (เส้นทางจากลิ้นชักลูกค้าเป้าหมาย)
  // async เพราะทั้งก้อน (หา/สร้างลูกค้า + relink ใบ + บังคับใบเป้าหมาย + รวมยอด) เป็น RPC เดียว atomic
  // ที่ DB (Phase 4, 0094/0095) — แทนที่ upsertForCompany + relink แยก + setStatus แยก + reconcile แยก
  // เดิม 4 คำสั่งเขียนคนละรอบ เน็ตหลุดกลางทางได้ (ประวัติพังจริงมาแล้ว 3 รอบ: 0069→0070→0071)
  const convertLeadToCustomer = useCallback(async (lead: LeadRow, removeLead = false, targetQuoteId?: string): Promise<CustomerRow> => {
    const ownerDealer = lead.dealerCode ?? myDealerCode;
    // ใช้ lead.status==="PAID" เป็นสัญญาณ cascade — caller ฝั่งลูกค้าเป้าหมาย (updateLead/updateLeadStatus) ตั้ง
    // status=PAID ไว้ใน lead object ก่อนเรียกอยู่แล้ว · caller ฝั่งใบเสนอราคายังไม่แตะ lead.status
    // (จึง cascadeWon=false แต่ target quote ยังถูกบังคับ won ผ่าน targetQuoteId แยกต่างหาก)
    const cascadeWon = lead.status === "PAID";
    // payload ใช้เฉพาะตอนต้องสร้างลูกค้าใหม่จริง (RPC ไม่แตะข้อมูลเดิมเลยถ้าเจอ known id/ชื่อตรง)
    // สร้างจากตัวแปลงกลาง — ทุกช่องที่ลูกค้าเป้าหมายกรอกไว้ต้องไหลมาครบ (ดู leadToCustomer.ts)
    const payload = customerPayloadFromLead(lead, { joinDate: APP_NOW_ISO, defaultDealerCode: DEFAULT_DEALER_CODE });
    let result: { customer: CustomerRow; quotations: QuotationMock[] };
    try {
      result = await customersRepo.closeWon({
        dealer: ownerDealer, knownCustomerId: lead.customerId ?? null, leadCompany: lead.company,
        targetQuoteId: targetQuoteId ?? null, cascadeWon, customerPayload: payload,
      });
    } catch (e) {
      onFail("customers", "ปิดการขาย")(e);
      throw e; // ให้ผู้เรียกรู้ว่าล้มเหลว — เส้นทางปิดการขาย (won) จะได้ไม่หลงคิดว่าสำเร็จ
    }
    const saved = result.customer;
    bumpWrite(); // เส้นทางนี้เขียนผ่าน RPC ไม่ผ่าน persist* — ต้องบอก loadFresh เองว่าหน้าจอใหม่กว่าแล้ว
    setCustomers(prev => prev.some(c => c.id === saved.id) ? prev.map(c => c.id === saved.id ? saved : c) : [...prev, saved]);
    const relinkedById = new Map(result.quotations.map(q => [q.id, q]));
    setQuotations(prev => prev.map(q => relinkedById.get(q.id) ?? q));
    if (removeLead) {
      // ปิดการขาย/แปลงเป็นลูกค้า → ลูกค้าเป้าหมายกลายเป็นลูกค้าเต็มตัว จึงเอาออกจากรายการลูกค้าเป้าหมาย
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      persistLead.remove(lead.id);
    } else {
      // แค่ผูกลูกค้าให้ลูกค้าเป้าหมาย (ยังเป็นลูกค้าเป้าหมายอยู่)
      setLeads(prev => prev.map(l => l.id !== lead.id ? l : { ...l, customerId: saved.id }));
      persistLead.update({ ...lead, customerId: saved.id });
    }
    return saved;
  }, [myDealerCode, persistLead, bumpWrite]);

  // ── Lead mutations ───────────────────────────────────────────────
  const updateLeadStatus = useCallback((leadId: string, status: LeadRow["status"]) => {
    // สร้างลูกค้าเฉพาะตอนปิดการขายสำเร็จ (WON) — ตัดสินใจนอก updater กัน StrictMode เรียกซ้ำใน dev
    const lead = leadsRef.current.find(l => l.id === leadId);
    if (!lead) return;
    // ย้ายสถานะ → ติ๊กงานใน Checklist ให้ถึงสเตจนั้นอัตโนมัติ (ผู้ทำ = ผู้รับผิดชอบของลูกค้าเป้าหมาย)
    const updated: LeadRow = { ...lead, status, tasks: syncTasksToStage(lead.tasks, status, lead.assigned || "—", taskTplRef.current) };
    setLeads(prev => prev.map(l => l.id !== leadId ? l : updated));
    persistLead.update(updated); // สถานะ + tasks เปลี่ยน → update ทั้งแถว (แทน setStatus)
    if (shouldCloseWon(status)) {
      setTimeout(() => { void convertLeadToCustomer({ ...lead, status }, false).catch(() => { /* onFail แจ้งแล้ว */ }); }, 0);
    }
  }, [convertLeadToCustomer, persistLead]);

  const addLead = useCallback((lead: LeadRow) => {
    // ติด dealerCode ของสาขาที่ล็อกอิน (multi-tenant) — ลูกค้าเป้าหมายใหม่เป็นของสาขานั้น (RLS with-check ฝั่ง supabase)
    const tagged: LeadRow = { ...lead, dealerCode: lead.dealerCode ?? myDealerCode };
    setLeads(prev => [tagged, ...prev]);
    persistLead.create(tagged);
  }, [myDealerCode, persistLead]);

  // ── บันทึกกิจกรรมลงไทม์ไลน์ของลูกค้าเป้าหมาย (บอสสั่ง 21 ส.ค. 69) ────────────────
  //
  // "ทำอะไรกับดีลไว้บ้าง" ต้องอ่านย้อนได้จากที่เดียว — เดิมไทม์ไลน์ว่างเปล่าเสมอ
  //   เพราะไม่มีใครเขียนลงไปเลย หน้าจอจึงต้อง "เดา" ไทม์ไลน์จากงานที่ติ๊กไว้แทน
  //   ผลคือการกระทำที่ไม่ใช่การติ๊กงาน (ออกใบ/แก้ใบ/ส่งใบ/ปิดการขาย) หายไปจากประวัติทั้งหมด
  //
  // ⚠️ ต่อท้ายเสมอ (เก่าอยู่บน ใหม่อยู่ล่าง) ให้ตรงกับลำดับที่หน้าจอแสดง
  // ⚠️ best-effort: บันทึกไม่ลงต้องไม่ทำให้การกระทำหลักล้ม (ออกใบสำเร็จแล้วแต่จดประวัติไม่ได้ = ยังดีกว่าออกใบไม่ได้)
  const logLeadActivity = useCallback((dealId: number | undefined, text: string, type = "task") => {
    const เวลาตอนนี้ = () => ชั่วโมงนาทีไทย();
    if (dealId == null) return;
    const lead = leadsRef.current.find(l => l.numId === dealId);
    if (!lead) return;
    const เดิม = lead.activities ?? [];
    const next: LeadRow = {
      ...lead,
      activities: [...เดิม, {
        id: (เดิม.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0) || 0) + 1,
        // ⚠️ ต้องเป็นวันที่แบบไทย ("21 ส.ค. 2569") ให้ตรงกับที่ทั้งระบบอ่าน —
        //    ตัวคำนวณ "ติดต่อล่าสุด/ค้างติดต่อกี่วัน" อ่านวันจากไทม์ไลน์ด้วยตัวแปลงแบบไทยเท่านั้น
        //    ถ้าเขียนเป็น 2026-08-21 มันจะอ่านไม่ออกแล้วมองว่าดีลนี้ "ไม่เคยติดต่อเลย" เงียบ ๆ
        // เวลาต่อท้ายด้วย " · HH:MM" (บอสสั่ง 21 ส.ค. 69: ต้องรู้ว่าทำอะไร วันไหน เวลาเท่าไร)
        //    ตัวแปลงวันไทยอ่านเฉพาะส่วนหน้า จึงต่อเวลาไว้ท้ายได้โดยไม่กระทบการคำนวณวัน
        date: `${toThaiDate(new Date(APP_NOW_ISO))} · ${เวลาตอนนี้()}`, icon: type, text, type,
      }],
    };
    // ⚠️ ต้องอัปเดต leadsRef ทันทีด้วย ไม่ใช่รอ re-render (บั๊กจริง 21 ส.ค. 69)
    //    ref จะตามทันก็ต่อเมื่อ React เรนเดอร์รอบใหม่ — แต่ในจังหวะเดียวกันนี้ยังมีตัวเขียนอื่น
    //    (ติ๊กงานอัตโนมัติ) ที่อ่าน leadsRef ไปประกอบ "ทั้งแถว" แล้วเขียนทับลงฐานข้อมูล
    //    ถ้า ref ยังเป็นภาพเก่า กิจกรรมที่เพิ่งบันทึกจะถูกทับหายไปเงียบ ๆ (เขียนทีหลังชนะ)
    leadsRef.current = leadsRef.current.map(l => l.id !== next.id ? l : next);
    setLeads(prev => prev.map(l => l.id !== next.id ? l : next));
    persistLead.update(next);
  }, [persistLead]);

  const updateLead = useCallback((lead: LeadRow) => {
    // ── ทุกการกระทำกับดีลต้องขึ้นไทม์ไลน์ (บอสสั่ง 21 ส.ค. 69) ─────────────────────
    //   เทียบกับของเดิมในหน่วยความจำ แล้วจดเฉพาะ "สิ่งที่เพิ่งเปลี่ยนจริง"
    //   ⚠️ ต้องต่อกิจกรรมเข้าไปใน "แถวเดียวกัน" ที่กำลังจะเขียน ไม่ใช่เขียนแยกอีกรอบ
    //      เขียนแยก = สองคำสั่งชนกัน แล้วอันหลังทับอันแรกหาย (บั๊กจริง 21 ส.ค. 69)
    const ก่อน = leadsRef.current.find(l => l.id === lead.id);
    const เพิ่ม: { id: number; date: string; icon: string; text: string; type: string }[] = [];
    const เวลา = () => `${toThaiDate(new Date(APP_NOW_ISO))} · ${ชั่วโมงนาทีไทย()}`;
    if (ก่อน) {
      const เดิมทำแล้ว = new Set((ก่อน.tasks ?? []).filter(t => t.done).map(t => t.key));
      for (const t of lead.tasks ?? []) {
        if (t.done && !เดิมทำแล้ว.has(t.key)) เพิ่ม.push({ id: 0, date: เวลา(), icon: "task", text: `ทำงาน: ${t.label}`, type: "task" });
      }
      if (ก่อน.status !== lead.status) {
        เพิ่ม.push({ id: 0, date: เวลา(), icon: "task", text: `เปลี่ยนขั้นเป็น "${leadStatusLabel[lead.status]}"`, type: "task" });
      }
      if ((ก่อน.assigned ?? "") !== (lead.assigned ?? "") && lead.assigned) {
        เพิ่ม.push({ id: 0, date: เวลา(), icon: "note", text: `เปลี่ยนผู้รับผิดชอบเป็น ${lead.assigned}`, type: "note" });
      }
    }
    if (เพิ่ม.length) {
      const เดิม = lead.activities ?? ก่อน?.activities ?? [];
      let next = เดิม.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0);
      lead = { ...lead, activities: [...เดิม, ...เพิ่ม.map(a => ({ ...a, id: ++next }))] };
    }
    leadsRef.current = leadsRef.current.map(l => l.id !== lead.id ? l : lead);
    setLeads(prev => prev.map(l => l.id !== lead.id ? l : lead));
    persistLead.update(lead);
    // ปิดการขายสำเร็จ → เดินเส้นทางปิดการขายเสมอ (สร้างลูกค้าถ้ายังไม่มี · ปิดใบเสนอราคา · รวมยอดใหม่)
    if (shouldCloseWon(lead.status)) {
      setTimeout(() => { void convertLeadToCustomer(lead, false).catch(() => { /* onFail แจ้งแล้ว */ }); }, 0);
    }
  }, [convertLeadToCustomer, persistLead]);

  // เก็บกวาดไฟล์ที่ผูกกับเรคคอร์ดที่ถูกลบ (metadata + ไบต์ใน Storage) — กันไฟล์กำพร้า (A2.1)
  //   files.record_id เป็น polymorphic (ลูกค้าเป้าหมาย/ลูกค้า) ผูก FK/cascade ที่ DB ไม่ได้ จึงเก็บที่ชั้นแอป
  //   best-effort: ล้มเหลว = แค่เหลือไฟล์กำพร้าเหมือนเดิม (ไม่บล็อกการลบเรคคอร์ด)
  const cleanupFilesFor = useCallback(async (match: (f: DealerFile) => boolean) => {
    const s = fileScopeRef.current;
    try {
      const all = await filesRepo.list({ dealerCode: s.dealerCode, isHQ: s.isHQ });
      await Promise.all(all.filter(match).map(async (f) => {
        try {
          if (f.storagePath) await fileStorage.remove(f.storagePath); // ลบไบต์ก่อน (เหมือนหน้าไฟล์)
          await filesRepo.remove(f.id);
        } catch (e) { console.warn("[cleanupFiles] ลบไฟล์กำพร้าไม่สำเร็จ", e); }
      }));
    } catch (e) { console.warn("[cleanupFiles] อ่านรายการไฟล์ไม่สำเร็จ", e); }
  }, []);

  // ลบลูกค้าเป้าหมาย — ต้องไม่ทิ้งใบเสนอราคาที่ผูกอยู่ให้ลอยไม่มีลูกค้าเป้าหมายแม่ (เหตุผลเดียวกับ deleteCustomer ด้านล่าง
  // พบจากผลตรวจสอบตรรกะระบบ 31 ก.ค. 69: เดิมลบได้เลยแม้มีใบเสนอราคาผูก dealId ไว้อยู่)
  const deleteLead = useCallback((leadId: string) => {
    const lead = leadsRef.current.find(l => l.id === leadId);
    const linkedQuotes = lead?.numId != null ? quotationsRef.current.filter(q => q.dealId === lead.numId).length : 0;
    if (linkedQuotes) {
      setSyncError(`ลบลูกค้าเป้าหมายไม่ได้ — ยังมีใบเสนอราคา ${linkedQuotes} ใบผูกอยู่ · กรุณาย้าย/ลบใบเหล่านั้นก่อน`);
      return;
    }
    setLeads(prev => prev.filter(l => l.id !== leadId));
    persistLead.remove(leadId);
    // ลบไฟล์ที่แนบกับลูกค้าเป้าหมายนี้ (source=lead · record_id = numId ของลูกค้าเป้าหมาย)
    if (lead?.numId != null) void cleanupFilesFor(f => f.source === "lead" && f.recordId === lead.numId);
  }, [persistLead, cleanupFilesFor]);

  // ── Customer mutations (Phase 2) — เขียนทะลุถึง repo ──────────────
  const addCustomer = useCallback(async (customer: CustomerRow) => {
    // ติด dealerCode ของสาขาที่ล็อกอิน (multi-tenant) — ลูกค้าใหม่เป็นของสาขานั้น (RLS with-check ฝั่ง supabase)
    const dealer = customer.dealerCode ?? myDealerCode;
    // ออก id จาก counter อะตอมมิกของ DB (เหมือน Lead→Won) — ห้ามใช้ Math.max ฝั่งจอ (H1)
    //   Math.max+1 จะชนกับ next_entity_id ที่ counter ไม่เคยอ่านตารางซ้ำ → Lead→Won ครั้งถัดไป insert ชน PK → ปิดการขายพัง
    //   id ที่ติดมากับ row (ถ้ามี) ใช้แค่ seed สี — ตัวจริงมาจาก counter
    const id = await customersRepo.nextId(dealer);
    const tagged: CustomerRow = { ...customer, id, dealerCode: dealer };
    setCustomers(prev => [...prev, tagged]);
    persistCustomer.create(tagged);
  }, [myDealerCode, persistCustomer]);

  const updateCustomer = useCallback((customer: CustomerRow) => {
    setCustomers(prev => prev.map(c => c.id !== customer.id ? c : customer));
    persistCustomer.update(customer);
  }, [persistCustomer]);

  // ตัวชี้ไปยัง deleteQuotation ตัวจริง (ประกาศอยู่ท้ายไฟล์) — deleteCustomer ต้องใช้ก่อนถึงบรรทัดนั้น

  // ลบลูกค้า — ต้องไม่ทิ้ง "ข้อมูลกำพร้า" ไว้ (H1)
  // DB ยังผูก FK ระหว่างใบเสนอราคา/ลูกค้าเป้าหมาย กับลูกค้าไม่ได้ (customerId ใช้ 0 แทน "ยังไม่มีลูกค้า")
  // จึงต้องกันที่ชั้นแอป
  //
  // ⚠️ เดิมกันแบบเหมารวม "มีลูกค้าเป้าหมายผูกอยู่ = ลบไม่ได้" ซึ่งกลายเป็นทางตันที่ออกไม่ได้เลย:
  //   ดีลที่ปิดการขายแล้วก็ถูกนับด้วย แต่หน้าลูกค้าเป้าหมายตั้งใจซ่อนดีลที่ปิดแล้วไว้
  //   ระบบจึงสั่งให้ไปลบของที่มันไม่ยอมให้เห็น → ลูกค้าที่ปิดการขายแล้วลบไม่ได้ตลอดกาล
  //   (ผู้ใช้แจ้ง 14 ส.ค. 69 · ดู customerDeletion.ts สำหรับกติกาเต็ม)
  // ── ระยะ 2: กติกาและการลบทั้งก้อน ย้ายไปอยู่ที่ฐานข้อมูลแล้ว (RPC delete_customer_cascade, 0141) ──
  //   เดิมที่นี่สั่งลบทีละอย่าง (ใบ → ดีล → ลูกค้า) เป็นคนละคำสั่งกัน — เน็ตหลุดกลางทาง
  //   = ประวัติลูกค้าหายไปครึ่งเดียว ย้อนกลับไม่ได้ · และกติกา "ยังมีดีลที่ขายอยู่ = ลบไม่ได้"
  //   อยู่แค่ในหน้าเว็บ ซึ่งคนที่ล็อกอินแล้วสั่งงานเข้าฐานข้อมูลตรง ๆ ข้ามได้
  //
  //   ที่ยังคำนวณฝั่งนี้: ข้อความบอกเหตุผล/กล่องยืนยัน (เพื่อให้ผู้ใช้รู้ทันทีว่าจะเกิดอะไร)
  //   แต่ "คนตัดสิน" คือฐานข้อมูล — ถ้าข้อมูลเปลี่ยนระหว่างนั้น ฐานข้อมูลจะปฏิเสธเอง
  const deleteCustomer = useCallback((id: number) => {
    const impact = customerDeletionImpact(id, leadsRef.current, quotationsRef.current);
    if (!impact.canDelete) { setSyncError(blockReason(impact)); return; }

    void (async () => {
      let gone: { storagePaths: string[] };
      try {
        gone = await customersRepo.deleteCascade(id);
      } catch (e) {
        onFail("customers", "ลบลูกค้า")(e);
        return;
      }
      // ลบสำเร็จที่ฐานข้อมูลแล้ว — ค่อยเอาออกจากหน้าจอ (ไม่ใช่เอาออกก่อนแล้วค่อยลุ้น)
      const goneQuoteIds = new Set(impact.quotations.map(q => q.id));
      setQuotations(prev => prev.filter(q => !goneQuoteIds.has(q.id)));
      setLeads(prev => prev.filter(l => l.customerId !== id));
      setCustomers(prev => prev.filter(c => c.id !== id));
      bumpWrite();
      // ไบต์ใน Storage เป็นคนละระบบกับฐานข้อมูล ลบพร้อมกันในทรานแซกชันเดียวไม่ได้
      // ทำตามหลัง best-effort — ล้มเหลวก็แค่เหลือไบต์ที่ไม่มีใครอ้างถึง ไม่ใช่ข้อมูลเสียหาย
      await Promise.all(gone.storagePaths.map(p =>
        fileStorage.remove(p).catch(e => console.warn("[deleteCustomer] ลบไบต์ไฟล์ไม่สำเร็จ", p, e))));
    })();
  }, [bumpWrite]);

  // ── Quotation → เช็กงานของลูกค้าเป้าหมายอัตโนมัติ ─────────────────────────────
  // สร้างใบเสนอราคา = ติ๊ก "จัดทำใบเสนอราคา" · ส่งใบเสนอราคา = ติ๊ก "ส่งใบเสนอราคา"
  // งาน "ส่งแม่แบบให้ลูกค้า" ติ๊กเฉพาะตอนที่ผู้ใช้ยืนยันในกล่องถามว่าแนบแม่แบบไปด้วย (บอสสั่ง 21 ส.ค. 69)
  //   ⚠️ ห้ามติ๊กให้เองโดยไม่ถาม — เซลส์อาจตั้งใจส่งเฉพาะใบ ไม่ส่งสเปกสินค้าให้ลูกค้า
  // แล้วเลื่อนสถานะลูกค้าเป้าหมายตาม stageFromTasks (เลื่อนขึ้นเท่านั้น ไม่ดึงถอยหลัง)
  const completeLeadQuoteTasks = useCallback((quotation: QuotationMock, keys: string[]) => {
    const RANK: Partial<Record<LeadRow["status"], number>> = { WAITING: 0, BULLET: 1, QUOTED: 2, FOLLOWUP: 3, NEGO: 4 };
    // คิดจาก leadsRef (ค่าล่าสุด) แทน updater เพื่อเก็บ "ลูกค้าเป้าหมายที่เปลี่ยน" ไป persist ทีละแถวได้
    const changedLeads: LeadRow[] = [];
    const nextList = leadsRef.current.map(l => {
      // กันเขียนข้ามสาขา: repo คืนเฉพาะลูกค้าเป้าหมายสาขาที่ล็อกอินอยู่แล้ว แต่กันไว้อีกชั้น (ลูกค้าเป้าหมายไม่ระบุ dealerCode = CNX)
      // ไม่งั้น match ด้วย company ชื่อซ้ำ/พิมพ์เอง จะเลื่อนสถานะ+ประทับผู้ทำทับลูกค้าเป้าหมายของสาขาอื่น
      // (คู่แฝดฝั่งเขียนของบั๊กรั่วข้ามสาขา — ดู branch-isolation.spec.ts) · แตะเฉพาะลูกค้าเป้าหมายของสาขาที่ล็อกอิน
      if ((l.dealerCode ?? DEFAULT_DEALER_CODE) !== myDealerCode) return l;
      const match = (quotation.customerId != null && quotation.customerId !== 0 && l.customerId === quotation.customerId)
        || l.company === quotation.customer;
      if (!match || l.status === "PAID" || l.status === "CANCELLED") return l;
      let changed = false;
      const base = l.tasks && l.tasks.length ? l.tasks : buildLeadTasks(taskTplRef.current);
      const tasks = base.map(t => {
        if (keys.includes(t.key) && !t.done) {
          changed = true;
          // ผู้ทำงาน = ผู้รับผิดชอบของลูกค้าเป้าหมาย (ไม่ใช่ "ระบบ"/ดีลเลอร์) · วันปิดงาน = วันนี้ของระบบ (supabase=จริง)
          return { ...t, done: true, doneAt: fmtISOToThai(APP_NOW_ISO), doneBy: l.assigned || "อัปเดตอัตโนมัติ" };
        }
        return t;
      });
      if (!changed) return l;
      const next = stageFromTasks(tasks, taskTplRef.current);
      const status = (RANK[next] ?? 0) > (RANK[l.status] ?? 0) ? next : l.status;
      const nl: LeadRow = { ...l, tasks, status };
      changedLeads.push(nl);
      return nl;
    });
    if (changedLeads.length) {
      // อัปเดต ref ทันทีด้วยเหตุผลเดียวกับ logLeadActivity — ตัวเขียนถัดไปในจังหวะเดียวกัน
      // ต้องเห็นงานที่เพิ่งติ๊ก ไม่งั้นมันจะเขียนทับด้วยภาพเก่า
      leadsRef.current = nextList;
      setLeads(nextList);
      changedLeads.forEach(l => persistLead.update(l));
    }
  }, [myDealerCode, persistLead]);

  // ── รวมยอดลูกค้า (reconcile) = Σ ใบที่ won ของลูกค้ารายนั้น จาก DB สดตรง ๆ แล้วอัปเดตจอ (H2) ──
  //   เรียกเฉพาะตอนที่มี "ใบที่ won" เข้ามาเกี่ยว (won ใหม่ / ลบใบ won / แก้ใบ won / ย้อน won ออก)
  //   ⚠️ เดิมคำนวณจาก quotationsRef.current (snapshot ฝั่ง client) แล้ว UPDATE ทับตรง ๆ — 2 แท็บแก้ 2 ใบ
  //   ของลูกค้าเดียวกันพร้อมกัน แต่ละแท็บเห็น snapshot คนละเวอร์ชัน (อีกฝั่งยังไม่ sync มา) ผลรวมที่คำนวณ
  //   จึงขาดใบของอีกฝั่งไป ใครเขียนทีหลังก็ทับด้วยยอดที่ขาด — พบจริงจากผลตรวจสอบระบบ 30 ก.ค. 69 (Medium)
  //   ย้ายไปคำนวณที่ DB แทน (RPC reconcile_customer_won_total, 0078) เหมือน upsert_customer_for_company —
  //   ผู้เรียก "ต้อง" await การเปลี่ยนสถานะใบให้ commit จริงก่อนเรียกฟังก์ชันนี้ ไม่งั้น RPC จะยังไม่เห็นใบล่าสุด
  const reconcileCustomerTotal = useCallback(async (cid: number | undefined): Promise<void> => {
    if (!(cid && cid > 0)) return;
    const cust = await customersRepo.reconcileWonTotal(cid);
    bumpWrite(); // เขียนผ่าน RPC — กันผลโหลดเก่าทับยอดที่เพิ่งรวมใหม่
    setCustomers(prev => prev.map(c => c.id === cid ? cust : c));
  }, [bumpWrite]);

  // ── Quotation mutations ──────────────────────────────────────────
  // สร้างใบใหม่ = ออกเลข + insert แบบ atomic (H8) — รับ draft ที่ "ยังไม่มี id" · DB เป็นคนออกเลข
  // เดิมแยกเป็น newQuoteId() แล้ว addQuotation(withId) → insert ล้มหลังออกเลข = เลขหาย
  // ตอนนี้เดินผ่าน createNumbered ทางเดียว: await ให้บันทึกจริงก่อน แล้วค่อยอัปเดตจอ (ไม่ optimistic แต่ถูกต้อง)
  const createQuotation = useCallback(async (draft: Omit<QuotationMock, "id">): Promise<QuotationMock> => {
    // สแนปช็อตโปรไฟล์บริษัท ณ ตอนสร้าง + ติด dealerCode สาขาที่ล็อกอิน (multi-tenant)
    const base = { ...draft, issuer: draft.issuer ?? issuerRef.current, dealerCode: draft.dealerCode ?? myDealerCode };
    const created = await quotationsRepo.createNumbered(myDealerCode, QUOTE_PREFIX, base);
    bumpWrite(); // ออกเลขใบผ่าน RPC ไม่ผ่าน persist* — กันผลโหลดเก่าทับใบที่เพิ่งสร้าง
    setQuotations(prev => [created, ...prev]);
    // สร้างใบ → จัดทำใบเสนอราคา (ถ้าสร้างเป็นสถานะส่งแล้วขึ้นไป ให้ติ๊กส่งด้วย)
    completeLeadQuoteTasks(created, created.status === "draft" ? ["makeQuote"] : ["makeQuote", "sendQuote"]);
      logLeadActivity(created.dealId, `ออกใบเสนอราคา ${created.id} (${created.revision ?? "V1"}) · ยอด ${created.total}`, "doc");
    syncQuoteFile.add(created); // auto-link → ไฟล์ (หมวดใบเสนอราคา) ผูกกับลูกค้าเป้าหมาย/ลูกค้า
    return created;
  }, [completeLeadQuoteTasks, myDealerCode, syncQuoteFile, bumpWrite]);

  /** แปลง "ใบก่อน → ใบหลัง" เป็นบรรทัดกิจกรรมที่คนอ่านรู้เรื่อง
   *  ส่งใบ / ขึ้นเวอร์ชันใหม่ / แก้ยอด — เขียนคนละแบบ ไม่เหมารวมเป็น "แก้ไขใบ" เฉย ๆ */
  const จดกิจกรรมของใบ = useCallback((
    before: QuotationMock | undefined, after: QuotationMock, opts?: { แนบแม่แบบ?: boolean },
  ) => {
    if (before && before.status === "draft" && after.status === "sent_to_client") {
      logLeadActivity(after.dealId,
        `ส่งใบเสนอราคา ${after.id} (${after.revision ?? "V1"}) ให้ลูกค้า${opts?.แนบแม่แบบ ? " พร้อมแม่แบบ" : " (ไม่ได้แนบแม่แบบ)"}`, "doc");
      return;
    }
    if (before && before.status !== "draft" && after.status === "sent_to_client" && before.revision === after.revision) {
      logLeadActivity(after.dealId, `ส่งใบเสนอราคา ${after.id} (${after.revision ?? "V1"}) ให้ลูกค้าอีกครั้ง`, "doc");
      return;
    }
    if (before && before.revision !== after.revision) {
      logLeadActivity(after.dealId,
        `แก้ไขใบเสนอราคา ${after.id} เป็นฉบับ ${after.revision} · ยอด ${after.total}`, "doc");
      return;
    }
    if (before && before.totalValue !== after.totalValue) {
      logLeadActivity(after.dealId, `แก้ยอดใบเสนอราคา ${after.id} เป็น ${after.total}`, "doc");
      return;
    }
    if (before) logLeadActivity(after.dealId, `แก้ไขรายละเอียดใบเสนอราคา ${after.id}`, "doc");
  }, [logLeadActivity]);

  const updateQuotation = useCallback((ที่แก้มา: QuotationMock, opts?: { แนบแม่แบบ?: boolean }) => {
    // งานที่ระบบติ๊กให้เมื่อใบถูกส่งจริง — "ส่งแม่แบบให้ลูกค้า" ติ๊กเฉพาะเมื่อผู้ใช้ยืนยันว่าแนบไปด้วย
    const งานที่ติ๊ก = opts?.แนบแม่แบบ ? ["makeQuote", "sendQuote", "catalog"] : ["makeQuote", "sendQuote"];
    const before = quotationsRef.current.find(q => q.id === ที่แก้มา.id);
    // ── เลขฉบับ (V1→V2) ตัดสินที่นี่ที่เดียว ──────────────────────────────────────
    // ทางผ่านทางเดียวของทุกหน้า → หน้า /quotations กับแผงในหน้าลูกค้าเป้าหมายได้กติกาเดียวกัน
    // และเทียบกับ "ใบล่าสุดในระบบ" (quotationsRef) ไม่ใช่สำเนาที่ค้างอยู่ในฟอร์ม
    // เหตุผลเต็มและกับดักที่เคยเจอ: ดู lib/quoteRevision.ts
    const quotation: QuotationMock = { ...ที่แก้มา, revision: ฉบับถัดไป(before, ที่แก้มา) };
    setQuotations(prev => prev.map(q => q.id !== quotation.id ? q : quotation));
    // แก้ใบที่ won (หรือเคย won) ที่ผูกลูกค้า → ยอดลูกค้าต้องตาม (แก้ totalValue/สถานะ) · H2
    const needsReconcile = quotation.customerId && quotation.customerId > 0 && (quotation.status === "won" || before?.status === "won");
    if (!needsReconcile) {
      persistQuote.update(quotation);
      if (quotation.status !== "draft") completeLeadQuoteTasks(quotation, งานที่ติ๊ก);
      จดกิจกรรมของใบ(before, quotation, opts);
      return;
    }
    // ต้อง await การเขียนใบให้ commit จริงก่อนค่อย reconcile — RPC คำนวณผลรวมจาก DB สด (กัน race, 0078)
    void (async () => {
      try {
        await quotationsRepo.update(quotation);
      } catch (e) {
        onFail("quotations", "แก้ไขใบเสนอราคา")(e);
        return;
      }
      if (quotation.status !== "draft") completeLeadQuoteTasks(quotation, งานที่ติ๊ก);
      จดกิจกรรมของใบ(before, quotation, opts);
      try {
        await reconcileCustomerTotal(quotation.customerId);
      } catch (e) {
        onFail("customers", "คำนวณยอดลูกค้าใหม่")(e);
      }
    })();
  }, [completeLeadQuoteTasks, persistQuote, reconcileCustomerTotal]);

  const deleteQuotation = useCallback((id: string) => {
    const removed = quotationsRef.current.find(q => q.id === id);
    setQuotations(prev => prev.filter(q => q.id !== id));
    syncQuoteFile.remove(id); // ลบใบ → ลบไฟล์อัตโนมัติที่ระบบสร้าง (ไม่แตะไฟล์ที่ผู้ใช้แนบเอง)
    // ลบใบที่ won ที่ผูกลูกค้า → ยอดลูกค้าลดตาม (เดิมไม่ลด = ยอดค้างเกินจริง) · H2
    if (removed?.status !== "won") {
      persistQuote.remove(id);
      return;
    }
    // ต้อง await การลบให้ commit จริงก่อนค่อย reconcile — RPC คำนวณผลรวมจาก DB สด (กัน race, 0078)
    void (async () => {
      try {
        await quotationsRepo.remove(id);
      } catch (e) {
        onFail("quotations", "ลบใบเสนอราคา")(e);
        return;
      }
      try {
        await reconcileCustomerTotal(removed.customerId);
      } catch (e) {
        onFail("customers", "คำนวณยอดลูกค้าใหม่")(e);
      }
    })();
  }, [persistQuote, syncQuoteFile, reconcileCustomerTotal, completeLeadQuoteTasks, จดกิจกรรมของใบ]);

  const setQuotationStatus = useCallback((id: string, status: QuotationStatus) => {
    const target = quotationsRef.current.find(q => q.id === id);
    const prevStatus = target?.status;
    setQuotations(prev => prev.map(q => q.id !== id ? q : { ...q, status })); // optimistic UI
    if (!target || status === "draft") { persistQuote.setStatus(id, status); return; }
    // เปลี่ยนเป็นสถานะหลังการส่ง → ติ๊ก จัดทำ/ส่งใบเสนอราคา ให้ลูกค้าเป้าหมายอัตโนมัติ
    // (setTimeout กัน StrictMode เรียกซ้ำระหว่าง updater)
    const snap = { ...target, status };
    setTimeout(() => completeLeadQuoteTasks(snap, ["makeQuote", "sendQuote"]), 0);
    // เปลี่ยนสถานะใบ = เหตุการณ์สำคัญของดีล ต้องอยู่ในไทม์ไลน์ (บอสสั่ง 21 ส.ค. 69)
    const ชื่อสถานะ: Record<string, string> = {
      sent_to_client: "ส่งให้ลูกค้า", won: "ลูกค้าตอบรับ", lost: "ลูกค้าปฏิเสธ", expired: "หมดอายุ",
    };
    if (ชื่อสถานะ[status]) {
      setTimeout(() => logLeadActivity(snap.dealId, `ใบเสนอราคา ${snap.id} (${snap.revision ?? "V1"}) — ${ชื่อสถานะ[status]}`, "doc"), 0);
    }

    // "ลูกค้าตอบรับ" (won) บนใบเสนอราคา → สร้าง/ผูกลูกค้าให้ลูกค้าเป้าหมายต้นทาง ผ่านเส้นทางเดียว
    // กับการปิดจากลิ้นชักลูกค้าเป้าหมาย (convertLeadToCustomer) — ได้ id จริง ข้อมูลครบ กันซ้ำ (trigger ถูกลบ 0033)
    //
    // ⚠️ atomicity เส้นทางเงินหลัก: ต้อง "สร้าง/ผูกลูกค้าสำเร็จก่อน" แล้วค่อย mark won ที่ DB
    //   ถ้าสร้างลูกค้าไม่ลง DB → ไม่ mark won + ย้อนสถานะใบใน UI (กัน "won ค้างโดยไม่มีลูกค้า")
    //   เดิมยิง setStatus(won) ทันทีแบบ fire-and-forget แล้วค่อยสร้างลูกค้าใน setTimeout แยก —
    //   พลาดกลางทาง = ใบเป็น won แต่ไม่มีลูกค้า (หรือกลับกัน) เงียบ ๆ
    // กรณีอื่น (sent/lost/expired · won ที่ผูกลูกค้าแล้ว/ไม่มีลูกค้าเป้าหมายต้นทาง) — mark สถานะตามปกติ
    const ทำสถานะตามปกติ = () => {
      // R6/H2: ใบที่ผูกลูกค้าเดิมอยู่แล้ว เปลี่ยนเป็น won (ดีลที่ 2+) หรือย้อน won ออก (→ lost/expired/sent)
      //   → รวมยอดลูกค้าใหม่หลังเปลี่ยนสถานะ · เดิมคิดเฉพาะขา won → ย้อน won ออกแล้วยอดไม่ลด
      const needsReconcile = target.customerId && target.customerId > 0 && (status === "won" || prevStatus === "won");
      if (!needsReconcile) { persistQuote.setStatus(id, status); return; }
      // เปลี่ยนสถานะ + รวมยอดลูกค้าใหม่ในทรานแซกชันเดียว (0102) — เดิมเรียก setStatus แล้วค่อย reconcile
      // แยก 2 คำขอ ภายใต้โหลดสูงเจอช่องว่างจังหวะเวลาที่ reconcile คำนวณได้ 0 ทั้งที่สถานะเปลี่ยนไปแล้วจริง
      void (async () => {
        try {
          const { quotation, customer } = await quotationsRepo.setStatusReconciled(id, status);
          setQuotations(prev => prev.map(q => q.id !== id ? q : quotation));
          if (customer) setCustomers(prev => prev.map(c => c.id === customer.id ? customer : c));
        } catch (e) {
          onFail("quotations", "เปลี่ยนสถานะใบเสนอราคา")(e);
          setQuotations(prev => prev.map(q => q.id !== id ? q : { ...q, status: prevStatus ?? q.status }));
        }
      })();
    };
    const linkable = status === "won" && !(target.customerId && target.customerId > 0);
    if (linkable) {
      void (async () => {
        // ⚠️ ต้องรอให้ "ลูกค้าเป้าหมายโหลดเสร็จ" ก่อนตัดสินว่าใบนี้มีลูกค้าเป้าหมายต้นทางไหม
        //    (เจอจริง 27 ส.ค. 69 บนโหมดเดียวกับเว็บจริง) — ตัดสินจากอาร์เรย์ที่ยังโหลดไม่เสร็จ
        //    = "ไม่มีลูกค้าเป้าหมายต้นทาง" → ใบกลายเป็น won เงียบ ๆ โดยไม่มีลูกค้าเกิดขึ้นเลย
        const รายชื่อลีด = await ensureLeads();
        const lead = รายชื่อลีด.find(l => (target.dealId != null && l.numId === target.dealId) || l.company === target.customer);
        if (!lead || lead.customerId != null) { ทำสถานะตามปกติ(); return; }
        try {
          // ทั้งก้อน (หา/สร้างลูกค้า + relink ใบกำพร้า + บังคับใบนี้เป็น won + รวมยอด) เป็น RPC เดียว
          // atomic ที่ DB แล้ว (Phase 4, 0094/0095) — ส่ง id ใบที่กำลังกดเป็น targetQuoteId ตรงๆ
          // ไม่ต้องแยกเรียก setStatus/reconcile อีกที (ตัดจุดเสี่ยง "customer ลงแล้วแต่ setStatus ไม่ทัน")
          await convertLeadToCustomer(lead, false, id);
        } catch {
          // ล้มเหลว (error ถูกแจ้งแล้วในตัว convertLeadToCustomer) → ย้อนสถานะใบใน UI
          setQuotations(prev => prev.map(q => q.id !== id ? q : { ...q, status: prevStatus ?? "sent_to_client" }));
        }
      })();
      return;
    }
    ทำสถานะตามปกติ();
  }, [completeLeadQuoteTasks, convertLeadToCustomer, persistQuote, ensureLeads]);

  // เลขที่ใบเสนอราคาถัดไป — ผ่าน repo (supabase: RPC next_quote_no atomic · local: max+1)
  // คำนำหน้าเป็นค่าคงที่ของระบบ (QUOTE_PREFIX) — รูปแบบเต็ม Q-{รหัสสาขา}-{ปีปัจจุบัน}-{เลขรัน}
  //   เดิมอ่าน document.quotePrefix ที่ดีลเลอร์พิมพ์เองได้ → สาขาที่พิมพ์ "Q-CNX-2026-" ทับ
  //   ได้เลขซ้อนเป็น Q-CNX-2026-CNX-2026-0001 (RPC/LocalAdapter ต่อรหัสสาขา+ปีให้อยู่แล้ว)
  //   ตอนนี้ช่องนั้นล็อกในหน้าตั้งค่าแล้ว จึงไม่อ่านค่าจาก DB อีก — ค่าเสียที่ค้างอยู่ไม่มีผล
  // หัวกระดาษของสาขา — โหลดผ่าน repo ไว้ล่วงหน้า เพื่อสแนปช็อตลงใบตอนสร้าง (addQuotation เป็น sync)
  // เดิมเรียก loadIssuer() ซึ่งอ่าน localStorage → โหมด supabase ได้ค่าเริ่มต้นของโปรเจกต์เสมอ
  // = ใบเสนอราคาที่ส่งลูกค้าขึ้นชื่อบริษัทผิด (ชื่อสาขาเดโม แทนชื่อสาขาจริง)
  const issuerRef = useRef<IssuerProfile>(DEFAULT_ISSUER);
  useEffect(() => {
    if (!ready) return;
    dealerSettingsRepo.get(myDealerCode)
      .then(cfg => { issuerRef.current = cfg.issuer; })
      .catch(e => logRepoRead("dealerSettings.get", e));
  }, [ready, myDealerCode]);

  // เลขนัดถัดไป — ให้ DB เป็นคนออกให้ (atomic ต่อสาขา) แบบเดียวกับลูกค้าและใบเสนอราคา
  const newAppointmentId = useCallback(
    () => appointmentsRepo.nextId(myDealerCode),
    [myDealerCode],
  );

  // เลข num_id ถัดไปของลูกค้าเป้าหมาย — atomic ต่อสาขา (M7) แบบเดียวกับลูกค้า/นัด/ใบเสนอราคา
  const newLeadNumId = useCallback(() => leadsRepo.nextNumId(myDealerCode), [myDealerCode]);

  // ── Appointment mutations (Phase 4) — เขียนทะลุถึง repo ──────────
  /** ลงนัดจริง = งาน "นัดหมาย" ของลูกค้าเป้าหมายรายนั้นเสร็จ — ติ๊กให้เอง
   *
   *  ⚠️ ต้องอยู่ตรงนี้ ไม่ใช่ในหน้าจอ: ลงนัดได้จากหลายทาง (แผงลูกค้าเป้าหมาย · ปฏิทิน)
   *     เดิมเขียนไว้ที่หน้าลูกค้าเป้าหมายทางเดียว ลงนัดจากปฏิทินจึงไม่ติ๊กอะไรเลย
   *     ทั้งที่เป็นงานเดียวกัน (บอสสั่งแก้ 3 ก.ย. 69) · กติกาเดียวกับงานใบเสนอราคา
   *  ลูกค้าเป้าหมายที่ปิดแล้ว (สำเร็จ/ไม่สำเร็จ) ไม่แตะ — ประวัติที่ปิดไปแล้วต้องคงที่ */
  const completeAppointmentTask = useCallback((leadNumId: number | undefined) => {
    const def = findAppointmentTask(taskTplRef.current);
    // นัดที่ไม่ได้ผูกกับลูกค้าเป้าหมาย (เช่นนัดภายใน) ไม่มีงานให้ติ๊ก
    if (!def || !leadNumId) return;
    const RANK: Partial<Record<LeadRow["status"], number>> = { WAITING: 0, BULLET: 1, QUOTED: 2, FOLLOWUP: 3, NEGO: 4 };
    const changed: LeadRow[] = [];
    const nextList = leadsRef.current.map(l => {
      if ((l.dealerCode ?? DEFAULT_DEALER_CODE) !== myDealerCode) return l;
      if (l.numId !== leadNumId || l.status === "PAID" || l.status === "CANCELLED") return l;
      const base = l.tasks && l.tasks.length ? l.tasks : buildLeadTasks(taskTplRef.current);
      if (base.find(t => t.key === def.key)?.done) return l;
      const tasks = base.map(t => t.key === def.key
        ? { ...t, done: true, doneAt: fmtISOToThai(APP_NOW_ISO), doneBy: l.assigned || "อัปเดตอัตโนมัติ" }
        : t);
      const next = stageFromTasks(tasks, taskTplRef.current);
      const status = (RANK[next] ?? 0) > (RANK[l.status] ?? 0) ? next : l.status;
      const nl: LeadRow = { ...l, tasks, status };
      changed.push(nl);
      return nl;
    });
    if (changed.length) {
      leadsRef.current = nextList;
      setLeads(nextList);
      changed.forEach(l => persistLead.update(l));
    }
  }, [myDealerCode, persistLead]);


  const addAppointment = useCallback((appt: AppointmentMock) => {
    // ติด dealerCode ของสาขาที่ล็อกอิน (multi-tenant) — นัดใหม่เป็นของสาขานั้น (RLS with-check ฝั่ง supabase)
    const tagged: AppointmentMock = { ...appt, dealerCode: appt.dealerCode ?? myDealerCode };
    setAppointments(prev => [...prev, tagged]);
    persistAppt.create(tagged);
    completeAppointmentTask(tagged.leadId);   // ลงนัดแล้ว = ติ๊กงาน "นัดหมาย" ให้เอง
    // นัดหมายเป็นการกระทำกับดีลโดยตรง — ต้องอยู่ในไทม์ไลน์ด้วย (บอสสั่ง 21 ส.ค. 69)
    logLeadActivity(tagged.leadId, `นัดหมาย ${tagged.date}${tagged.time ? ` ${tagged.time} น.` : ""}${tagged.note ? ` · ${tagged.note}` : ""}`, "meeting");
  }, [myDealerCode, persistAppt, logLeadActivity, completeAppointmentTask]);
  const updateAppointment = useCallback((appt: AppointmentMock) => {
    setAppointments(prev => prev.map(a => a.id !== appt.id ? a : appt));
    persistAppt.update(appt);
  }, [persistAppt]);
  const deleteAppointment = useCallback((id: number) => {
    setAppointments(prev => prev.filter(a => a.id !== id));
    persistAppt.remove(id);
  }, [persistAppt]);

  // ค่า context ถูกใช้แทบทุกหน้าในทั้งสองแอป — ถ้าไม่ memo ทุก consumer จะเรนเดอร์ซ้ำทุกครั้งที่
  // provider นี้เรนเดอร์ใหม่ แม้ส่วนที่ตัวเองอ่านจะไม่ได้เปลี่ยนเลย (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
  const clearSyncError = useCallback(() => setSyncError(null), []);
  // โหลดเสร็จแล้ว = คืนของในมือทันที · ยังไม่เสร็จ = รอคำขอรอบล่าสุดให้จบก่อนค่อยตอบ
  // (ล้มเหลว = คืนเท่าที่มี ดีกว่าค้างรอตลอดกาล — ผู้เรียกจะเห็นว่าไม่มีใบแล้วบอกผู้ใช้ตามจริง)
  const value = useMemo(() => ({
    leads, updateLeadStatus, newLeadNumId, addLead, updateLead, deleteLead,
    customers, addCustomer, updateCustomer, deleteCustomer,
    quotations, quotationsReady, ensureQuotations, createQuotation, updateQuotation, deleteQuotation, setQuotationStatus,
    newAppointmentId,
    appointments, addAppointment, updateAppointment, deleteAppointment,
    convertLeadToCustomer,
    syncError, clearSyncError,
    salesVersion,
  }), [
    leads, updateLeadStatus, newLeadNumId, addLead, updateLead, deleteLead,
    customers, addCustomer, updateCustomer, deleteCustomer,
    quotations, quotationsReady, ensureQuotations, createQuotation, updateQuotation, deleteQuotation, setQuotationStatus,
    newAppointmentId,
    appointments, addAppointment, updateAppointment, deleteAppointment,
    convertLeadToCustomer,
    syncError, clearSyncError,
    salesVersion,
  ]);

  return (
    <SalesContext.Provider value={value}>
      {children}
    </SalesContext.Provider>
  );
}

// ⚠️ ต้องเขียนชนิดที่คืนค่าไว้ตรง ๆ ห้ามปล่อยให้ TypeScript เดาเอง (แก้ 11 ส.ค. 69)
//   ตอน build บนเซิร์ฟเวอร์จริงพัง แต่ build ในเครื่องผ่าน — ข้อความคือ "a เป็นชนิด any"
//   ที่หน้าปฏิทิน ซึ่งเป็นอาการปลายทางของการที่ตัวนี้กลายเป็น any บนเครื่องนั้น
//   เขียนชนิดไว้ชัด ๆ = ไม่ขึ้นกับลำดับการอ่านไฟล์ของแต่ละเครื่องอีกต่อไป
export function useSales(): SalesContextType {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error("useSales must be used inside SalesProvider");
  return ctx;
}

// ── Helpers ─────────────────────────────────────────────────────────

