import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── แม่แบบวัสดุ (บอสสั่ง 26 ต.ค. 69 · ใบ 0244) ─────────────────────────────────────────────────────────────────────
//   HQ ตั้งในตั้งค่า › แม่แบบวัสดุ (หมวด · ชื่อ · หน่วย · ราคาต่อหน่วย · เปิดใช้ · วันที่อัปเดตราคา)
//   ดีลเลอร์เลือกวัสดุ + จำนวนตอนขอราคา (D3) → ราคาประเมินรวม ป้าย "ราคาประเมินเบื้องต้น ไม่ใช่ใบเสนอราคา" · พิมพ์ไม่ออก
//   ใบ HQ (H8) เปิดมามีรายการจากคำขอ · เพิ่มจากแม่แบบได้ · ส่งแล้วเก็บ % คลาด → หน้าแม่แบบแสดงค่าเฉลี่ย
//   ข้อที่ต้องตกบนโค้ดก่อนแก้: ทุกข้อ (ไม่มีตาราง/แท็บ/ช่องเลือกวัสดุ) · กันที่ฐาน: supabase/tests/material_templates.sql
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const แท็ก = Date.now() % 100_000;
const หมวด = `ZZTEST-หมวด-${แท็ก}`;
const ผนัง = `ZZTEST-ผนังเมทัลชีท-${แท็ก}`, ประตู = `ZZTEST-ประตูม้วน-${แท็ก}`;
const เลข = { ขอ: เลขลูกค้าเป้าหมายทดสอบ() };
const บริษัท = (k: keyof typeof เลข) => `ZZTEST-แม่แบบวัสดุ-${k}-${แท็ก}`;
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const เดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const วันนี้พศ = () => { const d = new Date(Date.now() + 7 * 3_600_000); return `${d.getUTCDate()} ${เดือน[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`; };
const id: Record<string, number> = {};

async function สร้างลีด(k: keyof typeof เลข) {
  const r = await (await db(RYG)).from("leads").insert({ id: `#L-${เลข[k]}`, num_id: เลข[k], dealer_code: "RYG", company: บริษัท(k), name: บริษัท(k),
    contact: "ผู้ทดสอบ", phone: `08${String(เลข[k]).slice(-8)}`, province: "ระยอง", status: "BULLET", project: "โกดัง 20x40 ม.", area: 800 });
  expect(r.error, `สร้างลีด ${k}`).toBeNull();
}
async function เปิดแผงขอราคา(page: Page, k: keyof typeof เลข) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท(k));
  const row = page.locator("tbody tr").filter({ hasText: บริษัท(k) }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  return page.locator("[data-panel='quote-request']");
}

test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", Object.values(เลข));
  await svc.from("material_templates").delete().like("name", `ZZTEST-%-${แท็ก}`);
});

test("[flow·hq] ตั้งค่า › แม่แบบวัสดุ: เพิ่ม 2 รายการ บันทึกด้วยปุ่มกลาง · วันที่อัปเดตราคาเป็น พ.ศ.", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "แม่แบบวัสดุ" }).click();
  const แผง = page.locator("[data-panel='material-templates']");
  await expect(แผง.getByTestId("estimate-accuracy"), "การ์ด % คลาดเฉลี่ยอยู่บนหัว").toBeVisible({ timeout: 20_000 });
  for (const [ชื่อ, หน่วย, ราคา] of [[ผนัง, "ตร.ม.", 285.5], [ประตู, "ชุด", 42000]] as const) {
    await แผง.getByRole("button", { name: "เพิ่มวัสดุ" }).click();
    const แถว = แผง.locator("tbody tr[data-mt-row='new']").last();
    await แถว.getByLabel(/^หมวด \d+$/).fill(หมวด);
    await แถว.getByLabel(/^ชื่อวัสดุ \d+$/).fill(ชื่อ);
    await แถว.getByLabel(/^หน่วย \d+$/).fill(หน่วย);
    await แถว.getByLabel(/^ราคาต่อหน่วย \d+$/).fill(String(ราคา));
  }
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => ((await svc.from("material_templates").select("name, unit, unit_price, active").like("name", `ZZTEST-%-${แท็ก}`).order("name")).data ?? [])
    .map(r => [r.name, r.unit, Number(r.unit_price), r.active]), { timeout: 20_000, message: "ฐานได้ 2 รายการตามที่กรอก" })
    .toEqual([[ประตู, "ชุด", 42000, true], [ผนัง, "ตร.ม.", 285.5, true]].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  const แถวผนัง = แผง.locator("tbody tr").filter({ has: page.locator(`input[value="${ผนัง}"]`) });
  await expect(แถวผนัง.getByTestId("price-updated"), "วันที่อัปเดตราคา = วันนี้ (พ.ศ.)").toHaveText(วันนี้พศ(), { timeout: 15_000 });
  for (const r of (await svc.from("material_templates").select("id, name").like("name", `ZZTEST-%-${แท็ก}`)).data ?? []) id[r.name === ผนัง ? "ผนัง" : "ประตู"] = r.id;
  assertNoErrors(errs, "ตั้งค่าแม่แบบวัสดุ");
});

