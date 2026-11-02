// ── ช่องค้นหาต้องขนาดเท่ากันทุกหน้า (บอสสั่ง 20 ส.ค. 69) ──────────────────────────
//
// เดิมแต่ละหน้าตั้งขนาดเอง: /hq/customers สั่งให้ยืดกินที่ว่าง (กว้างเกือบ 900px เวลาจอกว้าง)
// /hq/audit ตั้ง 300 · แถบใบเสนอราคาทั้งเครือประกอบช่องเอง 300 — สลับหน้าแล้วช่องขยับตลอด
// ตอนนี้ทุกหน้าใช้คลาสมาตรฐาน .search-bar ตัวเดียวกัน
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const หน้า = ["/hq/customers", "/hq/quotations", "/hq/audit", "/hq/dealers"];

test("[ui·hq] ช่องค้นหาทุกหน้ากว้างเท่ากัน", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const ความกว้าง: Record<string, number> = {};
  for (const path of หน้า) {
    await openAs(page, ADMIN, "hq", path);
    await settle(page);
    const กล่อง = page.locator(".search-bar").first();
    await expect(กล่อง, `${path} ต้องมีช่องค้นหาแบบมาตรฐาน`).toBeVisible({ timeout: 30_000 });
    ความกว้าง[path] = Math.round((await กล่อง.boundingBox())?.width ?? 0);
  }
  const ค่า = [...new Set(Object.values(ความกว้าง))];
  expect(ค่า, `ช่องค้นหาต้องกว้างเท่ากันทุกหน้า (ได้ ${JSON.stringify(ความกว้าง)})`).toHaveLength(1);
});

test("[ui·hq] แถบตัวกรองใบเสนอราคาไม่มีป้ายนับจำนวนใบแล้ว", async ({ page }) => {
  // บอสสั่งเอาออก 20 ส.ค. 69 — จำนวนใบดูได้ที่การ์ด KPI ด้านบนอยู่แล้ว ไม่ต้องบอกซ้ำในแถบตัวกรอง
  await openAs(page, ADMIN, "hq", "/hq/quotations");
  await settle(page);
  await expect(page.getByText(/^พบ [\d,]+ ใบ$/)).toHaveCount(0);
});

test("[ui·hq] ไม่มีกรอบโฟกัสทุกที่ (ปุ่ม · ช่องค้นหา · ช่องเลือก · เมนูข้าง)", async ({ page }) => {
  // บอสสั่ง 2 พ.ย. 69 "เอากรอบแบบนี้ออกจากทุกที่ที่มันขึ้น" (รูป: ปุ่มการแจ้งเตือน · ช่องค้นหาใบเสนอราคา · ช่องเลือกทุกดีลเลอร์)
  //   เดิมข้อนี้ตรวจ "ต้องยังมีวงโฟกัส" (20 ส.ค. 69) — กลับด้านตามคำสั่งใหม่: กดเลือกแล้วต้องไม่มีกรอบ/เงาน้ำเงิน และขอบไม่เปลี่ยนสี
  await openAs(page, ADMIN, "hq", "/hq/quotations");
  await settle(page);
  const ตัวที่ตรวจ = [
    ["ปุ่มการแจ้งเตือน", page.getByRole("button", { name: /การแจ้งเตือน/ }).first()],
    ["ช่องค้นหา", page.getByPlaceholder(/ค้นหาเลขที่/).first()],
    ["ช่องเลือกดีลเลอร์", page.locator("select").filter({ has: page.locator("option", { hasText: "ทุกดีลเลอร์" }) }).first()],
    ["เมนูข้าง", page.locator(".nav-item.active").first()],
  ] as const;
  for (const [ชื่อ, el] of ตัวที่ตรวจ) {
    await expect(el, `${ชื่อ}: อยู่บนหน้า`).toBeVisible({ timeout: 20_000 });
    // เทียบกับตอนยังไม่เลือก (เมนูที่อยู่มีเงาประจำตัวอยู่แล้ว — ไม่ใช่กรอบโฟกัส)
    const ก่อน = await el.evaluate(e => ({ border: getComputedStyle(e).borderColor, shadow: getComputedStyle(e).boxShadow }));
    // โฟกัสแบบคีย์บอร์ด (Tab) เพื่อให้กฎ :focus-visible ทำงานจริง แล้วโฟกัสตัวที่ตรวจ
    await page.keyboard.press("Tab");
    await el.focus();
    const st = await el.evaluate(e => { const c = getComputedStyle(e); return { focused: document.activeElement === e, outline: c.outlineStyle === "none" ? "0px" : c.outlineWidth, shadow: c.boxShadow, border: c.borderColor }; });
    expect(st.focused, `${ชื่อ}: ถูกเลือกอยู่จริง`).toBe(true);
    expect(st.outline, `${ชื่อ}: ไม่มีกรอบโฟกัส`).toBe("0px");
    expect(st.shadow, `${ชื่อ}: ไม่มีเงากรอบเพิ่มตอนเลือก`).toBe(ก่อน.shadow);
    expect(st.border, `${ชื่อ}: ขอบไม่เปลี่ยนสีตอนเลือก`).toBe(ก่อน.border);
  }
});
