import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";
import { DEALER_ORIGIN, loginUI, db } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── หน้าใบเสนอราคาดีลเลอร์: กดแล้วเปิดดูใบได้เลย (บอสสั่ง 28 ต.ค. 69) ─────────────────────────────────────────
//   1. กดแถว = แผงดูใบในหน้าเดิม (URL ยังเป็น /quotations) · ยอดก่อน VAT ตรงฐาน · เห็นทุกฉบับ (V1, V2) · ปุ่มไปแผงลีด (ทำ D6/D8/D8x ที่นั่น)
//   2. ตาราง: ป้ายฉบับแบบ "V1" ทุกแถว · วันที่สร้าง/หมดอายุมีปี พ.ศ. · ช่องกรอง "ส่งให้ลูกค้าแล้ว" · คำ "งานที่ต้องการ"
//   3. ปิดแผงแล้วอยู่ที่เดิม — ค้นหา/ตัวกรอง/หน้าที่ดูอยู่ไม่ถูกล้าง
//   สาขาของชุดเอง (ZZQP) — ตารางมีแค่ใบของชุดนี้ จึงรู้แน่ว่ามี 2 หน้า (12 ใบ · หน้าละ 10)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

const admin = adminClient();
const รหัสสาขา = "ZZQP";
let สาขา: บัญชีสาขาของชุด;
const แท็ก = `${Date.now() % 100000}`;
const ชุด = `ZZTEST-ดูใบ-${แท็ก}`;
const ใบHQ: ใบHQพร้อมใช้[] = [];
let เลขV1 = "";
let เลขV2 = "";
const จำนวนใบ = 11;   // + ฉบับ V2 อีกใบ = 12 แถว → 2 หน้า

const ช่องค้นหา = (page: Page) => page.getByPlaceholder("ค้นหาเลขที่").first();

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของชุด(รหัสสาขา, "ระยอง");
  for (let i = 0; i < จำนวนใบ; i++) {
    const บริษัท = `${ชุด}-${String(i).padStart(2, "0")}`;
    const ใบ = await เตรียมใบHQ(สาขา, { dealerCode: รหัสสาขา, company: บริษัท, province: "ระยอง",
      lines: [{ name: "โครงเหล็กชุดดูใบ", qty: 2, unit: "ชุด", unitCost: 1000 }, { name: "หลังคาชุดดูใบ", qty: 1, unit: "งาน", unitCost: 500 }] });
    ใบHQ.push(ใบ);
    const q = await ทำใบลูกค้าจากใบHQ(สาขา, ใบ, { customer: บริษัท, markupPercent: 10, status: "sent_to_client" });
    if (i === 0) เลขV1 = q.id;
  }
  // ฉบับใหม่ของใบแรก (ทางเดียวกับปุ่ม "ทำฉบับใหม่" ในแผงลีด · ใบ 0228)
  const v2 = await (await db(สาขา)).rpc("quotation_new_version", { p_dealer: รหัสสาขา, p_id: เลขV1 });
  if (v2.error) throw new Error(`ทำฉบับใหม่ไม่สำเร็จ: ${v2.error.message}`);
  เลขV2 = String((v2.data as { id: string }).id);
});
test.afterAll(async () => {
  expect(await ลบสาขาของชุด(รหัสสาขา, ใบHQ.map(x => x.leadNum)), `เก็บกวาดสาขา ${รหัสสาขา}`).toEqual([]);
});

async function เปิดหน้า(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ช่องค้นหา(page).fill(ชุด);
}

test("[D6] [ux·dealer] กดแถว → แผงดูใบในหน้าเดิม · ยอดก่อน VAT ตรงฐาน · เห็นฉบับ V1 V2 · ปุ่มไปแผงลีด", async ({ page }) => {
  const { data: ฐาน } = await admin.from("quotations").select("total_value").eq("dealer_code", รหัสสาขา).eq("id", เลขV1).single();
  const ยอด = Number(ฐาน?.total_value);
  expect(ยอด, "ตั้งต้น: (2×1,000 + 500) × 1.10").toBe(2750);

  await เปิดหน้า(page);
  // ค้นด้วยเลขใบ — ตารางเรียงใหม่สุดก่อน ใบแรก (V1) ของชุดตกไปหน้า 2 (เจอจริงในรอบพิสูจน์) · ค้นเลขนี้เหลือ V1 + V2 หน้าเดียว
  await ช่องค้นหา(page).fill(เลขV1);
  const แถว = page.locator("tbody tr").filter({ has: page.locator("[data-quote-no]", { hasText: new RegExp(`^${เลขV1}$`) }) }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await แถว.locator("td").first().click();

  const แผง = page.locator(`[data-quote-view="${เลขV1}"]`);
  await expect(แผง, "กดแถวแล้วแผงดูใบต้องเปิดบนหน้าเดิม").toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).pathname, "URL ยังเป็นหน้าใบเสนอราคา").toBe("/quotations");
  await expect(แผง.locator("[data-view-revision]")).toHaveText("V1");
  await expect(แผง.locator('[data-total-row="subtotal"] [data-total-value]'), "ยอดก่อน VAT = total_value ในฐาน")
    .toHaveText(`฿${ยอด.toLocaleString("en-US")}`);
  await expect(แผง.getByText("โครงเหล็กชุดดูใบ", { exact: true }), "เห็นรายการสินค้า").toBeVisible();
  // ทุกฉบับของใบนี้
  await expect(แผง.locator(`[data-version-item="${เลขV1}"]`)).toBeVisible();
  await expect(แผง.locator(`[data-version-item="${เลขV2}"]`), "ฉบับ V2 อยู่ในรายการฉบับ").toBeVisible();
  await แผง.locator(`[data-version-item="${เลขV2}"]`).click();
  await expect(page.locator(`[data-quote-view="${เลขV2}"] [data-view-revision]`), "กดฉบับ V2 แล้วแผงแสดง V2").toHaveText("V2");
  // ปุ่มไปแผงลีด (D6 ส่ง · D8/D8x ผลจากลูกค้า ทำที่นั่น)
  await page.locator("[data-quote-view] [data-goto-lead]").click();
  await page.waitForURL(/\/leads\?open=/, { timeout: 20_000 });
});

