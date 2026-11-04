// ── ขอราคาจาก HQ ได้เมื่อ "เก็บข้อมูลลูกค้า" + "สรุปความต้องการ" ครบ (บอสสั่ง 2 พ.ย. 69 · ใบ 0273 ข้อ 11) ─────────────────────
//   [D3] หน้าเว็บ: ลีดข้อมูลไม่ครบ กด "ขอราคาจาก HQ" → ฟอร์มเฉพาะช่องที่ขาด (บังคับ) → บันทึกแล้ว 2 งานติ๊กเอง → ฟอร์มขอราคา (ดึงจากลีด) → ส่งได้
//        "นัดหมาย" ยังไม่ทำก็ขอได้
//   [db] ยิงตรงเข้าเซิร์ฟเวอร์ด้วยลีดข้อมูลไม่ครบ = ฐานปฏิเสธ บอกช่องที่ขาด
//   ตกบนโค้ดเดิม: ลีดข้อมูลไม่ครบเปิดฟอร์มขอราคาและส่งได้เลย · ฐาน: supabase/tests/quote_request_needs_info.sql
import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ช่อง } from "@pms/shared/lib/fieldLabels";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });
test.setTimeout(180_000);

let ส: สาขาของข้อ;
const เลข = 1_960_000_000 + Math.floor(Math.random() * 400_000) * 10;
const บริษัท = (i: number) => `ZZTEST ข้อมูลไม่ครบ ${ส.รหัส}-${i}`;

async function เปิดแผง(page: Page, i: number) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท(i));
  const row = page.locator("tbody tr").filter({ hasText: บริษัท(i) }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  return page.locator("[data-panel='quote-request']");
}

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  // ลีด 1: ข้อมูลลูกค้าครบ แต่ข้อมูลงานไม่มีเลย · ลีด 2: ขาดผู้ติดต่อ + สเปก (ใช้ยิงตรง)
  const sb = await db(ส.บัญชี);
  const r = await sb.from("leads").insert([
    { id: `#L-${เลข + 1}`, num_id: เลข + 1, dealer_code: ส.รหัส, company: บริษัท(1), name: บริษัท(1), contact: "ผู้ทดสอบ", phone: "000-000-0101", province: "ตราด", status: "BULLET" },
    { id: `#L-${เลข + 2}`, num_id: เลข + 2, dealer_code: ส.รหัส, company: บริษัท(2), name: บริษัท(2), contact: "", phone: "000-000-0102", province: "ตราด", status: "BULLET", project: "โกดัง", area: "500" },
  ]);
  expect(r.error, "สร้างลีดของข้อ").toBeNull();
});
test.afterAll(async () => { await ส?.ลบ(); });

