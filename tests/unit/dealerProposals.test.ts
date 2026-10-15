import { describe, it, expect } from "vitest";
import {
  เตรียมบันทึกใบ, ตรวจใบเสนอ, สถานะที่เปลี่ยนไปได้, มีใบเสนอที่ส่งแล้ว, หมดอายุแล้ว, มูลค่าอ่านง่าย, ใบล็อกแล้ว,
  ระยะสัญญาอ่านง่าย, ใบหลักสำหรับตั้งดีลเลอร์,
} from "../../packages/shared/lib/dealerProposals";
import { buildDealerProposalHTML } from "../../packages/shared/lib/dealerProposalPrint";
import type { DealerPackageProposal, HQCompany } from "../../packages/shared/lib/data/types";

// ใบค่าแฟรนไชส์ (บอสสั่ง 14 ก.ย. 69: "เหมือนดีลเลอร์ที่ต้องมีใบเสนอราคา แต่อันนี้ของ HQ")
const ใบ = (x: Partial<DealerPackageProposal>): DealerPackageProposal => ({
  id: 1, prospectId: 7, proposalNo: "DP-2026-0001", package: "standard", status: "draft", proposedDate: "2026-09-14", ...x,
});

describe("เตรียมบันทึกใบ / ตรวจใบเสนอ", () => {
  it("มูลค่า: พิมพ์มีลูกน้ำ/฿ ได้ · เว้นว่าง = null (ไม่ใช่ 0) · อ่านไม่ออก = ฟ้อง ไม่กลืนเป็น 0", () => {
    expect(เตรียมบันทึกใบ({ prospectId: 7, package: "standard", proposedDate: "2026-09-14", amount: "฿150,000" as unknown as number }).amount).toBe(150000);
    expect(เตรียมบันทึกใบ({ prospectId: 7, amount: "" as unknown as number }).amount).toBeNull();
    const เพี้ยน = เตรียมบันทึกใบ({ prospectId: 7, package: "standard", proposedDate: "2026-09-14", amount: "ห้าหมื่น" as unknown as number });
    expect(ตรวจใบเสนอ(เพี้ยน)).toMatch(/ค่าแรกเข้า/);
  });

  it("ต้องเลือกแพ็กเกจเอง — ห้ามเลือกให้", () => {
    const r = เตรียมบันทึกใบ({ prospectId: 7, proposedDate: "2026-09-14" });
    expect(ตรวจใบเสนอ(r)).toMatch(/ต้องเลือกแพ็กเกจ/);
  });

  it("ต้องมีวันที่เสนอ · วันมีผลถึงต้องไม่ก่อนวันที่เสนอ · ต้องผูกลูกค้าเป้าหมาย", () => {
    expect(ตรวจใบเสนอ(เตรียมบันทึกใบ({ prospectId: 7, package: "exclusive" }))).toMatch(/วันที่เสนอ/);
    expect(ตรวจใบเสนอ(เตรียมบันทึกใบ({ prospectId: 7, package: "exclusive", proposedDate: "2026-09-14", validUntil: "2026-09-01" }))).toMatch(/ไม่ก่อนวันที่เสนอ/);
    expect(ตรวจใบเสนอ(เตรียมบันทึกใบ({ package: "exclusive", proposedDate: "2026-09-14" }))).toMatch(/ลูกค้าเป้าหมาย/);
  });

  it("พื้นที่: เติมภาคจากจังหวัด · จังหวัดต้องอยู่ในภาค (กติกาเดียวกับลูกค้าเป้าหมาย)", () => {
    expect(เตรียมบันทึกใบ({ prospectId: 7, province: "ชลบุรี" }).region).toBe("ตะวันออก");
    const ผิดภาค = เตรียมบันทึกใบ({ prospectId: 7, package: "standard", proposedDate: "2026-09-14", region: "ใต้", province: "ชลบุรี" });
    expect(ตรวจใบเสนอ(ผิดภาค)).toMatch(/ไม่ได้อยู่ในภาค/);
  });

  it("สถานะแปลก ๆ ที่ยิงเข้ามา → กลับเป็นร่าง", () => {
    expect(เตรียมบันทึกใบ({ prospectId: 7, status: "paid" as DealerPackageProposal["status"] }).status).toBe("draft");
  });
});

