import { test, expect, type Page, type Route, type Locator } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── กล่องเหตุผลกลาง + ปุ่มรอฐาน (บอสสั่ง 28 ต.ค. 69 · กด "ยกเลิกคำขอ" แล้วดูเหมือนไม่เกิดอะไร) ─────────────────────────────
//   ทุกจุดที่ต้องใส่เหตุผล: ยกเลิกคำขอ · ขอแก้ราคา · ลูกค้าปฏิเสธ · ปิดไม่สำเร็จ (ดีลเลอร์)
//                         ย้อนการตอบรับ · ผู้สนใจไม่สำเร็จ · ปฏิเสธใบค่าแฟรนไชส์ · ยกเลิกการชำระ (HQ)
//   แต่ละจุด: 1) เหตุผลว่าง → ปุ่มยืนยันกดไม่ได้ + บอกที่ช่องเหตุผล
//            2) ฐานช้า (คำสั่งเขียนค้างไว้ไม่ตอบ) → ปุ่มขึ้น "กำลัง…" กดซ้ำไม่ได้ · ไม่มีคำสั่งเขียนเพิ่มจากการกดซ้ำ
//            3) ฐานตอบผิดพลาด → ข้อความในกล่อง · กล่องไม่ปิดเอง · ปุ่มกลับมากดได้
//   ปุ่มรอฐานอื่น (ข้อ 2): ลูกค้าตอบรับ — ฐานช้า → "กำลัง…" กดซ้ำไม่ได้ · ผิดพลาด = ข้อความในกล่อง
//   คำสั่งเขียนทุกตัวถูกดักไว้ ไม่ถึงฐานจริง (ข้อมูลทดสอบไม่เปลี่ยน) · ตกบนโค้ดเดิม: ไม่มีกล่องกลาง (data-reason-dialog)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(240_000);

const admin = adminClient();
const แท็ก = Date.now() % 100_000;
const ข้อผิดพลาดจำลอง = "ทดสอบ: ฐานปฏิเสธคำสั่งนี้";

// คำสั่งอ่านที่ส่งแบบ POST (การ์ดตัวเลข · ดึงแถว · ปิดใบหมดอายุตอนโหลด · เข้าระบบ) — ปล่อยผ่าน ไม่นับเป็นคำสั่งเขียนของปุ่ม
//   (รอบเต็ม 28 ต.ค. 69: kpiCards อ่านซ้ำระหว่างช่วงสังเกต ถูกนับเป็น "กดซ้ำ" — ไม่ใช่การกดซ้ำจริง)
const คำสั่งอ่าน = /\/api\/v1\/(metrics|auth)\b|[?&]op=(get|list|page|summary|search|count|expire)\b/;

/** ดักคำสั่งเขียนไว้ไม่ตอบ — นับตามคำสั่ง (วิธี + ที่อยู่ + เนื้อหา) · ปล่อยด้วยคำตอบผิดพลาดตอนสั่ง */
async function ดักคำสั่งเขียน(page: Page) {
  const ค้าง: Route[] = [];
  const ต่อคำสั่ง = new Map<string, number>();
  await page.route("**/api/v1/**", route => {
    const r = route.request();
    if (r.method() === "GET" || คำสั่งอ่าน.test(r.url())) { void route.continue(); return; }
    const คีย์ = `${r.method()} ${r.url()} ${r.postData() ?? ""}`;
    ต่อคำสั่ง.set(คีย์, (ต่อคำสั่ง.get(คีย์) ?? 0) + 1);
    ค้าง.push(route);
  });
  return {
    นับ: () => ค้าง.length,
    /** สำเนาจำนวนต่อคำสั่ง — คำสั่งเดียวกันเพิ่ม = กดซ้ำได้ */
    ภาพ: () => new Map(ต่อคำสั่ง),
    ตอบผิดพลาด: async () => {
      for (const r of ค้าง.splice(0)) await r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: ข้อผิดพลาดจำลอง }) }).catch(() => {});
    },
    เลิก: async () => { for (const r of ค้าง.splice(0)) await r.abort().catch(() => {}); await page.unrouteAll({ behavior: "ignoreErrors" }); },
  };
}

