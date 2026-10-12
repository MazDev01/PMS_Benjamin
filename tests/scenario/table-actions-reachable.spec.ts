import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ── ปุ่มในตารางต้องกดได้โดยไม่ต้องเลื่อนแนวนอนก่อน ────────────────────────────
// ⚠️ บั๊กจริง 26 ส.ค. 69: ที่จอ 1280 ตารางดีลเลอร์กว้าง 1120 แต่พื้นที่มีแค่ ~968
//    ปุ่ม "เข้าระบบ" จึงหลุดออกนอกกรอบและดูเหมือนโดนตัดครึ่ง (บอสเห็นแล้วคิดว่าระบบพัง)
//    วัดตอนนั้นได้ว่าปุ่มหลุดออกไปไกลสุดถึง 136px · ตอนนี้ตรึงคอลัมน์ปุ่มไว้ขวาสุดแล้ว
const หน้า = [
  ["ดีลเลอร์", "/hq/dealers?view=table"],   // ตรวจคอลัมน์ปุ่มในตาราง — หน้าเริ่มเป็นการ์ด
  ["ลูกค้าทั้งเครือ", "/hq/customers"],
  ["ใบเสนอราคาทั้งเครือ", "/hq/quotations"],
  ["ลูกค้าเป้าหมายทั้งเครือ", "/hq/leads"],
] as const;

for (const [ชื่อ, path] of หน้า) {
  test(`[ui·hq] จอ 1280: ปุ่มในตาราง${ชื่อ} ต้องอยู่ในกรอบที่มองเห็น`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, "hq", path);
    await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000);

    const ผล = await page.evaluate(() => {
      const out: { ชื่อ: string; หลุดขวา: number; หลุดซ้าย: number }[] = [];
      document.querySelectorAll(".table-wrap").forEach(w => {
        const wb = (w as HTMLElement).getBoundingClientRect();
        w.querySelectorAll("tbody tr td:last-child button, tbody tr td:last-child a").forEach(el => {
          const r = el.getBoundingClientRect();
          if (!r.width) return;   // ปุ่มที่ซ่อนอยู่ ไม่ต้องวัด
          out.push({ ชื่อ: (el.getAttribute("title") || el.textContent || "").trim().slice(0, 20),
                     หลุดขวา: Math.round(r.right - wb.right), หลุดซ้าย: Math.round(wb.left - r.left) });
        });
      });
      return out;
    });
    const หลุด = ผล.filter(b => b.หลุดขวา > 1 || b.หลุดซ้าย > 1);
    expect(หลุด, `ปุ่มที่หลุดออกนอกกรอบที่มองเห็น: ${JSON.stringify(หลุด)}`).toEqual([]);
    expect(ผล.length, "ต้องเจอปุ่มในคอลัมน์สุดท้ายจริง").toBeGreaterThan(0);
  });
}