describe("สถานะใบ (ตรงกับตัวดักของฐานข้อมูล 0172)", () => {
  it("เดินหน้าทางเดียว — ร่างข้ามไปตอบรับไม่ได้ · ตอบรับ/ปฏิเสธแล้วจบ", () => {
    expect(สถานะที่เปลี่ยนไปได้("draft")).toEqual(["draft", "sent"]);
    expect(สถานะที่เปลี่ยนไปได้("sent")).toEqual(["sent", "accepted", "rejected"]);
    expect(สถานะที่เปลี่ยนไปได้("accepted")).toEqual(["accepted"]);
    expect(สถานะที่เปลี่ยนไปได้("rejected")).toEqual(["rejected"]);
  });
  it("ส่งแล้ว = ล็อกเนื้อหา · ร่างยังแก้ได้", () => {
    expect(ใบล็อกแล้ว("draft")).toBe(false);
    expect(ใบล็อกแล้ว("sent")).toBe(true);
  });
  it("ด่านสร้างดีลเลอร์: นับเฉพาะใบที่ส่งแล้วหรือตอบรับ (ร่าง/ปฏิเสธไม่นับ)", () => {
    expect(มีใบเสนอที่ส่งแล้ว([ใบ({ status: "draft" }), ใบ({ status: "rejected" })])).toBe(false);
    expect(มีใบเสนอที่ส่งแล้ว([ใบ({ status: "sent" })])).toBe(true);
    expect(มีใบเสนอที่ส่งแล้ว([ใบ({ status: "accepted" })])).toBe(true);
    expect(มีใบเสนอที่ส่งแล้ว([])).toBe(false);
  });
  it("เลยกำหนด = ส่งแล้วแต่เลยวันมีผล (ใบที่ตอบแล้วไม่นับ)", () => {
    expect(หมดอายุแล้ว(ใบ({ status: "sent", validUntil: "2026-09-01" }), "2026-09-14")).toBe(true);
    expect(หมดอายุแล้ว(ใบ({ status: "accepted", validUntil: "2026-09-01" }), "2026-09-14")).toBe(false);
    expect(หมดอายุแล้ว(ใบ({ status: "sent", validUntil: null }), "2026-09-14")).toBe(false);
  });
  it("มูลค่าไม่ได้กรอก = “—” ไม่ใช่ ฿0", () => {
    expect(มูลค่าอ่านง่าย(null)).toBe("—");
    expect(มูลค่าอ่านง่าย(150000)).toBe("฿150,000");
    expect(มูลค่าอ่านง่าย(0)).toBe("฿0");
  });
});

describe("พิมพ์ใบค่าแฟรนไชส์", () => {
  const hq: HQCompany = { name: "บริษัท ทดสอบสำนักงานใหญ่ จำกัด", address: "กรุงเทพฯ", taxId: "", phone: "02-000-0000", email: "", website: "" };

  it("หัวกระดาษเป็นของสำนักงานใหญ่ · มีเลขที่ แพ็กเกจ พื้นที่ มูลค่า", () => {
    const html = buildDealerProposalHTML(ใบ({ package: "exclusive", region: "ตะวันออก", province: "ชลบุรี", amount: 150000, status: "sent" }),
      { name: "คุณสมชาย" }, hq);
    expect(html).toContain("ใบค่าแฟรนไชส์");
    expect(html).toContain("บริษัท ทดสอบสำนักงานใหญ่ จำกัด");
    expect(html).toContain("DP-2026-0001");
    expect(html).toContain("Exclusive");
    expect(html).toContain("ชลบุรี · ภาคตะวันออก");
    expect(html).toContain("฿150,000");
    expect(html).not.toContain("ยังไม่ใช่ข้อเสนอที่ส่งจริง");   // ส่งแล้ว = ไม่มีป้ายร่าง
  });

  it("ใบร่างต้องมีป้ายบอกชัด · มูลค่าไม่ได้กรอกขึ้น “—”", () => {
    const html = buildDealerProposalHTML(ใบ({ amount: null }), { name: "คุณสมชาย" }, hq);
    expect(html).toContain("ยังไม่ใช่ข้อเสนอที่ส่งจริง");
    expect(html).toMatch(/<td class="r">—<\/td>/);
  });

  it("ค่าที่ผู้ใช้กรอกต้องไม่รันเป็นโค้ด (ชื่อ/เงื่อนไขที่มีแท็ก)", () => {
    const html = buildDealerProposalHTML(ใบ({ terms: "<script>alert(1)</script>\nข้อสอง" }), { name: "<img src=x onerror=alert(1)>" }, hq);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("• ข้อสอง");
  });

  it("ทุกภาค = ทั่วประเทศ", () => {
    expect(buildDealerProposalHTML(ใบ({ region: "ทุกภาค", province: "ทุกจังหวัด" }), { name: "ก" }, hq)).toContain("ทั่วประเทศ (ทุกภาค)");
  });

  it("หัวกระดาษยึดข้อมูลบริษัททุกช่อง · ช่องที่ไม่กรอกไม่ขึ้น (บอสสั่ง 14 ก.ย. 69)", () => {
    const ครบ: HQCompany = {
      name: "เบญจมินทร์ ( BENJAMIN )", address: "91/9 ต.อ้อมเกร็ด อ.ปากเกร็ด จ.นนทบุรี 11120",
      taxId: "0105500000000", phone: "080-495-2929", email: "info@example.com", website: "example.com",
    };
    const html = buildDealerProposalHTML(ใบ({}), { name: "ก" }, ครบ);
    for (const ค่า of [ครบ.name, ครบ.address, "โทร. 080-495-2929", "อีเมล info@example.com", "example.com", "เลขประจำตัวผู้เสียภาษี 0105500000000"]) {
      expect(html).toContain(ค่า);
    }
    const บางช่อง = buildDealerProposalHTML(ใบ({}), { name: "ก" }, { ...ครบ, taxId: "", email: "", website: "" });
    expect(บางช่อง).not.toContain("เลขประจำตัวผู้เสียภาษี");
    expect(บางช่อง).not.toContain("อีเมล ");
    expect(บางช่อง).toContain("โทร. 080-495-2929");
  });
});

