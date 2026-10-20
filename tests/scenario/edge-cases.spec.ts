import { test, expect } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { ลบสาขาทดสอบตรง } from "./testDealers";
import { settle } from "./helpers";
import {
  DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, waitRow, cleanup, specNS, nsTag, เปิดฟอร์มตั้งดีลเลอร์
} from "./funcHelpers";

// เก็บกวาดสาขาทดสอบด้วยสิทธิ์เซิร์ฟเวอร์โดยตรง — ไม่ผ่านเส้นทาง "ลบดีลเลอร์" ของระบบ (13 ต.ค. 69)
//   เดิมเรียกเส้นทางนั้น: วันที่เส้นทางพัง สาขาทดสอบค้างในฐาน แล้วข้อทดสอบอื่นที่ไม่เกี่ยวตกตาม (ดู testDealers.ts)
async function purgeDealerAccount(code: string) {
  await ลบสาขาทดสอบตรง(code);
}

// ลบผู้ใช้ HQ "พร้อมบัญชี auth" ผ่าน route (service_role) — เดียวกับ purgeDealerAccount แต่คนละ endpoint
// route ลบด้วย id (ไม่ใช่ email) — ต้องหา id จาก profiles ก่อน · profiles ไม่มีคอลัมน์ email
// (อยู่ที่ auth.users เท่านั้น อ่านตรงไม่ได้ด้วยสิทธิ์ authenticated) จึงจับคู่ด้วย name แทน
async function purgeHQUsersByName(name: string) {
  const sb = await db(ADMIN);
  const token = (await sb.auth.getSession()).data.session?.access_token ?? "";
  const { data } = await sb.from("profiles").select("id").eq("name", name);
  for (const row of data ?? []) {
    await fetch(`${HQ_ORIGIN}/api/admin/users?id=${row.id}`, {
      method: "DELETE", headers: { authorization: `Bearer ${token}` },
    }).catch(() => { /* best-effort cleanup */ });
  }
}

// ── Edge Case / การใช้งานผิดวิธี — ทดสอบว่าระบบพังไหมเมื่อผู้ใช้ป้อนข้อมูลชายขอบ/ผิดปกติ ──
// โฟกัส: ค่าติดลบ, ข้อความยาวผิดปกติ, อักขระพิเศษ/emoji, กดบันทึกซ้ำเร็ว ๆ (double-submit)
// ไม่ใช่การทดสอบความปลอดภัย (แยกไปแล้วที่ func อื่น) — ที่นี่เน้น "ไม่มีข้อมูลเพี้ยน/ซ้ำ/แครช"
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("EDGE");
const tg = nsTag(NS);

const NEW_DEALER_CODE = "ZZEDG"; // รหัสดีลเลอร์ทดสอบเฉพาะไฟล์นี้ (แยกจาก func-hq.spec.ts กันชน) — ต้อง A–Z 2–5 ตัว

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); await purgeDealerAccount(NEW_DEALER_CODE); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); await purgeDealerAccount(NEW_DEALER_CODE); });

// ⚠️ เกณฑ์ข้อนี้เข้มขึ้นเมื่อ 10 ส.ค. 69 — เดิมยอมให้บันทึกผ่านตราบใดที่ไม่มีเลขติดลบลง DB
//   (ของที่กรอกไปจะกลายเป็น "฿0" เงียบ ๆ) ซึ่งพอเจอในการใช้งานจริงแล้วไม่ดีพอ:
//   เซลส์ไม่รู้ว่ามูลค่าหายไป แล้วลูกค้าเป้าหมายนั้นก็ไปโผล่ในรายงานยอดขายเป็นศูนย์
//   ตอนนี้ต้อง "ฟ้องแล้วไม่บันทึก" — เทสต์นี้จึงเปลี่ยนตามพฤติกรรมที่ตั้งใจให้เป็น
//   (ไม่ได้แก้เทสต์เพื่อให้ผ่าน — แก้เพราะข้อกำหนดเปลี่ยน และมีเทสต์เฉพาะเรื่องนี้เพิ่มไว้ที่
//    form-shows-what-it-saves.spec.ts ด้วย)
// ข้อ "มูลค่าประเมินติดลบ/ข้อความมั่ว → ต้องฟ้อง" เลิกแล้ว: ไม่มีช่องให้พิมพ์มูลค่า (บอสตัดสิน 19 ต.ค. 69 ข้อ 5: ช่องประเมินราคาเอาออกจากหน้าเว็บทุกที่ · มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223))
//   การไม่มีช่องตรวจที่ form-shows-what-it-saves.spec.ts · lead-value-estimate.spec.ts · new-deal-form.spec.ts

