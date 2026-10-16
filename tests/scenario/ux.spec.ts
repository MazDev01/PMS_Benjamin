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

  // เลขลำดับถัดไป = ดีลเลอร์ตั้งเองได้จริง (ต้องเป็นช่องกรอกที่ไม่ถูกปิด)
  const running = page.locator('input[type="number"]').first();
  await expect(running).toBeEditable();

  // VAT ยังกำหนดโดยสำนักงานใหญ่
  await expect(page.getByText("ภาษีมูลค่าเพิ่ม %")).toBeVisible();
});

// ฟอร์มเพิ่มลูกค้าเป้าหมาย: เลือกขั้นได้เฉพาะก่อน "เสนอราคา" (ขั้นเสนอราคาต้องมีใบก่อน)
test("[ux·dealer] ฟอร์มเพิ่มลูกค้าเป้าหมายไม่มีขั้น 'เสนอราคา'", async ({ page }) => {
  await open(page, "dealer", "/leads");
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();
  // ต้องเจาะที่ช่อง "ขั้นตอน" ของฟอร์มเท่านั้น — dropdown กรองสถานะบนแถบเครื่องมือ (หลังโมดัล)
  // มีครบทุกขั้นรวม "เสนอราคา" ตามปกติ ถ้าหาทั้งหน้าจะไปจับตัวนั้นแล้วฟ้องผิด
  const stage = page.getByLabel("ขั้นตอน");
  await expect(stage.getByRole("option", { name: "เสนอราคา", exact: true })).toHaveCount(0);
  await expect(stage.getByRole("option", { name: "ติดต่อแล้ว", exact: true })).toHaveCount(1);
});

// ใบเสนอราคา = ฟอร์มหน้าเดียว (ไม่มี stepper) · ทุก section แสดงพร้อมกัน · ไม่มีช่องแม่แบบ
// ยอดเงินสรุปต้องแสดง "ที่เดียว" · หัวข้อ "รายการสินค้า (BOQ)" ต้องมีที่เดียว
test("[ux·dealer] ฟอร์มใบเสนอราคาหน้าเดียว + ยอด/หัวข้อ BOQ ไม่ซ้ำ", async ({ page }) => {
  await openLeadQuotationForm(page);
  // ทุก section แสดงพร้อมกันบนหน้าเดียว (ไม่มี stepper ให้กด · ไม่มีขั้น "เลือกแม่แบบ" แยก)
  await expect(page.getByText("ชื่อโครงการ / เอกสาร")).toBeVisible();
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
  await expect(page.getByText("โหมดดูอย่างเดียว")).toBeVisible();
  await page.getByRole("button", { name: /^กิจกรรม/ }).click();
  await expect(page.getByText("กิจกรรมล่าสุด")).toBeVisible();
});

// หัวข้อแจ้งเตือน HQ ต้องเป็นเรื่องที่ HQ คุม (กฎแจ้งเตือน + บันทึกการใช้งาน) ไม่ใช่งานขายของดีลเลอร์
test("[ux·hq] หัวข้อแจ้งเตือน HQ ใช้ event ของ HQ ไม่ใช่งานขายดีลเลอร์", async ({ page }) => {
  await open(page, "hq", "/hq/settings");
  await page.locator(HQ_SETTINGS_NAV).getByRole("button", { name: /การแจ้งเตือน/ }).click();
  // เรื่องที่ HQ อยากเห็นจากบันทึกการใช้งาน
  await expect(page.getByText("จัดการดีลเลอร์")).toBeVisible();
  // หัวข้อ "ราคากลาง" ถูกลบไปพร้อมแม่แบบ (16 ต.ค. 69) · "ส่วนลด" ถูกลบทั้งฟีเจอร์แล้ว
  await expect(page.getByText("ราคากลาง", { exact: true }), "หัวข้อราคากลางลบไปพร้อมแม่แบบ").toHaveCount(0);
  await expect(page.getByText(/แม่แบบและแคตตาล็อก/), "หัวข้อแม่แบบและแคตตาล็อกลบแล้ว").toHaveCount(0);
  await expect(page.getByText(/ส่วนลด/), "ส่วนลดถูกลบทั้งฟีเจอร์แล้ว").toHaveCount(0);
  // ต้องไม่มี event งานขายของดีลเลอร์หลงมา
  await expect(page.getByText("มีลูกค้าเป้าหมายเข้ามาใหม่")).toHaveCount(0);
  await expect(page.getByText("ดีลเลอร์ออกใบเสนอราคา")).toHaveCount(0);
});

