import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";

// ── prod-live นำเข้าผู้สนใจจากไฟล์ทำงานจริงของทีม (ใบ 0275 · บอสสั่ง 4 พ.ย. 69) ─────────────────────────────────────────────
//   HQ เปิดหน้าผู้สนใจ → นำเข้าจากไฟล์ → จับคู่คอลัมน์ → หน้าตรวจ → นำเข้า → ผู้สนใจเห็นในตาราง → ยกเลิกทั้งชุด → ผู้สนใจของชุดหายจริง
//   กดผ่านหน้าจอทุกขั้น · อ่านฐานด้วยกุญแจฝั่งเซิร์ฟเวอร์เพื่อตรวจผลเท่านั้น · ใช้บัญชี HQ ชั่วคราวที่ run.mjs setup สร้าง
//   ไฟล์ปลอมสร้างตอนรัน (โฟลเดอร์ชั่วคราวนอก repo) โครงเดียวกับไฟล์ทำงานจริง: หัวตารางแถว 2 · แถวหัวข้อแทรก "BJM PEB"
//     · แถวอัดชื่อ+เบอร์+จังหวัดในช่องเดียว · จังหวัดย่อ (อุบล · กทม · ปทุม) · วันที่ 24.8 ไม่มีปี · คอลัมน์ Channel/หมายเหตุ/คอลัมน์อื่นที่ข้าม
//   ⚠️ ข้อมูลปลอมทั้งหมด: ชื่อ/ชื่อไฟล์ขึ้นต้น ZZTEST-ผู้สนใจเว็บจริง-นำเข้า- (cleanup.sql ลบผู้สนใจ ZZTEST-ผู้สนใจเว็บจริง-% และชุดนำเข้าชื่อไฟล์นี้)
//     · เบอร์ 000-NNN-7NNN (เบอร์จริงไม่ขึ้นต้น 000 · ตรวจก่อนนำเข้าว่าไม่มีในฐาน) · ไม่มีอีเมล
//   บันทึกการใช้งาน: ผู้ทำ = "บัญชีทดสอบชั่วคราว" · เป้าหมายขึ้นต้นชื่อไฟล์ ZZTEST- → เข้าเงื่อนไขล้างเดิมใน cleanup.sql / cleanup-audit-count.sql
// กติกาปี (บอสตัดสิน 4 พ.ย. 69 · ef แก้ใน packages/shared/lib/prospectImport.ts รอบ 0276 — ข้อที่ติดป้าย [รอโค้ด ef] ตกบนโค้ดก่อนรวม):
//   HQ เลือกปีครั้งเดียว (ปีปัจจุบัน) · วันเริ่มติดต่อที่ได้เกินวันนี้ = ถอยไปปีก่อน · วันติดตาม = ปีที่ไม่ก่อนวันเริ่มและใกล้ที่สุด
//   · วันติดตามที่ไม่มีวันเริ่ม = กฎไม่เกินวันนี้ · "x.1" แบบจุด = กำกวม ม.ค./ต.ค. → ต้องตรวจ · ค่าที่ไม่ใช่วันที่ ("??" · "304") → ต้องตรวจ
const E = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`ขาด ${k}`); return v; };
const HQ = E("LIVE_HQ_URL");
const ผู้ดูแล = { email: E("LIVE_HQ_EMAIL"), password: E("LIVE_PASSWORD") };
const svc = createClient(E("LIVE_SUPABASE_URL"), E("LIVE_SERVICE_KEY"), { auth: { persistSession: false } });
test.setTimeout(240_000);

const เลขรอบ = Number(E("LIVE_LEAD_NUM"));
const ป้าย = `ZZTEST-ผู้สนใจเว็บจริง-นำเข้า-${เลขรอบ % 100000}`;
const ชื่อไฟล์ = `${ป้าย}.xlsx`;
const กลาง = String(100 + (เลขรอบ % 800));   // เลขกลางของเบอร์ปลอม — ต่างกันทุกรอบ
const เบอร์ = (n: number) => `000 ${กลาง} ${7000 + n}`;          // แบบที่ทีมพิมพ์ (เว้นวรรค)
const เบอร์ฐาน = (n: number) => `000-${กลาง}-${7000 + n}`;       // แบบที่ระบบจัดรูป
const ชื่อ = (k: string) => `${ป้าย}-${k}`;

