import { test, expect } from "@playwright/test";
import { open } from "./helpers";

// ─── Persona: UI Expert ───────────────────────────────────────────────────────
// "เลย์เอาต์แตกไหม · responsive ไหม · ไม่มี body เลื่อนแนวนอน · หัวข้อครบ"

const PAGES: [("hq" | "dealer"), string, string][] = [
  ["dealer", "/dashboard", "แดชบอร์ดดีลเลอร์"],
  ["dealer", "/leads", "ลูกค้าเป้าหมาย"],
  ["dealer", "/quotations", "ใบเสนอราคา"],
  ["hq", "/hq/dashboard", "แดชบอร์ด HQ"],
  ["hq", "/hq/pipeline", "ภาพรวมยอดขาย"],
  ["hq", "/hq/settings", "ตั้งค่า HQ"],
  ["hq", "/hq/audit", "บันทึกการใช้งาน"],
];

// เดสก์ท็อป: ไม่มี horizontal overflow
for (const [role, path, label] of PAGES) {
  test(`[ui·desktop] ${label} ไม่มี body เลื่อนแนวนอน`, async ({ page }) => {
    await open(page, role, path);
    await expect(page.locator("h1, h2, h3").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${label}: overflow ${overflow}px`).toBeLessThanOrEqual(3);
  });
}

// (ข้อ "KPI หน้าแม่แบบแสดงค่าครบ" ลบแล้ว 16 ต.ค. 69 — หน้า /hq/master ลบไปพร้อมการเอาแม่แบบออกทั้งระบบ)

// KPI ของ /hq/dealers ต้องเป็นดีไซน์เดียวกับหน้า HQ อื่น: .hq-kpi4 · ตัวเลขเข้ม (ไม่ใส่สี) + ไอคอน
// รอบ 4 (บอสสั่ง 22 ต.ค. 69 ข้อ 3): หน้านี้ไม่มีตัวเลขเงิน/ผลงานขาย — รายได้รวม · โอกาสการขายทั้งหมด · ติดตามตรงเวลา ต้องไม่มี
// การ์ด KPI 4 ใบ (บอสสั่ง 22 ต.ค. 69 · ใบ 0246 · ทับ "เหลือใบเดียว"): ดีลเลอร์ทั้งหมด · เปิดใช้งาน · มี/ไม่มีความเคลื่อนไหว 30 วัน — ไม่มียอดเงินสักใบ
test("[ui·hq] KPI หน้าดีลเลอร์ใช้มาตรฐาน .hq-kpi4 เหมือนหน้าอื่น (4 ใบ ไม่มีใบผลงานขาย ไม่มียอดเงิน)", async ({ page }) => {
  await open(page, "hq", "/hq/dealers");
  const tiles = page.locator(".hq-kpi4 > .card");
  await expect(tiles).toHaveCount(4);
  for (const ป้าย of ["ดีลเลอร์ทั้งหมด", "เปิดใช้งาน", "มีความเคลื่อนไหวใน 30 วัน", "ไม่เคลื่อนไหวเกิน 30 วัน"])
    await expect(page.locator(".hq-kpi4").getByText(ป้าย, { exact: true }), `มีการ์ด "${ป้าย}"`).toBeVisible();
  await expect(page.locator(".hq-kpi4"), "ไม่มียอดเงินในการ์ดหน้านี้").not.toContainText(/฿|บาท/);
  for (const เอาออก of ["รายได้รวม", "โอกาสการขายทั้งหมด", "ติดตามตรงเวลา"])
    await expect(page.locator(".hq-kpi4").getByText(เอาออก), `ใบ "${เอาออก}" เอาออกแล้ว (รอบ 4)`).toHaveCount(0);
  await expect(tiles.first().locator("svg")).toBeVisible();          // ไอคอนในกล่องสีจาง
  await expect(page.locator(".stat-card")).toHaveCount(0);            // ต้องไม่เหลือการ์ดแบบเก่า
});

// modal ต้องยึด viewport เต็มจอ (กันบั๊ก: แอนิเมชันหน้าเผลอใส่ transform ที่ .erp → fixed ยึด .erp แทนจอ)
test("[ui·desktop] modal ลูกค้า HQ ครอบเต็มจอ (fixed ยึด viewport)", async ({ page }) => {
  await open(page, "hq", "/hq/customers");
  const row = page.locator("table tbody tr").first();
  // ตารางแบ่งหน้าที่ DB (RPC async, M9 Phase 6) — แถวแรกตอนโหลดอาจเป็นแถว "กำลังโหลด…" ที่คลิกไม่ได้
  // รอปุ่ม "ดูรายละเอียด" (มีแค่แถวข้อมูลจริง) ก่อนคลิก ไม่งั้นคลิกแถวชั่วคราวแล้วโมดัลไม่เปิดเลย
  await expect(row.getByTitle("ดูรายละเอียด")).toBeVisible({ timeout: 15_000 });
  await row.click();
  // รอโมดัลขึ้นจริงก่อนวัด — ใช้ "รหัสลูกค้า" ในแท็บโปรไฟล์เป็นหมุด (ป้าย "Data Ownership" เหลือแค่คอมเมนต์ในโค้ดแล้ว)
  // (คำเดียวกันเป็นหัวคอลัมน์ในตารางเบื้องหลังด้วย จึงต้อง .first())
  await expect(page.getByText("รหัสลูกค้า").first()).toBeVisible();
  const rect = await page.evaluate(() => {
    const ov = [...document.querySelectorAll<HTMLElement>("div")].find(d => {
      const s = getComputedStyle(d);
      return s.position === "fixed" && parseFloat(s.zIndex) >= 200 && d.getBoundingClientRect().width > 300;
    });
    if (!ov) return null;
    const r = ov.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, vw: window.innerWidth };
  });
  expect(rect, "หา overlay ไม่เจอ").not.toBeNull();
  // ยึดมุมซ้ายบนของจอ + กว้างเท่าจอ (ถ้าบั๊ก .erp transform จะเลื่อนขวา/แคบลง)
  expect(Math.abs(rect!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(rect!.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(rect!.w - rect!.vw)).toBeLessThanOrEqual(2);
});

// KPI cards ของ HQ ทุกแบบต้องมีแอนิเมชันเข้า ทุกหน้า
// ไม่ล็อกชื่อคีย์เฟรมตัวเดียว — ดีไซน์ตอนนี้ใช้ "chart-fade-in" (จางเข้าเฉย ๆ ตามแนว calm enterprise
// ที่ globals.css เขียนกำกับไว้ว่า no rise, no stagger) ส่วน "cardIn" (เลื่อนขึ้น+จาง) ยังใช้กับการ์ดอื่นอยู่
// สิ่งที่ต้องกันคือ "ไม่มีแอนิเมชันเข้าเลย" (none)
const ENTRANCE_ANIMS = ["cardIn", "chart-fade-in"];
// รอบ 4: หน้ารายละเอียดดีลเลอร์ไม่มีการ์ดผลงาน (.stat-card) แล้ว → ตรวจว่าไม่มีแล้วในข้อแยกด้านล่าง
//   และเพิ่มหน้ารายการดีลเลอร์ (.hq-kpi4) เข้ามาตรวจแอนิเมชันแทน
for (const [path, selector, label] of [
  ["/hq/dealers", ".hq-kpi4 > .card", "หน้ารายการดีลเลอร์ (.hq-kpi4)"],
  ["/hq/quotations", ".hq-kpi4 > .card", "หน้าใบเสนอราคาทั้งเครือ (.hq-kpi4)"],
] as const) {
  test(`[ui·hq] KPI cards ${label} มีแอนิเมชันเข้า`, async ({ page }) => {
    await open(page, "hq", path);
    const card = page.locator(selector).first();
    await expect(card).toBeVisible();
    const anim = await card.evaluate(el => getComputedStyle(el).animationName);
    expect(ENTRANCE_ANIMS, `${label}: ต้องมี entrance animation (ได้: ${anim})`).toContain(anim);
  });
}

test("[ui·hq] หน้ารายละเอียดดีลเลอร์ไม่มีการ์ดผลงานขาย (.stat-card) แล้ว — รอบ 4", async ({ page }) => {
  await open(page, "hq", "/hq/dealers/CNX");
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(page.locator(".stat-card"), "การ์ดผลงานเอาออกจากหน้านี้แล้ว").toHaveCount(0);
});

// แท็บเล็ต (768) : เลย์เอาต์ต้องไม่ล้น
for (const [role, path, label] of PAGES.slice(0, 5)) {
  test(`[ui·tablet] ${label} responsive ที่ 768px`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open(page, role, path);
    await expect(page.locator("h1, h2, h3").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${label}@768: overflow ${overflow}px`).toBeLessThanOrEqual(3);
  });
}
