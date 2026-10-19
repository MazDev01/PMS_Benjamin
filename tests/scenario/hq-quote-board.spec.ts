import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { adminClient } from "./testDealers";
import { เลขลูกค้าเป้าหมายทดสอบ, ล้างใบHQทดสอบ } from "./hqQuoteFixture";

// ── หน้า 5: กล่องงานคำขอราคาของ HQ (ใบ 0215 · บอสตัดสิน 19 ต.ค. 69) ─────────────────────────────────────────────
//   1 ตัวเลขบนปุ่มกลุ่มตรงกับฐาน (hq_quote_board) และตรงค่าที่รู้ล่วงหน้า · คำค้นเดียวกันกรองทั้งจำนวนและรายการ
//   2 เข้าหน้าแล้วเปิดคำขอบนสุดให้ทันที "แค่เปิดดู" — ไม่มีคำสั่งเขียนออกไปเลย · กดแถวแล้วใบฝั่งขวาเปลี่ยนตาม
//   3 ใบมีการแก้ค้าง → กดแถวอื่น/ปุ่มกลุ่มต้องถามก่อนทิ้ง · ยกเลิก = อยู่ใบเดิม ข้อมูลที่พิมพ์ยังอยู่ครบ
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
const รายการ = (page: Page) => page.getByRole("list", { name: "รายการคำขอ" });
const แถวของ = (page: Page, k: string) => รายการ(page).getByRole("button", { name: ของ(k).บริษัท });
const กล่องยืนยัน = (page: Page) => page.locator(".pms-confirm[role='alertdialog']");

test("[ui·hq] ตัวเลขบนปุ่มกลุ่มตรงกับฐาน (hq_quote_board) และตรงค่าที่รู้ล่วงหน้า · คำค้นกรองทั้งจำนวนและรายการ", async ({ page }) => {
  await เข้าหน้า(page);
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  const hq = await db(ADMIN);
  const { data, error } = await hq.rpc("hq_quote_board", { p_group: "todo", p_q: แท็ก });
  expect(error).toBeNull();
  const ฐาน = (data as { counts: Record<string, number> }).counts;
  expect(ฐาน, "ชุดข้อมูลที่รู้ค่าล่วงหน้า").toEqual({ todo: 2, overdue: 1, quoted: 1, won: 1, closed: 1 });
  for (const [label, key] of [["ต้องตีราคา", "todo"], ["ส่งแล้ว รอดีลเลอร์", "quoted"], ["สั่งผลิต", "won"], ["ปิด/ยกเลิก", "closed"]] as const)
    await expect(page.getByRole("tab", { name: `${label} ·` }), `ปุ่ม ${label} ต้องเท่ากับฐาน`).toHaveText(`${label} · ${ฐาน[key]}`, { timeout: 20_000 });
  await expect(page.getByText(`เกินกำหนด 14 วัน ${ฐาน.overdue} คำขอ`)).toBeVisible();
  // ลำดับ + ป้ายจากฐาน: เกินกำหนดบนสุด
  await expect(รายการ(page).getByRole("button")).toHaveCount(2);
  await expect(รายการ(page).getByRole("button").first()).toContainText(ของ("A").บริษัท);
  await expect(แถวของ(page, "A")).toContainText("เกิน 14 วัน");
  await expect(แถวของ(page, "B")).toContainText("ใหม่");
  await page.getByRole("tab", { name: "ปิด/ยกเลิก ·" }).click();
  await expect(แถวของ(page, "E")).toContainText("ยกเลิก");
});

test("[ui·hq] เข้าหน้าแล้วเปิดคำขอบนสุดให้ทันที แค่เปิดดู (ไม่มีคำสั่งเขียน) · กดแถวแล้วใบฝั่งขวาเปลี่ยนตาม", async ({ page }) => {
  const เขียน: string[] = [];
  page.on("request", r => { if (r.method() !== "GET" && /\/api\/v1\/quote-requests|\/rest\/v1\/(quote_requests|hq_quotes)|\/rest\/v1\/rpc\/(hq_quote|quote_request)/.test(r.url())) เขียน.push(`${r.method()} ${r.url()}`); });
  await เข้าหน้า(page);
  const บนสุด = รายการ(page).getByRole("button").first();
  await expect(บนสุด, "เปิดแถวบนสุดให้เอง").toHaveAttribute("aria-current", "true", { timeout: 20_000 });
  const ใบ = page.getByRole("region", { name: "ใบ HQ" });
  await expect(ใบ).toBeVisible();
  await expect(ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).or(ใบ.getByText(/ใบนี้แก้ไม่ได้/)), "ใบโหลดเสร็จ").toBeVisible({ timeout: 20_000 });
  expect(เขียน, "เปิดดูอย่างเดียว ต้องไม่มีคำสั่งเขียน/เปลี่ยนสถานะออกไปเลย").toEqual([]);

  // กดแถวไหน ใบฝั่งขวาเป็นของแถวนั้น
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  for (const k of ["B", "A"]) {
    await แถวของ(page, k).click();
    await expect(แถวของ(page, k)).toHaveAttribute("aria-current", "true");
    await expect(ใบ.getByRole("heading"), `ใบฝั่งขวาต้องเป็นของคำขอ ${k}`).toContainText(ของ(k).no);
  }
  expect(เขียน, "กดเปิดแถวต้องไม่มีคำสั่งเขียน").toEqual([]);
  expect((await admin.from("quote_requests").select("status").eq("id", ของ("B").id).single()).data?.status, "B ยังเป็นคำขอใหม่").toBe("new");
});

