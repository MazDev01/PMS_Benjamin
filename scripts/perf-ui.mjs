// วัดเวลาที่ "ผู้ใช้จริงต้องรอ" ต่อหน้า เมื่อข้อมูลเยอะ (ใช้คู่กับ seed-volume.mjs)
// ต้องมีเซิร์ฟเวอร์รันอยู่ที่ :3001 / :3002 (โหมด api)
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const D = "http://localhost:3001", HQ = "http://localhost:3002";

const หน้า = [
  [HQ, "ADMIN", "/hq/dashboard", "แดชบอร์ด HQ"],
  [HQ, "ADMIN", "/hq/leads", "ลูกค้าเป้าหมายทั้งเครือ"],
  [HQ, "ADMIN", "/hq/pipeline", "ภาพรวมยอดขาย"],
  [HQ, "ADMIN", "/hq/quotations", "ใบเสนอราคาทั้งเครือ"],
  [HQ, "ADMIN", "/hq/customers", "ลูกค้าทั้งเครือ"],
  [D, "RYG", "/dashboard", "แดชบอร์ดดีลเลอร์"],
  [D, "RYG", "/leads", "ลูกค้าเป้าหมายของสาขา"],
  [D, "RYG", "/quotations", "ใบเสนอราคาของสาขา"],
  [D, "RYG", "/customers", "ลูกค้าของสาขา"],
];
const บัญชี = { ADMIN: { email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") },
                RYG: { email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") } };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
for (const [origin, who] of [[HQ, "ADMIN"], [D, "RYG"]]) {
  const r = await ctx.request.post(origin + "/api/v1/auth?op=login", { data: บัญชี[who] });
  console.log("login " + who + " -> " + r.status());
}
console.log("");
console.log("เวลาที่ผู้ใช้ต้องรอต่อหน้า (ข้อมูล 20,000 ลูกค้าเป้าหมาย · 10,000 ใบเสนอราคา)");
console.log("   เปิดหน้า   ข้อมูลขึ้นครบ   หน้า");
for (const [origin, who, path, ชื่อ] of หน้า) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(e.message.slice(0, 60)));
  const t0 = Date.now();
  await page.goto(origin + path, { waitUntil: "domcontentloaded" }).catch(() => {});
  const เปิดได้ = Date.now() - t0;
  // รอจนคำขอข้อมูลหยุดนิ่ง (ไม่นับสายอัปเดตสด)
  let ค้าง = 0, เงียบตั้งแต่ = Date.now();
  page.on("request", r => { if (!r.url().includes("/api/v1/events")) ค้าง++; });
  const จบ = (r) => { if (!r.url().includes("/api/v1/events")) ค้าง = Math.max(0, ค้าง - 1); };
  page.on("requestfinished", จบ); page.on("requestfailed", จบ);
  const หมดเวลา = Date.now() + 60_000;
  while (Date.now() < หมดเวลา) {
    if (ค้าง > 0) เงียบตั้งแต่ = Date.now();
    else if (Date.now() - เงียบตั้งแต่ > 800) break;
    await page.waitForTimeout(100);
  }
  const ครบ = Date.now() - t0;
  const พัง = (await page.evaluate(() => document.body.innerText)).includes("เกิดข้อผิดพลาดในหน้านี้");
  console.log("  " + String(เปิดได้).padStart(7) + "ms " + String(ครบ).padStart(11) + "ms   " + ชื่อ +
    (พัง ? "   ⚠️ จอผิดพลาด" : "") + (errs.length ? "   error: " + errs[0] : ""));
  await page.close();
}
await browser.close();
