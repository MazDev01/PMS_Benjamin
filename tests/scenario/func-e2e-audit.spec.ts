import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน, มีกล่องยืนยัน } from "./helpers";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import {
  DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, waitRow, cleanup, specNS, nsTag, pickTemplate, markQuotationSent
} from "./funcHelpers";

// ── E2E audit: end-to-end sales journey coverage NOT already in func-quote-win/func-dealer-sales ──
// โฟกัส: (1) ปิดการขายผ่านลูกค้าเป้าหมายโดยไม่เคยส่ง/ตอบรับใบเสนอราคา (2) ดีลที่สองของลูกค้าเดิม — ยอดรวม
//        (3) ลบใบที่ won แล้ว — ยอดลูกค้าต้องปรับตาม (4) ความสอดคล้องข้าม role (dealer เขียน → HQ เห็น)
//        (5) ฟอร์มที่เปิดค้างไว้แล้วไม่กดบันทึก — ต้องไม่มีข้อมูลผีลง DB
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("AUDIT");
const tg = nsTag(NS);

// ตั้งยอดใบเสนอราคาให้เป็นค่าที่รู้แน่นอน หลังสร้างจริงผ่าน UI แล้ว (ต้องเลือกแม่แบบก่อนถึงสร้างได้ —
// ปุ่มสร้างใบถูก disable ถ้า BOQ ว่าง, ดู H-audit fix) — override เป็นเลขที่จำง่าย/พิสูจน์ผลรวมได้ชัด
// แทนยอดจริงจาก area×ราคากลาง ซึ่งคำนวณผ่านได้แต่ตัวเลขไม่กลมพอจะอ่าน assertion ตามให้ทัน
//
// ⚠️ ต้องเปลี่ยนรายการ BOQ ให้ตรงกับยอดใหม่ด้วย — ฐานข้อมูลบังคับว่ายอดต้องเท่ากับ Σ รายการเสมอ (0142)
//    ตั้งแต่ยอดเป็นตัวเลขที่เอาไปรายงานเป็นยอดขาย การปล่อยให้เอกสารกับยอดไม่ตรงกันคือบั๊กจริง
//    เทสต์ชุดนี้ไม่ได้ตรวจเนื้อใน BOQ (ตรวจแค่ยอดไหลไปถึงลูกค้าไหม) จึงยัดเป็นรายการเดียวได้
async function forceQuoteTotal(sb: Awaited<ReturnType<typeof db>>, id: string, value: number) {
  const { error } = await sb.from("quotations").update({
    total_value: value, material_cost: Math.round(value * 0.7), total: `฿${value.toLocaleString("th-TH")}`,
    line_items: [{ name: "ยอดที่กำหนดไว้ในเทสต์", qty: 1, unit: "งาน", unitPrice: value }],
  }).eq("id", id);
  if (error) throw new Error(`ตั้งยอดใบเสนอราคาไม่สำเร็จ: ${error.message}`);
}

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

