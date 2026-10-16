import { describe, it, expect } from "vitest";
import { boqSubtotal, boqLineItems } from "../../packages/shared/lib/boq";

// BOQ ของใบเสนอราคา — ยอดรวม และการแสดงใบเก่าที่ไม่มีรายการ
// (ตัวตั้งรายการ/ราคาจากแม่แบบลบไปพร้อม Flow เก่า และแม่แบบเอาออกทั้งระบบ 16 ต.ค. 69)
describe("BOQ", () => {
  it("ยอดรวม BOQ = Σ จำนวน × ราคาต่อหน่วย", () => {
    expect(boqSubtotal([{ name: "ก", qty: 100, unit: "ตร.ม.", unitPrice: 9800 }, { name: "ข", qty: 1, unit: "งาน", unitPrice: 5000 }])).toBe(985_000);
  });
  it("ใบที่มีรายการ → ใช้รายการนั้นตรงตัว", () => {
    const li = [{ name: "งาน", qty: 2, unit: "ชุด", unitPrice: 300 }];
    expect(boqLineItems({ lineItems: li, materialCost: 600, buildingType: "", area: 0 })).toEqual(li);
  });
});
