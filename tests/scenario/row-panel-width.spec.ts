import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { settle } from "./helpers";

// ── แผงเลื่อนขวาที่เปิดจากแถวตาราง = ตัวกลางเดียว (RowPanel · คนรวมงานสั่ง + บอสตอบขอบเขต 10 พ.ย. 69) ─────────────────
//   ทุกแผงจากแถว (HQ: ดีลเลอร์ · ลูกค้าเป้าหมายทั้งเครือ · ลูกค้าทั้งเครือ · ผู้สนใจ · ตั้งค่า › ผู้ใช้งาน
//                  ดีลเลอร์: ลูกค้าเป้าหมาย · ลูกค้า) กว้างเท่าแผงดีลเลอร์ HQ (640 · บอสสั่ง 10 พ.ย. 69 — 820 ที่เลือกก่อนกว้างไป) ชิดขวาห่างขอบ 12 ที่จอ 1366 และ 1920 · จอ < 1024 เต็มจอ
//   ไม่อยู่ในข้อนี้ (บอสตอบ): หน้าต่างใบเสนอราคา/ใบ HQ/ใบค่าแฟรนไชส์ · หน้าต่างเจาะลึก — คงกลางจอ
//   ตกบนโค้ดเดิม: ลูกค้าเป้าหมายทั้งเครือ 420 · ลูกค้าทั้งเครือ 460 · ผู้สนใจ/แผงฝั่งดีลเลอร์ กลางจอ 820 · ผู้ใช้ กลางจอ
//   ไม่มีแผงไหนมี [data-row-panel] และจอแคบไม่เต็มจอ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const ผู้สนใจ = `ZZTEST-แผงจากแถว-${Date.now() % 1_000_000}`;
test.beforeAll(async () => {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: ผู้สนใจ, province: "ตราด" });
  expect(error, "สร้างผู้สนใจของข้อ").toBeNull();
});
test.afterAll(async () => { await (await db(ADMIN)).from("dealer_prospects").delete().eq("name", ผู้สนใจ); });

const แผง = (page: Page) => page.locator("[data-row-panel]");
const จอ = [{ w: 1366, h: 768 }, { w: 1920, h: 1080 }, { w: 900, h: 760 }] as const;

/** ตรวจกรอบแผงที่จอปัจจุบัน: ≥ 1024 = กว้างเท่าแผงดีลเลอร์ (640) ชิดขวา 12 บน/ล่าง 12 · < 1024 = เต็มจอ */
async function ตรวจกรอบ(page: Page, ชื่อ: string) {
  const ตัว = แผง(page);
  await expect(ตัว, `${ชื่อ}: แผงจากแถวเปิด (ตัวกลาง RowPanel)`).toHaveCount(1, { timeout: 25_000 });
  await expect(ตัว).toBeVisible();
  // แผงเลื่อนเข้าจากขวา — รอจนตำแหน่งนิ่ง (จบการเคลื่อนไหว) ก่อนวัด
  await ตัว.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
  const กรอบ = (await ตัว.boundingBox())!;
  const vp = page.viewportSize()!;
  const ที่ = `${ชื่อ} @${vp.width}×${vp.height}`;
  if (vp.width >= 1024) {
    expect(Math.round(กรอบ.width), `${ที่}: กว้าง 640 (เท่าแผงดีลเลอร์ HQ)`).toBe(640);
    expect(Math.round(vp.width - (กรอบ.x + กรอบ.width)), `${ที่}: ชิดขวาห่างขอบ 12`).toBe(12);
    expect(Math.round(กรอบ.y), `${ที่}: ห่างขอบบน 12`).toBe(12);
    expect(Math.round(vp.height - (กรอบ.y + กรอบ.height)), `${ที่}: ห่างขอบล่าง 12`).toBe(12);
  } else {
    expect([Math.round(กรอบ.x), Math.round(กรอบ.y), Math.round(กรอบ.width), Math.round(กรอบ.height)], `${ที่}: จอ < 1024 = เต็มจอ`)
      .toEqual([0, 0, vp.width, vp.height]);
  }
  // หัวแผง (แถบน้ำเงิน) อยู่บนสุดของแผง · ไม่มีแนวนอนล้นในแผง
  await expect(ตัว.locator("[data-panel-head]").first(), `${ที่}: มีหัวแผง`).toBeVisible();
  expect(await ตัว.evaluate(e => e.scrollWidth - e.clientWidth), `${ที่}: แผงไม่ล้นแนวนอน`).toBeLessThanOrEqual(1);
}
async function ปิดแผง(page: Page) {
  await page.keyboard.press("Escape");
  await expect(แผง(page), "Esc ปิดแผง").toHaveCount(0);
}

