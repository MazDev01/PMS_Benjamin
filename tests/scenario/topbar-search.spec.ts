import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason, type Account } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

// ── ช่องค้นหาด้านบน = ช่องพิมพ์จริง ผลเป็นรายการใต้ช่อง (บอสสั่ง 10 พ.ย. 69 · ทั้ง HQ และดีลเลอร์) ─────────────────
//   ไม่มีหน้าต่างค้นหากลางจอ · คลิกแล้วพิมพ์ในช่องได้เลย · รายการกว้างเท่าช่อง อยู่ใต้ช่อง · จัดกลุ่มเดิม
//   ↑↓ เลือก · Enter เปิด · Esc ปิด · คลิกข้างนอกปิด · Ctrl+K = ไปที่ช่องเดิม (ไม่เปิดหน้าต่าง)
//   ตกบนโค้ดเดิม: ช่องค้นหาเป็นปุ่ม กดแล้วเปิดหน้าต่าง "ค้นหาทั้งระบบ" กลางจอ (ไม่มี combobox ในแถบบน)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

const ช่อง = (page: Page) => page.locator(".erp-topbar").getByRole("combobox", { name: "ค้นหา" });
const รายการ = (page: Page) => page.getByRole("listbox", { name: "ผลการค้นหา" });

for (const [แอป, origin, path, who, หน้าแรก, คำหน้า, คาดหน้า, คำหลายผล] of [
  ["HQ", HQ_ORIGIN, "/hq/login", ADMIN, "/hq/dashboard", "ตั้งค่า", "/hq/settings", "ทั้งเครือ"],
  ["ดีลเลอร์", DEALER_ORIGIN, "/login", RYG, "/dashboard", "ปฏิทิน", "/calendar", "ลูกค้า"],
] as [string, string, string, Account, string, string, string, string][]) {
  test(`[ui·${แอป}] ช่องค้นหาด้านบน: พิมพ์ในช่อง · รายการใต้ช่องกว้างเท่าช่อง · ↑↓ Enter Esc คลิกนอก · Ctrl+K`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginUI(page, origin, path, who);
    await page.goto(`${origin}${หน้าแรก}`, { waitUntil: "domcontentloaded" });
    await settle(page);

    // 1) คลิกช่อง = พิมพ์ได้เลย ไม่มีหน้าต่าง
    await ช่อง(page).click();
    await expect(ช่อง(page), "คลิกแล้วโฟกัสอยู่ที่ช่องในแถบบน").toBeFocused();
    await expect(page.getByRole("dialog"), "ไม่มีหน้าต่างค้นหากลางจอ").toHaveCount(0);
    await page.keyboard.type(คำหน้า);
    await expect(ช่อง(page)).toHaveValue(คำหน้า);

    // 2) รายการใต้ช่อง กว้างเท่าช่อง · กลุ่ม "หน้า"
    await expect(รายการ(page)).toBeVisible();
    const กรอบช่อง = (await page.locator("[data-topbar-search]").boundingBox())!;
    const กรอบรายการ = (await รายการ(page).boundingBox())!;
    expect(Math.round(กรอบรายการ.width), "รายการกว้างเท่าช่อง").toBe(Math.round(กรอบช่อง.width));
    expect(Math.round(กรอบรายการ.x), "รายการชิดซ้ายเท่าช่อง").toBe(Math.round(กรอบช่อง.x));
    expect(กรอบรายการ.y, "รายการอยู่ใต้ช่อง").toBeGreaterThanOrEqual(กรอบช่อง.y + กรอบช่อง.height);
    await expect(รายการ(page).locator("[data-search-group='หน้า']"), "จัดกลุ่ม: หน้า").toBeVisible();
    await expect(รายการ(page).getByRole("option").first(), "แถวแรกถูกเลือกไว้").toHaveAttribute("aria-selected", "true");

    // 3) Enter = เปิดแถวที่เลือก
    await page.keyboard.press("Enter");
    await page.waitForURL(u => new URL(u).pathname === คาดหน้า, { timeout: 20_000 });
    await expect(รายการ(page), "เปิดแล้วรายการปิด").toHaveCount(0);
    await expect(ช่อง(page), "เปิดแล้วล้างคำค้น").toHaveValue("");

    // 4) ↑↓ เลือก — ลงหนึ่งแถว แล้ว Enter = เปิดแถวที่สอง
    await ช่อง(page).fill(คำหลายผล);
    await expect(รายการ(page).getByRole("option").nth(1), "มีผลอย่างน้อย 2 แถว").toBeVisible();
    await page.keyboard.press("ArrowDown");
    const แถวสอง = รายการ(page).getByRole("option").nth(1);
    await expect(แถวสอง, "↓ เลือกแถวที่สอง").toHaveAttribute("aria-selected", "true");
    await expect(รายการ(page).getByRole("option").first()).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("ArrowUp");
    await expect(รายการ(page).getByRole("option").first(), "↑ กลับแถวแรก").toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    const ไป = new URL(`${origin}${await แถวสอง.getAttribute("data-href")}`).pathname;
    await page.keyboard.press("Enter");
    await page.waitForURL(u => new URL(u).pathname === ไป, { timeout: 20_000 });

    // 5) Esc ปิด · คลิกนอกปิด
    await ช่อง(page).fill(คำหน้า);
    await expect(รายการ(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(รายการ(page), "Esc ปิดรายการ").toHaveCount(0);
    await ช่อง(page).click();
    await expect(รายการ(page)).toBeVisible();
    await page.mouse.click(1440 - 40, 900 - 40);   // มุมล่างขวาของจอ (นอกช่องและรายการ)
    await expect(รายการ(page), "คลิกข้างนอกปิดรายการ").toHaveCount(0);

    // 6) Ctrl+K = ไปที่ช่องเดิม ไม่เปิดหน้าต่าง
    await page.mouse.click(1440 - 40, 900 - 40);
    await expect(ช่อง(page)).not.toBeFocused();
    await page.keyboard.press("Control+K");
    await expect(ช่อง(page), "Ctrl+K โฟกัสช่องในแถบบน").toBeFocused();
    await expect(page.getByRole("dialog"), "Ctrl+K ไม่เปิดหน้าต่าง").toHaveCount(0);
    assertNoErrors(errs, `ช่องค้นหา ${แอป}`);
  });
}
