import { test, expect } from "@playwright/test";
import { RYG, ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
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
test.afterAll(async () => {
  const { data: cs } = await admin.from("customers").select("id").eq("dealer_code", "RYG").eq("company", ลูกค้า);
  ล้างใบHQทดสอบ("RYG", [ใบ?.leadNum]);
  for (const c of cs ?? []) await admin.from("customers").delete().eq("dealer_code", "RYG").eq("id", c.id);
});

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

test("[รอบ3·1] ส่งแล้ว: ไม่มีปุ่มแก้ไข/ลบ มีปุ่มทำฉบับใหม่ · ส่งอีกครั้งยังได้ · ฐานปฏิเสธการแก้ทุกช่อง", async ({ page }) => {
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
  await expect(แถว.getByTitle("ลบใบเสนอราคา"), "แถวใบที่ส่งแล้ว: ไม่มีปุ่มลบ (บอสสั่ง 21 ต.ค. 69)").toHaveCount(0);
  await expect(แถว.getByTitle("ทำฉบับใหม่"), "แถวใบที่ส่งแล้ว: ปุ่มแก้ไขเปลี่ยนเป็นทำฉบับใหม่").toBeVisible();
  await แถว.locator("td").nth(1).click();
  await expect(page.getByTitle("ทำฉบับใหม่").last(), "แผงรายละเอียด: ปุ่มทำฉบับใหม่").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "แก้ไข", exact: true }), "แผงรายละเอียด: ไม่มีปุ่มแก้ไข").toHaveCount(0);
  await expect(page.getByTitle("ลบใบเสนอราคา"), "แผงรายละเอียด: ไม่มีปุ่มลบ").toHaveCount(0);

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

