// ── ใบเสนอราคาเก็บเป็นเวอร์ชัน + ทุกการกระทำลงไทม์ไลน์ (บอสสั่ง 21 ส.ค. 69) ──────
//
// สามเรื่องที่ต้องจริง:
//   1. ใบร่างแก้กี่รอบก็ยัง V1 · ส่งให้ลูกค้าแล้วล็อกทั้งใบ ไม่มีปุ่มแก้ไข
//      (เดิม 21 ส.ค. 69: แก้ใบที่ส่งแล้ว → ขึ้น V2 · รอบ 3 บอสสั่ง 20 ต.ค. 69 "ส่งลูกค้าแล้วล็อกทั้งหมด" กันที่ฐาน ใบ 0226)
//   2. ออกใบ/ส่งใบ/แก้ใบ ต้องไปโผล่ในไทม์ไลน์ของดีล ไม่ใช่หายไปเฉย ๆ
//   3. ไทม์ไลน์เรียงเก่า→ใหม่ (บนสุดคือเหตุการณ์แรก)
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, cleanup, specNS, nsTag, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";

const NS = specNS("QVER");
const tg = nsTag(NS);
const COMPANY = tg("เวอร์ชันใบ");

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(300_000);
test.describe.configure({ mode: "serial" });

async function seedLead() {
  const sb = await db(RYG);
  const numId = 960000 + (Date.now() % 9000);
  const { data: journey } = await sb.from("hq_sales_journey").select("tasks").eq("id", 1).maybeSingle();
  const tpl = (journey?.tasks as { key: string; label: string }[] | null) ?? [];
  const ถึงออกใบ = tpl.findIndex(t => t.key === "makeQuote");
  await sb.from("leads").insert({ phone: "081-999-0101",
    id: `#L-${numId}`, num_id: numId, dealer_code: "RYG", company: COMPANY, name: COMPANY,
    contact: "ผู้ทดสอบ", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET",
    value: "800000", area: "200", assigned: "ผู้ทดสอบ",
    tasks: tpl.map((t, i) => ({ key: t.key, label: t.label, done: ถึงออกใบ >= 0 && i < ถึงออกใบ,
      ...(ถึงออกใบ >= 0 && i < ถึงออกใบ ? { doneAt: "1 ส.ค. 2569 · 10:00", doneBy: "ผู้ทดสอบ" } : {}) })),
  });
}
test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); await seedLead(); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

async function เปิดแท็บใบเสนอราคา(page: import("@playwright/test").Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click();
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
}

