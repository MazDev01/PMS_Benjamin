import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, db, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { ข้ามตั้งรหัสครั้งแรก } from "./firstLogin";
import { ลบสาขาทดสอบตรง } from "./testDealers";
import { วางใบเดิมที่ฐาน } from "./legacyQuotes";
import { execFileSync } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";

// ── สาขาถูกปิดใช้งาน แต่ใบผ่าน (token) เดิมยังไม่หมดอายุ (บอสสั่ง 15 ต.ค. 69) ──────────────────────────────────
//
// บอสเลือกยอมรับตามการออกแบบใบ 0032: "การเขียน" ถูกกันทันที · "การอ่าน" ทำได้จนใบผ่านหมดอายุ
//   ช่องอ่านนี้มีเพดานเพราะต่ออายุใบไม่ได้ (ตัวดักออกใบ custom_access_token_hook ปฏิเสธบัญชี/สาขาที่ถูกปิด)
//   ข้อนี้ล็อก 3 อย่าง: ก) เขียนทุกทางถูกปฏิเสธทันที  ข) ต่ออายุใบ/ล็อกอินใหม่ไม่ได้  ค) ใบหมดอายุแล้วอ่านไม่ได้
//   อายุใบผ่านของระบบจริงต้องตั้ง 600–900 วินาที (BACKLOG · ต้องแก้ก่อนขึ้นระบบจริง)
//
// ที่มา: deleted-dealer-session:95 ไม่นิ่งในรอบปิดด่าน 3 — หน้าที่เปิดค้างไม่เด้งออกภายในเวลารอ
//   ข้อทดสอบรุ่นแรกคาดว่า "อ่านไม่ได้ทันที" แล้วตก (อ่านได้ทั้ง 3 ตาราง) → บอสตัดสินตามข้างบน
// ยิงตรงฐานด้วยใบผ่านที่ออกตอนสาขายังเปิดใช้งาน (ปิดการต่ออายุใบอัตโนมัติ — ใบเดิมใบเดียวตลอดข้อ)
//   ตรวจ "ก่อนปิด" ด้วยว่าใบเดียวกันอ่าน/เขียนได้จริง ไม่งั้นข้อนี้ผ่านเพราะสาเหตุอื่น (เช่น ด่านรหัสชั่วคราว)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

const CODE = "ZTJ";   // รหัสสาขาทดสอบเฉพาะไฟล์นี้
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function purge() {
  const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", CODE);
  for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
  await ลบสาขาทดสอบตรง(CODE);
  await admin.from("dealers").delete().eq("code", CODE);
}
// ใบผ่านจริงของสาขาที่ถูกปิด (ใช้ต่อในข้อ ค)
let ใบผ่านเดิม = "";

/** กุญแจเซ็นใบผ่านของฐานทดสอบในเครื่อง (ค่าตั้งต้นของ Supabase CLI ใน container auth) — ไม่มี = ไม่ใช่ฐานในเครื่อง */
function กุญแจเซ็นในเครื่อง(): JsonWebKey & { kid?: string } | null {
  try {
    const c = execFileSync("docker", ["ps", "--filter", "name=supabase_auth_", "--format", "{{.Names}}"], { encoding: "utf8" })
      .split(String.fromCharCode(10)).map(n => n.trim()).find(n => n.includes("dbcheck"));
    if (!c) return null;
    const env = execFileSync("docker", ["exec", c, "printenv", "GOTRUE_JWT_KEYS"], { encoding: "utf8" });
    const keys = JSON.parse(env) as (JsonWebKey & { kid?: string; key_ops?: string[] })[];
    return keys.find(k => k.alg === "ES256" && k.d) ?? null;
  } catch { return null; }
}
/** ใบผ่านใบเดิมทุกตัวอักษรของเนื้อใบ เปลี่ยนแค่เวลาหมดอายุ แล้วเซ็นด้วยกุญแจเดียวกับที่ฐานเชื่อ */
function เซ็นใหม่(token: string, exp: number, key: JsonWebKey & { kid?: string }): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const payload = { ...JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()), exp };
  const head = `${b64({ alg: "ES256", kid: key.kid, typ: "JWT" })}.${b64(payload)}`;
  const sig = sign("sha256", Buffer.from(head), { key: createPrivateKey({ key, format: "jwk" }), dsaEncoding: "ieee-p1363" });
  return `${head}.${sig.toString("base64url")}`;
}

