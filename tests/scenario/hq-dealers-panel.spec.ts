import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── หน้า HQ ดีลเลอร์ (/hq/dealers) ตารางตามแบบ + แผงด้านขวา (บอสสั่ง/ตัดสิน 30 ต.ค. 69 · FLOW H11 "งานดูแล ไม่มีตัวเลขยอดขาย") ──
// ตาราง: ลำดับ · รหัส · ดีลเลอร์ · จังหวัด · ภูมิภาค · แพ็กเกจ · สถานะ · ปุ่ม — ไม่มี ยอด/เป้า · โอกาสขาย · ตรงเวลา · ไม่มีปุ่มลบ
// แผง: กดแถว = เปิดแผง (หน้าไม่เปลี่ยน) · /hq/dealers/[รหัส] = รายการ + แผงนั้น · ปิดแผงแล้วตัวกรอง/ตำแหน่งเลื่อนอยู่ที่เดิม
//   ภาพรวม: ตัวเลขงานดูแล (= ฐาน hq_dealer_panel · ใบ 0266) กดแล้วไปแท็บ · ข้อมูลบริษัทไม่ครบ = เตือน · ไม่มี ฿ ในแผง
// ข้อมูลของข้อ: สาขาของข้อ (ลีดเปิด 2 · ปิดสำเร็จ 1 · คำขอรอ HQ 1 · ใบรอลูกค้าตอบ 1 · ร่าง 1 · ลูกค้า 1 · ข้อมูลบริษัทขาดเลขผู้เสียภาษี)
// ตกบนโค้ดเดิม: กดแถวไปหน้ารายละเอียดเต็มจอ (ไม่มีแผง) · หน้าเดิมมีการ์ด "ผลงานดีลเลอร์" · แถวมีปุ่มเดียว
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(150_000);

