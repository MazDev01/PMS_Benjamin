import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── ขายหนึ่งงาน ขั้น 7–11 บนหน้าจอ + ตารางสถานะ (ส่งใบให้ลูกค้า / won / lost) · ด่าน 3 (FLOW.html) ──────────────
//   ขั้น 7  ทำใบให้ลูกค้าจากใบ HQ: รายการ/จำนวนล็อก · ดีลเลอร์ตั้ง % รายบรรทัด · ราคา = ต้นทุน × (1 + %)
//   ขั้น 8  ส่งใบให้ลูกค้า → ลูกค้าเป้าหมาย QUOTED · หน้าพิมพ์/ไฟล์ส่งออก "ไม่มีต้นทุนหรือ %" (ตรวจที่ไฟล์จริง)
//   margin  HQ เปิดใบ: ต้นทุน 10 บวก 50% → ขาย 15 · บวก 5 บาท · 50% ของต้นทุน · 33.33% ของราคาขาย (เงื่อนไขปิดด่านของบอส)
//   ขั้น 10–11 ลูกค้าตอบรับ → PAID · ใบ HQ สั่งผลิต · ราคาล็อก (แก้ % ไม่ได้)   ลูกค้าปฏิเสธ → CANCELLED + เหตุผล
//   ปิดทางเดิม: ไม่มีใบ HQ = ปุ่มทำใบกดไม่ได้ · API/ฐานข้อมูลปฏิเสธทุกทาง
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const admin = adminClient();
const แท็ก = `${Date.now() % 100000}`;
const สิบ = `ZZTEST-ใบลูกค้า10-${แท็ก}`;      // ต้นทุน 10 ×1 → บวก 50% (ตัวอย่างของบอส)
const ลับ = `ZZTEST-ใบลูกค้าลับ-${แท็ก}`;     // ต้นทุน 12,345.67 ×2 → บวก 37% (ตัวเลขเฉพาะตัว ใช้ตรวจว่าต้นทุนไม่หลุด)
const ไม่มีใบ = `ZZTEST-ไม่มีใบHQ-${แท็ก}`;
let ก: ใบHQพร้อมใช้, ข: ใบHQพร้อมใช้;
let เลขไม่มีใบ = 0;

test.beforeAll(async () => {
  ก = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: สิบ, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 10 }] });
  ข = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลับ, province: "ระยอง", lines: [{ name: "หลังคาชุดทดสอบ", qty: 2, unit: "ชุด", unitCost: 12345.67 }] });
  เลขไม่มีใบ = ก.leadNum + 7;
  const r = await (await db(RYG)).from("leads").insert({ id: `#L-${เลขไม่มีใบ}`, num_id: เลขไม่มีใบ, dealer_code: "RYG", company: ไม่มีใบ, name: ไม่มีใบ,
    contact: "ผู้ทดสอบ", phone: `08${String(เลขไม่มีใบ).slice(-8)}`, province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET" });
  if (r.error) throw new Error(r.error.message);
});
test.afterAll(async () => {
  const { data: cs } = await admin.from("customers").select("id").eq("dealer_code", "RYG").in("company", [สิบ, ลับ]);
  ล้างใบHQทดสอบ("RYG", [ก?.leadNum, ข?.leadNum, เลขไม่มีใบ]);
  for (const c of cs ?? []) await admin.from("customers").delete().eq("dealer_code", "RYG").eq("id", c.id);
});

const ใบของ = async (leadNum: number) => (await admin.from("quotations").select("id, status, total_value, line_items, hq_quote_id").eq("dealer_code", "RYG").eq("deal_id", leadNum).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
const สถานะลูกค้าเป้าหมาย = async (n: number) => (await admin.from("leads").select("status, lost_reason").eq("dealer_code", "RYG").eq("num_id", n).single()).data;

async function เปิดแท็บใบเสนอราคา(page: Page, company: string) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const row = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
}

