import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, SUPABASE_URL, SUPABASE_ANON, skipReason, type Account } from "./supabaseEnv";

// ── สิทธิ์เรียกคำสั่งของฐานข้อมูลต้องตรงกับเจตนา ไม่ขึ้นกับรุ่นของฐาน (ใบ 0190) ─────────────────────
//
// ที่มา (13 ต.ค. 69): บนฐานรุ่นใหม่ คนที่ยังไม่เข้าระบบเรียกคำสั่งสิทธิ์สูงได้ 4 ตัว เพราะใบเดิมถอนเฉพาะ public
//   ทั้ง 4 ตัวยังถูกการตรวจสิทธิ์ "ข้างในคำสั่ง" ปฏิเสธ — แต่นั่นคือเหลือด่านเดียว ด่านสิทธิ์เรียกต้องกันก่อนถึงตัวคำสั่ง
//   รหัส 42501 = ถูกปฏิเสธที่สิทธิ์เรียกคำสั่ง · ข้อความ forbidden / ค่าที่คืนมา = เข้าไปถึงตัวคำสั่งแล้ว (สิทธิ์เรียกยังเปิด)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

async function ใบผ่านของ(who: Account) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword(who);
  if (error || !data.session) throw new Error(`ล็อกอิน ${who.email} ไม่ผ่าน: ${error?.message}`);
  return data.session.access_token;
}
const เรียก = (req: APIRequestContext, fn: string, token: string, data: unknown) =>
  req.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { data, headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}`, "content-type": "application/json" } });

const สิทธิ์สูงที่คนนอกเคยเรียกได้: [string, unknown][] = [
  ["delete_customer_cascade", { p_customer_id: 999_999_999 }],   // ลูกค้าที่ไม่มีอยู่ — ถ้าเข้าไปถึงตัวคำสั่งก็ไม่มีอะไรถูกลบ
  ["hq_customers_page", {}],
  ["can_price_quotes", {}],
  ["catalog_price_hidden", {}],
];

for (const [fn, args] of สิทธิ์สูงที่คนนอกเคยเรียกได้) {
  test(`[security] ${fn}: คนที่ยังไม่เข้าระบบถูกปฏิเสธที่สิทธิ์เรียกคำสั่ง`, async ({ request }) => {
    const res = await เรียก(request, fn, SUPABASE_ANON, args);
    const body = await res.text();
    expect(res.status(), `ต้องถูกปฏิเสธ (ได้ ${res.status()} ${body.slice(0, 160)})`).toBeGreaterThanOrEqual(400);
    expect(body, "ต้องถูกปฏิเสธที่สิทธิ์เรียกคำสั่ง (42501) ไม่ใช่เข้าไปถึงตัวคำสั่งแล้วค่อยถูกปฏิเสธหรือได้ค่ากลับ").toContain("42501");
  });
}

test("[security] ผู้ใช้ที่เข้าระบบยังเรียกคำสั่งที่หน้าเว็บใช้ได้ · เรียกคำสั่งภายในไม่ได้", async ({ request }) => {
  const hq = await ใบผ่านของ(ADMIN), dealer = await ใบผ่านของ(RYG);
  // หน้าเว็บใช้: ต้องไม่ถูกปฏิเสธที่สิทธิ์เรียก (ผลข้างในจะเป็นอะไรก็ได้ — วัดแค่ด่านสิทธิ์เรียก)
  for (const [ใคร, token, fn, args] of [
    ["HQ", hq, "hq_customers_page", {}],
    ["HQ", hq, "catalog_price_hidden", {}],
    ["ดีลเลอร์", dealer, "catalog_price_hidden", {}],
    ["ดีลเลอร์", dealer, "leads_page", {}],
  ] as const) {
    const body = await (await เรียก(request, fn, token, args)).text();
    expect(body, `${ใคร} เรียก ${fn} ต้องไม่ถูกปฏิเสธที่สิทธิ์เรียก (${body.slice(0, 160)})`).not.toContain("42501");
  }
  // คำสั่งภายใน (ใช้ในคำสั่งสิทธิ์สูงเท่านั้น) และตัวดัก: ไม่มีใครเรียกตรงได้ แม้ผู้ดูแลสำนักงานใหญ่
  for (const [fn, args] of [["can_price_quotes", {}], ["_lead_flow_set_status", { p_dealer: "RYG", p_num_id: 1, p_status: "WAITING" }], ["quote_request_sla_days", {}]] as const) {
    for (const [ใคร, token] of [["HQ", hq], ["ดีลเลอร์", dealer]] as const) {
      const res = await เรียก(request, fn, token, args);
      const body = await res.text();
      // PGRST202 = ชื่อ/พารามิเตอร์ไม่ตรงจนหาคำสั่งไม่เจอ ซึ่งไม่ได้พิสูจน์อะไร — ต้องเป็น 42501 เท่านั้น
      expect(body, `${ใคร} เรียก ${fn} ตรง ๆ ต้องถูกปฏิเสธที่สิทธิ์เรียก (ได้ ${res.status()} ${body.slice(0, 160)})`).toContain("42501");
    }
  }
});
