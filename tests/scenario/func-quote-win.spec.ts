import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import {
  DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, waitRow, cleanup, specNS, nsTag, pickTemplate, markQuotationSent, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";

// โซ่ธุรกิจหลักของทั้งระบบ: ลูกค้าเป้าหมาย → ใบเสนอราคา (BOQ) → ปิดการขาย → ลูกค้า
// ทุกขั้นต้องลง DB จริง ไม่ใช่แค่เปลี่ยนบนจอ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

// ช่องข้อมูลเฉพาะสเปกนี้ — กัน cleanup ข้ามไปลบข้อมูลของสเปกอื่นที่รันขนานกัน (ดู funcHelpers)
const NS = specNS("QUOTE");
const tg = nsTag(NS);
const COMPANY = tg("โซ่ขาย");

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[func] ออกใบเสนอราคาจากลูกค้าเป้าหมาย → ใบลง DB พร้อมรายการสินค้า", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  // 1) สร้างลูกค้าเป้าหมายต้นทาง
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณโซ่");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500");   // พื้นที่ → ใช้ตั้งต้น BOQ
  await pickTemplate(page); // ต้องเลือกแม่แบบจริง ไม่งั้น BOQ ว่าง → ปุ่มสร้างใบถูก disable (H-audit fix)
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMPANY });

  // 2) เปิดแผงลูกค้าเป้าหมาย → แท็บใบเสนอราคา → สร้าง
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางลูกค้าเป้าหมายแบ่งหน้า — ตอนรันชุดเต็มมีลูกค้าเป้าหมายทดสอบสะสมจนลูกค้าเป้าหมายของเทสต์นี้หลุดไปหน้าหลัง ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);   // ด่าน 3: ใบใหม่ทำจากใบ HQ (ทางสร้างใบแบบเดิมปิดแล้ว)
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 10_000 });

  // ปุ่มส่งฟอร์มชื่อเดียวกับปุ่มเปิดฟอร์ม — ตัวสุดท้ายในหน้าคือปุ่มในฟอร์ม (อยู่ถัดจาก "ยกเลิก")
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();

  // 3) ใบต้องอยู่ใน DB ของสาขานี้
  const q = await waitRow<{ id: string; dealer_code: string; status: string; customer: string }>(
    sb, "quotations", { customer: COMPANY });
  expect(q.dealer_code, "ใบใหม่ต้องเป็นของสาขาที่ล็อกอิน").toBe("RYG");
  expect(q.status, "ใบใหม่เริ่มที่ร่าง").toBe("draft");
  expect(q.id, "เลขที่ใบต้องมาจากตัวนับของ DB").toMatch(/^[A-Za-z0-9-]+\d{4}$/);

  assertNoErrors(errs, "ออกใบเสนอราคา");
});

