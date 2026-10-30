import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ชื่อภาคบนหน้าจอ HQ ผ่านรายการกลาง · ตัวกรองภาค "ทุกภูมิภาค" (บอสสั่ง 30 ต.ค. 69) ─────────────────────────────────────
//   ห่อ tests/tools/region-labels.test.mjs ให้รันในรอบตรวจเต็ม (อ่านไฟล์อย่างเดียว)
test("[tool] ชื่อภาคบนหน้าจอผ่านรายการกลาง: ค่าดิบ \"อีสาน/ใต้\" / ป้าย \"ทุกภาค\" = ตัวตรวจตก", () => {
  const r = spawnSync(process.execPath, ["tests/tools/region-labels.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