test("[ui·hq] ใบมีการแก้ค้าง → กดแถวอื่น/ปุ่มกลุ่มต้องถามก่อนทิ้ง · ยกเลิก = อยู่ใบเดิม ข้อมูลยังอยู่ · ทิ้ง = เปลี่ยนได้", async ({ page }) => {
  await เข้าหน้า(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, ของ("B").บริษัท);
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  await expect(แถวของ(page, "A")).toBeVisible();
  await ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await ใบ.getByLabel("ชื่อรายการ 1").fill("รายการที่ยังไม่บันทึก");

  for (const กด of [() => แถวของ(page, "A").click(), () => page.getByRole("tab", { name: "ส่งแล้ว รอดีลเลอร์ ·" }).click()]) {
    await กด();
    await expect(กล่องยืนยัน(page), "ต้องถามก่อนทิ้ง").toContainText("มีการแก้ที่ยังไม่บันทึก จะทิ้งหรือไม่", { timeout: 10_000 });
    await กล่องยืนยัน(page).locator(".pms-confirm-actions button").first().click();   // ยกเลิก
    await expect(กล่องยืนยัน(page)).toBeHidden();
    await expect(แถวของ(page, "B"), "ยกเลิกแล้วต้องอยู่ใบเดิม").toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("tab", { name: "ต้องตีราคา ·" })).toHaveAttribute("aria-selected", "true");
    await expect(ใบ.getByLabel("ชื่อรายการ 1"), "ข้อมูลที่พิมพ์ต้องยังอยู่ครบ").toHaveValue("รายการที่ยังไม่บันทึก");
  }
  // ทิ้ง → เปลี่ยนไปแถวที่กด · ไม่มีอะไรถูกบันทึก
  await แถวของ(page, "A").click();
  await expect(กล่องยืนยัน(page)).toBeVisible();
  await กล่องยืนยัน(page).locator(".pms-confirm-actions button").last().click();   // ทิ้งการแก้
  await expect(แถวของ(page, "A")).toHaveAttribute("aria-current", "true");
  await expect(ใบ.getByRole("heading")).toContainText(ของ("A").no);
  expect((await admin.from("hq_quotes").select("id").eq("request_id", ของ("B").id)).data ?? [], "ทิ้งแล้วต้องไม่มีใบ HQ ถูกบันทึก").toEqual([]);
  // ไม่ได้แก้อะไร = เปลี่ยนแถวได้เลยไม่ถาม
  await แถวของ(page, "B").click();
  await expect(แถวของ(page, "B")).toHaveAttribute("aria-current", "true");
  await expect(กล่องยืนยัน(page)).toHaveCount(0);
});

test("[ui·hq] ระหว่างบันทึกร่าง แถวอื่นและปุ่มกลุ่มกดไม่ได้จนกว่าจะเสร็จ · เสร็จแล้วกดได้ตามปกติ", async ({ page }) => {
  await เข้าหน้า(page);
  const { ใบ } = await เปิดใบHQในกล่องงาน(page, ของ("B").บริษัท);
  await page.getByLabel("ค้นหาคำขอ").fill(แท็ก);
  await expect(แถวของ(page, "A")).toBeVisible();
  await ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  await ใบ.getByLabel("ชื่อรายการ 1").fill("โครงสร้างเหล็ก");
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
  await expect(แถวของ(page, "A"), "ระหว่างบันทึก ห้ามเปลี่ยนแถว").toBeDisabled();
  await expect(page.getByRole("tab", { name: "ส่งแล้ว รอดีลเลอร์ ·" }), "ระหว่างบันทึก ห้ามเปลี่ยนกลุ่ม").toBeDisabled();
  await expect(แถวของ(page, "B")).toHaveAttribute("aria-current", "true");

  ปล่อย();
  await expect.poll(async () => (await admin.from("quote_requests").select("status").eq("id", ของ("B").id).single()).data?.status,
    { timeout: 20_000, message: "บันทึกร่าง = รับเรื่อง" }).toBe("pricing");
  await expect(แถวของ(page, "A"), "บันทึกเสร็จแล้วกดแถวอื่นได้").toBeEnabled({ timeout: 15_000 });
  await แถวของ(page, "A").click();
  await expect(กล่องยืนยัน(page), "บันทึกแล้วไม่มีการแก้ค้าง ต้องไม่ถาม").toHaveCount(0);
  await expect(แถวของ(page, "A")).toHaveAttribute("aria-current", "true");
});
