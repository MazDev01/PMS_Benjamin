import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, โค้ดยืนยันในกล่อง, MAIL_URL } from "./helpers";
import { adminClient } from "./testDealers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ถือแถวกลางชดเวลา } from "./sharedRowLock";

// ── ตั้งค่า › การแจ้งเตือน ทั้งสองฝั่ง (ใบ 0274 · บอสสั่ง 3 พ.ย. 69 · ทับ "ไม่มีสวิตช์รายหมวด") ───────────────────────────────
//   HQ: อีเมลผู้รับเป็นรายการ (+ เพิ่มอีเมล · ลบ · ตรวจรูปแบบทันที · ว่าง = กล่องแดง · ไม่มีข้อความจางในช่อง) · ส่งอีเมลทดสอบบอกผลรายอีเมล
//       ตารางรายเรื่อง = แถว HQ ในตารางแจ้งเตือนของ FLOW · เรื่องจำเป็นมีป้ายและปิดไม่ได้
//   ดีลเลอร์ (สาขาของข้อ): เริ่มว่าง = กล่องแดง · เพิ่มอีเมล → รอยืนยัน → ส่งโค้ด → กรอกโค้ด → ยืนยันแล้ว · ส่งอีเมลทดสอบถึงที่ยืนยันแล้ว
//       ปิดอีเมลเรื่องหนึ่ง → ไม่มีจดหมายในกล่องขาออก แต่กระดิ่งยังขึ้น · ปิดกระดิ่ง → ไม่มีกระดิ่ง · อีเมลที่ยังไม่ยืนยันไม่ได้รับ
//       ฐานปฏิเสธรูปแบบผิด (ยิงตรง) · HQ เห็นรายชื่อในแผงดีลเลอร์
//   ตกบนโค้ดก่อนใบ 0274: ไม่มีแท็บ/ตาราง/รายชื่อ · HQ เป็นช่องพิมพ์หลายบรรทัด
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const admin = adminClient();
let ส: สาขาของข้อ;
const แท็ก = `${Date.now() % 100_000}`;
const อีเมล1 = `zztest-notify-${แท็ก}-1@example.test`;
const อีเมล2 = `zztest-notify-${แท็ก}-2@example.test`;
const อีเมลHQ = `zztest-notify-${แท็ก}-hq@example.test`;
let ผู้รับHQเดิม: string[] = [];

// แถวตารางแจ้งเตือนใน FLOW: ชนิด → แถว · ใครได้ · มีกระดิ่ง/อีเมล · จำเป็น · กดแล้วไปไหน
type แถวFLOW = { row: string; kind: string; ฝั่ง: "dealer" | "hq"; bell: boolean; email: boolean; locked: boolean; goesTo: string };
function ตารางFLOW(): แถวFLOW[] {
  const html = readFileSync(path.join(__dirname, "../../docs/FLOW.html"), "utf8");
  const ผล: แถวFLOW[] = [];
  for (const m of html.matchAll(/<tr data-notif-row="([DH]\d+)"([^>]*)>([\s\S]*?)<\/tr>/g)) {
    const attr = m[2], tds = [...m[3].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, "").trim());
    const kinds = /data-notif-kinds="([^"]*)"/.exec(attr)![1].split(/\s+/).filter(Boolean);
    for (const kind of kinds) ผล.push({ row: m[1], kind, ฝั่ง: m[1].startsWith("D") ? "dealer" : "hq",
      bell: /data-bell="1"/.test(attr), email: /data-email="1"/.test(attr), locked: /data-locked="1"/.test(attr), goesTo: tds[5] ?? "" });
  }
  return ผล;
}

