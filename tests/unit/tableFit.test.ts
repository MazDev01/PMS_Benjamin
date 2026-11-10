// ตารางพอดีจอ — ล็อกความกว้างคอลัมน์ (บอสสั่ง 10 พ.ย. 69 · ตรวจกลับด้านกติกา 6 พ.ย.)
//   เดิม (6 พ.ย. 69): ซ่อนคอลัมน์ที่ทั้งตารางเป็น "—" + คอลัมน์ชื่อกว้างตามชื่อยาวสุดในข้อมูล ≤ 25%
//   ตอนนี้: ไม่ซ่อนคอลัมน์ว่าง (แสดง "—") · คอลัมน์ชื่อ = ค่ากลางคงที่ % ไม่ขึ้นกับข้อมูล
//   ตกบนโค้ดเดิม: tableFit ยังส่งออก ซ่อนคอลัมน์ว่าง/กว้างคอลัมน์ชื่อ · ไม่มี ความกว้างคอลัมน์ชื่อ · หน้าเจาะลึก/ภาพรวมยอดขายยังเรียกตัววัด
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import * as ตาราง from "../../packages/shared/lib/tableFit";

describe("ล็อกความกว้างคอลัมน์ (tableFit)", () => {
  it("คอลัมน์ชื่อ = % คงที่ (ไม่ใช่พิกเซลจากการวัดข้อมูล)", () => {
    expect(ตาราง.ความกว้างคอลัมน์ชื่อ).toMatch(/^\d+(\.\d+)?%$/);
  });
  it("ไม่มีตัวซ่อนคอลัมน์ว่าง / ตัววัดชื่อตามข้อมูลแล้ว", () => {
    expect("ซ่อนคอลัมน์ว่าง" in ตาราง).toBe(false);
    expect("กว้างคอลัมน์ชื่อ" in ตาราง).toBe(false);
    expect(existsSync("packages/shared/lib/useNameColWidth.ts"), "ตัววัดคอลัมน์ชื่อตามข้อมูลถูกเอาออก").toBe(false);
  });
  it("หน้าเจาะลึก/ภาพรวมยอดขาย/คำขอใบเสนอราคา ไม่ซ่อนคอลัมน์ว่าง · คอลัมน์ชื่อใช้ค่ากลาง", () => {
    for (const f of ["apps/hq/app/(app)/hq/_drill/DrillEngine.tsx", "apps/hq/app/(app)/hq/pipeline/page.tsx", "apps/hq/app/(app)/hq/pipeline/Drill.tsx", "apps/hq/app/(app)/hq/quote-requests/page.tsx"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/ซ่อนคอลัมน์ว่าง\(|useกว้างคอลัมน์ชื่อ/);
      expect(s, f).toContain("ความกว้างคอลัมน์ชื่อ");
    }
  });
  it("ค่าว่าง = null · undefined · \"\" · — · NaN", () => {
    for (const v of [null, undefined, "", "—", NaN]) expect(ตาราง.ว่าง(v)).toBe(true);
    for (const v of [0, "0", "ก"]) expect(ตาราง.ว่าง(v)).toBe(false);
  });
});
