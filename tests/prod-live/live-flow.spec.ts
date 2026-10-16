// ── ทดสอบ flow ขายบนเว็บจริงด้วยบัญชีชั่วคราว (ขั้น 6 วันขึ้นระบบ · 15 ต.ค. 69) ─────────────────────────────
// ดีลเลอร์ขอราคา → HQ ทำ BOQ + ส่งใบ HQ → ดีลเลอร์ทำใบลูกค้าจากใบ HQ (บวก %) → ส่งให้ลูกค้า → ลูกค้าตอบรับ (won)
// ทุกขั้นกดผ่านหน้าจอเว็บจริง · ตรวจผลที่ฐานด้วยกุญแจฝั่งเซิร์ฟเวอร์ (อ่านอย่างเดียว)
// ผู้เรียก: tests/prod-live/run.mjs (สร้างสาขา/บัญชีชั่วคราว + ลูกค้าเป้าหมายตั้งต้น · ล้างทิ้งด้วย cleanup.sql)
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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
  const email = page.getByLabel(/อีเมล/i).first(), pass = page.getByLabel(/รหัสผ่าน/i).first();
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
    await แผง.getByLabel("แม่แบบ").selectOption({ index: 1 });
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
    const ตัวเลือก = กล่อง.getByLabel("เพิ่มรายการจากแม่แบบ");
    await ตัวเลือก.selectOption((await ตัวเลือก.locator("option").nth(1).getAttribute("value"))!);
    await กล่อง.getByLabel("จำนวน 1").fill("100");
    await กล่อง.getByLabel("ต้นทุนต่อหน่วย 1").fill("1000");   // แม่แบบบนระบบจริงยังไม่มีราคา (7/7 = 0) — HQ พิมพ์ต้นทุนเอง
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
