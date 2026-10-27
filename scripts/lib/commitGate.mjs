// ── ผลรอบตรวจเต็มผูกกับโค้ดของ commit · ใช้ร่วม 3 ที่ (บอสสั่ง 22 ต.ค. 69) ───────────────────────────────────────────
//
//   1) git pre-push ในเครื่อง — push ขึ้น monorepo ได้เฉพาะ commit ที่ผ่าน (scripts/git-hooks/pre-push.mjs)
//   2) คนรวมงาน — merge branch เซสชันลูกได้เฉพาะเมื่อ commit ล่าสุดของ branch ผ่าน (scripts/session-merge.mjs)
//   3) Vercel — บน monorepo ไม่ build commit ที่ไม่ผ่าน (scripts/vercel-should-build.mjs · ข้ามด้วย --no-verify ไม่ได้)
// วิธี: รอบตรวจเต็มผ่าน → ต่อท้ายบรรทัด "ลายนิ้วมือโค้ด" ลง supabase/gate-passed-code.txt (commit ไฟล์นี้พร้อมงาน)
//   ลายนิ้วมือโค้ด = sha256 ของรายการไฟล์ทั้ง commit (git ls-tree -r) ไม่นับไฟล์บันทึกของรอบตรวจเอง
//   → commit ที่เพิ่มแค่ไฟล์บันทึก (หรือ commit เปล่า "deploy:") ได้ลายนิ้วมือเดียวกับ commit ที่ตรวจ ถือว่าผ่าน
//   → แก้ไฟล์อื่นแม้ตัวเดียว ลายนิ้วมือเปลี่ยน = ต้องรันรอบตรวจใหม่
//   ตรวจกับไฟล์บันทึก "ใน commit นั้นเอง" (git show) — Vercel มีแค่ repo ก็ตรวจได้ ไม่ต้องพึ่งไฟล์ในเครื่อง
//   บันทึกเฉพาะเมื่อตอนเริ่มรอบตรวจไม่มีไฟล์ค้าง (git status ว่าง) — ไม่งั้นสิ่งที่ตรวจไม่ใช่ commit นั้นจริง
//   ไฟล์บันทึก merge แบบรวมบรรทัด (.gitattributes merge=union) — หลายเซสชันรวมกันไม่ชน
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export const ไฟล์บันทึกโค้ด = "supabase/gate-passed-code.txt";
// tests/flaky-log.txt: ตัวนับข้อไม่นิ่ง (รอบตรวจเขียนเอง · คนเพิ่มบรรทัดต้นเหตุ) — ไม่นับในลายนิ้วมือ (scripts/lib/flakyLog.mjs)
export const ไฟล์ของรอบตรวจ = [ไฟล์บันทึกโค้ด, "supabase/gate-passed-migrations.json", "tests/flaky-log.txt"];

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 << 20 }).trim();

/** ลายนิ้วมือโค้ดของ commit (ไม่นับไฟล์บันทึกของรอบตรวจ) */
export function ลายนิ้วมือโค้ด(sha = "HEAD", cwd = process.cwd()) {
  const รายการ = git(["ls-tree", "-r", "--full-tree", sha], cwd).split("\n")
    .filter(l => l && !ไฟล์ของรอบตรวจ.includes(l.slice(l.indexOf("\t") + 1)));
  return createHash("sha256").update(รายการ.join("\n"), "utf8").digest("hex");
}

/** สภาพตอนเริ่มรอบตรวจ: commit ที่กำลังตรวจ + ไฟล์ค้าง */
export function สภาพตอนเริ่ม(cwd = process.cwd()) {
  return { sha: git(["rev-parse", "HEAD"], cwd), ค้าง: git(["status", "--porcelain"], cwd).split("\n").filter(Boolean) };
}

