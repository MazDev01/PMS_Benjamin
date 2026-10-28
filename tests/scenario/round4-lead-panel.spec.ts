import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { adminClient } from "./testDealers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── รอบ 4 · แผงลีดดีลเลอร์: สถานะที่เดียว · เปลี่ยนสถานะทางเดียว · ปุ่มลบไม่ขึ้นเมื่อมีคำขอ (บอสสั่ง 21 ต.ค. 69) ───────────
//   1 แถบ 5 ขั้นไฮไลต์ขั้นที่อยู่ตอนนี้ · ปิดไม่สำเร็จติ๊กเฉพาะขั้นที่ทำจริง
//   2 ป้ายในตาราง/การ์ดบนบอร์ดดูอย่างเดียว · 3 กล่องขั้นต่อไปทำงานในแผง + ปิดไม่สำเร็จที่เดียว
//   4 แท็บเหลือ 3 · 5 ปิดสำเร็จทางเดียว = ลูกค้าตอบรับที่ใบในแผง · ข้อตัดสิน 8: ลีดมีคำขอ = ไม่มีปุ่มลบ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const แท็ก = `${Date.now() % 100000}`;
const ชื่อ = (s: string) => `ZZTEST-R4P-${s}-${แท็ก}`;
const ลีด: number[] = [];
const เส้น = [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 100000 }];

async function ลีดเปล่า(status: "WAITING" | "BULLET", company: string): Promise<number> {
  const sb = await db(RYG);
  const n = เลขลูกค้าเป้าหมายทดสอบ();
  const r = await sb.from("leads").insert({ id: `#L-${n}`, num_id: n, dealer_code: "RYG", company, name: company,
    contact: "ผู้ทดสอบ", phone: `08${String(n).slice(-8)}`, province: "ระยอง", product: "โกดังสำเร็จรูป", status });
  if (r.error) throw new Error(r.error.message);
  ลีด.push(n);
  return n;
}
async function ขอราคา(n: number): Promise<number> {
  const sb = await db(RYG);
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: n, p_product: "โกดังสำเร็จรูป" });
  if (r.error) throw new Error(r.error.message);
  return Number((r.data as { id: number }).id);
}
async function สถานะลีด(n: number) {
  return (await adminClient().from("leads").select("status, lost_reason").eq("dealer_code", "RYG").eq("num_id", n).single()).data!;
}
async function เปิดลีด(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  // ข้อในไฟล์นี้เปิดลีดที่ปิดแล้วด้วย — ตัวกรองขั้นตอนค่าเริ่มต้นซ่อนลีดปิดแล้ว (บอสสั่ง 28 ต.ค. 69) จึงเลือก "ทั้งหมด"
  await page.getByLabel("ขั้นตอน", { exact: true }).selectOption({ label: "ทั้งหมด" });
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  await page.locator("tbody tr").filter({ hasText: company }).first().locator("td").first().click();
  await expect(page.locator("[data-panel='next-step']:not([aria-busy])")).toBeVisible({ timeout: 20_000 });
}
const สภาพแถบ = (page: Page) => page.locator("ol[aria-label='ขั้นตอนการขาย'] > li").evaluateAll(els => els.map(e => e.getAttribute("data-step-state")));
const กล่อง = (page: Page) => page.getByRole("status", { name: "ขั้นต่อไป" });

test.afterAll(() => { if (ลีด.length) ล้างใบHQทดสอบ("RYG", ลีด); });

test("ข้อ 1 · ปิดไม่สำเร็จหลังยกเลิกคำขอ → ติ๊กเฉพาะขั้น 1–2 (เดิมติ๊ก 1–4) · ข้อ 8 · มีคำขอแล้วไม่มีปุ่มลบ", async ({ page }) => {
  const company = ชื่อ("ปิดหลังขอ");
  const n = await ลีดเปล่า("BULLET", company);
  const rid = await ขอราคา(n);
  const c = await (await db(RYG)).rpc("quote_request_cancel", { p_id: rid, p_reason: "ลูกค้าเลื่อน", p_close_lead: true });
  expect(c.error).toBeNull();
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดลีด(page, company);
  await expect.poll(() => สภาพแถบ(page)).toEqual(["ผ่าน", "ผ่าน", "ไม่ได้ทำ", "ไม่ได้ทำ", "ไม่ได้ทำ"]);
  await expect(page.getByRole("button", { name: "ลบ", exact: true })).toHaveCount(0);
  // ไม่มีปุ่มปิดไม่สำเร็จ/ปุ่มหลัก บนลีดที่ปิดแล้ว
  await expect(กล่อง(page).getByRole("button")).toHaveCount(0);
});

test("ข้อ 1 · รอราคา HQ = ไฮไลต์ขั้น 2 (ขั้นที่อยู่ตอนนี้) · ข้อ 4 แท็บเหลือ 3 · ข้อ 8 ลีดเปล่ามีปุ่มลบ ลีดมีคำขอไม่มี", async ({ page }) => {
  const เปล่า = ชื่อ("ลีดเปล่า"); await ลีดเปล่า("WAITING", เปล่า);
  const รอ = ชื่อ("รอราคา"); const n = await ลีดเปล่า("BULLET", รอ); await ขอราคา(n);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดลีด(page, เปล่า);
  await expect.poll(() => สภาพแถบ(page)).toEqual(["ตอนนี้", "ยังไม่ถึง", "ยังไม่ถึง", "ยังไม่ถึง", "ยังไม่ถึง"]);
  await expect(page.getByRole("button", { name: "ลบ", exact: true })).toHaveCount(1);
  const แท็บ = await page.locator("button").filter({ hasText: /^(ภาพรวม|งาน|ใบเสนอราคา|ไทม์ไลน์|ประวัติ)$/ }).allInnerTexts();
  expect(แท็บ.map(t => t.trim())).toEqual(["ภาพรวม", "ใบเสนอราคา", "ประวัติ"]);
  await page.keyboard.press("Escape");
  await เปิดลีด(page, รอ);
  await expect.poll(() => สภาพแถบ(page)).toEqual(["ผ่าน", "ตอนนี้", "ยังไม่ถึง", "ยังไม่ถึง", "ยังไม่ถึง"]);
  await expect(page.locator("ol[aria-label='ขั้นตอนการขาย'] > li[aria-current='step']")).toContainText("ขอราคา HQ");
  await expect(page.getByRole("button", { name: "ลบ", exact: true })).toHaveCount(0);
});

