import { describe, it, expect } from "vitest";
import { จัดรูปแดชบอร์ดHQ, ลิงก์กิจกรรม } from "../../packages/shared/lib/hqDashboard";
import { CALLS } from "../../packages/shared/server/v1/metrics";

// ── แดชบอร์ด HQ (ใบ 0235): จัดรูปผลลัพธ์ + กดกิจกรรมแล้วไปที่เรื่องนั้น ─────────────────────────────────────────────
describe("จัดรูปแดชบอร์ดHQ", () => {
  it("ผลว่าง/ขาดช่อง = ศูนย์และรายการว่าง ไม่พัง · เป้าที่ไม่มี = null (ห้ามเป็น 0)", () => {
    const d = จัดรูปแดชบอร์ดHQ(null);
    expect(d.cards).toEqual({ sales: 0, target: null, annualTarget: null, days: 0, leadsNew: 0, quotesSent: 0, closedWon: 0, closedLost: 0 });
    expect(d.top).toEqual([]); expect(d.activity).toEqual([]); expect(d.monthlyTarget).toBeNull();
    expect(d.today.franchiseOverdue).toEqual({ count: 0, amount: 0, ids: [] });
  });
  it("ตัวเลขจากฐาน (ข้อความ/ตัวเลข) แปลงเป็นตัวเลข", () => {
    const d = จัดรูปแดชบอร์ดHQ({
      today: { requestsOpen: "3", requestsOverdue: 1, franchiseOverdue: { count: 1, amount: "60000", ids: ["9811"] } },
      cards: { sales: "130000", target: "31000000", days: 31, leadsNew: 4, quotesSent: 4, closedWon: 2, closedLost: 1 },
      top: [{ code: "RYG", name: "ระยอง", sales: "100000", target: null, closedWon: 1, closedLost: 1 }],
      monthlyTarget: "30416667",
    });
    expect(d.today).toEqual({ requestsOpen: 3, requestsOverdue: 1, franchiseOverdue: { count: 1, amount: 60000, ids: [9811] } });
    expect(d.cards.sales).toBe(130000); expect(d.cards.target).toBe(31000000);
    expect(d.top[0]).toEqual({ code: "RYG", name: "ระยอง", sales: 100000, target: null, closedWon: 1, closedLost: 1 });
    expect(d.monthlyTarget).toBe(30416667);
  });
  it("เส้นทาง /api/v1 ใช้ตัวจัดรูปเดียวกับฝั่งต่อฐานตรง และส่งพารามิเตอร์ครบ", () => {
    expect(CALLS.hqDashboard.rpc).toBe("hq_dashboard");
    expect(CALLS.hqDashboard.args({ start: "2026-10-01", end: "2026-10-31", dealer: "RYG", today: "2026-10-21" }))
      .toEqual({ p_start: "2026-10-01", p_end: "2026-10-31", p_dealer: "RYG", p_today: "2026-10-21" });
    expect(CALLS.hqDashboard.shape({ cards: { sales: "5" } })).toEqual(จัดรูปแดชบอร์ดHQ({ cards: { sales: "5" } }));
  });
});

describe("ลิงก์กิจกรรม", () => {
  const ไป = (action: string, target: string) => ลิงก์กิจกรรม({ action, target });
  it("งานดีลเลอร์ → หน้าดีลเลอร์นั้น", () => {
    expect(ไป("แก้ไขดีลเลอร์", "RYG · ร้านระยอง")).toBe("/hq/dealers/RYG");
    expect(ไป("รีเซ็ตรหัสผ่านดีลเลอร์", "ZTE")).toBe("/hq/dealers/ZTE");
    expect(ไป("เข้าระบบแทนดีลเลอร์", "CNX")).toBe("/hq/dealers/CNX");
    expect(ไป("ลูกค้าเป้าหมายเป็นดีลเลอร์แล้ว", "#10 → ZTV · ร้านใหม่")).toBe("/hq/dealers/ZTV");
  });
  it("ดีลเลอร์อ่านรหัสไม่ออก/แถว HQ → รายการดีลเลอร์ (ไม่เดาปลายทาง)", () => {
    expect(ไป("แก้ไขดีลเลอร์", "ร้านไม่มีรหัส")).toBe("/hq/dealers");
    expect(ไป("แก้ไขดีลเลอร์", "HQ · สำนักงานใหญ่")).toBe("/hq/dealers");
  });
  it("ใบค่าแฟรนไชส์ → ค้นเลขที่ใบ · ผู้สนใจ → ค้นชื่อ", () => {
    expect(ไป("ออกใบค่าแฟรนไชส์", "DP-2026-0030 · ร้านเอ · Standard")).toBe("/hq/proposals?q=DP-2026-0030");
    expect(ไป("บันทึกการชำระค่าแฟรนไชส์", "DP-2026-0037-V3 · 200,000.00 บาท")).toBe("/hq/proposals?q=DP-2026-0037-V3");
    expect(ไป("เพิ่มผู้สนใจเป็นดีลเลอร์", "ร้านบี")).toBe(`/hq/prospects?q=${encodeURIComponent("ร้านบี")}`);
    expect(ไป("เปลี่ยนขั้นลูกค้าเป้าหมาย (HQ)", "ร้านซี · ติดต่อแล้ว → ส่งข้อมูลบริษัทแล้ว")).toBe(`/hq/prospects?q=${encodeURIComponent("ร้านซี")}`);
  });
  it("ตั้งค่า/ผู้ใช้ HQ → หน้าตั้งค่า · อ่านไม่ออก → บันทึกการใช้งาน", () => {
    expect(ไป("บันทึกการตั้งค่า", "การแจ้งเตือน")).toBe("/hq/settings");
    expect(ไป("เพิ่มผู้ใช้ HQ", "a@b.co")).toBe("/hq/settings");
    expect(ไป("เข้าสู่ระบบ", "Benjamin HQ")).toBe("/hq/audit");
  });
});
