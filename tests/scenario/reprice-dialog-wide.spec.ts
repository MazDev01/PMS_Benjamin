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
let สาขา: สาขาของข้อ, ใบ: ใบHQพร้อมใช้ | null = null, ใบข: ใบHQพร้อมใช้ | null = null;
const บริษัทข = `ZZTEST-ราคาหมดอายุอีกราย-${แท็ก}`;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  ใบ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัท, province: "ตราด", estimate: รายการ,
    lines: [{ name: "โครงสร้างเหล็ก", qty: 41, unit: "ตัน", unitCost: 40_000 }] });
  ใบข = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัทข, province: "ตราด", estimate: รายการ.slice(0, 2),
    lines: [{ name: "โครงสร้างเหล็ก", qty: 10, unit: "ตัน", unitCost: 40_000 }] });
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, [ใบ, ใบข].filter((x): x is ใบHQพร้อมใช้ => !!x).map(x => x.leadNum));
  await สาขา?.ลบ();
});

async function เปิดแผง(page: Page, ชื่อ = บริษัท) {
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await เปิดจากตาราง(page, ชื่อ);
}
/** เปิดหน้าต่างลูกค้าเป้าหมายจากตาราง (ไม่โหลดหน้าใหม่ — state ของหน้ายังอยู่ ตรงกับที่บอสใช้) */
async function เปิดจากตาราง(page: Page, ชื่อ: string) {
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill(ชื่อ);
  const แถว = page.locator("tbody tr").filter({ hasText: ชื่อ });
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

// ── บั๊ก 20 พ.ย. 69 บอส "ทำไมกดแล้วมันเด้ง": เปิดหน้าต่างลูกค้าแล้วกล่องขอแก้ราคาเด้งเอง ─────────────────────────────────────────
//   ต้นเหตุ: คำสั่ง "ขอราคาใหม่" ค้างในหน้า (ไม่ล้างหลังใช้/ตอนเปลี่ยนราย) · แท็บทั้ง 3 สร้างพร้อมกันตอนเปิดหน้าต่าง
//   → กล่องราคาจาก HQ ที่สร้างใหม่เห็นคำสั่งเก่าแล้วเปิดกล่องเอง · กติกา: เปิดหน้าต่างลูกค้าต้องไม่มีกล่องเด้งเองเลย
//   ตกบนโค้ดเดิม (02fff754): ขั้น 2–4 ของข้อนี้เจอกล่องขอแก้ราคาเด้ง
test("[D·dealer] กดขอราคาใหม่แล้วยกเลิก → เปิดรายอื่น/รายเดิมจากตาราง และจาก ?open= = แท็บภาพรวม ไม่มีกล่องเด้ง", async ({ page }) => {
  const errs = watchErrors(page);
  รันSQLในฐาน(`alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    update public.hq_quotes set valid_until = current_date - 2 where id in (${ใบ!.hqQuoteId}, ${ใบข!.hqQuoteId});
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;`);
  await page.setViewportSize({ width: 1366, height: 768 });
  const ไม่มีกล่อง = async (ที่: string) => {
    const ขั้นต่อไป = page.locator('[data-panel="next-step"]:not([aria-busy])');
    await expect(ขั้นต่อไป, `${ที่}: หน้าต่างลูกค้าเปิด (ขั้นต่อไปโหลดเสร็จ)`).toContainText("ราคาจาก HQ หมดอายุแล้ว", { timeout: 20_000 });
    await expect(page.locator("[data-quote-request-folded]"), `${ที่}: กล่องราคาจาก HQ โหลดรายการเสร็จ (บรรทัดพับขึ้น)`).toBeAttached({ timeout: 20_000 });
    // ตรวจว่า "ไม่เกิด" ต้องให้โอกาสเกิดก่อน: รอกล่องขึ้นได้ถึง 2 วิ (คำสั่งค้างเปิดกล่องทันทีที่กล่องราคาจาก HQ โหลดรายการเสร็จ)
    const เด้ง = await page.locator("[data-reason-dialog]").waitFor({ state: "attached", timeout: 2_000 }).then(() => true, () => false);
    expect(เด้ง, `${ที่}: ไม่มีกล่องขอแก้ราคาเด้งเอง`).toBe(false);
    // หน้าต่างลูกค้าเป้าหมายเองเป็น role=dialog (RowPanel) — นับเฉพาะหน้าต่างอื่น (รอบตรวจ deploy29: ภาพยืนยันว่าไม่มีกล่องเด้ง · นับเดิมรวมหน้าต่างลูกค้า)
    await expect(page.getByRole("dialog", { name: "ข้อมูลลูกค้าเป้าหมาย", exact: true }), `${ที่}: หน้าต่างลูกค้าเป้าหมายเปิด`).toHaveCount(1);
    await expect(page.getByRole("dialog"), `${ที่}: ไม่มีหน้าต่างอื่นเด้ง (มีแค่หน้าต่างลูกค้าเป้าหมาย)`).toHaveCount(1);
    await expect(page.getByRole("alertdialog"), `${ที่}: ไม่มีกล่องยืนยัน/เหตุผลเด้ง`).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ภาพรวม", exact: true }).first(), `${ที่}: อยู่แท็บภาพรวม`).toBeVisible();
  };
  // 1) รายแรก: กด "ขอราคาใหม่" แล้วยกเลิก (คำสั่งเคยค้างตรงนี้)
  await เปิดแผง(page);
  await page.locator('[data-panel="next-step"]:not([aria-busy])').getByRole("button", { name: "ขอราคาใหม่", exact: true }).click({ timeout: 20_000 });
  await page.locator("[data-reason-dialog]").locator("[data-dialog-cancel]").click({ timeout: 15_000 });
  await expect(page.locator("[data-reason-dialog]")).toHaveCount(0);
  // 2) สลับแท็บไปกลับ (แผงเดิม)
  await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  const เด้งแท็บ = await page.locator("[data-reason-dialog]").waitFor({ state: "attached", timeout: 2_000 }).then(() => true, () => false);
  expect(เด้งแท็บ, "สลับแท็บกลับมา: ไม่เด้ง").toBe(false);
  // 3) ปิดหน้าต่าง แล้วเปิดอีกราย (ราคาหมดอายุเหมือนกัน) จากตาราง — ไม่โหลดหน้าใหม่
  await page.keyboard.press("Escape");
  await เปิดจากตาราง(page, บริษัทข);
  await ไม่มีกล่อง("อีกรายจากตาราง");
  // 4) ปิด แล้วเปิดรายเดิมจากตารางอีกครั้ง
  await page.keyboard.press("Escape");
  await เปิดจากตาราง(page, บริษัท);
  await ไม่มีกล่อง("รายเดิมจากตาราง");
  // 5) เปิดจากที่อยู่ ?open=
  await page.goto(`${DEALER_ORIGIN}/leads?open=${ใบข!.leadNum}`, { waitUntil: "domcontentloaded" }); await settle(page);
  await ไม่มีกล่อง("?open=");
  assertNoErrors(errs, "เปิดหน้าต่างไม่มีกล่องเด้ง");
});
