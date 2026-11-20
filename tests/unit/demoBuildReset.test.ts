import { describe, it, expect } from "vitest";
import { ล้างเมื่อรุ่นเปลี่ยน, คีย์รุ่นเดโม } from "@pms/shared/lib/data/local/demoBuildReset";

// เว็บ demo: ข้อมูลรุ่นเก่าในเบราว์เซอร์ทำหน้าล้มหลังขึ้นรุ่นใหม่ → ล้างเมื่อรุ่น build เปลี่ยน (19 พ.ย. 69)
//   ตกบนโค้ดเดิม (970e7200): ไม่มีโมดูล demoBuildReset
function ที่เก็บ(ตั้ง: Record<string, string> = {}) {
  const m = new Map(Object.entries(ตั้ง));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), clear: () => m.clear(), m };
}

describe("ล้างเมื่อรุ่นเปลี่ยน", () => {
  it("รุ่นเปลี่ยน = ล้างข้อมูลเก่าทั้ง local/session แล้วจดรุ่นใหม่", () => {
    const l = ที่เก็บ({ [คีย์รุ่นเดโม]: "A", bpms_sales_leads: "[เก่า]" }), s = ที่เก็บ({ bpms_filters: "x" });
    expect(ล้างเมื่อรุ่นเปลี่ยน(l, s, "B")).toBe(true);
    expect([...l.m.entries()]).toEqual([[คีย์รุ่นเดโม, "B"]]);
    expect(s.m.size).toBe(0);
  });
  it("เปิดครั้งแรก (ไม่เคยจดรุ่น) = ล้างข้อมูลที่ค้างจากรุ่นก่อนมีตัวล้าง", () => {
    const l = ที่เก็บ({ bpms_sales_leads: "[เก่า]" });
    expect(ล้างเมื่อรุ่นเปลี่ยน(l, null, "B")).toBe(true);
    expect(l.m.get("bpms_sales_leads")).toBeUndefined();
  });
  it("รุ่นเดิม = ไม่แตะ", () => {
    const l = ที่เก็บ({ [คีย์รุ่นเดโม]: "B", bpms_sales_leads: "[ของผู้ชม]" });
    expect(ล้างเมื่อรุ่นเปลี่ยน(l, null, "B")).toBe(false);
    expect(l.m.get("bpms_sales_leads")).toBe("[ของผู้ชม]");
  });
  it("ไม่ได้ฝังรุ่นตอน build = ไม่ทำอะไร", () => {
    const l = ที่เก็บ({ bpms_sales_leads: "x" });
    expect(ล้างเมื่อรุ่นเปลี่ยน(l, null, undefined)).toBe(false);
    expect(l.m.size).toBe(1);
  });
});
