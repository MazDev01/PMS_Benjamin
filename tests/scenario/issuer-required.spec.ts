import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";
import { DEALER_ORIGIN, db, loginUI, ไปแผงลีดจากแถวใบ } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ดีลเลอร์ส่ง/พิมพ์ใบให้ลูกค้าไม่ได้จนกว่ากรอกข้อมูลบริษัทครบ (บอสสั่ง · ใบ 0247) ─────────────────────────────────────
//   ครบ = ชื่อบริษัท · ที่อยู่ · เลขผู้เสียภาษี · กันที่ฐาน (ตัวดักบนตาราง + คำสั่งขอข้อมูลพิมพ์) ไม่ใช่แค่ปิดปุ่ม
//   ปุ่มที่ถูกกันต้องบอกเหตุผล + ลิงก์ไปหน้าตั้งค่าบริษัท · ใบร่างยังสร้าง/แก้ได้ · กรอกครบแล้วส่ง/พิมพ์ได้ + ฐานจดเวลาพิมพ์
//   ข้อที่ต้องตกบนโค้ดก่อนใบ 0247: ปุ่มส่งไม่ถูกปิด/ไม่มีป้าย · ฐานยอมให้ส่ง · ไม่มีคำสั่งขอข้อมูลพิมพ์
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const admin = adminClient();
const รหัสสาขา = "ZZIR";   // สาขาของชุดนี้เอง — แก้ข้อมูลบริษัทได้โดยไม่กระทบชุดอื่นที่รันพร้อมกัน
let สาขา: บัญชีสาขาของชุด;
let ใบHQ: ใบHQพร้อมใช้ | undefined;
const ข้อมูลครบ = { company: "ZZTEST บริษัทข้อมูลครบ จำกัด", address: "ZZTEST ที่อยู่ครบ ระยอง", phone: "000-000-0000", taxId: "0000000000000" };

test.beforeAll(async () => { สาขา = await สร้างสาขาของชุด(รหัสสาขา, "ระยอง"); });
test.afterAll(async () => {
  expect(await ลบสาขาของชุด(รหัสสาขา, ใบHQ ? [ใบHQ.leadNum] : []), `เก็บกวาดสาขา ${รหัสสาขา}`).toEqual([]);
});

const ตั้งข้อมูลบริษัท = async (issuer: Record<string, string>) => {
  const r = await admin.from("dealer_settings").upsert({ dealer_code: รหัสสาขา, issuer }, { onConflict: "dealer_code" });
  expect(r.error?.message ?? "", "ตั้งข้อมูลบริษัททดสอบ").toBe("");
};
const สถานะใบ = async (id: string) =>
  (await admin.from("quotations").select("status").eq("dealer_code", รหัสสาขา).eq("id", id).single()).data?.status as string | undefined;

