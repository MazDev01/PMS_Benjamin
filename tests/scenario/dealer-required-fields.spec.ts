import { test, expect, type Page, type Locator } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ช่องบังคับกรอกทุกฟอร์มของแอปดีลเลอร์ (บอสสั่ง 4 พ.ย. 69) ─────────────────────────────────────────────────────────
//   * สีแดงเฉพาะช่องที่บังคับจริง · กดบันทึก/ส่งตอนช่องบังคับว่าง = ไม่บันทึก · กรอบแดง + ข้อความใต้ช่อง · เลื่อน/โฟกัสช่องแรกที่ขาด
//   ช่องข้อความที่อาจไม่มีข้อมูลจริงใส่ "-" ได้ · ว่าง/เว้นวรรคล้วนไม่ผ่าน
//   ยึดสิ่งที่ผู้ใช้เห็น/ที่ฐานบันทึก ไม่ยึดชื่อคอมโพเนนต์: * แดง = ตัว "*" สีแดงในป้ายช่อง · ช่องที่ขาด = aria-invalid="true"
//   · ข้อความใต้ช่อง = role="alert" ในกล่องของช่อง · บันทึกไม่ได้ = แถวในฐานไม่เปลี่ยน
//   ตกบนโค้ดก่อนงานนี้: แผงลีดลบชื่อบริษัทแล้วบันทึกได้ · แผงลูกค้าไม่ตรวจเลย · นัดในแผงลีดล้างวันที่แล้วบันทึกได้
//   · ตั้งค่าผู้ออกใบไม่ตรวจ · * ไม่ใช่สีแดง/บางฟอร์มไม่มี * · ไม่มีกรอบแดงและข้อความใต้ช่อง
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
// ไม่ใช้ serial — แต่ละข้อตก/ผ่านแยกกัน (หลักฐานตกบนโค้ดเดิมต้องเห็นครบทุกข้อ) · ทุกข้อใช้สาขาของข้อชุดเดียว (ไม่นับข้ามข้อ)
test.setTimeout(180_000);

let ส: สาขาของข้อ;
const ฐานเลข = 1_979_000_000 + Math.floor(Math.random() * 400_000) * 10;
const ลีด = () => `ZZTEST ช่องบังคับ ${ส.รหัส} ลีด`;
const ลูกค้า = () => `ZZTEST ช่องบังคับ ${ส.รหัส} ลูกค้า`;
const ผู้ออกใบครบ = { company: "ZZTEST บริษัทผู้ออกใบ", address: "1 ถนนทดสอบ ตราด", phone: "000-000-0501", taxId: "0-0000-00000-00-0", email: "", website: "" };

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const sb = await db(ส.บัญชี);
  expect((await sb.from("leads").insert({ id: `#L-${ฐานเลข}`, num_id: ฐานเลข, dealer_code: ส.รหัส, company: ลีด(), name: ลีด(),
    contact: "ผู้ทดสอบ", phone: "000-000-0502", province: "ตราด", status: "BULLET" })).error, "ลีดของข้อ").toBeNull();
  expect((await sb.from("customers").insert({ id: ฐานเลข + 1, dealer_code: ส.รหัส, name: "คุณลูกค้า", company: ลูกค้า(), province: "ตราด",
    phone: "000-000-0503", join_date: new Date().toISOString().slice(0, 10) })).error, "ลูกค้าของข้อ").toBeNull();
  expect((await sb.from("dealer_settings").upsert({ dealer_code: ส.รหัส, issuer: ผู้ออกใบครบ }, { onConflict: "dealer_code" })).error, "ผู้ออกใบตั้งต้น").toBeNull();
});
test.afterAll(async () => { await ส?.ลบ(); });

