import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── หน้าต่างเจาะลึกกลางจอ + แผงดีลเลอร์ที่ถึงเป้า + เป้าทั้งเครือ = ผลรวมเป้าสาขา (บอสสั่ง 9 พ.ย. 69 · ใบ 0283) ─────────────────
//   1) ทุกแผงที่มาการ์ด/รายเดือน (ภาพรวมยอดขาย · ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้า) = หน้าต่างกลางจอแบบเดียวกัน
//      (แถบหัวน้ำเงิน · ส่วนมีไอคอน+หัวข้อ · ตารางในกล่องขาว) · ไม่มีแถวรวม · กดแถวดีลเลอร์ = เจาะลงดีลเลอร์นั้น
//   2) แผงถึงเป้า: ช่วงเดียวกับการ์ด · 2 กลุ่ม ถึงเป้า/ยังไม่ถึง เรียง % มากไปน้อย · จำนวนกลุ่มถึงเป้า = การ์ด
//      ยอด/เป้าตามช่วงในแผง = ตารางผลงาน · ถึงเป้า = ยอดในช่วง ≥ เป้าตามช่วง · ไม่มีปุ่ม "แสดงเฉพาะดีลเลอร์ที่ถึงเป้าในตาราง"
//   3) เส้นทาง api (/api/v1/metrics · แบบเว็บจริง): เป้าการ์ด = ผลรวมเป้าตามช่วงรายดีลเลอร์ ทั้งเครือ/กรองสาขา · แดชบอร์ด HQ ใช้ผลรวมเดียวกัน
//      ถึงเป้า = ยอดในช่วง ≥ เป้าตามช่วง (C: ยอดวันนี้ 200,000 ≥ เป้า 1 วัน 100,000 แต่ยอดต้นปี < เป้าทั้งปี)
//   ตกบนโค้ดเดิม: แผงชิดขวา (ไม่มี data-drill-window) · แผงถึงเป้าตารางเดียว + ปุ่มกรอง · เป้าทั้งเครือ = hq_targets · ถึงเป้า = ยอดต้นปี ≥ เป้าทั้งปี
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const ป้าย = `ZZTEST หน้าต่าง ${Date.now() % 100000}`;
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
let A: สาขาของข้อ, B: สาขาของข้อ, C: สาขาของข้อ;
const เลข = 946_000_000 + (Date.now() % 100_000) * 10;

test.beforeAll(async () => {
  // A: เป้าปี 365,000 (วันละ 1,000) ยอด 400,000 = ถึงเป้าทุกช่วง ≤ 1 ปี · B: เป้าปี 3,650 ล้าน ยอด 150,000 = ไม่ถึงทุกช่วง
  // C: เป้าปี 36.5 ล้าน (วันละ 100,000) ยอดวันนี้ 200,000 — ช่วง 1 วันถึงเป้า แต่ยอดต้นปียังไม่ถึงเป้าทั้งปี (แยกกติกาใหม่/เดิม)
  A = await สร้างสาขาของข้อ({ จังหวัด: "ยะลา", ภาค: "ใต้", เป้า: 365_000, ชื่อ: `${ป้าย} ก` });
  B = await สร้างสาขาของข้อ({ จังหวัด: "สกลนคร", ภาค: "อีสาน", เป้า: 3_650_000_000, ชื่อ: `${ป้าย} ข` });
  C = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", เป้า: 36_500_000, ชื่อ: `${ป้าย} ค` });
  const ลีด = (code: string, n: number) => `('#L-${n}', ${n}, '${code}', 'ZZTEST ลูกค้า ${n}', 'ZZTEST', '000-000-${String(n % 10000).padStart(4, "0")}', 'ยะลา', 'PAID', '${วันนี้}')`;
  // ใบตอบรับต้องผูกลูกค้า (ข้อจำกัด quotations_won_requires_customer)
  const ใบ = (s: สาขาของข้อ, ยอด: number, ชั่วโมง: number, ลูกค้า: number) =>
    `('${s.รหัส}-Q1', '${s.รหัส}', 'ZZTEST ลูกค้า', 'won', ${ยอด}, '[]', null, ${ลูกค้า}, '${วันนี้}', '${วันนี้} ${ชั่วโมง}:00:00+07')`;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
      ${[ลีด(A.รหัส, เลข + 1), ลีด(B.รหัส, เลข + 2), ลีด(C.รหัส, เลข + 3)].join(", ")};
    insert into public.customers (id, dealer_code, name, company, province) values
      (${เลข + 1}, '${A.รหัส}', 'ZZTEST ลูกค้า A', 'ZZTEST ลูกค้า A', 'ยะลา'), (${เลข + 2}, '${B.รหัส}', 'ZZTEST ลูกค้า B', 'ZZTEST ลูกค้า B', 'สกลนคร'),
      (${เลข + 3}, '${C.รหัส}', 'ZZTEST ลูกค้า C', 'ZZTEST ลูกค้า C', 'ตราด');
    insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, hq_quote_id, customer_id, date, won_at) values
      ${[ใบ(A, 400000, 9, เลข + 1), ใบ(B, 150000, 10, เลข + 2), ใบ(C, 200000, 11, เลข + 3)].join(", ")};
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values
      ('${A.รหัส}', '${A.รหัส}-Q1', '${วันนี้} 09:00:00+07'), ('${B.รหัส}', '${B.รหัส}-Q1', '${วันนี้} 10:00:00+07'), ('${C.รหัส}', '${C.รหัส}-Q1', '${วันนี้} 11:00:00+07');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  for (const s of [A, B, C]) if (s) {
    รันSQLในฐาน(`set local session_replication_role = replica;
      delete from public.quotation_won_at where dealer_code = '${s.รหัส}';
      delete from public.quotations where dealer_code = '${s.รหัส}';
      delete from public.customers where dealer_code = '${s.รหัส}';
      delete from public.leads where dealer_code = '${s.รหัส}';
      set local session_replication_role = origin;`);
    await s.ลบ();
  }
});

