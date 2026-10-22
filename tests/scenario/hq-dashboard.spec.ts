import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { ลบใบทดสอบที่ฐาน } from "./legacyQuotes";

// ── แดชบอร์ด HQ (บอสสั่ง 21 ต.ค. 69 · ตัวคำนวณ hq_dashboard ใบ 0235) ───────────────────────────────────────────────
//   ใช้สาขาทดสอบของไฟล์นี้เอง (ZZDB มีข้อมูลที่รู้ค่า · ZZDE ว่าง) แล้วเลือกดีลเลอร์นั้นบนหน้า → ตัวเลขไม่โดนข้อทดสอบอื่นที่รันพร้อมกันกวน
//   1) การ์ด 4 ใบ + 10 อันดับ ตรงกับการนับจากตาราง · เปลี่ยนช่วงเวลา (วันนี้ ↔ ปีนี้) ตัวเลขเปลี่ยนจริง
//      ยอดขายนับตาม "วันที่ลูกค้าตอบรับ" (ใบที่ออกต้นปีแต่ตอบรับวันนี้ = ยอดวันนี้)
//   2) วันนี้ต้องทำ = นับจากตาราง · เลือกดีลเลอร์แล้วไม่เปลี่ยน · กดแล้วไปหน้างานพร้อมตัวกรอง
//   3) ดีลเลอร์ที่ไม่มีข้อมูล = กรอบว่างทุกใบ (ไม่วาดเส้น 0 / ตาราง 0%)
//   4) กิจกรรมล่าสุด: บัญชีทดสอบ/สาขา ZZ/ป้าย ZZTEST ไม่โผล่ · กดแล้วไปที่เรื่องนั้น
//   5) สัดส่วนดีลเลอร์ตามภาค = ทะเบียนดีลเลอร์ไม่นับแถว HQ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const admin = adminClient();
const ป้าย = `${Date.now() % 100000}`;
const สาขา = "ZZDB", สาขาว่าง = "ZZDE";
const เลขลูกค้า = 979_200_001;
const เลขลีด = [979_200_101, 979_200_102, 979_200_103];
const ปี = new Date(Date.now() + 7 * 3_600_000).getUTCFullYear();
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ต้นปี = `${ปี}-01-02`;
const กิจกรรมจริง = `กิจกรรมแดชบอร์ด-${ป้าย}`;

