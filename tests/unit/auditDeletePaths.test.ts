// ตัวตรวจทางลบบันทึกการใช้งาน (check-audit-delete-paths) ตกทุกทางลบใหม่ (บอสสั่ง 26 ต.ค. 69 · ใบ 0241)
// ห่อ tests/tools/audit-delete-paths.test.mjs ให้รันในรอบตรวจเต็ม (ขั้นแรก: ข้อทดสอบหน่วย · ไม่ใช้ฐาน)
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ทางลบบันทึกการใช้งานมีแค่ 2 ทาง", () => {
  it("ทางลบใหม่ทุกแบบทำให้ตัวตรวจตก · ไฟล์ที่อนุญาต/ใบเก่า/คำอธิบายผ่าน", () => {
    const r = spawnSync(process.execPath, ["tests/tools/audit-delete-paths.test.mjs"], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 180_000);
});
