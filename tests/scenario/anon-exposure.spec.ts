import { test, expect } from "@playwright/test";
import { SUPABASE_URL, SUPABASE_ANON, skipReason } from "./supabaseEnv";
import { ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN } from "./funcHelpers";

// ── คนที่ยังไม่ล็อกอิน ต้องอ่านอะไรไม่ได้เลย — ตรวจ "ทุกตาราง/วิว" ไม่ใช่เฉพาะที่นึกออก ──
//
// เคยหลุดมาแล้วจริง 2 ครั้ง และทั้งสองครั้งเป็นของที่ "ไม่มีใครนึกถึง":
//   • ทะเบียนดีลเลอร์ทั้งเครือ (dealers_directory) เปิดให้คนนอกดึงดูได้ — ชื่อ/จังหวัด/เป้ายอดขาย
//   • ตารางที่เพิ่งเพิ่มใหม่มักลืมปิดสิทธิ์ เพราะ Supabase ให้สิทธิ์ anon เป็นค่าเริ่มต้น
//
// เทสต์นี้จึงไม่ฮาร์ดโค้ดรายชื่อ แต่ถามระบบเองว่า "ตอนนี้มีอะไรเปิดให้เรียกผ่าน API บ้าง"
// (PostgREST ประกาศรายการไว้ที่หน้าแรกของ API) แล้วไล่ยิงทุกตัวด้วยกุญแจสาธารณะ
// → เพิ่มตารางใหม่วันหลังก็ถูกตรวจอัตโนมัติ ไม่ต้องมีใครจำมาเพิ่มในเทสต์
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

/** ตาราง/วิวที่ "ตั้งใจ" ให้คนยังไม่ล็อกอินอ่านได้ — ต้องว่างเปล่า
 *  ถ้าวันหนึ่งมีความจำเป็นทางธุรกิจจริง ๆ ให้เติมที่นี่พร้อมเหตุผล จะได้เห็นชัดว่าเปิดอะไรไว้บ้าง */
const PUBLIC_BY_DESIGN: string[] = [];

async function exposedObjects(): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: ADMIN_SERVICE_ROLE_KEY, authorization: `Bearer ${ADMIN_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`อ่านรายการตาราง/วิวจาก API ไม่สำเร็จ (${res.status})`);
  const spec = await res.json() as { paths?: Record<string, unknown> };
  return Object.keys(spec.paths ?? {})
    .filter(p => p.startsWith("/") && p.length > 1 && !p.startsWith("/rpc/"))
    .map(p => p.slice(1))
    .filter(name => /^[a-z0-9_]+$/.test(name));
}

test("คนที่ยังไม่ล็อกอิน ต้องอ่านข้อมูลจากทุกตาราง/วิวไม่ได้เลย", async () => {
  const names = await exposedObjects();
  // ต้องเจอของจริงพอสมควร ไม่งั้นแปลว่าอ่านรายการมาไม่ได้ แล้วเทสต์จะ "ผ่าน" แบบไม่ได้ตรวจอะไร
  expect(names.length, `ต้องอ่านรายชื่อตาราง/วิวได้ (ได้ ${names.length} รายการ)`).toBeGreaterThan(5);
  console.log(`[anon] ตรวจ ${names.length} ตาราง/วิว: ${names.slice(0, 40).join(", ")}${names.length > 40 ? " …" : ""}`);

  const leaked: string[] = [];
  for (const name of names) {
    if (PUBLIC_BY_DESIGN.includes(name)) continue;
    const r = await fetch(`${SUPABASE_URL}/${"rest/v1"}/${name}?select=*&limit=1`, { headers: { apikey: SUPABASE_ANON } });
    if (!r.ok) continue;                       // ถูกปฏิเสธ = ถูกต้องแล้ว
    const rows = await r.json().catch(() => []);
    if (Array.isArray(rows) && rows.length > 0) leaked.push(`${name} (${rows.length} แถว)`);
  }

  expect(leaked,
    `ตาราง/วิวเหล่านี้เปิดให้คนยังไม่ล็อกอินอ่านข้อมูลได้: ${leaked.join(" · ")}`,
  ).toEqual([]);
});

test("กุญแจสาธารณะเขียนข้อมูลไม่ได้เลย", async () => {
  // อ่านไม่ได้อย่างเดียวไม่พอ — ถ้าเขียนได้ คนนอกจะยัดลูกค้าเป้าหมาย/ใบเสนอราคาปลอมเข้าระบบได้
  const targets = ["leads", "quotations", "customers", "dealers", "profiles", "audit_log"];
  const writable: string[] = [];
  for (const t of targets) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({ id: "ZZTEST-ANON-WRITE" }),
    });
    if (r.ok) writable.push(t);
  }
  expect(writable, `ตารางเหล่านี้ยอมให้คนยังไม่ล็อกอินเขียนข้อมูลได้: ${writable.join(", ")}`).toEqual([]);
});

// ปุ่ม "เข้าใช้งานได้เลย" มีไว้ให้เดโมเท่านั้น (บอสสั่ง 17 ส.ค. 69) — กันด้วย !REAL_BACKEND ที่ LoginCard
// ถ้ามันหลุดไปโผล่บนระบบจริง = ใครก็กดเข้าเป็นผู้ดูแลสำนักงานใหญ่ได้โดยไม่ต้องรู้รหัสผ่าน — เทสต์นี้คือตัวกัน
test("[security] ระบบที่ต่อฐานข้อมูลจริง ห้ามมีปุ่มทางลัดเข้าระบบของโหมดสาธิต", async ({ page }) => {
  for (const [origin, path] of [[DEALER_ORIGIN, "/login"], [HQ_ORIGIN, "/hq/login"]] as const) {
    await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const box = await page.getByText("โหมดสาธิต — เข้าใช้งานได้เลย").count();
    const btns = await page.getByRole("button", { name: /เข้าใช้งานเป็น/ }).count();
    expect(box + btns, `${path} ต้องไม่มีทางลัดเข้าระบบ`).toBe(0);
  }
});

// ลิงก์ข้ามเดโมพก ?autologin=1 มาด้วย — ถ้ามีคนเดาลิงก์นี้ยิงใส่ระบบจริง
// ต้องไม่เกิดอะไรขึ้นเลย — ต้องค้างอยู่หน้า login เหมือนเดิม
test("[security] ?autologin=1 ต้องไม่มีผลกับระบบที่ต่อฐานข้อมูลจริง", async ({ page }) => {
  for (const [origin, path] of [[DEALER_ORIGIN, "/login"], [HQ_ORIGIN, "/hq/login"]] as const) {
    await page.goto(`${origin}${path}?autologin=1`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    expect(page.url(), `${path} ต้องไม่ถูกพาเข้าระบบ`).toContain("login");
    expect(await page.getByRole("button", { name: /เข้าสู่ระบบ/ }).count(),
      "ต้องยังอยู่หน้ากรอกอีเมล/รหัสตามเดิม").toBeGreaterThan(0);
  }
});