test("[db] ดีลเลอร์แก้ราคาแม่แบบไม่ได้ (ตรง ๆ และผ่านคำสั่งบันทึก)", async () => {
  const sb = await db(RYG);
  const แก้ = await sb.from("material_templates").update({ unit_price: 1 }).eq("id", id.ผนัง).select();
  expect(แก้.error?.message ?? "", "แก้ตารางตรง ๆ ต้องถูกปฏิเสธ").toMatch(/permission denied/i);
  const บันทึก = await sb.rpc("material_templates_save", { p_rows: [{ id: id.ผนัง, category: หมวด, name: ผนัง, unit: "ตร.ม.", unitPrice: 1, active: true }], p_delete_ids: [] });
  expect(บันทึก.error?.message ?? "", "คำสั่งบันทึกของ HQ ต้องปฏิเสธดีลเลอร์").toMatch(/forbidden/);
  expect(Number((await svc.from("material_templates").select("unit_price").eq("id", id.ผนัง).single()).data?.unit_price), "ราคาไม่เปลี่ยน").toBe(285.5);
});

test("[flow·dealer] ขอราคา: เลือกวัสดุ 2 รายการ → ราคาประเมินถูก + ป้ายไม่ใช่ใบเสนอราคา · พิมพ์ไม่ออก · คำขอเก็บสำเนา", async ({ page }) => {
  const errs = watchErrors(page);
  await สร้างลีด("ขอ");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const แผง = await เปิดแผงขอราคา(page, "ขอ");
  const กล่อง = แผง.locator("[data-box='material-estimate']");
  await expect(กล่อง.getByTestId("estimate-total"), "ยังไม่เลือก = ไม่มีราคาประเมิน").toHaveText("—", { timeout: 20_000 });
  await กล่อง.getByLabel("ค้นวัสดุ").fill(`-${แท็ก}`);
  await กล่อง.getByLabel("เลือกวัสดุ").selectOption(String(id.ผนัง));
  await กล่อง.getByLabel("เลือกวัสดุ").selectOption(String(id.ประตู));
  await กล่อง.getByLabel("จำนวนวัสดุ 1").fill("820");
  await กล่อง.getByLabel("จำนวนวัสดุ 2").fill("2");
  // 820 × 285.50 = 234,110.00 · 2 × 42,000 = 84,000.00 → 318,110.00
  await expect(กล่อง.getByTestId("estimate-total"), "ราคาประเมินรวมจากวัสดุ 2 รายการ").toHaveText(`${บาท(318110)} บาท`);
  await expect(กล่อง.getByTestId("estimate-label")).toHaveText("ราคาประเมินเบื้องต้น ไม่ใช่ใบเสนอราคา");
  await page.emulateMedia({ media: "print" });
  await expect(กล่อง, "ตอนพิมพ์ ราคาประเมินไม่ออกกระดาษ").toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await แผง.getByRole("button", { name: "ส่งคำขอ" }).click();
  await expect.poll(async () => (await (await db(RYG)).from("quote_requests").select("estimate_total, estimate_items").eq("dealer_code", "RYG").eq("lead_num_id", เลข.ขอ).maybeSingle()).data,
    { timeout: 20_000, message: "คำขอเก็บสำเนารายการประเมิน ณ ตอนส่ง" })
    .toMatchObject({ estimate_total: 318110, estimate_items: [{ name: ผนัง, unit: "ตร.ม.", qty: 820, unitPrice: 285.5 }, { name: ประตู, unit: "ชุด", qty: 2, unitPrice: 42000 }] });
  await expect(แผง.getByTestId("request-estimate"), "หลังส่ง แผงคำขอแสดงราคาประเมินพร้อมป้าย").toContainText("ราคาประเมินเบื้องต้น ไม่ใช่ใบเสนอราคา", { timeout: 20_000 });
  const ลีด = (await (await db(RYG)).from("leads").select("value").eq("dealer_code", "RYG").eq("num_id", เลข.ขอ).single()).data;
  expect(ลีด?.value ?? null, "ราคาประเมินไม่ไปเป็นมูลค่าลีด (ไม่นับในมูลค่าโอกาสการขาย)").toBeNull();
  assertNoErrors(errs, "ขอราคาพร้อมวัสดุ");
});

