import { test, expect } from "@playwright/test";
import { open, ดักข้อความแจ้งเตือน, รอข้อความแจ้งเตือน, settle } from "./helpers";
import { RYG } from "./supabaseEnv";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ─── ปุ่มพิมพ์ใบเสนอราคา (E2E) ────────────────────────────────────────────────
// เอกสารนี้คือกระดาษแผ่นเดียวที่หลุดออกไปถึงมือลูกค้า แต่เดิมไม่มีเทสต์เลยสักข้อ
// (ช่องว่างที่ผลตรวจภายนอกชุดที่ 3 ทักไว้ 24 ส.ค. 69)
//
// ตรรกะของตัวเอกสาร (ยอดเงิน/วันยืนราคา/เงื่อนไข) อยู่ที่ tests/unit/quotationPrint.test.ts
// ไฟล์นี้วัดคนละเรื่อง: กดปุ่มบนหน้าจอจริงแล้วได้เอกสารออกมาไหม และด่านกันพิมพ์ทำงานไหม

// รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 7): หน้าใบเสนอราคาเป็นรายการอย่างเดียว — ดู/พิมพ์ใบที่แผงลีด › แท็บใบเสนอราคา
//   ข้อทดสอบวางใบของตัวเอง (ทางเดียวกับของจริง: ใบ HQ → ใบลูกค้า) แล้วพิมพ์จากหน้าดูใบในแผงลีด
const บริษัท = `ZZTEST-พิมพ์ใบ-${Date.now() % 100000}`;
let ใบHQ: ใบHQพร้อมใช้ | undefined;
let เลขใบ = "";
test.beforeAll(async () => {
  ใบHQ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: บริษัท, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดพิมพ์", qty: 2, unit: "ชุด", unitCost: 1000 }] });
  เลขใบ = (await ทำใบลูกค้าจากใบHQ(RYG, ใบHQ, { customer: บริษัท, markupPercent: 10 })).id;
});
test.afterAll(() => { if (ใบHQ) ล้างใบHQทดสอบ("RYG", [ใบHQ.leadNum]); });
async function เปิดหน้าดูใบ(page: import("@playwright/test").Page) {
  await open(page, "dealer", "/leads");
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(บริษัท);
  await page.locator("tbody tr").filter({ hasText: บริษัท }).first().getByTitle("ดูรายละเอียด").click({ timeout: 20_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.locator(`[data-quote-item="${เลขใบ}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
}

test("[func·dealer] ยังไม่ตั้งชื่อบริษัท → ห้ามพิมพ์ ต้องบอกเหตุผลและพาไปหน้าตั้งค่า", async ({ page, context }) => {
  await context.addInitScript(() => { window.print = () => {}; });
  // คำเตือนเป็นข้อความของระบบ (sonner) แล้ว — กล่องเบราว์เซอร์ไม่ขึ้นอีก (บอสสั่ง 2 ก.ย. 69)
  const แจ้งเตือน = ดักข้อความแจ้งเตือน(page);

  await open(page, "dealer", "/settings");
  const ชื่อบริษัท = page.getByLabel("ชื่อบริษัท").or(page.locator('input[placeholder="บริษัท ตัวอย่าง จำกัด"]')).first();
  const เดิม = (await ชื่อบริษัท.inputValue()).trim();
  test.skip(!!เดิม, "สาขานี้ตั้งชื่อบริษัทไว้แล้ว — ด่านนี้ทดสอบไม่ได้โดยไม่ลบข้อมูลจริง");

  await เปิดหน้าดูใบ(page);
  await page.getByRole("button", { name: "พิมพ์ PDF", exact: true }).click();

  // ต้องไม่มีเอกสารเปิดออกมา — เอกสารที่ไม่มีชื่อผู้เสนอราคาส่งให้ลูกค้าไม่ได้
  await expect.poll(() => context.pages().length, { timeout: 3000 }).toBe(1);
  expect(await รอข้อความแจ้งเตือน(page, /ชื่อบริษัท/),
    `ต้องบอกด้วยว่าติดที่อะไร ไม่ใช่กดแล้วเงียบ (ข้อความที่ขึ้น: ${JSON.stringify(แจ้งเตือน())})`).toContain("ชื่อบริษัท");
  await expect(page).toHaveURL(/\/settings/);
});

test("[func·dealer] ตั้งชื่อบริษัทแล้ว → กดพิมพ์ได้เอกสารที่มีเลขที่ใบและยอดเงินจริง", async ({ page, context }) => {
  await context.addInitScript(() => { window.print = () => {}; });
  page.on("dialog", async d => { await d.dismiss(); });

  const ชื่อทดสอบ = "ZZTEST บริษัทพิมพ์เอกสาร จำกัด";
  await open(page, "dealer", "/settings");
  const ชื่อบริษัท = page.getByLabel("ชื่อบริษัท").or(page.locator('input[placeholder="บริษัท ตัวอย่าง จำกัด"]')).first();
  const เดิม = await ชื่อบริษัท.inputValue();

  try {
    if (เดิม.trim() !== ชื่อทดสอบ) {
      await ชื่อบริษัท.fill(ชื่อทดสอบ);
      const ปุ่มบันทึก = page.getByRole("button", { name: /^บันทึก/ }).first();
      await ปุ่มบันทึก.click();
      // ⚠️ ต้องรอให้ "บันทึกเสร็จจริง" ก่อนเปลี่ยนหน้า (แก้ 27 ส.ค. 69)
      //    ปุ่มจะขึ้น "กำลังบันทึก…" ระหว่างเขียน แล้วกลับมาเป็น "บันทึก" เมื่อจบ
      //    เปลี่ยนหน้าตอนยังเขียนไม่เสร็จ = คำขอถูกยกเลิกกลางทาง ข้อมูลไม่ลงฐาน
      //    (นี่คือบั๊กจริงที่เจอจากเทสต์นี้ — ตอนนี้แอปกันไว้แล้ว เทสต์จึงต้องรอเหมือนผู้ใช้จริง)
      await expect(page.getByText("บันทึกการตั้งค่าแล้ว")).toBeVisible({ timeout: 20_000 });
      await expect.poll(async () => (await ชื่อบริษัท.inputValue()).trim(), { timeout: 8000 }).toBe(ชื่อทดสอบ);
    }

    await เปิดหน้าดูใบ(page);
    // เลขที่ใบที่เปิดอยู่ = ใบของข้อทดสอบนี้ (เปิดจากรายการใบของลีดนี้ตรง ๆ)
    const เลขที่ใบ = เลขใบ;
    await expect(page.getByText(เลขที่ใบ, { exact: true }).first(), "หน้าดูใบเปิดที่ใบนี้").toBeVisible({ timeout: 15_000 });

    const [เอกสาร] = await Promise.all([
      context.waitForEvent("page"),
      page.getByRole("button", { name: "พิมพ์ PDF", exact: true }).click(),
    ]);
    await เอกสาร.waitForLoadState("domcontentloaded");
    const html = await เอกสาร.content();

    expect(html).toContain("ใบเสนอราคา");
    expect(html, `ต้องเป็นใบเดียวกับที่เปิดอยู่ (${เลขที่ใบ})`).toContain(เลขที่ใบ);
    // คำที่ใช้บนกระดาษเปลี่ยนตอนทำภาษีหัก ณ ที่จ่าย (28 ส.ค. 69) — ยึดตามเอกสารจริง
    //   มูลค่างาน → ภาษีมูลค่าเพิ่ม → รวมเป็นเงิน → (หัก ณ ที่จ่าย) → ยอดชำระสุทธิ
    expect(html, "ต้องแยกยอดก่อนภาษี / ภาษี / ยอดชำระสุทธิ ให้ลูกค้าเห็น").toContain("มูลค่างาน");
    expect(html).toContain("ภาษีมูลค่าเพิ่ม");
    expect(html).toContain("รวมเป็นเงิน");
    expect(html).toContain("ยอดชำระสุทธิ");
    // เอกสารออกในนามดีลเลอร์ ห้ามมีชื่อ Benjamin (ข้อบังคับเรื่องแบรนด์)
    expect(html.toLowerCase()).not.toContain("benjamin");
    // หัวกระดาษต้องไม่เขียนอายุใบตายตัว ต้องเป็นวันจริงของใบนั้น (แก้ 24 ส.ค. 69)
    expect(html).not.toMatch(/ยืนราคา\s*30\s*วัน/);

    await เอกสาร.close();
  } finally {
    // คืนค่าเดิมเสมอ — เทสต์ห้ามทิ้งชื่อบริษัทปลอมไว้ในข้อมูลจริง
    await open(page, "dealer", "/settings");
    const ช่อง = page.getByLabel("ชื่อบริษัท").or(page.locator('input[placeholder="บริษัท ตัวอย่าง จำกัด"]')).first();
    if ((await ช่อง.inputValue()) !== เดิม) {
      await ช่อง.fill(เดิม);
      await page.getByRole("button", { name: /^บันทึก/ }).first().click();
      await page.waitForTimeout(1200);
    }
  }
});