/** หน้าต่างกลางจอแบบเดียวกัน: ซ้าย = ขวา · บน = ล่าง (±2px) · แถบหัวน้ำเงิน · ไม่มีแถวรวม */
async function ตรวจหน้าต่าง(page: Page, แผง: Locator, ที่: string) {
  await expect(แผง, `${ที่}: เปิดเป็นหน้าต่างเจาะลึก`).toHaveAttribute("data-drill-window", "");
  const กรอบ = (await แผง.boundingBox())!;
  const จอ = page.viewportSize()!;
  expect(Math.abs(กรอบ.x - (จอ.width - กรอบ.x - กรอบ.width)), `${ที่}: กลางจอแนวนอน (ไม่ชิดขวา)`).toBeLessThanOrEqual(2);
  expect(Math.abs(กรอบ.y - (จอ.height - กรอบ.y - กรอบ.height)), `${ที่}: กลางจอแนวตั้ง`).toBeLessThanOrEqual(2);
  expect(กรอบ.width, `${ที่}: ไม่เต็มจอ`).toBeLessThan(จอ.width - 100);
  expect(await แผง.locator("[data-drill-head]").evaluate(e => getComputedStyle(e).backgroundColor), `${ที่}: แถบหัวน้ำเงิน`).toBe("rgb(0, 51, 102)");
  await expect(แผง.locator("[data-drill-section]").first(), `${ที่}: เนื้อหาเป็นส่วนมีหัวข้อ`).toBeVisible();
  await expect(แผง.locator("[data-drill-section] [data-drill-section-title] svg").first(), `${ที่}: หัวข้อส่วนมีไอคอน`).toBeVisible();
  await expect(แผง.locator("[data-drill-box] table").first(), `${ที่}: ตารางอยู่ในกล่องขาว`).toBeVisible();
  await expect(แผง.locator("tfoot, [data-drawer-total]"), `${ที่}: ไม่มีแถวรวม`).toHaveCount(0);
  for (const t of await แผง.locator("tbody tr td:first-child").allInnerTexts())
    expect(t.trim(), `${ที่}: ไม่มีแถวสรุป "รวม"`).not.toMatch(/^รวม/);
}
const เลขของ = (s: string | null) => Number(s ?? "NaN");

