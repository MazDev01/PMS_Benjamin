import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ADMIN, skipReason } from "./supabaseEnv";
import { SERVICE_ROLE_READY } from "./adminEnv";
import { HQ_ORIGIN, loginUI, watchErrors, assertNoErrors, นำเข้าผ่านเมนู } from "./funcHelpers";
import { settle } from "./helpers";
import { adminClient } from "./testDealers";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";
import { หัวไฟล์เฟซบุ๊ก } from "../../packages/shared/lib/facebookLeadImport";

// ── นำเข้าไฟล์ลีดจาก Facebook Lead Ads ตรง ๆ (บอสสั่ง 20 พ.ย. 69 · ใบ 0292) — ไฟล์ปลอม 2 ชีต หัวตารางเดียวกับของจริง ────────────
//   ⚠️ ไม่ใช้ไฟล์จริง — ชื่อ ZZTEST · เบอร์ p:+6600NNNNNNNN (ปลอม) · อีเมล @example.test
//   ไม่มีหน้าจับคู่คอลัมน์ · อ่านทุกชีต · หน้าตัวอย่าง: จะนำเข้า / ซ้ำ / เบอร์ไม่ครบ / จังหวัดจับคู่ไม่ได้ → กดยืนยัน
//   ฐาน: รอติดต่อ · นัดติดตามวันนี้ (การ์ดถึงกำหนดติดตาม) · Facebook · created_at = วันที่ทิ้งเบอร์ · เบอร์ไม่ครบนำเข้าได้ · นำเข้าซ้ำไม่สร้างซ้ำ
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

test("[ui·hq] ไฟล์ Facebook 2 ชีต → หน้าตัวอย่าง 4 ตัวเลข → ยืนยัน → ฐาน: รอติดต่อ · นัดวันนี้ · Facebook · วันที่ทิ้งเบอร์", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await นำเข้าผ่านเมนู(page, "นำเข้าจากไฟล์", "xlsx", ไฟล์);
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ", exact: true });
  const ตัวอย่าง = กล่อง.locator("[data-facebook-preview]");
  await expect(ตัวอย่าง, "ไฟล์ Facebook = หน้าตัวอย่าง (ไม่มีหน้าจับคู่คอลัมน์)").toBeVisible({ timeout: 20_000 });
  await expect(กล่อง.locator("#pi-header"), "ไม่มีหน้าจับคู่คอลัมน์").toHaveCount(0);
  const นับ = (g: string) => ตัวอย่าง.locator(`[data-fb-group="${g}"] [data-count]`);
  await expect(นับ("import"), "จะนำเข้า: หนึ่ง สอง ไม่มีจังหวัด เบอร์ไม่ครบ").toHaveAttribute("data-count", "4");
  await expect(นับ("dup"), "ซ้ำ: ชีต 11.26 เบอร์เดียวกับหนึ่ง").toHaveAttribute("data-count", "1");
  await expect(นับ("short")).toHaveAttribute("data-count", "1");
  await expect(นับ("noprov")).toHaveAttribute("data-count", "1");
  await expect(ตัวอย่าง.locator('[data-fb-row="10.26:5"] [data-tag="phone-short"]'), "ป้ายเบอร์ไม่ครบ").toHaveText("เบอร์ไม่ครบ");
  await ตัวอย่าง.locator('[data-fb-group="dup"]').click();
  await expect(ตัวอย่าง.locator('[data-fb-row="11.26:2"]'), "รายการซ้ำแสดงก่อนบันทึก").toContainText("เบอร์ซ้ำกับแถว 10.26:2");
  await กล่อง.getByRole("button", { name: "ยืนยันนำเข้า 4 ราย", exact: true }).click();
  await expect(กล่อง.getByTestId("import-result"), "นำเข้า 4 ราย").toHaveAttribute("data-inserted", "4", { timeout: 30_000 });

  const { data, error } = await admin.from("dealer_prospects").select("name, phone, province, status, follow_up, channel, email, note, created_at").like("name", `${แท็ก}%`).order("name");
  expect(error).toBeNull();
  expect(data ?? [], "ฐานมี 4 ราย (ซ้ำไม่สร้าง)").toHaveLength(4);
  for (const p of data ?? []) {
    expect(p, `${p.name}: รอติดต่อ · นัดวันนี้ · Facebook`).toMatchObject({ status: "new", follow_up: วันนี้, channel: "Facebook", email: "zzfb@example.test" });
    expect(new Date(new Date(p.created_at as string).getTime() + 7 * 3_600_000).toISOString().slice(0, 10), `${p.name}: วันที่เข้า = วันที่ทิ้งเบอร์`).toBe(เมื่อวาน);
    expect(p.note as string, "หมายเหตุเก็บโฆษณา").toContain("โฆษณา: ZZ แคมเปญตัวแทน");
  }
  const หนึ่ง = (data ?? []).find(p => p.name === `${แท็ก} หนึ่ง`);
  expect(หนึ่ง, "จังหวัดอังกฤษจับคู่ได้ · ข้อความเดิมในหมายเหตุ").toMatchObject({ province: "ขอนแก่น", phone: `000-${กลาง}-0001` });
  expect(หนึ่ง?.note).toContain("จังหวัดที่ลูกค้าพิมพ์: Khon Kaen");
  expect((data ?? []).find(p => p.name === `${แท็ก} ไม่มีจังหวัด`)?.province, "จับคู่ไม่ได้ = ว่าง").toBeNull();
  expect((data ?? []).find(p => p.name === `${แท็ก} เบอร์ไม่ครบ`)?.phone, "เบอร์ไม่ครบเก็บตามที่มี").toBe(`000${กลาง}12`);
  assertNoErrors(errs, "นำเข้าไฟล์ Facebook");
});

test("[ui·hq] นำเข้าไฟล์เดิมซ้ำ = หน้าตัวอย่างบอกซ้ำทั้งหมด · ปุ่มยืนยันกดไม่ได้", async ({ page }) => {
  const errs = watchErrors(page);
  await loginUI(page, HQ_ORIGIN, "/hq/prospects", ADMIN);
  await settle(page);
  await นำเข้าผ่านเมนู(page, "นำเข้าจากไฟล์", "xlsx", ไฟล์);
  const ตัวอย่าง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ", exact: true }).locator("[data-facebook-preview]");
  await expect(ตัวอย่าง.locator('[data-fb-group="dup"] [data-count]'), "ทุกเบอร์มีอยู่แล้ว").toHaveAttribute("data-count", "5", { timeout: 20_000 });
  await expect(ตัวอย่าง.locator('[data-fb-group="import"] [data-count]')).toHaveAttribute("data-count", "0");
  await expect(ตัวอย่าง.getByRole("button", { name: "ยืนยันนำเข้า 0 ราย", exact: true })).toBeDisabled();
  assertNoErrors(errs, "นำเข้าไฟล์ Facebook ซ้ำ");
});
