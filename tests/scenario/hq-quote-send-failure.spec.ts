import { test, expect, type Page } from "@playwright/test";
import { รันSQLในฐาน } from "./localDb";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";

// ── HQ ส่งใบ HQ: หน้าจอบอก "ส่งแล้ว" ได้เฉพาะเมื่อฐานยืนยันแล้ว (บอสสั่ง 15 ต.ค. 69) ───────────────────────────────
//
// ที่มา: hq-quote-flow:120 ไม่นิ่งในรอบปิดด่าน 3 — กดส่งแล้ว 15 วินาที ใบในฐานยังเป็นร่าง และรอบรันซ้ำเริ่มจากร่าง
//   = ครั้งแรกคำสั่งส่งไม่ถึงฐานเลย (ไม่ใช่แค่หน้าจอช้า) · รันแยกทำให้เกิดซ้ำไม่ได้
// กติกา:
//   - คำขอส่งล้มเหลว/ถูกตัด → ขึ้นข้อผิดพลาด · ไม่มีข้อความ "ส่งแล้ว" · ใบยังเป็นร่าง และกดส่งใหม่ได้ (ส่งซ้ำแล้วฐานเป็น sent)
//   - คำขอส่งช้า → ระหว่างรอ หน้าจอยังไม่บอกว่าส่งแล้ว และกดส่งซ้ำไม่ได้ · ฐานยืนยันแล้วจึงบอกว่าส่งแล้ว
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

const admin = adminClient();
const แท็ก = Date.now() % 100000;
const COMPANY = `ZZTEST-ส่งใบHQพลาด-${แท็ก}`;
let leadNum = 0;
let requestId = 0;

function ล้างที่ฐาน() {
  const sql = `alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    delete from public.quote_requests where dealer_code = 'RYG' and lead_num_id = ${leadNum};
    delete from public.leads where dealer_code = 'RYG' and num_id = ${leadNum};`;
  if (leadNum) รันSQLในฐาน(sql);
}

test.beforeAll(async () => {
  leadNum = 978_000_000 + แท็ก;
  const ryg = await db(RYG);
  const r = await ryg.from("leads").insert({
    id: `#L-${leadNum}`, num_id: leadNum, dealer_code: "RYG", company: COMPANY, name: COMPANY, contact: "ผู้ทดสอบ",
    phone: "081-778-0002", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET",
  });
  if (r.error) throw new Error(r.error.message);
  const q = await ryg.rpc("quote_request_submit", { p_lead_num_id: leadNum, p_product: "โกดังสำเร็จรูป", p_area: 100 });
  if (q.error) throw new Error(q.error.message);
  requestId = Number((q.data as { id: number }).id);
  // ร่างใบ HQ ที่ฐาน (ขั้น 5 มีข้อทดสอบหน้าจอใน hq-quote-flow แล้ว) — ข้อนี้ทดสอบเฉพาะการส่ง
  const hq = await db(ADMIN);
  const s = await hq.rpc("hq_quote_save", { p_request_id: requestId,
    p_lines: [{ name: "โกดังสำเร็จรูป", qty: 100, unit: "ตร.ม.", unitCost: 5_000 }],
    p_valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), p_note: "" });
  if (s.error) throw new Error(s.error.message);
});
test.afterAll(ล้างที่ฐาน);

const สถานะใบในฐาน = async () => (await admin.from("hq_quotes").select("status").eq("request_id", requestId).maybeSingle()).data?.status;
const เป็นคำขอส่ง = (body: string | null) => /"op"\s*:\s*"send-hq"/.test(body ?? "");

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
  return { กล่อง, row };
}
/** ข้อความที่บอกผู้ใช้ว่าส่งแล้ว — ต้องไม่มีจนกว่าฐานยืนยัน */
const บอกว่าส่งแล้ว = (page: Page) => page.getByText(/ส่งใบ HQ-[\d-]+V\d+ ให้ดีลเลอร์แล้ว/);

