import { describe, it, expect } from "vitest";
import { ขั้นย่อยหลังส่งใบ } from "../../packages/shared/lib/prospectJourney";
import { prospectStatusLabel, ชื่อขั้นปัจจุบัน } from "../../packages/shared/lib/dealerProspects";

// สถานะผู้สนใจหลังส่งใบค่าแฟรนไชส์ (บอสสั่ง 5 พ.ย. 69) — เดินตามใบเอง · กติกาเดียวกับ dealer_conversion_ready ของฐาน
//   ตกบนโค้ดเดิม: ไม่มี ขั้นย่อยหลังส่งใบ · ชื่อขั้นเป็น "รอตัดสินใจ HQ"
const ใบ = (id: number, status: "sent" | "accepted" | "rejected" | "superseded", amount: number) => ({ id, status, amount, proposalNo: `DP-2026-${id}` });
describe("สถานะย่อยหลังส่งใบ", () => {
  it("ชื่อขั้นหลังส่งใบ = รอผู้สนใจตอบรับ (ไม่ใช่ รอตัดสินใจ HQ) · ข้อความเก่าแปลงตอนแสดง", () => {
    expect(prospectStatusLabel.considering).toBe("รอผู้สนใจตอบรับ");
    expect(ชื่อขั้นปัจจุบัน("นัดคุยแล้ว → รอตัดสินใจ HQ")).toBe("นัดคุยแล้ว → รอผู้สนใจตอบรับ");
  });
  it("1) ส่งใบแล้ว ยังไม่ตอบรับ = รอผู้สนใจตอบรับ", () => {
    expect(ขั้นย่อยหลังส่งใบ("considering", [ใบ(1, "sent", 50000)], new Map())).toEqual({ key: "รอตอบรับ", label: "รอผู้สนใจตอบรับ" });
  });
  it("2) ตอบรับ ยังจ่ายไม่ครบ = รอชำระ (จ่ายแล้ว x / y บาท) ของใบตอบรับล่าสุด", () => {
    const r = ขั้นย่อยหลังส่งใบ("considering", [ใบ(1, "accepted", 50000), ใบ(2, "accepted", 80000)], new Map([[1, 10000], [2, 30000]]));
    expect(r).toMatchObject({ key: "รอชำระ", label: "รอชำระ (จ่ายแล้ว 30,000 / 80,000 บาท)", ชำระ: 30000, ยอด: 80000, เลขที่: "DP-2026-2" });
    expect(ขั้นย่อยหลังส่งใบ("considering", [ใบ(3, "accepted", 50000)], new Map())?.label).toBe("รอชำระ (จ่ายแล้ว 0 / 50,000 บาท)");
  });
  it("3) ตอบรับ + ชำระครบ (ใบไหนก็ได้) = พร้อมตั้งเป็นดีลเลอร์ · ยอด 0 = พร้อมทันที", () => {
    expect(ขั้นย่อยหลังส่งใบ("considering", [ใบ(1, "accepted", 50000), ใบ(2, "accepted", 80000)], new Map([[1, 50000]]))?.key).toBe("พร้อม");
    expect(ขั้นย่อยหลังส่งใบ("considering", [ใบ(4, "accepted", 0)], new Map())).toEqual({ key: "พร้อม", label: "พร้อมตั้งเป็นดีลเลอร์" });
  });
  it("4) เป็นดีลเลอร์แล้ว / ไม่สำเร็จ = ไม่มีสถานะย่อย · ขั้นก่อนหน้าที่ยังไม่มีใบส่งแล้ว = ไม่มี", () => {
    for (const s of ["won", "lost"] as const) expect(ขั้นย่อยหลังส่งใบ(s, [ใบ(1, "accepted", 0)], new Map()), s).toBeNull();
    expect(ขั้นย่อยหลังส่งใบ("meeting", [{ id: 9, status: "draft" as never, amount: 1 }], new Map()), "มีแต่ใบร่าง").toBeNull();
  });
  it("ความพร้อมคิดจากใบ ไม่ขึ้นกับขั้น (แบบ dealer_conversion_ready) — ขั้นก่อนหน้าที่มีใบตอบรับ+ชำระครบ = พร้อม", () => {
    expect(ขั้นย่อยหลังส่งใบ("contacted", [ใบ(1, "accepted", 50000)], new Map([[1, 50000]]))?.key).toBe("พร้อม");
    expect(ขั้นย่อยหลังส่งใบ("meeting", [ใบ(1, "sent", 50000)], new Map())?.key).toBe("รอตอบรับ");
  });
});
