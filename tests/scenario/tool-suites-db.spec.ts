import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { skipReason } from "./supabaseEnv";

// ── ข้อทดสอบเครื่องมือที่ใช้ฐานทดสอบ — เคยไม่อยู่ในรอบตรวจเต็ม (บอสสั่ง 29 ต.ค. 69 · scripts/check-tool-tests-in-gate.mjs) ─────
//   รันในชุด playwright (ถือล็อกฐานทดสอบจาก global-setup แล้ว — ลูกที่ spawn ใช้ล็อกเดียวกัน) แบบเดียวกับ testdb-guard.spec.ts
//   db-push-prod-guard: เครื่องมือสำรอง+ซ้อมกู้ ใช้ฐานทดสอบเป็นต้นทาง กู้ลงฐานซ้อมกู้แยก (ไม่แตะฐานจริง) — ตกเงียบมา 26–28 ต.ค. เพราะไม่อยู่ในรอบตรวจ
test.skip(() => skipReason() !== "", skipReason() || "พร้อมรัน");
// [ไฟล์, อะไร, คำที่ชุดนั้นพิมพ์ตอนผ่านทุกข้อ] — db-push-prod-guard พิมพ์ "ผ่านทั้งหมด" (ไม่ใช่ ALL PASS · 29 ต.ค. 69 ตัวห่อรอคำผิดจนตก)
const ชุด: [string, string, string][] = [
  ["tests/tools/db-push-prod-guard.test.mjs", "เครื่องมือ db:push ฐานจริง + สำรอง/ซ้อมกู้ (เทียบตัวนับกับไฟล์สำรอง)", "ผ่านทั้งหมด"],
  ["tests/tools/testdb-schema.test.mjs", "โครงฐานทดสอบตรงกับใบปรับฐานในโฟลเดอร์", "ALL PASS"],
];
for (const [ไฟล์, อะไร, คำผ่าน] of ชุด) {
  test(`[db·tool] ${อะไร} (${ไฟล์})`, () => {
    test.setTimeout(1_200_000);
    const r = spawnSync(process.execPath, [ไฟล์], { encoding: "utf8", maxBuffer: 256 << 20 });
    const ออก = (r.stdout ?? "") + (r.stderr ?? "");
    expect(ออก, ออก.slice(-4000)).toMatch(new RegExp(`^${คำผ่าน}$`, "m"));
    expect(r.status).toBe(0);
  });
}
