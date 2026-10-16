import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { settle } from "./helpers";
import { DEALER_ORIGIN, loginUI, watchErrors, assertNoErrors, db, cleanup, specNS, nsTag } from "./funcHelpers";

// ── งานในแท็บ "งาน" ต้องผูกกับขั้นของเส้นทางการขายให้เห็นชัด (บอสสั่ง 19 ส.ค. 69) ──
// เดิมเป็นรายการเรียบ 9 บรรทัด มองไม่ออกว่าติ๊กงานไหนแล้วการ์ดจะเลื่อนไปคอลัมน์ไหนบนกระดาน
// ที่ล็อกไว้: งานถูกจัดกลุ่มใต้หัวขั้นจริง · หัวขั้นที่ตรงกับสถานะการ์ดติดป้าย "ขั้นปัจจุบัน"
// · ขั้นที่ทำงานครบแล้วขึ้น "ผ่านแล้ว" · และลำดับงานเดิมต้องไม่ถูกสลับ (ลำดับ = กติกาการติ๊ก)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

const NS = specNS("STAGEGRP");
const tg = nsTag(NS);
const COMPANY = tg("จัดกลุ่มงาน");

// ลูกค้าเป้าหมายที่ทำงานถึงขั้น "รวบรวมความต้องการ" แล้ว — มีทั้งขั้นที่ผ่านแล้ว/ปัจจุบัน/ยังไม่ถึง ครบสามแบบ
async function seedLead() {
  const sb = await db(RYG);
  const numId = 960000 + (Date.now() % 9000);
  const done = (key: string, label: string) => ({ key, label, done: true, doneAt: "1 ส.ค. 2569 · 10:00", doneBy: "ผู้ทดสอบ" });
  await sb.from("leads").insert({ phone: "081-999-0101",
    id: `#L-${numId}`, num_id: numId, dealer_code: "RYG", company: COMPANY, name: COMPANY,
    contact: "ผู้ทดสอบ", province: "ระยอง", product: "โกดังสำเร็จรูป", status: "BULLET",   // หน้างานต้องอยู่ในพื้นที่ของ RYG (กฎพื้นที่ ใบ 0195)
    value: "฿600,000", assigned: "ผู้ทดสอบ",
    tasks: [
      done("contact", "ติดต่อแล้ว"), done("collect", "เก็บข้อมูลลูกค้า"), done("appointment", "นัดหมาย"),
      { key: "requirement", label: "สรุปความต้องการ", done: false },
      { key: "makeQuote", label: "จัดทำใบเสนอราคา", done: false },
      { key: "sendQuote", label: "ส่งใบเสนอราคา", done: false },
      { key: "followup", label: "ติดตามผล", done: false },
      { key: "negotiate", label: "เจรจาต่อรอง", done: false },
      { key: "close", label: "ปิดการขาย / ไม่สำเร็จ", done: false },
    ],
  });
}

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); await seedLead(); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[func] แท็บงานจัดกลุ่มตามขั้นของเส้นทางการขาย + ชี้ขั้นปัจจุบันตรงกับสถานะการ์ด", async ({ page }) => {
  const errs = watchErrors(page);
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(COMPANY);
  await page.locator("tbody tr").filter({ hasText: COMPANY }).first().locator("td").first().click();
  await page.getByRole("button", { name: "งาน", exact: true }).first().click();

  const head = (stage: string) => page.locator(`[data-stage-head="${stage}"]`);
  // งานทุกตัว (ไม่รวมงานปิดการขาย) ต้องอยู่ใต้หัวขั้นของมันจริง ไม่ใช่รายการเรียบ
  for (const s of ["WAITING", "BULLET", "QUOTED", "FOLLOWUP", "NEGO"]) {
    await expect(head(s), `ต้องมีหัวขั้น ${s}`).toBeVisible({ timeout: 20_000 });
  }
  // ขั้นของการ์ดตอนนี้คือ BULLET → หัวขั้นนั้นต้องบอกว่าเป็นขั้นปัจจุบัน (ตรงกับคอลัมน์บนกระดาน)
  await expect(head("BULLET")).toContainText("รวบรวมความต้องการ");
  await expect(head("BULLET"), "หัวขั้นที่ตรงกับสถานะการ์ดต้องติดป้ายขั้นปัจจุบัน").toContainText("ขั้นปัจจุบัน");
  await expect(head("WAITING"), "ขั้นที่ทำงานครบแล้วต้องขึ้นว่าผ่านแล้ว").toContainText("ผ่านแล้ว");
  // ขั้น "รวบรวมความต้องการ" ต้องมีงานที่สื่อชื่อขั้นจริง ไม่ใช่มีแค่ "นัดหมาย" ลอยอยู่ (บอสสั่ง 19 ส.ค. 69)
  await expect(head("BULLET").locator("xpath=following-sibling::div[1]"),
    "ขั้นรวบรวมความต้องการต้องมีงานสรุปความต้องการ").toContainText("สรุปความต้องการ");
  await expect(head("NEGO"), "ขั้นปลายทางที่ยังทำไม่ถึงต้องขึ้นว่ายังไม่ถึง").toContainText("ยังไม่ถึง");
  // ป้าย "ขั้นปัจจุบัน" ต้องมีที่เดียว — ไม่งั้นผู้ใช้อ่านไม่ออกว่าการ์ดอยู่ขั้นไหนจริง
  await expect(page.locator("[data-stage-head]").filter({ hasText: "ขั้นปัจจุบัน" })).toHaveCount(1);

  // ลำดับงานเดิมห้ามถูกสลับจากการจัดกลุ่ม (ลำดับคือกติกาการติ๊กห้ามข้ามขั้น)
  // ⚠️ ห้ามเทียบกับรายชื่องานที่พิมพ์ตายตัว — เส้นทางการขายแก้ได้ที่หน้าตั้งค่าของสำนักงานใหญ่
  //    (ลำดับ/ชื่องานเปลี่ยนได้จริง เจอมาแล้ว 21 ส.ค. 69) เทสต์ต้องเทียบกับ "เส้นทางจริง" ในฐานข้อมูล
  // ⚠️ งาน "ปิดการขาย" ไม่ได้อยู่ในรายการติ๊ก — ติ๊กเองไม่ได้ตามกติกา (ปิดสำเร็จ/ไม่สำเร็จใช้ปุ่มแยก)
  //    จึงต้องตัดออกก่อนเทียบ ไม่งั้นเทสต์ตกทั้งที่หน้าจอถูกแล้ว (เจอจริง 21 ส.ค. 69)
  const { data: journey } = await sb.from("hq_sales_journey").select("tasks").eq("id", 1).maybeSingle();
  const ตามเส้นทาง = ((journey?.tasks as { key?: string; label: string }[] | null) ?? [])
    .filter(t => t.key !== "close")
    // งาน "ส่งแม่แบบให้ลูกค้า" (key catalog) เลิกใช้ 16 ต.ค. 69 — ฐานอาจยังมีในเส้นทางเดิม แต่แอปไม่แสดง (normalizeLeadTaskTemplate)
    .filter(t => t.key !== "catalog")
    .map(t => t.label);
  const labels = await page.locator("[data-stage-head] ~ div button span:nth-child(2) > span:first-child").allInnerTexts();
  expect(labels.map(s => s.trim()).slice(0, ตามเส้นทาง.length),
    "ลำดับงานบนหน้าจอต้องตรงกับเส้นทางการขายที่สำนักงานใหญ่ตั้งไว้").toEqual(ตามเส้นทาง);
  await expect(page.getByText("ส่งแม่แบบให้ลูกค้า"), "งานส่งแม่แบบเลิกใช้แล้ว ต้องไม่ขึ้นในแท็บงาน").toHaveCount(0);

  assertNoErrors(errs, "จัดกลุ่มงานตามขั้น");
});
