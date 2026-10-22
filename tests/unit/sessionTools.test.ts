// เครื่องมือทำงานหลายเซสชันพร้อมกัน (บอสสั่ง 22 ต.ค. 69) — ห่อข้อทดสอบใน tests/tools ให้รันในรอบตรวจเต็ม (ขั้นแรก: ข้อทดสอบหน่วย)
//   session-tools: ล็อกฐานทดสอบ · จองเลขใบ · session:new/merge/close · git hook เซสชันลูก · ตัวตรวจพอร์ต/เลขใบ
//   vercel-gate: ด่าน Vercel ชั้นที่สอง (monorepo ไม่ build commit ที่ไม่ผ่านรอบตรวจ · .vercelignore ไม่ตัดไฟล์ที่ด่านใช้)
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { พอร์ต as พอร์ตTS, ต้นทาง as ต้นทางTS } from "../scenario/sessionPorts";

const รัน = (ไฟล์: string) => spawnSync(process.execPath, [ไฟล์], { encoding: "utf8" });

describe("เครื่องมือหลายเซสชัน", () => {
  it("ล็อกฐาน · จองเลขใบ · เปิด/merge/ปิดเซสชัน · hook · ตัวตรวจพอร์ต/เลขใบ (repo จำลอง)", () => {
    const r = รัน("tests/tools/session-tools.test.mjs");
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 600_000);
  it("ด่าน Vercel: monorepo build เฉพาะ commit ที่ผ่านรอบตรวจ · .vercelignore เก็บไฟล์ที่ด่านใช้", () => {
    const r = รัน("tests/tools/vercel-gate.test.mjs");
    expect(r.stdout + r.stderr).toContain("ALL PASS");
    expect(r.status).toBe(0);
  }, 300_000);
  it("พอร์ตฝั่งชุดทดสอบ (sessionPorts.ts) ตรงกับฝั่งสคริปต์ (scripts/lib/session.mjs) ทุกค่า", async () => {
    const mjs = await import("../../scripts/lib/session.mjs");
    expect(พอร์ตTS("dev")).toEqual(mjs.พอร์ต("dev"));
    expect(พอร์ตTS("test")).toEqual(mjs.พอร์ต("test"));
    expect(ต้นทางTS("dev")).toEqual(mjs.ต้นทาง("dev"));
    // โฟลเดอร์หลัก (ไม่มี .pms-session.json) = ค่าใน ports.json
    if (!existsSync(".pms-session.json")) expect(พอร์ตTS("dev")).toEqual(JSON.parse(readFileSync("scripts/lib/ports.json", "utf8")).dev);
  });
});
