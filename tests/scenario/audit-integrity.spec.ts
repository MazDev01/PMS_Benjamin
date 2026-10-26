import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";

// ── บันทึกตรวจสอบต้องเชื่อถือได้ ────────────────────────────────────────────────
// บันทึกนี้มีไว้ตอบว่า "ใครทำอะไรเมื่อไหร่" — ถ้าปลอมได้ ก็ใช้เป็นหลักฐานไม่ได้
// และร้ายกว่านั้นคือใช้ใส่ร้ายกันได้ (เคยลงชื่อคนอื่นได้จริง · แก้ที่ 0115)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function as(who: { email: string; password: string }) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(who);
  if (error) throw new Error(`ล็อกอิน ${who.email} ไม่ผ่าน: ${error.message}`);
  return sb;
}
// บันทึกการใช้งานลบตรงไม่ได้ (ใบ 0241) — ล้างแถวทดสอบผ่าน audit_test_cleanup (service_role) เท่านั้น
test.afterAll(async () => { await svc.rpc("audit_test_cleanup", { p_action_like: "ZZTEST%" }); });

test("ลงบันทึกในนามคนอื่นไม่ได้", async () => {
  const hq = await as(ADMIN);
  const { error } = await hq.from("audit_log")
    .insert({ user: "ZZTEST-สวมชื่อคนอื่น", role: "SUPER_ADMIN", action: "ZZTEST-ปลอมชื่อ", target: "x" }).select();
  expect(error, "เขียนบันทึกโดยใส่ชื่อคนอื่นต้องถูกปฏิเสธ").not.toBeNull();
});

// ใบ 0240 (บอสสั่ง 22 ต.ค. 69): บันทึกให้ฐานลงเท่านั้น — เดิมข้อนี้ตรวจว่า "ผู้ดูแลเขียนบันทึกของตัวเองได้"
//   ตอนนี้ต้องถูกปฏิเสธแม้ชื่อ/บทบาทตรงบัญชีทุกอย่าง (ถอนสิทธิ์เขียนตาราง) · การใช้งานจริงยังลงครบผ่านตัวดัก (audit_in_db.sql)
test("ลงบันทึกเองตรง ๆ ไม่ได้ แม้ในนามตัวเอง (ฐานลงบันทึกเท่านั้น)", async () => {
  const hq = await as(ADMIN);
  const { error } = await hq.from("audit_log")
    .insert({ user: ADMIN.email, role: "SUPER_ADMIN", action: "ZZTEST-ของตัวเอง", target: "x" }).select();
  expect(error?.message ?? "", "ผู้ดูแลเขียนตารางบันทึกเองต้องถูกปฏิเสธ (ไม่มีสิทธิ์เขียนตาราง)").toMatch(/permission denied/i);
});

test("คำสั่งบันทึกเข้า/ออกระบบรับได้แค่ 2 เรื่อง (หน้าเว็บกำหนดข้อความเองไม่ได้)", async () => {
  const hq = await as(ADMIN);
  const r = await hq.rpc("audit_auth_event", { p_action: "ZZTEST-เรื่องอื่น" });
  expect(r.error?.message ?? "", "ชนิดเรื่องอื่นต้องถูกปฏิเสธ").toMatch(/invalid auth event/);
  const ok = await hq.rpc("audit_auth_event", { p_action: "เข้าสู่ระบบ" });
  expect(ok.error?.message ?? "", "HQ ลงเข้าสู่ระบบผ่านคำสั่งฐานได้").toBe("");
});

test("สวมบทบาทอื่นไม่ได้", async () => {
  const hq = await as(ADMIN);
  const { error } = await hq.from("audit_log")
    .insert({ user: ADMIN.email, role: "DEALER_SALES", action: "ZZTEST-สวมบทบาท", target: "x" }).select();
  expect(error, "เขียนบันทึกโดยอ้างบทบาทอื่นต้องถูกปฏิเสธ").not.toBeNull();
});