test("[ui·hq] ภาพรวมยอดขาย: ทุกแผงการ์ด = หน้าต่างกลางจอ ไม่มีแถวรวม · แผงถึงเป้า 2 กลุ่ม = การ์ด = ตาราง · กดแถวเจาะดีลเลอร์", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 820 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByLabel("ค้นหาดีลเลอร์").fill(ป้าย);
  await expect(page.locator("[data-perf-row]")).toHaveCount(3, { timeout: 30_000 });
  const ตารางผลงาน = page.getByRole("table", { name: "ตารางผลงานดีลเลอร์" });
  const ค่าตาราง = async (code: string, k: string) => เลขของ(await ตารางผลงาน.locator(`tr:has([data-perf-row="${code}"]) [data-cell="${k}"]`).first().getAttribute("data-value"));

  for (const k of ["sales", "winRate", "margin"] as const) {
    await page.locator(`[data-kpi-row] [data-kpi="${k}"]`).click();
    const แผง = page.locator(`[data-card-drawer="${k}"]`);
    await ตรวจหน้าต่าง(page, แผง, `การ์ด ${k}`);
    await expect(แผง.locator("[data-drawer-row]"), `การ์ด ${k}: แถวรายดีลเลอร์ = ดีลเลอร์ในตาราง`).toHaveCount(3);
    await แผง.getByRole("button", { name: "ปิดแผง" }).click();
    await expect(แผง).toHaveCount(0);
  }

  // ── แผงถึงเป้า ──
  await page.locator('[data-kpi-row] [data-kpi="onTarget"]').click();
  const แผง = page.locator('[data-card-drawer="onTarget"]');
  await ตรวจหน้าต่าง(page, แผง, "การ์ดถึงเป้า");
  await expect(แผง.locator('[data-act="only-on-target"]'), "ไม่มีปุ่มกรองถึงเป้าในตาราง").toHaveCount(0);
  await expect(page.getByText("แสดงเฉพาะดีลเลอร์ที่ถึงเป้าในตาราง"), "ไม่มีปุ่มกรองถึงเป้าในตาราง").toHaveCount(0);
  const [ต้น, ท้าย] = [await page.locator("[data-kpi-row]").first().getAttribute("data-range-start"), await page.locator("[data-kpi-row]").first().getAttribute("data-range-end")];
  const วัน = Math.round((Date.parse(`${ท้าย}T00:00:00Z`) - Date.parse(`${ต้น}T00:00:00Z`)) / 86_400_000) + 1;
  await expect(แผง.locator("[data-drill-sub]"), "หัวบอกช่วงเดียวกับการ์ด (จำนวนวัน) + สูตร").toContainText(`(${วัน.toLocaleString()} วัน)`);
  await expect(แผง.locator("[data-drill-sub]")).toContainText("เป้าทั้งปี × วัน ÷ 365");
  const การ์ดถึง = เลขของ(await page.locator('[data-kpi-row] [data-kpi="onTarget"] [data-value]').first().getAttribute("data-value"));
  const ถึง = แผง.locator('[data-group="reached"]'), ยัง = แผง.locator('[data-group="pending"]');
  await expect(ถึง.locator("[data-drill-section-title]"), "หัวกลุ่มบน: ถึงเป้า (n)").toHaveText(`ถึงเป้า (${การ์ดถึง})`);
  await expect(ถึง.locator("[data-drawer-row]"), "จำนวนกลุ่มถึงเป้า = ตัวเลขบนการ์ด").toHaveCount(การ์ดถึง);
  await expect(ยัง.locator("[data-drill-section-title]"), "หัวกลุ่มล่าง: ยังไม่ถึง (n)").toHaveText(`ยังไม่ถึง (${3 - การ์ดถึง})`);
  await expect(ถึง.locator(`[data-drawer-row="${A.รหัส}"]`), "A ถึงเป้า").toHaveCount(1);
  await expect(ยัง.locator(`[data-drawer-row="${B.รหัส}"]`), "B ยังไม่ถึง").toHaveCount(1);
  await expect(แผง.locator('[data-drill-badge="reached"]')).toHaveText(`ถึงเป้า ${การ์ดถึง} จาก 3 ราย`);
  for (const [กลุ่ม, ถึงไหม] of [[ถึง, true], [ยัง, false]] as const) {
    const แถว = กลุ่ม.locator("tbody tr:has([data-drawer-row])");
    const pcts: number[] = [];
    for (let i = 0; i < await แถว.count(); i++) {
      const r = แถว.nth(i);
      const code = (await r.locator("[data-drawer-row]").getAttribute("data-drawer-row"))!;
      const ยอด = เลขของ(await r.locator('[data-cell="sales"]').getAttribute("data-value"));
      const เป้า = เลขของ(await r.locator('[data-cell="target"]').getAttribute("data-value"));
      const ขาด = เลขของ(await r.locator('[data-cell="gap"]').getAttribute("data-value"));
      expect(ยอด, `${code}: ยอดในแผง = ตารางผลงาน`).toBe(await ค่าตาราง(code, "sales"));
      expect(เป้า, `${code}: เป้าตามช่วงในแผง = ตารางผลงาน`).toBe(await ค่าตาราง(code, "target"));
      expect(ยอด >= เป้า, `${code}: ${ถึงไหม ? "ถึงเป้า" : "ยังไม่ถึง"} = ยอดในช่วง ${ยอด} ${ถึงไหม ? "≥" : "<"} เป้าตามช่วง ${เป้า}`).toBe(ถึงไหม);
      expect(ขาด, `${code}: ขาดอีก = เป้า − ยอด (ไม่ติดลบ)`).toBe(Math.max(0, เป้า - ยอด));
      await expect(r.locator('[data-cell="pct"] .bar-grow'), `${code}: % เป้ามีแถบ .bar-grow`).toHaveCount(1);
      pcts.push(เลขของ(await r.locator('[data-cell="pct"]').getAttribute("data-value")));
    }
    expect(pcts, "แต่ละกลุ่มเรียง % มากไปน้อย").toEqual([...pcts].sort((a, b) => b - a));
  }
  // กดแถว = เจาะลงดีลเลอร์นั้น (หน้าต่างปิด · ตารางเหลือดีลเลอร์เดียว · แถบระดับถึงดีลเลอร์)
  //   ⚠️ ช่องชื่อเป็นลิงก์ไปหน้าดีลเลอร์ (ลิงก์กลาง · บอสสั่ง 11 พ.ย. 69) → กดช่องตัวเลขของแถวเพื่อเจาะลง
  //      (ตกรอบ deploy19: กดกลางช่องชื่อ = โดนลิงก์ ไปหน้าดีลเลอร์แทนการเจาะลง)
  await ถึง.locator(`tr:has([data-drawer-row="${A.รหัส}"]) [data-cell="sales"]`).click();
  await expect(แผง, "กดแถวแล้วหน้าต่างปิด").toHaveCount(0);
  await expect(page.locator("[data-perf-row]"), "เจาะลงดีลเลอร์ A").toHaveCount(1, { timeout: 20_000 });
  await expect(page.locator("[data-crumbs] [data-crumb]").last()).toContainText(`${ป้าย} ก`);
  // ระดับดีลเลอร์: แผงถึงเป้าเหลือดีลเลอร์นี้ · จำนวน = การ์ด
  await page.locator('[data-kpi-row] [data-kpi="onTarget"]').click();
  await ตรวจหน้าต่าง(page, แผง, "การ์ดถึงเป้า ระดับดีลเลอร์");
  await expect(แผง.locator("[data-drawer-row]"), "ระดับดีลเลอร์: แถวเดียว").toHaveCount(1);
  await expect(ถึง.locator("[data-drawer-row]")).toHaveCount(เลขของ(await page.locator('[data-kpi-row] [data-kpi="onTarget"] [data-value]').first().getAttribute("data-value")));
  await page.keyboard.press("Escape");
  await expect(แผง, "Esc ปิดหน้าต่าง").toHaveCount(0);
  // ระดับดีลเลอร์: แผงยอดขายรายเดือน = หน้าต่างแบบเดียวกัน
  await page.locator('[data-kpi-row] [data-kpi="sales"]').click();
  const แผงยอด = page.locator('[data-card-drawer="sales"]');
  await ตรวจหน้าต่าง(page, แผงยอด, "การ์ดยอดขาย ระดับดีลเลอร์ (รายเดือน)");
  await แผงยอด.getByRole("button", { name: "ปิดแผง", exact: true }).click();
  await expect(แผงยอด).toHaveCount(0);
  assertNoErrors(errs, "/hq/pipeline");
});

