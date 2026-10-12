import { describe, it, expect } from "vitest";
import {
  เตรียมบันทึก, ตรวจผู้สนใจ, ถึงกำหนดติดตาม, สรุปผู้สนใจ, ตรงกับคำค้น, PROSPECT_STATUS_ORDER, prospectStatusLabel,
} from "../../packages/shared/lib/dealerProspects";
import type { DealerProspect } from "../../packages/shared/lib/data/types";

// ลูกค้าเป้าหมายของสำนักงานใหญ่ = ผู้สนใจเป็นดีลเลอร์ (บอสสั่ง 14 ก.ย. 69)
const ราย = (x: Partial<DealerProspect>): DealerProspect => ({ id: 1, name: "คุณสมชาย", status: "new", ...x });

describe("รูปประจำตัว (0175)", () => {
  it("ว่าง = null · ต้องเป็นรูปที่อัปโหลด (data:image/) · ใหญ่เกินไม่รับ", () => {
    expect(เตรียมบันทึก({ name: "ก", logo: "" }).logo).toBeNull();
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", logo: "data:image/jpeg;base64,AAAA" }))).toBeNull();
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", logo: "https://evil.example/x.png" }))).toMatch(/รูปประจำตัวไม่ถูกต้อง/);
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", logo: "data:image/png;base64," + "A".repeat(400_001) }))).toMatch(/รูปใหญ่เกินไป/);
  });
});

describe("เตรียมบันทึก", () => {
  it("ช่องว่างกลายเป็น null — ช่องวันที่ในฐานข้อมูลปฏิเสธข้อความว่างทั้งแถว", () => {
    const r = เตรียมบันทึก({ name: "  คุณสมชาย  ", phone: "   ", firstContact: "", followUp: "24.8" });
    expect(r.name).toBe("คุณสมชาย");
    expect(r.phone).toBeNull();
    expect(r.firstContact).toBeNull();
    expect(r.followUp).toBeNull();          // รูปแบบ "วัน.เดือน" จากไฟล์ Excel ไม่ใช่วันที่ที่ฐานข้อมูลรับ
  });

  it("ไม่ส่ง id / เวลาสร้าง / เวลาแก้ไข ไปให้ฐานข้อมูล (ฐานข้อมูลเป็นคนตั้งเอง)", () => {
    const r = เตรียมบันทึก({ id: 9, name: "ก", createdAt: "2026-01-01", updatedAt: "2026-01-02" } as Partial<DealerProspect>);
    expect(Object.keys(r)).not.toContain("id");
    expect(Object.keys(r)).not.toContain("createdAt");
    expect(Object.keys(r)).not.toContain("updatedAt");
  });

  it("สถานะแปลก ๆ ที่ยิงเข้ามา → กลับเป็น “รอติดต่อ” ไม่ใช่ปล่อยให้ฐานข้อมูลปฏิเสธ", () => {
    expect(เตรียมบันทึก({ name: "ก", status: "hacked" as DealerProspect["status"] }).status).toBe("new");
  });

  it("เหตุผลไม่สำเร็จ ต้องหายเมื่อกลับไปติดตามต่อ", () => {
    expect(เตรียมบันทึก({ name: "ก", status: "lost", lostReason: "ไม่มีทุน" }).lostReason).toBe("ไม่มีทุน");
    expect(เตรียมบันทึก({ name: "ก", status: "contacted", lostReason: "ไม่มีทุน" }).lostReason).toBeNull();
  });

  it("รหัสดีลเลอร์เป็นตัวพิมพ์ใหญ่เสมอ", () => {
    expect(เตรียมบันทึก({ name: "ก", dealerCode: "cnxa" }).dealerCode).toBe("CNXA");
  });
});

describe("ตรวจผู้สนใจ", () => {
  it("ต้องมีชื่อ", () => {
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: " " }))).toMatch(/ชื่อ/);
  });
  it("“เป็นดีลเลอร์แล้ว” โดยไม่ผูกรหัสดีลเลอร์ = ไม่ผ่าน (กันนับความสำเร็จปลอม)", () => {
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", status: "won" }))).toMatch(/ผูกกับดีลเลอร์/);
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", status: "won", dealerCode: "CNXA" }))).toBeNull();
  });
  it("รหัสดีลเลอร์มีตัวเลขปน = ไม่ผ่าน (ทุกเมนูผู้ดูแลใช้กับสาขานั้นไม่ได้)", () => {
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", status: "won", dealerCode: "BKK1" }))).toMatch(/A–Z/);
  });
  it("อีเมลผิดรูปแบบ และวันติดตามก่อนวันเริ่มติดต่อ", () => {
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", email: "abc@" }))).toMatch(/อีเมล/);
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", firstContact: "2026-08-20", followUp: "2026-08-01" }))).toMatch(/วันติดตาม/);
  });
});