test("ดีลเลอร์เขียนบันทึกของสำนักงานใหญ่ไม่ได้", async () => {
  const dealer = await as(RYG);
  const { error } = await dealer.from("audit_log")
    .insert({ user: RYG.email, role: "DEALER_ADMIN", action: "ZZTEST-ดีลเลอร์เขียน", target: "x" }).select();
  expect(error, "ดีลเลอร์ต้องเขียนบันทึกตรวจสอบไม่ได้").not.toBeNull();
});

test("แก้/ลบบันทึกย้อนหลังไม่ได้ (append-only)", async () => {
  const hq = await as(ADMIN);
  const { data: rows } = await hq.from("audit_log").select("id").limit(1);
  test.skip(!rows?.length, "ยังไม่มีบันทึกในระบบให้ทดสอบ");
  const id = rows![0].id;

  const upd = await hq.from("audit_log").update({ action: "ZZTEST-แก้ย้อนหลัง" }).eq("id", id).select();
  expect(upd.error !== null || (upd.data ?? []).length === 0, "แก้บันทึกย้อนหลังต้องทำไม่ได้").toBe(true);

  const del = await hq.from("audit_log").delete().eq("id", id).select();
  expect(del.error !== null || (del.data ?? []).length === 0, "ลบบันทึกย้อนหลังต้องทำไม่ได้").toBe(true);
});

// ── ปุ่มล้างบันทึกยกเลิกแล้ว (บอสสั่ง 26 ต.ค. 69 แทนคำสั่ง 14 ส.ค. 69 · ใบ 0241) ──────────────────────────────────────
//   เดิมข้อนี้ไม่มี (ปุ่มล้างใช้ได้สำหรับผู้ดูแลสูงสุด) — ตอนนี้ยืนยันว่าถูกปิดทุกชั้น: ปุ่มบนจอ · เส้นทางเซิร์ฟเวอร์ · ฐานข้อมูล
test("ล้างบันทึกถูกปิดแล้ว: ผู้ดูแลสูงสุดไม่มีปุ่ม · เส้นทางเดิมตอบ 'ปิดแล้ว' · ลบตรงด้วยกุญแจฝั่งเซิร์ฟเวอร์ก็ถูกปฏิเสธ · บันทึกไม่หาย", async ({ page }) => {
  const นับ = async () => (await svc.from("audit_log").select("id", { count: "exact", head: true })).count ?? -1;
  const ก่อน = await นับ();
  expect(ก่อน, "ต้องมีบันทึกให้ทดสอบ").toBeGreaterThan(0);

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);   // ADMIN = ผู้ดูแลสูงสุด (SUPER_ADMIN)
  await page.goto(`${HQ_ORIGIN}/hq/audit`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.locator("tbody tr").first(), "หน้าบันทึกการใช้งานเปิดได้ปกติ").toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /ล้างบันทึก/ }), "ไม่มีปุ่มล้างบันทึก").toHaveCount(0);

  const ตอบ = await page.evaluate(async () => {
    const r = await fetch("/api/admin/audit/clear", { method: "POST", credentials: "same-origin" });
    return { status: r.status, body: await r.json().catch(() => ({})) as { error?: string } };
  });
  expect(ตอบ.status, "เส้นทางล้างบันทึกเดิมตอบ 410").toBe(410);
  expect(ตอบ.body.error ?? "", "บอกว่าปิดแล้ว").toContain("ปิดแล้ว");

  const ลบตรง = await svc.from("audit_log").delete().gte("at", "1970-01-01");
  expect(ลบตรง.error?.message ?? "", "ลบตรงด้วยกุญแจฝั่งเซิร์ฟเวอร์ (แบบปุ่มเดิม) → ฐานตอบปิดแล้ว").toContain("ปิดแล้ว");
  const แก้ตรง = await svc.from("audit_log").update({ action: "ZZTEST-แก้ย้อนหลัง" }).gte("at", "1970-01-01");
  expect(แก้ตรง.error?.message ?? "", "แก้ตรงด้วยกุญแจฝั่งเซิร์ฟเวอร์ → ฐานตอบปิดแล้ว").toContain("ปิดแล้ว");
  expect(await นับ(), "บันทึกไม่หายแม้แถวเดียว (อาจเพิ่มจากการเข้าระบบของข้อนี้)").toBeGreaterThanOrEqual(ก่อน);
});
