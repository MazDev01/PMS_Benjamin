import { test, expect, type Page } from "@playwright/test";
import { open, settle } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ─── HQ · ลูกค้าทั้งเครือ (/hq/customers) ตรง FLOW "ฐานข้อมูลหลังปิดการขาย" (บอสสั่ง 30 ต.ค. 69) ───
//   การ์ด 3 ใบ (ลูกค้าทั้งหมด · ลูกค้าใหม่ในช่วงนี้ · ดีลเลอร์ที่มีลูกค้า) · ไม่มี "ยอดขายเดือนนี้" / กราฟ "ยอดซื้อ ตามดีลเลอร์"
//   ช่วงวันที่มุมขวาบนแทนตัวกรอง "ทุกช่วงเวลาที่ซื้อ" · ลูกค้าใหม่นับตามช่วงที่เลือก
//   (2 พ.ย. 69 · ใบ 0271) เจาะลึกแบบภาพรวมยอดขาย: ระดับ ภูมิภาค/จังหวัด/ดีลเลอร์ = ของดีลเลอร์ · กราฟ "ลูกค้าตามดีลเลอร์/ตามจังหวัด" เอาออกตามแบบ
//     (ข้อเดิม "ผลรวมกราฟ = การ์ด" กลับด้าน: ไม่มีกราฟสองอันนั้นแล้ว · การ์ด = แถวรวมตารางเจาะลึก ตรวจที่ hq-drill-pages.spec.ts)
//     ตัวกรองจังหวัดของลูกค้า (หน้างาน) เอาออก — ระดับจังหวัด = จังหวัดของดีลเลอร์ · การ์ดลูกค้าทั้งหมด = จำนวนแถวรายชื่อ ณ ระดับดีลเลอร์
//   ชื่อภาคใช้รายการกลาง (ภาคตะวันออกเฉียงเหนือ ไม่ใช่ "อีสาน") · ตัวเลือกระดับ "ทุกภูมิภาค"
//   ตกบนโค้ดก่อนรอบนี้: ตารางขึ้น "อีสาน" · มีการ์ดยอดขาย/ตัวกรองซื้อล่าสุด · กราฟไม่มีผลรวมให้เทียบ
// ข้อมูล = สาขาของข้อ (สกลนคร · ภาคตะวันออกเฉียงเหนือ) ลูกค้า 5 ราย: สกลนคร 3 · ขอนแก่น 2 · เป็นลูกค้าวันนี้ 2 ราย ที่เหลือ 30 เดือนก่อน
//   (ลูกค้าไม่มีจังหวัด ฐานยังไม่นับในกราฟจังหวัด — รอรอบรวมงานฐาน · ข้อนี้จึงยังไม่วางกรณีนั้น)
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ (สาขาของข้อ)");
let สาขา: สาขาของข้อ;
const ฐานเลข = 9_000_000 + Math.floor(Math.random() * 90_000) * 10;   // 7 หลัก — รหัสลูกค้ายาวเท่าของจริงช่วงบน (ไม่ใช่ 10 หลักที่ไม่มีจริง)
const วันที่ = (ย้อนเดือน: number) => { const d = new Date(Date.now() + 7 * 3600_000); d.setUTCMonth(d.getUTCMonth() - ย้อนเดือน); return d.toISOString().slice(0, 10); };
const ลูกค้า: { จังหวัด: string; เข้า: string }[] = [
  { จังหวัด: "สกลนคร", เข้า: วันที่(0) }, { จังหวัด: "สกลนคร", เข้า: วันที่(30) }, { จังหวัด: "สกลนคร", เข้า: วันที่(30) },
  { จังหวัด: "ขอนแก่น", เข้า: วันที่(0) }, { จังหวัด: "ขอนแก่น", เข้า: วันที่(30) },
];

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "สกลนคร", ภาค: "ตะวันออกเฉียงเหนือ" });
  const c = สาขา.รหัส;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province, join_date) values
      ${ลูกค้า.map((x, i) => `(${ฐานเลข + i}, '${c}', 'ZZTEST ลูกค้า ${c}-${i}', 'ZZTEST ลูกค้า ${c}-${i}', '${x.จังหวัด}', '${x.เข้า}')`).join(",\n      ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางลูกค้าของสาขาไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica; delete from public.customers where dealer_code = '${สาขา.รหัส}'; set local session_replication_role = origin;`);
  await สาขา.ลบ();
});

const การ์ด = (page: Page, k: string) => page.locator(`[data-kpi-row] [data-kpi="${k}"] [data-value]`).first();
// รายชื่อลูกค้า (ไม่ใช่ตารางเจาะลึกด้านบน)
const แถวรายชื่อ = (page: Page) => page.locator('table[aria-label="รายชื่อลูกค้า"] tbody tr');

