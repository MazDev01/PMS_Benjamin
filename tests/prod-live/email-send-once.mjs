// ── ทดสอบส่งอีเมลจริง 1 ฉบับ ผ่านทางเดียวกับดีลเลอร์ (บอสอนุมัติ 19 ต.ค. 69) ───────────────────────────
//   ล็อกอินเว็บดีลเลอร์จริงด้วยบัญชีชั่วคราวของ run.mjs setup → POST /api/account op contact-email-send ไปที่ผู้รับแจ้งเตือน HQ คนแรก
//   ส่งครั้งเดียว · ไม่พิมพ์อีเมล/รหัส/โค้ด · บันทึกรหัสบัญชีทดสอบไว้ในไฟล์สถานะ (ใช้ลบทีหลัง: email-send-cleanup.mjs)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(readFileSync(".env.production.local", "utf8").split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const STATE = path.join(process.env.LIVE_STATE_DIR ?? ".", "live-state-prod.json");
const st = JSON.parse(readFileSync(STATE, "utf8"));
if (st.emailTest) { console.error("✗ ส่งไปแล้วในรอบนี้ — ไม่ส่งซ้ำ"); process.exit(1); }
const ดีลเลอร์ = st.users.find(u => u.role === "DEALER_ADMIN");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: rule } = await svc.from("hq_notif_rules").select("email_recipients").eq("id", 1).single();
const ผู้รับ = (rule?.email_recipients ?? []).filter(Boolean);
console.log(`ผู้รับแจ้งเตือน HQ ที่ตั้งไว้: ${ผู้รับ.length} ที่อยู่ · ส่งไปที่อยู่แรก`);
if (!ผู้รับ.length) { console.error("✗ ไม่มีผู้รับแจ้งเตือน HQ"); process.exit(1); }

const DEALER = "https://dealerpms.benjaminpebsteel.com";
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${DEALER}/login`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
const email = page.getByLabel(/อีเมล/i).first(), pass = page.getByLabel(/รหัสผ่าน/i).first();
let เข้าได้ = false;
for (let attempt = 1; attempt <= 3 && !เข้าได้; attempt++) {
  for (let i = 0; i < 6; i++) {
    await email.fill(ดีลเลอร์.email); await pass.fill(st.password); await page.waitForTimeout(300);
    if (await email.inputValue() === ดีลเลอร์.email && await pass.inputValue() === st.password) break;
  }
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
  เข้าได้ = await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 }).then(() => true, () => false);
}
if (!เข้าได้) { await browser.close(); console.error("✗ ล็อกอินเว็บดีลเลอร์ไม่ผ่าน — ยังไม่ได้ส่ง"); process.exit(1); }
console.log("✓ ล็อกอินเว็บดีลเลอร์จริงแล้ว");

st.emailTest = { userId: ดีลเลอร์.id, at: new Date().toISOString() };   // จดก่อนส่ง = กันส่งซ้ำแม้คำสั่งล้มกลางทาง
writeFileSync(STATE, JSON.stringify(st));
const r = await page.request.post(`${DEALER}/api/account`, { data: { op: "contact-email-send", email: ผู้รับ[0] } });
const ตอบ = await r.json().catch(() => ({}));
const เวลา = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(11, 16);
console.log(`${r.status() === 200 && ตอบ.sentTo ? "✓" : "✗"} ส่งโค้ด → ${r.status()} · เวลา ${เวลา} น.${ตอบ.error ? ` · ${ตอบ.error}` : ""}`);
await browser.close();

const { data: แถว } = await svc.from("email_outbox").select("id, kind, status, attempts, last_error, sent_at").eq("ref_table", "profiles").eq("ref_id", ดีลเลอร์.id);
for (const x of แถว ?? []) {
  const ส่ง = x.sent_at ? new Date(Date.parse(x.sent_at) + 7 * 3_600_000).toISOString().slice(11, 19) : "—";
  console.log(`กล่องขาออก แถว ${x.id} · ${x.kind} · สถานะ ${x.status} · ครั้งที่ ${x.attempts} · ส่งเมื่อ ${ส่ง} น.${x.last_error ? ` · ${x.last_error.slice(0, 200)}` : ""}`);
}
if (!แถว?.length) console.log("✗ ไม่พบแถวในกล่องขาออกของบัญชีทดสอบ");
