import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { open } from "./helpers";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

// ── โมดัลต้องใช้คีย์บอร์ดได้จริง ────────────────────────────────────────────────
//
// คนที่ใช้คีย์บอร์ดอย่างเดียว (หรือโปรแกรมอ่านหน้าจอ) เจอปัญหาเดิม 3 อย่าง:
//   • กด Escape ปิดโมดัลไม่ได้ ต้องเล็งเมาส์ไปคลิก X เท่านั้น
//   • กด Tab แล้วโฟกัสหลุดออกไปอยู่กับปุ่มที่อยู่ "ข้างหลัง" โมดัล — กดของที่มองไม่เห็น
//   • ปิดโมดัลแล้วโฟกัสหายไปต้นหน้า ต้อง Tab ไล่ใหม่ทั้งหน้า
test.setTimeout(120_000);

test("[a11y] ลิ้นชักใบเสนอราคาฝั่ง HQ — Esc ปิดได้ และ Tab ไม่หลุดออกนอกลิ้นชัก", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  // แถวเปิดด้วยปุ่ม "ดู" ที่อยู่ในแถว (ClickableRow ก็เปิดได้ แต่ปุ่มชัดเจนกว่าและไม่ชนกับปุ่มอื่นในแถว)
  // ⚠️ ต้อง exact — ตารางอันดับดีลเลอร์บนหน้าเดียวกันมีปุ่มชื่อ "ดูรายละเอียดดีลเลอร์"
  //    ซึ่งชื่อขึ้นต้นเหมือนกัน ถ้าไม่ระบุ exact จะไปกดปุ่มนั้นแล้วเด้งออกจากหน้านี้
  //    (hq-quotations.spec.ts เตือนกับดักนี้ไว้แล้ว)
  const viewBtn = page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).first();
  await viewBtn.waitFor({ state: "visible", timeout: 30_000 });
  await viewBtn.click();

  const dialog = page.locator('[role="dialog"]').first();
  await expect(dialog, "กดปุ่มดูแล้วต้องเปิดลิ้นชัก").toBeVisible({ timeout: 15_000 });
  await expect(dialog, "ลิ้นชักต้องประกาศตัวเป็นหน้าต่างซ้อน (aria-modal) ให้โปรแกรมอ่านหน้าจอรู้")
    .toHaveAttribute("aria-modal", "true");

  // โฟกัสต้องอยู่ในลิ้นชักตั้งแต่เปิด ไม่ใช่ค้างอยู่ข้างหลัง
  await expect.poll(async () => dialog.evaluate((el, ) => el.contains(document.activeElement)),
    { timeout: 5_000, message: "เปิดโมดัลแล้วโฟกัสต้องย้ายเข้ามาในโมดัล" }).toBe(true);

  // กด Tab หลายครั้ง โฟกัสต้องยังวนอยู่ข้างใน
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  expect(await dialog.evaluate(el => el.contains(document.activeElement)),
    "กด Tab วนแล้วโฟกัสต้องไม่หลุดออกไปนอกโมดัล").toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog, "กด Escape ต้องปิดโมดัลได้").toBeHidden({ timeout: 10_000 });
});

