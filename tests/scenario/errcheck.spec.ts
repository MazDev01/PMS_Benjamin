import { test, expect, type Page } from "@playwright/test";
import { RYG, ADMIN, skipReason, type Account } from "./supabaseEnv";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000); // เดินหลายหน้าในเทสต์เดียว — เวลาเริ่มต้น 30 วิไม่พอ

const DEALER = "http://localhost:3001";
const HQ = "http://localhost:3002";

// เสียงรบกวนที่ไม่ใช่ error ของแอป
const NOISE = /favicon|hydrat|Download the React DevTools|Fast Refresh|preloaded using link preload/i;

async function login(page: Page, origin: string, path: string, who: Account) {
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const email = page.getByLabel(/อีเมล/i).first();
  const pass = page.getByLabel(/รหัสผ่าน/i).first();
  for (let a = 1; a <= 3; a++) {
    for (let i = 0; i < 6; i++) {
      await email.fill(who.email); await pass.fill(who.password);
      await page.waitForTimeout(300);
      const ok1 = await email.inputValue() === who.email;
      await page.waitForTimeout(300);
      if (ok1 && await email.inputValue() === who.email) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    const left = await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    if (left) return;
  }
  throw new Error("ล็อกอินไม่ผ่าน");
}

function watch(page: Page) {
  const errs: string[] = [];
  page.on("pageerror", e => errs.push(`[pageerror] ${e.message}`));
  page.on("console", m => { if (m.type() === "error") errs.push(`[console] ${m.text().slice(0, 200)}`); });
  // คำขอที่ล้มเหลว (4xx/5xx) — จับ RLS ปฏิเสธ / ตารางหาย / คอลัมน์ผิด ที่ไม่โผล่เป็น console error
  page.on("response", r => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) errs.push(`[http ${r.status()}] ${r.url().slice(0, 160)}`);
  });
  return errs;
}

async function walk(page: Page, origin: string, paths: string[], errs: string[]) {
  for (const p of paths) {
    await page.goto(`${origin}${p}`, { waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await page.evaluate(() => document.body.innerText)).length,
      { timeout: 20_000, message: `${p} ต้องเรนเดอร์` }).toBeGreaterThan(100);
    await page.waitForTimeout(1200); // ให้ query ที่ยิงหลังเรนเดอร์เสร็จก่อน
    const mine = errs.filter(e => !NOISE.test(e));
    console.log(`${p} · error สะสม ${mine.length}`);
  }
}

test("[errcheck] ทุกหน้าฝั่งดีลเลอร์", async ({ page }) => {
  const errs = watch(page);
  await login(page, DEALER, "/login", RYG);
  await walk(page, DEALER, ["/dashboard", "/leads", "/customers", "/quotations", "/calendar", "/files", "/settings", "/profile"], errs);
  const real = errs.filter(e => !NOISE.test(e));
  if (real.length) console.log("=== พบ ===\n" + real.slice(0, 20).join("\n"));
  expect(real, "ฝั่งดีลเลอร์ต้องไม่มี error").toEqual([]);
});

test("[errcheck] ทุกหน้าฝั่ง HQ", async ({ page }) => {
  const errs = watch(page);
  await login(page, HQ, "/hq/login", ADMIN);
  await walk(page, HQ, ["/hq/dashboard", "/hq/leads", "/hq/quotations", "/hq/customers", "/hq/dealers", "/hq/pipeline", "/hq/settings", "/hq/audit"], errs);
  const real = errs.filter(e => !NOISE.test(e));
  if (real.length) console.log("=== พบ ===\n" + real.slice(0, 20).join("\n"));
  expect(real, "ฝั่ง HQ ต้องไม่มี error").toEqual([]);
});
