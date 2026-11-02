import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ตั้งค่าเจาะลึกทั้งหมด, มีรายเดือน, type ตั้งค่าเจาะลึก } from "@pms/shared/lib/hqDrillConfig";

// ── เจาะลึก 3 หน้า HQ แบบเดียวกับภาพรวมยอดขาย (บอสสั่ง 2 พ.ย. 69 · ใบ 0271) ─────────────────────────────────────────
//   ข้อทดสอบชุดเดียววน ทุกหน้า × ทุกระดับ (ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์) × ทุกแท็บ — การ์ด/คอลัมน์มาจากตั้งค่าชุดเดียวกับหน้าจอ (hqDrillConfig)
//   1) แถวรวมของตาราง = การ์ด (คอลัมน์ k เดียวกับการ์ด · แท็บรายเดือนเทียบเฉพาะตัวเลขที่มีรายเดือน)
//   2) แถวรวม = ผลรวมของแถวในตาราง (คอลัมน์ที่เป็นผลรวม)
//   3) แผงที่มาของการ์ด: แถวรวม = การ์ด และ = ผลรวมแถวรายดีลเลอร์/รายเดือน
//   4) แท็บรายเดือนกดแถว = แผงรายดีลเลอร์ของเดือนนั้น แถวรวม = แถวของเดือนนั้น
//   5) ตัวเลขชุดเดียวกันตรงกันข้ามหน้า: ลีด ปิดสำเร็จ/ไม่สำเร็จ = ภาพรวมยอดขาย · ใบ มูลค่าตอบรับ = ยอดขายของภาพรวมยอดขาย
//   ทุกการเทียบอ่านจากจอชุดเดียวกัน (การ์ดกับตารางมาจากคำขอเดียว) — ไม่นับตรงเป๊ะจากข้อมูลตั้งต้นร่วม
//   เส้นทางเจาะลง = สาขาของข้อ (ตราด · ภาคตะวันออก) ที่วางข้อมูลรู้ค่าไว้ → ระดับดีลเลอร์ตรวจตัวเลขตรงเป๊ะ · ข้อข้ามหน้าเทียบเฉพาะสาขานี้
//     ลีดวันนี้ 5 ราย: ข้อมูลลูกค้า · ขอราคา HQ · รอลูกค้าตอบ · ปิดสำเร็จ · ปิดไม่สำเร็จ → เปิดอยู่ 3 · ลีดใหม่ 5 · รอราคา HQ 1 · ไม่เคลื่อนไหว 0
//     ใบวันนี้: ส่งแล้ว 1,000 · ตอบรับ 2,000 (ตอบรับวันนี้) → ส่ง 2 · รอตอบ 1 · ตอบรับ 2,000 · อัตราตอบรับ 50.0% · ลูกค้าวันนี้ 2 ราย
//   ตกบนโค้ดก่อนใบ 0271: ไม่มีแถบระดับ/ตารางเจาะลึกบน 3 หน้านี้
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(420_000);

