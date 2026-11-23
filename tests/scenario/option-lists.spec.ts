import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, ตัวเลือกของตัวกรอง } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── รายการกลางของเครือ (บอสตัดสิน 19 พ.ย. 69 · "ตั้งค่ารายการกลาง" · ใบ 0296) ───────────────────────────────────────────
//   HQ ตั้ง ช่องทางที่มา · ประเภทนัดหมาย · เหตุผลผู้สนใจไม่สำเร็จ ที่ ตั้งค่า › รายการกลาง → ดีลเลอร์ทุกรายเห็นชุดเดียวกัน
//   ข้อมูลเก็บรหัส: HQ แก้ชื่อ → ข้อมูลเดิมของดีลเลอร์เห็นชื่อใหม่ · ซ่อน → ไม่ให้เลือกตอนกรอกใหม่ แต่ข้อมูลเดิมยังแสดงชื่อ
//   ลบตัวที่มีข้อมูลใช้ไม่ได้ (ปุ่มลบปิด + ฐานปฏิเสธ option_in_use) · ค่านอกรายการแสดง "‹ค่า› (ตามที่บันทึกไว้)" · ตัวกรองมีค่านั้น
//   ฟอร์มลีดของดีลเลอร์ = ตัวที่แสดงของรายการ (ตามลำดับ) · ประเภทนัด call / meeting / site_visit แสดงชื่อ
//   ข้อมูลของข้อเอง: สาขาของข้อ · ตัวเลือกช่องทางของข้อ 1 ตัว (ไม่แตะตัวตั้งต้นที่ข้ออื่นใช้) · ลีด 2 · นัด 3
//   ตกบนโค้ดเดิม (97a8ab9e): ไม่มีแท็บรายการกลาง · ตาราง option_lists ไม่มี · ช่องทางที่มาเป็นรายการตายตัวในโค้ด
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

let สาขา: สาขาของข้อ;
const ฐาน = 9_400_000 + Math.floor(Math.random() * 60_000) * 10;
const รหัส = `zt${ฐาน}`;
const ชื่อแรก = `ZZTEST ช่องทาง ${ฐาน}`, ชื่อใหม่ = `ZZTEST ช่องทางใหม่ ${ฐาน}`;
const ค่าเก่า = `ZZTEST ค่าเก่า ${ฐาน}`;
const บริษัทหนึ่ง = `ZZTEST ลีดรายการกลาง ${ฐาน}`, บริษัทสอง = `ZZTEST ลีดค่าเก่า ${ฐาน}`;
const มะรืน = new Date(Date.now() + 7 * 3_600_000 + 2 * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const c = สาขา.รหัส;
  const ผล = รันSQLในฐาน(`insert into public.option_lists (list, code, label, sort, hidden) values ('lead_source', '${รหัส}', '${ชื่อแรก}', 500, false);
    set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status, source) values
      ('#L-${ฐาน}', ${ฐาน}, '${c}', '${บริษัทหนึ่ง}', '${บริษัทหนึ่ง}', 'ผู้ทดสอบ', '000-000-0941', 'ตราด', 'WAITING', '${รหัส}'),
      ('#L-${ฐาน + 1}', ${ฐาน + 1}, '${c}', '${บริษัทสอง}', '${บริษัทสอง}', 'ผู้ทดสอบ', '000-000-0942', 'ตราด', 'WAITING', '${ค่าเก่า}');
    insert into public.appointments (id, dealer_code, lead_id, company, contact, project, province, date, time, type, status, note) values
      (${ฐาน}, '${c}', ${ฐาน}, '${บริษัทหนึ่ง}', 'ผู้ทดสอบ', 'ZZTEST นัดโทร ${ฐาน}', 'ตราด', '${มะรืน}', '09:00', 'call', 'upcoming', ''),
      (${ฐาน + 1}, '${c}', ${ฐาน}, '${บริษัทหนึ่ง}', 'ผู้ทดสอบ', 'ZZTEST นัดประชุม ${ฐาน}', 'ตราด', '${มะรืน}', '11:00', 'meeting', 'upcoming', ''),
      (${ฐาน + 2}, '${c}', ${ฐาน}, '${บริษัทหนึ่ง}', 'ผู้ทดสอบ', 'ZZTEST นัดหน้างาน ${ฐาน}', 'ตราด', '${มะรืน}', '14:00', 'site_visit', 'upcoming', '');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.appointments where dealer_code = '${สาขา.รหัส}';
    delete from public.leads where dealer_code = '${สาขา.รหัส}';
    set local session_replication_role = origin;
    delete from public.option_lists where list = 'lead_source' and code = '${รหัส}';`);
  await สาขา.ลบ();
});

