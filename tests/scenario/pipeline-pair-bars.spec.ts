import { test, expect } from "@playwright/test";
import { open, settle, เลือกตัวกรอง } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { เดือนในช่วง } from "@pms/shared/lib/hqDrill";

// ─── HQ › ภาพรวมยอดขาย: กราฟยอดขายเทียบเป้า (บอสตัดสิน 19 พ.ย. 69) ───
//   หลายดีลเลอร์ระดับทั้งเครือ/ภาค (แท็บดีลเลอร์/ภูมิภาค/จังหวัด) = หลอดแนวนอนคู่เหมือนเดิม (ถอยแท่งตั้งของ 617bad17)
//   ระดับจังหวัด แท็บดีลเลอร์ = แท่งคู่แนวตั้งต่อดีลเลอร์ (บอสสั่งเพิ่ม 19 พ.ย. 69) · กดแท่ง = เจาะลงดีลเลอร์
//   เลือกดีลเลอร์รายเดียว = ไม่มีแท็บดีลเลอร์ · กราฟแท่งคู่แนวตั้งรายเดือน (ยอดขาย/เป้า) เดือนตามช่วงเวลาด้านบน · ตัวเลขบนหัวแท่งไม่ทับกัน · ไม่ล้น
//   ข้อนี้สร้างดีลเลอร์ของตัวเอง 2 ราย (ชื่อมีป้ายของข้อ · เป้าทั้งปีต่างกัน) แล้วค้น/เลือกด้วยรายนั้น
//   ตกบนโค้ดเดิม (617bad17): หลายดีลเลอร์เป็นแท่งตั้ง (ไม่มีหลอด) · (97a8ab9e): ดีลเลอร์เดียวมีแท็บดีลเลอร์ · รายเดือนเป็นหลอดนอน
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ");
test.describe.configure({ mode: "serial" });
const ป้าย = `ZZTEST แท่งคู่ ${Date.now() % 100000}`;
let ก: สาขาของข้อ, ข: สาขาของข้อ;
test.beforeAll(async () => {
  ก = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", เป้า: 36_000_000, ชื่อ: `${ป้าย} ก` });
  ข = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", เป้า: 7_200_000, ชื่อ: `${ป้าย} ข` });
});
test.afterAll(async () => { await ก?.ลบ(); await ข?.ลบ(); });

test("[H·hq] ภาพรวมยอดขาย หลายดีลเลอร์: กราฟยอดขายเทียบเป้า = หลอดแนวนอน (ไม่ใช่แท่งตั้ง)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "hq", "/hq/pipeline");
  await settle(page);
  await page.getByLabel("ค้นหาดีลเลอร์", { exact: true }).fill(ป้าย);
  const กราฟ = page.getByTestId("pipeline-chart");
  // ชื่อแถวมีป้ายภาคต่อท้ายในชิ้นเดียวกัน ("… ก ภาคตะวันออก") → หาจาก title ของชื่อแถว (ชื่อเต็มตรงตัว · รอบตรวจ deploy29)
  await expect(กราฟ.locator(`[title="${ป้าย} ก"]`), "หลอดของดีลเลอร์ของข้อ").toBeVisible({ timeout: 30_000 });
  await expect(กราฟ.locator(".bar-grow"), "2 ดีลเลอร์ × หลอดยอดขาย/เป้า").toHaveCount(4);
  await expect(กราฟ.locator("rect[data-bar-col]"), "ไม่มีแท่งตั้ง").toHaveCount(0);
  await expect(กราฟ.locator('[role="tab"][data-dim="dealer"]'), "ทั้งเครือมีแท็บดีลเลอร์").toHaveCount(1);
});

