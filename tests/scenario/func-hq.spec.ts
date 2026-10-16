import { statuses, ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน, ดักข้อความแจ้งเตือน } from "./helpers";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { ลบสาขาทดสอบตรง, adminClient } from "./testDealers";
import {
  HQ_ORIGIN, DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, waitRow, waitGone, TAG, เปิดฟอร์มตั้งดีลเลอร์, เปิดกล่องตั้งดีลเลอร์,
} from "./funcHelpers";

// ฝั่งสำนักงานใหญ่ — ข้อมูลกลางที่ทั้งเครือใช้ร่วมกัน
// รวมถึงบทพิสูจน์สำคัญที่สุดของโมเดล: HQ แก้ที่ :3002 แล้วดีลเลอร์ที่ :3001 เห็นตาม
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const CODE = "ZZT";                      // fixture สำหรับเทสต์ "ตัวกรอง/ลบ" — ใส่ตรง ๆ ใน beforeAll
const DEALER_NAME = `${TAG}-สาขาทดสอบ`;
const NEW_CODE = "ZZC";                  // สร้างผ่าน UI (แยกรหัสกับ fixture กันชน)
const NEW_NAME = `${TAG}-สาขาสร้างใหม่`;

// เก็บกวาดสาขาทดสอบด้วยสิทธิ์เซิร์ฟเวอร์โดยตรง — ไม่ผ่านเส้นทาง "ลบดีลเลอร์" ของระบบ (13 ต.ค. 69)
//   เดิมเรียกเส้นทางนั้น: วันที่เส้นทางพัง สาขาทดสอบค้างในฐาน แล้วข้อทดสอบอื่นที่ไม่เกี่ยวตกตาม (ดู testDealers.ts)
async function purgeDealerAccount(code: string) {
  await ลบสาขาทดสอบตรง(code);
}

test.beforeAll(async () => {
  const sb = await db(ADMIN);
  // ล้างของค้างจากรอบก่อน: NEW_CODE ลบทั้งบัญชี auth+แถว (route) · CODE เป็น fixture ใส่ตรงไม่มี auth
  await purgeDealerAccount(NEW_CODE);
  await sb.from("dealers").delete().in("code", [CODE, NEW_CODE]);
  // fixture: สาขาที่ "มีอยู่แล้ว" สำหรับเทสต์ตัวกรอง/ลบ — ใส่ตรงด้วยสิทธิ์เซิร์ฟเวอร์
  //   บัญชี HQ เพิ่มแถวดีลเลอร์ตรงไม่ได้แล้ว (ต้องมาจากผู้สนใจที่ตอบรับ + ชำระครบ · ฐานข้อมูลบังคับ 0208)
  //   เทสต์ตัวกรอง/ลบไม่ควรผูกกับเรื่องนั้น จึงใช้ทางเดียวกับสคริปต์ลงทะเบียนสาขาตั้งต้น
  const ใส่ = await adminClient().from("dealers").insert({ code: CODE, name: DEALER_NAME, province: "ระยอง", region: "ตะวันออก", status: "active" });
  if (ใส่.error) throw new Error(`ใส่สาขาทดสอบ ${CODE} ไม่สำเร็จ: ${ใส่.error.message}`);
});
test.afterAll(async () => {
  const sb = await db(ADMIN);
  // NEW_CODE: ลบบัญชี auth ที่เทสต์สร้างด้วย (กัน orphan) · แล้วเก็บกวาดแถวที่เหลือ
  await purgeDealerAccount(NEW_CODE);
  await sb.from("dealers").delete().in("code", [CODE, NEW_CODE]);
});

