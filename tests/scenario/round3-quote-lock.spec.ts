import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── รอบ 3 ข้อ 1: หน้าแก้ไขใบเสนอราคา (บอสสั่ง 20 ต.ค. 69) ───────────────────────────────────────────────────────────
//   ราคาแต่ละรายการแก้ได้เฉพาะ % · ชื่อลูกค้า โครงการ จังหวัด พื้นที่ แก้ได้เฉพาะใบร่าง · ส่งลูกค้าแล้วล็อกทั้งหมด (กันที่ฐาน ใบ 0226)
//   1) ใบร่าง: มีปุ่มแก้ไข · แก้โครงการ/จังหวัด/พื้นที่แล้วบันทึกลงฐาน · รายการมีแต่ช่อง % (ไม่มีช่องพิมพ์ราคา)
//   2) ส่งแล้ว: ไม่มีปุ่มแก้ไขทั้งแถวและแผงรายละเอียด (ขึ้นป้าย "ส่งแล้ว แก้ไม่ได้") · "ส่งอีกครั้ง" (บันทึกทั้งแถว) ยังผ่าน
//      ใบนี้ไม่มีพื้นที่/จังหวัด/ประเภทงาน (ว่างในฐาน) — หน้าเว็บส่งกลับเป็น "0"/"" ต้องไม่ถูกนับว่าแก้
//   3) ฐาน: ดีลเลอร์ยิงตรงแก้ใบที่ส่งแล้วไม่ได้ทุกช่อง (ข้อทดสอบเต็มระดับฐาน supabase/tests/quote_sent_lock.sql)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });
test.setTimeout(180_000);

const admin = adminClient();
const แท็ก = `${Date.now() % 100000}`;
const ลูกค้า = `ZZTEST-ล็อกใบส่งแล้ว-${แท็ก}`;
let ใบ: ใบHQพร้อมใช้;
let เลขใบ = "";
const แถวฐาน = async () => (await admin.from("quotations").select("status, date, project, province, area, customer, total_value")
  .eq("dealer_code", "RYG").eq("id", เลขใบ).single()).data;

test.beforeAll(async () => {
  ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลูกค้า, province: "ระยอง",
    lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 2, unit: "ชุด", unitCost: 1000 }, { name: "หลังคาชุดทดสอบ", qty: 1, unit: "งาน", unitCost: 500 }] });
  // วันที่ย้อนหลัง — "ส่งอีกครั้ง" ประทับวันนี้ ใช้วัดว่าบันทึกทั้งแถวผ่านจริง
  เลขใบ = (await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: ลูกค้า, markupPercent: 10, extra: { date: "2026-01-05" } })).id;
});
test.afterAll(async () => { ล้างใบHQทดสอบ("RYG", [ใบ?.leadNum]); });

test("[รอบ3·1] ใบร่าง: แก้โครงการ/จังหวัด/พื้นที่ได้ · รายการแก้ได้เฉพาะ %", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบ);
  const แถว = page.locator("tbody tr").filter({ hasText: เลขใบ }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await แถว.getByTitle("แก้ไข").click();
  await expect(page.getByText("แก้ไขใบเสนอราคา").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 15_000 });
  await page.getByPlaceholder("เช่น โกดังสินค้า ABC").fill(`${ลูกค้า}-โครงการใหม่`);
  await page.getByPlaceholder("จังหวัด").fill("ชลบุรี");
  await page.getByPlaceholder("0", { exact: true }).fill("320");
  // รายการ: ช่องที่พิมพ์ได้มีแต่ % ที่บวก (บรรทัดละ 1 ช่อง) — ไม่มีช่องราคา/จำนวน/ชื่อรายการ
  const ตาราง = page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" });
  await expect(ตาราง.locator("input"), "ช่องที่แก้ได้ในรายการ = ช่อง % บรรทัดละ 1 ช่อง").toHaveCount(2);
  await expect(ตาราง.getByLabel("% ที่บวก 1")).toBeVisible();
  await ตาราง.getByLabel("% ที่บวก 1").fill("20");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => (await แถวฐาน())?.project, { timeout: 20_000 }).toBe(`${ลูกค้า}-โครงการใหม่`);
  const r = await แถวฐาน();
  expect({ province: r?.province, area: r?.area, total: Number(r?.total_value) }, "ฐาน: จังหวัด/พื้นที่บันทึก · ยอด = บรรทัด 1 +20% (2×1,200) + บรรทัด 2 +10% (550)")
    .toEqual({ province: "ชลบุรี", area: "320", total: 2950 });
});

