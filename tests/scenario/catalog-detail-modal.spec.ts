// ── กล่องรายละเอียดแม่แบบ — ออกแบบใหม่ตามแบบที่บอสส่งมา (28 ส.ค. 69) ──────────────
//
// สิ่งที่ต้องมีทั้งสองฝั่ง (สำนักงานใหญ่ + ดีลเลอร์) เพราะเป็นกล่องเดียวกันคนละแอป:
//   • รูปใหญ่เต็มความกว้าง + การ์ดข้อมูลลอยทับ
//   • ค้นหาแม่แบบย่อย · นับจำนวนท้ายกล่อง (มุมมองรายการถูกเอาออกตามคำสั่ง 28 ส.ค. 69 เหลือแบบตารางอย่างเดียว)
//   • การ์ดแม่แบบย่อยบอก "ราคา" ใต้ชื่อ
//
// ⚠️ แบบที่บอสส่งมามี "จังหวัด" ใต้ชื่อแม่แบบย่อย แต่ระบบไม่เก็บจังหวัดของแม่แบบย่อย
//    (เก็บแค่ ชื่อ/รูป/ราคา — ดู SolutionProduct) จึงใช้ราคาแทน ไม่เอาฟิลด์อื่นมาสวมรอย
//
// ⚠️ ต้องวัด "ล้นแนวนอน" ด้วยทุกครั้ง — กล่องกว้าง 1100px มีตารางการ์ดข้างใน
//    ถ้าวันหนึ่งมีคนใส่ของที่ย่อไม่ได้เข้ามา แถบเลื่อนล่างจะโผล่แบบที่เคยโดนทักมาแล้ว
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, DEALER_ORIGIN, loginUI, db, TAG } from "./funcHelpers";
import { settle } from "./helpers";
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
const ID="zzt-viewmodal", ชื่อ=`${TAG}-กล่องดู`;
const รูป = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#0a4a86"/></svg>').toString("base64");
test.beforeAll(async () => {
  const sb = await db(ADMIN);
  await sb.from("master_catalog").delete().eq("id", ID);
  await sb.from("master_catalog").insert({ id: ID, name: ชื่อ, spec: "รายละเอียดทดสอบ", price: 6800, unit: "ตร.ม.",
    effective_date: "1 มิ.ย. 2569", price_history: [], image: รูป,
    subtypes: ["อาหาร","ผลิตเหล็ก","พลาสติก","สิ่งทอ"], subtype_prices: { "อาหาร": 7200 } });
});
test.afterAll(async () => { await (await db(ADMIN)).from("master_catalog").delete().eq("id", ID); });

test("[ui·hq] กล่องรายละเอียดแม่แบบ: รูปใหญ่ · ค้นหา · ราคารายแม่แบบย่อย", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาแม่แบบ...").fill(ชื่อ);
  await page.getByText(ชื่อ).first().click();

  const กล่อง = page.locator('[role="dialog"]').last();
  await expect(กล่อง.getByText("แม่แบบย่อยทั้งหมด")).toBeVisible({ timeout: 15_000 });
  await expect(กล่อง.getByText("ทั้งหมด 4 แม่แบบย่อย")).toBeVisible();
  await expect(กล่อง.getByText("รายละเอียดทดสอบ")).toBeVisible();
  const การ์ด = (ชื่อย่อย: string) => กล่อง.locator("button").filter({ hasText: ชื่อย่อย }).first();
  await expect(การ์ด("อาหาร")).toBeVisible();
  await expect(การ์ด("อาหาร"), "ย่อยที่ตั้งราคาเองต้องโชว์ราคาของตัวเอง").toContainText("7,200");
  await expect(การ์ด("พลาสติก"), "ย่อยที่ไม่ได้ตั้งราคาต้องโชว์ราคาแม่แบบหลัก").toContainText("6,800");

  // ค้นหา
  await กล่อง.getByLabel("ค้นหาแม่แบบย่อย").fill("เหล็ก");
  await expect(การ์ด("พลาสติก")).toHaveCount(0);
  await expect(การ์ด("ผลิตเหล็ก")).toBeVisible();
  await กล่อง.getByLabel("ค้นหาแม่แบบย่อย").fill("");

  // ⚠️ ต้องไม่มีปุ่มสลับมุมมองแล้ว — บอสสั่งเอามุมมองรายการออก เหลือแบบตารางอย่างเดียว (28 ส.ค. 69)
  await expect(กล่อง.getByRole("button", { name: /มุมมอง(ตาราง|รายการ)/ })).toHaveCount(0);

  // ล้นแนวนอนไหม
  const ล้น = await กล่อง.evaluate((root: HTMLElement) => {
    const out: string[] = [];
    for (const el of [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[])
      if (el.scrollWidth - el.clientWidth > 1) out.push(`${el.tagName}.${(el.className||"").toString().slice(0,30)}`);
    return { w: Math.round(root.getBoundingClientRect().width), ล้น: out };
  });
  expect(ล้น.ล้น).toEqual([]);
});