// H5 — สร้างดีลเลอร์ "พร้อมบัญชีเข้าระบบ" ต้องทำผ่าน route เซิร์ฟเวอร์ (service_role)
// เทสต์นี้ทน "ทั้งสองสภาพ" ได้:
//   • ตั้ง service_role แล้ว → โมดัลรหัส + ดีลเลอร์ลง DB จริง (บัญชีล็อกอินได้)
//   • ยังไม่ตั้ง → ต้องขึ้น error จริง และ "ไม่มีดีลเลอร์ผี" ใน DB (เดิมโชว์รหัสปลอมทั้งที่ล็อกอินไม่ได้ = บั๊ก H5)
test("[func·hq] สร้างดีลเลอร์ = สร้างบัญชีจริง (มี key→ลง DB · ไม่มี key→error ไม่ทิ้งดีลเลอร์ผี) (H5)", async ({ page }) => {
  const sb = await db(ADMIN);

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  // ชื่อสาขาอ่านจากฐาน ไม่เขียนตายตัว — ข้อมูลตั้งต้นใช้ชื่อตามสูตร (tests/fixtures/test-baseline.sql · 15 ต.ค. 69)
  const ชื่อRYG = String((await sb.from("dealers").select("name").eq("code", "RYG").single()).data?.name ?? "");
  expect(ชื่อRYG, "ต้องมีสาขา RYG ในฐานทดสอบ").not.toBe("");
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 25_000, message: "ทะเบียนดีลเลอร์ต้องโหลดเสร็จก่อน" }).toContain(ชื่อRYG);
  // ดีลเลอร์ต้องมาจากลูกค้าเป้าหมาย (บอสสั่ง 14 ก.ย. 69) — สร้างผ่านกล่อง "ตั้งเป็นดีลเลอร์"
  const ตั้ง = await เปิดฟอร์มตั้งดีลเลอร์(page, NEW_CODE, NEW_NAME);
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();

  // ผลอย่างใดอย่างหนึ่ง: โมดัลสำเร็จ (มี key) หรือ ข้อความ error ในฟอร์ม (ไม่มี key)
  const okModal = page.getByText("สร้างดีลเลอร์สำเร็จ");
  const errMsg = page.getByText(/service_role|ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์/i);
  await expect(okModal.or(errMsg).first(), "ต้องเห็นผลจริงอย่างใดอย่างหนึ่ง").toBeVisible({ timeout: 25_000 });

  const rows = (await sb.from("dealers").select("code,name").eq("code", NEW_CODE)).data ?? [];
  if (await okModal.isVisible()) {
    expect(rows.length, "ตั้ง key แล้ว → ดีลเลอร์ต้องลง DB").toBe(1);
    expect(rows[0].name).toBe(NEW_NAME);
  } else {
    expect(rows.length, "ไม่มี key → ต้องไม่เหลือดีลเลอร์ผีใน DB (บัญชีล็อกอินไม่ได้)").toBe(0);
  }
});

// H5 — ประตูความปลอดภัยของ route (durable ทั้งสองสภาพ):
//   ไม่มี token = ห้ามผ่านเด็ดขาด · token ของดีลเลอร์ (ไม่ใช่ HQ) ก็ห้ามสร้างดีลเลอร์
//   ตั้ง key แล้ว → 401/403 · ยังไม่ตั้ง → 501 · ทั้งหมดต้อง "ไม่ใช่ 200" และไม่มีสาขาเกิดขึ้น
test("[func·hq] route สร้างดีลเลอร์ปฏิเสธคำขอที่ไม่มีสิทธิ์ (H5)", async ({ request }) => {
  const sb = await db(ADMIN);
  const payload = { code: "ZZX", name: "ทดสอบสิทธิ์", province: "กรุงเทพฯ", region: "กลาง", revenueTarget: 0 };
  try {
    // 1) ไม่มี token
    const noAuth = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, { data: payload });
    expect(noAuth.status(), "ไม่มี token ต้องไม่ผ่าน").not.toBe(200);
    expect(statuses(401), `สถานะที่ยอมรับ (ได้ ${noAuth.status()})`).toContain(noAuth.status());

    // 2) token ของ "ดีลเลอร์" (ไม่ใช่ HQ) — ต้องไม่มีสิทธิ์สร้างดีลเลอร์
    const rygToken = (await (await db(RYG)).auth.getSession()).data.session?.access_token ?? "";
    const asDealer = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
      headers: { authorization: `Bearer ${rygToken}` }, data: payload,
    });
    expect(asDealer.status(), "ดีลเลอร์สร้างดีลเลอร์ไม่ได้").not.toBe(200);
    expect(statuses(403), `สถานะที่ยอมรับ (ได้ ${asDealer.status()})`).toContain(asDealer.status());

    // ไม่ว่ากรณีไหน ต้องไม่มีสาขา ZZX เกิดขึ้น
    const rows = (await sb.from("dealers").select("code").eq("code", "ZZX")).data ?? [];
    expect(rows.length, "คำขอที่ถูกปฏิเสธต้องไม่สร้างสาขา").toBe(0);
  } finally {
    await sb.from("dealers").delete().eq("code", "ZZX");
  }
});

test("[func·hq] สาขาที่เพิ่งเพิ่ม โผล่ในตัวกรองของหน้าอื่นทันที", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);

  // ทะเบียนดีลเลอร์เป็นแหล่งเดียวของทุกหน้า — สาขาใหม่ต้องไม่ตกหล่นที่ไหน
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => page.evaluate(() => document.body.innerText),
    { timeout: 20_000, message: "หน้าดีลเลอร์ต้องเห็นสาขาใหม่" }).toContain(DEALER_NAME);

  assertNoErrors(errs, "สาขาใหม่ในหน้าอื่น");
});

