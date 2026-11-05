// แบบฟอร์มตัวอย่างของเมนูนำเข้า (บอสสั่ง 5 พ.ย. 69 · ImportMenu) — สร้างไฟล์ → อ่านกลับ → จับคู่คอลัมน์ครบ → ไม่มีแถวต้องตรวจ
//   ตกบนโค้ดก่อนแก้: ไม่มีหัวแบบฟอร์มผู้สนใจ · "หมายเหตุเพิ่มเติม" ไม่ใช่หัวที่รู้จัก · ไม่มีตัวเลือกเมนูกลาง
import { describe, it, expect } from "vitest";
import { สร้างไฟล์Xlsx } from "../../packages/shared/lib/exportWorkbook";
import { แยกสมุดงานจากXlsx } from "../../packages/shared/lib/importSheet";
import { หัวแบบฟอร์มผู้สนใจ, เดาคอลัมน์, หาแถวหัวตาราง, เตรียมแถว, ชื่อช่องนำเข้า, type ช่องนำเข้า } from "../../packages/shared/lib/prospectImport";
import { ตัวเลือกนำเข้า } from "../../packages/shared/lib/importMenuOptions";

describe("เมนูนำเข้า ตัวกลาง", () => {
  it("3 ตัวเลือก: Excel (.xlsx) · CSV (.csv) · ดาวน์โหลดแบบฟอร์มตัวอย่าง", () => {
    expect(ตัวเลือกนำเข้า.map(x => [x.key, x.label, x.accept ?? ""])).toEqual([
      ["xlsx", "Excel", ".xlsx"], ["csv", "CSV", ".csv"], ["template", "ดาวน์โหลดแบบฟอร์มตัวอย่าง", ""]]);
    for (const x of ตัวเลือกนำเข้า) expect(x.desc.length, `${x.label} มีคำอธิบายสั้น`).toBeGreaterThan(0);
  });
});

describe("แบบฟอร์มตัวอย่างผู้สนใจ", () => {
  it("ครบทุกช่องที่ระบบอ่าน · มีหัวใหม่ \"วันติดตาม (ที่ผ่านมา)\"", () => {
    expect(Object.keys(หัวแบบฟอร์มผู้สนใจ).sort()).toEqual((Object.keys(ชื่อช่องนำเข้า) as ช่องนำเข้า[]).sort());
    expect(หัวแบบฟอร์มผู้สนใจ.followUp).toBe("วันติดตาม (ที่ผ่านมา)");
  });
  it("สร้างไฟล์ → อ่านกลับ → จับคู่คอลัมน์ครบทุกช่องเอง · ไม่มีแถวต้องตรวจ", async () => {
    const หัว = Object.values(หัวแบบฟอร์มผู้สนใจ);
    const blob = สร้างไฟล์Xlsx([{ ชื่อ: "ผู้สนใจ", หัวตาราง: หัว, แถว: [] }]);
    const เล่ม = await แยกสมุดงานจากXlsx(await blob.arrayBuffer());
    const ตาราง = [...เล่ม.values()][0] ?? [];
    const h = หาแถวหัวตาราง(ตาราง);
    expect(h, "หาแถวหัวตารางเจอ").toBe(0);
    const คู่ = เดาคอลัมน์(ตาราง[h]);
    expect(Object.keys(คู่).sort(), "จับคู่ครบทุกช่องเอง").toEqual(Object.keys(หัวแบบฟอร์มผู้สนใจ).sort());
    for (const [ช่อง, i] of Object.entries(คู่)) expect(ตาราง[h][i!], ช่อง).toBe(หัวแบบฟอร์มผู้สนใจ[ช่อง as ช่องนำเข้า]);
    const { แถว } = เตรียมแถว(ตาราง, h, คู่, { ปี: 2569, วันนี้: "2026-11-05" });
    expect(แถว.filter(r => r.กลุ่ม === "review")).toEqual([]);
  });
});
