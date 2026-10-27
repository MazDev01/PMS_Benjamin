import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ถ่ายรูปก่อน/หลัง รายการเตือน 5 ขั้น + หน้า HQ เส้นทางการขาย (บอสสั่ง 27 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-lead-stage.spec.ts
//   รูปลง C:/.claude/pms-shots/lead-stage/ (PMS_SHOTS_DIR เปลี่ยนได้) · จอกว้าง + มือถือ
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังรายการเตือน — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(600_000);

const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/lead-stage";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
const บริษัท = `ZZTEST-ถ่ายรูปรายการเตือน-${Date.now() % 100_000}`;

async function ถ่าย(page: Page, ฉาก: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await settle(page).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(โฟลเดอร์, `ขั้น-${process.env.PMS_SHOTS}-${ฉาก}-${j.ชื่อ}.png`), fullPage: true });
  }
}

test.beforeAll(async () => {
  const r = await adminClient().from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: บริษัท, name: บริษัท,
    contact: "ผู้ทดสอบ", phone: `08${String(เลข).slice(-8)}`, province: "ระยอง", status: "BULLET", assigned: "ทดสอบระบบ",
    tasks: [{ key: "contact", label: "ติดต่อแล้ว", done: true, doneAt: "2026-06-02", doneBy: "ทดสอบระบบ" }] });
  expect(r.error).toBeNull();
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", [เลข]); });

test("ถ่ายรูป: แท็บประวัติ (รายการเตือน) · HQ ตั้งค่า เส้นทางการขาย", async ({ page, browser }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await ถ่าย(page, "รายการเตือน-แผงลีด", async () => {
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first().fill(บริษัท);
    await page.locator("tbody tr").filter({ hasText: บริษัท }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click({ timeout: 20_000 });
    await expect(async () => {
      await page.getByRole("button", { name: "ประวัติ", exact: true }).first().click({ timeout: 5_000 });
      await expect(page.getByText(/รายการเตือน/).first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 40_000 });
    await page.getByText(/รายการเตือน/).first().scrollIntoViewIfNeeded();
  });
  const hq = await (await browser.newContext()).newPage();
  await loginUI(hq, HQ_ORIGIN, "/hq/login", ADMIN);
  await ถ่าย(hq, "HQ-เส้นทางการขาย", async () => {
    await hq.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
    await settle(hq);
    await hq.getByRole("button", { name: "เส้นทางการขาย" }).first().click();
  });
});