test("[func·hq] ลบดีลเลอร์ผ่านหน้าจอ → หายจาก DB จริง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });   // หน้าเริ่มเป็นการ์ด — ใช้แถวตาราง

  const row = page.locator("tbody tr").filter({ hasText: DEALER_NAME }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  // ข้อความแจ้งเตือนเป็นของระบบ (sonner) ทั้งหมดแล้ว — เก็บไว้ดูสาเหตุถ้าลบไม่ผ่าน
  const ข้อความแจ้ง = ดักข้อความแจ้งเตือน(page);
  const dialogs: string[] = [];
  await row.getByTitle("ลบ").first().click();
  dialogs.push(await กดตกลงในกล่องยืนยัน(page));   // กล่องยืนยันของระบบ (sonner)
  await page.waitForTimeout(2500);
  console.log("กล่องโต้ตอบ:", JSON.stringify([...dialogs, ...ข้อความแจ้ง()]));

  await waitGone(sb, "dealers_directory", { code: CODE }, 20_000);   // อ่านผ่านมุมมอง: ผู้ใช้อ่านตาราง dealers ได้เฉพาะบางคอลัมน์ (ใบ 0091) select * ถูกปฏิเสธ
  assertNoErrors(errs, "ลบดีลเลอร์");
});

// ── VAT เป็นของสาขา ไม่ใช่ของสำนักงานใหญ่ ────────────────────────────────────
// เดิมอัตราภาษีเป็นค่ากลางของทั้งเครือ (สำนักงานใหญ่ตั้ง) แล้วดีลเลอร์ใช้ตาม
// ต่อมาย้ายให้แต่ละสาขาตั้งเอง (ตั้งค่า › ใบเสนอราคา) เพราะจดทะเบียนภาษีคนละแบบกัน
// เทสต์นี้จึงเปลี่ยนหน้าที่: จากเดิม "ค่าต้องไหลลงมา" เป็น "ค่าของสาขาต้องไม่ถูกทับ"
//   ถ้าวันหนึ่งมีใครผูกสองอย่างนี้กลับเข้าหากัน เทสต์นี้จะจับได้ทันที
test("[func·hq→dealer] สำนักงานใหญ่แก้ VAT แล้วต้องไม่ทับค่าที่สาขาตั้งเอง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const { data: before } = await sb.from("hq_policy").select("vat").eq("id", 1).maybeSingle();
  const origVat = (before?.vat as number) ?? 7;
  const newVat = origVat === 7 ? 10 : 7;

  // ค่าที่สาขา RYG ตั้งไว้เอง — คือค่าที่ต้องเห็นบนหน้าจอดีลเลอร์เสมอ
  const dealerSb = await db(RYG);
  const { data: ds } = await dealerSb.from("dealer_settings").select("document").eq("dealer_code", "RYG").maybeSingle();
  const vatของสาขา = (ds?.document as { vatPercent?: number } | null)?.vatPercent ?? 7;

  try {
    const up = await sb.from("hq_policy").update({ vat: newVat }).eq("id", 1).select();
    expect(up.error, `HQ แก้ VAT ไม่ได้: ${JSON.stringify(up.error)}`).toBeNull();

    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "ตั้งค่าใบเสนอราคา" }).first().click();

    // ค่าอยู่ในช่องกรอก ไม่ใช่ข้อความในหน้า — ต้องอ่านจากช่องโดยตรง
    const ช่องVat = page.getByLabel("ภาษีมูลค่าเพิ่ม %");
    await expect(ช่องVat, "หน้าตั้งค่าของดีลเลอร์ต้องโหลดเสร็จ").toBeVisible({ timeout: 20_000 });
    await expect(ช่องVat, "ต้องเห็น VAT ของสาขาตัวเอง ไม่ใช่ค่าที่สำนักงานใหญ่เพิ่งเปลี่ยน")
      .toHaveValue(String(vatของสาขา), { timeout: 20_000 });

    assertNoErrors(errs, "VAT ของสาขาไม่ถูกสำนักงานใหญ่ทับ");
  } finally {
    await sb.from("hq_policy").update({ vat: origVat }).eq("id", 1);
  }
});

