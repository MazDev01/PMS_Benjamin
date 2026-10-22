// git pre-push กัน push ขึ้น monorepo ก่อนผ่านรอบตรวจเต็ม/ก่อนใบปรับฐานลงฐานจริงครบ (บอสสั่ง 22 ต.ค. 69)
// ห่อ tests/tools/pre-push-guard.test.mjs (repo จำลอง + remote ปลอม) ให้รันในรอบตรวจเต็ม
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ตัวกัน push ขึ้น monorepo", () => {
  it("ไม่มีผลรอบตรวจ/ใบยังไม่ลง/ลบ monorepo → ปฏิเสธ · ครบ → ผ่าน · wip ได้ตามปกติ", () => {
    const r = spawnSync(process.execPath, ["tests/tools/pre-push-guard.test.mjs"], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 120_000);
});
