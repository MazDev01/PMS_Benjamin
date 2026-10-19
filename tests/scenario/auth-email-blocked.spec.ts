import { test, expect, request as pwRequest } from "@playwright/test";
import { RYG, CNX, ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { adminClient } from "./testDealers";

// ── ปิดอีเมลของระบบล็อกอิน (ลืมรหัสผ่าน + เลขเข้าระบบ) — บอสสั่ง 16 ต.ค. 69 ─────────────────────────────
//   ที่มา: อีเมลล็อกอินของทุกบัญชีบนระบบจริงเป็นโดเมนที่เราไม่ได้คุม (ดีลเลอร์ 155 บัญชีเคยใช้โดเมนที่ยังไม่มีใครจด — ย้ายไป dealer.benjaminpebsteel.com 19 ต.ค. 69)
//   ใครจดโดเมนนั้นได้ = ขอลิงก์ตั้งรหัสใหม่/เลขเข้าระบบไปที่โดเมนตัวเอง แล้วยึดบัญชีได้
//   → ซ่อนปุ่มอย่างเดียวไม่พอ: endpoint ของ Supabase (/auth/v1/recover · /auth/v1/otp) เรียกตรงได้โดยไม่ผ่านแอป
//     ตัวกันจริงคือ Send Email Hook ที่ฐาน (ใบ 0213 · public.hook_send_email) ปฏิเสธทุกคำขอส่งอีเมลของระบบล็อกอิน
//   ลืมรหัสผ่าน = ติดต่อ HQ ให้ตั้งรหัสใหม่ให้ · เปิดคืนได้เมื่อทุกบัญชีย้ายไปอีเมลจริงที่ยืนยันแล้ว
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

for (const [ชื่อ, origin, path] of [["ดีลเลอร์", DEALER_ORIGIN, "/login"], ["HQ", HQ_ORIGIN, "/hq/login"]] as const) {
  test(`[ui·${ชื่อ}] หน้าเข้าสู่ระบบไม่มีปุ่ม "ลืมรหัสผ่าน?" · ขึ้น "ลืมรหัสผ่าน ติดต่อ HQ"`, async ({ page }) => {
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.locator("#login-email")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /ลืมรหัสผ่าน/ }), "ต้องไม่มีปุ่มลืมรหัสผ่าน").toHaveCount(0);
    await expect(page.getByText("ลืมรหัสผ่าน ติดต่อ HQ", { exact: true })).toBeVisible();
  });
}

test("[security] Supabase ปฏิเสธคำขอลืมรหัสผ่าน (/recover) และเลขเข้าระบบ (/otp) ที่เรียกตรงโดยไม่ผ่านแอป", async () => {
  // ต้องเป็น 403 + ข้อความของ hook_send_email เท่านั้น — เดิมตรวจแค่ ≥ 400 แล้วผ่านทั้งที่ระบบจริงยังไม่เปิด Hook (19 ต.ค. 69):
  //   ไม่มี Hook = ตัวส่งอีเมลมาตรฐานของ Supabase ส่งไม่ได้แล้วตอบ 500 · ถ้าส่งได้ = อีเมลออกไปจริง
  const api = await pwRequest.newContext();
  const หัว = { apikey: SUPABASE_ANON, "content-type": "application/json" };
  const svc = adminClient();
  for (const who of [RYG, ADMIN]) {
    const ป้าย = who === ADMIN ? "HQ" : "ดีลเลอร์";
    for (const [ทาง, data] of [["recover", { email: who.email }], ["otp", { email: who.email, create_user: false }]] as const) {
      const r = await api.post(`${SUPABASE_URL}/auth/v1/${ทาง}`, { headers: หัว, data });
      expect(r.status(), `/${ทาง} ของ${ป้าย} ต้องถูก Send Email Hook ปฏิเสธ (403)`).toBe(403);
      expect(await r.text(), `/${ทาง} ของ${ป้าย} ต้องตอบข้อความของ hook_send_email`).toContain("auth_email_disabled");
    }
    // ไม่มีลิงก์/เลขถูกสร้าง และไม่มีบันทึกว่าส่ง (ดูจากบัญชีจริงในระบบล็อกอิน)
    const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const u = list.users.find(x => x.email === who.email);
    expect(u, `ต้องเจอบัญชี${ป้าย}`).toBeTruthy();
    const ส่งล่าสุด = Math.max(Date.parse(u!.recovery_sent_at ?? "") || 0, Date.parse((u as { email_change_sent_at?: string }).email_change_sent_at ?? "") || 0);
    expect(Date.now() - ส่งล่าสุด > 60_000, `บัญชี${ป้าย}ต้องไม่มีบันทึกส่งอีเมลลืมรหัส/เลขเข้าระบบในนาทีนี้`).toBe(true);
  }
  await api.dispose();
});

