import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";

// ── หน้าต่างแก้ไขข้อมูลดีลเลอร์ (HQ): ช่องที่ฐานเป็นค่าว่าง ต้องไม่ทำให้หน้าเว็บพัง (ทดลองใช้เว็บแทนบอส 21 ต.ค. 69) ──
//   เจอ: สาขาที่ไม่มีภาค (region = null) กด "บันทึกการแก้ไข" → หน้าเว็บพัง "Cannot read properties of null (reading 'trim')"
//   ต้องเป็น: ขึ้นข้อความ "ต้องเลือกภาคก่อน" ให้ผู้ใช้แก้ · ไม่มี error บนหน้า
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
const CODE = "ZZWNR";
const admin = adminClient();
test.beforeAll(async () => {
  await admin.from("dealers").delete().eq("code", CODE);
  const d = await admin.from("dealers").insert({ code: CODE, name: `ZZTEST-ไม่มีภาค-${CODE}`, status: "active", province: "ระยอง", region: null });
  if (d.error) throw new Error(d.error.message);
});
test.afterAll(async () => { await admin.from("dealers").delete().eq("code", CODE); });

test("[hq] แก้ไขดีลเลอร์ที่ไม่มีภาค → บอกให้เลือกภาค ไม่พัง", async ({ page }) => {
  const พัง: string[] = [];
  page.on("pageerror", e => พัง.push(e.message));
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${CODE}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /^แก้ไข/ }).first().click();
  const แผง = page.getByRole("dialog").filter({ hasText: "แก้ไขข้อมูลดีลเลอร์" });
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  await แผง.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(แผง.getByText(/ต้องเลือกภาคก่อน/), "บอกให้เลือกภาค").toBeVisible({ timeout: 10_000 });
  expect(พัง, "ไม่มี error บนหน้า").toEqual([]);
});
