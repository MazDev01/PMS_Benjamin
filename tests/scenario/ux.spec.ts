import { test, expect } from "@playwright/test";
import { กดยกเลิกในกล่องยืนยัน } from "./helpers";
import { open, openLeadQuotationForm } from "./helpers";

// ─── Persona: UX Expert ───────────────────────────────────────────────────────
// "flow ราบรื่นไหม · เตือนตอนควรเตือนไหม · กันพลาดไหม · แต่ละ role เห็นสิ่งที่ต่างกันไหม"

// แถบหัวข้อของหน้าตั้งค่า HQ — ต้องเจาะจงขอบเขตนี้เสมอ
// ไม่งั้นชื่อหัวข้ออย่าง "การแจ้งเตือน" จะไปชนกับกระดิ่งบนแถบบน
const HQ_SETTINGS_NAV = ".tab-bar";

// เมนู HQ ต้องไปได้ทุกลิงก์ (ไม่มี dead link)
test("[ux·hq] เมนูข้างไปได้ทุกหน้า", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");
  const links = ["ดีลเลอร์", "ลูกค้าทั้งเครือ", "ภาพรวมยอดขาย", "ใบเสนอราคาทั้งเครือ", "บันทึกการใช้งาน", "ตั้งค่า"];   // "แคตตาล็อกแม่แบบ" ลบแล้ว 16 ต.ค. 69
  for (const label of links) {
    await page.getByRole("link", { name: label, exact: false }).first().click();
    await expect(page.locator(".topbar-title").first()).toBeVisible(); // หัวข้อหน้าอยู่บน Topbar (ตัด h2 ซ้ำในหน้าออกแล้ว)
    await expect(page).not.toHaveURL(/\/hq\/dashboard$/); // ต้องออกจากแดชบอร์ดจริง
  }
});

// กันพลาด: แก้ค่าในตั้งค่าแล้วสลับหัวข้อ → ต้องเตือน "ยังไม่บันทึก"
// (ตั้งค่า HQ = เมนูซ้าย 6 หัวข้อ · หัวข้อ "ระบบ" กับ "กฎธุรกิจ" ถูกยุบไปแล้ว)
test("[ux·hq] เตือน unsaved เมื่อออกจากหัวข้อที่แก้ค้าง", async ({ page }) => {
  await open(page, "hq", "/hq/settings");
  await page.locator(HQ_SETTINGS_NAV).getByRole("button", { name: /เป้าหมายยอดขาย/ }).click();
  const num = page.locator('input[type="number"]').first();
  await num.fill("999000000");
  await page.locator(HQ_SETTINGS_NAV).getByRole("button", { name: /บริษัท/ }).click();
  expect(await กดยกเลิกในกล่องยืนยัน(page)).toContain("ยังไม่บันทึก");
});

// บัญชีดีลเลอร์ = รวมโปรไฟล์ผู้ใช้ (รูป/ชื่อ/ตำแหน่ง) + ข้อมูลบริษัท + ข้อมูลบัญชี ไว้แท็บเดียว
//
// ⚠️ กติกาเปลี่ยนแล้ว (บอสสั่ง 28 ส.ค. 69): ดีลเลอร์แก้อีเมล/รหัสผ่านเองได้
//    เดิมหน้านี้มีปุ่ม "จัดการรหัสผ่าน" ที่กดแล้วขึ้นข้อความว่าให้ติดต่อสำนักงานใหญ่
//    ตอนนี้เป็นการ์ดสรุปบัญชี + ปุ่มเข้าไปหน้าจัดการบัญชีแยก (ช่องรหัสผ่านไม่อยู่ในหน้ารวมแล้ว)
test("[ux·dealer] บัญชีดีลเลอร์ รวมโปรไฟล์+บริษัท+ข้อมูลบัญชี ในที่เดียว", async ({ page }) => {
  await open(page, "dealer", "/settings"); // แท็บแรก = บัญชีดีลเลอร์
  await expect(page.getByText("ข้อมูลบริษัท (ออกในนามดีลเลอร์)")).toBeVisible();
  await expect(page.getByText("จัดการข้อมูลบัญชีและการเข้าสู่ระบบของคุณ")).toBeVisible();
  await expect(page.getByText("อีเมลเข้าสู่ระบบ").first()).toBeVisible();
  // ทางเข้าไปแก้บัญชี = ปุ่มเดียว · หน้ารวมต้องไม่มีช่องรหัสผ่านเปิดค้างไว้
  await expect(page.getByRole("button", { name: /เปลี่ยนอีเมล \/ รหัสผ่าน/ })).toBeVisible();
  await expect(page.getByLabel("รหัสผ่านปัจจุบัน")).toHaveCount(0);
});

