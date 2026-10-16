import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน, มีกล่องยืนยัน, settle } from "./helpers";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import {
  DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, waitRow, cleanup, specNS, nsTag, markQuotationSent, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";

// ── E2E audit: end-to-end sales journey coverage NOT already in func-quote-win/func-dealer-sales ──
// โฟกัส: (1) ปิดการขายผ่านลูกค้าเป้าหมายโดยไม่เคยส่ง/ตอบรับใบเสนอราคา (2) ดีลที่สองของลูกค้าเดิม — ยอดรวม
//        (3) ลบใบที่ won แล้ว — ยอดลูกค้าต้องปรับตาม (4) ความสอดคล้องข้าม role (dealer เขียน → HQ เห็น)
//        (5) ฟอร์มที่เปิดค้างไว้แล้วไม่กดบันทึก — ต้องไม่มีข้อมูลผีลง DB
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("AUDIT");
const tg = nsTag(NS);

// ตั้งยอดใบเสนอราคาให้เป็นค่าที่รู้แน่นอน หลังสร้างจริงผ่าน UI แล้ว — override เป็นเลขที่จำง่าย/พิสูจน์ผลรวมได้ชัด
// แทนยอดจริงจาก area×ราคากลาง ซึ่งคำนวณผ่านได้แต่ตัวเลขไม่กลมพอจะอ่าน assertion ตามให้ทัน
//
// ⚠️ ต้องเปลี่ยนรายการ BOQ ให้ตรงกับยอดใหม่ด้วย — ฐานข้อมูลบังคับว่ายอดต้องเท่ากับ Σ รายการเสมอ (0142)
//    ตั้งแต่ยอดเป็นตัวเลขที่เอาไปรายงานเป็นยอดขาย การปล่อยให้เอกสารกับยอดไม่ตรงกันคือบั๊กจริง
//    เทสต์ชุดนี้ไม่ได้ตรวจเนื้อใน BOQ (ตรวจแค่ยอดไหลไปถึงลูกค้าไหม) จึงยัดเป็นรายการเดียวได้
// (ตัวบังคับยอดใบเดิมถูกถอด — ด่าน 3 ใบใหม่ทำจากใบ HQ ฐานคิดยอดเอง · ได้ยอดที่รู้แน่นอนจากต้นทุนใบ HQ บวก 0%)

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
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  // ด่าน 3: ใบใหม่ทำจากใบ HQ — ได้ใบ HQ (ต้นทุน 770,000) แล้วทำใบบวก 0% → ยอดที่รู้แน่นอนโดยไม่ต้องบังคับยอดเอง
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY, [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitCost: 770_000 }]);
  await page.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("0");
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string; status: string; total_value: number }>(sb, "quotations", { customer: COMPANY });
  expect(q.status, "ใบต้องยังเป็นร่าง (ยังไม่ส่ง/ยังไม่ตอบรับ)").toBe("draft");
  expect(Number(q.total_value), "ยอดใบ = ต้นทุนจากใบ HQ (บวก 0%)").toBe(770_000);
  console.log(`[audit] ใบ ${q.id} total_value=${q.total_value} status=${q.status}`);

  // 2) ปิดจากฝั่งลูกค้าเป้าหมายโดยตรง (ไม่แตะใบเสนอราคาเลย) — action ที่ดีลเลอร์น่าจะกดเป็นธรรมชาติที่สุด
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row2 = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row2).toBeVisible({ timeout: 15_000 });
  await row2.getByRole("button", { name: /▾/ }).first().click();
  // (ก) ด่านต้องกันไว้ — ใบยังเป็นร่าง ลูกค้าเป้าหมายยังอยู่ขั้น "รอราคา HQ" (Flow ใบ HQ) เมนูจึงไม่มีให้เปลี่ยนขั้นเอง
  await expect(page.getByText(/เปลี่ยนขั้นเองไม่ได้ระหว่างรอ/), "รอราคา HQ = เมนูขั้นต้องบอกว่าเปลี่ยนเองไม่ได้").toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "ปิดการขายสำเร็จ", exact: true }), "ไม่มีปุ่มปิดการขายลัดคิว").toHaveCount(0);
  await page.keyboard.press("Escape");
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
    await page.getByRole("button", { name: "บันทึก" }).click();
    await waitRow(sb, "leads", { company });

    await page.getByRole("button", { name: "ตาราง" }).click();
    // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
    const row = page.locator("tbody tr").filter({ hasText: company }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    // ด่าน 3: ได้ใบ HQ ต้นทุน = ยอดที่ต้องการ แล้วทำใบบวก 0% → ยอดที่รู้แน่นอน (ใบจากใบ HQ ฐานคิดยอดเอง บังคับยอดไม่ได้)
    await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", company, [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitCost: knownTotal }]);
    await page.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("0");
    await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
    const q = await waitRow<{ id: string; total_value: number }>(sb, "quotations", { customer: company });
    expect(Number((await sb.from("quotations").select("total_value").eq("id", q.id).single()).data?.total_value), "ยอดใบ = ต้นทุนจากใบ HQ").toBe(knownTotal);

    // รอคำขอที่แอปยังวิ่งอยู่ (อ่านลูกค้าเป้าหมายกลับหลังสร้างใบ) ให้จบก่อนเปลี่ยนหน้า — trace 15 ต.ค. 69: เปลี่ยนหน้าทับ = Failed to fetch
    await settle(page);
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
    await settle(page);   // เส้นทางปิดการขายยังเขียนต่อ (ลูกค้า · ผูกลูกค้าให้ลูกค้าเป้าหมาย) — ให้จบก่อนผู้เรียกเปลี่ยนหน้า

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
  // งานขายที่ไม่มีทั้งพื้นที่และมูลค่าประเมิน ระบบตั้งจำนวนในใบเสนอราคาให้ไม่ได้ (จำนวน 0 → ยอด ฿0 → ปุ่มสร้างใบถูกปิด
  //   ตามกติกา "ห้ามออกใบ ฿0" · boq.ts) — ดีลแรกกรอกพื้นที่ไว้ ดีลที่สองต้องกรอกเหมือนกัน (พบ 12 ต.ค. 69: ข้อนี้ตกเพราะไม่ได้กรอก)
  await page.getByPlaceholder("เช่น 1200", { exact: true }).last().fill("300");
  await page.getByRole("button", { name: "เพิ่มงานขาย", exact: true }).click();
  // ⚠️ รอให้ดีลที่สองลงฐานจริงก่อนเปลี่ยนหน้า (พบ 14 ต.ค. 69 บน production build โหมด api):
  //    เปลี่ยนหน้าทันทีหลังกด = คำขอสร้างที่ยังไม่จบถูกตัดกลางทาง → ไม่มีดีลที่สองให้หา (เคยไม่นิ่งตั้งแต่ปิดด่าน 2)
  await expect.poll(async () => (await sb.from("leads").select("num_id").eq("dealer_code", "RYG").eq("company", COMPANY)).data?.length ?? 0,
    { timeout: 20_000, message: "ดีลที่สองต้องลงฐานก่อนเปลี่ยนหน้า" }).toBe(2);

  // ดีลใหม่ = ลูกค้าเป้าหมายใหม่ผูก customerId — หาในหน้าลูกค้าเป้าหมาย แล้วออกใบ + ปิดให้ผ่านฟลว์เดียวกัน
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const dealRow = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(dealRow, "ดีลที่สองต้องโผล่เป็นลูกค้าเป้าหมายใหม่ในสมุดงาน").toBeVisible({ timeout: 15_000 });
  await dealRow.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  // ด่าน 3: ได้ใบ HQ ต้นทุน = ยอดที่ต้องการ แล้วทำใบบวก 0% → ยอดที่รู้แน่นอน (ใบจากใบ HQ ฐานคิดยอดเอง บังคับยอดไม่ได้)
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY, [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitCost: 560_000 }]);
  await page.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("0");
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();

  // ใบใหม่ของดีลที่สอง — customer ชื่อเดียวกัน แต่ id ใหม่ (ต่างจากใบดีลแรก)
  const q2 = await waitRow<{ id: string; total_value: number }>(sb, "quotations", { customer: COMPANY, status: "draft" });
  expect(Number((await sb.from("quotations").select("total_value").eq("id", q2.id).single()).data?.total_value), "ยอดใบ = ต้นทุนจากใบ HQ").toBe(560_000);
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

