import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจข้อมูลตั้งต้นฐานทดสอบ: จังหวัดตรง 77 จังหวัด + ดีลเลอร์ 1 จังหวัดพอดี (ใบ 0259 · 30 ต.ค. 69) ─────────────────────
//   ห่อ tests/tools/test-baseline-check.test.mjs ให้รันในรอบตรวจเต็ม (อ่านไฟล์อย่างเดียว)
test("[tool] ข้อมูลตั้งต้นฐานทดสอบ: จังหวัดชื่อย่อ / ดีลเลอร์ไม่มีพื้นที่ / พื้นที่ไม่ตรงจังหวัดที่ตั้ง = ตัวตรวจตก", () => {
  const r = spawnSync(process.execPath, ["tests/tools/test-baseline-check.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
