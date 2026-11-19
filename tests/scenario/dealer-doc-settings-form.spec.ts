import { test, expect } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ดีลเลอร์ › ตั้งค่า › ตั้งค่าใบเสนอราคา: ฟอร์มจัดกลุ่ม · ช่องตัวเลขกว้างเท่ากัน ป้ายบรรทัดเดียว ไม่มีลูกศร มีหน่วย (บอสสั่ง 19 พ.ย. 69 "แก้หน้าฟอร์มก่อน" · "ช่องให้ดี") ──
//   2 กลุ่ม กริดเดียวกัน: เลขที่ใบเสนอราคา (คำนำหน้า | ตัวอย่างเลขที่ถัดไป แถวเดียวกัน สูงเท่ากัน)
//                        ราคาและภาษี (VAT · หัก ณ ที่จ่าย · % บวกตั้งต้น · อายุใบ — 4 ช่องกว้างเท่ากัน แถวเดียว · จอแคบ 2×2/เรียงลง)
//   ตกบนโค้ดเดิม (97a8ab9e): ไม่มีกลุ่ม data-doc-group · VAT/หัก ณ ที่จ่าย แคบ ป้ายตกบรรทัด · % บวกยืดเต็ม · ช่องตัวเลขมีลูกศร · ไม่มีหน่วย
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
let สาขา: สาขาของข้อ;
test.beforeAll(async () => { สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" }); });
test.afterAll(async () => { await สาขา.ลบ(); });

for (const [กว้าง, ต่อแถว] of [[1440, 4], [700, 2]] as const) {
  test(`[D·dealer] ตั้งค่าใบเสนอราคา จอ ${กว้าง}px: ราคาและภาษี 4 ช่องกว้างเท่ากัน ${ต่อแถว} ช่องต่อแถว · ป้ายบรรทัดเดียว · ไม่มีลูกศร · มีหน่วย`, async ({ page }) => {
    await page.setViewportSize({ width: กว้าง, height: 1100 });
    await loginUI(page, DEALER_ORIGIN, "/settings", สาขา.บัญชี);
    await settle(page);
    await page.getByRole("button", { name: "ตั้งค่าใบเสนอราคา", exact: true }).click();
    const กลุ่มราคา = page.locator("[data-doc-group='pricing']");
    await expect(กลุ่มราคา, "มีกลุ่มราคาและภาษี").toBeVisible({ timeout: 20_000 });
    await expect(page.locator("[data-doc-group='numbering']"), "มีกลุ่มเลขที่ใบเสนอราคา").toBeVisible();

    const ช่อง = กลุ่มราคา.locator("[data-doc-rate]");
    await expect(ช่อง, "4 ช่อง: VAT · หัก ณ ที่จ่าย · % บวกตั้งต้น · อายุใบ").toHaveCount(4);
    const กล่อง = await ช่อง.evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; }));
    for (const g of กล่อง) expect(Math.abs(g.w - กล่อง[0].w), "ทุกช่องกว้างเท่ากัน").toBeLessThan(2);
    const แถวแรก = กล่อง.filter(g => Math.abs(g.y - กล่อง[0].y) < 2).length;
    expect(แถวแรก, `แถวแรกมี ${ต่อแถว} ช่อง`).toBe(ต่อแถว);

    // ป้ายบรรทัดเดียว (สูงไม่เกินหนึ่งบรรทัด)
    const ป้าย = await ช่อง.locator(".form-label").evaluateAll(es => es.map(e => {
      const cs = getComputedStyle(e); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
      return { t: (e.textContent ?? "").trim(), h: e.getBoundingClientRect().height, lh };
    }));
    for (const p of ป้าย) expect(p.h, `ป้าย "${p.t}" บรรทัดเดียว`).toBeLessThan(p.lh * 1.6);

    // ช่องตัวเลขไม่มีลูกศรขึ้นลง (appearance textfield) + หน่วยท้ายช่อง
    const ตัวเลข = กลุ่มราคา.locator("input[type='number']");
    await expect(ตัวเลข).toHaveCount(4);
    for (const a of await ตัวเลข.evaluateAll(es => es.map(e => getComputedStyle(e).getPropertyValue("appearance") || getComputedStyle(e).getPropertyValue("-webkit-appearance"))))
      expect(a, "ช่องตัวเลขไม่มีลูกศร").toBe("textfield");
    await expect(กลุ่มราคา.locator("[data-number-unit='%']"), "หน่วย % ท้ายช่อง 3 ช่อง").toHaveCount(3);
    await expect(กลุ่มราคา.locator("[data-number-unit='วัน']"), "หน่วย วัน ท้ายช่องอายุใบ").toHaveCount(1);

    // ตัวอย่างเลขที่ถัดไป อยู่แถวเดียวกับคำนำหน้า สูงเท่ากัน
    const [คำนำหน้า, ตัวอย่าง] = [await page.getByTestId("quote-prefix").boundingBox(), await page.getByTestId("quote-next-no").boundingBox()];
    expect(Math.abs(คำนำหน้า!.y - ตัวอย่าง!.y), "ตัวอย่างเลขที่ แถวเดียวกับคำนำหน้า").toBeLessThan(2);
    expect(Math.abs(คำนำหน้า!.height - ตัวอย่าง!.height), "สูงเท่ากัน").toBeLessThan(2);
  });
}