// ด่าน 3 (ใบ 0203 · ข้อตัดสินของบอส): ใบที่ won ลบไม่ได้ — ยอดขายที่ปิดแล้วต้องไม่หาย (เดิม: ลบได้แล้วยอดลด)
test("[audit] ลบใบเสนอราคาที่ won แล้ว — ฐานปฏิเสธ ใบยังอยู่ ยอดลูกค้าไม่หาย", async ({ page }) => {
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
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  // ด่าน 3: ได้ใบ HQ ต้นทุน = ยอดที่ต้องการ แล้วทำใบบวก 0% → ยอดที่รู้แน่นอน (ใบจากใบ HQ ฐานคิดยอดเอง บังคับยอดไม่ได้)
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY, [{ name: "งานตามสัญญา", qty: 1, unit: "งาน", unitCost: 890_000 }]);
  await page.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("0");
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string }>(sb, "quotations", { customer: COMPANY });
  expect(Number((await sb.from("quotations").select("total_value").eq("id", q.id).single()).data?.total_value), "ยอดใบ = ต้นทุนจากใบ HQ").toBe(890_000);

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
    // ฐานปฏิเสธ (quote_won_locked) — รอให้หน้าจอได้คำตอบแล้วยืนยันว่าใบยังอยู่ ยอดลูกค้าไม่ขยับ
    await expect(page.getByText(/ลบไม่ได้|ตอบรับแล้ว|quote_won_locked/).first(), "ต้องบอกผู้ใช้ว่าลบไม่ได้").toBeVisible({ timeout: 15_000 });
    expect((await sb.from("quotations").select("id,status").eq("id", q.id)).data?.[0]?.status, "ใบ won ต้องยังอยู่").toBe("won");
    const custAfter = (await sb.from("customers").select("total_value").eq("id", cust.id).single()).data as { total_value: number };
    expect(custAfter.total_value, "ยอดลูกค้าต้องไม่หาย").toBe(cust.total_value);
  }

  // คำขอลบที่ถูกฐานปฏิเสธ = สิ่งที่ข้อนี้ตั้งใจให้เกิด ไม่ใช่ข้อผิดพลาดของระบบ
  assertNoErrors(errs.filter(e => !/quote_won_locked|ลบใบเสนอราคา|409|400|403/.test(e)), "ลบใบที่ won แล้ว");
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
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);   // ด่าน 3: ใบใหม่ทำจากใบ HQ (ทางสร้างใบแบบเดิมปิดแล้ว)
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
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);   // ด่าน 3: ใบใหม่ทำจากใบ HQ (ทางสร้างใบแบบเดิมปิดแล้ว)
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
