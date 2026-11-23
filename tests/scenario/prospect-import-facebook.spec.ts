import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, นำเข้าผู้สนใจผ่านชีต, เปิดนำเข้าจากชีต } from "./funcHelpers";
import { กดตกลงในกล่องยืนยัน } from "./helpers";
import { settle } from "./helpers";
import { adminClient } from "./testDealers";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";
import { หัวไฟล์เฟซบุ๊ก } from "../../packages/shared/lib/facebookLeadImport";

// ── นำเข้าไฟล์ลีดจาก Facebook Lead Ads ตรง ๆ (บอสสั่ง 20 พ.ย. 69 · ใบ 0292) — ไฟล์ปลอม 2 ชีต หัวตารางเดียวกับของจริง ────────────
//   ⚠️ ไม่ใช้ไฟล์จริง — ชื่อ ZZTEST · เบอร์ p:+6600NNNNNNNN (ปลอม) · อีเมล @example.test
//   ไม่มีหน้าจับคู่คอลัมน์ · อ่านทุกชีต · หน้าตัวอย่าง: จะนำเข้า / ซ้ำ / เบอร์ไม่ครบ / จังหวัดจับคู่ไม่ได้ → กดยืนยัน
//   ฐาน: รอติดต่อ · นัดติดตามวันนี้ (การ์ดถึงกำหนดติดตาม) · Facebook · created_at = วันที่ทิ้งเบอร์ · เบอร์ไม่ครบนำเข้าได้
//   บอสสั่ง 23 พ.ย. 69 (ใบ 0295 · ข้อเดิมตรวจกลับด้าน): เบอร์ซ้ำ = นำเข้า + ป้าย "เบอร์ซ้ำ" (ตาราง/หน้าตัวอย่าง) · ไฟล์เดิมซ้ำ = "เคยนำเข้าแล้ว (ข้าม)"
//   ดึงอัตโนมัติ: สวิตช์ + บันทึกที่ฐาน · ตัวตั้งเวลาไม่ทำงาน = เห็นคำเตือนบนจอ
//   ตกบนโค้ดก่อนแก้ (f4a964f5): ไฟล์ Facebook ไปหน้าจับคู่คอลัมน์ · อ่านแค่ชีตแรก · ไม่มีหน้าตัวอย่างแบบนี้
test.skip(() => skipReason() !== "" || !SERVICE_ROLE_READY, skipReason() || "ต้องมีกุญแจฝั่งเซิร์ฟเวอร์");
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const admin = adminClient();
const แท็ก = `ZZTEST-FB${Date.now() % 100_000}`;
const กลาง = String(100 + Math.floor(Math.random() * 800));   // เลขกลางของเบอร์ปลอม (ไม่ชนรอบอื่น)
const เบอร์ = (n: number) => `p:+6600${กลาง}${String(n).padStart(4, "0")}`;
const ชื่อไฟล์ = `${แท็ก}.xlsx`;
const ไฟล์ = path.join(os.tmpdir(), "pms-prospect-import", ชื่อไฟล์);
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const เมื่อวาน = new Date(Date.now() + 7 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);
// เลขซีเรียลของ "เมื่อวาน 14:24 เวลาไทย" แบบช่องวันที่ของ Google Sheets/Excel (วันนับจาก 30 ธ.ค. 1899 + เศษของวัน)
const ซีเรียลเมื่อวาน = String((Date.parse(`${เมื่อวาน}T14:24:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);

test.beforeAll(async () => {
  const หัว = [...หัวไฟล์เฟซบุ๊ก, "", ""];
  const แถว = (จังหวัด: string, ชื่อ: string, เบอร์: string) => [`${เมื่อวาน}T10:00:00+07:00`, "ZZ แคมเปญตัวแทน", จังหวัด, "zzfb@example.test", ชื่อ, เบอร์, "", ""];
  const blob = สร้างไฟล์Xlsx([
    { ชื่อ: "10.26", หัวตาราง: หัว, แถว: [
      แถว("Khon Kaen", `${แท็ก} หนึ่ง`, เบอร์(1)),
      แถว("ขอนแก่นครับ", `${แท็ก} สอง`, เบอร์(2)),
      แถว("อยากเป็นตัวแทน", `${แท็ก} ไม่มีจังหวัด`, เบอร์(3)),
      แถว("ตราด", `${แท็ก} เบอร์ไม่ครบ`, `p:+6600${กลาง}12`),
    ] },
    { ชื่อ: "11.26", หัวตาราง: หัว, แถว: [แถว("Bangkok", `${แท็ก} ซ้ำในไฟล์`, เบอร์(1))] },
  ]);
  mkdirSync(path.dirname(ไฟล์), { recursive: true });
  writeFileSync(ไฟล์, Buffer.from(await blob.arrayBuffer()));
});
test.afterAll(async () => {
  await admin.from("dealer_prospects").delete().like("name", `${แท็ก}%`);
  await admin.from("prospect_import_batches").delete().like("file_name", `${แท็ก}%`);
});

test("[ui·hq] ไฟล์ Facebook 2 ชีต → หน้าตัวอย่าง → ยืนยัน (เบอร์ซ้ำนำเข้าด้วย) → ฐาน: รอติดต่อ · นัดวันนี้ · Facebook · วันที่ทิ้งเบอร์ · ป้ายเบอร์ซ้ำในตาราง", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await นำเข้าผู้สนใจผ่านชีต(page, ไฟล์);
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ", exact: true });
  const ตัวอย่าง = กล่อง.locator("[data-facebook-preview]");
  await expect(ตัวอย่าง, "ไฟล์ Facebook = หน้าตัวอย่าง (ไม่มีหน้าจับคู่คอลัมน์)").toBeVisible({ timeout: 20_000 });
  await expect(กล่อง.locator("#pi-header"), "ไม่มีหน้าจับคู่คอลัมน์").toHaveCount(0);
  const นับ = (g: string) => ตัวอย่าง.locator(`[data-fb-group="${g}"] [data-count]`);
  await expect(นับ("import"), "จะนำเข้า: หนึ่ง สอง ไม่มีจังหวัด เบอร์ไม่ครบ ซ้ำในไฟล์ (เบอร์ซ้ำนำเข้าด้วย · บอส 23 พ.ย. 69)").toHaveAttribute("data-count", "5");
  await expect(นับ("dup"), "เบอร์ซ้ำ: ชีต 11.26 เบอร์เดียวกับหนึ่ง").toHaveAttribute("data-count", "1");
  await expect(ตัวอย่าง.locator('[data-fb-group="dup"]'), "แท็บบอกว่านำเข้าด้วย").toContainText("เบอร์ซ้ำ (นำเข้าด้วย)");
  await expect(นับ("already")).toHaveAttribute("data-count", "0");
  await expect(นับ("short")).toHaveAttribute("data-count", "1");
  await expect(นับ("noprov")).toHaveAttribute("data-count", "1");
  await expect(ตัวอย่าง.locator('[data-fb-row="10.26:5"] [data-tag="phone-short"]'), "ป้ายเบอร์ไม่ครบ").toHaveText("เบอร์ไม่ครบ");
  await ตัวอย่าง.locator('[data-fb-group="dup"]').click();
  // บอกเต็มว่าซ้ำกับอะไร · ตัดบรรทัดได้ ไม่ตัดด้วย … (บอส 20 พ.ย. 69 "ซ้ำยังไง") · ป้าย "เบอร์ซ้ำ" ที่แถว
  const เหตุผล = ตัวอย่าง.locator('[data-fb-row="11.26:2"] [data-fb-reason]');
  await expect(เหตุผล, "ซ้ำกับใครแสดงก่อนบันทึก").toHaveText(`แถว 10.26:2 (${แท็ก} หนึ่ง) ในไฟล์นี้`);
  expect(await เหตุผล.evaluate(e => e.scrollWidth - e.clientWidth), "ข้อความไม่ถูกตัด").toBeLessThanOrEqual(0);
  await expect(ตัวอย่าง.locator('[data-fb-row="11.26:2"] [data-tag="phone-dup"]')).toHaveText("เบอร์ซ้ำ");
  await กล่อง.getByRole("button", { name: "ยืนยันนำเข้า 5 ราย", exact: true }).click();
  await expect(กล่อง.getByTestId("import-result"), "นำเข้า 5 ราย").toHaveAttribute("data-inserted", "5", { timeout: 30_000 });

  const { data, error } = await admin.from("dealer_prospects").select("name, phone, province, status, follow_up, channel, email, note, created_at, last_contact_at").like("name", `${แท็ก}%`).order("name");
  expect(error).toBeNull();
  expect(data ?? [], "ฐานมี 5 ราย (เบอร์ซ้ำนำเข้าด้วย)").toHaveLength(5);
  for (const p of data ?? []) {
    expect(p, `${p.name}: รอติดต่อ · นัดวันนี้ · Facebook`).toMatchObject({ status: "new", follow_up: วันนี้, channel: "Facebook", email: "zzfb@example.test" });
    expect(new Date(new Date(p.created_at as string).getTime() + 7 * 3_600_000).toISOString().slice(0, 10), `${p.name}: วันที่เข้า = วันที่ทิ้งเบอร์`).toBe(เมื่อวาน);
    expect(p.note as string, "หมายเหตุเก็บโฆษณา").toContain("โฆษณา: ZZ แคมเปญตัวแทน");
    // ใบ 0293 (บอสเลือก 23 พ.ย. 69): วันเวลาที่ทิ้งเบอร์ = created_at + ติดต่อล่าสุด (10:00 เวลาไทย) · หมายเหตุอ่านง่าย
    expect(new Date(p.created_at as string).toISOString(), `${p.name}: วันเวลาเข้า = 10:00 เวลาไทย`).toBe(new Date(`${เมื่อวาน}T10:00:00+07:00`).toISOString());
    expect(p.last_contact_at && new Date(p.last_contact_at as string).toISOString(), `${p.name}: ติดต่อล่าสุด = วันเวลาที่ทิ้งเบอร์`).toBe(new Date(`${เมื่อวาน}T10:00:00+07:00`).toISOString());
    expect(p.note as string, "หมายเหตุวันที่อ่านง่าย ไม่ใช่ค่าดิบ").toMatch(/ทิ้งเบอร์เมื่อ: \d{1,2} \S+ \d{4} 10:00/);
  }
  const หนึ่ง = (data ?? []).find(p => p.name === `${แท็ก} หนึ่ง`);
  expect(หนึ่ง, "จังหวัดอังกฤษจับคู่ได้ · ข้อความเดิมในหมายเหตุ").toMatchObject({ province: "ขอนแก่น", phone: `000-${กลาง}-0001` });
  expect(หนึ่ง?.note).toContain("จังหวัดที่ลูกค้าพิมพ์: Khon Kaen");
  expect((data ?? []).find(p => p.name === `${แท็ก} ไม่มีจังหวัด`)?.province, "จับคู่ไม่ได้ = ว่าง").toBeNull();
  expect((data ?? []).find(p => p.name === `${แท็ก} เบอร์ไม่ครบ`)?.phone, "เบอร์ไม่ครบเก็บตามที่มี").toBe(`000${กลาง}12`);
  expect((data ?? []).find(p => p.name === `${แท็ก} ซ้ำในไฟล์`)?.phone, "เบอร์ซ้ำได้รายใหม่").toBe(`000-${กลาง}-0001`);
  // ตารางผู้สนใจ: ป้าย "เบอร์ซ้ำกับ …" ทั้งสองราย · เบอร์ไม่ครบ = "ข้อมูลไม่ครบ" (ไม่ใช่แค่หน้าตัวอย่าง · คนรวมงาน 23 พ.ย. 69)
  await page.keyboard.press("Escape");
  await page.getByPlaceholder(/ค้นหาชื่อ/).fill(แท็ก);
  const แถวตาราง = (ชื่อ: string) => page.getByRole("row").filter({ hasText: ชื่อ });
  await expect(แถวตาราง(`${แท็ก} ซ้ำในไฟล์`).locator('[data-tag="phone-dup"]')).toContainText(`เบอร์ซ้ำกับ ${แท็ก} หนึ่ง`, { timeout: 20_000 });
  await expect(แถวตาราง(`${แท็ก} หนึ่ง`).locator('[data-tag="phone-dup"]')).toContainText(`${แท็ก} ซ้ำในไฟล์`);
  await expect(แถวตาราง(`${แท็ก} เบอร์ไม่ครบ`).locator('[data-tag="incomplete"]')).toContainText("เบอร์ไม่ครบ");
  await expect(แถวตาราง(`${แท็ก} สอง`).locator("[data-prospect-tags]"), "ข้อมูลครบ ไม่ซ้ำ = ไม่มีป้าย").toHaveCount(0);
  assertNoErrors(errs, "นำเข้าไฟล์ Facebook");
});

test("[ui·hq] นำเข้าไฟล์เดิมซ้ำ = เคยนำเข้าแล้วทั้งหมด (ข้าม) · ปุ่มยืนยันกดไม่ได้", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await นำเข้าผู้สนใจผ่านชีต(page, ไฟล์);
  const ตัวอย่าง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ", exact: true }).locator("[data-facebook-preview]");
  await expect(ตัวอย่าง.locator('[data-fb-group="already"] [data-count]'), "ทุกแถวเคยนำเข้าแล้ว (กุญแจแถว · ใบ 0295)").toHaveAttribute("data-count", "5", { timeout: 20_000 });
  await expect(ตัวอย่าง.locator('[data-fb-group="already"]')).toContainText("เคยนำเข้าแล้ว (ข้าม)");
  await expect(ตัวอย่าง.locator('[data-fb-group="import"] [data-count]')).toHaveAttribute("data-count", "0");
  await expect(ตัวอย่าง.getByRole("button", { name: "ยืนยันนำเข้า 0 ราย", exact: true })).toBeDisabled();
  assertNoErrors(errs, "นำเข้าไฟล์ Facebook ซ้ำ");
});

// ── นำเข้าตรงจากลิงก์ Google Sheets (บอสสั่ง 20 พ.ย. 69) + แถบ "ยกเลิกชุดนี้" หลังนำเข้า ──────────────────────────────────────
//   เส้นทางดึงชีตจริง (/api/v1/prospect-sheet) ตรวจด้วยตัวดึงจำลองใน tests/unit/prospectSheet.test.ts — ข้อนี้จำลองคำตอบของเส้นทาง
//   (ไม่ออกไป Google · ไม่มีลิงก์ชีตจริง) แล้วตรวจว่าหน้าเว็บส่งลิงก์ไป → เข้าหน้าตัวอย่างเดิม → นำเข้า → ยกเลิกชุดนี้ได้
test("[ui·hq] Google Sheets: วางลิงก์ → หน้าตัวอย่างเดิม → นำเข้า → ยกเลิกชุดนี้", async ({ page }) => {
  const errs = watchErrors(page);
  const ลิงก์ = "https://docs.google.com/spreadsheets/d/ZZtest_fake-sheet-id-0000000000/edit#gid=0";
  let ส่งมา: unknown = null;
  await page.route("**/api/v1/prospect-sheet", async route => {
    if (route.request().method() !== "POST") return route.continue();   // GET = สถานะดึงอัตโนมัติ (ใบ 0295) ไปฐานจริง
    ส่งมา = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ fileName: `${แท็ก}-ชีต.xlsx`, sheets: [   // ชื่อชุดขึ้นต้นด้วยป้ายของข้อ — afterAll ลบชุดตาม `${แท็ก}%` (เดิม "Google Sheets ZZtest…" ค้างในฐาน · คนรวมงาน 20 พ.ย. 69)
      
      ["12.26", [[...หัวไฟล์เฟซบุ๊ก], [ซีเรียลเมื่อวาน, "ZZ แคมเปญ", "Songkha", "zzfb@example.test", `${แท็ก} จากชีต`, เบอร์(31)]]],
    ] }) });
  });
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await เปิดนำเข้าจากชีต(page);
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ", exact: true });
  await กล่อง.getByLabel("ลิงก์ Google Sheets", { exact: true }).fill(ลิงก์);
  await กล่อง.getByRole("button", { name: "ดึงข้อมูลจากชีต", exact: true }).click();
  const ตัวอย่าง = กล่อง.locator("[data-facebook-preview]");
  await expect(ตัวอย่าง, "เข้าหน้าตัวอย่างเดิม").toBeVisible({ timeout: 20_000 });
  expect(ส่งมา, "ส่งลิงก์ให้เซิร์ฟเวอร์ดึง (หน้าเว็บไม่ดึงเอง)").toEqual({ url: ลิงก์ });
  await expect(ตัวอย่าง.locator('[data-fb-row="12.26:2"]'), "Songkha = สงขลา").toContainText("สงขลา");
  await กล่อง.getByRole("button", { name: "ยืนยันนำเข้า 1 ราย", exact: true }).click();
  await expect(กล่อง.getByTestId("import-result")).toHaveAttribute("data-inserted", "1", { timeout: 30_000 });
  // created_time เป็นเลขซีเรียล (ช่องวันที่ใน Google Sheets · บั๊กเว็บจริง 23 พ.ย. 69) → ฐานได้วันเวลาไทยที่ถูก + ติดต่อล่าสุด · หมายเหตุไม่ใช่ตัวเลข
  const { data: จากชีต } = await admin.from("dealer_prospects").select("created_at, last_contact_at, note").eq("name", `${แท็ก} จากชีต`).single();
  const ควรเป็น = new Date(`${เมื่อวาน}T14:24:00+07:00`).toISOString();
  expect(new Date(จากชีต!.created_at as string).toISOString(), "ซีเรียล → วันเวลาเข้า 14:24 เวลาไทย").toBe(ควรเป็น);
  expect(new Date(จากชีต!.last_contact_at as string).toISOString(), "ติดต่อล่าสุด = วันเวลาที่ทิ้งเบอร์").toBe(ควรเป็น);
  expect(จากชีต!.note as string, "หมายเหตุไม่มีเลขซีเรียลดิบ").not.toContain(ซีเรียลเมื่อวาน);
  const แถบ = กล่อง.locator("[data-batch-undo]");
  await แถบ.getByRole("button", { name: "ยกเลิกชุดนี้", exact: true }).click({ timeout: 20_000 });
  await กดตกลงในกล่องยืนยัน(page);
  await expect(แถบ, "ยกเลิกแล้ว").toContainText("ยกเลิกชุดนี้แล้ว", { timeout: 20_000 });
  const { count } = await admin.from("dealer_prospects").select("id", { count: "exact", head: true }).eq("name", `${แท็ก} จากชีต`);
  expect(count, "ยกเลิกชุดแล้วไม่เหลือราย").toBe(0);
  assertNoErrors(errs, "นำเข้าจาก Google Sheets");
});

// ── ดึงอัตโนมัติทุกชั่วโมง (บอสสั่ง 23 พ.ย. 69 · ใบ 0295) — สวิตช์ + ลิงก์เก็บที่ฐาน · บันทึกการใช้งาน · ตัวตั้งเวลาไม่ทำงาน = เตือนบนจอ ──
//   ไม่กด "ดึงตอนนี้" (เซิร์ฟเวอร์จะออกไป Google) — ตัวดึงหนึ่งรอบตรวจด้วยชีต/ฐานจำลองใน tests/unit/prospectSheetSync.test.ts
//   ฐานทดสอบไม่มีค่า Vault ของงานตั้งเวลา → ต้องขึ้นคำเตือน (ไม่เงียบ) · คืนค่าตั้งเดิมท้ายข้อ
test("[ui·hq] ดึงอัตโนมัติ: เปิดสวิตช์ + บันทึก → ฐานเก็บลิงก์ · บันทึกการใช้งาน · เตือนตัวตั้งเวลาไม่ทำงาน · ปิดได้", async ({ page }) => {
  const errs = watchErrors(page);
  const { data: เดิม } = await admin.from("prospect_sheet_sync").select("url, enabled").eq("id", 1).single();
  const ลิงก์ = `https://docs.google.com/spreadsheets/d/ZZtest_auto_${แท็ก.replace(/\W/g, "")}_000000/edit`;
  try {
    await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
    await settle(page);
    await เปิดนำเข้าจากชีต(page);
    const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ", exact: true });
    const ซิงก์ = กล่อง.locator("[data-sheet-sync]");
    await expect(ซิงก์).toBeVisible({ timeout: 20_000 });
    await กล่อง.getByLabel("ลิงก์ Google Sheets", { exact: true }).fill(ลิงก์);
    await ซิงก์.getByRole("switch", { name: "ดึงอัตโนมัติทุกชั่วโมง", exact: true }).check();
    await ซิงก์.getByRole("button", { name: "บันทึกการตั้งค่า", exact: true }).click();
    await expect.poll(async () => (await admin.from("prospect_sheet_sync").select("url, enabled").eq("id", 1).single()).data, { timeout: 20_000 })
      .toEqual({ url: ลิงก์, enabled: true });
    await expect(ซิงก์.locator("[data-sheet-sync-warning]"), "ฐานทดสอบไม่มีตัวตั้งเวลาที่ทำงาน = เห็นคำเตือน").toBeVisible();
    await expect(ซิงก์.getByRole("button", { name: "ดึงตอนนี้", exact: true }), "บันทึกแล้ว = กดดึงตอนนี้ได้").toBeEnabled();
    const { data: บันทึก } = await admin.from("audit_log").select("action, target").eq("action", "เปิดดึงผู้สนใจจากชีตอัตโนมัติ").order("id", { ascending: false }).limit(1);
    expect(บันทึก?.[0]?.target, "บันทึกการใช้งานลงรหัสชีตย่อ ไม่ลงลิงก์เต็ม").toBe("ชีต ZZtest…");
    await ซิงก์.getByRole("switch", { name: "ดึงอัตโนมัติทุกชั่วโมง", exact: true }).uncheck();
    await ซิงก์.getByRole("button", { name: "บันทึกการตั้งค่า", exact: true }).click();
    await expect.poll(async () => (await admin.from("prospect_sheet_sync").select("enabled").eq("id", 1).single()).data?.enabled, { timeout: 20_000 }).toBe(false);
    await expect(ซิงก์.locator("[data-sheet-sync-warning]"), "ปิดอยู่ = ไม่เตือน").toHaveCount(0);
    assertNoErrors(errs, "ตั้งดึงอัตโนมัติ");
  } finally {
    await admin.from("prospect_sheet_sync").update({ url: เดิม?.url ?? "", enabled: เดิม?.enabled ?? false }).eq("id", 1);
  }
});
