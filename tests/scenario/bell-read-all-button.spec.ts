import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { adminClient } from "./testDealers";

// ── กระดิ่ง: "อ่านทั้งหมด" เป็นปุ่ม (บอสสั่ง 24 พ.ย. 69 ดู localhost — เดิมเป็นข้อความลิงก์สีน้ำเงิน) ──
//   <button> ขอบ/พื้นแบบเดียวกับปุ่ม "ดูทั้งหมด" ท้ายกล่อง · ไม่มีรายการยังไม่อ่าน = ปิดกดไม่ได้ · HQ และดีลเลอร์ใช้กระดิ่งตัวเดียวกัน
//   ดีลเลอร์ใช้สาขาของข้อเอง (กดอ่านทั้งหมดแล้วไม่กระทบบัญชีที่ข้ออื่นใช้ร่วม) · HQ ตรวจหน้าตา/สถานะปุ่มโดยไม่กด
//   ตกบนโค้ดเดิม: ปุ่มไม่มีขอบ (border none · พื้นโปร่ง) และกดได้แม้อ่านครบแล้ว
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

let A: สาขาของข้อ;
test.beforeAll(async () => {
  A = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const แท็ก = `${A.รหัส}-${Date.now()}`;
  const { error } = await adminClient().from("notifications").insert([1, 2].map(i => ({
    kind: "lead_from_hq", audience: "dealer", dealer_code: A.รหัส, title: `ZZTEST แจ้งเตือน ${i}`, body: "ZZTEST อ่านทั้งหมด",
    href: "/leads", dedupe_key: `zztest-read-all-${แท็ก}-${i}`,
  })));
  expect(error, "สร้างแจ้งเตือนของสาขาของข้อ").toBeNull();
});
test.afterAll(async () => { await A?.ลบ(); });   // ลบสาขา = แจ้งเตือนหายตาม (FK cascade)

const เปิดกระดิ่ง = async (page: Page) => {
  await page.getByRole("button", { name: "การแจ้งเตือน", exact: true }).click({ timeout: 25_000 });
  return page.locator("[data-notif-read-all]");
};
async function ตรวจหน้าตาปุ่ม(page: Page) {
  const ปุ่ม = page.locator("[data-notif-read-all]");
  await expect(ปุ่ม, "อ่านทั้งหมดเป็นปุ่ม").toHaveRole("button");
  await expect(ปุ่ม).toHaveText("อ่านทั้งหมด");
  const ทรง = await ปุ่ม.evaluate(e => { const s = getComputedStyle(e); return { ขอบ: s.borderTopStyle, หนา: s.borderTopWidth, พื้น: s.backgroundColor, มุม: s.borderTopLeftRadius }; });
  expect(ทรง, "ขอบ/พื้นแบบปุ่ม ไม่ใช่ข้อความลิงก์").toEqual({ ขอบ: "solid", หนา: "1px", พื้น: "rgb(255, 255, 255)", มุม: "9px" });
}

test("[ui·dealer] กระดิ่ง: อ่านทั้งหมดเป็นปุ่ม · กดแล้วอ่านครบ · ไม่มีที่ยังไม่อ่าน = ปิดกดไม่ได้", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", A.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-unread-count]"), "มีแจ้งเตือนยังไม่อ่าน 2 รายการ").toHaveAttribute("data-unread-count", "2", { timeout: 30_000 });
  const ปุ่ม = await เปิดกระดิ่ง(page);
  await ตรวจหน้าตาปุ่ม(page);
  await expect(ปุ่ม, "มีที่ยังไม่อ่าน = กดได้").toBeEnabled();
  await ปุ่ม.click();
  await expect(page.locator("[data-unread-dot]"), "กดแล้วไม่มีจุดยังไม่อ่าน").toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator("[data-unread-count]"), "ป้ายตัวเลขบนกระดิ่งหาย").toHaveCount(0);
  await expect(ปุ่ม, "อ่านครบแล้ว = ปิดกดไม่ได้").toBeDisabled();
});

test("[ui·hq] กระดิ่ง HQ: อ่านทั้งหมดเป็นปุ่มแบบเดียวกัน · สถานะกดได้ตรงกับจำนวนที่ยังไม่อ่าน", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "การแจ้งเตือน", exact: true })).toBeVisible({ timeout: 30_000 });
  const ปุ่ม = await เปิดกระดิ่ง(page);
  await ตรวจหน้าตาปุ่ม(page);
  // ไม่กด (บัญชี HQ ใช้ร่วมกับข้ออื่น) — สถานะปุ่มต้องตรงกับป้ายตัวเลขบนกระดิ่ง (มีป้าย = มีที่ยังไม่อ่าน)
  const มีที่ยังไม่อ่าน = (await page.locator("[data-unread-count]").count()) > 0;
  await expect(ปุ่ม, `ยังไม่อ่าน ${มีที่ยังไม่อ่าน ? "มี = กดได้" : "ไม่มี = ปิดกดไม่ได้"}`).toBeEnabled({ enabled: มีที่ยังไม่อ่าน });
});
