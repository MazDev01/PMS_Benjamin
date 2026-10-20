import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI, db, specNS, nsTag, cleanup, waitRow } from "./funcHelpers";
import { open, ดักข้อความแจ้งเตือน, settle } from "./helpers";

// ── ความปลอดภัยรอง: ไฟล์รูปที่รับเข้าระบบ + การสร้างข้อมูลซ้ำ (ตรวจสอบระบบ 5 ส.ค. 69) ──
//
// 1) รูปทุกจุดในระบบ (โปรไฟล์ · โลโก้ลูกค้า/ลูกค้าเป้าหมาย · โลโก้สาขา · แคตตาล็อกกลาง) เก็บเป็น data URL
//    ลงคอลัมน์ text ตรง ๆ ไม่ผ่าน Storage จึงไม่มีเพดานของ bucket มาช่วย — เดิมไม่ตรวจอะไรเลย
//    และถ้าไฟล์ถอดรหัสเป็นรูปไม่ได้ จะเก็บ "ไฟล์ดิบทั้งก้อน" แทน = เลือกไฟล์อะไรก็ได้ก็ลง DB
//
// 2) กันกดบันทึกซ้ำเป็น useRef ในแท็บเดียว — วัดจริงแล้ว: กดรัว 5 ครั้งในแท็บเดียว → 1 แถว (ผ่าน)
//    แต่เปิด 2 แท็บกดพร้อมกัน → 2 แถว (ซ้ำได้จริง) · ไม่ใช้ unique constraint เพราะหลายดีลของบริษัท
//    เดียวกันเป็นเรื่องปกติ — แก้ด้วยการเตือนให้เห็นก่อนกดบันทึกแทน
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const NS = specNS("UPDUP");
const tg = nsTag(NS);

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

/** ไฟล์ที่ "ไม่ใช่รูป" แต่ตั้งชื่อ/ชนิดให้ดูเหมือนรูป — จำลองการเลี่ยงตัวกรองในกล่องเลือกไฟล์ */
const FAKE_IMAGE = { name: "ไม่ใช่รูป.png", mimeType: "image/png", buffer: Buffer.from("MZ\x90\x00 นี่คือไฟล์ปลอม ไม่ใช่รูปจริง") };
/** ไฟล์ชนิดที่ไม่รับเลย */
const EXE_FILE = { name: "โปรแกรม.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ\x90\x00") };
/** รูป PNG 1x1 ของจริง (ถอดรหัสได้) */
const REAL_PNG = {
  name: "รูปจริง.png", mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
};

/** ดักกล่องข้อความเตือน (alert) แล้วคืนฟังก์ชันอ่านข้อความที่ขึ้นมา */
function catchAlerts(page: Page): () => string[] {
  // เป็นข้อความของระบบ (sonner) ไม่ใช่กล่องเบราว์เซอร์แล้ว (บอสสั่ง 2 ก.ย. 69)
  return ดักข้อความแจ้งเตือน(page);
}

/** เปิดหน้าโปรไฟล์แล้วรอจนช่องเลือกไฟล์พร้อมจริง
 *  ตอนรันหลาย worker พร้อมกัน dev server คอมไพล์หน้านี้ครั้งแรกช้ากว่า timeout ปกติได้
 *  (เป็นสภาพของเครื่องทดสอบ ไม่ใช่บั๊กของระบบ) — รอให้ชัดเจนแทนที่จะปล่อยให้แกว่ง */
async function openProfileUpload(page: Page) {
  await open(page, "hq", "/profile");
  const input = page.locator('input[type="file"]').first();
  // 60s: หน้า /profile ถูกคอมไพล์ครั้งแรกตอนเทสต์เปิด ถ้าจังหวะนั้นเครื่องรับงานจากหลาย worker พร้อมกัน
  // จะนานเกิน 40s ได้เป็นครั้งคราว (วัดแล้ว: รันเดี่ยวใช้ 5.9s) — เป็นความช้าของสภาพทดสอบ ไม่ใช่บั๊ก
  await input.waitFor({ state: "attached", timeout: 60_000 });
  return input;
}

