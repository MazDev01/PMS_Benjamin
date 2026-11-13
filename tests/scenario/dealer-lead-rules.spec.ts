import { test, expect } from "@playwright/test";
import { open, assertHealthyPage } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { adminClient } from "./testDealers";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";

// โหมดต่อฐาน แอปอ่านกฎจาก dealer_lead_rules — ข้อทดสอบตั้งเกณฑ์ที่ฐานของสาขาของข้อ (12 พ.ย. 69 · เดิม localStorage ข้ามทุกรอบ)
//   seedRules (localStorage) เหลือไว้เฉพาะทางโหมดไม่ต่อฐานของข้อ HQ ท้ายไฟล์

// ─── ฟีเจอร์: กฎการดูแลลูกค้าเป้าหมาย "แยกรายสาขา" (ดีลเลอร์ตั้งเอง) ─────────────
// เดิม HQ ตั้งค่าเดียวบังคับทุกสาขา · บอสสั่งย้ายให้ดีลเลอร์ตั้งเอง แยกกันรายสาขา
// สเปกนี้ล็อกสิ่งที่ต้องเป็นจริงหลังย้าย:
//   1. HQ ตั้งไม่ได้แล้ว (ต้องไม่มีช่องกรอกที่ /hq/settings)
//   2. ดีลเลอร์ตั้งได้จริงที่ /settings → กฎดูแลลูกค้าเป้าหมาย (แยกจากแท็บการแจ้งเตือนเดิม 21 ต.ค. 69) และค่าถูกบันทึก
//   3. ค่าที่ตั้ง "มีผลจริง" กับหน้าของดีลเลอร์ — ไม่ใช่ช่องกรอกหลอก
//   4. HQ ยังเห็นลูกค้าเป้าหมายของสาขานั้นตามเกณฑ์ที่สาขาตั้ง (HQ ไม่หลุดการมองเห็น)

const RULES_KEY = "dealer_lead_rules";

/** ตั้งกฎของสาขาโดยตรงที่ localStorage ก่อนโหลดหน้า — ใช้ทดสอบผลลัพธ์แบบ deterministic */
async function seedRules(page: import("@playwright/test").Page, code: string, followUpAlertDays: number, unassignedAlertHours: number) {
  await page.addInitScript(([k, c, d, h]) => {
    localStorage.setItem(k as string, JSON.stringify({ [c as string]: { followUpAlertDays: d, unassignedAlertHours: h } }));
  }, [RULES_KEY, code, followUpAlertDays, unassignedAlertHours]);
}

// ── 1. HQ ตั้งกฎนี้ไม่ได้แล้ว ──
test("[user·hq] /hq/settings ไม่มีช่องตั้งเกณฑ์ 48 ชม./7 วัน แล้ว (ย้ายไปดีลเลอร์)", async ({ page }) => {
  await open(page, "hq", "/hq/settings");
  await assertHealthyPage(page, "ตั้งค่า HQ");
  const main = page.locator(".erp");
  await expect(main.getByText("กฎการดูแลลูกค้าเป้าหมาย")).toHaveCount(0);
  await expect(main.getByText("ต้องมีผู้รับผิดชอบภายใน")).toHaveCount(0);
});

// 12 พ.ย. 69 (บอสสั่ง): ข้อ 2–3 เดิมใส่เกณฑ์ใน localStorage แล้วข้ามเมื่อต่อฐาน = ข้ามทุกรอบตรวจ (ไม่เคยตรวจจริง)
//   → เขียนใหม่: สาขาของข้อ + เกณฑ์ที่ฐาน (dealer_lead_rules) แล้วตรวจบนจอของดีลเลอร์สาขานั้น · ไม่มีทางข้าม
/** สาขาของข้อพร้อมเกณฑ์ที่ฐาน (ไม่ส่งเกณฑ์ = ใช้ค่าตั้งต้นของฐาน) — คืน ส + ตัวลบ */
async function สาขาพร้อมเกณฑ์(เกณฑ์?: { วัน: number; ชม: number }) {
  const ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  if (เกณฑ์) expect((await adminClient().from("dealer_lead_rules").upsert({ dealer_code: ส.รหัส, follow_up_alert_days: เกณฑ์.วัน, unassigned_alert_hours: เกณฑ์.ชม })).error, "ตั้งเกณฑ์ของสาขาที่ฐาน").toBeNull();
  return { ส, ลบ: async () => { await adminClient().from("dealer_lead_rules").delete().eq("dealer_code", ส.รหัส); await ส.ลบ(); } };
}

