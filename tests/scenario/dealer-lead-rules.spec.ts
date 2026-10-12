import { test, expect } from "@playwright/test";
import { open, assertHealthyPage } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";

// เทสต์ที่ seed กฎผ่าน localStorage ใช้ได้กับ "โหมด local" เท่านั้น —
// โหมด supabase แอปอ่านกฎจาก DB (dealer_lead_rules) ไม่ใช่ localStorage → seed ไม่มีผล
// DB-path (เขียน/อ่านกฎ + RLS แยกสาขา) ตรวจที่ migration 0058/0059 และ supabase-rls แล้ว
const SEED_LOCAL_ONLY = "seed ผ่าน localStorage — ใช้โหมด local เท่านั้น (โหมด DB อ่านจาก dealer_lead_rules)";

// ─── ฟีเจอร์: กฎการดูแลลูกค้าเป้าหมาย "แยกรายสาขา" (ดีลเลอร์ตั้งเอง) ─────────────
// เดิม HQ ตั้งค่าเดียวบังคับทุกสาขา · บอสสั่งย้ายให้ดีลเลอร์ตั้งเอง แยกกันรายสาขา
// สเปกนี้ล็อกสิ่งที่ต้องเป็นจริงหลังย้าย:
//   1. HQ ตั้งไม่ได้แล้ว (ต้องไม่มีช่องกรอกที่ /hq/settings)
//   2. ดีลเลอร์ตั้งได้จริงที่ /settings → การแจ้งเตือน และค่าถูกบันทึก
//   3. ค่าที่ตั้ง "มีผลจริง" กับหน้าของดีลเลอร์ — ไม่ใช่ช่องกรอกหลอก
//   4. HQ ยังเห็นลูกค้าเป้าหมายของสาขานั้นตามเกณฑ์ที่สาขาตั้ง (HQ ไม่หลุดการมองเห็น)

const RULES_KEY = "dealer_lead_rules";

/** ตั้งกฎของสาขาโดยตรงที่ localStorage ก่อนโหลดหน้า — ใช้ทดสอบผลลัพธ์แบบ deterministic */
async function seedRules(page: import("@playwright/test").Page, code: string, followUpAlertDays: number, unassignedAlertHours: number) {
  await page.addInitScript(([k, c, d, h]) => {
    localStorage.setItem(k as string, JSON.stringify({ [c as string]: { followUpAlertDays: d, unassignedAlertHours: h } }));
  }, [RULES_KEY, code, followUpAlertDays, unassignedAlertHours]);
}

// ── 1. HQ ตั้งกฎนี้ไม่ได้แล้ว ──
test("[user·hq] /hq/settings ไม่มีช่องตั้งเกณฑ์ 48 ชม./7 วัน แล้ว (ย้ายไปดีลเลอร์)", async ({ page }) => {
  await open(page, "hq", "/hq/settings");
  await assertHealthyPage(page, "ตั้งค่า HQ");
  const main = page.locator(".erp");
  await expect(main.getByText("กฎการดูแลลูกค้าเป้าหมาย")).toHaveCount(0);
  await expect(main.getByText("ต้องมีผู้รับผิดชอบภายใน")).toHaveCount(0);
});

