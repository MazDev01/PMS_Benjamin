import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { settle, แถวตามชื่อ, ตั้งต้น } from "./helpers";
import { ความกว้างหน้าต่าง } from "../../packages/shared/lib/windowSize";

// ── หน้าต่างรายละเอียดที่เปิดจากแถวตาราง = ตัวกลางเดียว (RowPanel · คนรวมงานสั่ง + บอสตอบขอบเขต 10 พ.ย. 69) ─────────────────
//   ทุกแผงจากแถว (HQ: ดีลเลอร์ · ลูกค้าเป้าหมายทั้งเครือ · ลูกค้าทั้งเครือ · ผู้สนใจ · ตั้งค่า › ผู้ใช้งาน
//                  ดีลเลอร์: ลูกค้าเป้าหมาย · ลูกค้า) กว้างเท่าแผงดีลเลอร์ HQ (640 · บอสสั่ง 10 พ.ย. 69 — 820 ที่เลือกก่อนกว้างไป) ที่จอ 1366 และ 1920 · จอ < 1024 เต็มจอ
//   12 พ.ย. 69 (บอสสั่ง · ตรวจกลับด้านจาก "ชิดขวาห่างขอบ 12"): เปิดกลางจอ — ช่องว่างซ้าย = ขวา · บน/ล่าง 12 · พื้นหลังมืดเต็มจอ
//     ปิดด้วยการกดพื้นหลัง (จอ ≥ 1024) และ Esc · หน้าต่างซ้อน: กดพื้นหลัง/Esc ปิดทีละชั้น
//     ตกบนโค้ดเดิม: หน้าต่างชิดขวา (ช่องว่างซ้าย 714 / ขวา 12 ที่จอ 1366)
//   ไม่อยู่ในข้อนี้ (บอสตอบ): หน้าต่างใบเสนอราคา/ใบ HQ/ใบค่าแฟรนไชส์ · หน้าต่างเจาะลึก — คงกลางจอ
//   ตกบนโค้ดเดิม: ลูกค้าเป้าหมายทั้งเครือ 420 · ลูกค้าทั้งเครือ 460 · ผู้สนใจ/แผงฝั่งดีลเลอร์ กลางจอ 820 · ผู้ใช้ กลางจอ
//   ไม่มีแผงไหนมี [data-row-panel] และจอแคบไม่เต็มจอ
//   13 พ.ย. 69 บอสสั่ง (ข้อยกเว้นของกฎ 640): แผงดีลเลอร์ HQ กว้าง 820 เท่าหน้าต่างใบเสนอราคา · แผงอื่นทุกหน้า (รวมแผงลูกค้าที่ซ้อนบนแผงดีลเลอร์) คง 640
//     เลือกที่ตัวกลาง RowPanel กว้าง="กว้าง" · ตกบนโค้ดเดิม: แผงดีลเลอร์ 640
//   18 พ.ย. 69 บอสตัดสิน (ทับ 640 + ข้อยกเว้น): ทุกแผงจากแถว HQ + ดีลเลอร์ กว้างเท่าหน้าต่างใบเสนอราคา (ความกว้างหน้าต่าง 820 · lib/windowSize)
//     ตกบนโค้ดเดิม: แผงลูกค้าเป้าหมาย/ลูกค้า/ผู้สนใจ/ผู้ใช้ 640
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

