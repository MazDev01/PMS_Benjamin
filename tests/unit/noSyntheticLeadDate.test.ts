// ไม่สังเคราะห์วันของลูกค้าเป้าหมายจาก numId (13 พ.ย. 69 · กฎ "ไม่มีข้อมูล = —")
// ⚠️ เดิม leadCreatedDate() คืนวัน "วันนี้ − (numId × 17 % 150) วัน" เมื่อไม่มีวันเข้าจริง → ตัวกรอง "ยังไม่มีผู้รับผิดชอบนานเกินเกณฑ์" ของ /hq/leads
//    นับลูกค้าเป้าหมายที่ไม่รู้อายุว่าเกินเกณฑ์ · กราฟหน้าหลัก/หน้าลีดดีลเลอร์ลงเดือนที่ไม่จริง
//    ตกบนโค้ดเดิม: ลูกค้าเป้าหมายไม่มีวันเข้า numId 7 → อายุสังเคราะห์ 119 วัน → ติดตัวกรองเกินเกณฑ์ 24 ชั่วโมง
import { describe, it, expect } from "vitest";
import * as ตัวชี้วัด from "../../packages/shared/lib/leadMetrics";
import { unassignedLeads } from "../../packages/shared/lib/hqAlerts";
import type { LeadRow, LeadRules } from "../../packages/shared/lib/mock";

const lead = (createdAt: string, numId = 7) =>
  ({ numId, createdAt, status: "WAITING", assigned: "", dealerCode: "RYG" } as unknown as LeadRow);
const เกณฑ์ = () => ({ unassignedAlertHours: 24 } as unknown as LeadRules);

describe("ไม่มีวันเข้าจริง = ไม่สังเคราะห์วัน", () => {
  it("ไม่มีตัวสังเคราะห์วันจาก numId ให้เรียกใช้แล้ว", () => {
    expect("leadCreatedDate" in ตัวชี้วัด, "leadCreatedDate ถูกเอาออก").toBe(false);
  });

  it("ยังไม่มีผู้รับผิดชอบ: ไม่มีวันเข้า = ไม่รู้อายุ ไม่นับว่าเกินเกณฑ์", () => {
    expect(unassignedLeads([lead("")], เกณฑ์)).toEqual([]);
  });

  it("ยังไม่มีผู้รับผิดชอบ: มีวันเข้าจริงเก่ากว่าเกณฑ์ = นับ", () => {
    expect(unassignedLeads([lead("1 ม.ค. 2568")], เกณฑ์).map(l => l.numId)).toEqual([7]);
  });
});
