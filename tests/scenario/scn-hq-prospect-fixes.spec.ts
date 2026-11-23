import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── ข้อผิดจากผู้ตรวจ scn-prospect (คนรวมงาน 23 พ.ย. 69 · ขับเบราว์เซอร์บน e2b941e1) — หน้าผู้สนใจเป็นดีลเลอร์ ──
//   7) การ์ด "กำลังคุย" กดดูรายการ = ตัวกรอง "ทุกสถานะ" (รวมไม่สำเร็จ) → ต้องกรองตามนิยามการ์ด (ขั้นที่ยังไม่จบ)
//      การ์ด "เป็นดีลเลอร์แล้วเดือนนี้" กดแล้วพาไป /hq/dealers ไม่กรอง → ต้องเห็นเฉพาะรายในการ์ด
//   11) เบอร์ไม่ครบที่เก็บ "000000" ตารางแสดง "000-000" (ดูเหมือนเบอร์ถูกรูปแบบ) → แสดงตามที่เก็บ
//   ตกบนโค้ดเดิม (e2b941e1): ไม่มีตัวกรองกำลังคุย (ขึ้นไม่สำเร็จด้วย) · หน้าดีลเลอร์ไม่มีป้ายกรอง · เบอร์ขึ้น 000-000
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });

const แท็ก = `ZZTEST-การ์ดผู้สนใจ-${Date.now() % 1_000_000}`;
let สาขา: สาขาของข้อ | null = null;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ ชื่อ: `ZZTEST ดีลเลอร์เดือนนี้ ${แท็ก.slice(-6)}` });
  // ผู้สนใจของข้อ: กำลังคุย 2 (ใหม่ · นัดคุย — ใหม่มีเบอร์ไม่ครบ) · ไม่สำเร็จ 1 · เป็นดีลเลอร์แล้วเดือนนี้ 1 (ใส่ตรงที่ฐาน · ข้อนี้ตรวจหน้าจอ)
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.dealer_prospects (name, phone, province, status, dealer_code, converted_at, lost_reason) values
      ('${แท็ก} คุย1', '000000', 'ตราด', 'new', null, null, null),
      ('${แท็ก} คุย2', '000-000-0981', 'ตราด', 'meeting', null, null, null),
      ('${แท็ก} ไม่สำเร็จ', '000-000-0982', 'ตราด', 'lost', null, null, 'ยังไม่พร้อม'),
      ('${แท็ก} เป็นดีลเลอร์', '000-000-0983', 'ตราด', 'won', '${สาขา.รหัส}', now(), null);
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
});
test.afterAll(async () => {
  if (!สาขา) return;   // ไม่ใช่การข้าม: ตัวล้างหลังจบ — สร้างสาขาไม่สำเร็จ = ไม่มีอะไรให้ล้าง (ข้อตกไปแล้วที่ beforeAll)
  รันSQLในฐาน(`delete from public.dealer_prospects where name like '${แท็ก}%';`);
  await สาขา.ลบ();
});

test("[ui·hq] ผู้สนใจ: การ์ดกำลังคุย กด = เฉพาะขั้นที่ยังไม่จบ (ไม่รวมไม่สำเร็จ) · เบอร์ไม่ครบแสดงตามที่เก็บ", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 950 });
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByLabel("ค้นหาผู้สนใจ", { exact: true }).fill(แท็ก);
  const แถว = page.locator("tbody tr").filter({ hasText: แท็ก });
  await expect(แถว, "ทุกสถานะ = กำลังคุย 2 + ไม่สำเร็จ 1 (เป็นดีลเลอร์แล้วไม่อยู่ในตาราง)").toHaveCount(3, { timeout: 25_000 });
  const การ์ดคุย = page.locator('[data-kpi="talking"]');
  await expect(การ์ดคุย.getByTestId("prospect-talking"), "การ์ดกำลังคุยตามคำค้น = 2").toHaveAttribute("data-value", "2", { timeout: 25_000 });
  await การ์ดคุย.click();
  await expect(แถว, "ข้อ 7: กดการ์ด = แถวเท่าการ์ด 2 ราย").toHaveCount(2);
  await expect(แถว.filter({ hasText: `${แท็ก} ไม่สำเร็จ` }), "ข้อ 7: ไม่มีรายไม่สำเร็จ").toHaveCount(0);
  await expect(การ์ดคุย, "กดซ้ำ = แสดงทั้งหมด").toContainText("กดอีกครั้งเพื่อแสดงทั้งหมด");

  const คุย1 = แถว.filter({ hasText: `${แท็ก} คุย1` });
  await expect(คุย1, "ข้อ 11: เบอร์ไม่ครบแสดงตามที่เก็บ").toContainText("000000");
  await expect(คุย1, "ข้อ 11: ไม่จัดรูปเป็น 000-000").not.toContainText("000-000");
  await expect(แถว.filter({ hasText: `${แท็ก} คุย2` }), "เบอร์ครบยังจัดรูป").toContainText("000-000-0981");
  assertNoErrors(errs, "การ์ดกำลังคุย");
});

test("[ui·hq] ผู้สนใจ: การ์ดเป็นดีลเลอร์แล้วเดือนนี้ กด = หน้าดีลเลอร์เฉพาะรายในการ์ด · แสดงทั้งหมดได้", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 950 });
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByLabel("ค้นหาผู้สนใจ", { exact: true }).fill(แท็ก);
  const การ์ด = page.locator('[data-kpi="converted"]');
  await expect(การ์ด.locator("b[data-value]"), "การ์ดตามคำค้น = 1").toHaveAttribute("data-value", "1", { timeout: 25_000 });
  await การ์ด.click();
  await expect(page, "ไปหน้าดีลเลอร์").toHaveURL(/\/hq\/dealers\?codes=/, { timeout: 25_000 });
  const ป้าย = page.locator("[data-only-codes]");
  await expect(ป้าย, "ข้อ 7: ป้ายบอกว่ากรองเฉพาะรายในการ์ด").toHaveAttribute("data-only-codes", สาขา!.รหัส, { timeout: 25_000 });
  await expect(ป้าย).toContainText("แสดงเฉพาะดีลเลอร์ที่ตั้งจากผู้สนใจเดือนนี้ 1 ราย");
  const แถว = page.locator("tbody tr");
  await expect(แถว, "ข้อ 7: ตารางเหลือ 1 ราย").toHaveCount(1, { timeout: 25_000 });
  await expect(แถว.filter({ hasText: `ZZTEST ดีลเลอร์เดือนนี้ ${แท็ก.slice(-6)}` })).toHaveCount(1);
  await ป้าย.getByRole("button", { name: "แสดงทั้งหมด", exact: true }).click();
  await expect(ป้าย, "แสดงทั้งหมด = ป้ายหาย").toHaveCount(0);
  await expect.poll(async () => แถว.count(), { timeout: 20_000, message: "แสดงทั้งหมด = มากกว่า 1 ราย" }).toBeGreaterThan(1);
  assertNoErrors(errs, "การ์ดเป็นดีลเลอร์แล้วเดือนนี้");
});
