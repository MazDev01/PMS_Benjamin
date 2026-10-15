import { describe, it, expect } from "vitest";
import { leadToUpdateRow, leadToRow } from "../../packages/shared/lib/data/supabase/rowMappers";
import type { LeadRow } from "../../packages/shared/lib/data/types";

// แก้แถวลีดต้องไม่ส่งสถานะ "รอราคา HQ" — ฐานเป็นเจ้าของขั้นนี้ (0183)
//   ส่งไปตอนฐานขยับแล้ว = ทั้งคำขอถูกปฏิเสธ (400 hq_pricing_locked) งานที่ติ๊กมาด้วยหาย (ทดสอบโหลด 10 ดีลเลอร์ · 14 ต.ค. 69)
const ลีด = (status: string) => ({ id: "#L-1", status, company: "ZZ", lostReason: null, tasks: [{ id: "t1", done: true }] }) as unknown as LeadRow;

describe("leadToUpdateRow", () => {
  it("ถือขั้น รอราคา HQ → ไม่ส่งช่องสถานะ แต่ส่งงานที่ติ๊กไป", () => {
    const r = leadToUpdateRow(ลีด("HQ_PRICING"));
    expect("status" in r).toBe(false);
    // ห้ามล้างเหตุผลที่ฐานเพิ่งตั้งตอนลูกค้าปฏิเสธใบ (รอบปิดระยะ 4: 422 "ต้องระบุเหตุผล" ในการบันทึกถัดไป)
    expect("lost_reason" in r).toBe(false);
    expect(r.tasks).toEqual([{ id: "t1", done: true }]);
  });
  it("ขั้นอื่นส่งสถานะตามปกติ (ดีลเลอร์เปลี่ยนขั้นเองได้)", () => {
    expect(leadToUpdateRow(ลีด("QUOTED")).status).toBe("QUOTED");
    expect(leadToUpdateRow(ลีด("PAID")).status).toBe("PAID");
  });
  it("สร้างแถวใหม่ไม่ใช้ตัวนี้ — leadToRow ยังส่งสถานะเสมอ (ฐานปฏิเสธการสร้างด้วยขั้นนี้เอง)", () => {
    expect(leadToRow(ลีด("HQ_PRICING")).status).toBe("HQ_PRICING");
  });
});
