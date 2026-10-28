import { test, expect, type Page, type Route } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { สร้างสาขาของชุด, ลบสาขาของชุด, type บัญชีสาขาของชุด } from "./ownBranch";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI, ไปแผงลีดจากแถวใบ } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ส่งใบให้ลูกค้าต้องเป็นยอดล่าสุดเสมอ (บอสสั่ง 22 ต.ค. 69 · ใบ 0238) ─────────────────────────────────────────────
//   บั๊กที่เจอจาก trace รอบตรวจรอบ 4: แก้ % ของ V2 แล้วบันทึก (2,950) → กด "ส่งให้ลูกค้า" → หน้าเว็บส่ง "ทั้งแถว" จากหน้าจอ
//   ซึ่งยังเป็น V2 รุ่นเก่า (2,750) เพราะข่าวอัปเดตสดของแถวเก่ามาถึงทีหลังแล้วทับของใหม่ → ถ้าคำขอผ่าน % ที่แก้หายเงียบ ๆ
//   กติกาใหม่: ① ปุ่มส่งเปลี่ยนแค่สถานะ ราคาที่ส่งเอาจากฐาน ② ข่าวอัปเดตสดที่เวลาแก้ล่าสุด (updated_at) เก่ากว่าหรือเท่ากับของที่มีอยู่ = ทิ้ง
//   ข้อทดสอบนี้ "คุมสายข่าว" เอง (ดัก /api/v1/events แล้วส่งข่าวที่กำหนด) — ไม่ต้องลุ้นจังหวะ ข่าวมาถึงทุกรอบเหมือนกัน
//   วันที่ปี 2099 ในข่าวที่ส่งเอง = เครื่องหมายว่าข่าวไหนถูกใช้บนจอ (รายการใบแสดงวันที่ของใบ)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.skip(() => process.env.NEXT_PUBLIC_DATA_SOURCE !== "api", "สายข่าวของเราเอง (/api/v1/events) มีเฉพาะโหมด api");
test.setTimeout(180_000);