test("[ui·hq] ภาพรวมยอดขาย แท็บรายเดือน: กดเดือน = หน้าต่างกลางจอ ไม่มีแถวรวม · กดแถวเจาะดีลเลอร์", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 820 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByLabel("ค้นหาดีลเลอร์").fill(ป้าย);
  await expect(page.locator("[data-perf-row]")).toHaveCount(3, { timeout: 30_000 });
  await page.locator('[data-dim="month"]').click();
  const เดือน = page.locator("[data-month-row]").last();
  await expect(เดือน).toBeVisible({ timeout: 20_000 });
  await เดือน.click();
  const แผง = page.locator("[data-month-drawer]");
  await ตรวจหน้าต่าง(page, แผง, "แผงรายเดือน");
  await expect(แผง.locator("[data-drawer-row]"), "เดือนนี้: 3 สาขาของข้อ").toHaveCount(3);
  await แผง.locator(`tr:has([data-drawer-row="${B.รหัส}"]) td.num`).first().click();   // ช่องชื่อเป็นลิงก์ไปหน้าดีลเลอร์ (11 พ.ย. 69) → กดช่องตัวเลข
  await expect(แผง).toHaveCount(0);
  await expect(page.locator("[data-crumbs] [data-crumb]").last(), "กดแถว = เจาะลงดีลเลอร์ B").toContainText(`${ป้าย} ข`);
});

