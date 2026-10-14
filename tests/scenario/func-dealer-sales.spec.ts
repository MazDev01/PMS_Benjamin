import { test, expect } from "@playwright/test";
import { กดตกลงในกล่องยืนยัน } from "./helpers";
import { RYG, skipReason } from "./supabaseEnv";
import { settle } from "./helpers";
import {
  DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, waitRow, waitGone, cleanup, specNS, nsTag,
} from "./funcHelpers";

// ── เทสต์เชิงฟังก์ชัน: "กดใช้งานจริงบนหน้าจอ แล้วข้อมูลลง DB จริงไหม" ──
//
// ต่างจากชุดอื่น:
//   • supabase-rls  = ยิง API ตรง พิสูจน์กฎที่ DB (ไม่ผ่านหน้าจอ)
//   • ชุด UI โหมด local = ตรวจการแสดงผล (ไม่แตะ backend)
//   • ชุดนี้        = กดปุ่มบนหน้าจอ → ยืนยันที่ DB → ลบทิ้ง
//
// ทุกเทสต์สร้างข้อมูลของตัวเองแล้วเก็บกวาด เพราะรันกับฐานข้อมูลจริง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" }); // แชร์สมุดงานสาขาเดียวกัน — รันขนานจะกวนกันเอง

// ช่องข้อมูลเฉพาะสเปกนี้ — กัน cleanup ข้ามไปลบข้อมูลของสเปกอื่นที่รันขนานกัน (ดู funcHelpers)
const NS = specNS("SALES");
const tg = nsTag(NS);
const COMPANY = tg("ลูกค้าเป้าหมายวงจร");

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[func] สร้างลูกค้าเป้าหมายผ่านหน้าจอ → ลงฐานข้อมูลจริง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();

  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดสอบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: "บันทึก" }).click();

  // ต้องอยู่ใน DB — ไม่ใช่แค่โผล่บนจอ
  const row = await waitRow<{ company: string; dealer_code: string; status: string }>(
    sb, "leads", { company: COMPANY });
  expect(row.dealer_code, "ลูกค้าเป้าหมายใหม่ต้องเป็นของสาขาที่ล็อกอิน").toBe("RYG");
  expect(row.status, "ลูกค้าเป้าหมายใหม่เริ่มที่ 'ติดต่อแล้ว'").toBe("WAITING");

  assertNoErrors(errs, "สร้างลูกค้าเป้าหมาย");
});

test("[func] แก้ลูกค้าเป้าหมายผ่านหน้าจอ → ค่าใหม่ลงฐานข้อมูล", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const PHONE = "081-999-0001";

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();

  // ต้องค้นหาก่อน — ตารางลูกค้าเป้าหมายแบ่งหน้า และตอนรันชุดเต็มมีลูกค้าเป้าหมายทดสอบของสเปกอื่นบนสาขา RYG เดียวกันเพิ่มเข้ามา
  // ทำให้ลูกค้าเป้าหมายของเราหลุดไปหน้าหลัง แล้วเทสต์ล้มแบบสุ่ม (ไม่ใช่บั๊ก — เป็นการหาผิดที่)
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row, "ลูกค้าเป้าหมายที่สร้างไว้ต้องโผล่ในตาราง").toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();

  // แผงรายละเอียดแก้ในที่เดิม (ไม่มีปุ่มสลับโหมด) — พิมพ์แล้วปุ่มบันทึกถึงจะกดได้
  const phone = page.getByPlaceholder("0XX-XXX-XXXX").first();
  await expect(phone).toBeVisible({ timeout: 10_000 });
  await phone.fill(PHONE);
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).first().click();

  await expect.poll(async () => {
    const { data } = await sb.from("leads").select("phone").eq("company", COMPANY).limit(1);
    return data?.[0]?.phone;
  }, { timeout: 15_000, message: "เบอร์ที่แก้ต้องถูกบันทึกลง DB" }).toBe(PHONE);

  assertNoErrors(errs, "แก้ลูกค้าเป้าหมาย");
});

test("[func] เลื่อนสถานะลูกค้าเป้าหมาย → สถานะใหม่ลงฐานข้อมูล", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();

  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY); // ตารางแบ่งหน้า — ต้องค้นหาก่อน
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: /▾/ }).first().click();
  await page.getByRole("button", { name: "รวบรวมความต้องการ", exact: true }).first().click();

  await expect.poll(async () => {
    const { data } = await sb.from("leads").select("status").eq("company", COMPANY).limit(1);
    return data?.[0]?.status;
  }, { timeout: 15_000, message: "สถานะต้องถูกบันทึกลง DB" }).toBe("BULLET");

  assertNoErrors(errs, "เลื่อนสถานะ");
});

test("[func] ลบลูกค้าเป้าหมายผ่านหน้าจอ → หายจากฐานข้อมูลจริง", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click();

  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY); // ตารางแบ่งหน้า — ต้องค้นหาก่อน
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  await row.getByTitle("ลบลูกค้าเป้าหมาย").first().click();
  await กดตกลงในกล่องยืนยัน(page); // ยืนยันการลบ

  await waitGone(sb, "leads", { company: COMPANY });
  assertNoErrors(errs, "ลบลูกค้าเป้าหมาย");
});

const LOST_COMPANY = tg("otherlost");

test("[func] ปิดการขายไม่สำเร็จ: เลือก “อื่นๆ” แล้วพิมพ์เอง → บันทึกเหตุผลจริง ไม่ใช่ __OTHER__", async ({ page }) => {
  const sb = await db(RYG);
  await cleanup(sb, "RYG", NS);
  const numId = 940000 + (Date.now() % 9000);
  await sb.from("leads").insert({ phone: "081-999-0101",
    id: `#L-${numId}`, num_id: numId, dealer_code: "RYG", company: LOST_COMPANY, name: LOST_COMPANY,
    contact: "t", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET", value: "฿600,000", assigned: "t",
  });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(LOST_COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: LOST_COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
  await page.waitForTimeout(1200);

  await page.getByRole("button", { name: "งาน", exact: true }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /ไม่ได้งาน/ }).first().click();
  await page.waitForTimeout(500);

  const other = page.getByRole("button", { name: /อื่นๆ \(ระบุเอง\)/ });
  await other.first().click();
  await page.waitForTimeout(400);

  // ⚠️ ค่าธง __OTHER__ ห้ามหลุดลง DB — ยังไม่พิมพ์ต้องกดยืนยันไม่ได้
  const confirm = page.getByRole("button", { name: "ยืนยันปิดการขาย" });

  await expect(confirm.first()).toBeDisabled();
  await page.getByPlaceholder("พิมพ์เหตุผล…").fill("ลูกค้าเลื่อนโครงการไปปีหน้า");
  await page.waitForTimeout(300);
  await confirm.first().click();
  await page.waitForTimeout(2500);

  const d = (await sb.from("leads").select("status,lost_reason").eq("company", LOST_COMPANY).single()).data as { status: string; lost_reason: string };
  expect(d.lost_reason).toBe("ลูกค้าเลื่อนโครงการไปปีหน้า");
  await cleanup(sb, "RYG", NS);
});
