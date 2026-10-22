import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { RYG, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI, db, cleanup, specNS, nsTag, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";
import { settle } from "./helpers";
import { วางใบเดิมที่ฐาน, ลบใบทดสอบที่ฐาน } from "./legacyQuotes";

// ── ภาษีมูลค่าเพิ่ม + ภาษีหัก ณ ที่จ่าย บนใบเสนอราคา (บอสสั่ง 28 ส.ค. 69) ──────
//
// สิ่งที่ต้องจริง:
//   1. ติ๊กเปิด/ปิดได้ทั้งสองตัว และแก้อัตราเองได้
//   2. ยอดบนจอขยับสดตามที่ติ๊ก
//   3. ค่าที่บันทึกลงฐานข้อมูลเป็นสแนปช็อต (อัตรา + จำนวนเงิน + ยอดชำระสุทธิ)
//   4. ⚠️ ยอดขาย (total_value) ต้องเท่ากับผลรวม BOQ เหมือนเดิม — ภาษีห้ามไปแตะ
//      เพราะรายงาน/เป้า/อัตราปิดการขาย ใช้ตัวนี้อยู่ทั้งระบบ
const admin = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const NS = specNS("QTAX");
const tg = nsTag(NS);
const COMPANY = tg("ภาษีใบเสนอราคา");

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

async function ล้าง() {
  await cleanup(await db(RYG), "RYG", NS);   // รวมใบ HQ / คำขอราคา ของลูกค้าเป้าหมายข้อทดสอบ (ด่าน 3)
  await admin.from("quotations").delete().like("customer", `${NS}%`);
  await admin.from("leads").delete().like("company", `${NS}%`);
}
test.beforeAll(async () => {
  await cleanup(await db(RYG), "RYG", NS);
  await ล้าง();
  const numId = 971_000 + (Date.now() % 900);
  const { error } = await admin.from("leads").insert({
    id: `#L-${numId}`, dealer_code: "RYG", num_id: numId, name: COMPANY, company: COMPANY,
    contact: "คุณทดสอบภาษี", phone: "081-000-0009", province: "ระยอง", product: "โรงงาน",
    // ด่าน 3: ต้องขอราคาจาก HQ ได้ (ขั้นติดต่อแล้ว/รวบรวมความต้องการเท่านั้น) — เดิมตั้งเป็นเสนอราคาไว้เลย
    status: "BULLET", value: "500000", area: "100", assigned: "ทดสอบระบบ",
  });
  if (error) throw new Error(`สร้างลูกค้าเป้าหมายไม่ได้: ${error.message}`);
});
test.afterAll(ล้าง);

/** เปิดฟอร์มออกใบของลูกค้าเป้าหมายนี้ */
async function เปิดฟอร์มออกใบ(page: import("@playwright/test").Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  // ด่าน 3: ใบใหม่ทำจากใบ HQ — ลูกค้าเป้าหมายนี้ได้ใบ HQ ครั้งแรกที่เปิดฟอร์ม · ครั้งต่อไปปุ่มพาไปแก้ใบเดิม
  const ทำใหม่ = page.getByRole("button", { name: /ทำใบให้ลูกค้า/ });
  // มีใบร่างอยู่แล้ว = แก้จากปุ่ม "แก้ไข" ในรายการใบ (ปุ่มทำใบอยู่ที่แถบขั้นต่อไปที่เดียว · บอสสั่ง 19 ต.ค. 69)
  const แก้เดิม = page.getByRole("button", { name: "แก้ไข", exact: true });
  // ยังไม่ได้ใบ HQ = ไม่มีปุ่มทำใบให้รอ (แถบชวนขอราคา) — รอแผงคำขอราคาโหลดเสร็จก่อน แล้วถามฐานข้างล่าง
  await expect(page.locator("[data-panel='quote-request']")).toBeVisible({ timeout: 20_000 });
  // ได้ใบ HQ แล้วหรือยัง — ถามฐาน ไม่เดาจากสถานะปุ่มในจังหวะเดียว (15 ต.ค. 69 · ไม่นิ่งครั้งที่ 4 · trace รอบปิดด่าน):
  //   ข้อก่อนหน้าขอราคาไปแล้ว (ลีด = รอราคา HQ) · แผงยังโหลดใบ HQ อยู่ตอนเช็ก isEnabled → ได้ false
  //   → ไปทางขอราคาใหม่ซึ่งรอลีด "ยังขอราคาได้" ที่ไม่มีวันเกิด (หมดเวลา 20 วิ) · รันซ้ำผ่านเพราะ worker ใหม่สร้างลีดใหม่
  const เลขลีด = ((await admin.from("leads").select("num_id").eq("dealer_code", "RYG").eq("company", COMPANY)).data ?? []).map(l => Number(l.num_id));
  const { data: ใบHQ } = เลขลีด.length ? await admin.from("hq_quotes").select("id, quote_requests!inner(lead_num_id, dealer_code)")
    .eq("status", "sent").eq("quote_requests.dealer_code", "RYG").in("quote_requests.lead_num_id", เลขลีด).limit(1) : { data: [] };
  if (ใบHQ?.length) {
    await expect(ทำใหม่.or(แก้เดิม).first(), "มีใบ HQ แล้ว — ปุ่มทำใบ/แก้ใบต้องกดได้เมื่อแผงโหลดเสร็จ").toBeEnabled({ timeout: 20_000 });
    if (await แก้เดิม.count() > 0) { await แก้เดิม.first().click(); return; }
    await ทำใหม่.click(); return;
  }
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);
}

