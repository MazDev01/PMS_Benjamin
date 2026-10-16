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
//    16 ต.ค. 69 เอาแม่แบบออกทั้งระบบ: การ์ด "ยอดขายตามแม่แบบ" (ดีลเลอร์) · "ยอดขายตามประเภทอาคาร" (HQ)
//    และตัวกรองประเภทอาคารหน้าลูกค้า HQ ถูกถอด → ล็อกว่าไม่กลับมา
test("แดชบอร์ดดีลเลอร์: การ์ดผลงาน/ขั้นตอน ยังแสดงผลได้ · ไม่มีการ์ดแม่แบบ", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/dashboard");
  await settle(page); await page.waitForTimeout(2500);
  for (const ชื่อ of ["ผลงานผู้รับผิดชอบ", "ขั้นตอนการขาย"]) {
    await expect(page.getByText(ชื่อ).first(), `ต้องมีการ์ด "${ชื่อ}"`).toBeVisible();
  }
  await expect(page.getByText("ยอดขายตามแม่แบบ"), "การ์ดยอดขายตามแม่แบบถูกเอาออกแล้ว").toHaveCount(0);
});

test("หน้า HQ: ไม่มีการ์ด/ตัวกรองประเภทอาคาร (แม่แบบ)", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/dashboard");
  await settle(page);
  await expect(page.getByText("ผลงานดีลเลอร์ 10 อันดับแรก").first(), "แดชบอร์ด HQ ต้องโหลดเสร็จก่อนตรวจ").toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ยอดขายตามประเภทอาคาร"), "การ์ดยอดขายตามประเภทอาคารถูกเอาออกแล้ว").toHaveCount(0);
  await openAs(page, ADMIN, "hq", "/hq/customers");
  await settle(page);
  await expect(page.getByPlaceholder("ค้นหาชื่อลูกค้า หรือจังหวัด..."), "หน้าลูกค้า HQ ต้องโหลดเสร็จก่อนตรวจ").toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/ทุกประเภทอาคาร/), "ตัวกรองประเภทอาคารถูกถอดแล้ว").toHaveCount(0);
});
