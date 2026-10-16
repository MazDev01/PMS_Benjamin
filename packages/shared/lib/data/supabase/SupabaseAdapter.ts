"use client";

// SupabaseAdapter — เชื่อม repository ทุกตัวเข้ากับตาราง Supabase (เฟส B)
// map ตาราง ↔ type ตาม BACKEND-DESIGN.md · ขอบเขตข้อมูล (dealer_code) บังคับด้วย RLS ที่ DB
// แปลง snake_case (DB) ↔ camelCase (type) ด้วย mappers.ts
import { leadIntentToWire } from "@pms/shared/lib/leadIntent";
import { เตรียมบันทึกใบ } from "@pms/shared/lib/dealerProposals";
import type { DealerPackageProposal, DealerProposalPayment } from "@pms/shared/lib/data/types";
import { จัดรูปภาพรวมHQ } from "@pms/shared/lib/hqOverview";
import { เตรียมบันทึก } from "@pms/shared/lib/dealerProspects";
import type { DealerProspect, ProspectActivity } from "@pms/shared/lib/data/types";
import { เตรียมบันทึกการติดต่อ } from "@pms/shared/lib/prospectJourney";
import { รวมค่าตั้งหาดีลเลอร์ } from "@pms/shared/lib/recruitSettings";
import { accountRemote } from "../accountRemote";
import type { QuoteRequest, HqQuote, QuoteMargin } from "../../quoteRequests";
import { getSupabase, hasStoredSession } from "./client";
import { toCamel, toCamelList, toSnake, toSnakeList } from "./mappers";
import { normalizeCustomer, normalizeDealer, leadToRow, rowToLead, quoteToRow, rowToQuote, apptToRow, rowToAppt } from "./rowMappers";
import { DEFAULT_HQ_POLICY, DEFAULT_HQ_TARGETS, DEFAULT_HQ_NOTIF_RULES, รวมกฎแจ้งเตือน, DEFAULT_LEAD_RULES, LOST_REASONS,
  LEAD_TASK_TEMPLATE, normalizeLeadTaskTemplate,
  DEFAULT_ISSUER, DEFAULT_NOTIF_PREFS } from "@pms/shared/lib/mock";
import { DEFAULT_DOC } from "@pms/shared/lib/quotationPrint";
import { APP_NOW, APP_NOW_ISO } from "@pms/shared/context/FilterContext";
import { captureError } from "@pms/shared/lib/observability";
import { DbError } from "@pms/shared/lib/friendlyError";
import { reportPartialData } from "@pms/shared/lib/repoLog";
import type { DataAdapter, DealerRollup, QuoteRangeRow } from "../ports";
import type { SalesTable, SalesChange } from "../ports";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { วันเวลาไทย } from "@pms/shared/lib/thaiDate";
import type {
  DealerRow, DealerFile, ResponsiblePerson,
  HQPolicy, HQTargets, HQNotifRules, DealerLeadRulesMap, LeadRules,
  AuditEntry, QuotationMock, CustomerRow, Scope,
  DealerSettings, UserProfile, HQCompany, CustomerNote, SystemUser,
} from "../types";

const EMPTY_HQ_COMPANY: HQCompany = { name: "", address: "", taxId: "", phone: "", email: "", website: "" };

// ── ด่านสุดท้ายกันคำขอที่ยิงตอนยังไม่ล็อกอิน (7 ส.ค. 69) ──────────────────────────
// AuthGuard กันไว้ชั้นแรกแล้ว (ไม่เรนเดอร์หน้าที่ต้องล็อกอิน) แต่ยังมีช่วงสั้น ๆ ระหว่างที่แอป
// กำลังกู้เซสชันอยู่ ซึ่งคอมโพเนนต์ที่อยู่ยาว (แถบบน/เมนูข้าง) เริ่มขอข้อมูลไปแล้ว
// คำขอช่วงนั้นถูกฐานข้อมูลปฏิเสธ 100% (401) จึงไม่มีเหตุผลให้ยิงออกไป — หยุดตั้งแต่ที่นี่
// ⚠️ ไม่ใช่การ "เปิดสิทธิ์ให้ผ่าน" — สิทธิ์ฝั่งฐานข้อมูลยังเข้มเท่าเดิมทุกประการ
const NO_SESSION = "ยังไม่ได้เข้าสู่ระบบ";
const sb = () => {
  if (!hasStoredSession()) throw new DbError(NO_SESSION, "no-session");
  return getSupabase();
};
/** คำขอที่ถูกหยุดเพราะยังไม่ล็อกอิน — ไม่ใช่ความผิดพลาด ไม่ต้องตะโกนใส่ผู้ใช้ */
export function isNoSessionError(e: unknown): boolean {
  return e instanceof DbError && e.code === "no-session";
}
type Row = Record<string, unknown>;

// at (timestamptz ISO) → "30 มิ.ย. 2569 · 09:22" (รูปแบบเดียวกับ stampNow ใน useAudit ที่ parseDate อ่านได้)
// เวลาไทยเสมอ ไม่ขึ้นกับโซนเวลาของเครื่องที่เปิดดู (ดู วันเวลาไทย ใน thaiDate.ts)
function fmtAuditAt(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : วันเวลาไทย(d);
}

// PostgREST คืนสูงสุดต่อคำขอ (ค่าเริ่มต้น 1,000 แถว) — ถ้าไม่ไล่ทีละหน้า ข้อมูลจะถูก "ตัดเงียบ ๆ"
// ผู้ใช้เห็นแค่ 1,000 แถวแรกโดยไม่มีคำเตือน (C2)
const PAGE_ROWS = 1000;
type RowsResult = { data: unknown[] | null; error: { message: string } | null };

// ไล่ดึงทุกหน้าจนครบ · ต้องมี ORDER ที่เสถียรเสมอ ไม่งั้นแบ่งหน้าแล้วแถวซ้ำ/ตกหล่นได้
// (Postgres ไม่รับประกันลำดับถ้าไม่ระบุ order)
//
// ── "เสถียร" ต้องหมายถึง "ไม่มีทางเสมอกันได้เลย" ── (ผลตรวจสอบระบบรอบ 2 · Part 8)
// เลขที่ของงานขาย (customers.id · leads.num_id · quotations.id · appointments.id) เดินแยกกันรายสาขา
// คีย์จริงคือ dealer_code + id — เลข 1 ของระยองกับเลข 1 ของเชียงใหม่คนละรายกันแต่ค่าเท่ากัน
// ฝั่งดีลเลอร์ไม่มีปัญหา (กรองสาขาเดียวอยู่แล้ว) แต่ฝั่งสำนักงานใหญ่ที่ดูรวมทั้งเครือ เลขจะซ้ำกันเป็นแถบ
// พอสั่งเรียงด้วย id เฉย ๆ แล้วตัดหน้า แถวที่ "เสมอกัน" จะถูกจัดหน้าตามใจฐานข้อมูล ไม่รับประกันว่าซ้ำเดิม
// ผลคือรายการเดียวกันโผล่สองหน้า หรือหายไปเลย โดยไม่มีอะไรฟ้อง
// จึงต้องพ่วง dealer_code เป็นตัวตัดสินท้ายสุดทุกครั้ง — ฝั่งดีลเลอร์ไม่มีผลอะไร (มีสาขาเดียว)
const TIEBREAK_COL = "dealer_code";

// คอลัมน์ที่รายการลูกค้าเป้าหมายต้องใช้จริง (เว้น report และ activities)
//   activities (ไทม์ไลน์) กินขนส่งมากแต่ตารางใช้แค่ "วันติดต่อล่าสุด"
//   ซึ่งฐานข้อมูลคำนวณไว้ให้แล้วที่ last_contact_at (trigger 0046) — ดึงคอลัมน์เดียวแทนทั้งก้อน
//   report เป็นข้อความยาวที่ใช้เฉพาะในแผงรายละเอียด ดึงมาทั้งชุดคือค่าขนส่งเปล่าๆ
//   ⚠ เพิ่มคอลัมน์ใหม่ในตาราง leads ต้องเติมชื่อที่นี่ด้วย ไม่งั้นหน้าจอจะไม่เห็นค่านั้นเลย
const LEAD_LIST_COLS = "id,dealer_code,num_id,name,company,contact,phone,email,province,address,product,category,status,value,area,assigned,source,note,customer_id,lost_reason,tasks,logo,project,created_at,created_label,last_contact_at";

// ── กันเบราว์เซอร์ค้าง (M8) ──
// pageAll วนดึงทีละ PAGE_ROWS จน "หมดตาราง" — ที่สเกลใหญ่ (หลายแสนแถว) โหลดทั้งก้อนเข้าหน่วยความจำ
// = แท็บค้าง/ตาย · ใส่เพดานแข็ง: เกินแล้ว "หยุด + เตือนดังในคอนโซล" (ไม่เงียบ) แทนที่จะค้างจนตาย
// การแก้จริงที่สเกลนั้นคือ server-side paging/aggregate (M8 เต็ม/M9) ไม่ใช่ดันเพดานนี้ให้สูงขึ้น
const PAGE_HARD_CAP = 50000;
async function pageAll(run: (from: number, to: number) => PromiseLike<RowsResult>, label = "table"): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await run(from, from + PAGE_ROWS - 1);
    if (error) throw new DbError(error.message, (error as { code?: string }).code);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE_ROWS) break;
    if (out.length >= PAGE_HARD_CAP) {
      // ต้องบอกผู้ใช้บนหน้าจอด้วย ไม่ใช่เตือนแค่ใน console ที่ไม่มีใครเห็น (L-1)
      // ข้อมูลขาดแบบเงียบ ๆ อันตรายกว่าโหลดพังไปเลย — เพราะหน้าจอดูปกติทุกอย่าง
      reportPartialData(`ข้อมูลที่แสดงไม่ครบ — "${label}" มีเกิน ${PAGE_HARD_CAP.toLocaleString()} รายการ ระบบหยุดโหลดเพื่อไม่ให้หน้าจอค้าง กรุณาใช้ตัวกรองช่วยแคบผลลัพธ์`);
      break;
    }
  }
  return out;
}

// ── listPage ที่ผู้เรียกขอ limit ก้อนใหญ่ (เช่น drawer/dealer-detail ขอ "เกือบทั้งหมดของสาขา" limit=5000) ──
// เจอบั๊กเดียวกับที่ pageAll กันไว้ (C2, คอมเมนต์ข้างบน) แต่ listPage ที่เพิ่มทีหลัง (M9 Phase 2/4/5)
// ยิง .range() ครั้งเดียวตรง ๆ ไม่ได้ไล่ทีละหน้า — ถ้า limit เกิน PAGE_ROWS (1000) จะได้กลับมาแค่ 1000
// แถวแรกเงียบ ๆ โดยไม่มี error ให้รู้เลย (ยืนยันจริงจากทดสอบข้อมูลปริมาณ 5,500 แถว 30 ก.ค. 69)
// ไม่กระทบ listPage ที่ใช้ทำ UI-pagination จริง (limit เล็ก เช่น 6/24/50) — เข้าเงื่อนไข loop แค่รอบเดียวเหมือนเดิม
// buildQuery ต้องคืน query "ใหม่" ทุกครั้งที่เรียก (มี .range ของหน้านั้นในตัว) — ใช้ query เดิมซ้ำหลัง await ไม่ได้
// ฐานข้อมูลรองรับสวิตช์ "ข้ามการนับ" (migration 0161) หรือยัง — ตรวจครั้งเดียวจากผลจริง
let ฐานข้อมูลข้ามการนับได้ = true;

