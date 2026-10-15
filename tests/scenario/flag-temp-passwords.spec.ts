import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";

// ── สคริปต์ตั้งเครื่องหมายบัญชีที่ยังใช้รหัสชั่วคราว — รันแบบแก้จริงบนฐานทดสอบ (ก่อนขึ้นระบบจริง ข้อ 4) ──────────────
//   scripts/flag-temp-passwords.mjs --apply --only <สาขาทดสอบ> · ค่าเชื่อมต่อจาก apps/hq/.env.local (ฐานทดสอบ)
//   สคริปต์หยุดเองถ้าไฟล์ค่าเชื่อมต่อชี้ฐานจริงโดยไม่ใส่ --prod (ดูในสคริปต์) — ข้อนี้ไม่ใส่ --prod
//   ตรวจ: บัญชีรหัสที่คนอื่นตั้งให้ → ได้เครื่องหมาย (ค่าอื่นในบัญชีไม่หาย) · ดีลเลอร์ตั้งเองแล้ว → ไม่ถูกแตะ
//         รันซ้ำไม่ตั้งซ้ำ · บัญชีที่ได้เครื่องหมาย อ่านข้อมูลสาขาไม่ได้จนกว่าจะตั้งรหัสเอง (ด่าน 0187)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const admin = adminClient();
const ชั่วคราว = "ZTX", ตั้งเอง = "ZTU";   // รหัสสาขาทดสอบเฉพาะไฟล์นี้
const รหัส = "Temp-Pass-9182";
const อีเมล = (c: string) => `${c.toLowerCase()}-flagtest@example.test`;

async function purge() {
  for (const c of [ชั่วคราว, ตั้งเอง]) {
    const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", c);
    for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
    await admin.from("dealer_login_secrets").delete().eq("dealer_code", c);
    await ลบสาขาทดสอบตรง(c);
    await admin.from("dealers").delete().eq("code", c);
  }
}
test.beforeAll(purge);
test.afterAll(purge);

async function สร้างสาขา(code: string, ผู้ตั้งรหัส: string) {
  expect((await admin.from("dealers").insert({ code, name: `ZZTEST ${code}`, province: "ตราด", region: "ตะวันออก", revenue_target: 0, status: "active" })).error).toBeNull();
  const { data, error } = await admin.auth.admin.createUser({ email: อีเมล(code), password: รหัส, email_confirm: true, app_metadata: { คงไว้: "ค่าเดิม" } });
  expect(error).toBeNull();
  const id = data.user!.id;
  expect((await admin.from("profiles").upsert({ id, role: "DEALER_ADMIN", dealer_code: code, name: `ZZTEST ${code}`, status: "active" }, { onConflict: "id" })).error).toBeNull();
  expect((await admin.from("dealer_login_secrets").upsert({ dealer_code: code, secret: "x", updated_by: ผู้ตั้งรหัส }, { onConflict: "dealer_code" })).error).toBeNull();
  return id;
}
const รันสคริปต์ = (...extra: string[]) => execFileSync("node", ["scripts/flag-temp-passwords.mjs", "--only", `${ชั่วคราว},${ตั้งเอง}`, ...extra], { encoding: "utf8" });
const เมตา = async (id: string) => ((await admin.auth.admin.getUserById(id)).data.user?.app_metadata ?? {}) as Record<string, unknown>;

test("[script] flag-temp-passwords --apply บนฐานทดสอบ: ตั้งเฉพาะบัญชีรหัสชั่วคราว · ไม่ลบค่าเดิม · รันซ้ำไม่ตั้งซ้ำ · ด่านกันข้อมูลจริง", async () => {
  const idชั่วคราว = await สร้างสาขา(ชั่วคราว, "ผู้ดูแลระบบ (สร้างบัญชี)");
  const idตั้งเอง = await สร้างสาขา(ตั้งเอง, "ZZTEST (ดีลเลอร์ตั้งเอง)");

  // ดูอย่างเดียว (ค่าตั้งต้น) — ต้องไม่แก้อะไร
  const ดู = รันสคริปต์();
  expect(ดู).toContain("ชุดทดสอบ");
  expect(ดู).toMatch(/ต้องตั้งเครื่องหมาย\s+1/);
  expect((await เมตา(idชั่วคราว)).must_change_password, "ดูอย่างเดียวต้องไม่แก้").toBeUndefined();

  // แก้จริง
  const ผล = รันสคริปต์("--apply");
  expect(ผล).toContain("ตั้งเครื่องหมายแล้ว 1 บัญชี");
  const ม = await เมตา(idชั่วคราว);
  expect(ม.must_change_password, "บัญชีรหัสชั่วคราวต้องได้เครื่องหมาย").toBe(true);
  expect(ม.must_verify_email, "ต้องยืนยันอีเมลติดต่อด้วย").toBe(true);
  expect(ม.คงไว้, "ค่าเดิมใน app_metadata ต้องไม่หาย").toBe("ค่าเดิม");
  expect((await เมตา(idตั้งเอง)).must_change_password, "ดีลเลอร์ตั้งรหัสเองแล้วต้องไม่ถูกแตะ").toBeUndefined();
  expect(ผล, "สคริปต์ต้องไม่พิมพ์อีเมล/รหัสสาขา").not.toMatch(new RegExp(`${อีเมล(ชั่วคราว)}|${ชั่วคราว}|${ตั้งเอง}`));

  // รันซ้ำ — ไม่ตั้งซ้ำ
  const ซ้ำ = รันสคริปต์("--apply");
  expect(ซ้ำ).toMatch(/มีเครื่องหมายอยู่แล้ว\s+1/);
  expect(ซ้ำ).toContain("ตั้งเครื่องหมายแล้ว 0 บัญชี");

  // ด่าน 0187: ล็อกอินได้ แต่อ่านข้อมูลสาขาไม่ได้จนกว่าจะตั้งรหัสเอง
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: เข้า } = await sb.auth.signInWithPassword({ email: อีเมล(ชั่วคราว), password: รหัส });
  expect(เข้า, "ยังล็อกอินได้ (เพื่อไปหน้าตั้งรหัส)").toBeNull();
  const อ่าน = await sb.from("leads").select("id").eq("dealer_code", ชั่วคราว);
  expect(อ่าน.error ? 0 : (อ่าน.data?.length ?? 0), "ยังไม่ตั้งรหัสเอง อ่านข้อมูลสาขาไม่ได้").toBe(0);
  const เขียน = await sb.from("leads").insert({ id: "#L-ZTX-1", num_id: 1, dealer_code: ชั่วคราว, company: "ZZTEST", name: "ZZTEST", phone: "0800000000", province: "ตราด", status: "BULLET" });
  expect(เขียน.error, "ยังไม่ตั้งรหัสเอง เขียนข้อมูลไม่ได้").not.toBeNull();
});
