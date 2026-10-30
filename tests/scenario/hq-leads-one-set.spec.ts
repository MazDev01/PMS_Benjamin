import { test, expect, type Page, type Locator } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── หน้า HQ ลูกค้าเป้าหมายทั้งเครือ (/hq/leads) นับชุดเดียวกันทั้งหน้า (บอสสั่ง/ตัดสิน 30 ต.ค. 69 · ใบ 0265) ──────────────────────────
// บั๊กเดิม: การ์ดไม่นับลีดของ HQ ที่ยังไม่โอน แต่กราฟ/ตารางนับ → "ลีดใหม่" 259 vs วงกลมแหล่งที่มา 262 · "เปิดอยู่" 141 vs กราฟขั้น 1–5 รวม 144
// กติกาเดียว (บอสเลือก): ลีดของ HQ ที่ยังไม่โอน อยู่ในกล่องโอนที่เดียว · การ์ด "เปิดอยู่"/"ไม่เคลื่อนไหว" = ณ ตอนนี้ (คำตัดสิน 22 ต.ค. 69)
//   → กราฟขั้น 1–5 = การ์ดเปิดอยู่ (ไม่ผูกช่วง) · วงกลมแหล่งที่มา = การ์ดลีดใหม่ (ตามช่วง) · กดการ์ด → ตารางเหลือจำนวนเท่าการ์ด
// ข้อมูลของข้อ (ป้ายค้นของรอบนี้ · ค้นแล้วทุกตัวเลขบนจอเป็นของข้ออย่างเดียว): สาขาของข้อ (สตูล) + ลีดของ HQ ป้ายเดียวกัน
//   ก WAITING · ข HQ_QUOTED · ค QUOTED = เข้ามาวันนี้ ยังเปิด · ง WAITING เข้ามาปีก่อน (นอกช่วง "ปีนี้") เงียบ 40 วัน
//   จ PAID · ฉ CANCELLED = เข้ามาวันนี้ · HQ1 (สตูล · 2 สาขาดูแล = HQ เลือกเอง ไม่โอนอัตโนมัติ) · HQ2 (ไม่มีจังหวัด = คิวรอ · เงียบ 40 วัน)
//   ⇒ เปิดอยู่ 4 · ลีดใหม่ 5 · ไม่เคลื่อนไหว 1 (ลีด HQ ไม่นับทั้งหมด) · ช่องทาง Facebook: เปิดอยู่ 2 · ลีดใหม่ 4 · ไม่เคลื่อนไหว 0
// ตกบนโค้ดก่อนใบ 0265: กราฟ/ตารางนับลีด HQ รวม (ขั้น 1–5 = 6 · แหล่งที่มา = 7) · กราฟขั้นผูกช่วงเวลา (ไม่นับ ง)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(150_000);

const admin = adminClient();
const ป้าย = `ZZ1SETW${String(Date.now() % 100_000).padStart(5, "0")}`;
const เลข = 1_700_000_000 + Math.floor(Math.random() * 400_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนช่วงเลขตายตัวของไฟล์อื่น)
const จังหวัด = "สตูล";
let ก: สาขาของข้อ | null = null, ข: สาขาของข้อ | null = null;

const วันไทย = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
const วันนี้ = วันไทย(Date.now());
const ก่อน40วัน = วันไทย(Date.now() - 40 * 86_400_000);
const ปีก่อน = `${Number(วันนี้.slice(0, 4)) - 1}-12-01`;

