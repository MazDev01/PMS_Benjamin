import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, RYG, ADMIN, skipReason, type Account } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN } from "./funcHelpers";

// ── สวิตช์ "ราคาแม่แบบ HQ เห็นคนเดียว" — ทดสอบด้วยใบผ่านจริง ทั้งสองทางเข้า ─────────────────────
//
// ใบ 0186 · hq_policy.hide_catalog_price · เปิดแล้วดีลเลอร์ต้องอ่านราคาแม่แบบไม่ได้ "ที่ฐานข้อมูล"
// ไม่ใช่แค่หน้าจอไม่แสดง — จึงยิงตรงด้วยใบผ่านของดีลเลอร์จริง 2 ทาง:
//   (ก) REST ของ Supabase ตรง ๆ          = ทางที่โหมดพัฒนาใช้ และทางที่คนเปิด Console ยิงเองได้
//   (ข) /api/v1/catalog ของแอป            = ทางที่เว็บจริงใช้
//
// ⚠️ ไฟล์นี้อยู่ในโปรเจกต์ "price-switch" ซึ่งรันเดี่ยวหลังชุดอื่นจบทั้งหมด (ดู playwright.config.ts)
//    สวิตช์เป็นค่ากลางทั้งระบบ — เปิดระหว่างที่ชุดอื่นรันอยู่ ข้อทดสอบออกใบเสนอราคาของชุดนั้นจะตกหมด
//    ห้ามย้ายไฟล์นี้กลับเข้าชุดหลัก และห้ามเปิดสวิตช์ในข้อทดสอบไฟล์อื่น
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });

const ช่องราคา = ["price", "subtype_prices", "price_history"];
const ช่องราคาทางแอป = ["price", "subtypePrices", "priceHistory"];
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let dealer: SupabaseClient, hq: SupabaseClient, dealerToken = "", hqToken = "", api: APIRequestContext;

