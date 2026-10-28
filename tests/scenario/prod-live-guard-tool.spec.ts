import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ด่านฐานจริง: prod-live + ชุดล้างไม่รันเมื่อไม่มีผลสำรอง+ซ้อมกู้ / ผลไม่ผ่าน / ผลเก่าเกิน 30 นาที (บอสสั่ง 28 ต.ค. 69) ─────
//   ห่อ tests/tools/prod-live-guard.test.mjs (ไฟล์กุญแจปลอม 127.0.0.1:9 · ไฟล์ผลซ้อมกู้ชั่วคราว · ไม่แตะฐานใด ๆ)
test("[tool] ด่านฐานจริง: ไม่มีผล/ไม่ผ่าน/เก่าเกิน 30 นาที = prod-live และชุดล้างไม่รัน · ผ่านภายใน 30 นาที = ผ่านด่าน", () => {
  test.setTimeout(180_000);
  const r = spawnSync(process.execPath, ["tests/tools/prod-live-guard.test.mjs"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก.slice(-4000)).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
