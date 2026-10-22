import { describe, it, expect } from "vitest";
import { CALLS } from "../../packages/shared/server/v1/metrics";

// ── เส้นทาง api ต้องส่งต่อข้อมูลครบเท่ากับที่ฐานข้อมูลคืนมา ────────────────────────
// ⚠️ บั๊กจริง 26 ส.ค. 69: เพิ่ม byDay/byHour ที่ฐานข้อมูลและเส้นทาง supabase แล้ว
//    แต่ลืมเส้นทางนี้ ซึ่งเป็นทางที่ "เว็บใช้งานจริง" ใช้ → หน้าจอได้ undefined
//    แล้วแดชบอร์ดพังทั้งหน้าทันทีที่เลือกช่วงเวลา "วันนี้"
//    บนเครื่องนักพัฒนาไม่มีทางเจอ เพราะ dev ใช้เส้นทาง supabase ตรง
describe("เส้นทาง api · สรุปใบเสนอราคาสำหรับแดชบอร์ด", () => {
  const shape = CALLS.dashboardQuoteSummary.shape as (d: unknown) => any;

  it("ส่งต่อครบทุกช่อง แม้ฐานข้อมูลคืนมาไม่ครบ", () => {
    const out = shape({});
    for (const k of ["byMonth", "byDay", "byHour", "byStatus", "byProduct"]) {
      expect(Array.isArray(out[k]), `ช่อง ${k} ต้องเป็นรายการเสมอ ห้ามเป็น undefined`).toBe(true);
    }
  });

  it("แปลงข้อมูลรายวัน/รายชั่วโมงได้ถูกต้อง", () => {
    const out = shape({
      byDay: [{ d: "2026-08-26", quotes: 3, won: 2, lost: 1, won_val: 5_000_000 }],
      byHour: [{ h: 14, quotes: 2, won: 1, won_val: 2_500_000 }],
    });
    expect(out.byDay).toEqual([{ d: "2026-08-26", quotes: 3, won: 2, lost: 1, wonVal: 5_000_000 }]);
    expect(out.byHour).toEqual([{ h: 14, quotes: 2, won: 1, wonVal: 2_500_000 }]);
  });
});

// ⚠️ บั๊กจริงบนเว็บจริง 15 ก.ย. 69: ใบ 0157 เพิ่ม won รายสาขา + quoted รายเดือน
//    เส้นทาง supabase ส่งต่อแล้ว แต่เส้นทางนี้ไม่ส่ง → /hq/pipeline ขึ้น "NaN ราย / NaN ราย"
describe("เส้นทาง api · สรุปลูกค้าเป้าหมาย", () => {
  const shape = CALLS.leadSummary.shape as (d: unknown) => any;

  it("ส่งต่อ won รายสาขา และ quoted รายเดือน เป็นตัวเลขเสมอ", () => {
    const out = shape({
      byDealer: [{ dealer_code: "HQ", leads: 155, quoted: 1, won: 0, lost: 2 }],
      byMonth: [{ y: 2026, m: 5, new: 34, won: 0, lost: 1, quoted: 1 }],
    });
    expect(out.byDealer).toEqual([{ dealerCode: "HQ", leads: 155, quoted: 1, won: 0, lost: 2 }]);   // lost: ใบ 0234 (อัตราปิดการขายรายดีลเลอร์)
    expect(out.byMonth).toEqual([{ y: 2026, m: 5, created: 34, won: 0, lost: 1, quoted: 1 }]);
  });

  it("ฐานข้อมูลไม่ส่ง won/quoted มา ต้องได้ 0 ไม่ใช่ NaN", () => {
    const out = shape({ byDealer: [{ dealer_code: "CNX", leads: 3, quoted: 1 }], byMonth: [{ y: 2026, m: 0, new: 2 }] });
    expect(Number.isNaN(out.byDealer[0].leads - out.byDealer[0].won)).toBe(false);
    expect(Number.isNaN(out.byMonth[0].quoted - out.byMonth[0].won)).toBe(false);
  });
});
