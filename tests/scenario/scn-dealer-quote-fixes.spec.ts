import { test, expect } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors, db } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ข้อผิดจากผู้ตรวจ scn-flow (คนรวมงาน 23 พ.ย. 69 · ขับเบราว์เซอร์บน e2b941e1) — ใบเสนอราคาฝั่งดีลเลอร์ 3 ข้อ ──
//   1) ช่องพื้นที่ตอนทำใบ = ผลรวมจำนวนทุกแถวหน่วย "ตร.ม." ในรายการ (800 + เสา 12 = 812) ลงฐาน → ต้องเป็นพื้นที่ของลูกค้าเป้าหมาย (800)
//   2) หน้าใบเสนอราคา + การ์ด "ใบเสนอราคาล่าสุด" อ่านข้อความ total ('0') ขณะ HQ อ่าน total_value → ต้องขึ้นยอดจาก total_value
//   3) บันทึกผล (ปฏิเสธ) แล้ว กล่องราคาจาก HQ ยังขึ้น "ส่งแล้ว รอดีลเลอร์" + ปุ่มขอแก้ราคา · รีโหลดแล้วคำขอ/ใบ HQ หาย
//      → หลังปิด แสดงคำขอ + ใบ HQ อ่านอย่างเดียว ไม่มีปุ่มขอแก้ราคา
//   ตกบนโค้ดเดิม (e2b941e1): ข้อ 1 ช่องพื้นที่ = 812 · ข้อ 2 ขึ้น "0" · ข้อ 3 ปุ่มขอแก้ราคายังอยู่ / รีโหลดแล้วขึ้น "ขอราคาจาก HQ ได้ในขั้น…"
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
// 3 ข้ออิสระ (ข้อหนึ่งตก ข้ออื่นยังรัน = พิสูจน์บนโค้ดเดิมได้ครบทุกข้อ)
const แท็ก = Date.now() % 100_000;
const บริษัทก = `ZZTEST-พื้นที่ใบ-${แท็ก}`;
const บริษัทข = `ZZTEST-ยอดใบ-${แท็ก}`;
const บริษัทค = `ZZTEST-ปิดแล้ว-${แท็ก}`;
let สาขา: สาขาของข้อ, ใบก: ใบHQพร้อมใช้ | null = null, ใบข: ใบHQพร้อมใช้ | null = null, ใบค: ใบHQพร้อมใช้ | null = null;
// ลูกค้าเป้าหมายพื้นที่ 800 ตร.ม. (ข้อมูลงานครบชุด) · ใบ HQ มีหลังคา 800 ตร.ม. + เสา 12 หน่วย ตร.ม. (แบบที่ผู้ตรวจเจอ)
const รายการHQ = [
  { name: "ZZ โครงหลังคาเหล็ก", qty: 800, unit: "ตร.ม.", unitCost: 1_000 },
  { name: "ZZ เสาเหล็ก", qty: 12, unit: "ตร.ม.", unitCost: 500 },
];

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส);
  ใบก = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัทก, province: "ตราด", lines: รายการHQ });
  ใบข = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัทข, province: "ตราด", lines: รายการHQ });
  ใบค = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: บริษัทค, province: "ตราด", lines: รายการHQ });
});
test.afterAll(async () => {
  if (สาขา) ล้างใบHQทดสอบ(สาขา.รหัส, [ใบก, ใบข, ใบค].filter((x): x is ใบHQพร้อมใช้ => !!x).map(x => x.leadNum));
  await สาขา?.ลบ();
});

async function เปิดลูกค้าเป้าหมาย(page: import("@playwright/test").Page, บริษัท: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...", { exact: true }).fill(บริษัท);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัท });
  await expect(แถว, `เจอ ${บริษัท}`).toHaveCount(1, { timeout: 20_000 });
  await แถว.locator("td").first().click();
}

