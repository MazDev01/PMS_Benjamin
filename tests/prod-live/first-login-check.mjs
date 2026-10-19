// ── ตรวจเข้าระบบครั้งแรกของบัญชีที่ตั้งเครื่องหมาย (เปลี่ยนรหัส + ยืนยันอีเมล) บนเว็บจริง — บอสสั่ง 19 ต.ค. 69 ─────────
//   ใช้บัญชีดีลเลอร์ชั่วคราวของ run.mjs setup · ตั้งเครื่องหมายแบบเดียวกับ scripts/flag-temp-passwords.mjs
//   ต้องเจอ: หน้าตั้งรหัสผ่านใหม่ก่อน → ตั้งแล้วเจอหน้ายืนยันอีเมลติดต่อ · ระหว่างนั้นใช้หน้าระบบไม่ได้
//   ⚠️ หยุดที่หน้ายืนยันอีเมล ไม่กดส่งโค้ด (ไม่ให้มีอีเมลออก) · ล้างด้วย run.mjs files → cleanup.sql ตามปกติ
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.production.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const st = JSON.parse(readFileSync(path.join(process.env.LIVE_STATE_DIR ?? ".", "live-state-prod.json"), "utf8"));
const ด = st.users.find(u => u.role === "DEALER_ADMIN");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ตก = 0;
const ผล = (ok, m) => { if (!ok) ตก++; console.log(`${ok ? "✓" : "✗"} ${m}`); };

const { data: u } = await svc.auth.admin.getUserById(ด.id);
// รหัสกลับเป็นรหัสชั่วคราวของรอบนี้ทุกครั้ง (รันซ้ำได้ — รอบก่อนอาจตั้งรหัสเองไปแล้ว) · แตะเฉพาะบัญชีชั่วคราว
if (!/^live-dealer-\d+@example\.test$/.test(ด.email)) throw new Error("ไม่ใช่บัญชีชั่วคราวของ prod-live — หยุด");
const { error: e1 } = await svc.auth.admin.updateUserById(ด.id, { password: st.password, app_metadata: { ...(u.user?.app_metadata ?? {}), must_change_password: true, must_verify_email: true } });
const { error: e2 } = await svc.from("profiles").update({ contact_email: "", contact_email_verified_at: null }).eq("id", ด.id);
ผล(!e1 && !e2, "ตั้งเครื่องหมายเปลี่ยนรหัส + ยืนยันอีเมลให้บัญชีชั่วคราว (แบบเดียวกับ 155 บัญชี)");

const DEALER = "https://dealerpms.benjaminpebsteel.com";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${DEALER}/login`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
async function เข้าระบบ(password) {
  await page.waitForLoadState("networkidle").catch(() => {});
  const ช่อง = page.locator("#login-email"), ช่องรหัส = page.locator("#login-password");
  for (let a = 1; a <= 3; a++) {
    for (let i = 0; i < 6; i++) {
      await ช่อง.fill(ด.email); await ช่องรหัส.fill(password); await page.waitForTimeout(300);
      if (await ช่อง.inputValue() === ด.email && await ช่องรหัส.inputValue() === password) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    if (await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 }).then(() => true, () => false)) return true;
  }
  return false;
}
ผล(await เข้าระบบ(st.password), "ล็อกอินเว็บดีลเลอร์จริงได้ (รหัสชั่วคราว)");
const หน้าตั้งรหัส = page.getByRole("heading", { name: "ตั้งรหัสผ่านใหม่ก่อนเริ่มใช้งาน" });
ผล(await หน้าตั้งรหัส.waitFor({ timeout: 30_000 }).then(() => true, () => false), "ขั้นแรกถูกพาไปหน้าตั้งรหัสผ่านใหม่");
ผล(await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).count() === 0, "ยังไม่ตั้งรหัส ใช้หน้าระบบไม่ได้");
const ใหม่ = `Nw-${randomBytes(6).toString("hex")}-7Q`;
await page.locator("#fp-new").fill(ใหม่);
await page.locator("#fp-confirm").fill(ใหม่);
await page.getByRole("button", { name: "ตั้งรหัสผ่านใหม่", exact: true }).click();
// ตามที่ออกแบบ: ตั้งรหัสแล้วใบผ่านเดิมใช้ไม่ได้ → ระบบพาไปหน้าเข้าระบบ ให้เข้าใหม่ด้วยรหัสที่ตั้งเอง (FirstPasswordGate)
ผล(await page.waitForURL(/\/login/, { timeout: 30_000 }).then(() => true, () => false), "ตั้งรหัสแล้วถูกพาไปหน้าเข้าระบบใหม่");
ผล(await เข้าระบบ(ใหม่), "เข้าระบบใหม่ด้วยรหัสที่ตั้งเองได้");
const หน้าอีเมล = page.getByRole("heading", { name: "ยืนยันอีเมลติดต่อก่อนเริ่มใช้งาน" });
ผล(await หน้าอีเมล.waitFor({ timeout: 30_000 }).then(() => true, () => false), "ตั้งรหัสแล้วถูกพาไปหน้ายืนยันอีเมลติดต่อ");
ผล(await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).count() === 0, "ยังไม่ยืนยันอีเมล ใช้หน้าระบบไม่ได้");
await browser.close();
const { data: หลัง } = await svc.auth.admin.getUserById(ด.id);
const m = หลัง.user?.app_metadata ?? {};
ผล(m.must_change_password !== true && m.must_verify_email === true, "เครื่องหมายหลังตั้งรหัส: เปลี่ยนรหัสหลุดแล้ว · ยืนยันอีเมลยังค้าง");
const { count } = await svc.from("email_outbox").select("id", { count: "exact", head: true }).eq("ref_table", "profiles").eq("ref_id", ด.id);
ผล((count ?? 0) === 0, "ไม่มีอีเมลออก (ไม่ได้กดส่งโค้ด)");
console.log(ตก ? `ตก ${ตก}` : "ผ่านทั้งหมด");
process.exitCode = ตก ? 1 : 0;
