import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";

// ── หน้าดีลเลอร์ของ HQ: ดีลเลอร์ที่จังหวัดในทะเบียนสะกดไม่ตรงรายชื่อมาตรฐาน (ใบ 0195) ────────────────────────
//   เดิมไฟล์นี้ชื่อ hq-territory-overlaps (จังหวัดทับซ้อน + เคลียร์ทีละจังหวัด) — ใบ 0214 ยกเลิก "หนึ่งจังหวัด หนึ่งดีลเลอร์"
//   (บอสสั่ง 16 ต.ค. 69) ส่วนทับซ้อนเอาออก ตรวจว่าหายแล้วที่ territory-multi-dealer.spec.ts · เหลือเรื่องจังหวัดสะกดไม่ตรง
//   ข้อมูลตั้งต้น: BKK ในทะเบียนใช้ "กรุงเทพฯ" (ชื่อย่อ ไม่อยู่ใน 77 จังหวัด) → ระบบไม่เดาจับคู่ ต้องขึ้นให้ HQ เห็น
//   ไม่เขียนพื้นที่ใด ๆ — ไฟล์อื่นที่รันขนานกันใช้จังหวัดของตัวเอง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

test("[hq] เห็นดีลเลอร์ที่จับคู่จังหวัดไม่ได้ (จังหวัดสะกดไม่ตรงรายชื่อ) · ไม่มีการ์ดทับซ้อน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  const การ์ด = page.getByRole("note").filter({ hasText: "ดีลเลอร์ที่ยังไม่มีพื้นที่" }).first();
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });
  await expect(การ์ด.getByText(/BKK/), "ดีลเลอร์ที่จังหวัดสะกดไม่ตรงรายชื่อ ต้องขึ้นให้ HQ เห็น").toBeVisible();
  await expect(การ์ด.getByText(/กรุงเทพฯ/)).toBeVisible();
  await expect(page.getByText(/พื้นที่ทับซ้อน/)).toHaveCount(0);
  assertNoErrors(errs, "หน้าดีลเลอร์ของ HQ");
});
