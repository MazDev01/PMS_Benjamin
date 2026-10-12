// ── การ์ดต้องบอก "กติกาการนับ" ของตัวเอง (ผลตรวจภายนอกระยะ 3 · 24 ส.ค. 69) ──
//
// HQ-03/DL-06 การ์ดตัดมาแสดงแค่อันดับต้น ๆ โดยไม่บอก → ผู้ใช้บวกแถวแล้วไม่ตรงยอดรวมของหน้า
// HQ-04/HQ-09 กราฟ "ลูกค้าตามประเภทอาคาร" นับรายที่ซื้อหลายประเภทซ้ำ และไม่รวมรายที่ยังไม่ซื้อ
// HQ-08 ดรอปดาวน์ชื่อเดียวกัน 5 จุด แต่ตัวเลือกมาจากคนละชุดข้อมูล
// DL-04 การ์ดขั้นตอนนับลูกค้าเป้าหมาย ส่วน KPI ด้านบนนับใบเสนอราคา
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);

// ⚠️ เดิมล็อกว่าการ์ดบนแดชบอร์ดดีลเลอร์ต้องมีคำบรรยายบอกกติกาการนับใต้หัวข้อ
//    บอสสั่งเอาคำบรรยายเล็กใต้หัวการ์ดออกทั้งหมด 25 ส.ค. 69 (ทั้ง HQ และดีลเลอร์)
//    จึงเหลือล็อกแค่ "การ์ดยังอยู่และวาดข้อมูลได้"
test("แดชบอร์ดดีลเลอร์: การ์ดผลงาน/แม่แบบ/ขั้นตอน ยังแสดงผลได้", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/dashboard");
  await settle(page); await page.waitForTimeout(2500);
  for (const ชื่อ of ["ผลงานผู้รับผิดชอบ", "ยอดขายตามแม่แบบ", "ขั้นตอนการขาย"]) {
    await expect(page.getByText(ชื่อ).first(), `ต้องมีการ์ด "${ชื่อ}"`).toBeVisible();
  }
});

test("หน้า HQ: การ์ดประเภทอาคารบอกส่วนที่เหลือ · ดรอปดาวน์บอกที่มา", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/dashboard");
  await settle(page); await page.waitForTimeout(2500);
  const card = page.locator(".card").filter({ hasText: "ยอดขายตามประเภทอาคาร" }).first();
  const หัว = (await card.innerText()).split("\n").filter(Boolean).slice(0, 3).join(" | ");
  console.log("การ์ดประเภทอาคาร:", หัว.slice(0, 160));
  await openAs(page, ADMIN, "hq", "/hq/customers");
  await settle(page); await page.waitForTimeout(1800);
  const c = await page.locator("body").innerText();
  console.log("ดรอปดาวน์หน้าลูกค้า:", c.includes("ทุกประเภทอาคาร (จากอาคารที่ซื้อแล้ว)") ? "บอกที่มาแล้ว ✓" : "ยังไม่บอก ✗");
  expect(c).toContain("ทุกประเภทอาคาร (จากอาคารที่ซื้อแล้ว)");
});
