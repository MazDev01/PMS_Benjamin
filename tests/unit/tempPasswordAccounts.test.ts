import { describe, it, expect } from "vitest";
// @ts-expect-error — สคริปต์ดูแลระบบเป็น .mjs ไม่มีไฟล์ชนิดข้อมูล
import { เลือกบัญชีที่ต้องตั้งเครื่องหมาย } from "../../scripts/lib/tempPasswordAccounts.mjs";

// เกณฑ์เลือกบัญชีดีลเลอร์เดิมที่ต้องถูกบังคับตั้งรหัสของตัวเอง (scripts/flag-temp-passwords.mjs · 13 ต.ค. 69)
// หัวใจ: แค่ "มีสำเนารหัส" ไม่พอ — ดีลเลอร์ที่ตั้งรหัสเองแล้วก็ยังมีสำเนา ต้องไม่ถูกบังคับซ้ำ
const profiles = [
  { id: "u-import", role: "DEALER_ADMIN", dealer_code: "AAA" },
  { id: "u-hqset",  role: "DEALER_ADMIN", dealer_code: "BBB" },
  { id: "u-self",   role: "DEALER_ADMIN", dealer_code: "CCC" },
  { id: "u-first",  role: "DEALER_ADMIN", dealer_code: "DDD" },
  { id: "u-nosec",  role: "DEALER_ADMIN", dealer_code: "EEE" },
  { id: "u-flag",   role: "DEALER_ADMIN", dealer_code: "FFF" },
  { id: "u-ghost",  role: "DEALER_ADMIN", dealer_code: "GGG" },
  { id: "u-hq",     role: "SUPER_ADMIN",  dealer_code: "" },
];
const secrets = [
  { dealer_code: "AAA", updated_by: "นำเข้าข้อมูลตั้งต้น" },
  { dealer_code: "BBB", updated_by: "ผู้ดูแลระบบ" },
  { dealer_code: "CCC", updated_by: "บจ. ตัวอย่าง (ดีลเลอร์ตั้งเอง)" },
  { dealer_code: "DDD", updated_by: "บจ. ตัวอย่าง (ตั้งตอนเข้าระบบครั้งแรก)" },
  { dealer_code: "FFF", updated_by: "นำเข้าข้อมูลตั้งต้น" },
  { dealer_code: "GGG", updated_by: "นำเข้าข้อมูลตั้งต้น" },
];
const users = [
  { id: "u-import", app_metadata: { provider: "email" } },
  { id: "u-hqset",  app_metadata: null },
  { id: "u-self",   app_metadata: {} },
  { id: "u-first",  app_metadata: {} },
  { id: "u-nosec",  app_metadata: {} },
  { id: "u-flag",   app_metadata: { must_change_password: true } },
  { id: "u-hq",     app_metadata: {} },
];

describe("เลือกบัญชีที่ต้องตั้งเครื่องหมายบังคับตั้งรหัส", () => {
  const r = เลือกบัญชีที่ต้องตั้งเครื่องหมาย({ secrets, profiles, users });
  const ได้ = r.ต้องตั้ง.map((a: { dealerCode: string }) => a.dealerCode).sort();

  it("มีสำเนารหัสที่คนอื่นตั้งให้ (นำเข้าจากไฟล์ / สำนักงานใหญ่ตั้ง) → ต้องตั้งเครื่องหมาย", () => {
    expect(ได้).toEqual(["AAA", "BBB"]);
  });
  it("ดีลเลอร์ตั้งรหัสเองแล้ว (ทั้งตอนเข้าครั้งแรกและเปลี่ยนเองภายหลัง) → ไม่แตะ แม้ยังมีสำเนารหัส", () => {
    expect(ได้).not.toContain("CCC");
    expect(ได้).not.toContain("DDD");
    expect(r.สรุป.ดีลเลอร์ตั้งรหัสเองแล้ว).toBe(2);
  });
  it("ไม่มีสำเนารหัส → ไม่แตะ", () => {
    expect(ได้).not.toContain("EEE");
    expect(r.สรุป.ไม่มีสำเนารหัส).toBe(1);
  });
  it("มีเครื่องหมายอยู่แล้ว → ไม่ตั้งซ้ำ (รันซ้ำไม่เปลี่ยนผล)", () => {
    expect(ได้).not.toContain("FFF");
    const หลังตั้ง = users.map(u => ได้.includes(profiles.find(p => p.id === u.id)?.dealer_code ?? "")
      ? { ...u, app_metadata: { ...(u.app_metadata ?? {}), must_change_password: true } } : u);
    const รอบสอง = เลือกบัญชีที่ต้องตั้งเครื่องหมาย({ secrets, profiles, users: หลังตั้ง });
    expect(รอบสอง.ต้องตั้ง).toEqual([]);
    expect(รอบสอง.สรุป.มีเครื่องหมายอยู่แล้ว).toBe(3);
  });
  it("บัญชีสำนักงานใหญ่ และสาขาที่ไม่มีบัญชีเข้าระบบ → ไม่แตะ", () => {
    expect(r.ต้องตั้ง.some((a: { id: string }) => a.id === "u-hq")).toBe(false);
    expect(r.สรุป.ไม่พบบัญชีเข้าระบบ).toBe(1);
  });
  it("ค่าอื่นใน app_metadata ของบัญชีต้องถูกส่งต่อครบ ไม่หายตอนตั้งเครื่องหมาย", () => {
    expect(r.ต้องตั้ง.find((a: { dealerCode: string }) => a.dealerCode === "AAA").appMeta).toEqual({ provider: "email" });
  });
  it("จำกัดเฉพาะรหัสที่ระบุ (ใช้ตอนทดสอบ) → ไม่เลือกรหัสอื่น", () => {
    const จำกัด = เลือกบัญชีที่ต้องตั้งเครื่องหมาย({ secrets, profiles, users, only: ["bbb"] });
    expect(จำกัด.ต้องตั้ง.map((a: { dealerCode: string }) => a.dealerCode)).toEqual(["BBB"]);
  });
});
