import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors, waitRow } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── สร้างนัดจากปฏิทิน (FLOW D7 เปลี่ยน · ใบ 0274 · บอสสั่ง 3 พ.ย. 69) ─────────────────────────────────────────────────
//   ทางเข้า: ปุ่ม "+ นัดหมาย" · กดวันว่าง (เดือน) · กดช่องเวลา (สัปดาห์/วัน) — วันเวลาเติมตามที่กด
//   ฟอร์ม: ลีด/ลูกค้า (ค้นได้ · บังคับ · สาขาตัวเอง · ลีดที่ปิดแล้วไม่อยู่) · ประเภท 6 แบบเดิม · วันเวลา · สถานที่ · บันทึก · ผู้รับผิดชอบ
//   บันทึกด้วยตัวสร้างเดียวกับแผงลีด → แผงลีดเห็นนัด + ติ๊กงาน "นัดหมาย" + ประวัติ · นัดลูกค้าผูกลูกค้าอย่างเดียว
//   ไม่มีลีด/ลูกค้า = หน้าจอไม่ให้บันทึก และฐานปฏิเสธ (ยิงตรง) · ปฏิทิน/รายการข้าง ๆ อัปเดตทันที
//   ตกบนโค้ดก่อนใบ 0274: ปฏิทินไม่มีปุ่ม/ช่องให้ลงนัด · ไม่มีช่อง customer_id · นัดลอย ๆ บันทึกได้
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

let A: สาขาของข้อ, B: สาขาของข้อ;
const ฐานเลข = 1_978_000_000 + Math.floor(Math.random() * 400_000) * 10;
const ลีดA = () => `ZZTEST ปฏิทิน ${A.รหัส} ลีดเปิด`;
const ลีดปิดA = () => `ZZTEST ปฏิทิน ${A.รหัส} ลีดปิดแล้ว`;
const ลูกค้าA = () => `ZZTEST ปฏิทิน ${A.รหัส} ลูกค้า`;
const ลีดB = () => `ZZTEST ปฏิทิน ${B.รหัส} ลีดของอีกสาขา`;
const วันนี้ = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  A = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  B = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const sa = await db(A.บัญชี), sb = await db(B.บัญชี);
  const ลีด = (n: number, code: string, company: string, status: string) => ({ id: `#L-${n}`, num_id: n, dealer_code: code, company, name: company,
    contact: "ผู้ทดสอบ", phone: "000-000-0401", province: "ตราด", status });
  expect((await sa.from("leads").insert([ลีด(ฐานเลข, A.รหัส, ลีดA(), "BULLET"), ลีด(ฐานเลข + 1, A.รหัส, ลีดปิดA(), "CANCELLED")])).error, "ลีดของ A").toBeNull();
  expect((await sb.from("leads").insert(ลีด(ฐานเลข + 2, B.รหัส, ลีดB(), "BULLET"))).error, "ลีดของ B").toBeNull();
  expect((await sa.from("customers").insert({ id: ฐานเลข + 3, dealer_code: A.รหัส, name: "คุณลูกค้า", company: ลูกค้าA(), province: "ตราด",
    phone: "000-000-0402", join_date: วันนี้() })).error, "ลูกค้าของ A").toBeNull();
});
test.afterAll(async () => { await A?.ลบ(); await B?.ลบ(); });

const ฟอร์ม = (page: Page) => page.getByRole("dialog", { name: "นัดหมายใหม่" });
async function เข้าปฏิทิน(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", A.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/calendar`, { waitUntil: "domcontentloaded" });
  await settle(page);
}

