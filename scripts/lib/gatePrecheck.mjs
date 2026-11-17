// ── ก่อนเริ่มรอบตรวจเต็ม: รันไฟล์ทดสอบที่เปลี่ยนตั้งแต่รอบตรวจผ่านล่าสุดก่อน · ตก = ไม่เริ่มรอบเต็ม (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 4) ──
//
// เหตุ: 29 ต.ค. 69 แก้ไฟล์ทดสอบหลายสิบไฟล์ แล้วไปตกกลางรอบตรวจเต็ม = เสียรอบละ ~35 นาที
//   รันไฟล์ที่แก้ก่อน (ไม่กี่นาที) จับได้เร็วกว่า · ผ่านแล้วค่อยรันเต็ม (ไฟล์เหล่านี้ยังรันในรอบเต็มอีกครั้งตามปกติ — ไม่ลดข้อทดสอบ)
// "รอบตรวจผ่านล่าสุด" = commit บรรพบุรุษของ HEAD ที่ใกล้ที่สุดซึ่งมีบรรทัดใน supabase/gate-passed-code.txt (ผลผ่านของ commit นั้น)
// ไฟล์ทดสอบ = tests/scenario/*.spec.ts ที่ยังมีอยู่ใน HEAD · ไม่พบรอบผ่านในประวัติ = ไม่รู้ว่าอะไรเปลี่ยน → ข้ามขั้นนี้ (บอกบนจอ) แล้วรันเต็ม
// ข้อทดสอบ: tests/tools/gate-precheck.test.mjs
import { execFileSync } from "node:child_process";
import { ไฟล์บันทึกโค้ด } from "./commitGate.mjs";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }).trim();

/** commit ที่ผ่านรอบตรวจล่าสุดในสายของ HEAD (ไม่นับ HEAD เอง) · ไม่พบ = "" */
export function รอบผ่านล่าสุด(cwd = process.cwd()) {
  let บันทึก = "";
  try { บันทึก = git(["show", `HEAD:${ไฟล์บันทึกโค้ด}`], cwd); } catch { return ""; }
  const ย่อ = บันทึก.split("\n").filter(l => l && !l.startsWith("#")).map(l => l.split(" ")[2]).filter(Boolean);
  if (!ย่อ.length) return "";
  for (const sha of git(["rev-list", "--max-count=2000", "HEAD"], cwd).split("\n").slice(1)) {
    if (ย่อ.some(s => sha.startsWith(s))) return sha;
  }
  return "";
}

/** ไฟล์ทดสอบที่เปลี่ยนตั้งแต่รอบผ่านล่าสุด (รวมไฟล์ที่ยังไม่ commit) · คืน { ฐาน, ไฟล์ } */
export function ไฟล์ทดสอบที่เปลี่ยน(cwd = process.cwd()) {
  const ฐาน = รอบผ่านล่าสุด(cwd);
  if (!ฐาน) return { ฐาน: "", ไฟล์: [] };
  const ใน = git(["diff", "--name-only", "--diff-filter=d", ฐาน], cwd).split("\n");          // ฐาน → โฟลเดอร์ทำงาน (รวมที่ยังไม่ commit)
  const ใหม่ = git(["ls-files", "--others", "--exclude-standard", "tests/scenario"], cwd).split("\n");
  const ไฟล์ = [...new Set([...ใน, ...ใหม่])].filter(f => /^tests\/scenario\/[^/]+\.spec\.ts$/.test(f)).sort();
  return { ฐาน, ไฟล์ };
}

/** ช่วงที่ต้องรันไฟล์เหล่านี้ ตามลำดับของรอบตรวจเต็ม (ช่วงที่ไม่มีไฟล์ตรง = playwright ข้ามเอง ด้วย --pass-with-no-tests) */
export const ช่วงก่อนรอบเต็ม = ["tools", "chromium", "hq-settings", "safari", "stress"];

/** ตัวเลือกของขั้นก่อนรอบเต็มต่อช่วง — มีรายงาน JSON ของตัวเอง (ไม่ทับรายงานของรอบหลัก) เพื่อให้นับข้อไม่นิ่งของขั้นนี้ได้
 *  เหตุ (deploy20 · 11 พ.ย. 69): ขั้นนี้เดิมไม่มีรายงาน JSON → ข้อที่ตกครั้งแรกแล้วผ่านตอนรันซ้ำในขั้นนี้ไม่เข้ารายการรอบอสรับทราบ/ตัวนับไม่นิ่ง
 *  คืน { รายงาน, reporter, env } · รายงาน = <รายงานหลักไม่มี .json>.<ช่วง>-precheck.json */
export function ตัวเลือกก่อนรอบ(โปรเจกต์, รายงานหลัก) {
  const รายงาน = String(รายงานหลัก).replace(/\.json$/, "") + `.${โปรเจกต์}-precheck.json`;
  return {
    รายงาน,
    reporter: "--reporter=line,json,./tests/reporters/flaky-names.ts,./tests/reporters/failure-evidence.ts",
    env: { PMS_RUN_STAGE: `${โปรเจกต์}-precheck`, PLAYWRIGHT_JSON_OUTPUT_NAME: รายงาน, ...(โปรเจกต์ === "tools" ? { PMS_GLOBAL_SETUP_SKIP: "1" } : {}) },
  };
}
