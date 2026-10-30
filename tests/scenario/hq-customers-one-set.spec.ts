import { test, expect, type Page } from "@playwright/test";
import { open, settle } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ─── HQ · ลูกค้าทั้งเครือ (/hq/customers) ตรง FLOW "ฐานข้อมูลหลังปิดการขาย" (บอสสั่ง 30 ต.ค. 69) ───
//   การ์ด 3 ใบ (ลูกค้าทั้งหมด · ลูกค้าใหม่ในช่วงนี้ · ดีลเลอร์ที่มีลูกค้า) · ไม่มี "ยอดขายเดือนนี้" / กราฟ "ยอดซื้อ ตามดีลเลอร์"
//   ช่วงวันที่มุมขวาบนแทนตัวกรอง "ทุกช่วงเวลาที่ซื้อ" · ลูกค้าใหม่นับตามช่วงที่เลือก
//   ผลรวม "ลูกค้าตามดีลเลอร์" = "ลูกค้าตามจังหวัด" = การ์ดลูกค้าทั้งหมด = จำนวนแถวตาราง
//   ชื่อภาคใช้รายการกลาง (ภาคตะวันออกเฉียงเหนือ ไม่ใช่ "อีสาน") · ตัวกรอง "ทุกภูมิภาค"
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
const ผลรวมกราฟ = async (page: Page, ชื่อ: string) => Number(await page.locator(`[data-chart="${ชื่อ}"]`).getAttribute("data-sum", { timeout: 15_000 }));

test("[H·hq] ลูกค้าทั้งเครือ: การ์ด 3 ใบ · ผลรวมตามดีลเลอร์ = ตามจังหวัด = การ์ด = แถวตาราง · ชื่อภาคกลาง · ลูกค้าใหม่ตามช่วง", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  await settle(page);
  // เอาออกแล้ว
  await expect(page.locator("[data-kpi-row] [data-kpi]"), "การ์ด 3 ใบ").toHaveCount(3, { timeout: 25_000 });
  await expect(page.locator('[data-kpi-row] [data-kpi="sales"]'), "ไม่มีการ์ดยอดขายเดือนนี้").toHaveCount(0);
  await expect(page.getByText("ยอดซื้อ ตามดีลเลอร์"), "ไม่มีกราฟยอดซื้อตามดีลเลอร์").toHaveCount(0);
  await expect(page.getByLabel("กรองตามช่วงเวลาที่ซื้อล่าสุด"), "ไม่มีตัวกรองซื้อล่าสุด (ใช้ช่วงวันที่มุมขวาบน)").toHaveCount(0);
  // ตัวกรองภาค = "ทุกภูมิภาค" + ชื่อภาคกลาง
  const ภาค = page.getByLabel("กรองตามภูมิภาค");
  await expect(ภาค.locator("option").first()).toHaveText("ทุกภูมิภาค");
  expect(await ภาค.locator("option").allInnerTexts(), "ชื่อภาคจากรายการกลาง").toContain("ภาคตะวันออกเฉียงเหนือ");

  // เทียบทุกตัวกรอง: สาขาของข้อ · + ภาค · + จังหวัด
  const ตรวจ = async (ที่: string, คาด: number) => {
    await expect.poll(async () => Number(await การ์ด(page, "total").getAttribute("data-value")), { message: `${ที่}: การ์ดลูกค้าทั้งหมด`, timeout: 20_000 }).toBe(คาด);
    // กราฟ/ตารางโหลดจากคำสั่งฐานคนละตัวกับการ์ด — รอให้ทั้งชุดเป็นตัวกรองเดียวกันก่อนเทียบ
    await expect.poll(() => ผลรวมกราฟ(page, "by-dealer"), { message: `${ที่}: ผลรวมลูกค้าตามดีลเลอร์ = การ์ด`, timeout: 20_000 }).toBe(คาด);
    await expect.poll(() => ผลรวมกราฟ(page, "by-province"), { message: `${ที่}: ผลรวมลูกค้าตามจังหวัด = การ์ด`, timeout: 20_000 }).toBe(คาด);
    await expect(page.locator(".table-wrap table tbody tr"), `${ที่}: จำนวนแถวตาราง = การ์ด`).toHaveCount(คาด);
  };
  await page.getByLabel("กรองตามดีลเลอร์").selectOption(สาขา.รหัส);
  await ตรวจ("สาขาของข้อ", 5);
  // ทุกแถว: ภูมิภาค = ชื่อกลาง · ดีลเลอร์ = รหัส+ชื่อช่องเดียว · รหัสลูกค้า/วันที่ไม่ถูกตัด
  const แถว = page.locator(".table-wrap table tbody tr");
  expect(new Set(await แถว.locator('td[data-col="region"]').allInnerTexts()), "ภูมิภาคในตาราง = ชื่อกลาง").toEqual(new Set(["ภาคตะวันออกเฉียงเหนือ"]));
  expect((await แถว.first().locator('td[data-col="dealer"]').innerText()).startsWith(สาขา.รหัส), "ช่องดีลเลอร์ขึ้นต้นด้วยรหัส").toBe(true);
  for (const td of await แถว.first().locator("td").all()) {
    if (await td.getAttribute("title")) continue;   // ชื่อยาวตัดได้ — แสดงเต็มเมื่อชี้
    expect(await td.evaluate(e => e.scrollWidth <= e.clientWidth + 1), `ช่องไม่ถูกตัด: ${(await td.innerText()).trim()}`).toBe(true);
  }
  await ภาค.selectOption({ label: "ภาคตะวันออกเฉียงเหนือ" });
  await ตรวจ("สาขาของข้อ + ภาค", 5);
  await page.getByLabel("กรองตามจังหวัด").selectOption("ขอนแก่น");
  await ตรวจ("สาขาของข้อ + จังหวัดขอนแก่น", 2);
  await page.getByLabel("กรองตามจังหวัด").selectOption("all");

  // ลูกค้าใหม่ในช่วง = ลูกค้าของข้อที่วันเป็นลูกค้าอยู่ในช่วงของแถวการ์ด (ช่วงวันที่มุมขวาบน)
  const แถวการ์ด = page.locator("[data-kpi-row]").first();
  const ต้น = await แถวการ์ด.getAttribute("data-range-start"), ท้าย = await แถวการ์ด.getAttribute("data-range-end");
  expect(ต้น && ท้าย, "การ์ดมีช่วงจากตัวเลือกช่วงวันที่").toBeTruthy();
  const คาดใหม่ = ลูกค้า.filter(x => x.เข้า >= ต้น! && x.เข้า <= ท้าย!).length;
  expect(คาดใหม่, "ช่วงตั้งต้นครอบวันนี้แต่ไม่ครอบ 30 เดือนก่อน").toBe(2);
  await expect.poll(async () => Number(await การ์ด(page, "new").getAttribute("data-value")), { message: "ลูกค้าใหม่ในช่วงนี้" }).toBe(คาดใหม่);
});
