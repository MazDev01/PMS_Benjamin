import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { กดตกลงในกล่องยืนยัน, รอข้อความแจ้งเตือน } from "./helpers";

// ── หน้าดีลเลอร์ของ HQ: จังหวัดทับซ้อน (legacy) + เคลียร์ทีละจังหวัด · ดีลเลอร์ที่จับคู่จังหวัดไม่ได้ (ด่าน 1 · ใบ 0195) ──────
// ข้อตัดสินของบอส 14 ต.ค. 69: "HQ เห็นรายการจังหวัดทับซ้อน เคลียร์ทีละจังหวัด เคลียร์แล้วกฎใช้เต็ม"
//   และดีลเลอร์ที่จังหวัดสะกดไม่ตรงรายชื่อ → รายงาน ไม่เดาจับคู่ (ฐานทดสอบ: BKK = "กรุงเทพฯ")
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });

const admin = adminClient();
const จังหวัด = "ลำพูน";   // ไม่มีดีลเลอร์ในฐานทดสอบ — จำลองการทับซ้อนเดิมของ CNX กับ RYG ด้วยกุญแจฝั่งเซิร์ฟเวอร์ (ป้าย legacy ตั้งได้ทางนี้ทางเดียว)
const ล้าง = async () => { await admin.from("dealer_territories").delete().eq("province", จังหวัด); };
test.beforeAll(async () => {
  await ล้าง();
  const r = await admin.from("dealer_territories").insert([{ province: จังหวัด, dealer_code: "CNX", legacy: true }, { province: จังหวัด, dealer_code: "RYG", legacy: true }]);
  if (r.error) throw new Error(r.error.message);
});
test.afterAll(ล้าง);

test("[hq] เห็นจังหวัดทับซ้อนและดีลเลอร์ที่จับคู่จังหวัดไม่ได้ · เคลียร์ทีละจังหวัด → เหลือรายเดียว กฎใช้เต็ม", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  const การ์ด = page.locator(".card").filter({ hasText: "พื้นที่ทับซ้อน" }).first();
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });

  const แถว = การ์ด.getByRole("row", { name: new RegExp(จังหวัด) });
  await expect(แถว).toContainText("CNX");
  await expect(แถว).toContainText("RYG");
  await expect(การ์ด.getByText(/BKK/), "ดีลเลอร์ที่จังหวัดสะกดไม่ตรงรายชื่อ ต้องขึ้นให้ HQ เห็น").toBeVisible();
  await expect(การ์ด.getByText("กรุงเทพฯ")).toBeVisible();

  await แถว.getByLabel(`ดีลเลอร์ที่ดูแลจังหวัด${จังหวัด}`).selectOption("RYG");
  await แถว.getByRole("button", { name: "เคลียร์" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await รอข้อความแจ้งเตือน(page, new RegExp(`เคลียร์จังหวัด${จังหวัด}แล้ว`));
  await expect(แถว, "เคลียร์แล้วจังหวัดหายจากรายการทับซ้อน").toHaveCount(0, { timeout: 20_000 });

  const { data } = await admin.from("dealer_territories").select("dealer_code, legacy").eq("province", จังหวัด);
  expect(data, "เหลือ RYG รายเดียว ไม่ติดป้าย legacy").toEqual([{ dealer_code: "RYG", legacy: false }]);
  const { data: log } = await admin.from("audit_log").select("action, target").eq("action", "เคลียร์จังหวัดทับซ้อน").like("target", `${จังหวัด}%`);
  expect(log?.length, "ลงบันทึกการใช้งาน").toBeGreaterThan(0);
  assertNoErrors(errs, "หน้าดีลเลอร์ของ HQ");
});