test("[flow·dealer] ปิดทางเดิม: ไม่มีใบ HQ = ทำใบไม่ได้ ทั้งหน้าจอและ API", async ({ page, request }) => {
  await เปิดแท็บใบเสนอราคา(page, ไม่มีใบ);
  // ปุ่มทำใบมีที่แถบขั้นต่อไปที่เดียว (บอสสั่ง 19 ต.ค. 69) — ยังไม่ได้ใบ HQ = แถบชวนขอราคา ไม่มีปุ่มทำใบเลย
  await expect(page.getByText(/ต้องได้ราคาจากสำนักงานใหญ่ก่อน/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /ทำใบให้ลูกค้า/ }), "ยังไม่ได้ใบ HQ ต้องไม่มีปุ่มทำใบ").toHaveCount(0);

  // ทาง API เดิมทั้งสองทาง + ยิงตรงฐาน — ต้องถูกปฏิเสธทั้งหมด
  const sb = await db(RYG);
  const token = (await sb.auth.getSession()).data.session?.access_token ?? "";
  const หัว = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const แถว = { customer: ไม่มีใบ, project: ไม่มีใบ, total: "฿100", totalValue: 100, materialCost: 100, province: "ระยอง", buildingType: "โกดัง",
    area: 0, status: "draft", date: "2026-10-14", items: 1, lineItems: [{ name: "x", qty: 1, unit: "ชุด", unitPrice: 100 }], customerId: 0, projectId: 0, dealId: เลขไม่มีใบ };
  for (const [ทาง, url, data] of [
    ["ออกเลขใบ (หน้าจอใช้)", `${DEALER_ORIGIN}/api/v1/quotations?op=numbered`, { dealer: "RYG", prefix: "Q-", row: แถว }],
    ["บันทึกใบตรง", `${DEALER_ORIGIN}/api/v1/quotations`, { ...แถว, id: `ZZ-OLD-${แท็ก}`, dealerCode: "RYG" }],
  ] as const) {
    const r = await request.post(url, { headers: หัว, data });
    expect(r.ok(), `ทางเดิม (${ทาง}) ต้องถูกปฏิเสธ — ได้ ${r.status()} ${await r.text()}`).toBe(false);
  }
  const ตรง = await sb.from("quotations").insert({ id: `ZZ-OLD2-${แท็ก}`, dealer_code: "RYG", customer: ไม่มีใบ, line_items: [{ name: "x", qty: 1, unit: "ชุด", unitPrice: 100 }], total_value: 100 });
  expect(ตรง.error?.message ?? "", "ยิงตรงฐานต้องถูกปฏิเสธ").toContain("hq_quote_required");
  expect((await admin.from("quotations").select("id").eq("dealer_code", "RYG").eq("customer", ไม่มีใบ)).data ?? [], "ไม่มีใบหลุดเข้าฐาน").toEqual([]);
});

