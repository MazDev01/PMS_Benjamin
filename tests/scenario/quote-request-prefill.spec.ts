import { test, expect, type Page } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ฟอร์มขอราคาจาก HQ กรอกให้จากลีด (บอสสั่ง 26 ต.ค. 69 · FLOW ขั้น 3 "งาน + พื้นที่ + สเปก") ─────────────────────────
//   งานที่ขอราคา ← งานที่ต้องการ · พื้นที่ ← พื้นที่ · สเปก ← สเปก / รายละเอียดงาน (ลีด ณ ตอนเปิด · แก้ได้ก่อนส่ง)
//   ลีดไม่มีค่าช่องไหน = ช่องนั้นว่าง (ห้ามเดา) · ยกเลิกแล้วเปิดใหม่ = ดึงจากลีดใหม่ ไม่ค้างค่าที่พิมพ์รอบก่อน
//   ขอแก้ราคา (D5x) = สเปกจากคำขอล่าสุด
//   เดิมฟอร์มเปิดมาว่างทุกช่อง (ข้อ 1 ตกบนโค้ดก่อนแก้)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const แท็ก = Date.now() % 100_000;
const เลข = { ครบ: เลขลูกค้าเป้าหมายทดสอบ(), ไม่มีพื้นที่: เลขลูกค้าเป้าหมายทดสอบ(), แก้ราคา: เลขลูกค้าเป้าหมายทดสอบ() };
const ชื่อ = (k: keyof typeof เลข) => `ZZTEST-กรอกคำขอ-${k}-${แท็ก}`;
const งาน = "โกดังเก็บสินค้า 20x40 ม.";
const สเปก = "หลังคาเมทัลชีท สูง 8 ม. ประตูม้วน 2 บาน";

async function สร้างลีด(k: keyof typeof เลข, ช่อง: { project?: string; area?: number; note?: string }) {
  const r = await (await db(RYG)).from("leads").insert({ id: `#L-${เลข[k]}`, num_id: เลข[k], dealer_code: "RYG", company: ชื่อ(k), name: ชื่อ(k),
    contact: "ผู้ทดสอบ", phone: `08${String(เลข[k]).slice(-8)}`, province: "ระยอง", status: "BULLET", ...ช่อง });
  expect(r.error, `สร้างลีด ${k}`).toBeNull();
}
async function เปิดแท็บใบเสนอราคา(page: Page, k: keyof typeof เลข) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ(k));
  const row = page.locator("tbody tr").filter({ hasText: ชื่อ(k) }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  return page.locator("[data-panel='quote-request']");
}
async function กดขอราคา(page: Page) {
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
}

test.afterAll(() => { ล้างใบHQทดสอบ("RYG", Object.values(เลข)); });

test("[flow·dealer] ขอราคา: เปิดฟอร์มแล้วงาน · พื้นที่ · สเปก กรอกจากลีดครบ · ยกเลิกแล้วเปิดใหม่ดึงจากลีดใหม่", async ({ page }) => {
  const errs = watchErrors(page);
  await สร้างลีด("ครบ", { project: งาน, area: 800, note: สเปก });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const แผง = await เปิดแท็บใบเสนอราคา(page, "ครบ");
  await กดขอราคา(page);
  await expect(แผง.getByLabel("งานที่ขอราคา"), "งานที่ขอราคา ← งานที่ต้องการของลีด").toHaveValue(งาน, { timeout: 15_000 });
  await expect(แผง.locator("#qr-area"), "พื้นที่ ← พื้นที่ของลีด").toHaveValue("800");
  await expect(แผง.getByLabel("สเปก / รายละเอียด"), "สเปก ← สเปก / รายละเอียดงานของลีด").toHaveValue(สเปก);
  await expect(แผง, "จังหวัดแสดงเหมือนเดิม").toContainText("จังหวัดหน้างาน: ระยอง");

  // แก้ในฟอร์มแล้วกดยกเลิก → เปิดใหม่ต้องกลับมาเป็นค่าของลีด ไม่ค้างค่าที่พิมพ์ไว้
  await แผง.getByLabel("งานที่ขอราคา").fill("ZZ พิมพ์ทิ้ง");
  await แผง.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  await กดขอราคา(page);
  await expect(แผง.getByLabel("งานที่ขอราคา"), "ยกเลิกแล้วเปิดใหม่ = ดึงจากลีดใหม่").toHaveValue(งาน, { timeout: 15_000 });

  // แก้ได้ก่อนส่ง · ส่งแล้วค่าที่แก้ลงฐาน
  await แผง.locator("#qr-area").fill("900");
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect.poll(async () => (await (await db(RYG)).from("quote_requests").select("product, area, spec").eq("dealer_code", "RYG").eq("lead_num_id", เลข.ครบ).order("id", { ascending: false }).limit(1).maybeSingle()).data,
    { timeout: 20_000, message: "คำขอที่ส่งต้องมีค่าจากฟอร์ม (กรอกจากลีด + ที่แก้)" }).toMatchObject({ product: งาน, area: 900, spec: สเปก });
  assertNoErrors(errs, "ฟอร์มขอราคากรอกจากลีด");
});

test("[flow·dealer] ขอราคา: ลีดไม่มีพื้นที่/งาน → ช่องนั้นว่าง (ไม่เดาค่า)", async ({ page }) => {
  await สร้างลีด("ไม่มีพื้นที่", { note: สเปก });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const แผง = await เปิดแท็บใบเสนอราคา(page, "ไม่มีพื้นที่");
  await กดขอราคา(page);
  await expect(แผง.getByLabel("สเปก / รายละเอียด"), "ช่องที่ลีดมีค่ายังกรอกให้").toHaveValue(สเปก, { timeout: 15_000 });
  await expect(แผง.locator("#qr-area"), "ลีดไม่มีพื้นที่ → ช่องพื้นที่ว่าง").toHaveValue("");
  await expect(แผง.getByLabel("งานที่ขอราคา"), "ลีดไม่มีงานที่ต้องการ → ช่องว่าง").toHaveValue("");
});

test("[D5x] [flow·dealer] ขอแก้ราคา (D5x): สเปกกรอกจากคำขอล่าสุด", async ({ page }) => {
  await สร้างลีด("แก้ราคา", { project: งาน });
  const sb = await db(RYG);
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลข.แก้ราคา, p_product: งาน, p_spec: "ZZ สเปกในคำขอล่าสุด" });
  expect(r.error).toBeNull();
  const requestId = Number((r.data as { id: number }).id);
  const hq = await db(ADMIN);
  const ยืนราคา = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  expect((await hq.rpc("hq_quote_save", { p_request_id: requestId, p_lines: [{ name: "โครงสร้างเหล็ก", qty: 100, unit: "ตร.ม.", unitCost: 1000 }], p_valid_until: ยืนราคา, p_note: "" })).error).toBeNull();
  expect((await hq.rpc("hq_quote_send", { p_request_id: requestId })).error).toBeNull();

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const แผง = await เปิดแท็บใบเสนอราคา(page, "แก้ราคา");
  await แผง.getByRole("button", { name: "ขอแก้ราคา" }).click();
  await expect(แผง.locator("#qr-reprice-spec"), "ขอแก้ราคา: สเปก ← คำขอล่าสุด").toHaveValue("ZZ สเปกในคำขอล่าสุด", { timeout: 15_000 });
});
