import { test, expect } from "@playwright/test";
import { open, settle } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ─── HQ › ภาพรวมยอดขาย: กราฟยอดขายเทียบเป้า = แท่งคู่แนวตั้ง (บอสสั่ง 19 พ.ย. 69 "ทำเป็นกราฟแท่ง") ───
//   เดิม: แถบนอนคู่แบบหลอด (ยอดขาย/เป้า) เรียงลงทีละดีลเลอร์
//   ตอนนี้: GroupedBarChart ตัวกลาง — แท่งตั้งบนแกนเดียวกัน · แท่งเข้ม = ยอดขาย · แท่งอ่อน = เป้า · ตัวเลขบนหัวแท่ง
//     ข้อนี้สร้างดีลเลอร์ของตัวเอง 2 ราย (ชื่อมีป้ายของข้อ · เป้าทั้งปีต่างกัน) แล้วค้นด้วยป้าย → กราฟ/ตารางมีแค่ 2 รายนี้
//     ค่าแท่ง = ตารางแถวเดียวกัน · แท่งเป้าสูงต่างกันตามเป้า · ตัวเลขคู่ไม่ทับกัน · ไม่ล้นกรอบการ์ด/หน้า
//   ตกบนโค้ดเดิม (97a8ab9e): ไม่มีกล่อง [data-pair-bars] (กราฟเป็นแถบนอน div)
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ");
test.describe.configure({ mode: "serial" });
const ป้าย = `ZZTEST แท่งคู่ ${Date.now() % 100000}`;
let ก: สาขาของข้อ, ข: สาขาของข้อ;
test.beforeAll(async () => {
  ก = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", เป้า: 36_500_000, ชื่อ: `${ป้าย} ก` });
  ข = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", เป้า: 7_300_000, ชื่อ: `${ป้าย} ข` });
});
test.afterAll(async () => { await ก?.ลบ(); await ข?.ลบ(); });

for (const กว้าง of [1440, 760]) {
  test(`[H·hq] ภาพรวมยอดขาย จอ ${กว้าง}px: ยอดขายเทียบเป้า = แท่งคู่แนวตั้ง · ค่าแท่ง = ตาราง · ตัวเลขไม่ทับกัน · ไม่ล้นกรอบ`, async ({ page }) => {
    await page.setViewportSize({ width: กว้าง, height: 1000 });
    await open(page, "hq", "/hq/pipeline");
    await settle(page);
    await page.getByLabel("ค้นหาดีลเลอร์", { exact: true }).fill(ป้าย);
    const กล่อง = page.locator("[data-pair-bars]");
    await expect(กล่อง, "กราฟเป็นแท่งคู่แนวตั้ง").toBeVisible({ timeout: 30_000 });
    const แท่ง = กล่อง.locator("rect[data-bar-col]");
    await expect(แท่ง, "2 ดีลเลอร์ของข้อ × 2 ชุด").toHaveCount(4, { timeout: 20_000 });
    const ข้อมูล = await แท่ง.evaluateAll(es => es.map(e => {
      const r = e.getBoundingClientRect();
      return { key: e.getAttribute("data-bar-col") ?? "", ชุด: e.getAttribute("data-bar-series") ?? "", v: Number(e.getAttribute("data-value")), x: r.left, ขวา: r.right, ล่าง: r.bottom, สูง: r.height };
    }));
    expect([...new Set(ข้อมูล.map(d => d.ชุด))], "2 ชุด: ยอดขาย · เป้า").toEqual(["ยอดขายในช่วง", "เป้าตามช่วง"]);
    expect(new Set(ข้อมูล.map(d => d.key)), "แท่งเป็นของดีลเลอร์ของข้อ").toEqual(new Set([ก.รหัส, ข.รหัส]));
    // แนวตั้ง: ทุกแท่งตั้งบนแกนล่างเดียวกัน · กลุ่มเรียงซ้าย→ขวา
    for (const d of ข้อมูล) expect(Math.abs(d.ล่าง - ข้อมูล[0].ล่าง), `แท่ง ${d.key} ตั้งบนแกนเดียวกัน`).toBeLessThan(1.5);
    const ยอด = ข้อมูล.filter(d => d.ชุด === "ยอดขายในช่วง");
    expect(ยอด[1].x, "กลุ่มที่ 2 อยู่ขวากลุ่มแรก").toBeGreaterThan(ยอด[0].x);

    // ค่าแท่ง = ตาราง (แถวเดียวกัน) · แท่งเป้าของ ก (เป้าปีสูงกว่า 5 เท่า) สูงกว่าของ ข
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
    expect(เป้า(ก.รหัส).v, "เป้าตามช่วงของ ก > ข").toBeGreaterThan(เป้า(ข.รหัส).v);
    expect(เป้า(ก.รหัส).สูง, "แท่งเป้า ก สูงกว่า ข (ความสูงตามค่า)").toBeGreaterThan(เป้า(ข.รหัส).สูง);

    // ตัวเลขบนหัวแท่ง: ครบทุกแท่ง · คู่ในกลุ่มไม่ทับกัน
    const ตัวเลข = await กล่อง.locator("text[data-bar-label]").evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return { key: e.getAttribute("data-bar-label") ?? "", l: r.left, r: r.right, t: r.top, b: r.bottom }; }));
    expect(ตัวเลข.length, "ตัวเลขบนหัวแท่งทุกแท่ง").toBe(4);
    for (let i = 0; i + 1 < ตัวเลข.length; i += 2) {
      const [p, q] = [ตัวเลข[i], ตัวเลข[i + 1]];
      const ทับ = p.r > q.l + 0.5 && q.r > p.l + 0.5 && p.b > q.t + 0.5 && q.b > p.t + 0.5;
      expect(ทับ, `ตัวเลขยอดขาย/เป้าของ ${p.key} ไม่ทับกัน`).toBe(false);
    }

    // ไม่ล้น: กรอบกราฟไม่กว้างเกินการ์ด · แท่งอยู่ในกรอบ · หน้าไม่มีแถบเลื่อนแนวนอน
    const กรอบ = (await กล่อง.boundingBox())!;
    const การ์ด = await กล่อง.evaluate(e => { const r = (e.closest(".card") as HTMLElement).getBoundingClientRect(); return { l: r.left, r: r.right }; });
    expect(กรอบ.x + กรอบ.width, "กรอบกราฟไม่เกินขอบการ์ด").toBeLessThanOrEqual(การ์ด.r + 1);
    for (const d of ข้อมูล) expect(d.ขวา, `แท่ง ${d.key} อยู่ในกรอบ`).toBeLessThanOrEqual(กรอบ.x + กรอบ.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "หน้าไม่ล้นแนวนอน").toBe(true);
  });
}
