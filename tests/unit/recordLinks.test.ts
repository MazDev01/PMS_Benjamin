import { describe, it, expect } from "vitest";
import { ที่อยู่เรื่อง, เป้าลูกค้าของใบ } from "../../packages/shared/lib/recordLinks";

// ลิงก์กลางไปข้อมูลอื่น (บอสสั่ง 11 พ.ย. 69) — ปลายทางของแต่ละชนิด + ดีลเลอร์ไม่มีลิงก์ข้ามสาขา/ไปหน้า HQ
describe("ที่อยู่เรื่อง: HQ", () => {
  it("ดีลเลอร์ → แผงดีลเลอร์ · ลูกค้า/ลูกค้าเป้าหมายต้องมีสาขา · ใบ/ใบ HQ/คำขอ/ผู้สนใจ/ใบค่าแฟรนไชส์ → หน้าของเรื่อง", () => {
    expect(ที่อยู่เรื่อง({ ชนิด: "dealer", รหัส: "RYG" }, "hq")).toBe("/hq/dealers?open=RYG");
    expect(ที่อยู่เรื่อง({ ชนิด: "customer", รหัส: 3, สาขา: "SKL" }, "hq")).toBe("/hq/customers?open=SKL:3");
    expect(ที่อยู่เรื่อง({ ชนิด: "customer", รหัส: 3 }, "hq"), "เลขลูกค้าซ้ำข้ามสาขา — ไม่มีสาขา = ไม่มีลิงก์").toBeNull();
    expect(ที่อยู่เรื่อง({ ชนิด: "lead", รหัส: "#L-40322", สาขา: "RYG" }, "hq")).toBe(`/hq/leads?open=RYG:${encodeURIComponent("#L-40322")}`);
    expect(ที่อยู่เรื่อง({ ชนิด: "quotation", รหัส: "Q-RYG-2569-0001" }, "hq")).toBe("/hq/quotations?open=Q-RYG-2569-0001");
    expect(ที่อยู่เรื่อง({ ชนิด: "hqQuote", รหัส: "HQ-2569-0001" }, "hq")).toBe("/hq/quote-requests?open=HQ-2569-0001");
    expect(ที่อยู่เรื่อง({ ชนิด: "request", รหัส: 12 }, "hq")).toBe("/hq/quote-requests?open=12");
    expect(ที่อยู่เรื่อง({ ชนิด: "prospect", รหัส: 5 }, "hq")).toBe("/hq/prospects?open=5");
    expect(ที่อยู่เรื่อง({ ชนิด: "proposal", รหัส: 7 }, "hq")).toBe("/hq/proposals?open=7");
    expect(ที่อยู่เรื่อง({ ชนิด: "dealer", รหัส: "" }, "hq"), "ไม่มีรหัส = ไม่มีลิงก์").toBeNull();
  });
});

describe("ที่อยู่เรื่อง: ดีลเลอร์", () => {
  it("ลูกค้า/ลูกค้าเป้าหมาย/ใบ ของสาขาตัวเอง → แผง/หน้าต่าง · คำขอ/ใบ HQ → แผงลูกค้าเป้าหมายแท็บใบเสนอราคา", () => {
    expect(ที่อยู่เรื่อง({ ชนิด: "customer", รหัส: 4, สาขา: "RYG" }, "dealer", "RYG")).toBe("/customers?open=4");
    expect(ที่อยู่เรื่อง({ ชนิด: "lead", รหัส: 9 }, "dealer", "RYG")).toBe("/leads?open=9");
    expect(ที่อยู่เรื่อง({ ชนิด: "quotation", รหัส: "Q-RYG-2569-0001" }, "dealer", "RYG")).toBe("/quotations?open=Q-RYG-2569-0001");
    expect(ที่อยู่เรื่อง({ ชนิด: "request", รหัส: 9, สาขา: "RYG" }, "dealer", "RYG")).toBe("/leads?open=9&tab=quotes");
    expect(ที่อยู่เรื่อง({ ชนิด: "hqQuote", รหัส: 9, สาขา: "RYG" }, "dealer", "RYG")).toBe("/leads?open=9&tab=quotes");
  });
  it("ข้อมูลสาขาอื่น · ดีลเลอร์ · ผู้สนใจ · ใบค่าแฟรนไชส์ = ไม่มีลิงก์ (ข้อความธรรมดา)", () => {
    expect(ที่อยู่เรื่อง({ ชนิด: "customer", รหัส: 4, สาขา: "CNX" }, "dealer", "RYG")).toBeNull();
    expect(ที่อยู่เรื่อง({ ชนิด: "lead", รหัส: 9, สาขา: "CNX" }, "dealer", "RYG")).toBeNull();
    expect(ที่อยู่เรื่อง({ ชนิด: "dealer", รหัส: "RYG" }, "dealer", "RYG")).toBeNull();
    expect(ที่อยู่เรื่อง({ ชนิด: "prospect", รหัส: 1 }, "dealer", "RYG")).toBeNull();
    expect(ที่อยู่เรื่อง({ ชนิด: "proposal", รหัส: 1 }, "dealer", "RYG")).toBeNull();
  });
});

describe("เป้าลูกค้าของใบ", () => {
  it("ผูกลูกค้า = แผงลูกค้า · ยังเป็นลูกค้าเป้าหมาย = แผงลูกค้าเป้าหมาย · ไม่ผูก = ไม่มีลิงก์", () => {
    expect(เป้าลูกค้าของใบ({ customerId: 3, dealId: 9, dealerCode: "RYG" })).toEqual({ ชนิด: "customer", รหัส: 3, สาขา: "RYG" });
    expect(เป้าลูกค้าของใบ({ customerId: 0, dealId: 9, dealerCode: "RYG" })).toEqual({ ชนิด: "lead", รหัส: 9, สาขา: "RYG" });
    expect(เป้าลูกค้าของใบ({ customerId: 0, dealerCode: "RYG" })).toBeNull();
  });
});
