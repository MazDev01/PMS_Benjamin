import { describe, it, expect } from "vitest";
// @ts-expect-error — สคริปต์ดูแลระบบเป็น .mjs ไม่มีไฟล์ชนิดข้อมูล
import { ตรวจสวิตช์ซ่อนราคา } from "../../scripts/lib/priceSwitchCheck.mjs";

// ตัวตรวจก่อนนำขึ้นระบบจริง: สวิตช์ซ่อนราคาแม่แบบห้ามเปิดก่อน Flow ใบ HQ ขึ้นระบบ (ข้อตัดสิน 13 ต.ค. 69)
// เปิดก่อน = ดีลเลอร์ออกใบเสนอราคาไม่ได้ทั้งเครือ โดยไม่มี error บอก
describe("preflight: สวิตช์ซ่อนราคาแม่แบบ", () => {
  it("เปิดสวิตช์ แต่ยังไม่มีใบ HQ ที่ส่งถึงดีลเลอร์ → ต้องตก", () => {
    const r = ตรวจสวิตช์ซ่อนราคา({ switchOn: true, sentHqQuotes: 0 });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("ออกใบเสนอราคาไม่ได้");
  });

  it("เปิดสวิตช์ แต่ฐานยังไม่มีตารางใบ HQ (อ่านจำนวนไม่ได้) → ต้องตก ไม่ใช่ปล่อยผ่าน", () => {
    expect(ตรวจสวิตช์ซ่อนราคา({ switchOn: true, sentHqQuotes: null }).ok).toBe(false);
    expect(ตรวจสวิตช์ซ่อนราคา({ switchOn: true, sentHqQuotes: undefined }).ok).toBe(false);
    expect(ตรวจสวิตช์ซ่อนราคา({ switchOn: true, sentHqQuotes: Number.NaN }).ok).toBe(false);
  });

  it("เปิดสวิตช์ และมีใบ HQ ที่ส่งถึงดีลเลอร์แล้ว → ผ่าน", () => {
    const r = ตรวจสวิตช์ซ่อนราคา({ switchOn: true, sentHqQuotes: 3 });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("3 ใบ");
  });

  it("สวิตช์ปิด → ผ่านเสมอ ไม่ว่ามีใบ HQ หรือยัง", () => {
    expect(ตรวจสวิตช์ซ่อนราคา({ switchOn: false, sentHqQuotes: 0 }).ok).toBe(true);
    expect(ตรวจสวิตช์ซ่อนราคา({ switchOn: false, sentHqQuotes: null }).ok).toBe(true);
  });

  it("ฐานที่ยังไม่มีสวิตช์ (ยังไม่ขึ้น Flow ใหม่) → ผ่าน", () => {
    expect(ตรวจสวิตช์ซ่อนราคา({ switchOn: null, sentHqQuotes: null }).ok).toBe(true);
  });
});