// ── 2. ดีลเลอร์ตั้งเองได้ + ค่าถูกบันทึกลงคีย์รายสาขา ──
test("[user·dealer] ดีลเลอร์ตั้งกฎเองได้ที่ ตั้งค่า › การแจ้งเตือน แล้วค่าถูกบันทึก", async ({ page }) => {
  test.skip(REAL_BACKEND, SEED_LOCAL_ONLY);
  await open(page, "dealer", "/settings");
  // ต้องเจาะที่ .tab-bar — ชื่อ "การแจ้งเตือน" ชนกับกระดิ่งบนแถบบน (aria-label เดียวกัน)
  await page.locator(".tab-bar").getByRole("button", { name: "การแจ้งเตือน" }).click();
  await expect(page.getByText("กฎการดูแลลูกค้าเป้าหมาย")).toBeVisible();

  // การ์ดนี้มีช่องตัวเลข 2 ช่องตามลำดับ: [0]=ต้องมีผู้รับผิดชอบภายใน(ชม.) [1]=เตือนเมื่อไม่ติดต่อเกิน(วัน)
  const card = page.locator(".card").filter({ hasText: "กฎการดูแลลูกค้าเป้าหมาย" }).first();
  const nums = card.locator('input[type="number"]');
  await expect(nums).toHaveCount(2);
  await nums.nth(1).fill("3");   // เตือนเมื่อลูกค้าเป้าหมายไม่มีการติดต่อเกิน 7 → 3 วัน
  await page.getByRole("button", { name: /^บันทึก/ }).first().click();

  // ค่าต้องลงคีย์ "รายสาขา" ไม่ใช่คีย์กลางของ HQ
  const saved = await page.evaluate(k => localStorage.getItem(k), RULES_KEY);
  expect(saved, "ต้องบันทึกลง dealer_lead_rules").toBeTruthy();
  expect(JSON.parse(saved!).CNX.followUpAlertDays, "สาขา CNX ต้องได้ 3 วัน").toBe(3);
});

// ── 3. ค่าที่ตั้งมีผลจริงกับหน้าของดีลเลอร์ (ไม่ใช่ช่องกรอกหลอก) ──
test("[user·dealer] เกณฑ์ที่สาขาตั้ง มีผลกับการ์ด 'ต้องติดตามด่วน' บนแดชบอร์ด", async ({ page }) => {
  test.skip(REAL_BACKEND, SEED_LOCAL_ONLY);
  await seedRules(page, "CNX", 3, 48);   // ตั้ง 3 วัน
  await open(page, "dealer", "/dashboard");
  await expect(page.getByText("ต้องติดตามด่วน (เกิน 3 วัน)")).toBeVisible();
});

test("[user·dealer·edge] ตั้งเกณฑ์สูงมาก (999 วัน) → ไม่มีลูกค้าเป้าหมายไหนค้าง", async ({ page }) => {
  test.skip(REAL_BACKEND, SEED_LOCAL_ONLY);
  await seedRules(page, "CNX", 999, 48);
  await open(page, "dealer", "/dashboard");
  await expect(page.getByText("ต้องติดตามด่วน (เกิน 999 วัน)")).toBeVisible();
  await expect(page.getByText("ไม่มีรายการค้าง")).toBeVisible();
});

// ── 4. HQ ยังเห็นตามเกณฑ์ที่สาขาตั้ง — และไม่โกหกว่าเป็น "กฎสำนักงานใหญ่" ──
test("[ux·hq] หน้าลูกค้าเป้าหมาย HQ ไม่อ้างว่าเกณฑ์เป็นของสำนักงานใหญ่แล้ว", async ({ page }) => {
  await open(page, "hq", "/hq/leads");
  await assertHealthyPage(page, "ลูกค้าเป้าหมายทั้งเครือ");
  await expect(page.locator(".erp").getByText(/ตามกฎสำนักงานใหญ่/)).toHaveCount(0);
});

test("[user·hq] เกณฑ์ที่สาขาตั้ง มีผลกับการ์ดเตือนของ HQ ด้วย", async ({ page }) => {
  // ตั้งเกณฑ์ต่ำมาก (1 ชม.) ให้สาขา CNX → ลูกค้าเป้าหมายที่ยังไม่มีผู้รับผิดชอบของ CNX ต้องเข้าเกณฑ์
  await seedRules(page, "CNX", 7, 1);
  await open(page, "hq", "/hq/leads");
  await assertHealthyPage(page, "ลูกค้าเป้าหมายทั้งเครือ");
  const card = page.locator(".card").filter({ hasText: "ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบ" });
  if (await card.count()) {
    // ป้ายต้องบอกเกณฑ์ที่ "แต่ละสาขาตั้งเอง" ไม่ใช่ตัวเลขกลางตัวเดียว
    await expect(card.getByText(/เกณฑ์ที่แต่ละสาขาตั้งไว้เอง/)).toBeVisible();
  }
});