/** รอบตรวจผ่าน → ต่อท้ายลายนิ้วมือลงไฟล์บันทึก (ในโฟลเดอร์ทำงาน · commit ไฟล์นี้พร้อมงาน) · คืนเหตุผลถ้าไม่บันทึก ("" = บันทึกแล้ว) */
export function บันทึกcommitที่ผ่าน({ sha, ค้าง, ป้าย = "", cwd = process.cwd() }) {
  if (ค้าง.length) return `ตอนเริ่มรอบตรวจมีไฟล์ที่ยังไม่ commit ${ค้าง.length} ไฟล์ — ผลนี้ไม่ใช่ของ commit ${sha.slice(0, 7)} จึงไม่บันทึก`;
  const เวลา = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 19).replace("T", "_");
  const f = path.join(cwd, ไฟล์บันทึกโค้ด);
  if (!existsSync(f)) appendFileSync(f, "# ลายนิ้วมือโค้ดที่ผ่านรอบตรวจเต็ม — เขียนโดย scripts/test-prodbuild.mjs เท่านั้น ห้ามแก้มือ (scripts/lib/commitGate.mjs)\n");
  appendFileSync(f, `${ลายนิ้วมือโค้ด(sha, cwd)} ${เวลา} ${sha.slice(0, 12)} ${ป้าย}\n`);
  return "";
}

/** commit นี้ผ่านรอบตรวจไหม — ดูไฟล์บันทึกที่อยู่ใน commit นั้นเอง · คืน { ผ่าน, เหตุ, ลายนิ้วมือ, จาก } */
export function ตรวจcommitผ่าน(sha = "HEAD", cwd = process.cwd()) {
  const ลาย = ลายนิ้วมือโค้ด(sha, cwd);
  let บันทึก = "";
  try { บันทึก = git(["show", `${sha}:${ไฟล์บันทึกโค้ด}`], cwd); } catch { /* ยังไม่มีไฟล์บันทึก */ }
  const เจอ = บันทึก.split("\n").find(l => l.startsWith(ลาย + " "));
  if (เจอ) return { ผ่าน: true, ลายนิ้วมือ: ลาย, จาก: เจอ.split(" ")[2] ?? "" };
  return { ผ่าน: false, ลายนิ้วมือ: ลาย,
    เหตุ: `commit ${git(["rev-parse", "--short", sha], cwd)} ยังไม่มีผลรอบตรวจเต็มผ่าน — รัน npm run test:prodbuild ให้ผ่าน (ตก 0) แล้ว commit ${ไฟล์บันทึกโค้ด}` };
}

/** หลังรวมงานเซสชัน: โค้ดสาขาหลักตรงกับ commit ที่เซสชันตรวจผ่านทุกไฟล์ไหม (บอสสั่ง 27 ต.ค. 69)
 *  ตรง = ใช้ผลเดิม ไม่ต้องรันรอบตรวจซ้ำ · ไม่ตรง = ต้องรันรอบตรวจรวม (ห้ามข้าม — pre-push/Vercel ปฏิเสธ commit ที่ไม่มีผลผ่าน) */
export function ใช้ผลเดิมได้(ปลายเซสชัน, sha = "HEAD", cwd = process.cwd()) {
  const ผล = ตรวจcommitผ่าน(ปลายเซสชัน, cwd);
  return ผล.ผ่าน && ลายนิ้วมือโค้ด(sha, cwd) === ผล.ลายนิ้วมือ;
}

/** branch เซสชันที่ตรวจผ่านแล้วแต่ยังไม่ได้รวมเข้า sha — ให้รวมให้ครบก่อนรันรอบตรวจรวมทีเดียว */
export function งานรอรวม(sha = "HEAD", cwd = process.cwd()) {
  return git(["for-each-ref", "--format=%(refname:short)", "refs/heads/session/"], cwd).split("\n").filter(Boolean)
    .filter(b => {
      try { execFileSync("git", ["merge-base", "--is-ancestor", b, sha], { cwd, stdio: "ignore" }); return false; } catch { /* ยังไม่ได้รวม */ }
      return ตรวจcommitผ่าน(b, cwd).ผ่าน;
    });
}

/** เลขใบปรับฐานทุกใบใน commit (จากชื่อไฟล์ NNNN_*.sql) */
export function ใบในcommit(sha, cwd = process.cwd()) {
  return git(["ls-tree", "--name-only", sha, "supabase/migrations/"], cwd).split("\n")
    .map(f => /(\d{4})_[^/]*\.sql$/.exec(f)?.[1]).filter(Boolean).sort();
}

/** บรรทัดบันทึกในไฟล์ปัจจุบัน (ไม่นับคำอธิบาย) */
export const อ่านบันทึก = (cwd = process.cwd()) => {
  const f = path.join(cwd, ไฟล์บันทึกโค้ด);
  return existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(l => l && !l.startsWith("#")) : [];
};
