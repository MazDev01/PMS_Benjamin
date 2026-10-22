import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN, SUPABASE_URL, SUPABASE_ANON, skipReason, appEnv } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, cleanup, watchErrors, assertNoErrors, นำเข้าลูกค้าหนึ่งราย, ลูกค้าเป้าหมายรองรับสาขา } from "./funcHelpers";
import { settle, ติดตามคำขอ } from "./helpers";
import { ลบสาขาทดสอบตรง } from "./testDealers";
import { กดตกลงในกล่องยืนยัน } from "./helpers";

// ── Multi-Dealer Load / Stress Test ──────────────────────────────────────────
// จำลอง 10 ดีลเลอร์ใช้งานพร้อมกันจริง (บัญชี auth จริง ไม่ใช่ mock) + HQ ติดตามแบบเรียลไทม์
// ทุกขั้นตอนตามที่ขอ: เพิ่ม/แก้ไข/ค้นหาลูกค้า → สร้างใบเสนอราคา → เปลี่ยนสถานะ → ปิดการขายสำเร็จ/ไม่สำเร็จ
//   → แนบไฟล์ + บันทึกหมายเหตุ — ทำพร้อมกันทั้ง 10 บัญชี แล้วตรวจว่าไม่มีข้อมูลปนกัน/เลขซ้ำ/ระบบค้าง
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(600_000);

const N = 10;
const TAG = "ZZLOAD";
// รหัสดีลเลอร์ต้องเป็น A–Z ล้วน 2–5 ตัว (0091_dealers_revoke_table_grant + validation ฝั่งเซิร์ฟเวอร์)
const CODES = ["ZZLA","ZZLB","ZZLC","ZZLD","ZZLE","ZZLF","ZZLG","ZZLH","ZZLI","ZZLJ"].slice(0, N);

type Provisioned = { code: string; email: string; password: string };

/** ใบผ่าน HQ ตัวเดียวใช้ร่วมกันทั้ง 10 ดีลเลอร์ (ล็อกอินถี่ = ชนด่านจำกัดคำขอของระบบยืนยันตัวตน) */
let hqClientP: Promise<SupabaseClient> | null = null;
const hqClient = () => (hqClientP ??= adminToken().then(r => r.sb));

async function adminToken(): Promise<{ sb: SupabaseClient; token: string }> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sb.auth.signInWithPassword(ADMIN);
  if (error) throw new Error(`ล็อกอิน ADMIN ไม่ผ่าน: ${error.message}`);
  const { data } = await sb.auth.getSession();
  return { sb, token: data.session?.access_token ?? "" };
}

// เก็บกวาดสาขาทดสอบด้วยสิทธิ์เซิร์ฟเวอร์โดยตรง — ไม่ผ่านเส้นทาง "ลบดีลเลอร์" ของระบบ (13 ต.ค. 69)
//   เดิมเรียกเส้นทางนั้น: วันที่เส้นทางพัง สาขาทดสอบค้างในฐาน แล้วข้อทดสอบอื่นที่ไม่เกี่ยวตกตาม (ดู testDealers.ts)
async function purgeDealer(_token: string, code: string) {
  await ลบสาขาทดสอบตรง(code);
}

