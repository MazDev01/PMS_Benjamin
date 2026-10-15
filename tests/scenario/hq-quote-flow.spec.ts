import { test, expect, type Page } from "@playwright/test";
import { รันSQLในฐาน } from "./localDb";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";

// ── ขายหนึ่งงาน ขั้น 5–6 บนหน้าจอ + ตารางสถานะแถว "HQ ส่งใบ" (FLOW.html · ด่าน 2) ─────────────────────────────
//   ขั้น 5  HQ ทำ BOQ ด้วยราคาแม่แบบ (HQ เห็นคนเดียว) → บันทึกร่าง — ดีลเลอร์ยังไม่เห็นร่าง ไม่มีป้าย
//   ขั้น 6  HQ ส่งใบ → ล็อกเวอร์ชัน (เปิดดูซ้ำแก้ไม่ได้) · คำขอ "ส่งใบแล้ว" · หยุดนับ 14 วัน
//   แถว "HQ ส่งใบ": ลูกค้าเป้าหมายคงเดิม (รอราคา HQ) + ป้าย "ได้ราคาแล้ว" · ดีลเลอร์เห็นใบ HQ (ต้นทุนของตัวเอง)
//   (อีเมลถึงดีลเลอร์ · กฎแก้ไม่ได้แม้ยิงตรง · การมองเห็นทุกแถว — ข้อทดสอบยิงตรงฐาน hq_quote_send.sql / visibility.sql)
// ขั้น 3 (ส่งคำขอ) มีข้อทดสอบหน้าจอของด่าน 1 แล้ว — ที่นี่เตรียมคำขอด้วยคำสั่งของฐานในนามดีลเลอร์
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

const admin = adminClient();
const COMPANY = `ZZTEST-ใบHQ-${Date.now() % 100000}`;
let leadNum = 0;
let requestId = 0;
let ราคาแม่แบบแรก = 0;

/** ใบ HQ ที่ส่งแล้วลบไม่ได้แม้ด้วยกุญแจฝั่งเซิร์ฟเวอร์ (ตั้งใจ) — ลบที่ฐานทดสอบในเครื่องตรง ๆ (วิธีเดียวกับ quote-request-flow) */
function ล้างที่ฐาน() {
  const sql = `alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = 'RYG' and lead_num_id = ${leadNum};
    delete from public.quote_requests where dealer_code = 'RYG' and lead_num_id = ${leadNum};
    delete from public.leads where dealer_code = 'RYG' and num_id = ${leadNum};`;
  if (leadNum) รันSQLในฐาน(sql);
}

test.beforeAll(async () => {
  leadNum = 979_000_000 + (Date.now() % 99_999);
  const ryg = await db(RYG);
  const r = await ryg.from("leads").insert({
    id: `#L-${leadNum}`, num_id: leadNum, dealer_code: "RYG", company: COMPANY, name: COMPANY, contact: "ผู้ทดสอบ",
    phone: "081-778-0001", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET",
  });
  if (r.error) throw new Error(r.error.message);
  const q = await ryg.rpc("quote_request_submit", { p_lead_num_id: leadNum, p_product: "โกดังสำเร็จรูป", p_area: 100, p_spec: "โกดัง 10x10 ม." });
  if (q.error) throw new Error(q.error.message);
  requestId = Number((q.data as { id: number }).id);
});
test.afterAll(ล้างที่ฐาน);