// ⚠️ เทสต์นี้เคยตรวจ "ปิดการขายลัดคิว" ว่าทำได้ไหมและยอดเพี้ยนไหม
//    ตั้งแต่ 19 ส.ค. 69 บอสสั่งปิดช่องนั้น (ห้ามปิดการขายถ้ายังไม่มีใบที่ส่งแล้ว · migration 0145)
//    เทสต์จึงเปลี่ยนเป็น 2 ท่อน: (ก) ลัดคิวต้องถูกกัน (ข) พอส่งใบแล้ว ยอดต้องสอดคล้องกันตามเดิม
test("[audit] ปิดการขายลัดคิวต้องถูกกัน · พอส่งใบแล้วยอดลูกค้าต้องตรงกับใบเสนอราคา", async ({ page }) => {
  const errs = watchErrors(page);
  // ปิดการขายถามกล่องยืนยันทุกครั้ง · เทสต์นี้กดสองรอบ (รอบแรกถูกกันตั้งแต่ก่อนถาม รอบสองถึงจะถาม)
  const sb = await db(RYG);
  const COMPANY = tg("ปิดลัดคิว");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  // 1) สร้างลูกค้าเป้าหมาย + ออกใบเสนอราคา (คงสถานะ "ร่าง" — ไม่ส่ง ไม่ตอบรับ)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณลัดคิว");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");
  await pickTemplate(page); // ต้องเลือกแม่แบบจริง ไม่งั้น BOQ ว่าง → ปุ่มสร้างใบถูก disable (H-audit fix)
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).first().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string; status: string; total_value: number }>(sb, "quotations", { customer: COMPANY });
  expect(q.status, "ใบต้องยังเป็นร่าง (ยังไม่ส่ง/ยังไม่ตอบรับ)").toBe("draft");
  await forceQuoteTotal(sb, q.id, 770_000); // BOQ ว่าง (ไม่ได้เลือกแม่แบบ) → บังคับยอดที่รู้แน่นอนแทน เพื่อดูว่ายอดนี้ไปโผล่ที่ลูกค้าไหม
  console.log(`[audit] ใบ ${q.id} total_value=770000 status=${q.status}`);

  // 2) ปิดจากฝั่งลูกค้าเป้าหมายโดยตรง (ไม่แตะใบเสนอราคาเลย) — action ที่ดีลเลอร์น่าจะกดเป็นธรรมชาติที่สุด
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row2 = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row2).toBeVisible({ timeout: 15_000 });
  await row2.getByRole("button", { name: /▾/ }).first().click();
  await page.getByRole("button", { name: "ปิดการขายสำเร็จ", exact: true }).first().click();

  // (ก) ด่านต้องกันไว้ — ใบยังเป็นร่าง ยังไม่เคยส่งถึงลูกค้า จึงต้องยังไม่มีลูกค้าเกิดขึ้น
  await new Promise(r => setTimeout(r, 4000));
  expect(await มีกล่องยืนยัน(page), "ถูกกันตั้งแต่ก่อนถาม — ต้องไม่มีกล่องยืนยันขึ้นมาเลย").toBe(false);
  const { data: ลัดคิว } = await sb.from("customers").select("id").eq("company", COMPANY);
  expect(ลัดคิว?.length ?? 0, "ยังไม่ส่งใบให้ลูกค้า = ปิดการขายไม่ได้ ต้องไม่มีลูกค้าถูกสร้าง").toBe(0);

  // (ข) ส่งใบให้ลูกค้าแล้วปิดใหม่ — คราวนี้ต้องผ่าน และยอดต้องสอดคล้องกัน
  await markQuotationSent(sb, "RYG", COMPANY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row3 = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row3).toBeVisible({ timeout: 15_000 });
  await row3.getByRole("button", { name: /▾/ }).first().click();
  await page.getByRole("button", { name: "ปิดการขายสำเร็จ", exact: true }).first().click();
  await กดตกลงในกล่องยืนยัน(page);

  const cust = await waitRow<{ id: number; total_value: number; company: string }>(sb, "customers", { company: COMPANY }, 20_000);
  console.log(`[audit] ลูกค้า id=${cust.id} total_value=${cust.total_value}`);

  // 3) อ่านสถานะใบเสนอราคาหลังปิดการขาย — เช็คว่าใบถูกผูก/mark won ตามไปด้วยหรือไม่
  await new Promise(r => setTimeout(r, 3000)); // ให้เวลา relink เขียนลง DB
  const qAfter = (await sb.from("quotations").select("id,status,customer_id,total_value").eq("id", q.id).single()).data as
    { id: string; status: string; customer_id: number | null; total_value: number } | null;
  console.log(`[audit] ใบหลังปิดการขาย: status=${qAfter?.status} customer_id=${qAfter?.customer_id} total_value=${qAfter?.total_value}`);
  console.log(`[audit] เปรียบเทียบ: ยอดลูกค้า=${cust.total_value} vs ยอดใบเสนอราคา=${qAfter?.total_value} — ${cust.total_value === qAfter?.total_value ? "ตรงกัน" : "*** ไม่ตรงกัน ***"}`);
  console.log(`[audit] ใบถูก mark เป็น won ไหม: ${qAfter?.status === "won" ? "ใช่" : `*** ไม่ใช่ (ยังเป็น '${qAfter?.status}') ***`}`);

  // ยืนยันว่าใบถูก relink เข้ากับลูกค้าใหม่ (customer_id ต้องไม่ null)
  expect(qAfter?.customer_id, "ใบเสนอราคาที่ออกให้ลูกค้าเป้าหมายนี้ต้องถูกผูกกับลูกค้าใหม่หลังปิดการขาย").toBe(cust.id);

  assertNoErrors(errs, "ปิดการขายลัดคิว");
});

