import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ตารางลูกค้าเป้าหมาย + ตารางใบเสนอราคา ตามรูปที่บอสสั่ง (28 ต.ค. 69) ─────────────────────────────────────────────
//   ลีด (ดีลเลอร์ + ลีดทั้งเครือ HQ): ลำดับคอลัมน์ · ได้ใบ HQ = 60% · มีคำขอราคาแล้วไม่มีปุ่มลบ (ยังไม่มี = มี) · ป้ายขั้นตอนดูอย่างเดียว
//   ใบเสนอราคา (ดีลเลอร์): ลำดับคอลัมน์ · ใบส่งแล้วไม่มีปุ่มแก้/ลบ ใบร่างมี · ฉบับแสดง V2 · วันที่มีปี พ.ศ.
//   ตกบนโค้ดเดิม: ไม่มีคอลัมน์งานที่ต้องการ/ฉบับ · แถบไม่มี % · ไม่มีปุ่มลบในแถวลีด · ปุ่มแก้/ลบในแถวใบ · ตาราง HQ ลำดับเดิม
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const แท็ก = Date.now() % 100_000;
const ลีดได้ใบ = `ZZTEST-ตารางลีดได้ใบ-${แท็ก}`;
const ลีดเปล่า = `ZZTEST-ตารางลีดเปล่า-${แท็ก}`;
const ลีดใบร่าง = `ZZTEST-ตารางใบร่าง-${แท็ก}`;
let ได้ใบ: ใบHQพร้อมใช้ | undefined, ร่าง: ใบHQพร้อมใช้ | undefined;
let เลขเปล่า = 0, เลขส่ง = "", เลขร่าง = "", เลขV2 = "";

test.beforeAll(async () => {
  const sb = await db(RYG);
  // ลีดที่ได้ใบ HQ แล้ว (ขั้น 3) · ลีดอีกรายมีใบลูกค้าส่งแล้ว V1 → ฉบับใหม่ V2 (ใบร่าง)
  ได้ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลีดได้ใบ, province: "ระยอง",
    lines: [{ name: "โครงเหล็กตารางลีด", qty: 1, unit: "ชุด", unitCost: 1000 }] });
  ร่าง = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลีดใบร่าง, province: "ระยอง",
    lines: [{ name: "โครงเหล็กตารางใบ", qty: 2, unit: "ชุด", unitCost: 1000 }] });
  const ส่ง = await ทำใบลูกค้าจากใบHQ(RYG, ร่าง, { customer: ลีดใบร่าง, markupPercent: 10, status: "sent_to_client" });
  เลขส่ง = ส่ง.id;
  const v2 = await sb.rpc("quotation_new_version", { p_dealer: "RYG", p_id: เลขส่ง });
  if (v2.error) throw new Error(`ทำฉบับใหม่ไม่สำเร็จ: ${v2.error.message}`);
  เลขV2 = String((v2.data as { id: string }).id);
  เลขร่าง = เลขV2;   // ฉบับใหม่ = ใบร่าง
  // ลีดที่ยังไม่มีคำขอ/ใบ → มีปุ่มลบ
  เลขเปล่า = เลขลูกค้าเป้าหมายทดสอบ();
  const l = await sb.from("leads").insert({ id: `#L-${เลขเปล่า}`, num_id: เลขเปล่า, dealer_code: "RYG", company: ลีดเปล่า, name: ลีดเปล่า,
    contact: "ผู้ทดสอบ", phone: `08${String(เลขเปล่า).slice(-8)}`, province: "ระยอง", status: "WAITING", project: "โกดังเก็บสินค้า 20x40 ม." });
  if (l.error) throw new Error(l.error.message);
});
test.afterAll(async () => {
  ล้างใบHQทดสอบ("RYG", [ได้ใบ?.leadNum, ร่าง?.leadNum, เลขเปล่า].filter((n): n is number => !!n));
});

