import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient, กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { ล้างใบHQทดสอบ } from "./legacyQuotes";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── รอบ 2 ช่วง ก2: สถานะ "ได้ราคา HQ" + แผงลีดไม่มีของซ้ำ + รายชื่อดีลเลอร์ (บอสสั่ง 19–20 ต.ค. 69) ──────────────────
//   1) HQ ส่งใบ → ฐานขยับลีดเป็น "ได้ราคา HQ" → ป้ายบนจอ · ตัวกรอง "รอราคา HQ"/"ได้ราคา HQ" · ตัวเลขแดชบอร์ด ตรงกันทั้ง 3 ที่
//   2) แผงลีด: ไม่มีช่องเลือกสถานะ · ปุ่มทำใบมีที่แถบขั้นต่อไปที่เดียว · งานที่ระบบติ๊กเองกดเองไม่ได้
//   3) ลีดปิดการขายแล้ว: ไม่มีขอแก้ราคา · ฐานไม่ให้ทำใบใหม่ (lead_closed)
//   4) ใบ HQ หมดอายุ (งานตั้งเวลา) → ลีดกลับเป็นรวบรวมความต้องการ + กระดิ่งดีลเลอร์ "ราคา HQ ของ X หมดอายุ ลีดกลับเป็นรวบรวมความต้องการ — ขอราคาใหม่ได้" (ใบ 0231)
//   5) ดีลเลอร์อ่านทะเบียนดีลเลอร์ได้แค่แถวตัวเอง · หน้าเว็บที่ใช้ทะเบียนยังทำงาน (ชื่อร้าน · จังหวัดให้เลือก · เป้า)
//   ข้อทดสอบระดับฐาน: supabase/tests/lead_hq_quoted.sql · dealers_directory_own_row.sql (รันใน db-rule-tests.spec.ts)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const admin = adminClient();
// สาขาของชุดเอง (ไม่ใช้ RYG) — ตัวเลขแดชบอร์ดของ [ก2·1] นับลีดทั้งสาขา: ใช้ RYG = ข้ออื่นที่รันพร้อมกันเพิ่ม/ลบลีดตลอด
//   (ตก 26 ต.ค. 69: 8 กับ 7 · ไม่นิ่ง 21 ต.ค. 69) · สาขาของชุดมีแค่ลีดของไฟล์นี้ → รู้ค่าแน่นอน (ได้ใบ HQ 3 ราย · ขอราคา HQ 1 ราย)
//   ข้อมูลบริษัทครบ (ส่งใบให้ลูกค้าได้) · จังหวัดตราด (ภาคตะวันออก — ฟอร์มเพิ่มลีดมีจังหวัดในภาคให้เลือก)
let สาขา: สาขาของข้อ;
const แท็ก = `${Date.now() % 100000}`;
const ได้ราคา = `ZZTEST-ได้ราคาHQ-${แท็ก}`;
const รอราคา = `ZZTEST-รอราคาHQ-${แท็ก}`;
const หมดอายุ = `ZZTEST-ราคาหมดอายุ-${แท็ก}`;
const ปิดแล้ว = `ZZTEST-ปิดแล้วก2-${แท็ก}`;
let ก: ใบHQพร้อมใช้, ค: ใบHQพร้อมใช้, ง: ใบHQพร้อมใช้;
let เลขรอราคา = 0;
const สถานะ = async (n: number) => (await admin.from("leads").select("status").eq("dealer_code", สาขา.รหัส).eq("num_id", n).single()).data?.status;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส, admin);
  ก = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: ได้ราคา, province: "ตราด", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 1000 }] });
  ค = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: หมดอายุ, province: "ตราด", lines: [{ name: "หลังคาชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 1000 }] });
  ง = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: ปิดแล้ว, province: "ตราด", lines: [{ name: "ผนังชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 1000 }] });
  เลขรอราคา = เลขลูกค้าเป้าหมายทดสอบ();
  const sb = await db(สาขา.บัญชี);
  const l = await sb.from("leads").insert({ id: `#L-${เลขรอราคา}`, num_id: เลขรอราคา, dealer_code: สาขา.รหัส, company: รอราคา, name: รอราคา,
    contact: "ผู้ทดสอบ", phone: `08${String(เลขรอราคา).slice(-8)}`, province: "ตราด", status: "BULLET" });
  if (l.error) throw new Error(l.error.message);
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลขรอราคา, p_product: "โกดังสำเร็จรูป" });
  if (r.error) throw new Error(r.error.message);
});
test.afterAll(async () => {
  if (!สาขา) return;
  ล้างใบHQทดสอบ(สาขา.รหัส, [ก?.leadNum, ค?.leadNum, ง?.leadNum, เลขรอราคา].filter((n): n is number => !!n));
  await สาขา.ลบ();
});

