import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { adminClient } from "./testDealers";
import { รันSQLในฐาน } from "./localDb";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ถ่ายรูปหน้าจอ "ก่อน/หลัง" ของหน้าที่แก้ในรอบ 2 (บอสสั่ง 19 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง PMS_SHOTS_DIR=<โฟลเดอร์> npm run test:prodbuild -- tests/scenario/zz-shots.spec.ts
//   ทุกหน้าถ่าย 2 ขนาด: จอกว้าง 1440×900 + มือถือ 390×844 · ชื่อไฟล์ = <ช่วง>-<ก่อน|หลัง>-<หน้า>-<จอ>.png
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังของรอบ 2 — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const ช่วง = process.env.PMS_SHOTS_PHASE ?? "ก";
const รอบ = process.env.PMS_SHOTS ?? "ก่อน";
const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/round2";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const แท็ก = `${Date.now() % 100000}`;
const บริษัท = `ZZTEST-ภาพก่อนหลัง-${แท็ก}`;
let ใบ: ใบHQพร้อมใช้;

async function ถ่าย(page: Page, ชื่อ: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(โฟลเดอร์, `${ช่วง}-${รอบ}-${ชื่อ}-${j.ชื่อ}.png`), fullPage: true });
  }
}

test.beforeAll(async () => {
  if (ช่วง !== "ก") return;
  // งานที่ลูกค้าตอบรับแล้ว ผ่านใบ HQ (ใบเก่าในข้อมูลตั้งต้นไม่มีใบ HQ จึงไม่มีปุ่มลบ/แก้อยู่แล้ว)
  ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: บริษัท, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 100000 }] });
  const q = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: บริษัท, markupPercent: 20 });
  const sb = await db(RYG);
  const r = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", q.id);
  if (r.error) throw new Error(`ส่งใบไม่สำเร็จ: ${r.error.message}`);
});
test.afterAll(async () => {
  if (!ใบ) return;
  const admin = adminClient();
  const { data: cs } = await admin.from("customers").select("id").eq("dealer_code", "RYG").eq("company", บริษัท);
  ล้างใบHQทดสอบ("RYG", [ใบ.leadNum]);
  for (const c of cs ?? []) await admin.from("customers").delete().eq("dealer_code", "RYG").eq("id", c.id);
});

test("ช่วง ก · หน้าตั้งรหัสผ่านใหม่ (ดีลเลอร์ + HQ) ไม่ได้เข้าระบบ", async ({ page }) => {
  test.skip(ช่วง !== "ก", "ไม่ใช่ช่วง ก");
  await ถ่าย(page, "ดีลเลอร์-reset-password", async () => { await page.goto(`${DEALER_ORIGIN}/reset-password`); await page.waitForTimeout(5500); });
  await ถ่าย(page, "HQ-reset-password", async () => { await page.goto(`${HQ_ORIGIN}/reset-password`); await page.waitForTimeout(5500); });
});

