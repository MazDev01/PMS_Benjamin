import { Page, expect } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import { RYG, CNX, ADMIN, SUPABASE_URL, SUPABASE_ANON, REAL_BACKEND, type Account, appEnv } from "./supabaseEnv";

// สลับ role ก่อนโหลดหน้า (RoleProvider อ่านจาก localStorage ตอน mount) — ใช้ได้เฉพาะโหมด local mock data
export async function loginAs(page: Page, role: "hq" | "dealer") {
  await page.addInitScript((r) => {
    localStorage.setItem("pms_session_key", r as string);
    localStorage.setItem("pms_logged_in", "true");
  }, role);
}

// ── โหมด supabase: ยัด session จริงลง localStorage ตรงๆ แทนล็อกอินผ่านหน้าจอทุกเทสต์ ──
// เร็วกว่ามาก (ไม่ต้องรอ UI) และไม่ชน rate limit ของ Supabase Auth (เข้าสู่ระบบครั้งเดียวต่อบัญชี
// แล้ว cache ไว้ใช้ซ้ำได้ตลอดการรัน — เทียบกับเดิมที่ล็อกอินผ่านหน้าจอทุกเทสต์)
// ⚠️ ต้องเป็น localStorage ให้ตรงกับ client.ts (11 ส.ค. 69 ย้ายกลับจาก sessionStorage
//    เพราะ sessionStorage ทำให้เปิดแท็บใหม่แล้วต้องล็อกอินซ้ำ) — ยัดผิดที่ = แอปไม่เห็น session เลย
// (กัน session สลับข้ามแท็บ, ดู packages/shared/lib/data/supabase/client.ts) คีย์ต้องตรงกับที่แอปใช้จริง
export const SESSION_KEY = `sb-${new URL(SUPABASE_URL || "https://x.supabase.co").hostname.split(".")[0]}-auth-token`;

const sessionCache = new Map<string, Promise<Session>>();
/** ใบผ่านที่จำไว้ยัง "ใช้ได้อีกนานพอ" ไหม — เหลือไม่ถึง 60 วินาทีถือว่าใช้ไม่ได้แล้ว */
const ยังใช้ได้ = (s: Session) => (s.expires_at ?? 0) * 1000 - Date.now() > 60_000;
export async function getSession(who: Account): Promise<Session> {
  // ⚠️ ต้องเช็กอายุก่อนคืนใบผ่านที่จำไว้ (พบ 13 ต.ค. 69)
  //    ฐานทดสอบในเครื่องตั้งอายุใบผ่านไว้ 10 นาที (supabase/config.toml · jwt_expiry) แต่ตัวรันหนึ่งตัวทำงานนานกว่านั้น
  //    เดิมจำใบแรกไว้ตลอด → ข้อทดสอบที่ใช้ใบนี้ยิงฐานข้อมูลตรง ๆ หลังนาทีที่ 10 ได้ "JWT expired"
  //    แล้วตกแบบสุ่มตามลำดับการรัน (ผ่านเมื่อรันซ้ำเพราะตัวรันใหม่เข้าระบบใหม่) — เข้าระบบใหม่เมื่อใบใกล้หมดอายุ
  const cached = sessionCache.get(who.email);
  if (cached) {
    const s = await cached.catch(() => null);
    if (s && ยังใช้ได้(s)) return s;
    sessionCache.delete(who.email);
  }
  const p = (async () => {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.signInWithPassword(who);
    if (error || !data.session) throw new Error(`[helpers] ล็อกอิน ${who.email} ไม่ผ่าน: ${error?.message}`);
    return data.session;
  })();
  sessionCache.set(who.email, p);
  return p;
}

// โมโนเรโป: แอปดีลเลอร์ (dealer) รันที่ :3001 · แอปสำนักงานใหญ่ (hq) รันที่ :3002
// ⚠️ ตั้งทับด้วย PMS_HQ_ORIGIN / PMS_DEALER_ORIGIN ได้ — ใช้ตอนต้องรันเซิร์ฟเวอร์คนละพอร์ต
//    (เช่น มีอีกหน้าต่างใช้ 3001/3002 อยู่) ค่าตั้งต้นเหมือนเดิมทุกประการ
const APP_ORIGIN = {
  hq: process.env.PMS_HQ_ORIGIN ?? "http://localhost:3002",
  dealer: process.env.PMS_DEALER_ORIGIN ?? "http://localhost:3001",
} as const;
// โหมด api เก็บใบผ่านใน cookie httpOnly (ระยะ 4) — เทสต์ต้องล็อกอินผ่าน backend ไม่ใช่ยัด localStorage
const COOKIE_AUTH = appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api";
// role ทั่วไปแมปกับบัญชีจริงบัญชีเดียว (RYG/ADMIN) — เทสต์ที่ต้องเจาะจงบัญชีอื่น (เช่น CNX สำหรับ
// branch-isolation.spec.ts) ใช้ openAs() แทน
const ROLE_ACCOUNT: Record<"hq" | "dealer", Account> = { hq: ADMIN, dealer: RYG };


