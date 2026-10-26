import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ถ่ายรูปก่อน/หลัง งานแม่แบบวัสดุ (บอสสั่ง 26 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────────────────────────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-material-templates.spec.ts
//   รูปลง C:/.claude/pms-shots/material-templates/ (PMS_SHOTS_DIR เปลี่ยนได้) · จอกว้าง + มือถือ
//   ฉาก: ตั้งค่า HQ (แท็บแม่แบบวัสดุ) · ฟอร์มขอราคาของดีลเลอร์ (D3) · ใบ HQ ของคำขอ (H8)
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังงานแม่แบบวัสดุ — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(600_000);

const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/material-templates";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const แท็ก = Date.now() % 100_000;
const เลข = { ฟอร์ม: เลขลูกค้าเป้าหมายทดสอบ(), ใบ: เลขลูกค้าเป้าหมายทดสอบ() };
const บริษัท = (k: keyof typeof เลข) => `ZZTEST-ถ่ายรูปแม่แบบ-${k}-${แท็ก}`;

async function ถ่าย(page: Page, ฉาก: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await settle(page).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(โฟลเดอร์, `แม่แบบ-${process.env.PMS_SHOTS}-${ฉาก}-${j.ชื่อ}.png`), fullPage: true });
  }
}

test.beforeAll(async () => {
  const sb = await db(RYG);
  for (const k of ["ฟอร์ม", "ใบ"] as const) {
    const l = await sb.from("leads").insert({ id: `#L-${เลข[k]}`, num_id: เลข[k], dealer_code: "RYG", company: บริษัท(k), name: บริษัท(k),
      contact: "ผู้ทดสอบ", phone: `08${String(เลข[k]).slice(-8)}`, province: "ระยอง", status: "BULLET", project: "โกดังเก็บสินค้า 20x40 ม.", area: 800 });
    expect(l.error).toBeNull();
  }
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลข.ใบ, p_product: "โกดังเก็บสินค้า 20x40 ม.", p_area: 800, p_spec: "หลังคาเมทัลชีท ผนังสูง 8 ม.", p_province: "ระยอง" });
  expect(r.error).toBeNull();
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", Object.values(เลข)); });

test("ถ่ายรูป: ตั้งค่า HQ · ฟอร์มขอราคา · ใบ HQ", async ({ page, browser }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await ถ่าย(page, "ตั้งค่า-HQ", async () => {
    await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "แม่แบบวัสดุ" }).click({ timeout: 3_000 }).catch(() => {});   // ก่อนทำยังไม่มีแท็บนี้
  });
  await ถ่าย(page, "ใบHQ-ของคำขอ", async () => {
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await เปิดใบHQในกล่องงาน(page, บริษัท("ใบ"));
  });

  const ดีลเลอร์ = await (await browser.newContext()).newPage();
  await loginUI(ดีลเลอร์, DEALER_ORIGIN, "/login", RYG);
  await ถ่าย(ดีลเลอร์, "ฟอร์มขอราคา-ดีลเลอร์", async () => {
    await ดีลเลอร์.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(ดีลเลอร์);
    await ดีลเลอร์.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await ดีลเลอร์.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท("ฟอร์ม"));
    const row = ดีลเลอร์.locator("tbody tr").filter({ hasText: บริษัท("ฟอร์ม") }).first();
    await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    await ดีลเลอร์.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    await ดีลเลอร์.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
    await ดีลเลอร์.locator("#qr-product").waitFor({ timeout: 15_000 });
  });
});
