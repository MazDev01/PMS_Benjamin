import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจถาวร: ทุกตารางใน public ต้องเปิดกฎสิทธิ์รายแถว (บอสสั่ง 9 พ.ย. 69) ──────────────────────────────────────────
//   ห่อ tests/tools/public-rls.test.mjs ให้รันในรอบตรวจเต็ม (อ่านไฟล์อย่างเดียว) — ใบ 0280 รุ่นก่อนแก้ต้องตก
test("[tool] ทุกตารางใน public เปิดกฎสิทธิ์รายแถว: ใบ/สคริปต์สร้างตารางแล้วไม่เปิด = ตัวตรวจตก", () => {
  const r = spawnSync(process.execPath, ["tests/tools/public-rls.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