const ป้ายในฐาน = async () => (await (await db(ADMIN)).from("option_lists").select("label, hidden").eq("list", "lead_source").eq("code", รหัส).single()).data;

test("[func·hq] รายการกลาง: แก้ชื่อในที่เดิม → ฐานเก็บชื่อใหม่ · ตัวที่มีข้อมูลใช้ปุ่มลบปิด · ลบตรงที่ฐาน = option_in_use", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await page.locator(".tab-bar").getByRole("button", { name: "รายการกลาง", exact: true }).click({ timeout: 25_000 });
  const รายการ = page.locator('[data-option-list="lead_source"]');
  await expect(รายการ.getByRole("textbox", { name: `ชื่อตัวเลือก “${ชื่อแรก}”`, exact: true })).toHaveValue(ชื่อแรก, { timeout: 20_000 });
  await expect(page.locator('[data-option-list="appointment_type"]'), "มีรายการประเภทนัดหมาย").toHaveCount(1);
  await expect(page.locator('[data-option-list="prospect_lost_reason"]'), "มีรายการเหตุผลผู้สนใจไม่สำเร็จ").toHaveCount(1);
  // มีลีดใช้ตัวนี้ = ลบไม่ได้ (ซ่อนแทน)
  await expect(รายการ.getByRole("button", { name: `ลบ ${ชื่อแรก}`, exact: true }), "มีข้อมูลใช้ = ปุ่มลบปิด").toBeDisabled();
  await expect(รายการ.getByRole("button", { name: `ลบ ${ชื่อแรก}`, exact: true })).toHaveAttribute("title", "มีข้อมูลใช้ตัวเลือกนี้อยู่ ลบไม่ได้ — ซ่อนแทน");
  await รายการ.getByRole("textbox", { name: `ชื่อตัวเลือก “${ชื่อแรก}”`, exact: true }).fill(ชื่อใหม่);
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(ป้ายในฐาน, { timeout: 20_000 }).toEqual({ label: ชื่อใหม่, hidden: false });
  // ฐานกันอีกชั้น — ยิงตรงด้วยบัญชี HQ ก็ลบตัวที่มีข้อมูลใช้ไม่ได้
  const ลบ = await (await db(ADMIN)).from("option_lists").delete().eq("list", "lead_source").eq("code", รหัส);
  expect(ลบ.error?.message ?? "", "ฐานปฏิเสธการลบตัวที่มีข้อมูลใช้").toMatch(/option_in_use/);
  expect(await ป้ายในฐาน(), "ยังอยู่ครบ").toEqual({ label: ชื่อใหม่, hidden: false });
  assertNoErrors(errs, "ตั้งค่า › รายการกลาง แก้ชื่อ");
});

test("[func·dealer] ลีดเดิมเห็นชื่อใหม่ (ตาราง + แผง) · ค่านอกรายการ = (ตามที่บันทึกไว้) · ตัวกรองมีค่านั้น · ฟอร์มใหม่ = ตัวที่แสดงของรายการ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/leads", สาขา.บัญชี);
  await settle(page);
  const แถวหนึ่ง = page.getByRole("row").filter({ hasText: บริษัทหนึ่ง });
  const แถวสอง = page.getByRole("row").filter({ hasText: บริษัทสอง });
  await expect(แถวหนึ่ง, "ตาราง: ลีดที่ใช้ตัวเลือก").toHaveCount(1, { timeout: 30_000 });
  await expect(แถวหนึ่ง, "แก้ชื่อแล้วข้อมูลเดิมเห็นชื่อใหม่").toContainText(ชื่อใหม่);
  await expect(แถวสอง, "ค่านอกรายการ").toContainText(`${ค่าเก่า} (ตามที่บันทึกไว้)`);
  // ตัวกรองช่องทาง: ทุกตัวในรายการ + ค่านอกรายการที่พบในข้อมูล
  const ตัวเลือก = await ตัวเลือกของตัวกรอง(page, "ทุกช่องทางที่มา");
  expect(ตัวเลือก.filter(o => o.ค่า === รหัส).map(o => o.ข้อความ), "ตัวกรองใช้ชื่อจากรายการ").toEqual([ชื่อใหม่]);
  expect(ตัวเลือก.filter(o => o.ค่า === ค่าเก่า).map(o => o.ข้อความ), "ตัวกรองมีค่านอกรายการ").toEqual([`${ค่าเก่า} (ตามที่บันทึกไว้)`]);

  // ฟอร์มเพิ่มลูกค้าเป้าหมาย: ตัวเลือก = ตัวที่ไม่ซ่อนของรายการตามลำดับ (อ่านจากฐาน)
  const { data: ที่แสดง } = await (await db(ADMIN)).from("option_lists").select("label").eq("list", "lead_source").eq("hidden", false).order("sort").order("code");
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย", exact: true }).click();
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย", exact: true });
  await expect(ฟอร์ม).toBeVisible({ timeout: 15_000 });
  await expect(ฟอร์ม.getByRole("combobox", { name: "ช่องทางที่มา", exact: true }).locator("option:not([value=''])"), "ฟอร์ม = รายการกลาง")
    .toHaveText((ที่แสดง ?? []).map(r => r.label));
  await page.keyboard.press("Escape");
  assertNoErrors(errs, "หน้าลูกค้าเป้าหมาย ใช้รายการกลาง");
});

