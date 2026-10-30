import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── ถ่ายรูปหน้าจอ "ก่อน/หลัง" หน้า HQ ภาพรวมยอดขาย + ลูกค้าเป้าหมายทั้งเครือ (บอสสั่ง 30 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-hq-pages.spec.ts
//   ที่เก็บ: C:\.claude\pms-shots\hq-pipeline\<รอบ>\ และ C:\.claude\pms-shots\hq-leads\<รอบ>\
//   ทุกหน้าถ่าย: จอกว้างทั้งหน้า · จอกว้างเลื่อนลง (ตัวกรองค้าง) · มือถือทั้งหน้า
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังหน้า HQ — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);

const รอบ = process.env.PMS_SHOTS ?? "ก่อน";
const หน้า = [{ ที่: "/hq/pipeline", โฟลเดอร์: "hq-pipeline" }, { ที่: "/hq/leads", โฟลเดอร์: "hq-leads" }];

async function เลื่อนเนื้อหา(page: Page, y: number) {
  await page.evaluate(ระยะ => {
    const ตัว = Array.from(document.querySelectorAll<HTMLElement>("*")).find(e => {
      const oy = getComputedStyle(e).overflowY; return (oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight + 200;
    });
    (ตัว ?? document.scrollingElement ?? document.documentElement).scrollTop = ระยะ;
  }, y);
}

for (const h of หน้า) {
  test(`[shots] ${h.ที่}`, async ({ page }) => {
    const ที่เก็บ = path.join("C:/.claude/pms-shots", h.โฟลเดอร์, รอบ);
    mkdirSync(ที่เก็บ, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}${h.ที่}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.waitForTimeout(1500);   // รูปเท่านั้น (ให้กราฟวาดเสร็จ) — ไม่ใช่ข้อทดสอบ
    await page.screenshot({ path: path.join(ที่เก็บ, "1-จอกว้าง-ทั้งหน้า.png"), fullPage: true });
    await เลื่อนเนื้อหา(page, 900);
    await page.screenshot({ path: path.join(ที่เก็บ, "2-จอกว้าง-เลื่อนลง-ตัวกรองค้าง.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await เลื่อนเนื้อหา(page, 0);
    await settle(page);
    await page.screenshot({ path: path.join(ที่เก็บ, "3-มือถือ-ทั้งหน้า.png"), fullPage: true });
  });
}