const หัวคอลัมน์ = async (page: Page) =>
  (await page.locator("thead th").allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const ลำดับลีด = ["บริษัท / ผู้ติดต่อ", "จังหวัดหน้างาน", "ช่องทางที่มา", "งานที่ต้องการ", "พื้นที่ (ตร.ม.)", "ขั้นตอน", "ความคืบหน้า", "มูลค่า", "ผู้รับผิดชอบ", "กิจกรรมล่าสุด"];

async function แถวลีดดีลเลอร์(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first().fill(company);
  const แถว = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  return แถว;
}

test("[ui·dealer] ตารางลีด: ลำดับคอลัมน์ตามรูป · ได้ใบ HQ = 60% · มีคำขอไม่มีปุ่มลบ · ยังไม่มีคำขอมีปุ่มลบ · ป้ายขั้นตอนดูอย่างเดียว", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const แถว = await แถวลีดดีลเลอร์(page, ลีดได้ใบ);
  expect(await หัวคอลัมน์(page), "ลำดับคอลัมน์ตามที่บอสสั่ง").toEqual(ลำดับลีด);
  const หัว = await page.locator("thead th").allInnerTexts();
  const ช่องขั้น = หัว.findIndex(h => h.trim() === "ขั้นตอน");
  const ช่องคืบ = หัว.findIndex(h => h.trim() === "ความคืบหน้า");
  await expect(แถว.locator("td").nth(ช่องขั้น), "ขั้น 3").toHaveText("ได้ใบ HQ");
  expect(await แถว.locator("td").nth(ช่องขั้น).locator("select, [role=combobox], [role=listbox]").count(), "ป้ายขั้นตอนไม่มีตัวเลือก").toBe(0);
  await expect(แถว.locator("td").nth(ช่องคืบ).getByRole("img"), "ได้ใบ HQ = 3 จาก 5 ขั้น = 60%").toHaveAttribute("aria-label", /^ความคืบหน้า 60%/);
  await expect(แถว.locator("td").nth(ช่องคืบ)).toContainText("60%");
  await expect(แถว.getByRole("button", { name: /^ลบ / }), "ลีดที่มีคำขอราคาแล้ว ไม่มีปุ่มลบ").toHaveCount(0);

  const เปล่า = await แถวลีดดีลเลอร์(page, ลีดเปล่า);
  await expect(เปล่า.getByRole("button", { name: `ลบ ${ลีดเปล่า}` }), "ลีดที่ยังไม่มีคำขอ/ใบ มีปุ่มลบ").toBeVisible();
  await expect(เปล่า.locator('[data-cell="project"]'), "งานที่ต้องการ").toHaveText("โกดังเก็บสินค้า 20x40 ม.");
  await expect(เปล่า.locator("td").nth(ช่องคืบ), "ขั้นข้อมูลลูกค้า = 20%").toContainText("20%");
});

test("[ui·hq] ตารางลีดทั้งเครือ: ลำดับคอลัมน์ตามรูป + ดีลเลอร์ · ได้ใบ HQ (ขั้น 3) · HQ ไม่มีปุ่มลบลีดของดีลเลอร์ (ฐานกัน)", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…").fill(ลีดได้ใบ);
  const แถว = page.locator("tbody tr").filter({ hasText: ลีดได้ใบ }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  // บอสสั่ง 30 ต.ค. 69 (หน้า /hq/leads): "ใช้แบบเดียวกับตารางลูกค้าเป้าหมายฝั่งดีลเลอร์ที่บอสส่งแบบไว้ 28 ต.ค. + คอลัมน์ดีลเลอร์
  //   · เอาคอลัมน์ "ความคืบหน้า %" ออก (ซ้ำป้ายขั้นตอน และขั้นตอนไม่มีตัวเลข)" → ลำดับ = แบบดีลเลอร์ · ดีลเลอร์ต่อจากบริษัท · ไม่มีความคืบหน้า
  //   ขั้นของลีด (เดิมตรวจผ่านแถบ 60%) ตรวจที่ป้ายขั้นตอนแทน: ได้ใบ HQ = ขั้น 3 (ชื่อกลางจาก leadStage.ts)
  const ลำดับHQ = ลำดับลีด.filter(h => h !== "ความคืบหน้า");
  ลำดับHQ.splice(1, 0, "ดีลเลอร์");
  expect(await หัวคอลัมน์(page), "ลำดับคอลัมน์ = แบบดีลเลอร์ + ดีลเลอร์ · ไม่มีความคืบหน้า").toEqual(ลำดับHQ);
  const หัวHQ = (await page.locator("thead th").allInnerTexts()).map(h => h.trim());
  await expect(แถว.locator("td").nth(หัวHQ.indexOf("ดีลเลอร์")), "คอลัมน์ดีลเลอร์ = ดีลเลอร์เจ้าของลีด").toContainText("RYG");
  await expect(แถว.locator('[data-cell="dealer"]'), "ช่องดีลเลอร์").toContainText("RYG");
  await expect(แถว.locator("td").nth(หัวHQ.indexOf("ขั้นตอน")), "ได้ใบ HQ = ขั้น 3").toHaveText("ได้ใบ HQ");
  await expect(แถว.getByRole("img", { name: /^ความคืบหน้า/ }), "ไม่มีแถบความคืบหน้าในตาราง HQ").toHaveCount(0);

  // บอสตัดสิน 29 ต.ค. 69: ลีดเป็นงานของดีลเลอร์ — HQ ไม่มีปุ่มลบลีดของดีลเลอร์ แม้ลีดที่ฝั่งดีลเลอร์ลบได้ (ยังไม่มีคำขอ/ใบ) · ฐานก็ไม่ให้ HQ ลบ
  await page.getByPlaceholder("ค้นหาบริษัท / จังหวัด / ผู้รับผิดชอบ…").fill(ลีดเปล่า);
  const เปล่า = page.locator("tbody tr").filter({ hasText: ลีดเปล่า }).first();
  await expect(เปล่า).toBeVisible({ timeout: 20_000 });
  await expect(เปล่า.getByRole("button", { name: /^ลบ/ }), "HQ ไม่มีปุ่มลบลีดของดีลเลอร์").toHaveCount(0);
  const hq = await db(ADMIN);
  const ลบ = await hq.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลขเปล่า).select("id");
  expect(ลบ.data ?? [], `ฐานต้องไม่ให้ HQ ลบลีดของดีลเลอร์ (${ลบ.error?.message ?? "ไม่มีข้อผิดพลาด"})`).toHaveLength(0);
  const ยังอยู่ = await (await db(RYG)).from("leads").select("id").eq("dealer_code", "RYG").eq("num_id", เลขเปล่า);
  expect(ยังอยู่.data ?? [], "ลีดยังอยู่หลัง HQ พยายามลบ").toHaveLength(1);
});

