import { expect, type Page, type Locator } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, ADMIN, RYG, CNX, type Account, appEnv } from "./supabaseEnv";
import { SESSION_KEY, getSession, settle, ติดตามคำขอ, เข้าระบบด้วยคุกกี้, ล็อกอินใหม่ } from "./helpers";
import { ที่อยู่เว็บ } from "./sessionPorts";

// ที่อยู่เว็บของโฟลเดอร์นี้ (พอร์ตจาก sessionPorts.ts · ตั้งทับด้วย PMS_*_ORIGIN)
export const DEALER_ORIGIN = ที่อยู่เว็บ.dealer;
export const HQ_ORIGIN = ที่อยู่เว็บ.hq;

// เสียงรบกวนที่ไม่ใช่ error ของแอป
const NOISE = /favicon|hydrat|Download the React DevTools|Fast Refresh|preloaded using link preload/i;

/** เฝ้า error ของหน้า — ทุกเทสต์เชิงฟังก์ชันควรเรียก เพื่อจับของที่พังเงียบระหว่างกด */
export function watchErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on("pageerror", e => errs.push(`[pageerror] ${e.message}`));
  page.on("console", m => { if (m.type() === "error") errs.push(`[console] ${m.text().slice(0, 200)}`); });
  page.on("response", r => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[http ${r.status()}] ${r.url().slice(0, 140)}`);
  });
  return errs;
}
export function assertNoErrors(errs: string[], label: string) {
  const real = errs.filter(e => !NOISE.test(e));
  expect(real, `${label} ต้องไม่มี error`).toEqual([]);
}

// ── เข้าสู่ระบบ: ใช้สิทธิ์เดิมซ้ำ ไม่ล็อกอินใหม่ทุกเทสต์ ────────────────────────────
//
// ปัญหาที่แก้ (ยืนยันจากบันทึกการรันเต็ม 7 ส.ค. 69):
//   เดิมทุกเทสต์พิมพ์อีเมล+รหัสผ่านแล้วกดปุ่มจริง — 55 จุดเรียก × รันขนาน 3 ช่องทาง ใน 8 นาที
//   จำนวนคำขอล็อกอินทะลุเพดานของ Supabase Auth แล้วโดนปฏิเสธ:
//     ล็อกอินรอบที่ 1 ไม่ผ่าน (["Request rate limit reached"]) — ลองใหม่
//   ผลที่ตามมาไม่ได้หยุดแค่ "ช้าลง": ถ้าสิทธิ์เข้าถึงไม่สมบูรณ์ ฐานข้อมูลจะคืน "ไม่มีแถว" เงียบ ๆ
//   (RLS กรองออกหมดโดยไม่ถือเป็น error) → เทสต์ตกด้วยข้อความ "หาข้อมูลไม่เจอ" ที่ชี้ไปผิดทางสนิท
//   อาการที่ค้างคาที่สุดคือ "ใบเสนอราคาที่เพิ่งหาเจอ หายไปใน 5 วินาที" ซึ่งอธิบายได้ด้วยเรื่องนี้
//
// วิธีแก้: ล็อกอินครั้งเดียวต่อบัญชี (ผ่าน API) แล้วยัด session เดิมให้ทุกเทสต์ใช้ซ้ำ
//   เป็นวิธีเดียวกับที่ helpers.ts (openAs) ใช้อยู่แล้วและไม่เคยมีปัญหา
//   ถ้ายัดแล้วแอปไม่ยอมรับ (ยังอยู่หน้าล็อกอิน) จะตกกลับไปล็อกอินผ่านหน้าจอจริงเหมือนเดิม
const HOME_AFTER_LOGIN: Record<string, string> = { "/login": "/dashboard", "/hq/login": "/hq/dashboard" };
// โหมด api เก็บใบผ่านใน cookie httpOnly (ระยะ 4) — เทสต์ต้องล็อกอินผ่าน backend
const COOKIE_AUTH = appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api";

export async function loginUI(page: Page, origin: string, path: string, who: Account) {
  ติดตามคำขอ(page);   // settle ต้องเห็นคำขอที่เริ่มก่อนถูกเรียกด้วย (ดู helpers.ติดตามคำขอ)
  // ระยะ 4: โหมด api เก็บใบผ่านใน cookie httpOnly — ยัด session ลง localStorage ไม่มีผลอีกต่อไป
  // ต้องล็อกอินผ่าน backend จริงเหมือนผู้ใช้ (เหตุผลเดียวกับ openAs ใน helpers.ts)
  if (COOKIE_AUTH) {
    // ใช้ cookie ที่ล็อกอินไว้แล้วซ้ำ — ล็อกอินใหม่ทุกเทสต์ทำให้ทั้งชุดถล่มด่านจำกัดคำขอ
    // (เหตุผลเต็มอยู่ที่ helpers.ts · เข้าระบบด้วยคุกกี้)
    await เข้าระบบด้วยคุกกี้(page, origin, who);
    await page.goto(`${origin}${HOME_AFTER_LOGIN[path] ?? path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    if (page.url().includes("/login")) {          // cookie เดิมใช้ไม่ได้แล้ว → ล็อกอินใหม่ครั้งเดียว
      await ล็อกอินใหม่(page, origin, who);
      await page.goto(`${origin}${HOME_AFTER_LOGIN[path] ?? path}`, { waitUntil: "domcontentloaded" });
      await settle(page);
    }
    return;
  }
  try {
    const session = await getSession(who);
    await page.addInitScript(({ key, session }) => {
      localStorage.setItem(key as string, JSON.stringify(session));
    }, { key: SESSION_KEY, session });
    await page.goto(`${origin}${HOME_AFTER_LOGIN[path] ?? path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    if (!page.url().includes("/login")) return;
  } catch { /* ยัด session ไม่สำเร็จ → ล็อกอินผ่านหน้าจอจริงข้างล่าง */ }

  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const email = page.locator("#login-email");
  const pass = page.getByLabel(/รหัสผ่าน/i).first();
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (let i = 0; i < 6; i++) {
      await email.fill(who.email);
      await pass.fill(who.password);
      await page.waitForTimeout(300);
      const ok1 = await email.inputValue() === who.email && await pass.inputValue() === who.password;
      await page.waitForTimeout(300);
      const ok2 = await email.inputValue() === who.email && await pass.inputValue() === who.password;
      if (ok1 && ok2) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    const left = await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (left) return;
  }
  throw new Error(`ล็อกอินไม่ผ่าน (${who.email})`);
}

// ── ฝั่ง DB: ใช้ยืนยันว่าสิ่งที่กดบนหน้าจอ "ลงฐานข้อมูลจริง" ไม่ใช่แค่ขึ้นบนจอ ──
// ใช้ client เดิมซ้ำต่อบัญชี — ล็อกอินใหม่ทุกครั้งจะโดน rate limit ของ Supabase Auth
const clients = new Map<string, Promise<SupabaseClient>>();
export function db(who: Account): Promise<SupabaseClient> {
  const cached = clients.get(who.email);
  if (cached) return cached;
  const p = (async () => {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await sb.auth.signInWithPassword(who);
    if (error) throw new Error(`ล็อกอิน DB ${who.email} ไม่ผ่าน: ${error.message}`);
    return sb;
  })();
  clients.set(who.email, p);
  return p;
}

/** รอจนแถวโผล่ใน DB — การเขียนผ่าน UI เป็น async ต้องรอ ไม่ใช่เช็คทันที
 *  ค่าเริ่มต้น 25s: เทสต์ทั้งชุดรันหลาย worker ถล่ม dev server ตัวเดียวที่คอมไพล์ route ครั้งแรกไปด้วย
 *  การเขียน optimistic → propagate ถึง DB จึงช้าเป็นครั้งคราว · 15s เดิมตึงเกินตอนรันขนานเต็มชุด
 *  (เป็น latency ของสภาพทดสอบ ไม่ใช่บั๊ก · ตัว test มี budget 180–240s เหลือเฟือ) */
export async function waitRow<T = Record<string, unknown>>(
  sb: SupabaseClient, table: string, match: Record<string, unknown>, timeoutMs = 25_000,
): Promise<T> {
  const started = Date.now();
  let last: unknown = null;
  // ── ค่ายาวมากต้องหั่นก่อนค้น ──────────────────────────────────────────────────
  //
  // ตัวกรองของ PostgREST เดินทางไปกับ "ที่อยู่เว็บ" (query string) ไม่ใช่เนื้อคำขอ
  // เทสต์ขอบเขต (ชื่อบริษัท 2,000 ตัวอักษร) จึงสร้างที่อยู่ยาวเกินที่เกตเวย์รับไหว
  //   → ตอบ "URI too long" แล้วเทสต์แปลผลว่า "หาแถวไม่เจอ" ทั้งที่แถวมีอยู่จริง
  //   (เจอตอนย้ายมารันฐานในเครื่อง 1 ก.ย. 69 — เกตเวย์ในเครื่องเพดานต่ำกว่าคลาวด์)
  // แก้โดยค้นด้วย "ต้นข้อความ" แทนค่าเต็ม แล้วค่อยเทียบค่าเต็มในเครื่องเราเอง
  const ยาวเกิน = 300;
  const เงื่อนไขสั้น: Record<string, unknown> = {};
  const ต้องเทียบเต็ม: [string, string][] = [];
  for (const [k, v] of Object.entries(match)) {
    if (typeof v === "string" && v.length > ยาวเกิน) ต้องเทียบเต็ม.push([k, v]);
    else เงื่อนไขสั้น[k] = v;
  }
  while (Date.now() - started < timeoutMs) {
    let q = sb.from(table).select("*").match(เงื่อนไขสั้น);
    for (const [k, v] of ต้องเทียบเต็ม) q = q.like(k, `${v.slice(0, 80)}%`);
    const { data, error } = await q.limit(20).then(r => ({
      ...r,
      data: (r.data ?? []).filter(row => ต้องเทียบเต็ม.every(([k, v]) => String((row as Record<string, unknown>)[k] ?? "") === v)),
    }));
    if (error) last = error;
    if (data && data.length) return data[0] as T;
    await new Promise(r => setTimeout(r, 500));
  }
  // ตัดค่ายาว ๆ ออกจากข้อความ error — ไม่งั้นบันทึกการรันเต็มไปด้วยตัวอักษรซ้ำ 2,000 ตัว อ่านไม่รู้เรื่อง
  const ย่อ = Object.fromEntries(Object.entries(match).map(([k, v]) =>
    [k, typeof v === "string" && v.length > 60 ? `${v.slice(0, 60)}…(${v.length} ตัวอักษร)` : v]));
  throw new Error(`ไม่พบแถวใน ${table} ที่ ${JSON.stringify(ย่อ)} ภายใน ${timeoutMs}ms · ${JSON.stringify(last)}`);
}

/** รอจนแถวหายจาก DB (ใช้ตอนทดสอบการลบ) */
export async function waitGone(
  sb: SupabaseClient, table: string, match: Record<string, unknown>, timeoutMs = 15_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await sb.from(table).select("*").match(match).limit(1);
    // อ่านไม่ได้ ≠ แถวหายแล้ว — เดิมถือว่า "หายแล้ว" ข้อทดสอบจึงผ่านทั้งที่ไม่ได้ตรวจอะไร
    //   (เจอ 13 ต.ค. 69: อ่านตาราง dealers ด้วย select * ถูกปฏิเสธสิทธิ์ แล้วข้อ "ลบสาขาแล้วแถวต้องหาย" ผ่านฟรี)
    if (error) throw new Error(`อ่าน ${table} ไม่ได้ จึงยืนยันไม่ได้ว่าแถวถูกลบแล้ว: ${error.message}`);
    if (!data.length) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`แถวใน ${table} ที่ ${JSON.stringify(match)} ยังไม่ถูกลบภายใน ${timeoutMs}ms`);
}

/** ป้ายกำกับของข้อมูลทดสอบ — ใช้ค้นหาและกวาดทิ้งได้แน่นอน */
// TAG = คำนำหน้าร่วมของ "ทุก" ข้อมูลทดสอบ — สวีปทั้งหมดได้ด้วย %ZZTEST%
export const TAG = "ZZTEST";
export const tagged = (s: string) => `${TAG}-${s}`;

// ⚠️ ทุกสเปก func-* รันกับ RYG ตัวจริงตัวเดียวกัน และ playwright รันหลายไฟล์ขนานกัน (workers>1)
//   ถ้าใช้ tag ร่วม "ZZTEST" แล้ว cleanup ลบตาม tag นั้น → สเปกหนึ่งจะลบข้อมูลของอีกสเปก
//   ที่กำลังรันอยู่กลางคัน (func-dealer-sales เขียนคอมเมนต์เตือนไว้เอง)
//   → แต่ละสเปกต้องมี "ช่องของตัวเอง": specNS("APPT") = "ZZTEST-APPT" แล้วตั้งชื่อข้อมูลใต้ช่องนั้น
//     cleanup(sb, dealer, ns) จะลบเฉพาะ %ZZTEST-APPT% ไม่แตะของสเปกอื่น (ยัง sweep รวมด้วย %ZZTEST% ได้)
//
// ── ยังไม่พอ: ต้องแยก "ต่อ worker" ด้วย ────────────────────────────────────────
// ยืนยันจากบันทึกการรันเต็ม 7 ส.ค. 69 (ใส่ตัวเก็บหลักฐานไว้ในเทสต์แล้วดักได้):
//   ใบ Q-RYG-2026-1621 ถูกสร้างและหาเจอแล้ว · 5 วินาทีถัดมาค้นด้วยเลขที่ตรง ๆ ได้ [] error null
//   แต่ "อ่านใบใดก็ได้ในสาขา" ยังได้ 1 แถว → สิทธิ์เข้าถึงปกติดี ใบถูกลบออกจากฐานข้อมูลจริง
//
// ที่มา: เทสต์ตกรอบแรก → Playwright ทิ้ง worker นั้นแล้วเปิดตัวใหม่มารันซ้ำ
//   worker ที่ถูกทิ้งจะยิง afterAll (= cleanup ลบทุกอย่างใต้ช่องของสเปก) ระหว่างที่รอบรันซ้ำ
//   สร้างข้อมูลใหม่ใต้ "ช่องเดียวกัน" อยู่พอดี → ของรอบใหม่โดนลบตามไปด้วย แล้วตกซ้ำอีกครั้ง
//   (ตระกูลเดียวกับบั๊ก fullyParallel ที่เคยเจอ — ตัวเก็บกวาดวิ่งไล่ตามงานที่ยังทำอยู่)
//
// แก้: ผูกชื่อช่องกับหมายเลข worker · Playwright ให้เลขใหม่กับ worker ที่เปิดมารันซ้ำเสมอ
//   cleanup ของ worker เก่าจึงหาข้อมูลของ worker ใหม่ไม่เจอ ลบไม่โดนกัน
//   ของตกค้างข้าม worker ยังถูกกวาดด้วย %ZZTEST% ที่ global-teardown ตอนจบชุดอยู่ดี
const WORKER = process.env.TEST_WORKER_INDEX ?? "0";
export const specNS = (name: string) => `${TAG}-${name}-W${WORKER}`;
export const nsTag = (ns: string) => (s: string) => `${ns}-${s}`;

/** กวาดข้อมูลทดสอบทิ้งทุกตาราง — เรียกทั้งก่อนและหลังชุดเทสต์ · tag = ช่องของสเปก (ค่าเริ่มต้น = ร่วม) */
export async function cleanup(sb: SupabaseClient, dealerCode: string, tag: string = TAG) {
  await sb.from("customer_notes").delete().like("title", `%${tag}%`);
  // ด่าน 3: ลูกค้าเป้าหมายที่ได้ใบ HQ แล้ว — ใบ HQ ที่ส่งแล้ว/คำขอราคา ลบด้วยกุญแจไม่ได้ (ตั้งใจ) ต้องล้างที่ฐานทดสอบตรง
  const { data: ลีดมีคำขอ } = await sb.from("leads").select("num_id").eq("dealer_code", dealerCode).like("company", `%${tag}%`);
  if (ลีดมีคำขอ?.length) {
    const { ล้างใบHQทดสอบ } = await import("./legacyQuotes");
    try { ล้างใบHQทดสอบ(dealerCode, ลีดมีคำขอ.map(l => Number(l.num_id))); } catch { /* ไม่มี docker — ข้าม */ }
  }
  // ใบ won ลบด้วยกุญแจไม่ได้แล้ว (ใบ 0203 · ด่าน 3) — ลบใบของข้อทดสอบที่ฐานทดสอบในเครื่องตรง ๆ
  try {
    const { ลบใบทดสอบที่ฐาน } = await import("./legacyQuotes");
    const แท็ก = tag.replace(/'/g, "''");
    ลบใบทดสอบที่ฐาน(`dealer_code = '${dealerCode}' and (customer like '%${แท็ก}%' or id like '%${แท็ก}%')`);
  } catch { /* ไม่มี docker — ใช้ทางเดิม (ใบ won จะค้าง) */ }
  await sb.from("quotations").delete().eq("dealer_code", dealerCode).like("customer", `%${tag}%`);
  await sb.from("quotations").delete().eq("dealer_code", dealerCode).like("id", `%${tag}%`);
  // appointments ไม่มีคอลัมน์ customer (ของจริงคือ company/province)
  // เดิมสั่งลบด้วย customer → PostgREST ตอบ error เงียบ ๆ แถวทดสอบเก่าจึงค้างสะสม
  // แล้วทำให้เทสต์รอบถัดไปไปเจอแถวเก่าแทนแถวที่เพิ่งสร้าง (เคยหลงคิดว่าโค้ดออกเลขผิด)
  await sb.from("appointments").delete().eq("dealer_code", dealerCode).like("company", `%${tag}%`);
  await sb.from("appointments").delete().eq("dealer_code", dealerCode).like("province", `%${tag}%`);
  await sb.from("customers").delete().eq("dealer_code", dealerCode).like("company", `%${tag}%`);
  await sb.from("leads").delete().eq("dealer_code", dealerCode).like("company", `%${tag}%`);
  await sb.from("leads").delete().like("id", `%${tag}%`);
  // ไฟล์ทดสอบ: ลบทั้งแถวใน DB และไบต์ใน Storage (ชื่อไฟล์ทดสอบมี tag)
  //   เดิม cleanup ไม่แตะตาราง files → แถวเก่าสะสมข้ามรัน แล้ว waitRow(files) ไปเจอแถวเก่า
  //   ที่ไบต์ถูก afterAll รอบก่อนลบไปแล้ว → signedUrl ล้ม (เทสต์ happy path แกว่งแบบสุ่ม)
  const { data: testFiles } = await sb.from("files").select("id,storage_path")
    .eq("dealer_code", dealerCode).like("name", `%${tag}%`);
  for (const tf of testFiles ?? []) {
    if (tf.storage_path) await sb.storage.from("dealer-files").remove([tf.storage_path as string]);
    await sb.from("files").delete().eq("id", tf.id);
  }
}

// ── ดีลเลอร์ต้องมาจากลูกค้าเป้าหมายที่สำเร็จแล้วเท่านั้น (บอสสั่ง 14 ก.ย. 69) ──────────────
//   route สร้างดีลเลอร์ปฏิเสธคำขอที่ไม่มี prospectId และหน้าทะเบียนดีลเลอร์ไม่มีฟอร์ม "เพิ่มดีลเลอร์" แล้ว
//   (ของเดิม fillDealerForm กรอกฟอร์มนั้น — ถอดทิ้งไปพร้อมฟอร์ม)

/** ลูกค้าเป้าหมายรองรับการสร้างสาขาทดสอบ — คืน id ไว้ส่งเป็น prospectId
 *  ตั้งชื่อตามรหัสสาขา และลบของชื่อเดียวกันทิ้งก่อนเสมอ → รันซ้ำกี่รอบก็ไม่กองค้างในฐานทดสอบ */
export async function ลูกค้าเป้าหมายรองรับสาขา(code: string): Promise<number> {
  const sb = await db(ADMIN);
  const name = `${TAG}-ผู้สนใจ-${code}`;
  const { error: delErr } = await sb.from("dealer_prospects").delete().eq("name", name);
  if (delErr) throw new Error(`ล้างลูกค้าเป้าหมายทดสอบของ ${code} ไม่สำเร็จ: ${delErr.message}`);
  const { data, error } = await sb.from("dealer_prospects").insert({ name, status: "considering" }).select("id").single();
  if (error || !data) throw new Error(`สร้างลูกค้าเป้าหมายรองรับสาขา ${code} ไม่สำเร็จ: ${error?.message ?? "ไม่มีข้อมูลคืนมา"}`);
  const id = (data as { id: number }).id;
  // ตกลง + ชำระ (ด่าน 4 · 0208): แปลงได้เมื่อใบ "ตอบรับ" + ยอดชำระรวมครบตามใบ
  //   ใบรองรับสาขาทดสอบไม่ระบุค่าแรกเข้า (ยอด 0) → ตอบรับแล้วแปลงได้เลย ไม่ต้องบันทึกการชำระ
  //   ข้อทดสอบที่ตรวจการชำระโดยเฉพาะอยู่ที่ franchise_payment_rules.sql / franchise-recruit-flow.spec.ts
  const { data: ใบ, error: ใบErr } = await sb.from("dealer_package_proposals")
    .insert({ prospect_id: id, package: "standard", status: "sent", proposed_date: new Date().toISOString().slice(0, 10) }).select("id").single();
  if (ใบErr || !ใบ) throw new Error(`สร้างใบค่าแฟรนไชส์รองรับสาขา ${code} ไม่สำเร็จ: ${ใบErr?.message ?? "ไม่มีข้อมูลคืนมา"}`);
  const { error: ตอบรับErr } = await sb.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", (ใบ as { id: number }).id);
  if (ตอบรับErr) throw new Error(`ตอบรับใบค่าแฟรนไชส์รองรับสาขา ${code} ไม่สำเร็จ: ${ตอบรับErr.message}`);
  return id;
}

/** เปิดกล่อง "ตั้งเป็นดีลเลอร์" ของลูกค้าเป้าหมายที่สร้างให้สาขานี้ (ยังไม่กรอกอะไร) — ต้องล็อกอิน HQ ไว้ก่อน */
export async function เปิดกล่องตั้งดีลเลอร์(page: Page, code: string) {
  await ลูกค้าเป้าหมายรองรับสาขา(code);
  await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" });
  // ค้นก่อนเสมอ — ตารางแบ่งหน้าละ 10 ราย เทสต์อื่นที่รันขนานกันอาจดันรายนี้ตกไปหน้าถัดไป
  await page.getByLabel("ค้นหาผู้สนใจ").fill(`ผู้สนใจ-${code}`);
  await page.getByRole("row", { name: new RegExp(`ผู้สนใจ-${code}`) }).click({ timeout: 30_000 });
  await page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" }).getByRole("button", { name: "ตั้งเป็นดีลเลอร์" }).click();
  return page.getByRole("dialog", { name: "ตั้งเป็นดีลเลอร์" });
}

/** จังหวัดที่ดูแลของสาขาทดสอบที่สร้างผ่านหน้าจอ — จังหวัดภาคตะวันออกที่ยังไม่มีเจ้าของในชุดทดสอบ ห้ามซ้ำกัน
 *  (ตราด = hq-prospects · จันทบุรี = franchise-recruit-flow) */
const พื้นที่ของสาขาทดสอบ: Record<string, string> = { ZZEDG: "ฉะเชิงเทรา", ZZC: "ปราจีนบุรี", ZZS: "สระแก้ว" };

/** กรอกกล่องตั้งเป็นดีลเลอร์ให้ครบ (สร้างดีลเลอร์ใหม่) — ไม่กดยืนยัน ให้เทสต์เป็นคนกดเอง
 *  ดีลเลอร์ดูแล 1 จังหวัดพอดี = จังหวัดที่ตั้ง (บอสสั่ง 29 ต.ค. 69 · ใบ 0259) — แต่ละรหัสได้จังหวัดของตัวเองตายตัว ไม่ชนกันเมื่อรันพร้อมกัน */
export async function เปิดฟอร์มตั้งดีลเลอร์(page: Page, code: string, name: string, region = "ตะวันออก") {
  const ตั้ง = await เปิดกล่องตั้งดีลเลอร์(page, code);
  await ตั้ง.locator("#cv-code").fill(code);
  await ตั้ง.locator("#cv-name").fill(name);
  await ตั้ง.locator("#cv-region").selectOption(region);
  const พื้นที่ = พื้นที่ของสาขาทดสอบ[code];
  if (!พื้นที่) throw new Error(`เปิดฟอร์มตั้งดีลเลอร์: ยังไม่ได้กำหนดจังหวัดของรหัส ${code} — เพิ่มใน พื้นที่ของสาขาทดสอบ (ใช้จังหวัดที่ไม่ซ้ำรหัสอื่น ในภาค ${region})`);
  await ตั้ง.locator("#cv-province").selectOption(พื้นที่);
  return ตั้ง;
}

/** ทำให้ใบเสนอราคาของลูกค้ารายนี้อยู่ในสถานะ "ส่งแล้ว"
 *
 *  ทำไมต้องมี (กฎใหม่ 19 ส.ค. 69 · migration 0145):
 *    ระบบห้ามปิดการขายสำเร็จถ้ายังไม่มีใบเสนอราคาที่ "ส่งถึงลูกค้าแล้ว" อย่างน้อยหนึ่งใบ
 *    เทสต์ที่โฟกัสเรื่อง "ปิดการขายแล้วเกิดอะไรขึ้นต่อ" จึงต้องจัดฉากให้ผ่านด่านนี้ก่อน
 *    ไม่งั้นจะล้มด้วยอาการที่ไม่เกี่ยวกับสิ่งที่มันตั้งใจตรวจ
 *
 *  ใช้ client ของผู้ใช้จริง (ไม่ใช่สิทธิ์ระดับระบบ) — การกดส่งใบเป็นสิ่งที่ดีลเลอร์ทำได้เองอยู่แล้ว
 *  ถ้าจะตรวจ "ปุ่มส่งใบบนหน้าจอ" ให้เขียนเป็นเทสต์ของตัวเอง อย่ามาใช้ตัวนี้แทน */
export async function markQuotationSent(
  sb: SupabaseClient, dealerCode: string, company: string,
): Promise<void> {
  const q = await waitRow<{ id: string }>(sb, "quotations", { dealer_code: dealerCode, customer: company });
  const { error } = await sb.from("quotations")
    .update({ status: "sent_to_client" }).eq("dealer_code", dealerCode).eq("id", q.id);
  if (error) throw new Error(`ส่งใบเสนอราคา ${q.id} ไม่สำเร็จ: ${error.message}`);
}

/** มีใบเสนอราคาที่ "ส่งแล้ว" ให้ลูกค้ารายนี้แน่ ๆ — ไม่มีก็ออกให้ใหม่
 *  ใช้กับเทสต์ที่โฟกัสเรื่องหลังปิดการขาย แต่ไม่ได้ออกใบไว้เองในขั้นตอนของมัน
 *  ออกใบผ่าน RPC ตัวเดียวกับที่หน้าจอใช้ (create_quotation) เพื่อให้ผ่านด่านทุกชั้นเหมือนของจริง */
export async function ensureSentQuotation(
  sb: SupabaseClient, dealerCode: string, company: string, amount = 500_000,
): Promise<void> {
  const { data: มีอยู่ } = await sb.from("quotations")
    .select("id").eq("dealer_code", dealerCode).eq("customer", company).limit(1);
  if (!มีอยู่?.length) {
    // ด่าน 3: ใบใหม่ต้องทำจากใบ HQ — ขอราคาให้ลูกค้าเป้าหมายรายนี้ → HQ ส่งใบ (ต้นทุน = amount) → ทำใบบวก 0%
    const lead = await waitRow<{ num_id: number }>(sb, "leads", { dealer_code: dealerCode, company });
    const { ใบHQให้ลูกค้าเป้าหมายเดิม, ทำใบลูกค้าจากใบHQ } = await import("./hqQuoteFixture");
    const dealer = dealerCode === "RYG" ? RYG : CNX;
    const ใบ = await ใบHQให้ลูกค้าเป้าหมายเดิม(dealer, dealerCode, Number(lead.num_id), [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitCost: amount }]);
    await ทำใบลูกค้าจากใบHQ(dealer, ใบ, { customer: company, markupPercent: 0, extra: { date: "2026-08-19" } });
  }
  await markQuotationSent(sb, dealerCode, company);
}

/** ลูกค้าเป้าหมายที่สร้างไว้แล้ว (ผ่านหน้าจอ) → ได้ใบ HQ → เปิดฟอร์ม "ทำใบเสนอราคาจากใบ HQ" ในแผงของลูกค้าเป้าหมาย
 *  ทางเดียวกับผู้ใช้จริงตั้งแต่ด่าน 3 (ทางสร้างใบแบบเดิมปิดแล้ว) — ต้องอยู่หน้า /leads ของดีลเลอร์ที่เข้าระบบแล้ว */
export async function เปิดฟอร์มทำใบจากใบHQ(page: Page, dealerCode: string, company: string, lines?: { name: string; qty: number; unit: string; unitCost: number }[]) {
  const sb = await db(dealerCode === "RYG" ? RYG : CNX);
  // ลูกค้ารายเดิมอาจมีหลายงานขาย (ดีลเก่าปิดไปแล้ว) — ขอราคาได้เฉพาะรายที่ยังอยู่ขั้นติดต่อแล้ว/รวบรวมความต้องการ เอารายล่าสุด
  let lead = null as { num_id: number } | null;
  await expect.poll(async () => {
    const { data } = await sb.from("leads").select("num_id").eq("dealer_code", dealerCode).eq("company", company)
      .in("status", ["WAITING", "BULLET"]).order("num_id", { ascending: false }).limit(1);
    lead = data?.[0] ?? null;
    return lead != null;
  }, { timeout: 20_000, message: `ต้องมีลูกค้าเป้าหมาย "${company}" ที่ยังขอราคาได้` }).toBe(true);
  const { ใบHQให้ลูกค้าเป้าหมายเดิม } = await import("./hqQuoteFixture");
  const ใบ = await ใบHQให้ลูกค้าเป้าหมายเดิม(dealerCode === "RYG" ? RYG : CNX, dealerCode, Number(lead!.num_id), lines);
  const origin = page.url().startsWith(HQ_ORIGIN) ? HQ_ORIGIN : DEALER_ORIGIN;
  await page.goto(`${origin}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const row = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click({ timeout: 20_000 });
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  return ใบ;
}

// (งานตามเส้นทาง / งานก่อนหน้าครบถึง เอาออก 28 ต.ค. 69 — อ่านแม่แบบงานแบบเก่าที่ผูกสถานะลีด (stage) · ไม่มีที่เรียกแล้ว · แม่แบบใหม่ผูกขั้น 1–5)

/** เพิ่มลูกค้าหนึ่งรายผ่านหน้าจอจริง ด้วยการ "นำเข้าไฟล์" (ต้องอยู่ที่หน้า /customers แล้ว)
 *  ปุ่ม "คีย์เองทีละราย" ถูกเอาออกตามที่บอสสั่ง 2 ก.ย. 69 — ทางเดียวที่ดีลเลอร์เพิ่มลูกค้าเดิมได้คือไฟล์
 *  ไฟล์ที่ป้อนใช้หัวตารางชุดเดียวกับเทมเพลตที่ระบบแจก (ดู CSV_HEADERS ในหน้าลูกค้า) */
export async function นำเข้าลูกค้าหนึ่งราย(
  page: Page, company: string,
  ข้อมูล: { ผู้ติดต่อ?: string; โทรศัพท์?: string; จังหวัด?: string } = {},
) {
  const หัว = "บริษัท,ผู้ติดต่อ,โทรศัพท์,อีเมล,ที่อยู่,จังหวัด,เป็นลูกค้าเมื่อ,ผู้รับผิดชอบ";
  const แถว = [company, ข้อมูล.ผู้ติดต่อ ?? "คุณทดสอบ", ข้อมูล.โทรศัพท์ ?? "0800000000", "", "",
    ข้อมูล.จังหวัด ?? "ระยอง", "", ""].join(",");
  await page.getByRole("button", { name: "นำเข้าลูกค้าเดิม" }).click();
  await page.getByLabel("นำเข้าลูกค้าจากไฟล์").setInputFiles({
    name: "ลูกค้าเดิม.csv", mimeType: "text/csv",
    buffer: Buffer.from("\ufeff" + หัว + "\n" + แถว, "utf8"),
  });
  await page.getByRole("button", { name: /^นำเข้า \d+ ราย$/ }).click();
  // ชื่อซ้ำ = ระบบถามก่อนว่าจะอัปเดตหรือแทนที่ (บอสสั่ง 2 ก.ย. 69) — เทสต์เลือก "อัปเดตข้อมูล"
  const ป๊อปอัพซ้ำ = page.getByRole("dialog", { name: "พบชื่อลูกค้าซ้ำ" });
  if (await ป๊อปอัพซ้ำ.isVisible().catch(() => false)) {
    await ป๊อปอัพซ้ำ.getByRole("button", { name: "อัปเดตข้อมูล" }).click();
  }
}

/** หน้าใบเสนอราคาดีลเลอร์: กดแถว = เปิดแผงดูใบในหน้าเดิม (บอสสั่ง 28 ต.ค. 69) → กด "ไปแผงลีด" ในแผง
 *  ใช้แทนการกดแถวแล้วรอไป /leads แบบเดิม (รอบ 4) — ข้อทดสอบที่ต้องทำงานของใบ (D6/D8/D8x) ไปทำต่อที่แผงลีด */
export async function ไปแผงลีดจากแถวใบ(แถว: Locator) {
  const page = แถว.page();
  await แถว.locator("td").first().click();
  const แผง = page.locator("[data-quote-view]");
  await expect(แผง, "กดแถวแล้วแผงดูใบต้องเปิด").toBeVisible({ timeout: 20_000 });
  await แผง.locator("[data-goto-lead]").click();
}
