// ── การ์ด KPI ต้องเดินตามตัวกรองของหน้านั้น ๆ (บอสสั่ง 20 ส.ค. 69) ────────────────
//
// "ให้พวกนี้คุมได้ · ทำทุกหน้า" — เดิมการ์ดสรุปฝั่งดีลเลอร์คิดจากข้อมูลทั้งสาขาเสมอ
// เลือกจังหวัด/ผู้รับผิดชอบ/ช่องทาง แล้วตารางเปลี่ยน แต่ตัวเลขบนการ์ดนิ่งสนิท
// อ่านคู่กันแล้วขัดกันเอง ("กรองเหลือ 3 ราย แต่การ์ดบอก 16 ราย")
import { test, expect, type Page } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

/** ตัวเลขบนการ์ด KPI ใบที่ระบุ */
async function เลขบนการ์ด(page: Page, ป้าย: string): Promise<number> {
  const การ์ด = page.locator(".dash-kpis > *").filter({ hasText: ป้าย }).first();
  const txt = await การ์ด.innerText();
  const m = txt.replace(/,/g, "").match(/\d+/g);
  return m ? Number(m[0]) : Number.NaN;
}
/** ยอดรวมที่แถบแบ่งหน้าบอก ("แสดง 1–10 จาก 24 รายการ") */
async function ยอดในตาราง(page: Page): Promise<number> {
  const txt = await page.getByText(/แสดง .* จาก .*/).first().innerText();
  const m = txt.replace(/,/g, "").match(/จาก\s+(\d+)/);
  return m ? Number(m[1]) : Number.NaN;
}

test("[ui·dealer] หน้าลูกค้าเป้าหมาย: เลือกจังหวัดแล้วการ์ด KPI ต้องเปลี่ยนตาม", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/leads");
  await settle(page);

  const ก่อน = await เลขบนการ์ด(page, "ลูกค้าเป้าหมายทั้งหมด");
  expect(ก่อน, "ต้องมีลูกค้าเป้าหมายให้ทดสอบ").toBeGreaterThan(0);
  expect(ก่อน, "การ์ดต้องตรงกับยอดในตารางตั้งแต่ยังไม่กรอง").toBe(await ยอดในตาราง(page));

  // เลือกจังหวัดใดจังหวัดหนึ่งที่มีอยู่จริงในตัวเลือก
  const จังหวัด = page.getByLabel("จังหวัด").or(page.locator("select").filter({ hasText: "ทุกจังหวัด" })).first();
  const ตัวเลือก = await จังหวัด.evaluate(el => [...(el as HTMLSelectElement).options].map(o => o.value).filter(Boolean));
  test.skip(ตัวเลือก.length === 0, "ฐานทดสอบยังไม่มีจังหวัดให้กรอง");
  await จังหวัด.selectOption(ตัวเลือก[0]);
  await page.waitForTimeout(900);

  const หลัง = await เลขบนการ์ด(page, "ลูกค้าเป้าหมายทั้งหมด");
  expect(หลัง, "กรองจังหวัดแล้วการ์ดต้องตรงกับยอดในตาราง ไม่ใช่ยอดทั้งสาขา").toBe(await ยอดในตาราง(page));
  expect(หลัง, "กรองแล้วต้องไม่มากกว่าเดิม").toBeLessThanOrEqual(ก่อน);
});

test("[ui·dealer] หน้าใบเสนอราคา: กรองแล้วการ์ดมูลค่ารวมต้องเปลี่ยนตาม", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/quotations");
  await settle(page);

  const ก่อน = await เลขบนการ์ด(page, "ใบเสนอราคาทั้งหมด");
  expect(ก่อน, "ต้องมีใบเสนอราคาให้ทดสอบ").toBeGreaterThan(0);

  // กรองด้วยประเภทอาคาร (ตัวกรองที่ไม่ใช่สถานะ — การ์ดต้องขยับตาม)
  const ประเภท = page.locator("select").filter({ hasText: "ทุกประเภท" }).first();
  const ตัวเลือก = await ประเภท.evaluate(el => [...(el as HTMLSelectElement).options].map(o => o.value).filter(v => v && v !== "ALL"));
  test.skip(ตัวเลือก.length === 0, "ฐานทดสอบยังไม่มีประเภทอาคารให้กรอง");
  await ประเภท.selectOption(ตัวเลือก[0]);
  await page.waitForTimeout(900);

  const หลัง = await เลขบนการ์ด(page, "ใบเสนอราคาทั้งหมด");
  expect(หลัง, "กรองประเภทอาคารแล้วการ์ดต้องนับเฉพาะที่กรอง").toBe(await ยอดในตาราง(page));
  expect(หลัง).toBeLessThanOrEqual(ก่อน);
});

test("[ui·dealer] หน้าลูกค้า: กรองจังหวัดแล้วการ์ดลูกค้าทั้งหมดต้องเปลี่ยนตาม", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/customers");
  await settle(page);

  const ก่อน = await เลขบนการ์ด(page, "ลูกค้าทั้งหมด");
  test.skip(!(ก่อน > 0), "ฐานทดสอบยังไม่มีลูกค้าของสาขานี้");

  const จังหวัด = page.locator("select").filter({ hasText: "ทุกจังหวัด" }).first();
  const ตัวเลือก = await จังหวัด.evaluate(el => [...(el as HTMLSelectElement).options].map(o => o.value).filter(v => v && v !== "ALL"));
  test.skip(ตัวเลือก.length === 0, "ฐานทดสอบยังไม่มีจังหวัดให้กรอง");
  await จังหวัด.selectOption(ตัวเลือก[0]);
  await page.waitForTimeout(900);

  const หลัง = await เลขบนการ์ด(page, "ลูกค้าทั้งหมด");
  expect(หลัง, "กรองแล้วการ์ดต้องตรงกับยอดในตาราง").toBe(await ยอดในตาราง(page));
  expect(หลัง).toBeLessThanOrEqual(ก่อน);
});