const สีแดง = (c: string) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c); return !!m && +m[1] >= 180 && +m[2] <= 90 && +m[3] <= 90; };
/** ป้ายช่องมี "*" สีแดง */
async function ดาวแดง(ป้าย: Locator, ชื่อ: string) {
  await expect(ป้าย, `ป้าย "${ชื่อ}" ต้องเป็น <label> ที่มองเห็น`).toBeVisible({ timeout: 15_000 });
  const ดาว = ป้าย.locator("*").filter({ hasText: /^\*$/ });
  await expect(ดาว, `ป้าย "${ชื่อ}" ต้องมี * แยกเป็นตัวของมันเอง`).toHaveCount(1);
  const สี = await ดาว.evaluate(e => getComputedStyle(e).color);
  expect(สีแดง(สี), `* ของ "${ชื่อ}" ต้องเป็นสีแดง (ได้ ${สี})`).toBe(true);
}
/** ป้ายช่องไม่บังคับ = ไม่มี * */
async function ไม่มีดาว(ป้าย: Locator, ชื่อ: string) {
  await expect(ป้าย, `ป้าย "${ชื่อ}"`).toBeVisible({ timeout: 15_000 });
  expect(await ป้าย.innerText(), `ช่อง "${ชื่อ}" ไม่บังคับ — ห้ามมี *`).not.toContain("*");
}
/** ช่องที่ขาด: กรอบแดง (aria-invalid) + ข้อความใต้ช่อง */
async function ฟ้องที่ช่อง(ช่อง: Locator, ชื่อ: string) {
  await expect(ช่อง, `ช่อง "${ชื่อ}" ต้องขึ้นว่าผิด (aria-invalid)`).toHaveAttribute("aria-invalid", "true", { timeout: 10_000 });
  // ช่อง .form-input มี transition ของสีกรอบ — รอจนเปลี่ยนเสร็จ (อ่านทันทีได้สีกลางทาง)
  await expect.poll(async () => สีแดง(await ช่อง.evaluate(e => getComputedStyle(e).borderTopColor)), { message: `ช่อง "${ชื่อ}" ต้องมีกรอบแดง` }).toBe(true);
  // ข้อความใต้ช่อง: role=alert ตัวแรกที่อยู่ถัดจากช่องในกล่องเดียวกัน
  const ข้อความ = ช่อง.locator("xpath=ancestor::*[.//*[@role='alert']][1]").locator("[role='alert']").first();
  await expect(ข้อความ, `ช่อง "${ชื่อ}" ต้องมีข้อความใต้ช่อง`).toBeVisible();
  expect((await ข้อความ.innerText()).trim().length, `ข้อความใต้ช่อง "${ชื่อ}" ต้องไม่ว่าง`).toBeGreaterThan(0);
}

async function เปิดแผงลีด(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ลีด());
  const row = page.locator("tbody tr").filter({ hasText: ลีด() }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
  await expect(page.getByLabel("ชื่อผู้ติดต่อ").first()).toBeVisible({ timeout: 20_000 });
  await settle(page);
}
const ลีดในฐาน = async () => (await (await db(ส.บัญชี)).from("leads").select("company, contact, phone").eq("dealer_code", ส.รหัส).eq("num_id", ฐานเลข).single()).data!;

test("[req·dealer] แผงลีด: ช่องบังคับ * แดง · ลบชื่อบริษัทแล้วบันทึกไม่ได้ (กรอบแดง + ข้อความ + โฟกัส)", async ({ page }) => {
  await เปิดแผงลีด(page);
  for (const ชื่อ of ["ชื่อบริษัท", "ผู้ติดต่อ", "โทรศัพท์", "จังหวัดหน้างาน"]) await ดาวแดง(page.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);
  // ช่องไม่บังคับในแผงเป็นป้ายธรรมดา (ไม่ใช่ <label>) — ห้ามมี *
  await ไม่มีดาว(page.locator("span").filter({ hasText: /^อีเมล$/ }).first(), "อีเมล");

  const บริษัท = page.getByLabel("ชื่อบริษัท").first();
  await บริษัท.fill("");
  await page.getByRole("button", { name: /บันทึกการแก้ไข/ }).click();
  await ฟ้องที่ช่อง(บริษัท, "ชื่อบริษัท");
  await expect(บริษัท, "โฟกัสช่องแรกที่ขาด").toBeFocused();
  await page.waitForTimeout(1_500);   // ให้เวลาคำขอบันทึก (ถ้ามี) ไปถึงฐาน — พิสูจน์ว่า "ไม่บันทึก" ไม่ใช่ "ยังไม่ทันบันทึก"
  expect((await ลีดในฐาน()).company, "ชื่อบริษัทในฐานต้องไม่ถูกลบ").toBe(ลีด());
});

