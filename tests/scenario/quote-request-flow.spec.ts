import { test, expect, type Page } from "@playwright/test";
import { รันSQLในฐาน } from "./localDb";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน, เปิดใบHQในกล่องงาน } from "./helpers";

// ── ขายหนึ่งงาน ขั้น 2–4 บนหน้าจอ + ตารางสถานะแถว 1–3, 6–7 (FLOW.html · ด่าน 1) ──────────────────────────────
//   แถว 1 ดีลเลอร์ส่งคำขอ        → คำขอ "ใหม่" · ลูกค้าเป้าหมาย "รอราคา HQ" · อีเมลถึง HQ
//   แถว 2 HQ กดรับเรื่อง          → "กำลังทำราคา" · ลูกค้าเป้าหมายคงเดิม
//   แถว 3 ครบ 14 วันยังไม่ส่งใบ   → ป้ายแดง "เกินกำหนด" ในคิว
//   แถว 6 ดีลเลอร์ยกเลิกคำขอ      → "ยกเลิก" · ลูกค้าเป้าหมายกลับ "รวบรวมความต้องการ" · อีเมลถึง HQ
//   แถว 7 ขอแก้ราคา              → ใบเก่าปิด คำขอใหม่เริ่มนับ 14 วัน · ลูกค้าเป้าหมาย "รอราคา HQ" · อีเมลถึง HQ
// ทุกขั้นเดินผ่านหน้าจอจริง ยกเว้น "HQ ส่งใบ" (ขั้น 5–6 เป็นของด่าน 2 — เตรียมผ่านคำสั่งของฐานด้วยใบผ่านของ HQ)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

const admin = adminClient();
const COMPANY = `ZZTEST-ขอราคา-${Date.now() % 100000}`;
const ผู้รับ = "zztest-qr-flow@example.test";
let leadNum = 0;
let ผู้รับเดิม: string[] = [];

/** ล้างคำขอ + ใบ HQ ของข้อทดสอบ — ใบ HQ ที่ส่งแล้วลบไม่ได้แม้ด้วยกุญแจฝั่งเซิร์ฟเวอร์ (ตั้งใจ) จึงลบที่ฐานทดสอบในเครื่องตรง ๆ */
function ล้างที่ฐาน() {
  const sql = `alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    delete from public.quotations q using public.quote_requests r where r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum} and q.dealer_code = 'RYG' and q.deal_id = r.lead_num_id;
    delete from public.hq_quotes h using public.quote_requests r where h.request_id = r.id and r.dealer_code = 'RYG' and r.lead_num_id = ${leadNum};
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;
    update public.quote_requests set supersedes_id = null, root_id = null where dealer_code = 'RYG' and lead_num_id = ${leadNum};
    delete from public.quote_requests where dealer_code = 'RYG' and lead_num_id = ${leadNum};
    delete from public.email_outbox where to_email = '${ผู้รับ}';
    delete from public.leads where dealer_code = 'RYG' and num_id = ${leadNum};`;
  if (leadNum) รันSQLในฐาน(sql);
}

test.beforeAll(async () => {
  const { data } = await admin.from("hq_notif_rules").select("email_recipients").eq("id", 1).single();
  ผู้รับเดิม = (data?.email_recipients as string[]) ?? [];
  await admin.from("hq_notif_rules").update({ email_recipients: [ผู้รับ] }).eq("id", 1);
  leadNum = 978_000_000 + (Date.now() % 99_999);
  const r = await (await db(RYG)).from("leads").insert({
    id: `#L-${leadNum}`, num_id: leadNum, dealer_code: "RYG", company: COMPANY, name: COMPANY, contact: "ผู้ทดสอบ",
    phone: "081-777-0001", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET",
  });
  if (r.error) throw new Error(r.error.message);
});
test.afterAll(async () => {
  await admin.from("hq_notif_rules").update({ email_recipients: ผู้รับเดิม }).eq("id", 1);
  ล้างที่ฐาน();
});