/** เปิดแผงลีดของใบ (หน้าใบเสนอราคา → กดแถว → แผงลีด) */
async function เปิดแผงของใบ(page: Page, id: string) {
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(id);
  const แถว = page.locator("tbody tr").filter({ hasText: id }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await ไปแผงลีดจากแถวใบ(แถว);  // 28 ต.ค. 69: กดแถว = แผงดูใบในหน้าเดิม → ปุ่ม "ไปแผงลีด"
  await page.waitForURL(/\/leads/, { timeout: 25_000 });
}

test("[func·dealer] ข้อมูลบริษัทไม่ครบ: ส่ง/พิมพ์ไม่ได้ทั้งหน้าเว็บและฐาน · ใบร่างยังทำได้ · กรอกครบแล้วส่ง/พิมพ์ได้", async ({ page }) => {
  // ข้อมูลบริษัทเหมือนตอน HQ สร้างดีลเลอร์ใหม่ — มีแต่ชื่อบริษัท
  await ตั้งข้อมูลบริษัท({ company: "ZZTEST บริษัทยังไม่ครบ", address: "", phone: "", taxId: "" });
  ใบHQ = await เตรียมใบHQ(สาขา, { dealerCode: รหัสสาขา, company: `ZZTEST-ข้อมูลบริษัท-${Date.now() % 100000}`, province: "ระยอง",
    lines: [{ name: "ZZTEST โครงหลัก", qty: 2, unit: "ชุด", unitCost: 1000 }] });
  // ใบร่างยังสร้างได้ตามปกติ
  const ใบ = await ทำใบลูกค้าจากใบHQ(สาขา, ใบHQ, { customer: "ZZTEST ลูกค้าข้อมูลบริษัท", markupPercent: 10 });
  expect(await สถานะใบ(ใบ.id), "ใบร่างสร้างได้แม้ข้อมูลบริษัทยังไม่ครบ").toBe("draft");

  // ── ฐานกัน (ไม่ผ่านหน้าเว็บ) ──
  const sb = await db(สาขา);
  const ส่ง = await sb.rpc("quotation_send", { p_dealer: รหัสสาขา, p_id: ใบ.id });
  expect(ส่ง.error?.message ?? "", "ฐาน: คำสั่งส่งใบถูกปฏิเสธ").toMatch(/issuer_incomplete.*ที่อยู่ · เลขผู้เสียภาษี/);
  const ตรง = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", รหัสสาขา).eq("id", ใบ.id);
  expect(ตรง.error?.message ?? "", "ฐาน: เปลี่ยนสถานะที่ตารางตรง ๆ ก็ถูกปฏิเสธ").toMatch(/issuer_incomplete/);
  const พิมพ์ = await sb.rpc("quotation_print_data", { p_dealer: รหัสสาขา, p_id: ใบ.id });
  expect(พิมพ์.error?.message ?? "", "ฐาน: ขอข้อมูลพิมพ์ถูกปฏิเสธ").toMatch(/issuer_incomplete/);
  expect(await สถานะใบ(ใบ.id), "ใบยังเป็นร่าง").toBe("draft");

  // ── หน้าเว็บ: ปุ่มส่งในกล่องขั้นต่อไปถูกปิด + บอกเหตุผล + ลิงก์ไปกรอก ──
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา);
  await เปิดแผงของใบ(page, ใบ.id);
  const กล่อง = page.getByRole("status", { name: "ขั้นต่อไป" });
  const ปุ่มส่ง = กล่อง.getByRole("button", { name: /ส่งให้ลูกค้า/ });
  await expect(ปุ่มส่ง, "ปุ่มส่งให้ลูกค้าถูกปิด").toBeDisabled({ timeout: 25_000 });
  const ป้าย = กล่อง.locator("[data-issuer-guard]");
  await expect(ป้าย, "บอกเหตุผล: ยังขาดที่อยู่ + เลขผู้เสียภาษี").toContainText("ยังขาด: ที่อยู่ · เลขผู้เสียภาษี");
  await expect(ป้าย.getByRole("link", { name: "ไปกรอกข้อมูลบริษัท" }), "มีลิงก์ไปหน้าตั้งค่าบริษัท").toHaveAttribute("href", "/settings");

  // แท็บใบเสนอราคา: เปิดดูใบ → ปุ่มพิมพ์ถูกปิด + ป้ายบอกเหตุผล
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.locator(`[data-quote-item="${ใบ.id}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
  await expect(page.locator("[data-print-quote]"), "ปุ่มพิมพ์ถูกปิด").toBeDisabled({ timeout: 15_000 });
  await expect(page.locator("[data-issuer-guard]").filter({ hasText: "พิมพ์ใบให้ลูกค้าไม่ได้" }), "ป้ายบอกเหตุผลตอนพิมพ์").toBeVisible();

  // ลิงก์พาไปหน้ากรอกข้อมูลบริษัทจริง
  await page.locator("[data-issuer-guard]").getByRole("link", { name: "ไปกรอกข้อมูลบริษัท" }).first().click();
  await page.waitForURL(/\/settings$/, { timeout: 20_000 });
  await expect(page.getByText("ข้อมูลบริษัท (ออกในนามดีลเลอร์)"), "ลิงก์พาไปส่วนกรอกข้อมูลบริษัท").toBeVisible({ timeout: 20_000 });

  // ── กรอกครบ → ส่งได้ + พิมพ์ได้ + ฐานจดเวลาพิมพ์ ──
  await ตั้งข้อมูลบริษัท(ข้อมูลครบ);
  await เปิดแผงของใบ(page, ใบ.id);
  await expect(page.locator("[data-issuer-guard]"), "ข้อมูลครบแล้วไม่มีป้ายกัน").toHaveCount(0, { timeout: 25_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.locator(`[data-quote-item="${ใบ.id}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
  const ปุ่มพิมพ์ = page.locator("[data-print-quote]");
  await expect(ปุ่มพิมพ์, "ข้อมูลครบ = พิมพ์ได้").toBeEnabled({ timeout: 15_000 });
  const [หน้าพิมพ์] = await Promise.all([page.waitForEvent("popup"), ปุ่มพิมพ์.click()]);
  await expect(หน้าพิมพ์.getByText(ข้อมูลครบ.company).first(), "หัวกระดาษ = ข้อมูลบริษัทจากฐาน").toBeVisible({ timeout: 20_000 });
  await expect(หน้าพิมพ์.getByText(ข้อมูลครบ.taxId).first(), "หัวกระดาษมีเลขผู้เสียภาษี").toBeVisible();
  await หน้าพิมพ์.close();
  const บันทึก = await admin.from("quotation_prints").select("printed_at").eq("dealer_code", รหัสสาขา).eq("quote_id", ใบ.id);
  expect(บันทึก.data?.length ?? 0, "ฐานจดเวลาพิมพ์ 1 ครั้ง (ครั้งที่ถูกปฏิเสธไม่จด)").toBe(1);

  await page.getByRole("button", { name: "กลับ" }).click();
  const ส่งได้ = page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ });
  await expect(ส่งได้, "ข้อมูลครบ = ส่งได้").toBeEnabled({ timeout: 15_000 });
  await ส่งได้.click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(() => สถานะใบ(ใบ.id), { timeout: 25_000, message: "ส่งแล้วฐานเป็นส่งให้ลูกค้าแล้ว" }).toBe("sent_to_client");
});
