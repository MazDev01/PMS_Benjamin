import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, แถวคำขอ, หน้าต่างใบHQ, เลือกกลุ่มคำขอ, แท็บมุมมองคำขอ, ปุ่มเฉพาะเกินกำหนด, จำนวนสถานะคำขอ } from "./helpers";
import { เรียงคำขอตามกำหนด } from "../../packages/shared/lib/quoteRequests";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── หน้า HQ คำขอใบเสนอราคา: ปุ่ม 3 กลุ่มพร้อมจำนวน (บอสสั่ง 30 ต.ค. 69 · ตามแบบ) แทนช่องเลือกสถานะ (27 ต.ค. 69) ──
//   1) ไม่มีช่องเลือก · ปุ่ม ต้องตีราคา · ส่งแล้ว รอดีลเลอร์ · ปิด/ยกเลิก (รวมสั่งผลิต) อยู่ข้างช่องค้นหา · จอแคบไม่ล้น
//   2) จำนวนบนปุ่ม = ฐาน (hq_quote_board) = จำนวนแถว · 3) กดการ์ดแล้วปุ่มเปลี่ยนตาม · 4) จำนวนบนปุ่มต้องตีราคา = การ์ด
//   5) ความเร็ว: เปิดหน้า · สลับกลุ่ม · เลือกคำขอ ไม่เกิน 1 วินาที
//   6 พ.ย. 69 (บอสสั่ง ตารางแบบหน้าใบค่าแฟรนไชส์): ปุ่มกลุ่ม → ช่องเลือกสถานะพร้อมจำนวน + ตัวกรองดีลเลอร์ · ค่าเริ่มต้น ทุกสถานะ · ข้อ 1–5 ตรวจแบบเดิมบนตัวกรองใหม่
//   ต้องตกบนโค้ดก่อนแก้: มีแท็บกลุ่ม · ไม่มีตัวกรองดีลเลอร์
//   9 พ.ย. 69 (บอสสั่ง · ตรวจกลับด้านจาก 6 พ.ย.): แท็บมุมมอง ต้องตีราคา (ตารางหลัก) / ประวัติคำขอ · ตัวกรองสถานะอยู่ในประวัติเท่านั้น
//     ตารางหลักมีปุ่มเล็ก "เฉพาะเกินกำหนด" แทนตัวเลือก · การ์ดเวลาตอบ = ประวัติทุกสถานะ · การ์ดอัตรายกเลิก = ประวัติ "ยกเลิกแล้ว"
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
      phone: `08${String(n).slice(-8)}`, province: "ระยอง", status: "BULLET", project: "ZZTEST งานโกดัง 20x40 ม.", area: "800", note: "ZZTEST สเปกหลังคาเมทัลชีท"  });
    expect(l.error).toBeNull();
    เลขลีด.push(n);
    expect((await sb.rpc("quote_request_submit", { p_lead_num_id: n, p_product: "ZZTEST โกดัง" })).error).toBeNull();
  }
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", เลขลีด); });

// ตาราง 6 พ.ย. 69 (บอสสั่ง · ทับปุ่ม 3 กลุ่ม 30 ต.ค. 69): ตัวกรองสถานะ = ช่องเลือก (ตัวเลือกมีจำนวน) + ตัวกรองดีลเลอร์ ข้างช่องค้นหา · ค่าเริ่มต้น ทุกสถานะ
const ตัวกรอง = (page: Page) => page.getByLabel("กรองตามสถานะคำขอ");
const การ์ด = (page: Page, kpi: string) => page.locator(`[data-kpi-row] [data-kpi="${kpi}"]`);
const จำนวนแถว = async (page: Page) => {
  // แถบเปลี่ยนหน้าตัวกลางแสดงเสมอ — ยอดรวมจากแถบ ("แสดง a–b จาก N") · ไม่มีแถว = 0
  //   อ่านทีเดียว (allInnerTexts ไม่รอ) — กันแถบเปลี่ยนระหว่างสองคำสั่ง (ต้นเหตุไม่นิ่ง 28–29 ต.ค. 69)
  const [แถบ] = await page.getByText(/แสดง .* จาก .*/).allInnerTexts();
  if (แถบ !== undefined) { const m = แถบ.replace(/,/g, "").match(/จาก\s+(\d+)/); return m ? Number(m[1]) : NaN; }
  return แถวคำขอ(page).count();
};
const หาค่าการ์ด = async (page: Page, kpi: string) => Number(await การ์ด(page, kpi).locator("[data-value]").getAttribute("data-value"));

