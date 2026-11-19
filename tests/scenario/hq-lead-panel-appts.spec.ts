import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── แผงลีด HQ › แท็บนัดหมาย: แสดงประเภท · สถานะ · วันเวลา · ผู้รับผิดชอบ · สถานที่ · บันทึก/ผลหลังนัด (บอสสั่ง 19 พ.ย. 69) ──
//   เดิม: แสดงแค่หัวข้อ/วันเวลา/ผู้รับผิดชอบ ทั้งที่นัดมีข้อมูลครบ · นัดของลีดเลขเดียวกันต่างสาขาปนกัน (เทียบแค่เลขลีด)
//   ข้อมูลของข้อเอง: สาขา ก ลีด 1 ราย นัด 2 (นำเสนอราคา เสร็จสิ้น + โทรติดตาม นัดไว้) · สาขา ข ลีดเลขเดียวกัน นัด 1
//   ตกบนโค้ดเดิม (97a8ab9e): ไม่มี data-appt-meta/location/note
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
let ก: สาขาของข้อ, ข: สาขาของข้อ;
const เลข = 9_450_000 + Math.floor(Math.random() * 40_000) * 10;

test.beforeAll(async () => {
  ก = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  ข = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status) values
      ('#L-' || (40321 + ${เลข}), ${เลข}, '${ก.รหัส}', 'ZZTEST ลีดนัด ${เลข}', 'ZZTEST ลีดนัด ${เลข}', 'ผู้ทดสอบ', '000-000-0951', 'ตราด', 'BULLET'),
      ('#L-' || (40321 + ${เลข}), ${เลข}, '${ข.รหัส}', 'ZZTEST ลีดนัดสาขาอื่น ${เลข}', 'ZZTEST ลีดนัดสาขาอื่น ${เลข}', 'ผู้ทดสอบ', '000-000-0952', 'ตราด', 'BULLET');
    insert into public.appointments (dealer_code, lead_id, company, contact, project, province, date, time, type, status, note, location, assigned) values
      ('${ก.รหัส}', ${เลข}, 'ZZTEST ลีดนัด ${เลข}', 'ผู้ทดสอบ', 'ZZTEST เสนอราคาโกดัง ${เลข}', 'ตราด', '2026-11-10', '10:00', 'presentation', 'done',
        'ลูกค้าขอปรับหลังคาเป็นเมทัลชีทหนา 0.47', 'สำนักงานลูกค้า อ.เมือง จ.ตราด', 'ผู้ทดสอบ'),
      ('${ก.รหัส}', ${เลข}, 'ZZTEST ลีดนัด ${เลข}', 'ผู้ทดสอบ', 'ZZTEST โทรติดตามใบเสนอราคา ${เลข}', 'ตราด', '2026-11-25', '14:30', 'follow_up', 'scheduled', '', '', 'ผู้ทดสอบ'),
      ('${ข.รหัส}', ${เลข}, 'ZZTEST ลีดนัดสาขาอื่น ${เลข}', 'ผู้ทดสอบ', 'ZZTEST นัดสาขาอื่น ${เลข}', 'ตราด', '2026-11-12', '09:00', 'visit', 'scheduled', '', '', 'ผู้ทดสอบ');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.appointments where dealer_code in ('${ก.รหัส}', '${ข.รหัส}');
    delete from public.leads where dealer_code in ('${ก.รหัส}', '${ข.รหัส}');
    set local session_replication_role = origin;`);
  await ก.ลบ(); await ข.ลบ();
});

test("[H·hq] แผงลีด HQ › นัดหมาย: ประเภท · สถานะ · สถานที่ · ผลหลังนัด · ไม่ปนนัดของลีดเลขเดียวกันต่างสาขา", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads?open=${ก.รหัส}:${เลข}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แท็บ = page.locator("[data-panel-tab='appts']");
  await expect(แท็บ, "นัดของลีด = 2 (ไม่นับนัดของสาขาอื่น)").toContainText("2", { timeout: 30_000 });
  await แท็บ.click();
  const นัดเสนอ = page.locator("div").filter({ has: page.getByText(`ZZTEST เสนอราคาโกดัง ${เลข}`, { exact: true }) }).filter({ has: page.locator("[data-appt-meta]") }).last();
  await expect(นัดเสนอ.locator("[data-appt-meta]"), "ประเภท · สถานะ").toContainText("นำเสนอราคา · เสร็จสิ้น");
  await expect(นัดเสนอ.locator("[data-appt-location]"), "สถานที่").toHaveText("สถานที่: สำนักงานลูกค้า อ.เมือง จ.ตราด");
  await expect(นัดเสนอ.locator("[data-appt-note]"), "บันทึก/ผลหลังนัด").toHaveText("ลูกค้าขอปรับหลังคาเป็นเมทัลชีทหนา 0.47");
  const นัดโทร = page.locator("div").filter({ has: page.getByText(`ZZTEST โทรติดตามใบเสนอราคา ${เลข}`, { exact: true }) }).filter({ has: page.locator("[data-appt-meta]") }).last();
  await expect(นัดโทร.locator("[data-appt-meta]")).toContainText("โทรติดตาม · นัดไว้");
  await expect(นัดโทร.locator("[data-appt-location]"), "ไม่มีสถานที่ = ไม่แสดงบรรทัด").toHaveCount(0);
  await expect(page.getByText(`ZZTEST นัดสาขาอื่น ${เลข}`, { exact: true }), "ไม่มีนัดของสาขาอื่น").toHaveCount(0);
});
