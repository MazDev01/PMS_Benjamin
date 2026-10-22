// ตัวตรวจในรอบตรวจเต็มอ่านเฉพาะไฟล์ที่ git เก็บ ไม่นับ/ไม่ค้างเพราะผล build ชื่อโฟลเดอร์อื่น (22 ต.ค. 69)
// ห่อ tests/tools/checkers-git-files.test.mjs ให้รันในรอบตรวจเต็ม (ขั้นแรก: ข้อทดสอบหน่วย)
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ตัวตรวจอ่านเฉพาะไฟล์ที่ git เก็บ", () => {
  it("ตัวช่วยกลาง + ตัวตรวจ 6 ตัว: ไม่อ่านผล build ใน .next-test · โค้ดผิดในไฟล์ที่ git เก็บยังตก", () => {
    const r = spawnSync(process.execPath, ["tests/tools/checkers-git-files.test.mjs"], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 180_000);
});
