import { test, expect } from "@playwright/test";
import { open } from "./helpers";
import { adminClient } from "./testDealers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ─── HQ · ฐานข้อมูลลูกค้าทั้งเครือ: ตัวกรอง "ซื้อล่าสุด" (บอสสั่ง 24 ส.ค. 69) ───
// หน้านี้เป็น "ฐานข้อมูล" ไม่ใช่รายงานรายงวด → ค่าเริ่มต้นต้องไม่กรองเวลา
// ไม่งั้นเปิดหน้ามาแล้วลูกค้าเก่าหายไปเงียบ ๆ ซึ่งเป็นเหตุผลเดิมที่หน้านี้ไม่เคยมีตัวกรองเวลา
//
// ข้อมูล (คิวรอบหน้าข้อ 3 · 29 ต.ค. 69): เดิมนับสาขา UBN (ข้อมูลตั้งต้นร่วม) — ใช้สาขาของข้อเองแทน
//   ลูกค้า 4 ราย ซื้อล่าสุด (วันตอบรับใบ): 2 เดือนก่อน · 9 เดือนก่อน · 2 ปีก่อน · ไม่เคยซื้อ (ไม่เข้าเกณฑ์เมื่อเปิดตัวกรอง · ใบ 0159)
//   → ทุกช่วงเวลา 4 · 12 เดือน 2 · 6 เดือน 1 · กลับมาทุกช่วงเวลา 4 (เกณฑ์เดิม ≤ / = ยังอยู่ · เพิ่มค่าที่รู้)
//   วางที่ฐานตรง (ปิดตัวดัก): ใบตอบรับย้อนเวลาสร้างผ่านหน้าจอไม่ได้
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ (สาขาของข้อ)");
let สาขา: สาขาของข้อ;
const ฐานเลข = 1_500_000_000 + Math.floor(Math.random() * 500_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนช่วงเลขตายตัวของไฟล์อื่น)
const ย้อนเดือน = (n: number) => { const d = new Date(Date.now() + 7 * 3600_000); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };
const ซื้อล่าสุด: (string | null)[] = [ย้อนเดือน(2), ย้อนเดือน(9), ย้อนเดือน(24), null];

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "สกลนคร", ภาค: "ตะวันออกเฉียงเหนือ" });
  const c = สาขา.รหัส, ชื่อ = (i: number) => `'ZZTEST-ซื้อล่าสุด-${c}-${i}'`;
  const ใบ = ซื้อล่าสุด.flatMap((d, i) => d ? [{ id: `${c}-Q${i}`, ลูกค้า: i, d }] : []);
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province, join_date) values
      ${ซื้อล่าสุด.map((_, i) => `(${ฐานเลข + i}, '${c}', ${ชื่อ(i)}, ${ชื่อ(i)}, 'สกลนคร', '${ย้อนเดือน(30)}')`).join(",\n      ")};
    insert into public.quotations (id, dealer_code, customer, project, status, total_value, date, customer_id, won_at) values
      ${ใบ.map(q => `('${q.id}', '${c}', ${ชื่อ(q.ลูกค้า)}, 'ZZTEST', 'won', 50000, '${q.d}', ${ฐานเลข + q.ลูกค้า}, '${q.d} 12:00:00+07')`).join(",\n      ")};
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values
      ${ใบ.map(q => `('${c}', '${q.id}', '${q.d} 12:00:00+07')`).join(",\n      ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางลูกค้าของสาขาไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`delete from public.quotation_won_at where dealer_code = '${สาขา.รหัส}';`);
  await สาขา.ลบ();
});

/** เลขบนการ์ด "ลูกค้าทั้งหมด" (การ์ดกลาง · ค่าดิบ data-value) — การ์ดเดินตามตัวกรองของตาราง (บอสตัดสิน 27 ต.ค. 69 · ใบ 0246) */
async function ลูกค้าทั้งหมด(page: import("@playwright/test").Page): Promise<number> {
  const v = await page.locator('[data-kpi-row] [data-kpi="total"] [data-value]').first().getAttribute("data-value", { timeout: 8_000 });
  return Number(v || 0);
}

test("[func·hq] ตัวกรองซื้อล่าสุด: เริ่มต้นไม่กรอง · แคบช่วงแล้วลูกค้าต้องไม่เพิ่มขึ้น", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  const sel = page.getByLabel("กรองตามช่วงเวลาที่ซื้อล่าสุด");
  await expect(sel).toBeVisible();
  // ค่าเริ่มต้นต้องเป็น "ทุกช่วงเวลาที่ซื้อ" — ห้ามเปลี่ยนเป็นช่วงแคบ
  await expect(sel).toHaveValue("all");

  // นับเฉพาะสาขาของข้อ (ไม่มีข้ออื่นเขียน) · ตัวกรองซื้อล่าสุดคิดแบบเดียวกันทุกสาขา
  await page.getByLabel("กรองตามดีลเลอร์").selectOption(สาขา.รหัส);
  const { count: ในฐาน } = await adminClient().from("customers").select("id", { count: "exact", head: true }).eq("dealer_code", สาขา.รหัส);
  expect(ในฐาน ?? 0, "ลูกค้าของสาขาของข้อที่วางไว้").toBe(4);
  await expect.poll(() => ลูกค้าทั้งหมด(page), { message: "การ์ดลูกค้าทั้งหมด = ลูกค้าของสาขาในฐาน" }).toBe(ในฐาน);
  const ทั้งหมด = await ลูกค้าทั้งหมด(page);

  await sel.selectOption("m12");
  await expect.poll(() => ลูกค้าทั้งหมด(page), { message: "12 เดือน: ซื้อ 2 และ 9 เดือนก่อน" }).toBe(2);
  const สิบสองเดือน = await ลูกค้าทั้งหมด(page);
  expect(สิบสองเดือน).toBeLessThanOrEqual(ทั้งหมด);

  // 6 เดือน เป็นช่วงย่อยของ 12 เดือน → ต้องไม่มากกว่ากันเด็ดขาด
  await sel.selectOption("m6");
  await expect.poll(() => ลูกค้าทั้งหมด(page), { message: "6 เดือน: ซื้อ 2 เดือนก่อนรายเดียว" }).toBe(1);
  expect(await ลูกค้าทั้งหมด(page)).toBeLessThanOrEqual(สิบสองเดือน);

  // กลับมา "ทุกช่วงเวลา" ต้องได้เท่าเดิม (ตัวกรองไม่ทิ้งสถานะค้าง)
  await sel.selectOption("all");
  await expect.poll(() => ลูกค้าทั้งหมด(page)).toBe(ทั้งหมด);
});