/** ตารางบนหน้าต้องตรงกับแถวของฝั่งนั้นใน FLOW ครบทุกเรื่อง */
async function ตรวจตารางตรงFLOW(page: Page, ฝั่ง: "dealer" | "hq") {
  const ตาราง = page.getByRole("table", { name: "ตั้งค่าแจ้งเตือนแต่ละเรื่อง" });
  await expect(ตาราง).toBeVisible({ timeout: 25_000 });
  const คาด = ตารางFLOW().filter(x => x.ฝั่ง === ฝั่ง);
  await expect(ตาราง.locator("tbody tr"), `จำนวนเรื่องฝั่ง ${ฝั่ง} = FLOW`).toHaveCount(คาด.length);
  for (const x of คาด) {
    const tr = ตาราง.locator(`tr[data-notif-kind="${x.kind}"]`);
    await expect(tr, `${x.kind}: แถว FLOW`).toHaveAttribute("data-flow-row", x.row);
    await expect(tr, `${x.kind}: จำเป็นตาม FLOW`).toHaveAttribute("data-locked", x.locked ? "1" : "0");
    await expect(tr.locator("[data-col='goes-to']"), `${x.kind}: กดแล้วไปไหน = FLOW`).toHaveText(x.goesTo);
    await expect(tr.locator("[data-col='bell'] [role='switch']"), `${x.kind}: มีกระดิ่งตาม FLOW`).toHaveCount(x.bell ? 1 : 0);
    await expect(tr.locator("[data-col='email'] [role='switch']"), `${x.kind}: มีอีเมลตาม FLOW`).toHaveCount(x.email ? 1 : 0);
    if (x.locked) {
      await expect(tr.getByTestId("notif-locked"), `${x.kind}: ป้ายจำเป็น`).toHaveText("จำเป็น");
      for (const s of await tr.locator("[role='switch']").all()) { await expect(s).toBeDisabled(); await expect(s).toHaveAttribute("aria-checked", "true"); }
    }
  }
}

// ผู้รับอีเมล HQ เป็นแถวเดียวทั้งระบบ — ไฟล์ที่ตั้งแถวนี้ต่อคิวกัน (ข้อนี้อ่านรายชื่อแล้วส่งทดสอบถึงทุกคน · ห้ามมีคนเปลี่ยนกลางทาง)
let ปล่อยแถว = () => {};
test.beforeAll(async () => {
  ปล่อยแถว = await ถือแถวกลางชดเวลา(test, "hq_notif_rules");
  // ผู้รับของ HQ ระหว่างข้อนี้ = อีเมลของข้อ 1 รายการ (ถือแถวไว้แล้ว · คืนค่าเดิมท้ายไฟล์) — ส่งทดสอบได้ผลแน่นอน
  ผู้รับHQเดิม = ((await admin.from("hq_notif_rules").select("email_recipients").eq("id", 1).single()).data?.email_recipients as string[]) ?? [];
  expect((await admin.from("hq_notif_rules").update({ email_recipients: [อีเมลHQ] }).eq("id", 1)).error).toBeNull();
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
});
test.afterAll(async () => {
  await admin.from("email_outbox").delete().like("to_email", `zztest-notify-${แท็ก}-%`);
  await ส?.ลบ();
  await admin.from("hq_notif_rules").update({ email_recipients: ผู้รับHQเดิม }).eq("id", 1);
  ปล่อยแถว();
});

