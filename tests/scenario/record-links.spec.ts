import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, db, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ข้อมูลงานครบชุด, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

// ── ทุกชื่อ/เลขที่ที่อ้างถึงข้อมูลอื่นกดเข้าไปดูได้ (บอสสั่ง 11 พ.ย. 69 · ลิงก์กลาง components/ui/RecordLink.tsx) ─────────────
//   1) HQ หน้าหลัก: ชื่อดีลเลอร์ (ลูกค้าเป้าหมาย · ลูกค้า · ใบเสนอราคา · คำขอ) · ชื่อลูกค้าเป้าหมายในคำขอ · ชื่อผู้สนใจในใบค่าแฟรนไชส์ = ลิงก์กลาง
//      หน้าตาเดียวกัน (สีน้ำเงิน · ขีดเส้นใต้ตอนชี้ · รูปมือ) · กดลิงก์ในแถว = เปิดตัวที่ลิงก์ ไม่เปิดแผงแถวซ้อน
//   2) แผงอยู่ในที่อยู่หน้าเว็บ: แผง A → ลิงก์ → แผง B → ย้อนกลับ = แผง A (ถอยทีละชั้น · บนจอมีแผงเดียว)
//      คำขอ (สาขาของข้อ) → ลูกค้าเป้าหมาย → ดีลเลอร์ → ย้อน = ลูกค้าเป้าหมาย → ย้อน = คำขอ
//   3) ดีลเลอร์: ใบเสนอราคา → ลิงก์ลูกค้าในหน้าต่างใบ → แผงลูกค้าเป้าหมาย → ย้อน = หน้าต่างใบเดิม
//      ไม่มีลิงก์ข้ามสาขา/ไปหน้า HQ (ชนิดที่มีได้: ลูกค้า · ลูกค้าเป้าหมาย · ใบ · คำขอ/ใบ HQ ของสาขาตัวเอง) · ตรรกะปลายทาง: tests/unit/recordLinks.test.ts
//   ตกบนโค้ดเดิม: ไม่มีลิงก์กลาง (a.rec-link) · ปิดแผงแล้วล้าง ?open ทิ้ง ย้อนกลับไม่ได้แผงคืน
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const admin = adminClient();
let ส: สาขาของข้อ;
const เลขลีด = 1_970_000_000 + Math.floor(Math.random() * 400_000) * 10;
const รหัสลีด = () => `#L-${40321 + เลขลีด}`;   // รูปแบบรหัสตามเลข (ใบ 0036)
const บริษัท = () => `ZZTEST ลิงก์ ${ส.รหัส}`;

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก", ชื่อ: "ZZTEST สาขาลิงก์ (ลบทิ้ง)" });
  const sd = await db(ส.บัญชี);
  expect((await sd.from("leads").insert({ id: รหัสลีด(), num_id: เลขลีด, dealer_code: ส.รหัส, company: บริษัท(), name: บริษัท(),
    contact: "ผู้ทดสอบ", phone: "000-000-0303", province: "ตราด", status: "BULLET", ...ข้อมูลงานครบชุด })).error, "ลูกค้าเป้าหมายของข้อ").toBeNull();
  expect((await sd.rpc("quote_request_submit", { p_lead_num_id: เลขลีด, p_product: "โกดัง" })).error, "ส่งคำขอ").toBeNull();
});
test.afterAll(async () => { if (ส) { ล้างใบHQทดสอบ(ส.รหัส, [เลขลีด]); await ส.ลบ(); } });

/** ทุกเซลล์ที่เลือกมีลิงก์กลางของชนิดนั้น (นับเท่ากัน) · หน้าตาเดียวกัน */
async function ทุกเซลล์เป็นลิงก์(page: Page, เซลล์: string, ชนิด: string, ชื่อ: string) {
  const ช่อง = page.locator(เซลล์);
  await expect(ช่อง.first(), `${ชื่อ}: มีแถว`).toBeVisible({ timeout: 30_000 });
  const n = await ช่อง.count();
  await expect(page.locator(`${เซลล์} a.rec-link[data-rec='${ชนิด}']`), `${ชื่อ}: ทุกแถวเป็นลิงก์ (${n})`).toHaveCount(n);
  const ลิงก์ = page.locator(`${เซลล์} a.rec-link`).first();
  const สี = await ลิงก์.evaluate(e => getComputedStyle(e).color);
  expect(สี, `${ชื่อ}: สีน้ำเงิน`).toBe("rgb(29, 78, 216)");
  expect(await ลิงก์.evaluate(e => getComputedStyle(e).cursor), `${ชื่อ}: รูปมือ`).toBe("pointer");
  await ลิงก์.hover();
  await expect.poll(() => ลิงก์.evaluate(e => getComputedStyle(e).textDecorationLine), { message: `${ชื่อ}: ขีดเส้นใต้ตอนชี้` }).toContain("underline");
}

