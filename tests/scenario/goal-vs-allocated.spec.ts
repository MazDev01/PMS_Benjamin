// ── ตั้งค่า › เป้าหมายยอดขาย (บอสสั่ง 2 พ.ย. 69 · ตั้งค่าให้ตรง flow ใหม่) ──
//
// เดิม (ผลตรวจภายนอก HQ-01 · 24 ส.ค. 69): เป้าทั้งเครือกับผลรวมเป้าที่แจกให้ดีลเลอร์เป็นคนละค่า ต้องบอกให้เห็น
//   → ตอนนี้ตารางเป้ารายดีลเลอร์มีแถวรวม "รวมเป้าดีลเลอร์" + ปุ่ม "ตั้งเท่าผลรวมเป้าดีลเลอร์" ข้างช่องเป้าทั้งปี
// บอสสั่ง 2 พ.ย. 69: เอา "เป้าติดตามตรงเวลา" · "เป้าอัตราปิดการขายเฉลี่ย" (ไม่มีที่ใช้) · "ความคืบหน้าทั้งเครือ" · คอลัมน์ ทำได้จริง/ความคืบหน้า ออก
//   (ผลงานดูที่ภาพรวมยอดขายที่เดียว) · หัว "พื้นที่" → "ดีลเลอร์" · ไม่มีคอลัมน์จำนวนดีลเลอร์ · ตารางเป้ารายดีลเลอร์แก้ตัวเลขในตารางได้
//   ข้อเดิม "ทำได้จริงรายภูมิภาครวม = ทั้งเครือ" กลับด้าน: ต้องไม่มีความคืบหน้า/ทำได้จริง/ตารางรายภูมิภาคบนหน้านี้แล้ว
import { test, expect, type Page } from "@playwright/test";
import { ADMIN, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { สร้างสาขาของข้อ } from "./ownDealer";

const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

async function เปิดแท็บเป้า(page: Page) {
  await openAs(page, ADMIN, "hq", "/hq/settings");
  await settle(page);
  await page.getByRole("button", { name: /เป้าหมายยอดขาย/ }).first().click();
  await expect(page.getByRole("table", { name: "เป้าหมายรายดีลเลอร์" })).toBeVisible({ timeout: 20_000 });
}
const ตารางเป้า = (page: Page) => page.getByRole("table", { name: "เป้าหมายรายดีลเลอร์" });

test("[func·hq] เป้าหมาย: แถวรวมเป้าดีลเลอร์ตรงฐาน · ปุ่มตั้งเท่าผลรวมเป้าดีลเลอร์ · ไม่มีผลงาน/เป้าอัตราปิด/เป้าตรงเวลา", async ({ page }) => {
  await เปิดแท็บเป้า(page);
  // แถว HQ ไม่ใช่ดีลเลอร์ — ไม่นับ (รอบ 2 ช่วง ข · flow-b-hq-dealers [ข·1]) · ข้ออื่นเพิ่ม/ลบสาขาระหว่างอ่านได้ → อ่านฐานกับจอใหม่จนตรง (ไม่เพิ่มเวลารอ)
  let ผลรวม = NaN;
  for (let รอบ = 0; ; รอบ++) {
    const { data } = await db.from("dealers").select("revenue_target").neq("code", "HQ");
    const แจก = (data ?? []).reduce((s, d) => s + Number(d.revenue_target || 0), 0);
    ผลรวม = Number(await ตารางเป้า(page).locator('tfoot [data-sum="annual"]').getAttribute("data-value"));
    if (ผลรวม === แจก || รอบ === 2) { expect(ผลรวม, "แถวรวมเป้าดีลเลอร์บนจอ = ผลรวมเป้าดีลเลอร์จริงในฐาน").toBe(แจก); break; }
    await page.reload(); await เปิดแท็บเป้า(page);
  }

  // ปุ่มตั้งเท่าผลรวม → ช่องเป้าทั้งปีเป็นผลรวมนั้น (ไม่กดบันทึก · กดรีเซ็ตคืน)
  const ปุ่ม = page.locator('[data-act="target-from-dealers"]');
  await expect(ปุ่ม).toHaveText("ตั้งเท่าผลรวมเป้าดีลเลอร์");
  if (await ปุ่ม.isEnabled()) {
    await ปุ่ม.click();
    await expect(ปุ่ม, "ตั้งแล้ว = เท่ากันแล้ว ปุ่มปิด").toBeDisabled();
    await expect(page.getByText("ยังไม่บันทึก"), "แก้แล้วยังไม่บันทึก").toBeVisible();
    await page.getByRole("button", { name: "รีเซ็ต" }).click();
  }

  // กลับด้านจากข้อเดิม: ไม่มีผลงาน/เป้าอัตราปิด/เป้าตรงเวลา/ตารางรายภูมิภาคบนหน้านี้ · หัวตาราง "ดีลเลอร์" ไม่ใช่ "พื้นที่"
  for (const ข้อความ of ["ความคืบหน้าทั้งเครือ", "ทำได้จริง", "เป้าหมายรายภูมิภาค", "เป้าอัตราปิดการขายเฉลี่ย", "เป้าติดตามตรงเวลา"]) {
    await expect(page.getByText(ข้อความ), `ไม่มี "${ข้อความ}" ในแท็บเป้า`).toHaveCount(0);
  }
  await expect(ตารางเป้า(page).locator("thead th")).toHaveText(["ดีลเลอร์", "จังหวัด", "เป้าทั้งปี (บาท)", "เป้ารายเดือน"]);
  console.log(`ผลรวมเป้าดีลเลอร์ ${ผลรวม}`);
});

test("[func·hq] เป้าหมาย: แก้เป้ารายดีลเลอร์ในตาราง → กดบันทึก → ลงฐาน · เป้ารายเดือน = ÷12", async ({ page }) => {
  const สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", เป้า: 1_200_000 });
  try {
    await เปิดแท็บเป้า(page);
    const แถว = ตารางเป้า(page).locator(`[data-target-row="${สาขา.รหัส}"]`);
    // ตารางแบ่งหน้า (เรียงตามรหัส) — เลื่อนหน้าจนเจอแถวของสาขาของข้อ
    for (let i = 0; i < 40 && !(await แถว.count()); i++) await page.getByRole("button", { name: "หน้าถัดไป" }).click();
    await expect(แถว, "เจอแถวของสาขาของข้อ").toBeVisible();
    const ช่อง = แถว.getByLabel(`เป้า ${สาขา.รหัส}`);
    await expect(ช่อง).toHaveValue("1,200,000");
    await ช่อง.fill("2400000");
    await expect(แถว.locator("td").nth(3), "เป้ารายเดือนคิดตามที่พิมพ์ (÷12)").toHaveText("฿200,000");
    await page.getByRole("button", { name: "บันทึก" }).first().click();
    await expect.poll(async () => Number((await db.from("dealers").select("revenue_target").eq("code", สาขา.รหัส).single()).data?.revenue_target),
      { message: "เป้าใหม่ลงฐาน", timeout: 20_000 }).toBe(2_400_000);
    await expect(page.getByText("ยังไม่บันทึก")).toHaveCount(0);
  } finally { await สาขา.ลบ(); }
});
