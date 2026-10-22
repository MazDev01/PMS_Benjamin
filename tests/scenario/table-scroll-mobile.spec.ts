import { test, expect, type Page } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ตารางในแผง/ลิ้นชักต้องเลื่อนในกล่องตัวเอง ไม่ดันทั้งหน้าให้ล้นจอมือถือ (ทดลองใช้เว็บจริงแทนบอส 21 ต.ค. 69) ──
//   เจอ: หน้าคำขอใบเสนอราคาของ HQ บนจอ 390px — ตาราง BOQ กว้างกว่าจอ หน้าเลื่อนไปซ้ายจนตัวหนังสือซ้ายถูกตัด
//   ต้นเหตุ: คลาส table-scroll (ใช้ 5 จุด) ไม่มีกฎ CSS เลย · ข้อนี้วัดว่า "หน้าไม่กว้างกว่าจอ" ทั้งฝั่ง HQ และดีลเลอร์
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.setTimeout(180_000);

const แท็ก = `${Date.now() % 100000}`;
const ส่งแล้ว = `ZZTEST-ตารางมือถือ-ส่งแล้ว-${แท็ก}`, รอราคา = `ZZTEST-ตารางมือถือ-รอราคา-${แท็ก}`;
let ใบ: ใบHQพร้อมใช้ | undefined; let เลขรอ = 0;
test.beforeAll(async () => {
  ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ส่งแล้ว, province: "ระยอง",
    lines: [{ name: "โครงสร้างเหล็กหลักพร้อมงานติดตั้งครบชุด", qty: 1200, unit: "ตร.ม.", unitCost: 1850 }] });
  เลขรอ = เลขลูกค้าเป้าหมายทดสอบ();
  const sb = await db(RYG);
  const l = await sb.from("leads").insert({ id: `#L-${เลขรอ}`, num_id: เลขรอ, dealer_code: "RYG", company: รอราคา, name: รอราคา,
    contact: "ผู้ทดสอบ", phone: `08${String(เลขรอ).slice(-8)}`, province: "ระยอง", status: "BULLET" });
  if (l.error) throw new Error(l.error.message);
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลขรอ, p_product: "โกดังสำเร็จรูป" });
  if (r.error) throw new Error(r.error.message);
});
test.afterAll(async () => { ล้างใบHQทดสอบ("RYG", [ใบ?.leadNum, เลขรอ].filter((n): n is number => !!n)); });

const ล้นจอ = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
// กล่องแรกที่ตัดขอบตาราง (overflow-x ไม่ใช่ visible) ต้องเป็นกล่องเลื่อนของตารางเอง (.table-scroll)
//   ไม่ใช่กล่องเนื้อหาทั้งหน้า — ไม่งั้นทั้งแผงเลื่อนตามจนตัวหนังสือซ้ายหลุดจอ (อาการที่เจอบนเว็บจริง)
const กล่องที่ตัดตาราง = (page: Page, ตาราง: string) => page.locator(ตาราง).first().evaluate(t => {
  for (let e = t.parentElement; e; e = e.parentElement)
    if (getComputedStyle(e).overflowX !== "visible") return e.classList.contains("table-scroll") ? "table-scroll" : `${e.tagName}.${e.className}`;
  return "ไม่มี";
});

async function เปิดคำขอ(page: Page, company: string, กลุ่ม?: "ส่งแล้ว รอดีลเลอร์") {
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" }); await settle(page);
  await เปิดใบHQในกล่องงาน(page, company, กลุ่ม);
  await expect(page.getByRole("table", { name: "รายการ BOQ" })).toBeVisible();
  await settle(page);
}

test("[มือถือ] HQ คำขอใบเสนอราคา: ใบที่ส่งแล้ว (ล็อก) และใบที่กำลังตีราคา หน้าไม่ล้นจอ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await เปิดคำขอ(page, ส่งแล้ว, "ส่งแล้ว รอดีลเลอร์");
  expect(await ล้นจอ(page), "ใบ HQ ที่ส่งแล้ว: หน้ากว้างไม่เกินจอ").toBeLessThanOrEqual(1);
  expect(await กล่องที่ตัดตาราง(page, "table[aria-label='รายการ BOQ']"), "ใบ HQ ที่ส่งแล้ว: ตารางเลื่อนในกล่องตัวเอง").toBe("table-scroll");
  await เปิดคำขอ(page, รอราคา);
  const กล่อง = page.getByRole("region", { name: "ใบ HQ" });
  if (await กล่อง.getByLabel("ชื่อรายการ 1").count() === 0) await กล่อง.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await กล่อง.getByLabel("ชื่อรายการ 1").fill("โครงสร้างเหล็กหลักพร้อมงานติดตั้งครบชุด");
  expect(await ล้นจอ(page), "ใบ HQ ที่กำลังตีราคา (ช่องกรอก): หน้ากว้างไม่เกินจอ").toBeLessThanOrEqual(1);
  expect(await กล่องที่ตัดตาราง(page, "table[aria-label='รายการ BOQ']"), "ใบ HQ ที่กำลังตีราคา: ตารางเลื่อนในกล่องตัวเอง").toBe("table-scroll");
});

test("[มือถือ] ดีลเลอร์: ตาราง % ที่บวกในแผงลีด หน้าไม่ล้นจอ", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ส่งแล้ว);
  const แถว = page.locator("tbody tr").filter({ hasText: ส่งแล้ว }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await แถว.locator("td").first().click();
  await page.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).first().click({ timeout: 20_000 });
  await expect(page.locator("[data-editor='hq-markup']")).toBeVisible({ timeout: 20_000 });
  await settle(page);
  expect(await ล้นจอ(page), "ตาราง % ที่บวก: หน้ากว้างไม่เกินจอ").toBeLessThanOrEqual(1);
  expect(await กล่องที่ตัดตาราง(page, "[data-editor='hq-markup'] table"), "ตาราง % ที่บวก: ตารางเลื่อนในกล่องตัวเอง").toBe("table-scroll");
});
