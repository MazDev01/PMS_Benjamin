import { test, expect } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

// ── ตัวเลข/ป้ายในกราฟห้ามซ้อนทับกัน (บอสสั่ง 19 ส.ค. 69: "ตรวจทุกกราฟว่าเลขมันซ้ำทับ") ──
// กราฟทุกใบเคยวาดป้ายแกนนอนทุกจุดเสมอ ไม่มีการเว้นป้าย พอช่วง 12 เดือนหรือการ์ดแคบ
// ชื่อเดือนจะซ้อนกันจนอ่านไม่ออก · เทสนี้วัดกล่องข้อความจริงในหน้าเว็บ แล้วจับคู่ที่ทับกัน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);

/** คู่ข้อความใน svg เดียวกันที่กล่องซ้อนกันเกินเกณฑ์ — คืนรายการไว้ฟ้องพร้อมข้อความจริง */
async function overlaps(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll("svg").forEach((svg, si) => {
      const texts = [...svg.querySelectorAll("text")]
        .filter(t => (t.textContent ?? "").trim() !== "" && t.getBoundingClientRect().width > 0);
      // ป้ายที่หลุดออกเหนือกรอบกราฟ — svg ตั้ง overflow:visible มันจึงไปทับหัวข้อ/คำอธิบายของการ์ด
      //   (เคสจริง 19 ส.ค. 69: ขีดบนสุดเกินเพดาน → ตำแหน่งติดลบ ล้นขึ้นไป 40px)
      //   เทสที่ดูแค่ "ป้ายทับกันเอง" จับเคสนี้ไม่ได้
      const box = svg.getBoundingClientRect();
      texts.forEach(t => {
        const b = t.getBoundingClientRect();
        if (b.top < box.top - 0.5) bad.push(`svg#${si}: “${t.textContent}” ล้นเหนือกรอบกราฟ ${(box.top - b.top).toFixed(1)}px`);
      });
      for (let a = 0; a < texts.length; a++) {
        for (let b = a + 1; b < texts.length; b++) {
          const r1 = texts[a].getBoundingClientRect(), r2 = texts[b].getBoundingClientRect();
          const ox = Math.min(r1.right, r2.right) - Math.max(r1.left, r2.left);
          const oy = Math.min(r1.bottom, r2.bottom) - Math.max(r1.top, r2.top);
          // เผื่อ 1px กันเคสขอบชนกันพอดีจากการปัดเศษ
          if (ox > 1 && oy > 1) {
            bad.push(`svg#${si}: “${texts[a].textContent}” ทับ “${texts[b].textContent}”`);
          }
        }
      }
    });
    return [...new Set(bad)];
  });
}

const หน้าดีลเลอร์ = ["/dashboard", "/leads", "/quotations", "/customers"];
const หน้าสำนักงานใหญ่ = ["/hq/dashboard", "/hq/leads", "/hq/pipeline", "/hq/quotations", "/hq/customers", "/hq/dealers"];

for (const path of หน้าดีลเลอร์) {
  test(`[ui·dealer] ป้ายในกราฟหน้า ${path} ต้องไม่ทับกัน`, async ({ page }) => {
    await openAs(page, RYG, "dealer", path);
    await settle(page);
    await page.waitForTimeout(1500);   // รอกราฟวาดจบ (มี transition ตอนแท่ง/เส้นขึ้น)
    expect(await overlaps(page), `พบป้ายทับกันในกราฟหน้า ${path}`).toEqual([]);
  });
}

for (const path of หน้าสำนักงานใหญ่) {
  test(`[ui·hq] ป้ายในกราฟหน้า ${path} ต้องไม่ทับกัน`, async ({ page }) => {
    await openAs(page, ADMIN, "hq", path);
    await settle(page);
    await page.waitForTimeout(1500);
    expect(await overlaps(page), `พบป้ายทับกันในกราฟหน้า ${path}`).toEqual([]);
  });
}

// ── เส้นแนวโน้มกลับมาเป็นเส้นโค้ง (บอสสั่ง 21 ส.ค. 69 — ทับคำสั่งเดิม 19 ส.ค. ที่ให้เป็นเส้นตรง) ──
//
// ข้อกังวลเดิมยังอยู่: โค้งแบบ Catmull-Rom โป่งเกินจุดข้อมูล เดือนที่ยอด 0 เส้นยังนูนขึ้น
//   คนอ่านกราฟจึงเห็นค่าที่ไม่มีอยู่จริง
// จึงใช้โค้งแบบ monotone (Fritsch–Carlson) ที่ "ห้ามแกว่งเกินค่าของจุดสองข้าง" แทน
// เทสต์นี้จึงตรวจสองอย่างพร้อมกัน: ต้องโค้งจริง และต้องไม่มีจุดใดของเส้นต่ำกว่าเส้นศูนย์
test("[ui·hq] กราฟยอดขายรายเดือนเป็นเส้นโค้ง และไม่แกว่งต่ำกว่าศูนย์", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/dashboard");
  await settle(page);
  const card = page.locator(".card", { hasText: "รายเดือน" }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const ds = await card.locator("svg path").evaluateAll(els =>
    els.map(e => e.getAttribute("d") ?? "").filter(d => d.length > 60));
  expect(ds.length, "ไม่เจอเส้นกราฟเลย").toBeGreaterThan(0);
  expect(ds.some(d => /C/.test(d)), "เส้นกราฟต้องเป็นเส้นโค้ง").toBe(true);

  // จุดต่ำสุดของเส้นต้องไม่เลยเส้นฐานของกราฟ (โค้งที่แกว่งเกิน = อ่านเป็นยอดติดลบ)
  const เกินฐาน = await card.locator("svg").evaluate(svg => {
    const path = Array.from(svg.querySelectorAll("path")).find(p => (p.getAttribute("d") ?? "").includes("C"));
    if (!path) return false;
    const box = (path as SVGGraphicsElement).getBBox();
    const กรอบ = (svg as SVGSVGElement).viewBox.baseVal;
    return box.y + box.height > กรอบ.y + กรอบ.height + 1;
  });
  expect(เกินฐาน, "เส้นโค้งต้องไม่แกว่งต่ำกว่าเส้นฐานของกราฟ").toBe(false);
});
