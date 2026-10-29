import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── หน้า HQ คำขอใบเสนอราคา: ช่องเลือกสถานะช่องเดียวแทนแถวปุ่มกรอง (บอสสั่ง 27 ต.ค. 69 · ใบ 0249) ───────────────────────
//   1) ไม่มีแถวปุ่มกรอง · ช่องเลือกสถานะอยู่ข้างช่องค้นหา (บรรทัดเดียวกัน) · ค่าเริ่มต้น "ต้องตีราคา" · ตัวเลือกครบ
//   2) เลือก "ส่งแล้ว รอดีลเลอร์" ได้แถวตรงฐาน (hq_quote_board quoted) · "ทั้งหมด" ได้ทุกกลุ่ม
//   3) กดการ์ดแล้วช่องเลือกเปลี่ยนตาม (ต้องตีราคา → todo · เกิน 14 วัน → overdue · อัตรายกเลิก → closed) · ตัวเลขการ์ด = จำนวนแถว
//   4) ห้ามมีป้ายนับซ้ำกับการ์ด (ตัวเลขเดียวกันแสดง 2 ที่) — แถบเปลี่ยนหน้ามาตรฐาน ("แสดง 1–10 จาก N") ไม่นับ (ตัวกลางทุกตาราง)
//   5) ความเร็ว: เปิดหน้า · สลับสถานะ · เลือกคำขอ ไม่เกิน 1 วินาที (พิมพ์ตัวเลขทุกครั้ง · รายงานก่อน/หลัง)
//   ต้องตกบนโค้ดก่อนแก้: มีแถวปุ่มกรอง · ไม่มีช่องเลือก · กดการ์ดเกิน 14 วันได้ทั้งกลุ่ม · ปุ่มกรองมีตัวเลขซ้ำการ์ด
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

const ช่องเลือก = (page: Page) => page.getByLabel("สถานะคำขอ");
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

