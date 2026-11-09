import { test, expect } from "@playwright/test";
import { open, assertHealthyPage } from "./helpers";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { รันSQLในฐาน } from "./localDb";

// ─── HQ · ใบเสนอราคาทั้งเครือ ─────────────────────────────────────────────────
// ล็อกสเปก: HQ ดูอย่างเดียว · KPI 4 ตัว · กราฟ 2 ใบ · ตารางชุดเดียวกับการ์ด (บอสสั่ง 30 ต.ค. 69)
// และล็อก "สิ่งที่ต้องไม่มี" เพราะข้อมูลไม่รองรับ/บอสสั่งลบ (กันใครเผลอเอากลับมา)

// กติกา (globals.css): ทุกหน้าใช้ KPI 4 ใบเท่ากัน — ห้ามเพิ่มเป็น 5+
// (.hq-kpi5/.hq-kpi7/.hq-kpi8 ถูกลบทิ้งแล้ว · ปฏิเสธ/หมดอายุ/มูลค่าเฉลี่ย ดูได้จากตาราง+ตัวกรองสถานะแทน)
test("[ux·hq] KPI 4 ตัว คำนวณสอดคล้องกัน (ไม่มี 'ลูกค้าเปิดอ่าน')", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  // การ์ด 4 ใบตามชุดที่บอสสั่ง (22 ต.ค. 69 · ใบ 0246) — ตัวเลขตรงฐาน ตรวจใน kpi-cards.spec.ts
  const tiles = page.locator("[data-kpi-row] [data-kpi]");
  await expect(tiles).toHaveCount(4);
  // ชื่อการ์ดตามแบบหน้า (บอสสั่ง 2 พ.ย. 69 · DCFG.quo)
  for (const label of ["ส่งลูกค้าในช่วงนี้", "รอลูกค้าตอบ", "ตอบรับ (มูลค่า)", "อัตราตอบรับ"]) {
    await expect(page.locator("[data-kpi-row]").getByText(label, { exact: true })).toBeVisible();
  }
  // อัตราตอบรับต้องกำกับตัวหารไว้ให้ตรวจสอบได้ (ต่างจากอัตราปิดการขายที่นับจากลีด)
  await expect(page.locator("[data-kpi='acceptRate']")).toContainText(/ตอบรับ [\d,]+ ÷ ใบที่ส่ง [\d,]+/);
});

// 30 ต.ค. 69 บอสสั่ง: เหลือ 4 ส่วน — การ์ด · กราฟรายเดือน "ใบที่ส่ง" เทียบ "ตอบรับ" · อายุใบที่รอลูกค้าตอบ (ข้างกัน) · ตาราง
//   เอาออก: "อัตราลูกค้าเป้าหมายที่ออกใบ แยกตามดีลเลอร์" · "เทียบรายภูมิภาค" · "เหตุผลที่เสียโอกาส"
//   กราฟรายเดือน = ฐานนับใบที่ส่ง (ตามวันที่ส่ง) / ตอบรับ (ตามวันตอบรับ) — ใบ 0268 · ฐานยังไม่ถึงใบนั้น = "รอข้อมูล"
test("[H10] เหลือกราฟ 2 ใบ (รายเดือน · อายุใบ) · ไม่มีกราฟผลงาน/ภูมิภาค/เหตุผลเสียโอกาส", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  // หัวข้อกราฟ 2 บรรทัด (บอสสั่ง 3 พ.ย. 69 · lib/drillTitles.ts): "กราฟ<เรื่อง> · <ระดับ>" — ระดับเริ่มต้น = ทั้งเครือ
  for (const title of ["กราฟใบเสนอราคารายเดือน: ใบที่ส่ง เทียบ ตอบรับ · ทั้งเครือ", "กราฟอายุใบเสนอราคาที่ค้างอยู่ · ทั้งเครือ"]) {
    await expect(page.getByText(title, { exact: true }).first(), `ต้องมีกราฟ "${title}"`).toBeVisible();
  }
  const main = page.locator(".erp");
  for (const title of [/อัตราลูกค้าเป้าหมายที่ออกใบ/, /เทียบรายภูมิภาค/, /เหตุผลที่เสียโอกาส/, /ใบเสนอราคาที่สร้าง/, /ประเภทอาคาร/]) {
    await expect(main.getByText(title), `เอาออกแล้ว: ${title}`).toHaveCount(0);
  }
});

