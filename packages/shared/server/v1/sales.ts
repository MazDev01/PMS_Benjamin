// ── /api/v1/{leads,quotations,customers,appointments} — โดเมนงานขาย ─────────────
//
// ระยะ 1 กลุ่มที่ 12–15 · กลุ่มหนักที่สุด (มี pagination + RPC + mapper เฉพาะ)
//
// พฤติกรรมคัดมาจาก SupabaseAdapter ทีละบรรทัด — ใช้ตัวแปลงแถวชุดเดียวกัน (rowMappers.ts)
// ไม่ได้เขียนใหม่ ไม่งั้นสองฝั่งจะแปลงข้อมูลไม่ตรงกันแบบที่ไม่มีใครเห็นจนกว่าจะพัง
//
// ⚠️ กติกาที่ห้ามหลุด (แต่ละข้อเคยเป็นบั๊กจริงมาแล้ว):
//   • ORDER ต้องพ่วง dealer_code เสมอ — เลขงานขายเดินแยกรายสาขา เสมอกันได้ข้ามสาขา
//   • listForCustomer / listForLead ต้องระบุสาขาเสมอ — id ซ้ำข้ามสาขาได้ HQ เห็นทั้งเครือ
//   • create/update ของใบ ต้องผ่าน quoteToRow (ตัด product_line ที่เป็นคอลัมน์ generated)
//   • งานที่ต้อง atomic ใช้ RPC เดิมทุกตัว ห้ามแตกเป็นหลายคำสั่ง
//
// ⚠️ ค่ากลาง (APP_NOW / DEFAULT_LEAD_RULES / DEFAULT_HQ_POLICY) เป็นของฝั่งแอป —
//    ผู้เรียกเติมมาให้แล้ว เซิร์ฟเวอร์ส่งต่อตรง ๆ (เหตุผลเดียวกับ settings/dealerSettings)
import type { NextRequest } from "next/server";
import { handler, ok, dbFail, fail, อ่านเมื่อop } from "./_ctx";
import { parse, str, num, bool, oneOf, arrOf, mapOfNum, isoDate } from "./_valid";
import { pageAll, rangedFetch, TIEBREAK_COL } from "./_page";
import { toCamel, toSnake } from "@pms/shared/lib/data/supabase/mappers";
import {
  normalizeCustomer, leadToRow, rowToLead, quoteToRow, rowToQuote, apptToRow, rowToAppt,
} from "@pms/shared/lib/data/supabase/rowMappers";
import type { LeadRow, QuotationMock, CustomerRow, AppointmentMock } from "@pms/shared/lib/data/types";
import { leadIntentToWire, type LeadIntent } from "@pms/shared/lib/leadIntent";
import { LEAD_STATUS_ORDER, type LeadStatus } from "@pms/shared/lib/mock";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
export { runtime } from "./_ctx";

const op = (req: NextRequest) => new URL(req.url).searchParams.get("op") ?? "";
const qp = (req: NextRequest, k: string) => new URL(req.url).searchParams.get(k) ?? "";
const scopeOf = (req: NextRequest) => {
  const u = new URL(req.url);
  return { dealer: u.searchParams.get("dealer") ?? "", isHQ: u.searchParams.get("hq") === "1" };
};
const body = <T,>(req: NextRequest) => req.json().catch(() => null) as Promise<T | null>;

// ── รูปร่างข้อมูลขาเข้าที่แต่ละเส้นทางยอมรับ (S-3) ────────────────────────────────
// ตรวจก่อนแตะฐานข้อมูลเสมอ — ผิดรูป = 400 บอกชื่อช่อง ไม่ใช่ปล่อยไประเบิดที่ฐานแล้วตอบ "ระบบขัดข้อง"
// ⚠️ ไม่ใช่ด่านสิทธิ์ — ใครเห็นข้อมูลอะไรยังเป็นเรื่องของ RLS เหมือนเดิม (ดู _ctx.ts)

/** เพดานจำนวนแถวต่อคำขอ
 *  ตารางบนหน้าจอขอทีละ 10-200 แถว แต่ปุ่ม "ส่งออกไฟล์" ขอ "ทั้งชุดหลังกรอง" ในคำขอเดียว
 *  (hq/leads:407 และ hq/quotations:262 ส่ง limit = จำนวนแถวทั้งหมด) — ตั้งต่ำกว่านี้ = ส่งออกพัง
 *  ตัวเลขนี้จึงเผื่อการส่งออกไว้เต็มที่ แต่ยังกันคนขอทีละล้านแถวเพื่อถ่วงระบบ */
const MAX_PAGE = 20000;
/** เพดานจำนวน "สาขา" ต่อคำขอ (รายการรหัสสาขา / เกณฑ์รายสาขา)
 *  ⚠️ เดิมตั้ง 100 — บั๊กจริงบนเว็บจริง 15 ก.ย. 69: เครือมีดีลเลอร์ 155 สาขา หน้า /hq/leads ส่งเกณฑ์ติดตามครบทุกสาขา
 *     ถูกปฏิเสธ 400 "perDealer มีได้ไม่เกิน 100 รายการ" → ตารางลูกค้าเป้าหมายโหลดไม่ขึ้น + แถบ "โหลดข้อมูลบางส่วนไม่สำเร็จ"
 *  ตั้งเผื่อการขยายเครือไว้มาก แต่ยังกันคำขอขนาดผิดปกติ */
