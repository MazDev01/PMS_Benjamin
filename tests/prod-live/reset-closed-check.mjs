// ── ตรวจบนเว็บจริง: /reset-password ปิดแล้ว · ทางลัดเปลี่ยนรหัสเดิม 2 ทางถูกปฏิเสธ (รอบ 2 ช่วง ก · บอสสั่ง 20 ต.ค. 69) ──────
//   ใช้บัญชีชั่วคราวของ run.mjs setup (live-*@example.test) · ไม่ส่งอีเมล · ล้างด้วย run.mjs files → cleanup.sql ตามปกติ
//   ต้องเจอ:
//     - ดีลเลอร์ที่เข้าระบบอยู่ เปิด https://dealerpms…/reset-password → /dashboard · ไม่มีช่องรหัสผ่าน
//     - HQ ที่เข้าระบบอยู่ เปิด https://pms…/reset-password → /hq/dashboard · ไม่มีช่องรหัสผ่าน
//     - POST /api/account/reset-done และ POST /api/account {op:"first-password"} ด้วยใบผ่านดีลเลอร์ → 410
//     - หลังเรียก: สำเนารหัสของสาขาไม่ถูกลบ · ไม่มีประวัติ "ลืมรหัสผ่าน" เพิ่ม · รหัสเดิมยังเข้าได้
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.production.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const st = JSON.parse(readFileSync(path.join(process.env.LIVE_STATE_DIR ?? ".", "live-state-prod.json"), "utf8"));
const ด = st.users.find(u => u.role === "DEALER_ADMIN");
const ห = st.users.find(u => u.role === "SUPER_ADMIN");
if (!/^live-dealer-\d+@example\.test$/.test(ด.email) || !/^live-hq-\d+@example\.test$/.test(ห.email)) throw new Error("ไม่ใช่บัญชีชั่วคราวของ prod-live — หยุด");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
let ตก = 0;
const ผล = (ok, m) => { if (!ok) ตก++; console.log(`${ok ? "✓" : "✗"} ${m}`); };
const DEALER = "https://dealerpms.benjaminpebsteel.com", HQ = "https://pms.benjaminpebsteel.com";

// สำเนารหัสของสาขาทดสอบ (ใส่ไว้ก่อน ให้รู้ว่าทางลัดเดิมไม่ได้ลบ) — ค่าในช่องเป็นข้อความปลอม ไม่ใช่รหัสจริง
await svc.from("dealer_login_secrets").upsert({ dealer_code: st.code, secret: "zz-live-check", updated_at: new Date().toISOString(), updated_by: "prod-live (ทดสอบ)" });
const นับประวัติ = async () => (await svc.from("dealer_account_changes").select("id", { count: "exact", head: true }).eq("dealer_code", st.code)).count ?? 0;
const ก่อน = await นับประวัติ();

const browser = await chromium.launch();
async function เข้าระบบ(page, origin, loginPath, email, password) {
  await page.goto(`${origin}${loginPath}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const ช่อง = page.locator("#login-email"), ช่องรหัส = page.locator("#login-password");
  for (let i = 0; i < 6; i++) {
    await ช่อง.fill(email); await ช่องรหัส.fill(password); await page.waitForTimeout(300);
    if (await ช่อง.inputValue() === email && await ช่องรหัส.inputValue() === password) break;
  }
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  return page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 }).then(() => true, () => false);
}
for (const [ชื่อ, origin, loginPath, who, ปลายทาง] of [
  ["ดีลเลอร์", DEALER, "/login", ด, /\/dashboard$/],
  ["HQ", HQ, "/hq/login", ห, /\/hq\/dashboard$/],
]) {
  const page = await (await browser.newContext()).newPage();
  ผล(await เข้าระบบ(page, origin, loginPath, who.email, st.password), `${ชื่อ} ล็อกอินเว็บจริงได้`);
  await page.goto(`${origin}/reset-password`, { waitUntil: "domcontentloaded" });
  ผล(await page.waitForURL(ปลายทาง, { timeout: 30_000 }).then(() => true, () => false), `${ชื่อ} เปิด /reset-password → ถูกพาไปหน้าหลัก (ได้ ${new URL(page.url()).pathname})`);
  ผล(await page.locator("input[type=password]").count() === 0, `${ชื่อ} ไม่มีช่องตั้งรหัสผ่านใหม่`);
  await page.context().close();
}
await browser.close();

const { data: s } = await anon().auth.signInWithPassword({ email: ด.email, password: st.password });
const หัว = { authorization: `Bearer ${s.session?.access_token ?? ""}`, "content-type": "application/json" };
const r1 = await fetch(`${HQ}/api/account/reset-done`, { method: "POST", headers: หัว, body: "{}" });
ผล(r1.status === 410, `ทางลัด reset-done ถูกปฏิเสธ (${r1.status})`);
const r2 = await fetch(`${HQ}/api/account`, { method: "POST", headers: หัว, body: JSON.stringify({ op: "first-password", password: "ZZlive-Never-Used-9" }) });
ผล(r2.status === 410, `ทางลัด first-password ถูกปฏิเสธ (${r2.status})`);

const { data: sec } = await svc.from("dealer_login_secrets").select("secret").eq("dealer_code", st.code).maybeSingle();
ผล(sec?.secret === "zz-live-check", "สำเนารหัสของสาขาไม่ถูกลบ");
ผล((await นับประวัติ()) === ก่อน, "ไม่มีประวัติเปลี่ยนรหัสเพิ่ม");
const { error } = await anon().auth.signInWithPassword({ email: ด.email, password: st.password });
ผล(!error, "รหัสเดิมยังเข้าระบบได้");
console.log(ตก ? `ตก ${ตก}` : "ผ่านทั้งหมด");
process.exitCode = ตก ? 1 : 0;
