// การแจ้งเตือนของสำนักงานใหญ่ = งานของ HQ เองเท่านั้น (บอสสั่ง 14 ก.ย. 69)
// "การแจ้งเตือนของ hq แสดงแค่ในขอบเขตของ HQ อย่างเดียว" → เลือก "งานของสำนักงานใหญ่เอง"
import { describe, it, expect } from "vitest";
import { buildHQAlerts, ใบรอคำตอบมากี่วัน } from "@pms/shared/lib/hqAlerts";
import { DEFAULT_HQ_NOTIF_RULES, HQ_ALERT_META, รวมกฎแจ้งเตือน, เกณฑ์วันแจ้งเตือน, type HQNotifRules } from "@pms/shared/lib/mock";
import type { DealerProspect, DealerPackageProposal } from "@pms/shared/lib/data/types";

const วันนี้ = "2026-09-14";
const ราย = (x: Partial<DealerProspect> & { id: number }): DealerProspect =>
  ({ name: `ราย ${x.id}`, status: "contacted", createdAt: "2026-09-10T03:00:00Z", lastContactAt: "2026-09-13T03:00:00Z", ...x });
const ใบ = (x: Partial<DealerPackageProposal> & { id: number; prospectId: number }): DealerPackageProposal =>
  ({ package: "standard", status: "sent", proposalNo: `DP-2026-000${x.id}`, proposedDate: "2026-09-12", ...x });
const สร้าง = (o: { prospects?: DealerProspect[]; proposals?: DealerPackageProposal[]; rules?: HQNotifRules }) =>
  buildHQAlerts({ rules: o.rules ?? DEFAULT_HQ_NOTIF_RULES, prospects: o.prospects, proposals: o.proposals, วันนี้ISO: วันนี้ });

describe("ขอบเขตการแจ้งเตือน HQ", () => {
  it("มีแต่เรื่องงานของสำนักงานใหญ่ ไม่มีเรื่องงานขายของดีลเลอร์", () => {
    expect(HQ_ALERT_META.map(m => m.key)).toEqual(["prospectFollowUpDue", "prospectIdle", "proposalAwaiting", "proposalExpired"]);
  });

  it("กฎที่บันทึกไว้ชุดเก่า: คีย์งานขายดีลเลอร์และคีย์แม่แบบ (ลบแล้ว 16 ต.ค. 69) ถูกทิ้ง · เรื่องใหม่ได้ค่าเริ่มต้น", () => {
    const r = รวมกฎแจ้งเตือน({ alerts: { unassignedLead: { on: true, email: true, inapp: true }, catalogNoPrice: { on: false, email: false, inapp: false } } } as never);
    expect(Object.keys(r.alerts).sort()).toEqual(HQ_ALERT_META.map(m => m.key).sort());
    expect(Object.keys(r.alerts)).not.toContain("catalogNoPrice");
    expect(r.alerts.prospectIdle).toMatchObject({ on: true, inapp: true, days: 14 });
  });

  it("เกณฑ์วันที่ตั้งเป็น 0/ไม่ได้ตั้ง → ใช้ค่าเริ่มต้น", () => {
    expect(เกณฑ์วันแจ้งเตือน({ alerts: { ...DEFAULT_HQ_NOTIF_RULES.alerts, proposalAwaiting: { on: true, email: false, inapp: true, days: 0 } } }, "proposalAwaiting")).toBe(7);
  });
});

