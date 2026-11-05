import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { ADMIN, skipReason } from "./supabaseEnv";
import { ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, นำเข้าผ่านเมนู } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";

// ── ตั้งค่า › รายการวัสดุ: เพิ่มหลายแถว + นำเข้าจากไฟล์ (บอสสั่ง 5 พ.ย. 69 · ใบ 0279 · บอสตอบ 3 ข้อ = ก) ─────────────────────────────
//   1) เพิ่มวัสดุ = ตารางกรอกหลายแถว · วางหลายแถวจาก Excel · แถวผิด = กรอบแดง ไม่บันทึกทั้งชุด · ผ่าน = บันทึกครั้งเดียว
//   2) นำเข้าจากไฟล์ (ไฟล์ปลอม ชื่อสมมติ): พร้อม / อัปเดตราคา (ราคาเก่า→ใหม่) / ต้องตรวจ (ใช้หน่วยนี้ · ใช้หน่วยเดิม) / ข้าม
//      → นำเข้า: อัปเดตแค่ราคา (เปิดใช้/หน่วยเดิมคงไว้) · ไม่ลบวัสดุที่มี · ยกเลิกทั้งชุด = ลบที่เพิ่ม + คืนราคาเดิม
//   ตกบนโค้ดก่อนแก้: ปุ่มเพิ่มวัสดุเพิ่มแถวเดียวในตาราง · ไม่มีเมนูนำเข้าในหน้ารายการวัสดุ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test.setTimeout(240_000);
const svc = createClient(ADMIN_SUPABASE_URL, ADMIN_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const แท็ก = Date.now() % 100_000;
const ป = (s: string) => `ZZTEST-นำเข้าวัสดุ-${s}-${แท็ก}`;
const หมวด = `ZZTEST-หมวดนำเข้า-${แท็ก}`;
const แถวในฐาน = async () => ((await svc.from("material_templates").select("name, unit, unit_price, active").like("name", `ZZTEST-นำเข้าวัสดุ-%-${แท็ก}`).order("name")).data ?? [])
  .map(r => [r.name, r.unit, Number(r.unit_price), r.active]);

// ชุดนำเข้าของข้อทดสอบ (ไฟล์ชื่อ ZZTEST-ราคาวัสดุ-*) ลบด้วย — แถวที่ชุดจดไว้ลบตามเอง (on delete cascade)
test.afterAll(async () => {
  await svc.from("material_templates").delete().like("name", `ZZTEST-นำเข้าวัสดุ-%-${แท็ก}`);
  await svc.from("material_import_batches").delete().like("file_name", "ZZTEST-ราคาวัสดุ-%");
});

async function เปิดแผง(page: Page) {
  await page.goto(`${HQ_ORIGIN}/hq/settings`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await page.getByRole("button", { name: "รายการวัสดุ" }).click();
  const แผง = page.locator("[data-panel='material-templates']");
  await expect(แผง.getByRole("button", { name: "เพิ่มวัสดุ" })).toBeEnabled({ timeout: 20_000 });
  return แผง;
}

test("[flow·hq] รายการวัสดุ: เพิ่มหลายแถว (วางจาก Excel) · แถวผิดไม่บันทึกทั้งชุด · นำเข้าจากไฟล์ 4 กลุ่ม · ยกเลิกทั้งชุดคืนราคาเดิม", async ({ page }) => {
  const errs = watchErrors(page);
  await page.setViewportSize({ width: 1500, height: 950 });
  await loginUI(page, HQ_ORIGIN, "/hq/login", ADMIN);
  const แผง = await เปิดแผง(page);

  // ── 1) เพิ่มหลายแถว ──
  await แผง.getByRole("button", { name: "เพิ่มวัสดุ" }).click();
  const เพิ่ม = page.getByRole("dialog", { name: "เพิ่มวัสดุ" });
  // วาง 3 แถวจาก Excel ที่ช่องหมวดแถวแรก (แถวที่ 3 ไม่มีหน่วย)
  const ข้อความ = [[หมวด, ป("ก"), "ตร.ม.", "100", "เปิด"], [หมวด, ป("ข"), "ชุด", "1,250.50", "ปิด"], [หมวด, ป("ค"), "", "5", ""]].map(r => r.join("\t")).join("\n");
  await เพิ่ม.getByLabel("หมวด แถว 1").evaluate((el, t) => {
    const dt = new DataTransfer(); dt.setData("text/plain", t);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, ข้อความ);
  await expect(เพิ่ม.locator("[data-add-row]"), "วาง 3 แถว = 3 แถว").toHaveCount(3);
  await expect(เพิ่ม.getByLabel("ราคาต่อหน่วย แถว 2")).toHaveValue("1,250.50");
  await expect(เพิ่ม.getByLabel("เปิดใช้ แถว 2")).not.toBeChecked();
  await เพิ่ม.locator("[data-add-save]").click();
  await expect(เพิ่ม.locator('[data-add-row="3"]'), "แถวผิด (ไม่มีหน่วย) = กรอบแดง").toHaveAttribute("data-invalid", "1");
  await expect(เพิ่ม.getByText("ต้องเลือกหน่วย")).toBeVisible();
  expect(await แถวในฐาน(), "แถวผิด 1 แถว = ไม่บันทึกทั้งชุด").toEqual([]);
  await เพิ่ม.getByLabel("หน่วย แถว 3", { exact: true }).selectOption("เมตร");
  await เพิ่ม.locator("[data-add-save]").click();
  await expect(เพิ่ม).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(แถวในฐาน, { timeout: 20_000, message: "บันทึกครั้งเดียว 3 รายการ" })
    .toEqual([[ป("ก"), "ตร.ม.", 100, true], [ป("ข"), "ชุด", 1250.5, false], [ป("ค"), "เมตร", 5, true]]);

  // ── 2) นำเข้าจากไฟล์ ──
  const ไฟล์ = สร้างไฟล์Xlsx([{ ชื่อ: "รายการวัสดุ", หัวตาราง: ["หมวด", "ชื่อวัสดุ*", "หน่วย*", "ราคาต่อหน่วย (ก่อน VAT)", "เปิดใช้"], แถว: [
    [หมวด, ป("ง"), "ชุด", 300, ""],           // 2 พร้อม (หน่วยในรายการ)
    [หมวด, ป("ก"), "ตร.ม.", 120, "ปิด"],       // 3 อัปเดตราคา 100 → 120 (เปิดใช้ในไฟล์ไม่ใช้กับของเดิม)
    [หมวด, ป("ข"), "แผ่น", 1300, ""],          // 4 ต้องตรวจ หน่วยต่างจากของเดิม (ชุด) → ใช้หน่วยเดิม
    [หมวด, ป("จ"), "กล่อง", 40, ""],           // 5 ต้องตรวจ หน่วยนอกรายการ → ใช้หน่วยนี้
    [หมวด, ป("ฉ"), "ชุด", "สิบบาท", ""],        // 6 ต้องตรวจ ราคาไม่ใช่ตัวเลข → ไม่แก้ = ไม่นำเข้า
    [หมวด, ป("ง"), "ชุด", 310, ""],            // 7 ข้าม ซ้ำในไฟล์
    [หมวด, ป("ช"), "", 1, ""],                // 8 ข้าม ไม่มีหน่วย
    [หมวด, ป("ค"), "เมตร", 5, ""],             // 9 ข้าม ราคาเท่าเดิม
  ] }]);
  await นำเข้าผ่านเมนู(page, "นำเข้าจากไฟล์", "xlsx", { name: `ZZTEST-ราคาวัสดุ-${แท็ก}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await ไฟล์.arrayBuffer()) });
  const กล่อง = page.getByRole("dialog", { name: "นำเข้ารายการวัสดุ" });
  await expect(กล่อง.getByTestId("material-import-file")).toContainText(`ZZTEST-ราคาวัสดุ-${แท็ก}.xlsx`, { timeout: 20_000 });
  const นับ = (g: string) => กล่อง.locator(`[data-material-group="${g}"] [data-count]`);
  await expect(นับ("ready")).toHaveText("1"); await expect(นับ("update")).toHaveText("1"); await expect(นับ("review")).toHaveText("3"); await expect(นับ("skip")).toHaveText("3");
  await กล่อง.locator('[data-material-group="update"]').click();
  await expect(กล่อง.locator('[data-material-import-row="3"] [data-price-change]'), "อัปเดตราคา แสดงราคาเก่า→ใหม่").toHaveText("100.00 → 120.00");
  await กล่อง.locator('[data-material-group="review"]').click();
  await กล่อง.locator('[data-material-import-row="4"] [data-use-old-unit]').click();
  await กล่อง.locator('[data-material-import-row="5"] [data-use-unit]').click();
  await expect(นับ("review"), "แก้ 2 แถว เหลือต้องตรวจ 1 (ราคาผิด)").toHaveText("1");
  await expect(นับ("update")).toHaveText("2"); await expect(นับ("ready")).toHaveText("2");
  await กล่อง.locator("[data-material-import-submit]").click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(แถวในฐาน, { timeout: 20_000, message: "นำเข้า: เพิ่ม ง/จ · อัปเดตแค่ราคา ก/ข · ฉ ไม่นำเข้า · ไม่ลบของเดิม" }).toEqual([
    [ป("ก"), "ตร.ม.", 120, true], [ป("ข"), "ชุด", 1300, false], [ป("ค"), "เมตร", 5, true], [ป("ง"), "ชุด", 300, true], [ป("จ"), "กล่อง", 40, true]]);

  // ── ยกเลิกทั้งชุด = ลบที่เพิ่ม + คืนราคาเดิม ──
  const ชุด = กล่อง.locator("[data-material-batch]").filter({ hasText: `ZZTEST-ราคาวัสดุ-${แท็ก}.xlsx` });
  await expect(ชุด).toContainText("เพิ่ม 2 · อัปเดตราคา 2", { timeout: 20_000 });
  await ชุด.locator("[data-cancel-batch]").click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect.poll(แถวในฐาน, { timeout: 20_000, message: "ยกเลิกทั้งชุด: กลับเป็นก่อนนำเข้า" })
    .toEqual([[ป("ก"), "ตร.ม.", 100, true], [ป("ข"), "ชุด", 1250.5, false], [ป("ค"), "เมตร", 5, true]]);
  await expect(ชุด).toContainText("ยกเลิกแล้ว");
  assertNoErrors(errs, "นำเข้ารายการวัสดุ");
});
