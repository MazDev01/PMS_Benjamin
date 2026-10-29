import { test, expect } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI, ไปแผงลีดจากแถวใบ } from "./funcHelpers";
import { adminClient, กรอกข้อมูลบริษัททดสอบ } from "./testDealers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";
import { ล้างใบHQทดสอบ } from "./legacyQuotes";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// ── รอบ 3 ข้อ 1: หน้าแก้ไขใบเสนอราคา (บอสสั่ง 20 ต.ค. 69) ───────────────────────────────────────────────────────────
//   ราคาแต่ละรายการแก้ได้เฉพาะ % · ชื่อลูกค้า โครงการ จังหวัด พื้นที่ แก้ได้เฉพาะใบร่าง · ส่งลูกค้าแล้วล็อกทั้งหมด (กันที่ฐาน ใบ 0226)
//   1) ใบร่าง: มีปุ่มแก้ไข · แก้โครงการแล้วบันทึกลงฐาน · รายการมีแต่ช่อง % (ไม่มีช่องพิมพ์ราคา)
//   2) ส่งแล้ว: ไม่มีปุ่มแก้ไขทั้งในรายการและหน้าดูใบ · "ส่งอีกครั้ง" (บันทึกทั้งแถว) ยังผ่าน
//      ใบนี้ไม่มีพื้นที่/จังหวัด/ประเภทงาน (ว่างในฐาน) — หน้าเว็บส่งกลับเป็น "0"/"" ต้องไม่ถูกนับว่าแก้
//   3) ฐาน: ดีลเลอร์ยิงตรงแก้ใบที่ส่งแล้วไม่ได้ทุกช่อง (ข้อทดสอบเต็มระดับฐาน supabase/tests/quote_sent_lock.sql)
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });
test.setTimeout(180_000);

const admin = adminClient();
// สาขาของชุดเอง (ไม่ใช้ RYG): ข้อ V1/V2 อ่านแท็บใบเสนอราคาในหน้าดีลเลอร์ของ HQ ซึ่งไม่มีช่องค้นหา (แบ่งหน้า 10 ใบ ใหม่สุดก่อน)
//   ใบ RYG ของข้ออื่นที่รันพร้อมกันดัน V1 ไปหน้า 2 → เห็นแถวเดียว (ต้นเหตุไม่นิ่ง 29 ต.ค. 69: "แสดง 1–10 จาก 35 ใบ")
//   สาขาของชุดมีแค่ใบของไฟล์นี้ (V1 + V2) จึงอยู่หน้าเดียวเสมอ · ข้อมูลบริษัทครบ (ส่งใบให้ลูกค้าได้) · จังหวัดตราด
let สาขา: สาขาของข้อ;
const แท็ก = `${Date.now() % 100000}`;
const ลูกค้า = `ZZTEST-ล็อกใบส่งแล้ว-${แท็ก}`;
let ใบ: ใบHQพร้อมใช้;
let เลขใบ = "";
const แถวฐาน = async () => (await admin.from("quotations").select("status, date, project, province, area, customer, total_value")
  .eq("dealer_code", สาขา.รหัส).eq("id", เลขใบ).single()).data;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  await กรอกข้อมูลบริษัททดสอบ(สาขา.รหัส, admin);
  ใบ = await เตรียมใบHQ(สาขา.บัญชี, { dealerCode: สาขา.รหัส, company: ลูกค้า, province: "ตราด",
    lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 2, unit: "ชุด", unitCost: 1000 }, { name: "หลังคาชุดทดสอบ", qty: 1, unit: "งาน", unitCost: 500 }] });
  // วันที่ย้อนหลัง — "ส่งอีกครั้ง" ประทับวันนี้ ใช้วัดว่าบันทึกทั้งแถวผ่านจริง
  เลขใบ = (await ทำใบลูกค้าจากใบHQ(สาขา.บัญชี, ใบ, { customer: ลูกค้า, markupPercent: 10, extra: { date: "2026-01-05" } })).id;
});
test.afterAll(async () => {
  if (!สาขา) return;
  if (ใบ) ล้างใบHQทดสอบ(สาขา.รหัส, [ใบ.leadNum]);
  await สาขา.ลบ();
});

