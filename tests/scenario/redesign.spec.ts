import { test, expect } from "@playwright/test";
import { open, assertHealthyPage, openLeadQuotationForm, settle } from "./helpers";
import { RYG } from "./supabaseEnv";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { REAL_BACKEND } from "./supabaseEnv";

// "วันนี้ของระบบ" (APP_NOW) เดินตามแหล่งข้อมูล: supabase = วันจริง · local = ตรึง 30 มิ.ย. 2569
// เทสต์ประทับวันใบใหม่จึงต้องคำนวณวันคาดหวังแบบเดียวกัน (ไม่ hardcode "30 มิ.ย.")
const TH_MO_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function appNowThaiShort(): string {
  const d = REAL_BACKEND ? new Date() : new Date(2026, 5, 30); // ตรงกับ APP_NOW ใน FilterContext
  return `${d.getDate()} ${TH_MO_ABBR[d.getMonth()]}`;           // เช่น "30 มิ.ย." (ตรงกับ fmtISOToThai แบบไม่รวมปี)
}

// รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 7): หน้าใบเสนอราคาเป็นรายการอย่างเดียว — ดูใบที่แผงลีด › แท็บใบเสนอราคา › ดู
//   ข้อทดสอบวางใบของตัวเอง (ใบ HQ → ใบลูกค้า ทางเดียวกับของจริง) แล้วเปิดหน้าดูใบจากหน้ารายการ (กดแถว → แผงลีด)
const บริษัทดูใบ = `ZZTEST-ดูใบ-${Date.now() % 100000}`;
let ใบHQดู: ใบHQพร้อมใช้ | undefined;
let เลขใบดู = "";
test.beforeAll(async () => {
  if (!REAL_BACKEND) return;
  ใบHQดู = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: บริษัทดูใบ, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดดู", qty: 2, unit: "ชุด", unitCost: 1000 }] });
  เลขใบดู = (await ทำใบลูกค้าจากใบHQ(RYG, ใบHQดู, { customer: บริษัทดูใบ, markupPercent: 10 })).id;
});
test.afterAll(() => { if (ใบHQดู) ล้างใบHQทดสอบ("RYG", [ใบHQดู.leadNum]); });
async function เปิดหน้าดูใบ(page: import("@playwright/test").Page) {
  await open(page, "dealer", "/quotations");
  await assertHealthyPage(page, "ใบเสนอราคา");
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบดู);
  await page.locator("tbody tr").filter({ hasText: เลขใบดู }).first().locator("td").nth(1).click({ timeout: 20_000 });
  await page.waitForURL(/\/leads/, { timeout: 25_000 });
  await settle(page);
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
  await page.locator(`[data-quote-item="${เลขใบดู}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
}

// หน้าดูใบ (แผงลีด) = เอกสาร + BOQ + ยอดสรุป ไม่ล้นแนวนอน
test("[ui·dealer] หน้าดูใบเสนอราคา (BOQ + สรุป + สถานะ) ไม่ล้นแนวนอน", async ({ page }) => {
  test.skip(!REAL_BACKEND, "ต้องมีฐานจริงสำหรับวางใบ HQ");
  test.setTimeout(90_000);   // เปิดหน้าดูใบผ่าน 3 หน้า (รายการ → แผงลีด → ใบ) — ตอนรันชุดยาวเกิน 30 วินาทีได้
  await เปิดหน้าดูใบ(page);
  // เอกสาร + BOQ + ยอดสรุป
  await expect(page.getByText("รายการสินค้า (BOQ)")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ชื่อโครงการ / เอกสาร")).toBeVisible();
  // สรุปยอด = ยอดชำระสุทธิท้าย BOQ (หัวข้อ "สรุปใบเสนอราคา" ถูกยุบไปเป็นป้ายบนหัวแผงแล้ว)
  // (ไม่เช็ค "เปลี่ยนสถานะ" — โผล่เฉพาะใบที่ลูกค้ายังไม่ตอบ ส่วนแถวแรกเป็นใบที่ตอบรับแล้ว)
  // คำบนจอเปลี่ยนตอนเพิ่มภาษีหัก ณ ที่จ่าย (28 ส.ค. 69): "ยอดรวมสุทธิ (รวม VAT)" → "รวมเป็นเงิน" + "ยอดชำระสุทธิ"
  await expect(page.getByText("ยอดชำระสุทธิ").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "พิมพ์ PDF" })).toBeVisible();
  // โมดัลใหญ่ต้องไม่ทำให้หน้าเลื่อนแนวนอน
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "โมดัลใบเสนอราคาไม่ควรมี horizontal scroll").toBeLessThanOrEqual(3);
});

// จอแคบ (มือถือ 390px): หน้าดูใบในแผงลีดต้องไม่เลื่อนแนวนอน — ตาราง BOQ เลื่อนในกล่องตัวเอง (บอสอนุมัติ 22 ต.ค. 69)
test("[ui·dealer] หน้าดูใบเสนอราคาบนจอแคบ ไม่เลื่อนแนวนอน · ยอดแยก VAT ยังเห็นครบ", async ({ page }) => {
  test.skip(!REAL_BACKEND, "ต้องมีฐานจริงสำหรับวางใบ HQ");
  test.setTimeout(90_000);   // เปิดหน้าดูใบผ่าน 3 หน้า (รายการ → แผงลีด → ใบ) — ตอนรันชุดยาวเกิน 30 วินาทีได้
  await page.setViewportSize({ width: 390, height: 844 });
  await เปิดหน้าดูใบ(page);
  await expect(page.getByText("รายการสินค้า (BOQ)")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ยอดชำระสุทธิ").first()).toBeVisible();
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `หน้าดูใบบนจอแคบเลื่อนแนวนอน ${overflow}px`).toBeLessThanOrEqual(3);
  // ยอดในกล่องสรุปต้องอยู่ในจอทั้งหมด (ไม่ถูกตัดออกนอกขอบขวา)
  const ขวาสุด = await page.locator("[data-quote-totals]").evaluate(el => el.getBoundingClientRect().right);
  expect(ขวาสุด, "กล่องยอดสรุปต้องอยู่ในจอ").toBeLessThanOrEqual(390);
});

// รายละเอียดลูกค้า = โมดัลกลางจอ 2 แท็บ (ข้อมูลลูกค้า · เพิ่มงานขายใหม่)
// ดีลเลอร์สร้างลูกค้าเองไม่ได้ (ลูกค้าเกิดจากปิดการขาย) → แท็บที่สองคือการเปิดดีลใหม่ให้ลูกค้าเดิม
test("[ui·dealer] โมดัลลูกค้าแบบแท็บ (ข้อมูลลูกค้า/เพิ่มงานขายใหม่) ไม่ล้นแนวนอน", async ({ page }) => {
  await open(page, "dealer", "/customers");
  await assertHealthyPage(page, "ลูกค้า");
  await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  // แท็บ ข้อมูลลูกค้า (default) → โปรไฟล์ลูกค้า + ยอดขายรวม
  // (คำเดียวกันโผล่ในตารางเบื้องหลังด้วย จึงต้อง .first())
  await expect(page.getByText("รหัสลูกค้า").first()).toBeVisible();
  await expect(page.getByText("ยอดขายรวม").first()).toBeVisible();
  // สลับแท็บ เพิ่มงานขายใหม่ (ดีลของลูกค้ารายนี้) แล้วกลับได้
  await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).first().click();
  await expect(page.getByRole("button", { name: "ข้อมูลลูกค้า" }).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "โมดัลลูกค้าไม่ควรมี horizontal scroll").toBeLessThanOrEqual(3);
});

// ยอดเงินตรงกันทั้งระบบ (ก่อน VAT = ยอดที่บันทึก · รวม VAT = เอกสารพิมพ์) กัน VAT หาย/กำกวม
test("[ux·dealer] ฟอร์มใบเสนอราคาแยก 'ก่อน VAT' (ยอดที่บันทึก) กับ 'รวม VAT' ชัดเจน", async ({ page }) => {
  await openLeadQuotationForm(page);
  await expect(page.getByText("มูลค่างาน (ก่อน VAT)")).toBeVisible();
  // ข้อความกำกับใต้ยอด เปลี่ยนคำตอนเพิ่มภาษีหัก ณ ที่จ่าย (28 ส.ค. 69) — ความหมายเดิม
  await expect(page.getByText("= ยอดที่บันทึกเป็นยอดขาย (ภาษีไม่กระทบตัวนี้)")).toBeVisible();
  await expect(page.getByText("ยอดชำระสุทธิ").first()).toBeVisible();
  await expect(page.getByText(/Grand Total/), "เลิกใช้คำกำกวม Grand Total").toHaveCount(0);
});

test("[ux·dealer] หน้าดูใบเสนอราคาแสดง VAT ครบ (ก่อนภาษี + VAT% + ยอดชำระสุทธิ)", async ({ page }) => {
  test.skip(!REAL_BACKEND, "ต้องมีฐานจริงสำหรับวางใบ HQ");
  test.setTimeout(90_000);   // เปิดหน้าดูใบผ่าน 3 หน้า (รายการ → แผงลีด → ใบ) — ตอนรันชุดยาวเกิน 30 วินาทีได้
  await เปิดหน้าดูใบ(page);
  // ลำดับยอดในแผง: ยอดรวมย่อย → ภาษีมูลค่าเพิ่ม X% → รวมเป็นเงิน → (หัก ณ ที่จ่าย) → ยอดชำระสุทธิ
  await expect(page.getByText("ยอดรวมย่อย").first()).toBeVisible();
  await expect(page.getByText(/^ภาษีมูลค่าเพิ่ม \d+(\.\d+)?%$/).first()).toBeVisible();
  await expect(page.getByText("รวมเป็นเงิน").first()).toBeVisible();
  await expect(page.getByText("ยอดชำระสุทธิ").first()).toBeVisible();
});

// ใบเสนอราคาที่สร้างใหม่ต้องเก็บ total เป็นเลขเต็ม (฿5,100,000) เหมือน seed ไม่ย่อ M/K
// (งานขายเก็บลง localStorage → สร้างที่หน้าลูกค้าเป้าหมายแล้วข้ามไปหน้าใบเสนอราคาได้ ข้อมูลไม่หาย)
test("[ux·dealer] ใบเสนอราคาที่สร้างใหม่โชว์ยอดเต็ม ไม่ย่อ M/K", async ({ page }) => {
  await openLeadQuotationForm(page);
  // ฟอร์มมีรายการจากใบ HQ อยู่แล้ว → ยอดถูกคำนวณให้ กดสร้างได้เลย
  // ปุ่มส่งฟอร์ม: โหมดออกใบใหม่เขียน "สร้างใบเสนอราคา" · โหมดเพิ่มรายการในใบเดิมเขียน "บันทึก"
  await page.getByRole("button", { name: /^(สร้างใบเสนอราคา|บันทึก)$/ }).last().click();
  // รอให้ฟอร์มปิดจริง = ระบบรับใบแล้ว — ห้ามรอเป็นเวลาตายตัว (800ms ไม่พอตอนเครื่องรับงานหนัก
  // แล้วเทสต์จะไปต่อทั้งที่ใบยังไม่ถูกสร้าง → หน้า /quotations ว่าง แล้วสรุปผิดว่าระบบแสดงยอดพลาด)
  await expect(page.getByText(/สร้างใบเสนอราคาใหม่|^แก้ไข /)).toHaveCount(0, { timeout: 30_000 });

  // ใบสร้างบนแอปดีลเลอร์ (:3001) → localStorage อยู่ origin นั้น ต้องเปิด /quotations ของ :3001 (ไม่ใช่ baseURL :3002 = HQ)
  await page.goto("http://localhost:3001/quotations", { waitUntil: "domcontentloaded" });
  // รอจนตารางมีใบจริง ไม่ใช่แถว "ไม่พบใบเสนอราคา" (รายการโหลดช้าได้ตอนรันชุดเต็ม)
  await expect(page.locator("tbody tr").filter({ hasText: "฿" }).first(),
    "ต้องมีใบเสนอราคาขึ้นในตาราง").toBeVisible({ timeout: 30_000 });
  // ตรวจ "ทุกแถวในตาราง" ไม่ใช่แถวแรกอย่างเดียว
  //   เดิมสมมติว่าแถวแรก = ใบที่เราเพิ่งสร้าง ซึ่งไม่จริงเมื่อสเปกอื่นออกใบของสาขาเดียวกันพร้อมกัน
  //   (เทสต์รันหลายไฟล์ขนานกันบนสาขา RYG ตัวเดียว) → แถวแรกอาจเป็นใบของสเปกอื่นแล้วตัดสินผิด
  //   สิ่งที่ต้องการวัดจริงคือ "รายการใบเสนอราคาไม่ย่อยอดเป็น M/K" ซึ่งเป็นคุณสมบัติของทั้งตาราง
  const rows = await page.locator("tbody tr").allInnerTexts();
  const joined = rows.join(" | ");
  expect(/฿[\d,]{5,}/.test(joined), `ต้องมียอดเป็นเลขเต็มมี comma — ได้: ${joined.slice(0, 400)}`).toBeTruthy();
  const abbreviated = rows.filter(r => /฿[\d.]+[MK]\b/.test(r));
  expect(abbreviated, `ต้องไม่ย่อ M/K — แถวที่ย่อ: ${JSON.stringify(abbreviated).slice(0, 400)}`).toEqual([]);
});

// ฟอร์มสร้างใบเสนอราคา inline ในหน้า Lead (รีสไตล์ให้เหมือน wizard) — VAT breakdown + section เหมือนกัน
test("[ui·dealer] ฟอร์มใบเสนอราคา inline ในหน้าลูกค้าเป้าหมายรีสไตล์แล้ว (VAT breakdown)", async ({ page }) => {
  // ด่าน 3: ใบใหม่ทำจากใบ HQ — เข้าฟอร์มผ่านตัวช่วยกลาง (เตรียมลูกค้าเป้าหมายที่ได้ใบ HQ แล้วกด "ทำใบเสนอราคาจากใบ HQ")
  await openLeadQuotationForm(page);
  // รายการรวมเป็นก้อนเดียว "รายการใบเสนอราคา" (มาจากใบ HQ · ไม่มีช่องแม่แบบ — เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
  await expect(page.getByText("รายการใบเสนอราคา")).toBeVisible();
  await expect(page.getByText("ชื่อโครงการ / เอกสาร")).toBeVisible();
  await expect(page.getByText("แม่แบบที่เสนอ"), "ช่องแม่แบบซ้ำถูกตัดออกแล้ว").toHaveCount(0);
  await expect(page.getByLabel("แม่แบบ", { exact: true }), "ไม่มีช่องแม่แบบในฟอร์มใบ").toHaveCount(0);
  await expect(page.locator("[data-editor='hq-markup']"), "รายการมาจากใบ HQ (แก้ได้เฉพาะ %)").toBeVisible();
  // ยอดเงินโชว์แบบเดียวกับ wizard: ก่อน VAT (ยอดที่บันทึก) + ยอดชำระสุทธิ
  await expect(page.getByText("มูลค่างาน (ก่อน VAT)")).toBeVisible();
  await expect(page.getByText("ยอดชำระสุทธิ").first()).toBeVisible();
  await expect(page.getByText("ยอดสุทธิ (คำนวณ)"), "ฟิลด์แบบเก่าถูกแทนแล้ว").toHaveCount(0);
});

// ใบที่สร้างใหม่ต้องลงวันที่ = "วันนี้" ของระบบ (APP_NOW) ไม่ใช่วันที่กรอกเอง
// (วันที่ออกไม่ใช่ช่องให้กรอกอีกแล้ว — ระบบประทับให้ตอนบันทึก · ช่องวันที่ในฟอร์ม = วันหมดอายุ)
test("[ux·dealer] ใบเสนอราคาที่สร้างใหม่ลงวันที่วันนี้ของระบบ", async ({ page }) => {
  // ต้องเป็นการ "ออกใบใหม่" จริง ๆ — ถ้าไปแก้ใบเดิม วันที่ออกย่อมเป็นของเดิม (ถูกต้องแล้ว แต่คนละเรื่องที่วัด)
  await openLeadQuotationForm(page, { ใบใหม่เท่านั้น: true });
  // ปุ่มส่งฟอร์ม: โหมดออกใบใหม่เขียน "สร้างใบเสนอราคา" · โหมดเพิ่มรายการในใบเดิมเขียน "บันทึก"
  await page.getByRole("button", { name: /^(สร้างใบเสนอราคา|บันทึก)$/ }).last().click();
  await page.waitForTimeout(800);

  // ใบสร้างบนแอปดีลเลอร์ (:3001) → localStorage อยู่ origin นั้น ต้องเปิด /quotations ของ :3001 (ไม่ใช่ baseURL :3002 = HQ)
  await page.goto("http://localhost:3001/quotations", { waitUntil: "domcontentloaded" });
  // การสร้างใบเป็น async (ขอเลขที่ผ่าน repo + บันทึก) → รอแบบ poll ไม่ใช่ timeout ตายตัว (กันเทสต์วูบ)
  // ตารางเรียงใบใหม่สุดไว้บน → แถวแรกต้องลงวันที่ของ "วันนี้" ระบบ
  const expectedDate = appNowThaiShort();
  await expect.poll(
    async () => (await page.locator("tbody tr").first().locator("td").allInnerTexts()).join(" | "),
    { message: `ใบที่สร้างใหม่ต้องลงวันที่ ${expectedDate} (วันนี้ของระบบ)`, timeout: 10_000 },
  ).toContain(expectedDate);
});

// Smart filter: ลูกค้าเป้าหมายขาดติดต่อ >7/14/30 วัน — จำนวนอยู่บนการ์ด KPI "เกิน 7 วัน" (ไม่ซ้ำ)
// ตัวกรองเกณฑ์วันเป็น dropdown บนแถบเครื่องมือ (เดิมเป็นชิป >7/>14/>30 — เปลี่ยนแล้ว)
test("[ux·dealer] Smart filter ค้างติดต่อ (>7/14/30 วัน) + กรองได้", async ({ page }) => {
  await open(page, "dealer", "/leads");
  await assertHealthyPage(page, "ลูกค้าเป้าหมาย");

  // ต้องรอให้รายการลูกค้าเป้าหมายโหลดเสร็จก่อน แล้วค่อยอ่านตัวเลขบนการ์ด
  // เทสต์นี้เอา "ตัวเลขบนการ์ด" ไปเทียบกับ "จำนวนแถวในตาราง" ซึ่งอ่านคนละจังหวะกัน
  // ถ้าอ่านการ์ดตอนข้อมูลยังมาไม่ถึง จะได้เลขของหน้าว่าง แล้วไปเทียบกับแถวที่โผล่มาทีหลัง = ไม่มีทางตรง
  // (ตกเป็นครั้งคราวเฉพาะตอนรันทั้งชุดพร้อมกัน ซึ่งทุกอย่างช้าลง — ได้ 0 เทียบกับ 3 แถว)
  await page.getByRole("button", { name: "ตาราง" }).click();
  await expect.poll(() => page.locator("tbody tr").count(), { timeout: 20_000 }).toBeGreaterThan(0);

  // การ์ด KPI บอกจำนวนลูกค้าเป้าหมายที่ค้างเกิน 7 วัน
  const kpi = page.getByRole("button", { name: /^เกิน 7 วัน/ });
  await expect(kpi).toBeVisible();
  const overdue = parseInt((await kpi.innerText()).split("\n")[1], 10);

  // ตัวกรองค้างติดต่อ = dropdown เกณฑ์วัน (aria-label มาจาก caption ของ FilterSelect)
  const idle = page.getByLabel("ค้างติดต่อทุกช่วง");
  await expect(idle).toBeVisible();
  for (const d of [7, 14, 30]) {
    await expect(idle.getByRole("option", { name: `ค้างติดต่อ >${d} วัน`, exact: true }), `ต้องมีเกณฑ์ >${d} วัน`).toHaveCount(1);
  }

  const rows = page.locator("tbody tr"); // สลับเป็นตารางไปแล้วข้างบนตอนรอข้อมูลโหลด
  const before = await rows.count();

  // กรอง >7 วัน → จำนวนแถวต้องตรงกับตัวเลขบนการ์ด KPI (เช็คว่าการ์ดกับตัวกรองนับด้วยเกณฑ์เดียวกันจริง)
  // ⚠️ ตารางแบ่งหน้า หน้าละ 10 แถว — ถ้าค้างเกิน 10 ราย หน้าแรกย่อมมีแค่ 10
  //    เดิมบังคับว่า "ต้องไม่เกินหนึ่งหน้า" แล้วตกทันทีที่ข้อมูลตัวอย่างเยอะขึ้น (เจอจริง 21 ส.ค. 69: 12 ราย)
  //    ทั้งที่การ์ดกับตัวกรองยังนับด้วยเกณฑ์เดียวกันถูกต้อง — เทียบกับ "เท่าที่หน้าแรกใส่ได้" แทน
  const PAGE_SIZE = 10;
  await idle.selectOption("7");
  await expect.poll(() => rows.count(), { timeout: 5_000 }).toBe(Math.min(overdue, PAGE_SIZE));
  // เทียบ "แถวที่เห็นจริง" กับ "แถวที่เห็นก่อนกรอง" — ทั้งคู่ถูกจำกัดด้วยขนาดหน้าเท่ากัน จึงเทียบกันได้ตรง ๆ
  expect(Math.min(overdue, PAGE_SIZE), "กรองแล้วต้องเหลือไม่มากกว่าก่อนกรอง").toBeLessThanOrEqual(before);
});

// รายละเอียดลูกค้าเป้าหมาย = แผงกลางจอ 3 แท็บ (รอบ 4 · บอสสั่ง 21 ต.ค. 69 ข้อ 4): ภาพรวม · ใบเสนอราคา · ประวัติ
//   แท็บ "งาน" และ "ไทม์ไลน์" รวมเข้าแท็บประวัติแล้ว (ไทม์ไลน์ + นัดหมาย + ไฟล์ + โน้ต + รายการเตือน)
test("[ui·dealer] แผงลูกค้าเป้าหมายมีครบ 3 แท็บ (ภาพรวม · ใบเสนอราคา · ประวัติ) ไม่ล้นแนวนอน", async ({ page }) => {
  await open(page, "dealer", "/leads");
  await assertHealthyPage(page, "ลูกค้าเป้าหมาย");
  await page.getByRole("button", { name: "ตาราง" }).click(); // ค่าเริ่มต้น=บอร์ด → สลับเป็นตาราง
  await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  for (const tab of ["ภาพรวม", "ใบเสนอราคา", "ประวัติ"]) {
    await expect(page.getByRole("button", { name: tab, exact: true }).first(), `ต้องมีแท็บ "${tab}"`).toBeVisible();
  }
  for (const tab of ["งาน", "ไทม์ไลน์"])
    await expect(page.getByRole("button", { name: tab, exact: true }), `แท็บ "${tab}" รวมเข้าประวัติแล้ว`).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "แผงลูกค้าเป้าหมายไม่ควรมี horizontal scroll").toBeLessThanOrEqual(3);
});

// ป้าย "ขั้นตอน" ในตารางลูกค้าเป้าหมาย — ห้ามล้นออกนอกช่องของตัวเอง (ผู้ใช้แจ้ง 18 ส.ค. 69)
//
// อาการที่เจอ: ชื่อขั้นที่ยาว ("ปิดการขายไม่สำเร็จ" / "รวบรวมความต้องการ") ล้นไปทับช่อง "ความคืบหน้า"
// ช่องที่อยู่ถัดไปถูกวาดทีหลัง จึงมาทับส่วนที่ล้น → คลิกตรงนั้นไม่โดนป้าย = "กดไม่ได้"
// วัดขอบจริงบนหน้าจอ ไม่เชื่อสายตา · พิสูจน์แล้วว่าโค้ดก่อนแก้ ล้น 24px จริง
// รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 2): ป้ายขั้นในตาราง/บอร์ดดูอย่างเดียว — เปลี่ยนขั้นได้ที่กล่องขั้นต่อไปในแผงที่เดียว
//   ป้ายยังต้องอยู่ในช่องของตัวเอง (กติกาเดิมเรื่องล้น) และกดแล้วต้องไม่มีเมนูเลือกขั้นโผล่
test("[ui·dealer] ป้ายขั้นตอนต้องอยู่ในช่องของตัวเอง และกดแล้วไม่มีเมนูเลือกขั้น (ดูอย่างเดียว)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "dealer", "/leads");
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await expect(page.locator("tbody tr").first().locator("button.badge"), "ป้ายขั้นไม่ใช่ปุ่มแล้ว").toHaveCount(0);
  const chip = page.locator("tbody tr").first().locator("span.badge").first();
  await expect(chip).toBeVisible({ timeout: 15_000 });

  const m = await chip.evaluate(el => {
    const td = el.closest("td")!;
    return { chip: Math.round(el.getBoundingClientRect().right), cell: Math.round(td.getBoundingClientRect().right) };
  });
  expect(m.chip, `ป้ายล้นออกนอกช่อง ${m.chip - m.cell}px — จะไปทับช่องข้างๆ แล้วกดไม่โดน`).toBeLessThanOrEqual(m.cell);

  // กดที่ป้าย (ปลายขวาสุด = จุดที่เคยกดไม่โดน) → ต้องไม่มีเมนูเลือกขั้นโผล่ (เปลี่ยนขั้นเองจากตารางไม่ได้แล้ว)
  const box = (await chip.boundingBox())!;
  await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await expect(page.locator('[data-menu="stage"]'), "ไม่มีเมนูเลือกขั้นในตารางแล้ว").toHaveCount(0);
});

test("[ui·dealer] ตารางเหลือไม่กี่แถว — ไม่มีเมนูเปลี่ยนขั้นในตาราง · ปุ่มในกล่องขั้นต่อไปเห็นครบและกดโดน", async ({ page }) => {
  // เคสจริงของผู้ใช้: กรองจนเหลือแถวเดียว → กล่องตารางเตี้ยมาก
  //   เมนูเคยถูก .table-wrap { overflow-x: auto } ตัดจนเหลือแถบเดียว → เลือกขั้นไม่ได้
  //   → เมนูจึงต้องเป็น position: fixed และพลิกขึ้นด้านบนเองเมื่อที่ด้านล่างไม่พอ
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "dealer", "/leads");
  await page.waitForTimeout(2000);
  const rows = page.locator("tbody tr");
  const first = (await rows.first().locator("td").first().innerText()).split(String.fromCharCode(10))[0].trim();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(first);
  await page.waitForTimeout(1200);
  // ⚠️ ห้ามยืนยันว่า "เหลือแถวเดียวเป๊ะ" — ชื่อบริษัทในข้อมูลทดสอบซ้ำกันได้
  //   (ชุดข้อมูลตั้งต้นใช้คำนำหน้าเดียวกันทุกราย ค้นแล้วติดมาหลายแถวเป็นปกติ)
  //   สิ่งที่เทสต์นี้ตรวจจริงคือ "ตารางสั้น ๆ แล้วเมนูเปลี่ยนขั้นต้องยังอยู่ในจอ"
  //   ตารางเหลือไม่กี่แถวก็สร้างเงื่อนไขนั้นได้เหมือนกัน
  const เหลือ = await rows.count();
  expect(เหลือ, "ต้องกรองให้ตารางสั้นลงจริง").toBeGreaterThan(0);
  expect(เหลือ, "ต้องกรองให้เหลือไม่กี่แถว").toBeLessThanOrEqual(5);

  // รอบ 4: เมนูเปลี่ยนขั้นในตารางเอาออกแล้ว (ป้ายเป็นข้อความ) — เปลี่ยนขั้นที่กล่องขั้นต่อไปในแผงลีดที่เดียว
  //   ตารางสั้นแล้วทางเปลี่ยนขั้นต้องยังกดโดนครบ: เปิดแผงจากแถว แล้วทุกปุ่มในกล่องขั้นต่อไปต้องอยู่ในจอและไม่ถูกบัง
  await expect(rows.first().locator("button.badge"), "ป้ายขั้นในตารางไม่ใช่ปุ่ม").toHaveCount(0);
  await expect(page.locator('[data-menu="stage"]'), "ไม่มีเมนูเลือกขั้นในตาราง").toHaveCount(0);
  await rows.first().getByTitle("ดูรายละเอียด").click();
  const menu = page.getByRole("status", { name: "ขั้นต่อไป" });
  await expect(menu).toBeVisible({ timeout: 10_000 });

  // วัดของจริง: ทุกปุ่มในกล่องต้องอยู่ในจอ และจิ้มกลางตัวมันต้องโดนตัวมันเอง (ไม่ถูกบัง)
  const bad = await menu.evaluate(el => {
    const out: string[] = [];
    for (const it of Array.from(el.querySelectorAll("button"))) {
      const b = it.getBoundingClientRect();
      if (b.bottom > window.innerHeight || b.top < 0) { out.push(`"${it.textContent}" หลุดจอ`); continue; }
      const hitEl = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!hitEl || !(hitEl === it || it.contains(hitEl))) out.push(`"${it.textContent}" ถูกบัง`);
    }
    return out;
  });
  expect(bad, "ปุ่มในกล่องขั้นต่อไปที่กดไม่ได้").toEqual([]);
});
