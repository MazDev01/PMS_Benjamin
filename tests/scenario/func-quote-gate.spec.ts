import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { settle } from "./helpers";
import {
  DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors,
  db, cleanup, specNS, nsTag,
} from "./funcHelpers";

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
  const tpl = (journey?.tasks as { key: string; label: string }[] | null)?.length
    ? (journey!.tasks as { key: string; label: string }[])
    : [
        { key: "contact", label: "ติดต่อแล้ว" }, { key: "collect", label: "เก็บข้อมูลลูกค้า" },
        { key: "appointment", label: "นัดหมาย" }, { key: "requirement", label: "สรุปความต้องการ" },
        { key: "makeQuote", label: "จัดทำใบเสนอราคา" }, { key: "sendQuote", label: "ส่งใบเสนอราคา" },
        { key: "catalog", label: "ส่งแม่แบบให้ลูกค้า" }, { key: "followup", label: "ติดตามผล" },
        { key: "negotiate", label: "เจรจาต่อรอง" }, { key: "close", label: "ปิดการขาย / ไม่สำเร็จ" },
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
    contact: "ผู้ทดสอบ", province: "เชียงใหม่", product: "โกดังสำเร็จรูป", status: "BULLET",
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

test("[func] ติ๊กงาน 'จัดทำใบเสนอราคา' ทั้งที่ยังไม่มีใบ → พาไปออกใบ ขั้นไม่ขยับ", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();

  await page.getByRole("button", { name: "งาน", exact: true }).first().click();
  await page.getByText("จัดทำใบเสนอราคา").first().click();

  // กติกา 20 ส.ค. 69: ถ้ามีใบที่ยังแก้ได้อยู่แล้ว ระบบพาไปเพิ่มรายการในใบนั้น (ไม่ออกใบที่สอง)
  // สิ่งที่เทสต์นี้ตรวจคือ "ต้องพาไปฟอร์มใบเสนอราคา ไม่ใช่ติ๊กงานให้เฉย ๆ" — ได้ทั้งสองโหมด
  await expect(page.getByText(/สร้างใบเสนอราคาใหม่|^แก้ไข /),
    "ต้องพาไปฟอร์มใบเสนอราคา ไม่ใช่ติ๊กงานให้เฉย ๆ").toBeVisible({ timeout: 15_000 });

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

  // ช่องทางเดียวกับที่บอร์ดคัมบังใช้ตอนลากการ์ดข้ามคอลัมน์ (requestStatusChange)
  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await row.getByRole("button", { name: /ติดต่อแล้ว|รวบรวม/ }).first().click();
  await page.getByRole("button", { name: "เสนอราคา", exact: true }).first().click();

  await expect(page.getByText("สร้างใบเสนอราคาใหม่"),
    "ต้องพาไปฟอร์มออกใบ ไม่ใช่เลื่อนขั้นให้เฉย ๆ").toBeVisible({ timeout: 15_000 });

  const sb = await db(RYG);
  const lead = (await sb.from("leads").select("status").eq("company", COMPANY).single()).data as { status: string };
  expect(lead.status, "ยังไม่มีใบ → ขั้นต้องไม่ขยับ").not.toBe("QUOTED");

  assertNoErrors(errs, "ด่านใบเสนอราคา (ย้ายขั้น)");
});