test("[func] ปิดการขายสำเร็จ → ลูกค้าถูกสร้างใน DB", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);

  // กฎ 19 ส.ค. 69: ปิดการขายสำเร็จไม่ได้ถ้ายังไม่มีใบที่ "ส่งแล้ว" — เทสต์นี้ตรวจสิ่งที่เกิด "หลัง" ปิดการขาย
  // จึงจัดฉากให้ผ่านด่านนั้นก่อน (ใบถูกสร้างไว้แล้วจากเทสต์ก่อนหน้าในไฟล์เดียวกัน)
  await markQuotationSent(sb, "RYG", COMPANY);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางลูกค้าเป้าหมายแบ่งหน้า — ตอนรันชุดเต็มมีลูกค้าเป้าหมายทดสอบสะสมจนลูกค้าเป้าหมายของเทสต์นี้หลุดไปหน้าหลัง ต้องค้นหาก่อน

  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: /▾/ }).first().click();
  // ปิดการขาย = ย้อนกลับไม่ได้ → แอปขึ้น confirm() ก่อนเสมอ (เพิ่มหลังผลตรวจสอบ /scenario 31 ก.ค. 69)
  await page.getByRole("button", { name: "ปิดการขายสำเร็จ", exact: true }).first().click();
  await กดตกลงในกล่องยืนยัน(page);

  // ลูกค้าต้องถูกสร้างจากลูกค้าเป้าหมาย — นี่คือจุดที่ระบบ "แปลงลูกค้าเป้าหมายเป็นลูกค้า"
  const cust = await waitRow<{ company: string; dealer_code: string; id: number }>(
    sb, "customers", { company: COMPANY }, 20_000);
  expect(cust.dealer_code, "ลูกค้าต้องเป็นของสาขาเดียวกับลูกค้าเป้าหมาย").toBe("RYG");
  expect(cust.id, "เลขลูกค้าต้องมาจากตัวนับของ DB").toBeGreaterThan(0);

  // M6 — ใบที่ออกให้ลูกค้าเป้าหมาย (customer_id เดิม NULL) ต้องถูก relink เข้ากับลูกค้าใหม่
  //   และ FK (dealer_code, customer_id) → customers ต้องยอมรับ (ลูกค้าถูกสร้างก่อน relink แล้ว)
  //   ถ้า FK ปฏิเสธ/ยังไม่ relink → customer_id จะไม่เท่ากับ cust.id → poll หมดเวลา
  await expect.poll(async () =>
    (await sb.from("quotations").select("customer_id").eq("dealer_code", "RYG").eq("customer", COMPANY)).data?.[0]?.customer_id,
    { timeout: 15_000, message: "ใบต้องถูกผูกกับลูกค้าใหม่ (relink) และ FK ต้องยอมรับ" }).toBe(cust.id);

  assertNoErrors(errs, "ปิดการขาย");
});

test("[func] ลูกค้าที่เกิดจากการปิดการขาย โผล่ในหน้าลูกค้า", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });

  // ต้องค้นหาก่อน — หน้าลูกค้าแบ่งหน้า และตอนรันทั้งชุดพร้อมกัน สเปกอื่นปิดการขายของสาขาเดียวกัน
  // เพิ่มลูกค้าใหม่แทรกเข้ามาตลอด ลูกค้าของเทสต์นี้จึงถูกดันตกหน้าแรกไปเป็นครั้งคราว
  // → ตกด้วย "ไม่เจอลูกค้า" ทั้งที่ข้อมูลอยู่ครบ (ตัวหน้าจอเองก็ตั้งช่องค้นหาให้อัตโนมัติด้วยเหตุผลเดียวกัน)
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(COMPANY);
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "ลูกค้าใหม่ต้องโผล่ในหน้าลูกค้า" }).toContain(COMPANY);

  assertNoErrors(errs, "หน้าลูกค้า");
});

