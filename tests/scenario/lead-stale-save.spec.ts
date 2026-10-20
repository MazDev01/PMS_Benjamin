import { test, expect, type Page, type Browser } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── บันทึกลูกค้าเป้าหมายจากหน้าที่เปิดค้าง ต้องไม่ทับงาน/ไทม์ไลน์ที่ฐานเพิ่งเขียน (บอสสั่ง 15 ต.ค. 69 · ก่อนขึ้นระบบจริง ข้อ 14) ──
//   หน้า A เปิดลูกค้าเป้าหมายค้างไว้ (ตัดช่องข่าวสารสด = ถือสำเนาเก่าจริง)
//   หน้า B (อีกแท็บ) ทำใบให้ลูกค้าจากใบ HQ → ฐานติ๊กงาน "จัดทำใบเสนอราคา" + จดไทม์ไลน์ + แถวไฟล์ (ใบ 0210)
//   หน้า A แก้ชื่อผู้ติดต่อแล้วกดบันทึก → ช่องที่แก้ต้องลง · งานที่ฐานติ๊กและไทม์ไลน์ต้องยังอยู่
//   เดิม: หน้า A ส่งลูกค้าเป้าหมายทั้งแถว (งานจากสำเนาเก่า) → งานที่ฐานติ๊กกลับเป็นยังไม่ทำ
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(150_000);

const admin = adminClient();
const ชื่อ = `ZZTEST-หน้าค้าง-${Date.now() % 100000}`;
let ใบHQ: ใบHQพร้อมใช้;

test.beforeAll(async () => {
  ใบHQ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อ, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 10 }] });
});
test.afterAll(async () => {
  await admin.from("files").delete().eq("dealer_code", "RYG").like("name", `%${ชื่อ}%`);
  ล้างใบHQทดสอบ("RYG", [ใบHQ?.leadNum]);
});

async function เปิดลูกค้าเป้าหมาย(page: Page) {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ);
  const row = page.locator("tbody tr").filter({ hasText: ชื่อ }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
}
async function แท็บใหม่(browser: Browser) { return (await browser.newContext()).newPage(); }

test("[flow·dealer] หน้าเปิดค้าง: ฐานติ๊กงาน/จดไทม์ไลน์ระหว่างนั้น → บันทึกจากหน้าค้างต้องไม่ทับ", async ({ browser }) => {
  // หน้า A: เปิดค้าง · ตัดข่าวสารสด (ไม่ได้ยินว่าฐานเปลี่ยน)
  const a = await แท็บใหม่(browser);
  await a.route("**/api/v1/events**", r => r.abort());
  await เปิดลูกค้าเป้าหมาย(a);
  const ช่องผู้ติดต่อ = a.getByLabel("ชื่อผู้ติดต่อ").first();
  await expect(ช่องผู้ติดต่อ).toBeVisible({ timeout: 20_000 });
  await settle(a);

  // หน้า B: ทำใบให้ลูกค้าจากใบ HQ → ฐานติ๊กงาน + จดไทม์ไลน์
  const b = await แท็บใหม่(browser);
  await เปิดลูกค้าเป้าหมาย(b);
  await b.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await b.getByRole("button", { name: /ทำใบให้ลูกค้า/ }).click();
  const ตาราง = b.locator("[data-editor='hq-markup']");
  await expect(ตาราง).toBeVisible({ timeout: 20_000 });
  await ตาราง.getByLabel("% ที่บวก 1").fill("20");
  await b.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();
  const ลีด = async () => (await admin.from("leads").select("contact, tasks, activities").eq("dealer_code", "RYG").eq("num_id", ใบHQ.leadNum).single()).data!;
  const ทำแล้ว = (l: { tasks: unknown }, key: string) => ((l.tasks ?? []) as { key: string; done?: boolean }[]).some(t => t.key === key && t.done);
  await expect.poll(async () => ทำแล้ว(await ลีด(), "makeQuote"), { timeout: 20_000, message: "ฐานต้องติ๊กงาน 'จัดทำใบเสนอราคา' เมื่อสร้างใบ" }).toBe(true);
  await settle(b);
  const ไทม์ไลน์ก่อน = ((await ลีด()).activities ?? []) as { text?: string }[];
  expect(ไทม์ไลน์ก่อน.some(x => (x.text ?? "").startsWith("ออกใบเสนอราคา ")), "ฐานต้องจดไทม์ไลน์ออกใบ").toBe(true);

  // หน้า A (สำเนาเก่า: ยังไม่เห็นงานที่ฐานติ๊ก) แก้ชื่อผู้ติดต่อแล้วบันทึก
  await ช่องผู้ติดต่อ.fill("คุณหน้าค้าง");
  await a.getByRole("button", { name: /บันทึกการแก้ไข/ }).click();
  await expect.poll(async () => (await ลีด()).contact, { timeout: 20_000, message: "ช่องที่แก้ต้องลงฐาน" }).toBe("คุณหน้าค้าง");
  await settle(a);

  const หลัง = await ลีด();
  expect(ทำแล้ว(หลัง, "makeQuote"), "งานที่ฐานติ๊กต้องยังอยู่ — หน้าค้างต้องไม่เขียนทับ").toBe(true);
  const ไทม์ไลน์หลัง = (หลัง.activities ?? []) as { text?: string }[];
  for (const x of ไทม์ไลน์ก่อน) expect(ไทม์ไลน์หลัง.some(y => y.text === x.text), `ไทม์ไลน์ "${x.text}" ต้องยังอยู่`).toBe(true);
  await a.context().close(); await b.context().close();
});
