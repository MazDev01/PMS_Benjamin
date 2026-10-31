// ค่าตั้ง "หาดีลเลอร์" ของสำนักงานใหญ่ (บอสสั่ง 14 ก.ย. 69)
import { describe, it, expect } from "vitest";
import {
  รวมค่าตั้งหาดีลเลอร์, DEFAULT_RECRUIT_SETTINGS, ช่องทางที่เข้ามาเริ่มต้น, ช่องทางติดต่อเริ่มต้น,
  จัดรายการ, ชื่องานที่ใช้, บวกวัน, ตัวเลือกพร้อมค่าเดิม, จำนวนรายการสูงสุด,
} from "../../packages/shared/lib/recruitSettings";
import { buildDealerProposalHTML } from "../../packages/shared/lib/dealerProposalPrint";
import type { DealerPackageProposal, HQCompany } from "../../packages/shared/lib/data/types";

// "เป้ายอดขายตามแพ็กเกจ (0178–0180)" เอาออก — แพ็กเกจเอาออกถาวร (บอสสั่ง 30 ต.ค. 69 · ช่องในฐานลบแล้ว ใบ 0269)
//   เป้าเป็นของดีลเลอร์รายนั้นเสมอ (ใบ 0206) · ข้อทดสอบที่ฐาน: supabase/tests/franchise_target.sql · package_dropped.sql
describe("รวมค่าตั้งหาดีลเลอร์", () => {
  it("ยังไม่เคยตั้ง = ค่าเริ่มต้น · ช่องทางคงรายการเดิม · ประเภทธุรกิจ/เหตุผลว่าง (ไม่กุรายการให้)", () => {
    const s = รวมค่าตั้งหาดีลเลอร์(null);
    expect(s).toEqual(DEFAULT_RECRUIT_SETTINGS);
    expect(s.channels).toEqual(ช่องทางที่เข้ามาเริ่มต้น);
    expect(s.contactChannels).toEqual(ช่องทางติดต่อเริ่มต้น);
    expect(s.businessTypes).toEqual([]);
    expect(s.lostReasons).toEqual([]);
    expect(s.proposal.packages.standard).toEqual({ amount: null, contractMonths: null, annualTarget: null, targetsByRegion: {} });
  });

  it("รายการ: ตัดช่องว่าง · ทิ้งค่าว่าง/ซ้ำ/ไม่ใช่ข้อความ · จำกัดจำนวน", () => {
    expect(จัดรายการ([" TikTok ", "", "TikTok", 5, null, "LINE"])).toEqual(["TikTok", "LINE"]);
    expect(จัดรายการ(Array.from({ length: 40 }, (_, i) => `ช่อง ${i}`))).toHaveLength(จำนวนรายการสูงสุด);
    expect(จัดรายการ("ไม่ใช่รายการ")).toEqual([]);
  });

  it("ช่องทางว่างทั้งหมด = ใช้รายการเริ่มต้น (บันทึกการติดต่อต้องมีตัวเลือกเสมอ) · ประเภทธุรกิจว่างยังว่าง", () => {
    const s = รวมค่าตั้งหาดีลเลอร์({ channels: [], contactChannels: [" "], businessTypes: [] });
    expect(s.channels).toEqual(ช่องทางที่เข้ามาเริ่มต้น);
    expect(s.contactChannels).toEqual(ช่องทางติดต่อเริ่มต้น);
    expect(s.businessTypes).toEqual([]);
  });

  it("ตัวเลขใบเสนอ: เพี้ยน/ติดลบ/เกินช่วง = ว่าง ไม่ใช่ 0", () => {
    const s = รวมค่าตั้งหาดีลเลอร์({ proposal: {
      validityDays: 400, terms: "  ข้อหนึ่ง  ",
      packages: { standard: { amount: "150,000", contractMonths: 12, annualTarget: -1 }, exclusive: { amount: "abc", contractMonths: 121 } },
    } });
    expect(s.proposal.validityDays).toBeNull();
    expect(s.proposal.terms).toBe("ข้อหนึ่ง");
    expect(s.proposal.packages.standard).toEqual({ amount: 150000, contractMonths: 12, annualTarget: null, targetsByRegion: {} });
    expect(s.proposal.packages.exclusive).toEqual({ amount: null, contractMonths: null, annualTarget: null, targetsByRegion: {} });
    expect(รวมค่าตั้งหาดีลเลอร์({ proposal: { validityDays: 30 } }).proposal.validityDays).toBe(30);
    expect(รวมค่าตั้งหาดีลเลอร์({ proposal: { validityDays: 0 } }).proposal.validityDays).toBeNull();
  });

  it("ชื่องาน: ตั้งเองใช้ชื่อนั้น · ว่าง/ไม่รู้จักคีย์ = ชื่อเดิม", () => {
    const s = รวมค่าตั้งหาดีลเลอร์({ taskLabels: { contact: " โทรหาครั้งแรก ", profile: "   ", ไม่รู้จัก: "x" } });
    expect(s.taskLabels).toEqual({ contact: "โทรหาครั้งแรก" });
    expect(ชื่องานที่ใช้(s, "contact", "ติดต่อครั้งแรก")).toBe("โทรหาครั้งแรก");
    expect(ชื่องานที่ใช้(s, "profile", "ส่งข้อมูลบริษัท")).toBe("ส่งข้อมูลบริษัท");
  });
});

