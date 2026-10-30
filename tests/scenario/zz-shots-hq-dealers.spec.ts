import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── ถ่ายรูปหน้าจอ "ก่อน/หลัง" หน้า HQ ดีลเลอร์ (บอสสั่ง 30 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ─────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-hq-dealers.spec.ts
//   ที่เก็บ: C:\.claude\pms-shots\hq-dealers\<รอบ>\
//   ตาราง (จอกว้าง · มือถือ) · /hq/dealers/SKN (ก่อน = หน้ารายละเอียดเต็มจอ · หลัง = รายการ + แผงด้านขวา) · แท็บอื่นของแผง
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังหน้า HQ ดีลเลอร์ — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);

const รอบ = process.env.PMS_SHOTS ?? "ก่อน";

test("[shots] /hq/dealers", async ({ page }) => {
  const ที่เก็บ = path.join("C:/.claude/pms-shots", "hq-dealers", รอบ);
  mkdirSync(ที่เก็บ, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.waitForTimeout(1000);   // รูปเท่านั้น — ไม่ใช่ข้อทดสอบ
  await page.screenshot({ path: path.join(ที่เก็บ, "1-ตาราง-จอกว้าง.png"), fullPage: true });
  await page.goto(`${HQ_ORIGIN}/hq/dealers/SKN`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ที่เก็บ, "2-SKN-ภาพรวม.png"), fullPage: true });
  const แผง = page.locator("[data-dealer-panel]");
  if (await แผง.count()) {
    for (const [แท็บ, ชื่อ] of [["leads", "3-SKN-ลูกค้าเป้าหมาย"], ["quotes", "4-SKN-ใบเสนอราคา"], ["customers", "5-SKN-ลูกค้า"], ["activity", "6-SKN-กิจกรรม"]] as const) {
      await แผง.locator(`[data-panel-tab='${แท็บ}']`).click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(ที่เก็บ, `${ชื่อ}.png`) });
    }
    await page.getByRole("button", { name: "ปิดแผง" }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.screenshot({ path: path.join(ที่เก็บ, "7-ตาราง-มือถือ.png"), fullPage: true });
});