test("[func·hq→dealer] ซ่อน: ฟอร์มใหม่ไม่มีให้เลือก · ลีดเดิมยังแสดงชื่อและเลือกค้างไว้ในแผง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await page.locator(".tab-bar").getByRole("button", { name: "รายการกลาง", exact: true }).click({ timeout: 25_000 });
  const รายการ = page.locator('[data-option-list="lead_source"]');
  await รายการ.getByRole("button", { name: `ซ่อน ${ชื่อใหม่}`, exact: true }).click({ timeout: 20_000 });
  await expect(รายการ.getByRole("button", { name: `แสดง ${ชื่อใหม่}`, exact: true }), "กดแล้วสลับเป็นปุ่มแสดง").toBeVisible();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(ป้ายในฐาน, { timeout: 20_000 }).toEqual({ label: ชื่อใหม่, hidden: true });

  await loginUI(page, DEALER_ORIGIN, "/leads", สาขา.บัญชี);
  await settle(page);
  await expect(page.getByRole("row").filter({ hasText: บริษัทหนึ่ง }), "ซ่อนแล้วข้อมูลเดิมยังแสดงชื่อ").toContainText(ชื่อใหม่, { timeout: 30_000 });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย", exact: true }).click();
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย", exact: true });
  await expect(ฟอร์ม.getByRole("combobox", { name: "ช่องทางที่มา", exact: true }).locator("option").filter({ hasText: ชื่อใหม่ }), "ซ่อน = ไม่ให้เลือกตอนกรอกใหม่").toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(ฟอร์ม).toHaveCount(0);

  // แผงลีดเดิม: ช่องช่องทางเลือกค้างที่ค่าเดิม (ตัวที่ซ่อน)
  await page.goto(`${DEALER_ORIGIN}/leads?open=${ฐาน}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แผง = page.locator("[data-row-panel]").last();
  await expect(แผง).toBeVisible({ timeout: 30_000 });
  const ช่อง = แผง.getByRole("combobox", { name: "ช่องทางที่มา", exact: true });
  await expect(ช่อง, "ค่าเดิมยังเลือกค้างไว้").toHaveValue(รหัส, { timeout: 20_000 });
  await expect(ช่อง.locator("option:checked")).toHaveText(ชื่อใหม่);
  assertNoErrors(errs, "ซ่อนตัวเลือกช่องทาง");
});

test("[func·dealer] ประเภทนัด call / meeting / site_visit แสดงชื่อจากรายการกลาง (แผงลีด + ปฏิทิน)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, `/leads?open=${ฐาน}`, สาขา.บัญชี);
  await settle(page);
  const แผง = page.locator("[data-row-panel]").last();
  await expect(แผง).toBeVisible({ timeout: 30_000 });
  for (const [ชื่องาน, ชื่อประเภท] of [[`ZZTEST นัดโทร ${ฐาน}`, "โทรติดตาม"], [`ZZTEST นัดประชุม ${ฐาน}`, "ประชุม"], [`ZZTEST นัดหน้างาน ${ฐาน}`, "นัดดูหน้างาน"]] as const) {
    const นัด = แผง.locator("div").filter({ has: page.getByText(ชื่องาน, { exact: true }) }).last();
    await expect(นัด, `นัด ${ชื่องาน}`).toContainText(`${ชื่อประเภท} · `, { timeout: 20_000 });
  }
  await page.goto(`${DEALER_ORIGIN}/calendar`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const นัดโทร = page.locator(".activity").filter({ hasText: บริษัทหนึ่ง }).filter({ hasText: "09:00" });
  await expect(นัดโทร, "ปฏิทิน: นัด call").toHaveCount(1, { timeout: 30_000 });
  await expect(นัดโทร.locator(".activity-meta span").filter({ hasText: /^โทรติดตาม$/ }), "ปฏิทิน: ชื่อประเภทของ call").toHaveCount(1);
  assertNoErrors(errs, "ชื่อประเภทนัดจากรายการกลาง");
});
