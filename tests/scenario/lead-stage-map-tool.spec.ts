import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจ check-lead-stage-map ข้อ 4: หน้าจอแสดงชื่อ/สีสถานะภายในแทนชื่อขั้น → ตก (บอสสั่ง 27 ต.ค. 69) ──────────────
//   ห่อ tests/tools/lead-stage-map.test.mjs ให้รันในรอบตรวจเต็ม (ไม่ใช้ฐานทดสอบ · ตัวตรวจจริงกับโฟลเดอร์จำลอง)
test("[tool] ตัวตรวจขั้น: ชื่อสถานะภายในบนหน้าจอ = ตก · ฟอร์ม D2 / ตัวบันทึกลีด = ผ่าน", () => {
  const r = spawnSync(process.execPath, ["tests/tools/lead-stage-map.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
