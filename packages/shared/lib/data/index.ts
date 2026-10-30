// Data Layer — จุดเข้าเดียวของทุกการอ่าน/เขียนข้อมูล
//
// กติกา: หน้า/component ห้ามเรียก localStorage หรือ import mock.ts ตรง ๆ อีก
//         ให้เรียกผ่าน repository เหล่านี้เท่านั้น → สลับ backend ได้ด้วย ENV ตัวเดียว
//
//   import { dealers, leads, audit } from "@pms/shared/lib/data";
//   const rows = await dealers.list();
//
// สถานะ (18 ส.ค. 69): ครบทั้งสามเส้นทาง — LocalAdapter (เดโม) · SupabaseAdapter (ที่ใช้จริงตอนนี้)
//   · HttpAdapter (ผ่าน backend ของเราเอง · ย้ายครบ 18 พอร์ตแล้ว รอสลับใช้จริง)
import { DATA_SOURCE } from "./config";
import { LocalAdapter } from "./local/LocalAdapter";
import { SupabaseAdapter } from "./supabase/SupabaseAdapter";
import { HttpAdapter } from "./http/HttpAdapter";
import { dedupeRead, ttlCacheRead, invalidateCache } from "./dedupe";

// TTL ของแคชข้อมูลอ้างอิง (ทะเบียนดีลเลอร์/แคตตาล็อก/กฎธุรกิจ/ผู้รับผิดชอบ) — สั้นพอที่ผู้ใช้จะไม่รู้สึกว่า
// ข้อมูลค้าง (แก้เองก็ invalidate ทันทีอยู่แล้ว) ยาวพอที่จะตัดคำขอซ้ำตอนสลับหน้าไปมาเร็ว ๆ
const REF_TTL_MS = 30_000;
import type { DataAdapter, DealersRepo, SettingsRepo, MetricsRepo, PersonsRepo, DealerSettingsRepo, AuditRepo, NotificationsRepo, ProfileRepo, LeadsRepo, QuotationsRepo, CustomersRepo } from "./ports";

// "api" = คุยผ่าน backend ของเราเอง (ครบทุกพอร์ตแล้ว · ดู http/HttpAdapter.ts และ docs/BACKEND-MIGRATION.md)
const adapter: DataAdapter =
  DATA_SOURCE === "supabase" ? SupabaseAdapter
  : DATA_SOURCE === "api" ? HttpAdapter
  : LocalAdapter;

export const storage = adapter.storage;   // ไฟล์จริง (bytes) — local: no-op · supabase: Storage
export const realtime = adapter.realtime; // ฟังการเปลี่ยนแปลงสด — local: no-op · supabase: postgres_changes

