// เส้นเวลาของลูกค้า (lib/customerTimeline · บอสสั่ง 19 พ.ย. 69) — ฟังก์ชันประกอบล้วน
//   ใหม่สุดก่อน · ไม่มีวันที่ = ไม่แสดง · นัดในไทม์ไลน์ลีด (meeting) ไม่ซ้ำกับแถวนัดจริง · งานของเหตุการณ์ = ชื่องานของลีด
import { describe, it, expect } from "vitest";
import { ประกอบเส้นเวลา, เวลาจากป้ายไทย } from "@pms/shared/lib/customerTimeline";

const ว่าง = { ลูกค้า: null, ลีด: [], คำขอ: [], นัด: [], บันทึก: [] };

describe("เวลาจากป้ายไทย", () => {
  it("ป้ายวันที่ + เวลา → ISO เวลาไทย", () => {
    expect(เวลาจากป้ายไทย("17 ต.ค. 2569 · 15:01")).toBe("2026-10-17T15:01:00+07:00");
  });
  it("ไม่มีเวลา = เที่ยง · วันที่แบบ ISO (ข้อมูลตั้งต้น) อ่านได้ · อ่านไม่ได้ = null", () => {
    expect(เวลาจากป้ายไทย("1 ม.ค. 2569")).toBe("2026-01-01T12:00:00+07:00");
    expect(เวลาจากป้ายไทย("2026-04-25")).toBe("2026-04-25T12:00:00+07:00");
    expect(เวลาจากป้ายไทย("เมื่อวาน")).toBeNull();
    expect(เวลาจากป้ายไทย(undefined)).toBeNull();
  });
});

describe("ประกอบเส้นเวลา", () => {
  it("ไม่มีข้อมูล = ไม่มีเหตุการณ์ (ไม่เติมเหตุการณ์ที่ระบบคิดเอง)", () => {
    expect(ประกอบเส้นเวลา(ว่าง)).toEqual([]);
  });

  it("รวมทุกชนิด เรียงใหม่สุดก่อน · ไม่มีวันที่ไม่แสดง · meeting ในไทม์ไลน์ลีดไม่เอา", () => {
    const ผล = ประกอบเส้นเวลา({
      ลูกค้า: { created_at: "2026-11-10T03:00:00Z" },
      ลีด: [{
        num_id: 7, project: "โกดัง A", company: "บริษัท ก (ตัวอย่าง)", created_at: "2026-09-01T02:00:00Z",
        activities: [
          { type: "quote", text: "ส่งใบเสนอราคาให้ลูกค้า", at: "2026-10-05T04:00:00Z" },
          { type: "note", text: "โทรติดตาม", date: "12 ต.ค. 2569 · 10:00" },
          { type: "meeting", text: "นัดหมาย (ซ้ำกับแถวนัด)", at: "2026-10-06T04:00:00Z" },
          { type: "note", text: "ไม่มีวันที่" },
        ],
      }],
      คำขอ: [{ request_no: "RQ-1", lead_num_id: 7, area: 1200, submitted_at: "2026-09-10T02:00:00Z" }],
      นัด: [{ lead_id: 7, date: "2026-10-20", time: "9:30", type: "site_visit", status: "done", note: "" }, { lead_id: 7, date: "", type: "call" }],
      บันทึก: [{ title: "ลูกค้าขอส่วนลด", author: "สมชาย", created_at: "2026-11-12T05:00:00Z" }],
    });
    expect(ผล.map(e => e.ชนิด)).toEqual(["note", "customer", "appointment", "activity", "activity", "request", "lead"]);
    expect(ผล.map(e => e.at)).toEqual([...ผล.map(e => e.at)].sort((a, b) => Date.parse(b) - Date.parse(a)));
    expect(ผล.find(e => e.ชนิด === "request")).toMatchObject({ ข้อความ: "ขอราคาจาก HQ RQ-1 · 1,200 ตร.ม.", งาน: "โกดัง A" });
    expect(ผล.find(e => e.ชนิด === "appointment")).toMatchObject({ at: "2026-10-20T09:30:00+07:00", ข้อความ: "นัดดูหน้างาน · เสร็จแล้ว", งาน: "โกดัง A" });
    expect(ผล.find(e => e.ชนิด === "note")).toMatchObject({ ข้อความ: "บันทึก: ลูกค้าขอส่วนลด (สมชาย)" });
    expect(ผล.some(e => e.ข้อความ.includes("ซ้ำกับแถวนัด"))).toBe(false);
    expect(ผล.some(e => e.ข้อความ === "ไม่มีวันที่")).toBe(false);
  });
});
