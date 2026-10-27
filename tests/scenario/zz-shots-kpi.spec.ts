import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── ถ่ายรูปก่อน/หลัง การ์ด KPI 4 ใบทุกหน้า (บอสสั่ง 22 ต.ค. 69 · ใบ 0246) — ไม่ใช่ข้อทดสอบ ──────────────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-kpi.spec.ts
//   รูปลง C:/.claude/pms-shots/kpi-cards/ (PMS_SHOTS_DIR เปลี่ยนได้) · จอกว้าง + มือถือ · ส่วนบนของหน้า (แถวการ์ด)
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังการ์ด KPI — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(900_000);

const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/kpi-cards";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 1400 }];
const หน้าดีลเลอร์ = [["แดชบอร์ด", "/dashboard"], ["ลูกค้าเป้าหมาย", "/leads"], ["ใบเสนอราคา", "/quotations"], ["ลูกค้า", "/customers"], ["ปฏิทิน", "/calendar"]] as const;
const หน้าHQ = [
  ["แดชบอร์ด", "/hq/dashboard"], ["คำขอใบเสนอราคา", "/hq/quote-requests"], ["ผู้สนใจเป็นดีลเลอร์", "/hq/prospects"], ["ใบค่าแฟรนไชส์", "/hq/proposals"],
  ["ดีลเลอร์", "/hq/dealers"], ["ภาพรวมยอดขาย", "/hq/pipeline"], ["ลูกค้าเป้าหมายทั้งเครือ", "/hq/leads"], ["ใบเสนอราคาทั้งเครือ", "/hq/quotations"],
  ["ลูกค้าทั้งเครือ", "/hq/customers"], ["บันทึกการใช้งาน", "/hq/audit"], ["ผู้ใช้งาน", "/hq/settings#users"],
] as const;

async function ถ่าย(page: Page, แอป: string, ชื่อ: string, ไป: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await ไป();
    await settle(page).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(โฟลเดอร์, `kpi-${process.env.PMS_SHOTS}-${แอป}-${ชื่อ}-${j.ชื่อ}.png`) });
  }
}

test("ถ่ายรูป: แถวการ์ด KPI ทุกหน้า (ดีลเลอร์ 5 · HQ 11)", async ({ page, browser }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const [ชื่อ, ที่] of หน้าHQ) {
    await ถ่าย(page, "HQ", ชื่อ, async () => {
      const [p, แท็บ] = ที่.split("#");
      await page.goto(`${HQ_ORIGIN}${p}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      if (แท็บ === "users") await page.getByRole("button", { name: "ผู้ใช้งานและสิทธิ์" }).click().catch(() => {});
    });
  }
  const ดีลเลอร์ = await (await browser.newContext()).newPage();
  await loginUI(ดีลเลอร์, DEALER_ORIGIN, "/login", RYG);
  for (const [ชื่อ, ที่] of หน้าดีลเลอร์) {
    await ถ่าย(ดีลเลอร์, "ดีลเลอร์", ชื่อ, async () => {
      await ดีลเลอร์.goto(`${DEALER_ORIGIN}${ที่}`, { waitUntil: "domcontentloaded" });
      await settle(ดีลเลอร์);
    });
  }
});
