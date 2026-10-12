// ── หน่วยของแม่แบบเป็น "ช่องเลือก" ไม่ใช่ช่องพิมพ์อิสระ (บอสสั่ง 28 ส.ค. 69) ─────────
//
// ทำไมต้องเป็นช่องเลือก: ตัวคิดราคาอัตโนมัติเทียบ "ตร.ม." แบบตรงตัว (lib/boq.ts)
//   พิมพ์ตกจุดเป็น "ตร.ม" หรือพิมพ์ "ตารางเมตร" → ระบบเลิกคิดราคาให้เงียบ ๆ ไม่มีอะไรฟ้อง
//   ดีลเลอร์เห็นแค่ช่องประเมินราคาว่างเปล่าแล้วไม่รู้ว่าทำไม
//
// สองข้อที่ต้องจริง:
//   1. เลือกหน่วยใหม่แล้วบันทึก → ค่าลงฐานข้อมูลจริง
//   2. หน่วยเดิมที่ไม่อยู่ในรายการมาตรฐาน ต้องไม่หายไปตอนเปิดฟอร์ม (ข้อมูลเก่าใช้หน่วยอื่นได้)
import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, loginUI, db, TAG } from "./funcHelpers";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const ชื่อแม่แบบ = `${TAG}-หน่วยแม่แบบ`;
const ID = "zzt-unit-select";
const หน่วยเดิมนอกรายการ = "ตารางวา";   // ตั้งใจใช้หน่วยที่ไม่มีในรายการมาตรฐาน

async function ล้างของทดสอบ() {
  const sb = await db(ADMIN);
  await sb.from("master_catalog").delete().eq("id", ID);
}
test.beforeAll(async () => {
  await ล้างของทดสอบ();
  const sb = await db(ADMIN);
  const ins = await sb.from("master_catalog").insert({
    id: ID, name: ชื่อแม่แบบ, spec: "ทดสอบช่องหน่วย", price: 4000,
    unit: หน่วยเดิมนอกรายการ, effective_date: "1 ส.ค. 2569", price_history: [], subtypes: [],
  }).select();
  expect(ins.error, `สร้างแม่แบบทดสอบไม่ได้: ${JSON.stringify(ins.error)}`).toBeNull();
});
test.afterAll(ล้างของทดสอบ);

test("[func·hq] หน่วยเลือกจากรายการได้ · หน่วยเดิมนอกรายการต้องไม่หาย", async ({ page }) => {
  const sb = await db(ADMIN);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
  await settle(page);

  await page.getByPlaceholder("ค้นหาแม่แบบ...").fill(ชื่อแม่แบบ);
  await expect(page.getByText(ชื่อแม่แบบ).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "แก้ไข", exact: true }).first().click();

  // exact — ชื่อแม่แบบทดสอบมีคำว่า "หน่วย" อยู่ ปุ่มในการ์ดจึงติดมาด้วยถ้าไม่ระบุให้ตรงเป๊ะ
  const ช่องหน่วย = page.getByLabel("หน่วย", { exact: true });
  await expect(ช่องหน่วย).toBeVisible({ timeout: 15_000 });

  // 1) หน่วยเดิมที่ไม่อยู่ในรายการมาตรฐาน ต้องยังถูกเลือกอยู่ — ไม่ถูกเปลี่ยนให้เงียบ ๆ
  await expect(ช่องหน่วย, "หน่วยเดิมนอกรายการต้องไม่หาย").toHaveValue(หน่วยเดิมนอกรายการ);

  // 2) เลือกหน่วยมาตรฐานแล้วบันทึก → ต้องลงฐานข้อมูลจริง
  await ช่องหน่วย.selectOption("ตร.ม.");
  await page.getByRole("button", { name: "บันทึก", exact: true }).last().click();

  await expect.poll(async () => {
    const { data } = await sb.from("master_catalog").select("unit").eq("id", ID).maybeSingle();
    return (data as { unit: string } | null)?.unit;
  }, { timeout: 30_000, message: "หน่วยที่เลือกต้องลงฐานข้อมูล" }).toBe("ตร.ม.");
});
