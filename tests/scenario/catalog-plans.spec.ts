// ── แบบแปลนของแม่แบบ + แก้ไขเฉพาะแม่แบบย่อย (บอสสั่ง 28 ส.ค. 69) ──────────────────
//
// สองเรื่องที่ต้องจริง:
//   1. อัปโหลดแบบแปลนจากเครื่อง → ไฟล์ขึ้นที่เก็บจริง และรายการอ้างอิงลงฐานข้อมูล
//      ⚠️ ไฟล์จริงอยู่ใน Storage ไม่ใช่ในคอลัมน์ (ดู migration 0166) — ต้องตรวจทั้งสองที่
//   2. กด "แก้ไขแม่แบบย่อยนี้" แล้วแก้ได้เฉพาะตัวนั้น — ตัวอื่นในกลุ่มต้องไม่ขยับเลย
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, loginUI, db, TAG } from "./funcHelpers";
import { settle } from "./helpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const ID = "zzt-plans", ชื่อ = `${TAG}-แบบแปลน`;
const ย่อยA = "รุ่นเอ", ย่อยB = "รุ่นบี";
type แถว = {
  subtypes: string[]; subtype_prices: Record<string, number> | null;
  plans: { name: string; path: string; size: number }[];
  subtype_plans: Record<string, { name: string; path: string; size: number }[]>;
};
const อ่าน = async (): Promise<แถว> => {
  const sb = await db(ADMIN);
  const { data } = await sb.from("master_catalog").select("subtypes,subtype_prices,plans,subtype_plans").eq("id", ID).single();
  return data as แถว;
};

test.beforeAll(async () => {
  const sb = await db(ADMIN);
  await sb.from("master_catalog").delete().eq("id", ID);
  await sb.from("master_catalog").insert({
    id: ID, name: ชื่อ, spec: "ทดสอบแบบแปลน", price: 5000, unit: "ตร.ม.",
    effective_date: "1 ส.ค. 2569", price_history: [],
    subtypes: [ย่อยA, ย่อยB], subtype_prices: { [ย่อยB]: 8000 },
  });
});
test.afterAll(async () => { await (await db(ADMIN)).from("master_catalog").delete().eq("id", ID); });

test("[func·hq] อัปโหลดแบบแปลนจากเครื่อง → ไฟล์ขึ้นที่เก็บจริง และลงฐานข้อมูล", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาแม่แบบ...").fill(ชื่อ);
  await expect(page.getByText(ชื่อ).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "แก้ไข", exact: true }).first().click();

  await page.getByLabel("เลือกไฟล์แบบแปลน").setInputFiles({
    name: "แปลนชั้น 1.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 ทดสอบ"),
  });
  // ชื่อไฟล์ภาษาไทยต้องโชว์ตามที่ผู้ใช้ตั้ง (พาธในที่เก็บเป็น ASCII คนละตัวกัน)
  await expect(page.getByText("แปลนชั้น 1.pdf")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "บันทึก", exact: true }).last().click();

  await expect.poll(async () => (await อ่าน()).plans?.length ?? 0,
    { timeout: 30_000, message: "รายการแบบแปลนต้องลงฐานข้อมูล" }).toBe(1);
  const แถวจริง = await อ่าน();
  expect(แถวจริง.plans[0].name, "ชื่อไฟล์ที่คนอ่านต้องเก็บตามเดิม").toBe("แปลนชั้น 1.pdf");
  expect(แถวจริง.plans[0].path, "พาธต้องอยู่ในโฟลเดอร์แบบแปลน และเป็น ASCII ล้วน").toMatch(/^plans\/\d+-[\x20-\x7E]+$/);

  // ไฟล์จริงต้องเปิดได้จาก Storage (ถังนี้อ่านสาธารณะ)
  const sb = await db(ADMIN);
  const { data: ไฟล์ } = await sb.storage.from("catalog-plans").download(แถวจริง.plans[0].path);
  expect(ไฟล์, "ไฟล์จริงต้องอยู่ในที่เก็บ ไม่ใช่มีแต่ชื่อในฐานข้อมูล").not.toBeNull();
});

test("[func·hq] แก้ไขแม่แบบย่อยตัวเดียว → ตัวอื่นในกลุ่มต้องไม่ขยับ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาแม่แบบ...").fill(ชื่อ);
  await page.getByText(ชื่อ).first().click();
  await page.locator('[role="dialog"]').last().locator("button").filter({ hasText: ย่อยA }).first().click();
  await page.getByRole("button", { name: "แก้ไขแม่แบบย่อยนี้" }).click();

  await page.getByLabel("ราคากลางของแม่แบบย่อยนี้").fill("6500");
  await page.getByRole("button", { name: "บันทึก", exact: true }).last().click();

  await expect.poll(async () => (await อ่าน()).subtype_prices?.[ย่อยA],
    { timeout: 30_000, message: "ราคาของแม่แบบย่อยที่แก้ต้องลงฐานข้อมูล" }).toBe(6500);
  const แถวจริง = await อ่าน();
  expect(แถวจริง.subtype_prices?.[ย่อยB], "แม่แบบย่อยตัวอื่นต้องไม่ถูกแตะ").toBe(8000);
  expect(แถวจริง.subtypes, "รายชื่อแม่แบบย่อยต้องครบเท่าเดิม").toEqual([ย่อยA, ย่อยB]);
});

