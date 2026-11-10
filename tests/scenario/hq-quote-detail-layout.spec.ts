import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";
import { HQ_ORIGIN, loginUI, specNS, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { คิดภาษีใบเสนอราคา } from "../../packages/shared/lib/quoteTax";
import { fmtFull } from "../../packages/shared/lib/format";

// ── หน้าต่างใบเสนอราคาฝั่ง HQ แบบเดียวกับดีลเลอร์ (บอสตอบ 9 พ.ย. 69 "เปลี่ยนด้วย") ─────────────────────────────────────
//   เปิดจาก /hq/quotations และจากแผงดีลเลอร์ (แท็บใบเสนอราคา) — ตัวเดียวกัน (QuotationDrawer)
//   1. แถบหัวเหลือเลขที่ + ลูกค้า · ดีลเลอร์ + ปุ่มปิด (ไม่มีป้าย) · แถบสรุป 4 ช่องใต้แถบหัว ค่าตรงฐาน
//   2. ตัวนับ "เหลือ/เลยมา x วัน" เฉพาะใบร่าง/ส่งแล้ว (เลย = แดง) · ใบปิดแล้วแสดงแค่วัน
//   3. ลูกค้า = กริด 3 คอลัมน์ 2 แถว (จอแคบ 1 คอลัมน์) · ดีลเลอร์ = ชื่อแสดง ไม่มีรหัส · กล่องยอดรวมชิดขวาครึ่งหนึ่ง
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

const admin = adminClient();
const รหัสสาขา = "ZZDH";
let สาขา: บัญชีสาขาของชุด;
const NS = specNS("HQDOCVIEW");
const ใบHQ: ใบHQพร้อมใช้[] = [];
const เลข: Record<"ส่ง" | "ร่างเลย" | "ปิด", string> = { ส่ง: "", ร่างเลย: "", ปิด: "" };

const เดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const วันไทย = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${เดือน[m - 1]} ${y + 543}`; };
const บวกวัน = (n: number) => new Date(Date.now() + 7 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
const แดง = "rgb(220, 38, 38)";

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของชุด(รหัสสาขา, "ระยอง");
  const lines = [{ name: "โครงเหล็กชุด HQ ดูหน้าต่าง", qty: 2, unit: "ชุด", unitCost: 1000 }, { name: "หลังคาชุด HQ ดูหน้าต่าง", qty: 1, unit: "งาน", unitCost: 500 }];
  for (const [k, ตั้ง] of ([
    ["ส่ง", { status: "sent_to_client", date: บวกวัน(-2), expiry: บวกวัน(10), wht: 3 }],
    ["ร่างเลย", { status: "draft", date: บวกวัน(-20), expiry: บวกวัน(-5), wht: 0 }],
    ["ปิด", { status: "lost", date: บวกวัน(-20), expiry: บวกวัน(-5), wht: 0 }],
  ] as const)) {
    const บริษัท = `${NS}-${k}`;
    const ใบ = await เตรียมใบHQ(สาขา, { dealerCode: รหัสสาขา, company: บริษัท, province: "ระยอง", lines });
    ใบHQ.push(ใบ);
    const q = await ทำใบลูกค้าจากใบHQ(สาขา, ใบ, { customer: บริษัท, markupPercent: 10, status: ตั้ง.status,
      extra: { date: ตั้ง.date, expiry: ตั้ง.expiry, wht_rate: ตั้ง.wht, province: "ระยอง" } });
    เลข[k] = q.id;
  }
});
test.afterAll(async () => {
  expect(await ลบสาขาของชุด(รหัสสาขา, ใบHQ.map(x => x.leadNum)), `เก็บกวาดสาขา ${รหัสสาขา}`).toEqual([]);
});

async function ฐานของ(id: string) {
  const { data, error } = await admin.from("quotations").select("customer, project, province, date, expiry, status, revision, total_value, vat_percent, wht_rate")
    .eq("dealer_code", รหัสสาขา).eq("id", id).single();
  expect(error?.message ?? "").toBe("");
  return data!;
}
async function ชื่อสาขาในฐาน() {
  const { data } = await admin.from("dealers").select("name").eq("code", รหัสสาขา).single();
  return String(data?.name ?? "");
}

/** เปิดหน้าต่างจาก /hq/quotations (ทุกสถานะ · ค้นด้วยเลขที่) */
async function เปิดจากหน้าใบ(page: Page, id: string) {
  await page.goto(`${HQ_ORIGIN}/hq/quotations?dealer=${รหัสสาขา}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByLabel("กรองตามสถานะใบเสนอราคา").selectOption("all");
  await page.locator(".content").getByPlaceholder(/ค้นหา/).first().fill(id);
  const แถว = page.locator("tbody tr").filter({ has: page.locator("[data-quote-no]", { hasText: new RegExp(`^${id}$`) }) }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await แถว.getByRole("button", { name: /ดู/ }).first().click();
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบเสนอราคา" });
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  return แผง;
}

async function อ่านแถบสรุป(แผง: Locator) {
  const แถบ = แผง.locator("[data-doc-summary]");
  await expect(แถบ, "มีแถบสรุปใต้หัวหน้าต่าง").toBeVisible({ timeout: 15_000 });
  await expect(แถบ.locator('[data-summary-item="expiry"] [data-summary-value]'), "วันหมดอายุโหลดแล้ว").not.toHaveText("…", { timeout: 15_000 });
  const ช่อง = await แถบ.locator("[data-summary-item]").evaluateAll(els => els.map(e => {
    const ย่อย = e.querySelector("[data-summary-sub]") as HTMLElement | null;
    return {
      คีย์: e.getAttribute("data-summary-item") ?? "",
      ป้าย: (e.querySelector("[data-summary-label]") as HTMLElement | null)?.innerText.trim() ?? "",
      ค่า: (e.querySelector("[data-summary-value]") as HTMLElement | null)?.innerText.trim() ?? "",
      ย่อย: ย่อย?.innerText.trim() ?? "",
      สีย่อย: ย่อย ? getComputedStyle(ย่อย).color : "",
      แดง: ย่อย?.hasAttribute("data-overdue") ?? false,
    };
  }));
  return { ลำดับ: ช่อง.map(c => c.ป้าย), ...Object.fromEntries(ช่อง.map(c => [c.คีย์, c])) } as { ลำดับ: string[] } & Record<string, { ค่า: string; ย่อย: string; สีย่อย: string; แดง: boolean }>;
}
const จำนวนคอลัมน์ = (กริด: Locator) => กริด.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);

