// % บวกตั้งต้นของสาขา (บอสสั่ง 20 ส.ค. 69 · ย้ายไปหน้าตั้งค่า 16 ต.ค. 69 ตอนเอาแม่แบบออกทั้งระบบ)
// ใช้ตั้งต้น % ของทุกบรรทัดในใบที่ทำจากใบ HQ · ตั้งได้อิสระ ไม่มีเพดาน ไม่มีขั้นต่ำ — ห้ามมีตัวตรวจที่เทียบกับต้นทุน
import { describe, it, expect } from "vitest";
import { markupPctOf } from "../../packages/shared/lib/boq";

describe("% บวกตั้งต้นของสาขา (markupPctOf)", () => {
  it("ไม่เคยตั้งอะไรเลย = 0", () => {
    expect(markupPctOf(undefined)).toBe(0);
    expect(markupPctOf({})).toBe(0);
  });
  it("ตั้งที่หน้าตั้งค่าแล้ว (defaultPct) = ใช้ค่านั้น", () => {
    expect(markupPctOf({ defaultPct: 20 })).toBe(20);
    expect(markupPctOf({ defaultPct: 0 }), "ตั้งเป็น 0 = ไม่บวก").toBe(0);
  });
  it("ติดลบได้ · สูงมากได้ — ไม่มีเพดาน ไม่มีขั้นต่ำ", () => {
    expect(markupPctOf({ defaultPct: -5 })).toBe(-5);
    expect(markupPctOf({ defaultPct: 500 })).toBe(500);
  });
  it("defaultPct ชนะค่าเดิมรายแม่แบบเสมอ (บันทึกจากหน้าตั้งค่าแล้ว = ใช้ค่าใหม่)", () => {
    expect(markupPctOf({ defaultPct: 12, byTemplate: { a: 30, b: 30 } })).toBe(12);
  });

  describe("ค่าเดิมสมัยตั้งรายแม่แบบ ต้องไม่หายหลังย้าย", () => {
    it("ปุ่ม 'ใช้กับทุกแม่แบบ' เดิม (ค่าเดียวกันทุกแม่แบบ) → ได้ค่านั้นตรงตัว", () => {
      expect(markupPctOf({ byTemplate: { "tpl-1": 15, "tpl-2": 15, "tpl-3": 15 } })).toBe(15);
    });
    it("ตั้งต่างกัน → ใช้ค่าที่พบบ่อยสุด", () => {
      expect(markupPctOf({ byTemplate: { a: 10, b: 25, c: 25 } })).toBe(25);
    });
    it("พบบ่อยเท่ากัน → ใช้ค่ามากสุด", () => {
      expect(markupPctOf({ byTemplate: { a: 10, b: 25 } })).toBe(25);
    });
    it("ค่าเพี้ยน (NaN) ไม่นับ · เหลือไม่มีค่าเลย = 0", () => {
      expect(markupPctOf({ byTemplate: { a: Number.NaN, b: 8 } })).toBe(8);
      expect(markupPctOf({ byTemplate: { a: Number.NaN } })).toBe(0);
      expect(markupPctOf({ defaultPct: Number.NaN, byTemplate: { a: 9 } }), "defaultPct เพี้ยน = ถือว่าไม่ได้ตั้ง").toBe(9);
    });
  });
});
