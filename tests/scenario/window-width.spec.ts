import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI } from "./funcHelpers";
import { ช่องผู้สนใจครบ } from "./requiredFixtures";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

// ── หน้าต่างกลางจอ กว้างค่าเดียวจากตัวกลาง (บอสตอบ 10 พ.ย. 69 · lib/windowSize.ts = 820) ─────────────────────────────
//   หน้าต่างเอกสาร = 820 พอดี: ใบเสนอราคา (ดีลเลอร์ · HQ) · ใบ HQ (ทำใบ · เดิมเต็มจอ 1240) · ใบค่าแฟรนไชส์ (เดิม 760) · งานในแผงลูกค้าดีลเลอร์ (เดิม 1040)
//   หน้าต่างอื่น ≤ 820: เจาะลึก (เดิม 880) · ฟอร์ม/นำเข้า (เดิม 980–1080) — วัดที่จอ 1920 · ทุกตัวอยู่กลางจอ
//   หน้าต่างทำใบ HQ: ข้อมูลลูกค้า/งาน กริด 2 คอลัมน์ · ตารางรายการ ช่องรายการกว้างสุด · หัวบรรทัดเดียว · ไม่มีแถบเลื่อนแนวนอน
//   ตกบนโค้ดเดิม: ใบ HQ 1240 · ใบค่าแฟรนไชส์ 760 · งานในแผงลูกค้า 1040 · นำเข้าผู้สนใจ 1080
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);
const ค่ากลาง = 820;

const NS = `ZZTEST-หน้าต่าง-${Date.now() % 1_000_000}`;
let เลขใบค่า = "";
// คำขอใบเสนอราคาของข้อ (ข้อมูลตั้งต้นไม่มีคำขอ) — สาขาของข้อ + ลูกค้าเป้าหมาย 1 ราย ส่งคำขอแล้ว
let ส: สาขาของข้อ;
const เลขลีด = 1_960_000_000 + Math.floor(Math.random() * 400_000) * 10;
const บริษัท = () => `ZZTEST หน้าต่าง ${ส.รหัส}`;
test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const sd = await db(ส.บัญชี);
  expect((await sd.from("leads").insert({ id: `#L-${เลขลีด}`, num_id: เลขลีด, dealer_code: ส.รหัส, company: บริษัท(), name: บริษัท(),
    contact: "ผู้ทดสอบ", phone: "000-000-0202", province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด })).error, "ลูกค้าเป้าหมายของข้อ").toBeNull();
  expect((await sd.rpc("quote_request_submit", { p_lead_num_id: เลขลีด, p_product: "โกดัง" })).error, "ส่งคำขอ").toBeNull();
  const sb = await db(ADMIN);
  const { data: pr, error } = await sb.from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: NS, province: "ขอนแก่น", status: "considering" }).select("id").single();
  expect(error?.message ?? "").toBe("");
  const ins = await sb.from("dealer_package_proposals").insert({ prospect_id: (pr as { id: number }).id, status: "draft", amount: 100_000, contract_months: 12, annual_target: 1_000_000,
    region: "อีสาน", province: "ขอนแก่น", proposed_date: new Date().toISOString().slice(0, 10), valid_until: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), terms: "ZZTEST เงื่อนไข", note: null }).select("proposal_no").single();
  expect(ins.error?.message ?? "").toBe("");
  เลขใบค่า = (ins.data as { proposal_no: string }).proposal_no;
});
test.afterAll(async () => {
  const sb = await db(ADMIN); await sb.from("dealer_prospects").delete().eq("name", NS);
  if (ส) { ล้างใบHQทดสอบ(ส.รหัส, [เลขลีด]); await ส.ลบ(); }
});

async function วัด(page: Page, ตัว: Locator, ชื่อ: string, พอดี: boolean) {
  await expect(ตัว, `${ชื่อ}: เปิดอยู่`).toBeVisible({ timeout: 25_000 });
  await ตัว.evaluate(e => Promise.all(e.getAnimations({ subtree: false }).map(a => a.finished)));
  const ก = (await ตัว.boundingBox())!;
  const จอ = page.viewportSize()!;
  if (พอดี) expect(Math.round(ก.width), `${ชื่อ}: หน้าต่างเอกสารกว้าง ${ค่ากลาง} (ค่ากลาง)`).toBe(ค่ากลาง);
  else expect(Math.round(ก.width), `${ชื่อ}: ไม่เกิน ${ค่ากลาง}`).toBeLessThanOrEqual(ค่ากลาง);
  expect(Math.abs(ก.x - (จอ.width - ก.x - ก.width)), `${ชื่อ}: อยู่กลางจอแนวนอน`).toBeLessThanOrEqual(2);
  expect(await ตัว.evaluate(e => [e as HTMLElement, ...e.querySelectorAll<HTMLElement>("*")].filter(x => x.offsetParent !== null && getComputedStyle(x).overflowX !== "visible" && x.scrollWidth > x.clientWidth + 1 && x.clientWidth > 200).length),
    `${ชื่อ}: ไม่มีแถบเลื่อนแนวนอนในหน้าต่าง`).toBe(0);
}