// ── ล็อกอินครั้งเดียวต่อบัญชี แล้วเอา cookie ไปใช้ซ้ำทุกเทสต์ (โหมด api) ────────
//
// ปัญหาที่แก้ (วัดจริง 27 ส.ค. 69): โหมด api เดิมล็อกอินใหม่ "ทุกเทสต์"
//   ชุดเต็มมีจุดเรียกกว่า 200 ครั้ง × 3 ช่องทางพร้อมกัน — ทั้งระบบยืนยันตัวตนของ Supabase
//   และด่านจำกัดคำขอของเราเองถูกถล่มจนตอบช้า/ปฏิเสธ (เห็น 429 จริงในบันทึกการรัน)
//   อาการที่โผล่คือ "ล็อกอินไม่เสร็จใน 8 วินาที" กระจายทั่วชุด ดูเหมือนบั๊กสุ่ม
// โหมด supabase ไม่เจอปัญหานี้เพราะ getSession() แคชไว้อยู่แล้ว — โหมด api ต้องมีของเทียบเท่า
//
// เก็บ cookie ที่ได้จากการล็อกอินไว้ในหน่วยความจำของ worker แล้วยัดใส่ context ถัดไปแทน
//   cookie หมดอายุ/ถูกปฏิเสธ = ล็อกอินใหม่ให้อัตโนมัติ (ตรวจจากการถูกเด้งไปหน้าเข้าสู่ระบบ)
type คุกกี้ = Awaited<ReturnType<import("@playwright/test").BrowserContext["cookies"]>>;
const คุกกี้ที่เก็บไว้ = new Map<string, คุกกี้>();

export async function เข้าระบบด้วยคุกกี้(page: Page, origin: string, who: Account): Promise<void> {
  const key = `${origin}|${who.email}`;
  const เก่า = คุกกี้ที่เก็บไว้.get(key);
  if (เก่า?.length) {
    await page.context().addCookies(เก่า);
    return;
  }
  const res = await page.context().request.post(`${origin}/api/v1/auth?op=login`, {
    data: { email: who.email, password: who.password },
  });
  if (!res.ok()) throw new Error(`ล็อกอิน ${who.email} ผ่าน backend ไม่ผ่าน: ${res.status()} ${await res.text()}`);
  const ทั้งหมด = await page.context().cookies();
  คุกกี้ที่เก็บไว้.set(key, ทั้งหมด.filter(c => c.name.startsWith("pms_at") || c.name.startsWith("pms_rt")));
}

/** cookie ที่เก็บไว้ใช้ไม่ได้แล้ว (ถูกเด้งออก) — ทิ้งแล้วล็อกอินใหม่ */
export async function ล็อกอินใหม่(page: Page, origin: string, who: Account): Promise<void> {
  คุกกี้ที่เก็บไว้.delete(`${origin}|${who.email}`);
  await page.context().clearCookies();
  await เข้าระบบด้วยคุกกี้(page, origin, who);
}

/** เปิดหน้าแบบล็อกอินจริง (โหมด supabase) หรือจำลอง role (โหมด local) ตามที่แอปตั้งค่าไว้ */
export async function open(page: Page, role: "hq" | "dealer", path: string) {
  if (REAL_BACKEND) return openAs(page, ROLE_ACCOUNT[role], role, path);
  await loginAs(page, role);
  await page.goto(APP_ORIGIN[role] + path, { waitUntil: "domcontentloaded" });
}