async function แถวลีด(page: Page, company: string) {
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  return page.locator("tbody tr").filter({ hasText: company }).first();
}

test("[D4] [H9] [ก2·1] HQ ส่งใบ → ฐานเป็น \"ได้ราคา HQ\" · ป้ายบนจอ · ตัวกรอง · ตัวเลขแดชบอร์ด ตรงกันทั้ง 3 ที่", async ({ page }) => {
  expect(await สถานะ(ก.leadNum), "ฐาน: HQ ส่งใบแล้ว").toBe("HQ_QUOTED");
  expect(await สถานะ(เลขรอราคา), "ฐาน: ยังไม่ได้ใบ").toBe("HQ_PRICING");
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});

  // ป้ายบนจอ
  const แถว = await แถวลีด(page, ได้ราคา);
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  // ป้ายในตาราง = ชื่อขั้นจากตัวกลาง leadStage.ts (บอสสั่ง 27 ต.ค. 69 · เดิมชื่อสถานะ "ได้ราคา HQ")
  await expect(แถว.getByText("ได้ใบ HQ", { exact: true }), "ป้ายในแถว = ขั้น 3 ได้ใบ HQ").toBeVisible();
  await expect(แถว.getByText("ขอราคา HQ", { exact: true }), "ไม่มีป้ายขั้นรอราคาค้าง").toHaveCount(0);

  // ตัวกรอง
  // ตัวกรองขั้นตอนเป็นกลุ่ม (บอสสั่ง 28 ต.ค. 69): กำลังดำเนินการ (ค่าเริ่มต้น ขั้น 1–5) · ปิดสำเร็จ · ปิดไม่สำเร็จ · ทั้งหมด
  const ตัวกรอง = page.getByRole("combobox", { name: "ขั้นตอน", exact: true });
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill("ZZTEST-");
  await expect(page.locator("tbody tr").filter({ hasText: รอราคา }), "กำลังดำเนินการ: เห็นลีดขั้น 2 (รอราคา)").toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator("tbody tr").filter({ hasText: ได้ราคา }), "กำลังดำเนินการ: เห็นลีดขั้น 3 (ได้ใบ HQ)").toHaveCount(1);
  await expect(page.locator("tbody tr").filter({ hasText: รอราคา }).getByText("ขอราคา HQ", { exact: true }), "ลีดที่ยังรอ = ป้ายขั้น 2 ขอราคา HQ").toBeVisible();
  await ตัวกรอง.selectOption({ label: "ปิดไม่สำเร็จ" });
  await expect(page.locator("tbody tr").filter({ hasText: รอราคา }), "ปิดไม่สำเร็จ: ไม่เห็นลีดที่ยังเปิด").toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator("tbody tr").filter({ hasText: ได้ราคา }), "ปิดไม่สำเร็จ: ไม่เห็นลีดที่ยังเปิด").toHaveCount(0);
  await ตัวกรอง.selectOption({ label: "ทั้งหมด" });
  await expect(page.locator("tbody tr").filter({ hasText: ได้ราคา }), "ทั้งหมด: เห็นอีกครั้ง").toHaveCount(1, { timeout: 15_000 });

  // ตัวเลขแดชบอร์ด (โดนัทขั้นตอนการขาย) = นับจากฐาน = ค่าที่รู้ (สาขาของชุด: ข้ออื่นไม่แตะ)
  //   เดิมนับลีด RYG ซึ่งข้ออื่นเพิ่ม/ลบตลอด → อ่านซ้ำ 5 รอบรอฐานนิ่ง · ตอนนี้ตัวเลขคงที่ เทียบตรงเป๊ะครั้งเดียว
  // โดนัทแยกตามขั้น (ชื่อขั้นจากตัวกลาง) — ขั้น 2 = รอราคา HQ · ขั้น 3 = ได้ราคา HQ ที่ยังไม่มีใบร่าง (มีใบร่าง = ขั้น 4)
  const นับ = async (s: string) => {
    const { data: ลีด } = await admin.from("leads").select("num_id").eq("dealer_code", สาขา.รหัส).eq("status", s);
    if (s !== "HQ_QUOTED") return (ลีด ?? []).length;
    const { data: ร่าง } = await admin.from("quotations").select("deal_id").eq("dealer_code", สาขา.รหัส).eq("status", "draft");
    const มีร่าง = new Set((ร่าง ?? []).map(q => Number(q.deal_id)));
    return (ลีด ?? []).filter(l => !มีร่าง.has(Number(l.num_id))).length;
  };
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  for (const [ป้าย, s, รู้ค่า] of [["ได้ใบ HQ", "HQ_QUOTED", 3], ["ขอราคา HQ", "HQ_PRICING", 1]] as const) {
    expect(await นับ(s), `ฐาน: ${ป้าย} ของสาขาของชุด = ${รู้ค่า} ราย`).toBe(รู้ค่า);
    const ปุ่ม = page.getByTitle(`ดูลูกค้าเป้าหมายขั้นตอน ${ป้าย}`);
    await expect(ปุ่ม, `แดชบอร์ดมีแถว ${ป้าย}`).toBeVisible({ timeout: 20_000 });
    expect(Number((await ปุ่ม.locator("span").nth(2).innerText()).replace(/[^\d]/g, "")), `แดชบอร์ด ${ป้าย} = นับจากฐาน`).toBe(รู้ค่า);
  }
});

