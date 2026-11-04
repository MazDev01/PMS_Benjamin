import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจ check-required-marks: ช่องบังคับในรายการต้องมี * แดงจากตัวกลาง (บอสสั่ง 4 พ.ย. 69) ──────────────────────────
//   ห่อ tests/tools/required-marks.test.mjs ให้รันในรอบตรวจเต็ม (ไม่ใช้ฐานทดสอบ · ตัวตรวจจริงกับโฟลเดอร์จำลอง)
test("[tool] ตัวตรวจช่องบังคับ: ป้ายเขียนเอง/ลืม required/บอกว่าเว้นว่างได้ = ตก · ใช้ตัวกลาง = ผ่าน", () => {
  const r = spawnSync(process.execPath, ["tests/tools/required-marks.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