const admin = adminClient();
const เลข = 1_800_000_000 + Math.floor(Math.random() * 400_000) * 100;
let ก: สาขาของข้อ | null = null;
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  ก = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", ชื่อ: "ZZTEST ดีลเลอร์แผงขวา" });
  const c = ก.รหัส;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.dealer_settings (dealer_code, issuer) values ('${c}', '{"company": "ZZTEST บริษัทแผง ${c}", "address": "ZZTEST ที่อยู่", "phone": "000-000-0000", "taxId": ""}')
      on conflict (dealer_code) do update set issuer = excluded.issuer;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
      ('#L-${เลข + 1}', ${เลข + 1}, '${c}', 'ZZTEST ลีดแผง ก', 'ZZTEST', '000-000-0001', 'ตราด', 'WAITING', '${วันนี้}'),
      ('#L-${เลข + 2}', ${เลข + 2}, '${c}', 'ZZTEST ลีดแผง ข', 'ZZTEST', '000-000-0002', 'ตราด', 'QUOTED', '${วันนี้}'),
      ('#L-${เลข + 3}', ${เลข + 3}, '${c}', 'ZZTEST ลีดแผง ค', 'ZZTEST', '000-000-0003', 'ตราด', 'PAID', '${วันนี้}');
    insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at) values
      (${เลข + 11}, 'QR-${c}-1', '${c}', ${เลข + 1}, 'ZZTEST', 'new', now(), now() + interval '14 days');
    insert into public.customers (id, dealer_code, name, company, province) values (${เลข + 21}, '${c}', 'ZZTEST ลูกค้าแผง', 'ZZTEST ลูกค้าแผง', 'ตราด');
    insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, date) values
      ('${c}-Q1', '${c}', 'ZZTEST ลูกค้าแผง', 'sent_to_client', 50000, '[]', '${วันนี้}'),
      ('${c}-Q2', '${c}', 'ZZTEST ลูกค้าแผง', 'draft', 70000, '[]', '${วันนี้}');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  if (!ก) return;
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.quotations where dealer_code = '${ก.รหัส}';
    delete from public.customers where dealer_code = '${ก.รหัส}';
    select set_config('pms.quote_request_delete', 'test', false);   -- ตัวกันห้ามลบคำขอ (ใบ 0280) ยอมเฉพาะชุดล้างข้อมูลทดสอบ
    delete from public.quote_requests where dealer_code = '${ก.รหัส}';
    delete from public.leads where dealer_code = '${ก.รหัส}';
    set local session_replication_role = origin;`);
  await ก.ลบ();
});

// หัวคอลัมน์ + จังหวัด/ภูมิภาค/สถานะ ไม่ถูกตัด ทุกขนาดจอทำงาน (ผู้ใช้แจ้ง 10 พ.ย. 69: หัว "ลำดับ" ขึ้น "ลำ..." · "กรุงเทพมหา...")
//   ต้นเหตุ: ความกว้าง % + px รวมเกินพื้นที่ตาราง → เบราว์เซอร์บีบทุกคอลัมน์ · ตกบนโค้ดเดิม (หัวลำดับถูกตัด)
test("[ui·hq] ดีลเลอร์: หัวคอลัมน์และจังหวัดยาวสุด (กรุงเทพมหานคร) ไม่ถูกตัด ที่จอ 1366 / 1440 / 1920", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const w of [1366, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill("กรุงเทพมหานคร");
    const ตาราง = page.locator(".table-wrap table").first();
    const แถว = ตาราง.locator("tbody tr").filter({ hasText: "กรุงเทพมหานคร" }).first();
    await expect(แถว, `จอ ${w}: มีดีลเลอร์จังหวัดกรุงเทพมหานคร (ข้อมูลตั้งต้น)`).toBeVisible({ timeout: 20_000 });
    const ตัด = await ตาราง.evaluate(t => Array.from(t.querySelectorAll<HTMLElement>("thead th, tbody tr:first-child td[data-col='province'], tbody tr:first-child td[data-col='code'] span, tbody tr:first-child td[data-col='region'] .badge, tbody tr:first-child td[data-col='status'] .badge"))
      .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent?.trim() || e.getAttribute("aria-label")));
    expect(ตัด, `จอ ${w}: หัวคอลัมน์ · รหัส · จังหวัด · ภูมิภาค · สถานะ ไม่ถูกตัด`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `จอ ${w}: หน้าไม่ล้นแนวนอน`).toBeLessThanOrEqual(1);
  }
});

async function ค้นรายการ(page: Page, คำ: string) {
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill(คำ);
}
const แผงของ = (page: Page, code: string) => page.locator(`[data-dealer-panel="${code}"]`);

test("[H11·hq] ดีลเลอร์: ตารางตามแบบ ไม่มีตัวเลขยอดขาย/เป้า ไม่มีปุ่มลบ · ป้ายไม่ถูกตัด · ปุ่มปิดใช้งานใช้ได้จริง", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await ค้นรายการ(page, ก!.รหัส);
  const ตาราง = page.locator(".table-wrap table").first();
  const แถว = ตาราง.locator("tbody tr").filter({ hasText: ก!.รหัส });
  await expect(แถว).toHaveCount(1, { timeout: 20_000 });
  expect((await ตาราง.locator("thead th").allInnerTexts()).map(t => t.trim())).toEqual(["ลำดับ", "รหัส", "ดีลเลอร์", "จังหวัด", "ภูมิภาค", "สถานะ", ""]);
  // กันหลุดกลับมา: ไม่มีตัวเลขยอดขาย/เป้า/โอกาสขาย/ตรงเวลา ทั้งหน้า
  await expect(page.locator(".erp"), "หน้าดีลเลอร์ไม่มีตัวเลขยอดขาย/เป้า").not.toContainText(/฿|ยอดขาย|ยอด\s*\/\s*เป้า|เป้ายอด|โอกาสขาย|ตรงเวลา|ผลงานดีลเลอร์/);
  // มุมมองแบบการ์ดก็ต้องไม่มี ฿ ยอดขาย/เป้า (บอสสั่ง 30 ต.ค. 69 · ข้อนี้ครอบทั้งตารางและการ์ด)
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=card`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill(ก!.รหัส);
  await expect(page.locator(".erp").getByText(ก!.รหัส).first(), "มุมมองการ์ด: เห็นการ์ดของสาขาของข้อ").toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".erp .table-wrap table"), "มุมมองการ์ดไม่ใช่ตาราง").toHaveCount(0);
  await expect(page.locator(".erp"), "มุมมองการ์ดไม่มีตัวเลขยอดขาย/เป้า").not.toContainText(/฿|ยอดขาย|ยอด\s*\/\s*เป้า|เป้ายอด|โอกาสขาย|ตรงเวลา|ผลงานดีลเลอร์/);
  await ค้นรายการ(page, ก!.รหัส);
  await expect(page.locator("button[title*='ลบ'], button[aria-label*='ลบ']"), "ไม่มีปุ่มลบดีลเลอร์").toHaveCount(0);
  // ชื่อดีลเลอร์ · ป้ายภูมิภาค · แพ็กเกจ · สถานะ ไม่ถูกตัดที่จอกว้าง · ภูมิภาคใช้ชื่อกลาง
  // ชื่อดีลเลอร์ตัดด้วย … ได้ (ล็อกความกว้างคอลัมน์ % · บอสสั่ง 10 พ.ย. 69) — ชี้แล้วเห็นเต็ม (title ด้านล่าง) · ป้ายภูมิภาค/สถานะห้ามตัด
  const ตัด = await แถว.evaluate(tr => Array.from(tr.querySelectorAll<HTMLElement>("td[data-col='region'] .badge, td[data-col='status'] .badge"))
    .filter(e => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > (e.closest("td")!.getBoundingClientRect().right + 1)).map(e => e.textContent));
  expect(ตัด, "จอ 1440: ป้ายภูมิภาค/สถานะ ไม่ถูกตัด").toEqual([]);
  await expect(แถว.locator("td[data-col='region']")).toHaveText("ภาคตะวันออก");
  await expect(แถว.locator("td[data-col='name']"), "ชี้ที่ชื่อแล้วเห็นเต็ม").toHaveAttribute("title", "ZZTEST ดีลเลอร์แผงขวา");
  // ปุ่มปิดใช้งาน (ตาปิด) ต้องยืนยันก่อน แล้วลงฐานจริง · กดอีกครั้ง (ตาเปิด) = เปิดใช้งาน
  await แถว.locator("[data-row-action='toggle']").click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await admin.from("dealers").select("status").eq("code", ก!.รหัส).single()).data?.status, { timeout: 15_000 }).toBe("inactive");
  await expect(แถว.locator("[data-row-action='toggle']")).toHaveAttribute("title", /เปิดใช้งาน/);
  await แถว.locator("[data-row-action='toggle']").click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await admin.from("dealers").select("status").eq("code", ก!.รหัส).single()).data?.status, { timeout: 15_000 }).toBe("active");
  // ดูผลงาน → ภาพรวมยอดขาย เลือกดีลเลอร์นี้ไว้ให้ (ลิงก์อย่างเดียว ไม่แสดงตัวเลขในหน้านี้)
  await แถว.locator("[data-row-action='perf']").click();
  await expect(page).toHaveURL(/\/hq\/pipeline/, { timeout: 15_000 });
  await expect(page.getByLabel("ทุกดีลเลอร์", { exact: true }).first(), "เลือกดีลเลอร์นี้ไว้ให้").toHaveValue(ก!.รหัส, { timeout: 15_000 });
  assertNoErrors(errs, "ตารางดีลเลอร์");
});

