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
//   ใช้สาขาชั่วคราวจังหวัด "สตูลล" (สะกดผิด) → แก้เป็น "สตูล" · ไม่แตะ BKK (hq-territory-unmatched.spec.ts ใช้อยู่) · สตูลไม่มีลีดในข้อมูลตั้งต้น
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const CODE = "ZZTPF";
const admin = adminClient();
async function ล้าง() {
  await admin.from("dealer_territories").delete().eq("dealer_code", CODE);
  await admin.from("dealers").delete().eq("code", CODE);
}
test.beforeAll(async () => {
  await ล้าง();
  const d = await admin.from("dealers").insert({ code: CODE, name: `ZZTEST-พื้นที่-${CODE}`, status: "active", province: "สตูลล", region: "ใต้", revenue_target: 0 });
  if (d.error) throw new Error(d.error.message);
});
test.afterAll(ล้าง);

test("[H11] HQ กด \"แก้ไข\" แก้จังหวัดที่สะกดไม่ตรงรายชื่อ → ดีลเลอร์ได้พื้นที่จังหวัดนั้น และหายจากการ์ด \"ยังไม่มีพื้นที่\"", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);

  // ก่อนแก้: ขึ้นในการ์ดให้ HQ เห็น · ยังไม่มีพื้นที่
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  const การ์ด = page.getByRole("note").filter({ hasText: "ดีลเลอร์ที่ยังไม่มีพื้นที่" }).first();
  await expect(การ์ด.getByText(new RegExp(`${CODE} \\(สตูลล\\)`)), "สาขาที่จังหวัดสะกดผิดต้องขึ้นในการ์ด").toBeVisible({ timeout: 30_000 });

  // แก้ที่ปุ่ม "แก้ไข" ของหน้ารายละเอียด (ชื่อปุ่มตาม FLOW H11)
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${CODE}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "แก้ไข", exact: true }).click({ timeout: 30_000 });
  const แผง = page.getByRole("dialog", { name: "ฟอร์มข้อมูลดีลเลอร์" });
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  await แผง.getByLabel("จังหวัดที่ตั้ง").selectOption("สตูล");
  await แผง.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(แผง).toBeHidden({ timeout: 15_000 });

  // หลังแก้: ได้พื้นที่จริงในฐาน (เดิม: การ์ดหายแต่ไม่มีพื้นที่เลย)
  await expect.poll(async () => {
    const { data } = await admin.from("dealer_territories").select("province").eq("dealer_code", CODE);
    return (data ?? []).map(x => x.province);
  }, { message: "แก้จังหวัดที่ตั้งแล้ว ต้องได้พื้นที่จังหวัดนั้น", timeout: 15_000 }).toEqual(["สตูล"]);

  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("ดีลเลอร์ทั้งหมด").first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("note").filter({ hasText: CODE }), "ไม่อยู่ในการ์ดยังไม่มีพื้นที่แล้ว").toHaveCount(0);
  assertNoErrors(errs, "แก้จังหวัดดีลเลอร์");
});

test("[db] ดีลเลอร์ที่มีพื้นที่อยู่แล้ว ย้ายจังหวัดที่ตั้ง → พื้นที่เดิมไม่เปลี่ยน · ชื่อที่ไม่อยู่ในรายชื่อ → ไม่ได้พื้นที่", async () => {
  // ต่อจากข้อบน: ZZTPF มีพื้นที่ สตูล แล้ว
  expect((await admin.from("dealers").update({ province: "ตรัง" }).eq("code", CODE)).error).toBeNull();
  const { data: หลังย้าย } = await admin.from("dealer_territories").select("province").eq("dealer_code", CODE);
  expect((หลังย้าย ?? []).map(x => x.province), "ที่ตั้งกับพื้นที่ดูแลคนละเรื่อง — ระบบไม่เดาย้ายพื้นที่ให้").toEqual(["สตูล"]);

  // ไม่มีพื้นที่ + ชื่อย่อ/สะกดผิด → ยังไม่ได้พื้นที่ (ไม่เดาจับคู่ เหมือนใบ 0195)
  await admin.from("dealer_territories").delete().eq("dealer_code", CODE);
  expect((await admin.from("dealers").update({ province: "สตูลล" }).eq("code", CODE)).error).toBeNull();
  const { data: สะกดผิด } = await admin.from("dealer_territories").select("province").eq("dealer_code", CODE);
  expect(สะกดผิด ?? [], "ชื่อที่ไม่อยู่ใน 77 จังหวัด ไม่ได้พื้นที่").toEqual([]);
});
