import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

// ── ตารางผลงานรายดีลเลอร์ พอดีจอ (บอสสั่ง 6 พ.ย. 69) — ภาพรวมยอดขาย + เจาะลึก 3 หน้า (ลูกค้าเป้าหมาย · ใบเสนอราคา · ลูกค้าทั้งเครือ) ──
//   ที่ความกว้าง 1366 และ 1920: ตารางไม่ล้นกรอบ (ไม่มีแถบเลื่อนแนวนอน) · ไม่มีคอลัมน์รหัส (รหัสไม่อยู่หน้าชื่อ) · ภูมิภาคเป็นบรรทัดเล็กใต้ชื่อ
//   คอลัมน์ที่ทั้งตารางเป็น "—" ซ่อนเอง (ทุกคอลัมน์ที่เห็นมีค่าอย่างน้อย 1 แถว) · กราฟแท่งรายดีลเลอร์ไม่มีรหัสหน้าชื่อ · กดแถวยังเจาะลึกได้
//   ภาพรวมยอดขาย: ไม่มีแถวรวมท้ายตาราง + คำอธิบายไม่มี "แถวรวม = การ์ดด้านบน" (ตรวจกลับด้านจาก hq-pipeline-h12 เดิม)
//   ตกบนโค้ดก่อนแก้: ตารางกว้างกว่ากรอบ (ภาพรวมยอดขาย ~1,180px · เจาะลึก 240 + 120 ต่อคอลัมน์) · มีคอลัมน์รหัส · มีแถวรวม
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const หน้า = [
  { path: "/hq/pipeline", ตาราง: "[data-testid='pipeline-table'] table", แถว: "tbody tr.clickable", กราฟ: "[data-testid='pipeline-chart']" },
  { path: "/hq/leads", ตาราง: "[data-drill-table='dealer'] table", แถว: "tbody tr.clickable", กราฟ: "[data-bar-row]" },
  { path: "/hq/quotations", ตาราง: "[data-drill-table='dealer'] table", แถว: "tbody tr.clickable", กราฟ: "[data-bar-row]" },
  { path: "/hq/customers", ตาราง: "[data-drill-table='dealer'] table", แถว: "tbody tr.clickable", กราฟ: "[data-bar-row]" },
] as const;

async function ตรวจพอดี(ตาราง: Locator, ป้าย: string) {
  const วัด = await ตาราง.evaluate(t => { const w = t.closest(".table-wrap") as HTMLElement; return { ตาราง: Math.round(t.getBoundingClientRect().width), กรอบ: w.clientWidth, เลื่อน: w.scrollWidth }; });
  expect(วัด.เลื่อน, `${ป้าย}: ตารางไม่ล้นกรอบ (ไม่มีแถบเลื่อนแนวนอน) ${JSON.stringify(วัด)}`).toBeLessThanOrEqual(วัด.กรอบ + 1);
}

for (const กว้าง of [1366, 1920]) {
  test(`[ui·hq] ตารางผลงานรายดีลเลอร์พอดีจอที่ ${กว้าง} · ไม่มีรหัส · ภูมิภาคใต้ชื่อ · ซ่อนคอลัมน์ที่ไม่มีค่า · 4 หน้า`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: กว้าง, height: 900 });
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    for (const h of หน้า) {
      await page.goto(`${HQ_ORIGIN}${h.path}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      const ตาราง = page.locator(h.ตาราง).first();
      const แถว = ตาราง.locator(h.แถว);
      await expect(แถว.first(), `${h.path}: มีแถวดีลเลอร์`).toBeVisible({ timeout: 25_000 });
      await ตรวจพอดี(ตาราง, `${h.path} @${กว้าง}`);
      // ไม่มีรหัสหน้าชื่อ (ตาราง + กราฟ) · ภูมิภาคเป็นบรรทัดเล็กใต้ชื่อ
      const เซลล์ชื่อ = แถว.first().locator("td").first();
      await expect(เซลล์ชื่อ.locator("[data-row-sub]"), `${h.path}: ภูมิภาคเป็นบรรทัดเล็กใต้ชื่อ`).toHaveText(/ภาค|ไม่ระบุภูมิภาค/);
      expect(await ตาราง.locator("thead th").allInnerTexts(), `${h.path}: ไม่มีคอลัมน์รหัส/ภูมิภาคแยก`).not.toEqual(expect.arrayContaining([expect.stringMatching(/^รหัส|^ภูมิภาค$/)]));
      const รหัสหน้าชื่อ = await page.locator(`${h.ตาราง} tbody td strong, ${h.กราฟ} strong`).evaluateAll(els => els.filter(e => getComputedStyle(e).fontFamily.includes("monospace")).length);
      expect(รหัสหน้าชื่อ, `${h.path}: ตาราง/กราฟไม่มีรหัสหน้าชื่อ`).toBe(0);
      // คอลัมน์ที่เห็นทุกคอลัมน์มีค่าอย่างน้อย 1 แถว (ทั้งตาราง "—" = ซ่อน) — ดูจากแถวทั้งหมดในหน้านี้
      const ว่างทั้งคอลัมน์ = await ตาราง.evaluate(t => {
        const หัว = [...t.querySelectorAll("thead th")].map(th => (th as HTMLElement).innerText.trim());
        const แถว = [...t.querySelectorAll("tbody tr.clickable")].map(tr => [...tr.querySelectorAll("td")].map(td => (td as HTMLElement).innerText.trim()));
        return หัว.map((ห, i) => ({ ห, i })).filter(x => x.ห && แถว.length > 0 && แถว.every(r => (r[x.i] ?? "") === "—")).map(x => x.ห);
      });
      expect(ว่างทั้งคอลัมน์, `${h.path}: คอลัมน์ที่ทั้งหน้าเป็น "—" ต้องซ่อน`).toEqual([]);
      if (h.path === "/hq/pipeline") {
        await expect(page.locator("[data-perf-total]"), "ภาพรวมยอดขาย: ไม่มีแถวรวมท้ายตารางแล้ว").toHaveCount(0);
        await expect(page.locator("[data-testid='pipeline-table']"), "คำอธิบายไม่มี แถวรวม = การ์ดด้านบน").not.toContainText("แถวรวม = การ์ดด้านบน");
      }
    }
    // กดแถวยังเจาะลึกได้ (ภาพรวมยอดขาย)
    await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const แรก = page.locator("[data-testid='pipeline-table'] tbody tr.clickable").first();
    const ชื่อ = (await แรก.locator("[data-perf-row]").innerText()).split("\n")[0].replace("(ปิดใช้งาน)", "").trim();
    await แรก.click();
    await expect(page.locator("[data-testid='pipeline-table']"), "กดแถว = เจาะลงระดับดีลเลอร์ (หัวตารางบอกชื่อดีลเลอร์)").toContainText(ชื่อ, { timeout: 15_000 });
    await expect(page.locator("[data-testid='pipeline-table'] tbody tr.clickable [data-perf-row]"), "ระดับดีลเลอร์ = ตารางเหลือดีลเลอร์ที่กดแถวเดียว").toHaveCount(1);
    assertNoErrors(errs, `ตารางพอดีจอ ${กว้าง}`);
  });
}

// ตัวช่วยไม่ได้ใช้ข้ามไฟล์ — คงชนิด Page ไว้ให้อ่านง่าย
export type _ = Page;
