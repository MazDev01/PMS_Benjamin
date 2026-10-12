// ── "อื่นๆ (ระบุเอง)" ต้องเห็นตรงกันทั้งสองฝั่ง (บอสสั่ง 21 ส.ค. 69) ─────────────────
//
// ฝั่งดีลเลอร์มีปุ่ม "อื่นๆ" ให้พิมพ์เหตุผลเองอยู่แล้ว แต่หน้าตั้งค่าของสำนักงานใหญ่ไม่โชว์
// ผู้ดูแลจึงนึกว่าดีลเลอร์เลือกได้แค่รายการที่ตั้งไว้ — สองฝั่งเข้าใจไม่ตรงกัน
//
// ⚠️ "อื่นๆ" ต้องลบไม่ได้ และต้องไม่ถูกเก็บเป็นตัวเลือกจริงในรายการ
//    ไม่งั้นเหตุผลที่บันทึกจะกลายเป็นคำว่า "อื่นๆ" ลอย ๆ ทุกใบ รายงานจะวิเคราะห์ไม่ได้
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { db } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[ui·hq] หน้าตั้งค่ามี 'อื่นๆ (ระบุเอง)' อยู่ในรายการเหตุผลจริง", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/settings");
  await settle(page);
  await page.getByRole("button", { name: "เส้นทางการขาย" }).first().click();
  await page.waitForTimeout(800);

  const การ์ด = page.locator(".card", { hasText: "เหตุผลปิดการขายไม่สำเร็จ" }).first();
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });
  await expect(การ์ด.getByText("อื่นๆ (ระบุเอง)").first(),
    "ต้องมีตัวเลือกนี้ในรายการเหมือนเหตุผลอื่น").toBeVisible();
});

test("[func] ตัวเลือก 'อื่นๆ (ระบุเอง)' = กดแล้วพิมพ์เอง · ไม่เก็บคำว่าอื่นๆ ลงฐานข้อมูล", async ({ page }) => {
  const sb = await db(ADMIN);
  const { data } = await sb.from("hq_sales_journey").select("lost").eq("id", 1).maybeSingle();
  const รายการ = (data?.lost as string[] | null) ?? [];
  expect(รายการ, "รายการในฐานข้อมูลต้องมีตัวเลือกนี้").toContain("อื่นๆ (ระบุเอง)");

  await openAs(page, RYG, "dealer", "/leads");
  await settle(page);

  const แถว = page.locator("tbody tr");
  const จำนวน = Math.min(await แถว.count(), 5);
  let เปิดได้ = false;
  for (let i = 0; i < จำนวน; i++) {
    await แถว.nth(i).locator("td").first().click();
    await page.getByRole("button", { name: "งาน", exact: true }).first().click();
    const ปุ่ม = page.getByRole("button", { name: "ไม่ได้งาน" }).first();
    if (await ปุ่ม.count() && await ปุ่ม.isEnabled().catch(() => false)) { await ปุ่ม.click(); เปิดได้ = true; break; }
    await page.keyboard.press("Escape");
  }
  test.skip(!เปิดได้, "ไม่มีดีลที่ยังเปิดอยู่ให้ทดสอบในฐานทดสอบตอนนี้");

  // ต้องมีปุ่มเดียว ไม่ใช่สองปุ่มซ้ำกัน (ตัวในรายการ + ตัวที่ระบบเติมให้)
  const ปุ่มอื่นๆ = page.getByRole("button", { name: "อื่นๆ (ระบุเอง)" });
  await expect(ปุ่มอื่นๆ, "ต้องมีปุ่มเดียว ไม่ซ้ำ").toHaveCount(1);

  // กดแล้วต้องเปิดช่องพิมพ์ ไม่ใช่เลือกคำว่า "อื่นๆ" ไปบันทึกตรง ๆ
  await ปุ่มอื่นๆ.click();
  await expect(page.getByPlaceholder("พิมพ์เหตุผล…"), "กดแล้วต้องให้พิมพ์เหตุผลเอง").toBeVisible({ timeout: 10_000 });

  // ยังไม่พิมพ์ = ปุ่มยืนยันต้องกดไม่ได้ (กัน "อื่นๆ" ลอย ๆ หลุดลงฐานข้อมูล)
  await expect(page.getByRole("button", { name: "ยืนยันปิดการขาย" }),
    "ยังไม่พิมพ์เหตุผล ต้องกดยืนยันไม่ได้").toBeDisabled();
});
