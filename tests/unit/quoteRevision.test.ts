import { describe, it, expect } from "vitest";
import { ฉบับถัดไป, จะขึ้นฉบับใหม่, เนื้อหาใบเปลี่ยน } from "../../packages/shared/lib/quoteRevision";
import type { QuotationMock } from "../../packages/shared/lib/mock";

// ── เลขฉบับใบเสนอราคา (V1 → V2 → V3) ────────────────────────────────────────────
//
// บั๊กจริง 2 ข้อที่เทสต์ชุดนี้ล็อกไว้ (พบจากการตรวจระบบ 28 ส.ค. 69):
//   1) กติกาถูกเขียนไว้เฉพาะในแผงใบเสนอราคาของหน้าลูกค้าเป้าหมาย → แก้ใบที่ส่งไปแล้วจาก
//      หน้า /quotations ของดีลเลอร์ เลขฉบับค้างที่ V1 ตลอด
//   2) อีกสำเนาหนึ่งอยู่ที่เส้นทาง PUT /api/v1/quotations ซึ่งดูแค่ "สถานะ ≠ ร่าง" →
//      กดปฏิเสธ / ส่งอีกครั้ง ก็ขึ้นฉบับใหม่ ทั้งที่ไม่มีใครแก้อะไรบนกระดาษเลย
//      (ยิงพิสูจน์กับเซิร์ฟเวอร์จริง: ส่งใบ V1 → กดปฏิเสธ → กลายเป็น V2)

const ใบ = (o: Partial<QuotationMock> = {}): QuotationMock => ({
  id: "Q-1", customer: "บจ. ทดสอบ", project: "โกดัง", total: "฿1,000", totalValue: 1000,
  materialCost: 1000, province: "ระยอง", buildingType: "โกดังสำเร็จรูป", area: 10,
  status: "sent_to_client", date: "2026-08-01", items: 1, customerId: 0, projectId: 0,
  revision: "V1", lineItems: [{ name: "เหล็ก", qty: 1, unit: "งาน", unitPrice: 1000 }],
  ...o,
} as QuotationMock);

describe("ใบร่าง — แก้กี่รอบก็ยังฉบับเดิม", () => {
  it("แก้ยอดใบร่าง → ยังเป็น V1", () => {
    const ก่อน = ใบ({ status: "draft" });
    expect(ฉบับถัดไป(ก่อน, ใบ({ status: "draft", totalValue: 5000 }))).toBe("V1");
  });

  it("ใบร่างที่เคยเป็น V3 มาก่อน แก้แล้วยังเป็น V3", () => {
    const ก่อน = ใบ({ status: "draft", revision: "V3" });
    expect(ฉบับถัดไป(ก่อน, ใบ({ status: "draft", revision: "V3", totalValue: 5000 }))).toBe("V3");
  });
});

describe("ใบที่ส่งให้ลูกค้าแล้ว — แก้เนื้อหา = ขึ้นฉบับใหม่", () => {
  it("แก้ยอด → V1 เป็น V2", () => {
    expect(ฉบับถัดไป(ใบ(), ใบ({ totalValue: 5000 }))).toBe("V2");
  });

  it("แก้รายการ BOQ → ขึ้นฉบับใหม่", () => {
    const หลัง = ใบ({ lineItems: [{ name: "เหล็ก", qty: 2, unit: "งาน", unitPrice: 1000 }] } as Partial<QuotationMock>);
    expect(ฉบับถัดไป(ใบ(), หลัง)).toBe("V2");
  });

  it("ลบรายการ BOQ ทิ้ง → ขึ้นฉบับใหม่ (เทียบทั้งก้อน ไม่ใช่ทีละช่อง)", () => {
    expect(ฉบับถัดไป(ใบ(), ใบ({ lineItems: [] }))).toBe("V2");
  });

  it("แก้วันหมดอายุ / หมายเหตุ → ขึ้นฉบับใหม่ (อยู่บนกระดาษที่ลูกค้าถือ)", () => {
    expect(ฉบับถัดไป(ใบ(), ใบ({ expiry: "2026-09-30" }))).toBe("V2");
    expect(ฉบับถัดไป(ใบ(), ใบ({ note: "ลดค่าขนส่งให้" }))).toBe("V2");
  });

  it("แก้ซ้ำอีกรอบ → V2 เป็น V3", () => {
    expect(ฉบับถัดไป(ใบ({ revision: "V2" }), ใบ({ revision: "V2", totalValue: 7000 }))).toBe("V3");
  });
});

describe("เปลี่ยนแค่สถานะ — ห้ามขึ้นฉบับใหม่", () => {
  it("กดปฏิเสธ (ลูกค้าไม่เอา) → ยังเป็น V1", () => {
    const หลัง = ใบ({ status: "lost", lostReason: "ราคาสูงเกินไป" });
    expect(ฉบับถัดไป(ใบ(), หลัง)).toBe("V1");
    expect(จะขึ้นฉบับใหม่(ใบ(), หลัง)).toBe(false);
  });

  it("ส่งอีกครั้ง (สถานะเดิม เปลี่ยนแค่วันที่ส่ง) → ยังเป็น V1", () => {
    expect(ฉบับถัดไป(ใบ(), ใบ({ date: "2026-08-28" }))).toBe("V1");
  });

  it("ปิดการขายสำเร็จ → ยังเป็น V1", () => {
    expect(ฉบับถัดไป(ใบ(), ใบ({ status: "won" }))).toBe("V1");
  });

  it("ส่งใบร่างให้ลูกค้าครั้งแรก → ยังเป็น V1 (ใบร่างก่อนหน้าไม่นับ)", () => {
    const ก่อน = ใบ({ status: "draft" });
    expect(ฉบับถัดไป(ก่อน, ใบ({ status: "sent_to_client" }))).toBe("V1");
  });
});

describe("กรณีขอบ", () => {
  it("ไม่มีใบเดิม (สร้างใหม่) → ใช้ค่าที่ส่งมา", () => {
    expect(ฉบับถัดไป(undefined, ใบ({ revision: "V1" }))).toBe("V1");
    expect(ฉบับถัดไป(undefined, ใบ({ revision: undefined }))).toBe("V1");
  });

  it("เลขฉบับเสียรูป (ว่าง/ไม่มีตัวเลข) → นับเป็น 1", () => {
    expect(ฉบับถัดไป(ใบ({ revision: "" }), ใบ({ revision: "", totalValue: 2000 }))).toBe("V2");
    expect(ฉบับถัดไป(ใบ({ revision: "ฉบับแก้" }), ใบ({ revision: "ฉบับแก้", totalValue: 2000 }))).toBe("V2");
  });

  it("ผู้เรียกส่งเลขฉบับผิดมาเอง — ระบบตัดสินจากใบในระบบเสมอ ไม่เชื่อค่าที่ส่งมา", () => {
    expect(ฉบับถัดไป(ใบ({ revision: "V1" }), ใบ({ revision: "V99", totalValue: 2000 }))).toBe("V2");
  });

  it("เนื้อหาใบเปลี่ยน: สถานะ/วันที่/เหตุผลที่ปฏิเสธ ไม่นับเป็นเนื้อหา", () => {
    expect(เนื้อหาใบเปลี่ยน(ใบ(), ใบ({ status: "lost", date: "2026-12-31", lostReason: "แพง" }))).toBe(false);
  });
});