// ── วันที่ที่ควรได้ตามกติกาปี (คิดจากวันนี้เวลาไทย — ข้อทดสอบรันวันไหนก็คาดถูก) ──
const วันนี้ = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const ปี = Number(วันนี้.slice(0, 4));
const iso = (y: number, ด: number, ว: number) => `${y}-${String(ด).padStart(2, "0")}-${String(ว).padStart(2, "0")}`;
/** วันเริ่มติดต่อ / วันติดตามที่ไม่มีวันเริ่ม: ปีที่เลือก · เกินวันนี้ = ปีก่อน */
const ไม่เกินวันนี้ = (ว: number, ด: number) => (iso(ปี, ด, ว) > วันนี้ ? iso(ปี - 1, ด, ว) : iso(ปี, ด, ว));
/** วันติดตาม: ปีที่ไม่ก่อนวันเริ่มและใกล้ที่สุด */
const ไม่ก่อน = (เริ่ม: string, ว: number, ด: number) => { const y = Number(เริ่ม.slice(0, 4)); return iso(y, ด, ว) >= เริ่ม ? iso(y, ด, ว) : iso(y + 1, ด, ว); };

// ── ไฟล์ปลอม ──
//   แถว 1 = หัวแผ่นของทีม · แถว 2 = หัวตาราง · คอลัมน์แรก = เลขลำดับ · คอลัมน์ท้าย (Total · DM · Ad Run ...) = ข้าม
const หัว = ["", "social", "เบอร์", "จังหวัด", "ชื่อ", "เริ่มติดต่อ", "ติดตาม", "Type", "หมายหตุ", "Channel", "Total", "DM", "Ad Run", "Website", "note"];
const แถวไฟล์: string[][] = [
  หัว,
  [],
  ["", "", "BJM PEB"],                                                                                                          // หัวข้อแทรก → ข้าม
  ["31", "เพจหนึ่ง", เบอร์(1), "อุบล", ชื่อ("หนึ่ง"), "24.8", "", "ทำอสังหาฯ", "ไม่มีคนรับ", "FB", "", "DM ปลอม"],               // จังหวัดย่อ → ตรวจ
  ["32", "เพจสอง", เบอร์(2), "กทม", ชื่อ("สอง"), "24.12", "", "", "ส่ง Company Profile แล้ว", "Line OA"],                        // จังหวัดย่อ + ข้ามปี
  ["33", "เพจสาม", เบอร์(3), "ปทุม", ชื่อ("สาม"), "5.1", "", "", "รอโทรกลับ", "Direct"],                                           // 5.1 กำกวม → ตรวจ ไม่ยืนยัน
  ["34", "เพจสี่", เบอร์(4), "เชียงใหม่", ชื่อ("สี่"), "26.8", "", "", "รอโทรกลับ", "Direct", "", "", "", "", "หมายเหตุปลอม"],    // พร้อม
  ["35", "เพจห้า", เบอร์(5), "ลำปาง", ชื่อ("ห้า"), "20.12", "5/1", "", "โทรแล้ว", "FB"],                                          // ข้ามปี เริ่ม→ติดตาม (5/1 ทับไม่กำกวม)
  ["36", "เพจหก", เบอร์(6), "ลำพูน", ชื่อ("หก"), "", "20.12", "", "", "Line Pu"],                                                // มีแต่วันติดตาม
  ["", "", "BJM PEB โทรแล้ว"],                                                                                                  // หัวข้อแทรก → ข้าม
  ["37", "", `${ชื่อ("รวม")} สกุลรวม ${เบอร์(7)} ปทุม`],                                                                        // อัดช่องเดียว → ตรวจ
  ["38", "เพจแปด", เบอร์(8), "ตราด", ชื่อ("แปด"), "??", "304", "", "รอโทรกลับ", "FB"],                                            // ไม่ใช่วันที่ → ตรวจ ไม่ยืนยัน
  ["39", "เพจซ้ำ", ` ${เบอร์(4)} `, "กทม", ชื่อ("ซ้ำ"), "27.8", "", "", "รอโทรกลับ", "Direct"],                                   // เบอร์ซ้ำในไฟล์ → ข้าม
];
const ไฟล์ = path.join(os.tmpdir(), `pms-live-import-${process.pid}`, ชื่อไฟล์);

