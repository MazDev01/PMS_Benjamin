// ── คนรวมงาน merge งานของเซสชันลูก (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────────────────────────────────
//
// ใช้ (จากโฟลเดอร์หลักเท่านั้น): npm run session:merge -- <ชื่อ>
// ไม่ยอม merge เมื่อ:
//   · commit ล่าสุดของ session/<ชื่อ> ไม่มีผลรอบตรวจเต็มผ่าน (เซสชันลูกต้องรันรอบตรวจผ่านในโฟลเดอร์ตัวเองก่อนส่งงาน)
//   · โฟลเดอร์หลักมีไฟล์ค้าง · merge แล้วชนกันในไฟล์งาน
//   · merge แล้วเลขใบปรับฐานซ้ำ/ข้ามเลข (ต้อง merge ตามลำดับเลข — เลขที่ขาดจองโดยเซสชันไหนจะบอกให้)
// ไฟล์บันทึกของรอบตรวจชนกันได้ตามธรรมชาติ (ต่างคนต่างรัน) → ใช้ของฝั่งรวมงาน แล้วรอบตรวจเต็มหลัง merge เขียนใหม่
// หลัง merge (บอสสั่ง 27 ต.ค. 69):
//   โค้ดตรงกับ commit ที่เซสชันตรวจผ่านทุกไฟล์ (ลายนิ้วมือตรง) → ใช้ผลเดิม ไม่ต้องรันรอบตรวจซ้ำ (เติมบรรทัดผลของเซสชันให้ commit ถ้าขาด)
//   ไม่ตรง → บอกงานที่รอรวมของทุกเซสชัน · รวมให้ครบก่อนแล้วรันรอบตรวจรวมทีเดียว · ห้ามข้าม (pre-push/Vercel ปฏิเสธ commit ที่ไม่มีผลผ่าน)
// ข้อทดสอบ: tests/tools/session-merge-reuse.test.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { เป็นโฟลเดอร์หลัก } from "./lib/session.mjs";
import { gitใน, ชื่อถูกแบบ } from "./lib/sessions.mjs";
import { ตรวจcommitผ่าน, ไฟล์ของรอบตรวจ, ไฟล์บันทึกโค้ด, ใช้ผลเดิมได้, งานรอรวม } from "./lib/commitGate.mjs";
import { writeFileSync } from "node:fs";

const cwd = process.cwd();
const git = gitใน(cwd);
const ชื่อ = process.argv.slice(2).find(x => !x.startsWith("--")) ?? "";
const ตาย = (m) => { console.error(`⛔ ไม่ merge — ${m}`); process.exit(1); };

if (!ชื่อถูกแบบ(ชื่อ)) ตาย("ใช้: npm run session:merge -- <ชื่อ>");
if (!เป็นโฟลเดอร์หลัก(cwd)) ตาย("merge ได้จากโฟลเดอร์หลัก (เซสชันรวมงาน) เท่านั้น");
const branch = `session/${ชื่อ}`;
let ปลาย;
try { ปลาย = git("rev-parse", "--verify", `refs/heads/${branch}`); } catch { ตาย(`ไม่มี branch ${branch}`); }
if (git("status", "--porcelain")) ตาย("โฟลเดอร์หลักมีไฟล์ที่ยังไม่ commit — เก็บให้เรียบร้อยก่อน");

const ผล = ตรวจcommitผ่าน(ปลาย, cwd);
if (!ผล.ผ่าน) ตาย(`${ผล.เหตุ}\n   (commit ล่าสุดของ ${branch} · ให้เซสชัน ${ชื่อ} รันรอบตรวจเต็มให้ผ่านในโฟลเดอร์ของตัวเอง แล้ว commit ไฟล์บันทึก)`);
console.log(`✓ ${branch} (${ปลาย.slice(0, 7)}) ผ่านรอบตรวจเต็มแล้ว (ลายนิ้วมือ ${ผล.ลายนิ้วมือ.slice(0, 12)})`);

const m = spawnSync("git", ["merge", "--no-ff", "--no-commit", branch], { cwd, encoding: "utf8" });
const ชน = git("diff", "--name-only", "--diff-filter=U").split("\n").filter(Boolean);
const ยกเลิก = (m2) => { spawnSync("git", ["merge", "--abort"], { cwd }); ตาย(m2); };
if (m.status !== 0 && !ชน.length) ยกเลิก(`git merge ไม่สำเร็จ: ${(m.stderr || m.stdout).trim()}`);
const ชนในงาน = ชน.filter(f => !ไฟล์ของรอบตรวจ.includes(f));
if (ชนในงาน.length) ยกเลิก(`ชนกันในไฟล์งาน ${ชนในงาน.length} ไฟล์ — ให้เซสชัน ${ชื่อ} ดึง wip/integration ล่าสุดไปแก้ในโฟลเดอร์ตัวเอง แล้วรันรอบตรวจใหม่:\n   ${ชนในงาน.join("\n   ")}`);
for (const f of ชน) { git("checkout", "--ours", "--", f); git("add", "--", f); }   // ไฟล์บันทึกของรอบตรวจ — รอบตรวจหลัง merge เขียนใหม่

