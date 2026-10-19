import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── ตัวเรียก API กลาง (apiFetch) ได้ "สำเร็จแต่อ่านเนื้อความไม่ได้" ต้องถือเป็นข้อผิดพลาด ห้ามคืนค่าว่างไปเหมือนสำเร็จ ─────
//   ต้นเหตุเดียวกับ /api/account (16 ต.ค. 69): เปลี่ยนหน้าระหว่างรับคำตอบ → เบราว์เซอร์ตัดกลางทาง → เดิมคืน null
//   → ผู้เรียกวนลูปค่าว่าง = TypeError (เจอในรอบเต็ม: [settings.getLeadRulesMap] TypeError: e is not iterable)
//   ข้อนี้จำลองคำตอบ 200 เนื้อความว่าง ที่เส้นทางกฎลูกค้าเป้าหมาย (หน้าแดชบอร์ด HQ ใช้)
//   ⚠️ JSON "null" ที่เซิร์ฟเวอร์ตั้งใจตอบ (เช่น ยังไม่มีใบ HQ) ยังเป็นค่าที่ถูกต้อง — แยกจาก "ว่างเปล่า/อ่านไม่ได้"
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
// ต้องเป็นโหมด api (แบบเว็บจริง · test:prodbuild) — โหมด dev ต่อฐานตรงไม่ผ่าน /api/v1 ข้อนี้จะผ่านโดยไม่ได้ตรวจอะไร
test.skip(() => process.env.NEXT_PUBLIC_DATA_SOURCE !== "api", "ต้องรันโหมด api (npm run test:prodbuild) — โหมดอื่นไม่ผ่าน /api/v1");

test("[func·hq] API ตอบสำเร็จแต่ว่าง → หน้าไม่พัง ไม่มี TypeError", async ({ page }) => {
  const คอนโซล: string[] = [];
  page.on("console", m => { if (m.type() === "error") คอนโซล.push(m.text()); });
  page.on("pageerror", e => คอนโซล.push(`[pageerror] ${e.message}`));
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.route("**/api/v1/settings?k=leadRules*", r => r.fulfill({ status: 200, contentType: "application/json", body: "" }));
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("แดชบอร์ดสำนักงานใหญ่").first(), "หน้าต้องแสดงตามปกติ").toBeVisible({ timeout: 20_000 });
  expect(คอนโซล.filter(t => /TypeError|is not iterable|Cannot read properties of null/.test(t)), "ต้องไม่มี TypeError จากค่าว่าง").toEqual([]);
});