test("[func·hq] HQ เปิดหน้างานขายได้ แต่ไม่มีปุ่มสร้าง/แก้/ลบ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await page.evaluate(() => document.body.innerText)).length,
    { timeout: 20_000 }).toBeGreaterThan(100);

  // สิทธิ์ที่ DB ห้าม HQ เขียนงานขายอยู่แล้ว — หน้าจอต้องไม่หลอกให้กด
  for (const label of ["สร้างใบเสนอราคา", "เพิ่มใบเสนอราคา", "ลบใบเสนอราคา"]) {
    expect(await page.getByRole("button", { name: label }).count(),
      `หน้า HQ ต้องไม่มีปุ่ม "${label}"`).toBe(0);
  }

  assertNoErrors(errs, "หน้าใบเสนอราคา HQ");
});

// ── ดีลเลอร์ต้องมาจากลูกค้าเป้าหมายที่สำเร็จแล้วเท่านั้น (บอสสั่ง 14 ก.ย. 69) ──
// แทนเทสต์เดิม "กดเพิ่มดีลเลอร์ก่อนทะเบียนโหลดเสร็จ" — ฟอร์มสร้างดีลเลอร์ตรง ๆ ถูกถอดทั้งอันแล้ว สถานการณ์นั้นเกิดไม่ได้อีก
// (ฝั่งเซิร์ฟเวอร์ที่ปฏิเสธการสร้างโดยไม่ผูกลูกค้าเป้าหมาย ตรวจไว้ที่ hq-prospects.spec.ts)
// ปุ่ม "เพิ่มผ่านลูกค้าเป้าหมาย" ที่เคยลัดไปหน้าลูกค้าเป้าหมาย บอสสั่งเอาออกด้วย ("เอาออกเลย") — หน้านี้ไม่มีปุ่มเพิ่มใด ๆ
test("[func·hq] หน้าดีลเลอร์ไม่มีปุ่มสร้าง/เพิ่มดีลเลอร์เลย", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  // รอให้หน้าโหลดจริงก่อน (ปุ่มส่งออกอยู่แถวเดียวกับที่ปุ่มเพิ่มเคยอยู่) — ไม่งั้นนับปุ่มตอนหน้ายังว่าง แล้วผ่านแบบหลอก
  await expect(page.getByRole("button", { name: /ส่งออก/ }).first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("button", { name: /เพิ่มผ่านลูกค้าเป้าหมาย|^(เพิ่มดีลเลอร์|สร้างดีลเลอร์)$/ }),
    "หน้าดีลเลอร์ต้องไม่มีปุ่มสร้าง/เพิ่มดีลเลอร์").toHaveCount(0);
});

