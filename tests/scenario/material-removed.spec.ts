import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, ข้อมูลงานครบชุด } from "./hqQuoteFixture";
import { adminClient } from "./testDealers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── เอารายการวัสดุออกทั้งระบบ (บอสสั่ง 20 พ.ย. 69 · ทับคำตัดสิน 26 ต.ค. 69 · ซ่อนหน้าจอ ไม่ลบข้อมูล) ──────────────────
//   HQ › ตั้งค่า: ไม่มีแท็บรายการวัสดุ · ใบ HQ: ไม่มีปุ่ม "เลือกจากรายการวัสดุ" / "รายการจากคำขอดีลเลอร์" · ไม่มีบรรทัดราคาประเมิน/% คลาด
//   คำขอเก่าที่ดีลเลอร์เคยเลือกวัสดุ (estimate ในฐานยังอยู่): ใบ HQ เปิดมาแถวว่าง 1 แถว ไม่ใส่วัสดุให้เอง (H8 ยกเลิก · คนรวมงานตอบ ก)
//   ฟอร์มขอราคาฝั่งดีลเลอร์ไม่มีกล่องวัสดุ — ตรวจใน form-table-fit.spec
//   ตกบนโค้ดเดิม (3b693a13): มีแท็บ/ปุ่ม/บรรทัดเหล่านี้ · ใบ HQ ของคำขอที่มีวัสดุเปิดมาพร้อมแถววัสดุ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
const แท็ก = Date.now() % 100_000;
const บริษัท = `ZZTEST-วัสดุเอาออก-${แท็ก}`;
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
const svc = adminClient();
let สาขา: สาขาของข้อ, ไอดีวัสดุ: number | null = null;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  // วัสดุเก่าในฐาน (ตารางยังอยู่ · ไม่ลบ) + คำขอที่ดีลเลอร์เลือกวัสดุไว้ก่อนเอาออก
  const t = await svc.from("material_templates").insert({ category: "ZZTEST", name: `ZZTEST โครงเหล็ก ${แท็ก}`, unit: "ตัน", unit_price: 32000 }).select("id").single();
  expect(t.error, "วัสดุเก่าในฐาน").toBeNull();
  ไอดีวัสดุ = Number(t.data!.id);
  const sd = await db(สาขา.บัญชี);
  expect((await sd.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: สาขา.รหัส, company: บริษัท, name: บริษัท, contact: "ผู้ทดสอบ",
    phone: `000-000-${String(เลข).slice(-4)}`, province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด })).error, "ลูกค้าเป้าหมายของข้อ").toBeNull();
  const r = await sd.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดังโครงเหล็ก", p_estimate: [{ templateId: ไอดีวัสดุ, qty: 38 }] });
  expect(r.error, "คำขอเก่าที่มีวัสดุ (estimate)").toBeNull();
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, [เลข]);
  if (ไอดีวัสดุ) await svc.from("material_templates").delete().eq("id", ไอดีวัสดุ);
  await สาขา?.ลบ();
});

test("[H·hq] ไม่มีแท็บรายการวัสดุ · ใบ HQ ไม่มีปุ่มวัสดุ/ราคาประเมิน · คำขอเก่าที่มีวัสดุเปิดมาแถวว่าง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByRole("button", { name: "ข้อมูลบริษัท", exact: true }), "หน้าตั้งค่าโหลดแล้ว").toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "รายการวัสดุ", exact: true }), "ไม่มีแท็บรายการวัสดุ").toHaveCount(0);

  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, บริษัท);
  await expect(ใบ.getByRole("table", { name: "รายการ BOQ", exact: true }), "ตาราง BOQ ขึ้น").toBeVisible({ timeout: 20_000 });
  await expect(ใบ.getByRole("button", { name: "เลือกจากรายการวัสดุ", exact: true }), "ไม่มีปุ่มเลือกจากรายการวัสดุ").toHaveCount(0);
  await expect(ใบ.getByRole("button", { name: "รายการจากคำขอดีลเลอร์", exact: true }), "ไม่มีปุ่มรายการจากคำขอดีลเลอร์").toHaveCount(0);
  await expect(ใบ, "ไม่มีบรรทัดราคาประเมินของดีลเลอร์ / % คลาด").not.toContainText("ราคาประเมินของดีลเลอร์");
  await expect(ใบ.getByLabel("ชื่อรายการ 1", { exact: true }), "ใบเปิดมาแถวว่าง (ไม่ใส่วัสดุจากคำขอให้เอง)").toHaveValue("");
  await expect(ใบ.getByLabel("ชื่อรายการ 2", { exact: true }), "มีแถวเดียว").toHaveCount(0);
  assertNoErrors(errs, "รายการวัสดุเอาออก");
});
