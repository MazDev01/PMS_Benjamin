import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── รอบตรวจเต็มรันซ้ำเฉพาะไฟล์ที่ตก: ตกครั้งเดียวแล้วผ่านตอนรันซ้ำ → รอบผ่าน · ตก 2 ครั้ง → รอบตก (บอสสั่ง 28 ต.ค. 69) ─────────
//   ห่อ tests/tools/gate-rerun.test.mjs (playwright จริงกับข้อจำลองในโฟลเดอร์ชั่วคราว · ไม่ใช้เว็บ/ฐานทดสอบ)
test("[tool] รอบตรวจรันซ้ำไฟล์ที่ตก: ผ่านตอนรันซ้ำ = ผ่าน+จดไม่นิ่ง · ตก 2 ครั้ง = ตก · ครบเกณฑ์ 3 = ตก", () => {
  test.setTimeout(300_000);
  const r = spawnSync(process.execPath, ["tests/tools/gate-rerun.test.mjs"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก.slice(-4000)).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
