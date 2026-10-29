import { test, expect, type Page } from "@playwright/test";
import { สร้างสาขาของข้อ } from "./ownDealer";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── รอบ 2 ช่วง ก: ความปลอดภัยก่อน (บอสตัดสิน 19 ต.ค. 69 · docs/FLOW.html · docs/archive/ตารางเทียบ-flow-รอบ1.md) ─────────────
//   1) /reset-password ปิด (เปิด URL แล้วถูกพาไปหน้าหลัก) · เปลี่ยนรหัสได้ที่หน้าบัญชีเท่านั้น (ทางลัดเดิม 2 ทาง ตอบ 410)
//   2) ใบที่ลูกค้าตอบรับแล้ว: ไม่มีปุ่มแก้ไข / ลบ / ทำสำเนา (ทำสำเนาใบ won ไม่ได้ใบร่างจริง — ฐานปฏิเสธ)
//   3) ลีดที่ปิดการขายสำเร็จ: ไม่มีปุ่ม "เปิดใหม่" ฝั่งดีลเลอร์ · ฐานกัน (ใบ 0217)
//   4) HQ ย้อนการตอบรับ → ลีดกลับเป็นสถานะก่อนปิดการขาย (ใบ 0217)
//   6) ลบลีดได้เฉพาะลีดที่ยังไม่มีคำขอราคา/ใบ (มีแล้วไม่มีปุ่ม · ฐานบอกให้ใช้ "เสียโอกาส") · ไม่มีปุ่มลบลูกค้า
//   ข้อทดสอบระดับฐาน: supabase/tests/lead_close_rules.sql (รันใน db-rule-tests.spec.ts)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(180_000);

const admin = adminClient();
const แท็ก = `${Date.now() % 100000}`;

async function เปิดแผงลีด(page: Page, company: string) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(company);
  const แถว = page.locator("tbody tr").filter({ hasText: company }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  return แถว;
}

