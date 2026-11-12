import { describe, it, expect } from "vitest";
import { ผู้ทำโดยระบบ, ชื่อผู้ทำ } from "@pms/shared/lib/systemActor";
import { applyLeadIntent } from "@pms/shared/lib/leadIntent";

// ผู้ทำงานที่ระบบติ๊กให้ (บอสเลือก 12 พ.ย. 69): "อัปเดตอัตโนมัติ" → "ระบบทำให้"
//   แถวใหม่บันทึกคำใหม่ · แถวเก่าในฐานคงคำเดิม แปลงตอนแสดงด้วย ชื่อผู้ทำ() ตัวเดียว
//   ตกบนโค้ดเดิม: ไม่มี systemActor.ts · หน้าเว็บบันทึก "อัปเดตอัตโนมัติ"
describe("ชื่อผู้ทำโดยระบบ", () => {
  it("ค่ากลาง = ระบบทำให้", () => { expect(ผู้ทำโดยระบบ).toBe("ระบบทำให้"); });
  it("แถวเก่า 'อัปเดตอัตโนมัติ' แสดงเป็น 'ระบบทำให้' (รวมมีช่องว่างหัวท้าย)", () => {
    expect(ชื่อผู้ทำ("อัปเดตอัตโนมัติ")).toBe("ระบบทำให้");
    expect(ชื่อผู้ทำ(" อัปเดตอัตโนมัติ ")).toBe("ระบบทำให้");
  });
  it("ชื่อคน/ค่าว่างคงเดิม", () => {
    expect(ชื่อผู้ทำ("สมชาย ใจดี")).toBe("สมชาย ใจดี");
    expect(ชื่อผู้ทำ("")).toBe("");
    expect(ชื่อผู้ทำ(undefined)).toBe("");
    expect(ชื่อผู้ทำ("ระบบทำให้")).toBe("ระบบทำให้");
  });
  it("หน้าเว็บติ๊กงานให้เองโดยไม่มีผู้รับผิดชอบ → บันทึก 'ระบบทำให้'", () => {
    const ลีด = { id: "#L-1", numId: 1, company: "ก", name: "ก", contact: "", phone: "", province: "", status: "BULLET", tasks: [], assigned: "" } as unknown as Parameters<typeof applyLeadIntent>[0];
    const r = applyLeadIntent(ลีด, { fields: { contact: "คุณเอ", phone: "081" } }, { tpl: [{ key: "collect", label: "เก็บข้อมูลลูกค้า", step: 1, auto: true }] as never, now: "12 พ.ย. 2569" });
    const งาน = (r.tasks ?? []).find((t: { key: string }) => t.key === "collect") as { doneBy?: string } | undefined;
    expect(งาน?.doneBy, "ระบบติ๊กงานเก็บข้อมูลลูกค้า ผู้ทำ = ระบบทำให้").toBe("ระบบทำให้");
  });
});
