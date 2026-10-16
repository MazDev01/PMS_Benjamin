import { describe, it, expect } from "vitest";
import { normalizeFileCategory, guessFileCategory } from "../../packages/shared/lib/mock";

// โฟลเดอร์ "แม่แบบ" ในหน้าไฟล์ → เปลี่ยนชื่อกลับเป็น "แบบแปลน" (บอสสั่ง 16 ต.ค. 69 · เอาแม่แบบออกทั้งระบบ)
//   ไฟล์ในฐานไม่แตะ — แถวที่ยังเก็บคำว่า "แม่แบบ" ต้องแปลงเป็น "แบบแปลน" ตอนอ่าน ไม่ตกไป "อื่นๆ"
describe("โฟลเดอร์ไฟล์ แบบแปลน", () => {
  it("แถวเก่าในฐานที่เก็บ 'แม่แบบ' อ่านแล้วอยู่โฟลเดอร์ 'แบบแปลน'", () => {
    expect(normalizeFileCategory("แม่แบบ")).toBe("แบบแปลน");
  });
  it("แถวที่เก็บ 'แบบแปลน' (ก่อน 28 ส.ค. 69 หรือไฟล์ใหม่) อยู่โฟลเดอร์เดิม", () => {
    expect(normalizeFileCategory("แบบแปลน")).toBe("แบบแปลน");
  });
  it("ไฟล์ใหม่ชื่อแบบแปลน/ผัง/.dwg เดาโฟลเดอร์เป็น 'แบบแปลน'", () => {
    expect(guessFileCategory("แบบแปลนโกดัง.pdf")).toBe("แบบแปลน");
    expect(guessFileCategory("site.dwg")).toBe("แบบแปลน");
  });
  it("ไม่มีโฟลเดอร์ชื่อ 'แม่แบบ' เหลือ", () => {
    for (const c of ["ใบเสนอราคา", "แบบแปลน", "รูปภาพ", "นำเสนอ", "สัญญา", "อื่นๆ", "แม่แบบ", "ไม่รู้จัก"])
      expect(normalizeFileCategory(c)).not.toBe("แม่แบบ");
  });
});
