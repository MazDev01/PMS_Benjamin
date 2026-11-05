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
  // กฎปี (บอสตัดสิน 4 พ.ย. 69): วันเริ่มติดต่อที่เลยวันนี้ = ปีก่อน · วันติดตามไม่ก่อนวันเริ่ม (ใกล้ที่สุด)
  const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const ปีเริ่ม = (mmdd: string) => (`${ปี}-${mmdd}` > วันนี้ ? ปี - 1 : ปี);
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
  expect(ของ(1)).toMatchObject({ name: `${แท็ก} เพจหนึ่ง`, province: "บุรีรัมย์", first_contact: `${ปีเริ่ม("08-24")}-08-24`, status: "contacted", channel: "Facebook" });
  expect(ของ(2)).toMatchObject({ province: "นราธิวาส", status: "profile_sent", channel: "LINE ส่วนตัว" });
  expect(ของ(2).note).toContain("จังหวัดอื่นในไฟล์: ปัตตานี ยะลา");
  // ใบ 0277 (ตรวจกลับด้าน — เดิม follow_up = วันติดตามในไฟล์): ช่อง "ติดตาม" = วันที่ตามไปแล้ว → นัดติดตามว่างเสมอ (บอสสั่ง 5 พ.ย. 69)
  //   ติดตาม 18.4 หลังเริ่ม 25.8 = เม.ย. ปีถัดไป · ยังไม่ถึง = เกินวันนี้ → ไม่ลงวันนั้น เก็บค่าเดิมในหมายเหตุ (N6)
  expect(ของ(3)).toMatchObject({ province: "อุบลราชธานี", status: "lost", lost_reason: "เงินทุนไม่พอ", first_contact: `${ปีเริ่ม("08-25")}-08-25`, follow_up: null });
  if (`${ปีเริ่ม("08-25") + 1}-04-18` > วันนี้) expect(ของ(3).note ?? "", "วันติดตามเกินวันนี้ → ค่าเดิมอยู่ในหมายเหตุ").toContain("วันติดตามในไฟล์: 18.4");
  expect(ของ(4)).toMatchObject({ name: `${แท็ก} รวม สกุลรวม`, province: "นครสวรรค์" });
  assertNoErrors(errs, "นำเข้าผู้สนใจ");
});

