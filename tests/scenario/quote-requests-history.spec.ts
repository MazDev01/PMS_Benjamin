import { test, expect, type Page } from "@playwright/test";
import { ADMIN, RYG, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, แถวคำขอ, หน้าต่างใบHQ, ตารางคำขอ, แท็บมุมมองคำขอ, ปุ่มเฉพาะเกินกำหนด, เลือกกลุ่มคำขอ } from "./helpers";
import { รันSQLในฐาน } from "./localDb";
import { เตรียมใบHQ, ล้างใบHQทดสอบ, เลขลูกค้าเป้าหมายทดสอบ } from "./hqQuoteFixture";

// ── หน้าคำขอใบเสนอราคา HQ: ตารางหลัก = ต้องตีราคา · ประวัติคำขอแยก (บอสสั่ง 9 พ.ย. 69 · คงแบบตาราง ทำงานแบบเดิม) ──────────────
//   ข้อมูลของข้อ (ค้นด้วยป้าย): ใหม่ 1 (ต้องตีราคา) · ส่งใบแล้ว 1 · ปิด 1 · ยกเลิกแล้ว 1
//   1) ตารางหลัก: เฉพาะต้องตีราคา · ไม่มีตัวกรองสถานะ · ส่งแล้ว/ปิด/ยกเลิก ไม่อยู่
//   2) ประวัติ: ส่งแล้ว/ปิด/ยกเลิกอยู่ครบ (ตัวกรองสถานะแยกได้) · ไม่มีคำขอต้องตีราคา
//   3) ประวัติแก้ไม่ได้: ไม่มีปุ่มทำใบ · หน้าต่างไม่มีปุ่มบันทึก/ส่ง · ช่องแก้ไม่ได้ · ยกเลิกแล้วยังเปิดดูได้ (ใบ 0280)
//   4) การ์ดเวลาตอบเฉลี่ย / อัตรายกเลิก = เปิดหน้าประวัติ · การ์ดต้องตีราคา = ตารางหลัก
//   ตกบนโค้ดเดิม (6 พ.ย. 69): ตารางเดียวทุกสถานะ ไม่มีแท็บมุมมอง · ตัวกรองสถานะอยู่ตารางหลัก
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.setTimeout(180_000);

const ป้าย = `ZZTEST-ประวัติคำขอ-${Date.now() % 100_000}`;
const เลขลีด: number[] = [];
const ชื่อ = (k: string) => `${ป้าย}-${k}`;
test.beforeAll(async () => {
  // ส่งใบแล้ว 1 (ฐานจริงทุกขั้น) + ส่งใบแล้วที่ตั้งเป็นปิด (lost = ดีลเลอร์แจ้งลูกค้าไม่ซื้อ · กลุ่ม "ปิด" ของ hq_quote_board) 1
  for (const k of ["ส่งแล้ว", "ปิด"]) {
    const ใบ = await เตรียมใบHQ(RYG, { dealerCode: "RYG", company: ชื่อ(k), province: "ระยอง", lines: [{ name: "ZZTEST โครงหลัก", qty: 1, unit: "ชุด", unitCost: 1000 }] });
    เลขลีด.push(ใบ.leadNum);
  }
  // ใหม่ 1 + ยกเลิก 1 (ส่งคำขอจริง แล้วตั้งสถานะที่ฐานทดสอบ)
  const sb = await db(RYG);
  for (const k of ["ใหม่", "ยกเลิก"]) {
    const n = เลขลูกค้าเป้าหมายทดสอบ();
    const l = await sb.from("leads").insert({ id: `#L-${n}`, num_id: n, dealer_code: "RYG", company: ชื่อ(k), name: ชื่อ(k), contact: "ผู้ทดสอบ",
      phone: `000-000-${String(n % 10000).padStart(4, "0")}`, province: "ระยอง", status: "BULLET", project: "ZZTEST งานโกดัง 20x40 ม.", area: "800", note: "ZZTEST สเปกหลังคาเมทัลชีท" });
    expect(l.error).toBeNull();
    เลขลีด.push(n);
    expect((await sb.rpc("quote_request_submit", { p_lead_num_id: n, p_product: "ZZTEST โกดัง" })).error).toBeNull();
  }
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    update public.quote_requests set status = 'lost', closed_at = now() where dealer_code = 'RYG' and lead_num_id = ${เลขลีด[1]};
    update public.quote_requests set status = 'cancelled', closed_at = now(), cancelled_at = now(), cancel_reason = 'ZZTEST ลูกค้าเลื่อนโครงการ', cancelled_by_name = 'ZZTEST ผู้ทดสอบ'
     where dealer_code = 'RYG' and lead_num_id = ${เลขลีด[3]};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง — ตั้งสถานะคำขอของข้อไม่ได้");
});
test.afterAll(() => { ล้างใบHQทดสอบ("RYG", เลขลีด); });

