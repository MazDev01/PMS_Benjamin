import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── หน้า HQ คำขอใบเสนอราคา: ปุ่ม 3 กลุ่มพร้อมจำนวน (บอสสั่ง 30 ต.ค. 69 · ตามแบบ) แทนช่องเลือกสถานะ (27 ต.ค. 69) ──
//   1) ไม่มีช่องเลือก · ปุ่ม ต้องตีราคา · ส่งแล้ว รอดีลเลอร์ · ปิด/ยกเลิก (รวมสั่งผลิต) อยู่ข้างช่องค้นหา · จอแคบไม่ล้น
//   2) จำนวนบนปุ่ม = ฐาน (hq_quote_board) = จำนวนแถว · 3) กดการ์ดแล้วปุ่มเปลี่ยนตาม · 4) จำนวนบนปุ่มต้องตีราคา = การ์ด
//   5) ความเร็ว: เปิดหน้า · สลับกลุ่ม · เลือกคำขอ ไม่เกิน 1 วินาที
//   ต้องตกบนโค้ดก่อนแก้: มีช่องเลือกสถานะ · ไม่มีปุ่มกลุ่ม
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

// ข้อมูลของข้อทดสอบเอง: คำขอที่ส่งใบ HQ แล้ว 2 รายการ (กลุ่มส่งแล้ว) + คำขอใหม่ 2 รายการ (กลุ่มต้องตีราคา) — ให้วัดเวลาสลับ/เลือกได้เสมอ
const แท็ก = Date.now() % 100_000;
// ป้ายของข้อ — ชื่อลูกค้าเป้าหมายทุกรายของข้อขึ้นต้นด้วยป้ายนี้ · ค้นด้วยป้าย = เห็นเฉพาะคำขอของข้อ (ข้ออื่นเพิ่มคำขอพร้อมกันไม่กระทบ)
const ป้าย = `ZZTEST-ช่องสถานะ-${แท็ก}`;
const เลขลีด: number[] = [];
test.beforeAll(async () => {
  for (let i = 0; i < 2; i++) {
    const ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: `${ป้าย}-ส่งแล้ว${i}`, province: "ระยอง",
      lines: [{ name: "ZZTEST โครงหลัก", qty: 1, unit: "ชุด", unitCost: 1000 }] });
    เลขลีด.push(ใบ.leadNum);
  }
  const sb = await db(RYG);
  for (let i = 0; i < 2; i++) {
    const n = เลขลูกค้าเป้าหมายทดสอบ(), ชื่อ = `${ป้าย}-ใหม่${i}`;
    const l = await sb.from("leads").insert({ id: `#L-${n}`, num_id: n, dealer_code: "RYG", company: ชื่อ, name: ชื่อ, contact: "ผู้ทดสอบ",
      phone: `08${String(n).slice(-8)}`, province: "ระยอง", status: "BULLET" });
    expect(l.error).toBeNull();
    เลขลีด.push(n);
    expect((await sb.rpc("quote_request_submit", { p_lead_num_id: n, p_product: "ZZTEST โกดัง" })).error).toBeNull();
  }
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", เลขลีด); });

