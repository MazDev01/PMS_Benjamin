import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { adminClient } from "./testDealers";

// ── /hq/audit แสดงเฉพาะสิ่งที่ HQ ทำ (ใบ 0274 · บอสสั่ง 3 พ.ย. 69) ─────────────────────────────────────────────────────
//   บันทึกที่ดีลเลอร์ทำ (DEALER_ADMIN/DEALER_SALES) และงานเบื้องหลังของระบบ (บทบาทว่าง) ไม่ขึ้นตาราง · ของ HQ ขึ้น
//   คัดที่ฐาน (มุมมอง audit_log_hq) ไม่ใช่ที่หน้า — ตาราง ตัวกรอง ส่งออก ใช้ชุดเดียวกัน · ไม่ลบอะไร
//   ตกบนโค้ดก่อนใบ 0274: หน้าอ่านตาราง audit_log ตรง เห็นแถวของดีลเลอร์
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const admin = adminClient();
// เป้าหมายติดป้าย ZZTEST- = ตัวล้างข้อมูลทดสอบเก็บได้ (บันทึกการใช้งานลบเองไม่ได้ · ใบ 0241)
const แท็ก = `ZZTEST-AUDHQ${Date.now() % 100_000}`;

test("[ui·hq] บันทึกการใช้งาน: เห็นสิ่งที่ HQ ทำ · ไม่เห็นสิ่งที่ดีลเลอร์ทำ/งานเบื้องหลัง (คัดที่ฐาน · ไม่ลบ)", async ({ page }) => {
  const ใส่ = await admin.from("audit_log").insert([
    { user: "ผู้ดูแลระบบสำนักงานใหญ่", role: "SUPER_ADMIN", action: "แก้ไขดีลเลอร์", target: `${แท็ก} HQ` },
    { user: "ผู้ทดสอบดีลเลอร์", role: "DEALER_ADMIN", action: "แก้ไขข้อมูลบัญชี", target: `${แท็ก} ดีลเลอร์` },
    { user: "ผู้ทดสอบดีลเลอร์", role: "DEALER_SALES", action: "สร้างลีด", target: `${แท็ก} พนักงานขาย` },
    { user: "", role: "", action: "เปลี่ยนสถานะใบเสนอราคา sent_to_client → expired", target: `${แท็ก} ระบบ` },
  ]);
  expect(ใส่.error, "วางบันทึกของข้อ").toBeNull();
  await loginUI(page, HQ_ORIGIN, "/hq/audit", ADMIN);
  await settle(page);
  await page.getByPlaceholder("ค้นหาผู้ใช้ / การกระทำ / รายละเอียด...").fill(แท็ก);
  await expect(page.getByText(`${แท็ก} HQ`), "สิ่งที่ HQ ทำ = เห็น").toBeVisible({ timeout: 30_000 });
  for (const x of ["ดีลเลอร์", "พนักงานขาย", "ระบบ"]) await expect(page.getByText(`${แท็ก} ${x}`), `${x} = ไม่เห็น`).toHaveCount(0);
  // ไม่ลบ — ตารางเดิมยังมีครบ 4 แถว
  const { count } = await admin.from("audit_log").select("id", { count: "exact", head: true }).like("target", `${แท็ก}%`);
  expect(count, "ตาราง audit_log ยังมีครบ (คัดตอนอ่าน ไม่ลบ)").toBe(4);
});
