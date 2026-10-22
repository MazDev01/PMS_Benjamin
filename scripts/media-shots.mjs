// ถ่ายภาพหน้าจอจริงจากระบบ (ฐานในเครื่อง) ไว้ใส่สไลด์นำเสนอ
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)

const read = p => Object.fromEntries(fs.readFileSync(p, "utf8").split(/\r?\n/)
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const T = read("tests/.env.test"), H = read("apps/hq/.env.local");
const OUT = "สื่อนำเสนอ/ภาพหน้าจอ";
fs.mkdirSync(OUT, { recursive: true });
const anon = () => createClient(H.NEXT_PUBLIC_SUPABASE_URL, H.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const KEY = `sb-${new URL(H.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

// เช็กก่อนว่าเซิร์ฟเวอร์เปิดอยู่ไหม — ไม่งั้นจะพังด้วยข้อความ ERR_CONNECTION_REFUSED ที่อ่านไม่รู้เรื่อง
for (const origin of [เว็บ.dealer, เว็บ.hq]) {
  const ok = await fetch(origin, { method: "HEAD" }).then(() => true, () => false);
  if (!ok) {
    console.error(`เปิดเซิร์ฟเวอร์ก่อน: npm run dev  (ยังต่อ ${origin} ไม่ได้)`);
    process.exit(1);
  }
}

const หน้าที่ถ่าย = [
  { ไฟล์: "hq-dashboard.png",  ผู้ใช้: "admin", url: `${เว็บ.hq}/hq/dashboard`, รอ: 9000 },
  { ไฟล์: "hq-dealers.png",    ผู้ใช้: "admin", url: `${เว็บ.hq}/hq/dealers`,   รอ: 8000 },
  { ไฟล์: "hq-master.png",     ผู้ใช้: "admin", url: `${เว็บ.hq}/hq/master`,    รอ: 8000 },
  { ไฟล์: "dealer-dashboard.png", ผู้ใช้: "ryg", url: `${เว็บ.dealer}/dashboard`,   รอ: 9000 },
  { ไฟล์: "dealer-leads.png",  ผู้ใช้: "ryg",  url: `${เว็บ.dealer}/leads`,         รอ: 8000 },
  { ไฟล์: "dealer-quotations.png", ผู้ใช้: "ryg", url: `${เว็บ.dealer}/quotations`, รอ: 8000 },
  { ไฟล์: "dealer-account.png", ผู้ใช้: "ryg", url: `${เว็บ.dealer}/settings/account`, รอ: 7000 },
  { ไฟล์: "dealer-customers.png", ผู้ใช้: "ryg", url: `${เว็บ.dealer}/customers`, รอ: 8000 },
  { ไฟล์: "dealer-calendar.png", ผู้ใช้: "ryg", url: `${เว็บ.dealer}/calendar`, รอ: 8000 },
  { ไฟล์: "hq-pipeline.png", ผู้ใช้: "admin", url: `${เว็บ.hq}/hq/pipeline`, รอ: 8000 },
  { ไฟล์: "hq-quotations.png", ผู้ใช้: "admin", url: `${เว็บ.hq}/hq/quotations`, รอ: 8000 },
  { ไฟล์: "hq-customers.png", ผู้ใช้: "admin", url: `${เว็บ.hq}/hq/customers`, รอ: 8000 },
  { ไฟล์: "hq-audit.png", ผู้ใช้: "admin", url: `${เว็บ.hq}/hq/audit`, รอ: 7000 },
  { ไฟล์: "login-dealer.png", ผู้ใช้: null, url: `${เว็บ.dealer}/login`, รอ: 5000 },
];

const s = {
  admin: (await anon().auth.signInWithPassword({ email: T.TEST_ADMIN_EMAIL, password: T.TEST_ADMIN_PASSWORD })).data.session,
  ryg:   (await anon().auth.signInWithPassword({ email: T.TEST_RYG_EMAIL,   password: T.TEST_RYG_PASSWORD })).data.session,
};
const b = await chromium.launch();
for (const ห of หน้าที่ถ่าย) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const origin = new URL(ห.url).origin;
  await page.goto(`${origin}${origin === เว็บ.hq ? "/hq/login" : "/login"}`, { waitUntil: "domcontentloaded" });
  // หน้าที่ถ่ายตอนยังไม่เข้าระบบ (หน้าเข้าสู่ระบบ) = ไม่ต้องยัด session
  if (ห.ผู้ใช้) await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(s[ห.ผู้ใช้])]);
  await page.goto(ห.url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(ห.รอ);
  await page.screenshot({ path: `${OUT}/${ห.ไฟล์}` });
  console.log("shot", ห.ไฟล์, (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 70));
  await ctx.close();
}
await b.close();