// รอบ 4 (บอสสั่ง 21 ต.ค. 69): หน้าใบเสนอราคาเหลือรายการ+ค้นหา กดแถวพาไปแผงลีดของใบนั้น
//   ปุ่มของใบ (แก้ไข · ทำฉบับใหม่ · ทำสำเนา · ลบ · ส่งอีกครั้ง · ลูกค้าตอบรับ/ปฏิเสธ) อยู่ที่แท็บใบเสนอราคาในแผงลีด
//   ส่งใบร่างให้ลูกค้า = ปุ่มในกล่องขั้นต่อไปที่เดียว
//   ฟอร์มในแผงลีดแก้ชื่อโครงการ จังหวัด พื้นที่ + % ได้เฉพาะใบร่าง V1 · ฉบับใหม่ V2 ล็อก (บอสตัดสิน 22 ต.ค. 69)
const ใบในแผง = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-quote-item="${id}"]`);
async function เปิดแผงใบ(page: import("@playwright/test").Page) {
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบ);
  const แถว = page.locator("tbody tr").filter({ hasText: เลขใบ }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  await expect(แถว.getByTitle(/แก้ไข|ทำฉบับใหม่|ส่งให้ลูกค้า|ลบใบเสนอราคา/), "รอบ 4: แถวในหน้ารายการไม่มีปุ่มทำงานของใบ").toHaveCount(0);
  await ไปแผงลีดจากแถวใบ(แถว);  // 28 ต.ค. 69: กดแถว = แผงดูใบในหน้าเดิม → ปุ่ม "ไปแผงลีด"
  await page.waitForURL(/\/leads/, { timeout: 20_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 20_000 });
  await expect(ใบในแผง(page, เลขใบ), "แผงลีดของใบนี้เปิดที่แท็บใบเสนอราคา").toBeVisible({ timeout: 20_000 });
}

test("[รอบ3·1] ใบร่าง: แก้โครงการ/จังหวัด/พื้นที่ได้ · รายการแก้ได้เฉพาะ %", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await เปิดแผงใบ(page);
  await ใบในแผง(page, เลขใบ).getByTitle("แก้ไข").click();
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 15_000 });
  await page.getByPlaceholder("เช่น โกดังเก็บสินค้าเกษตร — บจ. ...").fill(`${ลูกค้า}-โครงการใหม่`);
  await page.locator("#q-province").fill("ชลบุรี");
  await page.locator("#q-area").fill("320");
  // รายการ: ช่องที่พิมพ์ได้มีแต่ % ที่บวก (บรรทัดละ 1 ช่อง) — ไม่มีช่องราคา/จำนวน/ชื่อรายการ
  const ตาราง = page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" });
  await expect(ตาราง.locator("input"), "ช่องที่แก้ได้ในรายการ = ช่อง % บรรทัดละ 1 ช่อง").toHaveCount(2);
  await ตาราง.getByLabel("% ที่บวก 1").fill("20");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => (await แถวฐาน())?.project, { timeout: 20_000 }).toBe(`${ลูกค้า}-โครงการใหม่`);
  const r = await แถวฐาน();
  expect({ province: r?.province, area: r?.area, total: Number(r?.total_value) }, "ฐาน: จังหวัด/พื้นที่บันทึก · ยอด = บรรทัด 1 +20% (2×1,200) + บรรทัด 2 +10% (550)")
    .toEqual({ province: "ชลบุรี", area: "320", total: 2950 });
});

test("[รอบ3·1] ส่งแล้ว: ไม่มีปุ่มแก้ไข/ลบ มีปุ่มทำฉบับใหม่ · ส่งอีกครั้งยังได้ · ฐานปฏิเสธการแก้ทุกช่อง", async ({ page }) => {
  // ล้างพื้นที่/จังหวัดให้ว่างในฐานตอนยังเป็นใบร่าง — วัดว่าบันทึกทั้งแถวจากหน้าเว็บ (ว่าง → "0"/"") ไม่ถูกนับว่าแก้
  const sb = await db(สาขา.บัญชี);
  const ล้าง = await sb.from("quotations").update({ area: null, province: null, date: "2026-01-05" }).eq("dealer_code", สาขา.รหัส).eq("id", เลขใบ);
  expect(ล้าง.error?.message ?? "", "ใบร่าง: ล้างพื้นที่/จังหวัดได้").toBe("");
  const ส่ง = await sb.from("quotations").update({ status: "sent_to_client" }).eq("dealer_code", สาขา.รหัส).eq("id", เลขใบ);
  expect(ส่ง.error?.message ?? "", "ส่งให้ลูกค้า").toBe("");

  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await เปิดแผงใบ(page);
  const ใบ1 = ใบในแผง(page, เลขใบ);
  await expect(ใบ1.getByTitle("แก้ไข"), "ใบที่ส่งแล้ว: ไม่มีปุ่มแก้ไข").toHaveCount(0);
  await expect(ใบ1.getByTitle("ลบ", { exact: true }), "ใบที่ส่งแล้ว: ไม่มีปุ่มลบ (บอสสั่ง 21 ต.ค. 69)").toHaveCount(0);
  await expect(ใบ1.getByTitle("ทำฉบับใหม่"), "ใบที่ส่งแล้ว: ปุ่มแก้ไขเปลี่ยนเป็นทำฉบับใหม่").toBeVisible();
  await ใบ1.getByTitle("ดู", { exact: true }).click();
  await expect(page.getByRole("button", { name: "ทำฉบับใหม่" }), "หน้าดูใบ: ปุ่มทำฉบับใหม่").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "แก้ไข", exact: true }), "หน้าดูใบ: ไม่มีปุ่มแก้ไข").toHaveCount(0);
  await expect(page.getByRole("button", { name: "ลบ", exact: true }), "หน้าดูใบ: ไม่มีปุ่มลบ").toHaveCount(0);

  // ส่งอีกครั้ง = บันทึกทั้งแถว (rowMappers) — ต้องผ่านแม้ค่าว่างถูกส่งกลับคนละรูปแบบ
  await page.getByRole("button", { name: /ส่งอีกครั้ง/ }).click();
  await expect.poll(async () => (await แถวฐาน())?.date, { timeout: 20_000, message: "ส่งอีกครั้งบันทึกลงฐาน (วันที่เปลี่ยนเป็นวันนี้)" }).not.toBe("2026-01-05");
  await expect(page.getByText(/quote_sent_locked|ส่งให้ลูกค้าแล้ว แก้ไม่ได้ \(/), "ไม่มีข้อความฐานปฏิเสธ").toHaveCount(0);

  // ฐาน: ดีลเลอร์ยิงตรงแก้ไม่ได้
  for (const [ช่อง, ค่า] of [["customer", "ZZTEST-แอบเปลี่ยน"], ["project", "ZZTEST-แอบเปลี่ยน"], ["province", "ลำปาง"], ["area", "999"], ["markup_percent", 40]] as const) {
    const r = await sb.from("quotations").update({ [ช่อง]: ค่า }).eq("dealer_code", สาขา.รหัส).eq("id", เลขใบ);
    expect(r.error?.message ?? "", `ฐานปฏิเสธการแก้ ${ช่อง} ของใบที่ส่งแล้ว`).toMatch(/quote_sent_locked/);
  }
  const สุดท้าย = await แถวฐาน();
  expect({ project: สุดท้าย?.project, province: สุดท้าย?.province || "", total: Number(สุดท้าย?.total_value) }, "ค่าในฐานไม่เปลี่ยน")
    .toEqual({ project: `${ลูกค้า}-โครงการใหม่`, province: "", total: 2950 });
});

// ── รอบ 3 · ทำฉบับใหม่ (บอสสั่ง 21 ต.ค. 69): ส่ง V1 → ทำฉบับใหม่ → แก้ % → ส่ง V2 → V1 ถูกแทนที่ ─────────────────────────────
//   ตอบรับ V1 ไม่ได้ · ตอบรับ V2 ได้ · มูลค่าลีดเปลี่ยนตาม V2 · ลบใบที่ส่งแล้วไม่ได้ (ข้อทดสอบระดับฐาน quote_new_version.sql)
test("[รอบ3·ฉบับใหม่] ทำฉบับใหม่ → แก้ % → ส่ง V2 → V1 ถูกแทนที่ · ตอบรับ V2 · มูลค่าลีดตาม V2", async ({ page }) => {
  const sb = await db(สาขา.บัญชี);
  const เลขV2 = `${เลขใบ}-V2`;
  const ใบ_ = async (id: string) => (await admin.from("quotations").select("status, total_value, revision, supersedes_id, project")
    .eq("dealer_code", สาขา.รหัส).eq("id", id).maybeSingle()).data;
  const มูลค่าลีด = async () => Number((await admin.from("leads").select("quote_value").eq("dealer_code", สาขา.รหัส).eq("num_id", ใบ.leadNum).single()).data?.quote_value ?? 0);
  expect((await ใบ_(เลขใบ))?.status, "ตั้งต้น: V1 ส่งแล้ว (ข้อก่อนหน้า)").toBe("sent_to_client");
  expect(await มูลค่าลีด(), "ตั้งต้น: มูลค่าลีด = ยอด V1").toBe(2950);

  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  const ใบV1 = () => ใบในแผง(page, เลขใบ);
  const ใบV2 = () => ใบในแผง(page, เลขV2);

  // ทำฉบับใหม่ → ฟอร์มของ V2 · โครงการ/จังหวัด/พื้นที่แก้ไม่ได้ · แก้ % ได้
  await เปิดแผงใบ(page);
  await ใบV1().getByTitle("ทำฉบับใหม่").click();
  await expect(page.locator("[data-version-copied]"), "ฟอร์มฉบับใหม่บอกว่าคัดลอกจากใบเดิม").toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder("เช่น โกดังเก็บสินค้าเกษตร — บจ. ..."), "โครงการแก้ไม่ได้").toHaveAttribute("readonly", "");
  await expect(page.locator("#q-province"), "V2: จังหวัดแก้ไม่ได้").toHaveAttribute("readonly", "");
  await expect(page.locator("#q-area"), "V2: พื้นที่แก้ไม่ได้").toHaveAttribute("readonly", "");
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" }).getByLabel("% ที่บวก 1").fill("30");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => Number((await ใบ_(เลขV2))?.total_value ?? 0), { timeout: 20_000, message: "V2 บันทึก % ใหม่: 2×1,300 + 550" }).toBe(3150);
  expect(await ใบ_(เลขV2), "V2 = ใบร่างฉบับ V2 ผูกใบเดิม · โครงการเดิม").toMatchObject({ status: "draft", revision: "V2", supersedes_id: เลขใบ, project: `${ลูกค้า}-โครงการใหม่` });
  expect((await ใบ_(เลขใบ))?.status, "V2 ยังร่าง ใบเดิมยังส่งแล้ว").toBe("sent_to_client");
  expect(await มูลค่าลีด(), "V2 ยังร่าง มูลค่าลีดยังเป็นยอด V1").toBe(2950);

  // ทำสำเนาได้เฉพาะใบร่าง (V2 ร่าง) — V1 ที่ส่งแล้วไม่มีปุ่มทำสำเนา (บอสสั่ง 21 ต.ค. 69 · ฐานกัน 0230)
  await expect(ใบV2(), "แผงลีดเห็น V2").toBeVisible({ timeout: 20_000 });
  await expect(ใบV1().getByRole("button", { name: "ทำฉบับใหม่" }), "V1 ที่ส่งแล้วมีปุ่มทำฉบับใหม่").toBeVisible();
  await expect(ใบV1().getByRole("button", { name: "ทำสำเนา" }), "V1 ที่ส่งแล้วไม่มีทำสำเนา").toHaveCount(0);
  await expect(ใบV2().getByRole("button", { name: "ทำสำเนา" }), "V2 ใบร่างทำสำเนาได้").toHaveCount(1);

  // ส่ง V2 (กล่องขั้นต่อไป) → V1 ถูกแทนที่ · มูลค่าลีด = ยอด V2
  await page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await ใบ_(เลขใบ))?.status, { timeout: 20_000, message: "ส่ง V2 แล้ว V1 ถูกแทนที่" }).toBe("superseded");
  expect((await ใบ_(เลขV2))?.status).toBe("sent_to_client");
  await expect.poll(มูลค่าลีด, { timeout: 20_000, message: "มูลค่าลีดเปลี่ยนตาม V2" }).toBe(3150);

  // V1 อ่านอย่างเดียว: ป้ายถูกแทนที่ · ไม่มีปุ่มทำฉบับใหม่/ลบ/แก้ไข/ส่ง · หน้าดูใบไม่มีปุ่มตอบรับ
  await เปิดแผงใบ(page);
  await expect(ใบV1().getByText("ถูกแทนที่", { exact: true }), "V1 ขึ้นถูกแทนที่").toBeVisible({ timeout: 15_000 });
  for (const t of ["ทำฉบับใหม่", "ลบ", "แก้ไข", "ส่งอีกครั้ง", "ทำสำเนา"]) await expect(ใบV1().getByTitle(t, { exact: true }), `V1 ไม่มีปุ่ม ${t}`).toHaveCount(0);
  await expect(ใบV1().locator("[data-customer-result]"), "V1 ไม่มีปุ่มบันทึกผลลูกค้า").toHaveCount(0);
  await ใบV1().getByTitle("ดู", { exact: true }).click();
  await expect(page.getByText("ถูกแทนที่", { exact: true }).first(), "หน้าดู V1: ถูกแทนที่").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /ลูกค้าตอบรับ/ }), "หน้าดู V1: ไม่มีปุ่มลูกค้าตอบรับ").toHaveCount(0);
  await page.getByRole("button", { name: "กลับ" }).click();

  // ฐาน: ตอบรับ V1 ไม่ได้ · ลบใบที่ส่งแล้ว/ถูกแทนที่ไม่ได้
  const ตอบรับV1 = await sb.from("quotations").update({ status: "won" }).eq("dealer_code", สาขา.รหัส).eq("id", เลขใบ);
  expect(ตอบรับV1.error?.message ?? "", "ฐานไม่ให้ตอบรับ V1").toMatch(/quote_superseded/);
  for (const id of [เลขใบ, เลขV2]) {
    const ลบ = await sb.from("quotations").delete().eq("dealer_code", สาขา.รหัส).eq("id", id);
    expect(ลบ.error?.message ?? "", `ฐานไม่ให้ลบใบที่ส่งแล้ว ${id}`).toMatch(/quote_sent_no_delete/);
  }

  // ตอบรับ V2 ที่ใบในแผงลีด (ทางเดียวของการปิดการขาย) → ลีดปิดการขาย · มูลค่าคงเป็นยอด V2
  await ใบV2().locator("[data-customer-result]").getByRole("button", { name: /ลูกค้าตอบรับ/ }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(async () => (await ใบ_(เลขV2))?.status, { timeout: 30_000, message: "ตอบรับ V2 ได้" }).toBe("won");
  await expect.poll(async () => (await admin.from("leads").select("status").eq("dealer_code", สาขา.รหัส).eq("num_id", ใบ.leadNum).single()).data?.status,
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
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
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
  // ป้ายสถานะ "ถูกแทนที่" ต้องเห็นเต็ม (ทดลองใช้เว็บจริงแทนบอส 21 ต.ค. 69 · เดิมถูกตัดเป็น "ถูกแทนที่ …")
  const ป้าย = await hq.locator("tbody tr").filter({ hasText: เลขใบ }).locator("[data-quote-status]").evaluateAll(els => els.map(el => {
    const td = el.closest("td")!;
    return { text: (el.textContent ?? "").trim(), ตัด: el.getBoundingClientRect().right > td.getBoundingClientRect().right + 1 };
  }));
  expect(ป้าย.map(x => x.text).sort(), "HQ ทั้งเครือ: ป้ายสถานะ V1/V2").toEqual(["ตอบรับ", "ถูกแทนที่"]);
  expect(ป้าย.filter(x => x.ตัด), "HQ ทั้งเครือ: ป้ายสถานะไม่ถูกตัด").toEqual([]);

  await hq.goto(`${HQ_ORIGIN}/hq/dealers/${สาขา.รหัส}`, { waitUntil: "domcontentloaded" }); await settle(hq);
  await hq.locator("button.tab-item").filter({ hasText: /^ใบเสนอ\s*\d*$/ }).first().click();
  const หน้าดีลเลอร์ = await เลขที่ในตาราง(hq, เลขใบ);
  expect(หน้าดีลเลอร์.map(x => x.text).sort(), "HQ หน้าดีลเลอร์: เลขที่ V1/V2 ไม่เหมือนกัน").toEqual(คาด);
  expect(หน้าดีลเลอร์.filter(x => x.ตัด), "HQ หน้าดีลเลอร์: เลขที่ไม่ถูกตัด").toEqual([]);
  await ctx.close();
});
