import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ฟังก์ชันกลาง วันที่ขายของใบ (ยอดขายตามวันลูกค้าตอบรับ · บอสตัดสิน 29 ต.ค. 69 · ใบ 0260) ─────────────────────────────
//   ห่อ tests/tools/sales-date.test.mjs ให้รันในรอบตรวจเต็ม (ไม่ใช้ฐานทดสอบ) · ระดับฐานตรวจที่ supabase/tests/sales_by_won_date.sql
test("[tool] วันที่ขายของใบ: ใบออก ก.ย. ตอบรับ ต.ค. = ต.ค. · ใบออก ธ.ค. ปีก่อน ตอบรับ ม.ค. = ปีนี้ · ใบอื่น = วันออกใบ", () => {
  const r = spawnSync(process.execPath, ["tests/tools/sales-date.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
