import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";

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
test.afterAll(async () => { await svc.from("audit_log").delete().like("action", "ZZTEST%"); });

test("ลงบันทึกในนามคนอื่นไม่ได้", async () => {
  const hq = await as(ADMIN);
  const { error } = await hq.from("audit_log")
    .insert({ user: "ZZTEST-สวมชื่อคนอื่น", role: "SUPER_ADMIN", action: "ZZTEST-ปลอมชื่อ", target: "x" }).select();
  expect(error, "เขียนบันทึกโดยใส่ชื่อคนอื่นต้องถูกปฏิเสธ").not.toBeNull();
});

test("ลงบันทึกในนามตัวเองได้ตามปกติ (กฎต้องไม่เข้มจนใช้งานจริงไม่ได้)", async () => {
  const hq = await as(ADMIN);
  const { error } = await hq.from("audit_log")
    .insert({ user: ADMIN.email, role: "SUPER_ADMIN", action: "ZZTEST-ของตัวเอง", target: "x" }).select();
  expect(error?.message ?? "", "ผู้ดูแลต้องเขียนบันทึกของตัวเองได้").toBe("");
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
