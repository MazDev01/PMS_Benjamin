import { test, expect } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ทำฉบับใหม่: VAT เท่าใบเดิมเสมอ (บอสสั่ง 22 ต.ค. 69 · รอบตรวจเต็มรอบ 3 ข้อ 6 · ใบ 0237) ─────────────────────────────
//   ต้นเหตุเดิม: ใบที่ช่อง VAT ว่าง หน้าเว็บแสดง/พิมพ์ด้วย VAT ของสาขา แต่ฉบับใหม่ล็อกภาษีให้เท่าใบเดิม (0228) → ฐานปฏิเสธ
//   ทางแก้ (บอส): ลูกค้าได้ V1 ที่คิด VAT ตามค่าสาขาไปแล้ว → V2 ต้องคิด VAT เท่ากัน
//     ใบ 0237 เติม VAT ที่ว่างด้วยค่าที่เคยแสดง · ต่อไปห้ามว่าง (สร้างใบไม่ส่งค่า = ค่าของสาขา) · V2 คัดลอกจาก V1
//   ข้อนี้ทำ V1 ด้วยคำสั่งเดียวกับหน้าเว็บโดย "ไม่ส่งภาษี" (ทางเดียวกับใบที่เคยว่าง) แล้วเดินบนหน้าเว็บ
//   ข้อทดสอบระดับฐาน (เติมค่า · ยอดก่อน/หลังเท่ากัน · ห้ามว่าง): supabase/tests/quote_vat_required.sql
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(180_000);

const admin = adminClient();
// สาขาของชุดนี้เอง (ZZQV) — ถังโควตาคำขอแยกจาก RYG ที่ชุดอื่นใช้พร้อมกัน (ตกแบบไม่นิ่งเพราะ 429 ในรอบตรวจรอบ 4 · ดู ownBranch.ts)
const รหัสสาขา = "ZZQV";
let สาขา: บัญชีสาขาของชุด;
const แท็ก = `${Date.now() % 100000}`;
const ลูกค้า = `ZZTEST-ฉบับใหม่VAT-${แท็ก}`;
let ใบ: ใบHQพร้อมใช้;
let เลขV1 = "";
const ใบของ = async (id: string) => (await admin.from("quotations")
  .select("status, total_value, vat_percent, revision, supersedes_id")
  .eq("dealer_code", รหัสสาขา).eq("id", id).maybeSingle()).data;
/** VAT ที่หน้าเว็บของสาขาใช้ (ตั้งค่า › ใบเสนอราคา · ไม่ได้ตั้ง = 7 · กติกาเดียวกับ useDealerVat) */
const VATของสาขา = async () => {
  const v = ((await admin.from("dealer_settings").select("document").eq("dealer_code", รหัสสาขา).maybeSingle()).data?.document as { vatPercent?: unknown } | undefined)?.vatPercent;
  return typeof v === "number" && v >= 0 ? Math.min(v, 100) : 7;
};

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของชุด(รหัสสาขา, "ระยอง");
  ใบ = await เตรียมใบHQ(สาขา, { dealerCode: รหัสสาขา, company: ลูกค้า, province: "ระยอง",
    lines: [{ name: "โครงเหล็กชุดVAT", qty: 2, unit: "ชุด", unitCost: 1000 }, { name: "หลังคาชุดVAT", qty: 1, unit: "งาน", unitCost: 500 }] });
  // ไม่ส่งภาษีมาเลย — ก่อนใบ 0237 ใบแบบนี้ VAT ว่างในฐาน
  เลขV1 = (await ทำใบลูกค้าจากใบHQ(สาขา, ใบ, { customer: ลูกค้า, markupPercent: 10, status: "sent_to_client" })).id;
});
test.afterAll(async () => { expect(await ลบสาขาของชุด(รหัสสาขา, ใบ ? [ใบ.leadNum] : []), `เก็บกวาดสาขา ${รหัสสาขา}`).toEqual([]); });

