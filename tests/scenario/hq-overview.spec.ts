import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── แถบสรุปบนหน้าผู้สนใจเป็นดีลเลอร์ (ย้ายมาจากกล่อง "หาดีลเลอร์ใหม่" ของแดชบอร์ด · บอสสั่ง 21 ต.ค. 69) ─────────────────────
//   ผู้สนใจกำลังคุย · จังหวัดที่มีลูกค้าเป้าหมายแต่ยังไม่มีดีลเลอร์ — ตัวเลขคิดที่ฐาน (hq_overview · ค่าตายตัวตรวจแล้วใน supabase/tests/hq_overview.sql)
//   1) ตัวเลขบนจอ = ที่ฐานคำนวณ · 2) เพิ่มผู้สนใจที่รู้ค่า → ตัวเลขขยับตามพอดี
//   (กล่อง 3 กล่องเดิมเอาออกจากแดชบอร์ดแล้ว — ซ้ำกับการ์ด/แถววันนี้ต้องทำ · แดชบอร์ดตรวจที่ hq-dashboard.spec.ts)
// อยู่โปรเจกต์ hq-settings (workers: 1) · ตัวเลขทั้งเครือเทียบแบบอ่านคู่นิ่ง + ข้อมูลของข้อเอง (ป้าย TAG · สาขาของข้อ)
//   ไม่พึ่งว่าไม่มีข้ออื่นเขียนพร้อมกัน (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 3)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const admin = adminClient();
const TAG = `ZZOV${Date.now() % 100000}`;
const คุย = ["new", "contacted", "profile_sent", "meeting", "considering"];

async function purge() {
  await admin.from("dealer_prospects").delete().like("name", `${TAG}%`);
}
test.beforeAll(purge);
test.afterAll(purge);

type Recruit = { stages: Record<string, number>; provincesNoDealer: { province: string; leads: number }[] };
const กำลังคุยของ = (r: Recruit) => คุย.reduce((s, k) => s + (r.stages[k] ?? 0), 0);

async function อ่านจอ(page: Page) {
  await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByTestId("prospect-talking")).toBeVisible({ timeout: 25_000 });
  return {
    กำลังคุย: Number(await page.getByTestId("prospect-talking").getAttribute("data-value")),
    จังหวัด: (await page.getByTestId("provinces-no-dealer").textContent())?.trim() ?? "",
  };
}

// ── อ่านฐาน → อ่านจอ → อ่านฐาน · ใช้ได้เมื่อฐานสองครั้งเท่ากัน (ระหว่างที่จอโหลด ไม่มีข้ออื่นเขียนตัวเลขชุดนี้) ─────────────
//   ตัวเลขชุดนี้เป็นของทั้งเครือ (หน้าไม่มีตัวกรองสาขา) · ข้อที่รันพร้อมกันเขียนได้ → จับคู่ฐานกับจอช่วงเดียวกันแทนการอ่านคนละเวลา
//   ไม่ใช่เพิ่มเวลารอ: อ่านซ้ำทันที · ไม่นิ่งเลย 5 รอบ = ตก (บอกชัดว่าฐานขยับตลอด)
async function อ่านคู่นิ่ง<R, S>(ฐาน: () => Promise<R>, จอ: () => Promise<S>): Promise<{ r: R; s: S }> {
  for (let i = 0; i < 5; i++) {
    const r1 = await ฐาน(); const s = await จอ(); const r2 = await ฐาน();
    if (JSON.stringify(r1) === JSON.stringify(r2)) return { r: r1, s };
  }
  throw new Error("ตัวเลขที่ฐานขยับทุกครั้งที่อ่านจอ (5 รอบ) — เทียบจอกับฐานไม่ได้");
}

