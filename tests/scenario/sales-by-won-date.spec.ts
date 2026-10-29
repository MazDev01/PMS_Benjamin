import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";

// ── หน้าจอนับยอดขายตามวันที่ลูกค้าตอบรับ (บอสตัดสิน 29 ต.ค. 69 · ใบ 0260 + 0262) ─────────────────────────────────────
//   ข้อมูลตั้งต้นของข้อนี้ (สาขาทดสอบ ZTSWD · จังหวัดพังงา ไม่มีข้อไหนใช้):
//     ใบ A ออกใบ "เดือนก่อนหน้าเดือนที่แล้ว" · ลูกค้าตอบรับ "เดือนที่แล้ว"
//     ใบ B ออกใบ ธ.ค. ปีก่อน · ลูกค้าตอบรับ ม.ค. ปีนี้ (ตัวอย่างที่สองของบอส)
//   1) แดชบอร์ดดีลเลอร์: ยอดขายสะสมทั้งปี = A + B (ปีที่ตอบรับ) — ถ้านับตามวันออกใบจะได้ A อย่างเดียว
//   2) ภาพรวมยอดขาย HQ: การ์ดยอดขาย ช่วง "เดือนที่แล้ว" นับใบ A · ช่วง "เดือนที่ออกใบ" ไม่นับใบ A
//      (เทียบกับยอดทั้งเครือที่ฐานคิดด้วยฟังก์ชันกลาง _kpi_won ในช่วงเดียวกัน — ใบของข้ออื่นที่ตอบรับวันนี้ไม่ตกในช่วงอดีต)
//   ตกบนโค้ดก่อนใบ 0260/0262: ใบไม่มีเวลาตอบรับ · การ์ดนับตามวันออกใบ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const CODE = "ZTSWD";
const ยอดA = 1_234_000, ยอดB = 567_000;
const ไทย = new Date(Date.now() + 7 * 3600_000);
const ปี = ไทย.getUTCFullYear(), เดือน = ไทย.getUTCMonth();   // 0–11
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);   // m ล้นได้ (Date.UTC ปรับปี/เดือนให้)
const ต้นเดือน = (k: number) => iso(ปี, เดือน - k, 1), ท้ายเดือน = (k: number) => iso(ปี, เดือน - k + 1, 0);
const ออกA = iso(ปี, เดือน - 2, 10), ตอบรับA = iso(ปี, เดือน - 1, 15);
const ออกB = iso(ปี - 1, 11, 20), ตอบรับB = iso(ปี, 0, 10);
// ใบ B ใช้ได้เมื่อ ม.ค. 10 ปีนี้ผ่านไปแล้วและไม่ทับเดือนของใบ A (ต้นปี = ข้ามเฉพาะส่วนของใบ B)
const ใช้B = ตอบรับB < ต้นเดือน(1);
let บัญชี: บัญชีสาขาของชุด;

