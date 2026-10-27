import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { open, settle } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

// บอสแจ้ง: กด "ล้างตัวกรอง" แล้วข้อมูลหาย — ล้างต้องเห็นข้อมูลมากขึ้น ไม่ใช่น้อยลง
// ไม่นิ่ง 26 ต.ค. 69 (ได้ 9 จาก ≥10): ลูกค้า RYG ถูกข้ออื่นที่รันขนานเพิ่ม/ลบระหว่างนับครั้งแรกกับหลังล้าง — ไม่ใช่บั๊กของหน้า
//   แก้แบบ flow-a2: จดลายเซ็นลูกค้า RYG ในฐานก่อนนับครั้งแรก + หลังนับครั้งสุดท้าย · เท่ากัน = ไม่มีใครแตะ → เทียบเหมือนเดิมทุกข้อ
//   ไม่เท่า = เปิดหน้าใหม่แล้วทำใหม่ทั้งชุด (ไม่ใช่รอเวลา · เกณฑ์ไม่ผ่อน)
const svc = REAL_BACKEND ? createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const ลายเซ็นลูกค้า = async () => {
  if (!svc) return "local";
  const { data, error } = await svc.from("customers").select("id, total_value").eq("dealer_code", "RYG").order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => `${r.id}:${r.total_value}`).join(",");
};

test("[dealer] ล้างตัวกรองแล้วต้องไม่มีแถวหายไป", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 950 });
  const นับแถว = async () => page.locator("tbody tr").count();
  let ได้ = false;
  for (let รอบ = 0; รอบ < 4 && !ได้; รอบ++) {
    const ก่อน = await ลายเซ็นลูกค้า();
    await open(page, "dealer", "/customers");
    await settle(page);
    const เริ่มต้น = await นับแถว();

    // แคบช่วงเวลาเป็น "เดือนนี้"
    const ปุ่มเวลา = page.locator("button").filter({ hasText: /2569|ปีนี้|เดือนนี้|ทุกช่วงเวลา/ }).first();
    await ปุ่มเวลา.click();
    await page.getByRole("button", { name: "เดือนนี้" }).click();
    await page.waitForTimeout(600);
    const แคบ = await นับแถว();

    // ล้างตัวกรอง → ต้องไม่น้อยกว่าตอนเริ่ม (ล้าง = ไม่กรองเวลา)
    await page.getByRole("button", { name: "ล้างตัวกรอง" }).first().click();
    await page.waitForTimeout(800);
    const หลังล้าง = await นับแถว();
    if (ก่อน !== await ลายเซ็นลูกค้า()) continue;   // ข้ออื่นแตะลูกค้า RYG ระหว่างนับ — ทำใหม่ทั้งชุด
    expect(แคบ).toBeLessThanOrEqual(เริ่มต้น);
    expect(หลังล้าง, "ล้างแล้วแถวต้องไม่หายไป").toBeGreaterThanOrEqual(เริ่มต้น);
    await expect(ปุ่มเวลา).toContainText("ทุกช่วงเวลา");
    ได้ = true;
  }
  expect(ได้, "ลูกค้า RYG ในฐานไม่นิ่งเลยตลอด 4 รอบ (ข้ออื่นเพิ่ม/ลบลูกค้า RYG ตลอดเวลา)").toBe(true);
});
