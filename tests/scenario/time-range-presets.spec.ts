import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle, ย้อนเดือนISO } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ } from "./ownDealer";

// ── ตัวเลือกช่วงเวลาเหลือ 4 ตัว ทุกหน้า HQ + ดีลเลอร์ (บอสสั่ง 3 พ.ย. 69 · ตัวกลาง FilterContext/FilterBar) ─────────────────────
//   1 เดือน · 3 เดือน · 1 ปี (ค่าเริ่มต้น = ย้อนหลัง 12 เดือนถึงวันนี้) · กำหนดเอง — ไม่มี ทุกช่วงเวลา/วันนี้/7 วันล่าสุด/เดือนนี้/ปีนี้
//   เลือก 1 เดือน → วันเริ่ม = ย้อนหลัง 1 เดือน (ปัดสิ้นเดือน · สูตรตรวจละเอียดใน tests/unit/timePresets.test.ts) วันสิ้นสุด = วันนี้
//   ช่วงที่จำไว้เป็นตัวเลือกที่เอาออก → กลับค่าเริ่มต้น 1 ปี · ตัวเลขบนการ์ดเปลี่ยนตามช่วง (แดชบอร์ด HQ: ลีดใหม่ = นับจากตารางในช่วงนั้น)
//   ตกบนโค้ดก่อน 3 พ.ย. 69: เมนูมี 5 ตัวเลือก + กำหนดเอง · ค่าเริ่มต้น = ปีนี้ (1 ม.ค.)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const วันนี้ = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ช่วง = (page: Page) => page.locator("[data-time-range]").first();

async function ตรวจเมนู(page: Page, ที่: string) {
  await expect(ช่วง(page), `${ที่}: มีตัวเลือกช่วงเวลา`).toBeVisible({ timeout: 30_000 });
  await expect(ช่วง(page), `${ที่}: ค่าเริ่มต้น 1 ปี`).toHaveAttribute("data-time-range", "y1");
  await expect(ช่วง(page), `${ที่}: เริ่ม = ย้อนหลัง 12 เดือน`).toHaveAttribute("data-start", ย้อนเดือนISO(วันนี้(), 12));
  await expect(ช่วง(page), `${ที่}: สิ้นสุด = วันนี้`).toHaveAttribute("data-end", วันนี้());
  await expect(ช่วง(page).locator("button").first(), `${ที่}: ปุ่มแสดงวันที่จริงเป็น พ.ศ.`).toContainText(String(Number(วันนี้().slice(0, 4)) + 543));
  await ช่วง(page).locator("button").first().click();
  const ตัวเลือก = ช่วง(page).locator("button").filter({ hasText: /^(1 เดือน|3 เดือน|1 ปี|ทุกช่วงเวลา|วันนี้|7 วันล่าสุด|เดือนนี้|ปีนี้)$/ });
  await expect(ตัวเลือก, `${ที่}: 3 ตัวเลือก + กำหนดช่วงเอง`).toHaveText(["1 เดือน", "3 เดือน", "1 ปี"]);
  await expect(ช่วง(page).getByRole("button", { name: "กำหนดช่วงเอง" }), `${ที่}: มีกำหนดเอง`).toBeVisible();
  await ช่วง(page).getByRole("button", { name: "1 เดือน", exact: true }).click();
  await expect(ช่วง(page), `${ที่}: เลือก 1 เดือน`).toHaveAttribute("data-time-range", "m1");
  await expect(ช่วง(page), `${ที่}: 1 เดือน เริ่ม = ย้อนหลัง 1 เดือน`).toHaveAttribute("data-start", ย้อนเดือนISO(วันนี้(), 1));
  await expect(ช่วง(page)).toHaveAttribute("data-end", วันนี้());
}

const หน้าHQ = ["/hq/dashboard", "/hq/leads", "/hq/quotations", "/hq/customers"];
const หน้าดีลเลอร์ = ["/dashboard", "/leads", "/quotations", "/customers"];

