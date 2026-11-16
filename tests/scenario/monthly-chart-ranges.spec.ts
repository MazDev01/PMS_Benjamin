import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, ตั้งช่วงเอง } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, กรองหน้าHQด้วยสาขา, type สาขาของข้อ } from "./ownDealer";

// ── กราฟรายเดือนทุกใบ: ทุกเดือนตามช่วงเวลาด้านบน · ไม่มีปุ่มของกราฟ (บอสสั่ง 13 พ.ย. 69) ──────────────────────────
//   ตรวจกลับด้าน: ทับ 11 พ.ย. 69 "ทุกกราฟรายเดือนมีปุ่มของตัวเอง 3/6/9 เดือน/1 ปี · ไม่ขึ้นกับช่วงหน้า" (เดิมข้อนี้ตรวจปุ่ม 4 ปุ่ม + ค่าเริ่ม 1 ปี)
//   1) ทั้ง 7 กราฟอยู่บนหน้าที่มีตัวเลือกช่วงเวลาด้านบน → ไม่มีปุ่ม 3/6/9 เดือน/1 ปี · ไม่มีข้อความกำกับใต้ชื่อ (12 พ.ย. 69)
//   2) ตั้งช่วงด้านบน 12 เดือน / 3 เดือน / วันนี้วันเดียว → ช่องกราฟ = ทุกเดือนที่ช่วงแตะ (12 · 3 · 1) ป้ายครบ เรียงถึงเดือนนี้
//      ช่วงสั้นกว่าเดือน = เดือนที่ช่วงแตะ ไม่เปลี่ยนเป็นรายวัน (ef เลือก 13 พ.ย. 69)
//   3) แกนตั้งเลขกลม: ขีดห่างเท่ากันทีละ 1 · 2 · 5 × 10ⁿ (0 · 5 · 10 … ไม่ใช่ 13 · 25 · 38)
//   4) ลูกค้าเป้าหมาย/ใบเสนอราคา HQ: รวมกราฟ = นับเฉพาะในช่วงด้านบน (ข้อมูลชุดเดียวกับการ์ด) · ตัวกรองระดับ/ดีลเลอร์ยังมีผล
//   5) ยอดขายรายเดือนดีลเลอร์มียอดจริง — ตกบนโค้ดเดิม: ตัวแปลงวันที่เสีย (dbf5e33d) ยอดทุกเดือนเป็น 0
// กราฟ 7 ใบ: HQ หน้าหลัก (แนวโน้มยอดขาย · ลูกค้าเป้าหมายใหม่/ใบ/ปิดการขาย · เป้าเทียบยอดจริง) · HQ ลูกค้าเป้าหมาย (รายเดือน)
//   · HQ ใบเสนอราคา (ใบที่ส่ง เทียบ ตอบรับ) · ดีลเลอร์หน้าหลัก (ลูกค้าเป้าหมาย เทียบ ที่ออกใบ · ยอดขายรายเดือน)
// ข้อมูลของข้อ (สาขาของข้อ เป้าปี 120 ล้าน): ทุกเดือนย้อนหลัง 12 เดือน (วันที่ 1) ลูกค้าเป้าหมาย 1 ราย + ใบตอบรับ 1 ใบ (1 ล้าน)
//   เดือนนี้ (วันนี้): ลูกค้าเป้าหมาย 13 ราย · ใบส่งเพิ่ม 12 ใบ · ใบตอบรับ 46 ล้าน
// ตกบนโค้ดเดิม: กราฟมีปุ่ม 4 ปุ่ม · ช่องเป็น 12 เดือนเสมอไม่ตามช่วงด้านบน · ยอดขายรายเดือนดีลเลอร์เป็น 0
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(300_000);

const เดือนไทย = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const [ปีนี้, เดือนนี้] = [Number(วันนี้.slice(0, 4)), Number(วันนี้.slice(5, 7)) - 1];
/** เดือนย้อนหลัง k เดือน (0 = เดือนนี้) → { iso วันที่ 1, ป้าย } */
const เดือนย้อน = (k: number) => {
  const d = new Date(Date.UTC(ปีนี้, เดือนนี้ - k, 1));
  return { iso: d.toISOString().slice(0, 10), ป้าย: `${เดือนไทย[d.getUTCMonth()]} ${String(d.getUTCFullYear() + 543).slice(-2)}` };
};
/** ป้ายที่ต้องเห็นเมื่อเลือก n เดือน (เก่า → ใหม่ ถึงเดือนนี้) */
const ป้ายที่ควร = (n: number) => Array.from({ length: n }, (_, i) => เดือนย้อน(n - 1 - i).ป้าย);