// การแจ้งเตือนแยกตาม role: HQ = งานของสำนักงานใหญ่เอง + บันทึกการใช้งาน (บอสสั่ง 14 ก.ย. 69)
// (บันทึกการใช้งานมีหน้าของตัวเองที่ /hq/audit แล้ว — เหตุการณ์ audit จะโผล่ที่กระดิ่งด้วยเมื่อมีคนแก้จริง
//  จึงไม่ยึดข้อความ audit เป็นหมุด) · global-setup ใส่ลูกค้าเป้าหมาย (HQ) ที่เลยวันนัดติดตามไว้ 1 ราย
test("[ux·hq] กระดิ่งแจ้งเตือนฝั่ง HQ เป็นงานของสำนักงานใหญ่ ไม่ใช่งานขายของดีลเลอร์", async ({ page }) => {
  await open(page, "hq", "/hq/dashboard");
  await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
  await expect(page.getByText("การแจ้งเตือน", { exact: true })).toBeVisible();
  // HQ ต้องไม่เห็น "งานที่ดีลเลอร์ต้องทำ" (นั่นเป็นกระดิ่งของฝั่งดีลเลอร์)
  await expect(page.getByText("ลูกค้าเป้าหมายรอดำเนินการ")).toHaveCount(0);
  // เรื่องที่ขึ้นต้องมาจากกฎแจ้งเตือนงานของ HQ — จัดกลุ่มใต้หัวข้อ "ต้องดูด่วน"
  await expect(page.getByText("ต้องดูด่วน").first()).toBeVisible();
  // "ต้องดูด่วน" แสดงทีละรายการ (บอสสั่ง 22 ก.ย. 69 "แจ้งเตือนทีละอันแบบเข้าใจง่าย" · commit 1f55c94)
  //   แต่ละแถว = ป้ายเรื่องสั้น → ชื่อรายที่ต้องจัดการ → เกิดอะไรขึ้น · เดิมข้อนี้ตรวจหัวข้อกลุ่มยาวซึ่งไม่มีแล้ว
  const แผง = page.locator("div").filter({ hasText: "ต้องดูด่วน" }).last();
  await expect(page.getByText("ถึงกำหนดติดตาม", { exact: true }).first(), "ต้องมีป้ายเรื่องสั้นของรายที่ถึงกำหนดติดตาม").toBeVisible();
  await expect(page.getByText(/เลยนัดมา \d+ วัน|นัดไว้วันนี้/).first(), "แต่ละรายการต้องบอกว่าเกิดอะไรขึ้น (เลยนัดมากี่วัน)").toBeVisible();
  await expect(page.getByText("ลูกค้าเป้าหมาย (HQ) ถึงกำหนดติดตาม"), "หัวข้อกลุ่มแบบยาวต้องไม่มีแล้ว — แสดงทีละรายการ").toHaveCount(0);
  await expect(แผง).toBeVisible();
  // เรื่องงานขายของดีลเลอร์ชุดเดิมต้องไม่มีแล้ว
  for (const เดิม of ["ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบ", "ดีลเลอร์ไม่มีความเคลื่อนไหว", "ใบเสนอราคาใกล้หมดอายุ", "อัตราปิดการขายไม่สำเร็จสูง"]) {
    await expect(page.getByText(เดิม), `ห้ามมี “${เดิม}” ในกระดิ่ง HQ`).toHaveCount(0);
  }
});

// การแจ้งเตือนแยกตาม role: Dealer = งานขาย (ลูกค้าเป้าหมายรอดำเนินการ) ไม่ใช่ audit
test("[ux·dealer] กระดิ่งแจ้งเตือนฝั่งดีลเลอร์เป็นงานขาย", async ({ page }) => {
  await open(page, "dealer", "/dashboard");
  await page.getByRole("button", { name: "การแจ้งเตือน" }).first().click();
  await expect(page.getByText("การแจ้งเตือน", { exact: true })).toBeVisible();
  await expect(page.getByText("ดูบันทึกการใช้งานทั้งหมด")).toHaveCount(0); // ต้องไม่ใช่ audit
});

// สถานะว่างชัดเจน: ลูกค้าทั้งเครือ ค้นหาที่ไม่เจอ
test("[ux·hq] empty state ของหน้าลูกค้าทั้งเครือ", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  await page.locator('input[placeholder*="ค้นหา"]').first().fill("ลูกค้าที่ไม่มีจริง-xyz");
  await expect(page.getByText(/ไม่พบ/).first()).toBeVisible();
});