test("[ก2·2] แผงลีด: ไม่มีช่องเลือกสถานะ · ปุ่มทำใบอยู่ที่แถบขั้นต่อไปที่เดียว · งานที่ระบบติ๊กเองกดไม่ได้", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  const แถว = await แถวลีด(page, ได้ราคา);
  await แถว.locator("td").first().click();
  // ปุ่มทำใบ (ไม่นับปุ่มพับ/กางหัวขั้น "ทำใบให้ลูกค้า" ของงานในแต่ละขั้น · aria-expanded · 28 ต.ค. 69)
  const ปุ่มทำใบ = page.locator("button:not([aria-expanded])").filter({ hasText: /ทำใบให้ลูกค้า/ });
  await expect(page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ทำใบให้ลูกค้า/ }), "แถบขั้นต่อไปมีปุ่มทำใบ").toHaveCount(1, { timeout: 15_000 });
  await expect(ปุ่มทำใบ, "ปุ่มทำใบมีที่เดียว").toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "สถานะลูกค้าเป้าหมาย" }), "ไม่มีช่องเลือกสถานะในแท็บภาพรวม").toHaveCount(0);
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /ทำใบเสนอราคาจากใบ HQ|แก้ใบเสนอราคา/ }), "แท็บใบเสนอราคาไม่มีปุ่มทำใบซ้ำ").toHaveCount(0);
  await expect(ปุ่มทำใบ, "ปุ่มทำใบยังมีที่เดียว").toHaveCount(1);
  // งานในแต่ละขั้นอยู่แท็บภาพรวม (บอสสั่ง 28 ต.ค. 69) — กางทุกขั้นก่อนหา
  await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click();
  await expect(page.locator("[data-lead-tasks]")).toBeVisible({ timeout: 10_000 });
  // กางทีละปุ่มจนไม่เหลือ — กางแล้วรายการเปลี่ยน (จับรายการไว้ก่อนแล้ววน = ปุ่มลำดับถัดไปหาย)
  const พับอยู่ = page.locator("[data-lead-tasks] button[aria-expanded='false']");
  for (let i = 0; i < 10 && await พับอยู่.count(); i++) await พับอยู่.first().click();   // กางทุกขั้น (ขั้นอื่นพับไว้ · 28 ต.ค. 69)
  const งานระบบ = page.locator("[data-auto-task='1']");
  await expect(งานระบบ.first(), "มีงานที่ระบบติ๊กเอง").toBeVisible({ timeout: 10_000 });
  for (const b of await งานระบบ.all()) await expect(b, "งานที่ระบบติ๊กเองกดไม่ได้").toBeDisabled();
});