async function เข้าระบบ(page: Page, origin: string, p: string, who: { email: string; password: string }) {
  await page.goto(`${origin}${p}`, { waitUntil: "domcontentloaded" });
  const email = page.locator("#login-email"), pass = page.getByLabel(/รหัสผ่าน/i).first();
  for (let รอบ = 1; รอบ <= 3; รอบ++) {
    for (let i = 0; i < 6; i++) {
      await email.fill(who.email); await pass.fill(who.password);
      await page.waitForTimeout(300);
      if (await email.inputValue() === who.email && await pass.inputValue() === who.password) break;
    }
    await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).first().click();
    if (await page.waitForFunction(() => !location.pathname.includes("/login"), null, { timeout: 30_000 }).then(() => true).catch(() => false)) return;
  }
  throw new Error(`เข้าระบบไม่ผ่าน (${origin}${p})`);
}
const กดตกลง = (page: Page) => page.getByRole("alertdialog").getByRole("button").last().click();

test.beforeAll(async () => {
  mkdirSync(path.dirname(ไฟล์), { recursive: true });
  const blob = สร้างไฟล์Xlsx([{ ชื่อ: "ลูกค้ารอสรุป PEB", หัวตาราง: ["", "", "รอนัดหมาย"], แถว: แถวไฟล์ }]);
  writeFileSync(ไฟล์, Buffer.from(await blob.arrayBuffer()));
});
test.afterAll(() => rmSync(path.dirname(ไฟล์), { recursive: true, force: true }));