async function rangedFetch<T extends Row>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>,
  limit: number, offset: number,
): Promise<{ rows: T[]; total: number }> {
  const out: T[] = [];
  let total = 0;
  for (let from = offset; out.length < limit; from += PAGE_ROWS) {
    const to = Math.min(from + PAGE_ROWS, offset + limit) - 1;
    const { data, error, count } = await buildQuery(from, to);
    if (error) throw new DbError(error.message, (error as { code?: string }).code);
    if (count != null) total = count;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < to - from + 1) break; // ข้อมูลจริงหมดก่อนถึง limit ที่ขอ
  }
  return { rows: out, total };
}

// เน็ตหลุดชั่วคราวระหว่างยิงคำขอ (TypeError: Failed to fetch) — พบเป็นระยะตอนโหลดสูง/รันขนาน
//   ไม่ใช่ error จาก DB (ไม่ผ่าน constraint/RLS/business logic ใด ๆ) แค่คำขอไปไม่ถึงปลายทางเฉย ๆ
//   ลองใหม่ 1 ครั้งก่อนค่อยให้ผู้ใช้เห็น error จริง — ยืนยันจากผลตรวจสอบระบบ 30 ก.ค. 69 (สร้างลูกค้าเป้าหมายพลาดเป็นระยะ)
function isTransientNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Failed to fetch|NetworkError when attempting|Load failed/i.test(msg);
}
async function withNetworkRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (retries > 0 && isTransientNetworkError(e)) {
      await new Promise(r => setTimeout(r, 400));
      return withNetworkRetry(fn, retries - 1);
    }
    throw e;
  }
}

// select ทั้งตาราง + กรองตาม scope (ดีลเลอร์ = เฉพาะสาขาตัวเอง · HQ = ทั้งหมด) → แปลงเป็น camelCase
// tiebreak = คอลัมน์ตัดสินท้ายสุดเวลา orderCol เสมอกันได้ · ส่ง null เมื่อ orderCol ไม่ซ้ำอยู่แล้ว
//   (ทะเบียนสาขาเรียงด้วย code · แคตตาล็อกกลางเป็นของส่วนกลาง — สองตารางนี้ไม่มีคอลัมน์ dealer_code ด้วยซ้ำ)
async function selectScoped<T>(
  table: string, scope?: Scope, col = "dealer_code", orderCol = "id", tiebreak: string | null = "dealer_code",
): Promise<T[]> {
  const rows = await pageAll((from, to) => {
    let q = sb().from(table).select("*").order(orderCol, { ascending: true });
    if (tiebreak && tiebreak !== orderCol) q = q.order(tiebreak, { ascending: true });
    const base = q.range(from, to);
    return scope && !scope.isHQ && scope.dealerCode ? base.eq(col, scope.dealerCode) : base;
  }, table);
  return toCamelList<T>(rows);
}

async function must(p: PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw new DbError(error.message, error.code);
}

async function one<T>(table: string): Promise<T | null> {
  const { data, error } = await sb().from(table).select("*").limit(1).maybeSingle();
  if (error) throw new DbError(error.message, error.code);
  return data ? toCamel<T>(data as Row) : null;
}

// insert 1 แถว → คืนแถวที่ DB บันทึกจริง (id/created_at ที่ DB สร้างให้) เป็น camelCase
async function insertRow<T>(table: string, row: T): Promise<T> {
  return withNetworkRetry(async () => {
    const { data, error } = await sb().from(table).insert(toSnake(row as unknown as Row)).select().single();
    if (error) throw new DbError(error.message, error.code);
    return toCamel<T>(data as Row);
  });
}
// update ทั้งแถวตาม id → คืนแถวหลังอัปเดต
async function updateRow<T>(table: string, id: string | number, row: T): Promise<T> {
  return withNetworkRetry(async () => {
    const { data, error } = await sb().from(table).update(toSnake(row as unknown as Row)).eq("id", id).select().single();
    if (error) throw new DbError(error.message, error.code);
    return toCamel<T>(data as Row);
  });
}

// ตัวแปลงแถว DB ↔ type ของแอป อยู่ที่ rowMappers.ts — ฝั่งเซิร์ฟเวอร์ใช้ตัวเดียวกัน (ระยะ 1)
// เลข id ถัดไปต่อสาขาแบบ atomic — DB เป็นคนออกให้ (กันชนเมื่อสร้างพร้อมกันในสาขาเดียวกัน)
async function nextEntityId(dealerCode: string, entity: "customers" | "appointments" | "leads"): Promise<number> {
  const { data, error } = await sb().rpc("next_entity_id", { p_dealer: dealerCode, p_entity: entity });
  if (error) throw new DbError(error.message, error.code);
  return Number(data);
}

const FILES_BUCKET = "dealer-files";

// ชื่อช่อง Realtime ต้องไม่ซ้ำกันต่อการ subscribe หนึ่งครั้ง
// ถ้าใช้ชื่อตายตัว: หลายคอมโพเนนต์ที่ subscribe พร้อมกัน (เช่น useHQPolicy + useQuoteValidityDays
// ในหน้าเดียว) จะได้ channel instance เดิมที่ subscribe ไปแล้ว → เติม .on() ไม่ได้
// ("cannot add postgres_changes callbacks after subscribe()") และตัวหลังจะไม่ได้รับ event เลย
let channelSeq = 0;
const topic = (base: string) => `${base}-${++channelSeq}`;

// ── การเชื่อมต่อ "อัปเดตสด" — ต่อใหม่เองเมื่อหลุด ไม่ใช่บอกให้ผู้ใช้รีเฟรชเอง ──────────
//
// เดิม: เจอ CHANNEL_ERROR/TIMED_OUT แล้ว "แค่รายงาน" พร้อมข้อความว่าข้อมูลอาจไม่อัปเดตสด
//   จนกว่าจะรีเฟรชหน้า → ผลักภาระให้ผู้ใช้ ทั้งที่การหลุดชั่วคราวเป็นเรื่องปกติมาก
//   (เน็ตสะดุด · สลับ wifi · เครื่องตื่นจาก sleep · เซิร์ฟเวอร์รีสตาร์ท)
//   และผู้ใช้เห็นข้อความสีแดงน่าตกใจทั้งที่ระบบยังใช้งานได้ปกติ (มีตาข่ายซิงก์ทุก 30 วินาทีรองอยู่แล้ว)
//   พบจริงจากหน้าจอผู้ใช้ 7 ส.ค. 69
//
// ตอนนี้: หลุดแล้วต่อใหม่เองแบบถอยห่างขึ้นเรื่อย ๆ (1 → 3 → 8 วินาที)
//   ต่อติดเมื่อไหร่ล้างตัวนับ เริ่มใหม่ได้เต็มโควตาอีกครั้ง
//   รายงานให้คนเห็น "เฉพาะตอนต่อใหม่ครบทุกครั้งแล้วยังไม่ติด" ซึ่งแปลว่าผิดปกติจริง
//
// ⚠️ ต้องสร้าง channel ใหม่ทุกครั้งที่ลองใหม่ ใช้ตัวเดิมซ้ำไม่ได้ (ตัวที่ error ไปแล้วต่อไม่ติดอีก)
//   จึงรับ "ฟังก์ชันสร้าง channel" เข้ามา ไม่ใช่รับตัว channel
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000];

function subscribeWithRetry(label: string, build: () => RealtimeChannel): () => void {
  let ch: RealtimeChannel | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const start = () => {
    if (stopped) return;
    // ยังไม่ล็อกอิน = ยังไม่ต้องเปิดช่องฟังอะไรทั้งนั้น (build() จะโยน no-session ออกมา)
    //   หน้าที่ต้องล็อกอินจะ mount ใหม่หลังเข้าระบบสำเร็จ แล้วค่อยเปิดช่องตอนนั้น
    try { ch = build(); }
    catch (e) { if (!isNoSessionError(e)) throw e; return; }
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") { attempt = 0; return; }
      // CLOSED = ปิดตามปกติตอน removeChannel — ไม่ใช่ความผิดพลาด
      if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;

      const dead = ch;
      ch = null;
      if (dead) { try { void sb().removeChannel(dead); } catch { /* ไม่มีเซสชันแล้ว */ } }
      if (stopped) return;

      if (attempt >= RETRY_DELAYS_MS.length) {
        captureError(
          new Error(`realtime "${label}" ต่อใหม่ ${RETRY_DELAYS_MS.length} ครั้งแล้วยังไม่ติด — ข้อมูลจะอัปเดตช้ากว่าปกติ (ยังซิงก์ทุก 30 วินาที)`),
          "realtime",
        );
        return;
      }
      timer = setTimeout(start, RETRY_DELAYS_MS[attempt++]);
    });
  };

  start();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    // ออกจากระบบแล้ว sb() จะโยน no-session — การเก็บกวาดช่องต้องไม่พังตามไปด้วย
    if (ch) { try { void sb().removeChannel(ch); } catch { /* ไม่มีเซสชันแล้ว ช่องถูกปิดไปเองอยู่แล้ว */ } }
  };
}

/** เติมชื่อบริษัทของลูกค้าเป้าหมายให้คำขอ (คิวของ HQ) — อ่านเฉพาะรายที่อยู่ในคิว */
async function เติมชื่อบริษัท(rows: QuoteRequest[]): Promise<QuoteRequest[]> {
  const byDealer = new Map<string, number[]>();
  for (const r of rows) byDealer.set(r.dealerCode, [...(byDealer.get(r.dealerCode) ?? []), r.leadNumId]);
  const ชื่อ = new Map<string, string>();
  for (const [dealer, nums] of byDealer) {
    for (let i = 0; i < nums.length; i += 200) {
      const { data, error } = await sb().from("leads").select("dealer_code, num_id, company").eq("dealer_code", dealer).in("num_id", nums.slice(i, i + 200));
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      for (const l of (data ?? []) as Row[]) ชื่อ.set(`${l.dealer_code}#${l.num_id}`, String(l.company ?? ""));
    }
  }
  return rows.map(r => ({ ...r, leadCompany: ชื่อ.get(`${r.dealerCode}#${r.leadNumId}`) ?? "" }));
}

