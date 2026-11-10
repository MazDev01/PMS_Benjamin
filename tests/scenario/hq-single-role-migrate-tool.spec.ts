import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ใบ 0282 HQ บทบาทเดียว: รันใบจริงบนฐานที่มีผู้ใช้ HQ_STAFF/HQ_MANAGEMENT (ทรานแซกชันย้อนกลับ) ─────────────────────────
//   ห่อ tests/tools/hq-single-role-migrate.test.mjs ให้รันในรอบตรวจเต็ม — อดีตเจ้าหน้าที่ทำได้ทุกอย่างหลังแปลง · แผนกเดิมคงอยู่
test.setTimeout(180_000);
test("[tool] ใบ 0282: อดีตเจ้าหน้าที่/ผู้บริหาร = สำนักงานใหญ่ ทำได้ทุกอย่างของ HQ · ดีลเลอร์ไม่ถูกแตะ", () => {
  const r = spawnSync(process.execPath, ["tests/tools/hq-single-role-migrate.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