test("[ui·hq] คำขอใบเสนอราคา: ตัวกรองสถานะ (ช่องเลือกพร้อมจำนวน) + ดีลเลอร์ · การ์ดคุมตัวกรอง · จำนวน = ฐาน = แถว · ไม่เกิน 1 วินาที", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const hq = await db(ADMIN);

  // ── ความเร็วเปิดหน้า: นับจากเริ่มโหลดหน้าจนตาราง + การ์ดขึ้นครบ · วัด 3 ครั้งใช้ค่ากลาง
  //    (ครั้งเดียวแกว่งตามภาระเครื่อง: ครั้งแรกหลังเว็บสตาร์ท + ข้อทดสอบอื่นรันพร้อมกัน วัดได้ 1,228 / รอบซ้ำ 558 ms) ──
  //    เวลาจดในหน้าเว็บเอง ทุกเฟรม (polling: raf) ตอนแถวแรก + การ์ดขึ้นครบพร้อมกัน (29 ต.ค. 69 · คิวข้อ 3) · เกณฑ์ 1 วินาทีเท่าเดิม
  const ครั้ง: number[] = [], ช่วง: string[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    const ขึ้นครบ = await page.waitForFunction(() => {
      const แถว = document.querySelector('table[aria-label="ตารางคำขอใบเสนอราคา"] tbody tr.clickable') as HTMLElement | null;
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

  // ── 1) ไม่มีแท็บกลุ่มเดิม · ค่าเริ่มต้น = ตารางหลัก (ต้องตีราคา) ไม่มีตัวกรองสถานะ · ดีลเลอร์เป็นช่องเลือก ──
  expect.soft(await page.getByRole("tablist", { name: "กลุ่มคำขอ" }).count(), "ไม่มีแท็บกลุ่มแล้ว").toBe(0);
  await expect(แท็บมุมมองคำขอ(page, "main"), "ค่าเริ่มต้น = ตารางหลัก ต้องตีราคา").toHaveAttribute("aria-selected", "true");
  await expect(ตัวกรอง(page), "ตารางหลักไม่มีตัวกรองสถานะ (9 พ.ย. 69)").toHaveCount(0);
  await expect(ปุ่มเฉพาะเกินกำหนด(page), "ตารางหลักมีปุ่มเฉพาะเกินกำหนด").toHaveAttribute("aria-pressed", "false");
  await expect(page.getByLabel("กรองตามดีลเลอร์"), "มีตัวกรองดีลเลอร์").toHaveValue("");

  // ── 5) ความเร็วเปลี่ยนตัวกรอง + เปิดคำขอ ──
  //   แถวแรกที่คาด = ลำดับเดียวกับหน้าจอ (ส่งแล้ว = ไม่มีกำหนดส่ง เรียงใหม่สุดก่อน · ตัวเรียงกลาง)
  //   ค้นด้วยป้ายของข้อก่อน — ข้ออื่นที่รันพร้อมกันเพิ่มคำขอระหว่างหน้าเปิดอยู่ (แถวแรกของทั้งระบบเปลี่ยนได้ · ต้นเหตุตก 6 พ.ย. 69)
  await page.getByLabel("ค้นหาคำขอ").fill(ป้าย);
  // 9 พ.ย. 69: ตารางหลัก = คำขอใหม่ 2 ของข้อ (ที่ส่งใบแล้ว 2 อยู่ประวัติ · ไม่อยู่ตารางหลัก)
  await expect(แถวคำขอ(page, ป้าย), "ผลค้นของข้อในตารางหลัก = ต้องตีราคา 2 แถว").toHaveCount(2, { timeout: 20_000 });
  await expect(แถวคำขอ(page, `${ป้าย}-ส่งแล้ว`), "ส่งใบแล้วไม่อยู่ตารางหลัก").toHaveCount(0);
  const { data: ส่งแล้วฐาน } = await hq.rpc("hq_quote_board", { p_group: "quoted", p_q: ป้าย });
  const เรียง = เรียงคำขอตามกำหนด(((ส่งแล้วฐาน as { rows: { id: number; status: string; due_at: string; submitted_at: string; request_no: string }[] }).rows)
    .map(r => ({ id: r.id, status: r.status as never, dueAt: r.due_at, submittedAt: r.submitted_at, no: r.request_no })));
  const เลข = เรียง[0]?.no ?? null;
  let สลับสถานะ = NaN;
  if (เลข) {
    const t0 = Date.now();
    await เลือกกลุ่มคำขอ(page, "quoted");   // แท็บประวัติ + ส่งแล้ว รอดีลเลอร์
    await expect(แถวคำขอ(page).first()).toContainText(เลข, { timeout: 15_000 });
    สลับสถานะ = Date.now() - t0;
  }
  let เลือกคำขอ = NaN;
  if (await แถวคำขอ(page).count() > 1) {
    const ชื่อ = (await แถวคำขอ(page).nth(1).getAttribute("aria-label")) ?? "";
    const t0 = Date.now();
    await แถวคำขอ(page).nth(1).click();
    await expect(หน้าต่างใบHQ(page).getByRole("heading").first()).toContainText(ชื่อ.split(" ")[0], { timeout: 15_000 });
    เลือกคำขอ = Date.now() - t0;
    await หน้าต่างใบHQ(page).getByRole("button", { name: "ปิด" }).click();
  }
  await page.getByLabel("ค้นหาคำขอ").fill("");
  console.log(`[เวลา] เปิดหน้า ${เปิดหน้า} ms · เปลี่ยนตัวกรอง ${สลับสถานะ} ms · เปิดคำขอ ${เลือกคำขอ} ms`);
  expect.soft(เปิดหน้า, "เปิดหน้าไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!Number.isNaN(สลับสถานะ)) expect.soft(สลับสถานะ, "เปลี่ยนตัวกรองไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!Number.isNaN(เลือกคำขอ)) expect.soft(เลือกคำขอ, "เปิดคำขอไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);

  // ── 1) ต่อ: ชื่อตัวเลือกตามคำสั่ง · อยู่บรรทัดเดียวกับช่องค้นหาที่จอกว้าง · จอแคบไม่ล้น ──
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(แท็บมุมมองคำขอ(page, "main"), "เปิดหน้าใหม่ = ตารางหลัก").toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  {
    const [a, b] = await Promise.all([ปุ่มเฉพาะเกินกำหนด(page).boundingBox(), page.getByLabel("ค้นหาคำขอ").boundingBox()]);
    expect.soft(a && b && Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < 8, "จอ 1440px: ปุ่มเฉพาะเกินกำหนดอยู่บรรทัดเดียวกับช่องค้นหา").toBe(true);
  }
  await แท็บมุมมองคำขอ(page, "history").click();
  await expect(ตัวกรอง(page), "ประวัติ: ตัวกรองสถานะ ค่าเริ่มต้นทุกสถานะ").toHaveValue("all");
  const ชื่อตัวเลือก = (await ตัวกรอง(page).locator("option").allInnerTexts()).map(t => t.replace(/\s*\([\d,]+\)\s*$/, "").trim());
  // 9 พ.ย. 69: ตัวเลือกของประวัติ (ไม่มีต้องตีราคา/เกินกำหนด — อยู่ตารางหลัก) · เดิม: ["ทุกสถานะ", "ต้องตีราคา", "ต้องตีราคา · เกินกำหนด", "ส่งแล้ว รอดีลเลอร์", "ปิด", "ยกเลิกแล้ว"]
  expect.soft(ชื่อตัวเลือก, "ตัวเลือกสถานะของประวัติ (บอสสั่ง 9 พ.ย. 69)").toEqual(["ทุกสถานะ", "ส่งแล้ว รอดีลเลอร์", "ปิด", "ยกเลิกแล้ว"]);
  {
    const [a, b] = await Promise.all([ตัวกรอง(page).boundingBox(), page.getByLabel("ค้นหาคำขอ").boundingBox()]);
    expect.soft(a && b && Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < 8, "จอ 1440px: ตัวกรองอยู่บรรทัดเดียวกับช่องค้นหา").toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  expect.soft(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "จอ 390px: แถวเครื่องมือไม่ล้นจอ").toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── 2) จำนวนในตัวเลือก = ฐาน = จำนวนแถว (ค้นด้วยป้ายของข้อ — รู้ค่าแน่นอน: ต้องตีราคา 2 · ส่งแล้ว 2 · ปิด 0 · ทุกสถานะ 4) ──
  //   ปิด = สั่งผลิต + ปิด/ยกเลิกของฐาน
  await page.getByLabel("ค้นหาคำขอ").fill(ป้าย);
  const ฐานของ = async (k: "todo" | "quoted" | "done" | "all") => {
    const นับ = async (g: string) => ((await hq.rpc("hq_quote_board", { p_group: g, p_q: ป้าย })).data as { rows: unknown[] }).rows.length;
    return k === "done" ? (await นับ("won")) + (await นับ("closed")) : k === "all" ? (await นับ("quoted")) + (await นับ("won")) + (await นับ("closed")) : นับ(k);
  };
  // 9 พ.ย. 69: todo = แท็บตารางหลัก (จำนวนบนแท็บ) · quoted/done/all = ประวัติ (all ของประวัติ = ส่งแล้ว + ปิด · ไม่รวมต้องตีราคา = 2)
  for (const [k, รู้ค่า] of [["todo", 2], ["quoted", 2], ["done", 0], ["all", 2]] as const) {
    await เลือกกลุ่มคำขอ(page, k);
    const ฐาน = await ฐานของ(k);
    expect.soft(ฐาน, `ฐาน กลุ่ม ${k} (ค้นด้วยป้ายของข้อ) = ${รู้ค่า}`).toBe(รู้ค่า);
    await expect.poll(() => จำนวนแถว(page), { timeout: 20_000, message: `ตัวเลือก ${k}: จำนวนแถวบนจอ = ฐาน (${ฐาน})` }).toBe(ฐาน);
    await expect.poll(async () => Number(await จำนวนสถานะคำขอ(page, k).getAttribute("data-count")), { timeout: 20_000, message: `ตัวเลือก ${k}: จำนวนในตัวเลือก = จำนวนแถว` }).toBe(ฐาน);
  }
  // ตัวกรองดีลเลอร์: ชื่อดีลเลอร์ (ไม่มีรหัสในตัวเลือก) · เลือกแล้วแถว = คำขอของดีลเลอร์นั้น (ของข้อทั้งหมดเป็น RYG)
  const ชื่อRYG = ((await hq.from("dealers").select("name").eq("code", "RYG").single()).data?.name as string).trim();
  await page.getByLabel("กรองตามดีลเลอร์").selectOption({ label: ชื่อRYG });
  await expect.poll(() => จำนวนแถว(page), { timeout: 20_000, message: "ตัวกรองดีลเลอร์ RYG (ประวัติทุกสถานะ): แถวของข้อ 2" }).toBe(2);
  await แท็บมุมมองคำขอ(page, "main").click();
  await expect.poll(() => จำนวนแถว(page), { timeout: 20_000, message: "ตัวกรองดีลเลอร์ RYG (ตารางหลัก): แถวของข้อ 2 · รวม 4 ครบ" }).toBe(2);
  expect.soft(await page.getByLabel("กรองตามดีลเลอร์").locator("option").allInnerTexts(), "ตัวเลือกดีลเลอร์ไม่มีรหัส RYG").not.toContain("RYG");
  await page.getByLabel("กรองตามดีลเลอร์").selectOption("");
  await page.getByLabel("ค้นหาคำขอ").fill("");

  // ── 3) กดการ์ด → ตัวกรองเปลี่ยนตาม · ตัวเลขการ์ด = จำนวนแถว ──
  // 9 พ.ย. 69: ต้องตีราคา/เกิน 14 วัน = ตารางหลัก (ปุ่มเฉพาะเกินกำหนด) · อัตรายกเลิก = ประวัติ "ยกเลิกแล้ว" · เวลาตอบ = ประวัติทุกสถานะ
  for (const [kpi, k, นับ] of [["overdue", "overdue", true], ["todo", "todo", true], ["cancel-rate", "cancelled", false], ["avg-response", "all", false]] as const) {
    await การ์ด(page, kpi).click();
    if (k === "todo" || k === "overdue") {
      await expect(แท็บมุมมองคำขอ(page, "main"), `กดการ์ด ${kpi} → ตารางหลัก`).toHaveAttribute("aria-selected", "true");
      await expect(ปุ่มเฉพาะเกินกำหนด(page), `กดการ์ด ${kpi} → เฉพาะเกินกำหนด ${k === "overdue"}`).toHaveAttribute("aria-pressed", String(k === "overdue"));
    } else {
      await expect(แท็บมุมมองคำขอ(page, "history"), `กดการ์ด ${kpi} → หน้าประวัติ`).toHaveAttribute("aria-selected", "true");
      await expect(ตัวกรอง(page), `กดการ์ด ${kpi} → ตัวกรอง ${k}`).toHaveValue(k);
    }
    if (นับ) await expect.poll(async () => {
      const ก = await หาค่าการ์ด(page, kpi), ร = await จำนวนแถว(page);
      if (ก !== ร) { await page.reload({ waitUntil: "domcontentloaded" }); await การ์ด(page, kpi).click(); }   // ข้ออื่นเพิ่มคำขอระหว่างอ่าน
      return ก === ร ? "ตรง" : `การ์ด ${ก} · แถว ${ร}`;
    }, { timeout: 30_000, message: `การ์ด ${kpi}: ตัวเลข = จำนวนแถว` }).toBe("ตรง");
  }
  // ── 4) จำนวนในตัวเลือกต้องตีราคา = การ์ดต้องตีราคา (ตัวเลขเดียวกันต้องไม่ขัดกัน · ไม่มีคำค้น/ตัวกรองดีลเลอร์) ──
  await เลือกกลุ่มคำขอ(page, "todo");
  await expect.poll(async () => [await จำนวนสถานะคำขอ(page, "todo").getAttribute("data-count"), String(await หาค่าการ์ด(page, "todo"))].join(" = "),
    { timeout: 20_000, message: "จำนวนบนแท็บต้องตีราคา = การ์ดต้องตีราคา" }).toMatch(/^(\d+) = \1$/);
});
