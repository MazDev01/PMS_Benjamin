import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { adminClient } from "./testDealers";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";

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
// จังหวัดของไฟล์นี้เท่านั้น (พะเยา) — ระยอง/ลำพูนเป็นของ hq-lead-transfer.spec.ts ที่รันขนานกัน ห้ามแตะข้ามไฟล์
// ดีลเลอร์ 1 ราย = 1 จังหวัดพอดี (ใบ 0259 · บอสสั่ง 29 ต.ค. 69) → "จังหวัดเดียวหลายสาขา" = สาขาทดสอบ 2 สาขาที่ดูแลพะเยา
const สาขาพะเยา = ["ZTPYA", "ZTPYB"] as const;
const บัญชี: บัญชีสาขาของชุด[] = [];
async function ล้าง() {
  for (const code of สาขาพะเยา) expect(await ลบสาขาของชุด(code), `เก็บกวาดสาขา ${code}`).toEqual([]);
}
test.beforeAll(async () => {
  await ล้าง();
});
test.afterAll(ล้าง);

test("[db] HQ เพิ่มดีลเลอร์รายที่ 2 ในจังหวัดที่มีคนดูแลแล้วได้ · ทั้งสองรายสร้างลีดในจังหวัดนั้นได้", async () => {
  // สร้างดีลเลอร์ผ่านทางเดียวกับหน้าจอ HQ (api/admin/dealers) — ฐานให้พื้นที่ตามจังหวัดที่ตั้งเอง
  for (const code of สาขาพะเยา) บัญชี.push(await สร้างสาขาของชุด(code, "พะเยา"));
  const { data } = await admin.from("dealer_territories").select("dealer_code").eq("province", "พะเยา").in("dealer_code", [...สาขาพะเยา]).order("dealer_code");
  expect((data ?? []).map(x => x.dealer_code), "2 สาขาดูแลพะเยาจังหวัดเดียวกัน").toEqual([...สาขาพะเยา]);

  const ลีด = (n: number, code: string) => ({ id: `#ZZMD-${แท็ก}-${n}`, num_id: 975_000_000 + แท็ก * 10 + n, dealer_code: code,
    name: `${ป้าย}-${n}`, company: `${ป้าย}-${n}`, phone: `080-555-${String(n).padStart(4, "0")}`, province: "พะเยา", status: "WAITING" });
  expect((await (await db(บัญชี[0])).from("leads").insert(ลีด(1, สาขาพะเยา[0]))).error, "สาขาแรกสร้างลีดในพะเยา").toBeNull();
  expect((await (await db(บัญชี[1])).from("leads").insert(ลีด(2, สาขาพะเยา[1]))).error, "สาขาที่ 2 สร้างลีดในพะเยา (ดูแลร่วม)").toBeNull();
});

test("[ui·hq] หน้าพื้นที่ทับซ้อนไม่มีแล้ว (หน้าดีลเลอร์ไม่มีการ์ด · API ตอบว่าไม่รู้จัก)", async ({ page }) => {
  // จังหวัดที่มีหลายสาขา (เดิมนับเป็น "ทับซ้อน") ต้องไม่ทำให้การ์ดโผล่ — พะเยามี 2 สาขาจากข้อก่อนหน้า (serial)
  const { data: สอง } = await admin.from("dealer_territories").select("dealer_code").eq("province", "พะเยา").in("dealer_code", [...สาขาพะเยา]);
  expect(สอง?.length, "ตั้งต้น: พะเยามี 2 สาขา").toBe(2);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("ดีลเลอร์ทั้งหมด").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/พื้นที่ทับซ้อน/), "ต้องไม่มีการ์ดพื้นที่ทับซ้อน").toHaveCount(0);
  const tok = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const res = await page.request.get(`${HQ_ORIGIN}/api/v1/territories?view=overlaps`, { headers: { authorization: `Bearer ${tok}` } });
  expect(res.status(), "API รายการทับซ้อนเอาออกแล้ว").toBe(400);
});
