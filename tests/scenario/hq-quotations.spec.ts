import { test, expect } from "@playwright/test";
import { open, assertHealthyPage } from "./helpers";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";
import { เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ─── HQ · ใบเสนอราคาทั้งเครือ ─────────────────────────────────────────────────
// ล็อกสเปก: HQ ดูอย่างเดียว · KPI 4 ตัว · กราฟครบตามที่ข้อมูลจริงรองรับ
// และล็อก "สิ่งที่ต้องไม่มี" เพราะข้อมูลไม่รองรับ/บอสสั่งลบ (กันใครเผลอเอากลับมา)

// กติกา (globals.css): ทุกหน้าใช้ KPI 4 ใบเท่ากัน — ห้ามเพิ่มเป็น 5+
// (.hq-kpi5/.hq-kpi7/.hq-kpi8 ถูกลบทิ้งแล้ว · ปฏิเสธ/หมดอายุ/มูลค่าเฉลี่ย ดูได้จากตาราง+ตัวกรองสถานะแทน)
test("[ux·hq] KPI 4 ตัว คำนวณสอดคล้องกัน (ไม่มี 'ลูกค้าเปิดอ่าน')", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  // การ์ด 4 ใบตามชุดที่บอสสั่ง (22 ต.ค. 69 · ใบ 0246) — ตัวเลขตรงฐาน ตรวจใน kpi-cards.spec.ts
  const tiles = page.locator("[data-kpi-row] [data-kpi]");
  await expect(tiles).toHaveCount(4);
  for (const label of ["ส่งลูกค้าในช่วงนี้", "รอลูกค้าตอบ", "ตอบรับ (มูลค่า)", "อัตราตอบรับ (จากใบที่ส่งแล้ว)"]) {
    await expect(page.locator("[data-kpi-row]").getByText(label, { exact: true })).toBeVisible();
  }
  // อัตราตอบรับต้องกำกับตัวหารไว้ให้ตรวจสอบได้ (ต่างจากอัตราปิดการขายที่นับจากลีด)
  await expect(page.locator("[data-kpi='acceptRate']")).toContainText("ตอบรับ ÷ ใบที่ส่งในช่วงนี้");
});

test("[H10] มีกราฟครบตามที่ข้อมูลจริงรองรับ", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  for (const title of [
    "อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์",
    // "มูลค่าใบเสนอราคา เทียบ ยอดขายจริง" + "อันดับดีลเลอร์" เอาออก (FLOW รอบ 5) — ตรวจว่าไม่มีในข้อถัดไป
    // "ออกใบเสนอราคาเยอะ แต่ปิดได้น้อย" ถูกย้ายไป /hq/pipeline (ดูเทสต์ด้านล่าง) — ไม่อยู่หน้านี้แล้ว
    // "ประเภทอาคาร" ถอดออก 16 ต.ค. 69 (จัดกลุ่มตามแม่แบบ — เอาแม่แบบออกทั้งระบบ) · ตรวจว่าไม่มีด้านล่าง
    "เทียบรายภูมิภาค",
    "เหตุผลที่เสียโอกาสการขาย",
    "อายุใบเสนอราคาที่ค้างอยู่",
    "แนวโน้มใบเสนอราคารายเดือน",
  ]) {
    await expect(page.getByText(title, { exact: true }).first(), `ต้องมีกราฟ "${title}"`).toBeVisible();
  }
  await expect(page.getByText("ประเภทอาคาร", { exact: true }), "กราฟประเภทอาคาร (แม่แบบ) ถอดออกแล้ว").toHaveCount(0);
});

// FLOW: "ผลงานดีลเลอร์ (ยอดขาย เป้า อัตราปิด) — ทำได้ที่เดียว: HQ › ภาพรวมยอดขาย" (ตรวจเทียบ FLOW รอบ 5 · 28 ต.ค. 69)
//   หน้าใบเสนอราคาทั้งเครือเคยมี "มูลค่าใบเสนอราคา เทียบ ยอดขายจริง" (ขายได้จริงรายดีลเลอร์) + ตาราง "อันดับดีลเลอร์"
//   = ผลงานดีลเลอร์ซ้ำกับภาพรวมยอดขาย → เอาออก ห้ามกลับมา
test("[H10] ไม่มีผลงานดีลเลอร์ (ยอดขายจริง/อันดับ) — อยู่ภาพรวมยอดขายที่เดียว", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  await expect(page.getByText("แนวโน้มใบเสนอราคารายเดือน", { exact: true }).first()).toBeVisible();
  const main = page.locator(".erp");
  await expect(main.getByText("มูลค่าใบเสนอราคา เทียบ ยอดขายจริง", { exact: true })).toHaveCount(0);
  await expect(main.getByText("อันดับดีลเลอร์", { exact: true })).toHaveCount(0);
  await expect(main.getByText("ขายได้จริง", { exact: true })).toHaveCount(0);
  await expect(main.getByRole("button", { name: "ดูรายละเอียดดีลเลอร์" })).toHaveCount(0);
});