const กลุ่ม = (page: Page) => page.getByRole("tablist", { name: "กลุ่มคำขอ" });
const ปุ่ม = (page: Page, k: "todo" | "quoted" | "done") => กลุ่ม(page).locator(`[data-group="${k}"]`);
const รายการ = (page: Page) => page.getByRole("list", { name: "รายการคำขอ" });
const การ์ด = (page: Page, kpi: string) => page.locator(`[data-kpi-row] [data-kpi="${kpi}"]`);
const จำนวนแถว = async (page: Page) => {
  // รายการแบ่งหน้า (แถบเปลี่ยนหน้าโผล่เมื่อเกินหน้าเดียว) — มีแถบ = ยอดรวมจากแถบ · ไม่มี = นับแถวที่เห็น
  //   อ่านทีเดียว (allInnerTexts ไม่รอ) — เดิม count() แล้วค่อย innerText(): แถบหายระหว่างสองคำสั่ง (เปลี่ยนกลุ่มแล้วเหลือหน้าเดียว)
  //   → innerText รอแถบที่ไม่มีแล้วจนหมดเวลา 8 วิ (ต้นเหตุไม่นิ่ง 28–29 ต.ค. 69)
  const [แถบ] = await page.getByText(/แสดง .* จาก .*/).allInnerTexts();
  if (แถบ !== undefined) { const m = แถบ.replace(/,/g, "").match(/จาก\s+(\d+)/); return m ? Number(m[1]) : NaN; }
  return รายการ(page).getByRole("button").count();
};
const หาค่าการ์ด = async (page: Page, kpi: string) => Number(await การ์ด(page, kpi).locator("[data-value]").getAttribute("data-value"));

