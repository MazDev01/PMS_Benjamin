import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";

// ── แถบสรุปบนหน้าผู้สนใจเป็นดีลเลอร์ (ย้ายมาจากกล่อง "หาดีลเลอร์ใหม่" ของแดชบอร์ด · บอสสั่ง 21 ต.ค. 69) ─────────────────────
//   ผู้สนใจกำลังคุย · จังหวัดที่มีลูกค้าเป้าหมายแต่ยังไม่มีดีลเลอร์ — ตัวเลขคิดที่ฐาน (hq_overview · ค่าตายตัวตรวจแล้วใน supabase/tests/hq_overview.sql)
//   1) ตัวเลขบนจอ = ที่ฐานคำนวณ · 2) เพิ่มผู้สนใจที่รู้ค่า → ตัวเลขขยับตามพอดี
//   (กล่อง 3 กล่องเดิมเอาออกจากแดชบอร์ดแล้ว — ซ้ำกับการ์ด/แถววันนี้ต้องทำ · แดชบอร์ดตรวจที่ hq-dashboard.spec.ts)
// อยู่โปรเจกต์ hq-settings (workers: 1 · รันเดี่ยวเป็นช่วงของตัวเอง) — ไม่มีข้อทดสอบอื่นเปลี่ยนตัวเลขระหว่างวัด
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const admin = adminClient();
const TAG = `ZZOV${Date.now() % 100000}`;

async function purge() {
  await admin.from("dealer_prospects").delete().like("name", `${TAG}%`);
}
test.beforeAll(purge);
test.afterAll(purge);

type Recruit = { stages: Record<string, number>; provincesNoDealer: { province: string; leads: number }[] };
const กำลังคุยของ = (r: Recruit) => ["new", "contacted", "profile_sent", "meeting", "considering"].reduce((s, k) => s + (r.stages[k] ?? 0), 0);

async function อ่านจอ(page: Page) {
  await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByTestId("prospect-talking")).toBeVisible({ timeout: 25_000 });
  return {
    กำลังคุย: Number(await page.getByTestId("prospect-talking").getAttribute("data-value")),
    จังหวัด: (await page.getByTestId("provinces-no-dealer").textContent())?.trim() ?? "",
  };
}

test("[flow·hq] หน้าผู้สนใจ: ผู้สนใจกำลังคุย + จังหวัดที่ยังไม่มีดีลเลอร์ ตรงกับที่ฐานคำนวณ และขยับตามข้อมูลที่รู้ค่า", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  const ฐาน = async () => {
    const { data, error } = await (await db(ADMIN)).rpc("hq_overview");
    expect(error).toBeNull();
    return (data as { recruit: Recruit }).recruit;
  };
  const r = await ฐาน();
  const ก่อน = await อ่านจอ(page);
  expect(ก่อน.กำลังคุย, "ผู้สนใจกำลังคุย = ทุกขั้นที่ยังไม่จบ").toBe(กำลังคุยของ(r));
  expect(ก่อน.จังหวัด, "จังหวัดที่ยังไม่มีดีลเลอร์").toBe(r.provincesNoDealer.length ? r.provincesNoDealer.map(x => `${x.province} (${x.leads})`).join(" · ") : "ไม่มี");

  // ผู้สนใจใหม่ 2 ราย (ยังคุยอยู่) + 1 รายที่จบแล้ว (ไม่นับ) → +2
  const { error } = await admin.from("dealer_prospects").insert([
    { name: `${TAG}-ใหม่`, status: "new" }, { name: `${TAG}-นัด`, status: "meeting" }, { name: `${TAG}-ไม่สำเร็จ`, status: "lost", lost_reason: "ทดสอบ" },
  ]);
  expect(error).toBeNull();
  const หลัง = await อ่านจอ(page);
  expect(หลัง.กำลังคุย - ก่อน.กำลังคุย, "กำลังคุย +2 (รายที่จบแล้วไม่นับ)").toBe(2);
  // แดชบอร์ดไม่มีกล่อง 3 กล่องแล้ว
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("region", { name: "วันนี้ต้องทำ" })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("region", { name: /^ภาพรวม:/ }), "ไม่มีกล่องภาพรวม 3 กล่อง").toHaveCount(0);
  assertNoErrors(errs, "แถบสรุปหน้าผู้สนใจ");
});

// ── บอสตัดสิน 22 ต.ค. 69: ตัวเลขจาก 3 กล่องเดิมที่ย้ายไปหน้าเจ้าของเรื่อง ─────────────────────────────────────────
//   เวลาตอบเฉลี่ย + อัตรายกเลิกคำขอ → หัวหน้าคำขอใบเสนอราคา · ส่วนบวกรายดีลเลอร์ → ภาพรวมยอดขาย (HQ เท่านั้น)
test("[flow·hq] เวลาตอบเฉลี่ย/อัตรายกเลิก อยู่หัวหน้าคำขอใบเสนอราคา · ส่วนบวกรายดีลเลอร์อยู่ภาพรวมยอดขาย · ดีลเลอร์อ่านไม่ได้", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/quote-requests", ADMIN);
  const { data, error } = await (await db(ADMIN)).rpc("hq_overview");
  expect(error).toBeNull();
  const o = data as { requests: { avgResponseDays: number | null; cancel: { pct: number | null; cancelled: number; total: number } };
    sales: { marginByDealer: { dealerCode: string; sale: number; cost: number; pctOfSale: number | null }[] } };

  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByTestId("request-stats")).toBeVisible({ timeout: 25_000 });
  expect(await page.getByTestId("request-avg-days").getAttribute("data-value"), "เวลาตอบเฉลี่ย = ฐาน").toBe(o.requests.avgResponseDays == null ? "" : String(o.requests.avgResponseDays));
  expect(await page.getByTestId("request-cancel-pct").getAttribute("data-value"), "อัตรายกเลิก = ฐาน").toBe(o.requests.cancel.pct == null ? "" : String(o.requests.cancel.pct));
  await expect(page.getByTestId("request-stats")).toContainText(`(${o.requests.cancel.cancelled.toLocaleString()} จาก ${o.requests.cancel.total.toLocaleString()})`);

  await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const การ์ด = page.getByTestId("dealer-margin");
  await expect(การ์ด).toBeVisible({ timeout: 25_000 });
  await expect(การ์ด.locator("[data-margin-row]"), "แถวส่วนบวก = รายดีลเลอร์จากฐาน").toHaveCount(o.sales.marginByDealer.length, { timeout: 25_000 });
  for (const r of o.sales.marginByDealer) {
    const แถว = การ์ด.locator(`[data-margin-row='${r.dealerCode}']`);
    await expect(แถว.locator("[data-sale]")).toHaveAttribute("data-sale", String(Number(r.sale)));
    await expect(แถว.locator("[data-pct-sale]")).toHaveAttribute("data-pct-sale", r.pctOfSale == null ? "" : String(r.pctOfSale));
  }
  if (!o.sales.marginByDealer.length) await expect(การ์ด.locator("[data-empty]")).toBeVisible();

  // ดีลเลอร์เรียกตัวคำนวณภาพรวม (ส่วนบวก/ต้นทุน HQ) ไม่ได้ — กันที่ฐาน
  const ดีลเลอร์ = await (await db(RYG)).rpc("hq_overview");
  expect(ดีลเลอร์.error?.message ?? "", "ดีลเลอร์อ่านส่วนบวกไม่ได้").toMatch(/forbidden/);
  assertNoErrors(errs, "ตัวเลขย้ายหน้า");
});
