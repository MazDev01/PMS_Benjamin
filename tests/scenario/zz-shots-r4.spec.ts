import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ถ่ายรูปหน้าจอ "ก่อน/หลัง" รอบ 4 (ลดหน้าจอซ้ำ · บอสสั่ง 21 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง PMS_SHOTS_DIR=C:/.claude/pms-shots/round4 npm run test:prodbuild -- tests/scenario/zz-shots-r4.spec.ts
//   (หรือกับเซิร์ฟเวอร์ที่รันอยู่แล้ว: npx playwright test -c tests/scenario/shots.config.ts)
//   ทุกฉากถ่าย 2 ขนาด · ฉากไหนเปิดไม่ได้ (หน้าเปลี่ยนแล้ว) จดชื่อลงไฟล์ ข้ามแล้วถ่ายฉากต่อไป
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังของรอบ 4 — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

const รอบ = process.env.PMS_SHOTS ?? "ก่อน";
const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/round4";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const แท็ก = `${Date.now() % 100000}`;
const ชื่อ = (s: string) => `ZZTEST-รอบ4-${s}-${แท็ก}`;
const ลีด: number[] = [];

async function ถ่าย(page: Page, ฉาก: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    try { await เตรียม(); } catch (e) { console.log(`ข้ามฉาก ${ฉาก} (${j.ชื่อ}): ${String((e as Error).message).split("\n")[0]}`); continue; }
    await settle(page).catch(() => {});
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(โฟลเดอร์, `รอบ4-${รอบ}-${ฉาก}-${j.ชื่อ}.png`), fullPage: true });
  }
}

async function เปิดลีด(page: Page, company: string, แท็บ?: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  await page.locator("tbody tr").filter({ hasText: company }).first().locator("td").first().click({ timeout: 20_000 });
  await page.locator("[data-panel='next-step']:not([aria-busy])").waitFor({ timeout: 20_000 }).catch(() => {});
  if (แท็บ) await page.getByRole("button", { name: แท็บ, exact: true }).first().click({ timeout: 5_000 });
}

test.beforeAll(async () => {
  const sb = await db(RYG);
  // ขั้น 1: ลีดเปล่า (ยังไม่ขอราคา)
  const n1 = เลขลูกค้าเป้าหมายทดสอบ();
  const l1 = await sb.from("leads").insert({ id: `#L-${n1}`, num_id: n1, dealer_code: "RYG", company: ชื่อ("ขั้น1"), name: ชื่อ("ขั้น1"),
    contact: "ผู้ทดสอบ", phone: `08${String(n1).slice(-8)}`, province: "ระยอง", product: "โกดังสำเร็จรูป", status: "WAITING" });
  if (l1.error) throw new Error(l1.error.message);
  ลีด.push(n1);
  // ขั้น 2: ขอราคาแล้ว รอ HQ
  const n2 = เลขลูกค้าเป้าหมายทดสอบ();
  const l2 = await sb.from("leads").insert({ id: `#L-${n2}`, num_id: n2, dealer_code: "RYG", company: ชื่อ("ขั้น2"), name: ชื่อ("ขั้น2"),
    contact: "ผู้ทดสอบ", phone: `08${String(n2).slice(-8)}`, province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET" });
  if (l2.error) throw new Error(l2.error.message);
  ลีด.push(n2);
  const r2 = await sb.rpc("quote_request_submit", { p_lead_num_id: n2, p_product: "โกดังสำเร็จรูป" });
  if (r2.error) throw new Error(r2.error.message);
  // ขั้น 3: ได้ใบ HQ · ขั้น 4: มีใบร่าง · ขั้น 5: ส่งใบแล้ว
  const เส้น = [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 100000 }];
  const u3 = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อ("ขั้น3"), province: "ระยอง", lines: เส้น }); ลีด.push(u3.leadNum);
  const u4 = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อ("ขั้น4"), province: "ระยอง", lines: เส้น }); ลีด.push(u4.leadNum);
  await ทำใบลูกค้าจากใบHQ(RYG, u4, { customer: ชื่อ("ขั้น4"), markupPercent: 20 });
  const u5 = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อ("ขั้น5"), province: "ระยอง", lines: เส้น }); ลีด.push(u5.leadNum);
  const q5 = await ทำใบลูกค้าจากใบHQ(RYG, u5, { customer: ชื่อ("ขั้น5"), markupPercent: 20 });
  const s5 = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", q5.id);
  if (s5.error) throw new Error(s5.error.message);
  // ปิดไม่สำเร็จหลังขอราคา (ยกเลิกคำขอ + ปิดลีด) — แถบเดิมติ๊ก 1–4 หมด
  const n6 = เลขลูกค้าเป้าหมายทดสอบ();
  const l6 = await sb.from("leads").insert({ id: `#L-${n6}`, num_id: n6, dealer_code: "RYG", company: ชื่อ("ปิดไม่สำเร็จ"), name: ชื่อ("ปิดไม่สำเร็จ"),
    contact: "ผู้ทดสอบ", phone: `08${String(n6).slice(-8)}`, province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET" });
  if (l6.error) throw new Error(l6.error.message);
  ลีด.push(n6);
  const r6 = await sb.rpc("quote_request_submit", { p_lead_num_id: n6, p_product: "โกดังสำเร็จรูป" });
  if (r6.error) throw new Error(r6.error.message);
  const c6 = await sb.rpc("quote_request_cancel", { p_id: Number((r6.data as { id: number }).id), p_reason: "ลูกค้าเลื่อนโครงการ", p_close_lead: true });
  if (c6.error) throw new Error(c6.error.message);
});
test.afterAll(async () => { if (ลีด.length) ล้างใบHQทดสอบ("RYG", ลีด); });