test("[tax] ฟอร์มออกใบ: ติ๊ก VAT + หัก ณ ที่จ่าย แล้วยอดบนจอต้องขยับตามสูตร", async ({ page }) => {
  await เปิดฟอร์มออกใบ(page);

  // ค่าตั้งต้นตามที่บอสสั่ง: VAT ติ๊กไว้ · หัก ณ ที่จ่าย ไม่ติ๊ก
  const ช่องVAT = page.getByLabel("อัตราภาษีมูลค่าเพิ่ม (VAT)");
  const ช่องหัก = page.getByLabel("อัตราภาษีหัก ณ ที่จ่าย");
  await expect(ช่องVAT).toHaveValue(/\d/);
  await expect(ช่องหัก).toBeDisabled();
  await expect(page.getByText("ยอดชำระสุทธิ").first()).toBeVisible();

  // เปิดหัก ณ ที่จ่าย → ต้องมีบรรทัดหักโผล่มา
  await page.getByRole("checkbox").filter({ hasText: "" }).nth(1).check();
  await expect(page.getByText(/หัก ณ ที่จ่าย \d/).first()).toBeVisible();

  // ปิด VAT → บรรทัด VAT ต้องหายจากสรุป (ยังเหลือยอดชำระสุทธิ)
  await page.getByRole("checkbox").first().uncheck();
  await expect(page.getByText(/ภาษีมูลค่าเพิ่ม \d+%/)).toHaveCount(0);
  await expect(page.getByText("ยอดชำระสุทธิ").first()).toBeVisible();
});