let สาขา: สาขาของข้อ | null = null;
const เลข = 1_710_000_000 + Math.floor(Math.random() * 400_000) * 100;
const ป้ายข้อ = `ZZMRANGE${String(Date.now() % 100_000).padStart(5, "0")}`;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ เป้า: 120_000_000, ชื่อ: `ZZTEST ดีลเลอร์กราฟรายเดือน ${ป้ายข้อ.slice(-5)}` });
  const c = สาขา.รหัส;
  const ลูกค้า = เลข;
  const ลีด: string[] = [], ใบ: string[] = [], วันตอบรับ: string[] = [];
  // วันที่เข้ามาแบบที่ระบบเก็บ (created_label "13 พ.ย. 2569") — หน้าหลักดีลเลอร์ลงเดือนตามวันนี้ (ไม่มี = ไม่ลงเดือนไหน · ไม่สังเคราะห์วัน)
  const ป้ายวันไทย = (iso: string) => `${Number(iso.slice(8, 10))} ${เดือนไทย[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(0, 4)) + 543}`;
  let n = 0;
  for (let k = 0; k < 12; k++) {
    const วัน = k === 0 ? วันนี้ : เดือนย้อน(k).iso;
    const จำนวนลีด = k === 0 ? 13 : 1;
    for (let j = 0; j < จำนวนลีด; j++, n++)
      ลีด.push(`('#L-${เลข + n}', ${เลข + n}, '${c}', '${ป้ายข้อ} บจก.ทดสอบ ${n}', 'ZZTEST ผู้ติดต่อ', '000-000-${String(n).padStart(4, "0")}', 'ตราด', 'Facebook', 'WAITING', null, '${วัน}', '${ป้ายวันไทย(วัน)}', '${วัน}')`);
    const เลขใบ = `Q-${c}-W${k}`;
    ใบ.push(`('${c}', '${เลขใบ}', 'ZZTEST ลูกค้า', 'ZZTEST', 'won', ${k === 0 ? 46_000_000 : 1_000_000}, '${วัน}', '${วัน}T12:00:00+07:00', ${ลูกค้า})`);
    วันตอบรับ.push(`('${c}', '${เลขใบ}', '${วัน}T12:00:00+07:00')`);
  }
  const ใบส่ง = Array.from({ length: 12 }, (_, j) => `('${c}', 'Q-${c}-S${j}', 'ZZTEST ลูกค้า', 'ZZTEST', 'sent_to_client', 100000, '${วันนี้}')`);
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province) values (${ลูกค้า}, '${c}', 'ZZTEST ลูกค้าตอบรับ', 'ZZTEST ลูกค้าตอบรับ', 'ตราด');
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, source, status, lost_reason, created_date, created_label, last_contact_at) values ${ลีด.join(", ")};
    insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, won_at, customer_id) values ${ใบ.join(", ")};
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ${วันตอบรับ.join(", ")};
    insert into public.quotations (dealer_code, id, customer, project, status, total_value, date) values ${ใบส่ง.join(", ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  if (!สาขา) return;   // ไม่ใช่การข้าม: ตัวล้างข้อมูลหลังจบ — สร้างสาขาไม่สำเร็จ = ไม่มีอะไรให้ล้าง (ข้อทดสอบตกไปแล้วที่ beforeAll)
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.quotation_won_at where dealer_code = '${สาขา.รหัส}';
    delete from public.quotations where dealer_code = '${สาขา.รหัส}';
    delete from public.leads where dealer_code = '${สาขา.รหัส}';
    delete from public.customers where dealer_code = '${สาขา.รหัส}';
    set local session_replication_role = origin;`);
  await สาขา.ลบ();
});

/** ขีดแกนตั้งกลม: ห่างเท่ากัน และระยะห่าง = 1 · 2 · 5 × 10ⁿ · เริ่มที่ 0 */
function ตรวจขีดกลม(ขีด: number[], ที่: string) {
  expect(ขีด.length, `${ที่}: มีขีดแกนตั้ง`).toBeGreaterThanOrEqual(2);
  expect(ขีด[0], `${ที่}: ขีดแรก = 0`).toBe(0);
  const ห่าง = ขีด[1] - ขีด[0];
  for (let i = 1; i < ขีด.length; i++)
    expect(Math.abs(ขีด[i] - ขีด[i - 1] - ห่าง), `${ที่}: ขีดห่างเท่ากัน ${JSON.stringify(ขีด)}`).toBeLessThan(1e-6);
  const ฐาน = Math.pow(10, Math.floor(Math.log10(ห่าง) + 1e-9));
  const ตัวคูณ = Math.round((ห่าง / ฐาน) * 1e6) / 1e6;
  expect([1, 2, 5], `${ที่}: ระยะขีด ${ห่าง} ต้องเป็น 1 · 2 · 5 × 10ⁿ (${JSON.stringify(ขีด)})`).toContain(ตัวคูณ);
}

/** หัวกราฟ: ชื่ออย่างเดียว (+ ลิงก์มุมขวา) · ไม่มีปุ่ม 3/6/9 เดือน/1 ปี · ไม่มีข้อความกำกับใต้ชื่อ (บอสสั่ง 12–13 พ.ย. 69)
 *  ตกบนโค้ดเดิม: มีแถวปุ่ม [data-month-range-row] และปุ่ม [data-month-range] 4 ปุ่ม */
async function ตรวจหัวกราฟ(การ์ด: Locator, ชื่อ: string) {
  const หัว = การ์ด.locator("[data-month-chart-head]");
  await expect(หัว, `${ชื่อ}: หัวกราฟตัวกลาง`).toHaveCount(1, { timeout: 30_000 });
  await expect(การ์ด.locator("[data-subtitle]"), `${ชื่อ}: ไม่มีข้อความกำกับใต้ชื่อกราฟ`).toHaveCount(0);
  await expect(การ์ด.locator("[data-month-range]"), `${ชื่อ}: ไม่มีปุ่ม 3/6/9 เดือน/1 ปี (หน้ามีตัวเลือกช่วงด้านบน)`).toHaveCount(0);
  await expect(หัว.locator("[data-month-range-row]"), `${ชื่อ}: ไม่มีแถวปุ่มใต้ชื่อ`).toHaveCount(0);
  // ข้อความในหัวที่ไม่ใช่ ชื่อ · ลิงก์มุมขวา (เช่น "ดูทั้งหมด") = ข้อความกำกับ
  const นอก = await หัว.evaluate(h => [...h.querySelectorAll("*")].filter(e => !e.closest("[data-title]") && !e.closest("a, button"))
    .flatMap(e => [...e.childNodes].filter(n => n.nodeType === 3 && (n.textContent ?? "").trim()).map(n => (n.textContent ?? "").trim())));
  expect(นอก, `${ชื่อ}: หัวกราฟมีแต่ชื่อ (ไม่มีข้อความกำกับ)`).toEqual([]);
}

/** ตรวจกราฟหนึ่งใบ: หัวกราฟ · ป้ายเดือนครบตามช่วงด้านบน · ป้ายมองเห็นทุกตัว · ขีดกลม */
async function ตรวจกราฟ(การ์ด: Locator, ชื่อ: string, n: number) {
  await ตรวจหัวกราฟ(การ์ด, ชื่อ);
  const ป้าย = () => การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.map(e => e.getAttribute("data-x-label") ?? ""));
  await expect.poll(ป้าย, { timeout: 30_000, message: `${ชื่อ} ช่วง ${n} เดือน: ป้ายเดือนครบ ${n} ช่อง ถึงเดือนนี้` }).toEqual(ป้ายที่ควร(n));
  const มองเห็น = await การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.filter(e => e.getBoundingClientRect().width > 0).length);
  expect(มองเห็น, `${ชื่อ} ช่วง ${n} เดือน: ป้ายมองเห็นทุกตัว`).toBe(n);
  const ขีด = await การ์ด.locator("svg [data-y-tick]").evaluateAll(els => els.map(e => Number(e.getAttribute("data-y-tick"))));
  ตรวจขีดกลม(ขีด, `${ชื่อ} ช่วง ${n} เดือน`);
}

/** ช่วงด้านบนที่ตรวจ: 12 เดือน (วันที่ 1 ของ 11 เดือนก่อน → วันนี้) · 3 เดือน · วันนี้วันเดียว (= เดือนนี้ 1 ช่อง) */
const ช่วงที่ตรวจ = [{ n: 12, ต้น: เดือนย้อน(11).iso }, { n: 3, ต้น: เดือนย้อน(2).iso }, { n: 1, ต้น: วันนี้ }] as const;
async function ตั้งช่วงหน้า(page: Page, ต้น: string) {
  await ตั้งช่วงเอง(page, ต้น, วันนี้);
  await settle(page);
}

test("[ui·hq] หน้าหลัก HQ: กราฟรายเดือน 3 ใบ ไม่มีปุ่ม · ช่องตามช่วงด้านบน · ป้ายครบ · ขีดกลม", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  await settle(page);
  await กรองหน้าHQด้วยสาขา(page, สาขา!.รหัส);
  for (const { n, ต้น } of ช่วงที่ตรวจ) {
    await ตั้งช่วงหน้า(page, ต้น);
    await expect(page.locator("[data-card='trend']"), `ช่วง ${n} เดือน: แนวโน้มยอดขายเป็นรายเดือน`).toContainText("รายเดือน", { timeout: 30_000 });
    await ตรวจกราฟ(page.locator("[data-card='trend']"), "แนวโน้มยอดขาย", n);
    await ตรวจกราฟ(page.locator("[data-card='bars']"), "ลูกค้าเป้าหมายใหม่ · ใบ · ปิดการขาย", n);
    await ตรวจกราฟ(page.locator("[data-card='target']"), "เป้าเทียบยอดจริง", n);
  }
  assertNoErrors(errs, "หน้าหลัก HQ กราฟรายเดือน");
});

test("[ui·hq] ลูกค้าเป้าหมายทั้งเครือ + ใบเสนอราคาทั้งเครือ: กราฟรายเดือนไม่มีปุ่ม · นับตามช่วงด้านบน", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  // ผลรวมที่ควร (สาขาของข้อ): 12 เดือน = 13 + 11 · 3 เดือน = 13 + 2 · วันนี้ = 13
  const ลูกค้าเป้าหมาย: Record<number, string> = { 12: "24", 3: "15", 1: "13" };
  await loginUI(page, HQ_ORIGIN, `/hq/leads?dealer=${สาขา!.รหัส}`, ADMIN);
  await settle(page);
  for (const { n, ต้น } of ช่วงที่ตรวจ) {
    await ตั้งช่วงหน้า(page, ต้น);
    await ตรวจกราฟ(page.locator(".card").filter({ has: page.locator("[data-lead-monthly]") }), "ลูกค้าเป้าหมายใหม่รายเดือน", n);
    await expect(page.locator("[data-lead-monthly][data-ready='1']"), `ช่วง ${n} เดือน: รวมกราฟ = ลูกค้าเป้าหมายของสาขาของข้อในช่วงด้านบน`)
      .toHaveAttribute("data-sum-new", ลูกค้าเป้าหมาย[n], { timeout: 30_000 });
  }

  // ใบที่ส่ง = ใบตอบรับ (เดือนละ 1 ใบ) + ใบส่งเพิ่ม 12 ใบวันนี้ · ตอบรับ = เดือนละ 1 ใบ
  const ใบ: Record<number, string[]> = { 12: ["24", "12"], 3: ["15", "3"], 1: ["13", "1"] };
  await page.goto(`${HQ_ORIGIN}/hq/quotations?dealer=${สาขา!.รหัส}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const กราฟใบ = page.locator('[data-chart="quote-monthly"]');
  for (const { n, ต้น } of ช่วงที่ตรวจ) {
    await ตั้งช่วงหน้า(page, ต้น);
    await ตรวจกราฟ(กราฟใบ, "ใบที่ส่ง เทียบ ตอบรับ", n);
    await expect.poll(async () => [await กราฟใบ.getAttribute("data-sum-sent"), await กราฟใบ.getAttribute("data-sum-won")],
      { timeout: 30_000, message: `ช่วง ${n} เดือน: กราฟใบนับตามช่วงด้านบน` }).toEqual(ใบ[n]);
  }
  assertNoErrors(errs, "HQ ลูกค้าเป้าหมาย/ใบเสนอราคา กราฟรายเดือน");
});

