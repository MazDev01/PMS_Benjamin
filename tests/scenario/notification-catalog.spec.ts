import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── รอบ 4 (บอสสั่ง 21 ต.ค. 69 · ใบ 0231): แจ้งเตือนจากตารางกลางที่เดียว ─────────────────────────────────────────
//   กดแจ้งเตือนแล้วต้องเปิดตรงเรื่องนั้น (ลีด · นัด · ใบค่าแฟรนไชส์) ไม่ใช่แค่ไปหน้ารายการ
//   คนทำเองไม่ได้แจ้ง (ดีลเลอร์ส่งคำขอเอง → กระดิ่งดีลเลอร์ไม่มีเรื่องนั้น)
//   ข้อทดสอบระดับฐาน (ทุกเรื่อง · กันซ้ำ · งานตั้งเวลารัน 2 รอบ · ตัวตรวจ): supabase/tests/notification_catalog.sql
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });
test.setTimeout(150_000);

const admin = adminClient();
const แท็ก = `${Date.now() % 100000}`;
const ลีด = `ZZTEST-แจ้งเตือนเปิดตรง-${แท็ก}`;
const นัด = `ZZTEST-นัดวันนี้-${แท็ก}`;
const ผู้สนใจ = `ZZTEST-ค้างชำระ-${แท็ก}`;
const เลขนัด = 990_000_000 + (Date.now() % 9_000_000);
const วันนี้ = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
// งานตั้งเวลาเริ่มแจ้งเรื่องรายวัน 07:00 น. — ระบุเวลา 09:00 ของวันนี้ ให้ข้อทดสอบไม่ขึ้นกับเวลาที่รัน
//   ⚠️ ต้องมี ; ท้ายคำสั่ง — ตัวรันต่อ "commit;" ท้าย ถ้าไม่มี ; คำว่า commit กลายเป็นชื่อคอลัมน์ ธุรกรรมไม่ถูกบันทึก
const สแกน = () => รันSQLในฐาน(`select public.notifications_scan('${วันนี้()} 09:00:00+07');`);
let ก: ใบHQพร้อมใช้;
let รายID = 0;

test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", [ก?.leadNum]);
  await admin.from("appointments").delete().eq("dealer_code", "RYG").eq("id", เลขนัด);
  if (รายID) await admin.from("dealer_prospects").delete().eq("id", รายID);
  await admin.from("notifications").delete().like("body", `%${แท็ก}%`);
});

async function เปิดเรื่อง(page: Page, kind: string, มีคำ: string) {
  await page.getByRole("button", { name: "การแจ้งเตือน" }).first().click();
  const ดูทั้งหมด = page.locator("[data-notif-more]")   /* ปุ่มของแผงกระดิ่ง — แดชบอร์ดมีปุ่ม "ดูทั้งหมด" ของการ์ดด้วย */;
  if (await ดูทั้งหมด.count()) await ดูทั้งหมด.first().click();
  const เรื่อง = page.locator(`[data-notif-kind="${kind}"]`).filter({ hasText: มีคำ }).first();
  await expect(เรื่อง, `กระดิ่งต้องมีเรื่อง ${kind} ของ ${มีคำ}`).toBeVisible({ timeout: 20_000 });
  await เรื่อง.click();
}

test("[รอบ4] ดีลเลอร์: ส่งคำขอเองไม่ได้แจ้ง · HQ ส่งราคา → กระดิ่ง · กดแล้วเปิดแผงลีดนั้น", async ({ page }) => {
  ก = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลีด, province: "ระยอง", lines: [{ name: "โครงเหล็ก", qty: 1, unit: "ชุด", unitCost: 1000 }] });
  const { data } = await admin.from("notifications").select("kind, audience, dealer_code").like("body", `%${ลีด}%`);
  expect(data?.filter(n => n.audience === "dealer" && n.kind === "request_new") ?? [], "ดีลเลอร์ที่ส่งคำขอเองไม่ได้แจ้ง").toEqual([]);
  expect(data?.some(n => n.audience === "hq" && n.kind === "request_new"), "HQ ได้เรื่องคำขอใหม่").toBe(true);
  expect(data?.some(n => n.dealer_code === "RYG" && n.kind === "hq_quote_sent"), "ดีลเลอร์ได้เรื่อง HQ ส่งราคา").toBe(true);
  expect(data?.some(n => n.audience === "hq" && n.kind === "hq_quote_sent"), "HQ ที่ส่งราคาเองไม่ได้แจ้ง").toBe(false);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await เปิดเรื่อง(page, "hq_quote_sent", ลีด);
  await expect(page, "ไปหน้าลีด").toHaveURL(/\/leads/, { timeout: 15_000 });
  await expect(page.locator(".drawer-overlay"), "แผงลีดเปิดเอง").toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: ลีด }).or(page.getByText(ลีด)).first(), "แผงที่เปิดเป็นของลีดนั้น").toBeVisible();
});

