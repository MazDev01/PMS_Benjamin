// ── หัวแผง: ปุ่มปิดอยู่มุมขวาบนเสมอ ไม่ตกบรรทัดใหม่เมื่อข้อมูลหัวแผงยาว (บอสสั่ง 3 พ.ย. 69 "กากบาทมันตกลงมา") ─────────────────
//   แผงลูกค้า (ดีลเลอร์ · ข้อมูลจริงอีเมลยาว) · แผงลีด (ดีลเลอร์ · อีเมลยาว) · แผงใบเสนอราคา · แผงลูกค้า/ดีลเลอร์/ผู้สนใจ/ใบค่าแฟรนไชส์ (HQ)
//   แผงที่ไม่มีข้อมูลยาวในชุดทดสอบ: เติมข้อความยาวลงพื้นที่ข้อมูลของหัวแผงในหน้า แล้ววัดตำแหน่งปุ่ม (ตรวจโครงหัวแผง ไม่ใช่ข้อมูล)
//   วัด: ปุ่มสุดท้ายของหัวแผง (ปิด) ขอบบนอยู่ระดับเดียวกับบรรทัดแรกของหัวแผง และชิดขวา · จอกว้าง + มือถือ 390px
//   ตกบนโค้ดเดิม: แผงลูกค้าดีลเลอร์ + แผงลีด (หัวแผงขึ้นบรรทัดใหม่เมื่อข้อมูลยาว) · ใบเสนอราคา · ผู้สนใจ · ใบค่าแฟรนไชส์
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ช่องผู้สนใจครบ, ช่องใบครบ } from "./requiredFixtures";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

let ส: สาขาของข้อ;
const อีเมลยาว = "phongsakorn.wongsawat.procurement.department.northern.region@very-long-company-domain-example.test";
const บริษัท = () => `ZZTEST หัวแผงยาว ${ส.รหัส} บริษัท ยอดย้อนหลังและวัสดุก่อสร้างภาคตะวันออก จำกัด`;
const เลข = 1_975_000_000 + Math.floor(Math.random() * 400_000) * 10;

test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const sb = await db(ส.บัญชี);
  const c = await sb.from("customers").insert({ id: เลข, dealer_code: ส.รหัส, name: "คุณผู้ติดต่อชื่อยาวมากสำหรับทดสอบ", company: บริษัท(), province: "ตราด",
    phone: "000-000-0301", email: อีเมลยาว, join_date: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) });
  expect(c.error, "สร้างลูกค้าของข้อ").toBeNull();
  const l = await sb.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: ส.รหัส, company: บริษัท(), name: บริษัท(), contact: "คุณผู้ติดต่อ",
    phone: "000-000-0302", email: อีเมลยาว, province: "ตราด", status: "BULLET" });
  expect(l.error, "สร้างลีดของข้อ").toBeNull();
});
const ชื่อผู้สนใจ = () => `ZZTEST-ผู้สนใจหัวแผง-${ส.รหัส}`;
test.afterAll(async () => {
  if (ส) await (await db(ADMIN)).from("dealer_prospects").delete().eq("name", ชื่อผู้สนใจ());
  await ส?.ลบ();
});

/** วัดหัวแผงที่เปิดอยู่: ปุ่มสุดท้าย (ปิด) อยู่บรรทัดแรก มุมขวาบน · เติมข้อความยาว = แผงที่ข้อมูลจริงไม่ยาว */
async function ตรวจหัวแผง(page: Page, ที่: string, เติมข้อความยาว = false) {
  const หัว = page.locator("[data-panel-head]").last();
  await expect(หัว, `${ที่}: มีหัวแผง`).toBeVisible({ timeout: 20_000 });
  if (เติมข้อความยาว) await หัว.evaluate((el, t) => { const d = document.createElement("div"); d.textContent = t; d.style.fontSize = "0.72rem"; el.firstElementChild?.appendChild(d); }, `${อีเมลยาว} · ${อีเมลยาว}`);
  const ผล = await หัว.evaluate(el => {
    const h = el.getBoundingClientRect(), b = (el.lastElementChild as HTMLElement).getBoundingClientRect(), a = (el.firstElementChild as HTMLElement).getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(el).paddingRight) || 0, padTop = parseFloat(getComputedStyle(el).paddingTop) || 0;
    return { ปุ่มบน: b.top - h.top - padTop, ปุ่มขวา: h.right - pad - b.right, ข้อมูลบน: a.top - h.top - padTop, ข้อมูลขวา: a.right, ปุ่มซ้าย: b.left };
  });
  expect(ผล.ปุ่มบน, `${ที่}: ปุ่มปิดอยู่บรรทัดแรกของหัวแผง (ไม่ตกบรรทัด · ${JSON.stringify(ผล)})`).toBeLessThanOrEqual(ผล.ข้อมูลบน + 8);
  expect(Math.abs(ผล.ปุ่มขวา), `${ที่}: ปุ่มปิดชิดขวา`).toBeLessThanOrEqual(2);
  expect(ผล.ข้อมูลขวา, `${ที่}: ข้อมูลไม่ทับปุ่ม`).toBeLessThanOrEqual(ผล.ปุ่มซ้าย);
}

