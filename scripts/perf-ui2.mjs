// วัด "เวลาจนผู้ใช้เห็นข้อมูลจริงบนจอ" + ดูว่าคำขออะไรวิ่งบ้าง (ทำไมหน้าไม่นิ่ง)
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
const env = (f) => { const m = new Map(); for (const line of readFileSync(f, "utf8").split(String.fromCharCode(10))) { const t = line.trim(); if (!t || t.startsWith("#")) continue; const i = t.indexOf("="); if (i > 0) m.set(t.slice(0, i).trim(), t.slice(i + 1).trim()); } return m; };
const T = env("tests/.env.test");
const D = "http://localhost:3001", HQ = "http://localhost:3002";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.request.post(HQ + "/api/v1/auth?op=login", { data: { email: T.get("TEST_ADMIN_EMAIL"), password: T.get("TEST_ADMIN_PASSWORD") } });
await ctx.request.post(D + "/api/v1/auth?op=login", { data: { email: T.get("TEST_RYG_EMAIL"), password: T.get("TEST_RYG_PASSWORD") } });

async function ดู(origin, path, ชื่อ, รอเห็น) {
  const page = await ctx.newPage();
  const คำขอ = [];
  page.on("response", r => { if (r.url().includes("/api/v1/") && !r.url().includes("/events")) คำขอ.push({ u: r.url().split("/api/v1/")[1].slice(0, 40), t: Date.now() }); });
  const t0 = Date.now();
  await page.goto(origin + path, { waitUntil: "domcontentloaded" }).catch(() => {});
  let เห็นเมื่อ = -1;
  try { await page.waitForFunction(รอเห็น, null, { timeout: 60_000 }); เห็นเมื่อ = Date.now() - t0; } catch { /* ไม่ทัน */ }
  await page.waitForTimeout(3000);
  const สรุป = {};
  for (const c of คำขอ) สรุป[c.u.split("?")[0]] = (สรุป[c.u.split("?")[0]] ?? 0) + 1;
  const ท้ายสุด = คำขอ.length ? Math.max(...คำขอ.map(c => c.t)) - t0 : 0;
  console.log("  " + ชื่อ.padEnd(28) + "เห็นข้อมูล " + (เห็นเมื่อ < 0 ? "ไม่ทัน 60s" : String(เห็นเมื่อ) + "ms").padEnd(12) +
    " คำขอ " + String(คำขอ.length).padStart(3) + " ครั้ง · คำขอสุดท้ายที่ " + ท้ายสุด + "ms");
  console.log("      " + Object.entries(สรุป).map(([k, v]) => k + "×" + v).join(" · "));
  await page.close();
}

console.log("=== ฝั่ง HQ ===");
await ดู(HQ, "/hq/leads", "ลูกค้าเป้าหมายทั้งเครือ", "() => document.querySelectorAll('tbody tr').length > 0");
await ดู(HQ, "/hq/dashboard", "แดชบอร์ด HQ", "() => /[0-9]/.test(document.body.innerText) && document.body.innerText.length > 800");
console.log("");
console.log("=== ฝั่งดีลเลอร์ ===");
await ดู(D, "/leads", "ลูกค้าเป้าหมายของสาขา", "() => document.body.innerText.length > 800");
await ดู(D, "/dashboard", "แดชบอร์ดดีลเลอร์", "() => document.body.innerText.length > 800");
await browser.close();
