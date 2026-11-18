import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { settle } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, ข้อมูลงานครบชุด } from "./hqQuoteFixture";

// ── ปุ่มรูปตา "ดูรายละเอียด" ทุกตาราง = เปิดหน้าต่าง/แผงบนหน้าเดิม ไม่ออกจากหน้า (บอสตัดสิน 18 พ.ย. 69) ──────────────────
//   บั๊กที่บอสเจอ: "บางอันกดแล้วไม่แสดงรายละเอียด และเด้งไปหน้าอื่น" = ภาพรวมยอดขาย รูปตาท้ายแถว router.push(/hq/dealers/รหัส)
//   ทางแก้: รูปตาเปิดแผงดีลเลอร์ตัวเดียวกับ /hq/dealers บนหน้าเดิม (ตัวกลาง useDealerPanelActions) · กดแถว = เจาะลงเหมือนเดิม
//   ข้อเดียวกันกับการ์ด/แถวผู้สนใจที่เป็นดีลเลอร์แล้ว (การ์ดมีรูปตา · เดิมไป /hq/dealers)
//   ทุกข้อ: กดแล้ว path เดิม + หน้าต่าง/แผงเปิด · ตารางอื่นที่มีรูปตาอยู่แล้ว (ตรวจซ้ำกันถอย)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const สาขา = "RYG";   // ผู้สนใจทดสอบผูกกับสาขาทดสอบ RYG
const แท็ก = `ZZTEST-รูปตา-${Date.now() % 1_000_000}`;

/** กดแล้ว: path เดิม · มีหน้าต่าง/แผงเปิด (role=dialog หรือ aside ของแผงแถว) */
async function กดแล้วอยู่หน้าเดิม(page: Page, ปุ่ม: ReturnType<Page["locator"]>, path: string, ชื่อ: string, แผง?: string) {
  await expect(ปุ่ม, `${ชื่อ}: มีปุ่มรูปตา`).toBeVisible({ timeout: 30_000 });
  await ปุ่ม.click();
  await expect(page.locator(แผง ?? '[role="dialog"], aside[aria-label]').first(), `${ชื่อ}: กดแล้วเปิดหน้าต่าง/แผง`).toBeVisible({ timeout: 30_000 });
  // ตรวจ path หลังแผงขึ้นแล้ว — โค้ดเดิมแผงขึ้นหลังย้ายไปหน้าดีลเลอร์ จึงจับได้ (พิสูจน์บน 0f66156b: ได้ /hq/dealers)
  expect(new URL(page.url()).pathname, `${ชื่อ}: ไม่ออกจากหน้า`).toBe(path);
}

test("[ui·hq] ภาพรวมยอดขาย: รูปตาท้ายแถว = แผงดีลเลอร์บนหน้าเดิม (?open=รหัส) · ปิดแผงยังอยู่หน้าเดิม · กดแถว = เจาะลงเหมือนเดิม", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/pipeline", ADMIN);
  await settle(page);
  const ปุ่ม = page.locator('[data-testid="pipeline-table"] td button:has(svg.lucide-eye)').first();   // รูปตาท้ายแถว (ไม่ผูกชื่อปุ่ม — ชื่อเดิม/ใหม่ต่างกัน)
  await expect(ปุ่ม, "ตารางแยกตามดีลเลอร์มีรูปตา").toBeVisible({ timeout: 30_000 });
  const รหัส = (await ปุ่ม.locator("xpath=ancestor::tr").locator("td[data-perf-row]").getAttribute("data-perf-row"))!;
  await กดแล้วอยู่หน้าเดิม(page, ปุ่ม, "/hq/pipeline", "ภาพรวมยอดขาย", `[data-dealer-panel="${รหัส}"]`);
  expect(new URL(page.url()).searchParams.get("open"), "แผงอยู่ในที่อยู่หน้าเว็บ").toBe(รหัส);
  await page.locator(`[data-dealer-panel="${รหัส}"]`).getByRole("button", { name: "ปิดหน้าต่าง", exact: true }).click();
  await expect(page.locator(`[data-dealer-panel="${รหัส}"]`)).toBeHidden({ timeout: 15_000 });
  expect(new URL(page.url()).pathname).toBe("/hq/pipeline");
  // กดแถว (ไม่ใช่รูปตา) = เจาะลงระดับดีลเลอร์ ไม่เปิดแผง
  await page.locator(`td[data-perf-row="${รหัส}"]`).click();
  await expect(page.locator("[data-crumbs] [data-crumb='dealer']"), "กดแถว = เจาะลงระดับดีลเลอร์").toBeVisible({ timeout: 25_000 });
  await expect(page.locator("[data-dealer-panel]"), "กดแถวไม่เปิดแผง").toHaveCount(0);
  // ระดับดีลเลอร์: ปุ่ม "เปิดหน้าต่างรายละเอียดดีลเลอร์" ก็เปิดบนหน้าเดิม
  await กดแล้วอยู่หน้าเดิม(page, page.locator('[data-act="open-dealer-panel"]'), "/hq/pipeline", "ปุ่มเปิดหน้าต่างดีลเลอร์ (ระดับดีลเลอร์)", `[data-dealer-panel="${รหัส}"]`);
  assertNoErrors(errs, "ภาพรวมยอดขาย รูปตา");
});