test("[D6] [ui·dealer] ตาราง: ป้ายฉบับ V1/V2 ทุกแถว · วันที่มีปี พ.ศ. · ช่องกรอง \"ส่งให้ลูกค้าแล้ว\" · คำ \"งานที่ต้องการ\"", async ({ page }) => {
  await เปิดหน้า(page);
  await expect(page.getByPlaceholder("ค้นหาเลขที่ / ลูกค้า / งานที่ต้องการ...", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("columnheader", { name: "งานที่ต้องการ" })).toBeVisible();
  const แถว = page.locator("tbody tr").filter({ hasText: ชุด });
  await expect(แถว.first()).toBeVisible({ timeout: 25_000 });
  const ฉบับ = await แถว.locator("td:first-child .badge").allTextContents();
  expect(ฉบับ.length, "ทุกแถวมีป้ายฉบับ").toBe(await แถว.count());
  for (const f of ฉบับ) expect(f.trim(), "ป้ายฉบับแบบ V1/V2").toMatch(/^V\d+$/);
  const วันที่ = await แถว.locator("[data-date-cell]").allTextContents();
  expect(วันที่.length, "แต่ละแถวมีวันที่สร้าง + หมดอายุ").toBe((await แถว.count()) * 2);
  for (const d of วันที่) expect(d, "วันที่ในตารางมีปี พ.ศ.").toMatch(/ 25\d\d$/);
  const ตัวเลือก = await page.getByLabel("ทุกสถานะ").locator("option").allTextContents();
  expect(ตัวเลือก, "ช่องกรองใช้คำเต็ม").toContain("ส่งให้ลูกค้าแล้ว");
  expect(ตัวเลือก).not.toContain("ส่งแล้ว");
});

test("[D6] [ux·dealer] ปิดแผงแล้วอยู่ที่เดิม — ค้นหา ตัวกรอง หน้าที่ 2 คงเดิม", async ({ page }) => {
  await เปิดหน้า(page);
  await expect(page.locator("tbody tr").filter({ hasText: ชุด }).first()).toBeVisible({ timeout: 25_000 });
  await page.getByRole("button", { name: /ถัดไป/ }).click();
  await expect(page.getByText("หน้า 2 / 2", { exact: true })).toBeVisible({ timeout: 10_000 });
  const แถว = page.locator("tbody tr").filter({ hasText: ชุด }).first();
  await แถว.locator("td").first().click();
  const แผง = page.locator("[data-quote-view]");
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  await แผง.getByRole("button", { name: "ปิด" }).click();
  await expect(แผง).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/quotations");
  await expect(page.getByText("หน้า 2 / 2", { exact: true }), "ยังอยู่หน้า 2").toBeVisible();
  await expect(ช่องค้นหา(page), "คำค้นยังอยู่").toHaveValue(ชุด);

  // ตัวกรองสถานะ + กด Esc ปิด
  await page.getByLabel("ทุกสถานะ").selectOption({ label: "ส่งให้ลูกค้าแล้ว" });
  const แถวส่งแล้ว = page.locator("tbody tr").filter({ hasText: ชุด }).first();
  await expect(แถวส่งแล้ว).toBeVisible({ timeout: 15_000 });
  await แถวส่งแล้ว.locator("td").first().click();
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(แผง).toHaveCount(0);
  await expect(page.getByLabel("ทุกสถานะ"), "ตัวกรองสถานะยังอยู่").toHaveValue("sent_to_client");
  await expect(ช่องค้นหา(page)).toHaveValue(ชุด);
});
