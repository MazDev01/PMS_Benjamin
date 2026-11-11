import { test, expect } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── แดชบอร์ดดีลเลอร์ › การ์ด "งานที่ต้องทำวันนี้" (บอสตอบ 11 พ.ย. 69 · ข้อ ก) ─────────────────────────────────────────────
//   กดหัวการ์ด (ชื่อ · ดูทั้งหมด) หรือแถวใดก็ได้ → ปฏิทินมุมมองวัน "วันนี้" + รายการนัดกรอง "วันนี้" ทันที (ไม่มีหน้าต่างคั่น)
//   ชี้แล้วเป็นรูปมือ · ปุ่มย้อนกลับของเบราว์เซอร์กลับแดชบอร์ด · ไม่เพิ่มกล่องตัวเลข
//   ปฏิทินที่มาจากการ์ดไม่รวมนัดที่ยกเลิก เหมือนการ์ด → จำนวนเท่ากัน · ตัวเลือก "แสดงนัดที่ยกเลิก" กดดูเองได้ (บอสสั่ง 11 พ.ย. 69)
//   ใช้สาขาของข้อ (รหัสสุ่ม ZT…) นัดวันนี้ 4 รายการ + ยกเลิก 1 → การ์ด 4 แถว = ปฏิทิน 4 = ฐาน (ไม่นับยกเลิก) · ติ๊กแสดงยกเลิก = 5
//   ข้อทดสอบอื่นที่รันพร้อมกันไม่กวนจำนวน
//   โค้ดเดิม: กดแล้วไป /calendar มุมมองเดือน ชิปกรอง "ทั้งหมด" · ปฏิทินนับนัดที่ยกเลิกด้วย (5 ≠ การ์ด 4) → ตก
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const admin = adminClient();
let สาขา: สาขาของข้อ | null = null;
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const เลขลูกค้า = 979_600_000 + (Date.now() % 90_000);

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ ชื่อ: "ZZTEST สาขางานวันนี้ (ลบทิ้ง)" });
  const ค = await admin.from("customers").insert({ id: เลขลูกค้า, dealer_code: สาขา.รหัส, name: "คุณลูกค้า", company: `ZZTEST ลูกค้างานวันนี้ ${สาขา.รหัส}`,
    province: "ตราด", phone: "000-000-0601", join_date: วันนี้ });
  expect(ค.error?.message ?? "", "เตรียมลูกค้าของสาขา").toBe("");
  const นัด = ["09:00", "10:00", "11:00", "13:00", "15:00"].map((time, i) => ({
    id: เลขลูกค้า + i,   // appointments ไม่มีเลขอัตโนมัติ (0001) · ลบตามสาขาของข้อตอนจบ
    dealer_code: สาขา!.รหัส, customer_id: เลขลูกค้า, company: `ZZTEST นัดวันนี้ ${i + 1}`, contact: "ผู้ทดสอบ", date: วันนี้, time,
    type: "visit", status: i === 4 ? "cancelled" : "upcoming", note: "",
  }));
  const n = await admin.from("appointments").insert(นัด);
  expect(n.error?.message ?? "", "เตรียมนัดวันนี้ 5 รายการ").toBe("");
});
test.afterAll(async () => { await สาขา?.ลบ(); });

