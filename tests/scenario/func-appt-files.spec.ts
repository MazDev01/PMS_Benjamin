import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RYG, skipReason } from "./supabaseEnv";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import {
  DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, waitRow, cleanup, specNS, nsTag,
} from "./funcHelpers";

// นัดหมาย + ไฟล์แนบ — สองส่วนสุดท้ายของงานดีลเลอร์ที่ยังไม่มีเทสต์เชิงฟังก์ชัน
// ไฟล์เป็นกรณีพิเศษ: ต้องขึ้น Supabase Storage จริง ไม่ใช่แค่แถวใน DB
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

// ช่องข้อมูลเฉพาะสเปกนี้ — กัน cleanup ข้ามไปลบข้อมูลของสเปกอื่นที่รันขนานกัน (ดู funcHelpers)
const NS = specNS("APPT");
const tg = nsTag(NS);
const CUSTOMER = tg("นัดหมาย");

// cleanup() ล้างทั้งแถว files และไบต์ใน Storage ให้แล้ว (ดู funcHelpers) · ลบเฉพาะช่อง NS
// ⚠️ นัดหมายของข้อแรกติดป้ายไว้ที่ "หมายเหตุ" เท่านั้น ซึ่ง cleanup() ไม่ได้กวาด (กวาดตามบริษัท/จังหวัด)
//    เดิมแถวจึงค้างสะสมทุกรอบ แล้วข้อทดสอบไปหยิบ "แถวเก่าจากรอบก่อน" มาตรวจแทนแถวที่เพิ่งสร้าง
//    = ตรวจเลขนัดของรอบเก่า ไม่มีวันตก (พบ 13 ต.ค. 69 ตอนจงใจทำให้เลขนัดเป็นเลขเวลาแล้วข้อนี้ยังผ่าน)
//    แก้ 2 ชั้น: กวาดตามหมายเหตุทั้งก่อนและหลัง + หมายเหตุมีเลขประจำรอบ แถวเก่าจับคู่ไม่ได้อีก
const กวาดนัดของสเปก = async () => {
  const sb = await db(RYG);
  await sb.from("appointments").delete().eq("dealer_code", "RYG").like("note", `%${NS}%`);
};
const NOTE = `นัดทดสอบอัตโนมัติ ${CUSTOMER} #${Date.now()}`;
test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); await กวาดนัดของสเปก(); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); await กวาดนัดของสเปก(); });