describe("ตัวช่วยของฟอร์ม", () => {
  it("ค่าที่บันทึกไว้เดิมแต่ไม่อยู่ในรายการแล้ว ต้องยังเห็น", () => {
    expect(ตัวเลือกพร้อมค่าเดิม(["ผู้รับเหมา"], "ขายเหล็ก").ค่านอกรายการ).toBe("ขายเหล็ก");
    expect(ตัวเลือกพร้อมค่าเดิม(["ผู้รับเหมา"], "ผู้รับเหมา").ค่านอกรายการ).toBeNull();
    expect(ตัวเลือกพร้อมค่าเดิม(["ผู้รับเหมา"], null).ค่านอกรายการ).toBeNull();
  });

  it("บวกวัน ข้ามเดือน/ปีได้ · วันที่ผิดรูปแบบ = null", () => {
    expect(บวกวัน("2026-09-14", 30)).toBe("2026-10-14");
    expect(บวกวัน("2026-12-20", 15)).toBe("2027-01-04");
    expect(บวกวัน("14/09/2026", 30)).toBeNull();
  });
});

describe("ผู้ลงนามในเอกสารใบค่าแฟรนไชส์", () => {
  const hq: HQCompany = { name: "บริษัท ทดสอบ จำกัด", address: "", taxId: "", phone: "", email: "", website: "" };
  const ใบ = { id: 1, prospectId: 1, status: "sent", proposalNo: "DP-2026-0001", proposedDate: "2026-09-14" } as DealerPackageProposal;

  it("ตั้งผู้ลงนามแล้ว = ชื่อ + ตำแหน่ง + บริษัท", () => {
    const html = buildDealerProposalHTML(ใบ, { name: "คุณสมชาย" }, hq, { name: "คุณวิชัย", title: "ผู้จัดการฝ่ายขยายดีลเลอร์" });
    expect(html).toContain("( คุณวิชัย )");
    expect(html).toContain("ผู้จัดการฝ่ายขยายดีลเลอร์");
    expect(html).toContain("บริษัท ทดสอบ จำกัด");
  });

  it("ไม่ได้ตั้ง = ใช้ชื่อบริษัทเหมือนเดิม · ค่าที่พิมพ์ต้องไม่รันเป็นโค้ด", () => {
    expect(buildDealerProposalHTML(ใบ, { name: "ก" }, hq)).toContain(`( ${hq.name} )`);
    expect(buildDealerProposalHTML(ใบ, { name: "ก" }, hq, { name: "", title: "x" })).toContain(`( ${hq.name} )`);
    expect(buildDealerProposalHTML(ใบ, { name: "ก" }, hq, { name: "<script>x</script>" })).not.toContain("<script>x</script>");
  });
});