test("[db·hq] นำเข้าเบอร์เดิมซ้ำ = ฐานไม่สร้างซ้ำ · มีรายถูกบันทึกการติดต่อ = ยกเลิกทั้งชุดไม่ได้ (หน้าจอ + ยิงตรง) · ชุดที่ยังไม่แตะ = ยกเลิกได้", async ({ page }) => {
  const sb = await db(ADMIN);
  const ซ้ำ = await sb.rpc("hq_prospects_import", { p_file: `${แท็ก}-ซ้ำ.xlsx`, p_rows: [{ row: 1, name: `${แท็ก} ซ้ำอีกรอบ`, phone: เบอร์(1), status: "new" }] });
  expect(ซ้ำ.error).toBeNull();
  expect((ซ้ำ.data as { inserted: number; skipped: { reason: string }[] }).inserted, "เบอร์มีอยู่แล้ว = ไม่สร้าง").toBe(0);
  expect((ซ้ำ.data as { skipped: { reason: string }[] }).skipped[0].reason).toBe("เบอร์นี้มีผู้สนใจอยู่แล้ว");
  // ชุดแรก: บันทึกการติดต่อ 1 ราย หลังนำเข้า → ถูกแตะ
  const { data: ราย } = await sb.from("dealer_prospects").select("id, import_batch_id").eq("phone", เบอร์จัดรูป(1)).single();
  const ชุดแรก = Number(ราย!.import_batch_id);
  expect((await sb.from("dealer_prospect_activities").insert({ prospect_id: ราย!.id, kind: "contact", channel: "โทรศัพท์", body: `${แท็ก} โทรหลังนำเข้า` })).error).toBeNull();
  const ยิงตรง = await sb.rpc("hq_prospects_import_cancel", { p_batch: ชุดแรก });
  expect(ยิงตรง.error?.message ?? "", "ยิงตรงเข้าฐานก็ยกเลิกไม่ได้").toMatch(/import_in_use/);
  // ชุดที่สอง (ยังไม่แตะ) — ยกเลิกได้บนหน้าจอ
  const ชุดสอง = await sb.rpc("hq_prospects_import", { p_file: `${แท็ก}-สอง.xlsx`, p_rows: [{ row: 1, name: `${แท็ก} ชุดสอง`, phone: เบอร์(9), status: "contacted", contact_note: "รอโทรกลับ" }] });
  expect((ชุดสอง.data as { inserted: number }).inserted).toBe(1);

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByRole("button", { name: "นำเข้าจากไฟล์" }).click();
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ" });
  const รายการ = กล่อง.getByRole("region", { name: "ชุดที่นำเข้าล่าสุด" });
  const แรก = รายการ.locator(`li[data-batch="${ชุดแรก}"]`);
  await expect(แรก.getByTestId("batch-touched"), "บอกว่ากี่รายถูกแตะแล้ว").toHaveText("ถูกแตะแล้ว 1 ราย — ยกเลิกทั้งชุดไม่ได้", { timeout: 20_000 });
  await expect(แรก.getByRole("button", { name: "ยกเลิกทั้งชุด" }), "ปุ่มยกเลิกใช้ไม่ได้").toBeDisabled();
  const สอง = รายการ.locator("li").filter({ hasText: `${แท็ก}-สอง.xlsx` });
  await expect(สอง.getByTestId("batch-touched"), "ชุดที่ไม่แตะ (บันทึกการติดต่อแรกจากไฟล์ไม่นับ)").toHaveCount(0);
  await สอง.getByRole("button", { name: "ยกเลิกทั้งชุด" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect(สอง.getByText("ยกเลิกแล้ว")).toBeVisible({ timeout: 20_000 });
  const { count } = await sb.from("dealer_prospects").select("id", { count: "exact", head: true }).eq("name", `${แท็ก} ชุดสอง`);
  expect(count, "ยกเลิกทั้งชุดแล้วไม่เหลือรายของชุด").toBe(0);
  const { count: ชุดแรกเหลือ } = await sb.from("dealer_prospects").select("id", { count: "exact", head: true }).eq("import_batch_id", ชุดแรก);
  expect(ชุดแรกเหลือ, "ชุดที่ถูกแตะยังอยู่ครบ").toBe(4);
});

// ── หน้าตรวจ: วันที่กำกวมต้องเลือกเดือน · ช่องบังคับของแถว (บอสสั่ง 4 พ.ย. 69) ─────────────────────────────────────────────
//   วันที่ "5.1" (ไฟล์ตัดเลข 0 ท้าย) = 5 ม.ค. หรือ 5 ต.ค. — ยังไม่เลือกเดือน = ปุ่มยืนยันกดไม่ได้ · เลือกแล้วฐานได้วันที่เลือกจริง
//   ชื่อเว้นว่าง / ขั้นไม่สำเร็จไม่มีเหตุผล = กดยืนยันแล้วแถวยังต้องตรวจ · กรอบแดง + ข้อความใต้ช่อง (ตัวกลาง) · แก้แล้วยืนยันได้
//   ตกบนโค้ดก่อน c0ddcd7 (ไม่มีช่องเลือกเดือน) และก่อนตัวกลางในหน้าตรวจ (ยืนยันแถวชื่อว่างได้)
test("[ui·hq] หน้าตรวจนำเข้า: วันที่กำกวมเลือกเดือนก่อนยืนยัน · ชื่อ/เหตุผลเป็นช่องบังคับของแถว", async ({ page }) => {
  const errs = watchErrors(page);
  const ไฟล์2 = path.join(os.tmpdir(), "pms-prospect-import", `${แท็ก}-เดือน.xlsx`);
  const หัว = ["", "social", "เบอร์", "จังหวัด", "ชื่อ", "เริ่มติดต่อ", "ติดตาม", "Type", "หมายหตุ", "Channel"];
  const blob = สร้างไฟล์Xlsx([{ ชื่อ: "ลูกค้ารอสรุป PEB", หัวตาราง: หัว, แถว: [
    ["1", `${แท็ก} เพจกำกวม`, เบอร์(21), "บุรีรัมย์", `${แท็ก} กำกวม`, "5.1", "", "", "ไม่มีคนรับ", "FB"],
  ] }]);
  writeFileSync(ไฟล์2, Buffer.from(await blob.arrayBuffer()));

  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await page.getByRole("button", { name: "นำเข้าจากไฟล์" }).click();
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ" });
  await กล่อง.getByLabel("ไฟล์ผู้สนใจ").setInputFiles(ไฟล์2);
  await expect(กล่อง.getByTestId("import-file")).toContainText(`${แท็ก}-เดือน.xlsx`, { timeout: 20_000 });
  await กล่อง.getByRole("button", { name: "ไปหน้าตรวจ" }).click();
  const นับ = (g: string) => กล่อง.locator(`[role="tab"][data-group="${g}"] [data-count]`);
  await expect(นับ("review"), "วันที่กำกวม = ต้องตรวจ").toHaveAttribute("data-count", "1");
  const ตรวจ = กล่อง.getByRole("table", { name: "แถวต้องตรวจ" });
  const แถว = ตรวจ.locator("tr").filter({ hasText: เบอร์จัดรูป(21) });
  for (const หัวช่อง of ["ชื่อ", "เบอร์"]) {
    await expect(ตรวจ.getByRole("columnheader", { name: new RegExp(`^${หัวช่อง}`) }).locator("[data-required]"), `หัว ${หัวช่อง} มี * แดง`).toHaveCount(1);
  }

  // 1) ยังไม่เลือกเดือน = ยืนยันไม่ได้
  const เดือน = แถว.locator("select[data-date-choice='firstContact']");
  await expect(เดือน, "มีช่องเลือกเดือนของวันเริ่มติดต่อ").toBeVisible();
  const ตัวเลือก = (await เดือน.locator("option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))).filter(Boolean);
  expect(ตัวเลือก.map(d => d.slice(5, 7)).sort(), "5.1 = ม.ค. หรือ ต.ค.").toEqual(["01", "10"]);
  const ยืนยันแถว = แถว.getByRole("button", { name: /^ยืนยัน แถว/ });
  await expect(ยืนยันแถว, "ยังไม่เลือกเดือน = ยืนยันไม่ได้").toBeDisabled();
  await expect(กล่อง.getByRole("button", { name: "นำเข้า 0 ราย" }), "ยังไม่มีแถวพร้อม = นำเข้าไม่ได้").toBeDisabled();
  const ตุลา = ตัวเลือก.find(d => d.slice(5, 7) === "10")!;
  await เดือน.selectOption(ตุลา);
  await expect(ยืนยันแถว, "เลือกเดือนแล้ว = ยืนยันได้").toBeEnabled();

  // 2) ชื่อเว้นว่าง → กดยืนยัน = ยังต้องตรวจ · กรอบแดง + ข้อความใต้ช่อง
  const ชื่อ = แถว.getByLabel(/^ชื่อ แถว/);
  await ชื่อ.fill("  ");
  await ยืนยันแถว.click();
  await expect(ชื่อ, "ชื่อว่าง = กรอบแดง").toHaveAttribute("aria-invalid", "true");
  await expect(แถว.locator("[data-field-error]"), "ข้อความใต้ช่องชื่อ").toHaveText("ต้องระบุชื่อ");
  await expect(นับ("review"), "ยังต้องตรวจ").toHaveAttribute("data-count", "1");

  // 3) ขั้นไม่สำเร็จไม่เลือกเหตุผล → กดยืนยัน = ยังต้องตรวจ · ข้อความใต้ช่องเหตุผล
  await ชื่อ.fill(`${แท็ก} กำกวม แก้ชื่อ`);
  await expect(แถว.locator("[data-field-error]"), "แก้ชื่อแล้วข้อความหาย").toHaveCount(0);
  await แถว.getByLabel(/^ขั้น แถว/).selectOption("lost");
  await ยืนยันแถว.click();
  await expect(แถว.getByLabel(/^เหตุผล แถว/), "ไม่มีเหตุผล = กรอบแดง").toHaveAttribute("aria-invalid", "true");
  await expect(แถว.locator("[data-field-error]")).toHaveText("ต้องเลือกเหตุผลที่ไม่สำเร็จ");
  await แถว.getByLabel(/^ขั้น แถว/).selectOption("contacted");
  await ยืนยันแถว.click();
  await expect(นับ("ready"), "ครบแล้วยืนยันได้ → พร้อม").toHaveAttribute("data-count", "1");

  await กล่อง.getByRole("button", { name: "นำเข้า 1 ราย" }).click();
  await กดตกลงในกล่องยืนยัน(page);
  await expect(กล่อง.getByTestId("import-result")).toHaveAttribute("data-inserted", "1", { timeout: 30_000 });
  const { data } = await (await db(ADMIN)).from("dealer_prospects").select("name, first_contact, status").eq("phone", เบอร์จัดรูป(21)).single();
  expect(data, "ฐานได้ชื่อที่แก้ · วันเริ่มติดต่อ = เดือนที่เลือก").toMatchObject({ name: `${แท็ก} กำกวม แก้ชื่อ`, first_contact: ตุลา, status: "contacted" });
  assertNoErrors(errs, "หน้าตรวจนำเข้า: เลือกเดือน + ช่องบังคับ");
});