/** กล่องเหตุผลกลาง: ว่าง → กดไม่ได้ · ช้า → กำลัง… กดซ้ำไม่ได้ · ผิดพลาด → ข้อความในกล่อง ไม่ปิด */
async function ตรวจกล่องเหตุผล(page: Page, จุด: string, เปิด: () => Promise<void>, o: { เลือกจากรายการ?: boolean } = {}) {
  await เปิด();
  const กล่อง = page.locator("[data-reason-dialog]");
  await expect(กล่อง, `${จุด}: ใช้กล่องเหตุผลกลาง`).toBeVisible({ timeout: 15_000 });
  const ยืนยัน = กล่อง.locator("[data-dialog-confirm]");
  await expect(ยืนยัน, `${จุด}: เหตุผลว่าง → ปุ่มยืนยันกดไม่ได้`).toBeDisabled();
  await expect(กล่อง.locator("[data-reason-hint]"), `${จุด}: บอกที่ช่องเหตุผลว่าทำไมกดไม่ได้`).toBeVisible();
  if (o.เลือกจากรายการ) {
    await กล่อง.locator("[data-lost-picker] button").first().click();
  } else {
    await กล่อง.locator("textarea").first().fill(`เหตุผลทดสอบ ${จุด}`);
  }
  await expect(ยืนยัน, `${จุด}: มีเหตุผลแล้ว → กดได้`).toBeEnabled();
  await expect(กล่อง.locator("[data-reason-hint]"), `${จุด}: มีเหตุผลแล้ว ไม่มีคำเตือน`).toHaveCount(0);
  await ตรวจรอฐาน(page, จุด, กล่อง, ยืนยัน);
}

/** กดยืนยันตอนฐานช้า → "กำลัง…" + กดซ้ำไม่ได้ (คำสั่งเขียนไม่เพิ่ม) → ฐานผิดพลาด → ข้อความในกล่อง กล่องยังอยู่ */
async function ตรวจรอฐาน(page: Page, จุด: string, กล่อง: Locator, ยืนยัน: Locator) {
  const ดัก = await ดักคำสั่งเขียน(page);
  try {
    const ป้ายเดิม = (await ยืนยัน.innerText()).trim();
    await ยืนยัน.click();
    await expect(ยืนยัน, `${จุด}: ฐานยังไม่ตอบ → ปุ่มขึ้น "กำลัง…"`).toHaveText(/กำลัง/);
    await expect(ยืนยัน, `${จุด}: ระหว่างรอ กดซ้ำไม่ได้`).toBeDisabled();
    await expect.poll(ดัก.นับ, { message: `${จุด}: คำสั่งเขียนออกไปแล้ว`, timeout: 10_000 }).toBeGreaterThan(0);
    // กดซ้ำแรง ๆ (ข้ามการกันของ Playwright) — ต้องไม่มีคำสั่งเขียนเพิ่ม
    await page.waitForTimeout(500);   // ช่วงสังเกต: คำสั่งที่ออกไปพร้อมกันจากการกดครั้งแรกต้องออกครบก่อนนับ (ไม่ใช่รอให้ผ่าน)
    const ก่อนกดซ้ำ = ดัก.ภาพ();
    await ยืนยัน.evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
    await page.waitForTimeout(800);   // ช่วงสังเกต: ถ้ากดซ้ำได้ คำสั่งเขียนใหม่จะออกภายในช่วงนี้
    const ซ้ำ = [...ดัก.ภาพ()].filter(([k, n]) => (ก่อนกดซ้ำ.get(k) ?? 0) > 0 && n > (ก่อนกดซ้ำ.get(k) ?? 0)).map(([k]) => k.slice(0, 160));
    expect(ซ้ำ, `${จุด}: กดซ้ำระหว่างรอ ไม่มีคำสั่งเดิมถูกส่งซ้ำ`).toEqual([]);
    const ใหม่ = [...ดัก.ภาพ().keys()].filter(k => !ก่อนกดซ้ำ.has(k)).map(k => k.slice(0, 160));
    expect(ใหม่, `${จุด}: กดซ้ำระหว่างรอ ไม่มีคำสั่งเขียนใหม่`).toEqual([]);
    await expect(กล่อง, `${จุด}: ระหว่างรอ กล่องยังอยู่`).toBeVisible();

    await ดัก.ตอบผิดพลาด();
    await expect(กล่อง.locator("[data-dialog-error]"), `${จุด}: ฐานผิดพลาด → ข้อความในกล่อง`).toContainText(ข้อผิดพลาดจำลอง, { timeout: 15_000 });
    await expect(กล่อง, `${จุด}: ฐานผิดพลาด → กล่องไม่ปิดเอง`).toBeVisible();
    await expect(ยืนยัน, `${จุด}: หลังผิดพลาด ปุ่มกลับมากดได้`).toBeEnabled();
    await expect(ยืนยัน).toHaveText(ป้ายเดิม);
  } finally { await ดัก.เลิก(); }
  await กล่อง.locator("[data-dialog-cancel]").click();
  await expect(กล่อง, `${จุด}: กดยกเลิกแล้วกล่องปิด`).toHaveCount(0);
}

