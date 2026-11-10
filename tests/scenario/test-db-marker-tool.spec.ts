import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── เครื่องหมายฐานทดสอบ public._pms_test_database (ใบ 0280 · คนรวมงานสั่ง 9 พ.ย. 69) ─────────────────────────────────────
//   ห่อ tests/tools/test-db-marker.test.mjs ให้รันในรอบตรวจเต็ม (อ่านไฟล์อย่างเดียว) — สร้างได้ที่ reset-test-db ที่เดียว · ฐานจริงห้ามมี
test("[tool] เครื่องหมายฐานทดสอบ: สร้างนอก reset-test-db / อ้างในชุดล้างเว็บจริงหรือสคริปต์ฐานจริง = ตัวตรวจตก", () => {
  const r = spawnSync(process.execPath, ["tests/tools/test-db-marker.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
