import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { db, DEALER_ORIGIN, HQ_ORIGIN, loginUI, นำเข้าลูกค้าหนึ่งราย, ไปแผงลีดจากแถวใบ } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { settle } from "./helpers";
import { เตรียมใบHQ, ทำใบลูกค้าจากใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ, type ใบHQพร้อมใช้ } from "./hqQuoteFixture";

// ── รอบ 2 ช่วง ง: ที่เหลือในตารางเทียบรอบ 1 (19 ต.ค. 69) + ข้อตัดสินของบอส 20 ต.ค. 69 ──────────────────────────────
//   ข้อที่ตรวจตรงตัวได้ดีกว่า (ชื่อกิจกรรมใบร่าง · วันที่สร้าง ISO · งานส่งแม่แบบในลีดที่ปิด · มูลค่าใบร่าง) อยู่ที่ tests/unit/roundTwoD.test.ts
//   ตารางสิทธิ์ผู้ใช้ HQ ครบเมนู: tests/unit/permissionMatrix.test.ts · ข้อความลีดนอกพื้นที่: supabase/tests/territory_message.sql
//   ปุ่มดูรหัสผ่านทางอีเมลเอาออก: dealer-account-page.spec.ts · hq-own-password.spec.ts · เลขลำดับถัดไปเอาออก: ux.spec.ts
//   ตารางรีเฟรชเองหลัง HQ ย้อนการตอบรับ: customer-quote-flow.spec.ts
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: process.env.PMS_GATE_ALL === "1" ? "default" : "serial" });   // PMS_GATE_ALL=1 = รันทุกข้อแม้ข้อก่อนตก
test.setTimeout(180_000);

const admin = adminClient();
const แท็ก = `${Date.now() % 100000}`;
const จังหวัดแปลก = "น่าน";                       // จังหวัดที่รายชื่อตายตัวของเดโมเดิมไม่มี
const ลีดน่าน = `ZZTEST-ตัวกรองจังหวัด-${แท็ก}`;
const ลีดใบ = `ZZTEST-แก้ใบเฉพาะเปอร์เซ็นต์-${แท็ก}`;
const ลูกค้านำเข้า = `ZZTEST-นำเข้าไม่มีผู้รับผิดชอบ-${แท็ก}`;
const นัดเสร็จ = `ZZTEST-นัดทำเสร็จ-${แท็ก}`, นัดลีด = `ZZTEST-นัดดูลีด-${แท็ก}`;
let เลขน่าน = 0; let ใบ: ใบHQพร้อมใช้; let เลขใบลูกค้า = "";
const วันนี้ = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const เลขนัด = [979_200_000 + (Date.now() % 90_000), 979_300_000 + (Date.now() % 90_000)];

test.beforeAll(async () => {
  เลขน่าน = เลขลูกค้าเป้าหมายทดสอบ();
  const r = await admin.from("leads").insert({ id: `#L-${เลขน่าน}`, num_id: เลขน่าน, dealer_code: "RYG", company: ลีดน่าน, name: ลีดน่าน,
    contact: "ผู้ทดสอบ", phone: `08${String(เลขน่าน).slice(-8)}`, province: จังหวัดแปลก, status: "WAITING" });
  if (r.error) throw new Error(r.error.message);
  // ใบลูกค้าจากใบ HQ (+10%) แล้วดีลเลอร์แก้ % (ฐานจดประวัติต่อรองให้เอง · 0148) — การ์ดประวัติต่อรองต้องไม่ขึ้น
  ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ลีดใบ, province: "ระยอง", lines: [{ name: "โครงเหล็กชุดทดสอบ", qty: 1, unit: "ชุด", unitCost: 100_000 }] });
  const q = await ทำใบลูกค้าจากใบHQ(RYG, ใบ, { customer: ลีดใบ, markupPercent: 10 });
  เลขใบลูกค้า = q.id;
  // ยอดคิดจาก % รายบรรทัด (ใบ HQ) — แก้ % ของบรรทัดให้ยอดเปลี่ยนจริง ฐานจึงจดประวัติ
  const sbR = await db(RYG);
  const { data: เดิม } = await sbR.from("quotations").select("line_items").eq("dealer_code", "RYG").eq("id", q.id).single();
  const แก้ = await sbR.from("quotations").update({ line_items: (เดิม!.line_items as { markupPct: number }[]).map(l => ({ ...l, markupPct: 20 })), markup_percent: 20 }).eq("dealer_code", "RYG").eq("id", q.id);
  if (แก้.error) throw new Error(แก้.error.message);
  for (const [i, ชื่อ] of [นัดเสร็จ, นัดลีด].entries()) {
    const a = await admin.from("appointments").insert({ id: เลขนัด[i], dealer_code: "RYG", company: ชื่อ, contact: "ผู้ทดสอบ", lead_id: เลขน่าน,
      date: วันนี้(), time: "10:00", type: "visit", status: "upcoming", assigned: "ทดสอบ", province: "ระยอง", note: "ZZTEST" });
    if (a.error) throw new Error(a.error.message);
  }
});
test.afterAll(async () => {
  await admin.from("appointments").delete().in("id", เลขนัด);
  ล้างใบHQทดสอบ("RYG", [เลขน่าน, ใบ?.leadNum ?? 0]);
  await admin.from("customers").delete().eq("dealer_code", "RYG").eq("company", ลูกค้านำเข้า);
});

