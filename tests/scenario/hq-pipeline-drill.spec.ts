import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db } from "./funcHelpers";
import { settle } from "./helpers";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── HQ ภาพรวมยอดขาย · เจาะลึก (บอสสั่ง 30 ต.ค. 69 · FLOW แถว /hq/pipeline + H12) ─────────────────────────────────────────
//   ทุกระดับ (ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์) · ทุกแท็บ (ดีลเลอร์/ภูมิภาค/จังหวัด): แถวรวม = การ์ด
//   กดการ์ด = แผงขวาที่มารายดีลเลอร์ · แถวรวมในแผง = การ์ด · ปิดได้/ปิดไม่ได้ = หน้าลูกค้าเป้าหมาย (lead_summary ขั้น 6/7) ช่วงเดียวกัน
//   กดแถว = เจาะลงระดับถัดไป · ระดับดีลเลอร์: ใบ/ลีดล่าสุด + ปุ่มเปิดแผงดีลเลอร์ · รายเดือน (ใบ 0268): แถวรวม = การ์ด · กดเดือน = รายดีลเลอร์
//   ข้อมูลของข้อ (ชุดเดียวกับ hq-pipeline-h12): A ยะลา/ใต้ ลีด 4 (ปิดได้ 2 ไม่ได้ 1 เปิดอยู่ 1) ยอด 400,000 · B สกลนคร/อีสาน ลีด 2 (ปิดได้ 1 เปิดอยู่ 1) ยอด 150,000
//   กรองหน้าด้วยป้ายของข้อ (ช่องค้นหา) → การ์ด/ตาราง/กล่องล่าง = 2 สาขานี้เท่านั้น
//   ตกบนโค้ดก่อนรอบนี้: ไม่มีแถบระดับ/แท็บ/แผงที่มา · กดแถวแล้วไปหน้าดีลเลอร์ (ไม่เจาะลง)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(200_000);

const ป้าย = `ZZTEST เจาะลึก ${Date.now() % 100000}`;
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
let A: สาขาของข้อ, B: สาขาของข้อ;
const เลข = 945_000_000 + (Date.now() % 100_000) * 10;

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
      select set_config('pms.quote_request_delete', 'test', false);   -- ตัวกันห้ามลบคำขอ (ใบ 0280) ยอมเฉพาะชุดล้างข้อมูลทดสอบ
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
  await expect(page.locator("[data-testid='pipeline-table'] table[data-total]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-testid='pipeline-table'] tfoot"), "ไม่มีแถวรวม (บอสสั่ง 6 พ.ย. 69)").toHaveCount(0);
  await page.getByLabel("ค้นหาดีลเลอร์").fill(ป้าย);
  await expect(page.locator("[data-perf-row]")).toHaveCount(2, { timeout: 20_000 });
}
const การ์ด = (page: Page, k: string) => page.locator(`[data-kpi-row] [data-kpi="${k}"] [data-value]`).first().getAttribute("data-value");
const n = (v: string | null) => (v == null || v === "" ? "—" : String(Number(v)));
/** ผลรวมชุดเดียวกับแถวของตารางที่เห็นอยู่ (ไม่มีแถวรวมบนจอแล้ว · บอสสั่ง 6 พ.ย. 69 · ตารางเก็บใน data-total) */
const ผลรวม = async (page: Page, k: string) => {
  const j = await page.locator("[data-testid='pipeline-table'] table[data-total]").first().getAttribute("data-total");
  const v = j ? (JSON.parse(j) as Record<string, unknown>)[k] : null;
  return v == null ? null : String(v);
};

/** ผลรวมยอดขายของตารางที่เห็นอยู่ (ดีลเลอร์/ภูมิภาค/จังหวัด/รายเดือน · ชุดเดียวกับแถว · ไม่มีแถวรวมบนจอ) = การ์ดยอดขาย */
async function ยอดรวมเท่าการ์ด(page: Page, ที่: string) {
  await expect.poll(async () => {
    const j = await page.locator("[data-testid='pipeline-table'] table[data-total]").first().getAttribute("data-total");
    const ยอด = j ? String((JSON.parse(j) as { sales: number }).sales) : null;
    return [n(ยอด), n(await การ์ด(page, "sales"))].join(" = ");
  }, { timeout: 30_000, message: `${ที่}: ผลรวมยอดขายในตาราง = การ์ด` }).toMatch(/^(\S+) = \1$/);
  await expect(page.locator("[data-testid='pipeline-table'] tfoot"), `${ที่}: ไม่มีแถวรวม`).toHaveCount(0);
}

