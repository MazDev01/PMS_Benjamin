import { describe, it, expect } from "vitest";
import { ไม่ใช่แถวHQ, นับเป็นดีลเลอร์, HQ_DIRECT_CODE } from "@pms/shared/lib/hqDealerRow";

// ── HQD "สำนักงานใหญ่ (ขายตรง)" ไม่นับเป็นดีลเลอร์ (บอสสั่ง 18 พ.ย. 69 · ใบ 0287) ──
//   ทะเบียน/จำนวนดีลเลอร์/ตั้งเป้า/ผูกผู้สนใจ ใช้ นับเป็นดีลเลอร์ · ตัวกรอง/ค้นหายังใช้ ไม่ใช่แถวHQ (เลือก HQD ดูยอดขายตรงได้)
//   ตกบนโค้ดเดิม: ไม่มี นับเป็นดีลเลอร์ / HQ_DIRECT_CODE
describe("นับเป็นดีลเลอร์", () => {
  const แถว = ["HQ", "HQD", "RYG", "CNX"].map(code => ({ code }));
  it("จำนวนดีลเลอร์ไม่รวม HQ และ HQD", () => {
    expect(HQ_DIRECT_CODE).toBe("HQD");
    expect(แถว.filter(นับเป็นดีลเลอร์).map(d => d.code)).toEqual(["RYG", "CNX"]);
  });
  it("ตัวกรอง/ค้นหายังเห็น HQD (ไม่ใช่แถวHQ ตัด HQ อย่างเดียว)", () => {
    expect(แถว.filter(ไม่ใช่แถวHQ).map(d => d.code)).toEqual(["HQD", "RYG", "CNX"]);
  });
  it("รหัสว่าง/ไม่มีรหัส นับเป็นดีลเลอร์ตามเดิม", () => {
    expect(นับเป็นดีลเลอร์({ code: null })).toBe(true);
    expect(นับเป็นดีลเลอร์({})).toBe(true);
  });
});
