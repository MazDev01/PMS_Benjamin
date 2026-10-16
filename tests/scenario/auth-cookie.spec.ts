import { test, expect, request as pwRequest } from "@playwright/test";
import { RYG, appEnv, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN } from "./funcHelpers";

// ── ระยะ 4 · ใบผ่านต้องอยู่ใน cookie ที่ JavaScript แตะไม่ได้ ────────────────────────
//
// เป้าหมาย: ปิดประตูไม่ให้หน้าเว็บต่อฐานข้อมูลตรง
// วิธีวัดว่าปิดจริง: ใบผ่านต้อง "ไม่อยู่ในมือ JavaScript" — ไม่ใช่แค่ "หน้าเว็บไม่ได้เรียกใช้"
//
// ⚠️ ข้อ 2 คือหัวใจ — ถ้า cookie ไม่ได้ตั้ง httpOnly ไว้จริง ทุกอย่างจะยังทำงานเหมือนเดิมเป๊ะ
//    ต่างกันแค่ JavaScript ยังอ่านใบผ่านไปใช้เองได้ = ไม่ได้ปิดอะไรเลย แต่ดูเหมือนปิดแล้ว
const API_MODE = appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api";
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.skip(() => !API_MODE, "เส้นทางนี้มีเฉพาะโหมด api (โหมด supabase หน้าเว็บถือใบผ่านเอง)");

test("[auth] เข้าระบบผ่าน backend → ได้ cookie ที่ JavaScript อ่านไม่ได้ และไม่มีใบผ่านหลุดมาใน body", async () => {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(`${HQ_ORIGIN}/api/v1/auth?op=login`, {
    data: { email: RYG.email, password: RYG.password },
  });
  expect(res.status(), `เข้าระบบต้องผ่าน (ได้ ${res.status()} · ${await res.text()})`).toBe(200);

  // 1) ต้องไม่มีใบผ่านติดกลับมาใน body — ไม่งั้น JavaScript ก็หยิบไปใช้ได้อยู่ดี
  const body = await res.text();
  expect(body, "ห้ามส่ง access_token กลับไปให้หน้าเว็บ").not.toContain("access_token");
  expect(body, "ห้ามส่ง refresh_token กลับไปให้หน้าเว็บ").not.toContain("refresh_token");
  expect(body, "ห้ามส่งใบผ่านดิบกลับไป (ขึ้นต้นด้วย eyJ)").not.toMatch(/eyJ[\w-]{20,}/);

  // 2) cookie ต้องเป็น httpOnly จริง ๆ — จุดสำคัญที่สุดของทั้งระยะนี้
  const cookies = await ctx.storageState().then(s => s.cookies);
  const at = cookies.find(c => c.name.startsWith("pms_at"));
  expect(at, "ต้องมี cookie ใบผ่าน").toBeTruthy();
  expect(at!.httpOnly, "cookie ใบผ่านต้องเป็น httpOnly ไม่งั้น JavaScript อ่านไปใช้เองได้").toBe(true);
  const rt = cookies.find(c => c.name.startsWith("pms_rt"));
  expect(rt?.httpOnly, "cookie ต่ออายุต้องเป็น httpOnly เช่นกัน").toBe(true);

  // 3) ข้อมูล "เป็นใคร" ต้องมาครบพอให้หน้าจอใช้งานได้
  const me = JSON.parse(body) as { email: string; dealerCode: string; role: string };
  expect(me.email.toLowerCase()).toBe(RYG.email.toLowerCase());
  expect(me.dealerCode, "ต้องบอกสาขาของผู้ใช้").toBeTruthy();

  await ctx.dispose();
});

test("[auth] มี cookie แล้วเรียก API ได้โดยไม่ต้องแนบ header ใด ๆ", async () => {
  const ctx = await pwRequest.newContext();
  const login = await ctx.post(`${HQ_ORIGIN}/api/v1/auth?op=login`, {
    data: { email: RYG.email, password: RYG.password },
  });
  expect(login.status()).toBe(200);

  // ไม่ใส่ authorization เลย — เบราว์เซอร์แนบ cookie ให้เอง
  const who = await ctx.get(`${HQ_ORIGIN}/api/v1/auth`);
  expect(who.status(), "ถามว่าเป็นใครต้องได้คำตอบจาก cookie").toBe(200);

  // ใช้รายชื่อลูกค้าเป็นตัวแทน "ข้อมูลจริง" (เดิมใช้แคตตาล็อก — ปิดเป็น 410 แล้วตั้งแต่เอาแม่แบบออก 16 ต.ค. 69)
  const customers = await ctx.get(`${HQ_ORIGIN}/api/v1/customers`);
  expect(customers.status(), "ดึงข้อมูลจริงต้องผ่านด้วย cookie ล้วน").toBe(200);
  expect(Array.isArray((await customers.json() as { rows?: unknown }).rows), "ต้องได้รายการลูกค้ากลับมา").toBe(true);

  await ctx.dispose();
});

test("[auth] ออกจากระบบ → cookie ถูกล้าง และเรียก API ต่อไม่ได้", async () => {
  const ctx = await pwRequest.newContext();
  await ctx.post(`${HQ_ORIGIN}/api/v1/auth?op=login`, { data: { email: RYG.email, password: RYG.password } });
  expect((await ctx.get(`${HQ_ORIGIN}/api/v1/customers`)).status(), "ก่อนออกต้องเรียกได้").toBe(200);

  const out = await ctx.post(`${HQ_ORIGIN}/api/v1/auth?op=logout`);
  expect(out.status()).toBe(200);

  const after = await ctx.get(`${HQ_ORIGIN}/api/v1/customers`);
  expect(after.status(), "ออกจากระบบแล้วต้องเรียกไม่ได้").toBe(401);
  await ctx.dispose();
});

test("[auth] รหัสผ่านผิด → ต้องไม่บอกว่าอีเมลนั้นมีอยู่จริงหรือไม่", async () => {
  const ctx = await pwRequest.newContext();
  const wrongPass = await ctx.post(`${HQ_ORIGIN}/api/v1/auth?op=login`,
    { data: { email: RYG.email, password: "ผิดแน่นอน-zzz-9999" } });
  const noSuchUser = await ctx.post(`${HQ_ORIGIN}/api/v1/auth?op=login`,
    { data: { email: `zz-ไม่มีจริง-${Date.now()}@example.com`, password: "อะไรก็ได้-9999" } });

  expect(wrongPass.status(), "รหัสผ่านผิดต้องถูกปฏิเสธ").toBe(401);
  expect(noSuchUser.status(), "อีเมลที่ไม่มีอยู่ต้องถูกปฏิเสธ").toBe(401);
  // ข้อความต้องเหมือนกันเป๊ะ — ต่างกันเมื่อไหร่ = บอกคนเดาว่าอีเมลไหนมีอยู่ในระบบ
  expect(await wrongPass.text(), "ข้อความต้องไม่แยกแยะว่าอีเมลมีอยู่จริงไหม").toBe(await noSuchUser.text());

  const cookies = (await ctx.storageState()).cookies;
  expect(cookies.find(c => c.name.startsWith("pms_at")), "ล็อกอินไม่ผ่านต้องไม่ได้ cookie").toBeFalsy();
  await ctx.dispose();
});