// ── H7 · รวมคำขออ่านที่ไม่มีพารามิเตอร์ ให้ยิงจริงครั้งเดียวเมื่อเกิดพร้อมกัน (in-flight dedup) ──
// จุดเดียวครอบทุก caller · เฉพาะ read ที่ "ไม่มี arg" (การเขียน/read ที่มี scope ไม่แตะ · ดู dedupe.ts)
// เดิม dedupeRead อย่างเดียว (รวมแค่คำขอที่ค้างพร้อมกัน) — ยังยิงซ้ำทุกครั้งที่เปลี่ยนหน้าเพราะคำขอ
// ก่อนหน้า "settle" ไปแล้วเสมอกว่าจะเปิดหน้าถัดไป ตอนนี้ใช้ ttlCacheRead แทน (แคชจริง 30s) + invalidate
// ทันทีที่มีการเขียน ให้ผู้ใช้เห็นข้อมูลใหม่ทันทีแม้ยังไม่ครบ TTL (พบจากผลตรวจสอบระบบรอบ 2, 31 ก.ค. 69)
const _dealers = adapter.dealers, _settings = adapter.settings;
export const dealers: DealersRepo = {
  ..._dealers,
  list: () => ttlCacheRead("dealers.list", () => _dealers.list(), REF_TTL_MS),
  save: async (all) => { await _dealers.save(all); invalidateCache("dealers.list"); },
  remove: async (code) => { await _dealers.remove(code); invalidateCache("dealers.list"); },
};
export const settings: SettingsRepo = {
  ..._settings,
  getPolicy:            () => ttlCacheRead("settings.getPolicy", () => _settings.getPolicy(), REF_TTL_MS),
  getTargets:           () => ttlCacheRead("settings.getTargets", () => _settings.getTargets(), REF_TTL_MS),
  getNotifRules:        () => ttlCacheRead("settings.getNotifRules", () => _settings.getNotifRules(), REF_TTL_MS),
  getLeadRulesMap:      () => ttlCacheRead("settings.getLeadRulesMap", () => _settings.getLeadRulesMap(), REF_TTL_MS),
  getQuoteValidityDays: () => ttlCacheRead("settings.getQuoteValidityDays", () => _settings.getQuoteValidityDays(), REF_TTL_MS),
  getLostReasons:       () => ttlCacheRead("settings.getLostReasons", () => _settings.getLostReasons(), REF_TTL_MS),
  getLeadTasks:         () => ttlCacheRead("settings.getLeadTasks", () => _settings.getLeadTasks(), REF_TTL_MS),
  saveLeadTasks:        async (tasks) => { await _settings.saveLeadTasks(tasks); invalidateCache("settings.getLeadTasks"); },
  saveLeadRules:        async (dealerCode, rules) => { await _settings.saveLeadRules(dealerCode, rules); invalidateCache("settings.getLeadRulesMap"); },
  saveLostReasons:      async (lost) => { await _settings.saveLostReasons(lost); invalidateCache("settings.getLostReasons"); },
  getRecruitSettings:   () => ttlCacheRead("settings.getRecruitSettings", () => _settings.getRecruitSettings(), REF_TTL_MS),
  saveRecruitSettings:  async (s) => { await _settings.saveRecruitSettings(s); invalidateCache("settings.getRecruitSettings"); },
  savePolicy:           async (policy) => { await _settings.savePolicy(policy); invalidateCache("settings.getPolicy"); },
  saveTargets:          async (targets) => { await _settings.saveTargets(targets); invalidateCache("settings.getTargets"); },
  saveNotifRules:       async (rules) => { await _settings.saveNotifRules(rules); invalidateCache("settings.getNotifRules"); },
};
export const files = adapter.files;
// Sidebar + Topbar (ทั้งสองคอมโพเนนต์อยู่ยาวทุกหน้า) ต่างเรียก persons/dealerSettings/audit เองอิสระ
// ไม่มีจุดแชร์ผล → เปิดหน้าเดียวยิงซ้ำ 2-6 รอบ (พบจากผลตรวจสอบระบบ 30 ก.ค. 69) · แพตเทิร์นเดียวกับ H7 ข้างบน
const _persons = adapter.persons, _dealerSettings = adapter.dealerSettings, _audit = adapter.audit;
export const persons: PersonsRepo = {
  ..._persons,
  list: (scope) => ttlCacheRead(`persons.list:${JSON.stringify(scope ?? null)}`, () => _persons.list(scope), REF_TTL_MS),
  save: async (all, dealerCode) => {
    await _persons.save(all, dealerCode);
    // ไม่รู้ scope object เป๊ะที่ผู้เรียกอื่นใช้ตอน list() (isHQ ต่างกัน) — ล้างทั้งแคชปลอดภัยกว่า
    invalidateCache();
  },
};
export const dealerSettings: DealerSettingsRepo = {
  ..._dealerSettings,
  get: (dealerCode) => ttlCacheRead(`dealerSettings.get:${dealerCode}`, () => _dealerSettings.get(dealerCode), REF_TTL_MS),
  save: async (dealerCode, patch) => { await _dealerSettings.save(dealerCode, patch); invalidateCache(`dealerSettings.get:${dealerCode}`); },
};
// Sidebar + Topbar เรียก useUserProfile() แยกอิสระคนละอินสแตนซ์ → profile.get() ยิงซ้ำพร้อมกันทุกครั้งที่
// session เปลี่ยน (ล็อกอิน/รีเฟรชหน้า) — พบจากผลตรวจสอบระบบ 30 ก.ค. 69 (High) · แพตเทิร์นเดียวกับ H7 ข้างบน
const _profile = adapter.profile;
export const profile: ProfileRepo = {
  ..._profile,
  get: () => dedupeRead("profile.get", () => _profile.get()),
};
export const hqCompany = adapter.hqCompany;
export const territories = adapter.territories;
export const quoteRequests = adapter.quoteRequests;
// แม่แบบวัสดุ (ใบ 0244) — หน้าตั้งค่า HQ + ฟอร์มขอราคา + ใบ HQ · ต้องสดหลังบันทึก ไม่แคช
export const materialTemplates = adapter.materialTemplates;
export const notes = adapter.notes;
// ลูกค้าเป้าหมายของสำนักงานใหญ่ (ผู้สนใจเป็นดีลเลอร์) — หน้าเดียวใช้ ไม่ต้องแคช
export const prospects = adapter.prospects;
// ใบค่าแฟรนไชส์ — ใช้ในหน้าต่างรายละเอียดลูกค้าเป้าหมาย HQ เท่านั้น ไม่ต้องแคช
export const proposals = adapter.proposals;
// ประวัติ + บันทึกการติดต่อ ของลูกค้าเป้าหมาย HQ — ต้องสดเสมอหลังบันทึก ไม่ต้องแคช
export const prospectActivities = adapter.prospectActivities;
export const users = adapter.users;
// บัญชีเข้าระบบของดีลเลอร์ (แก้อีเมล/รหัสผ่านเอง · โควตา 2 ครั้ง · เกินนั้นขออนุมัติ)
export const account = adapter.account;
// แจ้งเตือน (ใบ 0231) — กระดิ่งของ Topbar อยู่ทุกหน้า · รวมคำขอที่ยิงพร้อมกัน
const _notifications = adapter.notifications;
export const notifications: NotificationsRepo = {
  list: (limit) => dedupeRead(`notifications.list:${limit ?? ""}`, () => _notifications.list(limit)),
};
export const audit: AuditRepo = {
  ..._audit,
  list: (limit) => dedupeRead(`audit.list:${limit ?? ""}`, () => _audit.list(limit)),
};
// rollup รายสาขา (M9 Phase 1) — dedup ตามปี: หลาย component (แดชบอร์ด/แจ้งเตือน/กระดิ่ง) ขอปีเดียวกันพร้อมกัน ยิงจริงครั้งเดียว
const _metrics = adapter.metrics;
export const metrics: MetricsRepo = {
  dealerRollup: (year, opts) => dedupeRead(`metrics.dealerRollup:${year}:${opts ? JSON.stringify(opts) : ""}`, () => _metrics.dealerRollup(year, opts)),
  leadSummary: (f) => dedupeRead(`metrics.leadSummary:${JSON.stringify(f)}`, () => _metrics.leadSummary(f)),
  networkQuoteRange: (start, end, dealer) =>
    dedupeRead(`metrics.networkQuoteRange:${start}:${end}:${dealer ?? ""}`, () => _metrics.networkQuoteRange(start, end, dealer)),
  dashboardQuoteSummary: (start, end, dealer) =>
    dedupeRead(`metrics.dashboardQuoteSummary:${start}:${end}:${dealer ?? ""}`, () => _metrics.dashboardQuoteSummary(start, end, dealer)),
  hqQuotationsSummary: (f) =>
    dedupeRead(`metrics.hqQuotationsSummary:${JSON.stringify(f)}`, () => _metrics.hqQuotationsSummary(f)),
  // ⚠️ คีย์ต้องมีตัวกรองด้วย ไม่งั้นตัวกันยิงซ้ำจะคืน "ผลของตัวกรองก่อนหน้า" ให้คำขอที่กรองคนละแบบ
  networkCustomerSummary: (f) =>
    dedupeRead(`metrics.networkCustomerSummary:${JSON.stringify(f ?? {})}`, () => _metrics.networkCustomerSummary(f)),
  unassignedLeads: (f) => dedupeRead(`metrics.unassignedLeads:${JSON.stringify(f)}`, () => _metrics.unassignedLeads(f)),
  hqAlerts: (f) => dedupeRead(`metrics.hqAlerts:${JSON.stringify(f)}`, () => _metrics.hqAlerts(f)),
  hqCustomersPage: (opts) => dedupeRead(`metrics.hqCustomersPage:${JSON.stringify(opts)}`, () => _metrics.hqCustomersPage(opts)),
  hqCustomersFilterOptions: () => dedupeRead("metrics.hqCustomersFilterOptions", () => _metrics.hqCustomersFilterOptions()),
  hqOverview: () => dedupeRead("metrics.hqOverview", () => _metrics.hqOverview()),
  hqPipelineDealers: (start, end, dealers, today) => dedupeRead(`metrics.hqPipelineDealers:${start}:${end}:${JSON.stringify(dealers)}:${today ?? ""}`, () => _metrics.hqPipelineDealers(start, end, dealers, today)),
  kpiCards: (page, start, end, dealer, today, filters) => dedupeRead(`metrics.kpiCards:${page}:${start ?? ""}:${end ?? ""}:${dealer ?? ""}:${today ?? ""}:${JSON.stringify(filters ?? null)}`, () => _metrics.kpiCards(page, start, end, dealer, today, filters)),
  hqDashboard: (start, end, dealer, today) => dedupeRead(`metrics.hqDashboard:${start}:${end}:${dealer ?? ""}:${today ?? ""}`, () => _metrics.hqDashboard(start, end, dealer, today)),
};
// ── นับยอดรวมของตารางแบ่งหน้า "ครั้งเดียวต่อชุดตัวกรอง" แล้วใช้ซ้ำตอนกดเปลี่ยนหน้า ──
//
// วัดจริง 27 ส.ค. 69 ที่ข้อมูล 20,000 ลูกค้าเป้าหมาย:
//   อ่านข้อมูล 20 แถวที่จะแสดง ~0.2 วินาที · นับยอดรวมแบบเป๊ะ ~2 วินาที
//   เพราะการนับต้องไล่ตรวจสิทธิ์ครบทุกแถวในตาราง ส่วนการอ่านแตะแค่ 20 แถว
// ตัวกรองเท่าเดิม จำนวนรวมย่อมเท่าเดิม — การนับใหม่ทุกครั้งที่กดหน้าถัดไปจึงเป็นงานเปล่า
//
// ⚠️ ต้องล้างทันทีที่มีการเขียน ไม่งั้นสร้าง/ลบแล้วเลขรวมค้างของเก่า (เห็นชัดตอนสร้างรายการแรกของตัวกรอง)
// ⚠️ อายุสั้น (60 วินาที) — คนอื่นเพิ่มข้อมูลระหว่างนั้น เลขรวมอาจคลาดไปชั่วคราวแล้วถูกต้องเองรอบถัดไป
const TOTAL_TTL_MS = 60_000;
const ยอดรวมที่นับไว้ = new Map<string, { total: number; at: number }>();
const ล้างยอดรวม = (prefix: string) => {
  for (const k of [...ยอดรวมที่นับไว้.keys()]) if (k.startsWith(prefix)) ยอดรวมที่นับไว้.delete(k);
};
type มีจำนวนรวม = { total: number };
type ตัวเลือกหน้า = { limit: number; offset: number; knownTotal?: number };
function จำยอดรวม<S, O extends ตัวเลือกหน้า, R extends มีจำนวนรวม>(
  ชื่อ: string, เดิม: (scope: S, opts: O) => Promise<R>,
): (scope: S, opts: O) => Promise<R> {
  return async (scope, opts) => {
    const { limit: _l, offset: _o, knownTotal: _k, ...ตัวกรอง } = opts;
    const key = `${ชื่อ}:${JSON.stringify(scope ?? {})}:${JSON.stringify(ตัวกรอง)}`;
    const เก่า = ยอดรวมที่นับไว้.get(key);
    const ใช้ได้ = เก่า && Date.now() - เก่า.at < TOTAL_TTL_MS;
    const res = await เดิม(scope, ใช้ได้ ? { ...opts, knownTotal: เก่า.total } : opts);
    if (!ใช้ได้) ยอดรวมที่นับไว้.set(key, { total: res.total, at: Date.now() });
    return res;
  };
}
const _leads = adapter.leads, _quotations = adapter.quotations, _customers = adapter.customers;
const ล้างเมื่อเขียน = <T extends unknown[], R>(prefix: string, fn: (...a: T) => Promise<R>) =>
  async (...a: T): Promise<R> => { const r = await fn(...a); ล้างยอดรวม(prefix); return r; };

