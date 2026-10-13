import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, CNX, SUPABASE_URL, SUPABASE_ANON, skipReason, appEnv } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db } from "./funcHelpers";
import { open } from "./helpers";

// ── "เข้าระบบแทนดีลเลอร์" (impersonate) — ความสามารถระดับเข้าถึงบัญชีคนอื่นเต็มรูปแบบ ──
//
// HQ ออกลิงก์เข้าระบบของดีลเลอร์ได้โดยไม่ต้องรู้/รีเซ็ตรหัสผ่าน (Supabase magic-link)
// ฟีเจอร์นี้เดิม "ไม่มีเทสต์คุ้มครองเลย" (พบจากผลตรวจสอบระบบ 5 ส.ค. 69 · severity High)
// ถ้าด่านใดด่านหนึ่งพังโดยไม่ตั้งใจ จะไม่มีอะไรจับได้ — ที่นี่คุมครบทั้ง 5 ด่าน:
//   1) ต้องมีสิทธิ์จริง (บทบาทอ่านจาก DB ฝั่งเซิร์ฟเวอร์ ไม่เชื่อ client)
//   2) เป้าหมายต้องเป็นบัญชีดีลเลอร์เท่านั้น — เข้าแทนผู้ใช้ HQ ด้วยกันไม่ได้ (กันยกระดับสิทธิ์)
//   3) ลิงก์ที่ได้ต้องใช้เข้าระบบเป็น "สาขานั้น" ได้จริง และเห็นข้อมูลตามสิทธิ์ของสาขานั้น
//   4) ต้องมีร่องรอยใน audit log เสมอ
//   5) ต้องมีเพดานจำนวนครั้ง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function adminToken(): Promise<string> {
  const sb = await db(ADMIN);
  return (await sb.auth.getSession()).data.session?.access_token ?? "";
}

/** ล้างตัวนับ rate limit ของ ADMIN ก่อนทุกเทสต์
 *  route นับโควตา "ก่อน" ตรวจรหัสสาขา — เทสต์ที่ยิงรหัสผิดหลายครั้งจึงกินโควตาของเทสต์ถัดไปจนได้ 429
 *  แทนสถานะที่ต้องการวัด (เจอจริงตอนเขียนเทสต์นี้) */
test.beforeEach(async () => {
  const { data: me } = await admin.auth.getUser(await adminToken());
  await admin.from("rate_limits").delete().eq("key", `impersonate-dealer:${me.user?.id ?? ""}`);
});

test("ผู้ไม่มีสิทธิ์ขอเข้าระบบแทนไม่ได้ (ไม่มี token / เป็นดีลเลอร์เอง)", async ({ request }) => {
  const noAuth = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=CNX`);
  expect([401, 501], `ไม่มี token ต้องถูกปฏิเสธ (ได้ ${noAuth.status()})`).toContain(noAuth.status());

  const rygToken = (await (await db(RYG)).auth.getSession()).data.session?.access_token ?? "";
  const asDealer = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=CNX`, {
    headers: { authorization: `Bearer ${rygToken}` },
  });
  expect([403, 501], `ดีลเลอร์ขอเข้าระบบแทนสาขาอื่นไม่ได้ (ได้ ${asDealer.status()})`).toContain(asDealer.status());
  // สำคัญ: ต้องไม่มีลิงก์หลุดมาในเนื้อหาคำตอบ แม้จะถูกปฏิเสธแล้วก็ตาม
  expect(await asDealer.text(), "คำตอบที่ถูกปฏิเสธต้องไม่มีลิงก์เข้าระบบติดมา").not.toMatch(/action_link|\/verify\?token/);
});

