import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";

// ── ข้อทดสอบเครื่องมือที่เคยไม่อยู่ในรอบตรวจเต็ม (บอสสั่ง 29 ต.ค. 69 · scripts/check-tool-tests-in-gate.mjs) ─────────────────
//   ห่อชุดที่ไม่ใช้เว็บ/ฐานทดสอบ (repo/โฟลเดอร์จำลองในโฟลเดอร์ชั่วคราว) — ชุดที่ใช้ฐานทดสอบอยู่ใน tool-suites-db.spec.ts
const ชุด: [string, string][] = [
  ["tests/tools/session-tools.test.mjs", "เครื่องมือหลายเซสชัน: ล็อก · จองเลขใบ · session:new/merge/close (รวมแล้วรายการใบไม่หาย) · git hook"],
  ["tests/tools/pre-push-guard.test.mjs", "ตัวกัน push ขึ้น monorepo: ผลรอบตรวจ · ใบลงฐานจริงครบ · ถามฐานไม่ได้บอกวิธีแก้เป็นขั้นตอน"],
  ["tests/tools/vercel-gate.test.mjs", "Vercel ไม่ build commit ที่ไม่ผ่านรอบตรวจ"],
  ["tests/tools/flaky-log.test.mjs", "ตัวนับข้อไม่นิ่ง + บรรทัดต้นเหตุ"],
  ["tests/tools/checkers-git-files.test.mjs", "ตัวตรวจอ่านเฉพาะไฟล์ที่ git เก็บ"],
  ["tests/tools/checkers-git-files-more.test.mjs", "ตัวตรวจอ่านเฉพาะไฟล์ที่ git เก็บ (ชุดเพิ่ม)"],
  ["tests/tools/audit-delete-paths.test.mjs", "ตัวตรวจทางลบบันทึกการใช้งาน"],
  ["tests/tools/check-notification-catalog.test.mjs", "ตัวตรวจตารางแจ้งเตือน FLOW ↔ ฐาน"],
  ["tests/tools/check-server-rpc-grants.test.mjs", "ตัวตรวจสิทธิ์ฟังก์ชันฝั่งเซิร์ฟเวอร์"],
  ["tests/tools/testdb-baseline-key.test.mjs", "กุญแจข้อมูลตั้งต้นฐานทดสอบ"],
  ["tests/tools/tool-tests-in-gate.test.mjs", "ตัวตรวจว่าข้อทดสอบเครื่องมือทุกชุดอยู่ในรอบตรวจเต็ม"],
];
for (const [ไฟล์, อะไร] of ชุด) {
  test(`[tool] ${อะไร} (${ไฟล์})`, () => {
    test.setTimeout(600_000);
    const r = spawnSync(process.execPath, [ไฟล์], { encoding: "utf8", maxBuffer: 256 << 20 });
    const ออก = (r.stdout ?? "") + (r.stderr ?? "");
    expect(ออก, ออก.slice(-4000)).toContain("ALL PASS");
    expect(r.status).toBe(0);
  });
}
