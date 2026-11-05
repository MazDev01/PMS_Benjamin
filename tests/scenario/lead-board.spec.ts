import { test, expect, type Page } from "@playwright/test";
import { skipReason } from "./supabaseEnv";
import { DEALER_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle } from "./helpers";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";
import { ลากการ์ด } from "./boardDrag";

// ── บอร์ดลูกค้าเป้าหมายลากได้ (บอสสั่ง 5 พ.ย. 69 · ทับรอบ 4 ที่บอร์ดดูอย่างเดียว · ตัวกลาง StageBoard ตัวเดียวกับบอร์ดผู้สนใจ HQ) ──────
//   ลากทีละ 1 ขั้น = เปิดแผงลีด แล้วทำปุ่มหลักของกล่องขั้นต่อไป (ข้อมูลลูกค้า → ขอราคา HQ = ฟอร์มขอราคา)
//   ข้าม/ถอย = ไม่ได้ + บอกเหตุผล · ปิดไม่สำเร็จ = กล่องเหตุผล (ยกเลิก = การ์ดอยู่ที่เดิม) · ทางย้ายครบ L1–L5 = tests/unit/stageBoards.test.ts
//   สาขาของข้อ (ไม่ชนลีดของข้ออื่น) · ตกบนโค้ดก่อนแก้: บอร์ดดูอย่างเดียว (การ์ดลากไม่ได้ ไม่มีปุ่มย้ายไปขั้น…)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
let ส: สาขาของข้อ;
const เลข = 1_976_000_000 + Math.floor(Math.random() * 400_000) * 10;
const ชื่อบริษัท = () => `ZZTEST บอร์ดลีด ${ส.รหัส}`;
const id = `#L-${เลข}`;
test.beforeAll(async () => {
  ส = await สร้างสาขาของข้อ({ จังหวัด: "ตราด", ภาค: "ตะวันออก" });
  const sb = await db(ส.บัญชี);
  const l = await sb.from("leads").insert({ id, num_id: เลข, dealer_code: ส.รหัส, company: ชื่อบริษัท(), name: ชื่อบริษัท(), contact: "คุณทดสอบบอร์ด",
    phone: "000-000-0401", province: "ตราด", status: "BULLET" });
  expect(l.error, "สร้างลีดของข้อ").toBeNull();
});
test.afterAll(async () => { await ส?.ลบ(); });

const การ์ด = (page: Page) => page.locator(`[data-board-card="${id}"]`);
const คอลัมน์ = (page: Page, k: string) => page.locator(`[data-board-column="${k}"]`);
const อยู่ที่ = (page: Page, k: string, ข้อความ: string) => expect(คอลัมน์(page, k).locator(`[data-board-card="${id}"]`), ข้อความ).toHaveCount(1, { timeout: 20_000 });

test("[ui·dealer] บอร์ดลีด: ลากทีละขั้น = ทางเดียวกับกล่องขั้นต่อไป · ข้าม/ถอยไม่ได้ · ปิดไม่สำเร็จต้องมีเหตุผล", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 950 });
  await loginUI(page, DEALER_ORIGIN, "/login", ส.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/leads`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByPlaceholder("ค้นหาบริษัท ผู้ติดต่อ...").fill(ชื่อบริษัท());
  await page.locator('button[title="บอร์ด"]').click();
  await expect(page.getByRole("region", { name: "บอร์ดลูกค้าเป้าหมาย" })).toBeVisible();
  await อยู่ที่(page, "1", "เริ่มที่ข้อมูลลูกค้า");
  await expect(การ์ด(page), "การ์ดที่ยังเปิดอยู่ลากได้").toHaveAttribute("draggable", "true");

  // ข้ามขั้น (ข้อมูลลูกค้า → ทำใบให้ลูกค้า) = ไม่ได้ + บอกเหตุผล
  await ลากการ์ด(page, การ์ด(page), คอลัมน์(page, "4"));
  await expect(page.getByText(/เลื่อนได้ทีละขั้นไปข้างหน้าเท่านั้น/).first(), "ข้ามขั้น = บอกเหตุผล").toBeVisible();
  await อยู่ที่(page, "1", "ข้ามขั้นไม่ได้ การ์ดอยู่ที่เดิม");

  // ปุ่ม "ย้ายไปขั้น…" = ขั้นถัดไป + ปิดไม่สำเร็จ
  await การ์ด(page).locator("[data-move-menu]").click();
  await expect(การ์ด(page).locator("[data-move-to]")).toHaveText([/^ขอราคา HQ/, /^ปิดไม่สำเร็จ/]);
  await page.keyboard.press("Escape");

  // ลากไปขอราคา HQ = แผงลีดเปิด + ฟอร์มขอราคา (หรือฟอร์มช่องที่ขาดก่อนขอราคา) — ทางเดียวกับปุ่ม "ขอราคาจาก HQ"
  await ลากการ์ด(page, การ์ด(page), คอลัมน์(page, "2"));
  await expect(page.locator('[data-panel="next-step"]'), "ลากแล้วแผงลีดเปิด").toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#qr-product").or(page.getByText(/กรอกช่องที่ขาดก่อน/)).first(), "เปิดฟอร์มขอราคาให้เลย").toBeVisible({ timeout: 20_000 });
  // เปิดแผงแล้วระบบเติมงานขั้นข้อมูลลูกค้าเอง (BULLET → WAITING ยังเป็นขั้น 1) · ยังไม่ส่งคำขอ = ไม่ถึงขั้นขอราคา HQ
  expect(((await (await db(ส.บัญชี)).from("leads").select("status").eq("id", id).single()).data as { status: string }).status, "ยังไม่ส่งคำขอ = ยังไม่ถึงขั้นขอราคา HQ").not.toBe("HQ_PRICING");
  await page.keyboard.press("Escape");

  // ปิดไม่สำเร็จ = กล่องเหตุผล · ยกเลิก = อยู่ที่เดิม
  await ลากการ์ด(page, การ์ด(page), คอลัมน์(page, "7"));
  await expect(page.getByRole("alertdialog"), "ลากไปปิดไม่สำเร็จ = กล่องเหตุผล").toContainText("ปิดไม่สำเร็จ", { timeout: 20_000 });
  await page.getByRole("alertdialog").locator("[data-dialog-cancel]").click();
  await page.keyboard.press("Escape");
  await อยู่ที่(page, "1", "ยกเลิกเหตุผล = การ์ดอยู่ที่เดิม");
  assertNoErrors(errs, "บอร์ดลีด");
});
