// ── คำเตือน React ในโหมด dev ที่ทำข้อทดสอบหน้าจอตก (16 พ.ย. 69 · ตกบน e4bdb10a ที่ขึ้นเว็บด้วย · รอบตรวจโหมด production ไม่จับ) ──
//   1) key ซ้ำ: หน้าต่างเพิ่ม/นำเข้าวัสดุต่อหน่วยของแถวเข้ากับรายการมาตรฐาน → UnitSelect ได้ "ตร.ม." "ชุด" ซ้ำ
//   2) กรอบแดงตัวกลาง (กรอบผิด) ใช้ borderColor ทับช่องที่ตั้ง border แบบย่อ → ถอดกรอบแดงแล้ว React เตือน
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { หน่วยไม่ซ้ำ } from "@pms/shared/lib/quoteRequests";

describe("UnitSelect ตัดหน่วยซ้ำที่ตัวกลาง", () => {
  it("หน่วยมาตรฐาน + หน่วยของแถว (ซ้ำ/มีช่องว่าง/ว่าง) → ไม่ซ้ำ คงลำดับ", () => {
    expect(หน่วยไม่ซ้ำ(["ตร.ม.", "ตัน", "เมตร", "ชุด", "งาน", "ตร.ม.", " ชุด ", "", "แผ่น", "แผ่น"]))
      .toEqual(["ตร.ม.", "ตัน", "เมตร", "ชุด", "งาน", "แผ่น"]);
  });
  it("UnitSelect ใช้ตัวตัดซ้ำก่อนวาดตัวเลือก", () => {
    expect(readFileSync("packages/shared/components/ui/UnitSelect.tsx", "utf8")).toContain("const รายการ = หน่วยไม่ซ้ำ(หน่วย);");
  });
});

describe("กรอบผิด ใช้ border แบบย่อชุดเดียว", () => {
  it("ไม่มี borderColor/borderWidth/borderStyle (ห้ามผสมกับ border แบบย่อของช่อง) · กรอบยังแดง", () => {
    const บรรทัด = readFileSync("packages/shared/components/ui/FieldLabel.tsx", "utf8").split(/\r?\n/).find(l => l.startsWith("export const กรอบผิด")) ?? "";
    expect(บรรทัด).toContain("border: `1px solid ${สีบังคับ}`");
    expect(บรรทัด).not.toMatch(/border(Color|Width|Style|Top|Right|Bottom|Left)/);
  });
});
