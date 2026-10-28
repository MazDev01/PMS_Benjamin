import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import {
  DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, cleanup, specNS, nsTag, เปิดฟอร์มทำใบจากใบHQ } from "./funcHelpers";

// ── ขั้น "เสนอราคา" ต้องมีใบเสนอราคาจริง (บอสสั่ง 14 ส.ค. 69) ────────────────────
//
// เดิมดีลเลอร์ลากการ์ดไปคอลัมน์ "เสนอราคา" หรือกดติ๊กงาน "จัดทำใบเสนอราคา" ได้เลย
// ขั้นก็ขยับทั้งที่ยังไม่มีเอกสารถึงลูกค้าสักใบ → ตัวเลขบนแดชบอร์ด/รายงานของ HQ
// ("ลูกค้าเป้าหมายถึงขั้นเสนอราคากี่ราย") ไม่ตรงกับของจริงที่ส่งออกไป
//
// กติกาที่ล็อกไว้ในไฟล์นี้:
//   1. ยังไม่มีใบ → ทั้งสองทางพาไปที่ฟอร์มออกใบ · ขั้นไม่ขยับ · งานไม่ถูกติ๊ก
//   2. ออกใบจริงแล้ว → ระบบติ๊กงานให้เอง แล้วเลื่อนขั้นเป็น "เสนอราคา" ให้เอง
//   3. งาน "ส่งใบเสนอราคา" ก็ติ๊กเองไม่ได้ — ใบยังเป็นร่างอยู่ ต้องกดส่งจริงก่อน
// ข้อ 2 สำคัญพอ ๆ กับข้อ 1 — ถ้าพัง ดีลเลอร์จะไปขั้นเสนอราคาไม่ได้เลยทั้งระบบ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("GATE");
const tg = nsTag(NS);
const COMPANY = tg("ด่านใบเสนอ");

// ลูกค้าเป้าหมายตั้งต้น: ติ๊กงานก่อนหน้าครบถึงขั้น "รวบรวมความต้องการ" แล้ว
// (ระบบห้ามข้ามขั้นอยู่แล้ว ถ้าไม่ติ๊กมาก่อน ปุ่มจะถูกล็อกด้วยกฎนั้นแทน = วัดคนละเรื่อง)
async function seedLead() {
  const sb = await db(RYG);
  const numId = 970000 + (Date.now() % 9000);

  // ── ติ๊กงานก่อนหน้าตาม "เส้นทางที่สำนักงานใหญ่ตั้งไว้จริง" ไม่ใช่รายการที่ hardcode ไว้ ──
  //
  // ⚠️ พลาดมาแล้ว 21 ส.ค. 69: seed ติ๊กงานคีย์ "appointment" แต่เส้นทางจริงในฐานข้อมูล
  //   ใช้คีย์ "task_bullet_1" (เกิดตอนมีคนแก้ชื่องานผ่านหน้าตั้งค่า) — งานนั้นจึงนับว่ายังไม่เสร็จ
  //   งาน "จัดทำใบเสนอราคา" เลยถูกล็อกด้วยกฎ "ทำงานก่อนหน้าให้ครบก่อน" แล้วเทสต์ล้ม
  //   ทั้งที่ไม่เกี่ยวกับสิ่งที่เทสต์นี้ตรวจเลย · อ่านเส้นทางจริงมาใช้ = ไม่ผูกกับคีย์ตายตัวอีก
  const { data: journey } = await sb.from("hq_sales_journey").select("tasks").eq("id", 1).maybeSingle();
  // แม่แบบว่าง = ชุดตั้งต้น 5 ขั้น (ใบ 0250 · ไม่มีรายการ flow เก่า — ฐานไม่รับแล้ว ใบ 0257)
  const tpl = (journey?.tasks as { key: string; label: string }[] | null)?.length
    ? (journey!.tasks as { key: string; label: string }[])
    : [
        { key: "contact", label: "ติดต่อแล้ว" }, { key: "collect", label: "เก็บข้อมูลลูกค้า" },
        { key: "requirement", label: "สรุปความต้องการ" }, { key: "appointment", label: "นัดหมาย" },
        { key: "requestQuote", label: "ส่งคำขอราคา" }, { key: "hqQuote", label: "ได้ใบ HQ" },
        { key: "makeQuote", label: "จัดทำใบเสนอราคา" }, { key: "sendQuote", label: "ส่งใบเสนอราคา" },
        { key: "followCustomer", label: "ติดตามลูกค้า" },
      ];
  const เริ่มขั้นเสนอราคา = tpl.findIndex(t => t.key === "makeQuote");
  const tasks = tpl.map((t, idx) => ({
    key: t.key, label: t.label,
    done: เริ่มขั้นเสนอราคา >= 0 && idx < เริ่มขั้นเสนอราคา,
    ...(เริ่มขั้นเสนอราคา >= 0 && idx < เริ่มขั้นเสนอราคา
      ? { doneAt: "1 ส.ค. 2569 · 10:00", doneBy: "ผู้ทดสอบ" } : {}),
  }));

  await sb.from("leads").insert({ phone: "081-999-0101",
    id: `#L-${numId}`, num_id: numId, dealer_code: "RYG", company: COMPANY, name: COMPANY,
    contact: "ผู้ทดสอบ", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET",   // หน้างานต้องอยู่ในพื้นที่ของ RYG (กฎพื้นที่ ใบ 0195)
    value: "฿600,000", assigned: "ผู้ทดสอบ",
    tasks,
  });
}

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); await seedLead(); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

