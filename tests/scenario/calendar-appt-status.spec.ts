import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI, specNS, nsTag } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";

// ── ปฏิทิน: นัดเลยกำหนดที่ยังเปิด ปิดได้ · นัดที่ยกเลิกแล้วไม่นับ "เลยกำหนดยังไม่ปิด" (ตารางเทียบ FLOW รอบ 5 แถว D19 · 28 ต.ค. 69) ──
//   FLOW /calendar: D7 นัดหมาย (ดู/ทำเสร็จ/ยกเลิก · สร้างที่แผงลีด)
//   เดิม: แผงนัดรู้จักแค่สถานะ "upcoming" — นัดสถานะอื่นที่ฐานเก็บ (เช่น "scheduled") ขึ้นป้าย "ยกเลิก" และไม่มีปุ่มทำเสร็จ/ยกเลิกนัด
//         การ์ด "เลยกำหนดยังไม่ปิด" (ฐาน 0246 + รายการใต้การ์ด) นับนัดที่ยกเลิกแล้วด้วย → แก้ที่ mock.ts นัดยังเปิด() + ใบ 0253
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(180_000);

const tg = nsTag(specNS("CALST"));
const admin = adminClient();
const เลข = [979_400_000 + (Date.now() % 90_000), 979_500_000 + (Date.now() % 90_000)];
const ยังเปิด = tg("นัดเลยกำหนดยังเปิด"), ยกเลิกแล้ว = tg("นัดเลยกำหนดยกเลิกแล้ว");
const ล้าง = () => admin.from("appointments").delete().in("id", เลข);
test.beforeAll(ล้าง);
test.afterAll(ล้าง);

test("[D7] ปฏิทิน: นัดเลยกำหนดที่ยังเปิด ทำเสร็จ/ยกเลิกได้ · นัดที่ยกเลิกแล้วไม่อยู่ในการ์ดเลยกำหนดยังไม่ปิด", async ({ page }) => {
  // นัดของ RYG ย้อนหลัง 3 วัน: ค่า "scheduled" (สถานะที่ฐานเก็บได้ นอกจาก upcoming) กับ "cancelled"
  const ก่อน3วัน = new Date(Date.now() + 7 * 3_600_000 - 3 * 86_400_000).toISOString().slice(0, 10);
  const r = await admin.from("appointments").insert([
    { id: เลข[0], dealer_code: "RYG", company: ยังเปิด, contact: "ผู้ทดสอบ", date: ก่อน3วัน, time: "10:00", type: "visit", status: "scheduled", note: "" },
    { id: เลข[1], dealer_code: "RYG", company: ยกเลิกแล้ว, contact: "ผู้ทดสอบ", date: ก่อน3วัน, time: "11:00", type: "visit", status: "cancelled", note: "" },
  ]);
  expect(r.error?.message ?? "", "เตรียมนัด").toBe("");

  await loginUI(page, DEALER_ORIGIN, "/calendar", RYG);
  await settle(page);
  await page.getByRole("button", { name: /เลยกำหนดยังไม่ปิด/ }).first().click();
  const รายการ = page.getByRole("table", { name: "นัดหมายตามการ์ด" });
  await expect(รายการ.getByText(ยังเปิด), "นัดเลยกำหนดที่ยังเปิด อยู่ในการ์ดเลยกำหนดยังไม่ปิด").toBeVisible({ timeout: 20_000 });
  await expect(รายการ.getByText(ยกเลิกแล้ว), "นัดที่ยกเลิกแล้ว ไม่ใช่ \"ยังไม่ปิด\"").toHaveCount(0);

  // เปิดนัดที่ยังเปิด → ป้ายไม่ใช่ "ยกเลิก" · มีปุ่มทำเสร็จแล้ว/ยกเลิกนัด → กดทำเสร็จ → ฐานเป็น done
  await รายการ.locator("tr").filter({ hasText: ยังเปิด }).click();
  const แผง = page.getByRole("dialog", { name: "รายละเอียดนัดหมาย" });
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  await expect(แผง.getByText("ยกเลิก", { exact: true }), "นัดที่ยังเปิดต้องไม่ขึ้นป้ายยกเลิก").toHaveCount(0);
  await expect(แผง.getByRole("button", { name: "ยกเลิกนัด" })).toBeVisible();
  await แผง.getByRole("button", { name: "ทำเสร็จแล้ว" }).click();
  await expect.poll(async () => (await admin.from("appointments").select("status").eq("id", เลข[0]).single()).data?.status,
    { timeout: 20_000, message: "กดทำเสร็จแล้ว → นัดเป็นเสร็จสิ้น" }).toBe("done");
});
