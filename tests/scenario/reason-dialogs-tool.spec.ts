import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจ check-reason-dialogs: ช่องเหตุผลที่เขียนเองในหน้า = ตก (บอสสั่ง 28 ต.ค. 69) ──────────────────────────────
//   ห่อ tests/tools/reason-dialogs.test.mjs ให้รันในรอบตรวจเต็ม (ไม่ใช้ฐานทดสอบ · ตัวตรวจจริงกับโฟลเดอร์จำลอง)
test("[tool] ตัวตรวจกล่องเหตุผล: ช่องเหตุผลเขียนเอง / ตัวเลือกเหตุผลแบบเดิม = ตก · กล่องกลาง / ช่องตั้งรายการ = ผ่าน", () => {
  const r = spawnSync(process.execPath, ["tests/tools/reason-dialogs.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
