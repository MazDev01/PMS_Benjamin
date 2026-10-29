import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, CNX, SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, statuses } from "./adminEnv";
import { HQ_ORIGIN, db } from "./funcHelpers";

// ── สำเนารหัสผ่านดีลเลอร์ที่ HQ เปิดดูได้ (บอสสั่ง 5 ส.ค. 69) ──
//
// ธุรกิจต้องการให้ HQ ดูรหัสของดีลเลอร์ได้ตลอด ซึ่งจำเป็นต้องเก็บสำเนาไว้ (Supabase Auth เก็บเป็น
// hash อ่านกลับไม่ได้) — เป็นความเสี่ยงที่รับไว้อย่างรู้ตัว โดยมีด่านป้องกัน 4 ชั้นกำกับ
// เทสต์นี้คือตัวยืนยันว่าทั้ง 4 ชั้นยังอยู่ครบ ห้ามให้หลุดไปทีละชั้นโดยไม่มีใครรู้
//
// ⚠️ บริบทสำคัญ: ครั้งก่อนรหัสผ่านดีลเลอร์ถูกฝังใน mock.ts แล้วติดไปกับไฟล์ที่เบราว์เซอร์โหลด
//    ทุกหน้า รวมหน้าล็อกอินที่ยังไม่ต้องเข้าระบบ (Critical) — ฟีเจอร์นี้ต้องไม่พาเรากลับไปจุดนั้น
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(120_000);

const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function tokenOf(who: { email: string; password: string }): Promise<string> {
  const sb = await db(who);
  return (await sb.auth.getSession()).data.session?.access_token ?? "";
}

test("ชั้นที่ 1 — ต้องมีสิทธิ์ dealers:manage เท่านั้น", async ({ request }) => {
  const noAuth = await request.get(`${HQ_ORIGIN}/api/admin/dealers/secret?code=CNX`);
  expect(statuses(401), `ไม่มี token ต้องถูกปฏิเสธ (ได้ ${noAuth.status()})`).toContain(noAuth.status());
  expect(await noAuth.text(), "คำตอบที่ถูกปฏิเสธต้องไม่มีรหัสผ่านติดมา").not.toMatch(/PEB-|BJ-/);

  const asDealer = await request.get(`${HQ_ORIGIN}/api/admin/dealers/secret?code=CNX`, {
    headers: { authorization: `Bearer ${await tokenOf(RYG)}` },
  });
  expect(statuses(403), `ดีลเลอร์ต้องดูรหัสของสาขาอื่นไม่ได้ (ได้ ${asDealer.status()})`).toContain(asDealer.status());
  expect(await asDealer.text(), "ต้องไม่มีรหัสผ่านติดมา").not.toMatch(/PEB-|BJ-/);

  // แม้แต่รหัสของตัวเองดีลเลอร์ก็ดูผ่าน API นี้ไม่ได้ (เป็นเครื่องมือของ HQ ไม่ใช่ของดีลเลอร์)
  const ownCode = await request.get(`${HQ_ORIGIN}/api/admin/dealers/secret?code=RYG`, {
    headers: { authorization: `Bearer ${await tokenOf(RYG)}` },
  });
  expect(statuses(403), `ดีลเลอร์ต้องดูแม้แต่รหัสตัวเองผ่าน API นี้ไม่ได้ (ได้ ${ownCode.status()})`).toContain(ownCode.status());
});

test("ชั้นที่ 2 — ตารางเก็บรหัสอ่านตรงไม่ได้เลย ไม่ว่าใคร", async () => {
  // คนไม่ล็อกอิน
  const r = await fetch(`${SUPABASE_URL}/rest/v1/dealer_login_secrets?select=*`, { headers: { apikey: SUPABASE_ANON } });
  expect(r.ok, "คนไม่ล็อกอินต้องอ่านตารางนี้ไม่ได้").toBe(false);

  // ผู้ดูแล HQ ที่ล็อกอินแล้ว — ต้องยังอ่านตรงไม่ได้ (ต้องผ่าน API ที่บันทึก audit เท่านั้น)
  const hqSb = await db(ADMIN);
  const { data, error } = await hqSb.from("dealer_login_secrets").select("*");
  expect(error, "แม้แต่ผู้ดูแล HQ ก็ต้องอ่านตารางตรงไม่ได้ — ต้องผ่าน API ที่บันทึกการเข้าถึง").not.toBeNull();
  expect(data ?? [], "ต้องไม่มีข้อมูลหลุดออกมา").toEqual([]);

  // ดีลเลอร์
  const dealerSb = await db(CNX);
  const { error: dErr } = await dealerSb.from("dealer_login_secrets").select("*");
  expect(dErr, "ดีลเลอร์ต้องอ่านตารางนี้ไม่ได้").not.toBeNull();
});

