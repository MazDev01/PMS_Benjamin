import { test, expect } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── สถานที่นัดหมาย แสดงบนจอ (คนรวมงานส่งต่อจากบอส 19 พ.ย. 69 · ข้อแจ้งแยกงานข้อมูลตัวอย่าง ①) ─────────────────────────────
//   ช่อง "สถานที่" ในฟอร์มนัดใหม่ของปฏิทิน (appointments.location) เดิมบันทึกแล้วไม่มีหน้าไหนแสดง
//   ตอนนี้: หน้าต่างนัด (ปฏิทิน) · รายการนัด (ปฏิทิน) · รายการนัดในแผงลูกค้าเป้าหมาย — "สถานที่: …" · ไม่มีสถานที่ = ไม่แสดงบรรทัด
//   ข้อมูลของข้อเอง: สาขาของข้อ ลีด 1 · นัด 2 (มีสถานที่ 1 · ไม่มี 1) วันมะรืน
//   ตกบนโค้ดเดิม (97a8ab9e): ไม่มี [data-appt-location] ทุกที่
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

let สาขา: สาขาของข้อ;
const ฐาน = 9_300_000 + Math.floor(Math.random() * 60_000) * 10;
const สถานที่ = `ZZTEST หน้างาน 99/9 หมู่ 2 ต.บางพระ อ.เมืองตราด ${ฐาน}`;
const มีที่ = `ZZTEST นัดมีสถานที่ ${ฐาน}`, ไม่มีที่ = `ZZTEST นัดไม่มีสถานที่ ${ฐาน}`;
const มะรืน = new Date(Date.now() + 7 * 3_600_000 + 2 * 86_400_000).toISOString().slice(0, 10);

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const c = สาขา.รหัส;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status) values
      ('#L-${ฐาน}', ${ฐาน}, '${c}', 'ZZTEST ลีดนัด ${ฐาน}', 'ZZTEST ลีดนัด ${ฐาน}', 'ผู้ทดสอบ', '000-000-0931', 'ตราด', 'BULLET');
    insert into public.appointments (id, dealer_code, lead_id, company, contact, project, province, date, time, type, status, note, location) values
      (${ฐาน}, '${c}', ${ฐาน}, '${มีที่}', 'ผู้ทดสอบ', 'นัดดูหน้างาน', 'ตราด', '${มะรืน}', '10:00', 'site_visit', 'upcoming', '', '${สถานที่}'),
      (${ฐาน + 1}, '${c}', ${ฐาน}, '${ไม่มีที่}', 'ผู้ทดสอบ', 'โทรติดตาม', 'ตราด', '${มะรืน}', '14:00', 'call', 'upcoming', '', '');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.appointments where dealer_code = '${สาขา.รหัส}';
    delete from public.leads where dealer_code = '${สาขา.รหัส}';
    set local session_replication_role = origin;`);
  await สาขา.ลบ();
});

test("[D7] สถานที่นัด: หน้าต่างนัด + รายการนัดในปฏิทิน + รายการนัดในแผงลูกค้าเป้าหมาย · ไม่มีสถานที่ = ไม่มีบรรทัด", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/calendar", สาขา.บัญชี);
  await settle(page);
  // รายการนัด (กำลังจะถึง) — นัดมีสถานที่มีบรรทัดสถานที่ · นัดไม่มีไม่มี
  const แถวมี = page.locator(".activity").filter({ hasText: มีที่ });
  const แถวไม่มี = page.locator(".activity").filter({ hasText: ไม่มีที่ });
  await expect(แถวมี, "รายการนัด: นัดมีสถานที่").toHaveCount(1, { timeout: 30_000 });
  await expect(แถวมี.locator("[data-appt-location]"), "รายการนัด: แสดงสถานที่").toHaveText(`สถานที่: ${สถานที่}`);
  await expect(แถวไม่มี.locator("[data-appt-location]"), "รายการนัด: ไม่มีสถานที่ = ไม่มีบรรทัด").toHaveCount(0);

  // หน้าต่างนัด
  await แถวมี.click();
  const หน้าต่าง = page.getByRole("dialog", { name: "รายละเอียดนัดหมาย", exact: true });
  await expect(หน้าต่าง).toBeVisible({ timeout: 15_000 });
  await expect(หน้าต่าง.locator("[data-appt-location]"), "หน้าต่างนัด: แสดงสถานที่").toHaveText(`สถานที่: ${สถานที่}`);
  await page.keyboard.press("Escape");
  await expect(หน้าต่าง).toHaveCount(0);
  await แถวไม่มี.click();
  await expect(หน้าต่าง).toBeVisible({ timeout: 15_000 });
  await expect(หน้าต่าง, "หน้าต่างนัดที่ถูกเปิด").toContainText(ไม่มีที่);
  await expect(หน้าต่าง.locator("[data-appt-location]"), "หน้าต่างนัด: ไม่มีสถานที่ = ไม่มีบรรทัด").toHaveCount(0);

  // แผงลูกค้าเป้าหมาย › นัดหมาย
  await page.goto(`${DEALER_ORIGIN}/leads?open=${ฐาน}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แผง = page.locator("[data-row-panel]").last();
  await expect(แผง).toBeVisible({ timeout: 30_000 });
  await expect(แผง.locator("[data-appt-location]"), "แผงลีด: บรรทัดสถานที่เฉพาะนัดที่มี").toHaveCount(1, { timeout: 20_000 });
  await expect(แผง.locator("[data-appt-location]")).toHaveText(`สถานที่: ${สถานที่}`);
});
