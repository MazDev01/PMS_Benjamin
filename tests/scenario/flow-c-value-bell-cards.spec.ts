import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { สร้างดีลเลอร์รหัสยาว, ล้างดีลเลอร์รหัสยาว } from "./longCodeDealer";
// ดีลเลอร์ที่ยังไม่ตั้งเป้าแต่มียอดขาย — รหัสของไฟล์นี้เอง (ZZWWW เป็นของ flow-b ที่รันขนานกัน)
const รหัสยาว = "ZZWVW";

// ── รอบ 2 ช่วง ค (บอสตัดสิน 19–20 ต.ค. 69) ─────────────────────────────────────────────────────────────────────
//   ข้อ 5) ช่อง "ประเมินราคา" ออกจากหน้าเว็บทุกที่ · มูลค่าลีดทุกที่ = ยอดก่อน VAT ของใบเสนอราคาล่าสุด (ใบ 0223) ไม่มีใบ = "—"
//   ข้อ 7) กระดิ่ง: นับเฉพาะยังไม่อ่าน · เปิดดูแล้ว = อ่าน · จุดแดงขึ้นจริง · ประวัติก่อนวันเริ่มใช้ไม่นับ
//          ดีลเลอร์ได้ "HQ ส่งราคาแล้ว" · HQ ได้คำขอราคาใหม่/ขอแก้ราคา/ลูกค้าปฏิเสธ เข้ากระดิ่ง (ใบ 0224)
//   ข้อ 8) การ์ด/เป้าที่ยังไม่มีข้อมูล ขึ้น "—" ไม่ใช่ 0% สีแดง และไม่มีป้าย "ล้าหลังเป้า"
//   ข้อทดสอบระดับฐาน: supabase/tests/lead_quote_value.sql · bell_events.sql (รันใน db-rule-tests.spec.ts)
//   ตัวตรวจถาวร: scripts/check-no-lead-estimate.mjs (โค้ดแอปห้ามอ่าน LeadRow.value)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const admin = adminClient();
const แท็ก = `${Date.now() % 100000}`;
const มีใบ = `ZZTEST-มูลค่ามีใบ-${แท็ก}`;
const ไม่มีใบ = `ZZTEST-มูลค่าไม่มีใบ-${แท็ก}`;
const ขอราคา = `ZZTEST-กระดิ่งHQ-${แท็ก}`;
const มีแค่ใบHQ = `ZZTEST-มูลค่ามีแค่ใบHQ-${แท็ก}`;
let ก: ใบHQพร้อมใช้, ข: ใบHQพร้อมใช้;
let เลขไม่มีใบ = 0, เลขขอราคา = 0;
const เลขคำขอของ = async (n: number) =>
  ((await admin.from("quote_requests").select("id, request_no").eq("dealer_code", "RYG").eq("lead_num_id", n).order("id", { ascending: false })).data ?? []) as { id: number; request_no: string }[];