// ── แนบแบบแปลนให้แม่แบบย่อยได้ "ทุกตัว" จากฟอร์มแก้ไขและฟอร์มเพิ่ม (บอสสั่ง 28 ส.ค. 69) ──
//
// เดิมแนบให้แม่แบบย่อยได้เฉพาะในกล่อง "แก้ไขแม่แบบย่อยนี้" ซึ่งต้องเปิดทีละตัว
// ตอนนี้แต่ละแถวในฟอร์มมีคลิปหนีบของตัวเอง กางแล้วแนบได้เลย
test.describe("แบบแปลนรายแม่แบบย่อย", () => {
  const ID2 = "zzt-subplans", ชื่อ2 = `${TAG}-แปลนย่อย`;
  const ย่อย1 = "รุ่นหนึ่ง", ย่อย2 = "รุ่นสอง";
  type แถว2 = { subtype_plans: Record<string, { name: string; path: string }[]> };
  const อ่าน2 = async (): Promise<แถว2> => {
    const sb = await db(ADMIN);
    const { data } = await sb.from("master_catalog").select("subtype_plans").eq("id", ID2).single();
    return data as แถว2;
  };

  test.beforeAll(async () => {
    const sb = await db(ADMIN);
    await sb.from("master_catalog").delete().eq("id", ID2);
    await sb.from("master_catalog").insert({
      id: ID2, name: ชื่อ2, spec: "ทดสอบแปลนย่อย", price: 5000, unit: "ตร.ม.",
      effective_date: "1 ส.ค. 2569", price_history: [], subtypes: [ย่อย1, ย่อย2],
    });
  });
  test.afterAll(async () => { await (await db(ADMIN)).from("master_catalog").delete().eq("id", ID2); });

  test("[func·hq] แนบแบบแปลนรายแม่แบบย่อยจากฟอร์มแก้ไข → ลงฐานข้อมูลเฉพาะตัวนั้น", async ({ page }) => {
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder("ค้นหาแม่แบบ...").fill(ชื่อ2);
    await expect(page.getByText(ชื่อ2).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "แก้ไข", exact: true }).first().click();

    // กางแผงแบบแปลนของแม่แบบย่อยตัวแรก แล้วแนบไฟล์
    await page.getByRole("button", { name: `แบบแปลนของ ${ย่อย1}` }).click();
    await page.getByLabel("เลือกไฟล์แบบแปลน").last().setInputFiles({
      name: "แปลนรุ่นหนึ่ง.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 หนึ่ง"),
    });
    await expect(page.getByText("แปลนรุ่นหนึ่ง.pdf")).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "บันทึก", exact: true }).last().click();

    await expect.poll(async () => (await อ่าน2()).subtype_plans?.[ย่อย1]?.length ?? 0,
      { timeout: 30_000, message: "แบบแปลนของแม่แบบย่อยตัวแรกต้องลงฐานข้อมูล" }).toBe(1);
    const แถวจริง = await อ่าน2();
    expect(แถวจริง.subtype_plans[ย่อย1][0].name).toBe("แปลนรุ่นหนึ่ง.pdf");
    expect(แถวจริง.subtype_plans?.[ย่อย2], "ตัวที่ไม่ได้แนบต้องไม่มีคีย์").toBeUndefined();
  });
});

