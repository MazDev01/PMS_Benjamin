import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── บอร์ดผู้สนใจ คอลัมน์ "ปิดแล้ว": ผู้สนใจที่เป็นดีลเลอร์แล้ว มีลิงก์ไปแผงดีลเลอร์นั้น (คำตัดสิน 15 ก.ย. 69 · ข้อ 17 ตาราง FLOW · บอสสั่ง 13 พ.ย. 69) ──
//   ลิงก์ = ตัวกลาง RecordLink (ลิงก์ข้อมูล) · กดลิงก์ = เปิดแผงดีลเลอร์ ไม่เปิดแผงผู้สนใจของการ์ด
//   ตกบนโค้ดเดิม: การ์ดบนบอร์ดไม่มีลิงก์ดีลเลอร์ (มีแค่ในมุมมองตาราง)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });

const แท็ก = `ZZTEST-บอร์ดลิงก์ดีลเลอร์-${Date.now() % 1_000_000}`;
let สาขา: สาขาของข้อ | null = null;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ ชื่อ: `ZZTEST ดีลเลอร์จากผู้สนใจ ${แท็ก.slice(-6)}` });
  // ผู้สนใจที่ตั้งเป็นดีลเลอร์แล้ว (status won + dealer_code) — ใส่ตรงที่ฐาน (ข้ามตัวดักขั้นตอนใบค่าแฟรนไชส์ · ข้อนี้ตรวจหน้าจอบอร์ดอย่างเดียว)
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.dealer_prospects (name, phone, province, status, dealer_code) values ('${แท็ก}', '000-000-0917', 'ตราด', 'won', '${สาขา.รหัส}');
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  if (!สาขา) return;   // ไม่ใช่การข้าม: ตัวล้างหลังจบ — สร้างสาขาไม่สำเร็จ = ไม่มีอะไรให้ล้าง (ข้อตกไปแล้วที่ beforeAll)
  รันSQLในฐาน(`delete from public.dealer_prospects where name = '${แท็ก}';`);
  await สาขา.ลบ();
});

test("[ui·hq] บอร์ดผู้สนใจ › ปิดแล้ว: ผู้สนใจที่เป็นดีลเลอร์แล้ว มีลิงก์ไปแผงดีลเลอร์ · กดแล้วเปิดแผงดีลเลอร์ ไม่เปิดแผงผู้สนใจ", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 950 });
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByLabel("ค้นหาผู้สนใจ", { exact: true }).fill(แท็ก);
  await page.locator('button[title="บอร์ด"]').click();
  const ปิดแล้ว = page.locator('[data-board-column="closed"]');
  await expect(ปิดแล้ว, "คอลัมน์ปิดแล้ว").toBeVisible({ timeout: 25_000 });
  if ((await ปิดแล้ว.getAttribute("data-board-collapsed")) === "true") await ปิดแล้ว.locator("[data-board-toggle]").click();   // ไม่ใช่การข้าม: ยุบไว้ตั้งแต่แรก = กดเปิดดู
  const การ์ด = ปิดแล้ว.locator("[data-board-card]").filter({ hasText: แท็ก });
  await expect(การ์ด, "การ์ดผู้สนใจที่เป็นดีลเลอร์แล้วอยู่คอลัมน์ปิดแล้ว").toHaveCount(1, { timeout: 25_000 });
  const ลิงก์ = การ์ด.locator('[data-prospect-dealer-link] a[data-rec="dealer"]');
  await expect(ลิงก์, "มีลิงก์ไปดีลเลอร์ (ตัวกลาง RecordLink)").toHaveCount(1);
  await expect(ลิงก์).toHaveAttribute("data-rec-id", สาขา!.รหัส);
  await ลิงก์.click();
  await expect(page.locator(`[data-dealer-panel='${สาขา!.รหัส}']`), "เปิดแผงดีลเลอร์ตัวที่กด").toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ", exact: true }), "กดลิงก์ไม่เปิดแผงผู้สนใจของการ์ด").toHaveCount(0);
  assertNoErrors(errs, "บอร์ดผู้สนใจ ลิงก์ดีลเลอร์");
});
