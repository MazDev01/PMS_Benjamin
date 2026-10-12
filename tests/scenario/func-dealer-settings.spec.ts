import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { settle } from "./helpers";
import {
  DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors, db, tagged,
} from "./funcHelpers";

// ตั้งค่าของสาขา — เรื่องที่ "หายทั้งหมดเมื่อล้างเบราว์เซอร์" ก่อนย้ายมาไว้ที่ DB
// เทสต์ชุดนี้พิสูจน์ว่ากดบันทึกแล้วลง dealer_settings จริง ไม่ใช่อยู่แค่ในเครื่อง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

// พิมพ์ลงฟอร์มที่โหลดค่าจาก DB แบบ async
// ค่าตั้งต้นของฟอร์มบังเอิญเท่ากับค่าที่โหลดมา → ดู "นิ่ง" ตั้งแต่แรกทั้งที่ยังโหลดไม่เสร็จ
// พอผลโหลดมาถึง setForm ทับสิ่งที่พิมพ์ + รีเซ็ต baseline → ปุ่มบันทึกไม่เปิด
// จึงต้องกรอกแล้ว "ยืนยันว่าค่ายังอยู่" ถ้าโดนทับก็กรอกซ้ำ (กติกาเดียวกับตอนล็อกอิน)
async function fillWhenSettled(box: import("@playwright/test").Locator, value: string) {
  const page = box.page();
  await settle(page);
  for (let i = 0; i < 8; i++) {
    await box.fill(value);
    await page.waitForTimeout(700);
    if (await box.inputValue() === value) {
      await page.waitForTimeout(700);
      if (await box.inputValue() === value) return;
    }
  }
  throw new Error(`กรอกค่า "${value}" ไม่ติด — ถูกผลการโหลดทับตลอด`);
}

// ปุ่มบันทึกกลางเปิดเมื่อฟอร์ม dirty — ต้องรอ React ประมวลผลการพิมพ์ก่อน ไม่ใช่กดทันที
async function clickSave(page: import("@playwright/test").Page) {
  const btn = page.getByRole("button", { name: "บันทึก" }).first();
  await expect(btn, "ปุ่มบันทึกต้องเปิดหลังแก้ค่า").toBeEnabled({ timeout: 10_000 });
  await btn.click();
}

// เก็บค่าเดิมไว้คืนหลังเทสต์ — รันกับสาขาจริง ห้ามทิ้งค่าทดสอบไว้
let original: Record<string, unknown> | null = null;

test.beforeAll(async () => {
  const sb = await db(RYG);
  const { data } = await sb.from("dealer_settings").select("*").eq("dealer_code", "RYG").maybeSingle();
  original = data ?? null;
});
test.afterAll(async () => {
  const sb = await db(RYG);
  if (original) await sb.from("dealer_settings").upsert(original, { onConflict: "dealer_code" });
  else await sb.from("dealer_settings").delete().eq("dealer_code", "RYG");
});

test("[func] แก้ข้อมูลบริษัท (หัวกระดาษ) → ลง dealer_settings", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tagged("บริษัทหัวกระดาษ");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "บัญชีดีลเลอร์" }).first().click();

  // ช่องชื่อบริษัทอยู่บนสุดของแท็บ — ระบุด้วย label ที่มองเห็น
  const nameBox = page.getByPlaceholder("บริษัท ตัวอย่าง จำกัด").first();
  await expect(nameBox).toBeVisible({ timeout: 10_000 });
  await fillWhenSettled(nameBox, COMPANY);
  await clickSave(page);

  await expect.poll(async () => {
    const { data } = await sb.from("dealer_settings").select("issuer").eq("dealer_code", "RYG").maybeSingle();
    return (data?.issuer as { company?: string } | undefined)?.company;
  }, { timeout: 15_000, message: "ชื่อบริษัทต้องถูกบันทึกลง DB" }).toBe(COMPANY);

  assertNoErrors(errs, "แก้ข้อมูลบริษัท");
});