test("[tax] บันทึกใบ → ฐานข้อมูลเก็บสแนปช็อตภาษีครบ และยอดขายยังเท่าผลรวม BOQ", async ({ page }) => {
  await เปิดฟอร์มออกใบ(page);
  await page.getByRole("checkbox").first().check();          // VAT เปิด
  await page.getByLabel("อัตราภาษีมูลค่าเพิ่ม (VAT)").fill("7");
  await page.getByRole("checkbox").nth(1).check();            // หัก ณ ที่จ่าย เปิด
  await page.getByLabel("อัตราภาษีหัก ณ ที่จ่าย").fill("3");
  await page.getByRole("button", { name: /^(สร้างใบเสนอราคา|บันทึก)$/ }).last().click();

  const แถว = await expect.poll(async () =>
    (await admin.from("quotations").select("*").eq("customer", COMPANY).limit(1).maybeSingle()).data,
    { timeout: 30_000, message: "ใบต้องลงฐานข้อมูล" }).not.toBeNull().then(async () =>
    (await admin.from("quotations").select("*").eq("customer", COMPANY).limit(1).single()).data!);

  const รายการ = (แถว.line_items ?? []) as { qty: number; unitPrice: number }[];
  const ผลรวมBOQ = Math.round(รายการ.reduce((s, it) => s + it.qty * it.unitPrice, 0) * 100) / 100;

  // 1) ยอดขายต้องเท่าผลรวม BOQ เป๊ะ — ภาษีห้ามแตะ (รายงาน/เป้าใช้ตัวนี้)
  expect(Number(แถว.total_value), "ยอดขายต้องเท่าผลรวมรายการ BOQ").toBe(ผลรวมBOQ);

  // 2) สแนปช็อตภาษีต้องครบและคิดถูกตามสูตร
  const vat = Math.round(ผลรวมBOQ * 7) / 100;
  const wht = Math.round(ผลรวมBOQ * 3) / 100;
  expect(Number(แถว.vat_percent)).toBe(7);
  expect(Number(แถว.vat_amount)).toBeCloseTo(vat, 2);
  expect(Number(แถว.wht_rate)).toBe(3);
  expect(Number(แถว.wht_amount)).toBeCloseTo(wht, 2);
  expect(Number(แถว.total_amount)).toBeCloseTo(ผลรวมBOQ + vat, 2);
  expect(Number(แถว.net_payable)).toBeCloseTo(ผลรวมBOQ + vat - wht, 2);
});

test("[tax] ใบเก่าที่ยังไม่มีข้อมูลภาษี ต้องเปิดดู/พิมพ์ได้ตามปกติ (ไม่พัง)", async ({ page }) => {
  const เก่า = `${NS}-ใบเก่าไม่มีภาษี`;
  // ใบเก่า (ก่อนปิดทางเดิม · ด่าน 3) สร้างผ่านแอปไม่ได้แล้ว — วางที่ฐานทดสอบตรง ๆ
  // ใบเดิมบนระบบจริงผูกลูกค้าเป้าหมายทุกใบ — วางลีดคู่กัน (รอบ 4: ดู/พิมพ์ใบที่แผงลีด หน้าใบเสนอราคาเป็นรายการ)
  const เลข = 979_800_000 + (Date.now() % 90_000);
  const ลีด = await admin.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: เก่า, name: เก่า,
    phone: "0810000996", province: "ระยอง", status: "QUOTED" });
  expect(ลีด.error, `วางลีดไม่สำเร็จ: ${ลีด.error?.message}`).toBeNull();
  วางใบเดิมที่ฐาน([{
    id: `${NS}-OLD`, dealer_code: "RYG", customer: เก่า, project: เก่า, date: "2026-08-20", deal_id: เลข,
    province: "ระยอง", building_type: "โกดังสำเร็จรูป", area: "1", total: "400000",
    total_value: 400_000, material_cost: 400_000, items: 1, status: "sent_to_client",
    line_items: [{ name: "งาน", qty: 1, unit: "งาน", unitPrice: 400_000 }],
  }]);
  try {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(เก่า);
    const แถว = page.locator("tbody tr").filter({ hasText: เก่า }).first();
    await expect(แถว).toBeVisible({ timeout: 20_000 });
    await แถว.locator("td").nth(1).click();
    await page.waitForURL(/\/leads/, { timeout: 25_000 });
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
    await page.locator(`[data-quote-item="${NS}-OLD"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
    // หน้าดูใบต้องเปิดได้และมียอดสุทธิ (ใบไม่มีภาษี = เท่ากับยอดรวม) · มีปุ่มพิมพ์
    await expect(page.getByText("ยอดสุทธิ", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("฿400,000").first(), "ยอดสุทธิ = ยอดรวม").toBeVisible();
    await expect(page.getByRole("button", { name: /พิมพ์ PDF/ }), "ยังพิมพ์ได้").toBeVisible();
  } finally {
    ลบใบทดสอบที่ฐาน(`id = '${NS}-OLD'`);
    await admin.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลข);
  }
});
