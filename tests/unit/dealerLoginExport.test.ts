import { describe, it, expect } from "vitest";
// @ts-expect-error — ไฟล์ .mjs ของสคริปต์ไม่มีชนิดข้อมูล
import { แถวส่งออก, เป็นCSV } from "../../scripts/lib/dealerLoginExport.mjs";

// ── ไฟล์ส่งออกชื่อผู้ใช้ + รหัสผ่านชั่วคราวของดีลเลอร์ (scripts/export-dealer-logins.mjs · 19 ต.ค. 69) ─────────
const โดเมน = "dealer.benjaminpebsteel.com";
const ถอด = (s: string) => (s.startsWith("enc:") ? s.slice(4) : null);

describe("แถวส่งออก", () => {
  it("ออกเฉพาะดีลเลอร์ที่พิมพ์รหัสสาขาแล้วเข้าได้ + ยังใช้รหัสชั่วคราวของ HQ · ชื่อผู้ใช้ = รหัสสาขา", () => {
    const { แถว, สรุป } = แถวส่งออก({
      dealers: [{ code: "ABC", name: "สาขาเอ" }, { code: "DEF", name: "สาขาดี" }, { code: "GHI", name: "สาขาจี" }, { code: "JKL", name: "สาขาเจ" }, { code: "MNO", name: "สาขาเอ็ม" }],
      profiles: [
        { id: "1", role: "DEALER_ADMIN", dealer_code: "ABC" }, { id: "2", role: "DEALER_ADMIN", dealer_code: "DEF" },
        { id: "3", role: "DEALER_ADMIN", dealer_code: "GHI" }, { id: "4", role: "DEALER_ADMIN", dealer_code: "JKL" },
        { id: "5", role: "DEALER_ADMIN", dealer_code: "MNO" }, { id: "9", role: "SUPER_ADMIN", dealer_code: "" },
      ],
      users: [
        { id: "1", email: `abc@${โดเมน}` }, { id: "2", email: "owner@gmail.com" }, { id: "3", email: `ghi@${โดเมน}` },
        { id: "4", email: `jkl@${โดเมน}` }, { id: "5", email: `mno@${โดเมน}` }, { id: "9", email: "boss@benjaminpebsteel.com" },
      ],
      secrets: [
        { dealer_code: "ABC", secret: "enc:Temp-1", updated_by: "ผู้ดูแลระบบ (สร้างบัญชี)" },
        { dealer_code: "DEF", secret: "enc:Temp-2", updated_by: "ผู้ดูแลระบบ (สร้างบัญชี)" },
        { dealer_code: "GHI", secret: "enc:Mine-3", updated_by: "ZZ (ดีลเลอร์ตั้งเอง)" },
        { dealer_code: "MNO", secret: "เสีย", updated_by: "ผู้ดูแลระบบ" },
      ],
      ถอด,
    });
    expect(แถว).toEqual([{ ชื่อสาขา: "สาขาเอ", ชื่อผู้ใช้: "ABC", รหัสผ่านชั่วคราว: "Temp-1" }]);
    expect(สรุป).toEqual({ บัญชีดีลเลอร์: 5, ส่งออก: 1, ดีลเลอร์ตั้งรหัสเองแล้ว: 1, ไม่มีสำเนารหัส: 1, ถอดรหัสไม่ได้: 1, ชื่อผู้ใช้ไม่ใช่รหัสสาขา: 1 });
  });
});

describe("เป็นCSV", () => {
  it("UTF-8 BOM · หัวตาราง 3 ช่อง · ค่าที่มีจุลภาค/อัญประกาศถูกห่อ · ค่าที่ขึ้นต้นเหมือนสูตรไม่ถูก Excel ตีความ", () => {
    const csv = เป็นCSV([
      { ชื่อสาขา: "สาขา, ระยอง", ชื่อผู้ใช้: "ABC", รหัสผ่านชั่วคราว: 'a"b' },
      { ชื่อสาขา: "สาขาบี", ชื่อผู้ใช้: "DEF", รหัสผ่านชั่วคราว: "=1+1" },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")).toEqual([
      "ชื่อสาขา,ชื่อผู้ใช้,รหัสผ่านชั่วคราว",
      '"สาขา, ระยอง",ABC,"a""b"',
      'สาขาบี,DEF,"=""=1+1"""',
      "",
    ]);
  });
});