test("[live·นำเข้า] ไฟล์ทำงานจริง (ปลอม) → จับคู่คอลัมน์ → ตรวจ → นำเข้า → เห็นในตาราง → ยกเลิกทั้งชุด → ผู้สนใจของชุดหาย", async ({ page }) => {
  // ── 0) เบอร์ปลอมต้องไม่ชนของที่มีอยู่ (ไม่แตะของเดิม) ──
  const เบอร์ทั้งหมด = [1, 2, 3, 4, 5, 6, 7, 8].map(เบอร์ฐาน);
  expect((await svc.from("dealer_prospects").select("id").in("phone", เบอร์ทั้งหมด)).data ?? [], "เบอร์ปลอมยังไม่มีในฐาน").toEqual([]);
  expect((await svc.from("prospect_import_batches").select("id").eq("file_name", ชื่อไฟล์)).data ?? [], "ยังไม่มีชุดชื่อไฟล์นี้").toEqual([]);

  // ── 1) เปิดหน้าผู้สนใจ → นำเข้าจากไฟล์ ──
  await เข้าระบบ(page, HQ, "/login", ผู้ดูแล);
  await page.goto(`${HQ}/hq/prospects`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "นำเข้าจากไฟล์" }).click({ timeout: 30_000 });
  const กล่อง = page.getByRole("dialog", { name: "นำเข้าผู้สนใจ" });
  await กล่อง.getByLabel("ไฟล์ผู้สนใจ").setInputFiles(ไฟล์);
  await expect(กล่อง.getByTestId("import-file")).toContainText(ชื่อไฟล์, { timeout: 20_000 });

  // ── 2) จับคู่คอลัมน์: หัวตารางแถว 2 · เดาคอลัมน์ · ปีครั้งเดียว · ตารางแปลงช่องทาง ──
  await expect(กล่อง.locator("#pi-header"), "หาหัวตารางเจอที่แถว 2 (ไม่ใช่แถวแรก)").toHaveValue("1");
  await expect(กล่อง.getByLabel("คอลัมน์ เบอร์โทร")).toHaveValue("2");
  await expect(กล่อง.getByLabel("คอลัมน์ จังหวัด")).toHaveValue("3");
  await expect(กล่อง.getByLabel("คอลัมน์ ชื่อ", { exact: true })).toHaveValue("4");
  await expect(กล่อง.getByLabel("คอลัมน์ เริ่มติดต่อ")).toHaveValue("5");
  await expect(กล่อง.getByLabel("คอลัมน์ แหล่งที่มา")).toHaveValue("9");
  await expect(กล่อง.locator("#pi-year"), "ค่าตั้งต้น = ปีนี้ (พ.ศ.)").toHaveValue(String(ปี + 543));
  await กล่อง.locator("#pi-year").selectOption(String(ปี + 543));   // ใส่ปี (ครั้งเดียวทั้งไฟล์)
  await expect(กล่อง.getByLabel("แหล่งที่มาของ FB")).toHaveValue("Facebook");
  await กล่อง.getByRole("button", { name: "ไปหน้าตรวจ" }).click();

  // ── 3) หน้าตรวจ ──
  const นับ = (g: string) => กล่อง.locator(`[role="tab"][data-group="${g}"] [data-count]`);
  await expect(นับ("ready"), "พร้อม: สี่ · ห้า · หก").toHaveAttribute("data-count", "3");
  await expect(นับ("review"), "ต้องตรวจ: หนึ่ง(อุบล) · สอง(กทม) · สาม(5.1) · รวม · แปด(??/304)").toHaveAttribute("data-count", "5");
  await expect(นับ("skip"), "ข้าม: เบอร์ซ้ำในไฟล์").toHaveAttribute("data-count", "1");
  await expect(กล่อง.getByText("แถวหัวข้อแทรกที่ข้าม 2 แถว"), "แถวหัวข้อ BJM PEB ถูกข้าม").toBeVisible();
  const ตรวจ = กล่อง.getByRole("table", { name: "แถวต้องตรวจ" });
  const แถว = (n: number) => ตรวจ.locator("tr").filter({ hasText: เบอร์ฐาน(n) });
  await expect(ตรวจ.locator("tr").filter({ hasText: "BJM PEB" }), "แถวหัวข้อไม่อยู่ในตาราง").toHaveCount(0);
  // แถวอัดช่องเดียว → ต้องตรวจ · ระบบแยกชื่อ/จังหวัดให้
  await expect(แถว(7), "แถวอัดช่องเดียวอยู่กลุ่มต้องตรวจ").toContainText("แถวรวมช่องเดียว");
  await expect(แถว(7).getByLabel(/^ชื่อ แถว/)).toHaveValue(`${ชื่อ("รวม")} สกุลรวม`);
  await expect(แถว(7).getByLabel(/^จังหวัด แถว/)).toHaveValue("ปทุมธานี");
  // จังหวัดย่อจับคู่ถูก
  await expect(แถว(1).getByLabel(/^จังหวัด แถว/), "อุบล").toHaveValue("อุบลราชธานี");
  await expect(แถว(2).getByLabel(/^จังหวัด แถว/), "กทม").toHaveValue("กรุงเทพมหานคร");
  await expect(แถว(3).getByLabel(/^จังหวัด แถว/), "ปทุม").toHaveValue("ปทุมธานี");
  // วันที่กำกวม / ไม่ใช่วันที่ → ต้องตรวจพร้อมเหตุ
  await expect(แถว(3), "5.1 แบบจุด = กำกวม").toContainText(`วันเริ่มติดต่อ "5.1" อาจเป็น ม.ค. หรือ ต.ค.`);
  await expect(แถว(8)).toContainText(`วันเริ่มติดต่อ "??" อ่านไม่ออก`);
  await expect(แถว(8)).toContainText(`วันติดตาม "304" อ่านไม่ออก`);
  // ข้าม: เบอร์ซ้ำในไฟล์
  await กล่อง.locator('[role="tab"][data-group="skip"]').click();
  await expect(กล่อง.getByRole("table", { name: "แถวข้าม" }).locator("tr").filter({ hasText: เบอร์ฐาน(4) }), "เบอร์ซ้ำ → ข้าม").toContainText("เบอร์ซ้ำกับแถว");
  await กล่อง.locator('[role="tab"][data-group="review"]').click();
  // ยืนยันเฉพาะ อุบล · กทม · แถวรวม — 5.1 และ ??/304 ไม่ยืนยัน (ต้องไม่ถูกนำเข้า)
  for (const n of [1, 2, 7]) await แถว(n).getByRole("button", { name: /^ยืนยัน แถว/ }).click();
  await expect(นับ("ready")).toHaveAttribute("data-count", "6");
  await expect(นับ("review")).toHaveAttribute("data-count", "2");

  // ── 4) นำเข้า ──
  await กล่อง.getByRole("button", { name: "นำเข้า 6 ราย" }).click();
  await กดตกลง(page);
  await expect(กล่อง.getByTestId("import-result"), "นำเข้า 6 ราย").toHaveAttribute("data-inserted", "6", { timeout: 30_000 });
  const { data: ชุด } = await svc.from("prospect_import_batches").select("id, row_count, inserted, skipped, created_by, cancelled_at").eq("file_name", ชื่อไฟล์);
  expect(ชุด ?? [], "ชุดนำเข้า 1 ชุด").toHaveLength(1);
  expect(ชุด![0], "ชุด: ส่ง 6 · เพิ่ม 6 · ข้าม 0 · ผู้นำเข้า = บัญชี HQ ชั่วคราว").toMatchObject({ row_count: 6, inserted: 6, skipped: 0, created_by: "บัญชีทดสอบชั่วคราว", cancelled_at: null });
  const เลขชุด = Number(ชุด![0].id);
  const { data: ราย } = await svc.from("dealer_prospects").select("name, phone, province, first_contact, follow_up, status, channel").eq("import_batch_id", เลขชุด);
  expect((ราย ?? []).map(r => r.phone).sort(), "นำเข้าตรง 6 ราย (ไม่มี 5.1 · ??/304 · เบอร์ซ้ำ)").toEqual([1, 2, 4, 5, 6, 7].map(เบอร์ฐาน));
  const ของ = (n: number) => (ราย ?? []).find(r => r.phone === เบอร์ฐาน(n))!;
  expect(ของ(1), "อุบล → อุบลราชธานี · 24.8").toMatchObject({ name: ชื่อ("หนึ่ง"), province: "อุบลราชธานี", status: "contacted", channel: "Facebook", first_contact: ไม่เกินวันนี้(24, 8) });
  expect(ของ(2), "กทม → กรุงเทพมหานคร").toMatchObject({ name: ชื่อ("สอง"), province: "กรุงเทพมหานคร", status: "profile_sent" });
  expect(ของ(4), "26.8").toMatchObject({ name: ชื่อ("สี่"), province: "เชียงใหม่", status: "contacted", channel: "โทรเข้ามาเอง", first_contact: ไม่เกินวันนี้(26, 8) });
  expect(ของ(7), "แถวอัดช่องเดียว").toMatchObject({ name: `${ชื่อ("รวม")} สกุลรวม`, province: "ปทุมธานี" });
  // [รอโค้ด ef · 0276] กติกาปีข้ามปี — soft: ตกแล้วยังเดินต่อให้ถึงขั้นยกเลิกชุด (ไม่ทิ้งข้อมูลค้าง)
  expect.soft(ของ(2).first_contact, "[รอโค้ด ef] 24.12 + ปีนี้ → เกินวันนี้ = ปีก่อน").toBe(ไม่เกินวันนี้(24, 12));
  expect.soft(ของ(5).first_contact, "[รอโค้ด ef] เริ่ม 20.12 → ไม่เกินวันนี้").toBe(ไม่เกินวันนี้(20, 12));
  expect.soft(ของ(5).follow_up, "[รอโค้ด ef] ติดตาม 5/1 → ปีที่ไม่ก่อนวันเริ่มและใกล้ที่สุด").toBe(ไม่ก่อน(ไม่เกินวันนี้(20, 12), 5, 1));
  expect.soft(ของ(6).follow_up, "[รอโค้ด ef] มีแต่วันติดตาม 20.12 → ไม่เกินวันนี้").toBe(ไม่เกินวันนี้(20, 12));
  expect(ของ(6).first_contact, "ไม่มีวันเริ่มในไฟล์").toBeNull();

  // ── 5) ผู้สนใจเห็นในตาราง ──
  await กล่อง.getByRole("button", { name: "ปิด", exact: true }).first().click();
  await expect(กล่อง).toBeHidden({ timeout: 10_000 });
  const ค้น = page.getByLabel("ค้นหาผู้สนใจ");
  await ค้น.fill(ป้าย);
  const ในตาราง = page.locator("table tbody tr").filter({ hasText: ป้าย });
  await expect(ในตาราง, "ผู้สนใจที่นำเข้าเห็นในตาราง 6 ราย").toHaveCount(6, { timeout: 20_000 });

  // ── 6) ยกเลิกทั้งชุด ──
  await page.getByRole("button", { name: "นำเข้าจากไฟล์" }).click();
  const รายการ = กล่อง.getByRole("region", { name: "ชุดที่นำเข้าล่าสุด" });
  const แถวชุด = รายการ.locator(`li[data-batch="${เลขชุด}"]`);
  await expect(แถวชุด, "ชุดนี้อยู่ในรายการ").toContainText(ชื่อไฟล์, { timeout: 20_000 });
  await expect(แถวชุด.getByTestId("batch-touched"), "ยังไม่มีรายถูกแตะ (บันทึกการติดต่อแรกจากไฟล์ไม่นับ)").toHaveCount(0);
  await แถวชุด.getByRole("button", { name: "ยกเลิกทั้งชุด" }).click();
  await กดตกลง(page);
  await expect(แถวชุด.getByText("ยกเลิกแล้ว")).toBeVisible({ timeout: 20_000 });

  // ── 7) ผู้สนใจของชุดหายจริง (ฐาน + ตาราง) ──
  const { count: เหลือในชุด } = await svc.from("dealer_prospects").select("id", { count: "exact", head: true }).eq("import_batch_id", เลขชุด);
  expect(เหลือในชุด, "ยกเลิกแล้วไม่เหลือผู้สนใจของชุด").toBe(0);
  const { count: เหลือตามเบอร์ } = await svc.from("dealer_prospects").select("id", { count: "exact", head: true }).in("phone", เบอร์ทั้งหมด);
  expect(เหลือตามเบอร์, "ไม่เหลือผู้สนใจเบอร์ของไฟล์").toBe(0);
  const { count: เหลือตามชื่อ } = await svc.from("dealer_prospects").select("id", { count: "exact", head: true }).like("name", `${ป้าย}%`);
  expect(เหลือตามชื่อ, "ไม่เหลือผู้สนใจชื่อของไฟล์").toBe(0);
  const { data: หลังยกเลิก } = await svc.from("prospect_import_batches").select("cancelled_at, cancelled_by").eq("id", เลขชุด).single();
  expect(หลังยกเลิก?.cancelled_at, "ชุดถูกบันทึกว่ายกเลิก").not.toBeNull();
  expect(หลังยกเลิก?.cancelled_by).toBe("บัญชีทดสอบชั่วคราว");
  await กล่อง.getByRole("button", { name: "ปิด", exact: true }).first().click();
  await expect(กล่อง).toBeHidden({ timeout: 10_000 });
  await ค้น.fill(ป้าย);
  await expect(ในตาราง, "ตารางไม่เหลือผู้สนใจของชุด").toHaveCount(0, { timeout: 20_000 });
});
