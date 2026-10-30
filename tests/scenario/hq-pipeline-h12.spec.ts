import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── หน้า HQ ภาพรวมยอดขาย (/hq/pipeline · FLOW H12) — ทุกตัวเลขมาจากฟังก์ชันกลางชุดเดียวกับการ์ด (บอสสั่ง 30 ต.ค. 69) ─────────
//   บั๊กเดิม: "เป้าหมายทั้งปี เทียบ ยอดขายจริง" ฿0 ทุกสาขา · อัตราปิดรายแถวไม่ตรงสูตรกลาง · การ์ดปิดสำเร็จ ≠ ผลรวมรายดีลเลอร์
//     · ส่วนบวกรายดีลเลอร์ไม่ขึ้นกับตัวกรอง
//   ตรวจ: แถวท้ายตาราง (ผลรวมรายดีลเลอร์) = การ์ด ทุกตัว ทุกตัวกรอง · ค่ารายแถวของสาขาของข้อ = ค่าที่รู้ = ที่ฐานคิด (hq_pipeline_dealers)
//     · โครงหน้าเหลือ 3 ส่วน (ส่วนที่เอาออกไม่อยู่แล้ว) · เรียงได้ทุกคอลัมน์ · ข้อความไม่ถูกตัดที่จอกว้าง · ตัวเลขกลางวงกลมไม่ล้นวง
//   ข้อมูลของข้อ: สาขาของข้อ A (เป้า 36.5 ล้าน) + B (ไม่ตั้งเป้า) ชื่อขึ้นต้นด้วยป้ายของข้อ · ลีด/ใบวันนี้
//     A: ลีด 4 (ปิดได้ 2 ไม่ได้ 1) · ใบตอบรับ 400,000 ผูกใบ HQ ต้นทุน 300,000 (ส่วนต่าง 25.0%) · ใบส่งแล้ว 50,000
//     B: ลีด 2 (ปิดได้ 1) · ใบตอบรับ 150,000 ไม่ผูกใบ HQ
//   ตกบนโค้ดก่อนแก้: ไม่มีแถวรวม/ตัวคำนวณรายดีลเลอร์ชุดเดียวกับการ์ด · อัตราปิด/ยอดรายแถวคิดคนละทาง · ยังมีกราฟ/ตารางที่เอาออก
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const ป้าย = `ZZTEST ผลงาน ${Date.now() % 100000}`;
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
let A: สาขาของข้อ, B: สาขาของข้อ;
const เลข = 940_000_000 + (Date.now() % 100_000) * 10;

test.beforeAll(async () => {
  A = await สร้างสาขาของข้อ({ จังหวัด: "ยะลา", ภาค: "ใต้", เป้า: 36_500_000, ชื่อ: `${ป้าย} ก` });
  B = await สร้างสาขาของข้อ({ จังหวัด: "สกลนคร", ภาค: "อีสาน", ชื่อ: `${ป้าย} ข` });
  const ลีด = (code: string, n: number, สถานะ: string) =>
    `('#L-${n}', ${n}, '${code}', 'ZZTEST ลูกค้า ${n}', 'ZZTEST', '000-000-${String(n % 10000).padStart(4, "0")}', 'ยะลา', '${สถานะ}', '${วันนี้}')`;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
      ${[ลีด(A.รหัส, เลข + 1, "PAID"), ลีด(A.รหัส, เลข + 2, "PAID"), ลีด(A.รหัส, เลข + 3, "CANCELLED"), ลีด(A.รหัส, เลข + 4, "BULLET"),
         ลีด(B.รหัส, เลข + 5, "PAID"), ลีด(B.รหัส, เลข + 6, "BULLET")].join(",\n      ")};
    insert into public.customers (id, dealer_code, name, company, province) values
      (${เลข + 1}, '${A.รหัส}', 'ZZTEST ลูกค้า A', 'ZZTEST ลูกค้า A', 'ยะลา'), (${เลข + 2}, '${B.รหัส}', 'ZZTEST ลูกค้า B', 'ZZTEST ลูกค้า B', 'สกลนคร');
    insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, quoted_at) values
      (${เลข + 1}, 'QR-${A.รหัส}-1', '${A.รหัส}', ${เลข + 1}, 'ZZTEST', 'won', now() - interval '3 days', now() + interval '10 days', now() - interval '2 days');
    insert into public.hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, sent_at, ordered_at) values
      (${เลข + 1}, ${เลข + 1}, 1, 'HQ-${A.รหัส}-1', 'ordered', '[]', 300000, now() - interval '2 days', now());
    insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, hq_quote_id, customer_id, date, won_at) values
      ('${A.รหัส}-Q1', '${A.รหัส}', 'ZZTEST ลูกค้า A', 'won', 400000, '[]', ${เลข + 1}, ${เลข + 1}, '${วันนี้}', '${วันนี้} 10:00:00+07'),
      ('${A.รหัส}-Q2', '${A.รหัส}', 'ZZTEST ลูกค้า A', 'sent_to_client', 50000, '[]', null, null, '${วันนี้}', null),
      ('${B.รหัส}-Q1', '${B.รหัส}', 'ZZTEST ลูกค้า B', 'won', 150000, '[]', null, ${เลข + 2}, '${วันนี้}', '${วันนี้} 11:00:00+07');
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values
      ('${A.รหัส}', '${A.รหัส}-Q1', '${วันนี้} 10:00:00+07'), ('${B.รหัส}', '${B.รหัส}-Q1', '${วันนี้} 11:00:00+07');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  for (const s of [A, B]) if (s) {
    รันSQLในฐาน(`set local session_replication_role = replica;
      delete from public.quotation_won_at where dealer_code = '${s.รหัส}';
      delete from public.quotations where dealer_code = '${s.รหัส}';
      delete from public.hq_quotes where request_id in (select id from public.quote_requests where dealer_code = '${s.รหัส}');
      delete from public.quote_requests where dealer_code = '${s.รหัส}';
      delete from public.customers where dealer_code = '${s.รหัส}';
      delete from public.leads where dealer_code = '${s.รหัส}';
      set local session_replication_role = origin;`);
    await s.ลบ();
  }
});

