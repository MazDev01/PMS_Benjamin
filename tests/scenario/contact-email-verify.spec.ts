import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN, SUPABASE_URL, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";
import { เข้าระบบผ่านหน้าจอ, MAIL_URL as MAIL, โค้ดยืนยันในกล่อง } from "./helpers";

// ── อีเมลติดต่อของดีลเลอร์: ใส่/ยืนยันด้วยโค้ดที่หน้าบัญชี · HQ ยืนยันแทน (ใบ 0194) ─────────────────────────────
//
// บอสตัดสิน 19 ต.ค. 69 (ทับข้อตัดสิน 14 ต.ค. 69): เข้าระบบแล้วเข้าหน้าหลักทันที ไม่มีหน้าบังคับตั้งรหัส/ยืนยันอีเมล ไม่มีแถบเตือน
//   ใส่/ยืนยันอีเมลติดต่อ = หน้าบัญชี (/settings/account · การ์ด "อีเมลติดต่อ") ตามใจดีลเลอร์
//   SMTP ล่ม → เห็นข้อความ + ส่งใหม่ได้ · HQ ยืนยันแทนได้ (บันทึกว่าใครยืนยัน) · เปลี่ยนอีเมลติดต่อ → สถานะยืนยันถูกล้าง (ไม่มีแถบเตือน)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const admin = adminClient();
// อ่าน process.env ก่อนไฟล์ — เหมือน supabaseEnv/adminEnv (15 ต.ค. 69: รันกับฐานอีกตัวแล้วต้องหาคอนเทนเนอร์จดหมาย/กุญแจของฐานนั้น)
const ค่าในไฟล์ = (key: string) => {
  if (process.env[key]) return process.env[key]!;
  try { return (readFileSync(path.join(__dirname, "../../apps/hq/.env.local"), "utf8").match(new RegExp(`^${key}=(.*)$`, "m"))?.[1] ?? "").trim(); }
  catch { return ""; }
};
/** คอนเทนเนอร์กล่องจดหมายทดสอบที่รับ SMTP ของแอปอยู่ (หาจากพอร์ต SMTP_PORT) */
const คอนเทนเนอร์จดหมาย = () => execFileSync("docker", ["ps", "--filter", `publish=${ค่าในไฟล์("SMTP_PORT")}`, "--format", "{{.Names}}"], { encoding: "utf8" }).trim().split(/\r?\n/)[0] ?? "";

const A = { code: "ZTV", email: "ztv-login@example.test", pw: "ZZtest-Temp-ZTV-1", ใหม่: "ZZtest-Own-ZTV-2", ติดต่อ: "zztest-ztv-contact@example.test" };
const B = { code: "ZTW", email: "ztw-login@example.test", pw: "ZZtest-Temp-ZTW-1", ใหม่: "ZZtest-Own-ZTW-2", ติดต่อ: "zztest-ztw-contact@example.test" };

test.beforeAll(async () => { for (const d of [A, B]) await ลบสาขาทดสอบตรง(d.code, admin); });
test.afterAll(async () => {
  for (const d of [A, B]) await ลบสาขาทดสอบตรง(d.code, admin);
  // จดหมายโค้ดยืนยันที่ข้อทดสอบนี้สร้าง (ที่อยู่ของข้อทดสอบเท่านั้น) — ไม่งั้นค้างในกล่องขาออก (check-test-leftovers จับได้ 14 ต.ค. 69)
  await admin.from("email_outbox").delete().ilike("to_email", "zztest-zt%-contact@example.test");
});