test("[แดชบอร์ดดีลเลอร์] งานที่ต้องทำวันนี้: กดหัวการ์ด/ดูทั้งหมด/แถว → ปฏิทินวันนี้ · จำนวนตรงฐาน · รูปมือ · ย้อนกลับได้", async ({ page }) => {
  const รหัส = สาขา!.รหัส;
  const นับที่ฐาน = async (รวมยกเลิก: boolean) => {
    const q = admin.from("appointments").select("id", { count: "exact", head: true }).eq("dealer_code", รหัส).eq("date", วันนี้);
    return (await (รวมยกเลิก ? q : q.neq("status", "cancelled"))).count;
  };
  const นัดวันนี้ที่ฐาน = await นับที่ฐาน(false);
  expect(นัดวันนี้ที่ฐาน, "นัดวันนี้ของสาขา ไม่นับยกเลิก").toBe(4);
  expect(await นับที่ฐาน(true), "รวมนัดที่ยกเลิก").toBe(5);

  await loginUI(page, DEALER_ORIGIN, "/dashboard", สาขา!.บัญชี);
  const การ์ด = page.locator("[data-card='today-tasks']");
  const แถวการ์ด = การ์ด.locator("[data-today-task]");
  await expect(แถวการ์ด, "การ์ด = นัดวันนี้ไม่นับยกเลิก (4)").toHaveCount(นัดวันนี้ที่ฐาน!, { timeout: 30_000 });
  const บนการ์ด = await แถวการ์ด.count();

  const จุดกด = [
    ["ชื่อการ์ด", () => การ์ด.locator("[data-act='today-tasks-head']")],
    ["ดูทั้งหมด", () => การ์ด.getByRole("button", { name: "ดูทั้งหมด" })],
    ["แถวแรก", () => การ์ด.locator("[data-today-task]").first()],
    ["แถวสุดท้าย", () => การ์ด.locator("[data-today-task]").last()],
  ] as const;
  for (const [ชื่อ, ที่] of จุดกด) {
    await expect(ที่(), `${ชื่อ}: เห็น`).toBeVisible({ timeout: 30_000 });
    expect(await ที่().evaluate(e => getComputedStyle(e).cursor), `${ชื่อ}: ชี้แล้วเป็นรูปมือ`).toBe("pointer");
    await ที่().click();
    await page.waitForURL(/\/calendar/, { timeout: 30_000 });
    await settle(page);
    await expect(page.locator("[data-view='day']"), `${ชื่อ}: มุมมองวัน`).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
    const ชิปวันนี้ = page.locator("[data-group-chip='today']");
    await expect(ชิปวันนี้, `${ชื่อ}: รายการนัดกรอง "วันนี้"`).toHaveAttribute("aria-pressed", "true");
    const ติ๊ก = page.locator("[data-act='show-cancelled'] input[type='checkbox']");
    await expect(ติ๊ก, `${ชื่อ}: มาจากการ์ด = ไม่แสดงนัดที่ยกเลิก`).not.toBeChecked();
    await expect(ชิปวันนี้, `${ชื่อ}: จำนวนนัดวันนี้ในปฏิทิน = บนการ์ด`).toHaveAttribute("data-count", String(บนการ์ด), { timeout: 20_000 });
    await expect(page.locator(`[data-day-list='${วันนี้}']`), `${ชื่อ}: รายการวันนี้ = บนการ์ด`).toHaveAttribute("data-count", String(บนการ์ด));
    await expect(page.getByText("ZZTEST นัดวันนี้ 5"), `${ชื่อ}: นัดที่ยกเลิกไม่โผล่`).toHaveCount(0);
    if (ชื่อ === "ชื่อการ์ด") {
      // กดดูเองได้: ติ๊ก "แสดงนัดที่ยกเลิก" → รวมนัดที่ยกเลิก (5) · เอาติ๊กออก → กลับ 4
      await ติ๊ก.check();
      await expect(ชิปวันนี้, "ติ๊กแสดงนัดที่ยกเลิก = รวมยกเลิก").toHaveAttribute("data-count", String(await นับที่ฐาน(true)));
      await expect(page.locator(`[data-day-list='${วันนี้}']`)).toHaveAttribute("data-count", String(await นับที่ฐาน(true)));
      await ติ๊ก.uncheck();
      await expect(ชิปวันนี้).toHaveAttribute("data-count", String(บนการ์ด));
    }
    await expect(page.getByRole("dialog"), `${ชื่อ}: ไม่มีหน้าต่างเด้งคั่น`).toHaveCount(0);
    await page.goBack();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(แถวการ์ด).toHaveCount(บนการ์ด, { timeout: 30_000 });
  }
});