function ล้าง() {
  ลบใบทดสอบที่ฐาน(`dealer_code in ('${สาขา}', '${สาขาว่าง}')`);
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.dealer_package_proposals where id = 979200811;
    delete from public.dealer_prospects where id = 979200801;
    delete from public.quote_request_events where request_id = 979200901;
    delete from public.quote_requests where id = 979200901;
    delete from public.leads where dealer_code in ('${สาขา}', '${สาขาว่าง}');
    delete from public.customers where dealer_code in ('${สาขา}', '${สาขาว่าง}');
    delete from public.files where dealer_code in ('${สาขา}', '${สาขาว่าง}');
    delete from public.dealers where code in ('${สาขา}', '${สาขาว่าง}');
    delete from public.audit_log where target like '%แดชบอร์ด-${ป้าย}%';`);
}

test.beforeAll(() => {
  ล้าง();
  // ใบ: Q1 ออกต้นปี ตอบรับวันนี้ 120,000 · Q2 ออกวันนี้ ตอบรับต้นปี 80,000 · Q3 ส่งแล้ววันนี้ · Q4 ร่างวันนี้ (ไม่นับ)
  // ลีด: วันนี้ ปิดสำเร็จ 1 (ผูก Q1) + ปิดไม่สำเร็จ 1 · ต้นปี รอติดต่อ 1
  // กิจกรรม: เห็น 1 รายการ (HQ แก้ไขดีลเลอร์ RYG) · ไม่เห็น 4 รายการ (บัญชีชั่วคราว · อีเมลทดสอบ · สาขา ZZ · ป้าย ZZTEST)
  const out = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.dealers (code, name, status, province, region, revenue_target) values
      ('${สาขา}', 'ZZTEST สาขาแดชบอร์ด (ลบทิ้ง)', 'active', 'ระยอง', 'ตะวันออก', 36500000),
      ('${สาขาว่าง}', 'ZZTEST สาขาว่าง (ลบทิ้ง)', 'active', 'ระยอง', 'ตะวันออก', 0);
    insert into public.customers (id, dealer_code, name, company, province) values (${เลขลูกค้า}, '${สาขา}', 'ZZTEST-ลูกค้าแดชบอร์ด', 'ZZTEST-ลูกค้าแดชบอร์ด', 'ระยอง');
    insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, customer_id, deal_id) values
      ('${สาขา}', 'Q-${สาขา}-1', 'ZZTEST-ลูกค้าแดชบอร์ด', 'ZZTEST', 'won', 120000, '${ต้นปี}', ${เลขลูกค้า}, ${เลขลีด[0]}),
      ('${สาขา}', 'Q-${สาขา}-2', 'ZZTEST-ลูกค้าแดชบอร์ด', 'ZZTEST', 'won',  80000, '${วันนี้}', ${เลขลูกค้า}, null),
      ('${สาขา}', 'Q-${สาขา}-3', 'ZZTEST-ลูกค้าแดชบอร์ด', 'ZZTEST', 'sent_to_client', 5000, '${วันนี้}', null, null),
      ('${สาขา}', 'Q-${สาขา}-4', 'ZZTEST-ลูกค้าแดชบอร์ด', 'ZZTEST', 'draft', 6000, '${วันนี้}', null, null),
      ('${สาขา}', 'Q-${สาขา}-5', 'ZZTEST-ลูกค้าแดชบอร์ด', 'ZZTEST', 'lost', 7000, '${วันนี้}', null, null);
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values
      ('${สาขา}', 'Q-${สาขา}-1', (('${วันนี้}'::date)::timestamp + interval '10 hours') at time zone 'Asia/Bangkok'),
      ('${สาขา}', 'Q-${สาขา}-2', (('${ต้นปี}'::date)::timestamp + interval '9 hours') at time zone 'Asia/Bangkok');
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
      ('#L-${เลขลีด[0]}', ${เลขลีด[0]}, '${สาขา}', 'ZZTEST-ลีดแดชบอร์ด1', 'ZZTEST', '0000000001', 'ระยอง', 'PAID', '${วันนี้}'),
      ('#L-${เลขลีด[1]}', ${เลขลีด[1]}, '${สาขา}', 'ZZTEST-ลีดแดชบอร์ด2', 'ZZTEST', '0000000002', 'ระยอง', 'CANCELLED', '${วันนี้}'),
      ('#L-${เลขลีด[2]}', ${เลขลีด[2]}, '${สาขา}', 'ZZTEST-ลีดแดชบอร์ด3', 'ZZTEST', '0000000003', 'ระยอง', 'WAITING', '${ต้นปี}');
    -- งานค้างของ HQ ที่รู้ค่า: คำขอเลยกำหนด 1 · ใบค่าแฟรนไชส์ค้างชำระ 1 (แถว "วันนี้ต้องทำ" มีของให้นับเสมอ)
    insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at) values
      (979200901, 'QR-${สาขา}-1', '${สาขา}', ${เลขลีด[2]}, 'ZZTEST', 'new', now() - interval '20 days', now() - interval '6 days');
    insert into public.dealer_prospects (id, name, status) values (979200801, 'ZZTEST-ผู้สนใจแดชบอร์ด', 'considering');
    insert into public.dealer_package_proposals (id, prospect_id, proposal_no, package, amount, status, payment_due_on) values
      (979200811, 979200801, 'DP-${สาขา}-1', 'standard', 1000, 'accepted', current_date - 3);
    insert into public.audit_log ("user", role, action, target, at) values
      ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ${กิจกรรมจริง}', now()),
      ('บัญชีทดสอบชั่วคราว', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · ชั่วคราว-แดชบอร์ด-${ป้าย}', now()),
      ('live-hq-1@example.test', 'SUPER_ADMIN', 'แก้ไขดีลเลอร์', 'RYG · อีเมลทดสอบ-แดชบอร์ด-${ป้าย}', now()),
      ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ปิดใช้งานดีลเลอร์', 'ZZT · สาขาทดสอบ-แดชบอร์ด-${ป้าย}', now()),
      ('ผู้ดูแลระบบสำนักงานใหญ่', 'SUPER_ADMIN', 'ออกใบค่าแฟรนไชส์', 'DP-1 · ZZTEST-ป้าย-แดชบอร์ด-${ป้าย}', now());
    select 'ok';`);
  if (!out?.includes("ok")) throw new Error("วางข้อมูลแดชบอร์ดไม่สำเร็จ");
});
test.afterAll(ล้าง);

