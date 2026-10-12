import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { RYG, SUPABASE_URL, SUPABASE_ANON, appEnv, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN } from "./funcHelpers";
import { settle } from "./helpers";

// ── โค้ดใหม่ของระยะ 4 ที่ยังไม่มีใครตรวจตรง ๆ ──────────────────────────────────
//
// ชุดทดสอบเดิม 287 ข้อครอบคลุม "ล็อกอินแล้วใช้งานได้ไหม" แต่ไม่เคยแตะสองเส้นทางนี้:
//   1. ใบผ่านหมดอายุระหว่างใช้งาน → ต่ออายุอัตโนมัติ โดยหลายสายขอพร้อมกัน
//      ⚠️ refresh token ของ Supabase ใช้ได้ครั้งเดียวแล้วเปลี่ยนใบใหม่
//         ถ้าปล่อยให้ขอพร้อมกัน สายแรกสำเร็จและ "เผา" ใบเก่า ที่เหลือล้มหมด → ผู้ใช้เด้งออก
//         (แก้ด้วย caRefresh สายเดียวร่วมกัน — เทสต์นี้คือด่านกันไม่ให้กลับมา)
//   2. ลิงก์ "เข้าระบบแทนดีลเลอร์" ส่งใบผ่านมาทาง #hash ของ URL
//      โหมดนี้ต้องแลกเป็น cookie แล้วลบออกจาก URL ทันที (op=adopt + caAdoptFromUrl)
//      ⚠️ ถ้าลบไม่สำเร็จ ใบผ่านจะติดไปกับลิงก์ที่ผู้ใช้ copy ต่อ/บันทึกไว้
const API_MODE = appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api";
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.skip(() => !API_MODE, "เส้นทางนี้มีเฉพาะโหมด api");
test.setTimeout(180_000);

async function loginCookie(page: Page, origin: string, who: { email: string; password: string }) {
  const r = await page.context().request.post(`${origin}/api/v1/auth?op=login`, { data: who });
  expect(r.ok(), `ล็อกอิน ${who.email} ต้องผ่าน (ได้ ${r.status()})`).toBe(true);
}

/** ทิ้งใบผ่านทิ้งไป เหลือไว้แต่ใบต่ออายุ = จำลอง "ใบผ่านหมดอายุระหว่างใช้งาน" */
async function dropAccessCookie(page: Page) {
  const all = await page.context().cookies();
  const rest = all.filter(c => !c.name.startsWith("pms_at"));
  expect(all.some(c => c.name.startsWith("pms_at")), "ก่อนทดสอบต้องมีใบผ่านอยู่ก่อน").toBe(true);
  expect(rest.some(c => c.name.startsWith("pms_rt")), "ต้องมีใบต่ออายุเหลืออยู่").toBe(true);
  await page.context().clearCookies();
  await page.context().addCookies(rest);
}

test("[session] ใบผ่านหมดอายุกลางคัน → ต่ออายุเองได้ ไม่เด้งผู้ใช้ออก และข้อมูลยังขึ้นครบ", async ({ page }) => {
  await loginCookie(page, DEALER_ORIGIN, RYG);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);

  await dropAccessCookie(page);

  // หน้านี้ยิงคำขอพร้อมกันหลายสาย (ลีด/ลูกค้า/ใบเสนอราคา/นัดหมาย/ตั้งค่า) = จังหวะที่เคยพัง
  const refreshCalls: number[] = [];
  page.on("response", r => { if (r.url().includes("op=refresh")) refreshCalls.push(r.status()); });
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.waitForTimeout(4000);

  expect(new URL(page.url()).pathname, "ต้องไม่ถูกเด้งออกจากระบบ").not.toContain("/login");
  const body = await page.evaluate(() => document.body.innerText);
  expect(body.length, "หน้าต้องมีเนื้อหาจริง ไม่ใช่จอเปล่า").toBeGreaterThan(200);

  // ⚠️ หัวใจ: ต่ออายุต้องสำเร็จ ไม่มีสายไหนถูกปฏิเสธ (ถูกปฏิเสธ = ใบถูกเผาไปแล้วโดยสายอื่น)
  const failed = refreshCalls.filter(s => s >= 400);
  expect(failed, `ต่ออายุใบผ่านต้องไม่มีสายไหนล้ม (ได้ ${JSON.stringify(refreshCalls)})`).toEqual([]);

  const at = (await page.context().cookies()).find(c => c.name.startsWith("pms_at"));
  expect(at, "ต้องได้ใบผ่านใบใหม่กลับมา").toBeTruthy();
  expect(at!.httpOnly, "ใบใหม่ต้องเป็น httpOnly เหมือนเดิม").toBe(true);
});

