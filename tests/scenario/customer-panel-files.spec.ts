import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors, db, waitRow, waitGone, cleanup, specNS, nsTag } from "./funcHelpers";

// ─── ดีลเลอร์ › ลูกค้า › แผงลูกค้า (ตรวจเทียบ FLOW รอบ 5 · 28 ต.ค. 69) ───
// แถว 17: FLOW "แนบ/ลบไฟล์ — แผงลีด หรือ แผงลูกค้า (หน้าไฟล์ = ดูอย่างเดียว)" แต่แผงลูกค้าไม่มีส่วนไฟล์
//   (การ์ดไฟล์เคยอยู่แค่ในแผงรายละเอียดงานที่ปิดการขาย — ลูกค้าที่ยังไม่มีใบตอบรับแนบไม่ได้เลย)
//   → การ์ด "ไฟล์" อยู่ในแท็บข้อมูลลูกค้า · คลังไฟล์ตัวเดียวกับแผงลีด (ไบต์ขึ้น Storage จริง · ลบผ่าน ลบไฟล์() กลาง)
// แถว 18: "เป็นลูกค้าเมื่อ" แสดง ค.ศ. (29/12/2025) ขณะที่หัวแผงเขียน พ.ศ. → ช่องเลือกวันที่กลาง ThaiDateInput
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("CUSTFILE");
const tg = nsTag(NS);
const ลูกค้า = "ลูกค้าทดสอบ 039";   // ลูกค้าของ RYG ในข้อมูลตั้งต้น (สร้างลูกค้าเองไม่ได้ — เกิดจากใบที่ลูกค้าตอบรับเท่านั้น)

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

async function เปิดแผงลูกค้า(page: import("@playwright/test").Page) {
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาลูกค้า, เบอร์โทร, อีเมล...").fill(ลูกค้า);
  const row = page.locator("tbody tr").filter({ hasText: ลูกค้า }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTitle("ดูรายละเอียด").click();
  const การ์ดไฟล์ = page.locator("[data-customer-files]");
  await expect(การ์ดไฟล์, "แผงลูกค้าต้องมีส่วนไฟล์ (แท็บข้อมูลลูกค้า)").toBeVisible({ timeout: 15_000 });
  return การ์ดไฟล์;
}

test("[D8] แผงลูกค้า: แนบไฟล์ → ไบต์ขึ้น Storage + แถวผูกลูกค้า · ลบไฟล์ (ยืนยันก่อน) → แถวหาย", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  const FILENAME = `${tg("แนบที่แผงลูกค้า")}.pdf`;

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const การ์ดไฟล์ = await เปิดแผงลูกค้า(page);

  await page.getByLabel("แนบไฟล์เข้าลูกค้า").setInputFiles({ name: FILENAME, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 benjamin customer") });

  const f = await waitRow<{ id: number; dealer_code: string; storage_path: string | null; customer_id: number | null; source: string }>(
    sb, "files", { name: FILENAME }, 25_000);
  expect(f.dealer_code, "ไฟล์ต้องเป็นของสาขาที่ล็อกอิน").toBe("RYG");
  expect(f.source, "ไฟล์ต้องผูกกับลูกค้า").toBe("customer");
  expect(f.customer_id, "ไฟล์ต้องผูกเลขลูกค้า").toBeTruthy();
  expect(f.storage_path?.startsWith("RYG/"), "ไบต์ต้องขึ้น Storage ใต้โฟลเดอร์สาขา").toBe(true);
  const signed = await sb.storage.from("dealer-files").createSignedUrl(f.storage_path!, 60);
  expect(signed.error, "ดึงไฟล์จาก Storage ต้องได้").toBeNull();
  await expect(การ์ดไฟล์.getByText(FILENAME, { exact: true }), "ไฟล์ที่แนบต้องขึ้นในแผงลูกค้า").toBeVisible({ timeout: 15_000 });

  await การ์ดไฟล์.getByRole("button", { name: `ลบไฟล์ ${FILENAME}`, exact: true }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await waitGone(sb, "files", { id: f.id }, 20_000);
  await expect(การ์ดไฟล์.getByText(FILENAME, { exact: true }), "ลบแล้วต้องหายจากแผงลูกค้า").toHaveCount(0, { timeout: 15_000 });

  assertNoErrors(errs, "แนบ/ลบไฟล์ที่แผงลูกค้า");
});

test("[D8] แผงลูกค้า: \"เป็นลูกค้าเมื่อ\" แสดงปี พ.ศ. แบบเดียวกับหัวแผง", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await เปิดแผงลูกค้า(page);
  const วันที่ = page.locator("[data-thai-date]").first();
  await expect(วันที่).toBeVisible();
  const ข้อความ = (await วันที่.innerText()).trim();
  expect(ข้อความ, "ต้องเป็นรูปแบบไทย เช่น 29 ธ.ค. 2568").toMatch(/^\d{1,2} \S+ 25\d\d$/);
  // ช่องเลือกวันที่จริงยังอยู่ (ค่าที่เก็บ = YYYY-MM-DD) และปีในหัวแผงต้องตรงกัน
  const iso = await page.getByLabel("วันที่เป็นลูกค้า").inputValue();
  expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(ข้อความ.endsWith(String(Number(iso.slice(0, 4)) + 543)), "ปีต้องเป็น พ.ศ. ของวันที่เดียวกัน").toBe(true);
  await expect(page.getByText(`เข้าร่วม ${ข้อความ}`), "หัวแผงกับช่องต้องเป็นวันเดียวกันรูปแบบเดียวกัน").toBeVisible();
});
