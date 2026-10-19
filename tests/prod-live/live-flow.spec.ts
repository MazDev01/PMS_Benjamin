// ── ทดสอบ flow ขายบนเว็บจริงด้วยบัญชีชั่วคราว (ขั้น 6 วันขึ้นระบบ · 15 ต.ค. 69) ─────────────────────────────
// ดีลเลอร์ขอราคา → HQ ทำ BOQ + ส่งใบ HQ → ดีลเลอร์ทำใบลูกค้าจากใบ HQ (บวก %) → ส่งให้ลูกค้า → ลูกค้าตอบรับ (won)
// ทุกขั้นกดผ่านหน้าจอเว็บจริง · ตรวจผลที่ฐานด้วยกุญแจฝั่งเซิร์ฟเวอร์ (อ่านอย่างเดียว)
// ผู้เรียก: tests/prod-live/run.mjs (สร้างสาขา/บัญชีชั่วคราว + ลูกค้าเป้าหมายตั้งต้น · ล้างทิ้งด้วย cleanup.sql)
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ตรวจโดเมนบัญชีดีลเลอร์, LOGIN_DOMAIN } from "./loginDomainCheck.mjs";

const E = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`ขาด ${k}`); return v; };
const HQ = E("LIVE_HQ_URL"), DEALER = E("LIVE_DEALER_URL");
const ผู้ดูแล = { email: E("LIVE_HQ_EMAIL"), password: E("LIVE_PASSWORD") };
const ดีลเลอร์ = { email: E("LIVE_DEALER_EMAIL"), password: E("LIVE_PASSWORD") };
const สาขา = E("LIVE_DEALER_CODE"), บริษัท = E("LIVE_COMPANY"), เลขลีด = Number(E("LIVE_LEAD_NUM"));
const svc = createClient(E("LIVE_SUPABASE_URL"), E("LIVE_SERVICE_KEY"), { auth: { persistSession: false } });

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const ลีด = async () => (await svc.from("leads").select("status").eq("dealer_code", สาขา).eq("num_id", เลขลีด).single()).data?.status;
const คำขอ = async () => (await svc.from("quote_requests").select("id, status").eq("dealer_code", สาขา).eq("lead_num_id", เลขลีด).order("id", { ascending: false }).limit(1).maybeSingle()).data;
const ใบHQ = async (rid: number) => (await svc.from("hq_quotes").select("id, status, total_cost").eq("request_id", rid).maybeSingle()).data;
const ใบลูกค้า = async () => (await svc.from("quotations").select("id, status, total_value, hq_quote_id").eq("dealer_code", สาขา).eq("deal_id", เลขลีด).maybeSingle()).data;

