import { test, expect } from "@playwright/test";
import { open, assertHealthyPage } from "./helpers";

// ─── HQ · ใบเสนอราคาทั้งเครือ ─────────────────────────────────────────────────
// ล็อกสเปก: HQ ดูอย่างเดียว · KPI 4 ตัว · กราฟครบตามที่ข้อมูลจริงรองรับ
// และล็อก "สิ่งที่ต้องไม่มี" เพราะข้อมูลไม่รองรับ/บอสสั่งลบ (กันใครเผลอเอากลับมา)

// กติกา (globals.css): ทุกหน้าใช้ KPI 4 ใบเท่ากัน — ห้ามเพิ่มเป็น 5+
// (.hq-kpi5/.hq-kpi7/.hq-kpi8 ถูกลบทิ้งแล้ว · ปฏิเสธ/หมดอายุ/มูลค่าเฉลี่ย ดูได้จากตาราง+ตัวกรองสถานะแทน)
test("[ux·hq] KPI 4 ตัว คำนวณสอดคล้องกัน (ไม่มี 'ลูกค้าเปิดอ่าน')", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  const tiles = page.locator(".hq-kpi4 > div");
  await expect(tiles).toHaveCount(4);
  // ชื่อการ์ดที่ 4 บอกตัวหารไว้ในชื่อเลย (24 ส.ค. 69) เพราะหน้าภาพรวมยอดขายใช้ตัวหารคนละตัว
  for (const label of ["ใบเสนอราคาทั้งหมด", "มูลค่ารวม", "ตอบรับ", "อัตราตอบรับ (จากใบที่ส่งแล้ว)"]) {
    await expect(page.locator(".hq-kpi4").getByText(label, { exact: true })).toBeVisible();
  }
  // อัตราตอบรับ = ตอบรับ ÷ ใบที่ส่งแล้ว → ต้องกำกับตัวหารไว้ให้ตรวจสอบได้
  await expect(page.locator(".hq-kpi4").getByText(/\d+\/\d+ ใบที่ส่งแล้ว/)).toBeVisible();
});

test("[ux·hq] มีกราฟครบตามที่ข้อมูลจริงรองรับ", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  for (const title of [
    "อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์",
    "มูลค่าใบเสนอราคา เทียบ ยอดขายจริง",
    // "ออกใบเสนอราคาเยอะ แต่ปิดได้น้อย" ถูกย้ายไป /hq/pipeline (ดูเทสต์ด้านล่าง) — ไม่อยู่หน้านี้แล้ว
    // "ประเภทอาคาร" ถอดออก 16 ต.ค. 69 (จัดกลุ่มตามแม่แบบ — เอาแม่แบบออกทั้งระบบ) · ตรวจว่าไม่มีด้านล่าง
    "เทียบรายภูมิภาค",
    "เหตุผลที่เสียโอกาสการขาย",
    "อายุใบเสนอราคาที่ค้างอยู่",
    "แนวโน้มใบเสนอราคารายเดือน",
    "อันดับดีลเลอร์",
  ]) {
    await expect(page.getByText(title, { exact: true }).first(), `ต้องมีกราฟ "${title}"`).toBeVisible();
  }
  await expect(page.getByText("ประเภทอาคาร", { exact: true }), "กราฟประเภทอาคาร (แม่แบบ) ถอดออกแล้ว").toHaveCount(0);
});

// วิเคราะห์การปิดการขายรายดีลเลอร์ (เดิมเป็นการ์ด "ออกใบเยอะ แต่ปิดได้น้อย" บน /hq/quotations)
// ถูกย้ายไป /hq/pipeline เป็น DealerQuotationPerformance → ตาราง"ตัวเลขการปิดการขาย รายดีลเลอร์"
// (ปิดได้ / ปิดไม่ได้ / อัตราปิด รายดีลเลอร์) — ตรวจว่ากราฟยังอยู่และมีคอลัมน์ครบ
test("[ux·hq] วิเคราะห์การปิดการขายรายดีลเลอร์ (ย้ายไป /hq/pipeline)", async ({ page }) => {
  await open(page, "hq", "/hq/pipeline");
  const card = page.locator(".card").filter({ hasText: "ตัวเลขการปิดการขาย รายดีลเลอร์" }).first();
  await expect(card).toBeVisible();
  for (const l of ["ปิดได้", "ปิดไม่ได้", "อัตราปิด"]) {
    await expect(card.getByText(l, { exact: true }).first(), `ต้องมีคอลัมน์ "${l}"`).toBeVisible();
  }
});

