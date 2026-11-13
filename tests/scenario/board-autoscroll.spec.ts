import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { settle } from "./helpers";

// ── ลากการ์ดแล้วบอร์ด/หน้าเลื่อนตาม (บอสสั่ง 6 พ.ย. 69 · ตัวกลาง StageBoard · ทั้ง 2 บอร์ด) ───────────────────────────────────
//   ลากค้างใกล้ขอบขวาของบอร์ด = บอร์ดเลื่อนแนวนอน (scrollLeft เพิ่ม) · ใกล้ขอบล่างของจอ = หน้าเลื่อนลง (scrollY เพิ่ม)
//   ปล่อยการ์ดแล้วหยุด (ค่าไม่ขยับต่อ) · ยกเลิกการลาก (Esc) ก็หยุด
//   จอเล็ก 900×560 ให้บอร์ดกว้างกว่าจอและหน้ายาวกว่าจอ · ไม่ปล่อยบนคอลัมน์ (ปล่อยที่เดิม) — ไม่ย้ายขั้นของการ์ดใด
//   ตกบนโค้ดก่อนแก้: ลากค้างที่ขอบแล้วไม่มีอะไรเลื่อน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
// ผู้สนใจของข้อ (บอร์ดผู้สนใจต้องมีการ์ดให้ลาก · ไม่พึ่งข้อมูลร่วม) — ไม่ปล่อยบนคอลัมน์ ขั้นไม่เปลี่ยน
const แท็ก = `ZZTEST-บอร์ดเลื่อนตาม-${Date.now() % 1_000_000}`;
test.beforeAll(async () => {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: แท็ก, province: "ตราด" });
  expect(error).toBeNull();
});
test.afterAll(async () => { await (await db(ADMIN)).from("dealer_prospects").delete().eq("name", แท็ก); });

/** ตัวเลื่อนแนวตั้งของหน้า (หน้าต่าง หรือกล่องหลักที่เลื่อนได้) */
const ตำแหน่งแนวตั้ง = (page: Page) => page.evaluate(() => {
  // กล่องเลื่อนที่ใหญ่ที่สุด (กล่องหลักของหน้า) — ไม่ใช่แถบเมนูด้านข้างที่ก็เลื่อนได้
  const ตัว = [...document.querySelectorAll<HTMLElement>("*")].filter(e => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 20 && e.clientHeight > window.innerHeight * 0.5)
    .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
  return Math.max(window.scrollY, ตัว?.scrollTop ?? 0);
});

