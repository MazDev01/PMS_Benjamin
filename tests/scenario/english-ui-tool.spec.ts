import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจ check-english-ui: คำอังกฤษบนหน้าเว็บที่ไม่อยู่ในรายการยกเว้น = ตก (บอสสั่ง 28 ต.ค. 69) ─────────────────────
//   ห่อ tests/tools/english-ui.test.mjs ให้รันในรอบตรวจเต็ม (ไม่ใช้ฐานทดสอบ · ตัวตรวจจริงกับโฟลเดอร์จำลอง)
test("[tool] ตัวตรวจคำอังกฤษบนหน้าเว็บ: margin เฉลี่ย / Login / ป้ายอังกฤษ = ตก · คำยกเว้น / คอมเมนต์ / ชื่อรหัส = ผ่าน", () => {
  const r = spawnSync(process.execPath, ["tests/tools/english-ui.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