test.beforeAll(async () => {
  บัญชี = await สร้างสาขาของชุด(CODE, "พังงา");
  const ใบ = (id: string, ออก: string, ตอบรับ: string, ยอด: number) =>
    `insert into public.quotations (id, dealer_code, customer, status, total_value, date, customer_id, won_at)
       values ('${id}', '${CODE}', 'ZZTEST ลูกค้ายอดตามวันตอบรับ', 'won', ${ยอด}, '${ออก}', 990951, '${ตอบรับ} 12:00:00+07');
     insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ('${CODE}', '${id}', '${ตอบรับ} 12:00:00+07');`;
  // วางที่ฐานตรง (ปิดตัวดัก) — ใบตอบรับย้อนเวลาสร้างผ่านหน้าจอไม่ได้ · ข้อนี้วัดการนับ ไม่ใช่ทางตอบรับ
  // การ์ดเป้าหมายแสดงยอดสะสมทั้งปีเฉพาะสาขาที่ตั้งเป้าแล้ว (ไม่มีเป้า = "ยังไม่ได้ตั้งเป้า")
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    update public.dealers set revenue_target = 12000000 where code = '${CODE}';
    insert into public.customers (id, dealer_code, name, company, province, join_date) values (990951, '${CODE}', 'ZZTEST ลูกค้ายอดตามวันตอบรับ', 'ZZTEST ลูกค้ายอดตามวันตอบรับ', 'พังงา', '${iso(ปี - 1, 11, 1)}');
    ${ใบ(`${CODE}-A`, ออกA, ตอบรับA, ยอดA)}
    ${ใช้B ? ใบ(`${CODE}-B`, ออกB, ตอบรับB, ยอดB) : ""}
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางใบตอบรับย้อนเวลาไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.quotation_won_at where dealer_code = '${CODE}';
    delete from public.quotations where dealer_code = '${CODE}';
    delete from public.customers where dealer_code = '${CODE}';
    set local session_replication_role = origin;`);
  expect(await ลบสาขาของชุด(CODE), `เก็บกวาดสาขา ${CODE}`).toEqual([]);
});

const ตัวเลข = (s: string | null | undefined) => Number((s ?? "").replace(/[^\d.]/g, "")) || 0;
/** ยอดขายทั้งเครือในช่วง ที่ฐานคิดด้วยฟังก์ชันกลาง (ตัวเดียวกับการ์ด) */
const ยอดฐาน = (ต้น: string, ท้าย: string) =>
  ตัวเลข(รันSQLในฐาน(`select coalesce(sum(value), 0) from public._kpi_won(null) where d between '${ต้น}' and '${ท้าย}';`)?.trim());

async function ตั้งช่วง(page: Page, ต้น: string, ท้าย: string) {
  const ปุ่มเวลา = page.locator("button").filter({ hasText: /25\d\d|ปีนี้|วันนี้|เดือนนี้|ทุกช่วงเวลา|7 วัน/ }).first();
  await ปุ่มเวลา.click();
  await page.getByRole("button", { name: "กำหนดช่วงเอง" }).click();
  await page.getByLabel("วันเริ่มต้นของช่วงที่กำหนดเอง").fill(ต้น);
  await page.getByLabel("วันสิ้นสุดของช่วงที่กำหนดเอง").fill(ท้าย);
  await page.getByRole("button", { name: "ใช้ช่วงเวลานี้" }).click();
  await settle(page);
}

test("[ux·dealer] แดชบอร์ดดีลเลอร์: ยอดขายสะสมทั้งปีนับตามปีที่ลูกค้าตอบรับ (ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. = ปีนี้)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", บัญชี);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const การ์ด = page.locator('[data-kpi="target"]');
  const ควร = ยอดA + (ใช้B ? ยอดB : 0);
  await expect.poll(async () => ตัวเลข((await การ์ด.innerText()).match(/ยอดขายสะสมทั้งปี\s*฿?([\d,]+)/)?.[1]), {
    timeout: 30_000, message: `ยอดขายสะสมทั้งปี = ใบที่ลูกค้าตอบรับปีนี้ (${ควร.toLocaleString()})` }).toBe(ควร);
});

test("[ux·hq] ภาพรวมยอดขาย: การ์ดยอดขายนับใบเข้าเดือนที่ลูกค้าตอบรับ ไม่ใช่เดือนที่ออกใบ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ค่าการ์ด = () => page.locator('[data-kpi="sales"] [data-value]').first().getAttribute("data-value").then(v => Number(v ?? NaN));

  // เดือนที่แล้ว = เดือนที่ใบ A ตอบรับ → การ์ดต้องรวมใบ A
  await ตั้งช่วง(page, ต้นเดือน(1), ท้ายเดือน(1));
  const ฐานเดือนตอบรับ = ยอดฐาน(ต้นเดือน(1), ท้ายเดือน(1));
  expect(ฐานเดือนตอบรับ, "ตั้งต้น: ยอดเดือนที่ตอบรับมีใบ A").toBeGreaterThanOrEqual(ยอดA);
  await expect.poll(ค่าการ์ด, { timeout: 30_000, message: "ช่วงเดือนที่ตอบรับ: การ์ด = ยอดที่ฐานคิดตามวันตอบรับ (รวมใบ A)" }).toBe(ฐานเดือนตอบรับ);

  // เดือนที่ออกใบ A → การ์ดต้องไม่รวมใบ A (ถ้านับตามวันออกใบ ยอดเดือนนี้จะมีใบ A)
  await ตั้งช่วง(page, ต้นเดือน(2), ท้ายเดือน(2));
  const ฐานเดือนออกใบ = ยอดฐาน(ต้นเดือน(2), ท้ายเดือน(2));
  const รวมถ้านับวันออกใบ = ตัวเลข(รันSQLในฐาน(`select coalesce(sum(total_value), 0) from public.quotations where dealer_code = '${CODE}' and status = 'won' and date between '${ต้นเดือน(2)}' and '${ท้ายเดือน(2)}';`)?.trim());
  expect(รวมถ้านับวันออกใบ, "ตั้งต้น: ใบ A ออกในเดือนนี้").toBe(ยอดA);
  await expect.poll(ค่าการ์ด, { timeout: 30_000, message: "ช่วงเดือนที่ออกใบ: การ์ด = ยอดที่ฐานคิดตามวันตอบรับ (ไม่รวมใบ A)" }).toBe(ฐานเดือนออกใบ);
  expect(ตัวเลข(รันSQLในฐาน(`select coalesce(sum(value), 0) from public._kpi_won('${CODE}') where d between '${ต้นเดือน(2)}' and '${ท้ายเดือน(2)}';`)?.trim()),
    "ใบ A ไม่ถูกนับในเดือนที่ออกใบ").toBe(0);
});
