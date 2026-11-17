import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ตารางเจาะลึก /hq/leads: ชื่อในคอลัมน์แรกขึ้นบรรทัดใหม่ ห้ามตัด … (บอสตัดสิน 17 พ.ย. 69 · ทาง ก) ─────────────────────────────
//   คอลัมน์ชื่อ 12% ให้คอลัมน์ตัวเลข 7 คอลัมน์กว้างเท่ากันและหัว "4. ทำใบเสนอราคาให้ลูกค้า" ไม่ถูกตัดที่จอ 1366
//   ชื่อยาวเกินคอลัมน์ = ขึ้นบรรทัดใหม่ (แบบตาราง HQ › ดีลเลอร์ ec4dca72) · ข้อยกเว้นของกฎ "ชื่อยาวตัด … ชี้แล้วเห็นเต็ม" เฉพาะตารางนี้
//   ตรวจที่ 1366 และ 1920: ช่องชื่อของดีลเลอร์ชื่อยาว (สาขาของข้อ) ไม่ล้นช่อง (scrollWidth ≤ clientWidth) · ไม่มี text-overflow: ellipsis · เห็นชื่อเต็ม · ขึ้นหลายบรรทัด
//   ตกบนโค้ดเดิม (64b4c845): ช่องชื่อ overflow hidden + text-overflow ellipsis + บรรทัดเดียว → ชื่อยาวถูกตัด
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

let ส: สาขาของข้อ;
const ชื่อยาว = `ZZTEST บริษัท ดีลเลอร์ชื่อยาวมากสำหรับทดสอบการขึ้นบรรทัดใหม่ของคอลัมน์ชื่อ ${Date.now() % 100000} จำกัด`;
test.beforeAll(async () => { ส = await สร้างสาขาของข้อ({ ชื่อ: ชื่อยาว }); });
test.afterAll(async () => { if (ส) await ส.ลบ(); });

for (const กว้าง of [1366, 1920]) {
  test(`[ui·hq] /hq/leads ตารางเจาะลึก: ชื่อยาวขึ้นบรรทัดใหม่ ไม่ตัด … ที่จอ ${กว้าง}`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: กว้าง, height: 900 });
    await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
    await settle(page);
    const ตาราง = page.locator("[data-drill-table='dealer'] table").first();
    const ช่อง = ตาราง.locator("td[data-group-row]").filter({ hasText: ชื่อยาว.slice(0, 30) }).first();
    await expect(ช่อง, "มีแถวของดีลเลอร์ชื่อยาว (สาขาของข้อ)").toBeVisible({ timeout: 30_000 });
    const วัด = await ช่อง.evaluate(td => {
      const strong = td.querySelector("strong") as HTMLElement;
      const ปลาย = [td, strong, td.querySelector("[data-row-sub]") as HTMLElement | null].filter(Boolean) as HTMLElement[];
      const เส้น = parseFloat(getComputedStyle(strong).lineHeight) || parseFloat(getComputedStyle(strong).fontSize) * 1.4;
      return {
        ล้น: ปลาย.map(e => ({ s: e.scrollWidth, c: e.clientWidth })).filter(x => x.s > x.c + 1),
        จุดไข่ปลา: ปลาย.map(e => getComputedStyle(e).textOverflow).filter(v => v === "ellipsis"),
        ข้อความ: (strong.innerText ?? "").replace(/\s+/g, " ").trim(),
        บรรทัด: Math.round(strong.getBoundingClientRect().height / เส้น),
      };
    });
    expect(วัด.ล้น, `@${กว้าง}: ชื่อไม่ล้นช่อง (scrollWidth ≤ clientWidth) ${JSON.stringify(วัด)}`).toEqual([]);
    expect(วัด.จุดไข่ปลา, `@${กว้าง}: ไม่มี text-overflow: ellipsis ที่ช่องชื่อ`).toEqual([]);
    expect(วัด.ข้อความ, `@${กว้าง}: เห็นชื่อเต็ม`).toBe(ชื่อยาว);
    expect(วัด.บรรทัด, `@${กว้าง}: ชื่อยาวขึ้นบรรทัดใหม่ (มากกว่า 1 บรรทัด) ${JSON.stringify(วัด)}`).toBeGreaterThan(1);
    assertNoErrors(errs, `/hq/leads @${กว้าง}`);
  });
}