test("[flow·hq] หน้าผู้สนใจ: ผู้สนใจกำลังคุย + จังหวัดที่ยังไม่มีดีลเลอร์ ตรงกับที่ฐานคำนวณ และขยับตามข้อมูลที่รู้ค่า", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  const hq = await db(ADMIN);
  // ฐาน = ตัวคำนวณภาพรวม + นับตรงจากตาราง แยกผู้สนใจของข้อนี้ (ป้าย TAG) กับของคนอื่น
  const ฐาน = async () => {
    const { data, error } = await hq.rpc("hq_overview");
    expect(error).toBeNull();
    const ของข้อ = await admin.from("dealer_prospects").select("id", { count: "exact", head: true }).like("name", `${TAG}%`).in("status", คุย);
    const คนอื่น = await admin.from("dealer_prospects").select("id", { count: "exact", head: true }).not("name", "like", `${TAG}%`).in("status", คุย);
    expect(ของข้อ.error ?? คนอื่น.error).toBeNull();
    return { recruit: (data as { recruit: Recruit }).recruit, ของข้อ: ของข้อ.count ?? 0, คนอื่น: คนอื่น.count ?? 0 };
  };
  const ก่อน = await อ่านคู่นิ่ง(ฐาน, () => อ่านจอ(page));
  expect(ก่อน.s.กำลังคุย, "ผู้สนใจกำลังคุย = ทุกขั้นที่ยังไม่จบ").toBe(กำลังคุยของ(ก่อน.r.recruit));
  expect(กำลังคุยของ(ก่อน.r.recruit), "ตัวคำนวณ = นับตรงจากตาราง").toBe(ก่อน.r.ของข้อ + ก่อน.r.คนอื่น);
  expect(ก่อน.r.ของข้อ, "ก่อนเพิ่ม: ยังไม่มีผู้สนใจของข้อนี้").toBe(0);
  expect(ก่อน.s.จังหวัด, "จังหวัดที่ยังไม่มีดีลเลอร์").toBe(ก่อน.r.recruit.provincesNoDealer.length ? ก่อน.r.recruit.provincesNoDealer.map(x => `${x.province} (${x.leads})`).join(" · ") : "ไม่มี");

  // ผู้สนใจใหม่ 2 ราย (ยังคุยอยู่) + 1 รายที่จบแล้ว (ไม่นับ) → ของข้อนี้ +2 พอดี
  const { error } = await admin.from("dealer_prospects").insert([
    { name: `${TAG}-ใหม่`, status: "new" }, { name: `${TAG}-นัด`, status: "meeting" }, { name: `${TAG}-ไม่สำเร็จ`, status: "lost", lost_reason: "ทดสอบ" },
  ]);
  expect(error).toBeNull();
  const หลัง = await อ่านคู่นิ่ง(ฐาน, () => อ่านจอ(page));
  expect(หลัง.s.กำลังคุย, "หลังเพิ่ม: จอ = ฐาน").toBe(กำลังคุยของ(หลัง.r.recruit));
  expect(หลัง.r.ของข้อ, "ของข้อนี้ที่ยังคุย = 2 (รายที่จบแล้วไม่นับ)").toBe(2);
  // จอขยับ = +2 ของข้อนี้ + ส่วนที่ข้ออื่นเปลี่ยนระหว่างนั้น (นับตรงจากตาราง) → หักส่วนของคนอื่นแล้วต้อง +2 พอดี
  expect(หลัง.s.กำลังคุย - ก่อน.s.กำลังคุย - (หลัง.r.คนอื่น - ก่อน.r.คนอื่น), "กำลังคุย +2 (รายที่จบแล้วไม่นับ)").toBe(2);
  // แดชบอร์ดไม่มีกล่อง 3 กล่องแล้ว
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "วันนี้ต้องทำ" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("region", { name: /^ภาพรวม:/ }), "ไม่มีกล่องภาพรวม 3 กล่อง").toHaveCount(0);
  assertNoErrors(errs, "แถบสรุปหน้าผู้สนใจ");
});

// ── บอสตัดสิน 22 ต.ค. 69: ตัวเลขจาก 3 กล่องเดิมที่ย้ายไปหน้าเจ้าของเรื่อง ─────────────────────────────────────────
//   เวลาตอบเฉลี่ย + อัตรายกเลิกคำขอ → หัวหน้าคำขอใบเสนอราคา · ส่วนบวกรายดีลเลอร์ → ภาพรวมยอดขาย (HQ เท่านั้น)
//   ข้อมูลที่รู้ค่า = สาขาของข้อ: ใบ HQ สั่งผลิตต้นทุน 300,000 + ใบลูกค้าตอบรับ 400,000 → แถวส่วนบวกของสาขานี้ ขาย 400,000 · 25%
type Overview = { requests: { avgResponseDays: number | null; cancel: { pct: number | null; cancelled: number; total: number } };
  sales: { marginByDealer: { dealerCode: string; sale: number; cost: number; pctOfSale: number | null }[] } };
