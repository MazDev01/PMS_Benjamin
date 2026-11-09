// หน้าคำขอ HQ แบบตาราง (บอสสั่ง 6 พ.ย. 69) — ลำดับค่าเริ่มต้น + ตัวกรองสถานะ (กติกาเดียวกับฐาน hq_quote_board)
//   ตกบนโค้ดก่อนแก้: ไม่มี เรียงคำขอตามกำหนด / ตรงสถานะคำขอ / ป้ายสถานะคำขอ
import { describe, it, expect } from "vitest";
import { เรียงคำขอตามกำหนด, ตรงสถานะคำขอ, ป้ายสถานะคำขอ } from "../../packages/shared/lib/quoteRequests";

const now = Date.parse("2026-11-06T05:00:00Z");
const แถว = (id: number, status: string, dueAt: string, submittedAt: string) => ({ id, status: status as never, dueAt, submittedAt });

describe("ลำดับค่าเริ่มต้นของตารางคำขอ", () => {
  it("มีกำหนดส่งก่อน (เร็วสุด/เกินมากสุดบนสุด) · ไม่มีกำหนดส่งต่อท้าย ใหม่สุดก่อน", () => {
    const rows = [
      แถว(1, "quoted", "2026-11-01T00:00:00Z", "2026-10-01T00:00:00Z"),
      แถว(2, "new", "2026-11-20T00:00:00Z", "2026-11-05T00:00:00Z"),
      แถว(3, "pricing", "2026-11-02T00:00:00Z", "2026-10-19T00:00:00Z"),   // เกินกำหนด
      แถว(4, "cancelled", "2026-11-03T00:00:00Z", "2026-11-04T00:00:00Z"),
      แถว(5, "new", "2026-11-08T00:00:00Z", "2026-10-25T00:00:00Z"),
      แถว(6, "won", "2026-10-01T00:00:00Z", "2026-09-01T00:00:00Z"),
    ];
    expect(เรียงคำขอตามกำหนด(rows).map(r => r.id)).toEqual([3, 5, 2, 4, 1, 6]);
  });
});

describe("ตัวกรองสถานะ", () => {
  const ใหม่เกิน = แถว(1, "new", "2026-11-05T00:00:00Z", ""), ใหม่ = แถว(2, "pricing", "2026-11-30T00:00:00Z", "");
  const ส่งแล้ว = แถว(3, "quoted", "", ""), สั่ง = แถว(4, "won", "", ""), ยกเลิก = แถว(5, "cancelled", "", ""), ไม่ได้ = แถว(6, "lost", "", "");
  const ทั้งหมด = [ใหม่เกิน, ใหม่, ส่งแล้ว, สั่ง, ยกเลิก, ไม่ได้];
  const ได้ = (k: Parameters<typeof ตรงสถานะคำขอ>[1]) => ทั้งหมด.filter(r => ตรงสถานะคำขอ(r, k, now)).map(r => r.id);
  it("ต้องตีราคา · เกินกำหนด · ส่งแล้ว · ปิด (รวมยกเลิก) · ยกเลิกแล้ว · ทุกสถานะ", () => {
    expect(ได้("todo")).toEqual([1, 2]);
    expect(ได้("overdue")).toEqual([1]);
    expect(ได้("quoted")).toEqual([3]);
    expect(ได้("done")).toEqual([4, 5, 6]);
    expect(ได้("cancelled")).toEqual([5]);
    expect(ได้("all")).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("ป้ายสถานะของแถวเกินกำหนด = สถานะจริง (จำนวนวันอยู่คอลัมน์กำหนดส่ง)", () => {
    expect(ป้ายสถานะคำขอ({ tag: "overdue", status: "pricing", supersedesId: null }).label).toBe("กำลังตีราคา");
    expect(ป้ายสถานะคำขอ({ tag: "overdue", status: "new", supersedesId: 7 }).label).toBe("ขอแก้ราคา");
    expect(ป้ายสถานะคำขอ({ tag: "overdue", status: "new", supersedesId: null }).label).toBe("ใหม่");
    expect(ป้ายสถานะคำขอ({ tag: "quoted", status: "quoted", supersedesId: null }).label).toBe("รอดีลเลอร์");
  });
});
