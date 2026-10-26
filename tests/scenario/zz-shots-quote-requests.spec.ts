import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db, loginUI } from "./funcHelpers";
import { settle, เปิดใบHQในกล่องงาน } from "./helpers";
import { ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── ถ่ายรูปก่อน/หลัง หน้าคำขอใบเสนอราคาของ HQ (บอสสั่ง 26 ต.ค. 69) — ไม่ใช่ข้อทดสอบ ───────────────────────────────────
//   รันเองเท่านั้น: PMS_SHOTS=ก่อน|หลัง npm run test:prodbuild -- tests/scenario/zz-shots-quote-requests.spec.ts
//   รูปลง C:/.claude/pms-shots/quote-requests/ (PMS_SHOTS_DIR เปลี่ยนได้) · จอกว้าง + มือถือ
test.skip(() => !process.env.PMS_SHOTS, "ถ่ายรูปก่อน/หลังหน้าคำขอใบเสนอราคา — รันเองเมื่อสั่ง PMS_SHOTS=ก่อน|หลัง (ไม่ใช่ข้อทดสอบ)");
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(600_000);

const โฟลเดอร์ = process.env.PMS_SHOTS_DIR ?? "C:/.claude/pms-shots/quote-requests";
const จอ = [{ ชื่อ: "จอกว้าง", w: 1440, h: 900 }, { ชื่อ: "มือถือ", w: 390, h: 844 }];
const เลข = เลขลูกค้าเป้าหมายทดสอบ();
const บริษัท = `ZZTEST-ถ่ายรูปคำขอ-${Date.now() % 100_000}`;
const สเปกยาว = "โครงสร้างเหล็กรูปพรรณ หลังคาเมทัลชีทหนา 0.47 มม. พร้อมฉนวนกันความร้อน · ผนังสูง 8 ม. · ประตูม้วน 4 บาน ขนาด 5x5 ม. · "
  + "ช่องแสงหลังคา 10% · รางน้ำสแตนเลส · พื้นคอนกรีตรับน้ำหนัก 3 ตัน/ตร.ม. · มีเครนเหนือศีรษะ 5 ตัน 1 ชุด · งานระบบไฟฟ้าแสงสว่างภายใน";

async function ถ่าย(page: Page, ฉาก: string, เตรียม: () => Promise<void>) {
  mkdirSync(โฟลเดอร์, { recursive: true });
  for (const j of จอ) {
    await page.setViewportSize({ width: j.w, height: j.h });
    await เตรียม();
    await settle(page).catch(() => {});
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(โฟลเดอร์, `คำขอ-${process.env.PMS_SHOTS}-${ฉาก}-${j.ชื่อ}.png`), fullPage: true });
  }
}

test.beforeAll(async () => {
  const sb = await db(RYG);
  const l = await sb.from("leads").insert({ id: `#L-${เลข}`, num_id: เลข, dealer_code: "RYG", company: บริษัท, name: บริษัท,
    contact: "ผู้ทดสอบ", phone: `08${String(เลข).slice(-8)}`, province: "ระยอง", status: "BULLET" });
  expect(l.error).toBeNull();
  const r = await sb.rpc("quote_request_submit", { p_lead_num_id: เลข, p_product: "โกดังเก็บสินค้า 20x40 ม.", p_area: 800, p_spec: สเปกยาว, p_province: "ระยอง" });
  expect(r.error).toBeNull();
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", [เลข]); });

test("ถ่ายรูป: หน้าคำขอใบเสนอราคา HQ — รายการ · หัวใบ · ตาราง BOQ", async ({ page }) => {
  await loginUI(page, HQ_ORIGIN, "/hq/quote-requests", ADMIN);
  await ถ่าย(page, "รายการ-และ-ใบว่าง", async () => {
    await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await เปิดใบHQในกล่องงาน(page, บริษัท);
  });
});