test("ชั้นที่ 3 — ค่าที่เก็บในฐานข้อมูลต้องเข้ารหัส ไม่ใช่ข้อความเปล่า", async () => {
  const { data, error } = await admin.from("dealer_login_secrets").select("dealer_code, secret").limit(5);
  expect(error, "อ่านด้วย service_role ต้องได้").toBeNull();
  test.skip(!data?.length, "ยังไม่มีสำเนารหัสในระบบให้ตรวจ");

  for (const row of data ?? []) {
    const s = String(row.secret);
    expect(s, `${row.dealer_code}: ต้องเป็นรูปแบบที่เข้ารหัสแล้ว (v1:iv:tag:data)`).toMatch(/^v1:[\w+/=]+:[\w+/=]+:[\w+/=]+$/);
    expect(s, `${row.dealer_code}: ต้องไม่เห็นรหัสผ่านเป็นข้อความเปล่าในฐานข้อมูล`).not.toMatch(/PEB-[A-Za-z0-9]{6,}/);
  }
});

test("ชั้นที่ 4 — HQ ดูได้จริง และทุกครั้งที่ดูต้องถูกบันทึก", async ({ request }) => {
  const before = new Date(Date.now() - 5_000).toISOString();
  const res = await request.get(`${HQ_ORIGIN}/api/admin/dealers/secret?code=RYG`, {
    headers: { authorization: `Bearer ${await tokenOf(ADMIN)}` },
  });
  test.skip(res.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role หรือ DEALER_SECRET_KEY");
  test.skip(res.status() === 404, "ยังไม่มีสำเนารหัสของ RYG ในระบบ");
  expect(res.status(), `HQ ที่มีสิทธิ์ต้องดูได้ (ได้ ${res.status()} · ${await res.text()})`).toBe(200);

  const body = await res.json() as { ok?: boolean; password?: string };
  expect(body.ok).toBe(true);
  expect(String(body.password ?? ""), "ต้องได้รหัสผ่านจริงกลับมา").not.toBe("");
  // ห้ามแคช — รหัสผ่านต้องไม่ค้างใน proxy/edge/เบราว์เซอร์
  expect(res.headers()["cache-control"] ?? "", "ต้องสั่งห้ามแคช").toMatch(/no-store/);

  const { data: logs } = await admin.from("audit_log")
    .select("action, target, at").gte("at", before).order("at", { ascending: false }).limit(20);
  const hit = (logs ?? []).find(l => String(l.action).includes("เปิดดูรหัสผ่าน") && String(l.target) === "RYG");
  expect(hit, "ทุกครั้งที่เปิดดูต้องมีบันทึกว่าใครดูของสาขาไหน").toBeTruthy();
});

test("อีเมล+รหัสผ่านที่หน้าจอโชว์ ต้องเข้าระบบได้จริง (ไม่ใช่แค่มีตัวอักษรขึ้น)", async ({ page }) => {
  // บั๊กจริงที่ผู้ใช้แจ้ง (6 ส.ค. 69): หน้าจอโชว์อีเมลที่ "คำนวณจากรหัสสาขา" (cnx@dealer.benjaminpebsteel.com)
  //   ซึ่งไม่ใช่บัญชีที่มีอยู่จริง (ของจริงคือ sales@cmsteelbuild.co.th) คู่กับรหัสผ่านที่ถูกต้อง
  //   → HQ คัดลอกไปให้ดีลเลอร์ แล้วเข้าระบบไม่ได้ ทั้งที่ทั้งสองช่องดู "มีข้อมูลครบ"
  // เทสต์ที่ดูแค่ว่า "มีอีเมลขึ้นไหม/มีรหัสขึ้นไหม" จับบั๊กนี้ไม่ได้ — ต้องเอาไปล็อกอินจริงเท่านั้น
  const { open } = await import("./helpers");
  await open(page, "hq", "/hq/dealers?view=table");   // หน้าเริ่มเป็นการ์ด — เทสต์นี้ใช้แถวตาราง
  // ค้น RYG ก่อน — ต้นเหตุไม่นิ่ง (29 ต.ค. 69 · ครั้งที่ 3): ทะเบียนเรียงใหม่สุดก่อน หน้าละ 10 แถว
  //   สาขาทดสอบที่ข้ออื่นสร้างพร้อมกัน (ZZ…/ZT…) ดัน RYG (สร้างเก่าสุด) ไปหน้า 2 → หาแถวไม่เจอ 30 วิ
  await page.getByPlaceholder("ค้นหาดีลเลอร์...").fill("RYG");

  const row = page.locator("tbody tr").filter({ hasText: "RYG" }).first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await row.click();

  const panel = page.locator(".erp");
  const email = (await panel.getByText(/@/).first().innerText()).trim();
  expect(email, "ต้องไม่ขึ้นเป็นขีดกลาง — แปลว่าหาอีเมลจริงไม่เจอ").not.toBe("—");

  // ⚠️ กดปุ่มเดียวต้องเห็นรหัสเลย (เปลี่ยนพฤติกรรมโดยตั้งใจ 10 ส.ค. 69)
  //   เดิมต้องกด 2 จังหวะ — "ดูรหัสผ่าน" แล้วตามด้วยปุ่มรูปตา "แสดงรหัสผ่าน" อีกที
  //   ผู้ใช้กดปุ่มที่เขียนว่า "ดูรหัสผ่าน" แล้วยังเห็น •••••••••••• = ปุ่มไม่ทำตามที่เขียน
  //   (แก้เทสต์เพราะข้อกำหนดเปลี่ยน ไม่ใช่เพื่อให้ผ่าน)
  await page.getByRole("button", { name: /ดูรหัสผ่าน/ }).first().click();
  await expect(page.getByRole("button", { name: "ซ่อนรหัสผ่าน" }).first(),
    "กดครั้งเดียวต้องแสดงรหัสทันที (ปุ่มจึงเปลี่ยนเป็น ซ่อนรหัสผ่าน)").toBeVisible({ timeout: 30_000 });
  const shown = await panel.innerText();
  const password = shown.match(/PEB-[A-Za-z0-9]+/)?.[0] ?? "";
  expect(password, "ต้องอ่านรหัสผ่านจากหน้าจอได้").not.toBe("");

  // ข้อพิสูจน์เดียวที่นับได้: เอาสองค่านี้ไปเข้าระบบจริง
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email, password });
  expect(error?.message ?? "",
    `อีเมล+รหัสผ่านที่ HQ เห็นบนหน้าจอ ต้องใช้เข้าระบบได้จริง (อีเมล=${email})`,
  ).toBe("");
});