test("[D·dealer] ทำใบ: พื้นที่ตั้งต้น = พื้นที่ลูกค้าเป้าหมาย (ไม่รวมแถว ตร.ม. ในรายการ) · ลงฐาน 800", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await เปิดลูกค้าเป้าหมาย(page, บริษัทก);
  const ขั้นต่อไป = page.locator('[data-panel="next-step"]:not([aria-busy])');
  await ขั้นต่อไป.locator('[data-next-step="make_quote"]').click({ timeout: 20_000 });
  await expect(page.locator("#q-area"), "ข้อ 1: พื้นที่ตั้งต้น = พื้นที่ลูกค้าเป้าหมาย 800 (เดิม 812)").toHaveValue("800", { timeout: 20_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา", exact: true }).click();
  const sb = await db(สาขา.บัญชี);
  await expect.poll(async () => (await sb.from("quotations").select("area").eq("dealer_code", สาขา.รหัส).eq("deal_id", ใบก!.leadNum)).data?.map(r => String(r.area)),
    { timeout: 25_000, message: "ข้อ 1: พื้นที่ที่ลงฐาน = 800" }).toEqual(["800"]);
  assertNoErrors(errs, "ใบเสนอราคาดีลเลอร์ ข้อ 1");
});

test("[D·dealer] ลูกค้าปฏิเสธแล้ว: กล่องราคาจาก HQ = คำขอปิด อ่านอย่างเดียว ไม่มีขอแก้ราคา · รีโหลดยังเห็นคำขอ/ใบ HQ", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  const sb = await db(สาขา.บัญชี);
  // ฉบับ V1 + พื้นที่ แบบใบที่ทำจากหน้าจอ (ไม่ใส่ = ฐานเห็นหน้าจอส่ง "V1" กลับมาตอนบันทึกผล → ปฏิเสธว่าแก้ใบที่ส่งแล้ว)
  const q = await ทำใบลูกค้าจากใบHQ(สาขา.บัญชี, ใบค!, { customer: บริษัทค, markupPercent: 10, extra: { revision: "V1", area: "800" } });
  const ส่ง = await sb.rpc("quotation_send", { p_dealer: สาขา.รหัส, p_id: q.id });
  if (ส่ง.error) throw new Error(`ส่งใบให้ลูกค้าไม่สำเร็จ: ${ส่ง.error.message}`);
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await เปิดลูกค้าเป้าหมาย(page, บริษัทค);
  const ขั้นต่อไป = page.locator('[data-panel="next-step"]:not([aria-busy])');
  await expect(ขั้นต่อไป).toContainText("ส่งใบให้ลูกค้าแล้ว — รอผลจากลูกค้า", { timeout: 25_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();   // กล่องราคาจาก HQ อยู่ในแท็บใบเสนอราคา
  const กล่องHQ = page.locator('[data-panel="quote-request"]');
  await expect(กล่องHQ.getByRole("button", { name: "ขอแก้ราคา", exact: true }), "ก่อนบันทึกผล = ขอแก้ราคาได้ (เงื่อนไขเดิม)").toBeVisible({ timeout: 20_000 });
  await ขั้นต่อไป.locator('[data-next-step="await_customer"]').click();
  const เลือก = page.getByRole("dialog", { name: "บันทึกผลจากลูกค้า", exact: true });
  await เลือก.getByRole("button", { name: "ลูกค้าปฏิเสธ", exact: true }).click();
  const ตัวเลือก = page.locator("[data-lost-picker]");
  await expect(ตัวเลือก).toBeVisible({ timeout: 30_000 });
  await expect(ตัวเลือก.locator("button").last(), "ลูกค้าปฏิเสธ: อื่น ๆ (ระบุ) อยู่ท้ายรายการ (บอสสั่ง 24 พ.ย. 69)").toHaveText("อื่น ๆ (ระบุ)");
  await ตัวเลือก.getByRole("button").first().click();
  await page.locator("[data-reason-dialog]").getByRole("button", { name: "ยืนยันลูกค้าปฏิเสธ", exact: true }).click();
  await expect.poll(async () => (await sb.from("leads").select("status").eq("dealer_code", สาขา.รหัส).eq("num_id", ใบค!.leadNum).single()).data?.status,
    { timeout: 25_000, message: "ปฏิเสธ → ลูกค้าเป้าหมายปิดไม่สำเร็จ" }).toBe("CANCELLED");

  // ไม่รีโหลด — กล่องต้องตามสถานะใหม่เอง
  await expect(กล่องHQ, "ข้อ 3: คำขอปิดแล้ว (ไม่ใช่ ส่งแล้ว รอดีลเลอร์)").toContainText("ปิด (ไม่ได้งาน)", { timeout: 20_000 });
  await expect(กล่องHQ.getByRole("button", { name: "ขอแก้ราคา", exact: true }), "ข้อ 3: ปิดแล้วไม่มีปุ่มขอแก้ราคา").toHaveCount(0);
  // รีโหลด (หน้าต่างลูกค้าเป้าหมายเปิดค้างจากที่อยู่หน้าเว็บ · รายที่ปิดไม่สำเร็จไม่อยู่ในตารางตั้งต้น) — คำขอ + ใบ HQ ยังอยู่ให้ดูย้อน
  await page.reload({ waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
  await expect(กล่องHQ, "ข้อ 3: รีโหลดแล้วยังเห็นใบ HQ").toContainText(ใบค!.quoteNo, { timeout: 20_000 });
  await expect(กล่องHQ).toContainText("ปิด (ไม่ได้งาน)");
  await expect(กล่องHQ, "ข้อ 3: ไม่ขึ้นข้อความขอราคาใหม่แทนประวัติ").not.toContainText("ขอราคาจาก HQ ได้ในขั้น");
  await expect(กล่องHQ.getByRole("button", { name: "ขอแก้ราคา", exact: true })).toHaveCount(0);
  assertNoErrors(errs, "ใบเสนอราคาดีลเลอร์ ข้อ 3");
});

test("[D·dealer] ยอดใบบนหน้าใบเสนอราคา + การ์ดใบเสนอราคาล่าสุด = total_value (ใบที่ข้อความ total เป็น '0')", async ({ page }) => {
  const errs = watchErrors(page);
  // ใบที่ข้อความยอดเป็น '0' แต่ฐานคิด total_value จากรายการ (แบบใบ 90 ใบในฐาน dev)
  const q = await ทำใบลูกค้าจากใบHQ(สาขา.บัญชี, ใบข!, { customer: บริษัทข, markupPercent: 10 });
  const sb = await db(สาขา.บัญชี);
  const แถวฐาน = (await sb.from("quotations").select("total, total_value").eq("dealer_code", สาขา.รหัส).eq("id", q.id).single()).data;
  expect(แถวฐาน?.total, "ตั้งต้นของข้อ: ข้อความยอด = '0'").toBe("0");
  expect(Number(แถวฐาน?.total_value), "ตั้งต้นของข้อ: total_value > 0").toBeGreaterThan(0);
  const คาด = "฿" + Number(แถวฐาน!.total_value).toLocaleString("th-TH");

  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
  const แถว = page.locator("tbody tr").filter({ hasText: q.id });
  await expect(แถว, "ใบอยู่ในตาราง").toHaveCount(1, { timeout: 25_000 });
  await expect(แถว, `ข้อ 2: ตารางขึ้น ${คาด} (เดิม 0)`).toContainText(คาด);

  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" }); await settle(page);
  const การ์ด = page.locator(`[data-latest-quote="${q.id}"]`);
  await expect(การ์ด, "ใบอยู่ในการ์ดใบเสนอราคาล่าสุด").toBeVisible({ timeout: 25_000 });
  await expect(การ์ด, `ข้อ 2: การ์ดขึ้น ${คาด} (เดิม 0)`).toContainText(คาด);
  assertNoErrors(errs, "ยอดใบเสนอราคาดีลเลอร์ ข้อ 2");
});
