import { test, expect, type Page } from "@playwright/test";
import { open, settle, เลือกตัวกรอง } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ตั้งค่าเจาะลึกทั้งหมด } from "@pms/shared/lib/hqDrillConfig";
import { เดือนในช่วง } from "@pms/shared/lib/hqDrill";

// ─── กราฟรายเดือนในหน้าเจาะลึก HQ = กราฟแท่งแนวตั้ง (บอสสั่ง 19 พ.ย. 69 "ทำเป็นกราฟแท่ง") ───
//   เดิม: แท็บรายเดือนเป็นแถบแนวนอนเหมือนหลอดความคืบหน้า เรียงลงมาทีละเดือน + แถบเลื่อนในกล่อง
//   ตอนนี้: แท่งตั้ง · เดือนเรียงซ้าย→ขวาตามช่วงวันที่ด้านบน · ทุกเดือนในช่วงมีช่อง (ค่า 0 = แท่งสูง 0) · ตัวเลขบนหัวแท่งทุกแท่ง
//     ไม่มีแถบเลื่อน (12–13 เดือนพอดีกล่อง) · ตัวกราฟกลางตัวเดียว (GroupedBarChart) ทั้ง 3 หน้า (ลูกค้าเป้าหมาย/ใบเสนอราคา/ลูกค้า)
//   ผลรวมค่าแท่ง = ตัวเลขบนการ์ดคู่ (ชุดแถวเดียวกัน · ช่วงเดียวกัน) — ตรวจที่ระดับดีลเลอร์ของข้อเอง (ไม่นับข้อมูลตั้งต้นร่วม)
//     สาขาของข้อมีลูกค้า 4 ราย: เดือนนี้ 2 · 2 เดือนก่อน 1 · 30 เดือนก่อน 1 → กราฟลูกค้าใหม่รวม 3 = การ์ด · เดือนอื่นเป็น 0 แต่มีช่อง
//     หน้าลูกค้าเป้าหมาย/ใบเสนอราคา: สาขาของข้อไม่มีงาน → ทุกแท่ง 0 = การ์ด 0 (ตรวจรูปกราฟ/ช่องครบ/ไม่ล้น)
//   ตกบนโค้ดเดิม (e506ce56): ไม่มีกล่อง [data-month-bars] — แท็บรายเดือนยังเป็นแถว [data-bar-row] แนวนอน
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ");
test.describe.configure({ mode: "serial" });
let สาขา: สาขาของข้อ;
const ฐานเลข = 9_100_000 + Math.floor(Math.random() * 80_000) * 10;
const วันที่ = (ย้อนเดือน: number) => { const d = new Date(Date.now() + 7 * 3600_000); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - ย้อนเดือน); return d.toISOString().slice(0, 10); };
const วันนี้ = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const เข้า = [วันนี้, วันนี้, วันที่(2), วันที่(30)];
test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const c = สาขา.รหัส;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province, join_date) values
      ${เข้า.map((d, i) => `(${ฐานเลข + i}, '${c}', 'ZZTEST แท่ง ${c}-${i}', 'ZZTEST แท่ง ${c}-${i}', 'ตราด', '${d}')`).join(", ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางลูกค้าของสาขาไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica; delete from public.customers where dealer_code = '${สาขา.รหัส}'; set local session_replication_role = origin;`);
  await สาขา.ลบ();
});

const หน้า = [
  { path: "/hq/leads", cfg: ตั้งค่าเจาะลึกทั้งหมด.leads },
  { path: "/hq/quotations", cfg: ตั้งค่าเจาะลึกทั้งหมด.quotations },
  { path: "/hq/customers", cfg: ตั้งค่าเจาะลึกทั้งหมด.customers },
];

async function ค่าการ์ด(page: Page, kpi: string): Promise<number> {
  const ค่า = await page.locator(`[data-kpi-row] [data-kpi="${kpi}"] [data-value]`).evaluateAll(es => es.map(e => e.getAttribute("data-value")));
  expect(ค่า.length, `มีการ์ด ${kpi}`).toBeGreaterThan(0);
  return Number(ค่า[0] ?? 0);
}