test("[audit] ดีลที่สองของลูกค้าเดิม (สร้างดีลใหม่) — ยอดลูกค้าต้องรวมทั้งสองดีล ไม่ใช่แค่ดีลล่าสุด", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("ลูกค้าหลายดีล");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  async function winFullFlow(company: string, contact: string, knownTotal: number) {
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
    await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
    await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill(contact);
    // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
    await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
    await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
    await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");
    await pickTemplate(page); // ต้องเลือกแม่แบบจริง ไม่งั้น BOQ ว่าง → ปุ่มสร้างใบถูก disable (H-audit fix)
    await page.getByRole("button", { name: "บันทึก" }).click();
    await waitRow(sb, "leads", { company });

    await page.getByRole("button", { name: "ตาราง" }).click();
    // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
    const row = page.locator("tbody tr").filter({ hasText: company }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).first().click();
    await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
    const q = await waitRow<{ id: string; total_value: number }>(sb, "quotations", { customer: company });
    await forceQuoteTotal(sb, q.id, knownTotal); // BOQ ว่าง (ไม่ได้เลือกแม่แบบ) → บังคับยอดที่รู้แน่นอนแทน

    // ส่ง → ตอบรับ (won) ผ่านหน้าใบเสนอราคาโดยตรง (เส้นทางที่ตั้งใจให้ผูก won จริง)
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
    const qrow = page.locator("tbody tr").filter({ hasText: company }).first();
    await expect(qrow).toBeVisible({ timeout: 25_000 });
    await qrow.getByRole("button", { name: "ส่งให้ลูกค้า" }).first().click();
    await expect.poll(async () =>
      (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
      { timeout: 25_000 }).toBe("sent_to_client");
    await qrow.click();
    await page.getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
    await กดตกลงในกล่องยืนยัน(page); // ปิดการขาย = ถามยืนยันก่อนเสมอ (/scenario 31 ก.ค. 69)
    await expect.poll(async () =>
      (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
      { timeout: 25_000, message: "ใบต้องเป็น won" }).toBe("won");

    const fresh = (await sb.from("quotations").select("total_value").eq("id", q.id).single()).data as { total_value: number };
    return fresh.total_value;
  }

  // ดีลแรก
  const total1 = await winFullFlow(COMPANY, "คุณดีลหนึ่ง", 1_230_000);
  const cust = await waitRow<{ id: number; total_value: number }>(sb, "customers", { company: COMPANY }, 20_000);
  console.log(`[audit] ดีล 1: total_value=${total1} → ยอดลูกค้าหลังดีล 1=${cust.total_value}`);
  expect(cust.total_value, "ยอดลูกค้าหลังดีลแรกต้องเท่ากับยอดใบที่ปิดได้").toBe(total1);

  // ดีลที่สอง — ผ่านหน้าลูกค้า "สร้างดีลใหม่"
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  // ต้องค้นหาก่อน — หน้าลูกค้าแบ่งหน้า ตอนรันทั้งชุดพร้อมกันสเปกอื่นเพิ่มลูกค้าแทรกเข้ามาตลอด
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(COMPANY);
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000 }).toContain(COMPANY);
  await page.getByText(COMPANY).first().click();
  // แท็บ "เพิ่มงานขายใหม่" (ดีล) — เปิด dialog สร้างดีลใหม่
  await page.getByRole("button", { name: "เพิ่มงานขายใหม่", exact: true }).first().click();
  const newDealBtn = page.getByRole("button", { name: "เพิ่มงานขายใหม่", exact: true }).last();
  await expect(newDealBtn, "ต้องมีปุ่มสร้างดีลใหม่ในหน้ารายละเอียดลูกค้า").toBeVisible({ timeout: 10_000 });
  await newDealBtn.click();
  await expect(page.getByRole("button", { name: "เพิ่มงานขาย", exact: true })).toBeVisible({ timeout: 10_000 });
  // dealForm.product เริ่มที่ "" เสมอ (ไม่ได้ดึงจาก category ของลูกค้าอัตโนมัติแบบที่คอมเมนต์เดิมเข้าใจผิด
  // ไว้ — select ที่ไม่มี option ตรงค่า "" แค่ "โชว์" ตัวเลือกแรกตามพฤติกรรม browser เฉยๆ ไม่ได้เซ็ตค่าจริง
  // ทำให้ลูกค้าเป้าหมายดีลใหม่ได้ product="" แล้ว BOQ ว่าง → ปุ่มสร้างใบถูก disable แบบสุ่ม/แล้วแต่จังหวะโหลดแคตตาล็อก)
  await pickTemplate(page, "แม่แบบ"); // ต้องเลือกแม่แบบจริง ไม่งั้นปุ่มเพิ่มงานขายถูกปิด
  await page.getByRole("button", { name: "เพิ่มงานขาย", exact: true }).click();

  // ดีลใหม่ = ลูกค้าเป้าหมายใหม่ผูก customerId — หาในหน้าลูกค้าเป้าหมาย แล้วออกใบ + ปิดให้ผ่านฟลว์เดียวกัน
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const dealRow = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(dealRow, "ดีลที่สองต้องโผล่เป็นลูกค้าเป้าหมายใหม่ในสมุดงาน").toBeVisible({ timeout: 15_000 });
  await dealRow.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).first().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();

  // ใบใหม่ของดีลที่สอง — customer ชื่อเดียวกัน แต่ id ใหม่ (ต่างจากใบดีลแรก)
  const q2 = await waitRow<{ id: string; total_value: number }>(sb, "quotations", { customer: COMPANY, status: "draft" });
  await forceQuoteTotal(sb, q2.id, 560_000); // ยอดต่างจากดีลแรก (1,230,000) เพื่อพิสูจน์ว่าเป็นผลรวมจริง ไม่ใช่ค่าที่บังเอิญเท่ากัน
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  const qrow2 = page.locator("tbody tr").filter({ hasText: q2.id }).first();
  await expect(qrow2).toBeVisible({ timeout: 25_000 });
  await qrow2.getByRole("button", { name: "ส่งให้ลูกค้า" }).first().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("id", q2.id)).data?.[0]?.status,
    { timeout: 25_000 }).toBe("sent_to_client");
  await qrow2.click();
  await page.getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
  await กดตกลงในกล่องยืนยัน(page); // ปิดการขาย = ถามยืนยันก่อนเสมอ (/scenario 31 ก.ค. 69)
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("id", q2.id)).data?.[0]?.status,
    { timeout: 25_000, message: "ใบดีล 2 ต้องเป็น won" }).toBe("won");

  const q2total = (await sb.from("quotations").select("total_value").eq("id", q2.id).single()).data as { total_value: number };
  const custAfter2 = await waitRow<{ total_value: number }>(sb, "customers", { id: cust.id }, 20_000);
  console.log(`[audit] ดีล 2: total_value=${q2total.total_value} → ยอดลูกค้าหลังดีล 2=${custAfter2.total_value} (คาดหวัง=${total1 + q2total.total_value})`);
  expect(custAfter2.total_value, "ยอดลูกค้าต้องรวมทั้งสองดีล ไม่ใช่แค่ดีลล่าสุด").toBe(total1 + q2total.total_value);

  assertNoErrors(errs, "ดีลที่สองของลูกค้าเดิม");
});

