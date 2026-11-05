import type { Locator, Page } from "@playwright/test";

/** ลากการ์ดบอร์ด (StageBoard) ไปวางคอลัมน์ — เมาส์จริงทีละขั้น (กด → ขยับเล็กน้อยให้เริ่มลาก → ไปคอลัมน์ → ปล่อย)
 *  locator.dragTo ขยับรวดเดียว บางหน้าเบราว์เซอร์ไม่เริ่มลาก (ตรวจ 5 พ.ย. 69: หน้าผู้สนใจ HQ ไม่มี dragstart) — แบบนี้ dragstart/drop ครบทุกหน้า */
export async function ลากการ์ด(page: Page, การ์ด: Locator, คอลัมน์: Locator) {
  await การ์ด.scrollIntoViewIfNeeded();
  const a = await การ์ด.boundingBox();
  if (!a) throw new Error("หาการ์ดไม่เจอ");
  await page.mouse.move(a.x + 40, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 30, { steps: 5 });
  await คอลัมน์.scrollIntoViewIfNeeded();
  const b = await คอลัมน์.boundingBox();
  if (!b) throw new Error("หาคอลัมน์ไม่เจอ");
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(120, b.height / 2), { steps: 10 });
  await page.mouse.up();
}
