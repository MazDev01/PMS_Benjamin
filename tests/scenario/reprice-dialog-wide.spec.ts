import { test, expect, type Page, type Locator } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── กล่องขอแก้ราคา / ขอราคาใหม่ = หน้าต่างเอกสาร 820 (บอสสั่ง 20 พ.ย. 69 "ปรับใบเป็นแบบอื่น มันดูยาก" · "หน้าต่างมันแคบ") ────────
//   เดิม: กล่องแจ้งเตือนกว้าง 420 → ช่องจำนวนถูกตัด ("6." "57") · ช่องหน่วยดูว่าง (ค่ามีแต่ที่แสดงไม่พอ) · ปุ่มส่งตกขอบล่างจอ
//   เปิดได้ 2 ทาง: ปุ่ม "ขอแก้ราคา" (บรรทัดพับของกล่องราคาจาก HQ) · "ขอราคาใหม่ →" (ขั้นต่อไป เมื่อราคาหมดอายุ) — กล่องเดียวกัน
//   ตรวจ: กว้าง 820 · หน่วยจากคำขอเดิมแสดงในช่อง · ช่องจำนวนไม่ถูกตัด (scrollWidth ≤ clientWidth) · ปุ่มส่งอยู่ในจอโดยไม่ต้องเลื่อน
//   ตกบนโค้ดเดิม (6c69288b): กล่องกว้าง ~420 · ช่องจำนวนถูกตัด · ปุ่มส่งอยู่นอกจอเมื่อรายการยาว
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
const แท็ก = Date.now() % 100_000;
const บริษัท = `ZZTEST-กล่องขอแก้ราคา-${แท็ก}`;
const รายการ = [
  { name: "เสาเหล็ก H-Beam", qty: 12.3, unit: "ตัน" }, { name: "คานเหล็ก H-Beam", qty: 10.3, unit: "ตัน" },
  { name: "โครงหลังคาเหล็ก (โครงถัก)", qty: 8.3, unit: "ตัน" }, { name: "แปเหล็กตัวซี", qty: 6.2, unit: "ตัน" },
  { name: "เหล็กค้ำยันและแผ่นต่อ", qty: 4.1, unit: "ตัน" }, { name: "แผ่นหลังคาเมทัลชีท 0.47 มม.", qty: 1234567.5, unit: "ตร.ม." },
];
let สาขา: สาขาของข้อ, ใบ: ใบHQพร้อมใช้ | null = null;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  ใบ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัท, province: "ตราด", estimate: รายการ,
    lines: [{ name: "โครงสร้างเหล็ก", qty: 41, unit: "ตัน", unitCost: 40_000 }] });
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, ใบ ? [ใบ.leadNum] : []);
  await สาขา?.ลบ();
});

async function เปิดแผง(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill(บริษัท);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัท });
  await expect(แถว).toHaveCount(1, { timeout: 20_000 });
  await แถว.locator("td").first().click();
}
async function ตรวจกล่อง(page: Page): Promise<Locator> {
  const กล่อง = page.locator("[data-reason-dialog-wide]");
  await expect(กล่อง, "หน้าต่างขอแก้ราคา").toBeVisible({ timeout: 15_000 });
  const กว้าง = (await กล่อง.boundingBox())!.width;
  expect(Math.round(กว้าง), "กว้าง 820 (ภาษาออกแบบดีลเลอร์)").toBe(820);
  for (const [i, r] of รายการ.entries()) {
    await expect(กล่อง.getByLabel(`หน่วย ${i + 1}`, { exact: true }), `หน่วยแถว ${i + 1} = ค่าเดิมจากคำขอ`).toHaveValue(r.unit);
    const ช่อง = กล่อง.getByLabel(`จำนวน ${i + 1}`, { exact: true });
    const ล้น = await ช่อง.evaluate(e => (e as HTMLInputElement).scrollWidth - (e as HTMLInputElement).clientWidth);
    expect(ล้น, `ช่องจำนวนแถว ${i + 1} ไม่ถูกตัด`).toBeLessThanOrEqual(0);
  }
  await expect(กล่อง.getByRole("button", { name: "ส่งขอแก้ราคา", exact: true }), "ปุ่มส่งติดล่างหน้าต่าง อยู่ในจอ").toBeInViewport({ ratio: 1 });
  return กล่อง;
}

test("[D·dealer] ขอแก้ราคา (บรรทัดพับ) → หน้าต่าง 820 · หน่วยเดิมแสดง · จำนวนไม่ตัด · ปุ่มส่งในจอ", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await เปิดแผง(page);
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.locator("[data-quote-request-folded]").getByRole("button", { name: "ขอแก้ราคา", exact: true }).click({ timeout: 20_000 });
  const กล่อง = await ตรวจกล่อง(page);
  await กล่อง.locator("[data-dialog-cancel]").click();
  await expect(กล่อง).toHaveCount(0);
  assertNoErrors(errs, "กล่องขอแก้ราคา");
});

test("[D·dealer] ราคาหมดอายุ → ขอราคาใหม่ (ขั้นต่อไป) → หน้าต่างเดียวกัน", async ({ page }) => {
  const errs = watchErrors(page);
  // ใบ HQ ที่ส่งแล้วแก้ไม่ได้ (ตั้งใจ) — ปลดตัวกันชั่วคราวที่ฐานทดสอบในเครื่องเพื่อจำลองวันที่ผ่านไป (แบบเดียวกับ lead-next-step.spec)
  รันSQLในฐาน(`alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    update public.hq_quotes set valid_until = current_date - 2 where id = ${ใบ!.hqQuoteId};
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;`);
  await page.setViewportSize({ width: 1366, height: 768 });
  await เปิดแผง(page);
  const ขั้นต่อไป = page.locator('[data-panel="next-step"]:not([aria-busy])');
  await expect(ขั้นต่อไป).toContainText("ราคาจาก HQ หมดอายุแล้ว", { timeout: 20_000 });
  await ขั้นต่อไป.getByRole("button", { name: "ขอราคาใหม่", exact: true }).click();
  const กล่อง = await ตรวจกล่อง(page);
  await กล่อง.locator("[data-dialog-cancel]").click();
  assertNoErrors(errs, "กล่องขอราคาใหม่");
});
