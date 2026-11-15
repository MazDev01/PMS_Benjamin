import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";

// ── การ์ดบอร์ดตัวกลาง BoardCard (บอสสั่ง 13 พ.ย. 69) — บอร์ดผู้สนใจเป็นดีลเลอร์ (HQ) หน้าตาเดียวกับบอร์ดลูกค้าเป้าหมาย (ดีลเลอร์) ─────
//   (1) ทั้งสองหน้าวาดการ์ดด้วย BoardCard ตัวเดียวกัน (ไฟล์) · (2) การ์ดทุกใบบนทั้งสองบอร์ดมีครบทุกช่อง:
//       ชื่อ + ไอคอนตา · ป้ายชื่อ · โทรศัพท์ · อีเมล · จังหวัด · เริ่มติดต่อ · ติดต่อล่าสุด · ผู้ดูแล · ป้ายสถานะ · แถบ % · ติดตามครั้งถัดไป · ปุ่มย้ายขั้น
//   (3) ผู้สนใจของข้อ: ช่องที่มีค่า = ค่าจริง · ช่องที่ไม่มี (ชื่อบนโซเชียล/อีเมล/ผู้ดูแล/ติดต่อล่าสุด) = "—" ไม่กุ · แถบ % = ขั้นจริง (ใหม่ = 0%)
//   งานหน้าตา — ไม่ต้องพิสูจน์บนโค้ดเดิม (คนรวมงานสั่ง 13 พ.ย. 69)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
const แท็ก = `ZZTEST-การ์ดตัวกลาง-${Date.now() % 1_000_000}`;
test.beforeAll(async () => {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").insert({
    ...ช่องผู้สนใจครบ(), name: แท็ก, province: "ตราด", social: null, email: null, assigned: null, first_contact: "2026-11-01", follow_up: null,
  });
  expect(error).toBeNull();
});
test.afterAll(async () => { await (await db(ADMIN)).from("dealer_prospects").delete().eq("name", แท็ก); });

const ช่องที่ต้องมี = ["โทรศัพท์", "อีเมล", "จังหวัด", "เริ่มติดต่อ", "ติดต่อล่าสุด", "ติดตามครั้งถัดไป"];

async function ตรวจครบทุกใบ(page: Page, ป้ายบอร์ด: string) {
  const บอร์ด = page.getByRole("region", { name: ป้ายบอร์ด });
  await expect(บอร์ด.locator("[data-board-card-body]").nth(0), `${ป้ายบอร์ด}: มีการ์ด`).toBeVisible({ timeout: 25_000 });
  const ทุกใบ = await บอร์ด.locator("[data-board-card]").evaluateAll((cards, ช่อง) => cards.map(c => ({
    id: c.getAttribute("data-board-card"),
    ตัวกลาง: !!c.querySelector("[data-board-card-body]"),
    ชื่อ: !!c.querySelector("[data-board-name]")?.textContent?.trim(),
    ตา: !!c.querySelector("[data-board-name] + svg"),
    ป้ายชื่อ: !!c.querySelector("[data-board-tag]"),
    ผู้ดูแล: !!c.querySelector("[data-board-owner]")?.textContent?.trim() || !!c.querySelector("[data-board-owner] img, [data-board-owner] span"),
    ป้ายสถานะ: !!c.querySelector("[data-mini-stage] > *:first-child")?.textContent?.trim(),
    แถบ: c.querySelector("[data-mini-stage] [data-progress]")?.getAttribute("data-progress") ?? null,
    ขาดช่อง: (ช่อง as string[]).filter(k => !c.querySelector(`[data-board-field="${k}"] [data-board-value-of="${k}"]`)?.textContent?.trim()),
    ปุ่มย้าย: !!c.querySelector("[data-move-menu]"),
  })), ช่องที่ต้องมี);
  expect(ทุกใบ.length, `${ป้ายบอร์ด}: มีการ์ด`).toBeGreaterThan(0);
  for (const ใบ of ทุกใบ) {
    const ชื่อ = `${ป้ายบอร์ด} การ์ด ${ใบ.id}`;
    expect(ใบ.ตัวกลาง, `${ชื่อ}: วาดด้วยการ์ดตัวกลาง`).toBe(true);
    expect([ใบ.ชื่อ, ใบ.ตา, ใบ.ป้ายชื่อ, ใบ.ผู้ดูแล, ใบ.ป้ายสถานะ], `${ชื่อ}: ชื่อ · ไอคอนตา · ป้ายชื่อ · ผู้ดูแล · ป้ายสถานะ`).toEqual([true, true, true, true, true]);
    expect(ใบ.แถบ, `${ชื่อ}: แถบความคืบหน้า %`).toMatch(/^\d+$/);
    expect(ใบ.ขาดช่อง, `${ชื่อ}: ครบทุกช่อง (ไม่มีข้อมูล = "—")`).toEqual([]);
  }
  // ปุ่มย้ายขั้นอยู่บนการ์ดที่ย้ายได้ (การ์ดปิดแล้วย้ายไม่ได้ = ไม่มีปุ่ม · ตามกติกาเดิม)
  expect(ทุกใบ.some(ใบ => ใบ.ปุ่มย้าย), `${ป้ายบอร์ด}: มีปุ่มย้ายไปขั้น… บนการ์ด`).toBe(true);
}

