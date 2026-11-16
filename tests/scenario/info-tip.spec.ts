// ── ไอคอน ⓘ ข้างข้อความ (บอสตัดสิน 16 พ.ย. 69 · ประโยคยาว 21 ที่ ข้อ 1 · 4 · 10) ──
//   สูตร "× จำนวนวัน ÷ 365" และ "เปลี่ยนเองได้ที่หน้าข้อมูลส่วนตัว" ย้ายจากบนจอไปไว้ในไอคอน ⓘ ตัวกลาง (components/ui/InfoTip.tsx)
//   ต้องเปิดได้ 3 ทาง: ชี้เมาส์ · คีย์บอร์ด (Tab ถึงปุ่ม · Esc ปิด) · มือถือกด (ไม่มีชี้เมาส์) — กดอีกครั้ง/กดที่อื่น = ปิด
//   ทดสอบที่ ตั้งค่า › เป้าหมายยอดขาย ป้าย "เป้ายอดขายทั้งปี" (ข้อ 4)
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

const สูตร = "เป้าทั้งปี × จำนวนวัน ÷ 365";

async function เปิดแท็บเป้า(page: Page) {
  await openAs(page, ADMIN, "hq", "/hq/settings");
  await settle(page);
  await page.getByRole("button", { name: "เป้าหมายยอดขาย", exact: true }).click();
  await expect(page.getByRole("table", { name: "เป้าหมายรายดีลเลอร์", exact: true })).toBeVisible({ timeout: 20_000 });
}
const ปุ่ม = (page: Page) => page.getByRole("button", { name: "วิธีคิดเป้าตามช่วง", exact: true });
const คำอธิบาย = (page: Page) => page.getByRole("tooltip").filter({ hasText: สูตร });

test.describe("[จอคอม]", () => {
  test("[hq] ⓘ เป้ายอดขายทั้งปี: สูตรไม่อยู่บนจอ · ชี้เมาส์ขึ้น · ออกแล้วหาย · คีย์บอร์ด Tab ขึ้น Esc ปิด", async ({ page }) => {
    await เปิดแท็บเป้า(page);
    await expect(ปุ่ม(page), "มีไอคอน ⓘ ข้างป้ายเป้ายอดขายทั้งปีอันเดียว").toHaveCount(1);
    await expect(คำอธิบาย(page), "สูตรไม่ขึ้นบนจอก่อนชี้").toBeHidden();

    await ปุ่ม(page).hover();
    await expect(คำอธิบาย(page), "ชี้เมาส์แล้วสูตรขึ้น").toBeVisible();
    await page.getByRole("table", { name: "เป้าหมายรายดีลเลอร์", exact: true }).hover();
    await expect(คำอธิบาย(page), "เอาเมาส์ออกแล้วสูตรหาย").toBeHidden();

    // คีย์บอร์ด: โฟกัสด้วยคีย์บอร์ดถึงปุ่ม (ไม่ใช้เมาส์) → ขึ้น · Esc → ปิด · Enter → เปิด
    //   วางโฟกัสที่ปุ่มก่อน แล้ว Shift+Tab ออก · Tab กลับเข้า = ถึงปุ่มด้วยคีย์บอร์ดจริง (ไม่ต้องนับ Tab จากหัวหน้า)
    await page.mouse.move(0, 0);
    await ปุ่ม(page).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(ปุ่ม(page)).not.toBeFocused();
    await expect(คำอธิบาย(page), "ออกจากปุ่มแล้วสูตรหาย").toBeHidden();
    await page.keyboard.press("Tab");
    await expect(ปุ่ม(page), "Tab ถึงปุ่ม ⓘ ได้").toBeFocused();
    await expect(คำอธิบาย(page), "โฟกัสด้วยคีย์บอร์ดแล้วสูตรขึ้น").toBeVisible();
    await expect(ปุ่ม(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(คำอธิบาย(page), "Esc แล้วสูตรหาย").toBeHidden();
    await page.keyboard.press("Enter");
    await expect(คำอธิบาย(page), "Enter แล้วสูตรขึ้น").toBeVisible();
  });
});

test.describe("[มือถือ]", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("[hq] ⓘ เป้ายอดขายทั้งปี: กดแล้วขึ้น · กดอีกครั้งปิด · กดที่อื่นปิด · ไม่ล้นจอ", async ({ page }) => {
    await เปิดแท็บเป้า(page);
    await expect(คำอธิบาย(page), "สูตรไม่ขึ้นบนจอก่อนกด").toBeHidden();
    await ปุ่ม(page).scrollIntoViewIfNeeded();
    await ปุ่ม(page).tap();
    await expect(คำอธิบาย(page), "มือถือกดแล้วสูตรขึ้น").toBeVisible();
    const กรอบ = await คำอธิบาย(page).boundingBox();
    const กว้างจอ = page.viewportSize()!.width;
    expect(กรอบ && กรอบ.width <= กว้างจอ, "กล่องคำอธิบายไม่กว้างกว่าจอ").toBe(true);
    await ปุ่ม(page).tap();
    await expect(คำอธิบาย(page), "กดอีกครั้งแล้วสูตรหาย").toBeHidden();
    await ปุ่ม(page).tap();
    await expect(คำอธิบาย(page)).toBeVisible();
    await page.getByRole("table", { name: "เป้าหมายรายดีลเลอร์", exact: true }).tap({ position: { x: 5, y: 5 } });
    await expect(คำอธิบาย(page), "กดที่อื่นแล้วสูตรหาย").toBeHidden();
  });
});
