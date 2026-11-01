import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { skipReason } from "./supabaseEnv";

// ── ขั้นล้างบันทึกการใช้งานใน tests/prod-live/cleanup.sql (บอสสั่ง 26 ต.ค. 69 · ใบ 0241) ──────────────────────────────
//   ห่อ tests/tools/audit-cleanup.test.mjs — ใช้ฐานทดสอบ จึงรันในชุด playwright (ถือล็อกฐานทดสอบจาก global-setup แล้ว)
//   ตรวจ: นับก่อนลบตรงกับเงื่อนไขลบ · แถวจริงไม่ถูกลบ · ลบเฉพาะ ZZT/live-* · (mutation proof ในไฟล์ต้นทาง)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test("[db] ชุดล้างข้อมูล prod-live ลบบันทึกการใช้งานเฉพาะ ZZT/live-* · แถวจริงไม่หาย", () => {
  const r = spawnSync(process.execPath, ["tests/tools/audit-cleanup.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
// ชุดล้างผู้สนใจทดสอบ → ใบค่าแฟรนไชส์ → ดีลเลอร์ ZZTN (บอสสั่ง 1 พ.ย. 69): แถวทดสอบหายครบ · แถวจริงอยู่ครบ · ด่านกันพลาดยกเลิกทั้งหมด
test("[db] ชุดล้าง prod-live ลบผู้สนใจ/ใบ/การชำระ/ดีลเลอร์/บัญชี/จังหวัดของการทดสอบเท่านั้น ไม่แตะข้อมูลจริง (tests/tools/franchise-cleanup.test.mjs)", () => {
  const r = spawnSync(process.execPath, ["tests/tools/franchise-cleanup.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