describe("ถึงกำหนดติดตาม / สรุป", () => {
  const วันนี้ = "2026-09-14";
  it("นับเฉพาะรายที่ยังติดตามอยู่ และวันนัด ≤ วันนี้", () => {
    expect(ถึงกำหนดติดตาม(ราย({ followUp: "2026-09-14" }), วันนี้)).toBe(true);
    expect(ถึงกำหนดติดตาม(ราย({ followUp: "2026-09-15" }), วันนี้)).toBe(false);
    expect(ถึงกำหนดติดตาม(ราย({ followUp: "2026-09-01", status: "won", dealerCode: "CNXA" }), วันนี้)).toBe(false);
    expect(ถึงกำหนดติดตาม(ราย({ followUp: null }), วันนี้)).toBe(false);
  });

  it("อัตราสำเร็จคิดจากรายที่จบแล้วเท่านั้น · ยังไม่มีรายที่จบ = null (หน้าจอขึ้น —)", () => {
    expect(สรุปผู้สนใจ([ราย({}), ราย({ status: "meeting" })], วันนี้).อัตราสำเร็จ).toBeNull();
    const s = สรุปผู้สนใจ([
      ราย({ status: "won", dealerCode: "CNXA" }), ราย({ status: "lost" }), ราย({ status: "lost" }), ราย({ status: "contacted" }),
    ], วันนี้);
    expect(s).toMatchObject({ ทั้งหมด: 4, กำลังติดตาม: 1, เป็นดีลเลอร์: 1, ไม่สำเร็จ: 2, อัตราสำเร็จ: 33 });
  });
});

describe("ค้นหา", () => {
  it("เบอร์โทรเจอแม้พิมพ์ขีด/เว้นวรรคต่างจากที่บันทึก", () => {
    expect(ตรงกับคำค้น(ราย({ phone: "089 980 4558" }), "089-980")).toBe(true);
  });
  it("ค้นเจอจากชื่อโซเชียล จังหวัด ประเภทธุรกิจ", () => {
    const p = ราย({ social: "Boss Gardenman", province: "บุรีรัมย์", businessType: "ผู้รับเหมา" });
    for (const q of ["gardenman", "บุรีรัมย์", "รับเหมา"]) expect(ตรงกับคำค้น(p, q)).toBe(true);
    expect(ตรงกับคำค้น(p, "เชียงใหม่")).toBe(false);
  });
});

it("ทุกสถานะมีชื่อภาษาไทย (ห้ามรหัสดิบหลุดขึ้นจอ)", () => {
  for (const s of PROSPECT_STATUS_ORDER) expect(prospectStatusLabel[s]).toMatch(/[ก-๙]/);
});

describe("ภาค / จังหวัด (บอสสั่ง 14 ก.ย. 69: เลือกภาคก่อนจังหวัด · มีทุกภาค)", () => {
  it("ไม่ได้เลือกภาคแต่มีจังหวัด → เติมภาคจากจังหวัดให้", () => {
    expect(เตรียมบันทึก({ name: "ก", province: "บุรีรัมย์" }).region).toBe("อีสาน");
  });
  it("จังหวัดพิมพ์ย่อที่ระบบไม่รู้จัก → ไม่เดาภาค และไม่บล็อกการบันทึก", () => {
    const r = เตรียมบันทึก({ name: "ก", province: "ปทุม" });
    expect(r.region).toBeNull();
    expect(ตรวจผู้สนใจ(r)).toBeNull();
  });
  it("จังหวัดไม่อยู่ในภาคที่เลือก = ไม่ผ่าน", () => {
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", region: "เหนือ", province: "ระยอง" }))).toMatch(/ไม่ได้อยู่ในภาค/);
  });
  it("ทุกภาค + ทุกจังหวัด ผ่าน · ทุกภาค + จังหวัดเจาะจง ผ่าน · ทุกจังหวัดกับภาคเดียว ไม่ผ่าน", () => {
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", region: "ทุกภาค", province: "ทุกจังหวัด" }))).toBeNull();
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", region: "ทุกภาค", province: "ระยอง" }))).toBeNull();
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", region: "เหนือ", province: "ทุกจังหวัด" }))).toMatch(/ทุกภาค/);
  });
  it("ภาคที่ไม่มีอยู่จริง = ไม่ผ่าน", () => {
    expect(ตรวจผู้สนใจ(เตรียมบันทึก({ name: "ก", region: "ภาคสมมติ" }))).toMatch(/ภาคไม่ถูกต้อง/);
  });
});