let สาขา: สาขาของข้อ | null = null;
const เลข = 970_000_000 + (Date.now() % 100_000) * 10;   // รหัสแถวของข้อ (คำขอ/ใบ HQ) ไม่ชนข้อมูลตั้งต้น
test.afterAll(async () => {
  if (!สาขา) return;
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.quotation_won_at where dealer_code = '${สาขา.รหัส}';
    delete from public.quotations where dealer_code = '${สาขา.รหัส}';
    delete from public.customers where dealer_code = '${สาขา.รหัส}';
    delete from public.hq_quotes where request_id = ${เลข};
    delete from public.quote_requests where id = ${เลข};
    set local session_replication_role = origin;`);
  await สาขา.ลบ();
});

test("[flow·hq] เวลาตอบเฉลี่ย/อัตรายกเลิก อยู่หัวหน้าคำขอใบเสนอราคา · ส่วนบวกรายดีลเลอร์อยู่ภาพรวมยอดขาย · ดีลเลอร์อ่านไม่ได้", async ({ page }) => {
  const errs = watchErrors(page);
  สาขา = await สร้างสาขาของข้อ();
  const code = สาขา.รหัส;
  // วางที่ฐานตรง (ปิดตัวดัก) — ใบ HQ สั่งผลิต + ใบลูกค้าตอบรับ สร้างผ่านหน้าจอต้องเดินทั้งเส้นทาง · ข้อนี้วัดตัวเลขที่ย้ายหน้า
  const ใส่ = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.quote_requests (id, request_no, dealer_code, lead_num_id, product, status, submitted_at, due_at, quoted_at) values
      (${เลข}, 'QR-${code}-1', '${code}', ${เลข}, 'ZZTEST', 'won', now() - interval '10 days', now() + interval '4 days', now() - interval '8 days');
    insert into public.hq_quotes (id, request_id, version, quote_no, status, line_items, total_cost, sent_at, ordered_at) values
      (${เลข}, ${เลข}, 1, 'HQ-${code}-1', 'ordered', '[]', 300000, now() - interval '8 days', now() - interval '5 days');
    insert into public.customers (id, dealer_code, name, company, province) values
      (${เลข}, '${code}', 'ZZTEST ลูกค้าส่วนบวก', 'ZZTEST ลูกค้าส่วนบวก', 'ตราด');
    insert into public.quotations (id, dealer_code, customer, status, total_value, line_items, hq_quote_id, customer_id, won_at) values
      ('${code}-Q1', '${code}', 'ZZTEST ลูกค้าส่วนบวก', 'won', 400000, '[]', ${เลข}, ${เลข}, now());
    insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ('${code}', '${code}-Q1', now());
    set local session_replication_role = origin;`);
  if (ใส่ === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางใบของสาขาของข้อไม่ได้");
  await loginUI(page, HQ_ORIGIN, "/hq/quote-requests", ADMIN);
  const hq = await db(ADMIN);
  const ฐาน = async () => {
    const { data, error } = await hq.rpc("hq_overview");
    expect(error).toBeNull();
    return data as Overview;
  };

  const คำขอ = await อ่านคู่นิ่ง(async () => (await ฐาน()).requests, async () => {
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByTestId("request-stats")).toBeVisible({ timeout: 25_000 });
    return { เฉลี่ย: await page.getByTestId("request-avg-days").getAttribute("data-value"),
             ยกเลิก: await page.getByTestId("request-cancel-pct").getAttribute("data-value"),
             ข้อความ: (await page.getByTestId("request-stats").textContent()) ?? "" };
  });
  const r = คำขอ.r;
  expect(r.cancel.total, "มีคำขอของข้อนี้อย่างน้อย 1 (ไม่ใช่กรณี \"ยังไม่มีคำขอ\")").toBeGreaterThanOrEqual(1);
  expect(คำขอ.s.เฉลี่ย, "เวลาตอบเฉลี่ย = ฐาน").toBe(r.avgResponseDays == null ? "" : String(r.avgResponseDays));
  expect(คำขอ.s.ยกเลิก, "อัตรายกเลิก = ฐาน").toBe(r.cancel.pct == null ? "" : String(r.cancel.pct));
  expect(คำขอ.s.ข้อความ, "จำนวนยกเลิก/ทั้งหมด = ฐาน").toContain(`(${r.cancel.cancelled.toLocaleString()} จาก ${r.cancel.total.toLocaleString()})`);

  // 30 ต.ค. 69 (บอสสั่งยุบหน้า /hq/pipeline ให้ตรง FLOW H12): การ์ด "ส่วนบวกรายดีลเลอร์" รวมเข้าคอลัมน์ "ส่วนต่างกำไร" ของตารางผลงานดีลเลอร์
  //   ตัวเลขทั้งตารางมาจากตัวคำนวณกลางของหน้า hq_pipeline_dealers (ใบ 0264 · ชุดเดียวกับการ์ด) ตามช่วงที่เลือก (ค่าตั้งต้น "ปีนี้")
  //   ใบตอบรับนับตามวันตอบรับ (ใบ 0260) → ใบของข้อตอบรับวันนี้ · ทุกแถวที่มีส่วนต่าง = ฐาน · แถวของข้อ = ค่าที่รู้แน่นอน
  const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const ต้นปี = `${วันนี้.slice(0, 4)}-01-01`;
  type แถวผลงาน = { code: string; sales: number; marginSale: number; marginCost: number; marginPct: number | null };
  const ตาราง = page.locator('table[aria-label="ตารางผลงานดีลเลอร์"]');
  const ผลงานฐาน = async () => {
    const { data, error } = await hq.rpc("hq_pipeline_dealers", { p_start: ต้นปี, p_end: วันนี้, p_dealers: null, p_today: วันนี้ });
    expect(error).toBeNull();
    return data as แถวผลงาน[];
  };
  // ทั้งเครือ: แถวรวมของคอลัมน์ส่วนต่าง (ตารางแบ่งหน้า 10 แถว — ผลรวมครอบทุกแถว) = ฐาน · % คิดจากผลรวมขาย/ต้นทุน
  const รวม = await อ่านคู่นิ่ง(async () => {
    const rows = await ผลงานฐาน();
    const ขาย = rows.reduce((t, x) => t + Number(x.marginSale), 0), ทุน = rows.reduce((t, x) => t + Number(x.marginCost), 0);
    return ขาย === 0 ? "" : String(Math.round(1000 * (ขาย - ทุน) / ขาย) / 10);
  }, async () => {
    await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const ช่อง = ตาราง.locator("tfoot [data-sum='margin']");
    await expect(ช่อง).toBeVisible({ timeout: 25_000 });
    return await ช่อง.getAttribute("data-value");
  });
  expect(รวม.s, "ส่วนต่างกำไรรวมทั้งเครือ = ฐาน").toBe(รวม.r);
  // แถวของสาขาของข้อ (ค้นด้วยรหัส → เหลือแถวเดียว) = ฐาน = ค่าที่รู้แน่นอน
  await page.getByLabel("ค้นหาดีลเลอร์").fill(code);
  const แถว = ตาราง.locator("tbody tr").filter({ has: page.locator(`td[data-perf-row='${code}']`) });
  await expect(แถว, "แถวของสาขาของข้อ").toHaveCount(1, { timeout: 25_000 });
  const ของข้อ = (await ผลงานฐาน()).find(x => x.code === code);
  expect(ของข้อ && { sale: Number(ของข้อ.marginSale), cost: Number(ของข้อ.marginCost), pct: Number(ของข้อ.marginPct) }, "ฐาน: ขาย 400,000 ต้นทุน 300,000 → 25%")
    .toEqual({ sale: 400000, cost: 300000, pct: 25 });
  expect({ sales: await แถว.locator("td[data-cell='sales']").getAttribute("data-value"), margin: (await แถว.locator("td[data-cell='margin']").innerText()).trim() },
    "สาขาของข้อ: ยอดขาย 400,000 · ส่วนต่าง 25% ของราคาขาย").toEqual({ sales: "400000", margin: "25.0%" });

  // ดีลเลอร์เรียกตัวคำนวณของหน้าภาพรวมยอดขาย (ส่วนต่าง/ต้นทุน HQ) ไม่ได้ — กันที่ฐาน
  const ดีลเลอร์ผลงาน = await (await db(RYG)).rpc("hq_pipeline_dealers", { p_start: ต้นปี, p_end: วันนี้, p_dealers: null, p_today: วันนี้ });
  expect(ดีลเลอร์ผลงาน.error?.message ?? "", "ดีลเลอร์อ่านผลงาน/ส่วนต่างไม่ได้").toMatch(/forbidden/);
  // ดีลเลอร์เรียกตัวคำนวณภาพรวม (ส่วนบวก/ต้นทุน HQ) ไม่ได้ — กันที่ฐาน
  const ดีลเลอร์ = await (await db(RYG)).rpc("hq_overview");
  expect(ดีลเลอร์.error?.message ?? "", "ดีลเลอร์อ่านส่วนบวกไม่ได้").toMatch(/forbidden/);
  assertNoErrors(errs, "ตัวเลขย้ายหน้า");
});