const hqToken = async () => (await (await db(ADMIN)).auth.getSession()).data.session?.access_token ?? "";
async function สร้างสาขา(request: import("@playwright/test").APIRequestContext, d: typeof A) {
  const r = await request.post(`${HQ_ORIGIN}/api/admin/dealers`, {
    headers: { authorization: `Bearer ${await hqToken()}` }, timeout: 60_000,
    data: { code: d.code, name: `ZZTEST-อีเมลติดต่อ-${d.code}`, province: "ระยอง", region: "ตะวันออก", revenueTarget: 0,
            email: d.email, password: d.pw, prospectId: await ลูกค้าเป้าหมายรองรับสาขา(d.code) },
  });
  expect(r.status(), await r.text()).toBe(200);
}
// เข้าระบบผ่านหน้าจอจริงทุกครั้ง (ตัวช่วยกลาง · ไม่จำใบผ่าน เพราะรหัสเปลี่ยนระหว่างข้อทดสอบ)
const เข้าระบบ = (page: Page, email: string, password: string) => เข้าระบบผ่านหน้าจอ(page, DEALER_ORIGIN, email, password);
/** เข้าระบบแล้วต้องเข้าหน้าหลักทันที (ไม่มีหน้าบังคับ) แล้วเปิดหน้าบัญชี → การ์ดอีเมลติดต่อ */
async function เปิดการ์ดอีเมลติดต่อ(page: Page, d: typeof A) {
  await เข้าระบบ(page, d.email, d.pw);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: /ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน|ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน/ }), "ไม่มีหน้าบังคับ").toHaveCount(0);
  await expect(page.getByRole("alert", { name: "ยังไม่มีอีเมลติดต่อที่ยืนยันแล้ว" }), "ไม่มีแถบเตือน").toHaveCount(0);
  await page.goto(`${DEALER_ORIGIN}/settings/account`, { waitUntil: "domcontentloaded" });
  const การ์ด = page.getByRole("region", { name: "อีเมลติดต่อ" });
  await expect(การ์ด).toBeVisible({ timeout: 30_000 });
  return การ์ด;
}
const สถานะในฐาน = async (code: string) => {
  const { data } = await admin.from("profiles").select("id, contact_email, contact_email_verified_at").eq("dealer_code", code).eq("role", "DEALER_ADMIN").single();
  const { data: u } = await admin.auth.admin.getUserById(String(data!.id));
  return { email: String(data!.contact_email), verified: !!data!.contact_email_verified_at, mustVerify: u?.user?.app_metadata?.must_verify_email === true };
};
const โค้ดในกล่อง = โค้ดยืนยันในกล่อง;

test("[email·dealer] หน้าบัญชี: ใส่อีเมลติดต่อ → ส่งโค้ด → โค้ดผิดไม่ผ่าน → โค้ดถูก = ยืนยันแล้ว (ไม่บังคับตอนเข้า)", async ({ page, request }) => {
  test.skip(!(await fetch(`${MAIL}/api/v1/messages?limit=1`).then(r => r.ok, () => false)), `ไม่พบกล่องจดหมายทดสอบที่ ${MAIL}`);
  await สร้างสาขา(request, A);
  const การ์ด = await เปิดการ์ดอีเมลติดต่อ(page, A);
  await การ์ด.locator("#ce-email").fill(A.ติดต่อ);
  await การ์ด.getByRole("button", { name: /^ส่งโค้ด/ }).click();
  await expect(การ์ด.getByText(`ส่งโค้ด 6 หลักไปที่ ${A.ติดต่อ} แล้ว`)).toBeVisible({ timeout: 30_000 });
  await การ์ด.locator("#ce-code").fill("000000");
  await การ์ด.getByRole("button", { name: "ยืนยันอีเมล" }).click();
  await expect(การ์ด.getByText("โค้ดไม่ถูกต้อง")).toBeVisible();
  expect((await สถานะในฐาน(A.code)).verified, "โค้ดผิดต้องไม่ยืนยัน").toBe(false);

  await การ์ด.locator("#ce-code").fill(await โค้ดในกล่อง(A.ติดต่อ));
  await การ์ด.getByRole("button", { name: "ยืนยันอีเมล" }).click();
  await expect(การ์ด.getByText(`ยืนยันแล้ว: ${A.ติดต่อ}`)).toBeVisible({ timeout: 30_000 });
  expect(await สถานะในฐาน(A.code), "ยืนยันแล้ว: ฐานจดสถานะ").toEqual({ email: A.ติดต่อ, verified: true, mustVerify: false });
});