const ใบในฐาน = async () => (await admin.from("hq_quotes").select("status, total_cost, line_items, quote_no").eq("request_id", requestId).maybeSingle()).data;
const สถานะคำขอ = async () => (await admin.from("quote_requests").select("status").eq("id", requestId).single()).data?.status;
const สถานะลูกค้าเป้าหมาย = async () => (await admin.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", leadNum).single()).data?.status;
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function เปิดใบHQ(page: Page) {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByLabel("ค้นหาคำขอ").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: /ทำใบ HQ|ดูใบ HQ/ }).click();
  const กล่อง = page.getByRole("dialog", { name: "ใบ HQ" });
  await expect(กล่อง).toBeVisible();
  return กล่อง;
}
async function เปิดแผงดีลเลอร์(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

test("[flow·hq] ขั้น 5: HQ ทำ BOQ ด้วยราคาแม่แบบแล้วบันทึกร่าง — ดีลเลอร์ยังไม่เห็นร่าง ไม่มีป้ายได้ราคา", async ({ page }) => {
  const errs = watchErrors(page);
  const { data: cat } = await admin.from("master_catalog").select("id, name, price").order("id");
  const กล่อง = await เปิดใบHQ(page);

  // แม่แบบตัวแรกในรายการ — ต้นทุนต่อหน่วยตั้งต้นต้องเป็นราคาแม่แบบ และจำนวนตั้งต้น = พื้นที่ที่ดีลเลอร์ขอ (100 ตร.ม.)
  const ตัวเลือก = กล่อง.getByLabel("เพิ่มรายการจากแม่แบบ");
  const ค่าแรก = await ตัวเลือก.locator("option").nth(1).getAttribute("value");
  await ตัวเลือก.selectOption(ค่าแรก!);
  ราคาแม่แบบแรก = Number(cat?.find(c => c.id === ค่าแรก)?.price ?? NaN);
  expect(ราคาแม่แบบแรก, "แม่แบบที่เลือกต้องมีราคาในฐาน").toBeGreaterThan(0);
  await expect(กล่อง.getByLabel("ต้นทุนต่อหน่วย 1"), "ต้นทุนตั้งต้นจากราคาแม่แบบ").toHaveValue(new RegExp(String(ราคาแม่แบบแรก).replace(/\B(?=(\d{3})+(?!\d))/g, ",?")));
  await expect(กล่อง.getByLabel("จำนวน 1"), "จำนวนตั้งต้น = พื้นที่ที่ขอ").toHaveValue("100");

  // รายการที่ HQ พิมพ์เอง
  await กล่อง.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await กล่อง.getByLabel("ชื่อรายการ 2").fill("ค่าขนส่ง");
  await กล่อง.getByLabel("ต้นทุนต่อหน่วย 2").fill("5000");
  const คาด = ราคาแม่แบบแรก * 100 + 5000;
  await expect(กล่อง.getByTestId("hq-quote-total")).toHaveText(บาท(คาด));

  await กล่อง.getByRole("button", { name: "บันทึกร่าง" }).click();
  await expect.poll(async () => (await ใบในฐาน())?.status, { timeout: 15_000, message: "ร่างใบ HQ ต้องอยู่ในฐาน" }).toBe("draft");
  const ร่าง = await ใบในฐาน();
  expect(Number(ร่าง!.total_cost), "ยอดในฐานตรงกับหน้าจอ").toBe(คาด);
  expect((ร่าง!.line_items as unknown[]).length).toBe(2);
  expect(await สถานะคำขอ(), "เริ่มทำราคาโดยยังไม่กดรับเรื่อง = รับเรื่องให้").toBe("pricing");

  // ฝั่งดีลเลอร์: ร่างไม่หลุด
  const ryg = await db(RYG);
  expect((await ryg.from("hq_quotes").select("id").eq("request_id", requestId)).data ?? [], "ดีลเลอร์อ่านร่างตรงที่ฐานไม่ได้").toEqual([]);
  const row = await เปิดแผงดีลเลอร์(page);
  await expect(row.locator("[data-badge='hq-quoted']"), "ยังไม่ส่ง = ไม่มีป้ายได้ราคาแล้ว").toHaveCount(0);
  await row.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await expect(page.locator("[data-panel='quote-request']").getByText("กำลังทำราคา", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-panel='hq-quote']"), "ยังไม่ส่ง = ดีลเลอร์ไม่เห็นใบ HQ").toHaveCount(0);
  assertNoErrors(errs, "ทำ BOQ และบันทึกร่าง");
});

test("[flow·hq] ขั้น 6 + แถว HQ ส่งใบ: ส่งใบ → ล็อก · ส่งใบแล้ว · ลูกค้าเป้าหมายคงเดิม + ป้ายได้ราคาแล้ว · ดีลเลอร์เห็นใบ HQ", async ({ page }) => {
  test.skip((await ใบในฐาน())?.status !== "draft", "ข้อก่อนหน้าไม่ผ่าน");
  const errs = watchErrors(page);
  const คาด = Number((await ใบในฐาน())!.total_cost);
  let กล่อง = await เปิดใบHQ(page);
  await กล่อง.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }).click();
  const ถาม = await กดตกลงในกล่องยืนยัน(page);
  expect(ถาม, "กล่องยืนยันบอกว่าส่งแล้วแก้ไม่ได้").toContain("แก้ไม่ได้");

  // ไม่ถึงฐาน = แนบข้อความแจ้งเตือนบนจอไว้ในผล (รอบปิดด่าน 3 ตกครั้งแรกแล้วไม่มีหลักฐานว่าคำขอพลาดเพราะอะไร · 15 ต.ค. 69)
  //   กติกาหน้าจอ "ส่งแล้วเฉพาะเมื่อฐานยืนยัน · พลาดต้องบอกและกดใหม่ได้" ล็อกแยกไว้ใน hq-quote-send-failure.spec.ts
  await expect.poll(async () => (await ใบในฐาน())?.status, { timeout: 15_000 }).toBe("sent").catch(async (e: Error) => {
    const บนจอ = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => [] as string[]);
    throw new Error(`${e.message}
ข้อความบนจอตอนนั้น: ${JSON.stringify(บนจอ)}`);
  });
  expect(await สถานะคำขอ(), "คำขอ = ส่งใบแล้ว").toBe("quoted");
  expect(await สถานะลูกค้าเป้าหมาย(), "ลูกค้าเป้าหมายคงเดิม").toBe("HQ_PRICING");

  // เปิดดูซ้ำ: อ่านอย่างเดียว
  await page.keyboard.press("Escape");
  await expect(page.locator("tbody tr").filter({ hasText: COMPANY }).first().getByText("ส่งใบแล้ว", { exact: true })).toBeVisible({ timeout: 15_000 });
  กล่อง = await เปิดใบHQ(page);
  await expect(กล่อง.getByText(/ใบนี้แก้ไม่ได้/)).toBeVisible();
  await expect(กล่อง.getByLabel("ชื่อรายการ 1"), "ส่งแล้วไม่มีช่องแก้").toHaveCount(0);
  await expect(กล่อง.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" })).toHaveCount(0);

  // ฝั่งดีลเลอร์: ป้าย + ใบ HQ
  const row = await เปิดแผงดีลเลอร์(page);
  await expect(row.getByText("รอราคา HQ").first(), "ขั้นของลูกค้าเป้าหมายคงเดิม").toBeVisible();
  await expect(row.locator("[data-badge='hq-quoted']"), "มีป้ายได้ราคาแล้ว").toHaveText("ได้ราคาแล้ว", { timeout: 20_000 });
  await row.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  const ใบ = page.locator("[data-panel='hq-quote']");
  await expect(ใบ, "ดีลเลอร์เห็นใบ HQ ที่ส่งแล้ว").toBeVisible({ timeout: 20_000 });
  await expect(ใบ.getByTestId("dealer-hq-quote-total")).toHaveText(บาท(คาด));
  await expect(ใบ.getByText("ค่าขนส่ง")).toBeVisible();
  assertNoErrors(errs, "ส่งใบ HQ และป้ายได้ราคาแล้ว");
});
