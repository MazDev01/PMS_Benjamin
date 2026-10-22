import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";

// ── ถ่ายรูป "หลัง" ของงานแดชบอร์ด HQ (บอสสั่ง 21 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────────────────────────────────────
//   รูป "ก่อน" = รอบ4-ก่อน-HQ-แดชบอร์ด/ผู้สนใจ/ใบค่าแฟรนไชส์ (ถ่ายจากแบบที่อยู่บนเว็บจริง af19ee1)
//   รันเองเท่านั้น: PMS_SHOTS=หลัง PMS_HQ_ORIGIN=... npx playwright test -c tests/scenario/shots.config.ts tests/scenario/zz-shots-dash.spec.ts
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปงานแดชบอร์ด — รันเองเมื่อสั่ง PMS_SHOTS=หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(600_000);

const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/dashboard-21oct";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const ว่าง = "ZZDS";

async function ถ่าย(page: Page, ฉาก: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await settle(page).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(โฟลเดอร์, `แดชบอร์ด-หลัง-${ฉาก}-${j.ชื่อ}.png`), fullPage: true });
  }
}
const ไป = (page: Page, p: string) => async () => { await page.goto(`${HQ_ORIGIN}${p}`, { waitUntil: "domcontentloaded" }); await settle(page); };

test.beforeAll(() => {
  รันSQLในฐาน(`set local session_replication_role = replica; delete from public.dealers where code = '${ว่าง}';
    insert into public.dealers (code, name, status, province, region) values ('${ว่าง}', 'ZZTEST สาขาว่าง (ถ่ายรูป)', 'active', 'ระยอง', 'ตะวันออก');`);
});
test.afterAll(() => { รันSQLในฐาน(`set local session_replication_role = replica; delete from public.dealers where code = '${ว่าง}';`); });

test("ถ่ายรูปหลัง: แดชบอร์ด HQ · ผู้สนใจ · ใบค่าแฟรนไชส์ค้างชำระ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  const รอแดชบอร์ด = async () => { await expect(page.locator("[data-kpi='sales'] [data-value]")).not.toHaveAttribute("data-value", "", { timeout: 30_000 }); };
  await ถ่าย(page, "HQ-ทั้งเครือ-ปีนี้", async () => { await ไป(page, "/hq/dashboard")(); await รอแดชบอร์ด(); });
  await ถ่าย(page, "HQ-ดีลเลอร์ไม่มีข้อมูล", async () => {
    await ไป(page, "/hq/dashboard")(); await รอแดชบอร์ด();
    await page.getByRole("button", { name: /ทุกดีลเลอร์ \(ทั้งเครือ\)/ }).first().click();
    await page.getByRole("button", { name: new RegExp(`^${ว่าง} – `) }).click();
    await expect(page.locator("[data-card='top']")).toContainText("ยังไม่มียอดขายในช่วงนี้", { timeout: 30_000 });
  });
  await ถ่าย(page, "HQ-ผู้สนใจ", async () => { await ไป(page, "/hq/prospects")(); await page.getByTestId("prospect-overview").waitFor({ timeout: 30_000 }); });
  await ถ่าย(page, "HQ-ใบค่าแฟรนไชส์-ค้างชำระ", async () => { await ไป(page, "/hq/proposals?overdue=1")(); await page.getByTestId("filter-overdue").waitFor({ timeout: 30_000 }); });
});