test("[HQ] ชื่อดีลเลอร์/ลูกค้าเป้าหมาย/ผู้สนใจในหน้าหลักเป็นลิงก์กลาง · กดในแถว = เปิดตัวที่ลิงก์ ไม่เปิดแผงแถว", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
  await settle(page);
  await ทุกเซลล์เป็นลิงก์(page, "tbody [data-cell='dealer']", "dealer", "/hq/leads ดีลเลอร์");
  // กดชื่อดีลเลอร์ในแถว → แผงดีลเลอร์นั้น (ไม่ใช่แผงลูกค้าเป้าหมายของแถว)
  const ลิงก์แรก = page.locator("tbody [data-cell='dealer'] a.rec-link").first();
  const รหัส = (await ลิงก์แรก.getAttribute("data-rec-id"))!;
  await ลิงก์แรก.click();
  await expect(page).toHaveURL(new RegExp(`/hq/dealers\\?open=${รหัส}$`), { timeout: 30_000 });
  await expect(page.locator(`[data-dealer-panel='${รหัส}']`), "เปิดแผงดีลเลอร์ตัวที่กด").toBeVisible({ timeout: 30_000 });
  await expect(page.locator("aside[aria-label^='ลูกค้าเป้าหมาย']"), "ไม่เปิดแผงแถวซ้อน").toHaveCount(0);

  for (const [path, เซลล์, ชนิด] of [
    ["/hq/customers", "tbody td[data-col='dealer']", "dealer"],
    ["/hq/quotations", "tbody [data-col='dealer']", "dealer"],
    ["/hq/quote-requests", "tbody tr td:nth-child(2)", "dealer"],
    ["/hq/proposals", "tbody tr td:nth-child(2)", "prospect"],
  ] as const) {
    await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    // ไม่มีแถว = ตก (ข้อมูลตั้งต้นมีใบค่าแฟรนไชส์ตัวอย่าง · บอสสั่ง 11 พ.ย. 69 ห้ามข้ามเอง) — ทุกเซลล์เป็นลิงก์() รอแถวแรกก่อนนับ
    await ทุกเซลล์เป็นลิงก์(page, เซลล์, ชนิด, `${path} ${ชนิด}`);
  }
  // ใบเสนอราคา: ชื่อลูกค้าที่ผูกลูกค้า/ลูกค้าเป้าหมายเป็นลิงก์ (ไม่ผูก = ข้อความ)
  await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("tbody [data-col='customer'] a.rec-link").first(), "/hq/quotations: ชื่อลูกค้าเป็นลิงก์").toBeVisible({ timeout: 30_000 });
});

test("[HQ] แผงอยู่ในที่อยู่หน้าเว็บ: คำขอ → ลูกค้าเป้าหมาย → ดีลเลอร์ · ย้อนกลับถอยทีละชั้น", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/quote-requests", ADMIN);
  await settle(page);
  const แถว = page.locator("tbody tr").filter({ hasText: บริษัท() });
  await expect(แถว, "คำขอของสาขาของข้อ").toHaveCount(1, { timeout: 30_000 });
  // ชั้น 1: กดที่ว่างของแถว = หน้าต่างคำขอ (อยู่ในที่อยู่)
  await แถว.locator("td").first().click();
  await expect(page).toHaveURL(/\/hq\/quote-requests\?open=\d+/, { timeout: 30_000 });
  const ที่อยู่คำขอ = page.url();
  await expect(page.getByRole("dialog", { name: "ใบ HQ" })).toBeVisible({ timeout: 30_000 });
  // หัวหน้าต่างพื้นเข้ม = ลิงก์แบบพื้นเข้ม (สีขาว ขีดเส้นใต้ · บอสสั่ง 11 พ.ย. 69) — ชื่อดีลเลอร์ + ลูกค้าเป้าหมาย
  const ลิงก์หัว = page.getByRole("dialog", { name: "ใบ HQ" }).locator("a.rec-link.rec-link-dark");
  await expect(ลิงก์หัว, "หัวหน้าต่าง: ดีลเลอร์ + ลูกค้าเป้าหมาย เป็นลิงก์พื้นเข้ม").toHaveCount(2);
  expect(await ลิงก์หัว.first().evaluate(e => getComputedStyle(e).color), "พื้นเข้ม: สีขาว").toBe("rgb(255, 255, 255)");
  expect(await ลิงก์หัว.first().evaluate(e => getComputedStyle(e).textDecorationLine), "พื้นเข้ม: ขีดเส้นใต้ตลอด").toContain("underline");
  // ชั้น 2: ลิงก์ลูกค้าเป้าหมายในหน้าต่าง → แผงลูกค้าเป้าหมาย HQ
  await page.getByRole("dialog", { name: "ใบ HQ" }).locator(`a.rec-link[data-rec='lead']`).first().click();
  await expect(page).toHaveURL(/\/hq\/leads\?open=/, { timeout: 30_000 });
  const แผงลีด = page.locator(`aside[aria-label='ลูกค้าเป้าหมาย ${บริษัท()}']`);
  await expect(แผงลีด, "แผงลูกค้าเป้าหมายตัวที่กด").toBeVisible({ timeout: 30_000 });
  // ชั้น 3: ลิงก์ดีลเลอร์ในแผง → แผงดีลเลอร์ (บนจอมีแผงเดียว)
  await แผงลีด.locator("a.rec-link[data-rec='dealer']:not(.rec-link-dark)").click();   // แถวข้อมูลในแผง (หัวแผงพื้นเข้มมีอีกตัว · ตรวจแยกในข้อบน)
  await expect(page).toHaveURL(new RegExp(`/hq/dealers\\?open=${ส.รหัส}$`), { timeout: 30_000 });
  await expect(page.locator(`[data-dealer-panel='${ส.รหัส}']`)).toBeVisible({ timeout: 30_000 });
  await expect(แผงลีด, "บนจอมีแผงเดียว").toHaveCount(0);
  // ย้อนกลับ = แผงลูกค้าเป้าหมาย · ย้อนอีก = หน้าต่างคำขอเดิม
  await page.goBack();
  await expect(page).toHaveURL(/\/hq\/leads\?open=/, { timeout: 30_000 });
  await expect(แผงลีด, "ย้อนกลับ = แผงก่อนหน้า").toBeVisible({ timeout: 30_000 });
  await page.goBack();
  await expect(page).toHaveURL(ที่อยู่คำขอ, { timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "ใบ HQ" }), "ย้อนอีกชั้น = หน้าต่างคำขอเดิม").toBeVisible({ timeout: 30_000 });
});

