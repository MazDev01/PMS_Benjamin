import { describe, it, expect } from "vitest";
import { จังหวัดให้เลือก } from "../../packages/shared/lib/provinces";
import { provincesOfRegion, ALL_REGIONS } from "../../packages/shared/lib/provinces";

// ตัวเลือกจังหวัดในฟอร์มดีลเลอร์ต้องเป็นชื่อที่ฐานรับเท่านั้น (ใบ 0196 · lead_province_invalid) — พบ 15 ต.ค. 69
const มาตรฐาน = provincesOfRegion(ALL_REGIONS);

describe("จังหวัดให้เลือก (useMyProvinces)", () => {
  it("รายชื่อมาตรฐานมี 77 จังหวัด", () => expect(new Set(มาตรฐาน).size).toBe(77));

  it("ทะเบียนดีลเลอร์ยังโหลดไม่เสร็จ → ยังไม่มีตัวเลือก (ไม่เดารายชื่อสำรอง: เคยมี กรุงเทพฯ/อื่นๆ · จังหวัดของสาขาอื่น)", () => {
    expect(จังหวัดให้เลือก([], "RYG")).toEqual([]);
  });

  it("ตัวเลือกทุกตัวเป็นชื่อมาตรฐาน (ฐานรับ)", () => {
    const l = จังหวัดให้เลือก([{ code: "RYG", region: "ตะวันออก", province: "ระยอง" }], "RYG");
    expect(l.length).toBeGreaterThan(0);
    expect(l.filter(p => !มาตรฐาน.includes(p))).toEqual([]);
  });

  it("สาขาที่ตั้งเขียนเป็นชื่อย่อ → ไม่พ่วงชื่อย่อเข้ารายการ (ชื่อมาตรฐานอยู่ในภาคแล้ว)", () => {
    const l = จังหวัดให้เลือก([{ code: "BKK", region: "กลาง", province: "กรุงเทพฯ" }], "BKK");
    expect(l).not.toContain("กรุงเทพฯ");
    expect(l).toContain("กรุงเทพมหานคร");
  });

  it("สาขาตั้งอยู่นอกภาคที่รับผิดชอบ (ชื่อมาตรฐาน) → ยังพ่วงจังหวัดที่ตั้งไว้หน้าสุด", () => {
    expect(จังหวัดให้เลือก([{ code: "X", region: "ตะวันออก", province: "เชียงใหม่" }], "X")[0]).toBe("เชียงใหม่");
  });

  it("ค่าที่บันทึกไว้เดิม (นอกเขต) ยังอยู่ในรายการ — เปิดแก้ช่องอื่นแล้วจังหวัดไม่หาย", () => {
    expect(จังหวัดให้เลือก([{ code: "RYG", region: "ตะวันออก", province: "ระยอง" }], "RYG", "อื่นๆ")).toContain("อื่นๆ");
  });
});
