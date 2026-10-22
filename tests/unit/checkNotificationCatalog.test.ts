// ตัวตรวจ check-notification-catalog ต้องตกเมื่อมีของผิดทุกแบบ (mutation proof · ใบ 0231 · รอบ 4)
// ห่อ tests/tools/check-notification-catalog.test.mjs ให้รันในรอบตรวจเต็ม (ขั้นแรก: ข้อทดสอบหน่วย)
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ตัวตรวจแจ้งเตือนจากตารางกลาง", () => {
  it("ผ่านเมื่อไม่มีของผิด · ตกทุกแบบของผิด (ใบใหม่/แอป/กระดิ่งตัวที่สอง/FLOW ไม่ตรง)", () => {
    const r = spawnSync(process.execPath, ["tests/tools/check-notification-catalog.test.mjs"], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 60_000);
});