// ══════════════════════════ ดีลเลอร์ ══════════════════════════
test.describe("ดีลเลอร์: กล่องเหตุผล + ปุ่มรอฐาน", () => {
  const ชื่อรอHQ = `ZZTEST-เหตุผลรอHQ-${แท็ก}`;
  const ชื่อได้ราคา = `ZZTEST-เหตุผลได้ราคา-${แท็ก}`;
  const ชื่อส่งใบ = `ZZTEST-เหตุผลส่งใบ-${แท็ก}`;
  const เลขรอHQ = เลขลูกค้าเป้าหมายทดสอบ();
  let ได้ราคา: ใบHQพร้อมใช้ | undefined, ส่งใบ: ใบHQพร้อมใช้ | undefined;

  test.beforeAll(async () => {
    const r = await admin.from("leads").insert({ id: `#L-${เลขรอHQ}`, num_id: เลขรอHQ, dealer_code: "RYG", company: ชื่อรอHQ, name: ชื่อรอHQ,
      contact: "ผู้ทดสอบ", phone: `08${String(เลขรอHQ).slice(-8)}`, province: "ระยอง", status: "BULLET", assigned: "ทดสอบระบบ" });
    expect(r.error, "ลีดรอราคา HQ").toBeNull();
    const ส่ง = await (await db(RYG)).rpc("quote_request_submit", { p_lead_num_id: เลขรอHQ, p_product: "โกดังทดสอบกล่องเหตุผล" });
    expect(ส่ง.error, "ส่งคำขอราคา").toBeNull();
    const บรรทัด = [{ name: "โครงเหล็กทดสอบกล่องเหตุผล", qty: 1, unit: "ชุด", unitCost: 40000 }];
    ได้ราคา = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อได้ราคา, province: "ระยอง", lines: บรรทัด, validDays: 30 });
    ส่งใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อส่งใบ, province: "ระยอง", lines: บรรทัด, validDays: 30 });
    const ใบ = await ทำใบลูกค้าจากใบHQ(RYG, ส่งใบ, { customer: ชื่อส่งใบ, markupPercent: 10 });
    const s = await (await db(RYG)).from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", ใบ.id);
    expect(s.error, "ใบลูกค้าส่งแล้ว").toBeNull();
  });
  test.afterAll(() => { ล้างใบHQทดสอบ("RYG", [เลขรอHQ, ...(ได้ราคา ? [ได้ราคา.leadNum] : []), ...(ส่งใบ ? [ส่งใบ.leadNum] : [])]); });

  async function เปิดแผงลีด(page: Page, ชื่อ: string) {
    await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").first().fill(ชื่อ);
    await page.locator("tbody tr").filter({ hasText: ชื่อ }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click({ timeout: 20_000 });
    await expect(page.locator('[data-panel="next-step"] [role="status"]')).toBeVisible({ timeout: 30_000 });
  }
  async function แท็บใบเสนอราคา(page: Page) {
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
  }

  test("[ux·dealer] ยกเลิกคำขอ · ปิดไม่สำเร็จ (รอราคา HQ): กล่องเหตุผลกลาง · ว่างกดไม่ได้ · ฐานช้า กำลัง… · ผิดพลาดในกล่อง", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await เปิดแผงลีด(page, ชื่อรอHQ);
    await แท็บใบเสนอราคา(page);
    await ตรวจกล่องเหตุผล(page, "ยกเลิกคำขอ", async () => {
      await page.getByRole("button", { name: "ยกเลิกคำขอ", exact: true }).click({ timeout: 30_000 });
    });
    await ตรวจกล่องเหตุผล(page, "ปิดไม่สำเร็จ", async () => {
      await page.locator('[data-panel="next-step"]').getByRole("button", { name: "ปิดไม่สำเร็จ" }).click();
    }, { เลือกจากรายการ: true });
    // ไม่มีอะไรถึงฐาน — คำขอยังรอ HQ อยู่
    const { data } = await admin.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", เลขรอHQ).single();
    expect(data?.status, "คำสั่งที่ดักไว้ไม่ถึงฐาน").toBe("HQ_PRICING");
  });

  test("[ux·dealer] ขอแก้ราคา: กล่องเหตุผลกลาง (มีช่องสเปก) · ว่างกดไม่ได้ · ฐานช้า กำลัง… · ผิดพลาดในกล่อง", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await เปิดแผงลีด(page, ชื่อได้ราคา);
    await แท็บใบเสนอราคา(page);
    await ตรวจกล่องเหตุผล(page, "ขอแก้ราคา", async () => {
      await page.getByRole("button", { name: "ขอแก้ราคา", exact: true }).click({ timeout: 30_000 });
      await expect(page.locator("[data-reason-dialog]").getByLabel("สเปกที่ขอแก้ราคา"), "ช่องสเปกอยู่ในกล่องเดียวกัน").toBeVisible();
    });
  });

  test("[ux·dealer] ลูกค้าปฏิเสธ (กล่องเหตุผล) · ลูกค้าตอบรับ (ปุ่มรอฐาน): ฐานช้า กำลัง… กดซ้ำไม่ได้ · ผิดพลาดในกล่อง", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await เปิดแผงลีด(page, ชื่อส่งใบ);
    const เปิดใบ = async () => {
      if (await page.locator("[data-customer-result]").first().isVisible()) return;
      await page.locator('[data-next-step="await_customer"]').click({ timeout: 30_000 });
      await expect(page.locator("[data-customer-result]").first()).toBeVisible({ timeout: 20_000 });
    };
    await ตรวจกล่องเหตุผล(page, "ลูกค้าปฏิเสธ", async () => {
      await เปิดใบ();
      await page.locator("[data-customer-result]").first().getByRole("button", { name: "ลูกค้าปฏิเสธ" }).click();
    }, { เลือกจากรายการ: true });

    // ลูกค้าตอบรับ = กล่องยืนยันรอฐาน (ไม่มีเหตุผล) — ปุ่มขึ้น "กำลัง…" แบบเดียวกัน
    await เปิดใบ();
    await page.locator("[data-customer-result]").first().getByRole("button", { name: "ลูกค้าตอบรับ" }).click();
    const กล่อง = page.getByRole("alertdialog", { name: /ลูกค้าตอบรับใบ/ });
    await expect(กล่อง).toBeVisible();
    await ตรวจรอฐาน(page, "ลูกค้าตอบรับ", กล่อง, กล่อง.locator("[data-dialog-confirm]"));
    const { data } = await admin.from("quotations").select("status").eq("dealer_code", "RYG").eq("deal_id", ส่งใบ!.leadNum);
    expect((data ?? []).map(q => q.status), "คำสั่งที่ดักไว้ไม่ถึงฐาน").toEqual(["sent_to_client"]);
  });
});