test("[H12·hq] เจาะลึก: ทุกระดับ/แท็บ แถวรวม = การ์ด · แผงที่มา = การ์ด · ปิดได้/ไม่ได้ = หน้าลูกค้าเป้าหมาย · ระดับดีลเลอร์", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await เปิด(page);
  await expect(page.locator("[data-crumbs] [data-crumb]"), "แถบระดับเริ่มที่ทั้งเครือ").toHaveText(["ทั้งเครือ"]);
  await ยอดรวมเท่าการ์ด(page, "ทั้งเครือ · แท็บดีลเลอร์");

  // ปิดได้/ปิดไม่ได้ (ทั้งเครือ) = หน้าลูกค้าเป้าหมาย ช่วงเดียวกัน (lead_summary ขั้น 6/7 · ไม่นับลีด HQ)
  const แถวการ์ด = page.locator("[data-kpi-row]").first();
  const [ต้น, ท้าย] = [await แถวการ์ด.getAttribute("data-range-start"), await แถวการ์ด.getAttribute("data-range-end")];
  const { data: ลีด, error } = await (await db(ADMIN)).rpc("lead_summary", { p_dealer_codes: [A.รหัส, B.รหัส], p_province: null, p_product: null, p_source: null, p_search: null, p_status: null, p_date_start: ต้น, p_date_end: ท้าย, p_stage: null });
  expect(error).toBeNull();
  const ขั้น = (k: number) => String(((ลีด as { byStage?: { stage: number; count: number }[] }).byStage ?? []).find(s => Number(s.stage) === k)?.count ?? 0);
  expect({ won: await ผลรวม(page, "won"), lost: await ผลรวม(page, "lost") },
    "ปิดได้/ปิดไม่ได้ = หน้าลูกค้าเป้าหมาย (ขั้นปิดสำเร็จ/ปิดไม่สำเร็จ ช่วงเดียวกัน)").toEqual({ won: ขั้น(6), lost: ขั้น(7) });
  expect({ won: ขั้น(6), lost: ขั้น(7) }, "ค่าที่วางไว้: ปิดได้ 3 · ปิดไม่ได้ 1").toEqual({ won: "3", lost: "1" });

  // กดการ์ด = แผงที่มารายดีลเลอร์ · แถวรายดีลเลอร์ = ชุดเดียวกับตาราง · ไม่มีแถวรวม (บอสสั่ง 6 พ.ย. 69 · ตัวเลขรวมดูที่การ์ด)
  for (const k of ["sales", "winRate", "onTarget"] as const) {
    await page.locator(`[data-kpi-row] [data-kpi="${k}"]`).click();
    const แผง = page.locator(`[data-card-drawer="${k}"]`);
    await expect(แผง, `กดการ์ด ${k} = แผงที่มา`).toBeVisible();
    expect(await แผง.locator("[data-drawer-row]").count(), `แผง ${k}: แถวรายดีลเลอร์ = จำนวนดีลเลอร์ในตาราง`).toBe(Number(await ผลรวม(page, "n")));
    await expect(แผง.locator("tfoot, [data-drawer-total]"), `แผง ${k}: ไม่มีแถวรวม`).toHaveCount(0);
    await expect(แผง, `แผง ${k}: คำอธิบายไม่มี แถวรวม`).not.toContainText("แถวรวม");
    await แผง.getByRole("button", { name: "ปิดแผง" }).click();
  }

  // แท็บภูมิภาค → ผลรวมแถว = การ์ด · กดแถวแรก = เจาะลงภูมิภาคนั้น (แท็บจังหวัด)
  await page.locator('[data-dim="region"]').click();
  await expect(page.locator('table[aria-label="ตารางผลงานตามภูมิภาค"]')).toBeVisible();
  await ยอดรวมเท่าการ์ด(page, "ทั้งเครือ · แท็บภูมิภาค");
  await expect(page.locator("[data-group-row]"), "2 ภูมิภาค (ใต้ · อีสาน)").toHaveCount(2);
  const ภาค = "ใต้";
  await page.locator('[data-group-row="ใต้"]').click();
  await expect(page.locator("[data-crumbs] [data-crumb]"), "แถบระดับ: ทั้งเครือ › ภูมิภาค").toHaveCount(2);
  await expect(page.locator('[data-dim="prov"]'), "เจาะภูมิภาคแล้วอยู่แท็บจังหวัด").toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-dim="region"]'), "ระดับภูมิภาคไม่มีแท็บภูมิภาค").toHaveCount(0);
  await ยอดรวมเท่าการ์ด(page, `ภูมิภาค ${ภาค} · แท็บจังหวัด`);
  await page.locator('[data-dim="dealer"]').click();
  await ยอดรวมเท่าการ์ด(page, `ภูมิภาค ${ภาค} · แท็บดีลเลอร์`);
  await page.locator('[data-dim="prov"]').click();

  // กดจังหวัด → แท็บดีลเลอร์ · ผลรวมแถว = การ์ด
  await expect(page.locator("[data-group-row]"), "ภาคใต้: จังหวัดยะลาจังหวัดเดียว").toHaveCount(1);
  await page.locator('[data-group-row="ยะลา"]').click();
  await expect(page.locator("[data-crumbs] [data-crumb]"), "แถบระดับ: ทั้งเครือ › ภูมิภาค › จังหวัด").toHaveCount(3);
  await expect(page.locator("[data-testid='pipeline-table'] table[data-total]")).toBeVisible();
  await ยอดรวมเท่าการ์ด(page, "จังหวัด · แท็บดีลเลอร์");

  // แท็บรายเดือน (ใบ 0268): ผลรวม = การ์ด · ผลรวมยอดขายทุกเดือน = ผลรวมของตาราง · กดเดือน = รายดีลเลอร์ของเดือนนั้น (ยอด = แถวเดือน · ไม่มีแถวรวม)
  await page.locator('[data-dim="month"]').click();
  const ตารางเดือน = page.locator('table[aria-label="ตารางผลงานรายเดือน"]');
  await expect(ตารางเดือน, "แท็บรายเดือนมีตาราง (ไม่ใช่รอข้อมูล)").toBeVisible({ timeout: 20_000 });
  await ยอดรวมเท่าการ์ด(page, "จังหวัด · แท็บรายเดือน");
  const ยอดเดือน = await ตารางเดือน.locator("tbody td[data-value]").evaluateAll(es => es.reduce((t, e) => t + Number(e.getAttribute("data-value")), 0));
  expect(String(ยอดเดือน), "ผลรวมยอดขายทุกเดือน = ผลรวมของตาราง (= การ์ด)").toBe(await ผลรวม(page, "sales"));
  await expect(ตารางเดือน.locator("tfoot"), "ตารางรายเดือนไม่มีแถวรวม").toHaveCount(0);
  const เดือนนี้ = ตารางเดือน.locator("tbody tr").filter({ has: page.locator("[data-month-row]") }).last();
  const ยอดเดือนนี้ = (await เดือนนี้.locator("td[data-value]").innerText()).trim();
  await เดือนนี้.click();
  const แผงเดือน = page.locator("[data-month-drawer]");
  await expect(แผงเดือน, "กดเดือน = แผงรายดีลเลอร์").toBeVisible();
  await expect(แผงเดือน.locator("[data-drawer-row]"), "เดือนนี้: สาขา A").toHaveCount(1);
  await expect(แผงเดือน.locator("[data-drawer-row]").first().locator("xpath=.."), "ยอดของสาขาในแผง = แถวเดือน").toContainText(ยอดเดือนนี้);
  await expect(แผงเดือน.locator("tfoot, [data-drawer-total]"), "แผงเดือนไม่มีแถวรวม").toHaveCount(0);
  await แผงเดือน.getByRole("button", { name: "ปิดแผง" }).click();
  await page.locator('[data-dim="dealer"]').click();

  // กดดีลเลอร์ → ระดับดีลเลอร์: แถบระดับ 4 ชั้น · ใบ/ลีดล่าสุด · ปุ่มเปิดแผงดีลเลอร์ · ผลรวมแถว = การ์ด
  const รหัส = A.รหัส;
  await expect(page.locator("td[data-perf-row]"), "ยะลา: สาขา A สาขาเดียว").toHaveCount(1);
  await page.locator("td[data-perf-row]").first().click();
  await expect(page.locator("[data-crumbs] [data-crumb='dealer']"), "แถบระดับ: … › ดีลเลอร์").toContainText(รหัส);
  await expect(page.locator("td[data-perf-row]")).toHaveCount(1);
  await ยอดรวมเท่าการ์ด(page, `ดีลเลอร์ ${รหัส}`);
  await expect(page.getByTestId("dealer-latest-quotes"), "ใบล่าสุดของ A").toContainText(`${A.รหัส}-Q1`);
  await expect(page.getByTestId("dealer-latest-leads")).toBeVisible();
  await page.locator('[data-kpi-row] [data-kpi="sales"]').click();
  const แผงยอด = page.locator('[data-card-drawer="sales"]');
  await expect(แผงยอด.getByRole("table", { name: /รายเดือน/ }), "ระดับดีลเลอร์: ที่มารายเดือน").toBeVisible({ timeout: 20_000 });
  await expect(แผงยอด.locator("tfoot, [data-drawer-total]"), "แผงรายเดือนไม่มีแถวรวม").toHaveCount(0);
  expect(await ผลรวม(page, "sales"), "ระดับดีลเลอร์: ผลรวมของตาราง = การ์ด (ยอดขาย A 400,000)").toBe("400000");
  await expect(แผงยอด.locator("[data-drawer-row]").first(), "แผงรายเดือนมีแถวรายเดือน").toBeVisible();
  await แผงยอด.getByRole("button", { name: "ปิดแผง" }).click();
  await page.locator('[data-act="open-dealer-panel"]').click();
  await expect(page.locator(`[data-dealer-panel="${รหัส}"]`), "ปุ่มเปิดแผงดีลเลอร์").toBeVisible({ timeout: 25_000 });

  // กลับขึ้นทั้งเครือจากแถบระดับ
  await page.goBack();
  await expect(page.locator("[data-testid='pipeline-table'] table[data-total]")).toBeVisible({ timeout: 25_000 });
  assertNoErrors(errs, "ภาพรวมยอดขาย เจาะลึก");
});