test("[ui·hq] ตั้งค่า › การแจ้งเตือน: รายชื่ออีเมลแบบรายการ · ว่าง = กล่องแดง · ตารางรายเรื่องตรง FLOW · เรื่องจำเป็นปิดไม่ได้ · ส่งอีเมลทดสอบบอกผลรายอีเมล", async ({ page }) => {
  const errs = watchErrors(page);
  const รายชื่อเดิม = [อีเมลHQ];
  await loginUI(page, HQ_ORIGIN, "/hq/settings", ADMIN);
  await page.locator(".tab-bar").getByRole("button", { name: "การแจ้งเตือน" }).click({ timeout: 25_000 });
  const ช่อง = page.getByRole("textbox", { name: "เพิ่มอีเมลผู้รับแจ้งเตือน" });
  await expect(ช่อง).toBeVisible({ timeout: 20_000 });
  await expect(ช่อง, "ไม่มีข้อความจางในช่อง").not.toHaveAttribute("placeholder", /.+/);
  await expect(page.locator("textarea[aria-label='อีเมลผู้รับแจ้งเตือน']"), "ไม่ใช่ช่องพิมพ์หลายบรรทัดแบบเดิม").toHaveCount(0);
  const รายการ = page.getByRole("list", { name: "อีเมลผู้รับแจ้งเตือน" });
  await expect(รายการ.locator("[data-recipient]"), "รายชื่อ = ที่บันทึกในฐาน").toHaveCount(รายชื่อเดิม.length);

  // ตรวจรูปแบบทันที (ยังไม่บันทึก)
  await ช่อง.fill("ไม่ใช่อีเมล");
  await page.getByRole("button", { name: "เพิ่มอีเมล" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ไม่ใช่รูปแบบอีเมล" })).toBeVisible();
  await ช่อง.fill(อีเมล1);
  await page.getByRole("button", { name: "เพิ่มอีเมล" }).click();
  await expect(รายการ.locator(`[data-recipient="${อีเมล1}"]`)).toBeVisible();
  // แก้ค้าง = ส่งทดสอบไม่ได้จนกว่าจะบันทึก (ส่งถึงรายชื่อที่บันทึกแล้วเท่านั้น)
  await expect(page.getByRole("button", { name: "ส่งอีเมลทดสอบ" })).toBeDisabled();
  // ลบทั้งหมด → กล่องแดง (ยังไม่บันทึก แล้วรีเซ็ตกลับ — ไม่แตะรายชื่อจริงที่ข้ออื่นใช้)
  for (const e of [...รายชื่อเดิม, อีเมล1]) await page.getByRole("button", { name: `ลบ ${e}` }).click();
  await expect(page.getByTestId("no-recipients"), "ไม่มีผู้รับ = กล่องแดง").toContainText("ยังไม่มีผู้รับ");
  await expect(page.getByTestId("no-recipients")).toHaveCSS("color", "rgb(185, 28, 28)");
  await page.getByRole("button", { name: "รีเซ็ต" }).click();
  await expect(รายการ.locator("[data-recipient]"), "รีเซ็ตแล้วกลับเป็นรายชื่อที่บันทึก").toHaveCount(รายชื่อเดิม.length);

  // ฐานปฏิเสธรูปแบบผิด (ยิงตรง ไม่ผ่านหน้าจอ)
  const hq = await db(ADMIN);
  const ผิด = await hq.from("hq_notif_rules").update({ email_recipients: [...รายชื่อเดิม, "bad@@x"] }).eq("id", 1);
  expect(ผิด.error?.message ?? "", "ฐานปฏิเสธอีเมลรูปแบบผิด").toMatch(/ไม่ใช่รูปแบบอีเมล/);

  await ตรวจตารางตรงFLOW(page, "hq");

  // ส่งอีเมลทดสอบถึงทุกผู้รับที่บันทึกแล้ว — ผลรายอีเมล
  {
    const เริ่ม = Date.now();
    await page.getByRole("button", { name: "ส่งอีเมลทดสอบ" }).click();
    const ผล = page.getByRole("list", { name: "ผลส่งอีเมลทดสอบ" });
    await expect(ผล.locator("li[data-email]"), "ผลครบทุกผู้รับ").toHaveCount(รายชื่อเดิม.length, { timeout: 60_000 });
    for (const e of รายชื่อเดิม) {
      await expect(ผล.locator(`li[data-email="${e}"]`)).toHaveAttribute("data-test-result", "ok");
      await expect.poll(async () => {
        const j = await (await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${e} subject:"อีเมลทดสอบการแจ้งเตือน"`)}`)).json() as { messages?: { Created: string }[] };
        return (j.messages ?? []).filter(m => Date.parse(m.Created) >= เริ่ม - 5_000).length;
      }, { timeout: 20_000, message: `กล่องจดหมายทดสอบได้อีเมลทดสอบถึง ${e}` }).toBeGreaterThan(0);
    }
    await admin.from("email_outbox").delete().eq("kind", "notify_test").eq("ref_id", "สำนักงานใหญ่").in("to_email", รายชื่อเดิม);
  }
  assertNoErrors(errs, "ตั้งค่าแจ้งเตือน HQ");
});

test("[ui·dealer] ตั้งค่า › การแจ้งเตือน: ว่าง = กล่องแดง · เพิ่ม → รอยืนยัน → ส่งโค้ด → ยืนยันแล้ว · ส่งอีเมลทดสอบ · ตารางตรง FLOW", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator(".tab-bar").getByRole("button", { name: "การแจ้งเตือน" }).click({ timeout: 25_000 });
  await expect(page.getByTestId("no-recipients"), "สาขาใหม่ยังไม่มีผู้รับ = กล่องแดง").toContainText("ยังไม่มีผู้รับ", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "ส่งอีเมลทดสอบ" }), "ไม่มีอีเมลที่ยืนยัน = ส่งทดสอบไม่ได้").toBeDisabled();
  const ช่อง = page.getByRole("textbox", { name: "เพิ่มอีเมลผู้รับแจ้งเตือน" });
  await expect(ช่อง, "ไม่มีข้อความจางในช่อง").not.toHaveAttribute("placeholder", /.+/);

  await ช่อง.fill(`${ส.รหัส.toLowerCase()}@dealer.benjaminpebsteel.com`);
  await page.getByRole("button", { name: "เพิ่มอีเมล" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "อีเมลเข้าระบบของดีลเลอร์" }), "ห้ามอีเมลเข้าระบบ").toBeVisible();
  await ช่อง.fill(อีเมล1);
  await page.getByRole("button", { name: "เพิ่มอีเมล" }).click();
  const แถว1 = page.getByRole("list", { name: "อีเมลผู้รับแจ้งเตือน" }).locator(`[data-recipient="${อีเมล1}"]`);
  await expect(แถว1.getByTestId("recipient-status"), "เพิ่มใหม่ = รอยืนยัน").toHaveText("รอยืนยัน", { timeout: 20_000 });
  await expect(page.getByTestId("no-recipients"), "ยังไม่ยืนยัน = ยังไม่มีผู้รับ").toBeVisible();

  const เริ่ม = Date.now();
  await แถว1.getByRole("button", { name: `ส่งโค้ดยืนยัน ${อีเมล1}` }).click();
  await แถว1.getByRole("textbox", { name: `โค้ดยืนยัน ${อีเมล1}` }).fill(await โค้ดยืนยันในกล่อง(อีเมล1, เริ่ม));
  await แถว1.getByRole("button", { name: "ยืนยัน", exact: true }).click();
  await expect(แถว1.getByTestId("recipient-status"), "กรอกโค้ดถูก = ยืนยันแล้ว").toHaveText("ยืนยันแล้ว", { timeout: 20_000 });
  await expect(page.getByTestId("no-recipients"), "มีผู้ยืนยันแล้ว = กล่องแดงหาย").toHaveCount(0);

  // อีเมลที่ 2 ยังไม่ยืนยัน — ส่งทดสอบถึงเฉพาะที่ยืนยันแล้ว
  await ช่อง.fill(อีเมล2);
  await page.getByRole("button", { name: "เพิ่มอีเมล" }).click();
  await expect(page.getByRole("list", { name: "อีเมลผู้รับแจ้งเตือน" }).locator(`[data-recipient="${อีเมล2}"]`)).toHaveAttribute("data-verified", "0", { timeout: 20_000 });
  await page.getByRole("button", { name: "ส่งอีเมลทดสอบ" }).click();
  const ผล = page.getByRole("list", { name: "ผลส่งอีเมลทดสอบ" });
  await expect(ผล.locator("li[data-email]"), "ส่งถึงเฉพาะอีเมลที่ยืนยันแล้ว").toHaveCount(1, { timeout: 60_000 });
  await expect(ผล.locator(`li[data-email="${อีเมล1}"]`)).toHaveAttribute("data-test-result", "ok");

  await ตรวจตารางตรงFLOW(page, "dealer");

  // ปิดอีเมลเรื่อง "ราคา HQ ใกล้หมดอายุ" → ฐานบันทึกของสาขานี้ · ปิดแล้วกระดิ่งขึ้น ไม่มีจดหมาย
  const ตาราง = page.getByRole("table", { name: "ตั้งค่าแจ้งเตือนแต่ละเรื่อง" });
  await ตาราง.getByRole("switch", { name: "ราคา HQ ใกล้หมดอายุ อีเมล" }).click();
  await expect(ตาราง.getByRole("switch", { name: "ราคา HQ ใกล้หมดอายุ อีเมล" })).toHaveAttribute("aria-checked", "false", { timeout: 15_000 });
  await expect.poll(async () => (await admin.from("notification_prefs").select("bell, email").eq("dealer_code", ส.รหัส).eq("kind", "hq_quote_expiring").maybeSingle()).data,
    { timeout: 15_000 }).toEqual({ bell: true, email: false });
  expect(รันSQLในฐาน(`select public._notify('hq_quote_expiring', '${ส.รหัส}', 'zztest-ns-${แท็ก}-1', '{"company":"ZZTEST"}'::jsonb);`), "สั่งแจ้งเตือนที่ฐานทดสอบ").not.toBeNull();
  const นับกระดิ่ง = async (once: string) => (await admin.from("notifications").select("id", { count: "exact", head: true }).eq("dedupe_key", `hq_quote_expiring:${once}`)).count;
  const นับจดหมาย = async (once: string, ถึง: string) => (await admin.from("email_outbox").select("id", { count: "exact", head: true }).eq("dedupe_key", `hq_quote_expiring:${once}:${ถึง}`)).count;
  expect(await นับกระดิ่ง(`zztest-ns-${แท็ก}-1`), "อีเมลปิด: กระดิ่งยังขึ้น").toBe(1);
  expect(await นับจดหมาย(`zztest-ns-${แท็ก}-1`, อีเมล1), "อีเมลปิด: ไม่มีจดหมายในกล่องขาออก").toBe(0);
  // เปิดอีเมลคืน ปิดกระดิ่ง → ไม่มีกระดิ่ง · จดหมายถึงเฉพาะอีเมลที่ยืนยันแล้ว
  await ตาราง.getByRole("switch", { name: "ราคา HQ ใกล้หมดอายุ อีเมล" }).click();
  await expect(ตาราง.getByRole("switch", { name: "ราคา HQ ใกล้หมดอายุ อีเมล" })).toHaveAttribute("aria-checked", "true", { timeout: 15_000 });
  await ตาราง.getByRole("switch", { name: "ราคา HQ ใกล้หมดอายุ กระดิ่ง" }).click();
  await expect(ตาราง.getByRole("switch", { name: "ราคา HQ ใกล้หมดอายุ กระดิ่ง" })).toHaveAttribute("aria-checked", "false", { timeout: 15_000 });
  รันSQLในฐาน(`select public._notify('hq_quote_expiring', '${ส.รหัส}', 'zztest-ns-${แท็ก}-2', '{"company":"ZZTEST"}'::jsonb);`);
  expect(await นับกระดิ่ง(`zztest-ns-${แท็ก}-2`), "กระดิ่งปิด: ไม่มีกระดิ่ง").toBe(0);
  expect(await นับจดหมาย(`zztest-ns-${แท็ก}-2`, อีเมล1), "กระดิ่งปิด: อีเมลยังส่งถึงที่ยืนยันแล้ว").toBe(1);
  expect(await นับจดหมาย(`zztest-ns-${แท็ก}-2`, อีเมล2), "อีเมลที่ยังไม่ยืนยันไม่ได้รับ").toBe(0);
  // เรื่องจำเป็นปิดผ่านหน้าเว็บไม่ได้ (สวิตช์กดไม่ได้) และยิงตรงก็ไม่ได้
  await expect(ตาราง.getByRole("switch", { name: "HQ ส่งราคาแล้ว อีเมล" })).toBeDisabled();
  const ยิงตรง = await (await db(ส.บัญชี)).rpc("notification_prefs_set", { p_kind: "hq_quote_sent", p_bell: true, p_email: false });
  expect(ยิงตรง.error?.message ?? "", "เรื่องจำเป็นยิงตรงก็ปิดไม่ได้").toMatch(/notify_locked/);
  // ฐานปฏิเสธรูปแบบอีเมลผิด (ยิงตรง)
  const ผิด = await (await db(ส.บัญชี)).rpc("dealer_notify_recipient_add", { p_email: "ไม่ใช่@อีเมล" });
  expect(ผิด.error?.message ?? "", "ฐานปฏิเสธรูปแบบผิด").toMatch(/notify_email_format/);
  assertNoErrors(errs, "ตั้งค่าแจ้งเตือนดีลเลอร์");
});

test("[ui·hq] แผงดีลเลอร์: เห็นรายชื่ออีเมลรับแจ้งเตือนของสาขา พร้อมสถานะยืนยัน (แทน \"อีเมลติดต่อ: —\")", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาดีลเลอร์...").fill(ส.รหัส);
  await page.getByRole("row", { name: /^เปิดแผงดีลเลอร์ / }).filter({ hasText: ส.รหัส }).first().click({ timeout: 25_000 });
  const รายชื่อ = page.getByRole("list", { name: `อีเมลรับแจ้งเตือนของ ${ส.รหัส}` });
  await expect(รายชื่อ.locator(`[data-recipient="${อีเมล1}"]`), "อีเมลที่ยืนยันแล้ว").toHaveAttribute("data-verified", "1", { timeout: 30_000 });
  await expect(รายชื่อ.locator(`[data-recipient="${อีเมล2}"]`), "อีเมลที่รอยืนยัน").toHaveAttribute("data-verified", "0");
  await expect(page.getByText("อีเมลติดต่อ (รับแจ้งเตือน): —"), "ไม่มีบรรทัดเดิม").toHaveCount(0);
});
