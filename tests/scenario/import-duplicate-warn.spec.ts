import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, cleanup, specNS, nsTag, waitRow, นำเข้าลูกค้าหนึ่งราย, นำเข้าผ่านเมนู } from "./funcHelpers";

// ── นำเข้าลูกค้าเดิมแล้วเจอชื่อซ้ำ ต้องถามก่อน (บอสสั่ง 2 ก.ย. 69) ────────────────
//
// ไฟล์ลูกค้าเดิมที่ดีลเลอร์ส่งเข้ามามักมีรายที่อยู่ในระบบแล้วปนมาด้วย (ส่งออกทั้งก้อนจากระบบเก่า)
// ถ้าเพิ่มดื้อ ๆ จะได้ลูกค้าชื่อเดียวกันสองแถว แยกไม่ออกว่าอันไหนของจริง ยอดขายก็กระจายสองที่
// ที่ล็อกไว้: เจอซ้ำต้องเด้งถาม · "อัปเดตข้อมูล" ห้ามลบของเดิมที่กรอกไว้ · จำนวนลูกค้าต้องไม่เพิ่ม
//
// และปุ่ม "คีย์เองทีละราย" ต้องไม่มีแล้ว (บอสสั่งเอาออกวันเดียวกัน)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("IMPDUP");
const tg = nsTag(NS);

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[func·dealer] นำเข้าไฟล์ที่มีชื่อซ้ำ → ต้องเด้งถามก่อน แล้วอัปเดตโดยไม่เพิ่มแถวใหม่", async ({ page }) => {
  const company = tg("ลูกค้าซ้ำ");
  const sb = await db(RYG);
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });

  // รอบแรก: ยังไม่มีในระบบ → นำเข้าได้เลย ไม่ต้องถาม
  await นำเข้าลูกค้าหนึ่งราย(page, company, { ผู้ติดต่อ: "คุณคนแรก", โทรศัพท์: "0811111111" });
  await waitRow(sb, "customers", { company }, 30_000);

  // รอบสอง: ชื่อเดียวกัน (พิมพ์ต่างตัวพิมพ์/มีช่องว่างเกิน ก็ต้องถือว่าซ้ำ)
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  const หัว = "บริษัท,ผู้ติดต่อ,โทรศัพท์,อีเมล,ที่อยู่,จังหวัด,เป็นลูกค้าเมื่อ,ผู้รับผิดชอบ";
  const แถว = `  ${company} ,,0822222222,ใหม่@example.com,,ระยอง,,`;
  await นำเข้าผ่านเมนู(page, "นำเข้าลูกค้าเดิม", "csv", {
    name: "ซ้ำ.csv", mimeType: "text/csv", buffer: Buffer.from("\ufeff" + หัว + "\n" + แถว, "utf8"),
  });
  await page.getByRole("button", { name: /^นำเข้า \d+ ราย$/ }).click();

  // ต้องเด้งถาม ไม่ใช่เพิ่มเงียบ ๆ
  const ป๊อปอัพ = page.getByRole("dialog", { name: "พบชื่อลูกค้าซ้ำ" });
  await expect(ป๊อปอัพ, "เจอชื่อซ้ำต้องถามก่อน ห้ามเพิ่มแถวใหม่เงียบ ๆ").toBeVisible({ timeout: 15_000 });
  await expect(ป๊อปอัพ.getByRole("button", { name: "แทนที่" })).toBeVisible();
  await ป๊อปอัพ.getByRole("button", { name: "อัปเดตข้อมูล" }).click();

  // อัปเดต = เติมเฉพาะช่องที่ว่าง · ของเดิมต้องอยู่ครบ · ต้องไม่มีแถวที่สอง
  await expect.poll(async () => {
    const { data } = await sb.from("customers").select("id,name,phone,email").eq("company", company);
    return data ?? [];
  }, { timeout: 30_000, message: "ต้องมีลูกค้ารายเดียว และข้อมูลเดิมต้องไม่หาย" }).toEqual([
    expect.objectContaining({ name: "คุณคนแรก", phone: "0811111111", email: "ใหม่@example.com" }),
  ]);
});

test("[func·dealer] กล่องนำเข้าลูกค้าเดิม ต้องไม่มีปุ่มคีย์เองทีละรายแล้ว", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  // ปุ่มเป็นเมนูนำเข้า (บอสสั่ง 5 พ.ย. 69): 3 ตัวเลือก Excel · CSV · แบบฟอร์มตัวอย่าง — ไม่มี "คีย์เองทีละราย" ทั้งในเมนูและกล่อง
  await page.getByRole("button", { name: "นำเข้าลูกค้าเดิม" }).click();
  const เมนู = page.getByRole("menu", { name: "นำเข้าลูกค้าเดิม" });
  await expect(เมนู.getByRole("menuitem"), "เมนู 3 ตัวเลือก").toHaveText([/^Excel/, /^CSV/, /^ดาวน์โหลดแบบฟอร์มตัวอย่าง/], { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "คีย์เองทีละราย" }),
    "ปุ่มคีย์เองทีละรายถูกเอาออกแล้ว (บอสสั่ง 2 ก.ย. 69)").toHaveCount(0);
  await page.keyboard.press("Escape");
  await นำเข้าผ่านเมนู(page, "นำเข้าลูกค้าเดิม", "csv", { name: "ว่าง.csv", mimeType: "text/csv", buffer: Buffer.from("﻿บริษัท\n", "utf8") });
  await expect(page.getByRole("button", { name: "เลือกไฟล์" }), "เลือกไฟล์แล้วเข้ากล่องตรวจเดิม").toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "คีย์เองทีละราย" })).toHaveCount(0);
});
