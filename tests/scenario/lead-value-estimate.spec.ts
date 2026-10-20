// ── ช่องประเมินราคาของลูกค้าเป้าหมาย: เอาออกจากหน้าเว็บทุกที่ (บอสตัดสิน 19 ต.ค. 69 ข้อ 5) ────────────────────
//
// เดิม: ช่องนี้ต้องมีทั้งตอนเพิ่มและตอนแก้ไข อยู่กลุ่ม "รายละเอียดงาน" (บอสแจ้ง 20 ส.ค. 69 ว่ากรอก/แก้ไม่ตรงกัน)
// ใหม่: ราคามาจากใบ HQ + % เท่านั้น — ตัวเลขที่เซลส์เดาเองไม่ใช่ราคา · มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223)
//   ข้อนี้กลับด้าน: ทั้งฟอร์มเพิ่มและแผงแก้ไขต้อง "ไม่มี" ช่องนี้ (คอลัมน์ในฐานคงไว้ ห้ามลบ)
//   การแสดงมูลค่าจากใบล่าสุดตรวจที่ flow-c-value-bell-cards.spec.ts · โค้ดห้ามอ่านช่องนี้ตรวจที่ check-no-lead-estimate.mjs
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

test("[ui] ช่องประเมินราคาต้องไม่มีทั้งตอนเพิ่มและตอนแก้ไข (กลุ่มรายละเอียดงานเหลือพื้นที่)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);

  const row = page.locator("tbody tr").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await expect(page.getByText("รายละเอียดงาน").first(), "แผงแก้ไขเปิดแล้ว").toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("ประเมินราคา"), "แผงแก้ไขไม่มีช่องประเมินราคา").toHaveCount(0);
  await expect(page.locator('input[type="number"]').first(), "กลุ่มรายละเอียดงานยังมีช่องพื้นที่").toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /เพิ่มลูกค้าเป้าหมาย/ }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await expect(ฟอร์ม).toBeVisible({ timeout: 10_000 });
  await expect(ฟอร์ม.getByText("ประเมินราคา"), "ฟอร์มเพิ่มไม่มีช่องประเมินราคา").toHaveCount(0);
  await expect(ฟอร์ม.getByText("พื้นที่ (ตร.ม.)"), "ฟอร์มเพิ่มยังมีช่องพื้นที่").toBeVisible();
});
