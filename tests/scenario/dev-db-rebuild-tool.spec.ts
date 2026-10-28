import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── npm run dev: ฐาน dev ลงใบข้ามลำดับ → สร้างฐานใหม่เองแล้วเปิดต่อได้ (บอสสั่ง 28 ต.ค. 69) ────────────────────────────
//   ห่อ tests/tools/dev-db-rebuild.test.mjs ให้รันในรอบตรวจเต็ม (ฐานจำลองแยก pms-devrebuild-test · ไม่แตะฐานทดสอบ/ฐาน dev)
test("[tool] ฐาน dev ลงใบเลขสูงกว่าก่อน → npm run dev สร้างฐานใหม่ตามลำดับ + บอกเหตุบรรทัดเดียว", () => {
  test.setTimeout(600_000);
  const r = spawnSync(process.execPath, ["tests/tools/dev-db-rebuild.test.mjs"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
