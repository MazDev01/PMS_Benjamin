import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── สร้างใบให้ลูกค้า → ลูกค้าเป้าหมายต้องถูกต้อง "แม้คำขอที่ยิงตามหลังไม่ถึงเซิร์ฟเวอร์" (บอสสั่ง 15 ต.ค. 69) ─────────
//   ที่มา: customer-quote-flow:81 ตก — ข้อทดสอบเปลี่ยนหน้าหลังใบลงฐาน 30 ms แอปยิงคำสั่งตามหลังไม่ทัน
//     (ติ๊กงาน "จัดทำใบเสนอราคา" · จดกิจกรรม "ออกใบเสนอราคา …" · แถวไฟล์ของใบ) — ผู้ใช้ที่ปิดแท็บ/เน็ตหลุดตรงนั้นก็ได้ลีดไม่ครบ
//   ทั้งสามเป็นค่าที่ระบบคิดจากใบเอง → ฐานทำในธุรกรรมเดียวกับการสร้างใบ (ใบ 0210 · หลัก "ฐานเป็นเจ้าของสถานะ")
//   ข้อนี้ตัดคำขอเขียนตามหลังทิ้งทั้งหมด (PUT ลูกค้าเป้าหมาย · POST ไฟล์) แล้วตรวจที่ฐาน
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(120_000);

const admin = adminClient();
const ชื่อ = `ZZTEST-ใบตามหลัง-${Date.now() % 100000}`;
let ใบHQ: ใบHQพร้อมใช้;

test.beforeAll(async () => {
  ใบHQ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อ, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 10 }] });
});
test.afterAll(async () => {
  await admin.from("files").delete().eq("dealer_code", "RYG").like("name", `%${ชื่อ}%`);
  ล้างใบHQทดสอบ("RYG", [ใบHQ?.leadNum]);
});

test("[flow·db] สร้างใบให้ลูกค้า: ตัดคำขอเขียนตามหลังทิ้ง → ลูกค้าเป้าหมายยังถูกต้อง (งาน · กิจกรรม · ไฟล์ของใบ)", async ({ page }) => {
  const ตัดทิ้ง: string[] = [];
  await page.route("**/api/v1/leads", r => {
    if (r.request().method() === "PUT") { ตัดทิ้ง.push("PUT leads"); return r.abort(); }
    return r.continue();
  });
  await page.route("**/api/v1/files", r => {
    if (r.request().method() === "POST") { ตัดทิ้ง.push("POST files"); return r.abort(); }
    return r.continue();
  });

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ);
  const row = page.locator("tbody tr").filter({ hasText: ชื่อ }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator("td").first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await page.getByRole("button", { name: /ทำใบเสนอราคาจากใบ HQ/ }).click();
  const ตาราง = page.locator("[data-editor='hq-markup']");
  await expect(ตาราง).toBeVisible({ timeout: 20_000 });
  await ตาราง.getByLabel("% ที่บวก 1").fill("20");
  await page.getByRole("button", { name: "สร้างใบเสนอราคา" }).last().click();

  const ใบ = async () => (await admin.from("quotations").select("id").eq("dealer_code", "RYG").eq("deal_id", ใบHQ.leadNum).maybeSingle()).data;
  await expect.poll(async () => (await ใบ())?.id ?? "", { timeout: 20_000, message: "ใบต้องลงฐาน" }).not.toBe("");
  await settle(page);
  const เลขใบ = (await ใบ())!.id as string;

  const { data: ลีด } = await admin.from("leads").select("status, tasks, activities").eq("dealer_code", "RYG").eq("num_id", ใบHQ.leadNum).single();
  const งาน = (ลีด!.tasks ?? []) as { key: string; done?: boolean; doneAt?: string }[];
  const กิจกรรม = (ลีด!.activities ?? []) as { text?: string; date?: string }[];
  const { data: ไฟล์ } = await admin.from("files").select("name, category, source, record_id, uploaded_by").eq("dealer_code", "RYG").like("name", `%${เลขใบ}%`);

  console.log(`คำขอที่ถูกตัด: ${ตัดทิ้ง.join(", ") || "ไม่มี (แอปไม่ได้ยิงตามหลังแล้ว)"}`);
  expect(งาน.find(t => t.key === "makeQuote")?.done, "งาน 'จัดทำใบเสนอราคา' ต้องติ๊กแล้ว — ฐานทำเอง").toBe(true);
  expect(งาน.find(t => t.key === "makeQuote")?.doneAt ?? "", "วันที่ปิดงานต้องเป็นวันไทย").toMatch(/^\d{1,2} \S+ \d{4}$/);
  expect(งาน.find(t => t.key === "sendQuote")?.done ?? false, "ใบร่าง ยังไม่ส่ง — ต้องไม่ติ๊ก 'ส่งใบเสนอราคา'").toBe(false);
  expect(กิจกรรม.filter(a => (a.text ?? "").startsWith(`ออกใบเสนอราคา ${เลขใบ} `)), "ต้องมีกิจกรรมออกใบหนึ่งบรรทัด").toHaveLength(1);
  expect(ไฟล์ ?? [], "ต้องมีแถวไฟล์ของใบหนึ่งแถว").toHaveLength(1);
  expect(ไฟล์![0]).toMatchObject({ category: "ใบเสนอราคา", source: "lead", record_id: ใบHQ.leadNum, uploaded_by: "ระบบ · จากใบเสนอราคา" });
  expect(ลีด!.status, "สถานะยังเป็นของเส้นทางใบ HQ (ฐานขยับเองตอนส่งใบ)").toBe("HQ_PRICING");
});
