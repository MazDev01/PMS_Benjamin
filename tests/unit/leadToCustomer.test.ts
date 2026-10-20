import { describe, it, expect } from "vitest";
import { customerPayloadFromLead } from "../../packages/shared/lib/leadToCustomer";
import type { LeadRow } from "../../packages/shared/lib/mock";

// ── ปิดการขายสำเร็จ → ข้อมูลที่กรอกไว้ตอนเป็นลูกค้าเป้าหมายต้องไหลไปเป็นลูกค้าให้ครบ ──
// บอสแจ้ง (19 ส.ค. 69): "ตอนเพิ่มลูกค้าเป้าหมายไม่มีที่อยู่ แต่พอเป็นลูกค้าแล้วมี
//   ตอนกลายเป็นลูกค้าต้องดึงข้อมูลมาจากลูกค้าเป้าหมาย"
// เดิมตัวสร้างข้อมูลลูกค้าฝังอยู่ใน SalesContext ทดสอบไม่ได้ ช่องที่ลืมส่งต่อจึงหายเงียบ ๆ

const lead: LeadRow = {
  id: "#L-1", numId: 1, name: "บจ. ทดสอบ", company: "บจ. ทดสอบ", contact: "คุณสมชาย",
  phone: "081-234-5678", email: "somchai@test.co.th",
  province: "เชียงใหม่", address: "99/1 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง เชียงใหม่ 50200",
  product: "โกดังสำเร็จรูป", category: "โกดังสำเร็จรูป",
  // value = ช่องประเมินราคาเดิม (เลิกใช้ · ข้อ 5) ตั้งให้ต่างจากยอดใบ เพื่อพิสูจน์ว่าไม่ถูกหยิบไปใช้
  status: "PAID", value: "฿9.9M", quoteValue: 2_500_000, assigned: "วิภา รัตนกุล", dealerCode: "CNX", logo: "data:image/png;base64,zz",
};
const opts = { joinDate: "2026-08-19", defaultDealerCode: "CNX" };

describe("ลูกค้าเป้าหมาย → ลูกค้า", () => {
  it("ยอดสะสมตั้งต้น = ยอดใบเสนอราคาล่าสุด · ไม่มีใบ = 0 (ไม่ถอยไปใช้ประเมินราคา) — บอสตัดสิน 20 ต.ค. 69 ข้อ 5", () => {
    expect(customerPayloadFromLead({ ...lead, quoteValue: null }, opts).totalValue).toBe(0);
  });

  it("ที่อยู่ต้องตามไปด้วย (ช่องที่เคยหาย)", () => {
    expect(customerPayloadFromLead(lead, opts).address).toBe(lead.address);
  });

  it("ทุกช่องที่เซลส์กรอกไว้ต้องไหลไปครบ ไม่ต้องกรอกซ้ำ", () => {
    const c = customerPayloadFromLead(lead, opts);
    expect(c.company).toBe("บจ. ทดสอบ");
    expect(c.name).toBe("คุณสมชาย");        // ชื่อผู้ติดต่อ ไม่ใช่ชื่อบริษัท
    expect(c.phone).toBe(lead.phone);
    expect(c.email).toBe(lead.email);
    expect(c.province).toBe("เชียงใหม่");
    // ไม่สืบแม่แบบของลูกค้าเป้าหมายมาเป็นหมวดลูกค้า (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
    expect(c.category).toBe("");
    expect(c.owner).toBe("วิภา รัตนกุล");   // ผู้รับผิดชอบเดิมดูแลต่อ
    expect(c.logo).toBe(lead.logo);
    expect(c.dealerCode).toBe("CNX");        // ลูกค้าเป็นของสาขาเดียวกับลูกค้าเป้าหมาย
    expect(c.totalValue).toBe(2_500_000);   // ยอดใบเสนอราคาล่าสุด (ใบ 0223) ไม่ใช่ประเมินราคา 9.9M
    expect(c.joinDate).toBe("2026-08-19");
    expect(c.status).toBe("active");
  });

  it("ช่องที่ยังไม่ได้กรอกต้องไม่กลายเป็นค่าหลอก", () => {
    const เปล่า: LeadRow = { ...lead, address: undefined, phone: undefined, email: undefined, logo: undefined };
    const c = customerPayloadFromLead(เปล่า, opts);
    expect(c.address, "ไม่มีที่อยู่ต้องเป็น undefined (หน้าจอขึ้น '—') ไม่ใช่สตริงว่าง").toBeUndefined();
    expect(c.phone).toBe("");   // โทรศัพท์/อีเมลเป็น string เสมอตามชนิดข้อมูลของลูกค้า
    expect(c.email).toBe("");
    expect(c.logo).toBeUndefined();
  });

  it("ไม่มีผู้ติดต่อ → ใช้ชื่อบริษัทแทน (ห้ามได้ลูกค้าไม่มีชื่อ)", () => {
    expect(customerPayloadFromLead({ ...lead, contact: "" }, opts).name).toBe("บจ. ทดสอบ");
  });

  it("ลูกค้าเป้าหมายไม่ระบุสาขา → ใช้สาขาตั้งต้น ไม่ปล่อยว่าง", () => {
    expect(customerPayloadFromLead({ ...lead, dealerCode: undefined }, opts).dealerCode).toBe("CNX");
  });
});