test("รหัสสาขาที่ไม่มีจริง → ไม่ออกลิงก์", async ({ request }) => {
  const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=ZQXW`, {
    headers: { authorization: `Bearer ${await adminToken()}` },
  });
  expect([404, 501], `สาขาที่ไม่มีจริงต้องไม่ได้ลิงก์ (ได้ ${res.status()})`).toContain(res.status());
  expect(await res.text(), "ต้องไม่มีลิงก์ติดมา").not.toMatch(/action_link|\/verify\?token/);
});

test("รหัสสาขารูปแบบผิด → ปฏิเสธตั้งแต่ต้น", async ({ request }) => {
  for (const bad of ["", "toolongcode", "cn x", "1234", "../CNX"]) {
    const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=${encodeURIComponent(bad)}`, {
      headers: { authorization: `Bearer ${await adminToken()}` },
    });
    expect([400, 501], `รหัส "${bad}" ต้องถูกปฏิเสธ (ได้ ${res.status()})`).toContain(res.status());
  }
});

test("เข้าระบบแทนผู้ใช้ HQ ด้วยกันไม่ได้ (กันยกระดับสิทธิ์)", async () => {
  // บัญชี HQ ทุกคนมี dealer_code = "" — route รับเฉพาะรหัสรูปแบบ [A-Z]{2,5} จึงไม่มีทางชี้ไปหาบัญชี HQ ได้
  // เทสต์นี้ยืนยัน "ข้อสมมติ" นั้นกับข้อมูลจริง: ถ้าวันหนึ่งมีบัญชี HQ ถูกใส่ dealer_code เข้าไป ด่านนี้จะพัง
  const { data: hqProfiles, error } = await admin.from("profiles")
    .select("id, role, dealer_code").in("role", ["SUPER_ADMIN", "HQ_MANAGEMENT", "HQ_STAFF"]);
  expect(error, "อ่านโปรไฟล์ HQ ต้องไม่ error").toBeNull();
  expect(hqProfiles?.length, "ต้องมีบัญชี HQ อย่างน้อยหนึ่งบัญชีให้ตรวจ").toBeGreaterThan(0);

  for (const p of hqProfiles ?? []) {
    expect(String(p.dealer_code ?? ""),
      `บัญชี HQ (${p.role}) ต้องไม่มีรหัสสาขา — ไม่งั้นจะตกเป็นเป้าของการเข้าระบบแทนได้`,
    ).toBe("");
  }
});

