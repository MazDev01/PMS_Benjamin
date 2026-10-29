import { test, expect } from "@playwright/test";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// บอสแจ้ง: กด "ล้างตัวกรอง" แล้วข้อมูลหาย — ล้างต้องเห็นข้อมูลมากขึ้น ไม่ใช่น้อยลง
// ไม่นิ่ง 10 ครั้ง (26–29 ต.ค. 69): นับลูกค้า RYG (ข้อมูลตั้งต้นร่วม) — ข้ออื่นที่รันพร้อมกันเพิ่ม/ลบลูกค้า RYG ระหว่างนับ
//   เดิมแก้ด้วยลายเซ็นลูกค้าก่อน/หลัง + ทำใหม่ 4 รอบ — ยังตกเมื่อลูกค้า RYG ขยับทุกรอบ
// ใหม่ (คิวรอบหน้าข้อ 3 · 29 ต.ค. 69): สาขาของข้อเอง ลูกค้า 5 รายที่รู้ค่า (ไม่มีใบ → กิจกรรมล่าสุด = วันเข้ามา)
//   วันนี้ 2 · 1 ม.ค. ปีนี้ 1 · ปีก่อน 2 → เปิดหน้า (ค่าตั้งต้น "ปีนี้") 3 · เดือนนี้ 2 (ม.ค. = 3) · ล้างแล้ว (ทุกช่วงเวลา) 5
//   เกณฑ์เดิม (แคบ ≤ เริ่ม · ล้างแล้ว ≥ เริ่ม) ยังอยู่ · เพิ่มค่าที่รู้ตรงเป๊ะ
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ (สาขาของข้อ)");
let สาขา: สาขาของข้อ;
const ไทย = new Date(Date.now() + 7 * 3600_000);
const ปี = ไทย.getUTCFullYear(), วันนี้ = ไทย.toISOString().slice(0, 10);
const ฐานเลข = 1_500_000_000 + Math.floor(Math.random() * 500_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนช่วงเลขตายตัวของไฟล์อื่น)
const วันเข้า = [วันนี้, วันนี้, `${ปี}-01-01`, `${ปี - 1}-06-15`, `${ปี - 1}-03-10`];
const ควรเดือนนี้ = วันเข้า.filter(d => d.slice(0, 7) === วันนี้.slice(0, 7)).length;

test.beforeAll(async () => {
  สาขา = await สร้างสาขาของข้อ({ จังหวัด: "ยะลา", ภาค: "ใต้" });
  const c = สาขา.รหัส;
  const ผล = รันSQLในฐาน(`set local session_replication_role = replica;
    insert into public.customers (id, dealer_code, name, company, province, join_date) values
      ${วันเข้า.map((d, i) => `(${ฐานเลข + i}, '${c}', 'ZZTEST-ล้างตัวกรอง-${c}-${i}', 'ZZTEST-ล้างตัวกรอง-${c}-${i}', 'ยะลา', '${d}')`).join(",\n      ")};
    set local session_replication_role = origin;`);
  if (ผล === null) throw new Error("ไม่พบฐานทดสอบในเครื่อง (docker) — วางลูกค้าของสาขาไม่ได้");
});
test.afterAll(async () => { await สาขา.ลบ(); });

test("[dealer] ล้างตัวกรองแล้วต้องไม่มีแถวหายไป", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 950 });
  const แถว = page.locator("tbody tr").filter({ hasNot: page.locator("td[colspan]") });
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(แถว, "เปิดหน้า (ปีนี้): ลูกค้าที่มีความเคลื่อนไหวปีนี้ 3 ราย").toHaveCount(3, { timeout: 20_000 });
  const เริ่มต้น = await แถว.count();

  // แคบช่วงเวลาเป็น "เดือนนี้"
  const ปุ่มเวลา = page.locator("button").filter({ hasText: /2569|ปีนี้|เดือนนี้|ทุกช่วงเวลา/ }).first();
  await ปุ่มเวลา.click();
  await page.getByRole("button", { name: "เดือนนี้" }).click();
  await expect(แถว, `เดือนนี้: เหลือ ${ควรเดือนนี้} ราย`).toHaveCount(ควรเดือนนี้);
  const แคบ = await แถว.count();

  // ล้างตัวกรอง → ต้องไม่น้อยกว่าตอนเริ่ม (ล้าง = ไม่กรองเวลา)
  await page.getByRole("button", { name: "ล้างตัวกรอง" }).first().click();
  await expect(แถว, "ล้างแล้ว (ทุกช่วงเวลา): ครบ 5 ราย รวมลูกค้าปีก่อน").toHaveCount(5);
  const หลังล้าง = await แถว.count();
  expect(แคบ).toBeLessThanOrEqual(เริ่มต้น);
  expect(หลังล้าง, "ล้างแล้วแถวต้องไม่หายไป").toBeGreaterThanOrEqual(เริ่มต้น);
  await expect(ปุ่มเวลา).toContainText("ทุกช่วงเวลา");
});