test("[ดีลเลอร์] หน้าต่างใบ → ลิงก์ลูกค้า → แผงลูกค้าเป้าหมาย → ย้อนกลับ = หน้าต่างใบเดิม · ไม่มีลิงก์ข้ามสาขา/หน้า HQ", async ({ page }) => {
  // ใบของ RYG ที่ผูกลูกค้าเป้าหมาย (ยังไม่ผูกลูกค้า) — ลิงก์ชื่อลูกค้าไปแผงลูกค้าเป้าหมาย
  const { data: ใบ } = await admin.from("quotations").select("id, deal_id, customer_id").eq("dealer_code", "RYG").not("deal_id", "is", null)
    .or("customer_id.is.null,customer_id.eq.0").neq("status", "superseded").order("id").limit(1);
  const q = ใบ?.[0] as { id: string; deal_id: number } | undefined;
  expect(q, "ข้อมูลตั้งต้นมีใบของ RYG ที่ผูกลูกค้าเป้าหมาย").toBeTruthy();
  const { data: ลีด } = await admin.from("leads").select("company, status").eq("dealer_code", "RYG").eq("num_id", q!.deal_id).single();

  await loginUI(page, DEALER_ORIGIN, `/quotations?open=${encodeURIComponent(q!.id)}`, RYG);
  const หน้าต่าง = page.locator(`[data-quote-view='${q!.id}']`);
  await expect(หน้าต่าง, "เปิดหน้าต่างใบจากที่อยู่").toBeVisible({ timeout: 30_000 });
  const ลิงก์ = หน้าต่าง.locator("[data-quote-customer] a.rec-link[data-rec='lead']");
  await expect(ลิงก์).toHaveAttribute("href", `/leads?open=${q!.deal_id}`);
  await ลิงก์.click();
  if ((ลีด as { status: string }).status === "PAID") await expect(page).toHaveURL(/\/customers\?open=/, { timeout: 30_000 });
  else {
    await expect(page).toHaveURL(new RegExp(`/leads\\?open=${q!.deal_id}`), { timeout: 30_000 });
    await expect(page.getByText((ลีด as { company: string }).company).first()).toBeVisible({ timeout: 30_000 });
  }
  await expect(หน้าต่าง, "บนจอมีแผง/หน้าต่างเดียว").toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/quotations\\?open=${encodeURIComponent(q!.id)}`), { timeout: 30_000 });
  await expect(หน้าต่าง, "ย้อนกลับ = หน้าต่างใบเดิม").toBeVisible({ timeout: 30_000 });

  // ไม่มีลิงก์ข้ามสาขา/ไปหน้า HQ — ทุกลิงก์กลางบนหน้าหลักของดีลเลอร์
  for (const path of ["/quotations", "/leads", "/customers", "/files", "/dashboard"]) {
    await page.goto(`${DEALER_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const ลิงก์ทั้งหมด = await page.locator("a.rec-link").evaluateAll(es => es.map(e => ({ href: e.getAttribute("href") ?? "", ชนิด: e.getAttribute("data-rec") ?? "" })));
    for (const l of ลิงก์ทั้งหมด) {
      expect(l.href, `${path}: ลิงก์ไปหน้าของสาขาตัวเองเท่านั้น`).toMatch(/^\/(customers|leads|quotations)\?open=/);
      expect(["customer", "lead", "quotation", "request", "hqQuote"], `${path}: ไม่มีลิงก์ดีลเลอร์/ผู้สนใจ/ใบค่าแฟรนไชส์`).toContain(l.ชนิด);
    }
    if (path === "/quotations") expect(ลิงก์ทั้งหมด.length, "/quotations: ชื่อลูกค้าเป็นลิงก์กลาง").toBeGreaterThan(0);
  }
});