/** เปิดหน้าด้วยบัญชีจริงที่ระบุเจาะจง (เช่น CNX สำหรับเทสต์ตรวจการกันข้ามสาขา) */
export async function openAs(page: Page, who: Account, appRole: "hq" | "dealer", path: string) {
  if (COOKIE_AUTH) {
    // ระยะ 4: ใบผ่านอยู่ใน cookie httpOnly แล้ว — ยัด session ลง localStorage ไม่มีผลอีกต่อไป
    // ต้องล็อกอินผ่าน backend จริงเพื่อให้ได้ cookie มาอยู่ในเบราว์เซอร์ของเทสต์
    // (ใช้ cookie เดิมซ้ำถ้ามี — ดูเหตุผลที่ เข้าระบบด้วยคุกกี้)
    await เข้าระบบด้วยคุกกี้(page, APP_ORIGIN[appRole], who);
  } else {
    const session = await getSession(who);
    await page.addInitScript(({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    }, { key: SESSION_KEY, session });
  }
  await page.goto(APP_ORIGIN[appRole] + path, { waitUntil: "domcontentloaded" });
  await settle(page);
  // cookie ที่ใช้ซ้ำหมดอายุ/ถูกปฏิเสธ → เด้งไปหน้าเข้าสู่ระบบ · ล็อกอินใหม่แล้วเปิดซ้ำครั้งเดียว
  if (COOKIE_AUTH && page.url().includes("/login")) {
    await ล็อกอินใหม่(page, APP_ORIGIN[appRole], who);
    await page.goto(APP_ORIGIN[appRole] + path, { waitUntil: "domcontentloaded" });
    await settle(page);
  }
}

/** รอจน "ไม่มีคำขอข้อมูลค้างแล้ว" — เวอร์ชันที่ไม่นับสายอัปเดตสด
 *
 * ⚠️ ห้ามใช้ waitForLoadState("networkidle") กับแอปนี้:
 *    โหมด api เปิดสายอัปเดตสด (SSE) ค้างไว้ตลอดโดยตั้งใจ — เป็นคำขอ HTTP ที่ไม่มีวันจบ
 *    เงื่อนไข "ไม่มีคำขอค้างเลย" จึงไม่มีวันเป็นจริง → รอจนหมดเวลา 20 วินาทีทุกครั้งที่เปิดหน้า
 *    (วัดจริง 18 ส.ค. 69: ชุดเต็มโหมด api 31 นาที เทียบโหมดปกติ 9 นาที · ทุกหน้าเสียคงที่ ~20 วินาที)
 *    โหมดปกติไม่เจอเพราะใช้ WebSocket ซึ่งตัวนับ networkidle ไม่นับ — ไม่ได้แปลว่าแอปเร็วกว่าจริง
 *
 * ⚠️ และห้ามเปลี่ยนไปหน่วงเวลาตายดีลเลอร์ — เคยลองแล้วพัง:
 *    รอ 600 มิลลิวินาทีเฉย ๆ ทำให้เทสต์อ่านหน้าก่อนข้อมูลมาถึง ล้มเพิ่ม 7 ข้อ "ทั้งสองโหมด"
 *    ต้องรอ "จนคำขอข้อมูลหยุดจริง" เหมือน networkidle เดิม แค่ไม่นับสายอัปเดตสดเข้าไปด้วย
 */
export async function settle(page: Page, quietMs = 500, timeoutMs = 15_000) {
  await page.waitForLoadState("load").catch(() => {});
  const isStream = (u: string) => u.includes("/api/v1/events");
  let pending = 0;
  const onStart = (r: { url(): string }) => { if (!isStream(r.url())) pending += 1; };
  const onEnd   = (r: { url(): string }) => { if (!isStream(r.url())) pending = Math.max(0, pending - 1); };
  page.on("request", onStart);
  page.on("requestfinished", onEnd);
  page.on("requestfailed", onEnd);
  const deadline = Date.now() + timeoutMs;
  let quietSince = Date.now();
  try {
    while (Date.now() < deadline) {
      if (pending > 0) quietSince = Date.now();
      else if (Date.now() - quietSince >= quietMs) return;
      await page.waitForTimeout(50);
    }
  } catch { /* หน้าถูกปิดระหว่างรอ — ไม่ใช่ความผิดพลาด */ }
  finally {
    page.off("request", onStart);
    page.off("requestfinished", onEnd);
    page.off("requestfailed", onEnd);
  }
}

export { RYG, CNX, ADMIN };

// สร้างลูกค้าเป้าหมายของสาขา RYG ที่ "ยังไม่มีใบเสนอราคา" ไว้ให้เทสต์ออกใบใหม่ได้แน่นอน
//   ใช้เมื่อไล่หาในตารางแล้วไม่เจอ (ฐานทดสอบมีของสะสมจากรอบก่อน ๆ จนทุกรายมีใบครบ)
const ชื่อลูกค้าเป้าหมายว่าง = "ZZTEST-NEWQ";
async function สร้างลูกค้าเป้าหมายว่างสำหรับออกใบ(): Promise<string> {
  const session = await getSession(RYG);
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  // เก็บกวาดของรอบก่อนก่อนเสมอ — ไม่งั้นฐานทดสอบพอกขึ้นทุกครั้งที่รัน
  await sb.from("leads").delete().like("company", `${ชื่อลูกค้าเป้าหมายว่าง}%`);
  const numId = 993_000 + (Date.now() % 900);
  const ชื่อ = `${ชื่อลูกค้าเป้าหมายว่าง}-${numId}`;
  const { error } = await sb.from("leads").insert({
    id: `#L-${numId}`, dealer_code: "RYG", num_id: numId, name: ชื่อ, company: ชื่อ,
    contact: "คุณทดสอบออกใบ", phone: "081-000-0007", province: "ระยอง", product: "โรงงาน",
    status: "QUOTED", value: "500000", area: "100", assigned: "ทดสอบระบบ",
  });
  if (error) throw new Error(`[helpers] สร้างลูกค้าเป้าหมายสำหรับออกใบใหม่ไม่ได้: ${error.message}`);
  return ชื่อ;
}

// เปิดฟอร์ม "สร้างใบเสนอราคาใหม่" — ตอนนี้อยู่ในแผงรายละเอียดลูกค้าเป้าหมาย (แท็บใบเสนอราคา)
// wizard เดิมบนหน้า /quotations ถูกลบทั้งฟีเจอร์ → ดีลเลอร์ออกใบจากลูกค้าเป้าหมายเท่านั้น
export async function openLeadQuotationForm(page: Page, opts?: { ใบใหม่เท่านั้น?: boolean }) {
  await open(page, "dealer", "/leads");
  await page.getByRole("button", { name: "ตาราง" }).click(); // ค่าเริ่มต้น=บอร์ด → สลับเป็นตาราง

  // ⚠️ ลูกค้าเป้าหมายแถวแรกอาจ "มีใบเสนอราคาอยู่แล้ว" (หนึ่งดีล = ใบเดียว → ปุ่มกลายเป็น "เพิ่มรายการในใบเดิม")
  //    เทสต์ที่ต้องการ "ใบที่เพิ่งสร้างใหม่" จะได้ใบเก่ามาแทน แล้วตกแบบงง ๆ (เจอจริง 21 ส.ค. 69:
  //    ไปแก้ใบ ZZTEST-BASE-Q-RYG-6 ซึ่งวันที่ออกเป็นของเดิม ไม่ใช่วันนี้ — ถูกต้องแล้วแต่ไม่ใช่สิ่งที่วัด)
  //    ตัวเลือกนี้จึงไล่หาแถวที่ยังไม่มีใบจริง ๆ ก่อน
  const เปิดแถว = async (i: number) => {
    await page.getByRole("button", { name: "ดูรายละเอียด" }).nth(i).click();
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  };
  if (opts?.ใบใหม่เท่านั้น) {
    const จำนวนแถว = Math.min(await page.getByRole("button", { name: "ดูรายละเอียด" }).count(), 10);
    let เจอ = false;
    for (let i = 0; i < จำนวนแถว; i++) {
      await เปิดแถว(i);
      if (await page.getByRole("button", { name: "สร้างใบเสนอราคา", exact: true }).count() > 0) { เจอ = true; break; }
      await page.keyboard.press("Escape");   // ปิดแผงแล้วลองแถวถัดไป
      await page.waitForTimeout(200);
    }
    // ⚠️ ไม่เจอ = ลูกค้าเป้าหมาย 10 แถวแรกมีใบครบแล้ว (ฐานทดสอบสะสมของจากรอบก่อน ๆ · เจอจริง 2 ก.ย. 69)
    //    เดิมโยน error ทิ้ง ทั้งที่ไม่ใช่บั๊กของระบบ — ตอนนี้สร้างลูกค้าเป้าหมายใหม่ของเทสต์เองแทน
    //    (ลบตัวที่ค้างจากรอบก่อนทิ้งก่อน จะได้ไม่พอกขึ้นเรื่อย ๆ)
    if (!เจอ) {
      const ชื่อ = await สร้างลูกค้าเป้าหมายว่างสำหรับออกใบ();
      await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ);
      const แถว = page.locator("tbody tr").filter({ hasText: ชื่อ }).first();
      await expect(แถว).toBeVisible({ timeout: 20_000 });
      await แถว.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
      await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    }
  } else {
    await เปิดแถว(0);
  }

  // ── กติกา 20 ส.ค. 69: หนึ่งดีล = ใบเสนอราคาใบเดียว ──────────────────────────
  // ลูกค้าเป้าหมายที่ยังไม่มีใบ → ปุ่มเขียนว่า "สร้างใบเสนอราคา" (เข้าฟอร์มออกใบใหม่)
  // ลูกค้าเป้าหมายที่มีใบที่ยังแก้ได้ → ปุ่มเขียนว่า "เพิ่มรายการในใบเสนอราคา" (เข้าฟอร์มแก้ใบเดิม)
  // เทสต์ที่แค่ "ขอให้ได้ฟอร์มใบเสนอราคา" จึงต้องรับได้ทั้งสองทาง
  await page.getByRole("button", { name: /(สร้าง|เพิ่มรายการใน)ใบเสนอราคา/ }).first().click();
  await expect(page.getByText(/สร้างใบเสนอราคาใหม่|^แก้ไข /)).toBeVisible();

  // BOQ ต้องมีอย่างน้อย 1 รายการ ปุ่มบันทึกถึงจะกดได้
  //   ลูกค้าเป้าหมายบางรายตั้งต้นไม่ได้ (แม่แบบไม่ตรงแคตตาล็อก / ยังไม่มีราคากลาง / ไม่ได้กรอกพื้นที่)
  //   ตอนนี้ปุ่มเลือกจากแคตตาล็อกเปิดไว้เสมอแล้ว จึงเติมเองได้ ไม่ต้องพึ่งว่าลูกค้าเป้าหมายใบไหนถูกหยิบมา
  const ราคาต่อหน่วย = page.getByLabel("ราคาต่อหน่วย");
  if (await ราคาต่อหน่วย.count() === 0) {
    await page.getByRole("button", { name: /เลือกจากแคตตาล็อก/ }).click();
    await page.locator("button").filter({ hasText: /฿[\d,]+\/\S+/ }).first().click();
    await expect(ราคาต่อหน่วย.first()).toBeVisible({ timeout: 10_000 });
  }
}

