import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวกันหลุด flow (บอสสั่ง 28 ต.ค. 69): คำของ flow เก่าบนหน้าเว็บ · ทุกขั้น D/H มีข้อทดสอบหน้าเว็บติดรหัส ─────────────────
//   ห่อ tests/tools/flow-guards.test.mjs (โฟลเดอร์จำลอง · ไม่ใช้เว็บ/ฐานทดสอบ)
test("[tool] ตัวตรวจคำ flow เก่า + ตัวตรวจข้อทดสอบรายขั้น D/H ทำงานถูก", () => {
  const r = spawnSync(process.execPath, ["tests/tools/flow-guards.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