test("[edge] ชื่อบริษัทยาวผิดปกติ (2000 ตัวอักษร) → ไม่พัง, เปิดดูได้ปกติ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const LONG = tg("ยาว") + "ก".repeat(2000);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(LONG);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณยาว");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();

  const row = await waitRow<{ company: string }>(sb, "leads", { company: LONG });
  assertNoErrors(errs, "ชื่อบริษัทยาว 2000 ตัวอักษร");
  expect(row.company.length, "ความยาวที่เก็บจริงใน DB").toBeGreaterThan(1000);

  // เปิดตารางแล้วต้องไม่พัง (ไม่ล้นจอ ไม่แครช) แม้มีชื่อยาวผิดปกติปนอยู่
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ต้องค้นหาก่อนเสมอ — ตารางลูกค้าเป้าหมายแบ่งหน้า และตอนรันทั้งชุดพร้อมกัน สเปกอื่นสร้างลูกค้าเป้าหมายใหม่ของสาขา
  // เดียวกันแทรกเข้ามาตลอด (เรียงใหม่สุดขึ้นก่อน) แถวของเทสต์นี้จึงถูกดันตกหน้าแรกไปเป็นครั้งคราว
  // → ตกด้วยข้อความ "ไม่เจอแถว" ทั้งที่ข้อมูลอยู่ครบ · กับดักเดียวกับที่แก้ไปแล้ว 6 จุดเมื่อ 6 ส.ค. 69
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(tg("ยาว"));
  await expect(page.locator("tbody tr").filter({ hasText: tg("ยาว") }).first()).toBeVisible({ timeout: 15_000 });
});

test("[edge] อักขระพิเศษ/emoji/แท็ก HTML ในชื่อบริษัท → เก็บและแสดงผลปลอดภัย ไม่รันเป็นโค้ด", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const WEIRD = tg("แปลก") + " <b>bold</b> \"quote\" 'apos' & 🏗️🔥 日本語";

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(WEIRD);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณแปลก");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();

  const row = await waitRow<{ company: string }>(sb, "leads", { company: WEIRD });
  assertNoErrors(errs, "อักขระพิเศษ/emoji/HTML ในชื่อบริษัท");
  expect(row.company).toBe(WEIRD); // เก็บลง DB ตรงเป๊ะ ไม่ถูกกรอง/escape ผิดที่ชั้นเขียน

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();
  // ค้นหาก่อนเสมอ — ตารางลูกค้าเป้าหมายแบ่งหน้า ตอนรันชุดเต็มมีลูกค้าเป้าหมายของสเปกอื่นบนสาขา RYG เดียวกันเพิ่มเข้ามา
  // ลูกค้าเป้าหมายของเราถูกดันไปหน้าหลัง แล้วเทสต์ล้มแบบสุ่มทั้งที่ระบบทำงานถูก (เป็นการหาผิดที่ ไม่ใช่บั๊ก)
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(tg("แปลก"));
  const rowLoc = page.locator("tbody tr").filter({ hasText: tg("แปลก") }).first();
  await expect(rowLoc).toBeVisible({ timeout: 15_000 });
  // ต้องไม่มี <b> จริงเรนเดอร์เป็น bold — ต้องเห็นเป็นข้อความ "<b>bold</b>" ตรง ๆ (escape ถูกต้อง)
  await expect(rowLoc.locator("b")).toHaveCount(0);
});

