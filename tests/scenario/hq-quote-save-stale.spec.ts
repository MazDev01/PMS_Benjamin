import { test, expect, type Browser } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { adminClient } from "./testDealers";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ } from "./hqQuoteFixture";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";
import { psqlArgs, TESTDB_CONTAINER } from "../../scripts/lib/testDbPsql.mjs";

// ── บันทึกใบ HQ ใบเดียวกันพร้อมกัน ห้ามทับกันเงียบ (ใบ 0305 · บอสสั่ง 12 พ.ย. 69 ผ่านคนรวมงาน · ทำ 26 พ.ย. 69) ──────────
//   หน้าจอ: HQ เปิดใบเดียวกัน 2 หน้าต่าง → หน้าต่าง ก บันทึก → หน้าต่าง ข (ยังเป็นฉบับที่เปิดไว้) บันทึก
//     → ข เห็น "มีคนแก้ใบนี้ก่อนคุณ โหลดใหม่ก่อนบันทึก" · ใบในฐานยังเป็นของ ก · กด "โหลดใบล่าสุด" แล้วแก้ต่อ/บันทึกได้
//   ฐาน 2 การเชื่อมต่อ: ทั้งคู่เปิดฉบับเดียวกัน · ก บันทึกค้างธุรกรรม · ข บันทึกต้องรอ ก (ล็อกแถวคำขอ) → ก commit → ข ถูกปฏิเสธ quote_stale
//     (ตรวจหลังล็อก — ถ้าตรวจก่อนล็อก ข จะเห็นฉบับเดิมแล้วทับ ก หลังรอ)
//   ตกบนโค้ดเดิม: หน้าต่าง ข บันทึกทับของ ก เงียบ ๆ (ไม่มีคำเตือน · รายการในฐานเป็นของ ข) · คำสั่งฐานไม่มีช่องฉบับ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const admin = adminClient();
let ส: สาขาของข้อ;
const คำขอ: number[] = [];
const ชื่อ: string[] = [];
const เลขลีด: number[] = [];
const ฐานเลข = 1_870_000_000 + Math.floor(Math.random() * 400_000) * 100;
const ยืน = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
let uidHQ = "";

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด" });
  const sd = await db(ส.บัญชี);
  for (let i = 0; i < 2; i++) {
    const เลข = ฐานเลข + i, บริษัท = `ZZTEST ใบทับกัน ${ส.รหัส} ${i}`;
    expect((await sd.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: บริษัท, name: บริษัท, contact: "ผู้ทดสอบ",
      phone: `000-000-${String(810 + i).padStart(4, "0")}`, province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด })).error, บริษัท).toBeNull();
    const r = await sd.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดัง" });
    expect(r.error, `ส่งคำขอ ${บริษัท}`).toBeNull();
    คำขอ.push(Number((r.data as { id: number }).id)); ชื่อ.push(บริษัท); เลขลีด.push(เลข);
  }
  uidHQ = (รันSQLในฐาน(`select id from auth.users where lower(email) = lower('${ADMIN.email}');`) ?? "").trim();
  expect(uidHQ, "รหัสผู้ใช้ HQ ของข้อทดสอบ").toMatch(/^[0-9a-f-]{36}$/);
});
test.afterAll(async () => { if (ส) { ล้างใบHQทดสอบ(ส.รหัส, เลขลีด); await ส.ลบ(); } });

const รายการในฐาน = async (rid: number) =>
  ((await admin.from("hq_quotes").select("line_items").eq("request_id", rid).maybeSingle()).data?.line_items as { name: string }[] | undefined)?.map(l => l.name) ?? null;

async function เปิดหน้าต่าง(browser: Browser, บริษัท: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, บริษัท);
  await expect(ใบ.getByLabel("ชื่อรายการ 1", { exact: true }), "ใบเปิดมาพร้อมแก้").toBeEditable({ timeout: 20_000 });
  return { ctx, page, ใบ };
}