test.beforeAll(purge);
test.afterAll(purge);

const ลีด = (n: number) => ({ id: `#L-ZTJ-${n}`, num_id: n, dealer_code: CODE, company: `ZZTEST-ปิดใช้งาน-${n}`, name: `ZZTEST-ปิดใช้งาน-${n}`,
  contact: "ผู้ทดสอบ", phone: `08900000${String(n).padStart(2, "0")}`, province: "แม่ฮ่องสอน", product: "โกดังสำเร็จรูป", status: "BULLET" });
//   หน้างาน "แม่ฮ่องสอน" = จังหวัดที่ไม่มีดีลเลอร์รายใดดูแลในชุดทดสอบ — กฎหนึ่งจังหวัดหนึ่งดีลเลอร์ (0195) จึงไม่กันตอนเตรียม
//   (ระยองเป็นของ RYG · สาขาใหม่ยังไม่มีพื้นที่ของตัวเอง)

test("[security·db] ปิดใช้งานสาขา → เขียนไม่ได้ทันที · ต่ออายุใบผ่าน/ล็อกอินใหม่ไม่ได้", async ({ request }) => {
  test.skip(!ADMIN_SERVICE_ROLE_KEY, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  const hqToken = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const created = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${hqToken}` },
    data: { code: CODE, name: "ZZTMP สาขาปิดใช้งาน (ยิงตรงฐาน)", province: "ระยอง", region: "ตะวันออก", revenueTarget: 1_000_000, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(CODE) },
  });
  expect(created.status(), `สร้างสาขาต้องผ่าน (${await created.text()})`).toBe(200);
  const cred = await created.json() as { email: string; password: string };
  await ข้ามตั้งรหัสครั้งแรก(cred.email);

  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: เข้า, error: เข้าErr } = await sb.auth.signInWithPassword(cred);
  expect(เข้าErr, "ล็อกอินตอนยังเปิดใช้งานต้องผ่าน").toBeNull();
  const ใบผ่าน = เข้า.session!.access_token;

  // ── ก่อนปิด: ใบผ่านใบนี้อ่าน/เขียนได้จริง ─────────────────────────────────────────
  for (const n of [1, 2]) {
    const { error } = await sb.from("leads").insert(ลีด(n));
    expect(error, `ก่อนปิด: เพิ่มลูกค้าเป้าหมาย ${n} ต้องได้`).toBeNull();
  }
  expect((await sb.from("leads").select("id").eq("dealer_code", CODE)).data?.length, "ก่อนปิด: อ่านลูกค้าเป้าหมายได้").toBe(2);
  const ขอ = await sb.rpc("quote_request_submit", { p_lead_num_id: 1, p_product: "โกดังสำเร็จรูป" });
  expect(ขอ.error, "ก่อนปิด: ส่งคำขอราคาได้").toBeNull();
  expect((await sb.from("quote_requests").select("id").eq("dealer_code", CODE)).data?.length, "ก่อนปิด: อ่านคำขอราคาได้").toBe(1);
  // ใบเสนอราคา 1 ใบ (วางที่ฐาน — ดีลเลอร์ออกใบเองได้เฉพาะจากใบ HQ ที่ส่งแล้ว) ให้การตรวจ "อ่านใบไม่ได้" มีแถวให้ลองอ่านจริง
  วางใบเดิมที่ฐาน([{ id: "ZZ-ZTJ-BASE", dealer_code: CODE, customer: "ZZTEST-ปิดใช้งาน-1", status: "draft", total_value: 100,
    line_items: [{ name: "x", qty: 1, unit: "ชุด", unitPrice: 100 }] }]);
  expect((await sb.from("quotations").select("id").eq("dealer_code", CODE)).data?.length, "ก่อนปิด: อ่านใบเสนอราคาได้").toBe(1);

  // ── สำนักงานใหญ่ปิดใช้งานสาขา ─────────────────────────────────────────────────
  const ปิด = await admin.from("dealers").update({ status: "inactive" }).eq("code", CODE);
  expect(ปิด.error).toBeNull();
  // ใบผ่านเดิมยังไม่หมดอายุ — ยืนยันว่าเป็นใบเดิมจริง (ไม่ได้ต่ออายุ/ออกใหม่)
  expect((await sb.auth.getSession()).data.session?.access_token, "ต้องเป็นใบผ่านใบเดิม").toBe(ใบผ่าน);
  expect(เข้า.session!.expires_at! * 1000, "ใบผ่านต้องยังไม่หมดอายุ").toBeGreaterThan(Date.now());

  ใบผ่านเดิม = ใบผ่าน;
  // ── ก) หลังปิด: เขียนทุกทางต้องถูกปฏิเสธทันที (error หรือไม่มีแถวถูกแตะ) — ตรวจครบทุกทางในรอบเดียว ──────────
  //   การอ่านช่วงนี้ยังทำได้จนใบหมดอายุ ตามการออกแบบใบ 0032 (บอสยอมรับ 15 ต.ค. 69) — ไม่ล็อกไว้ในข้อนี้
  const เพิ่ม = await sb.from("leads").insert(ลีด(3));
  expect.soft(เพิ่ม.error, "หลังปิด: เพิ่มลูกค้าเป้าหมายต้องถูกปฏิเสธ").not.toBeNull();
  const แก้ = await sb.from("leads").update({ company: "ZZTEST-ถูกแก้หลังปิด" }).eq("dealer_code", CODE).eq("num_id", 2).select("id");
  expect.soft(แก้.error ? 0 : (แก้.data?.length ?? 0), "หลังปิด: แก้ลูกค้าเป้าหมายต้องไม่มีแถวถูกแตะ").toBe(0);
  const ลบ = await sb.from("leads").delete().eq("dealer_code", CODE).eq("num_id", 2).select("id");
  expect.soft(ลบ.error ? 0 : (ลบ.data?.length ?? 0), "หลังปิด: ลบลูกค้าเป้าหมายต้องไม่มีแถวถูกแตะ").toBe(0);
  const ขอใหม่ = await sb.rpc("quote_request_submit", { p_lead_num_id: 2, p_product: "โกดังสำเร็จรูป" });
  expect.soft(ขอใหม่.error, "หลังปิด: ส่งคำขอราคาต้องถูกปฏิเสธ").not.toBeNull();
  const ยกเลิก = await sb.rpc("quote_request_cancel", { p_id: Number((ขอ.data as { id: number }).id), p_reason: "ทดสอบหลังปิด", p_close_lead: false });
  expect.soft(ยกเลิก.error, "หลังปิด: ยกเลิกคำขอราคาต้องถูกปฏิเสธ").not.toBeNull();
  const ใบ = await sb.from("quotations").insert({ id: "ZZ-ZTJ-Q1", dealer_code: CODE, customer: "x", total_value: 1, line_items: [] });
  expect.soft(ใบ.error, "หลังปิด: เพิ่มใบเสนอราคาต้องถูกปฏิเสธ").not.toBeNull();

  // ── ยืนยันจากฐาน (สิทธิ์ระบบ): ไม่มีอะไรเปลี่ยนจริง ─────────────────────────────────
  const { data: ที่ฐาน } = await admin.from("leads").select("num_id, company").eq("dealer_code", CODE).order("num_id");
  expect.soft(ที่ฐาน, "ลูกค้าเป้าหมายในฐานต้องเหมือนตอนก่อนปิด").toEqual([
    { num_id: 1, company: "ZZTEST-ปิดใช้งาน-1" }, { num_id: 2, company: "ZZTEST-ปิดใช้งาน-2" }]);
  const { data: คำขอ } = await admin.from("quote_requests").select("lead_num_id, status").eq("dealer_code", CODE);
  expect.soft(คำขอ, "คำขอราคาในฐานต้องมีใบเดิมใบเดียว ยังไม่ถูกยกเลิก").toEqual([{ lead_num_id: 1, status: "new" }]);
  expect.soft((await admin.from("quotations").select("id").eq("dealer_code", CODE)).data ?? [], "ไม่มีใบเสนอราคาหลุดเข้าฐาน (มีแค่ใบที่วางไว้)").toEqual([{ id: "ZZ-ZTJ-BASE" }]);

  // ── ข) ช่องอ่านมีเพดาน: ต่ออายุใบผ่านไม่ได้ และล็อกอินใหม่ไม่ได้ ───────────────────────────────────────
  //   ตัวกันคือ custom_access_token_hook (0032) — ถอดการกันออกชั่วคราวแล้วข้อนี้ต้องตก (พิสูจน์แล้ว 15 ต.ค. 69)
  const ต่อ = await sb.auth.refreshSession();
  expect(ต่อ.error, "สาขาถูกปิดแล้ว ต่ออายุใบผ่านต้องถูกปฏิเสธ").not.toBeNull();
  expect(ต่อ.data.session, "ต้องไม่ได้ใบผ่านใบใหม่").toBeNull();
  const ใหม่ = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: เข้าใหม่Err } = await ใหม่.auth.signInWithPassword(cred);
  expect(เข้าใหม่Err, "สาขาถูกปิดแล้ว ล็อกอินใหม่ต้องไม่ได้").not.toBeNull();
});

test("[security·db] ปิดใช้งานสาขา → ใบผ่านเดิมหมดอายุแล้ว อ่าน leads · quotations · quote_requests ไม่ได้", async () => {
  // ── ค) ใบผ่านเดิมเมื่อหมดอายุ ───────────────────────────────────────────────────────────────────
  //   รอหมดอายุจริงในชุดทดสอบไม่ได้ (ฐานในเครื่อง 600 วินาที) → เอาใบผ่านจริงใบเดิม เปลี่ยนแค่เวลาหมดอายุให้เป็นอดีต
  //   แล้วเซ็นด้วยกุญแจเดียวกับที่ฐานเชื่อ = ฐานเห็นใบเหมือนตอนหมดอายุจริงทุกอย่าง
  //   ตัวคุม: ใบที่เซ็นใหม่แบบยังไม่หมดอายุต้องอ่านได้ (ไม่งั้นที่อ่านไม่ได้อาจเป็นเพราะเซ็นผิด ไม่ใช่เพราะหมดอายุ)
  //   (ยืนยันแบบรอหมดอายุจริงแล้ว 1 รอบ 15 ต.ค. 69 — ผลตรงกัน)
  const key = กุญแจเซ็นในเครื่อง();
  test.skip(!key, "ไม่พบกุญแจเซ็นใบผ่านของฐานทดสอบในเครื่อง (docker) — ข้อนี้ใช้ได้เฉพาะฐานในเครื่อง");
  expect(ใบผ่านเดิม, "ต้องมีใบผ่านจากข้อก่อนหน้า").not.toBe("");
  const ด้วยใบ = (token: string) => createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const อ่านด้วย = async (token: string, table: string) => {
    const r = await ด้วยใบ(token).from(table).select("id").eq("dealer_code", CODE);
    return r.error ? 0 : (r.data?.length ?? 0);
  };
  const ตอนนี้ = Math.floor(Date.now() / 1000);
  const ยังไม่หมด = เซ็นใหม่(ใบผ่านเดิม, ตอนนี้ + 300, key!);
  expect(await อ่านด้วย(ยังไม่หมด, "leads"), "ตัวคุม: ใบที่เซ็นใหม่แบบยังไม่หมดอายุต้องอ่านได้ (เซ็นถูก)").toBe(2);
  const หมดแล้ว = เซ็นใหม่(ใบผ่านเดิม, ตอนนี้ - 60, key!);
  for (const t of ["leads", "quote_requests", "quotations"])
    expect.soft(await อ่านด้วย(หมดแล้ว, t), `ใบผ่านหมดอายุแล้ว อ่าน ${t} ต้องไม่ได้`).toBe(0);
});