test.describe("หน้าตั้งรหัสผ่านใหม่และทางลัดเปลี่ยนรหัส", () => {
  test("[ก·1] เปิด /reset-password ทั้งสองแอป ถูกพาไปหน้าหลัก (ยังไม่เข้าระบบ = หน้าเข้าสู่ระบบ) ไม่มีช่องตั้งรหัสใหม่", async ({ page }) => {
    for (const [origin, ปลายทาง] of [[DEALER_ORIGIN, /\/login$|\/dashboard$/], [HQ_ORIGIN, /\/hq\/login$|\/hq\/dashboard$/]] as const) {
      await page.goto(`${origin}/reset-password`, { waitUntil: "domcontentloaded" });
      await expect(page, `${origin}/reset-password ต้องถูกพาออก`).toHaveURL(ปลายทาง, { timeout: 20_000 });
      await expect(page.getByText("ตั้งรหัสผ่านใหม่", { exact: true })).toHaveCount(0);
    }
  });

  test("[ก·1] ดีลเลอร์ที่เข้าระบบอยู่ เปิด /reset-password → หน้าหลัก", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/reset-password`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await expect(page.locator("input[type=password]"), "ต้องไม่มีช่องตั้งรหัสใหม่").toHaveCount(0);
  });

  test("[ก·1] ทางลัดเปลี่ยนรหัสโดยไม่ใส่รหัสเดิม (reset-done · first-password) ตอบ 410 · รหัสผ่านไม่เปลี่ยน", async ({ request }) => {
    // บัญชีของสาขาของข้อเอง — นับประวัติเปลี่ยนรหัสของสาขานี้อย่างเดียว ไม่ปนข้ออื่น (29 ต.ค. 69 · คิวข้อ 3)
    const สาขา = await สร้างสาขาของข้อ();
    try {
      const sb = await db(สาขา.บัญชี);
      const token = (await sb.auth.getSession()).data.session?.access_token ?? "";
      const หัว = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      const ก่อน = (await admin.from("dealer_account_changes").select("id", { count: "exact", head: true }).eq("dealer_code", สาขา.รหัส)).count ?? 0;
      const r1 = await request.post(`${HQ_ORIGIN}/api/account/reset-done`, { headers: หัว, data: {} });
      expect(r1.status(), "reset-done ต้องปิด").toBe(410);
      const r2 = await request.post(`${HQ_ORIGIN}/api/account`, { headers: หัว, data: { op: "first-password", password: `ZZtest-ใหม่-${แท็ก}` } });
      expect(r2.status(), "first-password ต้องปิด").toBe(410);
      const หลัง = (await admin.from("dealer_account_changes").select("id", { count: "exact", head: true }).eq("dealer_code", สาขา.รหัส)).count ?? 0;
      expect(หลัง, "ไม่มีประวัติเปลี่ยนรหัสเพิ่ม").toBe(ก่อน);
      // รหัสเดิมยังเข้าได้
      const { error } = await (await db(สาขา.บัญชี)).auth.signInWithPassword({ email: สาขา.บัญชี.email, password: สาขา.บัญชี.password });
      expect(error, "รหัสเดิมต้องยังใช้ได้").toBeNull();
    } finally { await สาขา.ลบ(); }
  });
});

test.describe("ปิดการขาย: ใบที่ตอบรับแล้ว · ลีดที่ปิดแล้ว · HQ ย้อน", () => {
  test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก (ใช้ตอนพิสูจน์ว่าตกได้จริง)
  const บริษัท = `ZZTEST-ปิดงานช่วงก-${แท็ก}`;
  let ใบ: ใบHQพร้อมใช้;
  let ใบลูกค้า = "";

  test.beforeAll(async () => {
    ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: บริษัท, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 50000 }] });
    ใบลูกค้า = (await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: บริษัท, markupPercent: 10 })).id;
    const sb = await db(RYG);
    const s = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", ใบลูกค้า);
    if (s.error) throw new Error(s.error.message);
    // ลีดอยู่ขั้นที่ไม่ใช่ค่าตั้งต้นก่อนปิด — ใช้พิสูจน์ว่า HQ ย้อนแล้วกลับไปที่ขั้นเดิม (ไม่ใช่ค่าตั้งต้น "เสนอราคา")
    //   ใบ 0232: ดีลเลอร์ตั้งสถานะเองไม่ได้แล้ว จึงวาง "รวบรวมความต้องการ" ด้วยกุญแจฝั่งเซิร์ฟเวอร์เป็นข้อมูลตั้งต้น
    //   (เดิมใช้ "เจรจาต่อรอง" — เลิกใช้แล้ว ฐานไม่รับทุกทาง ใบ 0257 · ตรวจท้ายข้อแรก) · ตัวกันของดีลเลอร์ตรวจแยกท้ายข้อแรก
    const { data: l } = await admin.from("leads").select("id").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single();
    const n = await admin.from("leads").update({ status: "BULLET" }).eq("dealer_code", "RYG").eq("id", l!.id).select("status").single();
    if (n.error) throw new Error(`วางสถานะรวบรวมความต้องการ (ข้อมูลตั้งต้น) ไม่สำเร็จ: ${n.error.message}`);
    const ตั้งเอง = await sb.rpc("lead_apply", { p_id: l!.id, p_intent: { stage: { status: "QUOTED" } } });
    if (!/lead_status_one_path/.test(ตั้งเอง.error?.message ?? "")) throw new Error(`ฐานต้องไม่ให้ดีลเลอร์ตั้งสถานะเอง: ${ตั้งเอง.error?.message ?? "ผ่าน"}`);
  });
  test.afterAll(async () => {
    if (!ใบ) return;
    const { data: cs } = await admin.from("customers").select("id").eq("dealer_code", "RYG").eq("company", บริษัท);
    ล้างใบHQทดสอบ("RYG", [ใบ.leadNum]);
    for (const c of cs ?? []) await admin.from("customers").delete().eq("dealer_code", "RYG").eq("id", c.id);
  });

  test("[ก·3][ก·2] ดีลเลอร์ปิดการขาย → แผงลีดไม่มี \"เปิดใหม่\" · ใบที่ตอบรับไม่มีแก้ไข/ทำสำเนา/ลบ · ฐานกันย้อนลีด", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    const แถว = await เปิดแผงลีด(page, บริษัท);
    await แถว.locator("td").first().click();
    // รอบ 4: ปิดสำเร็จทางเดียว = ลูกค้าตอบรับที่ใบในแท็บใบเสนอราคาของแผงลีด
    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    await page.locator("[data-customer-result]").getByRole("button", { name: /ลูกค้าตอบรับ/ }).first().click({ timeout: 20_000 });
    await กดตกลงในกล่องยืนยัน(page).catch(() => "");
    await expect.poll(async () => (await admin.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single()).data?.status,
      { timeout: 20_000, message: "ลีดต้องเป็นปิดการขายสำเร็จ" }).toBe("PAID");
    await expect(page.getByRole("status", { name: "ขั้นต่อไป" }).getByText("ปิดการขายสำเร็จ").first(), "กล่องขั้นต่อไปบอกว่าปิดสำเร็จแล้ว").toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /เปิดใหม่/ }), "ไม่มีปุ่มเปิดใหม่บนลีดที่ปิดการขายแล้ว").toHaveCount(0);

    await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
    const แถวใบ = page.locator("div").filter({ hasText: /ตอบรับ/ }).filter({ has: page.getByRole("button", { name: "ดู" }) }).last();
    await expect(แถวใบ.getByRole("button", { name: "ดู" })).toBeVisible({ timeout: 15_000 });
    for (const ป้าย of ["แก้ไข", "ทำสำเนา", "ลบ"]) {
      await expect(แถวใบ.getByRole("button", { name: ป้าย, exact: true }), `ใบที่ตอบรับแล้วต้องไม่มีปุ่ม ${ป้าย}`).toHaveCount(0);
    }

    // ฐานกัน: ดีลเลอร์พาลีดออกจากปิดการขายสำเร็จไม่ได้ (ทางเดียวกับปุ่มเปิดใหม่เดิม)
    const { data: l } = await admin.from("leads").select("id").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single();
    const r = await (await db(RYG)).rpc("lead_apply", { p_id: l!.id, p_intent: { stage: { status: "QUOTED" } } });
    expect(r.error?.message ?? "", "ฐานต้องปฏิเสธ").toContain("lead_won_locked");
    // "เจรจาต่อรอง" / "ติดตามผล" ทำไม่ได้แล้ว — แม้กุญแจฝั่งเซิร์ฟเวอร์ (ใบ 0257 · เดิมข้อนี้ใช้ตั้งสถานะนั้นเป็นข้อมูลตั้งต้น)
    for (const เก่า of ["NEGO", "FOLLOWUP"]) {
      const x = await admin.from("leads").update({ status: เก่า }).eq("dealer_code", "RYG").eq("id", l!.id);
      expect(x.error?.message ?? "", `กุญแจเซิร์ฟเวอร์ตั้ง ${เก่า} ต้องถูกปฏิเสธ`).toContain("lead_status_retired");
    }
  });

  test("[ก·2] หน้าใบเสนอราคา: ใบที่ตอบรับแล้วไม่มีแก้ไข/ลบ ทั้งในรายการและแผงรายละเอียด", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    // 28 ต.ค. 69: ลิงก์ ?open=<เลขใบ> / กดแถว = เปิดแผงดูใบในหน้าเดิม (ดูอย่างเดียว) · งานของใบทำที่แผงลีด (ปุ่ม "ไปแผงลีด")
    //   ตรวจแผงดูใบไม่มีปุ่มแก้/ลบ + แผงที่ปุ่มพาไป + แถวของหน้ารายการ
    await page.goto(`${DEALER_ORIGIN}/quotations?open=${encodeURIComponent(ใบลูกค้า)}`, { waitUntil: "domcontentloaded" });
    const แผงดูใบ = page.locator(`[data-quote-view="${ใบลูกค้า}"]`);
    await expect(แผงดูใบ, "?open= เปิดแผงดูใบในหน้าเดิม").toBeVisible({ timeout: 25_000 });
    for (const ป้าย of ["แก้ไข", "ทำสำเนา", "ลบ"])
      await expect(แผงดูใบ.getByRole("button", { name: ป้าย, exact: true }), `แผงดูใบ: ไม่มีปุ่ม${ป้าย}`).toHaveCount(0);
    // ใบที่ตอบรับแล้ว = งานของลูกค้าแล้ว → ปุ่มพาไปแผงลีด แล้วแผงลีดพาไปแผงลูกค้า (รอบ 4) · แผงนั้นต้องไม่มีปุ่มแก้ไข/ลบใบ
    //   (ปุ่มของใบ won ในแผงลีดตรวจแล้วในข้อก่อนหน้า)
    await แผงดูใบ.locator("[data-goto-lead]").click();
    await page.waitForURL(/\/customers/, { timeout: 25_000 });
    await expect(page.getByRole("button", { name: /พิมพ์ข้อมูล/ }), "แผงลูกค้าเปิด").toBeVisible({ timeout: 20_000 });
    await expect(page.getByTitle("ลบใบเสนอราคา"), "แผงลูกค้า: ไม่มีปุ่มลบใบ").toHaveCount(0);
    await expect(page.getByRole("button", { name: "แก้ไข", exact: true }), "แผงลูกค้า: ไม่มีปุ่มแก้ไขใบ").toHaveCount(0);
    await expect(page.getByRole("button", { name: "ทำสำเนา", exact: true }), "แผงลูกค้า: ไม่มีปุ่มทำสำเนาใบ").toHaveCount(0);
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(บริษัท);
    const แถว = page.locator("tbody tr").filter({ hasText: ใบลูกค้า }).first();
    await expect(แถว).toBeVisible({ timeout: 20_000 });
    await expect(แถว.getByTitle("แก้ไข"), "แถวใบ won ไม่มีแก้ไข").toHaveCount(0);
    await expect(แถว.getByTitle("ลบใบเสนอราคา"), "แถวใบ won ไม่มีลบ").toHaveCount(0);
  });

  test("[ก·2] หลักฐาน: ทำสำเนาใบที่ตอบรับแล้ว ไม่ได้ใบร่างใหม่ — ฐานปฏิเสธ (จึงเอาปุ่มออก)", async () => {
    const sb = await db(RYG);
    const { data: hq } = await admin.from("hq_quotes").select("status").eq("id", ใบ.hqQuoteId).single();
    expect(hq?.status, "ใบ HQ ของงานที่ตอบรับแล้วเป็นสั่งผลิต").toBe("ordered");
    const r = await sb.rpc("create_quotation", { p_dealer: "RYG", p_prefix: "Q-", p_payload: {
      customer: บริษัท, project: บริษัท, total: "0", status: "draft", line_items: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitPrice: 0, markupPct: 10 }],
      items: 1, hq_quote_id: ใบ.hqQuoteId, deal_id: ใบ.leadNum } });
    expect(r.error?.message ?? "", "สำเนาของใบ won ต้องถูกปฏิเสธ").toMatch(/hq_quote_required|ใบ HQ|lead_closed/);
  });

  test("[ก·4] HQ ย้อนการตอบรับ → ลีดกลับเป็น \"รวบรวมความต้องการ\" (สถานะก่อนปิดการขาย)", async ({ page }) => {
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(ใบลูกค้า);
    const แถว = page.locator("tbody tr").filter({ hasText: ใบลูกค้า }).first();
    await expect(แถว).toBeVisible({ timeout: 25_000 });
    await แถว.getByRole("button", { name: /ดู/ }).first().click();
    const แผง = page.getByRole("dialog", { name: "รายละเอียดใบเสนอราคา" });
    await แผง.getByRole("button", { name: "ย้อนเป็นส่งให้ลูกค้าแล้ว" }).click();
    const ถาม = page.getByRole("alertdialog", { name: /ย้อนการตอบรับใบ/ });
    await ถาม.getByLabel("เหตุผลที่ย้อน").fill("ทดสอบช่วงก ลูกค้าขอเลื่อน");
    await ถาม.getByRole("button", { name: "ย้อนการตอบรับ" }).click();
    await expect.poll(async () => (await admin.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single()).data?.status,
      { timeout: 20_000, message: "ลีดต้องกลับเป็นรวบรวมความต้องการ" }).toBe("BULLET");
    const { data: l } = await admin.from("leads").select("activities").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single();
    expect(JSON.stringify(l?.activities ?? []), "ไทม์ไลน์บอกว่าลีดกลับเป็นอะไร").toContain("ลูกค้าเป้าหมายกลับเป็น");
  });
});

test.describe("ลบลีด / ลบลูกค้า", () => {
  test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก (ใช้ตอนพิสูจน์ว่าตกได้จริง)
  const มีคำขอ = `ZZTEST-ลบไม่ได้ช่วงก-${แท็ก}`;
  const เปล่า = `ZZTEST-ลบได้ช่วงก-${แท็ก}`;
  let ใบ: ใบHQพร้อมใช้;
  let เลขเปล่า = 0;

  test.beforeAll(async () => {
    ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: มีคำขอ, province: "ระยอง", lines: [{ name: "หลังคาชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 1000 }] });
    เลขเปล่า = เลขลูกค้าเป้าหมายทดสอบ();
    const r = await (await db(RYG)).from("leads").insert({ id: `#L-${เลขเปล่า}`, num_id: เลขเปล่า, dealer_code: "RYG", company: เปล่า, name: เปล่า,
      contact: "ผู้ทดสอบ", phone: `08${String(เลขเปล่า).slice(-8)}`, province: "ระยอง", status: "WAITING" });
    if (r.error) throw new Error(r.error.message);
  });
  test.afterAll(async () => { if (ใบ) ล้างใบHQทดสอบ("RYG", [ใบ.leadNum, เลขเปล่า]); });

  test("[ก·6] ลีดที่มีคำขอราคาแล้ว: ไม่มีปุ่มลบ (แถว + แผง) · ฐานปฏิเสธพร้อมบอกให้ใช้ \"เสียโอกาส\"", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    const แถว = await เปิดแผงลีด(page, มีคำขอ);
    await expect(แถว.getByTitle("ลบลูกค้าเป้าหมาย"), "แถวไม่มีปุ่มลบ").toHaveCount(0);
    await แถว.locator("td").first().click();
    await expect(page.getByRole("button", { name: "ประวัติ", exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle("ลบ", { exact: true }), "แผงไม่มีปุ่มลบ").toHaveCount(0);
    const { error } = await (await db(RYG)).from("leads").delete().eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum);
    expect(error?.message ?? "", "ฐานต้องปฏิเสธ").toContain("เสียโอกาส");
  });

  test("[ก·6] ลีดที่ยังไม่มีคำขอ/ใบ: มีปุ่มลบ และลบได้จริง", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    const แถว = await เปิดแผงลีด(page, เปล่า);
    // ตารางตามรูป (บอสสั่ง 28 ต.ค. 69): ลีดที่ยังไม่มีคำขอ/ใบ มีปุ่มลบในแถวด้วย · ข้อนี้ลบผ่านหัวแผงลีด
    await expect(แถว.getByTitle("ลบลูกค้าเป้าหมาย"), "แถวมีปุ่มลบ").toHaveCount(1);
    await แถว.locator("td").first().click();
    await page.getByTitle("ลบ", { exact: true }).click({ timeout: 20_000 });
    await page.getByText(/ต้องการลบ/).locator("xpath=following-sibling::div[1]").getByRole("button", { name: "ลบ", exact: true }).click();
    await expect.poll(async () => (await admin.from("leads").select("id").eq("dealer_code", "RYG").eq("num_id", เลขเปล่า)).data?.length ?? -1,
      { timeout: 20_000, message: "ลีดเปล่าต้องถูกลบ" }).toBe(0);
  });

  test("[ก·6] หน้าลูกค้า: ไม่มีปุ่มลบลูกค้า ทั้งในตารางและแผงรายละเอียด", async ({ page }) => {
    await loginUI(page, DEALER_ORIGIN, "/login", RYG);
    await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
    await settle(page);
    const แถว = page.locator("tbody tr").first();
    await expect(แถว).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTitle("ลบลูกค้า"), "ตารางไม่มีปุ่มลบลูกค้า").toHaveCount(0);
    await แถว.getByTitle("ดูรายละเอียด").click();
    await expect(page.getByRole("button", { name: /พิมพ์ข้อมูล/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle("ลบลูกค้า"), "แผงไม่มีปุ่มลบลูกค้า").toHaveCount(0);
  });
});
