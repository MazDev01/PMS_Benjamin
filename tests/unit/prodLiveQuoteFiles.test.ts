// ขั้น files ของชุดทดสอบเว็บจริง ลบไฟล์แนบคำขอราคาเฉพาะของสาขาทดสอบ (ใบ 0273 · ถัง quote-files เป็นของจริงทั้งเครือ)
import { describe, it, expect } from "vitest";
// @ts-expect-error — โมดูล .mjs ของชุดทดสอบเว็บจริง ไม่มีไฟล์ชนิด
import { เลือกไฟล์แนบทดสอบ } from "../prod-live/quoteFilesCleanup.mjs";

describe("เลือกไฟล์แนบทดสอบ (ลบเฉพาะไฟล์ของสาขาทดสอบ)", () => {
  it("ไฟล์ของสาขาทดสอบ = ลบได้ครบ", () => {
    expect(เลือกไฟล์แนบทดสอบ([
      { object_name: "ZZT/101/d/aa.pdf", dealer_code: "ZZT" },
      { object_name: "ZZT/101/h55/bb.dwg", dealer_code: "ZZT" },
      { object_name: "ZZTN/7/d/cc.png", dealer_code: "ZZTN" },
    ], ["ZZT", "ZZTN"])).toEqual(["ZZT/101/d/aa.pdf", "ZZT/101/h55/bb.dwg", "ZZTN/7/d/cc.png"]);
  });
  it("รหัสที่ไม่ใช่สาขาทดสอบ = หยุด", () => {
    expect(() => เลือกไฟล์แนบทดสอบ([{ object_name: "RYG/1/d/x.pdf", dealer_code: "RYG" }], ["RYG"])).toThrow(/ไม่ใช่รหัสสาขาทดสอบ/);
    expect(() => เลือกไฟล์แนบทดสอบ([], [])).toThrow(/ไม่ได้ระบุ/);
  });
  it("มีไฟล์ของสาขาจริงปนมาแม้ไฟล์เดียว = หยุดทั้งชุด ไม่คืนอะไร", () => {
    expect(() => เลือกไฟล์แนบทดสอบ([
      { object_name: "ZZT/101/d/aa.pdf", dealer_code: "ZZT" },
      { object_name: "RYG/9/d/ของจริง.pdf", dealer_code: "RYG" },
    ], ["ZZT"])).toThrow(/ไม่ใช่ของสาขาทดสอบ/);
  });
  it("พาธไม่ขึ้นต้นด้วยสาขาของแถว / มีการย้อนโฟลเดอร์ = หยุด", () => {
    expect(() => เลือกไฟล์แนบทดสอบ([{ object_name: "RYG/9/d/x.pdf", dealer_code: "ZZT" }], ["ZZT"])).toThrow(/ไม่ใช่ของสาขาทดสอบ/);
    expect(() => เลือกไฟล์แนบทดสอบ([{ object_name: "ZZT/../RYG/x.pdf", dealer_code: "ZZT" }], ["ZZT"])).toThrow(/ไม่ใช่ของสาขาทดสอบ/);
    expect(() => เลือกไฟล์แนบทดสอบ([{ object_name: "ZZTX/1/d/x.pdf", dealer_code: "ZZT" }], ["ZZT"])).toThrow(/ไม่ใช่ของสาขาทดสอบ/);
  });
});