async function เปิด(page: Page) {
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.locator("[data-kpi='sales'] [data-value]")).not.toHaveAttribute("data-value", "", { timeout: 30_000 });
}
async function เลือกดีลเลอร์(page: Page, code: string) {
  await page.getByRole("button", { name: /ทุกดีลเลอร์ \(ทั้งเครือ\)/ }).first().click();
  await page.getByRole("button", { name: new RegExp(`^${code} – `) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^${code} – `) }).first()).toBeVisible();
}
async function เลือกช่วง(page: Page, ชื่อ: "วันนี้" | "ปีนี้") {
  await page.locator("button").filter({ hasText: /^(ปีนี้|วันนี้|เดือนนี้|7 วันล่าสุด|ทุกช่วงเวลา|.*2569.*)$/ }).first().click();
  await page.getByRole("button", { name: ชื่อ, exact: true }).click();
}
const ค่า = async (page: Page, kpi: string) => (await page.locator(`[data-kpi='${kpi}'] [data-value]`).first().getAttribute("data-value")) ?? "";
async function การ์ด(page: Page) {
  // รอให้ตัวเลขชุดใหม่มาถึง (เปลี่ยนตัวกรองแล้วโหลดใหม่) — อ่านซ้ำจนสองรอบติดกันได้ค่าเดียวกัน
  let ก่อน = "";
  for (let i = 0; i < 20; i++) {
    const v = JSON.stringify({ sales: await ค่า(page, "sales"), leads: await ค่า(page, "leads"), quotes: await ค่า(page, "quotes"), win: await ค่า(page, "winrate") });
    if (v === ก่อน) return JSON.parse(v) as Record<string, string>;
    ก่อน = v; await page.waitForTimeout(700);
  }
  return JSON.parse(ก่อน) as Record<string, string>;
}

test("[แดชบอร์ด HQ] การ์ด 4 ใบตรงกับการนับจากตาราง · ช่วงเวลา/ดีลเลอร์เปลี่ยนตัวเลขจริง · ยอดขายตามวันตอบรับ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  await เปิด(page);
  const ทั้งเครือ = await การ์ด(page);
  await เลือกดีลเลอร์(page, สาขา);

  // นับจากตารางเอง (ไม่เรียกตัวคำนวณ) — ช่วง "ปีนี้" = 1 ม.ค. ถึงวันนี้
  const ลีดในช่วง = async (ตั้งแต่: string) => (await admin.from("leads").select("status").eq("dealer_code", สาขา).gte("created_date", ตั้งแต่).lte("created_date", วันนี้)).data ?? [];
  const ใบส่ง = async (ตั้งแต่: string) => ((await admin.from("quotations").select("status, date").eq("dealer_code", สาขา)).data ?? [])
    .filter(q => ["sent_to_client", "won", "lost", "expired"].includes(q.status) && q.date >= ตั้งแต่ && q.date <= วันนี้).length;

  await expect.poll(async () => (await การ์ด(page)).sales, { timeout: 30_000, message: "ปีนี้: ยอดขาย ZZDB = 120,000 + 80,000" }).toBe("200000");
  const ปีนี้ = await การ์ด(page);
  const ลีดปี = await ลีดในช่วง(`${ปี}-01-01`);
  expect(Number(ปีนี้.leads), "ปีนี้: ลีดใหม่ = นับจากตาราง (3)").toBe(ลีดปี.length);
  expect(ลีดปี.length).toBe(3);
  expect(Number(ปีนี้.quotes), "ปีนี้: ใบที่ส่งลูกค้า = นับจากตาราง (4 · ไม่นับร่าง)").toBe(await ใบส่ง(`${ปี}-01-01`));
  expect(await ใบส่ง(`${ปี}-01-01`)).toBe(4);
  expect(Number(ปีนี้.win), "อัตราปิดการขาย = 1 ÷ (1 + 1)").toBe(50);
  await expect(page.locator("[data-kpi='leads']"), "ชื่อการ์ดบอกว่านับลีดของสาขาที่เลือก").toContainText(`ลีดใหม่ของ ${สาขา}`);
  expect(JSON.stringify(ปีนี้), "เลือกดีลเลอร์แล้วตัวเลขเปลี่ยนจากทั้งเครือ").not.toBe(JSON.stringify(ทั้งเครือ));

  await เลือกช่วง(page, "วันนี้");
  await expect.poll(async () => (await การ์ด(page)).sales, { timeout: 30_000, message: "วันนี้: ยอดขาย = Q1 (ออกใบต้นปี แต่ตอบรับวันนี้) เท่านั้น" }).toBe("120000");
  const วัน = await การ์ด(page);
  expect(Number(วัน.leads), "วันนี้: ลีดใหม่ = นับจากตาราง (2)").toBe((await ลีดในช่วง(วันนี้)).length);
  expect(Number(วัน.quotes), "วันนี้: ใบที่ส่งลูกค้า = นับจากตาราง (3)").toBe(await ใบส่ง(วันนี้));
  expect(await ใบส่ง(วันนี้)).toBe(3);
  await expect(page.locator("[data-kpi='sales'] [data-target]"), "วันนี้: เป้าเฉลี่ย 1 วัน = 36.5 ล้าน ÷ 365").toHaveAttribute("data-target", "100000");

  // 10 อันดับ: แถวเดียว ZZDB · ยอดวันนี้
  const แถว = page.locator("[data-top-row]");
  await expect(แถว).toHaveCount(1);
  await expect(page.locator(`[data-top-row='${สาขา}'] [data-value]`)).toHaveAttribute("data-value", "120000");
  // กราฟยอดขายมีข้อมูล = ไม่ใช่กรอบว่าง
  await expect(page.locator("[data-card='trend'] [data-empty]")).toHaveCount(0);
  assertNoErrors(errs, "แดชบอร์ด HQ: การ์ด");
});

test("[แดชบอร์ด HQ] ดีลเลอร์ที่ไม่มีข้อมูล = กรอบว่างทุกใบ (ไม่วาดเส้น 0 / ตาราง 0%)", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  await เปิด(page);
  await เลือกดีลเลอร์(page, สาขาว่าง);
  await expect(page.locator("[data-card='top']")).toContainText("ยังไม่มียอดขายในช่วงนี้", { timeout: 30_000 });
  await expect(page.locator("[data-top-row]"), "ไม่มีแถว 0%").toHaveCount(0);
  await expect(page.locator("[data-card='trend'] [data-empty]")).toHaveText("ยังไม่มียอดขาย");
  await expect(page.locator("[data-card='target'] [data-empty]")).toHaveText("ยังไม่มียอดขาย");
  await expect(page.locator("[data-card='bars'] [data-empty]")).toHaveText("ยังไม่มีข้อมูลในช่วงนี้");
  await expect(page.locator("[data-card='trend'] svg"), "ไม่วาดกราฟเปล่า").toHaveCount(0);
  await expect(page.locator("[data-kpi='winrate'] [data-value]"), "ยังไม่มีลีดที่ปิด = —").toHaveAttribute("data-value", "");
  await expect(page.locator("[data-kpi='sales']"), "ยังไม่ตั้งเป้า").toContainText("ยังไม่ได้ตั้งเป้า");
});

test("[แดชบอร์ด HQ] วันนี้ต้องทำ: ตรงกับตาราง · ไม่ขึ้นกับตัวกรอง · กดแล้วไปหน้างานพร้อมตัวกรอง", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  const จากตาราง = async () => {
    const rq = (await admin.from("quote_requests").select("status, due_at").in("status", ["new", "pricing"])).data ?? [];
    const ps = (await admin.from("dealer_package_proposals").select("id, amount, payment_due_on, status").eq("status", "accepted")).data ?? [];
    const pays = (await admin.from("dealer_proposal_payments").select("proposal_id, amount, cancelled_at")).data ?? [];
    const ค้าง = ps.filter(p => p.payment_due_on && p.payment_due_on < วันนี้
      && Number(p.amount ?? 0) - pays.filter(x => x.proposal_id === p.id && !x.cancelled_at).reduce((s, x) => s + Number(x.amount), 0) > 0);
    return { open: rq.length, overdue: rq.filter(r => new Date(r.due_at).getTime() < Date.now()).length, franchise: ค้าง.length };
  };
  const อ่าน = async () => {
    await expect(page.locator("[aria-label='วันนี้ต้องทำ'] [data-testid^='today-']").first()).toBeVisible({ timeout: 30_000 });
    if (await page.getByTestId("today-clear").count()) return { open: 0, overdue: 0, franchise: 0 };
    const v = async (id: string) => Number(await page.locator(`[data-testid='${id}'] [data-value], [data-testid='${id}'][data-value]`).first().getAttribute("data-value") ?? 0);
    return { open: await v("today-requests"), overdue: (await page.getByTestId("today-overdue").count()) ? await v("today-overdue") : 0, franchise: await v("today-franchise") };
  };
  // ข้อทดสอบอื่นสร้าง/ปิดคำขอระหว่างทาง — อ่านจอกับตารางซ้ำจนตรงกัน
  await expect.poll(async () => { await เปิด(page); return JSON.stringify(await อ่าน()) === JSON.stringify(await จากตาราง()); },
    { timeout: 90_000, intervals: [1000, 3000, 5000], message: "วันนี้ต้องทำ = นับจากตาราง" }).toBe(true);
  const ทั้งเครือ = await อ่าน();
  await เลือกดีลเลอร์(page, สาขาว่าง);
  await page.waitForTimeout(1500);
  const เลือกสาขา = await อ่าน();

  expect(ทั้งเครือ.open, "มีคำขอที่วางไว้อย่างน้อย 1").toBeGreaterThanOrEqual(1);
  expect(ทั้งเครือ.overdue, "มีคำขอเลยกำหนดอย่างน้อย 1").toBeGreaterThanOrEqual(1);
  expect(ทั้งเครือ.franchise, "มีใบค้างชำระอย่างน้อย 1").toBeGreaterThanOrEqual(1);
  expect(เลือกสาขา, "เลือกดีลเลอร์แล้วทั้งแถวไม่เปลี่ยน").toEqual(ทั้งเครือ);
  await page.getByTestId("today-franchise").click();
  await page.waitForURL(/\/hq\/proposals/, { timeout: 60_000 });
  await expect(page.getByTestId("filter-overdue"), "หน้าใบค่าแฟรนไชส์กรองเฉพาะใบค้างชำระ").toContainText(`เฉพาะใบค้างชำระ (${ทั้งเครือ.franchise})`, { timeout: 20_000 });
  await เปิด(page);
  await page.getByTestId("today-requests").click();
  await page.waitForURL(/\/hq\/quote-requests/, { timeout: 60_000 });
});

test("[แดชบอร์ด HQ] กิจกรรมล่าสุด: บัญชีทดสอบไม่โผล่ · กดแล้วไปที่เรื่องนั้น · ภาคไม่นับแถว HQ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  await เปิด(page);
  const การ์ดกิจกรรม = page.locator("[data-card='activity']");
  await expect(การ์ดกิจกรรม, "รายการจริงต้องเห็น").toContainText(กิจกรรมจริง, { timeout: 30_000 });
  for (const ซ่อน of [`ชั่วคราว-แดชบอร์ด-${ป้าย}`, `อีเมลทดสอบ-แดชบอร์ด-${ป้าย}`, `สาขาทดสอบ-แดชบอร์ด-${ป้าย}`, `ZZTEST-ป้าย-แดชบอร์ด-${ป้าย}`])
    await expect(การ์ดกิจกรรม, `ไม่เห็น ${ซ่อน}`).not.toContainText(ซ่อน);
  await expect(การ์ดกิจกรรม, "ไม่มีชื่อบัญชีชั่วคราว").not.toContainText("บัญชีทดสอบชั่วคราว");

  // ภาค: จำนวนดีลเลอร์ = ทะเบียนไม่นับแถว HQ
  const { count } = await admin.from("dealers").select("code", { count: "exact", head: true }).neq("code", "HQ");
  await expect(page.locator("[data-card='regions']"), "โดนัท = ทะเบียนดีลเลอร์ไม่นับแถว HQ").toContainText(String(count));

  await การ์ดกิจกรรม.locator("[data-activity-link]").filter({ hasText: กิจกรรมจริง }).click();
  await page.waitForURL(/\/hq\/dealers\/RYG$/, { timeout: 20_000 });
});