test("[email·dealer] เปลี่ยนอีเมลติดต่อ → สถานะยืนยันถูกล้าง · เข้าระบบได้ตามปกติ ไม่มีแถบเตือน · หน้าบัญชีให้ยืนยันใหม่", async ({ page }) => {
  // แก้อีเมลติดต่อที่ฐาน — ตัวดักที่ฐานล้างสถานะยืนยัน
  const s = await สถานะในฐาน(A.code);
  test.skip(!s.verified, "ข้อก่อนหน้าไม่ผ่าน");
  const ryg = await admin.from("profiles").update({ contact_email: "zztest-ztv-new@example.test" }).eq("dealer_code", A.code).eq("role", "DEALER_ADMIN");
  expect(ryg.error).toBeNull();
  expect((await สถานะในฐาน(A.code)).verified, "แก้อีเมลแล้วต้องกลับเป็นยังไม่ยืนยัน").toBe(false);

  const การ์ด = await เปิดการ์ดอีเมลติดต่อ(page, A);
  await expect(การ์ด.locator("#ce-email"), "ยังไม่ยืนยัน = หน้าบัญชีมีฟอร์มให้ยืนยันใหม่").toHaveValue("zztest-ztv-new@example.test");
});

test("[email·dealer] ระบบส่งอีเมลล่ม → ดีลเลอร์เห็นข้อความ ส่งใหม่ได้ · HQ ยืนยันแทนได้และมีบันทึกว่าใครยืนยัน", async ({ page, request }) => {
  let ชื่อคอนเทนเนอร์ = "";
  try { ชื่อคอนเทนเนอร์ = คอนเทนเนอร์จดหมาย(); } catch { /* ไม่มี docker */ }
  test.skip(!ชื่อคอนเทนเนอร์, "ต้องหยุดกล่องจดหมายทดสอบได้ (docker) เพื่อจำลอง SMTP ล่ม");
  await สร้างสาขา(request, B);
  const การ์ด = await เปิดการ์ดอีเมลติดต่อ(page, B);

  execFileSync("docker", ["stop", ชื่อคอนเทนเนอร์], { stdio: "ignore" });
  try {
    await การ์ด.locator("#ce-email").fill(B.ติดต่อ);
    await การ์ด.getByRole("button", { name: /^ส่งโค้ด/ }).click();
    await expect(การ์ด.getByText(/ระบบส่งอีเมลขัดข้อง ส่งโค้ดไม่สำเร็จ/), "ต้องบอกชัดว่าส่งไม่สำเร็จและทางออก").toBeVisible({ timeout: 60_000 });
  } finally {
    execFileSync("docker", ["start", ชื่อคอนเทนเนอร์], { stdio: "ignore" });
  }
  await expect(การ์ด.getByRole("button", { name: /^ส่งโค้ด/ }), "มีปุ่มส่งโค้ดใหม่ให้กดได้").toBeVisible();
  expect((await สถานะในฐาน(B.code)).email, "อีเมลที่กรอกถูกบันทึกไว้แล้ว รอยืนยัน").toBe(B.ติดต่อ);

  // HQ ยืนยันแทน (ไม่พิมพ์อีเมลเอง — ยืนยันอีเมลที่ดีลเลอร์กรอกไว้)
  const hq = await request.post(`${HQ_ORIGIN}/api/admin/dealers/contact-email?code=${B.code}`, { headers: { authorization: `Bearer ${await hqToken()}` } });
  expect(hq.status(), await hq.text()).toBe(200);
  const { data: บันทึก } = await admin.from("audit_log").select("action, target").eq("action", "ยืนยันอีเมลติดต่อแทนดีลเลอร์").like("target", `${B.code}%`);
  expect(บันทึก?.length, "บันทึกการใช้งานว่าใครยืนยันแทน").toBeGreaterThan(0);
  // ดีลเลอร์ยิงเส้นทางของ HQ เองไม่ได้
  const { data: ses } = await (await import("@supabase/supabase-js")).createClient(SUPABASE_URL, ค่าในไฟล์("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: B.email, password: B.pw });
  const เอง = await request.post(`${HQ_ORIGIN}/api/admin/dealers/contact-email?code=${B.code}`, { headers: { authorization: `Bearer ${ses.session?.access_token ?? ""}` } });
  expect(เอง.status(), "ดีลเลอร์ยืนยันอีเมลตัวเองผ่านเส้นทางของ HQ ไม่ได้").toBe(403);

  await การ์ด.getByRole("button", { name: /ตรวจอีกครั้ง/ }).click();
  await expect(การ์ด.getByText(`ยืนยันแล้ว: ${B.ติดต่อ}`), "HQ ยืนยันแทนแล้ว กดตรวจอีกครั้งต้องขึ้นยืนยันแล้ว").toBeVisible({ timeout: 30_000 });
  expect(await สถานะในฐาน(B.code)).toEqual({ email: B.ติดต่อ, verified: true, mustVerify: false });
});
