import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason, type Account } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── หัวคอลัมน์ตารางทุกหน้าในเมนูไม่ถูกตัด (บอสแจ้ง 10 พ.ย. 69: ตารางดีลเลอร์ HQ หัว "ลำดับ" ขึ้น "ลำ...") ─────────────
//   วนทุกหน้าในเมนูของ HQ และดีลเลอร์ ที่จอ 1366 และ 1920 → ทุก <th> ที่เห็นต้องแสดงข้อความครบ (ไม่ตัดเป็น "…")
//   ต้นเหตุที่เจอ: ความกว้างคอลัมน์เป็น % ของตาราง (table-layout: fixed · minWidth ของ <col> ไม่มีผล) แคบกว่าหัว
//   ตกบนโค้ดก่อนแก้: /hq/dealers "ลำดับ" · /hq/prospects "ลำดับ" (1366) · /leads ดีลเลอร์ "จังหวัดหน้างาน" (1366)
test.skip(() => skipReason() !== "", skipReason());
test.setTimeout(600_000);

const สำนักงานใหญ่ = ["/hq/dashboard", "/hq/prospects", "/hq/proposals", "/hq/dealers?view=table", "/hq/pipeline", "/hq/quote-requests",
  "/hq/leads", "/hq/quotations", "/hq/customers", "/hq/audit", "/hq/users"];
const ดีลเลอร์ = ["/dashboard", "/leads", "/quotations", "/customers", "/calendar", "/files"];

for (const [แอป, origin, path, who, หน้า] of [
  ["HQ", HQ_ORIGIN, "/hq/login", ADMIN, สำนักงานใหญ่],
  ["ดีลเลอร์", DEALER_ORIGIN, "/login", RYG, ดีลเลอร์],
] as [string, string, string, Account, string[]][]) {
  test(`[ui·${แอป}] หัวคอลัมน์ตารางทุกหน้าไม่ถูกตัด ที่จอ 1366 / 1920`, async ({ page }) => {
    await loginUI(page, origin, path, who);
    const ตัดทั้งหมด: string[] = [];
    for (const w of [1366, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const p of หน้า) {
        await page.goto(`${origin}${p}`, { waitUntil: "domcontentloaded" });
        await settle(page);
        // ตารางลูกค้าเป้าหมายดีลเลอร์เริ่มที่บอร์ด → สลับเป็นตาราง
        if (แอป === "ดีลเลอร์" && p === "/leads") await page.getByRole("button", { name: "ตาราง", exact: true }).click();
        // รอให้หัวตารางขึ้นก่อน (หน้าที่มีตาราง) — หน้าที่ไม่มีตารางผ่านไป
        await page.locator("thead th").first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
        const ตัด = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>("thead th"))
          .filter(e => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
          .map(e => (e.textContent ?? "").trim()).filter(Boolean));
        for (const t of ตัด) ตัดทั้งหมด.push(`${p} @${w}: "${t}"`);
      }
    }
    expect(ตัดทั้งหมด, `${แอป}: หัวคอลัมน์ที่ถูกตัด`).toEqual([]);
  });
}
