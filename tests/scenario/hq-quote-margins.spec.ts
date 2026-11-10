// ── หน้าใบเสนอราคาทั้งเครือ: ดีลเลอร์ขายต่อเท่าไหร่ รายใบ (บอสสั่ง 2 พ.ย. 69 · ใบ 0272 hq_quote_margins) ──
//   คอลัมน์ ราคาส่ง HQ · ราคาขายลูกค้า · ส่วนต่าง ฿ · ส่วนต่าง % (เฉพาะ HQ) · แผงใบแสดง 4 ตัวเลขเดียวกับแถว
//   1) ค่าที่รู้รายใบ · ใบที่ไม่ได้ทำจากใบ HQ = "—" (ไม่กุ)
//   2) ข้ามหน้า: เฉลี่ยถ่วงจากตาราง (Σ ส่วนต่าง ÷ Σ ขาย ของใบตอบรับ) = การ์ด "ส่วนต่างกำไรเฉลี่ย" ของภาพรวมยอดขาย (สาขาเดียวกัน ช่วงเดียวกัน)
//   3) แผงใบ = แถวของใบนั้น
//   4) สิทธิ์: ดีลเลอร์เรียกส่วนต่างรายใบของ HQ ไม่ได้ · ดีลเลอร์ดูส่วนต่างของสาขาอื่นไม่ได้
// ข้อมูล: สาขาของข้อ (รู้ค่าแน่นอน) — ใบวันนี้ 3 ใบ ตอบรับทั้งหมด
//   Q1 ขาย 1,000,000 ราคาส่ง 800,000 (ต่าง 200,000 · 20.0%) · Q2 ขาย 500,000 ราคาส่ง 450,000 (ต่าง 50,000 · 10.0%) · Q3 ขาย 300,000 ไม่ได้ทำจากใบ HQ
//   เฉลี่ยถ่วง = 250,000 ÷ 1,500,000 = 16.7%
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { fmtBaht } from "@pms/shared/lib/format";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