// รีเซ็ตรหัสผ่านผู้ใช้ HQ — เมนู "ส่งลิงก์ทางอีเมล" (H4) เอาออกแล้ว: ปิดอีเมลของระบบล็อกอิน (บอสสั่ง 16 ต.ค. 69 · ใบ 0213)
//   เหลือ "ตั้งรหัสผ่านใหม่ทันที" (ไม่พึ่งอีเมล) · ตรวจซ้ำกับ auth-email-blocked.spec.ts
test("[func·hq] รีเซ็ตรหัสผ่านผู้ใช้ = ตั้งรหัสใหม่ทันที ไม่มีเมนูส่งลิงก์ทางอีเมล", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/users`, { waitUntil: "domcontentloaded" });

  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow, "ต้องมีผู้ใช้ในตาราง").toBeVisible({ timeout: 25_000 });
  await firstRow.getByRole("button", { name: "จัดการ" }).click();
  await expect(page.getByRole("button", { name: /ตั้งรหัสผ่านใหม่ทันที/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /ส่งลิงก์ทางอีเมล/ }), "ต้องไม่มีเมนูส่งลิงก์ทางอีเมล").toHaveCount(0);
});

// H4 — หน้าปลายทางของลิงก์รีเซ็ต: เปิดตรงโดยไม่มี recovery token → ต้องบอกว่าลิงก์ไม่ถูกต้อง (ไม่ค้าง/ไม่พัง)
test("[func·hq] หน้า /reset-password เปิดตรงโดยไม่มี token → แจ้งลิงก์ไม่ถูกต้อง (H4)", async ({ page }) => {
  await page.goto(`${HQ_ORIGIN}/reset-password`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("ลิงก์ไม่ถูกต้องหรือหมดอายุ"), "ไม่มี token ต้องแจ้งลิงก์ไม่ถูกต้อง")
    .toBeVisible({ timeout: 10_000 });
});

// ── กล่องตั้งเป็นดีลเลอร์: ภาคต้องเลือกก่อนจังหวัด (ผู้ใช้แจ้ง 18 ส.ค. 69 · ย้ายจากฟอร์มเพิ่มดีลเลอร์เดิม 14 ก.ย. 69) ──
// เดิมช่อง "ภาค" ตั้งต้นเป็น "กลาง" ให้เองทั้งที่ไม่มีใครเลือก — ดีลเลอร์ภาคอื่นจึงถูกบันทึกเป็นภาคกลางได้ง่าย ๆ
// และเพราะรายการจังหวัดขึ้นกับภาค ถ้ายังไม่เลือกภาคก็เลือกจังหวัดไม่ได้เลย — ต้องบอกให้รู้ ห้ามเงียบ
// ต้องมี "ทุกภาค" ด้วย (บอสสั่ง 14 ก.ย. 69) — เลือกแล้วจังหวัดเป็น "ทุกจังหวัด" ให้เอง
test("[func·hq] กล่องตั้งเป็นดีลเลอร์: ภาคเริ่มที่ “ยังไม่ระบุ” · มีทุกภาค · ไม่เลือกภาค = บันทึกไม่ผ่าน", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const ตั้ง = await เปิดกล่องตั้งดีลเลอร์(page, "ZZR");   // ลูกค้าเป้าหมายไม่มีจังหวัด → ภาคต้องว่าง
  const region = ตั้ง.locator("#cv-region");
  const prov = ตั้ง.locator("#cv-province");

  await expect(region, "ต้องไม่เลือกภาคให้เอง").toHaveValue("");
  expect((await prov.locator("option").allInnerTexts()).join(" "),
    "ยังไม่เลือกภาค → ต้องบอกว่าให้เลือกภาคก่อน").toContain("เลือกภาคก่อน");
  expect((await region.locator("option").allInnerTexts()).join(" "), "ต้องมีตัวเลือกทุกภาค").toContain("ทุกภาค");

  await ตั้ง.locator("#cv-code").fill("ZZR");
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();
  await expect(ตั้ง.getByText(/ต้องเลือกภาคก่อน/),
    "กดบันทึกโดยไม่เลือกภาค → ต้องฟ้อง ห้ามบันทึกผ่าน").toBeVisible();

  await region.selectOption("ทุกภาค");
  await expect(prov, "เลือกทุกภาค → จังหวัดเป็นทุกจังหวัดให้เอง").toHaveValue("ทุกจังหวัด");
  await region.selectOption("เหนือ");
  expect(await prov.locator("option").count(), "เลือกภาคแล้วต้องมีจังหวัดให้เลือก").toBeGreaterThan(1);

  const { error } = await (await db(ADMIN)).from("dealer_prospects").delete().eq("name", `${TAG}-ผู้สนใจ-ZZR`);
  expect(error, "ล้างลูกค้าเป้าหมายทดสอบ").toBeNull();
});

// ── สร้างดีลเลอร์ → ต้องตั้งชื่อบริษัทให้ด้วย (บอสสั่ง 18 ส.ค. 69) ──
// เดิมสาขาใหม่เกิดมาโดยช่อง "ชื่อบริษัท" ว่าง → หัวเอกสาร/แถบบน/เมนูซ้ายตกไปขึ้น "รหัสสาขา"
// ชื่อที่ HQ เห็นกับที่สาขาเห็นจึงไม่ตรงกัน — ผู้ใช้แจ้งจริง
test("[func·hq] สร้างดีลเลอร์ → ชื่อบริษัทของสาขาถูกตั้งให้ตั้งแต่ต้น ไม่ปล่อยว่าง", async ({ page }) => {
  // ⚠️ ห้ามชนรหัสกับ NEW_CODE ของเทสต์ H5 ด้านบน — รันคู่กันแล้วบัญชี auth ชนกัน สร้างไม่ผ่าน
  const CODE = "ZZS", NAME = "ZZ บริษัทชื่อทดสอบ";
  const sb = await db(ADMIN);
  // ต้องลบบัญชี auth ด้วย — ลบแค่แถวในตาราง รอบถัดไปจะสร้างไม่ผ่าน ("อีเมลถูกใช้ไปแล้ว")
  const wipe = async () => {
    await purgeDealerAccount(CODE);
    await sb.from("dealer_settings").delete().eq("dealer_code", CODE);
    await sb.from("dealers").delete().eq("code", CODE);
  };
  await wipe();

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const ตั้ง = await เปิดฟอร์มตั้งดีลเลอร์(page, CODE, NAME);
  await ตั้ง.getByRole("button", { name: "สร้างดีลเลอร์" }).click();

  await expect.poll(async () => {
    const r = (await sb.from("dealer_settings").select("issuer").eq("dealer_code", CODE).maybeSingle()).data as { issuer?: { company?: string } } | null;
    return r?.issuer?.company ?? "";
  }, { timeout: 30_000, message: "ต้องตั้งชื่อบริษัทให้ตั้งแต่ตอนสร้าง" }).toBe(NAME);

  await wipe();
});
