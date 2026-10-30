import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวกรองกลางข้อมูลทดสอบบนฐานจริง + ตัวตรวจสคริปต์นับฐานจริง (บอสสั่ง 29 ต.ค. 69 · เหตุ: นับใบของสาขาทดสอบ ZZT เป็นใบจริง) ─────
//   ห่อ tests/tools/prod-count-filter.test.mjs ให้รันในรอบตรวจเต็ม (อ่านไฟล์อย่างเดียว ไม่แตะฐาน)
test("[tool] นับฐานจริงตัดข้อมูลทดสอบผ่านตัวกรองกลาง (สาขา ZZT · live-* · @example.test · ZZTEST) · สคริปต์นับที่ไม่ใช้ตัวกรอง = ตก", () => {
  const r = spawnSync(process.execPath, ["tests/tools/prod-count-filter.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