test("[ui·hq] เปิดใบเดียวกัน 2 หน้าต่าง — หน้าต่างที่บันทึกทีหลังเห็นคำเตือน ไม่ทับงานของคนแรก · โหลดใบล่าสุดแล้วบันทึกต่อได้", async ({ browser }) => {
  const rid = คำขอ[0];
  const ก = await เปิดหน้าต่าง(browser, ชื่อ[0]);
  const ข = await เปิดหน้าต่าง(browser, ชื่อ[0]);   // เปิดตอนยังไม่มีใบทั้งคู่ (ฉบับว่าง)
  try {
    await ก.ใบ.getByLabel("ชื่อรายการ 1", { exact: true }).fill("รายการของหน้าต่างแรก");
    await ก.ใบ.getByLabel("ต้นทุนต่อหน่วย 1", { exact: true }).fill("1000");
    await ก.ใบ.getByRole("button", { name: "บันทึกร่าง", exact: true }).click();
    await expect.poll(() => รายการในฐาน(rid), { timeout: 20_000, message: "หน้าต่างแรกบันทึกลงฐาน" }).toEqual(["รายการของหน้าต่างแรก"]);

    await ข.ใบ.getByLabel("ชื่อรายการ 1", { exact: true }).fill("รายการของหน้าต่างที่สอง");
    await ข.ใบ.getByLabel("ต้นทุนต่อหน่วย 1", { exact: true }).fill("2000");
    await ข.ใบ.getByRole("button", { name: "บันทึกร่าง", exact: true }).click();
    const เตือน = ข.ใบ.getByTestId("hq-quote-stale");
    await expect(เตือน, "หน้าต่างที่สองต้องเห็นคำเตือนบนใบ").toBeVisible({ timeout: 20_000 });
    await expect(เตือน).toContainText("มีคนแก้ใบนี้ก่อนคุณ โหลดใหม่ก่อนบันทึก");
    expect(await รายการในฐาน(rid), "ใบในฐานยังเป็นของหน้าต่างแรก (ไม่ถูกทับ)").toEqual(["รายการของหน้าต่างแรก"]);
    await expect(ข.ใบ.getByLabel("ชื่อรายการ 1", { exact: true }), "สิ่งที่พิมพ์บนจอยังอยู่จนกว่าจะกดโหลด").toHaveValue("รายการของหน้าต่างที่สอง");

    await เตือน.getByRole("button", { name: "โหลดใบล่าสุด", exact: true }).click();
    const กล่อง = ข.page.locator(".pms-confirm[role='alertdialog']");
    await กล่อง.getByRole("button", { name: "โหลดใบล่าสุด", exact: true }).click();
    await expect(ข.ใบ.getByLabel("ชื่อรายการ 1", { exact: true }), "โหลดแล้วเห็นใบที่หน้าต่างแรกบันทึก").toHaveValue("รายการของหน้าต่างแรก", { timeout: 20_000 });
    await expect(ข.ใบ.getByTestId("hq-quote-stale"), "โหลดแล้วคำเตือนหาย").toHaveCount(0);

    await ข.ใบ.getByLabel("ชื่อรายการ 1", { exact: true }).fill("แก้ต่อจากใบล่าสุด");
    await ข.ใบ.getByRole("button", { name: "บันทึกร่าง", exact: true }).click();
    await expect.poll(() => รายการในฐาน(rid), { timeout: 20_000, message: "ฉบับล่าสุดบันทึกต่อได้" }).toEqual(["แก้ต่อจากใบล่าสุด"]);
    await expect(ข.ใบ.getByTestId("hq-quote-stale")).toHaveCount(0);

    // หน้าต่างแรกยังถือฉบับที่ตัวเองบันทึก — ตอนนี้กลายเป็นฉบับเก่าแล้ว บันทึกอีกครั้งต้องถูกเตือนเหมือนกัน
    await ก.ใบ.getByLabel("ชื่อรายการ 1", { exact: true }).fill("หน้าต่างแรกบันทึกซ้ำ");
    await ก.ใบ.getByRole("button", { name: "บันทึกร่าง", exact: true }).click();
    await expect(ก.ใบ.getByTestId("hq-quote-stale"), "หน้าต่างแรกถือฉบับเก่า → ถูกเตือน").toBeVisible({ timeout: 20_000 });
    expect(await รายการในฐาน(rid), "ใบในฐานยังเป็นฉบับล่าสุดของหน้าต่างที่สอง").toEqual(["แก้ต่อจากใบล่าสุด"]);
  } finally { await ก.ctx.close(); await ข.ctx.close(); }
});