test("[edge] กดปุ่มบันทึกซ้ำเร็ว ๆ (double-submit) → สร้างลูกค้าเป้าหมายแค่ 1 แถว ไม่ซ้ำ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("กดซ้ำ");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณกดซ้ำ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });

  const saveBtn = page.getByRole("button", { name: "บันทึก" });
  // ยิง pointerdown ตรง ๆ ผ่าน dispatchEvent 5 ครั้งรัว ๆ ในจังหวะเดียว (เร็วกว่าที่ React จะ re-render
  // ปุ่มเป็น disabled ทัน) — จำลองผู้ใช้กระวนกระวายกดซ้ำ/ดับเบิลคลิก ให้ตรงกว่าการเรียก .click() ของ
  // Playwright เอง (ซึ่งรอ actionability ทีละครั้ง จึงไม่มีทางยิงชนกันจริงเหมือนนิ้วผู้ใช้กดรัว)
  const btnHandle = await saveBtn.elementHandle();
  await page.evaluate((el) => {
    for (let i = 0; i < 5; i++) el?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, btnHandle);

  await waitRow(sb, "leads", { company: COMPANY });
  await page.waitForTimeout(3000); // เผื่อเวลาให้คำขอซ้ำ (ถ้ามี) ไปถึง DB ก่อนนับ
  const { data, error } = await sb.from("leads").select("id").eq("dealer_code", "RYG").eq("company", COMPANY);
  if (error) throw new Error(error.message);
  assertNoErrors(errs, "กดบันทึกซ้ำเร็ว ๆ");
  expect(data?.length, `จำนวนแถวลูกค้าเป้าหมายที่สร้างจริงจากการกด ${COMPANY}`).toBe(1);
});

test("[edge] พื้นที่ (ตร.ม.) ติดลบผ่าน fill() ตรง ๆ (ข้าม min=0 ของ browser) → ไม่พัง, ไม่เก็บค่าติดลบ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("พื้นที่ติดลบ");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณพื้นที่ลบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  // type=number min=0 กัน spinner ได้ แต่ fill() เขียนค่าตรง ๆ ผ่าน DOM (จำลอง paste ค่าติดลบ)
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("-999");
  await page.getByRole("button", { name: "บันทึก" }).click();

  const row = await waitRow<{ area: number | null }>(sb, "leads", { company: COMPANY });
  assertNoErrors(errs, "พื้นที่ติดลบผ่าน fill() ตรง ๆ");
  expect(row.area ?? 0, `ค่าพื้นที่ที่บันทึกจริงใน DB: ${row.area}`).toBeGreaterThanOrEqual(0);
});

