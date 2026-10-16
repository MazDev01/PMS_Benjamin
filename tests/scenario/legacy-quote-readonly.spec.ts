import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db } from "./funcHelpers";
import { settle } from "./helpers";

// ── ใบเสนอราคาเดิม (ไม่มีใบ HQ) = ดูได้อย่างเดียว (บอสสั่งลบ Flow เก่า 16 ต.ค. 69) ──────────────────────────────
//   ระบบจริงมีใบแบบนี้ 5 ใบ (ออกก่อนขึ้น Flow ใบ HQ) — เก็บไว้เป็นประวัติ ไม่ลบ
//   หน้าจอต้องไม่มีทางแก้/ลบ/ส่ง/เปลี่ยนสถานะ/ทำสำเนา · ฐานล็อกใบเดิมที่ปิดแล้วอีกชั้น (ใบ 0202)
//   ใช้ใบร่างเดิมของข้อมูลตั้งต้น (ZZTEST-BASE-Q-*) — ใบร่างคือแบบที่ปุ่มเคยครบที่สุด
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

test("[func·dealer] ใบเดิมที่ไม่มีใบ HQ: ไม่มีปุ่มแก้ · ลบ · ส่ง · เปลี่ยนสถานะ ทั้งในตารางและแผงรายละเอียด", async ({ page }) => {
  const sb = await db(RYG);
  const { data } = await sb.from("quotations").select("id").eq("dealer_code", "RYG").is("hq_quote_id", null)
    .eq("status", "draft").like("id", "ZZTEST-BASE-Q-%").limit(1);
  const ใบ = data?.[0]?.id as string | undefined;
  expect(ใบ, "ข้อมูลตั้งต้นต้องมีใบร่างแบบเดิมของ RYG").toBeTruthy();

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(ใบ!);
  const แถว = page.locator("tbody tr").filter({ hasText: ใบ! }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  for (const ชื่อ of ["แก้ไข", "ลบใบเสนอราคา", "ส่งให้ลูกค้า"]) {
    await expect(แถว.getByTitle(ชื่อ), `แถวใบเดิมต้องไม่มีปุ่ม ${ชื่อ}`).toHaveCount(0);
  }
  await expect(แถว.getByTitle("ดูรายละเอียด"), "ยังดูรายละเอียดได้").toHaveCount(1);
  await expect(แถว.getByTitle("พิมพ์ใบเสนอราคา"), "ยังพิมพ์ได้").toHaveCount(1);

  await แถว.getByTitle("ดูรายละเอียด").click();
  await expect(page.getByTitle("พิมพ์ / ดาวน์โหลด PDF")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTitle("แก้ไข"), "แผงรายละเอียดต้องไม่มีปุ่มแก้ไข").toHaveCount(0);
  await expect(page.getByTitle("ลบใบเสนอราคา"), "แผงรายละเอียดต้องไม่มีปุ่มลบ").toHaveCount(0);
  await expect(page.getByText("เปลี่ยนสถานะ", { exact: true }), "ต้องไม่มีกล่องเปลี่ยนสถานะ").toHaveCount(0);
});