test("[a11y] โมดัลเพิ่มผู้ใช้ HQ — Esc ปิดได้", async ({ page }) => {
  await open(page, "hq", "/hq/users");
  const addBtn = page.getByRole("button", { name: "เพิ่มผู้ใช้งาน HQ" }).first();
  await addBtn.waitFor({ state: "visible", timeout: 30_000 });
  await addBtn.click();

  const dialog = page.getByRole("dialog", { name: "ฟอร์มผู้ใช้ HQ" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(dialog, "กด Escape ต้องปิดฟอร์มได้").toBeHidden({ timeout: 10_000 });
});

test("[a11y] ฟอร์มข้อมูลดีลเลอร์ (HQ) — Esc ปิดได้ และประกาศตัวเป็นหน้าต่างซ้อน", async ({ page }) => {
  // ปุ่มแก้ไขย้ายจากแถวทะเบียนมาหน้ารายละเอียดดีลเลอร์ (บอสตัดสิน 19 ต.ค. 69 · รอบ 2 ช่วง ข)
  await open(page, "hq", "/hq/dealers/RYG");
  const editBtn = page.getByRole("button", { name: "แก้ไขข้อมูลดีลเลอร์" });
  await editBtn.waitFor({ state: "visible", timeout: 30_000 });
  await editBtn.click();

  const dialog = page.getByRole("dialog", { name: "ฟอร์มข้อมูลดีลเลอร์" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog, "กด Escape ต้องปิดฟอร์มได้").toBeHidden({ timeout: 10_000 });
});

// ⚠️ ของที่ตรวจเปลี่ยนไปแล้ว (บอสสั่ง 28 ส.ค. 69): หน้าต่าง "ดูตัวอย่างไฟล์" ถูกเอาออกทั้งอัน
//    ตอนนี้กดปุ่ม "เปิดอ่าน" แล้วไฟล์เปิดในแท็บใหม่ด้วยตัวอ่านของเบราว์เซอร์เอง — ไม่มีหน้าต่างในระบบให้ปิด
//    กติกาที่ต้องกันไว้เหมือนเดิมคือ "หน้าต่างของหน้าไฟล์ต้องปิดด้วย Esc ได้" จึงย้ายมาตรวจที่หน้าต่างแก้ไขไฟล์
//    (เทสต์เปลี่ยนตามข้อกำหนดใหม่ ไม่ใช่แก้เพื่อให้ผ่าน)
test("[a11y] หน้าไฟล์ (ดีลเลอร์) ดูอย่างเดียว — ไม่มีหน้าต่างแก้ไขไฟล์ค้าง", async ({ page }) => {
  // เทสต์สร้างไฟล์ของตัวเอง — เดิมยืมไฟล์จากข้อมูลตั้งต้น พอฐานไม่มีไฟล์ก็ตกทั้งที่ระบบไม่ได้พัง
  // (เจอตอนย้ายมารันฐานในเครื่อง 1 ก.ย. 69 ซึ่งข้อมูลตั้งต้นไม่มีทะเบียนไฟล์)
  const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ชื่อไฟล์ = "ZZTEST-a11y-ไฟล์ทดสอบ.pdf";
  await admin.from("files").delete().eq("name", ชื่อไฟล์);
  const { error: fileErr } = await admin.from("files").insert({
    dealer_code: "RYG", name: ชื่อไฟล์, size: "12 KB", ext: "pdf", category: "อื่นๆ",
    project: "—", uploaded_by: "ทดสอบระบบ", uploaded_at: new Date().toISOString().slice(0, 10), source: "upload",
  });
  expect(fileErr, `สร้างไฟล์สำหรับทดสอบไม่สำเร็จ: ${fileErr?.message ?? ""}`).toBeNull();

  try {
  // รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 6): หน้าไฟล์ดูอย่างเดียว — ไม่มีปุ่มแก้ไข/อัปโหลด/ลบ และไม่มีหน้าต่างของหน้าไฟล์ให้ค้างอีก
  //   (ไฟล์เปิดอ่านในแท็บใหม่ · แก้/ลบไฟล์ที่แผงลีด/ลูกค้า) — ตรวจว่าไฟล์ยังโผล่ให้ดู และไม่มีทางเปิดหน้าต่างแก้ไขค้างไว้
  await open(page, "dealer", "/files");
  await page.getByPlaceholder("ค้นหาไฟล์ / โอกาสการขาย...").fill(ชื่อไฟล์);
  await expect(page.getByText(ชื่อไฟล์).first(), "ไฟล์ยังแสดงให้ดูในหน้าไฟล์").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "แก้ไข", exact: true }), "หน้าไฟล์ไม่มีปุ่มแก้ไขแล้ว").toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "แก้ไขข้อมูลไฟล์" }), "ไม่มีหน้าต่างแก้ไขไฟล์").toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog"), "ไม่มีหน้าต่างค้างบนหน้าไฟล์").toHaveCount(0);
  } finally {
    await admin.from("files").delete().eq("name", ชื่อไฟล์);
  }
});

test("[a11y] หัวคอลัมน์เรียงลำดับ — กดด้วยคีย์บอร์ดได้ และบอกทิศทางการเรียง", async ({ page }) => {
  // เดิมเป็น <th onClick> เฉย ๆ: Tab ไปไม่ถึง (คนใช้คีย์บอร์ดเรียงตารางไม่ได้เลย)
  // และโปรแกรมอ่านหน้าจอไม่รู้ว่าตอนนี้เรียงจากมากไปน้อยหรือน้อยไปมาก
  await open(page, "dealer", "/quotations");
  const sortBtn = page.getByRole("button", { name: /^เรียงตาม/ }).first();
  await sortBtn.waitFor({ state: "visible", timeout: 30_000 });

  const th = page.locator("th").filter({ has: sortBtn }).first();
  const before = await th.getAttribute("aria-sort");
  expect(before, "หัวคอลัมน์ต้องประกาศสถานะการเรียง (aria-sort)").not.toBeNull();

  // กดด้วยคีย์บอร์ดล้วน — โฟกัสแล้วกด Enter ต้องสลับทิศทางได้จริง
  await sortBtn.focus();
  expect(await sortBtn.evaluate(el => el === document.activeElement),
    "หัวคอลัมน์ต้องโฟกัสด้วยคีย์บอร์ดได้").toBe(true);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);

  const after = await th.getAttribute("aria-sort");
  expect(after, `กด Enter แล้วทิศทางการเรียงต้องเปลี่ยน (ก่อน=${before} หลัง=${after})`).not.toBe(before);
});