async function provisionDealer(token: string, code: string): Promise<Provisioned | null> {
  const res = await fetch(`${HQ_ORIGIN}/api/admin/dealers`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, name: `${TAG}-ดีลเลอร์-${code}`, province: "ทดสอบโหลด", region: "กลาง", revenueTarget: 0, status: "active", prospectId: await ลูกค้าเป้าหมายรองรับสาขา(code) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { console.log(`[setup] สร้างดีลเลอร์ ${code} ไม่สำเร็จ: ${JSON.stringify(json)}`); return null; }
  // เทสต์นี้ไม่ได้ทดสอบหน้าตั้งรหัสครั้งแรก — ปลดไว้ ไม่งั้นทุกหน้าติดอยู่ที่หน้านั้น
  await (await import("./firstLogin")).ข้ามตั้งรหัสครั้งแรก(json.email);
  return { code, email: json.email, password: json.password };
}

const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
const COOKIE_AUTH = appEnv("NEXT_PUBLIC_DATA_SOURCE") === "api";   // ใบผ่านอยู่ใน cookie (ระยะ 4)
async function openAsDealer(context: BrowserContext, dealer: Provisioned): Promise<{ page: Page; sb: SupabaseClient }> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: dealer.email, password: dealer.password });
  if (error || !data.session) throw new Error(`ล็อกอินดีลเลอร์ ${dealer.code} ไม่ผ่าน: ${error?.message}`);
  const page = await context.newPage();
  ติดตามคำขอ(page);   // settle ก่อนเปลี่ยนหน้าต้องเห็นคำขอบันทึกที่เริ่มก่อนถูกเรียก (ต้นเหตุไม่นิ่ง · รอบปิดด่าน 5)
  // ระยะ 4: โหมด api เก็บใบผ่านใน cookie httpOnly — ยัด localStorage ไม่มีผล ต้องล็อกอินผ่าน backend
  if (COOKIE_AUTH) {
    const r = await context.request.post(`${DEALER_ORIGIN}/api/v1/auth?op=login`, {
      data: { email: dealer.email, password: dealer.password },
    });
    if (!r.ok()) throw new Error(`ล็อกอินดีลเลอร์ ${dealer.code} ผ่าน backend ไม่ผ่าน: ${r.status()}`);
  } else {
    await page.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); },
      { key: SESSION_KEY, session: data.session });
  }
  return { page, sb };
}