/** แถบหัวน้ำเงิน: แถบสรุปต่อจากแถบหัวทันที · ไม่มีป้าย · ไม่มีค่าที่ซ้ำแถบสรุป · ยังมีเลขที่ */
async function ตรวจแถบหัว(แผง: Locator, id: string, ห้าม: string[]) {
  const หัว = แผง.locator("[data-panel-head]");
  const ต่อกัน = await แผง.locator("[data-doc-summary]").evaluate(e => {
    const p = e.previousElementSibling as HTMLElement | null;
    return p ? { head: p.hasAttribute("data-panel-head"), สี: getComputedStyle(p).backgroundColor, ห่าง: Math.abs(e.getBoundingClientRect().top - p.getBoundingClientRect().bottom) } : null;
  });
  expect(ต่อกัน, "แถบสรุปต่อจากแถบหัว").toEqual({ head: true, สี: "rgb(0, 51, 102)", ห่าง: 0 });
  await expect(หัว.locator(".badge"), "แถบหัวไม่มีป้าย").toHaveCount(0);
  await expect(หัว, "แถบหัวมีเลขที่ใบ").toContainText(id);
  const ข้อความ = await หัว.innerText();
  for (const ค of ห้าม) expect(ข้อความ, `แถบหัวไม่มี "${ค}" ซ้ำกับแถบสรุป`).not.toContain(ค);
}

