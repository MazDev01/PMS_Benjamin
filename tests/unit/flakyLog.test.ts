// ตัวนับข้อไม่นิ่ง: ครั้งที่ 3 ไม่มีต้นเหตุ = รอบตรวจเต็มไม่ผ่าน (บอสสั่ง 26 ต.ค. 69 · scripts/lib/flakyLog.mjs)
// ห่อ tests/tools/flaky-log.test.mjs ให้รันในรอบตรวจเต็ม (ขั้นแรก: ข้อทดสอบหน่วย · ไม่ใช้ฐาน)
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ตัวนับข้อไม่นิ่ง", () => {
  it("จำลองครั้งที่ 3 → กัน · มีต้นเหตุ → ไม่กัน · ไฟล์บันทึกจริงถูกรูปแบบ", () => {
    const r = spawnSync(process.execPath, ["tests/tools/flaky-log.test.mjs"], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 60_000);
});
