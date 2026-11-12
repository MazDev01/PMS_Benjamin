import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, ตั้งช่วงเอง } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, กรองหน้าHQด้วยสาขา, type สาขาของข้อ } from "./ownDealer";

// ── กราฟรายเดือนทุกใบ: ปุ่มของกราฟเอง 3 เดือน · 6 เดือน · 9 เดือน · 1 ปี (บอสสั่ง 11 พ.ย. 69) ──────────────────────────
//   1) ค่าเริ่มต้น 1 ปี และปุ่มที่เลือกเด่นชัด (aria-pressed)
//   2) กดแต่ละปุ่ม → จำนวนช่อง = จำนวนเดือน · ป้ายเดือนครบทุกช่อง ไม่เว้น ("พ.ย. 68" …) เรียงถึงเดือนนี้
//   3) แกนตั้งเลขกลม: ขีดห่างเท่ากันทีละ 1 · 2 · 5 × 10ⁿ (0 · 5 · 10 … ไม่ใช่ 13 · 25 · 38)
//   4) ไม่ขึ้นกับช่วงเวลาของหน้า: ตั้งช่วงหน้าเป็นวันนี้วันเดียวก่อน แล้วกราฟยังเป็นรายเดือนตามปุ่ม
//      (กลุ่ม ข เดิมเดินตามช่วงของหน้า — บอสสั่งทับ · ตัวกรองดีลเลอร์/ระดับยังมีผล → ข้อนี้กรองสาขาของข้อ)
//   5) หัวกราฟ (บอสสั่ง 12 พ.ย. 69): ไม่มีข้อความกำกับใต้ชื่อกราฟ · ปุ่มอยู่ใต้ชื่อ ชิดขวา ทุกกราฟเหมือนกัน (ตัวกลาง หัวกราฟรายเดือน)
// กราฟ 7 ใบ: HQ แดชบอร์ด (แนวโน้มยอดขาย · ลูกค้าเป้าหมายใหม่/ใบ/ปิดการขาย · เป้าเทียบยอดจริง) · HQ ลูกค้าเป้าหมาย (รายเดือน)
//   · HQ ใบเสนอราคา (ใบที่ส่ง เทียบ ตอบรับ) · ดีลเลอร์แดชบอร์ด (ลูกค้าเป้าหมาย เทียบ ที่ออกใบ · ยอดขายรายเดือน)
// ข้อมูลของข้อ (สาขาของข้อ เป้าปี 120 ล้าน): ทุกเดือนย้อนหลัง 12 เดือน ลูกค้าเป้าหมาย 1 ราย + ใบตอบรับ 1 ใบ (1 ล้าน)
//   เดือนนี้: ลูกค้าเป้าหมาย 13 ราย · ใบส่งเพิ่ม 12 ใบ · ใบตอบรับ 46 ล้าน → เพดานแบบเดิมได้ขีด 3.75 · 12.5 · 11.5 (ไม่กลม)
// ตกบนโค้ดเดิม: ไม่มีปุ่ม 9 เดือน · ค่าเริ่มต้น 6 เดือน · กลุ่ม ข ไม่มีปุ่มและเดินตามช่วงหน้า · ป้ายเว้นเดือน · ขีดไม่กลม
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
  let n = 0;
  for (let k = 0; k < 12; k++) {
    const วัน = k === 0 ? วันนี้ : เดือนย้อน(k).iso;
    const จำนวนลีด = k === 0 ? 13 : 1;
    for (let j = 0; j < จำนวนลีด; j++, n++)
      ลีด.push(`('#L-${เลข + n}', ${เลข + n}, '${c}', '${ป้ายข้อ} บจก.ทดสอบ ${n}', 'ZZTEST ผู้ติดต่อ', '000-000-${String(n).padStart(4, "0")}', 'ตราด', 'Facebook', 'WAITING', null, '${วัน}', '${วัน}')`);
    const เลขใบ = `Q-${c}-W${k}`;
    ใบ.push(`('${c}', '${เลขใบ}', 'ZZTEST ลูกค้า', 'ZZTEST', 'won', ${k === 0 ? 46_000_000 : 1_000_000}, '${วัน}', '${วัน}T12:00:00+07:00', ${ลูกค้า})`);
    วันตอบรับ.push(`('${c}', '${เลขใบ}', '${วัน}T12:00:00+07:00')`);
  }
  const ใบส่ง = Array.from({ length: 12 }, (_, j) => `('${c}', 'Q-${c}-S${j}', 'ZZTEST ลูกค้า', 'ZZTEST', 'sent_to_client', 100000, '${วันนี้}')`);
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province) values (${ลูกค้า}, '${c}', 'ZZTEST ลูกค้าตอบรับ', 'ZZTEST ลูกค้าตอบรับ', 'ตราด');
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, source, status, lost_reason, created_date, last_contact_at) values ${ลีด.join(", ")};
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