// FLOW: "ผลงานดีลเลอร์ (ยอดขาย เป้า อัตราปิด) — ทำได้ที่เดียว: HQ › ภาพรวมยอดขาย" (ตรวจเทียบ FLOW รอบ 5 · 28 ต.ค. 69)
//   หน้าใบเสนอราคาทั้งเครือเคยมี "มูลค่าใบเสนอราคา เทียบ ยอดขายจริง" (ขายได้จริงรายดีลเลอร์) + ตาราง "อันดับดีลเลอร์"
//   = ผลงานดีลเลอร์ซ้ำกับภาพรวมยอดขาย → เอาออก ห้ามกลับมา
test("[H10] ไม่มีผลงานดีลเลอร์ (ยอดขายจริง/อันดับ) — อยู่ภาพรวมยอดขายที่เดียว", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  await expect(page.getByText("กราฟอายุใบเสนอราคาที่ค้างอยู่ · ทั้งเครือ", { exact: true }).first()).toBeVisible();   // หัวข้อกราฟใหม่ (3 พ.ย. 69)
  const main = page.locator(".erp");
  await expect(main.getByText("มูลค่าใบเสนอราคา เทียบ ยอดขายจริง", { exact: true })).toHaveCount(0);
  await expect(main.getByText("อันดับดีลเลอร์", { exact: true })).toHaveCount(0);
  await expect(main.getByText("ขายได้จริง", { exact: true })).toHaveCount(0);
  await expect(main.getByRole("button", { name: "ดูรายละเอียดดีลเลอร์" })).toHaveCount(0);
});

