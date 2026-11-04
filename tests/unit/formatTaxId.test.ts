// เลขประจำตัวผู้เสียภาษีต้องใส่ขีดให้เองระหว่างพิมพ์ (บอสสั่ง 25 ส.ค. 69)
import { describe, it, expect } from "vitest";
import { formatTaxId } from "../../packages/shared/lib/format";

describe("formatTaxId", () => {
  it("13 หลัก → รูปแบบราชการ X-XXXX-XXXXX-XX-X", () => {
    expect(formatTaxId("0105556000123")).toBe("0-1055-56000-12-3");
  });

  it("พิมพ์ยังไม่ครบ ก็ใส่ขีดให้เท่าที่มี", () => {
    expect(formatTaxId("0")).toBe("0");
    expect(formatTaxId("01055")).toBe("0-1055");
    expect(formatTaxId("010555600")).toBe("0-1055-5600");
  });

  it("ตัวอักษร/ขีดที่พิมพ์เองต้องไม่ทำให้เพี้ยน", () => {
    expect(formatTaxId("0-1055-56000-12-3")).toBe("0-1055-56000-12-3");
    expect(formatTaxId("abc0105556000123xyz")).toBe("0-1055-56000-12-3");
  });

  it("เกิน 13 หลัก ตัดทิ้ง ไม่ปล่อยให้ยาวเกินจริง", () => {
    expect(formatTaxId("01055560001239999")).toBe("0-1055-56000-12-3");
  });

  it("ว่าง = ว่าง (ไม่ใส่ขีดลอย ๆ)", () => {
    expect(formatTaxId("")).toBe("");
    expect(formatTaxId("---")).toBe("");
  });
  it('"-" ล้วน = ตั้งใจไม่มีเลข → คืน "-" (ช่องบังคับ 4 พ.ย. 69 · เดิมกลืนเหลือว่าง)', () => {
    expect(formatTaxId("-")).toBe("-");
    expect(formatTaxId(" - ")).toBe("-");
    expect(formatTaxId("--")).toBe("");
    expect(formatTaxId("0-1")).toBe("0-1");
  });
});
