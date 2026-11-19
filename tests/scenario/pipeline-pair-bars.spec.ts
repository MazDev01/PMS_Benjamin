import { test, expect } from "@playwright/test";
import { open, settle, เลือกตัวกรอง } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { เดือนในช่วง } from "@pms/shared/lib/hqDrill";

// ─── HQ › ภาพรวมยอดขาย: กราฟยอดขายเทียบเป้า (บอสตัดสิน 19 พ.ย. 69) ───
//   หลายดีลเลอร์ (แท็บดีลเลอร์/ภูมิภาค/จังหวัด) = หลอดแนวนอนคู่เหมือนเดิม (ถอยแท่งตั้งของ 617bad17)
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
  await expect(กราฟ.getByText(`${ป้าย} ก`, { exact: true }), "หลอดของดีลเลอร์ของข้อ").toBeVisible({ timeout: 30_000 });
  await expect(กราฟ.locator(".bar-grow"), "2 ดีลเลอร์ × หลอดยอดขาย/เป้า").toHaveCount(4);
  await expect(กราฟ.locator("rect[data-bar-col]"), "ไม่มีแท่งตั้ง").toHaveCount(0);
  await expect(กราฟ.locator('[role="tab"][data-dim="dealer"]'), "ทั้งเครือมีแท็บดีลเลอร์").toHaveCount(1);
});

for (const กว้าง of [1440, 760]) {
  test(`[H·hq] ภาพรวมยอดขาย ดีลเลอร์เดียว จอ ${กว้าง}px: ไม่มีแท็บดีลเลอร์ · แท่งคู่แนวตั้งรายเดือน = ตาราง · ตัวเลขไม่ทับ · ไม่ล้น`, async ({ page }) => {
    await page.setViewportSize({ width: กว้าง, height: 1000 });
    await open(page, "hq", "/hq/pipeline");
    await settle(page);
    await เลือกตัวกรอง(page, "ทุกดีลเลอร์", { ค่า: ก.รหัส });
    const กราฟ = page.getByTestId("pipeline-chart");
    const กล่อง = กราฟ.locator("[data-month-pair-bars]");
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
    for (const d of เป้า) expect(d.v, `เป้ารายเดือน ${d.key} = เป้าทั้งปีของข้อ ÷ 12`).toBe(3_000_000);

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