describe("ช่องตัวเลข 3 ช่อง (บอสสั่ง “เอา 3 ช่อง”)", () => {
  const ฐาน = { prospectId: 7, package: "standard" as const, proposedDate: "2026-09-14" };

  it("ระยะสัญญา: จำนวนเต็ม 1–120 เดือน · ว่าง = null · อ่านไม่ออก/ทศนิยม/เกินช่วง = ฟ้อง", () => {
    expect(เตรียมบันทึกใบ({ ...ฐาน, contractMonths: "12" as unknown as number }).contractMonths).toBe(12);
    expect(เตรียมบันทึกใบ({ ...ฐาน, contractMonths: "" as unknown as number }).contractMonths).toBeNull();
    for (const ผิด of ["หนึ่งปี", 1.5, 0, 121]) {
      expect(ตรวจใบเสนอ(เตรียมบันทึกใบ({ ...ฐาน, contractMonths: ผิด as unknown as number }))).toMatch(/ระยะสัญญา/);
    }
    expect(ตรวจใบเสนอ(เตรียมบันทึกใบ({ ...ฐาน, contractMonths: 120 }))).toBeNull();
  });

  it("เป้ายอดซื้อต่อปี: มีลูกน้ำได้ · ติดลบ/อ่านไม่ออก = ฟ้อง", () => {
    expect(เตรียมบันทึกใบ({ ...ฐาน, annualTarget: "12,000,000" as unknown as number }).annualTarget).toBe(12_000_000);
    expect(ตรวจใบเสนอ(เตรียมบันทึกใบ({ ...ฐาน, annualTarget: -1 }))).toMatch(/เป้ายอดซื้อต่อปี/);
    expect(ตรวจใบเสนอ(เตรียมบันทึกใบ({ ...ฐาน, annualTarget: "สิบล้าน" as unknown as number }))).toMatch(/เป้ายอดซื้อต่อปี/);
  });

  it("ระยะสัญญาอ่านง่าย: ครบปีบอกเป็นปีด้วย · ว่าง = —", () => {
    expect(ระยะสัญญาอ่านง่าย(12)).toBe("12 เดือน (1 ปี)");
    expect(ระยะสัญญาอ่านง่าย(18)).toBe("18 เดือน");
    expect(ระยะสัญญาอ่านง่าย(null)).toBe("—");
  });

  // ตกลง + ชำระ (ด่าน 4 · 0208): แปลงจากใบที่ตอบรับเท่านั้น — ส่งแล้วยังไม่นับ (เดิม: ไม่มีตอบรับใช้ส่งแล้วล่าสุด)
  it("ใบหลักที่ใช้ตั้งดีลเลอร์: ตอบรับล่าสุดเท่านั้น · ส่งแล้ว/ร่าง/ปฏิเสธไม่นับ", () => {
    expect(ใบหลักสำหรับตั้งดีลเลอร์([ใบ({ id: 1, status: "sent" }), ใบ({ id: 3, status: "sent" }), ใบ({ id: 2, status: "accepted" })])?.id).toBe(2);
    expect(ใบหลักสำหรับตั้งดีลเลอร์([ใบ({ id: 1, status: "accepted" }), ใบ({ id: 5, status: "accepted" })])?.id).toBe(5);
    expect(ใบหลักสำหรับตั้งดีลเลอร์([ใบ({ id: 1, status: "sent" }), ใบ({ id: 3, status: "sent" }), ใบ({ id: 4, status: "draft" })])).toBeNull();
    expect(ใบหลักสำหรับตั้งดีลเลอร์([ใบ({ id: 1, status: "draft" }), ใบ({ id: 2, status: "rejected" })])).toBeNull();
  });

  it("เอกสารพิมพ์มีครบสามบรรทัด · ไม่ได้กรอกขึ้น —", () => {
    const hq = { name: "HQ", address: "", taxId: "", phone: "", email: "", website: "" };
    const ครบ = buildDealerProposalHTML(ใบ({ amount: 150000, contractMonths: 12, annualTarget: 12_000_000, status: "sent" }), { name: "ก" }, hq);
    expect(ครบ).toContain("ค่าแรกเข้า (จ่ายครั้งเดียว)");
    expect(ครบ).toContain("12 เดือน (1 ปี)");
    expect(ครบ).toContain("฿12,000,000");
    const ว่าง = buildDealerProposalHTML(ใบ({}), { name: "ก" }, hq);
    expect((ว่าง.match(/<td class="r">—<\/td>/g) ?? []).length, "ค่าแรกเข้า · ระยะสัญญา · เป้า ขึ้น — ทั้งสาม").toBe(3);
  });
});