/** เปิดลูกค้าเป้าหมายทดสอบ — ตารางแบ่งหน้า ต้องค้นหาก่อนเสมอ (สเปกอื่นเพิ่มลูกค้าเป้าหมายของสาขาเดียวกันตลอด) */
async function openTestLead(page: import("@playwright/test").Page) {
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  await expect(page.locator("tbody tr").filter({ hasText: COMPANY }).first()).toBeVisible({ timeout: 20_000 });
}

test("[func] งาน 'จัดทำใบเสนอราคา' ระบบติ๊กให้เอง กดเองไม่ได้ · ยังไม่มีใบ = ไม่ติ๊ก ขั้นไม่ขยับ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();

  await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click();   // งานในแต่ละขั้นอยู่แท็บภาพรวม (28 ต.ค. 69)
  await expect(page.locator("[data-lead-tasks]")).toBeVisible({ timeout: 10_000 });
  for (const b of await page.locator("[data-lead-tasks] button[aria-expanded='false']").all()) await b.click();   // กางทุกขั้น (ขั้นอื่นพับไว้ · 28 ต.ค. 69)
  // งานที่ระบบติ๊กเองกดเองไม่ได้ (บอสสั่ง 19 ต.ค. 69 "ปุ่มทำใบมีที่เดียว")
  //   เจตนาเดิมยังอยู่: "ติ๊กงานเฉย ๆ โดยไม่มีใบจริงไม่ได้" — ทำใบได้ทางเดียวคือปุ่มที่แถบขั้นต่อไป
  const งานออกใบ = page.getByRole("checkbox", { name: /จัดทำใบเสนอราคา/ }).first();
  await expect(งานออกใบ, "งาน 'จัดทำใบเสนอราคา' ระบบติ๊กให้เอง — กดเองไม่ได้").toBeDisabled({ timeout: 15_000 });
  await expect(page.getByText("ระบบติ๊กให้เมื่อทำใบเสนอราคา").first(), "บอกว่าระบบติ๊กให้เมื่อไร").toBeVisible();

  const sb = await db(RYG);
  const lead = (await sb.from("leads").select("tasks,status").eq("company", COMPANY).single())
    .data as { tasks?: { key: string; done: boolean }[]; status: string };
  expect(lead.tasks?.find(t => t.key === "makeQuote")?.done, "ยังไม่มีใบ → งานต้องไม่ถูกติ๊ก").toBe(false);
  expect(lead.status, "ยังไม่มีใบ → ขั้นต้องไม่ขยับ").not.toBe("QUOTED");

  assertNoErrors(errs, "ด่านใบเสนอราคา (ติ๊กงาน)");
});

test("[func] ย้ายลูกค้าเป้าหมายไปขั้น 'เสนอราคา' ทั้งที่ยังไม่มีใบ → พาไปออกใบ ขั้นไม่ขยับ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);

  // รอบ 4: ป้ายสถานะในตาราง/บอร์ดดูอย่างเดียว (เมนูเลือกขั้น · ลากการ์ด เอาออก) · ฐานกันดีลเลอร์ตั้งขั้นเองอีกชั้น (ใบ 0232)
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await expect(row.locator("button.badge"), "ป้ายขั้นในตารางไม่ใช่ปุ่ม").toHaveCount(0);
  const { data: ลีด } = await (await db(RYG)).from("leads").select("id").eq("company", COMPANY).single();
  const r = await (await db(RYG)).rpc("lead_apply", { p_id: (ลีด as { id: string }).id, p_intent: { stage: { status: "QUOTED" } } });
  expect(r.error?.message ?? "", "ฐานไม่ให้ดีลเลอร์ตั้งขั้นเสนอราคาเอง").toMatch(/lead_status_one_path/);

  const sb = await db(RYG);
  const lead = (await sb.from("leads").select("status").eq("company", COMPANY).single()).data as { status: string };
  expect(lead.status, "ยังไม่มีใบ → ขั้นต้องไม่ขยับ").not.toBe("QUOTED");

  assertNoErrors(errs, "ด่านใบเสนอราคา (ย้ายขั้น)");
});

