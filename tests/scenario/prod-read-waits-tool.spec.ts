import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── คำสั่งอ่านฐานจริงต้องรอ db:push / สำรอง+ซ้อมกู้ ที่ถือล็อกอยู่ (เหตุจริง 29 ต.ค. 69: อ่านแทรกทำขั้นสำรอง 3-auth-data ตก) ─────
//   ห่อ tests/tools/prod-read-waits.test.mjs ให้รันในรอบตรวจเต็ม (ไม่แตะฐานใด ๆ · ไฟล์ล็อกชั่วคราว)
test("[tool] คำสั่งอ่านฐานจริง (loadTarget · prod:query · prod-live) รอล็อกฐานจริง ไม่ยิงแทรก · ผู้ถือล็อกและตัวลูกไม่รอตัวเอง", () => {
  test.setTimeout(120_000);
  const r = spawnSync(process.execPath, ["tests/tools/prod-read-waits.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