// ป้ายเจ้าของ+มงกุฎ: อยู่ที่ก้น sidebar · ชื่อบทบาทต่างกันตามสิทธิ์
//
// ⚠️ คำที่ใช้เปลี่ยนเมื่อ 10 ส.ค. 69 โดยตั้งใจ — เดิม "เจ้าของแพลตฟอร์ม"/"เจ้าของบัญชีดีลเลอร์"
//   ซึ่งเป็นคนละคำกับที่แถบบนขวาเรียกคนคนเดียวกัน ("ผู้ดูแลระบบ"/"ผู้จัดการดีลเลอร์")
//   ผู้ใช้เห็นตัวเองถูกเรียกสองชื่อพร้อมกันในจอเดียว → รวมมาใช้แหล่งเดียว (roleLabelOf)
//   เทสต์นี้จึงเปลี่ยนตามข้อกำหนดใหม่ ไม่ใช่แก้เพื่อให้ผ่าน
test("[ux·hq] ก้น sidebar แสดงชื่อบทบาทตรงกับแถบบน", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");
  // ชื่อบัญชีผู้ดูแลบังเอิญเป็นคำเดียวกับชื่อบทบาท → เจอสองจุดในการ์ดเดียว ใช้ตัวแรกพอ
  await expect(page.locator(".sidebar-footer").getByText("ผู้ดูแลระบบ").first()).toBeVisible();
  // ต้องไม่กลับไปใช้คำเก่าที่ขัดกับแถบบนอีก
  await expect(page.getByText("เจ้าของแพลตฟอร์ม")).toHaveCount(0);
});
test("[ux·dealer] ก้น sidebar ของดีลเลอร์ต้องไม่ใช่ชื่อบทบาทของสำนักงานใหญ่", async ({ page }) => {
  await open(page, "dealer", "/dashboard");
  await expect(page.locator(".sidebar-footer").getByText("ผู้จัดการดีลเลอร์")).toBeVisible();
  await expect(page.getByText("ผู้ดูแลระบบ")).toHaveCount(0);
  await expect(page.getByText("เจ้าของบัญชีดีลเลอร์")).toHaveCount(0);
});

// ⚠️ เดิมเทสต์นี้คาดว่าดีลเลอร์ "พิมพ์คำนำหน้าเลขที่เองได้" (มองหาช่องกรอกที่ขึ้นต้นด้วย Q-)
//   แต่ภายหลังตัดสินใจ **ล็อกคำนำหน้าเป็นรูปแบบเดียวทั้งระบบ** Q-{รหัสสาขา}-{ปี}- โดยตั้งใจ
//   เพราะสาขาที่พิมพ์เองจะได้เลขที่ไม่ตรงกับที่ระบบออกจริงตอนสร้างใบ
//   เทสต์จึงตกทั้งที่โค้ดถูก — ตอนนี้เปลี่ยนมาตรวจ "กติกาที่ใช้จริง" แทน
//
// สรุปกติกาปัจจุบัน: คำนำหน้า = ระบบล็อก · เลขลำดับกับอายุใบ = ดีลเลอร์ตั้งเอง · VAT = สำนักงานใหญ่กำหนด
test("[ux·dealer] คำนำหน้าเลขที่ใบเสนอราคาถูกล็อก · เลขลำดับดีลเลอร์ตั้งเอง · VAT มาจากสำนักงานใหญ่", async ({ page }) => {
  await open(page, "dealer", "/settings");
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: false }).first().click();

  // คำนำหน้าเป็นกล่องอ่านอย่างเดียว ไม่ใช่ช่องกรอก — และต้องเป็นรูปแบบของระบบ
  const prefix = page.getByTestId("quote-prefix");
  await expect(prefix).toBeVisible();
  await expect(prefix).toHaveText(/^Q-[A-Z]{3}-\d{4}-$/);
  await expect(page.locator('input[data-testid="quote-prefix"]'), "คำนำหน้าต้องแก้ไม่ได้").toHaveCount(0);

  // ช่อง "เลขลำดับถัดไป" เอาออกแล้ว (บอสตัดสิน 20 ต.ค. 69 — ไม่มีผล · ตัวนับเลขเอกสารห้ามแก้จากหน้าเว็บ)
  await expect(page.getByLabel("เลขลำดับถัดไป"), "ไม่มีช่องแก้เลขลำดับ").toHaveCount(0);
  await expect(page.getByText("เลขลำดับถัดไป"), "ไม่มีป้ายเลขลำดับถัดไป").toHaveCount(0);

  // VAT ยังกำหนดโดยสำนักงานใหญ่
  await expect(page.getByText("ภาษีมูลค่าเพิ่ม %")).toBeVisible();
});