test("[รอบ3·1] ส่งแล้ว: ไม่มีปุ่มแก้ไข · ป้ายล็อก · ส่งอีกครั้งยังได้ · ฐานปฏิเสธการแก้ทุกช่อง", async ({ page }) => {
  // ล้างพื้นที่/จังหวัดให้ว่างในฐานตอนยังเป็นใบร่าง — วัดว่าบันทึกทั้งแถวจากหน้าเว็บ (ว่าง → "0"/"") ไม่ถูกนับว่าแก้
  const sb = await db(RYG);
  const ล้าง = await sb.from("quotations").update({ area: null, province: null, date: "2026-01-05" }).eq("dealer_code", "RYG").eq("id", เลขใบ);
  expect(ล้าง.error?.message ?? "", "ใบร่าง: ล้างพื้นที่/จังหวัดได้").toBe("");
  const ส่ง = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", "RYG").eq("id", เลขใบ);
  expect(ส่ง.error?.message ?? "", "ส่งให้ลูกค้า").toBe("");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบ);
  const แถว = page.locator("tbody tr").filter({ hasText: เลขใบ }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await expect(แถว.getByTitle("แก้ไข"), "แถวใบที่ส่งแล้ว: ไม่มีปุ่มแก้ไข").toHaveCount(0);
  await แถว.locator("td").nth(1).click();
  await expect(page.locator("[data-quote-locked]"), "แผงรายละเอียด: ป้ายส่งแล้วแก้ไม่ได้").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "แก้ไข", exact: true }), "แผงรายละเอียด: ไม่มีปุ่มแก้ไข").toHaveCount(0);

  // ส่งอีกครั้ง = บันทึกทั้งแถว (rowMappers) — ต้องผ่านแม้ค่าว่างถูกส่งกลับคนละรูปแบบ
  await page.getByTitle("ส่งอีกครั้ง").click();
  await expect.poll(async () => (await แถวฐาน())?.date, { timeout: 20_000, message: "ส่งอีกครั้งบันทึกลงฐาน (วันที่เปลี่ยนเป็นวันนี้)" }).not.toBe("2026-01-05");
  await expect(page.getByText(/quote_sent_locked|ส่งให้ลูกค้าแล้ว แก้ไม่ได้ \(/), "ไม่มีข้อความฐานปฏิเสธ").toHaveCount(0);

  // ฐาน: ดีลเลอร์ยิงตรงแก้ไม่ได้
  for (const [ช่อง, ค่า] of [["customer", "ZZTEST-แอบเปลี่ยน"], ["project", "ZZTEST-แอบเปลี่ยน"], ["province", "ลำปาง"], ["area", "999"], ["markup_percent", 40]] as const) {
    const r = await sb.from("quotations").update({ [ช่อง]: ค่า }).eq("dealer_code", "RYG").eq("id", เลขใบ);
    expect(r.error?.message ?? "", `ฐานปฏิเสธการแก้ ${ช่อง} ของใบที่ส่งแล้ว`).toMatch(/quote_sent_locked/);
  }
  const สุดท้าย = await แถวฐาน();
  expect({ project: สุดท้าย?.project, province: สุดท้าย?.province || "", total: Number(สุดท้าย?.total_value) }, "ค่าในฐานไม่เปลี่ยน")
    .toEqual({ project: `${ลูกค้า}-โครงการใหม่`, province: "", total: 2950 });
});
