import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ── prod-live รอบ 3 (บอสสั่ง 21 ต.ค. 69 · หลังลงใบ 0226–0230 และขึ้นเว็บ) ──────────────────────────────────────────
//   ส่ง V1 → กด "ทำฉบับใหม่" บนหน้าเว็บ → แก้ % → ส่ง V2 → V1 ถูกแทนที่ · มูลค่าลีดตาม V2 · ลบใบที่ส่งแล้ว/ตอบรับ V1 ไม่ได้
//   เลขที่ V1 กับ V2 บนตารางไม่เหมือนกัน (ไม่ถูกตัด)
//   ใช้สาขา/บัญชีชั่วคราวชุดเดียวกับ live-flow.spec.ts (run.mjs setup) · ล้างด้วย cleanup.sql ตัวเดิม (ลบทุกอย่างของสาขา ZZT)
const E = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`ขาด ${k}`); return v; };
const HQ = E("LIVE_HQ_URL"), DEALER = E("LIVE_DEALER_URL");
void HQ;
const ผู้ดูแล = { email: E("LIVE_HQ_EMAIL"), password: E("LIVE_PASSWORD") };
const ดีลเลอร์ = { email: E("LIVE_DEALER_EMAIL"), password: E("LIVE_PASSWORD") };
const สาขา = E("LIVE_DEALER_CODE"), เลขลีดหลัก = Number(E("LIVE_LEAD_NUM"));
const URL_ = E("LIVE_SUPABASE_URL"), ANON = E("LIVE_ANON_KEY");
const svc = createClient(URL_, E("LIVE_SERVICE_KEY"), { auth: { persistSession: false } });
const ลงชื่อ = async (who: { email: string; password: string }) => {
  const c = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword(who);
  if (error) throw new Error(`ลงชื่อเข้าระบบไม่ได้: ${error.message}`);
  return c;
};
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const เลขลีด = เลขลีดหลัก + 2;   // +1 ใช้ใน live-round2.spec.ts
const บริษัท = `ZZTEST-ฉบับใหม่-${เลขลีด % 100000}`;

async function เข้าระบบ(page: Page, origin: string, path: string, who: { email: string; password: string }) {
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const email = page.locator("#login-email"), pass = page.getByLabel(/รหัสผ่าน/i).first();
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (let i = 0; i < 6; i++) {
      await email.fill(who.email); await pass.fill(who.password);
      await page.waitForTimeout(300);
      if (await email.inputValue() === who.email && await pass.inputValue() === who.password) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    if (await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 }).then(() => true).catch(() => false)) {
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      return;
    }
  }
  throw new Error(`เข้าระบบไม่ผ่าน (${origin}${path})`);
}

