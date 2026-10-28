import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors, db, cleanup, specNS, nsTag, ensureSentQuotation } from "./funcHelpers";

// ── ที่อยู่ที่กรอกตอนเป็นลูกค้าเป้าหมาย ต้องตามไปเป็นที่อยู่ของลูกค้าเมื่อปิดการขาย ──
// บอสแจ้ง (19 ส.ค. 69): "ตอนเพิ่มลูกค้าเป้าหมายไม่มีที่อยู่ แต่พอเป็นลูกค้าแล้วมี
//   ตอนกลายเป็นลูกค้าต้องดึงข้อมูลมาจากลูกค้าเป้าหมาย ตอนกรอกข้อมูลต้องกรอกให้ครบ"
// เดิมฟอร์มลูกค้าเป้าหมายไม่มีช่องที่อยู่เลย เซลส์จึงต้องไปตามถามลูกค้าใหม่หลังปิดการขาย
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

const NS = specNS("ADDR");
const tg = nsTag(NS);
const COMPANY = tg("ที่อยู่");
const ADDRESS = "99/1 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง เชียงใหม่ 50200";

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[D2] [func] กรอกที่อยู่ตอนเพิ่มลูกค้าเป้าหมาย → บันทึกลงระบบจริง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);

  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // ทุกช่องต้องเจาะในหน้าต่างเท่านั้น — หน้าข้างหลังมีตัวกรองชื่อ "จังหวัด" เหมือนกัน
  //   เลือกผิดตัว = กรอกไม่ครบ ฟอร์มจึงฟ้อง "กรอกให้ครบก่อนบันทึก: จังหวัด"
  const ฟอร์ม = page.getByRole("dialog").filter({ hasText: "เพิ่มลูกค้าเป้าหมาย" }).first();
  await ฟอร์ม.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await ฟอร์ม.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณสมชาย");
  await ฟอร์ม.getByPlaceholder("0XX-XXX-XXXX").first().fill("081-234-5678");
  await ฟอร์ม.getByLabel("จังหวัด").selectOption({ index: 1 });
  // ช่องที่อยู่ที่เพิ่งเพิ่มเข้ามา — เดิมไม่มีเลย
  await ฟอร์ม.getByPlaceholder(/เลขที่ ถนน ตำบล/).fill(ADDRESS);
  await ฟอร์ม.getByRole("button", { name: "บันทึก" }).click();

  const sb = await db(RYG);
  await expect.poll(async () => {
    const { data } = await sb.from("leads").select("address").eq("company", COMPANY).limit(1);
    return data?.[0]?.address;
  }, { timeout: 20_000, message: "ที่อยู่ที่กรอกต้องลงฐานข้อมูลจริง" }).toBe(ADDRESS);

  assertNoErrors(errs, "กรอกที่อยู่ตอนเพิ่มลูกค้าเป้าหมาย");
});

test("[func] ปิดการขายสำเร็จ → ที่อยู่ตามไปที่ระเบียนลูกค้า ไม่ต้องกรอกซ้ำ", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  // กฎ 19 ส.ค. 69: ปิดการขายสำเร็จไม่ได้ถ้ายังไม่มีใบที่ส่งแล้ว — เทสต์นี้ตรวจเรื่อง "ที่อยู่ตามไปไหม"
  // ไม่ได้ตรวจเรื่องออกใบ จึงจัดฉากให้ผ่านด่านนั้นก่อน
  await ensureSentQuotation(sb, "RYG", COMPANY);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();

  // รอบ 4: ปิดสำเร็จทางเดียว = ลูกค้าตอบรับที่ใบในแท็บใบเสนอราคาของแผงลีด
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.locator("[data-customer-result]").getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page).catch(() => "");

  await expect.poll(async () => {
    const { data } = await sb.from("customers").select("address").eq("company", COMPANY).limit(1);
    return data?.[0]?.address;
  }, { timeout: 25_000, message: "ที่อยู่ของลูกค้าต้องมาจากลูกค้าเป้าหมาย ไม่ใช่ว่างเปล่า" }).toBe(ADDRESS);

  assertNoErrors(errs, "ที่อยู่ตามไปตอนปิดการขาย");
});