export const SupabaseAdapter: DataAdapter = {
  // ไฟล์จริงใน Storage — พาธขึ้นต้นด้วยรหัสสาขาเสมอ (Storage RLS คุมด้วย foldername[1])
  storage: {
    upload: async (dealerCode, file) => {
      // Storage key ต้องเป็น ASCII ล้วน (ไทย/ช่องว่าง → "Invalid key") — ชื่อจริงเก็บใน metadata (files.name) อยู่แล้ว
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_") || "file";
      const path = `${dealerCode}/${Date.now()}-${safe}`;
      const { error } = await sb().storage.from(FILES_BUCKET).upload(path, file, { upsert: false });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return path;
    },
    signedUrl: async (path) => {
      const { data, error } = await sb().storage.from(FILES_BUCKET).createSignedUrl(path, 3600);
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return data?.signedUrl ?? null;
    },
    remove: async (path) => {
      const { error } = await sb().storage.from(FILES_BUCKET).remove([path]);
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
    },
  },
  // Realtime — ช่องเดียวฟังครบ 4 ตารางงานขาย · RLS กรอง event ให้ตามสาขาที่ล็อกอินอยู่แล้ว
  realtime: {
    // ส่ง "แถวที่เปลี่ยน" มาให้เลย (แปลงเป็น type ของแอปแล้ว) → หน้าจอ patch เฉพาะแถว ไม่ต้องโหลดทั้งตาราง
    // DELETE ได้ record เดิมมาด้วยเพราะตั้ง replica identity full ไว้ใน 0011
    subscribeSales: (onChange) => {
      const toRow: Record<SalesTable, (r: Row) => unknown> = {
        leads: rowToLead,
        quotations: rowToQuote,
        appointments: rowToAppt,
        customers: (r) => toCamel<CustomerRow>(r),
      };
      return subscribeWithRetry("งานขาย", () => {
      const ch = sb().channel(topic("sales-changes"));
      for (const t of Object.keys(toRow) as SalesTable[]) {
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (p) => {
          if (p.eventType === "DELETE") {
            const id = (p.old as Row | undefined)?.id;
            if (id != null) onChange({ table: t, type: "DELETE", id: id as string | number });
            return;
          }
          onChange({
            table: t,
            type: p.eventType as "INSERT" | "UPDATE",
            row: toRow[t](p.new as Row),
          } as SalesChange);
        });
      }
      return ch;
      });
    },
    subscribeSettings: (onChange) => subscribeWithRetry("ตั้งค่าเครือ", () => {
      const ch = sb().channel(topic("settings-changes"));
      // ต้องครบทุกตารางที่ HQ เป็นเจ้าของและดีลเลอร์ต้องใช้ตาม
      // (0021 เปิด Realtime ให้ hq_sales_journey ไว้แล้ว แต่ฝั่ง client ลืมฟัง
      //  → เหตุผลปิดการขายที่ HQ แก้ ดีลเลอร์ไม่เห็นจนกว่าจะรีโหลดหน้า)
      for (const t of ["hq_policy", "hq_targets", "hq_notif_rules", "hq_sales_journey", "hq_recruit_settings"]) {
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => onChange());
      }
      return ch;
    }),
    // โน้ตลูกค้า — RLS กรอง event ให้เห็นเฉพาะของสาขาตัวเอง (0028 เปิด Realtime + replica identity full)
    subscribeNotes: (onChange) => subscribeWithRetry("โน้ตลูกค้า", () =>
      sb().channel(topic("notes-changes"))
        .on("postgres_changes", { event: "*", schema: "public", table: "customer_notes" }, () => onChange())),
    // ตั้งค่าของสาขา — 0024 เปิด Realtime + replica identity full · RLS กรองเฉพาะของสาขาตัวเอง (M4)
    subscribeDealerSettings: (onChange) => subscribeWithRetry("ตั้งค่าสาขา", () =>
      sb().channel(topic("dealer-settings-changes"))
        .on("postgres_changes", { event: "*", schema: "public", table: "dealer_settings" }, () => onChange())),
  },
  dealers: {
    // ตาราง dealers ใช้ code เป็น PK — ไม่มีคอลัมน์ id (แต่ DealerRow ของแอปมี id และ mock ตั้ง id = code เสมอ)
    // ถ้าไม่เติมให้ ทุกแถวจะได้ id = undefined → React key ซ้ำ + หน้าจอที่อ้าง d.id พัง
    // อ่านผ่าน dealers_directory (0077) ไม่ใช่ตารางตรง — revenue_target ของสาขาอื่นถูกมาสก์เป็น null ที่ view
    //   (RLS เป็น row-level ปิดทั้งแถวได้อย่างเดียว ปิดทีละคอลัมน์ไม่ได้ · บอสยืนยัน 30 ก.ค. 69)
    list: async () => (await selectScoped<DealerRow>("dealers_directory", undefined, "dealer_code", "code", null)).map(d => normalizeDealer({ ...d, id: d.id ?? d.code })),
    // ตัดฟิลด์ที่ไม่มีคอลัมน์ใน DB ออกก่อน upsert:
    //   • id          — ตารางใช้ code เป็น PK
    //   • credentials — รหัสผ่านอยู่ใน Supabase Auth (hash) ห้ามเก็บซ้ำในตารางนี้
    // save = "เพิ่ม/แก้เท่าที่ส่งมา" เท่านั้น · การลบต้องเรียก remove() ตรง ๆ
    //
    // ⚠️ เคยทำเป็น "แทนที่ทั้งชุด" คือลบทุกแถวที่ไม่ได้อยู่ในอาร์เรย์ที่ส่งมา — อันตรายมาก
    //    ถ้าหน้าจอยังโหลดทะเบียนไม่เสร็จแล้วผู้ใช้กดเพิ่ม อาร์เรย์จะมีแค่แถวใหม่แถวเดียว
    //    → สั่งลบสาขาจริงที่เหลือทั้งหมด (เคยเกิดจริง รอดเพราะ FK ของตารางไฟล์กันไว้เฉย ๆ)
    //    การลบต้องมาจากเจตนาของผู้ใช้เท่านั้น ห้ามอนุมานจาก "แถวหายไปจากอาร์เรย์"
    save: async (all) => {
      // ตัด created_at ทิ้งด้วย — DB เป็นเจ้าของ (default now()) และห้ามให้แอปเขียนทับ
      //
      // ⚠️ ถ้าไม่ตัด: upsert เป็น bulk · PostgREST รวมชุดคอลัมน์จาก "ทุกแถว" ให้เท่ากัน
      //    สาขาเดิมที่โหลดมาจาก DB มี created_at · สาขาใหม่ที่เพิ่งกรอกในฟอร์มไม่มี
      //    → แถวใหม่ถูกเติมเป็น null → ชน not-null → เพิ่มดีลเลอร์ใหม่ไม่สำเร็จเลยสักครั้ง
      // เขียนผ่าน RPC save_dealers (SECURITY DEFINER) แทน upsert ตรง — ตั้งแต่ 0091 ตัด SELECT
      // ทั้งตารางออกจาก authenticated (revenue_target อ่านได้แค่ผ่าน dealers_directory) upsert ตรง
      // จึงพัง (INSERT...ON CONFLICT DO UPDATE ต้องมี SELECT บนคอลัมน์ที่ SET ด้วย ไม่ใช่แค่ INSERT/UPDATE)
      // RPC นี้รันด้วยสิทธิ์เจ้าของฟังก์ชัน ข้ามข้อจำกัดนั้นได้ แล้วตรวจ can_write_master() เอง (0092)
      const rows = all.map(d => {
        const r = toSnake(d as unknown as Row);
        delete r.id; delete r.credentials; delete r.created_at;
        return r;
      });
      await must(sb().rpc("save_dealers", { p_rows: rows }));
    },
    // ⚠️ ห้ามเรียกจริง — การลบดีลเลอร์ในระบบจริงต้องผ่าน /api/admin/dealers (DELETE) เท่านั้น เพราะที่นั่น
    // เช็ก FK-restrict ครบ 6 ตาราง + ลบบัญชี auth ของสาขาด้วย + เขียน audit log ก่อนลบจริง — .delete() ตรง
    // ที่นี่ไม่มีอะไรกันเลยสักอย่าง (ผลตรวจสอบ DB×หน้าจอทั้งระบบ พบว่าไม่มีจุดไหนเรียกเมธอดนี้ในโหมด supabase
    // จริงเลย — คงไว้เพื่อให้ตรงตาม DealersRepo interface เท่านั้น แต่ทำให้ throw ชัดเจนแทนลบเงียบๆ ถ้าถูกเรียกผิดจุด)
    remove: async () => { throw new Error("ห้ามลบดีลเลอร์ผ่านทางนี้ — ใช้ DELETE /api/admin/dealers เท่านั้น (กัน FK/บัญชีกำพร้า)"); },
  },
  files: {
    list: (scope) => selectScoped<DealerFile>("files", scope),
    add: async (f) => {
      const { data, error } = await sb().from("files").insert(toSnake(f as unknown as Row)).select().single();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamel<DealerFile>(data as Row);
    },
    update: (f) => must(sb().from("files").update(toSnake(f as unknown as Row)).eq("id", f.id)),
    remove: (id) => must(sb().from("files").delete().eq("id", id)),
  },
  persons: {
    list: async (scope) => {
      const rows = await selectScoped<ResponsiblePerson>("responsible_persons", scope);
      return rows.map((p, i) => ({ ...p, id: i + 1 })); // reindex เป็น 1..n (แอปใช้ id เป็น index ท้องถิ่น)
    },
    // แทนที่ทั้งชุดของสาขาแบบ atomic ผ่าน RPC (ลบ+ใส่ใหม่ใน transaction เดียว)
    //   เดิมเป็น delete แล้ว insert 2 คำสั่งแยก — crash กลางทาง = พนักงานของสาขาหายทั้งชุด (0060)
    save: async (all, dealerCode) => {
      // ส่งเฉพาะฟิลด์ที่ RPC ใช้ (name/title/phone/email/active/avatar) — id/dealerCode ให้ RPC จัดการ
      const rows = all.map(({ id: _id, dealerCode: _dc, ...rest }) => rest);
      await must(sb().rpc("replace_responsible_persons", { p_dealer: dealerCode, p_rows: rows }));
    },
  },
  settings: {
    // singleton (id=1) — fallback เป็น default ถ้าแถวยังไม่ถูก seed (กัน null → หน้า HQ crash)
    getPolicy: async () => (await one<HQPolicy>("hq_policy")) ?? DEFAULT_HQ_POLICY,
    getTargets: async () => (await one<HQTargets>("hq_targets")) ?? DEFAULT_HQ_TARGETS,
    // ⚠️ ต้องรวมกับค่าเริ่มต้นแบบ "ลงลึกถึงในกล่อง" ไม่ใช่แค่ชั้นนอก (พบจากหน้าจอจริง 13 ส.ค. 69)
    //   แถวในฐานข้อมูลเก็บ alerts/channels เป็นกล่อง json — ของจริงมีค่าเป็นกล่องว่าง {} อยู่
    //   รวมแค่ชั้นนอกจะเอากล่องว่างไปทับกฎแจ้งเตือนทุกข้อ → หน้าตั้งค่าอ่าน "กฎข้อนี้เปิดอยู่ไหม"
    //   จากของที่ไม่มีอยู่ แล้วพังทั้งหน้า (แท็บการแจ้งเตือนขึ้นจอแดง "เกิดข้อผิดพลาดในหน้านี้")
    //   โหมดในเครื่อง (loadHQNotifRules ใน mock.ts) รวมลึกไว้ถูกแล้ว — ฝั่งฐานข้อมูลตกหล่นไปที่เดียว
    getNotifRules: async () => {
      const r = await one<HQNotifRules>("hq_notif_rules");
      return รวมกฎแจ้งเตือน(r);
    },
    savePolicy: (p) => must(sb().from("hq_policy").upsert({ id: 1, ...toSnake(p as unknown as Row) })),
    saveTargets: (t) => must(sb().from("hq_targets").upsert({ id: 1, ...toSnake(t as unknown as Row) })),
    saveNotifRules: (r) => must(sb().from("hq_notif_rules").upsert({ id: 1, ...toSnake(r as unknown as Row) })),
    // all-or-nothing (RPC, 0093) — แทน Promise.all ของ upsert แยกทีละตาราง (Phase 4 transaction)
    restoreSettings: (patch) => must(sb().rpc("restore_hq_settings", {
      p_policy:       patch.policy      ? toSnake(patch.policy as unknown as Row)      : null,
      p_targets:      patch.targets     ? toSnake(patch.targets as unknown as Row)     : null,
      p_notif_rules:  patch.notifRules  ? toSnake(patch.notifRules as unknown as Row)  : null,
      p_lost_reasons: patch.lostReasons ?? null,
      p_company:      patch.company     ? toSnake(patch.company as unknown as Row)     : null,
    })),
    getLeadRulesMap: async () => {
      // ตารางนี้ใช้ dealer_code เป็น PK — ไม่มีคอลัมน์ id จึงต้องระบุคอลัมน์เรียงเอง
      const rows = await selectScoped<{ dealerCode: string } & LeadRules>("dealer_lead_rules", { isHQ: true }, "dealer_code", "dealer_code");
      const map: DealerLeadRulesMap = {};
      for (const r of rows) map[r.dealerCode] = r;
      return map;
    },
    saveLeadRules: (code, rules) =>
      must(sb().from("dealer_lead_rules").upsert(toSnake({ dealerCode: code, ...rules } as unknown as Row))),
    getQuoteValidityDays: async () => {
      const p = await one<HQPolicy>("hq_policy");
      return p?.quoteValidityDays ?? DEFAULT_HQ_POLICY.quoteValidityDays;
    },
    // lost เป็น text[] ของ Postgres — ไม่ต้องแปลงคีย์ (คอลัมน์เดียว ชื่อตรงอยู่แล้ว)
    // แถวยังไม่ถูก seed / รายการว่าง → ใช้ค่าเริ่มต้นกลาง ไม่ปล่อยให้ดีลเลอร์ได้ dropdown เปล่า
    getLostReasons: async () => {
      const row = await one<{ lost?: string[] }>("hq_sales_journey");
      return row?.lost?.length ? row.lost : [...LOST_REASONS];
    },
    saveLostReasons: (lost) => must(sb().from("hq_sales_journey").upsert({ id: 1, lost })),
    // tasks เป็น jsonb คอลัมน์เดียว (0137) — ยังไม่เคยตั้ง/ข้อมูลเพี้ยน = ใช้ชุดเริ่มต้น ไม่ปล่อยให้ลูกค้าเป้าหมายไม่มีงานเลย
    getLeadTasks: async () => {
      const row = await one<{ tasks?: unknown }>("hq_sales_journey");
      return Array.isArray(row?.tasks) && row.tasks.length
        ? normalizeLeadTaskTemplate(row.tasks)
        : [...LEAD_TASK_TEMPLATE];
    },
    saveLeadTasks: (tasks) =>
      must(sb().from("hq_sales_journey").upsert({ id: 1, tasks: normalizeLeadTaskTemplate(tasks) })),
    // config เป็น jsonb ก้อนเดียว (0176) — ไม่แปลงคีย์ข้างใน · ขาด/เพี้ยน = ค่าเริ่มต้น
    getRecruitSettings: async () => {
      const row = await one<{ config?: unknown }>("hq_recruit_settings");
      return รวมค่าตั้งหาดีลเลอร์(row?.config);
    },
    saveRecruitSettings: (s) =>
      must(sb().from("hq_recruit_settings").upsert({ id: 1, config: รวมค่าตั้งหาดีลเลอร์(s) })),
  },
  // ตั้งค่าของสาขา — แถวเดียวต่อ dealer_code · RLS คุมว่าแก้ได้เฉพาะของตัวเอง
  // เก็บเป็น jsonb ราย "กลุ่ม" จึงไม่ต้องแปลง snake/camel ข้างใน (ปล่อยผ่านทั้งก้อน)
  dealerSettings: {
    get: async (dealerCode) => {
      const { data, error } = await sb().from("dealer_settings")
        .select("issuer,document,logo,notif_prefs,pricing").eq("dealer_code", dealerCode).maybeSingle();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const r = (data ?? {}) as Record<string, unknown>;
      // ยังไม่เคยตั้งค่า = คืนค่ากลาง (หน้าจอจะได้มีอะไรให้แก้ ไม่ใช่ฟอร์มว่างเปล่า)
      return {
        issuer:     { ...DEFAULT_ISSUER, ...(r.issuer as object ?? {}) },
        document:   { ...DEFAULT_DOC, ...(r.document as object ?? {}) },
        logo:       (r.logo as string) ?? "",
        notifPrefs: { ...DEFAULT_NOTIF_PREFS, ...(r.notif_prefs as object ?? {}) },
        pricing:    (r.pricing as object ?? {}),
      } as DealerSettings;
    },
    save: async (dealerCode, patch) => {
      const row: Row = { dealer_code: dealerCode, updated_at: new Date().toISOString() };
      if (patch.issuer)                 row.issuer = patch.issuer;
      if (patch.document)               row.document = patch.document;
      if (patch.logo !== undefined)     row.logo = patch.logo;
      if (patch.notifPrefs)             row.notif_prefs = patch.notifPrefs;
      if (patch.pricing)                row.pricing = patch.pricing;
      await must(sb().from("dealer_settings").upsert(row, { onConflict: "dealer_code" }));
    },
    // RLS (0024/0124): HQ อ่านได้ทั้งเครือ · ดีลเลอร์เห็นแค่ของตัวเอง · ไล่ทีละหน้าเสมอ (เพดาน 1,000 แถว)
    logos: async () => {
      const rows = await pageAll((from, to) =>
        sb().from("dealer_settings").select("dealer_code,logo").not("logo", "is", null)
          .order("dealer_code", { ascending: true }).range(from, to), "dealer_settings");
      return Object.fromEntries(rows.filter(r => typeof r.logo === "string" && r.logo).map(r => [String(r.dealer_code), String(r.logo)]));
    },
  },
  // โปรไฟล์ของผู้ใช้ที่ล็อกอิน — แถวใน profiles ที่ id ตรงกับ auth user
  // อีเมลล็อกอินอยู่ใน auth.users (แก้จากที่นี่ไม่ได้) · contact_email = อีเมลติดต่อที่ผู้ใช้ตั้งเอง
  profile: {
    get: async () => {
      // getSession() อ่าน session จากเครื่อง — ห้ามใช้ getUser() ที่ยิง /auth/v1/user ทุกครั้ง
      // (hook นี้ทำงานทุกหน้าผ่าน Sidebar/Topbar → คำขอถูกยกเลิกตอนเปลี่ยนหน้า
      //  แล้วโผล่เป็น console error "Failed to fetch" เป็นร้อยรายการ)
      const { data: sess } = await sb().auth.getSession();
      const id = sess.session?.user?.id;
      if (!id) return null;
      const { data, error } = await sb().from("profiles")
        .select("name,phone,contact_email,avatar").eq("id", id).maybeSingle();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return {
        name: (r.name as string) ?? "",
        email: ((r.contact_email as string) || sess.session?.user?.email) ?? "",
        phone: (r.phone as string) ?? "",
        avatar: (r.avatar as string) || undefined,
      } as UserProfile;
    },
    save: async (p) => {
      const { data: sess } = await sb().auth.getSession();
      const id = sess.session?.user?.id;
      if (!id) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
      // อัปเดตเฉพาะฟิลด์ส่วนตัว — role/dealer_code ไม่ส่งไป (และ trigger ที่ DB กันไว้อีกชั้น)
      await must(sb().from("profiles")
        .update({ name: p.name, phone: p.phone, contact_email: p.email, avatar: p.avatar ?? null })
        .eq("id", id));
    },
  },
  // คำขอใบเสนอราคา (Flow ใหม่ · ใบ 0183)
  quoteRequests: {
    listForLead: async (dealerCode, leadNumId) => {
      const { data, error } = await sb().from("quote_requests").select("*")
        .eq("dealer_code", dealerCode).eq("lead_num_id", leadNumId).order("id", { ascending: false });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamelList<QuoteRequest>((data ?? []) as Row[]);
    },
    listQueue: async () => {
      const rows = await pageAll((from, to) => sb().from("quote_requests").select("*")
        .in("status", ["new", "pricing", "quoted"]).order("due_at", { ascending: true }).order("id", { ascending: true }).range(from, to), "quote_requests");
      return เติมชื่อบริษัท(toCamelList<QuoteRequest>(rows as Row[]));
    },
    submit: async (i) => {
      const { data, error } = await sb().rpc("quote_request_submit", {
        p_lead_num_id: i.leadNumId, p_product: i.product, p_subtype: i.subtype ?? "", p_area: i.area ?? null, p_spec: i.spec ?? "", p_province: i.province ?? "",
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamel<QuoteRequest>(data as Row);
    },
    cancel: async (id, reason, closeLead) => {
      const { error } = await sb().rpc("quote_request_cancel", { p_id: id, p_reason: reason, p_close_lead: closeLead });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
    },
    reprice: async (id, reason, spec) => {
      const { data, error } = await sb().rpc("quote_request_reprice", { p_id: id, p_reason: reason, p_spec: spec ?? null });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamel<QuoteRequest>(data as Row);
    },
    accept: async (id) => {
      const { data: u } = await sb().auth.getUser();
      const { error } = await sb().rpc("quote_request_accept", { p_id: id, p_assignee: u.user?.id ?? null });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
    },
    hqQuoteFor: async (requestId) => {
      const { data, error } = await sb().from("hq_quotes").select("*").eq("request_id", requestId).maybeSingle();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return data ? toCamel<HqQuote>(data as Row) : null;
    },
    saveHqQuote: async (requestId, lines, validUntil, note) => {
      const { data, error } = await sb().rpc("hq_quote_save", { p_request_id: requestId, p_lines: lines, p_valid_until: validUntil || null, p_note: note });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamel<HqQuote>(data as Row);
    },
    sendHqQuote: async (requestId) => {
      const { data, error } = await sb().rpc("hq_quote_send", { p_request_id: requestId });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamel<HqQuote>(data as Row);
    },
    copyHqQuote: async (requestId, sourceHqQuoteId) => {
      const { data, error } = await sb().rpc("hq_quote_copy_from", { p_request_id: requestId, p_source_hq_quote_id: sourceHqQuoteId });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamel<HqQuote>(data as Row);
    },
    hqQuoteById: async (id) => {
      const { data, error } = await sb().from("hq_quotes").select("*").eq("id", id).maybeSingle();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return data ? toCamel<HqQuote>(data as Row) : null;
    },
    margin: async (dealerCode, quotationId) => {
      const { data, error } = await sb().rpc("quotation_margin", { p_dealer: dealerCode, p_id: quotationId });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return (data ?? null) as QuoteMargin | null;
    },
    revertWon: async (dealerCode, quotationId, reason, to) => {
      const { error } = await sb().rpc("quotation_revert_won", { p_dealer: dealerCode, p_id: quotationId, p_reason: reason, p_to: to });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
    },
    quotedLeadIds: async (dealerCode) => {
      const { data, error } = await sb().from("quote_requests").select("lead_num_id").eq("dealer_code", dealerCode).eq("status", "quoted");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return ((data ?? []) as Row[]).map(r => Number(r.lead_num_id));
    },
  },
  // พื้นที่ของดีลเลอร์ (ใบ 0195) — อ่านได้ทุกบัญชี · เคลียร์ผ่านคำสั่งของฐาน (ตรวจสิทธิ์ HQ ข้างใน)
  territories: {
    owners: async () => {
      const { data, error } = await sb().from("dealer_territories").select("province, dealer_code, legacy").order("province");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamelList<{ province: string; dealerCode: string; legacy: boolean }>((data ?? []) as Row[]);
    },
    overlaps: async () => {
      const { data, error } = await sb().from("territory_overlaps").select("*").order("province");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamelList<{ province: string; region: string; dealerCodes: string[] }>((data ?? []) as Row[]);
    },
    unmatched: async () => {
      const { data, error } = await sb().rpc("territory_unmatched_dealers");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamelList<{ dealerCode: string; province: string }>((data ?? []) as Row[]);
    },
    resolveOverlap: async (province, keep) => {
      const { error } = await sb().rpc("territory_resolve_overlap", { p_province: province, p_keep: keep });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
    },
    transferPlan: async () => {
      const { data, error } = await sb().rpc("hq_lead_transfer_plan");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return toCamelList<{ province: string; mode: "auto" | "choose" | "queue"; leads: number; dealerCodes: string[] }>((data ?? []) as Row[])
        .map(r => ({ ...r, leads: Number(r.leads) }));
    },
    transferAuto: async () => {
      const { data, error } = await sb().rpc("transfer_hq_leads_auto");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return Number(data ?? 0);
    },
    transfer: async (province, to) => {
      const { data, error } = await sb().rpc("transfer_hq_leads", { p_province: province, p_to: to });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return Number(data ?? 0);
    },
  },
  hqCompany: {
    get: async () => (await one<HQCompany>("hq_company")) ?? EMPTY_HQ_COMPANY,
    save: (c) => must(sb().from("hq_company").upsert({ id: 1, ...toSnake(c as unknown as Row) })),
  },
  notes: {
    list: (scope) => selectScoped<CustomerNote>("customer_notes", scope),
    create: (n) => insertRow<CustomerNote>("customer_notes", n as CustomerNote),
    update: (n) => updateRow<CustomerNote>("customer_notes", n.id, n),
    remove: (id) => must(sb().from("customer_notes").delete().eq("id", id)),
  },
  // ลูกค้าเป้าหมายของสำนักงานใหญ่ — RLS (0170): อ่าน = HQ · เขียน = ผู้ดูแลข้อมูลกลาง
  //   จัดข้อมูลด้วย เตรียมบันทึก ก่อนเขียนเสมอ: ช่องวันที่ว่างต้องเป็น null (ส่ง "" ไปทั้งแถวถูกปฏิเสธ)
  //   และห้ามส่ง id/created_at/updated_at ให้ฐานข้อมูล · อ่านทีละหน้าเสมอ (เพดาน 1,000 แถว/คำขอ)
  prospects: {
    list: async () => (await pageAll((from, to) =>
      sb().from("dealer_prospects").select("*").order("id", { ascending: false }).range(from, to), "dealer_prospects"))
      .map(r => toCamel<DealerProspect>(r)),
    create: (p) => withNetworkRetry(async () => {
      const { data, error } = await sb().from("dealer_prospects")
        .insert(toSnake(เตรียมบันทึก(p) as unknown as Row)).select().single();
      if (error) throw new DbError(error.message, error.code);
      return toCamel<DealerProspect>(data as Row);
    }),
    update: (p) => withNetworkRetry(async () => {
      const { data, error } = await sb().from("dealer_prospects")
        .update(toSnake(เตรียมบันทึก(p) as unknown as Row)).eq("id", p.id).select().single();
      if (error) throw new DbError(error.message, error.code);
      return toCamel<DealerProspect>(data as Row);
    }),
    remove: (id) => must(sb().from("dealer_prospects").delete().eq("id", id)),
  },
  // ใบค่าแฟรนไชส์ — RLS (0172) ชุดเดียวกับลูกค้าเป้าหมาย HQ · สถานะ/การล็อกเนื้อหา ตัวดักของฐานข้อมูลบังคับ
  proposals: {
    list: async (prospectId) => (await pageAll((from, to) => {
      let q = sb().from("dealer_package_proposals").select("*");
      if (prospectId != null) q = q.eq("prospect_id", prospectId);
      return q.order("id", { ascending: false }).range(from, to);
    }, "dealer_package_proposals")).map(r => toCamel<DealerPackageProposal>(r)),
    create: (p) => withNetworkRetry(async () => {
      const { data, error } = await sb().from("dealer_package_proposals")
        .insert(toSnake(เตรียมบันทึกใบ(p) as unknown as Row)).select().single();
      if (error) throw new DbError(error.message, error.code);
      return toCamel<DealerPackageProposal>(data as Row);
    }),
    update: (p) => withNetworkRetry(async () => {
      const { data, error } = await sb().from("dealer_package_proposals")
        .update(toSnake(เตรียมบันทึกใบ(p) as unknown as Row)).eq("id", p.id).select().single();
      if (error) throw new DbError(error.message, error.code);
      return toCamel<DealerPackageProposal>(data as Row);
    }),
    // เปลี่ยนสถานะอย่างเดียว — ไม่ส่งทั้งแถว (ใบที่ส่งแล้วถูกล็อกเนื้อหา)
    setStatus: (id, status, reason) => withNetworkRetry(async () => {
      const { data, error } = await sb().from("dealer_package_proposals")
        .update(reason ? { status, close_reason: reason } : { status }).eq("id", id).select().single();
      if (error) throw new DbError(error.message, error.code);
      return toCamel<DealerPackageProposal>(data as Row);
    }),
    newVersion: async (id) => {
      const { data, error } = await sb().rpc("dealer_proposal_new_version", { p_id: id });
      if (error) throw new DbError(error.message, error.code);
      return toCamel<DealerPackageProposal>(data as Row);
    },
    payments: async (proposalId) => {
      const { data, error } = await sb().from("dealer_proposal_payments").select("*").eq("proposal_id", proposalId).order("id");
      if (error) throw new DbError(error.message, error.code);
      return ((data ?? []) as Row[]).map(r => ({ ...toCamel<DealerProposalPayment>(r), amount: Number(r.amount) }));
    },
    addPayment: async (x) => {
      const { data, error } = await sb().from("dealer_proposal_payments")
        .insert({ proposal_id: x.proposalId, paid_on: x.paidOn, amount: x.amount, reference: x.reference }).select().single();
      if (error) throw new DbError(error.message, error.code);
      return { ...toCamel<DealerProposalPayment>(data as Row), amount: Number((data as Row).amount) };
    },
    cancelPayment: async (id, reason) => {
      const { data, error } = await sb().from("dealer_proposal_payments").update({ cancel_reason: reason }).eq("id", id).select().single();
      if (error) throw new DbError(error.message, error.code);
      return { ...toCamel<DealerProposalPayment>(data as Row), amount: Number((data as Row).amount) };
    },
    conversionReady: async (prospectId) => {
      const { data, error } = await sb().rpc("dealer_conversion_ready", { p_prospect: prospectId });
      if (error) throw new DbError(error.message, error.code);
      return (data as string | null) ?? null;
    },
    remove: (id) => must(sb().from("dealer_package_proposals").delete().eq("id", id)),
  },
  // ประวัติลูกค้าเป้าหมาย HQ — RLS (0174): อ่าน = HQ · เพิ่มได้แค่บันทึกการติดต่อ · ผู้ทำ/เวลา ฐานข้อมูลตั้งเอง
  prospectActivities: {
    list: async (prospectId) => (await pageAll((from, to) =>
      sb().from("dealer_prospect_activities").select("*").eq("prospect_id", prospectId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to), "dealer_prospect_activities"))
      .map(r => toCamel<ProspectActivity>(r)),
    // ไม่ลองซ้ำเมื่อเน็ตสะดุด — บันทึกนี้แก้/ลบไม่ได้ ถ้าคำขอแรกเข้าไปแล้วลองซ้ำจะได้บันทึกซ้อนที่ลบทิ้งไม่ได้
    addContact: async (x) => {
      const row = เตรียมบันทึกการติดต่อ(x);
      const { data, error } = await sb().from("dealer_prospect_activities")
        .insert({ prospect_id: row.prospectId, kind: "contact", channel: row.channel, body: row.body, next_follow_up: row.nextFollowUp })
        .select().single();
      if (error) throw new DbError(error.message, error.code);
      return toCamel<ProspectActivity>(data as Row);
    },
  },
  users: {
    list: async () => {
      // อีเมลล็อกอินอยู่ใน auth.users ซึ่ง client อ่านไม่ได้ (ต้อง service_role)
      // → แสดง contact_email ที่ผู้ใช้ตั้งเอง ไม่มีก็ขึ้น "—" ไม่กุอีเมลขึ้นมา
      // created_at เสมอกันได้ (บัญชีที่ถูกสร้างพร้อมกันเป็นชุด) → พ่วง id ซึ่งไม่ซ้ำทั้งระบบเป็นตัวตัดสินท้าย
      const rows = await pageAll((from, to) =>
        sb().from("profiles").select("*")
          .order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, to), "profiles");
      return rows.map(r => ({
        id: String(r.id),
        name: (r.name as string) || "",
        email: (r.contact_email as string) || "",
        phone: (r.phone as string) || "",
        role: (r.role as string) || "",
        department: (r.department as string) || "",
        dealerCode: (r.dealer_code as string) || "",
        status: ((r.status as string) === "inactive" ? "inactive" : "active") as SystemUser["status"],
        createdAt: (r.created_at as string) || "",
        avatar: (r.avatar as string) || undefined,
      }));
    },
    // ส่งเฉพาะช่องที่ผู้เรียกตั้งใจแก้ — undefined = ไม่แตะ (ไม่ใช่ล้างค่าเดิมทิ้ง)
    // avatar ส่ง null ได้เมื่อผู้ใช้กดลบรูป จึงเช็ก "มีคีย์นี้ไหม" ไม่ใช่เช็กว่ามีค่าไหม
    update: (u) => {
      const row: Row = { name: u.name, role: u.role, department: u.department, status: u.status };
      if ("avatar" in u) row.avatar = u.avatar ?? null;
      if (u.phone !== undefined) row.phone = u.phone;
      if (u.email !== undefined) row.contact_email = u.email;
      return must(sb().from("profiles").update(row).eq("id", u.id));
    },
    // สร้าง/ลบบัญชีต้องใช้ service_role — ห้ามอยู่ฝั่ง client เด็ดขาด
    canCreate: () => false,
  },
  // บัญชีเข้าระบบของดีลเลอร์ — เปลี่ยนผ่าน API ของสำนักงานใหญ่ (คีย์ผู้ดูแลอยู่ที่นั่นที่เดียว)
  account: accountRemote,
  audit: {
    // อ่านล่าสุดสูงสุด limit รายการ (id desc) + แปลง at (timestamptz) → สตริงไทยที่ /hq/audit (parseDate) เข้าใจ
    // audit_log เป็นตาราง append-only ที่โตไม่จำกัด (ทุก action ของ HQ ตลอดกาล) — เดิม pageAll ดึงทั้งหมด
    // จึงมีเพดานอ่านเสมอ (M8) · หน้า /hq/audit แจ้งผู้ใช้เมื่อชนเพดาน (ไม่ตัดเงียบ)
    // ⚠️ ต้องไล่ดึงทีละหน้า ห้ามยิง .range(0, limit-1) ครั้งเดียว
    //   ฐานข้อมูลคืนสูงสุด 1,000 แถวต่อคำขอ ต่อให้ขอ 5,000 ก็ได้กลับมาแค่ 1,000
    //   ผลที่เกิดจริง (พบ 7 ส.ค. 69): หน้า /hq/audit มีคำเตือน "แสดงเฉพาะ N รายการล่าสุด" อยู่แล้ว
    //   แต่ตั้งเงื่อนไขไว้ที่ 5,000 ซึ่งไม่มีวันถึง → คำเตือนไม่เคยขึ้นเลยสักครั้ง
    //   ผู้ใช้เห็น "1,000 รายการ" เหมือนเป็นทั้งหมด ทั้งที่ในระบบมี 9,666 = ข้อมูลขาดแบบเงียบ ๆ
    //   ซึ่งอันตรายกว่าโหลดไม่สำเร็จ เพราะหน้าจอดูปกติทุกอย่าง (กับดักเดียวกับ L-1)
    list: async (limit = 5000) => {
      const { rows } = await rangedFetch<Row>(
        (from, to) => sb().from("audit_log").select("*").order("id", { ascending: false }).range(from, to),
        limit, 0,
      );
      return rows.map(r => ({ ...toCamel<AuditEntry>(r), at: fmtAuditAt(String(r.at)) }));
    },
    // ประทับ at ด้วย "วันนี้ของระบบ" (APP_NOW) + เวลาจริง → รายการอยู่ในช่วงตัวกรอง /hq/audit (แช่แข็งเวลา)
    append: (e) => {
      const t = new Date();
      const at = new Date(APP_NOW.getFullYear(), APP_NOW.getMonth(), APP_NOW.getDate(), t.getHours(), t.getMinutes(), t.getSeconds());
      return must(sb().from("audit_log").insert({ ...toSnake(e as unknown as Row), at: at.toISOString() }));
    },
  },

  // rollup รายสาขา (M9 Phase 1) — รวมยอดที่ DB ผ่าน RPC dealer_rollup · RLS คุม scope (ดีลเลอร์=สาขาตน · HQ=ทั้งเครือ)
  metrics: {
    dealerRollup: async (year, opts) => {
      const { data, error } = await sb().rpc("dealer_rollup", {
        p_year: year,
        p_as_of: opts?.asOf ?? APP_NOW_ISO,
        p_default_days: opts?.defaultDays ?? DEFAULT_LEAD_RULES.followUpAlertDays,
        p_follow_up_days: opts?.perDealer ?? null,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const m = new Map<string, DealerRollup>();
      for (const r of (data as Row[]) ?? []) {
        m.set(String(r.dealer_code), {
          quotes: Number(r.quotes), won: Number(r.won), lost: Number(r.lost),
          revenue: Number(r.revenue), openLeads: Number(r.open_leads), staleLeads: Number(r.stale_leads),
        });
      }
      return m;
    },
    leadSummary: async (f) => {
      const { data, error } = await sb().rpc("lead_summary", {
        p_dealer_codes: f.dealerCodes ?? null, p_province: f.province ?? null, p_product: f.product ?? null,
        p_source: f.source ?? null, p_search: (f.search ?? "").trim() || null, p_status: f.status ?? null,
        p_date_start: f.dateStart ?? null, p_date_end: f.dateEnd ?? null,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { byStatus?: Row[]; bySource?: Row[]; byProduct?: Row[]; byProvince?: Row[]; byLostReason?: Row[]; byMonth?: Row[]; byDealer?: Row[] };
      return {
        byStatus: (d.byStatus ?? []).map(r => ({ status: String(r.status), count: Number(r.count), value: Number(r.value) })),
        bySource: (d.bySource ?? []).map(r => ({ source: String(r.source), count: Number(r.count) })),
        byProduct: (d.byProduct ?? []).map(r => ({ product: String(r.product), count: Number(r.count) })),
        byProvince: (d.byProvince ?? []).map(r => ({ province: String(r.province), count: Number(r.count) })),
        byLostReason: (d.byLostReason ?? []).map(r => ({ reason: String(r.reason), count: Number(r.count), value: Number(r.value) })),
        byMonth: (d.byMonth ?? []).map(r => ({ y: Number(r.y), m: Number(r.m), created: Number(r.new), won: Number(r.won), lost: Number(r.lost), quoted: Number(r.quoted ?? 0) })),
        byDealer: (d.byDealer ?? []).map(r => ({ dealerCode: String(r.dealer_code), leads: Number(r.leads), quoted: Number(r.quoted), won: Number(r.won ?? 0) })),
      };
    },
    networkQuoteRange: async (start, end, dealer) => {
      const { data, error } = await sb().rpc("network_quote_range", { p_start: start, p_end: end, p_dealer: dealer ?? null });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const m = new Map<string, QuoteRangeRow>();
      for (const r of (data as Row[]) ?? []) {
        m.set(String(r.dealer_code), {
          quotes: Number(r.quotes), won: Number(r.won), lost: Number(r.lost),
          wonVal: Number(r.won_val), quoteVal: Number(r.quote_val),
        });
      }
      return m;
    },
    dashboardQuoteSummary: async (start, end, dealer) => {
      const { data, error } = await sb().rpc("dashboard_quote_summary", { p_start: start, p_end: end, p_dealer: dealer ?? null });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { byMonth?: Row[]; byDay?: Row[]; byHour?: Row[]; byStatus?: Row[]; byProduct?: Row[] };
      return {
        byMonth: (d.byMonth ?? []).map(r => ({
          y: Number(r.y), m: Number(r.m), quotes: Number(r.quotes),
          won: Number(r.won), lost: Number(r.lost), wonVal: Number(r.won_val),
        })),
        // รายวัน/รายชั่วโมง (ใบ 0160) — กราฟช่วงสั้นใช้ชุดนี้ ไม่ต้องโหลดใบทั้งเครือมาไว้ในเครื่อง
        byDay: (d.byDay ?? []).map(r => ({ d: String(r.d), quotes: Number(r.quotes), won: Number(r.won), lost: Number(r.lost), wonVal: Number(r.won_val) })),
        byHour: (d.byHour ?? []).map(r => ({ h: Number(r.h), quotes: Number(r.quotes), won: Number(r.won), wonVal: Number(r.won_val) })),
        byStatus: (d.byStatus ?? []).map(r => ({ status: String(r.status), count: Number(r.count), value: Number(r.value) })),
        // won_value/won_projects = เฉพาะใบที่ปิดการขายได้ (migration 0132) — การ์ด "ยอดขาย" ใช้ตัวนี้
        byProduct: (d.byProduct ?? []).map(r => ({
          product: (r.product as string) ?? null,
          value: Number(r.value), projects: Number(r.projects),
          wonValue: Number(r.won_value ?? 0), wonProjects: Number(r.won_projects ?? 0),
        })),
      };
    },
    networkCustomerSummary: async (f) => {
      const { data, error } = await sb().rpc("network_customer_summary", {
        p_dealer_code: f?.dealerCode ?? null,
        p_date_start: f?.dateStart ?? null,
        p_date_end: f?.dateEnd ?? null,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { total?: number; byProvince?: Row[] };
      return {
        total: Number(d.total ?? 0),
        byProvince: (d.byProvince ?? []).map(r => ({ province: String(r.province), revenue: Number(r.revenue), count: Number(r.count) })),
      };
    },
    unassignedLeads: async (f) => {
      const { data, error } = await sb().rpc("unassigned_leads", {
        p_as_of: f.asOf ?? APP_NOW_ISO, p_default_hours: f.defaultHours ?? DEFAULT_LEAD_RULES.unassignedAlertHours, p_per_dealer: f.perDealer ?? null,
        p_dealer_codes: f.dealerCodes ?? null, p_province: f.province ?? null, p_product: f.product ?? null,
        p_source: f.source ?? null, p_search: (f.search ?? "").trim() || null,
        p_date_start: f.dateStart ?? null, p_date_end: f.dateEnd ?? null,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { total?: number; byDealer?: Row[] };
      return {
        total: Number(d.total ?? 0),
        byDealer: (d.byDealer ?? []).map(r => ({ dealerCode: String(r.dealer_code), count: Number(r.count) })),
      };
    },
    hqAlerts: async (f) => {
      const { data, error } = await sb().rpc("hq_alerts", {
        p_as_of: f.asOf ?? APP_NOW_ISO,
        p_unassigned_default_hours: f.unassignedDefaultHours ?? DEFAULT_LEAD_RULES.unassignedAlertHours, p_unassigned_per_dealer: f.unassignedPerDealer ?? null,
        p_lead_idle_days: f.leadIdleDays ?? DEFAULT_HQ_NOTIF_RULES.leadIdleDays, p_quote_validity_days: f.quoteValidityDays ?? DEFAULT_HQ_POLICY.quoteValidityDays,
        p_quote_expiring_days: f.quoteExpiringDays ?? DEFAULT_HQ_NOTIF_RULES.quoteExpiringDays, p_dealer_idle_days: f.dealerIdleDays ?? DEFAULT_HQ_NOTIF_RULES.dealerIdleDays,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { unassigned?: Row[]; idle?: Row[]; expiring?: Row[]; dealer_latest?: Row[]; lost_rate?: Row[] };
      return {
        unassigned: (d.unassigned ?? []).map(r => ({ numId: Number(r.num_id), dealerCode: (r.dealer_code as string) ?? null, company: String(r.company ?? ""), province: String(r.province ?? ""), value: String(r.value ?? "") })),
        idle: (d.idle ?? []).map(r => ({ numId: Number(r.num_id), dealerCode: (r.dealer_code as string) ?? null, company: String(r.company ?? ""), assigned: String(r.assigned ?? ""), idleDays: Number(r.idle_days) })),
        expiring: (d.expiring ?? []).map(r => ({ quoteNo: String(r.quote_no), customer: String(r.customer ?? ""), value: Number(r.value), dealerCode: (r.dealer_code as string) ?? null, daysLeft: Number(r.days_left) })),
        dealerLatest: (d.dealer_latest ?? []).map(r => ({ dealerCode: String(r.dealer_code), idleDays: Number(r.idle_days) })),
        lostRate: (d.lost_rate ?? []).map(r => ({ dealerCode: String(r.dealer_code), lost: Number(r.lost), closed: Number(r.closed) })),
      };
    },
    // หน้าเดียวของฐานข้อมูลลูกค้า HQ + KPI/กราฟ จากทั้งชุดที่กรองแล้ว (M9 Phase 6, migration 0080) —
    // ปลด /hq/customers จากการดึงทั้งตาราง (ดูรายละเอียด root cause ในคอมเมนต์ migration 0080)
    hqCustomersPage: async (opts) => {
      const { data, error } = await sb().rpc("hq_customers_page", {
        p_search: (opts.search ?? "").trim() || null,
        p_dealer_code: opts.dealerCode ?? null,
        p_provinces: opts.provinces?.length ? opts.provinces : null,
        p_building_type: opts.buildingType ?? null,
        // ⚠️ เคยมี p_delivery_year ตรงนี้ — ใบ 0159 ถอดออกแล้ว (วันส่งมอบเป็นค่าที่ระบบคิดเอง ไม่ใช่ข้อมูลจริง)
        p_bought_from: opts.boughtFrom ?? null,
        p_bought_to: opts.boughtTo ?? null,
        p_limit: opts.limit, p_offset: opts.offset,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = data as {
        total: number;
        kpi: { total: number; active: number; revenue: number; repeat: number };
        charts: {
          byType: { label: string; value: number }[]; bySubtype: { label: string; value: number }[];
          byProvince: { label: string; value: number }[]; byDealer: { code: string; name: string; value: number }[];
          revenueByDealer: { code: string; revenue: number }[];
        };
        rows: Row[];
      };
      return {
        total: d.total, kpi: d.kpi, charts: d.charts,
        rows: d.rows.map(r => ({
          id: Number(r.id), name: String(r.name ?? ""), dealerCode: String(r.dealer_code), dealerName: String(r.dealer_name ?? r.dealer_code),
          province: String(r.province ?? ""), totalValue: Number(r.total_value ?? 0),
          buildingTypes: (r.building_types as string[] | null) ?? [], templates: (r.templates as string[] | null) ?? [],
          lastPurchaseAt: (r.last_purchase_at as string | null) ?? null,
        })),
      };
    },
    hqOverview: async () => {
      const { data, error } = await sb().rpc("hq_overview");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return จัดรูปภาพรวมHQ(data);
    },
    hqCustomersFilterOptions: async () => {
      const { data, error } = await sb().rpc("hq_customers_filter_options");
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = data as { dealers: { code: string; name: string }[]; provinces: string[]; types: string[] };
      // RPC ยังคืน years มาด้วย (ของเดิม) แต่เลิกใช้แล้ว — วันส่งมอบไม่ใช่ข้อมูลจริง
      return { dealers: d.dealers, provinces: d.provinces, types: d.types };
    },
    hqQuotationsSummary: async (f) => {
      const { data, error } = await sb().rpc("hq_quotations_summary", {
        p_status: f.status ?? null, p_dealer_codes: f.dealerCodes ?? null, p_product_lines: f.productLines ?? null,
        p_search: (f.search ?? "").trim() || null, p_date_start: f.dateStart ?? null, p_date_end: f.dateEnd ?? null,
        p_as_of: f.asOf ?? APP_NOW_ISO, p_search_dealers: f.searchDealers ?? null,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { byDealer?: Row[]; byMonth?: Row[]; byProduct?: Row[]; aging?: Row[] };
      return {
        byDealer: (d.byDealer ?? []).map(r => ({
          dealerCode: String(r.dealer_code), count: Number(r.count), value: Number(r.value),
          sent: Number(r.sent), won: Number(r.won), lost: Number(r.lost), wonVal: Number(r.won_val),
          latest: (r.latest as string) ?? null,
        })),
        byMonth: (d.byMonth ?? []).map(r => ({
          y: Number(r.y), m: Number(r.m), quotes: Number(r.quotes), won: Number(r.won), lost: Number(r.lost), wonVal: Number(r.won_val),
        })),
        byProduct: (d.byProduct ?? []).map(r => ({ product: (r.product as string) ?? null, value: Number(r.value), projects: Number(r.projects) })),
        aging: (d.aging ?? []).map(r => ({ bucket: String(r.bucket), count: Number(r.count), value: Number(r.value) })),
      };
    },
  },

// งานขาย — RLS ที่ DB คุมขอบเขต (insert ต้องมี dealer_code = สาขา session · with-check)
  // leads ใช้ mapper เฉพาะ (leadToRow/rowToLead) เพราะ id เป็น text + createdAt/area ต้องแปลงพิเศษ
  leads: {
    // รายการไม่ดึง report — เป็นข้อความยาวที่ใช้เฉพาะในแผงรายละเอียด แต่กินที่ราว 1 ใน 3 ของขนาดแถว
    //   (วัดจริง 19 ส.ค. 69: แถวละ 2.18 KB · 3,000 แถว ≈ 6.4 MB ต่อการเปิดหน้าหนึ่งครั้ง)
    //   แผงรายละเอียดเรียก get() เติมให้ตอนเปิด — ห้ามเอา report กลับมาใส่ตรงนี้
    //   เด็ดขาด: ตัวแก้รายงานจะเห็นรายงานว่าง แล้วเขียนทับของจริงทันทีที่กดบันทึก
    list: async (scope) => {
      const rows = await pageAll((from, to) => {
        const base = sb().from("leads").select(LEAD_LIST_COLS)
          .order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
        return scope && !scope.isHQ && scope.dealerCode ? base.eq("dealer_code", scope.dealerCode) : base;
      }, "leads");
      return rows.map(rowToLead);
    },
    get: async (id) => {
      const { data, error } = await sb().from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return data ? rowToLead(data as Row) : null;
    },
    listPage: async (scope, opts) => {
      const args: Record<string, unknown> = {
        p_limit: opts.limit, p_offset: opts.offset,
        p_status: opts.status ?? null,
        p_dealer_codes: opts.dealerCodes ?? (scope && !scope.isHQ && scope.dealerCode ? [scope.dealerCode] : null),
        p_province: opts.province ?? null, p_product: opts.product ?? null, p_source: opts.source ?? null,
        p_search: (opts.search ?? "").trim() || null,
        p_date_start: opts.dateStart ?? null, p_date_end: opts.dateEnd ?? null,
        p_overdue: opts.overdue ?? false, p_as_of: opts.asOf ?? APP_NOW_ISO,
        p_default_days: opts.defaultDays ?? DEFAULT_LEAD_RULES.followUpAlertDays, p_follow_up_days: opts.perDealer ?? null,
      };
      // ผู้เรียกรู้จำนวนรวมแล้ว = ไม่ต้องให้ฐานข้อมูลนับใหม่ (ดูเหตุผลที่ ports.ts · knownTotal)
      // ⚠️ ฐานข้อมูลที่ยังไม่ได้ลง migration 0161 ไม่รู้จักพารามิเตอร์นี้ — ลองใหม่แบบเดิมครั้งเดียวแล้วจำไว้
      const ข้ามนับ = opts.knownTotal != null && opts.knownTotal >= 0 && ฐานข้อมูลข้ามการนับได้;
      let { data, error } = await sb().rpc("leads_page", ข้ามนับ ? { ...args, p_skip_count: true } : args);
      if (error && ข้ามนับ && /p_skip_count|Could not find the function/i.test(error.message)) {
        ฐานข้อมูลข้ามการนับได้ = false;
        ({ data, error } = await sb().rpc("leads_page", args));
      }
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { total?: number; rows?: Row[] };
      const นับได้ = Number(d.total ?? 0);
      return { rows: (d.rows ?? []).map(rowToLead), total: นับได้ < 0 ? (opts.knownTotal ?? 0) : นับได้ };
    },
    nextNumId: (dealerCode) => nextEntityId(dealerCode, "leads"),
    create: (row) => withNetworkRetry(async () => {
      const { data, error } = await sb().from("leads").insert(leadToRow(row)).select().single();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return rowToLead(data as Row);
    }),
    // ส่วนต่างเท่านั้น — ฐานรวมกับค่าล่าสุดเอง (ใบ 0211) · ไม่ลองซ้ำ: คำขอแรกอาจลงแล้ว ลองซ้ำ = จดไทม์ไลน์ซ้ำ
    apply: async (id, intent) => {
      const { data, error } = await sb().rpc("lead_apply", { p_id: id, p_intent: leadIntentToWire(intent) });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return rowToLead(data as Row);
    },
    remove: (id) => must(sb().from("leads").delete().eq("id", id)),
  },
  quotations: {
    list: async (scope) => {
      const rows = await pageAll((from, to) => {
        const base = sb().from("quotations").select("*")
          .order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
        return scope && !scope.isHQ && scope.dealerCode ? base.eq("dealer_code", scope.dealerCode) : base;
      }, "quotations");
      return rows.map(rowToQuote);
    },
    // หน้าเดียว + กรอง/เรียง ที่ DB (M9 Phase 2) — RLS คุม scope · derived filter ถูก resolve เป็นคอลัมน์จริงมาแล้ว
    listPage: async (scope, opts) => {
      const s = (opts.search ?? "").trim().replace(/[,()%*\\]/g, " ").trim(); // กันตัวอักษรที่ทำ or() พัง
      const buildQuery = (from: number, to: number) => {
        let q = opts.knownTotal != null && opts.knownTotal >= 0
          ? sb().from("quotations").select("*")                       // รู้จำนวนแล้ว — ข้ามการนับ
          : sb().from("quotations").select("*", { count: "exact" });
        if (scope && !scope.isHQ && scope.dealerCode) q = q.eq("dealer_code", scope.dealerCode);
        if (opts.status) q = q.eq("status", opts.status);
        if (opts.dealerCodes?.length) q = q.in("dealer_code", opts.dealerCodes);
        if (opts.productLines?.length) q = q.in("product_line", opts.productLines);
        if (opts.dateStart) q = q.gte("date", opts.dateStart);
        if (opts.dateEnd) q = q.lte("date", opts.dateEnd);
        if (s) {
          const parts = [`id.ilike.%${s}%`, `customer.ilike.%${s}%`];
          if (opts.searchDealers?.length) parts.push(`dealer_code.in.(${opts.searchDealers.join(",")})`);
          q = q.or(parts.join(","));
        }
        const col = opts.sort?.col ?? "date", asc = (opts.sort?.dir ?? "desc") === "asc";
        return q.order(col, { ascending: asc })
          .order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
      };
      const { rows, total } = await rangedFetch(buildQuery, opts.limit, opts.offset);
      return { rows: rows.map(rowToQuote), total: opts.knownTotal != null && opts.knownTotal >= 0 ? opts.knownTotal : total };
    },
    update: (row) => withNetworkRetry(async () => {
      const { data, error } = await sb().from("quotations").update(quoteToRow(row)).eq("id", row.id).select().single();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return rowToQuote(data as Row);
    }),
    remove: (id) => must(sb().from("quotations").delete().eq("id", id)),
    setStatus: (id, status) => must(sb().from("quotations").update({ status }).eq("id", id)),
    setStatusReconciled: (id, status) => withNetworkRetry(async () => {
      const { data, error } = await sb().rpc("set_quotation_status_reconciled", { p_quote_id: id, p_status: status });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const result = data as { quotation: Row; customer: Row | null };
      return {
        quotation: rowToQuote(result.quotation),
        customer: result.customer ? normalizeCustomer(toCamel<CustomerRow>(result.customer)) : null,
      };
    }),
    // ปิดใบที่เลยวันหมดอายุ — RLS ทำให้แต่ละสาขาปิดได้เฉพาะใบของตัวเอง (0019)
    //   validityDays = ใบที่ไม่ได้กรอก expiry เอง ใช้ date+validityDays แทน (นิยามเดียวกับ hq_alerts) · 0067
    expireOverdue: async (asOf, _scope, validityDays) => {
      const { data, error } = await sb().rpc("expire_quotations", { p_as_of: asOf, p_validity_days: validityDays ?? DEFAULT_HQ_POLICY.quoteValidityDays });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return Number(data ?? 0);
    },
    salesperson: async (quoteId, dealerCode) => {
      // ต้องส่งสาขาไปด้วย — เลขที่ใบซ้ำข้ามสาขาได้ (คีย์จริงคือ dealer_code + id ตั้งแต่ 0022)
      const { data, error } = await sb().rpc("quotation_salesperson", { p_quote_id: quoteId, p_dealer_code: dealerCode });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return (data as string | null) ?? null;
    },
    // ใบ won ของลูกค้ารายเดียว — bounded read ตรง ๆ (RLS คุม scope อยู่แล้ว) ไม่ต้อง RPC (M9 Phase 6)
    listForCustomer: async (customerId, dealerCode) => {
      // ต้องระบุสาขาเสมอ — customer_id ซ้ำกันได้ข้ามสาขา (คีย์จริงคือ dealer_code + id)
      //   RLS กันให้เฉพาะตอนที่ผู้เรียกเป็นดีลเลอร์ · แต่ HQ เห็นทั้งเครือ ถ้าไม่ระบุสาขา
      //   แผงลูกค้าฝั่ง HQ จะดึงใบของลูกค้าเลขเดียวกันจากสาขาอื่นมาปนด้วย
      const { data, error } = await sb().from("quotations").select("*")
        .eq("dealer_code", dealerCode).eq("customer_id", customerId).eq("status", "won").order("date", { ascending: true });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return (data as Row[]).map(rowToQuote);
    },
    // ผูกใบกำพร้าทั้งชุดในคำสั่งเดียว (RPC, 0093) — แทนที่ N คำขอ update แยกกัน (Phase 4 transaction)
    relinkCustomerQuotes: async (dealer, customerId, company, cascadeWon) => {
      const { data, error } = await sb().rpc("relink_customer_quotes", {
        p_dealer: dealer, p_customer_id: customerId, p_company: company, p_cascade_won: cascadeWon,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return (data as Row[]).map(rowToQuote);
    },
    // ออกเลข + insert รวด (atomic) — RPC ที่ DB (0034) · insert ล้ม = ตัวนับ rollback ไม่เดิน (H8)
    createNumbered: async (dealer, prefix, row) => {
      const payload = quoteToRow(row as unknown as QuotationMock);
      delete payload.id; delete payload.created_at; delete payload.dealer_code; // DB เป็นคนออกให้
      const { data, error } = await sb().rpc("create_quotation", {
        p_dealer: dealer, p_prefix: prefix ?? "Q-2026-", p_payload: payload,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return rowToQuote(data as Row);
    },
  },
  customers: {
    list: async (scope) => (await selectScoped<CustomerRow>("customers", scope)).map(normalizeCustomer),
    // หน้าเดียว + ค้นหา ที่ DB (M9 Phase 5) — เจาะจุดที่เคยดึงทั้งตารางแล้วกรองฝั่ง client (drawer/search)
    listPage: async (scope, opts) => {
      const s = (opts.search ?? "").trim().replace(/[,()%*\\]/g, " ").trim();
      const buildQuery = (from: number, to: number) => {
        let q = sb().from("customers").select("*", { count: "exact" });
        if (scope && !scope.isHQ && scope.dealerCode) q = q.eq("dealer_code", scope.dealerCode);
        if (opts.dealerCodes?.length) q = q.in("dealer_code", opts.dealerCodes);
        if (s) q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,province.ilike.%${s}%,phone.ilike.%${s}%`);
        return q.order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
      };
      const { rows, total } = await rangedFetch(buildQuery, opts.limit, opts.offset);
      return { rows: rows.map(r => normalizeCustomer(toCamel<CustomerRow>(r))), total };
    },
    nextId: (dealerCode) => nextEntityId(dealerCode, "customers"),
    create: (row) => insertRow<CustomerRow>("customers", row),
    update: (row) => updateRow<CustomerRow>("customers", row.id, row),
    remove: (id) => must(sb().from("customers").delete().eq("id", id)),
    // หาลูกค้าเดิม (ชื่อตรงเป๊ะ) หรือสร้างใหม่ แบบ atomic ที่ DB (0074) — กันแข่งกันสร้างลูกค้าซ้ำ
    // เมื่อปิดลูกค้าเป้าหมายชื่อเดียวกันพร้อมกัน 2 session (id/created_at ให้ DB เป็นคนออก เหมือน create_quotation)
    upsertForCompany: async (dealerCode, row) => {
      const payload = toSnake(row as unknown as Row);
      delete payload.id; delete payload.created_at; delete payload.dealer_code;
      const { data, error } = await sb().rpc("upsert_customer_for_company", { p_dealer: dealerCode, p_payload: payload });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return normalizeCustomer(toCamel<CustomerRow>(data as Row));
    },
    // รวมยอด won ที่ DB ตรง ๆ (0078) — กัน race ตอนแก้สถานะ 2 ใบพร้อมกันจาก 2 session
    reconcileWonTotal: (customerId) => withNetworkRetry(async () => {
      const { data, error } = await sb().rpc("reconcile_customer_won_total", { p_customer_id: customerId });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return normalizeCustomer(toCamel<CustomerRow>(data as Row));
    }),
    // ปิดการขายสำเร็จทั้งก้อนแบบ atomic (RPC, 0094/0095 — Phase 4 transaction)
    // คืนทั้งลูกค้าและใบเสนอราคาที่เกี่ยวข้องทั้งหมด (relink แล้ว) — ผู้เรียกอัปเดต local state ได้ทันที
    // ไม่ต้องรอ realtime round-trip
    closeWon: async ({ dealer, knownCustomerId, leadCompany, targetQuoteId, cascadeWon, customerPayload }) => {
      const payload = toSnake(customerPayload as unknown as Row);
      delete payload.id; delete payload.created_at; delete payload.dealer_code;
      const { data, error } = await sb().rpc("close_won_quotation", {
        p_dealer: dealer, p_known_customer_id: knownCustomerId, p_lead_company: leadCompany,
        p_target_quote_id: targetQuoteId, p_cascade_won: cascadeWon, p_customer_payload: payload,
      });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const result = data as { customer: Row; quotations: Row[] };
      return {
        customer: normalizeCustomer(toCamel<CustomerRow>(result.customer)),
        quotations: result.quotations.map(rowToQuote),
      };
    },
    // ลบลูกค้าพร้อมประวัติในทรานแซกชันเดียว (RPC, 0141 — ระยะ 2)
    //   กติกา "ยังมีดีลที่ขายอยู่ = ลบไม่ได้" อยู่ที่ฐานข้อมูลแล้ว ไม่ใช่แค่ที่หน้าจอ
    //   ไบต์ใน Storage ลบจาก DB ไม่ได้ (คนละระบบ) จึงคืนพาธกลับมาให้ผู้เรียกลบตาม
    deleteCascade: async (id) => {
      const { data, error } = await sb().rpc("delete_customer_cascade", { p_customer_id: id });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      const d = (data ?? {}) as { quotations?: number; leads?: number; storagePaths?: string[] };
      return { quotations: Number(d.quotations ?? 0), leads: Number(d.leads ?? 0), storagePaths: d.storagePaths ?? [] };
    },
  },
  appointments: {
    nextId: (dealerCode) => nextEntityId(dealerCode, "appointments"),
    list: async (scope) => {
      const rows = await pageAll((from, to) => {
        const base = sb().from("appointments").select("*")
          .order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
        return scope && !scope.isHQ && scope.dealerCode ? base.eq("dealer_code", scope.dealerCode) : base;
      }, "appointments");
      return rows.map(rowToAppt);
    },
    listForDealer: async (dealerCode) => {
      const { data, error } = await sb().from("appointments").select("*").eq("dealer_code", dealerCode).order("id", { ascending: true });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return (data as Row[]).map(rowToAppt);
    },
    listForLead: async (leadId, dealerCode) => {
      // เหตุผลเดียวกับ listForCustomer — lead_id (numId) ซ้ำข้ามสาขาได้
      const { data, error } = await sb().from("appointments").select("*")
        .eq("dealer_code", dealerCode).eq("lead_id", leadId).order("id", { ascending: true });
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return (data as Row[]).map(rowToAppt);
    },
    create: async (row) => {
      const { data, error } = await sb().from("appointments").insert(apptToRow(row)).select().single();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return rowToAppt(data as Row);
    },
    update: async (row) => {
      const { data, error } = await sb().from("appointments").update(apptToRow(row)).eq("id", row.id).select().single();
      if (error) throw new DbError(error.message, (error as { code?: string }).code);
      return rowToAppt(data as Row);
    },
    remove: (id) => must(sb().from("appointments").delete().eq("id", id)),
  },
};
