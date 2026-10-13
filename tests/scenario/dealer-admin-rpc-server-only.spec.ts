import { test, expect, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, SUPABASE_URL, SUPABASE_ANON, skipReason, type Account } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

// ── ลบดีลเลอร์ / ย้ายข้อมูลดีลเลอร์ เรียกได้ทางเดียวคือผ่านเส้นทางของสำนักงานใหญ่ (ใบ 0188) ───────────
//
// สองคำสั่งนี้ทำงานด้วยสิทธิ์เจ้าของฐานข้อมูล · เส้นทางของ HQ ตรวจบทบาท จำกัดจำนวนคำขอ และลงบันทึกการใช้งานก่อนเรียก
// ยิงตรงเข้าฐาน = ข้ามทั้งหมดนั้น จึงต้องถูกปฏิเสธที่ "สิทธิ์เรียกคำสั่ง" ตั้งแต่ยังไม่เข้าไปในตัวคำสั่ง
//   (รหัส 42501 = ไม่มีสิทธิ์เรียก · ถ้าได้ข้อความ dealer_not_found แปลว่าเข้าไปถึงตัวคำสั่งแล้ว = สิทธิ์ยังเปิดอยู่)
//
// ฝั่ง "เส้นทางของ HQ ลบ/ย้ายสำเร็จ" มีข้อทดสอบอยู่แล้วที่ move-dealer-data.spec.ts · edge-cases-admin.spec.ts · func-hq.spec.ts
//   ซึ่งตกบนฐานที่สร้างจากใบก่อนใบ 0188 (ฝั่งเซิร์ฟเวอร์ไม่มีสิทธิ์เรียก ได้ 503)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

const ไม่มีสาขานี้ = "ZZNOPE";
async function ใบผ่านของ(who: Account) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword(who);
  if (error || !data.session) throw new Error(`ล็อกอิน ${who.email} ไม่ผ่าน: ${error?.message}`);
  return data.session.access_token;
}
const เรียกตรง = (req: APIRequestContext, fn: string, token: string, data: unknown) =>
  req.post(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { data, headers: { apikey: SUPABASE_ANON, authorization: `Bearer ${token}`, "content-type": "application/json" } });

for (const [fn, args] of [
  ["delete_dealer_atomic", { p_code: ไม่มีสาขานี้ }],
  ["move_dealer_data_atomic", { p_from: ไม่มีสาขานี้, p_to: "ZZNOPF" }],
] as const) {
  test(`[security] ${fn}: ผู้ใช้ทุกบทบาทและคนที่ยังไม่เข้าระบบ ยิงตรงเข้าฐานไม่ได้`, async ({ request }) => {
    const ผู้เรียก: [string, string][] = [
      ["ผู้ดูแลสำนักงานใหญ่", await ใบผ่านของ(ADMIN)],   // แม้เป็นผู้ดูแลก็ต้องผ่านเส้นทางของระบบ ไม่ใช่ยิงตรง
      ["ดีลเลอร์", await ใบผ่านของ(RYG)],
      ["คนที่ยังไม่เข้าระบบ", SUPABASE_ANON],
    ];
    for (const [ใคร, token] of ผู้เรียก) {
      const res = await เรียกตรง(request, fn, token, args);
      const body = await res.text();
      expect(res.status(), `${ใคร}ยิงตรงต้องถูกปฏิเสธ (ได้ ${res.status()} ${body.slice(0, 120)})`).toBeGreaterThanOrEqual(400);
      expect(body, `${ใคร}: ต้องถูกปฏิเสธที่สิทธิ์เรียกคำสั่ง (42501) ไม่ใช่เข้าไปถึงตัวคำสั่งแล้วค่อยล้ม`).toContain("42501");
    }
  });
}

test("[security] ฝั่งเซิร์ฟเวอร์ (กุญแจที่เส้นทางของ HQ ใช้) ต้องเรียกสองคำสั่งนี้ได้", async () => {
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  // เรียกด้วยสาขาที่ไม่มีอยู่ — ต้อง "เข้าไปถึงตัวคำสั่ง" แล้วได้คำตอบว่าไม่พบสาขา ไม่ใช่ถูกปฏิเสธสิทธิ์
  const ลบ = await admin.rpc("delete_dealer_atomic", { p_code: ไม่มีสาขานี้ });
  expect(ลบ.error?.code, `ลบ: ต้องไม่ถูกปฏิเสธสิทธิ์ (${ลบ.error?.message ?? "สำเร็จ"})`).not.toBe("42501");
  expect(ลบ.error?.message ?? "", "ลบ: ต้องได้คำตอบจากตัวคำสั่งว่าไม่พบสาขา").toContain("dealer_not_found");
  const ย้าย = await admin.rpc("move_dealer_data_atomic", { p_from: ไม่มีสาขานี้, p_to: "ZZNOPF" });
  expect(ย้าย.error?.code, `ย้าย: ต้องไม่ถูกปฏิเสธสิทธิ์ (${ย้าย.error?.message ?? "สำเร็จ"})`).not.toBe("42501");
  expect(ย้าย.error, "ย้าย: สาขาที่ไม่มีอยู่ต้องถูกตัวคำสั่งปฏิเสธเอง").not.toBeNull();
});