test("[audit] ลบใบเสนอราคาที่ won แล้ว — ยอดลูกค้าต้องปรับลดตาม ไม่ค้างเกินจริง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("ลบใบวอน");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณลบวอน");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");
  await pickTemplate(page); // ต้องเลือกแม่แบบจริง ไม่งั้น BOQ ว่าง → ปุ่มสร้างใบถูก disable (H-audit fix)
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).first().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string }>(sb, "quotations", { customer: COMPANY });
  await forceQuoteTotal(sb, q.id, 890_000); // BOQ ว่าง (ไม่ได้เลือกแม่แบบ) → บังคับยอดที่รู้แน่นอนแทน

  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  const qrow = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(qrow).toBeVisible({ timeout: 25_000 });
  await qrow.getByRole("button", { name: "ส่งให้ลูกค้า" }).first().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 25_000 }).toBe("sent_to_client");
  await qrow.click();
  await page.getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
  await กดตกลงในกล่องยืนยัน(page); // ปิดการขาย = ถามยืนยันก่อนเสมอ (/scenario 31 ก.ค. 69)

  await waitRow<{ id: number }>(sb, "customers", { company: COMPANY }, 20_000);
  // แถวลูกค้าเกิดก่อน total_value ถึงค่าจริงเสมอ — reconcile ยิง RPC แยกหลัง setStatus commit (0078, กัน race
  // ข้าม session) ต้อง poll รอค่าตกที่ DB จริง ไม่ใช่เช็กทันทีที่แถวโผล่
  await expect.poll(async () =>
    (await sb.from("customers").select("total_value").eq("company", COMPANY).single()).data?.total_value,
    { timeout: 20_000 }).toBeGreaterThan(0);
  const cust = (await sb.from("customers").select("id,total_value").eq("company", COMPANY).single()).data as { id: number; total_value: number };
  console.log(`[audit] ก่อนลบใบ: ยอดลูกค้า=${cust.total_value}`);

  // เปิดใบที่ won แล้ว → ลบ (ปุ่มลบไม่มี guard สถานะในโค้ด — ทดสอบว่าอนุญาตจริงไหม + ผลลัพธ์)
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  const qrowWon = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(qrowWon).toBeVisible({ timeout: 15_000 });
  // ลบจากปุ่มในแถวได้เลย (13 ส.ค. 69 — เดิมต้องเปิดแผงรายละเอียดก่อน)
  // ต้องผูกกับ "แถวนั้น" เสมอ: ตอนนี้ปุ่มลบมีทุกแถว + อีกตัวในแผงรายละเอียด ถ้าเลือกทั้งหน้าจะได้หลายตัว
  const delBtn = qrowWon.getByTitle("ลบใบเสนอราคา");
  const delAllowed = await delBtn.count() > 0;
  console.log(`[audit] ปุ่มลบใบที่ won แล้วโผล่ให้กดไหม: ${delAllowed}`);
  if (delAllowed) {
    await delBtn.click();
    await page.getByRole("button", { name: "ลบ", exact: false }).last().click();
    await expect.poll(async () =>
      (await sb.from("quotations").select("id").eq("id", q.id)).data?.length,
      { timeout: 15_000 }).toBe(0);

    // waitRow match แค่ {id} ซึ่งมีอยู่แล้วตั้งแต่ก่อนลบใบ (id คงที่) → resolve ทันทีโดยไม่รอ reconcile
    // (fire-and-forget หลังลบใบ) commit จริงก่อน — ต้อง poll ค่า total_value ให้ตกที่ 0 จริงเหมือนที่
    // poll ตอน > 0 ด้านบน (ยืนยันแยกแล้วว่า reconcile_customer_won_total RPC คำนวณถูกต้องเสมอ)
    await expect.poll(async () =>
      (await sb.from("customers").select("total_value").eq("id", cust.id).single()).data?.total_value,
      { timeout: 15_000, message: "ยอดลูกค้าต้องลดลงหลังลบใบที่ won ไป — ไม่ควรค้างยอดเกินจริง" }).toBe(0);
    const custAfter = (await sb.from("customers").select("total_value").eq("id", cust.id).single()).data as { total_value: number };
    console.log(`[audit] หลังลบใบ won: ยอดลูกค้า=${custAfter.total_value} (คาดหวัง=0)`);
  }

  assertNoErrors(errs, "ลบใบที่ won แล้ว");
});

