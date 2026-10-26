import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── หน้าคำขอใบเสนอราคาของ HQ ให้ใช้ง่าย (บอสสั่ง 26 ต.ค. 69) ──────────────────────────────────────────────────────
//   ข้อที่ต้องตกบนโค้ดก่อนแก้: วาง 3 แถวจาก Excel ได้ 3 รายการ · ยืนราคาแสดง พ.ศ. · สลับคำขอแล้วร่างไม่หาย (hq-quote-board.spec.ts)
//   ส่งใบเปล่าไม่ได้ทั้งหน้าเว็บและฐาน — ข้อนี้ผ่านบนโค้ดเดิมด้วย (ปุ่มเดิมปิดเมื่อไม่มีรายการ · ฐานมี quote_empty ใน hq_quote_send อยู่แล้ว)
//   และ: การ์ด 4 ใบตรงฐาน · แถวขึ้นเหลือ/เกินกี่วัน · หน้าเดียวไม่มีแถบเปลี่ยนหน้า · ปุ่มกรองแถวเดียว · หัวใบกล่องเดียว + สเปกย่อ
//   · Enter แถวสุดท้ายเพิ่มแถว · หน่วยมีรายการให้เลือก · เฉลี่ยบาท/ตร.ม. · ป้าย "ราคาส่งดีลเลอร์ (ก่อน VAT)"
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const แท็ก = Date.now() % 100_000;
const เลข = { ก: เลขลูกค้าเป้าหมายทดสอบ(), ข: เลขลูกค้าเป้าหมายทดสอบ() };
const บริษัท = (k: keyof typeof เลข) => `ZZTEST-คำขอใช้ง่าย-${k}-${แท็ก}`;
const สเปกยาว = "โครงสร้างเหล็กรูปพรรณ หลังคาเมทัลชีทหนา 0.47 มม. พร้อมฉนวนกันความร้อน · ผนังสูง 8 ม. · ประตูม้วน 4 บาน ขนาด 5x5 ม. · "
  + "ช่องแสงหลังคา 10% · รางน้ำสแตนเลส · พื้นคอนกรีตรับน้ำหนัก 3 ตัน/ตร.ม. · มีเครนเหนือศีรษะ 5 ตัน 1 ชุด · ZZ-ท้ายสเปก";
const คำขอ: Record<string, number> = {};
const เดือน = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const วันไทย = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${เดือน[m - 1]} ${y + 543}`; };
const บาท = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

test.beforeAll(async () => {
  const sb = await db(RYG);
  for (const k of ["ก", "ข"] as const) {
    const l = await sb.from("leads").insert({ id: `#L-${เลข[k]}`, num_id: เลข[k], dealer_code: "RYG", company: บริษัท(k), name: บริษัท(k),
      contact: "ผู้ทดสอบ", phone: `08${String(เลข[k]).slice(-8)}`, province: "ระยอง", status: "BULLET" });
    expect(l.error, `สร้างลีด ${k}`).toBeNull();
    const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลข[k], p_product: "โกดังเก็บสินค้า 20x40 ม.", p_area: k === "ก" ? 800 : null, p_spec: สเปกยาว, p_province: "ระยอง" });
    expect(r.error, `ส่งคำขอ ${k}`).toBeNull();
    คำขอ[k] = Number((r.data as { id: number }).id);
  }
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", Object.values(เลข)); });

async function เข้าใบ(page: Page, k: keyof typeof เลข) {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  return (await เปิดใบHQในกล่องงาน(page, บริษัท(k))).ใบ;
}