for (const { path, cfg } of หน้า) {
  test(`[H·hq] ${path} แท็บรายเดือน = กราฟแท่งแนวตั้ง เดือนเรียงซ้าย→ขวา · ทุกเดือนมีช่อง · ตัวเลขบนหัวแท่ง · ผลรวม = การ์ด · ไม่ล้น/ไม่มีแถบเลื่อน`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await open(page, "hq", path);
    await settle(page);
    // เจาะลงดีลเลอร์ของข้อ → ระดับดีลเลอร์ = แท็บรายเดือนแท็บเดียว
    await เลือกตัวกรอง(page, "ดีลเลอร์", { ค่า: สาขา.รหัส }, page.locator("[data-drill-scope]"));
    await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), "แถบระดับถึงดีลเลอร์ของข้อ").toHaveText(สาขา.ชื่อ);
    const กราฟ = page.locator("[data-drill-chart]");
    await expect(กราฟ).toHaveAttribute("data-drill-chart", "month");
    const กล่อง = กราฟ.locator("[data-month-bars]");
    await expect(กล่อง, "แท็บรายเดือนเป็นกราฟแท่ง (ไม่ใช่แถบแนวนอน)").toBeVisible({ timeout: 30_000 });
    await expect(กราฟ.locator("[data-bar-row]"), "ไม่มีแถบแนวนอนแบบเดิม").toHaveCount(0);

    // เดือนตามช่วงวันที่ด้านบน — ทุกเดือนมีช่อง เรียงตามปฏิทิน
    const ช่วง = page.locator("[data-time-range]");
    const [start, end] = [await ช่วง.getAttribute("data-start"), await ช่วง.getAttribute("data-end")];
    expect(start && end, "อ่านช่วงวันที่ด้านบนได้").toBeTruthy();
    const คาดเดือน = เดือนในช่วง(start!, end!);
    const แท่ง = กล่อง.locator("rect[data-bar-col]");
    await expect(แท่ง, "หนึ่งเดือน = หนึ่งแท่ง (เดือนที่เป็น 0 ยังมีช่อง)").toHaveCount(คาดเดือน.length);
    const ข้อมูล = await แท่ง.evaluateAll(es => es.map(e => {
      const r = e.getBoundingClientRect();
      return { key: e.getAttribute("data-bar-col"), v: Number(e.getAttribute("data-value")), x: r.left, w: r.width, ล่าง: r.bottom };
    }));
    expect(ข้อมูล.map(d => d.key), "เดือนเรียงซ้าย→ขวาตามปฏิทิน").toEqual(คาดเดือน.map(m => `month:${m.key}`));
    for (let i = 1; i < ข้อมูล.length; i++) expect(ข้อมูล[i].x, `แท่งที่ ${i + 1} อยู่ขวาของแท่งก่อนหน้า`).toBeGreaterThan(ข้อมูล[i - 1].x);
    const ฐาน = ข้อมูล[0].ล่าง;
    for (const d of ข้อมูล) expect(Math.abs(d.ล่าง - ฐาน), `แท่ง ${d.key} ตั้งบนแกนเดียวกัน (แนวตั้ง)`).toBeLessThan(1.5);
    await expect(กล่อง.locator("[data-x-label]"), "ป้ายเดือนครบทุกแท่ง").toHaveCount(คาดเดือน.length);
    await expect(กล่อง.locator("text[data-bar-label]"), "ตัวเลขบนหัวแท่งทุกแท่ง").toHaveCount(คาดเดือน.length);

    // ผลรวมค่าแท่ง = การ์ดคู่
    const คีย์แท่ง = cfg.แท่งรายเดือน?.k ?? cfg.แท่ง;
    const ใบ = cfg.การ์ด.find(c => c.k === คีย์แท่ง)!;
    expect(ใบ, `มีการ์ดคู่ของแท่ง ${คีย์แท่ง}`).toBeTruthy();
    const คาดรวม = path === "/hq/customers" ? เข้า.filter(d => d >= start! && d <= end!).length : 0;
    if (path === "/hq/customers") expect(คาดรวม, "ช่วงตั้งต้นครอบลูกค้าเดือนนี้ + 2 เดือนก่อน").toBe(3);
    await expect.poll(() => ค่าการ์ด(page, ใบ.kpi), { message: `การ์ด "${ใบ.l}" ของสาขาของข้อ`, timeout: 20_000 }).toBe(คาดรวม);
    expect(ข้อมูล.reduce((a, d) => a + d.v, 0), `ผลรวมแท่งรายเดือน = การ์ด "${ใบ.l}"`).toBe(คาดรวม);

    // ไม่ล้นกล่อง · ไม่มีแถบเลื่อน (จอ 1440)
    const ขนาด = await กล่อง.evaluate(e => ({ sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight }));
    expect(ขนาด.sw, "ไม่มีแถบเลื่อนแนวนอน").toBeLessThanOrEqual(ขนาด.cw + 1);
    expect(ขนาด.sh, "ไม่มีแถบเลื่อนแนวตั้ง").toBeLessThanOrEqual(ขนาด.ch + 1);
    const [กรอบ, รูป] = [await กราฟ.boundingBox(), await กล่อง.locator("svg").boundingBox()];
    expect(รูป!.x, "กราฟไม่ล้นซ้าย").toBeGreaterThanOrEqual(กรอบ!.x - 1);
    expect(รูป!.x + รูป!.width, "กราฟไม่ล้นขวา").toBeLessThanOrEqual(กรอบ!.x + กรอบ!.width + 1);
    expect(รูป!.y + รูป!.height, "กราฟไม่ล้นล่าง").toBeLessThanOrEqual(กรอบ!.y + กรอบ!.height + 1);
  });
}