test("ข้อ 2 · ป้ายสถานะในตารางกดแล้วไม่มีเมนูเลือกขั้น · การ์ดบนบอร์ดลากไม่ได้ · ลีดที่ยังไม่มีคำขอมีปุ่มลบในแถว", async ({ page }) => {
  const company = ชื่อ("ตาราง"); await ลีดเปล่า("WAITING", company);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const แถว = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(แถว).toBeVisible();
  // ตารางตามรูป (บอสสั่ง 28 ต.ค. 69): ลีดที่ยังไม่มีคำขอ/ใบ มีปุ่มลบในแถว (ลีดที่มีคำขอไม่มี — lead-quote-tables.spec.ts)
  await expect(แถว.getByTitle("ลบลูกค้าเป้าหมาย")).toHaveCount(1);
  await expect(แถว.locator("button.badge")).toHaveCount(0);
  await แถว.locator(".badge").first().click();
  await expect(page.locator("[data-menu='stage']")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /บอร์ด/ }).first().click();
  const การ์ด = page.locator(".card").filter({ hasText: company }).first();
  await expect(การ์ด).toBeVisible();
  expect(await การ์ด.getAttribute("draggable")).toBeNull();
});

test("[D8y] ข้อ 3 · ปิดไม่สำเร็จที่กล่อง (ขั้น 1) → ลีดปิดพร้อมเหตุผล · ขั้น 2 = ยกเลิกคำขอให้ด้วย", async ({ page }) => {
  const ก = ชื่อ("ปิดขั้น1"); const n1 = await ลีดเปล่า("WAITING", ก);
  const ข = ชื่อ("ปิดขั้น2"); const n2 = await ลีดเปล่า("BULLET", ข); const rid = await ขอราคา(n2);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  for (const [company, n] of [[ก, n1], [ข, n2]] as const) {
    await เปิดลีด(page, company);
    await กล่อง(page).getByRole("button", { name: /ปิดไม่สำเร็จ/ }).click();
    const ตัวเลือก = page.locator("[data-lost-picker]");
    await ตัวเลือก.locator("button").first().click();
    await page.locator("[data-reason-dialog]").getByRole("button", { name: "ยืนยันปิดการขาย" }).click();   // กล่องเหตุผลกลาง (28 ต.ค. 69)
    await expect.poll(async () => (await สถานะลีด(n)).status, { timeout: 20_000 }).toBe("CANCELLED");
    expect((await สถานะลีด(n)).lost_reason).toBeTruthy();
    await page.keyboard.press("Escape");
  }
  const req = (await adminClient().from("quote_requests").select("status").eq("id", rid).single()).data!;
  expect(req.status).toBe("cancelled");
});

test("ข้อ 3 · ส่งใบให้ลูกค้าจากกล่อง (ไม่พาไปหน้าอื่น) · ข้อ 5 · ขั้น 5 ไม่มีปุ่มปิดไม่สำเร็จ · ลูกค้าตอบรับที่ใบในแผง = ปิดสำเร็จ", async ({ page }) => {
  const company = ชื่อ("ขั้น4");
  const ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company, province: "ระยอง", lines: เส้น });
  ลีด.push(ใบ.leadNum);
  const q = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: company, markupPercent: 20 });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดลีด(page, company);
  await expect.poll(() => สภาพแถบ(page)).toEqual(["ผ่าน", "ผ่าน", "ผ่าน", "ตอนนี้", "ยังไม่ถึง"]);
  await กล่อง(page).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await สถานะลีด(ใบ.leadNum)).status, { timeout: 20_000 }).toBe("QUOTED");
  expect(new URL(page.url()).pathname).toBe("/leads");
  await expect.poll(() => สภาพแถบ(page), { timeout: 20_000 }).toEqual(["ผ่าน", "ผ่าน", "ผ่าน", "ผ่าน", "ตอนนี้"]);
  await expect(กล่อง(page).getByRole("button", { name: /ปิดไม่สำเร็จ/ })).toHaveCount(0);
  await กล่อง(page).getByRole("button", { name: /บันทึกผลจากลูกค้า/ }).click();
  expect(new URL(page.url()).pathname).toBe("/leads");
  await page.locator("[data-customer-result]").getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await สถานะลีด(ใบ.leadNum)).status, { timeout: 30_000 }).toBe("PAID");
  const qq = (await adminClient().from("quotations").select("status").eq("dealer_code", "RYG").eq("id", q.id).single()).data!;
  expect(qq.status).toBe("won");
  const { data: cs } = await adminClient().from("customers").select("id").eq("dealer_code", "RYG").eq("company", company);
  for (const c of cs ?? []) await adminClient().from("customers").delete().eq("dealer_code", "RYG").eq("id", c.id);
});