test("[ก2·3] ลีดปิดการขายแล้ว: ไม่มีขอแก้ราคา · ฐานไม่ให้ทำใบใหม่", async ({ page }) => {
  const q = await ทำใบลูกค้าจากใบHQ(สาขา.บัญชี, ง, { customer: ปิดแล้ว, markupPercent: 5 });
  const sb = await db(สาขา.บัญชี);
  await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", สาขา.รหัส).eq("id", q.id);
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await (await แถวลีด(page, ปิดแล้ว)).locator("td").first().click();
  // รอบ 4: ปิดสำเร็จได้ทางเดียว = ลูกค้าตอบรับที่ใบในแท็บใบเสนอราคาของแผงลีด (ปุ่ม "ได้งาน" เอาออก)
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.locator("[data-customer-result]").getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page).catch(() => "");
  await expect.poll(() => สถานะ(ง.leadNum), { timeout: 20_000 }).toBe("PAID");
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "ขอแก้ราคา" }), "ปิดการขายแล้วไม่มีขอแก้ราคา").toHaveCount(0);
  await expect(page.getByRole("button", { name: /ทำใบให้ลูกค้า/ }), "ปิดการขายแล้วไม่มีปุ่มทำใบ").toHaveCount(0);
  const r = await sb.rpc("create_quotation", { p_dealer: สาขา.รหัส, p_prefix: "Q-", p_payload: { customer: ปิดแล้ว, project: ปิดแล้ว, total: "0", status: "draft",
    line_items: [{ name: "ผนังชุดทดสอบ", qty: 1, unit: "ชุด", unitPrice: 0, markupPct: 0 }], items: 1, hq_quote_id: ง.hqQuoteId, deal_id: ง.leadNum } });
  expect(r.error?.message ?? "", "ฐานไม่ให้ทำใบใหม่").toMatch(/lead_closed|ใบ HQ/);
});

test("[ก2·4] ใบ HQ หมดอายุ → ลีดกลับเป็นรวบรวมความต้องการ · กระดิ่งดีลเลอร์บอกว่าขอราคาใหม่ได้", async ({ page }) => {
  expect(await สถานะ(ค.leadNum)).toBe("HQ_QUOTED");
  // จำลองวันยืนราคาเลยมาแล้ว แล้วสั่งงานตั้งเวลาตัวจริง (ใบที่ส่งแล้วแก้ไม่ได้ — ปิดตัวกันเฉพาะคำสั่งนี้ที่ฐานทดสอบ)
  รันSQLในฐาน(`alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    update public.hq_quotes set valid_until = (now() at time zone 'Asia/Bangkok')::date - 1 where id = ${ค.hqQuoteId};
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    select public.expire_hq_linked_quotations();`);
  expect(await สถานะ(ค.leadNum), "ลีดกลับเป็นรวบรวมความต้องการ").toBe("BULLET");
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "การแจ้งเตือน" }).click();
  // ข้อความจากตารางกลาง (ใบ 0231 · D3): "ราคา HQ ของ <ลีด> หมดอายุ ลีดกลับเป็นรวบรวมความต้องการ — ขอราคาใหม่ได้"
  await expect(page.locator('[data-notif-kind="hq_quote_expired"]').filter({ hasText: `ราคา HQ ของ ${หมดอายุ} หมดอายุ` }).first(),
    "กระดิ่งบอกว่าราคาหมดอายุ").toBeVisible({ timeout: 15_000 });
});

test("[ก2·5] ดีลเลอร์อ่านทะเบียนดีลเลอร์ได้แถวเดียว · หน้าที่ใช้ทะเบียนยังทำงาน (ชื่อร้าน · จังหวัดให้เลือก)", async ({ page }) => {
  const sb = await db(สาขา.บัญชี);
  const { data } = await sb.from("dealers_directory").select("code");
  expect((data ?? []).map(d => d.code), "ดีลเลอร์เห็นแถวตัวเองแถวเดียว").toEqual([สาขา.รหัส]);
  const { data: hq } = await (await db((await import("./supabaseEnv")).ADMIN)).from("dealers_directory").select("code");
  expect((hq ?? []).length, "HQ เห็นทะเบียนครบ").toBeGreaterThan(1);

  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  const จังหวัด = page.getByRole("dialog").getByLabel("จังหวัด").first();
  await expect(จังหวัด, "ฟอร์มเพิ่มลีดเปิดได้").toBeVisible({ timeout: 15_000 });
  expect(await จังหวัด.locator("option").count(), "จังหวัดให้เลือกมาจากภาคของสาขา (ทะเบียนแถวตัวเอง)").toBeGreaterThan(2);
});