test("[H10] [ui·hq] /hq/quotations: แถบสรุป 4 ช่องตรงฐาน · เหลือ x วัน · กริดลูกค้า 3×2 · ดีลเลอร์ชื่อแสดง · กล่องยอดรวมชิดขวา · จอแคบ 1 คอลัมน์", async ({ page }) => {
  const errs = watchErrors(page);
  const ฐาน = await ฐานของ(เลข.ส่ง);
  expect(ฐาน.expiry, "ตั้งต้น: วันหมดอายุตามที่ใส่").toBe(บวกวัน(10));
  expect(Number(ฐาน.wht_rate), "ตั้งต้น: หัก ณ ที่จ่าย 3%").toBe(3);
  expect(ฐาน.province, "ตั้งต้น: จังหวัดในใบ").toBe("ระยอง");
  expect(ฐาน.status).toBe("sent_to_client");
  const ภาษี = คิดภาษีใบเสนอราคา(Number(ฐาน.total_value), { vatPercent: Number(ฐาน.vat_percent), whtPercent: Number(ฐาน.wht_rate) });
  expect(ภาษี.netPayable, "ยอดชำระสุทธิต่างจากรวมเป็นเงิน (มีหัก ณ ที่จ่าย)").not.toBe(ภาษี.totalAmount);
  const ชื่อสาขา = await ชื่อสาขาในฐาน();
  expect(ชื่อสาขา, "ตั้งต้น: สาขามีชื่อ").not.toBe("");

  await page.setViewportSize({ width: 1280, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const แผง = await เปิดจากหน้าใบ(page, เลข.ส่ง);
  const ส = await อ่านแถบสรุป(แผง);
  expect(ส.ลำดับ, "แถบสรุป 4 ช่องตามลำดับ").toEqual(["ยอดชำระสุทธิ", "สถานะ", "วันหมดอายุ", "ฉบับ"]);
  expect(ส.net.ค่า, "ยอดชำระสุทธิ = สูตรกลางจากยอดในฐาน").toBe(fmtFull(ภาษี.netPayable));
  await expect(แผง.locator('[data-total-row="net"] [data-total-value]'), "ตรงกับกล่องยอดรวม").toHaveText(ส.net.ค่า);
  await expect(แผง.locator('[data-total-row="wht"]'), "กล่องยอดรวมมีหัก ณ ที่จ่าย").toHaveCount(1);
  expect(ส.status.ค่า, "สถานะตามฐาน").toBe("ส่งแล้ว");
  expect(ส.expiry.ค่า, "วันหมดอายุตามฐาน").toBe(วันไทย(ฐาน.expiry as string));
  expect(ส.expiry.ย่อย).toBe("เหลือ 10 วัน");
  expect(ส.expiry.แดง, "ยังไม่หมด = ไม่แดง").toBe(false);
  expect(ส.revision.ค่า, "ฉบับตามฐาน (ไม่ได้เก็บ = ฉบับแรก กติกาเดียวกับดีลเลอร์)").toBe(`V${String(ฐาน.revision ?? "1").replace(/^V/, "")}`);
  await ตรวจแถบหัว(แผง, เลข.ส่ง, [ส.status.ค่า, ส.revision.ค่า, ส.net.ค่า]);

  // ลูกค้า: กริด 3 คอลัมน์ × 2 แถว หัวข้อบน ค่าล่าง (ชุดเดียวกับหน้าต่างใบของดีลเลอร์)
  const กริด = แผง.locator("[data-quote-customer]");
  expect(await จำนวนคอลัมน์(กริด), "จอกว้าง = 3 คอลัมน์").toBe(3);
  const ช่องลูกค้า = await กริด.locator("[data-grid-item]").evaluateAll(els => els.map(e => {
    const l = (e.querySelector("[data-field-label]") as HTMLElement); const v = (e.querySelector("[data-field-value]") as HTMLElement);
    return { ป้าย: l.innerText.trim(), ค่า: v.innerText.trim(), หัวบน: l.getBoundingClientRect().bottom <= v.getBoundingClientRect().top + 1, top: Math.round(e.getBoundingClientRect().top) };
  }));
  expect(ช่องลูกค้า.map(c => c.ป้าย)).toEqual(["ลูกค้า", "งานที่ต้องการ", "จังหวัด", "ผู้รับผิดชอบ", "วันที่สร้าง", "วันหมดอายุ"]);
  expect(new Set(ช่องลูกค้า.map(c => c.top)).size, "6 ช่อง = 2 แถว").toBe(2);
  for (const c of ช่องลูกค้า) expect(c.หัวบน, `${c.ป้าย}: หัวข้ออยู่บนค่า`).toBe(true);
  expect(Object.fromEntries(ช่องลูกค้า.map(c => [c.ป้าย, c.ค่า]))).toMatchObject({ "ลูกค้า": ฐาน.customer, "งานที่ต้องการ": ฐาน.project, "จังหวัด": ฐาน.province,
    "วันที่สร้าง": วันไทย(ฐาน.date as string), "วันหมดอายุ": วันไทย(ฐาน.expiry as string) });
  // ดีลเลอร์: ชื่อแสดง ไม่มีรหัส
  const ดีลเลอร์ = แผง.locator('[data-quote-dealer] [data-field="ดีลเลอร์"] [data-field-value]');
  await expect(ดีลเลอร์, "ชื่อดีลเลอร์ตามฐาน").toHaveText(ชื่อสาขา);
  // ชื่อสาขาทดสอบมีรหัสอยู่ในชื่อเอง (ZZTEST-สาขาของชุด-ZZDH) — ตรวจว่าไม่มีรหัสต่อท้ายแบบ "(รหัส)" เพิ่มจากชื่อ (ชื่อตรงฐานทั้งข้อความแล้วข้างบน)
  await expect(ดีลเลอร์, "ไม่มีรหัสสาขาต่อท้าย").not.toContainText(`(${รหัสสาขา})`);

  // กล่องยอดรวมชิดขวา กว้างครึ่งหนึ่ง
  const กล่อง = (await แผง.locator("[data-quote-totals]").boundingBox())!;
  const กรอบ = (await แผง.locator("[data-quote-totals]").locator("xpath=..").boundingBox())!;
  expect(Math.abs(กล่อง.x + กล่อง.width - (กรอบ.x + กรอบ.width - 14)), "ชิดขวา").toBeLessThan(2);
  expect(Math.abs(กล่อง.width - (กรอบ.width - 28) / 2), "กว้างครึ่งหนึ่ง").toBeLessThan(3);
  // ส่วนของ HQ คงเดิม: รายการสินค้า · ขายต่อ · ส่วนต่างกำไร
  await expect(แผง.getByText("โครงเหล็กชุด HQ ดูหน้าต่าง", { exact: true }).first()).toBeVisible();
  await expect(แผง.locator('[data-panel="quote-resale"]')).toBeVisible();
  await expect(แผง.locator('[data-panel="quote-margin"]')).toBeVisible({ timeout: 15_000 });

  // จอแคบ: กริด 1 คอลัมน์ · กล่องยอดรวมเต็มแถว · หน้าไม่เลื่อนแนวนอน
  await page.setViewportSize({ width: 375, height: 800 });
  await expect.poll(() => จำนวนคอลัมน์(กริด), { message: "จอแคบ = 1 คอลัมน์" }).toBe(1);
  const กล่องแคบ = (await แผง.locator("[data-quote-totals]").boundingBox())!;
  const กรอบแคบ = (await แผง.locator("[data-quote-totals]").locator("xpath=..").boundingBox())!;
  expect(Math.abs(กล่องแคบ.width - (กรอบแคบ.width - 28)), "จอแคบ กล่องยอดรวมเต็มแถว").toBeLessThan(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "หน้าไม่เลื่อนแนวนอน").toBe(true);
  assertNoErrors(errs, "หน้าต่างใบเสนอราคา HQ");
});

test("[H10] [ui·hq] ใบร่างเลยวันหมดอายุ = \"เลยมา 5 วัน\" สีแดง · ใบปิดแล้ว (ปฏิเสธ) = แสดงแค่วัน ไม่มีตัวนับ", async ({ page }) => {
  const ร่าง = await ฐานของ(เลข.ร่างเลย);
  const ปิด = await ฐานของ(เลข.ปิด);
  expect([ร่าง.status, ร่าง.expiry], "ตั้งต้น: ใบร่าง หมดอายุไป 5 วัน").toEqual(["draft", บวกวัน(-5)]);
  expect([ปิด.status, ปิด.expiry], "ตั้งต้น: ใบปฏิเสธ หมดอายุไป 5 วัน").toEqual(["lost", บวกวัน(-5)]);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);

  const ส1 = await อ่านแถบสรุป(await เปิดจากหน้าใบ(page, เลข.ร่างเลย));
  expect(ส1.status.ค่า).toBe("ร่าง");
  expect(ส1.expiry.ค่า).toBe(วันไทย(ร่าง.expiry as string));
  expect(ส1.expiry.ย่อย).toBe("เลยมา 5 วัน");
  expect([ส1.expiry.แดง, ส1.expiry.สีย่อย], "เลยวันหมดอายุ = แดง").toEqual([true, แดง]);
  await page.keyboard.press("Escape");

  const แผง2 = await เปิดจากหน้าใบ(page, เลข.ปิด);
  const ส2 = await อ่านแถบสรุป(แผง2);
  expect(ส2.status.ค่า).toBe("ปฏิเสธ");
  expect(ส2.expiry.ค่า, "ยังแสดงวันหมดอายุ").toBe(วันไทย(ปิด.expiry as string));
  expect(ส2.expiry.ย่อย, "ใบปิดแล้ว = ไม่มีตัวนับ").toBe("");
  await expect(แผง2.locator("[data-summary-sub][data-overdue]"), "ไม่มีตัวนับแดง").toHaveCount(0);
});

test("[H11] [ui·hq] แผงดีลเลอร์ › แท็บใบเสนอราคา › กดใบ = หน้าต่างแบบเดียวกัน (อยู่เหนือแผงดีลเลอร์)", async ({ page }) => {
  const ฐาน = await ฐานของ(เลข.ส่ง);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers/${รหัสสาขา}`, { waitUntil: "domcontentloaded" });
  const แผงดีลเลอร์ = page.locator(`[data-dealer-panel="${รหัสสาขา}"]`);
  await expect(แผงดีลเลอร์).toBeVisible({ timeout: 25_000 });
  await แผงดีลเลอร์.locator('[data-panel-tab="quotes"]').click();
  await แผงดีลเลอร์.getByRole("button", { name: `เปิดใบเสนอราคา ${เลข.ส่ง}`, exact: true }).click({ timeout: 25_000 });
  const แผง = page.getByRole("dialog", { name: "รายละเอียดใบเสนอราคา" });
  await expect(แผง, "กดใบแล้วหน้าต่างเปิด").toBeVisible({ timeout: 15_000 });
  const ส = await อ่านแถบสรุป(แผง);
  expect(ส.ลำดับ).toEqual(["ยอดชำระสุทธิ", "สถานะ", "วันหมดอายุ", "ฉบับ"]);
  expect(ส.expiry.ค่า).toBe(วันไทย(ฐาน.expiry as string));
  expect(ส.expiry.ย่อย).toBe("เหลือ 10 วัน");
  await ตรวจแถบหัว(แผง, เลข.ส่ง, [ส.status.ค่า, ส.revision.ค่า]);
  // หน้าต่างอยู่เหนือแผงดีลเลอร์ — จุดกลางหน้าต่างเป็นของหน้าต่างเอง (กดได้จริง)
  const บน = await แผง.evaluate(el => {
    const r = el.getBoundingClientRect();
    const ตรงนั้น = document.elementFromPoint(r.left + r.width / 2, r.top + 20);
    return !!ตรงนั้น && el.contains(ตรงนั้น);
  });
  expect(บน, "หน้าต่างใบอยู่บนสุด ไม่ถูกแผงดีลเลอร์ทับ").toBe(true);
  await page.keyboard.press("Escape");
  await expect(แผง).toHaveCount(0);
  await expect(แผงดีลเลอร์, "ปิดหน้าต่างใบแล้วแผงดีลเลอร์ยังอยู่").toBeVisible();
});