// ── ขั้นตอนงานของดีลเลอร์หนึ่งราย: เพิ่มลูกค้า → แก้ไข → ค้นหา → สร้างใบเสนอราคา
//    → ส่ง → ปิดการขาย(สำเร็จ/ไม่สำเร็จ) → แนบไฟล์ → บันทึกหมายเหตุ ──
async function runDealerFlow(page: Page, sb: SupabaseClient, code: string, willWin: boolean, timings: Record<string, number>) {
  const COMPANY = `${TAG}-ลูกค้า-${code}`;
  const t0 = Date.now();
  const mark = (label: string) => { timings[`${code}:${label}`] = Date.now() - t0; };

  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });

  // 1) เพิ่มลูกค้าใหม่ (นำเข้าลูกค้าเดิมจากไฟล์)
  //    ปุ่ม "คีย์เองทีละราย" ถูกเอาออกตามที่บอสสั่ง 2 ก.ย. 69 — ทางเดียวคือนำเข้าไฟล์
  await นำเข้าลูกค้าหนึ่งราย(page, COMPANY, { ผู้ติดต่อ: `คุณ${code}` });
  await expect.poll(async () => (await sb.from("customers").select("id").eq("company", COMPANY)).data?.length ?? 0,
    { timeout: 60_000, message: `${code}: ลูกค้าต้องถูกสร้าง` }).toBe(1);
  mark("customer_created");

  // 2) ค้นหาลูกค้า
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  try {
    await expect(row, `${code}: ค้นหาต้องเจอลูกค้าที่เพิ่งสร้าง`).toBeVisible({ timeout: 30_000 });
  } catch (e) {
    const box = page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...");
    const searchVal = await box.inputValue().catch(() => "<อ่านไม่ได้>");
    const rowCount = await page.locator("tbody tr").count().catch(() => -1);
    const firstRows = (await page.locator("tbody tr").allInnerTexts().catch(() => []))
      .slice(0, 3).map(t => t.replace(/\s+/g, " ").slice(0, 80));
    const banner = await page.locator("body").innerText().catch(() => "");
    const errBits = banner.split("\n").filter(l => /ไม่สำเร็จ|ผิดพลาด|โหลดข้อมูล|เชื่อมต่อ/.test(l)).slice(0, 3);
    const { count: dbCount } = await sb.from("customers").select("id", { count: "exact", head: true }).eq("company", COMPANY);
    // พิมพ์สภาพหน้าจอ ณ วินาทีที่ล้ม — ตอนแก้บั๊ก "แถวหายเพราะผลโหลดมาช้าทับ" (6 ส.ค. 69)
    // ข้อมูลชุดนี้คือสิ่งที่ชี้ตัวการได้: ตารางว่าง 0 แถว + ไม่มีแบนเนอร์ error + ใน DB มีแถวอยู่
    // ถ้าไม่มีบรรทัดนี้ จะเห็นแค่ "ค้นหาไม่เจอ" แล้วเดากันต่อว่าเพราะอะไร
    console.log(`[stress·วินิจฉัย] ${code} ค้นหาไม่เจอ · ช่องค้นหา="${searchVal}" · แถวในตาราง=${rowCount} · ตัวอย่างแถว=${JSON.stringify(firstRows)} · แบนเนอร์=${JSON.stringify(errBits)} · ใน DB=${dbCount}`);
    throw e;
  }
  mark("searched");

  // 3) เปิดลูกค้า → แก้ไขข้อมูล (เบอร์โทร) ในที่เดิม
  await row.click();
  const phoneInput = page.locator('input[placeholder="0XX-XXX-XXXX"]').first();
  await expect(phoneInput).toBeVisible({ timeout: 30_000 });
  // ⚠️ ช่องเบอร์โทรใส่ขีดให้อัตโนมัติตั้งแต่ตอนพิมพ์ (บอสสั่ง 21 ส.ค. 69) — พิมพ์เลขล้วน
  //    แต่ค่าที่บันทึกจริงคือรูปแบบมีขีด เทสต์จึงต้องคาดหวังรูปแบบที่ผู้ใช้เห็นจริง
  await phoneInput.fill("0899999999");
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect.poll(async () => (await sb.from("customers").select("phone").eq("company", COMPANY)).data?.[0]?.phone,
    { timeout: 45_000, message: `${code}: เบอร์โทรต้องอัปเดต` }).toBe("089-999-9999");
  mark("customer_edited");

  // 4) สร้างดีลใหม่ (เพิ่มงานขายใหม่ → เพิ่มงานขาย) — เปิด redirect ไปหน้าลูกค้าเป้าหมายพร้อม detail
  await page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).first().click();
  const newDealBtn = page.getByRole("button", { name: "เพิ่มงานขายใหม่" }).last();
  await expect(newDealBtn).toBeVisible({ timeout: 30_000 });
  await newDealBtn.click();
  // ช่องประเมินราคาเอาออกแล้ว (บอสตัดสิน 19 ต.ค. 69 ข้อ 5) — ฟอร์มเพิ่มงานขายกดบันทึกได้เลย
  const createDealBtn = page.getByRole("button", { name: "เพิ่มงานขาย", exact: true });
  await expect(createDealBtn).toBeEnabled({ timeout: 30_000 });
  await createDealBtn.click();
  await page.waitForURL(/\/leads\?open=/, { timeout: 60_000 });
  mark("deal_created");

  // 5) แนบไฟล์ที่ลูกค้าเป้าหมาย (ช่องไม่มี accept = ช่องแนบไฟล์ทั่วไป ต่างจากช่องอัปโหลดโลโก้)
  const fileInput = page.locator('input[type="file"]:not([accept])').first();
  await expect(fileInput, `${code}: ต้องมีช่องแนบไฟล์ในลิ้นชักลูกค้าเป้าหมาย`).toBeAttached({ timeout: 45_000 });
  await fileInput.setInputFiles({ name: `${TAG}-${code}-เอกสาร.pdf`, mimeType: "application/pdf", buffer: Buffer.from(`load test ${code}`) });
  await expect.poll(async () => (await sb.from("files").select("id").like("name", `%${code}-เอกสาร%`)).data?.length ?? 0,
    { timeout: 45_000, message: `${code}: ไฟล์ต้องขึ้น Storage/DB` }).toBeGreaterThan(0);
  mark("file_attached");

  // 6) ด่าน 3 (ใบ 0201): ใบลูกค้าต้องทำจากใบ HQ — ดีลเลอร์ขอราคาให้งานขายนี้ → HQ ทำ BOQ + ส่งใบ (ผ่านคำสั่งของฐาน)
  //    แล้วดีลเลอร์ทำใบจากใบ HQ บนหน้าจอ (เดิม: กดสร้างใบเสนอราคาแบบเดิม ซึ่งปิดไปแล้ว)
  const { data: ดีล } = await sb.from("leads").select("num_id").eq("dealer_code", code).eq("company", COMPANY)
    .in("status", ["WAITING", "BULLET"]).order("num_id", { ascending: false }).limit(1);
  if (!ดีล?.length) throw new Error(`${code}: ไม่พบงานขายที่ขอราคาได้`);
  const ขอ = await sb.rpc("quote_request_submit", { p_lead_num_id: Number(ดีล[0].num_id), p_product: "โกดังสำเร็จรูป" });
  if (ขอ.error) throw new Error(`${code}: ขอราคาไม่สำเร็จ ${ขอ.error.message}`);
  const hq = await hqClient();
  const บันทึก = await hq.rpc("hq_quote_save", { p_request_id: Number((ขอ.data as { id: number }).id),
    p_lines: [{ name: "โกดังสำเร็จรูป", qty: 100, unit: "ตร.ม.", unitCost: 12_000 }],
    p_valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10), p_note: "" });
  if (บันทึก.error) throw new Error(`${code}: HQ ทำ BOQ ไม่สำเร็จ ${บันทึก.error.message}`);
  const ส่ง = await hq.rpc("hq_quote_send", { p_request_id: Number((ขอ.data as { id: number }).id) });
  if (ส่ง.error) throw new Error(`${code}: HQ ส่งใบไม่สำเร็จ ${ส่ง.error.message}`);
  // เปิดลูกค้าเป้าหมายใหม่จากตาราง (แผงที่เปิดค้างจาก ?open= ยังไม่รู้ว่ามีใบ HQ · ลิงก์ ?open= ใช้ได้ครั้งเดียว)
  await settle(page);   // รอคำขอบันทึกที่ค้าง (งาน/ไทม์ไลน์ของลูกค้าเป้าหมาย) จบก่อนเปลี่ยนหน้า — ไม่งั้นถูกตัดกลางทาง
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const แถวดีล = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(แถวดีล, `${code}: งานขายต้องอยู่ในตาราง`).toBeVisible({ timeout: 45_000 });
  await แถวดีล.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click({ timeout: 45_000 });
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  await expect.poll(async () => (await sb.from("quotations").select("id").eq("customer", COMPANY)).data?.length ?? 0,
    { timeout: 60_000, message: `${code}: ใบเสนอราคาต้องถูกสร้าง` }).toBe(1);
  mark("quotation_created");

  const { data: qrows } = await sb.from("quotations").select("id").eq("customer", COMPANY);
  const quoteId = qrows![0].id as string;

  // 7) ส่งใบ → ตอบรับ/ปฏิเสธ — รอบ 4: ส่งที่กล่องขั้นต่อไปในแผงลีด · ผลลูกค้าที่ใบในแท็บใบเสนอราคา
  //    เริ่มจากหน้าใบเสนอราคา: ใบต้องโผล่ในตาราง แล้วกดแถว → พาไปแผงลีดของใบนั้น
  await settle(page);   // รอคำขอบันทึกที่ค้าง (งาน/ไทม์ไลน์ของลูกค้าเป้าหมาย) จบก่อนเปลี่ยนหน้า — ไม่งั้นถูกตัดกลางทาง
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  const qrow = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(qrow, `${code}: ใบเสนอราคาต้องโผล่ในตาราง`).toBeVisible({ timeout: 45_000 });
  await qrow.locator("td").first().click();
  await page.waitForURL(/\/leads/, { timeout: 45_000 });
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 45_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", quoteId)).data?.[0]?.status,
    { timeout: 45_000, message: `${code}: ใบต้องเป็น 'ส่งแล้ว'` }).toBe("sent_to_client");
  mark("quotation_sent");

  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  const ผลลูกค้า = page.locator(`[data-quote-item="${quoteId}"] [data-customer-result]`);
  if (willWin) {
    await ผลลูกค้า.getByRole("button", { name: /ลูกค้าตอบรับ/ }).click();
    await กดตกลงในกล่องยืนยัน(page);
    await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", quoteId)).data?.[0]?.status,
      { timeout: 60_000, message: `${code}: ใบต้องเป็น 'won'` }).toBe("won");
    mark("closed_won");
  } else {
    await ผลลูกค้า.getByRole("button", { name: "ลูกค้าปฏิเสธ", exact: true }).click();
    const reasonPicker = page.locator("[data-lost-picker]");
    await expect(reasonPicker).toBeVisible({ timeout: 30_000 });
    await reasonPicker.getByRole("button").first().click();
    await reasonPicker.getByRole("button", { name: "ยืนยันลูกค้าปฏิเสธ" }).click();
    await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", quoteId)).data?.[0]?.status,
      { timeout: 60_000, message: `${code}: ใบต้องเป็น 'lost'` }).toBe("lost");
    mark("closed_lost");
  }

  // 8) บันทึกหมายเหตุที่ลูกค้า
  await settle(page);   // รอคำขอบันทึกที่ค้าง (งาน/ไทม์ไลน์ของลูกค้าเป้าหมาย) จบก่อนเปลี่ยนหน้า — ไม่งั้นถูกตัดกลางทาง
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(COMPANY);
  await expect(page.locator("tbody tr").filter({ hasText: COMPANY }).first()).toBeVisible({ timeout: 45_000 });
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().click();
  await page.getByRole("button", { name: "เพิ่มโน้ต" }).first().click();
  await page.getByPlaceholder("หัวข้อโน้ต").fill(`${TAG}-โน้ต-${code}`);
  await page.getByPlaceholder("รายละเอียดการติดตาม").fill(`บันทึกจาก load test ${code}`);
  await page.getByRole("button", { name: "บันทึกโน้ต" }).click();
  await expect.poll(async () => (await sb.from("customer_notes").select("id").eq("title", `${TAG}-โน้ต-${code}`)).data?.length ?? 0,
    { timeout: 45_000, message: `${code}: โน้ตต้องลง DB` }).toBe(1);
  mark("note_added");
}