test("[H·hq] ภาพรวมยอดขาย ระดับจังหวัด แท็บดีลเลอร์: แท่งคู่แนวตั้งต่อดีลเลอร์ · ค่าแท่ง = ตาราง · กดแท่ง = เจาะลงดีลเลอร์", async ({ page }) => {
  //   ตกบนโค้ดเดิม (628fe582): ระดับจังหวัดยังเป็นหลอดนอน (ไม่มี [data-pair-bars='prov-dealer'])
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, "hq", "/hq/pipeline");
  await settle(page);
  await เลือกตัวกรอง(page, "ทุกภูมิภาค", { ค่า: "ตะวันออก" });
  await เลือกตัวกรอง(page, "ทุกจังหวัด", { ค่า: "ตราด" });
  await expect(page.locator('[data-crumbs] [data-crumb="prov"]'), "ระดับจังหวัด").toBeVisible();
  await page.getByLabel("ค้นหาดีลเลอร์", { exact: true }).fill(ป้าย);
  const กราฟ = page.getByTestId("pipeline-chart");
  const กล่อง = กราฟ.locator("[data-pair-bars='prov-dealer']");
  await expect(กล่อง, "ระดับจังหวัด = แท่งคู่แนวตั้ง").toBeVisible({ timeout: 30_000 });
  await expect(กราฟ.locator(".bar-grow"), "ไม่มีหลอดนอน").toHaveCount(0);
  const แท่ง = กล่อง.locator("rect[data-bar-col]");
  await expect(แท่ง, "2 ดีลเลอร์ของข้อ × 2 ชุด").toHaveCount(4, { timeout: 20_000 });
  const ข้อมูล = await แท่ง.evaluateAll(es => es.map(e => ({ key: e.getAttribute("data-bar-col") ?? "", ชุด: e.getAttribute("data-bar-series") ?? "", v: Number(e.getAttribute("data-value")), ล่าง: e.getBoundingClientRect().bottom, สูง: e.getBoundingClientRect().height })));
  for (const d of ข้อมูล) expect(Math.abs(d.ล่าง - ข้อมูล[0].ล่าง), `แท่ง ${d.key} ตั้งบนแกนเดียวกัน`).toBeLessThan(1.5);
  const ตาราง = await page.locator("table[aria-label='ตารางผลงานดีลเลอร์'] tbody tr").evaluateAll(trs => trs.map(tr => ({
    code: tr.querySelector("[data-perf-row]")?.getAttribute("data-perf-row") ?? "",
    sales: Number(tr.querySelector("[data-cell='sales']")?.getAttribute("data-value") ?? "NaN"),
    target: Number(tr.querySelector("[data-cell='target']")?.getAttribute("data-value") || 0),
  })).filter(r => r.code));
  expect(ตาราง.map(t => t.code).sort(), "ตารางมี 2 รายเดียวกับกราฟ").toEqual([ก.รหัส, ข.รหัส].sort());
  for (const t of ตาราง) {
    expect(ข้อมูล.find(d => d.key === t.code && d.ชุด === "ยอดขายในช่วง")!.v, `${t.code}: แท่งยอดขาย = ตาราง`).toBe(t.sales);
    expect(ข้อมูล.find(d => d.key === t.code && d.ชุด === "เป้าตามช่วง")!.v, `${t.code}: แท่งเป้า = ตาราง`).toBe(t.target);
  }
  const เป้า = (code: string) => ข้อมูล.find(d => d.key === code && d.ชุด === "เป้าตามช่วง")!;
  expect(เป้า(ก.รหัส).สูง, "แท่งเป้า ก (เป้าปีสูงกว่า) สูงกว่า ข").toBeGreaterThan(เป้า(ข.รหัส).สูง);
  await expect(กล่อง.locator("text[data-bar-label]"), "ตัวเลขบนหัวแท่งทุกแท่ง").toHaveCount(4);
  // กดแท่งเป้า (แท่งสูง) ของดีลเลอร์ ก — ทั้งกลุ่มแท่งของดีลเลอร์กดเจาะลงได้ · แท่งยอดขาย ฿0 สูง 1.5px มีตัวเลขทับ กดตรง ๆ ไม่ได้ (รันยืนยัน deploy29)
  await กล่อง.locator(`rect[data-bar-col="${ก.รหัส}"][data-bar-series="เป้าตามช่วง"]`).click();
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), "กดแท่ง = เจาะลงดีลเลอร์").toHaveText(`${ป้าย} ก`);
});