test("[req·dealer] แผงลีด: ผู้ติดต่อเว้นวรรคล้วนไม่ผ่าน · ใส่ \"-\" ผ่าน", async ({ page }) => {
  await เปิดแผงลีด(page);
  const ผู้ติดต่อ = page.getByLabel("ชื่อผู้ติดต่อ").first();
  await ผู้ติดต่อ.fill("   ");
  await page.getByRole("button", { name: /บันทึกการแก้ไข/ }).click();
  await ฟ้องที่ช่อง(ผู้ติดต่อ, "ผู้ติดต่อ");
  await page.waitForTimeout(1_500);
  expect((await ลีดในฐาน()).contact, "เว้นวรรคล้วนต้องไม่ลงฐาน").toBe("ผู้ทดสอบ");

  await ผู้ติดต่อ.fill("-");
  await expect(ผู้ติดต่อ, "แก้ช่องแล้วกรอบแดงหาย").not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: /บันทึกการแก้ไข/ }).click();
  await expect.poll(async () => (await ลีดในฐาน()).contact, { timeout: 20_000, message: "\"-\" ต้องบันทึกได้" }).toBe("-");
});

test("[req·dealer] เพิ่มลูกค้าเป้าหมาย: กดบันทึกตอนว่างทั้งฟอร์ม → ฟ้องทุกช่องบังคับ · โฟกัสชื่อบริษัท · ไม่สร้างแถว", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /เพิ่มลูกค้าเป้าหมาย/ }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await expect(ฟอร์ม).toBeVisible({ timeout: 15_000 });
  for (const ชื่อ of ["ชื่อบริษัท", "ผู้ติดต่อ", "โทรศัพท์", "จังหวัดหน้างาน"]) await ดาวแดง(ฟอร์ม.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);
  for (const ชื่อ of ["งานที่ต้องการ", "ช่องทางที่มา"]) await ไม่มีดาว(ฟอร์ม.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);
  const นับก่อน = (await (await db(ส.บัญชี)).from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", ส.รหัส)).count;
  await ฟอร์ม.getByLabel("ผู้ติดต่อ").fill("   ");
  await ฟอร์ม.getByRole("button", { name: "บันทึก", exact: true }).click();
  await ฟ้องที่ช่อง(ฟอร์ม.getByLabel("ชื่อบริษัท / ชื่อลูกค้า"), "ชื่อบริษัท");
  await ฟ้องที่ช่อง(ฟอร์ม.getByLabel("ผู้ติดต่อ"), "ผู้ติดต่อ (เว้นวรรคล้วน)");
  await ฟ้องที่ช่อง(ฟอร์ม.getByLabel("โทรศัพท์"), "โทรศัพท์");
  await expect(ฟอร์ม.getByLabel("ชื่อบริษัท / ชื่อลูกค้า"), "โฟกัสช่องแรกที่ขาด").toBeFocused();
  await page.waitForTimeout(1_500);
  expect((await (await db(ส.บัญชี)).from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", ส.รหัส)).count, "ต้องไม่สร้างลีด").toBe(นับก่อน);
});

test("[req·dealer] นัดหมายในแผงลีด: * แดง (ประเภท/วันที่/เวลา) · ล้างวันที่แล้วบันทึกไม่ได้", async ({ page }) => {
  await เปิดแผงลีด(page);
  await page.getByRole("button", { name: /เพิ่มนัดหมาย/ }).first().click();
  await expect(page.getByLabel("ประเภทนัดหมาย")).toBeVisible({ timeout: 15_000 });
  for (const ชื่อ of ["ประเภทนัดหมาย", "วันที่", "เวลา"]) await ดาวแดง(page.locator("label").filter({ hasText: new RegExp(`^${ชื่อ}`) }).first(), ชื่อ);
  await ไม่มีดาว(page.locator("label").filter({ hasText: /^หัวข้อ/ }).first(), "หัวข้อ");
  await page.getByLabel("ประเภทนัดหมาย").selectOption({ label: "นัดพบลูกค้า" });
  const วันที่ = page.getByLabel("วันที่นัดหมาย");
  await วันที่.fill("");
  await page.getByRole("button", { name: /บันทึกนัดหมาย/ }).click();
  await ฟ้องที่ช่อง(วันที่, "วันที่");
  await page.waitForTimeout(1_500);
  const นัด = (await (await db(ส.บัญชี)).from("appointments").select("id", { count: "exact", head: true }).eq("dealer_code", ส.รหัส)).count;
  expect(นัด, "ต้องไม่สร้างนัด").toBe(0);
});

test("[req·dealer] แผงลูกค้า: * แดง · ลบเบอร์โทรแล้วบันทึกไม่ได้", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(ลูกค้า());
  const row = page.locator("tbody tr").filter({ hasText: ลูกค้า() }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTitle("ดูรายละเอียด").click();
  const โทร = page.getByLabel("โทรศัพท์", { exact: true }).first();
  await expect(โทร).toBeVisible({ timeout: 15_000 });
  for (const ชื่อ of ["ชื่อบริษัท", "ผู้ติดต่อ", "โทรศัพท์"]) await ดาวแดง(page.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);
  await โทร.fill("");
  await page.getByRole("button", { name: /บันทึกการแก้ไข/ }).first().click();
  await ฟ้องที่ช่อง(โทร, "โทรศัพท์");
  await page.waitForTimeout(1_500);
  const ค่า = (await (await db(ส.บัญชี)).from("customers").select("phone").eq("id", ฐานเลข + 1).single()).data!;
  expect(ค่า.phone, "เบอร์ในฐานต้องไม่ถูกลบ").toBe("000-000-0503");
});

test("[req·dealer] โน้ตลูกค้า: หัวข้อ * แดง · เว้นวรรคล้วนกดบันทึก = ฟ้อง ไม่สร้างโน้ต", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(ลูกค้า());
  await page.locator("tbody tr").filter({ hasText: ลูกค้า() }).first().getByTitle("ดูรายละเอียด").click();
  await page.getByRole("button", { name: "เพิ่มโน้ต" }).first().click();
  const หัวข้อ = page.getByPlaceholder("หัวข้อโน้ต");
  await ดาวแดง(page.locator("label").filter({ hasText: /^หัวข้อ/ }).first(), "หัวข้อโน้ต");
  await หัวข้อ.fill("   ");
  await page.getByRole("button", { name: "บันทึกโน้ต" }).click();
  await ฟ้องที่ช่อง(หัวข้อ, "หัวข้อโน้ต");
  await page.waitForTimeout(1_500);
  const n = (await (await db(ส.บัญชี)).from("customer_notes").select("id", { count: "exact", head: true }).eq("dealer_code", ส.รหัส)).count;
  expect(n, "ต้องไม่สร้างโน้ต").toBe(0);
});