test("[func] ออกใบจริงจากฟอร์มที่ถูกพามา → ระบบติ๊กงาน + เลื่อนขั้นให้เอง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);

  const row = page.locator("tbody tr").filter({ hasText: COMPANY }).first();
  await row.getByRole("button", { name: /ติดต่อแล้ว|รวบรวม/ }).first().click();
  await page.getByRole("button", { name: "เสนอราคา", exact: true }).first().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toBeVisible({ timeout: 15_000 });

  // ลูกค้าเป้าหมายนี้ระบุแม่แบบที่ไม่มีในแคตตาล็อก → BOQ ตั้งต้นว่าง ต้องมีปุ่มเลือกแคตตาล็อกให้ ไม่งั้นออกใบไม่ได้
  const pick = page.getByRole("button", { name: /เลือกจากแคตตาล็อก/ });
  await expect(pick.first(), "BOQ ตั้งต้นไม่ได้ ต้องเปิดให้เลือกรายการเอง").toBeVisible({ timeout: 10_000 });
  await pick.first().click();
  // ต้องเปิดติดตั้งแต่คลิกแรก — เคยพังตรงนี้ (17 ส.ค. 69): ฟอร์มที่ถูกพามาเลื่อนจอแบบ smooth อยู่
  // เมนูดัก event "scroll" ไว้ปิดตัวเอง เลยปิดทันทีที่เพิ่งเปิด → ผู้ใช้เห็นเป็น "กดแล้วไม่ขึ้น" ออกใบไม่ได้เลย
  const catalogItem = page.locator("button").filter({ hasText: /฿[\d,]+\// }).first();
  await expect(catalogItem, "กดเลือกจากแคตตาล็อกครั้งเดียวแล้วรายการต้องขึ้น (เมนูต้องไม่ปิดตัวเองเพราะจอเลื่อนอัตโนมัติ)")
    .toBeVisible({ timeout: 10_000 });
  await catalogItem.click();

  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  await expect(page.getByText("สร้างใบเสนอราคาใหม่")).toHaveCount(0, { timeout: 30_000 });

  const sb = await db(RYG);
  await expect.poll(async () =>
    (await sb.from("leads").select("status").eq("company", COMPANY).single()).data?.status,
    { timeout: 20_000, message: "ออกใบแล้วขั้นต้องเลื่อนเป็นเสนอราคาเอง" }).toBe("QUOTED");
  const lead = (await sb.from("leads").select("tasks").eq("company", COMPANY).single())
    .data as { tasks?: { key: string; done: boolean }[] };
  expect(lead.tasks?.find(t => t.key === "makeQuote")?.done, "ออกใบแล้วระบบต้องติ๊กงานให้เอง").toBe(true);
  const quotes = (await sb.from("quotations").select("id,status").eq("customer", COMPANY)).data ?? [];
  expect(quotes.length, "ต้องมีใบเสนอราคาจริงใน DB").toBeGreaterThan(0);
  expect(quotes[0].status, "ใบที่เพิ่งออกต้องเป็นร่าง — ยังไม่ได้ส่งถึงลูกค้า").toBe("draft");

  assertNoErrors(errs, "ออกใบแล้วขั้นเลื่อนเอง");
});

// รันต่อจากข้อบน (serial) — ตอนนี้ลูกค้าเป้าหมายมีใบแล้ว 1 ใบ สถานะ "ร่าง"
test("[func] ติ๊กงาน 'ส่งใบเสนอราคา' ทั้งที่ใบยังเป็นร่าง → พาไปรายการใบ งานไม่ถูกติ๊ก", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();

  await page.getByRole("button", { name: "งาน", exact: true }).first().click();
  await page.getByText("ส่งใบเสนอราคา").first().click();

  // พาไปแท็บใบเสนอราคา (รายการ) ไม่ใช่เปิดฟอร์มออกใบใหม่ — ใบมีอยู่แล้ว แค่ยังไม่ได้ส่ง
  await expect(page.getByText("สร้างใบเสนอราคาใหม่"),
    "ต้องไม่เปิดฟอร์มออกใบใหม่ — ใบมีอยู่แล้ว").toHaveCount(0, { timeout: 10_000 });

  const sb = await db(RYG);
  const lead = (await sb.from("leads").select("tasks").eq("company", COMPANY).single())
    .data as { tasks?: { key: string; done: boolean }[] };
  expect(lead.tasks?.find(t => t.key === "sendQuote")?.done, "ยังไม่ได้ส่งใบ → งานต้องไม่ถูกติ๊ก").toBe(false);

  assertNoErrors(errs, "ด่านส่งใบเสนอราคา");
});

test("[func] กดส่งใบจริง → ระบบติ๊กงาน 'ส่งใบเสนอราคา' ให้เอง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await openTestLead(page);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();

  await page.getByTitle("ส่งใบเสนอราคา").first().click();

  // ── ต้องถามก่อนว่าแนบแม่แบบไปด้วยไหม (บอสสั่ง 21 ส.ค. 69) ────────────────────
  //   ห้ามส่งทันทีแบบเงียบ ๆ — แม่แบบเป็นเอกสารคนละใบ เซลส์ต้องเป็นคนตัดสินใจ
  await expect(page.getByText("ส่ง แม่แบบ (สเปกสินค้า) ไปให้ลูกค้าพร้อมใบเสนอราคาด้วยไหม")
    .or(page.getByText(/ไปให้ลูกค้าพร้อมใบเสนอราคาด้วยไหม/)),
  "กดส่งแล้วต้องมีกล่องถามเรื่องแม่แบบก่อน").toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /แนบแม่แบบไปด้วย/ }).click();

  // ข้อความแจ้งต้องบอกด้วยว่า "แม่แบบไปกับใบ" (บอสสั่ง 21 ส.ค. 69)
  //   ⚠️ ข้อความโผล่ ~2.6 วินาทีแล้วหายเอง — ต้องเฝ้าดูแบบถี่ ๆ ไม่งั้นจับไม่ทันเป็นบางครั้ง
  await page.waitForFunction(
    () => /ส่งใบเสนอราคา .* พร้อมแม่แบบ/.test(document.body.innerText),
    undefined, { timeout: 20_000, polling: 100 },
  );

  const sb = await db(RYG);
  await expect.poll(async () => {
    const l = (await sb.from("leads").select("tasks").eq("company", COMPANY).single())
      .data as { tasks?: { key: string; done: boolean }[] };
    return l.tasks?.find(t => t.key === "sendQuote")?.done;
  }, { timeout: 20_000, message: "ส่งใบจริงแล้วระบบต้องติ๊กงานให้เอง" }).toBe(true);

  // ส่งใบ = ส่งแม่แบบไปด้วย → งาน "ส่งแม่แบบให้ลูกค้า" ต้องถูกติ๊กพร้อมกัน ไม่ค้างให้ติ๊กเองทีหลัง
  const หลังส่ง = (await sb.from("leads").select("tasks").eq("company", COMPANY).single())
    .data as { tasks?: { key: string; done: boolean }[] };
  expect(หลังส่ง.tasks?.find(t => t.key === "catalog")?.done,
    "ส่งใบแล้วงาน 'ส่งแม่แบบให้ลูกค้า' ต้องถูกติ๊กด้วย").toBe(true);

  const q = (await sb.from("quotations").select("status").eq("customer", COMPANY).limit(1).single()).data as { status: string };
  expect(q.status, "ใบต้องเปลี่ยนเป็น 'ส่งแล้ว' จริง").toBe("sent_to_client");

  assertNoErrors(errs, "ส่งใบแล้วติ๊กงานเอง");
});