test("[H·hq] ลูกค้าทั้งเครือ: การ์ด 3 ใบ · ระดับดีลเลอร์ การ์ด = รายชื่อ · ชื่อภาคกลาง · ลูกค้าใหม่ตามช่วง · ไม่มีกราฟตามดีลเลอร์/จังหวัด", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  await settle(page);
  // เอาออกแล้ว
  await expect(page.locator("[data-kpi-row] [data-kpi]"), "การ์ด 3 ใบ").toHaveCount(3, { timeout: 25_000 });
  await expect(page.locator('[data-kpi-row] [data-kpi="sales"]'), "ไม่มีการ์ดยอดขายเดือนนี้").toHaveCount(0);
  await expect(page.getByText("ยอดซื้อ ตามดีลเลอร์"), "ไม่มีกราฟยอดซื้อตามดีลเลอร์").toHaveCount(0);
  await expect(page.getByLabel("กรองตามช่วงเวลาที่ซื้อล่าสุด"), "ไม่มีตัวกรองซื้อล่าสุด (ใช้ช่วงวันที่มุมขวาบน)").toHaveCount(0);
  // กลับด้าน (บอสสั่ง 2 พ.ย. 69 · แบบหน้า): ไม่มีกราฟลูกค้าตามดีลเลอร์/ตามจังหวัด · ไม่มีตัวกรองจังหวัดของลูกค้า
  await expect(page.locator('[data-chart="by-dealer"], [data-chart="by-province"]'), "ไม่มีกราฟตามดีลเลอร์/ตามจังหวัด").toHaveCount(0);
  await expect(page.getByLabel("กรองตามจังหวัด"), "ไม่มีตัวกรองจังหวัดของลูกค้า (ระดับจังหวัด = จังหวัดของดีลเลอร์)").toHaveCount(0);
  // ตัวเลือกระดับภาค = "ทุกภูมิภาค" + ชื่อภาคกลาง
  const ภาค = page.locator("[data-drill-scope]").getByLabel("ภูมิภาค");
  await expect(ภาค.locator("option").first()).toHaveText("ทุกภูมิภาค", { timeout: 25_000 });
  expect(await ภาค.locator("option").allInnerTexts(), "ชื่อภาคจากรายการกลาง").toContain("ภาคตะวันออกเฉียงเหนือ");

  // เจาะลงดีลเลอร์ของข้อ → การ์ด = รายชื่อ = 5
  await page.locator("[data-drill-scope]").getByLabel("ดีลเลอร์").selectOption(สาขา.รหัส);
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), "แถบระดับถึงดีลเลอร์").toContainText(สาขา.รหัส);
  await expect.poll(async () => Number(await การ์ด(page, "total").getAttribute("data-value")), { message: "การ์ดลูกค้าทั้งหมด = 5", timeout: 20_000 }).toBe(5);
  await expect(แถวรายชื่อ(page), "จำนวนแถวรายชื่อ = การ์ด").toHaveCount(5);
  // ทุกแถว: ภูมิภาค = ชื่อกลาง · ดีลเลอร์ = รหัส+ชื่อช่องเดียว · รหัสลูกค้า/วันที่ไม่ถูกตัด
  const แถว = แถวรายชื่อ(page);
  expect(new Set(await แถว.locator('td[data-col="region"]').allInnerTexts()), "ภูมิภาคในตาราง = ชื่อกลาง").toEqual(new Set(["ภาคตะวันออกเฉียงเหนือ"]));
  expect((await แถว.first().locator('td[data-col="dealer"]').innerText()).startsWith(สาขา.รหัส), "ช่องดีลเลอร์ขึ้นต้นด้วยรหัส").toBe(true);
  for (const td of await แถว.first().locator("td").all()) {
    if (await td.getAttribute("title")) continue;   // ชื่อยาวตัดได้ — แสดงเต็มเมื่อชี้
    expect(await td.evaluate(e => e.scrollWidth <= e.clientWidth + 1), `ช่องไม่ถูกตัด: ${(await td.innerText()).trim()}`).toBe(true);
  }

  // ลูกค้าใหม่ในช่วง = ลูกค้าของข้อที่วันเป็นลูกค้าอยู่ในช่วงของแถวการ์ด (ช่วงวันที่มุมขวาบน)
  const แถวการ์ด = page.locator("[data-kpi-row]").first();
  const ต้น = await แถวการ์ด.getAttribute("data-range-start"), ท้าย = await แถวการ์ด.getAttribute("data-range-end");
  expect(ต้น && ท้าย, "การ์ดมีช่วงจากตัวเลือกช่วงวันที่").toBeTruthy();
  const คาดใหม่ = ลูกค้า.filter(x => x.เข้า >= ต้น! && x.เข้า <= ท้าย!).length;
  expect(คาดใหม่, "ช่วงตั้งต้นครอบวันนี้แต่ไม่ครอบ 30 เดือนก่อน").toBe(2);
  await expect.poll(async () => Number(await การ์ด(page, "new").getAttribute("data-value")), { message: "ลูกค้าใหม่ในช่วงนี้" }).toBe(คาดใหม่);
  // ระดับดีลเลอร์ = รายเดือน: ผลรวมลูกค้าใหม่รายเดือน = การ์ด (ไม่มีแถวรวมแล้ว · รวมจากแถวรายเดือน)
  await expect(page.locator("[data-drill-table] tfoot"), "ไม่มีแถวรวม").toHaveCount(0);
  await expect.poll(async () => (await page.locator('[data-drill-table] tbody [data-cell="newc"]').evaluateAll(es => es.map(e => Number(e.getAttribute("data-value") || 0)))).reduce((a, b) => a + b, 0),
    { message: "ผลรวมลูกค้าใหม่รายเดือน = การ์ด" }).toBe(คาดใหม่);
});