const ที่ = { leads: "/hq/leads", quotations: "/hq/quotations", customers: "/hq/customers" } as const;
// ค่าที่รู้ของสาขาของข้อ (ระดับดีลเลอร์) — data-kpi → ค่า
const ของข้อ = {
  leads: { open: 3, new: 5, qr: 1, idle: 0 },
  quotations: { sent: 2, awaiting: 1, won: 2000, acceptRate: 50 },
  customers: { total: 2, new: 2, dealers: 1 },
} as const;
let สาขา: สาขาของข้อ;
const ฐานเลข = 1_800_000_000 + Math.floor(Math.random() * 400_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนช่วงเลขตายตัวของไฟล์อื่น)

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const c = สาขา.รหัส, วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const ลีด = ["WAITING", "HQ_PRICING", "QUOTED", "PAID", "CANCELLED"];
  // วางที่ฐานตรง (ปิดตัวดัก — ลีดกลางทาง/ใบตอบรับสร้างผ่านหน้าจอเป็นชุดเดียวไม่ได้) · ข้อนี้วัดการนับ ไม่ใช่ทางสร้าง
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province, join_date) values
      (${ฐานเลข}, '${c}', 'ZZTEST ลูกค้าเจาะลึก ${c}-1', 'ZZTEST ลูกค้าเจาะลึก ${c}-1', 'ตราด', '${วันนี้}'),
      (${ฐานเลข + 1}, '${c}', 'ZZTEST ลูกค้าเจาะลึก ${c}-2', 'ZZTEST ลูกค้าเจาะลึก ${c}-2', 'ตราด', '${วันนี้}');
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date, last_contact_at) values
      ${ลีด.map((st, i) => `('#L-${ฐานเลข + 10 + i}', ${ฐานเลข + 10 + i}, '${c}', 'ZZTEST ลีดเจาะลึก ${c}-${i}', 'ZZTEST', '000-000-${String(i).padStart(4, "0")}', 'ตราด', '${st}', '${วันนี้}', '${วันนี้}')`).join(",\n      ")};
    insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, won_at, customer_id) values
      ('${c}', 'Q-${c}-S1', 'ZZTEST ใบเจาะลึก S1', 'ZZTEST', 'sent_to_client', 1000, '${วันนี้}', null, null),
      ('${c}', 'Q-${c}-W1', 'ZZTEST ใบเจาะลึก W1', 'ZZTEST', 'won', 2000, '${วันนี้}', now(), ${ฐานเลข});
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ('${c}', 'Q-${c}-W1', now());
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของสาขาไม่ได้");
});
test.afterAll(async () => {
  const c = สาขา.รหัส;
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.quotation_won_at where dealer_code = '${c}'; delete from public.quotations where dealer_code = '${c}';
    delete from public.leads where dealer_code = '${c}'; delete from public.customers where dealer_code = '${c}';
    set local session_replication_role = origin;`);
  await สาขา.ลบ();
});
const เลข = (v: string | null) => (v == null || v === "" ? null : Number(v));

const การ์ด = (page: Page, kpi: string) => page.locator(`[data-kpi-row] [data-kpi="${kpi}"]`).first();
const ค่าการ์ด = async (page: Page, kpi: string) => เลข(await การ์ด(page, kpi).locator("[data-value]").first().getAttribute("data-value"));
const ตาราง = (page: Page) => page.locator("[data-drill-table]");

async function รอโหลด(page: Page) {
  await expect(ตาราง(page).locator("tfoot [data-group-total]"), "ตารางเจาะลึกโหลดเสร็จ").toBeVisible({ timeout: 30_000 });
}

/** 1 + 2: แถวรวม = การ์ด · แถวรวม = ผลรวมแถว (ระดับ/แท็บที่เห็นอยู่) */
async function ตรวจตาราง(page: Page, cfg: ตั้งค่าเจาะลึก, ป้าย: string) {
  await รอโหลด(page);
  const dim = await ตาราง(page).getAttribute("data-drill-table");
  for (const c of cfg.คอลัมน์) {
    const รวม = ตาราง(page).locator(`tfoot [data-sum="${c.k}"]`);
    if (!(await รวม.count())) continue;   // คอลัมน์นี้ไม่แสดงในแท็บนี้ (เช่น รายเดือนของตัวเลข "ตอนนี้")
    const ค่ารวม = เลข(await รวม.getAttribute("data-value"));
    const ใบ = cfg.การ์ด.find(x => x.k === c.k);
    if (ใบ && (dim !== "month" || มีรายเดือน(ใบ))) {
      expect(ค่ารวม, `${ป้าย} · แท็บ ${dim}: แถวรวม "${c.l}" = การ์ด "${ใบ.l}"`).toBe(await ค่าการ์ด(page, ใบ.kpi));
    }
    if (c.sum) {
      const เซลล์ = await ตาราง(page).locator(`tbody [data-cell="${c.k}"]`).evaluateAll(es => es.map(e => Number(e.getAttribute("data-value") || 0)));
      expect(เซลล์.reduce((a, b) => a + b, 0), `${ป้าย} · แท็บ ${dim}: แถวรวม "${c.l}" = ผลรวมแถวในตาราง`).toBeCloseTo(ค่ารวม ?? 0, 2);
    }
  }
}

/** 3: แผงที่มาของทุกการ์ด — แถวรวม = การ์ด = ผลรวมแถว */
async function ตรวจแผงที่มา(page: Page, cfg: ตั้งค่าเจาะลึก, ป้าย: string) {
  for (const c of cfg.การ์ด) {
    const ค่า = await ค่าการ์ด(page, c.kpi);
    await การ์ด(page, c.kpi).click();
    const แผง = page.locator(`[data-drill-drawer="card:${c.k}"]`);
    await expect(แผง, `${ป้าย}: กดการ์ด "${c.l}" เปิดแผงที่มา`).toBeVisible();
    expect(เลข(await แผง.locator("tfoot [data-value]").getAttribute("data-value")), `${ป้าย}: แผงที่มา "${c.l}" แถวรวม = การ์ด`).toBe(ค่า);
    if (c.sum) {
      const แถว = await แผง.locator("tbody [data-value]").evaluateAll(es => es.map(e => Number(e.getAttribute("data-value") || 0)));
      expect(แถว.reduce((a, b) => a + b, 0), `${ป้าย}: แผงที่มา "${c.l}" ผลรวมแถว = การ์ด`).toBeCloseTo(ค่า ?? 0, 2);
    }
    await แผง.getByRole("button", { name: "ปิดแผง" }).click();
    await expect(แผง).toHaveCount(0);
  }
}

const แท็บ = (page: Page) => page.locator('[data-drill-chart] [role="tab"]');
async function เลือกแท็บ(page: Page, dim: string) {
  await page.locator(`[data-drill-chart] [role="tab"][data-dim="${dim}"]`).click();
  await expect(ตาราง(page)).toHaveAttribute("data-drill-table", dim);
}
/** ทุกแท็บของระดับนี้: ตาราง + (แท็บรายเดือน) แผงรายดีลเลอร์ของเดือนแรกที่มีค่า */
async function ตรวจทุกแท็บ(page: Page, cfg: ตั้งค่าเจาะลึก, ระดับ: string) {
  const ชุด = await แท็บ(page).evaluateAll(es => es.map(e => e.getAttribute("data-dim") ?? ""));
  if (!ชุด.length) { await ตรวจตาราง(page, cfg, ระดับ); return; }   // ระดับดีลเลอร์ = รายเดือนอย่างเดียว ไม่มีแท็บ
  for (const dim of ชุด) {
    await เลือกแท็บ(page, dim);
    await ตรวจตาราง(page, cfg, ระดับ);
    if (dim === "month") await ตรวจแผงเดือน(page, cfg, ระดับ);
  }
}
/** 4: กดแถวเดือน → แผงรายดีลเลอร์ แถวรวม = แถวของเดือนนั้น */
async function ตรวจแผงเดือน(page: Page, cfg: ตั้งค่าเจาะลึก, ระดับ: string) {
  const แถว = ตาราง(page).locator("tbody tr.clickable").first();
  if (!(await แถว.count())) return;
  const ค่าแถว = Object.fromEntries(await แถว.locator("[data-cell]").evaluateAll(es => es.map(e => [e.getAttribute("data-cell"), e.getAttribute("data-value")])));
  await แถว.click();
  const แผง = page.locator('[data-drill-drawer^="month:"]');
  await expect(แผง, `${ระดับ}: กดแถวเดือนเปิดแผงรายดีลเลอร์`).toBeVisible();
  for (const c of cfg.คอลัมน์.filter(มีรายเดือน)) {
    expect(เลข(await แผง.locator(`tfoot [data-sum="${c.k}"]`).getAttribute("data-value")), `${ระดับ}: แผงเดือน "${c.l}" แถวรวม = แถวของเดือนนั้น`).toBe(เลข(ค่าแถว[c.k] ?? null));
    if (c.sum) {
      const ช่อง = await แผง.locator(`tbody [data-cell="${c.k}"]`).evaluateAll(es => es.map(e => Number(e.getAttribute("data-value") || 0)));
      expect(ช่อง.reduce((a, b) => a + b, 0), `${ระดับ}: แผงเดือน "${c.l}" ผลรวมรายดีลเลอร์ = แถวของเดือน`).toBeCloseTo(เลข(ค่าแถว[c.k] ?? null) ?? 0, 2);
    }
  }
  await แผง.getByRole("button", { name: "ปิดแผง" }).click();
}
/** เจาะลงหนึ่งระดับตามเส้นทางของสาขาของข้อ: แท็บ dim แล้วกดแถว key → แถบระดับต้องเพิ่มชิ้น */
async function เจาะลง(page: Page, dim: string, ระดับใหม่: string, key: string) {
  await เลือกแท็บ(page, dim);
  const แถว: Locator = ตาราง(page).locator("tbody tr.clickable").filter({ has: page.locator(`td[data-group-row="${key}"]`) });
  await expect(แถว, `มีแถว ${key} ให้เจาะลง${ระดับใหม่}`).toBeVisible();
  await แถว.click();
  await expect(page.locator(`[data-crumbs] [data-crumb="${ระดับใหม่}"]`), `แถบระดับมี ${ระดับใหม่}`).toBeVisible();
  await รอโหลด(page);
}

for (const หน้า of ["leads", "quotations", "customers"] as const) {
  test(`[drill·hq] ${ที่[หน้า]}: ทุกระดับ ทุกแท็บ แถวรวม = การ์ด · แผงที่มา = การ์ด · แผงเดือน = แถวเดือน`, async ({ page }) => {
    const errs = watchErrors(page);
    const cfg = ตั้งค่าเจาะลึกทั้งหมด[หน้า];
    await loginUI(page, HQ_ORIGIN, ที่[หน้า], ADMIN);
    await settle(page);
    await expect(page.locator("[data-crumbs] [data-crumb=all]"), "แถบระดับเริ่มที่ทั้งเครือ").toBeVisible({ timeout: 30_000 });
    await รอโหลด(page);
    await expect(page.locator("[data-kpi-row] [data-kpi]"), "การ์ดตามแบบ").toHaveCount(cfg.การ์ด.length);

    // ทั้งเครือ › ภูมิภาค › จังหวัด › ดีลเลอร์ (เจาะลงจากแถวแรกของแต่ละแท็บ)
    await ตรวจแผงที่มา(page, cfg, "ทั้งเครือ");
    await ตรวจทุกแท็บ(page, cfg, "ทั้งเครือ");
    await เจาะลง(page, "region", "region", "region:ตะวันออก");
    await expect(page.locator('[data-drill-chart] [role="tab"][data-dim="region"]'), "เลือกภาคแล้วไม่มีแท็บภูมิภาค").toHaveCount(0);
    await ตรวจแผงที่มา(page, cfg, "ภูมิภาค");
    await ตรวจทุกแท็บ(page, cfg, "ภูมิภาค");
    await เจาะลง(page, "prov", "prov", "prov:ตราด");
    await expect(page.locator('[data-drill-chart] [role="tab"][data-dim="prov"]'), "เลือกจังหวัดแล้วไม่มีแท็บจังหวัด").toHaveCount(0);
    await ตรวจแผงที่มา(page, cfg, "จังหวัด");
    await ตรวจทุกแท็บ(page, cfg, "จังหวัด");
    await เจาะลง(page, "dealer", "dealer", `dealer:${สาขา.รหัส}`);
    await expect(ตาราง(page), "ระดับดีลเลอร์ = รายเดือน").toHaveAttribute("data-drill-table", "month");
    // ระดับดีลเลอร์ของข้อ: การ์ด = ค่าที่วางไว้เป๊ะ
    for (const [kpi, ค่า] of Object.entries(ของข้อ[หน้า])) expect(await ค่าการ์ด(page, kpi), `${ที่[หน้า]} ระดับดีลเลอร์ของข้อ: การ์ด ${kpi}`).toBe(ค่า);
    await ตรวจแผงที่มา(page, cfg, "ดีลเลอร์");   // การ์ดที่มีรายเดือน = แผงรายเดือน
    await ตรวจทุกแท็บ(page, cfg, "ดีลเลอร์");

    // กลับทั้งเครือด้วยแถบระดับ
    await page.locator("[data-crumbs] [data-crumb=all]").click();
    await expect(page.locator("[data-crumbs] [data-crumb=region]")).toHaveCount(0);
    assertNoErrors(errs, `เจาะลึก ${ที่[หน้า]}`);
  });
}

test("[drill·hq] ตัวเลขชุดเดียวกันตรงกันข้ามหน้า (สาขาของข้อ): ปิดสำเร็จ/ไม่สำเร็จ = ภาพรวมยอดขาย · มูลค่าตอบรับ = ยอดขาย", async ({ page }) => {
  const sb = await db(ADMIN);
  await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
  await รอโหลด(page);
  const แถว = page.locator("[data-kpi-row]").first();
  const [ต้น, ท้าย] = [await แถว.getAttribute("data-range-start"), await แถว.getAttribute("data-range-end")];
  const { data, error } = await sb.rpc("kpi_cards", { p_page: "hq.pipeline", p_start: ต้น, p_end: ท้าย, p_dealer: สาขา.รหัส, p_today: null });
  expect(error?.message ?? "").toBe("");
  const ภาพรวม = data as { sales: { value: number }; winRate: { won: number; lost: number } };
  expect([ภาพรวม.winRate.won, ภาพรวม.winRate.lost, Number(ภาพรวม.sales.value)], "ภาพรวมยอดขายของสาขาของข้อ = ค่าที่วางไว้").toEqual([1, 1, 2000]);
  // ลูกค้าเป้าหมาย ระดับดีลเลอร์ของข้อ: แถวรวมปิดสำเร็จ/ไม่สำเร็จ (รายเดือน) = การ์ดอัตราปิดของภาพรวมยอดขาย
  await page.locator("[data-drill-scope]").getByLabel("ดีลเลอร์").selectOption(สาขา.รหัส);
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]')).toContainText(สาขา.รหัส);
  expect([เลข(await ตาราง(page).locator('tfoot [data-sum="won"]').getAttribute("data-value")), เลข(await ตาราง(page).locator('tfoot [data-sum="lost"]').getAttribute("data-value"))],
    "ลูกค้าเป้าหมาย: ปิดสำเร็จ/ไม่สำเร็จ = ภาพรวมยอดขาย").toEqual([ภาพรวม.winRate.won, ภาพรวม.winRate.lost]);
  // ใบเสนอราคา ระดับดีลเลอร์ของข้อ (?dealer=): ตอบรับ (มูลค่า) = ยอดขายของภาพรวมยอดขาย
  await page.goto(`${HQ_ORIGIN}/hq/quotations?dealer=${สาขา.รหัส}`);
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]')).toContainText(สาขา.รหัส, { timeout: 25_000 });
  await รอโหลด(page);
  expect(await ค่าการ์ด(page, "won"), "ใบเสนอราคา: ตอบรับ (มูลค่า) = ยอดขายของภาพรวมยอดขาย").toBe(Number(ภาพรวม.sales.value));
});
