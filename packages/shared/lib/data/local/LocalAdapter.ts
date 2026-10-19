"use client";

// LocalAdapter — ห่อ loader / localStorage เดิม (mock.ts, useAudit.ts) โดยไม่แก้ของเดิม
// เป็น adapter เริ่มต้น (NEXT_PUBLIC_DATA_SOURCE=local) · พฤติกรรมเท่าเดิม แค่รวมเข้าท่อเดียว
import { applyLeadIntent } from "@pms/shared/lib/leadIntent";
import {
  loadHQDealers, HQ_DEALERS_KEY,
  loadDealerFiles, saveDealerFiles, addDealerFile, removeDealerFile,
  loadResponsiblePersons, RP_STORAGE_KEY,
  loadHQPolicy, loadHQTargets, loadHQNotifRules, loadLostReasons, HQ_JOURNEY_KEY,
  loadLeadTaskTemplate, normalizeLeadTaskTemplate, nowStampTH,
  HQ_POLICY_KEY, HQ_TARGETS_KEY, HQ_NOTIF_RULES_KEY, HQ_SETTINGS_EVENT,
  loadDealerLeadRulesMap, saveDealerLeadRules, loadQuoteValidityDays,
  leads as leadSeed, initialCustomers, quotations as quoteSeed, appointments as apptSeed,
} from "@pms/shared/lib/mock";
// อ่านจาก auditStore (localStorage ล้วน) ไม่ใช่ useAudit — useAudit เป็น React hook ที่ import
// ชั้นข้อมูลกลับเข้ามา ทำให้เกิดวงจร import จริงตอนรัน (ดูเหตุผลเต็มใน auditStore.ts)
import { loadAudit, appendAudit } from "@pms/shared/lib/auditStore";
import { exactKey } from "@pms/shared/lib/customerMatch";
import { isClosedDeal } from "@pms/shared/lib/customerDeletion";
import { parseThaiDate as parseThaiDateLocal } from "@pms/shared/lib/leadMetrics";
import { parseBaht } from "@pms/shared/lib/format";
import { APP_NOW_ISO } from "@pms/shared/lib/appTime";
import { profileKey, PROFILE_UPDATED_EVENT, sessions, QUOTED_UP, DEFAULT_DEALER_CODE,
  DEFAULT_LEAD_RULES, DEFAULT_HQ_NOTIF_RULES, DEFAULT_HQ_POLICY, type UserProfile } from "@pms/shared/lib/mock";

// โหมด local ไม่มี session จริง — อ่านรหัสสาขาจากคีย์ที่ RoleContext เก็บไว้ (คีย์เดิมของแอป)
function currentDealerCode(): string {
  if (typeof window === "undefined") return "";
  try {
    const s = localStorage.getItem("pms_session_v2");
    if (s) return (JSON.parse(s) as { dealerCode?: string }).dealerCode ?? "";
  } catch {}
  return "";
}
function fireProfile() {
  try { window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT)); } catch {}
}
import { putLocalBlob, localBlobUrl, removeLocalBlob } from "./blobStore";
import { accountLocal } from "./accountLocal";
import type { DataAdapter } from "../ports";
import type { LeadRow, QuotationMock, CustomerRow, AppointmentMock, Scope, DealerSettings, HQCompany, CustomerNote, SystemUser, DealerProspect, DealerPackageProposal, DealerProposalPayment, ProspectActivity, DealerProspectStatus } from "../types";
import { เตรียมบันทึก } from "@pms/shared/lib/dealerProspects";
import { รวมค่าตั้งหาดีลเลอร์, ใช้เป้าตามแพ็กเกจ } from "@pms/shared/lib/recruitSettings";
import { เตรียมบันทึกใบ, ใบล็อกแล้ว, สถานะที่เปลี่ยนไปได้, มีใบเสนอที่ส่งแล้ว, ทำเวอร์ชันใหม่ได้, ต้องมีเหตุผล } from "@pms/shared/lib/dealerProposals";
import {
  ตรวจเปลี่ยนขั้น, ข้อความเพิ่มราย, ข้อความเปลี่ยนขั้น, ข้อความใบเสนอ, ข้อความถอยเพราะใบถูกปฏิเสธ, ประวัติใหม่ก่อน,
  เตรียมบันทึกการติดต่อ, ตรวจบันทึกการติดต่อ, วันไทยของเวลา,
} from "@pms/shared/lib/prospectJourney";

const HQ_COMPANY_KEY = "hq_company_profile";
const NOTES_KEY = "customer_notes_v1";
const PROSPECTS_KEY = "hq_dealer_prospects_v1";
import { HQ_PROSPECTS_SEED } from "./hqProspectsSeed";
const PROPOSALS_KEY = "hq_dealer_proposals_v1";
const PAYMENTS_KEY = "hq_dealer_proposal_payments_v1";
const PROSPECT_ACTIVITIES_KEY = "hq_dealer_prospect_activities_v1";
const HQ_USERS_KEY = "hq_users_v4";
const RECRUIT_KEY = "hq_recruit_settings_v1";
const EMPTY_HQ_COMPANY: HQCompany = { name: "", address: "", taxId: "", phone: "", email: "", website: "" };
import { DEFAULT_ISSUER, DEFAULT_NOTIF_PREFS, ISSUER_KEY, NOTIF_PREFS_KEY, DEALER_PRICING_KEY } from "@pms/shared/lib/mock";
import { DEFAULT_DOC, DOC_KEY } from "@pms/shared/lib/quotationPrint";

// โลโก้ไอคอนบนแถบเมนู — คีย์เดิมของหน้าตั้งค่าดีลเลอร์
const LOGO_KEY = "dealer_company_logo_v2";

const ok = <T>(v: T): Promise<T> => Promise.resolve(v);
const done = (): Promise<void> => Promise.resolve();

function ค่าตั้งหาดีลเลอร์เดโม() {
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(RECRUIT_KEY) ?? "null"); } catch {}
  return รวมค่าตั้งหาดีลเลอร์(raw);
}

// ── ประวัติลูกค้าเป้าหมาย HQ (โหมดเดโม) — เลียนแบบตัวดักของฐานข้อมูล 0174 ──
function บันทึกประวัติเดโม(a: Omit<ProspectActivity, "id" | "actor" | "createdAt">): ProspectActivity {
  const all = readKey<ProspectActivity[]>(PROSPECT_ACTIVITIES_KEY, []);
  const row: ProspectActivity = { ...a, id: all.reduce((m, x) => Math.max(m, x.id), 0) + 1, actor: "โหมดเดโม", createdAt: new Date().toISOString() };
  writeKey(PROSPECT_ACTIVITIES_KEY, [row, ...all]);
  return row;
}
function มีใบส่งแล้วเดโม(prospectId: number): boolean {
  return มีใบเสนอที่ส่งแล้ว(readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []).filter(x => x.prospectId === prospectId));
}
// ส่งใบแล้ว: นัดคุยแล้ว → รอตัดสินใจ ให้เอง (แบบเดียวกับตัวดักของใบเสนอ)
function เลื่อนเป็นรอตัดสินใจเดโม(prospectId: number) {
  const all = อ่านผู้สนใจเดโม();
  const ราย = all.find(x => x.id === prospectId);
  if (!ราย || ราย.status !== "meeting") return;
  writeKey(PROSPECTS_KEY, all.map(x => x.id === prospectId ? { ...x, status: "considering" as const, updatedAt: new Date().toISOString() } : x));
  บันทึกประวัติเดโม({ prospectId, kind: "status", body: ข้อความเปลี่ยนขั้น("meeting", "considering", ราย), fromStatus: "meeting", toStatus: "considering" });
}

// ใบถูกปฏิเสธและไม่มีใบที่ส่งแล้ว/ตอบรับเหลือ: รอตัดสินใจ → นัดคุยแล้ว ให้เอง (แบบเดียวกับตัวดัก 0177)
function ถอยเพราะใบถูกปฏิเสธเดโม(prospectId: number, เลขที่: string) {
  if (มีใบส่งแล้วเดโม(prospectId)) return;
  const all = อ่านผู้สนใจเดโม();
  const ราย = all.find(x => x.id === prospectId);
  if (!ราย || ราย.status !== "considering") return;
  writeKey(PROSPECTS_KEY, all.map(x => x.id === prospectId ? { ...x, status: "meeting" as const, updatedAt: new Date().toISOString() } : x));
  บันทึกประวัติเดโม({ prospectId, kind: "status", body: ข้อความถอยเพราะใบถูกปฏิเสธ(เลขที่), fromStatus: "considering", toStatus: "meeting" });
}

// ลูกค้าเป้าหมาย (HQ) ของเดโม — เครื่องที่ยังไม่เคยมีข้อมูล เริ่มจากรายชื่อตามเอกสาร Dealer BJM PEB (บอสสั่ง 22 ก.ย. 69)
//   มีคีย์อยู่แล้ว (แม้เป็น [] เพราะลบหมดเอง) = ใช้ของเครื่องนั้น ไม่เติมกลับ
function อ่านผู้สนใจเดโม(): DealerProspect[] {
  if (typeof window === "undefined") return [];
  try {
    if (localStorage.getItem(PROSPECTS_KEY) == null) {
      localStorage.setItem(PROSPECTS_KEY, JSON.stringify(HQ_PROSPECTS_SEED));
      return HQ_PROSPECTS_SEED.map(x => ({ ...x }));
    }
  } catch {}
  return readKey<DealerProspect[]>(PROSPECTS_KEY, []);
}

function writeKey(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function readKey<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s) as T; } catch {}
  return fallback;
}

// คีย์งานขาย — สะท้อนของ SalesContext (Step 1 จะย้ายการเขียนมาที่นี่)
const SALES = {
  leads: "sales_leads_v2",
  quotations: "sales_quotations_v1",
  customers: "sales_customers_v1",
  appointments: "sales_appointments_v1",
} as const;

// กรองตามสาขา (multi-tenant) — dealer เห็นเฉพาะสาขาตัวเอง · HQ เห็นทั้งหมด
// แถวไม่ระบุ dealerCode = สมุดงานเดิมของ CNX (ห้าม default เป็น scope.dealerCode ไม่งั้นไม่ติดสาขา
// จะรั่วโผล่ทุกสาขา — คู่แฝดฝั่งอ่านของบั๊ก branch-isolation)
// แจ้งหน้าอื่นใน origin เดียวกันว่าค่าตั้งค่าระดับเครือเปลี่ยน (โหมด supabase ใช้ Realtime แทน)
function fireSettings() {
  try { window.dispatchEvent(new Event(HQ_SETTINGS_EVENT)); } catch {}
}

function scopeByDealer<T extends { dealerCode?: string }>(list: T[], scope?: Scope): T[] {
  if (!scope || scope.isHQ || !scope.dealerCode) return list;
  return list.filter(r => (r.dealerCode ?? DEFAULT_DEALER_CODE) === scope.dealerCode);
}