async function เข้าหน้า(page: Page) {
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  await page.goto(`${HQ_ORIGIN}/hq/quote-requests`, { waitUntil: "domcontentloaded" });
  await settle(page);
}
const ตัวกรองสถานะ = (page: Page) => page.getByLabel("กรองตามสถานะคำขอ");

test("[ui·hq] คำขอใบเสนอราคา: ตารางหลัก = ต้องตีราคาเท่านั้น · ส่งแล้ว/ปิด/ยกเลิก อยู่ประวัติ · ตัวกรองสถานะอยู่ในประวัติ", async ({ page }) => {
  const errs = watchErrors(page);
  await เข้าหน้า(page);
  await expect(แท็บมุมมองคำขอ(page, "main"), "ค่าเริ่มต้น = ตารางหลัก").toHaveAttribute("aria-selected", "true");
  await expect(ตัวกรองสถานะ(page), "ตารางหลักไม่มีตัวกรองสถานะ").toHaveCount(0);
  await page.getByLabel("ค้นหาคำขอ").fill(ป้าย);
  await expect(แถวคำขอ(page, ชื่อ("ใหม่")), "ตารางหลัก: คำขอใหม่").toHaveCount(1, { timeout: 20_000 });
  for (const k of ["ส่งแล้ว", "ปิด", "ยกเลิก"])
    await expect(แถวคำขอ(page, ชื่อ(k)), `ตารางหลัก: ไม่มีคำขอ${k}`).toHaveCount(0);
  await expect(แท็บมุมมองคำขอ(page, "main"), "จำนวนบนแท็บ = แถวต้องตีราคาของข้อ").toHaveAttribute("data-count", "1");
  await expect(แท็บมุมมองคำขอ(page, "history"), "จำนวนบนแท็บประวัติ = 3").toHaveAttribute("data-count", "3");

  await แท็บมุมมองคำขอ(page, "history").click();
  await expect(ตัวกรองสถานะ(page), "ประวัติ: ตัวกรองสถานะ ทุกสถานะ").toHaveValue("all");
  await expect(ปุ่มเฉพาะเกินกำหนด(page), "ประวัติ: ไม่มีปุ่มเฉพาะเกินกำหนด").toHaveCount(0);
  await expect(แถวคำขอ(page, ป้าย), "ประวัติ: ส่งแล้ว + ปิด + ยกเลิก").toHaveCount(3, { timeout: 20_000 });
  await expect(แถวคำขอ(page, ชื่อ("ใหม่")), "ประวัติ: ไม่มีคำขอที่ต้องตีราคา").toHaveCount(0);
  for (const [k, ชื่อแถว] of [["quoted", "ส่งแล้ว"], ["done", "ปิด"], ["cancelled", "ยกเลิก"]] as const) {
    await เลือกกลุ่มคำขอ(page, k);
    await expect(แถวคำขอ(page, ชื่อ(ชื่อแถว)), `ประวัติ ตัวกรอง ${k}: มีคำขอ${ชื่อแถว}`).toHaveCount(1, { timeout: 20_000 });
  }
  assertNoErrors(errs, "หน้าคำขอ HQ ตารางหลัก/ประวัติ");
});