test("[D3] [flow·dealer] ข้อมูลไม่ครบ → ฟอร์มเฉพาะช่องที่ขาด → บันทึก (2 งานติ๊กเอง) → ฟอร์มขอราคา → ส่งได้ · ไม่มีนัดหมายก็ขอได้", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  const แผง = await เปิดแผง(page, 1);
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  const ฟอร์ม = แผง.locator("[data-form='lead-info-missing']");
  await expect(ฟอร์ม, "ข้อมูลไม่ครบ = ฟอร์มเติมข้อมูลก่อน").toBeVisible({ timeout: 15_000 });
  await expect(แผง.getByRole("button", { name: "ส่งคำขอ" }), "ยังไม่มีปุ่มส่งคำขอ").toHaveCount(0);
  // เฉพาะช่องที่ขาด: งาน · พื้นที่ · สเปก (ข้อมูลลูกค้าครบแล้ว ไม่ถามซ้ำ)
  // * แดงมาจากตัวกลาง <FieldLabel required> (4 พ.ย. 69) — ข้อความติดกัน "งาน*" → จัดเป็น "งาน *" ก่อนเทียบ · ทุกช่องต้องมี * จริง
  const ป้าย = (await ฟอร์ม.locator("label.form-label").allTextContents()).map(t => t.trim().replace(/\s*\*$/, " *"));
  expect(ป้าย, "ถามเฉพาะช่องที่ขาด").toEqual([`${ช่อง.งาน} *`, `${ช่อง.พื้นที่} *`, `${ช่อง.สเปก} *`]);
  await expect(ฟอร์ม.locator("label.form-label [data-required]"), "ทุกช่องที่ขาดมี * แดงจากตัวกลาง").toHaveCount(3);
  await ฟอร์ม.getByLabel(ช่อง.งาน, { exact: true }).fill("ZZTEST โกดัง 30x50 ม.");
  await ฟอร์ม.getByRole("button", { name: "บันทึกแล้วไปต่อ" }).click();
  await expect(แผง.getByRole("alert").filter({ hasText: "กรอกให้ครบก่อน" }), "ยังกรอกไม่ครบ = บอกช่องที่เหลือ").toContainText(`${ช่อง.พื้นที่} · ${ช่อง.สเปก}`);
  // ตัวกลางช่องบังคับ (4 พ.ย. 69): ช่องที่ยังขาดกรอบแดง + ข้อความใต้ช่อง · ช่องที่กรอกแล้วไม่มี
  await expect(ฟอร์ม.locator("[data-field-error]"), "ข้อความใต้ช่องที่ยังขาด 2 ช่อง").toHaveText([`ต้องกรอก${ช่อง.พื้นที่}`, `ต้องกรอก${ช่อง.สเปก}`]);
  await expect(ฟอร์ม.getByLabel(ช่อง.งาน, { exact: true }), "ช่องที่กรอกแล้วไม่แดง").not.toHaveAttribute("aria-invalid", "true");
  await ฟอร์ม.getByLabel(ช่อง.พื้นที่, { exact: true }).fill("1500");
  await ฟอร์ม.getByLabel(ช่อง.สเปก, { exact: true }).fill("ZZTEST หลังคาเมทัลชีท สูง 8 ม.");
  await ฟอร์ม.getByRole("button", { name: "บันทึกแล้วไปต่อ" }).click();

  // ฟอร์มขอราคาเปิดต่อ ช่องดึงจากลีด
  await expect(แผง.locator("#qr-product"), "ฟอร์มขอราคาดึงงานจากลีด").toHaveValue("ZZTEST โกดัง 30x50 ม.", { timeout: 20_000 });
  await expect(แผง.locator("#qr-area")).toHaveValue("1500");
  await expect(แผง.locator("#qr-spec")).toHaveValue("ZZTEST หลังคาเมทัลชีท สูง 8 ม.");
  const ลีด = (await (await db(ส.บัญชี)).from("leads").select("project, area, note, tasks").eq("dealer_code", ส.รหัส).eq("num_id", เลข + 1).single()).data!;
  expect([ลีด.project, String(ลีด.area), ลีด.note], "บันทึกลงลีดแล้ว").toEqual(["ZZTEST โกดัง 30x50 ม.", "1500", "ZZTEST หลังคาเมทัลชีท สูง 8 ม."]);
  const งาน = new Map((ลีด.tasks as { key: string; done: boolean }[]).map(t => [t.key, t.done]));
  expect([งาน.get("collect"), งาน.get("requirement")], "2 งานติ๊กเอง").toEqual([true, true]);
  expect(งาน.get("appointment") ?? false, "นัดหมายยังไม่ทำ").toBe(false);

  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect.poll(async () => (await (await db(ส.บัญชี)).from("quote_requests").select("id").eq("dealer_code", ส.รหัส).eq("lead_num_id", เลข + 1)).data?.length ?? 0,
    { timeout: 20_000, message: "ส่งคำขอได้ (ไม่มีนัดหมายก็ขอได้)" }).toBe(1);
  assertNoErrors(errs, "เติมข้อมูลแล้วขอราคา");
});

test("[db] ยิงตรงด้วยลีดข้อมูลไม่ครบ = ฐานปฏิเสธ บอกช่องที่ขาด (ทั้งเส้นทาง API และฐาน)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  const r = await page.request.post(`${DEALER_ORIGIN}/api/v1/quote-requests`, {
    data: JSON.stringify({ op: "submit", leadNumId: เลข + 2, product: "โกดัง" }), headers: { "content-type": "application/json" } });
  expect(r.status(), "เส้นทาง API ปฏิเสธ").not.toBe(200);
  const ข้อความ = await r.text();
  expect(ข้อความ, "บอกช่องที่ขาด").toContain(`${ช่อง.ผู้ติดต่อ} · ${ช่อง.สเปก}`);
  const ตรง = await (await db(ส.บัญชี)).rpc("quote_request_submit", { p_lead_num_id: เลข + 2, p_product: "โกดัง" });
  expect(ตรง.error?.message ?? "", "ฐานปฏิเสธ").toContain("lead_incomplete");
  expect((await (await db(ส.บัญชี)).from("quote_requests").select("id").eq("dealer_code", ส.รหัส).eq("lead_num_id", เลข + 2)).data ?? [], "ไม่มีคำขอเกิดขึ้น").toHaveLength(0);
});
