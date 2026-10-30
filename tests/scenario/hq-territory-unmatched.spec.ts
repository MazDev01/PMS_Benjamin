import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { รันSQLในฐาน } from "./localDb";

// ── หน้าดีลเลอร์ของ HQ: ดีลเลอร์ที่จังหวัดในทะเบียนสะกดไม่ตรงรายชื่อมาตรฐาน (ใบ 0195) ────────────────────────
//   เดิมไฟล์นี้ชื่อ hq-territory-overlaps (จังหวัดทับซ้อน + เคลียร์ทีละจังหวัด) — ใบ 0214 ยกเลิก "หนึ่งจังหวัด หนึ่งดีลเลอร์"
//   (บอสสั่ง 16 ต.ค. 69) ส่วนทับซ้อนเอาออก ตรวจว่าหายแล้วที่ territory-multi-dealer.spec.ts · เหลือเรื่องจังหวัดสะกดไม่ตรง
//   ข้อมูลของข้อ: สาขา ZZTUM จังหวัด "กรุงเทพฯ" (ชื่อย่อ ไม่อยู่ใน 77 จังหวัด) — ข้อมูลเดิมก่อนใบ 0259 ตัวกันของฐานไม่รับแล้ว
//   จึงวางแบบปิดตัวดัก → ระบบไม่เดาจับคู่ ต้องขึ้นให้ HQ เห็น
//   (เดิมพึ่ง BKK "กรุงเทพฯ" ในข้อมูลตั้งต้น · 30 ต.ค. 69 ข้อมูลตั้งต้นแก้เป็น "กรุงเทพมหานคร" + พื้นที่ 1 แถวตามกติกา 0259)
//   ไม่เขียนพื้นที่ใด ๆ — ไฟล์อื่นที่รันขนานกันใช้จังหวัดของตัวเอง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

const CODE = "ZZTUM";
const ล้าง = () => รันSQLในฐาน(`set local session_replication_role = replica;
  delete from public.dealer_territories where dealer_code = '${CODE}';
  delete from public.dealers where code = '${CODE}';
  set local session_replication_role = origin;`);
test.beforeAll(() => {
  ล้าง();
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.dealers (code, name, province, region, status, revenue_target) values ('${CODE}', 'ZZTEST จังหวัดสะกดไม่ตรง', 'กรุงเทพฯ', 'กลาง', 'active', 0);
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางดีลเลอร์จังหวัดสะกดไม่ตรงไม่ได้");
});
test.afterAll(() => { ล้าง(); });

test("[hq] เห็นดีลเลอร์ที่จับคู่จังหวัดไม่ได้ (จังหวัดสะกดไม่ตรงรายชื่อ) · ไม่มีการ์ดทับซ้อน", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  const การ์ด = page.getByRole("note").filter({ hasText: "ดีลเลอร์ที่ยังไม่มีพื้นที่" }).first();
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });
  await expect(การ์ด.getByText(new RegExp(CODE)), "ดีลเลอร์ที่จังหวัดสะกดไม่ตรงรายชื่อ ต้องขึ้นให้ HQ เห็น").toBeVisible();
  await expect(การ์ด.getByText(/กรุงเทพฯ/)).toBeVisible();
  await expect(การ์ด.getByText(/\bBKK\b/), "BKK (กรุงเทพมหานคร · มีพื้นที่แล้ว) ไม่อยู่ในรายการ").toHaveCount(0);
  await expect(page.getByText(/พื้นที่ทับซ้อน/)).toHaveCount(0);
  assertNoErrors(errs, "หน้าดีลเลอร์ของ HQ");
});