// ฟอร์มเพิ่มลูกค้าเป้าหมาย: เลือกขั้นได้เฉพาะก่อน "เสนอราคา" (ขั้นเสนอราคาต้องมีใบก่อน)
test("[ux·dealer] ฟอร์มเพิ่มลูกค้าเป้าหมายไม่มีขั้น 'เสนอราคา' (ไม่มีช่องขั้นตอน)", async ({ page }) => {
  await open(page, "dealer", "/leads");
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();
  // ฟอร์มไม่มีช่องขั้นตอนเลย (บอสสั่ง 28 ต.ค. 69 · FLOW D2) — ตั้งขั้นเสนอราคา (หรือขั้นไหนก็ตาม) เองตอนสร้างไม่ได้
  //   เจาะในกล่องฟอร์ม — ตัวกรองขั้นตอนบนแถบเครื่องมือ (หลังโมดัล) ใช้ชื่อเดียวกัน
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await expect(ฟอร์ม.getByLabel("ขั้นตอน", { exact: true }), "ไม่มีช่องขั้นตอน").toHaveCount(0);
  await expect(ฟอร์ม.getByRole("option", { name: "เสนอราคา", exact: true }), "ไม่มีตัวเลือกเสนอราคา").toHaveCount(0);
});

// ใบเสนอราคา = ฟอร์มหน้าเดียว (ไม่มี stepper) · ทุก section แสดงพร้อมกัน · ไม่มีช่องแม่แบบ
// ยอดเงินสรุปต้องแสดง "ที่เดียว" · หัวข้อ "รายการสินค้า (BOQ)" ต้องมีที่เดียว
test("[ux·dealer] ฟอร์มใบเสนอราคาหน้าเดียว + ยอด/หัวข้อ BOQ ไม่ซ้ำ", async ({ page }) => {
  await openLeadQuotationForm(page);
  // ทุก section แสดงพร้อมกันบนหน้าเดียว (ไม่มี stepper ให้กด · ไม่มีขั้น "เลือกแม่แบบ" แยก)
  await expect(page.locator("label").filter({ hasText: /^งานที่ต้องการ$/ }).first()).toBeVisible();   // ชุดช่องมาตรฐาน (เดิม "ชื่อโครงการ / เอกสาร" · ตารางเทียบ FLOW รอบ 5)
  await expect(page.getByText("รายการใบเสนอราคา")).toBeVisible();
  await expect(page.getByText("เลือกแม่แบบ", { exact: true })).toHaveCount(0);
  // ช่องเลือกแม่แบบ/หมวดอาคารต้องไม่มี (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
  await expect(page.getByText(/หมวดอาคาร/)).toHaveCount(0);
  await expect(page.getByText("แม่แบบที่เสนอ")).toHaveCount(0);
  // หัวข้อ "รายการสินค้า (BOQ)" ต้องมีที่เดียว (LineItemsEditor ในตัว — ไม่ใส่ label ซ้ำ)
  // ใบใหม่ทำจากใบ HQ (ด่าน 3): ตารางรายการเป็นของใบ HQ (แก้ได้เฉพาะ %) ต้องมีที่เดียว
  await expect(page.locator("[data-editor='hq-markup']")).toHaveCount(1);
  // ยอดสรุปโผล่ที่เดียว แยก ก่อนภาษี / ยอดชำระสุทธิ (คำเปลี่ยนตอนเพิ่มหัก ณ ที่จ่าย 28 ส.ค. 69)
  await expect(page.getByText("มูลค่างาน (ก่อน VAT)")).toHaveCount(1);
  await expect(page.getByText("ยอดชำระสุทธิ")).toHaveCount(1);
});

// กันพลาด (ฝั่งดีลเลอร์): ตั้งค่า Dealer ใช้ปุ่มบันทึกกลางเดียวบนหัวเหมือน HQ + เตือน unsaved
test("[ux·dealer] ตั้งค่าใช้ปุ่มบันทึกกลาง + เตือน unsaved", async ({ page }) => {
  await open(page, "dealer", "/settings");
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: false }).first().click();
  // รอโหลดค่าตั้งต้นจาก DB เสร็จก่อน (baseline snapshot สำหรับเทียบ dirty) — โหมด supabase
  // ค่าตั้งต้นมาจาก fetch จริง ไม่ใช่ mock ในตัวแบบเดิม กรอกไวไปชนก่อน baseline พร้อมจะไม่ขึ้น dirty เลย
  await page.waitForTimeout(1500);
  const num = page.locator('input[type="number"]').first();
  await num.fill("9");
  // ตัวบ่งชี้ยังไม่บันทึก + ปุ่มบันทึกกลางบนหัวต้องกดได้
  await expect(page.getByText("ยังไม่บันทึก")).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึก", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "ผู้รับผิดชอบ" }).click();
  expect(await กดยกเลิกในกล่องยืนยัน(page)).toContain("ยังไม่บันทึก");
});

