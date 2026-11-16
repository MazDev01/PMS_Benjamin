import { describe, it, expect } from "vitest";
import { สร้างไฟล์Xlsx, crc32, อักษรคอลัมน์, หนีอักขระXml } from "../../packages/shared/lib/makeXlsx";
import { แยกตารางจากXlsx } from "../../packages/shared/lib/importSheet";

const หัว = ["บริษัท", "ผู้ติดต่อ", "โทรศัพท์"];
const แถว = [["บจ. ตัวอย่าง & ลูกน้ำ, จำกัด", "คุณสมชาย", "000-000-9001"]];

describe("สร้างไฟล์ Excel สำหรับเทมเพลต", () => {
  it("อ่านกลับได้ครบทั้งหัวตารางและข้อมูล", async () => {
    const buf = await สร้างไฟล์Xlsx(หัว, แถว).arrayBuffer();
    const ตาราง = await แยกตารางจากXlsx(buf);
    expect(ตาราง[0]).toEqual(หัว);
    expect(ตาราง[1]).toEqual(แถว[0]);   // & และลูกน้ำต้องกลับมาเหมือนเดิม ไม่กลายเป็น &amp;
  });

  it("เบอร์โทรต้องเก็บเป็นข้อความ ไม่ให้ Excel แปลงเป็นตัวเลข (ศูนย์นำหน้าหาย)", async () => {
    const xml = new TextDecoder().decode(new Uint8Array(await สร้างไฟล์Xlsx(หัว, แถว).arrayBuffer()));
    expect(xml).toContain('t="inlineStr"');
    expect(xml).not.toContain('t="n"');
  });

  it("เป็นไฟล์ zip จริง — ขึ้นต้นด้วยลายเซ็น PK และมีสารบัญท้ายไฟล์", async () => {
    const b = new Uint8Array(await สร้างไฟล์Xlsx(หัว, แถว).arrayBuffer());
    expect([b[0], b[1]]).toEqual([0x50, 0x4b]);
    const dv = new DataView(b.buffer);
    expect(dv.getUint32(b.length - 22, true)).toBe(0x06054b50);
  });

  it("มีส่วนประกอบครบตามที่ Excel ต้องใช้ ไม่งั้นจะฟ้องว่าไฟล์เสียหาย", async () => {
    const txt = new TextDecoder().decode(new Uint8Array(await สร้างไฟล์Xlsx(หัว, แถว).arrayBuffer()));
    for (const ส่วน of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"]) {
      expect(txt).toContain(ส่วน);
    }
  });

  it("ตั้งชื่อแผ่นงานได้ และตัดให้ไม่เกิน 31 ตัวอักษรตามที่ Excel จำกัด", async () => {
    const txt = new TextDecoder().decode(new Uint8Array(await สร้างไฟล์Xlsx(หัว, แถว, "ลูกค้าเดิม").arrayBuffer()));
    expect(txt).toContain('name="ลูกค้าเดิม"');
    const ยาว = new TextDecoder().decode(new Uint8Array(await สร้างไฟล์Xlsx(หัว, แถว, "ก".repeat(40)).arrayBuffer()));
    expect(ยาว).toContain(`name="${"ก".repeat(31)}"`);
  });

  it("เลขตรวจไฟล์ (CRC32) ตรงตามมาตรฐาน", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("แปลงลำดับคอลัมน์เป็นตัวอักษรแบบ Excel", () => {
    expect([อักษรคอลัมน์(0), อักษรคอลัมน์(25), อักษรคอลัมน์(26), อักษรคอลัมน์(27)]).toEqual(["A", "Z", "AA", "AB"]);
  });

  it("หนีอักขระพิเศษของ XML", () => {
    expect(หนีอักขระXml('<a & "b">')).toBe("&lt;a &amp; &quot;b&quot;&gt;");
  });
});