test("[ui·hq] คำขอใบเสนอราคา: ช่องเลือกสถานะแทนแถวปุ่มกรอง · การ์ดคุมช่องเลือก · ไม่มีตัวเลขซ้ำ · เร็วไม่เกิน 1 วินาที", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const hq = await db(ADMIN);

  // ── ความเร็วเปิดหน้า: นับจากเริ่มโหลดหน้าจนรายการ + การ์ดขึ้นครบ · วัด 3 ครั้งใช้ค่ากลาง
  //    (ครั้งเดียวแกว่งตามภาระเครื่อง: ครั้งแรกหลังเว็บสตาร์ท + ข้อทดสอบอื่นรันพร้อมกัน วัดได้ 1,228 / รอบซ้ำ 558 ms) ──
  const ครั้ง: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    await expect(รายการ(page).getByRole("button").first()).toBeVisible({ timeout: 30_000 });
    await expect(การ์ด(page, "todo").locator("[data-value]")).not.toHaveAttribute("data-value", "", { timeout: 30_000 });
    ครั้ง.push(Math.round(await page.evaluate(() => performance.now())));
  }
  const เปิดหน้า = [...ครั้ง].sort((a, b) => a - b)[1];
  console.log(`[เวลา] เปิดหน้า 3 ครั้ง ${ครั้ง.join(" / ")} ms`);
  await settle(page);

  // ── 1) ไม่มีแถวปุ่มกรอง · ช่องเลือกข้างช่องค้นหา ──
  expect.soft(await page.getByRole("tablist", { name: "กรองตามสถานะ" }).count(), "ไม่มีแถวปุ่มกรองแล้ว").toBe(0);
  const มีช่องเลือก = (await ช่องเลือก(page).count()) > 0;
  expect.soft(มีช่องเลือก, "มีช่องเลือกสถานะ").toBe(true);

  // ── 5) ความเร็วสลับสถานะ + เลือกคำขอ (โค้ดเดิมไม่มีช่องเลือก = วัดผ่านปุ่มกรองเดิม เพื่อเทียบก่อน/หลัง) ──
  const แรกของ = async (g: string) => {
    const { data } = await hq.rpc("hq_quote_board", { p_group: g, p_q: "" });
    return ((data as { rows: { request_no: string }[] }).rows[0]?.request_no) ?? null;
  };
  const เลข = await แรกของ("quoted");
  let สลับสถานะ = NaN;
  if (เลข) {
    const t0 = Date.now();
    if (มีช่องเลือก) await ช่องเลือก(page).selectOption("quoted");
    else await page.getByRole("tab", { name: /^ส่งแล้ว รอดีลเลอร์/ }).click();
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
  console.log(`[เวลา] เปิดหน้า ${เปิดหน้า} ms · สลับสถานะ ${สลับสถานะ} ms · เลือกคำขอ ${เลือกคำขอ} ms`);
  expect.soft(เปิดหน้า, "เปิดหน้าไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!Number.isNaN(สลับสถานะ)) expect.soft(สลับสถานะ, "สลับสถานะไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!Number.isNaN(เลือกคำขอ)) expect.soft(เลือกคำขอ, "เลือกคำขอไม่เกิน 1 วินาที").toBeLessThanOrEqual(1000);
  if (!มีช่องเลือก) return;   // โค้ดก่อนแก้: ตกแล้วที่ "มีช่องเลือกสถานะ" — ข้อที่เหลือต้องใช้ช่องเลือก

  // ── 1) ต่อ: ตัวเลือกครบ · ค่าเริ่มต้น · อยู่บรรทัดเดียวกับช่องค้นหา ──
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(ช่องเลือก(page), "ค่าเริ่มต้น = ต้องตีราคา").toHaveValue("todo", { timeout: 20_000 });
  const ตัวเลือก = await ช่องเลือก(page).locator("option").allInnerTexts();
  for (const ป้าย of ["ต้องตีราคา", "ส่งแล้ว รอดีลเลอร์", "สั่งผลิต", "ปิด/ยกเลิก", "ทั้งหมด"])
    expect.soft(ตัวเลือก.some(t => t.trim() === ป้าย), `มีตัวเลือก "${ป้าย}"`).toBe(true);
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    const [a, b] = await Promise.all([ช่องเลือก(page).boundingBox(), page.getByLabel("ค้นหาคำขอ").boundingBox()]);
    expect.soft(a && b && Math.abs((a.y + a.height / 2) - (b.y + b.height / 2)) < 8, `จอ ${w}px: ช่องเลือกอยู่ข้างช่องค้นหา (บรรทัดเดียวกัน)`).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── 2) เลือก "ส่งแล้ว รอดีลเลอร์" ได้แถวตรงฐาน · "ทั้งหมด" = ทุกกลุ่ม ──
  //   ค้นด้วยป้ายของข้อ — รู้ค่าแน่นอน: ส่งแล้ว 2 · ต้องตีราคา 2 · สั่งผลิต 0 · ปิด 0 · ทั้งหมด 4 (เดิมเทียบทั้งเครือ: ข้ออื่นเพิ่มคำขอ = จอค้างค่าเก่า)
  //   ตรวจทั้ง "จอ = ฐาน" (ตัวกรองหน้าเว็บกับฐานใช้คำค้นเดียวกัน) และ "ฐาน = ค่าที่รู้" (ฐานกรองกลุ่มถูก)
  await page.getByLabel("ค้นหาคำขอ").fill(ป้าย);
  for (const [g, รู้ค่า] of [["todo", 2], ["quoted", 2], ["won", 0], ["closed", 0], ["all", 4]] as const) {
    await ช่องเลือก(page).selectOption(g);
    const { data } = await hq.rpc("hq_quote_board", { p_group: g, p_q: ป้าย });
    const ฐาน = (data as { rows: unknown[] }).rows.length;
    expect.soft(ฐาน, `ฐาน กลุ่ม ${g} (ค้นด้วยป้ายของข้อ) = ${รู้ค่า}`).toBe(รู้ค่า);
    await expect.poll(() => จำนวนแถว(page), { timeout: 20_000, message: `เลือก ${g}: จำนวนแถวบนจอ = ฐาน (${ฐาน})` }).toBe(ฐาน);
  }
  await page.getByLabel("ค้นหาคำขอ").fill("");
  const { data: ทั้งหมด } = await hq.rpc("hq_quote_board", { p_group: "all", p_q: "" });
  const c = (ทั้งหมด as { counts: Record<string, number> }).counts;
  expect.soft((ทั้งหมด as { rows: unknown[] }).rows.length, "ทั้งหมด = ผลรวมทุกกลุ่ม (ผลจากคำขอเดียวกันที่ฐาน)").toBe(c.todo + c.quoted + c.won + c.closed);

  // ── 3) กดการ์ด → ช่องเลือกเปลี่ยนตาม · ตัวเลขการ์ด = จำนวนแถว ──
  for (const [kpi, ค่า, นับ] of [["overdue", "overdue", true], ["todo", "todo", true], ["cancel-rate", "closed", false], ["avg-response", "quoted", false]] as const) {
    await การ์ด(page, kpi).click();
    await expect(ช่องเลือก(page), `กดการ์ด ${kpi} → ช่องเลือก ${ค่า}`).toHaveValue(ค่า);
    if (นับ) await expect.poll(async () => {
      const ก = await หาค่าการ์ด(page, kpi), ร = await จำนวนแถว(page);
      if (ก !== ร) { await page.reload({ waitUntil: "domcontentloaded" }); await การ์ด(page, kpi).click(); }   // ข้ออื่นเพิ่มคำขอระหว่างอ่าน
      return ก === ร ? "ตรง" : `การ์ด ${ก} · แถว ${ร}`;
    }, { timeout: 30_000, message: `การ์ด ${kpi}: ตัวเลข = จำนวนแถว` }).toBe("ตรง");
  }

  // ── 4) ห้ามมีป้ายนับซ้ำกับการ์ด — ตัวเลขของการ์ดต้องไม่โผล่เป็นป้ายนับที่อื่นในหน้า (นอกแถวการ์ด · ไม่นับแถบเปลี่ยนหน้า) ──
  await ช่องเลือก(page).selectOption("todo");
  const ซ้ำ = await page.evaluate(() => {
    const ค่า = Array.from(document.querySelectorAll("[data-kpi-row] [data-value]")).map(e => e.getAttribute("data-value")).filter(v => v && /^\d+$/.test(v));
    const พบ: string[] = [];
    const เดิน = (n: Node) => {
      if (n.nodeType === 1) {
        const el = n as Element;
        if (el.closest("[data-kpi-row], [data-pagination], .tt-bar") || ["SCRIPT", "STYLE"].includes(el.tagName)) return;
        if (el.tagName === "OPTION" || el.tagName === "BUTTON" || el.getAttribute("role") === "tab") {
          const t = (el.textContent ?? "").trim();
          for (const v of ค่า) if (new RegExp(`(^|[·:(\\s])${v}(\\s*(คำขอ|รายการ)?\\)?)$`).test(t)) พบ.push(`${el.tagName.toLowerCase()} "${t}"`);
        }
      }
      if (n.nodeType === 3) {
        const t = (n.textContent ?? "").trim();
        for (const v of ค่า) if (new RegExp(`(^|\\s)${v}\\s*คำขอ`).test(t) && !(n.parentElement?.closest("[data-kpi-row]"))
            && !/^แสดง /.test((n.parentElement?.textContent ?? "").trim())) พบ.push(`ข้อความ "${t.slice(0, 60)}"`);
      }
      n.childNodes.forEach(เดิน);
    };
    เดิน(document.body);
    return พบ;
  });
  expect.soft(ซ้ำ, "ไม่มีป้ายนับซ้ำกับตัวเลขบนการ์ด").toEqual([]);
});