// ข้อมูลไม่รองรับ / บอสสั่งลบ — ห้ามกลับมา (ถ้าจะเอากลับต้องมีข้อมูลจริงรองรับก่อน)
test("[ux·hq] ไม่มีอัตราการเปิดอ่าน · ส่วนลด · การใช้แม่แบบ", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  const main = page.locator(".erp");
  await expect(main.getByText(/เปิดอ่าน|Open Rate/)).toHaveCount(0);
  await expect(main.getByText(/ส่วนลด/)).toHaveCount(0);
  await expect(main.getByText(/การใช้แม่แบบ|Template Usage/)).toHaveCount(0);
});

// ⚠️ เดิมล็อกไว้ว่าการ์ด "เหตุผลที่เสียโอกาส" ต้องมีคำกำกับที่มา (เก็บที่ลูกค้าเป้าหมาย ไม่ใช่ใบเสนอราคา)
//    บอสสั่งเอาคำบรรยายเล็กใต้หัวกราฟออกทั้งหมด 25 ส.ค. 69 → คำกำกับนั้นถูกลบไปแล้ว
//    เหลือล็อกแค่ "การ์ดยังอยู่และวาดข้อมูลได้" ส่วนเรื่องที่มาไปอธิบายที่อื่นแทนถ้าต้องการ
test("[ux·hq] การ์ดเหตุผลที่เสียโอกาสยังแสดงผลได้", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ"); // รอหน้าพร้อมก่อน — กันอ่านตอน React ยังไม่ hydrate
  await expect(page.getByText("เหตุผลที่เสียโอกาสการขาย")).toBeVisible();
});

// จังหวัด = ของ "ดีลเลอร์ที่ออกใบ" ไม่ใช่ของลูกค้า → ป้ายต้องเขียนชัด
test("[ux·hq] คอลัมน์/ตัวกรองจังหวัด กำกับว่าเป็นจังหวัดดีลเลอร์", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await expect(page.getByRole("columnheader", { name: "จังหวัดดีลเลอร์" })).toBeVisible();
  await expect(page.getByLabel("จังหวัดดีลเลอร์")).toBeVisible();
});


// HQ ดูอย่างเดียว — ไม่มีสร้าง/แก้ไข/ลบ/อนุมัติ
test("[ux·hq] ไม่มีปุ่มสร้าง/แก้ไข/ลบ/อนุมัติ มีแต่ดู", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  const main = page.locator(".erp");
  for (const name of [/เพิ่มใบเสนอราคา|สร้างใบเสนอราคา/, /^แก้ไข$/, /^ลบ$/, /^อนุมัติ$/]) {
    await expect(main.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(main.getByRole("button", { name: "ดู" }).first()).toBeVisible();
});

// ลิ้นชักรายละเอียด = อ่านอย่างเดียว
// หมายเหตุ: ต้องกดปุ่ม "ดู" ในตารางใบเสนอราคาเท่านั้น — ปุ่มในตารางอันดับดีลเลอร์
// ชื่อ "ดูรายละเอียดดีลเลอร์" ซึ่ง match คำว่า "ดู" ได้เหมือนกัน แต่พาไปหน้าดีลเลอร์
test("[ux·hq] ลิ้นชักดูใบเสนอราคา อ่านอย่างเดียว", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  // ปุ่มดูในตารางใบเสนอราคา = ปุ่มไอคอนล้วน aria-label="ดูรายละเอียด" (ตารางอันดับใช้ "ดูรายละเอียดดีลเลอร์" คนละตัว)
  await page.getByRole("button", { name: "ดูรายละเอียด", exact: true }).first().click();
  const drawer = page.getByRole("dialog", { name: "รายละเอียดใบเสนอราคา" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText("ข้อมูลใบเสนอราคา")).toBeVisible();
  await expect(drawer.getByText(/ส่วนลด|ประวัติการเปิดอ่าน/)).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /แก้ไข|ลบ|อนุมัติ/ })).toHaveCount(0);
});

