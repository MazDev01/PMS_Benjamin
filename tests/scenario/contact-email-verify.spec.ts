import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN, SUPABASE_URL, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { adminClient, ลบสาขาทดสอบตรง } from "./testDealers";
import { settle } from "./helpers";

// ── อีเมลติดต่อของดีลเลอร์: ยืนยันด้วยโค้ดตอนเข้าครั้งแรก · แถบเตือน · HQ ยืนยันแทน (ด่าน 1 · ใบ 0194) ─────────────
//
// ข้อตัดสินของบอส 14 ต.ค. 69:
//   - หน้าตั้งรหัสครั้งแรกมีขั้นกรอกอีเมลติดต่อ + ยืนยันด้วยโค้ดก่อนเข้าใช้งาน (ตั้งรหัสแล้วแต่ไม่ยืนยัน = ยังผ่านด่านไม่ได้)
//   - ด่านอยู่ที่หน้าจออย่างเดียว · SMTP ล่ม → ดีลเลอร์ไม่ติดค้าง เห็นข้อความ และ HQ ยืนยันแทนได้ (บันทึกว่าใครยืนยัน)
//   - เปลี่ยนอีเมลติดต่อ → สถานะยืนยันถูกล้าง แถบเตือน (ปิดไม่ได้ ไม่บล็อกการใช้งาน) กลับมา
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const admin = adminClient();
const MAIL = process.env.PMS_MAIL_URL ?? SUPABASE_URL.replace(/:(\d+)\/?$/, (_m, p) => `:${Number(p) + 3}`);
const ค่าในไฟล์ = (key: string) => {
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
/** เข้าระบบผ่านหน้าจอจริงทุกครั้ง — ไม่ใช้ loginUI เพราะตัวนั้นจำใบผ่านต่อบัญชีไว้ (ใบผ่านของรหัสชั่วคราวใช้ไม่ได้แล้วหลังตั้งรหัสใหม่)
 *  และฝังสคริปต์วางใบผ่านไว้กับหน้า ซึ่งจะทับการเข้าระบบครั้งที่สองของบัญชีเดียวกัน */
async function เข้าระบบ(page: Page, email: string, password: string) {
  await page.goto(`${DEALER_ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ช่องอีเมล = page.getByLabel(/อีเมล/i).first(), ช่องรหัส = page.getByLabel(/รหัสผ่าน/i).first();
  // หน้าเข้าสู่ระบบเพิ่งโหลด อาจล้างช่องทิ้งตอนพร้อมใช้งาน — กรอกซ้ำจนค่าอยู่นิ่ง (วิธีเดียวกับ loginUI)
  for (let i = 0; i < 6; i++) {
    await ช่องอีเมล.fill(email); await ช่องรหัส.fill(password);
    await page.waitForTimeout(300);
    if (await ช่องอีเมล.inputValue() === email && await ช่องรหัส.inputValue() === password) break;
  }
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 });
}
/** เข้าครั้งแรกด้วยรหัสจาก HQ → ตั้งรหัสของตัวเอง → เข้าใหม่ด้วยรหัสใหม่ */
async function ตั้งรหัสครั้งแรกแล้วเข้าใหม่(page: Page, d: typeof A) {
  await เข้าระบบ(page, d.email, d.pw);
  await expect(page.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" })).toBeVisible({ timeout: 30_000 });
  await page.locator("#fp-new").fill(d.ใหม่);
  await page.locator("#fp-confirm").fill(d.ใหม่);
  await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่", exact: true }).click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await เข้าระบบ(page, d.email, d.ใหม่);
}
const สถานะในฐาน = async (code: string) => {
  const { data } = await admin.from("profiles").select("id, contact_email, contact_email_verified_at").eq("dealer_code", code).eq("role", "DEALER_ADMIN").single();
  const { data: u } = await admin.auth.admin.getUserById(String(data!.id));
  return { email: String(data!.contact_email), verified: !!data!.contact_email_verified_at, mustVerify: u?.user?.app_metadata?.must_verify_email === true };
};
async function โค้ดในกล่อง(ถึง: string): Promise<string> {
  let โค้ด = "";
  await expect.poll(async () => {
    const j = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${ถึง}`)}`)).json() as { messages?: { Subject: string }[] };
    โค้ด = (j.messages ?? []).map(m => /(\d{6})\s*$/.exec(m.Subject)?.[1] ?? "").find(Boolean) ?? "";
    return โค้ด;
  }, { timeout: 20_000, message: `ต้องมีอีเมลโค้ดยืนยันถึง ${ถึง}` }).not.toBe("");
  return โค้ด;
}

test("[email·dealer] เข้าครั้งแรก: ตั้งรหัสแล้วต้องยืนยันอีเมลติดต่อก่อนใช้งาน · ยังไม่ยืนยัน = ยังผ่านด่านไม่ได้", async ({ page, request }) => {
  test.skip(!(await fetch(`${MAIL}/api/v1/messages?limit=1`).then(r => r.ok, () => false)), `ไม่พบกล่องจดหมายทดสอบที่ ${MAIL}`);
  await สร้างสาขา(request, A);
  await ตั้งรหัสครั้งแรกแล้วเข้าใหม่(page, A);

  const ด่าน = page.getByRole("heading", { name: "ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน" });
  await expect(ด่าน, "ตั้งรหัสแล้ว ต้องเจอขั้นยืนยันอีเมลต่อ").toBeVisible({ timeout: 30_000 });
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect(ด่าน, "เปิดหน้าอื่นตรง ๆ ก็ยังติดด่าน").toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" })).toHaveCount(0);

  await page.locator("#ce-email").fill(A.ติดต่อ);
  await page.getByRole("button", { name: /^ส่งโค้ด/ }).click();
  await expect(page.getByText(`ส่งโค้ด 6 หลักไปที่ ${A.ติดต่อ} แล้ว`)).toBeVisible({ timeout: 30_000 });
  await page.locator("#ce-code").fill("000000");
  await page.getByRole("button", { name: "ยืนยันอีเมล" }).click();
  await expect(page.getByText("โค้ดไม่ถูกต้อง")).toBeVisible();
  expect((await สถานะในฐาน(A.code)).verified, "โค้ดผิดต้องไม่ยืนยัน").toBe(false);

  await page.locator("#ce-code").fill(await โค้ดในกล่อง(A.ติดต่อ));
  await page.getByRole("button", { name: "ยืนยันอีเมล" }).click();
  await expect(ด่าน).toHaveCount(0, { timeout: 30_000 });
  const s = await สถานะในฐาน(A.code);
  expect(s, "ยืนยันแล้ว: ฐานจดสถานะ และปลดเครื่องหมายต้องยืนยัน").toEqual({ email: A.ติดต่อ, verified: true, mustVerify: false });
  await expect(page.getByRole("alert", { name: "ยังไม่มีอีเมลติดต่อที่ยืนยันแล้ว" }), "ยืนยันแล้วต้องไม่มีแถบเตือน").toHaveCount(0);
});

test("[email·dealer] เปลี่ยนอีเมลติดต่อ → สถานะยืนยันถูกล้าง แถบเตือนกลับมา และยังใช้งานได้ตามปกติ", async ({ page }) => {
  // แก้อีเมลติดต่อจาก A เป็น B (ทางเดียวกับที่ดีลเลอร์แก้ในหน้าโปรไฟล์ — ตัวดักที่ฐานล้างสถานะ)
  const s = await สถานะในฐาน(A.code);
  test.skip(!s.verified, "ข้อก่อนหน้าไม่ผ่าน");
  const ryg = await admin.from("profiles").update({ contact_email: "zztest-ztv-new@example.test" }).eq("dealer_code", A.code).eq("role", "DEALER_ADMIN");
  expect(ryg.error).toBeNull();
  expect((await สถานะในฐาน(A.code)).verified, "แก้อีเมลแล้วต้องกลับเป็นยังไม่ยืนยัน").toBe(false);

  await เข้าระบบ(page, A.email, A.ใหม่);
  const แถบ = page.getByRole("alert", { name: "ยังไม่มีอีเมลติดต่อที่ยืนยันแล้ว" });
  await expect(แถบ, "แถบเตือนต้องกลับมา").toBeVisible({ timeout: 30_000 });
  await expect(แถบ.getByRole("button", { name: /ปิด/ }), "แถบเตือนปิดไม่ได้").toHaveCount(0);
  await expect(page.getByRole("heading", { name: "ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน" }), "ไม่บล็อกการใช้งาน (ไม่ใช่ด่าน)").toHaveCount(0);
});

test("[email·dealer] ระบบส่งอีเมลล่ม → ดีลเลอร์ไม่ติดค้าง เห็นข้อความ · HQ ยืนยันแทนได้และมีบันทึกว่าใครยืนยัน", async ({ page, request }) => {
  let ชื่อคอนเทนเนอร์ = "";
  try { ชื่อคอนเทนเนอร์ = คอนเทนเนอร์จดหมาย(); } catch { /* ไม่มี docker */ }
  test.skip(!ชื่อคอนเทนเนอร์, "ต้องหยุดกล่องจดหมายทดสอบได้ (docker) เพื่อจำลอง SMTP ล่ม");
  await สร้างสาขา(request, B);
  await ตั้งรหัสครั้งแรกแล้วเข้าใหม่(page, B);
  await expect(page.getByRole("heading", { name: "ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน" })).toBeVisible({ timeout: 30_000 });

  execFileSync("docker", ["stop", ชื่อคอนเทนเนอร์], { stdio: "ignore" });
  try {
    await page.locator("#ce-email").fill(B.ติดต่อ);
    await page.getByRole("button", { name: /^ส่งโค้ด/ }).click();
    await expect(page.getByText(/ระบบส่งอีเมลขัดข้อง ส่งโค้ดไม่สำเร็จ/), "ต้องบอกชัดว่าส่งไม่สำเร็จและทางออก").toBeVisible({ timeout: 60_000 });
  } finally {
    execFileSync("docker", ["start", ชื่อคอนเทนเนอร์], { stdio: "ignore" });
  }
  await expect(page.getByRole("button", { name: /^ส่งโค้ด/ }), "มีปุ่มส่งโค้ดใหม่ให้กดได้").toBeVisible();
  await expect(page.getByRole("button", { name: /ออกจากระบบ/ }), "ไม่ติดค้าง — ออกจากระบบได้").toBeVisible();
  expect((await สถานะในฐาน(B.code)).email, "อีเมลที่กรอกถูกบันทึกไว้แล้ว รอยืนยัน").toBe(B.ติดต่อ);

  // HQ ยืนยันแทน (ไม่พิมพ์อีเมลเอง — ยืนยันอีเมลที่ดีลเลอร์กรอกไว้)
  const hq = await request.post(`${HQ_ORIGIN}/api/admin/dealers/contact-email?code=${B.code}`, { headers: { authorization: `Bearer ${await hqToken()}` } });
  expect(hq.status(), await hq.text()).toBe(200);
  const { data: บันทึก } = await admin.from("audit_log").select("action, target").eq("action", "ยืนยันอีเมลติดต่อแทนดีลเลอร์").like("target", `${B.code}%`);
  expect(บันทึก?.length, "บันทึกการใช้งานว่าใครยืนยันแทน").toBeGreaterThan(0);
  // ดีลเลอร์ยิงเส้นทางของ HQ เองไม่ได้
  const { data: ses } = await (await import("@supabase/supabase-js")).createClient(SUPABASE_URL, ค่าในไฟล์("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } })
    .auth.signInWithPassword({ email: B.email, password: B.ใหม่ });
  const เอง = await request.post(`${HQ_ORIGIN}/api/admin/dealers/contact-email?code=${B.code}`, { headers: { authorization: `Bearer ${ses.session?.access_token ?? ""}` } });
  expect(เอง.status(), "ดีลเลอร์ยืนยันอีเมลตัวเองผ่านเส้นทางของ HQ ไม่ได้").toBe(403);

  await page.getByRole("button", { name: /ตรวจอีกครั้ง/ }).click();
  await expect(page.getByRole("heading", { name: "ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน" }), "HQ ยืนยันแทนแล้ว กดตรวจอีกครั้งต้องผ่าน").toHaveCount(0, { timeout: 30_000 });
  expect(await สถานะในฐาน(B.code)).toEqual({ email: B.ติดต่อ, verified: true, mustVerify: false });
});
