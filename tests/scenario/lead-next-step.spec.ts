import { test, expect, type Page, type Route } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { ใบHQให้ลูกค้าเป้าหมายเดิม, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";
import { รันSQLในฐาน } from "./localDb";
import { adminClient } from "./testDealers";

// ── แผงลูกค้าเป้าหมาย: แถบขั้นตอน + ปุ่ม "ขั้นต่อไป" ต้องตรงกับสถานะจริงทุกขั้น (UI ตาม flow · หน้า 3 · 16 ต.ค. 69) ─────
//   พาลีดเดินทีละขั้นด้วยทางจริงของฐาน (ขอราคา · HQ ส่งใบ · ทำใบลูกค้า · ส่ง · ตอบรับ) แล้วเปิดแผงดูทุกครั้ง
//   และกดปุ่มแล้วต้องพาไปที่ทำงานนั้นได้จริง · ตัวตัดสินครบทุกสถานะอยู่ที่ tests/unit/leadNextStep.test.ts
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const แท็ก = Date.now() % 100_000;
const เลข = { เดิน: เลขลูกค้าเป้าหมายทดสอบ(), หมดอายุ: เลขลูกค้าเป้าหมายทดสอบ(), ปิด: เลขลูกค้าเป้าหมายทดสอบ(), ค้าง: เลขลูกค้าเป้าหมายทดสอบ(), ช้า: เลขลูกค้าเป้าหมายทดสอบ() };
const ชื่อ = (k: keyof typeof เลข) => `ZZTEST-ขั้นต่อไป-${k}-${แท็ก}`;

async function สร้างลีด(k: keyof typeof เลข, status: string) {
  // ดีลเลอร์สร้างลีดได้แค่ ติดต่อแล้ว/รวบรวมความต้องการ (ใบ 0232) — ฉากขั้นอื่นตั้งด้วยกุญแจฝั่งเซิร์ฟเวอร์
  const sb = status === "WAITING" || status === "BULLET" ? await db(RYG) : adminClient();
  const r = await sb.from("leads").insert({ id: `#L-${เลข[k]}`, num_id: เลข[k], dealer_code: "RYG", company: ชื่อ(k), name: ชื่อ(k),
    contact: "ผู้ทดสอบ", phone: `08${String(เลข[k]).slice(-8)}`, province: "ระยอง", status });
  expect(r.error, `สร้างลีด ${k}`).toBeNull();
}
async function เปิดแผง(page: Page, k: keyof typeof เลข) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ(k));
  const row = page.locator("tbody tr").filter({ hasText: ชื่อ(k) }).first();
  await expect(row).toBeVisible({ timeout: 25_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  return page.getByRole("status", { name: "ขั้นต่อไป" });
}

test.afterAll(() => { ล้างใบHQทดสอบ("RYG", Object.values(เลข)); });

test("[func·dealer] ขั้นต่อไปเดินตามจริง: ขอราคา → รอ HQ → ทำใบ → ส่งให้ลูกค้า → บันทึกผล → ปิดสำเร็จ", async ({ page }) => {
  await สร้างลีด("เดิน", "BULLET");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);

  // 1) ยังไม่มีคำขอ → ขอราคาจาก HQ · กดแล้วเปิดฟอร์มขอราคาในแท็บใบเสนอราคา
  let กล่อง = await เปิดแผง(page, "เดิน");
  await expect(กล่อง).toContainText("ขอราคาจาก HQ", { timeout: 20_000 });
  await กล่อง.getByRole("button", { name: /ขอราคาจาก HQ/ }).click();
  await expect(page.locator("[data-panel='quote-request']").getByLabel("งานที่ขอราคา"), "กดแล้วต้องเปิดฟอร์มขอราคา").toBeVisible({ timeout: 15_000 });

  // 2) ส่งคำขอแล้ว → รอราคาจาก HQ ไม่มีปุ่ม (ทางจริงของฐาน · แยกขั้นจาก HQ ส่งใบ เพื่อตรวจหน้าจอระหว่างรอ)
  const sb = await db(RYG);
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลข.เดิน, p_product: "โกดังเก็บสินค้า 20x40 ม." });
  expect(r.error).toBeNull();
  const requestId = Number((r.data as { id: number }).id);
  กล่อง = await เปิดแผง(page, "เดิน");
  await expect(กล่อง).toContainText("รอราคาจาก HQ", { timeout: 20_000 });
  await expect(กล่อง.locator("[data-next-step]"), "รอ HQ = ไม่มีปุ่มหลัก").toHaveCount(0);
  await expect(กล่อง.getByRole("button", { name: /ปิดไม่สำเร็จ/ }), "ปิดไม่สำเร็จอยู่ที่กล่องนี้ที่เดียว (รอบ 4)").toHaveCount(1);

  // 3) HQ ส่งใบ → ทำใบให้ลูกค้า · กดแล้วเปิดฟอร์มออกใบ
  const hq = await db(ADMIN);
  const ยืนราคา = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  expect((await hq.rpc("hq_quote_save", { p_request_id: requestId, p_lines: [{ name: "โครงสร้างเหล็ก", qty: 100, unit: "ตร.ม.", unitCost: 1000 }], p_valid_until: ยืนราคา, p_note: "" })).error).toBeNull();
  const ส่ง = await hq.rpc("hq_quote_send", { p_request_id: requestId });
  expect(ส่ง.error).toBeNull();
  const ใบ = { dealerCode: "RYG", leadNum: เลข.เดิน, requestId, hqQuoteId: Number((ส่ง.data as { id: number }).id), quoteNo: String((ส่ง.data as { quote_no: string }).quote_no) };
  กล่อง = await เปิดแผง(page, "เดิน");
  await expect(กล่อง).toContainText("ทำใบเสนอราคาให้ลูกค้า", { timeout: 20_000 });
  await กล่อง.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click();
  await expect(page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last(), "กดแล้วต้องเปิดฟอร์มออกใบ").toBeVisible({ timeout: 15_000 });

  // 4) ใบลูกค้าเป็นร่าง → ส่งให้ลูกค้า · กดแล้วไปหน้าใบเสนอราคาที่เปิดใบนั้นไว้
  const ร่าง = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: ชื่อ("เดิน"), markupPercent: 10, status: "draft" });
  กล่อง = await เปิดแผง(page, "เดิน");
  await expect(กล่อง).toContainText("ส่งให้ลูกค้า", { timeout: 20_000 });
  // รอบ 4: ส่งในแผงเลย (ยืนยัน) ไม่พาไปหน้าใบเสนอราคา
  await กล่อง.getByRole("button", { name: /ส่งให้ลูกค้า/ }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("quotations").select("status").eq("id", ร่าง.id).eq("dealer_code", "RYG").single()).data?.status,
    { timeout: 20_000, message: "กดส่งในกล่องแล้วใบต้องเป็นส่งให้ลูกค้าแล้ว" }).toBe("sent_to_client");
  await expect(page, "ไม่พาไปหน้าอื่น").toHaveURL(/\/leads/);

  // 5) ส่งให้ลูกค้าแล้ว → บันทึกผลจากลูกค้า (เปิดใบในแท็บใบเสนอราคาของแผงเดิม)
  กล่อง = await เปิดแผง(page, "เดิน");
  await expect(กล่อง).toContainText("รอลูกค้าตอบ", { timeout: 20_000 });
  // กดแล้วไปแผงของใบนั้นในหน้าใบเสนอราคา → บันทึกว่าลูกค้าตอบรับ (ทางเดียวกับดีลเลอร์ใช้จริง · ฐานสร้าง/ผูกลูกค้าให้)
  await กล่อง.getByRole("button", { name: /บันทึกผลจากลูกค้า/ }).click();
  await expect(page, "ไม่พาไปหน้าอื่น").toHaveURL(/\/leads/);
  await page.locator("[data-customer-result]").getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await sb.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", เลข.เดิน).single()).data?.status,
    { timeout: 25_000, message: "ตอบรับแล้วลีดต้องเป็นปิดการขายสำเร็จ" }).toBe("PAID");
  // 6) ปิดสำเร็จแล้วลีดย้ายไปเป็นลูกค้า (หน้าลูกค้าเป้าหมายไม่แสดงลีดที่ปิดสำเร็จ — ตั้งใจ)
  //    ข้อความ "ปิดการขายสำเร็จ" ในกล่องตรวจที่ tests/unit/leadNextStep.test.ts
});