test("[func·dealer] สร้างใบไม่ส่งภาษี → VAT ไม่ว่าง (ค่าของสาขา) · ทำฉบับใหม่ แก้แค่ % บันทึกได้ · V2 VAT เท่า V1 · ส่ง V2 แล้ว V1 ถูกแทนที่", async ({ page }) => {
  const V1 = await ใบของ(เลขV1);
  const vatสาขา = await VATของสาขา();
  expect(V1?.status, "ตั้งต้น: V1 ส่งให้ลูกค้าแล้ว").toBe("sent_to_client");
  expect(V1?.vat_percent, "สร้างใบใหม่ VAT ต้องไม่ว่าง").not.toBeNull();
  expect(Number(V1?.vat_percent), "ไม่ส่งภาษี = บันทึก VAT ที่หน้าเว็บของสาขาใช้").toBe(vatสาขา);
  expect(Number(V1?.total_value), "V1 = (2×1,000 + 500) × 1.10").toBe(2750);
  const เลขV2 = `${เลขV1}-V2`;

  const ข้อความ: string[] = [];
  page.on("console", m => { if (m.type() === "error") ข้อความ.push(m.text()); });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขV1);
  const แถว = page.locator("tbody tr").filter({ hasText: เลขV1 }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await แถว.locator("td").first().click();
  await page.waitForURL(/\/leads/, { timeout: 25_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });

  // หน้าดูใบ V1: VAT ที่แสดง = ค่าที่ตรึงกับใบ
  await page.locator(`[data-quote-item="${เลขV1}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
  await expect(page.locator("[data-quote-totals]").getByText(`ภาษีมูลค่าเพิ่ม ${vatสาขา}%`, { exact: true }), "V1 แสดง VAT ของใบ").toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "กลับ" }).click();

  // ทำฉบับใหม่ → ฟอร์ม V2: VAT เท่าใบเดิมและล็อก · แก้แค่ %
  await page.locator(`[data-quote-item="${เลขV1}"]`).getByTitle("ทำฉบับใหม่").click({ timeout: 20_000 });
  await expect(page.locator("[data-version-copied]"), "ฟอร์มฉบับใหม่").toBeVisible({ timeout: 20_000 });
  const ช่องVAT = page.getByRole("checkbox", { name: /ภาษีมูลค่าเพิ่ม/ });
  if (vatสาขา > 0) await expect(ช่องVAT, "V2: ติ๊ก VAT ตามใบเดิม").toBeChecked();
  await expect(ช่องVAT, "ภาษีของฉบับใหม่แก้ไม่ได้").toBeDisabled();
  await expect(page.getByLabel("อัตราภาษีมูลค่าเพิ่ม (VAT)"), "อัตรา VAT ในฟอร์ม = ของใบเดิม").toHaveValue(String(vatสาขา));
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" }).getByLabel("% ที่บวก 1").fill("20");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();

  // บันทึกได้จริง: V2 ลงฐานด้วย % ใหม่ · VAT เท่า V1 · ไม่มีข้อความฐานปฏิเสธ
  await expect.poll(async () => Number((await ใบของ(เลขV2))?.total_value ?? 0),
    { timeout: 25_000, message: "V2 บันทึก % ใหม่: 2×1,200 + 550" }).toBe(2950);
  const V2 = await ใบของ(เลขV2);
  expect(V2, "V2 = ใบร่างฉบับ V2 ผูกใบเดิม").toMatchObject({ status: "draft", revision: "V2", supersedes_id: เลขV1 });
  expect(Number(V2?.vat_percent), "V2 VAT % เท่ากับ V1").toBe(Number(V1?.vat_percent));
  await expect(page.getByText(/quote_version_locked|คัดลอกจากใบเดิม แก้ไม่ได้/), "ไม่มีข้อความฐานปฏิเสธ").toHaveCount(0);
  expect(ข้อความ.filter(t => /quote_version_locked/.test(t)), "คอนโซลไม่มีข้อผิดพลาดจากฐาน").toEqual([]);

  // หน้าดูใบ V2: VAT เท่า V1
  await page.locator(`[data-quote-item="${เลขV2}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
  const ยอด = page.locator("[data-quote-totals]");
  await expect(ยอด.getByText(`ภาษีมูลค่าเพิ่ม ${vatสาขา}%`, { exact: true }), "V2 แสดง VAT เท่า V1").toBeVisible({ timeout: 15_000 });
  await expect(ยอด.getByText("ยอดชำระสุทธิ")).toBeVisible();
  await page.getByRole("button", { name: "กลับ" }).click();

  // ส่ง V2 (กล่องขั้นต่อไป) → V1 ถูกแทนที่ · V2 ส่งแล้ว
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await ใบของ(เลขV1))?.status, { timeout: 25_000, message: "ส่ง V2 แล้ว V1 ถูกแทนที่" }).toBe("superseded");
  expect((await ใบของ(เลขV2))?.status, "V2 ส่งให้ลูกค้าแล้ว").toBe("sent_to_client");
});