test("[func] ค่าที่บันทึกไว้ ยังอยู่หลังเปิดหน้าใหม่ (ไม่ได้อยู่แค่ในเครื่อง)", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const { data } = await sb.from("dealer_settings").select("issuer").eq("dealer_code", "RYG").maybeSingle();
  const saved = (data?.issuer as { company?: string } | undefined)?.company;
  expect(saved, "ต้องมีค่าที่เทสต์ก่อนหน้าบันทึกไว้").toBeTruthy();

  // เปิดด้วย context ใหม่ = เหมือนเปิดคนละเครื่อง (localStorage เปล่า)
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "บัญชีดีลเลอร์" }).first().click();

  // ค่าใน <input> ไม่อยู่ใน innerText — ต้องอ่านจาก value ของช่องโดยตรง
  await expect.poll(async () => page.getByPlaceholder("บริษัท ตัวอย่าง จำกัด").first().inputValue(),
    { timeout: 20_000, message: "ชื่อบริษัทจาก DB ต้องโผล่ในฟอร์ม" }).toBe(saved!);

  assertNoErrors(errs, "โหลดค่าที่บันทึก");
});

// คำนำหน้าเลขที่ใบเสนอราคาเป็นค่าของระบบ — ดีลเลอร์แก้ไม่ได้แล้ว (เดิมพิมพ์เองได้ จึงมีสาขาพิมพ์
// "Q-CNX-2026-" ทับ แล้วได้เลขซ้อน Q-CNX-2026-CNX-2026-0001 เพราะ RPC ต่อรหัสสาขา+ปีให้อยู่แล้ว)
test("[func] คำนำหน้าเลขที่ใบเสนอราคาถูกล็อก + ตรงรูปแบบ Q-{สาขา}-{ปี}-", async ({ page }) => {
  const errs = watchErrors(page);
  const expected = `Q-RYG-${new Date().getFullYear()}-`;

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตั้งค่าใบเสนอราคา" }).first().click();

  const prefixBox = page.getByTestId("quote-prefix");
  await expect(prefixBox).toBeVisible({ timeout: 10_000 });
  await expect(prefixBox, "คำนำหน้าต้องเป็นรูปแบบที่ระบบออกให้").toHaveText(expected);

  // ห้ามมีช่องพิมพ์คำนำหน้าเหลืออยู่ — ล็อกแล้วต้องล็อกจริง ไม่ใช่แค่ทำให้ดูเป็นสีเทา
  await expect(page.getByPlaceholder("Q-")).toHaveCount(0);

  // ตัวอย่างเลขที่ถัดไปต้องขึ้นต้นด้วยคำนำหน้าเดียวกัน (ไม่ซ้อนรหัสสาขา/ปีสองรอบ)
  const preview = page.locator("text=ตัวอย่างเลขที่ถัดไป").locator("xpath=..");
  await expect(preview).toContainText(expected);

  assertNoErrors(errs, "คำนำหน้าเลขที่ล็อก");
});

test("[func] ทะเบียนพนักงานขายจาก DB → เลือกได้ในฟอร์มลูกค้าเป้าหมาย", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const PERSON = tagged("พนักงาน");

  try {
    // ใส่พนักงานผ่าน repo โดยตรง แล้วพิสูจน์ว่า "ฟอร์มลูกค้าเป้าหมายอ่านจากทะเบียนจริง"
    // (การกดเพิ่มผ่านโมดัลในหน้าตั้งค่า ยังไม่ได้คลุมในชุดนี้ — ดูหมายเหตุท้ายไฟล์)
    const ins = await sb.from("responsible_persons")
      .insert({ dealer_code: "RYG", name: PERSON, title: "ทดสอบ", active: true }).select();
    expect(ins.error, `เพิ่มพนักงานไม่ได้: ${JSON.stringify(ins.error)}`).toBeNull();

    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();

    await expect.poll(async () => page.evaluate(() => document.body.innerText),
      { timeout: 20_000, message: "ชื่อพนักงานจากทะเบียนต้องโผล่ในฟอร์มลูกค้าเป้าหมาย" }).toContain(PERSON);

    assertNoErrors(errs, "ทะเบียนพนักงาน");
  } finally {
    await sb.from("responsible_persons").delete().eq("dealer_code", "RYG").like("name", "%ZZTEST%");
  }
});

// หมายเหตุความครอบคลุม — ยังไม่ได้เทสต์ผ่านหน้าจอ:
//   • กดเพิ่ม/แก้/ลบพนักงานผ่านโมดัลในหน้าตั้งค่า (คลุมเฉพาะฝั่งอ่าน)
//   • อัปโหลดโลโก้/ตราประทับ/ลายเซ็น (ต้องมีไฟล์จริง)
//   • แท็บการแจ้งเตือน