test.beforeAll(async () => {
  // [บอสสั่ง 20 ต.ค. 69 กรณี 2] ลีดมีใบที่ส่งลูกค้าแล้ว (ทุน 2,000,000 +10% = 2,200,000) แล้วตามด้วยใบร่างยอดต่างกัน (+50% = 3,000,000)
  //   มูลค่าต้องเป็นของใบที่ส่งแล้ว — ใบร่างไม่นับ
  ก = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: มีใบ, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 2_000_000 }] });
  const ส่งแล้ว = await ทำใบลูกค้าจากใบHQ(RYG, ก, { customer: มีใบ, markupPercent: 10 });
  const ส่ง = await (await db(RYG)).from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", ส่งแล้ว.id);
  if (ส่ง.error) throw new Error(ส่ง.error.message);
  await ทำใบลูกค้าจากใบHQ(RYG, ก, { customer: มีใบ, markupPercent: 50 });
  // [กรณี 1] ลีดมีแค่ใบ HQ (ราคาทุนของดีลเลอร์ 5,000,000) ยังไม่มีใบลูกค้า → "—"
  ข = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: มีแค่ใบHQ, province: "ระยอง", lines: [{ name: "หลังคาชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 5_000_000 }] });
  // ลีดไม่มีใบ แต่มีช่องประเมินราคาเดิม 9,999,999 ค้างในฐาน — ต้องไม่ถูกแสดง/นับ
  เลขไม่มีใบ = เลขลูกค้าเป้าหมายทดสอบ();
  const ins = await admin.from("leads").insert({ id: `#L-${เลขไม่มีใบ}`, num_id: เลขไม่มีใบ, dealer_code: "RYG", company: ไม่มีใบ, name: ไม่มีใบ,
    contact: "ผู้ทดสอบ", phone: `08${String(เลขไม่มีใบ).slice(-8)}`, province: "ระยอง", status: "WAITING", value: "฿9,999,999" });
  if (ins.error) throw new Error(ins.error.message);
  await สร้างดีลเลอร์รหัสยาว(รหัสยาว);   // ดีลเลอร์ที่ยังไม่ตั้งเป้า แต่มียอดขาย (ข้อ 8)
});
test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", [ก?.leadNum, ข?.leadNum, เลขไม่มีใบ, เลขขอราคา]);
  await ล้างดีลเลอร์รหัสยาว(รหัสยาว);
});

async function แถว(page: Page, placeholder: RegExp, company: string) {
  await page.getByPlaceholder(placeholder).first().fill(company);
  return page.locator("tbody tr").filter({ hasText: company }).first();
}
async function เปิดกระดิ่ง(page: Page) {
  await page.getByRole("button", { name: "การแจ้งเตือน" }).first().click();
  await expect(page.locator("span").filter({ hasText: /^การแจ้งเตือน$/ }).first()).toBeVisible();
}
const นับยังไม่อ่าน = async (page: Page) => {
  const b = page.locator("[data-unread-count]");
  return (await b.count()) ? Number(await b.first().getAttribute("data-unread-count")) : 0;
};

test("[ค·5] ดีลเลอร์: ไม่มีช่องประเมินราคา · มูลค่า = ยอดใบล่าสุด (ไม่มีใบ = \"—\") ทั้งตาราง แผง และฐาน", async ({ page }) => {
  expect(Number((await admin.from("leads").select("quote_value").eq("dealer_code", "RYG").eq("num_id", ก.leadNum).single()).data?.quote_value),
    "ฐาน [กรณี 2]: มูลค่า = ใบที่ส่งแล้ว ไม่ใช่ใบร่างที่ใหม่กว่า (3,000,000)").toBe(2_200_000);
  expect((await admin.from("leads").select("quote_value").eq("dealer_code", "RYG").eq("num_id", ข.leadNum).single()).data?.quote_value ?? null,
    "ฐาน [กรณี 1]: มีแค่ใบ HQ = ไม่มีมูลค่า").toBeNull();
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  const ร1 = await แถว(page, /ค้นหาบริษัท/, มีใบ);
  await expect(ร1, "ตาราง [กรณี 2]: มูลค่าจากใบที่ส่งแล้ว").toContainText("฿2.2M", { timeout: 20_000 });
  await expect(ร1, "ตาราง [กรณี 2]: ไม่ใช่ยอดใบร่าง").not.toContainText("฿3.0M");
  const รHQ = await แถว(page, /ค้นหาบริษัท/, มีแค่ใบHQ);
  await expect(รHQ).toBeVisible({ timeout: 20_000 });
  await expect(รHQ.locator("td.num").last(), "ตาราง [กรณี 1]: มีแค่ใบ HQ = —").toHaveText("—");
  const ร2 = await แถว(page, /ค้นหาบริษัท/, ไม่มีใบ);
  await expect(ร2).toBeVisible({ timeout: 20_000 });
  await expect(ร2, "ตาราง: ไม่มีใบ = ไม่แสดงประเมินราคาเดิม").not.toContainText(/9,999,999|10\.0M|฿10M/);
  await ร2.locator("td.num").last().click();
  await expect(page.getByLabel("ประเมินราคา"), "ช่องมูลค่าในตารางแก้เองไม่ได้แล้ว").toHaveCount(0);
  await page.keyboard.press("Escape");
  // แผงลีด: ไม่มีช่องประเมินราคา · ป้ายมูลค่าบนหัวแผง = ยอดใบเต็มจำนวน
  const ร1อีก = await แถว(page, /ค้นหาบริษัท/, มีใบ);
  await ร1อีก.locator("td").nth(1).click();
  await expect(page.getByText("฿2,200,000").first(), "หัวแผง: ยอดใบล่าสุด").toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ประเมินราคา", { exact: true }), "แผงไม่มีช่องประเมินราคา").toHaveCount(0);
  await expect(page.getByLabel("ประเมินราคา")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // ฟอร์มเพิ่มลูกค้าเป้าหมาย: ไม่มีช่องประเมินราคา
  await page.getByRole("button", { name: /เพิ่มลูกค้าเป้าหมาย/ }).first().click();
  const ฟอร์ม = page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" });
  await expect(ฟอร์ม).toBeVisible({ timeout: 10_000 });
  await expect(ฟอร์ม.getByText("ประเมินราคา"), "ฟอร์มเพิ่มไม่มีช่องประเมินราคา").toHaveCount(0);
  // แดชบอร์ด: การ์ดโอกาสการขายรวมจากยอดใบล่าสุด
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("รวมยอดใบเสนอราคาล่าสุดของงานที่ยังเปิดอยู่"), "การ์ดโอกาสการขายบอกที่มาใหม่").toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ประเมินราคา", { exact: true }), "แดชบอร์ดไม่มีคำว่าประเมินราคา").toHaveCount(0);
});