export const MAX_DEALERS = 5000;
// ทุกสถานะจากตารางกลาง (LEAD_STATUS_META · Record ครบทุกค่า) — เดิมเขียนรายการแยกไว้และขาด "รอราคา HQ"
//   → กรองลีดด้วยสถานะนี้ผ่านเส้นทางของเว็บจริงได้ 400 (พบ 20 ต.ค. 69 ตอนเพิ่ม "ได้ราคา HQ")
const LEAD_STATUS = LEAD_STATUS_ORDER as readonly LeadStatus[];
const QUOTE_STATUS = ["draft", "sent_to_client", "won", "lost", "expired"] as const;

/** คอลัมน์ที่ยอมให้ใช้เรียงลำดับใบเสนอราคา — ชื่อคอลัมน์จากผู้เรียกวิ่งเข้า .order() ตรง ๆ
 *  ไม่จำกัดไว้ = ผู้เรียกสั่งเรียงด้วยคอลัมน์อะไรก็ได้ รวมถึงคอลัมน์ที่ไม่ได้ตั้งใจเปิด */
const QUOTE_SORT_COLS = ["date", "id", "customer", "total_value", "status", "province", "dealer_code", "expiry", "created_at"] as const;

/** ตัวกรอง + แบ่งหน้าของรายการลูกค้าเป้าหมาย (RPC leads_page) */
export const LEAD_PAGE_SHAPE = {
  limit:       num({ int: true, min: 1, max: MAX_PAGE, def: 50 }),
  offset:      num({ int: true, min: 0, max: 1_000_000, def: 0 }),
  status:      oneOf(LEAD_STATUS, { optional: true }),
  stage:       num({ int: true, min: 1, max: 7, optional: true }),   // เลขขั้น (leadStage.ts · ใบ 0251)
  dealerCodes: arrOf(str({ max: 20 }), { optional: true, max: MAX_DEALERS }),
  province:    str({ max: 100, optional: true }),
  product:     str({ max: 200, optional: true }),
  source:      str({ max: 100, optional: true }),
  search:      str({ max: 200, optional: true }),
  dateStart:   isoDate({ optional: true }),
  dateEnd:     isoDate({ optional: true }),
  overdue:     bool(),
  asOf:        isoDate({ optional: true }),
  defaultDays: num({ int: true, min: 0, max: 3650, optional: true }),
  perDealer:   mapOfNum({ optional: true, max: MAX_DEALERS }),
  // -1 = ไม่ได้ส่งมา (ผู้เรียกยังไม่รู้จำนวนรวม) · >= 0 = รู้แล้ว ให้ข้ามการนับที่ฐานข้อมูล
  knownTotal:  num({ int: true, min: -1, max: 100_000_000, def: -1 }),
} as const;

/** ตัวกรอง + แบ่งหน้า + เรียงของรายการใบเสนอราคา */
export const QUOTE_PAGE_SHAPE = {
  limit:          num({ int: true, min: 1, max: MAX_PAGE, def: 50 }),
  offset:         num({ int: true, min: 0, max: 1_000_000, def: 0 }),
  status:         oneOf(QUOTE_STATUS, { optional: true }),
  dealerCodes:    arrOf(str({ max: 20 }), { optional: true, max: MAX_DEALERS }),
  productLines:   arrOf(str({ max: 200 }), { optional: true, max: 100 }),
  searchDealers:  arrOf(str({ max: 20 }), { optional: true, max: MAX_DEALERS }),
  search:         str({ max: 200, optional: true }),
  dateStart:      isoDate({ optional: true }),
  dateEnd:        isoDate({ optional: true }),
  knownTotal:     num({ int: true, min: -1, max: 100_000_000, def: -1 }),
} as const;

/** ค่าที่ใช้แทน "ไม่ระบุ" ตอนส่งให้ RPC — ตัวตรวจคืนข้อความว่าง/NaN/null แล้วแต่ชนิด */
// ฐานข้อมูลรองรับสวิตช์ "ข้ามการนับ" (migration 0161) หรือยัง — ตรวจครั้งเดียวจากผลจริง
let ฐานข้อมูลข้ามการนับได้ = true;

const orNull = (v: string | number | null) =>
  v === "" || v === null || (typeof v === "number" && Number.isNaN(v)) ? null : v;

