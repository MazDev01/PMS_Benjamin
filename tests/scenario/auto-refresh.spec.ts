// ── กดในแผงแล้วหน้าอัปเดตเอง ไม่ต้องรีเฟรช (บอสสั่ง 3 พ.ย. 69 "กดขอไปแล้วให้รีเฟรชอัตโนมัติ") ──────────────────────────────
//   ดีลเลอร์: ส่งคำขอราคาในแผงลีด → แถวลีดในตาราง (ป้ายขั้น) + การ์ด "ขอราคา HQ" เปลี่ยนทันที · ยกเลิกคำขอ → กลับ
//   HQ: ส่งใบ HQ ในหน้าคำขอใบเสนอราคา (ตาราง + แท็บต้องตีราคา/ประวัติ) → ตัวนับแท็บ/การ์ดเปลี่ยนทันที
//   ทุกข้อไม่ reload หน้า · ไม่พึ่งการถามซ้ำถี่ ๆ (อัปเดตผ่านทางกลางของระบบ)
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน, แท็บมุมมองคำขอ, เปิดใบHQในกล่องงาน } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });
test.setTimeout(240_000);

let ส: สาขาของข้อ;
const เลข = 1_970_000_000 + Math.floor(Math.random() * 400_000) * 10;
const บริษัท = () => `ZZTEST รีเฟรชเอง ${ส.รหัส}`;

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const r = await (await db(ส.บัญชี)).from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: บริษัท(), name: บริษัท(),
    contact: "ผู้ทดสอบ", phone: "000-000-0201", province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด });
  expect(r.error, "สร้างลีดของข้อ").toBeNull();
});
test.afterAll(async () => { if (ส) ล้างใบHQทดสอบ(ส.รหัส, [เลข]); await ส?.ลบ(); });

/** นับการโหลดหน้าใหม่ — ข้อนี้ต้องอัปเดตโดยไม่ reload */
function นับการโหลดหน้า(page: Page) {
  const นับ = { n: 0 };
  page.on("framenavigated", f => { if (f === page.mainFrame()) นับ.n++; });
  return นับ;
}
const ค่าการ์ด = (page: Page, kpi: string) => page.locator(`[data-kpi-row] [data-kpi="${kpi}"] [data-value]`).first();
const แถว = (page: Page) => page.locator("tbody tr").filter({ hasText: บริษัท() }).first();

test("[ux·dealer] ส่งคำขอราคาในแผง → แถวในตาราง + การ์ดเปลี่ยนเองทันที · ยกเลิก → กลับ (ไม่ reload)", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท());
  await expect(แถว(page).locator("[data-stage-label]"), "เริ่มที่ขั้นข้อมูลลูกค้า").toHaveAttribute("data-stage-no", "1", { timeout: 25_000 });
  await expect(ค่าการ์ด(page, "hq-pricing"), "การ์ดขอราคา HQ เริ่มที่ 0").toHaveAttribute("data-value", "0", { timeout: 20_000 });

  const โหลด = นับการโหลดหน้า(page);
  await แถว(page).getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  const แผง = page.locator("[data-panel='quote-request']");
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect(แผง.getByText("ใหม่", { exact: true }), "แผงเห็นคำขอใหม่").toBeVisible({ timeout: 20_000 });

  // ข้างหลังแผง: ตารางและการ์ดเปลี่ยนเอง
  await expect(แถว(page).locator("[data-stage-label]"), "แถวลีดเปลี่ยนเป็นขั้นขอราคา HQ เอง").toHaveAttribute("data-stage-no", "2", { timeout: 15_000 });
  await expect(ค่าการ์ด(page, "hq-pricing"), "การ์ดขอราคา HQ เปลี่ยนเอง").toHaveAttribute("data-value", "1", { timeout: 15_000 });

  // ยกเลิกคำขอ → กลับขั้นข้อมูลลูกค้า · การ์ดกลับ 0
  await แผง.getByRole("button", { name: "ยกเลิกคำขอ" }).click();
  await page.locator("[data-reason-dialog]").getByRole("textbox").fill("ZZTEST ลูกค้าขอเลื่อน");
  await page.locator("[data-reason-dialog]").getByRole("button", { name: "ยืนยันยกเลิก" }).click();
  await expect(แถว(page).locator("[data-stage-label]"), "ยกเลิกแล้วแถวกลับขั้นข้อมูลลูกค้าเอง").toHaveAttribute("data-stage-no", "1", { timeout: 15_000 });
  await expect(ค่าการ์ด(page, "hq-pricing"), "ยกเลิกแล้วการ์ดกลับเอง").toHaveAttribute("data-value", "0", { timeout: 15_000 });
  expect(โหลด.n, "ไม่ได้โหลดหน้าใหม่").toBe(0);
  assertNoErrors(errs, "ดีลเลอร์อัปเดตเอง");
});