const สถานะลูกค้าเป้าหมาย = async () => (await admin.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", leadNum).single()).data?.status;
const คำขอล่าสุด = async () => (await admin.from("quote_requests").select("id, status, request_no, supersedes_id").eq("dealer_code", "RYG").eq("lead_num_id", leadNum).order("id", { ascending: false }).limit(1).single()).data!;
// นับเฉพาะอีเมลที่ผูกกับคำขอของลูกค้าเป้าหมายในไฟล์นี้ — ข้ออื่นที่รันพร้อมกันสร้างคำขอได้ (เช่น กล่องงาน HQ ใส่คำขอ "ใหม่")
//   ตัวดักของฐานก็ส่งอีเมลถึงผู้รับเดียวกัน นับทุกฉบับที่ถึงผู้รับ = ไม่นิ่ง (รอบเต็ม 19 ต.ค. 69 ได้ 2 แทน 1)
const อีเมล = async (kind: string) => {
  const ids = ((await admin.from("quote_requests").select("id").eq("dealer_code", "RYG").eq("lead_num_id", leadNum)).data ?? []).map(r => String(r.id));
  if (!ids.length) return 0;
  return (await admin.from("email_outbox").select("id").eq("to_email", ผู้รับ).eq("kind", kind).eq("ref_table", "quote_requests").in("ref_id", ids)).data?.length ?? 0;
};

async function เปิดแท็บใบเสนอราคา(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  return page.locator("[data-panel='quote-request']");
}

test("[flow·dealer] ขั้น 2–3: ส่งคำขอใบเสนอราคาจากหน้าลูกค้าเป้าหมาย → รอราคา HQ · อีเมลถึง HQ (แถว 1)", async ({ page }) => {
  const errs = watchErrors(page);
  const แผง = await เปิดแท็บใบเสนอราคา(page);
  await แผง.getByRole("button", { name: "ขอราคาจาก HQ" }).click();
  // ไม่มีตัวเลือกแม่แบบแล้ว (16 ต.ค. 69) — ดีลเลอร์พิมพ์ "งานที่ขอราคา" เอง และเป็นช่องบังคับ
  await expect(แผง.getByLabel("แม่แบบ", { exact: true }), "คำขอราคาต้องไม่มีตัวเลือกแม่แบบ").toHaveCount(0);
  await แผง.getByLabel("สเปก / รายละเอียด").fill("โกดัง 20x40 ม. สูง 8 ม.");
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect(page.getByText("ระบุงานที่ขอราคาก่อน").first(), "ไม่ระบุงานที่ขอราคา ต้องบอกเหตุผล ไม่ส่ง").toBeVisible({ timeout: 10_000 });
  expect(await สถานะลูกค้าเป้าหมาย(), "ยังไม่ส่งคำขอ → ขั้นต้องไม่เปลี่ยน").not.toBe("HQ_PRICING");
  await แผง.getByLabel("งานที่ขอราคา").fill("โกดังเก็บสินค้า");
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect(แผง.getByText("ใหม่", { exact: true }), "คำขอขึ้นสถานะใหม่บนหน้าจอ").toBeVisible({ timeout: 20_000 });
  await expect(แผง.getByText(/กำหนดส่งใบ HQ/)).toBeVisible();
  expect(await สถานะลูกค้าเป้าหมาย(), "ลูกค้าเป้าหมาย → รอราคา HQ").toBe("HQ_PRICING");
  const { id: ridใหม่ } = await คำขอล่าสุด();
  expect((await admin.from("quote_requests").select("product").eq("id", ridใหม่).single()).data?.product, "งานที่พิมพ์ต้องลงฐาน").toBe("โกดังเก็บสินค้า");
  expect(await อีเมล("quote_request_new"), "อีเมลคำขอใหม่ถึง HQ").toBe(1);
  // ระหว่างรอ เปลี่ยนขั้นเองไม่ได้ (เมนูขั้นบอกเหตุผล)
  await expect(page.locator("text=รอราคา HQ >> visible=true").first(), "หน้าจอแสดงขั้น รอราคา HQ ทันที (ไม่ต้องรีเฟรช)").toBeVisible({ timeout: 15_000 });
  assertNoErrors(errs, "ส่งคำขอราคา");
});

test("[flow·hq] ขั้น 4: คำขอเข้ากล่องงาน HQ → บันทึกร่าง = รับเรื่อง (แถว 2) · เกินกำหนดขึ้นป้ายแดง (แถว 3)", async ({ page }) => {
  // หน้า 5 (บอสตัดสิน 19 ต.ค. 69): ไม่มีปุ่ม "รับเรื่อง" แล้ว — "บันทึกร่าง" รับเรื่องให้ทางเดียว (ฐานทำใน hq_quote_save)
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const { ใบ, แถว } = await เปิดใบHQในกล่องงาน(page, COMPANY);
  await expect(แถว).toContainText("ใหม่");
  await expect(แถว).toContainText("RYG");
  await expect(page.getByRole("button", { name: "รับเรื่อง" }), "ไม่มีปุ่มรับเรื่องแล้ว").toHaveCount(0);
  expect((await คำขอล่าสุด()).status, "เปิดดูอย่างเดียวต้องไม่เปลี่ยนสถานะ").toBe("new");

  await ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await ใบ.getByLabel("ชื่อรายการ 1").fill("โครงสร้างเหล็ก");
  await ใบ.getByLabel("ต้นทุนต่อหน่วย 1").fill("1000");
  await ใบ.getByRole("button", { name: "บันทึกร่าง" }).click();
  await expect.poll(async () => (await คำขอล่าสุด()).status, { timeout: 20_000, message: "บันทึกร่าง = รับเรื่อง" }).toBe("pricing");
  await expect(แถว).toContainText("ร่างค้าง", { timeout: 20_000 });
  expect(await สถานะลูกค้าเป้าหมาย(), "HQ รับเรื่อง ลูกค้าเป้าหมายคงเดิม").toBe("HQ_PRICING");

  const { id } = await คำขอล่าสุด();
  await admin.from("quote_requests").update({ due_at: new Date(Date.now() - 3_600_000).toISOString() }).eq("id", id);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  const { แถว: แถวใหม่ } = await เปิดใบHQในกล่องงาน(page, COMPANY);
  await expect(แถวใหม่.getByText("เกิน 14 วัน"), "เลยกำหนดส่ง → ป้ายแดง").toBeVisible({ timeout: 30_000 });
  assertNoErrors(errs, "กล่องงานคำขอของ HQ");
});

test("[flow·dealer] ยกเลิกคำขอ ต้องมีเหตุผล → ลูกค้าเป้าหมายกลับรวบรวมความต้องการ · อีเมลถึง HQ (แถว 6)", async ({ page }) => {
  const errs = watchErrors(page);
  const แผง = await เปิดแท็บใบเสนอราคา(page);
  await แผง.getByRole("button", { name: "ยกเลิกคำขอ" }).click();
  await แผง.getByRole("button", { name: "ยืนยันยกเลิก" }).click();
  await expect(แผง.getByText("ต้องระบุเหตุผล"), "ไม่ใส่เหตุผล ยกเลิกไม่ได้").toBeVisible();
  await แผง.getByLabel("เหตุผลที่ยกเลิก").fill("ลูกค้าขอเลื่อนโครงการ");
  await แผง.getByRole("button", { name: "ยืนยันยกเลิก" }).click();
  await expect.poll(async () => (await คำขอล่าสุด()).status, { timeout: 20_000 }).toBe("cancelled");
  expect(await สถานะลูกค้าเป้าหมาย(), "ยกเลิกแล้วกลับรวบรวมความต้องการ").toBe("BULLET");
  expect(await อีเมล("quote_request_cancelled"), "อีเมลยกเลิกถึง HQ").toBe(1);
  await expect(แผง.getByRole("button", { name: "ขอราคาจาก HQ" }), "ยกเลิกแล้วขอราคาใหม่ได้").toBeVisible({ timeout: 20_000 });
  assertNoErrors(errs, "ยกเลิกคำขอ");
});

test("[flow·dealer] ขอแก้ราคาหลัง HQ ส่งใบ → คำขอใหม่ เริ่มนับ 14 วันใหม่ · รอราคา HQ · อีเมลถึง HQ (แถว 7)", async ({ page }) => {
  const errs = watchErrors(page);
  // เตรียม: ส่งคำขอใหม่ แล้วให้ HQ ส่งใบผ่านคำสั่งของฐาน (หน้าจอทำ BOQ/ส่งใบเป็นของด่าน 2)
  const ryg = await db(RYG), hq = await db(ADMIN);
  const ส่ง = await ryg.rpc("quote_request_submit", { p_lead_num_id: leadNum, p_product: "โกดังสำเร็จรูป" });
  expect(ส่ง.error, ส่ง.error?.message).toBeNull();
  const rid = (ส่ง.data as { id: number }).id;
  const บันทึก = await hq.rpc("hq_quote_save", { p_request_id: rid, p_lines: [{ name: "โครงเหล็ก", qty: 100, unit: "ตร.ม.", unitCost: 2500 }], p_valid_until: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10) });
  expect(บันทึก.error, บันทึก.error?.message).toBeNull();
  const ส่งใบ = await hq.rpc("hq_quote_send", { p_request_id: rid });
  expect(ส่งใบ.error, ส่งใบ.error?.message).toBeNull();

  const แผง = await เปิดแท็บใบเสนอราคา(page);
  await expect(แผง.getByText("ส่งใบแล้ว", { exact: true })).toBeVisible({ timeout: 20_000 });
  await แผง.getByRole("button", { name: "ขอแก้ราคา" }).click();
  await แผง.getByLabel("เหตุผลที่ขอแก้ราคา").fill("ลูกค้าลดพื้นที่เหลือ 600 ตร.ม.");
  await แผง.getByRole("button", { name: "ส่งขอแก้ราคา" }).click();
  await expect.poll(async () => (await คำขอล่าสุด()).supersedes_id, { timeout: 20_000 }).toBe(rid);
  expect((await คำขอล่าสุด()).status, "คำขอใหม่เริ่มที่ ใหม่").toBe("new");
  expect(await สถานะลูกค้าเป้าหมาย(), "ขอแก้ราคา → รอราคา HQ").toBe("HQ_PRICING");
  expect(await อีเมล("quote_request_reprice"), "อีเมลขอแก้ราคาถึง HQ").toBe(1);
  await expect(แผง.getByText("ใหม่", { exact: true })).toBeVisible({ timeout: 20_000 });
  assertNoErrors(errs, "ขอแก้ราคา");
});