test("[D7] [ui·dealer] ทางเข้า 3 ทาง เติมวันเวลาตามที่กด · ค้นได้เฉพาะลีดเปิด/ลูกค้าของสาขาตัวเอง · ไม่เลือก = บันทึกไม่ได้", async ({ page }) => {
  const errs = watchErrors(page);
  await เข้าปฏิทิน(page);
  // ปุ่ม + นัดหมาย = วันที่เลือก (วันนี้) 09:00
  await page.getByRole("button", { name: "นัดหมาย", exact: true }).click();
  await expect(ฟอร์ม(page)).toBeVisible({ timeout: 15_000 });
  await expect(ฟอร์ม(page).locator("#na-date")).toHaveValue(วันนี้());
  await expect(ฟอร์ม(page).locator("#na-time")).toHaveValue("09:00");
  // ประเภท 6 แบบเดิม
  await expect(ฟอร์ม(page).locator("#na-type option:not([value=''])")).toHaveText(["นัดพบลูกค้า", "นัดนำเสนอสินค้า", "นำเสนอราคา", "เซ็นสัญญาซื้อขาย", "ปิดการขาย", "โทรติดตาม"]);
  // ไม่เลือกลีด/ลูกค้า = บันทึกไม่ได้
  await ฟอร์ม(page).locator("#na-type").selectOption("visit");
  await ฟอร์ม(page).getByRole("button", { name: "บันทึกนัดหมาย" }).click();
  await expect(ฟอร์ม(page).getByRole("alert")).toHaveText("ต้องเลือกลูกค้าเป้าหมายหรือลูกค้า");
  // ค้นได้เฉพาะของสาขาตัวเอง · ลีดที่ปิดแล้วไม่อยู่
  const ผล = ฟอร์ม(page).getByRole("list", { name: "ผลค้นหาลูกค้าเป้าหมายและลูกค้า" });
  await ฟอร์ม(page).locator("#na-search").fill(ลีดB());
  await expect(ผล.getByRole("button"), "ลีดของสาขาอื่นไม่อยู่ในผลค้น").toHaveCount(0);
  await ฟอร์ม(page).locator("#na-search").fill(ลีดปิดA());
  await expect(ผล.getByRole("button"), "ลีดที่ปิดแล้วไม่อยู่ในผลค้น").toHaveCount(0);
  await ฟอร์ม(page).locator("#na-search").fill(`ZZTEST ปฏิทิน ${A.รหัส}`);
  await expect(ผล.getByRole("button"), "ลีดเปิด + ลูกค้าของสาขาตัวเอง").toHaveCount(2);
  await ฟอร์ม(page).getByRole("button", { name: "ปิด" }).click();

  // เดือน: กดวันว่าง = ฟอร์มวันนั้น
  const วันว่าง = page.locator("[data-empty-day='1']").last();
  const วันที่ว่าง = await วันว่าง.getAttribute("data-day");
  await วันว่าง.click();
  await expect(ฟอร์ม(page).locator("#na-date"), "กดวันว่าง → วันที่ตามที่กด").toHaveValue(วันที่ว่าง!);
  await ฟอร์ม(page).getByRole("button", { name: "ปิด" }).click();

  // สัปดาห์: กดช่องเวลา = วัน + เวลานั้น
  await page.getByRole("button", { name: "สัปดาห์", exact: true }).click();
  await page.locator(`[data-slot="${วันนี้()}T14:00"] button`).click();
  await expect(ฟอร์ม(page).locator("#na-date")).toHaveValue(วันนี้());
  await expect(ฟอร์ม(page).locator("#na-time"), "กดช่องเวลา → เวลาตามที่กด").toHaveValue("14:00");
  await ฟอร์ม(page).getByRole("button", { name: "ปิด" }).click();

  // วัน: กดช่องเวลา
  await page.getByRole("button", { name: "วัน", exact: true }).click();
  await page.locator(`[data-slot="${วันนี้()}T16:00"] button`).click();
  await expect(ฟอร์ม(page).locator("#na-time")).toHaveValue("16:00");
  assertNoErrors(errs, "ทางเข้าสร้างนัดจากปฏิทิน");
});

