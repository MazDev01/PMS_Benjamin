// ── เป้าทั้งเครือ กับ ผลรวมเป้าที่แจกให้ดีลเลอร์ เป็นคนละค่า ต้องบอกส่วนต่างให้เห็น ──
//
// ที่มา (ผลตรวจภายนอก HQ-01 · 24 ส.ค. 69): แดชบอร์ดคิด % จาก "เป้าที่ผู้บริหารตั้ง"
// ส่วนหน้าดีลเลอร์คิดจาก "ผลรวมเป้าที่แจกลงไป" — สองเลขนี้ต่างกันได้โดยชอบธรรม
// แต่เดิมไม่มีที่ไหนบอกไว้เลย ผู้บริหารจึงเห็น % ขัดกันแล้วไม่รู้ว่าอันไหนจริง
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[func·hq] หน้าตั้งค่าเป้าหมาย ต้องบอกผลรวมเป้าที่แจกให้ดีลเลอร์ตามจริง", async ({ page }) => {
  // แถว HQ (สำนักงานใหญ่ · เจ้าของลีดของ HQ) ไม่ใช่ดีลเลอร์ — ไม่นับในตัวเลขดีลเลอร์ทุกที่ (รอบ 2 ช่วง ข · flow-b-hq-dealers [ข·1])
  const { data } = await db.from("dealers").select("revenue_target").neq("code", "HQ");
  const แจก = (data ?? []).reduce((s, d) => s + Number(d.revenue_target || 0), 0);
  const ที่คาด = `฿${(แจก / 1e6).toFixed(1)}M`;

  await openAs(page, ADMIN, "hq", "/hq/settings");
  await settle(page);
  await page.getByRole("button", { name: /เป้าหมายยอดขาย/ }).first().click();
  await page.waitForTimeout(1200);

  // กล่องเทียบส่วนต่าง = บรรทัดที่มีทั้งข้อความและตัวเลข (ไม่ใช่คำอธิบายใต้ช่องกรอก)
  const กล่อง = page.locator("div").filter({ hasText: /^ผลรวมเป้าที่แจกให้ดีลเลอร์ \d+ สาขา:/ }).last();
  await expect(กล่อง, "ต้องมีกล่องเทียบเป้าทั้งเครือกับที่แจกจริง").toBeVisible({ timeout: 10_000 });
  const ข้อความ = (await กล่อง.innerText()).replace(/\s+/g, " ");
  console.log("บนจอ:", ข้อความ.slice(0, 160));
  console.log("ผลรวมจริงจากฐานข้อมูล:", ที่คาด);
  expect(ข้อความ, "ตัวเลขบนจอต้องตรงกับผลรวมเป้าดีลเลอร์จริง").toContain(ที่คาด);
});