test("[live·รอบ3] ส่ง V1 → ทำฉบับใหม่ → ส่ง V2 → V1 ถูกแทนที่ · มูลค่าลีดตาม V2 · ลบใบที่ส่งแล้วไม่ได้", async ({ page }) => {
  // ลีด + ใบ HQ + ใบ V1 ที่ส่งแล้ว (เตรียมด้วยคำสั่งเดียวกับที่หน้าเว็บใช้ · ขั้นที่ทดสอบจริงอยู่บนหน้าเว็บข้างล่าง)
  const l = await svc.from("leads").insert({ id: `#L-${เลขลีด}`, num_id: เลขลีด, dealer_code: สาขา, company: บริษัท, name: บริษัท,
    contact: "ผู้ทดสอบ", phone: "000-000-0002", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET" });
  expect(l.error?.message ?? "", "สร้างลีดทดสอบ").toBe("");
  const ด = await ลงชื่อ(ดีลเลอร์);
  const r = await ด.rpc("quote_request_submit", { p_lead_num_id: เลขลีด, p_product: "โกดังสำเร็จรูป" });
  expect(r.error?.message ?? "", "ดีลเลอร์ขอราคา").toBe("");
  const rid = Number((r.data as { id: number }).id);
  const h = await ลงชื่อ(ผู้ดูแล);
  const วัน = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  expect((await h.rpc("hq_quote_save", { p_request_id: rid, p_lines: [{ name: "โครงเหล็กทดสอบ", qty: 1, unit: "ชุด", unitCost: 1_000_000 }], p_valid_until: วัน, p_note: "" })).error?.message ?? "", "HQ บันทึกใบ").toBe("");
  expect((await h.rpc("hq_quote_send", { p_request_id: rid })).error?.message ?? "", "HQ ส่งใบ").toBe("");
  const { data: hq } = await svc.from("hq_quotes").select("id").eq("request_id", rid).single();
  const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const q1 = await ด.rpc("create_quotation", { p_dealer: สาขา, p_prefix: "Q-", p_payload: {
    customer: บริษัท, project: บริษัท, province: "ระยอง", total: "0", status: "draft", date: วันนี้,
    line_items: [{ name: "โครงเหล็กทดสอบ", qty: 1, unit: "ชุด", unitPrice: 0, markupPct: 10 }], items: 1,
    hq_quote_id: hq!.id, deal_id: เลขลีด, markup_percent: 10 } });
  expect(q1.error?.message ?? "", "ทำใบ V1").toBe("");
  const v1 = (q1.data as { id: string }).id, v2 = `${v1}-V2`;
  expect((await ด.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", สาขา).eq("id", v1)).error?.message ?? "", "ส่ง V1").toBe("");
  const ใบ = async (id: string) => (await svc.from("quotations").select("status, total_value, revision, supersedes_id").eq("dealer_code", สาขา).eq("id", id).maybeSingle()).data;
  const มูลค่าลีด = async () => Number((await svc.from("leads").select("quote_value").eq("dealer_code", สาขา).eq("num_id", เลขลีด).single()).data?.quote_value ?? 0);
  expect(await มูลค่าลีด(), "ส่ง V1 แล้ว มูลค่าลีด = ยอด V1").toBe(1_100_000);

  // หน้าเว็บ: ทำฉบับใหม่ → แก้ % → บันทึก
  await เข้าระบบ(page, DEALER, "/login", ดีลเลอร์);
  const เปิดรายการ = async () => {
    await page.goto(`${DEALER}/quotations`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.getByPlaceholder(/ค้นหา/).first().fill(v1);
    await expect(page.locator("tbody tr").filter({ hasText: v1 }).first()).toBeVisible({ timeout: 30_000 });
  };
  // รอบ 4: หน้าใบเสนอราคาเป็นรายการอย่างเดียว — กดแถว V1 → แผงลีด › แท็บใบเสนอราคา › ปุ่มของใบ V1
  const เปิดแผงใบ = async () => {
    await เปิดรายการ();
    await page.locator("tbody tr").filter({ hasText: v1 }).first().locator("td").first().click();
    await page.waitForURL(/\/leads/, { timeout: 30_000 });
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 30_000 });
  };
  await เปิดแผงใบ();
  await page.locator(`[data-quote-item="${v1}"]`).getByTitle("ทำฉบับใหม่").click({ timeout: 30_000 });
  await expect(page.locator("[data-version-copied]"), "ฟอร์มฉบับใหม่").toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" }).getByLabel("% ที่บวก 1").fill("5");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => Number((await ใบ(v2))?.total_value ?? 0), { timeout: 30_000, message: "V2 บันทึก % ใหม่" }).toBe(1_050_000);
  expect(await ใบ(v2), "V2 = ใบร่างฉบับ V2 ผูกใบเดิม").toMatchObject({ status: "draft", revision: "V2", supersedes_id: v1 });

  // หน้าเว็บ: ส่ง V2 → V1 ถูกแทนที่ · มูลค่าลีด = V2
  // รอบ 4: ส่ง = กล่องขั้นต่อไปในแผงลีดที่เดียว
  await เปิดแผงใบ();
  await expect(page.locator(`[data-quote-item="${v2}"]`), "แผงลีดเห็น V2").toBeVisible({ timeout: 30_000 });
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 30_000 });
  const กล่องยืนยัน = page.locator(".pms-confirm[role='alertdialog']");
  await expect(กล่องยืนยัน, "ต้องมีกล่องยืนยันก่อนส่ง").toBeVisible({ timeout: 15_000 });
  await กล่องยืนยัน.locator(".pms-confirm-actions button").last().click();
  await expect.poll(async () => (await ใบ(v1))?.status, { timeout: 30_000, message: "ส่ง V2 แล้ว V1 ถูกแทนที่" }).toBe("superseded");
  expect((await ใบ(v2))?.status).toBe("sent_to_client");
  await expect.poll(มูลค่าลีด, { timeout: 30_000, message: "มูลค่าลีดตาม V2" }).toBe(1_050_000);

  // หน้าเว็บ: เลขที่ V1/V2 ไม่เหมือนกัน · V1 ขึ้นถูกแทนที่
  await เปิดรายการ();
  const เลขที่ = await page.locator("tbody tr").filter({ hasText: v1 }).locator("[data-quote-no]").allTextContents();
  expect(เลขที่.map(t => t.trim()).sort(), "เลขที่ V1/V2 บนตาราง").toEqual([v1, v2].sort());
  await expect(page.locator("tbody tr").filter({ hasText: v1 }).filter({ hasNotText: v2 }).getByText("ถูกแทนที่", { exact: true })).toBeVisible();

  // ฐาน: ตอบรับ V1 ไม่ได้ · ลบใบที่ส่งแล้วไม่ได้
  expect((await ด.from("quotations").update({ status: "won" }).eq("dealer_code", สาขา).eq("id", v1)).error?.message ?? "", "ตอบรับ V1 ไม่ได้").toMatch(/quote_superseded/);
  for (const id of [v1, v2]) {
    expect((await ด.from("quotations").delete().eq("dealer_code", สาขา).eq("id", id)).error?.message ?? "", `ลบ ${id} ไม่ได้`).toMatch(/quote_sent_no_delete/);
  }
});