test("[flow·hq] ส่งใบ HQ แล้วคำขอล้มเหลว/ถูกตัด → ขึ้นข้อผิดพลาด ไม่บอกว่าส่งแล้ว ใบยังเป็นร่าง และกดส่งใหม่ได้", async ({ page }) => {
  const { กล่อง } = await เปิดใบHQ(page);
  let ตัด = 0;
  await page.route("**/api/v1/quote-requests**", route => {
    if (route.request().method() === "POST" && เป็นคำขอส่ง(route.request().postData())) { ตัด++; return route.abort("failed"); }
    return route.continue();
  });
  const ปุ่มส่ง = กล่อง.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" });
  await ปุ่มส่ง.click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(() => ตัด, { message: "คำขอส่งต้องออกไป (แล้วถูกตัด)" }).toBe(1);

  await expect(page.getByText(/ส่งไม่สำเร็จ|ไม่สำเร็จ|เชื่อมต่อ|ผิดพลาด|ลองใหม่/).first(), "ต้องขึ้นข้อผิดพลาดให้ผู้ใช้เห็น").toBeVisible({ timeout: 10_000 });
  await expect(บอกว่าส่งแล้ว(page), "ส่งไม่ถึงฐาน ต้องไม่บอกว่าส่งแล้ว").toHaveCount(0);
  expect(await สถานะใบในฐาน(), "ใบในฐานต้องยังเป็นร่าง").toBe("draft");
  await expect(กล่อง.getByText(/ใบนี้แก้ไม่ได้/), "หน้าต่างต้องไม่กลายเป็นใบที่ส่งแล้ว").toHaveCount(0);

  // กดส่งใหม่ได้ และครั้งนี้ถึงฐาน
  await page.unroute("**/api/v1/quote-requests**");
  await expect(ปุ่มส่ง, "ใบยังเป็นร่าง ต้องกดส่งใหม่ได้").toBeEnabled({ timeout: 10_000 });
  await ปุ่มส่ง.click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(สถานะใบในฐาน, { timeout: 15_000, message: "ส่งใหม่แล้วฐานต้องเป็น sent" }).toBe("sent");
  await expect(บอกว่าส่งแล้ว(page)).toBeVisible({ timeout: 10_000 });
});

test("[flow·hq] ส่งใบ HQ แล้วคำขอช้า → ระหว่างรอไม่บอกว่าส่งแล้ว และกดส่งซ้ำไม่ได้", async ({ page }) => {
  // ใบของข้อก่อนส่งไปแล้ว → เตรียมคำขอเวอร์ชันใหม่ (ขอแก้ราคา) ให้มีร่างใหม่ให้ส่ง
  test.skip(await สถานะใบในฐาน() !== "sent", "ข้อก่อนหน้าไม่ผ่าน");
  const ryg = await db(RYG);
  const แก้ = await ryg.rpc("quote_request_reprice", { p_id: requestId, p_reason: "ทดสอบส่งช้า" });
  if (แก้.error) throw new Error(แก้.error.message);
  requestId = Number((แก้.data as { id: number }).id);
  const hq = await db(ADMIN);
  const s = await hq.rpc("hq_quote_save", { p_request_id: requestId,
    p_lines: [{ name: "โกดังสำเร็จรูป", qty: 100, unit: "ตร.ม.", unitCost: 4_800 }],
    p_valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), p_note: "" });
  if (s.error) throw new Error(s.error.message);

  const { กล่อง } = await เปิดใบHQ(page);
  let ปล่อย: () => void = () => {};
  const รอปล่อย = new Promise<void>(r => { ปล่อย = r; });
  let ส่ง = 0;
  await page.route("**/api/v1/quote-requests**", async route => {
    if (route.request().method() === "POST" && เป็นคำขอส่ง(route.request().postData())) { ส่ง++; await รอปล่อย; }
    return route.continue();
  });
  const ปุ่มส่ง = กล่อง.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" });
  await ปุ่มส่ง.click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(() => ส่ง, { message: "คำขอส่งต้องออกไป (แล้วค้างอยู่)" }).toBe(1);

  await page.waitForTimeout(1_500);   // ช่วงที่คำขอค้าง (ตั้งใจจำลองความช้า — ไม่ใช่รอให้ระบบทัน)
  await expect(บอกว่าส่งแล้ว(page), "ฐานยังไม่ยืนยัน ต้องไม่บอกว่าส่งแล้ว").toHaveCount(0);
  await expect(ปุ่มส่ง, "ระหว่างรอ ต้องกดส่งซ้ำไม่ได้").toBeDisabled();
  expect(await สถานะใบในฐาน(), "ระหว่างรอ ใบในฐานยังเป็นร่าง").toBe("draft");

  ปล่อย();
  await expect.poll(สถานะใบในฐาน, { timeout: 15_000 }).toBe("sent");
  await expect(บอกว่าส่งแล้ว(page), "ฐานยืนยันแล้ว จึงบอกว่าส่งแล้ว").toBeVisible({ timeout: 10_000 });
  expect(ส่ง, "ส่งครั้งเดียว").toBe(1);
});