for (const [จอ, ขนาด] of [["จอกว้าง", { width: 1440, height: 900 }], ["มือถือ", { width: 390, height: 844 }]] as const) {
  test(`[ui·dealer] ${จอ}: แผงลูกค้า · แผงลีด · แผงใบเสนอราคา — ปุ่มปิดมุมขวาบนเมื่อข้อมูลหัวแผงยาว`, async ({ page }) => {
    await page.setViewportSize(ขนาด);
    await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
    await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(`หัวแผงยาว ${ส.รหัส}`);
    await page.getByText(บริษัท()).first().click({ timeout: 25_000 });
    await ตรวจหัวแผง(page, `${จอ} แผงลูกค้า (อีเมลยาวจริง)`);
    await page.keyboard.press("Escape");

    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(`หัวแผงยาว ${ส.รหัส}`);
    await page.locator("tbody tr").filter({ hasText: บริษัท() }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click({ timeout: 25_000 });
    await ตรวจหัวแผง(page, `${จอ} แผงลีด (อีเมลยาวจริง)`);
    await page.keyboard.press("Escape");

  });
  test(`[ui·dealer] ${จอ}: แผงใบเสนอราคา — ปุ่มปิดมุมขวาบนเมื่อข้อมูลหัวแผงยาว`, async ({ page }) => {
    await page.setViewportSize(ขนาด);
    // สาขาที่มีใบในข้อมูลตั้งต้น (สาขาของข้อยังไม่มีใบ) — เปิดดูอย่างเดียว ไม่เขียน
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: /^ดูใบ / }).first().click({ timeout: 25_000 });
    await ตรวจหัวแผง(page, `${จอ} แผงใบเสนอราคา`, true);
  });
}

test("[ui·hq] แผงลูกค้า · ดีลเลอร์ · ผู้สนใจ · ใบค่าแฟรนไชส์ — ปุ่มปิดมุมขวาบนเมื่อข้อมูลหัวแผงยาว", async ({ page }) => {
  // ข้อมูลตั้งต้นไม่มีผู้สนใจ → สร้างของข้อ 1 ราย (ลบท้ายไฟล์) ให้หน้าผู้สนใจมีแถวให้เปิด
  // + ใบค่าแฟรนไชส์ 1 ใบให้หน้าใบค่าแฟรนไชส์มีแถว (ลบผู้สนใจ = ใบหายตาม)
  const ผ = await (await db(ADMIN)).from("dealer_prospects").insert({ ...ช่องผู้สนใจครบ(), name: ชื่อผู้สนใจ(), status: "considering" }).select("id").single();
  expect(ผ.error, "สร้างผู้สนใจของข้อ").toBeNull();
  const ใบ = await (await db(ADMIN)).from("dealer_package_proposals").insert({ ...ช่องใบครบ(), prospect_id: (ผ.data as { id: number }).id, status: "sent",
    proposed_date: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) });
  expect(ใบ.error, "สร้างใบค่าแฟรนไชส์ของข้อ").toBeNull();
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  // แถวรายการของแต่ละหน้า (ป้ายแถวบอกว่ากดแล้วเปิดแผง) — ไม่ใช่แถวตารางเจาะลึกที่กดแล้วเจาะลง
  for (const [ที่, path, แถว] of [
    ["แผงลูกค้า HQ", "/hq/customers", /^เปิดรายละเอียดลูกค้า /],
    ["แผงดีลเลอร์", "/hq/dealers", /^เปิดแผงดีลเลอร์ /],
    ["แผงผู้สนใจ", "/hq/prospects", /^เปิดรายละเอียดผู้สนใจ /],
    ["แผงใบค่าแฟรนไชส์", "/hq/proposals", /^เปิดใบค่าแฟรนไชส์ /],
  ] as const) {
    await page.goto(`${HQ_ORIGIN}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const r = page.getByRole("row", { name: แถว }).first();
    await expect(r, `${ที่}: มีแถวให้เปิด`).toBeVisible({ timeout: 25_000 });
    await r.click();
    await ตรวจหัวแผง(page, ที่, true);
    await page.keyboard.press("Escape");
  }
});
