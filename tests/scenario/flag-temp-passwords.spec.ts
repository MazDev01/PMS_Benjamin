import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";

// ── สคริปต์ล้างเครื่องหมาย "ต้องเปลี่ยนรหัส/ต้องยืนยันอีเมล" (--unset) — รันแบบแก้จริงบนฐานทดสอบ (บอสตัดสิน 19 ต.ค. 69) ─────
//   scripts/flag-temp-passwords.mjs --unset --apply --only <สาขาทดสอบ> · ค่าเชื่อมต่อจาก apps/hq/.env.local (ฐานทดสอบ)
//   ตรวจ: นับอย่างเดียวไม่แก้ · ล้างเฉพาะบัญชีดีลเลอร์ที่มีเครื่องหมาย (ค่าอื่นในบัญชีไม่หาย) · บัญชี HQ ไม่ถูกแตะ
//         รันซ้ำไม่มีอะไรให้ล้าง · โหมดตั้งเครื่องหมายเดิมถูกปฏิเสธ · ล้างแล้วบัญชีอ่าน/เขียนข้อมูลสาขาได้ (ด่าน 0187 ไม่กันแล้ว)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const admin = adminClient();
const ครบ = "ZTX", แค่เปลี่ยนรหัส = "ZTW", ไม่มี = "ZTU";   // รหัสสาขาทดสอบเฉพาะไฟล์นี้
const รหัส = "Temp-Pass-9182";
const อีเมล = (c: string) => `${c.toLowerCase()}-flagtest@example.test`;
const อีเมลHQ = "zztest-hq-flagtest@example.test";

async function purge() {
  for (const c of [ครบ, แค่เปลี่ยนรหัส, ไม่มี]) {
    const { data: profs } = await admin.from("profiles").select("id").eq("dealer_code", c);
    for (const p of profs ?? []) await admin.auth.admin.deleteUser(String(p.id)).catch(() => {});
    await admin.from("dealer_login_secrets").delete().eq("dealer_code", c);
    await ลบสาขาทดสอบตรง(c);
    await admin.from("dealers").delete().eq("code", c);
  }
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users.filter(x => x.email === อีเมลHQ)) await admin.auth.admin.deleteUser(u.id).catch(() => {});
}
test.beforeAll(purge);
test.afterAll(purge);

async function สร้างบัญชี(email: string, role: string, code: string, เมตา: Record<string, unknown>) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: รหัส, email_confirm: true, app_metadata: เมตา });
  expect(error).toBeNull();
  const id = data.user!.id;
  expect((await admin.from("profiles").upsert({ id, role, dealer_code: code, name: `ZZTEST ${code || "HQ"}`, status: "active" }, { onConflict: "id" })).error).toBeNull();
  return id;
}
async function สร้างสาขา(code: string, เมตา: Record<string, unknown>) {
  expect((await admin.from("dealers").insert({ code, name: `ZZTEST ${code}`, province: "ตราด", region: "ตะวันออก", revenue_target: 0, status: "active" })).error).toBeNull();
  return สร้างบัญชี(อีเมล(code), "DEALER_ADMIN", code, เมตา);
}
const รันสคริปต์ = (...extra: string[]) => execFileSync("node", ["scripts/flag-temp-passwords.mjs", "--only", `${ครบ},${แค่เปลี่ยนรหัส},${ไม่มี}`, ...extra], { encoding: "utf8" });
const เมตา = async (id: string) => ((await admin.auth.admin.getUserById(id)).data.user?.app_metadata ?? {}) as Record<string, unknown>;