// ── 2. ดีลเลอร์ตั้งเองได้ + ค่าถูกบันทึกลงฐานของสาขานั้น ──
test("[user·dealer] ดีลเลอร์ตั้งกฎเองได้ที่ ตั้งค่า › กฎดูแลลูกค้าเป้าหมาย แล้วค่าถูกบันทึก", async ({ page }) => {
  const { ส, ลบ } = await สาขาพร้อมเกณฑ์();
  try {
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  // แท็บ "การแจ้งเตือน" (สวิตช์รายหมวด) เอาออกแล้ว — การ์ดกฎย้ายมาแท็บของตัวเอง (ใบ 0231 · รอบ 4)
  await page.locator(".tab-bar").getByRole("button", { name: "กฎดูแลลูกค้าเป้าหมาย" }).click();
  await expect(page.getByText("กฎการดูแลลูกค้าเป้าหมาย")).toBeVisible();

  // การ์ดนี้มีช่องตัวเลข 2 ช่องตามลำดับ: [0]=ต้องมีผู้รับผิดชอบภายใน(ชม.) [1]=เตือนเมื่อไม่ติดต่อเกิน(วัน)
  const card = page.locator(".card").filter({ hasText: "กฎการดูแลลูกค้าเป้าหมาย" }).last();
  const nums = card.locator('input[type="number"]');
  await expect(nums).toHaveCount(2);
  await nums.nth(1).fill("3");   // เตือนเมื่อลูกค้าเป้าหมายไม่มีการติดต่อเกิน 7 → 3 วัน
  await page.getByRole("button", { name: /^บันทึก/ }).first().click();

  // ค่าต้องลงแถวของสาขานี้ในฐาน (dealer_lead_rules) ไม่ใช่ค่ากลางของ HQ
  await expect.poll(async () => (await adminClient().from("dealer_lead_rules").select("follow_up_alert_days").eq("dealer_code", ส.รหัส).maybeSingle()).data?.follow_up_alert_days ?? null,
    { timeout: 20_000, message: "เกณฑ์ของสาขานี้ในฐานต้องเป็น 3 วัน" }).toBe(3);
  } finally { await ลบ(); }
});

// ── 3. ค่าที่ตั้งมีผลจริงกับหน้าของดีลเลอร์ (ไม่ใช่ช่องกรอกหลอก) ──
test("[user·dealer] เกณฑ์ที่สาขาตั้ง มีผลกับการ์ด 'ต้องติดตามด่วน' บนแดชบอร์ด", async ({ page }) => {
  const { ส, ลบ } = await สาขาพร้อมเกณฑ์({ วัน: 3, ชม: 48 });   // ตั้ง 3 วันที่ฐาน
  try {
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("ต้องติดตามด่วน (เกิน 3 วัน)")).toBeVisible({ timeout: 25_000 });
  } finally { await ลบ(); }
});

test("[user·dealer·edge] ตั้งเกณฑ์สูงมาก (999 วัน) → ไม่มีลูกค้าเป้าหมายไหนค้าง", async ({ page }) => {
  const { ส, ลบ } = await สาขาพร้อมเกณฑ์({ วัน: 999, ชม: 48 });
  const เลข = 1_890_000_000 + Math.floor(Math.random() * 400_000) * 10;
  const สิบวันก่อน = new Date(Date.now() + 7 * 3_600_000 - 10 * 86_400_000).toISOString().slice(0, 10);
  try {
    // ลูกค้าเป้าหมายไม่ได้ติดต่อ 10 วัน (มีผู้รับผิดชอบ) — เกณฑ์ 7 วันเดิมจะค้าง · เกณฑ์ 999 วันต้องไม่ค้าง (วางที่ฐานปิดตัวดัก แบบข้อ HQ ด้านล่าง)
    expect(รันSQLในฐาน(`set local session_replication_role = replica;
      insert into public.leads (id, num_id, dealer_code, company, name, phone, province, source, status, assigned, created_date, last_contact_at)
      values ('#L-${เลข}', ${เลข}, '${ส.รหัส}', 'ZZTEST ไม่ได้ติดต่อ 10 วัน ${ส.รหัส}', 'ZZTEST ผู้ติดต่อ', '000-000-0302', 'ตราด', 'Facebook', 'WAITING', 'ผู้ทดสอบ', '${สิบวันก่อน}', '${สิบวันก่อน}');
      set local session_replication_role = origin;`), "ลูกค้าเป้าหมายของข้อ").not.toBeNull();
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("ต้องติดตามด่วน (เกิน 999 วัน)")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("ไม่มีรายการค้าง")).toBeVisible();
  } finally { await adminClient().from("leads").delete().eq("num_id", เลข); await ลบ(); }
});

// ── 4. HQ ยังเห็นตามเกณฑ์ที่สาขาตั้ง — และไม่โกหกว่าเป็น "กฎสำนักงานใหญ่" ──
test("[ux·hq] หน้าลูกค้าเป้าหมาย HQ ไม่อ้างว่าเกณฑ์เป็นของสำนักงานใหญ่แล้ว", async ({ page }) => {
  await open(page, "hq", "/hq/leads");
  await assertHealthyPage(page, "ลูกค้าเป้าหมายทั้งเครือ");
  await expect(page.locator(".erp").getByText(/ตามกฎสำนักงานใหญ่/)).toHaveCount(0);
});