test.beforeAll(async () => {
  ก = await สร้างสาขาของข้อ({ จังหวัด, ภาค: "ใต้", ชื่อ: "ZZTEST ดีลเลอร์ลีดสตูล" });   // ยาวเท่าชื่อดีลเลอร์จริง (~20 ตัวอักษร) · ชื่อยาวกว่านี้ตัดด้วย … และชี้แล้วเห็นเต็ม (ตรวจด้านล่าง)
  ข = await สร้างสาขาของข้อ({ จังหวัด, ภาค: "ใต้" });   // สาขาของข้อได้พื้นที่ดูแล = จังหวัดของตัวเอง (ฐานสร้างให้) → สตูล 2 สาขาดูแล
  // แถว "HQ" ใช้ร่วมกับไฟล์อื่นที่รันขนานกัน — สร้างแบบไม่ชน (มีแล้วข้าม) และไม่ลบตอนจบ (แบบเดียวกับ hq-lead-transfer.spec.ts)
  const สาขาHQ = await admin.from("dealers").upsert({ code: "HQ", name: "สำนักงานใหญ่ (ทดสอบ)", province: "กรุงเทพมหานคร", region: "กลาง", status: "active" },
    { onConflict: "code", ignoreDuplicates: true });
  if (สาขาHQ.error) throw new Error(สาขาHQ.error.message);
  const ลีด: [string, string, string, string, string, string, string][] = [
    // [สาขา, ชื่อ, สถานะ, วันเข้ามา, ติดต่อล่าสุด, ช่องทาง, จังหวัด]
    [ก.รหัส, "ก", "WAITING", วันนี้, วันนี้, "Facebook", จังหวัด],
    [ก.รหัส, "ข", "HQ_QUOTED", วันนี้, วันนี้, "Facebook", จังหวัด],
    [ก.รหัส, "ค", "QUOTED", วันนี้, วันนี้, "เว็บไซต์", จังหวัด],
    [ก.รหัส, "ง เก่า", "WAITING", ปีก่อน, ก่อน40วัน, "เว็บไซต์", จังหวัด],
    [ก.รหัส, "จ", "PAID", วันนี้, วันนี้, "Facebook", จังหวัด],
    [ก.รหัส, "ฉ", "CANCELLED", วันนี้, วันนี้, "Facebook", จังหวัด],
    ["HQ", "HQ1", "WAITING", วันนี้, วันนี้, "Facebook", จังหวัด],
    ["HQ", "HQ2", "WAITING", วันนี้, ก่อน40วัน, "เว็บไซต์", ""],
  ];
  // วางที่ฐานตรง (ปิดตัวดัก — ตัวดักคำนวณวันติดต่อล่าสุดใหม่จากบันทึกการติดต่อ) · ข้อนี้วัดการนับ ไม่ใช่ทางสร้างลีด
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.leads (id, num_id, dealer_code, company, name, phone, province, source, status, lost_reason, created_date, last_contact_at) values
      ${ลีด.map(([c, ชื่อ, st, วัน, ติดต่อ, src, จ], i) => `('#L-${เลข + i}', ${เลข + i}, '${c}', '${ป้าย} บจก.ทดสอบ ${ชื่อ}', 'ZZTEST ผู้ติดต่อ', '000-000-${String(i).padStart(4, "0")}', '${จ}', '${src}', '${st}', ${st === "CANCELLED" ? "'ราคาสูงไป'" : "null"}, '${วัน}', '${ติดต่อ}')`).join(",\n      ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางลีดของข้อไม่ได้");
});
test.afterAll(async () => {
  รันSQLในฐาน(`set local session_replication_role = replica;
    delete from public.leads where company like '${ป้าย}%';
    set local session_replication_role = origin;`);
  await ก?.ลบ(); await ข?.ลบ();
});

// ── อ่านตัวเลขบนจอ (รอจนทุกส่วนโหลดจากฐานแล้ว) ──
type ตัวเลข = { เปิด: string; ใหม่: string; เงียบ: string; ขั้น15: number; แหล่ง: string; ตาราง: string };
async function อ่าน(page: Page): Promise<ตัวเลข> {
  const การ์ด = (k: string) => page.locator(`[data-kpi-row] [data-kpi="${k}"] [data-value]`).first().getAttribute("data-value");
  const ขั้น = page.locator("[data-stage-chart][data-ready='1']");
  const แหล่ง = page.locator("[data-source-chart][data-ready='1']");
  const ตาราง = page.locator("[data-lead-table][data-ready='1']");
  await expect(ขั้น).toBeVisible({ timeout: 25_000 }); await expect(แหล่ง).toBeVisible(); await expect(ตาราง).toBeVisible();
  const ขั้น15 = (await ขั้น.locator("[data-stage]").evaluateAll(rs => rs.map(r => [Number(r.getAttribute("data-stage")), Number(r.getAttribute("data-count"))])))
    .filter(([n]) => n >= 1 && n <= 5).reduce((t, [, c]) => t + c, 0);
  return { เปิด: (await การ์ด("open")) ?? "", ใหม่: (await การ์ด("new")) ?? "", เงียบ: (await การ์ด("idle")) ?? "", ขั้น15,
    แหล่ง: (await แหล่ง.getAttribute("data-total")) ?? "", ตาราง: (await ตาราง.getAttribute("data-total")) ?? "" };
}
/** รอจนจอนิ่งที่ค่าที่รู้ (ตัวกรองเปลี่ยน → การ์ด/กราฟ/ตารางโหลดใหม่คนละจังหวะ) แล้วตรวจทุกตัวพร้อมกัน */
async function ตรงค่า(page: Page, ชื่อ: string, ควร: { เปิด: number; ใหม่: number; เงียบ: number; ตาราง: number }) {
  const ต้องได้: ตัวเลข = { เปิด: String(ควร.เปิด), ใหม่: String(ควร.ใหม่), เงียบ: String(ควร.เงียบ), ขั้น15: ควร.เปิด, แหล่ง: String(ควร.ใหม่), ตาราง: String(ควร.ตาราง) };
  let ล่าสุด: ตัวเลข | null = null;
  await expect.poll(async () => (ล่าสุด = await อ่าน(page)), { timeout: 30_000, message: `${ชื่อ}: การ์ด = กราฟขั้น 1–5 = วงกลมแหล่งที่มา = ตาราง` }).toEqual(ต้องได้);
  return ล่าสุด;
}
const เลือก = (page: Page, ป้ายช่อง: string) => page.getByLabel(ป้ายช่อง, { exact: true }).first();
async function เปิดหน้าแล้วค้น(page: Page) {
  await page.goto(`${HQ_ORIGIN}/hq/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหาบริษัท/).fill(ป้าย);
}

test("[H6·hq] ลีดทั้งเครือ: ทุกตัวกรอง ผลรวมกราฟขั้นตอน = การ์ดเปิดอยู่ · วงกลมแหล่งที่มา = การ์ดลีดใหม่ · ไม่นับลีด HQ ที่ยังไม่โอน", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
  await เปิดหน้าแล้วค้น(page);
  // ค่าตั้งต้น: กำลังดำเนินการ (ขั้น 1–5 · ณ ตอนนี้) → ตาราง = การ์ดเปิดอยู่
  await ตรงค่า(page, "คำค้น", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 4 });
  // ตารางไม่มีลีดของ HQ (อยู่กล่องโอนที่เดียว)
  await expect(page.locator("[data-lead-table] tbody").getByText(`${ป้าย} บจก.ทดสอบ HQ`)).toHaveCount(0);
  const ป้ายดีลเลอร์ = await page.locator("[data-lead-table] tbody td[data-cell='dealer'] .badge").allInnerTexts();
  expect(ป้ายดีลเลอร์.length, "มีแถวในตาราง").toBeGreaterThan(0);
  expect(ป้ายดีลเลอร์.every(c => c.trim() === ก!.รหัส), `ทุกแถวเป็นของสาขาของข้อ (ได้ ${ป้ายดีลเลอร์.join(" · ")})`).toBe(true);

  // + ดีลเลอร์ (สาขาของข้อ) · + ภูมิภาค (ป้ายกลาง "ภาคใต้") · + จังหวัด — ชุดเดิมทั้งหมด
  await เลือก(page, "ทุกดีลเลอร์").selectOption(ก!.รหัส);
  await ตรงค่า(page, "คำค้น + ดีลเลอร์", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 4 });
  await เลือก(page, "ทุกดีลเลอร์").selectOption("ALL");
  await เลือก(page, "ทุกภูมิภาค").selectOption({ label: "ภาคใต้" });
  await ตรงค่า(page, "คำค้น + ภาคใต้", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 4 });
  await เลือก(page, "ทุกภูมิภาค").selectOption("ALL");
  await เลือก(page, "ทุกจังหวัด").selectOption(จังหวัด);
  await ตรงค่า(page, "คำค้น + จังหวัด", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 4 });
  await เลือก(page, "ทุกจังหวัด").selectOption("ALL");
  // + ช่องทาง Facebook: เปิดอยู่ ก ข · ลีดใหม่ ก ข จ ฉ · ไม่มีรายเงียบ
  await เลือก(page, "ทุกแหล่งที่มา").selectOption("Facebook");
  await ตรงค่า(page, "คำค้น + Facebook", { เปิด: 2, ใหม่: 4, เงียบ: 0, ตาราง: 2 });
  await เลือก(page, "ทุกแหล่งที่มา").selectOption("ALL");
  // ตัวกรองขั้น (ปิดสำเร็จ) คุมตารางอย่างเดียว — การ์ดกับกราฟไม่ขยับ (เหมือนการ์ด)
  await เลือก(page, "ขั้นตอน").selectOption("6");
  await ตรงค่า(page, "คำค้น + ขั้นปิดสำเร็จ", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 1 });
  assertNoErrors(errs, "หน้าลีดทั้งเครือ นับชุดเดียว");
});

test("[H6·hq] ลีดทั้งเครือ: กดการ์ดแล้วตารางกรองตามการ์ด · ไม่เคลื่อนไหวเกิน 30 วัน นับถูก · ลีดของ HQ รอโอน → กล่องโอน", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
  await เปิดหน้าแล้วค้น(page);
  await ตรงค่า(page, "ค่าตั้งต้น", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 4 });
  const ช่องขั้น = เลือก(page, "ขั้นตอน");
  const ตาราง = page.locator("[data-lead-table]");

  await page.locator('[data-kpi="new"]').first().click();
  await expect(ช่องขั้น, "การ์ดลีดใหม่ → ตารางทั้งหมดในช่วง").toHaveValue("ALL");
  await ตรงค่า(page, "กดการ์ดลีดใหม่", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 5 });

  await page.locator('[data-kpi="idle"]').first().click();
  await ตรงค่า(page, "กดการ์ดไม่เคลื่อนไหว", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 1 });
  // รายที่เหลือ = ง (เงียบ 40 วัน · เข้ามาปีก่อน) — ลีด HQ ที่เงียบ 40 วันไม่นับ
  await expect(ตาราง.locator("tbody td[data-cell='company']")).toHaveCount(1);
  await expect(ตาราง.locator("tbody td[data-cell='company']").first()).toContainText(`${ป้าย} บจก.ทดสอบ ง เก่า`);
  // ฐานนับด้วยกติกาเดียวกัน: ยังเปิด · ไม่ใช่รอราคา HQ · ติดต่อล่าสุดห่างวันนี้เกิน 30 วัน · ไม่ใช่แถว HQ
  const { data } = await admin.from("leads").select("dealer_code, status, last_contact_at").like("company", `${ป้าย}%`);
  const เงียบ = (data ?? []).filter(l => l.dealer_code !== "HQ" && !["PAID", "CANCELLED", "HQ_PRICING"].includes(l.status)
    && l.last_contact_at && (Date.parse(วันนี้) - Date.parse(l.last_contact_at)) / 86_400_000 > 30).length;
  expect(เงียบ, "ฐาน: ไม่เคลื่อนไหวเกิน 30 วัน ของข้อ = 1").toBe(1);

  await page.locator('[data-kpi="idle"]').first().click();   // ล้าง
  await page.locator('[data-kpi="open"]').first().click();
  await expect(ช่องขั้น, "การ์ดเปิดอยู่ → กำลังดำเนินการ").toHaveValue("OPEN");
  await ตรงค่า(page, "กดการ์ดเปิดอยู่", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 4 });

  // ลีดของ HQ รอโอน → เลื่อนไปกล่องโอน (ตารางของลีดกลุ่มนั้น)
  await page.locator('[data-kpi="hqWaiting"]').first().click();
  await expect(page.locator("[data-card='hq-lead-transfer']")).toBeInViewport({ timeout: 10_000 });
  assertNoErrors(errs, "กดการ์ดลีดทั้งเครือ");
});

test("[ui·hq] ลีดทั้งเครือ: กล่องโอนลีดเหมือนตารางอื่น · ตารางไม่มีความคืบหน้า มีคอลัมน์ดีลเลอร์ · ข้อความไม่ถูกตัดที่จอกว้าง · คำในกราฟตรงขั้นตอนกลาง", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await loginUI(page, HQ_ORIGIN, "/hq/leads", ADMIN);
  await เปิดหน้าแล้วค้น(page);
  await ตรงค่า(page, "ค่าตั้งต้น", { เปิด: 4, ใหม่: 5, เงียบ: 1, ตาราง: 4 });

  // ── กล่องโอน: หัวการ์ด + เนื้อการ์ดมีระยะขอบ · หัวคอลัมน์ขนาดเท่าตารางลีด · หัวตรงแนวข้อมูล ──
  const กล่อง = page.locator("[data-card='hq-lead-transfer']");
  await expect(กล่อง.getByRole("row", { name: new RegExp(จังหวัด) }), "แถวจังหวัดของข้อ (สองสาขาดูแล)").toBeVisible();
  const ขนาด = async (l: Locator) => l.evaluate(el => getComputedStyle(el).fontSize);
  expect(await ขนาด(กล่อง.locator("thead th").first()), "หัวคอลัมน์กล่องโอน = ขนาดเดียวกับตารางลีด").toBe(await ขนาด(page.locator("[data-lead-table] thead th").first()));
  const ระยะ = await กล่อง.evaluate(el => {
    const r = el.getBoundingClientRect(), t = el.querySelector("table")!.getBoundingClientRect(), h = el.querySelector(".card-title")!.getBoundingClientRect();
    return { ตารางซ้าย: t.left - r.left, ตารางขวา: r.right - t.right, หัวซ้าย: h.left - r.left };
  });
  expect(ระยะ.ตารางซ้าย, "ตารางในกล่องโอนมีระยะขอบซ้าย").toBeGreaterThanOrEqual(12);
  expect(ระยะ.ตารางขวา, "ตารางในกล่องโอนมีระยะขอบขวา").toBeGreaterThanOrEqual(12);
  expect(ระยะ.หัวซ้าย, "หัวกล่องมีระยะขอบ").toBeGreaterThanOrEqual(12);
  const แนว = await กล่อง.locator("table").evaluate(t => {
    const th = Array.from(t.querySelectorAll("thead th")).map(x => x.getBoundingClientRect());
    const td = Array.from(t.querySelector("tbody tr")!.children).map(x => x.getBoundingClientRect());
    return th.map((h, i) => Math.abs(h.left - td[i].left) + Math.abs(h.right - td[i].right));
  });
  expect(แนว.every(d => d < 1), `หัวคอลัมน์กล่องโอนตรงแนวข้อมูล (${แนว.join(",")})`).toBe(true);
  const ชิด = await กล่อง.locator("table").evaluate(t => [getComputedStyle(t.querySelectorAll("thead th")[1]).textAlign, getComputedStyle(t.querySelector("tbody tr")!.children[1]).textAlign]);
  expect(ชิด, "จำนวนลูกค้าเป้าหมาย ชิดขวาทั้งหัวและข้อมูล").toEqual(["right", "right"]);

  // ── ตารางลีด: คอลัมน์ตามแบบดีลเลอร์ + ดีลเลอร์ · ไม่มีความคืบหน้า ──
  const ตาราง = page.locator("[data-lead-table] table");
  const หัว = (await ตาราง.locator("thead th").allInnerTexts()).map(t => t.trim());
  expect(หัว).toEqual(["บริษัท / ผู้ติดต่อ", "ดีลเลอร์", "จังหวัดหน้างาน", "ช่องทางที่มา", "งานที่ต้องการ", "พื้นที่ (ตร.ม.)", "ขั้นตอน", "มูลค่า", "ผู้รับผิดชอบ", "กิจกรรมล่าสุด", ""]);
  // ไม่ถูกตัด ไม่ตกบรรทัดที่จอกว้าง: หัวคอลัมน์ · บริษัท · ดีลเลอร์ · มูลค่า · ชี้แล้วเห็นเต็ม (title)
  const ตัด = await ตาราง.evaluate(t => {
    const ช่อง = [...Array.from(t.querySelectorAll<HTMLElement>("thead th")),
      ...Array.from(t.querySelectorAll<HTMLElement>("tbody td[data-cell='company'] > div, tbody td[data-cell='dealer'] > div, tbody td[data-cell='value']"))];
    return ช่อง.filter(c => c.textContent?.trim() && c.scrollWidth > c.clientWidth + 1)
      .map(c => c.textContent!.trim());
  });
  expect(ตัด, "จอ 1600: หัวคอลัมน์/ชื่อบริษัท/ดีลเลอร์/มูลค่า ไม่ถูกตัด").toEqual([]);
  const ชื่อเต็ม = await ตาราง.locator("tbody td[data-cell='company']").evaluateAll(cs => cs.map(c => [c.getAttribute("title") ?? "", c.querySelector("div")?.textContent ?? ""]));
  expect(ชื่อเต็ม.every(([title, ชื่อ]) => title.startsWith(ชื่อ)), "ชี้ที่ช่องบริษัทแล้วเห็นชื่อเต็ม").toBe(true);
  const ดีลเลอร์เต็ม = await ตาราง.locator("tbody td[data-cell='dealer']").evaluateAll(cs => cs.map(c => c.getAttribute("title") ?? ""));
  expect(ดีลเลอร์เต็ม.every(t => t === `${ก!.รหัส} ZZTEST ดีลเลอร์ลีดสตูล`), `ชี้ที่ช่องดีลเลอร์แล้วเห็นรหัส + ชื่อเต็ม (${ดีลเลอร์เต็ม.join(" · ")})`).toBe(true);
  const ชื่อบรรทัดเดียว = await ตาราง.locator("tbody td[data-cell='company'] > div").first().evaluate(d => getComputedStyle(d).whiteSpace);
  expect(ชื่อบรรทัดเดียว, "ชื่อบริษัทไม่ตกบรรทัด").toBe("nowrap");

  // ── กราฟรายเดือน: คำตรงขั้นตอนกลาง · หน้านี้ไม่มีผลงานดีลเลอร์ ──
  const แนวโน้ม = page.locator(".card").filter({ has: page.locator(".card-title", { hasText: /^แนวโน้มลูกค้าเป้าหมาย/ }) }).first();
  for (const คำ of ["ลีดใหม่", "ใบเสนอราคา", "ปิดสำเร็จ", "ปิดไม่สำเร็จ"]) await expect(แนวโน้ม, `กราฟแนวโน้มมีคำ "${คำ}"`).toContainText(คำ);
  await expect(แนวโน้ม).not.toContainText("ลูกค้าเป้าหมายใหม่");
  await expect(แนวโน้ม).not.toContainText("ปิดการขาย");
  await expect(page.locator(".erp"), "ไม่มีผลงานดีลเลอร์ในหน้านี้ (อยู่ภาพรวมยอดขายที่เดียว)").not.toContainText(/ผลงานดีลเลอร์|อัตราปิด|ยอดขาย/);
  assertNoErrors(errs, "หน้าตาลีดทั้งเครือ");
});