test("[flow·dealer] ขั้น 7: ทำใบให้ลูกค้าจากใบ HQ — รายการล็อก · ตั้ง % รายบรรทัด · ราคา = ต้นทุน × (1 + %)", async ({ page }) => {
  const errs = watchErrors(page);
  for (const [บริษัท, pct] of [[สิบ, "50"], [ลับ, "37"]] as const) {
    await เปิดแท็บใบเสนอราคา(page, บริษัท);
    await page.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click();
    const ตาราง = page.locator("[data-editor='hq-markup']");
    await expect(ตาราง).toBeVisible({ timeout: 20_000 });
    await expect(ตาราง.getByRole("textbox", { name: /ชื่อรายการ/ }), "ชื่อรายการแก้ไม่ได้").toHaveCount(0);
    await ตาราง.getByLabel("% ที่บวก 1").fill(pct);
    await expect(ตาราง.getByTestId("hq-line-price-0")).toHaveText(บริษัท === สิบ ? "15.00" : "16,913.57");
    await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
    const ใบHQ = บริษัท === สิบ ? ก : ข;
    await expect.poll(async () => (await ใบของ(ใบHQ.leadNum))?.hq_quote_id, { timeout: 20_000, message: "ใบลูกค้าต้องผูกใบ HQ" }).toBe(ใบHQ.hqQuoteId);
    // ใบลงฐานแล้ว แต่แอปยังเขียนตามหลังอีก (แก้ลูกค้าเป้าหมาย + แนบไฟล์ใบ) — รอให้เสร็จก่อนเปลี่ยนหน้า
    //   เดิมเปลี่ยนหน้าทันที → คำสั่งแก้ลูกค้าเป้าหมายถูกตัด (Failed to fetch) · trace 15 ต.ค. 69: ใบลง 3.56 วิ · แก้ลูกค้าเป้าหมาย 3.69 · เปลี่ยนหน้า 3.72
    await settle(page);
  }
  const q10 = await ใบของ(ก.leadNum), qลับ = await ใบของ(ข.leadNum);
  expect(Number(q10!.total_value), "ต้นทุน 10 บวก 50% = 15").toBe(15);
  expect(Number(qลับ!.total_value), "12,345.67 × 1.37 = 16,913.57 × 2").toBe(33827.14);
  assertNoErrors(errs, "ทำใบจากใบ HQ");
});

