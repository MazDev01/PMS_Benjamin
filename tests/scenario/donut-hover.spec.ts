// ── ชี้ที่ก้อนสีในกราฟวงกลม แล้วสีนั้นต้องเด่นขึ้น (บอสสั่ง 20 ส.ค. 69) ──────────
// ทำที่ตัวคอมโพเนนต์ Donut = โดนัททุกใบในระบบได้พฤติกรรมเดียวกัน
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[ui·hq] ชี้ก้อนสีในโดนัท → ก้อนนั้นหนาขึ้น ก้อนอื่นจางลง และตรงกลางบอกยอดของก้อนนั้น", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/customers");
  await settle(page);

  const โดนัท = page.locator(".donut-area").first();
  await expect(โดนัท).toBeVisible({ timeout: 30_000 });
  const ก้อน = โดนัท.locator("svg path, svg circle + circle");
  const จำนวนก้อน = await ก้อน.count();
  test.skip(จำนวนก้อน < 2, "ฐานทดสอบยังมีข้อมูลไม่พอให้โดนัทมีหลายก้อน");

  const กลางก่อน = (await โดนัท.locator(".donut-center").innerText()).trim();
  const หนาก่อน = await ก้อน.first().getAttribute("stroke-width");

  // เลื่อนเมาส์ไปที่ "กลางเส้นโค้ง" ของก้อนแรกจริง ๆ
  //   ชี้กลางกรอบของเส้นโค้งไม่ได้ เพราะกรอบสี่เหลี่ยมของส่วนโค้งมีจุดกึ่งกลางอยู่ในรูตรงกลางโดนัท
  const จุดกลางเส้น = await ก้อน.first().evaluate((el) => {
    const path = el as SVGPathElement;
    const svg = path.ownerSVGElement!;
    const p = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(svg.getScreenCTM()!);
    return { x: p.x, y: p.y };
  });
  await page.mouse.move(จุดกลางเส้น.x, จุดกลางเส้น.y);

  await expect.poll(async () => ก้อน.first().getAttribute("stroke-width"),
    { timeout: 5000, message: "ก้อนที่ชี้ต้องหนาขึ้น" }).not.toBe(หนาก่อน);
  const ทึบ = await ก้อน.first().getAttribute("opacity");
  const จาง = await ก้อน.nth(1).getAttribute("opacity");
  expect(Number(ทึบ), "ก้อนที่ชี้ต้องคงสีเต็ม").toBe(1);
  expect(Number(จาง), "ก้อนอื่นต้องจางลง").toBeLessThan(1);

  const กลางหลัง = (await โดนัท.locator(".donut-center").innerText()).trim();
  expect(กลางหลัง, "ตรงกลางต้องเปลี่ยนเป็นข้อมูลของก้อนที่ชี้").not.toBe(กลางก่อน);
  expect(กลางหลัง, "ตรงกลางต้องบอกสัดส่วนเป็น %").toMatch(/%/);
});

test("[ui·hq] ชี้ที่แถวคำอธิบาย → ก้อนสีในโดนัทเน้นตาม", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/customers");
  await settle(page);

  const โดนัท = page.locator(".donut-area").first();
  await expect(โดนัท).toBeVisible({ timeout: 30_000 });
  const ก้อน = โดนัท.locator("svg path, svg circle + circle");
  test.skip(await ก้อน.count() < 2, "ข้อมูลไม่พอ");

  // แถวคำอธิบายแถวแรกของการ์ด "ลูกค้า ตามดีลเลอร์"
  const แถว = page.locator('[aria-label]').filter({ hasText: "%" }).first();
  await แถว.hover();
  await expect.poll(async () => Number(await ก้อน.nth(1).getAttribute("opacity")),
    { timeout: 5000, message: "ชี้แถวแล้วก้อนอื่นต้องจางลง" }).toBeLessThan(1);
});
