// ── git pre-commit: เซสชันลูก commit ได้เฉพาะ branch ของตัวเอง (บอสสั่ง 22 ต.ค. 69) ──────────────────────────────────────
//   โฟลเดอร์ที่มี .pms-session.json (เปิดด้วย npm run session:new) = เซสชันลูก → branch ต้องเป็น session/<ชื่อ>
//   commit เข้า wip/* · monorepo · main หรือ branch อื่น = ปฏิเสธ · คนรวมงาน (โฟลเดอร์หลัก) ไม่ถูกจำกัด
//   ข้อทดสอบ: tests/tools/session-tools.test.mjs · ห้ามข้ามด้วย --no-verify
import { execFileSync } from "node:child_process";
import { อ่านเซสชัน } from "../lib/session.mjs";

const s = อ่านเซสชัน(process.cwd());
if (!s) process.exit(0);
let branch = "";
try { branch = execFileSync("git", ["symbolic-ref", "--short", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* detached */ }
const ของตัวเอง = `session/${s.ชื่อ}`;
if (branch !== ของตัวเอง) {
  console.error(`\n⛔ เซสชัน ${s.ชื่อ} commit ได้เฉพาะ branch ${ของตัวเอง} — ตอนนี้อยู่ ${branch || "(ไม่ได้อยู่บน branch)"}`);
  console.error("   รวมงานเข้า wip/integration / monorepo = งานของคนรวมงานเท่านั้น (npm run session:merge จากโฟลเดอร์หลัก)");
  console.error(`   กลับ branch ตัวเอง: git switch ${ของตัวเอง} · ห้ามข้ามด้วย --no-verify\n`);
  process.exit(1);
}
