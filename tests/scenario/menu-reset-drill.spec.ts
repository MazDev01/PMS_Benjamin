import { test, expect } from "@playwright/test";
import { open, settle, เลือกตัวกรอง } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ─── กดเมนูของหน้าที่อยู่ = กลับค่าตั้งต้นของหน้า (บอสสั่ง 19 พ.ย. 69) ───
//   เจาะลง ทั้งเครือ › ภาค › จังหวัด › ดีลเลอร์ แล้วกดเมนู "ภาพรวมยอดขาย" ที่แถบซ้าย → กลับ "ทั้งเครือ" (ตัวเลือกภาค/จังหวัด/ดีลเลอร์ล้าง)
//   ช่วงเวลาด้านบนคงเดิม · ปุ่มย้อนกลับของเบราว์เซอร์ยังถอยระดับได้ (กลับไประดับจังหวัด)
//   ตัวกลางเดียวที่เชลล์ (AppShell + Sidebar) → ทุกหน้า HQ/ดีลเลอร์ · ข้อนี้ตรวจภาพรวมยอดขาย + หน้าเจาะลึกตัวกลาง (ลูกค้าเป้าหมายทั้งเครือ)
//   ตกบนโค้ดเดิม (3530fc90): กดเมนูหน้าเดิมแล้วระดับค้างที่ดีลเลอร์
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ");
test.describe.configure({ mode: "serial" });
let สาขา: สาขาของข้อ;
test.beforeAll(async () => { สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" }); });
test.afterAll(async () => { await สาขา.ลบ(); });

test("[H·hq] ภาพรวมยอดขาย: เจาะ 3 ระดับ → กดเมนูภาพรวมยอดขาย → กลับทั้งเครือ · ช่วงเวลาคงเดิม · ย้อนกลับยังถอยระดับได้", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "hq", "/hq/pipeline");
  await settle(page);
  const ระดับ = page.locator("[data-crumbs] [data-crumb]");
  await expect(ระดับ, "เริ่มที่ทั้งเครือ").toHaveCount(1, { timeout: 30_000 });
  const ช่วง = page.locator("[data-time-range]").first();
  const ช่วงก่อน = [await ช่วง.getAttribute("data-start"), await ช่วง.getAttribute("data-end")];

  await เลือกตัวกรอง(page, "ทุกภูมิภาค", { ค่า: "ตะวันออก" });
  await expect(page.locator('[data-crumbs] [data-crumb="region"]')).toBeVisible();
  await เลือกตัวกรอง(page, "ทุกจังหวัด", { ค่า: "ตราด" });
  await expect(page.locator('[data-crumbs] [data-crumb="prov"]')).toBeVisible();
  await เลือกตัวกรอง(page, "ทุกดีลเลอร์", { ค่า: สาขา.รหัส });
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), "เจาะถึงดีลเลอร์").toHaveText(สาขา.ชื่อ);

  await page.locator('nav[aria-label="เมนูหลัก"] a[data-nav-href="/hq/pipeline"]').click();
  await expect(ระดับ, "กดเมนูหน้าที่อยู่ = กลับทั้งเครือ").toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('[data-crumbs] [data-crumb="all"]')).toBeVisible();
  await expect(page.getByRole("table", { name: "ตารางผลงานดีลเลอร์", exact: true }), "ตารางรายดีลเลอร์ทั้งเครือ").toBeVisible({ timeout: 30_000 });
  expect(page.url(), "ที่อยู่ไม่มีคำค้นค้าง").not.toContain("?");
  const ช่วงหลัง = [await ช่วง.getAttribute("data-start"), await ช่วง.getAttribute("data-end")];
  expect(ช่วงหลัง, "ช่วงเวลาด้านบนคงเดิม").toEqual(ช่วงก่อน);

  await page.goBack();
  await expect(page.locator('[data-crumbs] [data-crumb="prov"]'), "ย้อนกลับ = ถอยไประดับจังหวัด").toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]')).toHaveCount(0);
});

test("[H·hq] ลูกค้าเป้าหมายทั้งเครือ: เลือกดีลเลอร์ → กดเมนูหน้าเดิม → กลับทั้งเครือ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "hq", "/hq/leads");
  await settle(page);
  const ระดับ = page.locator("[data-crumbs] [data-crumb]");
  await expect(ระดับ, "เริ่มที่ทั้งเครือ").toHaveCount(1, { timeout: 30_000 });
  await เลือกตัวกรอง(page, "ดีลเลอร์", { ค่า: สาขา.รหัส }, page.locator("[data-drill-scope]"));
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), "เจาะถึงดีลเลอร์").toHaveText(สาขา.ชื่อ);
  await page.locator('nav[aria-label="เมนูหลัก"] a[data-nav-href="/hq/leads"]').click();
  await expect(ระดับ, "กดเมนูหน้าที่อยู่ = กลับทั้งเครือ").toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]')).toHaveCount(0);
});