/** การเชื่อมต่อค้าง (psql) — ส่ง(sql) จบเมื่อคำสั่งชุดนั้นทำเสร็จ (แบบเดียวกับ hq-quote-save-lock-order.spec.ts) */
function เชื่อมต่อ(ป้ายชื่อ: string) {
  const p = spawn("docker", [...psqlArgs(TESTDB_CONTAINER), "-X", "-q", "-At", "-v", "ON_ERROR_STOP=0"], { stdio: ["pipe", "pipe", "pipe"] });
  let ออก = "", ผิด = "", ลำดับ = 0;
  p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
  p.stdout.on("data", (d: string) => { ออก += d; }); p.stderr.on("data", (d: string) => { ผิด += d; });
  const ส่ง = (sql: string, รอ = 20_000) => new Promise<void>((ok, no) => {
    const ป้าย = `__จบ_${ป้ายชื่อ}_${++ลำดับ}__`;
    p.stdin.write(`${sql}\n\\echo ${ป้าย}\n`);
    const เริ่ม = Date.now();
    const ดู = setInterval(() => {
      if (ออก.includes(ป้าย)) { clearInterval(ดู); ok(); }
      else if (Date.now() - เริ่ม > รอ) { clearInterval(ดู); no(new Error(`${ป้ายชื่อ}: ไม่จบใน ${รอ / 1000} วิ`)); }
    }, 25);
  });
  return { ส่ง, ผิด: () => ผิด, ออก: () => ออก, ปิด: () => { try { p.stdin.end(); } catch { /* ปิดแล้ว */ } setTimeout(() => p.kill(), 2000); } };
}
const เปิดในนามHQ = () => `begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${uidHQ}","role":"authenticated","user_role":"SUPER_ADMIN"}', true), set_config('request.jwt.claim.sub', '${uidHQ}', true);`;
const pidของ = async (c: ReturnType<typeof เชื่อมต่อ>) => { await c.ส่ง("select 'pid=' || pg_backend_pid();"); return Number(/pid=(\d+)/.exec(c.ออก())?.[1]); };
const รอล็อกอยู่ = (pid: number) => execFileSync("docker", [...psqlArgs(TESTDB_CONTAINER), "-X", "-q", "-At", "-c",
  `select count(*) from pg_stat_activity where pid = ${pid} and wait_event_type = 'Lock'`], { encoding: "utf8" }).trim() === "1";
const บันทึกด้วยฉบับ = (id: number, รายการ: string, ฉบับ: string) =>
  `select 'บันทึกแล้ว=' || (public.hq_quote_save(${id}, '[{"name":"${รายการ}","qty":1,"unit":"ชุด","unitCost":1000}]'::jsonb, (current_date + 30), '', true, '${ฉบับ}'::timestamptz)).id;`;

test("[db·hq] 2 การเชื่อมต่อเปิดฉบับเดียวกันแล้วบันทึกพร้อมกัน — ฝั่งที่สองรอแล้วถูกปฏิเสธ quote_stale ไม่ทับฝั่งแรก", async () => {
  const rid = คำขอ[1];
  const hq = await db(ADMIN);
  const ตั้ง = await hq.rpc("hq_quote_save", { p_request_id: rid, p_lines: [{ name: "ร่างตั้งต้น", qty: 1, unit: "ชุด", unitCost: 500 }], p_valid_until: ยืน, p_note: "" });
  expect(ตั้ง.error, "ร่างตั้งต้น").toBeNull();
  const ฉบับ = String((ตั้ง.data as { updated_at: string }).updated_at);
  const ก = เชื่อมต่อ("ก"), ข = เชื่อมต่อ("ข");
  try {
    await ก.ส่ง(เปิดในนามHQ()); await ข.ส่ง(เปิดในนามHQ());
    const pidข = await pidของ(ข);
    await ก.ส่ง(บันทึกด้วยฉบับ(rid, "ของฝั่งก", ฉบับ));
    expect(ก.ผิด(), "ฝั่ง ก บันทึกด้วยฉบับที่ตรงได้ (ถือธุรกรรมค้าง)").not.toMatch(/ERROR/);
    const งานข = ข.ส่ง(บันทึกด้วยฉบับ(rid, "ของฝั่งข", ฉบับ), 30_000).catch(e => e);
    await expect.poll(() => รอล็อกอยู่(pidข), { timeout: 10_000, message: "ฝั่ง ข รอฝั่ง ก (ล็อกแถวคำขอเดียวกัน) — ตรวจฉบับหลังรอ ไม่ใช่ก่อน" }).toBe(true);
    await ก.ส่ง("commit;");
    expect(await งานข, "ฝั่ง ข จบหลังฝั่ง ก commit").toBeUndefined();
    await ข.ส่ง("rollback;");
    expect(ข.ผิด(), "ฝั่ง ข ถูกปฏิเสธเพราะฉบับไม่ตรงแล้ว").toMatch(/quote_stale: มีคนแก้ใบนี้ก่อนคุณ โหลดใหม่ก่อนบันทึก/);
    expect(ก.ผิด() + ข.ผิด(), "ไม่มี deadlock").not.toMatch(/deadlock/i);
    expect(ข.ออก(), "ฝั่ง ข ไม่ได้บันทึก").not.toMatch(/บันทึกแล้ว=/);
    expect(await รายการในฐาน(rid), "ใบในฐานเป็นของฝั่ง ก").toEqual(["ของฝั่งก"]);
  } finally { ก.ปิด(); ข.ปิด(); }
});
