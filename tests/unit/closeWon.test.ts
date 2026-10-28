import { describe, it, expect } from "vitest";
import { shouldCloseWon } from "../../packages/shared/lib/closeWon";

// ── ปิดการขายสำเร็จ = ต้องเดินงานตามหลังให้ครบเสมอ ─────────────────────────────
//
// บั๊กจริง (ผู้ใช้แจ้ง 11 ส.ค. 69): ปิดการขาย "ดีลที่ 2 ของลูกค้าเดิม" แล้วใบเสนอราคา
// ไม่เปลี่ยนเป็นปิดการขายได้ · ยอดรวมลูกค้าไม่ขยับ เพราะตัวเรียกมีเงื่อนไขแฝงว่า
// "ทำเฉพาะลูกค้าเป้าหมายที่ยังไม่เคยเป็นลูกค้า" (customerId == null)
//
// เทสต์นี้ล็อกไว้ว่ากติกาขึ้นกับ "สถานะ" อย่างเดียว ไม่ขึ้นกับว่าเคยเป็นลูกค้าหรือยัง
describe("ปิดการขายสำเร็จ → ต้องเดินงานตามหลัง", () => {
  it("สถานะ PAID → ต้องเดิน", () => {
    expect(shouldCloseWon("PAID")).toBe(true);
  });

  it.each(["WAITING", "BULLET", "HQ_PRICING", "HQ_QUOTED", "QUOTED", "CANCELLED"] as const)(
    "สถานะ %s → ยังไม่ต้องเดิน", (s) => {
      expect(shouldCloseWon(s)).toBe(false);
    });
});