test("[D7] [flow·dealer] นัดจากปฏิทิน → แผงลีดเห็นนัด + งานนัดหมายติ๊กเอง + ประวัติ · นัดลูกค้าผูกลูกค้าอย่างเดียว · ปฏิทินอัปเดตทันที", async ({ page }) => {
  const errs = watchErrors(page);
  const sa = await db(A.บัญชี);
  await เข้าปฏิทิน(page);
  await page.getByRole("button", { name: "สัปดาห์", exact: true }).click();
  await page.locator(`[data-slot="${วันนี้()}T14:00"] button`).click();
  await ฟอร์ม(page).locator("#na-search").fill(ลีดA());
  await ฟอร์ม(page).getByRole("list", { name: "ผลค้นหาลูกค้าเป้าหมายและลูกค้า" }).getByRole("button", { name: new RegExp(ลีดA()) }).click();
  await ฟอร์ม(page).locator("#na-type").selectOption("visit");
  await ฟอร์ม(page).locator("#na-location").fill("ZZTEST หน้างานตราด");
  await ฟอร์ม(page).locator("#na-note").fill("ZZTEST นัดจากปฏิทิน");
  await ฟอร์ม(page).getByRole("button", { name: "บันทึกนัดหมาย" }).click();
  await expect(ฟอร์ม(page)).toHaveCount(0, { timeout: 15_000 });
  // ปฏิทินอัปเดตทันที (ไม่รีเฟรช)
  await expect(page.locator(`[data-slot="${วันนี้()}T14:00"]`).getByText(ลีดA()), "ช่องเวลาขึ้นนัดทันที").toBeVisible({ timeout: 15_000 });
  const นัด = await waitRow<{ lead_id: number | null; customer_id: number | null; location: string; type: string }>(sa, "appointments", { dealer_code: A.รหัส, note: "ZZTEST นัดจากปฏิทิน" }, 20_000);
  expect(นัด.lead_id, "ผูกลีดที่เลือก").toBe(ฐานเลข);
  expect(นัด.customer_id, "นัดของลีดไม่ผูกลูกค้า").toBeNull();
  expect(นัด.location, "สถานที่").toBe("ZZTEST หน้างานตราด");
  // ตัวสร้างเดียวกับแผงลีด: ฐานติ๊กงานนัดหมาย + จดประวัติ
  await expect.poll(async () => {
    const { data } = await sa.from("leads").select("tasks, activities").eq("dealer_code", A.รหัส).eq("num_id", ฐานเลข).single();
    const t = ((data?.tasks ?? []) as { key: string; label?: string; done?: boolean }[]).find(x => x.key === "appointment" || /นัด/.test(x.label ?? ""));
    return { ติ๊ก: !!t?.done, ประวัติ: JSON.stringify(data?.activities ?? []).includes(`นัดหมาย ${วันนี้()} 14:00 น.`) };
  }, { timeout: 20_000 }).toEqual({ ติ๊ก: true, ประวัติ: true });
  // แผงลีดเห็นนัด
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ลีดA());
  await page.locator("tbody tr").filter({ hasText: ลีดA() }).first().getByTitle("ดูรายละเอียด").click({ timeout: 20_000 });
  await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click();
  await expect(page.getByText("ZZTEST นัดจากปฏิทิน").first(), "แผงลีดเห็นนัดที่ลงจากปฏิทิน").toBeVisible({ timeout: 20_000 });

  // นัดของลูกค้า: ผูกลูกค้าอย่างเดียว ไม่ผูกลีดให้เอง
  await page.goto(`${DEALER_ORIGIN}/calendar`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "นัดหมาย", exact: true }).click();
  await ฟอร์ม(page).locator("#na-search").fill(ลูกค้าA());
  await ฟอร์ม(page).getByRole("list", { name: "ผลค้นหาลูกค้าเป้าหมายและลูกค้า" }).getByRole("button", { name: new RegExp(ลูกค้าA()) }).click();
  await expect(ฟอร์ม(page).locator("[data-picked='customer']")).toBeVisible();
  await ฟอร์ม(page).locator("#na-type").selectOption("follow_up");
  await ฟอร์ม(page).locator("#na-note").fill("ZZTEST นัดลูกค้าจากปฏิทิน");
  await ฟอร์ม(page).getByRole("button", { name: "บันทึกนัดหมาย" }).click();
  const นัดลูกค้า = await waitRow<{ lead_id: number | null; customer_id: number | null }>(sa, "appointments", { dealer_code: A.รหัส, note: "ZZTEST นัดลูกค้าจากปฏิทิน" }, 20_000);
  expect(นัดลูกค้า.customer_id).toBe(ฐานเลข + 3);
  expect(นัดลูกค้า.lead_id, "ไม่ผูกลีดล่าสุดให้เอง").toBeNull();
  assertNoErrors(errs, "สร้างนัดจากปฏิทิน");
});

test("[D7] [db] ไม่มีลีด/ลูกค้า = ฐานปฏิเสธ · A ผูกลีดของ B ไม่ได้ (ยิงตรง)", async () => {
  const sa = await db(A.บัญชี);
  const เลข = async () => Number((await sa.rpc("next_entity_id", { p_dealer: A.รหัส, p_entity: "appointments" })).data);
  const ลอย = await sa.from("appointments").insert({ id: await เลข(), dealer_code: A.รหัส, company: "ZZTEST ลอย", date: วันนี้(), time: "10:00", type: "visit", status: "upcoming" });
  expect(ลอย.error?.message ?? "", "ไม่มีลีด/ลูกค้า = ปฏิเสธ").toMatch(/appointment_link/);
  const ข้าม = await sa.from("appointments").insert({ id: await เลข(), dealer_code: A.รหัส, lead_id: ฐานเลข + 2, company: "ZZTEST ข้ามสาขา", date: วันนี้(), time: "10:00", type: "visit", status: "upcoming" });
  expect(ข้าม.error, "ลีดของสาขา B = ปฏิเสธ").not.toBeNull();
});
