import { describe, it, expect } from "vitest";
import { อัตราปิดการขาย, อัตราปิดการขายจากลีด } from "../../packages/shared/lib/winRate";

// อัตราปิดการขาย สูตรเดียว (รอบ 4 · บอสตัดสิน 21 ต.ค. 69): ลีดปิดสำเร็จ ÷ (สำเร็จ + ไม่สำเร็จ)
describe("อัตราปิดการขาย", () => {
  it("ลีด 3 สำเร็จ · 3 ไม่สำเร็จ · 4 ยังเปิด = 50% (ลีดที่ยังเปิดไม่นับ)", () => {
    const leads = [..."PPPCCCOOOO"].map(c => ({ status: c === "P" ? "PAID" : c === "C" ? "CANCELLED" : "QUOTED" }));
    expect(อัตราปิดการขายจากลีด(leads)).toBe(50);
  });
  it("ยังไม่มีลีดที่ปิด = null (ไม่ใช่ 0)", () => {
    expect(อัตราปิดการขาย(0, 0)).toBeNull();
    expect(อัตราปิดการขายจากลีด([{ status: "WAITING" }])).toBeNull();
  });
  it("ปัดเป็นจำนวนเต็ม", () => {
    expect(อัตราปิดการขาย(1, 2)).toBe(33);
    expect(อัตราปิดการขาย(2, 1)).toBe(67);
  });
});