test("[ui·dealer] ตารางใบเสนอราคา: ลำดับคอลัมน์ตามรูป · ส่งแล้วไม่มีปุ่มแก้/ลบ · ใบร่างมี · ฉบับ V2 · วันที่มีปี พ.ศ.", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขส่ง);
  const ส่ง = page.locator("tbody tr").filter({ has: page.locator("[data-quote-no]", { hasText: new RegExp(`^${เลขส่ง}$`) }) }).first();
  const ใบร่าง = page.locator("tbody tr").filter({ has: page.locator("[data-quote-no]", { hasText: new RegExp(`^${เลขร่าง}$`) }) }).first();
  await expect(ส่ง).toBeVisible({ timeout: 20_000 });
  await expect(ใบร่าง).toBeVisible();
  expect(await หัวคอลัมน์(page), "ลำดับคอลัมน์ตามที่บอสสั่ง").toEqual(
    ["เลขที่", "ลูกค้า", "งานที่ต้องการ", "ฉบับ", "ผู้รับผิดชอบ", "มูลค่า", "สถานะ", "วันที่สร้าง", "หมดอายุ"]);
  await expect(ส่ง.getByRole("button", { name: `ดูใบ ${เลขส่ง}` })).toBeVisible();
  await expect(ส่ง.getByRole("button", { name: `พิมพ์ ${เลขส่ง}` })).toBeVisible();
  // ฉบับใหม่ทำแล้ว ใบเดิมถูกแทนที่ — ใบที่ไม่ใช่ร่างไม่มีปุ่มแก้/ลบ
  await expect(ส่ง.getByRole("button", { name: `แก้ ${เลขส่ง}` }), "ใบที่ไม่ใช่ร่าง ไม่มีปุ่มแก้").toHaveCount(0);
  await expect(ส่ง.getByRole("button", { name: `ลบ ${เลขส่ง}` }), "ใบที่ไม่ใช่ร่าง ไม่มีปุ่มลบ").toHaveCount(0);
  await expect(ใบร่าง.getByRole("button", { name: `แก้ ${เลขร่าง}` }), "ใบร่างมีปุ่มแก้").toBeVisible();
  await expect(ใบร่าง.getByRole("button", { name: `ลบ ${เลขร่าง}` }), "ใบร่างมีปุ่มลบ").toBeVisible();
  await expect(ใบร่าง.locator("[data-revision-cell]"), "ฉบับใหม่แสดง V2").toHaveText("V2");
  await expect(ส่ง.locator("[data-revision-cell]"), "ฉบับแรกแสดง V1").toHaveText("V1");
  for (const d of await ส่ง.locator("[data-date-cell]").allInnerTexts())
    if (d.trim() !== "—") expect(d, "วันที่สร้าง/หมดอายุมีปี พ.ศ.").toMatch(/25\d\d$/);
  expect(await ส่ง.locator("[data-date-cell]").first().innerText(), "วันที่สร้างมีปี พ.ศ.").toMatch(/25\d\d$/);
});
