import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── /api/account ตอบ "สำเร็จแต่ว่าง" ต้องถือเป็นข้อผิดพลาด ห้ามส่งค่าว่างต่อ (บอสสั่ง 16 ต.ค. 69) ─────────────
//   ต้นเหตุที่เจอในรอบเต็ม (errcheck ฝั่งดีลเลอร์): หน้าเว็บเปลี่ยนหน้าระหว่างรับคำตอบ → เบราว์เซอร์ตัดกลางทาง (net::ERR_ABORTED)
//   ตัวเรียกอ่านเนื้อความไม่ได้แล้วคืน null เหมือนสำเร็จ → แถบเตือนอีเมล + ด่านตั้งรหัสครั้งแรกอ่าน .contactEmail จาก null = TypeError
//   ดีลเลอร์กดเปลี่ยนหน้าเร็ว ๆ บนระบบจริงก็เจอได้ · ข้อนี้จำลองคำตอบ 200 เนื้อความว่าง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

test("[func·dealer] สถานะบัญชีตอบสำเร็จแต่ว่าง → หน้าไม่พัง ไม่มี TypeError · แถบเตือน/ด่านตั้งรหัสไม่ขวางการใช้งาน", async ({ page }) => {
  const คอนโซล: string[] = [];
  page.on("console", m => { if (m.type() === "error") คอนโซล.push(m.text()); });
  page.on("pageerror", e => คอนโซล.push(`[pageerror] ${e.message}`));
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.route("**/api/account?code=*", r => r.fulfill({ status: 200, contentType: "application/json", body: "" }));
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first(), "หน้าต้องใช้งานได้ตามปกติ").toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog", { name: /ตั้งรหัสผ่าน/ }), "ด่านตั้งรหัสต้องไม่ขึ้นขวาง").toHaveCount(0);
  expect(คอนโซล.filter(t => /TypeError|Cannot read properties of null/.test(t)), "ต้องไม่มี TypeError จากค่าว่าง").toEqual([]);
});