test.describe.configure({ mode: "serial" }); // ไฟล์นี้มี 2 เทสต์ (setup ทีละคน + stress พร้อมกัน) — กันชนกัน

let provisioned: Provisioned[] = [];
let adminTok = "";

test.beforeAll(async () => {
  const { token } = await adminToken();
  adminTok = token;
  // กันของค้างจากรอบก่อนที่ล้มกลางคัน — ลองลบทุกโค้ด (best-effort, 409 ถ้ายังมีข้อมูลค้างจะข้ามไปเงียบ ๆ)
  for (const code of CODES) await purgeDealer(token, code);
});


// ⚠️ ชุดนี้ต้องยืดเวลา "กดปุ่ม/พิมพ์" เป็น 30 วินาที (ค่าเริ่มต้นทั้งโปรเจกต์คือ 8 วินาที)
//    ตอน 10 สาขาทำงานพร้อมกัน ทุกเครื่องได้สัญญาณอัปเดตรัว ๆ จนตาราง/การ์ดวาดใหม่ไม่หยุด
//    Playwright รอให้ปุ่ม "หยุดนิ่ง" ก่อนกด จึงหมดเวลาไปก่อนพร้อมกันทั้ง 10 สาขา (ไล่เจอ 25 ส.ค. 69)
//    ยืนยันแล้วว่าไม่ใช่บั๊กของระบบ: ทำคนเดียวช่องเบอร์มีช่องเดียว · ปุ่มบันทึกกดได้ปกติ
//    ขั้นอื่นในไฟล์นี้ยืดเวลาไว้อยู่แล้ว (30-45 วินาที) เหลือแต่การกดที่ยังใช้ค่าเริ่มต้น
test.use({ actionTimeout: 30_000 });