test("[func] สร้างนัดหมายผ่านหน้าจอ → ลง DB ของสาขา", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);

  // รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 6): ลงนัดได้จากแผงลีดที่เดียว — ปฏิทินดู/ทำเสร็จ/ยกเลิกอย่างเดียว
  const ลีดนัด = tg("ลีดลงนัด");
  const เลข = 979_600_000 + (Date.now() % 90_000);
  const ins = await sb.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: ลีดนัด, name: ลีดนัด,
    phone: "0810000998", province: "ระยอง", status: "WAITING" });
  expect(ins.error).toBeNull();
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/calendar`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByRole("button", { name: "เพิ่มกิจกรรม" }), "ปฏิทินไม่มีปุ่มลงนัดแล้ว").toHaveCount(0);

  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ลีดนัด);
  await page.locator("tbody tr").filter({ hasText: ลีดนัด }).first().getByTitle("ดูรายละเอียด").click({ timeout: 20_000 });
  await page.getByRole("button", { name: "ประวัติ", exact: true }).first().click();
  await page.getByRole("button", { name: /เพิ่มนัดหมาย/ }).click();
  // ประเภทนัดหมาย = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — เริ่มที่ "ยังไม่ระบุ" · จังหวัดมาจากลีด (ไม่มีช่องพิมพ์)
  await page.getByLabel("ประเภทนัดหมาย").selectOption({ index: 1 });
  const note = page.getByPlaceholder("บันทึกเพิ่มเติม");
  await expect(note, "ฟอร์มนัดหมายต้องเปิด").toBeVisible({ timeout: 10_000 });
  await note.fill(NOTE);
  await page.getByRole("button", { name: /บันทึกนัดหมาย/ }).click();

  // ตามหาแถวด้วย "หมายเหตุ" แทนจังหวัด (จังหวัดเลือกจากรายการแล้ว ใส่ป้ายทดสอบไม่ได้)
  const row = await waitRow<{ dealer_code: string; id: number }>(
    sb, "appointments", { note: NOTE }, 20_000);
  expect(row.dealer_code, "นัดใหม่ต้องเป็นของสาขาที่ล็อกอิน").toBe("RYG");
  // เลขต้องมาจากตัวนับของ DB (next_entity_id) ไม่ใช่ Date.now()
  // ค่าจาก Date.now() เป็นเลข 13 หลัก (~1.7e12) — เลขนับของสาขาต้องเล็กกว่ามาก
  expect(row.id, "เลขนัดต้องมาจากตัวนับของสาขา").toBeGreaterThan(0);
  // เกณฑ์เดิม 1,000,000 ต่ำกว่าเลขของข้อมูลตั้งต้นในฐานทดสอบ (9936xxxxx) — ตัวนับต้องออกเลขถัดจากนั้น จึงเกินเกณฑ์ทั้งที่ถูก
  //   (พบ 13 ต.ค. 69) · timestamp เป็นเลข 13 หลัก เกณฑ์ 12 หลักยังแยกสองอย่างออกจากกันได้ชัด
  expect(row.id, "เลขนัดต้องไม่ใช่ timestamp (Date.now)").toBeLessThan(100_000_000_000);

  assertNoErrors(errs, "สร้างนัดหมาย");
});

test("[func] แนบไฟล์ที่ลูกค้าเป้าหมาย → ไบต์ขึ้น Storage และมีแถวใน DB", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("ลูกค้าเป้าหมายไฟล์");
  // .pdf ไม่ใช่ .txt — ระบบรับเฉพาะ PDF/Word/Excel/PowerPoint/CAD/รูปภาพ (uploadLimits.ts)
  const FILENAME = `${NS}-เอกสารทดสอบ.pdf`;

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  // ต้องมีลูกค้าเป้าหมายก่อน — การแนบไฟล์อยู่ในลิ้นชักรายละเอียดลูกค้าเป้าหมาย ไม่ใช่หน้าคลังไฟล์
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณไฟล์");
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

  // ส่วน "ไฟล์" อยู่ท้ายลิ้นชัก · ปุ่มอาจยังไม่อยู่ในระยะมองเห็น แต่ input มีอยู่ใน DOM แล้ว
  // (input ถูกซ่อนไว้โดยตั้งใจ — ปุ่มเป็นตัวสั่งเปิดหน้าต่างเลือกไฟล์)
  // ตัวที่ไม่มี accept คือช่องแนบไฟล์ทั่วไป · ที่มี accept="image/*" คือช่องอัปโหลดโลโก้
  const fileInput = page.locator('input[type="file"]:not([accept])').first();
  await expect(fileInput, "ลิ้นชักลูกค้าเป้าหมายต้องมีช่องแนบไฟล์").toBeAttached({ timeout: 15_000 });
  await fileInput
    .setInputFiles({ name: FILENAME, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 benjamin test") });

  // แถว metadata ต้องลง DB
  const f = await waitRow<{ dealer_code: string; storage_path: string | null }>(
    sb, "files", { name: FILENAME }, 25_000);
  expect(f.dealer_code, "ไฟล์ต้องเป็นของสาขาที่ล็อกอิน").toBe("RYG");

  // และไบต์ต้องอยู่ใน Storage จริง — ไม่ใช่ metadata ลอย ๆ
  expect(f.storage_path, "ต้องมีพาธไฟล์ใน Storage").toBeTruthy();
  expect(f.storage_path!.startsWith("RYG/"),
    "พาธต้องขึ้นต้นด้วยรหัสสาขา (Storage RLS คุมด้วยชื่อโฟลเดอร์)").toBe(true);
  const signed = await sb.storage.from("dealer-files").createSignedUrl(f.storage_path!, 60);
  expect(signed.error, `ดึงไฟล์จาก Storage ไม่ได้: ${JSON.stringify(signed.error)}`).toBeNull();

  assertNoErrors(errs, "แนบไฟล์ที่ลูกค้าเป้าหมาย");
});

// เปิดลิ้นชักลูกค้าเป้าหมายที่ชื่อ company แล้วคืน locator ช่องแนบไฟล์ (ใช้ซ้ำในเทสต์ไฟล์ล้มเหลว)
async function openLeadFileInput(page: Page, sb: SupabaseClient, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณไฟล์ล้ม");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();
  await waitRow(sb, "leads", { company });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const row = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  const input = page.locator('input[type="file"]:not([accept])').first();
  await expect(input, "ลิ้นชักลูกค้าเป้าหมายต้องมีช่องแนบไฟล์").toBeAttached({ timeout: 25_000 });
  return input;
}

// H1 — อัปโหลดล้มเหลว "ต้องดัง" และ "ไม่ทิ้งไฟล์ผี"
// เดิม .catch(()=>null) กลืน error ของ Storage แล้วบันทึก metadata ต่อ → ไฟล์โผล่ในรายการ
// เหมือนสำเร็จ แต่ไบต์ไม่เคยถูกเก็บ ปุ่มดาวน์โหลดหายเฉย ๆ โดยไม่มีคำอธิบาย
test("[func] อัปโหลดไฟล์ล้มเหลว → ขึ้นแถบเตือน + ไม่เหลือ metadata ผีใน DB (H1)", async ({ page }) => {
  const sb = await db(RYG);
  const COMPANY = tg("ไฟล์อัปล้ม");
  const FILENAME = `${NS}-อัปโหลดล้ม.pdf`;

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const fileInput = await openLeadFileInput(page, sb, COMPANY);

  // บังคับให้ Storage ปฏิเสธการอัปโหลด (จำลอง RLS/quota/เน็ตหลุด) — ต้องดักก่อนแนบไฟล์
  await page.route(/\/storage\/v1\/object\/|\/api\/v1\/storage(\?|$)/, (r) =>
    r.request().method() === "POST"
      ? r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "forced upload fail" }) })
      : r.continue());

  await fileInput.setInputFiles({ name: FILENAME, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 x") });

  // 1) ล้มเหลวต้องดัง — แถบเตือนกลางของ AppShell
  // (กรอง hasText: Next.js มี div role=alert ซ่อนไว้อีกตัว (__next-route-announcer__) จะชน strict mode)
  await expect(page.getByRole("alert").filter({ hasText: "บันทึกไม่สำเร็จ" }),
    "อัปโหลดล้มต้องขึ้นแถบเตือน").toBeVisible({ timeout: 15_000 });

  // 2) ต้องไม่มีแถว metadata ผีค้างใน DB
  await page.waitForTimeout(1500); // เผื่อ add ยิงตามหลัง (ต้องไม่เกิดขึ้น)
  const rows = (await sb.from("files").select("id").eq("dealer_code", "RYG").eq("name", FILENAME)).data ?? [];
  expect(rows.length, "อัปโหลดล้มแล้วต้องไม่เหลือไฟล์ผีใน DB").toBe(0);
});

// H2 — ลบไบต์ไม่สำเร็จ ต้อง "ไม่ลบ metadata" (ไม่งั้นเหลือไบต์กำพร้าที่อ้างไม่ถึง)
test("[func] ลบไฟล์แต่ลบไบต์ไม่สำเร็จ → ยังคง metadata ไว้ + ขึ้นแถบเตือน (H2)", async ({ page }) => {
  const sb = await db(RYG);
  const COMPANY = tg("ไฟล์ลบล้ม");
  const FILENAME = `${NS}-ลบไบต์ล้ม.pdf`;

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const fileInput = await openLeadFileInput(page, sb, COMPANY);

  // แนบไฟล์จริง (สำเร็จ) — ต้องมีทั้งแถวใน DB และไบต์ใน Storage ก่อน
  await fileInput.setInputFiles({ name: FILENAME, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 benjamin") });
  const f = await waitRow<{ id: number; storage_path: string | null }>(sb, "files", { name: FILENAME }, 20_000);
  expect(f.storage_path, "ต้องอัปโหลดไบต์สำเร็จก่อน").toBeTruthy();

  // รอบ 4 (บอสตัดสิน ข้อ 4): ลบไฟล์ได้ที่แผงลีด/แผงลูกค้าเท่านั้น (หน้าไฟล์ดูอย่างเดียว) และต้องยืนยันก่อน
  //   ไฟล์ยังโผล่ในหน้าคลังไฟล์ (ดู) แต่ไม่มีปุ่มลบที่นั่น
  await page.goto(`${DEALER_ORIGIN}/files`, { waitUntil: "domcontentloaded" });
  // ⚠️ ตารางไฟล์แบ่งหน้า — ค้นหาก่อนเสมอ (กติกา check-paginated-lookup)
  await page.getByPlaceholder("ค้นหาไฟล์ / โอกาสการขาย...").fill(FILENAME);
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "ไฟล์ต้องโผล่ในคลัง" }).toContain(FILENAME);
  await expect(page.getByRole("button", { name: "ลบ", exact: true }), "หน้าคลังไฟล์ไม่มีปุ่มลบ").toHaveCount(0);
  // กลับแผงลีดเดิม → แท็บประวัติ (รายการไฟล์อยู่ที่นั่น)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().getByTitle("ดูรายละเอียด").click({ timeout: 25_000 });
  await page.getByRole("button", { name: "ประวัติ", exact: true }).first().click();

  // บังคับให้ Storage ปฏิเสธการลบไบต์ (DELETE) — การลบ metadata ต้องไม่เกิดขึ้นตาม
  await page.route(/\/storage\/v1\/object\/|\/api\/v1\/storage(\?|$)/, (r) =>
    r.request().method() === "DELETE"
      ? r.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ message: "forced delete fail" }) })
      : r.continue());

  await page.getByRole("button", { name: `ลบไฟล์ ${FILENAME}`, exact: true }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);

  // 1) ล้มเหลวต้องดัง (กรอง hasText เลี่ยง __next-route-announcer__ ที่ก็เป็น role=alert)
  await expect(page.getByRole("alert").filter({ hasText: "บันทึกไม่สำเร็จ" }),
    "ลบไบต์ล้มต้องขึ้นแถบเตือน").toBeVisible({ timeout: 15_000 });

  // 2) metadata ต้องยังอยู่ (ไม่ลบทิ้งทั้งที่ไบต์ยังลบไม่ได้)
  await page.waitForTimeout(1500);
  const still = (await sb.from("files").select("id").eq("id", f.id)).data ?? [];
  expect(still.length, "ลบไบต์ไม่สำเร็จ ต้องไม่ลบ metadata ทิ้ง").toBe(1);
});

// หมายเหตุความครอบคลุม — ยังไม่ได้เทสต์:
//   • "นัดที่บันทึกไว้แสดงบนปฏิทิน" — เขียนแล้วแต่หาไม่เจอบนหน้าจอ
//     ลองทั้งกด "วันนี้" (เพราะวันนี้ของระบบตรึงที่ 30 มิ.ย. 2569 คนละเดือนกับนาฬิกาจริง)
//     และกดเลือกวันที่ ก็ยังไม่เจอ · ยังแยกไม่ได้ว่าเป็นเทสต์เลือก selector ผิด
//     หรือปฏิทินไม่แสดงนัดจริง — ต้องตรวจด้วยตาก่อน ไม่เดา
//   • แก้/ลบนัดหมายผ่านหน้าจอ
//   • แท็บการแจ้งเตือนในหน้าตั้งค่าดีลเลอร์