const admin = adminClient();
// สาขาของชุดนี้เอง (ZZQS) — ถังโควตาคำขอแยกจาก RYG ที่ชุดอื่นใช้พร้อมกัน (ดู ownBranch.ts)
const รหัสสาขา = "ZZQS";
let สาขา: บัญชีสาขาของชุด;
test.beforeAll(async () => { สาขา = await สร้างสาขาของชุด(รหัสสาขา, "ระยอง"); });
type Row = Record<string, unknown>;
const ใบของ = async (id: string) => (await admin.from("quotations").select("*").eq("dealer_code", รหัสสาขา).eq("id", id).single()).data as Row;
/** แถวฐาน → รูปแบบที่สายข่าวส่ง (rowToQuote: snake → camel · area เป็นเลข · savedAt = created_at) */
const เป็นข่าว = (r: Row): Row => {
  const q: Row = {};
  for (const [k, v] of Object.entries(r)) q[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  q.area = q.area === "" || q.area == null ? 0 : Number(q.area);
  if (q.customerId == null) q.customerId = 0;
  q.savedAt = r.created_at;
  return q;
};
/** ช่องเวลาแก้ล่าสุดของข่าว = เวลาแก้ล่าสุดของแถว ± ms · ก่อนใบ 0238 ฐานไม่มีช่องนี้ → ข่าวก็ไม่มี (เหมือนข่าวจริงของฐานรุ่นนั้น) */
const เวลา = (r: Row, ms: number): Row => r.updated_at == null ? {}
  : { updatedAt: new Date(new Date(String(r.updated_at)).getTime() + ms).toISOString() };

/** คุมสายข่าว: ปกติส่งแค่ "พร้อม" แล้วปิด (หน้าเว็บต่อใหม่เอง) · มีข่าวในคิว = ส่งทั้งชุดในก้อนเดียวรอบถัดไป */
async function คุมสายข่าว(page: Page) {
  const คิว: Row[][] = [];
  await page.route("**/api/v1/events", async (route: Route) => {
    const ชุด = คิว.shift() ?? [];
    const body = [`data: ${JSON.stringify({ ch: "ready" })}\n\n`,
      ...ชุด.map(row => `data: ${JSON.stringify({ ch: "sales", change: { table: "quotations", type: "UPDATE", row } })}\n\n`)].join("");
    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-store" }, body });
  });
  return (ข่าว: Row[]) => { คิว.push(ข่าว); };
}

/** V1 ส่งแล้ว → ทำฉบับใหม่บนหน้าเว็บ → แก้ % รายการแรกเป็น 20 → บันทึก (2,950) · คืนเลข V1/V2 */
async function เตรียมV2แก้แล้ว(page: Page, ใบ: ใบHQพร้อมใช้, ลูกค้า: string) {
  const v1 = (await ทำใบลูกค้าจากใบHQ(สาขา, ใบ, { customer: ลูกค้า, markupPercent: 10, status: "sent_to_client" })).id;
  const v2 = `${v1}-V2`;
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(v1);
  const แถว = page.locator("tbody tr").filter({ hasText: v1 }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await ไปแผงลีดจากแถวใบ(แถว);  // 28 ต.ค. 69: กดแถว = แผงดูใบในหน้าเดิม → ปุ่ม "ไปแผงลีด"
  await page.waitForURL(/\/leads/, { timeout: 25_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
  await page.locator(`[data-quote-item="${v1}"]`).getByTitle("ทำฉบับใหม่").click({ timeout: 20_000 });
  await expect(page.locator("[data-version-copied]")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 20_000 });
  await page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" }).getByLabel("% ที่บวก 1").fill("20");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => Number((await ใบของ(v2)).total_value), { timeout: 25_000, message: "V2 บันทึก % ใหม่: 2×1,200 + 550" }).toBe(2950);
  await expect(page.locator(`[data-quote-item="${v2}"]`), "แผงลีดเห็น V2").toBeVisible({ timeout: 20_000 });
  return { v1, v2 };
}
/** ยอดก่อน VAT ที่หน้าดูใบแสดง (เปิดหน้าดูใบของใบนั้น แล้วกลับ) */
async function ยอดบนจอ(page: Page, id: string) {
  await page.locator(`[data-quote-item="${id}"]`).getByTitle("ดู", { exact: true }).click({ timeout: 20_000 });
  const ยอด = (await page.locator("[data-quote-totals]").getByText(/^ยอดรวมย่อย/).locator("xpath=..").innerText({ timeout: 15_000 })).replace(/\s+/g, " ");
  await page.getByRole("button", { name: "กลับ" }).click();
  return ยอด;
}
/** V2 ที่มีเนื้อหาเก่า (บวก 10% · 2,750) — เหมือนแถวที่ได้ตอนกดทำฉบับใหม่ */
const เนื้อหาเก่า = (r: Row): Row => ({
  ...เป็นข่าว(r), totalValue: 2750, materialCost: 2500, markupPercent: 10, total: "0",
  lineItems: (r.line_items as Row[]).map((l, i) => i === 0 ? { ...l, markupPct: 10, unitPrice: 1100 } : l),
});

let ใบ1: ใบHQพร้อมใช้ | undefined, ใบ2: ใบHQพร้อมใช้ | undefined;
test.afterAll(async () => {
  expect(await ลบสาขาของชุด(รหัสสาขา, [ใบ1, ใบ2].filter(Boolean).map(ใ => ใ!.leadNum)), `เก็บกวาดสาขา ${รหัสสาขา}`).toEqual([]);
});
const บรรทัด = [{ name: "โครงเหล็กชุดส่ง", qty: 2, unit: "ชุด", unitCost: 1000 }, { name: "หลังคาชุดส่ง", qty: 1, unit: "งาน", unitCost: 500 }];

test("[func·dealer] แก้ % บันทึกแล้วกดส่งทันที → ลูกค้าได้ยอดล่าสุด 2,950 · ข่าวอัปเดตสดที่เก่ากว่า/เวลาเท่ากันถูกทิ้ง", async ({ page }) => {
  const ลูกค้า = `ZZTEST-ส่งยอดล่าสุด-${Date.now() % 100000}`;
  ใบ1 = await เตรียมใบHQ(สาขา, { dealerCode: รหัสสาขา, company: ลูกค้า, province: "ระยอง", lines: บรรทัด });
  const ส่งข่าว = await คุมสายข่าว(page);
  const { v1, v2 } = await เตรียมV2แก้แล้ว(page, ใบ1, ลูกค้า);

  // ข่าว 3 ข่าวในก้อนเดียว (หน้าเว็บอ่านเรียงตามลำดับ):
  //   ① ใหม่กว่าของที่มี 1 ms เนื้อหาถูก (2,950) วันที่ 2099-12-31 → ต้องใช้
  //   ② เก่ากว่า ① เนื้อหาเก่า (2,750) วันที่ 2099-01-01 → ต้องทิ้ง
  //   ③ เวลาเท่ากับ ① เนื้อหาเก่า (2,750) วันที่ 2099-01-02 → ต้องทิ้ง (เท่ากัน = ไม่ใช่ของใหม่)
  const แถว = await ใบของ(v2);
  const ล่าสุด = เวลา(แถว, 1);
  ส่งข่าว([
    { ...เป็นข่าว(แถว), ...ล่าสุด, date: "2099-12-31" },
    { ...เนื้อหาเก่า(แถว), ...เวลา(แถว, -60_000), date: "2099-01-01" },
    { ...เนื้อหาเก่า(แถว), ...ล่าสุด, date: "2099-01-02" },
  ]);
  const ใบV2 = page.locator(`[data-quote-item="${v2}"]`);
  await expect(ใบV2, "ข่าวที่ส่งเองมาถึงหน้าเว็บแล้ว").toContainText("2099-", { timeout: 30_000 });
  await page.waitForTimeout(500);
  await expect(ใบV2, "ข่าวที่เก่ากว่าหรือเวลาเท่ากันต้องไม่ทับของใหม่ (ต้องเหลือข่าว ① 2099-12-31)").toContainText("2099-12-31");
  expect(await ยอดบนจอ(page, v2), "หน้าจอยังเป็นยอดล่าสุด").toContain("฿2,950");

  // กดส่งทันที (กล่องขั้นต่อไป) → ใบที่ลูกค้าได้ = ยอดล่าสุดในฐาน
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await ใบของ(v2)).status, { timeout: 25_000, message: "V2 ส่งให้ลูกค้าแล้ว" }).toBe("sent_to_client");
  const ส่งแล้ว = await ใบของ(v2);
  expect(Number(ส่งแล้ว.total_value), "ใบที่ลูกค้าได้ = ยอดล่าสุด 2,950").toBe(2950);
  expect((ส่งแล้ว.line_items as Row[])[0], "รายการแรกยังเป็น % ที่แก้ (20)").toMatchObject({ markupPct: 20, unitPrice: 1200 });
  expect((await ใบของ(v1)).status, "V1 ถูกแทนที่").toBe("superseded");
});

test("[func·dealer] หน้าจอค้างยอดผิด แล้วกดส่ง → ราคาที่ส่งมาจากฐาน ไม่ใช่จากหน้าจอ", async ({ page }) => {
  const ลูกค้า = `ZZTEST-ส่งราคาจากฐาน-${Date.now() % 100000}`;
  ใบ2 = await เตรียมใบHQ(สาขา, { dealerCode: รหัสสาขา, company: ลูกค้า, province: "ระยอง", lines: บรรทัด });
  const ส่งข่าว = await คุมสายข่าว(page);
  const { v1, v2 } = await เตรียมV2แก้แล้ว(page, ใบ2, ลูกค้า);

  // ข่าวที่ "ใหม่กว่า" แต่เนื้อหาผิด (2,750) — หน้าจอรับไว้ (จำลองหน้าจอที่ค้างค่าผิดด้วยเหตุใดก็ตาม)
  const แถว = await ใบของ(v2);
  ส่งข่าว([{ ...เนื้อหาเก่า(แถว), ...เวลา(แถว, 1), date: "2099-06-06" }]);
  await expect(page.locator(`[data-quote-item="${v2}"]`), "หน้าจอรับข่าวยอดผิดแล้ว").toContainText("2099-06-06", { timeout: 30_000 });
  expect(await ยอดบนจอ(page, v2), "หน้าจอค้างยอดผิด (ตั้งใจ)").toContain("฿2,750");

  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await ใบของ(v2)).status, { timeout: 25_000, message: "V2 ส่งให้ลูกค้าแล้ว" }).toBe("sent_to_client");
  const ส่งแล้ว = await ใบของ(v2);
  expect(Number(ส่งแล้ว.total_value), "ราคาที่ส่ง = ราคาในฐาน (2,950) ไม่ใช่ที่หน้าจอค้าง (2,750)").toBe(2950);
  expect((ส่งแล้ว.line_items as Row[])[0], "รายการแรกยังเป็น % ที่แก้ (20)").toMatchObject({ markupPct: 20, unitPrice: 1200 });
  expect(ส่งแล้ว.date, "วันที่ส่ง = วันนี้ (ฐานประทับ ไม่ใช่วันที่ค้างบนจอ)").toBe(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
  expect((await ใบของ(v1)).status, "V1 ถูกแทนที่").toBe("superseded");
  // หลังส่ง หน้าจอได้แถวจากฐานกลับมา → ยอดถูก
  await expect(page.locator(`[data-quote-item="${v2}"]`)).not.toContainText("2099-06-06", { timeout: 20_000 });
  expect(await ยอดบนจอ(page, v2), "หลังส่ง หน้าจอแสดงยอดจากฐาน").toContain("฿2,950");
});
