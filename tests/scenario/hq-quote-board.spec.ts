import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน, เลือกกลุ่มคำขอ, แท็บมุมมองคำขอ, ปุ่มเฉพาะเกินกำหนด, จำนวนสถานะคำขอ, ตารางคำขอ, แถวคำขอ, หน้าต่างใบHQ } from "./helpers";
import { adminClient } from "./testDealers";
import { เลขลูกค้าเป้าหมายทดสอบ, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

// ── หน้า 5: กล่องงานคำขอราคาของ HQ (ใบ 0215 · บอสตัดสิน 19 ต.ค. 69) ─────────────────────────────────────────────
//   (6 พ.ย. 69 ตารางเต็มความกว้าง: ตัวเลือกสถานะแทนปุ่มกลุ่ม · กดแถว = หน้าต่างใบ HQ · เรียงตามกำหนดส่ง)
//   1 ตัวเลขบนปุ่มกลุ่มตรงกับฐาน (hq_quote_board) และตรงค่าที่รู้ล่วงหน้า · คำค้นเดียวกันกรองทั้งจำนวนและรายการ
//   2 เข้าหน้าแล้วเปิดคำขอบนสุดให้ทันที "แค่เปิดดู" — ไม่มีคำสั่งเขียนออกไปเลย · กดแถวแล้วใบฝั่งขวาเปลี่ยนตาม
//   3 ใบมีการแก้ค้าง → สลับแถว/กลุ่มได้ไม่ต้องถาม ร่างไม่หาย (บอสสั่ง 26 ต.ค. 69 · ทับ "ถามก่อนทิ้ง" ของ 19 ต.ค. 69)
//   4 ระหว่างบันทึก/ส่งใบ ห้ามเปลี่ยนแถวหรือกลุ่มจนกว่าจะเสร็จ (เปลี่ยนระหว่างรอคำตอบ = ต้นเหตุข้อไม่นิ่งรอบก่อน ๆ)
//   ไม่มีปุ่ม "รับเรื่อง" — บันทึกร่างรับเรื่องให้ทางเดียว (quote-request-flow.spec.ts)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

const admin = adminClient();
// ป้าย ZZTEST- = ตัวตรวจแถวค้าง (check-test-leftovers) จับได้ถ้าเก็บกวาดไม่ครบ
const แท็ก = `ZZTEST-BOARD${Date.now() % 100_000}`;
const วัน = 86_400_000;
// ต้องตีราคา 2 (A เกินกำหนด · B ใหม่) · รอดีลเลอร์ 1 · สั่งผลิต 1 · ปิด 1
const ชุด = [
  { k: "A", st: "pricing", due: -1, sub: 15 }, { k: "B", st: "new", due: 10, sub: 4 },
  { k: "C", st: "quoted", due: 5, sub: 9 }, { k: "D", st: "won", due: -10, sub: 30 }, { k: "E", st: "cancelled", due: 8, sub: 6 },
].map(x => ({ ...x, id: 0, lead: เลขลูกค้าเป้าหมายทดสอบ(), บริษัท: `${แท็ก} ลูกค้า${x.k}`, no: `RQ-${แท็ก}-${x.k}` }));
// ⚠️ ห้ามใส่เลขลำดับคำขอ (id) เอง — ให้ฐานออกเลข (รอบเต็ม 19 ต.ค. 69): ข้ออื่นที่รันขนานเรียก restore_sync_sequences
//   ตัวนับจึงกระโดดตามเลขที่ใส่เอง (6 หลัก) → เลขคำขอ RQ-ปี-ลำดับ 5 หลักถูกตัดแล้วชนกัน ข้อที่ส่งคำขอราคาตกทั้งชุด
const ของ = (k: string) => ชุด.find(x => x.k === k)!;

// ใบ HQ ที่ส่งแล้วมีตัวกันลบ (hq_quotes_lock_sent) — ลบด้วยกุญแจไม่ได้ คำขอที่ผูกอยู่ก็ลบไม่ได้ตาม (เคยค้างเงียบ 14 ชุด · 19 ต.ค. 69)
//   ใช้ตัวล้างกลางที่ปลดตัวกันชั่วคราวในฐานทดสอบ (legacyQuotes.ts) แล้วตรวจว่าไม่เหลือจริง
async function ล้าง() {
  ล้างใบHQทดสอบ("RYG", ชุด.map(x => x.lead));
  const { data: เหลือ } = await admin.from("quote_requests").select("id").like("request_no", `RQ-${แท็ก}-%`);
  expect(เหลือ ?? [], "คำขอทดสอบต้องถูกลบหมด").toEqual([]);
}
test.beforeAll(async () => {
  await ล้าง();
  const now = Date.now();
  for (const x of ชุด) {
    const l = await admin.from("leads").insert({ id: `#L-${x.lead}`, num_id: x.lead, dealer_code: "RYG", company: x.บริษัท, name: x.บริษัท,
      contact: "ผู้ทดสอบ", phone: `08${String(x.lead).slice(-8)}`, province: "ระยอง", status: "WAITING" });
    expect(l.error, `สร้างลูกค้าเป้าหมาย ${x.k}`).toBeNull();
    const ปิด = ["won", "cancelled"].includes(x.st);
    const r = await admin.from("quote_requests").insert({ request_no: x.no, dealer_code: "RYG", lead_num_id: x.lead, product: "โกดังทดสอบ",
      province: "ระยอง", status: x.st, submitted_at: new Date(now - x.sub * วัน).toISOString(), due_at: new Date(now + x.due * วัน).toISOString(),
      quoted_at: ["quoted", "won"].includes(x.st) ? new Date(now - 2 * วัน).toISOString() : null,
      closed_at: ปิด ? new Date(now - วัน).toISOString() : null, cancel_reason: x.st === "cancelled" ? "ทดสอบยกเลิก" : "" }).select("id").single();
    expect(r.error, `สร้างคำขอ ${x.k}`).toBeNull();
    x.id = Number(r.data!.id);
  }
  for (const [k, st] of [["C", "sent"], ["D", "ordered"]] as const) {
    const h = await admin.from("hq_quotes").insert({ request_id: ของ(k).id, version: 1, quote_no: `HQ-${แท็ก}-${k}`, status: st, line_items: [],
      total_cost: 100_000, valid_until: new Date(Date.now() + 20 * วัน).toISOString().slice(0, 10), sent_at: new Date().toISOString() });
    expect(h.error, `สร้างใบ HQ ${k}`).toBeNull();
  }
});
test.afterAll(ล้าง);

async function เข้าหน้า(page: Page) {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
}
// ตารางเต็มความกว้าง (บอสสั่ง 6 พ.ย. 69 · แทนรายการซ้าย + แผงขวา) — แถวของชุดนี้ = แถวที่มีป้ายชุด
const แถวชุด = (page: Page) => แถวคำขอ(page, แท็ก);
const แถวของ = (page: Page, k: string) => แถวคำขอ(page, ของ(k).บริษัท);
const กล่องยืนยัน = (page: Page) => page.locator(".pms-confirm[role='alertdialog']");
const ปิดใบ = async (page: Page) => { await หน้าต่างใบHQ(page).getByRole("button", { name: "ปิด" }).click(); await expect(หน้าต่างใบHQ(page)).toHaveCount(0); };

test("[H9x] [ui·hq] ตัวเลือกสถานะได้แถวตรงกับฐาน (hq_quote_board) และตรงค่าที่รู้ล่วงหน้า · คำค้นกรองทั้งจำนวนและรายการ · เรียงตามกำหนดส่ง", async ({ page }) => {
  await เข้าหน้า(page);
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  const hq = await db(ADMIN);
  const { data, error } = await hq.rpc("hq_quote_board", { p_group: "todo", p_q: แท็ก });
  expect(error).toBeNull();
  const ฐาน = (data as { counts: Record<string, number> }).counts;
  // ยกเลิกแล้ว (ใบ 0280) = ตัวนับเพิ่ม · คำขอ E (ยกเลิก) อยู่ในกลุ่มปิดด้วย
  expect(ฐาน, "ชุดข้อมูลที่รู้ค่าล่วงหน้า").toEqual({ todo: 2, overdue: 1, quoted: 1, won: 1, closed: 1, cancelled: 1 });
  // ตัวเลือกสถานะพร้อมจำนวน (บอสสั่ง 6 พ.ย. 69 · แทนปุ่มกลุ่ม): จำนวนในตัวเลือก = ฐาน · แถว = จำนวน
  //   ปิด = สั่งผลิต + ปิด/ยกเลิกของฐาน · เกินกำหนด = การ์ดเกิน 14 วัน (อยู่ในกลุ่มต้องตีราคา)
  // 9 พ.ย. 69 (บอสสั่ง): ตารางหลัก = ต้องตีราคาเท่านั้น · ประวัติ "ทุกสถานะ" = ส่งแล้ว + สั่งผลิต + ปิด/ยกเลิก (ไม่รวมต้องตีราคา · เดิม all = ทุกกลุ่มรวมต้องตีราคา)
  const ประวัติทั้งหมด = ฐาน.quoted + ฐาน.won + ฐาน.closed;
  for (const [k, n] of [["quoted", ฐาน.quoted], ["done", ฐาน.won + ฐาน.closed], ["cancelled", ฐาน.cancelled], ["overdue", ฐาน.overdue], ["todo", ฐาน.todo], ["all", ประวัติทั้งหมด]] as const) {
    await เลือกกลุ่มคำขอ(page, k);
    await expect(จำนวนสถานะคำขอ(page, k), `ตัวเลือก ${k}: จำนวน = ฐาน`).toHaveAttribute("data-count", String(n), { timeout: 20_000 });
    await expect(แถวชุด(page), `ตัวเลือก ${k}: แถว = ฐาน ${n}`).toHaveCount(n, { timeout: 20_000 });
  }
  // แท็บประวัติแสดงคำขอที่ไม่ต้องตีราคาเท่านั้น — A/B (ต้องตีราคา) ไม่อยู่ประวัติ · ตารางหลักไม่มี C/D/E
  await expect(แถวของ(page, "A"), "ประวัติ: ไม่มีคำขอที่ต้องตีราคา").toHaveCount(0);
  await expect(แถวของ(page, "B")).toHaveCount(0);
  await page.locator('[data-kpi-row] [data-kpi="overdue"]').click();
  await expect(ปุ่มเฉพาะเกินกำหนด(page), "การ์ดเกิน 14 วัน = ตารางหลักเฉพาะเกินกำหนด").toHaveAttribute("aria-pressed", "true");
  await expect(แท็บมุมมองคำขอ(page, "main")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("กรองตามสถานะคำขอ"), "ตารางหลักไม่มีตัวกรองสถานะ").toHaveCount(0);
  await expect(แถวชุด(page), "การ์ดเกิน 14 วัน: แถว = ฐาน").toHaveCount(ฐาน.overdue, { timeout: 20_000 });
  await expect(แถวชุด(page).first(), "เกิน 14 วัน = คำขอที่เลยกำหนด").toContainText(ของ("A").บริษัท);
  await page.locator('[data-kpi-row] [data-kpi="overdue"]').click();
  await expect(ปุ่มเฉพาะเกินกำหนด(page), "กดการ์ดเดิมซ้ำ = ล้างตัวกรองเกินกำหนด").toHaveAttribute("aria-pressed", "false");
  // เรียงค่าเริ่มต้น (บอสสั่ง 6 พ.ย. 69): มีกำหนดส่งก่อน เร็วสุด/เกินมากสุดบนสุด (A เกิน 1 วัน → B เหลือ 10 วัน)
  //   ไม่มีกำหนดส่ง (ส่งแล้ว/ปิด/ยกเลิก) ต่อท้าย ใหม่สุดก่อน (E ขอเมื่อ 6 วันก่อน → C 9 วัน → D 30 วัน)
  //   9 พ.ย. 69: ตารางหลัก = AB (ต้องตีราคาเท่านั้น) · ประวัติ = ECD (เดิมตารางเดียว ABECD)
  await expect.poll(async () => (await แถวชุด(page).allInnerTexts()).map(t => ชุด.find(x => t.includes(x.บริษัท))?.k).join(""),
    { timeout: 20_000, message: "ลำดับค่าเริ่มต้น ตารางหลัก" }).toBe("AB");
  await เลือกกลุ่มคำขอ(page, "all");
  await expect.poll(async () => (await แถวชุด(page).allInnerTexts()).map(t => ชุด.find(x => t.includes(x.บริษัท))?.k).join(""),
    { timeout: 20_000, message: "ลำดับค่าเริ่มต้น ประวัติ (ใหม่สุดก่อน)" }).toBe("ECD");
  await เลือกกลุ่มคำขอ(page, "todo");
  // แถวเกินกำหนด: สถานะจริง + คอลัมน์กำหนดส่งแดง "เกิน 1 วัน" (ป้ายเดียว ไม่ซ้ำสองที่ · เดิม "เกินกำหนด 1 วัน" ที่ป้ายสถานะ)
  await expect(แถวของ(page, "A").getByTestId("row-tag")).toHaveText("กำลังตีราคา");
  await expect(แถวของ(page, "A").getByTestId("row-countdown")).toHaveText("เกิน 1 วัน");
  await expect(แถวของ(page, "A").getByTestId("row-countdown")).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(แถวของ(page, "A")).not.toContainText("เกิน 14 วัน");
  await expect(แถวของ(page, "B").getByTestId("row-tag")).toHaveText("ใหม่");
  await expect(แถวของ(page, "B").getByTestId("row-countdown")).toHaveText("เหลือ 10 วัน");
  await expect(แถวของ(page, "C"), "ตารางหลัก: ไม่มีคำขอที่ส่งใบแล้ว (อยู่ประวัติ)").toHaveCount(0);
  await expect(แถวของ(page, "E"), "ตารางหลัก: ไม่มีคำขอที่ยกเลิกแล้ว").toHaveCount(0);
  await เลือกกลุ่มคำขอ(page, "all");
  await expect(แถวของ(page, "C").getByTestId("row-countdown"), "ส่งแล้ว = ไม่มีกำหนดส่ง").toHaveCount(0);
  await expect(แถวของ(page, "E")).toContainText("ยกเลิก");
});

test("[H7] [ui·hq] เข้าหน้าไม่มีคำสั่งเขียน · กดแถว = หน้าต่างใบ HQ ของแถวนั้น (แค่เปิดดู)", async ({ page }) => {
  const เขียน: string[] = [];
  page.on("request", r => { if (r.method() !== "GET" && /\/api\/v1\/quote-requests|\/rest\/v1\/(quote_requests|hq_quotes)|\/rest\/v1\/rpc\/(hq_quote|quote_request)/.test(r.url())) เขียน.push(`${r.method()} ${r.url()}`); });
  await เข้าหน้า(page);
  await expect(ตารางคำขอ(page).locator("tbody tr.clickable").first(), "ตารางโหลดเสร็จ").toBeVisible({ timeout: 20_000 });
  await expect(หน้าต่างใบHQ(page), "ตาราง: เข้าหน้าไม่เปิดหน้าต่างเอง").toHaveCount(0);

  // กดแถวไหน หน้าต่างเป็นของแถวนั้น
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  for (const k of ["B", "A"]) {
    await แถวของ(page, k).click();
    const ใบ = หน้าต่างใบHQ(page);
    await expect(ใบ.getByRole("heading"), `หน้าต่างต้องเป็นของคำขอ ${k}`).toContainText(ของ(k).no, { timeout: 20_000 });
    await expect(ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).or(ใบ.getByText(/ใบนี้แก้ไม่ได้/)), "ใบโหลดเสร็จ").toBeVisible({ timeout: 20_000 });
    await ปิดใบ(page);
  }
  // ปุ่ม "ดู" ในแถว = หน้าต่างเดียวกัน · ทำใบ = กดได้เฉพาะคำขอที่ต้องตีราคา
  await แถวของ(page, "B").getByRole("button", { name: /^ดูคำขอ/ }).click();
  await expect(หน้าต่างใบHQ(page).getByRole("heading")).toContainText(ของ("B").no);
  await ปิดใบ(page);
  await expect(แถวของ(page, "B").locator("[data-act='make-hq-quote']"), "ต้องตีราคา = ทำใบได้").toBeEnabled();
  // 9 พ.ย. 69: คำขอที่ส่งแล้วอยู่แท็บประวัติ = ดูอย่างเดียว ไม่มีปุ่มทำใบเลย (เดิมปุ่มกดไม่ได้ในตารางเดียว)
  await เลือกกลุ่มคำขอ(page, "quoted");
  await expect(แถวของ(page, "C"), "ส่งแล้วอยู่ประวัติ").toHaveCount(1);
  await expect(แถวของ(page, "C").locator("[data-act='make-hq-quote']"), "ประวัติ: ไม่มีปุ่มทำใบ").toHaveCount(0);
  await expect(ตารางคำขอ(page), "ประวัติ = ดูอย่างเดียว").toHaveAttribute("data-readonly", "");
  expect(เขียน, "เปิดดูอย่างเดียว ต้องไม่มีคำสั่งเขียน/เปลี่ยนสถานะออกไปเลย").toEqual([]);
  expect((await admin.from("quote_requests").select("status").eq("id", ของ("B").id).single()).data?.status, "B ยังเป็นคำขอใหม่").toBe("new");
});