test("[รอบ4] ดีลเลอร์: นัดหมายวันนี้ → กระดิ่ง (งานตั้งเวลารัน 2 รอบได้เรื่องเดียว) · กดแล้วเปิดรายละเอียดนัดนั้น", async ({ page }) => {
  const ins = await admin.from("appointments").insert({ id: เลขนัด, dealer_code: "RYG", company: นัด, date: วันนี้(), time: "10:30", type: "follow_up", status: "upcoming", note: "", assigned: "ทดสอบ" });
  expect(ins.error?.message ?? "").toBe("");
  expect(สแกน(), "งานตั้งเวลารันที่ฐานทดสอบ (หาฐานไม่เจอ = null)").not.toBeNull();
  สแกน();
  const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "appointment_due").like("body", `%${นัด}%`);
  expect(count, "รัน 2 รอบได้แจ้งครั้งเดียว").toBe(1);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await เปิดเรื่อง(page, "appointment_due", นัด);
  await expect(page).toHaveURL(/\/calendar/, { timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "รายละเอียดนัดหมาย" }).filter({ hasText: นัด }), "เปิดรายละเอียดนัดนั้นเอง").toBeVisible({ timeout: 20_000 });
});

test("[รอบ4] HQ: ใบค่าแฟรนไชส์เลยวันครบกำหนดชำระ → กระดิ่ง HQ · กดแล้วเปิดใบนั้น (มีช่องวันครบกำหนดชำระ)", async ({ page }) => {
  const hq = await db(ADMIN);
  const r = await hq.from("dealer_prospects").insert({ name: ผู้สนใจ, province: "ระยอง", region: "ตะวันออก", status: "meeting" }).select("id").single();
  expect(r.error?.message ?? "").toBe("");
  รายID = Number(r.data!.id);
  const ใบ = await hq.from("dealer_package_proposals").insert({ prospect_id: รายID, package: "standard", amount: 50000, status: "sent",
    valid_until: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) }).select("id, proposal_no").single();
  expect(ใบ.error?.message ?? "").toBe("");
  const ตอบ = await hq.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", ใบ.data!.id);
  expect(ตอบ.error?.message ?? "").toBe("");
  const เมื่อวาน = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

  // HQ กรอกวันครบกำหนดชำระในใบที่ตอบรับแล้ว (หน้าใบค่าแฟรนไชส์ › แผงของใบ)
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/proposals?open=${ใบ.data!.id}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" });
  await expect(แผง, "?open= เปิดแผงของใบนั้น").toBeVisible({ timeout: 20_000 });
  await แผง.getByLabel("วันครบกำหนดชำระ").fill(เมื่อวาน);
  await expect.poll(async () => (await admin.from("dealer_package_proposals").select("payment_due_on").eq("id", ใบ.data!.id).single()).data?.payment_due_on,
    { timeout: 15_000, message: "วันครบกำหนดชำระถูกบันทึก" }).toBe(เมื่อวาน);
  await page.keyboard.press("Escape");

  สแกน();
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await เปิดเรื่อง(page, "franchise_payment_overdue", ผู้สนใจ);
  await expect(page).toHaveURL(/\/hq\/proposals/, { timeout: 15_000 });
  await expect(page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" }).filter({ hasText: ผู้สนใจ }), "เปิดใบนั้นเอง").toBeVisible({ timeout: 20_000 });
});