test("[func·dealer] ขั้นต่อไป: ใบ HQ ยังโหลดไม่เสร็จตอนกด \"ทำใบให้ลูกค้า\" → ฟอร์มออกใบต้องเปิดเมื่อโหลดเสร็จ", async ({ page }) => {
  // รอบเต็ม 19 ต.ค. 69 ไม่นิ่ง: แผงใบเสนอราคาเพิ่งเปิดพร้อมคำสั่ง แต่ยังโหลดใบ HQ ไม่เสร็จ → ขึ้น "กำลังโหลดใบ HQ…" แล้วคำสั่งหาย
  //   เน็ตช้าในงานจริงเจอเหมือนกัน · แผงขั้นต่อไปกับแผงใบเสนอราคาขอใบ HQ ที่อยู่เดียวกันพร้อมกัน → กักไว้ทั้งหมดแล้วปล่อยทีละคำขอ
  //   ปล่อยแล้วปุ่มขึ้น = คำขอที่ยังกักอยู่เป็นของแผงใบเสนอราคา → กดตอนแผงนั้นยังโหลดไม่เสร็จได้แน่นอน (ไม่พึ่งจังหวะเครื่อง)
  await สร้างลีด("ช้า", "BULLET");
  await ใบHQให้ลูกค้าเป้าหมายเดิม(RYG, "RYG", เลข.ช้า);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const ที่อยู่ใบHQ = /\/rest\/v1\/hq_quotes|view=hq-quote/;
  const กัก: Route[] = [];
  const ปล่อย = (r: Route) => r.continue().catch(() => {});   // หน้าเปลี่ยนไปแล้ว = คำขอนั้นถูกยกเลิก ไม่ต้องตอบ
  await page.route(ที่อยู่ใบHQ, route => { กัก.push(route); });
  for (let รอบ = 1; ; รอบ++) {
    const กล่อง = await เปิดแผง(page, "ช้า");
    await expect.poll(() => กัก.length, { message: "แผงขั้นต่อไปและแผงใบเสนอราคาต้องขอใบ HQ ทั้งคู่", timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    const ปุ่ม = กล่อง.getByRole("button", { name: /ทำใบให้ลูกค้า/ });
    await ปล่อย(กัก.shift()!);
    if (await ปุ่ม.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)) {
      await ปุ่ม.click();
      while (กัก.length) await ปล่อย(กัก.shift()!);
      await page.unroute(ที่อยู่ใบHQ);
      await expect(page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last(), "โหลดใบ HQ เสร็จแล้วต้องเปิดฟอร์มออกใบตามที่กด").toBeVisible({ timeout: 15_000 });
      return;
    }
    // คำขอที่ปล่อยไปเป็นของแผงใบเสนอราคา — ลำดับนี้ทำให้เกิดเหตุไม่ได้ เปิดหน้าใหม่แล้วลองอีกรอบ
    expect(รอบ, "ลองจัดลำดับคำขอ 4 รอบแล้วยังไม่ได้ลำดับที่ต้องการ").toBeLessThan(4);
    while (กัก.length) await ปล่อย(กัก.shift()!);
  }
});

test("[func·dealer] ขั้นต่อไป: ราคา HQ หมดอายุ → ขอราคาใหม่ (กดแล้วเปิดฟอร์มขอแก้ราคา)", async ({ page }) => {
  await สร้างลีด("หมดอายุ", "BULLET");
  const ใบ = await ใบHQให้ลูกค้าเป้าหมายเดิม(RYG, "RYG", เลข.หมดอายุ);
  // ใบ HQ ที่ส่งแล้วแก้ไม่ได้ (ตั้งใจ) — ปลดตัวกันชั่วคราวที่ฐานทดสอบในเครื่องเพื่อจำลองวันที่ผ่านไป
  รันSQLในฐาน(`alter table public.hq_quotes disable trigger hq_quotes_lock_sent;
    update public.hq_quotes set valid_until = current_date - 2 where id = ${ใบ.hqQuoteId};
    alter table public.hq_quotes enable trigger hq_quotes_lock_sent;`);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const กล่อง = await เปิดแผง(page, "หมดอายุ");
  await expect(กล่อง).toContainText("ราคา HQ หมดอายุแล้ว", { timeout: 20_000 });
  await กล่อง.getByRole("button", { name: /ขอราคาใหม่/ }).click();
  await expect(page.locator("[data-reason-dialog]").getByRole("button", { name: "ส่งขอแก้ราคา" }), "กดแล้วต้องเปิดกล่องขอแก้ราคา (กล่องเหตุผลกลาง)").toBeVisible({ timeout: 15_000 });
});

test("[func·dealer] ขั้นต่อไป: ปิดไม่สำเร็จ และลีดค้างขั้นที่ขอราคาไม่ได้ → ไม่มีปุ่ม", async ({ page }) => {
  await สร้างลีด("ปิด", "CANCELLED");
  await สร้างลีด("ค้าง", "QUOTED");
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  let กล่อง = await เปิดแผง(page, "ปิด");
  await expect(กล่อง).toContainText("ปิดการขายไม่สำเร็จ", { timeout: 20_000 });
  await expect(กล่อง.getByRole("button")).toHaveCount(0);
  กล่อง = await เปิดแผง(page, "ค้าง");
  await expect(กล่อง).toContainText("ไม่มีคำขอราคาหรือใบที่ใช้ได้", { timeout: 20_000 });
  await expect(กล่อง.locator("[data-next-step]"), "ฐานไม่ยอมให้ขอราคาจากขั้นนี้ — ห้ามเสนอปุ่มหลัก").toHaveCount(0);
});
