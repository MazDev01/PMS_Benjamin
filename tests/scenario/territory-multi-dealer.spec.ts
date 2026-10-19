import { test, expect } from "@playwright/test";
import { RYG, CNX, ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { adminClient } from "./testDealers";

// ── จังหวัดเดียวมีดีลเลอร์ได้ไม่จำกัดสาขา (ใบ 0214 · ยกเลิก "หนึ่งจังหวัด หนึ่งดีลเลอร์" · บอสสั่ง 16 ต.ค. 69) ─────────
//   ทางแปลงผู้สนใจเป็นดีลเลอร์ ตรวจที่ hq-prospects.spec.ts · ระดับฐานตรวจที่ supabase/tests/territories_multi.sql
//   โอนลีดของ HQ (หลายสาขา = HQ เลือก · สาขาเดียว = อัตโนมัติ) ตรวจที่ hq-lead-transfer.spec.ts — ปุ่มโอนชุดย้ายลีด HQ ทั้งเครือ รันสองไฟล์ขนานกันจะชนกัน
//   กติกาที่คงไว้: ดีลเลอร์สร้างลีดได้ในจังหวัดที่ตัวเองดูแล · จังหวัดว่าง = คนแรกที่ส่งได้งาน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const admin = adminClient();
const แท็ก = Date.now() % 100_000;
const ป้าย = `ZZTEST-หลายสาขา-${แท็ก}`;
// จังหวัดของไฟล์นี้เท่านั้น (พะเยา · น่าน) — ระยอง/ลำพูนเป็นของ hq-lead-transfer.spec.ts ที่รันขนานกัน ห้ามแตะข้ามไฟล์
async function ล้าง() {
  for (const code of ["RYG", "CNX"]) await admin.from("leads").delete().eq("dealer_code", code).like("company", "ZZTEST-หลายสาขา-%");
  await admin.from("dealer_territories").delete().in("province", ["พะเยา", "น่าน"]);
}
test.beforeAll(async () => {
  await ล้าง();
});
test.afterAll(ล้าง);

test("[db] HQ เพิ่มดีลเลอร์รายที่ 2 ในจังหวัดที่มีคนดูแลแล้วได้ · ทั้งสองรายสร้างลีดในจังหวัดนั้นได้", async () => {
  const hq = await db(ADMIN);
  expect((await hq.from("dealer_territories").insert({ province: "พะเยา", dealer_code: "RYG" })).error, "RYG ดูแลพะเยา").toBeNull();
  const r = await hq.from("dealer_territories").insert({ province: "พะเยา", dealer_code: "CNX" });
  expect(r.error, "เพิ่ม CNX เป็นดีลเลอร์รายที่ 2 ของพะเยา").toBeNull();
  const { data } = await admin.from("dealer_territories").select("dealer_code").eq("province", "พะเยา").order("dealer_code");
  expect((data ?? []).map(x => x.dealer_code)).toEqual(["CNX", "RYG"]);

  const ลีด = (n: number, code: string) => ({ id: `#ZZMD-${แท็ก}-${n}`, num_id: 975_000_000 + แท็ก * 10 + n, dealer_code: code,
    name: `${ป้าย}-${n}`, company: `${ป้าย}-${n}`, phone: `080-555-${String(n).padStart(4, "0")}`, province: "พะเยา", status: "WAITING" });
  expect((await (await db(RYG)).from("leads").insert(ลีด(1, "RYG"))).error, "RYG สร้างลีดในพะเยา").toBeNull();
  expect((await (await db(CNX)).from("leads").insert(ลีด(2, "CNX"))).error, "CNX สร้างลีดในพะเยา (ดูแลร่วม)").toBeNull();
});

test("[ui·hq] หน้าพื้นที่ทับซ้อนไม่มีแล้ว (หน้าดีลเลอร์ไม่มีการ์ด · API ตอบว่าไม่รู้จัก)", async ({ page }) => {
  // จังหวัดที่มีหลายสาขา (เดิมนับเป็น "ทับซ้อน") ต้องไม่ทำให้การ์ดโผล่
  expect((await admin.from("dealer_territories").insert([{ province: "น่าน", dealer_code: "RYG", legacy: true }, { province: "น่าน", dealer_code: "CNX", legacy: true }])).error).toBeNull();
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("ดีลเลอร์ทั้งหมด").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/พื้นที่ทับซ้อน/), "ต้องไม่มีการ์ดพื้นที่ทับซ้อน").toHaveCount(0);
  const tok = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const res = await page.request.get(`${HQ_ORIGIN}/api/v1/territories?view=overlaps`, { headers: { authorization: `Bearer ${tok}` } });
  expect(res.status(), "API รายการทับซ้อนเอาออกแล้ว").toBe(400);
});
