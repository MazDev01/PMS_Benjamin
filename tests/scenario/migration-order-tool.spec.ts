import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ตัวกันเลขใบ (บอสสั่ง 5 พ.ย. 69 · scripts/lib/migrationOrder.mjs) ─────────────────────────────────────────────────────
//   ห่อ tests/tools/migration-order.test.mjs ให้รันในรอบตรวจเต็ม (ที่เก็บรอบ/โฟลเดอร์ใบ/ไฟล์ล็อกชั่วคราว · ไม่ build · ไม่แตะฐานจริง)
test("[tool] ตัวกันเลขใบ: ข้ามลำดับ/ใบนอกรอบ = db:push และรอบตรวจเต็มปฏิเสธ · round:add --ใบ · ปิดรอบจดใบ", () => {
  const r = spawnSync(process.execPath, ["tests/tools/migration-order.test.mjs"], { encoding: "utf8", timeout: 600_000 });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
