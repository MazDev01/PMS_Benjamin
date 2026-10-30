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