test("[edge] กดปุ่ม 'เพิ่มงานขาย' (ดีลใหม่จากลูกค้าเดิม) ซ้ำเร็ว ๆ → สร้างดีลแค่ 1 ใบ ไม่ซ้ำ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("ดีลกดซ้ำ");

  // ต้องมีลูกค้าจริงก่อน — สร้างตรงผ่าน DB (เร็วกว่าไล่ผ่านฟอร์ม Lead→Won เต็มขั้น ไม่ใช่ประเด็นที่ทดสอบ)
  // id ลูกค้าไม่มี default — ออกผ่าน RPC atomic ต่อสาขาเหมือนที่แอปเรียกจริง (next_entity_id)
  const { data: nid, error: nidErr } = await sb.rpc("next_entity_id", { p_dealer: "RYG", p_entity: "customers" });
  if (nidErr) throw new Error(`ออกเลขลูกค้าไม่สำเร็จ: ${nidErr.message}`);
  const { data: cust, error: cErr } = await sb.from("customers").insert({
    id: nid, dealer_code: "RYG", name: "คุณดีลกดซ้ำ", company: COMPANY, province: "ระยอง",
    category: "โกดังสำเร็จรูป", status: "active",
  }).select("id").single();
  if (cErr) throw new Error(`สร้างลูกค้าตั้งต้นไม่สำเร็จ: ${cErr.message}`);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  // ตารางแบ่งหน้า — ตอนรันชุดเต็ม สเปกอื่นเพิ่มข้อมูลของสาขาเดียวกันแทรกเข้ามาตลอด ต้องค้นหาก่อน
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(COMPANY);
  const custRow = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(custRow).toBeVisible({ timeout: 15_000 });
  await custRow.click();
  // "เพิ่มงานขายใหม่" เป็นทั้งชื่อแท็บ (เสมอมองเห็น) และปุ่มเปิดฟอร์มจริงในเนื้อหาแท็บนั้น (โผล่เฉพาะตอน
  // เลือกแท็บนี้แล้ว) — ต้องคลิกแท็บ (ตัวแรกใน DOM) ก่อน แล้วค่อยคลิกปุ่มจริง (ตัวที่สอง) ที่โผล่ตามมา
  await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).first().click();
  const newDealBtn = page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).last();
  await expect(newDealBtn).toBeVisible({ timeout: 10_000 });
  await newDealBtn.click();

  const saveBtn = page.getByRole("button", { name: "เพิ่มงานขาย", exact: true });
  await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
  const btnHandle = await saveBtn.elementHandle();
  await page.evaluate((el) => {
    for (let i = 0; i < 5; i++) el?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, btnHandle);

  await page.waitForURL(/\/leads\?open=/, { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(2500); // เผื่อเวลาให้คำขอซ้ำ (ถ้ามี) ไปถึง DB ก่อนนับ
  assertNoErrors(errs, "กดเพิ่มงานขายซ้ำเร็ว ๆ");
  const { data: leadsFound, error: lErr } = await sb.from("leads").select("id").eq("dealer_code", "RYG").eq("company", COMPANY);
  if (lErr) throw new Error(lErr.message);
  expect(leadsFound?.length, `จำนวนดีล(ลูกค้าเป้าหมาย)ที่สร้างจริงจากลูกค้า ${COMPANY}`).toBe(1);

  await sb.from("leads").delete().eq("dealer_code", "RYG").eq("company", COMPANY);
  await sb.from("customers").delete().eq("id", cust!.id as number);
});

// ข้อ "แก้ 'มูลค่า' ลีดเดียวกันพร้อมกัน 2 แท็บ" เลิกแล้ว: ช่องมูลค่าในตารางแก้เองไม่ได้ (บอสตัดสิน 19 ต.ค. 69 ข้อ 5: ช่องประเมินราคาเอาออกจากหน้าเว็บทุกที่ · มูลค่าลีด = ยอดใบเสนอราคาล่าสุด (ใบ 0223))
//   มูลค่าฐานคิดเองจากใบล่าสุดทุกครั้ง (คำนวณใหม่จากใบจริง ไม่สะสม) — ตรวจที่ supabase/tests/lead_quote_value.sql

test("[edge·hq] กดปุ่ม 'สร้างดีลเลอร์' ซ้ำเร็ว ๆ → สร้างดีลเลอร์แค่ 1 ราย ไม่ซ้ำ (ไม่มีบัญชี auth กำพร้า)", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  // ดีลเลอร์ต้องมาจากลูกค้าเป้าหมาย (บอสสั่ง 14 ก.ย. 69) — กดรัวที่ปุ่ม "สร้างดีลเลอร์" ของเส้นทางใหม่
  const ตั้ง = await เปิดฟอร์มตั้งดีลเลอร์(page, NEW_DEALER_CODE, tg("ดีลเลอร์กดซ้ำ"));

  const saveBtn = ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" });
  await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
  const btnHandle = await saveBtn.elementHandle();
  await page.evaluate((el) => {
    for (let i = 0; i < 5; i++) el?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, btnHandle);

  // สร้างบัญชีจริงผ่าน API route (service_role) — รอนานกว่าปกติเพราะมีขั้นสร้าง auth user ด้วย
  // อ่านผ่าน dealers_directory (view) ไม่ใช่ตาราง dealers ตรง ๆ — ตาราง base ถูก revoke SELECT grant
  // โดยตรงแล้ว (0091_dealers_revoke_table_grant) แอปจริงก็อ่านผ่าน view นี้เท่านั้นเหมือนกัน
  await waitRow(sb, "dealers_directory", { code: NEW_DEALER_CODE }, 25_000);
  await page.waitForTimeout(3000); // เผื่อเวลาให้คำขอซ้ำ (ถ้ามี) ไปถึง DB/สร้าง auth user ซ้ำก่อนนับ
  // ไม่เรียก assertNoErrors ตรงนี้ — คำขอที่ 2-5 "ควร" โดนปฏิเสธด้วย 400 (รหัสดีลเลอร์ซ้ำ) นี่คือพฤติกรรม
  // ที่ถูกต้อง (มี unique constraint กันไว้ที่ระดับเซิร์ฟเวอร์แล้ว ต่างจากฟอร์มเพิ่มลูกค้าเป้าหมาย/ลูกค้าที่ไม่มี
  // การกันชนธรรมชาติแบบนี้) สิ่งที่ต้องยืนยันจริงคือ "จำนวนแถวสุดท้าย" ต้องเป็น 1 เท่านั้น ไม่ใช่ "ไม่มี error เลย"
  const dup400s = errs.filter(e => e.includes("[http 400]") && e.includes("/api/admin/dealers")).length;
  console.log(`[info] คำขอสร้างดีลเลอร์ที่ถูกปฏิเสธเพราะรหัสซ้ำ (พฤติกรรมที่ถูกต้อง): ${dup400s} ครั้ง`);

  const { data: dealerRows, error: dErr } = await sb.from("dealers_directory").select("code").eq("code", NEW_DEALER_CODE);
  if (dErr) throw new Error(dErr.message);
  expect(dealerRows?.length, `จำนวนแถวดีลเลอร์ที่สร้างจริงจากรหัส ${NEW_DEALER_CODE}`).toBe(1);

  // เช็คบัญชี auth ไม่กำพร้าซ้ำ — นับจาก profiles ที่ผูกกับรหัสสาขานี้ (สร้างคู่กับ auth user เสมอ)
  const { data: profileRows, error: pErr } = await sb.from("profiles").select("id").eq("dealer_code", NEW_DEALER_CODE);
  if (pErr) throw new Error(pErr.message);
  expect(profileRows?.length, `จำนวนบัญชีผู้ใช้ (auth+profile) ที่สร้างจริงสำหรับ ${NEW_DEALER_CODE}`).toBe(1);
});

test("[edge·hq] กดปุ่ม 'บันทึก' (เพิ่มผู้ใช้งาน HQ) ซ้ำเร็ว ๆ → สร้างบัญชีแค่ 1 ราย ไม่ซ้ำ", async ({ page }) => {
  const sb = await db(ADMIN);
  const NAME = tg("ผู้ใช้กดซ้ำ");
  const EMAIL = `zzedge-user-${Date.now()}@benjamin.co.th`;
  await purgeHQUsersByName(NAME); // กันของค้างจากรอบก่อนที่ล้มกลางคัน

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/users`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มผู้ใช้งาน HQ" }).click();
  await page.getByPlaceholder("ชื่อ", { exact: true }).fill(NAME);
  await page.getByPlaceholder("name@benjamin.co.th").fill(EMAIL);
  // บทบาท = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — เริ่มที่ "ยังไม่ระบุ" จึงต้องเลือกเอง
  //   ⚠️ "แผนก" ไม่ใช่ช่องให้เลือกอีกแล้ว — ผูกกับบทบาท เลือกบทบาทแล้วแผนกมาเอง (บอสสั่งฟิก 3 ก.ย. 69)
  //   เทสต์เดิมยังสั่ง selectOption ที่ช่องแผนกอยู่ จึงล้มตั้งแต่ก่อนถึงสิ่งที่ตั้งใจจะตรวจ (แก้ 7 ก.ย. 69)
  await page.getByRole("dialog").getByLabel("บทบาท", { exact: true }).selectOption({ index: 1 });

  const saveBtn = page.getByRole("button", { name: "บันทึก" });
  await expect(saveBtn).toBeEnabled({ timeout: 10_000 });
  const btnHandle = await saveBtn.elementHandle();
  await page.evaluate((el) => {
    for (let i = 0; i < 5; i++) el?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, btnHandle);

  // สร้างบัญชีจริงผ่าน API route (service_role) — รอนานกว่าปกติเพราะมีขั้นสร้าง auth user ด้วย
  // profiles ไม่มีคอลัมน์ email (อยู่ที่ auth.users เท่านั้น) จับคู่ด้วย name (ติดแท็กไม่ซ้ำ) แทน
  await waitRow(sb, "profiles", { name: NAME }, 25_000);
  await page.waitForTimeout(3000); // เผื่อเวลาให้คำขอซ้ำ (ถ้ามี) ไปถึง DB ก่อนนับ
  // เช่นเดียวกับดีลเลอร์ — อีเมลควรมี unique constraint ตามธรรมชาติที่ระดับ auth อยู่แล้ว
  // สิ่งที่ต้องยืนยันจริงคือ "จำนวนบัญชีสุดท้าย" ต้องเป็น 1 เท่านั้น

  const { data: profileRows, error: pErr } = await sb.from("profiles").select("id").eq("name", NAME);
  if (pErr) throw new Error(pErr.message);
  expect(profileRows?.length, `จำนวนบัญชีผู้ใช้ HQ ที่สร้างจริงจากชื่อ ${NAME}`).toBe(1);

  await purgeHQUsersByName(NAME);
});

test("[edge] พิมพ์เหตุผลปิดไม่สำเร็จแบบมีวรรคกลางคำ (พิมพ์จริงทีละตัวอักษร) → วรรคต้องไม่หาย", async ({ page }) => {
  // regression: ช่องพิมพ์เหตุผลเอง ("อื่นๆ (ระบุเอง)") เดิมใช้ value={reason.trim()} — trim ทุก re-render
  // ไม่ใช่แค่ตอนบันทึก ทำให้วรรคที่เพิ่งพิมพ์เสร็จ (อยู่ท้ายสตริงชั่วขณะ) ถูกลบทิ้งก่อนกดตัวอักษรถัดไป
  // พิมพ์ด้วย .fill() ตรวจไม่เจอ (ยิงค่าเต็มทีเดียว) ต้องพิมพ์จริงทีละตัวด้วย pressSequentially ถึงจะจำลองบั๊กได้
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const COMPANY = tg("วรรคหาย");
  const CUSTOM_REASON = "ราคา สูง เกินไป";

  const { error: insErr } = await sb.from("leads").insert({ phone: "081-999-0101",
    id: `${COMPANY}`, dealer_code: "RYG", company: COMPANY, contact: "คุณวรรคหาย",
    province: "ระยอง", product: "โกดังสำเร็จรูป", status: "WAITING", value: "฿1,000,000",
    assigned: "—", source: "เว็บไซต์",
  });
  if (insErr) throw new Error(`สร้างลูกค้าเป้าหมายตั้งต้นไม่สำเร็จ: ${insErr.message}`);

  try {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "ตาราง" }).click();
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY); // กันเคสตกหน้าอื่นของ pagination
    const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator("button.badge").click();
    await page.getByRole("button", { name: "ปิดการขายไม่สำเร็จ", exact: true }).click();

    const otherBtn = page.getByRole("button", { name: "อื่นๆ (ระบุเอง)" });
    await expect(otherBtn).toBeVisible({ timeout: 10_000 });
    await otherBtn.click();

    const input = page.getByPlaceholder("พิมพ์เหตุผล…");
    await expect(input).toBeVisible({ timeout: 5_000 });
    await input.pressSequentially(CUSTOM_REASON, { delay: 40 });
    await expect(input, "วรรคกลางคำต้องไม่หายระหว่างพิมพ์จริง (ไม่ใช่แค่ตอน .fill() ทีเดียว)").toHaveValue(CUSTOM_REASON);

    await page.getByRole("button", { name: "ยืนยันปิดการขาย" }).click();
    await expect.poll(async () =>
      (await sb.from("leads").select("lost_reason").eq("id", COMPANY).single()).data?.lost_reason,
      { timeout: 15_000, message: "เหตุผลที่บันทึกใน DB ต้องมีวรรคกลางคำครบ ไม่ถูกตัดคำติดกัน" },
    ).toBe(CUSTOM_REASON);
    assertNoErrors(errs, "พิมพ์เหตุผลปิดไม่สำเร็จแบบมีวรรคกลางคำ");
  } finally {
    await sb.from("leads").delete().eq("id", COMPANY);
  }
});
