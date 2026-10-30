// ── ข้อทดสอบ: ก่อนรอบตรวจเต็ม รันไฟล์ทดสอบที่เปลี่ยนตั้งแต่รอบผ่านล่าสุดก่อน (บอสสั่ง 29 ต.ค. 69 · คิวข้อ 4 · scripts/lib/gatePrecheck.mjs) ──
// repo จำลอง (git จริง):
//   ก. ยังไม่มีรอบผ่านในประวัติ → ฐานว่าง (ข้ามขั้นนี้ บอกบนจอ)
//   ข. รอบผ่าน = commit ที่มีบรรทัดใน supabase/gate-passed-code.txt · หา commit ผ่านที่ใกล้ HEAD ที่สุด (ไม่นับ HEAD)
//   ค. ไฟล์ที่เปลี่ยน = เฉพาะ tests/scenario/*.spec.ts · แก้แล้ว commit + แก้ค้าง + ไฟล์ใหม่ยังไม่ add · ไม่นับไฟล์ที่ลบ/โค้ดแอป/ตัวช่วย
//   ง. ตัวรันรอบตรวจ (scripts/test-prodbuild.mjs): ขั้นนี้อยู่ก่อนช่วงรอบเต็ม · ตก = ปิดเซิร์ฟเวอร์แล้วออก ไม่เริ่มรอบเต็ม · รันทุกช่วงตามลำดับ
// รัน: node tests/tools/gate-precheck.test.mjs   (โค้ดเดิมไม่มี scripts/lib/gatePrecheck.mjs → ตก)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ราก = process.cwd();
let ตก = 0;
const ผล = (ถูก, ชื่อ, เพิ่ม = "") => { if (!ถูก) ตก++; console.log(`${ถูก ? "✓" : "✗"} ${ชื่อ}${ถูก ? "" : `\n   ${String(เพิ่ม).slice(-1500)}`}`); };
const ที่lib = path.join(ราก, "scripts/lib/gatePrecheck.mjs");
if (!existsSync(ที่lib)) { ผล(false, "มีตัวหาไฟล์ทดสอบที่เปลี่ยน (scripts/lib/gatePrecheck.mjs)", "ไม่มีไฟล์"); console.log(`\n${ตก} FAIL`); process.exit(1); }
const { รอบผ่านล่าสุด, ไฟล์ทดสอบที่เปลี่ยน } = await import(pathToFileURL(ที่lib).href);

const repo = mkdtempSync(path.join(tmpdir(), "pms-gate-precheck-"));
const g = (...a) => execFileSync("git", a, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const เขียน = (f, t) => { mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); writeFileSync(path.join(repo, f), t); };
const commit = (m) => { g("add", "-A"); g("-c", "user.email=t@example.test", "-c", "user.name=t", "commit", "-q", "-m", m); return g("rev-parse", "HEAD"); };
const จดผ่าน = (sha) => { const f = path.join(repo, "supabase/gate-passed-code.txt"); writeFileSync(f, (existsSync(f) ? readFileSync(f, "utf8") : "# หัว\n") + `abc 2026-10-30_10:00:00 ${sha.slice(0, 12)} ป้าย\n`); };

try {
  g("init", "-q");
  เขียน("apps/hq/page.tsx", "1\n"); เขียน("tests/scenario/a.spec.ts", "a\n"); เขียน("tests/scenario/b.spec.ts", "b\n"); เขียน("tests/scenario/c.spec.ts", "c\n");
  เขียน("tests/scenario/helpers.ts", "h\n"); เขียน("supabase/gate-passed-code.txt", "# หัว\n");
  const แรก = commit("แรก");
  let r = ไฟล์ทดสอบที่เปลี่ยน(repo);
  ผล(r.ฐาน === "" && r.ไฟล์.length === 0, "ก. ยังไม่มีรอบผ่านในประวัติ → ไม่รู้ฐาน (ข้ามขั้นนี้)", JSON.stringify(r));

  // ข. commit ผ่าน 2 รอบ — ต้องได้รอบที่ใกล้ HEAD ที่สุด
  เขียน("tests/scenario/a.spec.ts", "a2\n"); const ผ่าน1 = commit("งาน 1");
  เขียน("apps/hq/page.tsx", "2\n"); const ผ่าน2 = commit("งาน 2");
  จดผ่าน(แรก); จดผ่าน(ผ่าน1); commit("บันทึกผลผ่าน (แรก · งาน 1)");
  ผล(รอบผ่านล่าสุด(repo) === ผ่าน1, "ข. รอบผ่านล่าสุด = commit ที่มีผลผ่านซึ่งใกล้ HEAD ที่สุด", `${รอบผ่านล่าสุด(repo)} vs ${ผ่าน1}`);
  void ผ่าน2;

  // ค. เปลี่ยนหลายแบบหลังรอบผ่าน
  เขียน("tests/scenario/b.spec.ts", "b แก้\n"); commit("แก้ b");
  rmSync(path.join(repo, "tests/scenario/c.spec.ts")); commit("ลบ c");
  เขียน("tests/scenario/a.spec.ts", "a แก้ค้าง\n");               // แก้ค้าง ยังไม่ commit
  เขียน("tests/scenario/d.spec.ts", "d ใหม่\n");                  // ไฟล์ใหม่ ยังไม่ add
  เขียน("tests/scenario/helpers.ts", "h แก้\n"); เขียน("apps/hq/page.tsx", "3\n");
  r = ไฟล์ทดสอบที่เปลี่ยน(repo);
  ผล(r.ฐาน === ผ่าน1 && JSON.stringify(r.ไฟล์) === JSON.stringify(["tests/scenario/a.spec.ts", "tests/scenario/b.spec.ts", "tests/scenario/d.spec.ts"]),
    "ค. ไฟล์ทดสอบที่เปลี่ยน = a (แก้ค้าง) · b (commit แล้ว) · d (ใหม่) · ไม่นับ c ที่ลบ · ไม่นับโค้ดแอป/ตัวช่วย", JSON.stringify(r));
} finally {
  rmSync(repo, { recursive: true, force: true });
}

// ง. ต่อสายในตัวรันรอบตรวจ
const ตัวรัน = readFileSync(path.join(ราก, "scripts/test-prodbuild.mjs"), "utf8");
const ก่อน = ตัวรัน.indexOf("ไฟล์ทดสอบที่เปลี่ยน()"), ช่วงเต็ม = ตัวรัน.indexOf('const ช่วง = ["chromium"');
const บล็อก = ตัวรัน.slice(ก่อน, ช่วงเต็ม);
ผล(ก่อน > 0 && ก่อน < ช่วงเต็ม && /ช่วงก่อนรอบเต็ม\)/.test(บล็อก) && /--pass-with-no-tests/.test(บล็อก)
  && /if \(code !== 0\) \{[\s\S]*ปิดทั้งหมด\(\);[\s\S]*process\.exit\(code\)/.test(บล็อก),
  "ง. ตัวรันรอบตรวจ: รันไฟล์ที่เปลี่ยนก่อนช่วงรอบเต็มทุกช่วง · ตก = ปิดเซิร์ฟเวอร์แล้วออก ไม่เริ่มรอบเต็ม");

console.log(ตก ? `\n${ตก} FAIL` : "\nALL PASS");
process.exit(ตก ? 1 : 0);