// ── รอบ 3 · ทำฉบับใหม่ (บอสสั่ง 21 ต.ค. 69): ส่ง V1 → ทำฉบับใหม่ → แก้ % → ส่ง V2 → V1 ถูกแทนที่ ─────────────────────────────
//   ตอบรับ V1 ไม่ได้ · ตอบรับ V2 ได้ · มูลค่าลีดเปลี่ยนตาม V2 · ลบใบที่ส่งแล้วไม่ได้ (ข้อทดสอบระดับฐาน quote_new_version.sql)
test("[รอบ3·ฉบับใหม่] ทำฉบับใหม่ → แก้ % → ส่ง V2 → V1 ถูกแทนที่ · ตอบรับ V2 · มูลค่าลีดตาม V2", async ({ page }) => {
  const sb = await db(RYG);
  const เลขV2 = `${เลขใบ}-V2`;
  const ใบ_ = async (id: string) => (await admin.from("quotations").select("status, total_value, revision, supersedes_id, project")
    .eq("dealer_code", "RYG").eq("id", id).maybeSingle()).data;
  const มูลค่าลีด = async () => Number((await admin.from("leads").select("quote_value").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single()).data?.quote_value ?? 0);
  expect((await ใบ_(เลขใบ))?.status, "ตั้งต้น: V1 ส่งแล้ว (ข้อก่อนหน้า)").toBe("sent_to_client");
  expect(await มูลค่าลีด(), "ตั้งต้น: มูลค่าลีด = ยอด V1").toBe(2950);

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  const เปิดรายการ = async () => {
    await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบ);
    await expect(page.locator("tbody tr").filter({ hasText: เลขใบ }).first()).toBeVisible({ timeout: 20_000 });
  };
  const แถวV1 = () => page.locator("tbody tr").filter({ hasText: เลขใบ }).filter({ hasNotText: เลขV2 }).first();
  const แถวV2 = () => page.locator("tbody tr").filter({ hasText: เลขV2 }).first();

  // ทำฉบับใหม่ → ฟอร์มของ V2 · ลูกค้า/โครงการ/จังหวัด/พื้นที่ แก้ไม่ได้ · แก้ % ได้
  await เปิดรายการ();
  await แถวV1().getByTitle("ทำฉบับใหม่").click();
  await expect(page.locator("[data-version-copied]"), "ฟอร์มฉบับใหม่บอกว่าคัดลอกจากใบเดิม").toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder("เช่น โกดังสินค้า ABC"), "โครงการแก้ไม่ได้").toHaveAttribute("readonly", "");
  await expect(page.getByPlaceholder("จังหวัด"), "จังหวัดแก้ไม่ได้").toHaveAttribute("readonly", "");
  await expect(page.getByLabel("ลูกค้า", { exact: true }), "ลูกค้าแก้ไม่ได้").toBeDisabled();
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" }).getByLabel("% ที่บวก 1").fill("30");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => Number((await ใบ_(เลขV2))?.total_value ?? 0), { timeout: 20_000, message: "V2 บันทึก % ใหม่: 2×1,300 + 550" }).toBe(3150);
  expect(await ใบ_(เลขV2), "V2 = ใบร่างฉบับ V2 ผูกใบเดิม · โครงการเดิม").toMatchObject({ status: "draft", revision: "V2", supersedes_id: เลขใบ, project: `${ลูกค้า}-โครงการใหม่` });
  expect((await ใบ_(เลขใบ))?.status, "V2 ยังร่าง ใบเดิมยังส่งแล้ว").toBe("sent_to_client");
  expect(await มูลค่าลีด(), "V2 ยังร่าง มูลค่าลีดยังเป็นยอด V1").toBe(2950);

  // แผงลีด: ทำสำเนาได้เฉพาะใบร่าง (V2 ร่าง) — V1 ที่ส่งแล้วไม่มีปุ่มทำสำเนา (บอสสั่ง 21 ต.ค. 69 · ฐานกัน 0230)
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ลูกค้า);
  await page.locator("tbody tr").filter({ hasText: ลูกค้า }).first().getByRole("button", { name: "ดูรายละเอียด" }).first().click();
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "ทำฉบับใหม่" }).first(), "แผงลีด: V1 ที่ส่งแล้วมีปุ่มทำฉบับใหม่").toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "ทำสำเนา" }), "แผงลีด: ทำสำเนามีเฉพาะใบร่าง (V2) ใบเดียว").toHaveCount(1);

  // ส่ง V2 → V1 ถูกแทนที่ · มูลค่าลีด = ยอด V2
  await เปิดรายการ();
  await แถวV2().getByTitle("ส่งให้ลูกค้า").click();
  await expect.poll(async () => (await ใบ_(เลขใบ))?.status, { timeout: 20_000, message: "ส่ง V2 แล้ว V1 ถูกแทนที่" }).toBe("superseded");
  expect((await ใบ_(เลขV2))?.status).toBe("sent_to_client");
  await expect.poll(มูลค่าลีด, { timeout: 20_000, message: "มูลค่าลีดเปลี่ยนตาม V2" }).toBe(3150);

  // V1 อ่านอย่างเดียว: ป้ายถูกแทนที่ · ไม่มีปุ่มทำฉบับใหม่/ลบ/แก้ไข · แผงไม่มีปุ่มตอบรับ
  await เปิดรายการ();
  await expect(แถวV1().getByText("ถูกแทนที่", { exact: true }), "แถว V1 ขึ้นถูกแทนที่").toBeVisible({ timeout: 15_000 });
  for (const t of ["ทำฉบับใหม่", "ลบใบเสนอราคา", "แก้ไข", "ส่งให้ลูกค้า"]) await expect(แถวV1().getByTitle(t), `แถว V1 ไม่มีปุ่ม ${t}`).toHaveCount(0);
  await แถวV1().locator("td").nth(1).click();
  await expect(page.locator("[data-quote-superseded]"), "แผง V1: ถูกแทนที่ อ่านอย่างเดียว").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /ลูกค้าตอบรับ/ }), "แผง V1: ไม่มีปุ่มลูกค้าตอบรับ").toHaveCount(0);

  // ฐาน: ตอบรับ V1 ไม่ได้ · ลบใบที่ส่งแล้ว/ถูกแทนที่ไม่ได้
  const ตอบรับV1 = await sb.from("quotations").update({ status: "won" }).eq("dealer_code", "RYG").eq("id", เลขใบ);
  expect(ตอบรับV1.error?.message ?? "", "ฐานไม่ให้ตอบรับ V1").toMatch(/quote_superseded/);
  for (const id of [เลขใบ, เลขV2]) {
    const ลบ = await sb.from("quotations").delete().eq("dealer_code", "RYG").eq("id", id);
    expect(ลบ.error?.message ?? "", `ฐานไม่ให้ลบใบที่ส่งแล้ว ${id}`).toMatch(/quote_sent_no_delete/);
  }

  // ตอบรับ V2 ผ่านหน้าเว็บ → ลีดปิดการขาย · มูลค่าคงเป็นยอด V2
  await เปิดรายการ();
  await แถวV2().locator("td").nth(1).click();
  await page.getByRole("button", { name: /ลูกค้าตอบรับ/ }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await ใบ_(เลขV2))?.status, { timeout: 30_000, message: "ตอบรับ V2 ได้" }).toBe("won");
  await expect.poll(async () => (await admin.from("leads").select("status").eq("dealer_code", "RYG").eq("num_id", ใบ.leadNum).single()).data?.status,
    { timeout: 30_000, message: "ลีดปิดการขายสำเร็จ" }).toBe("PAID");
  expect(await มูลค่าลีด(), "มูลค่าลีด = ยอด V2").toBe(3150);
  expect((await ใบ_(เลขใบ))?.status, "V1 ยังถูกแทนที่").toBe("superseded");
});

