import { test, expect, type Page } from "@playwright/test";
import { รันSQLในฐาน } from "./localDb";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, จำนวนสถานะคำขอ, เลือกกลุ่มคำขอ, แถวคำขอ, หน้าต่างใบHQ } from "./helpers";

// ── ยกเลิกคำขอราคาแบบเก็บประวัติ (บอสสั่ง 5 พ.ย. 69 · ใบ 0280 · บอสตอบ ดีลเลอร์ยกเลิกอย่างเดียว · ก่อน HQ ส่งใบเท่านั้น) ─────────────
//   1) กดยกเลิกฟอร์มขอราคา (ยังไม่ส่ง) = แท็บประวัติของลีด "เริ่มขอราคาแล้วยกเลิก · โดย …"
//   2) คำขอที่ส่งแล้วยกเลิก = ไม่ลบ · สถานะยกเลิกแล้ว + เหตุผล + ใคร + เมื่อไร · ยังเห็นในแท็บใบเสนอราคา (ไฟล์แนบเปิดดูได้) และประวัติ
//      · หน้าคำขอ HQ มีตัวกรอง "ยกเลิกแล้ว" + รายละเอียดเหตุผล/ใคร/เมื่อไร · ไม่นับเป็นต้องตีราคา · ขอราคาใหม่ได้ คำขอเก่าไม่ทับ
//   3) ฐานห้ามลบคำขอ — บัญชี HQ / กุญแจฝั่งเซิร์ฟเวอร์ลบไม่ได้
//   ตกบนโค้ดก่อนแก้: ยกเลิกแล้วคำขอหายจากแผง · ไม่มีประวัติ · ไม่มีตัวกรองยกเลิกแล้ว · ลบคำขอได้ด้วยกุญแจฝั่งเซิร์ฟเวอร์
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const admin = adminClient();
const COMPANY = `ZZTEST-ยกเลิกคำขอ-${Date.now() % 100000}`;
let leadNum = 0;
const ประวัติล่าสุด = async () => {
  const a = ((await admin.from("leads").select("activities").eq("dealer_code", "RYG").eq("num_id", leadNum).single()).data?.activities ?? []) as { text?: string }[];
  return a.at(-1)?.text ?? "";
};
const คำขอ = async () => ((await admin.from("quote_requests").select("id, status, request_no, cancel_reason, cancelled_by_name, cancelled_at")
  .eq("dealer_code", "RYG").eq("lead_num_id", leadNum).order("id")).data ?? []);

test.beforeAll(async () => {
  leadNum = 977_000_000 + (Date.now() % 99_999);
  const r = await (await db(RYG)).from("leads").insert({
    id: `#L-${leadNum}`, num_id: leadNum, dealer_code: "RYG", company: COMPANY, name: COMPANY, contact: "ผู้ทดสอบ",
    phone: "000-000-0281", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET", project: "ZZTEST งานโกดัง 20x40 ม.", area: "800", note: "ZZTEST สเปก",
  });
  if (r.error) throw new Error(r.error.message);
});
test.afterAll(() => {
  if (!leadNum) return;
  รันSQLในฐาน(`delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    delete from public.email_outbox o using public.quote_requests r where o.ref_table = 'quote_requests' and o.ref_id = r.id::text and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    delete from public.notifications n using public.quote_requests r where n.dedupe_key like '%:' || r.id::text and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = 'RYG' and lead_num_id = ${leadNum};
    select set_config('pms.quote_request_delete', 'test', false);   -- ตัวกันห้ามลบคำขอ (ใบ 0280) ยอมเฉพาะชุดล้างข้อมูลทดสอบ
    delete from public.quote_requests where dealer_code = 'RYG' and lead_num_id = ${leadNum};
    delete from public.leads where dealer_code = 'RYG' and num_id = ${leadNum};`);
});

async function เปิดแผงลีด(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  return page.locator("[data-panel='quote-request']");
}