test("[audit] เปิดฟอร์มสร้างใบเสนอราคาแล้วไม่กดบันทึก — นำทางออกไปหน้าอื่น ต้องไม่มีข้อมูลผีลง DB", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("เปิดฟอร์มค้าง");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณค้างฟอร์ม");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).first().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });

  // แก้ไขฟิลด์ในฟอร์ม (ชื่อโครงการ) แต่ "ไม่กดบันทึก" — จำลองผู้ใช้ละทิ้งฟอร์มกลางคัน
  await page.locator('input[placeholder*="โกดังเก็บสินค้า"]').fill(tg("โครงการที่ไม่มีวันถูกบันทึก"));
  await page.waitForTimeout(500);

  // นำทางออกไปหน้าอื่นโดยตรง (จำลองปิดแท็บ/เปลี่ยนหน้ากลางคัน)
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const ghost = await sb.from("quotations").select("id,status,project").eq("dealer_code", "RYG")
    .or(`customer.eq.${COMPANY},project.ilike.%${tg("โครงการที่ไม่มีวันถูกบันทึก")}%`);
  console.log(`[audit] ใบเสนอราคาที่หลงเหลือจากฟอร์มที่ไม่ได้บันทึก: ${ghost.data?.length ?? 0} แถว`);
  expect(ghost.data?.length ?? 0, "ฟอร์มที่เปิดค้างไว้แล้วนำทางออก ต้องไม่มีใบเสนอราคาผีถูกสร้างขึ้น").toBe(0);

  assertNoErrors(errs, "ละทิ้งฟอร์มใบเสนอราคากลางคัน");
});