// ตรวจหน้าโหลดสมบูรณ์: มีหัวข้อ h2 + ไม่มี uncaught error + ไม่มี body เลื่อนแนวนอน
export async function assertHealthyPage(page: Page, label: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
  await expect(page.locator("h1, h2, h3").first(), `${label} ควรมีหัวข้อหน้า`).toBeVisible({ timeout: 12_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} ไม่ควรมี horizontal scroll (เกิน ${overflow}px)`).toBeLessThanOrEqual(3);
  expect(errors, `${label} ไม่ควรมี JS error`).toEqual([]);
}

// ── กล่องยืนยันของระบบ (sonner) — แทน confirm() ของเบราว์เซอร์ (บอสสั่ง 28 ส.ค. 69) ──
//
// ⚠️ เดิมเทสต์ดักด้วย page.on("dialog") ซึ่งเป็นกลไกของ "กล่องเบราว์เซอร์" เท่านั้น
//    ตอนนี้กล่องยืนยันเป็น HTML ในหน้าเว็บ — ตัวดักนั้นจะไม่ทำงานอีกต่อไป
//    และร้ายกว่านั้นคือมัน "ไม่ล้ม" แค่ไม่มีอะไรเกิดขึ้น เทสต์จึงเขียวแบบหลอกได้
//    ทุกจุดที่เคยดัก dialog ต้องเปลี่ยนมาใช้สองตัวนี้แทน
const กล่องยืนยัน = (page: Page) => page.locator(".pms-confirm[role='alertdialog']");

/** รอกล่องยืนยันแล้วกด "ตกลง" — คืนข้อความในกล่อง (ไว้ตรวจว่าถามถูกเรื่อง) */
export async function กดตกลงในกล่องยืนยัน(page: Page): Promise<string> {
  const box = กล่องยืนยัน(page);
  await expect(box, "ต้องมีกล่องยืนยันขึ้นมาก่อน").toBeVisible({ timeout: 15_000 });
  const ข้อความ = (await box.innerText()).trim();
  await box.locator(".pms-confirm-actions button").last().click();
  await expect(box).toBeHidden({ timeout: 10_000 });
  return ข้อความ;
}

/** รอกล่องยืนยันแล้วกด "ยกเลิก" — คืนข้อความในกล่อง */
export async function กดยกเลิกในกล่องยืนยัน(page: Page): Promise<string> {
  const box = กล่องยืนยัน(page);
  await expect(box, "ต้องมีกล่องยืนยันขึ้นมาก่อน").toBeVisible({ timeout: 15_000 });
  const ข้อความ = (await box.innerText()).trim();
  await box.locator(".pms-confirm-actions button").first().click();
  await expect(box).toBeHidden({ timeout: 10_000 });
  return ข้อความ;
}

/** มีกล่องยืนยันค้างอยู่ไหม (ไม่รอ) — ใช้ตรวจว่า "ต้องไม่ถาม" */
export async function มีกล่องยืนยัน(page: Page): Promise<boolean> {
  return (await กล่องยืนยัน(page).count()) > 0;
}

/** กด "ตกลง" ถ้ามีกล่องยืนยันขึ้นมา — ไม่ขึ้นก็ผ่านไป
 *
 *  ⚠️ ใช้เฉพาะจุดที่ "อาจถามหรือไม่ถามก็ได้" เท่านั้น เช่น ปิดการขายที่อาจถูกด่านกันไว้
 *     ตั้งแต่ก่อนถาม (ยังไม่มีใบที่ส่งให้ลูกค้า) — เทียบเท่ากับ page.once("dialog", accept) เดิม
 *     จุดที่ "ต้องถามแน่ ๆ" ให้ใช้ กดตกลงในกล่องยืนยัน เพื่อไม่ให้เทสต์เขียวแบบหลอก */
export async function ถ้ามีกล่องยืนยันให้กดตกลง(page: Page): Promise<boolean> {
  const box = กล่องยืนยัน(page);
  try {
    await box.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    return false;   // ไม่ถาม = ถูกกันไว้ก่อนแล้ว หรือไม่ต้องยืนยัน
  }
  await box.locator(".pms-confirm-actions button").last().click();
  await expect(box).toBeHidden({ timeout: 10_000 });
  return true;
}

// ── ข้อความแจ้งเตือนของระบบ (sonner) — แทน alert() ของเบราว์เซอร์ (บอสสั่ง 2 ก.ย. 69) ──
//
// ⚠️ เหตุผลเดียวกับกล่องยืนยัน: page.on("dialog") ใช้ไม่ได้อีกแล้ว เพราะไม่ใช่กล่องเบราว์เซอร์
//    และมันจะไม่ล้ม แค่ไม่มีอะไรถูกดัก → เทสต์เขียวแบบหลอก
//    ตัวนี้เก็บข้อความแจ้งเตือน "ทุกใบที่เคยขึ้น" ระหว่างเทสต์ (ใบเก่าหายไปเองตามเวลา)
export function ดักข้อความแจ้งเตือน(page: Page): () => string[] {
  const เก็บ: string[] = [];
  const อ่าน = async () => {
    for (const t of await page.locator(".pms-confirm[role='status']").allInnerTexts().catch(() => [])) {
      const ข้อความ = t.replace(/\s+/g, " ").trim();
      if (ข้อความ && !เก็บ.includes(ข้อความ)) เก็บ.push(ข้อความ);
    }
  };
  const จับเวลา = setInterval(() => { void อ่าน(); }, 250);
  page.once("close", () => clearInterval(จับเวลา));
  return () => เก็บ;
}

/** รอข้อความแจ้งเตือนที่ตรงกับที่คาด แล้วคืนข้อความนั้น (ว่าง = ไม่ขึ้นเลยจนหมดเวลา) */
export async function รอข้อความแจ้งเตือน(page: Page, ตรงกับ: RegExp, timeout = 15_000): Promise<string> {
  const ใบ = page.locator(".pms-confirm[role='status']").filter({ hasText: ตรงกับ }).first();
  try {
    await ใบ.waitFor({ state: "visible", timeout });
    return (await ใบ.innerText()).replace(/\s+/g, " ").trim();
  } catch { return ""; }
}