test("[H11·hq] ดีลเลอร์: กดแถว = แผงด้านขวา (หน้าไม่เปลี่ยน) · ปิดแล้วตัวกรอง/ตำแหน่งเลื่อนอยู่ที่เดิม · /hq/dealers/[รหัส] = แผงนั้น", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 700 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByLabel("กรองตามสถานะดีลเลอร์").selectOption("active");
  await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill(ก!.รหัส);
  const แถว = page.locator("tbody tr").filter({ hasText: ก!.รหัส }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  // เลื่อนลงก่อนเปิด (ตัวเลื่อนจริงของหน้า) — ปิดแผงแล้วต้องกลับมาที่ตำแหน่งเดิม
  const เลื่อน = () => แถว.evaluate(el => { let p: HTMLElement | null = el.parentElement; while (p && !(p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement; return p ? p.scrollTop : window.scrollY; });
  await แถว.scrollIntoViewIfNeeded();
  const ก่อน = await เลื่อน();
  const ที่อยู่ = page.url();
  await แถว.locator("td").nth(2).click();
  const แผง = แผงของ(page, ก!.รหัส);
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  // แผงอยู่ในที่อยู่หน้าเว็บ (บอสสั่ง 11 พ.ย. 69 · กลับด้านจาก "URL เท่าเดิม"): หน้าเดิม + ?open=รหัส · ปิดแผง = ที่อยู่เดิม
  expect(new URL(page.url()).pathname, "กดแถวแล้วไม่เปลี่ยนหน้า").toBe(new URL(ที่อยู่).pathname);
  expect(new URL(page.url()).searchParams.get("open"), "แผงอยู่ในที่อยู่หน้าเว็บ").toBe(ก!.รหัส);
  await แผง.getByRole("button", { name: "ปิดแผง" }).click();
  await expect(แผง).toHaveCount(0);
  expect(page.url(), "ปิดแผง = ที่อยู่เดิม (ไม่มี ?open)").toBe(ที่อยู่);
  await expect(page.getByPlaceholder(/ค้นหาดีลเลอร์/), "คำค้นอยู่ที่เดิม").toHaveValue(ก!.รหัส);
  await expect(page.getByLabel("กรองตามสถานะดีลเลอร์"), "ตัวกรองสถานะอยู่ที่เดิม").toHaveValue("active");
  expect(Math.abs((await เลื่อน()) - ก่อน), "ตำแหน่งเลื่อนอยู่ที่เดิม").toBeLessThan(2);

  // เปิด /hq/dealers/[รหัส] ตรง ๆ (ลิงก์เก่า/กระดิ่ง) = รายการ + แผงนั้น · ปิดแล้วอยู่หน้ารายการ
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${ก!.รหัส}`, { waitUntil: "domcontentloaded" });
  await expect(แผงของ(page, ก!.รหัส), "เปิดตรง = แผงของดีลเลอร์นั้น").toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".table-wrap table").first(), "ใต้แผงคือหน้ารายการ").toBeAttached();
  await แผงของ(page, ก!.รหัส).getByRole("button", { name: "ปิดแผง" }).click();
  await expect(page).toHaveURL(/\/hq\/dealers$/);
  await expect(page.locator("[data-dealer-panel]")).toHaveCount(0);
  // ลิงก์เก่า /hq/dealers/[รหัส] → ที่อยู่แบบเดียว /hq/dealers?open=รหัส (บอสสั่ง 11 พ.ย. 69 · แผงอยู่ในที่อยู่)
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${ก!.รหัส}`, { waitUntil: "domcontentloaded" });
  await expect(page, "ลิงก์เก่าแทนที่เป็น ?open=รหัส").toHaveURL(new RegExp(`/hq/dealers\\?open=${ก!.รหัส}$`), { timeout: 20_000 });
  await expect(แผงของ(page, ก!.รหัส)).toBeVisible({ timeout: 20_000 });
  assertNoErrors(errs, "แผงดีลเลอร์ เปิด/ปิด");
});

test("[H11·hq] แผงดีลเลอร์: ตัวเลขงานดูแล = ฐาน · กดแล้วไปแท็บนั้น · เตือนข้อมูลบริษัทไม่ครบ · ข้อมูลเข้าระบบ · ไม่มี ฿", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${ก!.รหัส}`, { waitUntil: "domcontentloaded" });
  const แผง = แผงของ(page, ก!.รหัส);
  await expect(แผง).toBeVisible({ timeout: 20_000 });
  // หัวแผง: ชื่อ · รหัส · สถานะ · จังหวัด/ภูมิภาค · ปุ่ม เข้าระบบ แก้ไข ปิดใช้งาน ดูผลงาน
  await expect(แผง.locator("[data-panel-name]")).toHaveText("ZZTEST ดีลเลอร์แผงขวา");
  for (const ชื่อ of ["เข้าระบบ", "แก้ไข", "ปิดใช้งาน", "ดูผลงาน"]) await expect(แผง.getByRole("button", { name: ชื่อ, exact: true }), `ปุ่ม ${ชื่อ}`).toBeVisible();
  // ตัวเลขงานดูแล = ฐาน (และ = ค่าที่วางไว้)
  const { data, error } = await (await db(ADMIN)).rpc("hq_dealer_panel", { p_code: ก!.รหัส, p_activity_limit: 10 });
  expect(error).toBeNull();
  const c = (data as { counts: Record<string, number> }).counts;
  expect(c, "ฐาน: ลีดเปิด 2 · คำขอรอ HQ 1 · ใบรอตอบ 1 · ลูกค้า 1").toEqual({ openLeads: 2, requestsWaitingHq: 1, quotesAwaiting: 1, customers: 1 });
  for (const [k, v] of Object.entries(c)) await expect(แผง.locator(`[data-stat='${k}'] [data-value]`), `ตัวเลข ${k} = ฐาน`).toHaveText(String(v), { timeout: 15_000 });
  // ข้อมูลบริษัทไม่ครบ → เตือน (ต้องมีก่อนส่งใบแรก) · ผู้ติดต่อ = บัญชีดีลเลอร์
  await expect(แผง.locator("[data-issuer-missing]")).toContainText("เลขผู้เสียภาษี");
  await expect(แผง.locator("[data-panel-section='company']")).toContainText(`ZZTEST ${ก!.รหัส}`);
  // ข้อมูลเข้าระบบ (การ์ดกลาง: ชื่อผู้ใช้ · ดูรหัสผ่าน · แก้อีเมล/รหัสผ่าน · สิทธิ์แก้เอง)
  await expect(แผง.locator("[data-panel-section='login']")).toContainText(/ข้อมูลเข้าระบบ/);
  // ไม่มี ฿ ในแผง (ยอดขาย/เป้าอยู่ที่ภาพรวมยอดขายที่เดียว)
  await expect(แผง, "ในแผงไม่มีตัวเลข ฿").not.toContainText(/฿|ยอดขาย|ผลงานดีลเลอร์/);
  // กดตัวเลข → แท็บนั้นในแผง · แถวในแท็บตรงข้อมูลของข้อ
  await แผง.locator("[data-stat='openLeads']").click();
  await expect(แผง.locator("[data-panel-tab='leads']")).toHaveAttribute("data-active", "1");
  await expect(แผง.locator("[data-panel-row]")).toHaveCount(3);
  await แผง.locator("[data-panel-tab='overview']").click();
  await แผง.locator("[data-stat='quotesAwaiting']").click();
  await expect(แผง.locator("[data-panel-tab='quotes']")).toHaveAttribute("data-active", "1");
  await expect(แผง.locator("[data-panel-row]")).toHaveCount(2);
  await แผง.locator("[data-panel-tab='overview']").click();
  await แผง.locator("[data-stat='customers']").click();
  await expect(แผง.locator("[data-panel-tab='customers']")).toHaveAttribute("data-active", "1");
  await expect(แผง.locator("[data-panel-row]").filter({ hasText: "ZZTEST ลูกค้าแผง" })).toHaveCount(1, { timeout: 15_000 });
  // กดแถวลีด → เปิดแผงของลีดนั้น (หน้าลูกค้าเป้าหมายทั้งเครือ)
  await แผง.locator("[data-panel-tab='leads']").click();
  await แผง.locator("[data-panel-row]").filter({ hasText: "ZZTEST ลีดแผง ก" }).click();
  await expect(page).toHaveURL(/\/hq\/leads/, { timeout: 15_000 });
  await expect(page.locator(".side-drawer"), "แผงลีดนั้นเปิด").toContainText("ZZTEST ลีดแผง ก", { timeout: 20_000 });
  assertNoErrors(errs, "แผงดีลเลอร์ ภาพรวม");
});