test("[flow·dealer] ยกเลิกฟอร์มขอราคา (ยังไม่ส่ง) = ประวัติ · ส่งแล้วยกเลิก = เก็บไว้ + เหตุผล/ใคร/เมื่อไร · ขอใหม่ได้ · ลบไม่ได้", async ({ page }) => {
  const errs = watchErrors(page);
  const แผง = await เปิดแผงลีด(page);
  const ขั้นต่อไป = page.getByRole("status", { name: "ขั้นต่อไป" });

  // 1) เปิดฟอร์มขอราคาแล้วกดยกเลิก (ไม่ส่ง)
  await ขั้นต่อไป.getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  await expect(แผง.getByLabel("งานที่ขอราคา")).toBeVisible({ timeout: 15_000 });
  await แผง.locator("[data-act='abandon-request-form']").click();
  await expect.poll(ประวัติล่าสุด, { timeout: 20_000, message: "ประวัติของลีด: เริ่มขอราคาแล้วยกเลิก + ใคร" }).toMatch(/^เริ่มขอราคาแล้วยกเลิก · โดย .+/);
  expect(await คำขอ(), "ยกเลิกฟอร์ม = ไม่มีคำขอเกิดขึ้น").toEqual([]);

  // 2) ส่งคำขอ แล้วยกเลิกพร้อมเหตุผล
  await ขั้นต่อไป.getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  await แผง.getByLabel("สเปก / รายละเอียด").fill("ZZTEST โกดัง 20x40 ม.");
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect.poll(async () => (await คำขอ()).map(r => r.status), { timeout: 20_000 }).toEqual(["new"]);
  await แผง.getByRole("button", { name: "ยกเลิกคำขอ" }).click();
  const กล่อง = page.locator("[data-reason-dialog]");
  await กล่อง.getByLabel("เหตุผลที่ยกเลิก").fill("ZZTEST ลูกค้าเลื่อนโครงการ");
  await กล่อง.getByRole("button", { name: "ยืนยันยกเลิก" }).click();
  await expect.poll(async () => (await คำขอ())[0]?.status, { timeout: 20_000 }).toBe("cancelled");
  const [ค1] = await คำขอ();
  expect(ค1.cancel_reason).toBe("ZZTEST ลูกค้าเลื่อนโครงการ");
  expect(ค1.cancelled_by_name, "จดชื่อคนยกเลิก").not.toBe("");
  expect(ค1.cancelled_at, "จดเวลายกเลิก").toBeTruthy();
  const ยกเลิก = แผง.locator(`[data-cancelled-request="${ค1.request_no}"]`);
  await expect(ยกเลิก, "คำขอที่ยกเลิกยังเห็นในแท็บใบเสนอราคา").toBeVisible({ timeout: 20_000 });
  await expect(ยกเลิก).toContainText("ยกเลิกแล้ว");
  await expect(ยกเลิก.getByTestId("cancel-info")).toContainText(`เหตุผล: ZZTEST ลูกค้าเลื่อนโครงการ · โดย ${ค1.cancelled_by_name} · เมื่อ `);
  await ยกเลิก.locator("[data-act='cancelled-request-files']").click();
  await expect(ยกเลิก.getByText("คำขอนี้ยกเลิกแล้ว").first(), "กล่องไฟล์แนบของคำขอที่ยกเลิกเปิดดูได้ (แนบเพิ่มไม่ได้)").toBeVisible({ timeout: 15_000 });
  expect(await ประวัติล่าสุด(), "ประวัติของลีดมีการยกเลิกคำขอ").toBe(`ยกเลิกคำขอราคา ${ค1.request_no} · เหตุผล: ZZTEST ลูกค้าเลื่อนโครงการ · โดย ${ค1.cancelled_by_name}`);
  await page.getByRole("button", { name: "ประวัติ", exact: true }).first().click();
  await expect(page.getByText(`ยกเลิกคำขอราคา ${ค1.request_no}`).first(), "แท็บประวัติแสดงการยกเลิก").toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/^เริ่มขอราคาแล้วยกเลิก · โดย /).first(), "แท็บประวัติแสดงการยกเลิกฟอร์ม").toBeVisible();

  // ขอราคาใหม่ได้ คำขอเก่าไม่ทับ
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await ขั้นต่อไป.getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  await แผง.getByLabel("สเปก / รายละเอียด").fill("ZZTEST ขอใหม่");
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect.poll(async () => (await คำขอ()).map(r => r.status), { timeout: 20_000, message: "คำขอเก่ายังอยู่ (ยกเลิกแล้ว) + คำขอใหม่" }).toEqual(["cancelled", "new"]);
  await expect(แผง.locator(`[data-cancelled-request="${ค1.request_no}"]`), "คำขอใหม่ไม่ทับคำขอที่ยกเลิก").toBeVisible();

  // 3) ฐานห้ามลบ: กุญแจฝั่งเซิร์ฟเวอร์ + บัญชี HQ
  const ลบ = await admin.from("quote_requests").delete().eq("id", ค1.id);
  expect(ลบ.error?.message ?? "", "กุญแจฝั่งเซิร์ฟเวอร์ลบคำขอไม่ได้").toMatch(/request_no_delete/);
  await (await db(ADMIN)).from("quote_requests").delete().eq("id", ค1.id);
  expect((await คำขอ()).map(r => r.id), "บัญชี HQ ลบคำขอไม่ได้").toContain(ค1.id);
  assertNoErrors(errs, "ยกเลิกคำขอราคา");
});

