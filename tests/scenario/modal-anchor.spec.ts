import { test, expect } from "@playwright/test";
import { openAs, CNX } from "./helpers";

// ── ป๊อปอัพต้องยึด "ขอบจอ" เสมอ ห้ามยึดการ์ดที่มันอยู่ข้างใน ────────────────────────
//
// บั๊กที่เจอจริง (7 ส.ค. 69 · ผู้ใช้รายงานว่า "หน้ามันกระพริบไปมา"):
//   หน้าตั้งค่าดีลเลอร์ → ผู้รับผิดชอบ → เพิ่ม  แล้วป๊อปอัพเด้งสลับตำแหน่งตลอดที่ขยับเมาส์
//
// ต้นเหตุ: ฉากหลังป๊อปอัพเป็น position:fixed ซึ่งปกติยึดกับขอบจอ — แต่กฎ CSS บอกว่า
//   ถ้าบรรพบุรุษตัวใดมี transform อยู่ มันจะย้ายไปยึดกับกล่องตัวนั้นแทน
//   ป๊อปอัพตัวนี้ถูกเขียนไว้ข้างใน .card · พอเมาส์เข้าเขตการ์ด → .card:hover ยกตัว
//   translateY(-2px) → ป๊อปอัพย้ายฐานทันที (วัดได้ตอนพัง: เด้ง 95px แนวนอน 116px แนวตั้ง)
//   เมาส์ออก → transform หาย → เด้งกลับ = ภาพกระพริบ
//
// กันไว้ที่ globals.css: การ์ดที่มี [role="dialog"] หรือ .side-drawer อยู่ข้างในจะไม่ยกตัว
// เทสต์นี้เฝ้ากฎนั้น — ถ้าใครเผลอลบหรือเพิ่มการ์ดตระกูลใหม่ที่ยกตัวได้ จะจับได้ตรงนี้
test.setTimeout(120_000);

test("[ui] ป๊อปอัพเพิ่มผู้รับผิดชอบ — ตำแหน่งต้องไม่ขยับเมื่อเมาส์เข้า/ออกการ์ด", async ({ page }) => {
  await openAs(page, CNX, "dealer", "/settings");
  await page.getByRole("button", { name: "ผู้รับผิดชอบ" }).click();
  const addBtn = page.getByRole("button", { name: "เพิ่ม", exact: true }).first();
  await addBtn.waitFor({ state: "visible", timeout: 30_000 });
  await addBtn.click();

  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog, "กดเพิ่มแล้วต้องเปิดป๊อปอัพ").toBeVisible({ timeout: 15_000 });

  const at = async () => {
    const b = await dialog.boundingBox();
    return { x: Math.round(b!.x), y: Math.round(b!.y) };
  };
  // เมาส์นอกการ์ด (มุมล่างซ้ายของจอ = แถบเมนู ไม่ใช่พื้นที่การ์ด)
  await page.mouse.move(20, 850);
  await page.waitForTimeout(400);
  const outside = await at();

  // เมาส์บนตัวป๊อปอัพ — ซึ่งอยู่ในเขตการ์ด จุดที่เคยทำให้เด้ง
  await dialog.hover();
  await page.waitForTimeout(400);
  const inside = await at();

  await page.mouse.move(20, 850);
  await page.waitForTimeout(400);
  const outsideAgain = await at();

  expect(inside, "เมาส์เข้าเขตการ์ดแล้วป๊อปอัพต้องอยู่ที่เดิม (ห้ามเด้ง)").toEqual(outside);
  expect(outsideAgain, "เมาส์ออกจากการ์ดแล้วป๊อปอัพต้องอยู่ที่เดิม (ห้ามเด้งกลับ)").toEqual(outside);

  // และต้องกลางจอจริง ไม่ใช่กลางการ์ด
  const vw = page.viewportSize()!.width;
  const w = (await dialog.boundingBox())!.width;
  expect(Math.abs(outside.x - (vw - w) / 2), "ป๊อปอัพต้องอยู่กึ่งกลางจอ ไม่ใช่กึ่งกลางการ์ด").toBeLessThanOrEqual(2);
});