test("[user·hq] เกณฑ์ที่สาขาตั้ง มีผลกับการ์ดเตือนของ HQ ด้วย", async ({ page }) => {
  // ⚠️ 11 พ.ย. 69 (ตกหลังเลิกข้ามเงียบ): ข้อเดิมตั้งเกณฑ์ผ่าน localStorage ซึ่งโหมดต่อฐานไม่อ่าน + ข้อมูลตั้งต้นทุกรายมีผู้รับผิดชอบ
  //   → บนฐานจริงการ์ดไม่เคยขึ้น และข้อนี้ผ่านเงียบมาตลอด (if count) · ตอนนี้โหมดต่อฐาน: สาขาของข้อ + เกณฑ์ที่ฐาน (dealer_lead_rules 1 ชม.)
  //   + ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบ เข้ามา 3 วันก่อน → การ์ดต้องขึ้น · โหมดไม่ต่อฐานยังใช้ทาง localStorage เดิม
  if (REAL_BACKEND) {
    const ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
    const svc = adminClient();
    const เลข = 1_880_000_000 + Math.floor(Math.random() * 400_000) * 10;
    const สามวันก่อน = new Date(Date.now() + 7 * 3_600_000 - 3 * 86_400_000).toISOString().slice(0, 10);
    try {
      expect((await svc.from("dealer_lead_rules").upsert({ dealer_code: ส.รหัส, follow_up_alert_days: 7, unassigned_alert_hours: 1 })).error, "ตั้งเกณฑ์ของสาขาที่ฐาน").toBeNull();
      // วางที่ฐานตรงแบบปิดตัวดัก — ตัวดักตอนเพิ่มลีดตั้งวันที่เข้ามา = วันนี้เสมอ (ลีดอายุ 0 ชม. ไม่เข้าเกณฑ์) · แบบเดียวกับ hq-leads-one-set
      expect(รันSQLในฐาน(`set local session_replication_role = replica;
        insert into public.leads (id, num_id, dealer_code, company, name, phone, province, source, status, created_date, last_contact_at)
        values ('#L-${เลข}', ${เลข}, '${ส.รหัส}', 'ZZTEST ไม่มีผู้รับผิดชอบ ${ส.รหัส}', 'ZZTEST ผู้ติดต่อ', '000-000-0301', 'ตราด', 'Facebook', 'WAITING', '${สามวันก่อน}', '${สามวันก่อน}');
        set local session_replication_role = origin;`), "ลูกค้าเป้าหมายของข้อ (ไม่พบฐานทดสอบในเครื่อง = วางไม่ได้)").not.toBeNull();
      await open(page, "hq", `/hq/leads?dealer=${ส.รหัส}`);
      await assertHealthyPage(page, "ลูกค้าเป้าหมายทั้งเครือ");
      const การ์ด = page.locator(".card").filter({ hasText: "ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบ" });
      await expect(การ์ด, "เกณฑ์ 1 ชม. ของสาขา + ลีดไม่มีผู้รับผิดชอบ 3 วัน = การ์ดเตือนขึ้น").toBeVisible({ timeout: 25_000 });
      await expect(การ์ด.getByText(/เกณฑ์ที่แต่ละสาขาตั้งไว้เอง/)).toBeVisible();
    } finally {
      await svc.from("leads").delete().eq("num_id", เลข);
      await svc.from("dealer_lead_rules").delete().eq("dealer_code", ส.รหัส);
      await ส.ลบ();
    }
  } else {
  // ตั้งเกณฑ์ต่ำมาก (1 ชม.) ให้สาขา CNX → ลูกค้าเป้าหมายที่ยังไม่มีผู้รับผิดชอบของ CNX ต้องเข้าเกณฑ์
  await seedRules(page, "CNX", 7, 1);
  await open(page, "hq", "/hq/leads");
  await assertHealthyPage(page, "ลูกค้าเป้าหมายทั้งเครือ");
  const card = page.locator(".card").filter({ hasText: "ลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบ" });
  // การ์ดต้องขึ้น (เกณฑ์ 1 ชม. = ลีดไม่มีผู้รับผิดชอบเข้าเกณฑ์แน่) — ไม่ขึ้น = ตก ไม่ใช่ผ่านเงียบ (บอสสั่ง 11 พ.ย. 69)
  await expect(card, "ขาดข้อมูล: การ์ดลูกค้าเป้าหมายยังไม่มีผู้รับผิดชอบไม่ขึ้น").toBeVisible({ timeout: 20_000 });
  {
    // ป้ายต้องบอกเกณฑ์ที่ "แต่ละสาขาตั้งเอง" ไม่ใช่ตัวเลขกลางตัวเดียว
    await expect(card.getByText(/เกณฑ์ที่แต่ละสาขาตั้งไว้เอง/)).toBeVisible();
  }
  }
});
