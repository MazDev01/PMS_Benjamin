import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason, type Account } from "./supabaseEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";

// ── ล็อกความกว้างคอลัมน์ตารางทุกหน้า (บอสสั่ง 10 พ.ย. 69 · HQ + ดีลเลอร์) ─────────────────────────────────────────────
//   ความกว้างคอลัมน์ตายตัวเป็น % ของตาราง ไม่ขึ้นกับข้อมูล → เปลี่ยนหน้า / ค้นหา / เลือกภูมิภาค แล้วหัวคอลัมน์อยู่ตำแหน่งเดิมเป๊ะ
//   ข้อความที่ถูกตัดด้วย … ชี้แล้วเห็นเต็ม (ตัวกลาง useTruncatedTitles) · ยังพอดีจอ 1366 (ไม่มีแถบเลื่อนแนวนอน)
//   ตกบนโค้ดเดิม: ภาพรวมยอดขาย/คำขอใบเสนอราคา คอลัมน์ชื่อกว้างตามชื่อยาวสุดในหน้านั้น (หน้า 2 ≠ หน้า 1)
//     · ซ่อนคอลัมน์ว่าง · เลือกภูมิภาคแล้วคอลัมน์ภูมิภาคหาย (ลูกค้าทั้งเครือ)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(420_000);

type ตั้ง = { path: string; ตาราง: string; ภูมิภาค?: string; ก่อน?: (p: Page) => Promise<void> };
const HQ: ตั้ง[] = [
  { path: "/hq/pipeline", ตาราง: "ตารางผลงานดีลเลอร์", ภูมิภาค: "ทุกภูมิภาค" },
  { path: "/hq/leads", ตาราง: "ตารางลูกค้าเป้าหมายทั้งเครือ", ภูมิภาค: "ภูมิภาค" },
  { path: "/hq/quotations", ตาราง: "รายการใบเสนอราคา", ภูมิภาค: "ภูมิภาค" },
  { path: "/hq/customers", ตาราง: "รายชื่อลูกค้า", ภูมิภาค: "ภูมิภาค" },
  { path: "/hq/quote-requests", ตาราง: "ตารางคำขอใบเสนอราคา", ก่อน: async p => { await p.locator("[data-view-tab='history']").click(); } },
];
const ดีลเลอร์: ตั้ง[] = [
  { path: "/leads", ตาราง: "", ก่อน: async p => { await p.getByRole("button", { name: "ตาราง", exact: true }).click(); } },
  { path: "/quotations", ตาราง: "" },
  { path: "/customers", ตาราง: "" },
];