/** หัวกราฟ (บอสสั่ง 12 พ.ย. 69 · ตัวกลาง หัวกราฟรายเดือน): ไม่มีข้อความกำกับใต้ชื่อ · ปุ่มอยู่ใต้ชื่อ ชิดขวา — ทุกกราฟเหมือนกัน
 *  ตกบนโค้ดเดิม: หัวกราฟไม่มี [data-month-chart-head] · ปุ่มอยู่บรรทัดเดียวกับชื่อ · ลูกค้าเป้าหมาย/ใบเสนอราคามี "ช่วง … · ช่วงจากปุ่มของกราฟ …" ใต้ชื่อ */
async function ตรวจหัวกราฟ(การ์ด: Locator, ชื่อ: string) {
  const หัว = การ์ด.locator("[data-month-chart-head]");
  await expect(หัว, `${ชื่อ}: หัวกราฟตัวกลาง`).toHaveCount(1, { timeout: 30_000 });
  await expect(การ์ด.locator("[data-subtitle]"), `${ชื่อ}: ไม่มีข้อความกำกับใต้ชื่อกราฟ`).toHaveCount(0);
  const ผล = await หัว.evaluate(h => {
    const ชื่อ = h.querySelector("[data-title]")!, แถว = h.querySelector("[data-month-range-row]")!, กลุ่ม = แถว.querySelector('[role="group"]')!;
    const [ก, ช, ถ] = [h, ชื่อ, กลุ่ม].map(e => e.getBoundingClientRect());
    // ข้อความในหัวที่ไม่ใช่ ชื่อ · ปุ่ม · ลิงก์มุมขวา (เช่น "ดูทั้งหมด") = ข้อความกำกับ
    const นอก = [...h.querySelectorAll("*")].filter(e => !e.closest("[data-title]") && !e.closest('[role="group"]') && !e.closest("a, button"))
      .flatMap(e => [...e.childNodes].filter(n => n.nodeType === 3 && (n.textContent ?? "").trim()).map(n => (n.textContent ?? "").trim()));
    return { ใต้ชื่อ: ถ.top >= ช.bottom - 1, ห่างขวา: Math.round(ก.right - parseFloat(getComputedStyle(h).paddingRight || "0") - ถ.right), นอก };
  });
  expect(ผล.ใต้ชื่อ, `${ชื่อ}: ปุ่มอยู่ใต้ชื่อกราฟ (ไม่ใช่บรรทัดเดียวกัน)`).toBe(true);
  expect(Math.abs(ผล.ห่างขวา), `${ชื่อ}: ปุ่มชิดขวาของหัวกราฟ (ห่าง ${ผล.ห่างขวา}px)`).toBeLessThanOrEqual(2);
  expect(ผล.นอก, `${ชื่อ}: หัวกราฟมีแต่ชื่อกับปุ่ม (ไม่มีข้อความกำกับ)`).toEqual([]);
}

/** ตรวจกราฟหนึ่งใบ: หัวกราฟ · ค่าเริ่มต้น 1 ปี · ทุกปุ่ม → ป้ายเดือนครบ = จำนวนเดือน · ขีดกลม */
async function ตรวจกราฟ(การ์ด: Locator, ชื่อ: string) {
  await ตรวจหัวกราฟ(การ์ด, ชื่อ);
  await expect(การ์ด.locator("[data-month-range]"), `${ชื่อ}: ปุ่ม 4 ปุ่ม`).toHaveCount(4, { timeout: 30_000 });
  await expect(การ์ด.locator("[data-month-range]"), `${ชื่อ}: ชื่อปุ่ม`).toHaveText(["3 เดือน", "6 เดือน", "9 เดือน", "1 ปี"]);
  await expect(การ์ด.locator("[data-month-range='12']"), `${ชื่อ}: ค่าเริ่มต้น 1 ปี`).toHaveAttribute("aria-pressed", "true");
  for (const n of [3, 6, 9, 12]) {
    await การ์ด.locator(`[data-month-range='${n}']`).click();
    for (const m of [3, 6, 9, 12])
      await expect(การ์ด.locator(`[data-month-range='${m}']`), `${ชื่อ} ${n} เดือน: ปุ่ม ${m} ${m === n ? "ถูกเลือก" : "ไม่ถูกเลือก"}`)
        .toHaveAttribute("aria-pressed", m === n ? "true" : "false");
    const ป้าย = () => การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.map(e => e.getAttribute("data-x-label") ?? ""));
    await expect.poll(ป้าย, { timeout: 30_000, message: `${ชื่อ} ${n} เดือน: ป้ายเดือนครบ ${n} ช่อง ถึงเดือนนี้` }).toEqual(ป้ายที่ควร(n));
    // ป้ายทุกตัวมองเห็น (ไม่เว้นเดือน · ไม่ซ่อน)
    const มองเห็น = await การ์ด.locator("svg [data-x-label]").evaluateAll(els => els.filter(e => e.getBoundingClientRect().width > 0).length);
    expect(มองเห็น, `${ชื่อ} ${n} เดือน: ป้ายมองเห็นทุกตัว`).toBe(n);
    const ขีด = await การ์ด.locator("svg [data-y-tick]").evaluateAll(els => els.map(e => Number(e.getAttribute("data-y-tick"))));
    ตรวจขีดกลม(ขีด, `${ชื่อ} ${n} เดือน`);
  }
}

