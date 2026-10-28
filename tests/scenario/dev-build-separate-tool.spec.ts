import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── เปิด npm run dev ค้างไว้แล้วรัน build ของรอบตรวจ → ต้องผ่านทั้งคู่ (บอสสั่ง 28 ต.ค. 69) ──────────────────────────────
//   ห่อ tests/tools/dev-build-separate.test.mjs ให้รันในรอบตรวจเต็ม (dev บนพอร์ต dev ของโฟลเดอร์ · build ลง .next-tooltest ไม่ชนรอบตรวจ)
test("[tool] dev เปิดค้าง + build ของรอบตรวจ → ผ่านทั้งคู่ · build ไม่ทับ .next ของ dev", () => {
  test.setTimeout(900_000);
  const r = spawnSync(process.execPath, ["tests/tools/dev-build-separate.test.mjs"], { encoding: "utf8", maxBuffer: 256 << 20 });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก.slice(-4000)).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
