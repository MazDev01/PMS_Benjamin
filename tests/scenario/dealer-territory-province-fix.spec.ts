import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";

// ── ดีลเลอร์ที่ยังไม่มีพื้นที่: HQ แก้จังหวัดที่ตั้งให้ตรงรายชื่อ → ต้องได้พื้นที่จริง (ใบ 0255 · ผลตรวจเทียบ FLOW รอบ 5 แถว 7 + 9) ──
//   เจอ (28 ต.ค. 69): หน้าดีลเลอร์บอก "แก้จังหวัดในข้อมูลดีลเลอร์ให้ตรงรายชื่อ: BKK (กรุงเทพฯ)" · หน้าผู้สนใจนับ "กรุงเทพฯ" เป็นจังหวัดที่ยังไม่มีดีลเลอร์
//   ต้นเหตุตรรกะ: การแก้จังหวัดที่ตั้งไม่เคยให้พื้นที่ (พื้นที่เขียนแค่ตอนสร้างดีลเลอร์) — ทำตามคำแนะนำแล้วการ์ดหาย แต่ดีลเลอร์ยังไม่มีพื้นที่
//   FLOW H5 "สร้างดีลเลอร์ + บัญชี + จังหวัด" · H11 ดูแลดีลเลอร์ ปุ่ม "แก้ไข"
// 29 ต.ค. 69 (บอสสั่ง · ใบ 0259): ดีลเลอร์ดูแล 1 จังหวัดพอดี = จังหวัดที่ตั้ง · ฐานไม่รับชื่อนอก 77 จังหวัด (ตั้งสาขาสะกดผิดไม่ได้แล้ว)
//   → แก้จังหวัดที่ตั้ง = พื้นที่ย้ายตาม (1 แถวเสมอ) · กติการะดับฐานครบชุดอยู่ที่ supabase/tests/province_standard_everywhere.sql
//   ใช้สาขาชั่วคราวจังหวัด "สตูล" → แก้เป็น "ตรัง" · ไม่แตะ BKK (hq-territory-unmatched.spec.ts ใช้อยู่) · สตูล/ตรังไม่มีลีดในข้อมูลตั้งต้น
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const CODE = "ZZTPF";
const admin = adminClient();
async function ล้าง() {
  await admin.from("dealers").delete().eq("code", CODE);   // พื้นที่ลบตาม (on delete cascade)
}
test.beforeAll(async () => {
  await ล้าง();
  const d = await admin.from("dealers").insert({ code: CODE, name: `ZZTEST-พื้นที่-${CODE}`, status: "active", province: "สตูล", region: "ใต้", revenue_target: 0 });
  if (d.error) throw new Error(d.error.message);
});
test.afterAll(ล้าง);

const พื้นที่ = async () => ((await admin.from("dealer_territories").select("province").eq("dealer_code", CODE)).data ?? []).map(x => x.province);

test("[H11] HQ กด \"แก้ไข\" เปลี่ยนจังหวัดที่ตั้ง → พื้นที่ดูแลย้ายตาม 1 จังหวัดพอดี · ไม่ขึ้นการ์ด \"ยังไม่มีพื้นที่\"", async ({ page }) => {
  const errs = watchErrors(page);
  // สร้างดีลเลอร์ = ฐานให้พื้นที่จังหวัดที่ตั้งเอง
  await expect.poll(พื้นที่, { message: "สร้างดีลเลอร์แล้วได้พื้นที่จังหวัดที่ตั้ง", timeout: 10_000 }).toEqual(["สตูล"]);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);

  // แก้ที่ปุ่ม "แก้ไข" ของหน้ารายละเอียด (ชื่อปุ่มตาม FLOW H11) · ช่องจังหวัดเลือกจากรายชื่อ ค้นพิมพ์ได้
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${CODE}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click({ timeout: 30_000 });
  const แผง = page.getByRole("dialog", { name: "ฟอร์มข้อมูลดีลเลอร์" });
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  await แผง.getByLabel("พิมพ์ค้นในรายการ").fill("ตรัง");
  await expect(แผง.getByLabel("จังหวัดที่ตั้ง", { exact: true }), "พิมพ์ค้นแล้วเหลือจังหวัดเดียว = เลือกให้").toHaveValue("ตรัง");
  await แผง.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(แผง).toBeHidden({ timeout: 15_000 });

  await expect.poll(พื้นที่, { message: "แก้จังหวัดที่ตั้งแล้ว พื้นที่ย้ายตาม 1 จังหวัดพอดี", timeout: 15_000 }).toEqual(["ตรัง"]);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("ดีลเลอร์ทั้งหมด").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("note").filter({ hasText: CODE }), "ไม่อยู่ในการ์ดยังไม่มีพื้นที่").toHaveCount(0);
  assertNoErrors(errs, "แก้จังหวัดดีลเลอร์");
});

test("[db] แก้จังหวัดที่ตั้งเป็นชื่อนอกรายชื่อ = ฐานปฏิเสธ · พื้นที่ไม่เปลี่ยน", async () => {
  // ต่อจากข้อบน: ZZTPF ดูแลตรัง
  const r = await admin.from("dealers").update({ province: "ตรังง" }).eq("code", CODE);
  expect(r.error?.message ?? "", "ชื่อสะกดผิด = ปฏิเสธ").toContain("dealer_province_invalid");
  expect(await พื้นที่(), "พื้นที่เดิมคงไว้").toEqual(["ตรัง"]);
});
