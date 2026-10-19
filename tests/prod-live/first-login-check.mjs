// ── ตรวจบนเว็บจริง: ดีลเลอร์เข้าระบบแล้วเข้าหน้าหลักทันที · HQ เข้าแทนได้ (บอสตัดสิน 19 ต.ค. 69) ─────────────────
//   ใช้บัญชีดีลเลอร์ชั่วคราวของ run.mjs setup · จำลองบัญชีที่ยังมีเครื่องหมายค้าง (แบบ 155 บัญชีก่อนล้าง)
//   ต้องเจอ: เข้าแล้วไป /dashboard ทันที ไม่มีหน้าตั้งรหัส/ยืนยันอีเมล ไม่มีแถบเตือน · หน้าบัญชีมีการ์ดอีเมลติดต่อ
//            HQ กด "เข้าระบบแทน" แล้วเข้าหน้าหลักของดีลเลอร์ได้
//   ⚠️ ไม่ส่งอีเมลใด ๆ · ล้างด้วย run.mjs files → cleanup.sql ตามปกติ
//   หมายเหตุ: บัญชีที่ยังมีเครื่องหมายเปลี่ยนรหัส ฐาน (0187) ยังกันข้อมูล — ข้อนี้ตรวจแค่ "ไม่มีหน้าบังคับ" · ล้างด้วย flag-temp-passwords --unset
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.production.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const st = JSON.parse(readFileSync(path.join(process.env.LIVE_STATE_DIR ?? ".", "live-state-prod.json"), "utf8"));
const ด = st.users.find(u => u.role === "DEALER_ADMIN");
const ห = st.users.find(u => u.role === "SUPER_ADMIN");
if (!/^live-dealer-\d+@example\.test$/.test(ด.email)) throw new Error("ไม่ใช่บัญชีชั่วคราวของ prod-live — หยุด");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ตก = 0;
const ผล = (ok, m) => { if (!ok) ตก++; console.log(`${ok ? "✓" : "✗"} ${m}`); };
const หน้าบังคับ = /ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน|ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน/;

const { data: u } = await svc.auth.admin.getUserById(ด.id);
const { error: e1 } = await svc.auth.admin.updateUserById(ด.id, { password: st.password, app_metadata: { ...(u.user?.app_metadata ?? {}), must_change_password: true, must_verify_email: true } });
const { error: e2 } = await svc.from("profiles").update({ contact_email: "", contact_email_verified_at: null }).eq("id", ด.id);
ผล(!e1 && !e2, "จำลองบัญชีที่ยังมีเครื่องหมายเปลี่ยนรหัส + ยืนยันอีเมลค้าง");

const DEALER = "https://dealerpms.benjaminpebsteel.com", HQ = "https://pms.benjaminpebsteel.com";
const browser = await chromium.launch();
async function เข้าระบบ(page, origin, loginPath, email, password) {
  await page.goto(`${origin}${loginPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const ช่อง = page.locator("#login-email"), ช่องรหัส = page.locator("#login-password");
  for (let a = 1; a <= 3; a++) {
    for (let i = 0; i < 6; i++) {
      await ช่อง.fill(email); await ช่องรหัส.fill(password); await page.waitForTimeout(300);
      if (await ช่อง.inputValue() === email && await ช่องรหัส.inputValue() === password) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    if (await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 }).then(() => true, () => false)) return true;
  }
  return false;
}

// 1) ดีลเลอร์เข้าเอง
{
  const page = await (await browser.newContext()).newPage();
  ผล(await เข้าระบบ(page, DEALER, "/login", ด.email, st.password), "ดีลเลอร์ล็อกอินเว็บจริงได้");
  ผล(await page.waitForURL(/\/dashboard/, { timeout: 30_000 }).then(() => true, () => false), "เข้าแล้วไปหน้าหลัก (/dashboard) ทันที");
  ผล(await page.getByRole("link", { name: "ลูกค้าเป้าหมาย" }).first().waitFor({ timeout: 30_000 }).then(() => true, () => false), "เห็นเมนูของระบบ");
  ผล(await page.getByRole("heading", { name: หน้าบังคับ }).count() === 0, "ไม่มีหน้าบังคับตั้งรหัส/ยืนยันอีเมล");
  ผล(await page.getByRole("alert", { name: "ยังไม่มีอีเมลติดต่อที่ยืนยันแล้ว" }).count() === 0, "ไม่มีแถบเตือนอีเมล");
  await page.goto(`${DEALER}/settings/account`, { waitUntil: "domcontentloaded" });
  ผล(await page.getByRole("region", { name: "อีเมลติดต่อ" }).waitFor({ timeout: 30_000 }).then(() => true, () => false), "หน้าบัญชีมีการ์ดอีเมลติดต่อ (ตามใจดีลเลอร์)");
  await page.context().close();
}
// 2) HQ เข้าระบบแทนดีลเลอร์ (บอส: HQ ต้องเข้าแทนดีลเลอร์ได้ทุกราย)
{
  const page = await (await browser.newContext()).newPage();
  ผล(await เข้าระบบ(page, HQ, "/hq/login", ห.email, st.password), "HQ ล็อกอินเว็บจริงได้");
  const r = await page.request.post(`${HQ}/api/admin/dealers/impersonate?code=${st.code}`);
  ผล(r.status() === 200, `HQ ออกลิงก์เข้าระบบแทนได้ (${r.status()})`);
  const link = r.status() === 200 ? String((await r.json()).link ?? "") : "";
  if (link) {
    const d = await (await browser.newContext()).newPage();
    await d.goto(link, { waitUntil: "domcontentloaded" });
    ผล(await d.waitForURL(/\/dashboard/, { timeout: 60_000 }).then(() => true, () => false), "เข้าแทนแล้วไปหน้าหลักของดีลเลอร์");
    ผล(await d.getByRole("heading", { name: หน้าบังคับ }).count() === 0, "เข้าแทนแล้วไม่เจอหน้าบังคับ");
    await d.context().close();
  }
  await page.context().close();
}
await browser.close();
const { count } = await svc.from("email_outbox").select("id", { count: "exact", head: true }).eq("ref_table", "profiles").eq("ref_id", ด.id);
ผล((count ?? 0) === 0, "ไม่มีอีเมลออก");
console.log(ตก ? `ตก ${ตก}` : "ผ่านทั้งหมด");
process.exitCode = ตก ? 1 : 0;