test("ไฟล์ที่ไม่ใช่รูปจริง (แต่ตั้งชนิดเป็น image/png) ต้องถูกปฏิเสธพร้อมบอกเหตุผล", async ({ page }) => {
  const alerts = catchAlerts(page);
  const input = await openProfileUpload(page);
  // ⚠️ ต้องเทียบ "รูปเดิมเปลี่ยนไหม" ไม่ใช่ "หน้ามีรูปฝังอยู่กี่รูป" (แก้ 2 ก.ย. 69)
  //    หน้าโปรไฟล์ถูกจัดใหม่แล้วมีรูปที่ฝังเป็นข้อมูลอยู่ก่อนหลายจุด (รูปโปรไฟล์เดิม/ไอคอน)
  //    การนับให้ได้ 0 จึงฟ้องผิดทั้งที่ระบบปฏิเสธไฟล์ถูกต้อง — สิ่งที่ต้องกันคือ
  //    "ไฟล์ที่ถูกปฏิเสธถูกเอามาเป็นรูปโปรไฟล์แทนของเดิม"
  const รูปเดิม = await page.locator('img[src^="data:"]').first().getAttribute("src").catch(() => null);
  await input.setInputFiles(FAKE_IMAGE);
  await page.waitForTimeout(2500);

  expect(alerts().join(" | "), "ต้องเตือนว่าเปิดเป็นรูปไม่ได้").toMatch(/เปิดเป็นรูปไม่ได้|เสียหาย|ไม่ใช่ไฟล์รูป/);
  const รูปหลัง = await page.locator('img[src^="data:"]').first().getAttribute("src").catch(() => null);
  expect(รูปหลัง, "ไฟล์ที่ถูกปฏิเสธต้องไม่ถูกนำมาแสดงเป็นรูปโปรไฟล์").toBe(รูปเดิม);
});

test("ไฟล์ชนิดที่ไม่รับ (.exe) ต้องถูกปฏิเสธพร้อมบอกชนิดที่รับได้", async ({ page }) => {
  const alerts = catchAlerts(page);
  const input = await openProfileUpload(page);
  await input.setInputFiles(EXE_FILE);
  await page.waitForTimeout(2500);
  expect(alerts().join(" | "), "ต้องบอกว่ารับเฉพาะชนิดไหน").toMatch(/JPG|PNG|WebP|GIF/);
});

test("รูปจริงยังใช้ได้ตามปกติ (ไม่กันจนใช้งานไม่ได้)", async ({ page }) => {
  const alerts = catchAlerts(page);
  const input = await openProfileUpload(page);
  await input.setInputFiles(REAL_PNG);
  await page.waitForTimeout(2500);
  expect(alerts(), `รูปจริงต้องไม่ถูกเตือน (ได้: ${alerts().join(" | ")})`).toEqual([]);
  await expect(page.locator('img[src^="data:"]').first(),
    "รูปจริงต้องถูกนำมาแสดงเป็นรูปโปรไฟล์",
  ).toBeVisible({ timeout: 10_000 });
});

