// ── ระบบยังตั้งค่าไม่ครบ: ผู้ใช้ไม่เห็นชื่อตัวแปรระบบ · ชื่อตัวแปรลงบันทึกฝั่งระบบ (ตรวจคำขั้น 4 กลุ่ม ข · บอสตัดสิน 13/16 พ.ย. 69) ──
import { describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { ตั้งค่าไม่ครบ, ข้อความตั้งค่าไม่ครบ } from "@pms/shared/lib/configMissing";

describe("ตั้งค่าไม่ครบ", () => {
  it("คืนประโยคเดียวที่ไม่มีชื่อตัวแปร · บอกให้แจ้งสำนักงานใหญ่ · ชื่อตัวแปรลง console.error", () => {
    const บันทึก = vi.spyOn(console, "error").mockImplementation(() => {});
    const ข้อความ = ตั้งค่าไม่ครบ("SUPABASE_SERVICE_ROLE_KEY", "/api/admin/users");
    expect(ข้อความ).toBe(ข้อความตั้งค่าไม่ครบ);
    expect(ข้อความ).toBe("ระบบยังตั้งค่าไม่ครบ — แจ้งสำนักงานใหญ่ให้ตั้งค่าก่อนแล้วลองใหม่");
    expect(ข้อความ).not.toMatch(/[A-Z_]{4,}|ผู้ดูแลระบบ|เซิร์ฟเวอร์/);
    expect(บันทึก).toHaveBeenCalledWith(expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"));
    expect(บันทึก).toHaveBeenCalledWith(expect.stringContaining("/api/admin/users"));
    บันทึก.mockRestore();
  });

  it("ไม่เหลือข้อความ \"ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (…_KEY)\" ที่ส่งถึงผู้ใช้ในโค้ดแอป", () => {
    // git grep ทั้งแอป/แพ็กเกจ — คอมเมนต์และ console.* ไม่นับ (ไม่ขึ้นจอ)
    let เจอ = "";
    try {
      เจอ = execFileSync("git", ["grep", "-n", "-E", "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์|ยังไม่ได้ตั้งกุญแจ|ยังไม่ได้ตั้ง(ค่า )?DEALER_SECRET_KEY ที่เซิร์ฟเวอร์", "--", "apps", "packages"], { encoding: "utf8" });
    } catch { เจอ = ""; }   // git grep ไม่เจอ = exit 1
    const จุด = เจอ.split("\n").filter(Boolean).filter(l => !/^\S+:\d+:\s*(\/\/|\*|\/\*)/.test(l) && !/console\.(warn|error|log)/.test(l));
    expect(จุด, จุด.join("\n")).toEqual([]);
  });
});