test("[ui·hq] หน้าต่างกลางจอ HQ: เอกสาร = 820 · เจาะลึก/ฟอร์ม/นำเข้า ≤ 820 · หน้าต่างทำใบ HQ กริด 2 คอลัมน์ ช่องรายการกว้างสุด", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  // ใบเสนอราคาทั้งเครือ (QuotationDrawer)
  await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByRole("table", { name: "รายการใบเสนอราคา" }).locator("tbody tr").first().getByRole("button").last().click();
  await วัด(page, page.getByRole("dialog", { name: "รายละเอียดใบเสนอราคา" }), "ใบเสนอราคา HQ", true);
  await page.keyboard.press("Escape");
  // ใบ HQ ทำใบ (หน้าคำขอใบเสนอราคา · คำขอของข้อในแท็บต้องตีราคา)
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" }); await settle(page);
  const { ใบ: ใบHQ } = await เปิดใบHQในกล่องงาน(page, บริษัท());
  await วัด(page, ใบHQ, "ใบ HQ (ทำใบ)", true);
  for (const g of ["customer", "job"]) {
    const คอลัมน์ = await ใบHQ.locator(`[data-group='${g}']`).evaluate(e => getComputedStyle(e).gridTemplateColumns.split(" ").length);
    expect(คอลัมน์, `ใบ HQ: ข้อมูล ${g} กริด 2 คอลัมน์`).toBe(2);
  }
  const หัว = await ใบHQ.locator("table thead th").evaluateAll(ths => ths.map(th => ({ t: (th.textContent ?? "").trim(), w: Math.round(th.getBoundingClientRect().width) })));
  const รายการ = หัว.find(h => h.t === "รายการ")!;
  expect(หัว.filter(h => h.t && h.t !== "รายการ").every(h => h.w < รายการ.w), `ใบ HQ: ช่องรายการกว้างสุด ${JSON.stringify(หัว)}`).toBe(true);
  await page.keyboard.press("Escape");
  // ใบค่าแฟรนไชส์
  await page.goto(`${HQ_ORIGIN}/hq/proposals`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByLabel("ค้นหาใบค่าแฟรนไชส์").fill(NS);
  await page.getByRole("button", { name: `ดูใบ ${เลขใบค่า}`, exact: true }).click();
  await วัด(page, page.getByRole("dialog", { name: "รายละเอียดใบค่าแฟรนไชส์" }), "ใบค่าแฟรนไชส์", true);
  await page.keyboard.press("Escape");
  // นำเข้าผู้สนใจ (เดิม 1080) · ฟอร์มเพิ่มผู้สนใจ — ≤ 820
  await page.goto(`${HQ_ORIGIN}/hq/prospects`, { waitUntil: "domcontentloaded" }); await settle(page);
  // หน้าต่างนำเข้าผู้สนใจ: เมนูนำเข้า › "ชุดที่นำเข้าล่าสุด" (เปิดหน้าต่างเดียวกันโดยไม่ต้องเลือกไฟล์)
  await page.getByRole("button", { name: "นำเข้าจากไฟล์" }).first().click();
  await page.getByText("ชุดที่นำเข้าล่าสุด").first().click();
  const นำเข้า = page.locator("[role='dialog'][aria-modal='true']").last();
  await วัด(page, นำเข้า, "นำเข้าผู้สนใจ", false);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "เพิ่มผู้สนใจ" }).first().click();
  await วัด(page, page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" }), "ฟอร์มเพิ่มผู้สนใจ", false);
  await page.keyboard.press("Escape");
  // หน้าต่างเจาะลึก (กดการ์ด)
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.locator("[data-kpi-row] [data-kpi]").first().click();
  await วัด(page, page.locator("[data-drill-window]").first(), "หน้าต่างเจาะลึก", false);
});

test("[ui·dealer] หน้าต่างกลางจอดีลเลอร์: ใบเสนอราคา + งานในแผงลูกค้า = 820", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.locator(".content tbody tr").first().locator("td").first().click();
  await วัด(page, page.locator("[data-quote-view]").first(), "ใบเสนอราคา ดีลเลอร์", true);
  await page.keyboard.press("Escape");
  // งานในแผงลูกค้า: ลูกค้าที่มีงานปิดการขาย (การ์ดงาน) → หน้าต่างงาน · คอลัมน์เดียว แถบสรุปบน · ไม่เลื่อนแนวนอนที่ 1920 และ 1366 (บอสตอบ 10 พ.ย. 69)
  for (const w of [1920, 1366]) {
    await page.setViewportSize({ width: w, height: w === 1920 ? 1080 : 768 });
    await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
    const แผง = page.locator("[data-row-panel]");
    await expect(แผง).toBeVisible({ timeout: 20_000 });
    const การ์ดงาน = แผง.locator("button[title]").filter({ hasText: /Q-|฿/ }).first();
    await expect(การ์ดงาน, "ลูกค้ามีงานปิดการขาย (ข้อมูลตั้งต้น)").toBeVisible({ timeout: 20_000 });
    await การ์ดงาน.click();
    const งาน = page.locator("[data-doc-window='customer-job']");
    await วัด(page, งาน, `งานในแผงลูกค้าดีลเลอร์ @${w}`, true);
    await expect(งาน.locator("[data-doc-summary] [data-summary-item]"), "แถบสรุปบน 4 ช่อง (สถานะ · วันที่ซื้อ · พื้นที่ · มูลค่างาน)").toHaveCount(4);
    await page.keyboard.press("Escape");
  }
});
