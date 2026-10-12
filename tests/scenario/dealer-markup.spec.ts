// ── ดีลเลอร์บวกราคาเพิ่มจากราคากลางของสำนักงานใหญ่เองได้ (บอสสั่ง 20 ส.ค. 69) ──────
//
// สิ่งที่ต้องจริง: ตั้ง % ที่หน้าแม่แบบ → ราคาขายบนหน้าจอเปลี่ยนตาม
//                 และใบเสนอราคาที่ออกใหม่ต้องตั้งต้นด้วย "ราคาขายของสาขา" ไม่ใช่ราคากลางดิบ
//
// ⚠️ ส่วนบวกเพิ่มเป็นค่าของ "ทั้งสาขา" — ตั้งค้างไว้จะไปเปลี่ยนราคาในสเปกอื่นที่รันขนานกัน
//    จึงต้องคืนค่าเป็น 0 ให้เรียบร้อยทุกครั้งที่จบ (afterAll) ไม่ว่าเทสต์จะผ่านหรือล้ม
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, waitRow, pickTemplate } from "./funcHelpers";

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

test("[func] ใบเสนอราคาใหม่ตั้งต้นด้วยราคาขายของสาขา ไม่ใช่ราคากลางดิบ", async ({ page }) => {
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

  // ราคากลางของแม่แบบที่ลูกค้าเป้าหมายรายนี้เลือกไว้
  const { data: cat } = await sb.from("master_catalog").select("name,price,subtypes,subtype_prices");
  const prod = (cat ?? []).find(c => c.name === lead.product)
            ?? (cat ?? []).find(c => (c.subtypes as string[] | null)?.includes(lead.product));
  const ย่อย = (prod?.subtype_prices as Record<string, number> | null)?.[lead.product];
  const ราคากลาง = ย่อย && ย่อย > 0 ? ย่อย : Number(prod?.price ?? 0);
  test.skip(!(ราคากลาง > 0), "แม่แบบที่เลือกยังไม่มีราคากลางในฐานทดสอบ");
  const ราคาขายที่คาด = Math.round(ราคากลาง * 1.2);

  // เปิดแผงลูกค้าเป้าหมาย → แท็บใบเสนอราคา → สร้าง
  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).first().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 20_000 });

  await expect(page.getByLabel("ราคาต่อหน่วย").first(), "ราคาต่อหน่วยตั้งต้นต้องเป็นราคาขายของสาขา (ราคากลาง +20%)")
    // ช่องเงินโชว์ลูกน้ำแล้ว (26 ส.ค. 69) — ค่าที่เห็นจึงเป็น "1,234" ไม่ใช่ "1234"
    .toHaveValue(ราคาขายที่คาด.toLocaleString("en-US"), { timeout: 20_000 });

  // เก็บกวาดลูกค้าเป้าหมายที่สร้างไว้
  await sb.from("leads").delete().eq("dealer_code", "RYG").eq("company", COMPANY);
});