test("[ui·hq] แผงจากแถวทุกหน้า HQ กว้าง 640 (= แผงดีลเลอร์) ชิดขวา · จอ < 1024 เต็มจอ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const เปิด: [string, () => Promise<void>][] = [
    ["แผงดีลเลอร์ /hq/dealers", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.locator("tbody tr[aria-label^='เปิดแผงดีลเลอร์']").first().click();
    }],
    ["แผงลูกค้าเป้าหมายทั้งเครือ /hq/leads", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    }],
    ["แผงลูกค้าทั้งเครือ /hq/customers", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/customers`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.locator("tbody tr[aria-label^='เปิดรายละเอียดลูกค้า']").first().click();
    }],
    ["แผงผู้สนใจ /hq/prospects", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByLabel("ค้นหาผู้สนใจ").fill(ผู้สนใจ);
      await page.locator("tbody tr").filter({ hasText: ผู้สนใจ }).first().click();
    }],
    ["แผงผู้ใช้ ตั้งค่า › ผู้ใช้งาน", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/users`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.locator("tbody tr[aria-label^='เปิดรายละเอียดผู้ใช้']").first().click();
    }],
  ];
  for (const { w, h } of จอ) {
    await page.setViewportSize({ width: w, height: h });
    for (const [ชื่อ, ทำ] of เปิด) { await ทำ(); await ตรวจกรอบ(page, ชื่อ); await ปิดแผง(page); }
  }
  assertNoErrors(errs, "แผงจากแถว HQ");
});

test("[ui·dealer] แผงจากแถวฝั่งดีลเลอร์ (ลูกค้าเป้าหมาย · ลูกค้า) กว้าง 640 (= แผงดีลเลอร์ HQ) ชิดขวา · จอ < 1024 เต็มจอ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const เปิด: [string, () => Promise<void>][] = [
    ["แผงลูกค้าเป้าหมาย /leads", async () => {
      await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "ตาราง", exact: true }).click();
      await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    }],
    ["แผงลูกค้า /customers", async () => {
      await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    }],
  ];
  for (const { w, h } of จอ) {
    await page.setViewportSize({ width: w, height: h });
    for (const [ชื่อ, ทำ] of เปิด) { await ทำ(); await ตรวจกรอบ(page, ชื่อ); await ปิดแผง(page); }
  }
  assertNoErrors(errs, "แผงจากแถวดีลเลอร์");
});

test("[ui·hq] แผงซ้อนในแผงดีลเลอร์ (ลูกค้า) อยู่บนสุด · Esc ปิดแผงบนก่อน แผงดีลเลอร์ยังเปิด", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill("RYG");
  await page.locator("tbody tr[aria-label^='เปิดแผงดีลเลอร์']").filter({ hasText: "RYG" }).first().click();
  const แผงดีลเลอร์ = page.locator("[data-dealer-panel]");
  await expect(แผงดีลเลอร์).toBeVisible({ timeout: 20_000 });
  await แผงดีลเลอร์.locator("[data-panel-tab='customers']").click();
  await แผงดีลเลอร์.locator("[data-panel-row]").first().click();
  await expect(แผง(page), "แผงลูกค้าซ้อนบนแผงดีลเลอร์").toHaveCount(2, { timeout: 20_000 });
  await page.keyboard.press("Escape");
  await expect(แผง(page), "Esc ปิดเฉพาะแผงบน").toHaveCount(1);
  await expect(แผงดีลเลอร์, "แผงดีลเลอร์ยังเปิดอยู่").toBeVisible();
});
