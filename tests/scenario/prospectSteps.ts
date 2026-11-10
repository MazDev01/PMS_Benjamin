import { expect, type Locator, type Page } from "@playwright/test";

// ── ขั้นผู้สนใจที่มีฟอร์ม (บอสสั่ง 5 พ.ย. 69 · บอร์ดลากได้ + ติ๊กงานในแผงใช้ทางเดียวกัน) ─────────────────────────────────────
//   ส่งข้อมูลบริษัทแล้ว = กล่องยืนยันการส่ง (P1) · นัดคุยแล้ว = ฟอร์มนัดคุย วันที่/เวลา/สถานที่ (P2) — ใช้ร่วมชุดในเครื่อง + prod-live

/** ติ๊ก "ส่งข้อมูลบริษัท" / ลากไปส่งข้อมูลบริษัทแล้ว → กดยืนยันในกล่อง */
export async function ยืนยันส่งข้อมูลบริษัท(page: Page) {
  const กล่อง = page.getByRole("alertdialog");
  await expect(กล่อง, "ขั้นส่งข้อมูลบริษัท = กล่องยืนยันการส่ง").toContainText("ส่งข้อมูลบริษัท", { timeout: 15_000 });
  await กล่อง.locator(".pms-confirm-actions button").last().click();
  await expect(กล่อง).toBeHidden({ timeout: 15_000 });
}

/** ติ๊ก "นัดคุยรายละเอียด" / ลากไปนัดคุยแล้ว → กรอกฟอร์มนัดคุยในแผงแล้วบันทึก (วันนัด = พรุ่งนี้เวลาไทย) */
export async function กรอกนัดคุย(แผง: Locator, สถานที่ = "ZZTEST สำนักงานผู้สนใจ") {
  await expect(แผง.locator("#pc-meet-date"), "ขั้นนัดคุย = ฟอร์มนัดคุย").toBeVisible({ timeout: 15_000 });
  await แผง.locator("#pc-channel").selectOption({ index: 1 });
  await แผง.locator("#pc-meet-date").fill(new Date(Date.now() + 31 * 3_600_000).toISOString().slice(0, 10));
  await แผง.locator("#pc-meet-time").fill("10:30");
  await แผง.locator("#pc-meet-place").fill(สถานที่);
  await แผง.getByRole("button", { name: "บันทึกนัดคุย", exact: true }).click();
}
