import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, waitRow } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ฟอร์มลีด · งานในแต่ละขั้น · ตัวกรองลีดที่ยังเปิดอยู่ (บอสสั่ง 28 ต.ค. 69 · FLOW D2 · D7 · /leads · /hq/leads) ─────────────
//   1) [D2] ฟอร์มเพิ่มลูกค้าเป้าหมายไม่มีช่อง "ขั้นตอน" · ลีดใหม่อยู่ขั้นข้อมูลลูกค้า (ฐานตั้งเอง ใบ 0256)
//   2) [D7] งานในแต่ละขั้นอยู่แท็บภาพรวม (ขั้นปัจจุบันเปิดไว้) · แท็บประวัติเหลือไทม์ไลน์อย่างเดียว ไม่มีรายการติ๊ก
//   3) หน้าลูกค้าเป้าหมาย (ดีลเลอร์ + HQ ทั้งเครือ) เปิดมาไม่เห็นลีดที่ปิดแล้ว · เลือก "ปิดสำเร็จ" แล้วเห็น
//   ตกบนโค้ดเดิม: ฟอร์มมีช่องขั้นตอน · งานอยู่แท็บประวัติ · ดีลเลอร์ไม่มีลีดปิดสำเร็จในหน้า · HQ ค่าเริ่มต้นแสดงทุกขั้น
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(180_000);

const admin = adminClient();
const แท็ก = Date.now() % 100_000;
const ลีดใหม่ = `ZZTEST-ฟอร์มไม่มีขั้น-${แท็ก}`;
const ลีดเปิด = `ZZTEST-งานในขั้น-${แท็ก}`;
const ลีดปิด = `ZZTEST-ปิดสำเร็จแล้ว-${แท็ก}`;
const เลขเปิด = เลขลูกค้าเป้าหมายทดสอบ();
const เลขปิด = เลขลูกค้าเป้าหมายทดสอบ();

test.beforeAll(async () => {
  // ลีดปิดสำเร็จ (ข้อมูลตั้งต้นด้วยกุญแจฝั่งเซิร์ฟเวอร์ — ทดสอบแค่การแสดงผลของตัวกรอง)
  const r = await admin.from("leads").insert([
    { id: `#L-${เลขเปิด}`, num_id: เลขเปิด, dealer_code: "RYG", company: ลีดเปิด, name: ลีดเปิด, contact: "ผู้ทดสอบ",
      phone: `08${String(เลขเปิด).slice(-8)}`, province: "ระยอง", status: "WAITING", assigned: "ทดสอบระบบ" },
    { id: `#L-${เลขปิด}`, num_id: เลขปิด, dealer_code: "RYG", company: ลีดปิด, name: ลีดปิด, contact: "ผู้ทดสอบ",
      phone: `08${String(เลขปิด).slice(-8)}`, province: "ระยอง", status: "PAID", assigned: "ทดสอบระบบ" },
  ]);
  expect(r.error, "ลีดทดสอบ").toBeNull();
});
test.afterAll(async () => {
  await admin.from("leads").delete().eq("dealer_code", "RYG").in("company", [ลีดใหม่, ลีดเปิด, ลีดปิด]);
});

test("[D2] [func·dealer] ฟอร์มเพิ่มลูกค้าเป้าหมายไม่มีช่องขั้นตอน · ลีดใหม่อยู่ขั้นข้อมูลลูกค้า", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await expect(ฟอร์ม).toBeVisible();
  await expect(ฟอร์ม.getByLabel("ขั้นตอน", { exact: true }), "ฟอร์มไม่มีช่องขั้นตอน (FLOW D2)").toHaveCount(0);
  await ฟอร์ม.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(ลีดใหม่);
  await ฟอร์ม.getByPlaceholder("ชื่อผู้ติดต่อ").fill("ผู้ทดสอบ");
  await ฟอร์ม.getByPlaceholder("0XX-XXX-XXXX").fill("000-000-0961");
  await ฟอร์ม.getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await ฟอร์ม.getByRole("button", { name: "บันทึก" }).click();
  const ลีด = await waitRow<{ status: string }>(await db(RYG), "leads", { company: ลีดใหม่ });
  expect(ลีด.status, "ลีดใหม่ = ขั้นข้อมูลลูกค้า (สถานะตั้งต้น)").toBe("WAITING");
});