// วิเคราะห์การปิดการขายรายดีลเลอร์ (เดิมเป็นการ์ด "ออกใบเยอะ แต่ปิดได้น้อย" บน /hq/quotations)
// ถูกย้ายไป /hq/pipeline เป็น DealerQuotationPerformance → ตาราง"ตัวเลขการปิดการขาย รายดีลเลอร์"
// (ปิดได้ / ปิดไม่ได้ / อัตราปิด รายดีลเลอร์) — ตรวจว่ากราฟยังอยู่และมีคอลัมน์ครบ
test("[ux·hq] วิเคราะห์การปิดการขายรายดีลเลอร์ (ย้ายไป /hq/pipeline)", async ({ page }) => {
  await open(page, "hq", "/hq/pipeline");
  const card = page.locator(".card").filter({ hasText: "ตัวเลขการปิดการขาย รายดีลเลอร์" }).first();
  await expect(card).toBeVisible();
  // รอบ 4: คอลัมน์อัตราใช้ชื่อกลาง "อัตราปิดการขาย" (สูตรเดียวทุกหน้า · lib/winRate.ts)
  await expect(card.getByText("อัตราปิด", { exact: true }), "ไม่มีชื่อเก่า \"อัตราปิด\"").toHaveCount(0);
  for (const l of ["ปิดได้", "ปิดไม่ได้", "อัตราปิดการขาย"]) {
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
  // ข้อมูลของข้อเอง (สาขาของข้อ · กรองหน้าด้วยสาขานี้) — รู้ค่าแน่นอน: ลูกค้าเป้าหมาย 4 ราย · ถึงขั้นเสนอราคา 2 ราย · ใบ 3 ใบ (รายแรกมี 2 ใบ)
  //   สูตรถูก = 2/4 = 50% · สูตรเก่า (ใบ ÷ ราย) = 3/4 = 75% → ตัวเลขสองสูตรต่างกันเสมอ ข้อนี้จึงพิสูจน์สูตรได้ทุกครั้ง
  //   เดิมอ่านแถบของทุกสาขาในเครือ: สาขาทดสอบของข้ออื่นที่มีใบแต่ยังไม่มีลูกค้าเป้าหมายในช่วง (หรือเพิ่งลบ) ขึ้นคำว่า
  //   "ยังไม่มีลูกค้าเป้าหมายในช่วงที่เลือก" → แยกตัวเลขจาก tooltip ไม่ได้ = ตก (ต้นเหตุไม่นิ่ง 29 ต.ค. 69)
  //   และ "ต้องมีสาขาที่ใบ ≠ ราย" ขึ้นกับข้อมูลตั้งต้นร่วม
  const สาขา = await สร้างสาขาของข้อ({ จังหวัด: "สกลนคร", ภาค: "อีสาน" });
  try {
    const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const เลข = [เลขลูกค้าเป้าหมายทดสอบ(), เลขลูกค้าเป้าหมายทดสอบ(), เลขลูกค้าเป้าหมายทดสอบ(), เลขลูกค้าเป้าหมายทดสอบ()];
    const สถานะ = ["QUOTED", "QUOTED", "BULLET", "WAITING"];   // NEGO เลิกใช้แล้ว (ใบ 0257 · ฐานไม่รับ)
    // วางที่ฐานตรง (ปิดตัวดัก) — ใบเสนอราคาแบบมีลูกค้าเป้าหมายถึงขั้นเสนอราคา สร้างผ่านหน้าจอต้องผ่านใบ HQ ทั้งสาย · ข้อนี้วัดสูตรกราฟ
    const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
      insert into public.leads (id, num_id, dealer_code, company, name, phone, province, status, created_date) values
        ${เลข.map((n, i) => `('#L-${n}', ${n}, '${สาขา.รหัส}', 'ZZTEST-อัตราแปลง-${i}', 'ZZTEST', '000000${String(i).padStart(4, "0")}', 'สกลนคร', '${สถานะ[i]}', '${วันนี้}')`).join(", ")};
      insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, deal_id) values
        ('${สาขา.รหัส}', 'Q-${สาขา.รหัส}-1', 'ZZTEST-อัตราแปลง-0', 'ZZTEST', 'sent_to_client', 1000, '${วันนี้}', ${เลข[0]}),
        ('${สาขา.รหัส}', 'Q-${สาขา.รหัส}-2', 'ZZTEST-อัตราแปลง-0', 'ZZTEST', 'sent_to_client', 2000, '${วันนี้}', ${เลข[0]}),
        ('${สาขา.รหัส}', 'Q-${สาขา.รหัส}-3', 'ZZTEST-อัตราแปลง-1', 'ZZTEST', 'sent_to_client', 3000, '${วันนี้}', ${เลข[1]});
      set local session_replication_role = origin;`);
    if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");

    await open(page, "hq", `/hq/quotations?dealer=${สาขา.รหัส}`);
    await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
    const card = page.locator(".card", { hasText: "อัตราลูกค้าเป้าหมายที่ออกใบเสนอราคา แยกตามดีลเลอร์" }).first();
    await expect(card).toBeVisible();
    // คำอธิบายใต้หัวข้อถูกถอดออก (ชื่อการ์ดบอกครบในตัวแล้ว) — ตรวจที่ "หน่วยของแถบ" แทน
    // ทั้งสองแถบต้องเป็น "ราย" ไม่งั้น % กับความยาวแถบจะไม่ตรงกันเหมือนบั๊กเดิม
    await expect(card.getByText(/\d+ ราย/).first()).toBeVisible();
    await expect(card.getByText(/\d+ ใบ$/), "แถบต้องไม่กลับไปวัดด้วยจำนวนใบอีก").toHaveCount(0);

    // กรองสาขาของข้อแล้ว = เหลือแถบเดียว (ตัวกรองดีลเลอร์ติดแล้ว ไม่ใช่อ่านตอนยังเป็นทั้งเครือ)
    const cells = card.locator("span[title*='ออกใบเสนอราคาแล้ว']");
    await expect(cells, "กรองสาขาของข้อแล้วเหลือแถบของสาขานี้แถบเดียว").toHaveCount(1);
    await expect(card, "แถบเป็นของสาขาของข้อ").toContainText(สาขา.รหัส);
    await expect(cells.first(), "tooltip บอกที่มาของตัวเลขครบ (ราย · ราย · ใบ)")
      .toHaveAttribute("title", "ออกใบเสนอราคาแล้ว 2 จากลูกค้าเป้าหมาย 4 ราย (รวม 3 ใบ)");
    const title = (await cells.first().getAttribute("title")) ?? "";
    const shown = ((await cells.first().innerText()) ?? "").trim();
    const m = title.match(/ออกใบเสนอราคาแล้ว (\d+) จากลูกค้าเป้าหมาย (\d+) ราย \(รวม (\d+) ใบ\)/);
    expect(m, `tooltip ต้องบอกที่มาของตัวเลขครบ: "${title}"`).not.toBeNull();
    const [quoted, leads, docs] = [Number(m![1]), Number(m![2]), Number(m![3])];
    expect(quoted, `รายที่ออกใบแล้วต้องไม่เกินรายทั้งหมด (${title})`).toBeLessThanOrEqual(leads);
    expect(shown, `อัตราต้องคิดจาก ${quoted}/${leads} ราย (${title})`).toBe(`${Math.round(quoted / leads * 100)}%`);
    expect(shown, "2 ÷ 4 ราย = 50%").toBe("50%");
    // พิสูจน์ว่าไม่ได้หารด้วยจำนวนใบ: ใบ (3) ≠ ราย (2) และค่าที่โชว์ไม่ใช่ผลของสูตรเก่า (3 ÷ 4 = 75%)
    expect(docs, "ข้อมูลของข้อ: จำนวนใบต่างจากจำนวนราย").not.toBe(quoted);
    expect(shown, `ค่าที่โชว์ตรงกับสูตรเก่า (จำนวนใบ ÷ ราย) — สูตรถูกย้อนกลับแล้ว (${title})`).not.toBe(`${Math.round(docs / leads * 100)}%`);
  } finally {
    await สาขา.ลบ();
  }
});