// ด่าน 3 (FLOW.html ขั้น 7–8): ใบทำจากใบ HQ · ลูกค้าเป้าหมายคงขั้น "รอราคา HQ" จนส่งใบให้ลูกค้า แล้วฐานขยับเป็นเสนอราคาเอง
//   (เดิม: ออกใบแล้วแอปเลื่อนขั้นเป็นเสนอราคาทันที — ขัดกับตารางสถานะของ FLOW)
test("[D5] [func] ออกใบจากใบ HQ → ระบบติ๊กงาน 'จัดทำใบเสนอราคา' · ขั้นคงเป็นรอราคา HQ จนกว่าจะส่งใบ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);
  await เปิดฟอร์มทำใบจากใบHQ(page, "RYG", COMPANY);
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toHaveCount(0, { timeout: 30_000 });

  const sb = await db(RYG);
  await expect.poll(async () => {
    const l = (await sb.from("leads").select("tasks").eq("company", COMPANY).single()).data as { tasks?: { key: string; done: boolean }[] };
    return l.tasks?.find(t => t.key === "makeQuote")?.done;
  }, { timeout: 20_000, message: "ออกใบแล้วระบบต้องติ๊กงานให้เอง" }).toBe(true);
  expect((await sb.from("leads").select("status").eq("company", COMPANY).single()).data?.status,
    "ยังไม่ส่งใบให้ลูกค้า → ขั้นคงเป็นได้ราคา HQ (ใบ 0219)").toBe("HQ_QUOTED");
  const quotes = (await sb.from("quotations").select("id,status").eq("customer", COMPANY)).data ?? [];
  expect(quotes.length, "ต้องมีใบเสนอราคาจริงใน DB").toBeGreaterThan(0);
  expect(quotes[0].status, "ใบที่เพิ่งออกต้องเป็นร่าง — ยังไม่ได้ส่งถึงลูกค้า").toBe("draft");

  assertNoErrors(errs, "ออกใบจากใบ HQ");
});

// รันต่อจากข้อบน (serial) — ตอนนี้ลูกค้าเป้าหมายมีใบแล้ว 1 ใบ สถานะ "ร่าง"
test("[func] งาน 'ส่งใบเสนอราคา' ระบบติ๊กให้เอง กดเองไม่ได้ · ใบยังเป็นร่าง = งานไม่ถูกติ๊ก", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();

  await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click();   // งานในแต่ละขั้นอยู่แท็บภาพรวม (28 ต.ค. 69)
  await expect(page.locator("[data-lead-tasks]")).toBeVisible({ timeout: 10_000 });
  for (const b of await page.locator("[data-lead-tasks] button[aria-expanded='false']").all()) await b.click();   // กางทุกขั้น (ขั้นอื่นพับไว้ · 28 ต.ค. 69)
  // งานที่ระบบติ๊กเองกดเองไม่ได้ (บอสสั่ง 19 ต.ค. 69) — ส่งใบได้ทางเดียวคือปุ่ม "ส่งให้ลูกค้า" (แถบขั้นต่อไป/รายการใบ)
  await expect(page.getByRole("checkbox", { name: /ส่งใบเสนอราคา/ }).first(), "งาน 'ส่งใบเสนอราคา' กดเองไม่ได้").toBeDisabled({ timeout: 15_000 });
  await expect(page.getByText("ระบบติ๊กให้เมื่อส่งใบให้ลูกค้า").first()).toBeVisible();

  const sb = await db(RYG);
  const lead = (await sb.from("leads").select("tasks").eq("company", COMPANY).single())
    .data as { tasks?: { key: string; done: boolean }[] };
  expect(lead.tasks?.find(t => t.key === "sendQuote")?.done, "ยังไม่ได้ส่งใบ → งานต้องไม่ถูกติ๊ก").toBe(false);

  assertNoErrors(errs, "ด่านส่งใบเสนอราคา");
});

test("[D6] [func] กดส่งใบจริง → ระบบติ๊กงาน 'ส่งใบเสนอราคา' ให้เอง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();
  // รอบ 4: ส่งใบให้ลูกค้า = ปุ่มในกล่องขั้นต่อไปที่เดียว (ยืนยันก่อนส่ง)
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);

  // ── กดส่ง = ส่งทันที ไม่มีกล่องถาม "แนบแม่แบบไปด้วยไหม" แล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69) ─────────
  //   ⚠️ ข้อความแจ้งโผล่ ~2.6 วินาทีแล้วหายเอง — ต้องเฝ้าดูแบบถี่ ๆ ไม่งั้นจับไม่ทันเป็นบางครั้ง
  await page.waitForFunction(
    () => /ส่งใบเสนอราคา \S+ ให้ลูกค้าแล้ว/.test(document.body.innerText),
    undefined, { timeout: 20_000, polling: 100 },
  );
  await expect(page.getByText(/แนบแม่แบบ|พร้อมใบเสนอราคาด้วยไหม/), "ต้องไม่มีกล่องถามเรื่องแม่แบบ").toHaveCount(0);

  const sb = await db(RYG);
  await expect.poll(async () => {
    const l = (await sb.from("leads").select("tasks").eq("company", COMPANY).single())
      .data as { tasks?: { key: string; done: boolean }[] };
    return l.tasks?.find(t => t.key === "sendQuote")?.done;
  }, { timeout: 20_000, message: "ส่งใบจริงแล้วระบบต้องติ๊กงานให้เอง" }).toBe(true);

  const q = (await sb.from("quotations").select("status").eq("customer", COMPANY).limit(1).single()).data as { status: string };
  expect(q.status, "ใบต้องเปลี่ยนเป็น 'ส่งแล้ว' จริง").toBe("sent_to_client");

  assertNoErrors(errs, "ส่งใบแล้วติ๊กงานเอง");
});
