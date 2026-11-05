import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── รอบตรวจเต็มต้องผ่านการอนุมัติของบอส (บอสสั่ง 5 พ.ย. 69 · scripts/lib/roundQueue.mjs) ─────────────────────────────────
//   ห่อ tests/tools/round-queue.test.mjs ให้รันในรอบตรวจเต็ม (ที่เก็บรอบ/ไฟล์ล็อกชั่วคราว · ไม่ build · ไม่แตะฐาน)
test("[tool] รายการรอรอบ + ปิดรอบด้วยคำตอบบอส: ยังไม่ปิด/รายการเปลี่ยน/ใช้ไปแล้ว = รอบเต็มไม่เริ่ม · ระบุไฟล์รันได้", () => {
  const r = spawnSync(process.execPath, ["tests/tools/round-queue.test.mjs"], { encoding: "utf8", timeout: 600_000 });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