// ── เพดานของ "ดึงทั้งเครือทีเดียว" (วัดจริง 27 ส.ค. 69) ─────────────────────────
// ที่ข้อมูล 20,000 ลูกค้าเป้าหมาย เส้นทางนี้ใช้เวลา 29 วินาที และส่งกลับ 12MB ในคำขอเดียว
// หน้าเว็บไม่ได้ใช้เส้นทางนี้แล้ว (HQ อ่านผ่านตารางแบ่งหน้า/รายงานที่ฐานข้อมูล) แต่ยังเรียกได้อยู่
//   = ทั้งจุดที่ทำให้เซิร์ฟเวอร์ค้าง และช่องดูดข้อมูลทั้งเครือออกไปในคำขอเดียว
// จึงจำกัดไว้ที่ 5,000 แถวสำหรับ scope ทั้งเครือ แล้วติดธง partial กลับไปให้ผู้เรียกรู้ว่าไม่ครบ
//   (ยังไม่ตัดทิ้ง เผื่อมีผู้เรียกเก่าที่เครือข่ายยังเล็ก — แต่จะไม่มีวันดึง 12MB อีก)
const HQ_LIST_CAP = 5_000;

/** ไล่ดึงทั้งตารางของ scope นั้น (เรียงเสถียร) — คืนธง partial ให้ฝั่งแอปเตือนเมื่อชนเพดาน */
function listAll(sb: SupabaseClient, table: string, dealer: string, isHQ: boolean) {
  const ทั้งเครือ = isHQ || !dealer;
  return pageAll((from, to) => {
    const base = sb.from(table).select("*")
      .order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
    return !isHQ && dealer ? base.eq("dealer_code", dealer) : base;
  }, ทั้งเครือ ? HQ_LIST_CAP : undefined);
}

// ── ลูกค้าเป้าหมาย ──────────────────────────────────────────────────────────────
export const leadsGET = handler("leads.list", async (req, sb) => {
  const { dealer, isHQ } = scopeOf(req);
  const { rows, partial } = await listAll(sb, "leads", dealer, isHQ);
  return ok({ rows: rows.map(rowToLead), partial });
});