test("[ui·hq] ประวัติคำขอ: เปิดดูได้ แก้ไม่ได้ (ไม่มีปุ่มทำใบ · ไม่มีปุ่มบันทึก/ส่ง) · ยกเลิกแล้วยังเปิดดูได้", async ({ page }) => {
  await เข้าหน้า(page);
  await page.getByLabel("ค้นหาคำขอ").fill(ป้าย);
  await แท็บมุมมองคำขอ(page, "history").click();
  await expect(ตารางคำขอ(page), "ประวัติ = ดูอย่างเดียว").toHaveAttribute("data-readonly", "");
  await expect(แถวคำขอ(page, ป้าย)).toHaveCount(3, { timeout: 20_000 });
  await expect(ตารางคำขอ(page).locator("[data-act='make-hq-quote']"), "ประวัติ: ไม่มีปุ่มทำใบ").toHaveCount(0);
  for (const k of ["ส่งแล้ว", "ยกเลิก"]) {
    await แถวคำขอ(page, ชื่อ(k)).click();
    const ใบ = หน้าต่างใบHQ(page);
    await expect(ใบ, `เปิดดูคำขอ${k}ได้`).toBeVisible({ timeout: 20_000 });
    await expect(ใบ.getByRole("button", { name: /บันทึก|ส่งใบ/ }), `คำขอ${k}: ไม่มีปุ่มบันทึก/ส่ง`).toHaveCount(0);
    await expect(ใบ.getByRole("button", { name: "เพิ่มรายการอื่น" }), `คำขอ${k}: เพิ่มรายการไม่ได้`).toHaveCount(0);
    await expect(ใบ.locator("input:not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])"), `คำขอ${k}: ไม่มีช่องที่แก้ได้`).toHaveCount(0);
    if (k === "ยกเลิก") await expect(ใบ.getByTestId("cancel-info"), "ยกเลิกแล้วยังเปิดดูรายละเอียดได้ (ใบ 0280)").toContainText("ZZTEST ลูกค้าเลื่อนโครงการ");
    await ใบ.getByRole("button", { name: "ปิด" }).click();
    await expect(ใบ).toHaveCount(0);
  }
  // เทียบ: ตารางหลักยังทำใบได้
  await แท็บมุมมองคำขอ(page, "main").click();
  await expect(แถวคำขอ(page, ชื่อ("ใหม่")).locator("[data-act='make-hq-quote']"), "ตารางหลัก: ทำใบได้").toBeEnabled();
});

test("[ui·hq] การ์ดเวลาตอบเฉลี่ย / อัตรายกเลิก = เปิดหน้าประวัติ · การ์ดต้องตีราคา = ตารางหลัก", async ({ page }) => {
  await เข้าหน้า(page);
  const การ์ด = (k: string) => page.locator(`[data-kpi-row] [data-kpi="${k}"]`);
  await การ์ด("avg-response").click();
  await expect(แท็บมุมมองคำขอ(page, "history"), "การ์ดเวลาตอบเฉลี่ย → ประวัติ").toHaveAttribute("aria-selected", "true");
  await expect(ตัวกรองสถานะ(page), "เวลาตอบเฉลี่ย → ประวัติทุกสถานะ").toHaveValue("all");
  await การ์ด("todo").click();
  await expect(แท็บมุมมองคำขอ(page, "main"), "การ์ดต้องตีราคา → ตารางหลัก").toHaveAttribute("aria-selected", "true");
  await การ์ด("cancel-rate").click();
  await expect(แท็บมุมมองคำขอ(page, "history"), "การ์ดอัตรายกเลิก → ประวัติ").toHaveAttribute("aria-selected", "true");
  await expect(ตัวกรองสถานะ(page), "อัตรายกเลิก → ประวัติ ยกเลิกแล้ว").toHaveValue("cancelled");
  await page.getByLabel("ค้นหาคำขอ").fill(ป้าย);
  await expect(แถวคำขอ(page, ป้าย), "ประวัติ ยกเลิกแล้ว: คำขอยกเลิกของข้อ").toHaveCount(1, { timeout: 20_000 });
  await การ์ด("overdue").click();
  await expect(แท็บมุมมองคำขอ(page, "main"), "การ์ดเกิน 14 วัน → ตารางหลัก").toHaveAttribute("aria-selected", "true");
  await expect(ปุ่มเฉพาะเกินกำหนด(page), "การ์ดเกิน 14 วัน → เฉพาะเกินกำหนด").toHaveAttribute("aria-pressed", "true");
});