for (const path of ["/hq/leads", "/hq/quotations", "/hq/customers"]) {
  test(`[ui·hq] ${path}: แผงที่มาทุกการ์ด = หน้าต่างกลางจอ ไม่มีแถวรวม · กดแถวดีลเลอร์ = เจาะลงดีลเลอร์`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: 1366, height: 820 });
    await loginUI(page, HQ_ORIGIN, path, ADMIN);
    await settle(page);
    const การ์ด = page.locator("[data-kpi-row] button[data-kpi]");
    await expect(การ์ด.first()).toBeVisible({ timeout: 30_000 });
    const คีย์ = await การ์ด.evaluateAll(es => es.map(e => e.getAttribute("data-kpi")!));
    expect(คีย์.length, "มีการ์ดให้กด").toBeGreaterThan(0);
    for (const k of คีย์) {
      await page.locator(`[data-kpi-row] button[data-kpi="${k}"]`).click();
      const แผง = page.locator('[data-drill-drawer^="card:"]');
      await ตรวจหน้าต่าง(page, แผง, `${path} การ์ด ${k}`);
      await แผง.getByRole("button", { name: "ปิดแผง" }).click();
      await expect(แผง).toHaveCount(0);
    }
    // กดแถวดีลเลอร์ในหน้าต่าง = เจาะลงดีลเลอร์นั้น (ตารางสรุปเป็นรายเดือน)
    await page.locator(`[data-kpi-row] button[data-kpi="${คีย์[0]}"]`).click();
    const แผง = page.locator('[data-drill-drawer^="card:"]');
    const แถวแรก = แผง.locator("[data-drawer-row]").first();
    await expect(แถวแรก).toBeVisible({ timeout: 20_000 });
    const ชื่อ = (await แถวแรก.innerText()).trim();
    // ช่องชื่อเป็นลิงก์ไปหน้าดีลเลอร์ (ลิงก์กลาง · บอสสั่ง 11 พ.ย. 69) → กดช่องตัวเลขของแถวเพื่อเจาะลง (กดกลางช่องชื่อ = โดนลิงก์ ผลขึ้นกับความยาวชื่อ)
    await แผง.locator("tr:has([data-drawer-row]) td.num").first().click();
    await expect(แผง, "กดแถวแล้วหน้าต่างปิด").toHaveCount(0);
    await expect(page.locator("[data-drill-table]"), "เจาะลงดีลเลอร์: ตารางสรุปเป็นรายเดือน").toHaveAttribute("data-drill-table", "month", { timeout: 20_000 });
    await expect(page.locator("[data-crumbs] [data-crumb]").last(), "แถบระดับถึงดีลเลอร์ที่กด").toContainText(ชื่อ);
    assertNoErrors(errs, path);
  });
}