test("[ui·hq] ส่งใบเปล่าไม่ได้ — ปุ่มปิดพร้อมเหตุผล · ฐานปฏิเสธใบไม่มีรายการ/ยอด 0", async ({ page }) => {
  const ใบ = await เข้าใบ(page, "ข");
  await expect(ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" })).toBeVisible({ timeout: 20_000 });
  await expect(ใบ.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" }), "ไม่มีรายการ = ส่งไม่ได้").toBeDisabled();
  await expect(ใบ.getByText(/ยังไม่มีรายการ/).first(), "บอกเหตุผลข้างปุ่ม").toBeVisible();

  // ฐาน: ข้ามหน้าเว็บไปสั่งตรง ๆ ก็ส่งใบเปล่า/ยอด 0 ไม่ได้
  const hq = await db(ADMIN);
  const ยืน = new Date(Date.now() + 7 * 3_600_000 + 10 * 86_400_000).toISOString().slice(0, 10);
  for (const [ชื่อ, lines] of [["ไม่มีรายการ", []], ["ยอด 0", [{ name: "ค่าขนส่ง", qty: 1, unit: "งาน", unitCost: 0 }]]] as const) {
    expect((await hq.rpc("hq_quote_save", { p_request_id: คำขอ.ข, p_lines: lines, p_valid_until: ยืน, p_note: "" })).error?.message ?? "", `บันทึกร่าง${ชื่อ}ได้`).toBe("");
    const ส่ง = await hq.rpc("hq_quote_send", { p_request_id: คำขอ.ข });
    expect(ส่ง.error?.message ?? "", `ส่งใบ${ชื่อ}ต้องถูกฐานปฏิเสธ`).toMatch(/quote_empty/);
  }
  // แบบใหม่ (26 ต.ค. 69): เปิดมามีแถวว่างพร้อมพิมพ์ · แถวว่างไม่นับเป็นรายการ · ยอด 0 ส่งไม่ได้พร้อมเหตุผล
  await page.reload({ waitUntil: "domcontentloaded" });
  const ใบใหม่ = (await เปิดใบHQในกล่องงาน(page, บริษัท("ข"))).ใบ;
  await ใบใหม่.getByLabel(/^ชื่อรายการ \d+$/).first().waitFor({ timeout: 20_000 });
  await expect(ใบใหม่.getByTestId("send-blocked-reason"), "ใบที่บันทึกยอด 0 ไว้ = ส่งไม่ได้").toContainText("ยอดรวมต้องมากกว่า 0");
  await expect(ใบใหม่.getByRole("button", { name: "ส่งใบ HQ ให้ดีลเลอร์" })).toBeDisabled();
  await ใบใหม่.getByRole("button", { name: "ลบรายการ 1" }).click();
  await expect(ใบใหม่.getByLabel("ชื่อรายการ 1"), "ลบแถวสุดท้ายแล้วยังมีแถวว่างพร้อมพิมพ์").toHaveValue("");
  await expect(ใบใหม่.getByTestId("send-blocked-reason")).toContainText("ยังไม่มีรายการ");
  await expect(ใบใหม่.getByRole("button", { name: "บันทึกร่าง" }), "แถวว่างอย่างเดียว = บันทึกร่างไม่ได้").toBeDisabled();
});

test("[ui·hq] วางจาก Excel 3 แถว = 3 รายการ · แถวที่อ่านไม่ได้เตือนที่แถว · Enter เพิ่มแถว · หน่วยมีรายการ · เฉลี่ยบาท/ตร.ม.", async ({ page }) => {
  const errs = watchErrors(page);
  const ใบ = await เข้าใบ(page, "ก");
  // ใบโหลดเสร็จ · ไม่มีแถวว่างให้พิมพ์ (โค้ดก่อน 26 ต.ค. 69) = กดเพิ่มก่อน — ข้อนี้ตรวจการวาง ไม่ใช่เรื่องแถวว่าง
  await expect(ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" })).toBeVisible({ timeout: 20_000 });
  if (await ใบ.getByLabel("ชื่อรายการ 1").count() === 0) await ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }).click();
  const T = String.fromCharCode(9), N = String.fromCharCode(13, 10);
  const ข้อความ = ["โครงสร้างเหล็ก" + T + "800" + T + "ตร.ม." + T + "1,250", "หลังคาเมทัลชีท" + T + "820" + T + "ตร.ม." + T + "450.50", "ค่าขนส่ง" + T + "1" + T + "งาน" + T + "15000"].join(N) + N;
  const วาง = (label: string, text: string) => ใบ.getByLabel(label).evaluate((el, t) => {
    const dt = new DataTransfer(); dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
  await วาง("ชื่อรายการ 1", ข้อความ);
  await expect(ใบ.getByLabel(/^ชื่อรายการ \d+$/), "วาง 3 แถว = 3 รายการ (แทนแถวว่าง)").toHaveCount(3);
  await expect(ใบ.getByLabel("ชื่อรายการ 2")).toHaveValue("หลังคาเมทัลชีท");
  await expect(ใบ.getByLabel("ต้นทุนต่อหน่วย 1")).toHaveValue("1250");
  await expect(ใบ.getByLabel("หน่วย 3", { exact: true })).toHaveValue("งาน");
  const รวม = 800 * 1250 + 820 * 450.5 + 15000;
  await expect(ใบ.getByTestId("hq-quote-total")).toHaveText(บาท(รวม));
  await expect(ใบ.getByText("ราคาส่งดีลเลอร์ (ก่อน VAT)"), "ป้ายยอดรวมตรงกับที่ฐานคิด").toBeVisible();
  await expect(ใบ.getByTestId("hq-quote-per-sqm"), "คำขอมีพื้นที่ 800 ตร.ม. = เฉลี่ยต่อ ตร.ม.").toHaveText(`เฉลี่ย ${บาท(Math.round(รวม / 800 * 100) / 100)} บาท/ตร.ม.`);

  // แถวที่อ่านไม่ได้: ยังอยู่ + เตือนที่แถว · ส่งไม่ได้จนกว่าจะแก้
  await วาง("ชื่อรายการ 3", ["ประตูม้วน" + T + "สี่" + T + "บาน" + T + "12000", "เสาเหล็ก" + T + "12" + T + "ชุด" + T + "8000"].join(N));
  await expect(ใบ.getByLabel(/^ชื่อรายการ \d+$/), "แถวที่มีของอยู่แล้ว = แทรกต่อ ไม่ทับ").toHaveCount(5);
  await expect(ใบ.getByTestId("row-warning-4"), "แถวที่อ่านจำนวนไม่ได้ต้องเตือน").toContainText("อ่านจำนวนไม่ได้");
  await expect(ใบ.getByTestId("send-blocked-reason")).toContainText("อ่านไม่ได้");
  await ใบ.getByLabel("จำนวน 4").fill("4");
  await expect(ใบ.getByTestId("row-warning-4"), "แก้แถวแล้วคำเตือนหาย").toHaveCount(0);

  // Enter ที่แถวสุดท้าย = แถวใหม่ (โฟกัสช่องชื่อแถวใหม่)
  await ใบ.getByLabel("ต้นทุนต่อหน่วย 5").press("Enter");
  await expect(ใบ.getByLabel(/^ชื่อรายการ \d+$/)).toHaveCount(6);
  await expect(ใบ.getByLabel("ชื่อรายการ 6"), "Enter แล้วพิมพ์ต่อแถวใหม่ได้ทันที").toBeFocused();
  // หน่วยเลือกจากรายการได้ และพิมพ์เองได้
  const ตัวเลือก = await page.locator("datalist#boq-units option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value));
  expect(ตัวเลือก, "รายการหน่วย").toEqual(["ตร.ม.", "ตัน", "เมตร", "ชุด", "งาน"]);
  await expect(ใบ.getByLabel("หน่วย 6", { exact: true })).toHaveAttribute("list", "boq-units");
  await ใบ.getByLabel("หน่วย 6", { exact: true }).fill("เที่ยว");
  await expect(ใบ.getByLabel("หน่วย 6", { exact: true })).toHaveValue("เที่ยว");
  assertNoErrors(errs, "ตาราง BOQ วางจาก Excel");
});

test("[ui·hq] ยืนราคาถึงแสดงปี พ.ศ. · หัวใบเป็นกล่องเดียว + เหลือกี่วัน · สเปกยาวย่อแล้วกดดูทั้งหมด", async ({ page }) => {
  const ใบ = await เข้าใบ(page, "ก");
  const ตั้งต้น = new Date(Date.now() + 7 * 3_600_000 + 30 * 86_400_000).toISOString().slice(0, 10);
  await expect(ใบ.locator("[data-thai-date]"), "วันยืนราคาตั้งต้นแสดงเป็น พ.ศ.").toHaveText(วันไทย(ตั้งต้น));
  await ใบ.getByLabel("ยืนราคาถึง").fill("2026-12-31");
  await expect(ใบ.locator("[data-thai-date]"), "เปลี่ยนวันแล้วยังเป็น พ.ศ.").toHaveText("31 ธ.ค. 2569");

  const กล่อง = ใบ.locator("[data-box='request-info']");
  await expect(กล่อง.locator("[data-info='job']")).toContainText("โกดังเก็บสินค้า 20x40 ม.");
  await expect(กล่อง.locator("[data-info='area']")).toContainText("800 ตร.ม.");
  await expect(กล่อง.locator("[data-info='province']")).toContainText("ระยอง");
  await expect(กล่อง.locator("[data-info='dealer']")).toContainText("RYG");
  await expect(กล่อง.getByTestId("due-countdown"), "กำหนดส่งบอกเหลือกี่วัน").toHaveText(/\((เหลือ 1[34] วัน)\)/);
  await expect(กล่อง.getByRole("button", { name: "ดูทั้งหมด" }), "สเปกยาวต้องย่อไว้").toHaveAttribute("aria-expanded", "false");
  await กล่อง.getByRole("button", { name: "ดูทั้งหมด" }).click();
  await expect(กล่อง.getByTestId("request-spec")).toContainText("ZZ-ท้ายสเปก");
  await expect(กล่อง.getByRole("button", { name: "ย่อ" })).toHaveAttribute("aria-expanded", "true");
});

test("[ui·hq] การ์ด 4 ใบตรงฐาน · แถวขึ้นเหลือ/เกินกี่วัน · หน้าเดียวไม่มีแถบเปลี่ยนหน้า · ปุ่มกรองแถวเดียว", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const แถวการ์ด = page.locator("[data-kpi-row]");
  await expect(แถวการ์ด.locator("[data-kpi]"), "แถวการ์ด 4 ใบพอดี").toHaveCount(4);
  // ตัวเลขทุกใบเทียบกับฐาน ณ จังหวะเดียวกัน (ข้อทดสอบอื่นที่รันพร้อมกันอาจเพิ่มคำขอ) — ไม่ตรง = โหลดหน้าใหม่แล้วเทียบอีกรอบ
  const hq = await db(ADMIN);
  await expect.poll(async () => {
    const [b, o] = await Promise.all([hq.rpc("hq_quote_board", { p_group: "todo", p_q: "" }), hq.rpc("hq_overview")]);
    const c = (b.data as { counts: Record<string, number> }).counts;
    const r = (o.data as { requests: { avgResponseDays: number | null; cancel: { pct: number | null } } }).requests;
    const ฐาน = [c.todo, c.overdue, r.avgResponseDays ?? "", r.cancel.pct ?? ""].map(String);
    const จอ = await Promise.all(["kpi-todo", "kpi-overdue", "request-avg-days", "request-cancel-pct"].map(id => page.getByTestId(id).getAttribute("data-value")));
    if (JSON.stringify(จอ) === JSON.stringify(ฐาน)) return "ตรง";
    await page.reload({ waitUntil: "domcontentloaded" }); await settle(page);
    return `จอ ${จอ.join("/")} · ฐาน ${ฐาน.join("/")}`;
  }, { timeout: 30_000, message: "การ์ด 4 ใบ = ฐาน (hq_quote_board · hq_overview)" }).toBe("ตรง");

  // ปุ่มกรองแถวเดียว (ทุกปุ่มอยู่บรรทัดเดียวกัน · จอแคบเลื่อนแนวนอน)
  for (const w of [1440, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    const บน = await page.getByRole("tab").evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(บน).size, `จอ ${w}px: ปุ่มกรองต้องอยู่แถวเดียว`).toBe(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // ค้นหาเจอคำขอเดียว = หน้าเดียว ไม่มีแถบเปลี่ยนหน้า · แถวขึ้นเหลือกี่วันแทนวันที่
  await page.getByLabel("ค้นหาคำขอ").fill(บริษัท("ก"));
  const แถว = page.getByRole("list", { name: "รายการคำขอ" }).getByRole("button", { name: บริษัท("ก") });
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await expect(แถว.getByTestId("row-countdown"), "แถวบอกเหลือกี่วัน").toHaveText(/^กำหนดส่ง เหลือ 1[34] วัน$/);
  await expect(page.getByText(/หน้า \d+ \/ \d+/), "หน้าเดียวไม่มีแถบเปลี่ยนหน้า").toHaveCount(0);
});