test("รหัสผ่านต้องไม่ติดไปกับหน้าเว็บ — ต้องดึงตอนกดดูเท่านั้น", async ({ page }) => {
  // จุดที่พลาดครั้งก่อนคือรหัสถูกฝังในไฟล์ที่เบราว์เซอร์โหลดทุกหน้า
  // เทสต์นี้เฝ้าทุก response ที่หน้า /hq/dealers โหลด แล้วยืนยันว่าไม่มีรหัสผ่านติดมาเลย
  const leaks: string[] = [];
  page.on("response", async r => {
    const ct = r.headers()["content-type"] ?? "";
    if (!/javascript|json|html/.test(ct)) return;
    if (r.url().includes("/api/admin/dealers/secret")) return; // เส้นทางที่ตั้งใจให้มีรหัส (ต้องกดเอง)
    const body = await r.text().catch(() => "");
    if (/PEB-[A-Za-z]{2}\d[A-Za-z0-9]{10,}/.test(body)) leaks.push(r.url().slice(0, 110));
  });

  const { open } = await import("./helpers");
  await open(page, "hq", "/hq/dealers?view=table");
  await page.locator("tbody tr").first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2_500);

  expect(leaks, `พบรหัสผ่านติดมากับไฟล์ที่เบราว์เซอร์โหลด: ${leaks.join(" · ")}`).toEqual([]);
});
