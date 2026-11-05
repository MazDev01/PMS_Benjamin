import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── แถบระดับเจาะลึก ทั้งเครือ › ภาค › จังหวัด › ดีลเลอร์ (บอสสั่ง 5 พ.ย. 69 · บั๊ก "กดชิปจังหวัดแล้วเด้งกลับทั้งเครือ") ─────────────
//   กดชิปไหน = กลับไประดับนั้น ตัวกรองของระดับก่อนหน้ายังอยู่ · ปุ่มย้อนกลับของเบราว์เซอร์ถอยทีละ 1 ระดับ (ตัวกลาง useประวัติระดับ)
//   ทุกหน้าที่ใช้: ภาพรวมยอดขาย · ลูกค้าเป้าหมายทั้งเครือ · ใบเสนอราคาทั้งเครือ · ลูกค้าทั้งเครือ
//   เส้นทาง: เลือกดีลเลอร์ตรงจากตัวกรอง (ทางที่บั๊กเกิด — ภาค/จังหวัดมาจากดีลเลอร์) → ชิปจังหวัด → ชิปภาค → ย้อนกลับ 3 ครั้ง
//   สาขาของข้อ (ตราด · ภาคตะวันออก) รู้ภาค/จังหวัดแน่นอน
//   ตกบนโค้ดก่อนแก้: ภาพรวมยอดขาย กดชิปจังหวัด = ทั้งเครือ · ทุกหน้า ย้อนกลับ = ออกจากหน้า (ไม่ถอยระดับ)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

let สาขา: สาขาของข้อ;
test.beforeAll(async () => { สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" }); });
test.afterAll(async () => { await สาขา?.ลบ(); });

const หน้า = [
  { ที่: "/hq/pipeline", ชื่อ: "ภาพรวมยอดขาย", ตัวเลือกดีลเลอร์: "ทุกดีลเลอร์" },
  { ที่: "/hq/leads", ชื่อ: "ลูกค้าเป้าหมายทั้งเครือ", ตัวเลือกดีลเลอร์: "ดีลเลอร์" },
  { ที่: "/hq/quotations", ชื่อ: "ใบเสนอราคาทั้งเครือ", ตัวเลือกดีลเลอร์: "ดีลเลอร์" },
  { ที่: "/hq/customers", ชื่อ: "ลูกค้าทั้งเครือ", ตัวเลือกดีลเลอร์: "ดีลเลอร์" },
] as const;

/** ชิปบนแถบระดับตอนนี้ (ลำดับ) + ชิปที่เป็นระดับปัจจุบัน */
async function ระดับบนแถบ(page: Page) {
  const แถบ = page.locator("[data-crumbs]");
  return {
    ชิป: await แถบ.locator("[data-crumb]").evaluateAll(es => es.map(e => e.getAttribute("data-crumb"))),
    ปัจจุบัน: await แถบ.locator('[data-crumb][aria-current="page"]').getAttribute("data-crumb"),
  };
}
const คาด = (page: Page, ชิป: string[], ข้อความ: string) =>
  expect.poll(() => ระดับบนแถบ(page), { timeout: 20_000, message: ข้อความ }).toEqual({ ชิป, ปัจจุบัน: ชิป.at(-1) });

for (const h of หน้า) {
  test(`[drill·hq] ${h.ชื่อ} (${h.ที่}): กดชิปไหนกลับระดับนั้น · ย้อนกลับเบราว์เซอร์ถอยทีละระดับ`, async ({ page }) => {
    const errs = watchErrors(page);
    await loginUI(page, HQ_ORIGIN, h.ที่, ADMIN);
    await settle(page);
    await คาด(page, ["all"], "เริ่มที่ทั้งเครือ");
    const ตัวเลือก = page.getByLabel(h.ตัวเลือกดีลเลอร์, { exact: true }).first();
    await expect(ตัวเลือก.locator(`option[value="${สาขา.รหัส}"]`), "มีสาขาของข้อในตัวเลือก").toHaveCount(1, { timeout: 30_000 });
    await ตัวเลือก.selectOption(สาขา.รหัส);
    await คาด(page, ["all", "region", "prov", "dealer"], "เลือกดีลเลอร์ตรง = แถบครบ 4 ระดับ");
    await expect(page.locator('[data-crumbs] [data-crumb="prov"]')).toHaveText("ตราด");

    // กดชิปจังหวัด → ระดับจังหวัด (ไม่ใช่ทั้งเครือ) · ภาคยังอยู่
    await page.locator('[data-crumbs] [data-crumb="prov"]').click();
    await คาด(page, ["all", "region", "prov"], "กดชิปจังหวัด = ระดับจังหวัด ภาคยังอยู่ (เดิมเด้งกลับทั้งเครือ)");
    await expect(page.locator('[data-crumbs] [data-crumb="prov"]')).toHaveText("ตราด");
    // กดชิปภาค → ระดับภาค
    await page.locator('[data-crumbs] [data-crumb="region"]').click();
    await คาด(page, ["all", "region"], "กดชิปภาค = ระดับภาค");

    // ย้อนกลับเบราว์เซอร์ทีละ 1 ระดับ: ภาค → จังหวัด → ดีลเลอร์ → ทั้งเครือ (อยู่หน้าเดิม)
    await page.goBack();
    await คาด(page, ["all", "region", "prov"], "ย้อนกลับครั้งที่ 1 = ระดับจังหวัด");
    await page.goBack();
    await คาด(page, ["all", "region", "prov", "dealer"], "ย้อนกลับครั้งที่ 2 = ระดับดีลเลอร์");
    await page.goBack();
    await คาด(page, ["all"], "ย้อนกลับครั้งที่ 3 = ทั้งเครือ");
    expect(new URL(page.url()).pathname, "ยังอยู่หน้าเดิม").toBe(h.ที่);
    assertNoErrors(errs, `แถบระดับ ${h.ที่}`);
  });
}
