import { test, expect } from "@playwright/test";
import { RYG, skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, loginUI, db, cleanup, specNS, nsTag } from "./funcHelpers";
import { settle } from "./helpers";

// ── สิ่งที่หน้าจอโชว์ ต้องเท่ากับสิ่งที่บันทึกลงระบบจริง ─────────────────────────────
//
// เดิมมีข้อ "แม่แบบที่หน้าจอโชว์ = ค่าที่ลงฐาน" และ "HQ ตั้งราคากลางเป็น 0 ต้องฟ้อง" (หน้า /hq/master)
//   ลบทั้งสองข้อ 16 ต.ค. 69 — เอาแม่แบบออกทั้งระบบ (ฟอร์มไม่มีช่องแม่แบบ · ไม่มีหน้าแคตตาล็อก)
//   การไม่มีช่อง/หน้าแม่แบบตรวจที่ no-template.spec.ts
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(180_000);
test.describe.configure({ mode: "serial" });

const NS = specNS("SHOWSAVE");
const tg = nsTag(NS);

test.beforeAll(async () => { await cleanup(await db(RYG), "RYG", NS); });
test.afterAll(async () => { await cleanup(await db(RYG), "RYG", NS); });

test("[func] ฟอร์มลูกค้าเป้าหมาย: มูลค่าที่กรอกแล้วอ่านไม่ออก ต้องฟ้อง ไม่ใช่บันทึกเป็น 0 เงียบ ๆ", async ({ page }) => {
  const sb = await db(RYG);
  const C2 = tg("มูลค่ามั่ว");

  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);   // รอหน้าพร้อมรับการกดก่อน (ไม่นิ่ง: กดก่อนหน้าพร้อม การกดหาย ฟอร์มไม่เปิด)
  await page.getByRole("button", { name: "เพิ่มลูกค้าเป้าหมาย" }).first().click();
  // บรรทัดคำอธิบายใต้หัวข้อถูกเอาออกแล้ว (28 ส.ค. 69) — ยึดกล่องแทน ชี้ชัดกว่าข้อความในกล่องอยู่แล้ว
  await expect(page.getByRole("dialog", { name: "เพิ่มลูกค้าเป้าหมาย" })).toBeVisible();

  await page.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill(C2);
  await page.getByPlaceholder("ชื่อผู้ติดต่อ").fill("คุณทดสอบ");
  // โทรศัพท์/จังหวัด = ช่องบังคับ (บอสสั่ง 17 ส.ค. 69) — ไม่กรอกจะบันทึกไม่ผ่าน
  await page.getByPlaceholder("0XX-XXX-XXXX").fill("081-000-0000");
  await page.getByRole("dialog").getByLabel("จังหวัด").first().selectOption({ index: 1 });
  await page.getByPlaceholder("เช่น 1200000 หรือ ฿1.2M").first().fill("abcxyz");
  await page.getByRole("button", { name: "บันทึก" }).click();

  // ต้องเห็นข้อความบอกเหตุผล และต้องไม่มีลูกค้าเป้าหมายลงฐานข้อมูล
  await expect(page.getByText(/มูลค่าอ่านไม่ออก/)).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  const { data } = await sb.from("leads").select("id").eq("dealer_code", "RYG").eq("company", C2);
  expect(data?.length ?? 0, "กรอกมูลค่าผิดแล้วต้องไม่บันทึกลงฐานข้อมูล").toBe(0);
});

test("[func] ดาว * ต้องกันการบันทึกจริง — โทรศัพท์/จังหวัดว่าง ต้องบันทึกไม่ผ่าน", async ({ page }) => {
  await loginUI(page, DEALER_ORIGIN, "/login", RYG);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: /เพิ่มลูกค้าเป้าหมาย/ }).first().click();
  await page.waitForTimeout(1200);
  const dlg = page.getByRole("dialog");
  await dlg.getByPlaceholder("เช่น บริษัท ตัวอย่าง จำกัด").fill("ZZREQ ทดสอบดาว");
  await dlg.getByPlaceholder("ชื่อผู้ติดต่อ").fill("ผู้ทดสอบ");
  await dlg.getByRole("button", { name: "บันทึก" }).click();
  await page.waitForTimeout(800);
  // ดาวหลอก = ป้ายกำกับบอกว่าบังคับ แต่ระบบไม่ตรวจจริง — เทสต์นี้กันไว้
  const err = await dlg.locator("text=/กรอกให้ครบก่อนบันทึก/").innerText().catch(() => "");
  expect(err).toContain("โทรศัพท์");
  expect(err).toContain("จังหวัด");
  await expect(dlg, "ต้องยังไม่ปิดฟอร์ม (ยังไม่บันทึก)").toBeVisible();
});