// ผู้ใช้ HQ: หน้า Users เฉพาะ HQ (ไม่มี dealer) + stat/matrix · action dropdown → รีเซ็ตรหัสผ่าน
test("[ux·hq] หน้าผู้ใช้ HQ เฉพาะ HQ + stat/matrix + รีเซ็ตรหัสผ่าน", async ({ page }) => {
  await open(page, "hq", "/hq/settings");
  await page.locator(HQ_SETTINGS_NAV).getByRole("button", { name: /ผู้ใช้งานและสิทธิ์/ }).click();
  await expect(page.getByText("ผู้ใช้ทั้งหมด")).toBeVisible();
  await expect(page.getByText("Permission Matrix", { exact: false })).toBeVisible();
  // ต้องไม่มีผู้ใช้ของ Dealer (role เซลส์ดีลเลอร์หายไป)
  await expect(page.getByText("เซลส์ดีลเลอร์")).toHaveCount(0);
  // action dropdown → เหลือ "ตั้งรหัสผ่านใหม่ทันที" · เมนูส่งลิงก์ทางอีเมลเอาออกแล้ว (ปิดอีเมลระบบล็อกอิน 16 ต.ค. 69)
  await page.getByRole("button", { name: "จัดการ" }).first().click();
  await expect(page.getByRole("button", { name: /ตั้งรหัสผ่านใหม่ทันที/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /ส่งลิงก์ทางอีเมล/ })).toHaveCount(0);
});

// กันปุ่มซ้ำ: หัวข้อ "บริษัท" ของ HQ ฝังหน้าเต็ม → ต้องมีปุ่ม "บันทึก" เดียว (ปุ่มกลางบนหัว) ไม่ใช่สองปุ่ม
test("[ux·hq] หัวข้อบริษัทมีปุ่มบันทึกเดียว (ไม่ซ้ำ)", async ({ page }) => {
  await open(page, "hq", "/hq/settings");
  await page.locator(HQ_SETTINGS_NAV).getByRole("button", { name: /บริษัท/ }).click();
  // ปุ่มบันทึกต้องเหลือปุ่มเดียวทั้งหน้า (ปุ่มกลางบนหัว) — หน้าที่ฝังไม่มีปุ่มของตัวเอง
  await expect(page.getByRole("button", { name: "บันทึก", exact: true })).toHaveCount(1);
  // แก้ค่าแล้วปุ่มกลางต้องกดได้
  const first = page.locator('input.form-input').first();
  await first.fill("บริษัท ทดสอบ จำกัด");
  await expect(page.getByText("ยังไม่บันทึก")).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึก", exact: true })).toBeEnabled();
});

// Dealer Detail = read-only workspace + มีแท็บ ลูกค้า/กิจกรรม
test("[ux·hq] Dealer Detail อ่านอย่างเดียว + แท็บกิจกรรม", async ({ page }) => {
  await open(page, "hq", "/hq/dealers/CNX");
  await expect(page.getByText("ข้อมูลงานขายดูอย่างเดียว")).toBeVisible();
  await page.getByRole("button", { name: /^กิจกรรม/ }).click();
  await expect(page.getByText("กิจกรรมล่าสุด")).toBeVisible();
});

// รอบ 4 (บอสสั่ง 21 ต.ค. 69 · ใบ 0231): แจ้งเตือนมาจากตารางกลางที่ฐาน กระดิ่ง/อีเมลตายตัวตามเรื่อง
//   หน้าตั้งค่า HQ › การแจ้งเตือน เหลือรายชื่อผู้รับอีเมลอย่างเดียว — สวิตช์รายหมวด/กฎแจ้งเตือนงาน HQ/หมวดบันทึกการใช้งาน เอาออก
const ชนิดของHQ = ["request_new", "request_reprice", "requests_overdue", "customer_accepted", "franchise_payment_overdue",
  "request_cancelled", "prospect_followup_due", "prospect_idle", "proposal_awaiting", "proposal_expired"];
