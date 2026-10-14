// ── หนึ่งดีล = ใบเสนอราคาใบเดียว (บอสสั่ง 20 ส.ค. 69) ──────────────────────────
//
// ต้นเหตุเดิม: ฟอร์มออกใบซ่อนปุ่ม "เลือกจากแคตตาล็อก" ไว้ เพิ่มรายการที่สองไม่ได้
//   ดีลเลอร์จึงไปกดออกใบใหม่แทน → ลูกค้ารายเดียวมีใบ 2 ฉบับทั้งที่เป็นงานเดียวกัน
// ตอนนี้: เพิ่มรายการในใบเดิมได้ · และปุ่มบนหัวแผงพาไปแก้ใบเดิม ไม่ออกใบใหม่
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import {
  DEALER_ORIGIN, loginUI, db, waitRow, cleanup, specNS, nsTag, pickTemplate, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("ONEQ");
const COMPANY = nsTag(NS)("ใบเดียว");

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

// ด่าน 3: รายการของใบมาจากใบ HQ (ล็อก) — "เพิ่มรายการเอง" ไม่มีแล้ว (ต้องขอแก้ราคาให้ HQ ออกเวอร์ชันใหม่)
//   กติกาที่ยังต้องจริง: หนึ่งดีล = ใบเดียว · ใบมีรายการตามใบ HQ ครบ
test("[func] ทำใบจากใบ HQ ที่มี 2 รายการ → ได้ใบเดียวที่มี 2 รายการ ไม่ใช่ 2 ใบ", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  // 1) ลูกค้าเป้าหมายใหม่ (มีแม่แบบ + พื้นที่ → BOQ ตั้งต้นให้ 1 รายการ)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณใบเดียว");
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");
  await pickTemplate(page);
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  // 2) ได้ใบ HQ 2 รายการ → เปิดฟอร์มทำใบจากใบ HQ — รายการทั้งสองมาจากใบ HQ แก้ได้เฉพาะ %
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY, [
    { name: "โครงสร้างหลัก", qty: 500, unit: "ตร.ม.", unitCost: 4500 },
    { name: "รางน้ำ", qty: 80, unit: "เมตร", unitCost: 350 },
  ]);
  const ตาราง = page.locator("[data-editor='hq-markup']");
  await expect(ตาราง.locator("tbody tr"), "รายการตามใบ HQ ครบ 2 รายการ").toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: /เลือกจากแคตตาล็อก/ }), "ใบจากใบ HQ เพิ่มรายการเองไม่ได้").toHaveCount(0);

  // 4) บันทึก → ต้องได้ใบเดียวที่มี 2 รายการ ไม่ใช่ 2 ใบ
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string; items: number }>(sb, "quotations", { customer: COMPANY }, 60_000);
  const { data: ทั้งหมด } = await sb.from("quotations").select("id").eq("dealer_code", "RYG").eq("customer", COMPANY);
  expect(ทั้งหมด?.length, "ต้องมีใบเสนอราคาใบเดียว").toBe(1);
  expect(q.items, "ใบนั้นต้องมี 2 รายการ").toBe(2);
});

test("[func] มีใบที่ยังแก้ได้อยู่ → ปุ่มบนหัวแผงพาไปเพิ่มรายการในใบเดิม ไม่ออกใบใหม่", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();

  // ป้ายปุ่มต้องบอกตรง ๆ ว่าจะไปเพิ่มรายการ ไม่ใช่ออกใบใหม่
  //   ด่าน 3 (ระบบจริง): ใบจากใบ HQ เพิ่มรายการไม่ได้ ป้ายจึงเป็น "แก้ใบเสนอราคา" (ไปแก้ % ในใบเดิม)
  const ปุ่ม = page.getByRole("button", { name: /^(แก้ใบเสนอราคา|เพิ่มรายการในใบเสนอราคา)$/ }).first();
  await expect(ปุ่ม, "มีใบที่ยังแก้ได้ ปุ่มต้องพาไปใบเดิม ไม่ใช่ออกใบใหม่").toBeVisible({ timeout: 20_000 });
  await ปุ่ม.click();

  // เข้าโหมดแก้ใบเดิม (หัวฟอร์มขึ้น "แก้ไข <เลขที่ใบ>")
  await expect(page.getByText(/^แก้ไข /), "ต้องเข้าโหมดแก้ใบเดิม").toBeVisible({ timeout: 20_000 });
  const { data: ทั้งหมด } = await sb.from("quotations").select("id").eq("dealer_code", "RYG").eq("customer", COMPANY);
  expect(ทั้งหมด?.length, "ยังต้องมีใบเดียวเหมือนเดิม").toBe(1);
});