test("[func] ใบร่างแก้แล้วยัง V1 · ส่งแล้วไม่มีปุ่มแก้ไข · ทุกขั้นลงไทม์ไลน์ · เรียงเก่าไปใหม่", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });

  // ออกใบ (V1) — ด่าน 3: ทำจากใบ HQ (ได้ใบ HQ ก่อน แล้วกด "ทำใบเสนอราคาจากใบ HQ")
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);
  await page.getByRole("button", { name: /^(สร้างใบเสนอราคา|บันทึก)$/ }).last().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("id,revision,status").eq("customer", COMPANY)).data?.length ?? 0,
    { timeout: 30_000, message: "ต้องมีใบเสนอราคาใน DB" }).toBeGreaterThan(0);

  // ใบร่าง: แก้ % ได้ ยังเป็น V1
  await page.getByRole("button", { name: "แก้ไข", exact: true }).first().click();
  await page.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("15");
  await page.getByRole("button", { name: /^(บันทึก|สร้างใบเสนอราคา)$/ }).last().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("markup_percent, line_items").eq("customer", COMPANY).limit(1).single()).data?.line_items?.[0]?.markupPct,
    { timeout: 30_000, message: "ใบร่าง: แก้ % ลงฐาน" }).toBe(15);
  expect((await sb.from("quotations").select("revision").eq("customer", COMPANY).limit(1).single()).data?.revision, "ใบร่างแก้แล้วยัง V1").toBe("V1");

  // ส่งให้ลูกค้า — รอบ 4: ปุ่มในกล่องขั้นต่อไปที่เดียว (ยืนยันก่อนส่ง)
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("customer", COMPANY).limit(1).single()).data?.status,
    { timeout: 30_000, message: "ใบต้องถูกส่งจริง" }).toBe("sent_to_client");

  // ⚠️ ต้องรอให้ "หน้าจอ" เห็นว่าใบถูกส่งแล้วด้วย ไม่ใช่รอแค่ฐานข้อมูล (เจอเคสวูบ 7 ก.ย. 69)
  //    ปุ่มแก้ไขซ่อนตามสถานะใบที่หน้าจอถืออยู่ — ตรวจก่อนหน้าจอรีเฟรชจะยังเห็นปุ่มของใบร่าง
  await expect(page.getByText("ส่งแล้ว").first()).toBeVisible({ timeout: 20_000 });
  // และรอให้ "ร่องรอยการส่ง" ลงไทม์ไลน์จริงก่อนไปขั้นถัดไป — การเขียนกิจกรรมเป็นงานเบื้องหลัง
  //   ถ้าไปกดแก้ทับระหว่างที่ยังเขียนไม่เสร็จ บรรทัดนี้จะหายไปเลย (คนละเรื่องกับที่เทสต์ตั้งใจตรวจ)
  await expect.poll(async () => {
    const l = (await sb.from("leads").select("activities").eq("company", COMPANY).single())
      .data as { activities?: { text: string }[] };
    return (l.activities ?? []).map(a => a.text).join(" | ");
  }, { timeout: 30_000, message: "ร่องรอย 'ส่งใบให้ลูกค้า' ต้องลงไทม์ไลน์ก่อน" }).toMatch(/ส่งใบเสนอราคา \S+ \(V1\) ให้ลูกค้า/);

  // ส่งแล้ว = ล็อกทั้งใบ: ไม่มีปุ่มแก้ไขในแผงใบเสนอราคา · ยังเป็น V1
  await expect(page.getByRole("button", { name: "แก้ไข", exact: true }), "ใบที่ส่งแล้วไม่มีปุ่มแก้ไข").toHaveCount(0);
  expect((await sb.from("quotations").select("revision").eq("customer", COMPANY).limit(1).single()).data?.revision, "ส่งแล้วยัง V1").toBe("V1");

  // ไทม์ไลน์: ต้องมีร่องรอยครบ และเรียงเก่า→ใหม่
  // ⚠️ การบันทึกกิจกรรมเป็นการเขียนเบื้องหลัง (ไม่บล็อกหน้าจอ) — ต้องรอให้ลงจริง ไม่ใช่อ่านครั้งเดียวแล้วตัดสิน
  //    (อ่านเร็วไปแล้วเคยสรุปผิดว่า "ระบบไม่บันทึกให้" ทั้งที่แค่ยังเขียนไม่เสร็จ)
  await expect.poll(async () => {
    const l = (await sb.from("leads").select("activities").eq("company", COMPANY).single())
      .data as { activities?: { text: string }[] };
    return (l.activities ?? []).map(a => a.text).join(" | ");
  }, { timeout: 30_000, message: "ต้องมีร่องรอยครบทั้งออกใบ/ส่งใบ" })
    .toMatch(/ออกใบเสนอราคา[\s\S]*ส่งใบเสนอราคา \S+ \(V1\) ให้ลูกค้า/);

  const lead = (await sb.from("leads").select("activities").eq("company", COMPANY).single())
    .data as { activities?: { id: number; text: string; date?: string }[] };
  const รายการ = lead.activities ?? [];
  const ids = รายการ.map(a => Number(a.id));
  expect(ids, "ไทม์ไลน์ต้องเก็บเรียงเก่า→ใหม่").toEqual([...ids].sort((a, b) => a - b));

  // ทุกบรรทัดต้องบอก "วันและเวลา" (บอสสั่ง 21 ส.ค. 69) — ไม่ใช่มีแต่วัน
  for (const a of รายการ) {
    expect(a.date ?? "", `กิจกรรมต้องมีวันและเวลา: ${a.text}`).toMatch(/\d{1,2} \S+ \d{4} · \d{2}:\d{2}/);
  }
});

test("[ui] หน้าใบเสนอราคาแสดงเลขฉบับ (V1/V2) คู่กับเลขที่ใบ", async ({ page }) => {
  // บอสสั่ง 21 ส.ค. 69 — ต้องรู้จากหน้ารายการเลยว่าใบไหนแก้มากี่รอบแล้ว
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.locator("tbody tr").first()).toBeVisible({ timeout: 30_000 });

  const ฉบับ = await page.locator("tbody tr .badge").evaluateAll(bs =>
    bs.map(b => (b.textContent ?? "").trim()).filter(t => /^V\d+$/.test(t)));
  expect(ฉบับ.length, "ทุกแถวต้องมีป้ายฉบับ (V1/V2/…)").toBeGreaterThan(0);

  // ใบของเทสต์ก่อนหน้า (แก้ตอนเป็นใบร่าง แล้วส่ง) ต้องโชว์ V1 — ส่งแล้วแก้ไม่ได้ จึงไม่มีฉบับใหม่ (รอบ 3 · ใบ 0226)
  const ฉบับใบนี้ = await page.locator("tbody tr").filter({ hasText: COMPANY }).first()
    .locator(".badge").filter({ hasText: /^V\d+$/ }).first().textContent();
  expect((ฉบับใบนี้ ?? "").trim(), "ใบนี้โชว์ฉบับ V1").toBe("V1");
});
