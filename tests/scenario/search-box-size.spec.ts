// ── ช่องค้นหาต้องขนาดเท่ากันทุกหน้า (บอสสั่ง 20 ส.ค. 69) ──────────────────────────
//
// เดิมแต่ละหน้าตั้งขนาดเอง: /hq/customers สั่งให้ยืดกินที่ว่าง (กว้างเกือบ 900px เวลาจอกว้าง)
// /hq/audit ตั้ง 300 · แถบใบเสนอราคาทั้งเครือประกอบช่องเอง 300 — สลับหน้าแล้วช่องขยับตลอด
// ตอนนี้ทุกหน้าใช้คลาสมาตรฐาน .search-bar ตัวเดียวกัน
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const หน้า = ["/hq/customers", "/hq/quotations", "/hq/audit", "/hq/dealers"];

test("[ui·hq] ช่องค้นหาทุกหน้ากว้างเท่ากัน", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ความกว้าง: Record<string, number> = {};
  for (const path of หน้า) {
    await openAs(page, ADMIN, "hq", path);
    await settle(page);
    const กล่อง = page.locator(".search-bar").first();
    await expect(กล่อง, `${path} ต้องมีช่องค้นหาแบบมาตรฐาน`).toBeVisible({ timeout: 30_000 });
    ความกว้าง[path] = Math.round((await กล่อง.boundingBox())?.width ?? 0);
  }
  const ค่า = [...new Set(Object.values(ความกว้าง))];
  expect(ค่า, `ช่องค้นหาต้องกว้างเท่ากันทุกหน้า (ได้ ${JSON.stringify(ความกว้าง)})`).toHaveLength(1);
});

test("[ui·hq] แถบตัวกรองใบเสนอราคาไม่มีป้ายนับจำนวนใบแล้ว", async ({ page }) => {
  // บอสสั่งเอาออก 20 ส.ค. 69 — จำนวนใบดูได้ที่การ์ด KPI ด้านบนอยู่แล้ว ไม่ต้องบอกซ้ำในแถบตัวกรอง
  await openAs(page, ADMIN, "hq", "/hq/quotations");
  await settle(page);
  await expect(page.getByText(/^พบ [\d,]+ ใบ$/)).toHaveCount(0);
});

test("[ui·hq] วงโฟกัสของเมนูข้างต้องเป็นเส้นเดียว ไม่ซ้อนสองชั้น", async ({ page }) => {
  // บอสถาม 20 ส.ค. 69: "ทำไมเส้นมันซ้อนกัน 2 ชั้น" — เกิดจากกฎ focus ring สั่ง border-radius
  // ทับมุมมนของเมนู ทำให้กล่องพื้นหลังกับวงโฟกัสมีมุมคนละองศาและเว้นช่องว่างกัน
  await openAs(page, ADMIN, "hq", "/hq/customers");
  await settle(page);
  const เมนู = page.locator(".nav-item.active").first();
  await เมนู.focus();
  const st = await เมนู.evaluate(el => {
    const c = getComputedStyle(el);
    return { radius: c.borderRadius, offset: c.outlineOffset, width: c.outlineWidth };
  });
  expect(st.width, "ต้องยังมีวงโฟกัสให้คนใช้คีย์บอร์ดเห็น").not.toBe("0px");
  expect(st.radius, "มุมมนตอนโฟกัสต้องเท่าเดิม ไม่ถูกกฎ focus บังคับเป็น 6px").not.toBe("6px");
  expect(st.offset, "วงโฟกัสของเมนูข้างต้องวาดด้านใน ไม่เว้นช่องจนดูเป็นสองชั้น").toBe("-2px");
});