test("[flow·dealer] ขั้น 8: ส่งใบให้ลูกค้า → QUOTED · หน้าพิมพ์และไฟล์ส่งออกไม่มีต้นทุนหรือ % (ตรวจที่ไฟล์จริง)", async ({ page }) => {
  const qลับ = await ใบของ(ข.leadNum);
  test.skip(!qลับ, "ข้อก่อนหน้าไม่ผ่าน");
  // รอบ 4: ส่งใบให้ลูกค้า = ปุ่มในกล่องขั้นต่อไปของแผงลีดที่เดียว (หน้าใบเสนอราคาไม่มีปุ่มในแถวแล้ว)
  //   ใบร่างทั้งสองยังต้องโผล่ในหน้ารายการใบเสนอราคา (ตรวจเดิมคงไว้)
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  for (const บริษัท of [สิบ, ลับ])
    await expect(page.locator("tbody tr").filter({ hasText: บริษัท }).first(), `ใบของ ${บริษัท} ต้องอยู่ในหน้ารายการ`).toBeVisible({ timeout: 25_000 });
  for (const บริษัท of [สิบ, ลับ]) {
    await เปิดแท็บใบเสนอราคา(page, บริษัท);
    await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 25_000 });
    await กดตกลงในกล่องยืนยัน(page);
  }
  await expect.poll(async () => (await สถานะลูกค้าเป้าหมาย(ข.leadNum))?.status, { timeout: 25_000, message: "ส่งใบแล้วลูกค้าเป้าหมายต้องเป็น QUOTED" }).toBe("QUOTED");
  expect((await สถานะลูกค้าเป้าหมาย(ก.leadNum))?.status).toBe("QUOTED");

  // หน้าพิมพ์ที่ลูกค้าได้รับ — อ่านเอกสารจริงที่เปิดออกมา
  const ห้าม = ["12,345.67", "12345.67", "24,691.34", "ต้นทุน", "37%", "37 %", "markup", "unitCost", "HQ-"];
  // เลขใบ HQ (HQ-…) ห้ามหลุด — ยกเว้นคำนำหน้าชื่อลูกค้าเป้าหมายทดสอบ "ZZTEST-BASE-ใบHQ-…" (helpers.ts) ที่ชุดอื่นสร้างใบของสาขาเดียวกันไว้
  //   ไฟล์ส่งออกมีใบทั้งสาขา → เดิมจับชื่อลูกค้าทดสอบนั้นแล้วตกแบบสุ่มตามลำดับที่ชุดอื่นรัน · คำอื่นตรวจเหมือนเดิม
  const เจอ = (เนื้อ: string, คำ: string) => คำ === "HQ-" ? /(?<!ใบ)HQ-/.test(เนื้อ) : เนื้อ.includes(คำ);
  //   พิมพ์จากแผงใบเสนอราคาของลูกค้าเป้าหมาย (ตัวสร้างเอกสารชุดเดียวกับหน้ารายการใบ — buildQuotationHTML)
  //   พิมพ์ต้องมีข้อมูลบริษัทครบ (ใบ 0247 · ข้อมูลตั้งต้นของ RYG ครบแล้ว) — ถ้าไม่มีชื่อบริษัท ตั้งชื่อทดสอบให้ชั่วคราว แล้วคืนค่าเดิม
  const ตั้งค่าเดิม = (await admin.from("dealer_settings").select("issuer").eq("dealer_code", "RYG").maybeSingle()).data;
  const ชื่อผู้ออก = "ZZTEST บริษัทผู้ออกใบ จำกัด";
  if (!String((ตั้งค่าเดิม?.issuer as { company?: string } | null)?.company ?? "").trim()) {
    const ตั้ง = await admin.from("dealer_settings").upsert({ dealer_code: "RYG", issuer: { ...((ตั้งค่าเดิม?.issuer as object) ?? {}), company: ชื่อผู้ออก } }, { onConflict: "dealer_code" });
    expect(ตั้ง.error, `ตั้งชื่อบริษัททดสอบไม่สำเร็จ: ${ตั้ง.error?.message}`).toBeNull();
  }
  try {
    await เปิดแท็บใบเสนอราคา(page, ลับ);
    const [หน้าพิมพ์] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "พิมพ์", exact: true }).first().click()]);
    // หน้าพิมพ์เปิดก่อน (ขึ้น "กำลังเตรียมเอกสาร…") แล้วเติมเอกสารเมื่อฐานคืนหัวกระดาษ (ใบ 0247) — รอเอกสารจริง ไม่อ่านหน้ารอ
    await expect.poll(() => หน้าพิมพ์.content(), { timeout: 20_000, message: "หน้าพิมพ์ได้เอกสารจริงจากฐาน" }).not.toContain("กำลังเตรียมเอกสาร");
    const html = await หน้าพิมพ์.content();
    expect(html, "หน้าพิมพ์ต้องมีราคาขาย").toContain("16,913.57");
    for (const คำ of ห้าม) expect(เจอ(html, คำ), `หน้าพิมพ์ต้องไม่มี "${คำ}"`).toBe(false);
    await หน้าพิมพ์.close();
  } finally {
    if (!ตั้งค่าเดิม) await admin.from("dealer_settings").delete().eq("dealer_code", "RYG");   // เดิมไม่มีแถวตั้งค่า
    else await admin.from("dealer_settings").update({ issuer: ตั้งค่าเดิม.issuer }).eq("dealer_code", "RYG");
  }

  // ไฟล์ส่งออกจากหน้าใบเสนอราคา (CSV และ Excel) — อ่านไฟล์ที่ดาวน์โหลดจริง
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  for (const แบบ of ["CSV", "Excel"]) {
    await page.getByRole("button", { name: /ส่งออก|Export/ }).first().click();
    const [ไฟล์] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: new RegExp(`^${แบบ}`) }).first().click()]);
    const เนื้อ = readFileSync(await ไฟล์.path()).toString("utf8");
    expect(เนื้อ, `ไฟล์ ${แบบ} ต้องมีใบของข้อทดสอบ`).toContain(ลับ);
    for (const คำ of ห้าม) expect(เจอ(เนื้อ, คำ), `ไฟล์ ${แบบ} ต้องไม่มี "${คำ}"`).toBe(false);
  }
});