// "วันหมดอายุ" ของใบเสนอราคา — นิยามเดียวที่ใช้ทั้ง expireOverdue และ hqAlerts (expiring)
//   ใบที่กรอก expiry เอง (รูปแบบ YYYY-MM-DD) → ใช้ค่านั้น
//   ไม่ได้กรอก (ค่าเริ่มต้นฟอร์ม = ว่าง) → date สร้างใบ + validityDays (นโยบาย HQ)
//   คืน null ถ้าคำนวณไม่ได้เลย (ทั้ง expiry และ date ใช้ไม่ได้)
function effectiveExpiryOf(q: { expiry?: string; date: string }, validityDays: number): string | null {
  if (q.expiry && /^\d{4}-\d{2}-\d{2}$/.test(q.expiry)) return q.expiry;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(q.date || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  d.setDate(d.getDate() + validityDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const LocalAdapter: DataAdapter = {
  // โหมด local เก็บไบต์จริงไว้ใน IndexedDB ของเบราว์เซอร์ผู้ใช้เอง (ดู blobStore.ts)
  //   → ไฟล์ที่ "ผู้ใช้อัปโหลดเอง" เปิดอ่าน/ดาวน์โหลดได้จริงแม้ไม่ต่อฐานข้อมูล
  //   → ไฟล์ชุดตัวอย่างไม่มีไบต์จริง จึงไม่มี storagePath และไม่มีปุ่มเปิด/ดาวน์โหลด (ไม่ปลอมเนื้อไฟล์)
  // เบราว์เซอร์ที่ใช้ IndexedDB ไม่ได้ → คืน null เหมือนเดิม (เก็บแค่ metadata)
  storage: {
    upload: (dealerCode, file) => putLocalBlob(dealerCode, file),
    signedUrl: (path) => localBlobUrl(path),
    remove: (path) => removeLocalBlob(path),
  },
  // โหมด local ไม่มี Realtime — ข้อมูลอยู่ในเครื่องเดียว (ข้ามแท็บใช้ event bus/storage event เหมือนเดิม)
  realtime: { subscribeSales: () => () => {}, subscribeSettings: () => () => {}, subscribeNotes: () => () => {}, subscribeDealerSettings: () => () => {} },
  dealers: {
    list: () => ok(loadHQDealers()),
    // เป้าตามแพ็กเกจ (แบบเดียวกับตัวดักฐานข้อมูล 0178)
    save: (all) => { writeKey(HQ_DEALERS_KEY, all.map(d => ใช้เป้าตามแพ็กเกจ(d, ค่าตั้งหาดีลเลอร์เดโม()))); return done(); },
    remove: (code) => {
      writeKey(HQ_DEALERS_KEY, loadHQDealers().filter(d => d.code !== code));
      // ลบดีลเลอร์แล้ว ลูกค้าเป้าหมายต้นทางลบตามไปด้วย พร้อมใบเสนอและประวัติ (บอสสั่ง 15 ก.ย. 69: "ลบไปแล้วลบไปเลย")
      //   แบบเดียวกับโหมดจริง (DELETE /api/admin/dealers)
      const ต้นทาง = new Set(อ่านผู้สนใจเดโม().filter(p => p.dealerCode === code).map(p => p.id));
      if (ต้นทาง.size) {
        writeKey(PROSPECTS_KEY, อ่านผู้สนใจเดโม().filter(p => !ต้นทาง.has(p.id)));
        writeKey(PROPOSALS_KEY, readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []).filter(x => !ต้นทาง.has(x.prospectId)));
        writeKey(PROSPECT_ACTIVITIES_KEY, readKey<ProspectActivity[]>(PROSPECT_ACTIVITIES_KEY, []).filter(x => !ต้นทาง.has(x.prospectId)));
      }
      return done();
    },
  },
  files: {
    list: (scope) => ok(scopeByDealer(loadDealerFiles(), scope)),
    add: (f) => ok(addDealerFile(f)),
    update: (f) => { saveDealerFiles(loadDealerFiles().map(x => x.id === f.id ? f : x)); return done(); },
    remove: (id) => { removeDealerFile(id); return done(); },
  },
  persons: {
    list: (scope) => ok(scopeByDealer(loadResponsiblePersons(), scope)),
    // แทนที่เฉพาะพนักงานของสาขานี้ (คงของสาขาอื่นไว้) + ตรา dealerCode ให้ทุกคน
    save: (all, dealerCode) => {
      const others = loadResponsiblePersons().filter(p => (p.dealerCode ?? DEFAULT_DEALER_CODE) !== dealerCode);
      const mine = all.map(p => ({ ...p, dealerCode }));
      writeKey(RP_STORAGE_KEY, [...others, ...mine]);
      return done();
    },
  },
  settings: {
    getPolicy: () => ok(loadHQPolicy()),
    getTargets: () => ok(loadHQTargets()),
    getNotifRules: () => ok(loadHQNotifRules()),
    getLeadRulesMap: () => ok(loadDealerLeadRulesMap()),
    saveLeadRules: (code, rules) => { saveDealerLeadRules(code, rules); return done(); },
    getQuoteValidityDays: () => ok(loadQuoteValidityDays()),
    getLostReasons: () => ok(loadLostReasons()),
    getLeadTasks: () => ok(loadLeadTaskTemplate()),
    // เก็บกล่องเดียวกับ lost — ต้องอ่านของเดิมมาก่อน ไม่งั้นเขียนทับกันเอง (คีย์เดียว 2 ค่า)
    saveLeadTasks: (tasks) => {
      writeKey(HQ_JOURNEY_KEY, { lost: loadLostReasons(), tasks: normalizeLeadTaskTemplate(tasks) });
      fireSettings();
      return done();
    },
    // เก็บรูปเดิม { lost: [...] } เพื่อไม่ให้ค่าที่ HQ เคยตั้งไว้หายไป · tasks อยู่กล่องเดียวกัน ต้องพกไปด้วย
    saveLostReasons: (lost) => {
      writeKey(HQ_JOURNEY_KEY, { lost, tasks: loadLeadTaskTemplate() });
      fireSettings();
      return done();
    },
    getRecruitSettings: () => ok(ค่าตั้งหาดีลเลอร์เดโม()),
    saveRecruitSettings: (s) => {
      const ค่าใหม่ = รวมค่าตั้งหาดีลเลอร์(s);
      writeKey(RECRUIT_KEY, ค่าใหม่);
      // แก้เป้าของแพ็กเกจ → ดีลเลอร์ในแพ็กเกจนั้นเปลี่ยนตาม (แบบเดียวกับตัวดักฐานข้อมูล 0178)
      writeKey(HQ_DEALERS_KEY, loadHQDealers().map(d => ใช้เป้าตามแพ็กเกจ(d, ค่าใหม่)));
      fireSettings();
      return done();
    },
    // ยิง event หลังบันทึก → หน้าอื่น (origin เดียวกัน) ที่ใช้ค่านโยบาย/เป้า อัปเดตทันที
    savePolicy: (p) => { writeKey(HQ_POLICY_KEY, p); fireSettings(); return done(); },
    saveTargets: (t) => { writeKey(HQ_TARGETS_KEY, t); fireSettings(); return done(); },
    saveNotifRules: (r) => { writeKey(HQ_NOTIF_RULES_KEY, r); fireSettings(); return done(); },
    // mirror restore_hq_settings ฝั่ง supabase (0093) — เธรดเดียวในเบราว์เซอร์ = เขียนทีละกลุ่มได้โดยไม่มี
    // ทางเสี่ยง partial-write จริง (ไม่มี network round-trip คั่นระหว่างแต่ละคีย์)
    restoreSettings: (patch) => {
      if (patch.policy)      writeKey(HQ_POLICY_KEY, patch.policy);
      if (patch.targets)     writeKey(HQ_TARGETS_KEY, patch.targets);
      if (patch.notifRules)  writeKey(HQ_NOTIF_RULES_KEY, patch.notifRules);
      if (patch.lostReasons) writeKey(HQ_JOURNEY_KEY, { lost: patch.lostReasons, tasks: loadLeadTaskTemplate() });
      if (patch.company)     writeKey(HQ_COMPANY_KEY, patch.company);
      fireSettings();
      return done();
    },
  },
  // ตั้งค่าของสาขา — โหมด local เก็บ 4 คีย์เดิมไว้เหมือนเดิม (ค่าที่ผู้ใช้เคยตั้งไม่หาย)
  // ไม่แยกตามสาขา เพราะเครื่องหนึ่งใช้สาขาเดียวอยู่แล้วในโหมดเดโม
  dealerSettings: {
    get: () => ok<DealerSettings>({
      issuer: readKey(ISSUER_KEY, DEFAULT_ISSUER),
      document: { ...DEFAULT_DOC, ...readKey(DOC_KEY, DEFAULT_DOC) },
      logo: readKey<string>(LOGO_KEY, ""),
      notifPrefs: { ...DEFAULT_NOTIF_PREFS, ...readKey(NOTIF_PREFS_KEY, DEFAULT_NOTIF_PREFS) },
      pricing: readKey(DEALER_PRICING_KEY, {}),
    }),
    save: (_dealerCode, patch) => {
      if (patch.issuer)     writeKey(ISSUER_KEY, patch.issuer);
      if (patch.document)   writeKey(DOC_KEY, patch.document);
      if (patch.logo !== undefined)     writeKey(LOGO_KEY, patch.logo);
      if (patch.notifPrefs) writeKey(NOTIF_PREFS_KEY, patch.notifPrefs);
      if (patch.pricing)    writeKey(DEALER_PRICING_KEY, patch.pricing);
      return done();
    },
    // โหมดเดโมเก็บโลโก้ชุดเดียวไม่แยกสาขา — ผูกกับสาขาไหนไม่ได้ จึงคืนว่าง (การ์ดใช้รูปจากลูกค้าเป้าหมาย/ตัวย่อแทน ไม่เดา)
    logos: () => ok({}),
  },
  // โหมด local: คีย์เดิมต่อสาขา (พฤติกรรมเท่าเดิม ค่าที่เคยตั้งไม่หาย)
  profile: {
    get: () => ok(readKey<UserProfile | null>(profileKey(currentDealerCode()), null)),
    save: (p) => { writeKey(profileKey(currentDealerCode()), p); fireProfile(); return done(); },
  },
  // ข้อมูลบริษัท HQ — โหมด local ใช้คีย์เดิม (ค่าที่เคยตั้งไม่หาย)
  // คำขอใบเสนอราคา — โหมดข้อมูลตัวอย่างไม่มี Flow ใบ HQ (ต้องมีฐานข้อมูล)
  quoteRequests: {
    listForLead: () => ok([]),
    listQueue: () => ok([]),
    board: () => ok({ counts: { todo: 0, overdue: 0, quoted: 0, won: 0, closed: 0 }, rows: [] }),
    submit: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างส่งคำขอราคาไม่ได้")),
    cancel: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างส่งคำขอราคาไม่ได้")),
    reprice: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างส่งคำขอราคาไม่ได้")),
    accept: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างส่งคำขอราคาไม่ได้")),
    hqQuoteFor: () => ok(null),
    saveHqQuote: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างทำใบ HQ ไม่ได้")),
    sendHqQuote: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างทำใบ HQ ไม่ได้")),
    copyHqQuote: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างทำใบ HQ ไม่ได้")),
    revertWon: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างย้อนการตอบรับไม่ได้")),
    quotedLeadIds: () => ok([]),
    hqQuoteById: () => ok(null),
    margin: () => ok(null),
  },
  // พื้นที่ของดีลเลอร์ — โหมดข้อมูลตัวอย่างไม่มีกฎพื้นที่ (ไม่มีฐานข้อมูล)
  territories: {
    owners: () => ok([]),   // โหมดตัวอย่างไม่มีกฎพื้นที่ — ทุกจังหวัดว่าง
    unmatched: () => ok([]),
    transferPlan: () => ok([]),
    transferAuto: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างไม่มีการโอนลูกค้าเป้าหมาย")),
    transfer: () => Promise.reject(new Error("โหมดข้อมูลตัวอย่างไม่มีการโอนลูกค้าเป้าหมาย")),
  },
  hqCompany: {
    get: () => ok(readKey<HQCompany>(HQ_COMPANY_KEY, EMPTY_HQ_COMPANY)),
    save: (c) => { writeKey(HQ_COMPANY_KEY, c); fireSettings(); return done(); },
  },
  // โน้ตลูกค้า — โหมด local เก็บเป็นอาร์เรย์เดียวในเครื่อง (เดิมไม่มีที่เก็บเลย)
  notes: {
    list: (scope) => ok(scopeByDealer(readKey<CustomerNote[]>(NOTES_KEY, []), scope)),
    create: (n) => {
      const all = readKey<CustomerNote[]>(NOTES_KEY, []);
      const row = { ...n, id: all.reduce((m, x) => Math.max(m, x.id), 0) + 1 } as CustomerNote;
      writeKey(NOTES_KEY, [row, ...all]);
      return ok(row);
    },
    update: (n) => {
      writeKey(NOTES_KEY, readKey<CustomerNote[]>(NOTES_KEY, []).map(x => x.id === n.id ? n : x));
      return ok(n);
    },
    remove: (id) => {
      writeKey(NOTES_KEY, readKey<CustomerNote[]>(NOTES_KEY, []).filter(x => x.id !== id));
      return done();
    },
  },
  // ลูกค้าเป้าหมายของสำนักงานใหญ่ (โหมดเดโม) — จัดข้อมูลแบบเดียวกับฐานข้อมูลจริง · รายใหม่ขึ้นก่อน
  //   กติกาเลื่อนขั้น + ประวัติ เลียนแบบตัวดักของฐานข้อมูล 0174 — เดโมต้องทำงานเหมือนของจริง
  prospects: {
    list: () => ok(อ่านผู้สนใจเดโม()),
    create: (p) => {
      const all = อ่านผู้สนใจเดโม();
      const now = new Date().toISOString();
      const row: DealerProspect = { ...เตรียมบันทึก(p), id: all.reduce((m, x) => Math.max(m, x.id), 0) + 1, lastContactAt: null, createdAt: now, updatedAt: now };
      writeKey(PROSPECTS_KEY, [row, ...all]);
      บันทึกประวัติเดโม({ prospectId: row.id, kind: "created", body: ข้อความเพิ่มราย(row.status), toStatus: row.status });
      return ok(row);
    },
    update: (p) => {
      const all = อ่านผู้สนใจเดโม();
      const เดิม = all.find(x => x.id === p.id);
      if (!เดิม) return Promise.reject(new Error("ไม่พบลูกค้าเป้าหมายรายนี้แล้ว"));
      // ติดต่อล่าสุดมาจากบันทึกการติดต่อทางเดียว — ห้ามทับด้วยค่าที่หน้าจอส่งกลับมา
      const row: DealerProspect = { ...เตรียมบันทึก(p), id: เดิม.id, lastContactAt: เดิม.lastContactAt ?? null, createdAt: เดิม.createdAt, updatedAt: new Date().toISOString() };
      const ผิด = ตรวจเปลี่ยนขั้น(เดิม.status, row.status, { มีใบส่งแล้ว: มีใบส่งแล้วเดโม(เดิม.id), dealerCode: row.dealerCode });
      if (ผิด) return Promise.reject(new Error(ผิด));
      writeKey(PROSPECTS_KEY, all.map(x => x.id === เดิม.id ? row : x));
      if (row.status !== เดิม.status) {
        บันทึกประวัติเดโม({ prospectId: row.id, kind: "status", body: ข้อความเปลี่ยนขั้น(เดิม.status, row.status, row), fromStatus: เดิม.status, toStatus: row.status });
      }
      return ok(row);
    },
    remove: (id) => {
      writeKey(PROSPECTS_KEY, อ่านผู้สนใจเดโม().filter(x => x.id !== id));
      // ใบและประวัติของรายนั้นหายตามไปด้วย — แบบเดียวกับฐานข้อมูลจริง (on delete cascade)
      writeKey(PROPOSALS_KEY, readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []).filter(x => x.prospectId !== id));
      writeKey(PROSPECT_ACTIVITIES_KEY, readKey<ProspectActivity[]>(PROSPECT_ACTIVITIES_KEY, []).filter(x => x.prospectId !== id));
      return done();
    },
  },
  // ใบค่าแฟรนไชส์ (โหมดเดโม) — กติกาเดียวกับตัวดักของฐานข้อมูล 0172:
  //   เลขที่ออกให้เอง · สถานะเดินหน้าทางเดียว · ส่งแล้วแก้เนื้อหา/ลบไม่ได้
  proposals: {
    list: (prospectId) => ok(readKey<DealerPackageProposal[]>(PROPOSALS_KEY, [])
      .filter(x => prospectId == null || x.prospectId === prospectId)),
    create: (p) => {
      const all = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []);
      const ปี = new Date().getFullYear();
      const ลำดับ = all.filter(x => String(x.proposalNo ?? "").startsWith(`DP-${ปี}-`)).length + 1;
      const now = new Date().toISOString();
      const row: DealerPackageProposal = {
        ...เตรียมบันทึกใบ(p), id: all.reduce((m, x) => Math.max(m, x.id), 0) + 1,
        proposalNo: `DP-${ปี}-${String(ลำดับ).padStart(4, "0")}`, createdAt: now, updatedAt: now,
      };
      writeKey(PROPOSALS_KEY, [row, ...all]);
      บันทึกประวัติเดโม({ prospectId: row.prospectId, kind: "proposal", body: ข้อความใบเสนอ(row.proposalNo ?? "", row.status, true) });
      if (row.status === "sent") เลื่อนเป็นรอตัดสินใจเดโม(row.prospectId);
      return ok(row);
    },
    update: (p) => {
      const all = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []);
      const เดิม = all.find(x => x.id === p.id);
      if (!เดิม) return Promise.reject(new Error("ไม่พบใบค่าแฟรนไชส์นี้แล้ว"));
      if (ใบล็อกแล้ว(เดิม.status)) return Promise.reject(new Error("ใบที่ส่งแล้วแก้เนื้อหาไม่ได้ — เปลี่ยนได้แค่สถานะ"));
      const row: DealerPackageProposal = {
        ...เตรียมบันทึกใบ(p), id: เดิม.id, prospectId: เดิม.prospectId, proposalNo: เดิม.proposalNo,
        status: เดิม.status, createdAt: เดิม.createdAt, updatedAt: new Date().toISOString(),
      };
      writeKey(PROPOSALS_KEY, all.map(x => x.id === row.id ? row : x));
      return ok(row);
    },
    setStatus: (id, status, reason) => {
      let all = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []);
      const เดิม = all.find(x => x.id === id);
      if (!เดิม) return Promise.reject(new Error("ไม่พบใบค่าแฟรนไชส์นี้แล้ว"));
      if (!สถานะที่เปลี่ยนไปได้(เดิม.status).includes(status)) {
        return Promise.reject(new Error(`เปลี่ยนสถานะใบค่าแฟรนไชส์จาก ${เดิม.status} เป็น ${status} ไม่ได้`));
      }
      if (ต้องมีเหตุผล(status) && !reason?.trim()) return Promise.reject(new Error("ปิดใบค่าแฟรนไชส์ต้องระบุเหตุผล"));
      const now = new Date().toISOString();
      const row: DealerPackageProposal = { ...เดิม, status, updatedAt: now,
        ...(ต้องมีเหตุผล(status) ? { closeReason: reason!.trim(), closedAt: now } : {}) };
      all = all.map(x => x.id === id ? row : x);
      // ส่งเวอร์ชันใหม่ → ใบก่อนหน้าในสายที่ยังส่งแล้วอยู่ = ถูกแทน (แบบตัวดัก 0207)
      if (status === "sent" && row.supersedesId != null) {
        const สาย = new Set<number>();
        for (let c: DealerPackageProposal | undefined = all.find(x => x.id === row.supersedesId); c; c = all.find(x => x.id === c!.supersedesId)) สาย.add(c.id);
        all = all.map(x => สาย.has(x.id) && x.status === "sent"
          ? { ...x, status: "superseded", closeReason: `แทนด้วย ${row.proposalNo ?? ""}`, closedAt: now, updatedAt: now } : x);
      }
      writeKey(PROPOSALS_KEY, all);
      if (status !== เดิม.status) {
        บันทึกประวัติเดโม({ prospectId: row.prospectId, kind: "proposal", body: ข้อความใบเสนอ(row.proposalNo ?? "", status, false) });
        if (status === "sent") เลื่อนเป็นรอตัดสินใจเดโม(row.prospectId);
        if (status === "rejected") ถอยเพราะใบถูกปฏิเสธเดโม(row.prospectId, row.proposalNo ?? "");
      }
      return ok(row);
    },
    newVersion: (id) => {
      const all = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []);
      const เดิม = all.find(x => x.id === id);
      if (!เดิม) return Promise.reject(new Error("ไม่พบใบค่าแฟรนไชส์นี้แล้ว"));
      if (all.some(x => x.supersedesId === id && x.status === "draft")) return Promise.reject(new Error("ใบนี้มีร่างเวอร์ชันใหม่ค้างอยู่แล้ว — แก้ร่างนั้นต่อ"));
      if (!ทำเวอร์ชันใหม่ได้(เดิม, all)) return Promise.reject(new Error("ทำเวอร์ชันใหม่ได้เฉพาะใบล่าสุดที่ส่งแล้ว/ปฏิเสธ/หมดอายุ"));
      const now = new Date().toISOString();
      const version = (เดิม.version ?? 1) + 1;
      const row: DealerPackageProposal = {
        ...เดิม, id: all.reduce((m, x) => Math.max(m, x.id), 0) + 1, supersedesId: เดิม.id, version, status: "draft",
        proposalNo: `${String(เดิม.proposalNo ?? "").replace(/-V\d+$/, "")}-V${version}`,
        proposedDate: now.slice(0, 10), closeReason: null, closedAt: null, createdAt: now, updatedAt: now,
      };
      writeKey(PROPOSALS_KEY, [row, ...all]);
      บันทึกประวัติเดโม({ prospectId: row.prospectId, kind: "proposal", body: ข้อความใบเสนอ(row.proposalNo ?? "", row.status, true) });
      return ok(row);
    },
    // ตกลง + ชำระ (โหมดเดโม) — กติกาเดียวกับตัวดัก 0208: ใบต้องตอบรับ · ยอด > 0 · มีเลขอ้างอิง · ยกเลิกต้องมีเหตุผล
    payments: (proposalId) => ok(readKey<DealerProposalPayment[]>(PAYMENTS_KEY, []).filter(x => x.proposalId === proposalId)),
    addPayment: (x) => {
      const ใบ = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []).find(p => p.id === x.proposalId);
      if (ใบ?.status !== "accepted") return Promise.reject(new Error("บันทึกการชำระได้เฉพาะใบค่าแฟรนไชส์ที่ตอบรับแล้ว"));
      if (!(Number(x.amount) > 0)) return Promise.reject(new Error("ยอดชำระต้องมากกว่า 0"));
      if (!String(x.reference ?? "").trim()) return Promise.reject(new Error("ต้องระบุเลขอ้างอิงการชำระ"));
      const all = readKey<DealerProposalPayment[]>(PAYMENTS_KEY, []);
      const row: DealerProposalPayment = { id: all.reduce((m, y) => Math.max(m, y.id), 0) + 1, proposalId: x.proposalId,
        paidOn: x.paidOn, amount: Number(x.amount), reference: x.reference.trim(), createdAt: new Date().toISOString(), cancelReason: null, cancelledAt: null };
      writeKey(PAYMENTS_KEY, [...all, row]);
      return ok(row);
    },
    cancelPayment: (id, reason) => {
      const all = readKey<DealerProposalPayment[]>(PAYMENTS_KEY, []);
      const เดิม = all.find(x => x.id === id);
      if (!เดิม) return Promise.reject(new Error("ไม่พบบันทึกการชำระนี้"));
      if (เดิม.cancelledAt) return Promise.reject(new Error("บันทึกการชำระนี้ยกเลิกไปแล้ว"));
      if (!reason.trim()) return Promise.reject(new Error("ยกเลิกบันทึกการชำระต้องระบุเหตุผล"));
      const row = { ...เดิม, cancelReason: reason.trim(), cancelledAt: new Date().toISOString() };
      writeKey(PAYMENTS_KEY, all.map(x => x.id === id ? row : x));
      return ok(row);
    },
    conversionReady: (prospectId) => {
      const จ่าย = readKey<DealerProposalPayment[]>(PAYMENTS_KEY, []).filter(x => !x.cancelledAt);
      const ตอบรับ = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []).filter(p => p.prospectId === prospectId && p.status === "accepted");
      if (!ตอบรับ.length) return ok("ยังไม่มีใบค่าแฟรนไชส์ที่ตอบรับ — ตอบรับใบแล้วบันทึกการชำระให้ครบก่อน");
      const ครบ = ตอบรับ.some(p => จ่าย.filter(x => x.proposalId === p.id).reduce((s, x) => s + x.amount, 0) >= Number(p.amount ?? 0));
      return ok(ครบ ? null : "ยังชำระไม่ครบ");
    },
    remove: (id) => {
      const all = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []);
      const เดิม = all.find(x => x.id === id);
      if (เดิม && ใบล็อกแล้ว(เดิม.status)) return Promise.reject(new Error("ลบได้เฉพาะใบร่าง — ใบที่ส่งแล้วต้องเก็บไว้เป็นหลักฐาน"));
      writeKey(PROPOSALS_KEY, all.filter(x => x.id !== id));
      return done();
    },
  },
  // ประวัติ + บันทึกการติดต่อ (โหมดเดโม) — บันทึกแล้วตั้ง ติดต่อล่าสุด/นัดติดตาม/วันเริ่มติดต่อ/ขั้น ให้เอง แบบตัวดัก 0174
  prospectActivities: {
    list: (prospectId) => ok(readKey<ProspectActivity[]>(PROSPECT_ACTIVITIES_KEY, [])
      .filter(x => x.prospectId === prospectId).sort(ประวัติใหม่ก่อน)),
    addContact: (x) => {
      const row = เตรียมบันทึกการติดต่อ(x);
      const ผิด = ตรวจบันทึกการติดต่อ(row);
      if (ผิด) return Promise.reject(new Error(ผิด));
      const all = อ่านผู้สนใจเดโม();
      const ราย = all.find(p => p.id === row.prospectId);
      if (!ราย) return Promise.reject(new Error("ไม่พบลูกค้าเป้าหมายรายนี้แล้ว"));
      const บันทึก = บันทึกประวัติเดโม({ prospectId: ราย.id, kind: "contact", channel: row.channel, body: row.body, nextFollowUp: row.nextFollowUp ?? null });
      const ขั้นใหม่: DealerProspectStatus = ราย.status === "new" ? "contacted" : ราย.status;
      writeKey(PROSPECTS_KEY, all.map(p => p.id === ราย.id ? {
        ...p, lastContactAt: บันทึก.createdAt, followUp: row.nextFollowUp ?? p.followUp,
        firstContact: p.firstContact ?? วันไทยของเวลา(บันทึก.createdAt), status: ขั้นใหม่, updatedAt: บันทึก.createdAt,
      } : p));
      if (ขั้นใหม่ !== ราย.status) {
        บันทึกประวัติเดโม({ prospectId: ราย.id, kind: "status", body: ข้อความเปลี่ยนขั้น(ราย.status, ขั้นใหม่, ราย), fromStatus: ราย.status, toStatus: ขั้นใหม่ });
      }
      return ok(บันทึก);
    },
  },
  // โหมดเดโม: รายชื่ออยู่ในเครื่อง สร้าง/ลบได้ (ไม่มีระบบยืนยันตัวตนจริงให้ผูก)
  users: {
    // โหมดเดโม: ผู้ใช้ที่ "ล็อกอินได้จริง" คือบัญชีเดโมใน sessions — ไม่ใช่รายชื่อที่กุขึ้นมา
    // (ผู้ใช้ที่เพิ่มจากหน้าจอเก็บทับลงคีย์เดิม)
    list: () => {
      const saved = readKey<SystemUser[]>(HQ_USERS_KEY, []);
      if (saved.length) return ok(saved);
      // เติมอีเมล/แผนก/วันที่สร้างให้ครบ — เดิมเว้นว่างไว้ ตารางจึงขึ้น "—" สามคอลัมน์รวด
      // ดูเหมือนระบบเก็บข้อมูลไม่ได้ ทั้งที่เป็นแค่ชุดตัวอย่างที่ยังไม่ได้ใส่ (บอสทักท้วง 3 ก.ย. 69)
      const แผนกของบทบาท: Record<string, string> = {
        SUPER_ADMIN: "ไอทีและระบบ", HQ_MANAGEMENT: "บริหาร", HQ_STAFF: "ฝ่ายขาย",
      };
      const demo: SystemUser[] = Object.entries(sessions)
        .filter(([, v]) => !v.dealerCode)
        .map(([key, v]) => ({
          id: `demo-${key}`, name: v.name, email: "admin@benjamin.com", phone: "",
          role: v.role, department: แผนกของบทบาท[v.role] ?? "", dealerCode: "",
          status: "active" as const, createdAt: "1 ม.ค. 2569", avatar: undefined,
        }));
      return ok(demo);
    },
    update: (u) => {
      const all = readKey<SystemUser[]>(HQ_USERS_KEY, []);
      writeKey(HQ_USERS_KEY, all.map(x => x.id === u.id ? { ...x, ...u } : x));
      return done();
    },
    canCreate: () => true,
  },
  // บัญชีเข้าระบบของดีลเลอร์ (แก้เอง 2 ครั้ง · ครั้งที่ 3 ขอ HQ อนุมัติ) — จำลองครบในเครื่อง
  account: accountLocal,
  audit: {
    // local: loadAudit เพดาน MAX=300 อยู่แล้ว · เคารพ limit เพื่อพฤติกรรมตรงกับ supabase (M8)
    list: (limit) => ok(limit ? loadAudit().slice(0, limit) : loadAudit()),
    append: (e) => { appendAudit(e); return done(); },
  },

  // rollup รายสาขา (M9 Phase 1) — คำนวณจาก array ใน localStorage (live-only, ทั้งหมด = มุมมอง HQ)
  // สูตรตรงกับ SQL dealer_rollup + useDealerPerformance เป๊ะ (parity):
  //   หมายเหตุ: โหมด local, useDealerPerformance ยังใช้เส้นทางคำนวณ client เดิม (ผสม seed สาขาอื่น)
  //   ตัวนี้จึงไว้ให้พอร์ตครบ/คนอื่นเรียกได้ — คิดเฉพาะข้อมูล live (ไม่รวม seed)
  metrics: {
    dealerRollup: (year, opts) => {
      const qs = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const ls = readKey<LeadRow[]>(SALES.leads, leadSeed);
      const m = new Map<string, { quotes: number; won: number; lost: number; revenue: number; openLeads: number; staleLeads: number }>();
      const get = (code: string) => {
        let r = m.get(code);
        if (!r) { r = { quotes: 0, won: 0, lost: 0, revenue: 0, openLeads: 0, staleLeads: 0 }; m.set(code, r); }
        return r;
      };
      const asOfMs = opts ? Date.parse(opts.asOf) : Date.parse("2026-06-30");
      const defDays = opts?.defaultDays ?? DEFAULT_LEAD_RULES.followUpAlertDays;
      for (const q of qs) {
        const r = get(q.dealerCode ?? DEFAULT_DEALER_CODE);
        r.quotes += 1;
        if (q.status === "won") {
          r.won += 1;
          // ปีของ date แบบ literal (ตรงกับ fmtISOToThai→parseThaiDate ที่ client ใช้)
          const yr = /^(\d{4})-\d{2}-\d{2}/.exec(q.date || "")?.[1];
          if (yr && Number(yr) === year) r.revenue += q.totalValue ?? 0;
        }
        if (q.status === "lost") r.lost += 1;
      }
      for (const l of ls) {
        if (l.status === "PAID" || l.status === "CANCELLED") continue;
        const code = l.dealerCode ?? DEFAULT_DEALER_CODE;
        const r = get(code); r.openLeads += 1;
        // stale = needsFollowUp: วันติดต่อล่าสุด (max activities ?? createdAt) เงียบเกินเกณฑ์
        const actMs = (l.activities ?? []).map(a => parseThaiDateLocal(a.date)?.getTime()).filter((x): x is number => x != null);
        const lastMs = actMs.length ? Math.max(...actMs) : parseThaiDateLocal(l.createdAt ?? "")?.getTime() ?? null;
        if (lastMs != null) {
          const days = Math.floor((asOfMs - lastMs) / 86_400_000);
          const thr = opts?.perDealer?.[code] ?? defDays;
          if (days > thr) r.staleLeads += 1;
        }
      }
      return ok(m);
    },
    leadSummary: (f) => {
      const ls = readKey<LeadRow[]>(SALES.leads, leadSeed);
      const search = (f.search ?? "").trim().toLowerCase();
      const isoOf = (l: LeadRow) => { const d = parseThaiDateLocal(l.createdAt ?? ""); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null; };
      const rows = ls.filter(l => {
        const iso = isoOf(l);
        if (iso && f.dateStart && iso < f.dateStart) return false;
        if (iso && f.dateEnd && iso > f.dateEnd) return false;
        if (f.dealerCodes?.length && !f.dealerCodes.includes(l.dealerCode ?? DEFAULT_DEALER_CODE)) return false;
        if (f.province && l.province !== f.province) return false;
        // ตัวกรอง/ค้นตามแม่แบบ (l.product) ลบแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
        if (f.source && (l.source || "ไม่ระบุ") !== f.source) return false;
        if (f.status && l.status !== f.status) return false;
        if (search && !`${l.company ?? ""} ${l.contact ?? ""} ${l.province ?? ""} ${l.assigned ?? ""} ${l.id ?? ""} ${l.dealerCode ?? ""}`.toLowerCase().includes(search)) return false;
        return true;
      });
      const cnt = <K extends string>(key: (l: LeadRow) => K) => { const m = new Map<K, number>(); rows.forEach(l => m.set(key(l), (m.get(key(l)) ?? 0) + 1)); return m; };
      const statusM = cnt(l => l.status);
      const statusValM = new Map<string, number>();
      rows.forEach(l => statusValM.set(l.status, (statusValM.get(l.status) ?? 0) + parseBaht(l.value)));
      const sourceM = cnt(l => (l.source || "ไม่ระบุ"));
      const productM = new Map<string, number>(); // ไม่นับตามแม่แบบแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
      const provM = new Map<string, number>();
      rows.forEach(l => { const p = (l.province ?? "").trim(); if (p) provM.set(p, (provM.get(p) ?? 0) + 1); });
      const lostM = new Map<string, { count: number; value: number }>();
      rows.filter(l => l.status === "CANCELLED" && l.lostReason).forEach(l => { const r = lostM.get(l.lostReason!) ?? { count: 0, value: 0 }; r.count += 1; r.value += parseBaht(l.value); lostM.set(l.lostReason!, r); });
      // quoted/won ต้องมีครบเหมือนฝั่งฐานข้อมูล (ใบ 0157) ไม่งั้นโหมด local กับ supabase ให้เลขคนละชุด
      const monthM = new Map<string, { y: number; m: number; created: number; won: number; lost: number; quoted: number }>();
      rows.forEach(l => { const d = parseThaiDateLocal(l.createdAt ?? ""); if (!d) return; const y = d.getFullYear(), m = d.getMonth(), k = `${y}-${m}`; let r = monthM.get(k); if (!r) { r = { y, m, created: 0, won: 0, lost: 0, quoted: 0 }; monthM.set(k, r); } r.created++; if (l.status === "PAID") r.won++; if (l.status === "CANCELLED") r.lost++; if (QUOTED_UP.includes(l.status)) r.quoted++; });
      const dealerM = new Map<string, { leads: number; quoted: number; won: number }>();
      rows.forEach(l => { const code = l.dealerCode ?? DEFAULT_DEALER_CODE; let r = dealerM.get(code); if (!r) { r = { leads: 0, quoted: 0, won: 0 }; dealerM.set(code, r); } r.leads++; if (QUOTED_UP.includes(l.status)) r.quoted++; if (l.status === "PAID") r.won++; });
      return ok({
        byStatus: [...statusM.entries()].map(([status, count]) => ({ status, count, value: statusValM.get(status) ?? 0 })),
        bySource: [...sourceM.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
        byProduct: [...productM.entries()].map(([product, count]) => ({ product, count })).sort((a, b) => b.count - a.count),
        byProvince: [...provM.entries()].map(([province, count]) => ({ province, count })).sort((a, b) => a.province.localeCompare(b.province)),
        byLostReason: [...lostM.entries()].map(([reason, x]) => ({ reason, ...x })).sort((a, b) => b.count - a.count),
        byMonth: [...monthM.values()],
        byDealer: [...dealerM.entries()].map(([dealerCode, x]) => ({ dealerCode, ...x })),
      });
    },
    networkQuoteRange: (start, end, dealer) => {
      const qs = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const m = new Map<string, { quotes: number; won: number; lost: number; wonVal: number; quoteVal: number }>();
      for (const q of qs) {
        const md = /^(\d{4}-\d{2}-\d{2})/.exec(q.date || "");
        if (!md) continue;
        const d = md[1];
        if (d < start || d > end) continue; // ISO string เทียบตามลำดับ = เทียบวันได้ตรง
        const code = q.dealerCode ?? DEFAULT_DEALER_CODE;
        if (dealer && code !== dealer) continue;
        let r = m.get(code);
        if (!r) { r = { quotes: 0, won: 0, lost: 0, wonVal: 0, quoteVal: 0 }; m.set(code, r); }
        const v = q.totalValue ?? 0;
        r.quotes += 1; r.quoteVal += v;
        if (q.status === "won") { r.won += 1; r.wonVal += v; }
        if (q.status === "lost") r.lost += 1;
      }
      return ok(m);
    },
    dashboardQuoteSummary: (start, end, dealer) => {
      const qs = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const monthM = new Map<string, { y: number; m: number; quotes: number; won: number; lost: number; wonVal: number }>();
      const statusM = new Map<string, { count: number; value: number }>();
      const prodM = new Map<string | null, { value: number; projects: number }>();
      // รายวัน/รายชั่วโมง — parity กับฐานข้อมูลจริง (ใบ 0160)
      // ⚠️ รายชั่วโมงใช้ savedAt (เวลาที่ระบบบันทึกใบ) ใบเก่าที่ไม่มีค่านี้จะไม่เข้าช่องไหนเลย
      //    ไม่เดาเวลาให้ — กราฟรายชั่วโมงจะว่างแทนที่จะโชว์ตัวเลขที่ไม่มีอยู่จริง
      const dayM = new Map<string, { quotes: number; won: number; lost: number; wonVal: number }>();
      const hourM = new Map<number, { quotes: number; won: number; wonVal: number }>();
      for (const q of qs) {
        const md = /^(\d{4})-(\d{2})-(\d{2})/.exec(q.date || "");
        if (!md) continue;
        const dstr = `${md[1]}-${md[2]}-${md[3]}`;
        if (dstr < start || dstr > end) continue;
        const code = q.dealerCode ?? DEFAULT_DEALER_CODE;
        if (dealer && code !== dealer) continue;
        const v = q.totalValue ?? 0;
        const y = Number(md[1]), m = Number(md[2]) - 1; // 0..11 ให้ตรง getMonth()
        const mk = `${y}-${m}`;
        let mm = monthM.get(mk);
        if (!mm) { mm = { y, m, quotes: 0, won: 0, lost: 0, wonVal: 0 }; monthM.set(mk, mm); }
        mm.quotes += 1;
        if (q.status === "won") { mm.won += 1; mm.wonVal += v; }
        if (q.status === "lost") mm.lost += 1;
        let sm = statusM.get(q.status);
        if (!sm) { sm = { count: 0, value: 0 }; statusM.set(q.status, sm); }
        sm.count += 1; sm.value += v;
        const raw = q.project; // ไม่ใช้ประเภทอาคาร (แม่แบบ) แล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
        const product = raw ? raw : null;         // ว่าง/undefined → null (ตรงกับ nullif ใน SQL)
        let pm = prodM.get(product);
        if (!pm) { pm = { value: 0, projects: 0 }; prodM.set(product, pm); }
        pm.value += v; pm.projects += 1;
        let dm = dayM.get(dstr);
        if (!dm) { dm = { quotes: 0, won: 0, lost: 0, wonVal: 0 }; dayM.set(dstr, dm); }
        dm.quotes += 1;
        if (q.status === "won") { dm.won += 1; dm.wonVal += v; }
        if (q.status === "lost") dm.lost += 1;
        if (q.savedAt) {
          const ts = new Date(q.savedAt);
          if (!isNaN(ts.getTime())) {
            const h = ts.getHours();
            let hm = hourM.get(h);
            if (!hm) { hm = { quotes: 0, won: 0, wonVal: 0 }; hourM.set(h, hm); }
            hm.quotes += 1;
            if (q.status === "won") { hm.won += 1; hm.wonVal += v; }
          }
        }
      }
      return ok({
        byMonth: [...monthM.values()],
        byDay: [...dayM.entries()].map(([d, x]) => ({ d, ...x })).sort((a, b) => a.d.localeCompare(b.d)),
        byHour: [...hourM.entries()].map(([h, x]) => ({ h, ...x })).sort((a, b) => a.h - b.h),
        byStatus: [...statusM.entries()].map(([status, x]) => ({ status, ...x })),
        byProduct: [...prodM.entries()].map(([product, x]) => ({ product, ...x })).sort((a, b) => b.value - a.value),
      });
    },
    networkCustomerSummary: () => {
      const cs = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      const provM = new Map<string, { revenue: number; count: number }>();
      for (const c of cs) {
        const p = (c.province ?? "").trim() || "ไม่ระบุ";
        let r = provM.get(p);
        if (!r) { r = { revenue: 0, count: 0 }; provM.set(p, r); }
        r.revenue += c.totalValue || 0; r.count += 1;
      }
      return ok({
        total: cs.length,
        byProvince: [...provM.entries()].map(([province, x]) => ({ province, ...x })).sort((a, b) => b.revenue - a.revenue),
      });
    },
    unassignedLeads: (f) => {
      const ls = readKey<LeadRow[]>(SALES.leads, leadSeed);
      const asOf = f.asOf ? new Date(f.asOf) : new Date(2026, 5, 30);
      const search = (f.search ?? "").trim().toLowerCase();
      const rows = ls.filter(l => {
        if (l.assigned?.trim()) return false;
        if (l.status === "PAID" || l.status === "CANCELLED") return false; // isLeadOpen
        const d = parseThaiDateLocal(l.createdAt ?? ""); if (!d) return false;
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (f.dateStart && iso < f.dateStart) return false;
        if (f.dateEnd && iso > f.dateEnd) return false;
        const code = l.dealerCode ?? DEFAULT_DEALER_CODE;
        if (f.dealerCodes?.length && !f.dealerCodes.includes(code)) return false;
        if (f.province && l.province !== f.province) return false;
        if (f.source && (l.source || "ไม่ระบุ") !== f.source) return false;
        if (search && !`${l.company ?? ""} ${l.contact ?? ""} ${l.province ?? ""} ${l.id ?? ""} ${code}`.toLowerCase().includes(search)) return false;
        const hours = f.perDealer?.[code] ?? f.defaultHours ?? DEFAULT_LEAD_RULES.unassignedAlertHours;
        return (asOf.getTime() - d.getTime()) / 3_600_000 > hours;
      });
      const m = new Map<string, number>();
      rows.forEach(l => { const c = l.dealerCode ?? DEFAULT_DEALER_CODE; m.set(c, (m.get(c) ?? 0) + 1); });
      return ok({ total: rows.length, byDealer: [...m.entries()].map(([dealerCode, count]) => ({ dealerCode, count })).sort((a, b) => b.count - a.count) });
    },
    hqAlerts: (f) => {
      const ls = readKey<LeadRow[]>(SALES.leads, leadSeed);
      const qs = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const asOf = f.asOf ? new Date(f.asOf) : new Date(2026, 5, 30);
      const DAY = 86_400_000;
      const isOpen = (s: string) => s !== "PAID" && s !== "CANCELLED";
      const lastContactOf = (l: LeadRow) => {
        const ds = (l.activities ?? []).map(a => parseThaiDateLocal(a.date)).filter((d): d is Date => !!d);
        const created = parseThaiDateLocal(l.createdAt ?? "");
        return ds.length ? new Date(Math.max(...ds.map(d => d.getTime()))) : created;
      };
      // คำนวณวันที่แค่ครั้งเดียวต่อลูกค้าเป้าหมาย (เดิม parse/lastContactOf ซ้ำ 2 รอบใน filter+map แล้วใช้ ! ยืนยันว่าไม่ null
      //   ทั้งที่ map เป็นคนละ pass จาก filter — พึ่ง purity ของฟังก์ชันเฉย ๆ ไม่ได้การันตีจาก type)
      const unassigned = ls
        .filter(l => !l.assigned?.trim() && isOpen(l.status))
        .map(l => ({ l, created: parseThaiDateLocal(l.createdAt ?? "") }))
        .filter((x): x is { l: LeadRow; created: Date } => !!x.created
          && (asOf.getTime() - x.created.getTime()) / 3_600_000 > (f.unassignedPerDealer?.[x.l.dealerCode ?? DEFAULT_DEALER_CODE] ?? f.unassignedDefaultHours ?? DEFAULT_LEAD_RULES.unassignedAlertHours))
        .map(({ l }) => ({ numId: l.numId, dealerCode: l.dealerCode ?? DEFAULT_DEALER_CODE, company: l.company || l.name, province: l.province, value: l.value }));
      const idle = ls
        .filter(l => isOpen(l.status))
        .map(l => ({ l, lc: lastContactOf(l) }))
        .filter((x): x is { l: LeadRow; lc: Date } => !!x.lc && (asOf.getTime() - x.lc.getTime()) / DAY > (f.leadIdleDays ?? DEFAULT_HQ_NOTIF_RULES.leadIdleDays))
        .map(({ l, lc }) => ({ numId: l.numId, dealerCode: l.dealerCode ?? DEFAULT_DEALER_CODE, company: l.company || l.name, assigned: l.assigned, idleDays: Math.floor((asOf.getTime() - lc.getTime()) / DAY) }));
      const validity = f.quoteValidityDays ?? DEFAULT_HQ_POLICY.quoteValidityDays, within = f.quoteExpiringDays ?? DEFAULT_HQ_NOTIF_RULES.quoteExpiringDays;
      // นิยามเดียวกับ expireOverdue (effectiveExpiryOf) — เดิมใช้ date+validity เสมอ ไม่สนใจ expiry ที่กรอกเอง
      //   ใบที่ตั้ง expiry เองไว้ไกลจากวันนี้ ก็ยังโดนเตือน "ใกล้หมดอายุ" ผิด ๆ ตาม date+validity
      const expiring = qs.filter(q => q.status === "sent_to_client").map(q => {
        const eff = effectiveExpiryOf(q, validity); if (!eff) return null;
        const daysLeft = Math.round((new Date(eff + "T00:00:00").getTime() - asOf.getTime()) / DAY);
        return daysLeft >= 0 && daysLeft <= within ? { quoteNo: q.id, customer: q.customer, value: q.totalValue ?? 0, dealerCode: q.dealerCode ?? null, daysLeft } : null;
      }).filter((x): x is NonNullable<typeof x> => !!x);
      const latestM = new Map<string, number>();
      qs.forEach(q => { if (!q.dealerCode) return; const d = /^(\d{4}-\d{2}-\d{2})/.exec(q.date || "")?.[1]; if (!d) return; const t = new Date(d).getTime(); if (!latestM.has(q.dealerCode) || t > latestM.get(q.dealerCode)!) latestM.set(q.dealerCode, t); });
      const dealerLatest = [...latestM.entries()].map(([dealerCode, t]) => ({ dealerCode, idleDays: Math.floor((asOf.getTime() - t) / DAY) }));
      const lostM = new Map<string, { lost: number; closed: number }>();
      ls.forEach(l => { if (!l.dealerCode || isOpen(l.status)) return; const r = lostM.get(l.dealerCode) ?? { lost: 0, closed: 0 }; if (l.status === "CANCELLED") r.lost++; r.closed++; lostM.set(l.dealerCode, r); });
      const lostRate = [...lostM.entries()].map(([dealerCode, x]) => ({ dealerCode, ...x }));
      return ok({ unassigned, idle, expiring, dealerLatest, lostRate });
    },
    hqQuotationsSummary: (f) => {
      const qs = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const asOfMs = Date.parse(f.asOf ?? "2026-06-30");
      const search = (f.search ?? "").trim().toLowerCase();
      const plOf = (q: QuotationMock): string | null => (q.project ?? "").trim() || null; // ไม่ใช้ประเภทอาคาร (แม่แบบ) — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
      const dateOf = (q: QuotationMock) => /^(\d{4}-\d{2}-\d{2})/.exec(q.date || "")?.[1];
      const dM = new Map<string, { count: number; value: number; sent: number; won: number; lost: number; wonVal: number; latest: string | null }>();
      const mM = new Map<string, { y: number; m: number; quotes: number; won: number; lost: number; wonVal: number }>();
      const pM = new Map<string | null, { value: number; projects: number }>();
      const agM = new Map<string, { count: number; value: number }>();
      for (const q of qs) {
        const d = dateOf(q); if (!d) continue;
        if (f.status && q.status !== f.status) continue;
        if (f.dealerCodes?.length && !f.dealerCodes.includes(q.dealerCode ?? DEFAULT_DEALER_CODE)) continue;
        const pl = plOf(q);
        if (f.productLines?.length && (pl == null || !f.productLines.includes(pl))) continue;
        if (f.dateStart && d < f.dateStart) continue;
        if (f.dateEnd && d > f.dateEnd) continue;
        if (search && !`${q.id} ${q.customer ?? ""}`.toLowerCase().includes(search) && !f.searchDealers?.includes(q.dealerCode ?? DEFAULT_DEALER_CODE)) continue;
        const code = q.dealerCode ?? DEFAULT_DEALER_CODE, v = q.totalValue ?? 0;
        const y = Number(d.slice(0, 4)), mo = Number(d.slice(5, 7)) - 1;
        let dr = dM.get(code); if (!dr) { dr = { count: 0, value: 0, sent: 0, won: 0, lost: 0, wonVal: 0, latest: null as string | null }; dM.set(code, dr); }
        dr.count++; dr.value += v; if (q.status !== "draft") dr.sent++;
        if (q.status === "won") { dr.won++; dr.wonVal += v; } if (q.status === "lost") dr.lost++;
        if (!dr.latest || d > dr.latest) dr.latest = d; // วันใบล่าสุด (ISO)
        const mk = `${y}-${mo}`; let mr = mM.get(mk); if (!mr) { mr = { y, m: mo, quotes: 0, won: 0, lost: 0, wonVal: 0 }; mM.set(mk, mr); }
        mr.quotes++; if (q.status === "won") { mr.won++; mr.wonVal += v; } if (q.status === "lost") mr.lost++;
        let pr = pM.get(pl); if (!pr) { pr = { value: 0, projects: 0 }; pM.set(pl, pr); } pr.value += v; pr.projects++;
        if (q.status === "sent_to_client") {
          const days = Math.max(0, Math.round((asOfMs - Date.parse(d)) / 86_400_000));
          const bucket = days <= 7 ? "0-7" : days <= 14 ? "8-14" : days <= 30 ? "15-30" : "30+";
          let ar = agM.get(bucket); if (!ar) { ar = { count: 0, value: 0 }; agM.set(bucket, ar); } ar.count++; ar.value += v;
        }
      }
      return ok({
        byDealer: [...dM.entries()].map(([dealerCode, x]) => ({ dealerCode, ...x })).sort((a, b) => b.value - a.value),
        byMonth: [...mM.values()],
        byProduct: [...pM.entries()].map(([product, x]) => ({ product, ...x })).sort((a, b) => b.value - a.value),
        aging: [...agM.entries()].map(([bucket, x]) => ({ bucket, ...x })),
      });
    },
    // หน้าเดียวของฐานข้อมูลลูกค้า HQ + KPI/กราฟ จากทั้งชุดที่กรองแล้ว — mirror ตรรกะ SQL ใน migration 0080
    hqCustomersPage: (opts) => {
      const custs = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      const quotes = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const dealerNameOf = new Map(loadHQDealers().map(d => [d.code, d.name]));

      type Agg = { buildingTypes: Set<string>; templates: Set<string>; lastPurchaseAt: string | null; count: number };
      const aggByCustomer = new Map<number, Agg>();
      for (const q of quotes) {
        if (q.status !== "won" || !q.customerId) continue;
        const wonDate = /^\d{4}-\d{2}-\d{2}/.exec(q.date || "")?.[0];
        if (!wonDate) continue;
        // ไม่จัดกลุ่มลูกค้าตามประเภทอาคาร (แม่แบบ) แล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69 · buildingTypes ว่างเสมอ
        let a = aggByCustomer.get(q.customerId);
        if (!a) { a = { buildingTypes: new Set(), templates: new Set(), lastPurchaseAt: null, count: 0 }; aggByCustomer.set(q.customerId, a); }
        if (!a.lastPurchaseAt || wonDate > a.lastPurchaseAt) a.lastPurchaseAt = wonDate;
        a.count++;
      }

      const search = (opts.search ?? "").trim().toLowerCase();
      const base = custs.map(c => {
        const a = aggByCustomer.get(c.id);
        return {
          id: c.id, name: c.company, dealerCode: c.dealerCode ?? DEFAULT_DEALER_CODE,
          dealerName: dealerNameOf.get(c.dealerCode ?? DEFAULT_DEALER_CODE) ?? (c.dealerCode ?? DEFAULT_DEALER_CODE),
          province: c.province ?? "", totalValue: c.totalValue ?? 0,
          buildingTypes: a ? [...a.buildingTypes] : [], templates: a ? [...a.templates] : [],
          lastPurchaseAt: a?.lastPurchaseAt ?? null,
          isRepeat: (a?.count ?? 0) > 1,
        };
      }).filter(c => {
        if (search && !c.name.toLowerCase().includes(search) && !c.province.toLowerCase().includes(search)) return false;
        if (opts.dealerCode && c.dealerCode !== opts.dealerCode) return false;
        if (opts.provinces?.length && !opts.provinces.includes(c.province)) return false;
        if (opts.buildingType && !c.buildingTypes.includes(opts.buildingType)) return false;
        // ตัวกรอง "ซื้อล่าสุด" — กติกาเดียวกับฐานข้อมูล (ใบ 0159): ไม่มีวันซื้อ = ไม่เข้าเกณฑ์
        if (opts.boughtFrom && (c.lastPurchaseAt ?? "") < opts.boughtFrom) return false;
        if (opts.boughtTo && (!c.lastPurchaseAt || c.lastPurchaseAt > opts.boughtTo)) return false;
        return true;
      });

      const total = base.length;
      // "ยังซื้ออยู่" = ซื้อภายใน 12 เดือนล่าสุด (กติกาเดียวกับฐานข้อมูล ใบ 0158)
      const เมื่อปีก่อน = (() => { const d = new Date(APP_NOW_ISO); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })();
      const kpi = {
        total,
        active: base.filter(c => (c.lastPurchaseAt ?? "") >= เมื่อปีก่อน).length,
        revenue: base.reduce((s, c) => s + c.totalValue, 0),
        repeat: base.filter(c => c.isRepeat).length,
      };
      const countBy = (keysOf: (c: typeof base[number]) => string[]) => {
        const m = new Map<string, number>();
        base.forEach(c => keysOf(c).forEach(k => m.set(k, (m.get(k) ?? 0) + 1)));
        return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
      };
      const byDealerMap = new Map<string, { name: string; value: number }>();
      const revByDealerMap = new Map<string, number>();
      base.forEach(c => {
        const bd = byDealerMap.get(c.dealerCode) ?? { name: c.dealerName, value: 0 }; bd.value++; byDealerMap.set(c.dealerCode, bd);
        revByDealerMap.set(c.dealerCode, (revByDealerMap.get(c.dealerCode) ?? 0) + c.totalValue);
      });
      const charts = {
        byType: countBy(c => c.buildingTypes),
        bySubtype: countBy(c => c.templates),
        byProvince: countBy(c => c.province ? [c.province] : []).slice(0, 10),
        byDealer: [...byDealerMap.entries()].map(([code, x]) => ({ code, name: x.name, value: x.value })).sort((a, b) => b.value - a.value),
        revenueByDealer: [...revByDealerMap.entries()].map(([code, revenue]) => ({ code, revenue })).sort((a, b) => b.revenue - a.revenue),
      };
      const sorted = [...base].sort((a, b) => b.totalValue - a.totalValue || a.id - b.id);
      const rows = sorted.slice(opts.offset, opts.offset + opts.limit).map(c => ({
        id: c.id, name: c.name, dealerCode: c.dealerCode, dealerName: c.dealerName, province: c.province,
        totalValue: c.totalValue, buildingTypes: c.buildingTypes, templates: c.templates,
        lastPurchaseAt: c.lastPurchaseAt,
      }));
      return ok({ total, kpi, charts, rows });
    },
    // ภาพรวม HQ (โหมดตัวอย่าง) — คิดจากข้อมูลในเครื่องเท่าที่มี: ผู้สนใจ/ใบค่าแฟรนไชส์/ใบเสนอราคา won
    //   โหมดตัวอย่างไม่มีคำขอราคา/ใบ HQ/พื้นที่ดีลเลอร์ → ส่วนนั้นเป็นศูนย์ (ห้ามเติมตัวเลข)
    hqOverview: () => {
      const ราย = readKey<DealerProspect[]>(PROSPECTS_KEY, HQ_PROSPECTS_SEED);
      const ใบ = readKey<DealerPackageProposal[]>(PROPOSALS_KEY, []).filter(p => p.status === "sent");
      const quotes = readKey<QuotationMock[]>(SALES.quotations, quoteSeed).filter(q => q.status === "won");
      const นับ = (s: DealerProspectStatus) => ราย.filter(r => r.status === s).length;
      return ok({
        recruit: {
          stages: { new: นับ("new"), contacted: นับ("contacted"), profile_sent: นับ("profile_sent"), meeting: นับ("meeting"),
            considering: นับ("considering"), won: นับ("won"), lost: นับ("lost") },
          proposalsWaiting: { count: ใบ.length, amount: ใบ.reduce((s, p) => s + Number(p.amount ?? 0), 0) },
          provincesNoDealer: [],
        },
        requests: { queue: [], overdue: 0, avgResponseDays: null, closeRate: { won: 0, lost: 0, pct: null }, cancel: { cancelled: 0, total: 0, pct: null, reasons: [] } },
        sales: { hqOrdered: 0, dealerWon: quotes.reduce((s, q) => s + Number(q.totalValue ?? 0), 0), marginByDealer: [] },
      });
    },
    hqCustomersFilterOptions: () => {
      const custs = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      const quotes = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const dealerNameOf = new Map(loadHQDealers().map(d => [d.code, d.name]));
      const dealers = new Map<string, string>();
      custs.forEach(c => { const code = c.dealerCode ?? DEFAULT_DEALER_CODE; dealers.set(code, dealerNameOf.get(code) ?? code); });
      const provinces = new Set<string>();
      custs.forEach(c => { if (c.province) provinces.add(c.province); });
      const types = new Set<string>();
      quotes.forEach(q => {
        if (q.status !== "won" || !q.customerId) return;
        const wonDate = /^\d{4}-\d{2}-\d{2}/.exec(q.date || "")?.[0];
        if (!wonDate) return;
        // ตัวเลือกประเภทอาคาร (แม่แบบ) ไม่มีแล้ว — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
      });
      return ok({
        dealers: [...dealers.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code)),
        provinces: [...provinces].sort((a, b) => a.localeCompare(b, "th")),
        types: [...types].sort((a, b) => a.localeCompare(b, "th")),
      });
    },
  },

  // งานขาย — list (อ่าน) + CRUD เต็ม (Phase 0) · เขียนลง localStorage คีย์เดียวกับ SalesContext
  leads: {
    list: (scope) => ok(scopeByDealer(readKey<LeadRow[]>(SALES.leads, leadSeed), scope)),
    // โหมดข้อมูลในเครื่องเก็บทุกคอลัมน์อยู่แล้ว — คืนแถวที่ตรง id ตรง ๆ
    get: (id) => ok(readKey<LeadRow[]>(SALES.leads, leadSeed).find(l => l.id === id) ?? null),
    // หน้าเดียว + กรอง (M9 Phase 4) — mirror leads_page ฝั่ง DB
    listPage: (scope, opts) => {
      const search = (opts.search ?? "").trim().toLowerCase();
      const isoOf = (l: LeadRow) => { const d = parseThaiDateLocal(l.createdAt ?? ""); return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null; };
      const lastMs = (l: LeadRow) => { const a = (l.activities ?? []).map(x => parseThaiDateLocal(x.date)?.getTime()).filter((x): x is number => x != null); return a.length ? Math.max(...a) : (parseThaiDateLocal(l.createdAt ?? "")?.getTime() ?? null); };
      const asOfMs = Date.parse(opts.asOf ?? "2026-06-30"), defDays = opts.defaultDays ?? DEFAULT_LEAD_RULES.followUpAlertDays;
      let arr = scopeByDealer(readKey<LeadRow[]>(SALES.leads, leadSeed), scope).filter(l => {
        const iso = isoOf(l);
        if (iso && opts.dateStart && iso < opts.dateStart) return false;
        if (iso && opts.dateEnd && iso > opts.dateEnd) return false;
        if (opts.status && l.status !== opts.status) return false;
        if (opts.dealerCodes?.length && !opts.dealerCodes.includes(l.dealerCode ?? DEFAULT_DEALER_CODE)) return false;
        if (opts.province && l.province !== opts.province) return false;
        if (opts.source && (l.source || "ไม่ระบุ") !== opts.source) return false;
        if (search && !`${l.company ?? ""} ${l.contact ?? ""} ${l.province ?? ""} ${l.assigned ?? ""} ${l.id ?? ""} ${l.dealerCode ?? ""}`.toLowerCase().includes(search)) return false;
        if (opts.overdue) {
          if (l.status === "PAID" || l.status === "CANCELLED") return false;
          const lm = lastMs(l); if (lm == null) return false;
          const thr = opts.perDealer?.[l.dealerCode ?? DEFAULT_DEALER_CODE] ?? defDays;
          if (!(Math.floor((asOfMs - lm) / 86_400_000) > thr)) return false;
        }
        return true;
      });
      arr = [...arr].sort((a, b) => {
        const am = parseThaiDateLocal(a.createdAt ?? "")?.getTime() ?? -Infinity, bm = parseThaiDateLocal(b.createdAt ?? "")?.getTime() ?? -Infinity;
        return am !== bm ? bm - am : (b.numId ?? 0) - (a.numId ?? 0);
      });
      return ok({ rows: arr.slice(opts.offset, opts.offset + opts.limit), total: arr.length });
    },
    // num_id ถัดไป — โหมด local เครื่องเดียว → max+1 ของสาขานั้นพอ (supabase ใช้ RPC atomic)
    nextNumId: (dealerCode) => {
      const mine = scopeByDealer(readKey<LeadRow[]>(SALES.leads, leadSeed), { dealerCode, isHQ: false });
      return ok(mine.reduce((m, l) => Math.max(m, l.numId), 0) + 1);
    },
    create: (row) => {
      const list = readKey<LeadRow[]>(SALES.leads, leadSeed);
      writeKey(SALES.leads, [row, ...list]);
      return ok(row);
    },
    // โหมดตัวอย่าง: ตรรกะเดียวกับฐาน (lib/leadIntent.ts ↔ ใบ 0211)
    apply: (id, intent) => {
      const list = readKey<LeadRow[]>(SALES.leads, leadSeed);
      const lead = list.find((l) => l.id === id);
      if (!lead) return Promise.reject(new Error("not_found: ไม่พบลูกค้าเป้าหมายนี้ (อาจถูกลบ หรือไม่มีสิทธิ์)"));
      try {
        const quotes = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
        const next = applyLeadIntent(lead, intent, { tpl: loadLeadTaskTemplate(), now: nowStampTH(),
          hasSentQuote: () => quotes.some((q) => q.status !== "draft" && (q.dealId === lead.numId || q.customer === lead.company)) });
        writeKey(SALES.leads, list.map((l) => (l.id === id ? next : l)));
        return ok(next);
      } catch (e) { return Promise.reject(e); }
    },
    remove: (id) => {
      const list = readKey<LeadRow[]>(SALES.leads, leadSeed);
      writeKey(SALES.leads, list.filter((l) => l.id !== id));
      return done();
    },
  },
  quotations: {
    list: (scope) => ok(scopeByDealer(readKey<QuotationMock[]>(SALES.quotations, quoteSeed), scope)),
    // หน้าเดียว + กรอง/เรียง (M9 Phase 2) — mirror ตรรกะ supabase เป๊ะ
    listPage: (scope, opts) => {
      const s = (opts.search ?? "").trim().toLowerCase();
      const dateOf = (q: QuotationMock) => /^(\d{4}-\d{2}-\d{2})/.exec(q.date || "")?.[1];
      const plOf = (q: QuotationMock) => (q.project ?? "").trim() || undefined; // ไม่ใช้ประเภทอาคาร (แม่แบบ) — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69
      let arr = scopeByDealer(readKey<QuotationMock[]>(SALES.quotations, quoteSeed), scope).filter(q => {
        if (opts.status && q.status !== opts.status) return false;
        if (opts.dealerCodes?.length && !opts.dealerCodes.includes(q.dealerCode ?? DEFAULT_DEALER_CODE)) return false;
        if (opts.productLines?.length) { const pl = plOf(q); if (pl === undefined || !opts.productLines.includes(pl)) return false; }
        const d = dateOf(q);
        if (opts.dateStart && (!d || d < opts.dateStart)) return false;
        if (opts.dateEnd && (!d || d > opts.dateEnd)) return false;
        if (s && !`${q.id} ${q.customer ?? ""}`.toLowerCase().includes(s) && !opts.searchDealers?.includes(q.dealerCode ?? DEFAULT_DEALER_CODE)) return false;
        return true;
      });
      const col = opts.sort?.col ?? "date", asc = (opts.sort?.dir ?? "desc") === "asc";
      arr = [...arr].sort((a, b) => {
        let c: number;
        if (col === "total_value") c = (a.totalValue ?? 0) - (b.totalValue ?? 0);
        // โหมดข้อมูลตัวอย่าง: savedAt = created_at · ใบตัวอย่างไม่มีค่านี้ → ใช้เลขที่ใบ (ออกเรียงกัน)
        else if (col === "created_at") c = String(a.savedAt ?? "").localeCompare(String(b.savedAt ?? "")) || String(a.id).localeCompare(String(b.id), "en", { numeric: true });
        else c = String((a as unknown as Record<string, unknown>)[col] ?? "").localeCompare(String((b as unknown as Record<string, unknown>)[col] ?? ""));
        c = asc ? c : -c;
        if (c === 0) return String(a.id).localeCompare(String(b.id)); // secondary = id "ขึ้นเสมอ" (ตรง supabase order("id"))
        return c;
      });
      return ok({ rows: arr.slice(opts.offset, opts.offset + opts.limit), total: arr.length });
    },
    // เซฟตี้เน็ตชั้นที่ 2 (mirror quotations_won_requires_customer, 0069/0071) — โหมด local ไม่มี DB
    // constraint คุมให้ ถ้าไม่เช็คตรงนี้ ฟอร์มแก้ไขทั่วไป (ที่ตอนนี้ตัดตัวเลือก "won" ออกแล้วก็จริง)
    // หรือโค้ดเส้นทางอื่นในอนาคตจะเขียน won โดยไม่มีลูกค้าผูกได้แบบเงียบๆ (พบจากผลตรวจสอบ 31 ก.ค. 69)
    update: (row) => {
      if (row.status === "won" && !((row.customerId ?? 0) > 0)) {
        return Promise.reject(new Error('ปิดการขายสำเร็จไม่ได้ — ใบนี้ยังไม่ได้ผูกกับลูกค้า (ใช้ปุ่ม "ลูกค้าตอบรับ ✓" แทน)'));
      }
      const list = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      writeKey(SALES.quotations, list.map((q) => (q.id === row.id ? row : q)));
      return ok(row);
    },
    remove: (id) => {
      const list = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      writeKey(SALES.quotations, list.filter((q) => q.id !== id));
      return done();
    },
    setStatus: (id, status) => {
      const list = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      if (status === "won" && !((list.find(q => q.id === id)?.customerId ?? 0) > 0)) {
        return Promise.reject(new Error('ปิดการขายสำเร็จไม่ได้ — ใบนี้ยังไม่ได้ผูกกับลูกค้า (ใช้ปุ่ม "ลูกค้าตอบรับ ✓" แทน)'));
      }
      writeKey(SALES.quotations, list.map((q) => (q.id === id ? { ...q, status } : q)));
      return done();
    },
    // เหมือน setStatus + reconcileWonTotal รวมกัน (0102) — เธรดเดียวในเบราว์เซอร์ไม่มี race จริงอยู่แล้ว
    // แต่คงพฤติกรรม/ลายเซ็นเดียวกับ Supabase ไว้เพื่อ parity
    setStatusReconciled: (id, status) => {
      const list = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const target = list.find(q => q.id === id);
      if (status === "won" && !((target?.customerId ?? 0) > 0)) {
        return Promise.reject(new Error('ปิดการขายสำเร็จไม่ได้ — ใบนี้ยังไม่ได้ผูกกับลูกค้า (ใช้ปุ่ม "ลูกค้าตอบรับ ✓" แทน)'));
      }
      const nextQuotes = list.map((q) => (q.id === id ? { ...q, status } : q));
      writeKey(SALES.quotations, nextQuotes);
      const updatedQuote = nextQuotes.find(q => q.id === id)!;
      let updatedCustomer: CustomerRow | null = null;
      if (updatedQuote.customerId && updatedQuote.customerId > 0) {
        const custs = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
        const wonTotal = nextQuotes.filter(q => q.customerId === updatedQuote.customerId && q.status === "won").reduce((s, q) => s + (q.totalValue ?? 0), 0);
        const nextCusts = custs.map(c => c.id === updatedQuote.customerId ? { ...c, totalValue: wonTotal } : c);
        writeKey(SALES.customers, nextCusts);
        updatedCustomer = nextCusts.find(c => c.id === updatedQuote.customerId) ?? null;
      }
      return Promise.resolve({ quotation: updatedQuote, customer: updatedCustomer });
    },
    // ปิดใบที่เลยวันหมดอายุ (โหมด local ทำกับชุดของสาขานั้น)
    //   "หมดอายุ" = expiry ที่กรอกเอง ถ้ามี · ไม่กรอก (ค่าเริ่มต้นฟอร์ม) = date + validityDays (นโยบาย HQ)
    //   เดิมอ่านแต่ expiry → ใบที่ไม่ได้กรอก expiry (ส่วนใหญ่) ไม่มีวันหมดอายุเองเลย ไม่ตรงกับที่ hq_alerts เตือน
    expireOverdue: (asOf, scope, validityDays = 30) => {
      const all = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      let n = 0;
      const next = all.map(q => {
        const mine = !scope || scope.isHQ || !scope.dealerCode || (q.dealerCode ?? DEFAULT_DEALER_CODE) === scope.dealerCode;
        const effectiveExpiry = effectiveExpiryOf(q, validityDays);
        const overdue = q.status === "sent_to_client" && !!effectiveExpiry && effectiveExpiry < asOf;
        if (mine && overdue) { n++; return { ...q, status: "expired" as const }; }
        return q;
      });
      if (n) writeKey(SALES.quotations, next);
      return ok(n);
    },
    salesperson: (quoteId, dealerCode) => {
      // เทียบ "สาขา + เลขที่" เหมือนฝั่ง supabase — เลขที่ใบซ้ำข้ามสาขาได้
      // และลูกค้าเป้าหมายที่นำมาเทียบต้องเป็นของสาขาเดียวกันด้วย ไม่งั้นได้ชื่อผู้รับผิดชอบผิดสาขา
      const same = (a?: string) => (a ?? DEFAULT_DEALER_CODE) === dealerCode;
      const q = readKey<QuotationMock[]>(SALES.quotations, quoteSeed).find(x => x.id === quoteId && same(x.dealerCode));
      if (!q) return ok(null);
      const ls = readKey<LeadRow[]>(SALES.leads, leadSeed).filter(l => same(l.dealerCode));
      const lead = ls.find(l => (q.dealId != null && l.numId === q.dealId) || ((q.customerId ?? 0) > 0 && l.customerId === q.customerId));
      return ok(lead?.assigned ?? null);
    },
    listForCustomer: (customerId, dealerCode) =>
      ok(readKey<QuotationMock[]>(SALES.quotations, quoteSeed).filter(q =>
        q.customerId === customerId && q.status === "won"
        && (q.dealerCode ?? DEFAULT_DEALER_CODE) === dealerCode)),
    // mirror relink_customer_quotes ฝั่ง supabase (0093) — เธรดเดียวในเบราว์เซอร์ = atomic โดยธรรมชาติ
    relinkCustomerQuotes: (dealer, customerId, company, cascadeWon) => {
      const list = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const relinked: QuotationMock[] = [];
      const next = list.map(q => {
        if ((q.dealerCode ?? DEFAULT_DEALER_CODE) === dealer && !(q.customerId > 0) && q.customer === company) {
          const carryWon = cascadeWon && q.status !== "lost" && q.status !== "expired";
          const nq = { ...q, customerId, status: carryWon ? ("won" as const) : q.status };
          relinked.push(nq);
          return nq;
        }
        return q;
      });
      writeKey(SALES.quotations, next);
      return ok(relinked);
    },
    // ออกเลข + insert (เธรดเดียวในเบราว์เซอร์ = atomic โดยธรรมชาติ ไม่มีเลขหาย)
    // รูปแบบ Q-{DealerCode}-{Year}-{Running} — ตัวนับนับแยกต่อสาขา (mirror ตัวนับต่อสาขาฝั่ง Supabase)
    // เดิมนับจากเลขสูงสุดที่เห็น "รวมทุกสาขา" ในเครื่อง — โหมด local ก็ต้องแยกสาขาเหมือนโหมดจริง (พบจากผลตรวจสอบ 31 ก.ค. 69)
    createNumbered: (dealer, prefix, row) => {
      const list = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const mine = list.filter((q) => (q.dealerCode ?? DEFAULT_DEALER_CODE) === dealer);
      const nums = mine.map((q) => { const m = q.id.match(/(\d+)\s*$/); return m ? parseInt(m[1]) : 0; });
      const year = String(new Date().getFullYear());
      const id = `${prefix || "Q-"}${dealer}-${year}-${String(Math.max(0, ...nums) + 1).padStart(4, "0")}`;
      const created = { ...row, id, dealerCode: dealer } as QuotationMock;
      writeKey(SALES.quotations, [created, ...list]);
      return ok(created);
    },
  },
  customers: {
    list: (scope) => ok(scopeByDealer(readKey<CustomerRow[]>(SALES.customers, initialCustomers), scope)),
    // หน้าเดียว + ค้นหา (M9 Phase 5) — mirror ตรรกะ supabase
    listPage: (scope, opts) => {
      const s = (opts.search ?? "").trim().toLowerCase();
      let arr = scopeByDealer(readKey<CustomerRow[]>(SALES.customers, initialCustomers), scope).filter(c => {
        if (opts.dealerCodes?.length && !opts.dealerCodes.includes(c.dealerCode ?? DEFAULT_DEALER_CODE)) return false;
        if (s && !`${c.name ?? ""} ${c.company ?? ""} ${c.province ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(s)) return false;
        return true;
      });
      arr = [...arr].sort((a, b) => a.id - b.id);
      return ok({ rows: arr.slice(opts.offset, opts.offset + opts.limit), total: arr.length });
    },
    // โหมด local มีผู้ใช้คนเดียวต่อเครื่อง → max+1 พอ (โหมด supabase ใช้ RPC atomic)
    nextId: (dealerCode) => {
      const mine = scopeByDealer(readKey<CustomerRow[]>(SALES.customers, initialCustomers), { dealerCode, isHQ: false });
      return ok(mine.reduce((m, c) => Math.max(m, c.id), 0) + 1);
    },
    create: (row) => {
      const list = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      writeKey(SALES.customers, [row, ...list]);
      return ok(row);
    },
    update: (row) => {
      const list = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      writeKey(SALES.customers, list.map((c) => (c.id === row.id ? row : c)));
      return ok(row);
    },
    remove: (id) => {
      const list = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      writeKey(SALES.customers, list.filter((c) => c.id !== id));
      return done();
    },
    // โหมด local มีผู้ใช้คนเดียวต่อเครื่อง → เช็ก+สร้างตรงนี้พอ (ไม่มี race ข้าม session จริงแบบ supabase)
    upsertForCompany: (dealerCode, row) => {
      const list = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      const mine = scopeByDealer(list, { dealerCode, isHQ: false });
      const ek = exactKey(row.company);
      const existing = mine.find((c) => exactKey(c.company) === ek);
      if (existing) return ok(existing);
      writeKey(SALES.customers, [row, ...list]);
      return ok(row);
    },
    // โหมด local เครื่องเดียว → คำนวณจากอาร์เรย์ในเครื่องตรง ๆ พอ (ไม่มี race ข้าม session จริงแบบ supabase)
    reconcileWonTotal: (customerId) => {
      const custs = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      const quotes = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const wonTotal = quotes.filter(q => q.customerId === customerId && q.status === "won").reduce((s, q) => s + (q.totalValue ?? 0), 0);
      const next = custs.map(c => c.id === customerId ? { ...c, totalValue: wonTotal } : c);
      writeKey(SALES.customers, next);
      const updated = next.find(c => c.id === customerId);
      if (!updated) throw new Error(`customer ${customerId} not found`);
      return ok(updated);
    },
    // mirror close_won_quotation ฝั่ง supabase (0094) — เธรดเดียวในเบราว์เซอร์ = ไม่มี partial-write จริง
    // อยู่แล้ว แต่เขียนให้ตรรกะตรงกันเป๊ะเพื่อพฤติกรรม Local/Supabase ไม่เพี้ยนกัน (M9 parity)
    closeWon: (args) => {
      const { dealer, knownCustomerId, leadCompany, targetQuoteId, cascadeWon, customerPayload } = args;
      const custList = readKey<CustomerRow[]>(SALES.customers, initialCustomers);
      let cust = knownCustomerId != null ? custList.find(c => c.id === knownCustomerId) : undefined;
      if (!cust) {
        const mine = scopeByDealer(custList, { dealerCode: dealer, isHQ: false });
        const ek = exactKey(customerPayload.company);
        cust = mine.find(c => exactKey(c.company) === ek);
        if (!cust) {
          cust = customerPayload;
          writeKey(SALES.customers, [cust, ...custList]);
        }
      }
      const custId = cust.id;
      const qList = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const nextQ = qList.map(q => {
        if ((q.dealerCode ?? DEFAULT_DEALER_CODE) === dealer && !(q.customerId > 0) && q.customer === leadCompany) {
          const carryWon = cascadeWon && q.status !== "lost" && q.status !== "expired";
          return { ...q, customerId: custId, status: carryWon ? ("won" as const) : q.status };
        }
        if (targetQuoteId && q.id === targetQuoteId) {
          return { ...q, customerId: custId, status: "won" as const };
        }
        return q;
      });
      writeKey(SALES.quotations, nextQ);
      const wonTotal = nextQ.filter(q => q.customerId === custId && q.status === "won").reduce((s, q) => s + (q.totalValue ?? 0), 0);
      const finalCustList = readKey<CustomerRow[]>(SALES.customers, initialCustomers).map(c => c.id === custId ? { ...c, totalValue: wonTotal } : c);
      writeKey(SALES.customers, finalCustList);
      const updated = finalCustList.find(c => c.id === custId);
      if (!updated) throw new Error(`customer ${custId} not found`);
      // ใบที่เกี่ยวข้องทั้งหมด — mirror เงื่อนไขเดียวกับฝั่ง supabase (ตรงชื่อบริษัท หรือคือใบเป้าหมาย)
      const related = nextQ.filter(q => q.customerId === custId && (q.customer === leadCompany || q.id === targetQuoteId));
      return ok({ customer: updated, quotations: related });
    },
    // ลบลูกค้าพร้อมประวัติ — เธรดเดียวจึง atomic โดยธรรมชาติ · เงื่อนไขต้องตรงกับ RPC ฝั่ง supabase (0141) เป๊ะ
    deleteCascade: (id) => {
      const leads = readKey<LeadRow[]>(SALES.leads, leadSeed);
      const linked = leads.filter(l => l.customerId === id);
      const active = linked.filter(l => !isClosedDeal(l.status));
      if (active.length) throw new Error(`ลบลูกค้าไม่ได้ — ยังมีดีลที่ขายอยู่ ${active.length} รายการ`);

      const closedIds = new Set(linked.map(l => l.numId).filter((n): n is number => n != null));
      const quotes = readKey<QuotationMock[]>(SALES.quotations, quoteSeed);
      const goneQuotes = quotes.filter(q => (q.customerId > 0 && q.customerId === id) || (q.dealId != null && closedIds.has(q.dealId)));
      const allFiles = loadDealerFiles();
      const goneFiles = allFiles.filter(f =>
        (f.source === "customer" && (f.recordId === id || f.customerId === id))
        || (f.source === "lead" && f.recordId != null && closedIds.has(f.recordId)));

      const goneQuoteIds = new Set(goneQuotes.map(q => q.id));
      const goneFileIds = new Set(goneFiles.map(f => f.id));
      writeKey(SALES.quotations, quotes.filter(q => !goneQuoteIds.has(q.id)));
      writeKey(SALES.leads, leads.filter(l => l.customerId !== id));
      saveDealerFiles(allFiles.filter(f => !goneFileIds.has(f.id)));
      writeKey(SALES.customers, readKey<CustomerRow[]>(SALES.customers, initialCustomers).filter(c => c.id !== id));

      return ok({
        quotations: goneQuotes.length,
        leads: linked.length,
        storagePaths: goneFiles.map(f => f.storagePath).filter((p): p is string => !!p),
      });
    },
  },
  appointments: {
    list: (scope) => ok(scopeByDealer(readKey<AppointmentMock[]>(SALES.appointments, apptSeed), scope)),
    listForDealer: (dealerCode) => ok(readKey<AppointmentMock[]>(SALES.appointments, apptSeed).filter(a => (a.dealerCode ?? DEFAULT_DEALER_CODE) === dealerCode)),
    listForLead: (leadId, dealerCode) => ok(readKey<AppointmentMock[]>(SALES.appointments, apptSeed)
      .filter(a => a.leadId === leadId && (a.dealerCode ?? DEFAULT_DEALER_CODE) === dealerCode)),
    nextId: (dealerCode) => {
      const mine = scopeByDealer(readKey<AppointmentMock[]>(SALES.appointments, apptSeed), { dealerCode, isHQ: false });
      return ok(mine.reduce((m, a) => Math.max(m, a.id), 0) + 1);
    },
    create: (row) => {
      const list = readKey<AppointmentMock[]>(SALES.appointments, apptSeed);
      writeKey(SALES.appointments, [row, ...list]);
      return ok(row);
    },
    update: (row) => {
      const list = readKey<AppointmentMock[]>(SALES.appointments, apptSeed);
      writeKey(SALES.appointments, list.map((a) => (a.id === row.id ? row : a)));
      return ok(row);
    },
    remove: (id) => {
      const list = readKey<AppointmentMock[]>(SALES.appointments, apptSeed);
      writeKey(SALES.appointments, list.filter((a) => a.id !== id));
      return done();
    },
  },
};
