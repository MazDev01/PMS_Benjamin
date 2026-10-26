import { describe, it, expect } from "vitest";
import {
  ยอดประเมิน, รายการประเมินเป็นแถวHQ, แม่แบบเป็นแถวHQ, หมวดที่มี, ค้นแม่แบบ, ป้ายเปอร์เซ็นต์คลาด, type MaterialTemplate,
} from "../../packages/shared/lib/materialTemplates";
import { แทรกรายการ, แถวเปล่าใหม่ } from "../../packages/shared/lib/quoteRequests";

// แม่แบบวัสดุ (บอสสั่ง 26 ต.ค. 69 · ใบ 0244) — สูตรหน้าเว็บต้องตรงกับฐาน (_estimate_total: ปัดรายบรรทัด 2 ตำแหน่งแล้วรวม)
const ผนัง: MaterialTemplate = { id: 1, category: "ผนัง", name: "ผนังเมทัลชีท 0.35", unit: "ตร.ม.", unitPrice: 285.5, active: true, priceUpdatedAt: "2026-10-26T03:00:00Z" };
const ประตู: MaterialTemplate = { id: 2, category: "ประตู", name: "ประตูม้วน 4x5 ม.", unit: "ชุด", unitPrice: 42000, active: true, priceUpdatedAt: "2026-10-26T03:00:00Z" };

describe("ราคาประเมิน", () => {
  it("วัสดุ 2 รายการ = ผลรวมจำนวน × ราคาต่อหน่วย (318,110.00)", () => {
    expect(ยอดประเมิน([{ qty: 820, unitPrice: 285.5 }, { qty: 2, unitPrice: 42000 }])).toBe(318110);
  });
  it("ปัดรายบรรทัดแบบเดียวกับฐาน", () => {
    expect(ยอดประเมิน([{ qty: 3, unitPrice: 0.335 }, { qty: 3, unitPrice: 0.335 }])).toBe(2.02);
  });
  it("ไม่เลือกวัสดุ = ไม่มีราคาประเมิน (null ไม่ใช่ 0)", () => {
    expect(ยอดประเมิน([])).toBeNull();
  });
});

describe("รายการเข้าใบ HQ (ตาราง BOQ กลาง)", () => {
  it("รายการจากคำขอ → แถว BOQ (ชื่อ · จำนวน · หน่วย · ต้นทุน = ราคา ณ ตอนส่ง)", () => {
    expect(รายการประเมินเป็นแถวHQ([{ templateId: 1, category: "ผนัง", name: "ผนังเมทัลชีท 0.35", unit: "ตร.ม.", qty: 820, unitPrice: 285.5 }]))
      .toEqual([{ name: "ผนังเมทัลชีท 0.35", qty: 820, unit: "ตร.ม.", unitCost: 285.5 }]);
    expect(รายการประเมินเป็นแถวHQ(undefined)).toEqual([]);
  });
  it("เลือกจากแม่แบบ → ต่อท้ายตารางทางเดียวกับแหล่งอื่น (แทรกรายการ) ไม่ทับแถวที่มีของ", () => {
    const มีแล้ว = { name: "เสา", qty: 2, unit: "ชุด", unitCost: 100 };
    expect(แทรกรายการ([มีแล้ว, แถวเปล่าใหม่()], [แม่แบบเป็นแถวHQ(ประตู)])).toEqual([มีแล้ว, { name: "ประตูม้วน 4x5 ม.", qty: 1, unit: "ชุด", unitCost: 42000 }]);
  });
});

describe("หมวด / ค้น / ป้าย", () => {
  it("หมวดที่เคยใช้ (ไม่ซ้ำ · ไม่นับว่าง)", () => {
    expect(หมวดที่มี([ผนัง, ประตู, { ...ผนัง, id: 3 }, { ...ผนัง, id: 4, category: " " }])).toEqual(["ประตู", "ผนัง"].sort((a, b) => a.localeCompare(b, "th")));
  });
  it("ค้นจากชื่อ หมวด หรือหน่วย", () => {
    expect(ค้นแม่แบบ([ผนัง, ประตู], "ม้วน").map(t => t.id)).toEqual([2]);
    expect(ค้นแม่แบบ([ผนัง, ประตู], "ตร.ม.").map(t => t.id)).toEqual([1]);
    expect(ค้นแม่แบบ([ผนัง, ประตู], " ").length).toBe(2);
  });
  it("% คลาด: บอกทิศ · ไม่มีค่า = —", () => {
    expect(ป้ายเปอร์เซ็นต์คลาด(10)).toBe("+10.0%");
    expect(ป้ายเปอร์เซ็นต์คลาด(-3.46)).toBe("−3.5%");
    expect(ป้ายเปอร์เซ็นต์คลาด(null)).toBe("—");
  });
});
