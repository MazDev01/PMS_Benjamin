// อัดวิดีโอสาธิตการใช้งานระบบ (ฐานข้อมูลในเครื่อง) — ไว้เปิดในวันนำเสนอ
//   รันตอนไม่มีชุดทดสอบรันอยู่:  node tmp-demo-video.mjs
//   ได้ไฟล์ .webm ที่ สื่อนำเสนอ/วิดีโอ/ (คลิปละหนึ่งเรื่อง)
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { ต้นทาง as ต้นทางเว็บ } from "./lib/session.mjs";
const เว็บ = ต้นทางเว็บ("dev");   // ที่อยู่เว็บในเครื่องของโฟลเดอร์นี้ — ห้ามเขียนพอร์ตเอง (check-hardcoded-ports)

const อ่านenv = p => Object.fromEntries(fs.readFileSync(p, "utf8").split(/\r?\n/)
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const T = อ่านenv("tests/.env.test"), H = อ่านenv("apps/hq/.env.local");
const OUT = "สื่อนำเสนอ/วิดีโอ";
fs.mkdirSync(OUT, { recursive: true });

const anon = () => createClient(H.NEXT_PUBLIC_SUPABASE_URL, H.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const KEY = `sb-${new URL(H.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const session = {
  admin: (await anon().auth.signInWithPassword({ email: T.TEST_ADMIN_EMAIL, password: T.TEST_ADMIN_PASSWORD })).data.session,
  ryg: (await anon().auth.signInWithPassword({ email: T.TEST_RYG_EMAIL, password: T.TEST_RYG_PASSWORD })).data.session,
};

// เช็กก่อนว่าเซิร์ฟเวอร์เปิดอยู่ไหม — ไม่งั้นจะพังด้วยข้อความ ERR_CONNECTION_REFUSED ที่อ่านไม่รู้เรื่อง
for (const origin of [เว็บ.dealer, เว็บ.hq]) {
  const ok = await fetch(origin, { method: "HEAD" }).then(() => true, () => false);
  if (!ok) {
    console.error(`เปิดเซิร์ฟเวอร์ก่อน: npm run dev  (ยังต่อ ${origin} ไม่ได้)`);
    process.exit(1);
  }
}

// แต่ละคลิป = เดินหน้าจอตามลำดับที่คนดูควรเห็น (หยุดค้างให้อ่านทันด้วย)
const คลิป = [
  { ชื่อ: "1-ดีลเลอร์-ขายตั้งแต่ลีดถึงใบเสนอราคา", ผู้ใช้: "ryg", ฐาน: เว็บ.dealer,
    ทาง: ["/dashboard", "/leads", "/quotations", "/customers", "/calendar"] },
  { ชื่อ: "2-สำนักงานใหญ่-ภาพรวมทั้งเครือ", ผู้ใช้: "admin", ฐาน: เว็บ.hq,
    ทาง: ["/hq/dashboard", "/hq/pipeline", "/hq/quotations", "/hq/dealers", "/hq/master"] },
  { ชื่อ: "3-ความปลอดภัยบัญชี", ผู้ใช้: "ryg", ฐาน: เว็บ.dealer,
    ทาง: ["/settings/account", "/settings"] },
];

const b = await chromium.launch();
for (const c of คลิป) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 },
    recordVideo: { dir: `${OUT}/${c.ชื่อ}`, size: { width: 1440, height: 900 } } });
  const page = await ctx.newPage();
  const หน้าเข้าระบบ = c.ฐาน === เว็บ.hq ? "/hq/login" : "/login";
  await page.goto(c.ฐาน + หน้าเข้าระบบ, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(session[c.ผู้ใช้])]);
  for (const ทาง of c.ทาง) {
    await page.goto(c.ฐาน + ทาง, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    // เลื่อนลงช้า ๆ ให้เห็นทั้งหน้า แล้วเลื่อนกลับขึ้น
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 380); await page.waitForTimeout(700); }
    await page.mouse.wheel(0, -1520);
    await page.waitForTimeout(900);
  }
  await ctx.close();
  console.log("อัดเสร็จ:", c.ชื่อ);
}
await b.close();
console.log("ไฟล์วิดีโออยู่ที่", OUT);