test("[req·dealer] ตั้งค่าผู้ออกใบ: * แดง · ที่อยู่ว่างบันทึกไม่ได้ · เลขผู้เสียภาษี \"-\" ผ่าน", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "บัญชีดีลเลอร์" }).first().click();
  await expect(page.getByPlaceholder("บริษัท ตัวอย่าง จำกัด").first()).toHaveValue(ผู้ออกใบครบ.company, { timeout: 15_000 });
  for (const ชื่อ of ["ชื่อบริษัท", "เลขประจำตัวผู้เสียภาษี", "โทรศัพท์บริษัท", "ที่อยู่"]) await ดาวแดง(page.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);
  for (const ชื่อ of ["อีเมลบริษัท", "เว็บไซต์"]) await ไม่มีดาว(page.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);
  const ผู้ออกใบ = async () => (await (await db(ส.บัญชี)).from("dealer_settings").select("issuer").eq("dealer_code", ส.รหัส).single()).data!.issuer as Record<string, string>;

  const ที่อยู่ = page.getByPlaceholder("ที่อยู่เต็ม รวมจังหวัดและรหัสไปรษณีย์");
  await ที่อยู่.fill("  ");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await ฟ้องที่ช่อง(ที่อยู่, "ที่อยู่");
  await page.waitForTimeout(1_500);
  expect((await ผู้ออกใบ()).address, "ที่อยู่ในฐานต้องไม่ถูกลบ").toBe(ผู้ออกใบครบ.address);

  await ที่อยู่.fill(ผู้ออกใบครบ.address);
  const ภาษี = page.getByPlaceholder("0-1055-XXXXX-XX-X");
  await ภาษี.fill("-");
  await expect(ภาษี, "ช่องเลขผู้เสียภาษีต้องรับ \"-\" (ไม่กลืนทิ้ง)").toHaveValue("-");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => (await ผู้ออกใบ()).taxId, { timeout: 20_000, message: "\"-\" ต้องบันทึกได้" }).toBe("-");
});