// ── ดีลเลอร์ต้องเห็นแบบแปลนครบทุกระดับ (บอสสั่ง 28 ส.ค. 69) ────────────────────────
//
// สำนักงานใหญ่เป็นคนอัปโหลด · ดีลเลอร์ดูอย่างเดียวแต่ต้อง "เห็นทุกอย่าง"
//   • แบบแปลนของแม่แบบหลัก — ในกล่องรายละเอียดแม่แบบ
//   • แบบแปลนของแม่แบบย่อย — ในกล่องรายละเอียดแม่แบบย่อย
//   • ย่อยที่ไม่มีแบบแปลนเฉพาะ → ใช้ของแม่แบบหลัก และต้องมีป้ายบอกว่าเป็นของแม่แบบหลัก
//     (ไม่งั้นเข้าใจว่าเป็นแบบแปลนเฉพาะของย่อยตัวนั้น แล้วส่งผิดแบบให้ลูกค้า)
//
// ⚠️ ต้องเปิดไฟล์ได้จริงด้วย ไม่ใช่แค่เห็นชื่อ — ยิงลิงก์ที่หน้าจอให้มาแล้ววัดสถานะ
test.describe("ดีลเลอร์ดูแบบแปลน", () => {
  const ID3 = "zzt-dealerplans", ชื่อ3 = `${TAG}-แปลนดีลเลอร์`;
  const มีแปลนเอง = "รุ่นมีแปลน", ตามแม่ = "รุ่นตามแม่";
  let พาธแม่ = "", พาธย่อย = "";

  test.beforeAll(async () => {
    const sb = await db(ADMIN);
    await sb.from("master_catalog").delete().eq("id", ID3);
    // อัปไฟล์จริงขึ้นที่เก็บ (จำลองว่า HQ อัปไว้แล้ว) — ดีลเลอร์ต้องเปิดได้
    const อัป = async (ชื่อไฟล์: string, เนื้อ: string) => {
      const path = `plans/zzt-${Date.now()}-${ชื่อไฟล์}`;
      await sb.storage.from("catalog-plans").upload(path, Buffer.from(เนื้อ), { contentType: "application/pdf" });
      return path;
    };
    พาธแม่ = await อัป("main.pdf", "%PDF-1.4 แม่แบบหลัก");
    พาธย่อย = await อัป("sub.pdf", "%PDF-1.4 แม่แบบย่อย");
    await sb.from("master_catalog").insert({
      id: ID3, name: ชื่อ3, spec: "ทดสอบดีลเลอร์ดูแปลน", price: 5000, unit: "ตร.ม.",
      effective_date: "1 ส.ค. 2569", price_history: [], subtypes: [มีแปลนเอง, ตามแม่],
      plans: [{ name: "แปลนแม่แบบหลัก.pdf", path: พาธแม่, size: 2048 }],
      subtype_plans: { [มีแปลนเอง]: [{ name: "แปลนเฉพาะรุ่นนี้.pdf", path: พาธย่อย, size: 1024 }] },
    });
  });
  test.afterAll(async () => {
    const sb = await db(ADMIN);
    await sb.from("master_catalog").delete().eq("id", ID3);
    await sb.storage.from("catalog-plans").remove([พาธแม่, พาธย่อย]);
  });

  test("[func·dealer] ดีลเลอร์เห็นแบบแปลนทั้งของแม่แบบหลักและแม่แบบย่อย · เปิดไฟล์ได้จริง", async ({ page, request }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/products`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(ชื่อ3);
    await page.getByRole("button", { name: "รายละเอียด", exact: true }).first().click();

    // 1) แบบแปลนของแม่แบบหลัก
    const กล่อง = page.locator('[role="dialog"]').last();
    const ลิงก์แม่ = กล่อง.getByRole("link", { name: /แปลนแม่แบบหลัก\.pdf/ });
    await expect(ลิงก์แม่, "ดีลเลอร์ต้องเห็นแบบแปลนของแม่แบบหลัก").toBeVisible({ timeout: 20_000 });
    const url = await ลิงก์แม่.getAttribute("href");
    expect((await request.get(url!)).status(), "ไฟล์ต้องเปิดได้จริง ไม่ใช่เห็นแต่ชื่อ").toBe(200);

    // 2) แม่แบบย่อยที่มีแบบแปลนของตัวเอง
    await กล่อง.locator("button").filter({ hasText: มีแปลนเอง }).first().click();
    const กล่องย่อย = page.locator('[role="dialog"]').last();
    await expect(กล่องย่อย.getByText("แปลนเฉพาะรุ่นนี้.pdf")).toBeVisible({ timeout: 15_000 });
    // exact — คำว่า "ของแม่แบบหลัก" โผล่ในหัวข้อ "รายละเอียด (ของแม่แบบหลัก)" ด้วย
    // ที่ต้องตรวจคือ "ป้ายกำกับแบบแปลน" ซึ่งเป็นข้อความนี้ล้วน ๆ
    await expect(กล่องย่อย.getByText("ของแม่แบบหลัก", { exact: true }), "มีแปลนของตัวเอง ต้องไม่ติดป้ายว่าเป็นของแม่แบบหลัก").toHaveCount(0);

    // 3) แม่แบบย่อยที่ไม่มีแบบแปลนเฉพาะ → ใช้ของแม่แบบหลัก + ต้องมีป้ายบอก
    await กล่องย่อย.getByRole("button", { name: ตามแม่, exact: true }).click();
    const กล่องย่อย2 = page.locator('[role="dialog"]').last();
    await expect(กล่องย่อย2.getByText("แปลนแม่แบบหลัก.pdf")).toBeVisible({ timeout: 15_000 });
    await expect(กล่องย่อย2.getByText("ของแม่แบบหลัก", { exact: true }), "ต้องบอกว่ายืมแบบแปลนของแม่แบบหลักมา").toBeVisible();
  });
});