for (const กว้าง of [1440, 760]) {
  test(`[H·hq] ภาพรวมยอดขาย ดีลเลอร์เดียว จอ ${กว้าง}px: ไม่มีแท็บดีลเลอร์ · แท่งคู่แนวตั้งรายเดือน = ตาราง · ตัวเลขไม่ทับ · ไม่ล้น`, async ({ page }) => {
    await page.setViewportSize({ width: กว้าง, height: 1000 });
    await open(page, "hq", "/hq/pipeline");
    await settle(page);
    await เลือกตัวกรอง(page, "ทุกดีลเลอร์", { ค่า: ก.รหัส });
    const กราฟ = page.getByTestId("pipeline-chart");
    const กล่อง = กราฟ.locator("[data-pair-bars='month']");
    await expect(กล่อง, "ดีลเลอร์เดียว = กราฟแท่งตั้งรายเดือน").toBeVisible({ timeout: 30_000 });
    await expect(กราฟ.locator('[role="tab"][data-dim="dealer"]'), "ไม่มีแท็บดีลเลอร์").toHaveCount(0);
    await expect(กราฟ.locator(".bar-grow"), "ไม่มีหลอดนอน").toHaveCount(0);

    const ช่วง = page.locator("[data-time-range]").first();
    const [start, end] = [await ช่วง.getAttribute("data-start"), await ช่วง.getAttribute("data-end")];
    const คาดเดือน = เดือนในช่วง(start!, end!);
    const แท่ง = กล่อง.locator("rect[data-bar-col]");
    await expect(แท่ง, "ทุกเดือนในช่วง × 2 ชุด").toHaveCount(คาดเดือน.length * 2);
    const ข้อมูล = await แท่ง.evaluateAll(es => es.map(e => {
      const r = e.getBoundingClientRect();
      return { key: e.getAttribute("data-bar-col") ?? "", ชุด: e.getAttribute("data-bar-series") ?? "", v: Number(e.getAttribute("data-value")), x: r.left, ขวา: r.right, ล่าง: r.bottom };
    }));
    for (const d of ข้อมูล) expect(Math.abs(d.ล่าง - ข้อมูล[0].ล่าง), `แท่ง ${d.key} ตั้งบนแกนเดียวกัน`).toBeLessThan(1.5);
    const ยอด = ข้อมูล.filter(d => d.ชุด === "ยอดขายในเดือน"), เป้า = ข้อมูล.filter(d => d.ชุด === "เป้ารายเดือน");
    expect(ยอด.length, "แท่งยอดขายครบทุกเดือน").toBe(คาดเดือน.length);
    for (let i = 1; i < ยอด.length; i++) expect(ยอด[i].x, "เดือนเรียงซ้าย→ขวา").toBeGreaterThan(ยอด[i - 1].x);
    // เป้ารายเดือน = เป้าทั้งปี × วันของเดือนที่อยู่ในช่วง ÷ 365 (ปัดสะสม) → ผลรวม = เป้าตามช่วงของการ์ด round(เป้า × วันทั้งช่วง ÷ 365)
    //   (ผู้ตรวจ 23 พ.ย. 69: เดิม ÷ 12 เต็มเดือนทุกแถว — ช่วง 3 เดือน 4 แถว รวมแถว 23.2M แต่การ์ด ≈ 17.8M) · ตกบนโค้ดเดิม e2b941e1
    const วันUTC = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;
    const [ต้นช่วง, ท้ายช่วง] = [วันUTC(start!), วันUTC(end!)];
    let สะสม = 0;
    const คาดเป้า = คาดเดือน.map((_, i) => {
      const y = Number(start!.slice(0, 4)), m0 = Number(start!.slice(5, 7)) - 1 + i;
      const ต้น = Math.max(ต้นช่วง, Date.UTC(y, m0, 1) / 86_400_000), ท้าย = Math.min(ท้ายช่วง, Date.UTC(y, m0 + 1, 0) / 86_400_000);
      const ก่อน = สะสม; สะสม += ท้าย - ต้น + 1;
      return Math.round(36_000_000 * สะสม / 365) - Math.round(36_000_000 * ก่อน / 365);
    });
    expect(เป้า.map(d => d.v), "เป้ารายเดือนตามวันของเดือนที่อยู่ในช่วง").toEqual(คาดเป้า);
    expect(เป้า.reduce((a, d) => a + d.v, 0), "ผลรวมเป้ารายเดือน = เป้าตามช่วงของการ์ด").toBe(Math.round(36_000_000 * (ท้ายช่วง - ต้นช่วง + 1) / 365));

    // ค่าแท่งยอดขาย = ตารางรายเดือนแถวเดียวกัน
    const ตาราง = await page.locator("table[aria-label='ตารางผลงานรายเดือน'] tbody tr").evaluateAll(trs => trs.map(tr => ({
      key: tr.querySelector("[data-month-row]")?.getAttribute("data-month-row") ?? "",
      sales: Number(tr.querySelector("td.num[data-value]")?.getAttribute("data-value") ?? "NaN"),
    })).filter(r => r.key));
    expect(ตาราง.map(t => t.key), "ตารางรายเดือนเดือนเดียวกับกราฟ").toEqual(ยอด.map(d => d.key));
    for (const t of ตาราง) expect(ยอด.find(d => d.key === t.key)!.v, `${t.key}: แท่งยอดขาย = ตาราง`).toBe(t.sales);

    // ตัวเลขบนหัวแท่งครบ · คู่ในเดือนเดียวกันไม่ทับกัน
    const ตัวเลข = await กล่อง.locator("text[data-bar-label]").evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return { key: e.getAttribute("data-bar-label") ?? "", l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    expect(ตัวเลข.length, "ตัวเลขบนหัวแท่งทุกแท่ง").toBe(ข้อมูล.length);
    for (let i = 0; i + 1 < ตัวเลข.length; i += 2) {
      const [p, q] = [ตัวเลข[i], ตัวเลข[i + 1]];
      expect(p.r > q.l + 0.5 && q.r > p.l + 0.5 && p.b > q.t + 0.5 && q.b > p.t + 0.5, `ตัวเลขยอดขาย/เป้าของ ${p.key} ไม่ทับกัน`).toBe(false);
    }

    // ไม่ล้น: กรอบไม่เกินการ์ด · หน้าไม่มีแถบเลื่อนแนวนอน
    const กรอบ = (await กล่อง.boundingBox())!;
    const การ์ดขวา = await กล่อง.evaluate(e => (e.closest(".card") as HTMLElement).getBoundingClientRect().right);
    expect(กรอบ.x + กรอบ.width, "กรอบกราฟไม่เกินขอบการ์ด").toBeLessThanOrEqual(การ์ดขวา + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "หน้าไม่ล้นแนวนอน").toBe(true);
  });
}