test("[func] ปุ่ม \"ดูรหัสผ่าน\" (ขอเลขทางอีเมล) ตอบว่าปิดชั่วคราว ติดต่อ HQ — ทั้งดีลเลอร์และ HQ", async () => {
  const api = await pwRequest.newContext();
  const tok = async (who: typeof RYG) => (await (await db(who)).auth.getSession()).data.session?.access_token ?? "";
  // ใช้ CNX ไม่ใช่ RYG — โควตาขอเลข (3 ครั้ง/15 นาที) เป็นรายสาขา ข้อ dealer-account-page ใช้ของ RYG อยู่แล้ว
  //   ใช้ร่วมกัน = ได้ 429 ก่อนถึงตัวกันที่ต้องการตรวจ (เจอในรอบเต็ม 16 ต.ค. 69)
  const ด = await api.post(`${HQ_ORIGIN}/api/account/reveal`, { headers: { authorization: `Bearer ${await tok(CNX)}`, "content-type": "application/json" }, data: { op: "send" } });
  expect(ด.status(), "ดีลเลอร์ขอเลขดูรหัส").toBe(403);
  expect(JSON.stringify(await ด.json())).toContain("ติดต่อ HQ");
  // HQ: ต้องมีสำเนารหัสก่อน ไม่งั้นตอบ "ไม่มีสำเนา" (404) ก่อนถึงขั้นขอเลข = ไม่ได้ตรวจทางอีเมลจริง
  const หัวHQ = { authorization: `Bearer ${await tok(ADMIN)}`, "content-type": "application/json" };
  const { data: เดิม } = await adminClient().from("hq_login_secrets").select("user_id").limit(100);
  try {
    expect((await api.post(`${HQ_ORIGIN}/api/account/hq-secret`, { headers: หัวHQ, data: { op: "save", password: ADMIN.password } })).status(), "เก็บสำเนารหัส HQ").toBe(200);
    const ห = await api.post(`${HQ_ORIGIN}/api/account/hq-secret`, { headers: หัวHQ, data: { op: "send" } });
    expect(ห.status(), "HQ ขอเลขดูรหัส").toBe(403);
    expect(JSON.stringify(await ห.json())).toContain("ติดต่อ");
  } finally {
    // คืนสภาพ: ลบเฉพาะสำเนาที่ข้อนี้สร้าง (ข้ออื่นตรวจกรณี "ยังไม่มีสำเนา")
    const มีเดิม = new Set((เดิม ?? []).map(r => String(r.user_id)));
    const { data: หลัง } = await adminClient().from("hq_login_secrets").select("user_id").limit(100);
    for (const r of หลัง ?? []) if (!มีเดิม.has(String(r.user_id))) await adminClient().from("hq_login_secrets").delete().eq("user_id", r.user_id);
  }
  await api.dispose();
});

test("[ui·hq] เมนูจัดการผู้ใช้ HQ ไม่มี \"รีเซ็ตรหัสผ่าน (ส่งลิงก์ทางอีเมล)\" · ยังตั้งรหัสใหม่ทันทีได้", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("tab", { name: "ผู้ใช้งานและสิทธิ์" }).or(page.getByRole("button", { name: "ผู้ใช้งานและสิทธิ์" })).first().click();
  await page.getByTitle("จัดการ").first().click({ timeout: 20_000 });
  await expect(page.getByText("ตั้งรหัสผ่านใหม่ทันที (ไม่ต้องส่งอีเมล)")).toBeVisible();
  await expect(page.getByText(/ส่งลิงก์ทางอีเมล/), "ต้องไม่มีเมนูส่งลิงก์รีเซ็ตทางอีเมล").toHaveCount(0);
});