export const leads: LeadsRepo = {
  ..._leads,
  listPage: จำยอดรวม("leads.page", _leads.listPage.bind(_leads)),
  create: ล้างเมื่อเขียน("leads.page", _leads.create.bind(_leads)),
  apply: ล้างเมื่อเขียน("leads.page", _leads.apply.bind(_leads)),
  remove: ล้างเมื่อเขียน("leads.page", _leads.remove.bind(_leads)),
};
export const quotations: QuotationsRepo = {
  ..._quotations,
  listPage: จำยอดรวม("quotations.page", _quotations.listPage.bind(_quotations)),
  update: ล้างเมื่อเขียน("quotations.page", _quotations.update.bind(_quotations)),
  remove: ล้างเมื่อเขียน("quotations.page", _quotations.remove.bind(_quotations)),
  setStatus: ล้างเมื่อเขียน("quotations.page", _quotations.setStatus.bind(_quotations)),
};
export const customers: CustomersRepo = {
  ..._customers,
  listPage: จำยอดรวม("customers.page", _customers.listPage.bind(_customers)),
  create: ล้างเมื่อเขียน("customers.page", _customers.create.bind(_customers)),
  update: ล้างเมื่อเขียน("customers.page", _customers.update.bind(_customers)),
  remove: ล้างเมื่อเขียน("customers.page", _customers.remove.bind(_customers)),
};
export const appointments = adapter.appointments;

export type {
  DataAdapter, StoragePort, DealersRepo, FilesRepo, PersonsRepo,
  SettingsRepo, AuditRepo, NotificationsRepo, MetricsRepo, DealerRollup, LeadsRepo, QuotationsRepo, CustomersRepo, AppointmentsRepo,
} from "./ports";
export type { Scope } from "./types";
