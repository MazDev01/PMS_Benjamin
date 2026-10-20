import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// ── prod-live รอบ 2 (บอสสั่ง 20 ต.ค. 69 · หลังลงใบ 0218–0225 และขึ้นเว็บ) ──────────────────────────────────────────
//   1) ลีดค้าง "รอราคา HQ" (คำขอส่งใบแล้วแต่ลีดยังไม่ขยับ) = 0
//   2) ดีลเลอร์เห็นทะเบียนดีลเลอร์แค่แถวตัวเอง (ใบ 0220)
//   3) แถว HQ ไม่อยู่ในรายชื่อดีลเลอร์ของหน้า HQ (ช่วง ข)
//   4) กระดิ่งดีลเลอร์ไม่ขึ้น 9+ ค้าง (นับเฉพาะยังไม่อ่าน · ประวัติก่อนวันเริ่มใช้ไม่นับ — ช่วง ค)
//   5) ลีดที่มีแค่ใบ HQ (ยังไม่มีใบลูกค้าที่ส่งแล้ว) → มูลค่า "—" ทั้งในฐานและบนหน้าเว็บ (ใบ 0223)
//   ใช้สาขา/บัญชีชั่วคราวชุดเดียวกับ live-flow.spec.ts (run.mjs setup) · ล้างด้วย cleanup.sql ตัวเดิม (ลบทุกอย่างของสาขา ZZT)
const E = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`ขาด ${k}`); return v; };
const HQ = E("LIVE_HQ_URL"), DEALER = E("LIVE_DEALER_URL");
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

const เลขลีดใบHQ = เลขลีดหลัก + 1;
const บริษัทใบHQ = `ZZTEST-มีแค่ใบHQ-${เลขลีดใบHQ % 100000}`;

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

test("[live·รอบ2] 1) ลีดค้าง \"รอราคา HQ\" = 0", async () => {
  const { data: ลีด, error } = await svc.from("leads").select("dealer_code, num_id").eq("status", "HQ_PRICING");
  expect(error?.message ?? "").toBe("");
  let ค้าง = 0;
  for (const l of ลีด ?? []) {
    const { count } = await svc.from("quote_requests").select("id", { count: "exact", head: true })
      .eq("dealer_code", l.dealer_code).eq("lead_num_id", l.num_id).eq("status", "quoted");
    if ((count ?? 0) > 0) ค้าง++;
  }
  expect(ค้าง, "ลีดที่ HQ ส่งใบแล้วแต่ยังค้างรอราคา").toBe(0);
});

test("[live·รอบ2] 2) ดีลเลอร์เห็นทะเบียนดีลเลอร์แค่แถวตัวเอง", async () => {
  const c = await ลงชื่อ(ดีลเลอร์);
  const { data, error } = await c.from("dealers_directory").select("code");
  expect(error?.message ?? "").toBe("");
  expect([...new Set((data ?? []).map(r => r.code))], "เห็นเฉพาะรหัสสาขาตัวเอง").toEqual([สาขา]);
  const h = await ลงชื่อ(ผู้ดูแล);
  const { count } = await h.from("dealers_directory").select("code", { count: "exact", head: true });
  expect(count ?? 0, "HQ ยังเห็นทั้งทะเบียน").toBeGreaterThan(1);
});

test("[live·รอบ2] 3) แถว HQ ไม่อยู่ในรายชื่อดีลเลอร์ของหน้า HQ", async ({ page }) => {
  await เข้าระบบ(page, HQ, "/hq/login", ผู้ดูแล);
  await page.goto(`${HQ}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await expect(page.locator("tbody tr").first(), "ทะเบียนโหลดแล้ว").toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder(/ค้นหา/).first().fill("สำนักงานใหญ่");
  await expect(page.locator("td[data-col='code']").filter({ hasText: /^HQ$/ }), "ไม่มีแถว HQ").toHaveCount(0);
  await page.getByPlaceholder(/ค้นหา/).first().fill("HQ");
  await expect(page.locator("td[data-col='code']").filter({ hasText: /^HQ$/ }), "ค้นด้วยรหัสก็ไม่มีแถว HQ").toHaveCount(0);
});

test("[live·รอบ2] 4) กระดิ่งดีลเลอร์ไม่ขึ้น 9+ ค้าง", async ({ page }) => {
  await เข้าระบบ(page, DEALER, "/login", ดีลเลอร์);
  await page.goto(`${DEALER}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await expect(page.getByRole("button", { name: "การแจ้งเตือน" }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);   // ให้ข้อมูลงานขายโหลดครบก่อนนับ
  const ป้าย = page.locator("[data-unread-count]");
  const นับ = (await ป้าย.count()) ? Number(await ป้าย.first().getAttribute("data-unread-count")) : 0;
  console.log(`กระดิ่งดีลเลอร์ (บัญชีทดสอบ · เปิดครั้งแรก): ยังไม่อ่าน ${นับ} เรื่อง`);
  expect(นับ, "ไม่ขึ้น 9+").toBeLessThan(10);
  await expect(page.getByText("9+", { exact: true }), "ไม่มีป้าย 9+").toHaveCount(0);
});

test("[live·รอบ2] 5) ลีดที่มีแค่ใบ HQ → มูลค่า \"—\" (ฐาน + หน้าเว็บ)", async ({ page }) => {
  const l = await svc.from("leads").insert({ id: `#L-${เลขลีดใบHQ}`, num_id: เลขลีดใบHQ, dealer_code: สาขา, company: บริษัทใบHQ, name: บริษัทใบHQ,
    contact: "ผู้ทดสอบ", phone: "000-000-0001", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET" });
  expect(l.error?.message ?? "", "สร้างลีดทดสอบ").toBe("");
  const ด = await ลงชื่อ(ดีลเลอร์);
  const r = await ด.rpc("quote_request_submit", { p_lead_num_id: เลขลีดใบHQ, p_product: "โกดังสำเร็จรูป" });
  expect(r.error?.message ?? "", "ดีลเลอร์ขอราคา").toBe("");
  const rid = Number((r.data as { id: number }).id);
  const h = await ลงชื่อ(ผู้ดูแล);
  const วัน = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  const s = await h.rpc("hq_quote_save", { p_request_id: rid, p_lines: [{ name: "โครงเหล็กทดสอบ", qty: 1, unit: "ชุด", unitCost: 5_000_000 }], p_valid_until: วัน, p_note: "" });
  expect(s.error?.message ?? "", "HQ บันทึกใบ").toBe("");
  const ส่ง = await h.rpc("hq_quote_send", { p_request_id: rid });
  expect(ส่ง.error?.message ?? "", "HQ ส่งใบ").toBe("");
  const { data: ลีด } = await svc.from("leads").select("status, quote_value").eq("dealer_code", สาขา).eq("num_id", เลขลีดใบHQ).single();
  expect(ลีด?.status, "HQ ส่งใบแล้วลีดเป็นได้ราคา HQ").toBe("HQ_QUOTED");
  expect(ลีด?.quote_value ?? null, "ฐาน: มีแค่ใบ HQ = ไม่มีมูลค่า").toBeNull();

  await เข้าระบบ(page, DEALER, "/login", ดีลเลอร์);
  await page.goto(`${DEALER}/leads`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัทใบHQ);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัทใบHQ }).first();
  await expect(แถว).toBeVisible({ timeout: 30_000 });
  await expect(แถว.locator("td.num").last(), "หน้าเว็บ: มูลค่า = —").toHaveText("—");
  await expect(แถว, "หน้าเว็บ: ไม่แสดงราคาทุนจากใบ HQ").not.toContainText(/5\.0M|5,000,000/);
});
