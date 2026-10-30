import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── ตัวกรองที่ค้างตอนเลื่อน (หน้า HQ) ต้องมีพื้นหลังและไม่ทับเนื้อหา — ตัวแก้ส่วนกลางชุดเดียว (บอสสั่ง 30 ต.ค. 69) ─────────────
//   เจอ: ตัวกรองค้างห่างแถบบน 8px → เนื้อหาที่เลื่อนผ่านโผล่ในช่องนั้น ดูเหมือนตัวกรองทับเนื้อหา
//   ตรวจทุกหน้าที่ใช้ตัวกรองค้าง (.hq-sticky-filter / .cust-filter):
//     จอกว้าง เลื่อนลงแล้ว: ขอบบนตัวกรอง = ขอบล่างแถบบน (ไม่มีช่องให้เนื้อหาโผล่) · พื้นหลังทึบ · อยู่เหนือเนื้อหา (z-index)
//     มือถือ 390px: ไม่ค้าง (ตัวกรองหลายบรรทัด ค้างแล้วบังเนื้อหาเกือบครึ่งจอ)
//   ตกบนโค้ดก่อนแก้: top = แถบบน + 8px · มือถือยังค้าง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

// 4 หน้าที่บอสระบุ (/hq/dealers ใช้คลาสเดียวกัน แต่ข้อมูลทดสอบสั้นเกินกว่าจะเลื่อนถึงจุดค้าง — ตรวจไม่ได้จริง จึงไม่ใส่)
const หน้า = ["/hq/pipeline", "/hq/leads", "/hq/quotations", "/hq/customers"];
const ตัวกรอง = (page: Page) => page.locator(".hq-sticky-filter, .cust-filter").first();

async function วัด(page: Page) {
  return ตัวกรอง(page).evaluate(el => {
    const แถบบน = document.querySelector(".erp-topbar")!.getBoundingClientRect();
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const bg = cs.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(",").map(Number) ?? [];
    return { บน: Math.round(r.top), ล่างแถบบน: Math.round(แถบบน.bottom), ทึบ: bg.length >= 3 && (bg[3] ?? 1) === 1,
      ตำแหน่ง: cs.position, ชั้น: Number(cs.zIndex) || 0 };
  });
}

for (const ที่ of หน้า) {
  test(`[ui·hq] ตัวกรองค้าง ${ที่}: ติดใต้แถบบนพอดี พื้นหลังทึบ ไม่ทับเนื้อหา · มือถือไม่ค้าง`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}${ที่}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(ตัวกรอง(page)).toBeVisible({ timeout: 25_000 });
    // เลื่อนกล่องที่เลื่อนได้จริงของหน้า (หน้า HQ เลื่อนในกล่องเนื้อหา ไม่ใช่หน้าต่าง — เลื่อนหน้าต่างแล้วตัวกรองไม่เคยถึงจุดค้าง)
    //   จนเลยตำแหน่งเดิมของตัวกรอง 600px
    const เลื่อน = await ตัวกรอง(page).evaluate(el => {
      let กล่อง: Element = document.scrollingElement ?? document.documentElement;
      for (let e = el.parentElement; e; e = e.parentElement) {
        const oy = getComputedStyle(e).overflowY;
        if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight + 1) { กล่อง = e; break; }
      }
      const เดิม = el.getBoundingClientRect().top - (กล่อง === document.scrollingElement ? 0 : กล่อง.getBoundingClientRect().top) + กล่อง.scrollTop;
      กล่อง.scrollTop = เดิม + 600;
      return { เดิม: Math.round(เดิม), เลื่อนได้: Math.round(กล่อง.scrollTop) };
    });
    await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))));
    const ผล = await วัด(page);
    expect.soft(ผล.ทึบ, `${ที่}: พื้นหลังตัวกรองทึบ (เนื้อหาไม่โผล่ทะลุ)`).toBe(true);
    expect.soft(เลื่อน.เลื่อนได้, `${ที่}: หน้าเลื่อนได้เลยจุดค้างของตัวกรอง (ตรวจการค้างได้จริง)`).toBeGreaterThan(เลื่อน.เดิม);
    expect.soft(ผล.ตำแหน่ง, `${ที่}: ตัวกรองค้างตอนเลื่อน (จอกว้าง)`).toBe("sticky");
    expect.soft(Math.abs(ผล.บน - ผล.ล่างแถบบน), `${ที่}: ขอบบนตัวกรองชิดขอบล่างแถบบน (ห่าง ${ผล.บน - ผล.ล่างแถบบน}px — ช่องว่าง = เนื้อหาโผล่)`).toBeLessThanOrEqual(1);
    expect.soft(ผล.ชั้น, `${ที่}: ตัวกรองอยู่เหนือเนื้อหาที่เลื่อนผ่าน`).toBeGreaterThan(0);
    // มือถือ: ไม่ค้าง
    await page.setViewportSize({ width: 390, height: 844 });
    expect.soft((await วัด(page)).ตำแหน่ง, `${ที่}: มือถือไม่ค้าง (ตัวกรองหลายบรรทัดบังเนื้อหา)`).toBe("static");
  });
}
