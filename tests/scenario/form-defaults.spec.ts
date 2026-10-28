// ── ช่องเลือกต้องเริ่มที่ "ยังไม่ระบุ" และจังหวัดต้องเลือกจากเขตของสาขา ─────────────
// (บอสสั่ง 20 ส.ค. 69) สองเรื่องนี้เป็นกติกาเดียวกันของทั้งระบบ:
//   ห้ามให้ช่องตอบแทนผู้ใช้ · ห้ามให้พิมพ์จังหวัดอิสระจนตัวกรองจับไม่ตรง
import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { db } from "./funcHelpers";

test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);

// รอบ 4 (บอสสั่ง 21 ต.ค. 69 ข้อ 6): ลงนัดได้จากแผงลีดที่เดียว (ปฏิทินดู/ทำเสร็จ/ยกเลิก) · แนบไฟล์ที่แผงลีด/ลูกค้า (หน้าไฟล์ดูอย่างเดียว)
//   นัดในแผงลีดใช้จังหวัดของลีดเอง (ไม่มีช่องพิมพ์จังหวัด) · ไฟล์ในแผงไม่มีช่องเลือกโฟลเดอร์ (ระบบจัดเอง)
//   กติกา "ช่องเลือกเริ่มที่ยังไม่ระบุ" ยังตรวจที่ช่องประเภทนัดหมายในแผงลีด
test("[ui·dealer] ลงนัด: ปฏิทินไม่มีปุ่มเพิ่มแล้ว · ฟอร์มนัดในแผงลีดเริ่มที่ยังไม่ระบุ ไม่มีช่องพิมพ์จังหวัด", async ({ page }) => {
  const sb = await db(RYG);
  const ชื่อ = `ZZTEST-ฟอร์มนัด-${Date.now() % 100000}`;
  const เลข = 979_500_000 + (Date.now() % 90_000);
  const ins = await sb.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: ชื่อ, name: ชื่อ,
    phone: "0810000999", province: "ระยอง", status: "WAITING" });
  expect(ins.error).toBeNull();
  try {
    await openAs(page, RYG, "dealer", "/calendar");
    await settle(page);
    await expect(page.getByRole("button", { name: "เพิ่มกิจกรรม" }), "ปฏิทินไม่มีปุ่มเพิ่มกิจกรรมแล้ว").toHaveCount(0);

    await page.goto(page.url().replace(/\/calendar.*$/, "/leads"), { waitUntil: "domcontentloaded" });
    await settle(page);
    await page.getByRole("button", { name: "ตาราง" }).click().catch(() => {});
    await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อ);
    await page.locator("tbody tr").filter({ hasText: ชื่อ }).first().getByTitle("ดูรายละเอียด").click({ timeout: 20_000 });
    await page.getByRole("button", { name: "ภาพรวม", exact: true }).first().click();   // นัดหมาย/ไฟล์อยู่แท็บภาพรวม (28 ต.ค. 69)
    await page.getByRole("button", { name: /เพิ่มนัดหมาย/ }).click();
    const ประเภท = page.getByLabel("ประเภทนัดหมาย");
    await expect(ประเภท).toBeVisible({ timeout: 15_000 });
    expect(await ประเภท.evaluate(el => el.tagName), "ประเภทเป็นช่องเลือก").toBe("SELECT");
    await expect(ประเภท, "ต้องเริ่มที่ยังไม่ระบุ ไม่ใช่เลือกให้เอง").toHaveValue("");
    await expect(page.getByLabel("จังหวัด", { exact: true }).filter({ has: page.locator("xpath=self::input") }), "ไม่มีช่องพิมพ์จังหวัดอิสระ").toHaveCount(0);
  } finally {
    await sb.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลข);
  }
});

test("[ui·dealer] หน้าไฟล์ดูอย่างเดียว: ไม่มีปุ่มอัปโหลด (แนบไฟล์ที่แผงลีด/ลูกค้า)", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/files");
  await settle(page);
  await expect(page.getByRole("heading", { name: /ไฟล์/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "อัปโหลดไฟล์" }), "หน้าไฟล์ไม่มีปุ่มอัปโหลดแล้ว").toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "อัปโหลดไฟล์" }), "ไม่มีหน้าต่างอัปโหลด").toHaveCount(0);
});