test("[session] ใบต่ออายุใช้ไม่ได้แล้ว → เด้งออกไปหน้าเข้าสู่ระบบ ไม่ใช่ค้างจอเปล่า", async ({ page }) => {
  await loginCookie(page, DEALER_ORIGIN, RYG);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);

  // ทิ้งทั้งใบผ่านและใบต่ออายุ = เหมือนเซสชันหมดอายุจริง ๆ
  await page.context().clearCookies();
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => new URL(page.url()).pathname,
    { timeout: 20_000, message: "หมดสิทธิ์แล้วต้องพากลับหน้าเข้าสู่ระบบ" }).toContain("/login");
});

// ⚠️ ไม่ได้เดินตามลิงก์จริงจาก Supabase เพราะปลายทางต้องถูกอนุญาตไว้ใน
//    Authentication → URL Configuration → Redirect URLs ของแต่ละโปรเจกต์
//    ชุดทดสอบไม่ได้ตั้งไว้ (Supabase จะเด้งกลับ Site URL แทน) — นั่นเป็นเรื่องการตั้งค่า ไม่ใช่โค้ด
//    ที่นี่จึงจำลอง "ปลายทางหลังเดินตามลิงก์" ให้เหมือนของจริงเป๊ะ: ใบผ่านมาใน #hash
//    แล้วตรวจโค้ดฝั่งเรา (op=adopt + caAdoptFromUrl) ว่าทำงานถูกครบทุกข้อ
test("[impersonate] ใบผ่านที่มาทาง URL ต้องถูกแลกเป็น cookie แล้วลบทิ้งจากแถบที่อยู่", async ({ page }) => {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword(RYG);
  expect(error, "เตรียมใบผ่านต้องผ่าน").toBeNull();
  const s = data.session!;

  const hash = `#access_token=${s.access_token}&refresh_token=${s.refresh_token}&token_type=bearer&type=magiclink`;
  await page.goto(`${DEALER_ORIGIN}/dashboard?impersonated=1${hash}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.waitForTimeout(4000);

  // 1) ต้องเข้าไปอยู่ในระบบจริง ไม่ใช่ถูกเด้งกลับหน้าเข้าสู่ระบบ
  expect(new URL(page.url()).pathname, "ต้องเข้าถึงหน้าในระบบได้").not.toContain("/login");

  // 2) ⚠️ ใบผ่านต้องไม่ค้างในแถบที่อยู่ — ไม่งั้นติดไปกับลิงก์ที่ผู้ใช้ copy ต่อ/บันทึกไว้
  expect(page.url(), "ห้ามมีใบผ่านค้างใน URL").not.toContain("access_token");
  expect(page.url(), "ห้ามมีใบต่ออายุค้างใน URL").not.toContain("refresh_token");

  // 3) ใบผ่านต้องย้ายไปอยู่ใน cookie ที่ JavaScript อ่านไม่ได้
  const at = (await page.context().cookies()).find(c => c.name.startsWith("pms_at"));
  expect(at, "ต้องแลกใบผ่านเข้า cookie สำเร็จ").toBeTruthy();
  expect(at!.httpOnly, "ต้องเป็น httpOnly").toBe(true);
  const ls = await page.evaluate(() => Object.keys(localStorage));
  expect(ls.filter(k => k.includes("auth-token")), "ห้ามมีใบผ่านตกค้างใน localStorage").toEqual([]);

  // 4) แถบเตือนต้องขึ้น — HQ ต้องรู้ตัวว่ากำลังทำงานในบัญชีคนอื่น
  await expect(page.getByText(/กำลังเข้าระบบแทนดีลเลอร์โดยสำนักงานใหญ่/).first(),
    "ต้องมีแถบบอกว่ากำลังเข้าระบบแทน").toBeVisible({ timeout: 20_000 });

  // 5) ใบผ่านปลอมต้องถูกปฏิเสธ — ห้ามเชื่อสิ่งที่ส่งมาจากเบราว์เซอร์ตรง ๆ
  const bad = await page.context().request.post(`${DEALER_ORIGIN}/api/v1/auth?op=adopt`, {
    data: { access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ปลอม.ปลอม" },
  });
  expect(bad.status(), "ใบผ่านปลอมต้องไม่ผ่าน").toBe(401);
});