test("[ค·5] HQ: ตารางลีดทั้งเครือ + แผง ใช้ยอดใบล่าสุด · ไม่มีคำว่าประเมินราคา", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ร1 = await แถว(page, /ค้นหา/, มีใบ);
  await expect(ร1, "ตาราง HQ [กรณี 2]: ยอดใบที่ส่งแล้ว").toContainText("2,200,000", { timeout: 20_000 });
  await expect(ร1, "ตาราง HQ [กรณี 2]: ไม่ใช่ยอดใบร่าง").not.toContainText("3,000,000");
  const รHQ = await แถว(page, /ค้นหา/, มีแค่ใบHQ);
  await expect(รHQ).toBeVisible({ timeout: 20_000 });
  await expect(รHQ, "ตาราง HQ [กรณี 1]: มีแค่ใบ HQ ไม่แสดงราคาทุน").not.toContainText("5,000,000");
  const ร2 = await แถว(page, /ค้นหา/, ไม่มีใบ);
  await expect(ร2).toBeVisible({ timeout: 20_000 });
  await expect(ร2, "ตาราง HQ: ไม่มีใบ ไม่แสดงประเมินราคาเดิม").not.toContainText("9,999,999");
  await ร2.locator("td").nth(2).click();
  await expect(page.getByText("ใบเสนอราคาล่าสุด").first(), "แผง HQ: ป้ายใหม่").toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ประเมินราคา", { exact: true }), "แผง HQ ไม่มีคำว่าประเมินราคา").toHaveCount(0);
});