test("[ui·dealer] หน้าหลักดีลเลอร์: กราฟรายเดือน 2 ใบ ไม่มีปุ่ม · ช่องตามช่วงด้านบน · ยอดขายมียอดจริง", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginUI(page, DEALER_ORIGIN, "/dashboard", สาขา!.บัญชี);
  await settle(page);
  const ยอด = page.locator(".card").filter({ hasText: "ยอดขายรายเดือน" }).first();
  for (const { n, ต้น } of ช่วงที่ตรวจ) {
    await ตั้งช่วงหน้า(page, ต้น);
    // ยอดขายเดือนนี้ 46 ล้าน → แกนตั้งต้องถึง 46 (ตกบนโค้ดเดิม: ตัวแปลงวันที่เสีย ยอดทุกเดือนเป็น 0 แกนไม่ถึง)
    await expect.poll(() => ยอด.locator("svg [data-y-tick]").evaluateAll(els => Math.max(0, ...els.map(e => Number(e.getAttribute("data-y-tick"))))),
      { timeout: 30_000, message: `ช่วง ${n} เดือน: ยอดขายรายเดือนมียอดจริง (เดือนนี้ 46 ล้าน)` }).toBeGreaterThanOrEqual(46);
    await ตรวจกราฟ(page.locator(".card").filter({ hasText: "ลูกค้าเป้าหมาย เทียบ ที่ออกใบเสนอราคาแล้ว" }).first(), "ลูกค้าเป้าหมาย เทียบ ที่ออกใบ", n);
    await expect(ยอด.locator("[data-title]").first(), "หัวข้อเป็นรายเดือน").toHaveText("ยอดขายรายเดือน");
    await ตรวจกราฟ(ยอด, "ยอดขายรายเดือน", n);
  }
  assertNoErrors(errs, "หน้าหลักดีลเลอร์ กราฟรายเดือน");
});
