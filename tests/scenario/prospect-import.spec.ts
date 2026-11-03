import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, db, loginUI, watchErrors, assertNoErrors } from "./funcHelpers";
import { settle, กดตกลงในกล่องยืนยัน } from "./helpers";
import { adminClient } from "./testDealers";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";

// ── นำเข้าผู้สนใจจากไฟล์ทำงานจริงของทีม (HQ · ใบ 0275 · บอสสั่ง 3 พ.ย. 69) — ไฟล์ปลอมโครงเดียวกับไฟล์จริง ─────────────────────
//   ⚠️ ไม่ใช้ไฟล์จริง (มีชื่อ/เบอร์คนจริง) — ชื่อปลอม ZZTEST · เบอร์ 000-NNN-NNNN
//   หัวตารางแถว 2 · แถวหัวข้อแทรก ("BJM PEB" · "BJM PEB โทรแล้ว") ถูกข้าม · แถวรวมช่องเดียว → ต้องตรวจ · จังหวัดย่อจับคู่ถูก
//   24.8 + ปีที่เลือก → วันที่ถูก · เบอร์ซ้ำในไฟล์ → ข้าม · นำเข้าซ้ำ → ฐานไม่สร้างซ้ำ · ยกเลิกทั้งชุดได้
//   ตกบนโค้ดก่อนใบ 0275: ไม่มีปุ่ม/คำสั่งนำเข้า
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const admin = adminClient();
const แท็ก = `ZZTEST-PIMP${Date.now() % 100_000}`;
const กลาง = String(100 + Math.floor(Math.random() * 800));   // เลขกลางของเบอร์ปลอม (ไม่ชนรอบอื่น)
const เบอร์ = (n: number) => `000 ${กลาง} ${String(n).padStart(4, "0")}`;
const เบอร์จัดรูป = (n: number) => `000-${กลาง}-${String(n).padStart(4, "0")}`;
const ชื่อไฟล์ = `${แท็ก}.xlsx`;
const ไฟล์ = path.join(os.tmpdir(), "pms-prospect-import", ชื่อไฟล์);

test.beforeAll(async () => {
  const หัว = ["", "social", "เบอร์", "จังหวัด", "ชื่อ", "เริ่มติดต่อ", "ติดตาม", "Type", "หมายหตุ", "Channel", "Total", "DM", "Ad Run", "BD", "Website", "SEO",
    "Branding", "Production", "AI", "DEV", "Other", "note"];
  const blob = สร้างไฟล์Xlsx([{ ชื่อ: "ลูกค้ารอสรุป PEB", หัวตาราง: ["", "", "รอนัดหมาย"], แถว: [
    หัว,
    [],
    ["", "", "BJM PEB"],
    ["31", `${แท็ก} เพจหนึ่ง`, เบอร์(1), "บุรีรัมย์", "", "24.8", "", "", "ไม่มีคนรับ", "FB"],
    ["34", `${แท็ก} เพจสอง`, เบอร์(2), "นราธิวาส ปัตตานี ยะลา", `${แท็ก} สอง`, "25.8", "", "ทำอสังหาฯ", "ส่ง Company Profiles แล้ว", "Line Pu"],
    ["37", `${แท็ก} เพจสาม`, เบอร์(3), "อุบล", `${แท็ก} สาม`, "25.8", "18.4", "", "ไม่มีทุน", "Line OA", "", "DM ปลอม"],
    ["", "", "BJM PEB โทรแล้ว"],
    ["40", "", `${แท็ก} รวม สกุลรวม ${เบอร์(4)} นครสวรรค์`],
    ["41", `${แท็ก} เพจซ้ำ`, ` ${เบอร์(1)} `, "กทม", `${แท็ก} ซ้ำ`, "26.8", "", "", "รอโทรกลับ", "Direct"],
  ] }]);
  mkdirSync(path.dirname(ไฟล์), { recursive: true });
  writeFileSync(ไฟล์, Buffer.from(await blob.arrayBuffer()));
});
test.afterAll(async () => {
  await admin.from("dealer_prospects").delete().like("name", `${แท็ก}%`);
  await admin.from("prospect_import_batches").delete().like("file_name", `${แท็ก}%`);
});