// บอสสั่ง 26 ต.ค. 69 (ทับข้อตัดสิน 19 ต.ค. 69 "ถามก่อนทิ้ง"): ร่างที่พิมพ์ค้างห้ามหายเมื่อปิดหน้าต่าง/เปิดคำขออื่น
//   ปิดได้ทันทีไม่ต้องถาม · เปิดกลับมาแล้วร่างยังอยู่ครบ · ไม่ได้บันทึกเข้าฐานเอง (ร่างค้างเก็บที่หน้า)
test("[ui·hq] ใบมีการแก้ค้าง → ปิด/เปิดคำขออื่น/เปลี่ยนตัวกรองได้ไม่ต้องถาม · กลับมาร่างยังอยู่ · ไม่บันทึกเข้าฐานเอง", async ({ page }) => {
  await เข้าหน้า(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, ของ("B").บริษัท);
  // ใบโหลดเสร็จ · ไม่มีแถวว่างให้พิมพ์ = กดเพิ่มก่อน — ข้อนี้ตรวจเรื่องร่าง ไม่ใช่เรื่องแถวว่าง
  await expect(ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" })).toBeVisible({ timeout: 20_000 });
  if (await ใบ.getByLabel("ชื่อรายการ 1").count() === 0) await ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await ใบ.getByLabel("ชื่อรายการ 1").fill("รายการที่ยังไม่บันทึก");
  await ใบ.getByLabel("ต้นทุนต่อหน่วย 1").fill("2500");

  // ปิดหน้าต่าง → ไม่ถาม · แถวบอกว่ามีร่างค้าง · เปิด A ได้ทันที
  await ปิดใบ(page);
  await expect(กล่องยืนยัน(page), "ไม่ต้องถามก่อนทิ้ง (ร่างเก็บไว้ให้)").toHaveCount(0);
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  await expect(แถวของ(page, "B"), "แถวที่มีร่างค้างบอกไว้").toContainText("ร่างยังไม่บันทึก");
  await แถวของ(page, "A").click();
  await expect(หน้าต่างใบHQ(page).getByRole("heading")).toContainText(ของ("A").no, { timeout: 20_000 });
  await ปิดใบ(page);
  // เปลี่ยนตัวกรองแล้วกลับ → ไม่ถาม
  await เลือกกลุ่มคำขอ(page, "quoted");
  await expect(กล่องยืนยัน(page)).toHaveCount(0);
  await เลือกกลุ่มคำขอ(page, "todo");
  // กลับมาที่ B → ร่างยังอยู่ครบ
  await แถวของ(page, "B").click();
  const ใบB = หน้าต่างใบHQ(page);
  await expect(ใบB.getByLabel("ชื่อรายการ 1"), "ร่างที่พิมพ์ไว้ต้องยังอยู่").toHaveValue("รายการที่ยังไม่บันทึก", { timeout: 15_000 });
  await expect(ใบB.getByTestId("draft-restored"), "บอกว่าเป็นร่างที่ยังไม่บันทึก").toBeVisible();
  expect((await admin.from("hq_quotes").select("id").eq("request_id", ของ("B").id)).data ?? [], "ปิด/เปิดไปมาไม่บันทึกเข้าฐานเอง").toEqual([]);
  expect((await admin.from("quote_requests").select("status").eq("id", ของ("B").id).single()).data?.status, "ยังไม่รับเรื่อง (ไม่ได้บันทึก)").toBe("new");
});

test("[ui·hq] ระหว่างบันทึกร่าง ปิดหน้าต่างไม่ได้ (ปุ่มปิด · Esc · กดนอกกรอบ) จนกว่าจะเสร็จ · เสร็จแล้วปิดได้ตามปกติ", async ({ page }) => {
  await เข้าหน้า(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, ของ("B").บริษัท);
  await ใบ.getByLabel("ชื่อรายการ 1").fill("โครงสร้างเหล็ก");   // เปิดมามีแถวว่างพร้อมพิมพ์ 1 แถว (26 ต.ค. 69)
  await ใบ.getByLabel("ต้นทุนต่อหน่วย 1").fill("1000");

  // กักคำสั่งบันทึกไว้ (ทั้งเส้นทาง api และต่อฐานตรง) จนกว่าจะตรวจเสร็จ
  let ปล่อย: () => void = () => {};
  const รอปล่อย = new Promise<void>(r => { ปล่อย = r; });
  let กัก = 0;
  await page.route(/\/api\/v1\/quote-requests|\/rest\/v1\/rpc\/hq_quote_save/, async route => {
    const r = route.request();
    if (r.method() === "POST" && (/hq_quote_save/.test(r.url()) || /"save-hq"/.test(r.postData() ?? ""))) { กัก++; await รอปล่อย; }
    return route.continue();
  });
  await ใบ.getByRole("button", { name: "บันทึกร่าง" }).click();
  await expect.poll(() => กัก, { message: "คำสั่งบันทึกต้องออกไป (แล้วค้างอยู่)" }).toBe(1);
  await expect(ใบ.getByRole("button", { name: "ปิด" }), "ระหว่างบันทึก ปุ่มปิดกดไม่ได้").toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(4, 4);   // ฉากหลังนอกกรอบ
  await expect(ใบ, "ระหว่างบันทึก หน้าต่างยังเปิดอยู่ (ห้ามเปลี่ยนคำขอระหว่างรอคำตอบ)").toBeVisible();
  await expect(ใบ.getByRole("heading")).toContainText(ของ("B").no);

  ปล่อย();
  await expect.poll(async () => (await admin.from("quote_requests").select("status").eq("id", ของ("B").id).single()).data?.status,
    { timeout: 20_000, message: "บันทึกร่าง = รับเรื่อง" }).toBe("pricing");
  await expect(ใบ.getByRole("button", { name: "ปิด" }), "บันทึกเสร็จแล้วปิดได้").toBeEnabled({ timeout: 15_000 });
  await ปิดใบ(page);
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  await แถวของ(page, "A").click();
  await expect(กล่องยืนยัน(page), "บันทึกแล้วไม่มีการแก้ค้าง ต้องไม่ถาม").toHaveCount(0);
  await expect(หน้าต่างใบHQ(page).getByRole("heading")).toContainText(ของ("A").no, { timeout: 20_000 });
});
