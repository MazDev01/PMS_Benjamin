import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

// ── หน้า HQ ตามแบบ (บอสเลือกแก้ 30 ต.ค. 69) — คำเรียกบนจอที่บอสสั่ง (ตัวเลขตรวจที่ supabase/tests/hq_pages_monthly.sql · ใบ 0268) ──
//   1. แดชบอร์ด: กราฟรายเดือน "ใบที่ส่ง" · "ปิดสำเร็จ" (คำเดียวกับขั้นตอนกลาง) · 2. ลิงก์ "บันทึกการใช้งาน ›" ที่กล่องกิจกรรมล่าสุด
//   3. ผู้สนใจ: ชื่อขั้น "รอตัดสินใจ HQ" (FLOW H3–H5) · 6. รายการวัสดุ: คอลัมน์ "% คลาดเฉลี่ย" รายแถว
//   (4–5 คำขอใบเสนอราคา: ปุ่ม 3 กลุ่ม · "ราคาต่อหน่วย" — quote-requests-groups.spec.ts · hq-quote-board.spec.ts)
//   ตกบนโค้ดก่อนรอบนี้: "ใบเสนอราคา"/"ปิดการขาย" · ไม่มีลิงก์ · "รอตัดสินใจ" · ไม่มีคอลัมน์
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

test("[H12·hq] แดชบอร์ด: กราฟ ใบที่ส่ง · ปิดสำเร็จ · ลิงก์บันทึกการใช้งาน · ผู้สนใจ รอตัดสินใจ HQ · รายการวัสดุ % คลาดเฉลี่ย", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const กราฟ = page.locator('[data-card="bars"]');
  await expect(กราฟ.locator(".card-title"), "ชื่อกราฟ").toHaveText("ลูกค้าเป้าหมายใหม่ · ใบที่ส่ง · ปิดสำเร็จ (รายเดือน)", { timeout: 25_000 });
  // คำอธิบายสีของกราฟ (ชุดข้อมูล) ใช้คำเดียวกับชื่อกราฟ
  await expect(กราฟ, "คำอธิบายกราฟ: ใบที่ส่ง · ปิดสำเร็จ").toContainText("ใบที่ส่ง");
  await expect(กราฟ).toContainText("ปิดสำเร็จ");
  await expect(กราฟ, "ไม่มีคำเดิม").not.toContainText(/ใบเสนอราคา|ปิดการขาย/);
  await expect(page.getByTestId("activity-audit-link"), "ลิงก์บันทึกการใช้งาน").toHaveText("บันทึกการใช้งาน ›");
  await page.getByTestId("activity-audit-link").click();
  await expect(page, "ไปหน้าบันทึกการใช้งาน").toHaveURL(/\/hq\/audit/, { timeout: 20_000 });

  await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ขั้น = await page.getByLabel("กรองตามสถานะ").locator("option").allInnerTexts();
  // 5 พ.ย. 69 (บอสสั่ง): "รอตัดสินใจ HQ" → "รอผู้สนใจตอบรับ" (คนตัดสินใจคือผู้สนใจ) — ตรวจกลับด้านจากข้อเดิม 30 ต.ค. 69
  expect(ขั้น.map(t => t.trim()), "ชื่อขั้นตาม FLOW").toEqual(expect.arrayContaining(["รอติดต่อ", "ติดต่อแล้ว", "ส่งข้อมูลบริษัทแล้ว", "นัดคุยแล้ว", "รอผู้สนใจตอบรับ"]));   // "เป็นดีลเลอร์แล้ว" ไม่อยู่ในตัวกรอง (ตั้งใจ)
  for (const เดิม of ["รอตัดสินใจ", "รอตัดสินใจ HQ"]) expect(ขั้น.map(t => t.trim()), `ไม่มีชื่อเดิม "${เดิม}"`).not.toContain(เดิม);

  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "รายการวัสดุ" }).click();
  const แผง = page.locator("[data-panel='material-templates']");
  await expect(แผง.locator("thead th").filter({ hasText: "% คลาดเฉลี่ย" }), "คอลัมน์ % คลาดเฉลี่ยรายแถว").toHaveCount(1, { timeout: 20_000 });
  assertNoErrors(errs, "หน้า HQ ตามแบบ");
});

// ── ชื่อขั้น "รอตัดสินใจ" เดิม → "รอตัดสินใจ HQ" (บอสสั่ง 30 ต.ค. 69 · แก้ข้อ 9) ──
//   ห้ามแก้ข้อความบันทึก/ประวัติเก่าในฐาน (บันทึกการใช้งานแก้ไม่ได้ทุกบทบาท · ใบ 0241) → หน้าเว็บแปลงตอนแสดง · ของใหม่ฐานบันทึกคำใหม่ (ใบ 0268)
//   ตรวจ: ใบ 0268 ไม่มีคำสั่งแก้/ลบตารางบันทึก · ตัวแปลงแปลงของเก่า ไม่แตะของใหม่ · ทุกจุดที่แสดงข้อความบันทึก/ประวัติ/แจ้งเตือนเรียกตัวแปลง
test("[H3·hq] ชื่อขั้นเดิมในบันทึกเก่าแสดงเป็นคำใหม่ · ใบ 0268 ไม่แก้บันทึกในฐาน", async () => {
  const fs = await import("node:fs");
  const { ชื่อขั้นปัจจุบัน } = await import("../../packages/shared/lib/dealerProspects");
  // 5 พ.ย. 69: ชื่อปัจจุบัน "รอผู้สนใจตอบรับ" — ข้อความทั้งรุ่นก่อน 30 ต.ค. ("รอตัดสินใจ") และรุ่น 30 ต.ค.–5 พ.ย. ("รอตัดสินใจ HQ") แปลงตอนแสดง
  expect(ชื่อขั้นปัจจุบัน("นัดคุยแล้ว → รอตัดสินใจ"), "ข้อความก่อน 30 ต.ค. → คำปัจจุบัน").toBe("นัดคุยแล้ว → รอผู้สนใจตอบรับ");
  expect(ชื่อขั้นปัจจุบัน("นัดคุยแล้ว → รอตัดสินใจ HQ"), "ข้อความ 30 ต.ค.–5 พ.ย. → คำปัจจุบัน (ไม่เหลือ HQ ค้าง)").toBe("นัดคุยแล้ว → รอผู้สนใจตอบรับ");
  expect(ชื่อขั้นปัจจุบัน("นัดคุยแล้ว → รอผู้สนใจตอบรับ"), "ข้อความใหม่ไม่เปลี่ยน").toBe("นัดคุยแล้ว → รอผู้สนใจตอบรับ");
  const ใบ = fs.readFileSync("supabase/migrations/0268_hq_pages_monthly.sql", "utf8").replace(/--.*$/gm, "");
  expect(ใบ.match(/\b(update|delete\s+from|truncate|insert\s+into)\s+(public\.)?(audit_log|notifications|dealer_prospect_activities|lead_activities)\b/gi) ?? [], "ใบ 0268 ไม่มีคำสั่งแก้/ลบ/เพิ่มตารางบันทึก").toEqual([]);
  for (const ไฟล์ of ["packages/shared/lib/useAudit.ts", "packages/shared/components/hq/ProspectActivityPanel.tsx", "packages/shared/components/layout/NotificationBell.tsx"])
    expect(fs.readFileSync(ไฟล์, "utf8"), `${ไฟล์}: แปลงชื่อขั้นตอนแสดง`).toContain("ชื่อขั้นปัจจุบัน(");
});