const ชนิดของดีลเลอร์ = ["hq_quote_sent", "hq_quote_expiring", "hq_quote_expired", "quote_expiring", "appointment_due", "lead_from_hq", "won_reverted"];

test("[ux·hq] ตั้งค่า › การแจ้งเตือน เหลือรายชื่อผู้รับอีเมล ไม่มีสวิตช์รายหมวด", async ({ page }) => {
  await open(page, "hq", "/hq/settings");
  await page.locator(HQ_SETTINGS_NAV).getByRole("button", { name: /การแจ้งเตือน/ }).click();
  await expect(page.getByLabel("อีเมลผู้รับแจ้งเตือน")).toBeVisible();
  await expect(page.getByRole("switch"), "ไม่มีสวิตช์เปิด/ปิดรายหมวด").toHaveCount(0);
  for (const เดิม of ["การแจ้งเตือนของสำนักงานใหญ่", "บันทึกการใช้งานที่อยากรู้", "จัดการดีลเลอร์", "ถึงกำหนดติดตาม"]) {
    await expect(page.getByText(เดิม, { exact: true }), `หัวข้อเดิม “${เดิม}” ต้องไม่มีแล้ว`).toHaveCount(0);
  }
});

// กระดิ่ง HQ = เฉพาะเรื่องในตารางกลางฝั่ง HQ · ไม่มีกลุ่ม "ต้องดูด่วน" (กฎแจ้งเตือนงาน HQ เดิม) และไม่มีฟีดบันทึกการใช้งาน
test("[ux·hq] กระดิ่ง HQ มีแต่เรื่องในตารางกลางของ HQ", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");
  await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
  await expect(page.getByText("การแจ้งเตือน", { exact: true })).toBeVisible();
  await expect(page.getByText("ต้องดูด่วน"), "กฎแจ้งเตือนงาน HQ เดิมออกจากกระดิ่งแล้ว").toHaveCount(0);
  await expect(page.getByText("ดูบันทึกการใช้งานทั้งหมด"), "ไม่มีฟีดบันทึกการใช้งานในกระดิ่ง").toHaveCount(0);
  const ดูทั้งหมด = page.locator("[data-notif-more]")   /* ปุ่มของแผงกระดิ่ง — แดชบอร์ดมีปุ่ม "ดูทั้งหมด" ของการ์ดด้วย */;
  if (await ดูทั้งหมด.count()) await ดูทั้งหมด.first().click();
  for (const k of await page.locator("[data-notif-kind]").evaluateAll(es => es.map(e => e.getAttribute("data-notif-kind")))) {
    expect(ชนิดของHQ, `เรื่อง ${k} ไม่อยู่ในตารางกลางฝั่ง HQ`).toContain(k);
  }
});

// กระดิ่งดีลเลอร์ = เฉพาะเรื่องในตารางกลางฝั่งดีลเลอร์ (ไม่ใช่บันทึกการใช้งาน · ไม่มีเรื่องที่ดีลเลอร์ทำเอง)
test("[ux·dealer] กระดิ่งดีลเลอร์มีแต่เรื่องในตารางกลางของดีลเลอร์", async ({ page }) => {
  await open(page, "dealer", "/dashboard");
  await page.getByRole("button", { name: "การแจ้งเตือน" }).first().click();
  await expect(page.getByText("การแจ้งเตือน", { exact: true })).toBeVisible();
  await expect(page.getByText("ดูบันทึกการใช้งานทั้งหมด")).toHaveCount(0); // ต้องไม่ใช่ audit
  const ดูทั้งหมด = page.locator("[data-notif-more]")   /* ปุ่มของแผงกระดิ่ง — แดชบอร์ดมีปุ่ม "ดูทั้งหมด" ของการ์ดด้วย */;
  if (await ดูทั้งหมด.count()) await ดูทั้งหมด.first().click();
  for (const k of await page.locator("[data-notif-kind]").evaluateAll(es => es.map(e => e.getAttribute("data-notif-kind")))) {
    expect(ชนิดของดีลเลอร์, `เรื่อง ${k} ไม่อยู่ในตารางกลางฝั่งดีลเลอร์`).toContain(k);
  }
});

// สถานะว่างชัดเจน: ลูกค้าทั้งเครือ ค้นหาที่ไม่เจอ
test("[ux·hq] empty state ของหน้าลูกค้าทั้งเครือ", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  await page.locator('input[placeholder*="ค้นหา"]').first().fill("ลูกค้าที่ไม่มีจริง-xyz");
  await expect(page.getByText(/ไม่พบ/).first()).toBeVisible();
});