test("[flow·hq] คำขอราคา: ตัวกรอง ยกเลิกแล้ว · รายละเอียดเหตุผล/ใคร/เมื่อไร · ไม่อยู่ในต้องตีราคา", async ({ page }) => {
  const errs = watchErrors(page);
  const [ค1] = await คำขอ();
  expect(ค1?.status).toBe("cancelled");
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  // ตาราง 6 พ.ย. 69: ตัวกรองสถานะเป็นช่องเลือก (ตัวเลือกมีจำนวน) แทนแท็บ
  // 9 พ.ย. 69: ตัวกรองสถานะอยู่ในแท็บประวัติ · คำขอที่ยกเลิกไม่อยู่ตารางหลัก (ต้องตีราคา)
  await page.getByLabel("ค้นหาคำขอ").fill(ค1.request_no);
  await expect(จำนวนสถานะคำขอ(page, "todo"), "คำขอที่ยกเลิกไม่นับในต้องตีราคา").toHaveAttribute("data-count", "0", { timeout: 20_000 });
  await expect(แถวคำขอ(page, ค1.request_no), "ยกเลิกแล้วไม่อยู่ตารางหลัก").toHaveCount(0);
  await เลือกกลุ่มคำขอ(page, "cancelled");
  await expect(จำนวนสถานะคำขอ(page, "cancelled"), "มีตัวกรอง ยกเลิกแล้ว").toContainText("ยกเลิกแล้ว");
  await expect(จำนวนสถานะคำขอ(page, "cancelled")).toHaveAttribute("data-count", "1");
  const แถว = แถวคำขอ(page, ค1.request_no).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await expect(แถว).toContainText("ยกเลิกแล้ว");
  await expect(แถว).toContainText("ยกเลิกเมื่อ");
  await แถว.click();
  await expect(หน้าต่างใบHQ(page).getByTestId("cancel-info"), "รายละเอียดคำขอบอกเหตุผล/ใคร/เมื่อไร")
    .toContainText(`เหตุผล: ZZTEST ลูกค้าเลื่อนโครงการ · โดย ${ค1.cancelled_by_name} · เมื่อ `, { timeout: 20_000 });
  await expect(หน้าต่างใบHQ(page).getByTestId("due-countdown"), "คำขอที่ยกเลิกไม่มีนับวันกำหนดส่ง").toHaveCount(0);
  assertNoErrors(errs, "หน้าคำขอ HQ ยกเลิกแล้ว");
});