test("ดีลเลอร์ — แผงลีดทุกขั้น · ตาราง · บอร์ด · ใบเสนอราคา · ลูกค้า · แดชบอร์ด · ปฏิทิน · ไฟล์", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  for (const ขั้น of ["ขั้น1", "ขั้น2", "ขั้น3", "ขั้น4", "ขั้น5", "ปิดไม่สำเร็จ"]) {
    await ถ่าย(page, `ดีลเลอร์-แผงลีด-${ขั้น}`, () => เปิดลีด(page, ชื่อ(ขั้น)));
  }
  for (const แท็บ of ["งาน", "ใบเสนอราคา", "ไทม์ไลน์", "ประวัติ"]) {
    await ถ่าย(page, `ดีลเลอร์-แผงลีด-ขั้น5-แท็บ${แท็บ}`, () => เปิดลีด(page, ชื่อ("ขั้น5"), แท็บ));
  }
  await ถ่าย(page, "ดีลเลอร์-ลีด-ตาราง", async () => {
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(`ZZTEST-รอบ4`);
  });
  await ถ่าย(page, "ดีลเลอร์-ลีด-บอร์ด", async () => {
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByRole("button", { name: /บอร์ด|Kanban/ }).first().click();
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(`ZZTEST-รอบ4`);
  });
  await ถ่าย(page, "ดีลเลอร์-ใบเสนอราคา-รายการ", async () => {
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
  });
  await ถ่าย(page, "ดีลเลอร์-ใบเสนอราคา-กดแถว", async () => {
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.locator("tbody tr").filter({ hasText: ชื่อ("ขั้น5") }).first().locator("td").nth(1).click({ timeout: 15_000 });
  });
  await ถ่าย(page, "ดีลเลอร์-แผงลูกค้า", async () => {
    await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.locator("tbody tr").first().locator("td").nth(1).click({ timeout: 15_000 });
  });
  for (const [ฉาก, p] of [["แดชบอร์ด", "/dashboard"], ["ปฏิทิน", "/calendar"], ["ไฟล์", "/files"]] as const) {
    await ถ่าย(page, `ดีลเลอร์-${ฉาก}`, async () => { await page.goto(`${DEALER_ORIGIN}${p}`, { waitUntil: "domcontentloaded" }); await settle(page); });
  }
});

test("HQ — แดชบอร์ด · ภาพรวมยอดขาย · ดีลเลอร์ · ผู้สนใจ · ใบค่าแฟรนไชส์", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const ไป = (p: string) => async () => { await page.goto(`${HQ_ORIGIN}${p}`, { waitUntil: "domcontentloaded" }); await settle(page); };
  await ถ่าย(page, "HQ-แดชบอร์ด", ไป("/hq/dashboard"));
  await ถ่าย(page, "HQ-ภาพรวมยอดขาย", ไป("/hq/pipeline"));
  await ถ่าย(page, "HQ-ภาพรวมยอดขาย-กดดีลเลอร์", async () => {
    await ไป("/hq/pipeline")();
    await page.locator("tbody tr").filter({ hasText: "RYG" }).first().locator("td").first().click({ timeout: 15_000 });
  });
  await ถ่าย(page, "HQ-ดีลเลอร์-รายการ", ไป("/hq/dealers"));
  await ถ่าย(page, "HQ-ดีลเลอร์-RYG", ไป("/hq/dealers/RYG"));
  await ถ่าย(page, "HQ-ผู้สนใจ", ไป("/hq/prospects"));
  await ถ่าย(page, "HQ-ใบค่าแฟรนไชส์", ไป("/hq/proposals"));
  await ถ่าย(page, "HQ-ใบค่าแฟรนไชส์-เปิดใบ", async () => {
    await ไป("/hq/proposals")();
    await page.getByRole("button", { name: /^ดู$|ดูใบ|ดูรายละเอียด/ }).first().click({ timeout: 10_000 });
  });
});