test("ช่วง ก · ดีลเลอร์: แผงลีดที่ปิดการขายแล้ว (งาน + ใบเสนอราคา) · ใบเสนอราคา · ลูกค้า", async ({ page }) => {
  test.skip(ช่วง !== "ก", "ไม่ใช่ช่วง ก");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  // ปิดการขายผ่านหน้าจอจริง (แผงลีด › งาน › ได้งาน) — ปุ่ม "เปิดใหม่" เห็นได้ในแผงเดิมหลังปิดเท่านั้น
  //   (ลีดที่ปิดแล้ว เปิดจากลิงก์จะถูกพาไปหน้าลูกค้า)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท);
  await page.locator("tbody tr").filter({ hasText: บริษัท }).first().locator("td").first().click();
  await page.getByRole("button", { name: "งาน", exact: true }).first().click();
  await page.getByRole("button", { name: /ได้งาน/ }).first().click();
  await กดตกลงในกล่องยืนยัน(page).catch(() => "");
  await settle(page);
  const ไม่ต้องทำ = async () => { await settle(page); };
  await ถ่าย(page, "ดีลเลอร์-แผงลีดปิดแล้ว-งาน", ไม่ต้องทำ);
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await ถ่าย(page, "ดีลเลอร์-แผงลีดปิดแล้ว-ใบเสนอราคา", ไม่ต้องทำ);
  await ถ่าย(page, "ดีลเลอร์-ใบเสนอราคา-รายการ", async () => {
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(บริษัท).catch(() => {}); await settle(page);
  });
  const { data: q } = await (await db(RYG)).from("quotations").select("id").eq("dealer_code", "RYG").eq("deal_id", ใบ.leadNum).limit(1).single();
  await ถ่าย(page, "ดีลเลอร์-ใบเสนอราคา-ใบที่ตอบรับแล้ว", async () => {
    await page.goto(`${DEALER_ORIGIN}/quotations?open=${encodeURIComponent(String(q?.id ?? ""))}`, { waitUntil: "domcontentloaded" }); await settle(page);
  });
  await ถ่าย(page, "ดีลเลอร์-ลูกค้า-รายการ", async () => { await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" }); await settle(page); });
  await ถ่าย(page, "ดีลเลอร์-ลูกค้าเป้าหมาย-รายการ", async () => { await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page); });
});

test("ช่วง ก · HQ: ใบเสนอราคาทั้งเครือ (ใบที่ตอบรับแล้ว)", async ({ page }) => {
  test.skip(ช่วง !== "ก", "ไม่ใช่ช่วง ก");
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await ถ่าย(page, "HQ-ใบเสนอราคาทั้งเครือ", async () => { await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" }); await settle(page); });
});

// ── ช่วง ก2: ได้ราคา HQ · แผงลีดไม่มีของซ้ำ · กระดิ่งราคาหมดอายุ ──
test.describe("ช่วง ก2", () => {
  const ได้ราคา = `ZZTEST-ภาพก2-ได้ราคา-${แท็ก}`, หมด = `ZZTEST-ภาพก2-หมดอายุ-${แท็ก}`;
  let ก: ใบHQพร้อมใช้, ข: ใบHQพร้อมใช้;
  test.beforeAll(async () => {
    if (ช่วง !== "ก2") return;
    ก = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ได้ราคา, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 50000 }] });
    ข = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: หมด, province: "ระยอง", lines: [{ name: "หลังคาชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 50000 }] });
    รันSQLในฐาน(`alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
      update public.hq_quotes set valid_until = (now() at time zone 'Asia/Bangkok')::date - 1 where id = ${ข.hqQuoteId};
      alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
      select public.expire_hq_linked_quotations();`);
  });
  test.afterAll(async () => { if (ก) ล้างใบHQทดสอบ("RYG", [ก.leadNum, ข.leadNum]); });

  test("ช่วง ก2 · ลีด · แผง · แดชบอร์ด · กระดิ่ง", async ({ page }) => {
    test.skip(ช่วง !== "ก2", "ไม่ใช่ช่วง ก2");
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    const ไปหน้าลีด = async () => {
      await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
      await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill("ZZTEST-ภาพก2");
    };
    await ถ่าย(page, "ดีลเลอร์-ลีด-ป้ายได้ราคาHQ", ไปหน้าลีด);
    await ไปหน้าลีด();
    await page.locator("tbody tr").filter({ hasText: ได้ราคา }).first().locator("td").first().click();
    const ไม่ต้องทำ = async () => { await settle(page); };
    await ถ่าย(page, "ดีลเลอร์-แผงลีด-ภาพรวม", ไม่ต้องทำ);
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    await ถ่าย(page, "ดีลเลอร์-แผงลีด-ใบเสนอราคา", ไม่ต้องทำ);
    await page.getByRole("button", { name: "งาน", exact: true }).first().click();
    await ถ่าย(page, "ดีลเลอร์-แผงลีด-งาน", ไม่ต้องทำ);
    await ถ่าย(page, "ดีลเลอร์-แดชบอร์ด", async () => { await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" }); await settle(page); });
    await ถ่าย(page, "ดีลเลอร์-กระดิ่งราคาหมดอายุ", async () => {
      await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
    });
  });
});