// ── รอบ 3 (บอสสั่ง 21 ต.ค. 69): เลขที่ V1 กับ V2 ต้องแสดงเต็ม ไม่เหมือนกัน ทุกตารางทั้งสองฝั่ง ─────────────────────────
//   ดีลเลอร์: หน้าใบเสนอราคา · HQ: ใบเสนอราคาทั้งเครือ + แท็บใบเสนอราคาในหน้าดีลเลอร์
//   "เต็ม" = ตัวอักษรไม่ถูกตัด (ความกว้างเนื้อหาไม่เกินช่อง) · ใช้ใบของข้อก่อนหน้า (V1 ถูกแทนที่ · V2 ตอบรับแล้ว)
async function เลขที่ในตาราง(page: import("@playwright/test").Page, คำ: string) {
  const แถว = page.locator("tbody tr").filter({ hasText: คำ });
  await expect(แถว, `ต้องเห็นทั้ง V1 และ V2 (${คำ})`).toHaveCount(2, { timeout: 20_000 });
  return แถว.locator("[data-quote-no]").evaluateAll(els => els.map(el => {
    const td = el.closest("td")!;
    return { text: (el.textContent ?? "").trim(), ตัด: el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > td.getBoundingClientRect().right + 1 };
  }));
}
test("[รอบ3·ฉบับใหม่] เลขที่ V1/V2 แสดงเต็ม ไม่เหมือนกัน — ตารางดีลเลอร์และ HQ", async ({ page, browser }) => {
  const คาด = [เลขใบ, `${เลขใบ}-V2`].sort();
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" }); await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบ);
  const ดีลเลอร์ = await เลขที่ในตาราง(page, เลขใบ);
  expect(ดีลเลอร์.map(x => x.text).sort(), "ดีลเลอร์: เลขที่ V1/V2 ไม่เหมือนกัน").toEqual(คาด);
  expect(ดีลเลอร์.filter(x => x.ตัด), "ดีลเลอร์: เลขที่ไม่ถูกตัด").toEqual([]);

  const ctx = await browser.newContext(); const hq = await ctx.newPage();
  await loginUI(hq, HQ_ORIGIN, "/hq/login", ADMIN);
  await hq.goto(`${HQ_ORIGIN}/hq/quotations`, { waitUntil: "domcontentloaded" }); await settle(hq);
  await hq.getByPlaceholder(/ค้นหาเลขที่/).fill(เลขใบ);
  const ทั้งเครือ = await เลขที่ในตาราง(hq, เลขใบ);
  expect(ทั้งเครือ.map(x => x.text).sort(), "HQ ทั้งเครือ: เลขที่ V1/V2 ไม่เหมือนกัน").toEqual(คาด);
  expect(ทั้งเครือ.filter(x => x.ตัด), "HQ ทั้งเครือ: เลขที่ไม่ถูกตัด").toEqual([]);

  await hq.goto(`${HQ_ORIGIN}/hq/dealers/RYG`, { waitUntil: "domcontentloaded" }); await settle(hq);
  await hq.locator("button.tab-item").filter({ hasText: /^ใบเสนอ\s*\d*$/ }).first().click();
  const หน้าดีลเลอร์ = await เลขที่ในตาราง(hq, เลขใบ);
  expect(หน้าดีลเลอร์.map(x => x.text).sort(), "HQ หน้าดีลเลอร์: เลขที่ V1/V2 ไม่เหมือนกัน").toEqual(คาด);
  expect(หน้าดีลเลอร์.filter(x => x.ตัด), "HQ หน้าดีลเลอร์: เลขที่ไม่ถูกตัด").toEqual([]);
  await ctx.close();
});