async function เปิด(page: Page) {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.locator("[data-perf-total]")).toBeVisible({ timeout: 30_000 });
}
const ค่าการ์ด = (page: Page, kpi: string) => page.locator(`[data-kpi-row] [data-kpi="${kpi}"] [data-value]`).first().getAttribute("data-value");
const ค่ารวม = (page: Page, k: string) => page.locator(`[data-perf-total] [data-sum="${k}"]`).getAttribute("data-value");
/** แถวรวมท้ายตาราง = การ์ด ทุกตัว (รอให้ทั้งสองโหลดชุดเดียวกันเสร็จ) */
async function รวมเท่าการ์ด(page: Page, ที่: string) {
  await expect.poll(async () => {
    const การ์ด = { sales: await ค่าการ์ด(page, "sales"), rate: await ค่าการ์ด(page, "winRate"), margin: await ค่าการ์ด(page, "margin"), onTarget: await ค่าการ์ด(page, "onTarget") };
    const ตาราง = { sales: await ค่ารวม(page, "sales"), rate: await ค่ารวม(page, "rate"), margin: await ค่ารวม(page, "margin"), onTarget: await ค่ารวม(page, "onTarget") };
    const n = (v: string | null) => (v == null || v === "" ? "—" : String(Number(v)));
    return JSON.stringify({ sales: n(ตาราง.sales) === n(การ์ด.sales), rate: n(ตาราง.rate) === n(การ์ด.rate), margin: n(ตาราง.margin) === n(การ์ด.margin), onTarget: n(ตาราง.onTarget) === n(การ์ด.onTarget),
      ตาราง: Object.values(ตาราง).map(n), การ์ด: Object.values(การ์ด).map(n) });
  }, { timeout: 30_000, message: `${ที่}: แถวรวมท้ายตาราง = การ์ด (ยอดขาย · อัตราปิด · ส่วนต่างกำไร · ถึงเป้า)` })
    .toMatch(/^\{"sales":true,"rate":true,"margin":true,"onTarget":true,/);
  // ปิดสำเร็จ/ไม่สำเร็จ: ผลรวม = ตัวเลขใต้การ์ดอัตราปิด
  const ใต้การ์ด = await page.locator(`[data-kpi-row] [data-kpi="winRate"]`).innerText();
  const [, ได้, เสีย] = ใต้การ์ด.match(/ปิดสำเร็จ\s*([\d,]+)\s*·\s*ไม่สำเร็จ\s*([\d,]+)/) ?? [];
  expect.soft(await ค่ารวม(page, "won"), `${ที่}: ผลรวมปิดสำเร็จ = การ์ด`).toBe(String(Number((ได้ ?? "").replace(/,/g, ""))));
  expect.soft(await ค่ารวม(page, "lost"), `${ที่}: ผลรวมปิดไม่สำเร็จ = การ์ด`).toBe(String(Number((เสีย ?? "").replace(/,/g, ""))));
}

test("[H12·hq] ผลรวมรายดีลเลอร์ = การ์ด ทุกตัว ทุกตัวกรอง · ค่ารายแถวตรงที่ฐานคิด", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await เปิด(page);
  await รวมเท่าการ์ด(page, "ทั้งเครือ (ไม่กรอง)");

  // ค้นด้วยป้ายของข้อ = สาขาของข้อ 2 ราย (ค่าที่รู้)
  await page.getByLabel("ค้นหาดีลเลอร์").fill(ป้าย);
  await expect(page.locator("[data-perf-row]")).toHaveCount(2, { timeout: 20_000 });
  await รวมเท่าการ์ด(page, "ค้นด้วยป้ายของข้อ");
  const แถว = (code: string) => page.locator("tr").filter({ has: page.locator(`[data-perf-row="${code}"]`) });
  const ช่อง = async (code: string, k: string) => (await แถว(code).locator(`[data-cell="${k}"]`).innerText()).trim();
  expect.soft(await ช่อง(A.รหัส, "leads"), "A ลีด").toBe("4");
  expect.soft(await ช่อง(A.รหัส, "quotes"), "A ใบเสนอราคา (ส่งแล้ว 2 ใบ)").toBe("2");
  expect.soft(await ช่อง(A.รหัส, "won"), "A ปิดได้").toBe("2");
  expect.soft(await ช่อง(A.รหัส, "lost"), "A ปิดไม่ได้").toBe("1");
  expect.soft(await ช่อง(A.รหัส, "rate"), "A อัตราปิด 2/(2+1) สูตรกลาง").toBe("67%");
  expect.soft(await แถว(A.รหัส).locator('[data-cell="sales"]').getAttribute("data-value"), "A ยอดขาย").toBe("400000");
  expect.soft(await ช่อง(A.รหัส, "margin"), "A ส่วนต่างกำไร").toBe("25.0%");
  expect.soft(await ช่อง(B.รหัส, "rate"), "B อัตราปิด 1/(1+0)").toBe("100%");
  expect.soft(await ช่อง(B.รหัส, "target"), "B ไม่ตั้งเป้า = —").toBe("—");
  expect.soft(await ช่อง(B.รหัส, "margin"), "B ไม่มีใบผูกใบ HQ = —").toBe("—");
  expect.soft(await ค่ารวม(page, "sales"), "รวมยอดขาย 2 สาขา").toBe("550000");
  expect.soft(await ค่ารวม(page, "rate"), "รวมอัตราปิด 3/(3+1) จากผลรวม").toBe("75");
  // เป้าตามช่วง / % เป้าของ A = ที่ฐานคิดด้วยช่วงเดียวกับการ์ด (เป้าทั้งปี × วันในช่วง ÷ 365)
  const ช่วง = await page.locator("[data-kpi-row]").first().evaluate(e => [e.getAttribute("data-range-start"), e.getAttribute("data-range-end")]);
  const ฐาน = รันSQLในฐาน(`select round(36500000::numeric * ('${ช่วง[1]}'::date - '${ช่วง[0]}'::date + 1) / 365);`)?.trim();
  // ค่าดิบ (data-value) — ข้อความบนจอย่อเป็น "฿30.3M"
  expect.soft(await แถว(A.รหัส).locator('[data-cell="target"]').getAttribute("data-value"), "A เป้าตามช่วง = เป้าทั้งปี × วัน ÷ 365").toBe(String(Number(ฐาน)));

  // เลือกดีลเลอร์ (สาขาเดียว) · ช่วงยอดขาย (ตัวกรองที่ขึ้นกับตัวเลข) · ถึงเป้า (กดการ์ด) — แถวรวม = การ์ด ทุกครั้ง
  await page.getByLabel("ค้นหาดีลเลอร์").fill("");
  await page.getByLabel("ทุกดีลเลอร์").selectOption(A.รหัส);
  await expect(page.locator("[data-perf-row]")).toHaveCount(1, { timeout: 20_000 });
  await รวมเท่าการ์ด(page, "เลือกดีลเลอร์ A");
  await page.getByLabel("ทุกดีลเลอร์").selectOption("ALL");
  await page.getByLabel("ทุกภูมิภาค").selectOption("ใต้");
  await รวมเท่าการ์ด(page, "ภาคใต้");
  await page.getByLabel("ทุกภูมิภาค").selectOption("ALL");
  await page.getByLabel("ทุกช่วงยอดขาย").selectOption("lt5");
  await รวมเท่าการ์ด(page, "ช่วงยอดขายต่ำกว่า ฿5M");
  await page.getByLabel("ทุกช่วงยอดขาย").selectOption("ALL");
  await page.locator('[data-kpi-row] [data-kpi="onTarget"]').click();
  await รวมเท่าการ์ด(page, "ถึงเป้าเท่านั้น (กดการ์ด)");
});

