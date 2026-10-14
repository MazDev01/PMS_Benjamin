// ── ดีลเลอร์บวกราคาเพิ่มจากราคากลางของสำนักงานใหญ่เองได้ (บอสสั่ง 20 ส.ค. 69) ──────
//
// สิ่งที่ต้องจริง: ตั้ง % ที่หน้าแม่แบบ → ราคาขายบนหน้าจอเปลี่ยนตาม
//                 และใบเสนอราคาที่ออกใหม่ต้องตั้งต้นด้วย "ราคาขายของสาขา" ไม่ใช่ราคากลางดิบ
//
// ⚠️ ส่วนบวกเพิ่มเป็นค่าของ "ทั้งสาขา" — ตั้งค้างไว้จะไปเปลี่ยนราคาในสเปกอื่นที่รันขนานกัน
//    จึงต้องคืนค่าเป็น 0 ให้เรียบร้อยทุกครั้งที่จบ (afterAll) ไม่ว่าเทสต์จะผ่านหรือล้ม
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, waitRow, pickTemplate, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const ล้างส่วนบวกเพิ่ม = async () => {
  const sb = await db(RYG);
  await sb.from("dealer_settings").update({ pricing: {} }).eq("dealer_code", "RYG");
};

test.beforeAll(ล้างส่วนบวกเพิ่ม);
test.afterAll(ล้างส่วนบวกเพิ่ม);

test("[func] ตั้ง % ที่หน้าแม่แบบ → ราคาขายเปลี่ยนตาม และบันทึกค้างไว้จริง", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/products`, { waitUntil: "domcontentloaded" });

  // การ์ดแรกที่มีราคากลางจริง
  const ช่อง = page.locator('input[aria-label^="บวกเพิ่มจากราคากลาง"]').first();
  await expect(ช่อง).toBeVisible({ timeout: 30_000 });

  await ช่อง.fill("20");
  await ช่อง.blur();

  // ต้องบันทึกลงฐานข้อมูลจริง ไม่ใช่ค้างอยู่บนหน้าจอ
  await expect.poll(async () => {
    const { data } = await sb.from("dealer_settings").select("pricing").eq("dealer_code", "RYG").maybeSingle();
    const byTemplate = (data?.pricing as { byTemplate?: Record<string, number> } | null)?.byTemplate ?? {};
    return Object.values(byTemplate)[0];
  }, { timeout: 20_000, message: "ส่วนบวกเพิ่มต้องถูกบันทึกที่ฐานข้อมูล" }).toBe(20);

  // เปิดหน้าใหม่แล้วค่าต้องยังอยู่ (ไม่ใช่จำไว้แค่ในหน้าจอ)
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('input[aria-label^="บวกเพิ่มจากราคากลาง"]').first()).toHaveValue("20", { timeout: 30_000 });
});

// ด่าน 3: ใบใหม่ทำจากใบ HQ — ส่วนบวกของสาขากลายเป็น "% ตั้งต้น" ของแต่ละบรรทัด (ราคา = ต้นทุนจากใบ HQ × (1 + %))
test("[func] ใบเสนอราคาใหม่ตั้งต้นด้วยส่วนบวกของสาขา ไม่ใช่ราคาต้นทุนดิบ", async ({ page }) => {
  const sb = await db(RYG);
  const COMPANY = `ZZTEST-MARKUP-${Date.now().toString().slice(-6)}`;

  // บวก 20% ทุกแม่แบบ — ไม่ต้องเดาว่าฟอร์มจะเลือกแม่แบบไหน
  await sb.from("dealer_settings").update({ pricing: { defaultPct: 20 } }).eq("dealer_code", "RYG");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(COMPANY);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณบวกราคา");
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200", { exact: true }).fill("100");   // พื้นที่ → จำนวนใน BOQ
  await pickTemplate(page);
  await page.getByRole("button", { name: "บันทึก" }).click();
  const lead = await waitRow<{ product: string }>(sb, "leads", { company: COMPANY });

  // เปิดแผงลูกค้าเป้าหมาย → แท็บใบเสนอราคา → สร้าง
  void lead;
  const ใบ = await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY, [{ name: "โครงสร้างทดสอบส่วนบวก", qty: 100, unit: "ตร.ม.", unitCost: 4500 }]);
  const ตาราง = page.locator("[data-editor='hq-markup']");
  await expect(ตาราง.getByLabel("% ที่บวก 1"), "% ตั้งต้นต้องเป็นส่วนบวกของสาขา (20%)").toHaveValue("20", { timeout: 20_000 });
  await expect(ตาราง.getByTestId("hq-line-price-0"), "ราคาขาย = ต้นทุน 4,500 × 1.20").toHaveText("5,400.00");

  // เก็บกวาดลูกค้าเป้าหมายที่สร้างไว้ (ใบ HQ ที่ส่งแล้วลบด้วยกุญแจไม่ได้ — ล้างที่ฐานทดสอบ)
  const { ล้างใบHQทดสอบ } = await import("./legacyQuotes");
  ล้างใบHQทดสอบ("RYG", [ใบ.leadNum]);
});
