// ดีลเลอร์บวกราคาเพิ่มจากราคากลางของสำนักงานใหญ่เองได้ (บอสสั่ง 20 ส.ค. 69)
// กติกาเดิมของระบบ: ราคากลาง = ต้นทุนที่สำนักงานใหญ่ตั้ง · ราคาขายเป็นสิทธิ์ของดีลเลอร์
// ตั้งได้อิสระ ไม่มีเพดาน ไม่มีขั้นต่ำ — ห้ามมีตัวตรวจที่เทียบกับราคากลาง
import { describe, it, expect } from "vitest";
import { markupPctOf, withMarkup, sellRate, seedLineItems } from "../../packages/shared/lib/boq";
import type { SolutionProduct } from "../../packages/shared/lib/mock";

const แม่แบบ = (over: Partial<SolutionProduct> = {}): SolutionProduct => ({
  id: "T-1", name: "โกดังสำเร็จรูป", spec: "", price: 5000, unit: "ตร.ม.",
  effectiveDate: "1 ม.ค. 2569", priceHistory: [], ...over,
} as SolutionProduct);

describe("บวกกี่ % (markupPctOf)", () => {
  it("ไม่เคยตั้งอะไรเลย = 0", () => {
    expect(markupPctOf(undefined, "T-1")).toBe(0);
    expect(markupPctOf({}, "T-1")).toBe(0);
  });
  it("ค่ากลางของสาขาใช้กับแม่แบบที่ไม่ได้ตั้งเฉพาะตัว", () => {
    expect(markupPctOf({ defaultPct: 10 }, "T-1")).toBe(10);
  });
  it("ตั้งเฉพาะแม่แบบ ชนะค่ากลางของสาขาเสมอ", () => {
    expect(markupPctOf({ defaultPct: 10, byTemplate: { "T-1": 25 } }, "T-1")).toBe(25);
    expect(markupPctOf({ defaultPct: 10, byTemplate: { "T-1": 25 } }, "T-2")).toBe(10);
  });
  it("ตั้งเฉพาะตัวเป็น 0 = ไม่บวก แม้ค่ากลางของสาขาจะไม่ใช่ 0", () => {
    expect(markupPctOf({ defaultPct: 10, byTemplate: { "T-1": 0 } }, "T-1")).toBe(0);
  });
  it("ค่าเพี้ยน (NaN) = 0 ไม่ใช่พังทั้งหน้า", () => {
    expect(markupPctOf({ defaultPct: Number.NaN }, "T-1")).toBe(0);
  });
});

describe("ราคาขาย = ราคากลาง + ส่วนบวกเพิ่ม (withMarkup)", () => {
  it("บวกเป็นเปอร์เซ็นต์และปัดเป็นจำนวนเต็มบาท", () => {
    expect(withMarkup(5000, 10)).toBe(5500);
    expect(withMarkup(5100, 12.5)).toBe(5738);   // 5737.5 → ปัดขึ้น
  });
  it("ไม่บวก = ราคาเดิม", () => {
    expect(withMarkup(5000, 0)).toBe(5000);
  });
  it("ยังไม่ได้ตั้งราคากลาง (0) = บวกเท่าไรก็ยัง 0 ไม่ใช่เสกราคาขึ้นมา", () => {
    expect(withMarkup(0, 30)).toBe(0);
  });
  it("ลดราคาก็ทำได้ (ค่าติดลบ) — ไม่มีขั้นต่ำตามกติกา", () => {
    expect(withMarkup(5000, -20)).toBe(4000);
  });
  it("บวกสูงมากก็ต้องไม่ถูกกั้น — ไม่มีเพดานตามกติกา", () => {
    expect(withMarkup(5000, 500)).toBe(30_000);
  });
});

describe("ราคาขายของแม่แบบ (sellRate)", () => {
  it("แม่แบบย่อยที่ตั้งราคาเอง ใช้ราคาตัวเอง แล้วค่อยบวก %", () => {
    const p = แม่แบบ({ subtypes: ["ห้องเย็น"], subtypePrices: { "ห้องเย็น": 8000 } });
    expect(sellRate(p, "ห้องเย็น", { byTemplate: { "T-1": 10 } })).toBe(8800);
  });
  it("แม่แบบย่อยที่ไม่ได้ตั้งราคา ใช้ราคาแม่แบบหลัก แล้วบวก %", () => {
    const p = แม่แบบ({ subtypes: ["ทั่วไป"] });
    expect(sellRate(p, "ทั่วไป", { byTemplate: { "T-1": 10 } })).toBe(5500);
  });
  it("ไม่มีแม่แบบ = 0", () => {
    expect(sellRate(undefined, "อะไรก็ตาม", { defaultPct: 50 })).toBe(0);
  });
});

describe("ใบเสนอราคาตั้งต้นด้วยราคาขายของสาขา", () => {
  const catalog = [แม่แบบ()];
  it("ไม่ตั้งส่วนบวกเพิ่ม = ใช้ราคากลางเหมือนเดิม (ของเก่าต้องไม่เปลี่ยนพฤติกรรม)", () => {
    const [it0] = seedLineItems({ product: "โกดังสำเร็จรูป", value: "", area: 100 }, catalog);
    expect(it0.unitPrice).toBe(5000);
  });
  it("ตั้งบวก 20% = ราคาต่อหน่วยในใบเป็นราคาขายของสาขา", () => {
    const [it0] = seedLineItems({ product: "โกดังสำเร็จรูป", value: "", area: 100 }, catalog, { byTemplate: { "T-1": 20 } });
    expect(it0.unitPrice).toBe(6000);
    expect(it0.qty).toBe(100);
  });
  it("ถอดจำนวนจากมูลค่าประเมิน ต้องหารด้วยราคาขาย ไม่ใช่ราคากลาง", () => {
    // มูลค่าประเมิน 60,000 ÷ ราคาขาย 6,000 = 10 หน่วย (ถ้าหารด้วยราคากลาง 5,000 จะได้ 12 = เกินงบลูกค้า)
    const [it0] = seedLineItems({ product: "โกดังสำเร็จรูป", value: "60000" }, catalog, { byTemplate: { "T-1": 20 } });
    expect(it0.qty).toBe(10);
    expect(it0.qty * it0.unitPrice).toBe(60_000);
  });
});