async function ตั้งช่วงหน้าเป็นวันนี้(page: Page) {
  await ตั้งช่วงเอง(page, วันนี้, วันนี้);
  await settle(page);
}

test("[ui·hq] แดชบอร์ด HQ: กราฟรายเดือน 3 ใบ มีปุ่มของตัวเอง · ป้ายครบ · ขีดกลม · ไม่ขึ้นกับช่วงหน้า", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  await settle(page);
  await กรองหน้าHQด้วยสาขา(page, สาขา!.รหัส);
  await ตั้งช่วงหน้าเป็นวันนี้(page);
  await expect(page.locator("[data-card='trend']"), "แนวโน้มยอดขายเป็นรายเดือน").toContainText("รายเดือน", { timeout: 30_000 });
  await ตรวจกราฟ(page.locator("[data-card='trend']"), "แนวโน้มยอดขาย");
  await ตรวจกราฟ(page.locator("[data-card='bars']"), "ลูกค้าเป้าหมายใหม่ · ใบ · ปิดการขาย");
  await ตรวจกราฟ(page.locator("[data-card='target']"), "เป้าเทียบยอดจริง");
  assertNoErrors(errs, "แดชบอร์ด HQ กราฟรายเดือน");
});

test("[ui·hq] ลูกค้าเป้าหมายทั้งเครือ + ใบเสนอราคาทั้งเครือ: กราฟรายเดือนมีปุ่มของตัวเอง ไม่ขึ้นกับช่วงหน้า", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginUI(page, HQ_ORIGIN, `/hq/leads?dealer=${สาขา!.รหัส}`, ADMIN);
  await settle(page);
  await ตั้งช่วงหน้าเป็นวันนี้(page);
  await ตรวจกราฟ(page.locator(".card").filter({ has: page.locator("[data-lead-monthly]") }), "ลูกค้าเป้าหมายใหม่รายเดือน");
  // ตัวกรองระดับยังมีผล: เดือนนี้ของสาขาของข้อ = 13 ราย (1 ปี · ผลรวม 12 เดือน = 13 + 11)
  await expect(page.locator("[data-lead-monthly][data-ready='1']"), "ผลรวม 1 ปี = ลูกค้าเป้าหมายของสาขาของข้อ 12 เดือน").toHaveAttribute("data-sum-new", "24");

  await page.goto(`${HQ_ORIGIN}/hq/quotations?dealer=${สาขา!.รหัส}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await ตั้งช่วงหน้าเป็นวันนี้(page);
  const กราฟใบ = page.locator('[data-chart="quote-monthly"]');
  await ตรวจกราฟ(กราฟใบ, "ใบที่ส่ง เทียบ ตอบรับ");
  // 1 ปี: ใบที่ส่ง = ตอบรับ 12 + ส่ง 12 · ตอบรับ 12 (ช่วงหน้าเป็นวันนี้วันเดียว แต่กราฟยังนับ 12 เดือน)
  await expect.poll(async () => [await กราฟใบ.getAttribute("data-sum-sent"), await กราฟใบ.getAttribute("data-sum-won")],
    { timeout: 30_000, message: "กราฟใบนับ 12 เดือนตามปุ่ม ไม่ใช่ช่วงหน้า" }).toEqual(["24", "12"]);
  assertNoErrors(errs, "HQ ลูกค้าเป้าหมาย/ใบเสนอราคา กราฟรายเดือน");
});

test("[ui·dealer] แดชบอร์ดดีลเลอร์: กราฟรายเดือน 2 ใบ มีปุ่มของตัวเอง · ป้ายครบ · ขีดกลม · ไม่ขึ้นกับช่วงหน้า", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginUI(page, DEALER_ORIGIN, "/dashboard", สาขา!.บัญชี);
  await settle(page);
  await ตั้งช่วงหน้าเป็นวันนี้(page);
  await ตรวจกราฟ(page.locator(".card").filter({ hasText: "ลูกค้าเป้าหมาย เทียบ ที่ออกใบเสนอราคาแล้ว" }).first(), "ลูกค้าเป้าหมาย เทียบ ที่ออกใบ");
  const ยอด = page.locator(".card").filter({ hasText: "ยอดขายรายเดือน" }).first();
  await expect(ยอด.locator("[data-title]").first(), "หัวข้อเป็นรายเดือนแม้ช่วงหน้าเป็นวันเดียว").toHaveText("ยอดขายรายเดือน");
  await ตรวจกราฟ(ยอด, "ยอดขายรายเดือน");
  assertNoErrors(errs, "แดชบอร์ดดีลเลอร์ กราฟรายเดือน");
});