test("[H12·hq] โครงหน้า 3 ส่วน · เรียงได้ทุกคอลัมน์ · ข้อความไม่ถูกตัด · วงกลม % ไม่ล้นวง", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await เปิด(page);
  // ส่วนที่เอาออก (ข้อมูลซ้ำ รวมเข้าตารางแล้ว)
  for (const ชื่อ of ["ลูกค้าเป้าหมาย เทียบ ที่ออกใบเสนอราคาแล้ว", "มูลค่าใบเสนอราคา เทียบ ยอดขายจริง", "ตัวเลขการปิดการขาย", "เป้าหมายทั้งปี เทียบ ยอดขายจริง", "ส่วนบวกรายดีลเลอร์"])
    await expect.soft(page.getByText(ชื่อ, { exact: false }), `เอาออกแล้ว: ${ชื่อ}`).toHaveCount(0);
  await expect.soft(page.getByTestId("pipeline-chart"), "กราฟเดียว: ยอดขายเทียบเป้าตามช่วง").toContainText("ยอดขาย เทียบ เป้าตามช่วง");
  const หัว = (await page.locator("table[aria-label='ตารางผลงานดีลเลอร์'] thead th").allInnerTexts()).map(s => s.trim()).filter(Boolean);
  expect.soft(หัว, "คอลัมน์ตามที่บอสกำหนด").toEqual(["รหัส", "ดีลเลอร์", "ภูมิภาค", "ลีด", "ใบเสนอราคา", "ปิดได้", "ปิดไม่ได้", "อัตราปิด", "ยอดขาย", "เป้าตามช่วง", "% เป้า", "ส่วนต่างกำไร", "เสนอล่าสุด"]);

  // เรียงได้ทุกคอลัมน์: กดแล้วหัวบอกทิศ · กดซ้ำกลับทิศ
  await page.getByLabel("ค้นหาดีลเลอร์").fill(ป้าย);
  await expect(page.locator("[data-perf-row]")).toHaveCount(2, { timeout: 20_000 });
  for (const k of ["code", "name", "region", "leads", "quotes", "won", "lost", "rate", "sales", "target", "pct", "marginPct", "latest"]) {
    const ปุ่ม = page.locator(`button[data-sort="${k}"]`);
    await ปุ่ม.click();
    const ทิศ1 = await ปุ่ม.locator("xpath=..").getAttribute("aria-sort");
    await ปุ่ม.click();
    expect.soft([ทิศ1, await ปุ่ม.locator("xpath=..").getAttribute("aria-sort")].sort(), `เรียงคอลัมน์ ${k} ได้ทั้งสองทิศ`).toEqual(["ascending", "descending"]);
  }
  await page.locator('button[data-sort="sales"]').click();
  if (await page.locator('button[data-sort="sales"]').locator("xpath=..").getAttribute("aria-sort") !== "descending") await page.locator('button[data-sort="sales"]').click();
  expect.soft(await page.locator("[data-perf-row]").allInnerTexts(), "เรียงยอดขายมากไปน้อย: A (400,000) ก่อน B (150,000)").toEqual([A.รหัส, B.รหัส]);

  // ข้อความไม่ถูกตัดที่จอกว้าง (หัวคอลัมน์ · รหัส · ชื่อ · ภาค · ตัวเลข)
  const ตัด = await page.locator("table[aria-label='ตารางผลงานดีลเลอร์']").evaluate(t =>
    Array.from(t.querySelectorAll<HTMLElement>("thead th, tbody td")).filter(c => c.textContent?.trim() && c.scrollWidth > c.clientWidth + 1).map(c => c.textContent!.trim()));
  expect.soft(ตัด, "จอ 1440: ไม่มีข้อความถูกตัด").toEqual([]);

  // วงกลม % บนการ์ด: ตัวเลขกลางวงอยู่ในวง
  const ล้น = await page.locator("[data-kpi-ring] svg").first().evaluate(svg => {
    const t = svg.querySelector("text")!.getBBox(), c = svg.querySelector("circle")!;
    const ใน = 2 * Number(c.getAttribute("r")) - 9 - 4;   // วงด้านใน (หักความหนาเส้น) เผื่อขอบข้างละ 2px — ชิดเส้นวง = ดูล้น
    return { กว้าง: Math.round(t.width), ใน: Math.round(ใน) };
  });
  expect.soft(ล้น.กว้าง, `ตัวเลขกลางวงกว้าง ${ล้น.กว้าง}px ไม่เกินวงด้านใน ${ล้น.ใน}px`).toBeLessThanOrEqual(ล้น.ใน);
});