test("[H12·hq] กล่องล่าง: เส้นทางการขาย = ผลรวมของตาราง · งานค้างตามขั้นตอน = ลีดเปิดอยู่ตอนนี้", async ({ page }) => {
  await เปิด(page);
  const รวม = async (k: string) => (await ผลรวม(page, k)) ?? "";
  const ทาง = page.getByTestId("pipeline-funnel");
  await expect.poll(async () => ({
    ลีด: await ทาง.locator('[data-bar-row="ลีดใหม่"]').getAttribute("data-value").catch(() => null),
    ปิดได้: await ทาง.locator('[data-bar-row="ปิดสำเร็จ"]').getAttribute("data-value").catch(() => null),
  }), { message: "เส้นทางการขาย = ผลรวมของตาราง", timeout: 20_000 }).toEqual({ ลีด: await รวม("leads"), ปิดได้: await รวม("won") });
  expect([await รวม("leads"), await รวม("won")], "ค่าที่วางไว้: ลีด 6 · ปิดได้ 3").toEqual(["6", "3"]);
  // งานค้างตามขั้นตอน (ตอนนี้) = lead_summary ไม่ระบุช่วง ขั้น 1–5
  const { data } = await (await db(ADMIN)).rpc("lead_summary", { p_dealer_codes: [A.รหัส, B.รหัส], p_province: null, p_product: null, p_source: null, p_search: null, p_status: null, p_date_start: null, p_date_end: null, p_stage: null });
  const เปิดอยู่ = ((data as { byStage?: { stage: number; count: number }[] }).byStage ?? []).filter(s => Number(s.stage) <= 5).reduce((t, s) => t + Number(s.count), 0);
  await expect.poll(async () => (await page.getByTestId("pipeline-stages").locator("[data-bar-row]").evaluateAll(es => es.map(e => Number(e.getAttribute("data-value"))))).reduce((a, b) => a + b, 0),
    { message: "งานค้างตามขั้นตอนรวม = ลีดเปิดอยู่ตอนนี้", timeout: 20_000 }).toBe(เปิดอยู่);
  expect(เปิดอยู่, "ค่าที่วางไว้: ลีดเปิดอยู่ 2").toBe(2);
  for (const t of ["pipeline-lost", "pipeline-sources"]) await expect(page.getByTestId(t)).toBeVisible();
});