test("[ui·dealer] กล่องรายละเอียดแม่แบบใช้หน้าตาชุดเดียวกับฝั่งสำนักงานใหญ่", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/products`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "รายละเอียด", exact: true }).first().click();

  const กล่อง = page.locator('[role="dialog"]').last();
  await expect(กล่อง.getByText("แม่แบบย่อยทั้งหมด")).toBeVisible({ timeout: 15_000 });
  await expect(กล่อง.getByText(/^ทั้งหมด \d+ แม่แบบย่อย$/)).toBeVisible();
  await expect(กล่อง.getByLabel("ค้นหาแม่แบบย่อย")).toBeVisible();
  await expect(กล่อง.getByRole("button", { name: /มุมมอง(ตาราง|รายการ)/ })).toHaveCount(0);

  const ผล = await กล่อง.evaluate((root: HTMLElement) => {
    const out: string[] = [];
    for (const el of [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[])
      if (el.scrollWidth - el.clientWidth > 1) out.push(`${el.tagName}.${(el.className||"").toString().slice(0,30)}`);
    return { w: Math.round(root.getBoundingClientRect().width), ล้น: out };
  });
  expect(ผล.ล้น).toEqual([]);
  const ข้อความ = await page.locator("body").innerText();
  expect(ข้อความ, "ห้ามมีคอมเมนต์โค้ดโผล่").not.toMatch(/\/\*|\*\//);
});

test.describe("แม่แบบย่อยเยอะ", () => {
  const ID = "zzt-hero3", ชื่อ = `${TAG}-หลายย่อย`;
  const รูป = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#0a4a86"/></svg>').toString("base64");
  test.beforeAll(async () => {
  const sb = await db(ADMIN);
  await sb.from("master_catalog").delete().eq("id", ID);
  await sb.from("master_catalog").insert({ id: ID, name: ชื่อ, spec: "ปรับผังใช้งานได้หลายรูปแบบ เช่น สำนักงาน โรงเรียน สถานพยาบาล และอาคารพาณิชย์ · โครงเหล็กมาตรฐาน ติดตั้งเร็ว",
    price: 6200, unit: "ตร.ม.", effective_date: "1 มิ.ย. 2569", price_history: [], image: รูป,
    subtypes: ["อาคารสำนักงาน","โชว์รูม","อาคารพาณิชย์","อาคารเรียน","สถานพยาบาล","คลังสินค้า","โรงอาหาร"] });
});
  test.afterAll(async () => { await (await db(ADMIN)).from("master_catalog").delete().eq("id", ID); });

  // ── บั๊กจริง (บอสเจอเอง 28 ส.ค. 69): รูปใหญ่ถูกบีบเหลือ 2px แล้วการ์ดข้อมูลล้นโดนตัดหัว ──
  //   เหตุ: กรอบรูปเป็นลูกของกล่องแนวตั้งที่เลื่อนได้ · ความสูงมาจาก aspect-ratio
  //   ซึ่ง flexbox ถือว่า "ย่อได้" พอแม่แบบย่อยเยอะ (7 ตัว) มันเลยถูกบีบจนหาย
  //   ⚠️ ต้องมีแม่แบบย่อยเยอะพอ ไม่งั้นจับไม่ได้ (เทสต์เดิมใช้ 4 ตัว เนื้อหายังไม่ล้นพอให้ flexbox บีบ)
  test("[ui·hq] รูปใหญ่ในกล่องรายละเอียดต้องไม่ถูกบีบเมื่อมีแม่แบบย่อยเยอะ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาแม่แบบ...").fill(ชื่อ);
  await page.getByText(ชื่อ).first().click();
  const กล่อง = page.locator('[role="dialog"]').last();
  await expect(กล่อง.getByText("แม่แบบย่อยทั้งหมด")).toBeVisible({ timeout: 15_000 });

  const วัด = async (ป้าย: string) => {
    const r = await กล่อง.locator(`img[alt="${ชื่อ}"]`).first().evaluate((el: HTMLElement) => {
      const hero = el.parentElement as HTMLElement;
      const card = hero.querySelector("div:last-child") as HTMLElement;
      const hr = hero.getBoundingClientRect(), cr = card.getBoundingClientRect();
      return { heroW: Math.round(hr.width), heroH: Math.round(hr.height),
               ควรสูง: Math.round(hr.width * 9 / 21),
               การ์ดล้นบน: Math.round(hr.top - cr.top) };
    });
    return r;
  };
  const ตาราง = await วัด("มุมมองตาราง");
  expect(Math.abs(ตาราง.heroH - ตาราง.ควรสูง), "รูปใหญ่ต้องสูงตามสัดส่วน 21:9 ไม่ใช่ถูกบีบจนแบน").toBeLessThanOrEqual(2);
  expect(ตาราง.การ์ดล้นบน, "การ์ดข้อมูลต้องไม่ล้นออกนอกกรอบรูป").toBeLessThanOrEqual(0);
});
});

// ── กล่อง "ดูรายละเอียด" ของแม่แบบย่อย ต้องดูได้ครบทุกอย่างที่ระบบมีจริง (บอสสั่ง 28 ส.ค. 69) ──
//
// ⚠️ ประวัติราคารอบที่บันทึกก่อน 28 ส.ค. 69 ไม่ได้เก็บราคาแม่แบบย่อยไว้
//    ต้องขึ้นว่า "ไม่ได้บันทึกราคาแม่แบบย่อยไว้" ห้ามเอาราคาแม่แบบหลักมาแสดงแทนเหมือนเป็นราคาย่อย
test.describe("รายละเอียดแม่แบบย่อย", () => {
  const ID = "zzt-subdetail", ชื่อ = `${TAG}-ย่อยละเอียด`;
  const ย่อย = "ห้องเย็น", ย่อยตามหลัก = "ทั่วไป";

  test.beforeAll(async () => {
    const sb = await db(ADMIN);
    await sb.from("master_catalog").delete().eq("id", ID);
    await sb.from("master_catalog").insert({
      id: ID, name: ชื่อ, spec: "สเปกของแม่แบบหลัก", price: 5000, unit: "ตร.ม.",
      effective_date: "1 ส.ค. 2569", subtypes: [ย่อย, ย่อยตามหลัก], subtype_prices: { [ย่อย]: 7500 },
      price_history: [
        { price: 4500, effectiveDate: "1 ม.ค. 2569", note: "รอบที่เก็บราคาย่อยแล้ว", subtypePrices: { [ย่อย]: 6750 } },
        { price: 4000, effectiveDate: "1 ก.ค. 2568", note: "รอบเก่าก่อนเก็บราคาย่อย" },
      ],
    });
  });
  test.afterAll(async () => { await (await db(ADMIN)).from("master_catalog").delete().eq("id", ID); });

  test("[ui·hq] แม่แบบย่อย: ราคาของตัวเอง · เทียบแม่แบบหลัก · ประวัติราคา · ข้ามไปตัวอื่นได้", async ({ page }) => {
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/master`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder("ค้นหาแม่แบบ...").fill(ชื่อ);
    await page.getByText(ชื่อ).first().click();
    await page.locator('[role="dialog"]').last().locator("button").filter({ hasText: ย่อย }).first().click();

    const กล่อง = page.locator('[role="dialog"]').last();
    await expect(กล่อง.getByText("ราคากลางของแม่แบบย่อยนี้")).toBeVisible({ timeout: 15_000 });
    await expect(กล่อง, "ราคาของแม่แบบย่อยนี้").toContainText("7,500");
    await expect(กล่อง, "ราคาแม่แบบหลักไว้เทียบ").toContainText("5,000");
    await expect(กล่อง, "ตั้งราคาเฉพาะไว้ ต้องบอกให้รู้").toContainText("ตั้งเฉพาะ");
    await expect(กล่อง, "ต่างจากแม่แบบหลักกี่ %").toContainText("แพงกว่า 50%");
    await expect(กล่อง, "สเปกของแม่แบบหลัก").toContainText("สเปกของแม่แบบหลัก");

    // ประวัติราคา — รอบที่เก็บราคาย่อยไว้ vs รอบเก่าที่ไม่ได้เก็บ
    await expect(กล่อง, "รอบที่บันทึกราคาย่อยไว้ ต้องโชว์ราคานั้น").toContainText("6,750");
    await expect(กล่อง, "รอบเก่าต้องบอกตามตรงว่าไม่มีข้อมูล").toContainText("ไม่ได้บันทึกราคาแม่แบบย่อยไว้");

    // ข้ามไปดูแม่แบบย่อยตัวอื่นในกลุ่มเดียวกัน
    await กล่อง.getByRole("button", { name: ย่อยตามหลัก, exact: true }).click();
    await expect(page.locator('[role="dialog"]').last(), "ตัวที่ไม่ได้ตั้งราคาเอง ต้องบอกว่าใช้ตามแม่แบบหลัก").toContainText("ตามแม่แบบหลัก");
  });
});