test("[ui·hq] ทุกหน้า HQ ที่มีตัวเลือกช่วงเวลา: 4 ตัวเลือกพอดี · ค่าเริ่มต้น 1 ปี · เลือก 1 เดือนได้วันถูก", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const p of หน้าHQ) {
    await page.goto(`${HQ_ORIGIN}${p}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await ตรวจเมนู(page, p);
  }
});

test("[ui·dealer] ทุกหน้าดีลเลอร์ที่มีตัวเลือกช่วงเวลา: 4 ตัวเลือกพอดี · ค่าเริ่มต้น 1 ปี · เลือก 1 เดือนได้วันถูก", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  for (const p of หน้าดีลเลอร์) {
    await page.goto(`${DEALER_ORIGIN}${p}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await ตรวจเมนู(page, p);
  }
});

test("[ui·hq] ช่วงที่จำไว้เป็นตัวเลือกที่เอาออก (ปีนี้/ทุกช่วงเวลา) → กลับค่าเริ่มต้น 1 ปี", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  for (const เก่า of ["thisYear", "all", "today"]) {
    await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
    await page.evaluate(v => sessionStorage.setItem("bpms_filters:/hq/leads", JSON.stringify({ preset: v })), เก่า);
    await page.reload({ waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(ช่วง(page), `จำไว้ "${เก่า}" → 1 ปี`).toHaveAttribute("data-time-range", "y1", { timeout: 20_000 });
  }
});

test("[ui·hq] ตัวเลขบนการ์ดเปลี่ยนตามช่วง: ลีดใหม่ของสาขาของข้อ 1 ปี = 3 · 3 เดือน = 2 · 1 เดือน = 1", async ({ page }) => {
  const สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  try {
    const ฐาน = 1_977_000_000 + Math.floor(Math.random() * 400_000) * 10;
    // ลีดของข้อ: วันนี้ · 2 เดือนก่อน · 6 เดือนก่อน · 14 เดือนก่อน (นอก 1 ปี)
    const วันเข้า = [วันนี้(), ย้อนเดือนISO(วันนี้(), 2), ย้อนเดือนISO(วันนี้(), 6), ย้อนเดือนISO(วันนี้(), 14)];
    expect(รันSQLในฐาน(`set local session_replication_role = replica;
      insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
      ${วันเข้า.map((d, i) => `('#L-${ฐาน + i}', ${ฐาน + i}, '${สาขา.รหัส}', 'ZZTEST-ช่วงเวลา-${สาขา.รหัส}-${i}', 'ZZTEST', '000-000-05${i}0', 'ตราด', 'BULLET', '${d}')`).join(",
      ")};`),
      "วางลีดของข้อ").not.toBeNull();
    await loginUI(page, HQ_ORIGIN, "/hq/dashboard", ADMIN);
    await settle(page);
    await page.getByRole("button", { name: /ทุกดีลเลอร์ \(ทั้งเครือ\)/ }).first().click();
    await page.getByRole("button", { name: new RegExp(`^${สาขา.รหัส} – `) }).click();
    const การ์ด = page.locator("[data-kpi='leads'] [data-value]").first();
    await expect(การ์ด, "1 ปี (ค่าเริ่มต้น): 3 ราย").toHaveAttribute("data-value", "3", { timeout: 30_000 });
    for (const [ป้าย, ตัว, คาด] of [["3 เดือน", "m3", "2"], ["1 เดือน", "m1", "1"], ["1 ปี", "y1", "3"]] as const) {
      await ช่วง(page).locator("button").first().click();
      await ช่วง(page).getByRole("button", { name: ป้าย, exact: true }).click();
      await expect(ช่วง(page)).toHaveAttribute("data-time-range", ตัว);
      await expect(การ์ด, `${ป้าย}: ${คาด} ราย`).toHaveAttribute("data-value", คาด, { timeout: 30_000 });
    }
  } finally { await สาขา.ลบ(); }
});