test("[ui·hq] คำขอใบเสนอราคา: ปุ่ม 3 กลุ่มพร้อมจำนวนแทนช่องเลือก · การ์ดคุมปุ่ม · จำนวนบนปุ่ม = ฐาน = แถว · ไม่เกิน 1 วินาที", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const hq = await db(ADMIN);

  // ── ความเร็วเปิดหน้า: นับจากเริ่มโหลดหน้าจนรายการ + การ์ดขึ้นครบ · วัด 3 ครั้งใช้ค่ากลาง
  //    (ครั้งเดียวแกว่งตามภาระเครื่อง: ครั้งแรกหลังเว็บสตาร์ท + ข้อทดสอบอื่นรันพร้อมกัน วัดได้ 1,228 / รอบซ้ำ 558 ms) ──
  //    เวลาจดในหน้าเว็บเอง ทุกเฟรม (polling: raf) ตอนรายการ + การ์ดขึ้นครบพร้อมกัน (29 ต.ค. 69 · คิวข้อ 3)
  //      เดิมรอด้วย expect 2 ตัวต่อกันแล้วค่อยถาม performance.now() — expect เช็กซ้ำห่างขึ้นเรื่อย ๆ (0.1 → 0.25 → 0.5 → 1 วิ)
  //      เครื่องมีภาระ = เห็นช้ากว่าหน้าขึ้นจริงได้เกือบ 1 วิต่อตัว · รอบรวม 38 ไฟล์วัดได้ 2.7–3.0 วิ ขณะที่สลับสถานะ (ข้อมูลชุดเดียวกัน) 0.1 วิ
  //      ตอนนี้วัดเฉพาะเวลาของหน้า (จากเริ่มนำทางถึงเฟรมที่ขึ้นครบ) · เกณฑ์ 1 วินาทีเท่าเดิม · พิมพ์ช่วงฝั่งเซิร์ฟเวอร์แยกไว้ดูต้นเหตุ
  const ครั้ง: number[] = [], ช่วง: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    const ขึ้นครบ = await page.waitForFunction(() => {
      const แถว = document.querySelector('ul[aria-label="รายการคำขอ"] button') as HTMLElement | null;
      const ค่า = document.querySelector('[data-kpi-row] [data-kpi="todo"] [data-value]')?.getAttribute("data-value") ?? "";
      return แถว && แถว.getClientRects().length > 0 && ค่า !== "" ? performance.now() : false;
    }, null, { polling: "raf", timeout: 30_000 });
    ครั้ง.push(Math.round(Number(await ขึ้นครบ.jsonValue())));
    ช่วง.push(await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return n ? `เซิร์ฟเวอร์ตอบ ${Math.round(n.responseStart)} · หน้าพร้อม ${Math.round(n.domContentLoadedEventEnd)}` : "ไม่มีข้อมูลนำทาง";
    }));
  }
  const เปิดหน้า = [...ครั้ง].sort((a, b) => a - b)[1];
  console.log(`[เวลา] เปิดหน้า 3 ครั้ง ${ครั้ง.join(" / ")} ms · ${ช่วง.join(" | ")}`);
  await settle(page);

  // ── 1) ปุ่ม 3 กลุ่มพร้อมจำนวน (บอสสั่ง 30 ต.ค. 69 · ตามแบบ) แทนช่องเลือกสถานะ ──
  expect.soft(await page.getByLabel("สถานะคำขอ").count(), "ไม่มีช่องเลือกสถานะแล้ว").toBe(0);
  const มีปุ่ม = (await กลุ่ม(page).count()) > 0;
  expect.soft(มีปุ่ม, "มีปุ่มกลุ่ม 3 ปุ่ม").toBe(true);

  // ── 5) ความเร็วสลับกลุ่ม + เลือกคำขอ ──
  const แรกของ = async (g: string) => {
    const { data } = await hq.rpc("hq_quote_board", { p_group: g, p_q: "" });
    return ((data as { rows: { request_no: string }[] }).rows[0]?.request_no) ?? null;
  };
  const เลข = await แรกของ("quoted");
  let สลับสถานะ = NaN;
  if (เลข && มีปุ่ม) {
    const t0 = Date.now();
    await ปุ่ม(page, "quoted").click();
    await expect(รายการ(page).getByRole("button").first()).toContainText(เลข, { timeout: 15_000 });
    สลับสถานะ = Date.now() - t0;
  }
  let เลือกคำขอ = NaN;
  const ปุ่มแถว = รายการ(page).getByRole("button");
  if (await ปุ่มแถว.count() > 1) {
    const ชื่อ = (await ปุ่มแถว.nth(1).getAttribute("aria-label")) ?? "";
    const t0 = Date.now();
    await ปุ่มแถว.nth(1).click();
    await expect(page.getByRole("region", { name: "ใบ HQ" }).getByRole("heading").first()).toContainText(ชื่อ.split(" ")[0], { timeout: 15_000 });
    เลือกคำขอ = Date.now() - t0;
  }
  console.log(`[เวลา] เปิดหน้า ${เปิดหน้า} ms · สลับกลุ่ม ${สลับสถานะ} ms · เลือกคำขอ ${เลือกคำขอ} ms`);
  expect.soft(เปิดหน้า, "เปิดหน้าไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!Number.isNaN(สลับสถานะ)) expect.soft(สลับสถานะ, "สลับกลุ่มไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!Number.isNaN(เลือกคำขอ)) expect.soft(เลือกคำขอ, "เลือกคำขอไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!มีปุ่ม) return;   // โค้ดก่อนแก้: ตกแล้วที่ "มีปุ่มกลุ่ม" — ข้อที่เหลืออ้างปุ่มที่ไม่มี

  // ── 1) ต่อ: ชื่อปุ่มตามแบบ · ค่าเริ่มต้น = ต้องตีราคา · อยู่บรรทัดเดียวกับช่องค้นหาที่จอกว้าง ──
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(ปุ่ม(page, "todo"), "ค่าเริ่มต้น = ต้องตีราคา").toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  const ชื่อปุ่ม = (await กลุ่ม(page).getByRole("tab").allInnerTexts()).map(t => t.replace(/[\d,—]+\s*$/, "").trim());
  expect.soft(ชื่อปุ่ม, "ปุ่ม 3 กลุ่มตามแบบ").toEqual(["ต้องตีราคา", "ส่งแล้ว รอดีลเลอร์", "ปิด/ยกเลิก"]);
  {
    const [a, b] = await Promise.all([กลุ่ม(page).boundingBox(), page.getByLabel("ค้นหาคำขอ").boundingBox()]);
    expect.soft(a && b && Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < 8, "จอ 1440px: ปุ่มกลุ่มอยู่ข้างช่องค้นหา (บรรทัดเดียวกัน)").toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "จอ 390px: ปุ่มกลุ่มไม่ล้นจอ").toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── 2) จำนวนบนปุ่ม = ฐาน = จำนวนแถว (ค้นด้วยป้ายของข้อ — รู้ค่าแน่นอน: ต้องตีราคา 2 · ส่งแล้ว 2 · ปิด/ยกเลิก 0) ──
  //   ปิด/ยกเลิก = สั่งผลิต + ปิด/ยกเลิกของฐาน (ตามแบบ)
  await page.getByLabel("ค้นหาคำขอ").fill(ป้าย);
  const ฐานของ = async (k: "todo" | "quoted" | "done") => {
    const นับ = async (g: string) => ((await hq.rpc("hq_quote_board", { p_group: g, p_q: ป้าย })).data as { rows: unknown[] }).rows.length;
    return k === "done" ? (await นับ("won")) + (await นับ("closed")) : นับ(k);
  };
  for (const [k, รู้ค่า] of [["todo", 2], ["quoted", 2], ["done", 0]] as const) {
    await ปุ่ม(page, k).click();
    const ฐาน = await ฐานของ(k);
    expect.soft(ฐาน, `ฐาน กลุ่ม ${k} (ค้นด้วยป้ายของข้อ) = ${รู้ค่า}`).toBe(รู้ค่า);
    await expect.poll(() => จำนวนแถว(page), { timeout: 20_000, message: `ปุ่ม ${k}: จำนวนแถวบนจอ = ฐาน (${ฐาน})` }).toBe(ฐาน);
    await expect.poll(async () => Number(await ปุ่ม(page, k).locator("[data-count]").getAttribute("data-count")), { timeout: 20_000, message: `ปุ่ม ${k}: จำนวนบนปุ่ม = จำนวนแถว` }).toBe(ฐาน);
  }
  await page.getByLabel("ค้นหาคำขอ").fill("");

  // ── 3) กดการ์ด → ปุ่มกลุ่มเปลี่ยนตาม · ตัวเลขการ์ด = จำนวนแถว ──
  for (const [kpi, k, นับ] of [["overdue", "todo", true], ["todo", "todo", true], ["cancel-rate", "done", false], ["avg-response", "quoted", false]] as const) {
    await การ์ด(page, kpi).click();
    await expect(ปุ่ม(page, k), `กดการ์ด ${kpi} → ปุ่ม ${k}`).toHaveAttribute("aria-selected", "true");
    if (นับ) await expect.poll(async () => {
      const ก = await หาค่าการ์ด(page, kpi), ร = await จำนวนแถว(page);
      if (ก !== ร) { await page.reload({ waitUntil: "domcontentloaded" }); await การ์ด(page, kpi).click(); }   // ข้ออื่นเพิ่มคำขอระหว่างอ่าน
      return ก === ร ? "ตรง" : `การ์ด ${ก} · แถว ${ร}`;
    }, { timeout: 30_000, message: `การ์ด ${kpi}: ตัวเลข = จำนวนแถว` }).toBe("ตรง");
  }
  // ── 4) (เดิม "ห้ามมีป้ายนับซ้ำกับการ์ด" · 27 ต.ค. 69) — ยกเลิก: บอสสั่ง 30 ต.ค. 69 ให้ปุ่มกลุ่มแสดงจำนวนตามแบบ
  //   แทนด้วย: จำนวนบนปุ่มต้องเท่ากับตัวเลขบนการ์ดเรื่องเดียวกัน (ต้องตีราคา) — ตัวเลขเดียวกันต้องไม่ขัดกัน
  await ปุ่ม(page, "todo").click();
  await expect.poll(async () => [await ปุ่ม(page, "todo").locator("[data-count]").getAttribute("data-count"), String(await หาค่าการ์ด(page, "todo"))].join(" = "),
    { timeout: 20_000, message: "จำนวนบนปุ่มต้องตีราคา = การ์ดต้องตีราคา" }).toMatch(/^(\d+) = \1$/);
});
