import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";

// ── ด่าน 5 · ภาพรวม HQ 3 กล่องบนหน้าจอ (FLOW ช่วงที่ 3) ─────────────────────────────────────────────────────────
//   1) ตัวเลขบนจอ = ตัวเลขที่ฐานคำนวณ (hq_overview · ค่าตายตัวตรวจแล้วใน supabase/tests/hq_overview.sql)
//   2) ใส่ข้อมูลที่รู้ค่าเพิ่ม → ตัวเลขบนจอขยับตามค่าที่คาดไว้พอดี
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

async function อ่านจอ(page: Page) {
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByTestId("ov-stage-meeting")).toBeVisible({ timeout: 25_000 });
  // ค่าเต็มจาก data-value — ข้อความบนจอย่อยอดหลักล้าน (฿289.3M) อ่านเป็นตัวเลขตรง ๆ ไม่ได้
  const v = async (id: string) => Number(await page.getByTestId(id).getAttribute("data-value"));
  return {
    meeting: await v("ov-stage-meeting"), considering: await v("ov-stage-considering"),
    รอตอบ: await v("ov-proposals-waiting"), รอตอบใบ: await v("ov-proposals-waiting-count"),
    เกิน: await v("ov-overdue"), ยอดHQ: await v("ov-hq-ordered"), ยอดดีลเลอร์: await v("ov-dealer-won"),
  };
}

test("[flow·hq] ภาพรวม 3 กล่อง: ตัวเลขบนจอตรงกับที่ฐานคำนวณ และขยับตามข้อมูลที่รู้ค่า", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
  for (const กล่อง of ["หาดีลเลอร์ใหม่", "คำขอใบเสนอราคา", "ยอดขายเครือข่าย"]) {
    await expect(page.getByRole("region", { name: `ภาพรวม: ${กล่อง}` }), `ต้องมีกล่อง ${กล่อง}`).toBeVisible({ timeout: 25_000 });
  }

  // 1) จอ = ฐาน
  const { data: ฐาน, error } = await (await db(ADMIN)).rpc("hq_overview");
  expect(error).toBeNull();
  const ก่อน = await อ่านจอ(page);
  const o = ฐาน as { recruit: { stages: Record<string, number>; proposalsWaiting: { count: number; amount: number } }; requests: { overdue: number }; sales: { hqOrdered: number; dealerWon: number } };
  expect(ก่อน.meeting, "นัดคุยแล้ว").toBe(o.recruit.stages.meeting);
  expect(ก่อน.considering, "รอตัดสินใจ").toBe(o.recruit.stages.considering);
  expect(ก่อน.รอตอบ, "ใบค่าแฟรนไชส์ที่รอตอบ (บาท)").toBe(Number(o.recruit.proposalsWaiting.amount));
  expect(ก่อน.รอตอบใบ, "ใบค่าแฟรนไชส์ที่รอตอบ (ใบ)").toBe(o.recruit.proposalsWaiting.count);
  expect(ก่อน.เกิน, "คำขอเกิน 14 วัน").toBe(o.requests.overdue);
  expect(ก่อน.ยอดHQ, "ยอดขาย HQ").toBe(Number(o.sales.hqOrdered));
  expect(ก่อน.ยอดดีลเลอร์, "ยอดขายดีลเลอร์").toBe(Number(o.sales.dealerWon));

  // 2) ข้อมูลที่รู้ค่า: ผู้สนใจนัดคุย +2 · รอตัดสินใจ +1 พร้อมใบส่งแล้ว 123,000 (ใบรอตอบ +1 · +123,000)
  //    (ใบที่ส่งแล้วเลื่อนผู้สนใจจากนัดคุย → รอตัดสินใจเอง — จึงออกใบให้รายที่ 3 ซึ่งเริ่มที่นัดคุย: นัดคุยสุทธิ +2)
  const { data: ราย, error: e1 } = await admin.from("dealer_prospects").insert([
    { name: `${TAG}-นัด1`, status: "meeting" }, { name: `${TAG}-นัด2`, status: "meeting" }, { name: `${TAG}-ส่งใบ`, status: "meeting" },
  ]).select("id, name");
  expect(e1).toBeNull();
  const ส่งใบ = (ราย ?? []).find(r => String(r.name).endsWith("-ส่งใบ"))!;
  const { error: e2 } = await admin.from("dealer_package_proposals").insert({ prospect_id: ส่งใบ.id, package: "standard", amount: 123000, status: "sent" });
  expect(e2).toBeNull();

  const หลัง = await อ่านจอ(page);
  expect(หลัง.meeting - ก่อน.meeting, "นัดคุยแล้ว +2").toBe(2);
  expect(หลัง.considering - ก่อน.considering, "รอตัดสินใจ +1").toBe(1);
  expect(หลัง.รอตอบใบ - ก่อน.รอตอบใบ, "ใบรอตอบ +1").toBe(1);
  expect(หลัง.รอตอบ - ก่อน.รอตอบ, "ใบรอตอบ +123,000 บาท").toBe(123000);
  assertNoErrors(errs, "ภาพรวม HQ 3 กล่อง");
});
