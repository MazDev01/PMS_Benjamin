import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวตรวจเบอร์โทรรูปแบบจริง/ป้ายข้อมูลจากฐานจริง ในไฟล์ที่ git เก็บ (บอสสั่งด่วน 16 พ.ย. 69 ข้อ 5) ─────
//   ห่อ tests/tools/no-real-phones.test.mjs ให้รันในรอบตรวจเต็ม (อ่านไฟล์อย่างเดียว ไม่แตะฐาน)
test("[tool] ไฟล์ที่ git เก็บไม่มีเบอร์รูปแบบจริง (ยกเว้นเจาะจงไฟล์+บรรทัด) · เบอร์จริงปลอม/ป้ายข้อมูลจากฐานจริง = ตก", () => {
  const r = spawnSync(process.execPath, ["tests/tools/no-real-phones.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