test("[ux·hq] ส่งใบ HQ ในหน้าคำขอ → ตัวนับแท็บ + การ์ดเปลี่ยนเอง (ไม่ reload)", async ({ page }) => {
  // หน้าคำขอใบเสนอราคาแบบตาราง (บอสสั่ง 6 พ.ย. 69) + แท็บ "ต้องตีราคา" / "ประวัติคำขอ" (บอสสั่ง 9 พ.ย. 69 · แทนแท็บกลุ่มเดิม)
  //   ส่งใบ HQ แล้ว: แท็บต้องตีราคา −1 · แท็บประวัติ +1 · การ์ด "ต้องตีราคา" −1 — ทั้งหมดโดยไม่โหลดหน้าใหม่
  const errs = watchErrors(page);
  const sb = await db(ส.บัญชี);
  expect((await sb.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดัง" })).error, "ดีลเลอร์ส่งคำขอ").toBeNull();
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const นับแท็บ = async (k: "main" | "history") => Number(await แท็บมุมมองคำขอ(page, k).getAttribute("data-count"));
  const นับการ์ด = async () => Number(await ค่าการ์ด(page, "todo").getAttribute("data-value"));
  await expect(แท็บมุมมองคำขอ(page, "main"), "หน้าเปิดมาที่แท็บต้องตีราคา").toHaveAttribute("aria-selected", "true");
  await expect(แท็บมุมมองคำขอ(page, "main")).not.toHaveAttribute("data-count", "", { timeout: 20_000 });
  await expect(ค่าการ์ด(page, "todo")).not.toHaveAttribute("data-value", "", { timeout: 20_000 });
  const ก่อน = { main: await นับแท็บ("main"), history: await นับแท็บ("history"), การ์ด: await นับการ์ด() };
  expect(ก่อน.main, "คำขอของข้อนี้อยู่ในต้องตีราคา").toBeGreaterThanOrEqual(1);
  expect(ก่อน.การ์ด, "การ์ดต้องตีราคา = แท็บต้องตีราคา").toBe(ก่อน.main);
  const โหลด = นับการโหลดหน้า(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, บริษัท());
  await ใบ.getByLabel("ชื่อรายการ 1").fill("โครงเหล็ก");
  await ใบ.getByLabel("หน่วย 1", { exact: true }).selectOption("ชุด");
  await ใบ.getByLabel("ต้นทุนต่อหน่วย 1").fill("100000");
  await ใบ.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect(ใบ.getByText(/ส่งให้ดีลเลอร์แล้ว/), "ใบล็อกแล้ว").toBeVisible({ timeout: 20_000 });
  await ใบ.getByRole("button", { name: "ปิด" }).click();
  await expect(ใบ).toBeHidden();
  await page.getByLabel("ค้นหาคำขอ").fill("");
  await expect.poll(() => นับแท็บ("main"), { timeout: 15_000, message: "แท็บต้องตีราคา ลดเอง" }).toBe(ก่อน.main - 1);
  await expect.poll(() => นับการ์ด(), { timeout: 15_000, message: "การ์ดต้องตีราคา ลดเอง" }).toBe(ก่อน.การ์ด - 1);
  await expect.poll(() => นับแท็บ("history"), { timeout: 15_000, message: "แท็บประวัติคำขอ เพิ่มเอง" }).toBe(ก่อน.history + 1);
  expect(โหลด.n, "ไม่ได้โหลดหน้าใหม่").toBe(0);
  assertNoErrors(errs, "HQ อัปเดตเอง");
});
