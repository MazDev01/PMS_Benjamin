import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { adminClient } from "./testDealers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ถ่ายรูปก่อน/หลัง งานชุดช่องมาตรฐาน (บอสสั่ง 26 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────────────────────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-field-set.spec.ts
//   รูปลง C:/.claude/pms-shots/field-set/ (PMS_SHOTS_DIR เปลี่ยนได้) · จอกว้าง + มือถือ
//   ฉาก: ฟอร์มเพิ่มลีด · แผงลีด · ฟอร์มขอราคา · ข้อมูลลูกค้า · สร้างงานใหม่ให้ลูกค้าเดิม · หัวใบ HQ
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังงานชุดช่องมาตรฐาน — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(600_000);

const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/field-set";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const แท็ก = Date.now() % 100_000;
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
const บริษัทลีด = `ZZTEST-ชุดช่อง-ลีด-${แท็ก}`;
const บริษัทลูกค้า = `ZZTEST-ชุดช่อง-ลูกค้า-${แท็ก}`;
const admin = adminClient();

async function ถ่าย(page: Page, ฉาก: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await settle(page).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(โฟลเดอร์, `ชุดช่อง-${process.env.PMS_SHOTS}-${ฉาก}-${j.ชื่อ}.png`), fullPage: true });
  }
}
async function เปิดลีด(page: Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัทลีด);
  const row = page.locator("tbody tr").filter({ hasText: บริษัทลีด }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
}
async function เปิดลูกค้า(page: Page) {
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(บริษัทลูกค้า);
  await page.getByText(บริษัทลูกค้า).first().click({ timeout: 25_000 });
}

test.beforeAll(async () => {
  const sb = await db(RYG);
  const l = await sb.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: บริษัทลีด, name: บริษัทลีด,
    contact: "คุณทดสอบ ชุดช่อง", phone: `08${String(เลข).slice(-8)}`, email: "zz-fieldset@example.test", address: "99 ถ.ทดสอบ อ.เมือง",
    province: "ระยอง", status: "BULLET", project: "โกดังเก็บสินค้า 20x40 ม.", area: 800, note: "หลังคาเมทัลชีท สูง 8 ม." });
  expect(l.error).toBeNull();
  const c = await sb.rpc("upsert_customer_for_company", { p_dealer: "RYG", p_payload: { company: บริษัทลูกค้า, name: "คุณลูกค้าเดิม", phone: "000-000-0099",
    email: "zz-fieldset-cust@example.test", address: "1 ถ.ลูกค้าเดิม", province: "ระยอง", status: "active" } });
  expect(c.error).toBeNull();
});
test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", [เลข]);
  await admin.from("leads").delete().eq("dealer_code", "RYG").like("company", `${บริษัทลูกค้า}%`);
  await admin.from("customers").delete().eq("dealer_code", "RYG").eq("company", บริษัทลูกค้า);
});

test("ถ่ายรูป: ชุดช่องข้อมูลลูกค้า/งาน ทุกฟอร์ม", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await ถ่าย(page, "ลีด-ฟอร์มเพิ่ม", async () => {
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
    await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible({ timeout: 15_000 });
  });
  await ถ่าย(page, "ลีด-แผง", async () => { await เปิดลีด(page); });
  await ถ่าย(page, "ลีด-ขอราคา", async () => {
    await เปิดลีด(page);
    await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
    await expect(page.locator("[data-panel='quote-request']").getByLabel("งานที่ขอราคา")).toBeVisible({ timeout: 15_000 });
  });
  await ถ่าย(page, "ลูกค้า-ข้อมูล", async () => { await เปิดลูกค้า(page); });
  await ถ่าย(page, "ลูกค้า-งานใหม่", async () => {
    await เปิดลูกค้า(page);
    await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).first().click();
    await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).last().click();
  });
  // HQ: หัวใบ HQ ของคำขอจากลีดนี้
  const r = await (await db(RYG)).rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดังเก็บสินค้า 20x40 ม.", p_area: 800, p_spec: "หลังคาเมทัลชีท สูง 8 ม.", p_province: "ระยอง" });
  expect(r.error).toBeNull();
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await ถ่าย(page, "HQ-หัวใบ", async () => {
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" }); await settle(page);
    await เปิดใบHQในกล่องงาน(page, บริษัทลีด);
  });
});
