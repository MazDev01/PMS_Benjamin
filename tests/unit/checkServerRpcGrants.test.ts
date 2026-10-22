// ตัวตรวจ check-server-rpc-grants อ่านเฉพาะไฟล์ที่ git เก็บ ไม่ค้างเพราะผล build (22 ต.ค. 69)
// ห่อ tests/tools/check-server-rpc-grants.test.mjs ให้รันในรอบตรวจเต็ม (ขั้นแรก: ข้อทดสอบหน่วย)
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

describe("ตัวตรวจสิทธิ์เรียกคำสั่งตรงกับโค้ด", () => {
  it("ตรวจไฟล์ที่ git เก็บ · ไม่อ่านผล build/ไฟล์ที่ยังไม่ add · จบเร็ว", () => {
    const r = spawnSync(process.execPath, ["tests/tools/check-server-rpc-grants.test.mjs"], { encoding: "utf8" });
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 180_000);
});