test("[req·dealer] ตั้งค่าใบเสนอราคา + ผู้รับผิดชอบ: * แดงเฉพาะช่องบังคับ · ชื่อผู้รับผิดชอบเว้นวรรคล้วน = ฟ้อง", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตั้งค่าใบเสนอราคา" }).first().click();
  for (const ชื่อ of ["ภาษีมูลค่าเพิ่ม %", "อายุใบเสนอราคา (วัน)"]) await ดาวแดง(page.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);
  for (const ชื่อ of ["ภาษีหัก ณ ที่จ่าย %", "% บวกตั้งต้น", "หัวเอกสาร"]) await ไม่มีดาว(page.locator("label").filter({ hasText: ชื่อ }).first(), ชื่อ);

  await page.getByRole("button", { name: "ผู้รับผิดชอบ" }).first().click();
  await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
  await ดาวแดง(page.locator("label").filter({ hasText: "ชื่อ-นามสกุล" }).first(), "ชื่อ-นามสกุล");
  for (const ชื่อ of ["ตำแหน่ง", "อีเมล"]) await ไม่มีดาว(page.locator("label").filter({ hasText: new RegExp(`^${ชื่อ}`) }).first(), ชื่อ);
  const ชื่อ = page.getByPlaceholder("เช่น สมชาย เชียงใหม่");
  await ชื่อ.fill("   ");
  const ปุ่ม = page.locator("button.btn-primary.btn-md").filter({ hasText: /เพิ่ม|บันทึก/ }).last();
  await expect(ปุ่ม, "ปุ่มต้องกดได้ — กดแล้วบอกว่าขาดอะไร (ไม่ใช่ปุ่มเทาเงียบ ๆ)").toBeEnabled();
  await ปุ่ม.click();
  await ฟ้องที่ช่อง(ชื่อ, "ชื่อ-นามสกุล");
  await page.waitForTimeout(1_500);
  const n = (await (await db(ส.บัญชี)).from("responsible_persons").select("id", { count: "exact", head: true }).eq("dealer_code", ส.รหัส)).count;
  expect(n, "ต้องไม่เพิ่มผู้รับผิดชอบ").toBe(0);
});
