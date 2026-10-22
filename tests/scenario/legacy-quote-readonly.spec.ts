import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { adminClient } from "./testDealers";
import { วางใบเดิมที่ฐาน, ลบใบทดสอบที่ฐาน } from "./legacyQuotes";
import { settle } from "./helpers";

// ── ใบเสนอราคาเดิม (ไม่มีใบ HQ) = ดูได้อย่างเดียว (บอสสั่งลบ Flow เก่า 16 ต.ค. 69) ──────────────────────────────
//   ระบบจริงมีใบแบบนี้ 5 ใบ (ออกก่อนขึ้น Flow ใบ HQ) — เก็บไว้เป็นประวัติ ไม่ลบ
//   หน้าจอต้องไม่มีทางแก้/ลบ/ส่ง/เปลี่ยนสถานะ/ทำสำเนา · ฐานล็อกใบเดิมที่ปิดแล้วอีกชั้น (ใบ 0202)
//   ใช้ใบร่างเดิมของข้อมูลตั้งต้น (ZZTEST-BASE-Q-*) — ใบร่างคือแบบที่ปุ่มเคยครบที่สุด
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");

test("[func·dealer] ใบเดิมที่ไม่มีใบ HQ: ไม่มีปุ่มแก้ · ลบ · ส่ง · เปลี่ยนสถานะ ทั้งในตารางและแผงรายละเอียด", async ({ page }) => {
  // ใบเดิมบนระบบจริงผูกลูกค้าเป้าหมายทุกใบ (ตรวจฐานจริง 22 ต.ค. 69: ใบไม่ผูกดีล 0 ใบ) — วางใบเดิมที่ผูกลีดของข้อนี้เอง
  //   (ใบเดิมในข้อมูลตั้งต้นไม่ผูกลีด จึงเปิดแผงไม่ได้ ซึ่งไม่ตรงกับข้อมูลจริง)
  const admin = adminClient();
  const แท็ก = `${Date.now() % 100000}`;
  const บริษัท = `ZZTEST-ใบเดิม-${แท็ก}`;
  const เลข = 979_700_000 + (Date.now() % 90_000);
  const ใบ = `ZZTEST-LEGACY-${แท็ก}`;
  const ลีด = await admin.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: บริษัท, name: บริษัท,
    phone: "0810000997", province: "ระยอง", status: "QUOTED" });
  expect(ลีด.error, `วางลีดไม่สำเร็จ: ${ลีด.error?.message}`).toBeNull();
  วางใบเดิมที่ฐาน([{ id: ใบ, dealer_code: "RYG", customer: บริษัท, deal_id: เลข, status: "draft", total_value: 1000,
    line_items: [{ name: "งานเดิม", qty: 1, unit: "งาน", unitPrice: 1000 }], date: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) }]);
  try {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/quotations`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder(/ค้นหา/).first().fill(ใบ);
  const แถว = page.locator("tbody tr").filter({ hasText: ใบ }).first();
  await expect(แถว).toBeVisible({ timeout: 25_000 });
  for (const ชื่อ of ["แก้ไข", "ลบใบเสนอราคา", "ส่งให้ลูกค้า"]) {
    await expect(แถว.getByTitle(ชื่อ), `แถวใบเดิมต้องไม่มีปุ่ม ${ชื่อ}`).toHaveCount(0);
  }

  // รอบ 4: หน้าใบเสนอราคาเป็นรายการอย่างเดียว — กดแถวพาไปแผงลีด/แผงลูกค้าของใบนั้น (ที่เดียวที่ดู/พิมพ์ใบได้)
  //   ใบเดิมยังดูและพิมพ์ได้ในแผงนั้น และไม่มีปุ่มแก้ · ลบ · ส่ง · ทำสำเนา · เปลี่ยนสถานะ
  await แถว.locator("td").nth(1).click();
  await page.waitForURL(/\/leads|\/customers/, { timeout: 25_000 });
  await page.getByRole("button", { name: "ใบเสนอราคา", exact: true }).first().click({ timeout: 25_000 });
  const ใบในแผง = page.locator(`[data-quote-item="${ใบ}"]`);
  await expect(ใบในแผง, "ใบเดิมยังแสดงในแผง").toBeVisible({ timeout: 20_000 });
  await expect(ใบในแผง.getByTitle("ดู", { exact: true }), "ยังดูรายละเอียดได้").toHaveCount(1);
  await expect(ใบในแผง.getByTitle("พิมพ์", { exact: true }), "ยังพิมพ์ได้").toHaveCount(1);
  for (const ชื่อ of ["แก้ไข", "ลบ", "ทำสำเนา", "ทำฉบับใหม่"])
    await expect(ใบในแผง.getByTitle(ชื่อ, { exact: true }), `ใบเดิมในแผงต้องไม่มีปุ่ม ${ชื่อ}`).toHaveCount(0);
  await expect(ใบในแผง.locator("[data-customer-result]"), "ใบเดิมไม่มีปุ่มบันทึกผลลูกค้า").toHaveCount(0);
  await expect(page.getByRole("status", { name: "ขั้นต่อไป" }).getByRole("button", { name: /ส่งให้ลูกค้า/ }), "ส่งใบเดิมไม่ได้").toHaveCount(0);

  await ใบในแผง.getByTitle("ดู", { exact: true }).click();
  await expect(page.getByRole("button", { name: /พิมพ์ PDF/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "แก้ไข", exact: true }), "หน้าดูใบเดิมต้องไม่มีปุ่มแก้ไข").toHaveCount(0);
  await expect(page.getByRole("button", { name: "ลบ", exact: true }), "หน้าดูใบเดิมต้องไม่มีปุ่มลบ").toHaveCount(0);
  await expect(page.getByText("เปลี่ยนสถานะ", { exact: true }), "ต้องไม่มีกล่องเปลี่ยนสถานะ").toHaveCount(0);
  } finally {
    ลบใบทดสอบที่ฐาน(`id = '${ใบ}'`);
    await admin.from("leads").delete().eq("dealer_code", "RYG").eq("num_id", เลข);
  }
});
