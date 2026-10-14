import { describe, it, expect } from "vitest";
import { needsFollowUp } from "../../packages/shared/lib/leadMetrics";
import type { LeadRow } from "../../packages/shared/lib/mock";

// FLOW.html ขั้น 4–6: "ช่วงที่ลูกบอลอยู่ที่ HQ ระบบจึงนับ 14 วันเฉพาะช่วงนี้ และไม่เตือนดีลเลอร์ว่า lead นิ่ง"
// ลูกค้าเป้าหมายที่ "รอราคา HQ" ต้องไม่ขึ้นเป็นค้างติดต่อ ต่อให้ไม่มีการติดต่อนานแค่ไหน
const lead = (status: LeadRow["status"]): LeadRow => ({
  id: "#L-1", numId: 1, name: "x", company: "x", contact: "", phone: "", email: "", province: "ระยอง", product: "", status,
  value: "", assigned: "", createdAt: "1 ม.ค. 2569",
  activities: [{ id: 1, date: "1 ม.ค. 2569 · 09:00", icon: "note", text: "ติดต่อครั้งแรก", type: "note" }],
} as unknown as LeadRow);

describe("needsFollowUp ระหว่างรอราคา HQ", () => {
  it("ขั้นอื่นที่ไม่ได้ติดต่อนาน → ต้องติดตาม", () => {
    expect(needsFollowUp(lead("BULLET"), 7)).toBe(true);
  });
  it("รอราคา HQ → ไม่เตือน (ลูกบอลอยู่ที่ HQ)", () => {
    expect(needsFollowUp(lead("HQ_PRICING"), 7)).toBe(false);
  });
});