test("[db] HQ เปลี่ยนราคาแม่แบบแล้ว คำขอเก่าไม่เปลี่ยน", async () => {
  const hq = await db(ADMIN);
  const r = await hq.rpc("material_templates_save", { p_rows: [{ id: id.ผนัง, category: หมวด, name: ผนัง, unit: "ตร.ม.", unitPrice: 999, active: true }], p_delete_ids: [] });
  expect(r.error?.message ?? "", "HQ เปลี่ยนราคาได้").toBe("");
  const ค = (await (await db(RYG)).from("quote_requests").select("estimate_total, estimate_items").eq("dealer_code", "RYG").eq("lead_num_id", เลข.ขอ).single()).data!;
  expect(Number(ค.estimate_total), "ยอดประเมินของคำขอเก่าคงเดิม").toBe(318110);
  expect((ค.estimate_items as { unitPrice: number }[])[0].unitPrice, "ราคาต่อหน่วยในสำเนาคงเดิม").toBe(285.5);
  await hq.rpc("material_templates_save", { p_rows: [{ id: id.ผนัง, category: หมวด, name: ผนัง, unit: "ตร.ม.", unitPrice: 285.5, active: true }], p_delete_ids: [] });
});

test("[flow·hq] ใบ HQ เปิดมามีรายการจากคำขอ · เพิ่มจากแม่แบบได้ · ส่งแล้ว % คลาดขึ้นในหน้าแม่แบบ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ใบ = (await เปิดใบHQในกล่องงาน(page, บริษัท("ขอ"))).ใบ;
  await expect(ใบ.getByLabel("ชื่อรายการ 1"), "แถว 1 = วัสดุแรกจากคำขอ").toHaveValue(ผนัง, { timeout: 20_000 });
  await expect(ใบ.getByLabel("จำนวน 1")).toHaveValue("820");
  await expect(ใบ.getByLabel("ชื่อรายการ 2"), "แถว 2 = วัสดุที่สองจากคำขอ").toHaveValue(ประตู);
  await expect(ใบ.getByTestId("hq-quote-total"), "ยอดตั้งต้น = ราคาประเมินของคำขอ").toContainText(บาท(318110));
  await expect(ใบ.locator("[data-info='estimate']"), "หัวใบแสดงราคาประเมินของดีลเลอร์").toContainText(บาท(318110));

  // เพิ่มจากแม่แบบ (ค้นได้) → ต่อท้ายตาราง
  await ใบ.getByRole("button", { name: "เลือกจากแม่แบบวัสดุ" }).click();
  const ตัวเลือก = page.getByRole("dialog", { name: "เลือกจากแม่แบบวัสดุ" });
  await ตัวเลือก.getByLabel("ค้นแม่แบบวัสดุ").fill(ประตู);
  await ตัวเลือก.getByRole("button", { name: new RegExp(`เพิ่ม ${ประตู}`) }).click();
  await ตัวเลือก.getByRole("button", { name: "เสร็จ" }).click();
  await expect(ใบ.getByLabel("ชื่อรายการ 3"), "แถว 3 = วัสดุที่เลือกจากแม่แบบ").toHaveValue(ประตู);
  await ใบ.getByRole("button", { name: "ลบรายการ 3" }).click();

  // ต้นทุนผนัง 250 → ยอดใบ HQ = 820 × 250 + 2 × 42,000 = 289,000 → คลาด (318,110 − 289,000) ÷ 289,000 = +10.1%
  await ใบ.getByLabel("ต้นทุนต่อหน่วย 1").fill("250");
  await expect(ใบ.getByTestId("hq-quote-total")).toContainText(บาท(289000));
  await ใบ.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }).click();
  await page.getByRole("button", { name: "ส่งใบ HQ", exact: true }).click();
  await expect.poll(async () => Number((await svc.from("quote_requests").select("estimate_deviation_pct").eq("dealer_code", "RYG").eq("lead_num_id", เลข.ขอ).eq("status", "quoted").maybeSingle()).data?.estimate_deviation_pct),
    { timeout: 20_000, message: "ส่งแล้วฐานเก็บ % คลาด" }).toBe(10.1);
  await expect(ใบ.getByLabel("ชื่อรายการ 1"), "ส่งแล้วล็อก (H9)").toHaveCount(0);

  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "แม่แบบวัสดุ" }).click();
  const ค่า = await svc.from("quote_requests").select("estimate_deviation_pct").not("estimate_deviation_pct", "is", null);
  const เฉลี่ย = (ค่า.data ?? []).reduce((s, r) => s + Math.abs(Number(r.estimate_deviation_pct)), 0) / (ค่า.data ?? []).length;
  await expect(page.getByTestId("estimate-accuracy"), "การ์ดแสดงค่าเฉลี่ยจากฐาน (คลาดเฉลี่ยไม่สนทิศ)")
    .toHaveText(`${(Math.round(เฉลี่ย * 10) / 10).toFixed(1)}%`, { timeout: 20_000 });
  assertNoErrors(errs, "ใบ HQ จากคำขอที่มีวัสดุ");
});