const ข้อผิดพลาด: string[] = [];
function ดูข้อผิดพลาด(page: Page) {
  page.on("pageerror", e => ข้อผิดพลาด.push(`pageerror ${e.message}`));
  page.on("response", r => { if (r.status() >= 500) ข้อผิดพลาด.push(`${r.status()} ${new URL(r.url()).pathname}`); });
}
async function รอเงียบ(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
}
async function เข้าระบบ(page: Page, origin: string, path: string, who: { email: string; password: string }) {
  // หน้าเข้าสู่ระบบโหลดตัวเองเสร็จทีหลังแล้วล้างช่องที่กรอกไว้ (รอบแรกบนเว็บจริง 15 ต.ค. 69: ช่องอีเมลว่าง)
  //   → กรอกแล้วอ่านค่ากลับจนนิ่ง เหมือน loginUI ของชุดในเครื่อง (tests/scenario/funcHelpers.ts)
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  await รอเงียบ(page);
  const email = page.locator("#login-email"), pass = page.getByLabel(/รหัสผ่าน/i).first();
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
    const ออกจากหน้าเข้าระบบ = await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 })
      .then(() => true).catch(() => false);
    if (ออกจากหน้าเข้าระบบ) { await รอเงียบ(page); return; }
  }
  throw new Error(`เข้าระบบไม่ผ่าน (${origin}${path})`);
}
async function ตกลงในกล่องยืนยัน(page: Page) {
  const box = page.locator(".pms-confirm[role='alertdialog']");
  await expect(box, "ต้องมีกล่องยืนยัน").toBeVisible({ timeout: 15_000 });
  await box.locator(".pms-confirm-actions button").last().click();
  await expect(box).toBeHidden({ timeout: 15_000 });
}
async function เปิดแท็บใบเสนอราคาของลีด(page: Page) {
  await page.goto(`${DEALER}/leads`, { waitUntil: "domcontentloaded" });
  await รอเงียบ(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท);
  const row = page.locator("tbody tr").filter({ hasText: บริษัท }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
}

test("[live] ดีลเลอร์ขอราคา → HQ ส่งใบ → ดีลเลอร์ทำใบลูกค้า → ส่ง → ลูกค้าตอบรับ (won)", async ({ browser }) => {
  const ctxD = await browser.newContext(), ctxH = await browser.newContext();
  const d = await ctxD.newPage(), h = await ctxH.newPage();
  ดูข้อผิดพลาด(d); ดูข้อผิดพลาด(h);

  await test.step("1 ดีลเลอร์ขอราคาจาก HQ", async () => {
    await เข้าระบบ(d, DEALER, "/login", ดีลเลอร์);
    await เปิดแท็บใบเสนอราคาของลีด(d);
    const แผง = d.locator("[data-panel='quote-request']");
    await แผง.getByRole("button", { name: "ขอราคาจาก HQ" }).click();
    await แผง.getByLabel("งานที่ขอราคา").fill("ทดสอบระบบ — โกดัง");   // ไม่มีตัวเลือกแม่แบบแล้ว (16 ต.ค. 69)
    await แผง.getByLabel("สเปก / รายละเอียด").fill("ทดสอบระบบ — โกดัง 10x10 ม.");
    await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
    await expect(แผง.getByText("ใหม่", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect.poll(ลีด, { timeout: 20_000, message: "ลูกค้าเป้าหมาย → รอราคา HQ" }).toBe("HQ_PRICING");
  });

  let rid = 0;
  await test.step("2 HQ ทำ BOQ แล้วส่งใบ HQ", async () => {
    rid = Number((await คำขอ())?.id ?? 0);
    expect(rid, "ต้องมีคำขอในฐาน").toBeGreaterThan(0);
    await เข้าระบบ(h, HQ, "/hq/login", ผู้ดูแล);
    await h.goto(`${HQ}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    await รอเงียบ(h);
    await h.getByLabel("ค้นหาคำขอ").fill(บริษัท);
    const row = h.locator("tbody tr").filter({ hasText: บริษัท }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: /ทำใบ HQ|ดูใบ HQ/ }).click();
    const กล่อง = h.getByRole("dialog", { name: "ใบ HQ" });
    await expect(กล่อง).toBeVisible({ timeout: 20_000 });
    // HQ พิมพ์รายการเอง (ไม่มีแม่แบบแล้ว 16 ต.ค. 69) — ใบใหม่เริ่มว่าง
    if (await กล่อง.getByLabel("ชื่อรายการ 1").count() === 0) await กล่อง.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
    await กล่อง.getByLabel("ชื่อรายการ 1").fill("ทดสอบระบบ — โครงสร้างเหล็ก");
    await กล่อง.getByLabel("จำนวน 1").fill("100");
    await กล่อง.getByLabel("หน่วย 1", { exact: true }).fill("ตร.ม.");
    await กล่อง.getByLabel("ต้นทุนต่อหน่วย 1").fill("1000");
    await expect(กล่อง.getByTestId("hq-quote-total")).toHaveText("100,000.00");
    await กล่อง.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }).click();
    await ตกลงในกล่องยืนยัน(h);
    await expect.poll(async () => (await ใบHQ(rid))?.status, { timeout: 30_000, message: "ใบ HQ = ส่งแล้ว" }).toBe("sent");
    expect((await คำขอ())?.status, "คำขอ = ส่งใบแล้ว").toBe("quoted");
    expect(Number((await ใบHQ(rid))?.total_cost), "ยอดต้นทุนใบ HQ").toBeGreaterThan(0);
  });

  await test.step("3 ดีลเลอร์ทำใบลูกค้าจากใบ HQ (บวก 20%)", async () => {
    await เปิดแท็บใบเสนอราคาของลีด(d);
    await d.getByRole("button", { name: /ทำใบเสนอราคาจากใบ HQ/ }).click({ timeout: 30_000 });
    const ตาราง = d.locator("[data-editor='hq-markup']");
    await expect(ตาราง).toBeVisible({ timeout: 20_000 });
    await ตาราง.getByLabel("% ที่บวก 1").fill("20");
    await d.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
    const hq = await ใบHQ(rid);
    await expect.poll(async () => (await ใบลูกค้า())?.hq_quote_id, { timeout: 30_000, message: "ใบลูกค้าผูกใบ HQ" }).toBe(hq!.id);
    expect(Number((await ใบลูกค้า())!.total_value), "ราคาขาย = ต้นทุน × 1.2").toBeCloseTo(Number(hq!.total_cost) * 1.2, 2);
    await รอเงียบ(d);
  });

  await test.step("4 ดีลเลอร์ส่งใบให้ลูกค้า", async () => {
    await d.goto(`${DEALER}/quotations`, { waitUntil: "domcontentloaded" });
    await รอเงียบ(d);
    const แถว = d.locator("tbody tr").filter({ hasText: บริษัท }).first();
    await expect(แถว).toBeVisible({ timeout: 30_000 });
    await แถว.getByRole("button", { name: "ส่งให้ลูกค้า" }).first().click();
    await expect.poll(async () => (await ใบลูกค้า())?.status, { timeout: 30_000 }).toBe("sent_to_client");
    await expect.poll(ลีด, { timeout: 30_000, message: "ลูกค้าเป้าหมาย → QUOTED" }).toBe("QUOTED");
  });

  await test.step("5 ลูกค้าตอบรับ (won)", async () => {
    await d.goto(`${DEALER}/quotations`, { waitUntil: "domcontentloaded" });
    await รอเงียบ(d);
    await d.locator("tbody tr").filter({ hasText: บริษัท }).first().click();
    await d.getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
    await ตกลงในกล่องยืนยัน(d);
    await expect.poll(ลีด, { timeout: 30_000, message: "won → ลูกค้าเป้าหมาย PAID" }).toBe("PAID");
    expect((await ใบลูกค้า())?.status).toBe("won");
    expect((await ใบHQ(rid))?.status, "ใบ HQ = สั่งผลิต").toBe("ordered");
    expect((await คำขอ())?.status, "คำขอปิด won").toBe("won");
    await expect.poll(async () => (await svc.from("customers").select("id").eq("dealer_code", สาขา)).data?.length ?? 0,
      { timeout: 30_000, message: "ปิดการขายแล้วต้องมีลูกค้า" }).toBeGreaterThan(0);
  });

  expect(ข้อผิดพลาด, "ไม่มี error บนหน้า / 5xx").toEqual([]);
  await ctxD.close(); await ctxH.close();
});

// ── ปิดอีเมลของระบบล็อกอิน: Send Email Hook ต้องเปิดบนระบบจริง (ใบ 0213 · 19 ต.ค. 69 เจอว่ายังไม่เปิด) ──
//   ปิด Hook = Supabase ส่งอีเมลเอง (ตอบ 200 หรือ 500) · ต้องได้ 403 + ข้อความของเราเท่านั้น
test("[live] /recover และ /otp ถูก Send Email Hook ปฏิเสธ (403) · ไม่มีลิงก์/บันทึกส่ง · ล็อกอินรหัสผ่านยังได้ค่าใน JWT ครบ", async () => {
  const URL_ = E("LIVE_SUPABASE_URL"), หัว = { apikey: E("LIVE_ANON_KEY"), "Content-Type": "application/json" };
  for (const [ป้าย, who, คาด] of [["HQ", ผู้ดูแล, { user_role: "SUPER_ADMIN", dealer_code: "" }], ["ดีลเลอร์", ดีลเลอร์, { user_role: "DEALER_ADMIN", dealer_code: สาขา }]] as const) {
    for (const [ทาง, body] of [["recover", { email: who.email }], ["otp", { email: who.email, create_user: false }]] as const) {
      const r = await fetch(`${URL_}/auth/v1/${ทาง}`, { method: "POST", headers: หัว, body: JSON.stringify(body) });
      expect(r.status, `${ป้าย} /${ทาง} ต้องถูก Send Email Hook ปฏิเสธ (403)`).toBe(403);
      expect(await r.text(), `${ป้าย} /${ทาง} ต้องตอบข้อความของ hook_send_email`).toContain("auth_email_disabled");
    }
    const { data: list } = await svc.auth.admin.listUsers({ perPage: 1000 });
    const u = list.users.find(x => x.email === who.email);
    expect(u?.recovery_sent_at ?? null, `${ป้าย}: ต้องไม่มีบันทึกส่งลิงก์ลืมรหัส`).toBeNull();
    const t = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: "POST", headers: หัว, body: JSON.stringify(who) });
    const j = await t.json() as { access_token?: string };
    expect(t.status, `${ป้าย}: ล็อกอินรหัสผ่านต้องได้`).toBe(200);
    const c = JSON.parse(Buffer.from(String(j.access_token).split(".")[1], "base64url").toString());
    expect({ user_role: c.user_role, dealer_code: c.dealer_code, role: c.role }, `${ป้าย}: ค่าใน JWT จาก custom_access_token_hook`).toEqual({ ...คาด, role: "authenticated" });
  }
});

// ── บัญชีดีลเลอร์ทุกบัญชีเข้าระบบด้วยโดเมนของบริษัท (บอสสั่ง 19 ต.ค. 69) ──
//   โดเมนเดิมยังไม่มีใครจด — เหลือแม้บัญชีเดียว = คนจดโดเมนนั้นรับลิงก์รีเซ็ตรหัสได้ถ้า Send Email Hook ถูกปิด
test(`[live] บัญชีดีลเลอร์ทุกบัญชีใช้โดเมน ${LOGIN_DOMAIN} · ไม่มีโดเมนอื่น`, async () => {
  const users: { id: string; email?: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    expect(error).toBeNull();
    users.push(...data.users.map(u => ({ id: u.id, email: u.email })));
    if (data.users.length < 1000) break;
  }
  const { data: profiles, error } = await svc.from("profiles").select("id, role, dealer_code").range(0, 9999);
  expect(error).toBeNull();
  const ผล = ตรวจโดเมนบัญชีดีลเลอร์(users, profiles ?? []);
  expect(ผล.ดีลเลอร์, "ต้องเจอบัญชีดีลเลอร์").toBeGreaterThan(0);
  expect(ผล.โดเมนที่เจอ, `บัญชีดีลเลอร์ที่ไม่ใช่ ${LOGIN_DOMAIN} (นับตามโดเมน)`).toEqual({});
});

// ── ไม่มีหน้า/เมนู/API แม่แบบ (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) ──
test("[live] ไม่มีหน้า/เมนู/API แม่แบบ", async ({ browser }) => {
  for (const [origin, path, who, หน้าแม่แบบ] of [
    [DEALER, "/login", ดีลเลอร์, "/products"], [HQ, "/hq/login", ผู้ดูแล, "/hq/master"],
  ] as const) {
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await เข้าระบบ(p, origin, path, who);
    await expect(p.locator("nav, aside").first(), `${origin}: เมนูต้องขึ้นก่อนตรวจ`).toBeVisible({ timeout: 30_000 });
    await expect(p.getByRole("link", { name: /แม่แบบ/ }), `${origin}: เมนูต้องไม่มีแม่แบบ`).toHaveCount(0);
    const หน้า = await p.goto(`${origin}${หน้าแม่แบบ}`, { waitUntil: "domcontentloaded" });
    expect(หน้า?.status(), `${origin}${หน้าแม่แบบ} ต้องไม่พบหน้า`).toBe(404);
    const api = await ctx.request.get(`${origin}/api/v1/catalog`);
    expect(api.status(), `${origin}/api/v1/catalog ต้องตอบ 410`).toBe(410);
    await ctx.close();
  }
});