let สาขา: สาขาของข้อ;
const ฐานเลข = 1_900_000_000 + Math.floor(Math.random() * 400_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนไฟล์อื่น)
const ใบ = (c: string, n: number) => `Q-${c}-M${n}`;
const คอลัมน์ = ["hq-cost", "sale", "margin-baht", "margin-pct"] as const;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const c = สาขา.รหัส, วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  // วางที่ฐานตรง (ปิดตัวดัก — ใบ HQ + ใบตอบรับสร้างผ่านหน้าจอเป็นชุดเดียวไม่ได้) · ข้อนี้วัดตัวเลข ไม่ใช่ทางสร้าง
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date, last_contact_at) values
      ${[1, 2, 3].map(i => `('#L-${ฐานเลข + i}', ${ฐานเลข + i}, '${c}', 'ZZTEST ลีดส่วนต่าง ${c}-${i}', 'ZZTEST', '000-000-000${i}', 'ตราด', 'PAID', '${วันนี้}', '${วันนี้}')`).join(",\n      ")};
    insert into public.customers (id, dealer_code, name, company, province, join_date) values
      ${[1, 2, 3].map(i => `(${ฐานเลข + 30 + i}, '${c}', 'ZZTEST ลูกค้าส่วนต่าง ${c}-${i}', 'ZZTEST ลูกค้าส่วนต่าง ${c}-${i}', 'ตราด', '${วันนี้}')`).join(", ")};
    insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, status, due_at) values
      (${ฐานเลข + 11}, 'RQ-${c}-M1', '${c}', ${ฐานเลข + 1}, 'ZZTEST', 'won', now()),
      (${ฐานเลข + 12}, 'RQ-${c}-M2', '${c}', ${ฐานเลข + 2}, 'ZZTEST', 'won', now());
    insert into public.hq_quotes (id, request_id, version, quote_no, status, total_cost) values
      (${ฐานเลข + 21}, ${ฐานเลข + 11}, 1, 'HQ-${c}-M1', 'ordered', 800000),
      (${ฐานเลข + 22}, ${ฐานเลข + 12}, 1, 'HQ-${c}-M2', 'ordered', 450000);
    insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, won_at, deal_id, hq_quote_id, customer_id) values
      ('${c}', '${ใบ(c, 1)}', 'ZZTEST ใบส่วนต่าง 1', 'ZZTEST', 'won', 1000000, '${วันนี้}', now(), ${ฐานเลข + 1}, ${ฐานเลข + 21}, ${ฐานเลข + 31}),
      ('${c}', '${ใบ(c, 2)}', 'ZZTEST ใบส่วนต่าง 2', 'ZZTEST', 'won', 500000,  '${วันนี้}', now(), ${ฐานเลข + 2}, ${ฐานเลข + 22}, ${ฐานเลข + 32}),
      ('${c}', '${ใบ(c, 3)}', 'ZZTEST ใบส่วนต่าง 3', 'ZZTEST', 'won', 300000,  '${วันนี้}', now(), ${ฐานเลข + 3}, null, ${ฐานเลข + 33});
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values
      ('${c}', '${ใบ(c, 1)}', now()), ('${c}', '${ใบ(c, 2)}', now()), ('${c}', '${ใบ(c, 3)}', now());
    -- ปิดตัวดักแล้วป้ายของลีด (มีใบแล้ว/ขั้นไกลสุด · ใบ 0258) ไม่ถูกคิดตาม → คิดให้ด้วยตัวคำนวณของฐานเอง (ข้อ lead_has_quotes ตรวจทุกลีดในฐาน)
    ${[1, 2, 3].map(i => `select public._lead_refresh_has_quotes('${c}', ${ฐานเลข + i});`).join(" ")}
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของสาขาไม่ได้");
});
test.afterAll(async () => {
  const c = สาขา.รหัส;
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.quotation_won_at where dealer_code = '${c}'; delete from public.quotations where dealer_code = '${c}';
    delete from public.hq_quotes where request_id in (select id from public.quote_requests where dealer_code = '${c}');
    select set_config('pms.quote_request_delete', 'test', false);   -- ตัวกันห้ามลบคำขอ (ใบ 0280) ยอมเฉพาะชุดล้างข้อมูลทดสอบ
    delete from public.quote_requests where dealer_code = '${c}'; delete from public.leads where dealer_code = '${c}';
    delete from public.customers where dealer_code = '${c}';
    set local session_replication_role = origin;`);
  await สาขา.ลบ();
});

const ตาราง = (page: Page) => page.getByRole("table", { name: "รายการใบเสนอราคา" });
const แถวใบ = (page: Page, เลขที่: string) => ตาราง(page).locator("tbody tr").filter({ has: page.locator("[data-quote-no]", { hasText: เลขที่ }) });
const เลข = (s: string | null) => (s == null || s === "" ? null : Number(s));
async function ค่าแถว(page: Page, เลขที่: string) {
  const แถว = แถวใบ(page, เลขที่);
  await expect(แถว, `มีแถว ${เลขที่}`).toBeVisible({ timeout: 25_000 });
  await expect(แถว.locator('[data-col="hq-cost"]'), `${เลขที่}: โหลดส่วนต่างแล้ว`).not.toHaveText("…", { timeout: 20_000 });
  return Promise.all(คอลัมน์.map(async k => ({ ค่า: เลข(await แถว.locator(`[data-col="${k}"]`).getAttribute("data-value")), ข้อความ: (await แถว.locator(`[data-col="${k}"]`).innerText()).trim() })));
}

test("[func·hq] ใบเสนอราคาทั้งเครือ: ราคาส่ง HQ · ราคาขาย · ส่วนต่างรายใบ · เฉลี่ยถ่วง = การ์ดส่วนต่างกำไรเฉลี่ย · แผงใบ = แถว", async ({ page }) => {
  const c = สาขา.รหัส;
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quotations?dealer=${c}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), "ระดับสาขาของข้อ").toContainText(c, { timeout: 25_000 });
  await expect(ตาราง(page).locator("thead th[data-col-head]")).toHaveText(["ราคาจาก HQ", "ราคาขายลูกค้า", "ส่วนต่าง ฿", "ส่วนต่าง %"]);

  // 1) ค่าที่รู้รายใบ
  const q1 = await ค่าแถว(page, ใบ(c, 1)), q2 = await ค่าแถว(page, ใบ(c, 2)), q3 = await ค่าแถว(page, ใบ(c, 3));
  expect(q1.map(x => x.ค่า), "Q1: ราคาส่ง 800,000 · ขาย 1,000,000 · ต่าง 200,000 · 20.0%").toEqual([800000, 1000000, 200000, 20]);
  expect(q1.map(x => x.ข้อความ), "Q1 ข้อความ (ตัวจัดรูปเงินเดียวกับคอลัมน์มูลค่า)").toEqual([fmtBaht(800000), fmtBaht(1000000), fmtBaht(200000), "20.0%"]);
  expect(q2.map(x => x.ค่า), "Q2: ราคาส่ง 450,000 · ขาย 500,000 · ต่าง 50,000 · 10.0%").toEqual([450000, 500000, 50000, 10]);
  expect(q3.map(x => x.ข้อความ), "Q3 ไม่ได้ทำจากใบ HQ = — ทุกช่อง (ไม่กุ)").toEqual(["—", "—", "—", "—"]);

  // 2) ข้ามหน้า: เฉลี่ยถ่วงจากตาราง = การ์ดส่วนต่างกำไรเฉลี่ยของภาพรวมยอดขาย (สาขาเดียวกัน · ช่วงเดียวกับหน้านี้)
  const ต่าง = [q1, q2, q3].reduce((a, r) => a + (r[2].ค่า ?? 0), 0), ขาย = [q1, q2, q3].reduce((a, r) => a + (r[1].ค่า ?? 0), 0);
  const ถ่วง = Math.round(1000 * ต่าง / ขาย) / 10;
  expect(ถ่วง, "เฉลี่ยถ่วงจากตาราง = 250,000 ÷ 1,500,000").toBe(16.7);
  const แถวการ์ด = page.locator("[data-kpi-row]").first();
  const [ต้น, ท้าย] = [await แถวการ์ด.getAttribute("data-range-start"), await แถวการ์ด.getAttribute("data-range-end")];
  const sb = await db(ADMIN);
  const { data, error } = await sb.rpc("kpi_cards", { p_page: "hq.pipeline", p_start: ต้น, p_end: ท้าย, p_dealer: c, p_today: null });
  expect(error?.message ?? "").toBe("");
  expect(Number((data as { margin: { pct: number } }).margin.pct), "การ์ดส่วนต่างกำไรเฉลี่ย (ภาพรวมยอดขาย) = เฉลี่ยถ่วงจากตาราง").toBe(ถ่วง);
  // การ์ดบนหน้าภาพรวมยอดขายจริง (กรองสาขาเดียวกัน) ตรงค่าเดียวกัน
  await page.goto(`${HQ_ORIGIN}/hq/pipeline?dealer=${c}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const การ์ด = page.locator('[data-kpi-row] [data-kpi="margin"] [data-value]');
  await expect(การ์ด, "การ์ดบนหน้าภาพรวมยอดขาย = เฉลี่ยถ่วงจากตาราง").toHaveAttribute("data-value", String(ถ่วง), { timeout: 25_000 });

  // 3) แผงใบ = แถว (ใบที่ทำจากใบ HQ + ใบที่ไม่ได้ทำ)
  await page.goto(`${HQ_ORIGIN}/hq/quotations?dealer=${c}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  for (const [เลขที่, แถว] of [[ใบ(c, 1), q1], [ใบ(c, 3), q3]] as const) {
    await แถวใบ(page, เลขที่).click();
    const แผง = page.locator('[data-panel="quote-resale"]');
    await expect(แผง, `${เลขที่}: แผงมีตัวเลขขายต่อ`).toBeVisible({ timeout: 15_000 });
    await expect(แผง.locator('[data-cell="hq-cost"]')).not.toHaveText("…", { timeout: 15_000 });
    for (const [i, k] of คอลัมน์.entries())
      await expect(แผง.locator(`[data-cell="${k}"]`), `${เลขที่}: แผง ${k} = แถว`).toHaveText(แถว[i].ข้อความ);
    await page.getByRole("button", { name: /ปิด/ }).first().click();
    await expect(แผง).toHaveCount(0);
  }
});

test("[func·สิทธิ์] ดีลเลอร์เรียกส่วนต่างรายใบของ HQ ไม่ได้ · ดูส่วนต่างของสาขาอื่นไม่ได้", async () => {
  const c = สาขา.รหัส;
  // ดีลเลอร์เจ้าของใบเอง: ฟังก์ชันของ HQ = ปฏิเสธ
  const เจ้าของ = await db(สาขา.บัญชี);
  const ตัวเอง = await เจ้าของ.rpc("hq_quote_margins", { p_dealers: [c], p_ids: [ใบ(c, 1)] });
  expect(ตัวเอง.error?.message ?? "", "ดีลเลอร์เรียก hq_quote_margins = forbidden").toMatch(/forbidden/);
  // ดีลเลอร์สาขาอื่น (RYG): ส่วนต่างของใบสาขาของข้อ = ปฏิเสธ / ไม่มีค่า / มองไม่เห็นใบ
  const อื่น = await db(RYG);
  const ผ่านHQ = await อื่น.rpc("hq_quote_margins", { p_dealers: [c], p_ids: [ใบ(c, 1)] });
  expect(ผ่านHQ.error?.message ?? "", "สาขาอื่นเรียก hq_quote_margins = forbidden").toMatch(/forbidden/);
  const รายบรรทัด = await อื่น.rpc("quotation_margin", { p_dealer: c, p_id: ใบ(c, 1) });
  expect(รายบรรทัด.error?.message ?? "").toBe("");
  expect(รายบรรทัด.data, "สาขาอื่นดูส่วนต่างรายบรรทัดไม่ได้ (null)").toBeNull();
  const แถว = await อื่น.from("quotations").select("id").eq("dealer_code", c);
  expect(แถว.data ?? [], "สาขาอื่นมองไม่เห็นใบของสาขาของข้อ").toEqual([]);
  // HQ เรียกได้ (คุมว่าข้อบนตกเพราะสิทธิ์ ไม่ใช่เพราะฟังก์ชันพัง)
  const hq = await (await db(ADMIN)).rpc("hq_quote_margins", { p_dealers: [c], p_ids: [ใบ(c, 1)] });
  expect(hq.error?.message ?? "").toBe("");
  expect((hq.data as { baht: number }[]).map(r => Number(r.baht)), "HQ เห็นส่วนต่างของใบ").toEqual([200000]);
});