test("[api·hq] เส้นทาง api: เป้าการ์ด = ผลรวมเป้าตามช่วงรายดีลเลอร์ (ทั้งเครือ/กรองสาขา) · แดชบอร์ด HQ ผลรวมเดียวกัน · ถึงเป้า = ยอดในช่วง ≥ เป้าตามช่วง", async ({ request }) => {
  const r = await request.post(`${HQ_ORIGIN}/api/v1/auth?op=login`, { data: ADMIN });
  expect(r.ok(), `เข้าระบบ HQ (${r.status()})`).toBe(true);
  const เรียก = async (k: string, data: Record<string, unknown>) => {
    const x = await request.post(`${HQ_ORIGIN}/api/v1/metrics?k=${k}`, { data });
    expect(x.status(), `${k}: ${await x.text()}`).toBe(200);
    return x.json();
  };
  type แถว = { code: string; target: number | null; sales: number; onTarget: boolean };
  const รวมเป้า = (rows: แถว[]) => { const s = rows.reduce((a, x) => a + (x.target ?? 0), 0); return s === 0 ? null : s; };
  // กรองสาขาของข้อ · ช่วง 1 วัน (วันนี้)
  const ชุด = [A.รหัส, B.รหัส, C.รหัส];
  const ช่วง = { start: วันนี้, end: วันนี้, today: วันนี้ };
  const แถวชุด = await เรียก("hqPipelineDealers", { ...ช่วง, dealers: ชุด }) as แถว[];
  const การ์ดชุด = await เรียก("kpiCards", { page: "hq.pipeline", ...ช่วง, dealer: null, filters: { dealerCodes: ชุด } });
  expect(การ์ดชุด.sales.target, "กรองสาขา: เป้าการ์ด = ผลรวมเป้าตามช่วงรายดีลเลอร์").toBe(รวมเป้า(แถวชุด));
  expect(การ์ดชุด.sales.target, "เป้าตามช่วง 1 วัน = 1,000 + 10,000,000 + 100,000").toBe(10_101_000);
  expect(new Set(แถวชุด.filter(x => x.onTarget).map(x => x.code)), "ถึงเป้ารายแถว = ยอดในช่วง ≥ เป้าตามช่วง: A + C (C ยอดต้นปี < เป้าทั้งปี)").toEqual(new Set([A.รหัส, C.รหัส]));
  expect(การ์ดชุด.onTarget, "การ์ดถึงเป้า = แถวที่ถึง").toEqual({ reached: 2, of: 3, codes: [A.รหัส, C.รหัส].sort() });
  // ทั้งเครือ (ไม่กรอง) — ข้ออื่นเพิ่ม/ลบสาขาระหว่างอ่านได้ → อ่านทั้ง 3 ตัวใหม่จนชุดเดียวกัน (สูงสุด 3 รอบ · ไม่เพิ่มเวลารอ)
  let แถวทั้งหมด: แถว[] = [], การ์ด: { sales: { target: number | null }; onTarget: { reached: number } }, แดช: { cards: { target: number | null } };
  for (let รอบ = 0; ; รอบ++) {
    [แถวทั้งหมด, การ์ด, แดช] = await Promise.all([
      เรียก("hqPipelineDealers", { ...ช่วง, dealers: null }) as Promise<แถว[]>,
      เรียก("kpiCards", { page: "hq.pipeline", ...ช่วง, dealer: null }),
      เรียก("hqDashboard", { ...ช่วง, dealer: null }),
    ]);
    if ((การ์ด.sales.target === รวมเป้า(แถวทั้งหมด) && แดช.cards.target === การ์ด.sales.target) || รอบ === 2) break;
  }
  expect(การ์ด.sales.target, "ทั้งเครือ: เป้าการ์ด = ผลรวมเป้าตามช่วงในตาราง (ไม่ใช่เป้าที่ตั้งในหน้าตั้งค่า)").toBe(รวมเป้า(แถวทั้งหมด));
  expect(แดช.cards.target, "แดชบอร์ด HQ ทั้งเครือ: เป้าเดียวกับการ์ดภาพรวมยอดขาย").toBe(การ์ด.sales.target);
  expect(การ์ด.onTarget.reached, "ทั้งเครือ: ถึงเป้าการ์ด = จำนวนแถวที่ถึง").toBe(แถวทั้งหมด.filter(x => x.onTarget).length);
});
