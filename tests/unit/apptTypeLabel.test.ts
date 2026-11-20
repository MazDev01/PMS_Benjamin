import { describe, it, expect } from "vitest";
import { ป้ายประเภทนัด, apptTypeLabel } from "@pms/shared/lib/mock";

// ชื่อประเภทนัดบนจอ — ประเภทเก่า (site_visit/call/meeting) ยังมีในข้อมูล ต้องขึ้นคำไทย ไม่ใช่รหัสภาษาอังกฤษ (19 พ.ย. 69 · แผงลีด HQ ขึ้น "meeting")
//   ตกบนโค้ดเดิม (7e8463b9): ไม่มี ป้ายประเภทนัด · หน้าใช้ apptTypeLabel[type] ?? type → "meeting"
describe("ป้ายประเภทนัด", () => {
  it("ประเภทในฟอร์ม = ชื่อเดียวกับ apptTypeLabel", () => {
    for (const [k, v] of Object.entries(apptTypeLabel)) expect(ป้ายประเภทนัด(k)).toBe(v);
  });
  it("ประเภทเก่าในข้อมูล = คำไทย", () => {
    expect(ป้ายประเภทนัด("meeting")).toBe("ประชุม");
    expect(ป้ายประเภทนัด("site_visit")).toBe("นัดดูหน้างาน");
    expect(ป้ายประเภทนัด("call")).toBe("โทรติดตาม");
  });
  it("ไม่รู้จัก/ว่าง = — (ไม่แสดงรหัส)", () => {
    expect(ป้ายประเภทนัด("zzz")).toBe("—");
    expect(ป้ายประเภทนัด("")).toBe("—");
    expect(ป้ายประเภทนัด(null)).toBe("—");
  });
});