async function signIn(who: Account) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword(who);
  if (error || !data.session) throw new Error(`ล็อกอิน ${who.email} ไม่ผ่าน: ${error?.message}`);
  return { sb, token: data.session.access_token };
}
const ตั้งสวิตช์ = async (เปิด: boolean) => {
  const { error } = await admin.from("hq_policy").update({ hide_catalog_price: เปิด }).gte("id", 0);
  if (error) throw new Error(`ตั้งสวิตช์ไม่ได้: ${error.message}`);
};
/** ยิง REST ของ Supabase ตรง ๆ ด้วยใบผ่านที่ให้มา (ไม่ผ่านไลบรารี เพื่อให้เห็นคำตอบดิบ) */
const rest = (path: string, token: string) =>
  api.get(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}` } });

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  ({ sb: dealer, token: dealerToken } = await signIn(RYG));
  ({ sb: hq, token: hqToken } = await signIn(ADMIN));
  const { count } = await admin.from("master_catalog").select("id", { count: "exact", head: true });
  expect(count ?? 0, "ฐานทดสอบต้องมีแม่แบบอย่างน้อย 1 รายการ ไม่งั้น 'อ่านไม่ได้' กับ 'ไม่มีข้อมูล' แยกกันไม่ออก").toBeGreaterThan(0);
  await ตั้งสวิตช์(true);
});
test.afterAll(async () => {
  await ตั้งสวิตช์(false);   // ⚠️ ต้องปิดคืนเสมอ — ค้างเปิดไว้ = รอบถัดไปของชุดหลักออกใบเสนอราคาไม่ได้
  await dealer?.auth.signOut({ scope: "local" });
  await hq?.auth.signOut({ scope: "local" });
  await api?.dispose();
});

test("[REST] สวิตช์เปิด: ดีลเลอร์อ่านตารางแม่แบบไม่ได้เลย ไม่ว่าจะขอคอลัมน์ไหน", async () => {
  for (const sel of ["*", "price", "id,name,price", "subtype_prices", "price_history"]) {
    const res = await rest(`master_catalog?select=${sel}`, dealerToken);
    const body = await res.json();
    expect(Array.isArray(body) ? body.length : -1, `select=${sel} ต้องได้ 0 แถว (ได้ ${JSON.stringify(body).slice(0, 120)})`).toBe(0);
  }
});

// จุดพิสูจน์ "ชุดนี้ตกกลางทาง สวิตช์ต้องถูกปิดคืน": ตั้ง PMS_FORCE_FAIL_PRICE_SWITCH=1 แล้วรันชุดนี้
//   ข้อนี้จะตกทั้งที่สวิตช์เปิดอยู่ และข้อที่เหลือ (รวมข้อ "ปิดสวิตช์คืน" ท้ายไฟล์) จะไม่ได้รันเพราะไฟล์รันเรียงลำดับ
//   จากนั้นตรวจฐาน: hide_catalog_price ต้องเป็น false (afterAll + global-teardown ปิดให้) — ดู docs/GO-LIVE-CHECKLIST.md
test("[พิสูจน์] บังคับให้ตกกลางทางเมื่อสั่ง", async () => {
  test.skip(process.env.PMS_FORCE_FAIL_PRICE_SWITCH !== "1", "ใช้เฉพาะตอนพิสูจน์ว่าสวิตช์ถูกปิดคืนเมื่อชุดตก (ตั้ง PMS_FORCE_FAIL_PRICE_SWITCH=1)");
  const { data } = await admin.from("hq_policy").select("hide_catalog_price").order("id").limit(1).single();
  expect(data?.hide_catalog_price, "ตอนที่ตก สวิตช์ต้องกำลังเปิดอยู่จริง ไม่งั้นการพิสูจน์ไม่มีความหมาย").toBe(true);
  throw new Error("ตกโดยตั้งใจ (PMS_FORCE_FAIL_PRICE_SWITCH=1)");
});

test("[REST] สวิตช์เปิด: มุมมองของดีลเลอร์มีแม่แบบ แต่ไม่มีช่องราคา และขอช่องราคาตรง ๆ ก็ไม่ได้", async () => {
  const res = await rest("master_catalog_public?select=*", dealerToken);
  expect(res.status()).toBe(200);
  const rows = (await res.json()) as Record<string, unknown>[];
  expect(rows.length, "ดีลเลอร์ยังต้องเห็นแม่แบบ (รูป สเปก แบบ)").toBeGreaterThan(0);
  for (const r of rows) for (const k of ช่องราคา) expect(k in r, `แถว ${r.name}: ต้องไม่มีช่อง ${k}`).toBe(false);
  for (const k of ช่องราคา) {
    const ขอตรง = await rest(`master_catalog_public?select=${k}`, dealerToken);
    expect(ขอตรง.status(), `ขอช่อง ${k} จากมุมมองต้องถูกปฏิเสธ`).toBeGreaterThanOrEqual(400);
  }
});

test("[REST] สวิตช์เปิด: สำนักงานใหญ่ยังอ่านราคาแม่แบบได้ครบ", async () => {
  const res = await rest("master_catalog?select=id,name,price,subtype_prices,price_history", hqToken);
  expect(res.status()).toBe(200);
  const rows = (await res.json()) as Record<string, unknown>[];
  expect(rows.length).toBeGreaterThan(0);
  for (const k of ช่องราคา) expect(k in rows[0], `HQ ต้องเห็นช่อง ${k}`).toBe(true);
});

test("[/api/v1] สวิตช์เปิด: ดีลเลอร์เรียกแคตตาล็อกผ่านแอปทั้งสองตัว ได้รายการว่าง ไม่มีราคาหลุด", async () => {
  for (const origin of [DEALER_ORIGIN, HQ_ORIGIN]) {
    const res = await api.get(`${origin}/api/v1/catalog`, { headers: { authorization: `Bearer ${dealerToken}` } });
    expect(res.status(), `${origin} ต้องตอบได้ (ได้ ${res.status()})`).toBe(200);
    const ข้อความ = await res.text();
    const rows = JSON.parse(ข้อความ) as Record<string, unknown>[];
    expect(rows.length, `${origin}: ดีลเลอร์ต้องไม่ได้แถวจากตารางราคา`).toBe(0);
    for (const k of [...ช่องราคา, ...ช่องราคาทางแอป]) expect(ข้อความ.includes(`"${k}"`), `${origin}: คำตอบต้องไม่มีช่อง ${k}`).toBe(false);
  }
});

test("[/api/v1] สวิตช์เปิด: สำนักงานใหญ่เรียกแคตตาล็อกผ่านแอป ยังได้ราคาครบ", async () => {
  const res = await api.get(`${HQ_ORIGIN}/api/v1/catalog`, { headers: { authorization: `Bearer ${hqToken}` } });
  expect(res.status()).toBe(200);
  const rows = (await res.json()) as Record<string, unknown>[];
  expect(rows.length).toBeGreaterThan(0);
  expect("price" in rows[0], "HQ ต้องเห็นราคา").toBe(true);
});

test("ปิดสวิตช์คืน: ดีลเลอร์กลับมาอ่านแม่แบบพร้อมราคาได้ตามเดิมทั้งสองทาง", async () => {
  await ตั้งสวิตช์(false);
  const ตรง = (await (await rest("master_catalog?select=id,price", dealerToken)).json()) as unknown[];
  expect(ตรง.length, "REST: สวิตช์ปิดแล้วต้องอ่านได้").toBeGreaterThan(0);
  const ทางแอป = (await (await api.get(`${DEALER_ORIGIN}/api/v1/catalog`, { headers: { authorization: `Bearer ${dealerToken}` } })).json()) as unknown[];
  expect(ทางแอป.length, "/api/v1: สวิตช์ปิดแล้วต้องอ่านได้").toBeGreaterThan(0);
});
