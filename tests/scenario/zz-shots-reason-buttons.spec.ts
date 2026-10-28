import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, db, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ถ่ายรูปก่อน/หลัง กล่องเหตุผล + ปุ่มรอฐาน (บอสสั่ง 28 ต.ค. 69 · กด "ยกเลิกคำขอ" แล้วดูเหมือนไม่เกิดอะไร) — ไม่ใช่ข้อทดสอบ ─────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-reason-buttons.spec.ts
//   รูปลง C:/.claude/pms-shots/reason-buttons/ (PMS_SHOTS_DIR เปลี่ยนได้) · จอกว้าง + มือถือ
//   ฉาก "รอฐาน" = คำสั่งเขียนค้างไว้ไม่ตอบ (ไม่ถึงฐานจริง) แล้วถ่ายจังหวะที่ผู้ใช้กดยืนยันไปแล้ว
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังกล่องเหตุผล — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(600_000);

const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/reason-buttons";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
const บริษัท = `ZZTEST-ถ่ายรูปกล่องเหตุผล-${Date.now() % 100_000}`;

// คำสั่งเขียนที่ค้างไว้ — ต้องตัดทิ้ง (abort) ก่อนปลดตัวดัก ไม่งั้นคำสั่งหลุดไปถึงฐาน (ยกเลิกคำขอจริง)
const ค้างไว้: { abort: () => Promise<void> }[] = [];
async function ปล่อยตัวดัก(page: Page) {
  for (const r of ค้างไว้.splice(0)) await r.abort().catch(() => {});
  await page.unrouteAll({ behavior: "ignoreErrors" });
}

async function ถ่าย(page: Page, ฉาก: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await ปล่อยตัวดัก(page);
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(โฟลเดอร์, `เหตุผล-${process.env.PMS_SHOTS}-${ฉาก}-${j.ชื่อ}.png`), fullPage: false });
  }
  await ปล่อยตัวดัก(page);
}

async function เปิดแท็บใบเสนอราคา(page: Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first().fill(บริษัท);
  await page.locator("tbody tr").filter({ hasText: บริษัท }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "ยกเลิกคำขอ", exact: true })).toBeVisible({ timeout: 30_000 });
}

test.beforeAll(async () => {
  const r = await adminClient().from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: บริษัท, name: บริษัท,
    contact: "ผู้ทดสอบ", phone: `08${String(เลข).slice(-8)}`, province: "ระยอง", status: "BULLET", assigned: "ทดสอบระบบ" });
  expect(r.error).toBeNull();
  const ส่ง = await (await db(RYG)).rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดังทดสอบถ่ายรูป" });
  expect(ส่ง.error).toBeNull();
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", [เลข]); });

test("ถ่ายรูป: ยกเลิกคำขอ (เหตุผลว่าง · รอฐาน) · ปิดไม่สำเร็จ", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  await ถ่าย(page, "ยกเลิกคำขอ-เหตุผลว่าง", async () => {
    await เปิดแท็บใบเสนอราคา(page);
    await page.getByRole("button", { name: "ยกเลิกคำขอ", exact: true }).click();
  });

  await ถ่าย(page, "ยกเลิกคำขอ-กดแล้วรอฐาน", async () => {
    await เปิดแท็บใบเสนอราคา(page);
    // คำสั่งเขียนค้างไว้ไม่ตอบ = จังหวะ "ฐานยังไม่ตอบ" (ไม่ถึงฐานจริง · เปลี่ยนจอรอบถัดไปคำสั่งค้างถูกทิ้ง)
    await page.route("**/api/v1/**", route => { if (route.request().method() === "GET") void route.continue(); else ค้างไว้.push(route); });
    await page.getByRole("button", { name: "ยกเลิกคำขอ", exact: true }).click();
    await page.getByLabel("เหตุผลที่ยกเลิก").fill("ลูกค้าขอเลื่อนโครงการ (ทดสอบถ่ายรูป)");
    await page.getByRole("button", { name: "ยืนยันยกเลิก" }).click();
  });

  await ถ่าย(page, "ปิดไม่สำเร็จ", async () => {
    await เปิดแท็บใบเสนอราคา(page);
    await page.getByRole("button", { name: "ปิดไม่สำเร็จ" }).first().click();
  });
});
