// ── ตัวเลขที่เคยทำให้ตัดสินใจผิด (ผลตรวจภายนอกระยะ 2 · 24 ส.ค. 69) ──
//
// HQ-07 ยอดรวมบนหัวการ์ดคิดจากค่ารายเดือนที่ปัดแล้ว → เพี้ยนจากยอดจริง (฿81.8M vs ฿81.6M)
// HQ-02/DL-03 "อัตราปิดการขาย" ใช้ชื่อเดียวกันแต่คนละตัวหารในหลายหน้า → อ่านเหมือนระบบให้เลขขัดกัน
// DL-08 เปอร์เซ็นต์แต่ละขั้นปัดแยกกันแล้วรวมได้ 103%
import { test, expect } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { openAs, settle } from "./helpers";
import { สร้างสาขาของข้อ, กรองหน้าHQด้วยสาขา } from "./ownDealer";
import { วางใบเดิมที่ฐาน, ลบใบทดสอบที่ฐาน } from "./legacyQuotes";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
const db = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY);
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);

test("ยอดรวมบนหัวการ์ดกราฟ ต้องตรงกับผลบวกจริง (ไม่ใช่ผลบวกของค่าที่ปัดแล้ว)", async ({ page }) => {
  // ต้นเหตุไม่นิ่ง (29 ต.ค. 69 · คิวข้อ 3): เดิมบวกยอดใบตอบรับทั้งเครือจากฐานแล้วเทียบหัวการ์ด — ข้ออื่นปิดการขายพร้อมกัน ยอดขยับ
  //   ตอนนี้ใช้สาขาของข้อเอง: ใบตอบรับ 3 ใบ 3 เดือน ใบละ 1,040,000 → ยอดจริง 3,120,000 = "฿3.1M"
  //   ถ้าหัวการ์ดบวกค่ารายเดือนที่ปัดแล้ว (1.0 + 1.0 + 1.0) จะได้ "฿3.0M" — ข้อนี้จับบั๊ก HQ-07 ได้ตรงกว่าเดิม (เดิมพึ่งยอดที่บังเอิญปัดต่าง)
  const สาขา = await สร้างสาขาของข้อ();
  const ปี = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
  const เดือนนี้ = new Date(Date.now() + 7 * 3600_000).getUTCMonth() + 1;
  // ม.ค.–มี.ค. ของปีนี้ (ตัวกรองตั้งต้น "ปีนี้") · ถ้ายังไม่ถึง มี.ค. ใช้เดือนที่ผ่านมาแล้วซ้ำ (ยอดรวมยังต้องตรง ฿3.1M)
  const เดือน = [1, 2, 3].map(m => Math.min(m, เดือนนี้));
  const วัน = (m: number) => `${ปี}-${String(m).padStart(2, "0")}-01`;
  // ใบตอบรับต้องผูกลูกค้า (quotations_won_requires_customer) — ลูกค้าของสาขาของข้อ
  const ใส่ลูกค้า = await db.from("customers").insert({ id: 1, dealer_code: สาขา.รหัส, company: `ZZTEST-NC-${สาขา.รหัส}`, name: `ZZTEST-NC-${สาขา.รหัส}` });
  expect(ใส่ลูกค้า.error, `เตรียมลูกค้าของข้อ (${ใส่ลูกค้า.error?.message ?? ""})`).toBeNull();
  const แถว = เดือน.map((m, i) => ({ id: `ZZTEST-NC-${สาขา.รหัส}-${i}`, dealer_code: สาขา.รหัส, customer_id: 1, customer: `ZZTEST-NC-${สาขา.รหัส}`, project: "ZZTEST-NC",
    date: วัน(m), won_at: `${วัน(m)}T03:00:00+00:00`, province: "ตราด", building_type: "โกดังสำเร็จรูป", area: "1", total: "1040000",
    total_value: 1_040_000, material_cost: 1_040_000, items: 1, status: "won" }));
  try {
    วางใบเดิมที่ฐาน(แถว);
    await openAs(page, ADMIN, "hq", "/hq/dashboard");
    await settle(page);
    await กรองหน้าHQด้วยสาขา(page, สาขา.รหัส);
    const card = page.locator(".card").filter({ hasText: "ยอดขายรวม" }).first();
    await expect.poll(async () => (await card.innerText()).split("\n").map(x => x.trim()).find(x => /^฿[\d.]+M$/.test(x)) ?? "",
      { timeout: 30_000, message: "หัวการ์ดยอดขายของสาขาของข้อ = ผลบวกจริง ฿3.1M (ไม่ใช่ ฿3.0M จากค่ารายเดือนที่ปัดแล้ว)" }).toBe("฿3.1M");
  } finally {
    ลบใบทดสอบที่ฐาน(`dealer_code = '${สาขา.รหัส}'`);
    await สาขา.ลบ();
  }
});

test("ชื่อการ์ดอัตราปิดการขายต้องบอกตัวหาร และไม่ซ้ำกันข้ามหน้า", async ({ page }) => {
  await openAs(page, ADMIN, "hq", "/hq/pipeline");
  await settle(page); await page.waitForTimeout(1500);
  const a = await page.locator("body").innerText();
  // รอบ 4 (บอสตัดสิน 21 ต.ค. 69): ชื่อเดียว "อัตราปิดการขาย" + คำอธิบายตัวหาร (นับจากลีด · lib/winRate.ts)
  expect(a).toContain("อัตราปิดการขาย");
  expect(a, "บอกตัวหาร").toContain("ลูกค้าเป้าหมายปิดสำเร็จ ÷ (ปิดสำเร็จ + ปิดไม่สำเร็จ)");
  expect(a, "ไม่มีชื่อเก่าที่คิดจากใบ").not.toContain("อัตราปิดการขาย (จากใบที่รู้ผลแล้ว)");
  await openAs(page, ADMIN, "hq", "/hq/quotations");
  await settle(page); await page.waitForTimeout(1500);
  const b = await page.locator("body").innerText();
  expect(b).toContain("อัตราตอบรับ (จากใบที่ส่งแล้ว)");
  expect(b, "หน้าใบเสนอราคาไม่ใช้ชื่อ \"อัตราปิดการขาย\" กับอัตราที่คิดจากใบ").not.toContain("อัตราปิดการขาย");
  console.log("ชื่อการ์ดสองหน้าแยกกันแล้ว ✓");
});

test("สัดส่วนขั้นตอนการขายบนแดชบอร์ดดีลเลอร์ ต้องรวมได้ 100%", async ({ page }) => {
  await openAs(page, RYG, "dealer", "/dashboard");
  await settle(page); await page.waitForTimeout(2500);
  const card = page.locator(".card").filter({ hasText: "ขั้นตอนการขาย" }).first();
  const pcts = [...(await card.innerText()).matchAll(/\((\d+)%\)/g)].map(m => Number(m[1]));
  console.log("เปอร์เซ็นต์แต่ละขั้น:", pcts.join(" + "), "=", pcts.reduce((s, v) => s + v, 0));
  expect(pcts.length).toBeGreaterThan(0);
  expect(pcts.reduce((s, v) => s + v, 0)).toBe(100);
});
