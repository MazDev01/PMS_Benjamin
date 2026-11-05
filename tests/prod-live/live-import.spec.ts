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
//   · วันติดตามที่ไม่มีวันเริ่ม = กฎไม่เกินวันนี้ · "x.1" แบบจุด = กำกวม ม.ค./ต.ค. → ต้องตรวจ · ค่าที่ไม่ใช่วันที่ ("??" · "304") → ข้ามแถว (บอสสั่ง 4 พ.ย. 69)
// ช่อง "ติดตาม" = วันที่ตามไปแล้ว ไม่ใช่นัดครั้งหน้า (บอสสั่ง 5 พ.ย. 69 · ใบ 0277 · คำตอบบอส N1–N6):
//   วันเริ่ม + วันติดตาม = บันทึกการติดต่อลงวันตามไฟล์ · ติดต่อล่าสุด = วันล่าสุด · นัดติดตามว่าง (การ์ด "ถึงกำหนดติดตาม" ไม่เพิ่ม)
//   N1 ไม่มีวันเริ่ม = ไม่เดา · N2 หมายเหตุผูกบันทึกวันล่าสุด · N3 หมายเหตุไม่มีวันที่ = บันทึกหมายเหตุ ติดต่อล่าสุดว่าง · N4 วันเดียวกัน = บันทึกเดียว
//   N5 มีวันที่ + หมายเหตุว่าง = ติดต่อแล้ว · N6 วันติดตามเกินวันนี้ = ต้องตรวจ ยืนยันแล้วไม่ลงวันนั้น เก็บค่าเดิมในหมายเหตุ
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
/** วันนี้ + n วัน (ISO) */
const เลื่อนวัน = (n: number) => { const d = new Date(`${วันนี้}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** วัน/เดือน แบบทับ (ไม่กำกวม) ของวันนี้ + n วัน — แถว N6: เริ่ม = วันนี้ · ติดตาม = พรุ่งนี้ (เกินวันนี้เสมอ ไม่ขึ้นกับวันที่รัน)
 *  เริ่ม = วันนี้ ตั้งใจ: บันทึกจากไฟล์ลงเวลา 09:00 ไทย — รันก่อน 09:00 บันทึกจะใหม่กว่าเวลาชุด · เดิมนับว่า "ถูกแตะ" ยกเลิกชุดไม่ได้
 *  ใบ 0277 ติดรหัสชุดในบันทึกที่ชุดสร้าง → ไม่ขึ้นกับเวลา (ข้อทดสอบตรวจรหัสชุดในบันทึก + ชุดไม่ถูกแตะ) */
const ทับ = (n: number) => { const [, ด, ว] = เลื่อนวัน(n).split("-").map(Number); return `${ว}/${ด}`; };

// ── ไฟล์ปลอม ──
//   หัว "วันติดตาม (ที่ผ่านมา)" = หัวใหม่ (ใบ 0277 · บอสตัดสิน 5 พ.ย. 69) — โค้ดเดิมไม่รู้จัก · หัว "ติดตาม"/"วันติดตาม" ตรวจในข้อทดสอบหน่วย
//   แถว 1 = หัวแผ่นของทีม · แถว 2 = หัวตาราง · คอลัมน์แรก = เลขลำดับ · คอลัมน์ท้าย (Total · DM · Ad Run ...) = ข้าม
const หัว = ["", "social", "เบอร์", "จังหวัด", "ชื่อ", "เริ่มติดต่อ", "วันติดตาม (ที่ผ่านมา)", "Type", "หมายหตุ", "Channel", "Total", "DM", "Ad Run", "Website", "note"];
const แถวไฟล์: string[][] = [
  หัว,
  [],
  ["", "", "BJM PEB"],                                                                                                          // หัวข้อแทรก → ข้าม
  ["31", "เพจหนึ่ง", เบอร์(1), "อุบล", ชื่อ("หนึ่ง"), "24.8", "", "ทำอสังหาฯ", "ไม่มีคนรับ", "FB", "", "DM ปลอม"],               // จังหวัดย่อ → ตรวจ
  ["32", "เพจสอง", เบอร์(2), "กทม", ชื่อ("สอง"), "24.12", "", "", "ส่ง Company Profile แล้ว", "Line OA"],                        // จังหวัดย่อ + ข้ามปี
  ["33", "เพจสาม", เบอร์(3), "ปทุม", ชื่อ("สาม"), "5.1", "", "", "รอโทรกลับ", "Direct"],                                           // 5.1 กำกวม → ต้องเลือกเดือน (เลือก ต.ค.) แล้วยืนยัน
  ["34", "เพจสี่", เบอร์(4), "เชียงใหม่", ชื่อ("สี่"), "26.8", "", "", "รอโทรกลับ", "Direct", "", "", "", "", "หมายเหตุปลอม"],    // พร้อม
  ["35", "เพจห้า", เบอร์(5), "ลำปาง", ชื่อ("ห้า"), "20.12", "5/1", "", "โทรแล้ว", "FB"],                                          // ข้ามปี เริ่ม→ติดตาม (5/1 ทับไม่กำกวม)
  ["36", "เพจหก", เบอร์(6), "ลำพูน", ชื่อ("หก"), "", "20.12", "", "", "Line Pu"],                                                // มีแต่วันติดตาม
  ["", "", "BJM PEB โทรแล้ว"],                                                                                                  // หัวข้อแทรก → ข้าม
  ["37", "", `${ชื่อ("รวม")} สกุลรวม ${เบอร์(7)} ปทุม`],                                                                        // อัดช่องเดียว → ตรวจ
  ["38", "เพจแปด", เบอร์(8), "ตราด", ชื่อ("แปด"), "??", "304", "", "รอโทรกลับ", "FB"],                                            // ไม่ใช่วันที่ → ข้ามแถว (อ่านไม่ออก)
  ["39", "เพจซ้ำ", ` ${เบอร์(4)} `, "กทม", ชื่อ("ซ้ำ"), "27.8", "", "", "รอโทรกลับ", "Direct"],                                   // เบอร์ซ้ำในไฟล์ → ข้าม
  ["40", "เพจไม่มีเบอร์", "", "ตราด", ชื่อ("ไม่มีเบอร์"), "27.8", "", "", "รอโทรกลับ", "FB"],                                        // ไม่มีเบอร์ → ข้าม (บอสสั่ง 4 พ.ย. 69 · ฐานบังคับเบอร์ ใบ 0276)
  ["41", "เพจเก้า", เบอร์(9), "น่าน", ชื่อ("เก้า"), "", "", "", "รอโทรกลับ", "FB"],                                                 // N3 หมายเหตุไม่มีวันที่ → ติดต่อล่าสุดว่าง
  ["42", "เพจสิบ", เบอร์(10), "แพร่", ชื่อ("สิบ"), "27/8", "27/8", "", "โทรแล้ว", "FB"],                                            // N4 วันเริ่ม = วันติดตาม → บันทึกเดียว
  ["43", "เพจสิบเอ็ด", เบอร์(11), "พะเยา", ชื่อ("สิบเอ็ด"), "28/8", "", "", "", "FB"],                                              // N5 มีวันที่ + หมายเหตุว่าง → ติดต่อแล้ว
  ["44", "เพจสิบสอง", เบอร์(12), "ตาก", ชื่อ("สิบสอง"), ทับ(0), ทับ(1), "", "โทรแล้ว", "FB"],                                      // N6 วันติดตามเกินวันนี้ → ต้องตรวจ
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
  const เบอร์ทั้งหมด = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(เบอร์ฐาน);
  expect((await svc.from("dealer_prospects").select("id").in("phone", เบอร์ทั้งหมด)).data ?? [], "เบอร์ปลอมยังไม่มีในฐาน").toEqual([]);
  expect((await svc.from("prospect_import_batches").select("id").eq("file_name", ชื่อไฟล์)).data ?? [], "ยังไม่มีชุดชื่อไฟล์นี้").toEqual([]);

  // ── 1) เปิดหน้าผู้สนใจ → นำเข้าจากไฟล์ ──
  await เข้าระบบ(page, HQ, "/login", ผู้ดูแล);
  await page.goto(`${HQ}/hq/prospects`, { waitUntil: "domcontentloaded" });
  // การ์ด "ถึงกำหนดติดตาม" ก่อนนำเข้า — วันติดตามในไฟล์ = วันที่ตามไปแล้ว ไม่ใช่นัด → หลังนำเข้าต้องเท่าเดิม (บอสสั่ง 5 พ.ย. 69)
  const การ์ดถึงกำหนด = page.locator('[data-kpi="followDue"] [data-value]');
  await expect(การ์ดถึงกำหนด, "การ์ดถึงกำหนดติดตามโหลดแล้ว").not.toHaveAttribute("data-value", "", { timeout: 30_000 });
  const ถึงกำหนดก่อน = await การ์ดถึงกำหนด.getAttribute("data-value");
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
  await expect(กล่อง.getByLabel("คอลัมน์ วันติดตาม (ที่ผ่านมา)"), "หัวใหม่ วันติดตาม (ที่ผ่านมา) จับคู่ได้ (ใบ 0277)").toHaveValue("6");
  await expect(กล่อง.getByLabel("คอลัมน์ แหล่งที่มา")).toHaveValue("9");
  await expect(กล่อง.locator("#pi-year"), "ค่าตั้งต้น = ปีนี้ (พ.ศ.)").toHaveValue(String(ปี + 543));
  await กล่อง.locator("#pi-year").selectOption(String(ปี + 543));   // ใส่ปี (ครั้งเดียวทั้งไฟล์)
  await expect(กล่อง.getByLabel("แหล่งที่มาของ FB")).toHaveValue("Facebook");
  await กล่อง.getByRole("button", { name: "ไปหน้าตรวจ" }).click();

  // ── 3) หน้าตรวจ ──
  const นับ = (g: string) => กล่อง.locator(`[role="tab"][data-group="${g}"] [data-count]`);
  await expect(นับ("ready"), "พร้อม: สี่ · ห้า · หก · เก้า · สิบ · สิบเอ็ด").toHaveAttribute("data-count", "6");
  await expect(นับ("review"), "ต้องตรวจ: หนึ่ง(อุบล) · สอง(กทม) · สาม(5.1) · รวม · สิบสอง(วันติดตามเกินวันนี้)").toHaveAttribute("data-count", "5");
  await expect(นับ("skip"), "ข้าม: เบอร์ซ้ำในไฟล์ · แปด(??/304 อ่านไม่ออก) · ไม่มีเบอร์").toHaveAttribute("data-count", "3");
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
  // วันที่กำกวม → ต้องตรวจพร้อมเหตุ (ต้องเลือกเดือนก่อนยืนยัน)
  await expect(แถว(3), "5.1 แบบจุด = กำกวม").toContainText(`วันเริ่มติดต่อ "5.1" อาจเป็น ม.ค. หรือ ต.ค.`);
  // ข้าม: เบอร์ซ้ำในไฟล์ · มีค่าวันที่ในไฟล์แต่อ่านไม่ออก (??/304) → ข้ามแถว ไม่นำเข้าโดยวันที่หายเงียบ (บอสสั่ง 4 พ.ย. 69)
  await กล่อง.locator('[role="tab"][data-group="skip"]').click();
  const ข้าม = กล่อง.getByRole("table", { name: "แถวข้าม" });
  await expect(ข้าม.locator("tr").filter({ hasText: เบอร์ฐาน(4) }), "เบอร์ซ้ำ → ข้าม").toContainText("เบอร์ซ้ำกับแถว");
  await expect(ข้าม.locator("tr").filter({ hasText: เบอร์ฐาน(8) }), "?? → ข้าม").toContainText(`"??" อ่านไม่ออก`);
  await expect(ข้าม.locator("tr").filter({ hasText: เบอร์ฐาน(8) }), "304 → ข้าม").toContainText(`"304" อ่านไม่ออก`);
  await expect(ข้าม.locator("tr").filter({ hasText: ชื่อ("ไม่มีเบอร์") }), "ไม่มีเบอร์ → ข้าม พร้อมเหตุ").toContainText("ไม่มีเบอร์โทร");
  await กล่อง.locator('[role="tab"][data-group="review"]').click();
  // วันที่กำกวม 5.1 (บอสสั่ง 4 พ.ย. 69): ยังไม่เลือกเดือน = ปุ่มยืนยันกดไม่ได้ → เลือก ต.ค. → ยืนยันได้ (ข้อ 1–2)
  const ยืนยัน3 = แถว(3).getByRole("button", { name: /^ยืนยัน แถว/ });
  await expect(ยืนยัน3, "ยังไม่เลือกเดือน → ปุ่มยืนยันกดไม่ได้").toBeDisabled();
  const เลือก3 = แถว(3).getByLabel(/^เลือกเดือนวันเริ่มติดต่อ แถว/);
  await expect(เลือก3.locator("option"), "ตัวเลือก ม.ค. / ต.ค. + ยังไม่เลือก").toHaveCount(3);
  await เลือก3.selectOption(ไม่เกินวันนี้(5, 10));
  await expect(ยืนยัน3, "เลือก ต.ค. แล้ว → ยืนยันได้").toBeEnabled();
  // N6: วันติดตามเกินวันนี้ → ต้องตรวจพร้อมเหตุ · ยืนยันได้ (นำเข้าโดยไม่ลงวันนั้น)
  await expect(แถว(12), "วันติดตามเกินวันนี้ = ต้องตรวจ").toContainText(`วันติดตาม (ที่ผ่านมา) "${ทับ(1)}" เกินวันนี้`);
  // ยืนยัน อุบล · กทม · 5.1(ต.ค.) · แถวรวม · วันติดตามเกินวันนี้ — ??/304 อยู่กลุ่มข้าม (ไม่นำเข้า)
  for (const n of [1, 2, 3, 7, 12]) await แถว(n).getByRole("button", { name: /^ยืนยัน แถว/ }).click();
  await expect(นับ("ready")).toHaveAttribute("data-count", "11");
  await expect(นับ("review")).toHaveAttribute("data-count", "0");

  // ── 4) นำเข้า ──
  await กล่อง.getByRole("button", { name: "นำเข้า 11 ราย" }).click();
  await กดตกลง(page);
  await expect(กล่อง.getByTestId("import-result"), "นำเข้า 11 ราย").toHaveAttribute("data-inserted", "11", { timeout: 30_000 });
  const { data: ชุด } = await svc.from("prospect_import_batches").select("id, row_count, inserted, skipped, created_by, cancelled_at, created_at").eq("file_name", ชื่อไฟล์);
  expect(ชุด ?? [], "ชุดนำเข้า 1 ชุด").toHaveLength(1);
  expect(ชุด![0], "ชุด: ส่ง 11 · เพิ่ม 11 · ข้าม 0 · ผู้นำเข้า = บัญชี HQ ชั่วคราว").toMatchObject({ row_count: 11, inserted: 11, skipped: 0, created_by: "บัญชีทดสอบชั่วคราว", cancelled_at: null });
  const เลขชุด = Number(ชุด![0].id);
  const { data: ราย } = await svc.from("dealer_prospects").select("id, name, phone, province, first_contact, follow_up, last_contact_at, status, channel, note").eq("import_batch_id", เลขชุด);
  expect((ราย ?? []).map(r => r.phone).sort(), "นำเข้าตรง 11 ราย (ไม่มี ??/304 · เบอร์ซ้ำ · ไม่มีเบอร์)").toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12].map(เบอร์ฐาน));
  const { count: ไม่มีเบอร์ } = await svc.from("dealer_prospects").select("id", { count: "exact", head: true }).eq("name", ชื่อ("ไม่มีเบอร์"));
  expect(ไม่มีเบอร์, "แถวไม่มีเบอร์ไม่ลงฐาน (ทั้งไฟล์ไม่ล้ม · แถวอื่นนำเข้าครบ)").toBe(0);
  const ของ = (n: number) => (ราย ?? []).find(r => r.phone === เบอร์ฐาน(n))!;
  expect(ของ(1), "อุบล → อุบลราชธานี · 24.8").toMatchObject({ name: ชื่อ("หนึ่ง"), province: "อุบลราชธานี", status: "contacted", channel: "Facebook", first_contact: ไม่เกินวันนี้(24, 8) });
  expect(ของ(2), "กทม → กรุงเทพมหานคร").toMatchObject({ name: ชื่อ("สอง"), province: "กรุงเทพมหานคร", status: "profile_sent" });
  expect(ของ(4), "26.8").toMatchObject({ name: ชื่อ("สี่"), province: "เชียงใหม่", status: "contacted", channel: "โทรเข้ามาเอง", first_contact: ไม่เกินวันนี้(26, 8) });
  expect(ของ(3).first_contact, "5.1 เลือก ต.ค. → วันที่ที่นำเข้าเป็น 5 ต.ค. จริง (ข้อ 2)").toBe(ไม่เกินวันนี้(5, 10));
  // ข้อ 3: แถวที่ไฟล์มีค่าวันที่ ต้องได้วันที่ทุกแถว (ไม่มีนำเข้าแล้ววันว่าง)
  const มีวันเริ่มในไฟล์ = [1, 2, 3, 4, 5, 10, 11, 12], มีวันในไฟล์ = [1, 2, 3, 4, 5, 6, 10, 11, 12];
  for (const k of มีวันเริ่มในไฟล์) expect(ของ(k).first_contact, `แถว ${k}: ไฟล์มีวันเริ่มติดต่อ → ต้องไม่ว่าง`).not.toBeNull();
  // ใบ 0277 (ตรวจกลับด้าน — เดิม "ไฟล์มีวันติดตาม → นัดติดตามต้องไม่ว่าง"): วันติดตาม = วันที่ตามไปแล้ว → นัดติดตามว่างทุกราย ทีมตั้งเอง
  for (const r of ราย ?? []) expect(r.follow_up, `${r.name}: นัดติดตามว่าง (วันติดตามในไฟล์ไม่ใช่นัด)`).toBeNull();
  for (const k of มีวันในไฟล์) expect(ของ(k).last_contact_at, `แถว ${k}: มีวันที่ในไฟล์ → ติดต่อล่าสุดไม่ว่าง`).not.toBeNull();
  // บันทึกการติดต่อตามวันในไฟล์ (วันไทย · ข้อความ) ของแต่ละราย
  const { data: บันทึก } = await svc.from("dealer_prospect_activities").select("prospect_id, body, channel, created_at, import_batch_id").eq("kind", "contact").in("prospect_id", (ราย ?? []).map(r => r.id));
  const เวลาไทย = (t: string) => new Date(new Date(t).getTime() + 7 * 3_600_000).toISOString();
  const วันไทย = (t: string) => เวลาไทย(t).slice(0, 10);
  // ทุกบันทึกจากไฟล์: ช่องทาง "อื่น ๆ" · ขึ้นต้น "จากไฟล์นำเข้า: " (ใบ 0277)
  for (const a of บันทึก ?? []) {
    expect(a.channel, `บันทึก "${a.body}": ช่องทาง อื่น ๆ`).toBe("อื่น ๆ");
    expect(a.body, "บันทึกจากไฟล์ขึ้นต้น จากไฟล์นำเข้า:").toMatch(/^จากไฟล์นำเข้า: /);
    expect(Number(a.import_batch_id), `บันทึก "${a.body}": ติดรหัสชุด (ยกเลิกชุดได้ไม่ขึ้นกับเวลา · ใบ 0277)`).toBe(เลขชุด);
  }
  // บันทึกที่มีวันในไฟล์ = ลงเวลา 09:00 เวลาไทยของวันนั้น · หมายเหตุไม่มีวันที่ (แถว 9) = เวลานำเข้า (ธุรกรรมเดียวกับชุด)
  for (const a of (บันทึก ?? []).filter(a => a.prospect_id !== ของ(9).id))
    expect(เวลาไทย(a.created_at).slice(11, 19), `บันทึก "${a.body}": ลงเวลา 09:00 เวลาไทยของวันในไฟล์`).toBe("09:00:00");
  for (const a of (บันทึก ?? []).filter(a => a.prospect_id === ของ(9).id))
    expect(new Date(a.created_at).getTime(), "N3 บันทึกหมายเหตุไม่มีวันที่ = ลงเวลานำเข้า").toBe(new Date(ชุด![0].created_at).getTime());
  const บันทึกของ = (n: number) => (บันทึก ?? []).filter(a => a.prospect_id === ของ(n).id).map(a => ({ วัน: วันไทย(a.created_at), body: a.body })).sort((a, b) => a.วัน.localeCompare(b.วัน));
  const ติดต่อล่าสุด = (n: number) => (ของ(n).last_contact_at ? วันไทย(ของ(n).last_contact_at!) : null);
  const เริ่ม5 = ไม่เกินวันนี้(20, 12), ตาม5 = ไม่ก่อน(เริ่ม5, 5, 1);
  expect(บันทึกของ(5), "เริ่ม 20.12 + ติดตาม 5/1 = บันทึก 2 รายการตามวัน · หมายเหตุผูกบันทึกวันล่าสุด (N2)").toEqual([
    { วัน: เริ่ม5, body: "จากไฟล์นำเข้า: เริ่มติดต่อ" }, { วัน: ตาม5, body: "จากไฟล์นำเข้า: ติดตาม · โทรแล้ว" }]);
  expect(ติดต่อล่าสุด(5), "ติดต่อล่าสุด = วันล่าสุดในสองช่อง").toBe(ตาม5);
  expect(ของ(6), "N1 ไม่มีวันเริ่ม = ไม่เดา · N5 มีวันที่ + หมายเหตุว่าง = ติดต่อแล้ว").toMatchObject({ first_contact: null, status: "contacted" });
  expect(บันทึกของ(6), "มีแต่วันติดตาม 20.12 → บันทึกเดียววันนั้น").toEqual([{ วัน: ไม่เกินวันนี้(20, 12), body: "จากไฟล์นำเข้า: ติดตาม" }]);
  expect(ติดต่อล่าสุด(6)).toBe(ไม่เกินวันนี้(20, 12));
  expect(ของ(9).last_contact_at, "N3 หมายเหตุไม่มีวันที่ → ติดต่อล่าสุดว่าง").toBeNull();
  expect(บันทึกของ(9).map(a => a.body), "N3 หมายเหตุยังอยู่ในบันทึกการติดต่อ").toEqual(["จากไฟล์นำเข้า: รอโทรกลับ"]);
  expect(บันทึกของ(10), "N4 วันเริ่ม = วันติดตาม → บันทึกเดียว").toEqual([{ วัน: ไม่เกินวันนี้(27, 8), body: "จากไฟล์นำเข้า: เริ่มติดต่อ · ติดตาม · โทรแล้ว" }]);
  expect(ของ(11).status, "N5 มีวันที่ + หมายเหตุว่าง = ติดต่อแล้ว").toBe("contacted");
  expect(บันทึกของ(12), "N6 วันติดตามเกินวันนี้ → ไม่ลงวันนั้น (บันทึกแค่วันเริ่ม)").toEqual([{ วัน: วันนี้, body: "จากไฟล์นำเข้า: เริ่มติดต่อ · โทรแล้ว" }]);
  expect(ของ(12).note ?? "", "N6 เก็บค่าเดิมในหมายเหตุ").toContain(`วันติดตามในไฟล์: ${ทับ(1)}`);
  expect(ของ(7), "แถวอัดช่องเดียว").toMatchObject({ name: `${ชื่อ("รวม")} สกุลรวม`, province: "ปทุมธานี" });
  // N2 หมายเหตุต่อท้ายบันทึกวันเดียว/วันล่าสุด · หมายเหตุเพิ่มเติม (คอลัมน์ note) ไม่เข้าบันทึก · วันบันทึก = วันเริ่มที่ลงฐาน
  expect(บันทึกของ(1), "แถว 1: วันเริ่มอย่างเดียว + หมายเหตุ").toEqual([{ วัน: ไม่เกินวันนี้(24, 8), body: "จากไฟล์นำเข้า: เริ่มติดต่อ · ไม่มีคนรับ" }]);
  expect(บันทึกของ(2), "แถว 2: วันบันทึก = วันเริ่มที่ลงฐาน").toEqual([{ วัน: ของ(2).first_contact, body: "จากไฟล์นำเข้า: เริ่มติดต่อ · ส่ง Company Profile แล้ว" }]);
  expect(บันทึกของ(3), "แถว 3: วันที่เลือกเดือน ต.ค.").toEqual([{ วัน: ไม่เกินวันนี้(5, 10), body: "จากไฟล์นำเข้า: เริ่มติดต่อ · รอโทรกลับ" }]);
  expect(บันทึกของ(4), "แถว 4: หมายเหตุเพิ่มเติมไม่ปนบันทึก").toEqual([{ วัน: ไม่เกินวันนี้(26, 8), body: "จากไฟล์นำเข้า: เริ่มติดต่อ · รอโทรกลับ" }]);
  expect(บันทึกของ(11), "N5 แถว 11: วันเริ่ม ไม่มีหมายเหตุ").toEqual([{ วัน: ไม่เกินวันนี้(28, 8), body: "จากไฟล์นำเข้า: เริ่มติดต่อ" }]);
  expect(บันทึกของ(7), "แถว 7: ไม่มีวันที่ ไม่มีหมายเหตุ → ไม่มีบันทึก").toEqual([]);
  expect(ของ(7).last_contact_at, "แถว 7: ไม่มีวันที่ → ติดต่อล่าสุดว่าง").toBeNull();
  // ติดต่อล่าสุด = วันล่าสุดในบันทึกจากไฟล์ (09:00 เวลาไทย) ทุกแถวที่มีวันที่
  for (const k of มีวันในไฟล์) {
    const วัน = บันทึกของ(k).map(a => a.วัน);
    expect(ติดต่อล่าสุด(k), `แถว ${k}: ติดต่อล่าสุด = วันล่าสุดในไฟล์`).toBe(วัน[วัน.length - 1]);
    expect(เวลาไทย(ของ(k).last_contact_at!).slice(11, 19), `แถว ${k}: ติดต่อล่าสุด 09:00 เวลาไทย`).toBe("09:00:00");
  }
  expect(ของ(12), "N6 วันเริ่ม = วันนี้ · ติดต่อล่าสุด = วันเริ่ม (ไม่ใช่วันเกินวันนี้)").toMatchObject({ first_contact: วันนี้, follow_up: null });
  expect(ติดต่อล่าสุด(12)).toBe(วันนี้);
  for (const k of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11])
    expect(ของ(k).note ?? "", `แถว ${k}: วันติดตามไม่เกินวันนี้ → ไม่มีข้อความวันติดตามในหมายเหตุ`).not.toContain("วันติดตามในไฟล์");
  // [รอโค้ด ef · 0276] กติกาปีข้ามปี — soft: ตกแล้วยังเดินต่อให้ถึงขั้นยกเลิกชุด (ไม่ทิ้งข้อมูลค้าง)
  expect.soft(ของ(2).first_contact, "[รอโค้ด ef] 24.12 + ปีนี้ → เกินวันนี้ = ปีก่อน").toBe(ไม่เกินวันนี้(24, 12));
  expect.soft(ของ(5).first_contact, "[รอโค้ด ef] เริ่ม 20.12 → ไม่เกินวันนี้").toBe(ไม่เกินวันนี้(20, 12));
  expect(ของ(6).first_contact, "ไม่มีวันเริ่มในไฟล์").toBeNull();

  // ── 5) ผู้สนใจเห็นในตาราง ──
  await กล่อง.getByRole("button", { name: "ปิด", exact: true }).first().click();
  await expect(กล่อง).toBeHidden({ timeout: 10_000 });
  const ค้น = page.getByLabel("ค้นหาผู้สนใจ");
  await ค้น.fill(ป้าย);
  const ในตาราง = page.locator("table tbody tr").filter({ hasText: ป้าย });
  // ตารางแบ่งหน้าละ 10 แถว (มาตรฐานทั้งระบบ · TablePagination) → 11 ราย = หน้า 1 สิบแถว + หน้า 2 หนึ่งแถว · เบอร์ครบ 11 ไม่ซ้ำ
  await expect(page.getByText("แสดง 1–10 จาก 11 ราย"), "ผู้สนใจที่นำเข้าเห็นในตาราง 11 ราย").toBeVisible({ timeout: 20_000 });
  await expect(ในตาราง, "หน้า 1 = 10 แถว").toHaveCount(10);
  const แถวในตาราง = await ในตาราง.allTextContents();
  await page.getByRole("button", { name: "หน้าถัดไป" }).click();
  await expect(page.getByText("แสดง 11–11 จาก 11 ราย")).toBeVisible();
  await expect(ในตาราง, "หน้า 2 = 1 แถว").toHaveCount(1);
  แถวในตาราง.push(...await ในตาราง.allTextContents());
  for (const n of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12])
    expect(แถวในตาราง.filter(t => t.includes(เบอร์ฐาน(n))), `ตารางมีผู้สนใจเบอร์ ${เบอร์ฐาน(n)} 1 แถว`).toHaveLength(1);
  // การ์ด "ถึงกำหนดติดตาม" ไม่เพิ่มจากการนำเข้า (โหลดหน้าใหม่ให้การ์ดคิดจากฐาน)
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(การ์ดถึงกำหนด, "หลังนำเข้า การ์ดถึงกำหนดติดตามเท่าเดิม").toHaveAttribute("data-value", ถึงกำหนดก่อน ?? "", { timeout: 30_000 });

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