/** ตรวจกรอบแผงที่จอปัจจุบัน: ≥ 1024 = กว้างเท่าหน้าต่างใบเสนอราคา (820 · 18 พ.ย. 69) กลางจอ (ซ้าย = ขวา) บน/ล่าง 12 · < 1024 = เต็มจอ */
/** จำนวน = แผงที่ต้องเปิดอยู่ (ซ้อน = 2) · วัดแผงบนสุด (ตัวท้ายในเอกสาร) */
async function ตรวจกรอบ(page: Page, ชื่อ: string, จำนวน = 1, กว้าง = ความกว้างหน้าต่าง) {
  await expect(แผง(page), `${ชื่อ}: แผงจากแถวเปิด (ตัวกลาง RowPanel)`).toHaveCount(จำนวน, { timeout: 25_000 });
  const ตัว = แผง(page).last();
  await expect(ตัว).toBeVisible();
  // หน้าต่างค่อย ๆ ขึ้น — รอจนตำแหน่งนิ่ง (จบการเคลื่อนไหว) ก่อนวัด
  await ตัว.evaluate(e => Promise.all(e.getAnimations().map(a => a.finished)));
  const กรอบ = (await ตัว.boundingBox())!;
  const vp = page.viewportSize()!;
  const ที่ = `${ชื่อ} @${vp.width}×${vp.height}`;
  if (vp.width >= 1024) {
    expect(Math.round(กรอบ.width), `${ที่}: กว้าง ${กว้าง} = หน้าต่างใบเสนอราคา (บอสตัดสิน 18 พ.ย. 69)`).toBe(กว้าง);
    const ซ้าย = Math.round(กรอบ.x), ขวา = Math.round(vp.width - (กรอบ.x + กรอบ.width));
    expect(Math.abs(ซ้าย - ขวา), `${ที่}: กลางจอ — ช่องว่างซ้าย ${ซ้าย} = ขวา ${ขวา} (ไม่ชิดขวาแบบเดิม)`).toBeLessThanOrEqual(1);
    expect(ซ้าย, `${ที่}: มีพื้นหลังให้กดทั้งสองข้าง`).toBeGreaterThan(12);
    expect(Math.round(กรอบ.y), `${ที่}: ห่างขอบบน 12`).toBe(12);
    expect(Math.round(vp.height - (กรอบ.y + กรอบ.height)), `${ที่}: ห่างขอบล่าง 12`).toBe(12);
  } else {
    expect([Math.round(กรอบ.x), Math.round(กรอบ.y), Math.round(กรอบ.width), Math.round(กรอบ.height)], `${ที่}: จอ < 1024 = เต็มจอ`)
      .toEqual([0, 0, vp.width, vp.height]);
  }
  // พื้นหลังมืดเต็มจอ อยู่ใต้หน้าต่างบนสุด
  const พื้นหลัง = page.locator("[data-row-panel-backdrop]").last();
  const พ = (await พื้นหลัง.boundingBox())!;
  expect([Math.round(พ.x), Math.round(พ.y), Math.round(พ.width), Math.round(พ.height)], `${ที่}: พื้นหลังเต็มจอ`).toEqual([0, 0, vp.width, vp.height]);
  // สีพื้นหลัง rgba(r, g, b, a) — a = ความทึบ (rgb ไม่มี a = ทึบเต็ม)
  const สี = await พื้นหลัง.evaluate(e => (getComputedStyle(e).backgroundColor.match(/[\d.]+/g) ?? []).map(Number));
  expect(สี[3] ?? 1, `${ที่}: พื้นหลังมืดลง (ทึบเกิน 0.2 · ได้ ${สี.join(",")})`).toBeGreaterThan(0.2);
  // หัวแผง (แถบน้ำเงิน) อยู่บนสุดของแผง · ไม่มีแนวนอนล้นในแผง
  await expect(ตัว.locator("[data-panel-head]").first(), `${ที่}: มีหัวแผง`).toBeVisible();
  expect(await ตัว.evaluate(e => e.scrollWidth - e.clientWidth), `${ที่}: แผงไม่ล้นแนวนอน`).toBeLessThanOrEqual(1);
}
/** ปิด: จอ ≥ 1024 กดพื้นหลังข้างซ้ายของหน้าต่าง (หน้าต่างกลางจอ = มีพื้นหลังให้กด) · จอแคบ (เต็มจอ ไม่มีพื้นหลังให้กด) = Esc */
async function ปิดแผง(page: Page) {
  const vp = page.viewportSize()!;
  if (vp.width >= 1024) {
    await page.mouse.click(6, Math.round(vp.height / 2));
    await expect(แผง(page), "กดพื้นหลัง = ปิดหน้าต่าง").toHaveCount(0);
  } else {
    await page.keyboard.press("Escape");
    await expect(แผง(page), "Esc ปิดแผง").toHaveCount(0);
  }
}