test("[stress] เตรียม 10 บัญชีดีลเลอร์จริง (auth+dealer) สำหรับทดสอบโหลด", async () => {
  for (const code of CODES) {
    const p = await provisionDealer(adminTok, code);
    expect(p, `ต้องสร้างบัญชีดีลเลอร์ ${code} ได้`).not.toBeNull();
    if (p) provisioned.push(p);
  }
  expect(provisioned.length, "ต้องสร้างดีลเลอร์ได้ครบตามจำนวนที่ขอ").toBe(N);
});

test("[stress] 10 ดีลเลอร์ทำงานพร้อมกันเต็มวงจร + HQ เห็นข้อมูลอัปเดตจริง", async ({ browser }) => {
  expect(provisioned.length, "ต้องมีดีลเลอร์ที่เตรียมไว้ก่อนหน้า").toBe(N);

  // ── HQ baseline (ก่อนเริ่ม) ──
  const { sb: hqSb } = await adminToken();
  const { count: custBefore } = await hqSb.from("customers").select("id", { count: "exact", head: true });
  const { count: quoteBefore } = await hqSb.from("quotations").select("id", { count: "exact", head: true });

  const hqCtx = await browser.newContext();
  const hqPage = await hqCtx.newPage();
  if (COOKIE_AUTH) {
    const r = await hqCtx.request.post(`${HQ_ORIGIN}/api/v1/auth?op=login`, { data: ADMIN });
    if (!r.ok()) throw new Error(`ล็อกอิน HQ ผ่าน backend ไม่ผ่าน: ${r.status()}`);
  } else {
    await hqPage.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); },
      { key: SESSION_KEY, session: (await hqSb.auth.getSession()).data.session });
  }
  await hqPage.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(hqPage);

  // ── เปิด 10 บริบทเบราว์เซอร์ ล็อกอินจริงแยกบัญชี แล้วรันขั้นตอนทั้งหมดพร้อมกัน ──
  const timings: Record<string, number> = {};
  const contexts = await Promise.all(provisioned.map(() => browser.newContext()));
  const sessions = await Promise.all(provisioned.map((d, i) => openAsDealer(contexts[i], d)));

  // error ทุกตัวต้องทำให้เทสต์ล้ม — ไม่มีข้อยกเว้นอีกต่อไป
  //
  // เดิมกรอง error ที่มีคำว่า reconcileWonTotal / "คำนวณยอดลูกค้าใหม่" ออกไปเป็น "soft error" แค่ log
  // เพราะตอนเขียนเทสต์นี้ reconcileWonTotal ยังไม่มี retry จึงพลาดเป็นครั้งคราวจริง
  // แต่ต้นเหตุนั้นถูกแก้ไปแล้วทั้งสองทาง: เพิ่ม auto-retry (2264f33) และทำให้เป็น RPC ก้อนเดียว
  // ที่ atomic (0102/0103) — ข้อยกเว้นจึงหมดเหตุผล และถ้ายังปล่อยไว้ บั๊กยอดลูกค้าค้างที่เคยเจอ
  // จะกลับมาได้โดยเทสต์ไม่ล้ม (พบจากผลตรวจสอบระบบ 5 ส.ค. 69)
  const started = Date.now();
  const results = await Promise.allSettled(
    provisioned.map((d, i) => {
      const errs = watchErrors(sessions[i].page);
      return runDealerFlow(sessions[i].page, sessions[i].sb, d.code, i % 2 === 0, timings)
        .then(() => assertNoErrors(errs, `ดีลเลอร์ ${d.code}`));
    })
  );
  const elapsedSec = (Date.now() - started) / 1000;
  console.log(`[stress] 10 ดีลเลอร์ทำงานพร้อมกันเสร็จภายใน ${elapsedSec.toFixed(1)} วินาที`);
  console.log(`[stress] timings: ${JSON.stringify(timings, null, 1)}`);

  const failed = results.map((r, i) => ({ r, code: provisioned[i].code })).filter(x => x.r.status === "rejected");
  if (failed.length) {
    for (const f of failed) console.log(`[stress] ${f.code} ล้มเหลว: ${(f.r as PromiseRejectedResult).reason}`);
  }
  expect(failed.length, `ดีลเลอร์ที่ทำงานไม่สำเร็จ: ${failed.map(f => f.code).join(",")}`).toBe(0);

  // ── ตรวจความถูกต้องของข้อมูลหลังจบ — ไม่มีข้อมูลปนกันข้ามสาขา ──
  const staleTotals: string[] = [];
  for (const [i, d] of provisioned.entries()) {
    const { data: custs } = await hqSb.from("customers").select("dealer_code,total_value").eq("company", `${TAG}-ลูกค้า-${d.code}`);
    expect(custs?.length, `${d.code}: ต้องมีลูกค้าที่สร้างพอดี 1 ราย`).toBe(1);
    expect(custs?.[0]?.dealer_code, `${d.code}: ลูกค้าต้องเป็นของสาขาตัวเองเท่านั้น`).toBe(d.code);

    const { data: quotes } = await hqSb.from("quotations").select("dealer_code,status,total_value").eq("customer", `${TAG}-ลูกค้า-${d.code}`);
    expect(quotes?.length, `${d.code}: ต้องมีใบเสนอราคาพอดี 1 ใบ`).toBe(1);
    expect(quotes?.[0]?.dealer_code, `${d.code}: ใบเสนอราคาต้องเป็นของสาขาตัวเองเท่านั้น`).toBe(d.code);

    // dealers ที่ i%2===0 ปิดแบบ "won" — ยอดลูกค้าควรตรงกับใบที่ปิดได้ (ไม่ค้างที่ 0 จากปัญหา reconcile ไม่มี retry)
    if (i % 2 === 0 && quotes?.[0]?.status === "won" && (custs?.[0]?.total_value ?? 0) !== (quotes?.[0]?.total_value ?? -1)) {
      staleTotals.push(`${d.code}: ยอดลูกค้า=${custs?.[0]?.total_value} แต่ใบที่ปิด won=${quotes?.[0]?.total_value}`);
    }
  }
  // ต้อง assert จริง ไม่ใช่แค่ log — นี่คือหัวใจของบั๊กที่เทสต์นี้ถูกเขียนขึ้นมาเพื่อจับ
  // (ยอดลูกค้าค้างที่ 0 ทั้งที่ปิดการขายสำเร็จ · พบจากทดสอบโหลด 3 ส.ค. 69 → แก้ที่ 0101)
  // เดิมแค่ console.log ซึ่งไม่มีใครบังคับให้อ่าน — บั๊กเดิมกลับมาได้โดยเทสต์ยังเขียว
  expect(staleTotals, `ยอดลูกค้าต้องตรงกับใบที่ปิดการขายได้เสมอ — ที่ไม่ตรง: ${staleTotals.join(" · ")}`).toEqual([]);

  // ── เลขที่ใบเสนอราคาต้องไม่ซ้ำกันเลย แม้สร้างพร้อมกัน 10 สาขา ──
  const { data: allNewQuotes } = await hqSb.from("quotations").select("id").like("customer", `${TAG}-ลูกค้า-%`);
  const ids = (allNewQuotes ?? []).map(q => q.id as string);
  expect(new Set(ids).size, "เลขที่ใบเสนอราคาต้องไม่ซ้ำกันเลยแม้สร้างพร้อมกัน").toBe(ids.length);
  expect(ids.length, "ต้องมีใบเสนอราคาครบ 10 ใบจาก 10 สาขา").toBe(N);

  // ── HQ dashboard ต้องเห็นตัวเลขใหม่หลังรีเฟรช (real-time ผ่านการโหลดข้อมูลใหม่) ──
  await hqPage.reload({ waitUntil: "domcontentloaded" });
  await settle(hqPage);
  const { count: custAfter } = await hqSb.from("customers").select("id", { count: "exact", head: true });
  const { count: quoteAfter } = await hqSb.from("quotations").select("id", { count: "exact", head: true });
  expect((custAfter ?? 0) - (custBefore ?? 0), "จำนวนลูกค้าทั้งเครือต้องเพิ่มขึ้นตามจำนวนที่สร้างจริง").toBeGreaterThanOrEqual(N);
  expect((quoteAfter ?? 0) - (quoteBefore ?? 0), "จำนวนใบเสนอราคาทั้งเครือต้องเพิ่มขึ้นตามจำนวนที่สร้างจริง").toBeGreaterThanOrEqual(N);

  await hqCtx.close();
  await Promise.all(contexts.map(c => c.close()));
});