test("[ค·7] ดีลเลอร์: \"HQ ส่งราคาแล้ว\" เข้ากระดิ่ง · จุดแดงขึ้น · กดเปิด = อ่าน (ค้างหลังรีเฟรช) · ประวัติก่อนวันเริ่มใช้ไม่นับ", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  // วันเริ่มใช้ = อนาคตไกล → ทุกเรื่อง (รวมนัดหมายล่วงหน้า) เกิดก่อนวันเริ่มใช้ → ไม่นับเลย
  //   (ตั้ง "พรุ่งนี้" ไม่ได้: นัดหมายที่ยังไม่ถึงวันเป็นเรื่องของวันข้างหน้า ต้องนับตามปกติ)
  await page.evaluate(() => localStorage.setItem("pms_notif_since_RYG", "9999-12-31"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  await expect.poll(() => นับยังไม่อ่าน(page), { timeout: 15_000, message: "ประวัติก่อนวันเริ่มใช้ไม่นับ" }).toBe(0);
  // วันเริ่มใช้ = วันนี้ → เรื่องวันนี้ (HQ ส่งราคา) นับ
  const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  await page.evaluate((d) => localStorage.setItem("pms_notif_since_RYG", d), วันนี้);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  await expect.poll(() => นับยังไม่อ่าน(page), { timeout: 20_000, message: "เรื่องวันนี้ต้องนับ" }).toBeGreaterThan(0);
  // ⚠️ ห้ามเทียบตัวเลขรวมก่อน/หลังกด — ในรอบเต็ม ข้อทดสอบอื่นสร้างเรื่องใหม่ให้ RYG ตลอด (ไม่นิ่ง 20 ต.ค. 69: คาด 5 ได้ 6)
  //   ตรวจที่ "เรื่องนี้เรื่องเดียว": จุดแดงก่อนกด → หายหลังกด → ยังหายหลังรีเฟรช
  const ดูทั้งหมด = page.getByRole("button", { name: /ดูการแจ้งเตือนทั้งหมด|ดูทั้งหมด/ });
  const เรื่องนี้ = () => page.getByRole("button").filter({ hasText: "HQ ส่งราคาแล้ว" }).filter({ hasText: มีใบ }).first();
  const เปิดดูเรื่องนี้ = async () => {
    await เปิดกระดิ่ง(page);
    if (await ดูทั้งหมด.count()) await ดูทั้งหมด.first().click();
    await expect(เรื่องนี้(), "ดีลเลอร์ได้เรื่อง HQ ส่งราคาแล้ว").toBeVisible({ timeout: 15_000 });
  };
  await เปิดดูเรื่องนี้();
  await expect(เรื่องนี้().locator("[data-unread-dot]"), "จุดแดงขึ้นจริง").toHaveCount(1);
  await เรื่องนี้().click();
  await expect(page, "กดแล้วไปที่ลีดนั้น").toHaveURL(new RegExp(`/leads\\?open=${ก.leadNum}`), { timeout: 15_000 });
  // แผงลีดที่เปิดอยู่บังกระดิ่ง — กลับแดชบอร์ดด้วยการกดเมนู (ไม่โหลดหน้าใหม่ = ตรวจสถานะในหน้าเดิม)
  await page.locator(".drawer-overlay").click({ position: { x: 5, y: 5 } });   // ปิดแผงลีดก่อน (กดฉากหลัง = ปิด · ฉากหลังรับการกดแทนเมนู)
  await expect(page.locator(".drawer-overlay")).toHaveCount(0, { timeout: 10_000 });
  await page.getByRole("link", { name: "แดชบอร์ด" }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await settle(page);
  await เปิดดูเรื่องนี้();
  await expect(เรื่องนี้().locator("[data-unread-dot]"), "เปิดดูแล้ว = อ่าน (จุดแดงหาย)").toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  await เปิดดูเรื่องนี้();
  await expect(เรื่องนี้().locator("[data-unread-dot]"), "อ่านแล้วค้างหลังรีเฟรช").toHaveCount(0);
});

test("[ค·7] HQ: คำขอราคาใหม่ · ขอแก้ราคา · ลูกค้าปฏิเสธ เข้ากระดิ่ง HQ · กดแล้วไปกล่องคำขอพร้อมค้นเลขคำขอ", async ({ page }) => {
  const sb = await db(RYG);
  เลขขอราคา = เลขลูกค้าเป้าหมายทดสอบ();
  const l = await sb.from("leads").insert({ id: `#L-${เลขขอราคา}`, num_id: เลขขอราคา, dealer_code: "RYG", company: ขอราคา, name: ขอราคา,
    contact: "ผู้ทดสอบ", phone: `08${String(เลขขอราคา).slice(-8)}`, province: "ระยอง", status: "BULLET" });
  expect(l.error?.message ?? "").toBe("");
  const r1 = await sb.rpc("quote_request_submit", { p_lead_num_id: เลขขอราคา, p_product: "โกดังสำเร็จรูป" });
  expect(r1.error?.message ?? "", "ส่งคำขอราคา").toBe("");
  const [คำขอแรก] = await เลขคำขอของ(เลขขอราคา);

  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await เปิดกระดิ่ง(page);
  const ใหม่ = page.getByRole("button").filter({ hasText: "ดีลเลอร์ส่งคำขอราคาใหม่" }).filter({ hasText: คำขอแรก.request_no }).first();
  await expect(ใหม่, "HQ ได้เรื่องคำขอราคาใหม่").toBeVisible({ timeout: 20_000 });
  await expect(ใหม่.locator("[data-unread-dot]"), "จุดแดงขึ้นจริง").toHaveCount(1);
  await ใหม่.click();
  await expect(page).toHaveURL(/\/hq\/quote-requests/, { timeout: 15_000 });
  await expect(page.getByLabel("ค้นหาคำขอ"), "กล่องคำขอค้นเลขคำขอให้").toHaveValue(คำขอแรก.request_no, { timeout: 15_000 });

  // HQ ส่งราคา → ดีลเลอร์ขอแก้ราคา → HQ ส่งอีก → ดีลเลอร์ทำใบ ส่งลูกค้า → ลูกค้าปฏิเสธ
  const hq = await db(ADMIN);
  const ส่งใบ = async (rid: number) => {
    const valid = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
    expect((await hq.rpc("hq_quote_save", { p_request_id: rid, p_lines: [{ name: "โครงเหล็ก", qty: 1, unit: "ชุด", unitCost: 1000 }], p_valid_until: valid, p_note: "" })).error?.message ?? "").toBe("");
    const s = await hq.rpc("hq_quote_send", { p_request_id: rid });
    expect(s.error?.message ?? "").toBe("");
    return Number((s.data as { id: number }).id);
  };
  await ส่งใบ(คำขอแรก.id);
  const rp = await sb.rpc("quote_request_reprice", { p_id: คำขอแรก.id, p_reason: "ลูกค้าขอลดสเปก", p_spec: null });
  expect(rp.error?.message ?? "", "ขอแก้ราคา").toBe("");
  const [คำขอสอง] = await เลขคำขอของ(เลขขอราคา);
  const hqId = await ส่งใบ(คำขอสอง.id);
  const q = await ทำใบลูกค้าจากใบHQ(RYG, { dealerCode: "RYG", leadNum: เลขขอราคา, requestId: คำขอสอง.id, hqQuoteId: hqId, quoteNo: "" }, { customer: ขอราคา, markupPercent: 5 });
  expect((await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", q.id)).error?.message ?? "").toBe("");
  expect((await sb.from("quotations").update({ status: "lost", lost_reason: "ราคา" }).eq("dealer_code", "RYG").eq("id", q.id)).error?.message ?? "", "ลูกค้าปฏิเสธ").toBe("");

  await page.goto(`${HQ_ORIGIN}/hq/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await เปิดกระดิ่ง(page);
  await expect(page.getByRole("button").filter({ hasText: "ดีลเลอร์ขอแก้ราคา" }).filter({ hasText: คำขอสอง.request_no }).first(),
    "HQ ได้เรื่องขอแก้ราคา (แยกจากคำขอใหม่)").toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button").filter({ hasText: "ดีลเลอร์ส่งคำขอราคาใหม่" }).filter({ hasText: คำขอสอง.request_no }), "ขอแก้ราคาไม่ซ้ำเป็นคำขอใหม่").toHaveCount(0);
  await expect(page.getByRole("button").filter({ hasText: "ลูกค้าปฏิเสธใบเสนอราคา" }).filter({ hasText: คำขอสอง.request_no }).first(),
    "HQ ได้เรื่องลูกค้าปฏิเสธ").toBeVisible({ timeout: 20_000 });
});

test("[ค·8] ยังไม่ตั้งเป้า = \"—\" ไม่ใช่ 0% · ไม่มีป้ายล้าหลังเป้า (รายละเอียด · ทะเบียน · ภาพรวมยอดขาย · อัตราตอบรับ · อัตราปิดดีล · แดชบอร์ดดีลเลอร์)", async ({ page }) => {
  expect(Number((await admin.from("dealers").select("revenue_target").eq("code", รหัสยาว).single()).data?.revenue_target ?? -1), "ดีลเลอร์ทดสอบยังไม่ตั้งเป้า").toBe(0);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${รหัสยาว}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("ความคืบหน้าเทียบเป้าทั้งปี")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("ล้าหลังเป้า"), "ไม่ตั้งเป้า = ไม่มีป้ายล้าหลังเป้า (มียอดขายแล้วก็ตาม)").toHaveCount(0);
  await expect(page.getByText(/ยอดขายต่ำกว่า 50% ของเป้า/), "ไม่มีแถบเตือนต่ำกว่าเป้า").toHaveCount(0);
  await expect(page.getByText("ยังไม่ได้ตั้งเป้า").first(), "บอกว่ายังไม่ตั้งเป้า").toBeVisible();
  await expect(page.getByText("0%", { exact: true }), "ไม่มี 0%").toHaveCount(0);

  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ร = await แถว(page, /ค้นหา/, รหัสยาว);
  await expect(ร.getByText("ยังไม่ได้ตั้งเป้า"), "ทะเบียน: แถบยอด/เป้า").toBeVisible({ timeout: 20_000 });
  await expect(ร.getByText("0%", { exact: true }), "ทะเบียน: ไม่มี 0% สีแดง").toHaveCount(0);

  await page.goto(`${HQ_ORIGIN}/hq/pipeline`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const รp = await แถว(page, /ค้นหา/, รหัสยาว);
  await expect(รp).toBeVisible({ timeout: 20_000 });
  await expect(รp.getByText("0%", { exact: true }), "ภาพรวมยอดขาย: % เป้า ไม่ใช่ 0%").toHaveCount(0);

  await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(`ZZไม่มีจริง-${แท็ก}`);
  await expect(page.getByText("ยังไม่มีใบที่ส่งแล้ว"), "อัตราตอบรับ: ไม่มีตัวหาร = —").toBeVisible({ timeout: 20_000 });

  // ฝั่งดีลเลอร์: อัตราปิดดีล (ไม่มีดีลที่ปิดในผลค้น) + แดชบอร์ดเมื่อยังไม่ตั้งเป้า
  const เป้าเดิม = (await admin.from("dealers").select("revenue_target").eq("code", "RYG").single()).data?.revenue_target;
  await admin.from("dealers").update({ revenue_target: 0 }).eq("code", "RYG");
  try {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหาบริษัท/).first().fill(`ZZไม่มีจริง-${แท็ก}`);
    const การ์ด = page.getByTitle("กรอง: อัตราปิดดีล");
    await expect(การ์ด, "อัตราปิดดีล: ไม่มีดีลที่ปิด = —").toContainText("—", { timeout: 15_000 });
    await expect(การ์ด, "อัตราปิดดีล: ไม่ใช่ 0%").not.toContainText("%");
    await page.goto(`${DEALER_ORIGIN}/dashboard`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText("ยังไม่ได้ตั้งเป้า").first(), "แดชบอร์ดดีลเลอร์: ยังไม่ตั้งเป้า").toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("img", { name: "ยังไม่มีข้อมูล" }), "วงแหวนขึ้น — ไม่ใช่ 0%").toBeVisible();
  } finally {
    await admin.from("dealers").update({ revenue_target: เป้าเดิม }).eq("code", "RYG");
  }
});
