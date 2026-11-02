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

test("[ui·hq] กรอบโฟกัส: คลิกไม่แสดง · กด Tab แสดง (ปุ่ม · ช่องค้นหา · ช่องเลือก · เมนูข้าง)", async ({ page }) => {
  // บอสสั่ง 2 พ.ย. 69 รอบบ่าย "ตอนคลิกไม่แสดง แต่ตอนกด Tab ให้แสดง" — ทับคำสั่งเช้า "ไม่มีกรอบทุกกรณี"
  //   ประวัติ: 20 ส.ค. 69 ต้องมีวงโฟกัส → เช้า 2 พ.ย. ไม่มีกรอบเลย (ข้อนี้เคยกลับด้าน) → ตอนนี้ตรวจทั้งสองทาง
  //   ทางคลิก: กดเมาส์แล้วต้องไม่มีกรอบ/เงา และขอบไม่เปลี่ยนสี (ของเดิมก่อนเช้า: ช่องค้นหา/ช่องเลือกขึ้นขอบ+เงาน้ำเงินตอนคลิก)
  //   ทาง Tab: ต้องมีกรอบให้คนใช้คีย์บอร์ดเห็น (ของเช้า: ไม่มีเลย)
  await openAs(page, ADMIN, "hq", "/hq/quotations");
  await settle(page);
  const ตัวที่ตรวจ = [
    ["ปุ่มการแจ้งเตือน", page.getByRole("button", { name: /การแจ้งเตือน/ }).first()],
    ["ช่องค้นหา", page.getByPlaceholder(/ค้นหาเลขที่/).first()],
    ["ช่องเลือกดีลเลอร์", page.locator("select").filter({ has: page.locator("option", { hasText: "ทุกดีลเลอร์" }) }).first()],
    ["เมนูข้าง", page.locator(".nav-item.active").first()],
  ] as const;
  const สภาพ = (el: (typeof ตัวที่ตรวจ)[number][1]) => el.evaluate(e => {
    const c = getComputedStyle(e);
    return { focused: document.activeElement === e, outline: c.outlineStyle === "none" ? "0px" : c.outlineWidth, shadow: c.boxShadow, border: c.borderColor };
  });
  // วงกรอบ = เงาที่ไม่เบลอแต่ขยายรอบตัว (เช่น 0 0 0 3px) — แบบที่กรอบโฟกัสเดิมของช่องกรอก/ช่องค้นหาใช้
  //   เงาตอนชี้/ตอนกดปุ่มค้าง (เบลอ ไม่ขยาย) ไม่ใช่กรอบ — เปลี่ยนตามจังหวะกดได้ จึงไม่เทียบทั้งก้อน
  const วงกรอบ = (shadow: string) => (shadow === "none" ? [] : shadow.split(/,(?![^(]*\))/)).filter(ชั้น => {
    const ตัวเลข = (ชั้น.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    return ตัวเลข.length >= 4 && ตัวเลข[2] === 0 && ตัวเลข[3] > 0;
  });
  const ปล่อยโฟกัส = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const [ชื่อ, el] of ตัวที่ตรวจ) {
    await expect(el, `${ชื่อ}: อยู่บนหน้า`).toBeVisible({ timeout: 20_000 });
    await ปล่อยโฟกัส();
    // เทียบกับตอนเมาส์ชี้อยู่แต่ยังไม่เลือก (เงาตอนชี้/เงาประจำตัวของเมนูที่อยู่ ไม่ใช่กรอบโฟกัส)
    await el.scrollIntoViewIfNeeded();   // ช่องค้นหารายการอยู่ใต้ตารางเจาะลึก — เมาส์ต้องกดถึงในจอ
    const กล่อง = (await el.boundingBox())!;
    await page.mouse.move(กล่อง.x + กล่อง.width / 2, กล่อง.y + กล่อง.height / 2);
    // เงาตอนชี้มีจังหวะเปลี่ยน (transition) — อ่านซ้ำจนสองครั้งติดกันเท่ากัน (ไม่ใช่การรอเวลา)
    let ก่อน = await สภาพ(el);
    await expect.poll(async () => { const ตอนนี้ = await สภาพ(el); const นิ่ง = JSON.stringify(ตอนนี้) === JSON.stringify(ก่อน); ก่อน = ตอนนี้; return นิ่ง; },
      { message: `${ชื่อ}: หน้าตาตอนชี้นิ่งแล้ว` }).toBe(true);

    // ทางคลิก: กดเมาส์ค้างที่ตัวนั้น (เบราว์เซอร์โฟกัสตอนกดลง) → วัด → ปล่อย (ไม่ให้ปุ่ม/เมนูทำงานกลางการวัด)
    await page.mouse.down();
    const คลิก = await สภาพ(el);
    // ปล่อยเมาส์นอกตัวนั้น = ไม่นับเป็นคลิก (ปุ่มแจ้งเตือนไม่เปิดแผงมาบังตัวถัดไป · เมนูไม่เปลี่ยนหน้า)
    await page.mouse.move(กล่อง.x + กล่อง.width / 2, กล่อง.y + กล่อง.height + 80);
    await page.mouse.up();
    expect(คลิก.focused, `${ชื่อ}: คลิกแล้วถูกเลือกอยู่จริง`).toBe(true);
    expect(คลิก.outline, `${ชื่อ}: คลิก = ไม่มีกรอบโฟกัส`).toBe("0px");
    expect(วงกรอบ(คลิก.shadow), `${ชื่อ}: คลิก = ไม่มีวงเงากรอบเพิ่ม (${คลิก.shadow})`).toEqual(วงกรอบ(ก่อน.shadow));
    expect(คลิก.border, `${ชื่อ}: คลิก = ขอบไม่เปลี่ยนสี`).toBe(ก่อน.border);

    // ทาง Tab: กด Tab (ผู้ใช้คีย์บอร์ด) แล้วโฟกัสตัวที่ตรวจ → ต้องมีกรอบ
    await ปล่อยโฟกัส();
    await page.keyboard.press("Tab");
    await el.focus();
    const แท็บ = await สภาพ(el);
    expect(แท็บ.focused, `${ชื่อ}: Tab แล้วถูกเลือกอยู่จริง`).toBe(true);
    expect(แท็บ.outline, `${ชื่อ}: กด Tab = มีกรอบโฟกัส`).not.toBe("0px");
  }
});