const ตรวจเลข = spawnSync(process.execPath, [path.join(import.meta.dirname, "check-migration-numbers.mjs")], { cwd, encoding: "utf8" });
if (ตรวจเลข.status !== 0) {
  let จอง = [];
  try { จอง = JSON.parse(readFileSync(path.resolve(cwd, git("rev-parse", "--git-common-dir"), "pms-migration-reservations.json"), "utf8")); } catch { /* ไม่มีบันทึก */ }
  const ขาด = [...(ตรวจเลข.stderr.matchAll(/ข้ามเลข (\d{4})/g))].map(x => x[1]);
  const ของใคร = ขาด.map(n => `${n} (จองโดย ${จอง.find(j => j.เลข === n)?.เซสชัน ?? "ไม่ทราบ"})`);
  ยกเลิก(`เลขใบปรับฐานหลัง merge ผิด — ${ขาด.length ? `ต้อง merge งานที่มีใบ ${ของใคร.join(", ")} ก่อน (ใบต้องลงฐานจริงตามลำดับเลข)` : ตรวจเลข.stderr.trim()}`);
}

git("commit", "-q", "--no-edit", "-m", `merge: ${branch} (${ปลาย.slice(0, 7)} ผ่านรอบตรวจเต็มในโฟลเดอร์เซสชัน)`);
console.log(`✓ merge ${branch} เข้าแล้ว (${git("rev-parse", "--short", "HEAD")})`);

if (ใช้ผลเดิมได้(ปลาย, "HEAD", cwd)) {
  // ไฟล์บันทึกชนกันแล้วเลือกฝั่งรวมงาน → บรรทัดผลของเซสชันอาจหาย: เติมกลับ (ไฟล์ใบที่ผ่าน = ของเซสชัน เพราะโค้ดตรงกันทุกไฟล์)
  if (!ตรวจcommitผ่าน("HEAD", cwd).ผ่าน) {
    const แถว = (sha) => git("show", `${sha}:${ไฟล์บันทึกโค้ด}`).split("\n");
    const รวม = [...new Set([...แถว("HEAD"), ...แถว(ปลาย)].filter(Boolean))];
    writeFileSync(path.join(cwd, ไฟล์บันทึกโค้ด), รวม.join("\n") + "\n");
    writeFileSync(path.join(cwd, "supabase/gate-passed-migrations.json"), git("show", `${ปลาย}:supabase/gate-passed-migrations.json`) + "\n");
    git("add", "--", ไฟล์บันทึกโค้ด, "supabase/gate-passed-migrations.json");
    git("commit", "-q", "-m", `chore(gate): ใช้ผลรอบตรวจของ ${branch} (ลายนิ้วมือตรงกันทุกไฟล์)`);
  }
  if (!ตรวจcommitผ่าน("HEAD", cwd).ผ่าน) ตาย("ลายนิ้วมือตรงแต่บันทึกผลไม่ครบ — รันรอบตรวจเต็มในโฟลเดอร์หลัก");
  console.log(`✓ ลายนิ้วมือโค้ดหลังรวมตรงกับที่ ${branch} ตรวจผ่าน — ใช้ผลเดิม ไม่ต้องรันรอบตรวจซ้ำ
   ต่อไป: push ได้ (ตัวกั้น pre-push/Vercel ตรวจลายนิ้วมือซ้ำเอง)`);
} else {
  const รอ = งานรอรวม("HEAD", cwd);
  console.log(`⚠️ ลายนิ้วมือโค้ดหลังรวมไม่ตรงกับที่ ${branch} ตรวจ (สาขาหลักมีงานอื่นปน) — ต้องรันรอบตรวจรวม ห้ามข้าม
   ${รอ.length ? `งานที่ตรวจผ่านแล้วรอรวม: ${รอ.join(", ")} → รวมให้ครบก่อน แล้ว` : ""}รันรอบตรวจเต็มทีเดียว (npm run test:prodbuild) → ผ่าน → commit ไฟล์บันทึก → push`);
}
