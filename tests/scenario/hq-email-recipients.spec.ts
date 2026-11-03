import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { ถือแถวกลางชดเวลา } from "./sharedRowLock";

// ── ตั้งค่า › การแจ้งเตือน: รายชื่อผู้รับอีเมลแจ้งเตือนของสำนักงานใหญ่ (ด่าน 1 · ใบ 0193) ─────────────────
// ผู้รับฝั่ง HQ ของ "คำขอใหม่ · เกิน 14 วัน · ยกเลิก · ขอแก้ราคา" มาจากรายชื่อนี้ ไม่ใช่อีเมลรายคน (ข้อตัดสิน 14 ต.ค. 69)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });

const admin = adminClient();
let เดิม: string[] = [];
let ปล่อยแถว = () => {};
test.beforeAll(async () => {
  // ผู้รับอีเมล HQ เป็นแถวเดียวทั้งระบบ — 3 ไฟล์ตั้งค่าแถวนี้ (email-outbox-cron · hq-email-recipients · quote-request-flow) ต่อคิวกัน
  ปล่อยแถว = await ถือแถวกลางชดเวลา(test, "hq_notif_rules");
  const { data } = await admin.from("hq_notif_rules").select("email_recipients").eq("id", 1).single();
  เดิม = (data?.email_recipients as string[]) ?? [];
  await admin.from("hq_notif_rules").update({ email_recipients: [] }).eq("id", 1);
});
test.afterAll(async () => { await admin.from("hq_notif_rules").update({ email_recipients: เดิม }).eq("id", 1); ปล่อยแถว(); });

const อ่าน = async () => ((await admin.from("hq_notif_rules").select("email_recipients").eq("id", 1).single()).data?.email_recipients as string[]) ?? [];

async function เปิดแท็บแจ้งเตือน(page: import("@playwright/test").Page) {
  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await page.locator(".tab-bar").getByRole("button", { name: "การแจ้งเตือน" }).click();
  const การ์ด = page.locator(".card").filter({ hasText: "อีเมลผู้รับแจ้งเตือน" }).first();
  await expect(การ์ด).toBeVisible({ timeout: 15_000 });
  return การ์ด;
}

// ใบ 0274 (บอสสั่ง 3 พ.ย. 69): รายชื่อเป็นรายการ "+ เพิ่มอีเมล" ทีละอีเมล (เดิมช่องพิมพ์หลายบรรทัด) — กติกาเดิมครบ: ตัดช่องว่าง · ตัวเล็ก · ไม่ซ้ำ
const เพิ่มอีเมล = async (การ์ด: import("@playwright/test").Locator, e: string) => {
  await การ์ด.getByRole("textbox", { name: "เพิ่มอีเมลผู้รับแจ้งเตือน" }).fill(e);
  await การ์ด.getByRole("button", { name: "เพิ่มอีเมล" }).click();
};
test("[hq] ตั้งผู้รับอีเมลแจ้งเตือนได้ — บันทึกลงฐาน ตัดช่องว่าง ตัดซ้ำ ทำเป็นตัวเล็ก", async ({ page }) => {
  const การ์ด = await เปิดแท็บแจ้งเตือน(page);
  await expect(การ์ด.getByTestId("no-recipients")).toContainText("ยังไม่มีผู้รับ");
  await เพิ่มอีเมล(การ์ด, "  Boss@Example.test ");
  await เพิ่มอีเมล(การ์ด, "sales@example.test");
  await เพิ่มอีเมล(การ์ด, "boss@example.test");
  await expect(การ์ด.getByRole("alert").filter({ hasText: "อยู่ในรายชื่อแล้ว" }), "ซ้ำ = ไม่เพิ่ม").toBeVisible();
  await expect(การ์ด.getByRole("list", { name: "อีเมลผู้รับแจ้งเตือน" }).locator("[data-recipient]")).toHaveCount(2);
  await page.getByRole("button", { name: /^บันทึก/ }).first().click();
  await expect.poll(อ่าน, { timeout: 15_000 }).toEqual(["boss@example.test", "sales@example.test"]);
});

test("[hq] ที่อยู่ที่ไม่ใช่อีเมล → บอกว่าบรรทัดไหนผิด และไม่บันทึก", async ({ page }) => {
  const การ์ด = await เปิดแท็บแจ้งเตือน(page);
  await เพิ่มอีเมล(การ์ด, "ไม่ใช่อีเมล");
  await expect(การ์ด.getByText(/ไม่ใช่อีเมล.*รูปแบบ|รูปแบบอีเมล/)).toBeVisible();
  await expect(การ์ด.getByRole("list", { name: "อีเมลผู้รับแจ้งเตือน" }).locator("[data-recipient]"), "ค่าที่ผิดไม่ถูกเพิ่ม").toHaveCount(2);
  // ค่าที่ผิดไม่ถูกนำเข้าร่างเลย → ไม่มีอะไรเปลี่ยน ปุ่มบันทึกจึงกดไม่ได้
  await expect(page.getByRole("button", { name: /^บันทึก/ }).first(), "ค่าที่ผิดต้องบันทึกไม่ได้").toBeDisabled();
  expect(await อ่าน(), "ค่าในฐานต้องเป็นค่าเดิมจากข้อก่อนหน้า").toEqual(["boss@example.test", "sales@example.test"]);
});
