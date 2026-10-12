// ── เข้าระบบแทนดีลเลอร์ไม่สำเร็จ ต้องพากลับหน้าดีลเลอร์ของสำนักงานใหญ่ (บอสสั่ง 24 ส.ค. 69) ──
//
// ลิงก์เข้าระบบแทนใช้ได้ครั้งเดียวและมีอายุสั้น — กดช้า/กดซ้ำ = เจอ "Email link is invalid or has expired"
// เดิมหน้านี้มีแต่ลิงก์ "ไปหน้าเข้าสู่ระบบ" ของแอปดีลเลอร์ ซึ่งเป็นทางตันสำหรับผู้ดูแลสำนักงานใหญ่
// (เขาไม่มีรหัสของสาขานั้น) · ตอนนี้ต้องพากลับไปที่หน้าที่กดมาเสมอ
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { DEALER_ORIGIN } from "./funcHelpers";
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("ลิงก์เข้าระบบแทนหมดอายุ → พากลับหน้าดีลเลอร์ของสำนักงานใหญ่", async ({ page, context }) => {
  await openAs(page, ADMIN, "hq", "/hq/dealers");
  await settle(page);
  const เดิม = page.url();
  // จำลอง "แท็บที่ถูกเปิดจากหน้าสำนักงานใหญ่" ด้วย window.open จริง แล้วยัดใบผ่านปลอมเข้าไป
  const [แท็บใหม่] = await Promise.all([
    context.waitForEvent("page"),
    page.evaluate(o => { window.open(o + "/impersonate#th=zzinvalid-token", "_blank"); }, DEALER_ORIGIN),
  ]);
  await แท็บใหม่.waitForLoadState("domcontentloaded");
  await แท็บใหม่.waitForTimeout(2500);
  const ข้อความ = await แท็บใหม่.locator("body").innerText();
  console.log("หน้าจอที่เจอ:", ข้อความ.split("\n").filter(Boolean).join(" | ").slice(0, 160));
  expect(ข้อความ, "ต้องมีปุ่มกลับไปหน้าสำนักงานใหญ่").toContain("กลับไปหน้าดีลเลอร์ของสำนักงานใหญ่");
  // นับถอยหลังจบ → แท็บนี้ต้องปิดตัวเอง แล้วหน้าสำนักงานใหญ่ยังอยู่ที่เดิม
  await แท็บใหม่.waitForEvent("close", { timeout: 15_000 });
  console.log("แท็บปิดเอง · หน้าสำนักงานใหญ่ยังอยู่:", page.url() === เดิม ? "ใช่" : page.url());
  expect(page.url()).toBe(เดิม);
});
