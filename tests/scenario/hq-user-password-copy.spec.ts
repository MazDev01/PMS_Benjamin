// ── ผู้ใช้สำนักงานใหญ่: รหัสผ่านชั่วคราวในฟอร์มใช้ได้จริง · สำเนารหัสตรงกับของจริงเสมอ (15 ก.ย. 69) ──
//
// เดิม 2 เรื่อง:
//   1) ฟอร์มเพิ่มผู้ใช้มีช่อง "รหัสผ่านชั่วคราว" แต่ไม่ถูกส่งไป — ผู้ใช้ได้รหัสสุ่มคนละตัวกับที่เห็นในฟอร์ม
//   2) ผู้ดูแลตั้งรหัสใหม่ให้แล้ว สำเนาที่เจ้าของบัญชีเปิดดูได้ยังเป็นรหัสเก่าที่ใช้ไม่ได้
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, db } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

const EMAIL = "zztest-hq-user-pw@example.co.th";
const PASSWORD = "ZZtest-HQTemp-2569";
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function purge() {
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of users?.users ?? []) {
    if (u.email !== EMAIL) continue;
    await admin.from("hq_login_secrets").delete().eq("user_id", u.id).then(() => {}, () => {});
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
}
test.beforeAll(purge);
test.afterAll(purge);

const เข้าได้ = async (password: string) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword({ email: EMAIL, password });
  return !error;
};

test("[api·hq] รหัสชั่วคราวที่กรอกใช้เข้าระบบได้จริง · ผู้ดูแลตั้งรหัสใหม่แล้วสำเนาเปลี่ยนตาม", async ({ request }) => {
  const token = (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
  const hdr = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const มีช่องว่าง = await request.post(`${HQ_ORIGIN}/api/admin/users`, {
    headers: hdr, data: { name: "ZZTEST ผู้ใช้รหัสชั่วคราว", email: EMAIL, department: "ฝ่ายขาย", password: "มี ช่องว่าง 1234" },
  });
  test.skip(มีช่องว่าง.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(มีช่องว่าง.status(), "รหัสชั่วคราวผิดกติกาต้องถูกปฏิเสธ").toBe(400);

  const สร้าง = await request.post(`${HQ_ORIGIN}/api/admin/users`, {
    headers: hdr, data: { name: "ZZTEST ผู้ใช้รหัสชั่วคราว", email: EMAIL, department: "ฝ่ายขาย", password: PASSWORD },
  });
  expect(สร้าง.status(), await สร้าง.text()).toBe(200);
  const { id, password } = await สร้าง.json() as { id: string; password: string };
  expect(password, "ต้องใช้รหัสที่กรอกในฟอร์ม ไม่ใช่สุ่มใหม่").toBe(PASSWORD);
  expect(await เข้าได้(PASSWORD), "รหัสชั่วคราวที่กรอกต้องเข้าระบบได้จริง").toBe(true);

  const สำเนา = async () => ((await admin.from("hq_login_secrets").select("secret").eq("user_id", id).maybeSingle()).data as { secret: string } | null)?.secret ?? null;
  const ตอนสร้าง = await สำเนา();

  const ตั้งใหม่ = await request.patch(`${HQ_ORIGIN}/api/admin/users?id=${id}`, { headers: hdr, data: { password: "ZZtest-HQReset-2569" } });
  expect(ตั้งใหม่.status(), await ตั้งใหม่.text()).toBe(200);
  expect(await เข้าได้("ZZtest-HQReset-2569"), "รหัสที่ผู้ดูแลตั้งใหม่ต้องเข้าได้").toBe(true);
  const หลังตั้ง = await สำเนา();

  if (ตอนสร้าง === null) {
    // เครื่องนี้ไม่ได้ตั้งกุญแจเข้ารหัส — ต้องไม่มีสำเนาเก่าค้างอยู่เลย (ห้ามโชว์รหัสที่ใช้ไม่ได้)
    expect(หลังตั้ง, "ไม่มีกุญแจ = ต้องไม่มีสำเนาค้าง").toBeNull();
  } else {
    expect(หลังตั้ง, "ตั้งรหัสใหม่แล้วต้องมีสำเนา").not.toBeNull();
    expect(หลังตั้ง, "สำเนาต้องเปลี่ยนเป็นรหัสใหม่ ไม่ค้างรหัสเก่า").not.toBe(ตอนสร้าง);
  }
});
