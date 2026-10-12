import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { open } from "./helpers";
import { HQ_ORIGIN } from "./funcHelpers";

// ── ผู้ใช้สำนักงานใหญ่ดูรหัสผ่านของตัวเอง (บอสสั่ง 2 ก.ย. 69) ──────────────────────
//
// ⚠️ ระบบเห็นรหัสได้เฉพาะ "ตอนผู้ใช้พิมพ์เข้ามาเอง" — Supabase เก็บเป็น hash อ่านกลับไม่ได้
//    บัญชีที่ยังไม่เคยเปลี่ยนรหัสผ่านผ่านหน้าโปรไฟล์จึงยังไม่มีสำเนา ต้องบอกตรง ๆ ไม่ใช่เงียบ
//
// ที่ล็อกไว้:
//   1) ยังไม่มีสำเนา → กดดูแล้วต้องบอกว่าให้เปลี่ยนรหัสหนึ่งครั้งก่อน (และต้องไม่ส่งอีเมลให้เสียเที่ยว)
//   2) มีสำเนาแล้ว → ต้องยืนยันด้วยเลขทางอีเมลก่อนเสมอ · เลขผิดต้องไม่คืนรหัส
//   3) บัญชีของดีลเลอร์ใช้เส้นทางนี้ไม่ได้ (คนละตาราง คนละกติกา)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** ใบผ่านของผู้ดูแล — ใช้ยิงเส้นทาง /api/account/hq-secret โดยตรง */
async function ใบผ่านผู้ดูแล(): Promise<{ token: string; userId: string }> {
  const sb = createClient(ADMIN_SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { data } = await sb.auth.signInWithPassword(ADMIN);
  return { token: data.session?.access_token ?? "", userId: data.user?.id ?? "" };
}

test("[auth·hq] ยังไม่มีสำเนารหัสผ่าน → ต้องบอกให้เปลี่ยนรหัสหนึ่งครั้งก่อน", async ({ request }) => {
  const { token, userId } = await ใบผ่านผู้ดูแล();
  expect(token, "ต้องล็อกอินผู้ดูแลได้ก่อน").not.toBe("");
  await admin.from("hq_login_secrets").delete().eq("user_id", userId);

  const res = await request.post(`${HQ_ORIGIN}/api/account/hq-secret`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { op: "send" },
  });
  expect(res.status(), "ไม่มีสำเนา = 404 ไม่ใช่ส่งอีเมลไปเปล่า ๆ").toBe(404);
  expect(JSON.stringify(await res.json())).toContain("เปลี่ยนรหัสผ่าน");
});

test("[auth·hq] เก็บสำเนาได้เฉพาะรหัสที่ใช้เข้าระบบได้จริง แล้วต้องยืนยันเลขก่อนถึงจะเห็น", async ({ request }) => {
  const { token, userId } = await ใบผ่านผู้ดูแล();

  // รหัสมั่ว = ต้องไม่ถูกเก็บ (ไม่งั้นเจ้าของบัญชีเปิดดูแล้วเห็นรหัสผิด แย่กว่าไม่มีสำเนา)
  const มั่ว = await request.post(`${HQ_ORIGIN}/api/account/hq-secret`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { op: "save", password: "ZZ-ไม่ใช่รหัสจริง-9999" },
  });
  expect(มั่ว.status(), "รหัสที่ใช้เข้าระบบไม่ได้ ต้องไม่ถูกเก็บ").toBe(400);

  // รหัสจริง = เก็บได้
  const จริง = await request.post(`${HQ_ORIGIN}/api/account/hq-secret`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { op: "save", password: ADMIN.password },
  });
  expect(จริง.ok(), `เก็บสำเนารหัสจริงต้องผ่าน — ได้ ${จริง.status()} ${await จริง.text()}`).toBeTruthy();
  const { data: แถว } = await admin.from("hq_login_secrets").select("secret").eq("user_id", userId).maybeSingle();
  expect(แถว?.secret, "ต้องเก็บเป็นค่าที่เข้ารหัสแล้ว ไม่ใช่ข้อความธรรมดา").toMatch(/^v1:/);
  expect(String(แถว?.secret), "ห้ามมีรหัสจริงโผล่ในฐานข้อมูล").not.toContain(ADMIN.password);

  // ขอดูโดยไม่ยืนยันเลข = ไม่ได้
  const เดา = await request.post(`${HQ_ORIGIN}/api/account/hq-secret`, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: { op: "verify", code: "000000" },
  });
  expect(เดา.status(), "เลขผิดต้องไม่คืนรหัส").toBe(400);
  expect(await เดา.text()).not.toContain(ADMIN.password);
});

test("[ux·hq] หน้าโปรไฟล์มีปุ่มดูรหัสผ่านของตัวเอง", async ({ page }) => {
  await open(page, "hq", "/profile");
  // ปุ่มดูรหัสผ่านย้ายไปอยู่ใต้ช่องอีเมล (หน้าโปรไฟล์จัดใหม่ 2 ก.ย. 69) — ยึดที่ตัวปุ่ม ไม่ใช่หัวข้อ
  await expect(page.getByRole("button", { name: "ดูรหัสผ่าน" })).toBeVisible({ timeout: 20_000 });
});
