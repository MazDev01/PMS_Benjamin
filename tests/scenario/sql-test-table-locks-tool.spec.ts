import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจ check-sql-test-table-locks: ข้อทดสอบ SQL ล็อกตารางแบบไม่ค้างกับงานหน้าเว็บ (deadlock · รอบตรวจ deploy15 4 พ.ย. 69) ──
//   ห่อ tests/tools/sql-test-table-locks.test.mjs ให้รันในรอบตรวจเต็ม (ไม่ใช้ฐานทดสอบ · ตัวตรวจจริงกับโฟลเดอร์จำลอง)
test("[tool] ตัวตรวจล็อกตารางของข้อทดสอบ SQL: ปิดตัวดักกลางรายการ/ล็อกหลายตารางทีละตาราง = ตก · ล็อกต้นรายการ/nowait = ผ่าน", () => {
  const r = spawnSync(process.execPath, ["tests/tools/sql-test-table-locks.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