test("[ui] ทั้งสองบอร์ดวาดการ์ดด้วยตัวกลาง BoardCard ตัวเดียวกัน", () => {
  for (const f of ["apps/hq/app/(app)/hq/prospects/page.tsx", "apps/dealer/app/(app)/leads/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    expect(src, `${f}: import BoardCard จากตัวกลาง`).toContain('import { BoardCard');
    expect(src, `${f}: นำเข้าจาก @pms/shared/components/ui/BoardCard`).toMatch(/from "@pms\/shared\/components\/ui\/BoardCard"/);
    const ส่วนการ์ด = src.slice(src.indexOf("renderCard="), src.indexOf("renderCard=") + 4000);
    expect(ส่วนการ์ด, `${f}: renderCard ใช้ <BoardCard`).toContain("<BoardCard");
  }
});

test("[ui·hq] บอร์ดผู้สนใจ: การ์ดครบทุกช่อง · ข้อมูลที่ไม่มี = \"—\" · แถบ % จากขั้นจริง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.locator('button[title="บอร์ด"]').click();
  await ตรวจครบทุกใบ(page, "บอร์ดผู้สนใจเป็นดีลเลอร์");
  // ผู้สนใจของข้อ (ขั้นใหม่ · ไม่มีโซเชียล/อีเมล/ผู้ดูแล/ไม่เคยติดต่อ/ไม่มีนัด)
  const การ์ด = page.locator("[data-board-card]").filter({ has: page.locator("[data-board-name]", { hasText: แท็ก }) });
  await expect(การ์ด).toHaveCount(1);
  const ค่า = (k: string) => การ์ด.locator(`[data-board-value-of="${k}"]`);
  await expect(ค่า("จังหวัด")).toHaveText("ตราด");
  await expect(ค่า("เริ่มติดต่อ")).toHaveText("1 พ.ย. 2569");
  for (const k of ["อีเมล", "ติดต่อล่าสุด", "ติดตามครั้งถัดไป"]) await expect(ค่า(k), `${k} ไม่มี = "—"`).toHaveText("—");
  await expect(การ์ด.locator("[data-board-tag]"), "ชื่อบนโซเชียลไม่มี = \"—\"").toContainText("—");
  await expect(การ์ด.locator("[data-board-owner]"), "ไม่มีผู้ดูแล = \"—\"").toHaveText("—");
  await expect(การ์ด.locator("[data-progress]"), "ขั้นใหม่ = 0%").toHaveAttribute("data-progress", "0");
  assertNoErrors(errs, "การ์ดบอร์ดผู้สนใจ");
});