export const leadsPOST = handler("leads.write", async (req, sb) => {
  const o = op(req);
  // ลูกค้าเป้าหมายรายเดียวแบบครบทุกคอลัมน์ — แผงรายละเอียดเรียกตอนเปิด
  //   (รายการไม่ดึง report มาด้วยเพราะเป็นข้อความยาว — ดู LEAD_LIST_COLS ใน SupabaseAdapter)
  if (o === "get") {
    const b = parse({ id: str({ max: 40 }) }, await body<unknown>(req));
    const { data, error } = await sb.from("leads").select("*").eq("id", b.id).maybeSingle();
    if (error) return dbFail("leads.get", error);
    return ok(data ? rowToLead(data as Row) : null);
  }
  // ── บันทึกส่วนต่าง: ทางเดียวที่แก้ลูกค้าเป้าหมาย (ใบ 0211 · ก่อนขึ้นระบบจริง ข้อ 14) ──
  //   ฐานรวมกับค่าล่าสุด + บังคับกฎปิดการขายเอง (เดิมตรวจที่นี่ — ต่อฐานตรงข้ามได้)
  if (o === "apply") {
    const b = await body<{ id?: unknown; intent?: unknown }>(req);
    const id = typeof b?.id === "string" ? b.id : "";
    const i = b?.intent as Record<string, unknown> | undefined;
    const ผิด = !id || id.length > 40 ? "ไม่ได้ระบุลูกค้าเป้าหมายที่จะแก้"
      : !i || typeof i !== "object" || Array.isArray(i) ? "เจตนาไม่ถูกต้อง"
      : i.fields != null && (typeof i.fields !== "object" || Array.isArray(i.fields)) ? "fields ต้องเป็นออบเจ็กต์"
      : i.tasks != null && (!Array.isArray(i.tasks) || i.tasks.length > 50) ? "tasks ต้องเป็นรายการ (ไม่เกิน 50)"
      : i.activities != null && (!Array.isArray(i.activities) || i.activities.length > 20) ? "activities ต้องเป็นรายการ (ไม่เกิน 20)"
      : i.stage != null && (typeof i.stage !== "object" || !(LEAD_STATUS as readonly string[]).includes(String((i.stage as { status?: unknown }).status))) ? "ขั้นไม่ถูกต้อง"
      : i.deriveStage != null && i.deriveStage !== "any" && i.deriveStage !== "up" ? "deriveStage ไม่ถูกต้อง"   // แอปรุ่นเก่ายังส่ง — ฐานเมินแล้ว (ใบ 0232)
      : JSON.stringify(i).length > 400_000 ? "ข้อมูลใหญ่เกิน" : "";
    if (ผิด) return fail(400, ผิด);
    const { data, error } = await sb.rpc("lead_apply", { p_id: id, p_intent: leadIntentToWire(i as LeadIntent) });
    if (error) return dbFail("leads.apply", error);
    return ok(rowToLead(data as Row));
  }
  if (o === "next") {
    const b = parse({ dealerCode: str({ max: 20 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("next_entity_id", { p_dealer: b.dealerCode, p_entity: "leads" });
    if (error) return dbFail("leads.nextNumId", error);
    return ok(Number(data));
  }
  if (o === "page") {
    // ทั้งชุดคิดที่ DB ผ่าน RPC leads_page — ตัวกรอง overdue ต้องใช้เกณฑ์รายสาขา คิดฝั่งแอปไม่ได้
    const f = parse(LEAD_PAGE_SHAPE, await body<unknown>(req));
    const รู้จำนวนแล้ว = f.knownTotal >= 0;
    const args: Record<string, unknown> = {
      p_limit: f.limit, p_offset: f.offset,
      p_status: orNull(f.status), p_stage: f.stage ?? null, p_dealer_codes: f.dealerCodes,
      p_province: orNull(f.province), p_product: orNull(f.product), p_source: orNull(f.source),
      p_search: orNull(f.search), p_date_start: f.dateStart, p_date_end: f.dateEnd,
      p_overdue: f.overdue, p_as_of: f.asOf,
      p_default_days: orNull(f.defaultDays), p_follow_up_days: f.perDealer,
    };
    // ⚠️ ฐานข้อมูลที่ยังไม่ได้ลง migration 0161 จะไม่รู้จักพารามิเตอร์นี้ และปฏิเสธทั้งคำขอ
    //    จึงลองแบบใหม่ก่อน แล้วตกกลับไปแบบเดิมครั้งเดียว (จำไว้ ไม่ต้องลองซ้ำทุกคำขอ)
    let { data, error } = รู้จำนวนแล้ว && ฐานข้อมูลข้ามการนับได้
      ? await sb.rpc("leads_page", { ...args, p_skip_count: true })
      : await sb.rpc("leads_page", args);
    if (error && รู้จำนวนแล้ว && ฐานข้อมูลข้ามการนับได้ && /p_skip_count|Could not find the function/i.test(error.message)) {
      ฐานข้อมูลข้ามการนับได้ = false;
      console.warn("[api/v1/leads.listPage] ฐานข้อมูลยังไม่มี migration 0161 — กลับไปนับทุกครั้งตามเดิม");
      ({ data, error } = await sb.rpc("leads_page", args));
    }
    if (error) return dbFail("leads.listPage", error);
    const d = (data ?? {}) as { total?: number; rows?: Row[] };
    // ฐานข้อมูลคืน -1 เมื่อ "ไม่ได้นับ" — ใช้จำนวนที่ผู้เรียกรู้อยู่แล้วแทน (ห้ามคืน -1 ให้หน้าจอ)
    const นับได้ = Number(d.total ?? 0);
    return ok({ rows: (d.rows ?? []).map(rowToLead), total: นับได้ < 0 ? f.knownTotal : นับได้ });
  }
  const row = await body<LeadRow>(req);
  if (!row) return fail(400, "ข้อมูลลูกค้าเป้าหมายไม่ถูกต้อง");
  const { data, error } = await sb.from("leads").insert(leadToRow(row)).select().single();
  if (error) return dbFail("leads.create", error);
  return ok(rowToLead(data as Row));
}, { อ่าน: อ่านเมื่อop("get", "page", "salesperson", "for-customer") });

// -- แก้ลูกค้าเป้าหมายทั้งแถว / ตั้งสถานะตรง: ปิดแล้ว (15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 14) --
// หน้าที่เปิดค้างเขียนสำเนาเก่าทับงาน/ขั้นที่ฐานเพิ่งตั้ง → ใช้ POST /leads?op=apply (ส่วนต่าง) ทางเดียว
// กฎปิดการขาย (ปิดสำเร็จต้องมีใบที่ส่งแล้ว · ปิดไม่สำเร็จต้องมีเหตุผล) ย้ายไปบังคับในฐาน (lead_apply · ใบ 0211)
export const leadsPUT = handler("leads.update", async () =>
  fail(410, "ทางนี้ปิดแล้ว — แก้ลูกค้าเป้าหมายด้วย POST /api/v1/leads?op=apply (ส่งเฉพาะส่วนต่าง)"));

// -- ลบแล้วต้องรู้ว่าลบได้จริงไหม (ตรวจพบ 27 ส.ค. 69 จากการยิง API จริง) --
// เดิม delete() ไม่ขอผลกลับ -> ฐานข้อมูลกันไว้ (กฎความปลอดภัยข้ามสาขา) หรือไม่มีแถวนั้นอยู่จริง
// ก็ยัง "ไม่มี error" แล้วเราตอบ {ok:true} -> หน้าจอขึ้นว่า "ลบแล้ว" ทั้งที่ข้อมูลยังอยู่ครบ
// หลักฐาน: ดีลเลอร์ RYG สั่งลบลีดของสาขา CNX -> 200 ok แต่ลีดยังอยู่
// ขอ .select() กลับมาเสมอ แล้วนับแถวที่หายจริง -- 0 แถว = 404 ไม่ใช่ความสำเร็จ
export const leadsDELETE = handler("leads.remove", async (req, sb) => {
  const id = str({ max: 40 })(qp(req, "id"), "id");
  const { data, error } = await sb.from("leads").delete().eq("id", id).select("id");
  if (error) return dbFail("leads.remove", error);
  if (!data?.length) return fail(404, "ลบลูกค้าเป้าหมายไม่สำเร็จ — ไม่พบรายการนี้ หรือไม่มีสิทธิ์ลบ");
  return ok({ ok: true });
});

// ── ใบเสนอราคา ──────────────────────────────────────────────────────────────────
export const quotesGET = handler("quotations.list", async (req, sb) => {
  const o = op(req);
  if (o === "salesperson") {
    // ต้องส่งสาขาไปด้วย — เลขที่ใบซ้ำข้ามสาขาได้ (คีย์จริงคือ dealer_code + id)
    const { data, error } = await sb.rpc("quotation_salesperson", {
      p_quote_id: str({ max: 40 })(qp(req, "id"), "id"),
      p_dealer_code: str({ max: 20 })(qp(req, "dealer"), "dealer"),
    });
    if (error) return dbFail("quotations.salesperson", error);
    return ok((data as string | null) ?? null);
  }
  if (o === "for-customer") {
    const dealer = str({ max: 20 })(qp(req, "dealer"), "dealer");
    const cid = num({ int: true, min: 0 })(qp(req, "customerId"), "customerId");
    const { data, error } = await sb.from("quotations").select("*")
      .eq("dealer_code", dealer).eq("customer_id", cid).eq("status", "won").order("date", { ascending: true });
    if (error) return dbFail("quotations.listForCustomer", error);
    return ok((data as Row[]).map(rowToQuote));
  }
  const { dealer, isHQ } = scopeOf(req);
  const { rows, partial } = await listAll(sb, "quotations", dealer, isHQ);
  return ok({ rows: rows.map(rowToQuote), partial });
});

export const quotesPOST = handler("quotations.write", async (req, sb) => {
  const o = op(req);
  if (o === "page") {
    const raw = (await body<Record<string, unknown>>(req)) ?? {};
    const f = parse(QUOTE_PAGE_SHAPE, raw);
    // การเรียงมาเป็นอ็อบเจกต์ย่อย ตรวจแยก — ชื่อคอลัมน์ต้องอยู่ในรายการที่เปิดไว้เท่านั้น
    const sortRaw = (raw.sort ?? {}) as Record<string, unknown>;
    const sortCol = oneOf(QUOTE_SORT_COLS, { optional: true })(sortRaw.col, "sort.col") || "date";
    const sortAsc = oneOf(["asc", "desc"] as const, { optional: true })(sortRaw.dir, "sort.dir") === "asc";
    const { dealer, isHQ } = scopeOf(req);
    const s = f.search.replace(/[,()%*\\]/g, " ").trim();   // กันตัวอักษรที่ทำ or() พัง
    // ผู้เรียกรู้จำนวนรวมอยู่แล้ว (กดเปลี่ยนหน้าโดยตัวกรองเท่าเดิม) = ไม่ต้องให้ฐานข้อมูลนับใหม่
    //   วัดจริงที่ 10,000 ใบ: การนับแบบเป๊ะคือส่วนที่กินเวลาเกือบทั้งหมดของคำขอ
    const นับด้วย = f.knownTotal >= 0 ? undefined : ("exact" as const);
    const build = (from: number, to: number) => {
      let q = นับด้วย ? sb.from("quotations").select("*", { count: นับด้วย }) : sb.from("quotations").select("*");
      if (!isHQ && dealer) q = q.eq("dealer_code", dealer);
      if (f.status) q = q.eq("status", f.status);
      if (f.dealerCodes?.length) q = q.in("dealer_code", f.dealerCodes);
      if (f.productLines?.length) q = q.in("product_line", f.productLines);
      if (f.dateStart) q = q.gte("date", f.dateStart);
      if (f.dateEnd) q = q.lte("date", f.dateEnd);
      if (s) {
        const parts = [`id.ilike.%${s}%`, `customer.ilike.%${s}%`];
        if (f.searchDealers?.length) parts.push(`dealer_code.in.(${f.searchDealers.join(",")})`);
        q = q.or(parts.join(","));
      }
      return q.order(sortCol, { ascending: sortAsc })
        .order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
    };
    const { rows, total } = await rangedFetch<Row>(build, f.limit, f.offset);
    const จำนวนรวม = f.knownTotal >= 0 ? f.knownTotal : total;
    return ok({ rows: rows.map(rowToQuote), total: จำนวนรวม });
  }
  if (o === "numbered") {
    // ออกเลข + insert รวดเดียว (RPC 0034) — insert ล้ม = ตัวนับ rollback ไม่เดิน
    const b = await body<{ dealer?: string; prefix?: string; row?: QuotationMock }>(req);
    if (!b?.dealer || !b.row) return fail(400, "ต้องระบุสาขาและข้อมูลใบ");
    const payload = quoteToRow(b.row);
    delete payload.id; delete payload.created_at; delete payload.dealer_code;   // DB เป็นคนออกให้
    const { data, error } = await sb.rpc("create_quotation", { p_dealer: b.dealer, p_prefix: b.prefix ?? "Q-2026-", p_payload: payload });
    if (error) return dbFail("quotations.createNumbered", error);
    return ok(rowToQuote(data as Row));
  }
  if (o === "new-version") {
    // ทำฉบับใหม่จากใบที่ส่งแล้ว (RPC 0228 · ฐานตรวจสิทธิ์สาขา/สถานะเอง)
    const b = parse({ dealer: str({ max: 20 }), id: str({ max: 60 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("quotation_new_version", { p_dealer: b.dealer, p_id: b.id });
    if (error) return dbFail("quotations.newVersion", error);
    return ok(rowToQuote(data as Row));
  }
  if (o === "expire") {
    const b = parse({ asOf: isoDate({ optional: true }), validityDays: num({ int: true, min: 1, max: 3650, optional: true }) },
      await body<unknown>(req));
    const { data, error } = await sb.rpc("expire_quotations", { p_as_of: b.asOf, p_validity_days: orNull(b.validityDays) });
    if (error) return dbFail("quotations.expireOverdue", error);
    return ok(Number(data ?? 0));
  }
  if (o === "relink") {
    const b = parse({
      dealer: str({ max: 20 }), customerId: num({ int: true, min: 0 }),
      company: str({ max: 300, optional: true }), cascadeWon: bool(),
    }, await body<unknown>(req));
    const { data, error } = await sb.rpc("relink_customer_quotes", {
      p_dealer: b.dealer, p_customer_id: b.customerId, p_company: b.company, p_cascade_won: b.cascadeWon,
    });
    if (error) return dbFail("quotations.relinkCustomerQuotes", error);
    return ok((data as Row[]).map(rowToQuote));
  }
  // ทางเขียนใบตรง ๆ (Flow เก่า: ใบไม่มีใบ HQ) ปิดแล้ว 16 ต.ค. 69 — ใบใหม่ใช้ op=numbered ที่ผูกใบ HQ เท่านั้น
  //   (ฐานปฏิเสธใบที่ไม่มีใบ HQ อยู่แล้วตั้งแต่ใบ 0201 · ตอบ 410 ให้ชัดว่าทางนี้เลิกใช้ ไม่ใช่ข้อมูลผิด)
  return fail(410, "ทางนี้ปิดแล้ว — ออกใบเสนอราคาใหม่ด้วย POST /api/v1/quotations?op=numbered จากใบ HQ");
}, { อ่าน: อ่านเมื่อop("page") });

export const quotesPUT = handler("quotations.update", async (req, sb) => {
  const o = op(req);
  if (o === "send") {
    // ส่งใบให้ลูกค้า / ส่งอีกครั้ง — เปลี่ยนแค่สถานะ + วันที่ส่ง ราคาเป็นของในฐาน (RPC 0238 · ห้ามรับทั้งแถวจากหน้าจอ)
    const b = parse({ dealer: str({ max: 20 }), id: str({ max: 60 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("quotation_send", { p_dealer: b.dealer, p_id: b.id });
    if (error) return dbFail("quotations.send", error);
    return ok(rowToQuote(data as Row));
  }
  if (o === "print") {
    // ข้อมูลพิมพ์ใบให้ลูกค้า (RPC 0247) — ฐานตรวจข้อมูลบริษัทครบ + จดเวลาพิมพ์ · คืนหัวกระดาษที่ต้องพิมพ์
    const b = parse({ dealer: str({ max: 20 }), id: str({ max: 60 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("quotation_print_data", { p_dealer: b.dealer, p_id: b.id });
    if (error) return dbFail("quotations.printData", error);
    return ok(data);
  }
  if (o === "status" || o === "status-reconciled") {
    const b = parse({ id: str({ max: 40 }), status: oneOf(QUOTE_STATUS) }, await body<unknown>(req));
    if (o === "status") {
      const { error } = await sb.from("quotations").update({ status: b.status }).eq("id", b.id);
      if (error) return dbFail("quotations.setStatus", error);
      return ok({ ok: true });
    }
    // เปลี่ยนสถานะ + รวมยอดลูกค้าใหม่ ในทรานแซกชันเดียว (0102) — แยกสองคำสั่งเคยได้ยอด 0
    const { data, error } = await sb.rpc("set_quotation_status_reconciled", { p_quote_id: b.id, p_status: b.status });
    if (error) return dbFail("quotations.setStatusReconciled", error);
    const r = data as { quotation: Row; customer: Row | null };
    return ok({
      quotation: rowToQuote(r.quotation),
      customer: r.customer ? normalizeCustomer(toCamel<CustomerRow>(r.customer)) : null,
    });
  }
  const row = await body<QuotationMock>(req);
  if (!row?.id) return fail(400, "ไม่ได้ระบุใบที่จะแก้");

  // ⚠️ เลขฉบับ (V1→V2) ไม่ได้ตัดสินที่นี่ — อยู่ที่ SalesContext.updateQuotation ที่เดียว
  //    (ดู lib/quoteRevision.ts) เพราะกติกาต้องเหมือนกันทั้งสามโหมด ไม่ใช่มีเฉพาะโหมด api
  //    เคยลองย้ายมาไว้ตรงนี้ (27 ส.ค. 69) แล้วพบสองปัญหา จึงถอยกลับ:
  //      • โหมดที่ใช้จริงคือ supabase (หน้าเว็บยิงเข้าฐานข้อมูลตรง) — โค้ดตรงนี้ไม่เคยถูกเรียก
  //      • ที่นี่แยกไม่ออกว่า "แก้เนื้อหาใบ" หรือ "แค่เปลี่ยนสถานะ" — กดปฏิเสธ/ส่งอีกครั้ง
  //        ก็ขึ้นฉบับใหม่ไปด้วย ทั้งที่ไม่มีใครแก้อะไรบนกระดาษเลย (ยิงพิสูจน์แล้ว V1 → V2)
  const { data, error } = await sb.from("quotations").update(quoteToRow(row)).eq("id", row.id).select().single();
  if (error) return dbFail("quotations.update", error);
  return ok(rowToQuote(data as Row));
});

export const quotesDELETE = handler("quotations.remove", async (req, sb) => {
  const id = str({ max: 40 })(qp(req, "id"), "id");
  const { data, error } = await sb.from("quotations").delete().eq("id", id).select("id");
  if (error) return dbFail("quotations.remove", error);
  if (!data?.length) return fail(404, "ลบใบเสนอราคาไม่สำเร็จ — ไม่พบรายการนี้ หรือไม่มีสิทธิ์ลบ");
  return ok({ ok: true });
});

// ── ลูกค้า ──────────────────────────────────────────────────────────────────────
export const customersGET = handler("customers.list", async (req, sb) => {
  const { dealer, isHQ } = scopeOf(req);
  const { rows, partial } = await listAll(sb, "customers", dealer, isHQ);
  return ok({ rows: rows.map(r => normalizeCustomer(toCamel<CustomerRow>(r))), partial });
});

export const customersPOST = handler("customers.write", async (req, sb) => {
  const o = op(req);
  if (o === "next") {
    const b = parse({ dealerCode: str({ max: 20 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("next_entity_id", { p_dealer: b.dealerCode, p_entity: "customers" });
    if (error) return dbFail("customers.nextId", error);
    return ok(Number(data));
  }
  if (o === "page") {
    const f = parse({
      limit:       num({ int: true, min: 1, max: MAX_PAGE, def: 50 }),
      offset:      num({ int: true, min: 0, max: 1_000_000, def: 0 }),
      search:      str({ max: 200, optional: true }),
      dealerCodes: arrOf(str({ max: 20 }), { optional: true, max: MAX_DEALERS }),
      knownTotal:  num({ int: true, min: -1, max: 100_000_000, def: -1 }),
    }, await body<unknown>(req));
    const { dealer, isHQ } = scopeOf(req);
    const s = f.search.replace(/[,()%*\\]/g, " ").trim();
    const build = (from: number, to: number) => {
      let q = f.knownTotal >= 0 ? sb.from("customers").select("*") : sb.from("customers").select("*", { count: "exact" });
      if (!isHQ && dealer) q = q.eq("dealer_code", dealer);
      const codes = f.dealerCodes ?? undefined;
      if (codes?.length) q = q.in("dealer_code", codes);
      if (s) q = q.or(`name.ilike.%${s}%,company.ilike.%${s}%,province.ilike.%${s}%,phone.ilike.%${s}%`);
      return q.order("id", { ascending: true }).order(TIEBREAK_COL, { ascending: true }).range(from, to);
    };
    const { rows, total } = await rangedFetch<Row>(build, f.limit, f.offset);
    const จำนวนรวม = f.knownTotal >= 0 ? f.knownTotal : total;
    return ok({ rows: rows.map(r => normalizeCustomer(toCamel<CustomerRow>(r))), total: จำนวนรวม });
  }
  if (o === "upsert-company" || o === "close-won") {
    const b = await body<Record<string, unknown>>(req);
    if (!b) return fail(400, "ข้อมูลไม่ถูกต้อง");
    const payload = toSnake((b.payload ?? {}) as Row);
    delete payload.id; delete payload.created_at; delete payload.dealer_code;   // DB เป็นคนออกให้
    if (o === "upsert-company") {
      // หาลูกค้าชื่อตรงเป๊ะ หรือสร้างใหม่ ในทรานแซกชันเดียว (0074) — กันแข่งกันสร้างซ้ำ
      const { data, error } = await sb.rpc("upsert_customer_for_company", { p_dealer: b.dealer, p_payload: payload });
      if (error) return dbFail("customers.upsertForCompany", error);
      return ok(normalizeCustomer(toCamel<CustomerRow>(data as Row)));
    }
    // ปิดการขายทั้งก้อน: หา/สร้างลูกค้า + ผูกใบกำพร้า + บังคับใบเป้าหมาย + รวมยอด ในคำสั่งเดียว (0094/0095)
    const { data, error } = await sb.rpc("close_won_quotation", {
      p_dealer: b.dealer, p_known_customer_id: b.knownCustomerId ?? null, p_lead_company: b.leadCompany,
      p_target_quote_id: b.targetQuoteId ?? null, p_cascade_won: !!b.cascadeWon, p_customer_payload: payload,
    });
    if (error) return dbFail("customers.closeWon", error);
    const r = data as { customer: Row; quotations: Row[] };
    return ok({ customer: normalizeCustomer(toCamel<CustomerRow>(r.customer)), quotations: r.quotations.map(rowToQuote) });
  }
  if (o === "delete-cascade") {
    // กติกา "ยังมีดีลที่ขายอยู่ = ลบไม่ได้" อยู่ในตัว RPC — เซิร์ฟเวอร์ไม่ตัดสินซ้ำ (สองที่ = ไม่ตรงกันวันหนึ่ง)
    const b = parse({ customerId: num({ int: true, min: 0 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("delete_customer_cascade", { p_customer_id: b.customerId });
    if (error) return dbFail("customers.deleteCascade", error);
    return ok(data);
  }
  if (o === "reconcile") {
    const b = parse({ customerId: num({ int: true, min: 0 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("reconcile_customer_won_total", { p_customer_id: b.customerId });
    if (error) return dbFail("customers.reconcileWonTotal", error);
    return ok(normalizeCustomer(toCamel<CustomerRow>(data as Row)));
  }
  const row = await body<CustomerRow>(req);
  if (!row) return fail(400, "ข้อมูลลูกค้าไม่ถูกต้อง");
  const { data, error } = await sb.from("customers").insert(toSnake(row as unknown as Row)).select().single();
  if (error) return dbFail("customers.create", error);
  return ok(normalizeCustomer(toCamel<CustomerRow>(data as Row)));
}, { อ่าน: อ่านเมื่อop("page", "for-lead", "for-dealer") });

export const customersPUT = handler("customers.update", async (req, sb) => {
  const row = await body<CustomerRow>(req);
  if (row?.id == null) return fail(400, "ไม่ได้ระบุลูกค้าที่จะแก้");
  const { data, error } = await sb.from("customers").update(toSnake(row as unknown as Row)).eq("id", row.id).select().single();
  if (error) return dbFail("customers.update", error);
  return ok(normalizeCustomer(toCamel<CustomerRow>(data as Row)));
});

export const customersDELETE = handler("customers.remove", async (req, sb) => {
  const id = num({ int: true, min: 0 })(qp(req, "id"), "id");
  const { data, error } = await sb.from("customers").delete().eq("id", id).select("id");
  if (error) return dbFail("customers.remove", error);
  if (!data?.length) return fail(404, "ลบลูกค้าไม่สำเร็จ — ไม่พบรายการนี้ หรือไม่มีสิทธิ์ลบ");
  return ok({ ok: true });
});

// ── นัดหมาย ─────────────────────────────────────────────────────────────────────
export const apptGET = handler("appointments.list", async (req, sb) => {
  const o = op(req);
  const dealer = qp(req, "dealer");
  if (o === "for-lead" || o === "for-dealer") {
    // ระบุสาขาเสมอ — lead_id (numId) และเลขนัดหมายซ้ำข้ามสาขาได้
    if (!dealer) return fail(400, "ไม่ได้ระบุสาขา");
    let q = sb.from("appointments").select("*").eq("dealer_code", dealer);
    if (o === "for-lead") {
      const lead = Number(qp(req, "lead"));
      if (!Number.isFinite(lead)) return fail(400, "ไม่ได้ระบุลูกค้าเป้าหมาย");
      q = q.eq("lead_id", lead);
    }
    const { data, error } = await q.order("id", { ascending: true });
    if (error) return dbFail(`appointments.${o}`, error);
    return ok((data as Row[]).map(rowToAppt));
  }
  const { isHQ } = scopeOf(req);
  const { rows, partial } = await listAll(sb, "appointments", dealer, isHQ);
  return ok({ rows: rows.map(rowToAppt), partial });
});

export const apptPOST = handler("appointments.write", async (req, sb) => {
  if (op(req) === "next") {
    const b = parse({ dealerCode: str({ max: 20 }) }, await body<unknown>(req));
    const { data, error } = await sb.rpc("next_entity_id", { p_dealer: b.dealerCode, p_entity: "appointments" });
    if (error) return dbFail("appointments.nextId", error);
    return ok(Number(data));
  }
  const row = await body<AppointmentMock>(req);
  if (!row) return fail(400, "ข้อมูลนัดหมายไม่ถูกต้อง");
  const { data, error } = await sb.from("appointments").insert(apptToRow(row)).select().single();
  if (error) return dbFail("appointments.create", error);
  return ok(rowToAppt(data as Row));
});

export const apptPUT = handler("appointments.update", async (req, sb) => {
  const row = await body<AppointmentMock>(req);
  if (row?.id == null) return fail(400, "ไม่ได้ระบุนัดหมายที่จะแก้");
  const { data, error } = await sb.from("appointments").update(apptToRow(row)).eq("id", row.id).select().single();
  if (error) return dbFail("appointments.update", error);
  return ok(rowToAppt(data as Row));
});

export const apptDELETE = handler("appointments.remove", async (req, sb) => {
  const id = Number(qp(req, "id"));
  if (!Number.isFinite(id)) return fail(400, "ไม่ได้ระบุนัดหมายที่จะลบ");
  const { data, error } = await sb.from("appointments").delete().eq("id", id).select("id");
  if (error) return dbFail("appointments.remove", error);
  if (!data?.length) return fail(404, "ลบนัดหมายไม่สำเร็จ — ไม่พบรายการนี้ หรือไม่มีสิทธิ์ลบ");
  return ok({ ok: true });
});