async function ตรวจบอร์ด(page: Page, ป้ายบอร์ด: string) {
  const บอร์ด = page.getByRole("region", { name: ป้ายบอร์ด });
  await expect(บอร์ด).toBeVisible({ timeout: 25_000 });
  const การ์ด = บอร์ด.locator("[data-board-card][draggable=true]").first();
  await expect(การ์ด, `${ป้ายบอร์ด}: มีการ์ดให้ลาก`).toBeVisible({ timeout: 25_000 });
  // การ์ดต้องอยู่ในจอก่อนกดลาก (จอเล็ก บอร์ดเริ่มใต้ขอบล่าง) · ชิดขอบล่างของจอ = หน้ายังเลื่อนลงต่อได้ (หน้าสั้น เลื่อนสุดแล้วตรวจไม่ได้)
  await การ์ด.evaluate(e => e.scrollIntoView({ block: "end" }));
  const ก่อนซ้าย = await บอร์ด.evaluate(e => e.scrollLeft);
  expect(await บอร์ด.evaluate(e => e.scrollWidth > e.clientWidth), `${ป้ายบอร์ด}: บอร์ดกว้างกว่าจอ (เลื่อนแนวนอนได้)`).toBe(true);
  const a = (await การ์ด.boundingBox())!;
  const b = (await บอร์ด.boundingBox())!;
  await page.mouse.move(a.x + 30, a.y + 15);
  await page.mouse.down();
  await page.mouse.move(a.x + 50, a.y + 25, { steps: 5 });
  // ค้างใกล้ขอบขวาของบอร์ด (ขยับเล็กน้อยให้มีเหตุการณ์ลากต่อเนื่อง)
  const ขวา = Math.min(b.x + b.width, 900) - 12, กลาง = Math.min(a.y + 25, 500);
  // ค้าง = ขยับเมาส์เล็กน้อยต่อเนื่อง (เมาส์จำลองส่งเหตุการณ์ลากเฉพาะตอนขยับ · เบราว์เซอร์จริงส่งต่อเนื่องแม้ค้างนิ่ง)
  for (let i = 0; i < 40; i++) await page.mouse.move(ขวา - (i % 3), กลาง, { steps: 5 });
  await expect.poll(() => บอร์ด.evaluate(e => e.scrollLeft), { timeout: 5_000, message: `${ป้ายบอร์ด}: ลากค้างใกล้ขอบขวา = บอร์ดเลื่อนแนวนอน` }).toBeGreaterThan(ก่อนซ้าย + 20);
  // ใกล้ขอบล่างของจอ = หน้าเลื่อนลง
  const ก่อนลง = await ตำแหน่งแนวตั้ง(page);
  for (let i = 0; i < 40; i++) await page.mouse.move(450 + (i % 3), 560 - 6, { steps: 5 });
  await expect.poll(() => ตำแหน่งแนวตั้ง(page), { timeout: 5_000, message: `${ป้ายบอร์ด}: ลากค้างใกล้ขอบล่าง = หน้าเลื่อนลง` }).toBeGreaterThan(ก่อนลง + 20);
  // ยกเลิกการลาก (Esc) แล้วปล่อย = หยุดเลื่อน
  //   จำลองกรณีที่ทำให้ไม่นิ่ง (trace deploy21 13 พ.ย. 69): เบราว์เซอร์ไม่ส่ง dragend/drop ตอนยกเลิก — ดักไว้ก่อนถึงบอร์ด (ระดับ window ก่อน document)
  //   ให้ผลแน่นอนทุกรอบ แทนที่จะขึ้นกับว่ารอบนั้นเบราว์เซอร์ส่งมาหรือไม่
  await page.evaluate(() => { for (const t of ["dragend", "drop"]) window.addEventListener(t, e => e.stopImmediatePropagation(), { capture: true }); });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  // วัดตำแหน่งทุกเฟรม 10 เฟรมติดกันทันทีหลังปล่อย — ต้องไม่ขยับเลย (13 พ.ย. 69 · เดิมรอ 800 ms แล้วเทียบ = ผลขึ้นกับจังหวะวัด
  //   ไม่นิ่ง 2 ครั้ง: ตัวเลื่อนวิ่งต่อจนหมดเวลาค้าง 250 ms เพราะไม่ได้ dragend · ตอนนี้ตัวเลื่อนหยุดทันทีเมื่อ Esc/ปล่อยเมาส์)
  //   ตกบนโค้ดเดิม: เฟรมถัดไปเลื่อนต่อทีละ ~22 px
  const ทุกเฟรม = await บอร์ด.evaluate(async (e) => {
    const ตัว = [...document.querySelectorAll<HTMLElement>("*")].filter(x => /(auto|scroll)/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight + 20 && x.clientHeight > window.innerHeight / 2)
      .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
    const อ่าน = () => `${e.scrollLeft},${Math.max(window.scrollY, ตัว?.scrollTop ?? 0)}`;
    const ได้: string[] = [อ่าน()];
    for (let i = 0; i < 10; i++) { await new Promise(r => requestAnimationFrame(() => r(null))); ได้.push(อ่าน()); }
    return ได้;
  });
  expect(new Set(ทุกเฟรม).size, `${ป้ายบอร์ด}: ปล่อย/ยกเลิกแล้วหยุดเลื่อนทันที (ตำแหน่ง 11 เฟรม: ${ทุกเฟรม.join(" · ")})`).toBe(1);
}

test("[ui·hq] บอร์ดผู้สนใจ: ลากใกล้ขอบ = บอร์ด/หน้าเลื่อนตาม · ปล่อยแล้วหยุด", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 900, height: 560 });
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.locator('button[title="บอร์ด"]').click();
  await ตรวจบอร์ด(page, "บอร์ดผู้สนใจเป็นดีลเลอร์");
  assertNoErrors(errs, "บอร์ดผู้สนใจเลื่อนตาม");
});

test("[ui·dealer] บอร์ดลีด: ลากใกล้ขอบ = บอร์ด/หน้าเลื่อนตาม · ปล่อยแล้วหยุด", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 900, height: 560 });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "บอร์ด", exact: true }).first().click().catch(() => {});
  const ป้าย = await page.locator("[data-stage-board]").first().getAttribute("aria-label");
  await ตรวจบอร์ด(page, ป้าย ?? "");
  assertNoErrors(errs, "บอร์ดลีดเลื่อนตาม");
});