test.afterAll(async () => {
  // เก็บกวาดข้อมูลของแต่ละสาขา "ในฐานะดีลเลอร์เจ้าของ" (HQ เขียน/ลบข้อมูลขายตรงไม่ได้ตาม RLS)
  // แล้วค่อยลบบัญชีดีลเลอร์+auth ผ่าน route (route เองก็บังคับให้ข้อมูลว่างก่อนถึงจะลบแถวได้)
  //
  // เคยพบ (พบจาก Final Acceptance run): cleanup() ลบ leads/quotations/appointments/files/notes ครบ
  // แต่บางครั้ง "customers" เหลือ 1 แถวเงียบ ๆ (ไม่ throw — DELETE แค่ไม่โดนแถวตามเงื่อนไข RLS ชั่วขณะ
  // เป็นครั้งคราว) → purgeDealer ตามมาเจอ 409 (ยังมีข้อมูล) แล้ว catch เงียบทิ้ง เหลือดีลเลอร์ผีค้างให้รันรอบ
  // ถัดไปชนรหัสซ้ำ (provisionDealer คืน null ทันทีตั้งแต่ตัวแรก) — เช็กซ้ำ + retry ครั้งเดียวกันไว้ก่อนลบดีลเลอร์
  //
  // ทำทีละคนตามลำดับ (for-loop เดิม) ช้าเกิน afterAll timeout ของ Playwright (30s) พอมี 10 คน ×
  // sign-in+cleanup+verify+purge ต่อคน — เปลี่ยนเป็นขนานทั้ง 10 คนพร้อมกันเหมือน test หลักที่ใช้ Promise.all
  await Promise.all(provisioned.map(async (d) => {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await sb.auth.signInWithPassword({ email: d.email, password: d.password });
      if (!error) {
        await cleanup(sb, d.code, TAG);
        const { count } = await sb.from("customers").select("id", { count: "exact", head: true }).eq("dealer_code", d.code);
        if ((count ?? 0) > 0) await cleanup(sb, d.code, TAG); // retry ครั้งเดียว — เจอแถวค้างหลุดบ้างเป็นครั้งคราว
      }
    } catch { /* best-effort */ }
    await purgeDealer(adminTok, d.code);
  }));
});
