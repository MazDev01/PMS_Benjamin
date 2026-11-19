import { test, expect } from "@playwright/test";
import { DEALER_ORIGIN, loginUI } from "./funcHelpers";
import { settle, ปุ่มช่วงเวลา, ย้อนเดือนISO } from "./helpers";
import { REAL_BACKEND } from "./supabaseEnv";
import { รันSQLในฐาน } from "./localDb";
import { สร้างสาขาของข้อ, type สาขาของข้อ } from "./ownDealer";

// บอสแจ้ง: กด "ล้างตัวกรอง" แล้วข้อมูลหาย — ล้างต้องเห็นข้อมูลมากขึ้น ไม่ใช่น้อยลง
// ไม่นิ่ง 10 ครั้ง (26–29 ต.ค. 69): นับลูกค้า RYG (ข้อมูลตั้งต้นร่วม) — ข้ออื่นที่รันพร้อมกันเพิ่ม/ลบลูกค้า RYG ระหว่างนับ
//   เดิมแก้ด้วยลายเซ็นลูกค้าก่อน/หลัง + ทำใหม่ 4 รอบ — ยังตกเมื่อลูกค้า RYG ขยับทุกรอบ
// ใหม่ (คิวรอบหน้าข้อ 3 · 29 ต.ค. 69): สาขาของข้อเอง ลูกค้า 5 รายที่รู้ค่า (ไม่มีใบ → กิจกรรมล่าสุด = วันเข้ามา)
//   3 พ.ย. 69 (ตัวเลือกช่วงเวลา 4 ตัว): วันนี้ 2 · 2 เดือนก่อน 1 · 6 เดือนก่อน 1 · 18 เดือนก่อน 1
//   → เปิดหน้า (ค่าตั้งต้น "1 ปี") 4 · 1 เดือน 2 · 3 เดือน 3 · ล้างแล้ว (กลับ 1 ปี) 4
//   เกณฑ์เดิม (แคบ ≤ เริ่ม · ล้างแล้ว ≥ เริ่ม) ยังอยู่ · เพิ่มค่าที่รู้ตรงเป๊ะ
// กลับด้าน 19 พ.ย. 69 (บอสตัดสิน ③ ก): ตารางลูกค้าฝั่งดีลเลอร์ไม่กรองตามช่วงเวลาแล้ว — แสดงทุกราย เท่าการ์ด "ลูกค้าทั้งหมด" (เหมือน HQ)
//   เดิม 1 ปี 4 · 3 เดือน 3 · 1 เดือน 2 (ลูกค้า 18 เดือนก่อนหายจากตาราง แต่การ์ดนับ 5 — ข้อมูลตัวอย่าง CNX การ์ด 25 ตาราง 24)
//   ตอนนี้ทุกช่วง = 5 = การ์ด · ตกบนโค้ดเดิม (e506ce56): เปิดหน้าได้ 4 แถว ≠ การ์ด 5
test.skip(() => !REAL_BACKEND, "ต้องมีฐานทดสอบ (สาขาของข้อ)");
let สาขา: สาขาของข้อ;
const ไทย = new Date(Date.now() + 7 * 3600_000);
const ปี = ไทย.getUTCFullYear(), วันนี้ = ไทย.toISOString().slice(0, 10);
const ฐานเลข = 1_500_000_000 + Math.floor(Math.random() * 500_000) * 100;   // เลขแถวของรอบนี้ (ไม่ชนช่วงเลขตายตัวของไฟล์อื่น)
const วันเข้า = [วันนี้, วันนี้, ย้อนเดือนISO(วันนี้, 2), ย้อนเดือนISO(วันนี้, 6), ย้อนเดือนISO(วันนี้, 18)];
void ปี;

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

// ปุ่ม "ล้างตัวกรอง" ถูกถอดจากแถบตัวกรองทุกหน้า (บอสสั่ง 13 พ.ย. 69) · ตารางลูกค้าไม่กรองตามช่วง (บอสตัดสิน 19 พ.ย. 69)
test("[dealer] ตารางลูกค้าแสดงทุกราย เท่าการ์ดลูกค้าทั้งหมด ทุกช่วงเวลา · ไม่มีปุ่มล้างตัวกรอง", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 950 });
  const แถว = page.locator("tbody tr").filter({ hasNot: page.locator("td[colspan]") });
  const การ์ดทั้งหมด = page.locator('[data-kpi-row] [data-kpi="total"] [data-value]');
  await loginUI(page, DEALER_ORIGIN, "/login", สาขา.บัญชี);
  await page.goto(`${DEALER_ORIGIN}/customers`, { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(การ์ดทั้งหมด, "การ์ดลูกค้าทั้งหมด = 5").toHaveAttribute("data-value", "5", { timeout: 20_000 });
  await expect(แถว, "เปิดหน้า (1 ปี): ตารางทุกราย 5 = การ์ด (รวมลูกค้า 18 เดือนก่อน)").toHaveCount(5, { timeout: 20_000 });

  const ปุ่มเวลา = ปุ่มช่วงเวลา(page);
  for (const ช่วง of ["3 เดือน", "1 เดือน", "1 ปี"]) {
    await ปุ่มเวลา.click();
    await page.getByRole("button", { name: ช่วง, exact: true }).click();
    await expect(แถว, `${ช่วง}: ตารางยังแสดงทุกราย 5`).toHaveCount(5);
    await expect(การ์ดทั้งหมด, `${ช่วง}: การ์ดลูกค้าทั้งหมดยัง 5`).toHaveAttribute("data-value", "5");
  }
  await expect(page.getByRole("button", { name: "ล้างตัวกรอง", exact: true }), "แถบตัวกรองไม่มีปุ่มล้างตัวกรอง").toHaveCount(0);
  await expect(page.locator("[data-time-range]").first(), "กลับค่าตั้งต้น 1 ปี").toHaveAttribute("data-time-range", "y1");
});
