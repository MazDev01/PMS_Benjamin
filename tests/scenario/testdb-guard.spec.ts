import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { skipReason } from "./supabaseEnv";

// ── ฐานทดสอบเขียนได้เฉพาะผู้ถือล็อก (บอสสั่ง 26 ต.ค. 69 · scripts/lib/testDbGuard.mjs) ───────────────────────────────
//   ห่อ tests/tools/testdb-guard.test.mjs — ใต้ล็อกของชุดนี้: ข้อที่ต้องสลับกุญแจของรอบข้าม (รันเดี่ยว + mutation proof ครบทุกข้อ)
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
test("[db] ไม่ถือล็อกเขียนฐานทดสอบไม่ได้ทุกทาง (psql ตรง · บัญชีบริการ · API กุญแจตั้งต้น) · ถือล็อกเขียนได้", () => {
  const r = spawnSync(process.execPath, ["tests/tools/testdb-guard.test.mjs"], { encoding: "utf8" });
  const ออก = (r.stdout ?? "") + (r.stderr ?? "");
  expect(ออก, ออก).toContain("ALL PASS");
  expect(r.status).toBe(0);
});
