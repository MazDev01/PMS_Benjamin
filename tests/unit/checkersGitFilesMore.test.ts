// ตัวตรวจอีก 6 ตัว (network-list-keys · filter-resets-page · real-backend · no-lead-template · no-lead-estimate · lead-stage-map)
// อ่านเฉพาะไฟล์ที่ git เก็บ และยังตกเมื่อเจอของผิด — ห่อ tests/tools/checkers-git-files-more.test.mjs ให้รันในรอบตรวจเต็ม
// รวมกับ checkersGitFiles.test.ts (6 ตัวแรก) = ครบ 12 ตัวของ 807b79c (22 ต.ค. 69)
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ตัวตรวจ 6 ตัวหลังอ่านจาก git", () => {
  it("commit ปัจจุบันผ่าน · ของผิดในไฟล์ที่ git เก็บตก · ผล build ที่ git ไม่เก็บไม่ถูกอ่าน", () => {
    const r = spawnSync(process.execPath, ["tests/tools/checkers-git-files-more.test.mjs"], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 600_000);
});
