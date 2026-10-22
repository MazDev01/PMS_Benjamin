import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, db, specNS } from "./funcHelpers";

// ── หน้าดีลเลอร์: มุมมองการ์ดมีรูป ──
//   บอสสั่ง 14 ก.ย. 69: "หน้า ดีลเลอร์ ให้แสดงแบบเป็นการ์ด มีรูปแสดง ดูตามตัวอย่าง ทำเป็นแบบเฉย ๆ"
//
// สิ่งที่ต้องพิสูจน์:
//   1) เปิดหน้ามาเป็นการ์ด · สลับเป็นตารางและกลับมาได้
//   2) รูปใช้ของจริงเท่านั้น — สาขาที่มาจากผู้สนใจเป็นดีลเลอร์ ที่มีรูป ขึ้นรูปนั้น · ไม่มีรูป = ตัวย่อชื่อ
//   3) กดการ์ดเปิดรายละเอียดดีลเลอร์ได้ (แบบเดียวกับกดแถวตาราง)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("DEALERCARD");
// รูป PNG 2×2 จุด — ใช้เป็นรูปประจำตัวของลูกค้าเป้าหมายที่ผูกกับสาขาทดสอบ
const รูปทดสอบ = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMAAAA4AAf8Fh1YAAAAASUVORK5CYII=";

async function cleanup() {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").delete().like("name", `${NS}%`);
  if (error) console.warn("[hq-dealer-cards] ล้างข้อมูลทดสอบไม่สำเร็จ", error.message);
}
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("[func·hq] หน้าดีลเลอร์: เปิดมาเป็นการ์ด · รูปจากลูกค้าเป้าหมายที่ผูกไว้ · สลับตาราง/การ์ด · กดการ์ดเปิดรายละเอียด", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  // ลูกค้าเป้าหมายที่เป็นดีลเลอร์ RYG แล้ว และมีรูป → การ์ด RYG ต้องขึ้นรูปนี้
  const { error } = await sb.from("dealer_prospects")
    .insert({ name: `${NS}-RYG-มีรูป`, status: "won", dealer_code: "RYG", logo: รูปทดสอบ });
  expect(error).toBeNull();

  await loginUI(page, HQ_ORIGIN, "/hq/dealers", ADMIN);
  // เปิดมาเป็นตาราง (บอสสั่ง 14 ก.ย. 69: "ให้แสดงหน้านี้เป็นหลัก") — กดสลับเป็นการ์ดเอง
  await expect(page.locator("tbody tr").first(), "เปิดหน้ามาต้องเป็นตาราง").toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "แสดงแบบตาราง" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "แสดงแบบการ์ด" }).click();
  const การ์ด = page.getByRole("button", { name: /^เปิดรายละเอียดดีลเลอร์ / });
  await expect(การ์ด.first(), "สลับแล้วต้องเป็นการ์ด").toBeVisible({ timeout: 15_000 });
  await expect(page.locator("tbody tr"), "มุมมองการ์ดต้องไม่มีตาราง").toHaveCount(0);

  await page.getByPlaceholder("ค้นหาดีลเลอร์...").fill("RYG");
  const การ์ดRYG = page.getByRole("button", { name: /^เปิดรายละเอียดดีลเลอร์ .*ระยอง|^เปิดรายละเอียดดีลเลอร์ / }).filter({ hasText: "RYG" }).first();
  await expect(การ์ดRYG).toBeVisible({ timeout: 15_000 });
  await expect(การ์ดRYG.locator("img"), "สาขาที่มีรูปจากลูกค้าเป้าหมายต้องขึ้นรูป").toHaveAttribute("src", /^data:image\//, { timeout: 15_000 });

  // สลับเป็นตาราง → มีแถว · กลับเป็นการ์ด → ไม่มีตาราง
  await page.getByRole("button", { name: "แสดงแบบตาราง" }).click();
  await expect(page.locator("tbody tr").filter({ hasText: "RYG" }).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "แสดงแบบการ์ด" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(0);

  // กดการ์ด → แผงรายละเอียดดีลเลอร์ (แบบเดียวกับกดแถว)
  await การ์ดRYG.click();
  await expect(page.getByRole("button", { name: /ดูรหัสผ่าน/ }).first(), "กดการ์ดต้องเปิดรายละเอียดดีลเลอร์").toBeVisible({ timeout: 15_000 });
  assertNoErrors(errs, "หน้าดีลเลอร์ (การ์ด)");
});