// เส้นทางปิดการขายเส้นที่สอง: กด "ลูกค้าตอบรับ ✓" บน "หน้าใบเสนอราคา" (ไม่ใช่ลิ้นชักลูกค้าเป้าหมาย)
// เดิมเส้นนี้พึ่ง trigger on_quote_won ที่ DB ซึ่งสร้างลูกค้า id=0 ไร้ชื่อ (C6)
// ตอนนี้ trigger ถูกลบแล้ว แอปต้องสร้างลูกค้าผ่าน convertLeadToCustomer เอง (id จริง ข้อมูลครบ)
test("[func] ปิดการขายจากหน้าใบเสนอราคา → ลูกค้าถูกสร้าง id จริง ไม่ใช่ 0 (C6)", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMP = tg("ตอบรับบนใบ");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  // 1) ลูกค้าเป้าหมายใหม่ + ออกใบเสนอราคาจากลูกค้าเป้าหมาย (ใบผูก dealId ของลูกค้าเป้าหมาย · customerId = 0)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMP);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณตอบรับ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("500"); // พื้นที่ → ใช้ตั้งต้น BOQ
  await pickTemplate(page); // ต้องเลือกแม่แบบจริง ไม่งั้น BOQ ว่าง → ปุ่มสร้างใบถูก disable (H-audit fix)
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company: COMP });

  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางลูกค้าเป้าหมายแบ่งหน้า — ตอนรันชุดเต็มมีลูกค้าเป้าหมายทดสอบสะสมจนลูกค้าเป้าหมายของเทสต์นี้หลุดไปหน้าหลัง ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMP);
  const lrow = page.locator("tbody tr").filter({ hasText: COMP }).first();
  await expect(lrow).toBeVisible({ timeout: 25_000 });
  await lrow.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMP);   // ด่าน 3: ใบใหม่ทำจากใบ HQ (ทางสร้างใบแบบเดิมปิดแล้ว)
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const q = await waitRow<{ id: string }>(sb, "quotations", { customer: COMP });

  // 2) ไปหน้าใบเสนอราคา → ส่งใบ (ร่าง → ส่งแล้ว) เพื่อให้ปุ่ม "ลูกค้าตอบรับ" โผล่
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  const qrow = page.locator("tbody tr").filter({ hasText: COMP }).first();
  await expect(qrow).toBeVisible({ timeout: 25_000 });
  await qrow.getByRole("button", { name: "ส่งให้ลูกค้า" }).first().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("id", q.id)).data?.[0]?.status,
    { timeout: 25_000, message: "ใบต้องเป็น 'ส่งแล้ว'" }).toBe("sent_to_client");

  // 3) เปิดลิ้นชักใบ → กด "ลูกค้าตอบรับ ✓"
  await qrow.click();
  // ปิดการขาย = ย้อนกลับไม่ได้ → แอปขึ้น confirm() ก่อนเสมอ (เพิ่มหลังผลตรวจสอบ /scenario 31 ก.ค. 69)
  await page.getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click();
  await กดตกลงในกล่องยืนยัน(page);

  // 4) ลูกค้าต้องถูกสร้างด้วย id จริง (> 0) ไม่ใช่ 0 — และไม่มีลูกค้าผี id=0 โผล่
  const cust = await waitRow<{ company: string; id: number; name: string | null }>(
    sb, "customers", { company: COMP }, 20_000);
  expect(cust.id, "เลขลูกค้าต้องมาจากตัวนับของ DB ไม่ใช่ 0 (ลูกค้าผีของ trigger เดิม)").toBeGreaterThan(0);
  expect(cust.name, "ลูกค้าต้องมีชื่อ — ไม่ใช่ NULL แบบที่ trigger สร้าง").toBeTruthy();

  const ghost = (await sb.from("customers").select("id").eq("dealer_code", "RYG").eq("id", 0)).data ?? [];
  expect(ghost.length, "ต้องไม่มีลูกค้าผี id=0 ในสาขา").toBe(0);

  assertNoErrors(errs, "ปิดการขายจากหน้าใบเสนอราคา");
});

test("[func] เพิ่มโน้ตให้ลูกค้า → โน้ตลง DB", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const TITLE = tg("โน้ตทดสอบ");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });

  // ต้องค้นหาก่อน — หน้าลูกค้าแบ่งหน้า ตอนรันทั้งชุดพร้อมกันสเปกอื่นปิดการขายเพิ่มลูกค้าแทรกเข้ามา
  // ลูกค้าของเทสต์นี้จึงตกหน้าแรก (กับดักเดียวกับที่แก้ไปแล้วในเทสต์ข้างบนของไฟล์นี้ แต่จุดนี้ตกหล่น)
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(COMPANY);
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000 }).toContain(COMPANY);
  await page.getByText(COMPANY).first().click();

  await page.getByRole("button", { name: "เพิ่มโน้ต" }).first().click();
  await page.getByPlaceholder("หัวข้อโน้ต").fill(TITLE);
  await page.getByPlaceholder("รายละเอียดการติดตาม").fill("บันทึกอัตโนมัติจากชุดทดสอบ");
  await page.getByRole("button", { name: "บันทึกโน้ต" }).click();

  const note = await waitRow<{ title: string; dealer_code: string; customer_id: number }>(
    sb, "customer_notes", { title: TITLE }, 15_000);
  expect(note.dealer_code, "โน้ตต้องเป็นของสาขาที่ล็อกอิน").toBe("RYG");
  expect(note.customer_id, "โน้ตต้องผูกกับลูกค้าที่เปิดอยู่").toBeGreaterThan(0);

  assertNoErrors(errs, "เพิ่มโน้ต");
});
