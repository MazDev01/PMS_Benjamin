import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { แยกสมุดงานจากXlsx } from "@pms/shared/lib/importSheet";
import { อ่านแผ่นงานสำรอง, แผ่น, เป็นคำปัจจุบัน } from "@pms/shared/lib/settingsBackup";

// แบบฟอร์มที่ส่งให้ลูกค้ากรอก (docs/แบบฟอร์มกรอกข้อมูลตั้งต้น.xlsx)
// ต้อง "นำเข้ากลับได้จริง" ไม่ใช่แค่ไฟล์สวย — ถ้าหัวตารางเพี้ยนแม้ช่องเดียว ลูกค้าจะกรอกเสร็จแล้วนำเข้าไม่ได้
describe("แบบฟอร์มกรอกข้อมูลตั้งต้นที่ส่งให้ลูกค้า", () => {
  const ไฟล์ = "docs/แบบฟอร์มกรอกข้อมูลตั้งต้น.xlsx";

  it("ระบบอ่านหัวตารางได้ทุกแท็บ และรับค่าที่กรอกลงไป", async () => {
    const เล่ม = await แยกสมุดงานจากXlsx(fs.readFileSync(ไฟล์).buffer as ArrayBuffer);
    // แท็บแม่แบบ/ราคาแม่แบบย่อยลบแล้ว (เอาแม่แบบออกทั้งระบบ 16 ต.ค. 69)
    expect([...เล่ม.keys()].some(k => k.includes("แม่แบบ"))).toBe(false);
    // แบบฟอร์มที่ส่งให้ลูกค้าไปแล้วยังใช้ชื่อแท็บ/หัวตารางคำเดิม (ก่อนเปลี่ยนคำเรียก 12 ต.ค. 69) — ต้องนำเข้าได้เหมือนเดิม
    expect([...เล่ม.keys()].map(เป็นคำปัจจุบัน)).toContain(แผ่น.ดีลเลอร์);

    // จำลองว่าลูกค้ากรอกราคาและข้อมูลบริษัทลงไป
    เล่ม.get(แผ่น.บริษัท)!.find(r => r[0] === "เลขประจำตัวผู้เสียภาษี")![1] = "0105500000000";
    เล่ม.get(แผ่น.เป้าหมาย)![1][1] = "60000000";

    const ผล = อ่านแผ่นงานสำรอง(เล่ม, {});
    expect(Object.keys(ผล)).not.toContain("catalog");
    expect(ผล.company?.taxId).toBe("0105500000000");
    expect(ผล.targets?.annualTarget).toBe(60_000_000);
    expect(ผล.lostReasons?.length).toBe(4);
    expect(ผล.dealers?.[0]).toMatchObject({ code: "CNX", revenueTarget: 10_000_000, status: "active" });
    expect(ผล.policy).toMatchObject({ vat: 7, quoteValidityDays: 30 });
  });

  it("แท็บวิธีกรอก ไม่ถูกอ่านเป็นข้อมูล", async () => {
    const เล่ม = await แยกสมุดงานจากXlsx(fs.readFileSync(ไฟล์).buffer as ArrayBuffer);
    expect([...เล่ม.keys()][0]).toBe("วิธีกรอก");
    const ผล = อ่านแผ่นงานสำรอง(เล่ม, {});
    expect(Object.keys(ผล)).not.toContain("วิธีกรอก");
  });
});
