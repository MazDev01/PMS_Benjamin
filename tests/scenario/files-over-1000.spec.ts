import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ไฟล์แนบเกิน 1,000 แถวต้องขึ้นครบ (บั๊ก 19 พ.ย. 69 · เจอระหว่างงานข้อมูลตัวอย่าง) ─────────────────────────────────────────
//   เดิม: GET /files อ่านทั้งตารางคำขอเดียว ฐานคืนสูงสุด 1,000 แถว (เก่าสุดก่อน) → ไฟล์ใหม่กว่าแถวที่ 1,000 ไม่ขึ้นทุกหน้า
//         + แผงลีด HQ นับไฟล์ด้วยเลขลีดอย่างเดียว ไม่เทียบรหัสสาขา (ลีดเลขเดียวกันต่างสาขาได้ไฟล์ปนกัน)
//   ข้อมูลของข้อเอง: สาขาของข้อ 2 สาขา · สาขา ก ไฟล์อื่น 1,005 แถว แล้วลีดของข้อ 2 ไฟล์ (ใหม่สุด) · สาขา ข ลีดเลขเดียวกัน 1 ไฟล์
//   ตกบนโค้ดเดิม (97a8ab9e): แผงลีด HQ ไฟล์แนบ 0 (ไฟล์ของลีดอยู่หลังแถวที่ 1,000) · หน้าไฟล์ของดีลเลอร์หาไฟล์ใหม่สุดไม่เจอ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

let ก: สาขาของข้อ, ข: สาขาของข้อ;
const เลข = 9_400_000 + Math.floor(Math.random() * 50_000) * 10;
const ไฟล์ใหม่สุด = `ZZTEST แปลนล่าสุด ${เลข}.png`;

test.beforeAll(async () => {
  ก = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  ข = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, contact, phone, province, status) values
      ('#L-' || (40321 + ${เลข}), ${เลข}, '${ก.รหัส}', 'ZZTEST ลีดไฟล์ ${เลข}', 'ZZTEST ลีดไฟล์ ${เลข}', 'ผู้ทดสอบ', '000-000-0941', 'ตราด', 'BULLET'),
      ('#L-' || (40321 + ${เลข}), ${เลข}, '${ข.รหัส}', 'ZZTEST ลีดสาขาอื่น ${เลข}', 'ZZTEST ลีดสาขาอื่น ${เลข}', 'ผู้ทดสอบ', '000-000-0942', 'ตราด', 'BULLET');
    insert into public.files (dealer_code, name, size, ext, category, project, uploaded_by, uploaded_at, source, record_id)
      select '${ก.รหัส}', 'ZZTEST ไฟล์เก่า ' || g, '1 KB', 'pdf', 'อื่นๆ', 'ZZTEST', 'ผู้ทดสอบ', '2026-11-01', 'customer', 0 from generate_series(1, 1005) g;
    insert into public.files (dealer_code, name, size, ext, category, project, uploaded_by, uploaded_at, source, record_id) values
      ('${ข.รหัส}', 'ZZTEST ไฟล์สาขาอื่น ${เลข}.png', '1 KB', 'png', 'รูปภาพ', 'ZZTEST', 'ผู้ทดสอบ', '2026-11-18', 'lead', ${เลข}),
      ('${ก.รหัส}', 'ZZTEST รูปหน้างาน ${เลข}.png', '1 KB', 'png', 'รูปภาพ', 'ZZTEST', 'ผู้ทดสอบ', '2026-11-18', 'lead', ${เลข}),
      ('${ก.รหัส}', '${ไฟล์ใหม่สุด}', '1 KB', 'png', 'แบบแปลน', 'ZZTEST', 'ผู้ทดสอบ', '2026-11-19', 'lead', ${เลข});
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.files where dealer_code in ('${ก.รหัส}', '${ข.รหัส}');
    delete from public.leads where dealer_code in ('${ก.รหัส}', '${ข.รหัส}');
    set local session_replication_role = origin;`);
  await ก.ลบ(); await ข.ลบ();
});

test("[H·hq] แผงลีด HQ: ไฟล์แนบของลีดขึ้นครบแม้ทั้งเครือเกิน 1,000 ไฟล์ · ไม่ปนไฟล์ของลีดเลขเดียวกันต่างสาขา", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads?open=${ก.รหัส}:${เลข}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แท็บ = page.locator("[data-panel-tab='files']");
  await expect(แท็บ, "แผงลีดเปิด").toBeVisible({ timeout: 30_000 });
  await expect(แท็บ, "ไฟล์แนบของลีด = 2 (ไม่ใช่ 0 · ไม่นับไฟล์ของสาขาอื่น)").toContainText("2", { timeout: 30_000 });
  await แท็บ.click();
  await expect(page.getByText(ไฟล์ใหม่สุด, { exact: true }), "ไฟล์ใหม่สุดของลีดขึ้นในแท็บ").toBeVisible();
  await expect(page.getByText(`ZZTEST ไฟล์สาขาอื่น ${เลข}.png`, { exact: true }), "ไม่มีไฟล์ของลีดเลขเดียวกันต่างสาขา").toHaveCount(0);
});

test("[D·dealer] หน้าไฟล์ของดีลเลอร์: สาขาเกิน 1,000 ไฟล์ ค้นไฟล์ใหม่สุดเจอ", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/files", ก.บัญชี);
  await settle(page);
  await page.getByPlaceholder("ค้นหาไฟล์ / โอกาสการขาย...", { exact: true }).fill(`แปลนล่าสุด ${เลข}`);
  await expect(page.getByText(ไฟล์ใหม่สุด, { exact: true }), "ไฟล์ที่ 1,008 ของสาขาขึ้นในหน้าไฟล์").toBeVisible({ timeout: 30_000 });
});