describe("ลูกค้าเป้าหมาย (HQ)", () => {
  it("ถึงกำหนดติดตาม: วันนัด ≤ วันนี้ และยังติดตามอยู่เท่านั้น", () => {
    const ผล = สร้าง({ prospects: [
      ราย({ id: 1, followUp: "2026-09-10" }),
      ราย({ id: 2, followUp: "2026-09-14" }),
      ราย({ id: 3, followUp: "2026-09-20" }),                   // ยังไม่ถึง
      ราย({ id: 4, followUp: "2026-09-01", status: "won" }),    // จบแล้ว
    ] }).filter(a => a.key === "prospectFollowUpDue");
    expect(ผล.map(a => a.href)).toEqual(["/hq/prospects?open=1", "/hq/prospects?open=2"]);
    expect(ผล[0].body).toContain("เลยมา 4 วัน");
    expect(ผล[1].body).toContain("(วันนี้)");
  });

  it("ไม่ได้ติดต่อตั้งแต่เกณฑ์ขึ้นไป (ค่าเริ่มต้น 14 วัน) · ยังไม่เคยติดต่อนับจากวันที่เพิ่ม", () => {
    const ผล = สร้าง({ prospects: [
      ราย({ id: 1, lastContactAt: "2026-08-31T03:00:00Z" }),              // 14 วัน
      ราย({ id: 2, lastContactAt: "2026-09-01T03:00:00Z" }),              // 13 วัน
      ราย({ id: 3, lastContactAt: null, createdAt: "2026-08-01T03:00:00Z" }),
      ราย({ id: 4, lastContactAt: "2026-07-01T03:00:00Z", status: "lost" }),
    ] }).filter(a => a.key === "prospectIdle");
    expect(ผล.map(a => a.href)).toEqual(["/hq/prospects?open=3", "/hq/prospects?open=1"]);
    expect(ผล[0].body).toContain("ยังไม่เคยบันทึกการติดต่อ");
  });

  it("ปิดกฎแล้วไม่ขึ้น", () => {
    const rules = รวมกฎแจ้งเตือน({ alerts: { prospectFollowUpDue: { on: false, email: false, inapp: false } } } as never);
    expect(สร้าง({ rules, prospects: [ราย({ id: 1, followUp: "2026-09-01" })] }).filter(a => a.key === "prospectFollowUpDue")).toEqual([]);
  });
});

describe("ใบค่าแฟรนไชส์", () => {
  it("รอคำตอบนับจากวันที่เสนอ · ไม่มีวันที่เสนอใช้แก้ล่าสุด · ไม่ใช่ใบส่งแล้ว = null", () => {
    expect(ใบรอคำตอบมากี่วัน(ใบ({ id: 1, prospectId: 1, proposedDate: "2026-09-04" }), วันนี้)).toBe(10);
    expect(ใบรอคำตอบมากี่วัน(ใบ({ id: 1, prospectId: 1, proposedDate: null, updatedAt: "2026-09-06T20:00:00Z" }), วันนี้)).toBe(7);
    expect(ใบรอคำตอบมากี่วัน(ใบ({ id: 1, prospectId: 1, status: "accepted" }), วันนี้)).toBeNull();
  });

  it("เลยวันมีผลอยู่กลุ่มของตัวเอง ไม่นับซ้ำในรอคำตอบ · ลูกค้าเป้าหมายที่จบแล้วไม่ตาม", () => {
    const ผล = สร้าง({
      prospects: [ราย({ id: 1 }), ราย({ id: 2, status: "won", dealerCode: "RYG" })],
      proposals: [
        ใบ({ id: 1, prospectId: 1, proposedDate: "2026-08-01", validUntil: "2026-09-01" }),  // เลยวันมีผล
        ใบ({ id: 2, prospectId: 1, proposedDate: "2026-09-01", validUntil: "2026-10-01" }),  // รอ 13 วัน
        ใบ({ id: 3, prospectId: 1, proposedDate: "2026-09-10" }),                            // รอ 4 วัน (ยังไม่ถึง 7)
        ใบ({ id: 4, prospectId: 1, proposedDate: "2026-08-01", status: "draft" }),
        ใบ({ id: 5, prospectId: 2, proposedDate: "2026-08-01" }),                            // ลูกค้าเป้าหมายจบแล้ว
      ],
    });
    expect(ผล.filter(a => a.key === "proposalExpired").map(a => a.body.split(" · ")[0])).toEqual(["DP-2026-0001"]);
    expect(ผล.filter(a => a.key === "proposalAwaiting").map(a => a.body.split(" · ")[0])).toEqual(["DP-2026-0002"]);
    expect(ผล.every(a => a.href === "/hq/prospects?open=1")).toBe(true);
  });

  it("ข้อมูลยังโหลดไม่เสร็จ = ยังไม่เตือนเรื่องนั้น", () => {
    expect(สร้าง({})).toEqual([]);
  });
});
