// ── ใบเสนอราคาเก็บเป็นเวอร์ชัน + ทุกการกระทำลงไทม์ไลน์ (บอสสั่ง 21 ส.ค. 69) ──────
//
// สามเรื่องที่ต้องจริง:
//   1. ใบที่ส่งให้ลูกค้าแล้ว พอแก้ → ขึ้นเป็นฉบับใหม่ V2 (ใบร่างแก้กี่รอบก็ยัง V1)
//   2. ออกใบ/ส่งใบ/แก้ใบ ต้องไปโผล่ในไทม์ไลน์ของดีล ไม่ใช่หายไปเฉย ๆ
//   3. ไทม์ไลน์เรียงเก่า→ใหม่ (บนสุดคือเหตุการณ์แรก)
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, cleanup, specNS, nsTag, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";
import { settle } from "./helpers";

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

test("[func] ส่งใบแล้วแก้ → ขึ้นฉบับ V2 · ทุกขั้นลงไทม์ไลน์ · เรียงเก่าไปใหม่", async ({ page }) => {
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });

  // ออกใบ (V1) — ด่าน 3: ทำจากใบ HQ (ได้ใบ HQ ก่อน แล้วกด "ทำใบเสนอราคาจากใบ HQ")
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);
  await page.getByRole("button", { name: /^(สร้างใบเสนอราคา|บันทึก)$/ }).last().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("id,revision,status").eq("customer", COMPANY)).data?.length ?? 0,
    { timeout: 30_000, message: "ต้องมีใบเสนอราคาใน DB" }).toBeGreaterThan(0);

  // ส่งให้ลูกค้า (แนบแม่แบบ)
  await page.getByTitle("ส่งใบเสนอราคา").first().click();
  await page.getByRole("button", { name: /แนบแม่แบบไปด้วย/ }).click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("status").eq("customer", COMPANY).limit(1).single()).data?.status,
    { timeout: 30_000, message: "ใบต้องถูกส่งจริง" }).toBe("sent_to_client");

  // ⚠️ ต้องรอให้ "หน้าจอ" เห็นว่าใบถูกส่งแล้วด้วย ไม่ใช่รอแค่ฐานข้อมูล (เจอเคสวูบ 7 ก.ย. 69)
  //    การตัดสินว่าแก้แล้วขึ้นฉบับใหม่หรือไม่ ดูจากสถานะใบที่หน้าจอถืออยู่ — ถ้ากดแก้ก่อนหน้าจอรีเฟรช
  //    ระบบยังเห็นเป็น "ร่าง" จึงแก้ทับใบเดิมโดยไม่ขึ้น V2 (คนใช้จริงไม่ทัน แต่เทสต์กดเร็วกว่านั้นมาก)
  await expect(page.getByText("ส่งแล้ว").first()).toBeVisible({ timeout: 20_000 });
  // และรอให้ "ร่องรอยการส่ง" ลงไทม์ไลน์จริงก่อนไปขั้นถัดไป — การเขียนกิจกรรมเป็นงานเบื้องหลัง
  //   ถ้าไปกดแก้ทับระหว่างที่ยังเขียนไม่เสร็จ บรรทัดนี้จะหายไปเลย (คนละเรื่องกับที่เทสต์ตั้งใจตรวจ)
  await expect.poll(async () => {
    const l = (await sb.from("leads").select("activities").eq("company", COMPANY).single())
      .data as { activities?: { text: string }[] };
    return (l.activities ?? []).map(a => a.text).join(" | ");
  }, { timeout: 30_000, message: "ร่องรอย 'ส่งใบพร้อมแม่แบบ' ต้องลงไทม์ไลน์ก่อน" }).toMatch(/พร้อมแม่แบบ/);

  // แก้ใบที่ส่งไปแล้ว → ต้องขึ้นเป็น V2
  // ⚠️ getByTitle("แก้ไข") ไปโดนช่องมูลค่าในตาราง ("คลิกเพื่อแก้ไขมูลค่า") — ต้องเจาะจงในแผงใบเสนอราคา
  await page.getByRole("button", { name: "แก้ไข", exact: true }).first().click();
  // ด่าน 3: ใบจากใบ HQ แก้ได้เฉพาะ % ที่บวก — เปลี่ยน % = เปลี่ยนราคา → ใบที่ส่งแล้วต้องขึ้นฉบับใหม่
  await page.locator("[data-editor='hq-markup']").getByLabel("% ที่บวก 1").fill("15");
  await page.getByRole("button", { name: /^(บันทึก|สร้างใบเสนอราคา)$/ }).last().click();
  await expect.poll(async () =>
    (await sb.from("quotations").select("revision").eq("customer", COMPANY).limit(1).single()).data?.revision,
    { timeout: 30_000, message: "แก้ใบที่ส่งแล้วต้องขึ้นเป็นฉบับ V2" }).toBe("V2");

  // ไทม์ไลน์: ต้องมีร่องรอยครบ และเรียงเก่า→ใหม่
  // ⚠️ การบันทึกกิจกรรมเป็นการเขียนเบื้องหลัง (ไม่บล็อกหน้าจอ) — ต้องรอให้ลงจริง ไม่ใช่อ่านครั้งเดียวแล้วตัดสิน
  //    (อ่านเร็วไปแล้วเคยสรุปผิดว่า "ระบบไม่บันทึกให้" ทั้งที่แค่ยังเขียนไม่เสร็จ)
  await expect.poll(async () => {
    const l = (await sb.from("leads").select("activities").eq("company", COMPANY).single())
      .data as { activities?: { text: string }[] };
    return (l.activities ?? []).map(a => a.text).join(" | ");
  }, { timeout: 30_000, message: "ต้องมีร่องรอยครบทั้งออกใบ/ส่งใบ/แก้เป็น V2" })
    .toMatch(/ออกใบเสนอราคา[\s\S]*พร้อมแม่แบบ[\s\S]*ฉบับ V2/);

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

  // ใบที่เพิ่งแก้ในเทสต์ก่อนหน้าเป็น V2 — ต้องเห็นเลขฉบับที่มากกว่า V1 ได้จริง
  const มีV2 = await page.locator("tbody tr").filter({ hasText: COMPANY }).first()
    .locator(".badge").filter({ hasText: /^V\d+$/ }).first().textContent();
  expect((มีV2 ?? "").trim(), "ใบที่แก้ไปแล้วต้องโชว์ฉบับล่าสุด").toBe("V2");
});
