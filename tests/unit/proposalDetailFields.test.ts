import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ช่องใบค่าแฟรนไชส์, ค่าช่องใบ } from "../../packages/shared/lib/dealerProposals";

// แผงรายละเอียดใบค่าแฟรนไชส์ = ชื่อ/ลำดับเดียวกับฟอร์มออกใบ (บอสสั่ง 5 พ.ย. 69) · ว่าง/"-"/ฐานไม่ได้เก็บ = "-" (ไม่เดา)
const วันไทย = (iso: string) => `ไทย(${iso})`;
describe("ช่องของใบค่าแฟรนไชส์", () => {
  it("ลำดับชื่อช่องในฟอร์มออกใบ (ProposalFormModal) ตรงกับรายการกลาง", () => {
    const ฟอร์ม = readFileSync("packages/shared/components/hq/ProposalFormModal.tsx", "utf8");
    const ป้าย = [...ฟอร์ม.matchAll(/htmlFor="pp-(amount|months|target|region|province|date|valid|terms|note)"[^>]*>([^<{]+)/g)].map(m => m[2].trim());
    expect(ป้าย.length).toBe(9);
    ป้าย.forEach((t, i) => expect(t.startsWith(ช่องใบค่าแฟรนไชส์[i]), `ช่องที่ ${i + 1} ของฟอร์ม "${t}" ต้องขึ้นต้น "${ช่องใบค่าแฟรนไชส์[i]}"`).toBe(true));
  });
  it("ค่าครบ = แสดงตามที่กรอก · วันที่ผ่านตัวจัดรูป", () => {
    expect(ค่าช่องใบ({ amount: 50000, contractMonths: 12, annualTarget: 1_000_000, region: "อีสาน", province: "ขอนแก่น", proposedDate: "2026-11-01",
      validUntil: "2026-12-01", terms: "ก\nข", note: "ลับ", status: "draft" }, { วันไทย })).toEqual({
      "ค่าแรกเข้า": "฿50,000", "ระยะสัญญา": "12 เดือน (1 ปี)", "เป้ายอดซื้อต่อปี": "฿1,000,000", "ภาค": "อีสาน", "จังหวัด": "ขอนแก่น",
      "วันที่เสนอ": "ไทย(2026-11-01)", "ข้อเสนอมีผลถึง": "ไทย(2026-12-01)", "เงื่อนไข": "ก\nข", "หมายเหตุภายใน": "ลับ" });
  });
  it("ใบเก่าที่ฐานไม่ได้เก็บ / ว่าง / \"-\" = \"-\" ทุกช่อง · ค่าแรกเข้า 0 = กรอกแล้ว", () => {
    const ว่าง = ค่าช่องใบ({ terms: "-", note: "  " }, { วันไทย });
    expect(Object.values(ว่าง)).toEqual(Array(9).fill("-"));
    expect(ค่าช่องใบ({ amount: 0 }, { วันไทย })["ค่าแรกเข้า"]).toBe("฿0");
  });
  it("ใบส่งแล้วเลยวันมีผล = บอก (เลยกำหนด)", () => {
    expect(ค่าช่องใบ({ status: "sent", validUntil: "2026-10-01" }, { วันไทย, วันนี้: "2026-11-05" })["ข้อเสนอมีผลถึง"]).toBe("ไทย(2026-10-01) (เลยกำหนด)");
    expect(ค่าช่องใบ({ status: "accepted", validUntil: "2026-10-01" }, { วันไทย, วันนี้: "2026-11-05" })["ข้อเสนอมีผลถึง"]).toBe("ไทย(2026-10-01)");
  });
});