test("[flow·hq] margin: HQ เห็นต้นทุน · % · ราคาขาย · บาทที่บวก รายบรรทัดและทั้งใบ (10 → 15 · 5 บาท · 50% · 33.33%)", async ({ page }) => {
  const q10 = await ใบของ(ก.leadNum);
  test.skip(!q10, "ข้อก่อนหน้าไม่ผ่าน");
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(q10!.id);
  const แถว = page.locator("tbody tr").filter({ hasText: q10!.id }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  await แถว.getByRole("button", { name: /ดู/ }).first().click();
  const แผง = page.locator("[data-panel='quote-margin']");
  await expect(แผง).toBeVisible({ timeout: 20_000 });
  const บรรทัด = แผง.locator("[data-margin-line='0']");
  await expect(บรรทัด.locator("[data-cell='cost']")).toHaveText("10.00");
  await expect(บรรทัด.locator("[data-cell='pct']")).toHaveText("50.00%");
  await expect(บรรทัด.locator("[data-cell='price']")).toHaveText("15.00");
  await expect(บรรทัด.locator("[data-cell='baht']")).toHaveText("5.00");
  await expect(แผง.locator("[data-cell='sum-baht']")).toHaveText("5.00 บาท");
  await expect(แผง.locator("[data-cell='sum-pct-cost']")).toHaveText("50.00%");
  await expect(แผง.locator("[data-cell='sum-pct-sale']")).toHaveText("33.33%");
  assertNoErrors(errs, "margin ฝั่ง HQ");
});

test("[D8x] [flow·dealer] ขั้น 10–11 + ลูกค้าปฏิเสธ: won → PAID · ใบ HQ สั่งผลิต · ราคาล็อก | lost → CANCELLED + เหตุผล", async ({ page }) => {
  const q10 = await ใบของ(ก.leadNum), qลับ = await ใบของ(ข.leadNum);
  test.skip(!q10 || q10.status !== "sent_to_client", "ข้อก่อนหน้าไม่ผ่าน");
  // รอบ 4: ลูกค้าตอบรับ/ปฏิเสธ = ปุ่มที่ใบในแท็บใบเสนอราคาของแผงลีดที่เดียว (หน้าใบเสนอราคาเหลือรายการอย่างเดียว)
  // won
  await เปิดแท็บใบเสนอราคา(page, สิบ);
  await page.locator(`[data-quote-item="${q10!.id}"] [data-customer-result]`).getByRole("button", { name: /ลูกค้าตอบรับ/ }).click({ timeout: 25_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await สถานะลูกค้าเป้าหมาย(ก.leadNum))?.status, { timeout: 25_000, message: "won → ลูกค้าเป้าหมาย PAID" }).toBe("PAID");
  expect((await admin.from("hq_quotes").select("status").eq("id", ก.hqQuoteId).single()).data?.status, "ใบ HQ = สั่งผลิต").toBe("ordered");
  expect((await admin.from("quote_requests").select("status").eq("id", ก.requestId).single()).data?.status, "คำขอปิด won").toBe("won");
  const แก้ = await (await db(RYG)).from("quotations").update({ markup_percent: 80 }).eq("dealer_code", "RYG").eq("id", q10!.id);
  expect(แก้.error?.message ?? "", "สั่งผลิตแล้วแก้ % ไม่ได้").toContain("quote_locked");

  // lost
  await เปิดแท็บใบเสนอราคา(page, ลับ);
  await page.locator(`[data-quote-item="${qลับ!.id}"] [data-customer-result]`).getByRole("button", { name: "ลูกค้าปฏิเสธ", exact: true }).click({ timeout: 25_000 });
  const ตัวเลือก = page.locator("[data-lost-picker]");
  await expect(ตัวเลือก).toBeVisible({ timeout: 30_000 });
  await ตัวเลือก.getByRole("button").first().click();
  await page.locator("[data-reason-dialog]").getByRole("button", { name: "ยืนยันลูกค้าปฏิเสธ" }).click();   // กล่องเหตุผลกลาง (28 ต.ค. 69)
  await expect.poll(async () => (await สถานะลูกค้าเป้าหมาย(ข.leadNum))?.status, { timeout: 25_000, message: "lost → ลูกค้าเป้าหมาย CANCELLED" }).toBe("CANCELLED");
  expect((await สถานะลูกค้าเป้าหมาย(ข.leadNum))?.lost_reason, "ต้องมีเหตุผล").toBeTruthy();
  expect((await admin.from("quote_requests").select("status").eq("id", ข.requestId).single()).data?.status, "คำขอปิด lost").toBe("lost");
  expect(qลับ).toBeTruthy();
});

test("[flow·hq] HQ ย้อนการตอบรับ (won) พร้อมเหตุผล — ปุ่มอยู่ที่แผงใบของ HQ · ไทม์ไลน์บอกว่าใคร/เหตุผล · ใบที่ไม่ใช่ won ไม่มีปุ่ม", async ({ page }) => {
  // BACKLOG "ต้องแก้ก่อนขึ้นระบบจริง" (ด่าน 3 → ด่าน 5): ก่อนนี้ย้อนได้ทางเดียวคือคำสั่งของฐาน quotation_revert_won
  const q10 = await ใบของ(ก.leadNum), qลับ = await ใบของ(ข.leadNum);
  test.skip(q10?.status !== "won", "ข้อก่อนหน้าไม่ผ่าน");
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const เปิดใบ = async (id: string) => {
    await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(id);
    const แถว = page.locator("tbody tr").filter({ hasText: id }).first();
    await expect(แถว).toBeVisible({ timeout: 25_000 });
    await แถว.getByRole("button", { name: /ดู/ }).first().click();
    return page.getByRole("dialog", { name: "รายละเอียดใบเสนอราคา" });
  };

  // ใบที่ลูกค้าปฏิเสธ (ไม่ใช่ won) ไม่มีปุ่มย้อน
  const แผงลับ = await เปิดใบ(qลับ!.id);
  await expect(แผงลับ.locator("[data-panel='revert-won']"), "ใบที่ไม่ใช่ won ไม่มีปุ่มย้อน").toHaveCount(0);
  await page.keyboard.press("Escape");

  const แผง = await เปิดใบ(q10!.id);
  await แผง.getByRole("button", { name: "ย้อนเป็นส่งให้ลูกค้าแล้ว" }).click();
  const ถาม = page.getByRole("alertdialog", { name: /ย้อนการตอบรับใบ/ });
  await expect(ถาม.getByRole("button", { name: "ย้อนการตอบรับ" }), "ยังไม่กรอกเหตุผล กดย้อนไม่ได้").toBeDisabled();
  await ถาม.getByLabel("เหตุผลที่ย้อน").fill("ดีลเลอร์กดตอบรับผิดใบ");
  await ถาม.getByRole("button", { name: "ย้อนการตอบรับ" }).click();
  await expect.poll(async () => (await ใบของ(ก.leadNum))?.status, { timeout: 20_000, message: "ย้อนแล้วใบต้องเป็นส่งให้ลูกค้าแล้ว" }).toBe("sent_to_client");
  // ตารางต้องอัปเดตเองโดยไม่ต้องรีเฟรชหน้า (ตารางเทียบรอบ 1 · รอบ 2 ช่วง ง — เดิมยังขึ้น "ตอบรับ" จนกว่าจะรีเฟรช)
  const แถวหลังย้อน = page.locator("tbody tr").filter({ hasText: q10!.id }).first();
  await expect(แถวหลังย้อน, "ตารางอัปเดตสถานะเองหลังย้อน").toContainText("ส่งแล้ว", { timeout: 15_000 });
  await expect(แถวหลังย้อน).not.toContainText("ตอบรับ");
  const { data: ลีด } = await admin.from("leads").select("activities").eq("dealer_code", "RYG").eq("num_id", ก.leadNum).single();
  expect(JSON.stringify(ลีด?.activities ?? []), "ไทม์ไลน์ต้องบอกว่าสำนักงานใหญ่ย้อน พร้อมเหตุผล").toMatch(/สำนักงานใหญ่.*ย้อนการตอบรับ.*ดีลเลอร์กดตอบรับผิดใบ/);
  assertNoErrors(errs, "HQ ย้อนการตอบรับ");
});