test("[ง] หน้าลีด: ตัวกรองจังหวัด = จังหวัดของลีดในสมุดงานจริง (ไม่ใช่รายชื่อตายตัวของเดโม)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const ตัวกรอง = page.getByRole("combobox").filter({ has: page.locator("option", { hasText: "ทุกจังหวัด" }) }).first();
  await expect(ตัวกรอง).toBeVisible({ timeout: 20_000 });
  await expect(ตัวกรอง.locator("option", { hasText: จังหวัดแปลก }), "จังหวัดของลีดจริงต้องอยู่ในตัวกรอง").toHaveCount(1);
  await expect(ตัวกรอง.locator("option", { hasText: "อื่นๆ" }), "ไม่มีตัวเลือกของเดโมเดิม").toHaveCount(0);
});

test("[ง] ใบเสนอราคา: หน้าแก้ใบแก้ได้เฉพาะ % (สถานะ/วันที่/วันหมดอายุ แสดงอย่างเดียว) · ไม่มีการ์ดประวัติต่อรองราคา", async ({ page }) => {
  expect((await admin.from("quotations").select("price_history").eq("dealer_code", "RYG").eq("id", เลขใบลูกค้า).single()).data?.price_history?.length ?? 0,
    "ใบนี้มีประวัติเปลี่ยนยอดในฐาน (ถ้าการ์ดยังอยู่ต้องขึ้น)").toBeGreaterThan(0);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(เลขใบลูกค้า);
  const แถว = page.locator("tbody tr").filter({ hasText: เลขใบลูกค้า }).first();
  await expect(แถว).toBeVisible({ timeout: 20_000 });
  // รอบ 4: กดแถวในหน้าใบเสนอราคา → แผงลีดของใบนั้น (ที่เดียวที่ดู/แก้ใบได้)
  await ไปแผงลีดจากแถวใบ(แถว);  // 28 ต.ค. 69: กดแถว = แผงดูใบในหน้าเดิม → ปุ่ม "ไปแผงลีด"
  await page.waitForURL(/\/leads/, { timeout: 25_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 25_000 });
  const ใบ = page.locator(`[data-quote-item="${เลขใบลูกค้า}"]`);
  await expect(ใบ).toBeVisible({ timeout: 20_000 });
  // หน้าดูใบ: ไม่มีการ์ดประวัติต่อรองราคา
  await ใบ.getByTitle("ดู", { exact: true }).click();
  await expect(page.getByText(เลขใบลูกค้า).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("ประวัติการต่อรองราคา"), "ไม่มีการ์ดประวัติต่อรองราคา (ไม่มีส่วนลดแล้ว)").toHaveCount(0);
  await page.getByRole("button", { name: "กลับ" }).click();
  // หน้าแก้ใบ (ฟอร์มในแผงลีด): สถานะ/วันที่ไม่มีช่องให้แก้ · วันหมดอายุแสดงอย่างเดียว · รายการแก้ได้เฉพาะ %
  await ใบ.getByTitle("แก้ไข").click();
  await expect(page.getByText("กำลังโหลดใบ HQ")).toHaveCount(0, { timeout: 15_000 });
  const ตาราง = page.getByRole("table", { name: "รายการในใบเสนอราคา (จากใบ HQ)" });
  await expect(ตาราง.getByLabel("% ที่บวก 1"), "แก้ % ได้").toBeEditable({ timeout: 15_000 });
  await expect(page.getByLabel("สถานะใบเสนอราคา"), "ไม่มีช่องแก้สถานะ").toHaveCount(0);
  await expect(page.locator("select").filter({ has: page.locator("option", { hasText: /ร่าง|ส่งแล้ว/ }) }), "สถานะไม่ใช่ช่องเลือก").toHaveCount(0);
  await expect(page.getByLabel("วันที่ใบเสนอราคา"), "ไม่มีช่องแก้วันที่").toHaveCount(0);
  await expect(page.locator('input[type="date"]'), "ไม่มีช่องเลือกวันที่ในหน้าแก้ใบ").toHaveCount(0);
  await expect(page.getByText(/อายุใบ \d+ วันนับจากวันที่ออกใบ|ตามที่ระบุไว้ในใบนี้/), "วันหมดอายุแสดงอย่างเดียว (ระบบกำหนด)").toBeVisible();
});