// อัตราแปลงต้องเป็น "ราย ÷ ราย" — ไม่ใช่ "จำนวนใบ ÷ ราย"
// ของเดิมหารด้วยจำนวนใบ แล้วโชว์ 150% (บริษัทเดียวออกใบได้หลายใบ + ใบของลูกค้าเก่าถูกนับ
// ทั้งที่เจ้าตัวไม่อยู่ในตัวส่วนแล้ว) — อ่านเหมือนปิดการขายเกิน 100% ซึ่งเป็นไปไม่ได้
//
// ⚠️ ห้ามตรวจแค่ "ไม่เกิน 100%" — เคยเขียนแบบนั้นแล้วเทสต์ผ่านทั้งที่สูตรผิด
//    เพราะข้อมูลทดสอบมีใบน้อยกว่าราย เลยไม่มีทางเกิน 100% อยู่แล้ว (เทสต์โกหก)
//    ต้องเทียบกับตัวเลขใน tooltip ซึ่งพก "รายที่ออกใบแล้ว / รายทั้งหมด / จำนวนใบ" มาครบ
test("[ux·hq] อัตราแปลง = รายที่ออกใบแล้ว ÷ รายทั้งหมด (ไม่ใช่จำนวนใบ)", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  const card = page.locator(".card", { hasText: "อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์" }).first();
  await expect(card).toBeVisible();
  // คำอธิบายใต้หัวข้อถูกถอดออก (ชื่อการ์ดบอกครบในตัวแล้ว) — ตรวจที่ "หน่วยของแถบ" แทน
  // ทั้งสองแถบต้องเป็น "ราย" ไม่งั้น % กับความยาวแถบจะไม่ตรงกันเหมือนบั๊กเดิม
  await expect(card.getByText(/\d+ ราย/).first()).toBeVisible();
  await expect(card.getByText(/\d+ ใบ$/), "แถบต้องไม่กลับไปวัดด้วยจำนวนใบอีก").toHaveCount(0);

  const cells = card.locator("span[title*='ออกใบเสนอราคาแล้ว']");
  const n = await cells.count();
  expect(n, "กราฟต้องมีอย่างน้อยหนึ่งดีลเลอร์ให้ตรวจ").toBeGreaterThan(0);

  let checkedAgainstDocs = 0;
  for (let i = 0; i < n; i++) {
    const title = (await cells.nth(i).getAttribute("title")) ?? "";
    const shown = ((await cells.nth(i).innerText()) ?? "").trim();
    const m = title.match(/ออกใบเสนอราคาแล้ว (\d+) จากลูกค้าเป้าหมาย (\d+) ราย \(รวม (\d+) ใบ\)/);
    expect(m, `tooltip ต้องบอกที่มาของตัวเลขครบ: "${title}"`).not.toBeNull();
    const [quoted, leads, docs] = [Number(m![1]), Number(m![2]), Number(m![3])];

    expect(quoted, `รายที่ออกใบแล้วต้องไม่เกินรายทั้งหมด (${title})`).toBeLessThanOrEqual(leads);
    expect(shown, `อัตราต้องคิดจาก ${quoted}/${leads} ราย (${title})`).toBe(`${Math.round(quoted / leads * 100)}%`);

    // เคสที่พิสูจน์ว่าไม่ได้หารด้วยจำนวนใบ: ใบ ≠ ราย แล้วค่าที่โชว์ยังไม่ใช่ผลของจำนวนใบ
    if (docs !== quoted && Math.round(docs / leads * 100) !== Math.round(quoted / leads * 100)) {
      expect(shown, `ค่าที่โชว์ตรงกับสูตรเก่า (จำนวนใบ ÷ ราย) — สูตรถูกย้อนกลับแล้ว (${title})`)
        .not.toBe(`${Math.round(docs / leads * 100)}%`);
      checkedAgainstDocs++;
    }
  }
  expect(checkedAgainstDocs, "ข้อมูลทดสอบไม่มีดีลเลอร์ที่จำนวนใบต่างจากจำนวนราย — เทสต์นี้จะพิสูจน์อะไรไม่ได้เลย").toBeGreaterThan(0);
});