test("[ui·hq] นำเข้าไฟล์ทำงานจริง (ปลอม): หัวตารางแถว 2 · ข้ามแถวหัวข้อ · แถวรวม → ต้องตรวจ · จังหวัดย่อ · 24.8 + ปี · เบอร์ซ้ำข้าม", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByRole("button", { name: "นำเข้าจากไฟล์" }).click();
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ" });
  await กล่อง.getByLabel("ไฟล์ผู้สนใจ").setInputFiles(ไฟล์);
  await expect(กล่อง.getByTestId("import-file")).toContainText(ชื่อไฟล์, { timeout: 20_000 });
  await expect(กล่อง.locator("#pi-header"), "หาหัวตารางเจอที่แถว 2 (ไม่ใช่แถวแรก)").toHaveValue("1");
  await expect(กล่อง.getByLabel("คอลัมน์ เบอร์โทร"), "เดาคอลัมน์เบอร์").toHaveValue("2");
  await expect(กล่อง.getByLabel("คอลัมน์ จังหวัด")).toHaveValue("3");
  const ปี = new Date(Date.now() + 7 * 3_600_000).getUTCFullYear();
  await expect(กล่อง.locator("#pi-year"), "ถามปีครั้งเดียว (ค่าตั้งต้นปีนี้)").toHaveValue(String(ปี + 543));
  // ตารางแปลงช่องทาง (แก้ได้)
  await expect(กล่อง.getByLabel("แหล่งที่มาของ FB")).toHaveValue("Facebook");
  await expect(กล่อง.getByLabel("แหล่งที่มาของ Line Pu")).toHaveValue("LINE ส่วนตัว");
  await กล่อง.getByRole("button", { name: "ไปหน้าตรวจ" }).click();

  const นับ = (g: string) => กล่อง.locator(`[role="tab"][data-group="${g}"] [data-count]`);
  await expect(นับ("ready"), "พร้อม: เพจหนึ่ง + สอง").toHaveAttribute("data-count", "1");
  await expect(นับ("review"), "ต้องตรวจ: หลายจังหวัด · อุบล · แถวรวม").toHaveAttribute("data-count", "3");
  await expect(นับ("skip"), "ข้าม: เบอร์ซ้ำในไฟล์").toHaveAttribute("data-count", "1");
  await expect(กล่อง.getByText(/แถวหัวข้อแทรกที่ข้าม 2 แถว/)).toBeVisible();
  const ตรวจ = กล่อง.getByRole("table", { name: "แถวต้องตรวจ" });
  await expect(ตรวจ.getByText(/แถวรวมช่องเดียว/), "แถวรวมอยู่กลุ่มต้องตรวจ").toBeVisible();
  // จังหวัดย่อจับคู่ถูก (อุบล → อุบลราชธานี) · ยืนยันทุกแถวที่ต้องตรวจ
  const แถวอุบล = ตรวจ.locator("tr").filter({ hasText: เบอร์จัดรูป(3) });
  await expect(แถวอุบล.locator("select[aria-label^='จังหวัด']")).toHaveValue("อุบลราชธานี");
  for (const n of [2, 3, 4]) await ตรวจ.locator("tr").filter({ hasText: เบอร์จัดรูป(n) }).getByRole("button", { name: /^ยืนยัน แถว/ }).click();
  await expect(นับ("ready")).toHaveAttribute("data-count", "4");
  await กล่อง.getByRole("button", { name: "นำเข้า 4 ราย" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect(กล่อง.getByTestId("import-result"), "นำเข้า 4 ราย").toHaveAttribute("data-inserted", "4", { timeout: 30_000 });

  const sb = await db(ADMIN);
  const { data } = await sb.from("dealer_prospects").select("name, phone, province, first_contact, follow_up, status, lost_reason, channel, note, social").like("name", `${แท็ก}%`);
  const ของ = (n: number) => (data ?? []).find(r => r.phone === เบอร์จัดรูป(n))!;
  expect(data ?? [], "เบอร์ซ้ำในไฟล์ไม่สร้างซ้ำ").toHaveLength(4);
  expect(ของ(1)).toMatchObject({ name: `${แท็ก} เพจหนึ่ง`, province: "บุรีรัมย์", first_contact: `${ปี}-08-24`, status: "contacted", channel: "Facebook" });
  expect(ของ(2)).toMatchObject({ province: "นราธิวาส", status: "profile_sent", channel: "LINE ส่วนตัว" });
  expect(ของ(2).note).toContain("จังหวัดอื่นในไฟล์: ปัตตานี ยะลา");
  expect(ของ(3)).toMatchObject({ province: "อุบลราชธานี", status: "lost", lost_reason: "เงินทุนไม่พอ", follow_up: `${ปี}-04-18` });
  expect(ของ(4)).toMatchObject({ name: `${แท็ก} รวม สกุลรวม`, province: "นครสวรรค์" });
  assertNoErrors(errs, "นำเข้าผู้สนใจ");
});

test("[db·hq] นำเข้าเบอร์เดิมซ้ำ = ฐานไม่สร้างซ้ำ · ยกเลิกทั้งชุดบนหน้าจอ = ลบรายของชุด", async ({ page }) => {
  const sb = await db(ADMIN);
  const ซ้ำ = await sb.rpc("hq_prospects_import", { p_file: `${แท็ก}-ซ้ำ.xlsx`, p_rows: [{ row: 1, name: `${แท็ก} ซ้ำอีกรอบ`, phone: เบอร์(1), status: "new" }] });
  expect(ซ้ำ.error).toBeNull();
  expect((ซ้ำ.data as { inserted: number; skipped: { reason: string }[] }).inserted, "เบอร์มีอยู่แล้ว = ไม่สร้าง").toBe(0);
  expect((ซ้ำ.data as { skipped: { reason: string }[] }).skipped[0].reason).toBe("เบอร์นี้มีผู้สนใจอยู่แล้ว");

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByRole("button", { name: "นำเข้าจากไฟล์" }).click();
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ" });
  const ชุด = กล่อง.getByRole("region", { name: "ชุดที่นำเข้าล่าสุด" }).locator("li").filter({ hasText: ชื่อไฟล์ });
  await ชุด.getByRole("button", { name: "ยกเลิกทั้งชุด" }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect(ชุด.getByText("ยกเลิกแล้ว")).toBeVisible({ timeout: 20_000 });
  const { count } = await sb.from("dealer_prospects").select("id", { count: "exact", head: true }).like("name", `${แท็ก}%`);
  expect(count, "ยกเลิกทั้งชุดแล้วไม่เหลือรายของชุด").toBe(0);
});