test("[D7] [ux·dealer] งานในแต่ละขั้นอยู่แท็บภาพรวม (ขั้นปัจจุบันเปิดไว้) · แท็บประวัติไม่มีรายการติ๊ก", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first().fill(ลีดเปิด);
  await page.locator("tbody tr").filter({ hasText: ลีดเปิด }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click({ timeout: 20_000 });
  const งาน = page.locator("[data-lead-tasks]");
  await expect(งาน, "แท็บภาพรวมมีงานในแต่ละขั้น").toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("งานในแต่ละขั้น", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/ติ๊กไว้กันลืม/), "ตัดคำอธิบายเดิม").toHaveCount(0);
  await expect(งาน.locator('[data-task-step="1"]'), "ขั้นปัจจุบัน (ข้อมูลลูกค้า) เปิดไว้").toHaveAttribute("data-open", "1");
  await expect(งาน.locator('[data-task-step="3"]'), "ขั้นอื่นพับไว้").toHaveAttribute("data-open", "0");
  await expect(งาน.locator("section").first(), "หัวกลุ่มไม่มีเลขลำดับ").not.toContainText(/^\s*\d/);
  await page.getByRole("button", { name: "ประวัติ", exact: true }).first().click();
  const ประวัติ = page.locator('[data-tab-panel="history"]');
  await expect(ประวัติ).toBeVisible();
  await expect(ประวัติ.getByRole("checkbox"), "แท็บประวัติไม่มีรายการติ๊ก").toHaveCount(0);
  await expect(ประวัติ.locator("[data-lead-tasks]")).toHaveCount(0);
});

test("[ux·dealer] หน้าลูกค้าเป้าหมาย เปิดมาไม่เห็นลีดปิดแล้ว · เลือก ปิดสำเร็จ แล้วเห็น", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  const ค้นหา = page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first();
  await ค้นหา.fill(ลีดเปิด);
  await expect(page.locator("tbody tr").filter({ hasText: ลีดเปิด }).first(), "ลีดที่ยังเปิดอยู่แสดง").toBeVisible({ timeout: 20_000 });
  await ค้นหา.fill(ลีดปิด);
  await expect(page.getByText("ไม่พบลูกค้าเป้าหมาย").first(), "ตารางตอบผลค้นหาแล้ว").toBeVisible({ timeout: 15_000 });
  await expect(page.locator("tbody tr").filter({ hasText: ลีดปิด }), "ค่าเริ่มต้น = กำลังดำเนินการ ไม่เห็นลีดปิดสำเร็จ").toHaveCount(0);
  await page.getByLabel("ขั้นตอน", { exact: true }).selectOption({ label: "ปิดสำเร็จ" });
  await expect(page.locator("tbody tr").filter({ hasText: ลีดปิด }).first(), "เลือกปิดสำเร็จ แล้วเห็น").toBeVisible({ timeout: 15_000 });
  await ค้นหา.fill(ลีดเปิด);
  await expect(page.locator("tbody tr").filter({ hasText: ลีดเปิด }), "ปิดสำเร็จไม่มีลีดที่ยังเปิด").toHaveCount(0);
});

test("[ux·hq] ลูกค้าเป้าหมายทั้งเครือ เปิดมาไม่เห็นลีดปิดแล้ว · เลือก ปิดสำเร็จ แล้วเห็น", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ค้นหา = page.getByPlaceholder("ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…");
  await ค้นหา.fill(ลีดเปิด);
  await expect(page.locator("tbody tr").filter({ hasText: ลีดเปิด }).first(), "ลีดที่ยังเปิดอยู่แสดง").toBeVisible({ timeout: 20_000 });
  await ค้นหา.fill(ลีดปิด);
  await expect(page.getByText("ไม่พบลูกค้าเป้าหมาย").first(), "ตารางตอบผลค้นหาแล้ว").toBeVisible({ timeout: 15_000 });
  await expect(page.locator("tbody tr").filter({ hasText: ลีดปิด }), "ค่าเริ่มต้น = กำลังดำเนินการ ไม่เห็นลีดปิดสำเร็จ").toHaveCount(0);
  await page.getByLabel("ขั้นตอน", { exact: true }).selectOption({ label: "ปิดสำเร็จ" });
  await expect(page.locator("tbody tr").filter({ hasText: ลีดปิด }).first(), "เลือกปิดสำเร็จ แล้วเห็น").toBeVisible({ timeout: 15_000 });
});