// เกณฑ์ "ติดต่อล่าสุดนานเกิน" ของผู้สนใจ = ค่าเดียวทั้งบอร์ดและตาราง (บอสตัดสิน 13 พ.ย. 69: 7 วัน)
//   ติดต่อล่าสุด 8 วันก่อน = แดงทั้งการ์ดบอร์ดและคอลัมน์ตาราง · 6 วันก่อน = ไม่แดงทั้งคู่ — สองที่ใช้ค่าไม่ตรงกัน = ตก
//   ติดต่อล่าสุดตั้งได้จากบันทึกการติดต่อทางเดียว (ตัวดักฐาน 0174) → วางที่ฐานแบบปิดตัวดัก เหมือน dealer-lead-rules.spec
test("[ui·hq] ผู้สนใจ: ติดต่อล่าสุด 8 วัน = แดงทั้งบอร์ดและตาราง · 6 วัน = ไม่แดงทั้งคู่", async ({ page }) => {
  const errs = watchErrors(page);
  const วันก่อน = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const ชื่อ = { 8: `${แท็ก}-แปดวัน`, 6: `${แท็ก}-หกวัน` } as const;
  expect(รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.dealer_prospects (name, phone, province, status, last_contact_at) values
      ('${ชื่อ[8]}', '000-000-9801', 'ตราด', 'contacted', '${วันก่อน(8)}'),
      ('${ชื่อ[6]}', '000-000-9802', 'ตราด', 'contacted', '${วันก่อน(6)}');
    set local session_replication_role = origin;`), "ผู้สนใจของข้อ").not.toBeNull();
  try {
    await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
    await settle(page);
    const แดง = (สี: string) => สี === "rgb(220, 53, 69)" || สี === "rgb(185, 28, 28)";
    // ตาราง: ค้นด้วยชื่อ → คอลัมน์ติดต่อล่าสุด (คอลัมน์ที่ 8)
    const ค้น = page.getByRole("textbox", { name: "ค้นหาผู้สนใจ", exact: true });
    const ผลตาราง: Record<number, boolean> = {};
    for (const n of [8, 6] as const) {
      await ค้น.fill(ชื่อ[n]);
      const ช่อง = page.getByRole("row").filter({ hasText: ชื่อ[n] }).locator("td").nth(7);
      await expect(ช่อง).toHaveText(`${n} วันก่อน`);
      ผลตาราง[n] = แดง(await ช่อง.evaluate(e => getComputedStyle(e).color));
    }
    // บอร์ด: ค้นชื่อเดียวกัน → ช่องติดต่อล่าสุดบนการ์ด
    await ค้น.fill(แท็ก);
    await page.locator('button[title="บอร์ด"]').click();
    const ผลบอร์ด: Record<number, boolean> = {};
    for (const n of [8, 6] as const) {
      const ค่า = page.locator("[data-board-card]").filter({ has: page.locator("[data-board-name]", { hasText: ชื่อ[n] }) }).locator('[data-board-value-of="ติดต่อล่าสุด"]');
      await expect(ค่า).toHaveText(`${n} วันก่อน`);
      ผลบอร์ด[n] = แดง(await ค่า.evaluate(e => getComputedStyle(e).color));
    }
    expect({ ตาราง: ผลตาราง, บอร์ด: ผลบอร์ด }, "8 วัน = แดงทั้งคู่ · 6 วัน = ไม่แดงทั้งคู่").toEqual({ ตาราง: { 8: true, 6: false }, บอร์ด: { 8: true, 6: false } });
  } finally {
    await (await db(ADMIN)).from("dealer_prospects").delete().in("name", [ชื่อ[8], ชื่อ[6]]);
  }
  assertNoErrors(errs, "เกณฑ์ติดต่อล่าสุดผู้สนใจ");
});

test("[ui·dealer] บอร์ดลูกค้าเป้าหมาย: การ์ดครบทุกช่อง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "บอร์ด", exact: true }).nth(0).click();
  await ตรวจครบทุกใบ(page, "บอร์ดลูกค้าเป้าหมาย");
  assertNoErrors(errs, "การ์ดบอร์ดลูกค้าเป้าหมาย");
});