test("[ui·hq] แผงจากแถวทุกหน้า HQ กว้างเท่าหน้าต่างใบเสนอราคา (820) กลางจอ · พื้นหลังมืด กดปิดได้ · จอ < 1024 เต็มจอ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  // เปิดแถวของข้อมูลตั้งต้นด้วยชื่อตรงตัว (บอสสั่ง 12 พ.ย. 69) — เดิมกดแถวแรกของรายการทั้งเครือ ซึ่งเป็นของข้ออื่นที่รันพร้อมกันได้ (ถูกลบระหว่างเปิด = แผงปิดเอง)
  const ชื่อRYG = ((await (await db(ADMIN)).from("dealers").select("name").eq("code", "RYG").single()).data as { name: string }).name;
  const เปิด: [string, () => Promise<void>][] = [
    ["แผงดีลเลอร์ /hq/dealers", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill("RYG");
      await (await แถวตามชื่อ(page, `เปิดหน้าต่างรายละเอียดดีลเลอร์ ${ชื่อRYG}`)).click();
    }],
    ["แผงลูกค้าเป้าหมายทั้งเครือ /hq/leads", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
      await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้าเป้าหมาย ${ตั้งต้น.ลีดRYG}`, ตั้งต้น.ลีดRYG, /ค้นหาบริษัท/)).getByRole("button", { name: "ดูรายละเอียด" }).click();
    }],
    ["แผงลูกค้าทั้งเครือ /hq/customers", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/customers`, { waitUntil: "domcontentloaded" }); await settle(page);
      await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้า ${ตั้งต้น.ลูกค้าRYG}`, ตั้งต้น.ลูกค้าRYG, /ค้นหาชื่อลูกค้า/)).click();
    }],
    ["แผงผู้สนใจ /hq/prospects", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByLabel("ค้นหาผู้สนใจ").fill(ผู้สนใจ);
      await page.locator("tbody tr").filter({ hasText: ผู้สนใจ }).first().click();
    }],
    ["แผงผู้ใช้ ตั้งค่า › ผู้ใช้งาน", async () => {
      await page.goto(`${HQ_ORIGIN}/hq/users`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.locator("tbody tr[aria-label^='เปิดรายละเอียดผู้ใช้']").filter({ hasText: ADMIN.email }).click();   // บัญชี HQ ของชุดทดสอบเอง
    }],
  ];
  for (const { w, h } of จอ) {
    await page.setViewportSize({ width: w, height: h });
    for (const [ชื่อ, ทำ] of เปิด) { await ทำ(); await ตรวจกรอบ(page, ชื่อ); await ปิดแผง(page); }
  }
  assertNoErrors(errs, "แผงจากแถว HQ");
});

test("[ui·dealer] แผงจากแถวฝั่งดีลเลอร์ (ลูกค้าเป้าหมาย · ลูกค้า) กว้างเท่าหน้าต่างใบเสนอราคา (820) กลางจอ · พื้นหลังมืด กดปิดได้ · จอ < 1024 เต็มจอ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const เปิด: [string, () => Promise<void>][] = [
    ["แผงลูกค้าเป้าหมาย /leads", async () => {
      await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
      await page.getByRole("button", { name: "ตาราง", exact: true }).click();
      await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้าเป้าหมาย ${ตั้งต้น.ลีดRYG}`, ตั้งต้น.ลีดRYG, /ค้นหาบริษัท ผู้ติดต่อ/)).getByRole("button", { name: "ดูรายละเอียด" }).click();
    }],
    ["แผงลูกค้า /customers", async () => {
      await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" }); await settle(page);
      await (await แถวตามชื่อ(page, `เปิดรายละเอียดลูกค้า ${ตั้งต้น.ลูกค้าRYG}`, ตั้งต้น.ลูกค้าRYG, /ค้นหาลูกค้า,/)).getByRole("button", { name: "ดูรายละเอียด" }).click();
    }],
  ];
  for (const { w, h } of จอ) {
    await page.setViewportSize({ width: w, height: h });
    for (const [ชื่อ, ทำ] of เปิด) { await ทำ(); await ตรวจกรอบ(page, ชื่อ); await ปิดแผง(page); }
  }
  assertNoErrors(errs, "แผงจากแถวดีลเลอร์");
});

test("[ui·hq] แผงซ้อนในแผงดีลเลอร์ (ลูกค้า) อยู่บนสุด กลางจอ · Esc / กดพื้นหลัง ปิดทีละชั้น แผงดีลเลอร์ยังเปิด", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder(/ค้นหาดีลเลอร์/).fill("RYG");
  await page.locator("tbody tr[aria-label^='เปิดหน้าต่างรายละเอียดดีลเลอร์']").filter({ hasText: "RYG" }).first().click();
  const แผงดีลเลอร์ = page.locator("[data-dealer-panel]");
  await expect(แผงดีลเลอร์).toBeVisible({ timeout: 20_000 });
  await แผงดีลเลอร์.locator("[data-panel-tab='customers']").click();
  await แผงดีลเลอร์.locator("[data-panel-row]").filter({ hasText: ตั้งต้น.ลูกค้าRYG }).click();   // ลูกค้าตั้งต้นของ RYG (ไม่หยิบแถวแรก · 12 พ.ย. 69)
  await expect(แผง(page), "แผงลูกค้าซ้อนบนแผงดีลเลอร์").toHaveCount(2, { timeout: 20_000 });
  await ตรวจกรอบ(page, "แผงลูกค้าซ้อนบนแผงดีลเลอร์", 2);   // แผงบนก็กลางจอ (วัดตัวบน · พื้นหลังของแผงบน)
  await page.keyboard.press("Escape");
  await expect(แผง(page), "Esc ปิดเฉพาะแผงบน").toHaveCount(1);
  await expect(แผงดีลเลอร์, "แผงดีลเลอร์ยังเปิดอยู่").toBeVisible();
  // ซ้อนอีกครั้ง แล้วปิดด้วยพื้นหลัง: ปิดทีละชั้น
  await แผงดีลเลอร์.locator("[data-panel-row]").filter({ hasText: ตั้งต้น.ลูกค้าRYG }).click();
  await expect(แผง(page), "เปิดแผงลูกค้าซ้อนอีกครั้ง").toHaveCount(2, { timeout: 20_000 });
  await page.mouse.click(6, 384);
  await expect(แผง(page), "กดพื้นหลัง = ปิดเฉพาะแผงบน").toHaveCount(1);
  await expect(แผงดีลเลอร์, "แผงดีลเลอร์ยังเปิดอยู่").toBeVisible();
  await page.mouse.click(6, 384);
  await expect(แผง(page), "กดพื้นหลังอีกครั้ง = ปิดแผงดีลเลอร์").toHaveCount(0);
});
