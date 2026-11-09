import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI, db, specNS, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { คิดภาษีใบเสนอราคา } from "../../packages/shared/lib/quoteTax";
import { fmtFull } from "../../packages/shared/lib/format";

// ── หน้าต่างรายละเอียดใบเสนอราคา + ใบค่าแฟรนไชส์ อ่านง่าย (บอสสั่ง 9 พ.ย. 69) ─────────────────────────────────────
//   1. ใต้แถบหัว: แถบสรุป 4 ช่อง — ใบเสนอราคา = ยอดชำระสุทธิ · สถานะ · วันหมดอายุ + เหลือ/เลยมา x วัน (เลย = แดง) · ฉบับ
//                                ใบค่าแฟรนไชส์ = ค่าแรกเข้า · สถานะ · ข้อเสนอมีผลถึง + เหลือ/เลยมา x วัน · เวอร์ชัน
//   2. หมวดลูกค้า / รายละเอียดข้อเสนอ = กริด 3 คอลัมน์ (จอกว้าง) → 1 คอลัมน์ (จอแคบ 375px) · หัวข้ออยู่บน ค่าอยู่ล่าง
//   3. กล่องยอดรวมชิดขวา กว้างครึ่งหนึ่ง
//   ค่าทุกช่องเทียบกับแถวในฐาน (ไม่เทียบกับตัวเลขที่หน้าจอคิดเอง)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

const admin = adminClient();
const รหัสสาขา = "ZZDV";
let สาขา: บัญชีสาขาของชุด;
const NS = specNS("DOCVIEW");
const ใบHQ: ใบHQพร้อมใช้[] = [];
let เลขยังไม่หมด = "";
let เลขเลยแล้ว = "";
let เลขปิดแล้ว = "";

const เดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const วันไทย = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${เดือน[m - 1]} ${y + 543}`; };
const บวกวัน = (n: number) => new Date(Date.now() + 7 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

async function cleanupProspects() {
  const { error } = await (await db(ADMIN)).from("dealer_prospects").delete().like("name", `${NS}%`);
  if (error) throw new Error(`ล้างผู้สนใจทดสอบไม่สำเร็จ: ${error.message}`);
}

test.beforeAll(async () => {
  await cleanupProspects();
  สาขา = await สร้างสาขาของชุด(รหัสสาขา, "ระยอง");
  const lines = [{ name: "โครงเหล็กชุดดูหน้าต่าง", qty: 2, unit: "ชุด", unitCost: 1000 }, { name: "หลังคาชุดดูหน้าต่าง", qty: 1, unit: "งาน", unitCost: 500 }];
  for (const [i, ตั้ง] of ([
    { status: "sent_to_client", date: บวกวัน(-2), expiry: บวกวัน(10), wht: 3 },
    { status: "draft", date: บวกวัน(-40), expiry: บวกวัน(-5), wht: 0 },
    { status: "lost", date: บวกวัน(-40), expiry: บวกวัน(-5), wht: 0 },
  ] as const).entries()) {
    const บริษัท = `${NS}-ใบ${i}`;
    const ใบ = await เตรียมใบHQ(สาขา, { dealerCode: รหัสสาขา, company: บริษัท, province: "ระยอง", lines });
    ใบHQ.push(ใบ);
    const q = await ทำใบลูกค้าจากใบHQ(สาขา, ใบ, { customer: บริษัท, markupPercent: 10, status: ตั้ง.status,
      extra: { date: ตั้ง.date, expiry: ตั้ง.expiry, wht_rate: ตั้ง.wht, province: "ระยอง" } });
    if (i === 0) เลขยังไม่หมด = q.id; else if (i === 1) เลขเลยแล้ว = q.id; else เลขปิดแล้ว = q.id;
  }
});
test.afterAll(async () => {
  await cleanupProspects();
  expect(await ลบสาขาของชุด(รหัสสาขา, ใบHQ.map(x => x.leadNum)), `เก็บกวาดสาขา ${รหัสสาขา}`).toEqual([]);
});

/** ค่าในแถบสรุป: { คีย์: { ค่า, ย่อย, ย่อยแดง } } */
async function อ่านแถบสรุป(แผง: Locator) {
  const แถบ = แผง.locator("[data-doc-summary]");
  await expect(แถบ, "มีแถบสรุปใต้หัวหน้าต่าง").toBeVisible({ timeout: 15_000 });
  return แถบ.locator("[data-summary-item]").evaluateAll(els => els.map(e => {
    const ย่อย = e.querySelector("[data-summary-sub]") as HTMLElement | null;
    return {
      คีย์: e.getAttribute("data-summary-item") ?? "",
      ป้าย: (e.querySelector("[data-summary-label]") as HTMLElement | null)?.innerText.trim() ?? "",
      ค่า: (e.querySelector("[data-summary-value]") as HTMLElement | null)?.innerText.trim() ?? "",
      ย่อย: ย่อย?.innerText.trim() ?? "",
      สีย่อย: ย่อย ? getComputedStyle(ย่อย).color : "",
    };
  }));
}
const แดง = "rgb(220, 38, 38)";
const จำนวนคอลัมน์ = (กริด: Locator) => กริด.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);

/** แถบสรุปต้องอยู่ใต้แถบหัวน้ำเงินทันที (ชิ้นก่อนหน้าคือแถบหัว · ไม่อยู่ในส่วนที่เลื่อน) */
async function ตรวจตำแหน่งแถบ(แผง: Locator) {
  const แถบ = แผง.locator("[data-doc-summary]");
  const ก่อนหน้า = await แถบ.evaluate(e => {
    const p = e.previousElementSibling as HTMLElement | null;
    return p ? { สี: getComputedStyle(p).backgroundColor, ล่าง: p.getBoundingClientRect().bottom, บน: e.getBoundingClientRect().top } : null;
  });
  expect(ก่อนหน้า, "แถบสรุปต่อจากแถบหัว").not.toBeNull();
  expect(ก่อนหน้า!.สี, "ชิ้นก่อนหน้า = แถบหัวน้ำเงินเข้ม").toBe("rgb(0, 51, 102)");
  expect(Math.abs(ก่อนหน้า!.บน - ก่อนหน้า!.ล่าง), "ชิดใต้แถบหัว").toBeLessThan(2);
}

/** แถบหัวน้ำเงินเหลือเลขที่ + ชื่อ + ปุ่ม — ป้ายสถานะ/ฉบับ/เวอร์ชัน/ค่าแรกเข้า อยู่ในแถบสรุปที่เดียว (บอสตอบ 9 พ.ย. 69) */
async function ตรวจหัวไม่มีป้ายซ้ำ(แผง: Locator, ห้าม: string[]) {
  const หัว = แผง.locator("[data-doc-summary]").locator("xpath=preceding-sibling::*[1]");
  await expect(หัว.locator(".badge"), "แถบหัวไม่มีป้าย").toHaveCount(0);
  const ข้อความ = await หัว.innerText();
  for (const ค of ห้าม) expect(ข้อความ, `แถบหัวไม่มี "${ค}" ซ้ำกับแถบสรุป`).not.toContain(ค);
}

async function เปิดใบ(page: Page, เลข: string) {
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาเลขที่").first().fill(เลข);
  const แถว = page.locator("tbody tr").filter({ has: page.locator("[data-quote-no]", { hasText: new RegExp(`^${เลข}$`) }) }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await แถว.locator("td").first().click();
  const แผง = page.locator(`[data-quote-view="${เลข}"]`);
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  return แผง;
}

test("[D6] [ui·dealer] หน้าต่างใบเสนอราคา: แถบสรุป 4 ช่องตรงฐาน · เหลือ x วัน · กริดลูกค้า 3 คอลัมน์ · กล่องยอดรวมชิดขวาครึ่งหนึ่ง", async ({ page }) => {
  const errs = watchErrors(page);
  const { data: ฐาน, error } = await admin.from("quotations").select("customer, project, province, date, expiry, status, revision, total_value, vat_percent, wht_rate")
    .eq("dealer_code", รหัสสาขา).eq("id", เลขยังไม่หมด).single();
  expect(error?.message ?? "").toBe("");
  expect(ฐาน!.expiry, "ตั้งต้น: วันหมดอายุตามที่ใส่").toBe(บวกวัน(10));
  expect(Number(ฐาน!.wht_rate), "ตั้งต้น: หัก ณ ที่จ่าย 3%").toBe(3);
  expect(ฐาน!.province, "ตั้งต้น: จังหวัดในใบ").toBe("ระยอง");
  const ภาษี = คิดภาษีใบเสนอราคา(Number(ฐาน!.total_value), { vatPercent: Number(ฐาน!.vat_percent), whtPercent: Number(ฐาน!.wht_rate) });
  expect(ภาษี.netPayable, "ยอดชำระสุทธิต่างจากรวมเป็นเงิน (มีหัก ณ ที่จ่าย)").not.toBe(ภาษี.totalAmount);

  await page.setViewportSize({ width: 1280, height: 900 });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา);
  const แผง = await เปิดใบ(page, เลขยังไม่หมด);
  await ตรวจตำแหน่งแถบ(แผง);
  const สรุป = await อ่านแถบสรุป(แผง);
  expect(สรุป.map(s => s.ป้าย), "แถบสรุป 4 ช่องตามลำดับ").toEqual(["ยอดชำระสุทธิ", "สถานะ", "วันหมดอายุ", "ฉบับ"]);
  const ช่อง = Object.fromEntries(สรุป.map(s => [s.คีย์, s]));
  expect(ช่อง.net.ค่า, "ยอดชำระสุทธิ = สูตรกลางจากยอดในฐาน").toBe(fmtFull(ภาษี.netPayable));
  await expect(แผง.locator('[data-total-row="net"] [data-total-value]'), "ตรงกับกล่องยอดรวม").toHaveText(ช่อง.net.ค่า);
  const ตัวใหญ่ = await แผง.locator('[data-summary-item="net"] [data-summary-value]').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  const ตัวสถานะ = await แผง.locator('[data-summary-item="status"] [data-summary-value]').evaluate(e => parseFloat(getComputedStyle(e).fontSize));
  expect(ตัวใหญ่, "ยอดชำระสุทธิตัวใหญ่กว่าช่องอื่น").toBeGreaterThan(ตัวสถานะ);
  expect(ฐาน!.status, "ตั้งต้น: ส่งให้ลูกค้าแล้ว").toBe("sent_to_client");
  expect(ช่อง.status.ค่า, "สถานะตามฐาน").toBe("ส่งแล้ว");
  expect(ช่อง.expiry.ค่า, "วันหมดอายุตามฐาน").toBe(วันไทย(ฐาน!.expiry as string));
  expect(ช่อง.expiry.ย่อย).toBe("เหลือ 10 วัน");
  expect(ช่อง.expiry.สีย่อย, "ยังไม่หมด = ไม่แดง").not.toBe(แดง);
  expect(ช่อง.revision.ค่า, "ฉบับ").toBe(`V${String(ฐาน!.revision ?? "1").replace(/^V/, "")}`);
  await ตรวจหัวไม่มีป้ายซ้ำ(แผง, [ช่อง.revision.ค่า, ช่อง.status.ค่า]);
  await expect(แผง.locator("[data-panel-head]"), "แถบหัวยังมีเลขที่ใบ").toContainText(เลขยังไม่หมด);

  // หมวดลูกค้า: กริด 3 คอลัมน์ × 2 แถว หัวข้ออยู่บน ค่าอยู่ล่าง
  const กริด = แผง.locator("[data-quote-customer]");
  expect(await จำนวนคอลัมน์(กริด), "จอกว้าง = 3 คอลัมน์").toBe(3);
  const ช่องลูกค้า = await กริด.locator("[data-grid-item]").evaluateAll(els => els.map(e => {
    const l = (e.querySelector("[data-field-label]") as HTMLElement).getBoundingClientRect();
    const v = (e.querySelector("[data-field-value]") as HTMLElement).getBoundingClientRect();
    return { ป้าย: (e.querySelector("[data-field-label]") as HTMLElement).innerText.trim(), ค่า: (e.querySelector("[data-field-value]") as HTMLElement).innerText.trim(),
      หัวบน: l.bottom <= v.top + 1, top: Math.round(e.getBoundingClientRect().top) };
  }));
  expect(ช่องลูกค้า.map(c => c.ป้าย)).toEqual(["ลูกค้า", "งานที่ต้องการ", "จังหวัด", "ผู้รับผิดชอบ", "วันที่สร้าง", "วันหมดอายุ"]);
  expect(new Set(ช่องลูกค้า.map(c => c.top)).size, "6 ช่อง = 2 แถว").toBe(2);
  for (const c of ช่องลูกค้า) expect(c.หัวบน, `${c.ป้าย}: หัวข้ออยู่บนค่า`).toBe(true);
  const ค่าลูกค้า = Object.fromEntries(ช่องลูกค้า.map(c => [c.ป้าย, c.ค่า]));
  expect(ค่าลูกค้า).toMatchObject({ "ลูกค้า": ฐาน!.customer, "งานที่ต้องการ": ฐาน!.project, "จังหวัด": ฐาน!.province,
    "วันที่สร้าง": วันไทย(ฐาน!.date as string), "วันหมดอายุ": วันไทย(ฐาน!.expiry as string) });

  // กล่องยอดรวมชิดขวา กว้างครึ่งหนึ่งของกรอบ
  const กล่อง = await แผง.locator("[data-quote-totals]").boundingBox();
  const กรอบ = await แผง.locator("[data-quote-totals]").locator("xpath=..").boundingBox();
  expect(กล่อง && กรอบ).toBeTruthy();
  const ในกรอบ = { left: กรอบ!.x + 14, right: กรอบ!.x + กรอบ!.width - 14 };
  expect(Math.abs(กล่อง!.x + กล่อง!.width - ในกรอบ.right), "ชิดขวา").toBeLessThan(2);
  expect(Math.abs(กล่อง!.width - (ในกรอบ.right - ในกรอบ.left) / 2), "กว้างครึ่งหนึ่ง").toBeLessThan(3);
  for (const ป้าย of ["subtotal", "vat", "total", "wht", "net"]) await expect(แผง.locator(`[data-total-row="${ป้าย}"]`), `กล่องยอดรวมมี ${ป้าย}`).toHaveCount(1);

  // ตารางรายการสินค้า + ฉบับของใบนี้ คงเดิม
  await expect(แผง.getByText("โครงเหล็กชุดดูหน้าต่าง", { exact: true })).toBeVisible();
  await expect(แผง.locator(`[data-version-item="${เลขยังไม่หมด}"]`)).toBeVisible();

  // จอแคบ: กริด 1 คอลัมน์ · กล่องยอดรวมเต็มแถว · หน้าไม่เลื่อนแนวนอน
  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(() => จำนวนคอลัมน์(กริด), { message: "จอแคบ = 1 คอลัมน์" }).toBe(1);
  const กล่องแคบ = await แผง.locator("[data-quote-totals]").boundingBox();
  const กรอบแคบ = await แผง.locator("[data-quote-totals]").locator("xpath=..").boundingBox();
  expect(Math.abs(กล่องแคบ!.width - (กรอบแคบ!.width - 28)), "จอแคบ กล่องยอดรวมเต็มแถว").toBeLessThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "หน้าไม่เลื่อนแนวนอน").toBe(true);
  assertNoErrors(errs, "หน้าต่างใบเสนอราคา");
});

test("[D6] [ui·dealer] ใบที่เลยวันหมดอายุ: แถบสรุปขึ้น \"เลยมา x วัน\" สีแดง", async ({ page }) => {
  const { data: ฐาน } = await admin.from("quotations").select("expiry").eq("dealer_code", รหัสสาขา).eq("id", เลขเลยแล้ว).single();
  expect(ฐาน!.expiry, "ตั้งต้น: หมดอายุไปแล้ว 5 วัน").toBe(บวกวัน(-5));
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา);
  const แผง = await เปิดใบ(page, เลขเลยแล้ว);
  const ช่อง = Object.fromEntries((await อ่านแถบสรุป(แผง)).map(s => [s.คีย์, s]));
  expect(ช่อง.expiry.ค่า).toBe(วันไทย(ฐาน!.expiry as string));
  expect(ช่อง.expiry.ย่อย).toBe("เลยมา 5 วัน");
  expect(ช่อง.expiry.สีย่อย, "เลยวันหมดอายุ = แดง").toBe(แดง);
});

test("[D6] [ui·dealer] ใบที่ปิดแล้ว (ปฏิเสธ) เลยวันหมดอายุ: แสดงแค่วัน ไม่มีตัวนับแดง", async ({ page }) => {
  const { data: ฐาน } = await admin.from("quotations").select("expiry, status").eq("dealer_code", รหัสสาขา).eq("id", เลขปิดแล้ว).single();
  expect(ฐาน!.status, "ตั้งต้น: ใบปฏิเสธแล้ว").toBe("lost");
  expect(ฐาน!.expiry, "ตั้งต้น: หมดอายุไปแล้ว 5 วัน").toBe(บวกวัน(-5));
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา);
  const แผง = await เปิดใบ(page, เลขปิดแล้ว);
  const ช่อง = Object.fromEntries((await อ่านแถบสรุป(แผง)).map(s => [s.คีย์, s]));
  expect(ช่อง.status.ค่า).toBe("ปฏิเสธ");
  expect(ช่อง.expiry.ค่า, "ยังแสดงวันหมดอายุ").toBe(วันไทย(ฐาน!.expiry as string));
  expect(ช่อง.expiry.ย่อย, "ใบปิดแล้ว = ไม่มีตัวนับ").toBe("");
  await expect(แผง.locator("[data-summary-sub][data-overdue]"), "ไม่มีตัวนับแดง").toHaveCount(0);
});

test("[ui·hq] หน้าต่างใบค่าแฟรนไชส์: แถบสรุป 4 ช่องตรงฐาน · เลยมา x วันแดง · 9 ช่องเป็นกริด 3 คอลัมน์ → จอแคบ 1 คอลัมน์", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(ADMIN);
  const name = `${NS}-ผู้สนใจ`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name, province: "ขอนแก่น", status: "considering" }).select("id").single();
  expect(error?.message ?? "").toBe("");
  const ins = await sb.from("dealer_package_proposals").insert({ prospect_id: (pr as { id: number }).id, status: "draft", amount: 345_000, contract_months: 24, annual_target: 2_000_000,
    region: "อีสาน", province: "ขอนแก่น", proposed_date: บวกวัน(-20), valid_until: บวกวัน(-3), terms: "ข้อหนึ่ง ZZ", note: null }).select("id, proposal_no").single();
  expect(ins.error?.message ?? "").toBe("");
  const { id, proposal_no: เลข } = ins.data as { id: number; proposal_no: string };
  expect((await sb.from("dealer_package_proposals").update({ status: "sent" }).eq("id", id)).error?.message ?? "").toBe("");
  const ใบ = (await sb.from("dealer_package_proposals").select("amount, status, valid_until, version").eq("id", id).single()).data as { amount: number; status: string; valid_until: string; version: number };
  expect(ใบ.status).toBe("sent");

  await page.setViewportSize({ width: 1280, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(name);
  await page.getByRole("button", { name: `ดูใบ ${เลข}`, exact: true }).click();
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" });
  await expect(แผง.getByText(เลข).first()).toBeVisible({ timeout: 20_000 });
  await ตรวจตำแหน่งแถบ(แผง);
  const สรุป = await อ่านแถบสรุป(แผง);
  expect(สรุป.map(s => s.ป้าย), "แถบสรุป 4 ช่องตามลำดับ").toEqual(["ค่าแรกเข้า", "สถานะ", "ข้อเสนอมีผลถึง", "ฉบับ"]);
  const ช่อง = Object.fromEntries(สรุป.map(s => [s.คีย์, s]));
  expect(ช่อง.amount.ค่า, "ค่าแรกเข้าตามฐาน").toBe(`฿${Number(ใบ.amount).toLocaleString("en-US")}`);
  expect(ช่อง.status.ค่า, "สถานะตามฐาน").toBe("ส่งแล้ว");
  expect(ช่อง.expiry.ค่า, "ข้อเสนอมีผลถึงตามฐาน").toBe(วันไทย(ใบ.valid_until));
  expect(ช่อง.expiry.ย่อย).toBe("เลยมา 3 วัน");
  expect(ช่อง.expiry.สีย่อย, "เลยวันมีผล = แดง").toBe(แดง);
  expect(ช่อง.version.ค่า, "ฉบับตามฐาน (บอสเลือก 9 พ.ย. 69: เวอร์ชัน → ฉบับ)").toBe(`ฉบับ ${ใบ.version}`);
  await ตรวจหัวไม่มีป้ายซ้ำ(แผง, ["ค่าแรกเข้า", "เวอร์ชัน", ช่อง.status.ค่า, ช่อง.amount.ค่า]);
  await expect(แผง.locator("[data-panel-head]"), "แถบหัวยังมีเลขที่ + ชื่อ").toContainText(เลข);
  await expect(แผง.locator("[data-panel-head]")).toContainText(name);

  const กริด = แผง.locator("[data-proposal-fields]");
  expect(await จำนวนคอลัมน์(กริด), "จอกว้าง = 3 คอลัมน์").toBe(3);
  const ช่องใบ = await กริด.locator("[data-field]").evaluateAll(els => els.map(e => {
    const l = (e.querySelector("[data-field-label]") as HTMLElement).getBoundingClientRect();
    const v = (e.querySelector("[data-field-value]") as HTMLElement).getBoundingClientRect();
    return { ชื่อ: e.getAttribute("data-field"), หัวบน: l.bottom <= v.top + 1 };
  }));
  expect(ช่องใบ.length, "9 ช่อง").toBe(9);
  for (const c of ช่องใบ) expect(c.หัวบน, `${c.ชื่อ}: หัวข้ออยู่บนค่า`).toBe(true);
  await expect(แผง.locator('[data-field="หมายเหตุภายใน"] [data-field-value]'), "ช่องว่าง = \"-\"").toHaveText("-");

  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(() => จำนวนคอลัมน์(กริด), { message: "จอแคบ = 1 คอลัมน์" }).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "หน้าไม่เลื่อนแนวนอน").toBe(true);
  assertNoErrors(errs, "หน้าต่างใบค่าแฟรนไชส์");
});

test("[ui·hq] ใบค่าแฟรนไชส์ที่ยังไม่ส่ง (ร่าง) เลยวันมีผล: แสดงแค่วัน ไม่มีตัวนับแดง", async ({ page }) => {
  const sb = await db(ADMIN);
  const name = `${NS}-ผู้สนใจร่าง`;
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name, province: "ขอนแก่น", status: "considering" }).select("id").single();
  expect(error?.message ?? "").toBe("");
  const ins = await sb.from("dealer_package_proposals").insert({ prospect_id: (pr as { id: number }).id, status: "draft", amount: 111_000, contract_months: 12, annual_target: 1_000_000,
    region: "อีสาน", province: "ขอนแก่น", proposed_date: บวกวัน(-20), valid_until: บวกวัน(-3), terms: "ข้อหนึ่ง ZZ", note: null }).select("id, proposal_no, status, valid_until").single();
  expect(ins.error?.message ?? "").toBe("");
  const ใบ = ins.data as { proposal_no: string; status: string; valid_until: string };
  expect(ใบ.status, "ตั้งต้น: ใบร่าง").toBe("draft");

  await loginUI(page, HQ_ORIGIN, "/hq/proposals", ADMIN);
  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(name);
  await page.getByRole("button", { name: `ดูใบ ${ใบ.proposal_no}`, exact: true }).click();
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" });
  await expect(แผง.getByText(ใบ.proposal_no).first()).toBeVisible({ timeout: 20_000 });
  const ช่อง = Object.fromEntries((await อ่านแถบสรุป(แผง)).map(s => [s.คีย์, s]));
  expect(ช่อง.status.ค่า).toBe("ร่าง");
  expect(ช่อง.expiry.ค่า, "ยังแสดงวันมีผล").toBe(วันไทย(ใบ.valid_until));
  expect(ช่อง.expiry.ย่อย, "ยังไม่ส่ง = ไม่มีตัวนับ").toBe("");
  await expect(แผง.locator("[data-summary-sub][data-overdue]"), "ไม่มีตัวนับแดง").toHaveCount(0);
});