test("HQ ที่มีสิทธิ์ได้ลิงก์ที่ใช้เข้าระบบเป็นสาขานั้นได้จริง + มีร่องรอยใน audit log", async ({ request }) => {
  const before = new Date(Date.now() - 5_000).toISOString();
  const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=CNX`, {
    headers: { authorization: `Bearer ${await adminToken()}` },
  });
  test.skip(res.status() === 501, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  expect(res.status(), `HQ ที่มีสิทธิ์ต้องได้ลิงก์ (ได้ ${res.status()} · ${await res.text()})`).toBe(200);

  const body = await res.json() as { ok?: boolean; link?: string };
  expect(body.ok, "ต้องตอบว่าสำเร็จ").toBe(true);
  // ── รูปแบบลิงก์เปลี่ยนแล้ว (20 ส.ค. 69) ────────────────────────────────────────
  // เดิมส่ง "ลิงก์ยืนยันของ Supabase" ตรง ๆ ซึ่งพาไปที่ Site URL ของโปรเจกต์เงียบ ๆ
  //   ถ้าปลายทางของแอปดีลเลอร์ไม่ได้อยู่ในรายการ Redirect URLs ที่อนุญาต → ผู้ใช้เจอหน้าเปล่า
  // ตอนนี้ส่งใบผ่านครั้งเดียวมาที่หน้า /impersonate ของแอปดีลเลอร์เอง แล้วหน้านั้นแลกเป็น session
  //   ⚠️ ใบผ่านอยู่หลัง # (hash) โดยตั้งใจ — hash ไม่ถูกส่งไปกับคำขอ HTTP จึงไม่ไปโผล่ใน log ใคร
  const url = new URL(String(body.link));
  expect(url.pathname, "ลิงก์ต้องพาไปหน้าแลกใบผ่านของแอปดีลเลอร์").toBe("/impersonate");
  const tokenHash = new URLSearchParams(url.hash.replace(/^#/, "")).get("th") ?? "";
  expect(tokenHash, "ลิงก์ต้องมีใบผ่าน (#th=)").not.toBe("");

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: vErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  expect(vErr, `ลิงก์ต้องแลกเป็น session ได้จริง (${vErr?.message ?? ""})`).toBeNull();
  // ── ต้องเป็น "บัญชีจริงของสาขา CNX" ไม่ใช่บัญชีอะไรก็ได้ที่ล็อกอินได้ ──
  //
  // เดิมเทสต์นี้ล็อกอีเมลไว้ตรง ๆ ว่า "cnx@partner-agent.co.th" ซึ่งเป็นอีเมลที่ระบบ *ประกอบขึ้นเอง*
  // จากรหัสสาขา และไม่มีบัญชีนั้นอยู่จริง — magiclink จึงสร้างบัญชีเปล่าใหม่ให้ทุกครั้ง
  // เทสต์เลย "ผ่าน" ทั้งที่ HQ ไม่ได้เข้าเป็นดีลเลอร์จริงเลยสักครั้ง (พบจากชุดตรวจรับ 6 ส.ค. 69)
  // ต้องผูกกับตัวตนจริง: id ของ session ต้องเท่ากับ id ของบัญชีที่สังกัดสาขา CNX
  const { data: cnxProf } = await admin.from("profiles").select("id").eq("dealer_code", "CNX");
  expect(cnxProf?.length, "สาขา CNX ต้องมีบัญชีเข้าระบบ 1 บัญชี").toBe(1);
  expect(verified.user?.id,
    `session ที่ได้ต้องเป็นบัญชีจริงของสาขา CNX (ได้อีเมล ${verified.user?.email})`,
  ).toBe(String(cnxProf![0].id));

  // session ที่ได้ต้องมีสิทธิ์แค่ของสาขา CNX — ไม่ใช่สิทธิ์ HQ ที่เห็นทั้งเครือ
  //   และต้อง "เห็นข้อมูลของ CNX จริง" ด้วย ไม่ใช่ว่างเปล่า (บัญชีผีก็ผ่านเงื่อนไข "ไม่เห็นสาขาอื่น" ได้ฟรี)
  const { data: seenLeads } = await sb.from("leads").select("dealer_code").limit(200);
  const otherBranches = [...new Set((seenLeads ?? []).map(l => l.dealer_code).filter(c => c !== "CNX"))];
  expect(otherBranches, `เข้าระบบแทน CNX แล้วต้องเห็นเฉพาะข้อมูล CNX (เห็นสาขาอื่น: ${otherBranches.join(",")})`).toEqual([]);
  const { count: cnxLeadCount } = await admin.from("leads").select("id", { count: "exact", head: true }).eq("dealer_code", "CNX");
  if ((cnxLeadCount ?? 0) > 0) {
    expect((seenLeads ?? []).length,
      `CNX มีลูกค้าเป้าหมาย ${cnxLeadCount} รายการ แต่ session ที่ได้กลับมองไม่เห็นเลย = ไม่ได้เข้าเป็นดีลเลอร์จริง`,
    ).toBeGreaterThan(0);
  }

  // ── ต้องมีร่องรอยใน audit log เสมอ (บันทึกตอนออกลิงก์ ไม่ใช่ตอนคลิก) ──
  // คอลัมน์เวลาของ audit_log ชื่อ "at" (ดู 0001_schema.sql) ไม่ใช่ created_at
  const { data: logs, error: logErr } = await admin.from("audit_log")
    .select("action, target, at").gte("at", before).order("at", { ascending: false }).limit(20);
  expect(logErr, `อ่าน audit_log ต้องไม่ error (${logErr?.message ?? ""})`).toBeNull();
  const hit = (logs ?? []).find(l => String(l.action).includes("เข้าระบบแทน") && String(l.target).includes("CNX"));
  expect(hit, `ต้องมีบันทึก "เข้าระบบแทนดีลเลอร์ CNX" ใน audit log (พบ: ${JSON.stringify(logs?.slice(0, 5))})`).toBeTruthy();

  await sb.auth.signOut({ scope: "local" }).catch(() => {});
});

test("ขอเข้าระบบแทนถี่เกินไป → ถูกจำกัด (rate limit)", async ({ request }) => {
  const token = await adminToken();
  const { data: me } = await admin.auth.getUser(token);
  const key = `impersonate-dealer:${me.user?.id ?? ""}`;
  await admin.from("rate_limits").delete().eq("key", key);

  const statuses: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await request.post(`${HQ_ORIGIN}/api/admin/dealers/impersonate?code=CNX`, {
      headers: { authorization: `Bearer ${token}` },
    });
    statuses.push(res.status());
    if (res.status() === 501) test.skip(true, "เครื่องนี้ยังไม่ได้ตั้ง service_role");
  }
  expect(statuses, `ต้องเจอ 429 หลังยิงเกินโควตา 10 ครั้ง/นาที (ได้ ${statuses.join(",")})`).toContain(429);

  await admin.from("rate_limits").delete().eq("key", key);
});

test("แถบเตือน 'กำลังเข้าระบบแทนโดย HQ' ต้องขึ้นในแอปดีลเลอร์ พร้อมทางกลับ", async ({ page }) => {
  // จำลองการมาถึงด้วยลิงก์เข้าระบบแทน (?impersonated=1) โดยใช้ session ของดีลเลอร์จริง
  // ระยะ 4: โหมด api เก็บใบผ่านใน cookie httpOnly — ยัด localStorage ไม่มีผล ต้องล็อกอินผ่าน backend
  if (appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api") {
    const r = await page.context().request.post(`${DEALER_ORIGIN}/api/v1/auth?op=login`, { data: CNX });
    if (!r.ok()) throw new Error(`ล็อกอินดีลเลอร์ CNX ผ่าน backend ไม่ผ่าน: ${r.status()}`);
  } else {
    const sb = await db(CNX);
    const session = (await sb.auth.getSession()).data.session;
    await page.addInitScript(({ key, s }) => { localStorage.setItem(key, JSON.stringify(s)); },
      { key: `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`, s: session });
  }
  await page.goto(`${DEALER_ORIGIN}/dashboard?impersonated=1`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText(/กำลังเข้าระบบแทนดีลเลอร์โดยสำนักงานใหญ่/).first(),
    "ต้องมีแถบบอกว่ากำลังเข้าระบบแทน — ไม่งั้น HQ ไม่รู้ตัวว่ากำลังทำงานในบัญชีคนอื่น",
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /กลับสู่ HQ/ }).first(),
    "ต้องมีทางกลับที่ชัดเจน",
  ).toBeVisible();

  // แถบต้องอยู่ต่อแม้เปลี่ยนหน้า (เก็บสถานะไว้ ไม่ได้อาศัยแค่ query param ของหน้าแรก)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/กำลังเข้าระบบแทนดีลเลอร์โดยสำนักงานใหญ่/).first(),
    "เปลี่ยนหน้าแล้วแถบต้องยังอยู่",
  ).toBeVisible({ timeout: 20_000 });
});

test("ปุ่ม 'เข้าระบบแทน' มีให้ HQ กดจริงบนหน้าดีลเลอร์", async ({ page }) => {
  await open(page, "hq", "/hq/dealers");
  // ปุ่มมีข้อความ "เข้าระบบ" + title "เข้าระบบแทนดีลเลอร์" — ชื่อที่เข้าถึงได้มาจากข้อความในปุ่ม (ชนะ title)
  const btn = page.getByRole("button", { name: "เข้าระบบ", exact: true }).first();
  await expect(btn, "หน้า /hq/dealers ต้องมีปุ่มเข้าระบบแทน").toBeVisible({ timeout: 20_000 });
  await expect(btn, "ปุ่มต้องกดได้ ไม่ใช่ถูกปิดไว้").toBeEnabled();
  await expect(btn, "ต้องบอกด้วย title ว่าปุ่มนี้คือการเข้าระบบแทนดีลเลอร์").toHaveAttribute("title", "เข้าระบบแทนดีลเลอร์");
});
