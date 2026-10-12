import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// แถบตัวกรองติดหนึบต้องค้างอยู่ "ใต้" แถบบนตอนเลื่อน ไม่มุดไปซ่อนข้างใต้ (บอสทัก 22 ก.ย. 69)
//   เดิม top:8px วัดจากขอบบนของตัวที่เลื่อน ขณะที่แถบบน (sticky สูง 64px) อยู่ในตัวเดียวกัน → โดนบังเกือบทั้งแถบ
for (const [ชื่อ, path] of [["ดีลเลอร์", "/hq/dealers"], ["ใบเสนอราคาทั้งเครือ", "/hq/quotations"]] as const) {
  test(`[ui·hq] แถบตัวกรองหน้า${ชื่อ} ค้างใต้แถบบนตอนเลื่อน`, async ({ page }) => {
    await open(page, "hq", path);
    const แถบกรอง = page.locator(".hq-sticky-filter").first();
    await expect(แถบกรอง).toBeVisible();
    // เลื่อนตัวที่เลื่อนจริง (.main) ลงไปไกล ๆ
    await page.evaluate(() => {
      const el = document.querySelector(".main") as HTMLElement | null;
      (el && el.scrollHeight > el.clientHeight ? el : document.scrollingElement!).scrollTop = 2000;
    });
    await page.waitForTimeout(300);
    const บน = await page.locator(".erp-topbar").first().boundingBox();
    const กรอง = await แถบกรอง.boundingBox();
    expect(บน && กรอง).toBeTruthy();
    // ขอบบนของแถบตัวกรองต้องไม่อยู่เหนือขอบล่างของแถบบน (ไม่โดนบัง)
    expect(กรอง!.y).toBeGreaterThanOrEqual(บน!.y + บน!.height - 1);
    // และยังอยู่ในจอ (ค้างอยู่ ไม่เลื่อนหายไป)
    expect(กรอง!.y).toBeLessThan(บน!.y + บน!.height + 40);
  });
}