// ══════════════════════════ สำนักงานใหญ่ ══════════════════════════
test.describe("HQ: กล่องเหตุผล", () => {
  const NS = `ZZTEST-เหตุผลHQ-${แท็ก}`;
  const ชื่อตอบรับ = `ZZTEST-เหตุผลย้อน-${แท็ก}`;
  let ตอบรับ: ใบHQพร้อมใช้ | undefined;
  let ใบลูกค้า = "";
  let ใบปฏิเสธ = "", ใบชำระ = "", prospectId = 0;

  test.beforeAll(async () => {
    // ใบที่ลูกค้าตอบรับแล้ว (HQ ย้อนได้)
    ตอบรับ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อตอบรับ, province: "ระยอง", lines: [{ name: "โครงเหล็กทดสอบย้อน", qty: 1, unit: "ชุด", unitCost: 30000 }], validDays: 30 });
    ใบลูกค้า = (await ทำใบลูกค้าจากใบHQ(RYG, ตอบรับ, { customer: ชื่อตอบรับ, markupPercent: 10 })).id;
    const ส่ง = await (await db(RYG)).from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", ใบลูกค้า);
    expect(ส่ง.error, "ใบส่งแล้ว").toBeNull();
    // ลูกค้าตอบรับ = ทางเดียวกับแอป (ปิดการขายทั้งก้อน: สร้างลูกค้า + ใบเป็น won · ฐานบังคับใบ won ต้องมีลูกค้า)
    const ชนะ = await (await db(RYG)).rpc("close_won_quotation", {
      p_dealer: "RYG", p_known_customer_id: null, p_lead_company: ชื่อตอบรับ, p_target_quote_id: ใบลูกค้า, p_cascade_won: false,
      p_customer_payload: { company: ชื่อตอบรับ, contact: "ผู้ทดสอบ", phone: `08${String(ตอบรับ.leadNum).slice(-8)}`, province: "ระยอง" },
    });
    expect(ชนะ.error, "ใบลูกค้าตอบรับ (ข้อมูลตั้งต้น)").toBeNull();

    // ผู้สนใจ + ใบค่าแฟรนไชส์ที่ส่งแล้ว (ปฏิเสธได้) + ใบที่ตอบรับและมีการชำระ (ยกเลิกการชำระได้)
    const sb = await db(ADMIN);
    const p = await sb.from("dealer_prospects").insert({ name: `${NS}-ผู้สนใจ`, province: "ระยอง", status: "meeting" }).select("id").single();
    expect(p.error, "ผู้สนใจ").toBeNull();
    prospectId = (p.data as { id: number }).id;
    const ส่งแล้ว = await sb.from("dealer_package_proposals").insert({ prospect_id: prospectId, package: "standard", status: "sent", proposed_date: "2026-10-01", contract_months: 12, annual_target: 12_000_000 })
      .select("id, proposal_no").single();
    expect(ส่งแล้ว.error, "ใบค่าแฟรนไชส์ที่ส่งแล้ว").toBeNull();
    ใบปฏิเสธ = (ส่งแล้ว.data as { proposal_no: string }).proposal_no;
    const p2 = await sb.from("dealer_prospects").insert({ name: `${NS}-ชำระ`, province: "ระยอง", status: "meeting" }).select("id").single();
    expect(p2.error).toBeNull();
    const ชำระ = await sb.from("dealer_package_proposals").insert({ prospect_id: (p2.data as { id: number }).id, package: "standard", status: "sent", proposed_date: "2026-10-01", contract_months: 12, annual_target: 12_000_000, amount: 100_000 })
      .select("id, proposal_no").single();
    expect(ชำระ.error, "ใบที่จะชำระ").toBeNull();
    const ชำระId = (ชำระ.data as { id: number }).id;
    ใบชำระ = (ชำระ.data as { proposal_no: string }).proposal_no;
    expect((await sb.from("dealer_package_proposals").update({ status: "accepted" }).eq("id", ชำระId)).error, "ตอบรับใบ").toBeNull();
    const จ่าย = await sb.from("dealer_proposal_payments").insert({ proposal_id: ชำระId, paid_on: "2026-10-02", amount: 50_000, reference: `TR-ZZR-${แท็ก}` });
    expect(จ่าย.error, "บันทึกการชำระ (ข้อมูลตั้งต้น)").toBeNull();
  });
  test.afterAll(async () => {
    if (ตอบรับ) {
      const { data: cs } = await admin.from("customers").select("id").eq("dealer_code", "RYG").eq("company", ชื่อตอบรับ);
      ล้างใบHQทดสอบ("RYG", [ตอบรับ.leadNum]);
      for (const c of cs ?? []) await admin.from("customers").delete().eq("dealer_code", "RYG").eq("id", c.id);
    }
    await admin.from("dealer_prospects").delete().like("name", `${NS}%`);
  });

  test("[ux·hq] ย้อนการตอบรับ: กล่องเหตุผลกลาง · ว่างกดไม่ได้ · ฐานช้า กำลัง… · ผิดพลาดในกล่อง", async ({ page }) => {
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(ใบลูกค้า);
    const แถว = page.locator("tbody tr").filter({ hasText: ใบลูกค้า }).first();
    await expect(แถว).toBeVisible({ timeout: 25_000 });
    await แถว.getByRole("button", { name: /ดู/ }).first().click();
    const แผง = page.getByRole("dialog", { name: "รายละเอียดใบเสนอราคา" });
    await ตรวจกล่องเหตุผล(page, "ย้อนการตอบรับ", async () => {
      await แผง.getByRole("button", { name: "ย้อนเป็นส่งให้ลูกค้าแล้ว" }).click();
    });
    const { data } = await admin.from("quotations").select("status").eq("dealer_code", "RYG").eq("id", ใบลูกค้า).single();
    expect(data?.status, "คำสั่งที่ดักไว้ไม่ถึงฐาน").toBe("won");
  });

  test("[ux·hq] ผู้สนใจไม่สำเร็จ · ปฏิเสธใบค่าแฟรนไชส์ · ยกเลิกการชำระ: กล่องเหตุผลกลาง · ว่างกดไม่ได้ · ฐานช้า กำลัง… · ผิดพลาดในกล่อง", async ({ page }) => {
    await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
    await page.getByLabel("ค้นหาผู้สนใจ").fill(`${NS}-ผู้สนใจ`);
    await page.getByRole("row", { name: new RegExp(`${NS}-ผู้สนใจ`) }).click({ timeout: 25_000 });
    const แผง = page.getByRole("dialog", { name: "ข้อมูลผู้สนใจ" });
    await ตรวจกล่องเหตุผล(page, "ผู้สนใจไม่สำเร็จ", async () => {
      await แผง.getByRole("tab", { name: "งาน/ความคืบหน้า" }).click();
      await แผง.getByRole("button", { name: "ไม่สำเร็จ", exact: true }).click({ timeout: 20_000 });
    });
    await ตรวจกล่องเหตุผล(page, "ปฏิเสธใบค่าแฟรนไชส์", async () => {
      await แผง.getByRole("tab", { name: /ใบค่าแฟรนไชส์/ }).click();
      await แผง.getByLabel(`สถานะใบ ${ใบปฏิเสธ}`).selectOption("rejected");
    });

    await page.goto(`${HQ_ORIGIN}/hq/proposals?q=${encodeURIComponent(ใบชำระ)}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("row", { name: new RegExp(`เปิดใบค่าแฟรนไชส์ ${ใบชำระ} `) }).first().click({ timeout: 25_000 });
    const ชำระ = page.getByRole("region", { name: `การชำระ ${ใบชำระ}` });
    await ตรวจกล่องเหตุผล(page, "ยกเลิกการชำระ", async () => {
      await ชำระ.getByRole("button", { name: `ยกเลิกการชำระ TR-ZZR-${แท็ก}` }).click({ timeout: 20_000 });
    });

    const sb = await db(ADMIN);
    expect((await sb.from("dealer_prospects").select("status").eq("id", prospectId).single()).data?.status, "ผู้สนใจไม่ถูกปิด (ใบที่ส่งแล้วทำให้ฐานขยับเป็นกำลังพิจารณาเอง)").not.toBe("lost");
    expect((await sb.from("dealer_package_proposals").select("status").eq("proposal_no", ใบปฏิเสธ).single()).data?.status, "ใบไม่ถูกปฏิเสธ").toBe("sent");
    expect((await sb.from("dealer_proposal_payments").select("cancelled_at").eq("reference", `TR-ZZR-${แท็ก}`).single()).data?.cancelled_at, "การชำระไม่ถูกยกเลิก").toBeNull();
  });
});