// ── คืนตาม FLOW (ใบ 0236 · บอสสั่ง "เอาตาม flow" 21 ต.ค. 69) ──────────────────────────────────────────────────
test("[รอบ4·flow] HQ: ดีลเลอร์ยกเลิกคำขอ → กระดิ่ง HQ มีเหตุผล · กดแล้วเปิดคำขอนั้น (กลุ่ม ปิด/ยกเลิก)", async ({ page }) => {
  const ชื่อ = `ZZTEST-ยกเลิกคำขอ-${แท็ก}`;
  // ต้องยกเลิกก่อน HQ ส่งใบ — ใช้ลีดใหม่ที่ส่งคำขออย่างเดียว
  const sb = await db(RYG);
  const เลข = 970_000_000 + (Date.now() % 9_000_000);
  expect((await sb.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: ชื่อ, name: ชื่อ, contact: "ผู้ทดสอบ",
    phone: `08${String(เลข).slice(-8)}`, province: "ระยอง", status: "BULLET" })).error?.message ?? "").toBe("");
  const ส่ง = await sb.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดังสำเร็จรูป" });
  expect(ส่ง.error?.message ?? "").toBe("");
  const rid = Number((ส่ง.data as { id: number }).id);
  const ยก = await sb.rpc("quote_request_cancel", { p_id: rid, p_reason: `ZZTEST เหตุผลยกเลิก ${แท็ก}`, p_close_lead: false });
  expect(ยก.error?.message ?? "").toBe("");
  try {
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    // โหมด dev คอมไพล์หน้าที่ยังไม่เคยเปิดตอนกดครั้งแรก แล้วสั่งโหลดหน้าปัจจุบันใหม่ (Fast Refresh full reload · trace 17:45)
    //   ไม่เกิดบน production build — เปิดหน้าปลายทางหนึ่งครั้งก่อน ให้ข้อนี้วัดการกดแจ้งเตือนจริง ๆ
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await เปิดเรื่อง(page, "request_cancelled", `ZZTEST เหตุผลยกเลิก ${แท็ก}`);
    await expect(page).toHaveURL(/\/hq\/quote-requests/, { timeout: 15_000 });
    // ช่องเลือกสถานะแทนแถวปุ่มกรอง (27 ต.ค. 69)
    await expect(page.getByLabel("สถานะคำขอ"), "เปิดสถานะ ปิด/ยกเลิก").toHaveValue("closed", { timeout: 20_000 });
    await expect(page.locator('[aria-current="true"]').first(), "เปิดคำขอนั้นตรง ๆ").toHaveAttribute("aria-label", new RegExp(ชื่อ), { timeout: 20_000 });
  } finally {
    ล้างใบHQทดสอบ("RYG", [เลข]);
  }
});

test("[รอบ4·flow] HQ: ผู้สนใจเป็นดีลเลอร์ถึงกำหนดติดตาม → กระดิ่ง · กดแล้วเปิดแผงผู้สนใจนั้น", async ({ page }) => {
  const ชื่อ = `ZZTEST-ผู้สนใจถึงนัด-${แท็ก}`;
  const hq = await db(ADMIN);
  const r = await hq.from("dealer_prospects").insert({ name: ชื่อ, province: "ระยอง", region: "ตะวันออก", status: "meeting",
    follow_up: new Date(Date.now() + 7 * 3_600_000 - 2 * 86_400_000).toISOString().slice(0, 10) }).select("id").single();
  expect(r.error?.message ?? "").toBe("");
  const id = Number(r.data!.id);
  try {
    สแกน(); สแกน();
    const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("kind", "prospect_followup_due").like("body", `%${ชื่อ}%`);
    expect(count, "รัน 2 รอบได้แจ้งครั้งเดียว").toBe(1);
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" });   // คอมไพล์หน้าปลายทางก่อน (โหมด dev · ดูข้อบน)
    await settle(page);
    await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await เปิดเรื่อง(page, "prospect_followup_due", ชื่อ);
    await expect(page).toHaveURL(/\/hq\/prospects/, { timeout: 15_000 });
    await expect(page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" }).filter({ hasText: ชื่อ }), "เปิดแผงผู้สนใจนั้นเอง").toBeVisible({ timeout: 20_000 });
  } finally {
    await admin.from("dealer_prospects").delete().eq("id", id);
  }
});