test.describe("ผู้สนใจที่เป็นดีลเลอร์แล้ว", () => {
  test.beforeAll(async () => {
    const { error } = await (await db(ADMIN)).from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: แท็ก, province: "ระยอง", status: "won", dealer_code: สาขา });
    expect(error).toBeNull();
  });
  test.afterAll(async () => { await (await db(ADMIN)).from("dealer_prospects").delete().eq("name", แท็ก); });

  test("[ui·hq] กดแถวผู้สนใจที่เป็นดีลเลอร์แล้ว = แผงดีลเลอร์บนหน้าเดิม (ไม่ไปหน้าดีลเลอร์)", async ({ page }) => {
    const errs = watchErrors(page);
    await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
    await settle(page);
    // รายที่เป็นดีลเลอร์แล้วไม่อยู่ในตาราง (กติกาเดิม) — อยู่บอร์ด › ปิดแล้ว · การ์ดมีรูปตา
    await page.getByLabel("ค้นหาผู้สนใจ", { exact: true }).fill(แท็ก);
    await page.locator('button[title="บอร์ด"]').click();
    const ปิดแล้ว = page.locator('[data-board-column="closed"]');
    await expect(ปิดแล้ว, "คอลัมน์ปิดแล้ว").toBeVisible({ timeout: 25_000 });
    if ((await ปิดแล้ว.getAttribute("data-board-collapsed")) === "true") await ปิดแล้ว.locator("[data-board-toggle]").click();   // ไม่ใช่การข้าม: ยุบไว้ตั้งแต่แรก = กดเปิดดู
    const การ์ด = ปิดแล้ว.locator("[data-board-card]").filter({ hasText: แท็ก }).locator("[data-board-name]");
    await กดแล้วอยู่หน้าเดิม(page, การ์ด, "/hq/prospects", "การ์ดผู้สนใจ (เป็นดีลเลอร์แล้ว)", `[data-dealer-panel="${สาขา}"]`);
    assertNoErrors(errs, "ผู้สนใจที่เป็นดีลเลอร์แล้ว");
  });
});

// ตารางที่รูปตาเปิดหน้าต่างบนหน้าเดิมอยู่แล้ว — กันถอย (แถวแรกของหน้า · ไม่อ่านค่าในแถว)
const ตารางHQ: [string, string][] = [
  ["/hq/quote-requests", 'button[title="ดูรายละเอียด"]'],
  ["/hq/leads", 'button[title="ดูรายละเอียด"]'],
  ["/hq/quotations", 'tbody button[aria-label="ดูรายละเอียด"]'],
  ["/hq/customers", 'tbody button[title="ดูรายละเอียด"]'],
  ["/hq/proposals", 'button[title="ดูรายละเอียด"]'],
];
// คำขอใบเสนอราคา: ฐานทดสอบตั้งต้นไม่มีคำขอ → สร้าง 1 ใบ (RYG) ให้ตารางต้องตีราคามีแถว · ล้างหลังจบ
const เลขลีด = เลขลูกค้าเป้าหมายทดสอบ();
const บริษัทคำขอ = `ZZTEST-รูปตาคำขอ-${Date.now() % 100_000}`;
test.describe("ตารางที่มีรูปตา", () => {
  test.beforeAll(async () => {
    const sb = await db(RYG);
    const l = await sb.from("leads").insert({ id: `#L-${เลขลีด}`, num_id: เลขลีด, dealer_code: สาขา, company: บริษัทคำขอ, name: บริษัทคำขอ,
      contact: "ผู้ทดสอบ", phone: `000-000-${String(เลขลีด).slice(-4)}`, province: "ระยอง", status: "BULLET", ...ข้อมูลงานครบชุด });
    expect(l.error, "สร้างลีด").toBeNull();
    const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลขลีด, p_product: "โกดังเก็บสินค้า", p_area: 800, p_spec: "ZZTEST สเปก", p_province: "ระยอง" });
    expect(r.error, "ส่งคำขอ").toBeNull();
  });
  test.afterAll(() => { ล้างใบHQทดสอบ(สาขา, [เลขลีด]); });

  for (const [path, ตัวเลือก] of ตารางHQ) {
    test(`[ui·hq] ${path}: รูปตาแถวแรก = หน้าต่างบนหน้าเดิม`, async ({ page }) => {
      await loginUI(page, HQ_ORIGIN, path, ADMIN);
      await settle(page);
      await กดแล้วอยู่หน้าเดิม(page, page.locator(ตัวเลือก).first(), path, path);
    });
  }
});
const ตารางดีลเลอร์: [string, string][] = [
  ["/leads", 'button[title="ดูรายละเอียด"]'],
  ["/quotations", 'button[title="ดูใบ"]'],
  ["/customers", 'tbody button[title="ดูรายละเอียด"]'],
];
for (const [path, ตัวเลือก] of ตารางดีลเลอร์) {
  test(`[ui·ดีลเลอร์] ${path}: รูปตาแถวแรก = หน้าต่างบนหน้าเดิม`, async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, path, RYG);
    await settle(page);
    await กดแล้วอยู่หน้าเดิม(page, page.locator(ตัวเลือก).first(), path, path);
  });
}
