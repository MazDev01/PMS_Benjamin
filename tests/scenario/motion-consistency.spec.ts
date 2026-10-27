// ── การเคลื่อนไหวต้องเหมือนกันทุกหน้า (บอสสั่ง 20 ส.ค. 69) ────────────────────────
//
// ที่มา: บอสแจ้งที่หน้าปฏิทิน "มันไม่ขยับเหมือนหน้าอื่น" — การ์ด KPI ตระกูล .kpi
// ตกหล่นจากกฎ hover กลางของการ์ด (ยกตัวตอนชี้เมาส์) และ "หน้ากราฟอื่นทุกอันใส่แอนิเมชั่นไปด้วย"
import { test, expect } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

test("[ui·dealer] การ์ด KPI หน้าปฏิทินมีทั้งแอนิเมชันตอนเปิด และยกตัวตอนชี้เมาส์", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/calendar");
  await settle(page);
  const การ์ด = page.locator("[data-kpi-row] > [data-kpi]").first();   // การ์ดกลาง (ใบ 0246) แทน .kpi-bar > .kpi
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });

  const st = await การ์ด.evaluate(el => {
    const c = getComputedStyle(el);
    return { anim: c.animationName, trans: c.transitionProperty };
  });
  expect(st.anim, "การ์ดต้องมีแอนิเมชันตอนเปิดหน้าเหมือนการ์ดหน้าอื่น").toBe("cardIn");
  expect(st.trans, "ต้องมี transition ไม่งั้นตอนชี้เมาส์จะกระโดดแทนที่จะยกขึ้นนุ่ม ๆ").not.toBe("none");

  // ชี้แล้วต้องยกขึ้นจริง (transform เปลี่ยนจาก none)
  await การ์ด.hover();
  await page.waitForTimeout(320);
  const ยก = await การ์ด.evaluate(el => getComputedStyle(el).transform);
  expect(ยก, "ชี้เมาส์แล้วการ์ดต้องยกขึ้นเหมือนการ์ดหน้าอื่น").not.toBe("none");
});

test("[ui·hq] กราฟผลงานดีลเลอร์ที่ /hq/pipeline มีแท่งโตขึ้นตอนเปิดหน้า", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/pipeline");
  await settle(page);
  const กราฟ = page.locator('svg[aria-label="ใบเสนอราคาที่ออก เทียบ ปิดการขายได้ รายดีลเลอร์"]').first();
  await expect(กราฟ).toBeVisible({ timeout: 30_000 });
  const แท่ง = await กราฟ.evaluate(svg => {
    const r = Array.from(svg.querySelectorAll("rect")).find(x => getComputedStyle(x).transitionDuration !== "0s");
    return r ? getComputedStyle(r).transitionProperty : "";
  });
  expect(แท่ง, "แท่งกราฟต้องมี transition ให้โตขึ้นจากเส้นฐาน").toContain("height");
});