test("[ง] ลูกค้า: หัวแผงใช้รหัสรูปแบบเดียวกับในแผง · นำเข้าแถวที่ไม่มีผู้รับผิดชอบ = เว้นว่าง (ห้ามชื่อตัวอย่าง)", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await นำเข้าลูกค้าหนึ่งราย(page, ลูกค้านำเข้า);
  await expect.poll(async () => (await admin.from("customers").select("owner").eq("dealer_code", "RYG").eq("company", ลูกค้านำเข้า)).data,
    { timeout: 20_000, message: "นำเข้าแล้วผู้รับผิดชอบต้องว่าง ไม่ใช่ชื่อตัวอย่าง" }).toEqual([{ owner: "" }]);
  const { data: c } = await admin.from("customers").select("id").eq("dealer_code", "RYG").eq("company", ลูกค้านำเข้า).single();
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหา").first().fill(ลูกค้านำเข้า);
  await page.getByRole("row", { name: `เปิดรายละเอียดลูกค้า ${ลูกค้านำเข้า}` }).first().click({ timeout: 20_000 });
  const รหัส = `RYG-${String(c!.id).padStart(5, "0")}`;
  await expect(page.getByText(รหัส, { exact: true }).first(), "หัวแผงแสดงรหัสที่จัดรูปแล้ว").toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`#${c!.id}`, { exact: true }), "ไม่มีรหัสดิบ #id").toHaveCount(0);
});

test("[ง] ปฏิทิน: ทำเครื่องหมาย \"ทำเสร็จแล้ว\" ได้ · \"ดูลูกค้าเป้าหมาย\" เปิดลีดนั้นเลย", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/calendar`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator(".activity").filter({ hasText: นัดเสร็จ }).first().click();   // แถวรายการนัด (ช่องในปฏิทินเดือนแค่เลือกวัน)
  const แผง = page.getByRole("dialog", { name: "รายละเอียดนัดหมาย" });
  await expect(แผง).toBeVisible({ timeout: 15_000 });
  await แผง.getByRole("button", { name: "ทำเสร็จแล้ว" }).click();
  await expect.poll(async () => (await admin.from("appointments").select("status").eq("id", เลขนัด[0]).single()).data?.status,
    { timeout: 15_000, message: "ทำเสร็จแล้วลงฐาน" }).toBe("done");
  await page.goto(`${DEALER_ORIGIN}/calendar`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.locator(".activity").filter({ hasText: นัดลีด }).first().click();
  await page.getByRole("dialog", { name: "รายละเอียดนัดหมาย" }).getByRole("button", { name: "ดูลูกค้าเป้าหมาย" }).click();
  await expect(page, "เปิดลีดของนัดนี้เลย").toHaveURL(new RegExp(`/leads\\?open=${เลขน่าน}`), { timeout: 15_000 });
});

test("[ง] HQ: หน้าเข้าระบบไม่พูดถึงแคตตาล็อก · ตั้งค่าไม่บอกว่าแก้แพ็กเกจแล้วเป้าดีลเลอร์เปลี่ยนตาม · บันทึกการใช้งานไม่มีบทบาทอังกฤษดิบ", async ({ page }) => {
  await page.goto(`${HQ_ORIGIN}/hq/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/แคตตาล็อก/), "หน้าเข้าระบบ HQ ไม่มีคำว่าแคตตาล็อก").toHaveCount(0);
  const แถวบันทึก = await admin.from("audit_log").insert({ user: "ZZTEST เจ้าหน้าที่", role: "HQ_STAFF", action: "เข้าสู่ระบบ", target: `ZZTEST-${แท็ก}` }).select("id").single();
  try {
    await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
    await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await expect(page.getByText(/เป้าของดีลเลอร์เปลี่ยนตามทันที/), "ข้อความขัดกับใบ 0206").toHaveCount(0);
    await page.goto(`${HQ_ORIGIN}/hq/audit`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByPlaceholder(/ค้นหา/).first().fill(`ZZTEST-${แท็ก}`);
    const แถว = page.locator("tbody tr").filter({ hasText: `ZZTEST-${แท็ก}` }).first();
    await expect(แถว).toBeVisible({ timeout: 20_000 });
    await expect(แถว, "บทบาทเป็นภาษาไทย").toContainText("เจ้าหน้าที่ HQ");
    await expect(แถว, "ไม่มีรหัสบทบาทดิบ").not.toContainText("HQ_STAFF");
  } finally {
    if (แถวบันทึก.data) await admin.rpc("audit_test_cleanup", { p_ids: [แถวบันทึก.data.id], p_backup: "ฐานทดสอบ (ข้อทดสอบ flow-d)" });   // ลบตรงไม่ได้ (ใบ 0241)
  }
});