// วิเคราะห์การปิดการขายรายดีลเลอร์ (เดิมเป็นการ์ด "ออกใบเยอะ แต่ปิดได้น้อย" บน /hq/quotations)
// ถูกย้ายไป /hq/pipeline · 30 ต.ค. 69 บอสสั่งรวมตาราง "ตัวเลขการปิดการขาย รายดีลเลอร์" เข้า "ตารางผลงานดีลเลอร์" ตารางเดียว (FLOW H12)
//   คอลัมน์ตามคำสั่งบอส: ลีด · ใบเสนอราคา · ปิดได้ · ปิดไม่ได้ · อัตราปิด (สูตรกลาง lib/winRate.ts — ตัวเลขตรวจที่ hq-pipeline-h12.spec.ts)
//   ตรวจว่าตารางยังอยู่ · มีคอลัมน์ครบ · ตารางตัวเลขการปิดการขายแยกต่างหากไม่กลับมา
test("[ux·hq] วิเคราะห์การปิดการขายรายดีลเลอร์ (ย้ายไป /hq/pipeline)", async ({ page }) => {
  await open(page, "hq", "/hq/pipeline");
  const ตาราง = page.locator('table[aria-label="ตารางผลงานดีลเลอร์"]');
  await expect(ตาราง).toBeVisible();
  const หัว = (await ตาราง.locator("thead th").allInnerTexts()).map(t => t.trim());
  for (const l of ["ลีด", "ใบที่ส่ง", "ปิดได้", "ปิดไม่ได้", "อัตราปิด"]) {   // "ใบเสนอราคา" → "ใบที่ส่ง" (บอสสั่ง 30 ต.ค. 69)
    expect(หัว.filter(h => h === l), `ต้องมีคอลัมน์ "${l}" หนึ่งคอลัมน์ (ได้: ${หัว.join(" · ")})`).toHaveLength(1);
  }
  await expect(page.locator(".card").filter({ hasText: "ตัวเลขการปิดการขาย รายดีลเลอร์" }), "ไม่มีตารางการปิดการขายแยก (รวมเข้าตารางผลงานแล้ว)").toHaveCount(0);
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

// ตาราง (บอสสั่ง 30 ต.ค. 69): เลขที่ · ดีลเลอร์ (รหัส+ชื่อ) · ลูกค้า · จังหวัดหน้างาน · มูลค่า (ก่อน VAT) · สถานะ · วันที่ส่ง · ใช้ได้ถึง · ดู
//   (2 พ.ย. 69 · เจาะลึก) ตัวกรองดีลเลอร์/ภูมิภาค/จังหวัดดีลเลอร์ ย้ายไปเป็น "ระดับ" ของตัวเจาะลึกด้านบน (ไม่มีช่องเลือกซ้ำสองที่)
//   → กลับด้านจากเดิม: ไม่มีช่อง "จังหวัดดีลเลอร์" ในแถบกรองรายการแล้ว · ระดับ "จังหวัด" (จังหวัดของดีลเลอร์) อยู่ที่ตัวเลือกระดับ
test("[ux·hq] คอลัมน์ตารางตามแบบ · จังหวัดดีลเลอร์อยู่ที่ระดับของตัวเจาะลึก (ไม่ซ้ำในแถบกรองรายการ)", async ({ page }) => {
  await open(page, "hq", "/hq/quotations");
  await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
  const หัว = (await page.locator('table[aria-label="รายการใบเสนอราคา"]').locator("thead th").allInnerTexts()).map(t => t.trim());
  // 2 พ.ย. 69 บอสสั่ง: ดีลเลอร์ขายต่อเท่าไหร่ รายใบ — ราคาส่ง HQ · ราคาขายลูกค้า · ส่วนต่าง ฿ · ส่วนต่าง % (ต่อจากมูลค่า)
  // 9 พ.ย. 69 (พอดีจอ 1366): ดีลเลอร์เป็นบรรทัดเล็กใต้ลูกค้า — หัว "ลูกค้า / ดีลเลอร์"
  expect(หัว).toEqual(["เลขที่", "ลูกค้า / ดีลเลอร์", "จังหวัดหน้างาน", "มูลค่า (ก่อน VAT)", "ราคาส่ง HQ", "ราคาขายลูกค้า", "ส่วนต่าง ฿", "ส่วนต่าง %", "สถานะ", "วันที่ส่ง", "ใช้ได้ถึง", "ดู"]);
  await expect(page.getByLabel("จังหวัดดีลเลอร์"), "ไม่มีช่องจังหวัดดีลเลอร์ในแถบกรองรายการ").toHaveCount(0);
  await expect(page.getByLabel("กรองตามดีลเลอร์"), "ไม่มีช่องดีลเลอร์ในแถบกรองรายการ").toHaveCount(0);
  await expect(page.locator("[data-drill-scope]").getByLabel("จังหวัด"), "ระดับจังหวัดอยู่ที่ตัวเลือกระดับ").toBeVisible();
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
  // หน้าต่างแบบเดียวกับดีลเลอร์ (บอสตอบ 9 พ.ย. 69): หัวข้อ "ข้อมูลใบเสนอราคา" เดิม → แถบสรุป 4 ช่อง + กริดลูกค้า
  await expect(drawer.locator("[data-doc-summary] [data-summary-item]"), "แถบสรุป 4 ช่อง").toHaveCount(4);
  await expect(drawer.locator("[data-quote-customer] [data-grid-item]"), "กริดลูกค้า 6 ช่อง").toHaveCount(6);
  await expect(drawer.getByText(/ส่วนลด|ประวัติการเปิดอ่าน/)).toHaveCount(0);
  await expect(drawer.getByRole("button", { name: /แก้ไข|ลบ|อนุมัติ/ })).toHaveCount(0);
});

// ชุดเดียวกับการ์ด (บอสสั่ง 30 ต.ค. 69): ค่าเริ่มต้นของตาราง = ส่งลูกค้าแล้ว (ไม่นับร่าง/ถูกแทนที่) = การ์ด "ส่งลูกค้าในช่วงนี้"
//   ใบร่างดูได้เมื่อเลือกสถานะเอง · อายุใบรวม = การ์ด "รอลูกค้าตอบ" · ชื่อสถานะคำเดียวกับ FLOW
//   ตกบนโค้ดเดิม: ตารางค่าเริ่มต้นแสดงใบร่าง/ถูกแทนที่ (6 ≠ 4) · ป้าย "ส่งแล้ว"/"ปฏิเสธ"
// ข้อมูล = สาขาของข้อ ใบวันนี้ 6 ใบ: ส่งแล้ว 2 · ตอบรับ 1 · ปฏิเสธ 1 · ร่าง 1 · ถูกแทนที่ 1 + W2 ส่ง 2 ปีก่อน ตอบรับวันนี้
test("[H10·hq] ตาราง/อายุใบ = การ์ด ทุกตัวกรองสถานะ · ใบร่างดูได้เมื่อเลือกเอง · ชื่อสถานะตาม FLOW", async ({ page }) => {
  const สาขา = await สร้างสาขาของข้อ({ จังหวัด: "สกลนคร", ภาค: "ตะวันออกเฉียงเหนือ" });
  const c = สาขา.รหัส;
  try {
    const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    // W2 = ส่งเมื่อ 2 ปีก่อน (นอกช่วง) แต่ลูกค้าตอบรับวันนี้ → นับในการ์ด "ตอบรับ" (ตามวันตอบรับ) ไม่นับใน "ส่งลูกค้าในช่วงนี้" (ตามวันที่ส่ง)
    const สองปีก่อน = `${Number(วันนี้.slice(0, 4)) - 2}${วันนี้.slice(4)}`;
    const ใบ: [string, string][] = [["S1", "sent_to_client"], ["S2", "sent_to_client"], ["W1", "won"], ["L1", "lost"], ["D1", "draft"], ["X1", "superseded"]];
    // ใบตอบรับต้องมีลูกค้า (กติกาฐาน quotations_won_requires_customer) — ลูกค้าของข้อ 1 ราย
    const ลูกค้า = 1_600_000_000 + Math.floor(Math.random() * 500_000) * 10;
    const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
      insert into public.customers (id, dealer_code, name, company, province) values (${ลูกค้า}, '${c}', 'ZZTEST ลูกค้าตอบรับ', 'ZZTEST ลูกค้าตอบรับ', 'สกลนคร');
      insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, customer_id) values
        ${ใบ.map(([n, st]) => `('${c}', 'Q-${c}-${n}', 'ZZTEST ลูกค้า ${n}', 'ZZTEST', '${st}', 1000, '${วันนี้}', ${st === "won" ? ลูกค้า : "null"})`).join(", ")};
      insert into public.quotations (dealer_code, id, customer, project, status, total_value, date, won_at, customer_id) values ('${c}', 'Q-${c}-W2', 'ZZTEST ลูกค้า W2', 'ZZTEST', 'won', 2000, '${สองปีก่อน}', now(), ${ลูกค้า});
      insert into public.quotation_won_at (dealer_code, quote_id, won_at) values ('${c}', 'Q-${c}-W1', now()), ('${c}', 'Q-${c}-W2', now());
      set local session_replication_role = origin;`);
    if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางข้อมูลของข้อไม่ได้");
    await open(page, "hq", `/hq/quotations?dealer=${c}`);
    await assertHealthyPage(page, "ใบเสนอราคาทั้งเครือ");
    // ?dealer= = เจาะลงระดับดีลเลอร์นั้น (แถบระดับ) → การ์ด/กราฟ/รายการเป็นของสาขาของข้ออย่างเดียว
    await expect(page.locator('[data-crumbs] [data-crumb="dealer"]'), "ลิงก์ดีลเลอร์ = ระดับดีลเลอร์").toContainText(c, { timeout: 25_000 });
    const การ์ด = async (k: string) => Number(await page.locator(`[data-kpi-row] [data-kpi="${k}"] [data-value]`).first().getAttribute("data-value"));
    const แถว = page.locator('table[aria-label="รายการใบเสนอราคา"] tbody tr');
    const สถานะ = page.getByLabel("กรองตามสถานะใบเสนอราคา");
    await expect(สถานะ, "ค่าเริ่มต้น = ส่งลูกค้าแล้ว (ไม่นับร่าง/ถูกแทนที่)").toHaveValue("sent");
    await expect.poll(() => การ์ด("sent"), { message: "การ์ดส่งลูกค้าในช่วงนี้", timeout: 20_000 }).toBe(4);
    await expect(แถว, "ตารางค่าเริ่มต้น = การ์ด").toHaveCount(4, { timeout: 20_000 });
    await expect(page.locator(".erp").getByText(`Q-${c}-D1`), "ใบร่างไม่อยู่ในตารางค่าเริ่มต้น").toHaveCount(0);
    expect(new Set(await แถว.locator("[data-quote-status]").allInnerTexts()), "ชื่อสถานะตาม FLOW").toEqual(new Set(["ส่งให้ลูกค้าแล้ว", "ตอบรับ", "ลูกค้าปฏิเสธ"]));
    // อายุใบที่รอลูกค้าตอบ รวม = การ์ดรอลูกค้าตอบ (ณ ตอนนี้)
    await expect.poll(() => การ์ด("awaiting"), { message: "การ์ดรอลูกค้าตอบ" }).toBe(2);
    await expect.poll(async () => Number(await page.locator('[data-chart="aging"]').getAttribute("data-sum")), { message: "อายุใบรวม = การ์ดรอลูกค้าตอบ" }).toBe(2);
    // กราฟรายเดือน (ใบ 0268): ผลรวมใบที่ส่ง = การ์ดส่งลูกค้า · ผลรวมตอบรับ = จำนวนใบบนการ์ดตอบรับ
    const กราฟ = page.locator('[data-chart="quote-monthly"]');
    await expect.poll(async () => [await กราฟ.getAttribute("data-sum-sent"), await กราฟ.getAttribute("data-sum-won")], { message: "กราฟรายเดือนรวม = การ์ด (ส่ง 4 · ตอบรับ 2 (W2 ตามวันตอบรับ))", timeout: 20_000 })
      .toEqual(["4", "2"]);
    // เลือกสถานะเอง: ร่าง · ถูกแทนที่ · ทุกสถานะ
    await สถานะ.selectOption("draft");
    await expect(แถว, "เลือกร่าง = ใบร่าง 1 ใบ").toHaveCount(1);
    await expect(แถว.first().locator("[data-quote-status]")).toHaveText("ร่าง");
    await expect(แถว.first().locator('[data-col="sent-date"]'), "ใบร่างยังไม่ได้ส่ง = —").toHaveText("—");
    await สถานะ.selectOption("superseded");
    await expect(แถว.first().locator("[data-quote-status]")).toHaveText("ถูกแทนที่");
    await สถานะ.selectOption("all");
    await expect(แถว, "ทุกสถานะ = 6 ใบ").toHaveCount(6);
    // การ์ดตอบรับ: 2 ใบ (W1 · W2 ส่งนอกช่วงแต่ตอบรับในช่วง) มูลค่า 3,000 ตามวันลูกค้าตอบรับ
    await สถานะ.selectOption("sent");
    await expect(page.locator('[data-kpi-row] [data-kpi="won"]').first(), "การ์ดตอบรับ 2 ใบ").toContainText("2 ใบ");
    expect(await การ์ด("won"), "มูลค่าตอบรับ = 1,000 + 2,000").toBe(3000);
    // กลับด้าน (บอสสั่ง 2 พ.ย. 69 · เจาะลึก): กดการ์ด = แผงที่มา (ระดับดีลเลอร์ = รายเดือน) · ไม่มีแถวรวม (6 พ.ย. 69) ผลรวมแถว = การ์ด · รายการใบไม่ถูกกรองตามการ์ดแล้ว
    await page.locator('[data-kpi-row] [data-kpi="won"]').first().click();
    const แผง = page.locator('[data-drill-drawer="card:sales"]');
    await expect(แผง, "กดการ์ดตอบรับ → แผงที่มา").toBeVisible();
    await expect(แผง.locator("tfoot"), "แผงที่มาไม่มีแถวรวม").toHaveCount(0);
    await expect.poll(async () => (await แผง.locator("tbody [data-value]").evaluateAll(es => es.map(e => Number(e.getAttribute("data-value") || 0)))).reduce((a, b) => a + b, 0),
      { message: "แผงที่มา ผลรวมแถว = การ์ด 3000" }).toBe(3000);
    await แผง.getByRole("button", { name: "ปิดแผง" }).click();
    await expect(สถานะ, "รายการยังเป็นค่าเริ่มต้น").toHaveValue("sent");
    await expect(แถว).toHaveCount(4);
  } finally {
    รันSQLในฐาน(`set local session_replication_role = replica; delete from public.quotation_won_at where dealer_code = '${c}'; delete from public.quotations where dealer_code = '${c}'; delete from public.customers where dealer_code = '${c}'; set local session_replication_role = origin;`);
    await สาขา.ลบ();
  }
});