test("กดบันทึกรัวในแท็บเดียว ต้องได้ลูกค้าเป้าหมายเดียว (ตัวกันกดซ้ำยังทำงาน)", async ({ page }) => {
  const company = tg("กดรัว");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();
  const companyInput = page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด");
  const contactInput = page.getByPlaceholder("ชื่อผู้ติดต่อ");
  await companyInput.fill(company);
  await contactInput.fill("คุณทดสอบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69)
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  // ยืนยันว่าค่าติดอยู่ในฟอร์มจริงก่อนกด — ช่องเป็น controlled input ตอนรันขนานหนัก ๆ React อาจยัง
  // ไม่ทัน commit ค่า แล้วกดบันทึกจะติด validation "ต้องระบุชื่อบริษัท" แทนที่จะบันทึก (ไม่มีแถวลง DB เลย)
  // แพตเทิร์นเดียวกับที่ loginUI ใช้กันปัญหานี้อยู่แล้ว
  await expect(companyInput).toHaveValue(company, { timeout: 10_000 });
  await expect(contactInput).toHaveValue("คุณทดสอบ", { timeout: 10_000 });

  const btn = page.getByRole("button", { name: "บันทึก" }).first();
  await Promise.all([0, 1, 2, 3, 4].map(() => btn.click({ force: true, timeout: 5_000 }).catch(() => {})));

  const sb = await db(RYG);
  // รอให้แถวแรกลง DB จริงก่อน แล้วค่อยนับ — ใช้เวลารอแบบตายตัวไม่ได้ เพราะตอนรันหลาย worker
  // การบันทึกช้ากว่าปกติได้ แล้วจะนับได้ 0 แถวทั้งที่ยังไม่ใช่คำตอบสุดท้าย (ไม่เกี่ยวกับเรื่องซ้ำเลย)
  // 60s (มากกว่าค่าเริ่มต้น 25s): เทสต์นี้กดปุ่ม 5 ครั้งรวดจงใจ ทำให้หน้าทำงานหนักกว่าเทสต์อื่น
  // พอรันขนานกับ worker อื่น การเขียนแถวแรกลง DB ช้าเกิน 25s ได้เป็นครั้งคราว (สภาพเครื่องทดสอบ ไม่ใช่บั๊ก)
  await waitRow(sb, "leads", { company }, 60_000);
  await page.waitForTimeout(4_000); // เผื่อแถวที่ 2 (ถ้ามี) ตามมาทีหลัง — ต้องรอถึงจะฟันธงว่าไม่ซ้ำ

  const { data } = await sb.from("leads").select("id").eq("company", company);
  expect(data?.length, "กดรัว 5 ครั้งต้องได้ลูกค้าเป้าหมายเดียว").toBe(1);
});

test("กรอกบริษัทที่มีลูกค้าเป้าหมายอยู่แล้ว ต้องเตือนก่อนกดบันทึก (กันซ้ำจากการเปิดหลายแท็บ)", async ({ page }) => {
  const company = tg("เตือนซ้ำ");
  const sb = await db(RYG);
  // มีลูกค้าเป้าหมายของบริษัทนี้อยู่แล้วในสาขา (เหมือนเพิ่งกดบันทึกไปในอีกแท็บ)
  const { data: seq } = await sb.from("leads").select("num_id").order("num_id", { ascending: false }).limit(1);
  const nextId = Number(seq?.[0]?.num_id ?? 0) + 9001;
  const { error } = await sb.from("leads").insert({ phone: "081-999-0101",
    id: nextId, num_id: nextId, dealer_code: "RYG", company, contact: "คุณทดสอบ",
    status: "WAITING", province: "ระยอง",
  });
  expect(error, `เตรียมลูกค้าเป้าหมายตั้งต้นต้องสำเร็จ (${error?.message ?? ""})`).toBeNull();

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);

  await expect(page.getByText(/มีลูกค้าเป้าหมายชื่อ .* อยู่แล้ว/).first(),
    "ต้องเตือนว่ามีลูกค้าเป้าหมายชื่อนี้อยู่แล้ว — ผู้ใช้จะได้รู้ตัวก่อนกดบันทึกซ้ำ",
  ).toBeVisible({ timeout: 10_000 });

  // เตือนเท่านั้น ห้ามบล็อก — หลายดีลของบริษัทเดียวกันเป็นเรื่องปกติของงานขาย
  await expect(page.getByRole("button", { name: "บันทึก" }).first(),
    "ปุ่มบันทึกต้องยังกดได้ (เตือน ไม่ใช่ห้าม)",
  ).toBeEnabled();
});

test("บริษัทใหม่ที่ไม่ซ้ำ ต้องไม่มีคำเตือน (กันเตือนพร่ำเพรื่อ)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(tg("ไม่ซ้ำแน่นอน-xyz"));
  await page.waitForTimeout(1_500);
  await expect(page.getByText(/มีลูกค้าเป้าหมายชื่อ|เป็นลูกค้าอยู่แล้ว|ชื่อใกล้เคียง/),
    "บริษัทใหม่ต้องไม่ขึ้นคำเตือน",
  ).toHaveCount(0);
  expect(HQ_ORIGIN).toContain("3002"); // กันตั้ง origin ผิดจนเทสต์ผ่านแบบไม่ได้วัดอะไร
});