test("[script] flag-temp-passwords --unset บนฐานทดสอบ: ล้างเฉพาะดีลเลอร์ที่มีเครื่องหมาย · ไม่ลบค่าเดิม · HQ ไม่ถูกแตะ · โหมดตั้งถูกปฏิเสธ", async () => {
  const idครบ = await สร้างสาขา(ครบ, { must_change_password: true, must_verify_email: true, คงไว้: "ค่าเดิม" });
  const idแค่เปลี่ยน = await สร้างสาขา(แค่เปลี่ยนรหัส, { must_change_password: true });
  const idไม่มี = await สร้างสาขา(ไม่มี, { คงไว้: "ค่าเดิม" });
  const idHQ = await สร้างบัญชี(อีเมลHQ, "HQ_STAFF", "", { must_change_password: true, must_verify_email: true });

  // โหมดตั้งเครื่องหมายเดิม (ไม่ใส่ --unset) ต้องถูกปฏิเสธ — ตั้งเมื่อไร ด่าน 0187 กันข้อมูลทั้งสาขา
  let ปฏิเสธ = "";
  try { execFileSync("node", ["scripts/flag-temp-passwords.mjs", "--apply"], { encoding: "utf8", stdio: "pipe" }); }
  catch (e) { ปฏิเสธ = String((e as { stderr?: string }).stderr ?? ""); }
  expect(ปฏิเสธ, "โหมดตั้งเครื่องหมายต้องถูกปฏิเสธ").toContain("โหมดตั้งเครื่องหมายยกเลิกแล้ว");

  // นับอย่างเดียว — ต้องไม่แก้อะไร
  const ดู = รันสคริปต์("--unset");
  expect(ดู).toContain("ชุดทดสอบ");
  expect(ดู).toMatch(/ต้องล้างเครื่องหมาย\s+2\b/);
  expect(ดู).toMatch(/ไม่มีเครื่องหมาย\s+1\b/);
  expect((await เมตา(idครบ)).must_change_password, "นับอย่างเดียวต้องไม่แก้").toBe(true);

  const ผล = รันสคริปต์("--unset", "--apply");
  expect(ผล).toContain("ล้างเครื่องหมายแล้ว 2 บัญชี");
  const m = await เมตา(idครบ);
  expect([m.must_change_password, m.must_verify_email, m.คงไว้], "ล้างทั้งสองเครื่องหมาย ค่าเดิมไม่หาย").toEqual([false, false, "ค่าเดิม"]);
  expect((await เมตา(idแค่เปลี่ยน)).must_change_password).toBe(false);
  expect((await เมตา(idไม่มี)).คงไว้, "บัญชีที่ไม่มีเครื่องหมายไม่ถูกแตะ").toBe("ค่าเดิม");
  const hq = await เมตา(idHQ);
  expect([hq.must_change_password, hq.must_verify_email], "บัญชี HQ ต้องไม่ถูกแตะ").toEqual([true, true]);
  expect(ผล, "สคริปต์ต้องไม่พิมพ์อีเมล/รหัสสาขา").not.toMatch(new RegExp(`${อีเมล(ครบ)}|${ครบ}|${แค่เปลี่ยนรหัส}|${ไม่มี}`));

  // รันซ้ำ — ไม่มีอะไรให้ล้าง
  const ซ้ำ = รันสคริปต์("--unset", "--apply");
  expect(ซ้ำ).toMatch(/ต้องล้างเครื่องหมาย\s+0\b/);
  expect(ซ้ำ).toContain("ล้างเครื่องหมายแล้ว 0 บัญชี");

  // ด่าน 0187: ล้างแล้ว ใบผ่านใหม่อ่าน/เขียนข้อมูลของสาขาได้
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: เข้า } = await sb.auth.signInWithPassword({ email: อีเมล(ครบ), password: รหัส });
  expect(เข้า).toBeNull();
  const เขียน = await sb.from("leads").insert({ id: "#L-ZTX-1", num_id: 1, dealer_code: ครบ, company: "ZZTEST", name: "ZZTEST", phone: "0800000000", province: "ตราด", status: "BULLET" });
  expect(เขียน.error, "ล้างเครื่องหมายแล้วต้องเขียนข้อมูลของสาขาได้").toBeNull();
  const อ่าน = await sb.from("leads").select("id").eq("dealer_code", ครบ);
  expect(อ่าน.data?.length ?? 0, "และอ่านได้").toBe(1);
});