/** ตำแหน่ง/ความกว้างหัวคอลัมน์ (เทียบขอบซ้ายตาราง · ปัดเป็นพิกเซล) */
const ตำแหน่งหัว = (page: Page, ชื่อ: string) => page.evaluate((ชื่อ) => {
  const t = (ชื่อ ? document.querySelector(`table[aria-label="${ชื่อ}"]`) : document.querySelector(".content .table-wrap table")) as HTMLTableElement | null;
  if (!t) return null;
  const ซ้าย = t.getBoundingClientRect().left;
  return [...t.querySelectorAll("thead th")].map(th => { const r = th.getBoundingClientRect(); return `${Math.round(r.left - ซ้าย)}+${Math.round(r.width)}`; });
}, ชื่อ);
const ล้นจอ = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function ตรวจหน้า(page: Page, origin: string, h: ตั้ง) {
  await page.goto(`${origin}${h.path}`, { waitUntil: "domcontentloaded" });
  await settle(page);
  if (h.ก่อน) { await h.ก่อน(page); await settle(page); }
  const ตาราง = h.ตาราง ? page.getByRole("table", { name: h.ตาราง }) : page.locator(".content .table-wrap table").first();
  await expect(ตาราง.locator("tbody tr").first(), `${h.path}: มีแถว`).toBeVisible({ timeout: 30_000 });
  await settle(page);
  const ตั้งต้น = await ตำแหน่งหัว(page, h.ตาราง);
  expect(ตั้งต้น?.length, `${h.path}: มีหัวคอลัมน์`).toBeGreaterThan(1);
  expect(await ล้นจอ(page), `${h.path}: พอดีจอ ไม่มีแถบเลื่อนแนวนอน`).toBeLessThanOrEqual(1);

  // 1) หน้า 2 (ถ้ามี) — หัวคอลัมน์ตำแหน่งเดิม
  const แถบหน้า = ตาราง.locator("xpath=ancestor::*[.//button[normalize-space()='ถัดไป']][1]").getByRole("button", { name: "ถัดไป" }).first();
  if (await แถบหน้า.count() && await แถบหน้า.isEnabled()) {
    await แถบหน้า.click();
    await settle(page);
    expect(await ตำแหน่งหัว(page, h.ตาราง), `${h.path}: หน้า 2 หัวคอลัมน์ตำแหน่งเดียวกับหน้า 1`).toEqual(ตั้งต้น);
    await page.goto(`${origin}${h.path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    if (h.ก่อน) { await h.ก่อน(page); await settle(page); }
  }
  // 2) ค้นหา (คำจากแถวแรก — เหลือแถวน้อยลง) — หัวคอลัมน์ตำแหน่งเดิม
  const ช่องค้น = page.locator(".content").getByPlaceholder(/ค้นหา/).first();
  if (await ช่องค้น.count()) {   // ไม่ใช่การข้าม: บางหน้าไม่มีช่องค้นหา (ข้อตรวจหลักรันทุกหน้า)
    const คำ = ((await ตาราง.locator("tbody tr").first().locator("td").first().innerText()).split(/\s+/).find(w => w.length >= 3) ?? "ZZ").slice(0, 12);
    await ช่องค้น.fill(คำ);
    await settle(page);
    expect(await ตำแหน่งหัว(page, h.ตาราง), `${h.path}: ค้นหา "${คำ}" แล้วหัวคอลัมน์ตำแหน่งเดิม`).toEqual(ตั้งต้น);
    await ช่องค้น.fill("ไม่มีทางเจอ-คำค้นทดสอบ-zz9");
    await settle(page);
    // ค้นไม่เจอ: หน้าที่ยังแสดงตาราง (แถว "ไม่พบ") หัวคอลัมน์ต้องอยู่ที่เดิม · หน้าที่เปลี่ยนเป็นกล่องว่างทั้งกล่อง (ลูกค้าดีลเลอร์) ไม่มีหัวให้วัด
    const ไม่เจอ = await ตำแหน่งหัว(page, h.ตาราง);
    if (ไม่เจอ) expect(ไม่เจอ, `${h.path}: ค้นไม่เจอ (ไม่มีแถว) หัวคอลัมน์ตำแหน่งเดิม`).toEqual(ตั้งต้น);
    await ช่องค้น.fill("");
    await settle(page);
  }
  // 3) เลือกภูมิภาค (ระดับเจาะ) — ภูมิภาค/จังหวัดไม่ซ่อน หัวคอลัมน์ตำแหน่งเดิม (ซ่อนเฉพาะดีลเลอร์ตอนเจาะถึงดีลเลอร์)
  if (h.ภูมิภาค) {
    const s = page.getByLabel(h.ภูมิภาค, { exact: true }).first();
    const ค่า = await s.locator("option").nth(1).getAttribute("value");
    await s.selectOption(ค่า!);
    await settle(page);
    await expect(ตาราง.locator("thead th").first()).toBeVisible();
    expect(await ตำแหน่งหัว(page, h.ตาราง), `${h.path}: เลือกภูมิภาคแล้วหัวคอลัมน์ตำแหน่งเดิม`).toEqual(ตั้งต้น);
  }
}

for (const [แอป, origin, path, who, หน้า] of [
  ["HQ", HQ_ORIGIN, "/hq/login", ADMIN, HQ],
  ["ดีลเลอร์", DEALER_ORIGIN, "/login", RYG, ดีลเลอร์],
] as [string, string, string, Account, ตั้ง[]][]) {
  test(`[ui·${แอป}] ล็อกความกว้างคอลัมน์: เปลี่ยนหน้า / ค้นหา / เลือกภูมิภาค แล้วหัวคอลัมน์ตำแหน่งเดิม · พอดีจอ 1366`, async ({ page }) => {
    const errs = watchErrors(page);
    await page.setViewportSize({ width: 1366, height: 900 });
    await loginUI(page, origin, path, who);
    for (const h of หน้า) await ตรวจหน้า(page, origin, h);
    assertNoErrors(errs, `ล็อกความกว้างคอลัมน์ ${แอป}`);
  });
}

test("[ui·hq] ข้อความในตารางที่ถูกตัดด้วย … ชี้แล้วเห็นข้อความเต็ม (ตัวกลาง)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/dealers?view=table`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แถว = page.locator("tbody tr[aria-label^='เปิดแผงดีลเลอร์']");
  await expect(แถว.first()).toBeVisible({ timeout: 20_000 });
  // บังคับให้ชื่อยาวกว่าช่อง (ชื่อดีลเลอร์ในคอลัมน์ 12%) แล้วชี้ → title = ข้อความเต็ม
  const ช่อง = แถว.first().locator("td[data-col='name']");
  await ช่อง.evaluate(td => { td.removeAttribute("title"); const s = td.querySelector("span") as HTMLElement; s.textContent = "ZZTEST ชื่อยาวมาก ".repeat(6).trim(); });
  expect(await ช่อง.evaluate(td => td.scrollWidth > td.clientWidth + 1), "ชื่อยาวถูกตัด").toBe(true);
  await ช่อง.hover();
  await expect(ช่อง, "ชี้แล้วเห็นข้อความเต็ม").toHaveAttribute("title", "ZZTEST ชื่อยาวมาก ".repeat(6).trim());
});
