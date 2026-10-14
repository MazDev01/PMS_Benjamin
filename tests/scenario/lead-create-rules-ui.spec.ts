import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";

// ── ขายหนึ่งงาน ขั้น 2 บนหน้าจอ: สร้าง Lead — กันชื่อ+เบอร์ซ้ำ · เช็คพื้นที่ (FLOW.html · ด่าน 1) ─────────────────────
//   กฎบังคับที่ฐานข้อมูล (ใบ 0186 / 0195 / 0196 · มีข้อทดสอบยิงตรงฐานแล้ว) — ข้อนี้วัดว่าหน้าจอ "บอกผู้ใช้" เมื่อถูกปฏิเสธ
//   และไม่มีลูกค้าเป้าหมายผีค้างอยู่ในฐาน
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });

const admin = adminClient();
const COMPANY = `ZZTEST-กฎสร้างลูกค้าเป้าหมาย-${Date.now() % 100000}`;
const PHONE = "081-555-0199";
const ล้าง = async () => { await admin.from("leads").delete().eq("dealer_code", "RYG").like("company", "ZZTEST-กฎสร้างลูกค้าเป้าหมาย%"); };
test.beforeAll(async () => {
  await ล้าง();
  const r = await (await db(RYG)).from("leads").insert({
    id: `#L-ZZRULE-${Date.now() % 100000}`, num_id: 977_000_000 + (Date.now() % 99_999), dealer_code: "RYG",
    company: COMPANY, name: COMPANY, phone: PHONE, province: "ระยอง", status: "WAITING",
  });
  if (r.error) throw new Error(r.error.message);
});
test.afterAll(ล้าง);

async function เพิ่มลูกค้าเป้าหมาย(page: Page, company: string, phone: string, province: string) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const กล่อง = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await expect(กล่อง).toBeVisible();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(company);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดสอบ");
  await page.getByPlaceholder("0XX-XXX-XXXX").fill(phone);
  await กล่อง.getByLabel("จังหวัด").first().selectOption(province);
  await page.getByRole("button", { name: "บันทึก" }).click();
}
const จำนวนในฐาน = async (company: string) => (await admin.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", "RYG").eq("company", company)).count ?? -1;

test("[flow·dealer] ขั้น 2: ชื่อ + เบอร์ซ้ำกับงานที่เปิดอยู่ → หน้าจอบอกว่าซ้ำ และไม่มีแถวใหม่ในฐาน", async ({ page }) => {
  await เพิ่มลูกค้าเป้าหมาย(page, COMPANY, "0815550199", "ระยอง");
  await expect(page.getByText(/มีลูกค้าเป้าหมายชื่อและเบอร์โทรนี้เปิดอยู่แล้ว/).first(), "ต้องบอกผู้ใช้ว่าซ้ำ").toBeVisible({ timeout: 20_000 });
  await expect.poll(() => จำนวนในฐาน(COMPANY), { timeout: 10_000 }).toBe(1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  await expect(page.locator("tbody tr").filter({ hasText: COMPANY }), "หน้าจอต้องไม่มีแถวผีหลังรีเฟรช").toHaveCount(1, { timeout: 20_000 });
});

test("[flow·dealer] ขั้น 2: หน้างานอยู่ในพื้นที่ของดีลเลอร์อื่น → หน้าจอบอกเหตุผล และไม่มีแถวในฐาน", async ({ page }) => {
  const อื่น = `${COMPANY}-นอกพื้นที่`;
  await เพิ่มลูกค้าเป้าหมาย(page, อื่น, "081-555-0198", "ชลบุรี");
  await expect(page.getByText(/อยู่ในพื้นที่ของดีลเลอร์อื่น/).first(), "ต้องบอกว่าเป็นพื้นที่ของดีลเลอร์อื่น").toBeVisible({ timeout: 20_000 });
  await expect.poll(() => จำนวนในฐาน(อื่น), { timeout: 10_000 }).toBe(0);
});
