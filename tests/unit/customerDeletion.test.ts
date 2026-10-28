import { describe, it, expect } from "vitest";
import { customerDeletionImpact, blockReason } from "../../packages/shared/lib/customerDeletion";
import type { LeadRow, QuotationMock } from "../../packages/shared/lib/mock";

// ── ลบลูกค้าที่ปิดการขายไปแล้ว ต้องไม่กลายเป็นทางตัน ──────────────────────────────
//
// บั๊กจริง (ผู้ใช้แจ้ง 14 ส.ค. 69): ลบลูกค้าไม่ได้ ระบบบอก "ยังมีลูกค้าเป้าหมาย 2 รายการผูกอยู่"
// แต่หน้าลูกค้าเป้าหมายขึ้น "ไม่พบลูกค้าเป้าหมาย 0 รายการ" เพราะดีลทั้งคู่ปิดการขายแล้ว
// และหน้านั้นตั้งใจซ่อนดีลที่ปิดแล้ว → สั่งให้ไปลบของที่มองไม่เห็น = ออกไม่ได้เลย
const lead = (id: string, numId: number, status: LeadRow["status"], customerId?: number): LeadRow =>
  ({ id, numId, status, customerId, company: "ffff" } as unknown as LeadRow);
const quote = (id: string, opts: { customerId?: number; dealId?: number }): QuotationMock =>
  ({ id, ...opts } as unknown as QuotationMock);

describe("ลบลูกค้า — ดีลที่จบแล้วต้องไม่บล็อก", () => {
  it("มีแต่ดีลที่ปิดการขายสำเร็จ → ลบได้ และพาดีลไปด้วย", () => {
    const im = customerDeletionImpact(1, [lead("#L-1", 1, "PAID", 1), lead("#L-2", 2, "PAID", 1)], []);
    expect(im.canDelete, "นี่คือเคสที่ผู้ใช้เจอ — ต้องลบได้").toBe(true);
    expect(im.closedLeads.length).toBe(2);
    expect(im.activeLeads.length).toBe(0);
  });

  it("ดีลที่ปิดการขายไม่สำเร็จ ก็ถือว่าจบแล้วเหมือนกัน", () => {
    const im = customerDeletionImpact(1, [lead("#L-1", 1, "CANCELLED", 1)], []);
    expect(im.canDelete).toBe(true);
    expect(im.closedLeads.length).toBe(1);
  });

  it("ใบเสนอราคาของดีลที่จบแล้ว ต้องถูกลบไปพร้อมกัน — ไม่งั้นกลายเป็นใบกำพร้า", () => {
    const im = customerDeletionImpact(1, [lead("#L-1", 7, "PAID", 1)],
      [quote("Q-1", { dealId: 7 }), quote("Q-2", { customerId: 1 }), quote("Q-3", { dealId: 99 })]);
    expect(im.quotations.map(q => q.id).sort()).toEqual(["Q-1", "Q-2"]);
  });
});

describe("ลบลูกค้า — ดีลที่ยังขายอยู่ต้องบล็อกไว้เหมือนเดิม", () => {
  it.each(["WAITING", "BULLET", "HQ_PRICING", "HQ_QUOTED", "QUOTED"] as const)(
    "ดีลสถานะ %s → ลบไม่ได้", (st) => {
      const im = customerDeletionImpact(1, [lead("#L-1", 1, st, 1)], []);
      expect(im.canDelete).toBe(false);
      expect(blockReason(im)).toContain("ยังมีดีลที่ขายอยู่ 1 รายการ");
    });

  it("ปนกัน: จบแล้ว 2 + ยังขายอยู่ 1 → ลบไม่ได้ และนับเฉพาะอันที่ยังขายอยู่", () => {
    const im = customerDeletionImpact(1,
      [lead("#L-1", 1, "PAID", 1), lead("#L-2", 2, "PAID", 1), lead("#L-3", 3, "QUOTED", 1)], []);
    expect(im.canDelete).toBe(false);
    expect(im.activeLeads.length).toBe(1);
  });

  it("ดีลของลูกค้ารายอื่น ต้องไม่ถูกนับ", () => {
    const im = customerDeletionImpact(1, [lead("#L-9", 9, "QUOTED", 2)], []);
    expect(im.canDelete).toBe(true);
    expect(im.closedLeads.length + im.activeLeads.length).toBe(0);
  });

  it("ลูกค้าที่ไม่มีดีลเลย → ลบได้ ไม่มีอะไรพ่วง", () => {
    const im = customerDeletionImpact(1, [], []);
    expect(im.canDelete).toBe(true);
    expect(blockReason(im)).toBe("");
  });
});