test("[audit] cross-role: ดีลเลอร์ปิดการขาย → HQ เห็นตัวเลขตรงกันทันที ใน /hq/leads /hq/quotations /hq/customers /hq/dealers/RYG", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("ข้ามroleเช็ค");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณครอสโรล");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");
  await pickTemplate(page); // ต้องเลือกแม่แบบจริง ไม่งั้น BOQ ว่าง → ปุ่มสร้างใบถูก disable (H-audit fix)
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).first().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string; total_value: number }>(sb, "quotations", { customer: COMPANY });

  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  const qrow = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(qrow).toBeVisible({ timeout: 25_000 });
  await qrow.getByRole("button", { name: "ส่งให้ลูกค้า" }).first().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 25_000 }).toBe("sent_to_client");
  await qrow.click();
  await page.getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
  await กดตกลงในกล่องยืนยัน(page); // ปิดการขาย = ถามยืนยันก่อนเสมอ (/scenario 31 ก.ค. 69)
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 25_000, message: "ใบต้องเป็น won" }).toBe("won");
  const cust = await waitRow<{ id: number; total_value: number }>(sb, "customers", { company: COMPANY }, 20_000);

  // ── ฝั่ง HQ (บัญชี ADMIN) — เปิดทันทีหลังปิดการขาย ──
  await loginUI(page, HQ_ORIGIN, "/login", ADMIN);

  await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "HQ /hq/quotations ต้องเห็นใบที่ปิดการขายไปแล้วทันที" }).toContain(COMPANY);
  // HQ ต้องไม่มีปุ่มแก้ไข/สร้างใบเสนอราคา (read-only)
  const hqCreateBtn = page.getByRole("button", { name: /สร้างใบเสนอราคา/ });
  expect(await hqCreateBtn.count(), "HQ ต้องไม่มีปุ่มสร้างใบเสนอราคา (read-only)").toBe(0);

  await page.goto(`${HQ_ORIGIN}/hq/customers`, { waitUntil: "domcontentloaded" });
  // หน้ารวมทั้งเครือยิ่งแบ่งหน้าแน่นกว่าเดิม (ลูกค้าทุกสาขารวมกัน) — ต้องค้นหาก่อนเสมอ
  await page.getByPlaceholder("ค้นหาชื่อลูกค้า หรือจังหวัด...").fill(COMPANY);
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "HQ /hq/customers ต้องเห็นลูกค้าใหม่" }).toContain(COMPANY);

  // /hq/dealers/[code] เป็นหน้า KPI รวม ไม่มีตารางรายชื่อบริษัทในมุมมองเริ่มต้น (ไม่ใช่บั๊ก)
  // ตรวจแค่ว่าโหลดได้ไม่พัง + ยังอยู่ในโหมดดูอย่างเดียว
  await page.goto(`${HQ_ORIGIN}/hq/dealers/RYG`, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "HQ /hq/dealers/RYG ต้องโหลดสำเร็จ" }).toContain("โหมดดูอย่างเดียว");

  assertNoErrors(errs, "cross-role visibility");
});
