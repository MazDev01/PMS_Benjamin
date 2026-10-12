// แม่แบบที่ยังไม่ได้ตั้งราคา → สำนักงานใหญ่ต้องได้รับแจ้งเตือน
// ที่มา: บอสแจ้ง 19 ส.ค. 69 — ไม่มีราคาแม่แบบ = ดีลเลอร์ออกใบเสนอราคาไม่ได้เลย
// เพราะรายการสินค้าเพิ่มได้ทางเดียวคือเลือกจากแคตตาล็อก
import { describe, it, expect } from "vitest";
import { templatesMissingPrice, DEFAULT_HQ_NOTIF_RULES, HQ_ALERT_META } from "../../packages/shared/lib/mock";

const p = (name: string, price: number, subtypes?: string[], subtypePrices?: Record<string, number>) =>
  ({ name, price, subtypes, subtypePrices });

describe("templatesMissingPrice", () => {
  it("แม่แบบที่มีราคาแล้ว ไม่ถูกนับว่าขาด", () => {
    expect(templatesMissingPrice([p("โกดังสำเร็จรูป", 5100)])).toEqual([]);
  });

  it("แม่แบบหลักราคา 0 = ขาด", () => {
    expect(templatesMissingPrice([p("โรงงาน", 0)])).toEqual(["โรงงาน"]);
  });

  it("แม่แบบย่อยที่ไม่ได้ตั้งราคาเอง แต่แม่แบบหลักมีราคา = ไม่ขาด (ใช้ราคาหลักได้)", () => {
    // ตรงกับกติกาของ catalogRate: ย่อยไม่มีราคา → ตกไปใช้ราคาแม่แบบหลัก
    expect(templatesMissingPrice([p("โรงงาน", 4800, ["โรงงานอาหาร", "โรงงานเหล็ก"])])).toEqual([]);
  });

  it("หลักไม่มีราคา และย่อยก็ไม่มี = ขาดทั้งหลักและย่อย", () => {
    expect(templatesMissingPrice([p("สนามกีฬาในร่ม", 0, ["สนามแบดมินตัน"])]))
      .toEqual(["สนามกีฬาในร่ม", "สนามกีฬาในร่ม · สนามแบดมินตัน"]);
  });

  it("หลักไม่มีราคา แต่ย่อยตั้งราคาไว้เอง = ขาดเฉพาะหลัก", () => {
    expect(templatesMissingPrice([p("สนามกีฬาในร่ม", 0, ["สระว่ายน้ำในร่ม"], { "สระว่ายน้ำในร่ม": 7200 })]))
      .toEqual(["สนามกีฬาในร่ม"]);
  });

  it("แคตตาล็อกว่าง = ไม่มีอะไรให้รายงานเป็นรายรายการ (ใช้ข้อความ 'ยังไม่มีแม่แบบ' แทน)", () => {
    expect(templatesMissingPrice([])).toEqual([]);
  });
});

describe("กฎแจ้งเตือนของสำนักงานใหญ่", () => {
  it("มีเรื่อง 'แม่แบบยังไม่ได้ตั้งราคา' อยู่ในรายการที่ตั้งค่าได้", () => {
    expect(HQ_ALERT_META.map(m => m.key)).toContain("catalogNoPrice");
  });

  it("เปิดไว้เป็นค่าเริ่มต้นทั้งการแจ้งเตือนและการขึ้นกระดิ่ง", () => {
    // ถ้าปิดไว้ สำนักงานใหญ่จะไม่มีทางรู้ว่าดีลเลอร์ทั้งเครือทำงานต่อไม่ได้
    expect(DEFAULT_HQ_NOTIF_RULES.alerts.catalogNoPrice.on).toBe(true);
    expect(DEFAULT_HQ_NOTIF_RULES.alerts.catalogNoPrice.inapp).toBe(true);
  });
});
